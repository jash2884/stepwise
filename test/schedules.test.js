import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, EXAMPLES, parseSchedule } from "../public/js/engines/schedules.js";

const ex = (name) => EXAMPLES.find(([n]) => n.startsWith(name))[1];

test("conflict-serialisable schedule: edges and serial order", () => {
  const r = analyse(ex("Conflict-serialisable"));
  assert.equal(r.conflictSerializable, true);
  assert.deepEqual(r.edges, [{ from: 1, to: 2 }]);
  assert.deepEqual(r.order, [1, 2]);
  // T2 reads A before T1 commits: recoverable (T2 commits after T1) but a dirty read.
  assert.deepEqual([r.recovery.recoverable, r.recovery.cascadeless, r.recovery.strict], [true, false, false]);
});

test("lost update has a cycle T1 → T2 → T1", () => {
  const r = analyse(ex("Not serialisable"));
  assert.equal(r.conflictSerializable, false);
  assert.deepEqual(r.cycle, [1, 2, 1]);
  assert.equal(r.viewSerializable, false);
});

test("blind writes: view-serialisable as T1, T2, T3 but not conflict-serialisable", () => {
  const r = analyse(ex("View-"));
  assert.equal(r.conflictSerializable, false);
  assert.equal(r.viewSerializable, true);
  assert.deepEqual(r.viewOrder, [1, 2, 3]);
  assert.equal(r.blindWrites, true);
});

test("recoverability classes", () => {
  const notRec = analyse(ex("Not recoverable")).recovery;
  assert.deepEqual([notRec.recoverable, notRec.cascadeless, notRec.strict], [false, false, false]);
  const rec = analyse(ex("Recoverable, not")).recovery;
  assert.deepEqual([rec.recoverable, rec.cascadeless, rec.strict], [true, false, false]);
  const noCommits = analyse("R1(A) W2(A)").recovery;
  assert.equal(noCommits.known, false);
  const overwrite = analyse("W1(A) W2(A) C1 C2").recovery;
  assert.deepEqual([overwrite.recoverable, overwrite.cascadeless, overwrite.strict], [true, true, false]);
});

test("parsing is forgiving about case and separators, strict about mistakes", () => {
  assert.equal(parseSchedule("r1(x); w2(x), c1 c2").ops.length, 4);
  assert.throws(() => parseSchedule("R1"), /needs a data item/);
  assert.throws(() => parseSchedule("R1(A) C1 W1(A)"), /after it commits/);
  assert.throws(() => parseSchedule("R1(A) hello"), /Can't read/);
});
