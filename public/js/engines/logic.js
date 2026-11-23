// Propositional and first-order logic: a parser for formulas, truth tables
// built one column at a time, equivalence, CNF and DNF by rewriting, rules of
// inference, and quantifiers evaluated over a small finite domain.
//
// Conventions (stated in the UI):
// - Precedence, tightest first: ¬, ∧, ∨, ⊕, →, ↔. → groups to the right
//   (p → q → r is p → (q → r)); the others group to the left.
// - Truth tables list rows from all T down to all F (T before F, like Rosen).
// - A quantifier binds only the formula right after it, so ∀x P(x) ∧ Q means
//   (∀x P(x)) ∧ Q. Use brackets to widen its scope.

const OPS = { and: "∧", or: "∨", xor: "⊕", imp: "→", iff: "↔" };
const PREC = { iff: 1, imp: 2, xor: 3, or: 4, and: 5 };
const KEYWORDS = new Set(["and", "or", "not", "xor", "implies", "iff", "forall", "exists", "all", "some", "T", "F", "true", "false"]);
export const SYMBOLS = OPS;

// --- Tokens and parsing -------------------------------------------------------------
function tokenize(text) {
  const src = String(text), out = [];
  let i = 0;
  const two = [["<->", "iff"], ["<=>", "iff"], ["->", "imp"], ["=>", "imp"], ["&&", "and"], ["||", "or"], ["<=", "le"], [">=", "ge"], ["!=", "ne"], ["/\\", "and"], ["\\/", "or"]];
  const one = { "¬": "not", "~": "not", "!": "not", "∧": "and", "&": "and", "^": "and", "·": "and", "∨": "or", "|": "or", "+": "plus", "⊕": "xor", "→": "imp", "⇒": "imp", "↔": "iff", "⇔": "iff", "≡": "iff",
    "(": "(", ")": ")", ",": ",", "∀": "forall", "∃": "exists", "<": "lt", ">": "gt", "=": "eq", "≤": "le", "≥": "ge", "≠": "ne", "*": "times", "×": "times", "-": "minus", "−": "minus", "%": "mod", "⊤": "T", "⊥": "F" };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const t2 = two.find(([s]) => src.startsWith(s, i));
    if (t2) { out.push({ t: t2[1], at: i }); i += t2[0].length; continue; }
    if (one[c]) { out.push({ t: one[c], at: i }); i++; continue; }
    const num = /^\d+/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]), at: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_']*/.exec(src.slice(i));
    if (id) {
      const w = id[0], lw = w.toLowerCase();
      const word = { and: "and", or: "or", not: "not", xor: "xor", implies: "imp", iff: "iff", forall: "forall", all: "forall", exists: "exists", some: "exists", true: "T", false: "F", mod: "mod" }[lw];
      if (word) out.push({ t: word, at: i });
      else if (w === "T" || w === "F") out.push({ t: w, at: i });
      else out.push({ t: "id", v: w, at: i });
      i += w.length;
      continue;
    }
    throw new Error(`I don't know the symbol "${c}" (position ${i + 1}). Use ¬ ∧ ∨ → ↔ ⊕, or ~ & | -> <->.`);
  }
  return out;
}

const PREDICATES = { even: 1, odd: 1, prime: 1, divides: 2 };

// mode "prop": atoms are variable names. mode "fol": atoms are comparisons
// (x < y, x + 1 = y), even(x), odd(x), prime(x), divides(x, y).
export function parse(text, { mode = "prop" } = {}) {
  const toks = tokenize(text);
  if (!toks.length) throw new Error("Type a formula, for example (p → q) ∧ p → q.");
  let k = 0;
  const peek = () => toks[k]?.t, next = () => toks[k++];
  const fail = (msg) => { throw new Error(msg + (toks[k] ? ` (near position ${toks[k].at + 1})` : " (at the end)")); };
  const expect = (t, what) => { if (peek() !== t) fail(`Expected ${what}`); return next(); };

  function binary(level) {
    if (level > 5) return unary();
    const op = Object.keys(PREC).find((o) => PREC[o] === level);
    let left = binary(level + 1);
    if (op === "imp") {
      if (peek() === "imp") { next(); return { type: "bin", op, a: left, b: binary(level) }; }
      return left;
    }
    while (peek() === op) { next(); left = { type: "bin", op, a: left, b: binary(level + 1) }; }
    return left;
  }
  function unary() {
    if (peek() === "not") { next(); return { type: "not", a: unary() }; }
    if (peek() === "forall" || peek() === "exists") {
      if (mode !== "fol") fail("Quantifiers belong in the first-order mode");
      const q = next().t;
      const v = next();
      if (!v || v.t !== "id") fail("A quantifier needs a variable, like ∀x");
      if (peek() === ",") next();
      return { type: "quant", q, v: v.v, a: unary() };
    }
    return primary();
  }
  function primary() {
    const t = peek();
    if (t === "(") {
      // In first-order mode "(x + 1) < y" starts a term, not a formula.
      if (mode === "fol") {
        const save = k;
        try { return comparison(); } catch { k = save; }
      }
      next();
      const f = binary(1);
      expect(")", "a closing bracket");
      return f;
    }
    if (t === "T" || t === "F") { next(); return { type: "const", value: t === "T" }; }
    if (mode === "prop") {
      if (t !== "id") fail("Expected a variable such as p");
      const v = next().v;
      if (KEYWORDS.has(v.toLowerCase())) fail(`"${v}" is a keyword`);
      return { type: "var", name: v };
    }
    const tok = toks[k];
    if (tok?.t === "id" && PREDICATES[tok.v.toLowerCase()] && toks[k + 1]?.t === "(") {
      const name = next().v.toLowerCase();
      next();
      const args = [term()];
      while (peek() === ",") { next(); args.push(term()); }
      expect(")", "a closing bracket");
      if (args.length !== PREDICATES[name]) fail(`${name} takes ${PREDICATES[name]} argument${PREDICATES[name] > 1 ? "s" : ""}`);
      return { type: "pred", name, args };
    }
    return comparison();
  }
  function comparison() {
    const a = term();
    const rel = peek();
    if (!["lt", "gt", "eq", "le", "ge", "ne"].includes(rel)) fail("Expected a comparison such as x < y");
    next();
    return { type: "cmp", rel, a, b: term() };
  }
  function term() {
    let left = factor();
    while (peek() === "plus" || peek() === "minus") { const op = next().t; left = { type: "arith", op, a: left, b: factor() }; }
    return left;
  }
  function factor() {
    let left = atomTerm();
    while (peek() === "times" || peek() === "mod") { const op = next().t; left = { type: "arith", op, a: left, b: atomTerm() }; }
    return left;
  }
  function atomTerm() {
    const t = next();
    if (!t) fail("Expected a number or a variable");
    if (t.t === "num") return { type: "num", v: t.v };
    if (t.t === "id") return { type: "tvar", name: t.v };
    if (t.t === "(") { const x = term(); expect(")", "a closing bracket"); return x; }
    k--; fail("Expected a number or a variable");
  }

  const f = binary(1);
  if (k < toks.length) fail("Unexpected extra symbols");
  return f;
}

// --- Printing ----------------------------------------------------------------------
const level = (f) => (f.type === "bin" ? PREC[f.op] : 9);
const showTerm = (t, top = true) => {
  if (t.type === "num") return String(t.v);
  if (t.type === "tvar") return t.name;
  const s = `${showTerm(t.a, false)} ${{ plus: "+", minus: "−", times: "×", mod: "mod" }[t.op]} ${showTerm(t.b, false)}`;
  return top ? s : `(${s})`;
};
const REL = { lt: "<", gt: ">", eq: "=", le: "≤", ge: "≥", ne: "≠" };

export function show(f) {
  switch (f.type) {
    case "var": return f.name;
    case "const": return f.value ? "T" : "F";
    case "not": return `¬${f.a.type === "bin" || f.a.type === "cmp" ? `(${show(f.a)})` : show(f.a)}`;
    case "quant": return `${f.q === "forall" ? "∀" : "∃"}${f.v} ${f.a.type === "bin" || f.a.type === "cmp" ? `(${show(f.a)})` : show(f.a)}`;
    case "pred": return `${f.name}(${f.args.map((a) => showTerm(a)).join(", ")})`;
    case "cmp": return `${showTerm(f.a)} ${REL[f.rel]} ${showTerm(f.b)}`;
    default: {
      const p = PREC[f.op], assoc = f.op === "and" || f.op === "or";
      // Chains of ∧ or of ∨ need no brackets; everything else shows its grouping.
      const wrapA = f.a.type === "bin" && !(assoc && f.a.op === f.op) || level(f.a) < p;
      const wrapB = f.b.type === "bin" && !(assoc && f.b.op === f.op) || level(f.b) < p;
      const a = show(f.a), b = show(f.b);
      return `${wrapA ? `(${a})` : a} ${OPS[f.op]} ${wrapB ? `(${b})` : b}`;
    }
  }
}

// --- Evaluation --------------------------------------------------------------------
export function variables(f, out = new Set()) {
  if (f.type === "var") out.add(f.name);
  for (const c of [f.a, f.b]) if (c && c.type) variables(c, out);
  return [...out].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
}

export function evaluate(f, env) {
  switch (f.type) {
    case "var": return !!env[f.name];
    case "const": return f.value;
    case "not": return !evaluate(f.a, env);
    case "bin": {
      const a = evaluate(f.a, env), b = evaluate(f.b, env);
      return { and: a && b, or: a || b, xor: a !== b, imp: !a || b, iff: a === b }[f.op];
    }
    default: throw new Error(`Can't evaluate ${f.type} here`);
  }
}

// All 2^n assignments, from all true down to all false.
export function assignments(vars) {
  const n = vars.length, rows = [];
  for (let m = 0; m < 2 ** n; m++) rows.push(Object.fromEntries(vars.map((v, i) => [v, !((m >> (n - 1 - i)) & 1)])));
  return rows;
}

// Distinct compound subformulas, innermost first: the columns of a truth table.
export function subformulas(f) {
  const out = [], seen = new Set();
  const walk = (g) => {
    if (g.type === "var" || g.type === "const") return;
    for (const c of [g.a, g.b]) if (c) walk(c);
    const s = show(g);
    if (!seen.has(s)) { seen.add(s); out.push(g); }
  };
  walk(f);
  return out;
}

const RULE = {
  not: "¬A is T exactly when A is F.",
  and: "A ∧ B is T only when both are T.",
  or: "A ∨ B is F only when both are F.",
  xor: "A ⊕ B is T when exactly one is T.",
  imp: "A → B is F only when A is T and B is F.",
  iff: "A ↔ B is T when both sides match.",
};

export const TABLE_CODE = [
  "vars ← the propositional variables, in order",
  "rows ← all 2ⁿ assignments, T before F",
  "for each subformula S, innermost first",
  "  for each row r",
  "    S[r] ← apply S's connective to its parts' values in r",
  "classify: all T → tautology, all F → contradiction, else contingency",
];

export function kindOf(values) {
  return values.every(Boolean) ? "tautology" : values.some(Boolean) ? "contingency" : "contradiction";
}

export function truthTable(f) {
  const vars = variables(f), rows = assignments(vars), subs = subformulas(f);
  const cols = [...vars.map((v) => ({ label: v, values: rows.map((r) => r[v]), isVar: true })),
    ...subs.map((s) => ({ label: show(s), values: rows.map((r) => evaluate(s, r)), node: s }))];
  if (!subs.length) cols.push(...[]);
  const final = subs.length ? cols[cols.length - 1].values : f.type === "const" ? rows.map(() => f.value) : cols[0].values;
  const kind = kindOf(final);
  const steps = [];
  steps.push({ shown: vars.length, line: [1, 2], vars: { n: vars.length, rows: rows.length }, note: `${vars.length} variable${vars.length === 1 ? "" : "s"} (${vars.join(", ") || "none"}), so 2^${vars.length} = ${rows.length} rows. The variable columns count down from all T to all F.` });
  subs.forEach((s, i) => {
    const col = cols[vars.length + i];
    const parts = s.type === "not" ? [show(s.a)] : [show(s.a), show(s.b)];
    const ts = col.values.filter(Boolean).length;
    steps.push({ shown: vars.length + i + 1, hot: vars.length + i, line: [3, 4, 5],
      vars: { S: col.label, connective: s.type === "not" ? "¬" : OPS[s.op], parts: parts.join(" , "), "T count": ts },
      note: `Column ${col.label}: ${RULE[s.type === "not" ? "not" : s.op].replace("A", parts[0]).replace("B", parts[1] ?? "")} That gives ${ts} T and ${rows.length - ts} F.` });
  });
  const ts = final.filter(Boolean).length;
  steps.push({ shown: cols.length, hot: cols.length - 1, done: true, line: 6, vars: { "T rows": ts, "F rows": rows.length - ts, result: kind }, tone: "good",
    note: kind === "tautology" ? `Every row of the last column is T, so ${show(f)} is a tautology.`
      : kind === "contradiction" ? `Every row of the last column is F, so ${show(f)} is a contradiction (unsatisfiable).`
        : `The last column has ${ts} T and ${rows.length - ts} F, so ${show(f)} is a contingency: satisfiable but not valid.` });
  return { vars, rows, cols, final, kind, steps };
}

// --- Equivalence --------------------------------------------------------------------
export const EQUIV_CODE = [
  "vars ← variables of F and of G together",
  "for each assignment r",
  "  if F[r] ≠ G[r] then return not equivalent, with r",
  "return equivalent  // F ↔ G is a tautology",
];

export function equivalence(f, g) {
  const vars = [...new Set([...variables(f), ...variables(g)])].sort();
  const rows = assignments(vars), steps = [];
  let counter = null;
  steps.push({ row: -1, line: 1, vars: { vars: vars.join(" "), rows: rows.length }, note: `Compare ${show(f)} and ${show(g)} on all ${rows.length} assignments of ${vars.join(", ")}.` });
  rows.forEach((r, i) => {
    if (counter) return;
    const a = evaluate(f, r), b = evaluate(g, r);
    const same = a === b;
    steps.push({ row: i, line: same ? 2 : 3, vars: { row: i + 1, F: a, G: b }, tone: same ? null : "bad",
      note: `${vars.map((v) => `${v}=${r[v] ? "T" : "F"}`).join(", ")}: F is ${a ? "T" : "F"}, G is ${b ? "T" : "F"}.${same ? " They agree." : " They differ, so the formulas are not equivalent."}` });
    if (!same) counter = { row: i, env: r };
  });
  if (!counter) steps.push({ row: rows.length, line: 4, vars: { result: "equivalent" }, tone: "good", note: `They agree on every row, so ${show(f)} ≡ ${show(g)}: F ↔ G is a tautology.` });
  return { vars, rows, equivalent: !counter, counter, steps, f: rows.map((r) => evaluate(f, r)), g: rows.map((r) => evaluate(g, r)) };
}

// --- Normal forms by rewriting -----------------------------------------------------
const V = (name) => ({ type: "var", name });
const NOT = (a) => ({ type: "not", a });
const BIN = (op, a, b) => ({ type: "bin", op, a, b });
const C = (value) => ({ type: "const", value });

export const NORMAL_CODE = [
  "replace A ↔ B by (A → B) ∧ (B → A)  // and A ⊕ B by (A ∨ B) ∧ ¬(A ∧ B)",
  "replace A → B by ¬A ∨ B",
  "push ¬ inwards with De Morgan's laws and ¬¬A ≡ A",
  "simplify constants: A ∧ T ≡ A, A ∨ T ≡ T, …",
  "CNF: distribute ∨ over ∧;  DNF: distribute ∧ over ∨",
  "tidy: drop repeated literals and clauses that are always true (or false)",
];

function elimIff(f) {
  if (f.type === "not") return NOT(elimIff(f.a));
  if (f.type !== "bin") return f;
  const a = elimIff(f.a), b = elimIff(f.b);
  if (f.op === "iff") return BIN("and", BIN("imp", a, b), BIN("imp", b, a));
  if (f.op === "xor") return BIN("and", BIN("or", a, b), NOT(BIN("and", a, b)));
  return BIN(f.op, a, b);
}
function elimImp(f) {
  if (f.type === "not") return NOT(elimImp(f.a));
  if (f.type !== "bin") return f;
  const a = elimImp(f.a), b = elimImp(f.b);
  return f.op === "imp" ? BIN("or", NOT(a), b) : BIN(f.op, a, b);
}
function nnf(f) {
  if (f.type === "bin") return BIN(f.op, nnf(f.a), nnf(f.b));
  if (f.type !== "not") return f;
  const a = f.a;
  if (a.type === "not") return nnf(a.a);
  if (a.type === "const") return C(!a.value);
  if (a.type === "bin" && a.op === "and") return BIN("or", nnf(NOT(a.a)), nnf(NOT(a.b)));
  if (a.type === "bin" && a.op === "or") return BIN("and", nnf(NOT(a.a)), nnf(NOT(a.b)));
  return f;
}
function constants(f) {
  if (f.type !== "bin") return f;
  const a = constants(f.a), b = constants(f.b);
  for (const [x, y] of [[a, b], [b, a]]) if (x.type === "const") {
    if (f.op === "and") return x.value ? y : C(false);
    if (f.op === "or") return x.value ? C(true) : y;
  }
  return BIN(f.op, a, b);
}
// Clauses as lists of literals { name, neg }. outer "and" gives CNF, "or" DNF.
function clauses(f, outer) {
  const inner = outer === "and" ? "or" : "and";
  if (f.type === "const") return (f.value === (outer === "and")) ? [] : [[]];
  if (f.type === "var") return [[{ name: f.name, neg: false }]];
  if (f.type === "not") return [[{ name: f.a.name, neg: true }]];
  const A = clauses(f.a, outer), B = clauses(f.b, outer);
  if (f.op === outer) return [...A, ...B];
  // distribute: (a1 ∧ a2) ∨ (b1 ∧ b2) = every pairing
  if (f.op === inner) { const out = []; for (const x of A) for (const y of B) out.push([...x, ...y]); return out; }
  throw new Error("Unexpected connective");
}
function tidy(list) {
  const out = [], seen = new Set();
  for (const c of list) {
    const lits = [], keys = new Set();
    let trivial = false;
    for (const l of c) {
      const key = `${l.neg ? "¬" : ""}${l.name}`;
      if (keys.has(`${l.neg ? "" : "¬"}${l.name}`)) trivial = true;
      if (!keys.has(key)) { keys.add(key); lits.push(l); }
    }
    if (trivial) continue;
    lits.sort((x, y) => x.name.localeCompare(y.name) || x.neg - y.neg);
    const sig = lits.map((l) => `${l.neg ? "¬" : ""}${l.name}`).join(",");
    if (!seen.has(sig)) { seen.add(sig); out.push(lits); }
  }
  // Absorption: drop a clause that contains another one.
  return out.filter((c, i) => !out.some((d, j) => j !== i && d.length < c.length && d.every((l) => c.some((m) => m.name === l.name && m.neg === l.neg))));
}
const lit = (l) => `${l.neg ? "¬" : ""}${l.name}`;
export function showClauses(list, outer) {
  const inner = outer === "and" ? " ∨ " : " ∧ ";
  if (!list.length) return outer === "and" ? "T" : "F";
  if (list.some((c) => !c.length)) return outer === "and" ? "F" : "T";
  const parts = list.map((c) => (c.length > 1 && list.length > 1 ? `(${c.map(lit).join(inner)})` : c.map(lit).join(inner)));
  return parts.join(outer === "and" ? " ∧ " : " ∨ ");
}
export function clausesToFormula(list, outer) {
  const inner = outer === "and" ? "or" : "and";
  if (!list.length) return C(outer === "and");
  const join = (xs, op) => xs.reduce((a, b) => BIN(op, a, b));
  return join(list.map((c) => (c.length ? join(c.map((l) => (l.neg ? NOT(V(l.name)) : V(l.name))), inner) : C(outer !== "and"))), outer);
}

export function normalForms(f) {
  const steps = [];
  const push = (line, form, note, extra = {}) => steps.push({ line, form, note, vars: { formula: form, ...extra } });
  push(null, show(f), `Start from ${show(f)}.`);
  let g = elimIff(f);
  if (show(g) !== show(f)) push(1, show(g), "Rewrite every ↔ as two implications (and every ⊕ as 'one or the other but not both').");
  const h1 = elimImp(g);
  if (show(h1) !== show(g)) push(2, show(h1), "Rewrite every A → B as ¬A ∨ B.");
  g = h1;
  const n1 = nnf(g);
  if (show(n1) !== show(g)) push(3, show(n1), "Push every ¬ down to a variable: ¬(A ∧ B) ≡ ¬A ∨ ¬B, ¬(A ∨ B) ≡ ¬A ∧ ¬B, ¬¬A ≡ A. This is negation normal form.");
  g = n1;
  const c1 = constants(g);
  if (show(c1) !== show(g)) push(4, show(c1), "Remove the constants T and F.");
  g = c1;
  const cnfRaw = clauses(g, "and"), dnfRaw = clauses(g, "or");
  const cnf = tidy(cnfRaw), dnf = tidy(dnfRaw);
  push(5, showClauses(cnfRaw, "and"), `CNF: distribute ∨ over ∧, A ∨ (B ∧ C) ≡ (A ∨ B) ∧ (A ∨ C). That gives ${cnfRaw.length} clause${cnfRaw.length === 1 ? "" : "s"}.`, { clauses: cnfRaw.length });
  push(6, showClauses(cnf, "and"), `Tidy the CNF: drop repeated literals, clauses containing both p and ¬p (always true) and clauses that contain a smaller clause. ${cnf.length} clause${cnf.length === 1 ? "" : "s"} left.`, { clauses: cnf.length });
  push(5, showClauses(dnfRaw, "or"), `DNF: distribute ∧ over ∨, A ∧ (B ∨ C) ≡ (A ∧ B) ∨ (A ∧ C). That gives ${dnfRaw.length} term${dnfRaw.length === 1 ? "" : "s"}.`, { terms: dnfRaw.length });
  push(6, showClauses(dnf, "or"), `Tidy the DNF: drop terms containing both p and ¬p (always false) and terms that contain a smaller term. ${dnf.length} term${dnf.length === 1 ? "" : "s"} left.`, { terms: dnf.length });
  steps[steps.length - 1].tone = "good";
  // The canonical forms read straight off the truth table.
  const vars = variables(f), rows = assignments(vars);
  const minterms = rows.filter((r) => evaluate(f, r)).map((r) => vars.map((v) => ({ name: v, neg: !r[v] })));
  const maxterms = rows.filter((r) => !evaluate(f, r)).map((r) => vars.map((v) => ({ name: v, neg: r[v] })));
  return {
    steps, cnf, dnf, cnfText: showClauses(cnf, "and"), dnfText: showClauses(dnf, "or"),
    cnfFormula: clausesToFormula(cnf, "and"), dnfFormula: clausesToFormula(dnf, "or"),
    canonical: { dnf: minterms, cnf: maxterms, dnfText: vars.length ? showClauses(minterms, "or") : show(f), cnfText: vars.length ? showClauses(maxterms, "and") : show(f) },
  };
}

// --- Rules of inference -------------------------------------------------------------
// Templates use the metavariables A, B, C, D, which match any subformula.
export const RULES = [
  { id: "mp", name: "Modus ponens", premises: ["A → B", "A"], conclusion: "B" },
  { id: "mt", name: "Modus tollens", premises: ["A → B", "¬B"], conclusion: "¬A" },
  { id: "hs", name: "Hypothetical syllogism", premises: ["A → B", "B → C"], conclusion: "A → C" },
  { id: "ds", name: "Disjunctive syllogism", premises: ["A ∨ B", "¬A"], conclusion: "B" },
  { id: "add", name: "Addition", premises: ["A"], conclusion: "A ∨ B" },
  { id: "simp", name: "Simplification", premises: ["A ∧ B"], conclusion: "A" },
  { id: "conj", name: "Conjunction", premises: ["A", "B"], conclusion: "A ∧ B" },
  { id: "res", name: "Resolution", premises: ["A ∨ B", "¬A ∨ C"], conclusion: "B ∨ C" },
  { id: "cd", name: "Constructive dilemma", premises: ["A → B", "C → D", "A ∨ C"], conclusion: "B ∨ D" },
  { id: "dd", name: "Destructive dilemma", premises: ["A → B", "C → D", "¬B ∨ ¬D"], conclusion: "¬A ∨ ¬C" },
  { id: "ac", name: "Affirming the consequent (a fallacy)", premises: ["A → B", "B"], conclusion: "A", fallacy: true },
  { id: "da", name: "Denying the antecedent (a fallacy)", premises: ["A → B", "¬A"], conclusion: "¬B", fallacy: true },
];
const META = new Set(["A", "B", "C", "D"]);
function match(tpl, f, bind) {
  if (tpl.type === "var" && META.has(tpl.name)) {
    const s = show(f);
    if (bind[tpl.name] != null) return bind[tpl.name] === s ? bind : null;
    return { ...bind, [tpl.name]: s };
  }
  if (tpl.type !== f.type) return null;
  if (tpl.type === "not") return match(tpl.a, f.a, bind);
  if (tpl.type === "bin") {
    if (tpl.op !== f.op) return null;
    const b1 = match(tpl.a, f.a, bind);
    const direct = b1 && match(tpl.b, f.b, b1);
    if (direct) return direct;
    if (["and", "or", "iff", "xor"].includes(tpl.op)) { const b2 = match(tpl.a, f.b, bind); return b2 && match(tpl.b, f.a, b2); }
    return null;
  }
  return show(tpl) === show(f) ? bind : null;
}
function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
export function nameRule(premises, conclusion) {
  for (const rule of RULES) {
    if (rule.premises.length !== premises.length) continue;
    const tp = rule.premises.map((p) => parse(p)), tc = parse(rule.conclusion);
    for (const order of permutations(premises)) {
      let bind = {};
      for (let i = 0; i < tp.length && bind; i++) bind = match(tp[i], order[i], bind);
      if (bind && match(tc, conclusion, bind)) return rule;
    }
  }
  return null;
}

export const INFER_CODE = [
  "vars ← every variable in the premises and the conclusion",
  "for each assignment r",
  "  if every premise is T in r  // a critical row",
  "    if the conclusion is F in r then return invalid, with r",
  "return valid  // (P1 ∧ … ∧ Pk) → C is a tautology",
];

export function inference(premises, conclusion) {
  const vars = [...new Set([...premises.flatMap((p) => variables(p)), ...variables(conclusion)])].sort();
  const rows = assignments(vars), steps = [];
  let counter = null, critical = 0;
  steps.push({ row: -1, line: 1, vars: { premises: premises.length, rows: rows.length }, note: `An argument is valid when the conclusion is T in every row where all the premises are T. Check all ${rows.length} rows.` });
  const table = rows.map((r) => ({ env: r, p: premises.map((p) => evaluate(p, r)), c: evaluate(conclusion, r) }));
  table.forEach((t, i) => {
    if (counter) return;
    const all = t.p.every(Boolean);
    if (all) critical++;
    const bad = all && !t.c;
    steps.push({ row: i, line: all ? (bad ? 4 : 3) : 2, tone: bad ? "bad" : null, vars: { row: i + 1, "all premises": all, conclusion: t.c, critical },
      note: all ? (bad ? "All premises are T here but the conclusion is F: a counterexample, so the argument is invalid." : "A critical row: all premises T, and the conclusion is T too.") : "Some premise is F here, so this row can't break the argument." });
    if (bad) counter = { row: i, env: t.env };
  });
  const rule = nameRule(premises, conclusion);
  if (!counter) steps.push({ row: rows.length, line: 5, vars: { result: "valid", critical }, tone: "good", note: `The conclusion is T in all ${critical} critical row${critical === 1 ? "" : "s"}, so the argument is valid${rule && !rule.fallacy ? `. It's an instance of ${rule.name.toLowerCase()}` : ""}.` });
  return { vars, rows, table, valid: !counter, counter, rule, steps };
}

// --- First-order logic over a finite domain ---------------------------------------
export const FOL_CODE = [
  "eval(∀x φ): for each d in D: if eval(φ[x := d]) is F return F (counterexample d); return T",
  "eval(∃x φ): for each d in D: if eval(φ[x := d]) is T return T (witness d); return F",
  "eval(¬φ), eval(φ ∧ ψ), …: combine the parts as in propositional logic",
  "eval(atom): compute both sides with the current values of the variables",
];

const isPrime = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
function termValue(t, env) {
  if (t.type === "num") return t.v;
  if (t.type === "tvar") { if (!(t.name in env)) throw new Error(`${t.name} is free (not bound by a quantifier). Give it a quantifier.`); return env[t.name]; }
  const a = termValue(t.a, env), b = termValue(t.b, env);
  if (t.op === "mod") { if (b === 0) throw new Error("mod 0 is undefined"); return ((a % b) + b) % b; }
  return { plus: a + b, minus: a - b, times: a * b }[t.op];
}

export function parseDomain(text) {
  const nums = String(text).match(/-?\d+/g);
  if (!nums) throw new Error("The domain needs some whole numbers, like 1 2 3 4.");
  const range = /^\s*(-?\d+)\s*(?:\.\.|to)\s*(-?\d+)\s*$/.exec(String(text));
  const list = range ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i) : [...new Set(nums.map(Number))];
  if (!list.length || list.length > 8) throw new Error("Use a domain of 1 to 8 numbers.");
  return list;
}

export function evaluateFol(f, domain, { maxSteps = 400 } = {}) {
  const steps = [];
  let calls = 0;
  const envText = (env) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join(", ");
  function ev(g, env, depth) {
    if (++calls > 20000) throw new Error("That formula is too big to evaluate here. Use fewer nested quantifiers or a smaller domain.");
    switch (g.type) {
      case "const": return g.value;
      case "not": return !ev(g.a, env, depth);
      case "bin": {
        const a = ev(g.a, env, depth), b = ev(g.b, env, depth);
        return { and: a && b, or: a || b, xor: a !== b, imp: !a || b, iff: a === b }[g.op];
      }
      case "cmp": {
        const a = termValue(g.a, env), b = termValue(g.b, env);
        return { lt: a < b, gt: a > b, eq: a === b, le: a <= b, ge: a >= b, ne: a !== b }[g.rel];
      }
      case "pred": {
        const xs = g.args.map((t) => termValue(t, env));
        if (g.name === "even") return xs[0] % 2 === 0;
        if (g.name === "odd") return Math.abs(xs[0] % 2) === 1;
        if (g.name === "prime") return isPrime(xs[0]);
        return xs[0] !== 0 && xs[1] % xs[0] === 0;
      }
      case "quant": {
        const all = g.q === "forall";
        let result = all;
        let decisive = null;
        for (const d of domain) {
          const e2 = { ...env, [g.v]: d };
          const val = ev(g.a, e2, depth + 1);
          if (steps.length < maxSteps) steps.push({ depth, line: all ? 1 : 2, env: e2, sub: show(g.a), value: val,
            vars: { ...e2, [`${show(g.a)}`]: val }, note: `${envText(e2)}: ${show(g.a)} is ${val ? "T" : "F"}.${all && !val ? ` So ${show(g)} is F (counterexample ${g.v} = ${d}).` : !all && val ? ` So ${show(g)} is T (witness ${g.v} = ${d}).` : ""}` });
          if (all && !val) { result = false; decisive = d; break; }
          if (!all && val) { result = true; decisive = d; break; }
        }
        if (decisive == null && steps.length < maxSteps) steps.push({ depth, line: all ? 1 : 2, env, sub: show(g), value: result, vars: { ...env, [show(g)]: result },
          note: all ? `${show(g)}${Object.keys(env).length ? ` (with ${envText(env)})` : ""} holds for every ${g.v} in the domain: T.` : `No ${g.v} in the domain works for ${show(g.a)}${Object.keys(env).length ? ` (with ${envText(env)})` : ""}: F.` });
        return result;
      }
      case "var": throw new Error(`"${g.name}" on its own isn't a statement here. Write a comparison or a predicate such as even(x).`);
      default: throw new Error("Can't evaluate that");
    }
  }
  const value = ev(f, {}, 0);
  steps.push({ depth: 0, line: 3, env: {}, sub: show(f), value, done: true, tone: value ? "good" : "bad", vars: { result: value }, note: `So ${show(f)} is ${value ? "true" : "false"} over the domain {${domain.join(", ")}}.` });
  return { value, steps, truncated: steps.length >= maxSteps };
}

// ¬ pushed through quantifiers: ¬∀x P ≡ ∃x ¬P and ¬∃x P ≡ ∀x ¬P.
export function negateFol(f) {
  switch (f.type) {
    case "quant": return { type: "quant", q: f.q === "forall" ? "exists" : "forall", v: f.v, a: negateFol(f.a) };
    case "not": return f.a;
    case "bin":
      if (f.op === "and") return BIN("or", negateFol(f.a), negateFol(f.b));
      if (f.op === "or") return BIN("and", negateFol(f.a), negateFol(f.b));
      if (f.op === "imp") return BIN("and", f.a, negateFol(f.b));
      return NOT(f);
    case "cmp": return { ...f, rel: { lt: "ge", ge: "lt", gt: "le", le: "gt", eq: "ne", ne: "eq" }[f.rel] };
    case "const": return C(!f.value);
    default: return NOT(f);
  }
}

// --- Random formulas (practice and GATE) -------------------------------------------
export function randomFormula(r, vars = ["p", "q", "r"], depth = 3) {
  const pickOp = () => ["and", "or", "imp", "imp", "iff", "or"][Math.floor(r() * 6)];
  const go = (d) => {
    if (d === 0 || (d < depth && r() < 0.3)) { const v = V(vars[Math.floor(r() * vars.length)]); return r() < 0.25 ? NOT(v) : v; }
    if (r() < 0.15) return NOT(go(d - 1));
    return BIN(pickOp(), go(d - 1), go(d - 1));
  };
  return go(depth);
}

export const EXAMPLES = {
  mp: { name: "Modus ponens as a formula", f: "((p → q) ∧ p) → q" },
  contra: { name: "Contrapositive", f: "(p → q) ↔ (¬q → ¬p)" },
  converse: { name: "Implication vs converse", f: "(p → q) ↔ (q → p)" },
  demorgan: { name: "De Morgan", f: "¬(p ∧ q) ↔ (¬p ∨ ¬q)" },
  contradiction: { name: "A contradiction", f: "(p ∨ q) ∧ ¬p ∧ ¬q" },
  dist: { name: "Distributive law", f: "p ∨ (q ∧ r) ↔ (p ∨ q) ∧ (p ∨ r)" },
  xor: { name: "Exclusive or", f: "(p ⊕ q) ∧ r" },
};
