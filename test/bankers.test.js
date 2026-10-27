import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE, isSafeSequence, need, request, safety } from "../public/js/engines/bankers.js";

test("textbook Need matrix and safe state", () => {
  assert.deepEqual(need(EXAMPLE.max, EXAMPLE.allocation), [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]);
  const r = safety(EXAMPLE);
  assert.equal(r.safe, true);
  assert.deepEqual(r.sequence, [1, 3, 4, 0, 2]); // in-order passes find P1, P3, P4, then P0, P2
  assert.ok(isSafeSequence(EXAMPLE, [1, 3, 4, 2, 0]), "the book's sequence is also valid");
  assert.ok(!isSafeSequence(EXAMPLE, [0, 1, 2, 3, 4]), "P0 can't go first");
  assert.match(r.steps.at(-1).note, /SAFE/);
});

test("requests: textbook P1 (1,0,2) is granted, then P4 (3,3,0) must wait and P0 (0,2,0) is unsafe", () => {
  const first = request(EXAMPLE, 1, [1, 0, 2]);
  assert.equal(first.granted, true);
  assert.deepEqual(first.state.available, [2, 3, 0]);
  const p4 = request(first.state, 4, [3, 3, 0]);
  assert.equal(p4.granted, false);
  assert.match(p4.reason, /exceeds Available/);
  const p0 = request(first.state, 0, [0, 2, 0]);
  assert.equal(p0.granted, false);
  assert.match(p0.reason, /unsafe/);
  assert.match(request(EXAMPLE, 1, [5, 0, 0]).reason, /exceeds P1's remaining need/);
});

test("unsafe states are detected and validation catches bad input", () => {
  const unsafe = { allocation: [[1, 0], [0, 1]], max: [[2, 1], [1, 2]], available: [0, 0] };
  assert.equal(safety(unsafe).safe, false);
  assert.throws(() => safety({ allocation: [[3]], max: [[2]], available: [1] }), /more than its maximum/);
});

// --- Pseudocode trace and the multi-request timeline --------------------------
import { EXAMPLE_REQUESTS, parseRequests, requestTimeline, SAFETY_CODE } from "../public/js/engines/bankers.js";

test("safety steps carry lines and variables", () => {
  const r = safety(EXAMPLE);
  assert.equal(r.steps[0].line, 1);
  assert.deepEqual(r.steps[1].line, [4, 7], "P0's Need (7,4,3) doesn't fit in (3,3,2)");
  assert.match(r.steps[1].note, /falls short in A \(needs 7, only 3 free\)/);
  assert.deepEqual(r.steps[2].vars.Work, [5, 3, 2], "P1 finishes and releases (2,0,0)");
  for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= SAFETY_CODE.length);
});

// Silberschatz ch. 8: P1 asks for (1,0,2) and is granted; then P4's (3,3,0)
// exceeds Available and P0's (0,2,0) would leave the state unsafe.
test("request timeline: P1 (1,0,2) granted, P4 (3,3,0) waits, P0 (0,2,0) unsafe", () => {
  const t = requestTimeline(EXAMPLE, parseRequests(EXAMPLE_REQUESTS, 3));
  assert.deepEqual(t.outcomes.map((o) => o.outcome), ["granted", "wait", "unsafe"]);
  assert.deepEqual(t.final.available, [2, 3, 0]);
  assert.deepEqual(t.final.allocation[1], [3, 0, 2]);
  assert.equal(t.steps.at(-1).line, 6);
  assert.equal(requestTimeline(EXAMPLE, parseRequests("P1 5 0 0", 3)).outcomes[0].outcome, "error");
  assert.throws(() => parseRequests("P1 1 0", 3), /needs 3 numbers/);
});
