import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitSentences, buildSentences, findRepeatedPhrases, findGlueSentences, findPronounStreaks,
} from "../src/analyzers.js";

test("splits sentences and skips abbreviations, initials, and dialogue tags", () => {
  const text = `Mr. Smith met Dr. Jones at 5 p.m. on Main St. today. "Wait!" she said. J. R. R. Tolkien wrote books. Done?`;
  const got = splitSentences(text).map((s) => s.text);
  assert.deepEqual(got, [
    "Mr. Smith met Dr. Jones at 5 p.m. on Main St. today.",
    `"Wait!" she said.`,
    "J. R. R. Tolkien wrote books.",
    "Done?",
  ]);
});

test("sentence offsets point back into the paragraph", () => {
  const text = "  First one.   Second one!";
  for (const s of splitSentences(text)) assert.equal(text.slice(s.start, s.end), s.text);
});

test("groups repeated phrases by length and drops covered sub-phrases", () => {
  const paras = [
    "At the end of the day we went home. At the end of the day she slept.",
    "At the end of the day nobody cared. The red barn stood there. The red barn burned.",
  ];
  const groups = findRepeatedPhrases(buildSentences(paras), { maxLength: 6 });
  const byLen = Object.fromEntries(groups.map((g) => [g.length, g.phrases.map((p) => p.phrase)]));

  assert.deepEqual(byLen[6], ["at the end of the day"]);
  assert.deepEqual(byLen[3], ["the red barn"]);
  // "the end of" appears 3 times, same as the 6-word phrase, so it's folded in
  assert.ok(!Object.values(byLen).flat().includes("the end of"));
  assert.deepEqual(groups.map((g) => g.length), [6, 3]); // longest first

  const occ = groups[0].phrases[0].occurrences[1];
  assert.equal(paras[occ.para].slice(occ.start, occ.end), "At the end of the day");
});

test("ignores phrases made only of glue words", () => {
  const s = buildSentences(["It was in the house. It was in the car. It was in the yard."]);
  const phrases = findRepeatedPhrases(s).flatMap((g) => g.phrases.map((p) => p.phrase));
  assert.ok(!phrases.includes("it was in the"));
  assert.ok(!phrases.includes("it was"));
});

test("flags glue-heavy sentences", () => {
  const s = buildSentences([
    "It was the kind of thing that he would have been able to do if he had the time.",
    "Thunder cracked across violet mountains while wolves howled beneath ancient pines.",
  ]);
  const glue = findGlueSentences(s);
  assert.equal(glue.length, 1);
  assert.match(glue[0].text, /^It was the kind/);
  assert.ok(glue[0].percent >= 45);
});

test("finds three sentences in a row starting with the same pronoun", () => {
  const s = buildSentences([
    "She walked in. She sat down. She’d forgotten her keys. He laughed.",
    "They left. They came back. The dog barked. They left again.",
  ]);
  const streaks = findPronounStreaks(s);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].pronoun, "She");
  assert.equal(streaks[0].sentences.length, 3);
});

test("pronoun streaks can stop at paragraph breaks", () => {
  const s = buildSentences(["I ran. I hid.", "I waited."]);
  assert.equal(findPronounStreaks(s).length, 1);
  assert.equal(findPronounStreaks(s, { crossParagraphs: false }).length, 0);
});

test("longer runs are reported once, with every sentence", () => {
  const s = buildSentences(["He ran. He jumped. He fell. He cried. It rained."]);
  const streaks = findPronounStreaks(s);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].sentences.length, 4);
});
