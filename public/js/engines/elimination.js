// Finite automata → regular expressions by state elimination, and the product
// construction (union, intersection, difference) of two DFAs.
//
// Regular expressions are kept as small trees and simplified as they are built
// (∅ and ε vanish, X X* becomes X+, ε | X becomes X?), so the labels stay
// readable. They print in the syntax regexToNfa reads: | * + ? ( ) and ε.
import { EPS, run } from "./automata.js";

// --- Regular-expression trees ------------------------------------------------------
export const EMPTY = { t: "empty" };
export const EPSILON = { t: "eps" };
export const sym = (v) => ({ t: "sym", v });

export function nullable(r) {
  switch (r.t) {
    case "eps": case "star": return true;
    case "alt": return r.xs.some(nullable);
    case "cat": return r.xs.every(nullable);
    case "plus": return nullable(r.x);
    default: return false;
  }
}

// ctx: 0 = top level or inside |, 1 = a piece of a concatenation, 2 = the operand of * + ?
function render(r, ctx) {
  switch (r.t) {
    case "empty": return "∅";
    case "eps": return "ε";
    case "sym": return r.v;
    case "star": case "plus": {
      const s = `${render(r.x, 2)}${r.t === "star" ? "*" : "+"}`;
      return ctx === 2 ? `(${s})` : s;
    }
    case "cat": {
      const s = r.xs.map((x) => render(x, 1)).join("");
      return ctx === 2 ? `(${s})` : s;
    }
    case "alt": {
      const others = r.xs.filter((x) => x.t !== "eps");
      if (others.length < r.xs.length) {
        const inner = others.length === 1 ? others[0] : { t: "alt", xs: others };
        const s = `${render(inner, 2)}?`;
        return ctx === 2 ? `(${s})` : s;
      }
      const s = others.map((x) => render(x, 0)).join("|");
      return ctx > 0 ? `(${s})` : s;
    }
    default: throw new Error(`Unknown regex node ${r.t}`);
  }
}
export const str = (r) => render(r, 0);

export function alt(...xs) {
  const flat = [];
  for (const x of xs) {
    if (x.t === "empty") continue;
    if (x.t === "alt") flat.push(...x.xs); else flat.push(x);
  }
  const seen = new Set();
  let out = [];
  for (const x of flat) { const k = str(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  // X | X* = X*, and X | X+ = X+.
  const starred = new Set(out.filter((x) => x.t === "star" || x.t === "plus").map((x) => str(x.x)));
  out = out.filter((x) => !starred.has(str(x)));
  // ε is redundant when another term can already be empty.
  if (out.some((x) => x.t === "eps") && out.some((x) => x.t !== "eps" && nullable(x))) out = out.filter((x) => x.t !== "eps");
  if (!out.length) return EMPTY;
  if (out.length === 1) return out[0];
  // Keep ε last so it prints as (…)?.
  return { t: "alt", xs: [...out.filter((x) => x.t !== "eps"), ...out.filter((x) => x.t === "eps")] };
}

export function cat(...xs) {
  const flat = [];
  for (const x of xs) {
    if (x.t === "empty") return EMPTY;
    if (x.t === "eps") continue;
    if (x.t === "cat") flat.push(...x.xs); else flat.push(x);
  }
  const out = [];
  for (const x of flat) {
    const prev = out.at(-1);
    if (prev && x.t === "star") {
      // … X X*  →  … X+   (X may itself be a concatenation)
      const inner = x.x.t === "cat" ? x.x.xs : [x.x];
      const tail = out.slice(-inner.length);
      if (tail.length === inner.length && tail.every((y, i) => str(y) === str(inner[i]))) {
        out.splice(-inner.length, inner.length, plus(x.x));
        continue;
      }
      if (prev.t === "star" && str(prev) === str(x)) continue; // X* X* = X*
    }
    if (prev && prev.t === "star" && str(prev.x) === str(x)) { out[out.length - 1] = plus(x); continue; } // X* X = X+
    out.push(x);
  }
  if (!out.length) return EPSILON;
  if (out.length === 1) return out[0];
  return { t: "cat", xs: out };
}

export function star(x) {
  if (x.t === "empty" || x.t === "eps") return EPSILON;
  if (x.t === "star") return x;
  if (x.t === "plus") return star(x.x);
  if (x.t === "alt") {
    // (ε | X)* = X*, and (X* | Y)* = (X | Y)*.
    const inner = alt(...x.xs.filter((y) => y.t !== "eps").map((y) => (y.t === "star" || y.t === "plus" ? y.x : y)));
    if (inner.t === "empty" || inner.t === "eps") return EPSILON;
    return inner.t === "star" ? inner : { t: "star", x: inner };
  }
  return { t: "star", x };
}

export function plus(x) {
  if (x.t === "empty") return EMPTY;
  if (x.t === "eps") return EPSILON;
  if (x.t === "star" || x.t === "plus") return x;
  if (nullable(x)) return star(x);
  return { t: "plus", x };
}

// --- State elimination -------------------------------------------------------------
export const ELIMINATION_CODE = [
  "add a new start s with s —ε→ q₀",
  "add a new accept f with q —ε→ f for each accepting q",
  "for each state k, in the elimination order",
  "  loop ← R(k, k)  // ∅ if k has no self-loop",
  "  for each i with an edge i → k  (i ≠ k)",
  "    for each j with an edge k → j  (j ≠ k)",
  "      R(i, j) ← R(i, j) | R(i, k) loop* R(k, j)",
  "  delete k and every edge touching it",
  "return R(s, f)  // the only edge left",
];

const fresh = (taken, base) => { let n = base; while (taken.includes(n)) n += "′"; return n; };

// order: an array of states (others follow in their usual order), "greedy"
// (fewest new edges first) or nothing (the order the states were listed in).
export function eliminate(fa, { order = null } = {}) {
  if (fa.states.length > 12) throw new Error("Use at most 12 states: labels grow very quickly as states are eliminated.");
  const S = fresh(fa.states, "s"), F = fresh(fa.states, "f");
  const R = new Map(), k2 = (i, j) => `${i}\u0000${j}`;
  const get = (i, j) => R.get(k2(i, j)) ?? EMPTY;
  const put = (i, j, r) => { if (r.t === "empty") R.delete(k2(i, j)); else R.set(k2(i, j), r); };
  put(S, fa.start, EPSILON);
  for (const q of fa.accept) put(q, F, alt(get(q, F), EPSILON));
  for (const q of fa.states) for (const a of [...fa.alphabet, EPS]) for (const t of fa.next(q, a)) put(q, t, alt(get(q, t), a === EPS ? EPSILON : sym(a)));

  let alive = [S, ...fa.states, F];
  const steps = [];
  const snap = () => ({
    states: [...alive],
    edges: [...R].map(([k, r]) => { const [from, to] = k.split("\u0000"); return { from, to, label: str(r) }; }).filter((e) => alive.includes(e.from) && alive.includes(e.to)),
  });
  const push = (s) => steps.push({ ...snap(), lit: [], ...s });

  push({ line: [1, 2], vars: { s: S, f: F, states: fa.states.length }, lit: [{ from: S, to: fa.start }, ...fa.accept.map((q) => ({ from: q, to: F }))],
    note: `Add a new start state ${S} with an ε-edge to ${fa.start}, and a new accepting state ${F} with ε-edges from ${fa.accept.length ? fa.accept.join(", ") : "nowhere (nothing is accepting)"}. Now no edge enters ${S} and none leaves ${F}, so neither ever needs eliminating. Edges are labelled with regular expressions, not just symbols.` });

  // Which state to eliminate next: the fixed order, or (greedy) the one that
  // creates the fewest new paths right now.
  const inner = () => alive.filter((q) => q !== S && q !== F);
  const pathsThrough = (k) => alive.filter((i) => i !== k && R.has(k2(i, k))).length * alive.filter((j) => j !== k && R.has(k2(k, j))).length;
  let wanted = null;
  if (Array.isArray(order)) {
    for (const q of order) if (!fa.states.includes(q)) throw new Error(`"${q}" in the elimination order isn't a state.`);
    if (new Set(order).size !== order.length) throw new Error("A state appears twice in the elimination order.");
    wanted = [...order, ...fa.states.filter((q) => !order.includes(q))];
  } else if (order !== "greedy") wanted = [...fa.states];
  const used = [];
  while (inner().length) {
    const k = wanted ? wanted[used.length] : inner().reduce((best, q) => (pathsThrough(q) < pathsThrough(best) ? q : best));
    used.push(k);
    const loop = get(k, k), loopS = str(loop), round = used.length;
    const preds = alive.filter((i) => i !== k && R.has(k2(i, k))), succs = alive.filter((j) => j !== k && R.has(k2(k, j)));
    push({ line: [3, 4], focus: k, vars: { k, "R(k,k)": loopS, "loop*": str(star(loop)), into: preds.length, "out of": succs.length },
      note: `Round ${round}: eliminate ${k}.${wanted ? "" : " (Greedy order: it creates the fewest new edges right now.)"} ${loop.t === "empty" ? `It has no self-loop, so loop* is just ε.` : `Its self-loop ${loopS} can repeat any number of times, so every path through ${k} picks up ${str(star(loop))}.`} ${preds.length && succs.length ? `${preds.length} edge${preds.length > 1 ? "s" : ""} lead in and ${succs.length} lead out: ${preds.length * succs.length} path${preds.length * succs.length > 1 ? "s" : ""} to reroute.` : `It has no ${preds.length ? "outgoing" : "incoming"} edges, so no accepted string passes through it: it can simply be deleted.`}` });
    for (const i of preds) for (const j of succs) {
      const old = get(i, j), via = cat(get(i, k), star(loop), get(k, j)), now = alt(old, via);
      put(i, j, now);
      push({ line: 7, focus: k, lit: [{ from: i, to: k }, { from: k, to: j }, { from: i, to: j }], changed: { from: i, to: j }, parts: { ik: get(i, k), kk: loop, kj: get(k, j), old },
        vars: { k, i, j, "R(i,k)": str(get(i, k)), "R(k,k)": loopS, "R(k,j)": str(get(k, j)), "old R(i,j)": str(old), "new R(i,j)": str(now) },
        note: `Path ${i} → ${k} → ${j}: read ${str(get(i, k))}, loop at ${k} any number of times${loop.t === "empty" ? " (no loop here)" : ` with ${str(star(loop))}`}, then read ${str(get(k, j))}. That's ${str(via)}. ${old.t === "empty" ? `There was no edge ${i} → ${j}, so it gets the label ${str(now)}.` : `There's already an edge ${i} → ${j} labelled ${str(old)}, so take the union: ${str(now)}.`}` });
    }
    alive = alive.filter((q) => q !== k);
    for (const key of [...R.keys()]) { const [a, b] = key.split("\u0000"); if (a === k || b === k) R.delete(key); }
    push({ line: 8, vars: { k, left: inner().length, order: used },
      note: `Delete ${k} and its edges. Every way of passing through it is now a direct edge, so the language hasn't changed. ${inner().length ? `${inner().length} state${inner().length > 1 ? "s" : ""} to go.` : `Only ${S} and ${F} are left.`}` });
  }
  const result = get(S, F);
  push({ line: 9, done: true, vars: { "R(s,f)": str(result) },
    note: result.t === "empty" ? `There is no edge from ${S} to ${F}: no string reaches an accepting state, so the language is empty (∅).` : `Only ${S} and ${F} remain. The label on ${S} → ${F}, ${str(result)}, is a regular expression for the automaton's language.` });
  return { regex: str(result), ast: result, empty: result.t === "empty", steps, order: used, start: S, final: F };
}

// Every string over the alphabet up to length n (at most `cap` of them).
export function allStrings(alphabet, n, cap = 4000) {
  const out = [""];
  for (let k = 0; k < out.length && out.length < cap; k++) if (out[k].length < n) for (const a of alphabet) out.push(out[k] + a);
  return out.slice(0, cap);
}

// Does the regular expression (as an ε-NFA) agree with the automaton on every
// string up to length n? Returns the first counterexample if not.
export function agree(fa, other, n = 6) {
  for (const w of allStrings(fa.alphabet, n)) {
    const a = run(fa, w).accepted, b = run(other, w).accepted;
    if (a !== b) return { ok: false, w, fa: a, other: b };
  }
  return { ok: true };
}

// --- Product construction -----------------------------------------------------------
export const PRODUCT_OPS = {
  union: { name: "Union A ∪ B", sym: "∪", test: (x, y) => x || y, rule: "p ∈ F_A or q ∈ F_B" },
  intersection: { name: "Intersection A ∩ B", sym: "∩", test: (x, y) => x && y, rule: "p ∈ F_A and q ∈ F_B" },
  difference: { name: "Difference A − B", sym: "−", test: (x, y) => x && !y, rule: "p ∈ F_A and q ∉ F_B" },
};

export const PRODUCT_CODE = [
  "start ← (p₀, q₀); queue ← [start]",
  "while queue is not empty",
  "  (p, q) ← dequeue",
  "  for each symbol a",
  "    t ← (δA(p, a), δB(q, a))  // ∅ if a move is missing",
  "    if t is new then add t and enqueue it",
  "    add the edge (p, q) —a→ t",
  "accept (p, q) when the rule for the operation holds",
];

export const DEAD = "∅";

export function product(A, B, op = "intersection") {
  if (A.kind !== "DFA" || B.kind !== "DFA") throw new Error("The product construction needs two DFAs. Convert any NFA with the subset construction first.");
  const rule = PRODUCT_OPS[op];
  if (!rule) throw new Error(`Unknown operation ${op}.`);
  const alphabet = [...new Set([...A.alphabet, ...B.alphabet])].sort();
  const go = (fa, q, a) => (q === DEAD ? DEAD : fa.next(q, a)[0] ?? DEAD);
  const name = (p, q) => `${p}·${q}`;
  const parts = new Map(), states = [], delta = new Map(), steps = [], edges = [];
  const add = (p, q) => { const n = name(p, q); if (!parts.has(n)) { parts.set(n, [p, q]); states.push(n); return true; } return false; };
  const acc = (n) => { const [p, q] = parts.get(n); return rule.test(p !== DEAD && A.accept.includes(p), q !== DEAD && B.accept.includes(q)); };
  const start = name(A.start, B.start);
  add(A.start, B.start);
  const queue = [start];
  const push = (s) => steps.push({ states: [...states], edges: edges.map((e) => ({ ...e })), lit: [], ...s });
  push({ line: 1, cur: start, vars: { start, queue: [...queue] }, note: `Run both DFAs side by side. The product starts in (${A.start}, ${B.start}): A's start state paired with B's.` });
  while (queue.length) {
    const cur = queue.shift(), [p, q] = parts.get(cur);
    push({ line: [2, 3], cur, vars: { "(p,q)": cur, queue: [...queue], found: states.length }, note: `Take ${cur} from the queue and work out where each symbol sends it.` });
    for (const a of alphabet) {
      const tp = go(A, p, a), tq = go(B, q, a), t = name(tp, tq), isNew = add(tp, tq);
      if (isNew) queue.push(t);
      edges.push({ from: cur, to: t, label: a });
      delta.set(`${cur}\u0000${a}`, [t]);
      push({ line: isNew ? [5, 6, 7] : [5, 7], cur: t, lit: [{ from: cur, to: t }],
        vars: { p, q, a, "δA(p,a)": tp, "δB(q,a)": tq, t, new: isNew, queue: [...queue] },
        note: `On ${a}: A goes ${p} → ${tp}${tp === DEAD && p !== DEAD ? " (no move, so A is stuck in ∅)" : ""} and B goes ${q} → ${tq}${tq === DEAD && q !== DEAD ? " (no move, so B is stuck in ∅)" : ""}, so ${cur} —${a}→ ${t}${isNew ? `, a new pair: add it to the queue` : ", which we've already seen"}.` });
      if (states.length > 64) throw new Error("The product has more than 64 states. Use smaller DFAs.");
    }
  }
  const accept = states.filter(acc);
  const dfa = { states, alphabet, start, accept, delta, kind: "DFA", complete: true, next: (s, a) => delta.get(`${s}\u0000${a}`) ?? [] };
  push({ line: 8, done: true, vars: { states: states.length, accepting: accept }, accept,
    note: `The queue is empty: ${states.length} reachable pairs. For the ${rule.name.split(" ")[0].toLowerCase()}, a pair (p, q) accepts when ${rule.rule}: ${accept.length ? accept.join(", ") : "none of them, so the language is empty"}.` });
  return { dfa, steps, parts, rule };
}

export const EXAMPLES = {
  sipser68: { name: "a*b(a|b)*: two states (Sipser Ex. 1.68)", text: "start: 1\naccept: 2\n1 a 1\n1 b 2\n2 a 2\n2 b 2" },
  sipser74: { name: "Three states (Sipser Ex. 1.74)", text: "start: 1\naccept: 2 3\n1 a 2\n1 b 3\n2 a 1\n2 b 2\n3 a 2\n3 b 1" },
  hmu36: { name: "NFA: 1 second or third from the end (HMU Ex. 3.6)", text: "start: A\naccept: C D\nA 0 A\nA 1 A B\nB 0 C\nB 1 C\nC 0 D\nC 1 D" },
  endsAbb: { name: "Strings ending in abb", text: "start: 0\naccept: 3\n0 a 1\n0 b 0\n1 a 1\n1 b 2\n2 a 1\n2 b 3\n3 a 1\n3 b 0" },
  evenZeros: { name: "Even number of 0s", text: "start: E\naccept: E\nE 0 O\nE 1 E\nO 0 E\nO 1 O" },
  mod3: { name: "Binary multiples of 3", text: "start: 0\naccept: 0\n0 0 0\n0 1 1\n1 0 2\n1 1 0\n2 0 1\n2 1 2" },
};

export const PRODUCT_EXAMPLES = {
  evenOdd: { name: "Even number of a's, and ends in b", a: "start: E\naccept: E\nE a O\nE b E\nO a E\nO b O", b: "start: x\naccept: y\nx a x\nx b y\ny a x\ny b y" },
  contains: { name: "Contains ab, and has even length", a: "start: 0\naccept: 2\n0 a 1\n0 b 0\n1 a 1\n1 b 2\n2 a 2\n2 b 2", b: "start: e\naccept: e\ne a o\ne b o\no a e\no b e" },
};
