/* global Office */
import { analyzeLocal, DEFAULT_PRONOUNS } from "./analyzers.js";
import { checkDocument, PUBLIC_SERVER } from "./languagetool.js";
import { readParagraphs, selectSpan, replaceSpan } from "./word.js";

const DEFAULTS = {
  ltEnabled: true,
  language: "en-US",
  serverUrl: PUBLIC_SERVER,
  username: "",
  apiKey: "",
  disabledRules: "",
  dictionary: "",
  minLength: 2,
  maxLength: 6,
  minCountShort: 3,
  minCountLong: 2,
  glueThreshold: 45,
  glueMinWords: 8,
  minRun: 3,
  crossParagraphs: true,
  pronounList: DEFAULT_PRONOUNS.join(", "),
};
const STORAGE_KEY = "writing-checker.settings";

const state = {
  settings: loadSettings(),
  paragraphs: [],
  issues: [], // LanguageTool results
  local: null, // { repeats, glue, pronouns }
  tab: "grammar",
  ltError: null,
  cycle: new Map(), // repeated phrase -> index of the occurrence shown last
};

const $ = (sel) => document.querySelector(sel);

// --- settings --------------------------------------------------------------

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch {
    // storage blocked; settings just won't stick between sessions
  }
}

function fillSettingsForm() {
  const form = $("#settings-form");
  for (const [k, v] of Object.entries(state.settings)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v;
  }
}

function readSettingsForm() {
  const form = $("#settings-form");
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") state.settings[k] = el.checked;
    else if (el.type === "number") state.settings[k] = Number(el.value) || DEFAULTS[k];
    else state.settings[k] = el.value;
  }
  saveSettings();
}

const list = (s, sep) => s.split(sep).map((x) => x.trim()).filter(Boolean);
const dictionary = () => new Set(list(state.settings.dictionary, /\n/).map((w) => w.toLowerCase()));

function localOptions() {
  const s = state.settings;
  return {
    repeats: {
      minLength: s.minLength,
      maxLength: Math.max(s.minLength, s.maxLength),
      minCountShort: s.minCountShort,
      minCountLong: s.minCountLong,
    },
    glue: { threshold: s.glueThreshold / 100, minWords: s.glueMinWords },
    pronouns: {
      minRun: s.minRun,
      crossParagraphs: s.crossParagraphs,
      pronouns: list(s.pronounList, ","),
    },
  };
}

// --- running checks ----------------------------------------------------------

function setStatus(text, isError = false) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function runChecks() {
  const btn = $("#run");
  btn.disabled = true;
  state.ltError = null;
  state.cycle.clear();
  try {
    setStatus("Reading document…");
    state.paragraphs = await readParagraphs();
    state.local = analyzeLocal(state.paragraphs, localOptions());
    state.issues = [];
    render();

    const s = state.settings;
    if (s.ltEnabled) {
      try {
        state.issues = await checkDocument(state.paragraphs, {
          serverUrl: s.serverUrl || PUBLIC_SERVER,
          language: s.language,
          username: s.username,
          apiKey: s.apiKey,
          disabledRules: list(s.disabledRules, ","),
          onProgress: (done, total) =>
            setStatus(total > 1 ? `Checking grammar… part ${Math.min(done + 1, total)} of ${total}` : "Checking grammar…"),
        });
      } catch (err) {
        state.ltError = err.message || String(err);
      }
    }
    setStatus(
      state.ltError
        ? "Grammar check failed. Local checks finished."
        : `Done. Checked ${state.local.sentenceCount} sentences.`,
      !!state.ltError,
    );
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    btn.disabled = false;
    render();
  }
}

async function go(span) {
  try {
    await selectSpan(span);
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function applyFix(issue, replacement) {
  try {
    await replaceSpan(issue, replacement);
  } catch (err) {
    setStatus(err.message, true);
    return;
  }
  const delta = replacement.length - (issue.end - issue.start);
  const p = state.paragraphs[issue.para];
  state.paragraphs[issue.para] = p.slice(0, issue.start) + replacement + p.slice(issue.end);
  state.issues = state.issues.filter((i) => i !== issue);
  for (const i of state.issues) {
    if (i.para === issue.para && i.start >= issue.end) {
      i.start += delta;
      i.end += delta;
    }
  }
  // Local checks are cheap, so just redo them against the patched text.
  state.local = analyzeLocal(state.paragraphs, localOptions());
  render();
}

// --- rendering ---------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function visibleIssues(kind) {
  const dict = dictionary();
  return state.issues.filter(
    (i) => i.kind === kind && !(kind === "spelling" && dict.has(i.text.toLowerCase())),
  );
}

function counts() {
  const l = state.local;
  return {
    grammar: visibleIssues("grammar").length,
    punctuation: visibleIssues("punctuation").length,
    spelling: visibleIssues("spelling").length,
    repeats: l ? l.repeats.reduce((n, g) => n + g.phrases.length, 0) : null,
    glue: l ? l.glue.length : null,
    pronouns: l ? l.pronouns.length : null,
  };
}

function issueCard(issue) {
  const ctx = issue.context;
  const ctxNode = ctx
    ? el("div", { class: "ctx" },
        ctx.text.slice(0, ctx.offset),
        el("mark", {}, ctx.text.substr(ctx.offset, ctx.length)),
        ctx.text.slice(ctx.offset + ctx.length))
    : null;

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const actions = el("div", { class: "actions" },
    issue.suggestions.map((s) =>
      el("button", { class: "fix", title: "Replace in document", onclick: stop(() => applyFix(issue, s)) }, s === "" ? "(delete)" : s)),
    el("button", { title: "Hide this one", onclick: stop(() => { state.issues = state.issues.filter((i) => i !== issue); render(); }) }, "Ignore"),
    issue.kind === "spelling"
      ? el("button", { onclick: stop(() => addToDictionary(issue.text)) }, "Add to dictionary")
      : el("button", { title: `Stop checking: ${issue.ruleId}`, onclick: stop(() => ignoreRule(issue.ruleId)) }, "Ignore rule"),
  );

  return el("div", { class: `card ${issue.kind}`, onclick: () => go(issue) },
    el("div", { class: "msg" }, issue.shortMessage || issue.message),
    issue.shortMessage ? el("div", {}, issue.message) : null,
    ctxNode,
    actions,
    el("div", { class: "rule" }, issue.ruleName));
}

function addToDictionary(word) {
  state.settings.dictionary = (state.settings.dictionary.trim() + "\n" + word).trim();
  saveSettings();
  fillSettingsForm();
  render();
}

function ignoreRule(ruleId) {
  const rules = new Set(list(state.settings.disabledRules, ","));
  rules.add(ruleId);
  state.settings.disabledRules = [...rules].join(", ");
  state.issues = state.issues.filter((i) => i.ruleId !== ruleId);
  saveSettings();
  fillSettingsForm();
  render();
}

function renderProofing(kind) {
  if (!state.settings.ltEnabled) return [el("p", { class: "empty" }, "LanguageTool is switched off in Settings.")];
  if (state.ltError) return [el("p", { class: "empty" }, `Couldn't reach LanguageTool: ${state.ltError}`)];
  const issues = visibleIssues(kind).sort((a, b) => a.para - b.para || a.start - b.start);
  if (!issues.length) return [el("p", { class: "empty" }, "Nothing flagged here.")];
  return issues.map(issueCard);
}

function renderRepeats() {
  const groups = state.local.repeats;
  if (!groups.length) return [el("p", { class: "empty" }, "No repeated phrases. Nice.")];
  return groups.flatMap((g) => [
    el("h3", {}, `${g.length}-word phrases (${g.phrases.length})`),
    ...g.phrases.map((p) => {
      const sub = el("div", { class: "sub" }, "Click to step through each use");
      return el("div", {
        class: "card",
        onclick: () => {
          const next = ((state.cycle.get(p.phrase) ?? -1) + 1) % p.count;
          state.cycle.set(p.phrase, next);
          sub.textContent = `Showing ${next + 1} of ${p.count}`;
          go(p.occurrences[next]);
        },
      },
        el("div", { class: "phrase" }, el("span", {}, `“${p.phrase}”`), el("span", { class: "badge" }, `×${p.count}`)),
        sub);
    }),
  ]);
}

function renderGlue() {
  const items = state.local.glue;
  if (!items.length) return [el("p", { class: "empty" }, "No glue-heavy sentences found.")];
  return [
    el("p", { class: "sub" }, "Highlighted words are glue words: the, of, that, was, and friends. Cutting a few usually tightens the sentence."),
    ...items.map((g) => {
      const parts = [];
      let pos = 0;
      for (const w of g.glueWords) {
        parts.push(g.text.slice(pos, w.start), el("span", { class: "g" }, g.text.slice(w.start, w.end)));
        pos = w.end;
      }
      parts.push(g.text.slice(pos));
      return el("div", { class: "card", onclick: () => go(g) },
        el("div", { class: "phrase" }, el("span", { class: "sub" }, "Glue words"), el("span", { class: "badge" }, `${g.percent}%`)),
        el("div", { class: "glue-text" }, parts));
    }),
  ];
}

function renderPronouns() {
  const items = state.local.pronouns;
  if (!items.length) return [el("p", { class: "empty" }, `No runs of ${state.settings.minRun}+ sentences starting with the same pronoun.`)];
  return items.map((s) =>
    el("div", { class: "card streak", onclick: () => go(s.sentences[0]) },
      el("div", { class: "phrase" },
        el("span", { class: "msg" }, `${s.sentences.length} sentences in a row start with “${s.pronoun}”`)),
      el("ol", {}, s.sentences.map((sen) =>
        el("li", { onclick: (e) => { e.stopPropagation(); go(sen); } }, sen.text.length > 90 ? sen.text.slice(0, 90) + "…" : sen.text)))));
}

function render() {
  const c = counts();
  for (const b of document.querySelectorAll("#tabs button")) {
    const n = c[b.dataset.tab];
    b.querySelector(".count").textContent = n ? `(${n})` : "";
    b.setAttribute("aria-selected", String(b.dataset.tab === state.tab));
  }

  const main = $("#results");
  main.replaceChildren();
  if (!state.local) {
    main.append(el("p", { class: "empty" }, "Hit ", el("strong", {}, "Check document"), " to get started."));
    return;
  }
  const views = {
    grammar: () => renderProofing("grammar"),
    punctuation: () => renderProofing("punctuation"),
    spelling: () => renderProofing("spelling"),
    repeats: renderRepeats,
    glue: renderGlue,
    pronouns: renderPronouns,
  };
  main.append(...views[state.tab]());
}

// --- wiring ------------------------------------------------------------------

function wire() {
  fillSettingsForm();
  $("#run").addEventListener("click", runChecks);
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    render();
  });
  $("#settings-form").addEventListener("change", () => {
    readSettingsForm();
    if (state.local) {
      state.local = analyzeLocal(state.paragraphs, localOptions());
      render();
    }
  });
  $("#reset-settings").addEventListener("click", () => {
    state.settings = { ...DEFAULTS };
    saveSettings();
    fillSettingsForm();
    if (state.local) {
      state.local = analyzeLocal(state.paragraphs, localOptions());
      render();
    }
  });
}

Office.onReady((info) => {
  wire();
  if (info.host === Office.HostType.Word) {
    $("#run").disabled = false;
    setStatus("Ready.");
  } else {
    setStatus("Open this add-in inside Microsoft Word.", true);
  }
});
