// Reads the inputs out of a question with plain code, for the common tools.
// read(slug, text) -> { params, used } or null. "used" is every number it
// consumed; complete() then refuses any question with a number left over, so
// a half-read question never gets an answer. The engine has the last word.
import { normalise } from "./features.js";

const NUM = /-?\d+(?:\.\d+)?/g;
const nums = (s) => (String(s ?? "").match(NUM) ?? []).map(Number);
const LIST = /-?\d+(?:\.\d+)?(?:\s*(?:,|;|\band\b|&|\s)\s*-?\d+(?:\.\d+)?)+/g;
const lists = (t) => [...t.matchAll(LIST)].map((m) => ({ v: nums(m[0].replace(/(\d)\s*-\s*(\d)/g, "$1 $2")), at: m.index, end: m.index + m[0].length }));
const longest = (t, min = 3) => lists(t).sort((a, b) => b.v.length - a.v.length).find((l) => l.v.length >= min) ?? null;
const num = (t, re) => { const m = re.exec(t); return m ? Number(m[1] ?? m[2]) : null; };
const has = (t, re) => re.test(t);
const found = (t, table) => table.find(([re]) => re.test(t))?.[1] ?? null;

const CPU = [[/multi.?level feedback|mlfq/, "mlfq"], [/round.?robin|\brr\b/, "rr"], [/srtf|shortest remaining|preemptive (?:sjf|shortest job)|sjf \(?preemptive/, "srtf"], [/hrrn|highest response/, "hrrn"], [/longest remaining|lrtf/, "lrtf"], [/longest job/, "ljf"], [/\bsjf\b|shortest job|shortest process/, "sjf"], [/(?<!non-?)(?<!non )preemptive priority|priority \(?preemptive/, "priority-p"], [/priority/, "priority"], [/fcfs|first.?come/, "fcfs"]];
function cpu(t) {
  const algo = found(t, CPU);
  if (!algo || /multi/.test(algo)) return null;
  let ps = [], used = [];
  const rows = [...t.matchAll(/\bp(\d)\s+(\d+)\s+(\d+)(?:\s+(\d+))?(?=\s*(?:;|\.|$|[a-z]))/g)];
  if (rows.length >= 2) ps = rows.map((m) => [m[2], m[3], m[4] ?? 1].map(Number)), used = rows.flatMap((m) => [m[2], m[3], m[4]].filter(Boolean).map(Number));
  else {
    const seg = [...t.matchAll(/\bp(\d)\b([^]*?)(?=\bp\d\b|$)/g)].map((m) => m[2]).filter((s) => /burst|\bbt\b|runs? for|needs/.test(s));
    if (seg.length >= 2) {
      let last = null;
      for (const s of seg) {
        const b = num(s, /(?:burst(?: time)?|\bbt|runs? for|needs)\D{0,8}?(\d+)/), a = num(s, /(?:arriv\w*|arrival|\bat)\D{0,14}?(\d+)|^\s*(\d+)\s*(?:pe|ko|par|mein)\b/), p = num(s, /priority\D{0,6}(\d+)/);
        if (b === null) return null;
        const arr = a ?? (num(s, /^\s*(?:arrives?|aata hai)?\s*(?:at)?\s*(\d+)/) ?? last);
        if (arr === null) return null;
        last = arr; ps.push([arr, b, p ?? 1]); used.push(arr, b, ...(p === null ? [] : [p]));
      }
    } else {
      const bm = /(?:burst|\bbt\b)[a-z ]*?(?:of|:|=|are)?\s*((?:\d+(?:\s*(?:,|and|\s)\s*)?){2,})/.exec(t), am = /(?:arriv\w*|\bat\b)[a-z ]*?(?::|=|are)?\s*((?:\d+(?:\s*(?:,|and|\s)\s*)?){2,})/.exec(t);
      const b = bm ? nums(bm[1]) : [];
      if (b.length < 2) return null;
      let a = am && am.index !== bm.index ? nums(am[1]) : null;
      if (a && a.length !== b.length) { const c = a.slice(0, b.length); a = c.length === b.length ? c : null; }
      if (!a) { const z = num(t, /arriv\w*\D{0,12}(\d+)/); if (z === null) { if (has(t, /same time|together|all arrive/)) a = b.map(() => 0); else return null; } else { a = b.map(() => z); used.push(z); } } else used.push(...a);
      ps = b.map((x, i) => [a[i], x, 1]); used.push(...b);
      if (/^priority/.test(algo)) return null;
    }
  }
  if (/^priority/.test(algo) && ps.every((p) => p[2] === 1)) return null;
  const params = { algo, p: ps.map((x) => x.join("-")).join("_") };
  if (algo === "rr") { const q = num(t, /quantum\D{0,14}?(\d+)|(\d+)\s*(?:ms|unit)?\s*(?:time )?quantum/) ?? num(t, /time slice\D{0,10}(\d+)/); if (q === null) return null; params.q = q; used.push(q); }
  if (/^priority/.test(algo)) { if (has(t, /(?:higher|larger|bigger) (?:number|value)\w* (?:means?|indicates?|is|has)[a-z ]*high/)) params.prio = "high"; else params.prio = "low"; }
  return { params, used };
}
const PAGE = [[/second.?chance|clock/, "clock"], [/\bnru\b|not recently/, "nru"], [/\blru\b|least recently/, "lru"], [/optimal|\bopt\b|belady'?s optimal/, "optimal"], [/\blfu\b|least frequently/, "lfu"], [/\bmfu\b|most frequently/, "mfu"], [/\bfifo\b|first.?in/, "fifo"]];
const DISK = [[/f-?scan/, "fscan"], [/n-?step/, "nstep"], [/c-?look|circular look/, "clook"], [/c-?scan|circular scan/, "cscan"], [/\blook\b/, "look"], [/sstf|shortest seek/, "sstf"], [/\bscan\b|elevator/, "scan"], [/fcfs|first.?come/, "fcfs"]];
const SORT = [[/bubble/, "bubble"], [/selection/, "selection"], [/insertion/, "insertion"], [/shell/, "shell"], [/merge/, "merge"], [/quick/, "quick"], [/heap/, "heap"], [/counting/, "counting"], [/radix/, "radix"]];
const inserts = (t) => { const l = longest(t, 2); if (!l) return null; const d = [...t.matchAll(/(?:delet\w*|remov\w*)\D{0,10}(\d+)/g)].map((m) => Number(m[1])); if (!d.length && has(t, /delet|remov/)) return null; return { v: l.v, d }; };
const edges = (t) => {
  const e = [...t.matchAll(/\b([a-z])\s*(?:-|–|to|->|,)?\s*([a-z])\s*(?:[:=(]|is|weight|cost)?\s*(-?\d+)\b/g)].map((m) => [m[1].toUpperCase(), m[2].toUpperCase(), Number(m[3])]);
  return e.length >= 3 ? e : null;
};
export function productions(text) {
  const t = String(text).replace(/→|⇒|::=/g, "->").replace(/\n/g, " ; ");
  const out = [];
  for (const m of t.matchAll(/([A-Z]'?)\s*->\s*(.+?)(?=\s*(?:[,;.]|\band\b)?\s*[A-Z]'?\s*->|\s*[;]|$)/g)) {
    const rhs = m[2].replace(/[.?,]\s*$/, "").split("|").map((alt) => {
      const a = alt.trim().replace(/\b(?:epsilon|eps|lambda)\b|λ/gi, "ε");
      if (!a || /\s[a-z]{3,}\s[a-z]{3,}/.test(a)) return null;
      return a.includes(" ") ? a.replace(/\s+/g, " ") : (a.match(/id|num|[A-Z]'?|./g) ?? []).join(" ");
    });
    if (rhs.some((x) => !x)) return null;
    out.push(`${m[1]} -> ${rhs.join(" | ")}`);
  }
  return out.length ? out.join("\n") : null;
}
const grammar = (extra = () => ({})) => (t, raw) => { const g = productions(raw); return g ? { params: { g, ...extra(t) }, used: nums(g) } : null; };

const READERS = {
  "cpu-scheduling": cpu,
  "page-replacement"(t) {
    const algo = found(t, PAGE), f = num(t, /(\d+)\s*(?:empty |physical |memory |main memory )*(?:page ?)?frames?/) ?? num(t, /frames?\D{0,6}(\d+)/), l = longest(t.replace(/(\d+)\s*(?:page ?)?frames?/, ""), 5);
    return algo && f !== null && l ? { params: { algo, f, r: l.v.join(" ") }, used: [f, ...l.v] } : null;
  },
  "disk-scheduling"(t) {
    const algo = found(t, DISK), l = longest(t, 4), head = num(t, /head\D{0,40}?(\d+)/) ?? num(t, /(?:start\w*|initial\w*|current\w*)\D{0,24}?(\d+)/);
    if (!algo || !l || head === null) return null;
    const p = { algo, h: head, r: l.v.filter((x, i) => !(i === 0 && x === head && l.v.length > 5 && t.lastIndexOf("head", l.at) > l.at - 14)).join(" ") }, used = [head, ...l.v];
    const range = /\b0\s*(?:to|-|–)\s*(\d+)/.exec(t), c = range ? Number(range[1]) + 1 : num(t, /(\d+)\s*(?:cylinders|tracks)/);
    if (c) { p.c = c; used.push(...(range ? [0, c - 1] : [c])); } else if (/scan/.test(algo)) return null;
    if (has(t, /(?:toward\w*|direction)[a-z ]*(?:lower|smaller|decreas|zero|0\b|left|inner)|moving (?:down|left)/)) p.dir = "down"; else if (has(t, /(?:toward\w*|direction)[a-z ]*(?:higher|larger|increas|right|outer)|moving (?:up|right)/)) p.dir = "up"; else if (/scan|look/.test(algo)) return null;
    return { params: p, used };
  },
  "sorting"(t) { if (SORT.filter(([re]) => re.test(t)).length > 1 || /\d[a-z]\b/.test(t)) return null; const algo = found(t, SORT), l = longest(t, 3); return algo && l ? { params: { algo, a: l.v.join(" ") }, used: l.v } : null; },
  "searching"(t) {
    const algo = found(t, [[/interpolation/, "interpolation"], [/jump/, "jump"], [/lower bound/, "lower"], [/upper bound/, "upper"], [/binary/, "binary"], [/linear/, "linear"]]), l = longest(t, 3);
    const x = num(t, /(?:search\w*|find\w*|locat\w*|look\w*|target|key|element)\s*(?:for|the|key|element|of|is|=|:|value|\s)*?(-?\d+)(?!\s*[,\s]\s*\d)/);
    return algo && l && x !== null ? { params: { algo, a: l.v.join(" "), t: x }, used: [x, ...l.v] } : null;
  },
  "binary-search-tree"(t) { const x = inserts(t); if (!x) return null; const q = found(t, [[/pre-?order/, "preorder"], [/post-?order/, "postorder"], [/in-?order/, "inorder"], [/level/, "level"], [/height/, "height"]]); return { params: { ops: [...x.v.map((n) => `i${n}`), ...x.d.map((n) => `d${n}`)].join(","), ...(q ? { q } : {}) }, used: [...x.v, ...x.d] }; },
  "avl-tree"(t) { const x = inserts(t); return x ? { params: { ops: [...x.v.map((n) => `i${n}`), ...x.d.map((n) => `d${n}`)].join(",") }, used: [...x.v, ...x.d] } : null; },
  "binary-heap"(t) {
    const l = longest(t, 3), kind = has(t, /max/) ? "max" : has(t, /min/) ? "min" : null;
    if (!l || !kind || !has(t, /insert|add(?:ed|ing)? /) || has(t, /extract|delet|remov|build|heapify|bottom.?up|array (?:represents|is)/)) return null;
    return { params: { kind, ops: `r${l.v.join(".")}` }, used: l.v };
  },
  "shortest-paths"(t) {
    const algo = found(t, [[/bellman/, "bellman"], [/floyd|all.?pairs/, "floyd"], [/dijkstra/, "dijkstra"]]), e = edges(t), s = /(?:from|source|start\w*)\s*(?:vertex|node|at|from|is|=|:|\s)*\s*([a-z])\b/.exec(t);
    if (!algo || !e || (algo !== "floyd" && !s)) return null;
    return { params: { algo, g: e.map((x) => x.join(" ")).join(";"), dir: has(t, /->|directed(?<!undirected)/) && !has(t, /undirected/), ...(s ? { s: s[1].toUpperCase() } : {}) }, used: e.map((x) => x[2]) };
  },
  "minimum-spanning-tree"(t) { const algo = found(t, [[/prim/, "prim"], [/kruskal/, "kruskal"]]) ?? "kruskal", e = edges(t); return e ? { params: { algo, g: e.map((x) => x.join(" ")).join(";"), dir: false }, used: e.map((x) => x[2]) } : null; },
  "subnetting"(t) { const m = /\b(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})\b/.exec(t); return m && !has(t, /vlsm|departments?|hosts? (?:each|respectively)/) ? { params: { mode: "address", a: `${m[1]}/${m[2]}` }, used: [...m[1].split(".").map(Number), Number(m[2])], strip: m[0] } : null; },
  "error-detection"(t) { if (!has(t, /crc|cyclic|generator|divisor/)) return null; const b = [...t.matchAll(/\b[01]{3,}\b/g)].map((m) => m[0]); if (b.length !== 2) return null; const g = /(?:generator|divisor|polynomial|key)\D{0,18}([01]{3,})/.exec(t)?.[1] ?? (b[0].length < b[1].length ? b[0] : b[1]), d = b.find((x) => x !== g); return d ? { params: { mode: "crc", d, g }, used: b.map(Number) } : null; },
  "k-map"(t) {
    const m = /(?:[σ∑]\s*m?|minterms?|\bm)\s*(?:are|:|=|of)?\s*\(?\s*((?:\d+\s*(?:,|and|\s)\s*)*\d+)/.exec(t); if (!m) return null;
    const rest = t.slice(m.index + m[0].length), d = /(?:\bd\b|don'?t.?cares?|[x×φ])\D{0,10}?\(?\s*((?:\d+\s*(?:,|and|\s)\s*)*\d+)/.exec(rest), v = /\b[fyzg]\s*\(([a-z](?:\s*,\s*[a-z])+)\)/.exec(t);
    const mi = nums(m[1]), di = d ? nums(d[1]) : [], n = v ? v[1].split(",").length : num(t, /(\d)[- ]variables?/) ?? Math.max(2, Math.ceil(Math.log2(Math.max(...mi, ...di) + 1)));
    return { params: { n, m: mi.join(","), d: di.join(","), ...(has(t, /\bpos\b|product of sums/) ? { form: "pos" } : {}) }, used: [...mi, ...di, ...(num(t, /(\d)[- ]variables?/) !== null ? [n] : [])] };
  },
  "ieee-754"(t) {
    const f = has(t, /double|64.?bit/) ? "double" : has(t, /half|16.?bit/) ? "half" : "single", t2 = t.replace(/ieee\s*-?\s*754|(?:16|32|64)[- ]?bits?/g, " "), hx = /\b0x([0-9a-f]{4,16})\b/.exec(t2);
    if (hx) return { params: { f, x: hx[1].toUpperCase() }, used: [], strip: hx[0] };
    const v = nums(t2); return v.length === 1 ? { params: { f, v: String(v[0]) }, used: v } : null;
  },
  "matrices"(t) {
    const m = /\[\s*\[.+?\]\s*\]/.exec(t); if (!m) return null;
    const mode = found(t, [[/eigen/, "eigen"], [/determinant|\bdet\b/, "det"], [/inverse/, "inverse"], [/reduced|rref/, "rref"], [/rank|echelon/, "ref"]]); if (!mode) return null;
    const rows = m[0].replace(/^\[\s*\[|\]\s*\]$/g, "").split(/\]\s*,?\s*\[/).map((r) => nums(r).join(","));
    return { params: { mode, m: rows.join(";") }, used: nums(m[0]) };
  },
  "normalization"(t, raw) {
    const r = /\b[A-Z]\w?\s*\(\s*([A-Z](?:\s*,?\s*[A-Z])+)\s*\)/.exec(raw), fds = [...String(raw).replace(/→|⇒/g, "->").matchAll(/([A-Z](?:\s*,?\s*[A-Z])*)\s*->\s*([A-Z](?:[A-Z])*)(?![a-z])/g)].map((m) => `${m[1].replace(/[\s,]/g, "")}->${m[2]}`);
    if (!fds.length) return null;
    const attrs = r ? r[1].replace(/[\s,]/g, "") : [...new Set(fds.join("").replace(/[^A-Z]/g, ""))].sort().join("");
    const algo = found(t, [[/closure/, "closure"], [/\bbcnf\b.*decompos|decompos.*bcnf/, "bcnf"], [/3nf.*decompos|synthes/, "three"], [/normal form|[123]nf|bcnf/, "nf"], [/key/, "keys"]]) ?? "nf";
    if (algo === "closure") return null;
    return { params: { r: attrs, fd: fds.join(";"), algo }, used: [...nums(/\br\d\b/.test(t) ? "" : "")] };
  },
  "first-follow": grammar(), "left-recursion": grammar(), "ll1-parsing": grammar(), "cfg-to-cnf": grammar(),
  "lr-parsing": grammar((t) => ({ kind: found(t, [[/lalr/, "lalr"], [/clr|canonical lr|lr\s*\(1\)/, "clr"], [/lr\s*\(0\)|lr0/, "lr0"], [/slr/, "slr"]]) ?? "slr" })),
  "number-systems"(t, raw) {
    if (/[₀-₉]|\)\s*_?\d/.test(raw)) return null; // bases as subscripts: not read yet
    const BASE = [["binary", 2], ["octal", 8], ["decimal", 10], ["hexadecimal", 16], ["hex", 16]], b = (s) => BASE.find(([n]) => s.startsWith(n))?.[1];
    const m = /\b(?:0x|0b)?([0-9a-f]+(?:\.[0-9a-f]+)?)\s*(?:\(?(binary|octal|decimal|hexadecimal|hex)\)?)?\s*(?:number\s*)?(?:to|into|in|ko|se)\s*(binary|octal|decimal|hexadecimal|hex)/.exec(t);
    if (!m || !/\d/.test(m[1])) return null;
    const from = m[2] ? b(m[2]) : /0x/.test(m[0]) ? 16 : /0b/.test(m[0]) ? 2 : b(/(binary|octal|hexadecimal|hex|decimal)\s*(?:number)?\s*[0-9a-f.]+\s*(?:to|into|in|ko)/.exec(t)?.[1] ?? "decimal");
    return { params: { mode: "convert", x: m[1].toUpperCase(), from, to: b(m[3]) }, used: nums(m[1]), strip: m[1] };
  },
  "hashing"(t) {
    const st = found(t, [[/double hash/, "double"], [/quadratic/, "quadratic"], [/linear/, "linear"], [/chain/, "chaining"]]), l = longest(t, 3), m = num(t, /(?:table|size|slots|buckets)\D{0,12}?(\d+)/) ?? num(t, /(?:mod|%)\s*(\d+)/) ?? num(t, /(\d+)\s*(?:slots|buckets)/);
    if (!st || st === "double" || !l || m === null) return null;
    return { params: { mode: "table", k: l.v.join(" "), m, st }, used: [m, m, ...l.v] };
  },
};
export const READABLE = Object.keys(READERS);

// The question itself, without answer options and harmless labels.
const tidy = (raw) => String(raw).split(/\n?\s*\(?[Aa]\)\s/)[0];
export function read(slug, raw) {
  const text = tidy(raw), t = normalise(text);
  try { const r = READERS[slug]?.(t, text); return r && complete(t, r) ? r : null; } catch { return null; }
}
// Every number in the question must have been used (labels like P1, T2, O(1), 2nf don't count).
function complete(t, { used, strip }) {
  let s = t.replace(/\b(?:p|t|r|q|s)\d\b/g, " ").replace(/ieee\s*-?\s*754|\b(?:16|32|64|8)[- ]?bits?\b|\b[123]nf\b|\b(?:slr|lalr|clr|lr|ll)\s*\(?[01k]?\)?/g, " ").replace(/\bo\(\w+\)/g, " ");
  if (strip) s = s.replace(strip.toLowerCase(), " ");
  const left = new Map(); for (const n of used) left.set(n, (left.get(n) ?? 0) + 1);
  for (const n of nums(s.replace(/(\d)\s*-\s*(\d)/g, "$1 $2"))) { if (left.get(n)) left.set(n, left.get(n) - 1); else if (!used.includes(n)) return false; }
  return true;
}
// Does the question carry data at all (numbers, productions, addresses)?
export const hasData = (raw) => /\d{2,}|\d[\s,]+\d|->|→|\[\s*\[/.test(tidy(raw));
