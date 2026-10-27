import assert from "node:assert/strict";
import { test } from "node:test";
import { BST, buildBst, CODE, heightOf, inorderKeys, traversal } from "../public/js/engines/bst.js";

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sorted = (s) => [...s].sort((a, b) => a - b);
const checkLines = (steps, code) => { for (const s of steps) for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= code.length, `line ${l}`); };

test("textbook tree: traversals, height, min, max, successor", () => {
  const t = buildBst([50, 30, 70, 20, 40, 60, 80]);
  assert.deepEqual(traversal(t.root, "inorder"), [20, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(traversal(t.root, "preorder"), [50, 30, 20, 40, 70, 60, 80]);
  assert.deepEqual(traversal(t.root, "postorder"), [20, 40, 30, 60, 80, 70, 50]);
  assert.deepEqual(traversal(t.root, "levelorder"), [50, 30, 70, 20, 40, 60, 80]);
  for (const kind of ["inorder", "preorder", "postorder", "levelorder"]) {
    const steps = t.traverse(kind);
    assert.deepEqual(steps.at(-1).visit, traversal(t.root, kind), kind);
    checkLines(steps, CODE[kind]);
  }
  assert.equal(t.height(), 2);
  assert.equal(t.heightSteps().at(-1).vars.height, 2);
  assert.equal(t.extreme("min").at(-1).vars.min, 20);
  assert.equal(t.extreme("max").at(-1).vars.max, 80);
  assert.equal(t.successor(40).at(-1).vars.successor, 50); // no right subtree: last left turn
  assert.equal(t.successor(50).at(-1).vars.successor, 60); // min of the right subtree
  assert.equal(t.successor(80).at(-1).vars.successor, null);
  assert.ok(t.successor(55).at(-1).bad);
  assert.equal(heightOf(buildBst([1, 2, 3, 4]).root), 3); // sorted input makes a chain
});

test("delete covers all three cases and uses the in-order successor", () => {
  const t = buildBst([50, 30, 70, 20, 40, 60, 80, 65]);
  t.delete(20); // leaf
  assert.deepEqual(t.keys(), [30, 40, 50, 60, 65, 70, 80]);
  t.delete(60); // one child (65)
  assert.equal(t.root.right.left.key, 65);
  t.delete(50); // two children: successor 65 replaces the root
  assert.equal(t.root.key, 65);
  assert.deepEqual(t.keys(), [30, 40, 65, 70, 80]);
  assert.ok(t.delete(999).at(-1).bad);
  assert.ok(t.insert(40).at(-1).bad, "duplicates are ignored");
});

test("fuzz: in-order stays sorted and matches a Set after random inserts and deletes", () => {
  for (let round = 0; round < 200; round++) {
    const t = new BST(), set = new Set();
    for (let k = 0; k < 40; k++) {
      const v = Math.floor(rand() * 30);
      if (rand() < 0.6) { checkLines(t.insert(v), CODE.insert); set.add(v); } else { checkLines(t.delete(v), CODE.delete); set.delete(v); }
      assert.deepEqual(inorderKeys(t.root), sorted(set));
      if (rand() < 0.2) assert.equal(t.search(v).at(-1).done === true, set.has(v));
    }
    // ids stay unique, so morph() never confuses two nodes
    const ids = [];
    const walk = (n) => { if (n) { ids.push(n.id); walk(n.left); walk(n.right); } };
    walk(t.root);
    assert.equal(new Set(ids).size, ids.length);
    const ks = sorted(set);
    ks.forEach((k, i) => assert.equal(t.successor(k).at(-1).vars.successor, ks[i + 1] ?? null));
  }
});
