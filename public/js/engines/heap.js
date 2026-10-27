// Binary heap (min or max) stored in an array, with every comparison and swap
// recorded. Items keep a stable id so the view can slide the same value in the
// array and in the tree at once.

export const CODE = {
  insert: [
    "insert(H, v):",
    "  H.append(v); i ← n − 1  // the new last leaf",
    "  while i > 0",
    "    p ← ⌊(i − 1) / 2⌋",
    "    if H[i] beats H[p] then  // smaller in a min-heap",
    "      swap H[i], H[p]; i ← p  // sift up",
    "    else stop  // the heap property holds",
  ],
  extract: [
    "extractTop(H):",
    "  top ← H[0]",
    "  H[0] ← H[n − 1]; n ← n − 1  // the last leaf jumps to the root",
    "  i ← 0",
    "  loop  // sift down",
    "    l ← 2i + 1; r ← 2i + 2; best ← i",
    "    if l < n and H[l] beats H[best] then best ← l",
    "    if r < n and H[r] beats H[best] then best ← r",
    "    if best = i then stop",
    "    swap H[i], H[best]; i ← best",
    "  return top",
  ],
  floyd: [
    "buildHeap(A):  // Floyd: bottom-up",
    "  for i ← ⌊n/2⌋ − 1 down to 0  // every internal node",
    "    siftDown(A, i)",
    "siftDown(A, i):",
    "  l ← 2i + 1; r ← 2i + 2; best ← i",
    "  if l < n and A[l] beats A[best] then best ← l",
    "  if r < n and A[r] beats A[best] then best ← r",
    "  if best ≠ i then swap A[i], A[best]; siftDown(A, best)",
  ],
  inserts: [
    "buildHeap(A):  // one insert at a time",
    "  n ← 0",
    "  for each v in A",
    "    n ← n + 1; i ← n − 1  // v joins as the last leaf",
    "    while i > 0 and H[i] beats H[⌊(i − 1)/2⌋]",
    "      swap with the parent; i ← ⌊(i − 1)/2⌋",
  ],
  key: [
    "decreaseKey(H, i, v):  // increaseKey in a max-heap",
    "  if v doesn't beat H[i] then error",
    "  H[i] ← v",
    "  while i > 0 and H[i] beats H[⌊(i − 1)/2⌋]",
    "    swap H[i], H[⌊(i − 1)/2⌋]; i ← ⌊(i − 1)/2⌋",
  ],
};

export const OPS = [
  { id: "peek", name: "Peek at the top", avg: "O(1)", worst: "O(1)", why: "It's always H[0]." },
  { id: "insert", name: "Insert", avg: "O(1)", worst: "O(log n)", why: "Sift up one path; on random input it rarely climbs far." },
  { id: "extract", name: "Extract top", avg: "O(log n)", worst: "O(log n)", why: "Sift down one path, two comparisons per level." },
  { id: "key", name: "Decrease-key", avg: "O(log n)", worst: "O(log n)", why: "Sift up from index i (you need to know i)." },
  { id: "floyd", name: "Build (Floyd)", avg: "O(n)", worst: "O(n)", why: "Most nodes are near the bottom and sift down only a little: Σ h·n/2^(h+1) = O(n)." },
  { id: "inserts", name: "Build (n inserts)", avg: "O(n)", worst: "O(n log n)", why: "Late arrivals are deep and may climb the whole height." },
  { id: "sort", name: "Heap sort", avg: "O(n log n)", worst: "O(n log n)", why: "Build once, then n extracts." },
];

export const parent = (i) => Math.floor((i - 1) / 2);

export class Heap {
  constructor(kind = "min") { this.kind = kind; this.A = []; this.nextId = 0; this.steps = []; this.swaps = 0; this.comps = 0; }
  beats(a, b) { this.comps++; return this.kind === "min" ? a < b : a > b; }
  get word() { return this.kind === "min" ? "smaller" : "larger"; }
  snap(line, note, extra = {}) {
    this.steps.push({ A: this.A.map((x) => ({ ...x })), size: this.A.length, line, note, lit: {}, swaps: this.swaps, comps: this.comps, ...extra });
  }
  swap(i, j) { [this.A[i], this.A[j]] = [this.A[j], this.A[i]]; this.swaps++; }
  values() { return this.A.map((x) => x.v); }

  // Sift the item at i up (used by insert, build-by-inserts and decrease-key).
  siftUp(i, lines, extra = {}) {
    const A = this.A;
    while (i > 0) {
      const p = parent(i), win = this.beats(A[i].v, A[p].v);
      this.snap(win ? lines.cmp : lines.stop ?? lines.cmp, `Compare ${A[i].v} (index ${i}) with its parent ${A[p].v} (index ${p} = ⌊(${i} − 1)/2⌋): ${win ? `${A[i].v} is ${this.word}, so they swap` : `${A[i].v} is not ${this.word}, so it stays`}.`,
        { lit: { [i]: "cur", [p]: "cmp" }, vars: { i, p, "H[i]": A[i].v, "H[p]": A[p].v, swaps: this.swaps }, ...extra });
      if (!win) return i;
      this.swap(i, p);
      this.snap(lines.swap, `Swap: ${A[p].v} moves up to index ${p}, ${A[i].v} down to index ${i}.`, { lit: { [p]: "cur", [i]: "swap" }, vars: { i: p, swaps: this.swaps }, ...extra });
      i = p;
    }
    this.snap(lines.top, `${A[0].v} has reached the root (index 0).`, { lit: { 0: "cur" }, vars: { i: 0, swaps: this.swaps }, ...extra });
    return 0;
  }

  // Sift the item at i down within the first n items.
  siftDown(i, n, lines, extra = {}) {
    const A = this.A;
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let best = i;
      if (l >= n) {
        this.snap(lines.stop, `${A[i].v} at index ${i} has no children (2·${i} + 1 = ${l} ≥ ${n}), so it stops.`, { lit: { [i]: "cur" }, vars: { i, l, r, n, swaps: this.swaps }, ...extra });
        return i;
      }
      if (this.beats(A[l].v, A[best].v)) best = l;
      if (r < n && this.beats(A[r].v, A[best].v)) best = r;
      const kids = r < n ? `${A[l].v} and ${A[r].v}` : `${A[l].v} (it has only a left child)`;
      this.snap(lines.cmp, `${A[i].v} at index ${i}: children ${kids}. ${best === i ? `${A[i].v} is already ${this.kind === "min" ? "the smallest" : "the largest"}` : `The ${this.kind === "min" ? "smallest" : "largest"} of the three is ${A[best].v}`}.`,
        { lit: { [i]: "cur", [l]: "cmp", ...(r < n ? { [r]: "cmp" } : {}), ...(best !== i ? { [best]: "best" } : {}) }, vars: { i, l, r: r < n ? r : null, best, "H[i]": A[i].v, swaps: this.swaps }, ...extra });
      if (best === i) {
        this.snap(lines.stop, `The heap property holds at index ${i}: stop.`, { lit: { [i]: "done" }, vars: { i, best, swaps: this.swaps }, ...extra });
        return i;
      }
      this.swap(i, best);
      this.snap(lines.swap, `Swap: ${A[i].v} moves up to index ${i}, ${A[best].v} sinks to index ${best}.`, { lit: { [i]: "swap", [best]: "cur" }, vars: { i: best, swaps: this.swaps }, ...extra });
      i = best;
    }
  }

  build(values, method = "floyd") {
    this.steps = []; this.swaps = 0; this.comps = 0;
    this.A = values.map((v) => ({ id: this.nextId++, v }));
    const n = this.A.length;
    if (method === "floyd") {
      this.snap(1, `Floyd's method: put all ${n} values in the array as they are, then fix the tree from the bottom up. Leaves (indices ${Math.floor(n / 2)} to ${n - 1}) are already tiny heaps.`, { vars: { n } });
      for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        this.snap([2, 3], `siftDown(${i}): the subtrees below index ${i} are already heaps, so sinking ${this.A[i].v} makes the subtree at ${i} a heap too.`, { lit: { [i]: "cur" }, vars: { i, n, swaps: this.swaps } });
        this.siftDown(i, n, { cmp: [5, 6, 7], stop: 8, swap: 8 });
      }
      this.snap(null, `Built with ${this.swaps} swap${this.swaps === 1 ? "" : "s"} and ${this.comps} comparisons. The root ${this.A[0]?.v} is the ${this.kind === "min" ? "minimum" : "maximum"}.`, { vars: { n, swaps: this.swaps, comparisons: this.comps }, done: true });
    } else {
      this.snap(2, `Repeated inserts: start with an empty heap and add the ${n} values one at a time, sifting each one up.`, { size: 0, vars: { n: 0 } });
      for (let k = 0; k < n; k++) {
        this.snap(4, `Insert ${this.A[k].v}: it joins as the last leaf, index ${k}.`, { size: k + 1, lit: { [k]: "new" }, vars: { n: k + 1, i: k, v: this.A[k].v, swaps: this.swaps } });
        if (k) this.siftUp(k, { cmp: 5, swap: 6, top: 5 }, { size: k + 1 });
      }
      this.snap(null, `Built with ${this.swaps} swap${this.swaps === 1 ? "" : "s"} and ${this.comps} comparisons.`, { vars: { n, swaps: this.swaps, comparisons: this.comps }, done: true });
    }
    return this.steps;
  }

  insert(v) {
    this.steps = []; this.swaps = 0; this.comps = 0;
    this.A.push({ id: this.nextId++, v });
    const i = this.A.length - 1;
    this.snap(2, `Insert ${v}: append it at index ${i}, the next free leaf, so the tree stays complete. Then sift it up while it beats its parent.`, { lit: { [i]: "new" }, vars: { v, i } });
    if (i) this.siftUp(i, { cmp: [4, 5], swap: 6, top: 3, stop: [5, 7] });
    this.snap(null, `${v} is in place after ${this.swaps} swap${this.swaps === 1 ? "" : "s"}.`, { vars: { v, swaps: this.swaps }, done: true });
    return this.steps;
  }

  extract() {
    this.steps = []; this.swaps = 0; this.comps = 0;
    if (!this.A.length) { this.snap(1, "The heap is empty: there is nothing to extract.", { vars: {}, bad: true }); return this.steps; }
    const top = this.A[0];
    this.snap(2, `The ${this.kind === "min" ? "minimum" : "maximum"} is always at the root: top = ${top.v}.`, { lit: { 0: "cmp" }, vars: { top: top.v, n: this.A.length } });
    const last = this.A.pop();
    if (this.A.length) this.A[0] = last;
    this.snap(3, this.A.length ? `Take ${top.v} out and move the last leaf, ${last.v}, into the root. The tree stays complete, but ${last.v} is probably in the wrong place.` : `${top.v} was the only item: the heap is now empty.`, { out: top, lit: this.A.length ? { 0: "swap" } : {}, vars: { top: top.v, n: this.A.length } });
    if (this.A.length) this.siftDown(0, this.A.length, { cmp: [6, 7, 8], stop: 9, swap: 10 }, { out: top });
    this.snap(11, `Return ${top.v}. ${this.A.length ? `The new top is ${this.A[0].v}.` : ""}`, { out: top, vars: { top: top.v, n: this.A.length, swaps: this.swaps }, done: true });
    return this.steps;
  }

  changeKey(i, v) {
    this.steps = []; this.swaps = 0; this.comps = 0;
    const name = this.kind === "min" ? "Decrease-key" : "Increase-key";
    if (!(i >= 0 && i < this.A.length)) { this.snap(1, `There is no index ${i}: the heap has indices 0 to ${this.A.length - 1}.`, { vars: { i, v }, bad: true }); return this.steps; }
    const old = this.A[i].v;
    if (old !== v && !this.beats(v, old)) {
      this.snap(2, `${name} only makes a key ${this.word}: ${v} is not ${this.word} than ${old}. (Making it ${this.kind === "min" ? "larger" : "smaller"} would need a sift down instead.)`, { lit: { [i]: "bad" }, vars: { i, v, "H[i]": old }, bad: true });
      return this.steps;
    }
    this.A[i] = { ...this.A[i], v };
    this.snap(3, `${name}: H[${i}] goes from ${old} to ${v}. Below it nothing breaks (it only got ${this.word}), but it may now beat its parent, so sift it up.`, { lit: { [i]: "new" }, vars: { i, v, old } });
    if (i) this.siftUp(i, { cmp: 4, swap: 5, top: 4 });
    this.snap(null, `Done after ${this.swaps} swap${this.swaps === 1 ? "" : "s"}. This is the step Dijkstra's and Prim's algorithms use when they find a shorter distance.`, { vars: { i, v, swaps: this.swaps }, done: true });
    return this.steps;
  }

  // For tests: every parent beats or equals its children.
  valid() {
    const A = this.A, ok = (a, b) => (this.kind === "min" ? a <= b : a >= b);
    return A.every((x, i) => i === 0 || ok(A[parent(i)].v, x.v));
  }
}

// Swap counts for the two build methods (for the comparison and practice).
export function buildSwaps(values, kind, method) {
  const hp = new Heap(kind);
  hp.build(values, method);
  return { swaps: hp.swaps, comps: hp.comps, result: hp.values() };
}
