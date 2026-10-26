import assert from "node:assert/strict";
import { test } from "node:test";
import { cyk, EXAMPLES, firstFollow, leftFactor, ll1, ll1Parse, lrAutomaton, lrParse, lrTable, parseGrammar, removeLeftRecursion, toText, tokenize } from "../public/js/engines/grammar.js";

const G = (k) => parseGrammar(EXAMPLES[k].text);
const set = (s) => [...s].sort();

test("parsing splits bodies with and without spaces", () => {
  const g = parseGrammar("E -> TE'\nE' -> +TE' | eps\nT -> id");
  assert.deepEqual(g.prods[0].rhs, ["T", "E'"]);
  assert.deepEqual(g.prods[1].rhs, ["+", "T", "E'"]);
  assert.deepEqual(g.prods[2].rhs, []);
  assert.deepEqual(g.prods[3].rhs, ["id"]);
  assert.throws(() => parseGrammar("nonsense"), /Can't read/);
});

test("left recursion: E → E + T | T becomes E → T E', E' → + T E' | ε", () => {
  const r = removeLeftRecursion(G("expr"));
  assert.equal(toText(r.grammar), "E -> T E'\nE' -> + T E' | ε\nT -> F T'\nT' -> * F T' | ε\nF -> ( E ) | id");
});

// Dragon Book example 4.20: S → Aa | b, A → Ac | Sd | ε.
test("indirect left recursion (Dragon Book 4.20)", () => {
  const r = removeLeftRecursion(G("indirect"));
  assert.equal(toText(r.grammar), "S -> A a | b\nA -> b d A' | A'\nA' -> c A' | a d A' | ε");
  assert.ok(r.warnings.length); // it has an ε-production
});

test("left factoring the dangling-else grammar", () => {
  const r = leftFactor(G("ifelse"));
  assert.equal(toText(r.grammar), "S -> i E t S S' | a\nS' -> e S | ε\nE -> b");
});

test("FIRST and FOLLOW of the LL(1) expression grammar", () => {
  const { first, follow } = firstFollow(G("exprLL"));
  assert.deepEqual(set(first.get("E")), ["(", "id"]);
  assert.deepEqual(set(first.get("E'")), ["+", "ε"]);
  assert.deepEqual(set(first.get("T'")), ["*", "ε"]);
  assert.deepEqual(set(follow.get("E")), ["$", ")"]);
  assert.deepEqual(set(follow.get("E'")), ["$", ")"]);
  assert.deepEqual(set(follow.get("T")), ["$", ")", "+"]);
  assert.deepEqual(set(follow.get("F")), ["$", ")", "*", "+"]);
});

test("LL(1) table and parse of id + id * id", () => {
  const g = G("exprLL"), t = ll1(g);
  assert.equal(t.conflicts.length, 0);
  assert.deepEqual(t.cell("E'", ")").map((i) => g.prods[i].rhs), [[]]);
  const r = ll1Parse(g, t, tokenize("id+id*id", g));
  assert.ok(r.accepted);
  const tree = r.steps.at(-1).tree;
  assert.equal(tree.label, "E");
  assert.deepEqual(tree.kids.map((k) => k.label), ["T", "E'"]);
  assert.ok(!ll1Parse(g, t, tokenize("id + * id", g)).accepted);
});

test("LL(1) conflict in the factored dangling-else grammar", () => {
  const g = leftFactor(G("ifelse")).grammar, t = ll1(g);
  assert.deepEqual(t.conflicts.map((c) => `${c.nt},${c.t}`), ["S',e"]);
});

test("LR(0)/SLR on the expression grammar: 12 states, SLR conflict-free", () => {
  const a = lrAutomaton(G("expr"), "slr");
  assert.equal(a.states.length, 12);
  assert.equal(lrTable(a).conflicts.length, 0);
  const lr0 = lrAutomaton(G("expr"), "lr0");
  assert.ok(lrTable(lr0).conflicts.some((c) => c.kind === "shift/reduce"));
});

// Dragon Book Fig. 4.38: the moves of an SLR parser on id * id + id.
test("SLR parse of id * id + id matches the textbook's 14 moves", () => {
  const a = lrAutomaton(G("expr"), "slr"), t = lrTable(a);
  const r = lrParse(a, t, tokenize("id*id+id", a.g));
  assert.ok(r.accepted);
  assert.equal(r.steps.length - 1, 14);
  const tree = r.steps.at(-1).forest;
  assert.equal(tree.length, 1);
  assert.equal(tree[0].label, "E");
});

test("S → CC: 10 CLR states, 7 LALR states (I36, I47, I89)", () => {
  const clr = lrAutomaton(G("cc"), "clr");
  assert.equal(clr.states.length, 10);
  const lalr = lrAutomaton(G("cc"), "lalr");
  assert.equal(lalr.states.length, 7);
  assert.deepEqual(lalr.names.filter((n) => n.length > 1).sort(), ["36", "47", "89"]);
  for (const a of [clr, lalr]) assert.ok(lrParse(a, lrTable(a), ["c", "d", "d"]).accepted);
});

test("S → L = R: SLR has a shift/reduce conflict on =, LALR does not", () => {
  const slr = lrAutomaton(G("lr"), "slr");
  assert.equal(slr.states.length, 10);
  const c = lrTable(slr).conflicts;
  assert.equal(c.length, 1);
  assert.equal(c[0].t, "=");
  assert.equal(lrTable(lrAutomaton(G("lr"), "lalr")).conflicts.length, 0);
  assert.equal(lrTable(lrAutomaton(G("lr"), "clr")).conflicts.length, 0);
});

test("CLR on the expression grammar has 22 states and LALR folds them to 12", () => {
  assert.equal(lrAutomaton(G("expr"), "clr").states.length, 22);
  assert.equal(lrAutomaton(G("expr"), "lalr").states.length, 12);
});

// Hopcroft, Motwani & Ullman, Example 7.34: "baaba" is in the language.
test("CYK fills the table for baaba", () => {
  const r = cyk(G("cnf"), ["b", "a", "a", "b", "a"]);
  assert.ok(r.accepted);
  assert.deepEqual(r.table[0].map((c) => c.sort()), [["B"], ["A", "C"], ["A", "C"], ["B"], ["A", "C"]]);
  assert.deepEqual(r.table[4][0].sort(), ["A", "C", "S"]);
  assert.equal(r.tree.label, "S");
  assert.throws(() => cyk(G("expr"), ["id"]), /Chomsky/);
  assert.ok(cyk(G("anbn"), [..."aaabbb"]).accepted);
  assert.ok(!cyk(G("anbn"), [..."aabbb"]).accepted);
});
