// Shortest paths: Dijkstra (non-negative weights), Bellman–Ford (negative
// weights, finds negative cycles) and Floyd–Warshall (all pairs), plus path
// reconstruction from π / next. Ties are broken alphabetically.
import { byName, edgeName, listNames, pathFrom, recorder, showDist } from "./graph.js";

const PATH_LINES = ["path ← []; v ← t", "while v ≠ nil: put v at the front of path; v ← π[v]"];

export const ALGORITHMS = {
  dijkstra: {
    name: "Dijkstra's algorithm", source: true, target: true,
    code: () => [
      "for each vertex v: d[v] ← ∞; π[v] ← nil",
      "d[s] ← 0; Q ← every vertex  // min-priority queue on d",
      "while Q is not empty",
      "  u ← EXTRACT-MIN(Q)  // ties: alphabetical",
      "  for each edge u → v with weight w",
      "    if d[u] + w < d[v] then  // relax",
      "      d[v] ← d[u] + w; π[v] ← u",
      ...PATH_LINES,
    ],
    run: (g, { source, target }) => dijkstra(g, source, target),
  },
  bellman: {
    name: "Bellman–Ford", source: true, target: true,
    code: () => [
      "for each vertex v: d[v] ← ∞; π[v] ← nil",
      "d[s] ← 0",
      "for round ← 1 to |V| − 1",
      "  for each edge u → v with weight w  // in the order listed",
      "    if d[u] + w < d[v] then",
      "      d[v] ← d[u] + w; π[v] ← u",
      "for each edge u → v with weight w  // one more pass",
      "  if d[u] + w < d[v] then report a negative cycle",
      ...PATH_LINES,
    ],
    run: (g, { source, target }) => bellmanFord(g, source, target),
  },
  floyd: {
    name: "Floyd–Warshall (all pairs)", source: true, target: true, maxNodes: 10,
    code: () => [
      "D[i][j] ← w(i, j), 0 if i = j, ∞ if no edge; next[i][j] ← j",
      "for each vertex k  // allow k as a stop-over",
      "  for each vertex i",
      "    for each vertex j",
      "      if D[i][k] + D[k][j] < D[i][j] then",
      "        D[i][j] ← D[i][k] + D[k][j]; next[i][j] ← next[i][k]",
      "if some D[i][i] < 0 then there is a negative cycle",
      "path(s, t): p ← [s]; while s ≠ t: s ← next[s][t]; append s",
    ],
    run: (g, { source, target }) => floydWarshall(g, source, target),
  },
};

export const COMPLEXITY = [
  { id: "dijkstra", name: "Dijkstra (binary heap)", time: "O((V + E) log V)", space: "O(V)", note: "Greedy: once extracted, a distance is final. Wrong with negative edges. O(V²) with an array." },
  { id: "bellman", name: "Bellman–Ford", time: "O(V · E)", space: "O(V)", note: "Relaxes every edge V − 1 times. Handles negative edges and detects negative cycles." },
  { id: "floyd", name: "Floyd–Warshall", time: "O(V³)", space: "O(V²)", note: "All pairs at once with dynamic programming. Negative edges are fine; a negative D[i][i] means a negative cycle." },
];

const arcs = (g) => g.edges.flatMap((e) => (g.directed ? [{ u: e.from, v: e.to, w: e.w, id: e.id }] : [{ u: e.from, v: e.to, w: e.w, id: e.id }, { u: e.to, v: e.from, w: e.w, id: e.id }]));
const idOf = (g, a, b) => g.out[a].find((x) => x.v === b)?.id;

// Shared tail: walk π back from t, one step per vertex.
function reconstruct(g, snap, view, prev, s, t, lineA, lineB) {
  if (!t) return null;
  if (prev[t] == null && t !== s) {
    snap(lineA, `π[${t}] is nil and ${t} ≠ ${s}: there is no path from ${s} to ${t}.`, view({ tone: "bad", vars: { t } }));
    return null;
  }
  const path = [];
  snap(lineA, `Rebuild the path to ${t} by following π backwards from ${t}.`, view({ vars: { t, v: t, path } }));
  for (let v = t; v != null; v = prev[v]) {
    path.unshift(v);
    snap(lineB, prev[v] ? `Put ${v} at the front of the path. π[${v}] = ${prev[v]}, so step back to ${prev[v]}.` : `Put ${v} at the front. π[${v}] is nil: we've reached the source.`, view({ path: [...path], vars: { v, "π[v]": prev[v], path: [...path] } }));
  }
  return path;
}
const pathEdges = (g, path) => (path ?? []).slice(1).map((v, i) => idOf(g, path[i], v));

export function dijkstra(g, s, t = null) {
  if (!g.nodes.includes(s)) throw new Error(`${s} isn't in the graph.`);
  const neg = g.edges.find((e) => e.w < 0);
  if (neg) throw new Error(`Dijkstra's algorithm needs non-negative weights, but ${edgeName(g, neg.from, neg.to)} has weight ${neg.w}. Use Bellman–Ford instead.`);
  const { steps, snap } = recorder();
  const d = Object.fromEntries(g.nodes.map((v) => [v, Infinity])), pi = Object.fromEntries(g.nodes.map((v) => [v, null]));
  const done = new Set(), order = [];
  let u = null, relaxed = null;
  const pq = () => g.nodes.filter((v) => !done.has(v)).sort((a, b) => d[a] - d[b] || byName(a, b));
  const view = (extra = {}) => {
    const path = extra.path ?? null, onPath = new Set(path ?? []);
    const edges = Object.fromEntries(g.nodes.filter((v) => pi[v]).map((v) => [idOf(g, pi[v], v), done.has(v) ? "tree" : "candidate"]));
    if (relaxed) edges[relaxed] = "relaxed";
    for (const id of pathEdges(g, path)) edges[id] = "path";
    return {
      nodes: Object.fromEntries(g.nodes.map((v) => [v, onPath.has(v) ? "path" : v === u ? "current" : done.has(v) ? "done" : d[v] < Infinity ? "frontier" : ""])),
      badges: Object.fromEntries(g.nodes.map((v) => [v, showDist(d[v])])), edges,
      pq: pq().map((v) => ({ v, key: d[v] })), table: g.nodes.map((v) => ({ v, d: d[v], pi: pi[v], done: done.has(v) })), ...extra,
    };
  };
  snap(1, `Every distance starts at ∞ and no vertex has a predecessor yet.`, view({ vars: { s } }));
  d[s] = 0;
  snap(2, `d[${s}] = 0. Every vertex goes into the priority queue, keyed by its current distance.`, view({ vars: { s, Q: pq() } }));
  while (done.size < g.nodes.length) {
    u = pq()[0];
    if (d[u] === Infinity) {
      const rest = pq();
      u = null;
      snap(4, `The smallest distance left is ∞, so ${listNames(rest)} can't be reached from ${s}. Stop.`, view({ vars: { s } }));
      break;
    }
    done.add(u); order.push(u); relaxed = null;
    snap(4, `Extract ${u}, the closest unfinished vertex (d = ${d[u]}). Its distance is now final: any other route would leave the finished set through a vertex that's at least as far away, and weights can't be negative.`, view({ vars: { u, "d[u]": d[u], Q: pq() } }));
    for (const { v, w, id } of g.out[u]) {
      const active = { from: u, to: v, id };
      if (done.has(v)) { relaxed = null; snap(5, `${v} is already finished, so ${edgeName(g, u, v)} can't help it.`, view({ active, vars: { u, v, w, "d[u]": d[u], "d[v]": d[v] } })); continue; }
      const cand = d[u] + w;
      if (cand < d[v]) {
        const old = d[v];
        d[v] = cand; pi[v] = u; relaxed = id;
        snap([6, 7], `Relax ${edgeName(g, u, v)}: d[${u}] + ${w} = ${cand} < ${showDist(old)}, so d[${v}] ← ${cand} and π[${v}] ← ${u}.`, view({ active, vars: { u, v, w, "d[u]": d[u], "d[v]": cand, "π[v]": u } }));
      } else {
        relaxed = null;
        snap(6, `Try ${edgeName(g, u, v)}: d[${u}] + ${w} = ${cand}, not better than d[${v}] = ${d[v]}. No change.`, view({ active, vars: { u, v, w, "d[u]": d[u], "d[v]": d[v] } }));
      }
    }
    relaxed = null;
  }
  u = null;
  snap(3, `Done. Shortest distances from ${s}: ${g.nodes.map((v) => `${v} ${showDist(d[v])}`).join(", ")}. The tree edges show the shortest-path tree.`, view({ tone: "good", vars: { order } }));
  const path = reconstruct(g, snap, view, pi, s, t, 8, 9);
  return { steps, dist: d, prev: pi, order, path };
}

export function bellmanFord(g, s, t = null) {
  if (!g.nodes.includes(s)) throw new Error(`${s} isn't in the graph.`);
  const { steps, snap } = recorder();
  const d = Object.fromEntries(g.nodes.map((v) => [v, Infinity])), pi = Object.fromEntries(g.nodes.map((v) => [v, null]));
  const list = arcs(g);
  let relaxed = null, round = 0, cycleIds = null, cycleNodes = null;
  const view = (extra = {}) => {
    const path = extra.path ?? null, onPath = new Set(path ?? []), onCycle = new Set(cycleNodes ?? []);
    const edges = Object.fromEntries(g.nodes.filter((v) => pi[v] && idOf(g, pi[v], v)).map((v) => [idOf(g, pi[v], v), "tree"]));
    if (relaxed) edges[relaxed] = "relaxed";
    for (const id of pathEdges(g, path)) edges[id] = "path";
    for (const id of cycleIds ?? []) edges[id] = "cycle";
    return {
      nodes: Object.fromEntries(g.nodes.map((v) => [v, onCycle.has(v) ? "bad" : onPath.has(v) ? "path" : v === extra.active?.from ? "current" : d[v] < Infinity ? "visited" : ""])),
      badges: Object.fromEntries(g.nodes.map((v) => [v, showDist(d[v])])), edges, round,
      arcs: list.map((a) => `${a.u}→${a.v}`), arc: extra.arc ?? null,
      table: g.nodes.map((v) => ({ v, d: d[v], pi: pi[v] })), ...extra,
    };
  };
  snap(1, `Every distance starts at ∞.${g.directed ? "" : " The graph is undirected, so each edge is tried in both directions."}`, view({ vars: { s } }));
  d[s] = 0;
  snap(2, `d[${s}] = 0. A shortest path uses at most |V| − 1 = ${g.nodes.length - 1} edges, so ${g.nodes.length - 1} rounds of relaxing every edge are enough.`, view({ vars: { s } }));
  for (round = 1; round < g.nodes.length; round++) {
    let changed = false;
    relaxed = null;
    snap(3, `Round ${round}: try every edge in turn. After round k, every vertex whose shortest path has at most k edges has its final distance.`, view({ vars: { round } }));
    for (const [i, a] of list.entries()) {
      const active = { from: a.u, to: a.v, id: a.id }, base = { round, u: a.u, v: a.v, w: a.w, "d[u]": d[a.u], "d[v]": d[a.v] };
      if (d[a.u] === Infinity) { relaxed = null; snap(5, `${a.u}→${a.v}: d[${a.u}] is still ∞, so there's nothing to pass on.`, view({ active, arc: i, vars: base })); continue; }
      const cand = d[a.u] + a.w;
      if (cand < d[a.v]) {
        const old = d[a.v];
        d[a.v] = cand; pi[a.v] = a.u; relaxed = a.id; changed = true;
        snap([5, 6], `${a.u}→${a.v}: d[${a.u}] + (${a.w}) = ${cand} < ${showDist(old)}, so d[${a.v}] ← ${cand} and π[${a.v}] ← ${a.u}.`, view({ active, arc: i, vars: { ...base, "d[v]": cand } }));
      } else { relaxed = null; snap(5, `${a.u}→${a.v}: d[${a.u}] + (${a.w}) = ${cand}, not less than ${showDist(d[a.v])}. No change.`, view({ active, arc: i, vars: base })); }
    }
    relaxed = null;
    if (!changed) {
      snap(3, `Nothing changed in round ${round}, so nothing can change in later rounds either. Skip ahead to the negative-cycle check.`, view({ vars: { round } }));
      break;
    }
  }
  round = "check";
  snap(7, `One extra pass: if any edge can still be relaxed, distances would keep falling for ever, which means a negative cycle is reachable from ${s}.`, view({ vars: { round: "check" } }));
  for (const [i, a] of list.entries()) {
    const active = { from: a.u, to: a.v, id: a.id };
    if (d[a.u] !== Infinity && d[a.u] + a.w < d[a.v]) {
      // Step back |V| times from v to be sure we're on the cycle, then walk round it.
      const p2 = { ...pi, [a.v]: a.u };
      let x = a.v;
      for (let k = 0; k < g.nodes.length; k++) x = p2[x] ?? x;
      const ring = [x];
      for (let y = p2[x], guard = 0; y != null && y !== x && guard < g.nodes.length; y = p2[y], guard++) ring.unshift(y);
      cycleNodes = ring;
      cycleIds = ring.map((v, k) => idOf(g, v, ring[(k + 1) % ring.length]));
      const total = ring.reduce((sum, v, k) => sum + g.out[v].find((n) => n.v === ring[(k + 1) % ring.length]).w, 0);
      snap(8, `${a.u}→${a.v} can still be relaxed (${d[a.u]} + (${a.w}) < ${d[a.v]}). Negative cycle: ${[...ring, ring[0]].join(" → ")} with total weight ${total}. Going round it again always makes the path shorter, so shortest paths through it aren't defined.`, view({ active, arc: i, tone: "bad", vars: { u: a.u, v: a.v, w: a.w } }));
      return { steps, dist: d, prev: pi, negativeCycle: ring, path: null };
    }
  }
  snap(8, `No edge can be relaxed any more: no negative cycle. Shortest distances from ${s}: ${g.nodes.map((v) => `${v} ${showDist(d[v])}`).join(", ")}.`, view({ tone: "good", vars: { round: "check" } }));
  const path = reconstruct(g, snap, view, pi, s, t, 9, 10);
  return { steps, dist: d, prev: pi, negativeCycle: null, path };
}

export function floydWarshall(g, s = g.nodes[0], t = null) {
  const { steps, snap } = recorder();
  const N = g.nodes;
  const D = Object.fromEntries(N.map((i) => [i, Object.fromEntries(N.map((j) => [j, i === j ? 0 : Infinity]))]));
  const nx = Object.fromEntries(N.map((i) => [i, Object.fromEntries(N.map((j) => [j, i === j ? j : null]))]));
  for (const a of arcs(g)) if (a.w < D[a.u][a.v]) { D[a.u][a.v] = a.w; nx[a.u][a.v] = a.v; }
  let k = null;
  const view = (extra = {}) => {
    const [ci, cj] = extra.cell ?? [];
    const onPath = new Set(extra.path ?? []);
    const edges = Object.fromEntries(pathEdges(g, extra.path).map((id) => [id, "path"]));
    return {
      nodes: Object.fromEntries(N.map((v) => [v, onPath.has(v) ? "path" : [v === k && "current", v === ci && "hl-i", v === cj && "hl-j"].filter(Boolean).join(" ")])),
      badges: s ? Object.fromEntries(N.map((v) => [v, showDist(D[s][v])])) : {}, edges,
      D: structuredClone(D), k, ...extra,
    };
  };
  snap(1, `Start with the direct edges: D[i][j] is the weight of i → j, 0 on the diagonal and ∞ where there's no edge. The badges show the row for ${s}.`, view({ vars: { k: null } }));
  for (k of N) {
    snap(2, `k = ${k}: may a path from i to j now pass through ${k}? Only pairs where both D[i][${k}] and D[${k}][j] are finite can improve.`, view({ vars: { k } }));
    for (const i of N) for (const j of N) {
      const via = D[i][k] + D[k][j];
      if (D[i][k] === Infinity || D[k][j] === Infinity) continue;
      const better = via < D[i][j];
      if (!better && (i === j || i === k || j === k)) continue; // these can never improve without a negative cycle
      const old = D[i][j];
      if (better) { D[i][j] = via; nx[i][j] = nx[i][k]; }
      snap(better ? [5, 6] : 5, better
        ? `D[${i}][${k}] + D[${k}][${j}] = ${D[i][k]} + ${D[k][j]} = ${via} < ${showDist(old)}: going ${i} → ${k} → ${j} is shorter, so D[${i}][${j}] ← ${via}.`
        : `D[${i}][${k}] + D[${k}][${j}] = ${D[i][k]} + ${D[k][j]} = ${via}, not less than D[${i}][${j}] = ${showDist(old)}. Keep it.`,
      view({ cell: [i, j], vars: { k, i, j, "D[i][k]": D[i][k], "D[k][j]": D[k][j], "D[i][j]": D[i][j] } }));
    }
  }
  k = null;
  const negative = N.filter((v) => D[v][v] < 0);
  if (negative.length) {
    snap(7, `D[${negative[0]}][${negative[0]}] = ${D[negative[0]][negative[0]]} < 0: a path from ${negative[0]} back to itself has negative weight, so there's a negative cycle through ${listNames(negative)}. Distances that can use it aren't meaningful.`, view({ tone: "bad", vars: { negative } }));
    return { steps, D, next: nx, negativeCycle: negative, path: null };
  }
  snap(7, `Every vertex has been tried as a stop-over and no diagonal entry is negative. D now holds every shortest distance.`, view({ tone: "good", vars: {} }));
  let path = null;
  if (t) {
    if (D[s][t] === Infinity) snap(8, `D[${s}][${t}] = ∞: there is no path from ${s} to ${t}.`, view({ tone: "bad", vars: { s, t } }));
    else {
      path = [s];
      snap(8, `Rebuild the path from ${s} to ${t} with next[][]: next[i][j] is the first step on the best path from i to j.`, view({ path: [...path], vars: { s, t, path } }));
      for (let x = s; x !== t;) { x = nx[x][t]; path.push(x); snap(8, `next[${path.at(-2)}][${t}] = ${x}: step to ${x}.`, view({ path: [...path], vars: { x, path: [...path] } })); }
      snap(8, `Path ${path.join(" → ")}, length ${D[s][t]}.`, view({ path: [...path], tone: "good", vars: { path } }));
    }
  }
  return { steps, D, next: nx, negativeCycle: null, path };
}

export function run(algo, g, opts = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  return ALGORITHMS[algo].run(g, opts);
}

export { pathFrom };
