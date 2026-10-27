// Weighted graphs for the DSA graph tools: read "A B 4" edge lists, keep every
// adjacency list in alphabetical order (so runs are deterministic and match the
// textbook), make random graphs, and record steps for the views.

const NAME = /^[A-Za-z0-9_']{1,12}$/;
export const byName = (a, b) => a.localeCompare(b, "en", { numeric: true });

// One edge per line: "A B 4", "A-B 4", "A -> B 4" or just "A B" (weight 1).
// A line with a single name adds a vertex with no edges.
export function parseGraph(text, { directed = false, maxNodes = 16, maxEdges = 40 } = {}) {
  const nodes = new Set(), edges = [], seen = new Set();
  for (const raw of String(text).split(/[\n;,]+/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    let t = line.replace(/->|→/g, " ").trim().split(/\s+/);
    const dash = /^([A-Za-z0-9_']{1,12})-([A-Za-z0-9_']{1,12})$/.exec(t[0]);
    if (dash) t = [dash[1], dash[2], ...t.slice(1)];
    const bad = new Error(`Can't read "${line}". Write one edge per line, like A B 4 (the weight is optional).`);
    if (t.length > 3 || !NAME.test(t[0]) || (t.length > 1 && !NAME.test(t[1]))) throw bad;
    if (t.length === 1) { nodes.add(t[0]); continue; }
    const [a, b] = t;
    if (t[2] != null && !/^-?\d{1,3}$/.test(t[2])) throw new Error(`"${line}": the weight must be a whole number from −999 to 999.`);
    const w = t[2] == null ? 1 : Number(t[2]);
    if (a === b) throw new Error(`"${line}" joins ${a} to itself. Self-loops aren't supported here.`);
    const key = directed ? `${a}>${b}` : [a, b].sort(byName).join(">");
    if (seen.has(key)) throw new Error(`The edge ${a}${directed ? "→" : "–"}${b} is listed twice.`);
    seen.add(key);
    nodes.add(a); nodes.add(b);
    edges.push({ id: `${a}>${b}`, from: a, to: b, w });
  }
  if (!nodes.size) throw new Error("Add at least one edge, like A B 4.");
  if (nodes.size > maxNodes) throw new Error(`Use at most ${maxNodes} vertices (this graph has ${nodes.size}).`);
  if (edges.length > maxEdges) throw new Error(`Use at most ${maxEdges} edges (this graph has ${edges.length}).`);
  return build([...nodes].sort(byName), edges, directed);
}

// out[u]: edges leaving u (both directions when undirected); inn[u]: edges into u.
// Each entry is { v, w, id } and lists are sorted by neighbour name.
export function build(nodes, edges, directed) {
  const out = Object.fromEntries(nodes.map((n) => [n, []])), inn = Object.fromEntries(nodes.map((n) => [n, []]));
  for (const e of edges) {
    out[e.from].push({ v: e.to, w: e.w, id: e.id });
    inn[e.to].push({ v: e.from, w: e.w, id: e.id });
    if (!directed) { out[e.to].push({ v: e.from, w: e.w, id: e.id }); inn[e.from].push({ v: e.to, w: e.w, id: e.id }); }
  }
  for (const n of nodes) { out[n].sort((x, y) => byName(x.v, y.v)); inn[n].sort((x, y) => byName(x.v, y.v)); }
  const both = Object.fromEntries(nodes.map((n) => {
    const m = new Map();
    for (const x of [...out[n], ...inn[n]]) if (!m.has(x.v)) m.set(x.v, x);
    return [n, [...m.values()].sort((x, y) => byName(x.v, y.v))];
  }));
  return { nodes, edges, directed, out, inn, both, weighted: edges.some((e) => e.w !== 1) };
}

export const transpose = (g) => build(g.nodes, g.edges.map((e) => ({ ...e, from: e.to, to: e.from })), g.directed);
export const asText = (g) => [...g.edges.map((e) => `${e.from} ${e.to} ${e.w}`), ...g.nodes.filter((n) => !g.both[n].length)].join("\n");
export const edgeName = (g, u, v) => `${u}${g.directed ? "→" : "–"}${v}`;
export const showDist = (d) => (d === Infinity ? "∞" : d === -Infinity ? "−∞" : String(d).replace("-", "−"));
export const listNames = (xs) => (xs.length ? xs.join(", ") : "none");

// Walk π back from t. Returns null when t isn't reached.
export function pathFrom(prev, s, t) {
  const p = [];
  for (let x = t, guard = 0; x != null && guard < 100; x = prev[x], guard++) p.unshift(x);
  return p[0] === s ? p : null;
}

// Copy-on-snap step recorder: engines mutate their own state and call snap().
export function recorder() {
  const steps = [];
  return { steps, snap: (line, note, state = {}) => { steps.push({ line, note, ...structuredClone(state) }); } };
}

// A random graph as text. connected: start from a random spanning tree; dag:
// only edges from earlier to later in a hidden random order.
export function randomGraph(r = Math.random, { n = 6 + Math.floor(r() * 2), directed = false, extra = Math.ceil(n * 0.6), min = 1, max = 9, weighted = true, dag = false, connected = true, negative = 0 } = {}) {
  const names = "ABCDEFGHIJKLMNOP".slice(0, n).split("");
  const order = [...names];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const pairs = new Map();
  const add = (a, b) => {
    if (a === b) return;
    if (dag && order.indexOf(a) > order.indexOf(b)) [a, b] = [b, a];
    const key = directed ? `${a}>${b}` : [a, b].sort().join(">");
    if (directed && !dag && pairs.has(`${b}>${a}`) && r() < 0.7) return; // few two-way pairs: they clutter the picture
    if (!pairs.has(key)) pairs.set(key, [a, b]);
  };
  if (connected) for (let i = 1; i < n; i++) { const a = order[Math.floor(r() * i)], b = order[i]; r() < 0.5 ? add(a, b) : add(b, a); }
  let guard = 0;
  while (pairs.size < (connected ? n - 1 : 0) + extra && guard++ < 200) add(names[Math.floor(r() * n)], names[Math.floor(r() * n)]);
  const lines = [...pairs.values()].map(([a, b]) => {
    let w = min + Math.floor(r() * (max - min + 1));
    if (negative && r() < negative) w = -1 - Math.floor(r() * 4);
    return weighted ? `${a} ${b} ${w}` : `${a} ${b}`;
  });
  for (const x of names) if (![...pairs.values()].some((p) => p.includes(x))) lines.push(x);
  return lines.join("\n");
}

// Brute force for tests and practice: who can u reach?
export function reachable(g, u) {
  const seen = new Set([u]), stack = [u];
  while (stack.length) for (const { v } of g.out[stack.pop()]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
  return seen;
}

// Textbook graphs. pos (optional) is a hand layout in grid units, used when the
// graph being drawn has exactly these vertices.
export const EXAMPLES = {
  clrsBfs: { name: "CLRS Fig. 22.3 (BFS, undirected)", algo: "bfs", directed: false, source: "s",
    text: "r s\nr v\ns w\nw t\nw x\nt x\nt u\nx u\nx y\nu y",
    pos: { r: [0, 0], s: [1, 0], t: [2, 0], u: [3, 0], v: [0, 1], w: [1, 1], x: [2, 1], y: [3, 1] } },
  clrsDfs: { name: "CLRS Fig. 22.4 (DFS, directed)", algo: "dfs", directed: true, source: "u",
    text: "u v\nu x\nx v\nv y\ny x\nw y\nw z",
    pos: { u: [0, 0], v: [1, 0], w: [2, 0], x: [0, 1], y: [1, 1], z: [2, 1] } },
  clothes: { name: "CLRS Fig. 22.7 (getting dressed, a DAG)", algo: "topo", directed: true, source: "socks",
    text: "undershorts pants\nundershorts shoes\npants belt\npants shoes\nbelt jacket\nshirt belt\nshirt tie\ntie jacket\nsocks shoes\nwatch",
    pos: { undershorts: [0, 0], socks: [2, 0], watch: [3.2, 0], pants: [0.4, 1], shoes: [1.7, 1], shirt: [2.9, 1.1], belt: [0.9, 2], tie: [2.5, 2.1], jacket: [1.6, 3] } },
  clrsScc: { name: "CLRS Fig. 22.9 (strongly connected components)", algo: "kosaraju", directed: true, source: "a",
    text: "a b\nb c\nb e\nb f\nc d\nc g\nd c\nd h\ne a\ne f\nf g\ng f\ng h",
    pos: { a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0], e: [0, 1], f: [1, 1], g: [2, 1], h: [3, 1] } },
  clrsMst: { name: "CLRS Fig. 23.1 (MST weight 37)", algo: "kruskal", directed: false, source: "a",
    text: "a b 4\na h 8\nb c 8\nb h 11\nc d 7\nc f 4\nc i 2\nd e 9\nd f 14\ne f 10\nf g 2\ng h 1\ng i 6\nh i 7",
    pos: { a: [0, 1], b: [1, 0], c: [2, 0], d: [3, 0], e: [4, 1], f: [3, 2], g: [2, 2], h: [1, 2], i: [1.6, 1] } },
  clrsDijkstra: { name: "CLRS Fig. 24.6 (Dijkstra from s)", algo: "dijkstra", directed: true, source: "s",
    text: "s t 10\ns y 5\nt x 1\nt y 2\ny t 3\ny x 9\ny z 2\nx z 4\nz x 6\nz s 7",
    pos: { s: [0, 1], t: [1, 0], x: [2, 0], y: [1, 2], z: [2, 2] } },
  clrsBellman: { name: "CLRS Fig. 24.4 (Bellman–Ford, negative edges)", algo: "bellman", directed: true, source: "s",
    text: "t x 5\nt y 8\nt z -4\nx t -2\ny x -3\ny z 9\nz x 7\nz s 2\ns t 6\ns y 7",
    pos: { s: [0, 1], t: [1, 0], x: [2, 0], y: [1, 2], z: [2, 2] } },
  clrsFloyd: { name: "CLRS Fig. 25.1 (Floyd–Warshall)", algo: "floyd", directed: true, source: "1",
    text: "1 2 3\n1 3 8\n1 5 -4\n2 4 1\n2 5 7\n3 2 4\n4 1 2\n4 3 -5\n5 4 6",
    pos: { 1: [0, 0.6], 2: [1.4, 0], 3: [2.4, 1], 4: [1.4, 2], 5: [0, 1.6] } },
  negCycle: { name: "Negative cycle (B → C → D → B)", algo: "bellman", directed: true, source: "A",
    text: "A B 4\nB C 2\nC D -3\nD B -1\nA E 5\nE D 2",
    pos: { A: [0, 1], B: [1, 0], C: [2, 0.5], D: [1.6, 1.6], E: [0.6, 2] } },
  bipartite: { name: "Even cycle and a tail (bipartite)", algo: "bipartite", directed: false, source: "A",
    text: "A B\nB C\nC D\nD E\nE F\nF A\nC G\nG H", pos: null },
  oddCycle: { name: "Triangle inside (not bipartite)", algo: "bipartite", directed: false, source: "A",
    text: "A B\nB C\nC D\nD A\nB E\nE C\nD F", pos: null },
  islands: { name: "Four components (one vertex on its own)", algo: "components", directed: false, source: "A",
    text: "A B 2\nB C 3\nA C 4\nD E 1\nF G 5\nG H 2\nH F 1\nI", pos: null },
  cities: { name: "Weighted network (8 towns)", directed: false, source: "A",
    text: "A B 7\nA D 5\nB C 8\nB D 9\nB E 7\nC E 5\nD E 15\nD F 6\nE F 8\nE G 9\nF G 11\nG H 3\nF H 12",
    pos: { A: [0, 0], B: [1.2, 0], C: [2.4, 0], D: [0.4, 1], E: [1.8, 1], F: [0.9, 2], G: [2.3, 2], H: [1.7, 2.9] } },
  tarjan: { name: "Two cycles joined by a bridge", algo: "tarjan", directed: true, source: "A",
    text: "A B\nB C\nC A\nC D\nD E\nE F\nF D\nF G", pos: null },
  courses: { name: "Course prerequisites (a DAG)", algo: "kahn", directed: true, source: "CS1",
    text: "CS1 CS2\nCS1 Disc\nCS2 DSA\nDisc DSA\nDSA OS\nDSA DBMS\nCS2 Arch\nArch OS\nDisc TOC\nTOC CD\nDSA CD", pos: null },
};
