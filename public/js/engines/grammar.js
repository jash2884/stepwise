// Context-free grammars: parsing, left recursion and left factoring, FIRST and
// FOLLOW, LL(1) tables and parsing, LR(0) / SLR(1) / LALR(1) / CLR(1) automata,
// tables and parsing, and CYK.
//
// Grammars are written one non-terminal per line:
//   E -> E + T | T
//   F -> ( E ) | id
// The first left-hand side is the start symbol and ε (or eps) is the empty string.
// Symbols may be separated by spaces; without spaces, bodies are split into the
// longest known non-terminals, "id", and single characters (so TE' works).

export const EPS = "ε";
export const END = "$";
const EPS_WORDS = new Set(["ε", "eps", "epsilon", "λ", "lambda"]);
const LIMIT = 60;

// Pseudocode for each algorithm; steps name the 1-based line being run.
export const CODE = {
  leftRecursion: [
    "order the non-terminals A1, A2, …, An",
    "for i ← 1 … n",
    "  for j ← 1 … i − 1",
    "    replace each Ai → Aj γ by Ai → δ1 γ | … | δk γ  // Aj → δ1 | … | δk",
    "  remove Ai's immediate left recursion:",
    "    Ai → Ai α | β  becomes  Ai → β Ai′,  Ai′ → α Ai′ | ε",
  ],
  leftFactor: [
    "repeat",
    "  for each non-terminal A",
    "    α ← longest prefix shared by two or more A-bodies",
    "    if α ≠ ε then",
    "      A → α β1 | … | α βn | γ  becomes  A → α A′ | γ",
    "      A′ → β1 | … | βn",
    "until no two bodies of any non-terminal share a prefix",
  ],
  firstFollow: [
    "FIRST(A) ← ∅ and FOLLOW(A) ← ∅ for every non-terminal A",
    "repeat",
    "  for each rule A → X1 X2 … Xn",
    "    add FIRST(X1 … Xn) to FIRST(A)  // past nullable Xi; ε if all vanish",
    "until no FIRST set changes",
    "FOLLOW(S) ← { $ }",
    "repeat",
    "  for each rule A → α B β, B a non-terminal",
    "    add FIRST(β) − { ε } to FOLLOW(B)",
    "    if β ⇒* ε then add FOLLOW(A) to FOLLOW(B)",
    "until no FOLLOW set changes",
  ],
  ll1Parse: [
    "push $, then the start symbol S",
    "a ← first input token",
    "loop",
    "  X ← symbol on top of the stack",
    "  if X = $ and a = $ then accept",
    "  else if X is a terminal or $",
    "    if X = a then pop X; a ← next token  // match",
    "    else error  // expected X",
    "  else if M[X, a] = X → Y1 Y2 … Yk",
    "    pop X; push Yk, …, Y2, Y1  // Y1 ends up on top",
    "  else error  // empty table cell",
  ],
  lrBuild: [
    "C ← { closure({ S′ → •S }) }",
    "repeat",
    "  for each item set I in C",
    "    for each symbol X right after a dot in I",
    "      J ← closure(items of I with the dot moved past X)  // goto(I, X)",
    "      if J is not in C then add J to C",
    "      record the move I —X→ J",
    "until no new sets are added",
  ],
  lrParse: [
    "push state 0; a ← first input token",
    "loop",
    "  s ← state on top of the stack",
    "  if ACTION[s, a] = shift t then",
    "    push a, then t; a ← next token",
    "  else if ACTION[s, a] = reduce A → β then",
    "    pop 2·|β| entries; t ← state now on top",
    "    push A, then GOTO[t, A]",
    "  else if ACTION[s, a] = accept then accept",
    "  else error",
  ],
  cyk: [
    "for i ← 1 … n",
    "  T[i, i] ← { A | A → wᵢ is a rule }",
    "for len ← 2 … n  // span length",
    "  for i ← 1 … n − len + 1",
    "    j ← i + len − 1; T[i, j] ← ∅",
    "    for k ← i … j − 1  // split after position k",
    "      for each rule A → B C with B ∈ T[i, k] and C ∈ T[k+1, j]",
    "        T[i, j] ← T[i, j] ∪ { A }",
    "accept iff S ∈ T[1, n]",
  ],
};

function splitBody(body, nts) {
  const names = [...nts].sort((a, b) => b.length - a.length);
  const greedy = (s) => {
    const out = [];
    for (let i = 0; i < s.length;) {
      const nt = names.find((n) => s.startsWith(n, i));
      if (nt) { out.push(nt); i += nt.length; continue; }
      if (s.startsWith("id", i)) { out.push("id"); i += 2; continue; }
      const m = /^<[^>]+>/.exec(s.slice(i));
      if (m) { out.push(m[0]); i += m[0].length; continue; }
      out.push(s[i]); i += 1;
    }
    return out;
  };
  const t = body.trim();
  if (!t || EPS_WORDS.has(t)) return [];
  if (!/\s/.test(t)) return greedy(t);
  return t.split(/\s+/).flatMap((w) => (EPS_WORDS.has(w) ? [] : nts.has(w) || !names.some((n) => w.includes(n)) ? [w] : greedy(w)));
}

export function parseGrammar(text) {
  const rules = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("|") && rules.length) { rules.at(-1).body += ` ${line}`; continue; }
    const m = /^(\S+?)\s*(?:->|→|::=|:)\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write rules like "E -> E + T | T".`);
    rules.push({ lhs: m[1], body: m[2] });
  }
  if (!rules.length) throw new Error("Enter a grammar, one rule per line, e.g. S -> a S b | ε.");
  const nts = new Set(rules.map((r) => r.lhs));
  const prods = [];
  for (const r of rules) for (const alt of r.body.split("|")) {
    const rhs = splitBody(alt, nts);
    if (rhs.includes(END)) throw new Error(`"$" is reserved for the end of input.`);
    if (!prods.some((p) => p.lhs === r.lhs && same(p.rhs, rhs))) prods.push({ lhs: r.lhs, rhs });
  }
  if (prods.length > LIMIT) throw new Error(`Use at most ${LIMIT} productions.`);
  return make([...nts], prods, rules[0].lhs);
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function make(nonterminals, prods, start) {
  const nts = new Set(nonterminals);
  const terminals = [];
  for (const p of prods) for (const s of p.rhs) if (!nts.has(s) && !terminals.includes(s)) terminals.push(s);
  return { start, nonterminals: [...nonterminals], terminals, prods: prods.map((p, i) => ({ ...p, i })), isNT: (s) => nts.has(s) };
}

export const showProd = (p) => `${p.lhs} → ${p.rhs.length ? p.rhs.join(" ") : EPS}`;
export function toText(g) {
  return g.nonterminals.filter((A) => g.prods.some((p) => p.lhs === A))
    .map((A) => `${A} -> ${g.prods.filter((p) => p.lhs === A).map((p) => (p.rhs.length ? p.rhs.join(" ") : EPS)).join(" | ")}`).join("\n");
}

const fresh = (g, A) => { let n = `${A}'`; while (g.nonterminals.includes(n) || g.terminals.includes(n)) n += "'"; return n; };

// --- Left recursion ---------------------------------------------------------------
// The textbook algorithm: order the non-terminals A1..An; for each Ai, substitute
// every Ai → Aj γ (j < i), then remove Ai's immediate left recursion.
export function removeLeftRecursion(g0) {
  let g = g0;
  const steps = [];
  const warnings = [];
  if (g.prods.some((p) => !p.rhs.length)) warnings.push("The grammar has ε-productions. The algorithm is only guaranteed for grammars without them (and without cycles), so check the result.");
  const order = [...g.nonterminals];
  for (let i = 0; i < order.length; i++) {
    const Ai = order[i];
    for (let j = 0; j < i; j++) {
      const Aj = order[j];
      if (!g.prods.some((p) => p.lhs === Ai && p.rhs[0] === Aj)) continue;
      const next = [];
      for (const p of g.prods) {
        if (p.lhs === Ai && p.rhs[0] === Aj) {
          for (const q of g.prods.filter((x) => x.lhs === Aj)) next.push({ lhs: Ai, rhs: [...q.rhs, ...p.rhs.slice(1)] });
        } else next.push(p);
      }
      g = make(g.nonterminals, dedupe(next), g.start);
      steps.push({ kind: "substitute", nt: Ai, line: [2, 3, 4], vars: { i: i + 1, j: j + 1, Ai, Aj, "Aj bodies": g.prods.filter((x) => x.lhs === Aj).map((x) => x.rhs.join(" ") || EPS) }, note: `${Ai} starts with ${Aj}, which comes earlier in the order. Substitute ${Aj}'s bodies into those ${Ai} rules, so any hidden cycle through ${Aj} becomes immediate left recursion we can see.`, grammar: toText(g) });
    }
    const own = g.prods.filter((p) => p.lhs === Ai);
    const rec = own.filter((p) => p.rhs[0] === Ai), rest = own.filter((p) => p.rhs[0] !== Ai);
    if (!rec.length) continue;
    if (rec.some((p) => p.rhs.length === 1)) warnings.push(`${Ai} → ${Ai} is a cycle; it was dropped because it derives nothing new.`);
    const recs = rec.filter((p) => p.rhs.length > 1);
    const A2 = fresh(g, Ai);
    const next = [];
    for (const p of g.prods) {
      if (p.lhs !== Ai) next.push(p);
    }
    const insertAt = next.findIndex((p) => order.indexOf(p.lhs) > i);
    const added = [
      ...rest.map((p) => ({ lhs: Ai, rhs: [...p.rhs, A2] })),
      ...recs.map((p) => ({ lhs: A2, rhs: [...p.rhs.slice(1), A2] })),
      { lhs: A2, rhs: [] },
    ];
    if (!rest.length) added.unshift({ lhs: Ai, rhs: [A2] });
    next.splice(insertAt === -1 ? next.length : insertAt, 0, ...added);
    const nts = [...g.nonterminals];
    nts.splice(nts.indexOf(Ai) + 1, 0, A2);
    g = make(nts, dedupe(next), g.start);
    steps.push({
      kind: "direct", nt: Ai, line: [5, 6],
      vars: { i: i + 1, Ai, "α (after Ai)": recs.map((p) => p.rhs.slice(1).join(" ")), "β (other bodies)": rest.map((p) => p.rhs.join(" ") || EPS), "Ai′": A2 },
      note: `${Ai} is directly left-recursive: ${recs.map(showProd).join(", ")}. Rewrite A → Aα | β as A → β A' and A' → α A' | ε, with A' = ${A2}.`,
      grammar: toText(g),
    });
  }
  return { grammar: g, steps, warnings, changed: steps.length > 0 };
}

// --- Left factoring ---------------------------------------------------------------
export function leftFactor(g0) {
  let g = g0;
  const steps = [];
  for (let guard = 0; guard < 40; guard++) {
    let done = true;
    for (const A of g.nonterminals) {
      const own = g.prods.filter((p) => p.lhs === A && p.rhs.length);
      const groups = new Map();
      for (const p of own) { const k = p.rhs[0]; groups.set(k, [...(groups.get(k) ?? []), p]); }
      const group = [...groups.values()].find((x) => x.length > 1);
      if (!group) continue;
      let n = 1;
      while (group.every((p) => p.rhs.length > n && p.rhs[n] === group[0].rhs[n])) n++;
      const prefix = group[0].rhs.slice(0, n);
      const A2 = fresh(g, A);
      const next = [];
      let placed = false;
      for (const p of g.prods) {
        if (!group.includes(p)) { next.push(p); continue; }
        if (!placed) { next.push({ lhs: A, rhs: [...prefix, A2] }); placed = true; }
      }
      const tailAt = next.findLastIndex((p) => p.lhs === A) + 1;
      next.splice(tailAt, 0, ...group.map((p) => ({ lhs: A2, rhs: p.rhs.slice(n) })).sort((x, y) => (x.rhs.length ? 0 : 1) - (y.rhs.length ? 0 : 1)));
      const nts = [...g.nonterminals];
      nts.splice(nts.indexOf(A) + 1, 0, A2);
      g = make(nts, dedupe(next), g.start);
      steps.push({ nt: A, line: [2, 3, 4, 5, 6], vars: { pass: steps.length + 1, A, α: prefix.join(" "), "A′": A2, "β bodies": group.map((p) => p.rhs.slice(n).join(" ") || EPS) }, note: `${group.map(showProd).join(" and ")} all start with "${prefix.join(" ")}". With one token of lookahead a parser can't pick between them, so factor it out: ${A} → ${prefix.join(" ")} ${A2}, and ${A2} chooses what follows once the prefix has been read.`, grammar: toText(g) });
      done = false;
      break;
    }
    if (done) break;
  }
  return { grammar: g, steps, changed: steps.length > 0 };
}

function dedupe(prods) {
  const out = [];
  for (const p of prods) if (!out.some((q) => q.lhs === p.lhs && same(q.rhs, p.rhs))) out.push(p);
  return out;
}

// --- FIRST and FOLLOW ------------------------------------------------------------
export function firstOfSeq(seq, first, g) {
  const out = new Set();
  for (const s of seq) {
    if (!g.isNT(s)) { out.add(s); return out; }
    for (const x of first.get(s)) if (x !== EPS) out.add(x);
    if (!first.get(s).has(EPS)) return out;
  }
  out.add(EPS);
  return out;
}

export function firstFollow(g) {
  const first = new Map(g.nonterminals.map((A) => [A, new Set()]));
  const follow = new Map(g.nonterminals.map((A) => [A, new Set()]));
  const steps = [];
  const snap = () => ({
    first: Object.fromEntries([...first].map(([k, v]) => [k, order([...v], g)])),
    follow: Object.fromEntries([...follow].map(([k, v]) => [k, order([...v], g)])),
  });
  for (let round = 1, changed = true; changed; round++) {
    changed = false;
    for (const p of g.prods) {
      const f = firstOfSeq(p.rhs, first, g), target = first.get(p.lhs);
      const added = [...f].filter((x) => !target.has(x));
      if (!added.length) continue;
      added.forEach((x) => target.add(x));
      changed = true;
      const why = !p.rhs.length ? "it can derive ε directly"
        : !g.isNT(p.rhs[0]) ? `the body starts with the terminal ${p.rhs[0]}`
        : `the body starts with ${p.rhs[0]}${f.has(EPS) || p.rhs.length > 1 && first.get(p.rhs[0])?.has(EPS) ? " (looking past nullable symbols)" : ""}`;
      steps.push({ phase: "first", round, prod: p.i, target: p.lhs, added: order(added, g), line: [2, 3, 4], vars: { pass: round, rule: showProd(p), A: p.lhs, "FIRST(body)": order([...f], g), added: order(added, g) }, note: `FIRST pass ${round}, ${showProd(p)}: add {${order(added, g).join(", ")}} to FIRST(${p.lhs}), because ${why}.`, ...snap() });
    }
  }
  follow.get(g.start).add(END);
  steps.push({ phase: "follow", round: 0, target: g.start, added: [END], line: [5, 6], vars: { pass: 0, B: g.start, added: [END] }, note: `FOLLOW(${g.start}) gets $: the start symbol is followed by the end of input.`, ...snap() });
  for (let round = 1, changed = true; changed; round++) {
    changed = false;
    for (const p of g.prods) p.rhs.forEach((B, k) => {
      if (!g.isNT(B)) return;
      const beta = p.rhs.slice(k + 1), fb = firstOfSeq(beta, first, g), target = follow.get(B);
      const fromFirst = [...fb].filter((x) => x !== EPS && !target.has(x));
      fromFirst.forEach((x) => target.add(x));
      const fromFollow = fb.has(EPS) ? [...follow.get(p.lhs)].filter((x) => !target.has(x)) : [];
      fromFollow.forEach((x) => target.add(x));
      if (!fromFirst.length && !fromFollow.length) return;
      changed = true;
      const parts = [];
      if (fromFirst.length) parts.push(`FIRST(${beta.join(" ")}) gives {${order(fromFirst, g).join(", ")}}`);
      if (fromFollow.length) parts.push(`${beta.length ? `${beta.join(" ")} can vanish, so` : `${B} is at the end, so`} FOLLOW(${p.lhs}) gives {${order(fromFollow, g).join(", ")}}`);
      steps.push({ phase: "follow", round, prod: p.i, target: B, added: order([...fromFirst, ...fromFollow], g), line: [7, 8, ...(fromFirst.length ? [9] : []), ...(fromFollow.length ? [10] : [])], vars: { pass: round, rule: showProd(p), A: p.lhs, B, β: beta.join(" ") || EPS, "FIRST(β)": order([...fb], g), added: order([...fromFirst, ...fromFollow], g) }, note: `FOLLOW pass ${round}, ${showProd(p)}: ${parts.join("; ")}.`, ...snap() });
    });
  }
  steps.push({ phase: "done", line: 11, vars: { nullable: g.nonterminals.filter((A) => first.get(A).has(EPS)) }, note: "Nothing changed in a full pass, so every set is final. (Each pass can only add symbols and the sets are finite, so this always stops.)", ...snap() });
  return { first, follow, steps, nullable: g.nonterminals.filter((A) => first.get(A).has(EPS)) };
}

function order(list, g) {
  const rank = (x) => (x === EPS ? 1e6 : x === END ? 1e6 - 1 : g.terminals.indexOf(x));
  return [...list].sort((a, b) => rank(a) - rank(b));
}

// --- LL(1) ----------------------------------------------------------------------
export function ll1(g) {
  const { first, follow } = firstFollow(g);
  const cols = [...g.terminals, END];
  const table = new Map(), reasons = [];
  const put = (A, a, p, why) => {
    const k = `${A}\u0000${a}`, list = table.get(k) ?? [];
    if (!list.includes(p.i)) list.push(p.i);
    table.set(k, list);
    reasons.push({ nt: A, t: a, prod: p.i, why });
  };
  for (const p of g.prods) {
    const f = firstOfSeq(p.rhs, first, g);
    for (const a of f) if (a !== EPS) put(p.lhs, a, p, `${a} ∈ FIRST(${p.rhs.join(" ") || EPS})`);
    if (f.has(EPS)) for (const b of follow.get(p.lhs)) put(p.lhs, b, p, `${p.rhs.length ? `${p.rhs.join(" ")} can derive ε` : "the body is ε"} and ${b} ∈ FOLLOW(${p.lhs})`);
  }
  const conflicts = [];
  for (const [k, list] of table) if (list.length > 1) { const [nt, t] = k.split("\u0000"); conflicts.push({ nt, t, prods: list }); }
  return { first, follow, cols, table, reasons, conflicts, cell: (A, a) => table.get(`${A}\u0000${a}`) ?? [] };
}

export function tokenize(input, g) {
  const s = String(input).trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/);
  const ts = [...g.terminals].sort((a, b) => b.length - a.length), out = [];
  for (let i = 0; i < s.length;) {
    const t = ts.find((x) => s.startsWith(x, i)) ?? s[i];
    out.push(t); i += t.length;
  }
  return out;
}

// Parse trees are nested { id, label, kids, state } objects; each step stores a
// copy so the view can animate the tree growing.
let nodeId = 0;
const node = (label, state = "open") => ({ id: ++nodeId, label, kids: [], state });
const clone = (n) => ({ id: n.id, label: n.label, state: n.state, kids: n.kids.map(clone) });

export function ll1Parse(g, table, tokens, { limit = 400 } = {}) {
  const input = [...tokens, END];
  const root = node(g.start);
  const stack = [{ sym: END }, { sym: g.start, node: root }];
  const steps = [];
  let pos = 0, result = null;
  const push = (action, extra = {}) => steps.push({ stack: stack.map((x) => x.sym), pos, input, action, tree: clone(root), ...extra, vars: { X: stack.at(-1)?.sym ?? "–", a: input[pos] ?? END, ...(extra.vars ?? {}), depth: stack.length } });
  push("Start: push $ and the start symbol, and look at the first token.", { line: [1, 2] });
  while (!result) {
    if (steps.length > limit) { result = "limit"; push(`Stopped after ${limit} steps.`, { bad: true, line: 3 }); break; }
    const top = stack.at(-1), a = input[pos];
    if (top.sym === END && a === END) { result = "accept"; push("Stack and input both reached $: ACCEPT. Every token was matched by a terminal some rule predicted.", { good: true, line: [4, 5], vars: { X: END, a: END } }); break; }
    if (top.sym === END || !g.isNT(top.sym)) {
      if (top.sym === a) {
        stack.pop(); pos++;
        top.node.state = "matched";
        push(`Match ${a}: the terminal on top of the stack is the next token, so pop it and advance the input.`, { match: a, line: [4, 6, 7], vars: { X: a, a } });
      } else {
        result = "error";
        if (top.node) top.node.state = "error";
        push(`Error: expected ${top.sym === END ? "the end of input" : top.sym} but the next token is ${a === END ? "the end of input" : a}.`, { bad: true, line: [4, 6, 8], vars: { X: top.sym, a } });
      }
      continue;
    }
    const cell = table.cell(top.sym, a);
    if (!cell.length) {
      result = "error";
      top.node.state = "error";
      push(`Error: M[${top.sym}, ${a}] is empty, so no rule for ${top.sym} can start with ${a === END ? "$" : a} here.`, { bad: true, line: [4, 11], vars: { X: top.sym, a, "M[X, a]": "empty" } });
      continue;
    }
    const p = g.prods[cell[0]];
    stack.pop();
    top.node.state = "expanded";
    const kids = p.rhs.length ? p.rhs.map((s) => node(s)) : [node(EPS, "matched")];
    top.node.kids = kids;
    for (let k = p.rhs.length - 1; k >= 0; k--) stack.push({ sym: p.rhs[k], node: kids[k] });
    push(`M[${top.sym}, ${a}] = ${showProd(p)}${cell.length > 1 ? ` (conflict: ${cell.length} rules in this cell, using the first)` : ""}: pop ${top.sym}, push ${p.rhs.length ? [...p.rhs].reverse().join(" ") : "nothing"}${p.rhs.length > 1 ? `, so ${p.rhs[0]} is on top` : ""}. In the tree, the body's symbols become children of ${top.sym}.`, { prod: p.i, nt: top.sym, t: a, line: [4, 9, 10], vars: { X: top.sym, a, "M[X, a]": showProd(p) } });
  }
  return { steps, accepted: result === "accept" };
}

// --- LR automata ----------------------------------------------------------------
export const LR_KINDS = { lr0: "LR(0)", slr: "SLR(1)", lalr: "LALR(1)", clr: "CLR(1)" };

export function augment(g) {
  const S = fresh(g, g.start);
  const prods = [{ lhs: S, rhs: [g.start] }, ...g.prods.map(({ lhs, rhs }) => ({ lhs, rhs }))];
  return make([S, ...g.nonterminals], prods, S);
}

export function lrAutomaton(g0, kind = "slr") {
  const g = augment(g0);
  const ff = firstFollow(g);
  const lr1 = kind === "lalr" || kind === "clr";
  const itemKey = (it) => `${it.p}.${it.d}${lr1 ? `.${it.la}` : ""}`;
  const closure = (items) => {
    const out = [...items], seen = new Set(out.map(itemKey));
    for (let k = 0; k < out.length; k++) {
      const { p, d, la } = out[k], B = g.prods[p].rhs[d];
      if (!B || !g.isNT(B)) continue;
      const las = lr1 ? [...firstOfSeq([...g.prods[p].rhs.slice(d + 1), la], ff.first, g)].filter((x) => x !== EPS) : [null];
      for (const q of g.prods) if (q.lhs === B) for (const b of las) {
        const it = { p: q.i, d: 0, la: b };
        if (!seen.has(itemKey(it))) { seen.add(itemKey(it)); out.push(it); }
      }
    }
    return out;
  };
  const setKey = (items) => items.map(itemKey).sort().join("|");
  const states = [closure([{ p: 0, d: 0, la: END }])];
  const keys = [setKey(states[0])];
  const edges = [], build = [{ state: 0, line: 1, vars: { I: "–", X: "–", J: "I0", "|C|": 1 }, note: `I0 = closure({${g.prods[0].lhs} → •${g.start}${lr1 ? ", $" : ""}}): the start item, plus an item B → •γ for every B that appears right after a dot.` }];
  for (let i = 0; i < states.length; i++) {
    const syms = [];
    for (const it of states[i]) { const X = g.prods[it.p].rhs[it.d]; if (X && !syms.includes(X)) syms.push(X); }
    for (const X of syms) {
      const kernel = states[i].filter((it) => g.prods[it.p].rhs[it.d] === X).map((it) => ({ ...it, d: it.d + 1 }));
      const target = closure(kernel), k = setKey(target);
      let j = keys.indexOf(k);
      const isNew = j === -1;
      if (isNew) { states.push(target); keys.push(k); j = states.length - 1; }
      edges.push({ from: i, sym: X, to: j });
      build.push({ state: j, from: i, sym: X, fresh: isNew, line: isNew ? [3, 4, 5, 6, 7] : [3, 4, 5, 7], vars: { I: `I${i}`, X, J: `I${j}`, "|C|": states.length, new: isNew }, note: `goto(I${i}, ${X}): move the dot past ${X} in every item of I${i} that has ${X} next, then close. ${isNew ? `That's a set we haven't seen: new state I${j}.` : `That's I${j} again, so just add the move.`}` });
      if (states.length > 250) throw new Error("The automaton has more than 250 states. Try a smaller grammar.");
    }
  }
  let names = states.map((_, i) => `${i}`);
  let finalStates = states, finalEdges = edges, merged = null;
  if (kind === "lalr") {
    // Merge LR(1) states that share a core (the same items ignoring lookaheads).
    const coreKey = (items) => [...new Set(items.map((it) => `${it.p}.${it.d}`))].sort().join("|");
    const groups = [];
    const groupOf = states.map((s) => {
      const ck = coreKey(s);
      let gi = groups.findIndex((x) => x.core === ck);
      if (gi === -1) { groups.push({ core: ck, members: [] }); gi = groups.length - 1; }
      return gi;
    });
    states.forEach((_, i) => groups[groupOf[i]].members.push(i));
    finalStates = groups.map((grp) => {
      const out = [], seen = new Set();
      for (const m of grp.members) for (const it of states[m]) if (!seen.has(itemKey(it))) { seen.add(itemKey(it)); out.push(it); }
      return out;
    });
    const seenE = new Set();
    finalEdges = [];
    for (const e of edges) {
      const ne = { from: groupOf[e.from], sym: e.sym, to: groupOf[e.to] }, k = `${ne.from}.${ne.sym}`;
      if (!seenE.has(k)) { seenE.add(k); finalEdges.push(ne); }
    }
    names = groups.map((grp) => grp.members.join(grp.members.some((m) => m > 9) ? "," : ""));
    merged = groups.map((grp) => grp.members);
  }
  const display = finalStates.map((items) => {
    const byCore = new Map();
    for (const it of items) {
      const k = `${it.p}.${it.d}`;
      if (!byCore.has(k)) byCore.set(k, { p: it.p, d: it.d, las: [] });
      if (lr1 && !byCore.get(k).las.includes(it.la)) byCore.get(k).las.push(it.la);
    }
    return [...byCore.values()].map(({ p, d, las }) => {
      const pr = g.prods[p], body = [...pr.rhs.slice(0, d), "•", ...pr.rhs.slice(d)].join(" ");
      return { p, d, text: `${pr.lhs} → ${body}`, la: lr1 ? order(las, g).join("/") : null, complete: d === pr.rhs.length };
    });
  });
  return { g, ff, kind, states: finalStates, items: display, edges: finalEdges, names, merged, build, lr1Count: lr1 ? states.length : null };
}

export function lrTable(auto) {
  const { g, ff, kind, states, edges, names } = auto;
  const cols = [...g.terminals, END], gotoCols = g.nonterminals.slice(1);
  const action = states.map(() => new Map()), go = states.map(() => new Map());
  const add = (i, a, act) => {
    const list = action[i].get(a) ?? [];
    if (!list.some((x) => x.type === act.type && x.n === act.n)) list.push(act);
    action[i].set(a, list);
  };
  for (const e of edges) {
    if (g.isNT(e.sym)) go[e.from].set(e.sym, e.to);
    else add(e.from, e.sym, { type: "s", n: e.to });
  }
  states.forEach((items, i) => {
    for (const it of items) {
      const pr = g.prods[it.p];
      if (it.d !== pr.rhs.length) continue;
      if (it.p === 0) { add(i, END, { type: "acc" }); continue; }
      const las = kind === "lr0" ? cols : kind === "slr" ? [...ff.follow.get(pr.lhs)] : [it.la];
      for (const a of las) add(i, a, { type: "r", n: it.p });
    }
  });
  const conflicts = [];
  action.forEach((row, i) => {
    for (const [a, list] of row) if (list.length > 1) {
      const t = list.some((x) => x.type === "s") ? "shift/reduce" : "reduce/reduce";
      conflicts.push({ state: i, t: a, kind: t, actions: list });
    }
  });
  const label = (act) => (act.type === "s" ? `s${names[act.n]}` : act.type === "r" ? `r${act.n}` : "acc");
  return { cols, gotoCols, action, go, conflicts, label };
}

export function lrParse(auto, table, tokens, { limit = 400 } = {}) {
  const { g, names } = auto;
  const input = [...tokens, END];
  const states = [0], syms = [], forest = [];
  const steps = [];
  let pos = 0, result = null;
  const push = (action, extra = {}) => steps.push({
    stack: states.map((s, k) => (k ? `${syms[k - 1]} ${names[s]}` : names[s])).join(" "),
    states: [...states], pos, input, action, forest: forest.map(clone), ...extra,
    vars: { s: names[states.at(-1)], a: input[pos] ?? END, ...(extra.vars ?? {}), "stack depth": states.length },
  });
  push("Start in state 0 with the first token as lookahead.", { line: 1 });
  while (!result) {
    if (steps.length > limit) { result = "limit"; push(`Stopped after ${limit} steps.`, { bad: true, line: 2 }); break; }
    const s = states.at(-1), a = input[pos], cell = table.action[s].get(a) ?? [];
    if (!cell.length) { result = "error"; push(`Error: ACTION[${names[s]}, ${a}] is empty: in this state no valid input can continue with ${a}.`, { bad: true, cell: [s, a], line: [3, 10], vars: { "ACTION[s, a]": "empty" } }); break; }
    const act = cell.find((x) => x.type === "s") ?? cell[0];
    const conflict = cell.length > 1 ? ` (conflict: ${cell.map(table.label).join(" / ")}; taking ${table.label(act)})` : "";
    if (act.type === "acc") { result = "accept"; push(`ACTION[${names[s]}, $] = accept: the whole input reduced to ${g.prods[0].rhs[0]}.`, { good: true, cell: [s, a], line: [3, 9], vars: { s: names[s], "ACTION[s, a]": "acc" } }); break; }
    if (act.type === "s") {
      states.push(act.n); syms.push(a); forest.push({ ...node(a, "matched") });
      pos++;
      push(`ACTION[${names[s]}, ${a}] = ${table.label(act)}${conflict}: shift ${a} and go to state ${names[act.n]}. No rule body is complete on top of the stack yet.`, { cell: [s, a], line: [3, 4, 5], vars: { s: names[s], a, "ACTION[s, a]": table.label(act), t: names[act.n] } });
      continue;
    }
    const pr = g.prods[act.n], n = pr.rhs.length;
    const kids = n ? forest.splice(-n) : [node(EPS, "matched")];
    states.splice(states.length - n, n); syms.splice(syms.length - n, n);
    const t = states.at(-1), to = table.go[t].get(pr.lhs);
    const parent = node(pr.lhs, "expanded");
    parent.kids = kids;
    forest.push(parent);
    if (to == null) { result = "error"; push(`Reduce by ${showProd(pr)}, but GOTO[${names[t]}, ${pr.lhs}] is empty.`, { bad: true, line: [6, 7, 10] }); break; }
    states.push(to); syms.push(pr.lhs);
    push(`ACTION[${names[s]}, ${a}] = r${act.n}${conflict}: the handle ${pr.rhs.join(" ") || EPS} is on top, so reduce by ${showProd(pr)}. Pop ${n * 2} entries, uncovering state ${names[t]}, then push ${pr.lhs} and GOTO[${names[t]}, ${pr.lhs}] = ${names[to]}.`, { cell: [s, a], prod: act.n, line: [3, 6, 7, 8], vars: { s: names[s], a, "ACTION[s, a]": `r${act.n}`, "A → β": showProd(pr), t: names[t], "GOTO[t, A]": names[to] } });
  }
  return { steps, accepted: result === "accept" };
}

// --- CYK --------------------------------------------------------------------------
export function cnfProblems(g) {
  return g.prods.filter((p) => !(
    (p.rhs.length === 2 && g.isNT(p.rhs[0]) && g.isNT(p.rhs[1])) ||
    (p.rhs.length === 1 && !g.isNT(p.rhs[0]))
  ));
}

export function cyk(g, tokens) {
  const bad = cnfProblems(g);
  if (bad.length) throw new Error(`CYK needs Chomsky normal form (A → B C or A → a). Not CNF: ${bad.slice(0, 4).map(showProd).join(", ")}.`);
  const n = tokens.length;
  if (!n) throw new Error("Enter a non-empty string to test.");
  if (n > 12) throw new Error("Use a string of at most 12 symbols.");
  // cell[len-1][i] = non-terminals deriving tokens[i .. i+len-1]
  const cell = Array.from({ length: n }, (_, l) => Array.from({ length: n - l }, () => []));
  const back = new Map();
  const steps = [];
  const snap = () => cell.map((row) => row.map((c) => [...c]));
  for (let i = 0; i < n; i++) {
    for (const p of g.prods) if (p.rhs.length === 1 && p.rhs[0] === tokens[i] && !cell[0][i].includes(p.lhs)) {
      cell[0][i].push(p.lhs);
      back.set(`0.${i}.${p.lhs}`, { leaf: tokens[i] });
    }
    steps.push({ len: 1, i, splits: [], line: [1, 2], vars: { i: i + 1, [`w${i + 1}`]: tokens[i], [`T[${i + 1},${i + 1}]`]: cell[0][i].length ? cell[0][i] : "∅" }, note: `"${tokens[i]}": ${cell[0][i].length ? `{${cell[0][i].join(", ")}} have a rule → ${tokens[i]}` : `no rule produces ${tokens[i]}, so the cell is empty`}.`, table: snap() });
  }
  // One step per split (len, i, k), so the triple loop can be followed exactly.
  const setText = (c) => (c.length ? `{${c.join(", ")}}` : "∅");
  for (let len = 2; len <= n; len++) for (let i = 0; i + len <= n; i++) {
    const target = cell[len - 1][i], splits = [];
    const span = tokens.slice(i, i + len).join(" "), I = i + 1, J = i + len;
    for (let k = 1; k < len; k++) {
      const left = cell[k - 1][i], right = cell[len - k - 1][i + k], found = [];
      for (const p of g.prods) if (p.rhs.length === 2 && left.includes(p.rhs[0]) && right.includes(p.rhs[1])) {
        found.push(`${p.lhs} → ${p.rhs.join(" ")}`);
        if (!target.includes(p.lhs)) { target.push(p.lhs); back.set(`${len - 1}.${i}.${p.lhs}`, { k, B: p.rhs[0], C: p.rhs[1] }); }
      }
      const split = { k, left: [k - 1, i], right: [len - k - 1, i + k], found };
      splits.push(split);
      const K = i + k, lastK = k === len - 1;
      const l = tokens.slice(i, i + k).join(" "), r = tokens.slice(i + k, i + len).join(" ");
      steps.push({
        len, i, k, split, splits: [...splits],
        line: [...(k === 1 ? [3, 4, 5] : []), 6, 7, ...(found.length ? [8] : [])],
        vars: { len, i: I, j: J, k: K, [`T[${I},${K}]`]: setText(left), [`T[${K + 1},${J}]`]: setText(right), [`T[${I},${J}]`]: setText(target) },
        note: `"${span}", split as ${l} | ${r}: the left part can be ${setText(left)} and the right part ${setText(right)}. ${found.length ? `${found.join(", ")} ${found.length > 1 ? "match" : "matches"}, so ${[...new Set(found.map((x) => x.split(" ")[0]))].join(", ")} can derive the whole span.` : "No rule A → B C combines them."}${lastK ? ` Every split tried: T[${I},${J}] = ${setText(target)}.` : ""}`,
        table: snap(),
      });
    }
  }
  const accepted = cell[n - 1][0].includes(g.start);
  const lastStep = steps.at(-1);
  lastStep.line = [...lastStep.line, 9];
  lastStep.vars = { ...lastStep.vars, accepted };
  const tree = (len, i, A) => {
    const b = back.get(`${len - 1}.${i}.${A}`);
    if (b.leaf) return { id: `${len}.${i}.${A}`, label: A, state: "expanded", kids: [{ id: `t${i}`, label: b.leaf, state: "matched", kids: [] }] };
    return { id: `${len}.${i}.${A}`, label: A, state: "expanded", kids: [tree(b.k, i, b.B), tree(len - b.k, i + b.k, b.C)] };
  };
  return { table: cell, steps, accepted, tree: accepted ? tree(n, 0, g.start) : null };
}

export const EXAMPLES = {
  expr: { name: "Expressions (left-recursive)", text: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id", input: "id + id * id" },
  exprLL: { name: "Expressions (LL(1) form)", text: "E -> T E'\nE' -> + T E' | ε\nT -> F T'\nT' -> * F T' | ε\nF -> ( E ) | id", input: "id + id * id" },
  cc: { name: "S → CC (LALR vs CLR)", text: "S -> C C\nC -> c C | d", input: "c d d" },
  lr: { name: "S → L = R (SLR conflict)", text: "S -> L = R | R\nL -> * R | id\nR -> L", input: "id = * id" },
  ifelse: { name: "Dangling else", text: "S -> i E t S | i E t S e S | a\nE -> b", input: "i b t a e a" },
  indirect: { name: "Indirect left recursion", text: "S -> A a | b\nA -> A c | S d | ε", input: "b d a" },
  balanced: { name: "Balanced parentheses", text: "S -> ( S ) S | ε", input: "( ( ) ) ( )" },
  cnf: { name: "CNF (for CYK)", text: "S -> A B | B C\nA -> B A | a\nB -> C C | b\nC -> A B | a", input: "b a a b a" },
  anbn: { name: "aⁿbⁿ in CNF", text: "S -> A T | A B\nT -> S B\nA -> a\nB -> b", input: "a a a b b b" },
};
