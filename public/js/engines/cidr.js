// CIDR: longest-prefix-match forwarding and route summarisation (aggregation).
// Prefixes are { net, len } with net an unsigned 32-bit integer whose host bits are 0.
import { binary, dotted, maskOf, parseAddress } from "./subnet.js";

const u32 = (n) => n >>> 0;
export const show = (p) => `${dotted(p.net)}/${p.len}`;
export const contains = (p, ip) => u32(ip & maskOf(p.len)) === p.net;
const covers = (a, b) => a.len <= b.len && contains(a, b.net);

export function parsePrefix(text) {
  const t = String(text).trim();
  if (/^default$/i.test(t)) return { net: 0, len: 0 };
  const { ip, prefix } = parseAddress(t);
  if (prefix === null) throw new Error(`"${t}" needs a prefix length, like 200.23.16.0/21.`);
  const net = u32(ip & maskOf(prefix));
  if (net !== ip) throw new Error(`${t} has host bits set; did you mean ${dotted(net)}/${prefix}?`);
  return { net, len: prefix };
}

// Forwarding table: one entry per line, "prefix interface", e.g. "200.23.16.0/21 0".
export function parseTable(text) {
  const rows = [];
  for (const line of String(text).split(/[\n;]+/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(\S+)\s*(?:→|->|:|\s)\s*(\S+)$/.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write entries like "200.23.16.0/21 0" or "default 3".`);
    const p = parsePrefix(m[1]);
    if (rows.some((r) => r.net === p.net && r.len === p.len)) throw new Error(`${show(p)} is listed twice.`);
    rows.push({ ...p, iface: m[2] });
  }
  if (!rows.length) throw new Error("Add at least one forwarding entry.");
  if (rows.length > 12) throw new Error("Use at most 12 entries.");
  return rows;
}

export const LPM_CODE = [
  "best ← none; bestLen ← −1",
  "for each entry prefix/len → interface",
  "  if the first len bits of the address equal the prefix's then",
  "    if len > bestLen then best ← entry; bestLen ← len",
  "forward on best's interface  // no match at all: drop it",
];

export function lookup(table, ip) {
  let best = null;
  const steps = [{ line: 1, entry: null, vars: { address: dotted(ip), best: "none", bestLen: -1 }, note: `Look up ${dotted(ip)} (${binary(ip)}). Several entries may match; the most specific one, with the longest prefix, wins.` }];
  table.forEach((e, i) => {
    const hit = contains(e, ip);
    // Where the address first differs from the prefix, if within the prefix.
    const diff = hit ? null : Math.clz32(u32((ip ^ e.net) >>> 0));
    const better = hit && (!best || e.len > best.len);
    if (better) best = { ...e, index: i };
    steps.push({ line: hit ? (better ? [2, 3, 4] : [2, 3]) : [2, 3], entry: i, hit, diff,
      vars: { address: dotted(ip), entry: show(e), len: e.len, match: hit, best: best ? show(best) : "none", bestLen: best ? best.len : -1 },
      note: hit
        ? `${show(e)}: the first ${e.len} bits of the address match the prefix${e.len === 0 ? " (a /0 default route matches everything)" : ""}. ${better ? `It's the longest match so far, so it becomes the best (interface ${e.iface}).` : `But ${show(best)} is already longer (/${best.len}), so it stays the best.`}`
        : `${show(e)}: bit ${diff + 1} of the address differs from the prefix, so it doesn't match.` });
  });
  steps.push({ line: 5, entry: best ? best.index : null, done: true, vars: { address: dotted(ip), best: best ? show(best) : "none", interface: best ? best.iface : "drop" },
    note: best ? `Forward on interface ${best.iface}: ${show(best)} is the longest of the ${table.filter((e) => contains(e, ip)).length} matching prefixes.` : "No entry matches and there's no default route, so the router drops the packet (and may send an ICMP destination unreachable)." });
  return { best, steps, matches: table.filter((e) => contains(e, ip)) };
}

// --- Summarisation -------------------------------------------------------------------
export const SUMMARY_CODE = [
  "sort the prefixes; remove any that another prefix already covers",
  "repeat",
  "  find two blocks of the same length that are the two halves of one bigger block",
  "  replace them with that bigger block (prefix length − 1)",
  "until no pair can be merged",
  "single supernet: keep only the leading bits every prefix shares",
];

export function parsePrefixes(text) {
  const list = String(text).split(/[\s,;]+/).filter(Boolean).map(parsePrefix);
  if (!list.length) throw new Error("List at least one prefix.");
  if (list.length > 32) throw new Error("Use at most 32 prefixes.");
  return list;
}

export function summarise(prefixes) {
  const sort = (l) => [...l].sort((a, b) => a.net - b.net || a.len - b.len);
  let blocks = sort(prefixes);
  const steps = [];
  const removed = blocks.filter((b, i) => blocks.some((o, j) => j !== i && covers(o, b) && (o.len < b.len || j < i)));
  blocks = blocks.filter((b) => !removed.includes(b));
  steps.push({ line: 1, blocks: [...blocks], merged: null, vars: { blocks: blocks.map(show), removed: removed.map(show) },
    note: `Sort the ${prefixes.length} prefixes by address.${removed.length ? ` ${removed.map(show).join(", ")} ${removed.length === 1 ? "is" : "are"} already inside another prefix, so drop ${removed.length === 1 ? "it" : "them"}.` : " None is inside another."}` });
  for (let guard = 0; guard < 64; guard++) {
    let pair = null;
    for (let i = 0; i < blocks.length && !pair; i++) for (let j = i + 1; j < blocks.length && !pair; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.len === b.len && a.len > 0 && u32(a.net ^ b.net) === 2 ** (32 - a.len) && contains({ net: u32(a.net & maskOf(a.len - 1)), len: a.len - 1 }, b.net)) pair = [a, b];
    }
    if (!pair) break;
    const [a, b] = pair, m = { net: u32(a.net & maskOf(a.len - 1)), len: a.len - 1 };
    blocks = sort([...blocks.filter((x) => x !== a && x !== b), m]);
    steps.push({ line: [2, 3, 4], blocks: [...blocks], merged: m, from: [a, b], vars: { merge: `${show(a)} + ${show(b)}`, into: show(m), blocks: blocks.map(show) },
      note: `${show(a)} and ${show(b)} differ only in bit ${a.len} (the last bit of their prefix), so together they are exactly ${show(m)}: replace both with it.` });
  }
  // The single covering supernet: the longest prefix shared by every block.
  const lo = Math.min(...blocks.map((b) => b.net)), hi = Math.max(...blocks.map((b) => u32(b.net + 2 ** (32 - b.len) - 1)));
  const len = Math.clz32(u32(lo ^ hi)) === 32 ? 32 : Math.clz32(u32(lo ^ hi));
  const supernet = { net: u32(lo & maskOf(len)), len };
  const covered = blocks.reduce((s, b) => s + 2 ** (32 - b.len), 0), size = 2 ** (32 - len);
  steps.push({ line: [5, 6], blocks: [...blocks], supernet, done: true, vars: { result: blocks.map(show), supernet: show(supernet), exact: covered === size },
    note: `No more pairs merge, so the minimal summary is ${blocks.map(show).join(", ")}. All of them share their first ${len} bits, giving the single supernet ${show(supernet)}${covered === size ? ", which covers exactly the same addresses." : `, but that also covers ${(size - covered).toLocaleString("en")} addresses that weren't in the list, so advertising it could attract traffic for networks you don't have.`}` });
  return { blocks, supernet, exact: covered === size, steps };
}

export function randomTable(r = Math.random) {
  const a = 10 + Math.floor(r() * 200), b = Math.floor(r() * 256);
  const base = u32(((a << 24) | (b << 16)) >>> 0);
  const rows = [{ net: base, len: 16, iface: "0" }];
  const used = new Set([`${base}/16`]);
  for (let i = 1; rows.length < 4; i++) {
    const len = 18 + Math.floor(r() * 7), net = u32((base | (Math.floor(r() * 2 ** (len - 16)) << (32 - len))) >>> 0);
    if (!used.has(`${net}/${len}`)) { used.add(`${net}/${len}`); rows.push({ net, len, iface: String(rows.length) }); }
  }
  rows.push({ net: 0, len: 0, iface: String(rows.length) });
  const pick = rows[1 + Math.floor(r() * 3)];
  const ip = u32(pick.net | Math.floor(r() * 2 ** (32 - pick.len)));
  return { rows, ip };
}
