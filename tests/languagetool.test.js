import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDocument, segmentParagraphs, buildChunks, categorize } from "../src/languagetool.js";

// Fake LanguageTool: flags every "teh" as a typo and every " ," as punctuation.
function fakeServer(calls) {
  return async (_url, init) => {
    const text = new URLSearchParams(init.body).get("text");
    calls.push(text);
    const matches = [];
    for (const m of text.matchAll(/teh/g)) {
      matches.push({
        offset: m.index, length: 3, message: "Possible typo",
        replacements: [{ value: "the" }],
        rule: { id: "MORFOLOGIK", issueType: "misspelling", category: { id: "TYPOS" } },
      });
    }
    for (const m of text.matchAll(/ ,/g)) {
      matches.push({
        offset: m.index, length: 2, message: "Space before comma",
        replacements: [{ value: "," }],
        rule: { id: "COMMA_WS", issueType: "whitespace", category: { id: "TYPOGRAPHY" } },
      });
    }
    return { ok: true, status: 200, json: async () => ({ matches }) };
  };
}

test("maps issues back to the right paragraph and offset", async () => {
  const paras = ["Fine here.", "", "I saw teh dog , and teh cat."];
  const calls = [];
  const issues = await checkDocument(paras, { fetchImpl: fakeServer(calls), delayMs: 0 });

  assert.equal(calls.length, 1);
  assert.equal(issues.length, 3);
  for (const i of issues) {
    assert.equal(i.para, 2);
    assert.equal(paras[2].slice(i.start, i.end), i.text);
  }
  assert.deepEqual(issues.map((i) => i.kind).sort(), ["punctuation", "spelling", "spelling"]);
});

test("splits big documents into several requests and keeps offsets right", async () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} has teh word. `.repeat(30));
  const calls = [];
  const issues = await checkDocument(paras, { fetchImpl: fakeServer(calls), delayMs: 0 });
  assert.ok(calls.length > 1);
  assert.equal(issues.length, 40 * 30);
  for (const i of issues) assert.equal(paras[i.para].slice(i.start, i.end), "teh");
});

test("cuts an oversized paragraph at sentence boundaries", () => {
  const para = "This is one sentence. ".repeat(200).trim();
  const segs = segmentParagraphs([para], 1000);
  assert.ok(segs.length > 1);
  for (const s of segs) assert.equal(para.slice(s.offset, s.offset + s.text.length), s.text);
  assert.ok(buildChunks(segs, 1000).length > 1);
});

test("categorizes LanguageTool rules", () => {
  assert.equal(categorize({ rule: { issueType: "misspelling", category: { id: "TYPOS" } } }), "spelling");
  assert.equal(categorize({ rule: { issueType: "typographical", category: { id: "PUNCTUATION" } } }), "punctuation");
  assert.equal(categorize({ rule: { issueType: "grammar", category: { id: "GRAMMAR" } } }), "grammar");
});

test("surfaces server errors", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
  await assert.rejects(checkDocument(["Hello there."], { fetchImpl, delayMs: 0 }), /500/);
});
