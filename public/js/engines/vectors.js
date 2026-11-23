// Word vectors made by hand, with 8 axes a person can read. Real embeddings
// have hundreds or thousands of dimensions learned from data, and no single
// dimension usually means anything on its own; these are built so you can
// check every number.

export const AXES = ["royal", "male", "female", "young", "animal", "feline", "food", "place"];

// [royal, male, female, young, animal, feline, food, place]
const RAW = {
  king:     [0.95, 0.9, 0, 0.1, 0, 0, 0, 0.05],
  queen:    [0.95, 0, 0.9, 0.1, 0, 0, 0, 0.05],
  prince:   [0.8, 0.85, 0, 0.75, 0, 0, 0, 0.05],
  princess: [0.8, 0, 0.85, 0.75, 0, 0, 0, 0.05],
  man:      [0.05, 0.9, 0, 0.2, 0, 0, 0, 0],
  woman:    [0.05, 0, 0.9, 0.2, 0, 0, 0, 0],
  boy:      [0, 0.85, 0, 0.9, 0, 0, 0, 0],
  girl:     [0, 0, 0.85, 0.9, 0, 0, 0, 0],
  royal:    [0.9, 0.1, 0.1, 0, 0, 0, 0, 0.1],
  dog:      [0, 0.05, 0.05, 0.1, 0.9, 0, 0, 0],
  puppy:    [0, 0.05, 0.05, 0.9, 0.85, 0, 0, 0],
  cat:      [0, 0.05, 0.05, 0.1, 0.85, 0.9, 0, 0],
  kitten:   [0, 0.05, 0.05, 0.9, 0.8, 0.85, 0, 0],
  lion:     [0.35, 0.3, 0, 0.1, 0.95, 0.85, 0, 0.05],
  pet:      [0, 0, 0, 0.3, 0.8, 0.4, 0, 0.1],
  apple:    [0, 0, 0, 0, 0, 0, 0.9, 0],
  bread:    [0, 0, 0, 0, 0, 0, 0.95, 0.05],
  cake:     [0.1, 0, 0, 0.25, 0, 0, 0.9, 0],
  milk:     [0, 0, 0, 0.35, 0.2, 0.1, 0.85, 0],
  food:     [0, 0, 0, 0, 0.05, 0, 0.95, 0.05],
  palace:   [0.85, 0, 0, 0, 0, 0, 0, 0.9],
  school:   [0, 0, 0, 0.7, 0, 0, 0, 0.9],
  farm:     [0, 0, 0, 0, 0.6, 0, 0.5, 0.85],
  kitchen:  [0, 0, 0, 0, 0, 0, 0.6, 0.85],
  home:     [0, 0, 0, 0.1, 0.1, 0, 0.1, 0.95],
};

export const WORDS = Object.keys(RAW);
export const VECTORS = Object.fromEntries(Object.entries(RAW).map(([w, v]) => [w, v.slice()]));

export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a) => Math.sqrt(dot(a, a));
export const cosine = (a, b) => { const n = norm(a) * norm(b); return n === 0 ? 0 : dot(a, b) / n; };
export const euclidean = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const scale = (a, k) => a.map((x) => x * k);

// Higher is more similar for every metric: Euclidean is shown as a distance
// but ranked smallest first.
export const METRICS = {
  cosine: { name: "Cosine similarity", fn: cosine, better: "higher", formula: "a·b / (|a| |b|)" },
  dot: { name: "Dot product", fn: dot, better: "higher", formula: "Σ aᵢ bᵢ" },
  euclidean: { name: "Euclidean distance", fn: euclidean, better: "lower", formula: "√Σ (aᵢ − bᵢ)²" },
};

export function rank(query, candidates, metric = "cosine") {
  const m = METRICS[metric];
  return candidates.map(([word, v]) => ({ word, score: m.fn(query, v) }))
    .sort((x, y) => (m.better === "higher" ? y.score - x.score : x.score - y.score) || (x.word < y.word ? -1 : 1));
}

// --- PCA by power iteration ------------------------------------------------------

export function pca(rows, k = 2) {
  const n = rows.length, d = rows[0].length;
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
  const X = rows.map((r) => sub(r, mean));
  const C = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)));
  const total = C.reduce((s, row, i) => s + row[i], 0);
  const comps = [], values = [];
  let M = C.map((r) => r.slice());
  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: d }, (_, i) => 1 / Math.sqrt(d) + i * 1e-3);
    let lambda = 0;
    for (let it = 0; it < 500; it++) {
      const w = M.map((row) => dot(row, v));
      const len = norm(w);
      if (len < 1e-12) break;
      const next = scale(w, 1 / len);
      lambda = len;
      const diff = euclidean(next, v);
      v = next;
      if (diff < 1e-12) break;
    }
    // A fixed sign, so the picture doesn't flip between runs.
    const big = v.reduce((bi, x, i) => (Math.abs(x) > Math.abs(v[bi]) ? i : bi), 0);
    if (v[big] < 0) v = scale(v, -1);
    comps.push(v);
    values.push(lambda);
    M = M.map((row, i) => row.map((x, j) => x - lambda * v[i] * v[j]));
  }
  const project = (r) => comps.map((c) => dot(sub(r, mean), c));
  return { mean, components: comps, values, explained: values.map((l) => (total ? l / total : 0)), project, points: rows.map(project), covariance: C };
}

// --- Step traces ------------------------------------------------------------------

const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(3));

export const NEIGHBOUR_CODE = [
  "q ← vector of the query word",
  "for each other word w",
  "  s ← score(q, v_w)  // cosine, dot or distance",
  "  keep w if it is among the best k so far",
  "return the best k",
];

export function neighbours(word, { metric = "cosine", k = 5, vocab = VECTORS } = {}) {
  const q = vocab[word];
  const m = METRICS[metric];
  const others = Object.entries(vocab).filter(([w]) => w !== word);
  const steps = [{ line: 1, vars: { query: word, metric: m.name, k }, scored: [], best: [], note: `Look up "${word}": [${q.map((x) => x.toFixed(2)).join(", ")}].` }];
  const scored = [];
  for (const [w, v] of others) {
    const score = m.fn(q, v);
    scored.push({ word: w, score });
    const best = rank(q, others.filter(([x]) => scored.some((s) => s.word === x)), metric).slice(0, k);
    const inTop = best.some((b) => b.word === w);
    steps.push({ line: inTop ? [3, 4] : 3, vars: { w, score: Number(score.toFixed(3)), "best so far": best.map((b) => b.word) }, current: w, scored: scored.slice(), best, note: `${m.name} with "${w}" = ${fmt(score)}.${inTop ? ` It makes the top ${k}.` : ""}` });
  }
  const best = rank(q, others, metric).slice(0, k);
  steps.push({ line: 5, vars: { result: best.map((b) => b.word) }, scored, best, final: true, note: `Nearest ${k} by ${m.name.toLowerCase()}: ${best.map((b) => `${b.word} (${fmt(b.score)})`).join(", ")}.` });
  return { query: q, best, steps };
}

export const ANALOGY_CODE = [
  "a is to b as c is to ?",
  "t ← v_b − v_a + v_c  // move c the way a moved to b",
  "for each word w not in {a, b, c}",
  "  s ← score(t, v_w)",
  "return the best w",
];

export function analogy(a, b, c, { metric = "cosine", vocab = VECTORS } = {}) {
  const t = add(sub(vocab[b], vocab[a]), vocab[c]);
  const others = Object.entries(vocab).filter(([w]) => ![a, b, c].includes(w));
  const ranked = rank(t, others, metric);
  const steps = [
    { line: 1, vars: { a, b, c }, target: null, note: `${a} is to ${b} as ${c} is to what?` },
    { line: 2, vars: { "b − a": sub(vocab[b], vocab[a]).map((x) => Number(x.toFixed(2))), target: t.map((x) => Number(x.toFixed(2))) }, target: t, note: `Take the step from ${a} to ${b} and apply it to ${c}: t = ${b} − ${a} + ${c}.` },
    { line: [3, 4], vars: { candidates: others.length }, target: t, ranked: ranked.slice(0, 5), note: `Score every other word against t. The three input words are left out, as most analogy tests do, because t is often closest to ${c} itself.` },
    { line: 5, vars: { answer: ranked[0].word, score: Number(ranked[0].score.toFixed(3)) }, target: t, ranked: ranked.slice(0, 5), final: true, note: `Answer: ${ranked[0].word} (${METRICS[metric].name.toLowerCase()} ${fmt(ranked[0].score)}).${metric === "cosine" && ranked[0].score > 0.999 ? " A perfect match only because these vectors were made by hand to line up; with learned vectors t lands near the answer, not on it." : ""}` },
  ];
  return { target: t, answer: ranked[0].word, ranked, steps };
}

// --- Semantic search over sentences (bag of vectors) --------------------------------

export const SENTENCES = [
  "the king and queen live in the palace",
  "a kitten and a puppy play on the farm",
  "the cat sleeps in the kitchen",
  "fresh bread and cake for the school",
  "the boy gives milk to his dog",
  "a lion is no pet for a girl",
];

export const words = (text) => text.toLowerCase().match(/[a-z]+/g) ?? [];

// Mean of the vectors of known words; unknown words are skipped.
export function sentenceVector(text, vocab = VECTORS) {
  const known = words(text).filter((w) => vocab[w]);
  if (!known.length) return { vector: AXES.map(() => 0), known };
  const sum = known.reduce((s, w) => add(s, vocab[w]), AXES.map(() => 0));
  return { vector: scale(sum, 1 / known.length), known };
}

export const SEARCH_CODE = [
  "q ← mean of the vectors of the query's known words",
  "for each sentence s",
  "  v_s ← mean of the vectors of its known words",
  "  score ← cosine(q, v_s)",
  "sort sentences by score, best first",
];

export function search(query, sentences = SENTENCES, vocab = VECTORS) {
  const q = sentenceVector(query, vocab);
  const steps = [{ line: 1, vars: { "known words": q.known }, scores: [], note: q.known.length ? `Query words with a vector: ${q.known.join(", ")}. Their average is the query vector.` : "None of the query words are in the vocabulary, so the query vector is all zeros and every score is 0." }];
  const scores = [];
  sentences.forEach((s, i) => {
    const v = sentenceVector(s, vocab);
    const score = cosine(q.vector, v.vector);
    scores.push({ i, text: s, score, known: v.known });
    steps.push({ line: [3, 4], current: i, vars: { sentence: i + 1, "known words": v.known, score: Number(score.toFixed(3)) }, scores: scores.slice(), note: `Sentence ${i + 1}: average of ${v.known.join(", ")}; cosine with the query = ${fmt(score)}.` });
  });
  const ranked = [...scores].sort((a, b) => b.score - a.score || a.i - b.i);
  steps.push({ line: 5, vars: { order: ranked.map((r) => r.i + 1) }, scores, ranked, final: true, note: `Best match: "${ranked[0].text}". Averaging throws away word order, so "dog bites man" and "man bites dog" get the same vector.` });
  return { query: q, ranked, steps };
}
