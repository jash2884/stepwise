// Strongly connected components: Kosaraju (DFS on G for finish order, then DFS
// on the transposed graph) and Tarjan (one DFS with disc/low values and a
// stack), plus the condensation DAG. Vertices and neighbours go in
// alphabetical order.
import { byName, edgeName, recorder, transpose } from "./graph.js";

const grp = (k) => `--c:var(--series-${(k % 8) + 1})`;

export const ALGORITHMS = {
  kosaraju: {
    name: "Kosaraju's algorithm", mode: "directed",
    code: () => [
      "L ← empty stack",
      "for each vertex u  // alphabetical",
      "  if u is not visited then dfs1(u)",
      "dfs1(u): mark u; for each edge u → v: if v not visited then dfs1(v)",
      "  push u onto L  // u is finished",
      "Gᵀ ← G with every edge reversed",
      "while L is not empty",
      "  u ← pop(L)  // latest finish first",
      "  if u has no component then dfs2(u, u)  // a new SCC",
      "dfs2(u, root): comp[u] ← root",
      "  for each edge u → v in Gᵀ: if v has no component then dfs2(v, root)",
    ],
    run: (g) => kosaraju(g),
  },
  tarjan: {
    name: "Tarjan's algorithm", mode: "directed",
    code: () => [
      "index ← 0; S ← empty stack",
      "for each vertex v  // alphabetical",
      "  if disc[v] is undefined then strongconnect(v)",
      "strongconnect(v):",
      "  disc[v] ← low[v] ← index; index ← index + 1; push v onto S",
      "  for each edge v → w",
      "    if disc[w] is undefined then strongconnect(w); low[v] ← min(low[v], low[w])",
      "    else if w is on S then low[v] ← min(low[v], disc[w])",
      "  if low[v] = disc[v] then  // v is the root of an SCC",
      "    pop w from S until w = v: those vertices form one SCC",
    ],
    run: (g) => tarjan(g),
  },
};

export const COMPLEXITY = [
  { id: "kosaraju", name: "Kosaraju", time: "O(V + E)", space: "O(V + E)", note: "Two DFS passes and a copy of the graph with edges reversed. Finds SCCs in topological order of the condensation." },
  { id: "tarjan", name: "Tarjan", time: "O(V + E)", space: "O(V)", note: "One DFS. low[v] is the earliest vertex on the stack that v's subtree can reach. Finds SCCs in reverse topological order." },
];

export function kosaraju(g) {
  if (!g.directed) throw new Error("Strongly connected components are for directed graphs.");
  const { steps, snap } = recorder();
  const gT = transpose(g), seen = new Set(), L = [], fin = {}, comp = {}, comps = [], tree1 = new Set(), tree2 = new Set(), stack = [];
  let cur = null, time = 0, transposed = false;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, [v === cur && "current", comp[v] != null && "grp", comp[v] == null && !transposed && (stack.includes(v) ? "frontier" : seen.has(v) ? "done" : "")].filter(Boolean).join(" ")])),
    styles: Object.fromEntries(g.nodes.filter((v) => comp[v] != null).map((v) => [v, grp(comp[v])])),
    badges: transposed ? Object.fromEntries(g.nodes.filter((v) => comp[v] != null).map((v) => [v, `SCC ${comp[v] + 1}`])) : Object.fromEntries(Object.entries(fin).map(([v, t]) => [v, `f ${t}`])),
    edges: Object.fromEntries([...(transposed ? tree2 : tree1)].map((id) => [id, "tree"])),
    transposed, L: [...L], stack: [...stack], pass: transposed ? 2 : 1, comps: comps.map((c) => [...c]), ...extra,
  });
  const dfs1 = (u) => {
    seen.add(u); stack.push(u); cur = u; time++;
    snap(4, `Pass 1: visit ${u}.`, view({ vars: { u, L } }));
    for (const { v, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (!seen.has(v)) { tree1.add(id); snap(4, `${v} isn't visited: go to it along ${edgeName(g, u, v)}.`, view({ active, vars: { u, v, L } })); dfs1(v); cur = u; }
      else snap(4, `${v} is already visited: skip ${edgeName(g, u, v)}.`, view({ active, vars: { u, v, L } }));
    }
    stack.pop(); time++; fin[u] = time; L.push(u);
    snap(5, `${u} is finished (time ${time}): push it onto L.`, view({ vars: { u, L } }));
  };
  snap(1, "Pass 1 runs DFS on G and records the order in which vertices finish. The vertex that finishes last lies in a 'source' component, one no other component can reach.", view({ vars: { L } }));
  for (const u of g.nodes) if (!seen.has(u)) { cur = null; snap(3, `${u} hasn't been visited: start a DFS from it.`, view({ vars: { u, L } })); dfs1(u); }
  cur = null; transposed = true;
  snap(6, `Pass 2 works on Gᵀ, the graph with every edge reversed. Reversing edges keeps each SCC the same (a cycle reversed is still a cycle) but stops a DFS leaking from one SCC into the components it could reach before.`, view({ vars: { L } }));
  const dfs2 = (u, k) => {
    comp[u] = k; comps[k].push(u); cur = u;
    snap(10, `${u} joins SCC ${k + 1}.`, view({ vars: { u, root: comps[k][0], L } }));
    for (const { v, id } of gT.out[u]) {
      const active = { from: u, to: v, id };
      if (comp[v] == null) { tree2.add(id); snap(11, `In Gᵀ, ${u} → ${v} and ${v} has no component yet: it's in the same SCC.`, view({ active, vars: { u, v, root: comps[k][0] } })); dfs2(v, k); cur = u; }
      else snap(11, `In Gᵀ, ${u} → ${v}, but ${v} is already in SCC ${comp[v] + 1}: stop there.`, view({ active, vars: { u, v, root: comps[k][0] } }));
    }
  };
  while (L.length) {
    const u = L.pop();
    cur = null;
    if (comp[u] != null) { snap(8, `Pop ${u}: it's already in SCC ${comp[u] + 1}.`, view({ vars: { u, L } })); continue; }
    comps.push([]);
    snap([8, 9], `Pop ${u} (the latest finisher left). It has no component yet, so it starts SCC ${comps.length}.`, view({ vars: { u, L } }));
    dfs2(u, comps.length - 1);
  }
  cur = null;
  snap(7, `${comps.length} strongly connected component${comps.length === 1 ? "" : "s"}: ${comps.map((c) => `{${[...c].sort(byName).join(", ")}}`).join(", ")}. Within each, every vertex can reach every other.`, view({ tone: "good", vars: { SCCs: comps.length } }));
  return { steps, comps: comps.map((c) => [...c].sort(byName)), comp };
}

export function tarjan(g) {
  if (!g.directed) throw new Error("Strongly connected components are for directed graphs.");
  const { steps, snap } = recorder();
  const disc = {}, low = {}, S = [], onS = new Set(), comp = {}, comps = [], edges = {};
  let index = 0, cur = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, [v === cur && "current", comp[v] != null && "grp", comp[v] == null && onS.has(v) && "frontier"].filter(Boolean).join(" ")])),
    styles: Object.fromEntries(g.nodes.filter((v) => comp[v] != null).map((v) => [v, grp(comp[v])])),
    badges: Object.fromEntries(g.nodes.filter((v) => disc[v] != null).map((v) => [v, `${disc[v]}/${low[v]}`])),
    edges: { ...edges }, S: [...S], comps: comps.map((c) => [...c]),
    table: g.nodes.map((v) => ({ v, disc: disc[v], low: low[v], onS: onS.has(v) })), ...extra,
  });
  const connect = (v) => {
    disc[v] = low[v] = index++; S.push(v); onS.add(v); cur = v;
    snap(5, `Discover ${v}: disc[${v}] = low[${v}] = ${disc[v]}. Push it onto the stack.`, view({ vars: { v, index, "disc[v]": disc[v], "low[v]": low[v], S } }));
    for (const { v: w, id } of g.out[v]) {
      const active = { from: v, to: w, id };
      if (disc[w] == null) {
        edges[id] = "tree";
        snap(7, `${w} is undiscovered: explore it (tree edge ${edgeName(g, v, w)}).`, view({ active, vars: { v, w, S } }));
        connect(w); cur = v;
        const old = low[v];
        low[v] = Math.min(low[v], low[w]);
        snap(7, `Back in ${v}: low[${v}] = min(${old}, low[${w}] = ${low[w]}) = ${low[v]}.${low[v] < old ? ` ${w}'s subtree reaches something older than ${v}.` : ""}`, view({ active, vars: { v, w, "low[v]": low[v], "low[w]": low[w] } }));
      } else if (onS.has(w)) {
        edges[id] = "back";
        const old = low[v];
        low[v] = Math.min(low[v], disc[w]);
        snap(8, `${w} is on the stack, so it's in the SCC being built: low[${v}] = min(${old}, disc[${w}] = ${disc[w]}) = ${low[v]}.`, view({ active, vars: { v, w, "low[v]": low[v], "disc[w]": disc[w] } }));
      } else {
        edges[id] = "cross";
        snap(6, `${w} is already in a finished SCC (it's off the stack), so ${edgeName(g, v, w)} leads out of this component: ignore it.`, view({ active, vars: { v, w } }));
      }
    }
    if (low[v] === disc[v]) {
      const c = [];
      let w;
      do { w = S.pop(); onS.delete(w); c.push(w); comp[w] = comps.length; } while (w !== v);
      comps.push(c);
      snap([9, 10], `low[${v}] = disc[${v}] = ${disc[v]}: nothing below ${v} reaches higher, so ${v} is the root of an SCC. Pop ${c.join(", ")}: SCC ${comps.length} = {${[...c].sort(byName).join(", ")}}.`, view({ vars: { v, "low[v]": low[v], "disc[v]": disc[v], S } }));
    } else snap(9, `low[${v}] = ${low[v]} < disc[${v}] = ${disc[v]}: ${v} can reach an older vertex on the stack, so it stays there as part of a bigger SCC.`, view({ vars: { v, "low[v]": low[v], "disc[v]": disc[v], S } }));
  };
  snap(1, "Tarjan's algorithm finds every SCC in a single DFS. disc[v] is v's discovery number; low[v] is the smallest disc of a stack vertex that v's subtree can reach.", view({ vars: { index, S } }));
  for (const v of g.nodes) if (disc[v] == null) { cur = null; snap(3, `${v} is undiscovered: call strongconnect(${v}).`, view({ vars: { v, index } })); connect(v); }
  cur = null;
  snap(2, `${comps.length} strongly connected component${comps.length === 1 ? "" : "s"}: ${comps.map((c) => `{${[...c].sort(byName).join(", ")}}`).join(", ")}. Tarjan finds them in reverse topological order.`, view({ tone: "good", vars: { SCCs: comps.length } }));
  return { steps, comps: comps.map((c) => [...c].sort(byName)), comp };
}

// One vertex per SCC; an edge between two SCCs when any edge crosses between them.
export function condensation(g, comps) {
  const of = {};
  comps.forEach((c, i) => c.forEach((v) => { of[v] = i; }));
  const pairs = new Set();
  for (const e of g.edges) if (of[e.from] !== of[e.to]) pairs.add(`${of[e.from]}>${of[e.to]}`);
  return { nodes: comps.map((c, i) => ({ id: `C${i + 1}`, members: c, k: i })), edges: [...pairs].map((p) => p.split(">").map(Number)).map(([a, b]) => ({ from: `C${a + 1}`, to: `C${b + 1}` })) };
}

export function run(algo, g, opts = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  return ALGORITHMS[algo].run(g, opts);
}
