// Graph theory on small simple undirected graphs: Havel-Hakimi for degree
// sequences, Euler trails (Hierholzer), Hamiltonian cycles by backtracking,
// the bipartite check, chromatic number by backtracking, maximum matching,
// Euler's formula for planar graphs, and spanning trees by Kirchhoff's
// matrix-tree theorem (an exact determinant with BigInt).
//
// Graphs come from engines/graph.js (parseGraph / build): { nodes, edges, both }.

import { build, byName } from "./graph.js";

export const degrees = (g) => Object.fromEntries(g.nodes.map((v) => [v, g.both[v].length]));
const adj = (g) => Object.fromEntries(g.nodes.map((v) => [v, new Set(g.both[v].map((x) => x.v))]));
export const edgeId = (g, a, b) => g.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))?.id;

export function components(g, nodes = g.nodes) {
  const seen = new Set(), out = [];
  for (const s of nodes) {
    if (seen.has(s)) continue;
    const comp = [s]; seen.add(s);
    for (let i = 0; i < comp.length; i++) for (const { v } of g.both[comp[i]]) if (!seen.has(v)) { seen.add(v); comp.push(v); }
    out.push(comp);
  }
  return out;
}

// --- Havel-Hakimi ------------------------------------------------------------------
export function parseSequence(text) {
  const xs = (String(text).match(/-?\d+/g) ?? []).map(Number);
  if (!xs.length) throw new Error("Type a degree sequence, like 3 3 2 2 2.");
  if (xs.length > 12) throw new Error("Use at most 12 degrees.");
  if (xs.some((x) => x < 0)) throw new Error("Degrees can't be negative.");
  return xs;
}

export const HH_CODE = [
  "if the sum of degrees is odd then return not graphic  // handshake lemma",
  "repeat",
  "  sort the sequence in non-increasing order",
  "  if every entry is 0 then return graphic",
  "  d ← remove the first entry",
  "  if fewer than d entries remain then return not graphic",
  "  subtract 1 from each of the next d entries",
  "  if any entry is negative then return not graphic",
];

// Each entry keeps the vertex it belongs to, so the steps also build a graph
// that has exactly this degree sequence.
export function havelHakimi(seq) {
  const names = seq.map((_, i) => `v${i + 1}`);
  let list = seq.map((d, i) => ({ v: names[i], d }));
  const edges = [], steps = [];
  const view = () => list.map((x) => x.d);
  const sum = seq.reduce((a, b) => a + b, 0);
  if (sum % 2) {
    steps.push({ seq: view(), line: 1, tone: "bad", vars: { sum }, note: `The degrees add up to ${sum}, an odd number. Every edge adds 2 to the sum, so no graph has this sequence.` });
    return { graphic: false, reason: "odd sum", steps, edges: [], names };
  }
  steps.push({ seq: view(), line: 1, vars: { sum, n: seq.length }, note: `The sum is ${sum}, even, so it could be graphic (it would have ${sum / 2} edges).` });
  if (seq.some((d) => d > seq.length - 1)) {
    const bad = seq.find((d) => d > seq.length - 1);
    steps.push({ seq: view(), line: 6, tone: "bad", vars: { d: bad, n: seq.length }, note: `A vertex of degree ${bad} needs ${bad} distinct neighbours, but there are only ${seq.length - 1} other vertices. Not graphic.` });
    return { graphic: false, reason: "degree too big", steps, edges: [], names };
  }
  for (let round = 0; round < 50; round++) {
    list = [...list].sort((a, b) => b.d - a.d || byName(a.v, b.v));
    if (list.every((x) => x.d === 0)) {
      steps.push({ seq: view(), line: 4, tone: "good", vars: { left: list.length }, note: "Everything left is 0, so the sequence is graphic. The edges added along the way form one graph with exactly these degrees." });
      return { graphic: true, steps, edges, names };
    }
    steps.push({ seq: view(), line: 3, vars: { sequence: view() }, note: `Sort: ${view().join(", ")}.` });
    const [first, ...rest] = list;
    const d = first.d;
    if (rest.length < d) {
      steps.push({ seq: view(), line: 6, tone: "bad", vars: { d, left: rest.length }, note: `Remove ${d}, but only ${rest.length} entries remain to connect to. Not graphic.` });
      return { graphic: false, reason: "too few", steps, edges, names };
    }
    const hit = rest.slice(0, d);
    for (const x of hit) { x.d -= 1; edges.push([first.v, x.v]); }
    list = rest;
    const neg = list.find((x) => x.d < 0);
    steps.push({ seq: view(), removed: d, hit: d, line: [5, 7], tone: neg ? "bad" : null, vars: { d, sequence: view() },
      note: `Remove ${d} (vertex ${first.v}) and subtract 1 from the next ${d} entries: join ${first.v} to ${hit.map((x) => x.v).join(", ") || "nothing"}. Left: ${view().join(", ") || "nothing"}.${neg ? " An entry went negative, so not graphic." : ""}` });
    if (neg) return { graphic: false, reason: "negative", steps, edges, names };
  }
  return { graphic: false, steps, edges, names };
}

// Erdős-Gallai, as an independent check (tests use it).
export function erdosGallai(seq) {
  const d = [...seq].sort((a, b) => b - a), n = d.length;
  if (d.reduce((a, b) => a + b, 0) % 2) return false;
  for (let k = 1; k <= n; k++) {
    const left = d.slice(0, k).reduce((a, b) => a + b, 0);
    const right = k * (k - 1) + d.slice(k).reduce((a, b) => a + Math.min(b, k), 0);
    if (left > right) return false;
  }
  return true;
}

// --- Euler trails -------------------------------------------------------------------
export const EULER_CODE = [
  "odd ← vertices of odd degree",
  "if the edges aren't all in one component then return neither",
  "if |odd| = 0 then circuit, start anywhere; if |odd| = 2 then trail, start at an odd vertex; else neither",
  "stack ← [start]; trail ← []",
  "while stack is not empty",
  "  u ← top of stack",
  "  if u has an unused edge u-w then mark it used; push w",
  "  else pop u and put it at the front of trail  // stuck: u is finished",
];

export function euler(g) {
  const deg = degrees(g), odd = g.nodes.filter((v) => deg[v] % 2);
  const withEdges = g.nodes.filter((v) => deg[v] > 0);
  const comps = components(g, withEdges);
  const steps = [];
  const base = { used: [], stack: [], trail: [], odd };
  steps.push({ ...base, line: 1, vars: { odd: odd.length ? odd : "none" }, note: `Odd-degree vertices: ${odd.length ? odd.join(", ") : "none"}. ${odd.length === 0 ? "All degrees are even." : odd.length === 2 ? "Exactly two are odd." : `There are ${odd.length}.`}` });
  if (!g.edges.length) { steps.push({ ...base, line: 2, tone: "bad", note: "There are no edges to walk." }); return { kind: "none", odd, steps, trail: [] }; }
  if (comps.length > 1) {
    steps.push({ ...base, line: 2, tone: "bad", vars: { components: comps.length }, note: `The edges sit in ${comps.length} separate pieces, so one walk can't cover them all: no Euler trail or circuit.` });
    return { kind: "none", odd, steps, trail: [], reason: "disconnected" };
  }
  if (odd.length !== 0 && odd.length !== 2) {
    steps.push({ ...base, line: 3, tone: "bad", vars: { odd: odd.length }, note: `${odd.length} odd vertices. A walk passes through a vertex using 2 edges at a time, so only its two ends can be odd: no Euler trail or circuit.` });
    return { kind: "none", odd, steps, trail: [], reason: "odd" };
  }
  const kind = odd.length ? "trail" : "circuit";
  const start = odd.length ? odd[0] : withEdges[0];
  steps.push({ ...base, stack: [start], line: 3, vars: { kind, start }, note: odd.length ? `Two odd vertices: an Euler trail exists, running from ${odd[0]} to ${odd[1]}. Start at ${start}.` : `Every degree is even and the edges are connected: an Euler circuit exists. Start at ${start}.` });
  // Hierholzer.
  const used = new Set(), stack = [start], trail = [];
  const edgesOf = (u) => g.both[u].filter((x) => !used.has(x.id));
  while (stack.length) {
    const u = stack[stack.length - 1];
    const next = edgesOf(u)[0];
    if (next) {
      used.add(next.id); stack.push(next.v);
      steps.push({ used: [...used], stack: [...stack], trail: [...trail], odd, active: { from: u, to: next.v, id: next.id }, current: next.v, line: [6, 7], vars: { u, w: next.v, stack: [...stack], used: used.size },
        note: `From ${u}, take the unused edge ${u}-${next.v}.` });
    } else {
      stack.pop(); trail.unshift(u);
      steps.push({ used: [...used], stack: [...stack], trail: [...trail], odd, current: u, line: [6, 8], vars: { u, stack: [...stack], trail: [...trail] },
        note: `${u} has no unused edges left: pop it onto the front of the trail.${stack.length ? " Back up and look for a detour." : ""}` });
    }
  }
  steps[steps.length - 1].tone = "good";
  steps[steps.length - 1].note += ` Euler ${kind}: ${trail.join(" → ")} (${g.edges.length} edges, each once).`;
  return { kind, odd, steps, trail, start };
}

// --- Hamiltonian cycles -------------------------------------------------------------
export const HAM_CODE = [
  "path ← [first vertex]",
  "extend(path):",
  "  if path has every vertex: return true if the last is adjacent to the first",
  "  for each neighbour w of the last vertex, not on the path",
  "    push w; if extend(path) then return true",
  "    pop w  // dead end: backtrack",
  "  return false",
];

export function hamilton(g, { maxSteps = 400 } = {}) {
  const A = adj(g), n = g.nodes.length, steps = [];
  const deg = degrees(g);
  const minDeg = Math.min(...g.nodes.map((v) => deg[v]));
  const dirac = n >= 3 && minDeg >= n / 2;
  let ore = n >= 3;
  for (const u of g.nodes) for (const v of g.nodes) if (u < v && !A[u].has(v) && deg[u] + deg[v] < n) ore = false;
  let found = null, tries = 0;
  const path = [g.nodes[0]], on = new Set(path);
  const rec = () => {
    if (path.length === n) {
      const closes = n > 2 && A[path[n - 1]].has(path[0]);
      if (steps.length < maxSteps) steps.push({ path: [...path], line: 3, tone: closes ? "good" : null, vars: { path: [...path], closes }, note: closes ? `Every vertex is on the path and ${path[n - 1]}-${path[0]} closes it: Hamiltonian cycle ${[...path, path[0]].join(" → ")}.` : `Every vertex is on the path, but ${path[n - 1]} isn't adjacent to ${path[0]}, so it doesn't close. Backtrack.` });
      if (closes) { found = [...path]; return true; }
      return false;
    }
    const last = path[path.length - 1];
    for (const w of [...A[last]].sort(byName)) {
      if (on.has(w)) continue;
      tries++;
      path.push(w); on.add(w);
      if (steps.length < maxSteps) steps.push({ path: [...path], line: [4, 5], vars: { path: [...path], tries }, note: `Extend from ${last} to ${w}.` });
      if (rec()) return true;
      path.pop(); on.delete(w);
      if (steps.length < maxSteps) steps.push({ path: [...path], dead: w, line: 6, vars: { path: [...path], tries }, note: `${w} led nowhere: take it off the path.` });
    }
    return false;
  };
  steps.push({ path: [...path], line: 1, vars: { n, "min degree": minDeg, dirac, ore }, note: `Search for a cycle through all ${n} vertices, starting at ${path[0]}. ${dirac ? `Dirac's theorem already promises one: every degree is at least n/2 = ${n / 2}.` : ore ? "Ore's theorem already promises one: every non-adjacent pair has degrees summing to at least n." : "Neither Dirac's nor Ore's condition holds, so search."}` });
  if (n >= 3) rec();
  if (!found) steps.push({ path: [], line: 7, tone: "bad", vars: { tries }, note: n < 3 ? "A Hamiltonian cycle needs at least 3 vertices." : `Every extension was tried (${tries} moves): there is no Hamiltonian cycle.` });
  return { cycle: found, dirac, ore, steps, truncated: steps.length >= maxSteps };
}

// --- Bipartite ----------------------------------------------------------------------
export const BIP_CODE = [
  "for each uncoloured vertex s: colour s with side 0; queue ← [s]",
  "  while queue is not empty: u ← pop front",
  "    for each neighbour w of u",
  "      if w is uncoloured then colour w with the other side; push w",
  "      else if w has u's side then return not bipartite  // odd cycle",
  "return bipartite, with the two sides",
];

export function bipartite(g) {
  const side = {}, parent = {}, steps = [];
  let conflict = null;
  for (const s of g.nodes) {
    if (side[s] != null || conflict) continue;
    side[s] = 0;
    const queue = [s];
    steps.push({ side: { ...side }, queue: [...queue], current: s, line: 1, vars: { s, queue: [...queue] }, note: `${s} has no side yet: put it on side 0.` });
    while (queue.length && !conflict) {
      const u = queue.shift();
      for (const { v: w, id } of g.both[u]) {
        if (side[w] == null) {
          side[w] = 1 - side[u]; parent[w] = u; queue.push(w);
          steps.push({ side: { ...side }, queue: [...queue], current: w, active: { from: u, to: w, id }, line: 4, vars: { u, w, side: side[w], queue: [...queue] }, note: `${w} is next to ${u}, so it goes on the other side, ${side[w]}.` });
        } else if (side[w] === side[u]) {
          // Odd cycle: the two tree paths up to their meeting point plus u-w.
          const up = (x) => { const p = [x]; while (parent[p[p.length - 1]] != null) p.push(parent[p[p.length - 1]]); return p; };
          const pu = up(u), pw = up(w), meet = pu.find((x) => pw.includes(x));
          const cycle = [...pu.slice(0, pu.indexOf(meet) + 1), ...pw.slice(0, pw.indexOf(meet)).reverse()];
          conflict = { u, w, cycle };
          steps.push({ side: { ...side }, queue: [...queue], current: w, active: { from: u, to: w, id }, cycle, line: 5, tone: "bad", vars: { u, w }, note: `${u} and ${w} are adjacent and both on side ${side[u]}. The odd cycle ${[...cycle, cycle[0]].join(" - ")} has ${cycle.length} edges, so the graph isn't bipartite.` });
          break;
        }
      }
    }
  }
  if (!conflict) {
    const L = g.nodes.filter((v) => side[v] === 0), R = g.nodes.filter((v) => side[v] === 1);
    steps.push({ side: { ...side }, queue: [], line: 6, tone: "good", vars: { "side 0": L, "side 1": R }, note: `Every edge joins the two sides: bipartite, with sides {${L.join(", ")}} and {${R.join(", ")}}. (Equivalently, it has no odd cycle.)` });
  }
  return { bipartite: !conflict, side, conflict, steps };
}

// --- Colouring ---------------------------------------------------------------------
export const COLOUR_CODE = [
  "order ← vertices by degree, highest first",
  "for k ← 1, 2, …",
  "  try(i): if i = n then return true",
  "    for c ← 1 to k",
  "      if no neighbour of order[i] has colour c then colour it c; if try(i + 1) return true",
  "    uncolour order[i]; return false  // backtrack",
  "  if try(0) then χ(G) ← k; stop",
];

// Largest clique, a lower bound for χ (fine for ≤ 10 vertices).
export function cliqueNumber(g) {
  const A = adj(g), V = g.nodes;
  let best = [];
  const rec = (clique, cand) => {
    if (clique.length > best.length) best = [...clique];
    cand.forEach((v, i) => rec([...clique, v], cand.slice(i + 1).filter((w) => A[v].has(w))));
  };
  rec([], V);
  return best;
}

export function chromatic(g, { maxSteps = 500 } = {}) {
  const A = adj(g), deg = degrees(g);
  const order = [...g.nodes].sort((a, b) => deg[b] - deg[a] || byName(a, b));
  const clique = cliqueNumber(g);
  const steps = [];
  steps.push({ colour: {}, line: 1, vars: { order, "clique size": clique.length }, note: `Colour in order of degree: ${order.join(", ")}. The largest clique, {${clique.join(", ")}}, needs ${clique.length} different colours, so χ ≥ ${clique.length}.` });
  if (!g.nodes.length) return { chi: 0, colouring: {}, steps, clique };
  let result = null;
  const start = Math.max(1, clique.length);
  for (let k = start; k <= g.nodes.length && !result; k++) {
    const colour = {};
    steps.push({ colour: {}, k, line: 2, vars: { k }, note: `Try with ${k} colour${k === 1 ? "" : "s"}.` });
    const tryAt = (i) => {
      if (i === order.length) return true;
      const v = order[i];
      for (let c = 1; c <= k; c++) {
        const clash = [...A[v]].find((w) => colour[w] === c);
        if (clash) {
          if (steps.length < maxSteps) steps.push({ colour: { ...colour }, k, current: v, line: 5, vars: { k, v, c, clash }, note: `${v} can't take colour ${c}: its neighbour ${clash} has it.` });
          continue;
        }
        colour[v] = c;
        if (steps.length < maxSteps) steps.push({ colour: { ...colour }, k, current: v, line: 5, vars: { k, v, c }, note: `Give ${v} colour ${c}.` });
        if (tryAt(i + 1)) return true;
        delete colour[v];
      }
      if (steps.length < maxSteps) steps.push({ colour: { ...colour }, k, current: v, line: 6, tone: "bad", vars: { k, v }, note: `No colour from 1 to ${k} works for ${v} here: backtrack.` });
      return false;
    };
    if (tryAt(0)) result = { chi: k, colouring: { ...colour } };
    else steps.push({ colour: {}, k, line: 2, tone: "bad", vars: { k }, note: `${k} colour${k === 1 ? " isn't" : "s aren't"} enough: every attempt got stuck.` });
  }
  steps.push({ colour: result.colouring, k: result.chi, line: 7, tone: "good", vars: { "χ(G)": result.chi }, note: `A proper colouring with ${result.chi} colour${result.chi === 1 ? "" : "s"} exists${result.chi > start ? `, and ${result.chi - 1} failed` : result.chi === clique.length && clique.length > 1 ? `, matching the clique bound` : ""}: χ(G) = ${result.chi}.` });
  return { ...result, steps, clique, order, truncated: steps.length >= maxSteps };
}

// --- Matching -----------------------------------------------------------------------
export const MATCH_CODE = [
  "M ← ∅",
  "repeat",
  "  look for an augmenting path: free vertex → unmatched edge → matched edge → … → free vertex",
  "  if found then flip it: its unmatched edges join M, its matched edges leave",
  "until no augmenting path exists  // Berge: M is then maximum",
];

// Augmenting paths by DFS over alternating paths (exact for bipartite graphs;
// for others the result is checked against an exhaustive search).
export function matching(g) {
  const mate = {}, steps = [];
  const free = (v) => mate[v] == null;
  steps.push({ mate: {}, line: 1, vars: { "|M|": 0 }, note: "Start with no edges matched." });
  const findPath = (s) => {
    // BFS over alternating paths with parity, simple (no blossom shrinking).
    const prev = new Map([[`${s}|0`, null]]), queue = [[s, 0]];
    while (queue.length) {
      const [u, par] = queue.shift();
      for (const { v } of g.both[u]) {
        if (par === 0 ? mate[u] === v : mate[u] !== v) continue;
        const key = `${v}|${1 - par}`;
        if (prev.has(key) || v === s) continue;
        // keep the path simple
        const pathTo = (k) => { const p = []; for (let x = k; x; x = prev.get(x)) p.unshift(x.split("|")[0]); return p; };
        if (pathTo(`${u}|${par}`).includes(v)) continue;
        prev.set(key, `${u}|${par}`);
        if (par === 0 && free(v)) return pathTo(key);
        queue.push([v, 1 - par]);
      }
    }
    return null;
  };
  for (let round = 0; round < g.nodes.length; round++) {
    let path = null;
    for (const s of g.nodes) if (free(s)) { path = findPath(s); if (path) break; }
    if (!path) break;
    const flipIn = [], flipOut = [];
    for (let i = 0; i + 1 < path.length; i++) (i % 2 === 0 ? flipIn : flipOut).push([path[i], path[i + 1]]);
    for (const [a, b] of flipOut) { delete mate[a]; delete mate[b]; }
    for (const [a, b] of flipIn) { mate[a] = b; mate[b] = a; }
    steps.push({ mate: { ...mate }, path, line: [3, 4], vars: { path, "|M|": Object.keys(mate).length / 2 }, note: `Augmenting path ${path.join(" - ")}: it starts and ends at unmatched vertices. Flip it: ${flipIn.map((e) => e.join("-")).join(", ")} in${flipOut.length ? `, ${flipOut.map((e) => e.join("-")).join(", ")} out` : ""}. The matching grows to ${Object.keys(mate).length / 2}.` });
  }
  let size = Object.keys(mate).length / 2;
  const best = maxMatchingBrute(g);
  if (best.size > size) {
    // Odd cycles can hide an augmenting path from the simple search: use the exhaustive answer.
    for (const k of Object.keys(mate)) delete mate[k];
    for (const [a, b] of best.edges) { mate[a] = b; mate[b] = a; }
    size = best.size;
    steps.push({ mate: { ...mate }, line: 5, vars: { "|M|": size }, note: `An odd cycle (a blossom) hid an augmenting path from the simple search, so an exhaustive search over this small graph gives the maximum: ${size}.` });
  }
  const perfect = size * 2 === g.nodes.length;
  steps.push({ mate: { ...mate }, line: 5, tone: "good", vars: { "|M|": size, perfect }, note: `No augmenting path is left, so by Berge's theorem the matching is maximum: ν(G) = ${size}.${perfect ? " Every vertex is matched: a perfect matching." : ` ${g.nodes.length - 2 * size} vertex${g.nodes.length - 2 * size === 1 ? " is" : "es are"} left unmatched.`}` });
  return { size, mate, perfect, steps };
}

export function maxMatchingBrute(g) {
  let best = { size: 0, edges: [] };
  const E = g.edges;
  const rec = (i, used, chosen) => {
    if (chosen.length > best.size) best = { size: chosen.length, edges: [...chosen] };
    if (chosen.length + (E.length - i) <= best.size) return;
    for (let k = i; k < E.length; k++) {
      const e = E[k];
      if (used.has(e.from) || used.has(e.to)) continue;
      used.add(e.from); used.add(e.to); chosen.push([e.from, e.to]);
      rec(k + 1, used, chosen);
      chosen.pop(); used.delete(e.from); used.delete(e.to);
    }
  };
  rec(0, new Set(), []);
  return best;
}

// --- Planarity counts ---------------------------------------------------------------
export function planarCounts(g) {
  const v = g.nodes.length, e = g.edges.length, c = components(g).length;
  const gi = girth(g), triangleFree = gi !== 3;
  const faces = e - v + c + 1;
  const bound = v >= 3 ? 3 * v - 6 : null, bound2 = v >= 3 ? 2 * v - 4 : null;
  // Every face has at least g edges and each edge borders 2 faces: g·f ≤ 2e,
  // so with Euler's formula e ≤ g(v − 2)/(g − 2) (connected, with a cycle).
  const boundG = gi !== Infinity && v >= 3 ? Math.floor((gi * (v - 2)) / (gi - 2)) : null;
  const violates = (bound != null && e > bound) || (boundG != null && c === 1 && e > boundG);
  return { v, e, c, faces, girth: gi, triangleFree, bound, bound2, boundG, violates };
}
// Length of the shortest cycle (Infinity for a forest), by BFS from every vertex.
export function girth(g) {
  let best = Infinity;
  for (const s of g.nodes) {
    const dist = { [s]: 0 }, par = { [s]: null }, queue = [s];
    while (queue.length) {
      const u = queue.shift();
      for (const { v } of g.both[u]) {
        if (dist[v] == null) { dist[v] = dist[u] + 1; par[v] = u; queue.push(v); }
        else if (par[u] !== v) best = Math.min(best, dist[u] + dist[v] + 1);
      }
    }
  }
  return best;
}

// --- Kirchhoff ----------------------------------------------------------------------
export const KIRCHHOFF_CODE = [
  "L ← D − A  // degree on the diagonal, −1 for each edge",
  "delete any one row and the same column  // a cofactor",
  "eliminate below the diagonal (fraction-free Bareiss)",
  "τ(G) ← the determinant = the last pivot",
];

export function laplacian(g) {
  const idx = new Map(g.nodes.map((v, i) => [v, i])), n = g.nodes.length;
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (const e of g.edges) { const a = idx.get(e.from), b = idx.get(e.to); L[a][a]++; L[b][b]++; L[a][b]--; L[b][a]--; }
  return L;
}

// Bareiss elimination keeps every entry an integer; the last pivot is the determinant.
export function bareiss(M0) {
  const n = M0.length, M = M0.map((r) => r.map((x) => BigInt(x))), snaps = [];
  let sign = 1n, prev = 1n;
  if (!n) return { det: 1n, snaps };
  for (let k = 0; k < n - 1; k++) {
    if (M[k][k] === 0n) {
      const p = M.findIndex((r, i) => i > k && r[k] !== 0n);
      if (p < 0) return { det: 0n, snaps: [...snaps, { k, M: M.map((r) => [...r]), zero: true }] };
      [M[k], M[p]] = [M[p], M[k]]; sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prev;
      M[i][k] = 0n;
    }
    prev = M[k][k];
    snaps.push({ k, M: M.map((r) => [...r]) });
  }
  return { det: sign * M[n - 1][n - 1], snaps };
}

export function spanningTrees(g) {
  const L = laplacian(g), n = g.nodes.length, steps = [];
  steps.push({ M: L, line: 1, vars: { n }, note: "Build the Laplacian L = D − A: each vertex's degree on the diagonal, −1 where two vertices are joined. Every row sums to 0." });
  if (n === 1) { steps.push({ M: [], line: 4, tone: "good", vars: { "τ(G)": 1 }, note: "One vertex: exactly one spanning tree (itself)." }); return { count: 1n, steps, L }; }
  const minor = L.slice(1).map((r) => r.slice(1));
  steps.push({ M: minor, line: 2, vars: { removed: g.nodes[0] }, note: `Delete ${g.nodes[0]}'s row and column. Kirchhoff's theorem: the determinant of what's left counts the spanning trees (any row works).` });
  const { det, snaps } = bareiss(minor);
  for (const s of snaps) steps.push({ M: s.M.map((r) => r.map(Number)), pivot: s.k, line: 3, vars: { pivot: Number(s.M[s.k][s.k]) }, note: s.zero ? "A whole column is 0 below the diagonal: the determinant is 0, so the graph is disconnected." : `Eliminate below pivot ${s.k + 1} (Bareiss keeps every entry a whole number).` });
  const count = det < 0n ? -det : det;
  const complete = g.edges.length === (n * (n - 1)) / 2;
  steps.push({ M: snaps.length ? snaps[snaps.length - 1].M.map((r) => r.map(Number)) : minor, line: 4, tone: count ? "good" : "bad", vars: { "τ(G)": count },
    note: count ? `The determinant is ${count}: the graph has ${count} spanning tree${count === 1n ? "" : "s"}.${complete ? ` It's K${n}, and Cayley's formula n^(n−2) = ${n}^${n - 2} = ${BigInt(n) ** BigInt(Math.max(0, n - 2))} agrees.` : ""}` : "The determinant is 0: the graph is disconnected, so it has no spanning tree." });
  return { count, steps, L };
}

// Brute force: count edge subsets of size n − 1 that form a tree (tests).
export function spanningTreesBrute(g) {
  const n = g.nodes.length, E = g.edges;
  let count = 0;
  const rec = (i, chosen) => {
    if (chosen.length === n - 1) { if (components(build(g.nodes, chosen, false)).length === 1) count++; return; }
    if (i >= E.length || E.length - i < n - 1 - chosen.length) return;
    rec(i + 1, [...chosen, E[i]]); rec(i + 1, chosen);
  };
  rec(0, []);
  return count;
}

// Complete, cycle, wheel, complete bipartite, Petersen: named graphs as edge text.
export function named(kind, n = 5, m = 3) {
  const v = (i) => String.fromCharCode(65 + i);
  const lines = [];
  if (kind === "K") for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) lines.push(`${v(i)} ${v(j)}`);
  if (kind === "C") for (let i = 0; i < n; i++) lines.push(`${v(i)} ${v((i + 1) % n)}`);
  if (kind === "W") { for (let i = 1; i < n; i++) { lines.push(`${v(0)} ${v(i)}`); lines.push(`${v(i)} ${v(i === n - 1 ? 1 : i + 1)}`); } }
  if (kind === "Kmn") for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) lines.push(`${v(i)} ${v(n + j)}`);
  if (kind === "Q3") for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) { const j = i ^ (1 << b); if (i < j) lines.push(`${v(i)} ${v(j)}`); }
  if (kind === "petersen") {
    for (let i = 0; i < 5; i++) { lines.push(`${v(i)} ${v((i + 1) % 5)}`); lines.push(`${v(i)} ${v(i + 5)}`); lines.push(`${v(5 + i)} ${v(5 + ((i + 2) % 5))}`); }
  }
  return lines.join("\n");
}

export function randomSimpleGraph(r, n = 5 + Math.floor(r() * 2), p = 0.45) {
  const v = (i) => String.fromCharCode(65 + i), lines = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < p) lines.push(`${v(i)} ${v(j)}`);
  // keep every vertex present
  for (let i = 0; i < n; i++) if (!lines.some((l) => l.split(" ").includes(v(i)))) lines.push(`${v(i)} ${v((i + 1) % n)}`);
  return [...new Set(lines.map((l) => l.split(" ").sort().join(" ")))].join("\n");
}

export const EXAMPLES = {
  house: { name: "House (Euler trail)", text: "A B\nB C\nC D\nD A\nA E\nB E" },
  k4: { name: "K4", text: named("K", 4) },
  k5: { name: "K5 (not planar)", text: named("K", 5) },
  k33: { name: "K3,3 (bipartite, not planar)", text: named("Kmn", 3, 3) },
  c5: { name: "C5 (odd cycle)", text: named("C", 5) },
  w6: { name: "Wheel W6", text: named("W", 6) },
  q3: { name: "Cube Q3", text: named("Q3") },
  petersen: { name: "Petersen graph", text: named("petersen") },
  konig: { name: "Königsberg-like (4 odd vertices)", text: "A B\nA C\nA D\nB D\nC D\nB E\nC E" },
};
export const SEQ_EXAMPLES = { yes: "3 3 2 2 2", no: "4 4 4 1 1", odd: "3 3 3 2 2", star: "4 1 1 1 1", reg: "3 3 3 3 3 3" };
