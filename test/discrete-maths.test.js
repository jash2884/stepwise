// Discrete maths engines: textbook results (Rosen, CLRS, West), brute-force
// cross-checks, fuzzing of the normal forms, and the GATE generators.
import assert from "node:assert/strict";
import { test } from "node:test";
import { rng } from "../public/js/ui.js";
import * as L from "../public/js/engines/logic.js";
import * as R from "../public/js/engines/relations.js";
import * as C from "../public/js/engines/combinatorics.js";
import * as GT from "../public/js/engines/graphtheory.js";
import { parseGraph } from "../public/js/engines/graph.js";
import * as RC from "../public/js/engines/recurrences.js";
import { TOPICS as DM_TOPICS } from "../public/js/gate/discrete-maths.js";
import { check, generate } from "../public/js/gate-questions.js";

const kind = (s) => L.truthTable(L.parse(s)).kind;

// --- Logic ------------------------------------------------------------------------
test("logic: precedence and printing", () => {
  assert.equal(L.show(L.parse("p -> q -> r")), "p → (q → r)");
  assert.equal(L.show(L.parse("~p & q | r")), "(¬p ∧ q) ∨ r");
  assert.equal(L.show(L.parse("p ∧ q ∧ r")), "p ∧ q ∧ r");
  assert.equal(L.show(L.parse("p <-> q")), "p ↔ q");
  assert.throws(() => L.parse("p ∧"), /Expected/);
  assert.throws(() => L.parse("p $ q"), /don't know the symbol/);
  // Printing then parsing gives the same truth table.
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const f = L.randomFormula(r, ["p", "q", "r"], 4);
    assert.ok(L.equivalence(f, L.parse(L.show(f))).equivalent, L.show(f));
  }
});

test("logic: tautologies, contradictions and contingencies (Rosen 1.3)", () => {
  for (const s of ["p ∨ ¬p", "((p → q) ∧ p) → q", "((p → q) ∧ ¬q) → ¬p", "((p → q) ∧ (q → r)) → (p → r)", "¬(p ∧ q) ↔ (¬p ∨ ¬q)", "(p → q) ↔ (¬q → ¬p)", "(p ∧ q) → (p → q)"]) assert.equal(kind(s), "tautology", s);
  for (const s of ["p ∧ ¬p", "(p ∨ q) ∧ ¬p ∧ ¬q", "¬(p → p)"]) assert.equal(kind(s), "contradiction", s);
  for (const s of ["p → q", "(p → q) → (q → p)", "p ⊕ q"]) assert.equal(kind(s), "contingency", s);
  const t = L.truthTable(L.parse("p → q"));
  assert.deepEqual(t.final, [true, false, true, true]); // rows TT, TF, FT, FF
  assert.equal(t.rows.length, 4);
  assert.equal(L.truthTable(L.parse("(p ∧ q) ∨ r")).steps.length, 1 + 2 + 1); // variables, 2 columns, verdict
});

test("logic: equivalences and counterexamples", () => {
  assert.ok(L.equivalence(L.parse("p → q"), L.parse("¬p ∨ q")).equivalent);
  assert.ok(L.equivalence(L.parse("p → (q → r)"), L.parse("(p ∧ q) → r")).equivalent);
  const e = L.equivalence(L.parse("p → q"), L.parse("q → p"));
  assert.equal(e.equivalent, false);
  assert.notEqual(L.evaluate(L.parse("p → q"), e.counter.env), L.evaluate(L.parse("q → p"), e.counter.env));
});

test("logic fuzz: CNF and DNF (rewritten and canonical) have the original truth table", () => {
  const r = rng(2024);
  for (let i = 0; i < 400; i++) {
    const f = L.randomFormula(r, ["p", "q", "r", "s"].slice(0, 2 + (i % 3)), 2 + (i % 3));
    const nf = L.normalForms(f);
    assert.ok(L.equivalence(f, nf.cnfFormula).equivalent, `CNF of ${L.show(f)}: ${nf.cnfText}`);
    assert.ok(L.equivalence(f, nf.dnfFormula).equivalent, `DNF of ${L.show(f)}: ${nf.dnfText}`);
    // Shape: every clause is a list of literals.
    for (const c of [...nf.cnf, ...nf.dnf]) for (const l of c) assert.ok(typeof l.name === "string" && typeof l.neg === "boolean");
    const t = L.truthTable(f);
    assert.equal(nf.canonical.dnf.length, t.final.filter(Boolean).length);
    assert.equal(nf.canonical.cnf.length, t.final.filter((x) => !x).length);
    if (nf.canonical.dnf.length) assert.ok(L.equivalence(f, L.clausesToFormula(nf.canonical.dnf, "or")).equivalent);
    if (nf.canonical.cnf.length) assert.ok(L.equivalence(f, L.clausesToFormula(nf.canonical.cnf, "and")).equivalent);
  }
});

test("logic: rules of inference are valid and the fallacies are not", () => {
  for (const rule of L.RULES) {
    const res = L.inference(rule.premises.map((p) => L.parse(p)), L.parse(rule.conclusion));
    assert.equal(res.valid, !rule.fallacy, rule.name);
    assert.equal(res.rule?.id, rule.id, rule.name);
  }
  const res = L.inference([L.parse("p → q"), L.parse("q")], L.parse("p"));
  assert.deepEqual(res.counter.env, { p: false, q: true });
  assert.equal(L.inference([L.parse("s → t"), L.parse("¬t")], L.parse("¬s")).rule.id, "mt");
});

test("logic: quantifiers over a finite domain", () => {
  const ev = (s, d) => L.evaluateFol(L.parse(s, { mode: "fol" }), d).value;
  assert.equal(ev("∀x ∃y (x < y)", [1, 2, 3]), false); // the largest element has no bigger one
  assert.equal(ev("∃y ∀x (x ≤ y)", [1, 2, 3]), true);
  assert.equal(ev("∀x (prime(x) → odd(x))", L.parseDomain("1..8")), false); // 2
  assert.equal(ev("∃x ∀y divides(x, y)", [1, 2, 3, 4]), true);
  assert.equal(ev("∀x ∃y (x + y = 5)", [1, 2, 3, 4]), true);
  assert.equal(ev("¬∀x (x mod 2 = 0)", [2, 4, 6]), false);
  assert.throws(() => ev("∀x (x < y)", [1, 2]), /free/);
  // ¬ pushed through quantifiers keeps the meaning.
  for (const s of ["∀x ∃y (x < y)", "∃x (even(x) ∧ x > 2)", "∀x (prime(x) → odd(x))", "∃x ∀y (x ≤ y ∨ y = 3)"]) {
    for (const d of [[1, 2, 3], [0, 1, 2, 3, 4, 5]]) assert.equal(L.evaluateFol(L.negateFol(L.parse(s, { mode: "fol" })), d).value, !ev(s, d), s);
  }
});

// --- Relations ------------------------------------------------------------------------
test("relations: counting formulas match textbook values and brute force", () => {
  for (let n = 1; n <= 3; n++) {
    const b = R.bruteCounts(n), f = Object.fromEntries(R.counts(n).map((x) => [x.id, x.value]));
    assert.equal(BigInt(b.relations), 2n ** BigInt(n * n));
    for (const k of ["reflexive", "irreflexive", "symmetric", "antisymmetric", "asymmetric", "reflexiveSymmetric", "equivalence", "partialOrders"]) assert.equal(BigInt(b[k]), f[k], `${k} n=${n}`);
  }
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => Number(R.bell(n))), [1, 1, 2, 5, 15, 52, 203, 877, 4140]);
  const c4 = Object.fromEntries(R.counts(4, 3).map((x) => [x.id, x.value]));
  assert.equal(c4.relations, 65536n);
  assert.equal(c4.functions, 81n);
  assert.equal(c4.surjective, 36n); // 3! · S(4, 3) = 6 · 6
  assert.equal(c4.injective, 0n);
  assert.equal(Object.fromEntries(R.counts(3, 5).map((x) => [x.id, x.value])).injective, 60n);
  assert.equal(R.stirling2(5, 2), 15n);
});

test("relations: properties with witnesses", () => {
  const els = R.parseSet("1 2 3 4");
  const M = R.parsePairs("(1,1) (1,2) (2,1) (2,3) (3,3) (4,4)", els);
  const p = R.properties(M, els);
  assert.equal(p.reflexive.ok, false);
  assert.match(p.reflexive.witness.text, /\(2,2\)/);
  assert.equal(p.symmetric.ok, false);
  assert.equal(p.transitive.ok, false);
  const E = R.parsePairs("1 1, 2 2, 3 3, 1 2, 2 1", R.parseSet("1 2 3"));
  assert.equal(R.properties(E, ["1", "2", "3"]).equivalence, true);
  assert.deepEqual(R.classes(E, ["1", "2", "3"]), [["1", "2"], ["3"]]);
  assert.throws(() => R.parsePairs("(1,5)", els), /isn't in the set/);
});

test("relations fuzz: Warshall equals the closure by repeated squaring", () => {
  const r = rng(99);
  for (let t = 0; t < 200; t++) {
    const n = 2 + (t % 5), els = Array.from({ length: n }, (_, i) => String(i));
    const M = R.randomRelation(r, n, 0.3);
    const W = R.warshall(M, els).closure;
    let T = R.copy(M);
    for (let k = 0; k < n; k++) T = T.map((row, i) => row.map((x, j) => x || T[i].some((y, m) => y && T[m][j])));
    assert.deepEqual(W, T);
    assert.ok(R.properties(W, els).transitive.ok);
    const E = R.equivalenceClosure(M);
    assert.ok(R.properties(E, els).equivalence);
  }
});

test("relations: Hasse diagrams and lattices", () => {
  const d12 = R.divisibility(R.divisorsOf(12)), H = R.hasse(d12.M, d12.els), L12 = R.lattice(d12.M, d12.els);
  assert.equal(H.covers.length, 7);
  assert.deepEqual([L12.isLattice, L12.distributive, L12.complemented], [true, true, false]);
  const d30 = R.divisibility(R.divisorsOf(30)), L30 = R.lattice(d30.M, d30.els);
  assert.deepEqual([L30.isLattice, L30.distributive, L30.complemented], [true, true, true]);
  assert.equal(R.hasse(d30.M, d30.els).covers.length, 12); // a cube
  const build = (key) => { const ex = R.EXAMPLES[key], els = R.parseSet(ex.set); return { els, M: R.transitiveClosure(R.reflexiveClosure(R.parsePairs(ex.pairs, els))) }; };
  for (const [k, want] of [["m3", [true, false, true]], ["n5", [true, false, true]]]) {
    const { els, M } = build(k), Lx = R.lattice(M, els);
    assert.deepEqual([Lx.isLattice, Lx.distributive, Lx.complemented], want, k);
  }
  const { els, M } = build("nolat");
  assert.equal(R.lattice(M, els).isLattice, false);
  const ps = R.powerSet(["a", "b", "c"]);
  assert.equal(R.hasse(ps.M, ps.els).covers.length, 12);
  assert.ok(R.lattice(ps.M, ps.els).complemented);
});

// --- Combinatorics ----------------------------------------------------------------
test("combinatorics: classic numbers", () => {
  assert.deepEqual(C.derangements(8).map(Number), [1, 0, 1, 2, 9, 44, 265, 1854, 14833]);
  assert.equal(C.listDerangements(4).length, 9);
  assert.deepEqual(C.catalans(8).map(Number), [1, 1, 2, 5, 14, 42, 132, 429, 1430]);
  for (let n = 0; n <= 12; n++) assert.equal(C.catalan(n), C.catalans(12)[n]);
  assert.equal(C.balancedParens(4).length, 14);
  assert.equal(C.choose(52, 5), 2598960n);
  assert.equal(C.selection("perm", 10, 3).value, 720n);
  assert.equal(C.selection("permRep", 2, 10).value, 1024n);
  assert.equal(C.selection("combRep", 3, 5).value, 21n); // C(7, 5)
  assert.equal(C.multiset("MISSISSIPPI").value, 34650n);
  assert.equal(C.starsAndBars(10, 3, [1, 1, 1]).value, 36n); // positive solutions of x+y+z = 10
  assert.equal(C.starsAndBars(10, 3).value, 66n);
  assert.equal(C.starsAndBars(3, 3, [2, 2, 0]).value, 0n);
  assert.equal(C.pigeonhole(13, 12).atLeast, 2);
  assert.equal(C.forceCount(4, 3), 9);
});

test("combinatorics fuzz: listed selections match the formulas", () => {
  for (const k of Object.keys(C.SELECTIONS)) for (let n = 1; n <= 5; n++) for (let r = 0; r <= 4; r++) {
    const list = C.listSelections(k, n, r, 10000);
    assert.equal(BigInt(list.length), C.selection(k, n, r).value, `${k} ${n} ${r}`);
    assert.equal(new Set(list).size, list.length);
  }
});

test("combinatorics: inclusion-exclusion", () => {
  const d = C.divisibleCount(100, [2, 3, 5]);
  assert.equal(d.union, 74);
  assert.equal(d.brute, 74);
  assert.equal(d.none, 26);
  const r = rng(5);
  for (let t = 0; t < 100; t++) {
    const N = 20 + Math.floor(r() * 500), ds = [2 + Math.floor(r() * 9), 2 + Math.floor(r() * 9), 2 + Math.floor(r() * 9)];
    const x = C.divisibleCount(N, ds);
    assert.equal(x.union, x.brute, `${N} ${ds}`);
  }
  const two = C.inclusionExclusion({ A: 20, B: 15, AB: 5 });
  assert.equal(two.union, 30);
  assert.deepEqual(two.regions, { AB: 5, A: 15, B: 10 });
  const bad = C.inclusionExclusion({ A: 5, B: 5, AB: 7 });
  assert.equal(bad.consistent, false);
});

test("combinatorics: linear recurrences solved in closed form", () => {
  const fib = C.solveRecurrence({ c1: 1, c2: 1, a0: 0, a1: 1 }, 20);
  assert.equal(fib.values[20], 6765);
  assert.ok(fib.ok);
  assert.equal(fib.kind, "distinct");
  const d = C.solveRecurrence({ c1: 5, c2: -6, a0: 1, a1: 4 }, 10);
  assert.equal(d.formula, "2·3ⁿ − 2ⁿ");
  const rep = C.solveRecurrence({ c1: 4, c2: -4, a0: 1, a1: 6 }, 10);
  assert.equal(rep.kind, "repeated");
  assert.equal(rep.formula, "2ⁿ + 2·n·2ⁿ");
  const hanoi = C.solveRecurrence({ c1: 2, c2: 0, d: 1, a0: 0 }, 10);
  assert.equal(hanoi.formula, "2ⁿ − 1");
  assert.equal(hanoi.values[10], 1023);
  // Every small integer recurrence: the formula reproduces the table.
  for (let c1 = -3; c1 <= 3; c1++) for (let c2 = -3; c2 <= 3; c2++) for (const dd of [0, 1, -2]) {
    const s = C.solveRecurrence({ c1, c2, d: dd, a0: 1, a1: 2 }, 12);
    assert.ok(s.ok, `${c1} ${c2} ${dd}`);
  }
});

// --- Graph theory -------------------------------------------------------------------
test("graph theory: Havel-Hakimi on textbook sequences and against Erdős-Gallai", () => {
  assert.equal(GT.havelHakimi([3, 3, 2, 2, 2]).graphic, true);
  assert.equal(GT.havelHakimi([4, 4, 4, 1, 1]).graphic, false);
  assert.equal(GT.havelHakimi([3, 3, 3, 2, 2]).reason, "odd sum");
  assert.equal(GT.havelHakimi([5, 1, 1, 1, 1]).graphic, false);
  assert.equal(GT.havelHakimi([6, 5, 5, 4, 3, 3, 2, 2, 2]).graphic, true);
  const r = rng(11);
  for (let t = 0; t < 500; t++) {
    const n = 1 + Math.floor(r() * 8), seq = Array.from({ length: n }, () => Math.floor(r() * n));
    const res = GT.havelHakimi(seq);
    assert.equal(res.graphic, GT.erdosGallai(seq), seq.join(" "));
    if (res.graphic) {
      // The edges it builds realise exactly this sequence, with no repeats.
      const deg = Object.fromEntries(res.names.map((v) => [v, 0])), seen = new Set();
      for (const [a, b] of res.edges) { deg[a]++; deg[b]++; const k = [a, b].sort().join(); assert.ok(!seen.has(k) && a !== b); seen.add(k); }
      assert.deepEqual(res.names.map((v) => deg[v]), seq);
    }
  }
});

test("graph theory: named graphs", () => {
  const G = (k) => parseGraph(GT.EXAMPLES[k].text);
  const facts = {
    k4: { chi: 4, euler: "none", ham: true, bip: false, match: 2, trees: 16n },
    k5: { chi: 5, euler: "circuit", ham: true, bip: false, match: 2, trees: 125n },
    k33: { chi: 2, euler: "none", ham: true, bip: true, match: 3, trees: 81n },
    c5: { chi: 3, euler: "circuit", ham: true, bip: false, match: 2, trees: 5n },
    q3: { chi: 2, euler: "none", ham: true, bip: true, match: 4, trees: 384n },
    petersen: { chi: 3, euler: "none", ham: false, bip: false, match: 5, trees: 2000n },
    house: { chi: 3, euler: "trail", ham: true, bip: false, match: 2, trees: 11n },
  };
  for (const [k, f] of Object.entries(facts)) {
    const g = G(k);
    assert.equal(GT.chromatic(g).chi, f.chi, `${k} χ`);
    assert.equal(GT.euler(g).kind, f.euler, `${k} Euler`);
    assert.equal(!!GT.hamilton(g).cycle, f.ham, `${k} Hamilton`);
    assert.equal(GT.bipartite(g).bipartite, f.bip, `${k} bipartite`);
    assert.equal(GT.matching(g).size, f.match, `${k} matching`);
    assert.equal(GT.spanningTrees(g).count, f.trees, `${k} trees`);
  }
  assert.equal(GT.planarCounts(G("k5")).violates, true);
  assert.equal(GT.planarCounts(G("k33")).violates, true);
  assert.equal(GT.planarCounts(G("petersen")).violates, true); // girth 5: e ≤ 5(v − 2)/3 = 13 < 15
  assert.equal(GT.planarCounts(G("q3")).violates, false);
  assert.equal(GT.planarCounts(G("k4")).faces, 4);
  assert.equal(GT.girth(G("petersen")), 5);
  const tr = GT.euler(G("house")).trail;
  assert.equal(tr.length, 7);
  assert.deepEqual([tr[0], tr[tr.length - 1]].sort(), ["A", "B"]);
});

test("graph theory fuzz: Kirchhoff, matching, colouring and bipartite agree with brute force", () => {
  const r = rng(321);
  for (let t = 0; t < 120; t++) {
    const g = parseGraph(GT.randomSimpleGraph(r, 4 + (t % 3), 0.5));
    assert.equal(Number(GT.spanningTrees(g).count), GT.spanningTreesBrute(g), GT.EXAMPLES && g.edges.map((e) => e.id).join());
    assert.equal(GT.matching(g).size, GT.maxMatchingBrute(g).size);
    const res = GT.chromatic(g);
    for (const e of g.edges) assert.notEqual(res.colouring[e.from], res.colouring[e.to]);
    assert.equal(GT.bipartite(g).bipartite, res.chi <= 2);
    const eu = GT.euler(g);
    if (eu.kind !== "none") assert.equal(eu.trail.length, g.edges.length + 1);
    const ham = GT.hamilton(g).cycle;
    if (ham) { assert.equal(new Set(ham).size, g.nodes.length); for (let i = 0; i < ham.length; i++) assert.ok(GT.edgeId(g, ham[i], ham[(i + 1) % ham.length])); }
  }
});

// --- Recurrences --------------------------------------------------------------------
test("recurrences: master theorem cases (CLRS 4.5)", () => {
  const S = (t) => RC.solve(RC.parseRecurrence(t));
  const cases = [
    ["T(n) = 2T(n/2) + n", "Θ(n log n)", 2], ["T(n) = T(n/2) + 1", "Θ(log n)", 2], ["T(n) = 9T(n/3) + n", "Θ(n²)", 1],
    ["T(n) = T(2n/3) + 1", "Θ(log n)", 2], ["T(n) = 3T(n/4) + n log n", "Θ(n log n)", 3], ["T(n) = 8T(n/2) + n^2", "Θ(n³)", 1],
    ["T(n) = 7T(n/2) + n^2", "Θ(n^2.807)", 1], ["T(n) = 2T(n/4) + sqrt(n)", "Θ(√n log n)", 2], ["T(n) = 2T(n/2) + n log n", "Θ(n log² n)", 2],
    ["T(n) = 4T(n/2) + n^3", "Θ(n³)", 3], ["T(n) = 2T(n/2) + 1", "Θ(n)", 1],
  ];
  for (const [t, ans, c] of cases) { const s = S(t); assert.equal(s.answer, ans, t); assert.equal(s.case, c, t); }
  const gap = S("T(n) = 2T(n/2) + n/log n");
  assert.equal(gap.answer, "Θ(n log log n)");
  assert.equal(gap.basic, false);
  assert.equal(S("T(n) = 2T(n/2) + n/log^2 n").answer, "Θ(n)");
});

test("recurrences: subtract-and-conquer, unequal splits and change of variable", () => {
  const S = (t) => RC.solve(RC.parseRecurrence(t)).answer;
  assert.equal(S("T(n) = T(n-1) + n"), "Θ(n²)");
  assert.equal(S("T(n) = T(n-1) + 1"), "Θ(n)");
  assert.equal(S("T(n) = 2T(n-1) + 1"), "Θ(2ⁿ)");
  assert.equal(S("T(n) = T(n-1) + log n"), "Θ(n log n)");
  assert.match(S("T(n) = T(n-1) + T(n-2) + 1"), /^Θ\(1\.618/);
  assert.equal(S("T(n) = T(n/3) + T(2n/3) + n"), "Θ(n log n)");
  assert.equal(S("T(n) = T(n/5) + T(7n/10) + n"), "Θ(n)"); // median of medians
  assert.equal(S("T(n) = 2T(sqrt(n)) + log n"), "Θ(log n log log n)");
  assert.equal(S("T(n) = 2T(sqrt(n)) + 1"), "Θ(log n)");
  assert.equal(S("T(n) = T(sqrt(n)) + 1"), "Θ(log log n)");
  assert.throws(() => RC.parseRecurrence("T(n) = 2T(n*2) + n"), /Can't read|shrink/);
  assert.throws(() => RC.parseRecurrence("T(n) = n^2"), /no T/);
});

test("recurrences: exact values, recursion tree sums and substitution", () => {
  const ms = RC.parseRecurrence("T(n) = 2T(n/2) + n");
  for (const k of [1, 2, 3, 4, 5, 6]) assert.equal(RC.exactT(ms, 2 ** k), 2 ** k * k + 2 ** k); // n log n + n
  assert.equal(RC.exactT(RC.parseRecurrence("T(n) = T(n-1) + n"), 10), 55);
  assert.equal(RC.exactT(RC.parseRecurrence("T(n) = 2T(n-1) + 1"), 10), 1023);
  const tree = RC.recursionTree(ms, 16);
  assert.equal(tree.levels.length, 5);
  assert.deepEqual(tree.levels.map((l) => l.count), [1, 2, 4, 8, 16]);
  assert.equal(tree.total, RC.exactT(ms, 16));
  assert.equal(RC.substitution(ms, RC.G(1, 1)).verdict, "fits");
  assert.equal(RC.substitution(ms, RC.G(1)).verdict, "small");
  assert.equal(RC.substitution(ms, RC.G(2)).verdict, "big");
  for (const ex of Object.values(RC.EXAMPLES)) {
    const rec = RC.parseRecurrence(ex.text), s = RC.solve(rec);
    assert.equal(RC.substitution(rec, s.growth).verdict, "fits", ex.text);
  }
});

test("recurrences: growth rates in order", () => {
  const order = ["one", "loglog", "log", "log2", "sqrt", "n", "nlog", "n2", "n3", "exp2", "exp3", "fact", "nn"];
  for (let i = 0; i + 1 < order.length; i++) assert.equal(RC.compareGrowth(RC.GROWTHS[order[i]].g, RC.GROWTHS[order[i + 1]].g), -1, order[i]);
  assert.equal(RC.compareGrowth(RC.parseF("n log n"), RC.parseF("n * log(n^2)")), 0);
  assert.equal(RC.showGrowth(RC.parseF("n^2 / log n")), "n² / log n");
  assert.equal(RC.showGrowth(RC.parseF("n^2 + n log n + 7")), "n²");
  assert.equal(RC.showGrowth(RC.parseF("sqrt(n) * log log n")), "√n log log n");
});

// --- GATE --------------------------------------------------------------------------
test("GATE: discrete-maths generators are valid for seeds 1 to 150 and replay the same input", async () => {
  assert.deepEqual(DM_TOPICS.map((t) => t.slug).sort(), ["combinatorics", "graph-theory", "propositional-logic", "recurrences", "sets-relations"]);
  const seen = new Map();
  for (const t of DM_TOPICS) {
    for (let seed = 1; seed <= 150; seed++) {
      const q = generate(t.slug, seed), where = `${t.slug} seed ${seed}`;
      assert.ok(["mcq", "msq", "nat"].includes(q.type), where);
      assert.ok(q.marks === 1 || q.marks === 2, where);
      assert.ok(q.stem.length && q.solution.length, where);
      if (q.type === "nat") assert.ok(Number.isFinite(q.answer) && Number.isSafeInteger(Math.round(q.answer)), where);
      else assert.equal(new Set(q.options).size, 4, where);
      assert.equal(check(q, q.answer).correct, true, where);
      assert.ok(!/[—–]/.test(JSON.stringify([q.stem, q.options ?? []])), `${where}: no long dashes in the question`);
      // The replay URL opens the right tool with an input its engine accepts.
      const url = new URL(q.replay, "https://x.test"), p = url.searchParams;
      assert.equal(url.pathname, `/${t.slug}`, where);
      if (t.slug === "propositional-logic") { if (p.get("mode") === "fol") L.parse(p.get("f"), { mode: "fol" }); else L.parse(p.get("f")); }
      if (t.slug === "sets-relations" && p.get("mode") !== "count") {
        const els = R.parseSet(p.get("set")), M = R.parsePairs(p.get("r"), els);
        if (p.get("mode") === "closure" && q.stem.join(" ").includes("transitive closure") && !q.stem.join(" ").includes("reflexive transitive")) assert.equal(R.countPairs(R.transitiveClosure(M)), q.answer, where);
      }
      if (t.slug === "graph-theory") { if (p.get("mode") === "hh") GT.parseSequence(p.get("seq")); else { const g = parseGraph(p.get("g").replace(/;/g, "\n")); if (p.get("mode") === "colour") assert.equal(GT.chromatic(g).chi, q.answer, where); if (p.get("mode") === "kirchhoff") assert.equal(Number(GT.spanningTrees(g).count), q.answer, where); } }
      if (t.slug === "recurrences") RC.parseRecurrence(p.get("t"));
      seen.set(`${t.slug}:${q.type}`, (seen.get(`${t.slug}:${q.type}`) ?? 0) + 1);
    }
  }
  // Every topic mixes question types.
  for (const t of DM_TOPICS) assert.ok([...seen.keys()].filter((k) => k.startsWith(`${t.slug}:`)).length >= 2, t.slug);
});
