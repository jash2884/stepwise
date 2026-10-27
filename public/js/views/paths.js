import { parseGraph, pathFrom, randomGraph, showDist } from "../engines/graph.js";
import { ALGORITHMS, bellmanFord, COMPLEXITY, dijkstra, floydWarshall } from "../engines/paths.js";
import { graphTool, matrixTable, names, staticGraph, strip, textQuestion, valueTable } from "../graph-view.js";
import { h, page } from "../ui.js";
import { choice, numberQuestion } from "./kit.js";

const LEGENDS = {
  dijkstra: [["Just extracted", "n-current"], ["Final distance", "n-done"], ["Reached, not final", "n-frontier"], ["Shortest-path tree", "e-tree"], ["Best known (π)", "e-candidate"], ["Just relaxed", "e-relaxed"], ["Path", "e-path"]],
  bellman: [["Edge being tried", "e-active"], ["Just relaxed", "e-relaxed"], ["π edges", "e-tree"], ["Negative cycle", "e-cycle"], ["Path", "e-path"]],
  floyd: [["k: the stop-over", "n-current"], ["i (row)", "n-hl-i"], ["j (column)", "n-hl-j"], ["Path", "e-path"]],
};

function side(st, { g, algo, state }, prev) {
  const path = st.path ? strip("Path", st.path, { prev: prev?.path, kind: "list" }) : null;
  if (algo === "floyd") {
    const [ci, cj] = st.cell ?? [], k = st.k;
    const cls = (i, j) => [i === ci && j === cj && "hot", k != null && ci != null && ((i === ci && j === k) || (i === k && j === cj)) && "src", k != null && (i === k || j === k) && "kband"].filter(Boolean).join(" ") || null;
    return [h("div", { class: "g-strip-head" }, h("b", null, k ? `D after allowing stop-overs up to ${k}` : st.line === 1 ? "D: direct edges only" : "D: every shortest distance"), h("span", { class: "muted" }, "row i, column j")),
      matrixTable(g.nodes, (i, j) => showDist(st.D[i][j]), { corner: "i \\ j", cls, prev: prev?.D ? (i, j) => showDist(prev.D[i][j]) : null }), path];
  }
  const rows = (s) => s.table.map((r) => ({ key: r.v, cells: [showDist(r.d), r.pi ?? "–", ...(algo === "dijkstra" ? [r.done ? "✓" : ""] : [])] }));
  const table = valueTable(["v", "d[v]", "π[v]", ...(algo === "dijkstra" ? ["final"] : [])], rows(st), { prev: prev && rows(prev), hot: st.active?.to });
  if (algo === "dijkstra") return [strip("Priority queue (smallest d first)", st.pq.map((x) => ({ label: `${x.v}:${showDist(x.key)}`, key: x.v })), { prev: prev?.pq.map((x) => x.v), hot: 0 }), table, path];
  return [strip(`Edges in order${typeof st.round === "number" ? `, round ${st.round} of ${g.nodes.length - 1}` : st.round === "check" ? ", checking for a negative cycle" : ""}`, st.arcs, { kind: "list", hot: st.arc }), table, path];
}

function after(res, { g, algo, state, set }) {
  const s = state.source;
  if (res.negativeCycle) return h("section", { class: "card" }, h("h2", null, "Shortest paths"), h("p", { class: "notice bad" }, `There's a negative cycle (${res.negativeCycle.join(", ")}), so some shortest paths don't exist: you could go round the cycle for ever and keep getting shorter.`));
  const dist = (v) => (algo === "floyd" ? res.D[s][v] : res.dist[v]);
  const route = (v) => {
    if (dist(v) === Infinity) return null;
    if (algo !== "floyd") return pathFrom(res.prev, s, v);
    const p = [s];
    for (let x = s; x !== v;) { x = res.next[x][v]; p.push(x); }
    return p;
  };
  const extra = algo === "dijkstra" && g.nodes.length ? (() => {
    const b = bellmanFord(g, s), f = floydWarshall(g, s);
    const same = g.nodes.every((v) => b.dist[v] === res.dist[v] && f.D[s][v] === res.dist[v]);
    return h("p", { class: `notice ${same ? "good" : "bad"}` }, same ? "✓ Bellman–Ford and Floyd–Warshall give the same distances on this graph." : "The three algorithms disagree, which shouldn't happen.");
  })() : null;
  return h("section", { class: "card" }, h("h2", null, `Shortest paths from ${s}`),
    h("div", { class: "table-wrap" }, h("table", { class: "parse g-table" },
      h("thead", null, h("tr", null, ["To", "Distance", "Path", ""].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", null, g.nodes.map((v) => {
        const p = route(v);
        return h("tr", { class: v === state.target ? "hot" : null }, h("th", { scope: "row" }, v), h("td", null, showDist(dist(v))), h("td", { class: "left" }, p ? p.join(" → ") : "unreachable"),
          h("td", null, p && v !== s ? h("button", { type: "button", class: "linkish", onclick: () => set({ target: v }) }, "show steps") : null));
      })))),
    h("p", { class: "muted small" }, "Pick “show steps” to add the path rebuild to the end of the animation."), extra);
}

function question(r) {
  const kind = Math.floor(r() * 4);
  if (kind <= 1) {
    const directed = r() < 0.5;
    const g = parseGraph(randomGraph(r, { directed, n: 6 + Math.floor(r() * 2), extra: 3 }), { directed });
    const d = dijkstra(g, "A"), reach = g.nodes.filter((v) => v !== "A" && d.dist[v] < Infinity);
    if (reach.length < 2) return question(r);
    const t = reach.sort((a, b) => d.dist[b] - d.dist[a])[Math.floor(r() * Math.min(3, reach.length))];
    const p = pathFrom(d.prev, "A", t);
    if (kind === 0) return [h("h2", null, `What is the shortest distance from A to ${t}?`), staticGraph(g), numberQuestion(d.dist[t], `Dijkstra gives ${d.dist[t]}, along ${p.join(" → ")}.`)];
    return [h("h2", null, `Write a shortest path from A to ${t}.`), staticGraph(g),
      textQuestion((x) => { const q = names(x); if (q[0] !== "A" || q.at(-1) !== t) return false; let len = 0; for (let i = 1; i < q.length; i++) { const e = g.out[q[i - 1]]?.find((n) => n.v === q[i]); if (!e) return false; len += e.w; } return len === d.dist[t]; },
        `One shortest path is ${p.join(" → ")} with length ${d.dist[t]}. Any path with the same length is also right.`, { placeholder: "A … " })];
  }
  if (kind === 2) {
    const g = parseGraph(randomGraph(r, { directed: true, n: 5, extra: 2, negative: 0.35 }), { directed: true });
    const b = bellmanFord(g, "A");
    return [h("h2", null, "Does Bellman–Ford from A find a negative cycle?"), staticGraph(g),
      choice([{ label: "Yes", correct: !!b.negativeCycle }, { label: "No", correct: !b.negativeCycle }], b.negativeCycle ? `Yes: ${[...b.negativeCycle, b.negativeCycle[0]].join(" → ")} has negative total weight.` : `No. Distances: ${g.nodes.map((v) => `${v} ${showDist(b.dist[v])}`).join(", ")}.`)];
  }
  const g = parseGraph(randomGraph(r, { directed: true, n: 4, extra: 3 }), { directed: true });
  const N = g.nodes, k = N[0];
  const D = Object.fromEntries(N.map((i) => [i, Object.fromEntries(N.map((j) => [j, i === j ? 0 : Infinity]))]));
  for (const e of g.edges) D[e.from][e.to] = e.w;
  const pairs = N.flatMap((i) => N.map((j) => [i, j])).filter(([i, j]) => i !== j && i !== k && j !== k && D[i][k] + D[k][j] < D[i][j]);
  const [i, j] = pairs.length ? pairs[Math.floor(r() * pairs.length)] : [N[1], N[2]];
  const ans = Math.min(D[i][j], D[i][k] + D[k][j]);
  if (ans === Infinity) return question(r);
  return [h("h2", null, `Floyd–Warshall: after the k = ${k} round, what is D[${i}][${j}]?`), staticGraph(g),
    numberQuestion(ans, `D[${i}][${j}] = min(D[${i}][${j}], D[${i}][${k}] + D[${k}][${j}]) = min(${showDist(D[i][j])}, ${showDist(D[i][k])} + ${showDist(D[k][j])}) = ${ans}.`)];
}

export function render(root) {
  const head = page({
    subject: "Data structures & algorithms", title: "Shortest paths",
    lede: "Dijkstra, Bellman–Ford and Floyd–Warshall with every relaxation animated, the distance table updating live, and the path rebuilt at the end.",
    theory: h("div", null,
      h("p", null, "All three algorithms are built on ", h("b", null, "relaxation"), ": if d[u] + w(u, v) < d[v], then going through u is a shorter way to reach v, so d[v] ← d[u] + w and π[v] ← u. Following π backwards from any vertex rebuilds its shortest path."),
      h("p", null, h("b", null, "Dijkstra"), " always finalises the closest unfinished vertex. That's only safe when no edge is negative. ", h("b", null, "Bellman–Ford"), " relaxes every edge V − 1 times, which is enough because a shortest path has at most V − 1 edges; if a further pass still improves something, a ", h("b", null, "negative cycle"), " is reachable. ", h("b", null, "Floyd–Warshall"), " finds all pairs at once: in round k it asks, for every i and j, whether going through k is shorter."),
      h("p", null, "Undirected edges count as two directed edges, one each way. A negative undirected edge is therefore a negative cycle on its own.")),
    conventions: ["Ties in the priority queue go to the alphabetically first vertex.", "Bellman–Ford relaxes the edges in the order you list them, and stops early after a round where nothing changes.", "Floyd–Warshall takes k, i and j in alphabetical order and only shows the pairs where a path through k exists.", "Distances start at ∞; ∞ + anything stays ∞."],
  });
  return graphTool(root, {
    head, algos: ALGORITHMS, complexity: COMPLEXITY, side, after, question,
    random: (r, algo, directed) => randomGraph(r, { directed, n: algo === "floyd" ? 5 : 6 + Math.floor(r() * 2), extra: 3, negative: algo === "bellman" && directed ? 0.2 : 0 }),
    defaults: { algo: "dijkstra", example: "clrsDijkstra" },
    examples: ["clrsDijkstra", "clrsBellman", "clrsFloyd", "negCycle", "cities"],
    legend: (algo) => LEGENDS[algo],
    interval: 800,
    title: ({ algo, state }) => `${ALGORITHMS[algo].name} from ${state.source}${state.target ? `, path to ${state.target}` : ""}`,
  });
}
