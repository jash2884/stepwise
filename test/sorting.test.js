import assert from "node:assert/strict";
import { test } from "node:test";
import { afterPasses, ALGORITHMS, run } from "../public/js/engines/sorting.js";

let seed = 99;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("every algorithm sorts random arrays, keeps every element, and steps are well formed", () => {
  for (let k = 0; k < 300; k++) {
    const n = 2 + Math.floor(rand() * 15), vals = Array.from({ length: n }, () => Math.floor(rand() * 120));
    for (const algo of Object.keys(ALGORITHMS)) {
      const r = run(algo, vals);
      assert.deepEqual(r.result, [...vals].sort((a, b) => a - b), `${algo} ${vals}`);
      for (const s of r.steps) {
        const ids = [...s.A, ...(s.T ?? [])].filter(Boolean).map((x) => x.id);
        if (!s.buckets) assert.equal(new Set(ids).size, ids.length, `${algo}: no element duplicated`);
        if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= ALGORITHMS[algo].code.length, `${algo} line ${l}`);
      }
    }
  }
});

test("stable sorts keep equal keys in their original order", () => {
  const vals = [5, 3, 5, 1, 3, 5, 1];
  for (const algo of ["bubble", "insertion", "merge", "counting", "radix"]) {
    const final = run(algo, vals).steps.at(-1).A;
    const order = (v) => final.filter((x) => x.v === v).map((x) => x.id);
    for (const v of [1, 3, 5]) assert.deepEqual(order(v), [...order(v)].sort((a, b) => a - b), `${algo} on ${v}`);
  }
});

test("textbook counts: bubble swaps = inversions; bubble stops early on sorted input; selection does n(n-1)/2 comparisons", () => {
  const vals = [5, 1, 4, 2, 8];
  assert.equal(run("bubble", vals).writes / 2, 4); // inversions (5,1) (5,4) (5,2) (4,2)
  assert.equal(run("bubble", [1, 2, 3, 4, 5]).comparisons, 4);
  assert.equal(run("selection", [9, 8, 7, 6, 5, 4]).comparisons, 15);
  assert.deepEqual(afterPasses("bubble", [5, 1, 4, 2, 8], 1), [1, 4, 2, 5, 8]);
  assert.deepEqual(afterPasses("selection", [64, 25, 12, 22, 11], 2), [11, 12, 25, 22, 64]);
  assert.deepEqual(afterPasses("insertion", [12, 11, 13, 5, 6], 3), [5, 11, 12, 13, 6]);
});
