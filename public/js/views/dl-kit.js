// Drawing pieces shared by the digital logic views: a stepper wired to the
// pseudocode and variables, 0/1 toggles, K-maps, timing diagrams and state
// diagrams. Colours come from the theme tokens, so both themes work.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { layout, blocks } from "../engines/kmap.js";
import { h, stepper } from "../ui.js";

// A stepper over engine steps: draw(step, i) fills the stage; note, code line
// and variables follow automatically. Returns { el, player }.
export function traced(steps, code, draw, { label = "Step", interval = 1100, start = 0 } = {}) {
  const cp = codePanel(code), vars = varsPanel();
  const stage = h("div", { class: "dl-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" });
  const player = stepper({ count: steps.length, label, interval, start, render: (i) => {
    const s = steps[i];
    stage.replaceChildren(draw(s, i));
    cp.show(s.line); vars.show(s.vars);
    note.textContent = s.note;
    note.className = `step-note${s.bad ? " bad" : i === steps.length - 1 ? " good" : ""}`;
  } });
  return { el: h("div", { class: "dl-traced" }, player.el, note, traceLayout(stage, cp, vars)), player };
}

// A 0/1 button. onChange gets the new value.
export function bitToggle(label, value, onChange) {
  return h("button", { type: "button", class: `dl-bit${value ? " on" : ""}`, "aria-pressed": String(!!value), "aria-label": `${label} = ${value}, press to flip`,
    onclick: () => onChange(value ? 0 : 1) }, h("span", { class: "dl-bit-name" }, label), h("b", null, value));
}

export const sig = (v) => (v === 1 ? "hi" : v === 0 ? "lo" : "unk");

// --- K-map ---------------------------------------------------------------------------------
// values: per minterm 1, 0 or "X". groups: [{ imp, colour (1-8), style: "solid"|"dashed"|"focus" }].
// onCell(m) makes cells clickable. hot: minterms to ring.
export function kmapSvg(n, values, { groups = [], onCell = null, hot = [], names, showIndex = true } = {}) {
  const lay = layout(n, names);
  const C = 44, top = 34, left = 40, gap = 26;
  const rows = lay.rows.length, cols = lay.cols.length;
  const mapW = left + cols * C;
  const W = lay.maps.length * mapW + (lay.maps.length - 1) * gap + 8, H = top + rows * C + 8 + (lay.maps.length > 1 ? 18 : 0);
  const oy = lay.maps.length > 1 ? 18 : 0;
  const els = [];
  lay.maps.forEach((mp, mi) => {
    const ox = mi * (mapW + gap);
    if (mp.label) els.push(h("text", { x: ox + left + (cols * C) / 2, y: 12, "text-anchor": "middle", class: "km-title" }, mp.label));
    els.push(h("text", { x: ox + 4, y: oy + 14, class: "km-axis" }, `${lay.rowVars.join("")}\\${lay.colVars.join("")}`));
    lay.colLabels.forEach((l, c) => els.push(h("text", { x: ox + left + c * C + C / 2, y: oy + top - 8, "text-anchor": "middle", class: "km-head" }, l)));
    lay.rowLabels.forEach((l, r) => els.push(h("text", { x: ox + left - 6, y: oy + top + r * C + C / 2 + 5, "text-anchor": "end", class: "km-head" }, l)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const m = lay.cell(mi, r, c), v = values[m];
      const x = ox + left + c * C, y = oy + top + r * C;
      const g = h("g", { class: `km-cell v${v === "X" ? "x" : v}${hot.includes(m) ? " hot" : ""}${onCell ? " click" : ""}`,
        ...(onCell ? { tabindex: 0, role: "button", "aria-label": `Cell ${m}: ${v === "X" ? "don't-care" : v}. Press to change.`, onclick: () => onCell(m), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCell(m); } } } : {}) },
        h("rect", { x, y, width: C, height: C }),
        h("text", { x: x + C / 2, y: y + C / 2 + 6, "text-anchor": "middle", class: "km-val" }, v === "X" ? "X" : v),
        showIndex ? h("text", { x: x + 4, y: y + 11, class: "km-idx" }, m) : null);
      els.push(g);
    }
  });
  groups.forEach((gr, k) => {
    const inset = 3 + (k % 4) * 3;
    for (const b of blocks(gr.imp, lay)) {
      const ox = b.map * (mapW + gap);
      const x = ox + left + b.c0 * C + inset, y = oy + top + b.r0 * C + inset;
      els.push(h("rect", { x, y, width: (b.c1 - b.c0 + 1) * C - 2 * inset, height: (b.r1 - b.r0 + 1) * C - 2 * inset, rx: 10,
        class: `km-group ${gr.style ?? "solid"}`, style: `--c:var(--series-${((gr.colour ?? k) % 8) + 1})` }));
    }
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dl-svg km-svg", style: `max-width:${W * 1.25}px`, role: "img", "aria-label": `Karnaugh map for ${n} variables` }, els);
}

// --- Timing diagram ---------------------------------------------------------------------------
// rows: [{ name, kind: "cycle" | "edge", values, initial }]. A "cycle" row holds
// one value per clock cycle (an input set up before the edge); an "edge" row
// changes at each rising edge (values[k] is the value after edge k).
// upto: how many edges have happened (later edge values are hidden).
export function timingDiagram(cycles, rows, { upto = cycles, cursor = null, clock = true } = {}) {
  const L = 46, CW = 46, RH = 34, top = 10;
  const all = clock ? [{ name: "CLK", clock: true }, ...rows] : rows;
  const W = L + cycles * CW + 10, H = top + all.length * RH + 14;
  const els = [];
  const edgeX = (k) => L + k * CW + CW / 2;
  for (let k = 0; k < cycles; k++) els.push(h("line", { x1: edgeX(k), x2: edgeX(k), y1: top - 4, y2: H - 12, class: `td-edge${cursor === k ? " now" : ""}` }),
    h("text", { x: edgeX(k), y: H - 2, "text-anchor": "middle", class: "td-num" }, k + 1));
  all.forEach((row, ri) => {
    const y0 = top + ri * RH, hi = y0 + 4, lo = y0 + RH - 10;
    els.push(h("text", { x: 4, y: y0 + RH / 2 + 2, class: "td-name" }, row.name));
    const segs = [];
    if (row.clock) {
      for (let k = 0; k < cycles; k++) { segs.push([L + k * CW, 0], [edgeX(k), 1]); }
      segs.push([L + cycles * CW, 0]);
    } else if (row.kind === "cycle") {
      row.values.forEach((v, k) => segs.push([L + k * CW, v]));
      segs.push([L + cycles * CW, null, true]);
    } else {
      segs.push([L, row.initial]);
      row.values.forEach((v, k) => { if (k < upto) segs.push([edgeX(k), v]); });
      segs.push([upto >= cycles ? L + cycles * CW : edgeX(upto), null, true]);
    }
    // Path from segments: each [x, value] holds until the next x.
    let d = "", unknown = [];
    for (let i = 0; i < segs.length - 1; i++) {
      const [x, v] = segs[i], [x2] = segs[i + 1];
      if (v === null || v === undefined) { unknown.push([x, x2]); continue; }
      const y = v ? hi : lo;
      d += `${d && segs[i - 1] && segs[i - 1][1] !== null && segs[i - 1][1] !== undefined ? "L" : "M"}${x},${y} L${x2},${y} `;
    }
    els.push(h("path", { d, class: `td-wave${row.clock ? " clk" : ""}${row.kind === "edge" ? " out" : ""}` }));
    for (const [x, x2] of unknown) els.push(h("rect", { x, y: hi, width: x2 - x, height: lo - hi, class: "td-unk" }));
    if (!row.clock) row.values.forEach((v, k) => {
      if (row.kind === "edge" && k >= upto) return;
      const x = row.kind === "cycle" ? L + k * CW + CW / 2 : edgeX(k) + CW / 2;
      if (x < W - 8) els.push(h("text", { x, y: y0 + RH / 2 + 3, "text-anchor": "middle", class: "td-val" }, v === null ? "?" : v));
    });
  });
  return h("div", { class: "chart-wrap" }, h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dl-svg td-svg", style: `min-width:${Math.min(W, 340)}px;max-width:${W * 1.3}px`, role: "img", "aria-label": `Timing diagram over ${cycles} clock edges` }, els));
}

// --- State diagram ----------------------------------------------------------------------------
let markerId = 0;
// states: [{ id, label }], edges: [{ from, to, label }], active: id, activeEdge: [from, to].
export function stateDiagram(states, edges, { active = null, activeEdge = null, dim = [] } = {}) {
  const n = states.length, R = Math.max(70, n * 17), cx = R + 40, cy = R + 34, r = 19;
  const pos = new Map(states.map((s, i) => [s.id, { x: cx + R * Math.sin((2 * Math.PI * i) / n), y: cy - R * Math.cos((2 * Math.PI * i) / n) }]));
  const id = `dlm${++markerId}`;
  const els = [h("defs", null, h("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, h("path", { d: "M0,0 L10,5 L0,10 z", class: "sd-head" })))];
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    const on = activeEdge && activeEdge[0] === e.from && activeEdge[1] === e.to;
    if (e.from === e.to) {
      const dx = a.x - cx, dy = a.y - cy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const lx = a.x + ux * (r + 12), ly = a.y + uy * (r + 12);
      els.push(h("circle", { cx: lx, cy: ly, r: 11, class: `sd-edge${on ? " on" : ""}`, fill: "none" }));
      continue;
    }
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    // Bend slightly so a pair of opposite edges don't overlap.
    const mx = (a.x + b.x) / 2 - uy * 14, my = (a.y + b.y) / 2 + ux * 14;
    els.push(h("path", { d: `M${a.x + ux * r},${a.y + uy * r} Q${mx},${my} ${b.x - ux * (r + 2)},${b.y - uy * (r + 2)}`, class: `sd-edge${on ? " on" : ""}`, "marker-end": `url(#${id})` }));
    if (e.label) els.push(h("text", { x: mx, y: my, "text-anchor": "middle", class: "sd-label" }, e.label));
  }
  for (const s of states) {
    const p = pos.get(s.id);
    els.push(h("g", { class: `sd-node${s.id === active ? " on" : ""}${dim.includes(s.id) ? " dim" : ""}` },
      h("circle", { cx: p.x, cy: p.y, r }), h("text", { x: p.x, y: p.y + 4, "text-anchor": "middle" }, s.label)));
  }
  const W = 2 * cx, H = 2 * cy - 10;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dl-svg sd-svg", style: `max-width:${Math.min(W * 1.1, 520)}px`, role: "img", "aria-label": `State diagram: ${edges.map((e) => `${e.from} to ${e.to}`).join(", ")}` }, els);
}

// A row of bits as boxes. marks: per index class names.
export function bitRow(bits, { marks = {}, label = null, cls = "" } = {}) {
  return h("div", { class: `dl-bits ${cls}` }, label ? h("span", { class: "dl-bits-label" }, label) : null,
    [...String(bits)].map((b, i) => h("span", { class: `dl-b${b === "1" ? " one" : ""} ${marks[i] ?? ""}` }, b)));
}

// Segmented buttons for a mode choice.
export function segmented(options, current, onPick, aria) {
  return h("div", { class: "dl-seg", role: "group", "aria-label": aria }, options.map(([id, label]) =>
    h("button", { type: "button", class: "btn ghost small toggle", "aria-pressed": String(id === current), onclick: () => onPick(id) }, label)));
}
