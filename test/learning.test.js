// The learning system's pure parts: the store and its migration, mastery,
// spaced repetition, the planner, mock composition and the diagnostic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, empty, migrate, recordAnswer, recordVisit, setDone, setUnderstood, VERSION, weekday } from "../public/js/learn/store.js";
import { answer, isMastered, markKnown, moduleState, nextModule, review, stageProgress, streak, weakTopics, week } from "../public/js/learn/model.js";
import { applyReview, DAY, dueTopics, enter, INTERVALS } from "../public/js/learn/srs.js";
import { behind, buildPlan, order, snapshot, studyDays } from "../public/js/learn/planner.js";
import { diagnostic, diagnosticReport, fullMock, scoreByTopic, split, stageMock, stageTopics } from "../public/js/learn/compose.js";
import { ROADMAPS, roadmapOf } from "../public/js/roadmaps.js";
import { TOPICS, generate } from "../public/js/gate-questions.js";

const NOW = Date.UTC(2026, 10, 23, 10);
const gate = roadmapOf("gate-cs");
const moduleById = (id) => gate.stages.flatMap((s) => s.modules).find((m) => m.id === id);

// --- Store ------------------------------------------------------------------------

test("an empty or unreadable store migrates to the current version", () => {
  for (const raw of [null, "nonsense", 42, [], { v: 99, answers: [1] }]) {
    const s = migrate(raw);
    assert.equal(s.v, VERSION);
    assert.deepEqual(s.answers, []);
    assert.equal(s.migratedGate, true);
  }
});

test("old stepwise.gate stats are folded in once", () => {
  const legacy = { "cpu-scheduling": { right: 4, total: 5 }, hashing: { right: 0, total: 0 }, junk: "x" };
  const s = migrate(null, legacy);
  assert.deepEqual(s.legacy, { "cpu-scheduling": { right: 4, total: 5 } });
  // Saved and read back with the legacy key still around: not counted twice.
  const again = migrate(JSON.parse(JSON.stringify(s)), legacy);
  assert.deepEqual(again.legacy, { "cpu-scheduling": { right: 4, total: 5 } });
});

test("a saved store survives a round trip and bad fields are dropped", () => {
  const s = empty();
  recordAnswer(s, { topic: "hashing", seed: 7, correct: false, score: -0.33, marks: 1, ms: 12000 }, NOW);
  recordVisit(s, "hashing", NOW);
  setDone(s, "dm.logic", true, NOW);
  s.answers.push({ nope: true });
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back.answers.length, 1);
  assert.deepEqual(back.answers[0], { t: "hashing", s: 7, c: false, sc: -0.33, m: 1, ms: 12000, at: NOW, src: "gate" });
  assert.equal(back.mistakes.length, 1);
  assert.equal(back.visits.hashing.n, 1);
  assert.ok(back.done["dm.logic"]);
});

test("wrong answers go to the mistake notebook once, with their seed", () => {
  const s = empty();
  recordAnswer(s, { topic: "hashing", seed: 9, correct: false }, NOW);
  recordAnswer(s, { topic: "hashing", seed: 9, correct: false }, NOW + 1);
  recordAnswer(s, { topic: "hashing", seed: 10, correct: true }, NOW + 2);
  assert.deepEqual(s.mistakes.map((m) => [m.t, m.s, m.ok]), [["hashing", 9, false]]);
  setUnderstood(s, "hashing", 9);
  assert.equal(s.mistakes[0].ok, true);
  // The same question regenerates from topic and seed.
  assert.deepEqual(generate("hashing", 9), generate("hashing", 9));
});

test("calendar helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-11-23", "2026-12-01"), 8);
  assert.equal(weekday("2026-11-23"), 1); // a Monday
});

// --- Mastery ----------------------------------------------------------------------

test("mastery needs at least 5 answers and 80% over the last 10", () => {
  assert.equal(isMastered([true, true, true, true]), false);
  assert.equal(isMastered([true, true, true, true, false]), true); // 4 of 5
  assert.equal(isMastered([true, true, true, false, false]), false); // 3 of 5
  // Only the last 10 count: early mistakes are forgiven.
  assert.equal(isMastered([false, false, false, false, ...Array(10).fill(true)]), true);
  assert.equal(isMastered([...Array(10).fill(true), false, false, false]), false); // 7 of the last 10
  // Old aggregate stats help when there are few recent answers.
  assert.equal(isMastered([true], { legacy: { right: 9, total: 10 } }), true);
  assert.equal(isMastered([], { legacy: { right: 2, total: 10 } }), false);
  // The diagnostic can place a topic as known until it is answered wrongly.
  assert.equal(isMastered([], { known: true }), true);
  assert.equal(isMastered([true, false], { known: true }), false);
});

test("module states move from not started to mastered to due for review", () => {
  const s = empty();
  const m = moduleById("os.scheduling");
  assert.equal(moduleState(s, m, NOW).state, "not-started");
  recordVisit(s, "cpu-scheduling", NOW);
  assert.equal(moduleState(s, m, NOW).state, "seen");
  answer(s, { topic: "cpu-scheduling", seed: 1, correct: true }, NOW);
  assert.equal(moduleState(s, m, NOW).state, "practising");
  for (let i = 2; i <= 5; i++) answer(s, { topic: "cpu-scheduling", seed: i, correct: true }, NOW);
  assert.equal(moduleState(s, m, NOW).state, "mastered");
  assert.ok(s.reviews["cpu-scheduling"], "mastering a topic queues it for review");
  assert.equal(moduleState(s, m, NOW + 3 * DAY).state, "review");
});

test("modules without GATE topics are mastered by ticking them off", () => {
  const s = empty();
  // Any module with no GATE topics (reading-only or checkbox modules).
  const m = ROADMAPS.flatMap((r) => r.stages.flatMap((st) => st.modules)).find((x) => !x.gate?.length && !x.practiceAll);
  assert.ok(m, "there is a module without GATE topics");
  assert.equal(moduleState(s, m, NOW).state, "not-started");
  setDone(s, m.id, true, NOW);
  assert.equal(moduleState(s, m, NOW).state, "mastered");
  setDone(s, m.id, false, NOW);
  assert.equal(moduleState(s, m, NOW).state, "not-started");
});

test("the next module is the first unmastered one whose needs are met", () => {
  const s = empty();
  assert.equal(nextModule(s, gate, NOW).module.id, gate.stages[0].modules[0].id);
  const first = gate.stages[0].modules[0];
  // Master the first module: by its GATE topics if it has any, else by the checkbox.
  if (first.gate?.length) for (const g of first.gate) for (let i = 0; i < 10; i++) answer(s, { topic: g, seed: i, correct: true }, NOW);
  else setDone(s, first.id, true, NOW);
  const next = nextModule(s, gate, NOW).module;
  assert.notEqual(next.id, first.id);
  assert.ok(next.needs.every((n) => n === first.id || s.done[n]));
  const sp = stageProgress(s, gate.stages[0], NOW);
  assert.equal(sp.mastered, 1);
  assert.equal(sp.total, gate.stages[0].modules.length);
});

test("weak topics, streaks and the week", () => {
  const s = empty();
  for (let i = 0; i < 4; i++) answer(s, { topic: "hashing", seed: i, correct: i === 0 }, NOW);
  for (let i = 0; i < 4; i++) answer(s, { topic: "sql-joins", seed: i, correct: true }, NOW);
  const weak = weakTopics(s, TOPICS);
  assert.deepEqual(weak.map((w) => w.topic.slug), ["hashing"]);
  const d = empty();
  const day = (k) => { d.days[k] = { q: 1, right: 1, ms: 0, visits: 0 }; };
  day("2026-11-20"); day("2026-11-21"); day("2026-11-22");
  assert.equal(streak(d, "2026-11-22"), 3);
  assert.equal(streak(d, "2026-11-23"), 3, "a streak isn't lost before today's study");
  assert.equal(streak(d, "2026-11-25"), 0);
  const w = week(d, "2026-11-22");
  assert.equal(w.length, 7);
  assert.equal(w[6].key, "2026-11-22");
});

// --- Spaced repetition -----------------------------------------------------------------

test("reviews come back after 2, 7, 21 and 45 days", () => {
  assert.deepEqual(INTERVALS, [2, 7, 21, 45]);
  const reviews = {};
  let e = enter(reviews, "hashing", NOW);
  assert.equal(e.due, NOW + 2 * DAY);
  let t = e.due;
  for (const gap of [7, 21, 45, 45]) {
    e = applyReview(e, true, t);
    assert.equal(e.due - t, gap * DAY);
    t = e.due;
  }
});

test("failing a review shortens the gap", () => {
  const e = applyReview({ step: 2, due: NOW }, false, NOW);
  assert.equal(e.step, 1);
  assert.equal(e.due, NOW + DAY);
  const after = applyReview(e, true, e.due);
  assert.equal(after.due - e.due, 21 * DAY, "passing again climbs back up");
  assert.equal(applyReview({ step: 0, due: NOW }, false, NOW).step, 0);
});

test("due reviews are listed most overdue first", () => {
  const s = empty();
  markKnown(s, ["hashing", "sql-joins"], NOW);
  s.reviews.hashing.due = NOW + 2 * DAY + 5;
  assert.deepEqual(dueTopics(s.reviews, NOW + 3 * DAY), ["sql-joins", "hashing"]);
  review(s, "hashing", true, NOW + 3 * DAY);
  assert.deepEqual(dueTopics(s.reviews, NOW + 3 * DAY), ["sql-joins"]);
});

// --- Planner --------------------------------------------------------------------------

test("study days respect days per week and stop before the exam", () => {
  const d = studyDays("2026-11-23", "2026-12-07", 5); // two weeks from a Monday
  assert.equal(d.length, 10);
  assert.ok(d.every((k) => weekday(k) >= 1 && weekday(k) <= 5));
  assert.ok(!d.includes("2026-12-07"));
  assert.equal(studyDays("2026-11-23", "2026-11-23", 7).length, 0);
});

test("the plan keeps every module after its needs and fills the hours", () => {
  const plan = buildPlan({ roadmap: gate, start: "2026-11-23", exam: "2027-02-01", hoursPerDay: 4, daysPerWeek: 6 });
  const firstDay = new Map(), lastDay = new Map();
  plan.days.forEach((d, i) => d.tasks.filter((t) => t.type === "module").forEach((t) => { if (!firstDay.has(t.id)) firstDay.set(t.id, i); lastDay.set(t.id, i); }));
  const all = gate.stages.flatMap((s) => s.modules);
  assert.equal(firstDay.size, all.length, "every module is scheduled");
  for (const m of all) for (const n of m.needs) assert.ok(lastDay.get(n) <= firstDay.get(m.id), `${n} before ${m.id}`);
  for (const d of plan.days.filter((x) => x.kind === "learn")) assert.ok(d.tasks.reduce((a, t) => a + t.hours, 0) <= 4 + 0.5);
});

test("the last ~20% of days are kept for mocks and review", () => {
  const plan = buildPlan({ roadmap: gate, start: "2026-11-23", exam: "2027-01-02", hoursPerDay: 6, daysPerWeek: 7 });
  const n = plan.days.length;
  assert.equal(n, 40);
  assert.equal(plan.reserveDays, 8);
  plan.days.slice(-8).forEach((d) => { assert.equal(d.kind, "revise"); assert.ok(d.tasks.every((t) => t.type !== "module")); });
  assert.ok(plan.days.slice(-8).some((d) => d.tasks.some((t) => t.type === "mock")));
  assert.ok(plan.scale < 1, "not enough time: hours are scaled down, not dropped");
  assert.ok(plan.days.slice(0, -8).every((d) => d.kind === "learn"));
});

test("mastered modules drop out and weak topics come earlier", () => {
  const all = gate.stages.flatMap((s) => s.modules);
  const plain = order(all, new Set(), new Set());
  const weak = order(all, new Set(), new Set(["serializability"]));
  const at = (list, id) => list.findIndex((m) => m.id === id);
  assert.ok(at(weak, "db.txn") < at(plain, "db.txn"));
  for (const m of weak) for (const n of m.needs) assert.ok(at(weak, n) < at(weak, m.id));
  const done = new Set(["ds.arrays", "ds.stacks"]);
  const rest = order(all, done, new Set());
  assert.ok(!rest.some((m) => done.has(m.id)));
});

test("falling behind is noticed and the plan rebuilds from today", () => {
  const settings = { roadmap: gate, start: "2026-11-23", exam: "2027-03-01", hoursPerDay: 3, daysPerWeek: 6 };
  const snap = snapshot(buildPlan(settings));
  const late = behind(snap, new Set(), "2026-12-10");
  assert.ok(late.length > 0);
  assert.equal(behind(snap, new Set(late), "2026-12-10").length, 0);
  const later = buildPlan({ ...settings, start: "2026-12-10" }, new Set(["ds.arrays"]));
  assert.equal(later.days[0].date >= "2026-12-10", true);
  assert.ok(!later.days.some((d) => d.tasks.some((t) => t.id === "ds.arrays")));
  assert.match(buildPlan({ ...settings, exam: "2026-11-01" }).error, /after today/);
});

// --- Mocks and diagnostic --------------------------------------------------------------

test("a full mock has 65 questions spread evenly over subjects", () => {
  const mock = fullMock(TOPICS, 12345);
  assert.equal(mock.items.length, 65);
  assert.equal(mock.minutes, 180);
  const subjects = [...new Set(TOPICS.map((t) => t.subject))];
  const shares = subjects.map((sub) => mock.items.filter((q) => TOPICS.find((t) => t.slug === q.topic).subject === sub).length);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
  // Each subject covers as many different topics as its share of questions allows.
  subjects.forEach((sub, i) => {
    const mine = TOPICS.filter((t) => t.subject === sub).map((t) => t.slug);
    const seen = new Set(mock.items.map((q) => q.topic).filter((x) => mine.includes(x)));
    assert.equal(seen.size, Math.min(mine.length, shares[i]), `${sub} topic coverage`);
  });
  assert.deepEqual(fullMock(TOPICS, 12345), mock, "same seed, same paper");
  assert.equal(new Set(mock.items.map((q) => q.seed)).size, 65);
  assert.deepEqual(split(10, 3), [4, 3, 3]);
});

test("a stage test draws ~15 questions from that stage's topics", () => {
  const os = gate.stages.find((s) => s.id === "os");
  const mock = stageMock(gate, os, TOPICS, 99);
  assert.equal(mock.items.length, 15);
  assert.equal(mock.minutes, 30);
  const topics = stageTopics(os, TOPICS);
  assert.ok(mock.items.every((q) => topics.includes(q.topic)));
  for (const t of topics) assert.ok(mock.items.some((q) => q.topic === t));
  const noTopics = ROADMAPS.flatMap((r) => r.stages).find((st) => st.modules.every((x) => !x.gate?.length));
  if (noTopics) assert.equal(stageMock(gate, noTopics, TOPICS, 1), null);
});

test("the diagnostic spreads 20 questions over subjects and topics", () => {
  const items = diagnostic(TOPICS, 5);
  assert.equal(items.length, 20);
  const subjects = [...new Set(TOPICS.map((t) => t.subject))];
  const per = subjects.map((sub) => items.filter((q) => TOPICS.find((t) => t.slug === q.topic).subject === sub).length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 1);
  for (const sub of subjects) {
    const perTopic = TOPICS.filter((t) => t.subject === sub).map((t) => items.filter((q) => q.topic === t.slug).length);
    assert.ok(Math.max(...perTopic) - Math.min(...perTopic) <= 1, `${sub} topics evenly covered`);
  }
  // Interleaved: the first questions aren't all from one subject.
  assert.ok(new Set(items.slice(0, subjects.length).map((q) => TOPICS.find((t) => t.slug === q.topic).subject)).size === subjects.length);
});

test("diagnostic results mark known topics and suggest a start", () => {
  const items = diagnostic(TOPICS, 5);
  const results = items.map((q) => ({ topic: q.topic, correct: TOPICS.find((t) => t.slug === q.topic).subject === "dbms" }));
  const rep = diagnosticReport(results, TOPICS, gate);
  const asked = new Set(items.map((q) => q.topic));
  const dbms = TOPICS.filter((t) => t.subject === "dbms" && asked.has(t.slug)).map((t) => t.slug);
  assert.ok(dbms.length > 0);
  assert.deepEqual([...rep.known].sort(), [...dbms].sort());
  assert.equal(rep.weakest, "os");
  assert.equal(rep.start.module, "os.scheduling");
});

test("a test is scored per topic", () => {
  const rows = scoreByTopic([
    { topic: "a", answered: true, correct: true, score: 2, marks: 2 },
    { topic: "a", answered: true, correct: false, score: -0.33, marks: 1 },
    { topic: "b", answered: false, correct: false, score: 0, marks: 1 },
  ]);
  assert.deepEqual(rows, [
    { topic: "a", right: 1, wrong: 1, skipped: 0, score: 1.67, max: 3 },
    { topic: "b", right: 0, wrong: 0, skipped: 1, score: 0, max: 1 },
  ]);
  assert.ok(ROADMAPS.length >= 1);
});
