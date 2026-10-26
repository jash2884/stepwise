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

// --- Computer networks ---------------------------------------------------------
import { simulate as congestion } from "../public/js/engines/congestion.js";
import { crc, crcCheck, GENERATORS, hammingCheck, hammingEncode, randomBits } from "../public/js/engines/errors.js";
import { fragment } from "../public/js/engines/fragment.js";
import { dijkstra, distanceVector, parseNetwork, randomNetwork } from "../public/js/engines/routing.js";
import { simulate as sliding } from "../public/js/engines/sliding.js";
import { analyse as subnet, maskOf, randomAddress, vlsm } from "../public/js/engines/subnet.js";

test("subnetting: the address sits inside its aligned block; VLSM blocks never overlap", () => {
  for (let k = 0; k < N; k++) {
    const { ip, prefix } = randomAddress(rand);
    const r = subnet(ip, prefix);
    assert.ok(r.network <= ip && ip <= r.broadcast);
    assert.equal(((r.network & ~maskOf(prefix)) >>> 0), 0);
    assert.equal(r.broadcast - r.network + 1, r.total);
    const needs = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => ({ name: `N${i}`, hosts: 1 + Math.floor(rand() * 60) }));
    const v = vlsm(ip, 22, needs);
    const blocks = v.rows.filter((x) => !x.failed).map((x) => [x.network, x.broadcast]).sort((a, b) => a[0] - b[0]);
    blocks.forEach(([s, e], i) => {
      assert.equal((s & ~maskOf(32 - Math.log2(e - s + 1))) >>> 0, 0, "aligned");
      if (i) assert.ok(s > blocks[i - 1][1], "no overlap");
    });
    for (const row of v.rows.filter((x) => !x.failed)) assert.ok(row.usable >= row.hosts);
  }
});

test("error detection: CRC catches every single-bit error; Hamming fixes it", () => {
  for (let k = 0; k < N; k++) {
    const data = randomBits(rand, 4 + Math.floor(rand() * 12)), gen = GENERATORS[Math.floor(rand() * GENERATORS.length)];
    const c = crc(data, gen);
    assert.equal(crcCheck(c.codeword, gen).ok, true);
    const i = Math.floor(rand() * c.codeword.length);
    const bad = c.codeword.slice(0, i) + (c.codeword[i] === "1" ? "0" : "1") + c.codeword.slice(i + 1);
    assert.equal(crcCheck(bad, gen).ok, false);
    const h = hammingEncode(data);
    const j = Math.floor(rand() * h.n);
    const flipped = h.codeword.slice(0, j) + (h.codeword[j] === "1" ? "0" : "1") + h.codeword.slice(j + 1);
    assert.equal(hammingCheck(flipped).corrected, h.codeword);
  }
});

test("fragmentation: fragments tile the data exactly, in 8-byte units", () => {
  for (let k = 0; k < N; k++) {
    const total = 100 + Math.floor(rand() * 9000), mtu = 68 + Math.floor(rand() * 1500);
    const r = fragment(total, mtu);
    assert.equal(r.fragments.reduce((s, f) => s + f.data, 0), total - 20);
    r.fragments.forEach((f, i) => {
      assert.ok(f.length <= Math.max(mtu, total <= mtu ? total : 0) || f.length <= mtu);
      assert.equal(f.offset * 8, f.first);
      if (i < r.fragments.length - 1) { assert.equal(f.data % 8, 0); assert.equal(f.mf, 1); } else assert.equal(f.mf, 0);
    });
  }
});

test("congestion control: slow start never overshoots ssthresh; losses halve it", () => {
  for (let k = 0; k < N; k++) {
    const events = [{ round: 4 + Math.floor(rand() * 10), type: rand() < 0.5 ? "timeout" : "dupack" }];
    const r = congestion({ ssthresh: 2 + Math.floor(rand() * 30), rounds: 30, events, variant: rand() < 0.5 ? "tahoe" : "reno" });
    r.series.forEach((p, i) => {
      assert.ok(p.cwnd >= 1);
      const prev = r.series[i - 1];
      if (prev && !prev.event && prev.cwnd < prev.ssthresh) assert.ok(p.cwnd <= prev.ssthresh);
      if (prev?.event) assert.equal(p.ssthresh, Math.max(Math.floor(prev.cwnd / 2), 2));
    });
  }
});

test("routing: Dijkstra distances are consistent and distance vector agrees", () => {
  for (let k = 0; k < 80; k++) {
    const g = parseNetwork(randomNetwork(rand));
    const src = g.nodes[0];
    const d = dijkstra(g, src).dist;
    for (const l of g.links) assert.ok(Math.abs(d[l.a] - d[l.b]) <= l.cost);
    const dv = distanceVector(g).rounds.at(-1).vectors;
    for (const y of g.nodes) assert.equal(dv[src][y].cost, d[y]);
  }
});

test("sliding window: every frame is delivered exactly once, in order, whatever is lost", () => {
  for (let k = 0; k < N; k++) {
    const frames = 2 + Math.floor(rand() * 9), protocol = ["sw", "gbn", "sr"][Math.floor(rand() * 3)];
    const losses = new Set();
    for (let i = 0; i < 3; i++) losses.add(`${rand() < 0.7 ? "F" : "A"}${Math.floor(rand() * frames)}#${1 + Math.floor(rand() * 2)}`);
    const everyKth = rand() < 0.2 ? 4 : 0;
    let r;
    try {
      r = sliding({ protocol, frames, window: 1 + Math.floor(rand() * 5), delay: 1 + Math.floor(rand() * 2), losses, everyKth });
    } catch (e) {
      // Only a periodic loss pattern can line up with retries forever; explicit losses always finish.
      assert.ok(e.livelock && everyKth, e.message);
      continue;
    }
    assert.deepEqual(r.delivered, Array.from({ length: frames }, (_, i) => i), `${protocol} ${[...losses]}`);
    assert.ok(r.framesSent >= frames);
  }
});
