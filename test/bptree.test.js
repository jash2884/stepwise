import assert from "node:assert/strict";
import { test } from "node:test";
import { BPlusTree } from "../public/js/engines/bptree.js";

const build = (order, keys) => { const t = new BPlusTree(order); keys.forEach((k) => t.insert(k)); return t; };

test("order 4: a leaf split copies the right leaf's first key up", () => {
  const t = build(4, [1, 2, 3, 4]);
  assert.deepEqual(t.facts(), { root: [3], leaves: [[1, 2], [3, 4]], height: 2, leafCount: 2 });
});

test("order 3: internal splits move the middle key up", () => {
  const t = build(3, [1, 2, 3, 4, 5, 6, 7]);
  // Leaves [1,2] [3,4] [5,6] [7]; the root [3,5,7] overflows and MOVES 5 up.
  assert.deepEqual(t.facts(), { root: [5], leaves: [[1, 2], [3, 4], [5, 6], [7]], height: 3, leafCount: 4 });
  assert.deepEqual(t.check().errors, []);
});

test("deletion: borrow from a sibling, then merge and shrink the tree", () => {
  const t = build(4, [10, 20, 30, 40, 50]);
  assert.deepEqual(t.facts().leaves, [[10, 20], [30, 40, 50]]);
  const borrow = t.delete(20); // [10] underflows; the right sibling has 3 keys to spare
  assert.deepEqual(t.facts().leaves, [[10, 30], [40, 50]]);
  assert.deepEqual(t.facts().root, [40]);
  assert.ok(borrow.some((f) => /Borrow 30 from the right sibling/.test(f.note)));
  const merged = t.delete(40); // [50] underflows; [10,30] can't spare a key: merge, and the root disappears
  assert.deepEqual(t.facts(), { root: [10, 30, 50], leaves: [[10, 30, 50]], height: 1, leafCount: 1 });
  assert.ok(merged.some((f) => /merge the leaves/.test(f.note)));
  assert.ok(merged.some((f) => /tree shrinks one level/.test(f.note)));
});

test("search notes explain every routing decision", () => {
  const t = build(4, [5, 10, 15, 20, 25]);
  const { found, frames } = t.search(15);
  assert.equal(found, true);
  assert.match(frames[0].note, /10 ≤ 15 < 20|15 ≥ 15|follow child/);
  assert.equal(t.search(99).found, false);
  assert.match(t.insert(15)[0].note, /already in the tree/);
  assert.match(t.delete(99).at(-1).note, /isn't in the tree/);
});

test("property: random inserts and deletes keep every invariant (orders 3-7)", () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let order = 3; order <= 7; order++) {
    for (let run = 0; run < 25; run++) {
      const t = new BPlusTree(order), model = new Set();
      for (let op = 0; op < 120; op++) {
        const k = Math.floor(rand() * 60);
        if (rand() < 0.6) { t.insert(k); model.add(k); } else { t.delete(k); model.delete(k); }
        const { errors, keys } = t.check();
        assert.deepEqual(errors, [], `order ${order}, run ${run}, op ${op}`);
        assert.deepEqual(keys, [...model].sort((a, b) => a - b));
      }
    }
  }
});

test("snapshots are independent copies and validation works", () => {
  const t = build(4, [1, 2, 3]);
  const frames = t.insert(4);
  t.insert(5);
  assert.deepEqual(frames.at(-1).nodes.find((n) => n.id === frames.at(-1).root).keys, [3]);
  assert.throws(() => new BPlusTree(2), /Order/);
  assert.throws(() => t.insert(1.5), /whole numbers/);
});
