import assert from "node:assert/strict";
import { test } from "node:test";
import { closure, EXAMPLES, minimize, parseAutomaton, regexToNfa, run, subsetConstruction } from "../public/js/engines/automata.js";

const fa = (k) => parseAutomaton(EXAMPLES[k].text);
const accepts = (m, s) => run(m, s).accepted;

test("DFA run: strings ending in abb", () => {
  const d = fa("endsAbb");
  assert.equal(d.kind, "DFA");
  for (const s of ["abb", "aabb", "babb", "abababb"]) assert.ok(accepts(d, s), s);
  for (const s of ["", "ab", "abba", "bbb"]) assert.ok(!accepts(d, s), s);
  const r = run(d, "abb");
  assert.deepEqual(r.steps.map((x) => x.active[0]), ["0", "1", "2", "3"]);
  assert.match(r.steps.at(-1).note, /ACCEPTED/);
});

test("NFA and ε-NFA runs track sets of states", () => {
  const n = fa("nfa");
  assert.equal(n.kind, "NFA");
  assert.ok(accepts(n, "0100") && accepts(n, "111"));
  assert.ok(!accepts(n, "0011"));
  const e = fa("enfa");
  assert.equal(e.kind, "ε-NFA");
  assert.deepEqual([...closure(e, ["s"])].sort(), ["p", "q", "s"]);
  assert.ok(accepts(e, "") && accepts(e, "aaa") && accepts(e, "bb"));
  assert.ok(!accepts(e, "ab"));
});

// Aho, Lam, Sethi & Ullman (the Dragon Book), §3.7: (a|b)*abb.
test("Dragon Book: (a|b)*abb → 11-state NFA → 5-state DFA → 4-state minimal DFA", () => {
  const { nfa } = regexToNfa("(a|b)*abb");
  assert.equal(nfa.states.length, 11);
  const { dfa } = subsetConstruction(nfa, { includeDead: false });
  assert.equal(dfa.states.length, 5);
  const { min } = minimize(dfa);
  assert.equal(min.states.length, 4);
  for (const s of ["abb", "babb", "aaabb", "ababb"]) assert.ok(accepts(nfa, s) && accepts(dfa, s) && accepts(min, s), s);
  for (const s of ["ab", "abba", "", "bbbb"]) assert.ok(!accepts(nfa, s) && !accepts(dfa, s) && !accepts(min, s), s);
});

test("subset construction of the 'third from the end' NFA needs 8 DFA states", () => {
  const { dfa } = subsetConstruction(fa("nfa"));
  assert.equal(dfa.states.length, 8);
});

test("minimisation merges equivalent states and explains each split", () => {
  const r = minimize(fa("redundant"));
  assert.equal(r.min.states.length, 4); // A and C are equivalent
  assert.ok(r.min.states.includes("{A,C}"));
  assert.match(r.rounds[1].note, /splits/);
});

test("regex operators: +, ?, ε and precedence", () => {
  const m = (re, s) => accepts(regexToNfa(re).nfa, s);
  assert.ok(m("a+b?", "aaa") && m("a+b?", "ab") && !m("a+b?", "b"));
  assert.ok(m("ab|c", "ab") && m("ab|c", "c") && !m("ab|c", "ac"));
  assert.ok(m("(ab)*", "") && m("(ab)*", "abab") && !m("(ab)*", "aba"));
  assert.ok(m("a(ε|b)", "a"));
  assert.throws(() => regexToNfa("(ab"), /never closed/);
  assert.throws(() => regexToNfa("a|"), /ends with an operator/);
  assert.throws(() => regexToNfa("*a"), /needs something before/);
});

test("parsing errors", () => {
  assert.throws(() => parseAutomaton("q0 a q1"), /start/);
  assert.throws(() => parseAutomaton("start: q0\nq0 ab q1"), /single characters/);
});
