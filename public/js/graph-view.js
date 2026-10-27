// Drawing for the DSA graph tools: a stable automatic layout, the graph as SVG
// (keyed so morph() glides and fades between steps, with badges, edge states
// and a token that travels along the edge being examined), the side tables
// (queue, stack, arrays, matrices) and the page scaffold the four tools share.
import { codePanel, traceLayout, varsPanel } from "./code.js";
import { asText, build, byName, EXAMPLES, parseGraph, transpose } from "./engines/graph.js";
import { copyLink, h, morph, notice, readParams, reducedMotion, rng, stepper, tabs, writeParams } from "./ui.js";

const CHAR = 7.8;
const nodeSize = (id) => { const w = Math.max(36, [...id].length * CHAR + 16); return { w, h: 36 }; };

// --- Layout ---------------------------------------------------------------------------
const cache = new Map();

function crossings(g, p) {
  const E = g.edges.map((e) => [p[e.from], p[e.to], e]);
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  let n = 0;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const [a, b, e] = E[i], [c, d, f] = E[j];
    if (e.from === f.from || e.from === f.to || e.to === f.from || e.to === f.to) continue;
    if (Math.sign(ccw(a, b, c)) !== Math.sign(ccw(a, b, d)) && Math.sign(ccw(c, d, a)) !== Math.sign(ccw(c, d, b))) n++;
  }
  // A vertex sitting on an edge it isn't part of reads as a false connection.
  for (const [a, b, e] of E) for (const v of g.nodes) {
    if (v === e.from || v === e.to) continue;
    const q = p[v], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L * L);
    if (t > 0.05 && t < 0.95 && Math.abs(ccw(a, b, q)) / L < 0.09) n += 2;
  }
  return n;
}

// Fruchterman–Reingold from a circle in the given order. Fully deterministic.
function relax(g, order) {
  const n = order.length, p = {};
  order.forEach((v, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; p[v] = { x: 0.5 * Math.cos(a), y: 0.5 * Math.sin(a) }; });
  if (n <= 4) return p;
  const k = 0.8 / Math.sqrt(n), pairs = g.edges.map((e) => [e.from, e.to]);
  for (let it = 0, T = 0.12; it < 360; it++, T *= 0.988) {
    const d = Object.fromEntries(order.map((v) => [v, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = order[i], b = order[j];
      let dx = p[a].x - p[b].x, dy = p[a].y - p[b].y, dist = Math.hypot(dx, dy);
      if (dist < 1e-4) { dx = 0.01 * (i - j); dy = 0.01; dist = Math.hypot(dx, dy); }
      const f = (k * k) / dist;
      d[a].x += (dx / dist) * f; d[a].y += (dy / dist) * f; d[b].x -= (dx / dist) * f; d[b].y -= (dy / dist) * f;
    }
    for (const [a, b] of pairs) {
      const dx = p[a].x - p[b].x, dy = p[a].y - p[b].y, dist = Math.hypot(dx, dy) || 1e-4, f = (dist * dist) / k;
      d[a].x -= (dx / dist) * f; d[a].y -= (dy / dist) * f; d[b].x += (dx / dist) * f; d[b].y += (dy / dist) * f;
    }
    for (const v of order) {
      d[v].x -= p[v].x * 0.6; d[v].y -= p[v].y * 0.6; // gentle gravity keeps separate components close
      const len = Math.hypot(d[v].x, d[v].y) || 1, step = Math.min(len, T);
      p[v].x += (d[v].x / len) * step; p[v].y += (d[v].y / len) * step;
    }
  }
  return p;
}

function walkOrder(g, kind) {
  const seen = new Set(), out = [];
  for (const s of g.nodes) {
    if (seen.has(s)) continue;
    const list = [s]; seen.add(s);
    while (list.length) {
      const u = kind === "bfs" ? list.shift() : list.pop();
      out.push(u);
      for (const { v } of g.both[u]) if (!seen.has(v)) { seen.add(v); list.push(v); }
    }
  }
  return out;
}

// Positions in pixels for every vertex, the same every time for the same graph.
export function layoutGraph(g) {
  const sig = `${g.nodes.join(",")}|${g.edges.map((e) => [e.from, e.to].sort(byName).join("-")).sort().join(",")}`;
  if (cache.has(sig)) return cache.get(sig);
  const hint = Object.values(EXAMPLES).find((ex) => ex.pos && Object.keys(ex.pos).length === g.nodes.length && g.nodes.every((v) => ex.pos[v]));
  let p, unit;
  if (hint) {
    p = Object.fromEntries(g.nodes.map((v) => [v, { x: hint.pos[v][0], y: hint.pos[v][1] }]));
    unit = Math.max(...g.nodes.map((v) => nodeSize(v).w)) > 60 ? 120 : 112;
  } else {
    const u = build(g.nodes, g.edges, false);
    const tries = [g.nodes, walkOrder(u, "bfs"), walkOrder(u, "dfs")].map((o) => relax(u, o));
    p = tries.reduce((best, x) => (crossings(u, x) < crossings(u, best) ? x : best));
    const xs = g.nodes.map((v) => p[v].x), ys = g.nodes.map((v) => p[v].y);
    if (Math.max(...ys) - Math.min(...ys) > (Math.max(...xs) - Math.min(...xs)) * 1.1) for (const v of g.nodes) p[v] = { x: p[v].y, y: p[v].x };
    const lens = g.edges.map((e) => Math.hypot(p[e.from].x - p[e.to].x, p[e.from].y - p[e.to].y)).sort((a, b) => a - b);
    let near = Infinity;
    for (const a of g.nodes) for (const b of g.nodes) if (a < b) near = Math.min(near, Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y));
    unit = Math.max(110 / (lens[Math.floor(lens.length / 2)] || 0.5), 76 / (near || 0.5));
  }
  const xs = g.nodes.map((v) => p[v].x), ys = g.nodes.map((v) => p[v].y);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  unit = Math.min(unit, 600 / (bw || 1), 420 / (bh || 1));
  const pad = 30 + Math.max(...g.nodes.map((v) => nodeSize(v).w)) / 2, padY = 52;
  const pos = new Map(g.nodes.map((v) => [v, { x: pad + (p[v].x - Math.min(...xs)) * unit, y: padY + (p[v].y - Math.min(...ys)) * unit, ...nodeSize(v) }]));
  const out = { pos, W: Math.max(bw * unit + pad * 2, 160), H: bh * unit + padY * 2 };
  cache.set(sig, out);
  return out;
}

// --- Geometry -------------------------------------------------------------------------
// Where a ray from the centre of a pill-shaped node leaves it.
function rim(p, dx, dy) {
  const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, r = p.h / 2 + 1, c = Math.max(0, p.w / 2 - p.h / 2);
  let t = Math.abs(uy) > 1e-6 ? r / Math.abs(uy) : Infinity;
  if (Math.abs(t * ux) > c) t = c * Math.abs(ux) + Math.sqrt(Math.max(0, c * c * ux * ux - (c * c - r * r)));
  return { x: p.x + ux * t, y: p.y + uy * t };
}

function geom(a, b, bend) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const s = rim(a, (bend ? c.x : b.x) - a.x, (bend ? c.y : b.y) - a.y), t = rim(b, (bend ? c.x : a.x) - b.x, (bend ? c.y : a.y) - b.y);
  const f = (v) => v.toFixed(1);
  const mid = bend ? { x: 0.25 * s.x + 0.5 * c.x + 0.25 * t.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * t.y } : { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
  return { d: bend ? `M${f(s.x)},${f(s.y)} Q${f(c.x)},${f(c.y)} ${f(t.x)},${f(t.y)}` : `M${f(s.x)},${f(s.y)} L${f(t.x)},${f(t.y)}`, mid };
}

let uid = 0;

// The graph for one step. nodeCls/edgeCls map ids to class names (edge ids are
// "from>to"); badges are short texts under vertices; active = { from, to, id }
// is the edge being looked at, and gets the travelling token.
export function graphSvg(g, layout, { nodeCls = {}, nodeStyle = {}, badges = {}, edgeCls = {}, active = null, flash = [], weights = g.weighted, aria } = {}) {
  const { pos, W, H } = layout, id = `ga${++uid}`, flashSet = new Set(flash);
  const markers = new Map();
  const marker = (cls) => {
    if (!markers.has(cls)) markers.set(cls, h("marker", { id: `${id}-${cls}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerUnits: "userSpaceOnUse", markerWidth: 11, markerHeight: 11, orient: "auto-start-reverse", class: `g-arrow ${cls}` }, h("path", { d: "M0,0 L10,5 L0,10 z" })));
    return `url(#${id}-${cls})`;
  };
  const twoWay = new Set(g.directed ? g.edges.map((e) => `${e.from}>${e.to}`) : []);
  const edgeEls = [], wEls = [];
  for (const e of g.edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const bend = twoWay.has(`${e.to}>${e.from}`) ? 17 : 0;
    const gm = geom(a, b, bend);
    const isActive = active && active.id === e.id;
    const cls = ["g-edge", edgeCls[e.id], isActive && "active"].filter(Boolean).join(" ");
    const state = (edgeCls[e.id] ?? "plain").split(" ")[0];
    edgeEls.push(h("path", { d: gm.d, class: cls, "marker-end": g.directed ? marker(isActive ? "active" : state) : null, "data-k": `e:${e.id}`, "data-ends": `${e.from}|${e.to}` },
      h("title", null, `${e.from} ${g.directed ? "→" : "–"} ${e.to}${weights ? `, weight ${e.w}` : ""}${edgeCls[e.id] ? ` (${edgeCls[e.id]})` : ""}`)));
    if (weights) {
      const text = String(e.w).replace("-", "−"), w = text.length * 7.4 + 9;
      wEls.push(h("g", { class: `g-w${isActive ? " active" : ""}${edgeCls[e.id] ? ` ${state}` : ""}`, "data-k": `w:${e.id}`, "data-ends": `${e.from}|${e.to}` },
        h("rect", { x: (gm.mid.x - w / 2).toFixed(1), y: (gm.mid.y - 9).toFixed(1), width: w.toFixed(1), height: 18, rx: 6 }),
        h("text", { x: gm.mid.x.toFixed(1), y: (gm.mid.y + 4.5).toFixed(1), "text-anchor": "middle" }, text)));
    }
  }
  // The token runs the way the algorithm walks, which for an undirected edge may be backwards.
  let token = null;
  if (active && !reducedMotion()) {
    const a = pos.get(active.from), b = pos.get(active.to);
    const e = g.edges.find((x) => x.id === active.id);
    if (a && b && e) {
      const bend = twoWay.has(`${e.to}>${e.from}`) ? 17 : 0;
      token = h("circle", { r: 6.5, cx: 0, cy: 0, class: "g-token" }, h("animateMotion", { dur: "0.6s", begin: "indefinite", fill: "freeze", path: geom(a, b, bend).d, calcMode: "spline", keyTimes: "0;1", keySplines: "0.35 0 0.25 1" }));
    }
  }
  const nodeEls = g.nodes.map((v) => {
    const p = pos.get(v);
    return h("g", { class: ["g-node", nodeCls[v]].filter(Boolean).join(" "), style: nodeStyle[v] ?? null, "data-k": `n:${v}`, "data-x": p.x.toFixed(1), "data-y": p.y.toFixed(1) },
      h("title", null, `${v}${badges[v] != null ? `: ${badges[v]}` : ""}`),
      h("rect", { x: (p.x - p.w / 2).toFixed(1), y: (p.y - p.h / 2).toFixed(1), width: p.w.toFixed(1), height: p.h, rx: p.h / 2 }),
      h("text", { x: p.x.toFixed(1), y: (p.y + 4.8).toFixed(1), "text-anchor": "middle" }, v));
  });
  const badgeEls = g.nodes.filter((v) => badges[v] != null && badges[v] !== "").map((v) => {
    const p = pos.get(v), text = String(badges[v]), w = [...text].length * 7.2 + 10;
    return h("g", { class: `g-badge${flashSet.has(v) ? " flash" : ""}`, "data-k": `b:${v}`, "data-x": p.x.toFixed(1), "data-y": (p.y + 30).toFixed(1) },
      h("rect", { x: (p.x - w / 2).toFixed(1), y: (p.y + p.h / 2 + 3).toFixed(1), width: w.toFixed(1), height: 18, rx: 9 }),
      h("text", { x: p.x.toFixed(1), y: (p.y + p.h / 2 + 16).toFixed(1), "text-anchor": "middle" }, text));
  });
  return h("svg", { viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, class: "graph-svg", role: "img", style: `max-width:${Math.round(W * 1.2)}px;min-width:${Math.round(Math.min(W * 0.8, 400))}px`,
    "aria-label": aria ?? `${g.directed ? "Directed" : "Undirected"} graph with ${g.nodes.length} vertices and ${g.edges.length} edges: ${g.edges.map((e) => `${e.from}${g.directed ? "→" : "–"}${e.to}${weights ? ` ${e.w}` : ""}`).join(", ")}.` },
  h("defs", null, [...markers.values()]), edgeEls, wEls, token, nodeEls, badgeEls);
}

// Which badges changed since the step drawn before (those flash).
export function changedKeys(prev, next) {
  if (!prev || !next) return [];
  return Object.keys(next).filter((k) => prev[k] !== next[k]);
}

// --- Side pieces ----------------------------------------------------------------------
// A row of boxes for a queue, stack or list. Items new since the last step pop in.
export function strip(title, items, { prev = null, kind = "queue", hot = null, empty = "empty", note = null } = {}) {
  const before = new Map();
  for (const x of prev ?? []) before.set(String(x), (before.get(String(x)) ?? 0) + 1);
  const cells = items.map((x, i) => {
    const label = typeof x === "object" ? x.label : String(x), key = typeof x === "object" ? x.key ?? label : label;
    const fresh = prev && !(before.get(key) > 0);
    if (!fresh) before.set(key, (before.get(key) ?? 0) - 1);
    return h("span", { class: [typeof x === "object" ? x.cls : null, fresh && "new", hot != null && (hot === i || hot === key) && "hot"].filter(Boolean).join(" ") || null }, label);
  });
  const ends = kind === "queue" ? ["front", "back"] : kind === "stack" ? ["bottom", "top"] : null;
  return h("div", { class: `g-strip ${kind}` },
    h("div", { class: "g-strip-head" }, h("b", null, title), note ? h("span", { class: "muted" }, note) : null),
    h("div", { class: "g-cells" }, ends && items.length ? h("small", null, ends[0]) : null,
      cells.length ? cells : h("em", { class: "muted" }, empty), ends && items.length ? h("small", null, ends[1]) : null));
}

// One row per vertex (or any key). Cells that changed since the last step flash.
export function valueTable(head, rows, { prev = null, hot = null } = {}) {
  const before = new Map((prev ?? []).map((r) => [r.key, r.cells.map(String)]));
  return h("div", { class: "table-wrap" }, h("table", { class: "parse g-table" },
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", { class: [r.key === hot && "hot", r.cls].filter(Boolean).join(" ") || null },
      h("th", { scope: "row" }, r.key),
      r.cells.map((c, j) => h("td", { class: before.has(r.key) && before.get(r.key)[j] !== String(c) ? "changed" : null }, c)))))));
}

// A distance matrix, rows and columns in vertex order. cls(i, j) → class.
export function matrixTable(nodes, cell, { corner = "", cls = () => null, prev = null } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse g-matrix" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, corner), nodes.map((n) => h("th", { scope: "col" }, n)))),
    h("tbody", null, nodes.map((i) => h("tr", null, h("th", { scope: "row" }, i), nodes.map((j) => {
      const v = cell(i, j), was = prev ? prev(i, j) : v;
      return h("td", { class: [cls(i, j), was !== v && "changed"].filter(Boolean).join(" ") || null }, v);
    }))))));
}

// Legend: [label, "e-tree"] draws an edge sample, [label, "n-frontier"] a vertex.
export function legend(items) {
  return h("div", { class: "g-legend" }, items.map(([label, kind]) => h("span", null,
    kind.startsWith("e-") ? h("svg", { viewBox: "0 0 28 10", width: 28, height: 10, "aria-hidden": "true" }, h("path", { d: "M1,5 L27,5", class: `g-edge ${kind.slice(2)}` }))
      : h("svg", { viewBox: "0 0 18 18", width: 16, height: 16, "aria-hidden": "true" }, h("g", { class: `g-node ${kind.slice(2)}` }, h("rect", { x: 2, y: 2, width: 14, height: 14, rx: 7 }))),
    label)));
}

export function complexityCard(rows, current) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
    h("thead", null, h("tr", null, ["Algorithm", "Time", "Space", "Good to know"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "hot" : null },
      h("th", { scope: "row" }, r.name), h("td", null, r.time), h("td", null, r.space), h("td", { class: "left wrap" }, r.note))))));
}

// A typed answer; check(text) → true/false. Shows the working either way.
export function textQuestion(check, explain, { placeholder = "e.g. A B C", aria = "Your answer" } = {}) {
  const input = h("input", { type: "text", class: "mono wide", placeholder, "aria-label": aria, onkeydown: (e) => { if (e.key === "Enter") go(); } });
  const feedback = h("div");
  function go() {
    const ok = check(input.value);
    input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
    feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} ${explain}`));
  }
  return h("div", null, h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: go }, "Check")), feedback);
}
export const names = (text) => String(text).split(/[\s,;→>-]+/).map((x) => x.trim()).filter(Boolean);
export const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// --- The page scaffold ----------------------------------------------------------------
// algos: { key: { name, code(g) → lines, run(g, opts) → { steps, … }, mode: "directed" | "undirected" | null,
//   source, target } }. side(step, ctx) draws the tables under the graph,
// after(res, ctx) adds cards below, legend(key, g) lists the colours used.
export function graphTool(root, cfg) {
  const p = readParams();
  const first = EXAMPLES[cfg.defaults.example];
  const state = {
    algo: cfg.algos[p.get("algo")] ? p.get("algo") : cfg.defaults.algo,
    text: (p.get("g") ?? first.text).replace(/;/g, "\n"),
    directed: p.has("dir") ? p.get("dir") === "1" : first.directed,
    source: p.get("s") ?? first.source, target: p.get("t") ?? "",
  };
  let player = null;
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    Object.entries(cfg.algos).map(([k, a]) => h("option", { value: k, selected: k === state.algo }, a.name)));
  const exSel = h("select", { "aria-label": "Example", onchange: (e) => {
    const ex = EXAMPLES[e.target.value]; e.target.value = "";
    if (!ex) return;
    state.text = ex.text; state.directed = ex.directed; state.source = ex.source; state.target = "";
    if (ex.algo && cfg.algos[ex.algo]) state.algo = ex.algo;
    textIn.value = ex.text; update();
  } }, h("option", { value: "" }, "Load an example…"), cfg.examples.map((k) => h("option", { value: k }, EXAMPLES[k].name)));
  const dirBox = h("input", { type: "checkbox", onchange: (e) => { state.directed = e.target.checked; update(); } });
  const dirLabel = h("label", { class: "inline" }, dirBox, " directed");
  const srcSel = h("select", { "aria-label": "Start vertex", onchange: (e) => { state.source = e.target.value; update(); } });
  const dstSel = h("select", { "aria-label": "Path to", onchange: (e) => { state.target = e.target.value; update(); } });
  const srcLabel = h("label", { class: "inline" }, "from ", srcSel), dstLabel = h("label", { class: "inline" }, "path to ", dstSel);
  const textIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Edges", spellcheck: "false", oninput: (e) => { state.text = e.target.value; update(); } }, state.text);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    const algo = cfg.algos[state.algo];
    if (algo.mode) state.directed = algo.mode === "directed";
    dirBox.checked = state.directed; dirBox.disabled = !!algo.mode;
    dirLabel.title = algo.mode ? `${algo.name} needs a ${algo.mode} graph.` : "";
    algoSel.value = state.algo;
    writeParams({ algo: state.algo, g: state.text.split("\n").map((l) => l.trim()).filter(Boolean).join(";"), dir: state.directed ? 1 : 0, ...(algo.source ? { s: state.source } : {}), ...(algo.target && state.target ? { t: state.target } : {}) });
    let g, res;
    try {
      g = parseGraph(state.text, { directed: state.directed, maxNodes: algo.maxNodes ?? 16 });
      if (!g.nodes.includes(state.source)) state.source = g.nodes[0];
      if (state.target && !g.nodes.includes(state.target)) state.target = "";
      srcSel.replaceChildren(...g.nodes.map((n) => h("option", { value: n, selected: n === state.source }, n)));
      dstSel.replaceChildren(h("option", { value: "" }, "(none)"), ...g.nodes.map((n) => h("option", { value: n, selected: n === state.target }, n)));
      srcLabel.hidden = !algo.source; dstLabel.hidden = !algo.target;
      res = algo.run(g, { source: state.source, target: state.target || null });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren(...(res.warning ? [notice("info", res.warning)] : []));
    const layout = layoutGraph(g), gT = g.directed ? transpose(g) : g;
    const ctx = { g, layout, algo: state.algo, state, res, set: (patch) => { Object.assign(state, patch); update(); } };
    const code = codePanel(algo.code(g)), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap g-stage" }), side = h("div", { class: "g-side" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const stats = h("div", { class: "stats-row" });
    let last = -1;
    player = stepper({
      count: res.steps.length, label: "Step", interval: cfg.interval ?? 900,
      render: (i) => {
        const st = res.steps[i], before = Math.abs(i - last) === 1 ? res.steps[last] : null;
        last = i;
        morph(stage, graphSvg(st.transposed ? gT : g, layout, { nodeCls: st.nodes, nodeStyle: st.styles, badges: st.badges, edgeCls: st.edges, active: st.active, flash: changedKeys(before?.badges, st.badges) }));
        side.replaceChildren(...[cfg.side(st, ctx, before)].flat().filter(Boolean));
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.tone ? ` ${st.tone}` : ""}`;
        if (cfg.stats) stats.replaceChildren(...cfg.stats(st, ctx));
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, cfg.title ? cfg.title(ctx) : algo.name), player.el, note,
        traceLayout(h("div", null, stage, legend(cfg.legend(state.algo, g)), side), code, vars), stats),
      ...[cfg.after?.(res, ctx)].flat().filter(Boolean),
      h("section", { class: "card" }, h("h2", null, "Complexity"), complexityCard(cfg.complexity, state.algo),
        h("p", { class: "muted small" }, "V is the number of vertices and E the number of edges.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, exSel, dirLabel, srcLabel, dstLabel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.text = cfg.random(rng(), state.algo, state.directed); textIn.value = state.text; update(); } }, "Random graph"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, cfg.inputLabel ?? "Edges, one per line: A B 4 (the weight is optional; a lone name adds a vertex)", textIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const newQuestion = () => {
    const body = cfg.question(rng());
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  };
  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(cfg.head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}

// A plain drawing of a graph for practice questions.
export function staticGraph(g, opts = {}) {
  return h("div", { class: "chart-wrap g-stage" }, graphSvg(g, layoutGraph(g), opts));
}
export { asText, parseGraph };
