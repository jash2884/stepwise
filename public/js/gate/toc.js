// GATE question generators for theory of computation. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer comes from the engines the visualisers run.
import { pick, int, shuffle, query, mcq } from "./kit.js";
import { EPS, minimize, parseAutomaton, regexToNfa, run, subsetConstruction } from "../engines/automata.js";
import { agree, allStrings, eliminate, product, PRODUCT_OPS } from "../engines/elimination.js";
import { LANGUAGES, proof } from "../engines/pumping.js";
import { EXAMPLES as PDA_EXAMPLES, parsePDA, showPush, simulate, tokenizeInput } from "../engines/pda.js";
import { toCNF, languageUpTo } from "../engines/cnf.js";
import { cyk, parseGrammar, showProd } from "../engines/grammar.js";
import { MACHINES, parseTM, runTM } from "../engines/turing.js";

const showW = (w) => (w === "" ? "ε" : w);
const setText = (xs) => (xs.length ? `{${xs.join(", ")}}` : "∅");
const byName = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
const sortedSet = (xs) => setText([...xs].sort(byName));

// --- Automata helpers ---------------------------------------------------------------

function randomDfaText(r, n) {
  const names = Array.from({ length: n }, (_, i) => `q${i}`);
  const accept = names.filter(() => r() < 0.4);
  if (!accept.length) accept.push(names[n - 1]);
  const lines = ["start: q0", `accept: ${accept.join(" ")}`];
  for (const q of names) for (const a of ["a", "b"]) lines.push(`${q} ${a} ${pick(r, names)}`);
  return lines.join("\n");
}

function randomNfaText(r, n, { eps = false } = {}) {
  const names = Array.from({ length: n }, (_, i) => `q${i}`);
  const accept = [names[n - 1], ...names.slice(1, n - 1).filter(() => r() < 0.25)];
  const lines = ["start: q0", `accept: ${accept.join(" ")}`];
  for (const q of names) for (const a of ["a", "b"]) {
    const roll = r();
    if (roll < 0.25) continue; // no move
    const targets = shuffle(r, names).slice(0, roll < 0.6 ? 1 : 2).sort(byName);
    lines.push(`${q} ${a} ${targets.join(" ")}`);
  }
  if (eps) { const from = pick(r, names), to = pick(r, names.filter((x) => x !== from)); lines.push(`${from} ε ${to}`); }
  return lines.join("\n");
}

function reachable(fa) {
  const seen = new Set([fa.start]), stack = [fa.start];
  while (stack.length) {
    const q = stack.pop();
    for (const a of [...fa.alphabet, EPS]) for (const t of fa.next(q, a)) if (!seen.has(t)) { seen.add(t); stack.push(t); }
  }
  return seen;
}

// The transition table of an automaton, with → for the start state and * for accepting ones.
function faTable(fa) {
  const syms = [...fa.alphabet, ...(fa.kind === "ε-NFA" ? [EPS] : [])];
  const det = fa.kind === "DFA";
  return {
    table: {
      head: ["State", ...syms],
      rows: [...fa.states].sort(byName).map((q) => [`${q === fa.start ? "→" : ""}${fa.accept.includes(q) ? "*" : ""}${q}`,
        ...syms.map((a) => { const t = fa.next(q, a); return det ? (t[0] ?? "–") : sortedSet(t); })]),
    },
  };
}
const tableKey = "→ marks the start state and * an accepting state.";

// The states an automaton passes through on w, for worked solutions.
function trace(fa, w) {
  const res = run(fa, w);
  const det = fa.kind === "DFA";
  const path = res.steps.map((s) => (det ? (s.active[0] ?? "stuck") : setText(s.active)));
  return `${showW(w)}: ${path.join(" → ")}, so ${res.accepted ? "accepted" : "rejected"}.`;
}

// Pick k strings from pool that pass test and 4 − k that don't, k from 1 to 3.
function mixed(r, pool, test) {
  const yes = shuffle(r, pool.filter(test)), no = shuffle(r, pool.filter((w) => !test(w)));
  const k = int(r, 1, 3);
  if (yes.length < k || no.length < 4 - k) return null;
  const options = shuffle(r, [...yes.slice(0, k), ...no.slice(0, 4 - k)]);
  return { options, answer: options.map((w, i) => (test(w) ? i : null)).filter((i) => i !== null) };
}

// --- Finite automata ----------------------------------------------------------------

function finiteAutomata(r) {
  const nondet = r() < 0.4;
  const text = nondet ? randomNfaText(r, int(r, 3, 4)) : randomDfaText(r, int(r, 3, 4));
  const fa = parseAutomaton(text);
  if (fa.alphabet.length !== 2 || reachable(fa).size !== fa.states.length) return null;
  const what = fa.kind === "DFA" ? "DFA" : "NFA";
  const base = [`Consider the following ${what} over the alphabet {a, b}. ${tableKey}${what === "DFA" ? "" : " ∅ means there is no move."}`, faTable(fa)];
  const accepts = (w) => run(fa, w).accepted;
  if (r() < 0.5) {
    const n = int(r, 3, 4);
    const strings = allStrings(fa.alphabet, n).filter((w) => w.length === n);
    const acc = strings.filter(accepts);
    if (!acc.length || acc.length === strings.length) return null;
    return {
      topic: "finite-automata", type: "nat", marks: 2, answer: acc.length, tolerance: 0,
      stem: [...base, `How many strings of length exactly ${n} does it accept?`],
      solution: [
        `There are 2^${n} = ${strings.length} strings of length ${n}. Run each one through the ${what}; the accepted ones are:`,
        acc.join(", "),
        `That is ${acc.length} string${acc.length > 1 ? "s" : ""}.`,
      ],
      replay: query("/finite-automata", { fa: text, w: acc[0] }),
    };
  }
  const pool = allStrings(fa.alphabet, 5).filter((w) => w.length >= 2);
  const m = mixed(r, pool, accepts);
  if (!m) return null;
  return {
    topic: "finite-automata", type: "msq", marks: 2, options: m.options, answer: m.answer,
    stem: [...base, "Which of the following strings does it accept?"],
    solution: [
      what === "DFA" ? "Follow the single path from the start state for each string:" : "Track the set of states the NFA could be in after each symbol:",
      ...m.options.map((w) => trace(fa, w)),
    ],
    replay: query("/finite-automata", { fa: text, w: m.options[m.answer[0]] }),
  };
}

// --- NFA to DFA ---------------------------------------------------------------------

function nfaToDfa(r) {
  const text = randomNfaText(r, int(r, 3, 4), { eps: r() < 0.3 });
  const nfa = parseAutomaton(text);
  if (nfa.kind === "DFA" || nfa.alphabet.length !== 2 || reachable(nfa).size !== nfa.states.length) return null;
  const { dfa, sets } = subsetConstruction(nfa);
  if (dfa.states.length < 3) return null;
  const ask = pick(r, ["states", "states", "accept"]);
  const answer = ask === "states" ? dfa.states.length : dfa.accept.length;
  if (!answer) return null;
  return {
    topic: "nfa-to-dfa", type: "nat", marks: ask === "states" ? 2 : 1, answer, tolerance: 0,
    stem: [
      `Consider the following ${nfa.kind} over {a, b}. ${tableKey} ∅ means there is no move.`,
      faTable(nfa),
      `The subset construction converts it to a DFA, building only the subsets reachable from the start${nfa.kind === "ε-NFA" ? " (taking ε-closures)" : ""}. The empty set counts as a (dead) state if it is reached.`,
      ask === "states" ? "How many states does the resulting DFA have?" : "How many of the resulting DFA's states are accepting?",
    ],
    solution: [
      { table: { head: ["DFA state", "NFA states", ...dfa.alphabet], rows: dfa.states.map((q) => [`${q === dfa.start ? "→" : ""}${dfa.accept.includes(q) ? "*" : ""}${q}`, setText(sets[q]), ...dfa.alphabet.map((a) => dfa.next(q, a)[0])]) } },
      ask === "states"
        ? `${dfa.states.length} subsets are reachable${dfa.states.includes("∅") ? ", including the dead state ∅" : ""}, so the DFA has ${dfa.states.length} states.`
        : `A DFA state accepts when its subset contains an accepting NFA state (${[...nfa.accept].sort(byName).join(", ")}): ${dfa.accept.join(", ")}. That is ${dfa.accept.length}.`,
    ],
    replay: query("/nfa-to-dfa", { fa: text }),
  };
}

// --- DFA minimisation ---------------------------------------------------------------

function dfaMinimization(r) {
  const n = int(r, 5, 6);
  const text = randomDfaText(r, n);
  const dfa = parseAutomaton(text);
  if (reachable(dfa).size !== n) return null;
  const { min, rounds } = minimize(dfa);
  const groups = rounds.at(-1).groups;
  if (min.states.length < 2 || (min.states.length === n && r() < 0.8)) return null;
  const base = [`Consider the following DFA over {a, b}. ${tableKey}`, faTable(dfa)];
  const solution = [
    ...rounds.map((x) => `${x.k}-equivalence: ${x.groups.map((g) => `{${g.join(", ")}}`).join(" ")}`),
    `No group splits in the last round, so the partition is final: ${groups.length} group${groups.length > 1 ? "s" : ""}, one state each in the minimal DFA.`,
  ];
  const replay = query("/dfa-minimization", { fa: text });
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([dfa.states[i], dfa.states[j]]);
  const same = (p, q) => groups.some((g) => g.includes(p) && g.includes(q));
  const equiv = pairs.filter(([p, q]) => same(p, q)), apart = pairs.filter(([p, q]) => !same(p, q));
  if (equiv.length && apart.length >= 3 && r() < 0.4) {
    const label = ([p, q]) => `${p} and ${q}`;
    const o = mcq(r, label(pick(r, equiv)), shuffle(r, apart).map(label));
    if (!o) return null;
    return {
      topic: "dfa-minimization", type: "mcq", marks: 2, ...o,
      given: { text },
      stem: [...base, "Which pair of states is equivalent (no input string distinguishes them)?"],
      solution,
      replay,
    };
  }
  return {
    topic: "dfa-minimization", type: "nat", marks: 2, answer: min.states.length, tolerance: 0,
    given: { text },
    stem: [...base, "How many states does the minimal DFA accepting the same language have?"],
    solution,
    replay,
  };
}

// --- Regular expressions to NFA -----------------------------------------------------

const SHAPES = ["(X|Y)*Z", "X*Y*", "(X|Y)*Z(X|Y)", "X(YZ)*", "(X*|Y)Z", "(XY|Z)*", "X*YX*", "(X|Y*)Z*", "(X|Y)(X|Y)*Z", "X(Y|Z)*"];
function randomRegex(r) {
  const words = new Set();
  while (words.size < 3) words.add(Array.from({ length: int(r, 1, 2) }, () => pick(r, ["a", "b"])).join(""));
  const [X, Y, Z] = shuffle(r, [...words]);
  return pick(r, SHAPES).replace(/[XYZ]/g, (c) => ({ X, Y, Z })[c]);
}

function regexToNfaQ(r) {
  const re = randomRegex(r);
  const { nfa } = regexToNfa(re);
  const accepts = (w) => run(nfa, w).accepted;
  if (r() < 0.6) {
    const m = mixed(r, allStrings(["a", "b"], 5), accepts);
    if (!m) return null;
    return {
      topic: "regex-to-nfa", type: "msq", marks: 1, options: m.options.map(showW), answer: m.answer,
      stem: [`Which of the following strings are in the language of the regular expression ${re}?`, "Here | is union, * is zero or more repetitions and ε is the empty string."],
      solution: [
        `Build the ε-NFA for ${re} with Thompson's construction (${nfa.states.length} states) and run each string through it, or match the strings against the expression directly:`,
        ...m.options.map((w) => `${showW(w)}: ${accepts(w) ? "in the language" : "not in the language"}.`),
      ],
      replay: query("/regex-to-nfa", { re, w: m.options[m.answer[0]] }),
    };
  }
  const symbols = [...re].filter((c) => c === "a" || c === "b").length;
  const ops = [...re].filter((c) => c === "|" || c === "*").length;
  const { postfix } = regexToNfa(re);
  const concats = [...postfix].filter((c) => c === "·").length;
  if (2 * symbols + 2 * ops - concats !== nfa.states.length) return null; // the counting rule in the solution must hold
  return {
    topic: "regex-to-nfa", type: "nat", marks: 2, answer: nfa.states.length, tolerance: 0,
    stem: [
      `Thompson's construction turns the regular expression ${re} into an ε-NFA.`,
      "Each symbol gives a fragment of 2 states; union and star each add a new start and a new final state; concatenation merges the final state of the first fragment with the start state of the second (as in the dragon book).",
      "How many states does the resulting ε-NFA have?",
    ],
    solution: [
      `In postfix the expression is ${postfix}, where · is concatenation.`,
      `${symbols} symbols give ${2 * symbols} states, the ${ops} union and star operator${ops > 1 ? "s" : ""} add ${2 * ops} more, and each of the ${concats} concatenations saves one state by merging: ${2 * symbols} + ${2 * ops} − ${concats} = ${nfa.states.length}.`,
    ],
    replay: query("/regex-to-nfa", { re, w: "" }),
  };
}

// --- DFA to regex and the product construction -------------------------------------

function dfaToRegex(r) {
  if (r() < 0.35) return productQ(r);
  const text = randomDfaText(r, int(r, 2, 3));
  const fa = parseAutomaton(text);
  if (reachable(fa).size !== fa.states.length) return null;
  const res = eliminate(fa);
  if (res.empty || res.regex.length > 30) return null;
  const nfaOf = (re) => { try { return regexToNfa(re).nfa; } catch { return null; } };
  const right = nfaOf(res.regex);
  if (!right || !agree(fa, right, 6).ok) return null;
  const swap = (s) => s.replace(/[ab]/g, (c) => (c === "a" ? "b" : "a"));
  const cands = [swap(res.regex)];
  [...res.regex].forEach((c, i) => {
    if (c === "*") { cands.push(res.regex.slice(0, i) + res.regex.slice(i + 1)); cands.push(`${res.regex.slice(0, i)}+${res.regex.slice(i + 1)}`); }
    if (c === "a" || c === "b") cands.push(res.regex.slice(0, i) + (c === "a" ? "b" : "a") + res.regex.slice(i + 1));
  });
  for (let k = 0; k < 4; k++) { const other = eliminate(parseAutomaton(randomDfaText(r, int(r, 2, 3)))); if (!other.empty && other.regex.length <= 30) cands.push(other.regex); }
  const wrongs = shuffle(r, [...new Set(cands)]).filter((x) => { const n = nfaOf(x); return n && !agree(fa, n, 6).ok; });
  const o = mcq(r, res.regex, wrongs);
  if (!o) return null;
  const cex = (x) => agree(fa, nfaOf(x), 6);
  return {
    topic: "dfa-to-regex", type: "mcq", marks: 2, ...o,
    stem: [`Consider the following DFA over {a, b}. ${tableKey}`, faTable(fa), "Which regular expression describes the language it accepts? (| is union, * zero or more, + one or more, ? optional, ε the empty string.)"],
    solution: [
      `Add a new start s and final f, then eliminate the states in the order ${res.order.join(", ")}. Each state k is replaced by edges R(i,j) | R(i,k) R(k,k)* R(k,j). The label left on s → f is ${res.regex}.`,
      ...o.options.filter((x) => x !== res.regex).map((x) => { const c = cex(x); return `${x} is wrong: it ${c.other ? "accepts" : "rejects"} ${showW(c.w)}, which the DFA ${c.fa ? "accepts" : "rejects"}.`; }),
    ],
    replay: query("/dfa-to-regex", { fa: text }),
  };
}

function smallDfa(r, [p, q]) {
  const names = [p, q], accept = names.filter(() => r() < 0.5);
  if (accept.length !== 1) return null;
  const lines = [`start: ${p}`, `accept: ${accept[0]}`];
  for (const s of names) for (const a of ["a", "b"]) lines.push(`${s} ${a} ${pick(r, names)}`);
  return lines.join("\n");
}

function productQ(r) {
  const ta = smallDfa(r, ["p0", "p1"]), tb = smallDfa(r, ["r0", "r1"]);
  if (!ta || !tb) return null;
  const A = parseAutomaton(ta), B = parseAutomaton(tb);
  if (reachable(A).size !== 2 || reachable(B).size !== 2) return null;
  const op = pick(r, Object.keys(PRODUCT_OPS));
  const { dfa } = product(A, B, op);
  const ask = pick(r, ["states", "accept"]);
  const answer = ask === "states" ? dfa.states.length : dfa.accept.length;
  if (ask === "accept" && !answer) return null;
  const opName = { union: "union L(A) ∪ L(B)", intersection: "intersection L(A) ∩ L(B)", difference: "difference L(A) − L(B)" }[op];
  return {
    topic: "dfa-to-regex", type: "nat", marks: ask === "states" ? 1 : 2, answer, tolerance: 0,
    stem: [
      `DFAs A and B over {a, b} are given below. ${tableKey}`,
      faTable(A), faTable(B),
      `The product construction builds a DFA for the ${opName}, with states that are pairs (p, q) of a state p of A and a state q of B, keeping only the pairs reachable from (p0, r0). A pair is written p·q.`,
      ask === "states" ? "How many states does the product DFA have?" : "How many of the product DFA's states are accepting?",
    ],
    solution: [
      { table: { head: ["Pair", "a", "b", "Accepting?"], rows: dfa.states.map((s) => [s, dfa.next(s, "a")[0], dfa.next(s, "b")[0], dfa.accept.includes(s) ? "yes" : "no"]) } },
      `Starting from p0·r0 and following both symbols reaches ${dfa.states.length} pair${dfa.states.length > 1 ? "s" : ""}. A pair accepts when ${PRODUCT_OPS[op].rule}: ${dfa.accept.length ? dfa.accept.join(", ") : "none"}.`,
    ],
    replay: query("/dfa-to-regex", { fa: ta, b: tb, op }),
  };
}

// --- Pumping lemma: is it regular? ---------------------------------------------------
// A fixed, vetted set: the visualiser's languages plus some classics.
const EXTRA_LANGS = [
  { set: "{ w ∈ {a, b}* | w ends in ab }", regular: true, why: "A 3-state DFA remembers the last two symbols." },
  { set: "{ binary numbers divisible by 3 }", regular: true, why: "A 3-state DFA tracks the remainder mod 3." },
  { set: "{ aⁿbⁿcⁿ | n ≥ 0 }", regular: false, why: "Pump s = aᵖbᵖcᵖ: y is all a's, so the counts stop matching. (It isn't even context-free.)" },
  { set: "{ a^(2ⁿ) | n ≥ 0 }", regular: false, why: "Lengths double each time, but pumping adds a fixed |y|, landing between two powers of 2." },
  { set: "{ aⁿbᵐ | n, m ≤ 100 }", regular: true, why: "It is finite, and every finite language is regular." },
  { set: "{ w | w has as many 01s as 10s }", regular: true, why: "The two counts differ by at most one, and they are equal exactly when w starts and ends with the same symbol, which a DFA can check." },
  { set: "{ ww | w ∈ {a, b}* }", regular: false, why: "Pump s = aᵖbaᵖb: y is in the first block of a's, so the halves stop matching." },
  { set: "{ aⁿbᵐ | n, m ≥ 1 }", regular: true, why: "The regular expression aa*bb* describes it." },
  { set: "{ w ∈ {a, b}* | #a(w) is a multiple of 3 }", regular: true, why: "A 3-state DFA counts the a's mod 3." },
  { set: "{ aⁿbᵐ | n ≠ m }", regular: false, why: "If it were regular, so would be its complement intersected with a*b*, which is aⁿbⁿ." },
  { set: "{ aⁿbᵐ | n > m }", regular: false, why: "Pump s = aᵖ⁺¹bᵖ down (i = 0): y is all a's, and removing it leaves n ≤ m." },
  { set: "{ 0ⁿ1ⁿ0ⁿ | n ≥ 0 }", regular: false, why: "Pump s = 0ᵖ1ᵖ0ᵖ: y is in the first block of 0s, so the blocks stop matching." },
  { set: "{ aⁿ | n is a multiple of 3 or of 5 }", regular: true, why: "It is the union of (aaa)* and (aaaaa)*, and regular languages are closed under union." },
  { set: "{ wcwᴿ | w ∈ {a, b}* }", regular: false, why: "Pump s = aᵖcaᵖ: y is in the first block of a's, so the two sides of c no longer mirror." },
  { set: "{ aⁱbʲ | i + j is even }", regular: true, why: "A DFA tracks the parity of the length while checking the a*b* shape." },
];
const LANG_POOL = [
  ...Object.entries(LANGUAGES).map(([key, l]) => ({ key, set: l.set, regular: l.regular, why: l.why })),
  ...EXTRA_LANGS,
];

function langWhy(l) {
  const lang = l.key ? LANGUAGES[l.key] : null;
  let extra = "";
  if (lang && !lang.regular) {
    const p = 4, pr = proof(lang, p);
    if (pr.winning) extra = ` With pumping length ${p}, the string ${pr.s} beats all ${pr.all.length} legal splits xyz (|xy| ≤ ${p}, |y| ≥ 1): each is pumped out of the language for some i.`;
  }
  const why = /^It's regular/.test(l.why) ? l.why.replace(/^It's regular/, "Regular") : `${l.regular ? "Regular" : "Not regular"}. ${l.why}`;
  return `${l.set}: ${why}${extra}`;
}

function pumpingLemma(r) {
  const variant = pick(r, ["which-regular", "which-not", "msq"]);
  const regs = shuffle(r, LANG_POOL.filter((l) => l.regular)), non = shuffle(r, LANG_POOL.filter((l) => !l.regular));
  let chosen;
  if (variant === "which-regular") chosen = [regs[0], ...non.slice(0, 3)];
  else if (variant === "which-not") chosen = [non[0], ...regs.slice(0, 3)];
  else { const k = int(r, 1, 3); chosen = [...regs.slice(0, k), ...non.slice(0, 4 - k)]; }
  const opts = shuffle(r, chosen);
  const engineLang = opts.find((l) => l.key && !l.regular) ?? opts.find((l) => l.key);
  if (!engineLang) return null; // keep a replay that opens one of these languages
  const options = opts.map((l) => l.set);
  const good = (l) => (variant === "which-not" ? !l.regular : l.regular);
  const answer = variant === "msq" ? opts.map((l, i) => (l.regular ? i : null)).filter((i) => i !== null) : opts.findIndex(good);
  return {
    topic: "pumping-lemma", type: variant === "msq" ? "msq" : "mcq", marks: variant === "msq" ? 2 : 1, options, answer,
    stem: [variant === "which-regular" ? "Which one of the following languages is regular?" : variant === "which-not" ? "Which one of the following languages is NOT regular?" : "Which of the following languages are regular?"],
    solution: opts.map(langWhy),
    replay: query("/pumping-lemma", { lang: engineLang.key, p: LANGUAGES[engineLang.key].p ?? 4 }),
  };
}

// --- Pushdown automata --------------------------------------------------------------

const PDAS = [
  ...["anbn", "wcwr", "wwr", "parens"].map((k) => PDA_EXAMPLES[k].text),
  "start: q0\nstack: Z\naccept: q2\nq0 a Z -> q0 BBZ\nq0 a B -> q0 BBB\nq0 b B -> q1 ε\nq1 b B -> q1 ε\nq1 ε Z -> q2 Z",
  "start: q\nstack: Z\naccept: f\nq a Z -> q AZ\nq a A -> q AA\nq b A -> q ε\nq b Z -> q BZ\nq b B -> q BB\nq a B -> q ε\nq ε Z -> f Z",
];

function pushdownAutomata(r) {
  const text = pick(r, PDAS);
  const pda = parsePDA(text);
  const alphabet = [...new Set(pda.moves.map((t) => t.input).filter((x) => x !== EPS))].sort();
  const sim = (w) => simulate(pda, tokenizeInput(pda, w));
  const accepts = (w) => sim(w).accepted;
  const how = pda.mode === "empty" ? "by empty stack" : `by final state (accepting: ${pda.accept.join(", ")})`;
  const base = [
    `A pushdown automaton over {${alphabet.join(", ")}} starts in ${pda.start} with ${pda.bottom} on the stack and accepts ${how}. Its moves are below; δ(q, a, X) ∋ (p, β) reads a (ε reads nothing), pops X and pushes β with its first symbol on top.`,
    { table: { head: ["From", "Read", "Pop", "To", "Push"], rows: pda.moves.map((t) => [t.from, t.input, t.pop, t.to, showPush(t.push)]) } },
  ];
  const replay = (w) => query("/pushdown-automata", { pda: text, w });
  if (r() < 0.4) {
    const n = alphabet.length > 2 ? 5 : pick(r, [4, 6]);
    const strings = allStrings(alphabet, n).filter((w) => w.length === n);
    const acc = strings.filter(accepts);
    if (!acc.length) return null;
    return {
      topic: "pushdown-automata", type: "nat", marks: 2, answer: acc.length, tolerance: 0,
      stem: [...base, `How many strings of length exactly ${n} does it accept?`],
      solution: [`Of the ${strings.length} strings of length ${n}, the PDA has an accepting branch on: ${acc.join(", ")}.`, `That is ${acc.length}.`],
      replay: replay(acc[0]),
    };
  }
  const pool = allStrings(alphabet, alphabet.length > 2 ? 5 : 6).filter((w) => w.length >= 2);
  const m = mixed(r, pool, accepts);
  if (!m) return null;
  const path = (w) => {
    const res = sim(w);
    if (!res.accepted) return `${w}: every branch dies without accepting, so rejected.`;
    return `${w}: ${res.path.map((id) => { const c = res.configs[id]; return `(${c.state}, ${res.rest(c.pos)}, ${res.stackText(c.stack)})`; }).join(" ⊢ ")}, so accepted.`;
  };
  return {
    topic: "pushdown-automata", type: "msq", marks: 2, options: m.options, answer: m.answer,
    stem: [...base, "Which of the following strings does it accept?"],
    solution: ["Configurations are (state, unread input, stack with the top first).", ...m.options.map(path)],
    replay: replay(m.options[m.answer[0]]),
  };
}

// --- CFG to CNF ---------------------------------------------------------------------

function randomGrammarText(r) {
  const vars = ["S", "A", "B", "C"], syms = ["S", "A", "B", "C", "a", "b"];
  const bodies = Object.fromEntries(vars.map((v) => [v, []]));
  const addBody = (v, body) => { if (!bodies[v].includes(body)) bodies[v].push(body); };
  for (const v of vars) {
    addBody(v, Array.from({ length: int(r, 1, 2) }, () => pick(r, ["a", "b"])).join(" ")); // keeps every variable generating
    for (let k = int(r, 0, 1); k > 0; k--) addBody(v, Array.from({ length: int(r, 2, 3) }, () => pick(r, syms)).join(" "));
  }
  addBody(pick(r, ["A", "B", "C"]), "ε");
  if (r() < 0.5) addBody(pick(r, ["A", "B", "C"]), "ε");
  const u = pick(r, vars); addBody(u, pick(r, vars.filter((x) => x !== u))); // a unit rule
  addBody("S", Array.from({ length: 3 }, () => pick(r, syms)).join(" "));
  return vars.map((v) => `${v} -> ${bodies[v].join(" | ")}`).join("\n");
}

function cfgToCnf(r) {
  const text = randomGrammarText(r);
  const g = parseGrammar(text);
  const res = toCNF(g);
  const sample = [...languageUpTo(g, 4)].filter(Boolean).sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
  if (!sample.length || res.grammar.prods.length > 30) return null;
  const base = ["Consider the context-free grammar below, with start symbol S and terminals a and b.", { table: { head: ["Rules"], rows: text.split("\n").map((l) => [l.replace("->", "→")]) } }];
  const replay = query("/cfg-to-cnf", { g: text, w: sample[0] });
  const nullable = res.nullable.filter((v) => v !== res.S0);
  if (r() < 0.5) {
    const opts = ["S", "A", "B", "C"];
    const answer = opts.map((v, i) => (nullable.includes(v) ? i : null)).filter((i) => i !== null);
    if (!answer.length || answer.length === 4) return null;
    return {
      topic: "cfg-to-cnf", type: "msq", marks: 1, options: opts, answer,
      stem: [...base, "Which variables are nullable (can derive the empty string ε)?"],
      solution: [`Start with the variables that have an ε-rule, then keep adding any variable with a body made only of nullable variables.`, `Nullable: ${sortedSet(nullable)}.`, "The others need at least one terminal in every derivation."],
      replay,
    };
  }
  return {
    topic: "cfg-to-cnf", type: "nat", marks: 2, answer: res.grammar.prods.length, tolerance: 0,
    stem: [
      ...base,
      "It is converted to Chomsky normal form in the textbook order: add a new start S0 → S; remove ε-rules (keeping S0 → ε only if ε is in the language); remove unit rules; remove useless symbols; give each terminal in a body of length 2 or more its own variable; then split longer bodies into chains of pairs, with identical tails sharing one new variable. Duplicate rules are kept once.",
      "How many rules does the resulting CNF grammar have?",
    ],
    solution: [
      `Nullable variables: ${sortedSet(res.nullable)}.`,
      "The final grammar:",
      { table: { head: ["Rule"], rows: res.grammar.prods.map((p) => [showProd(p)]) } },
      `That is ${res.grammar.prods.length} rules.`,
    ],
    replay,
  };
}

// --- CYK ------------------------------------------------------------------------------

function randomCnfText(r) {
  const vars = ["S", "A", "B", "C"];
  const lines = vars.map((v) => {
    const bodies = new Set();
    for (let k = int(r, 1, 2); k > 0; k--) bodies.add(`${pick(r, vars.slice(1))} ${pick(r, vars.slice(1))}`);
    if (v !== "S" || r() < 0.3) bodies.add(v === "A" ? "a" : v === "B" ? "b" : pick(r, ["a", "b"]));
    return `${v} -> ${[...bodies].join(" | ")}`;
  });
  return lines.join("\n");
}

function cykQ(r) {
  const text = randomCnfText(r);
  const g = parseGrammar(text);
  const base = ["Consider this grammar in Chomsky normal form, with start symbol S:", { table: { head: ["Rules"], rows: text.split("\n").map((l) => [l.replace("->", "→")]) } }];
  const member = (w) => cyk(g, [...w]).accepted;
  if (r() < 0.5) {
    const m = mixed(r, allStrings(["a", "b"], 5).filter((w) => w.length >= 3), member);
    if (!m) return null;
    return {
      topic: "cyk-parsing", type: "msq", marks: 2, options: m.options, answer: m.answer,
      stem: [...base, "Using the CYK algorithm, which of the following strings does the grammar generate?"],
      solution: m.options.map((w) => { const t = cyk(g, [...w]).table; return `${w}: the top cell T[1, ${w.length}] = ${setText(t[w.length - 1][0])}, which ${t[w.length - 1][0].includes("S") ? "contains S, so it is generated" : "does not contain S, so it is not generated"}.`; }),
      replay: query("/cyk-parsing", { g: text, w: [...m.options[m.answer[0]]].join(" ") }),
    };
  }
  const n = int(r, 4, 5);
  const w = Array.from({ length: n }, () => pick(r, ["a", "b"])).join("");
  const { table } = cyk(g, [...w]);
  const top = table[n - 1][0];
  const fmt = (xs) => setText(["S", "A", "B", "C"].filter((v) => xs.includes(v)));
  const right = fmt(top);
  const wrongs = shuffle(r, Array.from({ length: 16 }, (_, mask) => ["S", "A", "B", "C"].filter((_, i) => mask & (1 << i)))).map(fmt);
  const o = mcq(r, right, wrongs);
  if (!o || table.flat().filter((c) => c.length).length < n + 2) return null;
  return {
    topic: "cyk-parsing", type: "mcq", marks: 2, ...o,
    stem: [...base, `The CYK algorithm is run on the string ${w}. Which set of variables is in the top cell T[1, ${n}] (the cell for the whole string)?`],
    solution: [
      { table: { head: ["Span length", ...Array.from({ length: n }, (_, i) => `from ${i + 1}`)], rows: table.map((row, l) => [String(l + 1), ...Array.from({ length: n }, (_, i) => (i < row.length ? setText(row[i]) : ""))]) } },
      `Each cell holds the variables A with a rule A → B C where B derives the left part and C the right part of some split. The top cell is ${right}, so ${w} ${top.includes("S") ? "is" : "is not"} generated.`,
    ],
    replay: query("/cyk-parsing", { g: text, w: [...w].join(" ") }),
  };
}

// --- Turing machines ----------------------------------------------------------------

const randomWord = (r, alphabet, lo, hi) => Array.from({ length: int(r, lo, hi) }, () => pick(r, alphabet)).join("");

function turingMachine(r) {
  const key = pick(r, ["anbn", "anbncn", "increment", "palindrome", "add", "anbn", "increment"]);
  const m = MACHINES[key], tm = parseTM(m.text);
  const base = [
    `A single-tape Turing machine starts in ${tm.start} with its head on the first input symbol; _ is the blank. It halts when no rule applies and accepts if it halts in ${tm.accept.join(" or ")}.`,
    { table: { head: ["State", "Read", "Write", "Move", "Next state"], rows: tm.rules.map((x) => [x.q, x.read, x.write, x.move, x.next]) } },
  ];
  const replay = (w) => query("/turing-machine", { tm: m.text, w });
  const runOn = (w) => runTM(tm, w);
  let input;
  if (key === "increment") input = `1${randomWord(r, ["0", "1"], 2, 5)}`;
  else if (key === "add") input = `${"1".repeat(int(r, 1, 4))}+${"1".repeat(int(r, 1, 4))}`;
  else if (key === "palindrome") input = randomWord(r, ["a", "b"], 2, 4);
  else if (key === "anbn") { const k = int(r, 1, 3); input = r() < 0.6 ? "a".repeat(k) + "b".repeat(k) : randomWord(r, ["a", "b"], 2, 5); }
  else { const k = int(r, 1, 2); input = r() < 0.6 ? "a".repeat(k) + "b".repeat(k) + "c".repeat(k) : randomWord(r, ["a", "b", "c"], 3, 6); }
  const res = runOn(input);
  if (res.result === "limit") return null;
  if ((key === "increment" || key === "add") && r() < 0.6) {
    const n = key === "increment" ? parseInt(input, 2) : input.length - 1;
    const enc = (k) => (key === "increment" ? k.toString(2) : "1".repeat(k));
    const o = mcq(r, res.output, [enc(n), enc(n + 2), enc(n - 1 > 0 ? n - 1 : n + 3), key === "add" ? input : `${input}1`, enc(n * 2)]);
    if (!o) return null;
    return {
      topic: "turing-machine", type: "mcq", marks: 1, ...o,
      stem: [...base, `What is left on the tape (ignoring blanks at either end) when it halts on the input ${input}?`],
      solution: [key === "increment" ? "The machine runs right to the end of the number, then adds 1 moving left: each 1 becomes 0 (a carry) until a 0 or blank becomes 1." : "It turns + into 1, runs to the end and erases the last 1, so it adds the two unary numbers.", `On ${input} it halts after ${res.moves} moves with ${res.output} on the tape.`],
      replay: replay(input),
    };
  }
  return {
    topic: "turing-machine", type: "nat", marks: 2, answer: res.moves, tolerance: 0,
    stem: [...base, `How many moves (rule applications) does it make on the input ${input} before it halts?`],
    solution: [
      `Trace: ${res.steps.slice(1).map((s) => `${s.rule.q} reads ${s.rule.read}, writes ${s.rule.write}, moves ${s.rule.move}`).slice(0, 6).join("; ")}${res.moves > 6 ? "; and so on" : ""}.`,
      `It halts in ${res.steps.at(-1).state} after ${res.moves} moves, so it ${res.result === "accept" ? "accepts" : "rejects"} ${input}.`,
    ],
    replay: replay(input),
  };
}

export const TOPICS = [
  { slug: "finite-automata", subject: "toc", title: "Finite automata", make: finiteAutomata },
  { slug: "nfa-to-dfa", subject: "toc", title: "NFA to DFA", make: nfaToDfa },
  { slug: "dfa-minimization", subject: "toc", title: "DFA minimisation", make: dfaMinimization },
  { slug: "regex-to-nfa", subject: "toc", title: "Regular expressions", make: regexToNfaQ },
  { slug: "dfa-to-regex", subject: "toc", title: "DFA to regex and product", make: dfaToRegex },
  { slug: "pumping-lemma", subject: "toc", title: "Regular or not", make: pumpingLemma },
  { slug: "pushdown-automata", subject: "toc", title: "Pushdown automata", make: pushdownAutomata },
  { slug: "cfg-to-cnf", subject: "toc", title: "CFG to CNF", make: cfgToCnf },
  { slug: "cyk-parsing", subject: "toc", title: "CYK parsing", make: cykQ },
  { slug: "turing-machine", subject: "toc", title: "Turing machines", make: turingMachine },
];
