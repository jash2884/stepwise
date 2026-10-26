// Drawn diagrams shared by the theory and compiler tools: state diagrams with an
// automatic layered layout, item-set automata, parse trees / forests and DAGs.
// Every node and edge carries a data-k key and its position, so morph() in
// ui.js can glide nodes between steps instead of redrawing them.
import { h } from "./ui.js";

const CHAR = 7.6; // width of one 13px mono character

// --- Layout -------------------------------------------------------------------------
// Layers by breadth-first distance from the start, ordered within a layer by the
// barycentre of their neighbours (a few sweeps cut most crossings).
export function layered(nodes, edges, start, { gapX = 74, gapY = 26, pad = 28 } = {}) {
  const ids = nodes.map((n) => n.id), size = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map(ids.map((id) => [id, []])), inc = new Map(ids.map((id) => [id, []]));
  for (const e of edges) if (e.from !== e.to && out.has(e.from) && out.has(e.to)) { out.get(e.from).push(e.to); inc.get(e.to).push(e.from); }
  const layer = new Map();
  const bfs = (root, base) => {
    layer.set(root, base);
    const queue = [root];
    while (queue.length) {
      const q = queue.shift();
      for (const t of out.get(q)) if (!layer.has(t)) { layer.set(t, layer.get(q) + 1); queue.push(t); }
    }
  };
  if (ids.includes(start)) bfs(start, 0);
  for (const id of ids) if (!layer.has(id)) bfs(id, Math.max(0, ...layer.values()) + 1);
  const layers = [];
  for (const id of ids) (layers[layer.get(id)] ??= []).push(id);
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];
  const rank = new Map();
  const reindex = () => layers.forEach((l) => l.forEach((id, i) => rank.set(id, i - (l.length - 1) / 2)));
  reindex();
  const bary = (id, from) => {
    const ns = from.filter((x) => rank.has(x));
    return ns.length ? ns.reduce((s, x) => s + rank.get(x), 0) / ns.length : rank.get(id);
  };
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const seq = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of seq) {
      const score = new Map(l.map((id) => [id, bary(id, down ? inc.get(id).filter((x) => layer.get(x) < layer.get(id)) : out.get(id).filter((x) => layer.get(x) > layer.get(id)))]));
      l.sort((a, b) => score.get(a) - score.get(b));
      reindex();
    }
  }
  const colW = layers.map((l) => Math.max(0, ...l.map((id) => size.get(id).w)));
  const colH = layers.map((l) => l.reduce((s, id) => s + size.get(id).h, 0) + gapY * Math.max(0, l.length - 1));
  const H = Math.max(...colH) + pad * 2;
  const pos = new Map();
  let x = pad;
  layers.forEach((l, li) => {
    let y = pad + (H - pad * 2 - colH[li]) / 2;
    for (const id of l) {
      const n = size.get(id);
      pos.set(id, { x: x + colW[li] / 2, y: y + n.h / 2, w: n.w, h: n.h, layer: li });
      y += n.h + gapY;
    }
    x += colW[li] + gapX;
  });
  return { pos, W: x - gapX + pad, H };
}

// --- Geometry -----------------------------------------------------------------------
function clip(p, toward, shape) {
  const dx = toward.x - p.x, dy = toward.y - p.y, len = Math.hypot(dx, dy) || 1;
  if (shape === "box") {
    const s = Math.min((p.w / 2 + 2) / (Math.abs(dx) || 1e-9), (p.h / 2 + 2) / (Math.abs(dy) || 1e-9));
    return { x: p.x + dx * s, y: p.y + dy * s };
  }
  const r = p.w / 2 + 1;
  return { x: p.x + (dx / len) * r, y: p.y + (dy / len) * r };
}

function edgeGeom(a, b, bend, shape) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
  const s = clip(a, bend ? c : b, shape), t = clip(b, bend ? c : a, shape);
  if (!bend) return { d: `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${t.x.toFixed(1)},${t.y.toFixed(1)}`, lx: mx, ly: my - 7, at: (u) => ({ x: s.x + (t.x - s.x) * u, y: s.y + (t.y - s.y) * u }) };
  const at = (u) => ({ x: (1 - u) ** 2 * s.x + 2 * (1 - u) * u * c.x + u * u * t.x, y: (1 - u) ** 2 * s.y + 2 * (1 - u) * u * c.y + u * u * t.y });
  return { d: `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${t.x.toFixed(1)},${t.y.toFixed(1)}`, lx: at(0.5).x, ly: at(0.5).y, at };
}

// Slide a label along its edge to the first spot that covers no node and no
// label placed before it.
function placeLabel(g, text, nodes, placed) {
  const w = [...text].length * CHAR + 8, hgt = 17;
  const hits = (x, y) => nodes.some((p) => Math.abs(x - p.x) < (p.w + w) / 2 + 2 && Math.abs(y - p.y) < (p.h + hgt) / 2 + 1)
    || placed.some((q) => Math.abs(x - q.x) < (w + q.w) / 2 && Math.abs(y - q.y) < hgt);
  for (const u of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
    if (!g.at) break;
    const p = g.at(u);
    if (!hits(p.x, p.y)) { placed.push({ x: p.x, y: p.y, w }); return p; }
  }
  placed.push({ x: g.lx, y: g.ly, w });
  return { x: g.lx, y: g.ly };
}

function loopGeom(p, shape) {
  if (shape === "box") {
    const top = p.y - p.h / 2, x = p.x + p.w / 2 - 34;
    return { d: `M${x},${top} C${x - 6},${top - 38} ${x + 34},${top - 38} ${x + 26},${top}`, lx: x + 11, ly: top - 32 };
  }
  const r = p.w / 2, top = p.y - r;
  return { d: `M${p.x - r * 0.55},${top + r * 0.17} C${p.x - r - 8},${top - 44} ${p.x + r + 8},${top - 44} ${p.x + r * 0.55},${top + r * 0.17}`, lx: p.x, ly: top - 34 };
}

const marker = (id) => h("defs", null, h("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "d-arrow" })));
let uid = 0;

function svgFrame(W, H, cls, aria, kids) {
  return h("svg", { viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, class: `diagram ${cls}`, role: "img", "aria-label": aria, style: `max-width:${Math.max(W * 1.15, 240).toFixed(0)}px;min-width:${Math.min(W, 560).toFixed(0)}px` }, kids);
}

// --- State diagrams (automata, Turing machines, LR item sets) ------------------------
// states: [{ id, label?, lines? }]; edges: [{ from, to, label }] (parallel edges merge).
export function stateDiagram({ states, edges, start, accept = [], active = [], lit = [], classes = {}, styles = {}, shape = "circle", tokens = false, aria }) {
  const sized = states.map((s) => {
    const label = s.label ?? s.id;
    if (shape === "box") {
      const lines = (s.lines ?? []).map((l) => (typeof l === "string" ? { text: l } : l));
      const w = Math.max(label.length * CHAR, ...lines.map((l) => [...l.text].length * 7.1)) + 22;
      return { id: s.id, label, lines, w, h: 30 + lines.length * 17 };
    }
    const r = Math.max(20, [...label].length * 4.4 + 10);
    return { id: s.id, label, w: r * 2, h: r * 2 };
  });
  const merged = new Map();
  for (const e of edges) {
    const k = `${e.from}\u0000${e.to}`;
    if (!merged.has(k)) merged.set(k, { from: e.from, to: e.to, labels: [] });
    if (!merged.get(k).labels.includes(e.label)) merged.get(k).labels.push(e.label);
  }
  const all = [...merged.values()];
  const loops = new Set(all.filter((e) => e.from === e.to).map((e) => e.from));
  const { pos, W, H } = layered(sized, all, start, shape === "box" ? { gapX: 90, gapY: 34, pad: 46 } : { gapX: 84, gapY: loops.size ? 58 : 34, pad: 56 });
  const acc = new Set(accept), act = new Set(active), litSet = new Set(lit.map((e) => `${e.from}\u0000${e.to}`));
  const id = `arr${++uid}`;
  const edgeEls = [], labelEls = [], tokenEls = [], placed = [], nodeBoxes = [...pos.values()];
  // Self-loops sit above their node: keep other labels out of that space.
  for (const q of loops) { const p = pos.get(q); if (p) nodeBoxes.push({ x: p.x, y: p.y - p.h / 2 - 24, w: Math.max(p.w + 20, ...all.filter((e) => e.from === q && e.to === q).map((e) => e.labels.join(", ").length * CHAR)), h: 46 }); }
  all.sort((a, b) => (a.from === a.to ? 0 : 1) - (b.from === b.to ? 0 : 1));
  for (const e of all) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    let g;
    if (e.from === e.to) g = loopGeom(a, shape);
    else {
      const twoWay = merged.has(`${e.to}\u0000${e.from}`);
      const span = b.layer - a.layer;
      // Forward moves to the next layer are straight; anything that skips
      // layers or goes back curves out further the more layers it spans, so
      // parallel back edges nest instead of overlapping.
      const bend = twoWay && Math.abs(span) <= 1 ? 22 : span === 1 ? 0 : span === 0 ? 46 : span > 1 ? 20 + 22 * (span - 1) : 30 + 26 * (Math.abs(span) - 1) + (twoWay ? 10 : 0);
      // If the curve would run through another node, bend it further out
      // (alternating sides) until it's clear.
      const others = [...pos.entries()].filter(([k]) => k !== e.from && k !== e.to).map(([, p]) => p);
      const clear = (geom) => !geom.at || [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].every((u) => {
        const q = geom.at(u);
        return others.every((p) => Math.abs(q.x - p.x) > p.w / 2 + 8 || Math.abs(q.y - p.y) > p.h / 2 + 8);
      });
      g = edgeGeom(a, b, bend, shape);
      for (const extra of [26, -26, 52, -52, 80, -80, 110]) {
        if (clear(g)) break;
        const sign = bend < 0 ? -1 : 1;
        g = edgeGeom(a, b, bend + sign * extra, shape);
      }
    }
    const on = litSet.has(`${e.from}\u0000${e.to}`);
    const label = e.labels.join(", ");
    edgeEls.push(h("path", { d: g.d, class: `d-edge${on ? " lit" : ""}`, "marker-end": `url(#${id})`, "data-k": `e:${e.from}>${e.to}`, "data-ends": `${e.from}|${e.to}` }, h("title", null, `${e.from} → ${e.to} on ${label}`)));
    const lp = e.from === e.to ? { x: g.lx, y: g.ly } : placeLabel(g, label, nodeBoxes, placed);
    labelEls.push(h("text", { x: lp.x.toFixed(1), y: (lp.y + 4).toFixed(1), "text-anchor": "middle", class: `d-label${on ? " lit" : ""}`, "data-k": `l:${e.from}>${e.to}`, "data-ends": `${e.from}|${e.to}` }, label));
    if (on && tokens) tokenEls.push(h("circle", { r: 6, class: "d-token" }, h("animateMotion", { dur: "0.55s", begin: "indefinite", fill: "freeze", path: g.d, calcMode: "spline", keyTimes: "0;1", keySplines: "0.3 0 0.2 1" })));
  }
  const nodeEls = sized.map((n) => {
    const p = pos.get(n.id);
    const cls = ["d-node", act.has(n.id) && "active", acc.has(n.id) && "accept", classes[n.id]].filter(Boolean).join(" ");
    const kids = [h("title", null, `${n.label}${acc.has(n.id) ? " (accepting)" : ""}${n.id === start ? " (start)" : ""}`)];
    if (shape === "box") {
      const x0 = p.x - p.w / 2, y0 = p.y - p.h / 2;
      kids.push(h("rect", { x: x0, y: y0, width: p.w, height: p.h, rx: 9 }),
        h("text", { x: x0 + 10, y: y0 + 19, class: "d-title" }, n.label),
        n.lines.map((l, i) => h("text", { x: x0 + 10, y: y0 + 37 + i * 17, class: `d-item${l.cls ? ` ${l.cls}` : ""}` }, l.text)));
    } else {
      kids.push(h("circle", { cx: p.x, cy: p.y, r: p.w / 2 }));
      if (acc.has(n.id)) kids.push(h("circle", { cx: p.x, cy: p.y, r: p.w / 2 - 4.5, class: "inner" }));
      kids.push(h("text", { x: p.x, y: p.y + 4.5, "text-anchor": "middle" }, n.label));
    }
    return h("g", { class: cls, style: styles[n.id] ?? null, "data-k": `n:${n.id}`, "data-x": p.x.toFixed(1), "data-y": p.y.toFixed(1) }, kids);
  });
  const sp = pos.get(start);
  const startArrow = sp ? h("path", { d: shape === "box" ? `M${sp.x - sp.w / 2 - 34},${sp.y} L${sp.x - sp.w / 2 - 3},${sp.y}` : `M${sp.x - sp.w / 2 - 34},${sp.y} L${sp.x - sp.w / 2 - 2},${sp.y}`, class: "d-edge start", "marker-end": `url(#${id})`, "data-k": "start", "data-ends": `${start}|${start}` }) : null;
  return svgFrame(W, H, shape === "box" ? "items" : "states", aria ?? `State diagram with ${states.length} states.`, [marker(id), edgeEls, startArrow, nodeEls, labelEls, tokenEls]);
}

// --- Trees and forests -------------------------------------------------------------
// node: { id, label, kids, state }: state is open | expanded | matched | error.
// align: "top" puts roots on one line (top-down parsing); "bottom" puts every
// leaf on one baseline so bottom-up reductions grow upward.
export function treeDiagram(roots, { lit = [], aria, gapY = 62, align = "top" } = {}) {
  const list = Array.isArray(roots) ? roots : [roots];
  const pos = new Map(), litSet = new Set(lit);
  const height = new Map();
  const ht = (n) => { const v = n.kids.length ? 1 + Math.max(...n.kids.map(ht)) : 0; height.set(n.id, v); return v; };
  const top = Math.max(0, ...list.map(ht));
  const yOf = (n, depth) => 28 + (align === "bottom" ? top - height.get(n.id) : depth) * gapY;
  let x = 26, maxDepth = 0;
  const width = (n) => Math.max(34, [...n.label].length * CHAR + 18);
  const place = (n, depth) => {
    maxDepth = Math.max(maxDepth, depth);
    if (!n.kids.length) {
      const w = width(n);
      pos.set(n.id, { x: x + w / 2, y: yOf(n, depth), w, n });
      x += w + 12;
      return;
    }
    n.kids.forEach((k) => place(k, depth + 1));
    const first = pos.get(n.kids[0].id), last = pos.get(n.kids.at(-1).id);
    let cx = (first.x + last.x) / 2;
    const w = width(n);
    if (cx - w / 2 < 26) { x += 26 - (cx - w / 2); cx = 26 + w / 2; }
    pos.set(n.id, { x: cx, y: yOf(n, depth), w, n });
  };
  list.forEach((r, i) => { if (i) x += 22; place(r, 0); });
  const W = Math.max(x + 14, 120), H = 28 * 2 + (align === "bottom" ? top : maxDepth) * gapY + 4;
  const edges = [], nodes = [];
  const walk = (n) => {
    const p = pos.get(n.id);
    for (const k of n.kids) {
      const c = pos.get(k.id);
      edges.push(h("line", { x1: p.x, y1: p.y + 13, x2: c.x, y2: c.y - 13, class: `t-edge${k.state === "open" ? " pending" : ""}`, "data-k": `e:${k.id}`, "data-ends": `${n.id}|${k.id}` }));
      walk(k);
    }
    nodes.push(h("g", { class: `t-node ${n.state}${litSet.has(n.id) ? " lit" : ""}`, "data-k": `n:${n.id}`, "data-x": p.x.toFixed(1), "data-y": p.y.toFixed(1) },
      h("rect", { x: p.x - p.w / 2, y: p.y - 13, width: p.w, height: 26, rx: n.state === "matched" ? 13 : 7 }),
      h("text", { x: p.x, y: p.y + 4.5, "text-anchor": "middle" }, n.label)));
  };
  list.forEach(walk);
  return svgFrame(W, H, "parse-tree", aria ?? "Parse tree", [edges, nodes]);
}

// --- DAGs (expression DAGs: leaves at the bottom) -----------------------------------
// nodes: [{ id, label, kids: [ids], labels: [attached names], leaf }]
export function dagDiagram(nodes, { lit = [], reused = [], aria } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const height = new Map();
  const ht = (id) => {
    if (height.has(id)) return height.get(id);
    const n = byId.get(id), v = n.kids.length ? 1 + Math.max(...n.kids.map(ht)) : 0;
    height.set(id, v);
    return v;
  };
  nodes.forEach((n) => ht(n.id));
  const top = Math.max(0, ...height.values());
  const x = new Map();
  const levels = Array.from({ length: top + 1 }, (_, l) => nodes.filter((n) => height.get(n.id) === l));
  levels[0].forEach((n, i) => x.set(n.id, 40 + i * 78));
  for (let l = 1; l <= top; l++) {
    const want = levels[l].map((n) => ({ n, x: n.kids.reduce((s, k) => s + x.get(k), 0) / n.kids.length })).sort((a, b) => a.x - b.x);
    let last = -Infinity;
    for (const w of want) { const v = Math.max(w.x, last + 82); x.set(w.n.id, v); last = v; }
  }
  const minX = Math.min(...x.values()), shift = 40 - minX;
  for (const [k, v] of x) x.set(k, v + shift);
  const y = (id) => 34 + (top - height.get(id)) * 74;
  const W = Math.max(...x.values()) + 90, H = 34 * 2 + top * 74 + 14;
  const litSet = new Set(lit), reusedSet = new Set(reused), id = `arr${++uid}`;
  const rad = (n) => Math.max(18, [...n.label].length * 4.3 + 8);
  const edges = [], els = [];
  for (const n of nodes) {
    const px = x.get(n.id), py = y(n.id);
    const twin = n.kids.length === 2 && n.kids[0] === n.kids[1];
    n.kids.forEach((k, i) => {
      const cx = x.get(k), cy = y(k), bend = twin ? (i ? 18 : -18) : 0;
      edges.push(h("path", { d: edgeGeom({ x: px, y: py, w: rad(n) * 2, h: 36 }, { x: cx, y: cy, w: rad(byId.get(k)) * 2, h: 36 }, bend, "circle").d, class: "d-edge", "marker-end": `url(#${id})`, "data-k": `e:${n.id}>${k}.${i}`, "data-ends": `${n.id}|${k}` }));
    });
    els.push(h("g", { class: `d-node${n.leaf ? " leaf" : ""}${litSet.has(n.id) ? " active" : ""}${reusedSet.has(n.id) ? " reused" : ""}`, "data-k": `n:${n.id}`, "data-x": px.toFixed(1), "data-y": py.toFixed(1) },
      h("title", null, `${n.leaf ? "Leaf" : "Node"} ${n.label}${n.labels.length ? `, names ${n.labels.join(", ")}` : ""}`),
      h("circle", { cx: px, cy: py, r: rad(n) }),
      h("text", { x: px, y: py + 4.5, "text-anchor": "middle" }, n.label),
      n.labels.length ? h("text", { x: px + rad(n) + 6, y: py - 12, class: "d-names" }, n.labels.join(", ")) : null));
  }
  return svgFrame(W, H, "dag", aria ?? "Expression DAG", [marker(id), edges, els]);
}
