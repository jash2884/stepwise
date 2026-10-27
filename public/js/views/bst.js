import { BST, buildBst, CODE, countOf, OPS, traversal } from "../engines/bst.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";
import { bstSvg, chips, legend, numbers, opsTable, parseOps, shuffle, stepCard } from "./dsa-kit.js";

const TRAVERSALS = { inorder: "In-order", preorder: "Pre-order", postorder: "Post-order", levelorder: "Level-order" };
const NAMED = { min: "Minimum", max: "Maximum", height: "Height", ...TRAVERSALS };
const EXAMPLES = {
  textbook: { name: "Balanced: 50 30 70 20 40 60 80", keys: [50, 30, 70, 20, 40, 60, 80] },
  deletes: { name: "For deleting: 50 30 70 20 40 60 80 35 45 65", keys: [50, 30, 70, 20, 40, 60, 80, 35, 45, 65], q: null, then: ["d", 30] },
  chain: { name: "Sorted input makes a chain: 10 20 30 40 50", keys: [10, 20, 30, 40, 50], q: "height" },
  zigzag: { name: "Zig-zag: 50 10 40 20 30", keys: [50, 10, 40, 20, 30] },
  traversal: { name: "Traversals: 8 3 10 1 6 14 4 7 13", keys: [8, 3, 10, 1, 6, 14, 4, 7, 13], q: "inorder" },
};
export const LEGEND = [["On the path", "var(--series-1)"], ["Current", "var(--accent)"], ["Found / new", "var(--good)"], ["Removed / missing", "var(--bad)"], ["Successor", "var(--series-4)"], ["Waiting (stack or queue)", "var(--series-7)"]];

// Which pseudocode and complexity row a query or operation uses.
function query(t, q) {
  if (q === "min" || q === "max") return { steps: t.extreme(q), code: q, row: "min" };
  if (q === "height") return { steps: t.heightSteps(), code: "height", row: "height" };
  if (TRAVERSALS[q]) return { steps: t.traverse(q), code: q, row: "traverse" };
  const m = /^([sx])(\d+)$/.exec(q ?? "");
  if (!m) return null;
  return m[1] === "s" ? { steps: t.search(Number(m[2])), code: "search", row: "search" } : { steps: t.successor(Number(m[2])), code: "successor", row: "successor" };
}

export function render(root) {
  const p = readParams();
  const state = { ops: parseOps(p.get("ops") ?? "i50,i30,i70,i20,i40,i60,i80,i35", "id").map(([k, v]) => [k, Number(v)]), q: p.get("q"), from: null };
  let player = null;

  const head = page({
    subject: "Data structures & algorithms", title: "Binary search tree",
    lede: "Insert, delete, search and traverse a BST, with every comparison animated beside the pseudocode, and nodes gliding when the tree reshapes.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "binary search tree"), " keeps one rule at every node: everything in the left subtree is smaller, everything in the right subtree is bigger. So a search can throw away half of what's left at each step, as long as the tree is bushy."),
      h("p", null, "Every operation walks one path from the root, so it costs O(h), where h is the height. With random keys h is about 2 ln n, but inserting keys in sorted order builds a chain with h = n − 1. That's why balanced trees like ", h("a", { href: "/avl-tree" }, "AVL trees"), " exist."),
      h("p", null, h("b", null, "Deleting"), " a node has three cases: a leaf is just removed; a node with one child is replaced by that child; a node with two children takes the key of its ", h("b", null, "in-order successor"), " (the smallest key in its right subtree), which is then removed from below."),
      h("p", null, h("b", null, "Traversals:"), " in-order (left, node, right) visits the keys in sorted order; pre-order (node first) is how you'd copy a tree; post-order (node last) is how you'd free one; level-order uses a queue to go row by row.")),
    conventions: [
      "Duplicates are ignored: inserting a key that's already there changes nothing.",
      "Delete with two children uses the in-order successor (the smallest key in the right subtree).",
      "Height counts edges: one node has height 0 and an empty tree −1.",
      "Nodes are drawn left to right in sorted order, so a left-only child really sits to the left.",
    ],
  });

  const keyIn = h("input", { type: "number", min: 0, max: 999, "aria-label": "Key", placeholder: "key", onkeydown: (e) => { if (e.key === "Enter") mutate("i"); } });
  const seqIn = h("input", { type: "text", class: "mono wide", "aria-label": "Keys to build from", value: "50 30 70 20 40 60 80 35", onkeydown: (e) => { if (e.key === "Enter") build(); } });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });
  const btn = (label, fn, cls = "ghost") => h("button", { type: "button", class: `btn ${cls}`, onclick: fn }, label);

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
      state.q = null;
      rebuild();
    } catch (e) { msg.replaceChildren(notice("error", e.message)); }
  }
  function ask(q) { msg.replaceChildren(); state.q = q; state.from = null; rebuild(); }
  function askKey(kind) { try { ask(`${kind}${keys()[0]}`); } catch (e) { msg.replaceChildren(notice("error", e.message)); } }
  function build(vals) {
    msg.replaceChildren();
    try {
      vals ??= numbers(seqIn.value, { most: 31 });
      seqIn.value = vals.join(" ");
      state.ops = vals.map((v) => ["i", v]);
      state.q = null; state.from = 0;
      rebuild();
    } catch (e) { msg.replaceChildren(notice("error", e.message)); }
  }

  function rebuild() {
    const t = new BST();
    let steps = [], code = "insert", row = "insert";
    state.ops.forEach(([k, v], i) => {
      const s = k === "i" ? t.insert(v) : t.delete(v);
      if (state.from == null ? i === state.ops.length - 1 : i >= state.from) { steps.push(...s); code = row = k === "i" ? "insert" : "delete"; }
    });
    const q = state.q && query(t, state.q);
    if (q) ({ steps, code, row } = q);
    if (!steps.length) steps = [{ tree: t.snapTree(), line: null, note: "The tree is empty. Insert some keys or pick an example.", vars: {} }];
    writeParams({ ops: state.ops.map(([k, v]) => k + v).join(","), ...(state.q ? { q: state.q } : {}) });
    history.textContent = state.ops.length ? `History: ${state.ops.map(([k, v]) => `${k === "i" ? "+" : "−"}${v}`).join(" ")}` : "";
    show(t, steps, code, row);
  }

  function show(t, steps, code, row) {
    player?.destroy();
    const n = countOf(t.root), leaves = (function count(x) { return !x ? 0 : !x.left && !x.right ? 1 : count(x.left) + count(x.right); })(t.root);
    const title = { insert: "Insert", delete: "Delete", search: "Search", successor: "Successor", min: "Minimum", max: "Maximum", height: "Height", ...TRAVERSALS }[code];
    const sc = stepCard(steps, {
      title, code: CODE[code], draw: (s) => bstSvg(s),
      below: (s) => [
        s.visit ? chips("Visit order", s.visit, "visit") : null,
        s.stack ? chips("Call stack (top on the right)", s.stack, "stack") : null,
        s.queue ? chips("Queue (front on the left)", s.queue, "queue") : null,
        legend(LEGEND),
      ],
    });
    player = sc.player;
    out.replaceChildren(sc.card,
      h("section", { class: "card" }, h("h2", null, "This tree"),
        h("div", { class: "stats-row" }, stat("Keys", n), stat("Height", t.height()), stat("Best possible height", n ? Math.floor(Math.log2(n)) : -1), stat("Leaves", leaves)),
        h("p", { class: "muted small" }, n ? `In-order: ${traversal(t.root, "inorder").join(", ")}. ${t.height() > 2 * Math.log2(n + 1) ? "This tree is tall for its size: try the same keys in a different order, or an AVL tree." : ""}` : "")),
      h("section", { class: "card" }, h("h2", null, "Complexity"), opsTable(OPS, row),
        h("p", { class: "muted small" }, "h is the height: about log₂ n when the tree is bushy, n − 1 when it's a chain.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { build(ex.keys); if (ex.then) { state.from = state.ops.length; state.ops.push(ex.then); rebuild(); } else if (ex.q) ask(ex.q); }),
        btn("Random", () => { const r = rng(); build(shuffle(Array.from({ length: 99 }, (_, i) => i + 1), r).slice(0, 8 + Math.floor(r() * 5))); }),
        btn("Clear", () => { state.ops = []; state.q = null; rebuild(); }),
        btn("Copy link", (e) => copyLink(e.currentTarget))),
      h("div", { class: "row" }, keyIn, btn("Insert", () => mutate("i"), "primary"), btn("Delete", () => mutate("d")), btn("Search", () => askKey("s")), btn("Successor", () => askKey("x"))),
      h("div", { class: "row" }, Object.entries(NAMED).map(([q, label]) => btn(label, () => ask(q)))),
      h("label", { class: "stack" }, "Build from a sequence (inserted left to right)", h("div", { class: "row", style: "margin:0" }, seqIn, btn("Build", () => build()))),
      msg, history),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const keys = shuffle(Array.from({ length: 60 }, (_, i) => i + 1), r).slice(0, 7 + Math.floor(r() * 3));
    const t = buildBst(keys), pic = h("div", { class: "chart-wrap" }, bstSvg({ tree: t.snapTree(), lit: {} }));
    const kind = Math.floor(r() * 4);
    let body;
    if (kind === 0) {
      const order = ["preorder", "postorder", "levelorder"][Math.floor(r() * 3)], right = traversal(t.root, order).join(", ");
      const opts = new Set([right, ...Object.keys(TRAVERSALS).map((k) => traversal(t.root, k).join(", "))]);
      body = [h("h2", null, `Insert these keys into an empty BST, in order. What is the ${TRAVERSALS[order].toLowerCase()} traversal?`), h("p", { class: "grammar-box" }, keys.join(", ")),
        choice(shuffle([...opts], r).map((o) => ({ label: o, correct: o === right })), `${TRAVERSALS[order]}: ${right}.`), h("details", null, h("summary", null, "Show the tree"), pic)];
    } else if (kind === 1) {
      body = [h("h2", null, "Insert these keys into an empty BST, in order. What is the height of the tree (counting edges)?"), h("p", { class: "grammar-box" }, keys.join(", ")),
        numberQuestion(t.height(), `The longest root-to-leaf path has ${t.height()} edges.`), h("details", null, h("summary", null, "Show the tree"), pic)];
    } else if (kind === 2) {
      const two = [];
      (function walk(x) { if (x) { if (x.left && x.right) two.push(x.key); walk(x.left); walk(x.right); } })(t.root);
      const k = two.length ? two[Math.floor(r() * two.length)] : t.root.key;
      const sorted = traversal(t.root, "inorder"), succ = sorted[sorted.indexOf(k) + 1];
      body = [h("h2", null, `In this BST, ${k} is deleted. Using the in-order successor, which key takes its place?`), pic,
        numberQuestion(succ ?? -1, succ != null ? `The successor is the smallest key in ${k}'s right subtree: ${succ}.` : `${k} has no right subtree, so its left child moves up; answer −1.`)];
    } else {
      const sorted = traversal(t.root, "inorder"), i = Math.floor(r() * (sorted.length - 1)), k = sorted[i];
      body = [h("h2", null, `What is the in-order successor of ${k} in this BST?`), pic,
        numberQuestion(sorted[i + 1], `The successor is the next key in sorted order: ${sorted[i + 1]}. ${t.root && sorted.includes(k) ? "If a node has a right subtree, it's the minimum there; otherwise it's the last ancestor you went left from." : ""}`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, btn("New question", newQuestion)), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
