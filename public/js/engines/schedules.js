// Transaction schedules: conflict and view serialisability, plus recoverability.
// A schedule is written like "R1(A) W2(A) R2(B) W1(B) C1 C2"
// (R = read, W = write, C = commit, A = abort, followed by the transaction number).

export function parseSchedule(text) {
  const ops = [];
  const re = /([RWCA])\s*(\d{1,2})\s*(?:\(\s*([A-Za-z]\w{0,9})\s*\))?/gi;
  const cleaned = String(text).replace(/[;,]/g, " ").trim();
  let m, consumed = 0;
  while ((m = re.exec(cleaned))) {
    if (cleaned.slice(consumed, m.index).trim()) throw new Error(`Can't read "${cleaned.slice(consumed, m.index).trim()}". Write operations like R1(A) W2(B) C1.`);
    consumed = re.lastIndex;
    const kind = m[1].toUpperCase(), t = Number(m[2]), item = m[3] ? m[3].toUpperCase() : null;
    if ((kind === "R" || kind === "W") && !item) throw new Error(`${kind}${t} needs a data item, e.g. ${kind}${t}(A).`);
    if ((kind === "C" || kind === "A") && item) throw new Error(`${kind}${t} doesn't take a data item.`);
    ops.push({ kind, t, item, i: ops.length });
  }
  if (cleaned.slice(consumed).trim()) throw new Error(`Can't read "${cleaned.slice(consumed).trim()}".`);
  if (!ops.length) throw new Error("Enter a schedule, e.g. R1(A) W2(A) R2(B) W1(B).");
  if (ops.length > 30) throw new Error("Use at most 30 operations.");
  const txns = [...new Set(ops.map((o) => o.t))].sort((a, b) => a - b);
  if (txns.length > 6) throw new Error("Use at most 6 transactions.");
  for (const t of txns) {
    const ends = ops.filter((o) => o.t === t && (o.kind === "C" || o.kind === "A"));
    if (ends.length > 1) throw new Error(`T${t} commits or aborts more than once.`);
    if (ends.length && ops.some((o) => o.t === t && o.i > ends[0].i)) throw new Error(`T${t} has operations after it ${ends[0].kind === "C" ? "commits" : "aborts"}.`);
  }
  return { ops, txns };
}

export const opText = (o) => (o.item ? `${o.kind}${o.t}(${o.item})` : `${o.kind}${o.t}`);

export function conflicts(ops) {
  const out = [];
  for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) {
    const a = ops[i], b = ops[j];
    if (a.t !== b.t && a.item && a.item === b.item && (a.kind === "W" || b.kind === "W")) out.push({ a, b, from: a.t, to: b.t });
  }
  return out;
}

function findCycle(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, edges.filter((e) => e.from === n).map((e) => e.to)]));
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

// Kahn's algorithm, always taking the lowest-numbered ready transaction.
function topoOrder(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const order = [];
  const ready = nodes.filter((n) => !indeg.get(n));
  while (ready.length) {
    ready.sort((a, b) => a - b);
    const n = ready.shift();
    order.push(n);
    for (const e of edges.filter((x) => x.from === n)) { indeg.set(e.to, indeg.get(e.to) - 1); if (!indeg.get(e.to)) ready.push(e.to); }
  }
  return order.length === nodes.length ? order : null;
}

// View equivalence: same initial reads, same reads-from, same final writes.
function viewSignature(ops) {
  const lastWriter = new Map(), reads = [];
  for (const o of ops) {
    if (o.kind === "R") reads.push(`${o.t}:${o.item}<-${lastWriter.get(o.item) ?? "init"}:${reads.filter((r) => r.startsWith(`${o.t}:${o.item}<-`)).length}`);
    if (o.kind === "W") lastWriter.set(o.item, o.t);
  }
  return `${reads.sort().join("|")}#${[...lastWriter].sort().map(([k, v]) => `${k}=${v}`).join(",")}`;
}

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export function analyse(text) {
  const { ops, txns } = parseSchedule(text);
  const data = ops.filter((o) => o.kind === "R" || o.kind === "W");
  const pairs = conflicts(data);
  const edges = [];
  const steps = pairs.map((p) => {
    const isNew = !edges.some((e) => e.from === p.from && e.to === p.to);
    if (isNew) edges.push({ from: p.from, to: p.to });
    return { pair: p, note: `${opText(p.a)} before ${opText(p.b)}: same item ${p.a.item}, different transactions, and at least one write, so they conflict. ${isNew ? `Add edge T${p.from} → T${p.to}.` : `(Edge T${p.from} → T${p.to} already exists.)`}` };
  });
  const cycle = findCycle(txns, edges);
  const order = cycle ? null : topoOrder(txns, edges);
  const conflictSerializable = !cycle;

  // View serialisability: try every serial order (at most 6! = 720).
  let viewOrder = null;
  if (conflictSerializable) viewOrder = order;
  else {
    const target = viewSignature(data);
    for (const perm of permutations(txns)) {
      const serial = perm.flatMap((t) => data.filter((o) => o.t === t));
      if (viewSignature(serial) === target) { viewOrder = perm; break; }
    }
  }
  const blindWrites = data.some((o) => o.kind === "W" && !data.some((r) => r.kind === "R" && r.t === o.t && r.item === o.item && r.i < o.i));

  return { ops, txns, pairs, edges, steps, cycle, order, conflictSerializable, viewSerializable: !!viewOrder, viewOrder, blindWrites, recovery: recoverability(ops, txns) };
}

// Recoverable ⊇ cascadeless ⊇ strict. Needs commit/abort points to judge.
export function recoverability(ops, txns) {
  const end = new Map(ops.filter((o) => o.kind === "C" || o.kind === "A").map((o) => [o.t, o]));
  if (txns.some((t) => !end.has(t))) return { known: false, note: "Add a commit (C1) or abort (A1) for every transaction to check recoverability." };
  const problems = { recoverable: [], cascadeless: [], strict: [] };
  ops.forEach((o, idx) => {
    if (!o.item) return;
    // The most recent write to this item by another transaction.
    const prior = ops.slice(0, idx).reverse().find((x) => x.kind === "W" && x.item === o.item && x.t !== o.t);
    if (!prior) return;
    const writerEnd = end.get(prior.t);
    const writerDone = writerEnd.i < idx;
    if (!writerDone) {
      problems.strict.push(`${opText(o)} touches ${o.item} while T${prior.t}, which wrote it, hasn't finished.`);
      if (o.kind === "R") {
        problems.cascadeless.push(`${opText(o)} reads ${o.item} written by T${prior.t} before T${prior.t} commits (a dirty read).`);
        const readerEnd = end.get(o.t);
        if (readerEnd.kind === "C" && (writerEnd.kind === "A" || readerEnd.i < writerEnd.i)) problems.recoverable.push(`T${o.t} reads from T${prior.t} but commits ${writerEnd.kind === "A" ? `even though T${prior.t} aborts` : `before T${prior.t} does`}.`);
      }
    }
  });
  return {
    known: true,
    recoverable: !problems.recoverable.length,
    cascadeless: !problems.cascadeless.length,
    strict: !problems.strict.length,
    problems,
  };
}

export function randomSchedule(r = Math.random) {
  const nT = 2 + (r() < 0.4 ? 1 : 0), items = ["A", "B"];
  const per = Array.from({ length: nT }, (_, k) => {
    const len = 2 + Math.floor(r() * 2);
    return Array.from({ length: len }, () => `${r() < 0.5 ? "R" : "W"}${k + 1}(${items[Math.floor(r() * items.length)]})`);
  });
  const out = [];
  while (per.some((p) => p.length)) {
    const live = per.filter((p) => p.length);
    out.push(live[Math.floor(r() * live.length)].shift());
  }
  return out.join(" ");
}

export const EXAMPLES = [
  ["Conflict-serialisable", "R1(A) W1(A) R2(A) W2(A) R1(B) W1(B) R2(B) W2(B) C1 C2"],
  ["Not serialisable (lost update)", "R1(A) R2(A) W1(A) W2(A) C1 C2"],
  ["View- but not conflict-serialisable", "R1(A) W2(A) W1(A) W3(A) C1 C2 C3"],
  ["Not recoverable", "W1(A) R2(A) C2 C1"],
  ["Recoverable, not cascadeless", "W1(A) R2(A) C1 C2"],
];
