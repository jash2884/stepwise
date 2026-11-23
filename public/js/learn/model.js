// What the learning store means: mastery, module states, stage progress, the
// next module to study, weak topics, streaks and the week's activity.
// Pure functions over the store's state; no DOM, no storage.
import { addDays, dayKey, recordAnswer } from "./store.js";
import { applyReview, dueTopics, enter } from "./srs.js";

// Mastered: at least MIN_ANSWERS answered, and at least 80% right over the
// last WINDOW of them.
export const MIN_ANSWERS = 5, WINDOW = 10, THRESHOLD = 0.8;

export const STATE_LABEL = { "not-started": "Not started", seen: "Seen", practising: "Practising", mastered: "Mastered", review: "Due for review" };

// results: booleans, oldest first. legacy: { right, total } from the old GATE
// page (no order, so only used when there are too few recent answers).
// known: the diagnostic placed this as known.
export function isMastered(results, { legacy = null, known = false } = {}) {
  if (results.length >= MIN_ANSWERS) {
    const last = results.slice(-WINDOW);
    return last.filter(Boolean).length / last.length >= THRESHOLD;
  }
  if (legacy && legacy.total + results.length >= MIN_ANSWERS) {
    const right = legacy.right + results.filter(Boolean).length;
    return right / (legacy.total + results.length) >= THRESHOLD;
  }
  return !!known && results.every(Boolean);
}

export const answersOf = (s, topics) => {
  const set = new Set(topics);
  return s.answers.filter((a) => set.has(a.t));
};

export function topicStat(s, slug) {
  const mine = answersOf(s, [slug]);
  const legacy = s.legacy[slug] ?? { right: 0, total: 0 };
  const recent = mine.slice(-WINDOW);
  return {
    right: legacy.right + mine.filter((a) => a.c).length,
    total: legacy.total + mine.length,
    recent: recent.length ? recent.filter((a) => a.c).length / recent.length : null,
    mastered: topicMastered(s, slug),
  };
}

export const topicMastered = (s, slug) => isMastered(answersOf(s, [slug]).map((a) => a.c), { legacy: s.legacy[slug], known: !!s.known[slug] });

// Record an answer and keep spaced repetition in step: a topic joins the
// review queue the first time it is mastered.
export function answer(s, rec, now = Date.now()) {
  recordAnswer(s, rec, now);
  if (topicMastered(s, rec.topic)) enter(s.reviews, rec.topic, now);
  return s;
}

// A finished review session for one topic.
export function review(s, topic, passed, now = Date.now()) {
  s.reviews[topic] = applyReview(s.reviews[topic], passed, now);
  return s;
}

// Mark topics as known from the diagnostic, and queue them for review.
export function markKnown(s, topics, now = Date.now()) {
  for (const t of topics) { s.known[t] = now; enter(s.reviews, t, now); }
  return s;
}

const gateOf = (m) => m.gate ?? [];
const seenModule = (s, m) => m.tools.some((slug) => s.visits[slug]?.n > 0);

// { state, progress (0 to 1) } for one roadmap module.
export function moduleState(s, m, now = Date.now()) {
  const topics = gateOf(m);
  if (!topics.length) {
    if (s.done[m.id]) return { state: "mastered", progress: 1 };
    return seenModule(s, m) ? { state: "seen", progress: 0.15 } : { state: "not-started", progress: 0 };
  }
  const mine = answersOf(s, topics);
  const results = mine.map((a) => a.c);
  const legacy = topics.reduce((acc, t) => { const l = s.legacy[t]; return l ? { right: acc.right + l.right, total: acc.total + l.total } : acc; }, { right: 0, total: 0 });
  const known = topics.every((t) => s.known[t]);
  if (isMastered(results, { legacy: legacy.total ? legacy : null, known })) {
    const due = topics.some((t) => s.reviews[t] && s.reviews[t].due <= now);
    return { state: due ? "review" : "mastered", progress: 1 };
  }
  if (mine.length || legacy.total) {
    const last = results.slice(-WINDOW);
    const right = last.length ? last.filter(Boolean).length : Math.round((legacy.right / legacy.total) * Math.min(legacy.total, WINDOW));
    return { state: "practising", progress: Math.max(0.2, Math.min(0.95, right / (WINDOW * THRESHOLD))) };
  }
  return seenModule(s, m) ? { state: "seen", progress: 0.15 } : { state: "not-started", progress: 0 };
}

export const isDone = (st) => st.state === "mastered" || st.state === "review";

export function stageProgress(s, stage, now = Date.now()) {
  const states = stage.modules.map((m) => moduleState(s, m, now));
  return {
    mastered: states.filter(isDone).length,
    total: states.length,
    progress: states.length ? states.reduce((a, b) => a + b.progress, 0) / states.length : 0,
  };
}

// The first module, in roadmap order, that isn't mastered and whose
// prerequisites are; if every remaining module is blocked, the first remaining.
export function nextModule(s, roadmap, now = Date.now()) {
  const all = roadmap.stages.flatMap((stage) => stage.modules.map((module) => ({ stage, module })));
  const done = new Set(all.filter(({ module }) => isDone(moduleState(s, module, now))).map(({ module }) => module.id));
  const left = all.filter(({ module }) => !done.has(module.id));
  return left.find(({ module }) => module.needs.every((n) => done.has(n))) ?? left[0] ?? null;
}

// The module the learner touched most recently (a tool visit or an answer),
// if it isn't finished: "continue where you left off".
export function lastModule(s, roadmap, now = Date.now()) {
  let best = null, bestAt = 0;
  for (const stage of roadmap.stages) for (const module of stage.modules) {
    const at = Math.max(0, ...module.tools.map((t) => s.visits[t]?.last ?? 0), ...answersOf(s, gateOf(module)).map((a) => a.at));
    if (at > bestAt) { best = { stage, module }; bestAt = at; }
  }
  return best && !isDone(moduleState(s, best.module, now)) ? best : null;
}

// Topics with at least 3 answers and under 80% recently, weakest first.
export function weakTopics(s, topics, limit = 5) {
  return topics.map((t) => ({ topic: t, ...topicStat(s, t.slug ?? t) }))
    .filter((x) => x.total >= 3 && (x.recent ?? x.right / x.total) < THRESHOLD)
    .sort((a, b) => (a.recent ?? a.right / a.total) - (b.recent ?? b.right / b.total))
    .slice(0, limit);
}

// The slugs of weak topics among everything the learner has practised, for
// the planner and the tutor (no need to load the question registry).
export function weakSlugs(s, limit = 20) {
  const slugs = [...new Set([...s.answers.map((a) => a.t), ...Object.keys(s.legacy)])];
  return weakTopics(s, slugs, limit).map((w) => w.topic);
}

// Days in a row with any activity, ending today (or yesterday, so a streak
// isn't lost before today's study).
export function streak(s, todayKey) {
  const active = (k) => { const d = s.days[k]; return !!d && (d.q > 0 || d.visits > 0 || d.ms >= 60000); };
  let k = active(todayKey) ? todayKey : addDays(todayKey, -1), n = 0;
  while (active(k)) { n++; k = addDays(k, -1); }
  return n;
}

// The last seven days, oldest first.
export function week(s, todayKey) {
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(todayKey, i - 6);
    const d = s.days[key] ?? { q: 0, right: 0, ms: 0, visits: 0 };
    return { key, ...d, accuracy: d.q ? d.right / d.q : null };
  });
}

export const dueCount = (s, now = Date.now()) => dueTopics(s.reviews, now).length;
export const openMistakes = (s) => s.mistakes.filter((m) => !m.ok);
export const todayKey = (now = Date.now()) => dayKey(now);
