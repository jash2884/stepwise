import assert from "node:assert/strict";
import { test } from "node:test";
import { code, compare, DSU, parseOps } from "../public/js/engines/unionfind.js";

let seed = 13;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("union by rank and path compression on a textbook example", () => {
  const d = new DSU(8, { mode: "rank", compress: true });
  for (const op of parseOps("u0-1,u2-3,u0-2,u4-5,u6-7,u4-6,u0-4", 8)) d.run(op);
  assert.equal(d.root(7), 0);
  assert.equal(d.rank[0], 3);
  assert.equal(d.height(), 3); // 7 → 6 → 4 → 0
  d.run(["f", 7]);
  assert.equal(d.parent[7], 0);
  assert.equal(d.parent[6], 0);
  assert.equal(d.height(), 2);
  // Naive union on a chain: the tree is n − 1 tall.
  const naive = new DSU(6, { mode: "naive", compress: false });
  for (let i = 0; i < 5; i++) naive.run(["u", i, i + 1]);
  assert.equal(naive.height(), 5);
  const res = compare(6, [...Array(5)].map((_, i) => ["u", i, i + 1]).concat([["f", 0], ["f", 0]]));
  assert.ok(res.find((r) => r.mode === "naive" && !r.compress).hops > res.find((r) => r.mode === "rank" && r.compress).hops);
  assert.throws(() => parseOps("u1-9", 8));
  assert.throws(() => parseOps("x1", 8));
});

test("fuzz: every strategy agrees with a naive set-merging model; rank and size invariants hold", () => {
  for (let round = 0; round < 200; round++) {
    const n = 2 + Math.floor(rand() * 12);
    const dsus = ["naive", "rank", "size"].flatMap((mode) => [new DSU(n, { mode, compress: false }), new DSU(n, { mode, compress: true })]);
    const label = Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < 25; k++) {
      const a = Math.floor(rand() * n), b = Math.floor(rand() * n), op = rand() < 0.7 ? ["u", a, b] : ["f", a];
      if (op[0] === "u") { const la = label[a], lb = label[b]; for (let i = 0; i < n; i++) if (label[i] === lb) label[i] = la; }
      for (const d of dsus) {
        for (const s of d.run(op)) for (const l of [s.line ?? []].flat()) assert.ok(l >= 1 && l <= code(d.mode).length);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) assert.equal(d.root(i) === d.root(j), label[i] === label[j]);
        for (let i = 0; i < n; i++) {
          const p = d.parent[i];
          if (p !== i && d.mode === "rank") assert.ok(d.rank[i] < d.rank[p], "rank rises towards the root");
          if (d.mode === "size" && p === i) assert.equal(d.size[i], label.filter((x) => x === label[i]).length);
        }
        if (d.mode !== "naive") assert.ok(d.height() <= Math.log2(n));
      }
    }
  }
});
