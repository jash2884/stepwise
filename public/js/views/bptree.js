import { BPlusTree, CODE, parseKeys } from "../engines/bptree.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs } from "./kit.js";
import { flyFrom, keyTreeSvg } from "./keytree.js";

// Leaf keys and separator copies are different elements: L12 lives in a leaf,
// I12 is the copy in an internal node (rarely two, mid-deletion).
function bpKeyIds() {
  const seen = new Map();
  return (n, k) => {
    if (n.leaf) return `L${k}`;
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c > 1 ? `I${k}#${c}` : `I${k}`;
  };
}

export const treeSvg = (snap, order) => keyTreeSvg(snap, { cells: order - 1, keyId: bpKeyIds(), leafLinks: true });

const OPS = { search: "Search", insert: "Insert", delete: "Delete" };
const LEGEND = [["Search path", 1], ["Changed / found", 3], ["Overflow / underflow", 8], ["Split", 4], ["Merge", 7]];

// One stepper with the visual beside the pseudocode of whichever operation the
// current frame belongs to, and its variables.
function playFrames(frames, order, holder) {
  const panels = Object.fromEntries(Object.keys(CODE).map((k) => [k, codePanel(CODE[k], { title: `${OPS[k]} (pseudocode)` })]));
  const codeBox = h("div"), vars = varsPanel();
  const stage = h("div", { class: "tree-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
  let last = -1;
  const p = stepper({
    count: frames.length, label: "Step", interval: 1300,
    render: (i) => {
      const f = frames[i];
      const svg = morph(stage, treeSvg(f, order));
      if (f.fly != null && i === last + 1) flyFrom(svg, `I${f.fly}`, `L${f.fly}`);
      last = i;
      const panel = panels[f.op ?? "insert"];
      if (codeBox.firstChild !== panel.el) codeBox.replaceChildren(panel.el);
      panel.show(f.line);
      vars.show(f.vars);
      note.textContent = f.note;
      note.className = `step-note${f.kind === "found" || f.kind === "changed" ? " good" : f.kind === "overflow" || f.kind === "missing" ? " bad" : ""}`;
    },
  });
  holder.replaceChildren(p.el, note, traceLayout(h("div", null, stage,
    h("div", { class: "legend-chips" }, LEGEND.map(([t, c]) => h("span", null, h("i", { style: `--c:var(--series-${c})` }), t)))), { el: codeBox }, vars));
  return p;
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
    const holder = h("div");
    player = playFrames(frames, state.order, holder);
    const facts = tree.facts();
    out.replaceChildren(h("section", { class: "card" }, holder,
      h("div", { class: "stats-row" },
        h("div", { class: "stat" }, h("span", null, "Height"), h("b", null, facts.height)),
        h("div", { class: "stat" }, h("span", null, "Leaves"), h("b", null, facts.leafCount)),
        h("div", { class: "stat" }, h("span", null, "Keys"), h("b", null, facts.leaves.flat().length)),
        h("div", { class: "stat" }, h("span", null, "Keys per node"), h("b", null, `${tree.minLeafKeys}–${tree.maxKeys}`)))));
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
    if (r() < 0.4) return deleteQuestion(r);
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
          const holder = h("div");
          playFrames(frames, order, holder);
          solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Solution"), holder));
        } }, "Show solution")),
      feedback), solution);
  }

  // Delete one key: what does the tree have to do?
  function deleteQuestion(r) {
    const order = 3 + Math.floor(r() * 3);
    const t = new BPlusTree(order), keys = new Set();
    while (keys.size < 8 + Math.floor(r() * 4)) keys.add(1 + Math.floor(r() * 60));
    keys.forEach((k) => t.insert(k));
    const before = t.snapshot([], "");
    const victim = [...keys][Math.floor(r() * keys.size)];
    const frames = t.delete(victim);
    const what = frames.some((f) => f.kind === "merge") ? "merge" : frames.some((f) => /Borrow|Rotate/.test(f.note)) ? "borrow" : "nothing";
    const solution = h("div");
    const labels = { nothing: "Just remove it (no underflow)", borrow: "Borrow from a sibling", merge: "Merge with a sibling" };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Order ${order}: what happens when you delete ${victim}?`),
      h("p", { class: "muted" }, `Leaves need at least ⌈(${order}−1)/2⌉ = ${t.minLeafKeys} key${t.minLeafKeys === 1 ? "" : "s"}. Siblings are tried left first, then right.`),
      h("div", { class: "tree-wrap" }, treeSvg(before, order)),
      choice(Object.entries(labels).map(([k, label]) => ({ label, correct: k === what })), frames.map((f) => f.note).filter((n) => !n.startsWith("Search")).join(" ")),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: () => { const holder = h("div"); playFrames(frames, order, holder); solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Solution"), holder)); } }, "Watch it"))),
    solution);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
