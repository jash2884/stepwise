import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLES, prepare, PROTOCOLS, randomSchedule, run } from "../public/js/engines/concurrency.js";
import { analyse } from "../public/js/engines/schedules.js";

const ex = (k) => EXAMPLES[k].s;

// Silberschatz, Korth & Sudarshan, Database System Concepts, "Concurrency Control":
// T3 holds lock-X(B) and asks for lock-X(A) while T4 holds lock-S(A) and asks for
// lock-S(B). Renamed T1/T2 here.
test("2PL: the textbook deadlock is found in the waits-for graph and the youngest is aborted", () => {
  for (const p of ["basic", "strict", "rigorous"]) {
    const r = run(ex("deadlock"), p);
    assert.deepEqual(r.stats.deadlocks, [[1, 2, 1]], p);
    assert.deepEqual(r.committed, [1]);
    assert.deepEqual(r.aborted, [2]);
    assert.equal(r.stats.firstWait, 2);
    const dl = r.steps.find((s) => s.kind === "deadlock");
    assert.equal(dl.line, 8);
    assert.deepEqual(dl.wfg.cycle, [1, 2, 1]);
    assert.match(dl.note, /youngest transaction on the cycle, T2/);
  }
});

test("2PL: two readers that both upgrade to write deadlock (the lost update can't happen)", () => {
  const r = run(ex("upgrade"), "strict");
  assert.equal(r.stats.deadlocks.length, 1);
  const waits = r.steps.filter((s) => s.kind === "wait");
  assert.match(waits[0].note, /upgrade to lock-X\(A\)/);
  // The upgrade waits at the front of the queue while T2 still holds S.
  assert.deepEqual(waits[0].table.find((x) => x.item === "A").queue, [{ t: 1, m: "X", up: true }]);
});

test("basic, strict and rigorous 2PL differ in when locks are released", () => {
  // Basic 2PL releases T1's X-lock on A at its lock point, so T2 never waits;
  // strict 2PL keeps it until C1.
  assert.equal(run(ex("early"), "basic").stats.waits, 0);
  assert.equal(run(ex("early"), "strict").stats.waits, 1);
  // Strict 2PL may release T1's S-lock on A early; rigorous keeps it.
  assert.equal(run(ex("rigorous"), "strict").stats.waits, 0);
  assert.equal(run(ex("rigorous"), "rigorous").stats.waits, 1);
  const basic = run(ex("early"), "basic");
  const lp = basic.steps.find((s) => /lock point/.test(s.note));
  assert.match(lp.note, /T1 now holds every lock/);
  assert.ok(basic.steps.some((s) => s.kind === "release" && s.line === 9 && /shrinking phase/.test(s.note)));
});

test("three-way deadlock: the cycle has every transaction and T3 is the victim", () => {
  const r = run(ex("threeWay"), "strict");
  assert.deepEqual(r.stats.deadlocks, [[1, 2, 3, 1]]);
  assert.deepEqual(r.aborted, [3]);
});

// Silberschatz: schedule 3 (T25, T26) is possible under timestamp ordering;
// T27/T28 shows Thomas' write rule ignoring an obsolete write.
test("timestamp ordering: textbook schedules, Thomas' write rule and R-TS/W-TS", () => {
  const ok = run(ex("toOk"), "to");
  assert.deepEqual(ok.committed, [1, 2]);
  assert.deepEqual(ok.final, { A: { r: 2, w: 2 }, B: { r: 2, w: 2 } });
  const basic = run(ex("thomas"), "to");
  assert.deepEqual(basic.aborted, [1]);
  assert.equal(basic.steps.find((s) => s.kind === "abort").line, 6);
  const thomas = run(ex("thomas"), "thomas");
  assert.deepEqual(thomas.committed, [1, 2]);
  assert.equal(thomas.stats.ignored, 1);
  assert.equal(thomas.final.Q.w, 2);
});

test("timestamp ordering: read too late, write too late, cascades and the TS convention", () => {
  // By transaction number, T1 is older even though T2 starts first: its write comes too late.
  const late = run("R2(A) W1(A)", "to", { ts: "number" });
  assert.deepEqual(late.aborted, [1]);
  assert.equal(late.steps.find((s) => s.kind === "abort").line, 5);
  // By start order T2 is older, so the same schedule is fine.
  assert.deepEqual(run("R2(A) W1(A)", "to").committed, [1, 2]);
  const cascade = run(ex("cascade"), "to");
  assert.deepEqual(cascade.aborted, [1, 2]);
  assert.ok(cascade.steps.some((s) => /Cascading rollback: T2/.test(s.note)));
  // With implicit commits T2 commits before T1 rolls back: not recoverable.
  assert.ok(run("W1(A) R2(A) W2(B) R1(B)", "to").steps.some((s) => /not recoverable/.test(s.note)));
});

test("validation: a transaction that read what an overlapping one wrote fails", () => {
  const fail = run(ex("occFail"), "occ");
  assert.deepEqual(fail.committed, [2]);
  assert.deepEqual(fail.aborted, [1]);
  assert.equal(fail.steps.find((s) => s.kind === "abort").line, 6);
  const pass = run(ex("occOk"), "occ");
  assert.deepEqual(pass.committed, [1, 2]);
  assert.ok(pass.steps.some((s) => s.line === 5));
  assert.ok(run("R1(A) W1(A) C1 R2(A) W2(A) C2", "occ").steps.some((s) => s.line === 4), "T1 finished before T2 started");
});

test("implicit commits and errors", () => {
  const p = prepare("R1(A) W2(A) R1(B)");
  assert.deepEqual(p.seq.map((o) => `${o.kind}${o.t}${o.implicit ? "*" : ""}`), ["R1", "W2", "C2*", "R1", "C1*"]);
  assert.throws(() => run("R1(A)", "nope"), /Unknown protocol/);
  assert.throws(() => run("R1", "basic"), /needs a data item/);
});

// --- Fuzz invariants -----------------------------------------------------------
let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const opsOf = (r, steps) => steps.at(-1).history.filter((x) => x.kind === "op" && r.committed.includes(x.t)).map((x) => x.text).join(" ");

test("fuzz: 2PL keeps the lock table consistent, obeys two-phase and its release rule, and is conflict-serialisable", () => {
  for (let k = 0; k < 400; k++) {
    const text = randomSchedule(rand, { txns: 2 + Math.floor(rand() * 3), items: ["A", "B", "C"].slice(0, 2 + Math.floor(rand() * 2)) });
    for (const p of ["basic", "strict", "rigorous"]) {
      const r = run(text, p);
      const code = PROTOCOLS[p].code.length;
      assert.equal(r.committed.length + r.aborted.length, r.txns.length, `${p}: everyone finishes: ${text}`);
      assert.equal(r.aborted.length, r.stats.deadlocks.length, "only deadlock victims abort");
      for (const s of r.steps) {
        assert.ok(s.note && typeof s.vars === "object");
        if (s.line != null) assert.ok(s.line >= 1 && s.line <= code);
        for (const row of s.table) {
          if (row.holders.some((x) => x.m === "X")) assert.equal(row.holders.length, 1, `X is exclusive: ${text}`);
          for (const q of row.queue) assert.equal(s.txns.find((x) => x.t === q.t).status, "waiting");
        }
      }
      const hist = r.steps.at(-1).history;
      for (const t of r.txns) {
        const mine = hist.filter((x) => x.t === t);
        const firstUnlock = mine.findIndex((x) => x.kind === "unlock");
        const lastLock = mine.findLastIndex((x) => x.kind === "lock");
        if (firstUnlock >= 0) assert.ok(lastLock < firstUnlock, `${p}: T${t} locks after unlocking: ${text}`);
        const end = mine.findIndex((x) => x.kind === "committed" || x.kind === "aborted");
        mine.forEach((x, i) => {
          if (x.kind !== "unlock") return;
          if (p === "rigorous" || (p === "strict" && x.mode === "X")) assert.ok(i > end, `${p}: early unlock of ${x.mode} by T${t}: ${text}`);
        });
      }
      const ran = opsOf(r, r.steps);
      if (ran) assert.equal(analyse(ran).conflictSerializable, true, `${p}: ${ran}`);
      assert.ok(r.stats.waits >= 0 && (r.stats.deadlocks.length === 0 || r.stats.waits >= 2));
    }
  }
});

test("fuzz: timestamp ordering runs every conflict in timestamp order; validation always commits the first validator", () => {
  for (let k = 0; k < 400; k++) {
    const text = randomSchedule(rand, { txns: 2 + Math.floor(rand() * 3), items: ["A", "B", "C"] });
    for (const p of ["to", "thomas"]) for (const ts of ["start", "number"]) {
      const r = run(text, p, { ts });
      assert.equal(r.committed.length + r.aborted.length, r.txns.length);
      const ran = r.steps.at(-1).ran.map((i) => r.seq[i]);
      for (let i = 0; i < ran.length; i++) for (let j = i + 1; j < ran.length; j++) {
        const a = ran[i], b = ran[j];
        if (a.t !== b.t && a.item === b.item && (a.kind === "W" || b.kind === "W")) assert.ok(r.TS[a.t] < r.TS[b.t], `${p}/${ts}: ${text}`);
      }
      for (const s of r.steps) if (s.line != null) assert.ok(s.line >= 1 && s.line <= PROTOCOLS[p].code.length);
      if (p === "to") assert.equal(r.stats.ignored, 0);
    }
    const o = run(text, "occ");
    assert.equal(o.committed.length + o.aborted.length, o.txns.length);
    const firstValidator = o.seq.find((x) => x.kind === "C").t;
    assert.ok(o.committed.includes(firstValidator));
  }
});
