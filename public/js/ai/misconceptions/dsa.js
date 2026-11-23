// Data structures and algorithms misconceptions: sorting, binary search
// trees, binary heaps, minimum spanning trees and shortest paths.
import { afterPasses, ALGORITHMS as SORTS } from "../../engines/sorting.js";
import { buildBst, heightOf, traversal } from "../../engines/bst.js";
import { Heap, buildSwaps } from "../../engines/heap.js";
import { parseGraph } from "../../engines/graph.js";
import { kruskal, prim } from "../../engines/mst.js";
import { dijkstra } from "../../engines/paths.js";
import { bfs } from "../../engines/traversal.js";
import { anyOf, define, list, opt, optSet } from "./kit.js";

// --- Sorting -----------------------------------------------------------------------------

const SIMPLE = ["bubble", "selection", "insertion"];
const sortName = (a) => SORTS[a].name.toLowerCase();
const inversions = (v) => { let n = 0; for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i] > v[j]) n++; return n; };
const TEXTBOOK_STABLE = new Set(["bubble", "insertion", "merge"]);
const sorting = define("sorting", [
  {
    id: "other-simple-sort",
    label: "ran the passes of a different simple sort",
    predict: (q) => (q.given.variant === "passes" ? anyOf(SIMPLE.filter((a) => a !== q.given.algo).map((a) => opt(q, list(afterPasses(a, q.given.values, q.given.k))))) : null),
    explain: (q) => ({
      bubble: "A bubble sort pass swaps neighbours that are out of order all the way along, so the largest value bubbles to the end.",
      selection: "A selection sort pass finds the smallest value left and swaps it to the front of the unsorted part, once per pass.",
      insertion: "An insertion sort pass takes the next value and slides it left into the sorted prefix.",
    })[q.given.algo],
  },
  {
    id: "pass-off-by-one",
    label: "did one pass too many or too few",
    predict: (q) => (q.given.variant === "passes" ? anyOf([opt(q, list(afterPasses(q.given.algo, q.given.values, q.given.k - 1))), opt(q, list(afterPasses(q.given.algo, q.given.values, q.given.k + 1)))]) : null),
    explain: (q) => `Count the passes from the original array: after pass 1 the array is ${list(afterPasses(q.given.algo, q.given.values, 1))}, and after pass ${q.given.k} it is ${q.given.variant === "passes" ? list(afterPasses(q.given.algo, q.given.values, q.given.k)) : ""}.`,
  },
  {
    id: "no-early-exit",
    label: "counted every pass of bubble sort, ignoring the early stop",
    predict: (q) => (q.given.variant === "count" && q.given.algo === "bubble" && q.given.ask === "comparisons" ? (q.given.values.length * (q.given.values.length - 1)) / 2 : null),
    explain: (q) => `Without the early stop bubble sort makes n(n − 1)/2 = ${(q.given.values.length * (q.given.values.length - 1)) / 2} comparisons, but this version stops after a pass with no swaps, so it makes ${q.answer}.`,
  },
  {
    id: "swap-every-pass",
    label: "counted a swap on every pass of selection sort",
    predict: (q) => (q.given.variant === "count" && q.given.algo === "selection" ? q.given.values.length - 1 : null),
    explain: (q) => `Selection sort makes at most n − 1 = ${q.given.values.length - 1} swaps, but none on a pass where the smallest value is already in place. Here that gives ${q.answer}.`,
  },
  {
    id: "counted-shifts",
    label: "counted the shifts (inversions) instead of the comparisons",
    predict: (q) => (q.given.variant === "count" && q.given.algo === "insertion" ? inversions(q.given.values) : null),
    explain: (q) => `Each shift is one comparison that found a larger value, but every pass also makes one last comparison that stops it (unless it reaches the front). There are ${inversions(q.given.values)} shifts and ${q.answer} comparisons.`,
  },
  {
    id: "textbook-stability-only",
    label: "answered from which sorts are stable in general, not on this input",
    predict: (q) => (q.given.variant === "stable" ? optSet(q, (_, i) => TEXTBOOK_STABLE.has(q.given.algos[i])) : null),
    explain: () => "Stable sorts always keep equal keys in order, but an unstable sort can still happen to keep them on a particular input. The question is about this input, so run each sort and look.",
  },
  {
    id: "selection-is-stable",
    label: "took selection sort to be stable",
    predict: (q) => (q.given.variant === "stable" && q.given.algos.includes("selection") ? optSet(q, (_, i) => TEXTBOOK_STABLE.has(q.given.algos[i]) || q.given.algos[i] === "selection") : null),
    explain: () => "Selection sort swaps the minimum into place, and that long-distance swap can jump an element over an equal one. It is not stable in general.",
  },
]);

// --- Binary search trees ---------------------------------------------------------------------

const TRAV = { preorder: "pre-order", postorder: "post-order", levelorder: "level-order", inorder: "in-order" };
const trav = (keys, kind) => list(traversal(buildBst(keys).root, kind));
const bst = define("binary-search-tree", [
  {
    id: "pre-post-swapped",
    label: "mixed up pre-order and post-order",
    predict: (q) => (q.given.variant === "traversal" && q.given.kind !== "levelorder" ? opt(q, trav(q.given.keys, q.given.kind === "preorder" ? "postorder" : "preorder")) : null),
    explain: () => "Pre-order visits a node before its subtrees (root, left, right); post-order visits it after them (left, right, root).",
  },
  {
    id: "insertion-order",
    label: "listed the keys in insertion order",
    predict: (q) => (q.given.variant === "traversal" ? opt(q, list(q.given.keys)) : null),
    explain: (q) => `The order the keys were inserted in isn't a traversal: build the tree first, then walk it. Its ${TRAV[q.given.kind] ?? "traversal"} is ${q.given.variant === "traversal" ? trav(q.given.keys, q.given.kind) : ""}.`,
  },
  {
    id: "height-counts-nodes",
    label: "counted nodes on the longest path instead of edges",
    predict: (q) => (q.given.variant === "height" ? q.answer + 1 : null),
    explain: (q) => `With a single node at height 0, height counts edges from the root to the deepest leaf: ${q.answer}. Counting the nodes on that path gives one more.`,
  },
  {
    id: "predecessor-instead",
    label: "replaced the deleted node with its in-order predecessor",
    predict: (q) => {
      const g = q.given;
      if (g.variant !== "delete") return null;
      let z = buildBst(g.keys).root;
      while (z && z.key !== g.k) z = g.k < z.key ? z.left : z.right;
      if (!z?.left) return null;
      const pred = Math.max(...traversal(z.left, "inorder"));
      return opt(q, list(traversal(buildBst(g.keys.filter((x) => x !== pred).map((x) => (x === g.k ? pred : x))).root, "preorder")));
    },
    explain: () => "This question says a node with two children is replaced by its in-order successor: the smallest key in its right subtree. The predecessor (largest in the left subtree) also keeps a valid BST, but gives a different tree.",
  },
]);

// --- Binary heaps -------------------------------------------------------------------------------

const heapArr = (kind, values, method) => { const hp = new Heap(kind); hp.build(values, method); return hp.values(); };
const sortedFor = (kind, values) => [...values].sort((a, b) => (kind === "max" ? b - a : a - b));
const heap = define("binary-heap", [
  {
    id: "swaps-from-inserts",
    label: "counted the swaps for inserting the keys one by one",
    predict: (q) => (q.given.variant === "swaps" ? buildSwaps(q.given.values, q.given.kind, "inserts").swaps : null),
    explain: (q) => `Bottom-up build-heap sifts down each non-leaf from the last one back to the root, which makes ${q.answer} swaps here. Inserting the keys one at a time sifts up instead and swaps differently (${q.given.variant === "swaps" ? buildSwaps(q.given.values, q.given.kind, "inserts").swaps : 0}).`,
  },
  {
    id: "floyd-for-inserts",
    label: "built the heap bottom-up instead of inserting one key at a time",
    predict: (q) => (q.given.variant === "inserts" ? opt(q, list(heapArr(q.given.kind, q.given.values, "floyd"))) : null),
    explain: () => "Inserting keys one at a time adds each as the last leaf and sifts it up. Bottom-up build-heap sifts down from the middle instead; both give valid heaps, but often different arrays.",
  },
  {
    id: "heap-is-sorted",
    label: "assumed a heap array is sorted",
    predict: (q) => (q.given.variant === "inserts" ? opt(q, list(sortedFor(q.given.kind, q.given.values))) : q.given.variant === "extract" ? opt(q, list(sortedFor(q.given.kind, q.given.values).slice(q.given.k))) : null),
    explain: () => "A heap only promises that every parent beats its children. Siblings and cousins can be in any order, so the array is usually not sorted.",
  },
  {
    id: "shifted-array",
    label: "removed the root by shifting the array left",
    predict: (q) => (q.given.variant === "extract" ? opt(q, list(heapArr(q.given.kind, q.given.values, "floyd").slice(q.given.k))) : null),
    explain: () => "Extracting moves the last element to the root and sifts it down. Shifting every element left breaks the parent and child positions.",
  },
]);

// --- Minimum spanning trees ---------------------------------------------------------------------

const edgeLabel = (g, id) => { const e = g.edges.find((x) => x.id === id); return `(${e.from}, ${e.to}) weight ${e.w}`; };
const lightest = (g) => [...g.edges].sort((a, b) => a.w - b.w).slice(0, g.nodes.length - 1);
const mst = define("minimum-spanning-tree", [
  {
    id: "prim-wrong-start",
    label: "started Prim's algorithm from a different vertex",
    predict: (q) => {
      const gv = q.given;
      if (gv.variant !== "prim") return null;
      const g = parseGraph(gv.text);
      return anyOf(g.nodes.filter((v) => v !== gv.s).map((v) => { const id = prim(g, v).tree[gv.k - 1]; return id == null ? null : opt(q, edgeLabel(g, id)); }));
    },
    explain: (q) => `Every start vertex gives the same tree, but the order edges are added depends on where Prim's starts. Grow the tree from ${q.given.s}.`,
  },
  {
    id: "kruskal-order-for-prim",
    label: "added edges in Kruskal's order (lightest overall) instead of Prim's",
    predict: (q) => {
      if (q.given.variant !== "prim") return null;
      const g = parseGraph(q.given.text), id = kruskal(g).tree[q.given.k - 1];
      return id == null ? null : opt(q, edgeLabel(g, id));
    },
    explain: () => "Prim's grows one connected tree, adding the lightest edge that leaves it. Kruskal's takes the lightest edge anywhere that doesn't close a cycle, so the order differs.",
  },
  {
    id: "prim-order-for-kruskal",
    label: "grew one tree (Prim's order) instead of taking the lightest edge anywhere",
    predict: (q) => {
      if (q.given.variant !== "kruskal") return null;
      const g = parseGraph(q.given.text);
      return anyOf(g.nodes.map((v) => { const id = prim(g, v).tree[q.given.k - 1]; return id == null ? null : opt(q, edgeLabel(g, id)); }));
    },
    explain: () => "Kruskal's sorts all the edges by weight and adds each one that doesn't close a cycle, wherever it is. The tree can be in several pieces until the end.",
  },
  {
    id: "no-cycle-check",
    label: "took the lightest edges without skipping ones that close a cycle",
    predict: (q) => {
      const gv = q.given;
      const g = parseGraph(gv.text), light = lightest(g);
      if (gv.variant === "kruskal") { const e = [...g.edges].sort((a, b) => a.w - b.w)[gv.k - 1]; return e ? opt(q, edgeLabel(g, e.id)) : null; }
      if (gv.variant === "weight") return light.reduce((a, e) => a + e.w, 0);
      if (gv.variant === "which") return optSet(q, (o) => light.some((e) => edgeLabel(g, e.id) === o));
      return null;
    },
    explain: () => "Kruskal's skips any edge whose ends are already connected, because it would close a cycle. The tree is the n − 1 lightest edges that don't, not simply the n − 1 lightest.",
  },
]);

// --- Shortest paths ---------------------------------------------------------------------------------

// Dijkstra's greedy rule run blindly on negative weights: a finished vertex is never updated again.
function greedy(g, s) {
  const d = Object.fromEntries(g.nodes.map((v) => [v, Infinity])), done = new Set();
  d[s] = 0;
  for (;;) {
    const u = g.nodes.filter((v) => !done.has(v) && d[v] < Infinity).sort((a, b) => d[a] - d[b] || (a < b ? -1 : 1))[0];
    if (u == null) return d;
    done.add(u);
    for (const { v, w } of g.out[u]) if (!done.has(v) && d[u] + w < d[v]) d[v] = d[u] + w;
  }
}
// The length of a path with the fewest edges (BFS, ties alphabetical).
function fewestEdges(g, s, t) {
  const prev = { [s]: null }, queue = [s];
  while (queue.length) {
    const u = queue.shift();
    for (const { v } of [...g.out[u]].sort((a, b) => (a.v < b.v ? -1 : 1))) if (!(v in prev)) { prev[v] = u; queue.push(v); }
  }
  if (!(t in prev)) return null;
  let len = 0;
  for (let x = t; prev[x] != null; x = prev[x]) len += g.out[prev[x]].find((e) => e.v === x).w;
  return len;
}
const graphOf = (q) => parseGraph(q.given.text, { directed: true });
const paths = define("shortest-paths", [
  {
    id: "dijkstra-negative",
    label: "ran Dijkstra's algorithm on a graph with negative edges",
    predict: (q) => (q.given.variant === "bellman" ? greedy(graphOf(q), q.given.s)[q.given.t] : null),
    explain: (q) => `Dijkstra's algorithm finalises a vertex as soon as it is the closest, which is only safe when weights can't be negative. A negative edge found later can still shorten a finished vertex's path, so use Bellman-Ford: the answer is ${q.answer}.`,
  },
  {
    id: "fewest-edges",
    label: "took the path with the fewest edges instead of the lightest",
    predict: (q) => (q.given.variant === "dist" || q.given.variant === "bellman" ? fewestEdges(graphOf(q), q.given.s, q.given.t) : null),
    explain: (q) => `The shortest path is the one with the least total weight, which may use more edges. From ${q.given.s} to ${q.given.t} that is ${q.answer}.`,
  },
  {
    id: "bfs-order",
    label: "listed the vertices in BFS order instead of by distance",
    predict: (q) => (q.given.variant === "order" ? opt(q, list(bfs(graphOf(q), q.given.s).order)) : null),
    explain: () => "Dijkstra's removes the unfinished vertex with the smallest distance so far. BFS visits by number of edges, which ignores the weights.",
  },
  {
    id: "counted-tries",
    label: "counted every edge tried, not only the ones that lowered a distance",
    predict: (q) => {
      if (q.given.variant !== "relax") return null;
      const g = graphOf(q), res = dijkstra(g, q.given.s);
      return res.order.reduce((a, u) => a + g.out[u].length, 0);
    },
    explain: () => "A relaxation only counts when d[u] + w beats the current d[v]. Edges that are tried and don't improve anything (or lead to finished vertices) don't count.",
  },
  {
    id: "once-per-vertex",
    label: "assumed each distance is lowered exactly once",
    predict: (q) => {
      if (q.given.variant !== "relax") return null;
      const res = dijkstra(graphOf(q), q.given.s);
      return Object.entries(res.dist).filter(([v, d]) => v !== q.given.s && d < Infinity).length;
    },
    explain: () => "A vertex's distance can drop more than once: first from ∞, then again each time a shorter route to it is found before it is finished.",
  },
]);

export const DSA = [...sorting, ...bst, ...heap, ...mst, ...paths];
