// Finite automata: parsing, running (DFA / NFA / ε-NFA), subset construction,
// DFA minimisation and Thompson's construction from regular expressions.
//
// Automata are written one transition per line, plus start/accept lines:
//   start: q0
//   accept: q2
//   q0 a q1          (several targets allowed: q0 a q1 q2)
//   q1 ε q2          (ε, eps or epsilon for empty moves)

export const EPS = "ε";
const EPS_WORDS = new Set(["ε", "eps", "epsilon", "λ", "lambda"]);
const key = (q, a) => `${q}\u0000${a}`;
const byName = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);

export function parseAutomaton(text) {
  let start = null;
  const accept = new Set(), states = new Set(), alphabet = new Set(), delta = new Map(), order = [];
  const addState = (q) => { if (!states.has(q)) { states.add(q); order.push(q); } };
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    let m = /^start\s*[:=]\s*(\S+)$/i.exec(line);
    if (m) { start = m[1]; addState(start); continue; }
    m = /^(?:accept|final|accepting)\s*[:=]\s*(.+)$/i.exec(line);
    if (m) { for (const q of m[1].split(/[\s,]+/).filter(Boolean)) accept.add(q); continue; }
    const parts = line.replace(/->|→|,/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length < 3) throw new Error(`Can't read "${line}". Write transitions like "q0 a q1".`);
    const [from, sym0, ...to] = parts;
    const sym = EPS_WORDS.has(sym0.toLowerCase()) ? EPS : sym0;
    if (sym !== EPS && [...sym].length !== 1) throw new Error(`"${sym0}" in "${line}": input symbols are single characters (use ε for empty moves).`);
    addState(from);
    for (const t of to) addState(t);
    if (sym !== EPS) alphabet.add(sym);
    const k = key(from, sym), list = delta.get(k) ?? [];
    for (const t of to) if (!list.includes(t)) list.push(t);
    delta.set(k, list);
  }
  if (!start) throw new Error('Add a start line, e.g. "start: q0".');
  for (const q of accept) addState(q); // accepting states with no moves still exist
  if (states.size > 30) throw new Error("Use at most 30 states.");
  if (alphabet.size > 8) throw new Error("Use at most 8 input symbols.");
  return build(order, [...alphabet].sort(), start, [...accept], delta);
}

function build(states, alphabet, start, accept, delta) {
  let hasEps = false, deterministic = true, complete = true;
  for (const [k, list] of delta) {
    if (k.endsWith(`\u0000${EPS}`)) hasEps = true;
    if (list.length > 1) deterministic = false;
  }
  for (const q of states) for (const a of alphabet) if (!(delta.get(key(q, a)) ?? []).length) complete = false;
  return {
    states, alphabet, start, accept, delta,
    kind: hasEps ? "ε-NFA" : deterministic ? "DFA" : "NFA",
    complete,
    next: (q, a) => delta.get(key(q, a)) ?? [],
  };
}

export function toText(fa) {
  const lines = [`start: ${fa.start}`, `accept: ${fa.accept.join(" ")}`];
  for (const q of fa.states) for (const a of [...fa.alphabet, EPS]) {
    const t = fa.next(q, a);
    if (t.length) lines.push(`${q} ${a} ${t.join(" ")}`);
  }
  return lines.join("\n");
}

export function closure(fa, set) {
  const out = new Set(set), stack = [...set];
  while (stack.length) for (const t of fa.next(stack.pop(), EPS)) if (!out.has(t)) { out.add(t); stack.push(t); }
  return out;
}
const sorted = (set) => [...set].sort(byName);
const show = (set) => `{${sorted(set).join(", ")}}`;

// Pseudocode for each algorithm; steps name the line (1-based) being run.
export const CODE = {
  dfa: [
    "q ← q0",
    "for each symbol c of w, left to right",
    "  if δ(q, c) is undefined then reject  // stuck",
    "  q ← δ(q, c)",
    "accept iff q ∈ F",
  ],
  nfa: [
    "S ← ε-closure({q0})  // every state we could be in",
    "for each symbol c of w, left to right",
    "  M ← ∅",
    "  for each q in S: M ← M ∪ δ(q, c)  // move(S, c)",
    "  S ← ε-closure(M)",
    "  if S = ∅ then reject  // every path is stuck",
    "accept iff S contains an accepting state",
  ],
  subset: [
    "A ← ε-closure({q0}); Dstates ← {A}, unmarked",
    "while some T in Dstates is unmarked",
    "  mark T",
    "  for each input symbol a",
    "    U ← ε-closure(move(T, a))",
    "    if U is not in Dstates then",
    "      add U to Dstates, unmarked  // a new DFA state",
    "    Dtran[T, a] ← U",
    "accepting: every set containing an NFA accepting state",
  ],
  minimize: [
    "remove states unreachable from q0",
    "if moves are missing, add a dead state",
    "P ← { F, Q − F }  // 0-equivalence",
    "repeat for k ← 1, 2, …",
    "  for each group G in P",
    "    split G: p, q stay together only if, for every symbol a,",
    "      δ(p, a) and δ(q, a) are in the same group of P",
    "  P ← the groups after splitting",
    "until no group splits",
    "each group of P becomes one state of the minimal DFA",
  ],
  thompson: [
    "for each token t of the postfix regex",
    "  if t is a symbol a or ε: push s --a--> f",
    "  if t is · : pop B, A; merge A.end with B.start; push AB",
    "  if t is | : pop B, A; new s, f; s ε→ A, B; A, B ε→ f; push A|B",
    "  if t is *, + or ? : pop A; new s, f; add loop and/or bypass; push",
    "the one fragment left on the stack is the NFA",
  ],
};

// Run the automaton on a string, keeping the set of active states (one state for a DFA).
export function run(fa, input) {
  const symbols = [...String(input)];
  const dfa = fa.kind === "DFA";
  let current = closure(fa, [fa.start]);
  const steps = [{ index: 0, active: sorted(current), via: [], line: 1, vars: dfa ? { q: fa.start, w: symbols.join("") || "ε" } : { S: show(current), w: symbols.join("") || "ε" }, note: fa.kind === "ε-NFA" ? `Start in ε-closure(${fa.start}) = ${show(current)}: the start state plus everything reachable from it by ε-moves alone.` : `Start in ${fa.start}${dfa ? "" : ", the only state the NFA can be in before reading anything"}.` }];
  symbols.forEach((c, i) => {
    const via = [], moved = new Set();
    for (const q of current) for (const t of fa.next(q, c)) { moved.add(t); via.push({ from: q, sym: c, to: t }); }
    const next = closure(fa, moved);
    let note;
    if (!fa.alphabet.includes(c)) note = `"${c}" isn't in the alphabet {${fa.alphabet.join(", ")}}, so there's nowhere to go.`;
    else if (!next.size) note = `Read "${c}": no transitions from ${show(current)}, so the automaton gets stuck.`;
    else if (fa.kind === "DFA") note = `Read "${c}": ${[...current][0]} → ${[...next][0]}.`;
    else note = `Read "${c}": move ${show(current)} to ${show(moved)}${fa.kind === "ε-NFA" ? `, then ε-closure = ${show(next)}` : ""}. Every state follows all of its ${c}-moves, so the set holds everywhere a guess could have led.`;
    const was = current;
    current = next;
    const stuck = !next.size;
    const line = dfa ? (stuck ? [2, 3] : [2, 4]) : (stuck ? [4, 5, 6] : [3, 4, 5]);
    const vars = dfa ? { i, c, q: stuck ? "stuck" : [...next][0], w: symbols.join("") }
      : { i, c, "S before": show(was), M: show(moved), S: show(next), "|S|": next.size };
    steps.push({ index: i + 1, active: sorted(current), via, note, line, vars });
  });
  const accepted = [...current].some((q) => fa.accept.includes(q));
  const last = steps.at(-1);
  last.line = [...new Set([...[last.line].flat(), dfa ? 5 : 7])];
  last.vars = { ...last.vars, accepted };
  steps.at(-1).note += accepted
    ? ` The input is used up in ${show(new Set([...current].filter((q) => fa.accept.includes(q))))}, an accepting state: ACCEPTED.`
    : ` The input is used up and no active state is accepting: REJECTED.`;
  return { steps, accepted };
}

// Subset construction: each DFA state is a set of NFA states.
export function subsetConstruction(nfa, { includeDead = true } = {}) {
  const names = [], sets = [], steps = [];
  const nameFor = (i) => (i < 26 ? String.fromCharCode(65 + i) : `S${i}`);
  const find = (set) => sets.findIndex((s) => s.size === set.size && [...set].every((q) => s.has(q)));
  const start = closure(nfa, [nfa.start]);
  sets.push(start); names.push(nameFor(0));
  steps.push({ state: "A", line: 1, vars: { T: "–", a: "–", Dstates: ["A"], unmarked: ["A"] }, note: `A = ε-closure({${nfa.start}}) = ${show(start)}. It's the DFA's start state, and it's unmarked: its moves haven't been worked out yet.` });
  const delta = new Map();
  for (let i = 0; i < sets.length; i++) {
    for (const a of nfa.alphabet) {
      const moved = new Set();
      for (const q of sets[i]) for (const t of nfa.next(q, a)) moved.add(t);
      const target = closure(nfa, moved);
      if (!target.size && !includeDead) continue;
      let j = find(target), fresh = false;
      if (j === -1) { sets.push(target); names.push(target.size ? nameFor(sets.length - 1) : "∅"); j = sets.length - 1; fresh = true; }
      delta.set(key(names[i], a), [names[j]]);
      steps.push({
        from: names[i], sym: a, to: names[j], fresh,
        line: fresh ? [3, 4, 5, 6, 7, 8] : [3, 4, 5, 6, 8],
        vars: { T: `${names[i]} = ${show(sets[i])}`, a, "move(T, a)": show(moved), U: `${names[j]} = ${show(target)}`, Dstates: [...names], unmarked: names.slice(i + 1) },
        note: `From ${names[i]} ${show(sets[i])} on "${a}": move = ${show(moved)}${nfa.kind === "ε-NFA" ? `, ε-closure = ${show(target)}` : ""} → ${fresh ? `a set we haven't seen, so it becomes new state ${names[j]} (unmarked, to be processed later)` : `the same set as ${names[j]}, so the move just points there`}.`,
      });
      if (sets.length > 64) throw new Error("The DFA would have more than 64 states.");
    }
  }
  const accept = names.filter((_, i) => [...sets[i]].some((q) => nfa.accept.includes(q)));
  const lastStep = steps.at(-1);
  lastStep.line = [...[lastStep.line].flat(), 9];
  lastStep.vars = { ...lastStep.vars, unmarked: [], accepting: accept };
  const dfa = build([...names], nfa.alphabet, "A", accept, delta);
  return { dfa, sets: Object.fromEntries(names.map((n, i) => [n, sorted(sets[i])])), steps };
}

// DFA minimisation by partition refinement (the k-equivalence method).
export function minimize(dfaIn) {
  if (dfaIn.kind !== "DFA") throw new Error("Minimisation needs a DFA. Convert the NFA first.");
  const steps = [];
  // 1. Drop unreachable states.
  const reach = new Set([dfaIn.start]), stack = [dfaIn.start];
  while (stack.length) { const q = stack.pop(); for (const a of dfaIn.alphabet) for (const t of dfaIn.next(q, a)) if (!reach.has(t)) { reach.add(t); stack.push(t); } }
  const unreachable = dfaIn.states.filter((q) => !reach.has(q));
  if (unreachable.length) steps.push({ note: `Remove unreachable state${unreachable.length > 1 ? "s" : ""} ${unreachable.join(", ")}: nothing leads there from ${dfaIn.start}.` });
  let states = dfaIn.states.filter((q) => reach.has(q));
  // 2. Make it complete with a dead state.
  const delta = new Map();
  let dead = null;
  for (const q of states) for (const a of dfaIn.alphabet) {
    const t = dfaIn.next(q, a)[0];
    if (t) delta.set(key(q, a), t);
    else { dead = dead ?? "dead"; delta.set(key(q, a), dead); }
  }
  if (dead) {
    states = [...states, dead];
    for (const a of dfaIn.alphabet) delta.set(key(dead, a), dead);
    steps.push({ note: "Some transitions are missing, so add a dead (trap) state that every missing move goes to." });
  }
  const accepting = new Set(dfaIn.accept.filter((q) => reach.has(q)));
  // 3. Refine.
  let groups = [states.filter((q) => !accepting.has(q)), states.filter((q) => accepting.has(q))].filter((g) => g.length);
  const showP = (gs) => gs.map((g) => `{${g.join(",")}}`).join(" ");
  const rounds = [{ k: 0, groups: groups.map((g) => [...g]), line: [1, 2, 3], vars: { k: 0, P: showP(groups), "|P|": groups.length, unreachable: unreachable.length ? unreachable : "none", dead: dead ? "added" : "not needed" }, note: `0-equivalence: split accepting from non-accepting states. Only the empty string has been tried so far, and it already separates F from the rest.` }];
  for (let k = 1; ; k++) {
    const groupOf = new Map(groups.flatMap((g, i) => g.map((q) => [q, i])));
    const next = [];
    const reasons = [];
    for (const g of groups) {
      const bySig = new Map();
      for (const q of g) {
        const sig = dfaIn.alphabet.map((a) => groupOf.get(delta.get(key(q, a)))).join(",");
        if (!bySig.has(sig)) bySig.set(sig, []);
        bySig.get(sig).push(q);
      }
      if (bySig.size > 1) reasons.push(`{${g.join(", ")}} splits into ${[...bySig.values()].map((x) => `{${x.join(", ")}}`).join(" and ")}: their moves lead into different groups.`);
      next.push(...bySig.values());
    }
    rounds.push({
      k, groups: next.map((g) => [...g]),
      line: next.length === groups.length ? [4, 5, 6, 7, 9] : [4, 5, 6, 7, 8],
      vars: { k, P: showP(next), "|P|": next.length, splits: reasons.length || "none" },
      note: next.length === groups.length ? `${k}-equivalence: no group splits, so the partition is final. States left in the same group agree on every string.` : `${k}-equivalence: ${reasons.join(" ")} Some string of length ${k} now tells them apart.`,
    });
    if (next.length === groups.length) break;
    groups = next;
  }
  // 4. Build the minimal DFA: one state per group.
  const final = rounds.at(-1).groups;
  const label = (g) => (g.length === 1 ? g[0] : `{${g.join(",")}}`);
  const groupIdx = new Map(final.flatMap((g, i) => g.map((q) => [q, i])));
  const minDelta = new Map();
  for (const g of final) for (const a of dfaIn.alphabet) minDelta.set(key(label(g), a), [label(final[groupIdx.get(delta.get(key(g[0], a)))])]);
  const min = build(final.map(label), dfaIn.alphabet, label(final[groupIdx.get(dfaIn.start)]), final.filter((g) => accepting.has(g[0])).map(label), minDelta);
  return { min, rounds, steps, unreachable, dead: !!dead };
}

// --- Regular expressions → ε-NFA (Thompson's construction) -----------------------
const OPS = new Set(["|", "*", "+", "?", "(", ")"]);

function tokenize(re) {
  const out = [];
  for (const c of String(re).replace(/\s+/g, "")) {
    if (c === "ε") out.push({ t: "eps" });
    else if (OPS.has(c)) out.push({ t: c });
    else out.push({ t: "sym", v: c });
  }
  if (!out.length) throw new Error("Enter a regular expression, e.g. (a|b)*abb.");
  // Insert explicit concatenation (·) where two operands meet.
  const withConcat = [];
  out.forEach((tok, i) => {
    withConcat.push(tok);
    const nxt = out[i + 1];
    if (!nxt) return;
    const endsOperand = tok.t === "sym" || tok.t === "eps" || tok.t === ")" || tok.t === "*" || tok.t === "+" || tok.t === "?";
    const startsOperand = nxt.t === "sym" || nxt.t === "eps" || nxt.t === "(";
    if (endsOperand && startsOperand) withConcat.push({ t: "·" });
  });
  return withConcat;
}

function toPostfix(tokens) {
  const prec = { "|": 1, "·": 2 }, out = [], ops = [];
  let depth = 0, expectOperand = true;
  for (const tok of tokens) {
    if (tok.t === "sym" || tok.t === "eps") { out.push(tok); expectOperand = false; }
    else if (tok.t === "(") { ops.push(tok); depth++; expectOperand = true; }
    else if (tok.t === ")") {
      if (expectOperand) throw new Error("Empty parentheses or a missing operand before ')'.");
      if (--depth < 0) throw new Error("A ')' has no matching '('.");
      while (ops.at(-1).t !== "(") out.push(ops.pop());
      ops.pop();
    } else if (tok.t === "*" || tok.t === "+" || tok.t === "?") {
      if (expectOperand) throw new Error(`"${tok.t}" needs something before it.`);
      out.push(tok); // postfix unary, highest precedence
    } else {
      if (expectOperand) throw new Error(`"${tok.t === "·" ? "concatenation" : tok.t}" is missing an operand.`);
      while (ops.length && ops.at(-1).t !== "(" && prec[ops.at(-1).t] >= prec[tok.t]) out.push(ops.pop());
      ops.push(tok);
      expectOperand = true;
    }
  }
  if (expectOperand) throw new Error("The expression ends with an operator.");
  if (depth) throw new Error("A '(' is never closed.");
  while (ops.length) out.push(ops.pop());
  return out;
}

export function regexToNfa(re) {
  const postfix = toPostfix(tokenize(re));
  // States get numbered at the end, once concatenation has merged some away,
  // so notes are written against internal ids and resolved through name().
  let n = 0;
  const delta = new Map(), steps = [], alias = new Map(), created = [];
  const fresh = () => { created.push(n); return n++; };
  const add = (from, sym, to) => { const k = key(from, sym), l = delta.get(k) ?? []; l.push(to); delta.set(k, l); };
  const real = (q) => { while (alias.has(q)) q = alias.get(q); return q; };
  const stack = [];
  const shown = postfix.map((t) => (t.t === "sym" ? t.v : t.t === "eps" ? "ε" : t.t));
  for (const [ti, tok] of postfix.entries()) {
    if (tok.t === "sym" || tok.t === "eps") {
      const s = fresh(), f = fresh(), sym = tok.t === "eps" ? EPS : tok.v;
      add(s, sym, f);
      stack.push({ start: s, end: f, text: sym });
      steps.push({ note: (name) => `Basis for "${sym}": ${name(s)} --${sym}--> ${name(f)}.`, states: [s, f] });
    } else if (tok.t === "·") {
      const b = stack.pop(), a = stack.pop();
      // Thompson start states have no incoming edges, so b's start can be fused
      // into a's final state: its outgoing moves now leave from a.end.
      for (const [k, list] of [...delta]) {
        const [from, sym] = k.split("\u0000");
        if (Number(from) === b.start) { delta.delete(k); for (const t of list) add(a.end, sym, t); }
      }
      alias.set(b.start, a.end);
      stack.push({ start: a.start, end: b.end, text: `${wrap(a.text, "·")}${wrap(b.text, "·")}` });
      steps.push({ note: (name) => `Concatenate ${a.text} and ${b.text}: the final state of ${a.text} becomes the start of ${b.text} (state ${name(a.end)}).`, states: [a.end] });
    } else if (tok.t === "|") {
      const b = stack.pop(), a = stack.pop();
      const s = fresh(), f = fresh();
      add(s, EPS, a.start); add(s, EPS, b.start); add(a.end, EPS, f); add(b.end, EPS, f);
      stack.push({ start: s, end: f, text: `${a.text}|${b.text}` });
      steps.push({ note: (name) => `Union ${a.text} | ${b.text}: new start ${name(s)} branches to both by ε; both ends join new final ${name(f)}.`, states: [s, f] });
    } else {
      const a = stack.pop(), op = tok.t;
      const s = fresh(), f = fresh();
      add(s, EPS, a.start); add(a.end, EPS, f);
      if (op !== "?") add(a.end, EPS, a.start);   // repeat
      if (op !== "+") add(s, EPS, f);             // skip entirely
      stack.push({ start: s, end: f, text: `${wrap(a.text, op)}${op}` });
      steps.push({ note: (name) => `${op === "*" ? "Kleene star" : op === "+" ? "One or more (+)" : "Optional (?)"} on ${a.text}: new start ${name(s)} and final ${name(f)}${op !== "?" ? `, a loop back from ${name(a.end)} to ${name(a.start)}` : ""}${op !== "+" ? `, and a bypass ${name(s)} → ${name(f)}` : ""}.`, states: [s, f] });
    }
    if (n > 120) throw new Error("That expression is too long. Keep it under about 60 symbols.");
    Object.assign(steps.at(-1), {
      line: tok.t === "sym" || tok.t === "eps" ? [1, 2] : tok.t === "·" ? [1, 3] : tok.t === "|" ? [1, 4] : [1, 5],
      vars: { t: shown[ti], position: `${ti + 1} of ${postfix.length}`, stack: stack.map((f) => f.text), states: n - alias.size },
      created: n, fusedN: alias.size,
      edges: [...delta].flatMap(([k, list]) => { const [from, sym] = k.split("\u0000"); return list.map((to) => [Number(from), sym, to]); }),
      frag: { ...stack.at(-1) },
    });
  }
  const whole = stack.pop();
  const kept = created.filter((q) => !alias.has(q));
  const number = new Map(kept.map((q, i) => [q, `${i}`]));
  const name = (q) => number.get(real(q));
  const named = new Map();
  for (const [k, list] of delta) {
    const [from, sym] = k.split("\u0000");
    named.set(key(name(Number(from)), sym), list.map(name));
  }
  const alphabet = [...new Set([...delta.keys()].map((k) => k.split("\u0000")[1]).filter((x) => x !== EPS))].sort();
  const nfa = build(kept.map(name), alphabet, name(whole.start), [name(whole.end)], named);
  // Each step is drawn as the machine was then: a start state that a later
  // concatenation fuses away shows as "k′" (it will merge into state k).
  const fusedOrder = [...alias.keys()];
  const at = (st) => {
    const fused = new Set(fusedOrder.slice(0, st.fusedN));
    const nm = (q) => (number.has(q) ? number.get(q) : fused.has(q) ? name(q) : `${name(q)}′`);
    const nodes = created.filter((q) => q < st.created && !fused.has(q)).map(nm);
    const edges = [];
    for (const [from, sym, to] of st.edges) {
      const e = { from: nm(from), to: nm(to), label: sym };
      if (!edges.some((x) => x.from === e.from && x.to === e.to && x.label === e.label)) edges.push(e);
    }
    return { line: st.line, vars: st.vars, note: st.note(nm), states: [...new Set(st.states.map(nm))], nodes, edges, start: nm(st.frag.start), end: nm(st.frag.end), text: st.frag.text };
  };
  return {
    nfa,
    steps: steps.map(at),
    postfix: postfix.map((t) => (t.t === "sym" ? t.v : t.t === "eps" ? "ε" : t.t)).join(""),
  };
}
const wrap = (s, op) => (s.length > 1 && (op === "*" || op === "+" || op === "?" || s.includes("|")) && !/^\(.*\)$/.test(s) ? `(${s})` : s);

export const EXAMPLES = {
  endsAbb: { name: "DFA: strings ending in abb", text: "start: 0\naccept: 3\n0 a 1\n0 b 0\n1 a 1\n1 b 2\n2 a 1\n2 b 3\n3 a 1\n3 b 0" },
  evenZeros: { name: "DFA: even number of 0s", text: "start: E\naccept: E\nE 0 O\nE 1 E\nO 0 E\nO 1 O" },
  nfa: { name: "NFA: third symbol from the end is 1", text: "start: q0\naccept: q3\nq0 0 q0\nq0 1 q0 q1\nq1 0 q2\nq1 1 q2\nq2 0 q3\nq2 1 q3" },
  enfa: { name: "ε-NFA: a* or b*", text: "start: s\naccept: p q\ns ε p\ns ε q\np a p\nq b q" },
  redundant: { name: "DFA with equivalent states (minimise me)", text: "start: A\naccept: E\nA 0 B\nA 1 C\nB 0 B\nB 1 D\nC 0 B\nC 1 C\nD 0 B\nD 1 E\nE 0 B\nE 1 C" },
};
