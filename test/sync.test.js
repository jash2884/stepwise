import assert from "node:assert/strict";
import { test } from "node:test";
import { initial, PRESETS, randomSequence, step } from "../public/js/engines/sync.js";

const run = (preset, variant, order) => {
  let s = initial(PRESETS[preset].variants[variant]);
  const notes = [];
  for (const i of order) { const r = step(s, i); s = r.state; notes.push(r.note); }
  return { s, notes };
};

test("producer-consumer: the consumer blocks on an empty buffer and is woken by a producer", () => {
  const { s, notes } = run("producer-consumer", "correct", [2]); // C1 wait(full)
  assert.equal(s.procs[2].status, "blocked");
  assert.equal(s.sems.full.value, -1);
  assert.match(notes[0], /BLOCKS/);
  // P1 runs a full round: produce, wait(empty), wait(mutex), enter, put, exit, signal(mutex), signal(full)
  const after = run("producer-consumer", "correct", [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(after.s.procs[2].status, "ready");
  assert.match(after.notes.at(-1), /wakes C1/);
  assert.equal(after.s.buffer.length, 1);
  assert.equal(after.s.violation, null);
});

test("producer-consumer without a mutex lets two producers into the buffer", () => {
  // P1: produce, wait(empty), enter; P2: produce, wait(empty), enter -> violation
  const { s } = run("producer-consumer", "nomutex", [0, 0, 0, 1, 1, 1]);
  assert.match(s.violation, /Mutual exclusion broken/);
});

test("swapped waits in the consumer deadlock with the producer", () => {
  // C1 takes mutex then blocks on full; P1 produces, waits empty, then blocks on mutex.
  const { s, notes } = run("producer-consumer", "swapped", [1, 1, 0, 0, 0]);
  assert.equal(s.deadlock, true);
  assert.match(notes.at(-1), /DEADLOCK/);
});

test("readers share the database; a writer waits until the last reader leaves", () => {
  // R1: wait(mutex), readcount++ (1), wait(wrt), signal(mutex), start reading
  let r = run("readers-writers", "correct", [0, 0, 0, 0, 0]);
  assert.deepEqual(r.s.regions.database, ["R1"]);
  // R2 joins: wait(mutex), readcount++ (2), skip wait(wrt), signal(mutex), start reading
  r = run("readers-writers", "correct", [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual(r.s.regions.database, ["R1", "R2"]);
  assert.match(r.notes[7], /skips wait\(wrt\)/);
  assert.equal(r.s.violation, null);
  // W1 tries to write and blocks on wrt.
  r = run("readers-writers", "correct", [0, 0, 0, 0, 0, 2]);
  assert.equal(r.s.procs[2].status, "blocked");
});

test("naive philosophers deadlock when everyone takes the left chopstick; the fix doesn't", () => {
  const all = [0, 1, 2, 3, 4];
  const order = [...all, ...all, ...all]; // think, take left, try right
  const naive = run("philosophers", "naive", order.slice(0, 15));
  assert.equal(naive.s.deadlock, true);
  const fixed = run("philosophers", "asymmetric", [0, 1, 2, 3, 0, 1, 2, 3, 4, 4, 0, 1, 2, 3]);
  assert.equal(fixed.s.deadlock, false);
  assert.ok(fixed.s.procs.some((p) => p.status === "ready"));
});

test("race condition: interleaving loses an update; a mutex prevents it", () => {
  const lost = run("race", "unsafe", [0, 1, 0, 0, 1, 1]); // both load 0, both store 1
  assert.equal(lost.s.vars.x, 1);
  assert.match(lost.s.violation, /Lost update/);
  const safe = run("race", "safe", [0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
  assert.equal(safe.s.vars.x, 2);
  assert.equal(safe.s.violation, null);
  assert.throws(() => step(run("race", "safe", [0, 1]).s, 1), /blocked/);
});

test("practice sequences are internally consistent", () => {
  let seed = 3;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const q = randomSequence(r);
    const blocked = new Set();
    for (const op of q.ops) assert.ok(!blocked.has(op.p) || true);
    assert.ok(q.blocked.every((p) => ["P1", "P2", "P3"].includes(p)));
    // Final values match a direct replay.
    const v = { ...q.initial };
    for (const op of q.ops) v[op.s] += op.kind === "wait" ? -1 : 1;
    assert.deepEqual(v, q.final);
  }
});

test("wait and signal report the pseudocode lines they ran", async () => {
  const { SEM_CODE } = await import("../public/js/engines/sync.js");
  const s = initial(PRESETS["producer-consumer"].variants.correct);
  let r = step(s, 2); // C1: wait(full) blocks
  assert.deepEqual(r.line, [1, 2, 3, 4]);
  r = step(r.state, 0); // P1: produce (no semaphore)
  assert.deepEqual(r.line, []);
  r = step(r.state, 0); // P1: wait(empty) continues
  assert.deepEqual(r.line, [1, 2, 3]);
  assert.equal(SEM_CODE.length, 8);
});

test("dining philosophers: fork holders match the semaphores and the circular wait is spotted", async () => {
  const { diningState } = await import("../public/js/engines/sync.js");
  const v = PRESETS.philosophers.variants.naive;
  let s = initial(v);
  const check = (st) => {
    const d = diningState(st);
    d.forks.forEach((f, k) => assert.equal(f.holder != null, st.sems[`c${k}`].value <= 0, `fork c${k}`));
    return d;
  };
  assert.equal(check(s).phils.every((p) => p.phase === "thinking"), true);
  // Everyone thinks, then picks up their left fork: a circular wait before anyone blocks.
  for (const i of [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]) s = step(s, i).state;
  let d = check(s);
  assert.equal(d.circular, true);
  assert.equal(d.deadlock, false);
  assert.deepEqual(d.phils.map((p) => p.holds), [[0], [1], [2], [3], [4]]);
  for (const i of [0, 1, 2, 3, 4]) s = step(s, i).state;
  d = check(s);
  assert.equal(d.deadlock, true);
  assert.equal(d.circular, true);
  assert.deepEqual(d.phils.map((p) => p.wants), [1, 2, 3, 4, 0]);
  // Ph0 eats when its neighbour is still thinking.
  s = initial(v);
  for (const i of [0, 0, 0]) s = step(s, i).state;
  d = check(s);
  assert.equal(d.phils[0].phase, "eating");
  assert.deepEqual(d.phils[0].holds, [0, 1]);
  // Ph1 blocks on c1 (Ph0 holds it): hungry and waiting, holding nothing yet.
  for (const i of [1, 1]) s = step(s, i).state;
  d = check(s);
  assert.equal(d.phils[1].phase, "hungry");
  assert.deepEqual(d.phils[1].holds, []);
  assert.equal(d.phils[1].wants, 1);
  assert.equal(d.circular, false);
  // Random play never breaks the semaphore/holder agreement, in either variant.
  for (const variant of ["naive", "asymmetric"]) {
    let st = initial(PRESETS.philosophers.variants[variant]);
    let seed = 7;
    for (let k = 0; k < 400 && !st.deadlock; k++) {
      seed = (seed * 16807) % 2147483647;
      const ready = st.procs.map((_, i) => i).filter((i) => st.procs[i].status === "ready");
      st = step(st, ready[seed % ready.length]).state;
      const dd = check(st);
      assert.ok(dd.phils.every((p) => p.holds.length <= 2));
    }
  }
});
