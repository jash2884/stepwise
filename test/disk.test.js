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
