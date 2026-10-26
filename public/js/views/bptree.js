import { BPlusTree, parseKeys } from "../engines/bptree.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

const CELL = 34, NODE_H = 32, GAP_X = 18, GAP_Y = 64, PAD = 16;

// Lay the snapshot out: leaves left to right, each parent centred over its children.
export function layout(snap, order) {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]));
  // Overflowing nodes (mid-split snapshots) get an extra cell so every key shows.
  const width = (n) => Math.max(order - 1, n.keys.length, 1) * CELL;
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
      pos.set(id, { x: centre - width(n) / 2, y: PAD + n.depth * (NODE_H + GAP_Y) });
    }
  };
  place(snap.root);
  const depth = Math.max(...snap.nodes.map((n) => n.depth));
  return { pos, byId, width, w: Math.max(x - GAP_X + PAD, 200), h: PAD * 2 + (depth + 1) * NODE_H + depth * GAP_Y };
}

export function treeSvg(snap, order) {
  const { pos, byId, width, w, h: height } = layout(snap, order);
  const lit = new Set(snap.highlight);
  const kind = snap.kind ?? "path";
  const edges = [], nodes = [], links = [];
  for (const n of snap.nodes) {
    const p = pos.get(n.id), nw = width(n);
    n.children.forEach((c, i) => {
      const cp = pos.get(c);
      edges.push(h("line", { x1: p.x + i * CELL, y1: p.y + NODE_H, x2: cp.x + width(byId.get(c)) / 2, y2: cp.y, class: "edge" }));
    });
    if (n.leaf && n.next && pos.has(n.next)) {
      const np = pos.get(n.next);
      links.push(h("line", { x1: p.x + nw, y1: p.y + NODE_H / 2, x2: np.x - 2, y2: np.y + NODE_H / 2, class: "leaf-link", "marker-end": "url(#arrow)" }));
    }
    nodes.push(h("g", { class: `node${n.leaf ? " leaf" : ""}${lit.has(n.id) ? ` lit ${kind}` : ""}` },
      h("title", null, `${n.leaf ? "Leaf" : "Internal node"}: ${n.keys.join(", ") || "empty"}`),
      h("rect", { x: p.x, y: p.y, width: nw, height: NODE_H, rx: 6 }),
      Array.from({ length: Math.max(order - 1, n.keys.length, 1) }, (_, i) => [
        i ? h("line", { x1: p.x + i * CELL, y1: p.y, x2: p.x + i * CELL, y2: p.y + NODE_H, class: "divider" }) : null,
        n.keys[i] != null ? h("text", { x: p.x + i * CELL + CELL / 2, y: p.y + NODE_H / 2 + 5, "text-anchor": "middle" }, n.keys[i]) : null,
      ])));
  }
  return h("svg", { viewBox: `0 0 ${w} ${height}`, width: w, height, class: "tree", role: "img", "aria-label": describe(snap) },
    h("defs", null, h("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "arrowhead" }))),
    edges, links, nodes);
}

function describe(snap) {
  const levels = new Map();
  for (const n of snap.nodes) levels.set(n.depth, [...(levels.get(n.depth) ?? []), `[${n.keys.join(", ")}]`]);
  return [...levels].map(([d, ns]) => `Level ${d + 1}: ${ns.join(" ")}`).join(". ");
}

export function render(root) {
  const params = readParams();
  const state = { order: Number(params.get("order")) || 4, ops: params.get("ops") ? params.get("ops").split(",") : ["i10", "i20", "i5", "i6", "i12", "i30", "i7", "i17"] };
  let tree, player = null;

  const head = page({
    subject: "Databases",
    title: "B+ tree",
    lede: "Insert, delete and search keys and watch every split, borrow and merge that keeps the tree balanced.",
    theory: h("div", null,
      h("p", null, "A B+ tree keeps all keys in its ", h("b", null, "leaves"), " (linked left to right for range scans). ", h("b", null, "Internal nodes"), " only hold separator keys that route a search down."),
      h("p", null, "Every leaf is at the same depth. When a node overflows it ", h("b", null, "splits"), "; when it underflows after a deletion it ", h("b", null, "borrows"), " from a sibling or ", h("b", null, "merges"), " with one, which can shrink the tree.")),
    conventions: [
      "Order n = maximum children per node, so at most n − 1 keys per node.",
      "Leaves keep at least ⌈(n−1)/2⌉ keys; internal nodes at least ⌈n/2⌉ children (the root is exempt).",
      "Leaf split: the left leaf keeps ⌈n/2⌉ keys and the right leaf's first key is COPIED up.",
      "Internal split: the middle key MOVES up.",
      "Deletion borrows from the left sibling first, then the right, before merging. Separators always equal the smallest key to their right.",
    ],
  });

  const orderSel = h("select", { "aria-label": "Order", onchange: (e) => { state.order = Number(e.target.value); state.ops = []; rebuild(); } },
    [3, 4, 5, 6, 7].map((n) => h("option", { value: n, selected: n === state.order }, `Order ${n} (max ${n - 1} keys)`)));
  const keysIn = h("input", { type: "text", placeholder: "e.g. 15 or 3 8 21", "aria-label": "Keys", class: "wide", onkeydown: (e) => { if (e.key === "Enter") act("i"); } });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });

  function rebuild(play = null) {
    tree = new BPlusTree(state.order);
    let frames = [];
    for (const op of state.ops) {
      const k = Number(op.slice(1));
      const f = op[0] === "i" ? tree.insert(k) : op[0] === "d" ? tree.delete(k) : tree.search(k).frames;
      frames = f;
    }
    writeParams({ order: state.order, ops: state.ops.join(",") });
    history.textContent = state.ops.length ? `History: ${state.ops.map((o) => `${{ i: "insert", d: "delete", s: "search" }[o[0]]} ${o.slice(1)}`).join(" · ")}` : "Empty tree. Insert some keys to begin.";
    show(play ?? (frames.length ? frames : [tree.snapshot([], "Empty tree.")]));
  }

  function show(frames) {
    player?.destroy();
    const stage = h("div", { class: "tree-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({
      count: frames.length, label: "Step", interval: 1300, start: 0,
      render: (i) => { stage.replaceChildren(treeSvg(frames[i], state.order)); note.textContent = frames[i].note; },
    });
    const facts = tree.facts();
    out.replaceChildren(h("section", { class: "card" }, player.el, stage, note,
      h("div", { class: "stats-row" },
        h("div", { class: "stat" }, h("span", null, "Height"), h("b", null, facts.height)),
        h("div", { class: "stat" }, h("span", null, "Leaves"), h("b", null, facts.leafCount)),
        h("div", { class: "stat" }, h("span", null, "Keys"), h("b", null, facts.leaves.flat().length)))));
  }

  function act(kind) {
    msg.replaceChildren();
    let keys;
    try { keys = parseKeys(keysIn.value); } catch (e) { msg.replaceChildren(notice("error", e.message)); return; }
    if (!keys.length) { msg.replaceChildren(notice("error", "Type one or more keys first.")); return; }
    if (state.ops.length + keys.length > 80) { msg.replaceChildren(notice("error", "That's a big tree. Reset to start a new one.")); return; }
    // Replay history to the current tree, then collect the frames of just these operations.
    rebuild();
    const frames = [];
    for (const k of keys) {
      try {
        const f = kind === "i" ? tree.insert(k) : kind === "d" ? tree.delete(k) : tree.search(k).frames;
        f.forEach((x, j) => frames.push(j === 0 && keys.length > 1 ? { ...x, note: `[${kind === "i" ? "Insert" : kind === "d" ? "Delete" : "Search"} ${k}] ${x.note}` } : x));
        state.ops.push(`${kind}${k}`);
      } catch (e) { msg.replaceChildren(notice("error", e.message)); break; }
    }
    keysIn.value = "";
    writeParams({ order: state.order, ops: state.ops.join(",") });
    history.textContent = `History: ${state.ops.map((o) => `${{ i: "insert", d: "delete", s: "search" }[o[0]]} ${o.slice(1)}`).join(" · ")}`;
    // Searches don't change the tree, so they needn't stay in the history.
    state.ops = state.ops.filter((o) => o[0] !== "s");
    show(frames);
    keysIn.focus();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, orderSel, keysIn,
        h("button", { type: "button", class: "btn primary", onclick: () => act("i") }, "Insert"),
        h("button", { type: "button", class: "btn ghost", onclick: () => act("d") }, "Delete"),
        h("button", { type: "button", class: "btn ghost", onclick: () => act("s") }, "Search")),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.ops = []; rebuild(); } }, "Reset"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const r = rng(); const ks = new Set(); while (ks.size < 10) ks.add(1 + Math.floor(r() * 60)); state.ops = [...ks].map((k) => `i${k}`); rebuild(); } }, "Random tree"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      history, msg),
    out);

  // --- Practice: predict the shape after a run of inserts --------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const order = 3 + Math.floor(r() * 3);
    const keys = [];
    while (keys.length < 7 + Math.floor(r() * 4)) { const k = 1 + Math.floor(r() * 50); if (!keys.includes(k)) keys.push(k); }
    const t = new BPlusTree(order);
    keys.forEach((k) => t.insert(k));
    const facts = t.facts();
    const rootIn = h("input", { type: "text", placeholder: "e.g. 12 30", "aria-label": "Root keys" });
    const leavesIn = h("input", { type: "number", min: 1, "aria-label": "Number of leaves" });
    const heightIn = h("input", { type: "number", min: 1, "aria-label": "Height" });
    const feedback = h("div"), solution = h("div");
    const mark = (el, ok, expected) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${expected}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Insert into an empty B+ tree of order ${order}`),
      h("p", { class: "keys-list" }, keys.join(", ")),
      h("p", { class: "muted" }, `At most ${order - 1} keys per node. Work it out on paper, then answer:`),
      h("div", { class: "qa" },
        h("label", null, "Keys in the root (in order)", rootIn),
        h("label", null, "Number of leaves", leavesIn),
        h("label", null, "Height (levels, counting the leaves)", heightIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          let rootKeys = [];
          try { rootKeys = parseKeys(rootIn.value); } catch { /* marked wrong below */ }
          const okRoot = rootKeys.join(",") === facts.root.join(",");
          const okLeaves = Number(leavesIn.value) === facts.leafCount, okHeight = Number(heightIn.value) === facts.height;
          mark(rootIn, okRoot, facts.root.join(" ")); mark(leavesIn, okLeaves, facts.leafCount); mark(heightIn, okHeight, facts.height);
          const n = [okRoot, okLeaves, okHeight].filter(Boolean).length;
          feedback.replaceChildren(notice(n === 3 ? "good" : "info", n === 3 ? "All three right! 🎉" : `${n} / 3 right. Red answers are wrong; hover them, or watch the solution.`));
        } }, "Check"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const replay = new BPlusTree(order), frames = [];
          keys.forEach((k) => replay.insert(k).forEach((x, j) => frames.push(j === 0 ? { ...x, note: `[Insert ${k}] ${x.note}` } : x)));
          const stage = h("div", { class: "tree-wrap" }), note = h("p", { class: "step-note" });
          const p = stepper({ count: frames.length, label: "Step", interval: 1200, render: (i) => { stage.replaceChildren(treeSvg(frames[i], order)); note.textContent = frames[i].note; } });
          solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Solution"), p.el, stage, note));
        } }, "Show solution")),
      feedback), solution);
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  rebuild();
  return () => player?.destroy();
}
