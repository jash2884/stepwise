import assert from "node:assert/strict";
import { test } from "node:test";
import { ALGORITHMS, costs, EXAMPLE, join, joinCode, JOINS, parseTable, randomTables, runAlgorithm, sortCost } from "../public/js/engines/joins.js";

const A = parseTable("A", EXAMPLE.A), B = parseTable("B", EXAMPLE.B);
const count = (type) => join(A, B, type, EXAMPLE.on).rows.length;

test("row counts for every join type, with duplicates and a NULL key", () => {
  // A.dept: 10, 20, NULL, 30   B.dept: 10, 20, 20, 40
  assert.equal(count("inner"), 3);  // 10-10, 20-20, 20-20
  assert.equal(count("left"), 5);   // + Cara (NULL) + Dev (30)
  assert.equal(count("right"), 4);  // + Legal (40)
  assert.equal(count("full"), 6);   // inner 3 + 2 left-only + 1 right-only
  assert.equal(count("cross"), 16);
  assert.equal(count("semi"), 2);   // Asha, Ben (Ben once, even with two matches)
  assert.equal(count("anti"), 2);   // Cara, Dev
});

test("NULL never matches, and outer joins pad with NULL", () => {
  const r = join(A, B, "left", EXAMPLE.on);
  const cara = r.rows.find((row) => row[1] === "Cara");
  assert.deepEqual(cara, [3, "Cara", null, null, null]);
  assert.ok(r.steps.some((s) => /UNKNOWN \(NULL never matches\)/.test(s.note)));
  const right = join(A, B, "right", EXAMPLE.on);
  assert.deepEqual(right.rows.at(-1), [null, null, null, 40, "Legal"]);
  assert.equal(right.sql, "SELECT * FROM A RIGHT JOIN B ON A.dept = B.dept");
});

test("natural join uses common column names once; semi join stops at the first match", () => {
  const r = join(A, B, "natural");
  assert.deepEqual(r.columns, ["id", "name", "dept", "title"]);
  assert.equal(r.rows.length, 3);
  const semi = join(A, B, "semi", EXAMPLE.on);
  const benSteps = semi.steps.filter((s) => s.i === 1);
  assert.equal(benSteps.at(-1).j, 1, "stops at B row 2, the first match for dept 20");
  assert.throws(() => join(A, parseTable("C", "x\n1"), "natural"), /in common/);
});

test("parsing", () => {
  assert.deepEqual(parseTable("T", "a | b\n1 | null\nx | 2.5").rows, [[1, null], ["x", 2.5]]);
  assert.throws(() => parseTable("T", "a, b\n1"), /expected 2 values/);
  assert.throws(() => parseTable("T", "a, a"), /duplicate/);
});

// --- Pseudocode lines, join algorithms and costs ------------------------------
let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sortRows = (rows) => rows.map((r) => JSON.stringify(r)).sort();

test("every logical-join step names a pseudocode line and its variables", () => {
  for (let k = 0; k < 60; k++) {
    const t = randomTables(rand);
    const TA = parseTable("A", t.A), TB = parseTable("B", t.B);
    for (const type of Object.keys(JOINS)) {
      const r = join(TA, TB, type, t.on);
      const len = joinCode(type).length;
      assert.equal(r.code.length, len);
      for (const s of r.steps) {
        for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= len, `${type} line ${l}`);
        assert.ok(s.vars && typeof s.vars.output === "number");
      }
    }
  }
  const left = join(A, B, "left", EXAMPLE.on);
  assert.deepEqual(left.steps.find((s) => s.pad).line, [6, 7]);
  assert.match(left.steps[0].note, /A\.dept = 10 and B\.dept = 10/);
});

test("fuzz: nested-loop, block nested-loop, sort-merge and hash join all return the INNER join's rows", () => {
  for (let k = 0; k < 300; k++) {
    const t = randomTables(rand);
    const TA = parseTable("A", t.A), TB = parseTable("B", t.B);
    const inner = sortRows(join(TA, TB, "inner", t.on).rows);
    const perBlock = 1 + Math.floor(rand() * 3), buckets = 2 + Math.floor(rand() * 3);
    for (const algo of Object.keys(ALGORITHMS)) {
      const r = runAlgorithm(TA, TB, algo, t.on, { perBlock, buckets });
      assert.deepEqual(sortRows(r.rows), inner, `${algo} on\n${t.A}\n${t.B}`);
      for (const s of r.steps) for (const l of [s.line].flat()) if (l != null) assert.ok(l >= 1 && l <= ALGORITHMS[algo].code.length, `${algo} line ${l}`);
      assert.ok(r.steps.every((s, i) => !i || (s.transfers >= r.steps[i - 1].transfers && s.rows >= r.steps[i - 1].rows)), "counters never go down");
      // The simulated I/O equals the textbook worst case for the nested loops.
      const { r: br, s: bs } = r.blocks, nr = TA.rows.length;
      if (algo === "nlj") assert.deepEqual([r.transfers, r.seeks], [nr * bs + br, nr + br]);
      if (algo === "bnlj") assert.deepEqual([r.transfers, r.seeks], [br * bs + br, 2 * br]);
      if (algo === "merge") assert.ok(r.transfers <= br + bs);
    }
  }
});

test("hash and merge joins explain hash values, partitions and Ss", () => {
  const r = runAlgorithm(A, B, "hash", EXAMPLE.on, { buckets: 3 });
  assert.ok(r.steps.some((s) => /h\(20\) = 20 mod 3 = 2, so s2 goes to partition Hs2/.test(s.note)));
  assert.ok(r.steps.some((s) => /NULL key/.test(s.note)));
  assert.ok(r.steps.some((s) => /finds s2, s3, so 2 rows are output/.test(s.note)));
  const m = runAlgorithm(A, B, "merge", EXAMPLE.on);
  assert.ok(m.steps.some((s) => /Gather Ss/.test(s.note)));
  assert.throws(() => runAlgorithm(A, B, "nlj", EXAMPLE.on, { perBlock: 9 }), /Rows per block/);
});

// Silberschatz, Korth & Sudarshan, Database System Concepts (7th ed.), §15.5:
// student ⋈ takes with n_student = 5,000, b_student = 100, n_takes = 10,000, b_takes = 400.
test("textbook cost estimates (Silberschatz ch. 15)", () => {
  const get = (c, id) => c.rows.find((x) => x.id === id);
  const studentOuter = costs({ nr: 5000, br: 100, ns: 10000, bs: 400, M: 3 });
  assert.deepEqual([get(studentOuter, "nlj").transfers, get(studentOuter, "nlj").seeks], [2000100, 5100]);
  const takesOuter = costs({ nr: 10000, br: 400, ns: 5000, bs: 100, M: 3 });
  assert.deepEqual([get(takesOuter, "nlj").transfers, get(takesOuter, "nlj").seeks], [1000400, 10400]);
  assert.deepEqual([get(studentOuter, "bnlj").transfers, get(studentOuter, "bnlj").seeks], [40100, 200]);
  // Hash join with M = 20: student is the build input, n_h = ⌈100/20⌉ = 5, so 3(100 + 400) + 4·5.
  const m20 = costs({ nr: 5000, br: 100, ns: 10000, bs: 400, M: 20 });
  assert.equal(get(m20, "hash").transfers, 1520);
  assert.equal(get(m20, "hash").nh, 5);
  assert.equal(get(m20, "bnlj-m").transfers, Math.ceil(100 / 18) * 400 + 100);
  // Already sorted: the merge reads each block once. Unsorted with M = 3: sorting takes costs
  // 400(2⌈log₂(400/3)⌉ + 1) = 6,800 and student 100(2⌈log₂(100/3)⌉ + 1) = 1,300.
  assert.equal(get(costs({ nr: 5000, br: 100, ns: 10000, bs: 400, M: 3, rSorted: true, sSorted: true }), "merge").transfers, 500);
  assert.equal(sortCost(400, 3).transfers, 6800);
  assert.equal(sortCost(100, 3).transfers, 1300);
  assert.equal(get(studentOuter, "merge").transfers, 500 + 6800 + 1300);
  // If the smaller relation fits in memory, block nested-loop and hash join both cost b_r + b_s.
  const big = costs({ nr: 5000, br: 100, ns: 10000, bs: 400, M: 102 });
  assert.equal(get(big, "best").transfers, 500);
  assert.equal(get(big, "hash").transfers, 500);
  assert.throws(() => costs({ nr: 1, br: 1, ns: 1, bs: 1, M: 2 }), /at least 3/);
});
