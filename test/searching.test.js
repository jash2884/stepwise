import assert from "node:assert/strict";
import { test } from "node:test";
import { ALGORITHMS, binaryProbes, run } from "../public/js/engines/searching.js";

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("textbook binary search: 23 in [2 5 8 12 16 23 38 56 72 91] probes 16, 56, 23 (GeeksforGeeks example)", () => {
  const A = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
  assert.deepEqual(binaryProbes(A, 23), [4, 7, 5]);
  assert.equal(run("binary", A, 23).index, 5);
  assert.equal(run("binary", A, 24).index, -1);
  // Knuth, TAOCP vol. 3 §6.2.1: binary search never needs more than ⌊log₂ n⌋ + 1 comparisons.
  for (let n = 1; n <= 64; n++) {
    const B = Array.from({ length: n }, (_, i) => i * 2);
    for (let t = -1; t <= 2 * n; t++) assert.ok(run("binary", B, t).probes <= Math.floor(Math.log2(n)) + 1, `n=${n} t=${t}`);
  }
});

test("lower and upper bound match Python's bisect_left / bisect_right; upper − lower counts copies", () => {
  const A = [1, 3, 3, 3, 5, 7, 7, 9];
  assert.equal(run("lower", A, 3).index, 1);
  assert.equal(run("upper", A, 3).index, 4);
  assert.equal(run("lower", A, 10).index, 8);
  assert.equal(run("upper", A, 0).index, 0);
});

test("fuzz: every search agrees with indexOf / a linear scan on random arrays", () => {
  const first = (A, f) => { const i = A.findIndex(f); return i === -1 ? A.length : i; };
  for (let k = 0; k < 600; k++) {
    const n = 1 + Math.floor(rand() * 18), A = Array.from({ length: n }, () => Math.floor(rand() * 40)).sort((a, b) => a - b);
    const t = Math.floor(rand() * 44) - 2;
    for (const algo of Object.keys(ALGORITHMS)) {
      const r = run(algo, A, t);
      if (algo === "linear") assert.equal(r.index, A.indexOf(t));
      else if (algo === "lower") assert.equal(r.index, first(A, (x) => x >= t), `${A} ${t}`);
      else if (algo === "upper") assert.equal(r.index, first(A, (x) => x > t), `${A} ${t}`);
      else if (A.includes(t)) assert.equal(A[r.index], t, `${algo} ${A} ${t}`);
      else assert.equal(r.index, -1, `${algo} ${A} ${t}`);
      for (const s of r.steps) {
        if (s.line != null) assert.ok(s.line >= 1 && s.line <= ALGORITHMS[algo].code.length, `${algo} line`);
        assert.equal(typeof s.note, "string");
        // Invariant: if the target is present, the live range always contains it.
        if (s.range && (algo === "binary" || algo === "interpolation") && A.includes(t)) assert.ok(A.slice(s.range[0], s.range[1] + 1).includes(t), `${algo} lost the target`);
      }
      assert.ok(r.steps.at(-1).done);
    }
  }
});

test("unsorted input is sorted first for the algorithms that need it", () => {
  const r = run("binary", [9, 1, 5], 5);
  assert.ok(r.resorted);
  assert.deepEqual(r.A, [1, 5, 9]);
  assert.equal(r.index, 1);
});
