// AI tool schemas: theory of computation. See ../schema-kit.js for the shape.
import { tool } from "../schema-kit.js";
import { EXAMPLES as FA, minimize, parseAutomaton, regexToNfa, run, subsetConstruction } from "../../engines/automata.js";
import { eliminate, EXAMPLES as ELIM, PRODUCT_EXAMPLES, PRODUCT_OPS, product } from "../../engines/elimination.js";
import { LANGUAGES, analyse, play, proof } from "../../engines/pumping.js";
import { EXAMPLES as PDAS, GRAMMARS, grammarToPda, parsePDA, simulate, tokenizeInput } from "../../engines/pda.js";
import { EXAMPLES as CNF_EX, toCNF, toGNF, withoutEmpty } from "../../engines/cnf.js";
import { cyk, EXAMPLES as GRAMMAR_EX, parseGrammar, tokenize } from "../../engines/grammar.js";
import { MACHINES, parseTM, runTM } from "../../engines/turing.js";

// Automaton text, shared by the finite automata tools (engines/automata.js parseAutomaton).
const FA_FORMAT = "one line per item, lines separated by real newlines (\\n): \"start: q0\", \"accept: q2 q3\", then one transition per line \"from symbol to\" (list several targets for an NFA: \"q0 a q1 q2\"; write ε or eps for an empty move). Symbols are single characters. Example: \"start: q0\\naccept: q2\\nq0 a q0 q1\\nq0 b q0\\nq1 b q2\"";
const GRAMMAR_FORMAT = "one rule per line, lines separated by real newlines (\\n), alternatives with |, symbols separated by spaces, ε for the empty string; the first rule's left side is the start symbol. Example: \"S -> A S A | a B\\nA -> B | S\\nB -> b | ε\"";
const show = (w) => (w === "" ? "ε" : w);
const set = (xs) => (xs.length ? `{${xs.join(", ")}}` : "∅");
const asDfa = (fa) => (fa.kind === "DFA" ? fa : subsetConstruction(fa, { includeDead: false }).dfa);
// How many strings of length n over the alphabet pass test (null when there are too many to try).
function countOfLength(alphabet, n, test, cap) {
  if (!alphabet.length || alphabet.length ** n > cap) return null;
  let words = [""];
  for (let k = 0; k < n; k++) words = words.flatMap((w) => alphabet.map((a) => w + a));
  return words.filter(test).length;
}

// subset.js default NFA (not exported by the engine).
const THOMPSON_ABB = "start: 0\naccept: 10\n0 ε 1 7\n1 ε 2 4\n2 a 3\n4 b 5\n3 ε 6\n5 ε 6\n6 ε 1 7\n7 a 8\n8 b 9\n9 b 10";
// minimize.js default DFA (not exported by the engine).
const BOOK_DFA = "start: A\naccept: E\nA a B\nA b C\nB a B\nB b D\nC a B\nC b C\nD a B\nD b E\nE a B\nE b C";

export const SCHEMAS = [
  tool("finite-automata", {
    keywords: "dfa nfa epsilon nfa ε-nfa finite automaton state machine transition table accept reject string run trace regular language",
    params: {
      fa: { type: "string", format: FA_FORMAT, default: FA.endsAbb.text, desc: "the DFA, NFA or ε-NFA" },
      w: { type: "string", format: "the input string, one character per symbol, no spaces (empty for ε)", default: "babb", desc: "string to run" },
    },
    answers: { accepted: "yes if the automaton accepts w, no otherwise", kind: "DFA, NFA or ε-NFA", final: "the set of states active after reading w", states: "number of states", acceptedOfLength: "how many strings of the same length as w are accepted (for \"how many strings of length n\", pass any w of length n)" },
    examples: [
      { request: "Does the DFA with states q0 q1 q2 (start q0, accept q2, q0 a q1, q0 b q0, q1 a q1, q1 b q2, q2 a q1, q2 b q0) accept abab?", params: { fa: "start: q0\naccept: q2\nq0 a q1\nq0 b q0\nq1 a q1\nq1 b q2\nq2 a q1\nq2 b q0", w: "abab" } },
      { request: "Run the NFA for third symbol from the end is 1 on 0100", params: { fa: FA.nfa.text, w: "0100" } },
    ],
    validate(v) {
      const fa = parseAutomaton(v.fa);
      const res = run(fa, v.w);
      const final = res.steps.at(-1).active;
      const values = { accepted: res.accepted ? "yes" : "no", kind: fa.kind, final: set(final), states: fa.states.length };
      const n = [...v.w].length, count = countOfLength(fa.alphabet, n, (x) => run(fa, x).accepted, 4096);
      if (count !== null) values.acceptedOfLength = count;
      return { text: `The ${fa.kind} ${res.accepted ? "accepts" : "rejects"} "${show(v.w)}", ending in ${set(final)}${count !== null ? `; it accepts ${count} of the ${fa.alphabet.length ** n} strings of length ${n}` : ""}.`, values };
    },
  }),

  tool("nfa-to-dfa", {
    keywords: "subset construction powerset construction nfa to dfa ε-closure epsilon closure determinise dead state trap state",
    params: {
      fa: { type: "string", format: FA_FORMAT, default: THOMPSON_ABB, desc: "the NFA or ε-NFA to convert" },
      dead: { type: "bool", default: true, desc: "count the empty set ∅ as a dead state when it is reached (the usual GATE convention); 0 leaves those moves out" },
    },
    answers: { dfaStates: "number of states of the resulting DFA (including ∅ if reached and dead is on)", accepting: "number of accepting DFA states", sets: "each DFA state and the NFA states it stands for" },
    examples: [
      { request: "Convert the NFA for strings containing 01 to a DFA: how many states?", params: { fa: "start: p\naccept: r\np 0 p q\np 1 p\nq 1 r\nr 0 r\nr 1 r" } },
      { request: "Subset construction on the NFA where the third symbol from the end is 1", params: { fa: FA.nfa.text } },
    ],
    validate(v) {
      const nfa = parseAutomaton(v.fa);
      const { dfa, sets } = subsetConstruction(nfa, { includeDead: v.dead });
      const setsText = dfa.states.map((q) => `${q} = ${set(sets[q])}`).join(", ");
      return { text: `The subset construction gives a DFA with ${dfa.states.length} states (${dfa.accept.length} accepting): ${setsText}.`,
        values: { dfaStates: dfa.states.length, accepting: dfa.accept.length, sets: setsText } };
    },
  }),

  tool("dfa-minimization", {
    keywords: "minimise minimize dfa minimal dfa equivalent states partition refinement k-equivalence myhill-nerode table filling distinguishable states unreachable states",
    params: {
      fa: { type: "string", format: `${FA_FORMAT}. An NFA is converted to a DFA first`, default: BOOK_DFA, desc: "the DFA to minimise" },
    },
    answers: { minStates: "number of states in the minimal DFA (a dead state counts if one had to be added)", groups: "the final equivalence classes", rounds: "number of refinement rounds (k-equivalence levels)", unreachable: "number of unreachable states removed" },
    examples: [
      { request: "Minimise the DFA: start A, accept E, A 0 B, A 1 C, B 0 B, B 1 D, C 0 B, C 1 C, D 0 B, D 1 E, E 0 B, E 1 C", params: { fa: FA.redundant.text } },
      { request: "How many states does the minimal DFA for this have? start p, accept r, p 0 q, p 1 p, q 0 r, q 1 p, r 0 r, r 1 r, x 0 r, x 1 p", params: { fa: "start: p\naccept: r\np 0 q\np 1 p\nq 0 r\nq 1 p\nr 0 r\nr 1 r\nx 0 r\nx 1 p" } },
    ],
    validate(v) {
      const res = minimize(asDfa(parseAutomaton(v.fa)));
      const groups = res.rounds.at(-1).groups.map((g) => `{${g.join(", ")}}`).join(" ");
      return { text: `The minimal DFA has ${res.min.states.length} states; the final classes are ${groups}${res.unreachable.length ? ` (unreachable ${res.unreachable.join(", ")} removed)` : ""}.`,
        values: { minStates: res.min.states.length, groups, rounds: res.rounds.length - 1, unreachable: res.unreachable.length } };
    },
  }),

  tool("regex-to-nfa", {
    keywords: "regular expression regex thompson construction epsilon nfa ε-nfa union concatenation kleene star match string",
    params: {
      re: { type: "string", format: "operators | (union), * (zero or more), + (one or more), ? (optional) and parentheses; concatenation is implicit; ε for the empty string; spaces ignored. Example: \"(a|b)*abb\"", default: "(a|b)*abb", desc: "the regular expression" },
      w: { type: "string", format: "test string, one character per symbol (empty for ε)", default: "babb", desc: "string to test against the expression" },
    },
    answers: { states: "number of states of the Thompson ε-NFA", matched: "yes if w is in the language", postfix: "the expression in postfix (· is concatenation)" },
    examples: [
      { request: "Thompson's construction for (a|b)*abb: how many states?", params: { re: "(a|b)*abb", w: "aabb" } },
      { request: "Is abab in the language of (ab)*b?", params: { re: "(ab)*b", w: "abab" } },
    ],
    validate(v) {
      const { nfa, postfix } = regexToNfa(v.re);
      const ok = run(nfa, v.w).accepted;
      return { text: `Thompson's construction gives an ε-NFA with ${nfa.states.length} states, and "${show(v.w)}" is ${ok ? "" : "not "}matched by ${v.re}.`,
        values: { states: nfa.states.length, matched: ok ? "yes" : "no", postfix } };
    },
  }),

  tool("dfa-to-regex", {
    keywords: "state elimination dfa to regular expression gnfa arden's lemma kleene product construction union intersection difference closure properties",
    params: {
      fa: { type: "string", format: FA_FORMAT, default: ELIM.sipser74.text, desc: "automaton A to turn into a regular expression (also the left side of the product)" },
      order: { type: "string", format: "state names separated by spaces, e.g. \"2 3 1\"; empty means the order the states are listed; unlisted states go last", default: "", desc: "elimination order" },
      b: { type: "string", format: FA_FORMAT, default: PRODUCT_EXAMPLES.evenOdd.b, desc: "DFA B for the product construction" },
      op: { type: "enum", values: Object.keys(PRODUCT_OPS), default: "intersection", desc: "product operation: union, intersection or difference (A − B)" },
    },
    answers: { regex: "regular expression for L(A) from state elimination", empty: "yes if L(A) is empty", productStates: "number of reachable pair states in the product DFA", productAccepting: "number of accepting product states" },
    examples: [
      { request: "Convert the DFA start 1, accept 2, 1 a 1, 1 b 2, 2 a 2, 2 b 2 into a regular expression", params: { fa: ELIM.sipser68.text } },
      { request: "Product DFA for the intersection of even number of a's and ends in b: how many states?", params: { fa: PRODUCT_EXAMPLES.evenOdd.a, b: PRODUCT_EXAMPLES.evenOdd.b, op: "intersection" } },
    ],
    validate(v) {
      const fa = parseAutomaton(v.fa);
      const order = v.order.split(/[\s,]+/).filter(Boolean);
      const res = eliminate(fa, { order: order.length ? order : null });
      let B = parseAutomaton(v.b);
      B = asDfa(B);
      const pr = product(asDfa(fa), B, v.op);
      return { text: `Eliminating ${res.order.join(", ")} gives ${res.regex}; the ${v.op} product has ${pr.dfa.states.length} states (${pr.dfa.accept.length} accepting).`,
        values: { regex: res.regex, empty: res.empty ? "yes" : "no", productStates: pr.dfa.states.length, productAccepting: pr.dfa.accept.length } };
    },
  }),

  tool("pumping-lemma", {
    keywords: "pumping lemma regular languages not regular proof xyz split pumping length adversary game anbn palindromes primes squares",
    params: {
      lang: { type: "enum", values: Object.keys(LANGUAGES), default: "anbn", desc: `the language: ${Object.entries(LANGUAGES).map(([k, l]) => `${k} = ${l.set}`).join("; ")}` },
      p: { type: "int", min: 1, max: 12, desc: "pumping length p (if left out the view uses the language's own value, 4 for the non-regular ones)" },
      s: { type: "string", format: "a string in the language of length at least p, e.g. \"aaaabbbb\" for anbn with p = 4", desc: "the string you choose (optional)" },
      i: { type: "int", min: 0, max: 40, desc: "how many times to repeat y (optional, needs s)" },
    },
    answers: { regular: "yes if the language is regular", winning: "yes if s (or the textbook string when s is not given) breaks every legal split, proving the language is not regular", split: "the adversary's split x, y, z of s", inL: "yes if xyⁱz is still in the language" },
    examples: [
      { request: "Prove a^n b^n is not regular with the pumping lemma, p = 4, s = aaaabbbb, i = 2", params: { lang: "anbn", p: 4, s: "aaaabbbb", i: 2 } },
      { request: "Is (ab)* regular? Try the pumping game", params: { lang: "abstar" } },
    ],
    validate(v) {
      const lang = LANGUAGES[v.lang];
      const p = v.p || lang.p || 4;
      const values = { regular: lang.regular ? "yes" : "no" };
      if (v.s === undefined) {
        const pr = proof(lang, p);
        values.winning = pr.winning ? "yes" : "no";
        return { text: `${lang.set} is ${lang.regular ? "regular" : "not regular"}; with p = ${p} the string ${pr.s} ${pr.winning ? "breaks every legal split" : "does not break every split"}.`, values };
      }
      const game = play(lang, p, v.s, v.i ?? null);
      if (game.error) throw new Error(game.error);
      values.winning = analyse(lang, v.s, p).winning ? "yes" : "no";
      values.split = `x = ${show(game.split.x)}, y = ${game.split.y}, z = ${show(game.split.z)}`;
      if (v.i !== undefined) values.inL = game.inL ? "yes" : "no";
      return { text: `${lang.set} is ${lang.regular ? "regular" : "not regular"}. The adversary splits s as ${values.split}${v.i !== undefined ? `; with i = ${v.i} the pumped string is ${game.inL ? "still" : "not"} in the language` : ""}; s ${values.winning === "yes" ? "breaks every split" : "does not break every split"}.`, values };
    },
  }),

  tool("pushdown-automata", {
    keywords: "pda pushdown automaton stack context-free language accept by final state empty stack nondeterministic configuration cfg to pda",
    params: {
      mode: { type: "enum", values: ["pda", "cfg"], default: "pda", desc: "pda: simulate the PDA in pda; cfg: build the one-state PDA for the grammar in g and simulate that" },
      pda: { type: "string", format: "lines separated by real newlines (\\n): \"start: q0\", \"stack: Z\" (initial stack symbol), \"accept: q2\" (final state) or \"mode: empty\" (empty stack), then one move per line \"from input pop -> to push\" with the pushed string written top first and ε for nothing. Example: \"start: q0\\nstack: Z\\naccept: q2\\nq0 a Z -> q0 AZ\\nq0 a A -> q0 AA\\nq0 b A -> q1 ε\\nq1 b A -> q1 ε\\nq1 ε Z -> q2 Z\"", default: PDAS.wwr.text, desc: "the PDA (mode pda)" },
      g: { type: "string", format: GRAMMAR_FORMAT, default: GRAMMARS.expr.text, desc: "the grammar (mode cfg)" },
      w: { type: "string", format: "input string; symbols separated by spaces or written together (\"aabb\", \"id+id\")", desc: `input to test (if left out: "${PDAS.wwr.input}" in pda mode, "${GRAMMARS.expr.input}" in cfg mode)` },
    },
    answers: { accepted: "yes if some branch accepts w", verdict: "accept, reject or limit (gave up)", configurations: "number of configurations explored", acceptedOfLength: "how many strings of the same length as w are accepted (for \"how many strings of length n\", pass any w of length n)" },
    examples: [
      { request: "Does the PDA for a^n b^n accept aabb?", params: { pda: PDAS.anbn.text, w: "aabb" } },
      { request: "Convert S -> a S b | ε to a PDA and run it on aabb", params: { mode: "cfg", g: GRAMMARS.anbn.text, w: "aabb" } },
    ],
    validate(v) {
      const w = v.w ?? (v.mode === "cfg" ? GRAMMARS.expr.input : PDAS.wwr.input);
      let pda, conv = null;
      if (v.mode === "pda") pda = parsePDA(v.pda);
      else { conv = grammarToPda(parseGrammar(v.g)); pda = conv.pda; }
      const opts = conv ? { prune: conv.prune } : {};
      const tokens = tokenizeInput(pda, w);
      const res = simulate(pda, tokens, opts);
      const values = { accepted: res.accepted ? "yes" : "no", verdict: res.verdict, configurations: res.configs.length };
      const n = tokens.length, count = countOfLength([...pda.inputs].sort(), n, (x) => simulate(pda, tokenizeInput(pda, x), opts).accepted, 256);
      if (count !== null) values.acceptedOfLength = count;
      return { text: `The PDA ${res.verdict === "accept" ? "accepts" : res.verdict === "reject" ? "rejects" : "gave up on"} "${show(w)}" after exploring ${res.configs.length} configurations${count !== null ? `; it accepts ${count} of the ${pda.inputs.length ** n} strings of length ${n}` : ""}.`, values };
    },
  }),

  tool("cfg-to-cnf", {
    keywords: "cnf chomsky normal form gnf greibach normal form cfg context-free grammar nullable unit productions useless symbols epsilon productions",
    params: {
      nf: { type: "enum", values: ["cnf", "gnf"], default: "cnf", desc: "target normal form: Chomsky (cnf) or Greibach (gnf)" },
      g: { type: "string", format: GRAMMAR_FORMAT, desc: `the grammar (if left out: Sipser 2.10 "${CNF_EX.sipser.text.replace(/\n/g, "; ")}" for cnf, an already-CNF grammar for gnf)` },
      w: { type: "string", format: "test string, symbols separated by spaces, e.g. \"a b a\"", desc: "string to test with CYK on the CNF grammar (cnf only)" },
    },
    answers: { rules: "number of rules in the resulting CNF (or GNF) grammar", variables: "number of variables in the result", nullable: "the nullable variables (cnf)", generated: "yes if w is generated (cnf, by CYK)", cnfRules: "number of CNF rules before GNF (gnf)" },
    examples: [
      { request: "Convert S -> A S A | a B, A -> B | S, B -> b | ε to Chomsky normal form: how many rules?", params: { g: CNF_EX.sipser.text, w: "a b a" } },
      { request: "Greibach normal form of A1 -> A2 A3, A2 -> A3 A1 | b, A3 -> A1 A2 | a", params: { nf: "gnf", g: CNF_EX.hu.text } },
    ],
    validate(v) {
      const first = v.nf === "gnf" ? CNF_EX.hu : CNF_EX.sipser;
      const g = parseGrammar(v.g ?? first.text);
      if (v.nf === "gnf") {
        const res = toGNF(g);
        return { text: `In Greibach normal form the grammar has ${res.grammar.prods.length} rules over ${res.grammar.nonterminals.length} variables (${res.cnf.prods.length} rules in CNF first).`,
          values: { rules: res.grammar.prods.length, variables: res.grammar.nonterminals.length, cnfRules: res.cnf.prods.length } };
      }
      const res = toCNF(g);
      const values = { rules: res.grammar.prods.length, variables: res.grammar.nonterminals.length, nullable: set(res.nullable) };
      // The view falls back to the example's string; only test it when it belongs to this grammar.
      const w = v.w ?? first.input;
      let extra = "";
      const cykG = withoutEmpty(res.grammar);
      if ((v.w !== undefined || v.g === undefined) && w.trim() && cykG.prods.length) {
        const tokens = tokenize(w, cykG);
        if (tokens.length <= 12) {
          const ok = cyk(cykG, tokens).accepted;
          values.generated = ok ? "yes" : "no";
          extra = ` "${w}" is ${ok ? "" : "not "}generated.`;
        }
      }
      return { text: `In Chomsky normal form the grammar has ${values.rules} rules over ${values.variables} variables; nullable: ${values.nullable}.${extra}`, values };
    },
  }),

  tool("cyk-parsing", {
    keywords: "cyk cocke younger kasami membership chomsky normal form cnf parse table triangular table dynamic programming",
    params: {
      g: { type: "string", format: `${GRAMMAR_FORMAT}. Must already be in CNF (A -> B C or A -> a)`, default: GRAMMAR_EX.cnf.text, desc: "the CNF grammar" },
      w: { type: "string", format: "input symbols separated by spaces, e.g. \"b a a b a\" (at most 12)", default: GRAMMAR_EX.cnf.input, desc: "string to test" },
    },
    answers: { accepted: "yes if the start symbol is in the top cell", top: "the set of variables in the top cell T[1, n]" },
    examples: [
      { request: "Use CYK to check if baaba is generated by S -> AB | BC, A -> BA | a, B -> CC | b, C -> AB | a", params: { g: GRAMMAR_EX.cnf.text, w: "b a a b a" } },
      { request: "CYK for aaabbb with S -> A T | A B, T -> S B, A -> a, B -> b", params: { g: GRAMMAR_EX.anbn.text, w: "a a a b b b" } },
    ],
    validate(v) {
      const g = parseGrammar(v.g);
      const res = cyk(g, tokenize(v.w, g));
      const top = g.nonterminals.filter((A) => res.table.at(-1)[0].includes(A)); // in the grammar's order
      return { text: `The top cell is ${set(top)}, so "${v.w}" is ${res.accepted ? "" : "not "}generated.`, values: { accepted: res.accepted ? "yes" : "no", top: set(top) } };
    },
  }),

  tool("turing-machine", {
    keywords: "tm turing machine tape head halt accept reject busy beaver binary increment unary addition transition function",
    params: {
      tm: { type: "string", format: "lines separated by real newlines (\\n): \"start: q0\", \"accept: qa\", then one rule per line \"state read -> next write move\" with move L, R or S and _ for blank; tape symbols are single characters; deterministic. Example: \"start: right\\naccept: done\\nright 0 -> right 0 R\\nright 1 -> right 1 R\\nright _ -> carry _ L\\ncarry 1 -> carry 0 L\\ncarry 0 -> done 1 L\\ncarry _ -> done 1 L\"", default: MACHINES.anbn.text, desc: "the Turing machine" },
      w: { type: "string", format: "the input written on the tape, one character per cell (at most 60)", default: MACHINES.anbn.input, desc: "input string" },
    },
    answers: { result: "accept, reject or limit (did not halt within 2000 moves)", moves: "number of moves (rule applications) before halting", output: "tape contents at the end, blanks at either end trimmed", haltState: "state it halts in" },
    examples: [
      { request: "Binary increment TM on 1011: what is left on the tape?", params: { tm: MACHINES.increment.text, w: "1011" } },
      { request: "How many moves does the a^n b^n Turing machine take on aabb?", params: { tm: MACHINES.anbn.text, w: "aabb" } },
    ],
    validate(v) {
      const res = runTM(parseTM(v.tm), v.w);
      const last = res.steps.at(-1);
      return { text: `The machine ${res.result === "limit" ? "did not halt within the move limit" : `halts in ${last.state} and ${res.result}s`} after ${res.moves} moves, leaving ${show(res.output)} on the tape.`,
        values: { result: res.result, moves: res.moves, output: res.output, haltState: last.state } };
    },
  }),
];
