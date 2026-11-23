// The KV cache: prefill vs decode, what gets recomputed without a cache, how
// much memory the cache takes, and a rough time estimate.
//
// Counting conventions:
// - "K/V rows" = token positions whose key and value vectors are computed, per layer.
// - "scores" = query·key dot products, per head per layer, with a causal mask
//   (position i looks at positions 0..i).
// - Step 0 is prefill: the whole prompt goes through at once and the first new
//   token comes out. Step s ≥ 1 is a decode step on a sequence of P + s tokens.
// - Without a cache, every step recomputes K and V for every token so far.
//
// Time is a rough "roofline" estimate, not a benchmark: a step takes whichever
// is longer, doing the arithmetic (about 2 × parameters floating-point
// operations per token) or reading the weights and cache from memory once.
// Real servers batch requests, overlap work and use special kernels.

export const PRESETS = {
  tiny: { name: "Tiny teaching model", layers: 2, heads: 2, kvHeads: 2, headDim: 4, bytes: 2, params: 0.0001 },
  mha7b: { name: "7B-class shape (32 layers, 32 heads, no GQA)", layers: 32, heads: 32, kvHeads: 32, headDim: 128, bytes: 2, params: 7 },
  gqa8b: { name: "8B-class shape with GQA (8 KV heads)", layers: 32, heads: 32, kvHeads: 8, headDim: 128, bytes: 2, params: 8 },
  big70b: { name: "70B-class shape with GQA", layers: 80, heads: 64, kvHeads: 8, headDim: 128, bytes: 2, params: 70 },
};

export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;

// Bytes of cache per token: K and V, for every layer and KV head.
export const bytesPerToken = ({ layers, kvHeads, headDim, bytes }) => 2 * layers * kvHeads * headDim * bytes;
export const cacheBytes = (shape, tokens) => bytesPerToken(shape) * tokens;

const tri = (n) => (n * (n + 1)) / 2;

export const CODE_CACHE = [
  "prefill: run all P prompt tokens through the model together",
  "  store K and V of every prompt token in the cache",
  "  sample token 1  // time to first token ends here",
  "for each later token",
  "  compute q, k, v for the newest token only",
  "  append k, v to the cache",
  "  attend q over every cached K and V",
  "  sample the next token",
];
export const CODE_NOCACHE = [
  "for each new token",
  "  run the whole sequence so far through the model",
  "  compute K and V for every token again",
  "  attend every position over the ones before it",
  "  sample the next token from the last position",
  "  append it to the sequence",
];

export function simulate({ shape = PRESETS.tiny, prompt = 6, generate = 6, context = 16, cache = true, bandwidth = 1000, tflops = 100 } = {}) {
  const fits = Math.max(0, Math.min(generate, context - prompt));
  const truncated = fits < generate;
  const perTok = bytesPerToken(shape);
  const weightBytes = shape.params * 1e9 * shape.bytes;
  const flopsPerToken = 2 * shape.params * 1e9;
  const steps = [];
  const totals = { rows: 0, scores: 0, time: 0 };
  const totalsOther = { rows: 0, scores: 0 };
  for (let s = 0; s < fits; s++) {
    const len = prompt + s;
    const newRows = cache ? (s === 0 ? prompt : 1) : len;
    const scores = cache ? (s === 0 ? tri(prompt) : len) : tri(len);
    const otherRows = !cache ? (s === 0 ? prompt : 1) : len;
    const otherScores = !cache ? (s === 0 ? tri(prompt) : len) : tri(len);
    const mem = cache ? len * perTok : 0;
    const computeT = (flopsPerToken * newRows) / (tflops * 1e12);
    const memT = (weightBytes + (cache ? (s === 0 ? 0 : (len - 1) * perTok) : 0)) / (bandwidth * 1e9);
    const time = Math.max(computeT, memT);
    totals.rows += newRows; totals.scores += scores; totals.time += time;
    totalsOther.rows += otherRows; totalsOther.scores += otherScores;
    const prefill = s === 0;
    const line = cache ? (prefill ? [1, 2, 3] : [5, 6, 7, 8]) : [2, 3, 4, 5];
    steps.push({
      s, len, prefill, newRows, scores, mem, time, bound: computeT >= memT ? "compute" : "memory", line,
      vars: { step: prefill ? "prefill" : `decode ${s}`, "sequence": len, "new K/V rows": newRows, "scores / head": scores, "cache": cache ? `${len} tokens` : "none" },
      note: prefill
        ? `Prefill: all ${prompt} prompt tokens go through together. ${cache ? `Their K and V are kept in the cache (${fmtBytes(prompt * perTok)}).` : "Nothing is kept."} The first new token comes out at the end, so this step sets the time to first token. Lots of tokens at once means it is limited by arithmetic.`
        : cache
          ? `Decode ${s}: only the newest token is computed. Its query reads all ${len} cached keys, and its k, v are appended. Reading the weights${s > 0 ? " and cache" : ""} from memory dominates, so this step is memory-bound.`
          : `Decode ${s} without a cache: all ${len} tokens are pushed through again, recomputing ${len} K/V rows and ${tri(len)} scores per head, though only the last position's output is used.`,
    });
  }
  return {
    steps, fits, truncated, perTok, totals, totalsOther,
    ttft: steps[0]?.time ?? 0,
    decodeRate: steps.length > 1 ? (steps.length - 1) / steps.slice(1).reduce((s, x) => s + x.time, 0) : 0,
    finalMem: cache && steps.length ? steps.at(-1).mem : 0,
  };
}

// Closed forms for the whole run (used by practice and checked by tests).
export function rowsComputed(P, G, cache) {
  if (G <= 0) return 0;
  return cache ? P + (G - 1) : G * P + tri(G - 1);
}

export function fmtBytes(b) {
  if (b >= GiB) return `${(b / GiB).toFixed(2)} GiB`;
  if (b >= MiB) return `${(b / MiB).toFixed(2)} MiB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KiB`;
  return `${b} B`;
}
