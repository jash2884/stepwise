// Minimum spanning trees: Kruskal with a union-find forest (union by rank and
// path compression) and Prim with a key array and a min-priority queue.
// Ties between equal weights are broken alphabetically.
import { byName, listNames, recorder, showDist } from "./graph.js";

const grp = (g, root) => `--c:var(--series-${(g.nodes.indexOf(root) % 8) + 1})`;
export const edgeLabel = (e) => `${e.from}–${e.to}`;

// Sorted by weight, then by the edge's endpoints in alphabetical order.
export function sortedEdges(g) {
  const ends = (e) => [e.from, e.to].sort(byName);
  return [...g.edges].sort((a, b) => a.w - b.w || byName(ends(a)[0], ends(b)[0]) || byName(ends(a)[1], ends(b)[1]));
}

export const ALGORITHMS = {
  kruskal: {
    name: "Kruskal's algorithm", mode: "undirected",
    code: () => [
      "A ← ∅; for each vertex v: MAKE-SET(v)",
      "sort the edges by weight  // ties: alphabetical",
      "for each edge (u, v) in that order",
      "  if FIND(u) ≠ FIND(v) then  // different trees?",
      "    A ← A ∪ {(u, v)}; UNION(u, v)",
      "  else skip (u, v)  // it would close a cycle",
      "  stop once A has |V| − 1 edges",
      "FIND(x): if p[x] ≠ x then p[x] ← FIND(p[x])  // path compression",
      "UNION(x, y): link the root of lower rank under the other",
    ],
    run: (g) => kruskal(g),
  },
  prim: {
    name: "Prim's algorithm", mode: "undirected", source: true,
    code: () => [
      "for each vertex u: key[u] ← ∞; π[u] ← nil",
      "key[r] ← 0; Q ← every vertex  // min-priority queue on key",
      "while Q is not empty",
      "  u ← EXTRACT-MIN(Q)  // ties: alphabetical",
      "  for each neighbour v of u",
      "    if v ∈ Q and w(u, v) < key[v] then",
      "      π[v] ← u; key[v] ← w(u, v)  // decrease-key",
      "return the edges (π[v], v) for v ≠ r",
    ],
    run: (g, { source }) => prim(g, source),
  },
};

export const COMPLEXITY = [
  { id: "kruskal", name: "Kruskal", time: "O(E log E)", space: "O(V + E)", note: "Sorting dominates; union-find with rank and path compression is almost O(1) per call. Good for sparse graphs." },
  { id: "prim", name: "Prim (binary heap)", time: "O(E log V)", space: "O(V)", note: "O(V²) with a plain array, which wins on dense graphs. Grows one tree from the root." },
];

export function kruskal(g) {
  if (g.directed) throw new Error("Minimum spanning trees are defined for undirected graphs.");
  const { steps, snap } = recorder();
  const p = Object.fromEntries(g.nodes.map((v) => [v, v])), rank = Object.fromEntries(g.nodes.map((v) => [v, 0]));
  const list = sortedEdges(g), status = {}, A = [];
  let weight = 0, cursor = -1;
  const find = (x) => { if (p[x] !== x) p[x] = find(p[x]); return p[x]; };
  const root = (x) => { while (p[x] !== x) x = p[x]; return x; }; // look without compressing
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, "grp"])),
    styles: Object.fromEntries(g.nodes.map((v) => [v, grp(g, root(v))])),
    edges: Object.fromEntries(Object.entries(status).map(([id, s]) => [id, s === "accepted" ? "mst" : s === "rejected" ? "rejected" : "dim"])),
    sorted: list.map((e) => ({ id: e.id, label: edgeLabel(e), w: e.w, status: status[e.id] ?? "" })), cursor,
    uf: { parent: { ...p }, rank: { ...rank } }, weight, count: A.length, ...extra,
  });
  snap(1, `Start with no edges: each vertex is its own little tree (a set in the union-find forest, shown in its own colour).`, view({ vars: { A: [] } }));
  snap(2, `Sort the ${list.length} edges by weight: ${list.map((e) => `${edgeLabel(e)} (${e.w})`).join(", ")}.`, view({ vars: { A: [] } }));
  for (const [i, e] of list.entries()) {
    cursor = i;
    if (A.length === g.nodes.length - 1) {
      for (const f of list.slice(i)) status[f.id] = "skipped";
      snap(7, `The tree already has |V| − 1 = ${A.length} edges, so every vertex is connected. The remaining edges can't be needed.`, view({ vars: { A: A.map(edgeLabel), weight } }));
      break;
    }
    const before = { ...p };
    const ru = find(e.from), rv = find(e.to), compressed = g.nodes.filter((v) => before[v] !== p[v]);
    const active = { from: e.from, to: e.to, id: e.id };
    snap([3, 4], `Next lightest edge: ${edgeLabel(e)} with weight ${e.w}. FIND(${e.from}) = ${ru}, FIND(${e.to}) = ${rv}.${compressed.length ? ` Path compression points ${compressed.join(", ")} straight at the root.` : ""}`, view({ active, vars: { u: e.from, v: e.to, w: e.w, "FIND(u)": ru, "FIND(v)": rv } }));
    if (ru !== rv) {
      const [hi, lo] = rank[ru] > rank[rv] || (rank[ru] === rank[rv] && byName(ru, rv) < 0) ? [ru, rv] : [rv, ru];
      p[lo] = hi;
      if (rank[ru] === rank[rv]) rank[hi]++;
      A.push(e); weight += e.w; status[e.id] = "accepted";
      snap(5, `${ru} ≠ ${rv}, so ${e.from} and ${e.to} are in different trees: take the edge (total weight ${weight}) and UNION the sets, putting root ${lo} under ${hi}.`, view({ active, vars: { u: e.from, v: e.to, w: e.w, weight, "|A|": A.length } }));
    } else {
      status[e.id] = "rejected";
      snap(6, `Both ends already have root ${ru}: they're connected by edges we've taken, so ${edgeLabel(e)} would make a cycle. Reject it.`, view({ active, tone: "bad", vars: { u: e.from, v: e.to, w: e.w, weight, "|A|": A.length } }));
    }
  }
  cursor = -1;
  const connected = A.length === g.nodes.length - 1;
  snap(null, connected
    ? `Minimum spanning tree: ${A.map(edgeLabel).join(", ")}, total weight ${weight}.`
    : `The graph isn't connected, so there's no spanning tree. These ${A.length} edges form a minimum spanning forest of weight ${weight}.`, view({ tone: "good", vars: { weight, "|A|": A.length } }));
  return { steps, weight, tree: A.map((e) => e.id), connected };
}

export function prim(g, r) {
  if (g.directed) throw new Error("Minimum spanning trees are defined for undirected graphs.");
  if (!g.nodes.includes(r)) throw new Error(`${r} isn't in the graph.`);
  const { steps, snap } = recorder();
  const key = Object.fromEntries(g.nodes.map((v) => [v, Infinity])), pi = Object.fromEntries(g.nodes.map((v) => [v, null]));
  const inQ = new Set(g.nodes), order = [];
  let u = null, weight = 0;
  const idOf = (a, b) => g.out[a].find((x) => x.v === b).id;
  const pq = () => [...inQ].sort((a, b) => key[a] - key[b] || byName(a, b));
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === u ? "current" : !inQ.has(v) ? "done" : key[v] < Infinity ? "frontier" : ""])),
    badges: Object.fromEntries(g.nodes.filter((v) => inQ.has(v)).map((v) => [v, showDist(key[v])])),
    edges: Object.fromEntries(g.nodes.filter((v) => pi[v]).map((v) => [idOf(pi[v], v), inQ.has(v) ? "candidate" : "mst"])),
    pq: pq().map((v) => ({ v, key: key[v] })), table: g.nodes.map((v) => ({ v, key: key[v], pi: pi[v], inQ: inQ.has(v) })), order: [...order], weight, ...extra,
  });
  snap(1, `Every key starts at ∞. key[v] will be the weight of the cheapest edge joining v to the tree grown so far.`, view({ vars: { r } }));
  key[r] = 0;
  snap(2, `Grow the tree from ${r}: key[${r}] = 0, so it's extracted first. Every vertex starts in the priority queue.`, view({ vars: { r, Q: pq() } }));
  while (inQ.size) {
    u = pq()[0];
    if (key[u] === Infinity) {
      const rest = [...inQ];
      u = null;
      snap(4, `The smallest key left is ∞: ${listNames(rest)} can't be reached from ${r}. The graph isn't connected, so this is a spanning tree of ${r}'s component only.`, view({ tone: "bad", vars: { weight } }));
      return { steps, weight, tree: order.slice(1).map((v) => idOf(pi[v], v)), connected: false, order };
    }
    inQ.delete(u); order.push(u);
    if (pi[u]) weight += key[u];
    snap(4, pi[u] ? `Extract ${u}, the vertex with the smallest key (${key[u]}): the edge ${pi[u]}–${u} joins the tree. Total weight ${weight}.` : `Extract ${u} (key 0). It's the root of the tree.`, view({ vars: { u, "key[u]": key[u], "π[u]": pi[u], weight } }));
    for (const { v, w, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (!inQ.has(v)) { snap(6, `${v} is already in the tree, so ${u}–${v} is ignored.`, view({ active, vars: { u, v, w, weight } })); continue; }
      if (w < key[v]) {
        const old = key[v];
        key[v] = w; pi[v] = u;
        snap(7, `${u}–${v} costs ${w}, cheaper than key[${v}] = ${showDist(old)}: key[${v}] ← ${w}, π[${v}] ← ${u}.`, view({ active, vars: { u, v, w, "key[v]": w, weight } }));
      } else snap(6, `${u}–${v} costs ${w}, but ${v} can already join for ${key[v]}: no change.`, view({ active, vars: { u, v, w, "key[v]": key[v], weight } }));
    }
  }
  u = null;
  snap(8, `The queue is empty. Minimum spanning tree: ${order.slice(1).map((v) => `${pi[v]}–${v}`).join(", ")}, total weight ${weight}. Vertices joined in the order ${order.join(", ")}.`, view({ tone: "good", vars: { weight } }));
  return { steps, weight, tree: order.slice(1).map((v) => idOf(pi[v], v)), connected: true, order };
}

export function run(algo, g, opts = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  return ALGORITHMS[algo].run(g, opts);
}
