// The mistake doctor's reasoning: which misconception (if any) best explains
// a wrong answer. The diagnosis is computed, not guessed: each misconception
// in the library recomputes the answer with the engines, and Bayes' rule
// weighs how well each one explains what the learner actually answered.
// Pure functions over the question, the answer and the learning store's
// state; the panel that shows it is doctor-panel.js.
//
// Hypotheses for one wrong answer to question q:
//   - each misconception m for q's topic,
//   - "slip": the method was right but something small went wrong,
//   - "unknown": a mistake the library doesn't know.
// Likelihood of the response r:
//   m:        (1 − ε) · [r is one of m's k predicted answers] / k + ε · U(r)
//             (ε · U(r) when m predicts nothing here, or predicts the right answer)
//   slip:     NAT: 0.6 / NEAR when r is within 10% (or 1) of the answer, plus 0.4 · U;
//             MCQ, MSQ: U
//   unknown:  U
// where U is uniform over the wrong answers the format allows (3 for an MCQ,
// 2^k − 2 for an MSQ, NAT_SPACE plausible numbers for a NAT) and ε = 0.1 is
// how often someone holding a misconception still doesn't reproduce it
// exactly. The prior is a per-learner, per-topic Dirichlet: pseudo-count 1
// for every hypothesis (uniform, the usual uninformative choice) plus the
// posterior mass of every earlier diagnosis on that topic (soft counts, the
// expected-count update). So a learner who keeps making the same mistake is
// diagnosed with more confidence, and evidence is capped at MAX_EVIDENCE so
// the prior can still change.
// A misconception is claimed only when its posterior is at least CLAIM;
// otherwise the doctor says it couldn't tell.
import { misconceptionById, misconceptionsFor } from "./misconceptions/index.js";

export const EPSILON = 0.1, NAT_SPACE = 40, NEAR_SPACE = 10;
export const CLAIM = 0.5, SURE = 0.8;
export const ALPHA = 1, MAX_EVIDENCE = 20;
export const SLIP = "slip", UNKNOWN = "unknown";
export const OTHER_LABEL = { [SLIP]: "a slip in an otherwise right method", [UNKNOWN]: "a mistake the doctor doesn't know" };

export const covers = (topic) => misconceptionsFor(topic).length > 0;

export function sameAnswer(q, a, b) {
  if (a == null || b == null) return false;
  if (q.type === "nat") return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (q.tolerance ?? 0) + 1e-9;
  if (q.type === "mcq") return a === b;
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
}

export function wrongSpace(q) {
  if (q.type === "mcq") return Math.max(1, (q.options?.length ?? 4) - 1);
  if (q.type === "msq") return Math.max(1, 2 ** (q.options?.length ?? 4) - 2);
  return NAT_SPACE;
}

const isNear = (q, r) => q.type === "nat" && Number.isFinite(r) && Math.abs(r - q.answer) <= Math.max(1, 0.1 * Math.abs(q.answer));

// A misconception's predicted answers for q (a list; empty when it doesn't apply).
export function predictions(m, q) {
  let p;
  try { p = m.predict(q); } catch { return []; }
  if (p == null) return [];
  return (p.anyOf ?? [p]).filter((x) => x != null);
}

export function likelihood(q, response, preds) {
  const u = 1 / wrongSpace(q);
  const useful = preds.filter((p) => !sameAnswer(q, p, q.answer));
  if (!useful.length) return EPSILON * u;
  const hits = useful.filter((p) => sameAnswer(q, p, response)).length;
  return ((1 - EPSILON) * hits) / useful.length + EPSILON * u;
}

export function slipLikelihood(q, response) {
  const u = 1 / wrongSpace(q);
  if (q.type !== "nat") return u;
  return (isNear(q, response) ? 0.6 / NEAR_SPACE : 0) + 0.4 * u;
}

// Normalised Dirichlet prior mean for the topic's hypotheses.
export function prior(ids, counts = {}) {
  const a = ids.map((id) => ALPHA + Math.max(0, counts[id] ?? 0));
  const sum = a.reduce((x, y) => x + y, 0);
  return Object.fromEntries(ids.map((id, i) => [id, a[i] / sum]));
}

// The full diagnosis of one wrong answer.
//   { topic, posterior: [{ id, p, m? }] (largest first), best, claim (or null),
//     sure, predicted: { id: [answers] } }
export function diagnose(q, response, counts = {}) {
  const ms = misconceptionsFor(q.topic);
  const ids = [...ms.map((m) => m.id), SLIP, UNKNOWN];
  const pri = prior(ids, counts);
  const predicted = {};
  const lik = {};
  for (const m of ms) {
    predicted[m.id] = predictions(m, q);
    lik[m.id] = likelihood(q, response, predicted[m.id]);
  }
  lik[SLIP] = slipLikelihood(q, response);
  lik[UNKNOWN] = 1 / wrongSpace(q);
  const joint = ids.map((id) => pri[id] * lik[id]);
  const z = joint.reduce((a, b) => a + b, 0) || 1;
  const posterior = ids.map((id, i) => ({ id, p: joint[i] / z, m: ms.find((m) => m.id === id) ?? null })).sort((a, b) => b.p - a.p);
  const best = posterior[0];
  const claim = best.m && best.p >= CLAIM ? best : null;
  return { topic: q.topic, posterior, best, claim, sure: !!claim && claim.p >= SURE, predicted };
}

// Fold a diagnosis into the learner's counts for its topic (mutates counts).
export function addEvidence(counts, posterior) {
  for (const { id, p } of posterior) counts[id] = (counts[id] ?? 0) + p;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > MAX_EVIDENCE) for (const k of Object.keys(counts)) counts[k] *= MAX_EVIDENCE / total;
  for (const k of Object.keys(counts)) { counts[k] = Math.round(counts[k] * 1000) / 1000; if (counts[k] <= 0) delete counts[k]; }
  return counts;
}

// Compact posterior for the store: { id: p } for p >= 0.01.
export const compact = (d) => Object.fromEntries(d.posterior.filter((x) => x.p >= 0.01).map((x) => [x.id, Math.round(x.p * 1000) / 1000]));

// --- With the learning store ------------------------------------------------------------------

// Diagnose a wrong answer just given, add it to the learner's prior and keep
// the posterior on the mistake entry. Returns the diagnosis (made with the
// prior as it was before this answer), or null if the topic isn't covered.
export function learnFrom(s, q, response) {
  if (!covers(q.topic) || response == null || sameAnswer(q, response, q.answer)) return null;
  s.doctor ??= {};
  const counts = (s.doctor[q.topic] ??= {});
  const d = diagnose(q, response, counts);
  addEvidence(counts, d.posterior);
  const entry = s.mistakes?.find((m) => m.t === q.topic && m.s === q.seed);
  // Kept on the notebook entry when this is the answer saved there.
  if (entry && sameAnswer(q, entry.r, response)) entry.dx = compact(d);
  return d;
}

// Diagnose a saved mistake, leaving its own evidence out of the prior so it
// isn't counted twice.
export function diagnoseSaved(s, q, mistake) {
  if (!covers(q.topic) || mistake?.r == null) return null;
  const counts = { ...(s.doctor?.[q.topic] ?? {}) };
  for (const [id, p] of Object.entries(mistake.dx ?? {})) counts[id] = Math.max(0, (counts[id] ?? 0) - p);
  return diagnose(q, mistake.r, counts);
}

// The learner's most common misconceptions across topics: the evidence (soft
// count: the posterior mass summed over every diagnosed answer) behind each,
// and its share of all the evidence for that topic.
export function commonMistakes(s, limit = 5, minEvidence = 0.6) {
  const out = [];
  for (const [topic, counts] of Object.entries(s.doctor ?? {})) {
    const ms = misconceptionsFor(topic);
    if (!ms.length) continue;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const m of ms) {
      const n = counts[m.id] ?? 0;
      if (n >= minEvidence) out.push({ topic, id: m.id, label: m.label, evidence: n, share: n / total });
    }
  }
  return out.sort((a, b) => b.evidence - a.evidence || b.share - a.share).slice(0, limit);
}

// --- Links -------------------------------------------------------------------------------------------

// The question's replay opened at a given step (the stepper reads ?step=).
export function stepUrl(replay, step) {
  if (!step) return replay;
  const [path, hash] = replay.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}step=${step}${hash ? `#${hash}` : ""}`;
}

// A seed of the same topic where this misconception gives a different answer
// from the right one, so a question built from it tests exactly that mistake.
export function targetSeed(topic, id, generate, { start = Math.floor(Math.random() * 1e9), tries = 60 } = {}) {
  const m = misconceptionById(topic, id);
  if (!m) return null;
  for (let i = 0; i < tries; i++) {
    const seed = (start + i * 7919) % 1e9;
    let q;
    try { q = generate(topic, seed); } catch { continue; }
    if (predictions(m, q).some((p) => !sameAnswer(q, p, q.answer))) return seed;
  }
  return null;
}

// The step of the replay where the mistaken run first differs, if known.
export function stepOf(m, q) {
  try { return m.step?.(q) ?? null; } catch { return null; }
}

export function explanationOf(m, q) {
  try { return m.explain(q) || ""; } catch { return ""; }
}

export const percent = (p) => Math.max(1, Math.min(99, Math.round(p * 100)));

// The headline sentence, without any AI.
export function verdict(d) {
  if (!d) return "";
  if (d.claim) return `${d.sure ? "Looks like you" : "This might be because you"} ${d.claim.m.label} (${percent(d.claim.p)}% sure).`;
  return "The doctor couldn't tell what went wrong here: your answer doesn't match any mistake it knows well enough to say.";
}
