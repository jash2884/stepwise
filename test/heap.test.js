import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSwaps, CODE, Heap } from "../public/js/engines/heap.js";

let seed = 5;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("textbook builds: Floyd vs repeated inserts", () => {
  const h = new Heap("max");
  h.build([4, 1, 3, 2, 16, 9, 10, 14, 8, 7], "floyd"); // CLRS figure 6.3
  assert.deepEqual(h.values(), [16, 14, 10, 8, 7, 9, 3, 2, 4, 1]);
  // Ascending input into a max-heap: every insert climbs, Floyd does much less.
  const asc = Array.from({ length: 15 }, (_, i) => i + 1);
  assert.ok(buildSwaps(asc, "max", "floyd").swaps < buildSwaps(asc, "max", "inserts").swaps);
  assert.equal(buildSwaps([1, 2, 3, 4, 5, 6, 7], "min", "floyd").swaps, 0);
});

test("insert, extract and decrease-key", () => {
  const h = new Heap("min");
  h.build([5, 9, 3, 7, 1], "floyd");
  assert.equal(h.values()[0], 1);
  h.insert(0);
  assert.equal(h.values()[0], 0);
  assert.equal(h.extract().at(-1).vars.top, 0);
  assert.equal(h.extract().at(-1).vars.top, 1);
  const i = h.values().indexOf(9);
  h.changeKey(i, 2);
  assert.equal(h.values()[0], 2);
  assert.ok(h.changeKey(0, 50).at(-1).bad, "decrease-key cannot increase");
  assert.ok(new Heap().extract().at(-1).bad);
});

test("fuzz: the heap property holds and extracts come out in order", () => {
  for (let round = 0; round < 300; round++) {
    const kind = rand() < 0.5 ? "min" : "max", h = new Heap(kind);
    const vals = Array.from({ length: Math.floor(rand() * 20) }, () => Math.floor(rand() * 100));
    const method = rand() < 0.5 ? "floyd" : "inserts";
    for (const s of h.build(vals, method)) {
      assert.equal(new Set(s.A.map((x) => x.id)).size, s.A.length);
      for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= CODE[method].length);
    }
    assert.ok(h.valid());
    const bag = [...vals];
    for (let k = 0; k < 15; k++) {
      const r = rand();
      if (r < 0.4) { const v = Math.floor(rand() * 100); h.insert(v); bag.push(v); }
      else if (r < 0.8) {
        if (bag.length) {
          const want = kind === "min" ? Math.min(...bag) : Math.max(...bag);
          assert.equal(h.extract().at(-1).vars.top, want);
          bag.splice(bag.indexOf(want), 1);
        }
      } else if (bag.length) {
        const i = Math.floor(rand() * bag.length), old = h.values()[i], v = kind === "min" ? old - 5 : old + 5;
        h.changeKey(i, v);
        bag.splice(bag.indexOf(old), 1, v);
      }
      assert.ok(h.valid(), `${kind} ${h.values()}`);
      assert.deepEqual([...h.values()].sort((a, b) => a - b), [...bag].sort((a, b) => a - b));
    }
  }
});
