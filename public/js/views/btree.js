import { BPlusTree } from "../engines/bptree.js";
import { BTree, CLRS_18_8, CODE, parseKeys } from "../engines/btree.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, stat } from "./kit.js";
import { keyTreeSvg } from "./keytree.js";

// Every key is stored once, so it keeps one identity and glides wherever it
// goes. The only copy is the in-order predecessor/successor in case 2a/2b,
// which sits in its leaf (dashed) until it is deleted there.
function keyIds() {
  const seen = new Map();
  return (n, k) => {
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c > 1 ? `${k}#${c}` : String(k);
  };
}
const treeSvg = (snap, t) => keyTreeSvg(snap, { cells: 2 * t - 1, keyId: keyIds() });

const OPS = { search: "Search", insert: "Insert", delete: "Delete" };
const LEGEND = [["Search path", 1], ["Changed / found", 3], ["Full / missing", 8], ["Split", 4], ["Merge", 7]];
const EXAMPLES = {
  clrs187: { name: "CLRS fig. 18.7 (t = 3): insert B Q L F", t: 3, start: "G M P X / A C D E | J K | N O | R S T U V | Y Z", ops: "iB,iQ,iL,iF" },
  clrs188: { name: "CLRS fig. 18.8 (t = 3): delete F M G D B", t: 3, start: CLRS_18_8, ops: "dF,dM,dG,dD,dB" },
  t2: { name: "2-3-4 tree (t = 2): insert 1 to 10", t: 2, start: "", ops: "i1,i2,i3,i4,i5,i6,i7,i8,i9,i10" },
  succ: { name: "Case 2b: delete 20 (successor)", t: 2, start: "20 / 10 | 30 40", ops: "d20" },
};

function playFrames(frames, t, holder) {
  const panels = Object.fromEntries(Object.keys(CODE).map((k) => [k, codePanel(CODE[k], { title: `${OPS[k]} (pseudocode)` })]));
  const codeBox = h("div"), vars = varsPanel();
  const stage = h("div", { class: "tree-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
  const p = stepper({
    count: frames.length, label: "Step", interval: 1400,
    render: (i) => {
      const f = frames[i];
      morph(stage, treeSvg(f, t));
      const panel = panels[f.op ?? "insert"];
      if (codeBox.firstChild !== panel.el) codeBox.replaceChildren(panel.el);
      panel.show(f.line);
      vars.show(f.vars);
      note.textContent = f.note;
      note.className = `step-note${f.kind === "found" || f.kind === "changed" ? " good" : f.kind === "missing" ? " bad" : ""}`;
    },
  });
  holder.replaceChildren(p.el, note, traceLayout(h("div", null, stage,
    h("div", { class: "legend-chips" }, LEGEND.map(([text, c]) => h("span", null, h("i", { style: `--c:var(--series-${c})` }), text)))), { el: codeBox }, vars));
  return p;
}

const opName = (o) => `${{ i: "insert", d: "delete", s: "search" }[o[0]]} ${o.slice(1)}`;
const parseOp = (o) => { const v = o.slice(1); return /^-?\d+$/.test(v) ? Number(v) : v.toUpperCase(); };

export function render(root) {
  const p = readParams();
  const state = {
    t: [2, 3, 4].includes(Number(p.get("t"))) ? Number(p.get("t")) : 3,
    start: p.get("tree") ?? EXAMPLES.clrs188.start,
    ops: p.has("ops") ? p.get("ops").split(",").filter(Boolean) : EXAMPLES.clrs188.ops.split(","),
  };
  let tree, player = null;

  const head = page({
    subject: "Databases", title: "B-tree",
    lede: "Insert, delete and search in a B-tree, where keys live in internal nodes too. Watch medians move up on splits, and predecessors, successors, borrows and merges on deletion.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "B-tree"), " of minimum degree t keeps every node (except the root) between t−1 and 2t−1 keys, and every leaf at the same depth. Unlike a ", h("b", null, "B+ tree"), ", each key is stored ", h("b", null, "exactly once"), ", in whatever node it ends up in, so a search can stop early at an internal node, but there is no linked list of leaves for range scans and internal nodes are bulkier (they carry record pointers)."),
      h("p", null, h("b", null, "Insert"), " goes down in one pass and splits any full node it meets, moving the median key up. That way the parent always has room, and the tree only grows at the root."),
      h("p", null, h("b", null, "Delete"), " also goes down in one pass, making sure every node it enters has at least t keys, so a key can be removed without the node underflowing. The cases (CLRS numbering): ",
        h("b", null, "1"), " key in a leaf: remove it. ", h("b", null, "2a/2b"), " key in an internal node: replace it with its in-order predecessor or successor from a child with ≥ t keys, then delete that. ", h("b", null, "2c"), " both children minimal: merge them around the key. ",
        h("b", null, "3a"), " the child to descend into is minimal but a sibling isn't: rotate a key through the parent. ", h("b", null, "3b"), " both are minimal: merge them, pulling the separator down.")),
    conventions: [
      "Minimum degree t (CLRS): non-root nodes hold t−1 to 2t−1 keys. In the 'order m' convention this is m = 2t (max children).",
      "Splits happen on the way down (pre-emptive splitting), so a full root splits even when the new key would have fitted lower down.",
      "Deletion prefers the predecessor (2a) over the successor (2b); for 3a and 3b the left sibling is tried before the right.",
      "Keys are unique: whole numbers, or single letters as in the CLRS figures. A dashed key is a predecessor/successor copy about to be deleted from its leaf.",
    ],
  });

  const tSel = h("select", { "aria-label": "Minimum degree", onchange: (e) => { state.t = Number(e.target.value); state.start = ""; state.ops = []; rebuild(); } },
    [2, 3, 4].map((t) => h("option", { value: t, selected: t === state.t }, `t = ${t} (${t - 1}–${2 * t - 1} keys)`)));
  const keysIn = h("input", { type: "text", placeholder: "e.g. 15 or 3 8 21 or A K", "aria-label": "Keys", class: "wide", onkeydown: (e) => { if (e.key === "Enter") act("i"); } });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });

  function apply(t, kind, k) { return kind === "i" ? t.insert(k) : kind === "d" ? t.delete(k) : t.search(k).frames; }

  // Rebuild the tree from its starting shape and history; show the last operation's frames.
  function rebuild(only = null) {
    tree = state.start ? BTree.fromLevels(state.t, state.start) : new BTree(state.t);
    let frames = [];
    const n = state.ops.length - (only ?? 1);
    state.ops.forEach((o, i) => {
      const f = apply(tree, o[0], parseOp(o));
      if (i >= n) f.forEach((x, j) => frames.push(j === 0 && (only ?? 1) > 1 ? { ...x, note: `[${opName(o)}] ${x.note}` } : x));
    });
    writeParams({ t: state.t, tree: state.start, ops: state.ops.join(",") });
    history.textContent = [state.start ? `Start: ${state.start}` : "Start: empty tree", ...state.ops.map(opName)].join(" · ");
    show(frames.length ? frames : [tree.snapshot([], state.start ? "The starting tree." : "Empty tree. Insert some keys to begin.", { line: null })]);
  }

  function show(frames) {
    player?.destroy();
    const holder = h("div");
    player = playFrames(frames, state.t, holder);
    const facts = tree.facts();
    // The same keys in a B+ tree with the same maximum fan-out (order 2t).
    let compare = null;
    if (facts.keys.length && typeof facts.keys[0] === "number") {
      const order = Math.min(7, 2 * state.t), bp = new BPlusTree(order);
      facts.keys.forEach((k) => bp.insert(k));
      const bf = bp.facts();
      compare = h("p", { class: "muted small" }, `For comparison: the same ${facts.keys.length} keys inserted in increasing order into a B+ tree of order ${order} give height ${bf.height} with ${bf.leafCount} leaves. There every key sits in a leaf, and internal nodes repeat some keys as separators; here each key is stored once.`);
    }
    out.replaceChildren(h("section", { class: "card" }, holder,
      h("div", { class: "stats-row" }, stat("Height", facts.height), stat("Nodes", facts.nodes), stat("Keys", facts.keys.length), stat("Keys per node", `${state.t - 1}–${2 * state.t - 1}`)),
      compare));
  }

  function act(kind) {
    msg.replaceChildren();
    let keys;
    try { keys = parseKeys(keysIn.value); } catch (e) { msg.replaceChildren(notice("error", e.message)); return; }
    if (!keys.length) { msg.replaceChildren(notice("error", "Type one or more keys first.")); return; }
    if (state.ops.length + keys.length > 80) { msg.replaceChildren(notice("error", "That's a big tree. Reset to start a new one.")); return; }
    const before = state.ops.length;
    try {
      const probe = state.start ? BTree.fromLevels(state.t, state.start) : new BTree(state.t);
      state.ops.forEach((o) => apply(probe, o[0], parseOp(o)));
      keys.forEach((k) => apply(probe, kind, k));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); return; }
    keys.forEach((k) => state.ops.push(`${kind}${k}`));
    rebuild(state.ops.length - before);
    // Searches don't change the tree, so they needn't stay in the history.
    state.ops = state.ops.filter((o) => o[0] !== "s");
    writeParams({ t: state.t, tree: state.start, ops: state.ops.join(",") });
    keysIn.value = "";
    keysIn.focus();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, tSel, keysIn,
        h("button", { type: "button", class: "btn primary", onclick: () => act("i") }, "Insert"),
        h("button", { type: "button", class: "btn ghost", onclick: () => act("d") }, "Delete"),
        h("button", { type: "button", class: "btn ghost", onclick: () => act("s") }, "Search")),
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { state.t = ex.t; tSel.value = ex.t; state.start = ex.start; state.ops = ex.ops.split(","); rebuild(state.ops.length); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.start = ""; state.ops = []; rebuild(); } }, "Reset"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const r = rng(); const ks = new Set(); while (ks.size < 12) ks.add(1 + Math.floor(r() * 80)); state.start = ""; state.ops = [...ks].map((k) => `i${k}`); rebuild(); } }, "Random tree"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      history, msg),
    out);

  // --- Practice -------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  const caseList = (frames) => frames.map((f) => /Case (\w+)/.exec(f.note)?.[1]).filter(Boolean).join(" → ") || "none (not found)";
  function newQuestion() {
    const r = rng();
    const t = 2 + Math.floor(r() * 2);
    const keys = [];
    while (keys.length < 9 + Math.floor(r() * 5)) { const k = 1 + Math.floor(r() * 60); if (!keys.includes(k)) keys.push(k); }
    const solution = h("div");
    const watch = (frames) => h("button", { type: "button", class: "btn ghost", onclick: () => { const holder = h("div"); playFrames(frames, t, holder); solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Solution"), holder)); } }, "Watch the solution");
    const top = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    if (r() < 0.5) {
      const tr = new BTree(t), frames = [];
      keys.forEach((k) => tr.insert(k).forEach((x, j) => frames.push(j === 0 ? { ...x, note: `[Insert ${k}] ${x.note}` } : x)));
      const facts = tr.facts();
      const right = facts.root.join(" ");
      const wrong = new Set([right]);
      for (const alt of [new BTree(t === 2 ? 3 : 2), new BTree(t)]) { (alt.t === t ? [...keys].reverse() : keys).forEach((k) => alt.insert(k)); wrong.add(alt.facts().root.join(" ")); }
      const bp = new BPlusTree(2 * t); keys.forEach((k) => bp.insert(k)); wrong.add(bp.facts().root.join(" "));
      practice.replaceChildren(h("section", { class: "card" }, top,
        h("h2", null, `Insert into an empty B-tree with t = ${t}. What is in the root at the end?`),
        h("p", { class: "keys-list" }, keys.join(", ")),
        h("p", { class: "muted" }, `Nodes hold ${t - 1} to ${2 * t - 1} keys. Remember: full nodes are split on the way down.`),
        choice([...wrong].sort(() => r() - 0.5).map((o) => ({ label: `[${o}]`, correct: o === right })), `The final tree is ${tr.levels().split(" / ").map((l) => `[${l.replace(/ \| /g, "] [")}]`).join(" / ")}, height ${facts.height}.`),
        watch(frames)), solution);
      return;
    }
    const tr = new BTree(t);
    keys.forEach((k) => tr.insert(k));
    const before = tr.snapshot([], "");
    const options = new Map();
    for (const k of tr.inorder()) { const c = BTree.fromLevels(t, tr.levels()); options.set(k, caseList(c.delete(k))); }
    const victim = [...options.keys()][Math.floor(r() * options.size)];
    const right = options.get(victim);
    const frames = tr.delete(victim);
    const labels = [...new Set([right, ...[...options.values()].sort(() => r() - 0.5)])].slice(0, 4).sort(() => r() - 0.5);
    practice.replaceChildren(h("section", { class: "card" }, top,
      h("h2", null, `t = ${t}: which deletion cases happen, in order, when you delete ${victim}?`),
      h("div", { class: "tree-wrap" }, treeSvg(before, t)),
      choice(labels.map((l) => ({ label: l, correct: l === right })), frames.map((f) => f.note).filter((n) => /Case/.test(n)).join(" ")),
      watch(frames)), solution);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  try { rebuild(p.has("ops") ? 1 : state.ops.length); } catch (e) { state.start = ""; state.ops = []; rebuild(); msg.replaceChildren(notice("error", e.message)); }
  return () => player?.destroy();
}
