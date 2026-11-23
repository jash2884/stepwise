// HNSW (Hierarchical Navigable Small World), following Malkov & Yashunin,
// on random 2D points so every hop can be drawn.
//
// Conventions:
// - Each new point gets a top layer l = ⌊−ln(U) · mL⌋ with U uniform in (0, 1]
//   and mL = 1 / ln(M), so each layer holds roughly 1/M of the one below.
// - Up to M links per point on upper layers and 2M on layer 0. When a point
//   has too many links, it keeps its closest ones (the paper's simple
//   selection; its neighbour-diversity heuristic is not used here).
// - Search: greedy (ef = 1) on every layer above 0, then a beam of width
//   efSearch on layer 0, returning the k closest found.
// - Every distance worked out counts once, including the entry point's.

import { seeded } from "./attention.js";

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function randomPoints(n, seed) {
  const r = seeded(seed);
  return Array.from({ length: n }, (_, id) => ({ id, x: Math.round(r() * 1000) / 10, y: Math.round(r() * 1000) / 10 }));
}

export const levelFor = (u, M) => Math.max(0, Math.floor(-Math.log(u) * (1 / Math.log(M))));

export const BUILD_CODE = [
  "l ← ⌊−ln(U) · mL⌋  // this point's top layer",
  "ep ← entry point; for each layer above l: ep ← greedy closest to q",
  "for each layer lc from min(l, top) down to 0",
  "  W ← search layer lc from ep, keeping efConstruction candidates",
  "  link q with its M closest in W, both ways",
  "  if a neighbour now has too many links, keep its closest",
  "if l > top then q becomes the entry point",
];

export const SEARCH_CODE = [
  "ep ← entry point (on the top layer)",
  "for each layer from the top down to 1",
  "  move to a neighbour while one is closer to q  // greedy",
  "on layer 0: beam search keeping the ef closest found",
  "  take the closest unexpanded candidate c",
  "  if c is further than the worst kept, stop",
  "  measure every unvisited neighbour of c; keep the ef best",
  "return the k closest kept",
];

export class HNSW {
  constructor({ M = 4, efConstruction = 16, seed = 1 } = {}) {
    this.M = M; this.M0 = 2 * M; this.efC = efConstruction;
    this.points = []; this.level = []; this.layers = []; this.entry = -1; this.top = -1;
    this.rand = seeded(seed * 7919 + 13);
    this.log = [];
  }

  links(lc, id) { return this.layers[lc]?.get(id) ?? []; }

  // Algorithm 2: best-first search on one layer. Records each expansion.
  searchLayer(q, eps, ef, lc, counter, trace) {
    const visited = new Set(eps);
    const d = (id) => { counter.n++; return dist(q, this.points[id]); };
    let C = eps.map((id) => ({ id, d: d(id) }));
    let W = C.slice();
    trace?.push({ kind: "start", layer: lc, W: W.map((w) => w.id), measured: eps.slice() });
    while (C.length) {
      C.sort((a, b) => a.d - b.d);
      const c = C.shift();
      W.sort((a, b) => a.d - b.d);
      const far = W.at(-1);
      if (c.d > far.d) { trace?.push({ kind: "stop", layer: lc, c: c.id, W: W.map((w) => w.id), measured: [] }); break; }
      const measured = [];
      for (const e of this.links(lc, c.id)) {
        if (visited.has(e)) continue;
        visited.add(e);
        const de = d(e);
        measured.push(e);
        W.sort((a, b) => a.d - b.d);
        if (W.length < ef || de < W.at(-1).d) {
          C.push({ id: e, d: de });
          W.push({ id: e, d: de });
          W.sort((a, b) => a.d - b.d);
          if (W.length > ef) W.pop();
        }
      }
      trace?.push({ kind: "expand", layer: lc, c: c.id, W: W.map((w) => w.id), measured });
    }
    return W.sort((a, b) => a.d - b.d);
  }

  insert(p) {
    const id = this.points.length;
    this.points.push({ ...p, id });
    const l = levelFor(1 - this.rand(), this.M);
    this.level.push(l);
    for (let lc = 0; lc <= l; lc++) { this.layers[lc] ??= new Map(); this.layers[lc].set(id, []); }
    const event = { id, l, links: [], counter: { n: 0 } };
    if (this.entry < 0) { this.entry = id; this.top = l; event.newEntry = true; this.log.push(event); return event; }
    let ep = [this.entry];
    for (let lc = this.top; lc > l; lc--) ep = [this.searchLayer(p, ep, 1, lc, event.counter)[0].id];
    for (let lc = Math.min(l, this.top); lc >= 0; lc--) {
      const W = this.searchLayer(p, ep, this.efC, lc, event.counter);
      const chosen = W.slice(0, this.M).map((w) => w.id);
      this.layers[lc].set(id, chosen.slice());
      const max = lc === 0 ? this.M0 : this.M;
      for (const e of chosen) {
        const list = this.layers[lc].get(e);
        list.push(id);
        if (list.length > max) {
          const kept = list.map((x) => ({ x, d: dist(this.points[e], this.points[x]) })).sort((a, b) => a.d - b.d || a.x - b.x).slice(0, max).map((o) => o.x);
          this.layers[lc].set(e, kept);
        }
      }
      event.links.push({ layer: lc, to: chosen });
      ep = W.map((w) => w.id);
    }
    if (l > this.top) { this.top = l; this.entry = id; event.newEntry = true; }
    this.log.push(event);
    return event;
  }

  search(q, k = 1, ef = 8, { trace = false } = {}) {
    const counter = { n: 0 };
    const t = trace ? [] : null;
    if (this.entry < 0) return { results: [], count: 0, trace: t };
    let ep = [this.entry];
    for (let lc = this.top; lc > 0; lc--) ep = [this.searchLayer(q, ep, 1, lc, counter, t)[0].id];
    const W = this.searchLayer(q, ep, Math.max(ef, k), 0, counter, t);
    return { results: W.slice(0, k).map((w) => w.id), dists: W.slice(0, k).map((w) => w.d), count: counter.n, trace: t };
  }
}

export function build(points, opts) {
  const index = new HNSW(opts);
  for (const p of points) index.insert(p);
  return index;
}

export function bruteForce(points, q, k = 1) {
  return points.map((p) => ({ id: p.id, d: dist(q, p) })).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, k).map((o) => o.id);
}

export const recallOf = (found, truth) => truth.filter((t) => found.includes(t)).length / truth.length;

// Average recall@k and distance counts over random queries.
export function evaluate(index, { queries = 50, k = 5, ef = 8, seed = 99 } = {}) {
  const r = seeded(seed);
  let recall = 0, count = 0;
  for (let i = 0; i < queries; i++) {
    const q = { x: r() * 100, y: r() * 100 };
    const res = index.search(q, k, ef);
    recall += recallOf(res.results, bruteForce(index.points, q, k));
    count += res.count;
  }
  return { recall: recall / queries, distances: count / queries, brute: index.points.length };
}
