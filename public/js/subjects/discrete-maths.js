// Tools for Discrete maths. Same shape as the entries in ../tools.js; views live in
// ../views/ (so load: () => import("../views/<file>.js")). A subject with no
// tools is hidden everywhere.
export const SUBJECT = { id: "discrete-maths", name: "Discrete maths", short: "DM" };

// Home-card thumbnails, drawn with the same h() the home page uses.
const tt = (h) => h("div", { class: "art dm-art dm-tt-art", "aria-hidden": "true" },
  ["p", "q", "p→q"].map((x) => h("b", null, x)),
  ["T", "T", "T", "T", "F", "F", "F", "T", "T", "F", "F", "T"].map((x, i) => h("i", { class: `${x === "T" ? "t" : "f"}${i % 3 === 2 ? " hot" : ""}` }, x)));
const rel = (h) => h("div", { class: "art dm-art dm-rel-art", "aria-hidden": "true" },
  [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1].map((x, i) => h("i", { class: x ? (i % 5 === 0 ? "on hot" : "on") : "" }, x)));
const venn = (h) => h("div", { class: "art dm-art dm-venn-art", "aria-hidden": "true" },
  h("svg", { viewBox: "0 0 150 64" }, h("circle", { cx: 58, cy: 26, r: 22, class: "a" }), h("circle", { cx: 92, cy: 26, r: 22, class: "b" }), h("circle", { cx: 75, cy: 44, r: 22, class: "c" })));
const colouring = (h) => h("div", { class: "art dm-art dm-gt-art", "aria-hidden": "true" },
  h("svg", { viewBox: "0 0 150 64" },
    [[30, 14, 75, 8], [30, 14, 22, 50], [75, 8, 120, 14], [120, 14, 128, 50], [22, 50, 75, 56], [75, 56, 128, 50], [75, 8, 75, 56], [30, 14, 128, 50]].map(([a, b, c, d]) => h("line", { x1: a, y1: b, x2: c, y2: d })),
    [[30, 14, 1], [75, 8, 2], [120, 14, 1], [22, 50, 2], [75, 56, 3], [128, 50, 3]].map(([x, y, k]) => h("circle", { cx: x, cy: y, r: 7, class: `k${k}` }))));
const rtree = (h) => h("div", { class: "art dm-art dm-rt-art", "aria-hidden": "true" },
  [["n", 1], ["n/2", 2], ["n/4", 4]].map(([label, k]) => h("div", null, Array.from({ length: k }, () => h("i", null, label)), h("b", null, "n"))));

export const TOOLS = [
  { slug: "propositional-logic", subject: "discrete-maths", title: "Propositional logic", art: "logic",
    summary: "Truth tables built column by column, equivalences, CNF and DNF, rules of inference and quantifiers over a small domain.",
    description: "Truth table generator with steps: tautology or contradiction, equivalence checks, CNF and DNF, rules of inference, and ∀/∃ evaluated over a finite domain.",
    load: () => import("../views/logic.js"), preview: tt },
  { slug: "sets-relations", subject: "discrete-maths", title: "Sets and relations", art: "relation",
    summary: "A relation as a matrix and a digraph: properties, Warshall's closure, equivalence classes, Hasse diagrams and lattices.",
    description: "Relation checker: reflexive, symmetric, transitive, closures by Warshall's algorithm, equivalence classes, Hasse diagrams, lattices and counting relations.",
    load: () => import("../views/relations.js"), preview: rel },
  { slug: "combinatorics", subject: "discrete-maths", title: "Combinatorics", art: "venn",
    summary: "Permutations, combinations, stars and bars, inclusion-exclusion on a Venn diagram, derangements, Catalan numbers and recurrences.",
    description: "Counting step by step: permutations and combinations, stars and bars, inclusion-exclusion, pigeonhole, derangements, Catalan and linear recurrences.",
    load: () => import("../views/combinatorics.js"), preview: venn },
  { slug: "graph-theory", subject: "discrete-maths", title: "Graph theory", art: "colouring",
    summary: "Havel-Hakimi, Euler and Hamilton tours, bipartite checks, chromatic number, matchings, Euler's formula and spanning-tree counts.",
    description: "Graph theory visualiser: Havel-Hakimi, Euler circuits, Hamiltonian cycles, bipartite check, chromatic number, matching, planarity and Kirchhoff's theorem.",
    load: () => import("../views/graphtheory.js"), preview: colouring },
  { slug: "recurrences", subject: "discrete-maths", title: "Recurrences", art: "rtree",
    summary: "Recursion trees drawn level by level, master theorem cases with the reasoning, substitution checks and growth rates compared.",
    description: "Recurrence solver with steps: recursion tree cost per level, master theorem case, Akra-Bazzi, substitution check and a growth-rate chart.",
    load: () => import("../views/recurrences.js"), preview: rtree },
];
