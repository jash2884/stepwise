import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE, schedule } from "../public/js/engines/disk.js";

const { requests, head } = EXAMPLE;
const run = (algo, opts) => schedule(requests, head, algo, { cylinders: 200, ...opts });

// Silberschatz, ch. 11: queue 98 183 37 122 14 124 65 67, head at 53, cylinders 0-199.
test("textbook totals for every algorithm", () => {
  assert.equal(run("fcfs").total, 640);
  assert.equal(run("sstf").total, 236);
  assert.deepEqual(run("sstf").order, [65, 67, 37, 14, 98, 122, 124, 183]);
  assert.equal(run("scan", { direction: "down" }).total, 236);
  assert.deepEqual(run("scan", { direction: "down" }).path, [53, 37, 14, 0, 65, 67, 98, 122, 124, 183]);
  assert.equal(run("look", { direction: "up" }).total, 299);
});

test("circular algorithms, with and without counting the return jump", () => {
  assert.deepEqual(run("cscan").path, [53, 65, 67, 98, 122, 124, 183, 199, 0, 14, 37]);
  assert.equal(run("cscan").total, 382);
  assert.equal(run("cscan", { countJump: false }).total, 183);
  assert.deepEqual(run("clook").path, [53, 65, 67, 98, 122, 124, 183, 14, 37]);
  assert.equal(run("clook").total, 322);
  assert.equal(run("clook", { countJump: false }).total, 153);
  assert.deepEqual(run("clook").order, [65, 67, 98, 122, 124, 183, 14, 37]);
});

test("edge cases: request at the head, nothing behind, validation", () => {
  assert.equal(schedule([53, 60], 53, "sstf").total, 7);
  assert.deepEqual(schedule([60, 70], 53, "scan").path, [53, 60, 70], "SCAN doesn't run to the edge if nothing is behind");
  assert.throws(() => schedule([300], 53, "fcfs"), /from 0 to 199/);
});

// --- N-step SCAN and the pseudocode trace -------------------------------------
import { ALGORITHMS, randomQueue } from "../public/js/engines/disk.js";

test("N-step SCAN: batches of N in arrival order, each swept with SCAN", () => {
  const r = run("nstep", { n: 3 });
  assert.deepEqual(r.path, [53, 98, 183, 199, 37, 14, 0, 122, 124, 199, 67, 65]);
  assert.equal(r.total, 678);
  assert.equal(run("nstep", { n: 8 }).total, run("scan").total, "one batch holding everything is plain SCAN");
  assert.throws(() => run("nstep", { n: 0 }), /N must be/);
});

test("every move names a pseudocode line and explains itself", () => {
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const q = randomQueue(rand);
    for (const [algo, spec] of Object.entries(ALGORITHMS)) {
      const r = schedule(q.requests, q.head, algo, { n: 1 + Math.floor(rand() * 5), direction: rand() < 0.5 ? "up" : "down" });
      for (const m of [r.initial, ...r.moves]) assert.ok([m.line].flat().every((l) => l >= 1 && l <= spec.code.length) && m.note, algo);
      assert.equal(r.moves.at(-1)?.vars.pending.length ?? 0, 0, "nothing left pending at the end");
    }
  }
});

// --- F-SCAN: two queues and arrival times -------------------------------------
import { FSCAN_EXAMPLE, parseArrivals, parseRequests, randomArrivals } from "../public/js/engines/disk.js";

test("cylinder@time parses; plain cylinders arrive at 0", () => {
  assert.deepEqual(parseArrivals("98 183@12, 37@0"), { requests: [98, 183, 37], arrivals: [0, 12, 0] });
  assert.deepEqual(parseRequests("98@5 183"), [98, 183]);
  assert.throws(() => parseArrivals("98@x"), /cylinder@time/);
  assert.equal(schedule([98, 183], 53, "sstf", { arrivals: [0, 500] }).total, schedule([98, 183], 53, "sstf").total, "only F-SCAN reads arrival times");
});

test("F-SCAN: the Silberschatz queue with four late arrivals", () => {
  const { requests: q, arrivals, head: h } = FSCAN_EXAMPLE;
  const r = schedule(q, h, "fscan", { arrivals, direction: "up" });
  // Sweep 1 (t = 0): 98 183 37 122 frozen; 14, 124 arrive at 20 and 65, 67 at 60 and wait.
  // The head passes 124 at t = 71 but doesn't stop. Then the queues swap at t = 308.
  assert.deepEqual(r.path, [53, 98, 122, 183, 199, 37, 37, 14, 0, 65, 67, 124]);
  assert.deepEqual(r.order, [98, 122, 183, 37, 14, 65, 67, 124]);
  assert.equal(r.total, 469);
  assert.equal(r.sweeps, 2);
  const swap = r.moves.find((m) => m.kind === "swap");
  assert.equal(swap.time, 308);
  assert.equal(swap.line, 7);
  assert.deepEqual(swap.queues.active, [4, 5, 6, 7]);
  assert.deepEqual(r.moves[0].queues.waiting, [4, 5]);
  assert.match(r.moves[2].note, /passes 124/);
  assert.deepEqual(r.initial.queues, { active: [0, 1, 2, 3], waiting: [], later: [4, 5, 6, 7], served: [] });
});

test("F-SCAN: all arrivals at 0 is plain SCAN, and the head idles when nothing has arrived", () => {
  for (const direction of ["up", "down"]) {
    assert.deepEqual(run("fscan", { direction }).path, run("scan", { direction }).path);
    assert.deepEqual(run("fscan", { direction }).path, run("nstep", { direction, n: 8 }).path, "same as one N-step batch");
  }
  const r = schedule([10, 50], 0, "fscan", { arrivals: [5, 100] });
  assert.deepEqual(r.path, [0, 10, 10, 50]);
  assert.equal(r.total, 50);
  assert.equal(r.moves[1].time, 100, "waits from t = 10 to t = 100");
  assert.match(r.initial.note, /waits/);
  // An arrival at the exact moment of the swap joins the new active queue.
  const s = schedule([10, 20, 5], 0, "fscan", { arrivals: [0, 5, 10] });
  assert.deepEqual(s.order, [10, 20, 5]);
  assert.deepEqual(s.moves[1].queues.active, [1, 2]);
});

test("fuzz: F-SCAN serves every request once, after it arrives, and the total is the sum of the moves", () => {
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    const q = randomQueue(rand), arrivals = randomArrivals(rand, q.requests.length);
    const direction = rand() < 0.5 ? "up" : "down";
    const r = schedule(q.requests, q.head, "fscan", { arrivals, direction });
    const served = r.moves.filter((m) => m.kind === "serve");
    assert.deepEqual(served.map((m) => m.id).sort((a, b) => a - b), q.requests.map((_, i) => i), "each request exactly once");
    assert.deepEqual([...r.order].sort((a, b) => a - b), [...q.requests].sort((a, b) => a - b));
    assert.equal(r.total, r.moves.reduce((s, m) => s + m.distance, 0));
    assert.deepEqual(r.path.slice(1), r.moves.map((m) => m.to));
    let t = 0, active = new Set(r.initial.queues.active);
    for (const m of r.moves) {
      assert.ok(m.time >= t + m.distance, "1 cylinder per time unit");
      t = m.time;
      if (m.kind === "swap") { assert.equal(active.size, 0, "swap only when the active queue is empty"); active = new Set(m.queues.active); }
      if (m.kind === "serve") {
        assert.ok(active.has(m.id), "only frozen, active requests are served");
        assert.ok(arrivals[m.id] <= m.time);
        active.delete(m.id);
      }
      assert.ok([m.line].flat().every((l) => l >= 1 && l <= ALGORITHMS.fscan.code.length) && m.note);
    }
  }
});
