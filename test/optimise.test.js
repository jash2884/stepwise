import assert from "node:assert/strict";
import { test } from "node:test";
import { basicBlocks, blockLine, EXAMPLES, execute, linearise, optimise, parseTac, PASSES, randomTac } from "../public/js/engines/optimise.js";

const bb = (k) => basicBlocks(parseTac(EXAMPLES[k].text));

// Aho, Lam, Sethi & Ullman, Example 8.6 / Fig. 8.9: leaders 1, 2, 3, 10, 12 and 13.
test("leaders and blocks of the identity-matrix code (Dragon Book §8.4, Fig. 8.9)", () => {
  const r = bb("identity");
  assert.deepEqual(r.leaders.map((i) => i + 1), [1, 2, 3, 10, 12, 13]);
  assert.equal(r.blocks.length, 6);
  assert.match(r.reasons[2], /rule 2/);
  assert.match(r.reasons[9], /rule 3/);
  const edges = r.edges.map((e) => `${e.from}>${e.to}`);
  for (const e of ["ENTRY>B1", "B3>B3", "B3>B4", "B4>B2", "B6>B6", "B6>EXIT"]) assert.ok(edges.includes(e), e);
  for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= 11);
});

// Aho, Lam, Sethi & Ullman, Fig. 9.2–9.4: the quicksort fragment and its block B5 after local CSE.
test("quicksort fragment: 6 blocks, and B5 becomes Fig. 9.4 after CSE, copy propagation and dead code", () => {
  const r = bb("quicksort");
  assert.deepEqual(r.leaders.map((i) => i + 1), [1, 5, 9, 13, 14, 23]);
  const o = optimise(r.cfg, ["constprop", "copyprop", "cse", "fold", "dce"]);
  assert.deepEqual(o.cfg.blocks[4].code.map(blockLine), ["t6 = 4 * i", "x = a[t6]", "t8 = 4 * j", "t9 = a[t8]", "a[t6] = t9", "a[t8] = x", "goto B2"]);
  assert.ok(o.steps.some((s) => s.pass === "cse" && s.old === "t7 = 4 * i" && s.now === "t7 = t6"));
});

// Dragon Book §8.5.1: in a = b + c; b = a − d; c = b + c; d = a − d only the last is a common subexpression.
test("local CSE keeps b + c (b changed) and turns d = a − d into d = b", () => {
  const o = optimise(bb("cse").cfg);
  assert.deepEqual(o.cfg.blocks[0].code.map(blockLine), ["a = b + c", "b = a - d", "c = b + c", "d = b"]);
});

test("folding, propagation and strength reduction", () => {
  const o = optimise(bb("folding").cfg);
  assert.deepEqual(o.cfg.blocks[0].code.map(blockLine), ["d = 8 + x", "t2 = d << 3", "e = t2", "f = x * x"]);
  assert.ok(o.counts.fold && o.counts.constprop && o.counts.algebra && o.counts.dce);
  assert.equal(optimise(bb("folding").cfg, []).steps.length, 1);
});

test("parser: numbering, labels, ifFalse, negative literals and errors", () => {
  const p = parseTac("L1: x = -3\nifFalse x goto L1\ny = a[x]\na[y] = x");
  assert.equal(p.prog[0].a, "-3");
  assert.equal(p.prog[1].neg, true);
  assert.equal(p.prog[1].to, 0);
  assert.equal(p.prog[3].kind, "store");
  assert.throws(() => parseTac("goto L9"), /no instruction/);
  assert.throws(() => parseTac("x = = y"), /Can't read/);
  assert.throws(() => parseTac(""), /Enter/);
});

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("fuzz: optimised code computes the same live-out values (straight-line and forward jumps)", () => {
  let rewrites = 0;
  for (let k = 0; k < 400; k++) {
    const src = randomTac(rand, { n: 5 + Math.floor(rand() * 8), jumps: k % 2 === 1 });
    const p = parseTac(src), r = basicBlocks(p);
    const enabled = Object.keys(PASSES).filter(() => rand() < 0.8);
    const o = optimise(r.cfg, enabled);
    rewrites += o.steps.length - 1;
    for (let t = 0; t < 3; t++) {
      const env = { a: Math.floor(rand() * 9) - 4, b: Math.floor(rand() * 9) - 4, c: Math.floor(rand() * 9) - 4 };
      const before = execute(p.prog, env).vars, after = execute(linearise(o.cfg), env).vars;
      for (const v of r.cfg.liveExit) assert.equal((after[v] ?? 0) + 0, (before[v] ?? 0) + 0, `${src}\n${enabled}\n${v}`);
    }
    // Running the passes again on the result finds nothing more to do.
    assert.equal(optimise(o.cfg, enabled).steps.length, 1, src);
    for (const s of o.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= 16);
  }
  assert.ok(rewrites > 300, `only ${rewrites} rewrites`);
});

test("the identity-matrix program fills the same array before and after optimisation", () => {
  const p = parseTac(EXAMPLES.identity.text), o = optimise(basicBlocks(p).cfg);
  assert.deepEqual(execute(linearise(o.cfg)).mem, execute(p.prog).mem);
  assert.equal(Object.keys(execute(p.prog).mem.a).length, 100);
});
