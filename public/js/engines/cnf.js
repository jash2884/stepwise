// Converting a context-free grammar to Chomsky normal form, one rule change at
// a time: a new start symbol, remove ε-rules, remove unit rules, remove useless
// symbols, give terminals their own variables, then split long bodies.
// Every step carries the grammar as it now stands, which rules were just added
// or removed, the pseudocode line and the variables of the moment.
//
// Convention: if ε is in the language, the result keeps S0 → ε (S0 never
// appears on a right-hand side), as in Sipser's textbook. Every other rule is
// A → B C or A → a.
import { EPS, make, showProd } from "./grammar.js";

export const CODE = [
  "add S0 → S  // a new start symbol that is never on a right side",
  "nullable ← { A : A ⇒* ε }  // repeat until nothing changes",
  "for each rule A → α: add each copy of α with nullable symbols left out",
  "remove every A → ε (keep S0 → ε if S was nullable)",
  "unit pairs ← { (A, B) : A ⇒* B by unit rules only }",
  "for each unit pair (A, B): add A → γ for each non-unit B → γ",
  "remove every unit rule A → B",
  "remove non-generating symbols, then unreachable ones",
  "for each terminal a in a body of length ≥ 2",
  "  add Tₐ → a and write Tₐ for a in those bodies",
  "for each A → X1 X2 … Xk with k ≥ 3",
  "  A → X1 Y1, Y1 → X2 Y2, …, Y(k−2) → X(k−1) Xk  // one new variable per tail",
];

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const keyOf = (p) => `${p.lhs}\u0000${p.rhs.join("\u0001")}`;

export function toCNF(g0) {
  const isT = new Set(g0.terminals);
  let nts = [...g0.nonterminals], prods = g0.prods.map((p) => ({ lhs: p.lhs, rhs: [...p.rhs] }));
  const used = new Set([...nts, ...g0.terminals]);
  const fresh = (base) => { let n = base, k = 1; while (used.has(n)) n = `${base}${k++}`; used.add(n); return n; };
  const steps = [];
  const has = (p) => prods.some((q) => q.lhs === p.lhs && same(q.rhs, p.rhs));
  const add = (p, added) => { if (!has(p)) { prods.push(p); added.push(p); return true; } return false; };
  const order = () => { prods.sort((a, b) => nts.indexOf(a.lhs) - nts.indexOf(b.lhs)); };
  const snap = (phase, line, note, { added = [], removed = [], vars = {}, focus = null } = {}) => {
    order();
    const addedK = new Set(added.map(keyOf));
    steps.push({
      phase, line, note, vars: { phase, ...vars },
      start, nonterminals: [...nts],
      prods: prods.map((p) => ({ lhs: p.lhs, rhs: [...p.rhs], mark: addedK.has(keyOf(p)) ? "new" : null })),
      removed: removed.map((p) => ({ lhs: p.lhs, rhs: [...p.rhs] })),
      focus,
    });
  };
  const list = (xs) => `{${xs.join(", ")}}`;
  let start = g0.start;
  snap("given", [], "The grammar as given. Rules in CNF are A → B C (two variables) or A → a (one terminal).");

  // 1. START
  const S0 = fresh(`${g0.start}0`);
  nts.unshift(S0);
  const startRule = { lhs: S0, rhs: [g0.start] };
  prods.unshift(startRule);
  start = S0;
  snap("START", 1, `Add a new start symbol ${S0} with ${S0} → ${g0.start}. Now the start symbol never appears on a right-hand side, so later steps can't accidentally make it derive something new from the middle of a string.`, { added: [startRule], vars: { start: S0 } });

  // 2. DEL: nullable symbols, then expand bodies, then drop ε-rules.
  const nullable = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const p of prods) if (!nullable.includes(p.lhs) && p.rhs.every((s) => nullable.includes(s))) {
      nullable.push(p.lhs); changed = true;
      snap("DEL", 2, `${p.lhs} is nullable: ${p.rhs.length ? `every symbol of ${showProd(p)} is nullable` : `${showProd(p)} derives ε directly`}.`, { vars: { nullable: list(nullable) }, focus: keyOf(p) });
    }
  }
  if (!nullable.length) snap("DEL", 2, "No rule derives ε, so nothing is nullable and there are no ε-rules to remove.", { vars: { nullable: "∅" } });
  else {
    for (const p of [...prods]) {
      const spots = p.rhs.map((s, i) => (nullable.includes(s) ? i : -1)).filter((i) => i >= 0);
      if (!spots.length || !p.rhs.length) continue;
      const added = [];
      for (let mask = 1; mask < 1 << spots.length; mask++) {
        const drop = new Set(spots.filter((_, k) => mask & (1 << k)));
        const rhs = p.rhs.filter((_, i) => !drop.has(i));
        if (rhs.length || p.lhs === S0) add({ lhs: p.lhs, rhs }, added);
      }
      if (added.length) snap("DEL", 3, `${showProd(p)} has nullable ${[...new Set(spots.map((i) => p.rhs[i]))].join(", ")}. Each could vanish, so add every version with some of them left out: ${added.map(showProd).join(", ")}.`, { added, vars: { nullable: list(nullable), rule: showProd(p) }, focus: keyOf(p) });
    }
    const eps = prods.filter((p) => !p.rhs.length && p.lhs !== S0);
    prods = prods.filter((p) => p.rhs.length || p.lhs === S0);
    const keep = prods.some((p) => p.lhs === S0 && !p.rhs.length);
    snap("DEL", 4, `Remove the ε-rules ${eps.map(showProd).join(", ") || "(none left)"}: the copies added above already cover every way they were used.${keep ? ` ${g0.start} was nullable, so ε is in the language and ${S0} → ε stays (the only ε-rule allowed).` : ""}`, { removed: eps, vars: { nullable: list(nullable) } });
  }

  // 3. UNIT: unit pairs by closure, copy non-unit bodies, drop unit rules.
  const isUnit = (p) => p.rhs.length === 1 && nts.includes(p.rhs[0]);
  const pairs = [];
  for (const A of nts) {
    const reach = [A];
    for (let k = 0; k < reach.length; k++) for (const p of prods) if (p.lhs === reach[k] && isUnit(p) && !reach.includes(p.rhs[0])) reach.push(p.rhs[0]);
    for (const B of reach) if (B !== A) pairs.push([A, B]);
  }
  const showPairs = (ps) => (ps.length ? ps.map(([a, b]) => `(${a},${b})`).join(" ") : "∅");
  const units0 = prods.filter(isUnit);
  if (!units0.length) snap("UNIT", 5, "There are no unit rules (A → B), so nothing to do here.", { vars: { "unit pairs": "∅" } });
  else {
    snap("UNIT", 5, `Unit pairs: ${showPairs(pairs)}. (A, B) means A can turn into B using unit rules alone, so A should get every real body of B directly.`, { vars: { "unit pairs": showPairs(pairs) } });
    for (const A of nts) {
      const mine = pairs.filter(([a]) => a === A);
      if (!mine.length) continue;
      const added = [];
      for (const [, B] of mine) for (const p of [...prods]) if (p.lhs === B && !isUnit(p)) add({ lhs: A, rhs: [...p.rhs] }, added);
      snap("UNIT", 6, `${A} reaches ${mine.map(([, b]) => b).join(", ")} through unit rules, so copy their non-unit bodies to ${A}${added.length ? `: ${added.map(showProd).join(", ")}` : " (it already has them all)"}.`, { added, vars: { "unit pairs": showPairs(pairs), A, "B's": mine.map(([, b]) => b).join(", ") } });
    }
    const gone = prods.filter(isUnit);
    prods = prods.filter((p) => !isUnit(p));
    snap("UNIT", 7, `Remove the unit rules ${gone.map(showProd).join(", ")}.`, { removed: gone, vars: { "unit pairs": showPairs(pairs) } });
  }

  // 4. USELESS: non-generating, then unreachable.
  const gen = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const p of prods) if (!gen.includes(p.lhs) && p.rhs.every((s) => isT.has(s) || gen.includes(s))) { gen.push(p.lhs); changed = true; }
  }
  const nonGen = nts.filter((A) => !gen.includes(A));
  const dropGen = prods.filter((p) => !gen.includes(p.lhs) || p.rhs.some((s) => !isT.has(s) && !gen.includes(s)));
  prods = prods.filter((p) => !dropGen.includes(p));
  nts = nts.filter((A) => gen.includes(A) || A === S0);
  snap("USELESS", 8, nonGen.length ? `Generating symbols (they derive some string of terminals): ${list(gen)}. ${nonGen.join(", ")} never finish${nonGen.length === 1 ? "es" : ""}, so remove ${nonGen.length === 1 ? "it" : "them"} and every rule that mentions ${nonGen.length === 1 ? "it" : "them"}.${!gen.includes(S0) ? " Even the start symbol can't generate anything: the language is empty." : ""}` : `Every variable generates some string of terminals: ${list(gen)}.`, { removed: dropGen, vars: { generating: list(gen) } });
  const reach = [S0];
  for (let k = 0; k < reach.length; k++) for (const p of prods) if (p.lhs === reach[k]) for (const s of p.rhs) if (nts.includes(s) && !reach.includes(s)) reach.push(s);
  const unreach = nts.filter((A) => !reach.includes(A));
  const dropReach = prods.filter((p) => !reach.includes(p.lhs));
  prods = prods.filter((p) => reach.includes(p.lhs));
  nts = nts.filter((A) => reach.includes(A));
  snap("USELESS", 8, unreach.length ? `Reachable from ${S0}: ${list(reach)}. ${unreach.join(", ")} can never appear in a derivation, so remove ${unreach.length === 1 ? "its" : "their"} rules.` : `Every remaining variable is reachable from ${S0}.`, { removed: dropReach, vars: { generating: list(gen), reachable: list(reach) } });

  // 5. TERM: terminals inside long bodies get their own variable.
  const tVar = new Map();
  const termsNeeded = [];
  for (const p of prods) if (p.rhs.length >= 2) for (const s of p.rhs) if (isT.has(s) && !termsNeeded.includes(s)) termsNeeded.push(s);
  if (!termsNeeded.length) snap("TERM", 9, "No terminal appears in a body of length 2 or more, so no new variables are needed.", {});
  for (const a of termsNeeded) {
    const T = fresh(`T${a}`);
    tVar.set(a, T);
    nts.push(T);
    const rule = { lhs: T, rhs: [a] };
    const changed = [];
    prods = prods.map((p) => {
      if (p.rhs.length < 2 || !p.rhs.includes(a)) return p;
      const q = { lhs: p.lhs, rhs: p.rhs.map((s) => (s === a ? T : s)) };
      changed.push({ from: p, to: q });
      return q;
    });
    prods.push(rule);
    snap("TERM", [9, 10], `${a} appears in ${changed.map((c) => showProd(c.from)).join(", ")}. Add ${T} → ${a} and write ${T} instead of ${a} there.`, { added: [rule, ...changed.map((c) => c.to)], removed: changed.map((c) => c.from), vars: { a, "Tₐ": T } });
  }

  // 6. BIN: split long bodies into a chain of pairs.
  const long = prods.filter((p) => p.rhs.length >= 3);
  if (!long.length) snap("BIN", 11, "No body is longer than two symbols, so nothing to split.", {});
  // Identical tails share one variable (E → E + T and E0 → E + T both use the same one).
  const tails = new Map();
  let counter = 0;
  for (const p of long) {
    const created = [], reused = [];
    const need = (tail) => {
      const k = tail.join("\u0001");
      if (tails.has(k)) { if (!reused.includes(tails.get(k))) reused.push(tails.get(k)); return tails.get(k); }
      let X;
      do X = `X${++counter}`; while (used.has(X));
      used.add(X); nts.push(X); tails.set(k, X);
      const rule = { lhs: X, rhs: tail.length === 2 ? [...tail] : [tail[0], null] };
      created.push(rule);
      if (tail.length > 2) rule.rhs[1] = need(tail.slice(1));
      return X;
    };
    const head = { lhs: p.lhs, rhs: [p.rhs[0], need(p.rhs.slice(1))] };
    prods.splice(prods.indexOf(p), 1);
    const added = [head, ...created].filter((c) => add(c, []) || true);
    snap("BIN", [11, 12], `${showProd(p)} has ${p.rhs.length} symbols. Replace it by ${showProd(head)}${created.length ? `, where ${created.map(showProd).join(", ")}` : ""}${reused.length ? `${created.length ? "; " : ", "}${reused.join(", ")} already stand${reused.length === 1 ? "s" : ""} for ${reused.length === 1 ? "that tail" : "those tails"}, so ${reused.length === 1 ? "it is" : "they are"} reused` : ""}. Each new variable stands for the rest of the body.`, { added, removed: [p], vars: { rule: showProd(p), k: p.rhs.length, "new variables": created.map((c) => c.lhs).join(", ") || "none" } });
  }
  const grammar = make(nts.filter((A) => prods.some((p) => p.lhs === A) || A === S0), prods, S0);
  const last = steps.at(-1);
  steps.push({ ...last, line: [], note: `Done: ${grammar.prods.length} rules, all of the form A → B C or A → a${grammar.prods.some((p) => !p.rhs.length) ? `, plus ${S0} → ε` : ""}. This grammar is in Chomsky normal form.`, removed: [], prods: last.prods.map((p) => ({ ...p, mark: null })), phase: "done", vars: { ...last.vars, phase: "done", rules: grammar.prods.length } });
  return { grammar, steps, nullable, pairs, generating: gen, reachable: reach, S0 };
}

export function isCNF(g) {
  return g.prods.every((p) => (p.rhs.length === 2 && p.rhs.every((s) => g.isNT(s) && s !== g.start))
    || (p.rhs.length === 1 && !g.isNT(p.rhs[0]))
    || (!p.rhs.length && p.lhs === g.start));
}

// The grammar without S0 → ε, for CYK (which only handles non-empty strings).
export function withoutEmpty(g) {
  return make(g.nonterminals, g.prods.filter((p) => p.rhs.length).map(({ lhs, rhs }) => ({ lhs, rhs })), g.start);
}

// Every terminal string of length ≤ n that each variable derives, by a least
// fixed point (works for any CFG, with ε-rules and cycles). Strings are joined
// with \u0001 so multi-letter terminals are safe.
export function languageUpTo(g, n) {
  const L = new Map(g.nonterminals.map((A) => [A, new Set()]));
  const J = "\u0001";
  const len = (s) => (s === "" ? 0 : s.split(J).length);
  const cat = (a, b) => (a === "" ? b : b === "" ? a : a + J + b);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) {
      let acc = new Set([""]);
      for (const s of p.rhs) {
        const opts = g.isNT(s) ? L.get(s) : new Set([s]);
        const next = new Set();
        for (const x of acc) for (const y of opts) { const z = cat(x, y); if (len(z) <= n) next.add(z); }
        acc = next;
        if (!acc.size) break;
      }
      const target = L.get(p.lhs);
      for (const w of acc) if (!target.has(w)) { target.add(w); changed = true; }
    }
  }
  return new Set([...(L.get(g.start) ?? [])].map((w) => (w === "" ? [] : w.split(J)).join(" ")));
}

export const EXAMPLES = {
  sipser: { name: "Sipser Example 2.10", text: "S -> A S A | a B\nA -> B | S\nB -> b | ε", input: "a b a" },
  hmu: { name: "Expressions (HMU §7.1.5)", text: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | I\nI -> a | b | I a | I b | I 0 | I 1", input: "a + b * a" },
  anbn: { name: "aⁿbⁿ with ε", text: "S -> a S b | ε", input: "a a b b" },
  useless: { name: "With useless symbols (HMU Example 7.1)", text: "S -> A B | a\nA -> b\nB -> b B", input: "a" },
  parens: { name: "Balanced parentheses", text: "S -> ( S ) S | ε", input: "( ) ( )" },
};
export { EPS };
