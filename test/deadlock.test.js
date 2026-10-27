import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, EXAMPLES, matrices, parseGraph } from "../public/js/engines/deadlock.js";

const graph = (key) => parseGraph(EXAMPLES[key].resources, EXAMPLES[key].edges);

test("crossed single-instance requests are a deadlock", () => {
  const r = analyse(graph("deadlock"));
  assert.deepEqual(r.deadlocked, ["P1", "P2"]);
  assert.deepEqual(r.waitFor.cycle, ["P1", "P2", "P1"]);
  assert.match(r.verdict, /^Deadlock/);
});

test("a cycle with spare instances is not a deadlock (Silberschatz fig. 8.9 shape)", () => {
  const r = analyse(graph("cycleNoDeadlock"));
  assert.ok(r.waitFor.cycle, "there is a cycle");
  assert.deepEqual(r.deadlocked, []);
  assert.match(r.verdict, /necessary but not sufficient/);
});

test("textbook RAG with P1 → R1 → P2 → R3 → P3 → R2 → P1 deadlocks all three", () => {
  const r = analyse(graph("book"));
  assert.deepEqual(r.deadlocked, ["P1", "P2", "P3"]);
});

test("waiting without a cycle is fine; matrices are derived from edges", () => {
  const g = graph("safe");
  assert.deepEqual(matrices(g), { allocation: [[1, 0], [0, 1]], request: [[0, 0], [1, 0]], available: [0, 0] });
  const r = analyse(g);
  assert.deepEqual(r.deadlocked, []);
  assert.equal(r.waitFor.cycle, null);
});

test("input validation", () => {
  assert.throws(() => parseGraph("R1:1", "R1 -> P1\nR1 -> P2"), /1 instance but 2 assignment/);
  assert.throws(() => parseGraph("R1:1", "P1 -> P2"), /process and a resource/);
  assert.throws(() => parseGraph("R1:1", "P1 -> R9"), /isn't in the resource list/);
});

test("detection steps carry pseudocode lines and variables", async () => {
  const { DETECT_CODE } = await import("../public/js/engines/deadlock.js");
  for (const key of Object.keys(EXAMPLES)) {
    const r = analyse(graph(key));
    for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= DETECT_CODE.length, key);
    assert.deepEqual(r.steps.at(-1).vars.deadlocked, r.deadlocked);
  }
  assert.match(analyse(graph("safe")).steps[1].note, /releases what it holds/);
});
