// Pieces shared by the data-structure tools (BST, AVL, heap, trie, union-find):
// tree layouts, a keyed SVG that morph() can glide, the step card with
// pseudocode and variables, and a per-operation complexity table.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, morph, stepper } from "../ui.js";

export const R = 17;

// Binary trees: x is the in-order rank and y the depth, so a left-only child
// really sits to the left, and a rotation slides every node sideways.
export function binaryLayout(root, { gapX = 44, gapY = 64, pad = 32, top = pad } = {}) {
  const pos = new Map();
  let i = 0, depth = 0;
  const walk = (n, d) => {
    if (!n) return;
    walk(n.left, d + 1);
    pos.set(n.id, { x: pad + i++ * gapX, y: top + d * gapY });
    depth = Math.max(depth, d);
    walk(n.right, d + 1);
  };
  walk(root, 0);
  return { pos, W: pad * 2 + Math.max(0, i - 1) * gapX, H: top + pad + depth * gapY, count: i };
}

// Nodes and edges for a binary tree of { id, key, left, right }.
export function binaryParts(root, pos, nodeOf) {
  const nodes = [], edges = [];
  const walk = (n) => {
    if (!n) return;
    const p = pos.get(n.id);
    nodes.push({ id: n.id, x: p.x, y: p.y, label: String(n.key), ...nodeOf(n) });
    for (const c of [n.left, n.right]) if (c) { edges.push({ from: n.id, to: c.id }); walk(c); }
  };
  walk(root);
  return { nodes, edges };
}

// Forests of { id, kids }: leaves left to right, each parent centred over its children.
export function forestLayout(roots, { gapX = 44, gapY = 62, pad = 32, rootGap = 18, top = pad } = {}) {
  const pos = new Map();
  let x = pad, depth = 0;
  const place = (n, d) => {
    depth = Math.max(depth, d);
    if (!n.kids.length) { pos.set(n.id, { x, y: top + d * gapY }); x += gapX; return; }
    n.kids.forEach((k) => place(k, d + 1));
    pos.set(n.id, { x: (pos.get(n.kids[0].id).x + pos.get(n.kids.at(-1).id).x) / 2, y: top + d * gapY });
  };
  roots.forEach((r, i) => { if (i) x += rootGap; place(r, 0); });
  return { pos, W: Math.max(x - gapX + pad, pad * 2), H: top + pad + depth * gapY };
}

const f1 = (v) => Number(v).toFixed(1);

// One keyed SVG. nodes: [{ id, x, y, label, cls, badge, badgeCls, sub, ring }],
// edges: [{ from, to, label, cls }], cells: [{ k, x, y, label, cls, w }] (array
// slots or floating values that glide too), extra: static SVG pieces.
export function treeSvg({ nodes, edges = [], cells = [], extra = [], W, H, aria, cls = "", arrows = false }) {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const edgeEls = edges.map((e) => {
    const a = at.get(e.from), b = at.get(e.to);
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const ends = `${e.from}|${e.to}`;
    // Union-find edges point child → parent, so they're drawn from the child.
    const [s, t, su, sv] = arrows ? [b, a, -ux, -uy] : [a, b, ux, uy];
    return [
      h("line", { x1: f1(s.x + su * R), y1: f1(s.y + sv * R), x2: f1(t.x - su * (R + (arrows ? 3 : 0))), y2: f1(t.y - sv * (R + (arrows ? 3 : 0))), class: `dt-edge ${e.cls ?? ""}`, "marker-end": arrows ? "url(#dt-arrow)" : null, "data-k": `e:${e.to}`, "data-ends": ends }),
      e.label != null ? h("text", { x: f1((a.x + b.x) / 2 - uy * 11 - 1), y: f1((a.y + b.y) / 2 + ux * 11 + 4), "text-anchor": "middle", class: `dt-elabel ${e.cls ?? ""}`, "data-k": `l:${e.to}`, "data-ends": ends }, e.label) : null,
    ];
  });
  const nodeEls = nodes.map((n) => h("g", { class: `dt-node ${n.cls ?? ""}`, "data-k": `n:${n.id}`, "data-x": f1(n.x), "data-y": f1(n.y) },
    n.title ? h("title", null, n.title) : null,
    h("circle", { cx: f1(n.x), cy: f1(n.y), r: R }),
    n.ring ? h("circle", { cx: f1(n.x), cy: f1(n.y), r: R - 4, class: "ring" }) : null,
    h("text", { x: f1(n.x), y: f1(n.y + 4.5), "text-anchor": "middle", class: "dt-label" }, n.label),
    n.badge != null ? h("text", n.badgeTop ? { x: f1(n.x), y: f1(n.y - R - 6), "text-anchor": "middle", class: `dt-badge ${n.badgeCls ?? ""}` } : { x: f1(n.x + R + 3), y: f1(n.y + 4), class: `dt-badge ${n.badgeCls ?? ""}` }, n.badge) : null,
    n.sub != null ? h("text", { x: f1(n.x), y: f1(n.y + R + 13), "text-anchor": "middle", class: "dt-sub" }, n.sub) : null));
  const cellEls = cells.map((c) => {
    const w = c.w ?? 36;
    return h("g", { class: `dt-cell ${c.cls ?? ""}`, "data-k": `c:${c.k}`, "data-x": f1(c.x), "data-y": f1(c.y) },
      h("rect", { x: f1(c.x - w / 2), y: f1(c.y - 15), width: w, height: 30, rx: 6 }),
      h("text", { x: f1(c.x), y: f1(c.y + 5), "text-anchor": "middle" }, c.label));
  });
  return h("svg", { viewBox: `0 0 ${Math.ceil(W)} ${Math.ceil(H)}`, class: `dsa-tree ${cls}`, role: "img", "aria-label": aria, style: `min-width:${Math.min(Math.ceil(W), 460)}px;max-width:${Math.max(Math.ceil(W * 1.15), 220)}px` },
    arrows ? h("defs", null, h("marker", { id: "dt-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "dt-arrowhead" }))) : null,
    extra, edgeEls, nodeEls, cellEls);
}

// A row of chips: the visit order, the recursion stack or the BFS queue.
export function chips(label, items, cls = "") {
  return h("div", { class: `dt-chips ${cls}` }, h("span", { class: "dt-chips-label" }, label),
    items.length ? items.map((v, i) => h("i", { class: i === items.length - 1 ? "last" : null }, v)) : h("em", null, "empty"));
}

// Player + note + (visual | pseudocode, variables). draw(step) returns the SVG;
// below(step) returns any HTML to show under it.
export function stepCard(steps, { title, code, draw, below, interval = 950, start = 0 }) {
  const cp = codePanel(code), vp = varsPanel();
  const stage = h("div", { class: "chart-wrap dt-stage" }), extra = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
  const player = stepper({
    count: steps.length, interval, start,
    render: (i) => {
      const s = steps[i];
      morph(stage, draw(s));
      extra.replaceChildren(...[below?.(s)].flat().filter(Boolean));
      cp.show(s.line);
      vp.show(s.vars);
      note.textContent = s.note;
      note.className = `step-note${s.done ? " good" : s.bad ? " bad" : ""}`;
    },
  });
  const card = h("section", { class: "card" }, title ? h("h2", null, title) : null, player.el, note, traceLayout(h("div", null, stage, extra), cp, vp));
  return { card, player };
}

// Operation | average | worst | why, with the current operation highlighted.
export function opsTable(rows, current) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse complexity dt-ops" },
    h("thead", null, h("tr", null, ["Operation", "Average", "Worst", "Why"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "hot" : null },
      h("th", { scope: "row" }, r.name), h("td", null, r.avg), h("td", null, r.worst), h("td", { class: "left" }, r.why))))));
}

export const legend = (items) => h("div", { class: "legend-chips" }, items.map(([t, c]) => h("span", null, h("i", { style: `--c:${c}` }), t)));

// "i50,i30,d30" → [["i", "50"], ["i", "30"], ["d", "30"]]
export const parseOps = (text, kinds) => String(text ?? "").split(",").map((s) => s.trim()).filter((s) => s && kinds.includes(s[0])).map((s) => [s[0], s.slice(1)]);

export function numbers(text, { min = 0, max = 999, most = 31 } = {}) {
  const vals = String(text).split(/[\s,]+/).filter(Boolean).map(Number);
  if (vals.some((v) => !Number.isInteger(v))) throw new Error("Enter whole numbers separated by spaces or commas.");
  if (vals.some((v) => v < min || v > max)) throw new Error(`Use numbers from ${min} to ${max}.`);
  if (vals.length > most) throw new Error(`Use at most ${most} numbers so the drawing stays readable.`);
  return vals;
}

// A BST/AVL step: the tree, node states from step.lit, an optional badge per
// node, and the key being inserted or searched floating beside the current node.
export function bstSvg(step, { badge, aria = "Binary search tree" } = {}) {
  if (!step.tree) return treeSvg({ nodes: [], W: 240, H: 90, aria: "Empty tree", extra: [h("text", { x: 120, y: 54, "text-anchor": "middle", class: "dt-empty" }, "Empty tree")] });
  const { pos, W, H } = binaryLayout(step.tree, { top: 54 });
  const { nodes, edges } = binaryParts(step.tree, pos, (n) => ({ cls: step.lit?.[n.id] ?? "", ...(badge ? badge(n, step) : {}) }));
  const cells = [];
  if (step.probe && pos.has(step.probe.at)) {
    const p = pos.get(step.probe.at), dx = step.probe.side === "left" ? -22 : step.probe.side === "right" ? 22 : 0;
    cells.push({ k: "probe", x: p.x + dx, y: p.y - 38, label: step.probe.value, cls: "probe", w: 36 });
  }
  return treeSvg({ nodes, edges, cells, W, H, aria: `${aria}: keys ${nodes.map((n) => n.label).sort((a, b) => a - b).join(", ")}` });
}

export const shuffle = (a, r) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
