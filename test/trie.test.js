import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE, nodeCount, parseWords, Trie } from "../public/js/engines/trie.js";

let seed = 3;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("textbook trie: shared prefixes, search vs prefix, autocomplete, delete", () => {
  const t = new Trie();
  for (const w of ["car", "card", "care", "cat", "dog"]) t.insert(w);
  assert.equal(t.size(), nodeCount(["car", "card", "care", "cat", "dog"]));
  assert.equal(t.size(), 10);
  assert.equal(t.search("car").at(-1).vars.result, true);
  assert.equal(t.search("ca").at(-1).vars.result, false, "a prefix is not a word");
  assert.equal(t.search("ca", "prefix").at(-1).vars.result, true);
  assert.ok(t.search("cow").at(-1).bad);
  assert.deepEqual(t.complete("car").at(-1).found, ["car", "card", "care"]);
  assert.ok(t.complete("x").at(-1).bad);
  t.delete("car"); // still a prefix of card and care: nothing is pruned
  assert.equal(t.size(), 10);
  t.delete("dog");
  assert.equal(t.size(), 7);
  assert.deepEqual(t.words(), ["card", "care", "cat"]);
  assert.throws(() => parseWords("hello w0rld"));
});

test("fuzz: the trie's words match a Set, and pruning leaves no dead nodes", () => {
  const letters = "abc";
  for (let round = 0; round < 300; round++) {
    const t = new Trie(), set = new Set();
    for (let k = 0; k < 30; k++) {
      const w = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => letters[Math.floor(rand() * 3)]).join("");
      const ins = rand() < 0.55;
      const steps = ins ? t.insert(w) : t.delete(w);
      if (ins) set.add(w); else set.delete(w);
      for (const s of steps) for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= CODE[ins ? "insert" : "delete"].length);
      assert.deepEqual(t.words(), [...set].sort());
      assert.equal(t.size(), nodeCount([...set]));
      const q = w.slice(0, 1 + Math.floor(rand() * w.length));
      assert.equal(t.has(q), set.has(q));
      assert.equal(t.search(q).at(-1).done === true, set.has(q));
      assert.equal(t.hasPrefix(q), [...set].some((x) => x.startsWith(q)));
      const done = t.complete(q).at(-1);
      assert.deepEqual(done.bad ? [] : done.found, [...set].filter((x) => x.startsWith(q)).sort());
    }
  }
});
