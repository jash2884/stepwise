import assert from "node:assert/strict";
import { test } from "node:test";
import { ALGORITHMS, EXAMPLES, expectedValues, parseLog, parseValues, randomLog, recText, recover } from "../public/js/engines/recovery.js";

const ex = (k, algo = EXAMPLES[k].algo, crash) => {
  const recs = parseLog(EXAMPLES[k].log);
  return recover(recs, crash ?? EXAMPLES[k].crash ?? recs.length, algo, parseValues(EXAMPLES[k].init));
};

// Silberschatz, Korth & Sudarshan, Database System Concepts (7th ed.), §19.4:
// the checkpoint {T0, T1} example. Redo leaves undo-list = {T2}; undo appends
// <T2, A, 500> and <T2 abort>.
test("Silberschatz checkpoint example: undo-list {T2}, redo-only record and abort appended", () => {
  const r = ex("checkpoint");
  assert.deepEqual(r.undone, ["T2"]);
  assert.deepEqual(r.log.slice(10).map(recText), ["<T2, A, 500>", "<T2 abort>"]);
  assert.deepEqual(r.values, { A: 500, B: 2000, C: 600 });
  const afterRedo = r.steps.find((s) => s.line === 7);
  assert.deepEqual(afterRedo.list, ["T2"]);
  assert.ok(r.steps.some((s) => /T1 committed/.test(s.note)));
  assert.ok(r.steps.some((s) => /T0 aborted before the crash/.test(s.note)));
});

// Same book, the three crash points for T0 then T1 (A = 1000, B = 2000, C = 700).
test("Silberschatz cases (a), (b), (c): undo T0; redo T0 and undo T1; redo both", () => {
  assert.deepEqual(ex("caseA").values, { A: 1000, B: 2000, C: 700 });
  assert.deepEqual(ex("caseA").undone, ["T0"]);
  const b = ex("caseB");
  assert.deepEqual(b.values, { A: 950, B: 2050, C: 700 });
  assert.deepEqual([b.undone, b.committed], [["T1"], ["T0"]]);
  const c = ex("caseC");
  assert.deepEqual(c.values, { A: 950, B: 2050, C: 600 });
  assert.deepEqual(c.undone, []);
  assert.equal(c.steps.at(-1).done, true);
});

// ARIES, after the example in Elmasri & Navathe, Fundamentals of Database Systems
// (recovery techniques chapter): T1, T2 active at a fuzzy checkpoint with C and B
// dirty; T3 is the only loser.
test("ARIES: analysis tables, RedoLSN and the loser's undo", () => {
  const r = ex("aries");
  const afterAnalysis = r.steps.find((s) => s.line === 7);
  assert.deepEqual(afterAnalysis.tt, [{ t: "T3", lastLSN: 8 }]);
  assert.deepEqual(afterAnalysis.dpt, [{ item: "C", rec: 2 }, { item: "B", rec: 4 }, { item: "A", rec: 8 }]);
  assert.equal(afterAnalysis.redoLSN, 2);
  assert.deepEqual(r.undone, ["T3"]);
  assert.deepEqual(r.values, { A: 30, B: 25, C: 18 });
  assert.deepEqual(r.log.slice(10).map(recText), ["<T3, A, 30>", "<T3 abort>"]);
  assert.equal(r.log[10].undoNext, 7);
  // The undo/redo algorithm reaches the same database.
  assert.deepEqual(ex("aries", "undoRedo").values, r.values);
});

test("ARIES follows a CLR's UndoNextLSN instead of undoing twice", () => {
  const r = ex("rollback", "aries");
  assert.ok(r.steps.some((s) => /is a CLR.*jump to its UndoNextLSN 4/.test(s.note)));
  assert.deepEqual(r.log.slice(8).map(recText), ["<T2, B, 200>", "<T2 abort>"]);
  assert.deepEqual(r.values, { A: 150, B: 200, C: 300 });
  // Silberschatz's algorithm re-undoes C (harmless) and gets the same values.
  const s = ex("rollback", "undoRedo");
  assert.deepEqual(s.log.slice(8).map(recText), ["<T2, C, 300>", "<T2, B, 200>", "<T2 abort>"]);
  assert.deepEqual(s.values, r.values);
});

test("steps carry valid pseudocode lines and variables", () => {
  for (const k of Object.keys(EXAMPLES)) for (const algo of Object.keys(ALGORITHMS)) {
    const r = ex(k, algo);
    for (const s of r.steps) {
      if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= ALGORITHMS[algo].code.length, `${k} ${algo} line ${l}`);
      assert.ok(s.note.length > 20 && s.vars);
      assert.ok(s.shown >= r.crashAt && s.shown <= r.log.length);
    }
  }
});

test("parsing explains mistakes", () => {
  assert.throws(() => parseLog("<T1, A, 1, 2>"), /no <T1 start>/);
  assert.throws(() => parseLog("<T1 start>\n<checkpoint {T2}>"), /exactly the transactions active/);
  assert.throws(() => parseLog("<T1 start>\n<T1, A, 1, 2>\n<T1 abort>"), /never undone/);
  assert.throws(() => parseLog("<T1 start>\n<T1, A, 1, 2>\n<T1, A, 5>"), /should be <T1, A, 1>/);
  assert.throws(() => parseLog("<T1 start>\n<T1 commit>\n<T1, A, 1, 2>"), /already committed/);
  assert.throws(() => parseLog("T1 start"), /wrap each record/);
  assert.throws(() => parseLog("<T1 start>\n<T1, A, 1, 2>\n<checkpoint {T1} dirty B@2>"), /must point to an earlier record that wrote B/);
  assert.deepEqual(parseValues("a=1, B=2"), { A: 1, B: 2 });
  assert.throws(() => parseValues("A:1"), /initial values/);
  assert.equal(recText(parseLog("<checkpoint>")[0]), "<checkpoint {}>");
  assert.equal(recText(parseLog("<T1 start>\n<T1, A, 1, 2>\n<checkpoint T1 dirty a@2>")[2]), "<checkpoint {T1} dirty A@2>");
});

// Fuzz: logs written under strict 2PL with rollbacks, checkpoints and a crash anywhere.
test("fuzz: recovery leaves exactly the committed writes, both algorithms agree, and it is idempotent", () => {
  let seed = 4242;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    const g = randomLog(rand);
    assert.deepEqual(parseLog(g.text).map(recText), g.records.map(recText), "round trip");
    for (const crash of [g.crash, g.records.length, Math.floor(rand() * (g.records.length + 1))]) {
      const want = expectedValues(g.records, crash, g.init);
      for (const algo of Object.keys(ALGORITHMS)) {
        const r = recover(g.records, crash, algo, g.init);
        assert.deepEqual(r.values, want, `${algo} crash ${crash}\n${g.text}`);
        assert.deepEqual(r.steps.at(-1).values, want);
        const committed = new Set(r.committed);
        assert.ok(r.undone.every((t) => !committed.has(t)), "a committed transaction is never undone");
        // Crash again at any point during recovery (or after it) and recover again.
        const cut = crash + Math.floor(rand() * (r.log.length - crash + 1));
        const again = recover(r.log, cut, algo, g.init);
        assert.deepEqual(again.values, want, `${algo} second crash at ${cut}`);
        const twice = recover(r.log, r.log.length, algo, g.init);
        assert.deepEqual(twice.values, want);
        assert.deepEqual(twice.undone, []);
      }
    }
  }
});
