// Disjoint sets (union-find) as a parent array, recorded step by step. Union
// can be naive, by rank or by size; find can compress paths. Every pointer
// hop is counted so the strategies can be compared on the same operations.

export const MODES = {
  naive: { name: "Naive union", union: ["  parent[ra] ← rb  // always hang a's tree under b's root"] },
  rank: {
    name: "Union by rank",
    union: [
      "  if rank[ra] < rank[rb] then swap ra, rb  // ra is now the taller",
      "  parent[rb] ← ra",
      "  if rank[ra] = rank[rb] then rank[ra] ← rank[ra] + 1",
    ],
  },
  size: {
    name: "Union by size",
    union: [
      "  if size[ra] < size[rb] then swap ra, rb  // ra is now the bigger",
      "  parent[rb] ← ra",
      "  size[ra] ← size[ra] + size[rb]",
    ],
  },
};

export function code(mode) {
  return [
    "find(x):",
    "  r ← x",
    "  while parent[r] ≠ r: r ← parent[r]  // climb to the root",
    "  while parent[x] ≠ r  // path compression (if on)",
    "    next ← parent[x]; parent[x] ← r; x ← next",
    "  return r",
    "union(a, b):",
    "  ra ← find(a); rb ← find(b)",
    "  if ra = rb then return  // already in the same set",
    ...MODES[mode].union,
  ];
}

export const OPS = [
  { id: "naive", name: "Naive union, no compression", avg: "O(n) per find", worst: "O(n) per find", why: "Unions can build a chain n long." },
  { id: "rank", name: "By rank or size", avg: "O(log n)", worst: "O(log n)", why: "A tree only gets taller when two equal ones join, so height ≤ log₂ n." },
  { id: "pc", name: "Path compression alone", avg: "≈ O(log n) amortised", worst: "O(n) for one find", why: "Long paths are flattened the first time they're walked." },
  { id: "both", name: "Rank/size + compression", avg: "O(α(n)) amortised", worst: "O(log n) for one find", why: "α is the inverse Ackermann function: at most 4 for any real n." },
];

export class DSU {
  constructor(n, { mode = "rank", compress = true } = {}) {
    this.n = n; this.mode = mode; this.compress = compress;
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
    this.size = Array(n).fill(1);
    this.hops = 0; this.steps = []; this.record = true;
  }
  snap(line, note, extra = {}) {
    if (!this.record) return;
    this.steps.push({ parent: [...this.parent], rank: [...this.rank], size: [...this.size], line, note, lit: {}, hops: this.hops, ...extra });
  }
  root(x) { while (this.parent[x] !== x) x = this.parent[x]; return x; }
  sets() {
    const g = new Map();
    for (let i = 0; i < this.n; i++) { const r = this.root(i); g.set(r, [...(g.get(r) ?? []), i]); }
    return [...g.values()];
  }
  height() {
    let best = 0;
    for (let i = 0; i < this.n; i++) { let d = 0, x = i; while (this.parent[x] !== x) { x = this.parent[x]; d++; } best = Math.max(best, d); }
    return best;
  }

  find(x, base = 0) {
    const start = x;
    const path = [x];
    const lp = (cls = "path") => Object.fromEntries(path.map((v) => [v, cls]));
    this.snap(base + 2, `find(${x}): follow parent pointers up from ${x} until a node points to itself.`, { lit: { [x]: "cur" }, vars: { x, r: x, hops: this.hops } });
    let r = x;
    while (this.parent[r] !== r) {
      r = this.parent[r]; this.hops++; path.push(r);
      this.snap(base + 3, `parent[${path.at(-2)}] = ${r}: climb to ${r}.`, { lit: { ...lp(), [r]: "cur" }, vars: { x: start, r, hops: this.hops }, arrow: [path.at(-2), r] });
    }
    this.snap(base + 3, `parent[${r}] = ${r}, so ${r} is the root: the set's representative.${path.length > 2 ? ` The path from ${start} had ${path.length - 1} hops.` : ""}`, { lit: { ...lp(), [r]: "found" }, vars: { x: start, r, hops: this.hops } });
    if (this.compress && path.length > 2) {
      this.snap(base + 4, `Path compression: point every node on that path straight at ${r}, so the next find from any of them takes one hop.`, { lit: { ...lp(), [r]: "found" }, vars: { x: start, r } });
      for (const v of path.slice(0, -2)) {
        const old = this.parent[v];
        this.parent[v] = r;
        this.snap(base + 5, `parent[${v}] ← ${r} (it was ${old}). ${v} and everything below it move up next to the root.`, { lit: { ...lp(), [r]: "found", [v]: "new" }, changed: [v], vars: { x: v, next: old, r } });
      }
    }
    this.snap(base + 6, `find(${start}) = ${r}.`, { lit: { [r]: "found", [start]: "cur" }, vars: { x: start, r, hops: this.hops } });
    return r;
  }

  union(a, b) {
    this.snap(8, `union(${a}, ${b}): find both roots, then link one under the other.`, { lit: { [a]: "cur", [b]: "cur" }, vars: { a, b } });
    let ra = this.find(a), rb = this.find(b);
    this.snap(8, `ra = find(${a}) = ${ra}, rb = find(${b}) = ${rb}.`, { lit: { [ra]: "found", [rb]: "found" }, vars: { a, b, ra, rb } });
    if (ra === rb) { this.snap(9, `Same root: ${a} and ${b} are already in the same set, so nothing changes.`, { lit: { [ra]: "found" }, vars: { a, b, ra, rb }, bad: true }); return false; }
    if (this.mode === "naive") {
      this.parent[ra] = rb;
      this.snap(10, `Naive union: parent[${ra}] ← ${rb}, whatever the trees look like. This can make a tall, thin tree.`, { lit: { [ra]: "new", [rb]: "found" }, changed: [ra], vars: { a, b, ra, rb } });
      return true;
    }
    const w = this.mode === "rank" ? this.rank : this.size, word = this.mode;
    const flip = w[ra] < w[rb];
    this.snap(10, flip ? `${word}[${ra}] = ${w[ra]} < ${word}[${rb}] = ${w[rb]}, so swap them: the ${word === "rank" ? "shorter" : "smaller"} tree goes under the ${word === "rank" ? "taller" : "bigger"} one.`
      : `${word}[${ra}] = ${w[ra]} ≥ ${word}[${rb}] = ${w[rb]}, so ${rb}'s tree goes under ${ra}${w[ra] === w[rb] ? " (a tie: the second root goes under the first)" : ""}.`, { lit: { [ra]: "found", [rb]: "found" }, vars: { a, b, ra, rb, [`${word}[ra]`]: w[ra], [`${word}[rb]`]: w[rb] } });
    if (flip) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.snap(11, `parent[${rb}] ← ${ra}. Hanging the ${word === "rank" ? "shorter" : "smaller"} tree keeps ${word === "rank" ? "the height" : "most nodes' depth"} from growing.`, { lit: { [rb]: "new", [ra]: "found" }, changed: [rb], vars: { ra, rb } });
    if (this.mode === "rank") {
      if (this.rank[ra] === this.rank[rb]) {
        this.rank[ra]++;
        this.snap(12, `Both had rank ${this.rank[rb]}, so the new tree is one taller: rank[${ra}] ← ${this.rank[ra]}.`, { lit: { [ra]: "new" }, changedRank: [ra], vars: { ra, rb, "rank[ra]": this.rank[ra] } });
      } else this.snap(12, `The ranks differed, so ${ra}'s rank stays ${this.rank[ra]}.`, { lit: { [ra]: "found" }, vars: { ra, rb, "rank[ra]": this.rank[ra] } });
    } else {
      this.size[ra] += this.size[rb];
      this.snap(12, `size[${ra}] ← ${this.size[ra]}.`, { lit: { [ra]: "new" }, changedRank: [ra], vars: { ra, rb, "size[ra]": this.size[ra] } });
    }
    return true;
  }

  run(op) {
    this.steps = [];
    const before = this.hops;
    if (op[0] === "u") this.union(op[1], op[2]);
    else this.find(op[1]);
    this.snap(null, `${op[0] === "u" ? `union(${op[1]}, ${op[2]})` : `find(${op[1]})`} done with ${this.hops - before} pointer hop${this.hops - before === 1 ? "" : "s"}. ${this.sets().length} set${this.sets().length === 1 ? "" : "s"} now.`, { vars: { hops: this.hops - before, sets: this.sets().length }, done: true });
    return this.steps;
  }
}

// "u1-2,f3" → [["u", 1, 2], ["f", 3]]
export function parseOps(text, n) {
  const ops = String(text ?? "").split(/[\s,]+/).filter(Boolean).map((s) => {
    const m = /^(u)(\d+)-(\d+)$|^(f)(\d+)$/.exec(s);
    if (!m) throw new Error(`Couldn't read "${s}". Use u3-5 for union(3, 5) and f4 for find(4).`);
    return m[1] ? ["u", Number(m[2]), Number(m[3])] : ["f", Number(m[5])];
  });
  for (const o of ops) if (o.slice(1).some((v) => v >= n)) throw new Error(`Elements are numbered 0 to ${n - 1}.`);
  return ops;
}
export const opText = (o) => (o[0] === "u" ? `u${o[1]}-${o[2]}` : `f${o[1]}`);

// Total hops and final height for the same operations under every strategy.
export function compare(n, ops) {
  return [["naive", false], ["naive", true], ["rank", false], ["rank", true], ["size", false], ["size", true]].map(([mode, compress]) => {
    const d = new DSU(n, { mode, compress });
    d.record = false;
    for (const o of ops) o[0] === "u" ? d.union(o[1], o[2]) : d.find(o[1]);
    return { mode, compress, hops: d.hops, height: d.height() };
  });
}
