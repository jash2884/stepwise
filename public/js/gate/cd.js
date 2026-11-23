// GATE question generators for compiler design. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer comes from the same engines the visualisers run.
import { pick, int, shuffle, query, mcq } from "./kit.js";
import { lex, KEYWORDS } from "../engines/lexer.js";
import { EPS, END, EXAMPLES as GRAMMARS, parseGrammar, toText, showProd, removeLeftRecursion, firstFollow, ll1, lrAutomaton, lrTable, LR_KINDS } from "../engines/grammar.js";
import { fromRules, fromGrammar, parseLevels, precedenceFunctions, LT, EQ, GT, EXAMPLES as OP_EXAMPLES } from "../engines/opprec.js";
import { SDDS, translate } from "../engines/sdt.js";
import { parseBlock, generate as naiveTac, dag } from "../engines/tac.js";
import { parseTac, basicBlocks, liveness, optimise, linearise, randomTac, varsOf, show as showIns, cfgOf } from "../engines/optimise.js";
import { analyse, chromatic } from "../engines/regalloc.js";

const SUBJECT = "cd";
const arrow = (text) => text.replace(/->/g, "→");
const grammarLines = (text) => arrow(text).split("\n");
const setText = (list) => `{${list.join(", ")}}`;
const listAnd = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);

// --- Lexical analysis ---------------------------------------------------------------

const NAMES = ["x", "y", "i", "n", "sum", "count", "total", "a", "b", "max"];
function snippet(r) {
  const v = () => pick(r, NAMES);
  const num = () => (r() < 0.2 ? `${int(r, 1, 9)}.${int(r, 0, 9)}${r() < 0.4 ? `e${int(r, 1, 3)}` : ""}` : String(int(r, 0, 99)));
  const sp = (op) => (r() < 0.3 ? op : ` ${op} `);
  const rel = () => pick(r, ["<", "<=", ">", ">=", "==", "!=", "<>"]);
  const ar = () => pick(r, ["+", "-", "*", "/"]);
  const templates = [
    () => `${pick(r, ["int", "float"])} ${v()}${sp("=")}${num()};`,
    () => `${v()}${sp("=")}${v()}${sp(ar())}${v()};`,
    () => `if (${v()}${sp(rel())}${v()}) ${v()}${sp("=")}${v()}${sp(ar())}${num()};`,
    () => `while (${v()}${sp(rel())}${num()}) { ${v()}${sp("=")}${v()}${sp(ar())}${v()}; }`,
    () => `return ${v()};`,
    () => `// ${pick(r, ["add up", "next step", "x = 1 + y", "update the total"])}`,
    () => `float ${v()}, ${v()};`,
  ];
  const lines = Array.from({ length: int(r, 2, 4) }, () => pick(r, templates)());
  return lines.join("\n");
}

function lexicalAnalysis(r) {
  const src = snippet(r);
  const res = lex(src);
  if (res.errors.length) return null;
  const replay = query("/lexical-analysis", { src });
  const byClass = {};
  for (const t of res.tokens) byClass[t.cls] = (byClass[t.cls] ?? 0) + 1;
  const breakdown = Object.entries(byClass).map(([c, n]) => `${n} ${c}`).join(", ");
  const tokenRow = { table: { head: ["Lexeme", "Token"], rows: res.tokens.map((t) => [t.lexeme, t.cls === "keyword" ? `keyword ${t.lexeme}` : t.cls]) } };
  const base = [
    "A lexical analyser for a C-like language uses maximal munch. Keywords are " + KEYWORDS.slice(0, 10).join(", ") + " and " + KEYWORDS[10] + ". Relational operators include <, <=, <>, >, >=, == and !=. Whitespace and // comments produce no tokens.",
    { table: { head: ["Source"], rows: src.split("\n").map((l) => [l]) } },
  ];
  if (r() < 0.6) {
    return {
      topic: "lexical-analysis", type: "nat", marks: /\/\/|<>|<=|>=|e\d/.test(src) ? 2 : 1, answer: res.tokens.length, tolerance: 0,
      stem: [...base, "How many tokens does the lexical analyser pass to the parser?"],
      solution: [tokenRow, `That is ${res.tokens.length} tokens: ${breakdown}.${/\/\//.test(src) ? " The comment is skipped." : ""}`],
      replay,
    };
  }
  return {
    topic: "lexical-analysis", type: "nat", marks: 1, answer: res.symbols.length, tolerance: 0,
    stem: [...base, "Identifiers (but not keywords) are entered in the symbol table, one entry per distinct name. How many entries does the symbol table have after the whole source is scanned?"],
    solution: [`Distinct identifiers, in order of first appearance: ${res.symbols.map((s) => s.name).join(", ")}.${/\/\//.test(src) ? " Names inside a comment are never seen as tokens." : ""}`, `So the table has ${res.symbols.length} entries.`],
    replay,
  };
}

// --- Left recursion -------------------------------------------------------------------

const TERMS = ["a", "b", "c", "d", "e"];
const word = (r, n) => Array.from({ length: n }, () => pick(r, TERMS)).join(" ");

function leftRecursion(r) {
  if (r() < 0.55) {
    // Immediate left recursion on one non-terminal: pick the right rewrite.
    const alphas = [...new Set(Array.from({ length: int(r, 1, 2) }, () => word(r, int(r, 1, 2))))];
    const betas = [...new Set(Array.from({ length: int(r, 1, 2) }, () => word(r, int(r, 1, 2))))].filter((b) => !alphas.includes(b));
    if (!betas.length) return null;
    const text = `A -> ${[...alphas.map((a) => `A ${a}`), ...betas].join(" | ")}`;
    const res = removeLeftRecursion(parseGrammar(text));
    const right = grammarLines(toText(res.grammar)).join("; ");
    const B = (xs, tail) => xs.map((x) => `${x} ${tail}`).join(" | ");
    const wrongs = [
      `A → ${B(alphas, "A'")}; A' → ${B(betas, "A'")} | ε`,
      `A → ${B(betas, "A'")}; A' → ${B(alphas, "A'")}`,
      `A → ${B(betas, "A'")}; A' → ${alphas.map((a) => `A' ${a}`).join(" | ")} | ε`,
      `A → ${betas.map((b) => `A' ${b}`).join(" | ")}; A' → ${B(alphas, "A'")} | ε`,
    ];
    const m = mcq(r, right, wrongs);
    if (!m) return null;
    return {
      topic: "left-recursion", type: "mcq", marks: 1, ...m,
      stem: [`Consider the grammar ${arrow(text)}, where A is the only non-terminal.`, "Which of the following is an equivalent grammar with the left recursion removed?"],
      solution: [`A → A α | β is rewritten as A → β A' and A' → α A' | ε. Here α ∈ {${alphas.join(", ")}} and β ∈ {${betas.join(", ")}}.`, `Result: ${right}.`, "A' builds the α parts right-recursively, and the ε alternative lets it stop."],
      replay: query("/left-recursion", { g: text }),
    };
  }
  // Indirect left recursion: run the ordered algorithm and count productions.
  const [x, y, z, w, v] = shuffle(r, TERMS);
  const shapes = [
    `S -> A ${x} | ${y}\nA -> A ${z} | S ${w} | ${v}`,
    `S -> A ${x} | ${y}\nA -> S ${w} | ${v}`,
    `S -> A ${x} | B ${y}\nA -> S ${z} | ${w}\nB -> ${v}`,
    `S -> A ${x} | ${y}\nA -> A ${z} | S ${w} | ${v} | S ${x} ${y}`,
    `S -> A ${x} | S ${y} | ${z}\nA -> S ${w} | ${v}`,
  ];
  const text = pick(r, shapes);
  const g = parseGrammar(text);
  const res = removeLeftRecursion(g);
  const out = res.grammar;
  return {
    topic: "left-recursion", type: "nat", marks: 2, answer: out.prods.length, tolerance: 0,
    stem: [
      "Consider the grammar below, with start symbol S.",
      { table: { head: ["Productions"], rows: grammarLines(text).map((l) => [l]) } },
      `Left recursion is removed with the standard algorithm, taking the non-terminals in the order ${g.nonterminals.join(", ")}: for each Ai, substitute the bodies of every earlier Aj into rules Ai → Aj γ, then remove Ai's immediate left recursion using a new non-terminal Ai'. How many productions does the resulting grammar have? Count each alternative, including ε-productions, as one production.`,
    ],
    solution: [
      ...res.steps.map((s) => s.note.replace(/, with (\S+) = \1\./, ".")),
      { table: { head: ["Resulting grammar"], rows: grammarLines(toText(out)).map((l) => [l]) } },
      `That is ${out.prods.length} productions.`,
    ],
    replay: query("/left-recursion", { g: text }),
  };
}

// --- Grammars for FIRST/FOLLOW and LL(1) ------------------------------------------------

// A random small grammar with no left recursion, every non-terminal productive and reachable.
function randomGrammar(r) {
  const nts = ["S", "A", "B"];
  const terms = shuffle(r, ["a", "b", "c", "d"]);
  const lines = nts.map((A, k) => {
    const bodies = new Set();
    // One base body that is terminals only (or ε for A, B) keeps every symbol productive.
    bodies.add(k && r() < 0.5 ? EPS : pick(r, terms));
    for (let n = int(r, 1, 2); n > 0; n--) {
      const len = int(r, 1, 3), body = [];
      for (let i = 0; i < len; i++) body.push(r() < 0.45 ? pick(r, nts.filter((x, j) => !(i === 0 && (x === A || j < k)))) : pick(r, terms));
      if (body.every(Boolean)) bodies.add(body.join(" "));
    }
    return `${A} -> ${[...bodies].join(" | ")}`;
  });
  const text = lines.join("\n");
  const g = parseGrammar(text);
  if (g.nonterminals.length !== 3) return null;
  const reach = new Set(["S"]);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) if (reach.has(p.lhs)) for (const s of p.rhs) if (g.isNT(s) && !reach.has(s)) { reach.add(s); changed = true; }
  }
  return reach.size === 3 ? text : null;
}

const VETTED_LL = [
  GRAMMARS.exprLL.text,
  "S -> a B D h\nB -> c C\nC -> b C | ε\nD -> E F\nE -> g | ε\nF -> f | ε",
  "S -> A C B | C b B | B a\nA -> d a | B C\nB -> g | ε\nC -> h | ε",
  "S -> ( L ) | a\nL -> S L'\nL' -> , S L' | ε",
  "S -> i E t S S' | a\nS' -> e S | ε\nE -> b",
  "S -> A a A b | B b B a\nA -> ε\nB -> ε",
];

// A short sentence of the grammar (for the replay's input box).
function sentence(g, r) {
  const cost = new Map(g.nonterminals.map((A) => [A, Infinity]));
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) {
      const c = p.rhs.reduce((s, x) => s + (g.isNT(x) ? cost.get(x) : 1), 1);
      if (c < cost.get(p.lhs)) { cost.set(p.lhs, c); changed = true; }
    }
  }
  const out = [];
  const expand = (A, depth) => {
    const prods = g.prods.filter((p) => p.lhs === A);
    const cheapest = prods.reduce((b, p) => (p.rhs.reduce((s, x) => s + (g.isNT(x) ? cost.get(x) : 1), 1) < b.c ? { p, c: p.rhs.reduce((s, x) => s + (g.isNT(x) ? cost.get(x) : 1), 1) } : b), { p: prods[0], c: Infinity }).p;
    const p = depth < 3 && r() < 0.6 ? pick(r, prods) : cheapest;
    for (const s of p.rhs) if (g.isNT(s)) expand(s, depth + 1); else out.push(s);
  };
  expand(g.start, 0);
  return out.slice(0, 20).join(" ");
}

function ffTable(g, ff) {
  return { table: { head: ["Non-terminal", "FIRST", "FOLLOW"], rows: g.nonterminals.map((A) => [A, setText(order(g, [...ff.first.get(A)])), setText(order(g, [...ff.follow.get(A)]))]) } };
}
const order = (g, list) => [...list].sort((a, b) => rank(g, a) - rank(g, b));
const rank = (g, x) => (x === EPS ? 1e6 : x === END ? 1e6 - 1 : g.terminals.indexOf(x));

function firstFollowQ(r) {
  const text = r() < 0.3 ? pick(r, VETTED_LL) : randomGrammar(r);
  if (!text) return null;
  const g = parseGrammar(text);
  const ff = firstFollow(g);
  const which = r() < 0.5 ? "FIRST" : "FOLLOW";
  const X = pick(r, g.nonterminals);
  const set = (which === "FIRST" ? ff.first : ff.follow).get(X);
  const universe = [...g.terminals, which === "FIRST" ? EPS : END];
  if (universe.length < 4) return null;
  const chosen = shuffle(r, universe).slice(0, 4);
  const options = order(g, chosen);
  const answer = options.map((s, i) => (set.has(s) ? i : null)).filter((i) => i !== null);
  if (!answer.length || (answer.length === 4 && r() < 0.7)) return null;
  return {
    topic: "first-follow", type: "msq", marks: g.prods.length > 7 || which === "FOLLOW" ? 2 : 1, options, answer,
    stem: [
      `Consider the grammar below, with start symbol ${g.start}. Lower-case letters and punctuation are terminals, and ε is the empty string.`,
      { table: { head: ["Productions"], rows: grammarLines(text).map((l) => [l]) } },
      `Which of the following are in ${which}(${X})?`,
    ],
    solution: [
      ffTable(g, ff),
      `${which}(${X}) = ${setText(order(g, [...set]))}.${ff.nullable.length ? ` Nullable non-terminals: ${ff.nullable.join(", ")}.` : " No non-terminal is nullable."}`,
      ...(which === "FOLLOW" ? [`FOLLOW(${g.start}) always contains $. FOLLOW(B) gets FIRST(β) for every A → α B β, and FOLLOW(A) as well when β can derive ε.`] : [`FIRST of a body is FIRST of its first symbol, looking past symbols that can derive ε.`]),
    ],
    given: { text, which, X },
    replay: query("/first-follow", { g: text }),
  };
}

function ll1Parsing(r) {
  const text = r() < 0.3 ? pick(r, VETTED_LL) : randomGrammar(r);
  if (!text) return null;
  const g = parseGrammar(text);
  const t = ll1(g);
  const replay = query("/ll1-parsing", { g: text, w: sentence(g, r) });
  const base = [
    `Consider the grammar below, with start symbol ${g.start}. Productions are numbered for reference.`,
    { table: { head: ["#", "Production"], rows: g.prods.map((p) => [String(p.i + 1), showProd(p)]) } },
  ];
  const tableBlock = { table: { head: ["", ...t.cols], rows: g.nonterminals.map((A) => [A, ...t.cols.map((a) => t.cell(A, a).map((i) => String(i + 1)).join(", ") || "")]) } };
  const ffBlock = ffTable(g, t);
  const variant = pick(r, ["entry", "count", "ll1"]);
  if (variant === "entry") {
    const cells = g.nonterminals.flatMap((A) => t.cols.map((a) => [A, a])).filter(([A, a]) => t.cell(A, a).length <= 1 && g.prods.filter((p) => p.lhs === A).length >= 2);
    if (!cells.length) return null;
    const [A, a] = pick(r, cells);
    const cell = t.cell(A, a);
    const blank = "Blank (an error entry)";
    const right = cell.length ? showProd(g.prods[cell[0]]) : blank;
    const wrongs = shuffle(r, [...g.prods.filter((p) => p.lhs === A).map(showProd), blank]).concat(shuffle(r, g.prods.filter((p) => p.lhs !== A).map(showProd)));
    const m = mcq(r, right, wrongs);
    if (!m) return null;
    return {
      topic: "ll1-parsing", type: "mcq", marks: 2, ...m,
      stem: [...base, `In the LL(1) predictive parsing table M of this grammar, what is the entry M[${A}, ${a}]?`],
      solution: [ffBlock, `A → α goes in M[A, x] for every x in FIRST(α), and, if α can derive ε, for every x in FOLLOW(A).`, tableBlock, cell.length ? `So M[${A}, ${a}] = ${right}: ${t.reasons.find((x) => x.nt === A && x.t === a).why}.` : `No rule for ${A} puts anything in column ${a}, so the entry is blank.`],
      replay,
    };
  }
  if (variant === "count") {
    const filled = g.nonterminals.flatMap((A) => t.cols.map((a) => t.cell(A, a))).filter((c) => c.length).length;
    return {
      topic: "ll1-parsing", type: "nat", marks: 2, answer: filled, tolerance: 0,
      stem: [...base, `In the LL(1) parsing table of this grammar (rows ${g.nonterminals.join(", ")}; columns ${t.cols.join(", ")}), how many entries are non-blank?`],
      solution: [ffBlock, tableBlock, `${filled} entries are non-blank.${t.conflicts.length ? ` ${t.conflicts.length} of them ${t.conflicts.length === 1 ? "holds" : "hold"} more than one production, so the grammar is not LL(1).` : ""}`],
      replay,
    };
  }
  const ok = "The grammar is LL(1)";
  const claim = (A, a) => `It is not LL(1): M[${A}, ${a}] has more than one production`;
  const clean = shuffle(r, g.nonterminals.flatMap((A) => t.cols.map((a) => [A, a])).filter(([A, a]) => t.cell(A, a).length === 1));
  const conflict = t.conflicts.length ? pick(r, t.conflicts) : null;
  const realRight = conflict ? claim(conflict.nt, conflict.t) : ok;
  const wrongs = [...(t.conflicts.length ? [ok] : []), ...clean.map(([A, a]) => claim(A, a))];
  const m = mcq(r, realRight, wrongs);
  if (!m) return null;
  return {
    topic: "ll1-parsing", type: "mcq", marks: 2, ...m,
    stem: [...base, "Which of the following is true?"],
    solution: [ffBlock, tableBlock, t.conflicts.length ? `Conflicts: ${t.conflicts.map((c) => `M[${c.nt}, ${c.t}] holds productions ${c.prods.map((i) => i + 1).join(" and ")}`).join("; ")}. So the grammar is not LL(1).` : "Every entry holds at most one production, so the grammar is LL(1)."],
    replay,
  };
}

// --- LR parsing ---------------------------------------------------------------------------

const LR_POOL = [
  { text: GRAMMARS.expr.text, w: GRAMMARS.expr.input },
  { text: GRAMMARS.cc.text, w: GRAMMARS.cc.input },
  { text: GRAMMARS.lr.text, w: GRAMMARS.lr.input },
  { text: GRAMMARS.ifelse.text, w: GRAMMARS.ifelse.input },
  { text: GRAMMARS.balanced.text, w: GRAMMARS.balanced.input },
  { text: "S -> A a | b A c | B c | b B a\nA -> d\nB -> d", w: "b d c" },
  { text: "S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c", w: "a c d" },
  { text: "S -> ( L ) | x\nL -> S | L , S", w: "( x , x )" },
  { text: "S -> a S b | a b", w: "a a b b" },
  { text: "E -> E + E | E * E | id", w: "id + id * id" },
  { text: "S -> A A\nA -> a A | b", w: "a b b" },
  { text: "S -> A a | b A c | d c | b d a\nA -> d", w: "b d c" },
  { text: "E -> E + T | T\nT -> id | ( E )", w: "id + ( id )" },
  { text: "S -> a A | b B\nA -> c A | d\nB -> c B | d", w: "a c d" },
];
const CONFLICT_OPTIONS = ["No conflicts", "Shift-reduce conflicts only", "Reduce-reduce conflicts only", "Both shift-reduce and reduce-reduce conflicts"];

function lrParsing(r) {
  const { text, w } = pick(r, LR_POOL);
  const g = parseGrammar(text);
  const base = [
    `Consider the grammar below, with start symbol ${g.start}. It is augmented with ${g.start}' → ${g.start} before the item sets are built.`,
    { table: { head: ["#", "Production"], rows: g.prods.map((p) => [String(p.i + 1), showProd(p)]) } },
  ];
  if (r() < 0.5) {
    const kind = pick(r, ["lr0", "clr", "lalr"]);
    const auto = lrAutomaton(g, kind);
    const n = auto.states.length;
    const lr0 = kind === "lr0" ? n : lrAutomaton(g, "lr0").states.length;
    const what = kind === "lr0" ? "the canonical collection of LR(0) item sets (the states of the LR(0) and SLR(1) parsers)" : kind === "clr" ? "the canonical collection of LR(1) item sets (the states of the CLR(1) parser)" : "the LALR(1) parser, built by merging LR(1) states with the same core";
    return {
      topic: "lr-parsing", type: "nat", marks: kind === "lr0" ? 1 : 2, answer: n, tolerance: 0,
      given: { variant: "states", text, kind },
      stem: [...base, `How many states are in ${what}?`],
      solution: [
        { table: { head: ["State", "Items"], rows: auto.items.map((items, i) => [auto.names[i], items.map((it) => `${it.text}${it.la ? `, ${it.la}` : ""}`).join("; ")]) } },
        kind === "lr0" ? `Starting from closure({${g.start}' → •${g.start}}) and taking goto on every symbol gives ${n} distinct item sets.`
          : kind === "clr" ? `With lookaheads, item sets that differ only in their lookaheads are different states, giving ${n}. (The LR(0) collection has ${lr0}.)`
          : `The LR(1) collection has ${auto.lr1Count} states; merging those with equal cores leaves ${n}, always the same as the number of LR(0) states (${lr0}).`,
      ],
      replay: query("/lr-parsing", { g: text, w, kind }),
    };
  }
  const kind = pick(r, ["lr0", "slr", "lalr", "clr"]);
  const auto = lrAutomaton(g, kind);
  const table = lrTable(auto);
  const sr = table.conflicts.some((c) => c.kind === "shift/reduce"), rr = table.conflicts.some((c) => c.kind === "reduce/reduce");
  const answer = sr && rr ? 3 : sr ? 1 : rr ? 2 : 0;
  return {
    topic: "lr-parsing", type: "mcq", marks: 2, options: CONFLICT_OPTIONS, answer,
    given: { variant: "conflicts", text, kind },
    stem: [...base, `The ${LR_KINDS[kind]} parsing table is built for this grammar. Which of the following describes its conflicts?`],
    solution: [
      `The ${LR_KINDS[kind]} automaton has ${auto.states.length} states. ${kind === "lr0" ? "LR(0) puts a reduce in every column of a state with a complete item." : kind === "slr" ? "SLR(1) reduces A → α only on the terminals in FOLLOW(A)." : kind === "lalr" ? "LALR(1) reduces only on each merged item's lookaheads." : "CLR(1) reduces only on each item's own lookahead."}`,
      table.conflicts.length ? { table: { head: ["State", "Terminal", "Conflict", "Actions"], rows: table.conflicts.map((c) => [auto.names[c.state], c.t, c.kind, c.actions.map(table.label).join(" and ")]) } } : "No cell of the ACTION table holds two actions.",
      `So the answer is: ${CONFLICT_OPTIONS[answer]}.`,
    ],
    replay: query("/lr-parsing", { g: text, w, kind }),
  };
}

// --- Operator precedence ---------------------------------------------------------------------

const REL_NAME = { [LT]: "⋖ (yields precedence)", [EQ]: "≐ (same precedence)", [GT]: "⋗ (takes precedence)" };
const REL_OPTIONS = [REL_NAME[LT], REL_NAME[EQ], REL_NAME[GT], "No relation (error entry)"];

function randomLevels(r) {
  const ops = shuffle(r, ["+", "-", "*", "/", "^"]).slice(0, int(r, 3, 4));
  const n = int(r, 2, 3);
  const levels = Array.from({ length: n }, () => []);
  ops.forEach((o, i) => levels[i < n ? i : int(r, 0, n - 1)].push(o));
  return levels.map((l) => `${l.join(" ")} ${r() < 0.3 ? "right" : "left"}`).join("\n");
}

function operatorPrecedence(r) {
  const rules = r() < 0.6;
  const ex = pick(r, [OP_EXAMPLES.expr, OP_EXAMPLES.power, OP_EXAMPLES.minus]);
  const text = rules ? randomLevels(r) : ex.text;
  const res = rules ? fromRules(parseLevels(text)) : fromGrammar(parseGrammar(text));
  const ops = res.table.cols.filter((c) => !["id", "(", ")", END].includes(c));
  const w = rules ? ["id", ...ops.flatMap((o) => [o, "id"])].join(" ") : ex.input;
  const replay = query("/operator-precedence", { mode: rules ? "rules" : "grammar", g: text, w });
  const stem = rules ? [
    "An operator-precedence parser for E → E op E | ( E ) | id is built from the precedence levels below, lowest first. Each line lists the operators of one level and their associativity.",
    { table: { head: ["Level (lowest first)", "Operators", "Associativity"], rows: parseLevels(text).map((l, i) => [String(i + 1), l.ops.join(" "), l.assoc]) } },
  ] : [
    "An operator-precedence parser is built for the operator grammar below, using LEADING and TRAILING sets.",
    { table: { head: ["Productions"], rows: grammarLines(text).map((l) => [l]) } },
  ];
  const tableBlock = { table: { head: ["", ...res.table.cols], rows: res.table.cols.map((a) => [a, ...res.table.cols.map((b) => res.table.get(a, b).join(" ") || "")]) } };
  if (r() < 0.6) {
    const pairs = res.table.cols.flatMap((a) => res.table.cols.map((b) => [a, b])).filter(([a, b]) => res.table.get(a, b).length <= 1 && !(a === END && b === END));
    // Prefer operator against operator: the interesting entries.
    const interesting = pairs.filter(([a, b]) => ops.includes(a) && ops.includes(b));
    const [a, b] = pick(r, interesting.length && r() < 0.8 ? interesting : pairs);
    const rel = res.table.get(a, b)[0];
    const answer = rel ? REL_OPTIONS.indexOf(REL_NAME[rel]) : 3;
    const why = res.table.why(a, b)[0];
    return {
      topic: "operator-precedence", type: "mcq", marks: 1, options: REL_OPTIONS, answer,
      stem: [...stem, `In the precedence relation table, rows are the topmost terminal on the stack and columns are the next input symbol. What is the entry in row ${a}, column ${b}?`],
      solution: [tableBlock, rel ? `${a} ${rel} ${b}: ${why}.` : `There is no relation between ${a} and ${b}: these two can never be adjacent terminals in a sentential form, so a parser meeting them reports an error.`],
      replay,
    };
  }
  const fns = precedenceFunctions(res.table);
  if (!fns) return null;
  const fn = r() < 0.5 ? "f" : "g";
  const x = pick(r, ops.length ? ops : res.table.cols);
  const val = (fn === "f" ? fns.f : fns.g)[x];
  return {
    topic: "operator-precedence", type: "nat", marks: 2, answer: val, tolerance: 0,
    stem: [...stem, `Precedence functions f and g are derived from the relation table by the graph method: a ≐ b merges f(a) and g(b) into one node, a ⋖ b gives an edge from g(b) to f(a), a ⋗ b an edge from f(a) to g(b), and each function value is the length of the longest path leaving its node. What is ${fn}(${x})?`],
    solution: [tableBlock, { table: { head: ["Symbol", ...res.table.cols], rows: [["f", ...res.table.cols.map((c) => String(fns.f[c]))], ["g", ...res.table.cols.map((c) => String(fns.g[c]))]] } }, `So ${fn}(${x}) = ${val}.`],
    replay,
  };
}

// --- Syntax-directed translation ----------------------------------------------------------------

function exprDigits(r, depth = 0) {
  if (depth >= 2 || r() < 0.3) return String(int(r, 1, 9));
  const op = pick(r, ["+", "*"]);
  const left = exprDigits(r, depth + 1), right = exprDigits(r, depth + 1);
  const wrap = (s) => (op === "*" && /\+/.test(s) && r() < 0.8 ? `( ${s} )` : s);
  return `${wrap(left)} ${op} ${wrap(right)}`;
}

function sddQ(r) {
  const w = exprDigits(r);
  if (!/[+*]/.test(w) || w.split(" ").length > 25) return null;
  const kind = r() < 0.6 ? "desk" : "ll";
  const res = translate(kind, w);
  const rulesBlock = { table: { head: ["Production", "Semantic rule"], rows: SDDS[kind].rules.map(([p, s]) => [p, s.replace(/\s*\/\/.*$/, "")]) } };
  const replay = query("/syntax-directed-translation", { sdd: kind, w });
  if (kind === "ll" || r() < 0.5) {
    return {
      topic: "syntax-directed-translation", type: "nat", marks: kind === "ll" ? 2 : 1, answer: res.result, tolerance: 0,
      stem: ["Consider the syntax-directed definition below.", rulesBlock, `For the input ${w}, what value is computed at the root of the annotated parse tree (${kind === "desk" ? "L.val, the value of E" : "E.val, via the inherited and synthesised attributes of E′ and T′"})?`],
      solution: [
        SDDS[kind].about,
        `Evaluating in dependency order: ${res.order.filter((a) => a.kind !== "lex").map((a) => `${a.sym}.${a.name} = ${a.value}`).join(", ")}.`,
        `The root gets ${res.result}.`,
      ],
      replay,
    };
  }
  return {
    topic: "syntax-directed-translation", type: "nat", marks: 2, answer: res.edges.length, tolerance: 0,
    stem: ["Consider the S-attributed definition below, where digit.lexval is supplied by the lexical analyser.", rulesBlock, `Draw the dependency graph for the annotated parse tree of the input ${w}: one node per attribute instance (including each digit.lexval) and one edge from each attribute to every attribute computed from it. How many edges does it have?`],
    solution: [
      "Each F.val, T.val or E.val that copies one attribute adds one edge; a rule like E.val = E₁.val + T.val adds two.",
      `Attribute instances: ${res.attrs.length}. Edges: ${res.edges.length}.`,
      `The final value at the root is ${res.result}.`,
    ],
    replay,
  };
}

// --- Three-address code and DAGs -------------------------------------------------------------------

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2 };
function exprTree(r, leaves, shared, depth = 0) {
  if (shared && depth > 0 && r() < 0.35) return shared;
  if (depth >= 2 || (depth > 0 && r() < 0.3)) return { leaf: r() < 0.12 ? `-${pick(r, leaves)}` : pick(r, leaves) };
  return { op: pick(r, ["+", "-", "*", "*", "+", "/"]), l: exprTree(r, leaves, shared, depth + 1), r: exprTree(r, leaves, shared, depth + 1) };
}
function print(n) {
  if (n.leaf) return n.leaf;
  const side = (k, right) => {
    const s = print(k);
    return k.op && (PREC[k.op] < PREC[n.op] || (right && PREC[k.op] === PREC[n.op])) ? `(${s})` : s;
  };
  return `${side(n.l, false)} ${n.op} ${side(n.r, true)}`;
}

function threeAddressCode(r) {
  const leaves = ["a", "b", "c", "d"];
  const lines = [];
  const targets = shuffle(r, ["x", "y", "z", "a", "b"]);
  for (let k = int(r, 1, 3), i = 0; i < k; i++) {
    const shared = { op: pick(r, ["+", "-", "*"]), l: { leaf: pick(r, leaves) }, r: { leaf: pick(r, leaves) } };
    lines.push(`${targets[i]} = ${print(exprTree(r, leaves, shared))}`);
  }
  const text = lines.join("\n");
  let stmts;
  try { stmts = parseBlock(text); } catch { return null; }
  const naive = naiveTac(stmts), d = dag(stmts);
  const interior = d.nodes.filter((n) => !n.leaf).length;
  if (naive.temps === interior && r() < 0.7) return null; // no sharing: less interesting
  const block = { table: { head: ["Statement"], rows: lines.map((l) => [l]) } };
  const replay = query("/three-address-code", { src: text });
  if (r() < 0.5) {
    return {
      topic: "three-address-code", type: "nat", marks: 1, answer: naive.temps, tolerance: 0,
      stem: ["The basic block below is translated into three-address code directly from its syntax trees, with no common subexpressions shared: every operator, including unary minus, gets a new temporary.", block, "How many temporaries are used?"],
      solution: [{ table: { head: ["Three-address code"], rows: naive.code.map((i) => [showTac(i)]) } }, `${naive.temps} operator nodes, so ${naive.temps} temporaries t1 to t${naive.temps}.`],
      replay,
    };
  }
  return {
    topic: "three-address-code", type: "nat", marks: 2, answer: d.nodes.length, tolerance: 0,
    stem: ["A DAG is built for the basic block below. Each distinct initial value of a variable is a leaf, and an interior node is shared whenever the same operator is applied to the same child nodes. Assigning to a variable moves its label to the new node.", block, "How many nodes (leaves and interior nodes together) does the DAG have?"],
    solution: [
      { table: { head: ["Node", "Label", "Children", "Attached names"], rows: d.nodes.map((n) => [String(n.id + 1), n.op, n.kids.map((k) => String(k + 1)).join(", ") || "leaf", n.labels.join(", ")]) } },
      `${d.nodes.filter((n) => n.leaf).length} leaves and ${interior} interior nodes: ${d.nodes.length} in all.${naive.temps > interior ? ` Without sharing, the trees would need ${naive.temps} interior nodes.` : ""}`,
    ],
    replay,
  };
}
const showTac = (i) => (i.op === "=" ? `${i.res} = ${i.a1}` : i.op === "minus" ? `${i.res} = minus ${i.a1}` : `${i.res} = ${i.a1} ${i.op} ${i.a2}`);

// --- Code optimisation ------------------------------------------------------------------------------

function codeOptimisation(r) {
  const variant = pick(r, ["blocks", "live", "opt"]);
  const codeTable = (prog) => ({ table: { head: ["#", "Instruction"], rows: prog.map((ins, i) => [String(i + 1), `${ins.labels.length ? `${ins.labels.join(", ")}: ` : ""}${showIns(ins)}`]) } });
  if (variant === "opt") {
    const body = randomTac(r, { n: int(r, 6, 8) });
    const prog0 = parseTac(body).prog;
    const named = varsOf(prog0).filter((v) => !/^t\d+$/.test(v) && prog0.some((x) => x.res === v));
    if (!named.length) return null;
    const live = shuffle(r, named).slice(0, int(r, 1, Math.min(2, named.length)));
    const text = `${body}\nlive: ${live.join(" ")}`;
    const cfg = cfgOf(text);
    const res = optimise(cfg);
    const out = linearise(res.cfg);
    if (res.steps.length < 3) return null;
    return {
      topic: "code-optimisation", type: "nat", marks: 2, answer: out.length, tolerance: 0,
      stem: [
        `The basic block below is optimised locally. Only ${listAnd(live)} ${live.length > 1 ? "are" : "is"} live at the end of the block.`,
        codeTable(prog0),
        "Constant propagation, copy propagation, common subexpression elimination, constant folding, algebraic simplification (such as x + 0 = x and x * 1 = x) and dead-code elimination are applied repeatedly until nothing changes. How many instructions remain?",
      ],
      solution: [
        ...res.steps.filter((s) => !s.done).map((s) => s.note),
        { table: { head: ["Optimised code"], rows: out.length ? out.map((ins) => [showIns(ins, (x) => x.block)]) : [["(nothing left)"]] } },
        `${out.length} instruction${out.length === 1 ? " remains" : "s remain"}.`,
      ],
      replay: query("/code-optimisation", { src: text }),
    };
  }
  const text = randomTac(r, { n: int(r, 8, 11), jumps: true });
  const parsed = parseTac(text);
  if (!parsed.prog.some((x) => x.kind === "if")) return null;
  const bb = basicBlocks(parsed);
  const replay = query("/code-optimisation", { src: text });
  if (variant === "blocks") {
    return {
      topic: "code-optimisation", type: "nat", marks: 1, answer: bb.blocks.length, tolerance: 0,
      stem: ["Consider the three-address code below.", codeTable(parsed.prog), "Into how many basic blocks is it partitioned?"],
      solution: [
        "Leaders: the first instruction, every jump target, and every instruction right after a jump.",
        `Leaders here: instructions ${bb.leaders.map((i) => i + 1).join(", ")}.`,
        { table: { head: ["Block", "Instructions"], rows: bb.blocks.map((b) => [b.id, b.code.length > 1 ? `${b.start + 1} to ${b.start + b.code.length}` : String(b.start + 1)]) } },
        `So there are ${bb.blocks.length} basic blocks.`,
      ],
      replay,
    };
  }
  const lv = liveness(bb.cfg);
  const target = pick(r, bb.blocks.slice(1));
  if (!target) return null;
  const vars = varsOf(parsed.prog);
  if (vars.length < 4) return null;
  const set = lv.IN[target.id];
  const options = shuffle(r, vars).slice(0, 4);
  const answer = options.map((v, i) => (set.has(v) ? i : null)).filter((i) => i !== null);
  if (!answer.length) return null;
  return {
    topic: "code-optimisation", type: "msq", marks: 2, options, answer,
    stem: [
      "Consider the three-address code below. Temporaries t1, t2, … are dead at the end; every other variable is live at the end of the program.",
      codeTable(parsed.prog),
      `Which of the following variables are live on entry to the basic block that starts at instruction ${target.start + 1}?`,
    ],
    solution: [
      { table: { head: ["Block", "Starts at", "use", "def", "IN", "OUT"], rows: bb.cfg.blocks.map((b) => [b.id, String(b.start + 1), setText(lv.ud[b.id].use), setText(lv.ud[b.id].def), setText([...lv.IN[b.id]]), setText([...lv.OUT[b.id]])]) } },
      "IN[B] = use[B] ∪ (OUT[B] − def[B]) and OUT[B] is the union of IN over B's successors, iterated until nothing changes.",
      `IN of the block at instruction ${target.start + 1} = ${setText([...set])}.`,
    ],
    replay,
  };
}

// --- Register allocation --------------------------------------------------------------------------

function straightLine(r) {
  const inputs = shuffle(r, ["p", "q", "r", "s"]).slice(0, 2);
  const names = shuffle(r, ["a", "b", "c", "d", "e", "f", "g"]).slice(0, int(r, 4, 6));
  const avail = [...inputs], unused = new Set(inputs), lines = [];
  for (const x of names) {
    const pickUse = () => {
      const pending = avail.filter((v) => unused.has(v));
      const v = pending.length && r() < 0.6 ? pick(r, pending) : pick(r, avail);
      unused.delete(v);
      return v;
    };
    const a = pickUse(), b = r() < 0.15 ? String(int(r, 1, 9)) : pickUse();
    lines.push(`${x} = ${a} ${pick(r, ["+", "-", "*"])} ${b}`);
    avail.push(x); unused.add(x);
  }
  const live = names.filter((v) => unused.has(v));
  return `${lines.join("\n")}\nlive: ${live.join(" ")}`;
}

function registerAllocation(r) {
  const text = straightLine(r);
  const res = analyse(text);
  const k = chromatic(res.vars, res.edges);
  const code = text.split("\n").filter((l) => !l.startsWith("live:"));
  const live = text.split("\n").find((l) => l.startsWith("live:")).slice(5).trim().split(" ");
  const entry = [...(res.live.IN[res.cfg.blocks[0].id] ?? [])];
  const base = [
    `Consider the basic block below. ${listAnd(entry)} ${entry.length > 1 ? "hold" : "holds"} values on entry, and only ${listAnd(live)} ${live.length > 1 ? "are" : "is"} live at the end.`,
    { table: { head: ["#", "Instruction"], rows: code.map((l, i) => [String(i + 1), l]) } },
  ];
  const liveTable = { table: { head: ["#", "Instruction", "Live after"], rows: res.rows.map((row, i) => [String(i + 1), row.text, setText(row.after)]) } };
  const edgeText = res.edges.map((e) => `(${e.a}, ${e.b})`).join(", ") || "none";
  const replay = query("/register-allocation", { src: text, k });
  if (r() < 0.6) {
    return {
      topic: "register-allocation", type: "nat", marks: 2, answer: k, tolerance: 0,
      stem: [...base, "Every variable must be kept in a register (no spilling), and a register can be reused once the value in it is dead. What is the minimum number of registers needed?"],
      solution: [liveTable, `Two variables interfere when one is defined while the other is live (inputs live on entry all interfere). Interference edges: ${edgeText}.`, `The interference graph can be coloured with ${k} colours and no fewer, so ${k} registers are needed.`],
      replay,
    };
  }
  return {
    topic: "register-allocation", type: "nat", marks: 1, answer: res.edges.length, tolerance: 0,
    stem: [...base, "In the interference graph, there is an edge between two variables when one is defined at a point where the other is live afterwards (and the inputs live on entry interfere with each other). How many edges does the graph have?"],
    solution: [liveTable, `Edges: ${edgeText}. That is ${res.edges.length}.`],
    replay,
  };
}

export const TOPICS = [
  { slug: "lexical-analysis", subject: SUBJECT, title: "Lexical analysis", make: lexicalAnalysis },
  { slug: "left-recursion", subject: SUBJECT, title: "Left recursion", make: leftRecursion },
  { slug: "first-follow", subject: SUBJECT, title: "FIRST and FOLLOW", make: firstFollowQ },
  { slug: "ll1-parsing", subject: SUBJECT, title: "LL(1) parsing", make: ll1Parsing },
  { slug: "lr-parsing", subject: SUBJECT, title: "LR parsing", make: lrParsing },
  { slug: "operator-precedence", subject: SUBJECT, title: "Operator precedence", make: operatorPrecedence },
  { slug: "syntax-directed-translation", subject: SUBJECT, title: "Syntax-directed translation", make: sddQ },
  { slug: "three-address-code", subject: SUBJECT, title: "Three-address code and DAGs", make: threeAddressCode },
  { slug: "code-optimisation", subject: SUBJECT, title: "Code optimisation", make: codeOptimisation },
  { slug: "register-allocation", subject: SUBJECT, title: "Register allocation", make: registerAllocation },
];
