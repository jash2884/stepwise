import assert from "node:assert/strict";
import { test } from "node:test";
import { ALGOS, candidateKeys, closure, CODE, decomposeBCNF, minimalCover, normalForm, parseAttrs, parseFds, randomSchema, synthesize3NF, trace } from "../public/js/engines/fd.js";

const schema = (attrs, fds) => { const a = parseAttrs(attrs); return [a, parseFds(fds, a)]; };

test("attribute closure with the steps that fired", () => {
  const [, f] = schema("ABCDEF", "A -> BC; E -> CF; B -> E; CD -> EF");
  const r = closure("AB", f);
  assert.equal(r.closure, "ABCEF");
  assert.equal(r.steps.length, 4); // start + A→BC, B→E, E→CF
  assert.match(r.steps[1].note, /A → BC applies/);
  assert.equal(closure("D", f).closure, "D");
});

test("candidate keys: single and multiple", () => {
  const [a1, f1] = schema("ABCD", "A -> B; B -> C; C -> D");
  assert.deepEqual(candidateKeys(a1, f1).keys, ["A"]);
  const [a2, f2] = schema("ABCD", "AB -> C; C -> D; D -> A");
  assert.deepEqual(candidateKeys(a2, f2).keys, ["AB", "BC", "BD"]);
  assert.equal(candidateKeys(a2, f2).prime, "ABCD");
});

test("normal forms: 1NF (partial dep), 2NF (transitive), 3NF, BCNF", () => {
  const nf = (attrs, fds) => normalForm(...schema(attrs, fds)).form;
  assert.equal(nf("ABCD", "AB -> C; A -> D"), "1NF");      // D depends on part of key AB
  assert.equal(nf("ABC", "A -> B; B -> C"), "2NF");         // transitive A -> B -> C
  assert.equal(nf("ABC", "AB -> C; C -> B"), "3NF");        // C -> B: B is prime, C not a superkey
  assert.equal(nf("ABC", "A -> BC"), "BCNF");
  const r = normalForm(...schema("ABCD", "AB -> C; A -> D"));
  assert.match(r.violations["2NF"][0].why, /partial dependency/);
});

test("minimal cover removes extraneous attributes and redundant FDs", () => {
  const [, f] = schema("ABC", "A -> BC; B -> C; A -> B; AB -> C");
  const { cover } = minimalCover(f);
  assert.deepEqual(cover.map((x) => `${x.lhs}>${x.rhs}`), ["A>B", "B>C"]);
});

test("3NF synthesis and BCNF decomposition", () => {
  const [a, f] = schema("ABCD", "AB -> C; C -> D; D -> A");
  const three = synthesize3NF(a, f);
  assert.deepEqual(three.relations, ["ABC", "CD", "AD"]);
  const [a2, f2] = schema("ABC", "AB -> C; C -> B");
  const bcnf = decomposeBCNF(a2, f2);
  assert.deepEqual(bcnf.relations, ["BC", "AC"]);
  assert.match(bcnf.steps.at(-1).note, /does not preserve AB → C/);
});

test("parsing errors are explained", () => {
  assert.throws(() => parseAttrs("123"), /attributes/);
  assert.throws(() => parseFds("A -> Z", "ABC"), /isn't in the relation/);
  assert.throws(() => parseFds("ABC", "ABC"), /Can't read/);
});

test("traced closure: Silberschatz's R(A,B,C,G,H,I) example gives (AG)+ = ABCGHI", () => {
  // Database System Concepts, section 7.4: F = {A → B, A → C, CG → H, CG → I, B → H}.
  const [a, f] = schema("ABCGHI", "A -> B; A -> C; CG -> H; CG -> I; B -> H");
  const steps = trace("closure", a, f, "AG");
  assert.equal(steps.at(-1).vars.result, "ABCGHI");
  assert.match(steps.at(-1).note, /superkey/);
  assert.ok(trace("closure", a, f, "G").some((s) => /CG → H: C isn't in G yet/.test(s.note)), "explains why an FD can't fire yet");
  assert.ok(steps.some((s) => s.added === "BC" || s.added === "B"));
});

test("traced algorithms agree with the direct ones on random schemas, with valid lines", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 150; k++) {
    const { attrs, fds } = randomSchema(rand);
    const runs = Object.fromEntries(Object.keys(ALGOS).map((algo) => [algo, trace(algo, attrs, fds, attrs.slice(0, 2))]));
    for (const [algo, steps] of Object.entries(runs)) {
      assert.ok(steps.length >= 2 && steps.at(-1).done, algo);
      for (const s of steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE[algo].length, `${algo} line ${l}`);
    }
    assert.equal(runs.closure.at(-1).vars.result, closure(attrs.slice(0, 2), fds).closure);
    assert.deepEqual(runs.keys.at(-1).vars.keys, candidateKeys(attrs, fds).keys);
    assert.equal(runs.nf.at(-1).vars.form, normalForm(attrs, fds).form);
    assert.deepEqual(runs.cover.at(-1).vars.cover, minimalCover(fds).cover.map((x) => `${x.lhs} → ${x.rhs}`));
    assert.deepEqual(runs.three.at(-1).vars.relations, synthesize3NF(attrs, fds).relations);
    assert.deepEqual([...runs.bcnf.at(-1).vars.result].sort(), [...decomposeBCNF(attrs, fds).relations].sort());
  }
});
