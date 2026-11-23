// Scaled dot-product attention on a short sentence, small enough to check by
// hand. Word vectors and the Wq, Wk, Wv matrices are made from a fixed seed
// and rounded to one decimal place; in a trained model they are learned.
// A real layer also has an output projection Wo after the heads are joined,
// plus residual connections and normalisation; those are left out here.

export const D_MODEL = 4;

export function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) | 0, 7);
const r1 = (x) => Math.round(x * 10) / 10;
const randMatrix = (r, rows, cols) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => r1(r() * 2 - 1)));

export const embed = (word) => randMatrix(seeded(hash(word.toLowerCase())), 1, D_MODEL)[0];

// Sinusoidal positions from the original Transformer paper, rounded.
export const position = (pos, d = D_MODEL) => Array.from({ length: d }, (_, j) => {
  const angle = pos / 10000 ** ((2 * Math.floor(j / 2)) / d);
  return r1(j % 2 === 0 ? Math.sin(angle) : Math.cos(angle));
});

export const WEIGHTS = (() => {
  const r = seeded(2017);
  return { Wq: randMatrix(r, D_MODEL, D_MODEL), Wk: randMatrix(r, D_MODEL, D_MODEL), Wv: randMatrix(r, D_MODEL, D_MODEL) };
})();

export const matmul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, x, k) => s + x * B[k][j], 0)));
export const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

export function softmax(row) {
  const max = Math.max(...row);
  if (max === -Infinity) return row.map(() => 1 / row.length);
  const e = row.map((x) => Math.exp(x - max));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export const tokensOf = (text) => text.trim().split(/\s+/).filter(Boolean).slice(0, 8);

export const CODE = [
  "X ← word vectors (+ positions)",
  "Q ← X·Wq;  K ← X·Wk;  V ← X·Wv",
  "for each query row i",
  "  s[i][j] ← Q[i]·K[j] / √d  for every j",
  "  if causal: s[i][j] ← −∞ for j > i  // no peeking ahead",
  "  w[i] ← softmax(s[i])  // each row sums to 1",
  "  out[i] ← Σⱼ w[i][j] · V[j]",
  "join the heads' outputs side by side",
];

export function attend(text, { causal = false, heads = 1, positions = true } = {}) {
  const tokens = tokensOf(text);
  if (!tokens.length) throw new Error("Type at least one word.");
  const X = tokens.map((t, i) => (positions ? embed(t).map((x, j) => r1(x + position(i)[j])) : embed(t)));
  const Q = matmul(X, WEIGHTS.Wq), K = matmul(X, WEIGHTS.Wk), V = matmul(X, WEIGHTS.Wv);
  const n = tokens.length, dk = D_MODEL / heads;
  const steps = [
    { line: 1, phase: "x", head: 0, row: -1, vars: { tokens: n, d: D_MODEL, positions }, note: `${n} tokens, each a ${D_MODEL}-number vector${positions ? " with a position signal added, so the two copies of a repeated word differ" : ". Without positions, repeated words get identical rows and attention can't tell word order"}.` },
    { line: 2, phase: "qkv", head: 0, row: -1, vars: { "Q, K, V": `${n} × ${D_MODEL}`, heads, "d per head": dk }, note: `Three learned matrices turn each token into a query (what am I looking for?), a key (what do I offer?) and a value (what do I pass on?).${heads > 1 ? ` With ${heads} heads, each head gets its own ${dk} columns of Q, K and V.` : ""}` },
  ];
  const headResults = [];
  for (let hd = 0; hd < heads; hd++) {
    const cols = (M) => M.map((row) => row.slice(hd * dk, (hd + 1) * dk));
    const q = cols(Q), k = cols(K), v = cols(V);
    const raw = matmul(q, transpose(k)).map((row) => row.map((x) => x / Math.sqrt(dk)));
    const scores = raw.map((row, i) => row.map((x, j) => (causal && j > i ? -Infinity : x)));
    const weights = scores.map(softmax);
    const out = weights.map((w) => v[0].map((_, c) => w.reduce((s, wj, j) => s + wj * v[j][c], 0)));
    headResults.push({ q, k, v, raw, scores, weights, out });
    for (let i = 0; i < n; i++) {
      const who = `"${tokens[i]}"`;
      const label = heads > 1 ? `Head ${hd + 1}: ${who}` : who;
      steps.push({ line: [3, 4], phase: "score", head: hd, row: i, vars: { i, token: tokens[i], "s[i]": raw[i].map((x) => Number(x.toFixed(2))), "√d": Number(Math.sqrt(dk).toFixed(3)) },
        note: `${label} compares its query with every key. Dividing by √${dk} keeps the scores from growing with the vector size, which would make softmax too peaky.` });
      if (causal && i < n - 1) steps.push({ line: 5, phase: "mask", head: hd, row: i, vars: { i, masked: n - 1 - i }, note: `${label} may not look at the ${n - 1 - i} later token${n - 1 - i === 1 ? "" : "s"}: their scores become −∞, so softmax gives them weight 0. This is what lets a model learn to predict the next word.` });
      const best = weights[i].reduce((b, x, j) => (x > weights[i][b] ? j : b), 0);
      steps.push({ line: 6, phase: "softmax", head: hd, row: i, vars: { i, "w[i]": weights[i].map((x) => Number(x.toFixed(3))), sum: Number(weights[i].reduce((a, b) => a + b, 0).toFixed(3)) },
        note: `Softmax turns the scores for ${label} into weights that are all positive and add up to 1. It attends most to "${tokens[best]}" (${(weights[i][best] * 100).toFixed(1)}%).` });
      steps.push({ line: 7, phase: "out", head: hd, row: i, vars: { i, "out[i]": out[i].map((x) => Number(x.toFixed(2))) }, note: `The output for ${label} is the weighted average of the value rows: a blend of what the tokens it attends to pass on.` });
    }
  }
  const output = tokens.map((_, i) => headResults.flatMap((r) => r.out[i]));
  if (heads > 1) steps.push({ line: 8, phase: "concat", head: heads - 1, row: n - 1, vars: { "output size": `${n} × ${D_MODEL}` }, final: true, note: `Each head's ${dk}-number outputs are placed side by side to give ${D_MODEL} numbers per token again. The heads can attend in different patterns; a real layer then mixes them with an output matrix Wo.` });
  else steps.at(-1).final = true;
  return { tokens, X, Q, K, V, dk, heads: headResults, output, causal, steps };
}

// Practice: one query against a few keys, small whole numbers.
export function weightQuestion(r) {
  const n = 3, d = 2;
  const int = () => Math.floor(r() * 5) - 2;
  const q = [int(), int()];
  if (q[0] === 0 && q[1] === 0) q[0] = 1;
  const K = Array.from({ length: n }, () => [int(), int()]);
  const scores = K.map((k) => (q[0] * k[0] + q[1] * k[1]) / Math.sqrt(d));
  const weights = softmax(scores);
  const j = Math.floor(r() * n);
  return { q, K, d, j, scores, weights, answer: weights[j] };
}
