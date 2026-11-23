// Bayesian Knowledge Tracing (Corbett and Anderson, 1995), one skill per GATE
// topic. The learner either knows the topic or doesn't; each answer is noisy
// evidence about which:
//   P(L0)  prior that the topic is already known before any practice
//   P(T)   chance of learning it from one practice opportunity
//   P(G)   chance of a right answer without knowing it (a guess)
//   P(S)   chance of a wrong answer while knowing it (a slip)
// After an answer, Bayes' rule gives P(known | answer), then the learning step
// adds P(T) of the remaining mass. Pure functions, no storage.
//
// Parameters, and why:
// - L0 = 0.1: most visitors are preparing, not revising, so a topic starts
//   unknown; 0.1 leaves room for someone who already knows it to get there
//   in three or four answers.
// - T = 0.1: GATE topics are procedures that take a few worked attempts to
//   stick; 0.1 is in the usual fitted range (0.05 to 0.2).
// - Guess depends on the format. An MCQ has four options and the distractors
//   can often be eliminated, so 0.3. An MSQ must match every option exactly
//   (1 in 15 by luck, more with partial knowledge): 0.18. A NAT needs the exact
//   number, but "not known" in BKT includes partial knowledge that still gets
//   simple cases right, so 0.15 rather than near 0. Unknown format (answers
//   saved before formats were recorded): 0.22, between the two.
// - Slip: 0.1 for MCQ; 0.12 for MSQ and NAT, which need several exact steps
//   (one arithmetic slip loses the whole answer). Two-mark questions are
//   longer, so they get 0.03 more.
// - Mastered when P(known) >= 0.95, the threshold Corbett and Anderson used.
//   With these values that takes 3 right NAT answers in a row from scratch,
//   4 or 5 MCQs (two-mark ones need 5), and a single wrong answer drops a mastered topic back below the
//   line until the learner shows it again: about the same bar as the old rule
//   (5 answers, 80% of the last 10) for a careful learner, but it reacts to
//   order (recent answers matter more) and to the format's guess rate.

export const L0 = 0.1, T = 0.1;
// Classic BKT never forgets, so after a long run of right answers even three
// wrong ones in a row barely move it. Capping the belief at 0.99 before each
// update leaves room for that: a run of fresh mistakes still counts.
export const CEILING = 0.99;
export const MASTERED = 0.95;
// Weak: practised at least 3 times and still under 70% likely to be known.
export const WEAK = 0.7;
export const GUESS = { mcq: 0.3, msq: 0.18, nat: 0.15 };
export const SLIP = { mcq: 0.1, msq: 0.12, nat: 0.12 };
const DEFAULT_GUESS = 0.22, DEFAULT_SLIP = 0.1;

export function params(type, marks = 1) {
  const g = GUESS[type] ?? DEFAULT_GUESS;
  const s = (SLIP[type] ?? DEFAULT_SLIP) + (marks >= 2 && SLIP[type] ? 0.03 : 0);
  return { g, s, t: T };
}

// One observation: P(known) before -> P(known) after the answer and the
// learning step.
export function update(p0, correct, { g, s, t = T }) {
  const p = Math.min(p0, CEILING);
  const post = correct
    ? (p * (1 - s)) / (p * (1 - s) + (1 - p) * g)
    : (p * s) / (p * s + (1 - p) * (1 - g));
  return post + (1 - post) * t;
}

// The chance of a right answer on the next question.
export const pCorrect = (p, { g, s }) => p * (1 - s) + (1 - p) * g;

// Where to start: L0, or a placement from the diagnostic, or an estimate from
// old aggregate stats (right / total with no order). For aggregates, invert
// the expected accuracy, acc = L(1 − S) + (1 − L)G, to get L, then shrink it
// towards L0 by how much data there is (n / (n + 2)), clamped to [0.01, 0.99].
export function prior({ legacy = null, known = false } = {}) {
  if (known) return 0.96;
  if (legacy && legacy.total > 0) {
    const { g, s } = params(null);
    const acc = legacy.right / legacy.total;
    const L = Math.max(0.01, Math.min(0.99, (acc - g) / (1 - s - g)));
    const w = legacy.total / (legacy.total + 2);
    return L0 + w * (L - L0);
  }
  return L0;
}

// P(known) after a list of answers, oldest first. Each answer is a boolean or
// { c, ty, m } (correct, type, marks) as the store keeps them.
export function trace(answers, start = L0) {
  let p = start;
  for (const a of answers) {
    const c = typeof a === "boolean" ? a : !!a.c;
    p = update(p, c, params(typeof a === "boolean" ? null : a.ty, typeof a === "boolean" ? 1 : a.m));
  }
  return p;
}
