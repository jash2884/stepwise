import { parseGraph, randomGraph } from "../engines/graph.js";
import { ALGORITHMS, bfs, bipartite, COMPLEXITY, components, dfs } from "../engines/traversal.js";
import { graphTool, names, staticGraph, strip, textQuestion, valueTable } from "../graph-view.js";
import { h, page } from "../ui.js";
import { choice, numberQuestion } from "./kit.js";

const LEGENDS = {
  bfs: [["Being explored", "n-current"], ["Grey: in the queue", "n-frontier"], ["Black: finished", "n-done"], ["BFS tree edge", "e-tree"], ["Edge to a vertex already found", "e-seen"]],
  dfs: [["Being explored", "n-current"], ["Grey: on the stack", "n-frontier"], ["Black: finished", "n-done"], ["Tree", "e-tree"], ["Back", "e-back"], ["Forward", "e-forward"], ["Cross", "e-cross"]],
  components: [["Being explored", "n-current"], ["In the queue", "n-frontier"], ["Edge used to reach a vertex", "e-tree"]],
  cycle: [["Being explored", "n-current"], ["On the current path", "n-frontier"], ["Finished", "n-done"], ["DFS edge", "e-tree"], ["The cycle", "e-cycle"]],
  bipartite: [["Being explored", "n-current"], ["In the queue", "n-frontier"], ["BFS edge", "e-tree"], ["Odd cycle", "e-cycle"]],
  kahn: [["Taken from the queue", "n-current"], ["In the queue (in-degree 0)", "n-frontier"], ["Placed in the order", "n-done"], ["Removed edge", "e-removed"]],
  topo: [["Being explored", "n-current"], ["On the stack", "n-frontier"], ["Finished, in L", "n-done"], ["DFS edge", "e-tree"], ["Back edge (cycle)", "e-back"]],
};

function side(st, { algo }, prev) {
  const show = (x) => (x == null || x === Infinity ? (x === Infinity ? "∞" : "–") : x);
  switch (algo) {
    case "bfs": return [
      strip("Queue Q", st.queue, { prev: prev?.queue }),
      strip("Visit order", st.order, { prev: prev?.order, kind: "list", empty: "nothing yet" }),
      valueTable(["v", "d[v]", "π[v]", "colour"], st.table.map((r) => ({ key: r.v, cells: [show(r.d), show(r.pi), r.colour] })), { prev: prev?.table.map((r) => ({ key: r.v, cells: [show(r.d), show(r.pi), r.colour] })), hot: st.active?.to })];
    case "dfs": {
      const rows = (s) => s.table.map((r) => ({ key: r.v, cells: [show(r.d), show(r.f), show(r.pi)] }));
      return [strip("Recursion stack", st.stack, { prev: prev?.stack, kind: "stack" }),
        strip("Discovery order", st.order, { prev: prev?.order, kind: "list", empty: "nothing yet" }),
        valueTable(["v", "d[v]", "f[v]", "π[v]"], rows(st), { prev: prev && rows(prev), hot: st.active?.to })];
    }
    case "components": return [strip("Queue Q", st.queue, { prev: prev?.queue }), h("p", { class: "muted small" }, `Components so far: ${st.count}`)];
    case "cycle": return [strip("Current path (recursion stack)", st.stack, { prev: prev?.stack, kind: "stack" })];
    case "bipartite": return [strip("Queue Q", st.queue, { prev: prev?.queue })];
    case "kahn": {
      const rows = (s) => Object.entries(s.indeg).map(([v, d]) => ({ key: v, cells: [s.order.includes(v) ? "placed" : d] }));
      return [strip("Queue Q", st.queue, { prev: prev?.queue }), strip("Order", st.order, { prev: prev?.order, kind: "list", empty: "nothing yet" }),
        valueTable(["v", "indeg[v]"], rows(st), { prev: prev && rows(prev), hot: st.active?.to })];
    }
    case "topo": return [strip("Recursion stack", st.stack, { prev: prev?.stack, kind: "stack" }), strip("L (front first)", st.order, { prev: prev?.order, kind: "list", empty: "empty" })];
    default: return null;
  }
}

function random(r, algo, directed) {
  if (algo === "kahn" || algo === "topo") return randomGraph(r, { directed: true, dag: true, weighted: false, n: 6 + Math.floor(r() * 3), extra: 3 });
  if (algo === "components") return randomGraph(r, { directed, connected: false, weighted: false, n: 8 + Math.floor(r() * 3), extra: 5 + Math.floor(r() * 2) });
  if (algo === "bipartite") return randomGraph(r, { directed: false, weighted: false, extra: 1 + Math.floor(r() * 3) });
  return randomGraph(r, { directed, weighted: false, extra: 2 + Math.floor(r() * 3) });
}

function question(r) {
  const kind = Math.floor(r() * 6);
  if (kind <= 1) {
    const g = parseGraph(randomGraph(r, { weighted: false, extra: 2 }));
    const order = kind === 0 ? bfs(g, "A").order : dfs(g).order, name = kind === 0 ? "BFS" : "DFS";
    return [h("h2", null, `Write the ${name} visit order starting from A.`), h("p", { class: "muted" }, "Neighbours are taken in alphabetical order."), staticGraph(g),
      textQuestion((t) => names(t).join() === order.join(), `The ${name} order is ${order.join(", ")}.${kind === 0 ? " BFS finishes each layer before moving to the next." : " DFS goes as deep as it can before backing up."}`, { placeholder: "e.g. A B C …" })];
  }
  if (kind === 2) {
    const g = parseGraph(randomGraph(r, { weighted: false, extra: 2, n: 7 }));
    const res = bfs(g, "A"), far = g.nodes.filter((v) => res.dist[v] < Infinity).sort((a, b) => res.dist[b] - res.dist[a])[0];
    const path = []; for (let x = far; x; x = res.parent[x]) path.unshift(x);
    return [h("h2", null, `How many edges are on the shortest path from A to ${far}?`), staticGraph(g),
      numberQuestion(res.dist[far], `BFS reaches ${far} in layer ${res.dist[far]}, for example along ${path.join(" – ")}.`)];
  }
  if (kind === 3) {
    const g = parseGraph(randomGraph(r, { directed: true, dag: true, weighted: false, extra: 3 }), { directed: true });
    const ok = (t) => { const o = names(t); return o.length === g.nodes.length && new Set(o).size === o.length && g.edges.every((e) => o.indexOf(e.from) >= 0 && o.indexOf(e.from) < o.indexOf(e.to)); };
    return [h("h2", null, "Write any topological order of this DAG."), h("p", { class: "muted" }, "Any order works as long as every edge points forwards."), staticGraph(g),
      textQuestion(ok, `Every edge must go from earlier to later. One valid answer (Kahn's algorithm): ${ALGORITHMS.kahn.run(g).order.join(", ")}.`, { placeholder: "e.g. B A D …" })];
  }
  if (kind === 4) {
    const g = parseGraph(randomGraph(r, { weighted: false, extra: 1 + Math.floor(r() * 3) }));
    const b = bipartite(g);
    return [h("h2", null, "Is this graph bipartite?"), staticGraph(g),
      choice([{ label: "Yes", correct: b.bipartite }, { label: "No", correct: !b.bipartite }], b.bipartite ? `Yes: L = {${b.L.join(", ")}}, R = {${b.R.join(", ")}}.` : `No: ${[...b.oddCycle, b.oddCycle[0]].join(" – ")} is an odd cycle.`)];
  }
  const g = parseGraph(randomGraph(r, { connected: false, weighted: false, n: 8 + Math.floor(r() * 3), extra: 5 }));
  const c = components(g);
  return [h("h2", null, "How many connected components does this graph have?"), staticGraph(g),
    numberQuestion(c.count, `${c.groups.map((x) => `{${x.join(", ")}}`).join(", ")}.`)];
}

export function render(root) {
  const head = page({
    subject: "Data structures & algorithms", title: "Graph traversal",
    lede: "Breadth-first and depth-first search step by step, and the problems they solve: components, cycles, bipartite graphs and topological order.",
    theory: h("div", null,
      h("p", null, h("b", null, "BFS"), " explores in layers using a FIFO queue: first every vertex 1 edge away, then 2, and so on. So d[v] is the fewest edges from s to v, and the π pointers form a shortest-path tree (by number of edges)."),
      h("p", null, h("b", null, "DFS"), " goes as deep as possible and backs up when stuck (recursion, or a stack). It stamps a discovery time d and finish time f on each vertex; the intervals [d, f] of any two vertices are either nested or disjoint. In a directed graph each edge u → v is a ", h("b", null, "tree"), " edge (v was white), a ", h("b", null, "back"), " edge (v grey: an ancestor, so a cycle), a ", h("b", null, "forward"), " edge (v black and a descendant) or a ", h("b", null, "cross"), " edge (v black, elsewhere). Undirected graphs only have tree and back edges."),
      h("p", null, "A directed graph has a ", h("b", null, "topological order"), " exactly when it has no cycle (it's a DAG). Kahn's algorithm keeps removing vertices with no incoming edges; the DFS method lists vertices by decreasing finish time. A graph is ", h("b", null, "bipartite"), " exactly when it has no odd cycle.")),
    conventions: ["Neighbours are visited in alphabetical order, and outer loops go through the vertices alphabetically.", "DFS times start at 1 and tick on every discovery and every finish (as in CLRS).", "Kahn's queue is first-in first-out, starting with the in-degree-0 vertices in alphabetical order.", "Components and the bipartite check ignore edge directions."],
  });
  return graphTool(root, {
    key: "graph-traversal", head, algos: ALGORITHMS, complexity: COMPLEXITY, side, random, question,
    defaults: { algo: "bfs", example: "clrsBfs" },
    examples: ["clrsBfs", "clrsDfs", "clothes", "courses", "bipartite", "oddCycle", "islands", "clrsScc"],
    legend: (algo) => LEGENDS[algo],
    title: ({ algo, state }) => `${ALGORITHMS[algo].name}${ALGORITHMS[algo].source ? ` from ${state.source}` : ""}`,
  });
}
