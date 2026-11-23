// Choosing the next token from a model's scores (logits). The logits here are
// made up for one prompt; a real model produces one for every token in a
// vocabulary of tens of thousands.
//
// Order of operations (libraries differ; this is a common one):
// repetition penalty → temperature → top-k → softmax → top-p → renormalise → draw.
// - Repetition penalty p (as in the CTRL paper): for a token already in the
//   context, a positive logit is divided by p and a negative one multiplied by p.
// - Temperature 0 means greedy: always take the highest score.
// - top-k = 0 and top-p = 1 switch those filters off.
// - top-p keeps the smallest set of most likely tokens whose probabilities add
//   up to at least p (always at least one token).
// - The draw walks tokens from most to least likely, adding probabilities
//   until the running total passes a random number r in [0, 1).

import { seeded } from "./attention.js";

export const PROMPT = "the cat sat on the";
export const CONTEXT = ["the", "cat", "sat", "on"];
export const CANDIDATES = [
  { token: "mat", logit: 3.1 },
  { token: "floor", logit: 2.7 },
  { token: "sofa", logit: 2.4 },
  { token: "bed", logit: 2.0 },
  { token: "cat", logit: 1.8 },
  { token: "roof", logit: 1.3 },
  { token: "the", logit: 1.0 },
  { token: "chair", logit: 0.9 },
  { token: "moon", logit: -0.4 },
  { token: "banana", logit: -1.6 },
];

export function softmax(xs, T = 1) {
  const live = xs.filter((x) => x !== -Infinity);
  if (!live.length) return xs.map(() => 0);
  const m = Math.max(...live);
  const e = xs.map((x) => (x === -Infinity ? 0 : Math.exp((x - m) / T)));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export const entropy = (ps) => -ps.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);

export const penalise = (logit, p) => (logit > 0 ? logit / p : logit * p);

// Indices of the top-p (nucleus) set, most likely first.
export function nucleus(probs, p) {
  const order = probs.map((x, i) => i).filter((i) => probs[i] > 0).sort((a, b) => probs[b] - probs[a] || a - b);
  const keep = [];
  let total = 0;
  for (const i of order) {
    keep.push(i);
    total += probs[i];
    if (total >= p - 1e-12) break;
  }
  return keep;
}

export function topK(values, k) {
  if (!k || k >= values.length) return values.map((_, i) => i);
  return values.map((x, i) => i).sort((a, b) => values[b] - values[a] || a - b).slice(0, k);
}

export const CODE = [
  "z ← the model's logits for every token",
  "for each token already in the context: penalise z",
  "if T = 0 then return the token with the highest z  // greedy",
  "z ← z / T  // T < 1 sharpens, T > 1 flattens",
  "keep the k highest z; set the rest to −∞  // top-k",
  "P ← softmax(z) = eᶻ / Σ eᶻ",
  "keep the most likely tokens until their P adds up to p  // top-p",
  "renormalise P so it adds up to 1",
  "r ← random in [0, 1); walk P from the top until the total passes r",
];

const r3 = (x) => Number(x.toFixed(3));

export function run(candidates = CANDIDATES, { temperature = 1, k = 0, p = 1, penalty = 1, context = CONTEXT, seed = 6 } = {}) {
  const tokens = candidates.map((c) => c.token);
  const raw = candidates.map((c) => c.logit);
  const steps = [];
  const base = softmax(raw);
  steps.push({ line: 1, kind: "logit", values: raw, removed: [], vars: { tokens: tokens.length, "max z": Math.max(...raw) }, note: `The model scores every possible next token after "${PROMPT}". Scores are unbounded; only their differences matter.` });
  const pen = raw.map((z, i) => (context.includes(tokens[i]) ? penalise(z, penalty) : z));
  const hit = tokens.filter((t, i) => context.includes(t));
  steps.push({ line: 2, kind: "logit", values: pen, before: raw, removed: [], vars: { penalty, "penalised": hit }, note: penalty === 1 ? "Repetition penalty is 1, so nothing changes." : `${hit.join(" and ")} already appear in the prompt, so their scores are pushed down (penalty ${penalty}). This discourages loops like "the the the".` });
  if (temperature === 0) {
    const best = pen.reduce((b, z, i) => (z > pen[b] ? i : b), 0);
    const probs = pen.map((_, i) => (i === best ? 1 : 0));
    steps.push({ line: 3, kind: "prob", values: probs, removed: tokens.map((_, i) => i).filter((i) => i !== best), chosen: best, final: true, vars: { chosen: tokens[best] }, note: `Temperature 0 means greedy decoding: "${tokens[best]}" has the highest score, so it is chosen every time. Same prompt, same answer.` });
    return { tokens, raw, final: probs, chosen: best, r: null, entropy: 0, baseEntropy: entropy(base), steps };
  }
  const scaled = pen.map((z) => z / temperature);
  steps.push({ line: 4, kind: "logit", values: scaled, before: pen, removed: [], vars: { T: temperature }, note: temperature === 1 ? "Temperature 1 leaves the scores as they are." : temperature < 1 ? `Dividing by T = ${temperature} stretches the gaps between scores, so after softmax the favourite gets even more of the probability.` : `Dividing by T = ${temperature} squeezes the scores together, so after softmax unlikely tokens get a bigger share.` });
  const keptK = topK(scaled, k);
  const afterK = scaled.map((z, i) => (keptK.includes(i) ? z : -Infinity));
  const removedK = tokens.map((_, i) => i).filter((i) => !keptK.includes(i));
  steps.push({ line: 5, kind: "logit", values: afterK, removed: removedK, vars: { k: k || "off", kept: keptK.length }, note: k && k < tokens.length ? `Top-k keeps only the ${k} highest scores. The other ${removedK.length} can never be picked.` : "Top-k is off, so every token stays in." });
  const probs = softmax(afterK);
  steps.push({ line: 6, kind: "prob", values: probs, removed: removedK, vars: { "P(top)": r3(Math.max(...probs)), entropy: r3(entropy(probs)) }, note: `Softmax turns scores into probabilities that add up to 1. Entropy ${entropy(probs).toFixed(2)} bits: 0 would mean certain; log₂(${keptK.length}) = ${Math.log2(keptK.length).toFixed(2)} would mean all ${keptK.length} equally likely.` });
  const keptP = nucleus(probs, p);
  let cum = 0;
  const cumul = keptP.map((i) => (cum += probs[i]));
  const removedP = tokens.map((_, i) => i).filter((i) => !keptP.includes(i));
  steps.push({ line: 7, kind: "prob", values: probs, removed: removedP, nucleus: keptP, vars: { p, kept: keptP.map((i) => tokens[i]), "mass kept": r3(cumul.at(-1)) }, note: p < 1 ? `Top-p = ${p}: add up probabilities from the top (${keptP.map((i, j) => `${tokens[i]} ${cumul[j].toFixed(2)}`).join(", ")}) and stop once the total reaches ${p}. ${keptP.length} token${keptP.length === 1 ? " survives" : "s survive"}.` : "Top-p is 1, so nothing is cut." });
  const mass = keptP.reduce((s, i) => s + probs[i], 0);
  const final = probs.map((x, i) => (keptP.includes(i) ? x / mass : 0));
  steps.push({ line: 8, kind: "prob", values: final, removed: removedP, vars: { entropy: r3(entropy(final)) }, note: `Share the cut-off probability back among the survivors so they add up to 1 again. Entropy is now ${entropy(final).toFixed(2)} bits (it was ${entropy(base).toFixed(2)} for the raw scores).` });
  const r = seeded(seed)();
  const order = final.map((_, i) => i).filter((i) => final[i] > 0).sort((a, b) => final[b] - final[a] || a - b);
  let total = 0, chosen = order.at(-1);
  for (const i of order) { total += final[i]; if (r < total) { chosen = i; break; } }
  steps.push({ line: 9, kind: "prob", values: final, removed: removedP, chosen, r, final: true, vars: { seed, r: r3(r), chosen: tokens[chosen] }, note: `The random number is r = ${r.toFixed(3)} (seed ${seed}). Walking down the list, the running total first passes r at "${tokens[chosen]}", so that is the next token. Change the seed to draw again.` });
  return { tokens, raw, final, chosen, r, entropy: entropy(final), baseEntropy: entropy(base), steps };
}

// Draw n times with seeds seed, seed + 1, ... and count each token.
export function draws(candidates, opts, n = 100) {
  const counts = candidates.map(() => 0);
  for (let s = 0; s < n; s++) counts[run(candidates, { ...opts, seed: (opts.seed ?? 6) * 1000 + s }).chosen]++;
  return counts;
}
