import assert from "node:assert/strict";
import { test } from "node:test";
import { AVL, buildAvl, CODE, rotationCase } from "../public/js/engines/avl.js";
import { inorderKeys } from "../public/js/engines/bst.js";

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("the four rotation cases", () => {
  assert.equal(rotationCase([30, 20], 10), "LL");
  assert.equal(rotationCase([10, 20], 30), "RR");
  assert.equal(rotationCase([30, 10], 20), "LR");
  assert.equal(rotationCase([10, 30], 20), "RL");
  assert.equal(rotationCase([20, 10, 30], 5), null);
  for (const keys of [[30, 20, 10], [10, 20, 30], [30, 10, 20], [10, 30, 20]]) {
    const t = buildAvl(keys);
    assert.equal(t.root.key, 20);
    assert.equal(t.check(), 1);
  }
});

test("textbook sequence 1..7 gives a perfect tree; delete rebalances", () => {
  const t = buildAvl([1, 2, 3, 4, 5, 6, 7]);
  assert.equal(t.root.key, 4);
  assert.equal(t.check(), 2);
  const u = buildAvl([20, 10, 30, 5, 25, 40, 2]);
  const steps = u.delete(30);
  u.check();
  assert.deepEqual(inorderKeys(u.root), [2, 5, 10, 20, 25, 40]);
  const v = buildAvl([20, 10, 30, 5]);
  assert.equal(v.delete(30).find((s) => s.vars?.case)?.vars.case, "LL");
  assert.equal(v.root.key, 10);
  for (const s of steps) for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= CODE.delete.length);
});

test("fuzz: balance stays within ±1, heights are right, keys match a Set", () => {
  for (let round = 0; round < 200; round++) {
    const t = new AVL(), set = new Set();
    for (let k = 0; k < 50; k++) {
      const v = Math.floor(rand() * 40), ins = rand() < 0.6;
      const steps = ins ? t.insert(v) : t.delete(v);
      if (ins) set.add(v); else set.delete(v);
      t.check();
      assert.deepEqual(inorderKeys(t.root), [...set].sort((a, b) => a - b));
      for (const s of steps) for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= CODE[ins ? "insert" : "delete"].length);
      assert.ok(t.height() <= 1.45 * Math.log2(set.size + 2));
    }
  }
});
