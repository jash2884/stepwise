// AI tool schemas: discrete maths. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { EXAMPLES as LOGIC_EXAMPLES, equivalence, evaluateFol, inference, normalForms, parse, parseDomain, show, truthTable, variables } from "../../engines/logic.js";
import { EXAMPLES as REL_EXAMPLES, classes, countPairs, counts, equivalenceClosure, hasse, lattice, parsePairs, parseSet, properties, reflexiveClosure, symmetricClosure, transitiveClosure } from "../../engines/relations.js";
import { SELECTIONS, catalan, derangement, divisibleCount, forceCount, inclusionExclusion, multiset, pigeonhole, selection, solveRecurrence, starsAndBars } from "../../engines/combinatorics.js";
import { parseGraph } from "../../engines/graph.js";
import { EXAMPLES as GRAPHS, SEQ_EXAMPLES, bipartite, chromatic, components, degrees, euler, hamilton, havelHakimi, matching, parseSequence, planarCounts, spanningTrees } from "../../engines/graphtheory.js";
import { EXAMPLES as REC_EXAMPLES, exactT, parseF, parseRecurrence, solve, substitution, theta } from "../../engines/recurrences.js";

// Big integers become plain numbers when they are safe, digit strings otherwise.
const big = (x) => (x == null ? "none" : typeof x !== "bigint" ? x : x <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(x) : String(x));
const yes = (b) => (b ? "yes" : "no");
const pairsText = (M, els) => M.flatMap((row, i) => row.map((x, j) => (x ? `(${els[i]},${els[j]})` : null)).filter(Boolean)).join(" ");

// The view's per-mode defaults for f (logic) and g (graph theory).
const LOGIC_F = { fol: "∀x ∃y (x < y)", equiv: "p → q" };
const GRAPH_DEFAULT = { euler: "house", hamilton: "w6", bipartite: "c5", colour: "petersen", matching: "k33", planar: "k5", kirchhoff: "k4" };

export const SCHEMAS = [
  tool("propositional-logic", {
    keywords: "propositional logic truth table tautology contradiction contingency satisfiable valid logically equivalent equivalence implication converse contrapositive de morgan cnf dnf normal form rules of inference argument valid modus ponens modus tollens first order logic predicate quantifiers for all there exists",
    params: {
      mode: { type: "enum", values: ["table", "equiv", "normal", "infer", "fol"], default: "table", desc: "table: truth table and tautology check; equiv: are f and g equivalent; normal: CNF and DNF of f; infer: is the argument p therefore c valid; fol: evaluate a quantified formula over a finite domain" },
      f: { type: "string", format: "a formula with variables p q r ... and ¬ ∧ ∨ → ↔ ⊕ (or ~ & | -> <->), e.g. ((p → q) ∧ p) → q. In fol mode: quantifiers ∀x ∃y (or forall, exists), comparisons x < y, x + 1 = y, x mod 2 = 0 and even(x), odd(x), prime(x), divides(x, y)", desc: "the formula (table, equiv, normal, fol). If left out: ((p → q) ∧ p) → q, or p → q in equiv mode, or ∀x ∃y (x < y) in fol mode" },
      g: { type: "string", format: "a formula, same syntax as f", default: "¬q → ¬p", desc: "equiv mode: the second formula" },
      p: { type: "string", format: "premises separated by ';', e.g. p → q; ¬q", default: "p → q; p", desc: "infer mode: the premises" },
      c: { type: "string", format: "a formula, e.g. ¬p", default: "q", desc: "infer mode: the conclusion" },
      dom: { type: "string", format: "1 to 8 whole numbers separated by spaces, or a range like 1..5", default: "1 2 3 4", desc: "fol mode: the domain of discourse" },
    },
    answers: {
      kind: "table: tautology, contradiction or contingency", tautology: "table: yes or no", satisfiable: "table: yes or no", trueRows: "table: rows where f is true", rows: "table: rows in the truth table",
      equivalent: "equiv: yes or no", valid: "infer: is the argument valid (yes or no)", rule: "infer: the named rule of inference, if any",
      cnf: "normal: a CNF of f", dnf: "normal: a DNF of f", value: "fol: true or false",
    },
    examples: [
      { request: "Is ((p → q) ∧ ¬q) → ¬p a tautology?", params: { mode: "table", f: "((p → q) ∧ ¬q) → ¬p" } },
      { request: "Is p → q equivalent to ¬q → ¬p?", params: { mode: "equiv", f: "p → q", g: "¬q → ¬p" } },
      { request: "Over the domain 1 to 5, is ∃y ∀x (x ≤ y) true?", params: { mode: "fol", f: "∃y ∀x (x ≤ y)", dom: "1..5" } },
    ],
    validate(v) {
      const text = v.f ?? LOGIC_F[v.mode] ?? LOGIC_EXAMPLES.mp.f;
      const guard = (f, max = 6) => { const n = variables(f).length; if (n > max) throw new Error(`Use at most ${max} variables here (this has ${n}).`); return f; };
      if (v.mode === "table") {
        const f = guard(parse(text)), t = truthTable(f), trueRows = t.final.filter(Boolean).length;
        return { text: `${show(f)} is a ${t.kind}: true in ${trueRows} of ${t.final.length} rows.`, values: { kind: t.kind, tautology: yes(t.kind === "tautology"), satisfiable: yes(trueRows > 0), trueRows, rows: t.final.length } };
      }
      if (v.mode === "equiv") {
        const f = guard(parse(text)), g = guard(parse(v.g)), e = equivalence(f, g);
        const env = e.counter ? Object.entries(e.counter.env).map(([k, b]) => `${k} = ${b ? "T" : "F"}`).join(", ") : "";
        return { text: e.equivalent ? `${show(f)} and ${show(g)} are logically equivalent.` : `${show(f)} and ${show(g)} are not equivalent: they differ when ${env}.`, values: { equivalent: yes(e.equivalent) } };
      }
      if (v.mode === "normal") {
        const f = guard(parse(text), 5), n = normalForms(f);
        return { text: `${show(f)}: CNF ${n.cnfText}; DNF ${n.dnfText}.`, values: { cnf: n.cnfText, dnf: n.dnfText, clauses: n.cnf.length, terms: n.dnf.length } };
      }
      if (v.mode === "infer") {
        const ps = v.p.split(";").map((s) => s.trim()).filter(Boolean).map((s) => parse(s));
        if (!ps.length) throw new Error("Add at least one premise.");
        const c = parse(v.c);
        guard({ type: "bin", op: "and", a: ps.reduce((a, b) => ({ type: "bin", op: "and", a, b })), b: c });
        const r = inference(ps, c);
        const rule = r.rule ? r.rule.name : "none";
        return { text: `${ps.map(show).join("; ")} therefore ${show(c)}: ${r.valid ? "valid" : "invalid"}${r.rule ? ` (${r.rule.name})` : ""}.`, values: { valid: yes(r.valid), rule } };
      }
      const f = parse(text, { mode: "fol" }), dom = parseDomain(v.dom), r = evaluateFol(f, dom);
      return { text: `${text} over {${dom.join(", ")}} is ${r.value ? "true" : "false"}.`, values: { value: r.value ? "true" : "false" } };
    },
  }),

  tool("sets-relations", {
    keywords: "relation reflexive irreflexive symmetric antisymmetric asymmetric transitive equivalence relation partial order poset closure transitive closure warshall equivalence classes partition hasse diagram lattice distributive complemented boolean algebra number of relations functions injective surjective onto bijections bell number",
    params: {
      mode: { type: "enum", values: ["props", "closure", "classes", "poset", "count"], default: "props", desc: "props: which properties R has; closure: reflexive, symmetric, transitive and equivalence closures; classes: equivalence classes; poset: Hasse diagram and lattice test; count: how many relations or functions of each kind" },
      set: { type: "string", format: "up to 8 element names separated by spaces, e.g. 1 2 3 4 or 0 a b c 1", default: REL_EXAMPLES.sample.set, desc: "the set A (not used in count mode)" },
      r: { type: "string", format: "ordered pairs, e.g. (1,1) (1,2) (2,1); for a poset list every pair including (a,a) and the transitive ones", default: REL_EXAMPLES.sample.pairs, desc: "the relation R on the set (not used in count mode)" },
      n: { type: "int", min: 1, max: 20, default: 3, desc: "count mode: |A|" },
      m: { type: "int", min: 1, max: 20, default: 3, desc: "count mode: |B| (for functions and relations from A to B)" },
    },
    answers: {
      reflexive: "yes or no (also symmetric, antisymmetric, asymmetric, irreflexive, transitive, equivalence, partialOrder)", pairs: "number of pairs in R",
      transitiveClosure: "pairs in the transitive closure", reflexiveTransitiveClosure: "pairs in the reflexive transitive closure", equivalenceClosure: "pairs in the equivalence closure", symmetricClosure: "pairs in the symmetric closure", reflexiveClosure: "pairs in the reflexive closure",
      classes: "number of equivalence classes (of R, or of its equivalence closure)", hasseEdges: "poset: edges in the Hasse diagram", lattice: "poset: yes or no", distributive: "poset: yes or no", complemented: "poset: yes or no", boolean: "poset: is it a Boolean algebra",
      relations: "count: relations on A (also reflexive, symmetric, antisymmetric, asymmetric, reflexiveSymmetric, equivalence, partialOrders, relationsAB, functions, injective, surjective, bijective, partialFunctions, binaryOps)",
    },
    examples: [
      { request: "Is R = {(1,1),(1,2),(2,1),(2,2),(3,3)} on {1,2,3} an equivalence relation?", params: { mode: "props", set: "1 2 3", r: "(1,1) (1,2) (2,1) (2,2) (3,3)" } },
      { request: "How many antisymmetric relations are there on a set of 4 elements?", params: { mode: "count", n: 4, m: 4 } },
      { request: "Number of onto functions from a 5-element set to a 3-element set", params: { mode: "count", n: 5, m: 3 } },
    ],
    validate(v) {
      if (v.mode === "count") {
        const rows = counts(v.n, v.m);
        const values = Object.fromEntries(rows.map((x) => [x.id, big(x.value)]));
        return { text: `|A| = ${v.n}, |B| = ${v.m}: ${values.relations} relations, ${values.reflexive} reflexive, ${values.symmetric} symmetric, ${values.antisymmetric} antisymmetric, ${values.equivalence} equivalence relations; ${values.functions} functions, ${values.injective} one-to-one, ${values.surjective} onto.`, values };
      }
      const els = parseSet(v.set), M = parsePairs(v.r, els), p = properties(M, els);
      const values = { pairs: countPairs(M) };
      for (const k of ["reflexive", "irreflexive", "symmetric", "antisymmetric", "asymmetric", "transitive"]) values[k] = yes(p[k].ok);
      values.equivalence = yes(p.equivalence); values.partialOrder = yes(p.partialOrder);
      const T = transitiveClosure(M), E = equivalenceClosure(M);
      Object.assign(values, { reflexiveClosure: countPairs(reflexiveClosure(M)), symmetricClosure: countPairs(symmetricClosure(M)), transitiveClosure: countPairs(T), reflexiveTransitiveClosure: countPairs(reflexiveClosure(T)), equivalenceClosure: countPairs(E) });
      const cls = classes(p.equivalence ? M : E, els);
      values.classes = cls.length;
      let extra = "";
      if (p.partialOrder) {
        const H = hasse(M, els), L = lattice(M, els);
        Object.assign(values, { hasseEdges: H.covers.length, lattice: yes(L.isLattice), distributive: yes(!!L.distributive), complemented: yes(!!L.complemented), boolean: yes(L.isLattice && L.distributive && L.complemented) });
        extra = ` A partial order: ${H.covers.length} Hasse edges, ${L.isLattice ? `a lattice${L.distributive ? ", distributive" : ", not distributive"}${L.complemented ? ", complemented" : ""}` : "not a lattice"}.`;
      }
      const has = ["reflexive", "symmetric", "antisymmetric", "transitive"].filter((k) => p[k].ok);
      const mode = v.mode === "closure" ? ` Transitive closure ${values.transitiveClosure} pairs, equivalence closure ${values.equivalenceClosure}.`
        : v.mode === "classes" ? ` Classes${p.equivalence ? "" : " of its equivalence closure"}: ${cls.map((c) => `{${c.join(", ")}}`).join(", ")}.` : "";
      return { text: `R (${values.pairs} pairs) is ${has.length ? has.join(", ") : "none of reflexive, symmetric, antisymmetric, transitive"}${p.equivalence ? ", so an equivalence relation" : ""}.${mode}${extra}`, values };
    },
  }),

  tool("combinatorics", {
    keywords: "counting permutations combinations nPr nCr arrangements selections with repetition stars and bars integer solutions distributing identical objects inclusion exclusion divisible by pigeonhole derangements catalan number binary search trees balanced parentheses linear recurrence characteristic equation closed form",
    params: {
      mode: { type: "enum", values: ["select", "stars", "ie", "pigeon", "derange", "catalan", "rec"], default: "select", desc: "select: permutations and combinations; stars: stars and bars; ie: inclusion-exclusion; pigeon: pigeonhole; derange: derangements D(n); catalan: Catalan C(n); rec: linear recurrence a(n) = c1 a(n-1) + c2 a(n-2) + d" },
      kind: { type: "enum", values: Object.keys(SELECTIONS), default: "comb", desc: "select: perm (ordered, no repeats), permRep (n^r), comb (C(n, r)), combRep (C(n + r - 1, r))" },
      n: { type: "int", min: 0, max: 60, default: 5, desc: "select: n items; stars: n identical items; derange and catalan: n (up to 20)" },
      r: { type: "int", min: 0, max: 60, default: 3, desc: "select: how many are chosen" },
      word: { type: "string", format: "letters, e.g. MISSISSIPPI", default: "", desc: "select: also count arrangements of this word's letters" },
      k: { type: "int", min: 1, max: 20, default: 3, desc: "stars: number of boxes (variables)" },
      lo: { type: "string", format: "minimum for each box separated by spaces, e.g. 1 1 1; empty for all 0", default: "", desc: "stars: lower bounds" },
      ie: { type: "enum", values: ["div", "sizes"], default: "div", desc: "ie: div (count 1..N divisible by the divisors) or sizes (give set sizes)" },
      N: { type: "int", min: 1, max: 1000000, default: 100, desc: "ie div: count among 1 to N" },
      d: { type: "string", format: "2 or 3 divisors separated by spaces, e.g. 2 3 5", default: "2 3 5", desc: "ie div: the divisors" },
      s: { type: "string", format: "set sizes like A=20 B=15 C=10 AB=5 AC=4 BC=3 ABC=2 (two sets: A B AB)", default: "A=20 B=15 C=10 AB=5 AC=4 BC=3 ABC=2", desc: "ie sizes: the sizes" },
      items: { type: "int", min: 1, max: 200, default: 13, desc: "pigeon: items" },
      boxes: { type: "int", min: 1, max: 12, default: 4, desc: "pigeon: boxes" },
      c1: { type: "int", min: -20, max: 20, default: 1, desc: "rec: coefficient of a(n-1)" },
      c2: { type: "int", min: -20, max: 20, default: 1, desc: "rec: coefficient of a(n-2) (0 for first order)" },
      cd: { type: "int", min: -50, max: 50, default: 0, desc: "rec: constant term d" },
      a0: { type: "int", min: -100, max: 100, default: 0, desc: "rec: a(0)" },
      a1: { type: "int", min: -100, max: 100, default: 1, desc: "rec: a(1)" },
    },
    answers: {
      count: "select, stars, derange, catalan: the count", perm: "select: P(n, r) (also permRep, comb, combRep side by side)", word: "select: arrangements of word",
      union: "ie: size of the union (divisible by at least one)", none: "ie div: divisible by none", atLeast: "pigeon: some box holds at least this many", force: "pigeon: items needed to force at least atLeast in one box",
      formula: "rec: closed form", "a.5": "rec: a(n) for n = 0 to 10 (a.0, a.1, ... a.10)",
    },
    examples: [
      { request: "How many non-negative integer solutions does x1 + x2 + x3 + x4 = 10 have?", params: { mode: "stars", n: 10, k: 4 } },
      { request: "How many integers from 1 to 500 are divisible by 3, 5 or 7?", params: { mode: "ie", ie: "div", N: 500, d: "3 5 7" } },
      { request: "a(n) = 5a(n-1) - 6a(n-2), a0 = 1, a1 = 4: closed form and a(6)?", params: { mode: "rec", c1: 5, c2: -6, cd: 0, a0: 1, a1: 4 } },
    ],
    validate(v) {
      const m = v.mode;
      if (m === "select") {
        const res = selection(v.kind, v.n, v.r);
        const values = { count: big(res.value) };
        for (const k of Object.keys(SELECTIONS)) values[k] = big(selection(k, v.n, v.r).value);
        if (v.word) values.word = big(multiset(v.word.toUpperCase()).value);
        return { text: `${res.name}, n = ${v.n}, r = ${v.r}: ${res.work} = ${values.count}.${v.word ? ` Arrangements of ${v.word.toUpperCase()}: ${values.word}.` : ""}`, values };
      }
      if (m === "stars") {
        const mins = (v.lo.match(/\d+/g) ?? []).map(Number);
        const res = starsAndBars(v.n, v.k, mins);
        return { text: `${v.n} identical items into ${v.k} boxes${mins.length ? ` with minimums ${mins.join(", ")}` : ""}: ${res.work} = ${big(res.value)}.`, values: { count: big(res.value) } };
      }
      if (m === "ie") {
        if (v.ie === "div") {
          const ds = (v.d.match(/\d+/g) ?? []).map(Number).filter((x) => x > 0).slice(0, 3);
          if (ds.length < 2) throw new Error("Give two or three divisors, like 2 3 5.");
          const res = divisibleCount(v.N, ds);
          return { text: `Of 1 to ${v.N}, ${res.union} are divisible by at least one of ${ds.join(", ")} and ${res.none} by none.`, values: { union: res.union, none: res.none } };
        }
        const sizes = {};
        for (const [, k, x] of v.s.matchAll(/([ABC]{1,3})\s*=\s*(\d+)/g)) sizes[[...k].sort().join("")] = Number(x);
        for (const k of ["A", "B", "AB"]) if (sizes[k] == null) throw new Error(`Give a size for ${k}, like A=20 B=15 AB=5 (add C, AC, BC, ABC for three sets).`);
        if (sizes.C != null) for (const k of ["AC", "BC", "ABC"]) sizes[k] ??= 0;
        const res = inclusionExclusion(sizes);
        return { text: `The union has ${res.union} elements${res.consistent ? "" : " (but these sizes are inconsistent)"}.`, values: { union: res.union } };
      }
      if (m === "pigeon") {
        const res = pigeonhole(v.items, v.boxes);
        return { text: `${v.items} items in ${v.boxes} boxes: some box holds at least ${res.atLeast}.`, values: { atLeast: res.atLeast, force: forceCount(v.boxes, res.atLeast) } };
      }
      if (m === "derange" || m === "catalan") {
        if (v.n > 20) throw new Error("n must be at most 20 here.");
        if (m === "derange" && v.n < 1) throw new Error("n must be at least 1 for derangements.");
        const x = big(m === "derange" ? derangement(v.n) : catalan(v.n));
        return { text: m === "derange" ? `D(${v.n}) = ${x} derangements.` : `Catalan C(${v.n}) = ${x}.`, values: { count: x } };
      }
      const res = solveRecurrence({ c1: v.c1, c2: v.c2, d: v.cd, a0: v.a0, a1: v.a1 }, 10);
      const values = { formula: res.formula };
      res.values.forEach((x, i) => { values[`a.${i}`] = Number.isFinite(x) ? round(x, 6) : String(x); });
      return { text: `Closed form a(n) = ${res.formula}; a(0..10) = ${res.values.slice(0, 11).join(", ")}.`, values };
    },
  }),

  tool("graph-theory", {
    keywords: "graph theory degree sequence graphic havel hakimi euler circuit euler path trail hamiltonian cycle bipartite chromatic number colouring coloring maximum matching planar graph euler formula faces regions spanning trees kirchhoff matrix tree theorem cayley handshake",
    params: {
      mode: { type: "enum", values: ["hh", "euler", "hamilton", "bipartite", "colour", "matching", "planar", "kirchhoff"], default: "euler", desc: "hh: is a degree sequence graphic; euler: Euler trail or circuit; hamilton: Hamiltonian cycle; bipartite; colour: chromatic number; matching: maximum matching; planar: Euler's formula; kirchhoff: number of spanning trees" },
      g: { type: "string", format: "undirected simple graph, one edge per item joined by ';', each edge two vertex names separated by a space, e.g. A B;B C;C A;C D. A lone name adds an isolated vertex. At most 12 vertices (10 for hamilton and colour) and 30 edges", desc: "the graph (every mode except hh). If left out each mode shows its own example (euler: a house, colour: the Petersen graph, kirchhoff: K4, ...)" },
      seq: { type: "string", format: "degrees separated by spaces, e.g. 3 3 2 2 2", default: SEQ_EXAMPLES.yes, desc: "hh mode: the degree sequence" },
    },
    answers: {
      graphic: "hh: yes or no", vertices: "number of vertices", edges: "number of edges", components: "connected components",
      euler: "circuit, trail or none", hamiltonian: "yes, no or unknown", bipartite: "yes or no", chi: "chromatic number", matching: "size of a maximum matching", perfect: "perfect matching: yes or no",
      faces: "faces if drawn planar, by Euler's formula (v - e + f = 1 + c)", planarBoundBroken: "yes if e > 3v - 6 (or the girth bound), so it cannot be planar", spanningTrees: "number of spanning trees",
    },
    examples: [
      { request: "What is the chromatic number of the graph with edges A-B, B-C, C-A, C-D, D-E, E-A?", params: { mode: "colour", g: "A B;B C;C A;C D;D E;E A" } },
      { request: "Is 4 4 4 1 1 a graphic degree sequence?", params: { mode: "hh", seq: "4 4 4 1 1" } },
      { request: "How many spanning trees does K4 have?", params: { mode: "kirchhoff", g: "A B;A C;A D;B C;B D;C D" } },
    ],
    validate(v) {
      if (v.mode === "hh") {
        const seq = parseSequence(v.seq), r = havelHakimi(seq);
        return { text: `${seq.join(", ")} is ${r.graphic ? "graphic" : "not graphic"}${r.reason ? ` (${r.reason})` : ""}.`, values: { graphic: yes(r.graphic) } };
      }
      const text = v.g ?? GRAPHS[GRAPH_DEFAULT[v.mode]].text;
      const g = parseGraph(text, { maxNodes: v.mode === "hamilton" || v.mode === "colour" ? 10 : 12, maxEdges: 30 });
      const eu = euler(g), bp = bipartite(g), pc = planarCounts(g), mt = matching(g);
      const values = { vertices: g.nodes.length, edges: g.edges.length, components: components(g).length, euler: eu.kind, bipartite: yes(bp.bipartite), matching: mt.size, perfect: yes(!!mt.perfect), faces: pc.faces, planarBoundBroken: yes(pc.violates) };
      const deg = degrees(g);
      let main;
      if (v.mode === "hamilton") {
        const h = hamilton(g);
        values.hamiltonian = h.cycle ? "yes" : h.truncated ? "unknown" : "no";
        main = h.cycle ? `Hamiltonian cycle ${[...h.cycle, h.cycle[0]].join(" -> ")}.` : `No Hamiltonian cycle${h.truncated ? " found (search cut short)" : ""}.`;
      } else if (v.mode === "colour") {
        const c = chromatic(g);
        values.chi = c.chi;
        main = `Chromatic number ${c.chi}${c.truncated ? " (search cut short)" : ""}.`;
      } else if (v.mode === "kirchhoff") {
        values.spanningTrees = big(spanningTrees(g).count);
        main = `${values.spanningTrees} spanning trees.`;
      } else if (v.mode === "matching") main = `Maximum matching of size ${mt.size}${mt.perfect ? " (perfect)" : ""}.`;
      else if (v.mode === "planar") main = `If planar it has ${pc.faces} faces${pc.violates ? ", but e is above the planar bound, so it is not planar" : ""}.`;
      else if (v.mode === "bipartite") main = bp.bipartite ? "It is bipartite." : "It is not bipartite (it has an odd cycle).";
      else main = eu.kind === "circuit" ? "It has an Euler circuit." : eu.kind === "trail" ? `It has an Euler trail from ${eu.odd[0]} to ${eu.odd[1]}, but no circuit.` : "It has no Euler trail.";
      return { text: `${g.nodes.length} vertices, ${g.edges.length} edges (degrees ${g.nodes.map((x) => `${x}:${deg[x]}`).join(" ")}). ${main}`, values };
    },
  }),

  tool("recurrences", {
    keywords: "recurrence relation master theorem case 1 case 2 case 3 recursion tree substitution method time complexity theta big o T(n) divide and conquer akra bazzi growth rate asymptotic order merge sort binary search",
    params: {
      mode: { type: "enum", values: ["tree", "master", "subst", "growth"], default: "tree", desc: "tree: recursion tree; master: master theorem with the case; subst: check a guess against real numbers; growth: compare growth rates" },
      t: { type: "string", format: "T(n) = terms like aT(n/b), T(n-1), T(2n/3), T(sqrt(n)) plus f(n) such as 1, n, n^2, n log n, n/log n, sqrt(n), log n, 2^n; e.g. T(n) = 2T(n/2) + n", default: REC_EXAMPLES.merge.text, desc: "the recurrence" },
      guess: { type: "string", format: "a growth function like n log n, n^2, 2^n; empty uses the solution", default: "", desc: "subst mode: the guess g(n)" },
    },
    answers: {
      theta: "the solution as Θ(...)", method: "master, akra, subtract, linear or root", case: "master: the case used (1, 2 or 3)", basic: "master: yes if the basic CLRS theorem covers it",
      "T.16": "exact T(n) with T(n) = 1 for n <= 1 (keys T.2 to T.10, T.16, T.32, T.64)", verdict: "subst: fits, small (guess too small) or big (guess too big)",
    },
    examples: [
      { request: "Solve T(n) = 4T(n/2) + n^2 using the master theorem", params: { mode: "master", t: "T(n) = 4T(n/2) + n^2" } },
      { request: "T(n) = 2T(n-1) + 1 with T(1) = 1: what is T(10)?", params: { mode: "tree", t: "T(n) = 2T(n-1) + 1" } },
    ],
    validate(v) {
      const rec = parseRecurrence(v.t);
      const sol = solve(rec);
      const values = { theta: theta(sol.growth), method: sol.method };
      if (sol.case != null) values.case = sol.case;
      if (sol.method === "master") values.basic = yes(sol.basic);
      for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 32, 64]) {
        try { const x = exactT(rec, n); if (Number.isFinite(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER) values[`T.${n}`] = x; } catch { /* not every recurrence has exact small values */ }
      }
      let extra = "";
      if (v.mode === "subst") {
        const guess = v.guess.trim() ? parseF(v.guess) : sol.growth;
        const r = substitution(rec, guess);
        values.verdict = r.verdict;
        extra = ` The guess ${r.verdict === "fits" ? "fits" : r.verdict === "small" ? "is too small" : "is too big"}.`;
      }
      const how = sol.case == null ? "" : sol.method === "master" && !sol.basic ? ` (case ${sol.case} of the extended master theorem; the basic master theorem does not apply)` : ` (case ${sol.case})`;
      return { text: `${rec.text}: T(n) = ${values.theta}${how}.${values["T.10"] != null ? ` T(10) = ${values["T.10"]}.` : ""}${extra}`, values };
    },
  }),
];
