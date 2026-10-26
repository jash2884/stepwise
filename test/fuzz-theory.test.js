// Fuzz tests for the theory and compiler engines: random regular expressions,
// grammars and expressions, checked against invariants that must always hold.
import assert from "node:assert/strict";
import { test } from "node:test";
import { minimize, regexToNfa, run, subsetConstruction } from "../public/js/engines/automata.js";
import { cyk, END, ll1, ll1Parse, LR_KINDS, lrAutomaton, lrParse, lrTable, make, parseGrammar, removeLeftRecursion, leftFactor, firstFollow } from "../public/js/engines/grammar.js";
import { dag, generate, parseBlock } from "../public/js/engines/tac.js";

let seed = 777;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const strings = (n) => Array.from({ length: n }, () => Array.from({ length: Math.floor(rand() * 7) }, () => pick(["a", "b"])).join(""));

function randomRegex(depth = 0) {
  const r = rand();
  if (depth > 3 || r < 0.3) return pick(["a", "b", "a", "b", "ε"]);
  if (r < 0.55) return randomRegex(depth + 1) + randomRegex(depth + 1);
  if (r < 0.75) return `(${randomRegex(depth + 1)}|${randomRegex(depth + 1)})`;
  return `(${randomRegex(depth + 1)})${pick(["*", "+", "?"])}`;
}

test("regex → NFA → DFA → minimal DFA all accept exactly the same strings", () => {
  for (let k = 0; k < 250; k++) {
    const re = randomRegex();
    const { nfa } = regexToNfa(re);
    const { dfa } = subsetConstruction(nfa);
    assert.equal(dfa.kind === "DFA" || dfa.states.length === 1, true);
    const { min } = minimize(dfa);
    assert.ok(min.states.length <= dfa.states.length, re);
    for (const s of strings(25)) {
      const want = run(nfa, s).accepted;
      assert.equal(run(dfa, s).accepted, want, `${re} on "${s}" (DFA)`);
      assert.equal(run(min, s).accepted, want, `${re} on "${s}" (minimal)`);
    }
    // Minimising twice changes nothing.
    assert.equal(minimize(min).min.states.length, min.states.length, re);
  }
});

// Random grammars over S, A, B with terminals a, b, c; every non-terminal gets
// a terminal-only rule so derivations always finish.
function randomGrammar() {
  const nts = ["S", "A", "B"], syms = ["a", "b", "c", "S", "A", "B"];
  const lines = nts.map((A) => {
    const alts = [pick(["a", "b", "c"])];
    for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) alts.push(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(syms)).join(" "));
    if (rand() < 0.2) alts.push("ε");
    return `${A} -> ${alts.join(" | ")}`;
  });
  return parseGrammar(lines.join("\n"));
}

function derive(g, sym = g.start, depth = 0) {
  if (!g.isNT(sym)) return [sym];
  const options = g.prods.filter((p) => p.lhs === sym);
  const shortest = options.reduce((a, b) => (b.rhs.filter(g.isNT).length < a.rhs.filter(g.isNT).length ? b : a));
  const p = depth > 5 ? shortest : pick(options);
  return p.rhs.flatMap((s) => derive(g, s, depth + 1));
}

test("generated strings are accepted by every conflict-free LL(1) and LR parser", () => {
  let checked = 0;
  for (let k = 0; k < 300; k++) {
    const g = randomGrammar();
    const sentences = Array.from({ length: 6 }, () => derive(g)).filter((s) => s.length <= 14);
    const t = ll1(g);
    if (!t.conflicts.length) for (const s of sentences) { assert.ok(ll1Parse(g, t, s).accepted, `LL(1) ${s.join(" ")}`); checked++; }
    const conflicts = {};
    for (const kind of Object.keys(LR_KINDS)) {
      const a = lrAutomaton(g, kind), tb = lrTable(a);
      conflicts[kind] = tb.conflicts.length;
      if (!tb.conflicts.length) for (const s of sentences) { assert.ok(lrParse(a, tb, s).accepted, `${kind} ${s.join(" ")}`); checked++; }
    }
    // Each class contains the one before it: LR(0) ⊂ SLR(1) ⊂ LALR(1) ⊂ CLR(1).
    if (!conflicts.lr0) assert.equal(conflicts.slr, 0);
    if (!conflicts.slr) assert.equal(conflicts.lalr, 0);
    if (!conflicts.lalr) assert.equal(conflicts.clr, 0);
    // LALR has exactly as many states as LR(0).
    assert.equal(lrAutomaton(g, "lalr").states.length, lrAutomaton(g, "lr0").states.length);
  }
  assert.ok(checked > 300, `only ${checked} parses checked`);
});

test("FOLLOW sets never contain ε, always end-mark the start, and transforms keep generated strings", () => {
  for (let k = 0; k < 200; k++) {
    const g = randomGrammar();
    const { follow } = firstFollow(g);
    assert.ok(follow.get(g.start).has(END));
    for (const set of follow.values()) assert.ok(!set.has("ε"));
    // After removing left recursion and left factoring, the grammar must still
    // generate the original strings: check with whichever parser has no conflicts.
    const g2 = leftFactor(removeLeftRecursion(g).grammar).grammar;
    assert.ok(!g2.prods.some((p) => p.rhs[0] === p.lhs), "no immediate left recursion remains");
    const t2 = ll1(g2);
    let a = null, tb = { conflicts: [1] };
    try { a = lrAutomaton(g2, "lalr"); tb = lrTable(a); } catch (e) { assert.match(e.message, /more than/); }
    for (let n = 0; n < 4; n++) {
      const s = derive(g);
      if (s.length > 12) continue;
      if (!t2.conflicts.length) assert.ok(ll1Parse(g2, t2, s).accepted, `LL(1) ${s.join(" ")} after transforms`);
      if (!tb.conflicts.length) assert.ok(lrParse(a, tb, s).accepted, `LALR ${s.join(" ")} after transforms`);
    }
  }
});

test("CYK accepts every string a CNF grammar generates", () => {
  for (let k = 0; k < 200; k++) {
    const nts = ["S", "A", "B", "C"], prods = [];
    for (const A of nts) {
      prods.push({ lhs: A, rhs: [pick(["a", "b"])] });
      for (let n = 0; n < 2; n++) prods.push({ lhs: A, rhs: [pick(nts), pick(nts)] });
    }
    const g = make(nts, prods.filter((p, i) => prods.findIndex((q) => q.lhs === p.lhs && q.rhs.join() === p.rhs.join()) === i), "S");
    for (let n = 0; n < 5; n++) {
      const s = derive(g);
      if (s.length > 10) continue;
      assert.ok(cyk(g, s).accepted, s.join(""));
    }
  }
});

function evalCode(code, env) {
  const v = { ...env }, val = (x) => (x in v ? v[x] : Number(x));
  for (const i of code) {
    const a = val(i.a1), b = i.a2 == null ? null : val(i.a2);
    v[i.res] = i.op === "=" ? a : i.op === "minus" ? -a : i.op === "+" ? a + b : i.op === "-" ? a - b : i.op === "*" ? a * b : i.op === "/" ? a / b : i.op === "%" ? a % b : a ** b;
  }
  return v;
}

test("three-address code from the tree and from the DAG compute the same values", () => {
  const expr = (d = 0) => (d > 3 || rand() < 0.3 ? pick(["a", "b", "c", "d", "2", "3"]) : rand() < 0.15 ? `-${expr(d + 1)}` : `(${expr(d + 1)} ${pick(["+", "-", "*"])} ${expr(d + 1)})`);
  for (let k = 0; k < 400; k++) {
    const src = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => `${pick(["a", "b", "x", "y"])} = ${expr()}`).join("\n");
    const stmts = parseBlock(src);
    const env = { a: 3, b: -2, c: 5, d: 7 };
    const one = evalCode(generate(stmts).code, env), two = evalCode(dag(stmts).code, env);
    for (const s of stmts) assert.equal(two[s.target], one[s.target], `${src}\n${s.target}`);
    assert.ok(dag(stmts).code.length <= generate(stmts).code.length);
  }
});
