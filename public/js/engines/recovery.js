// Log-based crash recovery, step by step.
//
// Log records (LSN = position in the log, from 1):
//   <T0 start>   <T0, A, 1000, 950> (update: item, old, new)   <T0, A, 1000> (redo-only / CLR)
//   <T0 commit>  <T0 abort>   <checkpoint {T0, T1}> (active transactions), optionally "dirty A@3 B@5"
//
// Two algorithms:
// - undoRedo: Silberschatz's immediate-modification recovery with checkpoints. The
//   checkpoint flushed every modified block, so redo starts there and repeats
//   history; the undo pass then rolls back the undo-list backwards, logging
//   redo-only records and finally <Ti abort>.
// - aries: analysis (transaction table + dirty page table from the checkpoint),
//   redo from RedoLSN, and undo of every loser at once with CLRs and UndoNextLSN.
//   Each data item is its own page.

export const ALGORITHMS = {
  undoRedo: {
    name: "Undo/redo with checkpoints (Silberschatz)",
    code: [
      "find the last <checkpoint L> record",
      "undo-list ← L  // active at the checkpoint",
      "for each record r from the checkpoint forward  // redo pass",
      "  if r = <Ti, X, V1, V2> or <Ti, X, V> then write the new value to X",
      "  if r = <Ti start> then add Ti to undo-list",
      "  if r = <Ti commit> or <Ti abort> then remove Ti from undo-list",
      "for each record r from the end backward  // undo pass",
      "  if r = <Ti, X, V1, V2> and Ti ∈ undo-list then",
      "    X ← V1; append <Ti, X, V1>  // redo-only",
      "  if r = <Ti start> and Ti ∈ undo-list then",
      "    append <Ti abort>; remove Ti from undo-list",
      "  stop when undo-list is empty",
    ],
  },
  aries: {
    name: "ARIES",
    code: [
      "// analysis pass",
      "TT ← checkpoint's transactions; DPT ← its dirty pages",
      "for each record r after the checkpoint",
      "  if r = <Ti start> then add Ti to TT",
      "  if r writes page P then TT[Ti].lastLSN ← r.LSN; if P ∉ DPT then DPT[P] ← r.LSN",
      "  if r = <Ti commit> or <Ti abort> then remove Ti from TT",
      "// redo pass: RedoLSN ← min RecLSN in DPT",
      "for each update or CLR r from RedoLSN forward",
      "  if P ∉ DPT or r.LSN < RecLSN(P) or PageLSN(P) ≥ r.LSN then skip",
      "  else reapply r; PageLSN(P) ← r.LSN",
      "// undo pass: ToUndo ← lastLSN of every loser in TT",
      "while ToUndo ≠ ∅: r ← largest LSN in ToUndo",
      "  if r is a CLR then add r.UndoNextLSN  // already undone",
      "  if r is an update then undo it; append CLR(UndoNext = r.PrevLSN); add r.PrevLSN",
      "  if r = <Ti start> then append <Ti abort>  // fully rolled back",
    ],
  },
};

const isWrite = (r) => r.kind === "update" || r.kind === "clr";
const tx = (s) => `T${Number(s.slice(1))}`;
const setText = (xs) => `{${xs.join(", ")}}`;

export function recText(r) {
  switch (r.kind) {
    case "update": return `<${r.t}, ${r.item}, ${r.old}, ${r.val}>`;
    case "clr": return `<${r.t}, ${r.item}, ${r.val}>`;
    case "checkpoint": return `<checkpoint ${setText(r.list)}${r.dirty.length ? ` dirty ${r.dirty.map((d) => `${d.item}@${d.rec}`).join(" ")}` : ""}>`;
    default: return `<${r.t} ${r.kind}>`;
  }
}

function parseRecord(line, lsn) {
  if (!/^<.*>$/.test(line)) throw new Error(`Line ${lsn}: wrap each record in < >, e.g. <T0 start>.`);
  const s = line.slice(1, -1).trim();
  let m;
  if ((m = /^checkpoint\b\s*\{?([^}]*?)\}?\s*(?:dirty\s+(.*))?$/i.exec(s))) {
    const list = m[1].split(/[\s,]+/).filter(Boolean).map((t) => {
      if (!/^T\d{1,2}$/i.test(t)) throw new Error(`Line ${lsn}: "${t}" isn't a transaction name like T1.`);
      return tx(t);
    });
    const dirty = (m[2] ?? "").split(/[\s,]+/).filter(Boolean).map((d) => {
      const x = /^([A-Za-z]\w{0,7})@(\d+)$/.exec(d);
      if (!x) throw new Error(`Line ${lsn}: write dirty pages as item@LSN, e.g. dirty A@3.`);
      return { item: x[1].toUpperCase(), rec: Number(x[2]) };
    });
    return { lsn, kind: "checkpoint", list: [...new Set(list)], dirty };
  }
  if ((m = /^(T\d{1,2})\s+(start|commit|abort)$/i.exec(s))) return { lsn, kind: m[2].toLowerCase(), t: tx(m[1]) };
  const parts = s.split(/\s*,\s*/);
  if ((parts.length === 3 || parts.length === 4) && /^T\d{1,2}$/i.test(parts[0]) && /^[A-Za-z]\w{0,7}$/.test(parts[1]) && parts.slice(2).every((p) => /^-?\d{1,7}$/.test(p))) {
    const [t, item, a, b] = parts;
    return parts.length === 4
      ? { lsn, kind: "update", t: tx(t), item: item.toUpperCase(), old: Number(a), val: Number(b) }
      : { lsn, kind: "clr", t: tx(t), item: item.toUpperCase(), val: Number(a) };
  }
  throw new Error(`Line ${lsn}: can't read "${line}". Use <T1 start>, <T1, A, 100, 150>, <T1, A, 100>, <T1 commit>, <T1 abort> or <checkpoint {T1}>.`);
}

// Parse and check the log the way a real system would have written it:
// every record belongs to a started transaction, checkpoints list exactly the
// active ones, and rollbacks undo the latest write first. Adds PrevLSN to every
// record and UndoNextLSN to every CLR.
export function parseLog(text) {
  const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Type a log, one record per line, e.g. <T0 start>.");
  if (lines.length > 40) throw new Error("Use at most 40 log records.");
  const recs = lines.map((l, i) => parseRecord(l, i + 1));
  const active = new Set(), ended = new Map(), startAt = new Map(), last = new Map(), stacks = new Map();
  for (const r of recs) {
    if (r.kind === "checkpoint") {
      const want = [...active].sort(), got = [...r.list].sort();
      if (want.join() !== got.join()) throw new Error(`LSN ${r.lsn}: a checkpoint lists exactly the transactions active at that moment, ${setText(want)}, not ${setText(got)}.`);
      for (const d of r.dirty) {
        const u = recs[d.rec - 1];
        if (!u || d.rec >= r.lsn || !isWrite(u) || u.item !== d.item) throw new Error(`LSN ${r.lsn}: dirty ${d.item}@${d.rec} must point to an earlier record that wrote ${d.item}.`);
      }
      if (new Set(r.dirty.map((d) => d.item)).size !== r.dirty.length) throw new Error(`LSN ${r.lsn}: list each dirty page once.`);
      continue;
    }
    const t = r.t;
    if (r.kind === "start") {
      if (startAt.has(t)) throw new Error(`LSN ${r.lsn}: ${t} has already started.`);
      active.add(t); startAt.set(t, r.lsn); last.set(t, r.lsn); stacks.set(t, []);
      r.prev = null;
      continue;
    }
    if (!active.has(t)) throw new Error(ended.has(t) ? `LSN ${r.lsn}: ${t} already ${ended.get(t)}, so it can't log anything else.` : `LSN ${r.lsn}: ${t} has no <${t} start> before this record.`);
    r.prev = last.get(t);
    last.set(t, r.lsn);
    const stack = stacks.get(t);
    if (r.kind === "update") stack.push(r.lsn);
    else if (r.kind === "clr") {
      const top = recs[stack.at(-1) - 1];
      if (!top || top.item !== r.item || top.old !== r.val) throw new Error(`LSN ${r.lsn}: a redo-only record undoes ${t}'s latest write that hasn't been undone yet${top ? `, ${recText(top)}, so it should be <${t}, ${top.item}, ${top.old}>` : ", but there is none"}.`);
      stack.pop();
      r.undoNext = stack.length ? stack.at(-1) : startAt.get(t);
    } else {
      if (r.kind === "abort" && stack.length) {
        const u = recs[stack.at(-1) - 1];
        throw new Error(`LSN ${r.lsn}: ${t} aborts but its write ${recText(u)} was never undone. A rollback logs a redo-only record <${t}, ${u.item}, ${u.old}> for each write before <${t} abort>.`);
      }
      active.delete(t);
      ended.set(t, r.kind === "commit" ? "committed" : "aborted");
    }
  }
  if (new Set(recs.filter(isWrite).map((r) => r.item)).size > 8) throw new Error("Use at most 8 data items.");
  return recs;
}

export function parseValues(text) {
  const out = {};
  for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) {
    const m = /^([A-Za-z]\w{0,7})\s*=\s*(-?\d{1,7})$/.exec(part);
    if (!m) throw new Error(`Can't read "${part}". Write initial values like A=1000, B=2000.`);
    out[m[1].toUpperCase()] = Number(m[2]);
  }
  return out;
}

// Initial values, filling in any item not given from its first logged old value.
export function startValues(records, initial = {}) {
  const v = { ...initial };
  for (const r of records) if (isWrite(r) && !(r.item in v)) v[r.item] = r.kind === "update" ? r.old : r.val;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
}

// What a correct recovery must produce: only the writes of transactions that
// committed before the crash.
export function expectedValues(records, crashAt, initial = {}) {
  const prefix = records.slice(0, crashAt), v = startValues(records, initial);
  const committed = new Set(prefix.filter((r) => r.kind === "commit").map((r) => r.t));
  for (const r of prefix) if (isWrite(r) && committed.has(r.t)) v[r.item] = r.val;
  return v;
}

export function recover(records, crashAt = records.length, algo = "undoRedo", initial = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  const k = Math.max(0, Math.min(records.length, crashAt));
  const prefix = records.slice(0, k).map((r) => ({ ...r }));
  const values = startValues(records, initial);
  const fate = new Map(prefix.filter((r) => r.kind === "commit" || r.kind === "abort").map((r) => [r.t, r.kind === "commit" ? "committed" : "aborted"]));
  const out = (algo === "aries" ? aries : undoRedo)(prefix, values, fate);
  return { ...out, crashAt: k, committed: [...fate].filter(([, f]) => f === "committed").map(([t]) => t).sort(), aborted: [...fate].filter(([, f]) => f === "aborted").map(([t]) => t).sort() };
}

function lastOf(log, t) {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].t === t) return log[i].lsn;
  return null;
}

function crashNote(k, extra) {
  return k ? `The system crashed after LSN ${k}. Memory is lost; only the log on stable storage survives. ${extra}` : "The log is empty, so there's nothing to recover.";
}

function undoRedo(prefix, values, fate) {
  const log = [...prefix], steps = [];
  const ck = prefix.findLastIndex((r) => r.kind === "checkpoint");
  for (let i = 0; i < ck; i++) if (isWrite(prefix[i])) values[prefix[i].item] = prefix[i].val;
  let undo = [];
  const redone = new Set(), losers = [];
  const snap = (ptr, phase, line, note, extra = {}) => steps.push({
    ptr, phase, line, note, values: { ...values }, list: [...undo], shown: log.length,
    vars: { pass: phase, LSN: ptr != null ? log[ptr].lsn : null, r: ptr != null ? recText(log[ptr]) : null, "undo-list": undo.length ? setText(undo) : "∅", ...extra.vars },
    ...extra,
  });
  snap(null, "crash", null, crashNote(prefix.length, ck >= 0
    ? `The disk holds every write up to the checkpoint (a checkpoint flushes all modified blocks); later writes may or may not have reached it, so here they're shown as missing and redo puts them back.`
    : "Any of the logged writes may or may not have reached the disk, so redo repeats them all."));
  if (!prefix.length) { steps.at(-1).done = true; return { log, steps, values, undone: [], redone: [] }; }

  if (ck >= 0) {
    undo = [...prefix[ck].list];
    snap(ck, "redo", [1, 2], `The last checkpoint is LSN ${ck + 1}. undo-list ← ${setText(undo)}: those transactions were active when it was taken, so they are suspects until we see them finish. Everything before it is already on disk, so redo starts here.`);
  } else snap(null, "redo", [1, 2], "There's no checkpoint, so the redo pass starts at the first record and the undo-list starts empty.");

  let first = true;
  for (let i = ck + 1; i < prefix.length; i++) {
    const r = prefix[i], text = recText(r);
    if (isWrite(r)) {
      const from = values[r.item];
      values[r.item] = r.val;
      redone.add(r.t);
      let note;
      if (r.kind === "clr") note = `Redo the redo-only record ${text}: ${r.item} ← ${r.val}. It was logged while ${r.t} was being rolled back before the crash, so redoing it repeats that rollback.`;
      else if (first) note = `Redo ${text}: ${r.item} ${from} → ${r.val}. Redo repeats history for every transaction, even ones that will be undone later, so the database is exactly as it was at the crash.`;
      else note = `Redo ${text}: ${r.item} ${from} → ${r.val}.${undo.includes(r.t) ? ` ${r.t} hasn't finished yet, but its write is redone anyway; the undo pass rolls it back if it never finishes.` : ""}`;
      if (r.kind === "update") first = false;
      snap(i, "redo", 4, note, { changed: r.item, from, vars: { [r.item]: r.val } });
    } else if (r.kind === "start") {
      undo.push(r.t);
      snap(i, "redo", 5, `${text}: ${r.t} started after the checkpoint, so add it to the undo-list. Unless we later see it commit or abort, it will be undone.`);
    } else if (r.kind === "commit" || r.kind === "abort") {
      undo = undo.filter((t) => t !== r.t);
      snap(i, "redo", 6, r.kind === "commit"
        ? `${text}: ${r.t} committed, so it's finished. Remove it from the undo-list: its writes (just redone) must survive.`
        : `${text}: ${r.t} aborted before the crash and its rollback is already in the log as redo-only records (redone above), so it's finished too: remove it from the undo-list.`);
    }
  }
  losers.push(...[...undo].sort());
  if (!undo.length) {
    snap(null, "done", 7, "Redo pass done and the undo-list is empty: every transaction finished before the crash, so there's nothing to undo. Recovery is complete.", { done: true });
    return { log, steps, values, undone: [], redone: [...redone].sort() };
  }
  snap(null, "undo", 7, `Redo pass done. The undo-list is ${setText(undo)}: ${undo.length > 1 ? "these transactions" : "this transaction"} never committed or aborted, so the undo pass scans the log backwards from the end and rolls back their writes.`);
  for (let i = prefix.length - 1; i >= 0 && undo.length; i--) {
    const r = prefix[i], text = recText(r);
    if (r.kind === "update" && undo.includes(r.t)) {
      const from = values[r.item];
      values[r.item] = r.old;
      log.push({ lsn: log.length + 1, kind: "clr", t: r.t, item: r.item, val: r.old, prev: lastOf(log, r.t), byRecovery: true });
      snap(i, "undo", [8, 9], `${text}: ${r.t} is in the undo-list, so undo this write: ${r.item} ← ${r.old} (the old value), and append the redo-only record <${r.t}, ${r.item}, ${r.old}>. If we crash again during recovery, redo repeats this undo instead of losing it.`, { changed: r.item, from, appended: true, vars: { [r.item]: r.old } });
    } else if (r.kind === "start" && undo.includes(r.t)) {
      undo = undo.filter((t) => t !== r.t);
      log.push({ lsn: log.length + 1, kind: "abort", t: r.t, prev: lastOf(log, r.t), byRecovery: true });
      snap(i, "undo", [10, 11], `Reached ${text}: every write of ${r.t} has been undone, so append <${r.t} abort> and remove ${r.t} from the undo-list.${undo.length ? ` Still to undo: ${setText(undo)}.` : " The undo-list is now empty, so the undo pass stops here."}`, { appended: true });
    } else {
      let why;
      if (r.kind === "clr") why = `${text} is a redo-only record. Those are never undone, so skip it.`;
      else if (r.kind === "update") why = `${text}: ${r.t} isn't in the undo-list (it ${fate.get(r.t) ?? "finished"}), so leave this write alone.`;
      else why = `${text}: nothing to undo here; keep scanning backwards.`;
      snap(i, "undo", 8, why);
    }
  }
  snap(null, "done", 12, `Recovery complete: ${Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ")}. Committed transactions keep their writes and ${setText(losers)} ${losers.length > 1 ? "were" : "was"} rolled back. New transactions can start.`, { done: true });
  return { log, steps, values, undone: losers, redone: [...redone].sort() };
}

function aries(prefix, values, fate) {
  const log = [...prefix], steps = [];
  const ck = prefix.findLastIndex((r) => r.kind === "checkpoint");
  // Tables as they stand at the checkpoint.
  const ckTables = () => {
    const tt = new Map(), dpt = new Map();
    if (ck >= 0) {
      for (const t of prefix[ck].list) tt.set(t, lastOf(prefix.slice(0, ck), t));
      for (const d of prefix[ck].dirty) dpt.set(d.item, d.rec);
    }
    return { tt, dpt };
  };
  // A silent analysis first, to know what the disk holds at the crash: a page
  // in the final DPT has the writes before its RecLSN; any other page has all.
  const final = ckTables();
  for (let i = ck + 1; i < prefix.length; i++) if (isWrite(prefix[i]) && !final.dpt.has(prefix[i].item)) final.dpt.set(prefix[i].item, prefix[i].lsn);
  const pageLSN = Object.fromEntries(Object.keys(values).map((k) => [k, 0]));
  for (const r of prefix) if (isWrite(r) && (!final.dpt.has(r.item) || r.lsn < final.dpt.get(r.item))) { values[r.item] = r.val; pageLSN[r.item] = r.lsn; }

  let { tt, dpt } = ckTables();
  let toUndo = [], redoLSN = null;
  const redone = new Set();
  const ttText = () => [...tt].map(([t, l]) => `${t}:${l}`).join(", ") || "∅";
  const dptText = () => [...dpt].map(([p, l]) => `${p}:${l}`).join(", ") || "∅";
  const snap = (ptr, phase, line, note, extra = {}) => steps.push({
    ptr, phase, line, note, values: { ...values }, pageLSN: { ...pageLSN }, shown: log.length,
    tt: [...tt].map(([t, lastLSN]) => ({ t, lastLSN })), dpt: [...dpt].map(([item, rec]) => ({ item, rec })), toUndo: [...toUndo].sort((a, b) => b - a), redoLSN,
    vars: { pass: phase, LSN: ptr != null ? log[ptr].lsn : null, r: ptr != null ? recText(log[ptr]) : null, TT: ttText(), DPT: dptText(), ...(phase === "undo" ? { ToUndo: setText([...toUndo].sort((a, b) => b - a)) } : {}), ...(redoLSN != null ? { RedoLSN: redoLSN } : {}), ...extra.vars },
    ...extra,
  });
  snap(null, "crash", null, crashNote(prefix.length, "The disk holds some of the logged writes but not necessarily all: the analysis pass works out which pages might be out of date."));
  if (!prefix.length) { steps.at(-1).done = true; return { log, steps, values, undone: [], redone: [] }; }

  if (ck >= 0) snap(ck, "analysis", [1, 2], `Analysis starts at the checkpoint, LSN ${ck + 1}. It recorded the transaction table TT = ${ttText()} (each active transaction with its lastLSN) and the dirty page table DPT = ${dptText()}${dpt.size ? " (each dirty page with its RecLSN, the first change that may not be on disk)" : ": every page was clean then"}.`);
  else snap(null, "analysis", [1, 2], "There's no checkpoint, so analysis starts at LSN 1 with an empty transaction table and dirty page table.");
  for (let i = ck + 1; i < prefix.length; i++) {
    const r = prefix[i], text = recText(r);
    if (r.kind === "start") { tt.set(r.t, r.lsn); snap(i, "analysis", 4, `${text}: add ${r.t} to the transaction table with lastLSN ${r.lsn}.`); }
    else if (isWrite(r)) {
      tt.set(r.t, r.lsn);
      const had = dpt.get(r.item);
      if (had == null) dpt.set(r.item, r.lsn);
      snap(i, "analysis", 5, `${text}: ${r.t}'s lastLSN ← ${r.lsn}. ${had == null ? `Page ${r.item} isn't in the DPT, so add it with RecLSN ${r.lsn}: this is the earliest change to ${r.item} that might not be on disk.` : `Page ${r.item} is already dirty since LSN ${had}, so the DPT doesn't change.`}`);
    } else if (r.kind === "commit" || r.kind === "abort") {
      tt.delete(r.t);
      snap(i, "analysis", 6, r.kind === "commit" ? `${text}: ${r.t} committed, so it's a winner: remove it from the TT.` : `${text}: ${r.t} aborted and its rollback is already logged as CLRs, so remove it from the TT.`);
    }
  }
  const losers = [...tt.keys()].sort();
  redoLSN = dpt.size ? Math.min(...dpt.values()) : null;
  snap(null, "redo", 7, `Analysis done. ${losers.length ? `Losers (still in the TT): ${setText(losers)}.` : "No losers: every transaction finished."} ${redoLSN != null ? `RedoLSN = the smallest RecLSN in the DPT = ${redoLSN}. No earlier write can be missing from disk, so redo starts there.` : "The DPT is empty, so every logged write is already on disk and redo has nothing to do."}`);
  if (redoLSN != null) for (let i = redoLSN - 1; i < prefix.length; i++) {
    const r = prefix[i], text = recText(r);
    if (!isWrite(r)) continue;
    const rec = dpt.get(r.item);
    if (rec == null) snap(i, "redo", 9, `${text}: page ${r.item} isn't in the DPT, so this write is already on disk. Skip.`);
    else if (r.lsn < rec) snap(i, "redo", 9, `${text}: RecLSN(${r.item}) = ${rec} is after LSN ${r.lsn}, so the page was flushed after this write and already has it. Skip.`);
    else if (pageLSN[r.item] >= r.lsn) snap(i, "redo", 9, `${text}: PageLSN(${r.item}) = ${pageLSN[r.item]} ≥ ${r.lsn}, so the page on disk already has this write. Skip.`);
    else {
      const from = values[r.item];
      values[r.item] = r.val;
      pageLSN[r.item] = r.lsn;
      redone.add(r.t);
      snap(i, "redo", 10, `${text}: ${r.item} is dirty since LSN ${rec} and the page's PageLSN is older than ${r.lsn}, so reapply it: ${r.item} ${from} → ${r.val}, PageLSN ← ${r.lsn}. ARIES repeats history, losers included.`, { changed: r.item, from, vars: { [r.item]: r.val } });
    }
  }
  if (!losers.length) {
    snap(null, "done", 11, "Redo done and there are no losers, so there's nothing to undo. Recovery is complete.", { done: true });
    return { log, steps, values, undone: [], redone: [...redone].sort() };
  }
  toUndo = losers.map((t) => tt.get(t));
  snap(null, "undo", 11, `Undo pass: ToUndo ← ${setText([...toUndo].sort((a, b) => b - a))}, the lastLSN of each loser. ARIES undoes every loser in one backward sweep, always taking the largest LSN next.`);
  while (toUndo.length) {
    const lsn = Math.max(...toUndo);
    toUndo = toUndo.filter((x) => x !== lsn);
    const r = log[lsn - 1], text = recText(r);
    if (r.kind === "clr") {
      toUndo.push(r.undoNext);
      snap(lsn - 1, "undo", [12, 13], `LSN ${lsn} is a CLR, ${text}: that undo already happened before the crash, so don't repeat it; jump to its UndoNextLSN ${r.undoNext}.`);
    } else if (r.kind === "update") {
      const from = values[r.item];
      values[r.item] = r.old;
      log.push({ lsn: log.length + 1, kind: "clr", t: r.t, item: r.item, val: r.old, prev: lastOf(log, r.t), undoNext: r.prev, byRecovery: true });
      tt.set(r.t, log.length);
      toUndo.push(r.prev);
      snap(lsn - 1, "undo", [12, 14], `LSN ${lsn} is the largest in ToUndo: undo ${text}, so ${r.item} ← ${r.old}, and append the CLR <${r.t}, ${r.item}, ${r.old}> with UndoNextLSN ${r.prev}. A crash during recovery will then skip straight past this write instead of undoing it twice.`, { changed: r.item, from, appended: true, vars: { [r.item]: r.old } });
    } else if (r.kind === "start") {
      tt.delete(r.t);
      log.push({ lsn: log.length + 1, kind: "abort", t: r.t, prev: lastOf(log, r.t), byRecovery: true });
      snap(lsn - 1, "undo", [12, 15], `LSN ${lsn} is <${r.t} start>: ${r.t} is fully rolled back. Append <${r.t} abort> (ARIES's end record) and drop it from the TT.${toUndo.length ? "" : " ToUndo is empty, so the undo pass is over."}`, { appended: true });
    }
  }
  snap(null, "done", null, `Recovery complete: ${Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ")}. Winners keep their writes and ${setText(losers)} ${losers.length > 1 ? "were" : "was"} rolled back.`, { done: true });
  return { log, steps, values, undone: losers, redone: [...redone].sort() };
}

// A random log written under strict two-phase locking (no transaction writes an
// item another unfinished transaction has written), with normal rollbacks,
// checkpoints and a crash point. Values are multiples of 10.
export function randomLog(r = Math.random, { dirty = true, txns = 2 + Math.floor(r() * 3), items = "ABCD".slice(0, 2 + Math.floor(r() * 3)) } = {}) {
  const names = [...items];
  const val = () => 10 * (5 + Math.floor(r() * 90));
  const values = Object.fromEntries(names.map((x) => [x, val()]));
  const init = { ...values };
  const recs = [];
  const add = (rec) => { recs.push({ lsn: recs.length + 1, ...rec }); return recs.at(-1); };
  const plan = Array.from({ length: txns }, (_, i) => ({ t: `T${i + 1}`, ops: 1 + Math.floor(r() * 3), state: "new", wrote: [] }));
  const locks = new Map();
  for (let guard = 0; guard < 200 && plan.some((p) => p.state === "new" || p.state === "active"); guard++) {
    if (recs.length && r() < 0.07 && recs.length < 30) {
      const list = plan.filter((p) => p.state === "active" || p.state === "stuck").map((p) => p.t);
      const d = [];
      if (dirty) for (const x of names) {
        const ws = recs.filter((q) => (q.kind === "update" || q.kind === "clr") && q.item === x);
        if (ws.length && r() < 0.4) d.push({ item: x, rec: ws[Math.floor(r() * ws.length)].lsn });
      }
      add({ kind: "checkpoint", list, dirty: d });
      continue;
    }
    const live = plan.filter((p) => p.state === "new" || p.state === "active");
    const p = live[Math.floor(r() * live.length)];
    if (p.state === "new") { add({ kind: "start", t: p.t }); p.state = "active"; continue; }
    if (p.ops > 0) {
      const free = names.filter((x) => !locks.has(x) || locks.get(x) === p.t);
      if (!free.length) continue;
      const x = free[Math.floor(r() * free.length)];
      let nv = val();
      if (nv === values[x]) nv += 5;
      p.wrote.push(add({ kind: "update", t: p.t, item: x, old: values[x], val: nv }));
      values[x] = nv;
      locks.set(x, p.t);
      p.ops--;
      continue;
    }
    const f = r();
    if (f < 0.6) { add({ kind: "commit", t: p.t }); p.state = "done"; }
    else if (f < 0.8) {
      for (const w of [...p.wrote].reverse()) { add({ kind: "clr", t: p.t, item: w.item, val: w.old }); values[w.item] = w.old; }
      add({ kind: "abort", t: p.t });
      p.state = "done";
    } else { p.state = "stuck"; continue; } // never finishes: it'll be a loser
    for (const [x, t] of locks) if (t === p.t) locks.delete(x);
  }
  const text = recs.map(recText).join("\n");
  const records = parseLog(text);
  return { text, records, init, initText: Object.entries(init).map(([k, v]) => `${k}=${v}`).join(", "), crash: 1 + Math.floor(r() * records.length) };
}

const SILBERSCHATZ_TWO = ["<T0 start>", "<T0, A, 1000, 950>", "<T0, B, 2000, 2050>", "<T0 commit>", "<T1 start>", "<T1, C, 700, 600>", "<T1 commit>"].join("\n");

export const EXAMPLES = {
  checkpoint: {
    name: "Checkpoint {T0, T1}, T2 unfinished (Silberschatz)",
    log: ["<T0 start>", "<T0, B, 2000, 2050>", "<T1 start>", "<checkpoint {T0, T1}>", "<T1, C, 700, 600>", "<T1 commit>", "<T2 start>", "<T2, A, 500, 400>", "<T0, B, 2000>", "<T0 abort>"].join("\n"),
    init: "A=500, B=2000, C=700", algo: "undoRedo",
  },
  caseA: { name: "Crash during T0 (Silberschatz case a)", log: SILBERSCHATZ_TWO, init: "A=1000, B=2000, C=700", crash: 3, algo: "undoRedo" },
  caseB: { name: "Crash during T1 (Silberschatz case b)", log: SILBERSCHATZ_TWO, init: "A=1000, B=2000, C=700", crash: 6, algo: "undoRedo" },
  caseC: { name: "Crash after both commit (Silberschatz case c)", log: SILBERSCHATZ_TWO, init: "A=1000, B=2000, C=700", crash: 7, algo: "undoRedo" },
  aries: {
    name: "ARIES with a fuzzy checkpoint (after Elmasri & Navathe)",
    log: ["<T1 start>", "<T1, C, 10, 15>", "<T2 start>", "<T2, B, 20, 25>", "<checkpoint {T1, T2} dirty C@2 B@4>", "<T1 commit>", "<T3 start>", "<T3, A, 30, 35>", "<T2, C, 15, 18>", "<T2 commit>"].join("\n"),
    init: "A=30, B=20, C=10", algo: "aries",
  },
  rollback: {
    name: "Crash in the middle of a rollback",
    log: ["<T1 start>", "<T1, A, 100, 150>", "<T2 start>", "<T2, B, 200, 250>", "<checkpoint {T1, T2}>", "<T2, C, 300, 350>", "<T1 commit>", "<T2, C, 300>"].join("\n"),
    init: "A=100, B=200, C=300", algo: "aries",
  },
};
