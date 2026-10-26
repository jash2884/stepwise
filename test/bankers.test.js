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
