// Theory of computation and compiler design misconceptions: DFA
// minimisation, FIRST and FOLLOW, and LR parsing.
import { minimize, parseAutomaton } from "../../engines/automata.js";
import { END, EPS, lrAutomaton, lrTable, parseGrammar } from "../../engines/grammar.js";
import { anyOf, define, optSet } from "./kit.js";

// --- DFA minimisation ------------------------------------------------------------------

const roundsOf = (q) => minimize(parseAutomaton(q.given.text)).rounds;
const dfa = define("dfa-minimization", [
  {
    id: "stopped-at-zero-equivalence",
    label: "stopped after splitting accepting from non-accepting states",
    predict: (q) => (q.type === "nat" ? roundsOf(q)[0].groups.length : null),
    explain: (q) => `Splitting accepting from non-accepting states is only the 0-equivalence. Keep refining: split any group whose states move into different groups on some symbol, until a round changes nothing. That takes ${roundsOf(q).length - 1} more round${roundsOf(q).length === 2 ? "" : "s"} here and leaves ${q.type === "nat" ? q.answer : roundsOf(q).at(-1).groups.length} groups.`,
  },
  {
    id: "stopped-one-round-early",
    label: "stopped refining one round too early",
    // rounds end with one that changes nothing, so the partition before the
    // last split is rounds.at(-3); with fewer rounds this is the 0-equivalence mistake.
    predict: (q) => {
      const r = roundsOf(q);
      return q.type === "nat" && r.length >= 4 ? r.at(-3).groups.length : null;
    },
    explain: () => "The partition is final only when a whole round splits nothing. A round that splits a group can make another group splittable in the next round, so always do one more round to check.",
  },
  {
    id: "same-acceptance-means-equivalent",
    label: "took two states that are both accepting (or both not) to be equivalent",
    predict: (q) => {
      if (q.type !== "mcq") return null;
      const [zero] = roundsOf(q);
      return anyOf(q.options.map((o, i) => {
        const [a, b] = o.split(" and ");
        return zero.groups.some((g) => g.includes(a) && g.includes(b)) && i !== q.answer ? i : null;
      }));
    },
    explain: () => "Agreeing on acceptance only means no string of length 0 tells them apart. Two states are equivalent only if no string at all does: follow their moves until the partition stops changing.",
  },
]);

// --- FIRST and FOLLOW -----------------------------------------------------------------------

// FIRST and FOLLOW with one rule switched off.
function sets(g, { lookPast = true, dollar = true, propagate = true } = {}) {
  const first = new Map(g.nonterminals.map((A) => [A, new Set()]));
  const firstSeq = (seq) => {
    const out = new Set();
    for (const s of seq) {
      if (!g.isNT(s)) { out.add(s); return out; }
      for (const x of first.get(s)) if (x !== EPS || !lookPast) out.add(x);
      if (!lookPast || !first.get(s).has(EPS)) return out;
    }
    out.add(EPS);
    return out;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) for (const x of firstSeq(p.rhs)) if (!first.get(p.lhs).has(x)) { first.get(p.lhs).add(x); changed = true; }
  }
  const follow = new Map(g.nonterminals.map((A) => [A, new Set()]));
  if (dollar) follow.get(g.start).add(END);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) p.rhs.forEach((B, k) => {
      if (!g.isNT(B)) return;
      const fb = firstSeq(p.rhs.slice(k + 1));
      const add = [...fb].filter((x) => x !== EPS);
      if (fb.has(EPS) && propagate) add.push(...follow.get(p.lhs));
      for (const x of add) if (!follow.get(B).has(x)) { follow.get(B).add(x); changed = true; }
    });
  }
  return { first, follow };
}
function ffPick(q, rule) {
  const { text, which, X } = q.given;
  const s = sets(parseGrammar(text), rule)[which === "FIRST" ? "first" : "follow"].get(X);
  return optSet(q, (o) => s.has(o));
}
const firstFollow = define("first-follow", [
  {
    id: "first-stops-at-nullable",
    label: "stopped at the first symbol of a body even when it can vanish",
    predict: (q) => (q.given.which === "FIRST" ? ffPick(q, { lookPast: false }) : null),
    explain: () => "FIRST of a body A → Y1 Y2 … takes FIRST(Y1), and if Y1 can derive ε, carries on to FIRST(Y2), and so on. ε is in FIRST(A) only if every symbol can vanish.",
  },
  {
    id: "follow-no-dollar",
    label: "forgot that FOLLOW of the start symbol contains $",
    predict: (q) => (q.given.which === "FOLLOW" ? ffPick(q, { dollar: false }) : null),
    explain: (q) => `The start symbol is always followed by the end of input, so $ goes into FOLLOW(${parseGrammar(q.given.text).start}), and from there into every FOLLOW set that inherits it.`,
  },
  {
    id: "follow-no-inherit",
    label: "didn't pass FOLLOW(A) on to a symbol at the end of A's body",
    predict: (q) => (q.given.which === "FOLLOW" ? ffPick(q, { propagate: false }) : null),
    explain: () => "For A → α B β, when β is empty or can derive ε, whatever follows A can follow B too, so FOLLOW(A) is added to FOLLOW(B).",
  },
]);

// --- LR parsing ---------------------------------------------------------------------------------

const KINDS = { lr0: "LR(0)", slr: "SLR(1)", lalr: "LALR(1)", clr: "CLR(1)" };
const countStates = (q, kind) => lrAutomaton(parseGrammar(q.given.text), kind).states.length;
function conflictOption(q, kind) {
  const t = lrTable(lrAutomaton(parseGrammar(q.given.text), kind));
  const sr = t.conflicts.some((c) => c.kind === "shift/reduce"), rr = t.conflicts.some((c) => c.kind === "reduce/reduce");
  return sr && rr ? 3 : sr ? 1 : rr ? 2 : 0;
}
const statesAs = (asked, used, why) => ({
  id: `${used}-states-for-${asked}`,
  label: `counted the ${KINDS[used]} states when the question asked about ${KINDS[asked]}`,
  predict: (q) => (q.given.variant === "states" && q.given.kind === asked ? countStates(q, used) : null),
  explain: (q) => `${why} ${KINDS[asked]} has ${q.answer} states here.`,
});
const tableAs = (asked, used, why) => ({
  id: `${used}-table-for-${asked}`,
  label: `built the ${KINDS[used]} table instead of the ${KINDS[asked]} one`,
  predict: (q) => (q.given.variant === "conflicts" && q.given.kind === asked ? conflictOption(q, used) : null),
  explain: () => why,
});
const lr = define("lr-parsing", [
  statesAs("clr", "lr0", "CLR(1) items carry lookaheads, and items with the same core but different lookaheads are different states, so CLR(1) usually has more states than LR(0)."),
  statesAs("lalr", "clr", "LALR(1) merges the CLR(1) states that have the same core, so it always has exactly as many states as LR(0)."),
  statesAs("lr0", "clr", "LR(0) items have no lookaheads, so states that differ only in lookahead are one state."),
  tableAs("slr", "lr0", "SLR(1) reduces A → α only on the terminals in FOLLOW(A); LR(0) reduces on every terminal, which creates conflicts SLR(1) doesn't have."),
  tableAs("lr0", "slr", "LR(0) puts a reduce in every column of a state with a complete item, not only the FOLLOW columns, so it has more conflicts than SLR(1)."),
  tableAs("lalr", "clr", "Merging CLR(1) states with the same core can bring two reduce items into one state on the same lookahead: a reduce/reduce conflict that CLR(1) doesn't have."),
  tableAs("clr", "lalr", "CLR(1) keeps states with the same core apart, so a reduce/reduce conflict that appears only after LALR merging doesn't happen in CLR(1)."),
]);

export const THEORY = [...dfa, ...firstFollow, ...lr];
