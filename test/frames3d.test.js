// 3D frames: finite, uniquely keyed blocks for every step of every tool.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as F from "../public/js/frames3d.js";
import { ALGORITHMS as SORTS, run as sort } from "../public/js/engines/sorting.js";
import { ALGORITHMS as FIND, run as find } from "../public/js/engines/searching.js";
import { ALGORITHMS as PAGES, replace } from "../public/js/engines/paging.js";
import { PROBLEMS, run as dp } from "../public/js/engines/dp.js";
import { runExpr, runOps } from "../public/js/engines/stacks.js";
import { OPS, run as list } from "../public/js/engines/lists.js";
import { minimise } from "../public/js/engines/kmap.js";
import { SUBJECTS, TOOLS } from "../public/js/tools.js";
import { meta, studyOrder } from "../public/js/views/subject.js";

function ok(f, where) {
  for (const list of [f.items, f.marks]) { const keys = list.map((x) => x.k); assert.equal(new Set(keys).size, keys.length, `${where}: duplicate key ${keys.find((k, i) => keys.indexOf(k) !== i)}`); }
  for (const b of f.items) for (const c of ["x", "y", "z", "w", "h", "d"]) assert.ok(Number.isFinite(b[c]), `${where} ${b.k}.${c}`);
  for (const m of f.marks) for (const c of ["x", "y", "z"]) assert.ok(Number.isFinite(m[c]), `${where} mark ${m.k}`);
  for (const l of f.links) for (const v of [...l.a, ...l.b]) assert.ok(Number.isFinite(v), `${where} link ${l.k}`);
}
test("sorting, searching and paging", () => {
  for (const a of Object.keys(SORTS)) for (const s of sort(a, [38, 27, 43, 3, 9, 27]).steps) ok(F.sortingFrame(s, 6, 43, true), a);
  for (const a of Object.keys(FIND)) { const r = find(a, [2, 5, 8, 12, 16, 23], 16); for (const s of r.steps) ok(F.searchingFrame(r.A, s, a === "lower" || a === "upper"), a); }
  for (const a of Object.keys(PAGES)) { const { steps } = replace([1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 3, a); steps.forEach((_, i) => ok(F.pagingFrame(steps, i, 3), a)); }
});
test("tables, stacks, lists and K-maps", () => {
  for (const p of Object.keys(PROBLEMS)) { const r = dp(p); for (const s of r.steps) ok(F.dpFrame(r, s), p); }
  for (const s of runOps("stack", "push 1, push 2, pop, push 3", 4).steps) ok(F.stackFrame(s, 4, "stack"), "stack");
  for (const s of runOps("queue", "enq 1, enq 2, deq, enq 3", 4).steps) ok(F.stackFrame(s, 4, "queue"), "queue");
  for (const s of runExpr("infix", "a+b*(c-d)").steps) ok(F.exprFrame(s), "infix");
  for (const op of Object.keys(OPS)) { const r = list({ kind: "s", values: [10, 20, 30], op, x: 20, pos: 1, cycleAt: op === "floyd" ? 1 : -1 }); for (const s of r.steps) ok(F.listFrame(s, 3), op); }
  for (const n of [2, 3, 4, 5]) { const ones = [0, 1, 2], r = minimise(n, ones, []), v = Array.from({ length: 1 << n }, (_, m) => (ones.includes(m) ? 1 : 0)); for (const s of r.steps) ok(F.kmapFrame(n, v, s, r.primes), `kmap ${n}`); const at = new Set(v.map((_, m) => { const c = F.kmapCell(n, m); return `${c.map},${c.row},${c.col}`; })); assert.equal(at.size, 1 << n); }
});
test("every topic is on exactly one subject page", () => {
  const all = SUBJECTS.flatMap((s) => studyOrder(s.id).map((t) => t.slug));
  assert.equal(all.length, TOOLS.length); assert.equal(new Set(all).size, TOOLS.length);
  for (const s of SUBJECTS) assert.ok(meta(s, "drishi").description.length <= 170, s.id);
});
