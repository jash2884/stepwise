// AI tool schemas: data structures and algorithms. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { run as sortRun, afterPasses, parseValues as sortValues, ALGORITHMS as SORTS } from "../../engines/sorting.js";
import { run as searchRun, parseValues as searchValues, ALGORITHMS as SEARCHES } from "../../engines/searching.js";
import { runOps, runExpr, MODES as STACK_MODES } from "../../engines/stacks.js";
import { run as listRun, parseValues as listValues, KINDS as LIST_KINDS, OPS as LIST_OPS } from "../../engines/lists.js";
import { BST, traversal, heightOf, countOf } from "../../engines/bst.js";
import { AVL } from "../../engines/avl.js";
import { Heap } from "../../engines/heap.js";
import { Trie } from "../../engines/trie.js";
import { DSU, MODES as UF_MODES, parseOps as ufOps } from "../../engines/unionfind.js";
import { EXAMPLES as GRAPHS, parseGraph } from "../../engines/graph.js";
import { ALGORITHMS as TRAVERSALS } from "../../engines/traversal.js";
import { ALGORITHMS as MSTS } from "../../engines/mst.js";
import { ALGORITHMS as PATHS } from "../../engines/paths.js";
import { ALGORITHMS as SCCS, condensation } from "../../engines/scc.js";
import { run as dpRun, PROBLEMS } from "../../engines/dp.js";

const join = (xs) => xs.join(" ");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const plain = (s) => s.replace(/[\u2013\u2014]/g, "-"); // engine names use en dashes
// Number of distinct topological orderings of a DAG (bitmask DP, at most 16 vertices).
function countOrderings(g) {
  const idx = new Map(g.nodes.map((v, i) => [v, i]));
  const need = g.nodes.map((v) => g.inn[v].reduce((m, x) => m | (1 << idx.get(x.v)), 0));
  const ways = new Float64Array(1 << g.nodes.length);
  ways[0] = 1;
  for (let m = 0; m < ways.length; m++) {
    if (!ways[m]) continue;
    for (let i = 0; i < g.nodes.length; i++) if (!(m & (1 << i)) && (need[i] & m) === need[i]) ways[m | (1 << i)] += ways[m];
  }
  return ways[ways.length - 1];
}
const dist = (d) => (d === Infinity ? "∞" : d === -Infinity ? "-∞" : d);

// --- Trees: "i50,i30,d20" style op lists (dsa-kit.js parseOps, made strict) --------------
function keyOps(text, label = "ops") {
  const parts = String(text).split(",").map((s) => s.trim()).filter(Boolean);
  return parts.map((s) => {
    const m = /^([id])(\d{1,3})$/.exec(s);
    if (!m) throw new Error(`${label}: can't read "${s}". Use i50 to insert 50 and d30 to delete 30, separated by commas (keys 0 to 999).`);
    return [m[1], Number(m[2])];
  });
}
const leaves = (x) => (!x ? 0 : !x.left && !x.right ? 1 : leaves(x.left) + leaves(x.right));
const treeValues = (root) => ({
  root: root ? root.key : "empty", height: heightOf(root), count: countOf(root), leaves: leaves(root),
  inorder: join(traversal(root, "inorder")), preorder: join(traversal(root, "preorder")),
  postorder: join(traversal(root, "postorder")), levelorder: join(traversal(root, "levelorder")),
});
const TREE_ANSWERS = {
  root: "key at the root", height: "height in edges (one node 0, empty -1)", count: "number of nodes", leaves: "number of leaves",
  inorder: "in-order traversal, keys separated by spaces", preorder: "pre-order traversal", postorder: "post-order traversal", levelorder: "level-order traversal",
};

// --- Graph tools (graph-view.js graphTool) -----------------------------------------------
// g: edges joined by ";", dir: "1" or "0", s: start vertex, t: path target.
function graphParams(example, algos, algo, { target = false } = {}) {
  const ex = GRAPHS[example];
  const params = {
    algo: { type: "enum", values: Object.keys(algos), default: algo, desc: `algorithm: ${Object.entries(algos).map(([k, a]) => `${k} (${plain(a.name)})`).join(", ")}` },
    g: { type: "string", format: "edges separated by ;, each 'A B 4' (from, to, optional whole-number weight from -999 to 999; 'A-B 4' also works); a lone name adds an isolated vertex; vertex names up to 12 letters, digits or _; at most 16 vertices and 40 edges", default: ex.text.replace(/\n/g, ";"), desc: "the graph" },
    dir: { type: "bool", default: ex.directed, desc: "1 for a directed graph (A B means A to B), 0 for undirected; algorithms that need one kind force it" },
    s: { type: "string", default: ex.source, desc: "start vertex (if the default is not in the graph, the alphabetically first vertex is used)" },
  };
  if (target) params.t = { type: "string", default: "", desc: "optional target vertex for the path answer" };
  return params;
}
function loadGraph(v, algos, defaults) {
  const algo = algos[v.algo];
  const directed = algo.mode ? algo.mode === "directed" : v.dir;
  const g = parseGraph(String(v.g).replace(/;/g, "\n"), { directed, maxNodes: algo.maxNodes ?? 16 });
  let source = v.s;
  if (!g.nodes.includes(source)) {
    if (source !== defaults.s) throw new Error(`The start vertex ${source} is not in the graph (vertices: ${join(g.nodes)}).`);
    source = g.nodes[0];
  }
  const target = v.t || null;
  if (target && !g.nodes.includes(target)) throw new Error(`The target vertex ${target} is not in the graph (vertices: ${join(g.nodes)}).`);
  return { g, algo, source, target, res: algo.run(g, { source, target }) };
}

// --- Stacks and queues: the view's per-mode sample inputs ------------------------------
const STACK_DEFAULTS = {
  stack: "push 5, push 3, pop, push 7, push 2, peek, pop, push 9, push 4, push 6, push 8",
  queue: "enqueue 10, enqueue 20, enqueue 30, dequeue, dequeue, enqueue 40, enqueue 50, enqueue 60, enqueue 70, dequeue, enqueue 80",
  deque: "pushBack 1, pushBack 2, pushFront 3, pushFront 4, popBack, pushFront 5, popFront, pushBack 6",
  parens: "{ [ ( a + b ) * c ] - ( d ) }",
  infix: "a + b * ( c ^ d - e ) ^ ( f + g * h ) - i",
  postfix: "2 3 1 * + 9 -",
};

const SIMPLE_SORTS = ["bubble", "selection", "insertion"];
const SWAP_SORTS = ["bubble", "selection", "shell", "quick", "heap"];

export const SCHEMAS = [
  tool("sorting", {
    keywords: "sort bubble selection insertion shell merge quick quicksort lomuto pivot partition heap sort heapsort counting radix lsd stable in-place comparisons swaps passes inversions",
    params: {
      algo: { type: "enum", values: Object.keys(SORTS), default: "quick", desc: "sorting algorithm: bubble, selection, insertion, shell (gaps n/2, n/4, ... 1), merge, quick (Lomuto, last element as pivot), heap (max-heap), counting, radix (LSD)" },
      a: { type: "string", format: "2 to 24 whole numbers from 0 to 999 separated by spaces", default: "38 27 43 3 9 82 10 55 19 64", desc: "the array to sort" },
    },
    answers: {
      comparisons: "comparisons between array elements", writes: "array writes", swaps: "swaps (bubble, selection, shell, quick and heap only)",
      sorted: "the sorted array", "pass.1": "array after pass 1 (bubble, selection and insertion only; pass.2, pass.3, ...)",
    },
    examples: [
      { request: "How many swaps does bubble sort make on 5 1 4 2 8?", params: { algo: "bubble", a: "5 1 4 2 8" } },
      { request: "Array after 2 passes of selection sort on 64 25 12 22 11", params: { algo: "selection", a: "64 25 12 22 11" } },
    ],
    validate(v) {
      const vals = sortValues(v.a);
      const res = sortRun(v.algo, vals);
      const values = { comparisons: res.comparisons, writes: res.writes, sorted: join(res.result) };
      if (SWAP_SORTS.includes(v.algo)) values.swaps = res.steps.filter((s) => s.swap && s.swap[0] !== s.swap[1]).length;
      if (SIMPLE_SORTS.includes(v.algo)) for (let k = 1; k < vals.length; k++) values[`pass.${k}`] = join(afterPasses(v.algo, vals, k));
      return { text: `${plain(SORTS[v.algo].name)} on ${vals.length} values: ${res.comparisons} comparisons, ${res.writes} writes${values.swaps != null ? `, ${values.swaps} swaps` : ""}; sorted: ${values.sorted}.`, values };
    },
  }),

  tool("searching", {
    keywords: "linear search binary search jump search interpolation search lower bound upper bound bisect probes mid comparisons sorted array",
    params: {
      algo: { type: "enum", values: Object.keys(SEARCHES), default: "binary", desc: "linear, binary, jump, interpolation, lower (first index with A[i] >= t), upper (first index with A[i] > t); all but linear sort the array first" },
      a: { type: "string", format: "1 to 20 whole numbers from -999 to 999 separated by spaces", default: "2 5 8 12 16 23 38 56 72 91", desc: "the array (indices start at 0)" },
      t: { type: "int", min: -999, max: 999, default: 23, desc: "the key to search for" },
    },
    answers: { index: "index returned (-1 if not found; for lower and upper bound, n if none)", found: "whether the key was found", probes: "number of array elements compared with the key", probed: "indices probed, in order", probedValues: "values compared with the key, in order" },
    examples: [
      { request: "Binary search for 35 in 3 9 14 20 27 31 40 48 52 60 66: which elements are compared?", params: { algo: "binary", a: "3 9 14 20 27 31 40 48 52 60 66", t: 35 } },
      { request: "lower bound of 3 in 1 3 3 3 5 7 7 9", params: { algo: "lower", a: "1 3 3 3 5 7 7 9", t: 3 } },
    ],
    validate(v) {
      const res = searchRun(v.algo, searchValues(v.a), v.t);
      const probed = res.steps.filter((s) => s.probe != null).map((s) => s.probe);
      const bound = v.algo === "lower" || v.algo === "upper";
      const found = bound ? res.index < res.A.length && res.A[res.index] === v.t : res.index >= 0;
      return { text: `${plain(SEARCHES[v.algo].name)} for ${v.t}: returns ${res.index} after ${plural(res.probes, "probe")} (indices ${join(probed) || "none"}).`,
        values: { index: res.index, found, probes: res.probes, probed: join(probed), probedValues: join(probed.map((i) => res.A[i])) } };
    },
  }),

  tool("stacks-queues", {
    keywords: "stack queue deque circular queue push pop enqueue dequeue overflow underflow lifo fifo balanced brackets parentheses infix to postfix shunting yard reverse polish postfix evaluation operator precedence",
    params: {
      mode: { type: "enum", values: Object.keys(STACK_MODES), default: "infix", desc: "stack, queue (circular array), deque, parens (balanced brackets), infix (infix to postfix), postfix (evaluate postfix)" },
      in: { type: "string", format: "stack: 'push 5, pop, peek'; queue: 'enqueue 10, dequeue'; deque: 'pushFront 1, pushBack 2, popFront, popBack'; parens: brackets like {[()]}; infix: tokens like a + b * ( c - d ); postfix: tokens separated by spaces like 2 3 1 * + 9 -", desc: "the operations or expression; if omitted the view uses a sample for the mode" },
      cap: { type: "int", min: 2, max: 10, default: 5, desc: "capacity of the array for stack, queue and deque" },
    },
    answers: {
      removed: "values popped or dequeued, in order (stack, queue, deque)", final: "contents at the end, bottom to top or front to back", size: "number of items at the end", errors: "operations that failed (overflow, underflow, empty peek)",
      balanced: "parens: whether the brackets are balanced", postfix: "infix: the postfix expression", value: "postfix: the value", maxDepth: "infix or postfix: most items on the stack at once",
    },
    examples: [
      { request: "Convert a + b * (c ^ d - e) to postfix", params: { mode: "infix", in: "a + b * ( c ^ d - e )" } },
      { request: "Evaluate the postfix expression 6 2 3 + - 3 8 2 / + *", params: { mode: "postfix", in: "6 2 3 + - 3 8 2 / + *" } },
    ],
    validate(v) {
      const text = v.in ?? STACK_DEFAULTS[v.mode];
      if (STACK_MODES[v.mode].kind === "ops") {
        const res = runOps(v.mode, text, v.cap);
        const errors = new Set(res.steps.filter((s) => s.error).map((s) => s.opIndex)).size;
        return { text: `${plain(STACK_MODES[v.mode].name)}: removed ${join(res.popped) || "nothing"}; left ${join(res.final) || "empty"}${errors ? `; ${errors} operation${errors > 1 ? "s" : ""} failed` : ""}.`,
          values: { removed: join(res.popped), final: join(res.final), size: res.final.length, errors } };
      }
      const res = runExpr(v.mode, text);
      if (v.mode === "parens") return { text: `The brackets are ${res.balanced ? "balanced" : "not balanced"}.`, values: { balanced: res.balanced } };
      const maxDepth = Math.max(0, ...res.steps.map((s) => s.stack?.length ?? 0));
      if (v.mode === "infix") return { text: `Postfix: ${res.postfix}; the operator stack holds at most ${maxDepth} symbols.`, values: { postfix: res.postfix, maxDepth } };
      if (!Number.isFinite(res.value)) throw new Error("The postfix expression does not evaluate to a number.");
      return { text: `The postfix expression evaluates to ${round(res.value)}; the stack holds at most ${maxDepth} values.`, values: { value: round(res.value), maxDepth } };
    },
  }),

  tool("linked-list", {
    keywords: "linked list singly doubly circular node pointer head tail insert delete search reverse floyd cycle detection tortoise and hare slow fast pointer",
    params: {
      kind: { type: "enum", values: Object.keys(LIST_KINDS), default: "s", desc: "s singly linked, d doubly linked, c circular (singly)" },
      op: { type: "enum", values: Object.keys(LIST_OPS), default: "reverse", desc: "insertHead, insertTail, insertAt (needs pos and x), delete (first node holding x), search (for x), reverse, floyd (cycle detection, singly or circular)" },
      a: { type: "string", format: "up to 10 whole numbers from -99 to 999 separated by spaces, head first", default: "10 20 30 40 50", desc: "the list" },
      x: { type: "int", min: -99, max: 999, default: 25, desc: "value to insert, delete or search for" },
      pos: { type: "int", min: 0, max: 10, default: 2, desc: "insertAt: position from 0 (head) to n (append)" },
      cycle: { type: "int", min: -1, max: 9, default: 2, desc: "floyd on a singly list: position the last node links back to (-1 for no cycle)" },
    },
    answers: { final: "the list afterwards, head first", length: "number of nodes afterwards", index: "search: position of x (-1 if absent)", hasCycle: "floyd: whether there is a cycle", meetAfter: "floyd: steps until slow and fast first meet", meetAt: "floyd: value where they meet", cycleStart: "floyd: value where the cycle starts" },
    examples: [
      { request: "Floyd's cycle detection on 3 8 1 9 4 7 where the last node points back to position 2: after how many steps do slow and fast meet?", params: { kind: "s", op: "floyd", a: "3 8 1 9 4 7", cycle: 2 } },
      { request: "Insert 25 at position 2 in the doubly linked list 10 20 30 40", params: { kind: "d", op: "insertAt", a: "10 20 30 40", x: 25, pos: 2 } },
    ],
    validate(v) {
      const values = listValues(v.a);
      const res = listRun({ kind: v.kind, values, op: v.op, x: v.x, pos: v.pos, cycleAt: v.cycle });
      const out = { final: join(res.final), length: res.final.length };
      if (v.op === "search") { out.index = res.index; return { text: `${v.x} is ${res.index >= 0 ? `at position ${res.index}` : "not in the list"}.`, values: out }; }
      if (v.op === "floyd") {
        out.hasCycle = !!res.cycle;
        if (res.cycle) {
          out.meetAfter = res.meetAfter;
          out.meetAt = values[res.steps.find((s) => s.meet != null).meet];
          out.cycleStart = values[res.startPos];
          return { text: `Slow and fast meet at ${out.meetAt} after ${out.meetAfter} steps; the cycle starts at ${out.cycleStart}.`, values: out };
        }
        return { text: "Fast reaches the end: there is no cycle.", values: out };
      }
      return { text: `${plain(LIST_OPS[v.op].name)}: the list is now ${join(res.final) || "empty"}.`, values: out };
    },
  }),

  tool("binary-search-tree", {
    keywords: "bst binary search tree insert delete search successor predecessor inorder preorder postorder level order traversal height leaves min max",
    params: {
      ops: { type: "string", format: "i<key> to insert, d<key> to delete, comma separated, keys 0 to 999, e.g. i50,i30,i70,d30", default: "i50,i30,i70,i20,i40,i60,i80,i35", desc: "operations in order, from an empty tree (delete with two children uses the in-order successor)" },
      q: { type: "string", format: "one of min, max, height, inorder, preorder, postorder, levelorder, s<key> (search), x<key> (successor)", desc: "optional query to animate on the final tree" },
    },
    answers: { ...TREE_ANSWERS, min: "smallest key", max: "largest key", found: "s<key> query: whether the key is in the tree", comparisons: "s<key> query: nodes compared on the search path", successor: "x<key> query: in-order successor (none if there isn't one)" },
    examples: [
      { request: "Insert 50 30 70 20 40 60 80 into a BST, then delete 30. What is the preorder?", params: { ops: "i50,i30,i70,i20,i40,i60,i80,d30", q: "preorder" } },
      { request: "Height of the BST built by inserting 10 20 30 40 50", params: { ops: "i10,i20,i30,i40,i50", q: "height" } },
    ],
    validate(v) {
      const t = new BST();
      for (const [k, x] of keyOps(v.ops)) (k === "i" ? t.insert(x) : t.delete(x));
      const values = treeValues(t.root);
      const keys = traversal(t.root, "inorder");
      values.min = keys.length ? keys[0] : "empty"; values.max = keys.length ? keys.at(-1) : "empty";
      let extra = "";
      if (v.q !== undefined) {
        const m = /^([sx])(\d{1,3})$/.exec(v.q);
        if (!m && !["min", "max", "height", "inorder", "preorder", "postorder", "levelorder"].includes(v.q)) throw new Error("q must be min, max, height, inorder, preorder, postorder, levelorder, s<key> or x<key>.");
        if (m && m[1] === "s") {
          const k = Number(m[2]);
          let x = t.root, c = 0;
          while (x) { c++; if (x.key === k) break; x = k < x.key ? x.left : x.right; }
          values.found = !!x; values.comparisons = c;
          extra = ` Searching for ${k} ${x ? "finds it" : "fails"} after ${plural(c, "comparison")}.`;
        } else if (m) {
          const k = Number(m[2]);
          values.successor = keys.includes(k) ? (keys.find((y) => y > k) ?? "none") : "none";
          extra = ` The successor of ${k} is ${values.successor}.`;
        } else if (TREE_ANSWERS[v.q] && v.q !== "height") extra = ` ${v.q}: ${values[v.q]}.`;
      }
      return { text: `The BST has ${values.count} nodes, root ${values.root}, height ${values.height}.${extra}`, values };
    },
  }),

  tool("avl-tree", {
    keywords: "avl tree self balancing balance factor rotation ll rr lr rl single double left right rotation height balanced bst",
    params: {
      ops: { type: "string", format: "i<key> to insert, d<key> to delete, comma separated, keys 0 to 999, e.g. i10,i20,i30", default: "i50,i20,i60,i10,i8,i15,i32,i46,i11,i48", desc: "operations in order, from an empty tree" },
    },
    answers: { ...TREE_ANSWERS, rotations: "single rotations in total (LR and RL count as two)", rebalances: "number of rebalancing cases", cases: "rotation cases in order, e.g. LL RL", lastCase: "rotation case caused by the last operation (none if none)" },
    examples: [
      { request: "Insert 10 20 30 40 50 25 into an AVL tree: what is the root and how many rotations?", params: { ops: "i10,i20,i30,i40,i50,i25" } },
    ],
    validate(v) {
      const t = new AVL();
      const per = keyOps(v.ops).map(([k, x]) => (k === "i" ? t.insert(x) : t.delete(x)).filter((s) => s.vars?.case).map((s) => s.vars.case));
      const cases = per.flat();
      const rotations = cases.reduce((s, c) => s + (c.length === 2 && c[0] === c[1] ? 1 : 2), 0);
      const values = { ...treeValues(t.root), rotations, rebalances: cases.length, cases: join(cases) || "none", lastCase: join(per.at(-1) ?? []) || "none" };
      return { text: `AVL tree: root ${values.root}, height ${values.height}, ${rotations} single rotations (cases ${values.cases}); preorder ${values.preorder}.`, values };
    },
  }),

  tool("binary-heap", {
    keywords: "binary heap min heap max heap priority queue heapify build heap floyd bottom up sift up sift down extract min extract max decrease key insert array representation",
    params: {
      kind: { type: "enum", values: ["min", "max"], default: "min", desc: "min-heap or max-heap" },
      ops: { type: "string", format: "comma separated: f9.4.7 (build with Floyd's bottom-up method from 9 4 7), r9.4.7 (build by inserting one at a time), i5 (insert 5), x (extract the root), k2.1 (decrease-key in a min-heap or increase-key in a max-heap: index 2 to value 1); values 0 to 999, at most 31", default: "f9.4.7.1.8.2.6.3.5", desc: "operations in order, usually a build first" },
    },
    answers: { array: "heap array at the end, index 0 first", root: "value at the root", size: "number of items", swaps: "swaps made by the last operation", comparisons: "comparisons made by the last operation", totalSwaps: "swaps over all operations", extracted: "values extracted, in order" },
    examples: [
      { request: "Build a max-heap from 10 20 15 30 40 with the bottom-up method, then extract the max twice", params: { kind: "max", ops: "f10.20.15.30.40,x,x" } },
      { request: "Insert 7 3 9 1 5 one at a time into a min-heap: what is the array?", params: { kind: "min", ops: "r7.3.9.1.5" } },
    ],
    validate(v) {
      const hp = new Heap(v.kind);
      const parts = String(v.ops).split(",").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) throw new Error("Give at least one heap operation, like f9.4.7.");
      let swaps = 0, comps = 0, total = 0;
      const extracted = [];
      for (const op of parts) {
        if (!/^[fr]\d{1,3}(\.\d{1,3})*$|^i\d{1,3}$|^x$|^k\d{1,2}\.\d{1,3}$/.test(op)) throw new Error(`Can't read the heap operation "${op}". Use f9.4.7, r9.4.7, i5, x or k2.1.`);
        const nums = op.slice(1).split(".").filter(Boolean).map(Number);
        let steps;
        if (op[0] === "f" || op[0] === "r") {
          if (nums.length > 31) throw new Error("Build from at most 31 values.");
          steps = hp.build(nums, op[0] === "f" ? "floyd" : "inserts");
        } else if (op[0] === "i") { if (hp.A.length >= 31) continue; steps = hp.insert(nums[0]); }
        else if (op[0] === "x") { if (hp.A.length) extracted.push(hp.A[0].v); steps = hp.extract(); }
        else steps = hp.changeKey(nums[0], nums[1]);
        if (steps.some((s) => s.bad) && op[0] === "k") throw new Error(`${op}: ${steps.find((s) => s.bad).note}`);
        swaps = hp.swaps; comps = hp.comps; total += hp.swaps;
      }
      const arr = hp.values();
      return { text: `${v.kind === "min" ? "Min" : "Max"}-heap: ${join(arr) || "empty"}; the last operation made ${plural(swaps, "swap")}${extracted.length ? `; extracted ${join(extracted)}` : ""}.`,
        values: { array: join(arr), root: arr.length ? arr[0] : "empty", size: arr.length, swaps, comparisons: comps, totalSwaps: total, extracted: join(extracted) } };
    },
  }),

  tool("trie", {
    keywords: "trie prefix tree digital tree autocomplete prefix search word search insert delete node count",
    params: {
      ops: { type: "string", format: "i<word> to insert, d<word> to delete, comma separated, lowercase letters a to z, e.g. icar,icard,dcar", default: "icar,icard,icare,icat,idog", desc: "operations in order, from an empty trie" },
      q: { type: "string", format: "s<word> (search), p<prefix> (starts with), a<prefix> (autocomplete; a alone lists everything)", desc: "optional query on the final trie" },
    },
    answers: { nodes: "number of nodes, counting the root", words: "number of stored words", list: "stored words in alphabetical order", found: "s<word>: whether the word is stored", hasPrefix: "p<prefix>: whether some word starts with it", completions: "a<prefix>: words starting with the prefix" },
    examples: [
      { request: "Insert car card care cat dog into a trie: how many nodes including the root?", params: { ops: "icar,icard,icare,icat,idog" } },
      { request: "Trie with tea ten tend team, then delete ten: autocomplete te", params: { ops: "itea,iten,itend,iteam,dten", q: "ate" } },
    ],
    validate(v) {
      const t = new Trie();
      const parts = String(v.ops).split(",").map((s) => s.trim()).filter(Boolean);
      for (const op of parts) {
        if (!/^[id][a-z]{1,12}$/.test(op)) throw new Error(`Can't read "${op}". Use iword to insert and dword to delete, lowercase a to z, at most 12 letters.`);
        (op[0] === "i" ? t.insert(op.slice(1)) : t.delete(op.slice(1)));
      }
      const words = t.words();
      const values = { nodes: t.size(), words: words.length, list: join(words) };
      let extra = "";
      if (v.q !== undefined) {
        if (!/^[spa][a-z]*$/.test(v.q)) throw new Error("q must be s<word>, p<prefix> or a<prefix> in lowercase letters.");
        const w = v.q.slice(1);
        if (v.q[0] === "s") { values.found = t.has(w); extra = ` "${w}" is ${values.found ? "" : "not "}stored.`; }
        else if (v.q[0] === "p") { values.hasPrefix = t.hasPrefix(w); extra = ` ${values.hasPrefix ? "Some" : "No"} word starts with "${w}".`; }
        else { values.completions = join(words.filter((x) => x.startsWith(w))); extra = ` Words starting with "${w}": ${values.completions || "none"}.`; }
      }
      return { text: `The trie has ${values.nodes} nodes (with the root) and ${words.length} words.${extra}`, values };
    },
  }),

  tool("union-find", {
    keywords: "union find disjoint set dsu union by rank union by size path compression find parent array representative inverse ackermann kruskal",
    params: {
      n: { type: "int", min: 2, max: 16, default: 8, desc: "number of elements, 0 to n-1" },
      mode: { type: "enum", values: Object.keys(UF_MODES), default: "rank", desc: "naive (root of a goes under root of b), rank or size (on a tie the second root goes under the first)" },
      pc: { type: "bool", default: true, desc: "path compression on every find" },
      ops: { type: "string", format: "u3-5 for union(3, 5) and f4 for find(4), comma separated", default: "u0-1,u2-3,u0-2,u4-5,u6-7,u4-6,u0-4,f7", desc: "operations in order" },
    },
    answers: { parent: "parent array parent[0] to parent[n-1], separated by spaces", rank: "rank array (by rank) or size array (by size)", sets: "number of sets", height: "height of the tallest tree (hops to the root)", hops: "total parent pointers followed", "root.3": "root of element 3 at the end (one key per element)" },
    examples: [
      { request: "8 elements, union by rank with path compression: union(0,1), union(2,3), union(0,2), find(3). What is the parent array?", params: { n: 8, mode: "rank", pc: true, ops: "u0-1,u2-3,u0-2,f3" } },
    ],
    validate(v) {
      const ops = ufOps(v.ops, v.n);
      const d = new DSU(v.n, { mode: v.mode, compress: v.pc });
      d.record = false;
      for (const o of ops) (o[0] === "u" ? d.union(o[1], o[2]) : d.find(o[1]));
      const values = { parent: join(d.parent), rank: join(v.mode === "size" ? d.size : d.rank), sets: d.sets().length, height: d.height(), hops: d.hops };
      for (let i = 0; i < v.n; i++) values[`root.${i}`] = d.root(i);
      return { text: `${UF_MODES[v.mode].name}${v.pc ? " with path compression" : ""}: parent = [${d.parent.join(", ")}], ${plural(values.sets, "set")}, tallest tree ${plural(values.height, "hop")}, ${plural(d.hops, "hop")} in total.`, values };
    },
  }),

  tool("graph-traversal", {
    keywords: "bfs dfs breadth first search depth first search traversal order discovery finish time tree back forward cross edge connected components cycle detection bipartite two colouring topological sort kahn dag levels",
    params: graphParams("clrsBfs", TRAVERSALS, "bfs"),
    answers: {
      order: "visit order (bfs, dfs) or topological order (kahn, topo), vertices separated by spaces", "dist.v": "bfs: edges from the start to v (one key per vertex)", levels: "bfs: vertices by level, levels separated by |",
      "d.v": "dfs: discovery time of v", "f.v": "dfs: finish time of v", tree: "dfs: tree edges", back: "dfs: back edges", forward: "dfs: forward edges", cross: "dfs: cross edges",
      count: "components: number of connected components", groups: "components: the components", hasCycle: "cycle: whether there is a cycle", bipartite: "bipartite: whether it is two-colourable", isDag: "kahn, topo: whether a topological order exists", orderings: "kahn, topo: how many different topological orderings there are",
    },
    examples: [
      { request: "BFS from A on edges A-B, A-C, B-D, C-D, D-E: in what order are vertices visited?", params: { algo: "bfs", g: "A B;A C;B D;C D;D E", dir: false, s: "A" } },
      { request: "Topological sort of the DAG 5->2, 5->0, 4->0, 4->1, 2->3, 3->1 using Kahn's algorithm", params: { algo: "kahn", g: "5 2;5 0;4 0;4 1;2 3;3 1", dir: true } },
    ],
    validate(v) {
      const { g, source, res } = loadGraph(v, TRAVERSALS, { s: GRAPHS.clrsBfs.source });
      const values = {};
      let text;
      if (v.algo === "bfs") {
        values.order = join(res.order);
        for (const x of g.nodes) values[`dist.${x}`] = dist(res.dist[x]);
        values.levels = res.levels.map(join).join(" | ");
        text = `BFS from ${source} visits ${values.order}.`;
      } else if (v.algo === "dfs") {
        values.order = join(res.order);
        for (const x of g.nodes) { values[`d.${x}`] = res.d[x]; values[`f.${x}`] = res.f[x]; }
        for (const k of ["tree", "back", "forward", "cross"]) values[k] = Object.values(res.kind).filter((x) => x === k).length;
        text = `DFS (from the alphabetically first unvisited vertex) visits ${values.order}; ${values.tree} tree, ${values.back} back, ${values.forward} forward and ${values.cross} cross edges.`;
      } else if (v.algo === "components") {
        values.count = res.count; values.groups = res.groups.map((x) => `{${join(x)}}`).join(" ");
        text = `${res.count} connected component${res.count === 1 ? "" : "s"}: ${values.groups}.`;
      } else if (v.algo === "cycle") {
        values.hasCycle = res.hasCycle;
        if (res.cycle) values.cycle = join(res.cycle);
        text = res.hasCycle ? `There is a cycle: ${values.cycle}.` : "There is no cycle.";
      } else if (v.algo === "bipartite") {
        values.bipartite = res.bipartite;
        text = res.bipartite ? `Bipartite: {${join(res.L)}} and {${join(res.R)}}.` : `Not bipartite: odd cycle ${join(res.oddCycle)}.`;
      } else {
        values.isDag = res.ok;
        if (res.ok) { values.order = join(res.order); values.orderings = countOrderings(g); }
        text = res.ok ? `Topological order: ${values.order} (one of ${values.orderings} possible orderings).` : "The graph has a cycle, so there is no topological order.";
      }
      return { text, values };
    },
  }),

  tool("minimum-spanning-tree", {
    keywords: "mst minimum spanning tree kruskal prim greedy cut property union find total weight spanning forest",
    params: graphParams("clrsMst", MSTS, "kruskal"),
    answers: { total: "total weight of the tree", edges: "tree edges in the order they are added, like a-b", "edge.3": "the 3rd edge added (edge.1, edge.2, ...)", count: "number of tree edges", connected: "whether the graph is connected (otherwise a spanning forest)", order: "prim: order vertices join the tree" },
    examples: [
      { request: "Kruskal's MST on A-B 4, A-C 1, B-C 2, B-D 5, C-D 8, D-E 3: total weight?", params: { algo: "kruskal", g: "A B 4;A C 1;B C 2;B D 5;C D 8;D E 3", dir: false } },
      { request: "Prim's algorithm from a on the CLRS graph: which order do vertices join?", params: { algo: "prim", s: "a" } },
    ],
    validate(v) {
      const { g, res } = loadGraph(v, MSTS, { s: GRAPHS.clrsMst.source });
      const byId = new Map(g.edges.map((e) => [e.id, e]));
      const edges = res.tree.map((id) => { const e = byId.get(id); return e ? `${e.from}-${e.to}` : id.replace(">", "-"); });
      const values = { total: res.weight, edges: join(edges), count: edges.length, connected: res.connected };
      edges.forEach((e, i) => { values[`edge.${i + 1}`] = e; });
      if (res.order) values.order = join(res.order);
      return { text: `${plain(MSTS[v.algo].name)}: total weight ${res.weight} using ${join(edges)}${res.connected ? "" : " (the graph is not connected)"}.`, values };
    },
  }),

  tool("shortest-paths", {
    keywords: "shortest path dijkstra bellman ford floyd warshall all pairs single source relaxation negative edge negative cycle distance priority queue",
    params: graphParams("clrsDijkstra", PATHS, "dijkstra", { target: true }),
    answers: { "dist.v": "shortest distance from the start to v (one key per vertex; ∞ if unreachable)", path: "shortest path to t, vertices separated by spaces", pathCost: "length of that path", order: "dijkstra: order vertices are made final", relaxations: "dijkstra: times some d[v] is lowered", negativeCycle: "bellman, floyd: whether a negative cycle exists", "d.u.v": "floyd: distance from u to v for every pair" },
    examples: [
      { request: "Dijkstra from s: s-t 10, s-y 5, t-x 1, t-y 2, y-t 3, y-x 9, y-z 2, x-z 4, z-x 6, z-s 7 (directed). Shortest distance to x?", params: { algo: "dijkstra", g: "s t 10;s y 5;t x 1;t y 2;y t 3;y x 9;y z 2;x z 4;z x 6;z s 7", dir: true, s: "s", t: "x" } },
      { request: "Bellman-Ford from A with edges A->B 4, A->C 5, B->C -3, C->D 2", params: { algo: "bellman", g: "A B 4;A C 5;B C -3;C D 2", dir: true, s: "A", t: "D" } },
    ],
    validate(v) {
      const { g, source, target, res } = loadGraph(v, PATHS, { s: GRAPHS.clrsDijkstra.source });
      const values = {};
      const d = v.algo === "floyd" ? res.D[source] : res.dist;
      for (const x of g.nodes) values[`dist.${x}`] = dist(d[x]);
      if (v.algo === "dijkstra") {
        values.order = join(res.order);
        values.relaxations = res.steps.filter((x) => Array.isArray(x.line) && x.line[0] === 6).length;
      } else values.negativeCycle = !!res.negativeCycle;
      if (v.algo === "floyd" && !res.negativeCycle) for (const a of g.nodes) for (const b of g.nodes) values[`d.${a}.${b}`] = dist(res.D[a][b]);
      if (target && res.path) { values.path = join(res.path); values.pathCost = dist(d[target]); }
      if (res.negativeCycle) return { text: `There is a negative cycle (${join(res.negativeCycle)}), so shortest distances are not defined.`, values };
      return { text: `${plain(PATHS[v.algo].name)} from ${source}: ${g.nodes.map((x) => `${x} ${dist(d[x])}`).join(", ")}.${target ? res.path ? ` Path to ${target}: ${values.path}.` : ` ${target} is unreachable.` : ""}`, values };
    },
  }),

  tool("strongly-connected-components", {
    keywords: "scc strongly connected components kosaraju tarjan low link transpose graph condensation dag directed graph",
    params: graphParams("clrsScc", SCCS, "kosaraju"),
    answers: { count: "number of strongly connected components", components: "the components, each in braces", largest: "size of the largest component", dagEdges: "edges in the condensation (component) DAG" },
    examples: [
      { request: "How many strongly connected components: 1->2, 2->3, 3->1, 3->4, 4->5, 5->4?", params: { algo: "kosaraju", g: "1 2;2 3;3 1;3 4;4 5;5 4", dir: true } },
    ],
    validate(v) {
      const { g, res } = loadGraph(v, SCCS, { s: GRAPHS.clrsScc.source });
      const comps = res.comps;
      const values = { count: comps.length, components: comps.map((c) => `{${join(c)}}`).join(" "), largest: Math.max(...comps.map((c) => c.length)), dagEdges: condensation(g, comps).edges.length };
      return { text: `${plain(SCCS[v.algo].name)}: ${comps.length} strongly connected components: ${values.components}.`, values };
    },
  }),

  tool("dynamic-programming", {
    keywords: "dp dynamic programming lcs longest common subsequence edit distance levenshtein 0/1 knapsack coin change matrix chain multiplication mcm parenthesisation lis longest increasing subsequence fibonacci memoisation tabulation",
    params: {
      problem: { type: "enum", values: Object.keys(PROBLEMS), default: "lcs", desc: "lcs, edit (edit distance), knapsack (0/1), coinWays (number of ways), coinMin (fewest coins), mcm (matrix chain), lis, fibMemo, fibTable" },
      a: { type: "string", format: "lcs: string up to 12 characters; edit: string up to 10; lis: 1 to 14 whole numbers from -999 to 999 separated by spaces", desc: "lcs: string A; edit: the source string; lis: the sequence (default depends on the problem)" },
      b: { type: "string", format: "lcs: up to 12 characters; edit: up to 10", desc: "lcs: string B; edit: the target string (default depends on the problem)" },
      w: { type: "string", format: "1 to 7 whole numbers from 1 to 50 separated by spaces", default: PROBLEMS.knapsack.params[0].def, desc: "knapsack: item weights" },
      v: { type: "string", format: "one whole number from 1 to 999 per item, separated by spaces", default: PROBLEMS.knapsack.params[1].def, desc: "knapsack: item values" },
      cap: { type: "int", min: 1, max: 50, default: Number(PROBLEMS.knapsack.params[2].def), desc: "knapsack: capacity" },
      coins: { type: "string", format: "1 to 6 coin values from 1 to 50 separated by spaces", desc: "coinWays, coinMin: the coin values (default depends on the problem)" },
      amount: { type: "int", min: 0, max: 40, desc: "coinWays, coinMin: the amount to make (default depends on the problem)" },
      p: { type: "string", format: "3 to 9 whole numbers from 1 to 99 separated by spaces, p0 p1 ... pn (matrix i is p(i-1) by p(i))", default: PROBLEMS.mcm.params[0].def, desc: "mcm: the dimensions" },
      n: { type: "int", min: 0, max: 30, desc: "fibMemo (0 to 12) or fibTable (1 to 30): which Fibonacci number (default depends on the problem)" },
    },
    answers: { answer: "the optimum: LCS length, edit distance, best knapsack value, number of ways, fewest coins (-1 if impossible), fewest scalar multiplications, LIS length, or fib(n)", detail: "how it is achieved: one LCS, the edits, the items taken, the coins used, the parenthesisation, one LIS, or the call count", calls: "fibMemo: calls made with memoisation", naive: "fibMemo: calls made without memoisation" },
    examples: [
      { request: "LCS length of ABCBDAB and BDCABA", params: { problem: "lcs", a: "ABCBDAB", b: "BDCABA" } },
      { request: "Matrix chain with dimensions 10 x 30, 30 x 5, 5 x 60: fewest scalar multiplications", params: { problem: "mcm", p: "10 30 5 60" } },
    ],
    validate(v) {
      const input = Object.fromEntries(PROBLEMS[v.problem].params.map((q) => [q.key, v[q.key] === undefined ? undefined : String(v[q.key])]));
      const res = dpRun(v.problem, input);
      const values = { answer: res.answer, detail: plain(String(res.detail)) };
      if (v.problem === "fibMemo") { values.calls = res.calls; values.naive = res.naive; }
      return { text: `${plain(PROBLEMS[v.problem].name)}: the answer is ${res.answer} (${plain(String(res.detail))}).`, values };
    },
  }),
];
