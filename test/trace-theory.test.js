// Every step of the theory and compiler engines names a pseudocode line that
// exists, carries a vars object and a full-sentence note, so the code and
// variables panels never go blank or point past the end of the listing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE as FA, EXAMPLES as FAX, minimize, parseAutomaton, regexToNfa, run, subsetConstruction } from "../public/js/engines/automata.js";
import { CODE as G, cyk, EXAMPLES, firstFollow, leftFactor, ll1, ll1Parse, lrAutomaton, lrParse, lrTable, parseGrammar, removeLeftRecursion, tokenize } from "../public/js/engines/grammar.js";
import { CODE as TM, MACHINES, parseTM, runTM } from "../public/js/engines/turing.js";
import { CODE as TAC, dag, generate, parseBlock } from "../public/js/engines/tac.js";

function check(steps, code, what) {
  assert.ok(steps.length, `${what}: no steps`);
  for (const [k, s] of steps.entries()) {
    const lines = [s.line].flat();
    assert.ok(lines.length && lines.every((l) => Number.isInteger(l) && l >= 1 && l <= code.length), `${what} step ${k}: line ${s.line}`);
    assert.equal(typeof s.vars, "object", `${what} step ${k}: vars`);
    assert.ok(s.vars && Object.keys(s.vars).length, `${what} step ${k}: empty vars`);
    const note = typeof s.note === "string" ? s.note : s.action;
    assert.match(note, /[.!:)]\s*$|ACCEPT|REJECT/, `${what} step ${k}: note "${note}"`);
  }
}

test("automata: runs, subset construction, minimisation and Thompson steps are traced", () => {
  for (const [k, ex] of Object.entries(FAX)) {
    const fa = parseAutomaton(ex.text);
    for (const w of ["", "ab", "abba", "0110", "babb"]) check(run(fa, w).steps, fa.kind === "DFA" ? FA.dfa : FA.nfa, `run ${k} ${w}`);
    check(subsetConstruction(fa).steps, FA.subset, `subset ${k}`);
    const dfa = fa.kind === "DFA" ? fa : subsetConstruction(fa).dfa;
    check(minimize(dfa).rounds, FA.minimize, `minimise ${k}`);
  }
  for (const re of ["(a|b)*abb", "a+b?", "(ab|c)*d", "ε|a"]) check(regexToNfa(re).steps, FA.thompson, `thompson ${re}`);
  // The subset construction's worklist shrinks to nothing at the end.
  assert.deepEqual(subsetConstruction(parseAutomaton(FAX.nfa.text)).steps.at(-1).vars.unmarked, []);
});

test("grammar: transforms, FIRST/FOLLOW, LL(1), LR and CYK steps are traced", () => {
  for (const [k, ex] of Object.entries(EXAMPLES)) {
    const g = parseGrammar(ex.text);
    const lr = removeLeftRecursion(g);
    if (lr.steps.length) check(lr.steps, G.leftRecursion, `left recursion ${k}`);
    const lf = leftFactor(lr.grammar);
    if (lf.steps.length) check(lf.steps, G.leftFactor, `left factor ${k}`);
    check(firstFollow(g).steps, G.firstFollow, `first/follow ${k}`);
    const t = ll1(g);
    check(ll1Parse(g, t, tokenize(ex.input, g)).steps, G.ll1Parse, `LL(1) ${k}`);
    for (const kind of ["lr0", "slr", "clr"]) {
      const a = lrAutomaton(g, kind);
      check(a.build, G.lrBuild, `LR build ${kind} ${k}`);
      check(lrParse(a, lrTable(a), tokenize(ex.input, g)).steps, G.lrParse, `LR parse ${kind} ${k}`);
    }
  }
  const r = cyk(parseGrammar(EXAMPLES.cnf.text), [..."baaba"]);
  check(r.steps, G.cyk, "CYK");
  // n cells of length 1, then one step per split: Σ (len − 1)(n − len + 1) = (n³ − n) / 6.
  assert.equal(r.steps.length, 5 + (125 - 5) / 6);
  assert.deepEqual(r.steps.filter((s) => s.len === 5).map((s) => s.vars.k), [1, 2, 3, 4]);
});

test("Turing machines and three-address code steps are traced", () => {
  for (const [k, m] of Object.entries(MACHINES)) check(runTM(parseTM(m.text), m.input).steps, TM, `TM ${k}`);
  const bb = runTM(parseTM(MACHINES.busy.text), "");
  assert.equal(bb.steps.at(-1).vars.moves, 14);
  const stmts = parseBlock("a = b * -c + b * -c\nd = a - b");
  check(generate(stmts).steps, TAC.gen, "TAC");
  check(dag(stmts).steps, TAC.dag, "DAG");
});
