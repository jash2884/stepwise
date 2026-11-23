// Item difficulty and learner ability, IRT style, learnt online with Elo-type
// updates (Pelánek, "Applications of the Elo rating system in adaptive
// educational systems", 2016). Kept on this device in the learning store.
//
// Model: the chance of a right answer to item i is a three-parameter logistic
//   P = c + (1 − c) · σ(θ + δ_topic − b_i)
// where θ is the learner's overall ability, δ_topic their offset on this
// topic, b_i the item's difficulty and c the format's guess floor. An "item"
// is a question template: topic, format and marks (the generators make
// endless questions per template, so difficulty is learnt per template).
// After an answer y (1 right, 0 wrong) each estimate moves by K · (y − P),
// with K shrinking as that estimate sees more data (uncertainty function
// K(n) = K0 / (1 + n / n0), never below a floor so it can still track change).
//
// Adaptive selection: questions whose predicted success is 0.6 to 0.75 are
// the most useful to practise. An answer tells us most when success is near
// 0.5 (and a little higher once a guess floor is allowed for), but a learner
// who fails half the time gives up, so the band sits just above that: hard
// enough to learn from, easy enough to keep going. The next question is
// picked at random among candidates in the band.

export const GUESS_FLOOR = { mcq: 0.25, msq: 0.05, nat: 0 };
const DEFAULT_FLOOR = 0.1;
export const BAND = [0.6, 0.75];

const sigma = (x) => 1 / (1 + Math.exp(-x));
const K = (k0, n0, floor) => (n) => Math.max(floor, k0 / (1 + n / n0));
export const K_GLOBAL = K(0.3, 50, 0.05), K_TOPIC = K(0.6, 12, 0.1), K_ITEM = K(0.4, 20, 0.05);

export const itemKey = (topic, type, marks) => `${topic}|${type ?? "?"}|${marks ?? 1}`;

// Starting difficulty of a template before any data: two-mark questions and
// formats without options start harder.
export function baseDifficulty(type, marks = 1) {
  return (marks >= 2 ? 0.4 : 0) + (type === "nat" ? 0.3 : type === "msq" ? 0.4 : 0);
}

export function empty() {
  return { g: { v: 0, n: 0 }, d: {}, b: {} };
}

// Clean up whatever was stored (or nothing).
export function clean(raw) {
  const out = empty();
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const est = (x) => ({ v: Math.max(-6, Math.min(6, num(x?.v))), n: Math.max(0, num(x?.n)) });
  if (raw && typeof raw === "object") {
    out.g = est(raw.g);
    for (const [k, v] of Object.entries(raw.d ?? {})) out.d[k] = est(v);
    for (const [k, v] of Object.entries(raw.b ?? {})) out.b[k] = est(v);
  }
  return out;
}

export function predict(elo, { topic, type, marks }) {
  const c = GUESS_FLOOR[type] ?? DEFAULT_FLOOR;
  const b = elo.b[itemKey(topic, type, marks)]?.v ?? baseDifficulty(type, marks);
  const theta = elo.g.v + (elo.d[topic]?.v ?? 0);
  return c + (1 - c) * sigma(theta - b);
}

// One answer. Mutates and returns elo.
export function update(elo, { topic, type, marks, correct }) {
  const p = predict(elo, { topic, type, marks });
  const err = (correct ? 1 : 0) - p;
  const key = itemKey(topic, type, marks);
  const d = (elo.d[topic] ??= { v: 0, n: 0 });
  const b = (elo.b[key] ??= { v: baseDifficulty(type, marks), n: 0 });
  elo.g.v += K_GLOBAL(elo.g.n) * err; elo.g.n++;
  d.v += K_TOPIC(d.n) * err; d.n++;
  b.v -= K_ITEM(b.n) * err; b.n++;
  return elo;
}

// Rebuild from a list of stored answers ({ t, c, ty, m }), oldest first.
export function replay(answers) {
  const elo = empty();
  for (const a of answers) update(elo, { topic: a.t, type: a.ty, marks: a.m, correct: a.c });
  return elo;
}

// Pick one candidate ({ p, ... }) for practice: at random among those whose
// predicted success is inside the band; if none is, the closest to the
// band's middle (random among near-ties). A small share of picks (explore)
// ignores the band, so formats the model rates too hard or too easy still
// come up and their difficulty keeps being learnt.
// rnd: a () => [0, 1) function.
export const EXPLORE = 0.15;
export function pickAdaptive(cands, rnd = Math.random, { band: [lo, hi] = BAND, explore = EXPLORE } = {}) {
  if (!cands.length) return null;
  if (rnd() < explore) return cands[Math.floor(rnd() * cands.length)];
  const inBand = cands.filter((c) => c.p >= lo && c.p <= hi);
  if (inBand.length) return inBand[Math.floor(rnd() * inBand.length)];
  const mid = (lo + hi) / 2;
  const best = Math.min(...cands.map((c) => Math.abs(c.p - mid)));
  const near = cands.filter((c) => Math.abs(c.p - mid) <= best + 0.03);
  return near[Math.floor(rnd() * near.length)];
}
