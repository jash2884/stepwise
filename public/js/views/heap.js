import { buildSwaps, CODE, Heap, OPS, parent } from "../engines/heap.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";
import { binaryLayout, binaryParts, legend, numbers, opsTable, shuffle, stepCard, treeSvg } from "./dsa-kit.js";

const CELL = 42;
const EXAMPLES = {
  clrs: { name: "CLRS max-heap: 4 1 3 2 16 9 10 14 8 7", kind: "max", values: [4, 1, 3, 2, 16, 9, 10, 14, 8, 7], method: "f" },
  sorted: { name: "Ascending input, repeated inserts (worst case for a max-heap)", kind: "max", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], method: "r" },
  sortedF: { name: "Same input, Floyd's method", kind: "max", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], method: "f" },
  pq: { name: "Min-heap priority queue: extract twice", kind: "min", values: [12, 5, 9, 1, 7, 3, 8], method: "f", then: ["x", "x"] },
  dk: { name: "Decrease-key (as in Dijkstra)", kind: "min", values: [2, 8, 5, 12, 10, 9, 7, 15], method: "f", then: ["k6.1"] },
};
const LEGEND = [["Sifting", "var(--accent)"], ["Compared", "var(--series-4)"], ["Winner", "var(--series-3)"], ["Swapped", "var(--series-8)"], ["New", "var(--good)"]];

// Tree on top and the array underneath, both keyed by item id so a swap slides
// the same value in both places at once.
function heapSvg(step) {
  const size = step.size, A = step.A;
  const node = (i) => (i < size ? { id: A[i].id, key: A[i].v, i, left: node(2 * i + 1), right: node(2 * i + 2) } : null);
  const tree = node(0);
  const L = binaryLayout(tree, { gapX: 44, gapY: 58, top: 30 });
  const arrW = 32 + A.length * CELL + (step.out ? CELL + 36 : 0);
  // The array stays left-aligned so it only moves when values swap.
  const W = Math.max(L.W, arrW, 240), dx = (W - L.W) / 2, ax = 16 + CELL / 2;
  const top = tree ? L.H + 18 : 40;
  for (const p of L.pos.values()) p.x += dx;
  const { nodes, edges } = binaryParts(tree, L.pos, (n) => ({ cls: step.lit?.[n.i] ?? "", sub: n.i }));
  const cells = A.map((x, i) => ({ k: `a${x.id}`, x: ax + i * CELL, y: top + 16, label: x.v, w: CELL - 4, cls: `${step.lit?.[i] ?? ""}${i >= size ? " outside" : ""}` }));
  const extra = A.map((_, i) => h("text", { x: ax + i * CELL, y: top + 46, "text-anchor": "middle", class: "dt-idx" }, i));
  if (step.out) {
    const ox = ax + A.length * CELL + 30;
    cells.push({ k: `a${step.out.id}`, x: ox, y: top + 16, label: step.out.v, w: CELL - 4, cls: "out" });
    extra.push(h("text", { x: ox, y: top + 46, "text-anchor": "middle", class: "dt-idx" }, "out"));
  }
  if (!size && !step.out) extra.push(h("text", { x: W / 2, y: 26, "text-anchor": "middle", class: "dt-empty" }, "Empty heap"));
  return treeSvg({ nodes, edges, cells, extra, W, H: top + 58, aria: `Heap array: ${A.slice(0, size).map((x) => x.v).join(", ") || "empty"}`, cls: "heap" });
}

export function render(root) {
  const p = readParams();
  const state = { kind: p.get("kind") === "max" ? "max" : "min", ops: (p.get("ops") ?? "f9.4.7.1.8.2.6.3.5").split(",").filter(Boolean) };
  let player = null;

  const head = page({
    subject: "Data structures & algorithms", title: "Binary heap",
    lede: "A min-heap or max-heap drawn as an array and a tree at the same time, so you can see why index 2i + 1 is the left child. Sift up, sift down, build-heap and decrease-key, step by step.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "binary heap"), " is a complete binary tree (every level full except the last, which fills from the left) stored in an array with no pointers: the children of index i are 2i + 1 and 2i + 2, and its parent is ⌊(i − 1)/2⌋."),
      h("p", null, "The ", h("b", null, "heap property"), ": in a min-heap every parent is ≤ its children, so the smallest value is always at index 0 (a max-heap is the mirror image). That makes it the standard ", h("b", null, "priority queue"), ", used by Dijkstra's and Prim's algorithms and by ", h("a", { href: "/sorting?algo=heap" }, "heap sort"), "."),
      h("p", null, h("b", null, "Insert"), " adds at the end and sifts up; ", h("b", null, "extract"), " moves the last item to the root and sifts down, swapping with the better child. Both follow one path, so O(log n)."),
      h("p", null, h("b", null, "Building"), " a heap from n values by inserting them one at a time costs O(n log n) in the worst case. ", h("b", null, "Floyd's method"), " drops them all in and sifts down every internal node from the bottom up. Half the nodes are leaves that never move, a quarter move at most one level, and so on, which adds up to O(n).")),
    conventions: [
      "Heap indices start at 0: children of i are 2i + 1 and 2i + 2, its parent is ⌊(i − 1)/2⌋.",
      "On a tie, sift down swaps with the left child, and sift up stops (equal is fine).",
      "Swaps count only sift swaps; moving the last item to the root on extract isn't counted.",
      "Decrease-key in a min-heap (increase-key in a max-heap) takes an index and the new value.",
    ],
  });

  const kindSel = h("select", { "aria-label": "Heap type", onchange: (e) => { state.kind = e.target.value; rebuild(); } },
    [["min", "Min-heap"], ["max", "Max-heap"]].map(([v, t]) => h("option", { value: v, selected: v === state.kind }, t)));
  const valsIn = h("input", { type: "text", class: "mono wide", "aria-label": "Values to build from" });
  const vIn = h("input", { type: "number", "aria-label": "Value", placeholder: "value", min: 0, max: 999, onkeydown: (e) => { if (e.key === "Enter") act("i"); } });
  const iIn = h("input", { type: "number", "aria-label": "Index", placeholder: "index", min: 0 });
  const kIn = h("input", { type: "number", "aria-label": "New value", placeholder: "new value", min: 0, max: 999 });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });
  const btn = (label, fn, cls = "ghost") => h("button", { type: "button", class: `btn ${cls}`, onclick: fn }, label);
  const sortLink = h("a", { class: "btn ghost" }, "Heap sort these values →");
  const fail = (e) => msg.replaceChildren(notice("error", e.message));
  const one = (input, label) => { const v = numbers(input.value, { most: 1 }); if (!v.length) throw new Error(`Type ${label} first.`); return v[0]; };

  function act(kind) {
    msg.replaceChildren();
    try {
      let op;
      if (kind === "f" || kind === "r") {
        const vals = numbers(valsIn.value, { most: 31 });
        if (!vals.length) throw new Error("Enter some values to build from.");
        state.ops = [kind + vals.join(".")];
        rebuild();
        return;
      }
      if (kind === "i") op = `i${one(vIn, "a value")}`;
      else if (kind === "x") op = "x";
      else op = `k${one(iIn, "an index")}.${one(kIn, "the new value")}`;
      if (state.ops.length > 40) state.ops = [`f${current.values().join(".")}`];
      state.ops.push(op);
      rebuild();
    } catch (e) { fail(e); }
  }

  let current = null;
  function rebuild() {
    const hp = new Heap(state.kind);
    let steps = [], code = "floyd", build = [];
    for (const op of state.ops) {
      const nums = op.slice(1).split(".").filter(Boolean).map(Number);
      if (op[0] === "f" || op[0] === "r") { build = nums; steps = hp.build(nums, op[0] === "f" ? "floyd" : "inserts"); code = op[0] === "f" ? "floyd" : "inserts"; }
      else if (op[0] === "i") { if (hp.A.length >= 31) continue; steps = hp.insert(nums[0]); code = "insert"; }
      else if (op[0] === "x") { steps = hp.extract(); code = "extract"; }
      else if (op[0] === "k") { steps = hp.changeKey(nums[0], nums[1]); code = "key"; }
    }
    current = hp;
    if (!steps.length) steps = [{ A: [], size: 0, line: null, note: "The heap is empty. Build one from some values.", vars: {}, lit: {} }];
    valsIn.value = build.join(" ");
    writeParams({ kind: state.kind, ops: state.ops.join(",") });
    history.textContent = state.ops.length > 1 ? `History: ${state.ops.map((o) => ({ f: "build (Floyd)", r: "build (inserts)", i: `insert ${o.slice(1)}`, x: "extract", k: `${state.kind === "min" ? "decrease" : "increase"}-key ${o.slice(1).replace(".", " → ")}` })[o[0]]).join(" · ")}` : "";
    sortLink.href = `/sorting?algo=heap&a=${encodeURIComponent(hp.values().join(" ") || build.join(" "))}`;
    show(hp, steps, code, build);
  }

  function show(hp, steps, code, build) {
    player?.destroy();
    const name = { floyd: "Build-heap (Floyd, bottom-up)", inserts: "Build-heap (one insert at a time)", insert: "Insert (sift up)", extract: `Extract ${state.kind} (sift down)`, key: state.kind === "min" ? "Decrease-key" : "Increase-key" }[code];
    const sc = stepCard(steps, {
      title: name, code: CODE[code], draw: heapSvg, interval: 900,
      below: (s) => [
        h("div", { class: "stats-row" }, stat("Swaps", s.swaps ?? 0), stat("Comparisons", s.comps ?? 0)),
        legend(LEGEND)],
    });
    player = sc.player;
    const n = hp.A.length;
    const cmp = build.length ? [["Floyd (bottom-up)", buildSwaps(build, state.kind, "floyd")], ["Repeated inserts", buildSwaps(build, state.kind, "inserts")]] : [];
    out.replaceChildren(sc.card,
      h("section", { class: "card" }, h("h2", null, "This heap"),
        h("div", { class: "stats-row" }, stat("Size", n), stat("Height", n ? Math.floor(Math.log2(n)) : "–"), stat(state.kind === "min" ? "Minimum (top)" : "Maximum (top)", n ? hp.A[0].v : "–"), stat("Heap property", hp.valid() ? "holds ✓" : "broken")),
        cmp.length ? h("div", null, h("h3", { class: "sub-h" }, `Building from these ${build.length} values`),
          h("div", { class: "table-wrap" }, h("table", { class: "parse" },
            h("thead", null, h("tr", null, ["Method", "Swaps", "Comparisons"].map((x) => h("th", { scope: "col" }, x)))),
            h("tbody", null, cmp.map(([m, r]) => h("tr", null, h("th", { scope: "row" }, m), h("td", null, r.swaps), h("td", null, r.comps)))))),
          h("p", { class: "muted small" }, "Both give a valid heap, though not always the same array. Floyd's method is O(n); one insert at a time is O(n log n) in the worst case (try ascending input in a max-heap).")) : null,
        h("div", { class: "row" }, sortLink)),
      h("section", { class: "card" }, h("h2", null, "Complexity"), opsTable(OPS, code)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, kindSel,
        exampleSelect(EXAMPLES, (ex) => { state.kind = ex.kind; kindSel.value = ex.kind; state.ops = [ex.method + ex.values.join("."), ...(ex.then ?? [])]; msg.replaceChildren(); rebuild(); }),
        btn("Random", () => { const r = rng(); valsIn.value = shuffle(Array.from({ length: 60 }, (_, i) => i + 1), r).slice(0, 8 + Math.floor(r() * 5)).join(" "); act("f"); }),
        btn("Copy link", (e) => copyLink(e.currentTarget))),
      h("label", { class: "stack" }, "Values (up to 31)", h("div", { class: "row", style: "margin:0" }, valsIn, btn("Build (Floyd)", () => act("f"), "primary"), btn("Build by inserts", () => act("r")))),
      h("div", { class: "row" }, vIn, btn("Insert", () => act("i")), btn("Extract top", () => act("x"))),
      h("div", { class: "row" }, h("span", { class: "inline" }, "Change key: index"), iIn, h("span", { class: "inline" }, "to"), kIn, btn("Decrease / increase key", () => act("k"))),
      msg, history),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = r() < 0.5 ? "min" : "max", word = kind === "min" ? "min-heap" : "max-heap";
    const vals = shuffle(Array.from({ length: 50 }, (_, i) => i + 1), r).slice(0, 6 + Math.floor(r() * 3));
    const q = Math.floor(r() * 4);
    let body;
    if (q === 0) {
      const right = buildSwaps(vals, kind, "floyd").result.join(", ");
      const opts = new Set([right, buildSwaps(vals, kind, "inserts").result.join(", "), [...vals].sort((a, b) => (kind === "min" ? a - b : b - a)).join(", ")]);
      const wrong = [...vals]; const i = Math.floor(r() * (wrong.length - 1)); [wrong[0], wrong[i + 1]] = [wrong[i + 1], wrong[0]]; opts.add(wrong.join(", "));
      body = [h("h2", null, `Build a ${word} from this array with Floyd's bottom-up method. What is the resulting array?`), h("p", { class: "grammar-box" }, vals.join(", ")),
        choice(shuffle([...opts], r).map((o) => ({ label: o, correct: o === right })), `Sift down indices ${Math.floor(vals.length / 2) - 1} to 0 in turn: ${right}.`)];
    } else if (q === 1) {
      const i = 1 + Math.floor(r() * 20), ask = Math.floor(r() * 3);
      const [what, ans, why] = [["parent", parent(i), `⌊(${i} − 1)/2⌋ = ${parent(i)}`], ["left child", 2 * i + 1, `2·${i} + 1 = ${2 * i + 1}`], ["right child", 2 * i + 2, `2·${i} + 2 = ${2 * i + 2}`]][ask];
      body = [h("h2", null, `In a heap stored from index 0, what is the index of the ${what} of index ${i}?`), numberQuestion(ans, `${why}.`)];
    } else if (q === 2) {
      const hp = new Heap(kind); hp.build(vals, "floyd");
      const before = hp.values(); hp.extract();
      body = [h("h2", null, `Extract the top of this ${word}. Which value is at the root afterwards?`), h("p", { class: "grammar-box" }, before.join(", ")),
        numberQuestion(hp.values()[0], `The last item ${before.at(-1)} moves to the root and sinks; the new top is the ${kind === "min" ? "smallest" : "largest"} that's left, ${hp.values()[0]}. Array: ${hp.values().join(", ")}.`)];
    } else {
      const res = buildSwaps(vals, kind, "floyd");
      body = [h("h2", null, `How many swaps does Floyd's method make to build a ${word} from this array?`), h("p", { class: "grammar-box" }, vals.join(", ")),
        numberQuestion(res.swaps, `${res.swaps} swap${res.swaps === 1 ? "" : "s"}, giving ${res.result.join(", ")}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, btn("New question", newQuestion)), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
