import assert from "node:assert/strict";
import { test } from "node:test";
import { fibNum, PROBLEMS, run } from "../public/js/engines/dp.js";

let seed = 1618;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(rand() * s.length)]).join("");
const ints = (n, lo, hi) => Array.from({ length: n }, () => lo + Math.floor(rand() * (hi - lo + 1)));

test("textbook answers", () => {
  // CLRS 3rd ed. §15.4, Figure 15.8: LCS of ABCBDAB and BDCABA has length 4 (BCBA).
  const l = run("lcs", { a: "ABCBDAB", b: "BDCABA" });
  assert.equal(l.answer, 4);
  assert.equal(l.detail, "BCBA");
  // CLRS §15.2, Figure 15.5: p = <30,35,15,5,10,20,25> costs 15125 as ((A1(A2A3))((A4A5)A6)).
  const m = run("mcm", { p: "30 35 15 5 10 20 25" });
  assert.equal(m.answer, 15125);
  assert.equal(m.order, "((A1(A2A3))((A4A5)A6))");
  // Levenshtein classics: kitten → sitting = 3; Jurafsky & Martin's intention → execution = 5 with unit costs.
  assert.equal(run("edit", { a: "kitten", b: "sitting" }).answer, 3);
  assert.equal(run("edit", { a: "intention", b: "execution" }).answer, 5);
  // CLRS §16.2 (Figure 16.2): weights 10, 20, 30, values 60, 100, 120, W = 50 → 220 (items 2 and 3).
  const k = run("knapsack", { w: "10 20 30", v: "60 100 120", cap: 50 });
  assert.equal(k.answer, 220);
  assert.deepEqual(k.taken, [2, 3]);
  // LeetCode 518 / 322: {1,2,5} makes 5 in 4 ways; 11 needs 3 coins; {2} can't make 3.
  assert.equal(run("coinWays", { coins: "1 2 5", amount: 5 }).answer, 4);
  assert.equal(run("coinMin", { coins: "1 2 5", amount: 11 }).answer, 3);
  assert.equal(run("coinMin", { coins: "2", amount: 3 }).answer, -1);
  assert.equal(run("coinMin", { coins: "1 3 4", amount: 6 }).answer, 2); // greedy would use 3 coins
  // LeetCode 300: LIS of 10 9 2 5 3 7 101 18 has length 4.
  assert.equal(run("lis", { a: "10 9 2 5 3 7 101 18" }).answer, 4);
  // Fibonacci: F(10) = 55; memoised fib(n) makes 2n − 1 calls versus 2F(n+1) − 1 naively.
  assert.equal(run("fibTable", { n: 10 }).answer, 55);
  const f = run("fibMemo", { n: 10 });
  assert.equal(f.answer, 55);
  assert.equal(f.calls, 19);
  assert.equal(f.naive, 177);
});

// Brute force by plain recursion or enumeration.
const bLcs = (a, b) => (!a.length || !b.length ? 0 : a[0] === b[0] ? 1 + bLcs(a.slice(1), b.slice(1)) : Math.max(bLcs(a.slice(1), b), bLcs(a, b.slice(1))));
const bEdit = (a, b) => (!a.length ? b.length : !b.length ? a.length : Math.min(bEdit(a.slice(1), b) + 1, bEdit(a, b.slice(1)) + 1, bEdit(a.slice(1), b.slice(1)) + (a[0] === b[0] ? 0 : 1)));
const bKnap = (w, v, W) => { let best = 0; for (let m = 0; m < 1 << w.length; m++) { let tw = 0, tv = 0; w.forEach((x, i) => { if (m >> i & 1) { tw += x; tv += v[i]; } }); if (tw <= W) best = Math.max(best, tv); } return best; };
const bWays = (cs, a, i = 0) => (a === 0 ? 1 : i >= cs.length ? 0 : (cs[i] <= a ? bWays(cs, a - cs[i], i) : 0) + bWays(cs, a, i + 1));
const bMin = (cs, a) => { if (a === 0) return 0; let best = Infinity; for (const c of cs) if (c <= a) best = Math.min(best, 1 + bMin(cs, a - c)); return best; };
const bMcm = (p, i, j) => { if (i === j) return 0; let best = Infinity; for (let k = i; k < j; k++) best = Math.min(best, bMcm(p, i, k) + bMcm(p, k + 1, j) + p[i - 1] * p[k] * p[j]); return best; };
const bLis = (A) => { let best = 0; for (let m = 1; m < 1 << A.length; m++) { const s = A.filter((_, i) => m >> i & 1); if (s.every((x, i) => !i || s[i - 1] < x)) best = Math.max(best, s.length); } return best; };

test("fuzz: every DP answer agrees with brute force on small random inputs", () => {
  for (let k = 0; k < 150; k++) {
    const a = pick("ABC", Math.floor(rand() * 7)), b = pick("ABC", Math.floor(rand() * 7));
    const l = run("lcs", { a, b });
    assert.equal(l.answer, bLcs(a, b), `lcs ${a} ${b}`);
    assert.equal(l.detail.length, l.answer);
    assert.equal(bLcs(l.detail, a), l.answer, "traceback is a subsequence of A");
    assert.equal(bLcs(l.detail, b), l.answer, "traceback is a subsequence of B");
    const e = run("edit", { a, b });
    assert.equal(e.answer, bEdit(a, b), `edit ${a} ${b}`);
    // Replaying the traced edits turns a into b.
    let out = "", i = 0;
    for (const op of e.ops) { if (op.startsWith("keep")) out += a[i++]; else if (op.startsWith("substitute")) { out += op.at(-1); i++; } else if (op.startsWith("delete")) i++; else out += op.at(-1); }
    assert.equal(out, b, `edit replay ${a} → ${b}`);

    const n = 1 + Math.floor(rand() * 5), w = ints(n, 1, 8), v = ints(n, 1, 30), W = Math.floor(rand() * 15);
    if (W >= 1) {
      const kn = run("knapsack", { w: w.join(" "), v: v.join(" "), cap: W });
      assert.equal(kn.answer, bKnap(w, v, W), `knapsack ${w} ${v} ${W}`);
      assert.equal(kn.taken.reduce((s, t) => s + v[t - 1], 0), kn.answer);
      assert.ok(kn.taken.reduce((s, t) => s + w[t - 1], 0) <= W);
    }
    const cs = [...new Set(ints(1 + Math.floor(rand() * 3), 1, 7))], amt = Math.floor(rand() * 16);
    assert.equal(run("coinWays", { coins: cs.join(" "), amount: amt }).answer, bWays(cs, amt), `ways ${cs} ${amt}`);
    const cm = run("coinMin", { coins: cs.join(" "), amount: amt }), want = bMin(cs, amt);
    assert.equal(cm.answer, want === Infinity ? -1 : want, `min ${cs} ${amt}`);
    if (want !== Infinity) assert.equal(cm.used.reduce((s, c) => s + c, 0), amt);

    const p = ints(2 + Math.floor(rand() * 5), 1, 20);
    if (p.length >= 3) assert.equal(run("mcm", { p: p.join(" ") }).answer, bMcm(p, 1, p.length - 1), `mcm ${p}`);
    const A = ints(1 + Math.floor(rand() * 9), 1, 12), li = run("lis", { a: A.join(" ") });
    assert.equal(li.answer, bLis(A), `lis ${A}`);
    assert.ok(li.seq.every((x, i) => !i || li.seq[i - 1] < x));
    const f = Math.floor(rand() * 13);
    assert.equal(run("fibMemo", { n: f }).answer, fibNum(f));
    if (f >= 1) assert.equal(run("fibTable", { n: f }).answer, fibNum(f));
  }
});

test("steps are well formed: lines in range, cells filled only once, dependencies already filled", () => {
  for (const [key, P] of Object.entries(PROBLEMS)) {
    const r = run(key);
    let prev = null;
    for (const s of r.steps) {
      if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= P.code.length, `${key} line ${l}`);
      assert.ok(s.note.length > 10, key);
      for (const [i, j] of s.deps ?? []) assert.ok(s.cells[i][j] != null || key === "fibMemo", `${key}: dependency (${i}, ${j}) used before it was filled`);
      if (prev) prev.cells.forEach((row, i) => row.forEach((c, j) => { if (c && key !== "mcm") assert.ok(s.cells[i][j], `${key}: cell (${i}, ${j}) emptied`); }));
      prev = s;
    }
    assert.ok(r.steps.at(-1).done, key);
  }
});
