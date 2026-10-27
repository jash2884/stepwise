// Pushdown automata: parsing, nondeterministic simulation by breadth-first
// search over configurations, and the CFG → PDA construction.
//
// One move per line: from, input read, stack top popped, "->", to, pushed string.
//   start: q0
//   stack: Z          (the initial stack symbol; Z if omitted)
//   accept: q2        (accept by final state)
//   mode: empty       (or accept by empty stack instead)
//   q0 a Z -> q0 AZ   (in q0 reading a with Z on top: pop Z, push A then Z, so A is on top)
//   q0 ε A -> q1 ε    (ε as input reads nothing; ε as pop pops nothing; ε as push pushes nothing)
// A pushed string is written top first. Several symbols can be separated by
// spaces (needed for multi-letter symbols such as id or E'); one word is split
// into single characters unless it is already a known stack symbol.

export const EPS = "ε";
const EPS_WORDS = new Set(["ε", "eps", "epsilon", "λ", "lambda"]);
const isEps = (w) => EPS_WORDS.has(w.toLowerCase());

export const CODE = [
  "queue ← [(q0, w, Z0)]; seen ← { that configuration }",
  "while queue is not empty",
  "  (q, x, γ) ← dequeue()  // breadth first: oldest first",
  "  if accepting(q, x, γ) then return ACCEPT",
  "  for each move (q, a, X) → (p, β) that applies",
  "    x′ ← x with a removed  // a = ε reads nothing",
  "    γ′ ← β followed by γ without X  // X = ε pops nothing",
  "    if (p, x′, γ′) is new then enqueue it",
  "return REJECT  // every branch died",
];

function splitPush(word, known) {
  if (known.has(word)) return [word];
  const out = [];
  for (const c of word) {
    if (c === "'" && out.length) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

export function parsePDA(text) {
  let start = null, bottom = "Z", mode = null;
  const accept = [], raw = [], states = [];
  const addState = (q) => { if (!states.includes(q)) states.push(q); };
  for (const line0 of String(text).split("\n")) {
    const line = line0.replace(/#.*$/, "").trim();
    if (!line) continue;
    let m = /^start\s*[:=]\s*(\S+)$/i.exec(line);
    if (m) { start = m[1]; addState(start); continue; }
    m = /^(?:stack|bottom)\s*[:=]\s*(\S+)$/i.exec(line);
    if (m) { bottom = m[1]; continue; }
    m = /^(?:mode|accept\s+by)\s*[:=]\s*(\S+)/i.exec(line);
    if (m) {
      const v = m[1].toLowerCase();
      if (v.startsWith("empty")) mode = "empty"; else if (v.startsWith("final")) mode = "final";
      else throw new Error(`"${line}": the mode is "final" (accepting states) or "empty" (empty stack).`);
      continue;
    }
    m = /^(?:accept|final|accepting)\s*[:=]\s*(.+)$/i.exec(line);
    if (m) { for (const q of m[1].split(/[\s,]+/).filter(Boolean)) if (!accept.includes(q)) accept.push(q); continue; }
    const arrow = line.split(/\s*(?:->|→)\s*/);
    if (arrow.length !== 2) throw new Error(`Can't read "${line}". Write moves like "q0 a Z -> q0 AZ".`);
    const left = arrow[0].split(/\s+/).filter(Boolean), right = arrow[1].split(/\s+/).filter(Boolean);
    if (left.length !== 3 || right.length < 1) throw new Error(`Can't read "${line}". Write moves like "q0 a Z -> q0 AZ" (state, input, pop -> state, push).`);
    const [from, inp, pop] = left, [to, ...push] = right;
    raw.push({ from, input: isEps(inp) ? EPS : inp, pop: isEps(pop) ? EPS : pop, to, pushWords: push.length === 1 && isEps(push[0]) ? [] : push, line });
    addState(from); addState(to);
  }
  if (!start) throw new Error('Add a start line, e.g. "start: q0".');
  for (const q of accept) addState(q);
  if (!mode) mode = accept.length ? "final" : "empty";
  const known = new Set([bottom, ...raw.map((r) => r.pop).filter((x) => x !== EPS)]);
  const moves = raw.map(({ pushWords, line, ...r }, i) => ({ ...r, i, push: pushWords.length > 1 ? pushWords : pushWords.length ? splitPush(pushWords[0], known) : [] }));
  if (!moves.length) throw new Error("Add at least one move, e.g. q0 a Z -> q0 AZ.");
  if (states.length > 20) throw new Error("Use at most 20 states.");
  if (moves.length > 80) throw new Error("Use at most 80 moves.");
  return makePDA({ states, start, accept, bottom, mode, moves });
}

export function makePDA({ states, start, accept, bottom, mode, moves }) {
  const inputs = [...new Set(moves.map((t) => t.input).filter((x) => x !== EPS))];
  const stackSyms = [...new Set([bottom, ...moves.flatMap((t) => [t.pop, ...t.push]).filter((x) => x !== EPS)])];
  const deterministic = states.every((q) => {
    const own = moves.filter((t) => t.from === q);
    return own.every((t, k) => own.every((u, j) => j === k || !(
      (t.input === u.input || t.input === EPS || u.input === EPS) && (t.pop === u.pop || t.pop === EPS || u.pop === EPS))));
  });
  return { states, start, accept, bottom, mode, moves: moves.map((t, i) => ({ ...t, i })), inputs, stackSyms, deterministic };
}

export const showPush = (push) => (push.length ? push.join(push.some((s) => [...s].length > 1) ? " " : "") : EPS);
export const showMove = (t) => `δ(${t.from}, ${t.input}, ${t.pop}) ∋ (${t.to}, ${showPush(t.push)})`;
export const moveLabel = (t) => `${t.input}, ${t.pop}/${showPush(t.push)}`;

export function toText(pda) {
  const lines = [`start: ${pda.start}`, `stack: ${pda.bottom}`];
  if (pda.mode === "final") lines.push(`accept: ${pda.accept.join(" ")}`); else lines.push("mode: empty");
  for (const t of pda.moves) lines.push(`${t.from} ${t.input} ${t.pop} -> ${t.to} ${t.push.length ? t.push.join(" ") : EPS}`);
  return lines.join("\n");
}

// Split an input string into input symbols: spaces if there are any, otherwise
// the longest known symbol at each point (so "id+id" works), else one character.
export function tokenizeInput(pda, w) {
  const s = String(w).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/);
  const syms = [...pda.inputs].sort((a, b) => b.length - a.length), out = [];
  for (let i = 0; i < s.length;) {
    const t = syms.find((x) => s.startsWith(x, i)) ?? s[i];
    out.push(t); i += t.length;
  }
  return out;
}

const stackText = (stack) => (stack.length ? stack.map((x) => x.s).join(stack.some((x) => [...x.s].length > 1) ? " " : "") : EPS);

// Breadth-first search over configurations (state, unread input, stack).
// Steps: the start, then one per configuration taken off the queue.
export function simulate(pda, tokens, { maxSteps = 1500, maxStack = 40, prune = null } = {}) {
  if (tokens.length > 30) throw new Error("Use an input of at most 30 symbols.");
  let uid = 0;
  const configs = [], steps = [], seen = new Set();
  const key = (c) => `${c.state}\u0000${c.pos}\u0000${c.stack.map((x) => x.s).join("\u0001")}`;
  const rest = (pos) => (pos < tokens.length ? tokens.slice(pos).join(tokens.some((t) => [...t].length > 1) ? " " : "") : EPS);
  const accepts = (c) => c.pos === tokens.length && (pda.mode === "empty" ? !c.stack.length : pda.accept.includes(c.state));
  const root = { id: 0, parent: null, depth: 0, state: pda.start, pos: 0, stack: [{ s: pda.bottom, u: uid++ }], via: null, kids: [] };
  configs.push(root); seen.add(key(root));
  const queue = [root];
  const vars = (c, extra = {}) => ({ q: c.state, x: rest(c.pos), "γ (top first)": stackText(c.stack), ...extra, queue: queue.length, seen: seen.size });
  steps.push({ cur: 0, line: 1, created: 1, vars: vars(root), note: `Start in the configuration (${pda.start}, ${rest(0)}, ${pda.bottom}): state ${pda.start}, the whole input unread, and only ${pda.bottom} on the stack. Put it in the queue.` });
  let verdict = null, acceptId = null, prunedCount = 0;
  while (queue.length) {
    const c = queue.shift();
    c.expanded = true;
    if (accepts(c)) {
      verdict = "accept"; acceptId = c.id; c.accepting = true;
      steps.push({ cur: c.id, line: 4, created: configs.length, vars: vars(c), note: `Take (${c.state}, ${rest(c.pos)}, ${stackText(c.stack)}) off the queue. The input is used up and ${pda.mode === "empty" ? "the stack is empty" : `${c.state} is an accepting state`}, so this branch ACCEPTS. One accepting branch is enough for a nondeterministic PDA.`, done: "accept" });
      break;
    }
    if (steps.length >= maxSteps) { verdict = "limit"; break; }
    const made = [], dup = [], cut = [];
    const a = tokens[c.pos];
    for (const t of pda.moves) {
      if (t.from !== c.state) continue;
      if (t.input !== EPS && t.input !== a) continue;
      if (t.pop !== EPS && c.stack[0]?.s !== t.pop) continue;
      const base = t.pop === EPS ? c.stack : c.stack.slice(1);
      const stack = [...t.push.map((s) => ({ s, u: uid++ })), ...base];
      const n = { id: configs.length, parent: c.id, depth: c.depth + 1, state: t.to, pos: c.pos + (t.input === EPS ? 0 : 1), stack, via: t, kids: [] };
      if (stack.length > maxStack || (prune && prune(n, tokens))) { cut.push(t); prunedCount++; continue; }
      const k = key(n);
      if (seen.has(k)) { dup.push(t); continue; }
      seen.add(k); configs.push(n); c.kids.push(n.id); queue.push(n); made.push(n);
    }
    if (!made.length && !dup.length && !cut.length) c.dead = true;
    const lines = made.length ? [5, 6, 7, 8] : [5];
    let note = `Take (${c.state}, ${rest(c.pos)}, ${stackText(c.stack)}) off the queue. `;
    if (!made.length && !dup.length && !cut.length) note += `No move applies to state ${c.state} with ${a ?? "no input left"} next and ${c.stack[0]?.s ?? "an empty stack"} on top, so this branch dies.`;
    else {
      if (made.length) note += `${made.length === 1 ? "One move applies" : `${made.length} moves apply`}: ${made.map((n) => `${moveLabel(n.via)} gives (${n.state}, ${rest(n.pos)}, ${stackText(n.stack)})`).join("; ")}. ${made.length > 1 ? "The PDA guesses, so every choice is queued." : "Queue it."}`;
      if (dup.length) note += ` ${dup.length} move${dup.length > 1 ? "s lead" : " leads"} to a configuration already seen, so ${dup.length > 1 ? "they are" : "it is"} skipped.`;
      if (cut.length) note += ` ${cut.length} move${cut.length > 1 ? "s were" : " was"} cut off: ${prune ? "the stack would hold more symbols that can't vanish than there is input left, or it" : "the stack"} grew too tall.`;
    }
    steps.push({ cur: c.id, line: lines, created: configs.length, vars: vars(c, { moves: made.length }), note, dead: !!c.dead });
  }
  if (!verdict) {
    verdict = "reject";
    steps.push({ cur: null, line: 9, created: configs.length, vars: { queue: 0, seen: seen.size }, note: `The queue is empty: every branch died without accepting, so the PDA REJECTS the input.${prunedCount ? ` (${prunedCount} branch${prunedCount > 1 ? "es were" : " was"} cut off as hopeless.)` : ""}`, done: "reject" });
  } else if (verdict === "limit") {
    steps.push({ cur: null, line: 2, created: configs.length, vars: { queue: queue.length, seen: seen.size }, note: `Stopped after ${maxSteps} configurations without finding an accepting branch. The PDA may keep making ε-moves forever on this input.`, done: "limit" });
  }
  // The path worth replaying: the accepting branch, or the branch that read the most.
  let end = acceptId;
  if (end == null) end = configs.reduce((b, c) => (c.pos > b.pos || (c.pos === b.pos && c.depth > b.depth) ? c : b), root).id;
  const path = [];
  for (let id = end; id != null; id = configs[id].parent) path.unshift(id);
  return { configs, steps, verdict, accepted: verdict === "accept", acceptId, path, tokens, rest, stackText };
}

// --- CFG → PDA (one state, accept by empty stack) ---------------------------------
// Hopcroft, Motwani & Ullman §6.3.1: for A → α, δ(q, ε, A) ∋ (q, α); for each
// terminal a, δ(q, a, a) ∋ (q, ε). The stack holds what is left of a leftmost
// derivation's sentential form.
export function grammarToPda(g) {
  const moves = [], why = [];
  for (const p of g.prods) {
    moves.push({ from: "q", input: EPS, pop: p.lhs, to: "q", push: [...p.rhs] });
    why.push({ kind: "expand", prod: p.i, text: `Expand ${p.lhs}: replace it on the stack by ${p.rhs.length ? p.rhs.join(" ") : "nothing (ε)"}.` });
  }
  for (const a of g.terminals) {
    moves.push({ from: "q", input: a, pop: a, to: "q", push: [] });
    why.push({ kind: "match", t: a, text: `Match ${a}: read it from the input and pop it.` });
  }
  const pda = makePDA({ states: ["q"], start: "q", accept: [], bottom: g.start, mode: "empty", moves });
  // Terminals on the stack must each be matched by a later input symbol, so a
  // configuration with more terminals on the stack than input left is hopeless.
  // Likewise every symbol that can't vanish (a terminal, or a variable that is
  // not nullable) needs at least one input symbol of its own.
  const nullable = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) if (!nullable.has(p.lhs) && p.rhs.every((s) => nullable.has(s))) { nullable.add(p.lhs); changed = true; }
  }
  const prune = (c, tokens) => c.stack.filter((x) => !nullable.has(x.s)).length > tokens.length - c.pos;
  return { pda, why, prune };
}

export const EXAMPLES = {
  anbn: { name: "aⁿbⁿ, n ≥ 1 (final state)", input: "aaabbb", about: "Push an A for every a, pop one for every b, and accept when only Z is left.", text: "start: q0\nstack: Z\naccept: q2\nq0 a Z -> q0 AZ\nq0 a A -> q0 AA\nq0 b A -> q1 ε\nq1 b A -> q1 ε\nq1 ε Z -> q2 Z" },
  wcwr: { name: "wcwᴿ (deterministic)", input: "abcba", about: "Push each symbol until the marker c, then pop and match the mirror image.", text: "start: q0\nstack: Z\naccept: q2\nq0 a ε -> q0 A\nq0 b ε -> q0 B\nq0 c ε -> q1 ε\nq1 a A -> q1 ε\nq1 b B -> q1 ε\nq1 ε Z -> q2 Z" },
  wwr: { name: "wwᴿ, even palindromes (guesses the middle)", input: "abba", about: "There is no marker, so at every point the PDA guesses that it might be at the middle (the ε-move to q1). Only the right guess survives.", text: "start: q0\nstack: Z\naccept: q2\nq0 a ε -> q0 a\nq0 b ε -> q0 b\nq0 ε ε -> q1 ε\nq1 a a -> q1 ε\nq1 b b -> q1 ε\nq1 ε Z -> q2 Z" },
  parens: { name: "Balanced parentheses (empty stack)", input: "(()())", about: "Push X for every (, pop one for every ). When only Z is left it can be popped, emptying the stack.", text: "start: q\nstack: Z\nmode: empty\nq ( Z -> q XZ\nq ( X -> q XX\nq ) X -> q ε\nq ε Z -> q ε" },
};

export const GRAMMARS = {
  anbn: { name: "S → a S b | ε", text: "S -> a S b | ε", input: "aabb" },
  expr: { name: "Expressions (left-recursive)", text: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", input: "id+id*id" },
  parens: { name: "Balanced parentheses", text: "S -> ( S ) S | ε", input: "(())()" },
  pal: { name: "Palindromes over {a, b}", text: "P -> a P a | b P b | a | b | ε", input: "abba" },
};
