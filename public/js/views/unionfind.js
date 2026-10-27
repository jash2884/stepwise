import { code, compare, DSU, MODES, opText, OPS, parseOps } from "../engines/unionfind.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";
import { forestLayout, legend, opsTable, stepCard, treeSvg } from "./dsa-kit.js";

const CELL = 40;
const EXAMPLES = {
  textbook: { name: "Two trees joined, then a long find: 8 elements", n: 8, mode: "rank", pc: true, ops: "u0-1,u2-3,u0-2,u4-5,u6-7,u4-6,u0-4,f7" },
  chain: { name: "Naive union builds a chain", n: 7, mode: "naive", pc: false, ops: "u0-1,u1-2,u2-3,u3-4,u4-5,u5-6,f0" },
  chainPc: { name: "Same chain, then compress it", n: 7, mode: "naive", pc: true, ops: "u0-1,u1-2,u2-3,u3-4,u4-5,u5-6,f0" },
  size: { name: "Union by size", n: 9, mode: "size", pc: true, ops: "u0-1,u0-2,u0-3,u4-5,u4-0,u6-7,u8-6,u6-4,f8" },
  same: { name: "Union of two already-joined elements", n: 6, mode: "rank", pc: true, ops: "u0-1,u2-3,u1-3,u0-2" },
};
const LEGEND = [["Climbing", "var(--series-1)"], ["Current", "var(--accent)"], ["Root found", "var(--good)"], ["Pointer changed", "var(--series-4)"]];

function ufSvg(step, n, mode) {
  const kids = Array.from({ length: n }, () => []);
  const roots = [];
  for (let i = 0; i < n; i++) (step.parent[i] === i ? roots : kids[step.parent[i]]).push(i);
  const node = (i) => ({ id: String(i), kids: kids[i].map(node) });
  // The arrays sit on top at fixed places, so only the forest moves.
  const word = mode === "size" ? "size" : "rank", wv = mode === "size" ? step.size : step.rank;
  const changed = new Set(step.changed ?? []), changedW = new Set(step.changedRank ?? []);
  const rows = mode === "naive" ? [["parent", step.parent, changed]] : [["parent", step.parent, changed], [word, wv, changedW]];
  const ax = 62 + CELL / 2, arrW = 70 + n * CELL, forestTop = 30 + rows.length * 36 + 40;
  const L = forestLayout(roots.map(node), { gapX: 46, gapY: 62, top: forestTop, rootGap: 22 });
  const W = Math.max(L.W, arrW, 240), dx = (W - L.W) / 2;
  const nodes = [], edges = [];
  for (let i = 0; i < n; i++) {
    const p = L.pos.get(String(i)), isRoot = step.parent[i] === i;
    nodes.push({ id: String(i), x: p.x + dx, y: p.y, label: String(i), cls: `${step.lit?.[i] ?? ""}${isRoot ? " root" : ""}`, badge: isRoot && mode !== "naive" ? `${word}=${wv[i]}` : null, badgeTop: true, title: `${i}: parent ${step.parent[i]}, rank ${step.rank[i]}, size ${step.size[i]}` });
    if (!isRoot) edges.push({ from: String(step.parent[i]), to: String(i), cls: changed.has(i) ? "lit" : "" });
  }
  const cells = [], extra = [];
  for (let i = 0; i < n; i++) extra.push(h("text", { x: ax + i * CELL, y: 14, "text-anchor": "middle", class: "dt-idx" }, i));
  rows.forEach(([label, vals, hot], r) => {
    const y = 36 + r * 36;
    extra.push(h("text", { x: ax - CELL / 2 - 8, y: y + 5, "text-anchor": "end", class: "dt-rowlabel" }, label));
    vals.forEach((v, i) => cells.push({ k: `${label}${i}`, x: ax + i * CELL, y, label: v, w: CELL - 4, cls: `${hot.has(i) ? "changed" : ""} ${step.lit?.[i] ?? ""}` }));
  });
  return treeSvg({ nodes, edges, cells, extra, W, H: L.H + 10, arrows: true, cls: "uf", aria: `Parent array: ${step.parent.join(", ")}. ${roots.length} sets.` });
}

export function render(root) {
  const p = readParams();
  const state = { n: Math.min(16, Math.max(2, Number(p.get("n")) || 8)), mode: MODES[p.get("mode")] ? p.get("mode") : "rank", pc: p.get("pc") !== "0", ops: [] };
  try { state.ops = parseOps(p.get("ops") ?? EXAMPLES.textbook.ops, state.n); } catch { state.ops = []; }
  let player = null;

  const head = page({
    subject: "Data structures & algorithms", title: "Union-find (disjoint sets)",
    lede: "Keep track of which elements are connected. Union by rank or size and path compression keep the trees flat; switch them off to see what goes wrong.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "disjoint-set"), " structure stores a partition of 0 … n−1 into sets. Each set is a tree drawn from a ", h("b", null, "parent array"), ": parent[x] is x's parent and a root points to itself. The root is the set's representative, so ", h("code", null, "find(a) = find(b)"), " tells you whether a and b are connected. Kruskal's algorithm uses exactly this to skip edges that would make a cycle."),
      h("p", null, h("b", null, "Naive union"), " hangs one root under the other without looking, and can build a chain n long, making find O(n). ", h("b", null, "Union by rank"), " (an upper bound on height) or ", h("b", null, "by size"), " (number of nodes) always hangs the smaller tree under the bigger one, which keeps the height at most log₂ n."),
      h("p", null, h("b", null, "Path compression"), " makes every node on a find's path point straight at the root. Together with union by rank, any sequence of m operations costs O(m α(n)), where α, the inverse Ackermann function, is at most 4 for any n you'll ever meet.")),
    conventions: [
      "union(a, b) with naive union makes find(a)'s root a child of find(b)'s root.",
      "By rank or size, on a tie the second root goes under the first, and (by rank) the first root's rank goes up by 1.",
      "Ranks are not updated by path compression: they become upper bounds on height.",
      "A hop is one parent[] pointer followed while climbing to the root.",
    ],
  });

  const nSel = h("select", { "aria-label": "Number of elements", onchange: (e) => { state.n = Number(e.target.value); state.ops = []; rebuild(); } },
    Array.from({ length: 15 }, (_, i) => i + 2).map((v) => h("option", { value: v, selected: v === state.n }, `${v} elements`)));
  const modeSel = h("select", { "aria-label": "Union strategy", onchange: (e) => { state.mode = e.target.value; rebuild(); } },
    Object.entries(MODES).map(([k, m]) => h("option", { value: k, selected: k === state.mode }, m.name)));
  const pcBox = h("input", { type: "checkbox", checked: state.pc, onchange: (e) => { state.pc = e.target.checked; rebuild(); } });
  const aIn = h("input", { type: "number", min: 0, "aria-label": "a", placeholder: "a" }), bIn = h("input", { type: "number", min: 0, "aria-label": "b", placeholder: "b" });
  const opsIn = h("input", { type: "text", class: "mono wide", "aria-label": "Operations" });
  const msg = h("div"), out = h("div", { class: "output" });
  const btn = (label, fn, cls = "ghost") => h("button", { type: "button", class: `btn ${cls}`, onclick: fn }, label);
  const fail = (e) => msg.replaceChildren(notice("error", e.message));

  function push(op) {
    msg.replaceChildren();
    try {
      const [o] = parseOps(op, state.n);
      if (state.ops.length >= 60) throw new Error("That's a lot of operations. Reset and start again.");
      state.ops.push(o);
      rebuild();
    } catch (e) { fail(e); }
  }
  const val = (input) => { if (input.value === "") throw new Error("Type the element numbers first."); return Number(input.value); };

  function rebuild() {
    const d = new DSU(state.n, { mode: state.mode, compress: state.pc });
    let steps = [];
    for (const o of state.ops) steps = d.run(o);
    if (!steps.length) { d.snap(null, `${state.n} elements, each in its own set: every node is a root (parent[i] = i).`, { vars: { sets: state.n } }); steps = d.steps; }
    opsIn.value = state.ops.map(opText).join(",");
    nSel.value = state.n; modeSel.value = state.mode; pcBox.checked = state.pc;
    writeParams({ n: state.n, mode: state.mode, pc: state.pc ? 1 : 0, ops: state.ops.map(opText).join(",") });
    show(d, steps);
  }

  function show(d, steps) {
    player?.destroy();
    const last = state.ops.at(-1);
    const sc = stepCard(steps, {
      title: last ? (last[0] === "u" ? `union(${last[1]}, ${last[2]})` : `find(${last[1]})`) : "Start", code: code(state.mode), interval: 1000,
      draw: (s) => ufSvg(s, state.n, state.mode),
      below: () => [legend(LEGEND), h("p", { class: "muted small" }, `Arrows point from a child to its parent.${state.mode === "naive" ? "" : ` The number above each root is its ${state.mode}.`}${state.pc ? "" : " Path compression is off."}`)],
    });
    player = sc.player;
    const res = compare(state.n, state.ops);
    const best = Math.min(...res.map((r) => r.hops));
    out.replaceChildren(sc.card,
      h("section", { class: "card" }, h("h2", null, "Now"),
        h("div", { class: "stats-row" }, stat("Sets", d.sets().length), stat("Tallest tree", d.height()), stat("Total hops so far", d.hops), stat("log₂ n", Math.log2(state.n).toFixed(2))),
        h("p", { class: "muted small" }, `Sets: ${d.sets().map((s) => `{${s.join(", ")}}`).join(" ")}`)),
      h("section", { class: "card" }, h("h2", null, "Same operations, every strategy"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse" },
          h("thead", null, h("tr", null, ["Union", "Path compression", "Pointer hops", "", "Tallest tree at the end"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, res.map((r) => h("tr", { class: r.mode === state.mode && r.compress === state.pc ? "hot" : null },
            h("th", { scope: "row" }, MODES[r.mode].name), h("td", null, r.compress ? "on" : "off"), h("td", null, r.hops),
            h("td", { class: "spark" }, h("i", { style: `width:${(r.hops / Math.max(...res.map((x) => x.hops), 1)) * 100}%` })),
            h("td", null, r.height)))))),
        h("p", { class: "muted small" }, `The fewest hops here is ${best}. Try the "Naive union builds a chain" example: naive union with no compression pays for the whole chain on every find.`)),
      h("section", { class: "card" }, h("h2", null, "Complexity"), opsTable(OPS, state.mode === "naive" ? (state.pc ? "pc" : "naive") : state.pc ? "both" : "rank")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, nSel, modeSel, h("label", { class: "inline" }, pcBox, "Path compression"),
        exampleSelect(EXAMPLES, (ex) => { Object.assign(state, { n: ex.n, mode: ex.mode, pc: ex.pc, ops: parseOps(ex.ops, ex.n) }); msg.replaceChildren(); rebuild(); }),
        btn("Random", () => { const r = rng(); state.ops = Array.from({ length: state.n + 2 }, (_, i) => (i === state.n + 1 ? ["f", Math.floor(r() * state.n)] : ["u", Math.floor(r() * state.n), Math.floor(r() * state.n)])); rebuild(); }),
        btn("Reset", () => { state.ops = []; rebuild(); }),
        btn("Copy link", (e) => copyLink(e.currentTarget))),
      h("div", { class: "row" }, aIn, bIn, btn("Union(a, b)", () => { try { push(`u${val(aIn)}-${val(bIn)}`); } catch (e) { fail(e); } }, "primary"), btn("Find(a)", () => { try { push(`f${val(aIn)}`); } catch (e) { fail(e); } })),
      h("label", { class: "stack" }, "Operations (u3-5 = union(3, 5), f4 = find(4))", h("div", { class: "row", style: "margin:0" }, opsIn,
        btn("Run", () => { msg.replaceChildren(); try { state.ops = parseOps(opsIn.value, state.n); rebuild(); } catch (e) { fail(e); } }))),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const n = 6 + Math.floor(r() * 3);
    const ops = Array.from({ length: n - 1 + Math.floor(r() * 2) }, () => ["u", Math.floor(r() * n), Math.floor(r() * n)]);
    const opsText = ops.map((o) => `union(${o[1]}, ${o[2]})`).join(", ");
    const q = Math.floor(r() * 3);
    const final = (mode, pc) => { const d = new DSU(n, { mode, compress: pc }); d.record = false; for (const o of ops) o[0] === "u" ? d.union(o[1], o[2]) : d.find(o[1]); return d; };
    let body;
    if (q === 0) {
      const right = final("rank", false).parent.join(" ");
      const opts = new Set([right, final("naive", false).parent.join(" "), final("rank", true).parent.join(" "), final("size", false).parent.join(" ")]);
      if (opts.size < 3) opts.add(Array.from({ length: n }, (_, i) => i).join(" "));
      body = [h("h2", null, `Start with ${n} singleton sets (0 to ${n - 1}). Using union by rank without path compression, what is the parent array after these operations?`), h("p", { class: "grammar-box" }, opsText),
        h("p", { class: "muted small" }, "Tie: the second root goes under the first."),
        choice([...opts].sort(() => r() - 0.5).map((o) => ({ label: `[${o}]`, correct: o === right })), `parent = [${right}].`)];
    } else if (q === 1) {
      const d = final("naive", false);
      body = [h("h2", null, `Start with ${n} singleton sets. With naive union (find(a)'s root goes under find(b)'s root) and no path compression, how tall is the tallest tree after these operations?`), h("p", { class: "grammar-box" }, opsText),
        numberQuestion(d.height(), `parent = [${d.parent.join(" ")}], and the longest path to a root has ${d.height()} edge${d.height() === 1 ? "" : "s"}.`)];
    } else {
      const d = final("naive", false);
      let x = 0;
      for (let i = 0; i < n; i++) { let k = 0, y = i; while (d.parent[y] !== y) { y = d.parent[y]; k++; } let kx = 0, z = x; while (d.parent[z] !== z) { z = d.parent[z]; kx++; } if (k > kx) x = i; }
      let hops = 0, y = x;
      while (d.parent[y] !== y) { y = d.parent[y]; hops++; }
      const after = new DSU(n, { mode: "naive", compress: true });
      after.parent = [...d.parent]; after.record = false; after.find(x);
      const moved = after.parent.filter((v, i) => v !== d.parent[i]).length;
      body = [h("h2", null, `parent = [${d.parent.join(" ")}]. With path compression, how many entries of the parent array change when you call find(${x})?`),
        numberQuestion(moved, `find(${x}) climbs ${hops} hop${hops === 1 ? "" : "s"} to the root ${y}. Every node on the path except the root and its direct child gets re-pointed at ${y}: ${moved} change${moved === 1 ? "" : "s"}. New parent = [${after.parent.join(" ")}].`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, btn("New question", newQuestion)), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
