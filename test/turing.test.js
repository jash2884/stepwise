import assert from "node:assert/strict";
import { test } from "node:test";
import { MACHINES, parseTM, runTM } from "../public/js/engines/turing.js";
import { dag, generate, parseBlock, quadruples, show, triples } from "../public/js/engines/tac.js";

const tm = (k) => parseTM(MACHINES[k].text);

test("Turing machines decide aⁿbⁿ, aⁿbⁿcⁿ and palindromes", () => {
  for (const [k, yes, no] of [["anbn", ["ab", "aaabbb"], ["", "aab", "abab", "ba"]], ["anbncn", ["abc", "aabbcc"], ["aabbc", "abcabc"]], ["palindrome", ["", "a", "abba", "aba"], ["ab", "abb"]]]) {
    for (const s of yes) assert.equal(runTM(tm(k), s).result, "accept", `${k} ${s}`);
    for (const s of no) assert.equal(runTM(tm(k), s).result, "reject", `${k} ${s}`);
  }
});

test("Turing machines compute: increment, unary addition, busy beaver", () => {
  assert.equal(runTM(tm("increment"), "1011").output, "1100");
  assert.equal(runTM(tm("increment"), "111").output, "1000");
  assert.equal(runTM(tm("add"), "111+11").output, "11111");
  const bb = runTM(tm("busy"), "");
  assert.equal(bb.output, "111111");
  assert.equal(bb.moves, 14);
});

test("a looping machine stops at the limit", () => {
  const loop = parseTM("start: q\nq _ -> q _ R");
  assert.equal(runTM(loop, "", { limit: 50 }).result, "limit");
  assert.throws(() => parseTM("start: q\nq a -> q b R\nq a -> q c L"), /deterministic/);
});

// Dragon Book §6.1–6.2: a = b * -c + b * -c.
test("three-address code and the DAG for a = b * -c + b * -c", () => {
  const stmts = parseBlock("a = b * -c + b * -c");
  assert.deepEqual(generate(stmts).code.map(show), ["t1 = minus c", "t2 = b * t1", "t3 = minus c", "t4 = b * t3", "t5 = t2 + t4", "a = t5"]);
  const d = dag(stmts);
  assert.deepEqual(d.code.map(show), ["t1 = minus c", "t2 = b * t1", "t3 = t2 + t2", "a = t3"]);
  assert.ok(d.steps.some((s) => s.reused));
  assert.deepEqual(triples(generate(stmts).code).at(-1), { op: "=", arg1: "a", arg2: "(4)" });
  assert.equal(quadruples(generate(stmts).code)[0].op, "minus");
});

test("DAG for a basic block reassigns labels", () => {
  const d = dag(parseBlock("a = b + c\nb = a - d\nc = b + c\nd = a - d"));
  // b and d end up on the same node (a - d is computed once).
  const bd = d.nodes.find((n) => n.labels.includes("b"));
  assert.ok(bd.labels.includes("d"));
  assert.equal(d.nodes.filter((n) => !n.leaf).length, 3);
});

test("precedence and errors", () => {
  assert.deepEqual(generate(parseBlock("x = a - b - c")).code.map(show), ["t1 = a - b", "t2 = t1 - c", "x = t2"]);
  assert.deepEqual(generate(parseBlock("x = a ^ b ^ c")).code.map(show), ["t1 = b ^ c", "t2 = a ^ t1", "x = t2"]);
  assert.throws(() => parseBlock("x = (a + b"), /never closed/);
  assert.throws(() => parseBlock("x = a $ b"), /Unexpected/);
});
