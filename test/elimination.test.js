import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAutomaton, regexToNfa, run } from "../public/js/engines/automata.js";
import { agree, allStrings, alt, cat, EPSILON, eliminate, ELIMINATION_CODE, EMPTY, EXAMPLES, product, PRODUCT_CODE, PRODUCT_OPS, star, str, sym } from "../public/js/engines/elimination.js";

const fa = (k) => parseAutomaton(EXAMPLES[k].text);
const same = (m, re, n = 7) => agree(m, regexToNfa(re).nfa, n).ok;

test("regex simplification keeps labels readable", () => {
  const a = sym("a"), b = sym("b");
  assert.equal(str(alt(EMPTY, a)), "a");
  assert.equal(str(cat(EPSILON, a, EPSILON)), "a");
  assert.equal(str(cat(a, EMPTY, b)), "∅");
  assert.equal(str(star(EMPTY)), "ε");
  assert.equal(str(cat(a, star(a))), "a+");
  assert.equal(str(alt(EPSILON, a)), "a?");
  assert.equal(str(alt(EPSILON, star(a))), "a*");
  assert.equal(str(star(alt(EPSILON, a, b))), "(a|b)*");
  assert.equal(str(cat(alt(a, b), star(alt(a, b)))), "(a|b)+");
  assert.equal(str(cat(a, b, star(cat(a, b)))), "(ab)+");
  assert.equal(str(alt(a, a, b)), "a|b");
});

// Sipser, Introduction to the Theory of Computation, Example 1.68:
// the two-state DFA gives a*b(a ∪ b)*.
test("Sipser Example 1.68: a*b(a|b)*", () => {
  const r = eliminate(fa("sipser68"));
  assert.equal(r.regex, "a*b(a|b)*");
  assert.deepEqual(r.order, ["1", "2"]);
  assert.equal(r.steps[0].states.length, 4); // s, 1, 2, f
});

// Hopcroft, Motwani & Ullman, Example 3.6: eliminating B, then C or D, gives
// (0+1)*1(0+1) + (0+1)*1(0+1)(0+1).
test("HMU Example 3.6: 1 in the second or third position from the end", () => {
  const m = fa("hmu36");
  const listed = eliminate(m, { order: ["A", "B", "C", "D"] });
  assert.equal(listed.regex, "(0|1)*1(0|1)|(0|1)*1(0|1)(0|1)");
  assert.ok(same(m, listed.regex));
  assert.ok(same(m, eliminate(m, { order: "greedy" }).regex));
});

// Sipser Example 1.74: a three-state DFA. Different orders give different
// expressions for the same language.
test("Sipser Example 1.74: every elimination order gives an equivalent expression", () => {
  const m = fa("sipser74");
  const orders = [["1", "2", "3"], ["3", "2", "1"], ["2", "1", "3"], "greedy"];
  const res = orders.map((order) => eliminate(m, { order }));
  for (const r of res) assert.ok(same(m, r.regex), r.regex);
  assert.ok(new Set(res.map((r) => r.regex)).size > 1);
});

test("steps carry pseudocode lines, variables and notes; the last state left is s → f", () => {
  for (const k of Object.keys(EXAMPLES)) {
    const r = eliminate(fa(k));
    for (const s of r.steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= ELIMINATION_CODE.length);
      assert.ok(s.vars && typeof s.note === "string" && s.note.length > 20);
    }
    const last = r.steps.at(-1);
    assert.deepEqual(last.states, [r.start, r.final]);
    assert.ok(r.steps.filter((s) => s.line === 8).length === fa(k).states.length);
  }
  assert.throws(() => eliminate(fa("sipser68"), { order: ["9"] }), /isn't a state/);
});

test("an automaton with no accepting path gives ∅", () => {
  const r = eliminate(parseAutomaton("start: p\naccept: q\np a p"));
  assert.ok(r.empty);
  assert.equal(r.regex, "∅");
});

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function randomDfa(n, partial = false) {
  const names = Array.from({ length: n }, (_, i) => `q${i}`), lines = ["start: q0"];
  const acc = names.filter(() => rand() < 0.4);
  lines.push(`accept: ${(acc.length ? acc : [names[n - 1]]).join(" ")}`);
  for (const q of names) for (const a of ["a", "b"]) if (!partial || rand() < 0.8) lines.push(`${q} ${a} ${names[Math.floor(rand() * n)]}`);
  return parseAutomaton(lines.join("\n"));
}

test("fuzz: random DFAs → regex → Thompson NFA accept exactly the same strings (length ≤ 7)", () => {
  // regexToNfa caps expressions at about 60 symbols, so a few very long
  // results (mostly from the as-listed order) are skipped; most must be checked.
  let checked = 0, skipped = 0;
  for (let k = 0; k < 150; k++) {
    const m = randomDfa(2 + Math.floor(rand() * 3), rand() < 0.4);
    for (const order of [null, "greedy"]) {
      const r = eliminate(m, { order });
      if (r.empty) { assert.ok(allStrings(m.alphabet, 7).every((w) => !run(m, w).accepted)); continue; }
      let nfa;
      try { nfa = regexToNfa(r.regex).nfa; } catch (e) { assert.match(e.message, /too long/); skipped++; continue; }
      for (const w of allStrings(["a", "b"], 7)) assert.equal(run(nfa, w).accepted, run(m, w).accepted, `${r.regex} on "${w}"`);
      checked++;
    }
  }
  assert.ok(checked > 200 && skipped < checked / 8, `${checked} checked, ${skipped} skipped`);
});

test("fuzz: the product DFA agrees with running both DFAs", () => {
  for (let k = 0; k < 120; k++) {
    const A = randomDfa(2 + Math.floor(rand() * 3), rand() < 0.5), B = randomDfa(2 + Math.floor(rand() * 3), rand() < 0.5);
    for (const op of Object.keys(PRODUCT_OPS)) {
      const { dfa, steps } = product(A, B, op);
      assert.equal(dfa.kind, "DFA");
      assert.ok(dfa.states.length <= (A.states.length + 1) * (B.states.length + 1));
      for (const s of steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= PRODUCT_CODE.length);
      for (const w of allStrings(["a", "b"], 6)) assert.equal(run(dfa, w).accepted, PRODUCT_OPS[op].test(run(A, w).accepted, run(B, w).accepted), `${op} "${w}"`);
    }
  }
  assert.throws(() => product(fa("hmu36"), fa("sipser68")), /two DFAs/);
});
