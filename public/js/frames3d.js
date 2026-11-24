// What each tool looks like in 3D, as plain data: pure functions from a step to
// a frame, so they can be tested without a browser. blocks3d.js draws them.
//   frame = { items: [{ k, x, y, z, w, h, d, text?, tone?, ghost?, size? }],
//             marks: [{ k, x, y, z, text, tone?, size? }],   // labels that face you
//             links: [{ k, a: [x, y, z], b: [x, y, z], tone? }] }
// (x, y, z) is the centre of a block's base. Tones: see TONES in blocks3d.js.

const num = (v) => { const m = /-?\d+(\.\d+)?/.exec(String(v ?? "")); return m ? Number(m[0]) : null; };
const pointers = (ptrs, n, place, skip = () => false) => {
  const at = new Map();
  for (const [name, i] of Object.entries(ptrs ?? {})) if (Number.isInteger(i) && i >= 0 && i < n && !skip(name)) at.set(i, [...(at.get(i) ?? []), name]);
  return [...at].map(([i, names]) => ({ k: `p:${names.join()}`, ...place(i), text: names.join(", "), tone: "accent", size: 0.5 }));
};

// Bars stand in a row; a swap passes one bar in front of the other. The
// temporary array of merge and counting sort stands in a second row in front.
export function sortingFrame(st, n, max, aux) {
  const hi = new Set(st.cmp ?? []), sw = new Set(st.swap ?? []), sorted = new Set(st.sorted ?? []), X = (i) => i - (n - 1) / 2, H = (v) => Math.max(0.14, (v / max) * 4.2);
  const items = [], marks = [], seen = new Set();
  const bar = (it, i, row) => {
    const k = `b:${it.id}${seen.has(it.id) ? `:${row}` : ""}`; seen.add(it.id);
    const inR = !st.range || (i >= st.range[0] && i <= st.range[1]);
    const tone = row ? "base" : sw.has(i) ? "move" : hi.has(i) ? "compare" : st.pivot === i ? "pivot" : st.min === i ? "min" : st.key === i ? "key" : sorted.has(i) ? "done" : !inR || (st.heap != null && i >= st.heap) ? "dim" : "base";
    items.push({ k, x: X(i), y: 0, z: row * 2.2, w: 0.82, d: 0.82, h: H(it.v), text: it.v, tone });
  };
  st.A.forEach((it, i) => { if (it) bar(it, i, 0); });
  if (aux && st.T) st.T.forEach((it, i) => { if (it) bar(it, i, 1); });
  for (let i = 0; i < n; i++) { marks.push({ k: `i${i}`, x: X(i), y: 0.02, z: 0.72, text: i, tone: "muted", size: 0.34 }); if (aux) items.push({ k: `s${i}`, x: X(i), y: -0.06, z: 2.2, w: 0.9, d: 0.9, h: 0.05, tone: "floor" }); }
  if (st.range && st.range[1] >= st.range[0]) items.push({ k: "range", x: (X(st.range[0]) + X(st.range[1])) / 2, y: -0.08, z: 0, w: st.range[1] - st.range[0] + 1, d: 1.2, h: 0.06, tone: "range" });
  marks.push(...pointers(st.ptrs, n, (i) => ({ x: X(i), y: 0.02, z: 1.25 })));
  return { items, marks, links: [] };
}

// Sorted values climb like stairs; ruled-out ones sink, the probe lifts.
export function searchingFrame(A, st, end) {
  const n = A.length, lo = Math.min(...A), span = Math.max(1, Math.max(...A) - lo), out = new Set(st.out ?? []), X = (i) => (i - (n - 1) / 2) * 1.12, items = [], marks = [];
  A.forEach((v, i) => items.push({ k: `c${i}`, x: X(i), y: out.has(i) ? -0.45 : st.probe === i || st.found === i ? 0.35 : 0, z: 0, w: 0.9, d: 0.9, h: 0.5 + ((v - lo) / span) * 2.6, text: v, tone: st.found === i ? "good" : st.probe === i ? "compare" : out.has(i) ? "dim" : "base" }));
  if (end) items.push({ k: "end", x: X(n), y: 0, z: 0, w: 0.9, d: 0.9, h: 0.5, text: "end", tone: "floor" });
  if (st.range && st.range[1] >= st.range[0]) items.push({ k: "range", x: (X(st.range[0]) + X(Math.min(n, st.range[1]))) / 2, y: -0.52, z: 0, w: (st.range[1] - st.range[0] + 1) * 1.12, d: 1.3, h: 0.06, tone: "range" });
  for (let i = 0; i < n; i++) marks.push({ k: `i${i}`, x: X(i), y: -0.4, z: 0.85, text: i, tone: "muted", size: 0.34 });
  marks.push(...pointers(st.ptrs, n + (end ? 1 : 0), (i) => ({ x: X(i), y: -0.4, z: 1.45 })));
  return { items, marks, links: [] };
}

// Only the frames: the page that arrives waits above, the one thrown out lies in
// front. The history stays in the flat table below, where it reads better.
export const PAST = 0;
export function pagingFrame(steps, i, n) {
  const s = steps[i], next = steps[i + 1], X = (k) => (k - (n - 1) / 2) * 1.5, items = [], marks = [];
  for (let t = Math.max(0, i - PAST); t <= i; t++) {
    const z = -(i - t) * 1.2, now = t === i, st = steps[t];
    for (let k = 0; k < n; k++) {
      items.push({ k: `f${k}`, x: X(k), y: -0.06, z, w: 1.3, d: 1.1, h: 0.06, tone: now ? "range" : "floor" });
      if (st.frames[k] != null) items.push({ k: `pg${st.frames[k]}`, x: X(k), y: 0, z, w: 1.06, d: 0.9, h: now ? 0.95 : 0.6, text: st.frames[k], tone: k === st.slot ? (st.hit ? "done" : "move") : now ? "base" : "dim", size: now ? 0.62 : 0.44 });
    }
    marks.push({ k: "r", x: X(0) - 1.5, y: 0.2, z, text: now ? `page ${st.page}` : st.page, tone: now ? "text" : "muted", size: now ? 0.5 : 0.4 }, { k: "o", x: X(n - 1) + 1.35, y: 0.2, z, text: st.hit ? "hit" : "fault", tone: st.hit ? "good" : "bad", size: now ? 0.5 : 0.38 });
  }
  if (s.victim != null && !(next && !next.hit && next.page === s.victim)) items.push({ k: `pg${s.victim}`, x: X(s.slot), y: -0.06, z: 1.5, w: 1, d: 0.85, h: 0.6, text: s.victim, tone: "bad" }), marks.push({ k: "outl", x: X(s.slot) + 1.1, y: 0.2, z: 1.5, text: "out", tone: "bad", size: 0.42 });
  if (next) items.push({ k: next.hit ? "nexthit" : `pg${next.page}`, x: X(next.slot), y: 1.9, z: 0, w: 1.06, d: 0.9, h: 0.7, text: next.page, tone: "ghost" });
  return { items, marks, links: [] };
}

// A stack grows upwards; a queue is the ring it really is; an expression shows
// the input in front, the stack in the middle and the output behind.
export function stackFrame(st, cap, mode) {
  const items = [], marks = [], hot = new Set(st.hot ?? []);
  if (mode === "stack") {
    for (let i = 0; i < cap; i++) marks.push({ k: `i${i}`, x: -1.5, y: i * 0.82 + 0.2, z: 0, text: i, tone: "muted", size: 0.36 });
    items.push({ k: "floor", x: 0, y: -0.1, z: 0, w: 2.2, d: 1.6, h: 0.08, tone: "floor" });
    st.slots.forEach((it, i) => { if (it) items.push({ k: `n${it.id}`, x: 0, y: i * 0.82, z: 0, w: 1.8, d: 1.2, h: 0.72, text: it.v, tone: hot.has(i) ? "accent" : "base" }); });
    if (st.hand) items.push({ k: `n${st.hand.id}`, x: 3, y: (st.hand.out ? st.hand.at : (st.ptrs.top ?? -1) + 1) * 0.82, z: 0, w: 1.8, d: 1.2, h: 0.72, text: st.hand.v, tone: st.error ? "bad" : "compare" });
    marks.push({ k: "top", x: 1.7, y: Math.max(0, st.ptrs.top ?? -1) * 0.82 + 0.2, z: 0.7, text: (st.ptrs.top ?? -1) < 0 ? "empty" : "top", tone: "accent", size: 0.5 });
    return { items, marks, links: [] };
  }
  const R = Math.max(1.9, cap * 0.34), at = (i) => { const a = (i / cap) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * R, Math.sin(a) * R]; };
  for (let i = 0; i < cap; i++) { const [x, z] = at(i); items.push({ k: `s${i}`, x, y: -0.08, z, w: 1.15, d: 1.15, h: 0.07, tone: "floor" }); marks.push({ k: `i${i}`, x: x * 1.42, y: 0, z: z * 1.42, text: i, tone: "muted", size: 0.36 }); }
  st.slots.forEach((it, i) => { if (it) { const [x, z] = at(i); items.push({ k: `n${it.id}`, x, y: 0, z, w: 0.95, d: 0.95, h: 0.9, text: it.v, tone: hot.has(i) ? "accent" : "base" }); } });
  if (st.hand) items.push({ k: `n${st.hand.id}`, x: 0, y: 0.4, z: 0, w: 0.95, d: 0.95, h: 0.9, text: st.hand.v, tone: st.error ? "bad" : "compare" });
  const same = new Map(); for (const [name, i] of Object.entries(st.ptrs ?? {})) if (Number.isInteger(i) && i >= 0 && i < cap) same.set(i, [...(same.get(i) ?? []), name]);
  for (const [i, names] of same) { const [x, z] = at(i); marks.push({ k: names.join(), x, y: 1.45, z, text: names.join(", "), tone: "accent", size: 0.48 }); }
  return { items, marks, links: [] };
}
export function exprFrame(st) {
  const items = [], marks = [], hot = new Set(st.hot ?? []);
  const row = (list, z, name, tone, up = false) => {
    marks.push({ k: name, x: up ? 1.6 : -5.2, y: 0.2, z, text: name, tone: "muted", size: 0.42 });
    (list ?? []).forEach((it, i) => items.push({ k: `n${it.id ?? `${name}${i}`}`, x: up ? 0 : -3.9 + i * 0.92, y: up ? i * 0.74 : 0, z, w: 0.8, d: 0.7, h: 0.64, text: it.text ?? it.v ?? it, tone: hot.has(it.id) ? "accent" : it.state === "bad" ? "bad" : it.state === "done" ? "dim" : tone, size: 0.46 }));
  };
  row((st.input ?? []).slice(0, 14), 2.4, "input", "base"); row(st.stack, 0, "stack", "compare", true); row((st.output ?? []).slice(-14), -2.4, "output", "done");
  return { items, marks, links: [] };
}

// Nodes are blocks, pointers are real arrows, a removed node drops away.
export function listFrame(st, maxX) {
  const X = (x) => (x - maxX / 2) * 1.9, hot = new Set(st.hot ?? []), links = new Set(st.hotLinks ?? []), found = new Set([st.found, st.meet].filter((x) => x != null));
  const at = new Map(st.nodes.map((n) => [n.id, [X(n.x), n.gone ? -1.4 : 0, (n.y || 0) * 1.8]])), items = [], marks = [], L = [];
  for (const n of st.nodes) { const [x, y, z] = at.get(n.id); items.push({ k: `n${n.id}`, x, y, z, w: 1.1, d: 0.85, h: 0.7, text: n.v, tone: n.gone ? "bad" : found.has(n.id) ? "good" : hot.has(n.id) ? "accent" : "base" }); }
  for (const n of st.nodes) for (const [f, lift] of [["next", 0.35], ["prev", 0.62]]) {
    if (n[f] == null || !at.has(n[f])) continue;
    const a = at.get(n.id), b = at.get(n[f]), dir = Math.sign(b[0] - a[0]) || 1, far = Math.abs(b[0] - a[0]) > 2.1 || (dir < 0 && f === "next");
    L.push({ k: `${f}${n.id}`, a: [a[0] + (far ? 0 : dir * 0.56), a[1] + (far ? 0.72 : lift), a[2]], b: [b[0] - (far ? 0 : dir * 0.56), b[1] + (far ? 0.72 : lift), b[2]], lift: far ? 1.1 : 0, tone: links.has(`${f[0]}${n.id}`) || links.has(`${f}${n.id}`) ? "min" : "muted" });
  }
  const names = new Map(); for (const [name, id] of Object.entries(st.ptrs ?? {})) if (id != null && at.has(id)) names.set(id, [...(names.get(id) ?? []), name]);
  for (const [id, ns] of names) { const [x, y, z] = at.get(id); marks.push({ k: ns.join(), x, y: y - 0.1, z: z + 1.05, text: ns.join(", "), tone: "accent", size: 0.48 }); }
  return { items, marks, links: L };
}

// The table is a landscape: a bigger answer stands taller, and the cells a
// value is built from light up beneath it.
export function dpFrame(res, st) {
  const R = res.rowHeads.length, C = res.colHeads.length, X = (j) => j - (C - 1) / 2, Z = (i) => i - (R - 1) / 2, key = (c) => `${c[0]},${c[1]}`;
  const all = res.steps.at(-1).cells.flat().filter(Boolean).map((c) => num(c.t)).filter((v) => v != null && Number.isFinite(v)), max = Math.max(1, ...all.map(Math.abs));
  const deps = new Set((st.deps ?? []).map(key)), best = new Set((st.best ?? []).map(key)), path = new Set((st.path ?? []).map(key)), cur = st.cur ? key(st.cur) : null, items = [], marks = [], links = [];
  const H = (c) => { const v = num(c?.t); return v == null ? 0.16 : 0.16 + (Math.abs(v) / max) * 2.6; };
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    if (res.lower && i > j) continue;
    const c = st.cells[i][j], k = `${i},${j}`;
    items.push({ k, x: X(j), y: 0, z: Z(i), w: 0.9, d: 0.9, h: c ? H(c) : 0.06, text: c ? c.t : "", tone: !c ? (cur === k ? "accent" : "floor") : path.has(k) ? "good" : cur === k ? "accent" : best.has(k) ? "min" : deps.has(k) ? "compare" : "base", size: 0.42 });
  }
  res.colHeads.forEach((t, j) => marks.push({ k: `c${j}`, x: X(j), y: 0.1, z: Z(0) - 1, text: t === "" ? "∅" : t, tone: "muted", size: 0.4 }));
  res.rowHeads.forEach((t, i) => marks.push({ k: `r${i}`, x: X(0) - 1, y: 0.1, z: Z(i), text: t === "" ? "∅" : t, tone: "muted", size: 0.4 }));
  if (st.cur) for (const d of st.deps ?? []) links.push({ k: `d${key(d)}`, a: [X(d[1]), H(st.cells[d[0]]?.[d[1]]) + 0.15, Z(d[0])], b: [X(st.cur[1]), H(st.cells[st.cur[0]]?.[st.cur[1]]) + 0.15, Z(st.cur[0])], lift: 0.8, tone: best.has(key(d)) ? "min" : "compare" });
  return { items, marks, links };
}

// Memory lies along a line: used blocks stand up, holes are low.
export function memoryFrame(step, total, owners) {
  const L = 13, X = (v) => (v / total) * L - L / 2, items = [], marks = [];
  for (const s of step.segs) {
    const w = Math.max(0.06, (s.size / total) * L), x = X(s.start + s.size / 2), used = !!s.owner;
    items.push({ k: `s${s.id}`, x, y: 0, z: 0, w: w * 0.985, d: 1.6, h: used ? 1.35 : 0.22, text: w > 0.75 ? `${s.owner ?? "free"} ${s.size}` : "", tone: step.pick === s.id ? "accent" : step.scan === s.id ? "compare" : used ? (s.fixed ? "dim" : `s${(owners.indexOf(s.owner) % 8 + 8) % 8 + 1}`) : "floor", size: 0.42 });
    marks.push({ k: `a${s.start}`, x: X(s.start), y: 0, z: 1.2, text: s.start, tone: "muted", size: 0.32 });
  }
  return { items, marks, links: [] };
}
export function buddyFrame(step, total, owners) {
  const L = 13, X = (v) => (v / total) * L - L / 2, items = [], marks = [];
  for (const b of step.blocks) {
    const w = (b.size / total) * L, used = !!b.owner;
    items.push({ k: `m${b.start}/${b.size}`, x: X(b.start + b.size / 2), y: 0, z: 0, w: w * 0.985, d: 1.6, h: used ? 1.35 : 0.22, text: w > 0.75 ? `${b.owner ?? "free"} ${b.size}` : "", tone: step.hot === `${b.start}/${b.size}` ? "accent" : used ? `s${(owners.indexOf(b.owner) % 8 + 8) % 8 + 1}` : "floor", size: 0.42 });
    marks.push({ k: `a${b.start}`, x: X(b.start), y: 0, z: 1.2, text: b.start, tone: "muted", size: 0.32 });
  }
  return { items, marks, links: [] };
}

// Sets run left to right, ways go back; the block for this reference drops in.
export function cacheFrame(s, g) {
  const X = (k) => (k - (g.sets - 1) / 2) * 1.35, Z = (j) => -(j - (g.ways - 1) / 2) * 1.35, items = [], marks = [];
  s.sets.forEach((ways, k) => {
    const here = s.i >= 0 && k === s.set;
    marks.push({ k: `s${k}`, x: X(k), y: 0, z: Z(0) + 1.15, text: g.sets === 1 ? "all" : k, tone: here ? "accent" : "muted", size: 0.4 });
    ways.forEach((w, j) => {
      items.push({ k: `f${k},${j}`, x: X(k), y: -0.06, z: Z(j), w: 1.2, d: 1.2, h: 0.06, tone: here ? "range" : "floor" });
      if (w) items.push({ k: `b${w.block}@${k},${j}`, x: X(k), y: 0, z: Z(j), w: 1, d: 1, h: here && j === s.way ? 1.05 : 0.7, text: `B${w.block}${w.dirty ? "*" : ""}`, tone: here && j === s.way ? (s.hit ? "done" : "move") : w.dirty ? "min" : "base", size: 0.42 });
    });
  });
  return { items, marks, links: [] };
}

// Ones stand up; each group is a sheet resting on the cells it covers.
const GRAY = [0, 1, 3, 2];
export function kmapCell(n, m) {
  const cb = n === 2 ? 1 : 2, rb = n === 2 || n === 3 ? 1 : 2, map = n === 5 ? m >> 4 : 0, v = m & 15;
  const c = v & ((1 << cb) - 1), r = (v >> cb) & ((1 << rb) - 1), gi = (x, b) => (b === 2 ? GRAY.indexOf(x) : x);
  return { row: gi(r, rb), col: gi(c, cb), map, rows: 1 << rb, cols: 1 << cb };
}
export function kmapFrame(n, values, s, all) {
  const maps = n === 5 ? 2 : 1, items = [], marks = [], P = (m) => { const c = kmapCell(n, m); return [(c.col - (c.cols - 1) / 2) * 1.3 + (maps === 2 ? (c.map - 0.5) * 6.4 : 0), (c.row - (c.rows - 1) / 2) * 1.3, c]; };
  values.forEach((v, m) => { const [x, z] = P(m); items.push({ k: `m${m}`, x, y: 0, z, w: 1.15, d: 1.15, h: v === 1 ? 0.8 : v === "X" ? 0.45 : 0.14, text: v, tone: s.cell === m ? "accent" : v === 1 ? "base" : v === "X" ? "dim" : "floor", size: 0.5 }); marks.push({ k: `i${m}`, x: x - 0.4, y: 0.16, z: z + 0.5, text: m, tone: "muted", size: 0.26 }); });
  s.primes.forEach((pi, q) => {
    const colour = all.indexOf(pi), on = s.focus === pi || s.chosen.includes(pi);
    for (const m of pi.ms) { const [x, z] = P(m); items.push({ k: `g${colour}:${m}`, x, y: 0.9 + q * 0.17, z, w: 1.32, d: 1.32, h: 0.06, tone: `s${((colour < 0 ? q : colour) % 8) + 1}`, ghost: on ? 0.72 : 0.2 }); }
  });
  return { items, marks, links: [] };
}

// Trees. `t` is what the 2D tree drawing was given (dsa-kit's treeSvg). Left and
// right keep their meaning, and every level steps towards you, so depth is real.
const NODE_TONES = [[/\bbad\b/, "bad"], [/\bswap\b/, "s8"], [/\brot\b|\bqueued\b/, "s7"], [/\bcur\b/, "accent"], [/\bbest\b/, "s3"], [/\bfound\b|\bnew\b/, "good"], [/\bcmp\b|\bsucc\b/, "s4"], [/\bpath\b/, "s1"], [/\bdone\b/, "dim"]];
const CELL_TONES = [[/\bbad\b/, "bad"], [/\bswap\b/, "s8"], [/\bcur\b|\bprobe\b/, "accent"], [/\bbest\b/, "s3"], [/\bfound\b|\bnew\b|\bdone\b/, "good"], [/\bcmp\b|\bchanged\b|\bout\b/, "s4"], [/\boutside\b/, "dim"]];
const toneOf = (list, cls, base) => list.find(([re]) => re.test(cls ?? ""))?.[1] ?? base;
export function treeFrame(t) {
  const items = [], marks = [], bars = [], S = 40, ys = t.nodes.map((n) => n.y), y0 = ys.length ? Math.min(...ys) : 0, y1 = ys.length ? Math.max(...ys) : 0, floor = (y1 - y0) / S;
  const xs = [...t.nodes, ...t.cells].map((n) => n.x), mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  for (const n of t.nodes) {
    const x = (n.x - mid) / S, y = (y1 - n.y) / S, z = ((n.y - y0) / S) * 0.62, tone = toneOf(NODE_TONES, n.cls, "node");
    items.push({ k: `n:${n.id}`, x, y, z, w: 0.92, d: 0.92, h: 0.92, ball: true, inside: true, text: n.label, ink: tone === "node" || tone === "dim" ? "text" : "paper", tone, size: String(n.label).length > 3 ? 0.36 : 0.46 });
    if (n.badge != null) marks.push({ k: `b:${n.id}`, x: x + 0.62, y: y + 0.7, z, text: n.badge, tone: /bad/.test(n.badgeCls ?? "") ? "bad" : "muted", size: 0.36 });
    if (n.sub != null) marks.push({ k: `u:${n.id}`, x, y: y - 0.32, z: z + 0.3, text: n.sub, tone: "muted", size: 0.3 });
  }
  const have = new Set(t.nodes.map((n) => n.id));
  for (const e of t.edges) if (have.has(e.from) && have.has(e.to)) bars.push({ k: `e:${e.to}`, from: t.arrows ? `n:${e.to}` : `n:${e.from}`, to: t.arrows ? `n:${e.from}` : `n:${e.to}`, arrow: !!t.arrows, text: e.label, tone: toneOf(NODE_TONES, e.cls, "muted") });
  const zc = floor * 0.62 + 1.7;
  for (const c of t.cells) items.push({ k: `c:${c.k}`, x: (c.x - mid) / S, y: -0.5, z: zc, w: ((c.w ?? 36) / S) * 0.94, d: 0.8, h: 0.5, text: c.label, tone: toneOf(CELL_TONES, c.cls, "base"), size: 0.4 });
  return { items, marks, links: [], bars };
}
// B-trees: a shelf for each node with its keys standing on it.
export function keyTreeFrame(t) {
  const items = [], bars = [], S = 42, ys = t.nodes.map((n) => n.y), y0 = Math.min(...ys), y1 = Math.max(...ys), mid = (Math.min(...t.nodes.map((n) => n.x)) + Math.max(...t.nodes.map((n) => n.x + n.w))) / 2;
  const place = (n) => [(n.y - y0) / S, (y1 - n.y) / S * 1.05, ((n.y - y0) / S) * 0.75];
  for (const n of t.nodes) { const [, y, z] = place(n); items.push({ k: `n:${n.id}`, x: (n.x + n.w / 2 - mid) / S, y: y - 0.12, z, w: n.w / S, d: 1.05, h: 0.12, tone: n.lit ? (n.kind === "found" || n.kind === "changed" ? "good" : n.kind === "missing" || n.kind === "overflow" ? "bad" : "accent") : "range" }); }
  for (const k of t.keys) { const [, y, z] = place(k); items.push({ k: `k:${k.id}`, x: (k.x + t.cell / 2 - mid) / S, y, z, w: (t.cell / S) * 0.8, d: 0.8, h: 0.62, text: k.label, tone: k.hot ? "s2" : "node", size: 0.46 }); }
  for (const e of t.edges) bars.push({ k: `e:${e.from}>${e.to}`, from: `n:${e.from}`, to: `n:${e.to}`, tone: "muted" });
  for (const l of t.links) bars.push({ k: `l:${l.from}`, from: `n:${l.from}`, to: `n:${l.to}`, tone: "s3", arrow: true });
  return { items, marks: [], links: [], bars };
}
