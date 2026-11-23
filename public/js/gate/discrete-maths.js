// GATE question generators for this subject. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer is computed by the same engines the visualisers run.
import { pick, int, shuffle, query, mcq } from "./kit.js";
import { equivalence, evaluateFol, parse, parseDomain, randomFormula, show, truthTable } from "../engines/logic.js";
import { classes, counts, countPairs, divisibility, divisorsOf, equivalenceClosure, hasse, lattice, pairsOf, properties, reflexiveClosure, transitiveClosure } from "../engines/relations.js";
import { catalan, derangement, divisibleCount, fmtBig, forceCount, selection, solveRecurrence, starsAndBars } from "../engines/combinatorics.js";
import { parseGraph } from "../engines/graph.js";
import { bipartite, chromatic, euler, hamilton, havelHakimi, matching, randomSimpleGraph, spanningTrees } from "../engines/graphtheory.js";
import { GROWTHS, compareGrowth, exactT, parseRecurrence, solve, theta } from "../engines/recurrences.js";

// --- Logic ------------------------------------------------------------------------
const TAUT = ["(p → q) ∨ (q → p)", "((p → q) ∧ p) → q", "((p → q) ∧ ¬q) → ¬p", "((p → q) ∧ (q → r)) → (p → r)", "(p ∧ q) → p", "p → (p ∨ q)", "((p ∨ q) ∧ ¬p) → q",
  "(p → (q → r)) ↔ ((p ∧ q) → r)", "¬(p ∧ q) ↔ (¬p ∨ ¬q)", "(p → q) ↔ (¬q → ¬p)", "((p → r) ∧ (q → r)) → ((p ∨ q) → r)", "(p ∧ (p → q)) → (p ∧ q)"];
const NOT_TAUT = ["(p → q) → (q → p)", "((p → q) ∧ q) → p", "((p → q) ∧ ¬p) → ¬q", "(p ∨ q) → (p ∧ q)", "(p → q) ↔ (q → p)", "(p → (q → r)) ↔ ((p → q) → r)",
  "¬(p ∧ q) ↔ (¬p ∧ ¬q)", "p → (p ∧ q)", "(p ∨ q) → p", "((p ∨ q) ∧ p) → ¬q", "(p → q) ∧ (q → p)", "((p → r) ∨ (q → r)) → ((p ∨ q) → r)"];
const POOL = ["p → q", "¬p ∨ q", "¬q → ¬p", "q → p", "¬p → ¬q", "p ∧ ¬q", "¬(p → q)", "p ↔ q", "(p → q) ∧ (q → p)", "(p ∧ q) ∨ (¬p ∧ ¬q)", "p ⊕ q", "¬(p ↔ q)", "(p ∨ q) ∧ ¬(p ∧ q)",
  "¬(p ∧ q)", "¬p ∨ ¬q", "¬p ∧ ¬q", "¬(p ∨ q)", "p → (q → r)", "(p ∧ q) → r", "(p → q) → r", "p → (q ∧ r)", "(p → q) ∧ (p → r)", "(p ∨ q) → r", "(p → r) ∧ (q → r)", "(p → r) ∨ (q → r)",
  "p ∨ (q ∧ r)", "(p ∨ q) ∧ (p ∨ r)", "(p ∨ q) ∧ r", "p ∧ (q ∨ r)", "(p ∧ q) ∨ (p ∧ r)", "(p ∧ q) ∨ r", "q → (p → r)", "¬q ∨ ¬p ∨ r"];
const renameVars = (r, text) => { const perm = shuffle(r, ["p", "q", "r"]); return text.replace(/[pqr]/g, (c) => perm["pqr".indexOf(c)]); };
const FOL = [["∀x ∃y (x < y)", "every x has a larger y"], ["∃y ∀x (x ≤ y)", "some y is at least every x"], ["∀x ∃y (y < x)", "every x has a smaller y"], ["∃x ∀y (x ≤ y)", "some x is at most every y"],
  ["∀x (even(x) ∨ odd(x))", ""], ["∃x (prime(x) ∧ even(x))", ""], ["∀x (prime(x) → odd(x))", ""], ["∃x ∃y (x ≠ y ∧ x + y = 5)", ""], ["∀x ∀y (x + y ≥ 2)", ""], ["∃x ∀y divides(x, y)", ""], ["∀x ∃y (x + y = 5)", ""], ["∃x (x × x = x + 2)", ""], ["∀x ∃y (x × y = y)", ""]];

function logic(r) {
  const v = pick(r, ["taut", "taut", "equiv", "count", "fol"]);
  if (v === "taut") {
    const notQ = r() < 0.3;
    const right = renameVars(r, notQ ? pick(r, NOT_TAUT) : pick(r, TAUT));
    const wrongs = shuffle(r, notQ ? TAUT : NOT_TAUT).slice(0, 5).map((x) => renameVars(r, x));
    const all = [right, ...wrongs].map((x) => show(parse(x)));
    const kinds = all.map((x) => truthTable(parse(x)).kind);
    if ((kinds[0] === "tautology") === notQ || kinds.slice(1).some((k) => (k === "tautology") !== notQ)) return null;
    const m = mcq(r, all[0], all.slice(1));
    if (!m) return null;
    const table = truthTable(parse(all[0]));
    return {
      topic: "propositional-logic", type: "mcq", marks: 1, ...m,
      stem: [`Which one of the following formulas is ${notQ ? "NOT " : ""}a tautology?`],
      solution: [...m.options.map((o) => { const t = truthTable(parse(o)); return `${o}: ${t.kind}${t.kind === "tautology" ? "" : `, false when ${Object.entries(t.rows[t.final.findIndex((x) => !x)] ?? {}).map(([k, b]) => `${k} = ${b ? "T" : "F"}`).join(", ")}`}.`; }), `So the answer is ${all[0]} (${table.kind}).`],
      replay: query("/propositional-logic", { mode: "table", f: all[0] }),
    };
  }
  if (v === "equiv") {
    const forms = POOL.map((x) => parse(x));
    const target = int(r, 0, forms.length - 1);
    const same = forms.map((f, i) => i !== target && equivalence(forms[target], f).equivalent);
    const eq = forms.map((_, i) => i).filter((i) => same[i]);
    if (!eq.length) return null;
    const right = pick(r, eq);
    const vars = new Set([...truthTable(forms[target]).vars, ...truthTable(forms[right]).vars]);
    const wrong = shuffle(r, forms.map((_, i) => i).filter((i) => i !== target && !same[i] && truthTable(forms[i]).vars.every((x) => vars.has(x))));
    const m = mcq(r, show(forms[right]), wrong.map((i) => show(forms[i])));
    if (!m) return null;
    const e = equivalence(forms[target], forms[right]);
    return {
      topic: "propositional-logic", type: "mcq", marks: 1, ...m,
      stem: [`Which one of the following is logically equivalent to ${show(forms[target])}?`],
      solution: [`${show(forms[right])} has the same truth table as ${show(forms[target])} on all ${e.rows.length} rows.`, ...m.options.filter((o) => o !== show(forms[right])).map((o) => { const x = equivalence(forms[target], parse(o)); return `${o}: differs when ${Object.entries(x.counter.env).map(([k, b]) => `${k} = ${b ? "T" : "F"}`).join(", ")}.`; })],
      replay: query("/propositional-logic", { mode: "equiv", f: show(forms[target]), g: show(forms[right]) }),
    };
  }
  if (v === "count") {
    const f = randomFormula(r, ["p", "q", "r"], 3);
    const t = truthTable(f);
    if (t.vars.length < 3) return null;
    const n = t.final.filter(Boolean).length;
    return {
      topic: "propositional-logic", type: "nat", marks: 1, answer: n, tolerance: 0,
      stem: [`In how many of the 8 rows of its truth table is the formula ${show(f)} true?`],
      solution: [{ table: { head: t.cols.map((c) => c.label), rows: t.rows.map((_, i) => t.cols.map((c) => (c.values[i] ? "T" : "F"))) } }, `It is true in ${n} rows.`],
      replay: query("/propositional-logic", { mode: "table", f: show(f) }),
    };
  }
  const dom = pick(r, ["1 2 3", "1 2 3 4", "0 1 2", "1..5"]), domain = parseDomain(dom);
  const chosen = shuffle(r, FOL).slice(0, 4);
  const values = chosen.map(([f]) => evaluateFol(parse(f, { mode: "fol" }), domain).value);
  const answer = values.map((x, i) => (x ? i : null)).filter((x) => x !== null);
  if (!answer.length) return null;
  return {
    topic: "propositional-logic", type: "msq", marks: 2, options: chosen.map(([f]) => f), answer,
    stem: [`The domain of discourse is {${domain.join(", ")}}. Which of the following statements are true?`, "even, odd and prime have their usual meanings, and divides(x, y) means x divides y."],
    solution: chosen.map(([f], i) => { const res = evaluateFol(parse(f, { mode: "fol" }), domain); const key = res.steps.find((s) => /counterexample|witness/.test(s.note)); return `${f}: ${values[i] ? "true" : "false"}.${key ? ` ${key.note}` : ""}`; }),
    replay: query("/propositional-logic", { mode: "fol", f: chosen[answer[0]][0], dom: domain.join(" ") }),
  };
}

// --- Sets and relations -----------------------------------------------------------
const ELS = ["1", "2", "3", "4"];
const rel = (r, density) => ELS.map(() => ELS.map(() => r() < density));
const pairsText = (M) => pairsOf(M, ELS).map(([a, b]) => `(${a},${b})`).join(" ");

function relations(r) {
  const v = pick(r, ["count", "count", "closure", "props", "lattice", "hasse"]);
  if (v === "count") {
    const id = pick(r, ["reflexive", "symmetric", "antisymmetric", "equivalence", "reflexiveSymmetric", "functions", "injective", "surjective", "asymmetric", "relationsAB"]);
    const n = int(r, 3, 5), m = ["injective"].includes(id) ? int(r, n, n + 2) : ["surjective"].includes(id) ? int(r, 2, n) : int(r, 2, 4);
    const row = counts(n, m).find((x) => x.id === id);
    if (row.value > 10n ** 12n) return null;
    const what = {
      reflexive: `reflexive relations on a set with ${n} elements`, symmetric: `symmetric relations on a set with ${n} elements`, antisymmetric: `antisymmetric relations on a set with ${n} elements`,
      equivalence: `equivalence relations on a set with ${n} elements`, reflexiveSymmetric: `relations on a set with ${n} elements that are both reflexive and symmetric`, asymmetric: `asymmetric relations on a set with ${n} elements`,
      functions: `functions from a set with ${n} elements to a set with ${m} elements`, injective: `one-to-one (injective) functions from a set with ${n} elements to a set with ${m} elements`,
      surjective: `onto (surjective) functions from a set with ${n} elements to a set with ${m} elements`, relationsAB: `relations from a set with ${n} elements to a set with ${m} elements`,
    }[id];
    return {
      topic: "sets-relations", type: "nat", marks: ["equivalence", "surjective", "antisymmetric"].includes(id) ? 2 : 1, answer: Number(row.value), tolerance: 0,
      stem: [`How many ${what} are there?`],
      solution: [`${row.name}: ${row.formula}.`, `Here: ${row.work} = ${fmtBig(row.value)}.`],
      replay: query("/sets-relations", { mode: "count", n, m: ["functions", "injective", "surjective", "relationsAB"].includes(id) ? m : n }),
    };
  }
  if (v === "closure") {
    const M = rel(r, 0.28), kind = pick(r, ["transitive", "transitive", "reflexive transitive", "equivalence"]);
    const C = kind === "transitive" ? transitiveClosure(M) : kind === "equivalence" ? equivalenceClosure(M) : reflexiveClosure(transitiveClosure(M));
    if (countPairs(M) < 3 || countPairs(C) === countPairs(M)) return null;
    return {
      topic: "sets-relations", type: "nat", marks: 2, answer: countPairs(C), tolerance: 0,
      stem: [`Let R = {${pairsOf(M, ELS).map(([a, b]) => `(${a}, ${b})`).join(", ")}} on the set {1, 2, 3, 4}.`, `How many ordered pairs are in the ${kind} closure of R?`],
      solution: [kind === "equivalence" ? "Take the reflexive, then symmetric, then transitive closure." : kind === "transitive" ? "Warshall's algorithm: for k = 1 to 4, every i with (i, k) gets every j with (k, j)." : "Transitive closure by Warshall's algorithm, then add every (a, a).",
        `Result: {${pairsOf(C, ELS).map(([a, b]) => `(${a}, ${b})`).join(", ")}}, ${countPairs(C)} pairs.${kind === "equivalence" ? ` Its classes: ${classes(C, ELS).map((c) => `{${c.join(", ")}}`).join(", ")}.` : ""}`],
      replay: query("/sets-relations", { mode: "closure", set: ELS.join(" "), r: pairsText(M) }),
    };
  }
  if (v === "props") {
    let M = rel(r, 0.35);
    if (r() < 0.4) M = equivalenceClosure(M);
    else if (r() < 0.3) M = reflexiveClosure(M);
    const p = properties(M, ELS);
    const keys = ["reflexive", "symmetric", "antisymmetric", "transitive"];
    const answer = keys.map((k, i) => (p[k].ok ? i : null)).filter((x) => x !== null);
    if (!answer.length || countPairs(M) < 3) return null;
    return {
      topic: "sets-relations", type: "msq", marks: 2, options: keys.map((k) => `R is ${k}`), answer,
      stem: [`R is a relation on {1, 2, 3, 4}: R = {${pairsOf(M, ELS).map(([a, b]) => `(${a}, ${b})`).join(", ")}}.`, "Which of the following are true?"],
      solution: keys.map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${p[k].ok ? "yes" : `no, ${p[k].witness.text}`}.`),
      replay: query("/sets-relations", { mode: "props", set: ELS.join(" "), r: pairsText(M) }),
    };
  }
  if (v === "hasse") {
    const n = pick(r, [12, 16, 18, 20, 24, 28, 30, 42]);
    const ds = divisorsOf(n);
    if (ds.length > 12) return null;
    const { els, M } = divisibility(ds);
    const H = hasse(M, els);
    return {
      topic: "sets-relations", type: "nat", marks: 1, answer: H.covers.length, tolerance: 0,
      stem: [`Consider the poset of all positive divisors of ${n}, ordered by divisibility. How many edges does its Hasse diagram have?`],
      solution: [`Divisors: ${els.join(", ")}. d is covered by d·p for each prime p with d·p dividing ${n}.`, `Covering pairs: ${H.covers.map(([a, b]) => `${els[a]}-${els[b]}`).join(", ")}: ${H.covers.length} edges.`],
      replay: query("/sets-relations", { mode: "poset", set: els.join(" "), r: pairsOf(M, els).map(([a, b]) => `(${a},${b})`).join(" ") }),
    };
  }
  // A random poset on 5 or 6 elements: is it a lattice, distributive, Boolean?
  const named = [
    { set: "0 a b c 1", pairs: "0 a, 0 b, 0 c, a 1, b 1, c 1" }, { set: "0 a b c 1", pairs: "0 a, 0 c, a b, b 1, c 1" },
    { set: "a b c d", pairs: "a c, a d, b c, b d" }, { set: "0 a b 1", pairs: "0 a, 0 b, a 1, b 1" },
  ];
  let els, M;
  if (r() < 0.35) {
    const x = pick(r, named); els = x.set.split(" ");
    const idx = (e) => els.indexOf(e);
    M = els.map((_, i) => els.map((__, j) => i === j));
    for (const pr of x.pairs.split(",")) { const [a, b] = pr.trim().split(" "); M[idx(a)][idx(b)] = true; }
    M = transitiveClosure(M);
  } else if (r() < 0.5) {
    const n = pick(r, [6, 8, 12, 18, 20, 24, 30, 42]); ({ els, M } = divisibility(divisorsOf(n)));
  } else {
    els = ["a", "b", "c", "d", "e", "f"].slice(0, int(r, 5, 6));
    M = els.map((_, i) => els.map((__, j) => i === j || (i < j && r() < 0.35)));
    M = reflexiveClosure(transitiveClosure(M));
  }
  const H = hasse(M, els), L = lattice(M, els);
  const options = ["Not a lattice", "A lattice, but not distributive", "A distributive lattice, but not complemented", "A Boolean algebra (a complemented distributive lattice)"];
  const answer = !L.isLattice ? 0 : !L.distributive ? 1 : !L.complemented ? 2 : 3;
  return {
    topic: "sets-relations", type: "mcq", marks: 2, options, answer,
    stem: [`A partial order on {${els.join(", ")}} has the Hasse diagram with these edges (lower element first):`, { table: { head: ["Lower", "Upper"], rows: H.covers.map(([a, b]) => [els[a], els[b]]) } }, "Which one of the following best describes it?"],
    solution: L.steps.filter((s) => s.tone || s.pair === null).map((s) => s.note).slice(-3),
    replay: query("/sets-relations", { mode: "poset", set: els.join(" "), r: pairsOf(M, els).map(([a, b]) => `(${a},${b})`).join(" ") }),
  };
}

// --- Combinatorics ----------------------------------------------------------------
function counting(r) {
  const v = pick(r, ["stars", "ie", "derange", "catalan", "comb", "rec", "pigeon", "formula"]);
  if (v === "formula") {
    // Which formula fits the story? The four selection formulas, all with different values.
    const n = int(r, 5, 9), k = int(r, 3, 4);
    const kinds = ["perm", "permRep", "comb", "combRep"];
    const values = kinds.map((x) => selection(x, n, k).value);
    if (new Set(values.map(String)).size < 4) return null;
    const kind = pick(r, kinds);
    const text = { perm: `P(${n}, ${k}) = ${n}!/${n - k}!`, permRep: `${n}^${k}`, comb: `C(${n}, ${k})`, combRep: `C(${n + k - 1}, ${k})` };
    const story = {
      perm: `${k} different prizes are given to ${k} different people chosen from ${n} (nobody gets two).`,
      permRep: `Each of ${k} numbered questions is answered with one of ${n} options.`,
      comb: `A group of ${k} is chosen from ${n} people.`,
      combRep: `${k} identical sweets are shared among ${n} children (a child may get several or none).`,
    }[kind];
    const options = shuffle(r, kinds).map((x) => text[x]);
    const res = selection(kind, n, k);
    return {
      topic: "combinatorics", type: "mcq", marks: 1, options, answer: options.indexOf(text[kind]),
      stem: [story, "Which expression counts the possible outcomes?"],
      solution: [res.why, `${res.formula}, so ${text[kind]} = ${fmtBig(res.value)}.`],
      replay: query("/combinatorics", { mode: "select", kind, n, r: k }),
    };
  }
  if (v === "stars") {
    const n = int(r, 8, 20), k = int(r, 3, 5), lo = pick(r, [0, 1, 2]);
    const res = starsAndBars(n, k, Array(k).fill(lo));
    return {
      topic: "combinatorics", type: "nat", marks: lo ? 2 : 1, answer: Number(res.value), tolerance: 0,
      stem: [`How many solutions does x₁ + x₂ + … + x${"₀₁₂₃₄₅"[k]} = ${n} have, where every xᵢ is an integer with xᵢ ≥ ${lo}?`],
      solution: [lo ? `Give each variable its minimum first: ${n} − ${k}·${lo} = ${res.rest} remain to share freely.` : "Stars and bars: arrange n stars and k − 1 bars.", `${res.work} = ${fmtBig(res.value)}.`],
      replay: query("/combinatorics", { mode: "stars", n, k, ...(lo ? { lo: Array(k).fill(lo).join(" ") } : {}) }),
    };
  }
  if (v === "ie") {
    const N = pick(r, [100, 200, 300, 500, 1000]), ds = pick(r, [[2, 3, 5], [2, 3, 7], [3, 5, 7], [2, 5, 7], [4, 6, 10], [6, 10, 15]]);
    const res = divisibleCount(N, ds), none = r() < 0.5;
    return {
      topic: "combinatorics", type: "nat", marks: 2, answer: none ? res.none : res.union, tolerance: 0,
      stem: [`How many integers from 1 to ${N} are divisible by ${none ? "none" : "at least one"} of ${ds.slice(0, -1).join(", ")} and ${ds[ds.length - 1]}?`],
      solution: [{ table: { head: ["Divisible by", "Count"], rows: res.subsets.map((x) => [`${x.sets.map((k) => ds["ABC".indexOf(k)]).join(" and ")} (lcm ${x.lcm})`, x.count]) } },
        `Inclusion-exclusion: ${res.union} are divisible by at least one${none ? `, so ${N} − ${res.union} = ${res.none} by none` : ""}.`],
      replay: query("/combinatorics", { mode: "ie", ie: "div", N, d: ds.join(" ") }),
    };
  }
  if (v === "derange") {
    const n = int(r, 4, 7);
    return {
      topic: "combinatorics", type: "nat", marks: 1, answer: Number(derangement(n)), tolerance: 0,
      stem: [`${n} students hand in their homework, and the teacher hands the ${n} papers back at random for marking. In how many ways can this be done so that no student gets their own paper?`],
      solution: [`This is the number of derangements D(${n}). D(n) = (n − 1)(D(n − 1) + D(n − 2)) with D(1) = 0, D(2) = 1.`, `D(${n}) = ${fmtBig(derangement(n))}.`],
      replay: query("/combinatorics", { mode: "derange", n }),
    };
  }
  if (v === "catalan") {
    const n = int(r, 4, 8), story = pick(r, ["bst", "parens", "polygon"]);
    return {
      topic: "combinatorics", type: "nat", marks: 1, answer: Number(catalan(n)), tolerance: 0,
      stem: [{ bst: `How many distinct binary search trees can be built with the ${n} keys 1, 2, …, ${n}?`, parens: `How many strings of ${n} opening and ${n} closing brackets are balanced?`, polygon: `In how many ways can a convex polygon with ${n + 2} sides be cut into triangles by non-crossing diagonals?` }[story]],
      solution: [`This is the Catalan number C(${n}) = C(${2 * n}, ${n}) / ${n + 1}.`, `= ${fmtBig(catalan(n))}.`],
      replay: query("/combinatorics", { mode: "catalan", n }),
    };
  }
  if (v === "comb") {
    const kind = pick(r, ["perm", "comb", "combRep", "permRep"]), n = int(r, 4, 9), k = kind === "perm" ? 3 : int(r, 2, 4);
    const res = selection(kind, n, k);
    const stem = { perm: `In how many ways can a gold, a silver and a bronze medal go to 3 different runners out of ${n}?`, comb: `In how many ways can a team of ${k} be chosen from ${n} people?`,
      combRep: `A shop sells ${n} kinds of doughnut. In how many ways can you buy ${k} doughnuts (several of a kind allowed; order doesn't matter)?`, permRep: `How many ${k}-letter strings can be formed from an alphabet of ${n} letters, repetition allowed?` }[kind];
    return {
      topic: "combinatorics", type: "nat", marks: 1, answer: Number(res.value), tolerance: 0,
      stem: [stem], solution: [`${res.why} ${res.formula}.`, `${res.work} = ${fmtBig(res.value)}.`],
      replay: query("/combinatorics", { mode: "select", kind, n, r: k }),
    };
  }
  if (v === "pigeon") {
    const boxes = int(r, 4, 12), want = int(r, 2, 6);
    return {
      topic: "combinatorics", type: "nat", marks: 1, answer: forceCount(boxes, want), tolerance: 0,
      stem: [`A bag holds marbles of ${boxes} colours, plenty of each. What is the least number of marbles you must draw, without looking, to be certain of having ${want} of the same colour?`],
      solution: [`With ${want - 1} of each colour (${boxes * (want - 1)} marbles) you could still miss. One more forces ${want} of a colour: k(r − 1) + 1 = ${forceCount(boxes, want)}.`],
      replay: query("/combinatorics", { mode: "pigeon", items: forceCount(boxes, want), boxes }),
    };
  }
  const roots = pick(r, [[2, 3], [1, 2], [2, -1], [3, -1], [1, 3], [2, 2], [3, 3], [1, 1]]);
  const c1 = roots[0] + roots[1], c2 = -roots[0] * roots[1];
  const spec = { c1, c2, d: 0, a0: int(r, 0, 3), a1: int(r, 1, 5) };
  const n = int(r, 5, 8);
  const res = solveRecurrence(spec, n);
  if (Math.abs(res.values[n]) > 1e7) return null;
  return {
    topic: "combinatorics", type: "nat", marks: 2, answer: res.values[n], tolerance: 0,
    stem: [`A sequence satisfies aₙ = ${c1}aₙ₋₁ ${c2 < 0 ? "−" : "+"} ${Math.abs(c2)}aₙ₋₂ for n ≥ 2, with a₀ = ${spec.a0} and a₁ = ${spec.a1}. What is a${"₀₁₂₃₄₅₆₇₈"[n]}?`],
    solution: [`Characteristic equation x² − ${c1}x ${c2 < 0 ? "+" : "−"} ${Math.abs(c2)} = 0, roots ${res.rootText}. Closed form aₙ = ${res.formula}.`, `Values: ${res.values.slice(0, n + 1).join(", ")}.`],
    replay: query("/combinatorics", { mode: "rec", c1, c2, cd: 0, a0: spec.a0, a1: spec.a1 }),
  };
}

// --- Graph theory -------------------------------------------------------------------
const edgeRows = (g) => g.edges.map((e) => `${e.from}-${e.to}`).join(", ");
function graphs(r) {
  const v = pick(r, ["hh", "chi", "faces", "msq", "trees", "match"]);
  if (v === "hh") {
    const seqs = [];
    for (let tries = 0; tries < 200 && seqs.length < 40; tries++) {
      const n = int(r, 5, 7), s = Array.from({ length: n }, () => int(r, 1, n - 1)).sort((a, b) => b - a);
      if (s.reduce((a, b) => a + b, 0) % 2) continue;
      if (!seqs.some((x) => x.join() === s.join())) seqs.push(s);
    }
    const yes = seqs.filter((s) => havelHakimi(s).graphic), no = seqs.filter((s) => !havelHakimi(s).graphic);
    const flip = r() < 0.3;
    const right = flip ? no : yes, wrong = flip ? yes : no;
    if (!right.length || wrong.length < 3) return null;
    const ans = pick(r, right);
    const m = mcq(r, ans.join(", "), shuffle(r, wrong).map((s) => s.join(", ")));
    if (!m) return null;
    return {
      topic: "graph-theory", type: "mcq", marks: 2, ...m,
      stem: [`Which one of the following degree sequences is ${flip ? "NOT " : ""}graphic, that is, ${flip ? "cannot be" : "can be"} the degrees of a simple undirected graph?`],
      solution: m.options.map((o) => { const res = havelHakimi(o.split(", ").map(Number)); return `${o}: ${res.graphic ? "graphic" : "not graphic"}. ${res.steps[res.steps.length - 1].note}`; }),
      replay: query("/graph-theory", { mode: "hh", seq: ans.join(" ") }),
    };
  }
  const g = parseGraph(randomSimpleGraph(r, int(r, 5, 6), 0.5));
  const gParam = g.edges.map((e) => `${e.from} ${e.to}`).join(";");
  const stemG = [`G is the simple undirected graph on vertices ${g.nodes.join(", ")} with edges ${edgeRows(g)}.`];
  if (v === "chi") {
    const res = chromatic(g);
    if (res.chi < 3) return null;
    return {
      topic: "graph-theory", type: "nat", marks: 2, answer: res.chi, tolerance: 0,
      stem: [...stemG, "What is the chromatic number of G?"],
      solution: [`The clique {${res.clique.join(", ")}} needs ${res.clique.length} colours.`, `A proper ${res.chi}-colouring: ${Object.entries(res.colouring).map(([x, c]) => `${x} = ${c}`).join(", ")}${res.chi > res.clique.length ? `; every attempt with ${res.chi - 1} colours fails` : ""}. So χ(G) = ${res.chi}.`],
      replay: query("/graph-theory", { mode: "colour", g: gParam }),
    };
  }
  if (v === "faces") {
    const d = pick(r, [3, 4, 5]), vv = int(r, 6, 20) * (d % 2 ? 2 : 1);
    if (d === 5 && vv < 12) return null;
    const e = (vv * d) / 2;
    if (e > 3 * vv - 6) return null;
    return {
      topic: "graph-theory", type: "nat", marks: 1, answer: e - vv + 2, tolerance: 0,
      stem: [`A connected planar simple graph has ${vv} vertices, every one of degree ${d}. How many faces (regions, including the outer one) does any planar embedding of it have?`],
      solution: [`Handshake lemma: e = ${vv} × ${d} / 2 = ${e}.`, `Euler's formula v − e + f = 2: f = ${e} − ${vv} + 2 = ${e - vv + 2}.`],
      replay: query("/graph-theory", { mode: "planar", g: gParam }),
    };
  }
  if (v === "msq") {
    const eu = euler(g), statements = [
      ["G has an Euler circuit", eu.kind === "circuit"],
      ["G has an Euler trail that starts and ends at different vertices", eu.kind === "trail"],
      ["G is bipartite", bipartite(g).bipartite],
      ["G has a Hamiltonian cycle", !!hamilton(g).cycle],
    ];
    const answer = statements.map(([, ok], i) => (ok ? i : null)).filter((x) => x !== null);
    if (!answer.length) return null;
    return {
      topic: "graph-theory", type: "msq", marks: 2, options: statements.map(([s]) => s), answer,
      stem: [...stemG, "Which of the following are true?"],
      solution: [`Odd-degree vertices: ${eu.odd.join(", ") || "none"}, so ${eu.kind === "circuit" ? "an Euler circuit exists" : eu.kind === "trail" ? "an open Euler trail exists" : "there is no Euler trail"}.`,
        bipartite(g).steps.at(-1).note, hamilton(g).cycle ? `Hamiltonian cycle: ${[...hamilton(g).cycle, hamilton(g).cycle[0]].join(" → ")}.` : "A full search finds no Hamiltonian cycle."],
      replay: query("/graph-theory", { mode: "euler", g: gParam }),
    };
  }
  if (v === "trees") {
    const res = spanningTrees(g);
    if (res.count < 3n || res.count > 2000n) return null;
    return {
      topic: "graph-theory", type: "nat", marks: 2, answer: Number(res.count), tolerance: 0,
      stem: [...stemG, "How many spanning trees does G have?"],
      solution: ["Kirchhoff's matrix-tree theorem: build L = D − A, delete one row and the matching column, and take the determinant.", { table: { head: ["", ...g.nodes], rows: res.L.map((row, i) => [g.nodes[i], ...row.map((x) => String(x).replace("-", "−"))]) } }, `The determinant is ${res.count}.`],
      replay: query("/graph-theory", { mode: "kirchhoff", g: gParam }),
    };
  }
  const res = matching(g);
  return {
    topic: "graph-theory", type: "nat", marks: 1, answer: res.size, tolerance: 0,
    stem: [...stemG, "What is the size of a maximum matching in G?"],
    solution: [`One maximum matching: ${Object.entries(res.mate).filter(([a, b]) => a < b).map(([a, b]) => `${a}-${b}`).join(", ")}.`, res.steps.at(-1).note],
    replay: query("/graph-theory", { mode: "matching", g: gParam }),
  };
}

// --- Recurrences --------------------------------------------------------------------
function recurrences(r) {
  const v = pick(r, ["master", "master", "case", "value", "order"]);
  if (v === "master" || v === "case") {
    const gap = v === "case" && r() < 0.25;
    const text = gap ? pick(r, ["T(n) = 2T(n/2) + n/log n", "T(n) = 4T(n/2) + n^2/log n", "T(n) = 8T(n/2) + n^3/log n", "T(n) = 3T(n/3) + n/log n"])
      : `T(n) = ${pick(r, [1, 2, 3, 4, 7, 8, 9, 16])}T(n/${pick(r, [2, 3, 4])}) + ${pick(r, ["1", "n", "n^2", "n log n", "sqrt(n)", "n^3", "log n", "n^2 log n"])}`;
    const rec = parseRecurrence(text), sol = solve(rec);
    const replay = query("/recurrences", { mode: "master", t: rec.text });
    if (v === "case") {
      const options = ["Case 1", "Case 2", "Case 3", "The master theorem does not apply"];
      return {
        topic: "recurrences", type: "mcq", marks: 1, options, answer: sol.basic ? sol.case - 1 : 3,
        stem: [`Consider ${rec.text}. Using the master theorem (with case 2 covering f(n) = Θ(n^(log_b a) logᵏ n) for k ≥ 0), which case applies?`],
        solution: sol.steps.map((s) => s.note),
        replay,
      };
    }
    const c = Math.log(sol.a) / Math.log(sol.b);
    const pool = [theta(sol.growth), "Θ(n)", "Θ(n log n)", "Θ(n²)", "Θ(log n)", "Θ(n² log n)", "Θ(n³)", "Θ(log² n)", `Θ(n^${Number.isInteger(Math.round(c * 1000) / 1000) ? c : c.toFixed(2)})`, "Θ(√n)", "Θ(n³ log n)"];
    const m = mcq(r, theta(sol.growth), shuffle(r, pool.slice(1)));
    if (!m) return null;
    return {
      topic: "recurrences", type: "mcq", marks: 2, ...m,
      stem: [`What is the solution of the recurrence ${rec.text}?`],
      solution: sol.steps.map((s) => s.note),
      replay,
    };
  }
  if (v === "value") {
    const text = pick(r, ["T(n) = 2T(n/2) + n", "T(n) = T(n/2) + 1", "T(n) = T(n-1) + n", "T(n) = 2T(n-1) + 1", "T(n) = 3T(n/2) + 1", "T(n) = 4T(n/2) + n", "T(n) = T(n-1) + 2", "T(n) = 2T(n/2) + 1", "T(n) = T(n-2) + n"]);
    const rec = parseRecurrence(text);
    const n = rec.type === "subtract" ? int(r, 5, 10) : pick(r, [8, 16, 32, 64]);
    const ans = exactT(rec, n);
    return {
      topic: "recurrences", type: "nat", marks: 1, answer: ans, tolerance: 0,
      stem: [`T(n) is defined by ${rec.text} for n > 1, and T(n) = 1 for n ≤ 1.${rec.type === "divide" ? " Sizes n/b are exact here because n is a power of b." : ""} What is T(${n})?`],
      solution: [`Unroll from the base case: ${(rec.type === "divide" ? Array.from({ length: Math.log2(n) + 1 }, (_, i) => 2 ** i) : Array.from({ length: n }, (_, i) => i + 1)).filter((x) => x <= n).map((x) => `T(${x}) = ${exactT(rec, x)}`).join(", ")}.`, `So T(${n}) = ${ans}; asymptotically ${solve(rec).answer}.`],
      replay: query("/recurrences", { mode: "tree", t: rec.text }),
    };
  }
  const keys = shuffle(r, Object.keys(GROWTHS).filter((k) => k !== "one")).slice(0, 4);
  const sorted = [...keys].sort((a, b) => compareGrowth(GROWTHS[a].g, GROWTHS[b].g));
  const text = (o) => o.map((k) => GROWTHS[k].label).join(" < ");
  const swaps = [[0, 1], [1, 2], [2, 3], [0, 3], [0, 2], [1, 3]].map(([i, j]) => { const o = [...sorted]; [o[i], o[j]] = [o[j], o[i]]; return text(o); });
  const m = mcq(r, text(sorted), shuffle(r, swaps));
  if (!m) return null;
  return {
    topic: "recurrences", type: "mcq", marks: 1, ...m,
    stem: [`Which one of the following lists the functions ${keys.map((k) => GROWTHS[k].label).join(", ")} in increasing order of asymptotic growth?`],
    solution: [`${text(sorted)}.`, "Compare in this order: n! and nⁿ beat any exponential, cⁿ beats any polynomial, a larger power of n wins, then a larger power of log n, then of log log n."],
    replay: query("/recurrences", { mode: "growth", t: "T(n) = 2T(n/2) + n" }),
  };
}

export const TOPICS = [
  { slug: "propositional-logic", subject: "discrete-maths", title: "Logic", make: logic },
  { slug: "sets-relations", subject: "discrete-maths", title: "Relations and lattices", make: relations },
  { slug: "combinatorics", subject: "discrete-maths", title: "Counting", make: counting },
  { slug: "graph-theory", subject: "discrete-maths", title: "Graph theory", make: graphs },
  { slug: "recurrences", subject: "discrete-maths", title: "Recurrences and growth", make: recurrences },
];
