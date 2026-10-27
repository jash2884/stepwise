import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE, EXAMPLES, GNF_CODE, isCNF, isGNF, languageUpTo, toCNF, toGNF, withoutEmpty } from "../public/js/engines/cnf.js";
import { cnfProblems, cyk, parseGrammar, toText } from "../public/js/engines/grammar.js";

const G = (k) => parseGrammar(EXAMPLES[k].text);

// Sipser, Introduction to the Theory of Computation, Example 2.10. Sipser's
// result (with U for our Ta and A1 for our X1):
//   S0 → AA1 | UB | a | SA | AS, S → AA1 | UB | a | SA | AS,
//   A → b | AA1 | UB | a | SA | AS, A1 → SA, U → a, B → b.
test("Sipser Example 2.10 gives the textbook's CNF grammar", () => {
  const r = toCNF(G("sipser"));
  assert.deepEqual(r.nullable, ["B", "A"]);
  assert.deepEqual(r.pairs.map((p) => p.join("")), ["S0S", "AB", "AS"]);
  const sorted = (A) => r.grammar.prods.filter((p) => p.lhs === A).map((p) => p.rhs.join(" ")).sort();
  const body = ["A S", "A X1", "S A", "Ta B", "a"];
  assert.deepEqual(sorted("S0"), body);
  assert.deepEqual(sorted("S"), body);
  assert.deepEqual(sorted("A"), [...body, "b"].sort());
  assert.deepEqual(sorted("X1"), ["S A"]);
  assert.deepEqual(sorted("Ta"), ["a"]);
  assert.deepEqual(sorted("B"), ["b"]);
  assert.ok(isCNF(r.grammar));
});

// Hopcroft, Motwani & Ullman, Example 7.1: B never finishes, so S → AB goes,
// and then A is unreachable.
test("HMU Example 7.1: useless symbols are removed, non-generating first", () => {
  const r = toCNF(G("useless"));
  assert.equal(toText(r.grammar), "S0 -> a");
  assert.ok(!r.generating.includes("B"));
  assert.ok(!r.reachable.includes("A"));
});

test("ε in the language: S0 → ε is kept and CYK runs on the rest", () => {
  const r = toCNF(G("anbn"));
  assert.ok(r.grammar.prods.some((p) => p.lhs === "S0" && !p.rhs.length));
  assert.ok(isCNF(r.grammar));
  const g = withoutEmpty(r.grammar);
  assert.equal(cnfProblems(g).length, 0);
  assert.ok(cyk(g, [..."aabb"]).accepted);
  assert.ok(!cyk(g, [..."aab"]).accepted);
});

test("expression grammar (HMU §7.1.5): long bodies share tail variables; same language", () => {
  const g = G("hmu"), r = toCNF(g);
  assert.ok(isCNF(r.grammar));
  // E → E + T and E0 → E + T both become … → E X1 with one X1 → T+ T.
  assert.equal(r.grammar.prods.filter((p) => p.lhs === "X1").length, 1);
  const a = languageUpTo(g, 4), b = languageUpTo(r.grammar, 4);
  assert.deepEqual([...b].sort(), [...a].sort());
  assert.ok(cyk(withoutEmpty(r.grammar), "a + b * ( a )".split(" ")).accepted);
});

test("every step is well formed and names a pseudocode line", () => {
  for (const k of Object.keys(EXAMPLES)) {
    const r = toCNF(G(k));
    for (const s of r.steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE.length, `${k} line ${l}`);
      assert.ok(s.note.length > 20 && s.vars.phase);
    }
    assert.deepEqual(r.steps.map((s) => s.phase).filter((p, i, a) => a.indexOf(p) === i), ["given", "START", "DEL", "UNIT", "USELESS", "TERM", "BIN", "done"]);
  }
});

let seed = 2024;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function randomGrammar() {
  const nts = ["S", "A", "B", "C"], syms = ["a", "b", "S", "A", "B", "C"];
  return parseGrammar(nts.map((A) => {
    const alts = [];
    if (rand() < 0.7) alts.push(pick(["a", "b"]));
    for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) alts.push(Array.from({ length: 1 + Math.floor(rand() * 4) }, () => pick(syms)).join(" "));
    if (rand() < 0.3) alts.push("ε");
    return `${A} -> ${alts.join(" | ")}`;
  }).join("\n"));
}

test("fuzz: the CNF grammar generates exactly the same strings up to length 5, and CYK agrees", () => {
  for (let k = 0; k < 250; k++) {
    const g = randomGrammar(), r = toCNF(g);
    assert.ok(isCNF(r.grammar), toText(r.grammar));
    const a = languageUpTo(g, 5), b = languageUpTo(r.grammar, 5);
    assert.deepEqual([...b].sort(), [...a].sort(), toText(g));
    const c = withoutEmpty(r.grammar);
    if (!c.prods.length) continue;
    for (const w of [...a].slice(0, 6)) if (w) assert.ok(cyk(c, w.split(" ")).accepted, `${w} via CYK`);
    for (const w of ["a b a b a", "b b", "a a a"]) assert.equal(cyk(c, w.split(" ")).accepted, a.has(w), `${w} via CYK`);
  }
});

// --- Greibach normal form ---------------------------------------------------------

// Every rule is A → a α with α only variables (or start → ε, start never on a right side).
function assertGNF(g) {
  const onRight = g.prods.some((p) => p.rhs.includes(g.start));
  for (const p of g.prods) {
    if (!p.rhs.length) { assert.equal(p.lhs, g.start); assert.ok(!onRight); continue; }
    assert.ok(!g.isNT(p.rhs[0]), `${p.lhs} → ${p.rhs.join(" ")} must start with a terminal`);
    assert.ok(p.rhs.slice(1).every((s) => g.isNT(s)), `${p.lhs} → ${p.rhs.join(" ")}: only variables after the terminal`);
  }
  assert.ok(isGNF(g));
}
const bodies = (g, A) => g.prods.filter((p) => p.lhs === A).map((p) => p.rhs.join(" ")).sort();

// Hopcroft & Ullman (1979), Example 4.10: A1 → A2A3, A2 → A3A1 | b, A3 → A1A2 | a.
// Their result has 24 rules: A3 → bA3A2B3 | aB3 | bA3A2 | a, A2 → … (5), A1 → … (5)
// and B3 → A1A3A2 | A1A3A2B3 with A1 substituted (10).
test("GNF: Hopcroft & Ullman Example 4.10 gives the textbook's 24 rules", () => {
  const g = G("hu"), r = toGNF(g);
  assert.ok(r.ready, "already in CNF, used as it is");
  assert.deepEqual(r.bs, ["B3"]);
  assert.deepEqual(bodies(r.grammar, "A3"), ["a", "a B3", "b A3 A2", "b A3 A2 B3"]);
  assert.deepEqual(bodies(r.grammar, "A2"), ["a A1", "a B3 A1", "b", "b A3 A2 A1", "b A3 A2 B3 A1"]);
  assert.deepEqual(bodies(r.grammar, "A1"), ["a A1 A3", "a B3 A1 A3", "b A3", "b A3 A2 A1 A3", "b A3 A2 B3 A1 A3"]);
  const a1 = bodies(r.grammar, "A1");
  assert.deepEqual(bodies(r.grammar, "B3"), a1.flatMap((x) => [`${x} A3 A2`, `${x} A3 A2 B3`]).sort());
  assert.equal(r.grammar.prods.length, 24);
  assertGNF(r.grammar);
  // The intermediate grammar after ORDER: A3 → A3A1A3A2 | bA3A2 | a, as in the book.
  const lr = r.steps.find((s) => s.phase === "LEFTREC");
  assert.deepEqual(lr.removed.map((p) => p.rhs.join(" ")), ["A3 A1 A3 A2"]);
  assert.deepEqual(languageUpTo(g, 5), languageUpTo(r.grammar, 5));
});

test("GNF: every example is in GNF and generates the same strings (where it fits)", () => {
  for (const k of Object.keys(EXAMPLES)) {
    const g = G(k);
    let r;
    try { r = toGNF(g); } catch (e) { assert.match(e.message, /more than 300 rules/); continue; }
    assertGNF(r.grammar);
    assert.deepEqual([...languageUpTo(r.grammar, 5)].sort(), [...languageUpTo(g, 5)].sort(), k);
    for (const s of r.steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= GNF_CODE.length, `${k} line ${l}`);
      assert.ok(s.note.length > 20 && s.vars.phase);
    }
    assert.equal(r.steps.at(-1).phase, "done");
  }
});

test("GNF: ε in the language is kept as start → ε only", () => {
  const r = toGNF(G("anbn"));
  assertGNF(r.grammar);
  assert.ok(r.grammar.prods.some((p) => p.lhs === r.grammar.start && !p.rhs.length));
  assert.deepEqual([...languageUpTo(r.grammar, 6)].sort(), ["", "a a a b b b", "a a b b", "a b"].sort());
});

test("fuzz: GNF rules are all A → a α and the language is unchanged up to length 5", () => {
  seed = 99;
  let done = 0;
  for (let k = 0; k < 200; k++) {
    const g = randomGrammar();
    let r;
    try { r = toGNF(g); } catch (e) { assert.match(e.message, /more than 300 rules/); continue; }
    done++;
    assertGNF(r.grammar);
    assert.deepEqual([...languageUpTo(r.grammar, 5)].sort(), [...languageUpTo(g, 5)].sort(), toText(g));
  }
  assert.ok(done >= 60, `only ${done} grammars converted`);
});
