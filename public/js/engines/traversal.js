// Graph traversal: BFS and DFS and the classic jobs built on them (connected
// components, cycle detection, 2-colouring, topological sort). Neighbours are
// always visited in alphabetical order. Every step carries the pseudocode line,
// the variables, and what the picture should show.
import { edgeName, listNames, recorder, showDist } from "./graph.js";

const grp = (k) => `--c:var(--series-${(k % 8) + 1})`;

export const ALGORITHMS = {
  bfs: {
    name: "Breadth-first search", source: true,
    code: () => [
      "for each vertex u: colour[u] ← white; d[u] ← ∞; π[u] ← nil",
      "colour[s] ← grey; d[s] ← 0; Q ← [s]",
      "while Q is not empty",
      "  u ← dequeue(Q)",
      "  for each neighbour v of u  // alphabetical",
      "    if colour[v] = white then",
      "      colour[v] ← grey; d[v] ← d[u] + 1; π[v] ← u",
      "      enqueue(Q, v)",
      "  colour[u] ← black  // every neighbour seen",
    ],
    run: (g, { source }) => bfs(g, source),
  },
  dfs: {
    name: "Depth-first search",
    code: () => [
      "for each vertex u: colour[u] ← white; π[u] ← nil",
      "time ← 0",
      "for each vertex u  // alphabetical",
      "  if colour[u] = white then visit(u)",
      "visit(u):",
      "  time ← time + 1; d[u] ← time; colour[u] ← grey",
      "  for each neighbour v of u  // alphabetical",
      "    if colour[v] = white then",
      "      π[v] ← u; visit(v)  // (u, v) is a tree edge",
      "    else classify (u, v)  // back, forward or cross",
      "  colour[u] ← black; time ← time + 1; f[u] ← time",
    ],
    run: (g) => dfs(g),
  },
  components: {
    name: "Connected components",
    code: () => [
      "count ← 0; comp[v] ← nil for every v",
      "for each vertex s  // alphabetical",
      "  if comp[s] = nil then  // a new component",
      "    count ← count + 1; comp[s] ← count; Q ← [s]",
      "    while Q is not empty",
      "      u ← dequeue(Q)",
      "      for each neighbour v of u",
      "        if comp[v] = nil then comp[v] ← count; enqueue(Q, v)",
      "return count",
    ],
    run: (g) => components(g),
  },
  cycle: {
    name: "Cycle detection",
    code: (g) => g.directed ? [
      "for each vertex u: colour[u] ← white",
      "for each vertex u  // alphabetical",
      "  if colour[u] = white and visit(u) then return \"cycle\"",
      "return \"no cycle\"",
      "visit(u):",
      "  colour[u] ← grey  // u is on the current path",
      "  for each v with an edge u → v",
      "    if colour[v] = grey then return true  // back edge",
      "    if colour[v] = white and visit(v) then return true",
      "  colour[u] ← black; return false",
    ] : [
      "for each vertex u: visited[u] ← false",
      "for each vertex u  // alphabetical",
      "  if not visited[u] and visit(u, nil) then return \"cycle\"",
      "return \"no cycle\"",
      "visit(u, parent):",
      "  visited[u] ← true",
      "  for each neighbour v of u",
      "    if visited[v] and v ≠ parent then return true",
      "    if not visited[v] and visit(v, u) then return true",
      "  return false",
    ],
    run: (g) => cycle(g),
  },
  bipartite: {
    name: "Bipartite check (2-colouring)",
    code: () => [
      "for each vertex s  // alphabetical",
      "  if side[s] = nil then",
      "    side[s] ← 0; Q ← [s]",
      "    while Q is not empty",
      "      u ← dequeue(Q)",
      "      for each neighbour v of u",
      "        if side[v] = nil then side[v] ← 1 − side[u]; enqueue(Q, v)",
      "        else if side[v] = side[u] then return \"not bipartite\"",
      "return \"bipartite\"",
    ],
    run: (g) => bipartite(g),
  },
  kahn: {
    name: "Topological sort (Kahn's algorithm)", mode: "directed",
    code: () => [
      "for each vertex v: indeg[v] ← number of edges into v",
      "Q ← every v with indeg[v] = 0  // alphabetical",
      "order ← []",
      "while Q is not empty",
      "  u ← dequeue(Q); append u to order",
      "  for each edge u → v",
      "    indeg[v] ← indeg[v] − 1  // remove the edge",
      "    if indeg[v] = 0 then enqueue(Q, v)",
      "if |order| < |V| then the graph has a cycle",
    ],
    run: (g) => kahn(g),
  },
  topo: {
    name: "Topological sort (DFS finish order)", mode: "directed",
    code: () => [
      "for each vertex u: colour[u] ← white",
      "L ← empty list",
      "for each vertex u  // alphabetical",
      "  if colour[u] = white then visit(u)",
      "visit(u):",
      "  colour[u] ← grey",
      "  for each v with an edge u → v",
      "    if colour[v] = grey then stop: a cycle, no order exists",
      "    if colour[v] = white then visit(v)",
      "  colour[u] ← black; put u at the front of L  // u is finished",
    ],
    run: (g) => topoDfs(g),
  },
};

export const COMPLEXITY = [
  { id: "bfs", name: "BFS", time: "O(V + E)", space: "O(V)", note: "Finds fewest-edge paths from s. Uses a FIFO queue." },
  { id: "dfs", name: "DFS", time: "O(V + E)", space: "O(V)", note: "Recursion (a stack). Discovery/finish times nest like brackets." },
  { id: "components", name: "Connected components", time: "O(V + E)", space: "O(V)", note: "One BFS per component. Directed edges are treated as undirected." },
  { id: "cycle", name: "Cycle detection", time: "O(V + E)", space: "O(V)", note: "Directed: a back edge to a grey vertex. Undirected: an edge to a visited vertex that isn't the parent." },
  { id: "bipartite", name: "Bipartite check", time: "O(V + E)", space: "O(V)", note: "Bipartite exactly when there's no odd cycle." },
  { id: "kahn", name: "Kahn's algorithm", time: "O(V + E)", space: "O(V)", note: "Repeatedly removes a vertex with no incoming edges." },
  { id: "topo", name: "DFS topological sort", time: "O(V + E)", space: "O(V)", note: "Reverse finishing order. Only works on a DAG." },
];

const deg = (g, u) => g.out[u];

// --- BFS --------------------------------------------------------------------------------
export function bfs(g, s) {
  if (!g.nodes.includes(s)) throw new Error(`${s} isn't in the graph.`);
  const { steps, snap } = recorder();
  const colour = Object.fromEntries(g.nodes.map((v) => [v, "white"])), d = Object.fromEntries(g.nodes.map((v) => [v, Infinity])), pi = Object.fromEntries(g.nodes.map((v) => [v, null]));
  const tree = new Set(), seen = new Set(), order = [];
  let Q = [], u = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === u ? "current" : colour[v] === "grey" ? "frontier" : colour[v] === "black" ? "done" : ""])),
    badges: Object.fromEntries(g.nodes.map((v) => [v, showDist(d[v])])),
    edges: Object.fromEntries([...[...seen].map((id) => [id, "seen"]), ...[...tree].map((id) => [id, "tree"])]),
    queue: [...Q], order: [...order], table: g.nodes.map((v) => ({ v, d: d[v], pi: pi[v], colour: colour[v] })), ...extra,
  });
  snap(1, `Every vertex starts white (undiscovered) with distance ∞. BFS will explore outwards from ${s} one layer at a time.`, view({ vars: { s } }));
  colour[s] = "grey"; d[s] = 0; Q = [s];
  snap(2, `Discover the source ${s}: colour it grey, set d[${s}] = 0 and put it in the queue.`, view({ vars: { s, Q } }));
  while (Q.length) {
    u = Q.shift(); order.push(u);
    snap(4, `Dequeue ${u} from the front of the queue (distance ${d[u]}). Now look at each of its neighbours: ${listNames(deg(g, u).map((x) => x.v))}.`, view({ vars: { u, "d[u]": d[u], Q } }));
    for (const { v, id } of deg(g, u)) {
      const active = { from: u, to: v, id };
      if (colour[v] === "white") {
        colour[v] = "grey"; d[v] = d[u] + 1; pi[v] = u; tree.add(id); Q.push(v);
        snap([7, 8], `${v} is white, so this is the first time we've reached it: d[${v}] = d[${u}] + 1 = ${d[v]}, π[${v}] = ${u}. ${edgeName(g, u, v)} joins the BFS tree and ${v} joins the back of the queue.`, view({ active, vars: { u, v, "d[u]": d[u], "d[v]": d[v], "colour[v]": "grey", Q } }));
      } else {
        if (!tree.has(id)) seen.add(id);
        snap(6, `${v} is already ${colour[v]} (found at distance ${d[v]}), so skip it. BFS never improves a distance it has already set, because it reaches every vertex by the fewest edges first.`, view({ active, vars: { u, v, "d[u]": d[u], "d[v]": d[v], "colour[v]": colour[v], Q } }));
      }
    }
    colour[u] = "black";
    snap(9, `Every neighbour of ${u} has been seen, so ${u} turns black (finished).`, view({ vars: { u, Q } }));
  }
  u = null;
  const unreached = g.nodes.filter((v) => d[v] === Infinity);
  const levels = [];
  for (const v of order) (levels[d[v]] ??= []).push(v);
  snap(3, `The queue is empty. Visit order: ${order.join(", ")}. Layers: ${levels.map((l, i) => `${i}: {${l.join(", ")}}`).join("; ")}.${unreached.length ? ` ${listNames(unreached)} can't be reached from ${s}, so d stays ∞.` : ""} The highlighted edges form the BFS tree: following π gives a path with the fewest edges.`, view({ tone: "good", vars: { order } }));
  return { steps, order, dist: d, parent: pi, levels };
}

// --- DFS --------------------------------------------------------------------------------
export function dfs(g) {
  const { steps, snap } = recorder();
  const colour = Object.fromEntries(g.nodes.map((v) => [v, "white"])), d = {}, f = {}, pi = {}, kind = {};
  const stack = [], order = [];
  let time = 0, cur = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === cur ? "current" : colour[v] === "grey" ? "frontier" : colour[v] === "black" ? "done" : ""])),
    badges: Object.fromEntries(g.nodes.filter((v) => d[v]).map((v) => [v, `${d[v]}/${f[v] ?? "–"}`])),
    edges: { ...kind }, stack: [...stack], order: [...order], table: g.nodes.map((v) => ({ v, d: d[v], f: f[v], pi: pi[v] })), ...extra,
  });
  snap(1, `Every vertex starts white. DFS goes as deep as it can along one path before backing up, stamping each vertex with a discovery time d and a finish time f.`, view({ vars: { time } }));
  const visit = (u) => {
    time++; d[u] = time; colour[u] = "grey"; stack.push(u); order.push(u); cur = u;
    snap(6, `Discover ${u} at time ${time}: it turns grey and goes on the recursion stack.`, view({ vars: { u, time, "d[u]": d[u] } }));
    for (const { v, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (kind[id] && !g.directed) {
        snap(10, `${edgeName(g, u, v)} was already classified as a ${kind[id]} edge from ${v}'s side, so there's nothing new here.`, view({ active, vars: { u, v, time } }));
        continue;
      }
      if (colour[v] === "white") {
        pi[v] = u; kind[id] = "tree";
        snap(9, `${v} is white: ${edgeName(g, u, v)} is a tree edge. Go deeper into ${v}.`, view({ active, vars: { u, v, time, "colour[v]": "white" } }));
        visit(v); cur = u;
        snap(7, `Back in ${u} after finishing ${v}. Carry on with ${u}'s next neighbour.`, view({ vars: { u, time } }));
      } else {
        let k, why;
        if (colour[v] === "grey") { k = "back"; why = `${v} is grey, so it's an ancestor of ${u} still on the stack: ${edgeName(g, u, v)} is a back edge${g.directed ? " and closes a cycle" : ""}.`; }
        else if (d[u] < d[v]) { k = "forward"; why = `${v} is black and was discovered after ${u} (d[${v}] = ${d[v]} > d[${u}] = ${d[u]}), so it's a descendant: ${edgeName(g, u, v)} is a forward edge.`; }
        else { k = "cross"; why = `${v} is black and was discovered before ${u} in another branch (d[${v}] = ${d[v]} < d[${u}] = ${d[u]}): ${edgeName(g, u, v)} is a cross edge.`; }
        kind[id] = k;
        snap(10, why, view({ active, vars: { u, v, time, "colour[v]": colour[v], "d[u]": d[u], "d[v]": d[v] } }));
      }
    }
    time++; f[u] = time; colour[u] = "black"; stack.pop();
    snap(11, `${u} has no white neighbours left: it finishes at time ${time} and turns black.`, view({ vars: { u, time, "d[u]": d[u], "f[u]": f[u] } }));
  };
  for (const u of g.nodes) {
    cur = null;
    if (colour[u] === "white") {
      snap(4, `${u} is still white, so start a new DFS tree from ${u}.`, view({ vars: { u, time } }));
      visit(u);
    }
  }
  cur = null;
  const counts = ["tree", "back", "forward", "cross"].map((k) => [k, Object.values(kind).filter((x) => x === k).length]).filter(([, n]) => n);
  snap(3, `Done. Discovery order: ${order.join(", ")}. Edges: ${counts.map(([k, n]) => `${n} ${k}`).join(", ")}.${g.directed ? ` ${counts.some(([k]) => k === "back") ? "There's a back edge, so the graph has a cycle." : "No back edges, so the graph is a DAG."}` : ""} Each vertex shows d/f.`, view({ tone: "good", vars: { time } }));
  return { steps, order, d, f, parent: pi, kind };
}

// --- Connected components ---------------------------------------------------------------
export function components(g) {
  const { steps, snap } = recorder();
  const comp = Object.fromEntries(g.nodes.map((v) => [v, null])), used = new Set();
  let count = 0, Q = [], u = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === u ? "current grp" : comp[v] ? (Q.includes(v) ? "frontier grp" : "grp") : ""])),
    styles: Object.fromEntries(g.nodes.filter((v) => comp[v]).map((v) => [v, grp(comp[v] - 1)])),
    badges: Object.fromEntries(g.nodes.filter((v) => comp[v]).map((v) => [v, `#${comp[v]}`])),
    edges: Object.fromEntries([...used].map((id) => [id, "tree"])), queue: [...Q], count, ...extra,
  });
  snap(1, `Find the groups of vertices that are joined to each other.${g.directed ? " Edge directions are ignored here (these are the weakly connected components)." : ""}`, view({ vars: { count } }));
  for (const s of g.nodes) {
    if (comp[s]) { snap(3, `${s} already belongs to component ${comp[s]}.`, view({ vars: { s, count } })); continue; }
    count++; comp[s] = count; Q = [s];
    snap(4, `${s} has no component yet, so it starts component ${count}. Flood outwards from ${s} with BFS.`, view({ vars: { s, count, Q } }));
    while (Q.length) {
      u = Q.shift();
      for (const { v, id } of g.both[u]) {
        const active = { from: u, to: v, id: g.edges.some((e) => e.id === id) ? id : null };
        if (!comp[v]) { comp[v] = count; Q.push(v); used.add(id); snap(8, `${v} is reached from ${u}, so it's in component ${count} too.`, view({ active, vars: { s, count, u, v, Q } })); }
      }
    }
    u = null;
    snap(5, `The queue is empty: component ${count} is {${g.nodes.filter((v) => comp[v] === count).join(", ")}}.`, view({ vars: { s, count } }));
  }
  const groups = Array.from({ length: count }, (_, i) => g.nodes.filter((v) => comp[v] === i + 1));
  snap(9, `${count} connected component${count === 1 ? "" : "s"}: ${groups.map((x) => `{${x.join(", ")}}`).join(", ")}.${count === 1 ? " The graph is connected." : ""}`, view({ tone: "good", vars: { count } }));
  return { steps, count, comp, groups };
}

// --- Cycle detection --------------------------------------------------------------------
export function cycle(g) {
  const { steps, snap } = recorder();
  const colour = Object.fromEntries(g.nodes.map((v) => [v, "white"])), parent = {}, used = new Set(), stack = [];
  let found = null, cur = null;
  const dir = g.directed;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, found?.nodes.includes(v) ? "bad" : v === cur ? "current" : colour[v] === "grey" ? "frontier" : colour[v] === "black" ? "done" : ""])),
    edges: Object.fromEntries([...[...used].map((id) => [id, "tree"]), ...(found ? found.edges.map((id) => [id, "cycle"]) : [])]),
    stack: [...stack], ...extra,
  });
  const idOf = (a, b) => g.out[a].find((x) => x.v === b)?.id;
  const visit = (u, par) => {
    colour[u] = "grey"; parent[u] = par; stack.push(u); cur = u;
    snap(6, dir ? `Visit ${u}: grey means "on the path we're exploring right now".` : `Visit ${u} (reached from ${par ?? "nowhere: a new start"}).`, view({ vars: { u, parent: par } }));
    for (const { v, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (dir ? colour[v] === "grey" : colour[v] !== "white" && v !== par) {
        const path = [];
        for (let x = u; x !== v; x = parent[x]) path.unshift(x);
        path.unshift(v);
        const cyc = [...path, v];
        found = { nodes: path, edges: cyc.slice(1).map((x, i) => idOf(cyc[i], x)) };
        snap(8, dir ? `${v} is grey: it's on the current path, so ${edgeName(g, u, v)} leads back to an ancestor. Cycle found: ${cyc.join(" → ")}.` : `${v} was already visited and isn't ${u}'s parent, so there's a second route between them. Cycle found: ${cyc.join(" – ")}.`, view({ active, tone: "bad", vars: { u, v, "colour[v]": colour[v] } }));
        return true;
      }
      if (colour[v] === "white") {
        used.add(id);
        snap(9, `${v} hasn't been visited: follow ${edgeName(g, u, v)}.`, view({ active, vars: { u, v } }));
        if (visit(v, u)) return true;
        cur = u;
      } else {
        snap(dir ? 7 : 8, dir ? `${v} is black: it was fully explored earlier and no cycle was found through it, so skip it.` : `${v} is ${u}'s parent: that's just the edge we came along, not a cycle.`, view({ active, vars: { u, v } }));
      }
    }
    colour[u] = "black"; stack.pop();
    snap(10, `${u} is finished with no cycle through it.`, view({ vars: { u } }));
    return false;
  };
  snap(1, dir ? "Look for a directed cycle with DFS. White = unvisited, grey = on the current path, black = finished." : "Look for a cycle with DFS, remembering the vertex we came from.", view());
  for (const u of g.nodes) {
    if (colour[u] !== "white") continue;
    cur = null;
    snap(3, `${u} is unvisited: start a DFS from it.`, view({ vars: { u } }));
    if (visit(u, null)) {
      cur = null;
      snap(3, `The graph has a cycle: ${[...found.nodes, found.nodes[0]].join(dir ? " → " : " – ")}.${dir ? " So it isn't a DAG and has no topological order." : ""}`, view({ tone: "bad", vars: { result: "cycle" } }));
      return { steps, hasCycle: true, cycle: found.nodes };
    }
  }
  cur = null;
  snap(4, dir ? "Every vertex is black and no back edge appeared: the graph is acyclic (a DAG)." : "Every vertex was visited without finding a second route: the graph is a forest (no cycles).", view({ tone: "good", vars: { result: "no cycle" } }));
  return { steps, hasCycle: false, cycle: null };
}

// --- Bipartite --------------------------------------------------------------------------
export function bipartite(g) {
  const { steps, snap } = recorder();
  const side = Object.fromEntries(g.nodes.map((v) => [v, null])), parent = {}, used = new Set();
  let Q = [], u = null, bad = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, [bad?.nodes.includes(v) && "bad", v === u && "current", side[v] != null && "grp", Q.includes(v) && "frontier"].filter(Boolean).join(" ")])),
    styles: Object.fromEntries(g.nodes.filter((v) => side[v] != null).map((v) => [v, side[v] ? "--c:var(--series-2)" : "--c:var(--series-1)"])),
    badges: Object.fromEntries(g.nodes.filter((v) => side[v] != null).map((v) => [v, side[v] ? "R" : "L"])),
    edges: Object.fromEntries([...[...used].map((id) => [id, "tree"]), ...(bad ? bad.edges.map((id) => [id, "cycle"]) : [])]), queue: [...Q], ...extra,
  });
  snap(1, `Try to split the vertices into two sides, L and R, so that every edge goes between the sides. BFS gives each new vertex the opposite side to the vertex that found it.${g.directed ? " Directions are ignored." : ""}`, view());
  for (const s of g.nodes) {
    if (side[s] != null) continue;
    side[s] = 0; Q = [s]; parent[s] = null;
    snap(3, `${s} has no side yet: put it on side L and start a BFS.`, view({ vars: { s, "side[s]": "L", Q } }));
    while (Q.length) {
      u = Q.shift();
      for (const { v, id } of g.both[u]) {
        const active = { from: u, to: v, id };
        if (side[v] == null) {
          side[v] = 1 - side[u]; parent[v] = u; used.add(id); Q.push(v);
          snap(7, `${v} has no side: put it opposite ${u}, on side ${side[v] ? "R" : "L"}.`, view({ active, vars: { u, v, "side[u]": side[u] ? "R" : "L", "side[v]": side[v] ? "R" : "L", Q } }));
        } else if (side[v] === side[u]) {
          const up = (x) => { const p = []; for (; x != null; x = parent[x]) p.push(x); return p; };
          const pu = up(u), pv = up(v), lca = pu.find((x) => pv.includes(x));
          const ring = [...pu.slice(0, pu.indexOf(lca) + 1), ...pv.slice(0, pv.indexOf(lca)).reverse()];
          const ids = ring.map((x, i) => { const y = ring[(i + 1) % ring.length]; return g.both[x].find((n) => n.v === y).id; });
          bad = { nodes: ring, edges: ids };
          snap(8, `${u} and ${v} are both on side ${side[u] ? "R" : "L"} but share an edge. They sit on an odd cycle (${[...ring, ring[0]].join(" – ")}, ${ring.length} edges), and an odd cycle can't be 2-coloured. Not bipartite.`, view({ active, tone: "bad", vars: { u, v, "side[u]": side[u] ? "R" : "L", "side[v]": side[v] ? "R" : "L" } }));
          return { steps, bipartite: false, oddCycle: ring, side };
        } else snap(8, `${v} is already on the other side (${side[v] ? "R" : "L"}): fine.`, view({ active, vars: { u, v, "side[u]": side[u] ? "R" : "L", "side[v]": side[v] ? "R" : "L", Q } }));
      }
    }
    u = null;
  }
  u = null;
  const L = g.nodes.filter((v) => side[v] === 0), R = g.nodes.filter((v) => side[v] === 1);
  snap(9, `Bipartite. L = {${L.join(", ")}}, R = {${R.join(", ")}}: every edge joins L to R.`, view({ tone: "good" }));
  return { steps, bipartite: true, side, L, R };
}

// --- Kahn -------------------------------------------------------------------------------
export function kahn(g) {
  const { steps, snap } = recorder();
  const indeg = Object.fromEntries(g.nodes.map((v) => [v, g.inn[v].length])), removed = new Set(), order = [];
  let Q = [], u = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === u ? "current" : order.includes(v) ? "done" : Q.includes(v) ? "frontier" : ""])),
    badges: Object.fromEntries(g.nodes.filter((v) => !order.includes(v)).map((v) => [v, `in ${indeg[v]}`])),
    edges: Object.fromEntries([...removed].map((id) => [id, "removed"])), queue: [...Q], order: [...order], indeg: { ...indeg }, ...extra,
  });
  snap(1, `Count the edges coming into each vertex (its in-degree). A vertex with in-degree 0 has nothing that must come before it.`, view({ vars: { indeg: g.nodes.map((v) => `${v}:${indeg[v]}`) } }));
  Q = g.nodes.filter((v) => indeg[v] === 0);
  snap(2, `Start the queue with every vertex of in-degree 0: ${listNames(Q)}.`, view({ vars: { Q } }));
  while (Q.length) {
    u = Q.shift(); order.push(u);
    snap(5, `Take ${u} from the queue and add it to the order. Now remove its outgoing edges.`, view({ vars: { u, Q, order } }));
    for (const { v, id } of g.out[u]) {
      indeg[v]--; removed.add(id);
      const freed = indeg[v] === 0;
      if (freed) Q.push(v);
      snap(freed ? [7, 8] : 7, `Remove ${u} → ${v}: in-degree of ${v} drops to ${indeg[v]}.${freed ? ` Nothing else has to come before ${v} now, so it joins the queue.` : ""}`, view({ active: { from: u, to: v, id }, vars: { u, v, "indeg[v]": indeg[v], Q } }));
    }
  }
  u = null;
  const left = g.nodes.filter((v) => !order.includes(v));
  if (left.length) {
    snap(9, `The queue is empty but ${listNames(left)} still have incoming edges: they lie on a cycle, so there's no topological order.`, view({ tone: "bad", vars: { order } }));
    return { steps, order, ok: false, left };
  }
  snap(9, `All ${order.length} vertices are placed: ${order.join(", ")}. Every edge points from earlier to later in this order.`, view({ tone: "good", vars: { order } }));
  return { steps, order, ok: true };
}

// --- DFS topological sort ---------------------------------------------------------------
export function topoDfs(g) {
  const { steps, snap } = recorder();
  const colour = Object.fromEntries(g.nodes.map((v) => [v, "white"])), used = new Set(), L = [], stack = [], fin = {};
  let cur = null, time = 0, cyc = null;
  const view = (extra = {}) => ({
    nodes: Object.fromEntries(g.nodes.map((v) => [v, v === cur ? "current" : colour[v] === "grey" ? "frontier" : colour[v] === "black" ? "done" : ""])),
    badges: Object.fromEntries(Object.entries(fin).map(([v, t]) => [v, `f ${t}`])),
    edges: Object.fromEntries([...[...used].map((id) => [id, "tree"]), ...(cyc ? [[cyc, "back"]] : [])]), stack: [...stack], order: [...L], ...extra,
  });
  const visit = (u) => {
    colour[u] = "grey"; stack.push(u); cur = u; time++;
    snap(6, `Visit ${u}. Everything reachable from ${u} must finish before ${u} does.`, view({ vars: { u, L } }));
    for (const { v, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (colour[v] === "grey") { cyc = id; snap(8, `${v} is grey, so ${u} → ${v} goes back up the current path: there's a cycle, and a graph with a cycle has no topological order.`, view({ active, tone: "bad", vars: { u, v } })); return false; }
      if (colour[v] === "white") { used.add(id); snap(9, `${v} is white: visit it first.`, view({ active, vars: { u, v } })); if (!visit(v)) return false; cur = u; }
      else snap(7, `${v} is already finished (and already in L), so ${u} will go in front of it.`, view({ active, vars: { u, v, L } }));
    }
    colour[u] = "black"; stack.pop(); time++; fin[u] = time; L.unshift(u);
    snap(10, `${u} is finished: put it at the front of L. Everything ${u} points to is already in L, behind it.`, view({ vars: { u, L } }));
    return true;
  };
  snap(1, "Run DFS. When a vertex finishes, everything it points to has already finished, so listing vertices by decreasing finish time gives a topological order.", view({ vars: { L } }));
  for (const u of g.nodes) {
    if (colour[u] !== "white") continue;
    cur = null;
    snap(4, `${u} is white: start a DFS from it.`, view({ vars: { u, L } }));
    if (!visit(u)) return { steps, order: null, ok: false };
  }
  cur = null;
  snap(3, `Done. L = ${L.join(", ")}: each vertex comes before everything it points to.`, view({ tone: "good", vars: { L } }));
  return { steps, order: L, ok: true };
}

export function run(algo, g, opts = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  return ALGORITHMS[algo].run(g, opts);
}
