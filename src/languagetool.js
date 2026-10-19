// Grammar, punctuation and spelling via the LanguageTool HTTP API.
// https://languagetool.org/http-api/
//
// The free public server allows 20 requests/min and 20 KB per request, so the
// document gets sent in chunks with a pause between them. Point serverUrl at
// a self-hosted LanguageTool to skip both limits (and keep text local).

import { splitSentences } from "./analyzers.js";

export const PUBLIC_SERVER = "https://api.languagetool.org/v2";
const MAX_CHUNK_BYTES = 15000;
const PUBLIC_DELAY_MS = 3200;
const SEP = "\n\n";

const bytes = (s) => new TextEncoder().encode(s).length;

// Break paragraphs into segments of at most MAX_CHUNK_BYTES. Almost every
// paragraph is a single segment; giant ones get cut at sentence boundaries.
export function segmentParagraphs(paragraphs, maxBytes = MAX_CHUNK_BYTES) {
  const segments = [];
  paragraphs.forEach((text, para) => {
    if (!text.trim()) return;
    if (bytes(text) <= maxBytes) {
      segments.push({ para, offset: 0, text });
      return;
    }
    let cur = null;
    for (const s of splitSentences(text)) {
      if (cur && bytes(text.slice(cur.offset, s.end)) > maxBytes) {
        segments.push(cur);
        cur = null;
      }
      if (!cur) cur = { para, offset: s.start, text: "" };
      cur.text = text.slice(cur.offset, s.end);
    }
    if (cur) segments.push(cur);
  });
  return segments;
}

// Group segments into request-sized chunks, remembering where each starts.
export function buildChunks(segments, maxBytes = MAX_CHUNK_BYTES) {
  const chunks = [];
  let cur = { text: "", parts: [] };
  for (const seg of segments) {
    const addition = (cur.text ? SEP : "") + seg.text;
    if (cur.text && bytes(cur.text + addition) > maxBytes) {
      chunks.push(cur);
      cur = { text: "", parts: [] };
    }
    if (cur.text) cur.text += SEP;
    cur.parts.push({ ...seg, chunkStart: cur.text.length });
    cur.text += seg.text;
  }
  if (cur.text) chunks.push(cur);
  return chunks;
}

export function categorize(match) {
  const cat = match.rule?.category?.id || "";
  const type = match.rule?.issueType || "";
  if (type === "misspelling" || cat === "TYPOS") return "spelling";
  if (cat === "PUNCTUATION" || cat === "TYPOGRAPHY" || type === "typographical") return "punctuation";
  return "grammar";
}

function toIssue(match, chunk) {
  const part = [...chunk.parts].reverse().find((p) => p.chunkStart <= match.offset);
  if (!part) return null;
  const start = part.offset + (match.offset - part.chunkStart);
  const errorText = chunk.text.substr(match.offset, match.length);
  return {
    kind: categorize(match),
    para: part.para,
    start,
    end: start + match.length,
    text: errorText,
    message: match.message,
    shortMessage: match.shortMessage || "",
    ruleId: match.rule?.id || "",
    ruleName: match.rule?.description || "",
    suggestions: (match.replacements || []).slice(0, 5).map((r) => r.value),
    context: match.context, // { text, offset, length }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function checkDocument(paragraphs, options = {}) {
  const {
    serverUrl = PUBLIC_SERVER,
    language = "en-US",
    username = "",
    apiKey = "",
    disabledRules = [],
    onProgress = () => {},
    fetchImpl = (...args) => fetch(...args),
    delayMs = serverUrl.replace(/\/$/, "") === PUBLIC_SERVER && !apiKey ? PUBLIC_DELAY_MS : 0,
  } = options;

  const chunks = buildChunks(segmentParagraphs(paragraphs));
  const issues = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress(i, chunks.length);
    if (i > 0 && delayMs) await sleep(delayMs);

    const body = new URLSearchParams({ text: chunks[i].text, language });
    if (username && apiKey) {
      body.set("username", username);
      body.set("apiKey", apiKey);
    }
    if (disabledRules.length) body.set("disabledRules", disabledRules.join(","));

    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetchImpl(serverUrl.replace(/\/$/, "") + "/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
      });
      if (res.status !== 429) break;
      await sleep(15000 * (attempt + 1)); // rate limited, back off and retry
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LanguageTool returned ${res.status}. ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const m of data.matches || []) {
      const issue = toIssue(m, chunks[i]);
      if (issue) issues.push(issue);
    }
  }
  onProgress(chunks.length, chunks.length);
  return issues;
}
