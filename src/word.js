/* global Word */
// Thin layer over Office.js. Everything the checkers report is a
// { para, start, end } span; these helpers turn that back into a Word range.

const SEARCH_LIMIT = 200; // Word rejects search strings over 255 chars

export async function readParagraphs() {
  return Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load("items/text");
    await ctx.sync();
    return ps.items.map((p) => p.text);
  });
}

// Word search treats ^ as a special character.
const escapeSearch = (s) => s.replace(/\^/g, "^^");

// Which occurrence of `needle` in `haystack` sits closest to `near`?
function nearestOccurrence(haystack, needle, near) {
  let best = 0;
  let bestDist = Infinity;
  let k = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1), k++) {
    const d = Math.abs(i - near);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return bestDist === Infinity ? -1 : best;
}

async function rangeFor(ctx, span) {
  const ps = ctx.document.body.paragraphs;
  ps.load("items/text");
  await ctx.sync();
  const para = ps.items[span.para];
  if (!para) throw new Error("That paragraph no longer exists. Try running the check again.");

  const text = para.text;
  const wanted = span.text ?? text.slice(span.start, span.end);

  const pick = async (needle, near) => {
    const k = nearestOccurrence(text, needle, near);
    if (k === -1) return null;
    const hits = para.search(escapeSearch(needle), { matchCase: true });
    hits.load("items");
    await ctx.sync();
    return hits.items[Math.min(k, hits.items.length - 1)] || null;
  };

  if (wanted.length <= SEARCH_LIMIT) {
    const r = await pick(wanted, span.start);
    if (!r) throw new Error(`Couldn't find "${wanted}" anymore. The text may have changed.`);
    return r;
  }

  // Long sentence: find its opening and closing pieces and stretch between them.
  const head = wanted.slice(0, SEARCH_LIMIT);
  const tail = wanted.slice(-SEARCH_LIMIT);
  const first = await pick(head, span.start);
  const last = await pick(tail, span.end - tail.length);
  if (!first) throw new Error("Couldn't find that sentence anymore. The text may have changed.");
  return last ? first.expandTo(last) : first;
}

export async function selectSpan(span) {
  return Word.run(async (ctx) => {
    const r = await rangeFor(ctx, span);
    r.select();
    await ctx.sync();
  });
}

export async function replaceSpan(span, replacement) {
  return Word.run(async (ctx) => {
    const r = await rangeFor(ctx, span);
    r.insertText(replacement, "Replace");
    r.select("End");
    await ctx.sync();
  });
}
