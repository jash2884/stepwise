import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateKeys, closure, decomposeBCNF, minimalCover, normalForm, parseAttrs, parseFds, synthesize3NF } from "../public/js/engines/fd.js";

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
