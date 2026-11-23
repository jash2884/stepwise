// Which questions go into a mock test or the diagnostic. Questions are
// { topic, seed } pairs, generated later by gate-questions.js, so a test is
// small to store and can be rebuilt exactly. Pure: topics are passed in as
// [{ slug, subject }] (the GATE question registry).

const nextSeed = (seed, i) => ((seed + i * 104729 + 7) % 1e9 + 1e9) % 1e9;

// Split n as evenly as possible over k buckets (the first ones get the extra).
export function split(n, k) {
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

export function subjectsOf(topics) {
  return [...new Set(topics.map((t) => t.subject))];
}

// count questions from a list of topics, taking each topic in turn, starting
// at a seed-dependent topic so repeated tests don't always lead with the same one.
function roundRobin(slugs, count, seed) {
  const out = [];
  const start = slugs.length ? seed % slugs.length : 0;
  for (let i = 0; i < count; i++) out.push(slugs[(start + i) % slugs.length]);
  return out;
}

// Spread n questions evenly over the subjects that have topics, then evenly
// over each subject's topics. Returns slugs grouped by subject.
function spread(topics, n, seed) {
  const subjects = subjectsOf(topics);
  const shares = split(n, subjects.length);
  return subjects.map((sub, i) => roundRobin(topics.filter((t) => t.subject === sub).map((t) => t.slug), shares[i], seed + i));
}

export const FULL = { questions: 65, minutes: 180 };
export const STAGE = { questions: 15, minutes: 30 };
export const DIAGNOSTIC = { questions: 20 };

// A full mock: GATE's length and time, sections by subject like the real paper.
export function fullMock(topics, seed, { questions = FULL.questions, minutes = FULL.minutes } = {}) {
  if (!topics.length) return null;
  const slugs = spread(topics, questions, seed).flat();
  return { kind: "full", minutes, items: slugs.map((topic, i) => ({ topic, seed: nextSeed(seed, i) })) };
}

// The GATE topics a roadmap stage tests.
export function stageTopics(stage, topics) {
  const known = new Set(topics.map((t) => t.slug));
  return [...new Set(stage.modules.flatMap((m) => m.gate ?? []))].filter((t) => known.has(t));
}

export function stageMock(roadmap, stage, topics, seed, { questions = STAGE.questions, minutes = STAGE.minutes } = {}) {
  const slugs = stageTopics(stage, topics);
  if (!slugs.length) return null;
  const list = roundRobin(slugs, questions, seed);
  return { kind: "stage", roadmap: roadmap.id, stage: stage.id, minutes, items: list.map((topic, i) => ({ topic, seed: nextSeed(seed, i) })) };
}

// The diagnostic: n questions spread over every subject, then every topic,
// with subjects interleaved so it never feels like one long block.
export function diagnostic(topics, seed, n = DIAGNOSTIC.questions) {
  const groups = spread(topics, n, seed);
  const out = [];
  for (let i = 0; out.length < n && groups.some((g) => g.length > i); i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out.map((topic, i) => ({ topic, seed: nextSeed(seed, i) }));
}

// results: [{ topic, correct }]. A topic counts as known when every one of
// its diagnostic questions was right and either there were at least two or
// the learner got at least 75% of that subject right.
export function diagnosticReport(results, topics, roadmap) {
  const bySubject = new Map();
  const byTopic = new Map();
  for (const r of results) {
    const t = topics.find((x) => x.slug === r.topic);
    if (!t) continue;
    const s = bySubject.get(t.subject) ?? { subject: t.subject, right: 0, total: 0 };
    s.total++; if (r.correct) s.right++;
    bySubject.set(t.subject, s);
    const k = byTopic.get(r.topic) ?? { right: 0, total: 0 };
    k.total++; if (r.correct) k.right++;
    byTopic.set(r.topic, k);
  }
  // With many topics a short diagnostic asks most topics once, so one right
  // answer counts when the learner was strong across that whole subject.
  const subjectOf = (slug) => topics.find((t) => t.slug === slug)?.subject;
  const strong = (slug) => { const s = bySubject.get(subjectOf(slug)); return s && s.right / s.total >= 0.75; };
  const known = [...byTopic].filter(([slug, k]) => k.right === k.total && (k.total >= 2 || strong(slug))).map(([slug]) => slug);
  const subjects = [...bySubject.values()].map((s) => ({
    ...s,
    known: known.filter((slug) => topics.find((t) => t.slug === slug)?.subject === s.subject),
    start: startFor(roadmap, topics, s.subject, known),
  }));
  const weakest = [...subjects].sort((a, b) => a.right / a.total - b.right / b.total)[0] ?? null;
  return { subjects, known, start: weakest?.start ?? null, weakest: weakest?.subject ?? null };
}

// The first module, in roadmap order, with a topic in this subject that
// isn't known yet.
function startFor(roadmap, topics, subject, known) {
  for (const stage of roadmap.stages) for (const module of stage.modules) {
    const gate = (module.gate ?? []).filter((g) => topics.find((t) => t.slug === g)?.subject === subject);
    if (gate.some((g) => !known.includes(g))) return { stage: stage.id, module: module.id, title: module.title };
  }
  return null;
}

// Marks per topic for a finished test: [{ topic, right, wrong, skipped, score, max }].
export function scoreByTopic(entries) {
  const map = new Map();
  for (const e of entries) {
    const r = map.get(e.topic) ?? { topic: e.topic, right: 0, wrong: 0, skipped: 0, score: 0, max: 0 };
    if (!e.answered) r.skipped++; else if (e.correct) r.right++; else r.wrong++;
    r.score += e.score; r.max += e.marks;
    map.set(e.topic, r);
  }
  return [...map.values()].map((r) => ({ ...r, score: Math.round(r.score * 100) / 100 }));
}
