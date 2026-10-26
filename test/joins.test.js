import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE, join, parseTable } from "../public/js/engines/joins.js";

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
