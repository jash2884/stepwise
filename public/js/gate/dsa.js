// GATE question generators for data structures and algorithms. Each topic:
// { slug, subject, title, make(r) }. slug is a tool slug; make(r) returns a
// question (see ../gate-questions.js) or null to retry. Every answer comes from
// the same engine the visualiser runs, and replay reopens it on the same input.
import { pick, int, shuffle, query, mcq } from "./kit.js";
import { run as sortRun, afterPasses, ALGORITHMS as SORTS } from "../engines/sorting.js";
import { run as searchRun, binaryProbes } from "../engines/searching.js";
import { toPostfix, evalPostfix, runExpr } from "../engines/stacks.js";
import { run as listRun } from "../engines/lists.js";
import { buildBst, traversal, heightOf } from "../engines/bst.js";
import { AVL } from "../engines/avl.js";
import { Heap, buildSwaps } from "../engines/heap.js";
import { Trie } from "../engines/trie.js";
import { DSU } from "../engines/unionfind.js";
import { build, parseGraph, randomGraph } from "../engines/graph.js";
import { bfs, dfs, kahn } from "../engines/traversal.js";
import { kruskal, prim } from "../engines/mst.js";
import { dijkstra, bellmanFord } from "../engines/paths.js";
import { kosaraju, condensation } from "../engines/scc.js";
import { run as dpRun } from "../engines/dp.js";

// --- Small helpers ------------------------------------------------------------------

function distinct(r, n, lo, hi) {
  const out = [];
  while (out.length < n) { const x = int(r, lo, hi); if (!out.includes(x)) out.push(x); }
  return out;
}
const list = (xs) => xs.join(", ");
const ordinal = (k) => `${k}${k % 10 === 1 && k !== 11 ? "st" : k % 10 === 2 && k !== 12 ? "nd" : k % 10 === 3 && k !== 13 ? "rd" : "th"}`;
const graphParam = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean).join(";");
const edgeText = (g, e) => (g.directed ? `${e.from} → ${e.to}` : `(${e.from}, ${e.to})`);
const adjacencyTable = (g) => ({ table: { head: ["Vertex", g.directed ? "Edges out to" : "Neighbours"], rows: g.nodes.map((v) => [v, g.out[v].map((x) => x.v).join(", ") || "none"]) } });
const edgeTable = (g) => ({ table: { head: ["Edge", "Weight"], rows: g.edges.map((e) => [edgeText(g, e), e.w]) } });
// A random graph whose edges all get different weights, so the answer never depends on tie-breaking.
function distinctWeights(r, text, lo = 1) {
  const lines = text.split("\n");
  const weights = shuffle(r, Array.from({ length: lines.length + 4 }, (_, i) => lo + i));
  return lines.map((l, i) => { const t = l.split(" "); return t.length < 2 ? l : `${t[0]} ${t[1]} ${weights[i]}`; }).join("\n");
}

// --- Sorting ------------------------------------------------------------------------

const SIMPLE = ["bubble", "selection", "insertion"];
const PASS_RULE = {
  bubble: "A pass of bubble sort walks from the left and swaps every adjacent pair that is out of order.",
  selection: "A pass of selection sort finds the smallest value in the unsorted part and swaps it to the front of that part.",
  insertion: "A pass of insertion sort takes the next element and inserts it into the sorted prefix to its left.",
};
// Per-pass comparisons, swaps and the array, read off the engine's steps.
function passTable(algo, values) {
  const res = sortRun(algo, values);
  const end = algo === "selection" ? 7 : 6;
  const rows = [];
  let cmp = 0, swaps = 0, lastCmp = 0;
  for (const s of res.steps) {
    cmp += s.comparisons - lastCmp; lastCmp = s.comparisons;
    if (s.swap && s.swap[0] !== s.swap[1] && algo !== "insertion") swaps++;
    if (s.line === end) { rows.push([rows.length + 1, cmp, swaps, s.A.map((x) => x.v).join(" ")]); cmp = 0; swaps = 0; }
  }
  return { res, rows };
}

function sorting(r) {
  const variant = pick(r, ["passes", "count", "count", "stable"]);
  if (variant === "passes") {
    const algo = pick(r, SIMPLE), values = distinct(r, int(r, 7, 8), 1, 99), k = int(r, 2, 3);
    const after = (a, p) => list(afterPasses(a, values, p));
    const right = after(algo, k);
    const m = mcq(r, right, shuffle(r, [...SIMPLE.filter((a) => a !== algo).map((a) => after(a, k)), after(algo, k - 1), after(algo, k + 1), after(algo, k + 2)]));
    if (!m || right === list(values)) return null;
    return {
      topic: "sorting", type: "mcq", marks: 1, ...m,
      stem: [`The array ${list(values)} is sorted into ascending order with ${SORTS[algo].name.toLowerCase()}. ${PASS_RULE[algo]}`, `What does the array look like after the first ${k} passes?`],
      solution: [
        { table: { head: ["After pass", "Array"], rows: Array.from({ length: k }, (_, i) => [i + 1, after(algo, i + 1)]) } },
        `After ${k} passes the array is ${right}.`,
      ],
      replay: query("/sorting", { algo, a: values.join(" ") }),
    };
  }
  if (variant === "count") {
    const algo = pick(r, SIMPLE), values = distinct(r, int(r, 6, 8), 1, 99);
    const ask = algo === "selection" ? "swaps" : algo === "insertion" ? "comparisons" : pick(r, ["swaps", "comparisons"]);
    const { res, rows } = passTable(algo, values);
    const answer = ask === "comparisons" ? res.comparisons : rows.reduce((s, x) => s + x[2], 0);
    if (answer === 0) return null;
    const rule = {
      bubble: "Bubble sort stops early after a pass that makes no swaps.",
      selection: "Selection sort does not swap when the smallest value is already in place.",
      insertion: "Insertion sort compares the key with A[j], A[j − 1], and so on, and stops at the first value that is not larger than the key (or at the front of the array).",
    }[algo];
    return {
      topic: "sorting", type: "nat", marks: 2, answer, tolerance: 0,
      stem: [`The array ${list(values)} is sorted into ascending order with ${SORTS[algo].name.toLowerCase()}. ${rule}`, `How many ${ask === "swaps" ? "swaps" : "comparisons between array elements"} are made in total?`],
      solution: [
        { table: { head: ["Pass", "Comparisons", ...(algo === "insertion" ? [] : ["Swaps"]), "Array after the pass"], rows: rows.map((x) => (algo === "insertion" ? [x[0], x[1], x[3]] : x)) } },
        `Total ${ask}: ${rows.map((x) => (ask === "comparisons" ? x[1] : x[2])).join(" + ")} = ${answer}.${algo === "bubble" && ask === "swaps" ? " Bubble sort makes one swap per inversion, so this is also the number of inversions." : ""}`,
      ],
      replay: query("/sorting", { algo, a: values.join(" ") }),
    };
  }
  // Stability on one input: run each sort and see whether equal keys keep their order.
  const n = int(r, 6, 7);
  const values = Array.from({ length: n }, () => int(r, 1, 5));
  const dup = values.filter((v, i) => values.indexOf(v) !== i);
  if (!dup.length) return null;
  const tag = (i) => { const v = values[i], same = values.map((x, j) => (x === v ? j : -1)).filter((j) => j >= 0); return same.length > 1 ? `${v}${"abc"[same.indexOf(i)]}` : String(v); };
  const algos = shuffle(r, ["bubble", "insertion", "merge", "selection", "quick", "heap", "shell"]).slice(0, 4);
  const finals = algos.map((a) => sortRun(a, values).steps.at(-1).A.map((x) => x.id));
  const keeps = finals.map((ids) => ids.every((id, i) => i === 0 || values[ids[i - 1]] !== values[id] || ids[i - 1] < id));
  const answer = keeps.map((k, i) => (k ? i : null)).filter((x) => x !== null);
  if (!answer.length || answer.length === 4) return null;
  return {
    topic: "sorting", type: "msq", marks: 2, options: algos.map((a) => SORTS[a].name), answer,
    stem: [
      `The array below has repeated keys; the letters only tell equal keys apart and are not compared.`,
      values.map((_, i) => tag(i)).join(", "),
      "Each sort is the standard textbook version: quick sort uses the Lomuto partition with the last element as pivot, heap sort uses a max-heap, shell sort uses gaps n/2, n/4, …, 1, and merge sort takes from the left half on ties.",
      "For which of these sorts do the equal keys finish in the same relative order as in the input?",
    ],
    solution: [
      { table: { head: ["Sort", "Sorted output", "Equal keys in order?"], rows: algos.map((a, i) => [SORTS[a].name, finals[i].map(tag).join(", "), keeps[i] ? "yes" : "no"]) } },
      "Bubble, insertion and merge sort are stable, so they always keep equal keys in order. The others are not stable in general, although on a particular input they may happen to keep the order.",
    ],
    replay: query("/sorting", { algo: algos[answer[0]], a: values.join(" ") }),
  };
}

// --- Searching ------------------------------------------------------------------------

function searching(r) {
  const variant = pick(r, ["probes", "sequence", "bound"]);
  if (variant === "bound") {
    const values = Array.from({ length: int(r, 10, 13) }, () => int(r, 1, 20)).sort((a, b) => a - b);
    const algo = pick(r, ["lower", "upper"]);
    const target = r() < 0.75 ? pick(r, values) : int(r, 1, 20);
    const res = searchRun(algo, values, target);
    const mids = res.steps.filter((s) => s.probe != null).map((s) => s.vars.mid);
    return {
      topic: "searching", type: "nat", marks: 1, answer: res.index, tolerance: 0,
      stem: [
        `A sorted array A, indexed from 0, holds ${list(values)}.`,
        `The ${algo} bound search below returns the first index i with A[i] ${algo === "lower" ? "≥" : ">"} key, or n if there is none:`,
        `lo ← 0; hi ← n. While lo < hi: mid ← ⌊(lo + hi) / 2⌋; if A[mid] ${algo === "lower" ? "<" : "≤"} key then lo ← mid + 1, else hi ← mid. Return lo.`,
        `What does it return for key = ${target}?`,
      ],
      solution: [`It probes indices ${list(mids)} and stops with lo = hi = ${res.index}.`, res.index < values.length ? `A[${res.index}] = ${values[res.index]} is the first value ${algo === "lower" ? "≥" : ">"} ${target}.` : `No value is ${algo === "lower" ? "≥" : ">"} ${target}, so it returns n = ${values.length}.`],
      replay: query("/searching", { algo, a: values.join(" "), t: target }),
    };
  }
  const values = distinct(r, int(r, 11, 15), 1, 99).sort((a, b) => a - b);
  const present = r() < 0.6;
  let target = pick(r, values);
  if (!present) { do target = int(r, 1, 99); while (values.includes(target)); }
  const probes = binaryProbes(values, target);
  const res = searchRun("binary", values, target);
  const stem0 = [
    `Binary search runs on the sorted array A below, indexed from 0, looking for ${target}. It sets mid ← ⌊(lo + hi) / 2⌋, compares A[mid] with the key, and moves lo to mid + 1 or hi to mid − 1.`,
    { table: { head: values.map((_, i) => String(i)), rows: [values] } },
  ];
  const sol = [`mid takes the values ${list(probes)}, so the key is compared with ${list(probes.map((i) => values[i]))}.`, res.index >= 0 ? `A[${res.index}] = ${target}: found.` : `The range becomes empty: ${target} is not in the array.`];
  const replay = query("/searching", { algo: "binary", a: values.join(" "), t: target });
  if (variant === "probes") {
    return {
      topic: "searching", type: "nat", marks: 1, answer: res.probes, tolerance: 0,
      stem: [...stem0, `How many elements of A is the key compared with before the search ends?`],
      solution: [...sol, `That is ${res.probes} element${res.probes === 1 ? "" : "s"}.`],
      replay,
    };
  }
  const seq = (t) => list(binaryProbes(values, t).map((i) => values[i]));
  const right = seq(target);
  const others = shuffle(r, [...values, ...values.map((v) => v + 1)]).filter((t) => t !== target).map(seq);
  const m = mcq(r, right, [list([...binaryProbes(values, target).map((i) => values[i])].reverse()), ...others]);
  if (!m) return null;
  return {
    topic: "searching", type: "mcq", marks: 1, ...m,
    stem: [...stem0, "Which sequence of array values is the key compared with, in order?"],
    solution: sol,
    replay,
  };
}

// --- Stacks and queues ------------------------------------------------------------------

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
function exprTree(r, leaves, ops, leaf) {
  if (leaves === 1) return { leaf: leaf() };
  const left = int(r, 1, leaves - 1);
  return { op: pick(r, ops), left: exprTree(r, left, ops, leaf), right: exprTree(r, leaves - left, ops, leaf) };
}
function infixOf(n, parent = null, side = null) {
  if (n.leaf != null) return String(n.leaf);
  const s = `${infixOf(n.left, n, "left")} ${n.op} ${infixOf(n.right, n, "right")}`;
  if (!parent) return s;
  const pc = PREC[n.op], pp = PREC[parent.op];
  const wrap = pc < pp || (pc === pp && (parent.op === "^" ? side === "left" : side === "right"));
  return wrap ? `(${s})` : s;
}

function stacksQueues(r) {
  const variant = pick(r, ["eval", "convert", "depth"]);
  if (variant === "eval") {
    const tree = exprTree(r, int(r, 5, 7), ["+", "-", "*", "*"], () => int(r, 1, 9));
    const post = toPostfix(infixOf(tree));
    const value = evalPostfix(post);
    if (!Number.isInteger(value) || Math.abs(value) > 999) return null;
    const res = runExpr("postfix", post);
    const pushes = res.steps.filter((s) => s.line === 5 && s.vars.result !== undefined).map((s) => s.vars.result);
    return {
      topic: "stacks-queues", type: "nat", marks: 1, answer: value, tolerance: 0,
      stem: ["The following postfix expression is evaluated with a stack. Each operator pops b (the top) and then a, and pushes a op b.", post, "What is the value of the expression?"],
      solution: [`The operators produce, in order: ${list(pushes)}.`, `The last value left on the stack is ${value}.`],
      replay: query("/stacks-queues", { mode: "postfix", in: post }),
    };
  }
  let next = 0;
  const tree = exprTree(r, int(r, 5, 7), ["+", "-", "*", "/", "^"], () => "abcdefgh"[next++]);
  const text = infixOf(tree);
  const right = toPostfix(text);
  const replay = query("/stacks-queues", { mode: "infix", in: text });
  if (variant === "depth") {
    const res = runExpr("infix", text);
    const depth = Math.max(...res.steps.map((s) => s.stack.length));
    if (depth < 2) return null;
    return {
      topic: "stacks-queues", type: "nat", marks: 2, answer: depth, tolerance: 0,
      stem: [
        `The infix expression ${text} is converted to postfix with the usual operator stack. ^ has the highest precedence and is right-associative; * and / come next; + and - are lowest; all but ^ are left-associative. Brackets are pushed onto the stack too.`,
        "What is the largest number of symbols on the stack at any moment during the conversion?",
      ],
      solution: [`The postfix result is ${right}.`, `Tracing the stack, it is deepest (${depth} symbols) at: ${res.steps.find((s) => s.stack.length === depth).stack.map((x) => x.text).join(" ")} (bottom to top).`],
      replay,
    };
  }
  const tokens = text.replace(/[()]/g, "").split(" ");
  let leftToRight = tokens[0];
  for (let i = 1; i < tokens.length; i += 2) leftToRight = `(${leftToRight} ${tokens[i]} ${tokens[i + 1]})`;
  const swapAt = (s) => { const t = s.split(" "), ops = t.map((x, i) => (PREC[x] ? i : -1)).filter((i) => i > 0); if (ops.length < 2) return s; const i = pick(r, ops); if (PREC[t[i - 1]]) return s; [t[i - 1], t[i]] = [t[i], t[i - 1]]; return t.join(" "); };
  const m = mcq(r, right, shuffle(r, [toPostfix(tokens.join(" ")), toPostfix(leftToRight), swapAt(right), swapAt(right), toPostfix(text.replace(/\^/g, "*"))].filter((s) => s.split(" ").length === right.split(" ").length)));
  if (!m) return null;
  return {
    topic: "stacks-queues", type: "mcq", marks: 1, ...m,
    stem: [`What is the postfix form of the infix expression ${text}? ^ has the highest precedence and is right-associative; * and / come next; + and - are lowest and, like * and /, left-associative.`],
    solution: [`Operands go straight to the output; an operator first pops every operator on the stack that binds at least as tightly (strictly more tightly for the right-associative ^).`, `Result: ${right}.`],
    replay,
  };
}

// --- Linked lists -----------------------------------------------------------------------

function floydRows(steps) {
  const rows = [];
  for (const s of steps) {
    if (s.note.startsWith("fast →")) rows.push([rows.length + 1, s.vars.slow, s.vars.fast]);
    if (s.meet != null) break;
  }
  return rows;
}
function linkedList(r) {
  const n = int(r, 6, 10), values = distinct(r, n, 1, 99), cycleAt = int(r, 0, n - 2);
  const res = listRun({ kind: "s", values, op: "floyd", cycleAt });
  const meet = values[res.steps.find((s) => s.meet != null).meet];
  const stem = [
    `A singly linked list holds ${values.join(" → ")}, and the last node's next pointer goes back to the node holding ${values[cycleAt]} (position ${cycleAt}, counting the head as 0).`,
    "Floyd's cycle detection starts slow and fast at the head. In each step slow moves one node and fast moves two, and then they are compared.",
  ];
  const sol = [
    { table: { head: ["Step", "slow", "fast"], rows: floydRows(res.steps) } },
    `They first meet at ${meet} after ${res.meetAfter} step${res.meetAfter === 1 ? "" : "s"}.`,
  ];
  const replay = query("/linked-list", { kind: "s", op: "floyd", a: values.join(" "), cycle: cycleAt });
  if (r() < 0.5) {
    return { topic: "linked-list", type: "nat", marks: 2, answer: res.meetAfter, tolerance: 0, stem: [...stem, "After how many steps do slow and fast first point to the same node?"], solution: sol, replay };
  }
  const m = mcq(r, meet, shuffle(r, values.filter((v) => v !== meet)));
  return { topic: "linked-list", type: "mcq", marks: 2, ...m, stem: [...stem, "At which node do slow and fast first meet?"], solution: sol, replay };
}

// --- Binary search trees ------------------------------------------------------------------

const TRAV = { preorder: "pre-order", inorder: "in-order", postorder: "post-order", levelorder: "level-order" };
const bstOps = (keys, extra = []) => [...keys.map((k) => `i${k}`), ...extra].join(",");
function binarySearchTree(r) {
  const keys = distinct(r, int(r, 8, 10), 1, 99);
  const t = buildBst(keys);
  const variant = pick(r, ["traversal", "delete", "height"]);
  const base = `The keys ${list(keys)} are inserted in that order into an empty binary search tree.`;
  if (variant === "traversal") {
    const kind = pick(r, ["preorder", "postorder", "levelorder"]);
    const right = list(traversal(t.root, kind));
    const m = mcq(r, right, shuffle(r, ["preorder", "postorder", "levelorder", "inorder"].filter((k) => k !== kind).map((k) => list(traversal(t.root, k)))).concat(list(keys), list([...traversal(t.root, kind)].reverse())));
    if (!m) return null;
    return {
      topic: "binary-search-tree", type: "mcq", marks: 1, ...m,
      stem: [base, `What is the ${TRAV[kind]} traversal of the tree?`],
      solution: [`The root is ${keys[0]}. ${Object.entries(TRAV).map(([k, name]) => `${name[0].toUpperCase()}${name.slice(1)}: ${list(traversal(t.root, k))}.`).join(" ")}`],
      replay: query("/binary-search-tree", { ops: bstOps(keys), q: kind }),
    };
  }
  if (variant === "height") {
    const answer = heightOf(t.root);
    const levels = [];
    (function walk(x, d) { if (!x) return; (levels[d] ??= []).push(x.key); walk(x.left, d + 1); walk(x.right, d + 1); })(t.root, 0);
    return {
      topic: "binary-search-tree", type: "nat", marks: 1, answer, tolerance: 0,
      stem: [base, "What is the height of the tree? The height of a tree with a single node is 0."],
      solution: [{ table: { head: ["Depth", "Keys"], rows: levels.map((ks, d) => [d, list(ks.sort((a, b) => a - b))]) } }, `The deepest key is at depth ${answer}, so the height is ${answer}.`],
      replay: query("/binary-search-tree", { ops: bstOps(keys), q: "height" }),
    };
  }
  const two = [];
  (function walk(x) { if (!x) return; if (x.left && x.right) two.push(x.key); walk(x.left); walk(x.right); })(t.root);
  if (!two.length) return null;
  const k = pick(r, two);
  const after = buildBst(keys); after.delete(k);
  const right = list(traversal(after.root, "preorder"));
  // The same delete done with the in-order predecessor instead: a common slip.
  let z = t.root;
  while (z.key !== k) z = k < z.key ? z.left : z.right;
  const pred = Math.max(...traversal(z.left, "inorder"));
  const viaPred = list(traversal(buildBst(keys.filter((x) => x !== pred).map((x) => (x === k ? pred : x))).root, "preorder"));
  const m = mcq(r, right, [viaPred, list(traversal(t.root, "preorder")), list(traversal(after.root, "levelorder")), list(traversal(after.root, "postorder"))]);
  if (!m) return null;
  return {
    topic: "binary-search-tree", type: "mcq", marks: 2, ...m,
    stem: [base, `Then ${k} is deleted. A node with two children is replaced by its in-order successor. What is the pre-order traversal of the resulting tree?`],
    solution: [`${k} has two children. Its in-order successor is the smallest key in its right subtree, which moves up into its place.`, `Pre-order afterwards: ${right}.`],
    replay: query("/binary-search-tree", { ops: bstOps(keys, [`d${k}`]), q: "preorder" }),
  };
}

// --- AVL trees ----------------------------------------------------------------------------

const ROTATION = { LL: "LL: a single right rotation", RR: "RR: a single left rotation", LR: "LR: a left rotation, then a right rotation", RL: "RL: a right rotation, then a left rotation" };
function avlTree(r) {
  const keys = distinct(r, int(r, 6, 9), 1, 99);
  const t = new AVL();
  const cases = keys.map((k) => t.insert(k).filter((s) => s.vars?.case).map((s) => s.vars.case));
  const variant = pick(r, ["case", "root", "rotations"]);
  const base = `The keys ${list(keys)} are inserted in that order into an empty AVL tree, rebalancing after every insertion.`;
  const replay = query("/avl-tree", { ops: keys.map((k) => `i${k}`).join(",") });
  const caseRows = keys.map((k, i) => [k, cases[i].length ? cases[i].join(", ") : "none"]);
  if (variant === "case") {
    const last = keys.length - 1;
    if (cases[last].length !== 1) return null;
    const options = ["LL", "RR", "LR", "RL"].map((c) => ROTATION[c]);
    return {
      topic: "avl-tree", type: "mcq", marks: 2, options, answer: ["LL", "RR", "LR", "RL"].indexOf(cases[last][0]),
      stem: [base, `Which rotation does the last insertion, of ${keys[last]}, cause?`],
      solution: [{ table: { head: ["Insert", "Rotation"], rows: caseRows } }, `Inserting ${keys[last]} unbalances the tree: case ${cases[last][0]}, fixed by ${ROTATION[cases[last][0]].split(": ")[1]}.`],
      replay,
    };
  }
  if (variant === "root") {
    const root = t.root.key;
    const m = mcq(r, root, shuffle(r, [keys[0], ...keys.filter((k) => k !== root)]));
    if (!cases.some((c) => c.length)) return null;
    return {
      topic: "avl-tree", type: "mcq", marks: 1, ...m,
      stem: [base, "Which key is at the root of the final tree?"],
      solution: [{ table: { head: ["Insert", "Rotation"], rows: caseRows } }, `After all the rotations the root is ${root}, and the tree has height ${t.height()} (a single node has height 0). Pre-order: ${list(traversal(t.root, "preorder"))}.`],
      replay,
    };
  }
  const total = cases.flat().reduce((s, c) => s + (c.length === 2 && c[0] === c[1] ? 1 : 2), 0);
  if (!total) return null;
  return {
    topic: "avl-tree", type: "nat", marks: 2, answer: total, tolerance: 0,
    stem: [base, "How many single rotations are performed in total? A double rotation (LR or RL) counts as two."],
    solution: [{ table: { head: ["Insert", "Rotation"], rows: caseRows } }, `${cases.flat().map((c) => `${c} = ${c[0] === c[1] ? 1 : 2}`).join(", ")}: ${total} rotations in all.`],
    replay,
  };
}

// --- Binary heaps --------------------------------------------------------------------------

function binaryHeap(r) {
  const kind = pick(r, ["max", "min"]);
  const values = distinct(r, int(r, 7, 9), 1, 99);
  const variant = pick(r, ["inserts", "extract", "swaps"]);
  const word = kind === "max" ? "max-heap" : "min-heap";
  const arr = (hp) => list(hp.values());
  if (variant === "swaps") {
    const res = buildSwaps(values, kind, "floyd");
    if (!res.swaps) return null;
    return {
      topic: "binary-heap", type: "nat", marks: 2, answer: res.swaps, tolerance: 0,
      stem: [`The array ${list(values)} is turned into a ${word} in place with the bottom-up build-heap method (sift down every non-leaf, from the last one back to the root).`, "How many swaps does it make?"],
      solution: [`Sifting down indices ${Math.floor(values.length / 2) - 1} to 0 makes ${res.swaps} swap${res.swaps === 1 ? "" : "s"}.`, `The heap is ${list(res.result)}.`],
      replay: query("/binary-heap", { kind, ops: `f${values.join(".")}` }),
    };
  }
  if (variant === "inserts") {
    const hp = new Heap(kind); hp.build(values, "inserts");
    const right = arr(hp);
    const floyd = new Heap(kind); floyd.build(values, "floyd");
    const sorted = [...values].sort((a, b) => (kind === "max" ? b - a : a - b));
    const m = mcq(r, right, [arr(floyd), list(sorted), list(values), list([sorted[0], ...values.filter((v) => v !== sorted[0])])]);
    if (!m) return null;
    return {
      topic: "binary-heap", type: "mcq", marks: 1, ...m,
      stem: [`The keys ${list(values)} are inserted one at a time, in that order, into an initially empty binary ${word} stored in an array. Which array results?`],
      solution: [`Each key joins as the last leaf and sifts up while it beats its parent. The final array is ${right}.`, arr(floyd) === right ? "Here the bottom-up build-heap method happens to give the same array." : `The bottom-up build-heap method would give ${arr(floyd)} instead.`],
      replay: query("/binary-heap", { kind, ops: `r${values.join(".")}` }),
    };
  }
  const k = int(r, 1, 2);
  const hp = new Heap(kind); hp.build(values, "floyd");
  const built = arr(hp);
  for (let i = 0; i < k; i++) hp.extract();
  const right = arr(hp);
  const alt = new Heap(kind); alt.build(values, "inserts"); for (let i = 0; i < k; i++) alt.extract();
  const alt2 = new Heap(kind); alt2.build(values, "floyd"); for (let i = 0; i < k - 1; i++) alt2.extract();
  const naive = list([...values].sort((a, b) => (kind === "max" ? b - a : a - b)).slice(k));
  const m = mcq(r, right, [arr(alt), k > 1 ? arr(alt2) : built, naive, list(built.split(", ").slice(k))]);
  if (!m) return null;
  return {
    topic: "binary-heap", type: "mcq", marks: 2, ...m,
    stem: [`The array ${list(values)} is turned into a ${word} with the bottom-up build-heap method. Then the ${kind === "max" ? "maximum" : "minimum"} is extracted ${k === 1 ? "once" : "twice"} (the last element moves to the root and sifts down). What is the array afterwards?`],
    solution: [`Build-heap gives ${built}.`, `After ${k === 1 ? "one extraction" : "two extractions"}: ${right}.`],
    replay: query("/binary-heap", { kind, ops: [`f${values.join(".")}`, ...Array(k).fill("x")].join(",") }),
  };
}

// --- Tries ---------------------------------------------------------------------------------

const WORDS = ["car", "card", "care", "cart", "cat", "cab", "do", "dog", "dot", "dove", "tea", "ten", "tend", "team", "tree", "trie", "try", "to", "toy", "bat", "bad", "ban", "band"];
function trie(r) {
  const words = shuffle(r, WORDS).slice(0, int(r, 5, 7));
  const t = new Trie();
  for (const w of words) t.insert(w);
  const nodes = t.size();
  const ops = words.map((w) => `i${w}`);
  if (r() < 0.5) {
    return {
      topic: "trie", type: "nat", marks: 1, answer: nodes, tolerance: 0,
      stem: [`The words ${list(words)} are inserted into an empty trie with one node per prefix. How many nodes does the trie have, counting the root?`],
      solution: [`Every distinct prefix (including the empty one at the root) is one node. The words have ${nodes - 1} distinct non-empty prefixes, so there are ${nodes} nodes.`],
      replay: query("/trie", { ops: ops.join(",") }),
    };
  }
  const w = pick(r, words);
  t.delete(w);
  const left = t.size();
  return {
    topic: "trie", type: "nat", marks: 2, answer: left, tolerance: 0,
    stem: [`The words ${list(words)} are inserted into an empty trie with one node per prefix. Then ${w} is deleted, and any node that no longer leads to a word is removed. How many nodes are left, counting the root?`],
    solution: [`Before the delete there are ${nodes} nodes. Deleting ${w} clears its end mark and removes ${nodes - left} node${nodes - left === 1 ? "" : "s"} that no other word needs, leaving ${left}.`],
    replay: query("/trie", { ops: [...ops, `d${w}`].join(",") }),
  };
}

// --- Union-find ------------------------------------------------------------------------------

const UF = [["rank", true], ["rank", false], ["size", true], ["size", false], ["naive", false], ["naive", true]];
const ufName = (mode, pc) => `${mode === "naive" ? "naive union" : `union by ${mode}`}${pc ? " with path compression" : ""}`;
function unionFind(r) {
  const n = 8;
  const ops = [];
  for (let i = 0, m = int(r, 5, 7); i < m; i++) { const a = int(r, 0, n - 1); let b = int(r, 0, n - 1); while (b === a) b = int(r, 0, n - 1); ops.push(["u", a, b]); }
  if (r() < 0.6) ops.splice(int(r, 2, ops.length), 0, ["f", int(r, 0, n - 1)]);
  const runWith = (mode, pc) => { const d = new DSU(n, { mode, compress: pc }); d.record = false; for (const o of ops) (o[0] === "u" ? d.union(o[1], o[2]) : d.find(o[1])); return d; };
  const parentQ = r() < 0.6;
  const [mode, pc] = pick(r, parentQ ? UF.slice(0, 4) : UF);
  const d = runWith(mode, pc);
  const opText = ops.map((o) => (o[0] === "u" ? `union(${o[1]}, ${o[2]})` : `find(${o[1]})`)).join(", ");
  const rule = mode === "naive" ? "union(a, b) makes the root of a's tree a child of the root of b's tree." : `union(a, b) finds the roots ra and rb and hangs the root with the smaller ${mode} under the other; on a tie, rb goes under ra${mode === "rank" ? " and ra's rank goes up by one" : ""}.`;
  const base = [`Eight elements 0 to 7 start in separate sets, with parent[i] = i. These operations run in order: ${opText}.`, `${ufName(mode, pc)[0].toUpperCase()}${ufName(mode, pc).slice(1)} is used: ${rule}${pc ? " Every find (including the two inside a union) makes each node on its path point straight at the root." : " There is no path compression."}`];
  const replay = query("/union-find", { n, mode, pc: pc ? 1 : 0, ops: ops.map((o) => (o[0] === "u" ? `u${o[1]}-${o[2]}` : `f${o[1]}`)).join(",") });
  if (parentQ) {
    const right = list(d.parent);
    const m = mcq(r, right, shuffle(r, UF.filter(([a, b]) => a !== mode || b !== pc).map(([a, b]) => list(runWith(a, b).parent))));
    if (!m) return null;
    return {
      topic: "union-find", type: "mcq", marks: 2, ...m,
      stem: [...base, "What is the parent array, parent[0] to parent[7], at the end?"],
      solution: [{ table: { head: ["i", ...d.parent.map((_, i) => String(i))], rows: [["parent[i]", ...d.parent]] } }, `The sets are ${d.sets().map((s) => `{${list(s)}}`).join(", ")}.`],
      replay,
    };
  }
  const height = d.height();
  if (!height) return null;
  return {
    topic: "union-find", type: "nat", marks: 2, answer: height, tolerance: 0,
    stem: [...base, "At the end, what is the height of the tallest tree (the most parent pointers followed from any element to its root)?"],
    solution: [{ table: { head: ["i", ...d.parent.map((_, i) => String(i))], rows: [["parent[i]", ...d.parent]] } }, `Following parent pointers, the longest path to a root has ${height} hop${height === 1 ? "" : "s"}.`],
    replay,
  };
}

// --- Graph traversal ---------------------------------------------------------------------------

// The order the engine's BFS or DFS produces when neighbours are taken in the
// order they appear in `order`: a sequence is a valid traversal exactly when
// this reproduces it.
function traversalFollowing(g, order, kind) {
  const name = Object.fromEntries(order.map((v, i) => [v, `n${i}`]));
  const back = Object.fromEntries(order.map((v, i) => [`n${i}`, v]));
  const h = build(order.map((v) => name[v]), g.edges.map((e) => ({ ...e, from: name[e.from], to: name[e.to], id: `${name[e.from]}>${name[e.to]}` })), g.directed);
  return (kind === "bfs" ? bfs(h, name[order[0]]) : dfs(h)).order.map((x) => back[x]);
}
function graphTraversal(r) {
  const variant = pick(r, ["valid", "valid", "dfs-times", "topo-count", "topo-valid"]);
  if (variant === "valid") {
    const n = int(r, 6, 7);
    const text = randomGraph(r, { n, directed: false, weighted: false, extra: int(r, 2, 4) });
    const g = parseGraph(text);
    const kind = pick(r, ["bfs", "dfs"]);
    // DFS starts from the alphabetically first vertex, as the visualiser's does, so the replay matches.
    const s = kind === "bfs" ? pick(r, g.nodes) : g.nodes[0];
    const valid = (o) => traversalFollowing(g, o, kind).join() === o.join();
    const pool = new Set();
    for (let i = 0; i < 6; i++) pool.add(traversalFollowing(g, [s, ...shuffle(r, g.nodes.filter((v) => v !== s))], kind).join(", "));
    for (let i = 0; i < 6; i++) pool.add(traversalFollowing(g, [s, ...shuffle(r, g.nodes.filter((v) => v !== s))], kind === "bfs" ? "dfs" : "bfs").join(", "));
    for (let i = 0; i < 6; i++) { const o = [s, ...shuffle(r, g.nodes.filter((v) => v !== s))]; pool.add(o.join(", ")); }
    const all = [...pool].map((t) => ({ t, ok: valid(t.split(", ")) }));
    const good = shuffle(r, all.filter((x) => x.ok)), bad = shuffle(r, all.filter((x) => !x.ok));
    const k = int(r, 1, 3);
    if (good.length < k || bad.length < 4 - k) return null;
    const chosen = shuffle(r, [...good.slice(0, k), ...bad.slice(0, 4 - k)]);
    const name = kind === "bfs" ? "breadth-first" : "depth-first";
    return {
      topic: "graph-traversal", type: "msq", marks: 2, options: chosen.map((x) => x.t), answer: chosen.map((x, i) => (x.ok ? i : null)).filter((x) => x !== null),
      stem: ["Consider the undirected graph below, given as adjacency lists.", adjacencyTable(g), `Which of the following are possible ${name} search visit orders starting from ${s}? Neighbours may be explored in any order.`],
      solution: [
        `A sequence is a valid ${kind.toUpperCase()} order exactly when running ${kind.toUpperCase()} with each vertex's neighbours taken in the order they appear in that sequence reproduces it.`,
        ...chosen.map((x) => (x.ok ? `${x.t}: valid.` : `${x.t}: not valid; following it, ${kind.toUpperCase()} would visit ${traversalFollowing(g, x.t.split(", "), kind).join(", ")}.`)),
      ],
      replay: query("/graph-traversal", { algo: kind, g: graphParam(text), dir: 0, ...(kind === "bfs" ? { s } : {}) }),
    };
  }
  if (variant === "dfs-times") {
    const n = int(r, 6, 7);
    const text = randomGraph(r, { n, directed: true, weighted: false, extra: int(r, 3, 5) });
    const g = parseGraph(text, { directed: true });
    const res = dfs(g);
    const ask = pick(r, ["back", "cross", "forward", "d", "f"]);
    const counts = ["tree", "back", "forward", "cross"].map((k) => [k, Object.values(res.kind).filter((x) => x === k).length]);
    const v = pick(r, g.nodes);
    const answer = ask === "d" ? res.d[v] : ask === "f" ? res.f[v] : counts.find(([k]) => k === ask)[1];
    return {
      topic: "graph-traversal", type: "nat", marks: 2, answer, tolerance: 0,
      stem: [
        "Depth-first search runs on the directed graph below. The outer loop tries the vertices in alphabetical order, and each vertex's out-neighbours are explored in alphabetical order. The clock starts at 0 and goes up by one at every discovery and every finish, so the first vertex is discovered at time 1.",
        adjacencyTable(g),
        ask === "d" ? `What is the discovery time of ${v}?` : ask === "f" ? `What is the finish time of ${v}?` : `How many ${ask} edges does the search find?`,
      ],
      solution: [
        { table: { head: ["Vertex", "Discovery d", "Finish f"], rows: g.nodes.map((x) => [x, res.d[x], res.f[x]]) } },
        `Edges: ${counts.map(([k, c]) => `${c} ${k}`).join(", ")}.${["back", "cross", "forward"].includes(ask) ? ` The ${ask} edges are ${g.edges.filter((e) => res.kind[e.id] === ask).map((e) => edgeText(g, e)).join(", ") || "none"}.` : ""}`,
      ],
      replay: query("/graph-traversal", { algo: "dfs", g: graphParam(text), dir: 1 }),
    };
  }
  const n = int(r, 5, 6);
  const text = randomGraph(r, { n, directed: true, dag: true, weighted: false, extra: int(r, 1, 3) });
  const g = parseGraph(text, { directed: true });
  const ok = (o) => g.edges.every((e) => o.indexOf(e.from) < o.indexOf(e.to));
  const replay = query("/graph-traversal", { algo: "kahn", g: graphParam(text), dir: 1 });
  const kahnOrder = kahn(g).order;
  if (variant === "topo-count") {
    // Count orders by choosing, at each point, any vertex whose in-edges all come from placed vertices.
    const memo = new Map();
    const count = (placed) => {
      if (placed.size === g.nodes.length) return 1;
      const key = [...placed].sort().join();
      if (memo.has(key)) return memo.get(key);
      let c = 0;
      for (const v of g.nodes) if (!placed.has(v) && g.inn[v].every((x) => placed.has(x.v))) c += count(new Set([...placed, v]));
      memo.set(key, c);
      return c;
    };
    const answer = count(new Set());
    if (answer < 2) return null;
    return {
      topic: "graph-traversal", type: "nat", marks: 2, answer, tolerance: 0,
      stem: ["How many different topological orderings does the directed acyclic graph below have?", adjacencyTable(g)],
      solution: [`One ordering, from Kahn's algorithm, is ${list(kahnOrder)}.`, `Building an ordering one vertex at a time, any vertex whose incoming edges all come from vertices already placed can go next. Counting every such choice gives ${answer} orderings.`],
      replay,
    };
  }
  const cands = new Set([list(kahnOrder)]);
  for (let i = 0; i < 30 && cands.size < 12; i++) cands.add(list(shuffle(r, g.nodes)));
  const all = [...cands].map((t) => ({ t, ok: ok(t.split(", ")) }));
  const good = all.filter((x) => x.ok), bad = shuffle(r, all.filter((x) => !x.ok));
  const k = Math.min(good.length, int(r, 1, 2));
  if (bad.length < 4 - k) return null;
  const chosen = shuffle(r, [...good.slice(0, k), ...bad.slice(0, 4 - k)]);
  return {
    topic: "graph-traversal", type: "msq", marks: 1, options: chosen.map((x) => x.t), answer: chosen.map((x, i) => (x.ok ? i : null)).filter((x) => x !== null),
    stem: ["Consider the directed acyclic graph below.", adjacencyTable(g), "Which of the following are valid topological orderings?"],
    solution: chosen.map((x) => {
      if (x.ok) return `${x.t}: valid, every edge goes from left to right.`;
      const o = x.t.split(", "), e = g.edges.find((y) => o.indexOf(y.from) > o.indexOf(y.to));
      return `${x.t}: not valid, the edge ${edgeText(g, e)} goes backwards.`;
    }),
    replay,
  };
}

// --- Minimum spanning trees ----------------------------------------------------------------------

function minimumSpanningTree(r) {
  const n = int(r, 6, 7);
  const text = distinctWeights(r, randomGraph(r, { n, directed: false, extra: int(r, 3, 5) }));
  const g = parseGraph(text);
  const res = kruskal(g);
  const label = (id) => { const e = g.edges.find((x) => x.id === id); return `(${e.from}, ${e.to}) weight ${e.w}`; };
  const variant = pick(r, ["weight", "prim", "kruskal", "which"]);
  const base = ["Consider the weighted undirected graph below.", edgeTable(g)];
  const tree = res.tree.map(label);
  if (variant === "weight") {
    return {
      topic: "minimum-spanning-tree", type: "nat", marks: 1, answer: res.weight, tolerance: 0,
      stem: [...base, "What is the total weight of its minimum spanning tree?"],
      solution: [`Kruskal's algorithm takes the edges in increasing weight, skipping any that would close a cycle: ${list(tree)}.`, `Total weight = ${res.tree.map((id) => g.edges.find((x) => x.id === id).w).join(" + ")} = ${res.weight}.`],
      replay: query("/minimum-spanning-tree", { algo: "kruskal", g: graphParam(text), dir: 0 }),
    };
  }
  const nonTree = g.edges.filter((e) => !res.tree.includes(e.id)).map((e) => label(e.id));
  if (variant === "which") {
    const inTree = shuffle(r, tree), out = shuffle(r, nonTree);
    const k = int(r, 1, 3);
    if (out.length < 4 - k) return null;
    const chosen = shuffle(r, [...inTree.slice(0, k), ...out.slice(0, 4 - k)]);
    return {
      topic: "minimum-spanning-tree", type: "msq", marks: 2, options: chosen, answer: chosen.map((x, i) => (tree.includes(x) ? i : null)).filter((x) => x !== null),
      stem: [...base, "Which of the following edges are in the minimum spanning tree? (All weights are different, so it is unique.)"],
      solution: [`Kruskal's algorithm picks ${list(tree)}, total weight ${res.weight}.`, "Every other edge would close a cycle in which it is the heaviest edge."],
      replay: query("/minimum-spanning-tree", { algo: "kruskal", g: graphParam(text), dir: 0 }),
    };
  }
  if (variant === "kruskal") {
    const k = int(r, 3, n - 1);
    const right = tree[k - 1];
    const m = mcq(r, right, shuffle(r, [...tree.filter((x) => x !== right), ...nonTree]));
    if (!m) return null;
    return {
      topic: "minimum-spanning-tree", type: "mcq", marks: 1, ...m,
      stem: [...base, `Kruskal's algorithm is run on this graph. Which edge is the ${ordinal(k)} one added to the tree?`],
      solution: [`In order, Kruskal's algorithm adds ${list(tree)}. Edges that would close a cycle are skipped.`, `The ${ordinal(k)} edge added is ${right}.`],
      replay: query("/minimum-spanning-tree", { algo: "kruskal", g: graphParam(text), dir: 0 }),
    };
  }
  const s = pick(r, g.nodes);
  const p = prim(g, s);
  const k = int(r, 2, n - 2);
  const ptree = p.tree.map(label);
  const right = ptree[k - 1];
  const m = mcq(r, right, shuffle(r, [...ptree.filter((x) => x !== right), ...nonTree]));
  if (!m) return null;
  return {
    topic: "minimum-spanning-tree", type: "mcq", marks: 2, ...m,
    stem: [...base, `Prim's algorithm is started from vertex ${s}. Which edge is the ${ordinal(k)} one added to the tree?`],
    solution: [`Prim's grows one tree from ${s}, each time adding the lightest edge leaving it. Vertices join in the order ${list(p.order)}, through the edges ${list(ptree)}.`, `The ${ordinal(k)} edge added is ${right}.`],
    replay: query("/minimum-spanning-tree", { algo: "prim", g: graphParam(text), dir: 0, s }),
  };
}

// --- Shortest paths -------------------------------------------------------------------------------

function shortestPaths(r) {
  const n = int(r, 5, 7);
  const variant = pick(r, ["dist", "order", "relax", "bellman"]);
  const negative = variant === "bellman";
  const text = randomGraph(r, { n, directed: true, extra: int(r, 3, 6), min: 1, max: 9, negative: negative ? 0.3 : 0 });
  const g = parseGraph(text, { directed: true });
  const s = g.nodes[0];
  const algo = negative ? "bellman" : "dijkstra";
  const res = negative ? bellmanFord(g, s) : dijkstra(g, s);
  if (res.negativeCycle) return null;
  if (negative && !g.edges.some((e) => e.w < 0)) return null;
  const reach = g.nodes.filter((v) => v !== s && res.dist[v] < Infinity);
  if (reach.length < 3) return null;
  const t = pick(r, reach);
  const base = [`Consider the weighted directed graph below${negative ? ", which has negative edge weights but no negative cycle" : ""}.`, edgeTable(g)];
  const distTable = { table: { head: ["Vertex", ...g.nodes], rows: [[`d (from ${s})`, ...g.nodes.map((v) => (res.dist[v] === Infinity ? "∞" : res.dist[v]))]] } };
  const replay = query("/shortest-paths", { algo, g: graphParam(text), dir: 1, s, t });
  if (variant === "dist" || variant === "bellman") {
    const path = [];
    for (let x = t; x != null; x = res.prev[x]) path.unshift(x);
    return {
      topic: "shortest-paths", type: "nat", marks: negative ? 2 : 1, answer: res.dist[t], tolerance: 0,
      stem: [...base, `What is the length of the shortest path from ${s} to ${t}?`],
      solution: [`${negative ? "Bellman–Ford" : "Dijkstra's algorithm"} from ${s} gives:`, distTable, `A shortest path is ${path.join(" → ")}, of length ${res.dist[t]}.`],
      replay,
    };
  }
  if (variant === "order") {
    const right = list(res.order);
    const bfsOrder = bfs(g, s).order;
    const cands = [list(bfsOrder)];
    for (let i = 0; i < 10; i++) cands.push(list([s, ...shuffle(r, res.order.slice(1))]));
    const m = mcq(r, right, cands);
    if (!m || res.order.length < 5) return null;
    return {
      topic: "shortest-paths", type: "mcq", marks: 2, ...m,
      stem: [...base, `Dijkstra's algorithm is run from ${s}. In which order are vertices removed from the priority queue (that is, made final)? Ties are broken alphabetically, and vertices that cannot be reached are never removed.`],
      solution: [`Each round removes the unfinished vertex with the smallest tentative distance and relaxes its out-edges. The order is ${right}.`, distTable],
      replay,
    };
  }
  const relaxations = res.steps.filter((x) => Array.isArray(x.line) && x.line[0] === 6).length;
  return {
    topic: "shortest-paths", type: "nat", marks: 2, answer: relaxations, tolerance: 0,
    stem: [...base, `Dijkstra's algorithm is run from ${s}, with ties broken alphabetically. Not counting d[${s}] = 0, how many times is some d[v] lowered (including lowering it from ∞)?`],
    solution: [
      `Vertices are made final in the order ${list(res.order)}. Every out-edge of a vertex is tried once, when that vertex is made final.`,
      `The successful relaxations are: ${res.steps.filter((x) => Array.isArray(x.line) && x.line[0] === 6).map((x) => `d[${x.vars.v}] ← ${x.vars["d[v]"]}`).join(", ")}. That's ${relaxations}.`,
      distTable,
    ],
    replay,
  };
}

// --- Strongly connected components ----------------------------------------------------------------

function stronglyConnectedComponents(r) {
  const n = int(r, 7, 8);
  const text = randomGraph(r, { n, directed: true, weighted: false, extra: int(r, n - 2, n + 1) });
  const g = parseGraph(text, { directed: true });
  const { comps } = kosaraju(g);
  if (comps.length < 2 || comps.length === n) return null;
  const variant = pick(r, ["count", "dag", "largest"]);
  const cond = condensation(g, comps);
  const answer = variant === "count" ? comps.length : variant === "dag" ? cond.edges.length : Math.max(...comps.map((c) => c.length));
  const ask = { count: "How many strongly connected components does it have?", dag: "Each strongly connected component is shrunk to a single vertex, keeping one edge between two components whenever some edge joins them. How many edges does the resulting component graph have?", largest: "How many vertices are in its largest strongly connected component?" }[variant];
  return {
    topic: "strongly-connected-components", type: "nat", marks: variant === "dag" ? 2 : 1, answer, tolerance: 0,
    stem: ["Consider the directed graph below.", adjacencyTable(g), ask],
    solution: [
      `The strongly connected components are ${comps.map((c) => `{${list(c)}}`).join(", ")}: ${comps.length} in all.`,
      variant === "dag" ? `Between components there are ${cond.edges.length} edge${cond.edges.length === 1 ? "" : "s"}: ${cond.edges.map((e) => `{${list(comps[Number(e.from.slice(1)) - 1])}} → {${list(comps[Number(e.to.slice(1)) - 1])}}`).join(", ") || "none"}.` : `Kosaraju's algorithm finds them with one DFS for finish times and a second DFS on the reversed graph in decreasing finish time.`,
    ],
    replay: query("/strongly-connected-components", { algo: "kosaraju", g: graphParam(text), dir: 1 }),
  };
}

// --- Dynamic programming ----------------------------------------------------------------------------

const word = (r, alphabet, n) => Array.from({ length: n }, () => pick(r, alphabet)).join("");
function dynamicProgramming(r) {
  const problem = pick(r, ["lcs", "edit", "knapsack", "mcm"]);
  if (problem === "lcs") {
    const a = word(r, "ABCD", int(r, 6, 8)), b = word(r, "ABCD", int(r, 5, 7));
    const res = dpRun("lcs", { a, b });
    return {
      topic: "dynamic-programming", type: "nat", marks: 1, answer: res.answer, tolerance: 0,
      stem: [`What is the length of the longest common subsequence of ${a} and ${b}?`],
      solution: [`Fill c[i][j] = c[i − 1][j − 1] + 1 when the characters match, otherwise max(c[i − 1][j], c[i][j − 1]).`, { table: { head: ["", ...res.colHeads.slice(1)], rows: res.table.slice(1).map((row, i) => [res.rowHeads[i + 1], ...row.slice(1)]) } }, `The bottom-right cell is ${res.answer}; one longest common subsequence is ${res.detail}.`],
      replay: query("/dynamic-programming", { problem: "lcs", a, b }),
    };
  }
  if (problem === "edit") {
    const a = word(r, "abcd", int(r, 4, 7)), b = word(r, "abcd", int(r, 4, 7));
    if (a === b) return null;
    const res = dpRun("edit", { a, b });
    return {
      topic: "dynamic-programming", type: "nat", marks: 2, answer: res.answer, tolerance: 0,
      stem: [`What is the edit distance from ${a} to ${b}, where inserting, deleting or substituting one character each costs 1?`],
      solution: [`D[i][j] = min(D[i − 1][j] + 1, D[i][j − 1] + 1, D[i − 1][j − 1] + cost), with cost 0 when the characters match.`, { table: { head: ["", "ε", ...res.colHeads.slice(1)], rows: res.table.map((row, i) => [res.rowHeads[i] || "ε", ...row]) } }, `The answer is D[${a.length}][${b.length}] = ${res.answer}. One cheapest edit: ${res.detail}.`],
      replay: query("/dynamic-programming", { problem: "edit", a, b }),
    };
  }
  if (problem === "knapsack") {
    const n = int(r, 4, 5);
    const w = Array.from({ length: n }, () => int(r, 1, 8)), v = Array.from({ length: n }, () => int(r, 2, 30));
    const lo = Math.max(...w) + 1, hi = Math.min(15, w.reduce((s, x) => s + x, 0) - 1);
    if (hi < lo) return null;
    const cap = int(r, lo, hi);
    const res = dpRun("knapsack", { w: w.join(" "), v: v.join(" "), cap: String(cap) });
    return {
      topic: "dynamic-programming", type: "nat", marks: 2, answer: res.answer, tolerance: 0,
      stem: [`A knapsack holds at most ${cap} kg. Each item below can be taken whole or left (0/1 knapsack).`, { table: { head: ["Item", ...w.map((_, i) => String(i + 1))], rows: [["Weight (kg)", ...w], ["Value", ...v]] } }, "What is the largest total value that fits?"],
      solution: [`K[i][c] = max(K[i − 1][c], K[i − 1][c − wᵢ] + vᵢ) when wᵢ ≤ c.`, `K[${n}][${cap}] = ${res.answer}, taking ${res.detail}.`],
      replay: query("/dynamic-programming", { problem: "knapsack", w: w.join(" "), v: v.join(" "), cap }),
    };
  }
  const n = int(r, 4, 5);
  const p = Array.from({ length: n + 1 }, () => 5 * int(r, 1, 8));
  const res = dpRun("mcm", { p: p.join(" ") });
  return {
    topic: "dynamic-programming", type: "nat", marks: 2, answer: res.answer, tolerance: 0,
    stem: [`Matrices ${Array.from({ length: n }, (_, i) => `A${i + 1}`).join(", ")} have dimensions ${Array.from({ length: n }, (_, i) => `${p[i]} × ${p[i + 1]}`).join(", ")}. Multiplying a p × q matrix by a q × r matrix takes pqr scalar multiplications.`, `What is the smallest number of scalar multiplications needed to compute ${Array.from({ length: n }, (_, i) => `A${i + 1}`).join("")}?`],
    solution: [`m[i][j] = min over k of m[i][k] + m[k + 1][j] + p(i − 1)·p(k)·p(j).`, `The minimum is ${res.answer}, with the order ${res.detail}.`],
    replay: query("/dynamic-programming", { problem: "mcm", p: p.join(" ") }),
  };
}

export const TOPICS = [
  { slug: "sorting", subject: "dsa", title: "Sorting", make: sorting },
  { slug: "searching", subject: "dsa", title: "Searching", make: searching },
  { slug: "stacks-queues", subject: "dsa", title: "Stacks and queues", make: stacksQueues },
  { slug: "linked-list", subject: "dsa", title: "Linked lists", make: linkedList },
  { slug: "binary-search-tree", subject: "dsa", title: "Binary search trees", make: binarySearchTree },
  { slug: "avl-tree", subject: "dsa", title: "AVL trees", make: avlTree },
  { slug: "binary-heap", subject: "dsa", title: "Binary heaps", make: binaryHeap },
  { slug: "trie", subject: "dsa", title: "Tries", make: trie },
  { slug: "union-find", subject: "dsa", title: "Union-find", make: unionFind },
  { slug: "graph-traversal", subject: "dsa", title: "Graph traversal", make: graphTraversal },
  { slug: "minimum-spanning-tree", subject: "dsa", title: "Minimum spanning trees", make: minimumSpanningTree },
  { slug: "shortest-paths", subject: "dsa", title: "Shortest paths", make: shortestPaths },
  { slug: "strongly-connected-components", subject: "dsa", title: "Strongly connected components", make: stronglyConnectedComponents },
  { slug: "dynamic-programming", subject: "dsa", title: "Dynamic programming", make: dynamicProgramming },
];
