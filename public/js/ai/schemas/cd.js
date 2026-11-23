// AI tool schemas: compiler design. See ../schema-kit.js for the shape.
import { tool } from "../schema-kit.js";
import { lex, EXAMPLES as LEX_EXAMPLES } from "../../engines/lexer.js";
import { EPS, END, EXAMPLES as GRAMMARS, parseGrammar, toText, showProd, removeLeftRecursion, leftFactor, firstFollow, ll1, ll1Parse, tokenize, lrAutomaton, lrTable, lrParse, LR_KINDS } from "../../engines/grammar.js";
import { build as buildOp, opParse, tokenizeOp, precedenceFunctions, EXAMPLES as OP_EXAMPLES } from "../../engines/opprec.js";
import { SDDS, translate } from "../../engines/sdt.js";
import { parseBlock, generate as naiveTac, dag, EXAMPLES as TAC_EXAMPLES } from "../../engines/tac.js";
import { parseTac, basicBlocks, liveness, optimise, linearise, PASSES, EXAMPLES as OPT_EXAMPLES } from "../../engines/optimise.js";
import { analyse, colour, chromatic, EXAMPLES as RA_EXAMPLES } from "../../engines/regalloc.js";

// Grammars in the URL: one rule per line (real newlines), alternatives with |,
// symbols separated by spaces, ε (or eps) for the empty body.
const GRAMMAR_FORMAT = 'one rule per line separated by real newlines ("\\n"), alternatives with |, symbols separated by spaces, ε for the empty body; the first rule\'s left side is the start symbol. Example: "E -> T E\'\\nE\' -> + T E\' | ε\\nT -> id"';

// Sets as "{ a b $ ε }", symbols separated by spaces (a terminal may itself be a comma): terminals in grammar order, then $, then ε.
const setText = (g, set) => {
  const rank = (x) => (x === EPS ? 1e6 : x === END ? 1e6 - 1 : g.terminals.indexOf(x));
  const xs = [...set].sort((a, b) => rank(a) - rank(b));
  return xs.length ? `{ ${xs.join(" ")} }` : "{ }";
};
const yesNo = (b) => (b ? "yes" : "no");
const oneLine = (text) => text.split("\n").join("; ");
const PASS_IDS = Object.keys(PASSES);

export const SCHEMAS = [
  tool("lexical-analysis", {
    keywords: "lexer scanner tokens lexeme token count symbol table maximal munch longest match dfa lexical error identifiers keywords",
    params: {
      src: { type: "string", maxLength: 500, format: 'source text in a C-like language, at most 500 characters; real newlines between lines; // starts a comment. Example: "int x = 10;\\nif (x <= y) y = y + 1.5e3;"', default: LEX_EXAMPLES.dragon.src, desc: "source code to scan" },
    },
    answers: {
      tokens: "number of tokens passed to the parser (whitespace and comments excluded)",
      symbols: "symbol-table entries (distinct identifiers that are not keywords)",
      errors: "number of lexical errors",
      "count.keyword": "tokens of one class (one key per class present: count.id, count.number, count.relop, count.arith, count.assign, count.punct, count.keyword)",
      lexemes: "the token lexemes in order, separated by |",
    },
    examples: [
      { request: "How many tokens in: int count = 0; while (count < 10) count = count + 1;", params: { src: "int count = 0; while (count < 10) count = count + 1;" } },
      { request: "Count the tokens in x<=>y 12.5e+ 3.x using maximal munch", params: { src: "x<=>y 12.5e+ 3.x" } },
    ],
    validate(v) {
      const res = lex(v.src);
      const values = { tokens: res.tokens.length, symbols: res.symbols.length, errors: res.errors.length, lexemes: res.tokens.map((t) => t.lexeme).join(" | ") };
      for (const t of res.tokens) values[`count.${t.cls}`] = (values[`count.${t.cls}`] ?? 0) + 1;
      return { text: `${res.tokens.length} tokens, ${res.symbols.length} symbol-table entr${res.symbols.length === 1 ? "y" : "ies"}${res.errors.length ? `, ${res.errors.length} lexical error${res.errors.length > 1 ? "s" : ""}` : ""}.`, values };
    },
  }),

  tool("left-recursion", {
    keywords: "left recursion removal elimination immediate indirect left factoring common prefix top-down grammar transformation A -> A alpha | beta",
    params: {
      g: { type: "string", format: GRAMMAR_FORMAT, default: GRAMMARS.indirect.text, desc: "the grammar to transform (non-terminals taken in the order they appear)" },
    },
    answers: {
      productions: "number of productions after removing left recursion (each alternative, ε included, counts once)",
      grammar: "the grammar after removing left recursion, rules separated by ;",
      leftRecursive: "yes or no: did the grammar have left recursion",
      factored: "the final grammar after also left factoring, rules separated by ;",
      factoredProductions: "number of productions after left factoring as well",
      nonterminals: "number of non-terminals after removing left recursion",
    },
    examples: [
      { request: "Remove left recursion from E -> E + T | T, T -> T * F | F, F -> ( E ) | id", params: { g: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id" } },
      { request: "Eliminate indirect left recursion: S -> A a | b, A -> A c | S d | c. How many productions?", params: { g: "S -> A a | b\nA -> A c | S d | c" } },
    ],
    validate(v) {
      const g = parseGrammar(v.g);
      const lr = removeLeftRecursion(g), lf = leftFactor(lr.grammar);
      const values = {
        productions: lr.grammar.prods.length, grammar: oneLine(toText(lr.grammar)), leftRecursive: yesNo(lr.changed),
        factored: oneLine(toText(lf.grammar)), factoredProductions: lf.grammar.prods.length, nonterminals: lr.grammar.nonterminals.length,
      };
      return { text: `${lr.changed ? "Without left recursion" : "No left recursion; the grammar stays"}: ${values.grammar} (${values.productions} productions).${lf.changed ? ` After left factoring: ${values.factored}.` : ""}`, values };
    },
  }),

  tool("first-follow", {
    keywords: "first set follow set nullable epsilon first() follow() predictive parsing lookahead",
    params: {
      g: { type: "string", format: GRAMMAR_FORMAT, default: GRAMMARS.exprLL.text, desc: "the grammar" },
    },
    answers: {
      "first.E": 'FIRST of a non-terminal as "{ a b ε }" (one key per non-terminal: first.S, first.A, ...)',
      "follow.E": 'FOLLOW of a non-terminal as "{ a $ }" (one key per non-terminal)',
      nullable: "the non-terminals that can derive ε, space separated (empty if none)",
    },
    examples: [
      { request: "Find FIRST and FOLLOW for S -> A C B | C b B | B a, A -> d a | B C, B -> g | ε, C -> h | ε", params: { g: "S -> A C B | C b B | B a\nA -> d a | B C\nB -> g | ε\nC -> h | ε" } },
      { request: "FOLLOW sets of E -> T E', E' -> + T E' | ε, T -> F T', T' -> * F T' | ε, F -> ( E ) | id", params: { g: GRAMMARS.exprLL.text } },
    ],
    validate(v) {
      const g = parseGrammar(v.g);
      const ff = firstFollow(g);
      const values = { nullable: ff.nullable.join(" ") };
      for (const A of g.nonterminals) { values[`first.${A}`] = setText(g, ff.first.get(A)); values[`follow.${A}`] = setText(g, ff.follow.get(A)); }
      return { text: g.nonterminals.map((A) => `FIRST(${A}) = ${values[`first.${A}`]}, FOLLOW(${A}) = ${values[`follow.${A}`]}`).join("; ") + ".", values };
    },
  }),

  tool("ll1-parsing", {
    keywords: "ll(1) ll1 predictive parsing table top-down parser m[a,a] conflict is the grammar ll(1) recursive descent parse stack",
    params: {
      g: { type: "string", format: GRAMMAR_FORMAT, default: GRAMMARS.exprLL.text, desc: "the grammar" },
      w: { type: "string", format: 'input tokens separated by spaces, without the $ end marker. Example: "id + id * id"', default: GRAMMARS.exprLL.input, desc: "string to parse" },
    },
    answers: {
      ll1: "yes or no: is the grammar LL(1) (no cell with two productions)",
      conflicts: "number of table cells holding more than one production",
      conflictCells: 'the conflicting cells, like "M[S, a], M[A, b]"',
      filled: "number of non-blank entries in the parsing table",
      "M[E,id]": 'one table entry M[A,a] as a production "E → T E\'", "blank", or several joined by " and " (one key per cell, no spaces inside the brackets)',
      accepted: "yes or no: does the parser accept the input w",
    },
    examples: [
      { request: "Is S -> i E t S S' | a, S' -> e S | ε, E -> b LL(1)?", params: { g: "S -> i E t S S' | a\nS' -> e S | ε\nE -> b", w: "i b t a" } },
      { request: "Build the LL(1) table for E -> T E', E' -> + T E' | ε, T -> F T', T' -> * F T' | ε, F -> ( E ) | id and parse id + id * id", params: { g: GRAMMARS.exprLL.text, w: "id + id * id" } },
    ],
    validate(v) {
      const g = parseGrammar(v.g);
      const t = ll1(g);
      const res = ll1Parse(g, t, tokenize(v.w, g));
      const values = { ll1: yesNo(!t.conflicts.length), conflicts: t.conflicts.length, conflictCells: t.conflicts.map((c) => `M[${c.nt}, ${c.t}]`).join(", "), filled: 0, accepted: yesNo(res.accepted) };
      for (const A of g.nonterminals) for (const a of t.cols) {
        const cell = t.cell(A, a);
        if (cell.length) values.filled++;
        values[`M[${A},${a}]`] = cell.length ? cell.map((i) => showProd(g.prods[i])).join(" and ") : "blank";
      }
      return { text: `${t.conflicts.length ? `Not LL(1): ${t.conflicts.length} conflict${t.conflicts.length > 1 ? "s" : ""} (${values.conflictCells})` : "The grammar is LL(1)"}; ${values.filled} non-blank entries; the input is ${res.accepted ? "accepted" : "rejected"}.`, values };
    },
  }),

  tool("operator-precedence", {
    keywords: "operator precedence parsing relation table leading trailing yields takes precedence precedence functions f g operator grammar associativity shift reduce",
    params: {
      mode: { type: "enum", values: ["grammar", "rules"], default: "grammar", desc: "grammar: build the table from an operator grammar via LEADING and TRAILING; rules: from precedence levels for E -> E op E | ( E ) | id" },
      g: { type: "string", format: `in grammar mode, ${GRAMMAR_FORMAT}. In rules mode, precedence levels lowest first, one per line (or separated by ;): operators separated by spaces, then left or right. Example: "+ - left\\n* / left\\n^ right"`, desc: `the operator grammar or the precedence levels; when absent the view uses "${oneLine(OP_EXAMPLES.expr.text)}" (grammar mode) or "${oneLine(OP_EXAMPLES.ambiguous.text)}" (rules mode)` },
      w: { type: "string", format: 'input tokens separated by spaces, without $. Example: "id + id * id"', desc: `string to parse; when absent the view uses "${OP_EXAMPLES.expr.input}" (grammar mode) or "${OP_EXAMPLES.ambiguous.input}" (rules mode)` },
    },
    answers: {
      "rel.+.*": "relation in row a (top terminal on the stack), column b (next input) as ⋖, ≐, ⋗, blank, or several joined by / for a conflict (one key per pair: rel.id.+, rel.$.id, ...)",
      conflicts: "number of cells with more than one relation",
      operatorPrecedence: "yes or no: no conflicts",
      "f.+": "precedence function f of a terminal (one key per terminal; absent when no functions exist)",
      "g.+": "precedence function g of a terminal",
      functions: "yes or no: do precedence functions exist",
      "leading.E": "LEADING set of a non-terminal as \"{ + * ( id }\" (grammar mode only)",
      "trailing.E": "TRAILING set of a non-terminal (grammar mode only)",
      accepted: "yes or no: does the parser accept w",
    },
    examples: [
      { request: "Operator precedence table for + - left, * / left, ^ right; what is f(*) and the relation between ^ and ^?", params: { mode: "rules", g: "+ - left\n* / left\n^ right", w: "id + id * id ^ id" } },
      { request: "Find LEADING and TRAILING and the precedence relations for E -> E + T | T, T -> T * F | F, F -> ( E ) | id", params: { mode: "grammar", g: OP_EXAMPLES.expr.text, w: "id + id * id" } },
    ],
    validate(v) {
      const rules = v.mode === "rules";
      const ex = rules ? OP_EXAMPLES.ambiguous : OP_EXAMPLES.expr;
      const text = v.g ?? ex.text, w = v.w ?? ex.input;
      const res = buildOp(v.mode, text);
      const { table } = res;
      const conflicts = table.conflicts();
      const fns = precedenceFunctions(table);
      const parse = opParse(res, tokenizeOp(w, table.cols));
      const values = { conflicts: conflicts.length, operatorPrecedence: yesNo(!conflicts.length), functions: yesNo(!!fns), accepted: yesNo(parse.accepted) };
      for (const a of table.cols) for (const b of table.cols) values[`rel.${a}.${b}`] = table.get(a, b).join("/") || "blank";
      if (fns) for (const a of table.cols) { values[`f.${a}`] = fns.f[a]; values[`g.${a}`] = fns.g[a]; }
      if (!rules) {
        const T = res.g.terminals, order = (s) => [...s].sort((x, y) => T.indexOf(x) - T.indexOf(y));
        for (const A of res.g.nonterminals) {
          values[`leading.${A}`] = `{ ${order(res.leading.get(A)).join(" ")} }`;
          values[`trailing.${A}`] = `{ ${order(res.trailing.get(A)).join(" ")} }`;
        }
      }
      const fText = fns ? ` f: ${table.cols.map((a) => `${a} ${fns.f[a]}`).join(", ")}; g: ${table.cols.map((a) => `${a} ${fns.g[a]}`).join(", ")}.` : " No precedence functions exist.";
      return { text: `${conflicts.length ? `${conflicts.length} conflicting cells` : "No conflicts"} in the ${table.cols.length}x${table.cols.length} relation table;${fText} The input is ${parse.accepted ? "accepted" : "rejected"}.`, values };
    },
  }),

  tool("lr-parsing", {
    keywords: "lr(0) slr slr(1) lalr lalr(1) clr clr(1) canonical lr(1) item sets dfa of items goto closure states shift reduce conflict reduce-reduce conflict bottom-up parser action goto table",
    params: {
      g: { type: "string", format: GRAMMAR_FORMAT, default: GRAMMARS.expr.text, desc: "the grammar (it is augmented with S' -> S automatically)" },
      w: { type: "string", format: 'input tokens separated by spaces, without $. Example: "id * id + id"', default: "id * id + id", desc: "string to parse" },
      kind: { type: "enum", values: Object.keys(LR_KINDS), default: "slr", desc: "parser to build: lr0 (LR(0)), slr (SLR(1)), lalr (LALR(1)), clr (canonical LR(1))" },
    },
    answers: {
      states: "number of states of the chosen parser",
      lr0States: "number of LR(0) item sets (also the SLR(1) states)",
      lalrStates: "number of LALR(1) states",
      clrStates: "number of canonical LR(1) (CLR) states",
      conflicts: "number of conflicting ACTION cells in the chosen parser's table",
      srConflicts: "shift-reduce conflicts in the chosen table",
      rrConflicts: "reduce-reduce conflicts in the chosen table",
      conflictType: "none, shift-reduce, reduce-reduce or both, for the chosen table",
      lr0: "yes or no: is the grammar LR(0) (likewise keys slr, lalr, clr)",
      accepted: "yes or no: does the chosen parser accept w",
    },
    examples: [
      { request: "How many states in the LALR(1) parser for S -> C C, C -> c C | d? And CLR?", params: { g: "S -> C C\nC -> c C | d", w: "c d d", kind: "lalr" } },
      { request: "Does S -> L = R | R, L -> * R | id, R -> L have SLR conflicts?", params: { g: "S -> L = R | R\nL -> * R | id\nR -> L", w: "id = * id", kind: "slr" } },
    ],
    validate(v) {
      const g = parseGrammar(v.g);
      const autos = Object.fromEntries(Object.keys(LR_KINDS).map((k) => [k, lrAutomaton(g, k)]));
      const tables = Object.fromEntries(Object.entries(autos).map(([k, a]) => [k, lrTable(a)]));
      const auto = autos[v.kind], t = tables[v.kind];
      const sr = t.conflicts.filter((c) => c.kind === "shift/reduce").length, rr = t.conflicts.length - sr;
      const res = lrParse(auto, t, tokenize(v.w, g));
      const values = {
        states: auto.states.length, lr0States: autos.lr0.states.length, lalrStates: autos.lalr.states.length, clrStates: autos.clr.states.length,
        conflicts: t.conflicts.length, srConflicts: sr, rrConflicts: rr, conflictType: sr && rr ? "both" : sr ? "shift-reduce" : rr ? "reduce-reduce" : "none",
        accepted: yesNo(res.accepted),
      };
      for (const k of Object.keys(LR_KINDS)) values[k] = yesNo(!tables[k].conflicts.length);
      const which = Object.keys(LR_KINDS).filter((k) => values[k] === "yes").map((k) => LR_KINDS[k]);
      return { text: `${LR_KINDS[v.kind]}: ${values.states} states, ${t.conflicts.length ? `${sr} shift-reduce and ${rr} reduce-reduce conflicts` : "no conflicts"}. LR(0) ${values.lr0States}, LALR(1) ${values.lalrStates}, CLR(1) ${values.clrStates} states; the grammar is ${which.length ? which.join(", ") : "none of LR(0), SLR(1), LALR(1), CLR(1)"}. The input is ${res.accepted ? "accepted" : "rejected"}.`, values };
    },
  }),

  tool("syntax-directed-translation", {
    keywords: "sdt sdd syntax directed definition translation scheme attributes synthesised synthesized inherited s-attributed l-attributed annotated parse tree dependency graph evaluation order desk calculator",
    params: {
      sdd: { type: "enum", values: Object.keys(SDDS), default: "desk", desc: "definition: desk (S-attributed desk calculator, L -> E n, E -> E + T, T -> T * F, F -> digit), ll (the same without left recursion, inherited attributes via E' and T'), decl (declarations, type passed down as L.inh)" },
      w: { type: "string", format: 'desk or ll: an expression of whole numbers, + and * and parentheses, tokens separated by spaces, under 25 symbols (e.g. "3 * 5 + 4"); decl: int or float then up to 6 names separated by commas (e.g. "float x, y, z")', desc: `the input; when absent the view uses "${SDDS.desk.input}" for desk and ll, "${SDDS.decl.input}" for decl` },
    },
    answers: {
      result: "the value at the root (desk, ll), or for decl each name with its type",
      attributes: "number of attributes evaluated (not counting digit.lexval)",
      synthesised: "number of synthesised attributes evaluated",
      inherited: "number of inherited attributes evaluated",
      instances: "number of attribute instances in the dependency graph, digit.lexval included",
      edges: "number of edges in the dependency graph",
      "type.x": "decl only: the type given to one identifier",
    },
    examples: [
      { request: "Using the desk calculator SDD, what is L.val for 3 * 5 + 4? How many dependency edges?", params: { sdd: "desk", w: "3 * 5 + 4" } },
      { request: "Evaluate 2 * ( 3 + 4 ) with inherited attributes E'.inh and T'.inh", params: { sdd: "ll", w: "2 * ( 3 + 4 )" } },
    ],
    validate(v) {
      const w = v.w ?? SDDS[v.sdd].input;
      const res = translate(v.sdd, w);
      const inh = res.order.filter((a) => a.kind === "inh").length;
      const values = { attributes: res.order.length, synthesised: res.order.length - inh, inherited: inh, instances: res.attrs.length, edges: res.edges.length };
      if (typeof res.result === "object") {
        values.result = Object.entries(res.result).map(([k, t]) => `${k}: ${t}`).join(", ");
        for (const [k, t] of Object.entries(res.result)) values[`type.${k}`] = t;
      } else values.result = res.result;
      return { text: `${SDDS[v.sdd].name}: the result is ${values.result}; ${values.attributes} attributes evaluated (${inh} inherited), ${values.edges} dependency edges.`, values };
    },
  }),

  tool("three-address-code", {
    keywords: "tac three address code intermediate code temporaries quadruples triples indirect triples dag directed acyclic graph common subexpression value numbering syntax tree",
    params: {
      src: { type: "string", format: 'assignments, one per line (real newlines) or separated by ;, at most 12; operators + - * / % ^ and unary minus, with parentheses. Example: "a = b * -c + b * -c" or "x = a + b; y = a + b * c"', default: TAC_EXAMPLES.dragon.text, desc: "the basic block" },
    },
    answers: {
      temps: "temporaries used when every operator gets a new one (no sharing)",
      treeInstructions: "three-address instructions from the syntax trees (also the number of quadruples or triples)",
      dagInstructions: "instructions generated from the DAG",
      dagNodes: "nodes in the DAG, leaves and interior together",
      leaves: "leaf nodes in the DAG",
      interior: "interior (operator) nodes in the DAG",
      saved: "instructions saved by the DAG",
    },
    examples: [
      { request: "Three-address code and DAG for a = b * -c + b * -c", params: { src: "a = b * -c + b * -c" } },
      { request: "How many nodes in the DAG of the block a = b + c, b = a - d, c = b + c, d = a - d?", params: { src: "a = b + c\nb = a - d\nc = b + c\nd = a - d" } },
    ],
    validate(v) {
      const stmts = parseBlock(v.src);
      const naive = naiveTac(stmts), d = dag(stmts);
      const leaves = d.nodes.filter((n) => n.leaf).length;
      const values = { temps: naive.temps, treeInstructions: naive.code.length, dagInstructions: d.code.length, dagNodes: d.nodes.length, leaves, interior: d.nodes.length - leaves, saved: naive.code.length - d.code.length };
      return { text: `From the trees: ${values.temps} temporaries, ${values.treeInstructions} instructions. The DAG has ${values.dagNodes} nodes (${leaves} leaves, ${values.interior} interior) and gives ${values.dagInstructions} instructions.`, values };
    },
  }),

  tool("code-optimisation", {
    keywords: "code optimization optimisation basic blocks leaders flow graph cfg constant propagation folding copy propagation common subexpression elimination cse dead code elimination strength reduction algebraic simplification liveness live variables",
    params: {
      src: { type: "string", format: 'three-address code, one instruction per line (real newlines), optionally numbered "(5) ..."; labels "L1: ..."; jumps "goto L1", "goto (5)", "if a < b goto L1", "ifFalse x goto L1"; arrays "x = a[i]", "a[i] = x"; "return x"; an optional last line "live: a b" names what is live at the end (otherwise every non-temporary). At most 40 instructions. Example: "a = 4\\nb = a * 2\\nc = b + x\\nlive: c"', default: OPT_EXAMPLES.quicksort.text, desc: "the three-address code" },
      passes: { type: "string", format: `optimisation passes to run, comma separated, any of ${PASS_IDS.join(",")}`, default: PASS_IDS.join(","), desc: "which local optimisations to apply (all by default)" },
    },
    answers: {
      instructions: "instructions before optimisation",
      leaders: "number of leaders",
      leaderList: "the leaders as instruction numbers, comma separated",
      blocks: "number of basic blocks",
      edges: "flow-graph edges, including ENTRY and EXIT edges",
      blockEdges: "flow-graph edges between basic blocks only",
      remaining: "instructions left after optimisation",
      rewrites: "number of rewrites the passes made",
      "in.B2": 'variables live on entry to a block as "{ a b }" (one key per block: in.B1, out.B1, ...)',
      "out.B2": "variables live on exit from a block",
    },
    examples: [
      { request: "How many basic blocks in the quicksort fragment (1) i = m - 1 ... ?", params: { src: OPT_EXAMPLES.quicksort.text } },
      { request: "Optimise a = 4, b = a * 2, c = b, d = c + x, t1 = d * 1, t2 = t1 * 8, e = t2 + 0, f = x ^ 2 with only e and f live. How many instructions remain?", params: { src: OPT_EXAMPLES.folding.text } },
    ],
    validate(v) {
      const passes = String(v.passes).split(",").map((x) => x.trim()).filter(Boolean);
      const bad = passes.find((x) => !PASSES[x]);
      if (bad) throw new Error(`Unknown pass "${bad}": use any of ${PASS_IDS.join(", ")}.`);
      const parsed = parseTac(v.src);
      const bb = basicBlocks(parsed);
      const lv = liveness(bb.cfg);
      const opt = optimise(bb.cfg, passes);
      const out = linearise(opt.cfg);
      const nums = bb.leaders.map((i) => parsed.prog[i].num);
      const values = {
        instructions: parsed.prog.length, leaders: bb.leaders.length, leaderList: nums.join(", "), blocks: bb.blocks.length,
        edges: bb.edges.length, blockEdges: bb.edges.filter((e) => e.from !== "ENTRY" && e.to !== "EXIT").length,
        remaining: out.length, rewrites: opt.steps.length - 1,
      };
      const fmt = (s) => (s.size ? `{ ${[...s].join(" ")} }` : "{ }");
      for (const b of bb.blocks) { values[`in.${b.id}`] = fmt(lv.IN[b.id]); values[`out.${b.id}`] = fmt(lv.OUT[b.id]); }
      return { text: `${values.instructions} instructions, leaders ${values.leaderList}, so ${values.blocks} basic block${values.blocks === 1 ? "" : "s"}; after optimisation ${values.remaining} instructions remain (${values.rewrites} rewrites).`, values };
    },
  }),

  tool("register-allocation", {
    keywords: "register allocation interference graph graph colouring coloring chaitin briggs spill spilling live ranges liveness minimum registers k registers chromatic number",
    params: {
      src: { type: "string", format: 'three-address code as in code optimisation: one instruction per line (real newlines), labels "L1: ...", "if a < N goto L1", "return c", and an optional last line "live: e" naming what is live at the end. Example: "a = x + y\\nb = a * 2\\nc = a + b\\nlive: c"', default: RA_EXAMPLES.appel.text, desc: "the code to allocate registers for" },
      k: { type: "int", min: 1, max: 8, default: RA_EXAMPLES.appel.k, desc: "number of registers available" },
    },
    answers: {
      minRegisters: "minimum registers needed with no spilling (chromatic number of the interference graph)",
      edges: "number of edges in the interference graph",
      edgeList: 'the interference edges, like "a-b, a-c"',
      variables: "number of variables (nodes in the interference graph)",
      spills: "number of variables spilled by Chaitin colouring with k registers",
      spilled: "the spilled variables, space separated",
      used: "registers actually used with k registers",
    },
    examples: [
      { request: "Minimum registers for a = x + y, b = a * 2, c = a + b, d = c - x, e = d * b with only e live at the end", params: { src: "a = x + y\nb = a * 2\nc = a + b\nd = c - x\ne = d * b\nlive: e", k: 3 } },
      { request: "Colour Appel's loop with 2 registers: which variables spill?", params: { src: RA_EXAMPLES.appel.text, k: 2 } },
    ],
    validate(v) {
      const a = analyse(v.src);
      if (a.vars.length > 16) throw new Error("Use at most 16 variables.");
      const res = colour(a.vars, a.edges, v.k, a.rows);
      const chi = chromatic(a.vars, a.edges);
      const values = {
        minRegisters: chi, edges: a.edges.length, edgeList: a.edges.map((e) => `${e.a}-${e.b}`).join(", "), variables: a.vars.length,
        spills: res.spilled.length, spilled: res.spilled.join(" "), used: res.used,
      };
      return { text: `${a.vars.length} variables, ${a.edges.length} interference edges; at least ${chi} registers are needed with no spill. With k = ${v.k}: ${res.spilled.length ? `${res.spilled.join(", ")} spilled` : "no spills"}, ${res.used} registers used.`, values };
    },
  }),
];
