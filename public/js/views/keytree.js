// Multi-key tree nodes (B+ trees and B-trees) drawn as SVG. Each node box and
// each key is its own keyed element, so morph() glides keys from node to node:
// a split pulls keys apart, a merge slides them together, a borrowed key
// travels between siblings. flyFrom() handles a key that is *copied* (a B+
// tree's copy-up), which morph would otherwise just pop into place.
import { h, reducedMotion } from "../ui.js";

const CELL = 34, NODE_H = 32, GAP_X = 18, GAP_Y = 64, PAD = 16;

// Leaves left to right, each parent centred over its children.
export function layout(snap, cells) {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]));
  // Overflowing nodes (mid-split snapshots) get extra cells so every key shows.
  const width = (n) => Math.max(cells, n.keys.length, 1) * CELL;
  const pos = new Map();
  let x = PAD;
  const place = (id) => {
    const n = byId.get(id);
    if (n.leaf) {
      pos.set(id, { x, y: PAD + n.depth * (NODE_H + GAP_Y) });
      x += width(n) + GAP_X;
    } else {
      n.children.forEach(place);
      const first = pos.get(n.children[0]), last = pos.get(n.children.at(-1));
      const centre = (first.x + last.x + width(byId.get(n.children.at(-1)))) / 2;
      pos.set(id, { x: Math.max(PAD, centre - width(n) / 2), y: PAD + n.depth * (NODE_H + GAP_Y) });
    }
  };
  place(snap.root);
  const depth = Math.max(...snap.nodes.map((n) => n.depth));
  const right = Math.max(...snap.nodes.map((n) => pos.get(n.id).x + width(n)));
  return { pos, byId, width, w: Math.max(right + PAD, 200), h: PAD * 2 + (depth + 1) * NODE_H + depth * GAP_Y };
}

// keyId(node, key) names a key so the same key keeps its identity across frames.
// Pointers from internal nodes leave from the gap between keys (child i sits
// between key i−1 and key i), as in the textbook pictures.
export function keyTreeSvg(snap, { cells, keyId, leafLinks = false, aria }) {
  const { pos, byId, width, w, h: height } = layout(snap, cells);
  const lit = new Set(snap.highlight), hot = new Set(snap.keyHot ?? []);
  const kind = snap.kind ?? "path";
  const edges = [], nodes = [], keys = [], links = [];
  for (const n of snap.nodes) {
    const p = pos.get(n.id), nw = width(n), slots = Math.max(cells, n.keys.length, 1);
    n.children.forEach((c, i) => {
      const cp = pos.get(c);
      edges.push(h("line", { x1: p.x + i * CELL, y1: p.y + NODE_H, x2: cp.x + width(byId.get(c)) / 2, y2: cp.y, class: "edge", "data-k": `e:${n.id}>${c}`, "data-ends": `${n.id}|${c}` }));
    });
    if (leafLinks && n.leaf && n.next && pos.has(n.next)) {
      const np = pos.get(n.next);
      links.push(h("line", { x1: p.x + nw, y1: p.y + NODE_H / 2, x2: np.x - 2, y2: np.y + NODE_H / 2, class: "leaf-link", "marker-end": "url(#arrow)", "data-k": `l:${n.id}`, "data-ends": `${n.id}|${n.next}` }));
    }
    nodes.push(h("g", { class: `node${n.leaf ? " leaf" : ""}${lit.has(n.id) ? ` lit ${kind}` : ""}`, "data-k": `n:${n.id}`, "data-x": p.x, "data-y": p.y },
      h("title", null, `${n.leaf ? "Leaf" : "Internal node"}: ${n.keys.join(", ") || "empty"}`),
      h("rect", { x: p.x, y: p.y, width: nw, height: NODE_H, rx: 6 }),
      Array.from({ length: slots - 1 }, (_, i) => h("line", { x1: p.x + (i + 1) * CELL, y1: p.y, x2: p.x + (i + 1) * CELL, y2: p.y + NODE_H, class: "divider" }))));
    n.keys.forEach((k, i) => {
      const x = p.x + i * CELL, y = p.y;
      const id = keyId(n, k);
      keys.push(h("g", { class: `tkey${hot.has(k) ? " hot" : ""}${id.includes("#") ? " dup" : ""}`, "data-k": `k:${id}`, "data-x": x, "data-y": y },
        h("rect", { x: x + 3, y: y + 3, width: CELL - 6, height: NODE_H - 6, rx: 5 }),
        h("text", { x: x + CELL / 2, y: y + NODE_H / 2 + 5, "text-anchor": "middle" }, k)));
    });
  }
  return h("svg", { viewBox: `0 0 ${w} ${height}`, width: w, height, class: "tree keytree", role: "img", "aria-label": aria ?? describe(snap) },
    h("defs", null, h("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "arrowhead" }))),
    edges, links, nodes, keys);
}

export function describe(snap) {
  const levels = new Map();
  for (const n of snap.nodes) levels.set(n.depth, [...(levels.get(n.depth) ?? []), `[${n.keys.join(", ")}]`]);
  return [...levels].map(([d, ns]) => `Level ${d + 1}: ${ns.join(" ")}`).join(". ");
}

// Make the key named `to` start where the key named `from` is and glide up to
// its own place (call right after morph()).
export function flyFrom(svg, to, from) {
  if (reducedMotion()) return;
  const a = svg.querySelector(`[data-k="k:${to}"]`), b = svg.querySelector(`[data-k="k:${from}"]`);
  if (!a || !b) return;
  const dx = Number(b.dataset.x) - Number(a.dataset.x), dy = Number(b.dataset.y) - Number(a.dataset.y);
  a.classList.remove("enter");
  a.classList.add("flying");
  a.style.transform = `translate(${dx}px, ${dy}px)`;
  a.getBoundingClientRect();
  a.classList.add("glide");
  requestAnimationFrame(() => requestAnimationFrame(() => { a.style.transform = ""; }));
}
