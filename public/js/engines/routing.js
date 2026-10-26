// Routing: Dijkstra's link-state algorithm and the distance-vector algorithm.
// Graphs are undirected with positive link costs, written one link per line: "A-B 4".

export function parseNetwork(text) {
  const nodes = new Set(), links = [];
  for (const line of String(text).split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Za-z]\w{0,2})\s*[-–\s]\s*([A-Za-z]\w{0,2})\s*[:=\s]\s*(\d{1,3})$/.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write links like A-B 4.`);
    const [a, b, c] = [m[1].toUpperCase(), m[2].toUpperCase(), Number(m[3])];
    if (a === b) throw new Error(`"${line}" connects a node to itself.`);
    if (c < 1) throw new Error(`"${line}": link costs must be at least 1.`);
    const existing = links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (existing) throw new Error(`The link ${a}-${b} is listed twice.`);
    nodes.add(a); nodes.add(b);
    links.push({ a, b, cost: c });
  }
  if (nodes.size < 2) throw new Error("Add at least one link.");
  if (nodes.size > 10) throw new Error("Use at most 10 routers.");
  return { nodes: [...nodes].sort(), links };
}

const neighbours = (g, x) => g.links.filter((l) => l.a === x || l.b === x).map((l) => ({ node: l.a === x ? l.b : l.a, cost: l.cost }));

export function dijkstra(g, source) {
  if (!g.nodes.includes(source)) throw new Error(`${source} isn't in the network.`);
  const dist = Object.fromEntries(g.nodes.map((n) => [n, n === source ? 0 : Infinity]));
  const prev = Object.fromEntries(g.nodes.map((n) => [n, null]));
  const done = new Set();
  const snap = (note, current = null, relaxed = []) => ({ dist: { ...dist }, prev: { ...prev }, done: [...done], current, relaxed, note });
  const steps = [snap(`Start: distance to ${source} is 0, everything else is ∞.`)];
  while (done.size < g.nodes.length) {
    const u = g.nodes.filter((n) => !done.has(n)).reduce((a, b) => (dist[b] < dist[a] ? b : a));
    if (dist[u] === Infinity) { steps.push(snap(`The remaining routers (${g.nodes.filter((n) => !done.has(n)).join(", ")}) can't be reached.`)); break; }
    done.add(u);
    const relaxed = [];
    for (const { node: v, cost } of neighbours(g, u)) {
      if (done.has(v)) continue;
      if (dist[u] + cost < dist[v]) {
        relaxed.push(`${v}: ${dist[v] === Infinity ? "∞" : dist[v]} → ${dist[u] + cost}`);
        dist[v] = dist[u] + cost;
        prev[v] = u;
      }
    }
    steps.push(snap(`Visit ${u} (closest unvisited, distance ${dist[u]}). ${relaxed.length ? `Shorter paths through ${u}: ${relaxed.join(", ")}.` : `No shorter paths through ${u}.`}`, u, relaxed));
  }
  const path = (t) => { const p = []; for (let x = t; x; x = prev[x]) p.unshift(x); return p[0] === source ? p : null; };
  const table = g.nodes.filter((n) => n !== source).map((n) => { const p = path(n); return { dest: n, cost: dist[n], path: p, next: p ? p[1] : null }; });
  return { dist, prev, steps, table };
}

// Synchronous distance vector: every router recomputes its vector from its
// neighbours' vectors of the previous round. Optionally, after convergence a
// link cost changes, which can trigger count-to-infinity.
export function distanceVector(g, { change = null, poison = false, maxRounds = 80 } = {}) {
  let links = g.links.map((l) => ({ ...l }));
  const cost = (x, v) => links.find((l) => (l.a === x && l.b === v) || (l.a === v && l.b === x))?.cost ?? Infinity;
  const nb = (x) => links.filter((l) => l.a === x || l.b === x).map((l) => (l.a === x ? l.b : l.a));
  let vectors = Object.fromEntries(g.nodes.map((x) => [x, Object.fromEntries(g.nodes.map((y) => [y, x === y ? { cost: 0, via: x } : nb(x).includes(y) ? { cost: cost(x, y), via: y } : { cost: Infinity, via: null }]))]));
  const rounds = [{ vectors: structuredClone(vectors), changes: [], note: "Round 0: each router only knows its direct links." }];
  let convergedAt = null, changedAt = null;
  for (let r = 1; r <= maxRounds; r++) {
    if (convergedAt !== null && change && changedAt === null) {
      links = links.map((l) => ((l.a === change.a && l.b === change.b) || (l.a === change.b && l.b === change.a) ? { ...l, cost: change.cost } : l));
      changedAt = r;
    }
    const next = {}, changes = [];
    for (const x of g.nodes) {
      next[x] = {};
      for (const y of g.nodes) {
        if (x === y) { next[x][y] = { cost: 0, via: x }; continue; }
        let best = { cost: Infinity, via: null };
        for (const v of nb(x)) {
          // Poisoned reverse: v tells x "∞" for destinations v reaches through x.
          const told = poison && vectors[v][y].via === x && v !== y ? Infinity : vectors[v][y].cost;
          const c = cost(x, v) + told;
          if (c < best.cost || (c === best.cost && best.via !== null && v < best.via)) best = { cost: c, via: v };
        }
        next[x][y] = best;
        const old = vectors[x][y];
        if (old.cost !== best.cost) changes.push({ x, y, from: old.cost, to: best.cost, via: best.via });
      }
    }
    vectors = next;
    const shown = (c) => `${c.x}→${c.y}: ${c.from === Infinity ? "∞" : c.from} → ${c.to === Infinity ? "∞" : c.to}${c.via ? ` via ${c.via}` : ""}`;
    const list = changes.length ? ` ${changes.slice(0, 4).map(shown).join("; ")}${changes.length > 4 ? `; and ${changes.length - 4} more` : ""}.` : "";
    // Two routers whose routes to the same destination point at each other are counting to infinity.
    const looping = changedAt !== null && changes.some((c) => c.via && next[c.via][c.y].via === c.x);
    const note = changedAt === r
      ? `Round ${r}: the ${change.a}-${change.b} link now costs ${change.cost}.${list}`
      : changes.length ? `Round ${r}:${list}${looping ? " These routers route through each other, so their costs creep up a little each round: count-to-infinity." : ""}` : `Round ${r}: nothing changes, so the vectors have converged.`;
    rounds.push({ vectors: structuredClone(vectors), changes, note });
    if (!changes.length) {
      if (convergedAt === null) { convergedAt = r; if (!change) break; continue; }
      if (changedAt !== null) break;
    }
  }
  const finalStable = rounds.at(-1).changes.length === 0;
  return { rounds, convergedAt, changedAt, finalStable, settledAt: finalStable ? rounds.length - 1 : null };
}

export const EXAMPLES = {
  kurose: { name: "Textbook network (u, v, w, x, y, z)", text: "U-V 2\nU-X 1\nU-W 5\nV-X 2\nV-W 3\nX-W 3\nX-Y 1\nW-Y 1\nW-Z 5\nY-Z 2", source: "U" },
  count: { name: "Count-to-infinity (bad news travels slowly)", text: "X-Y 4\nY-Z 1\nX-Z 50", source: "X", change: { a: "X", b: "Y", cost: 60 } },
  ring: { name: "Five-router ring", text: "A-B 1\nB-C 2\nC-D 1\nD-E 3\nE-A 4\nA-C 5", source: "A" },
};

export function randomNetwork(r = Math.random) {
  const n = 5 + Math.floor(r() * 2), names = "ABCDEFG".slice(0, n).split("");
  const lines = new Set();
  for (let i = 1; i < n; i++) lines.add(`${names[Math.floor(r() * i)]}-${names[i]}`); // spanning tree keeps it connected
  while (lines.size < n + 2) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (a !== b && !lines.has(`${names[a]}-${names[b]}`) && !lines.has(`${names[b]}-${names[a]}`)) lines.add(`${names[Math.min(a, b)]}-${names[Math.max(a, b)]}`);
  }
  return [...lines].map((l) => `${l} ${1 + Math.floor(r() * 9)}`).join("\n");
}
