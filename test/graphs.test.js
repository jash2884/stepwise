// DSA graph tools: textbook examples (CLRS figures) and fuzz tests against
// brute force and against each other.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLES, parseGraph, randomGraph, reachable, transpose } from "../public/js/engines/graph.js";
import { ALGORITHMS as MST, kruskal, prim } from "../public/js/engines/mst.js";
import { ALGORITHMS as PATHS, bellmanFord, dijkstra, floydWarshall } from "../public/js/engines/paths.js";
import { ALGORITHMS as SCC, condensation, kosaraju, tarjan } from "../public/js/engines/scc.js";
import { ALGORITHMS as TRAV, bfs, bipartite, components, cycle, dfs, kahn, topoDfs } from "../public/js/engines/traversal.js";

let seed = 20261027;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ex = (k) => parseGraph(EXAMPLES[k].text, { directed: EXAMPLES[k].directed });

// Every step must name real pseudocode lines and carry a note and variables.
function wellFormed(res, code, label) {
  assert.ok(res.steps.length > 1, label);
  for (const s of res.steps) {
    assert.ok(typeof s.note === "string" && s.note.length > 10, `${label}: note`);
    if (s.line != null) for (const l of [s.line].flat()) assert.ok(Number.isInteger(l) && l >= 1 && l <= code.length, `${label}: line ${l}`);
    assert.ok(s.nodes && typeof s.nodes === "object", `${label}: nodes`);
  }
}

test("parser: formats, weights, isolated vertices and errors", () => {
  const g = parseGraph("A B 4\nB-C\nC -> D -2\nE", { directed: true });
  assert.deepEqual(g.nodes, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(g.edges.map((e) => e.w), [4, 1, -2]);
  assert.deepEqual(g.out.E, []);
  assert.throws(() => parseGraph("A B\nB A"), /twice/);
  assert.doesNotThrow(() => parseGraph("A B\nB A", { directed: true }));
  assert.throws(() => parseGraph("A A 3"), /itself/);
  assert.throws(() => parseGraph("A B x"), /weight/);
  assert.throws(() => parseGraph(""), /at least one/);
  for (const k of Object.keys(EXAMPLES)) assert.doesNotThrow(() => ex(k), k);
});

test("CLRS 22.3: BFS from s gives the textbook distances and visit order", () => {
  const r = bfs(ex("clrsBfs"), "s");
  assert.deepEqual(r.dist, { r: 1, s: 0, t: 2, u: 3, v: 2, w: 1, x: 2, y: 3 });
  assert.deepEqual(r.order, ["s", "r", "w", "v", "t", "x", "u", "y"]);
  wellFormed(r, TRAV.bfs.code(ex("clrsBfs")), "bfs");
});

test("CLRS 22.4: DFS times and edge classes", () => {
  const r = dfs(ex("clrsDfs"));
  assert.deepEqual(r.d, { u: 1, v: 2, y: 3, x: 4, w: 9, z: 10 });
  assert.deepEqual(r.f, { x: 5, y: 6, v: 7, u: 8, z: 11, w: 12 });
  assert.equal(r.kind["x>v"], "back");
  assert.equal(r.kind["u>x"], "forward");
  assert.equal(r.kind["w>y"], "cross");
  wellFormed(r, TRAV.dfs.code(ex("clrsDfs")), "dfs");
});

test("CLRS 22.7: both topological sorts respect every edge; cycles are reported", () => {
  const g = ex("clothes");
  const t = topoDfs(g), k = kahn(g);
  for (const order of [t.order, k.order]) {
    assert.equal(order.length, g.nodes.length);
    for (const e of g.edges) assert.ok(order.indexOf(e.from) < order.indexOf(e.to), `${e.from} before ${e.to}`);
  }
  const cyc = parseGraph("A B\nB C\nC A\nC D", { directed: true });
  assert.equal(kahn(cyc).ok, false);
  assert.equal(topoDfs(cyc).ok, false);
  assert.deepEqual(cycle(cyc).cycle, ["A", "B", "C"]);
});

test("components, bipartite and undirected cycles on small examples", () => {
  assert.equal(components(ex("islands")).count, 4);
  assert.equal(bipartite(ex("bipartite")).bipartite, true);
  const odd = bipartite(ex("oddCycle"));
  assert.equal(odd.bipartite, false);
  assert.equal(odd.oddCycle.length % 2, 1);
  assert.equal(cycle(parseGraph("A B\nB C\nC D")).hasCycle, false);
  assert.equal(cycle(parseGraph("A B\nB C\nC A")).hasCycle, true);
});

test("CLRS 23.1: Kruskal and Prim both find weight 37", () => {
  const g = ex("clrsMst");
  const k = kruskal(g), p = prim(g, "a");
  assert.equal(k.weight, 37);
  assert.equal(p.weight, 37);
  assert.equal(k.tree.length, 8);
  assert.ok(k.steps.some((s) => s.edges["b>h"] === "rejected" || s.edges["h>i"] === "rejected"), "some edge is rejected as a cycle");
  wellFormed(k, MST.kruskal.code(g), "kruskal");
  wellFormed(p, MST.prim.code(g), "prim");
});

test("CLRS 24.6 Dijkstra, 24.4 Bellman–Ford and 25.1 Floyd–Warshall", () => {
  const d = dijkstra(ex("clrsDijkstra"), "s", "x");
  assert.deepEqual(d.dist, { s: 0, t: 8, x: 9, y: 5, z: 7 });
  assert.deepEqual(d.path, ["s", "y", "t", "x"]);
  wellFormed(d, PATHS.dijkstra.code(), "dijkstra");
  const b = bellmanFord(ex("clrsBellman"), "s", "z");
  assert.deepEqual(b.dist, { s: 0, t: 2, x: 4, y: 7, z: -2 });
  assert.deepEqual(b.path, ["s", "y", "x", "t", "z"]);
  assert.equal(b.negativeCycle, null);
  wellFormed(b, PATHS.bellman.code(), "bellman");
  assert.throws(() => dijkstra(ex("clrsBellman"), "s"), /non-negative/);
  const f = floydWarshall(ex("clrsFloyd"), "1", "3");
  const rows = ["1", "2", "3", "4", "5"].map((i) => ["1", "2", "3", "4", "5"].map((j) => f.D[i][j]));
  assert.deepEqual(rows, [[0, 1, -3, 2, -4], [3, 0, -4, 1, -1], [7, 4, 0, 5, 3], [2, -1, -5, 0, -2], [8, 5, 1, 6, 0]]);
  assert.deepEqual(f.path, ["1", "5", "4", "3"]);
  wellFormed(f, PATHS.floyd.code(), "floyd");
});

test("negative cycles are found and shown", () => {
  const g = ex("negCycle");
  const b = bellmanFord(g, "A");
  assert.deepEqual([...b.negativeCycle].sort(), ["B", "C", "D"]);
  const total = b.negativeCycle.reduce((s, v, i) => s + g.out[v].find((n) => n.v === b.negativeCycle[(i + 1) % b.negativeCycle.length]).w, 0);
  assert.ok(total < 0);
  assert.ok(floydWarshall(g, "A").negativeCycle.length > 0);
});

test("CLRS 22.9: Kosaraju and Tarjan find the four SCCs, condensation is a DAG", () => {
  const g = ex("clrsScc");
  const want = [["a", "b", "e"], ["c", "d"], ["f", "g"], ["h"]].map((c) => c.join()).sort();
  const k = kosaraju(g), t = tarjan(g);
  assert.deepEqual(k.comps.map((c) => c.join()).sort(), want);
  assert.deepEqual(t.comps.map((c) => c.join()).sort(), want);
  const c = condensation(g, k.comps);
  assert.equal(c.nodes.length, 4);
  assert.equal(c.edges.length, 5); // abe→cd, abe→fg, cd→fg, cd→h, fg→h
  wellFormed(k, SCC.kosaraju.code(), "kosaraju");
  wellFormed(t, SCC.tarjan.code(), "tarjan");
  assert.ok(k.steps.some((s) => s.transposed), "pass 2 shows the transposed graph");
});

// --- Fuzz ------------------------------------------------------------------------------
const N = 250;
const randomG = (opts) => parseGraph(randomGraph(rand, { n: 3 + Math.floor(rand() * 7), ...opts }), { directed: !!opts.directed });

test("fuzz: BFS distances are true hop counts", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: rand() < 0.5, connected: rand() < 0.7, weighted: false });
    const s = g.nodes[Math.floor(rand() * g.nodes.length)];
    const r = bfs(g, s);
    // Brute force: layers by repeated expansion.
    const hop = { [s]: 0 };
    for (let k = 0, frontier = [s]; frontier.length; k++) {
      const next = [];
      for (const u of frontier) for (const { v } of g.out[u]) if (!(v in hop)) { hop[v] = k + 1; next.push(v); }
      frontier = next;
    }
    for (const v of g.nodes) assert.equal(r.dist[v], hop[v] ?? Infinity, `${v}`);
    for (const v of g.nodes) if (r.parent[v]) assert.equal(r.dist[v], r.dist[r.parent[v]] + 1);
  }
});

test("fuzz: DFS parenthesis theorem and directed-cycle agreement", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: true, connected: rand() < 0.6, weighted: false, extra: Math.floor(rand() * 6) });
    const r = dfs(g);
    for (const u of g.nodes) for (const v of g.nodes) {
      if (u === v) continue;
      const a = [r.d[u], r.f[u]], b = [r.d[v], r.f[v]];
      const disjoint = a[1] < b[0] || b[1] < a[0], nested = (a[0] < b[0] && b[1] < a[1]) || (b[0] < a[0] && a[1] < b[1]);
      assert.ok(disjoint || nested, "intervals nest or are disjoint");
    }
    const hasBack = Object.values(r.kind).includes("back");
    assert.equal(cycle(g).hasCycle, hasBack);
    assert.equal(kahn(g).ok, !hasBack);
    assert.equal(topoDfs(g).ok, !hasBack);
  }
});

test("fuzz: topological orders respect every edge of random DAGs", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: true, dag: true, weighted: false, connected: rand() < 0.7 });
    for (const r of [kahn(g), topoDfs(g)]) {
      assert.ok(r.ok);
      assert.deepEqual([...r.order].sort(), [...g.nodes].sort());
      for (const e of g.edges) assert.ok(r.order.indexOf(e.from) < r.order.indexOf(e.to));
    }
    assert.equal(cycle(g).hasCycle, false);
  }
});

test("fuzz: components and bipartite match brute force", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: false, connected: false, weighted: false, extra: 2 + Math.floor(rand() * 6) });
    const c = components(g);
    for (const u of g.nodes) for (const v of g.nodes) assert.equal(c.comp[u] === c.comp[v], reachable(g, u).has(v));
    const b = bipartite(g);
    // Brute force: try every 2-colouring.
    let any = false;
    for (let m = 0; m < 1 << g.nodes.length && !any; m++) any = g.edges.every((e) => ((m >> g.nodes.indexOf(e.from)) & 1) !== ((m >> g.nodes.indexOf(e.to)) & 1));
    assert.equal(b.bipartite, any);
    if (b.bipartite) for (const e of g.edges) assert.notEqual(b.side[e.from], b.side[e.to]);
    // Undirected: a forest has exactly V − components edges.
    assert.equal(cycle(g).hasCycle, g.edges.length > g.nodes.length - c.count);
  }
});

test("fuzz: Kruskal weight = Prim weight = brute force on small graphs", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: false, connected: true, min: 1, max: 9, extra: 1 + Math.floor(rand() * 4) });
    const k = kruskal(g), p = prim(g, g.nodes[0]);
    assert.equal(k.weight, p.weight);
    assert.equal(k.tree.length, g.nodes.length - 1);
    if (g.edges.length <= 10) {
      let best = Infinity;
      for (let m = 0; m < 1 << g.edges.length; m++) {
        const pick = g.edges.filter((_, j) => (m >> j) & 1);
        if (pick.length !== g.nodes.length - 1) continue;
        const sub = parseGraph(pick.map((e) => `${e.from} ${e.to} ${e.w}`).join("\n"));
        if (sub.nodes.length === g.nodes.length && reachable(sub, sub.nodes[0]).size === g.nodes.length) best = Math.min(best, pick.reduce((s, e) => s + e.w, 0));
      }
      assert.equal(k.weight, best);
    }
  }
});

test("fuzz: Dijkstra = Bellman–Ford = Floyd–Warshall on non-negative graphs, and paths add up", () => {
  for (let i = 0; i < N; i++) {
    const directed = rand() < 0.6;
    const g = randomG({ directed, connected: rand() < 0.8, min: 0, max: 9, extra: Math.floor(rand() * 6) });
    const s = g.nodes[0], t = g.nodes.at(-1);
    const d = dijkstra(g, s, t), b = bellmanFord(g, s, t), f = floydWarshall(g, s, t);
    for (const v of g.nodes) {
      assert.equal(d.dist[v], b.dist[v], `dijkstra vs bellman at ${v}`);
      assert.equal(d.dist[v], f.D[s][v], `dijkstra vs floyd at ${v}`);
    }
    for (const r of [d, b, f]) {
      if (d.dist[t] === Infinity) { assert.equal(r.path, null); continue; }
      const len = r.path.slice(1).reduce((sum, v, j) => sum + g.out[r.path[j]].find((n) => n.v === v).w, 0);
      assert.equal(len, d.dist[t]);
    }
  }
});

test("fuzz: Bellman–Ford with negative edges agrees with Floyd–Warshall about negative cycles", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: true, connected: true, min: 1, max: 9, negative: 0.3, extra: Math.floor(rand() * 5) });
    const s = g.nodes[0];
    const b = bellmanFord(g, s), f = floydWarshall(g, s);
    const reachNeg = (f.negativeCycle ?? []).some((v) => reachable(g, s).has(v));
    assert.equal(!!b.negativeCycle, reachNeg);
    if (b.negativeCycle) {
      const c = b.negativeCycle;
      const total = c.reduce((sum, v, j) => sum + g.out[v].find((n) => n.v === c[(j + 1) % c.length]).w, 0);
      assert.ok(total < 0, "reported cycle is really negative");
    } else if (!f.negativeCycle) for (const v of g.nodes) assert.equal(b.dist[v], f.D[s][v]);
  }
});

test("fuzz: SCCs from Kosaraju and Tarjan match brute-force mutual reachability", () => {
  for (let i = 0; i < N; i++) {
    const g = randomG({ directed: true, connected: rand() < 0.7, weighted: false, extra: Math.floor(rand() * 8) });
    const reach = Object.fromEntries(g.nodes.map((v) => [v, reachable(g, v)]));
    const key = (comps) => comps.map((c) => [...c].sort().join()).sort().join("|");
    const truth = [];
    for (const v of g.nodes) if (!truth.some((c) => c.includes(v))) truth.push(g.nodes.filter((u) => reach[v].has(u) && reach[u].has(v)));
    assert.equal(key(kosaraju(g).comps), key(truth));
    assert.equal(key(tarjan(g).comps), key(truth));
    // The condensation is acyclic.
    const c = condensation(g, truth);
    const dag = parseGraph([...c.edges.map((e) => `${e.from} ${e.to}`), ...c.nodes.map((n) => n.id)].join("\n"), { directed: true });
    assert.equal(kahn(dag).ok, true);
    assert.equal(transpose(transpose(g)).edges.map((e) => e.id).join(), g.edges.map((e) => e.id).join());
  }
});
