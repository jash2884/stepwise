// Tools for Engineering maths. Same shape as the entries in ../tools.js; views live in
// ../views/ (so load: () => import("../views/<file>.js")). A subject with no
// tools is hidden everywhere.
export const SUBJECT = { id: "maths", name: "Engineering maths", short: "Maths" };

// Home-card thumbnails, drawn with the h() the home page passes in.
const svg = (h, kids) => h("svg", { viewBox: "0 0 150 64", "aria-hidden": "true" }, kids);

export const TOOLS = [
  { slug: "matrices", subject: "maths", title: "Matrices", art: "matrix",
    summary: "Gaussian elimination with exact fractions: rank, determinants, inverses, Ax = b, and eigenvalues with eigenvectors.",
    description: "Matrix calculator with steps: row echelon form and RREF with exact fractions, rank, determinant, inverse, solving Ax = b, eigenvalues and eigenvectors.",
    load: () => import("../views/matrices.js"),
    preview: (h) => h("div", { class: "art mx-art mx-art-matrix" },
      h("span", { class: "br" }, "["), h("div", null, [["2", "1", "−1"], ["0", "½", "½"], ["0", "0", "−1"]].map((row, i) => h("div", null, row.map((x, j) => h("i", { class: i === j ? "hot" : j < i ? "zero" : null }, x))))), h("span", { class: "br" }, "]"),
      h("small", null, "R₂ ← R₂ + 3/2·R₁")) },
  { slug: "probability", subject: "maths", title: "Probability", art: "bell",
    summary: "Sample spaces, conditional probability and Bayes with a tree, E[X] and Var(X), and binomial to normal distributions plotted.",
    description: "Probability step by step: dice grids and coin trees, conditional probability, Bayes' theorem, expectation and variance, binomial, Poisson and normal.",
    load: () => import("../views/probability.js"),
    preview: (h) => h("div", { class: "art mx-art" }, svg(h, [
      h("path", { d: "M70,58 L70,36 C77,22 93,22 100,36 L100,58 Z", class: "shade" }),
      h("path", { d: "M5,58 C40,58 50,20 85,20 C120,20 130,58 145,58", class: "line" }),
      h("line", { x1: 5, y1: 58, x2: 145, y2: 58, class: "axis" }),
      h("text", { x: 4, y: 11 }, "P(a ≤ X ≤ b)")])) },
  { slug: "calculus", subject: "maths", title: "Calculus", art: "riemann",
    summary: "Limits by table and L'Hôpital, maxima and minima with a sign chart, Riemann sums closing in on an integral, and the MVT.",
    description: "Calculus visualiser: limits with a table and L'Hôpital's rule, maxima and minima with sign charts, Riemann sums vs the exact integral, mean value theorem.",
    load: () => import("../views/calculus.js"),
    preview: (h) => h("div", { class: "art mx-art" }, svg(h, [
      ...[0, 1, 2, 3, 4, 5].map((i) => { const x = 10 + i * 20, y = 58 - (0.012 * (x + 10) ** 2 * 0.8 + 4); return h("rect", { x, y, width: 20, height: 58 - y, class: "bar" }); }),
      h("path", { d: "M5,55 Q75,52 145,6", class: "line" }),
      h("line", { x1: 5, y1: 58, x2: 145, y2: 58, class: "axis" })])) },
  { slug: "aptitude", subject: "maths", title: "Quantitative aptitude", art: "clock",
    summary: "Percentages, profit, mixtures, work, speed, averages, interest, series, clocks and calendars, solved step by step, then timed sets.",
    description: "Quantitative aptitude with worked solutions: percentages, profit and loss, mixtures, time and work, speed, interest, series, clocks, calendars, timed sets.",
    load: () => import("../views/aptitude.js"),
    preview: (h) => h("div", { class: "art mx-art" }, svg(h, [
      h("circle", { cx: 32, cy: 32, r: 26, class: "face" }),
      h("line", { x1: 32, y1: 32, x2: 32, y2: 12, class: "hand" }), h("line", { x1: 32, y1: 32, x2: 46, y2: 40, class: "hand short" }),
      h("text", { x: 70, y: 22 }, "|30h − 5.5m|"), h("text", { x: 70, y: 40 }, "ab / (a + b)"), h("text", { x: 70, y: 58, class: "hot" }, "= 6.67 days")])) },
];
