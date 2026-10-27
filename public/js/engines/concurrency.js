// Concurrency control, one operation at a time: two-phase locking (basic,
// strict and rigorous) with a lock table and a waits-for graph, timestamp
// ordering (basic, or with Thomas' write rule) and validation-based
// (optimistic) concurrency control.
//
// Conventions (stated in the UI):
// - Schedules are written R1(A) W2(A) C1 A2. A transaction with no C or A
//   commits straight after its last operation.
// - 2PL: a read needs a shared (S) lock and a write an exclusive (X) lock; a
//   holder of S upgrades to X. Requests are served first come, first served,
//   except that an upgrade goes to the front of the queue.
// - A blocked transaction's later operations wait; everyone else carries on in
//   schedule order. After every wait the waits-for graph is checked, and a
//   deadlock is broken by aborting the youngest transaction on the cycle (the
//   highest number). Aborted transactions are not restarted.
// - Timestamp ordering: TS(Ti) is the order in which transactions start (or
//   the transaction number). R-TS/W-TS start at 0 and are not reset on rollback.
// - Validation: the clock is the position in the schedule. Ti validates at its
//   commit and its write phase follows at once, so Finish(Ti) = Validation(Ti).
import { opText, parseSchedule } from "./schedules.js";

const twoPlCode = (rule) => [
  "on Ri(X) or Wi(X):",
  "  mode ← S for a read, X for a write",
  "  if Ti already holds a strong enough lock then run the op",
  "  else if compatible with every holder and no one is queued",
  "    grant lock-mode(X) to Ti; run the op",
  "  else",
  "    queue Ti on X; Ti waits  // edge Ti → each blocker",
  "    if the waits-for graph has a cycle then abort the youngest on it",
  `  ${rule}`,
  "on unlock(X): grant queued requests from the front while compatible",
  "on Ci or Ai: release every lock Ti still holds",
];

const toCode = (thomas) => [
  "on Ri(X):",
  "  if TS(Ti) < W-TS(X) then roll back Ti  // a younger txn already wrote X",
  "  else read X; R-TS(X) ← max(R-TS(X), TS(Ti))",
  "on Wi(X):",
  "  if TS(Ti) < R-TS(X) then roll back Ti  // a younger txn read the old X",
  thomas ? "  else if TS(Ti) < W-TS(X) then ignore the write  // Thomas: it's obsolete" : "  else if TS(Ti) < W-TS(X) then roll back Ti  // obsolete write",
  "  else write X; W-TS(X) ← TS(Ti)",
  "on Ci or Ai: commit or abort Ti",
  "a rolled-back Ti's later ops are skipped; anyone who read its writes rolls back too",
];

const occCode = [
  "read phase: Ti reads and writes local copies only",
  "at Ci: validate Ti; TS(Ti) ← Validation(Ti)",
  "for each Tk that validated before Ti:",
  "  if Finish(Tk) < Start(Ti) then ok  // Tk was done before Ti began",
  "  else if WriteSet(Tk) ∩ ReadSet(Ti) = ∅ then ok  // nothing Ti read was changed",
  "  else roll back Ti",
  "write phase: copy WriteSet(Ti) to the database; Finish(Ti) ← now",
];

export const PROTOCOLS = {
  basic: { name: "Basic 2PL", family: "2pl", code: twoPlCode("after the lock point, unlock(X) once Ti won't use X again") },
  strict: { name: "Strict 2PL", family: "2pl", code: twoPlCode("after the lock point, unlock S-locks no longer needed; X-locks wait for commit") },
  rigorous: { name: "Rigorous 2PL", family: "2pl", code: twoPlCode("keep every lock until Ti commits or aborts") },
  to: { name: "Timestamp ordering", family: "to", code: toCode(false) },
  thomas: { name: "Timestamp ordering + Thomas' write rule", family: "to", code: toCode(true) },
  occ: { name: "Validation (optimistic)", family: "occ", code: occCode },
};

export const EXAMPLES = {
  deadlock: { name: "Deadlock: T1 and T2 wait for each other (Silberschatz)", s: "W1(B) R2(A) R2(B) W1(A) C1 C2", p: "basic" },
  upgrade: { name: "Upgrade deadlock: two readers both want to write", s: "R1(A) R2(A) W1(A) W2(A) C1 C2", p: "strict" },
  early: { name: "Basic vs strict: an X-lock released early", s: "W1(A) W1(B) R2(A) W2(A) R1(B) C1 C2", p: "basic" },
  rigorous: { name: "Strict vs rigorous: an S-lock held to commit", s: "R1(A) W1(B) W2(A) C1 C2", p: "rigorous" },
  threeWay: { name: "Three-way deadlock", s: "W1(A) W2(B) W3(C) R1(B) R2(C) R3(A) C1 C2 C3", p: "strict" },
  toOk: { name: "Timestamp ordering: all allowed (Silberschatz T25/T26)", s: "R1(B) R2(B) W2(B) R1(A) R2(A) W2(A) C1 C2", p: "to" },
  thomas: { name: "Thomas' write rule: an obsolete write (Silberschatz T27/T28)", s: "R1(Q) W2(Q) W1(Q) C1 C2", p: "thomas" },
  cascade: { name: "Timestamp ordering: a cascading rollback", s: "W1(A) R2(A) W2(B) R1(B) C1 C2", p: "to" },
  occFail: { name: "Validation fails: T2 changed what T1 read", s: "R1(A) R2(A) W2(A) C2 R1(B) W1(A) C1", p: "occ" },
  occOk: { name: "Validation passes: read-only T1 (Silberschatz T25/T26)", s: "R1(B) R2(B) W2(B) R2(A) W2(A) R1(A) C1 C2", p: "occ" },
};

// The schedule with an implicit commit after each transaction that has none.
export function prepare(text) {
  const { ops, txns } = parseSchedule(text);
  const seq = ops.map((o) => ({ kind: o.kind, t: o.t, item: o.item }));
  for (const t of txns) {
    if (seq.some((o) => o.t === t && (o.kind === "C" || o.kind === "A"))) continue;
    seq.splice(seq.findLastIndex((o) => o.t === t) + 1, 0, { kind: "C", t, item: null, implicit: true });
  }
  seq.forEach((o, k) => { o.k = k; });
  const items = [...new Set(seq.filter((o) => o.item).map((o) => o.item))].sort();
  return { seq, txns, items };
}

export function run(text, protocol, { ts = "start" } = {}) {
  const spec = PROTOCOLS[protocol];
  if (!spec) throw new Error(`Unknown protocol ${protocol}.`);
  const prep = prepare(text);
  const res = spec.family === "2pl" ? twoPhase(prep, protocol) : spec.family === "to" ? timestamps(prep, protocol === "thomas", ts) : validation(prep);
  const last = res.steps.at(-1);
  return {
    ...prep, ...res, protocol,
    committed: last.txns.filter((x) => x.status === "committed").map((x) => x.t),
    aborted: last.txns.filter((x) => x.status === "aborted").map((x) => x.t),
  };
}

const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const T = (t) => `T${t}`;

function findCycle(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, [...new Set(edges.filter((e) => e.from === n).map((e) => e.to))]]));
  const state = new Map(), stack = [];
  let cycle = null;
  const dfs = (n) => {
    state.set(n, 1); stack.push(n);
    for (const m of adj.get(n)) {
      if (cycle) return;
      if (state.get(m) === 1) { cycle = [...stack.slice(stack.indexOf(m)), m]; return; }
      if (!state.has(m)) dfs(m);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of nodes) if (!state.has(n) && !cycle) dfs(n);
  return cycle;
}

// --- Two-phase locking --------------------------------------------------------
function twoPhase({ seq, txns, items }, variant) {
  const locks = new Map(items.map((x) => [x, { holders: new Map(), queue: [] }]));
  const status = new Map(txns.map((t) => [t, "active"]));
  const phase = new Map(txns.map((t) => [t, "growing"]));
  const lockPoint = new Map(), waitingOn = new Map();
  const marks = seq.map(() => "todo");
  const history = [], steps = [];
  const stats = { waits: 0, deadlocks: [], firstWait: null, firstAbort: null };
  let hid = 0;
  const log = (t, text, kind, extra = {}) => history.push({ id: hid++, t, text, kind, ...extra });
  const compatible = (a, b) => a === "S" && b === "S";
  const grantable = (L, t, mode) => (mode === "X" ? [...L.holders.keys()].every((x) => x === t) : [...L.holders].every(([x, m]) => x === t || m === "S"));

  const blockersOf = (t) => {
    const w = waitingOn.get(t);
    if (!w) return [];
    const L = locks.get(w.item), out = new Set();
    for (const [x, m] of L.holders) if (x !== t && !compatible(m, w.mode)) out.add(x);
    for (const e of L.queue) { if (e.t === t) break; if (!compatible(e.mode, w.mode)) out.add(e.t); }
    return [...out];
  };
  const graph = () => {
    const edges = [];
    for (const t of txns) for (const b of blockersOf(t)) edges.push({ from: t, to: b, item: waitingOn.get(t).item });
    return { edges, cycle: findCycle(txns, edges) };
  };
  const showLock = (L) => [...L.holders].map(([t, m]) => `T${t}:${m}`).join(" ") || "–";
  const showQueue = (L) => L.queue.map((e) => `T${e.t}:${e.upgrade ? "S→X" : e.mode}`).join(" ") || "–";
  const lockVars = (t, x, o, extra = {}) => {
    const L = locks.get(x);
    return { ...(o ? { op: opText(o) } : {}), Ti: T(t), X: x, ...(o ? { mode: o.kind === "R" ? "S" : "X" } : {}), [`holders(${x})`]: showLock(L), [`queue(${x})`]: showQueue(L), ...extra };
  };

  function snap(line, note, kind, vars = {}, at = null) {
    steps.push({
      line, note, kind, vars, at, marks: [...marks],
      table: items.map((item) => { const L = locks.get(item); return { item, holders: [...L.holders].map(([t, m]) => ({ t, m })), queue: L.queue.map((e) => ({ t: e.t, m: e.mode, up: e.upgrade })) }; }),
      txns: txns.map((t) => ({ t, status: status.get(t), phase: phase.get(t), held: items.filter((x) => locks.get(x).holders.has(t)).map((x) => `${locks.get(x).holders.get(t)}(${x})`), lockPoint: lockPoint.get(t) ?? null })),
      wfg: graph(), history: history.map((x) => ({ ...x })),
    });
  }

  const remaining = (t) => seq.filter((o) => o.t === t && o.item && (marks[o.k] === "todo" || marks[o.k] === "wait"));
  const strongEnough = (t, o) => { const m = locks.get(o.item).holders.get(t); return m === "X" || (m === "S" && o.kind === "R"); };
  const needsMore = (t) => remaining(t).some((o) => !strongEnough(t, o));
  const perform = (o) => { marks[o.k] = "done"; log(o.t, opText(o), "op", { k: o.k }); };
  const checkLockPoint = (t, after) => {
    if (lockPoint.has(t) || status.get(t) !== "active" || needsMore(t)) return "";
    lockPoint.set(t, after);
    return ` T${t} now holds every lock it will ever need: this is its lock point, the end of its growing phase.`;
  };

  function autoRelease(t) {
    if (variant === "rigorous" || status.get(t) !== "active" || needsMore(t)) return;
    for (const x of items) {
      const L = locks.get(x), m = L.holders.get(t);
      if (!m || (variant === "strict" && m === "X") || remaining(t).some((o) => o.item === x)) continue;
      L.holders.delete(t);
      phase.set(t, "shrinking");
      log(t, `unlock(${x})`, "unlock", { mode: m });
      snap(9, `T${t} is past its lock point and won't use ${x} again, so it releases its ${m === "S" ? "shared" : "exclusive"} lock on ${x} now${variant === "basic" && m === "X" ? " (basic 2PL allows this before commit, so others may now see T" + t + "'s uncommitted write)" : ""}. T${t} is in its shrinking phase: it may not ask for any new lock.`, "release", lockVars(t, x, null, { phase: "shrinking" }));
      grantWaiters(x);
    }
  }

  function grantWaiters(x) {
    const L = locks.get(x);
    while (L.queue.length && grantable(L, L.queue[0].t, L.queue[0].mode)) {
      const e = L.queue.shift(), o = seq[e.k];
      L.holders.set(e.t, e.mode);
      status.set(e.t, "active");
      waitingOn.delete(e.t);
      log(e.t, `lock-${e.mode}(${x})`, "lock", { mode: e.mode });
      perform(o);
      const lp = checkLockPoint(e.t, opText(o));
      snap(10, `${x} is free enough now, so the request at the front of its queue is granted: T${e.t} gets ${e.upgrade ? "its upgrade to " : ""}lock-${e.mode}(${x}) and the delayed ${opText(o)} finally runs.${lp}`, "grant", lockVars(e.t, x, o), e.k);
      autoRelease(e.t);
    }
  }

  function finish(t, how, line, note, at = null) {
    status.set(t, how);
    if (how === "aborted") stats.firstAbort ??= t;
    seq.forEach((o) => { if (o.t === t && (marks[o.k] === "todo" || marks[o.k] === "wait")) marks[o.k] = "skip"; });
    waitingOn.delete(t);
    for (const x of items) { const L = locks.get(x); L.queue = L.queue.filter((e) => e.t !== t); }
    const freed = items.filter((x) => locks.get(x).holders.has(t)).map((x) => [x, locks.get(x).holders.get(t)]);
    freed.forEach(([x]) => locks.get(x).holders.delete(t));
    log(t, how === "committed" ? "commit" : "abort", how);
    freed.forEach(([x, m]) => log(t, `unlock(${x})`, "unlock", { mode: m }));
    snap(line, `${note} ${freed.length ? `It releases ${list(freed.map(([x, m]) => `lock-${m}(${x})`))}.` : "It holds no locks."}`, how, { Ti: T(t), released: freed.map(([x, m]) => `${m}(${x})`) }, at);
    for (const x of items) grantWaiters(x);
  }

  function checkDeadlock() {
    const { cycle } = graph();
    if (!cycle) return false;
    const victim = Math.max(...cycle.slice(0, -1));
    stats.deadlocks.push(cycle);
    snap(8, `Deadlock! The waits-for graph has the cycle ${cycle.map(T).join(" → ")}: each transaction waits for the next one, so none of them can ever continue. Break it by aborting the youngest transaction on the cycle, T${victim}.`, "deadlock", { cycle: cycle.map(T), victim: T(victim) });
    finish(victim, "aborted", 8, `T${victim} is aborted and rolled back (here it isn't restarted).`);
    return true;
  }

  function request(o) {
    const t = o.t, x = o.item, need = o.kind === "R" ? "S" : "X", L = locks.get(x), held = L.holders.get(t);
    if (held === "X" || (held === "S" && need === "S")) {
      perform(o);
      snap(3, `T${t} already holds lock-${held}(${x}), which is enough for ${o.kind === "R" ? "a read" : "a write"}, so ${opText(o)} runs at once.`, "run", lockVars(t, x, o), o.k);
      autoRelease(t);
      return;
    }
    const upgrade = held === "S";
    const free = upgrade ? L.holders.size === 1 : !L.queue.length && grantable(L, t, need);
    if (free) {
      L.holders.set(t, need);
      log(t, `lock-${need}(${x})`, "lock", { mode: need });
      perform(o);
      const lp = checkLockPoint(t, opText(o));
      const why = upgrade ? `T${t} is the only transaction holding ${x}, so its shared lock is upgraded to exclusive` : need === "S" ? `Nobody holds an exclusive lock on ${x}${L.holders.size > 1 ? " (shared locks can be held by many readers at once)" : ""}, so T${t} gets lock-S(${x})` : `Nobody holds any lock on ${x}, so T${t} gets lock-X(${x})`;
      snap(5, `${why} and ${opText(o)} runs.${lp}`, "grant", lockVars(t, x, o), o.k);
      autoRelease(t);
      return;
    }
    const entry = { t, mode: need, upgrade, k: o.k };
    if (upgrade) L.queue.unshift(entry); else L.queue.push(entry);
    status.set(t, "waiting");
    waitingOn.set(t, { item: x, mode: need });
    marks[o.k] = "wait";
    stats.waits++;
    stats.firstWait ??= t;
    log(t, `wait lock-${need}(${x})`, "wait", { mode: need });
    const conflicting = [...L.holders].filter(([h, m]) => h !== t && !compatible(m, need));
    const reasons = conflicting.length ? `${list(conflicting.map(([h, m]) => `T${h} holds lock-${m}(${x})`))}${need === "X" && conflicting.every(([, m]) => m === "S") ? " (a writer needs everyone else gone)" : ""}` : `${list(L.queue.filter((e) => e.t !== t).map((e) => T(e.t)))} ${L.queue.length > 2 ? "are" : "is"} already queued for ${x}, and requests are served in order`;
    const edges = blockersOf(t).map((b) => `T${t} → T${b}`);
    snap(7, `T${t} needs ${upgrade ? "to upgrade to " : ""}lock-${need}(${x}), but ${reasons}. So T${t} waits, and ${opText(o)} and everything after it in T${t} is delayed. Waits-for graph: add ${list(edges)}.`, "wait", lockVars(t, x, o), o.k);
    checkDeadlock();
  }

  const ruleText = { basic: "a lock is released as soon as the transaction has every lock it needs and won't use that item again", strict: "shared locks may go early, but exclusive locks are held until commit or abort", rigorous: "every lock is held until commit or abort" };
  snap(null, `Start. Under ${PROTOCOLS[variant].name}, ${ruleText[variant]}. Every transaction is in its growing phase.`, "start", { protocol: PROTOCOLS[variant].name });
  for (let guard = 0; ; guard++) {
    if (guard > 400) throw new Error("The simulation didn't finish.");
    const o = seq.find((x) => marks[x.k] === "todo" && status.get(x.t) === "active");
    if (!o) {
      if ([...status.values()].includes("waiting") && checkDeadlock()) continue;
      break;
    }
    if (o.item) { request(o); continue; }
    marks[o.k] = "done";
    if (o.kind === "C") {
      const why = variant === "basic" ? "" : variant === "strict" ? " Strict 2PL frees exclusive locks only now, so nobody ever read T" + o.t + "'s uncommitted writes." : " Rigorous 2PL frees every lock only now, so transactions are serialised in commit order.";
      finish(o.t, "committed", 11, `${o.implicit ? `T${o.t} has no more operations (the schedule has no C${o.t}), so it commits.` : `C${o.t}: T${o.t} commits.`}${why}`, o.k);
    } else finish(o.t, "aborted", 11, `A${o.t}: T${o.t} aborts and its writes are undone.`, o.k);
  }
  const ran = history.filter((x) => x.kind === "op" && status.get(x.t) === "committed").map((x) => x.text);
  snap(null, `Done. ${summary(status)} ${stats.waits} wait${stats.waits === 1 ? "" : "s"}${stats.deadlocks.length ? `, ${stats.deadlocks.length} deadlock${stats.deadlocks.length > 1 ? "s" : ""}` : ""}. The committed operations ran in the order ${ran.join(" ") || "(none)"}, which is conflict-serialisable, as 2PL guarantees.`, "done", { waits: stats.waits, deadlocks: stats.deadlocks.length });
  return { steps, stats };
}

function summary(status) {
  const by = (s) => [...status].filter(([, v]) => v === s).map(([t]) => T(t));
  const c = by("committed"), a = by("aborted");
  return `${c.length ? `${list(c)} committed` : "Nobody committed"}${a.length ? `; ${list(a)} ${a.length > 1 ? "were" : "was"} rolled back` : ""}.`;
}

// --- Timestamp ordering -------------------------------------------------------
function timestamps({ seq, txns, items }, thomas, tsMode) {
  const order = tsMode === "number" ? [...txns] : [...new Set(seq.map((o) => o.t))];
  const TS = new Map(order.map((t, i) => [t, tsMode === "number" ? t : i + 1]));
  const R = new Map(items.map((x) => [x, 0])), W = new Map(items.map((x) => [x, 0]));
  const lastWriter = new Map(), readsFrom = [];
  const status = new Map(txns.map((t) => [t, "active"]));
  const marks = seq.map(() => "todo");
  const steps = [], stats = { waits: 0, deadlocks: [], firstWait: null, firstAbort: null, ignored: 0 };
  const snap = (line, note, kind, vars = {}, at = null) => {
    steps.push({
      line, note, kind, vars, at, marks: [...marks],
      items: items.map((x) => ({ item: x, r: R.get(x), w: W.get(x), writer: lastWriter.get(x) ?? null })),
      txns: txns.map((t) => ({ t, ts: TS.get(t), status: status.get(t) })),
      ran: seq.filter((o) => marks[o.k] === "done" && o.item).map((o) => o.k),
    });
  };
  const ts = (t) => TS.get(t);

  function rollback(t, line, note, vars, at) {
    status.set(t, "aborted");
    stats.firstAbort ??= t;
    if (at != null) marks[at] = "fail";
    seq.forEach((o) => { if (o.t === t && marks[o.k] === "todo") marks[o.k] = "skip"; });
    snap(line, note, "abort", vars, at);
    for (const r of readsFrom.filter((x) => x.writer === t && x.reader !== t)) {
      if (status.get(r.reader) === "committed") snap(9, `T${r.reader} read ${r.item} written by T${t} and has already committed, so this schedule is not recoverable: basic timestamp ordering doesn't prevent that.`, "warn", { reader: T(r.reader), writer: T(t), X: r.item });
      else if (status.get(r.reader) === "active") rollback(r.reader, 9, `Cascading rollback: T${r.reader} read ${r.item} written by T${t}, which has just been rolled back, so T${r.reader} read a value that never officially existed and must roll back too.`, { reader: T(r.reader), writer: T(t), X: r.item }, null);
    }
  }

  snap(null, `Start. Timestamps: ${order.map((t) => `TS(T${t}) = ${ts(t)}`).join(", ")} (${tsMode === "number" ? "the transaction number" : "the order the transactions start in"}). A smaller timestamp means older, and the schedule must act as if transactions ran in timestamp order. Every R-TS and W-TS starts at 0.`, "start", Object.fromEntries(order.map((t) => [`TS(T${t})`, ts(t)])));
  for (const o of seq) {
    const t = o.t, x = o.item, op = opText(o);
    if (status.get(t) === "aborted") {
      marks[o.k] = "skip";
      snap(9, `T${t} has been rolled back, so ${op} is skipped (in a real system T${t} would restart with a new, larger timestamp).`, "skip", { op, Ti: T(t) }, o.k);
      continue;
    }
    if (!x) {
      marks[o.k] = "done";
      status.set(t, o.kind === "C" ? "committed" : "aborted");
      snap(8, o.kind === "C" ? `${o.implicit ? `T${t} has no more operations, so it commits` : `C${t}: T${t} commits`}.` : `A${t}: T${t} aborts.`, o.kind === "C" ? "committed" : "aborted", { op, Ti: T(t) }, o.k);
      continue;
    }
    const r = R.get(x), w = W.get(x);
    const vars = { op, Ti: T(t), "TS(Ti)": ts(t), [`R-TS(${x})`]: r, [`W-TS(${x})`]: w };
    if (o.kind === "R") {
      if (ts(t) < w) { rollback(t, 2, `${op}: TS(T${t}) = ${ts(t)} < W-TS(${x}) = ${w}. A younger transaction (T${lastWriter.get(x)}) has already overwritten ${x}, so the value T${t} should have read is gone. T${t} is rolled back.`, vars, o.k); continue; }
      const nr = Math.max(r, ts(t));
      R.set(x, nr);
      marks[o.k] = "done";
      readsFrom.push({ reader: t, writer: lastWriter.get(x) ?? null, item: x });
      snap(3, `${op}: TS(T${t}) = ${ts(t)} ≥ W-TS(${x}) = ${w}, so the read is allowed. R-TS(${x}) becomes max(${r}, ${ts(t)}) = ${nr}.`, "run", { ...vars, [`R-TS(${x})`]: nr }, o.k);
      continue;
    }
    if (ts(t) < r) { rollback(t, 5, `${op}: TS(T${t}) = ${ts(t)} < R-TS(${x}) = ${r}. A younger transaction has already read the old value of ${x}; writing it now would change what that transaction should have seen. T${t} is rolled back.`, vars, o.k); continue; }
    if (ts(t) < w) {
      if (thomas) {
        marks[o.k] = "ignored";
        stats.ignored++;
        snap(6, `${op}: TS(T${t}) = ${ts(t)} < W-TS(${x}) = ${w}, so a younger transaction has already written ${x}. In timestamp order this write would be overwritten straight away and nobody reads it in between (R-TS(${x}) = ${r} ≤ ${ts(t)}), so under Thomas' write rule it is simply ignored and T${t} carries on.`, "ignored", vars, o.k);
      } else rollback(t, 6, `${op}: TS(T${t}) = ${ts(t)} < W-TS(${x}) = ${w}, so a younger transaction has already written ${x} and this write is obsolete. Basic timestamp ordering rolls T${t} back (Thomas' write rule would just ignore the write).`, vars, o.k);
      continue;
    }
    W.set(x, ts(t));
    lastWriter.set(x, t);
    marks[o.k] = "done";
    snap(7, `${op}: TS(T${t}) = ${ts(t)} is at least R-TS(${x}) = ${r} and W-TS(${x}) = ${w}, so nobody younger has used ${x} yet: the write is allowed and W-TS(${x}) ← ${ts(t)}.`, "run", { ...vars, [`W-TS(${x})`]: ts(t) }, o.k);
  }
  snap(null, `Done. ${summary(status)}${stats.ignored ? ` ${stats.ignored} obsolete write${stats.ignored > 1 ? "s were" : " was"} ignored.` : ""} Timestamp ordering never makes anyone wait, so it can't deadlock, but it pays with rollbacks.`, "done", Object.fromEntries(items.flatMap((x) => [[`R-TS(${x})`, R.get(x)], [`W-TS(${x})`, W.get(x)]])));
  return { steps, stats, TS: Object.fromEntries(TS), final: Object.fromEntries(items.map((x) => [x, { r: R.get(x), w: W.get(x) }])) };
}

// --- Validation (optimistic) ----------------------------------------------------
function validation({ seq, txns }) {
  const status = new Map(txns.map((t) => [t, "reading"]));
  const start = new Map(), val = new Map(), fin = new Map();
  const rs = new Map(txns.map((t) => [t, new Set()])), ws = new Map(txns.map((t) => [t, new Set()]));
  const marks = seq.map(() => "todo");
  const steps = [], stats = { waits: 0, deadlocks: [], firstWait: null, firstAbort: null };
  const sorted = (s) => [...s].sort();
  const snap = (line, note, kind, vars = {}, at = null) => steps.push({
    line, note, kind, vars, at, marks: [...marks],
    txns: txns.map((t) => ({ t, status: status.get(t), start: start.get(t) ?? null, val: val.get(t) ?? null, fin: fin.get(t) ?? null, rs: sorted(rs.get(t)), ws: sorted(ws.get(t)) })),
  });
  snap(null, "Start. Every transaction works on private copies and is checked only when it tries to commit. The clock is the position in the schedule (1, 2, 3, …).", "start", {});
  seq.forEach((o, k) => {
    const t = o.t, now = k + 1, op = opText(o);
    if (status.get(t) === "aborted") { marks[k] = "skip"; snap(1, `T${t} has been rolled back, so ${op} is skipped.`, "skip", { op, Ti: T(t) }, k); return; }
    if (!start.has(t)) start.set(t, now);
    if (o.kind === "R" || o.kind === "W") {
      (o.kind === "R" ? rs : ws).get(t).add(o.item);
      marks[k] = "done";
      snap(1, o.kind === "R" ? `${op}: T${t} reads ${o.item}${ws.get(t).has(o.item) ? " from its own local copy" : ""}. ReadSet(T${t}) = {${sorted(rs.get(t)).join(", ")}}.` : `${op}: T${t} writes ${o.item} in its local copy only; nobody else can see it until T${t}'s write phase. WriteSet(T${t}) = {${sorted(ws.get(t)).join(", ")}}.`,
        "run", { op, Ti: T(t), "Start(Ti)": start.get(t), "ReadSet(Ti)": sorted(rs.get(t)), "WriteSet(Ti)": sorted(ws.get(t)) }, k);
      return;
    }
    if (o.kind === "A") { marks[k] = "done"; status.set(t, "aborted"); snap(1, `A${t}: T${t} aborts and throws its local copies away; nothing reached the database.`, "aborted", { Ti: T(t) }, k); return; }
    val.set(t, now);
    status.set(t, "validating");
    const base = { Ti: T(t), "Start(Ti)": start.get(t), "Validation(Ti)": now, "ReadSet(Ti)": sorted(rs.get(t)) };
    snap(2, `${o.implicit ? `T${t} has finished its operations` : `C${t}: T${t} wants to commit`}, so it is validated now: TS(T${t}) = Validation(T${t}) = ${now}. It must not have read anything an earlier-validated transaction changed while T${t} was running.`, "validate", base, k);
    const earlier = txns.filter((x) => x !== t && status.get(x) === "committed" && val.get(x) < now).sort((a, b) => val.get(a) - val.get(b));
    if (!earlier.length) snap(3, `No transaction has validated before T${t}, so there is nothing to check against.`, "validate", base, k);
    for (const x of earlier) {
      const v = { ...base, Tk: T(x), "Finish(Tk)": fin.get(x), "WriteSet(Tk)": sorted(ws.get(x)) };
      if (fin.get(x) < start.get(t)) { snap(4, `Check T${x}: Finish(T${x}) = ${fin.get(x)} < Start(T${t}) = ${start.get(t)}. T${x} was completely done before T${t} began, so they can't interfere.`, "validate", v, k); continue; }
      const both = sorted(ws.get(x)).filter((i) => rs.get(t).has(i));
      if (!both.length) { snap(5, `Check T${x}: it overlapped T${t} in time (Finish(T${x}) = ${fin.get(x)} ≥ Start(T${t}) = ${start.get(t)}), but WriteSet(T${x}) = {${sorted(ws.get(x)).join(", ")}} and ReadSet(T${t}) = {${sorted(rs.get(t)).join(", ")}} don't overlap, so T${t} read nothing T${x} changed.`, "validate", v, k); continue; }
      status.set(t, "aborted");
      stats.firstAbort ??= t;
      marks[k] = "fail";
      snap(6, `Check T${x}: it overlapped T${t} and wrote ${list(both)}, which T${t} read. T${t} may have read the old value, so validation fails and T${t} is rolled back (its local copies are thrown away; the database is untouched).`, "abort", v, k);
      return;
    }
    marks[k] = "done";
    status.set(t, "committed");
    fin.set(t, now);
    snap(7, `Validation passed, so T${t}'s write phase copies ${ws.get(t).size ? `{${sorted(ws.get(t)).join(", ")}}` : "nothing (it only read)"} into the database and it commits. Finish(T${t}) = ${now}.`, "committed", { ...base, "Finish(Ti)": now, "WriteSet(Ti)": sorted(ws.get(t)) }, k);
  });
  snap(null, `Done. ${summary(new Map([...status].map(([t, s]) => [t, s === "committed" ? "committed" : "aborted"])))} Nobody ever waited or held a lock: conflicts were caught at validation instead.`, "done", {});
  return { steps, stats };
}

// Random schedules for practice and fuzzing, with a commit for every transaction.
export function randomSchedule(r = Math.random, { txns = 2 + (r() < 0.4 ? 1 : 0), items = ["A", "B"] } = {}) {
  const per = Array.from({ length: txns }, (_, k) => {
    const len = 2 + Math.floor(r() * 2);
    return [...Array.from({ length: len }, () => `${r() < 0.5 ? "R" : "W"}${k + 1}(${items[Math.floor(r() * items.length)]})`), `C${k + 1}`];
  });
  const out = [];
  while (per.some((p) => p.length)) {
    const live = per.filter((p) => p.length);
    out.push(live[Math.floor(r() * live.length)].shift());
  }
  return out.join(" ");
}
