import { AVL, buildAvl, CODE, OPS, rotationCase } from "../engines/avl.js";
import { buildBst, CODE as BST_CODE, countOf, heightOf, traversal } from "../engines/bst.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";
import { bstSvg, legend, numbers, opsTable, parseOps, shuffle, stepCard, tidyFrame } from "./dsa-kit.js";

const EXAMPLES = {
  ll: { name: "LL case: 30 20 10", keys: [30, 20], then: 10 },
  rr: { name: "RR case: 10 20 30", keys: [10, 20], then: 30 },
  lr: { name: "LR case: 30 10 20", keys: [30, 10], then: 20 },
  rl: { name: "RL case: 10 30 20", keys: [10, 30], then: 20 },
  sorted: { name: "Sorted 1 to 7 (a plain BST would be a chain)", keys: [1, 2, 3, 4, 5, 6] , then: 7 },
  big: { name: "Textbook: 50 20 60 10 8 15 32 46 11 48", keys: [50, 20, 60, 10, 8, 15, 32, 46, 11], then: 48 },
  del: { name: "Delete causing two rotations", keys: [50, 25, 75, 10, 30, 60, 80, 5, 15, 27, 55, 1], del: 80 },
};
const LEGEND = [["On the path", "var(--series-1)"], ["Checking", "var(--accent)"], ["Unbalanced (bf ±2)", "var(--bad)"], ["Rotating", "var(--series-7)"], ["New / moved", "var(--good)"]];

const ht = (n) => (n ? 1 + Math.max(ht(n.left), ht(n.right)) : -1);
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
// The balance factor is worked out from the drawn tree, so it's always the true one at that step.
const badge = (n) => { const b = ht(n.left) - ht(n.right); return { badge: sgn(b), badgeCls: Math.abs(b) > 1 ? "bad" : b ? "lean" : "", title: `${n.key}: height ${ht(n)}, balance factor ${sgn(b)}` }; };

export function render(root) {
  const p = readParams();
  const state = { ops: parseOps(p.get("ops") ?? "i50,i20,i60,i10,i8,i15,i32,i46,i11,i48", "id").map(([k, v]) => [k, Number(v)]), from: null };
  let player = null;

  const head = page({
    subject: "Data structures & algorithms", title: "AVL tree",
    lede: "A binary search tree that keeps itself balanced. Watch every balance factor update on the way back up, and the LL, RR, LR and RL rotations glide the nodes into place.",
    theory: h("div", null,
      h("p", null, "An ", h("b", null, "AVL tree"), " is a BST where, at every node, the heights of the two subtrees differ by at most 1. The ", h("b", null, "balance factor"), " bf = height(left) − height(right) must be −1, 0 or +1. That keeps the height below about 1.44 log₂ n, so search, insert and delete are all O(log n), even for sorted input."),
      h("p", null, "Insert and delete work like a plain BST, then walk back up the path, updating heights. The first node found with bf = ±2 is fixed by a rotation, which changes three pointers but keeps the in-order sequence the same:"),
      h("ul", null,
        h("li", null, h("b", null, "LL"), ": too heavy on the left, and the left child leans left (or is level, on delete). One right rotation."),
        h("li", null, h("b", null, "RR"), ": the mirror image. One left rotation."),
        h("li", null, h("b", null, "LR"), ": too heavy on the left, but the left child leans right. Rotate the child left (making it LL), then the node right."),
        h("li", null, h("b", null, "RL"), ": the mirror image. Rotate the child right, then the node left.")),
      h("p", null, "After an insert, one (single or double) rotation is always enough. A delete can shorten a subtree, so it may need a rotation at several levels on the way up.")),
    conventions: [
      "Balance factor = height(left) − height(right); a leaf has height 0 and nil has height −1.",
      "Duplicates are ignored.",
      "Delete with two children uses the in-order successor.",
      "On delete, a child with balance factor 0 is treated as the single-rotation case (LL or RR).",
      "Nodes are drawn by the tree's shape (each parent centred over its children), so in a rotation the pivot visibly swings up and sideways while the old subtree root swings down to the other side.",
    ],
  });

  const keyIn = h("input", { type: "number", min: 0, max: 999, "aria-label": "Key", placeholder: "key", onkeydown: (e) => { if (e.key === "Enter") mutate("i"); } });
  const seqIn = h("input", { type: "text", class: "mono wide", "aria-label": "Keys to build from", value: "10 20 30 40 50 25" });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });
  const btn = (label, fn, cls = "ghost") => h("button", { type: "button", class: `btn ${cls}`, onclick: fn }, label);
  const fail = (e) => msg.replaceChildren(notice("error", e.message));

  function keys() {
    const v = numbers(keyIn.value, { most: 12 });
    if (!v.length) throw new Error("Type a key (0 to 999) first.");
    return v;
  }
  function mutate(kind) {
    msg.replaceChildren();
    try {
      const v = kind === "i" ? keys() : [keys()[0]];
      if (state.ops.length + v.length > 60) throw new Error("That's a lot of history. Build a fresh tree from a sequence instead.");
      state.from = state.ops.length;
      state.ops.push(...v.map((x) => [kind, x]));
      rebuild();
    } catch (e) { fail(e); }
  }
  function build(vals, from = 0) {
    msg.replaceChildren();
    try {
      vals ??= numbers(seqIn.value, { most: 31 });
      seqIn.value = vals.join(" ");
      state.ops = vals.map((v) => ["i", v]);
      state.from = from;
      rebuild();
    } catch (e) { fail(e); }
  }

  function rebuild(searchKey = null) {
    const t = new AVL();
    let steps = [], code = "insert";
    state.ops.forEach(([k, v], i) => {
      const s = k === "i" ? t.insert(v) : t.delete(v);
      if (state.from == null ? i === state.ops.length - 1 : i >= state.from) { steps.push(...s); code = k === "i" ? "insert" : "delete"; }
    });
    if (searchKey != null) { steps = t.search(searchKey); code = "search"; }
    if (!steps.length) steps = [{ tree: t.snapTree(), line: null, note: "The tree is empty. Insert some keys or pick an example.", vars: {} }];
    state.from = null;
    writeParams({ ops: state.ops.map(([k, v]) => k + v).join(",") });
    history.textContent = state.ops.length ? `History: ${state.ops.map(([k, v]) => `${k === "i" ? "+" : "−"}${v}`).join(" ")}` : "";
    show(t, steps, code);
  }

  function show(t, steps, code) {
    player?.destroy();
    const rotations = steps.filter((s) => s.vars?.case).map((s) => s.vars.case);
    // One frame for the whole run: the root's x and the canvas width stay put,
    // so only real changes of shape (rotations, new leaves) move nodes.
    const frame = tidyFrame(steps.map((s) => s.tree));
    const sc = stepCard(steps, {
      title: { insert: "Insert", delete: "Delete", search: "Search" }[code],
      code: code === "search" ? BST_CODE.search : CODE[code], interval: 1100,
      draw: (s) => bstSvg(s, { badge, aria: "AVL tree", layout: "tidy", frame }),
      below: () => [legend(LEGEND), h("p", { class: "muted small" }, "The small number beside each node is its balance factor.")],
    });
    player = sc.player;
    // The same inserts into a plain BST, for comparison.
    const plain = buildBst([]);
    for (const [k, v] of state.ops) (k === "i" ? plain.insert(v) : plain.delete(v));
    const n = countOf(t.root);
    out.replaceChildren(sc.card,
      h("section", { class: "card" }, h("h2", null, "This tree"),
        h("div", { class: "stats-row" }, stat("Keys", n), stat("AVL height", t.height()), stat("Plain BST height, same operations", heightOf(plain.root)), stat("Rotation cases in this run", rotations.length ? rotations.join(", ") : "none")),
        h("p", { class: "muted small" }, n ? `In-order: ${traversal(t.root, "inorder").join(", ")}. Rotations never change this order.` : "")),
      h("section", { class: "card" }, h("h2", null, "Complexity"), opsTable(OPS, code === "search" ? "search" : code),
        h("p", { class: "muted small" }, "A red-black tree is the other common balanced BST: it allows a little more imbalance (height up to 2 log₂ n) in exchange for fewer rotations on update.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => {
          if (ex.del != null) { build(ex.keys, ex.keys.length); state.from = state.ops.length; state.ops.push(["d", ex.del]); rebuild(); }
          else { state.ops = [...ex.keys, ex.then].map((v) => ["i", v]); state.from = ex.keys.length; seqIn.value = [...ex.keys, ex.then].join(" "); rebuild(); }
        }),
        btn("Random", () => { const r = rng(); build(shuffle(Array.from({ length: 99 }, (_, i) => i + 1), r).slice(0, 8 + Math.floor(r() * 5))); }),
        btn("Clear", () => { state.ops = []; rebuild(); }),
        btn("Copy link", (e) => copyLink(e.currentTarget))),
      h("div", { class: "row" }, keyIn, btn("Insert", () => mutate("i"), "primary"), btn("Delete", () => mutate("d")),
        btn("Search", () => { try { msg.replaceChildren(); rebuild(keys()[0]); } catch (e) { fail(e); } })),
      h("label", { class: "stack" }, "Build from a sequence (every insert is animated)", h("div", { class: "row", style: "margin:0" }, seqIn, btn("Build", () => build()))),
      msg, history),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = Math.floor(r() * 3);
    let body;
    if (kind === 0) {
      // Find a short sequence whose last insert triggers a rotation.
      let keys, k, kase = null;
      for (let tries = 0; !kase && tries < 200; tries++) {
        keys = shuffle(Array.from({ length: 40 }, (_, i) => i + 1), r).slice(0, 3 + Math.floor(r() * 4));
        k = keys.pop();
        kase = rotationCase(keys, k);
      }
      const t = buildAvl(keys);
      body = [h("h2", null, `This AVL tree was built from ${keys.join(", ")}. Inserting ${k} unbalances it. Which rotation case is it?`),
        h("div", { class: "chart-wrap" }, bstSvg({ tree: t.snapTree(), lit: {} }, { badge, layout: "tidy" })),
        choice(["LL", "RR", "LR", "RL"].map((c) => ({ label: c, correct: c === kase })), `It's ${kase}: ${kase[0] === "L" ? "the lowest unbalanced node is left-heavy" : "the lowest unbalanced node is right-heavy"}, and ${k} went into its ${kase[0] === "L" ? "left" : "right"} child's ${kase[1] === "L" ? "left" : "right"} subtree.`)];
    } else if (kind === 1) {
      const keys = shuffle(Array.from({ length: 50 }, (_, i) => i + 1), r).slice(0, 6 + Math.floor(r() * 3));
      const t = buildAvl(keys);
      body = [h("h2", null, "Insert these keys into an empty AVL tree, in order. Which key ends up at the root?"), h("p", { class: "grammar-box" }, keys.join(", ")),
        numberQuestion(t.root.key, `After all the rotations the root is ${t.root.key}.`),
        h("details", null, h("summary", null, "Show the tree"), h("div", { class: "chart-wrap" }, bstSvg({ tree: t.snapTree(), lit: {} }, { badge, layout: "tidy" })))];
    } else {
      const keys = Array.from({ length: 4 + Math.floor(r() * 9) }, (_, i) => i + 1);
      const t = buildAvl(keys);
      body = [h("h2", null, `Insert 1, 2, 3, …, ${keys.length} (in that order) into an empty AVL tree. What is its height?`),
        h("p", { class: "muted" }, `A plain BST would be a chain of height ${keys.length - 1}.`),
        numberQuestion(t.height(), `Height ${t.height()}: sorted inserts trigger a stream of RR rotations that keep the tree nearly perfect.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, btn("New question", newQuestion)), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
