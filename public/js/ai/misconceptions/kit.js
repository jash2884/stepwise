// Shared pieces for the misconception library.
//
// A misconception is a named, textbook mistake written as code: it takes a
// generated question (with its structured inputs in q.given) and works the
// answer out the way a student holding that misconception would, by running
// the same engine with one thing changed. It returns:
//   - the answer that student would give, in the question's own format
//     (a number for NAT, an option index for MCQ, a sorted index list for MSQ),
//   - or { anyOf: [answers] } when the mistake could lead to several answers
//     equally (for example "picked another traversal"),
//   - or null when the mistake doesn't apply to this question or the
//     resulting answer isn't one of the options.
//
// Each entry: { id, label, explain(q), predict(q), step?(q) }
//   label    finishes "Looks like you ..." (past tense, no full stop)
//   explain  one or two sentences: the right idea and what the mistake does,
//            with this question's numbers
//   step     optional: the 1-based step of the question's replay where the
//            correct run first differs from the mistaken one

export const opt = (q, text) => {
  const i = q.options ? q.options.indexOf(String(text)) : -1;
  return i >= 0 ? i : null;
};

// Option indexes whose text passes a test, as an MSQ answer (null if none).
export const optSet = (q, pass) => {
  const out = (q.options ?? []).map((o, i) => (pass(o, i) ? i : null)).filter((i) => i !== null);
  return out.length ? out : null;
};

// Several possible answers: drop nulls and repeats; one left means just that one.
export function anyOf(list) {
  const seen = new Set(), out = [];
  for (const x of list) {
    if (x == null) continue;
    const k = JSON.stringify(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  if (!out.length) return null;
  return out.length === 1 ? out[0] : { anyOf: out };
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const list = (xs) => xs.join(", ");
export const num = (x) => (Number.isInteger(x) ? String(x) : String(round2(x)));

// The first index where two sequences differ (same(a, b) says equal), or -1.
export function firstDiff(a, b, same = (x, y) => JSON.stringify(x) === JSON.stringify(y)) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (i >= a.length || i >= b.length || !same(a[i], b[i])) return i;
  return -1;
}

// Build a misconception entry, filling in the topic.
export const define = (topic, list) => list.map((m) => ({ topic, ...m }));
