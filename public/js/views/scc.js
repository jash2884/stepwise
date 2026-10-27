import { stateDiagram } from "../diagram.js";
import { byName, parseGraph, randomGraph } from "../engines/graph.js";
import { ALGORITHMS, COMPLEXITY, condensation, kosaraju, tarjan } from "../engines/scc.js";
import { graphTool, names, sameSet, staticGraph, strip, textQuestion, valueTable } from "../graph-view.js";
import { h, page } from "../ui.js";
import { choice, numberQuestion, stat } from "./kit.js";

const series = (k) => `--c:var(--series-${(k % 8) + 1})`;
const LEGENDS = {
  kosaraju: [["Being explored", "n-current"], ["On the DFS stack (pass 1)", "n-frontier"], ["Finished (pass 1)", "n-done"], ["DFS tree edge", "e-tree"]],
  tarjan: [["Being explored", "n-current"], ["On the stack S", "n-frontier"], ["Tree edge", "e-tree"], ["Edge to a vertex on S", "e-back"], ["Edge into a finished SCC", "e-cross"]],
};

const sccChips = (comps) => h("div", { class: "g-strip list" }, h("div", { class: "g-strip-head" }, h("b", null, "Components found")),
  h("div", { class: "g-cells" }, comps.length ? comps.map((c, i) => h("span", { class: "scc", style: series(i) }, `{${[...c].sort(byName).join(", ")}}`)) : h("em", { class: "muted" }, "none yet")));

function side(st, { g, algo }, prev) {
  if (algo === "kosaraju") return [
    h("p", { class: `g-pass${st.pass === 2 ? " two" : ""}` }, st.pass === 1 ? "Pass 1: DFS on G, recording finish order" : "Pass 2: DFS on Gᵀ (every edge reversed), latest finisher first"),
    st.pass === 1 ? strip("DFS stack", st.stack, { prev: prev?.stack, kind: "stack" }) : null,
    strip("L (finish order)", st.L, { prev: prev?.L, kind: "stack", empty: "empty" }),
    sccChips(st.comps)];
  const rows = (s) => s.table.map((r) => ({ key: r.v, cells: [r.disc ?? "–", r.low ?? "–", r.onS ? "yes" : ""] }));
  return [strip("Stack S", st.S, { prev: prev?.S, kind: "stack" }),
    valueTable(["v", "disc", "low", "on S"], rows(st), { prev: prev && rows(prev), hot: st.active?.from }), sccChips(st.comps)];
}

function after(res, { g }) {
  const c = condensation(g, res.comps);
  // Sources first, so the layered drawing reads left to right.
  const indeg = Object.fromEntries(c.nodes.map((n) => [n.id, c.edges.filter((e) => e.to === n.id).length])), topo = [];
  for (let q = c.nodes.filter((n) => !indeg[n.id]); q.length;) {
    const n = q.shift(); topo.push(n);
    for (const e of c.edges.filter((x) => x.from === n.id)) if (--indeg[e.to] === 0) q.push(c.nodes.find((m) => m.id === e.to));
  }
  const other = (res.steps[0].pass ? tarjan : kosaraju)(g);
  const same = other.comps.map((x) => x.join()).sort().join("|") === res.comps.map((x) => x.join()).sort().join("|");
  return h("section", { class: "card" }, h("h2", null, "Condensation DAG"),
    h("p", { class: "muted" }, `Shrink each SCC to a single vertex. The result never has a cycle: if two components could reach each other, they'd be one component. ${c.nodes.length} component${c.nodes.length === 1 ? "" : "s"}, ${c.edges.length} edge${c.edges.length === 1 ? "" : "s"} between them.`),
    h("div", { class: "chart-wrap" }, stateDiagram({
      states: topo.map((n) => ({ id: n.id, label: n.members.join(" ") })), edges: c.edges.map((e) => ({ ...e, label: "" })), start: null,
      classes: Object.fromEntries(c.nodes.map((n) => [n.id, "grp"])), styles: Object.fromEntries(c.nodes.map((n) => [n.id, series(n.k)])),
      aria: `Condensation DAG: ${c.nodes.map((n) => `${n.id} = {${n.members.join(", ")}}`).join(", ")}; edges ${c.edges.map((e) => `${e.from} → ${e.to}`).join(", ") || "none"}.`,
    })),
    h("p", { class: `notice ${same ? "good" : "bad"}` }, same ? "✓ Kosaraju and Tarjan find the same components on this graph (in a different order: Kosaraju in topological order of this DAG, Tarjan in reverse)." : "Kosaraju and Tarjan disagree, which shouldn't happen."));
}

function question(r) {
  const g = parseGraph(randomGraph(r, { directed: true, weighted: false, n: 6 + Math.floor(r() * 2), extra: 3 + Math.floor(r() * 3) }), { directed: true });
  const k = kosaraju(g), comps = k.comps, kind = Math.floor(r() * 4);
  const list = comps.map((c) => `{${c.join(", ")}}`).join(", ");
  if (kind === 0) return [h("h2", null, "How many strongly connected components does this graph have?"), staticGraph(g), numberQuestion(comps.length, `The SCCs are ${list}.`)];
  if (kind === 1) {
    const v = g.nodes[Math.floor(r() * g.nodes.length)], mine = comps.find((c) => c.includes(v));
    return [h("h2", null, `Which vertices are in the same SCC as ${v}? (Include ${v}.)`), staticGraph(g),
      textQuestion((t) => sameSet([...new Set(names(t))], mine), `${v}'s component is {${mine.join(", ")}}: these can all reach each other. All SCCs: ${list}.`, { placeholder: `${v} …` })];
  }
  if (kind === 2) {
    const c = condensation(g, comps);
    return [h("h2", null, "How many edges does the condensation DAG have?"), h("p", { class: "muted" }, "Count each pair of components once, however many edges run between them."), staticGraph(g),
      numberQuestion(c.edges.length, `SCCs: ${list}. Edges between them: ${c.edges.map((e) => `${e.from} → ${e.to}`).join(", ") || "none"}, where ${c.nodes.map((n) => `${n.id} = {${n.members.join(", ")}}`).join(", ")}.`)];
  }
  const strong = comps.length === 1;
  return [h("h2", null, "Is this graph strongly connected?"), staticGraph(g),
    choice([{ label: "Yes", correct: strong }, { label: "No", correct: !strong }], strong ? "Yes: every vertex can reach every other." : `No, it splits into ${comps.length} SCCs: ${list}.`)];
}

export function render(root) {
  const head = page({
    subject: "Data structures & algorithms", title: "Strongly connected components",
    lede: "Kosaraju's two-pass algorithm with the reversed graph, and Tarjan's single pass with disc/low values, ending in the condensation DAG.",
    theory: h("div", null,
      h("p", null, "In a directed graph, u and v are ", h("b", null, "strongly connected"), " if each can reach the other. That splits the vertices into ", h("b", null, "strongly connected components"), " (SCCs). Shrinking each SCC to one vertex gives the ", h("b", null, "condensation"), ", which is always a DAG."),
      h("p", null, h("b", null, "Kosaraju"), " runs DFS on G to get finish times, reverses every edge, then runs DFS on the reversed graph Gᵀ taking vertices by decreasing finish time. Each tree of the second DFS is one SCC: reversing the edges stops it leaking into the components it used to reach."),
      h("p", null, h("b", null, "Tarjan"), " needs one DFS. disc[v] numbers vertices as they're found and low[v] is the smallest disc that v's subtree can reach among vertices still on the stack. When low[v] = disc[v], v is the first vertex of its SCC to be found, and everything above it on the stack belongs to that SCC.")),
    conventions: ["Vertices and their out-neighbours are taken in alphabetical order.", "Kosaraju's finish times tick on every discovery and finish, starting at 1. Tarjan's disc numbers start at 0.", "Components are numbered in the order they're found."],
  });
  return graphTool(root, {
    head, algos: ALGORITHMS, complexity: COMPLEXITY, side, after, question,
    random: (r) => randomGraph(r, { directed: true, weighted: false, n: 7 + Math.floor(r() * 2), extra: 4 + Math.floor(r() * 3) }),
    defaults: { algo: "kosaraju", example: "clrsScc" },
    examples: ["clrsScc", "tarjan", "clrsDfs", "courses"],
    legend: (algo) => LEGENDS[algo],
    stats: (st) => [stat("SCCs found", st.comps.length), stat("Vertices placed", `${st.comps.flat().length}`)],
  });
}
