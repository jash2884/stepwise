import assert from "node:assert/strict";
import { test } from "node:test";
import { BTree, CLRS_18_8, CODE, parseKeys } from "../public/js/engines/btree.js";

// Cormen, Leiserson, Rivest & Stein, Introduction to Algorithms (3rd ed.), Figure 18.7, t = 3.
test("CLRS figure 18.7: insert B, Q, L, F with top-down splitting", () => {
  const t = BTree.fromLevels(3, "G M P X / A C D E | J K | N O | R S T U V | Y Z");
  t.insert("B");
  assert.equal(t.levels(), "G M P X / A B C D E | J K | N O | R S T U V | Y Z");
  t.insert("Q"); // [R S T U V] is full: T moves up
  assert.equal(t.levels(), "G M P T X / A B C D E | J K | N O | Q R S | U V | Y Z");
  const grow = t.insert("L"); // the root is full: split it, the tree grows
  assert.equal(t.levels(), "P / G M | T X / A B C D E | J K L | N O | Q R S | U V | Y Z");
  assert.ok(grow.some((f) => /median P .*MOVES up into the new root/.test(f.note)));
  t.insert("F"); // [A B C D E] is full on the way down: C moves up
  assert.equal(t.levels(), CLRS_18_8);
  assert.deepEqual(t.check().errors, []);
});

// CLRS Figure 18.8 (b)–(f): every deletion case.
test("CLRS figure 18.8: deletion cases 1, 2a, 2c, 3b and 3a", () => {
  const t = BTree.fromLevels(3, CLRS_18_8);
  const notes = (frames) => frames.map((f) => f.note).join(" ");
  assert.match(notes(t.delete("F")), /Case 1/);
  assert.equal(t.levels(), "P / C G M | T X / A B | D E | J K L | N O | Q R S | U V | Y Z");
  assert.match(notes(t.delete("M")), /Case 2a.*predecessor L/);
  assert.equal(t.levels(), "P / C G L | T X / A B | D E | J K | N O | Q R S | U V | Y Z");
  assert.match(notes(t.delete("G")), /Case 2c/);
  assert.equal(t.levels(), "P / C L | T X / A B | D E J K | N O | Q R S | U V | Y Z");
  const shrink = notes(t.delete("D"));
  assert.match(shrink, /Case 3b/);
  assert.match(shrink, /tree shrinks one level/);
  assert.equal(t.levels(), "C L P T X / A B | E J K | N O | Q R S | U V | Y Z");
  assert.match(notes(t.delete("B")), /Case 3a.*right sibling/);
  assert.equal(t.levels(), "E L P T X / A C | J K | N O | Q R S | U V | Y Z");
  assert.deepEqual(t.check().errors, []);
});

test("case 2b uses the successor when the left child is minimal", () => {
  const t = BTree.fromLevels(2, "20 / 10 | 30 40");
  const f = t.delete(20);
  assert.match(f.map((x) => x.note).join(" "), /Case 2b.*successor 30/);
  assert.equal(t.levels(), "30 / 10 | 40");
});

test("search stops at an internal node; steps carry valid lines and variables", () => {
  const t = BTree.fromLevels(3, CLRS_18_8);
  const s = t.search("M");
  assert.equal(s.found, true);
  assert.equal(s.frames.length, 2);
  assert.equal(t.search("H").found, false);
  for (const f of [...s.frames, ...t.insert("H"), ...t.delete("C")]) {
    for (const l of [f.line].flat()) assert.ok(l >= 1 && l <= CODE[f.op].length, `${f.op} line ${l}`);
    assert.ok(f.vars && f.vars.t === 3);
  }
});

test("parsing and validation", () => {
  assert.deepEqual(parseKeys("a b, c"), ["A", "B", "C"]);
  assert.deepEqual(parseKeys("3 -1 20"), [3, -1, 20]);
  assert.throws(() => parseKeys("3 a"), /not a mix/);
  assert.throws(() => new BTree(5), /2, 3 or 4/);
  assert.throws(() => BTree.fromLevels(3, "P / A B"), /too few nodes/);
  assert.throws(() => BTree.fromLevels(2, "P / A B C D | Q"), /isn't a valid B-tree/);
  const t = new BTree(2);
  t.insert(5);
  assert.throws(() => t.insert("A"), /mix/);
  assert.match(t.insert(5)[0].note, /already in the tree/);
  assert.match(t.delete(9).at(-1).note, /isn't in/);
});

test("fuzz: random inserts and deletes keep every B-tree invariant and match a sorted Set (t = 2, 3, 4)", () => {
  let seed = 4242;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 2; t <= 4; t++) {
    for (let run = 0; run < 30; run++) {
      const tree = new BTree(t), model = new Set();
      for (let op = 0; op < 150; op++) {
        const k = Math.floor(rand() * 70);
        if (rand() < 0.58) { tree.insert(k); model.add(k); } else { tree.delete(k); model.delete(k); }
        const { errors, keys } = tree.check();
        assert.deepEqual(errors, [], `t ${t}, run ${run}, op ${op}`);
        assert.deepEqual(keys, [...model].sort((a, b) => a - b));
      }
      // Rebuilding from the printed levels gives the same tree.
      if (model.size) assert.equal(BTree.fromLevels(t, tree.levels()).levels(), tree.levels());
    }
  }
});
