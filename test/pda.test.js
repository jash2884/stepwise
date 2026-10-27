import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE, EXAMPLES, GRAMMARS, grammarToPda, parsePDA, simulate, tokenizeInput, toText } from "../public/js/engines/pda.js";
import { languageUpTo } from "../public/js/engines/cnf.js";
import { parseGrammar } from "../public/js/engines/grammar.js";

const pda = (k) => parsePDA(EXAMPLES[k].text);
const verdict = (m, w, opts) => simulate(m, tokenizeInput(m, w), opts).verdict;

test("example PDAs accept and reject the right strings", () => {
  const cases = {
    anbn: [["ab", "aaabbb"], ["", "a", "aab", "abb", "abab", "ba"]],
    wcwr: [["c", "abcba", "bacab"], ["", "ab", "abcab", "acaa"]],
    parens: [["", "()", "(()())", "()()"], ["(", ")(", "(()"]],
  };
  for (const [k, [yes, no]] of Object.entries(cases)) {
    for (const w of yes) assert.equal(verdict(pda(k), w), "accept", `${k} "${w}"`);
    for (const w of no) assert.equal(verdict(pda(k), w), "reject", `${k} "${w}"`);
  }
});

// Hopcroft, Motwani & Ullman, Example 6.2: the PDA for L_wwr guesses the middle
// with an ε-move. It is nondeterministic, and no DPDA accepts this language.
test("HMU Example 6.2: wwᴿ by guessing the middle", () => {
  const m = pda("wwr");
  assert.equal(m.deterministic, false);
  assert.equal(pda("wcwr").deterministic, true);
  for (const w of ["", "aa", "abba", "baab", "abbbba"]) assert.equal(verdict(m, w), "accept", w);
  for (const w of ["a", "ab", "aba", "abab"]) assert.equal(verdict(m, w), "reject", w);
  // On abba the BFS explores the wrong guesses too, so it sees more configurations than the path.
  const r = simulate(m, [..."abba"]);
  assert.ok(r.configs.length > r.path.length);
  assert.equal(r.path.length, 7); // 4 reads, the guess, and the move to q2, plus the start
});

test("steps are well formed and the accepting path is a chain of legal moves", () => {
  for (const [k, ex] of Object.entries(EXAMPLES)) {
    const m = parsePDA(ex.text), r = simulate(m, tokenizeInput(m, ex.input));
    assert.ok(r.accepted, k);
    for (const s of r.steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE.length, `${k} line ${l}`);
      assert.ok(s.note.length > 20 && s.vars);
    }
    for (let i = 1; i < r.path.length; i++) {
      const a = r.configs[r.path[i - 1]], b = r.configs[r.path[i]], t = b.via;
      assert.equal(b.parent, a.id);
      assert.equal(t.from, a.state); assert.equal(t.to, b.state);
      const base = t.pop === "ε" ? a.stack : a.stack.slice(1);
      assert.deepEqual(b.stack.map((x) => x.s), [...t.push, ...base.map((x) => x.s)]);
      assert.deepEqual(b.stack.slice(t.push.length).map((x) => x.u), base.map((x) => x.u), "kept stack items keep their ids");
    }
  }
});

test("parsing: pushes, ε, modes and errors", () => {
  const m = parsePDA("start: p\nstack: Z\nmode: empty\np a Z -> p A B Z\np b A -> p eps\np ε Z -> p ε");
  assert.deepEqual(m.moves[0].push, ["A", "B", "Z"]);
  assert.deepEqual(m.moves[1].push, []);
  assert.equal(m.mode, "empty");
  assert.deepEqual(parsePDA(EXAMPLES.anbn.text).moves[0].push, ["A", "Z"]);
  assert.equal(parsePDA(toText(pda("wwr"))).moves.length, pda("wwr").moves.length);
  assert.throws(() => parsePDA("q a Z -> q"), /start/);
  assert.throws(() => parsePDA("start: q\nq a -> q Z"), /Can't read/);
  // A machine that pushes forever on ε is stopped by the stack limit.
  const loop = parsePDA("start: q\nstack: Z\naccept: f\nq ε ε -> q A");
  assert.equal(verdict(loop, "a", { maxStack: 10 }), "reject");
});

// HMU §6.3.1: the single-state PDA built from a grammar has one expand move per
// rule and one match move per terminal, and accepts by empty stack.
test("CFG → PDA: the construction and a run that mirrors a leftmost derivation", () => {
  const g = parseGrammar(GRAMMARS.anbn.text), { pda: m, prune } = grammarToPda(g);
  assert.equal(m.moves.length, g.prods.length + g.terminals.length);
  assert.equal(m.mode, "empty");
  assert.equal(m.bottom, "S");
  const r = simulate(m, [..."aabb"], { prune });
  assert.ok(r.accepted);
  assert.equal(r.path.length, 1 + 3 + 4); // three expansions (S → aSb, S → aSb, S → ε) and four matches
  assert.equal(simulate(m, [..."aab"], { prune }).verdict, "reject");
  const e = grammarToPda(parseGrammar(GRAMMARS.expr.text));
  assert.deepEqual(tokenizeInput(e.pda, "id+id*id"), ["id", "+", "id", "*", "id"]);
  assert.ok(simulate(e.pda, tokenizeInput(e.pda, "id+id*id"), { prune: e.prune }).accepted);
  assert.equal(simulate(e.pda, tokenizeInput(e.pda, "id+*id"), { prune: e.prune }).verdict, "reject");
});

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function randomGrammar() {
  const nts = ["S", "A", "B"], syms = ["a", "b", "S", "A", "B"];
  return parseGrammar(nts.map((A) => {
    const alts = [pick(["a", "b"])];
    for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) alts.push(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(syms)).join(" "));
    if (rand() < 0.3) alts.push("ε");
    return `${A} -> ${alts.join(" | ")}`;
  }).join("\n"));
}
const all = (n) => { const out = [[]]; for (let k = 0; k < out.length; k++) if (out[k].length < n) for (const c of ["a", "b"]) out.push([...out[k], c]); return out; };

test("fuzz: the PDA built from a random grammar accepts exactly the grammar's strings (length ≤ 4)", () => {
  const words = all(4);
  for (let k = 0; k < 60; k++) {
    const g = randomGrammar(), lang = languageUpTo(g, 4), { pda: m, prune } = grammarToPda(g);
    for (const w of words) {
      const v = simulate(m, w, { prune, maxSteps: 4000 }).verdict;
      if (lang.has(w.join(" "))) assert.equal(v, "accept", `${w.join("")} in\n${g.prods.map((p) => `${p.lhs}->${p.rhs.join(" ")}`).join("\n")}`);
      else assert.notEqual(v, "accept", `${w.join("")} not in the language`);
    }
  }
});
