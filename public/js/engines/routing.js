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

export const DIJKSTRA_CODE = [
  "D[s] ← 0; D[v] ← ∞ for every other v; N′ ← { }",
  "while some router is not in N′",
  "  u ← the router not in N′ with the smallest D[u]",
  "  add u to N′  // D[u] is now final",
  "  for each neighbour v of u not in N′",
  "    if D[u] + c(u,v) < D[v] then",
  "      D[v] ← D[u] + c(u,v); prev[v] ← u",
];

export const DV_CODE = [
  "for each router x: Dx(y) ← c(x,y) for neighbours y, ∞ otherwise",
  "repeat (one round: every router at once)",
  "  each router sends its vector Dx to its neighbours",
  "  for each router x and destination y",
  "    Dx(y) ← min over neighbours v of c(x,v) + Dv(y)",
  "    // poisoned reverse: v tells x ∞ for routes that go through x",
  "until no vector changes",
];

export const FLOOD_CODE = [
  "origin builds its LSP: its links and their costs, seq = 1",
  "origin sends the LSP on every link",
  "on receiving an LSP from neighbour n:",
  "  if its seq is newer than the stored copy then",
  "    store it; forward it on every link except to n",
  "  else discard it  // a duplicate",
  "stop when no copy of the LSP is in flight",
];

const fmtD = (d) => (d === Infinity ? "∞" : d);

export function dijkstra(g, source) {
  if (!g.nodes.includes(source)) throw new Error(`${source} isn't in the network.`);
  const dist = Object.fromEntries(g.nodes.map((n) => [n, n === source ? 0 : Infinity]));
  const prev = Object.fromEntries(g.nodes.map((n) => [n, null]));
  const done = new Set();
  const snap = (note, current = null, relaxed = [], extra = {}) => ({ dist: { ...dist }, prev: { ...prev }, done: [...done], current, relaxed, note, ...extra,
    vars: { "N′": [...done], u: current, ...extra.v, D: g.nodes.map((n) => `${n}=${fmtD(dist[n])}`) } });
  const steps = [snap(`Start: the distance to ${source} is 0 and every other router is ∞, because nothing has been explored yet. N′, the set of routers whose distance is final, is empty.`, null, [], { line: 1 })];
  while (done.size < g.nodes.length) {
    const u = g.nodes.filter((n) => !done.has(n)).reduce((a, b) => (dist[b] < dist[a] ? b : a));
    if (dist[u] === Infinity) { steps.push(snap(`The remaining routers (${g.nodes.filter((n) => !done.has(n)).join(", ")}) can't be reached: their distance is still ∞.`, null, [], { line: 2 })); break; }
    done.add(u);
    const relaxed = [];
    const nbs = neighbours(g, u).filter(({ node }) => !done.has(node)).sort((a, b) => (a.node < b.node ? -1 : 1));
    steps.push(snap(`Visit ${u}: it's the closest router not yet in N′ (distance ${dist[u]}), so no other route can beat it; ${u}'s distance is now final. ${nbs.length ? `Check its neighbours outside N′: ${nbs.map((x) => x.node).join(", ")}.` : "It has no neighbours left to check."}`, u, relaxed, { line: [3, 4] }));
    for (const { node: v, cost } of nbs) {
      const via = dist[u] + cost, better = via < dist[v];
      const was = dist[v];
      if (better) { dist[v] = via; prev[v] = u; relaxed.push(`${v}: ${fmtD(was)} → ${via}`); }
      steps.push(snap(better
        ? `Through ${u}, ${v} costs ${dist[u]} + ${cost} = ${via}, less than its current ${fmtD(was)}. Update D[${v}] = ${via} and remember ${u} as the way in.`
        : `Through ${u}, ${v} would cost ${dist[u]} + ${cost} = ${via}, which is no better than ${fmtD(was)}. Keep the old route.`,
      u, [...relaxed], { line: better ? [6, 7] : [5, 6], edge: [u, v], v: { v, "c(u,v)": cost, "D[u] + c": via } }));
    }
  }
  steps.push({ ...steps.at(-1), current: null, edge: null, line: 2, note: `Every reachable router is in N′, so the loop ends. Following prev back from each router gives the shortest-path tree and ${source}'s forwarding table.`, final: true });
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
  const rounds = [{ vectors: structuredClone(vectors), changes: [], note: "Round 0: each router only knows the cost of its own links; every other destination is ∞ until a neighbour tells it otherwise.", line: 1, vars: { round: 0, changes: 0, poison } }];
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
    rounds.push({ vectors: structuredClone(vectors), changes, note, line: changes.length ? [2, 3, 4, 5, ...(poison ? [6] : [])] : [3, 7], vars: { round: r, changes: changes.length, poison, ...(changes[0] ? { example: `D${changes[0].x}(${changes[0].y}) = ${fmtD(changes[0].to)}`, via: changes[0].via } : {}), ...(changedAt === r ? { "link changed": `${change.a}-${change.b} = ${change.cost}` } : {}) } });
    if (!changes.length) {
      if (convergedAt === null) { convergedAt = r; if (!change) break; continue; }
      if (changedAt !== null) break;
    }
  }
  const finalStable = rounds.at(-1).changes.length === 0;
  return { rounds, convergedAt, changedAt, finalStable, settledAt: finalStable ? rounds.length - 1 : null };
}

// Link-state flooding of one router's LSP. Every link takes one time unit
// whatever its cost; arrivals at the same moment are handled alphabetically
// (by receiver, then sender). A router forwards a new LSP on every link except
// the one it came in on, and silently drops copies it has already seen.
export function flood(g, origin) {
  if (!g.nodes.includes(origin)) throw new Error(`${origin} isn't in the network.`);
  const nb = (x) => neighbours(g, x).map((n) => n.node).sort();
  const stored = new Map([[origin, 0]]);
  let sends = nb(origin).map((to) => ({ from: origin, to }));
  let transmissions = sends.length, duplicates = 0;
  const steps = [{ t: 0, line: [1, 2], have: [origin], sending: sends, arriving: [], vars: { t: 0, stored: [origin], "in flight": sends.length, sent: transmissions, duplicates },
    note: `${origin} builds its link-state packet (LSP): its own links and their costs, with sequence number 1. It sends a copy on all ${sends.length} of its link${sends.length === 1 ? "" : "s"}.` }];
  for (let t = 1; sends.length && t < 50; t++) {
    const arriving = [...sends].sort((a, b) => (a.to === b.to ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : 1));
    const next = [], parts = [];
    for (const m of arriving) {
      if (stored.has(m.to)) { m.dup = true; duplicates++; parts.push(`${m.to} already has it, so the copy from ${m.from} is dropped`); continue; }
      stored.set(m.to, t);
      const out = nb(m.to).filter((x) => x !== m.from).map((to) => ({ from: m.to, to }));
      next.push(...out);
      parts.push(`${m.to} gets it first from ${m.from}, stores it and forwards it to ${out.length ? out.map((x) => x.to).join(", ") : "nobody (its only link leads back)"}`);
    }
    transmissions += next.length;
    sends = next;
    const anyDup = arriving.some((m) => m.dup), anyNew = arriving.some((m) => !m.dup);
    steps.push({ t, line: [3, ...(anyNew ? [4, 5] : []), ...(anyDup ? [6] : []), ...(next.length ? [] : [7])], have: [...stored.keys()], sending: next, arriving,
      vars: { t, stored: [...stored.keys()], "in flight": next.length, sent: transmissions, duplicates },
      note: `${parts.join("; ")}.${next.length ? "" : ` Nothing is left in flight: every router now has ${origin}'s LSP, after ${transmissions} transmissions (${duplicates} of them duplicates).`}` });
  }
  return { steps, transmissions, duplicates, reached: [...stored.keys()], arrivedAt: Object.fromEntries(stored) };
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
