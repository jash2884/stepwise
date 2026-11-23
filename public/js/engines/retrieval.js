// Retrieval for RAG: BM25, dense search with the hand-made word vectors,
// hybrid search with Reciprocal Rank Fusion, a stand-in reranker, chunking,
// and the assembled prompt.
//
// Conventions:
// - Text is lower-cased and cut into runs of letters; a short stop-word list
//   is removed; there is no stemming ("kitten" and "kittens" are different).
// - BM25 uses k1 = 1.2, b = 0.75 and idf = ln(1 + (N − n + 0.5) / (n + 0.5)),
//   the form Lucene uses, which is never negative.
// - Dense scores are the cosine between averaged word vectors.
// - RRF score = Σ 1 / (k + rank) over the rankings, rank counted from 1, k = 60.

import { cosine, sentenceVector, VECTORS } from "./vectors.js";

export const DOCS = [
  "The king and the queen live in the palace. The palace has a royal kitchen.",
  "A kitten and a puppy play on the farm. The puppy chases the kitten.",
  "Our cat sleeps in the kitchen after its food.",
  "Fresh bread, apple cake and milk are served at the school.",
  "The prince and the princess visit the farm to see the dog.",
  "Pet food for a dog or a cat: what to buy and how much to feed.",
];

export const STOP = new Set("the a an and or of in on at to for is are be its it our has have what how much with from as by this that so do does i my your you can".split(" "));

export const terms = (text) => (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w));

export const idf = (N, n) => Math.log(1 + (N - n + 0.5) / (n + 0.5));

export const BM25_CODE = [
  "for each query term t",
  "  n ← number of documents containing t",
  "  idf ← ln(1 + (N − n + 0.5) / (n + 0.5))  // rare terms count more",
  "  for each document d containing t",
  "    f ← times t appears in d",
  "    norm ← 1 − b + b · |d| / avgdl  // long documents are discounted",
  "    score[d] += idf · f · (k1 + 1) / (f + k1 · norm)",
  "sort documents by score, highest first",
];

export function bm25(query, docs = DOCS, { k1 = 1.2, b = 0.75 } = {}) {
  const toks = docs.map(terms);
  const N = docs.length;
  const avgdl = toks.reduce((s, t) => s + t.length, 0) / N;
  const q = [...new Set(terms(query))];
  const scores = docs.map(() => 0);
  const parts = docs.map(() => ({}));
  const steps = [{ line: 1, vars: { N, avgdl: Number(avgdl.toFixed(2)), k1, b, terms: q }, scores: scores.slice(), term: null, note: q.length ? `Query terms after removing stop words: ${q.join(", ")}. Average document length is ${avgdl.toFixed(2)} terms.` : "Every query word is a stop word, so BM25 has nothing to match." }];
  for (const t of q) {
    const n = toks.filter((d) => d.includes(t)).length;
    const w = idf(N, n);
    steps.push({ line: [2, 3], vars: { t, n, idf: Number(w.toFixed(3)) }, scores: scores.slice(), term: t, note: n ? `"${t}" is in ${n} of ${N} documents, so idf = ln(1 + (${N} − ${n} + 0.5) / (${n} + 0.5)) = ${w.toFixed(3)}.` : `"${t}" is in no document, so it adds nothing. Dense search can still use its meaning.` });
    toks.forEach((d, i) => {
      const f = d.filter((x) => x === t).length;
      if (!f) return;
      const norm = 1 - b + (b * d.length) / avgdl;
      const s = (w * f * (k1 + 1)) / (f + k1 * norm);
      scores[i] += s;
      parts[i][t] = s;
      steps.push({ line: [5, 6, 7], vars: { t, d: i + 1, f, "|d|": d.length, norm: Number(norm.toFixed(3)), "+score": Number(s.toFixed(3)) }, scores: scores.slice(), term: t, doc: i, note: `Document ${i + 1} has "${t}" ${f} time${f === 1 ? "" : "s"} in ${d.length} terms (norm ${norm.toFixed(2)}): adds ${s.toFixed(3)}. Extra repeats help less and less, because of k1.` });
    });
  }
  const ranked = order(scores);
  steps.push({ line: 8, vars: { order: ranked.map((i) => i + 1) }, scores: scores.slice(), ranked, final: true, note: `Ranking: ${ranked.filter((i) => scores[i] > 0).map((i) => `D${i + 1} (${scores[i].toFixed(2)})`).join(", ") || "no document matches"}. Documents with none of the words score 0.` });
  return { query: q, scores, parts, ranked, avgdl, steps };
}

// Highest first; ties by document order.
export const order = (scores) => scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);

export function dense(query, docs = DOCS, vocab = VECTORS) {
  const q = sentenceVector(query, vocab);
  const vs = docs.map((d) => sentenceVector(d, vocab));
  const scores = vs.map((v) => cosine(q.vector, v.vector));
  return { known: q.known, docKnown: vs.map((v) => v.known), scores, ranked: order(scores) };
}

// Reciprocal Rank Fusion over any number of rankings (lists of doc indices).
export function rrf(rankings, k = 60) {
  const scores = new Map();
  for (const list of rankings) list.forEach((d, r) => scores.set(d, (scores.get(d) ?? 0) + 1 / (k + r + 1)));
  const ranked = [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a) || a - b);
  return { scores, ranked };
}

// A stand-in for a cross-encoder reranker, which reads query and document
// together. Here: for every query word, its best cosine with any word in the
// document (an exact match counts 1), averaged over the query words.
export function rerank(query, candidates, docs = DOCS, vocab = VECTORS) {
  const q = terms(query);
  const rows = candidates.map((d) => {
    const dw = terms(docs[d]);
    const per = q.map((w) => {
      if (dw.includes(w)) return { w, best: w, s: 1 };
      if (!vocab[w]) return { w, best: null, s: 0 };
      let best = null, s = 0;
      for (const x of dw) if (vocab[x]) { const c = cosine(vocab[w], vocab[x]); if (c > s) { s = c; best = x; } }
      return { w, best, s };
    });
    return { d, per, score: q.length ? per.reduce((a, p) => a + p.s, 0) / q.length : 0 };
  });
  rows.sort((a, b) => b.score - a.score || a.d - b.d);
  return rows;
}

// --- Chunking -------------------------------------------------------------------

export const ARTICLE = `# Bringing a kitten home
A kitten needs a quiet room for the first few days. Put food, water and a litter tray in the room before the kitten arrives. Let the kitten explore at its own pace.

# Food
Kittens grow fast and need food made for kittens. Feed small meals four times a day until the kitten is three months old. Cow's milk upsets most cats, so give water instead.

# Health
Book a vet visit in the first week. The vet will check the kitten, plan vaccinations and talk about neutering. Keep the kitten indoors until the vaccinations are done.

# Play
Play every day with toys the kitten can chase. A bored kitten may scratch furniture, so give it a scratching post. Never use your hands as toys.`;

export const STRATEGIES = {
  fixed: { name: "Fixed size", uses: ["size"] },
  overlap: { name: "Fixed size with overlap", uses: ["size", "overlap"] },
  sentence: { name: "By sentence", uses: ["size"] },
  heading: { name: "By heading", uses: [] },
};

const wordSpans = (text) => [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));

function sentenceSpans(text) {
  const out = [];
  for (const line of text.matchAll(/[^\n]+/g)) {
    if (line[0].startsWith("#")) { out.push({ start: line.index, end: line.index + line[0].length, heading: true }); continue; }
    for (const m of line[0].matchAll(/[^.!?]+[.!?]*/g)) {
      const lead = m[0].length - m[0].trimStart().length;
      const s = line.index + m.index + lead, e = line.index + m.index + m[0].trimEnd().length;
      if (e > s) out.push({ start: s, end: e });
    }
  }
  return out;
}

export function fixedCount(words, size, overlap = 0) {
  if (words <= 0) return 0;
  const step = size - overlap;
  return words <= size ? 1 : 1 + Math.ceil((words - size) / step);
}

export function chunk(text, strategy = "fixed", { size = 30, overlap = 10 } = {}) {
  const words = wordSpans(text);
  const make = (start, end) => {
    const t = text.slice(start, end);
    return { start, end, text: t, words: (t.match(/\S+/g) ?? []).length };
  };
  const chunks = [];
  if (strategy === "fixed" || strategy === "overlap") {
    const ov = strategy === "overlap" ? Math.min(overlap, size - 1) : 0;
    const step = size - ov;
    for (let i = 0; i < words.length; i += step) {
      const j = Math.min(i + size, words.length);
      chunks.push(make(words[i].start, words[j - 1].end));
      if (j >= words.length) break;
    }
  } else if (strategy === "sentence") {
    let cur = null;
    for (const s of sentenceSpans(text)) {
      const n = (text.slice(s.start, s.end).match(/\S+/g) ?? []).length;
      if (cur && cur.n + n <= size) { cur.end = s.end; cur.n += n; } else { if (cur) chunks.push(make(cur.start, cur.end)); cur = { start: s.start, end: s.end, n }; }
    }
    if (cur) chunks.push(make(cur.start, cur.end));
  } else {
    const heads = [...text.matchAll(/^#.*$/gm)].map((m) => m.index);
    if (!heads.length || heads[0] > 0) heads.unshift(0);
    heads.forEach((s, i) => {
      const e = (heads[i + 1] ?? text.length);
      const t = text.slice(s, e).trimEnd();
      if (t.trim()) chunks.push(make(s, s + t.length));
    });
  }
  return chunks.map((c, i) => ({ ...c, id: i + 1 }));
}

// --- The RAG pipeline -------------------------------------------------------------

export function pipeline(query, text = ARTICLE, { strategy = "heading", size = 30, overlap = 10, k = 2, method = "hybrid" } = {}) {
  const chunks = chunk(text, strategy, { size, overlap });
  const docs = chunks.map((c) => c.text);
  const lex = bm25(query, docs), sem = dense(query, docs);
  // Documents BM25 can't match at all don't get a BM25 rank.
  const matched = lex.ranked.filter((d) => lex.scores[d] > 0);
  const ranked = method === "bm25" ? lex.ranked : method === "dense" ? sem.ranked : rrf([matched, sem.ranked]).ranked;
  const top = ranked.slice(0, k);
  const prompt = [
    "Answer the question using only the sources below.",
    "Cite each fact with its source number, like [1]. If the sources don't say, reply that you don't know.",
    "",
    ...top.map((d, i) => `[${i + 1}] ${docs[d].trim()}`),
    "",
    `Question: ${query}`,
  ].join("\n");
  const q = new Set(terms(query));
  const answer = top.map((d, i) => {
    const sents = sentenceSpans(docs[d]).filter((s) => !s.heading).map((s) => docs[d].slice(s.start, s.end));
    const best = sents.map((s) => ({ s, hits: terms(s).filter((w) => q.has(w)).length })).sort((a, b) => b.hits - a.hits)[0];
    return { cite: i + 1, chunk: chunks[d].id, sentence: best?.s ?? "", hits: best?.hits ?? 0 };
  });
  return { chunks, lex, sem, ranked, top, prompt, answer };
}
