// Local style checks. Pure functions with no Office.js dependency, so they
// run (and get tested) in Node as well as inside the Word task pane.
//
// Positions are always { para, start, end }: the paragraph index in the
// document plus character offsets inside that paragraph's text.

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
  "inc", "ltd", "co", "mt", "no", "fig", "approx", "dept", "est", "gen", "gov",
  "lt", "col", "sgt", "capt", "rev", "u.s", "a.m", "p.m", "ft", "ave", "blvd",
]);

// Function words that hold a sentence together without carrying much meaning.
export const GLUE_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "of", "to",
  "in", "on", "at", "by", "with", "from", "into", "onto", "upon", "about", "as",
  "than", "that", "this", "these", "those", "it", "its", "is", "are", "was",
  "were", "be", "been", "being", "am", "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "there", "here", "which", "who", "whom", "what", "when", "where", "while", "if",
  "then", "not", "no", "just", "very", "really", "up", "out", "off", "over",
  "some", "any", "all", "also", "too", "much", "many", "more", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "our", "their", "get", "got", "go", "going", "went", "because", "though",
  "although", "through", "after", "before", "around", "back", "down", "even",
  "still", "own", "each", "such", "only", "again", "once", "how", "why",
]);

export const DEFAULT_PRONOUNS = [
  "i", "you", "he", "she", "it", "we", "they",
  "my", "your", "his", "her", "its", "our", "their",
];

// "I'm" -> "i", "She’d" -> "she"
function normalizeWord(w) {
  return w.toLowerCase().replace(/[’']/g, "'");
}

function baseOfContraction(w) {
  return normalizeWord(w).split("'")[0];
}

const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(WORD)) {
    out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Returns [{ text, start, end }] for one paragraph of text.
export function splitSentences(text) {
  const sentences = [];
  let segStart = 0;

  const push = (from, to) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) sentences.push({ text: trimmed, start: from + lead, end: from + lead + trimmed.length });
  };

  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    const after = text.slice(end).trimStart();

    // "Wait!" she said.  /  etc. and so on  -> not a sentence break
    if (after && /^\p{Ll}/u.test(after)) continue;

    if (m[0] === ".") {
      const before = text.slice(segStart, m.index).match(/([\p{L}.]+)$/u);
      const word = before ? before[1] : "";
      if (ABBREVIATIONS.has(word.toLowerCase())) continue;
      if (/^\p{Lu}$/u.test(word)) continue; // initials like "J. R. Tolkien"
    }

    push(segStart, end);
    segStart = end;
  }
  push(segStart, text.length);
  return sentences;
}

// Flattens a list of paragraph strings into sentences with word tokens.
export function buildSentences(paragraphs) {
  const all = [];
  paragraphs.forEach((ptext, para) => {
    for (const s of splitSentences(ptext)) {
      all.push({ ...s, para, words: tokenize(s.text) });
    }
  });
  return all;
}

// ---------------------------------------------------------------------------
// Repeated phrases, grouped by phrase length (longest first).

export function findRepeatedPhrases(sentences, opts = {}) {
  const {
    minLength = 2,
    maxLength = 6,
    minCountShort = 3, // for 2-word phrases, which repeat naturally
    minCountLong = 2,
    skipAllGlue = true,
  } = opts;

  const table = new Map(); // phrase -> { length, occurrences }

  for (const s of sentences) {
    const words = s.words.map((t) => normalizeWord(t.word));
    for (let n = minLength; n <= maxLength; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const slice = words.slice(i, i + n);
        if (skipAllGlue && slice.every((w) => GLUE_WORDS.has(w))) continue;
        const key = slice.join(" ");
        if (!table.has(key)) table.set(key, { length: n, occurrences: [] });
        table.get(key).occurrences.push({
          para: s.para,
          start: s.start + s.words[i].start,
          end: s.start + s.words[i + n - 1].end,
        });
      }
    }
  }

  const kept = new Map();
  for (const [phrase, info] of table) {
    const needed = info.length === 2 ? minCountShort : minCountLong;
    if (info.occurrences.length >= needed) kept.set(phrase, info);
  }

  // If "at the end of" shows up 3 times, "the end of" showing up 3 times is
  // just the same repeat again. Drop shorter phrases that a longer one covers.
  const subsumed = new Set();
  for (const [phrase, info] of kept) {
    if (info.length <= minLength) continue;
    const parts = phrase.split(" ");
    for (const sub of [parts.slice(1).join(" "), parts.slice(0, -1).join(" ")]) {
      const subInfo = kept.get(sub);
      if (subInfo && subInfo.occurrences.length === info.occurrences.length) subsumed.add(sub);
    }
  }

  const groups = new Map();
  for (const [phrase, info] of kept) {
    if (subsumed.has(phrase)) continue;
    if (!groups.has(info.length)) groups.set(info.length, []);
    groups.get(info.length).push({ phrase, count: info.occurrences.length, occurrences: info.occurrences });
  }

  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([length, phrases]) => ({
      length,
      phrases: phrases.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase)),
    }));
}

// ---------------------------------------------------------------------------
// Glue sentences: lots of function words, not much substance.

export function findGlueSentences(sentences, opts = {}) {
  const { threshold = 0.45, minWords = 8 } = opts;
  const results = [];
  for (const s of sentences) {
    if (s.words.length < minWords) continue;
    const glueIdx = [];
    s.words.forEach((t, i) => {
      if (GLUE_WORDS.has(normalizeWord(t.word))) glueIdx.push(i);
    });
    const ratio = glueIdx.length / s.words.length;
    if (ratio >= threshold) {
      results.push({
        para: s.para, start: s.start, end: s.end, text: s.text,
        percent: Math.round(ratio * 100),
        glueWords: glueIdx.map((i) => ({ start: s.words[i].start, end: s.words[i].end })),
      });
    }
  }
  return results.sort((a, b) => b.percent - a.percent);
}

// ---------------------------------------------------------------------------
// Runs of sentences that open with the same pronoun.

export function findPronounStreaks(sentences, opts = {}) {
  const { minRun = 3, pronouns = DEFAULT_PRONOUNS, crossParagraphs = true } = opts;
  const set = new Set(pronouns.map((p) => p.toLowerCase()));
  const streaks = [];
  let run = [];
  let current = null;

  const close = () => {
    if (run.length >= minRun) {
      streaks.push({
        pronoun: run[0].firstWord,
        sentences: run.map(({ s }) => ({ para: s.para, start: s.start, end: s.end, text: s.text })),
      });
    }
    run = [];
    current = null;
  };

  for (const s of sentences) {
    const first = s.words[0];
    const key = first ? baseOfContraction(first.word) : null;
    const lastPara = run.length ? run[run.length - 1].s.para : null;

    if (!crossParagraphs && lastPara !== null && lastPara !== s.para) close();

    if (key && set.has(key)) {
      if (key !== current) close();
      current = key;
      run.push({ s, firstWord: key === "i" ? "I" : key[0].toUpperCase() + key.slice(1) });
    } else {
      close();
    }
  }
  close();
  return streaks;
}

export function analyzeLocal(paragraphs, settings = {}) {
  const sentences = buildSentences(paragraphs);
  return {
    sentenceCount: sentences.length,
    repeats: findRepeatedPhrases(sentences, settings.repeats),
    glue: findGlueSentences(sentences, settings.glue),
    pronouns: findPronounStreaks(sentences, settings.pronouns),
  };
}
