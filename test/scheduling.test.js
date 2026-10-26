import assert from "node:assert/strict";
import { test } from "node:test";
import { schedule } from "../public/js/engines/scheduling.js";

const P = (id, arrival, burst, priority = 0) => ({ id, arrival, burst, priority });
const gantt = (r) => r.timeline.map((s) => `${s.id ?? "idle"}:${s.start}-${s.end}`).join(" ");

// Worked examples from Silberschatz, Operating System Concepts (ch. 5).
test("FCFS: the convoy effect example", () => {
  const r = schedule([P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)], "fcfs");
  assert.equal(gantt(r), "P1:0-24 P2:24-27 P3:27-30");
  assert.equal(r.averages.wt, 17);
});

test("SJF (non-preemptive)", () => {
  const r = schedule([P("P1", 0, 6), P("P2", 0, 8), P("P3", 0, 7), P("P4", 0, 3)], "sjf");
  assert.equal(gantt(r), "P4:0-3 P1:3-9 P3:9-16 P2:16-24");
  assert.equal(r.averages.wt, 7);
});

test("SRTF preempts for a shorter remaining time", () => {
  const r = schedule([P("P1", 0, 8), P("P2", 1, 4), P("P3", 2, 9), P("P4", 3, 5)], "srtf");
  assert.equal(gantt(r), "P1:0-1 P2:1-5 P4:5-10 P1:10-17 P3:17-26");
  assert.equal(r.averages.wt, 6.5);
  assert.deepEqual(r.results.map((x) => x.rt), [0, 0, 15, 2]);
});

test("Round Robin with quantum 4", () => {
  const r = schedule([P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)], "rr", { quantum: 4 });
  assert.equal(gantt(r), "P1:0-4 P2:4-7 P3:7-10 P1:10-30");
  assert.equal(r.averages.wt.toFixed(2), "5.67");
});

test("Round Robin: new arrivals queue ahead of the preempted process", () => {
  const r = schedule([P("A", 0, 4), P("B", 2, 2)], "rr", { quantum: 2 });
  assert.equal(gantt(r), "A:0-2 B:2-4 A:4-6");
});

test("Priority (non-preemptive), lower number wins", () => {
  const r = schedule([P("P1", 0, 10, 3), P("P2", 0, 1, 1), P("P3", 0, 2, 4), P("P4", 0, 1, 5), P("P5", 0, 5, 2)], "priority");
  assert.equal(gantt(r), "P2:0-1 P5:1-6 P1:6-16 P3:16-18 P4:18-19");
  assert.equal(r.averages.wt, 8.2);
});

test("Priority (preemptive) and the higher-number-wins option", () => {
  const procs = [P("P1", 0, 5, 3), P("P2", 1, 2, 1), P("P3", 2, 2, 5)];
  assert.equal(gantt(schedule(procs, "priority-p")), "P1:0-1 P2:1-3 P1:3-7 P3:7-9");
  assert.equal(gantt(schedule(procs, "priority-p", { lowerIsHigher: false })), "P1:0-2 P3:2-4 P1:4-7 P2:7-9");
});

test("idle gaps, metrics and validation", () => {
  const r = schedule([P("P1", 2, 3), P("P2", 8, 2)], "fcfs");
  assert.equal(gantt(r), "idle:0-2 P1:2-5 idle:5-8 P2:8-10");
  assert.deepEqual(r.results.map((x) => [x.ct, x.tat, x.wt, x.rt]), [[5, 3, 0, 0], [10, 2, 0, 0]]);
  assert.equal(r.utilisation, 5 / 8);
  assert.throws(() => schedule([P("P1", 0, 0)], "fcfs"), /burst/);
  assert.throws(() => schedule([P("P1", 0, 2)], "rr", { quantum: 0 }), /quantum/);
});

test("every tick is a step with a note when something happens", () => {
  const r = schedule([P("P1", 0, 2), P("P2", 1, 1)], "srtf");
  assert.equal(r.frames.length, 4); // 3 ticks + the final frame
  assert.match(r.frames[0].notes.join(" "), /P1 arrives/);
  assert.match(r.frames[1].notes.join(" "), /P2 arrives/);
  assert.match(r.frames.at(-1).notes.join(" "), /All processes have finished/);
});
