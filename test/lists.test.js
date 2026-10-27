import assert from "node:assert/strict";
import { test } from "node:test";
import { codeFor, KINDS, run } from "../public/js/engines/lists.js";

let seed = 2718;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("textbook operations on 10 → 20 → 30 → 40", () => {
  const V = [10, 20, 30, 40];
  assert.deepEqual(run({ kind: "s", values: V, op: "reverse" }).final, [40, 30, 20, 10]);
  assert.deepEqual(run({ kind: "s", values: V, op: "insertAt", pos: 2, x: 25 }).final, [10, 20, 25, 30, 40]);
  assert.deepEqual(run({ kind: "c", values: V, op: "delete", x: 10 }).final, [20, 30, 40]);
  assert.equal(run({ kind: "d", values: V, op: "search", x: 30 }).index, 2);
  assert.throws(() => run({ kind: "s", values: V, op: "insertAt", pos: 5, x: 1 }));
});

test("Floyd's tortoise and hare (Knuth, TAOCP vol. 2 ex. 3.1-6): finds the loop start, or no loop", () => {
  const V = [1, 2, 3, 4, 5, 6, 7];
  for (let c = -1; c < V.length; c++) {
    const r = run({ kind: "s", values: V, op: "floyd", cycleAt: c });
    assert.equal(r.cycle, c >= 0);
    if (c >= 0) {
      assert.equal(r.startPos, c);
      // They meet within one lap of entering the loop: μ + λ steps at most.
      assert.ok(r.meetAfter <= V.length, `c=${c}`);
      assert.equal(r.meetAfter % (V.length - c), 0, "meeting time is a multiple of the loop length");
    }
  }
  assert.equal(run({ kind: "c", values: [5, 6, 7], op: "floyd" }).startPos, 0);
});

// A plain-array model of every operation.
function model(op, V, { x, pos }) {
  const A = [...V];
  if (op === "insertHead") A.unshift(x);
  if (op === "insertTail") A.push(x);
  if (op === "insertAt") A.splice(pos, 0, x);
  if (op === "delete" && A.includes(x)) A.splice(A.indexOf(x), 1);
  if (op === "reverse") A.reverse();
  return A;
}

test("fuzz: every operation on every kind matches an array model, and links stay consistent", () => {
  for (let k = 0; k < 400; k++) {
    const n = Math.floor(rand() * 7), V = Array.from({ length: n }, () => Math.floor(rand() * 9));
    const x = Math.floor(rand() * 10), pos = Math.floor(rand() * (n + 1));
    for (const kind of Object.keys(KINDS)) for (const op of ["insertHead", "insertTail", "insertAt", "delete", "search", "reverse"]) {
      const r = run({ kind, values: V, op, x, pos });
      assert.deepEqual(r.final, model(op, V, { x, pos }), `${kind} ${op} ${V} x=${x} pos=${pos}`);
      if (op === "search") assert.equal(r.index, V.indexOf(x));
      const last = r.steps.at(-1), byId = new Map(last.nodes.map((m) => [m.id, m]));
      const lines = codeFor(op, kind).lines.length;
      for (const s of r.steps) if (s.line != null) assert.ok(s.line >= 1 && s.line <= lines, `${kind} ${op} line ${s.line}`);
      // Final structure: next pointers form the list; prev mirrors next; the ring closes for circular lists.
      const order = [];
      for (let id = last.head, guard = 0; id != null && guard <= n + 1; id = byId.get(id).next, guard++) { order.push(id); if (kind === "c" && byId.get(id).next === last.head) break; }
      assert.deepEqual(order.map((id) => byId.get(id).v), r.final);
      if (kind === "c" && order.length) assert.equal(byId.get(order.at(-1)).next, last.head);
      if (kind === "s" && order.length) assert.equal(byId.get(order.at(-1)).next, null);
      if (kind === "d") order.forEach((id, i) => assert.equal(byId.get(id).prev, i ? order[i - 1] : null, `${op} prev link`));
      // After tidying, nodes sit in slots 0, 1, 2, … in list order.
      if (op !== "search") order.forEach((id, i) => assert.equal(byId.get(id).x, i));
    }
  }
});
