// The exam-date planner: spreads the modules still to learn over the study
// days left, keeping every module after its prerequisites, pulling weak
// topics earlier, and keeping the last ~20% of days for mocks and review.
// It is rebuilt from today every time it is shown, so falling behind (or
// getting ahead) replans automatically. Pure: no DOM, no storage.
import { addDays, daysBetween, weekday } from "./store.js";

export const RESERVE = 0.2;
// Study days for a given number of days a week: Monday first, Sunday last.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function studyDays(start, exam, daysPerWeek) {
  const allowed = new Set(WEEK.slice(0, Math.max(1, Math.min(7, daysPerWeek))));
  const out = [];
  for (let k = start; daysBetween(k, exam) > 0; k = addDays(k, 1)) if (allowed.has(weekday(k))) out.push(k);
  return out;
}

// Remaining modules in study order: needs first, then weak modules, then
// roadmap order.
export function order(modules, doneIds, weak) {
  const left = modules.filter((m) => !doneIds.has(m.id));
  const pending = new Set(left.map((m) => m.id));
  const isWeak = (m) => (m.gate ?? []).some((t) => weak.has(t));
  const out = [];
  while (left.length) {
    const ready = left.filter((m) => m.needs.every((n) => !pending.has(n)));
    const pool = ready.length ? ready : left; // a cycle would be a data bug; don't hang on it
    const pick = pool.find(isWeak) ?? pool[0];
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
    pending.delete(pick.id);
  }
  return out;
}

const half = (x) => Math.max(0.5, Math.round(x * 2) / 2);

// settings: { roadmap, start, exam, hoursPerDay, daysPerWeek }
// doneIds: Set of mastered module ids. weak: Set of weak GATE topic slugs.
export function buildPlan({ roadmap, start, exam, hoursPerDay, daysPerWeek }, doneIds = new Set(), weak = new Set()) {
  const modules = roadmap.stages.flatMap((stage) => stage.modules.map((m) => ({ ...m, stageId: stage.id, stageTitle: stage.title })));
  const dates = studyDays(start, exam, daysPerWeek);
  if (!dates.length) return { error: daysBetween(start, exam) <= 0 ? "Pick an exam date after today." : "There are no study days before the exam with these settings.", days: [] };
  const queue = order(modules, doneIds, weak);
  const reserve = dates.length >= 2 ? Math.max(1, Math.round(dates.length * RESERVE)) : 0;
  const learnCount = queue.length ? dates.length - reserve : 0;
  const hours = Math.max(0.5, Number(hoursPerDay) || 1);
  const total = queue.reduce((a, m) => a + (m.hours ?? 1), 0);
  const capacity = learnCount * hours;
  const scale = total > 0 && capacity > 0 ? Math.min(1, capacity / total) : 1;

  const days = dates.map((date, i) => ({ date, kind: i < learnCount ? "learn" : "revise", tasks: [] }));
  let d = 0, room = hours;
  for (const m of queue) {
    let left = (m.hours ?? 1) * scale;
    const parts = [];
    while (left > 1e-9) {
      if (room < 0.25 && d < learnCount - 1) { d++; room = hours; }
      const take = d === learnCount - 1 ? left : Math.min(left, room);
      parts.push({ day: d, hours: take });
      left -= take; room -= take;
    }
    parts.forEach((p, k) => days[p.day].tasks.push({ type: "module", id: m.id, title: m.title, stage: m.stageId, stageTitle: m.stageTitle, hours: half(p.hours), part: k + 1, parts: parts.length }));
  }
  // The reserve: full mocks and review days in turn, with a light last day.
  const revise = days.filter((x) => x.kind === "revise");
  revise.forEach((x, i) => {
    if (i === revise.length - 1 && revise.length > 1) x.tasks.push({ type: "review", light: true });
    else if (i % 2 === 0) x.tasks.push({ type: "mock" });
    else x.tasks.push({ type: "review" });
  });
  return { days, scale, totalHours: total, learnDays: learnCount, reserveDays: days.length - learnCount, remaining: queue.length };
}

// When each module was due to be finished: { moduleId: date }. Saved with the
// plan when it is made, to tell later whether the learner has fallen behind.
export function snapshot(plan) {
  const due = {};
  for (const d of plan.days) for (const t of d.tasks) if (t.type === "module") due[t.id] = d.date;
  return due;
}

// Modules that should have been finished before today but aren't.
export function behind(snap, doneIds, today) {
  return Object.entries(snap ?? {}).filter(([id, date]) => date < today && !doneIds.has(id)).map(([id]) => id);
}
