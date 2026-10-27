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

// --- Added algorithms, context switches and the pseudocode trace -------------
import { ALGORITHMS, EXAMPLES, randomProcesses } from "../public/js/engines/scheduling.js";

// Stallings, Operating Systems (table 9.5): A 0/3, B 2/6, C 4/4, D 6/5, E 8/2.
const STALLINGS = [P("A", 0, 3), P("B", 2, 6), P("C", 4, 4), P("D", 6, 5), P("E", 8, 2)];

test("HRRN: Stallings' example runs A, B, C, E, D", () => {
  const r = schedule(STALLINGS, "hrrn");
  assert.equal(gantt(r), "A:0-3 B:3-9 C:9-13 E:13-15 D:15-20");
  // At t=9: C (5+4)/4 = 2.25, D (3+5)/5 = 1.6, E (1+2)/2 = 1.5, so C wins.
  assert.match(r.frames.find((f) => f.t === 9).note, /C: \(5 \+ 4\) \/ 4 = 2\.25/);
});

test("LJF and LRTF favour long jobs", () => {
  assert.equal(gantt(schedule(STALLINGS, "ljf")), "A:0-3 B:3-9 D:9-14 C:14-18 E:18-20");
  assert.equal(gantt(schedule([P("A", 0, 3), P("B", 1, 5)], "lrtf")), "A:0-1 B:1-5 A:5-7 B:7-8", "only a strictly longer job preempts");
});

test("multilevel queue: a higher queue preempts, the lowest queue is FCFS", () => {
  const r = schedule(EXAMPLES.mlq.processes, "mlq", { quantum: 2 });
  assert.equal(gantt(r), "P1:0-1 P2:1-4 P4:4-6 P1:6-11 P3:11-15");
  assert.equal(r.preemptions, 1);
  assert.equal(r.levels.length, 2);
});

test("MLFQ: using a whole quantum demotes a process one level", () => {
  const r = schedule(EXAMPLES.mlfq.processes, "mlfq", { quantum: 2 });
  assert.equal(gantt(r), "P1:0-2 P2:2-4 P3:4-6 P4:6-7 P1:7-11 P3:11-14 P1:14-17");
  const at = (t) => r.frames.find((f) => f.t === t);
  assert.deepEqual(at(2).queues, [["P3"], ["P1"], []], "P1 used its 2-unit slice in Q0 and dropped to Q1");
  assert.equal(at(14).level.P1, 2, "then its 4-unit slice in Q1, so it ends in the FCFS queue");
  assert.match(at(2).note, /demoted to Q1/);
});

test("context switches: FCFS convoy 2, RR q=4 3", () => {
  const convoy = [P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)];
  assert.equal(schedule(convoy, "fcfs").contextSwitches, 2);
  assert.equal(schedule(convoy, "rr", { quantum: 4 }).contextSwitches, 3);
});

test("SRTF explains its preemption with the remaining times", () => {
  const r = schedule([P("P1", 0, 8), P("P2", 1, 4), P("P3", 2, 9), P("P4", 3, 5)], "srtf");
  assert.match(r.frames[1].note, /P2 preempts P1: it needs only 4 more units, less than P1's 7/);
  assert.deepEqual([...r.frames[1].line].sort(), [2, 5, 6]);
});

test("fuzz: every frame has a valid pseudocode line, variables and a note", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const procs = randomProcesses(rand);
    for (const [algo, spec] of Object.entries(ALGORITHMS)) {
      const r = schedule(procs, algo, { quantum: 1 + Math.floor(rand() * 3) });
      for (const f of r.frames) {
        assert.ok(f.line.length > 0 && f.line.every((l) => l >= 1 && l <= spec.code.length), `${algo} line ${f.line}`);
        assert.ok(f.note.length > 0 && f.vars.t === f.t);
        assert.equal(f.queues.flat().length, f.ready.length);
      }
      const busy = procs.reduce((s, p) => s + p.burst, 0);
      assert.ok(r.contextSwitches >= 0 && r.contextSwitches <= busy);
      if (["fcfs", "sjf", "ljf", "hrrn", "priority"].includes(algo)) assert.equal(r.preemptions, 0);
    }
  }
});
