import { treeDiagram } from "../diagram.js";
import { parseGraph, randomGraph, showDist } from "../engines/graph.js";
import { ALGORITHMS, COMPLEXITY, edgeLabel, kruskal, prim, sortedEdges } from "../engines/mst.js";
import { graphTool, names, staticGraph, strip, textQuestion, valueTable } from "../graph-view.js";
import { h, morph, page } from "../ui.js";
import { choice, numberQuestion, stat } from "./kit.js";

const LEGENDS = {
  kruskal: [["Edge being considered", "e-active"], ["In the MST", "e-mst"], ["Rejected (would close a cycle)", "e-rejected"], ["Not needed", "e-dim"]],
  prim: [["Just extracted", "n-current"], ["In the tree", "n-done"], ["In the queue with a finite key", "n-frontier"], ["MST edge", "e-mst"], ["Cheapest known link to the tree (π)", "e-candidate"]],
};

// The union-find forest: each set is a tree hanging from its root.
function forest(st, g) {
  const p = st.uf.parent, lit = st.active ? [st.active.from, st.active.to] : [];
  const node = (v) => ({ id: v, label: v, state: p[v] === v ? "matched" : "expanded", kids: g.nodes.filter((x) => x !== v && p[x] === v).map(node) });
  return treeDiagram(g.nodes.filter((v) => p[v] === v).map(node), { lit, aria: "Union-find forest", gapY: 50 });
}

function side(st, ctx, prev) {
  const { g, algo } = ctx;
  if (algo === "kruskal") {
    ctx.forestBox ??= h("div", { class: "chart-wrap" });
    morph(ctx.forestBox, forest(st, g));
    const show = (x) => ({ accepted: "✓", rejected: "✗", skipped: "–" }[x] ?? "");
    return [
      h("div", { class: "g-strip list" }, h("div", { class: "g-strip-head" }, h("b", null, "Edges by weight"), h("span", { class: "muted" }, `MST weight so far: ${st.weight}`)),
        h("div", { class: "g-cells g-edges" }, st.sorted.map((e, i) => h("span", { class: [e.status, i === st.cursor && "hot"].filter(Boolean).join(" ") || null }, `${e.label} ${e.w} ${show(e.status)}`)))),
      h("div", { class: "g-strip-head" }, h("b", null, "Union-find forest"), h("span", { class: "muted" }, "each set is a tree; the root names the set")),
      ctx.forestBox,
      valueTable(["", ...g.nodes], [{ key: "p[v]", cells: g.nodes.map((v) => st.uf.parent[v]) }, { key: "rank", cells: g.nodes.map((v) => st.uf.rank[v]) }],
        { prev: prev?.uf && [{ key: "p[v]", cells: g.nodes.map((v) => prev.uf.parent[v]) }, { key: "rank", cells: g.nodes.map((v) => prev.uf.rank[v]) }] }),
    ];
  }
  const rows = (s) => s.table.map((r) => ({ key: r.v, cells: [showDist(r.key), r.pi ?? "–", r.inQ ? "yes" : "no"] }));
  return [
    strip("Priority queue (smallest key first)", st.pq.map((x) => ({ label: `${x.v}:${showDist(x.key)}`, key: x.v })), { prev: prev?.pq.map((x) => x.v), hot: 0 }),
    valueTable(["v", "key[v]", "π[v]", "in Q"], rows(st), { prev: prev && rows(prev), hot: st.active?.to }),
  ];
}

function after(res, { g, state }) {
  const k = kruskal(g), p = prim(g, state.source);
  const same = k.weight === p.weight;
  const tree = sortedEdges(g).filter((e) => k.tree.includes(e.id));
  return h("section", { class: "card" }, h("h2", null, "Kruskal vs Prim on this graph"),
    h("div", { class: "stats-row" }, stat("Kruskal's total", k.weight), stat(`Prim's total (from ${state.source})`, p.connected ? p.weight : `${p.weight} (one component)`), stat("Edges in the tree", `${k.tree.length} / ${g.nodes.length - 1}`)),
    !k.connected ? h("p", { class: "notice info" }, "This graph isn't connected, so there's no spanning tree. Kruskal builds a minimum spanning forest; Prim only spans the start vertex's component.")
      : h("p", { class: `notice ${same ? "good" : "bad"}` }, same ? `✓ Both find total weight ${k.weight}. If several edges share a weight the trees themselves can differ, but the total never does.` : "The totals differ, which shouldn't happen."),
    h("p", { class: "muted small" }, `Kruskal's tree: ${tree.map((e) => `${edgeLabel(e)} (${e.w})`).join(", ")}.`));
}

function question(r) {
  const g = parseGraph(randomGraph(r, { n: 6 + Math.floor(r() * 2), extra: 3 + Math.floor(r() * 2) }));
  const kind = Math.floor(r() * 3), k = kruskal(g);
  if (kind === 0) return [h("h2", null, "What is the total weight of a minimum spanning tree?"), staticGraph(g),
    numberQuestion(k.weight, `Take edges lightest first, skipping any that close a cycle: ${sortedEdges(g).filter((e) => k.tree.includes(e.id)).map((e) => `${edgeLabel(e)} (${e.w})`).join(", ")}.`)];
  if (kind === 1) {
    const list = sortedEdges(g), last = k.steps.at(-1);
    const rejected = list.find((e) => last.edges[e.id] === "rejected");
    if (rejected) {
      const opts = [rejected, ...list.filter((e) => e !== rejected && last.edges[e.id] !== "rejected").slice(0, 3)].sort(() => r() - 0.5);
      return [h("h2", null, "Kruskal's algorithm: which edge is the first to be rejected?"), staticGraph(g),
        choice(opts.map((e) => ({ label: `${edgeLabel(e)} (${e.w})`, correct: e === rejected })), `${edgeLabel(rejected)} is the first edge whose ends are already joined by lighter edges in the tree, so it would close a cycle.`)];
    }
  }
  const p = prim(g, "A");
  return [h("h2", null, "Prim's algorithm from A: in what order do the vertices join the tree?"), h("p", { class: "muted" }, "Ties go to the alphabetically first vertex."), staticGraph(g),
    textQuestion((t) => names(t).join() === p.order.join(), `The order is ${p.order.join(", ")}: each time, the vertex with the cheapest edge into the tree joins next.`, { placeholder: "A …" })];
}

export function render(root) {
  const head = page({
    subject: "Data structures & algorithms", title: "Minimum spanning tree",
    lede: "Kruskal's and Prim's algorithms: connect every vertex as cheaply as possible, with the union-find forest and priority queue shown at every step.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "spanning tree"), " of a connected, undirected graph uses V − 1 edges to join every vertex without a cycle. A ", h("b", null, "minimum"), " spanning tree (MST) has the smallest total weight."),
      h("p", null, "Both algorithms rely on the ", h("b", null, "cut property"), ": split the vertices into two groups, and the lightest edge crossing between them is safe to add. ", h("b", null, "Kruskal"), " takes edges from lightest to heaviest and skips any that would close a cycle; a union-find structure answers \"are these already connected?\" almost instantly. ", h("b", null, "Prim"), " grows one tree from a start vertex, always adding the cheapest edge that leaves it, using a priority queue of keys."),
      h("p", null, "If all weights are different the MST is unique. With equal weights there may be several MSTs, but they all have the same total.")),
    conventions: ["Edges with equal weights are taken in alphabetical order of their endpoints; Prim breaks ties between equal keys alphabetically.", "Union by rank; on equal ranks the alphabetically first root becomes the parent. FIND uses path compression.", "Kruskal stops as soon as the tree has V − 1 edges."],
  });
  return graphTool(root, {
    key: "minimum-spanning-tree", head, algos: ALGORITHMS, complexity: COMPLEXITY, side, after, question,
    random: (r) => randomGraph(r, { n: 6 + Math.floor(r() * 3), extra: 4 + Math.floor(r() * 3) }),
    defaults: { algo: "kruskal", example: "clrsMst" },
    examples: ["clrsMst", "cities", "islands"],
    legend: (algo) => LEGENDS[algo],
    stats: (st) => [stat("Weight so far", st.weight), stat("Tree edges", st.count ?? (st.order?.length ? st.order.length - 1 : 0))],
    title: ({ algo, state }) => `${ALGORITHMS[algo].name}${algo === "prim" ? ` from ${state.source}` : ""}`,
  });
}
