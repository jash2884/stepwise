// Operator-precedence parsing: LEADING and TRAILING sets, the ⋖ ≐ ⋗ relation
// table (from an operator grammar, or from precedence and associativity
// rules), precedence functions f and g, and the shift-reduce parser that finds
// each handle by popping until it meets a ⋖.
import { END, make, parseGrammar, showProd } from "./grammar.js";

export const LT = "⋖", EQ = "≐", GT = "⋗";

export function checkOperatorGrammar(g) {
  const problems = [];
  for (const p of g.prods) {
    if (!p.rhs.length) problems.push(`${showProd(p)} has an ε body`);
    for (let i = 0; i + 1 < p.rhs.length; i++) if (g.isNT(p.rhs[i]) && g.isNT(p.rhs[i + 1])) { problems.push(`${showProd(p)} has two non-terminals side by side (${p.rhs[i]} ${p.rhs[i + 1]})`); break; }
  }
  return problems;
}

const sortT = (list, order) => [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));

export const LEADING_CODE = [
  "for each production A → α  // the base cases",
  "  if α = a… or α = B a…: add a to LEADING(A)",
  "  if α = …a or α = …a B: add a to TRAILING(A)",
  "repeat until a whole pass adds nothing",
  "  for each A → B…: LEADING(A) ← LEADING(A) ∪ LEADING(B)",
  "  for each A → …B: TRAILING(A) ← TRAILING(A) ∪ TRAILING(B)",
  "for each production A → X1 X2 … Xn and each i",
  "  if Xi Xi+1 are terminals, or Xi B Xi+2: Xi ≐ the next terminal",
  "  if Xi is a terminal and Xi+1 = B: Xi ⋖ each b in LEADING(B)",
  "  if Xi = B and Xi+1 is a terminal: each a in TRAILING(B) ⋗ Xi+1",
  "$ ⋖ each b in LEADING(S); each a in TRAILING(S) ⋗ $",
];

export const RULES_CODE = [
  "for each pair of operators θ1, θ2",
  "  if θ1 binds tighter than θ2: θ1 ⋗ θ2 and θ2 ⋖ θ1",
  "  if equal and left-associative: θ1 ⋗ θ2 and θ2 ⋗ θ1",
  "  if equal and right-associative: θ1 ⋖ θ2 and θ2 ⋖ θ1",
  "for every operator θ",
  "  θ ⋖ id, id ⋗ θ, θ ⋖ (, ( ⋖ θ, ) ⋗ θ, θ ⋗ ), θ ⋗ $, $ ⋖ θ",
  "( ≐ ), ( ⋖ (, ) ⋗ ), ( ⋖ id, id ⋗ ), $ ⋖ id, id ⋗ $, $ ⋖ (, ) ⋗ $",
];

function relationTable(cols) {
  const cells = new Map();
  const set = (a, b, r, why) => {
    const k = `${a}\u0000${b}`, list = cells.get(k) ?? [];
    if (list.some((x) => x.r === r)) return false;
    list.push({ r, why });
    cells.set(k, list);
    return true;
  };
  const get = (a, b) => (cells.get(`${a}\u0000${b}`) ?? []).map((x) => x.r);
  const conflicts = () => [...cells].filter(([, l]) => l.length > 1).map(([k, l]) => { const [a, b] = k.split("\u0000"); return { a, b, rels: l.map((x) => x.r) }; });
  return { cols, cells, set, get, rel: (a, b) => get(a, b)[0] ?? null, conflicts, why: (a, b) => (cells.get(`${a}\u0000${b}`) ?? []).map((x) => x.why) };
}

const snapCells = (t) => Object.fromEntries([...t.cells].map(([k, l]) => [k, l.map((x) => x.r)]));

// From an operator grammar: LEADING, TRAILING, then the table.
export function fromGrammar(g) {
  const problems = checkOperatorGrammar(g);
  if (problems.length) throw new Error(`Not an operator grammar: ${problems.slice(0, 3).join("; ")}.`);
  const T = g.terminals, cols = [...T, END];
  const lead = new Map(g.nonterminals.map((A) => [A, new Set()])), trail = new Map(g.nonterminals.map((A) => [A, new Set()]));
  const steps = [], table = relationTable(cols);
  const sets = () => ({
    leading: Object.fromEntries([...lead].map(([k, v]) => [k, sortT(v, T)])),
    trailing: Object.fromEntries([...trail].map(([k, v]) => [k, sortT(v, T)])),
  });
  const step = (s) => steps.push({ ...sets(), cells: snapCells(table), ...s });
  // Base cases.
  for (const p of g.prods) {
    const r = p.rhs, added = [];
    const a = !g.isNT(r[0]) ? r[0] : r.length > 1 && !g.isNT(r[1]) ? r[1] : null;
    if (a && !lead.get(p.lhs).has(a)) { lead.get(p.lhs).add(a); added.push(["L", a]); }
    const n = r.length, z = !g.isNT(r[n - 1]) ? r[n - 1] : n > 1 && !g.isNT(r[n - 2]) ? r[n - 2] : null;
    if (z && !trail.get(p.lhs).has(z)) { trail.get(p.lhs).add(z); added.push(["T", z]); }
    if (!added.length) continue;
    const parts = added.map(([k, x]) => `${x} to ${k === "L" ? "LEADING" : "TRAILING"}(${p.lhs})`);
    step({ phase: "base", prod: p.i, target: p.lhs, added: added.map(([k, x]) => `${k}:${x}`), line: added.map(([k]) => (k === "L" ? 2 : 3)), vars: { production: showProd(p), A: p.lhs, add: added.map(([, x]) => x) },
      note: `${showProd(p)}: add ${parts.join(" and ")}, because ${added.map(([k, x]) => (k === "L" ? (r[0] === x ? `the body starts with ${x}` : `${x} comes right after the leading ${r[0]}`) : (r[n - 1] === x ? `the body ends with ${x}` : `${x} comes just before the final ${r[n - 1]}`))).join(" and ")}.` });
  }
  // Closure.
  for (let pass = 1, changed = true; changed; pass++) {
    changed = false;
    for (const p of g.prods) {
      const B = p.rhs[0], C = p.rhs.at(-1), added = [];
      if (g.isNT(B) && B !== p.lhs) for (const x of lead.get(B)) if (!lead.get(p.lhs).has(x)) { lead.get(p.lhs).add(x); added.push(["L", x]); }
      if (g.isNT(C) && C !== p.lhs) for (const x of trail.get(C)) if (!trail.get(p.lhs).has(x)) { trail.get(p.lhs).add(x); added.push(["T", x]); }
      if (!added.length) continue;
      changed = true;
      const L = added.filter(([k]) => k === "L").map(([, x]) => x), Tr = added.filter(([k]) => k === "T").map(([, x]) => x);
      step({ phase: "closure", pass, prod: p.i, target: p.lhs, added: added.map(([k, x]) => `${k}:${x}`), line: [4, ...(L.length ? [5] : []), ...(Tr.length ? [6] : [])], vars: { pass, production: showProd(p), A: p.lhs, changed: true },
        note: `Pass ${pass}, ${showProd(p)}: ${[L.length ? `it starts with ${B}, so everything in LEADING(${B}) is in LEADING(${p.lhs}): add {${L.join(", ")}}` : "", Tr.length ? `it ends with ${C}, so TRAILING(${C}) flows into TRAILING(${p.lhs}): add {${Tr.join(", ")}}` : ""].filter(Boolean).join("; ")}.` });
    }
    if (!changed) step({ phase: "closure", pass, line: 4, vars: { pass, changed: false }, note: `Pass ${pass} adds nothing, so LEADING and TRAILING are final.` });
  }
  // Relations.
  const S = g.start;
  for (const p of g.prods) {
    const r = p.rhs, found = [], lines = new Set();
    for (let i = 0; i < r.length; i++) {
      const X = r[i], Y = r[i + 1], Z = r[i + 2];
      if (Y == null) continue;
      if (!g.isNT(X) && !g.isNT(Y)) { if (table.set(X, Y, EQ, `${X} and ${Y} sit side by side in ${showProd(p)}`)) found.push(`${X} ≐ ${Y}`); lines.add(8); }
      if (Z != null && !g.isNT(X) && g.isNT(Y) && !g.isNT(Z)) { if (table.set(X, Z, EQ, `${X} ${Y} ${Z} in ${showProd(p)}: only a non-terminal between them`)) found.push(`${X} ≐ ${Z}`); lines.add(8); }
      if (!g.isNT(X) && g.isNT(Y)) { for (const b of lead.get(Y)) if (table.set(X, b, LT, `${X} is followed by ${Y} in ${showProd(p)} and ${b} ∈ LEADING(${Y})`)) found.push(`${X} ⋖ ${b}`); lines.add(9); }
      if (g.isNT(X) && !g.isNT(Y)) { for (const a of trail.get(X)) if (table.set(a, Y, GT, `${X} is followed by ${Y} in ${showProd(p)} and ${a} ∈ TRAILING(${X})`)) found.push(`${a} ⋗ ${Y}`); lines.add(10); }
    }
    if (!found.length) continue;
    step({ phase: "table", prod: p.i, line: [7, ...[...lines].sort()], vars: { production: showProd(p), relations: found.length }, fresh: found, note: `${showProd(p)}: ${found.join(", ")}.` });
  }
  const found = [];
  for (const b of lead.get(S)) if (table.set(END, b, LT, `the start symbol can begin with ${b}`)) found.push(`$ ⋖ ${b}`);
  for (const a of trail.get(S)) if (table.set(a, END, GT, `the start symbol can end with ${a}`)) found.push(`${a} ⋗ $`);
  step({ phase: "table", line: 11, vars: { S, relations: found.length }, fresh: found, note: `The end marker: $ ⋖ everything in LEADING(${S}) = {${sortT(lead.get(S), T).join(", ")}}, and everything in TRAILING(${S}) ⋗ $.`, done: true });
  return { mode: "grammar", g, table, leading: lead, trailing: trail, steps, code: LEADING_CODE };
}

// Precedence levels, lowest first: "+ - left\n* / left\n^ right".
export function parseLevels(text) {
  const levels = [];
  for (const raw of String(text).split(/[\n;]/)) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const assoc = /^(left|right)$/i.test(words.at(-1)) ? words.pop().toLowerCase() : "left";
    if (!words.length) throw new Error(`"${raw.trim()}": list the operators before left or right.`);
    for (const w of words) if (["id", "(", ")", "$"].includes(w)) throw new Error(`"${w}" can't be an operator.`);
    levels.push({ ops: words, assoc });
  }
  if (!levels.length) throw new Error('List operator levels, lowest first, e.g. "+ - left" then "* / left".');
  const ops = levels.flatMap((l) => l.ops);
  if (new Set(ops).size !== ops.length) throw new Error("Each operator may appear in only one level.");
  if (ops.length > 8) throw new Error("Use at most 8 operators.");
  return levels;
}

export function fromRules(levels, { parens = true } = {}) {
  const ops = levels.flatMap((l) => l.ops), lvl = new Map(levels.flatMap((l, i) => l.ops.map((o) => [o, i])));
  const assoc = new Map(levels.flatMap((l) => l.ops.map((o) => [o, l.assoc])));
  const cols = [...ops, "id", ...(parens ? ["(", ")"] : []), END];
  const g = make(["E"], [...ops.map((o) => ({ lhs: "E", rhs: ["E", o, "E"] })), ...(parens ? [{ lhs: "E", rhs: ["(", "E", ")"] }] : []), { lhs: "E", rhs: ["id"] }], "E");
  const table = relationTable(cols), steps = [];
  const step = (s) => steps.push({ cells: snapCells(table), ...s });
  for (let i = 0; i < ops.length; i++) for (let j = i; j < ops.length; j++) {
    const a = ops[i], b = ops[j], found = [];
    let line, why;
    if (lvl.get(a) !== lvl.get(b)) {
      const [hi, lo] = lvl.get(a) > lvl.get(b) ? [a, b] : [b, a];
      table.set(hi, lo, GT, `${hi} binds tighter than ${lo}`); table.set(lo, hi, LT, `${hi} binds tighter than ${lo}`);
      found.push(`${hi} ⋗ ${lo}`, `${lo} ⋖ ${hi}`); line = 2; why = `${hi} binds tighter than ${lo}, so a ${hi} on the stack is reduced before reading ${lo}, and ${lo} on the stack waits for ${hi}`;
    } else {
      const r = assoc.get(a) === "right" ? LT : GT;
      table.set(a, b, r, `same level, ${assoc.get(a)}-associative`); if (a !== b) table.set(b, a, r, `same level, ${assoc.get(a)}-associative`);
      found.push(`${a} ${r} ${b}`, ...(a !== b ? [`${b} ${r} ${a}`] : [])); line = r === GT ? 3 : 4;
      why = r === GT ? `same level and left-associative, so the earlier one is reduced first (a ${a} b ${b} c = (a ${a} b) ${b} c)` : `same level and right-associative, so the later one is reduced first (a ${a} b ${b} c = a ${a} (b ${b} c))`;
    }
    step({ phase: "table", line, vars: { θ1: a, θ2: b, relations: found }, fresh: found, note: `${a} and ${b}: ${why}. ${found.join(", ")}.` });
  }
  for (const o of ops) {
    const found = [];
    const add = (a, b, r) => { table.set(a, b, r, "operands and parentheses"); found.push(`${a} ${r} ${b}`); };
    add(o, "id", LT); add("id", o, GT);
    if (parens) { add(o, "(", LT); add("(", o, LT); add(")", o, GT); add(o, ")", GT); }
    add(o, END, GT); add(END, o, LT);
    step({ phase: "table", line: [5, 6], vars: { θ: o, relations: found.length }, fresh: found, note: `${o} against operands: an id next to ${o} is always reduced first (id ⋗ ${o}, ${o} ⋖ id)${parens ? ", a ( starts a new subexpression and a ) closes it" : ""}, and $ is weaker than everything.` });
  }
  const found = [];
  const add = (a, b, r) => { table.set(a, b, r, "operands and parentheses"); found.push(`${a} ${r} ${b}`); };
  if (parens) { add("(", ")", EQ); add("(", "(", LT); add(")", ")", GT); add("(", "id", LT); add("id", ")", GT); add(END, "(", LT); add(")", END, GT); }
  add(END, "id", LT); add("id", END, GT);
  step({ phase: "table", line: 7, vars: { relations: found.length }, fresh: found, done: true, note: `The fixed entries: ${found.join(", ")}. Blank cells are errors (for example id next to id).` });
  return { mode: "rules", g, levels, table, steps, code: RULES_CODE };
}

// Precedence functions by the graph method: ≐ merges f_a and g_b into one node;
// a ⋖ b gives an edge g_b → f_a, a ⋗ b gives f_a → g_b; f(a) is the longest path
// from f_a's group. A cycle means no functions exist.
export function precedenceFunctions(table) {
  const syms = table.cols, ids = [...syms.map((a) => `f${a}`), ...syms.map((a) => `g${a}`)];
  const parent = new Map(ids.map((x) => [x, x]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  for (const a of syms) for (const b of syms) if (table.get(a, b).includes(EQ)) parent.set(find(`f${a}`), find(`g${b}`));
  const out = new Map();
  const edge = (u, v) => { const s = out.get(find(u)) ?? new Set(); s.add(find(v)); out.set(find(u), s); };
  for (const a of syms) for (const b of syms) for (const r of table.get(a, b)) {
    if (r === LT) edge(`g${b}`, `f${a}`);
    if (r === GT) edge(`f${a}`, `g${b}`);
  }
  const memo = new Map(), onPath = new Set();
  let cycle = false;
  const longest = (u) => {
    if (memo.has(u)) return memo.get(u);
    if (onPath.has(u)) { cycle = true; return 0; }
    onPath.add(u);
    let best = 0;
    for (const v of out.get(u) ?? []) best = Math.max(best, 1 + longest(v));
    onPath.delete(u);
    memo.set(u, best);
    return best;
  };
  const f = {}, gg = {};
  for (const a of syms) { f[a] = longest(find(`f${a}`)); gg[a] = longest(find(`g${a}`)); }
  if (cycle || table.conflicts().length) return null;
  return { f, g: gg };
}

export const PARSE_CODE = [
  "push $; a ← the first input token",
  "loop",
  "  b ← the topmost terminal on the stack",
  "  if b = $ and a = $ then accept",
  "  if b ⋖ a or b ≐ a then",
  "    push a; a ← the next token  // shift",
  "  else if b ⋗ a then  // a handle is on top",
  "    repeat pop until the top terminal ⋖ the terminal last popped",
  "    reduce the popped handle to a non-terminal",
  "  else report an error",
];

let uid = 0;
const node = (label, state) => ({ id: `n${++uid}`, label, state, kids: [] });
const cloneTree = (n) => ({ id: n.id, label: n.label, state: n.state, kids: n.kids.map(cloneTree) });

export function opParse(res, tokens, { limit = 300 } = {}) {
  const { g, table } = res;
  const cols = new Set(table.cols);
  const input = [...tokens, END];
  const bad = tokens.find((t) => !cols.has(t));
  const stack = [{ sym: END }], steps = [], reductions = [];
  let pos = 0, result = null;
  const topT = () => { for (let k = stack.length - 1; k >= 0; k--) if (!stack[k].nt) return { sym: stack[k].sym, at: k }; return null; };
  const push = (s) => steps.push({ stack: stack.map((x) => ({ sym: x.sym, nt: !!x.nt, id: x.node?.id ?? "end" })), pos, input, forest: stack.slice(1).map((x) => cloneTree(x.node)), ...s });
  push({ line: 1, vars: { a: input[0] }, note: `Push $ and look at the first token, ${input[0]}.` });
  if (bad) { result = "error"; push({ line: 10, bad: true, vars: { a: bad }, note: `"${bad}" isn't a terminal of this grammar, so there's no row or column for it.` }); }
  while (!result) {
    if (steps.length > limit) { result = "limit"; push({ line: 2, bad: true, note: `Stopped after ${limit} steps.` }); break; }
    const b = topT().sym, a = input[pos];
    if (b === END && a === END) {
      const ok = stack.length === 2 && stack[1].nt;
      result = ok ? "accept" : "error";
      push({ line: [3, 4], good: ok, bad: !ok, vars: { b, a, relation: "–" }, note: ok ? `Only $ and one non-terminal are left and the input is at $: ACCEPT.` : `Both are at $, but the stack doesn't hold exactly one non-terminal: ERROR.` });
      break;
    }
    const rels = table.get(b, a), r = rels[0];
    const conflict = rels.length > 1 ? ` (conflict: ${rels.join(" and ")}; using ${r})` : "";
    if (r === LT || r === EQ) {
      const n = node(a, "matched");
      stack.push({ sym: a, node: n });
      pos++;
      push({ line: [3, 5, 6], cell: [b, a], shift: n.id, vars: { b, a, relation: r }, note: `Top terminal ${b} ${r} ${a}${conflict}: ${r === LT ? `${a} might start a handle` : `${a} belongs to the same handle as ${b}`}, so shift ${a}.` });
      continue;
    }
    if (r === GT) {
      // Pop the handle: down to the terminal that ⋖ the last one popped.
      const handle = [];
      let last;
      for (;;) {
        while (stack.at(-1).nt) handle.unshift(stack.pop());
        last = stack.pop(); handle.unshift(last);
        while (stack.at(-1).nt) handle.unshift(stack.pop());
        const below = topT().sym, rr = table.rel(below, last.sym);
        if (rr === EQ) continue;
        break;
      }
      const shape = handle.map((x) => (x.nt ? "N" : x.sym));
      const prod = g.prods.find((p) => p.rhs.length === handle.length && p.rhs.every((s, i) => (g.isNT(s) ? handle[i].nt : s === handle[i].sym)));
      const text = handle.map((x) => x.sym).join(" ");
      if (!prod) {
        handle.forEach((x) => stack.push(x));
        result = "error";
        push({ line: [7, 8, 9, 10], bad: true, cell: [b, a], vars: { b, a, relation: r, handle: text }, note: `${b} ⋗ ${a}, so the handle "${text}" is on top, but no production has the body ${shape.join(" ")}: ERROR.` });
        break;
      }
      const parent = node(prod.lhs, "expanded");
      parent.kids = handle.map((x) => x.node);
      stack.push({ sym: prod.lhs, nt: true, node: parent });
      reductions.push(prod.i);
      push({ line: [3, 7, 8, 9], cell: [b, a], reduced: parent.id, prod: prod.i, vars: { b, a, relation: r, handle: text }, note: `Top terminal ${b} ⋗ ${a}${conflict}: the handle is complete. Pop until a ⋖: "${text}", and reduce it by ${showProd(prod)}.` });
      continue;
    }
    result = "error";
    push({ line: [3, 10], bad: true, cell: [b, a], vars: { b, a, relation: "blank" }, note: `There's no relation between ${b} and ${a === END ? "$" : a}: the input can't be a sentence here. ERROR.` });
  }
  return { steps, accepted: result === "accept", reductions };
}

export function tokenizeOp(input, cols) {
  const s = String(input).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/);
  const ts = [...cols].filter((x) => x !== END).sort((a, b) => b.length - a.length), out = [];
  for (let i = 0; i < s.length;) { const t = ts.find((x) => s.startsWith(x, i)) ?? s[i]; out.push(t); i += t.length; }
  return out;
}

export function build(mode, text) {
  return mode === "rules" ? fromRules(parseLevels(text)) : fromGrammar(parseGrammar(text));
}

export const EXAMPLES = {
  expr: { name: "E → E + T | T … (textbook)", mode: "grammar", text: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", input: "id + id * id" },
  power: { name: "With right-associative ^", mode: "grammar", text: "E -> E + T | T\nT -> T * F | F\nF -> P ^ F | P\nP -> ( E ) | id", input: "id ^ id ^ id * id" },
  minus: { name: "E → E - T with unary-free minus", mode: "grammar", text: "E -> E - T | E + T | T\nT -> ( E ) | id", input: "id - id + id" },
  ambiguous: { name: "Ambiguous E → E + E | E * E (rules)", mode: "rules", text: "+ - left\n* / left\n^ right", input: "id + id * id ^ id ^ id" },
  arith: { name: "Only + and * (rules, no conflicts)", mode: "rules", text: "+ left\n* left", input: "id * ( id + id )" },
};
