// Byte-pair encoding (BPE), trained step by step on a small corpus.
//
// Conventions (stated in the UI, since real tokenisers differ):
// - Pre-tokenising: text is cut into words, runs of numbers and runs of
//   punctuation. A single space before a piece stays attached to it and is
//   shown as ▁. Other whitespace (newlines, tabs, extra spaces) is dropped.
// - Numbers are kept as whole runs ("runs") or cut into single digits ("split").
// - Base symbols are Unicode code points ("chars") or UTF-8 bytes ("bytes").
// - Each merge picks the most frequent adjacent pair, counted over every word
//   weighted by how often the word appears. Ties go to the pair seen first
//   when scanning the corpus from the start. Training stops early when no
//   pair appears at least twice.
// - Encoding new text applies the learned merges in the order they were learned.

export const SPACE = "▁";

export const CORPUS = [
  "the cat sat on the mat. the cat ate the fish. the dog sat on the log.",
  "a lower tower, a newer tower, the lowest tower and the newest tower.",
  "she is reading and he is writing, we are learning and they are testing.",
  "for item in items: print(item)",
  "for line in lines: print(line)",
  "in 2024 we sold 1200 books and in 2025 we sold 1500 books.",
  "मैं घर जा रहा हूँ",
].join("\n");

export const SAMPLES = {
  english: { name: "English", text: "the newest reading tower is lower than the old one" },
  hindi: { name: "Hindi (Devanagari)", text: "मैं आज बाज़ार जा रहा हूँ" },
  code: { name: "Code", text: "for user in users: print(user.name)" },
  numbers: { name: "Numbers", text: "in 2025 we sold 123456 books at 7.50 each" },
};

export function pretokenise(text, { digits = "runs" } = {}) {
  const re = digits === "split"
    ? / ?[\p{L}\p{M}]+| ?\p{N}| ?[^\s\p{L}\p{M}\p{N}]+/gu
    : / ?[\p{L}\p{M}]+| ?\p{N}+| ?[^\s\p{L}\p{M}\p{N}]+/gu;
  return text.match(re) ?? [];
}

const enc = new TextEncoder();

// Base symbols of one pre-token. Bytes are stored one per character
// (code 0 to 255) so merged tokens are still plain strings.
export function symbolsOf(word, base = "chars") {
  if (base === "bytes") return [...enc.encode(word)].map((b) => String.fromCharCode(b));
  return Array.from(word.startsWith(" ") ? SPACE + word.slice(1) : word);
}

// How a token looks on screen. Byte tokens that aren't whole UTF-8 characters
// are shown as hex, e.g. ‹e0 a4›.
export function display(token, base = "chars") {
  if (base !== "bytes") return token;
  const bytes = Uint8Array.from([...token].map((c) => c.charCodeAt(0)));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^ /, SPACE);
  } catch {
    return `‹${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ")}›`;
  }
}

export function mergePair(syms, a, b) {
  const out = [];
  for (let i = 0; i < syms.length; i++) {
    if (syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; } else out.push(syms[i]);
  }
  return out;
}

export function countPairs(entries) {
  const counts = new Map();
  for (const e of entries) for (let i = 0; i + 1 < e.syms.length; i++) {
    const key = `${e.syms[i]}\u0000${e.syms[i + 1]}`;
    counts.set(key, (counts.get(key) ?? 0) + e.count);
  }
  return [...counts].map(([key, count], order) => { const [a, b] = key.split("\u0000"); return { a, b, count, order }; });
}

export const TRAIN_CODE = [
  "split the corpus into words; word → list of base symbols",
  "vocab ← every base symbol",
  "repeat k times",
  "  count every adjacent pair (a, b), weighted by word frequency",
  "  (a, b) ← the most frequent pair  // ties: first seen",
  "  if its count < 2 then stop  // nothing worth merging",
  "  replace every a b with the new symbol ab",
  "  add ab to vocab; append (a, b) to the merge list",
];

export function train(corpus, { merges = 30, base = "chars", digits = "runs" } = {}) {
  const words = pretokenise(corpus, { digits });
  const index = new Map();
  for (const w of words) index.set(w, (index.get(w) ?? 0) + 1);
  const entries = [...index].map(([word, count]) => ({ word, count, syms: symbolsOf(word, base) }));
  const seen = [];
  for (const e of entries) for (const s of e.syms) if (!seen.includes(s)) seen.push(s);
  const baseVocab = base === "bytes" ? Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)) : seen;
  const vocab = [...baseVocab];
  const list = [];
  const snap = () => entries.map((e) => ({ word: e.word, count: e.count, syms: [...e.syms] }));
  const top = (pairs) => [...pairs].sort((x, y) => y.count - x.count || x.order - y.order).slice(0, 8);
  const steps = [{
    phase: "start", line: [1, 2], words: snap(), pairs: top(countPairs(entries)), vocabSize: vocab.length, merge: null,
    vars: { words: words.length, distinct: entries.length, vocab: vocab.length, merges: 0 },
    note: base === "bytes"
      ? `${words.length} words (${entries.length} distinct) split into UTF-8 bytes. The base vocabulary is all 256 byte values, so nothing is ever unknown.`
      : `${words.length} words (${entries.length} distinct) split into characters. The base vocabulary is the ${seen.length} distinct characters seen.`,
  }];
  for (let m = 0; m < merges; m++) {
    const pairs = countPairs(entries);
    if (!pairs.length) { steps.push(stopStep("Every word is a single token now; nothing left to merge.")); break; }
    const best = pairs.reduce((x, y) => (y.count > x.count ? y : x));
    if (best.count < 2) { steps.push(stopStep(`The most frequent pair appears only once, so merging it would not save anything. Stopped after ${list.length} merges.`)); break; }
    let replaced = 0;
    for (const e of entries) {
      const before = e.syms.length;
      e.syms = mergePair(e.syms, best.a, best.b);
      replaced += (before - e.syms.length) * e.count;
    }
    const merge = { a: best.a, b: best.b, token: best.a + best.b, count: best.count, rank: list.length + 1 };
    list.push(merge);
    vocab.push(merge.token);
    const total = entries.reduce((s, e) => s + e.syms.length * e.count, 0);
    steps.push({
      phase: "merge", line: [4, 5, 7, 8], words: snap(), pairs: top(pairs), vocabSize: vocab.length, merge,
      vars: { "pair": `${display(best.a, base)} + ${display(best.b, base)}`, count: best.count, "new token": display(merge.token, base), vocab: vocab.length, merges: list.length, "corpus tokens": total },
      note: `Merge ${list.length}: "${display(best.a, base)}" + "${display(best.b, base)}" appears ${best.count} time${best.count === 1 ? "" : "s"}, the most of any pair${pairs.filter((p) => p.count === best.count).length > 1 ? " (tied, so the first one seen wins)" : ""}. It becomes "${display(merge.token, base)}", and the corpus shrinks by ${replaced} token${replaced === 1 ? "" : "s"} to ${total}.`,
    });
  }
  function stopStep(note) {
    return { phase: "stop", line: 6, words: snap(), pairs: [], vocabSize: vocab.length, merge: null, vars: { vocab: vocab.length, merges: list.length }, note };
  }
  const last = steps.at(-1);
  if (last.phase === "merge") last.note += ` That was the last of the ${merges} merges asked for.`;
  return { base, digits, merges: list, vocab, baseVocab, known: new Set(vocab), words: entries, steps, trainedWords: new Set(index.keys()) };
}

export const ENCODE_CODE = [
  "split the text into words; word → base symbols",
  "for each merge (a, b) in the order it was learned",
  "  replace every a b in every word with ab",
  "tokens ← the symbols left; count them",
];

// Tokenise new text with a trained model. Steps are only made for merges
// that change something, so the trace stays short.
export function encode(text, model) {
  const words = pretokenise(text, { digits: model.digits });
  let syms = words.map((w) => symbolsOf(w, model.base));
  const count = () => syms.reduce((s, x) => s + x.length, 0);
  const steps = [{ line: 1, words: syms.map((s) => [...s]), merge: null, vars: { words: words.length, tokens: count() }, note: `${words.length} words become ${count()} base symbols.` }];
  for (const m of model.merges) {
    const before = count();
    syms = syms.map((s) => mergePair(s, m.a, m.b));
    const after = count();
    if (after < before) steps.push({
      line: [2, 3], words: syms.map((s) => [...s]), merge: m,
      vars: { merge: m.rank, pair: `${display(m.a, model.base)} + ${display(m.b, model.base)}`, applied: before - after, tokens: after },
      note: `Merge ${m.rank} ("${display(m.a, model.base)}" + "${display(m.b, model.base)}") applies ${before - after} time${before - after === 1 ? "" : "s"}: ${after} tokens left.`,
    });
  }
  const tokens = syms.flat();
  const unknown = tokens.filter((t) => !model.known.has(t));
  steps.push({
    line: 4, words: syms.map((s) => [...s]), merge: null, final: true,
    vars: { tokens: tokens.length, characters: Array.from(text).length, unknown: unknown.length },
    note: `${tokens.length} tokens for ${Array.from(text).length} characters.${unknown.length ? ` ${unknown.length} symbol${unknown.length === 1 ? " was" : "s were"} never seen in training, so a real character-level vocabulary would map ${unknown.length === 1 ? "it" : "them"} to an unknown token. Byte-level BPE avoids this.` : ""}`,
  });
  return { words: syms, tokens, unknown, steps };
}

// Character, word and subword tokenisers side by side on the same text.
export function compare(text, model) {
  const words = pretokenise(text, { digits: model.digits });
  const chars = words.reduce((s, w) => s + symbolsOf(w, "chars").length, 0);
  const bytes = enc.encode(text).length;
  const oov = words.filter((w) => !model.trainedWords.has(w)).length;
  const sub = encode(text, model).tokens.length;
  return { chars, bytes, words: words.length, oov, subword: sub, characters: Array.from(text).length };
}

// Practice: a tiny corpus where the answer can be worked out by hand.
export function practiceCorpus(r) {
  const stems = [["low", "lower", "lowest"], ["new", "newer", "newest"], ["hug", "hugs", "hugged"], ["run", "runs", "runner"], ["sun", "sunny", "suns"]];
  const pick = stems[Math.floor(r() * stems.length)];
  const other = stems[(stems.indexOf(pick) + 1 + Math.floor(r() * (stems.length - 1))) % stems.length];
  const pool = [...pick, ...pick, other[0], other[1]];
  const n = 5 + Math.floor(r() * 3);
  return Array.from({ length: n }, () => pool[Math.floor(r() * pool.length)]).join(" ");
}
