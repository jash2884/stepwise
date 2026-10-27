import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGrammar } from "../public/js/engines/grammar.js";
import { checkOperatorGrammar, EQ, EXAMPLES, fromGrammar, fromRules, GT, LEADING_CODE, LT, opParse, PARSE_CODE, parseLevels, precedenceFunctions, tokenizeOp } from "../public/js/engines/opprec.js";

const exprG = () => parseGrammar(EXAMPLES.expr.text);
const sorted = (s) => [...s].sort();

// Aho, Sethi & Ullman, Compilers: Principles, Techniques and Tools (1986),
// §4.6 operator-precedence parsing, on E → E + T | T, T → T * F | F, F → ( E ) | id.
test("LEADING, TRAILING and the relations of the expression grammar", () => {
  const r = fromGrammar(exprG());
  assert.deepEqual(sorted(r.leading.get("E")), sorted(["+", "*", "(", "id"]));
  assert.deepEqual(sorted(r.leading.get("T")), sorted(["*", "(", "id"]));
  assert.deepEqual(sorted(r.leading.get("F")), sorted(["(", "id"]));
  assert.deepEqual(sorted(r.trailing.get("E")), sorted(["+", "*", ")", "id"]));
  assert.deepEqual(sorted(r.trailing.get("T")), sorted(["*", ")", "id"]));
  assert.deepEqual(sorted(r.trailing.get("F")), sorted([")", "id"]));
  const t = r.table;
  assert.equal(t.conflicts().length, 0);
  assert.equal(t.rel("+", "*"), LT);
  assert.equal(t.rel("*", "+"), GT);
  assert.equal(t.rel("+", "+"), GT);
  assert.equal(t.rel("(", ")"), EQ);
  assert.equal(t.rel("id", "id"), null);
  assert.equal(t.rel("$", "id"), LT);
  assert.equal(t.rel("id", "$"), GT);
  for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= LEADING_CODE.length);
});

test("operator-grammar check", () => {
  assert.ok(checkOperatorGrammar(parseGrammar("S -> A B\nA -> a\nB -> b")).length);
  assert.ok(checkOperatorGrammar(parseGrammar("S -> a S | ε")).length);
  assert.throws(() => fromGrammar(parseGrammar("S -> A B\nA -> a\nB -> b")), /operator grammar/);
});

test("id + id * id: * is reduced before +", () => {
  const r = fromGrammar(exprG()), g = r.g;
  const run = opParse(r, tokenizeOp("id+id*id", r.table.cols));
  assert.ok(run.accepted);
  const big = run.reductions.filter((i) => g.prods[i].rhs.length === 3).map((i) => g.prods[i].rhs[1]);
  assert.deepEqual(big, ["*", "+"]);
  for (const s of run.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= PARSE_CODE.length);
  assert.ok(!opParse(r, ["id", "id"]).accepted);
  assert.ok(!opParse(r, ["(", ")"]).accepted);
  assert.ok(!opParse(r, ["+", "id"]).accepted);
});

// Dragon Book (1986) §4.6, the precedence functions for + * id $:
// f = 2 4 4 0 and g = 1 3 5 0.
test("precedence functions by the graph method", () => {
  const r = fromRules(parseLevels("+ left\n* left"), { parens: false });
  assert.deepEqual(precedenceFunctions(r.table), { f: { "+": 2, "*": 4, id: 4, $: 0 }, g: { "+": 1, "*": 3, id: 5, $: 0 } });
});

test("rules: right-associative ^ and left-associative -", () => {
  const r = fromRules(parseLevels("+ - left\n* / left\n^ right"));
  assert.equal(r.table.rel("^", "^"), LT);
  assert.equal(r.table.rel("-", "-"), GT);
  assert.equal(r.table.conflicts().length, 0);
  assert.throws(() => parseLevels("+ left\n+ right"), /only one level/);
  assert.ok(opParse(r, tokenizeOp("id + id * id ^ id ^ id", r.table.cols)).accepted);
});

// Fuzz: random token strings over id + * ( ) are accepted exactly when they
// are well-formed expressions, and the tree computes the conventional value.
let seed = 31337;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function wellFormed(ts) {
  let i = 0;
  const E = () => T() && (ts[i] === "+" ? (i++, E()) : true);
  const T = () => F() && (ts[i] === "*" ? (i++, T()) : true);
  const F = () => (ts[i] === "id" ? (i++, true) : ts[i] === "(" ? (i++, E() && ts[i] === ")" && (i++, true)) : false);
  return E() && i === ts.length;
}
const genExpr = (d = 0) => (d > 3 || rand() < 0.35 ? ["id"] : rand() < 0.2 ? ["(", ...genExpr(d + 1), ")"] : [...genExpr(d + 1), pick(["+", "*"]), ...genExpr(d + 1)]);

test("fuzz: accepted iff well formed, and reductions respect precedence", () => {
  const variants = [fromGrammar(exprG()), fromRules(parseLevels("+ left\n* left"))];
  let accepted = 0;
  for (let k = 0; k < 600; k++) {
    let ts = genExpr();
    if (rand() < 0.4) {
      ts = [...ts];
      const j = Math.floor(rand() * (ts.length + 1));
      if (rand() < 0.5) ts.splice(j, 1); else ts.splice(j, 0, pick(["id", "+", "*", "(", ")"]));
    }
    const ok = ts.length > 0 && wellFormed(ts);
    const vals = ts.map((t, i) => (t === "id" ? (i % 5) + 2 : t));
    const want = ok ? Function(`return ${vals.join(" ")}`)() : null;
    for (const r of variants) {
      const run = opParse(r, ts);
      assert.equal(run.accepted, ok, `${ts.join(" ")} (${r.mode})`);
      if (!ok) continue;
      accepted++;
      // Leaves are visited left to right, so the k-th id leaf is the k-th id token.
      const idVals = vals.filter((v, i) => ts[i] === "id");
      let n = 0;
      const ev = (t) => {
        if (!t.kids.length) return t.label === "id" ? idVals[n++] : t.label;
        const v = t.kids.map(ev);
        return v.length === 1 ? v[0] : v[0] === "(" ? v[1] : v[1] === "+" ? v[0] + v[2] : v[0] * v[2];
      };
      assert.equal(ev(run.steps.at(-1).forest[0]), want, ts.join(" "));
    }
  }
  assert.ok(accepted > 300, `only ${accepted}`);
});

test("fuzz: precedence functions agree with every non-blank table entry", () => {
  for (let k = 0; k < 60; k++) {
    const ops = ["+", "-", "*", "/", "^"].filter(() => rand() < 0.6);
    if (!ops.length) continue;
    const levels = [];
    for (const o of ops) if (levels.length && rand() < 0.4) levels.at(-1).ops.push(o); else levels.push({ ops: [o], assoc: pick(["left", "right"]) });
    const r = fromRules(levels), fg = precedenceFunctions(r.table);
    assert.ok(fg);
    for (const a of r.table.cols) for (const b of r.table.cols) {
      const rel = r.table.rel(a, b);
      if (rel === LT) assert.ok(fg.f[a] < fg.g[b]);
      if (rel === GT) assert.ok(fg.f[a] > fg.g[b]);
      if (rel === EQ) assert.equal(fg.f[a], fg.g[b]);
    }
  }
});
