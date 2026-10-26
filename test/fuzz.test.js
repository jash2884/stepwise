// Fuzz tests: every engine on thousands of random inputs, checked against
// invariants that must always hold. These catch the edge cases worked examples miss.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeSequence, randomState, safety } from "../public/js/engines/bankers.js";
import { analyse as deadlock, parseGraph, randomGraph } from "../public/js/engines/deadlock.js";
import { ALGORITHMS as DISK, randomQueue, schedule as disk } from "../public/js/engines/disk.js";
import { candidateKeys, closure, normalForm, randomSchema } from "../public/js/engines/fd.js";
import { extendible, hashTable, randomKeys, STRATEGIES } from "../public/js/engines/hashing.js";
import { join, JOINS, parseTable, randomTables } from "../public/js/engines/joins.js";
import { ALGORITHMS as PAGING, randomRefs, replace } from "../public/js/engines/paging.js";
import { analyse as schedules, randomSchedule } from "../public/js/engines/schedules.js";
import { ALGORITHMS as CPU, randomProcesses, schedule as cpu } from "../public/js/engines/scheduling.js";
import { canRun, initial, PRESETS, step } from "../public/js/engines/sync.js";

let seed = 20261026;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 300;

test("CPU scheduling: every process gets exactly its burst, segments never overlap", () => {
  for (let k = 0; k < N; k++) {
    const procs = randomProcesses(rand);
    for (const algo of Object.keys(CPU)) {
      const r = cpu(procs, algo, { quantum: 1 + Math.floor(rand() * 4) });
      for (const p of procs) {
        const ran = r.timeline.filter((s) => s.id === p.id).reduce((n, s) => n + s.end - s.start, 0);
        assert.equal(ran, p.burst, `${algo}: ${p.id}`);
        const res = r.results.find((x) => x.id === p.id);
        assert.ok(res.ct >= p.arrival + p.burst && res.wt >= 0 && res.rt >= 0 && res.rt <= res.wt);
        assert.ok(r.timeline.filter((s) => s.id === p.id).every((s) => s.start >= p.arrival), "never runs before arriving");
      }
      r.timeline.slice(1).forEach((s, i) => assert.equal(s.start, r.timeline[i].end, "contiguous, non-overlapping"));
    }
  }
});

test("page replacement: OPT ≤ LRU and FIFO, faults ≥ distinct pages, frames never duplicate", () => {
  for (let k = 0; k < N; k++) {
    const refs = randomRefs(rand), frames = 1 + Math.floor(rand() * 5);
    const f = Object.fromEntries(Object.keys(PAGING).map((a) => [a, replace(refs, frames, a)]));
    assert.ok(f.optimal.faults <= f.lru.faults && f.optimal.faults <= f.fifo.faults);
    for (const r of Object.values(f)) {
      assert.ok(r.faults >= new Set(refs).size || frames < new Set(refs).size);
      for (const s of r.steps) { const live = s.frames.filter((x) => x !== null); assert.equal(new Set(live).size, live.length); assert.ok(live.includes(s.page)); }
    }
  }
});

test("disk scheduling: every request is served once and the total adds up", () => {
  for (let k = 0; k < N; k++) {
    const { requests, head } = randomQueue(rand);
    for (const algo of Object.keys(DISK)) for (const direction of ["up", "down"]) {
      const r = disk(requests, head, algo, { direction });
      assert.deepEqual([...r.order].sort((a, b) => a - b), [...requests].sort((a, b) => a - b), algo);
      assert.equal(r.total, r.moves.reduce((s, m) => s + m.distance, 0));
    }
    // SSTF never does worse than... at least it's never negative, and FCFS is an upper bound for LOOK? Not in general; just check sanity.
  }
});

test("Banker's: every reported safe sequence really is safe", () => {
  for (let k = 0; k < N; k++) {
    const s = randomState(rand, 3 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 3));
    const r = safety(s);
    if (r.safe) assert.ok(isSafeSequence(s, r.sequence));
    else assert.ok(r.sequence.length < s.allocation.length);
  }
});

test("deadlock: with single-instance resources, deadlock ⇔ a wait-for cycle", () => {
  for (let k = 0; k < N; k++) {
    const { resources, edges } = randomGraph(rand);
    const g = parseGraph(resources, edges);
    const r = deadlock(g);
    if (r.waitFor.singleInstance) assert.equal(!!r.waitFor.cycle, r.deadlocked.length > 0, `${resources} | ${edges}`);
    if (r.deadlocked.length) assert.ok(r.waitFor.cycle, "a deadlock always has a cycle");
  }
});

test("joins: row counts follow from the matching pairs", () => {
  for (let k = 0; k < N; k++) {
    const t = randomTables(rand);
    const A = parseTable("A", t.A), B = parseTable("B", t.B);
    const key = (row, cols) => row[cols.indexOf("k")];
    const pairs = A.rows.flatMap((a) => B.rows.filter((b) => key(a, A.columns) !== null && key(a, A.columns) === key(b, B.columns)).map((b) => [a, b]));
    const unA = A.rows.filter((a) => !pairs.some(([x]) => x === a)).length;
    const unB = B.rows.filter((b) => !pairs.some(([, y]) => y === b)).length;
    const n = (type) => join(A, B, type, t.on).rows.length;
    assert.equal(n("inner"), pairs.length);
    assert.equal(n("left"), pairs.length + unA);
    assert.equal(n("right"), pairs.length + unB);
    assert.equal(n("full"), pairs.length + unA + unB);
    assert.equal(n("cross"), A.rows.length * B.rows.length);
    assert.equal(n("semi") + n("anti"), A.rows.length);
    for (const type of Object.keys(JOINS)) if (type !== "natural") assert.ok(join(A, B, type, t.on).steps.length > 0);
  }
});

test("schedules: a serial order respects every precedence edge", () => {
  for (let k = 0; k < N; k++) {
    const r = schedules(randomSchedule(rand));
    if (r.conflictSerializable) {
      for (const e of r.edges) assert.ok(r.order.indexOf(e.from) < r.order.indexOf(e.to));
      assert.equal(r.viewSerializable, true, "conflict-serialisable implies view-serialisable");
    } else assert.ok(r.cycle.length >= 3);
  }
});

test("normalisation: candidate keys are minimal superkeys and the normal forms nest", () => {
  for (let k = 0; k < N; k++) {
    const { attrs, fds } = randomSchema(rand);
    const { keys } = candidateKeys(attrs, fds);
    assert.ok(keys.length >= 1);
    for (const key of keys) {
      assert.equal(closure(key, fds).closure, attrs);
      for (const a of key) assert.notEqual(closure(key.replace(a, ""), fds).closure, attrs, `${key} isn't minimal`);
    }
    const nf = normalForm(attrs, fds);
    const order = ["1NF", "2NF", "3NF", "BCNF"];
    if (order.indexOf(nf.form) >= 3) assert.equal(nf.violations.BCNF.length, 0);
    if (nf.violations["3NF"].length) assert.ok(order.indexOf(nf.form) < 2);
  }
});

test("hashing: every key can be found again; extendible invariants hold", () => {
  for (let k = 0; k < N; k++) {
    const keys = randomKeys(rand), m = 7 + Math.floor(rand() * 8);
    for (const strategy of Object.keys(STRATEGIES)) {
      const r = hashTable(keys, m, strategy);
      const stored = strategy === "chaining" ? r.table.flat() : r.table.filter((x) => x !== null);
      const failed = r.steps.filter((s) => s.failed).map((s) => s.key);
      assert.deepEqual([...stored, ...failed].sort((a, b) => a - b), [...keys].sort((a, b) => a - b));
    }
    try {
      const e = extendible(keys, 1 + Math.floor(rand() * 3));
      assert.equal(e.dir.length, 2 ** e.global);
      for (const b of e.buckets) for (const key of b.keys) assert.equal(e.dir[key % 2 ** e.global], b.id);
    } catch (err) { assert.match(err.message, /more than 64 entries/); }
  }
});

test("semaphores: random interleavings never crash and keep the counting invariant", () => {
  for (const [, preset] of Object.entries(PRESETS)) for (const variant of Object.values(preset.variants)) {
    for (let run = 0; run < 40; run++) {
      let s = initial(variant);
      const waits = {}, signals = {};
      for (let t = 0; t < 120 && !s.deadlock; t++) {
        const ready = s.procs.map((_, i) => i).filter((i) => canRun(s, i));
        const i = ready[Math.floor(rand() * ready.length)];
        const p = s.procs[i], op = p.program[p.pc];
        const skipped = op.if && s.vars[op.if.v] !== op.if.eq;
        s = step(s, i).state;
        if (!skipped && op.op === "wait") waits[op.s] = (waits[op.s] ?? 0) + 1;
        if (!skipped && op.op === "signal") signals[op.s] = (signals[op.s] ?? 0) + 1;
        for (const [name, sem] of Object.entries(s.sems)) {
          assert.equal(sem.value, variant.sems[name] - (waits[name] ?? 0) + (signals[name] ?? 0));
          assert.equal(sem.queue.length, Math.max(0, -sem.value), "blocked count = −value");
        }
      }
      if (variant.name === "Correct" || variant.name.startsWith("With a mutex") || variant.name.startsWith("Fix")) {
        assert.equal(s.violation, null, `${variant.name} must never break its invariant`);
        assert.equal(s.deadlock, false, `${variant.name} must never deadlock`);
      }
    }
  }
});
