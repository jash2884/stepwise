import { CODE, EXAMPLES, determinant, eigen, encodeMatrix, equalMatrices, identity, inverse, multiply, parseMatrix, randomEigenMatrix, randomMatrix, rowReduce, solveSystem } from "../engines/matrices.js";
import { Fraction } from "../engines/fraction.js";
import { matrices as makeQuestion } from "../gate/maths.js";
import { copyLink, h, notice, page, readParams, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { matrixView, plotFrame, practiceCard, simulation } from "./maths-kit.js";

const MODES = {
  ref: "Row echelon form and rank",
  rref: "Reduced row echelon form (RREF)",
  det: "Determinant",
  inverse: "Inverse (Gauss-Jordan)",
  solve: "Solve Ax = b",
  eigen: "Eigenvalues and eigenvectors",
};
const DEFAULTS = { ref: "1,2,1,3;2,4,0,2;3,6,1,5", rref: "1,2,1,3;2,4,0,2;3,6,1,5", det: "0,2,1;1,3,2;2,1,4", inverse: "2,1,1;1,3,2;1,0,0", solve: "2,1,-1;-3,-1,2;-2,1,2", eigen: "4,1;2,3" };
const toText = (m) => m.split(";").map((r) => r.split(",").join("  ")).join("\n");
const fromText = (t) => encodeMatrix(parseMatrix(t));
const vec = (v) => `(${v.map(String).join(", ")})`;

function draw(step) {
  return matrixView(step.matrix, { aug: step.aug, pivot: step.pivot, rows: step.rows, sym: step.sym, diag: step.diag, pivotCells: step.pivotCells ?? [], label: step.op === "start" ? (step.aug ? "[A | augmented]" : "A") : step.op === "done" ? "final form" : step.op });
}

// A 2×2 matrix acting on the plane: the unit circle maps to an ellipse, and
// eigenvectors are the directions that only get stretched.
function eigenPicture(A, res) {
  const a = A.map((r) => r.map((x) => x.toNumber()));
  const real = res.values.filter((v) => !v.im && v.vectors.length);
  const reach = Math.max(1.5, ...res.values.map((v) => Math.abs(v.value) * 1.1), Math.hypot(a[0][0], a[1][0]), Math.hypot(a[0][1], a[1][1])) * 1.05;
  const P = plotFrame({ x0: -reach, x1: reach, y0: -reach, y1: reach, W: 320, H: 320, pad: 28 });
  const circle = [], image = [];
  for (let i = 0; i <= 120; i++) {
    const t = (2 * Math.PI * i) / 120, x = Math.cos(t), y = Math.sin(t);
    circle.push(`${i ? "L" : "M"}${P.sx(x).toFixed(1)},${P.sy(y).toFixed(1)}`);
    image.push(`${i ? "L" : "M"}${P.sx(a[0][0] * x + a[0][1] * y).toFixed(1)},${P.sy(a[1][0] * x + a[1][1] * y).toFixed(1)}`);
  }
  const kids = [h("path", { d: circle.join(""), class: "mx-unit" }), h("path", { d: image.join(""), class: "mx-image" })];
  real.forEach((v, i) => {
    const w = (v.exactVectors?.[0] ?? v.numericVectors?.[0]).map(Number);
    const len = Math.hypot(...w), ux = w[0] / len, uy = w[1] / len;
    kids.push(h("line", { x1: P.sx(-reach * ux), y1: P.sy(-reach * uy), x2: P.sx(reach * ux), y2: P.sy(reach * uy), class: "mx-eigline", style: `--c:var(--series-${i + 2})` }),
      h("line", { x1: P.sx(0), y1: P.sy(0), x2: P.sx(v.value * ux), y2: P.sy(v.value * uy), class: "mx-eigvec", style: `--c:var(--series-${i + 2})` }),
      h("text", { x: P.sx(v.value * ux) + 4, y: P.sy(v.value * uy) - 4, class: "mx-label", style: `fill:var(--series-${i + 2})` }, `λ = ${v.text}`));
  });
  return h("figure", { class: "mx-figure" }, P.svg(kids, "The unit circle and its image under A, with the eigenvector directions"),
    h("figcaption", { class: "muted small" }, real.length ? "Dashed: the unit circle. Solid: its image under A. Along each coloured line, A just stretches by λ." : "Complex eigenvalues: no real direction is only stretched; A turns every vector."));
}

function summary(mode, A, b) {
  if (mode === "ref" || mode === "rref") {
    const r = rowReduce(A, { reduced: mode === "rref" });
    return { steps: r.steps, card: h("section", { class: "card" }, h("h2", null, "Result"),
      h("div", { class: "stats-row" }, stat("Rank", r.rank), stat("Nullity (columns − rank)", A[0].length - r.rank), stat("Pivot columns", r.pivots.map(([, c]) => c + 1).join(", ") || "none")),
      h("p", { class: "muted small" }, "Rank = number of pivots = number of non-zero rows in echelon form = the number of linearly independent rows (and columns). Rank + nullity = number of columns.")) };
  }
  if (mode === "det") {
    const r = determinant(A);
    return { steps: r.steps, card: h("section", { class: "card" }, h("h2", null, "Result"),
      h("div", { class: "stats-row" }, stat("det(A)", r.det.toString()), stat("Invertible?", r.det.isZero() ? "No (singular)" : "Yes")),
      h("p", { class: "muted small" }, "Useful facts: det(AB) = det(A)·det(B), det(Aᵀ) = det(A), det(kA) = kⁿ·det(A) for n×n, det(A⁻¹) = 1/det(A), and a triangular matrix's determinant is the product of its diagonal.")) };
  }
  if (mode === "inverse") {
    const r = inverse(A);
    const ok = r.inverse && equalMatrices(multiply(A, r.inverse), identity(A.length));
    return { steps: r.steps, card: h("section", { class: "card" }, h("h2", null, "Result"),
      r.inverse ? h("div", { class: "mx-row" }, matrixView(r.inverse, { label: "A⁻¹" }), matrixView(multiply(A, r.inverse), { label: "A·A⁻¹", diag: true })) : notice("bad", "A is singular (det A = 0), so it has no inverse."),
      r.inverse ? h("p", { class: "muted small" }, ok ? "A·A⁻¹ = I exactly: fractions never round." : "") : null) };
  }
  if (mode === "solve") {
    const r = solveSystem(A, b);
    const n = A[0].length;
    return { steps: r.steps, card: h("section", { class: "card" }, h("h2", null, "Result"),
      h("div", { class: "stats-row" }, stat("rank(A)", r.rankA), stat("rank([A | b])", r.rankAug), stat("Unknowns n", n), stat("Solutions", { unique: "exactly one", infinite: "infinitely many", none: "none" }[r.kind])),
      r.kind === "none" ? notice("bad", "Inconsistent: rank(A) < rank([A | b]).") : h("p", { class: "mono" }, `x = ${vec(r.x)}${r.basis.map((v, i) => ` + t${i + 1}·${vec(v)}`).join("")}`),
      h("p", { class: "muted small" }, "The rank test: if rank(A) < rank([A | b]) there is no solution; if they're equal to n, exactly one; if they're equal but less than n, infinitely many, with n − rank free variables. A homogeneous system Ax = 0 always has the zero solution.")) };
  }
  const r = eigen(A);
  const rows = r.values.map((v) => h("tr", null, h("th", { scope: "row" }, v.text), h("td", null, v.mult), h("td", null, v.im ? "n/a" : v.geometric), h("td", { class: "mono left" }, v.vectors.length ? v.vectors.map((w) => `(${w.join(", ")})`).join(", ") : "complex")));
  const diag = r.values.every((v) => v.im || v.geometric === v.mult) && !r.values.some((v) => v.im);
  return { steps: r.steps, card: h("section", { class: "card" }, h("h2", null, "Result"),
    h("p", null, "Characteristic polynomial: ", h("b", { class: "mono" }, `p(λ) = ${r.steps[1].note.split("p(λ) = ").pop().replace(/\.$/, "")}`)),
    h("div", { class: "table-wrap" }, h("table", { class: "parse" },
      h("thead", null, h("tr", null, ["λ", "Algebraic mult.", "Geometric mult.", "Eigenvectors"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", null, rows))),
    h("div", { class: "stats-row" }, stat("Σλ = tr(A)", r.trace.toString()), stat("Πλ = det(A)", r.det.toString()), stat("Diagonalisable (over ℝ)?", diag ? "Yes" : "No")),
    A.length === 2 ? eigenPicture(A, r) : null,
    h("p", { class: "muted small" }, "More facts: eigenvalues of Aᵏ are λᵏ, of A⁻¹ are 1/λ, of A + cI are λ + c; a triangular matrix's eigenvalues are its diagonal entries; a real symmetric matrix has real eigenvalues.")) };
}

export function render(root) {
  const p = readParams();
  const state = { mode: MODES[p.get("mode")] ? p.get("mode") : "rref", m: p.get("m") ?? null, b: p.get("b") ?? "8,-11,-3" };
  if (!state.m) state.m = DEFAULTS[state.mode];
  let sim = null;

  const head = page({
    subject: "Engineering maths",
    title: "Matrices",
    lede: "Gaussian elimination one row operation at a time, with exact fractions: rank, determinants, inverses, solving systems, and eigenvalues with their eigenvectors.",
    theory: h("div", null,
      h("p", null, "Three ", h("b", null, "row operations"), " never change the solutions of a system: swap two rows, multiply a row by a non-zero number, and add a multiple of one row to another. ", h("b", null, "Gaussian elimination"), " uses them to reach ", h("b", null, "row echelon form"), " (zeros below each pivot); ", h("b", null, "Gauss-Jordan"), " keeps going to ", h("b", null, "reduced"), " form (each pivot 1, zeros above and below)."),
      h("ul", null,
        h("li", null, h("b", null, "Rank"), " is the number of pivots: how many rows (or columns) are linearly independent."),
        h("li", null, h("b", null, "Determinant"), ": a swap flips its sign, scaling a row scales it, and adding a multiple of a row leaves it alone. Once the matrix is triangular, multiply the diagonal."),
        h("li", null, h("b", null, "Inverse"), ": reduce [A | I]; when the left side becomes I, the right side is A⁻¹. If a column has no pivot, A is singular."),
        h("li", null, h("b", null, "Ax = b"), " has a solution exactly when rank(A) = rank([A | b]); it's unique when that rank equals the number of unknowns."),
        h("li", null, h("b", null, "Eigenvalues"), " are the roots of det(A − λI) = 0, and the ", h("b", null, "eigenvectors"), " for λ are the non-zero vectors in the null space of A − λI. Their sum is the trace and their product is the determinant."))),
    conventions: [
      "Every number is an exact fraction, so there is no rounding anywhere in elimination.",
      "The pivot is the first non-zero entry at or below the current row (no largest-pivot search).",
      "Determinant mode never scales rows, so det = (−1)^(swaps) × the product of the diagonal.",
      "Eigenvectors are scaled to the smallest whole numbers with the first non-zero entry positive. Irrational ones are numeric, scaled so the largest entry is 1.",
      "Eigenvalues are exact when rational; otherwise exact surds (for quadratics) or 4 decimal places.",
    ],
  });

  const modeSel = h("select", { "aria-label": "What to do", onchange: (e) => { const old = state.mode; state.mode = e.target.value; if (encodeMatrix(parseMatrixSafe(area.value) ?? []) === DEFAULTS[old] || !area.value.trim()) { state.m = DEFAULTS[state.mode]; area.value = toText(state.m); } update(); } },
    Object.entries(MODES).map(([id, name]) => h("option", { value: id, selected: id === state.mode }, name)));
  const area = h("textarea", { rows: 4, class: "mono mx-input", "aria-label": "Matrix: one row per line", spellcheck: "false", oninput: () => update() }, "");
  area.value = toText(state.m);
  const bIn = h("input", { type: "text", class: "mono", value: state.b, "aria-label": "Right-hand side b", oninput: () => update() });
  const bRow = h("label", { class: "inline" }, "b = ", bIn);
  const msg = h("div"), out = h("div", { class: "output" });

  function parseMatrixSafe(t) { try { return parseMatrix(t); } catch { return null; } }

  function update() {
    sim?.player.destroy(); sim = null;
    bRow.hidden = state.mode !== "solve";
    let A, b = null;
    try {
      A = parseMatrix(area.value, { square: ["det", "inverse", "eigen"].includes(state.mode), max: 5 });
      if (state.mode === "eigen" && (A.length < 2 || A.length > 3)) throw new Error("Eigenvalues here are for 2×2 and 3×3 matrices.");
      if (state.mode === "solve") b = bIn.value.split(/[,\s]+/).filter(Boolean).map((x) => Fraction.parse(x));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    state.m = encodeMatrix(A);
    state.b = b ? b.map((x) => x.toText()).join(",") : state.b;
    writeParams({ mode: state.mode, m: state.m, ...(state.mode === "solve" ? { b: state.b } : {}) });
    msg.replaceChildren();
    let res;
    try { res = summary(state.mode, A, b); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const code = state.mode === "ref" ? CODE.rref : CODE[state.mode];
    sim = simulation(res.steps, code, draw);
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, MODES[state.mode]), sim.el), res.card);
  }

  const randomise = () => {
    const r = Math.random;
    let M;
    if (state.mode === "eigen") M = randomEigenMatrix(r, Math.random() < 0.5 ? 2 : 3).A;
    else if (state.mode === "det" || state.mode === "inverse") M = randomMatrix(r, 3, 3, -3, 4);
    else if (state.mode === "solve") { M = randomMatrix(r, 3, 3, -3, 4); bIn.value = [1, 2, 3].map(() => Math.floor(Math.random() * 11) - 5).join(","); }
    else M = randomMatrix(r, 3, 4, -3, 4);
    area.value = toText(encodeMatrix(M));
    update();
  };

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel),
      h("label", { class: "mx-label-block" }, "Matrix A (one row per line; fractions like 3/4 are fine)", area),
      h("div", { class: "row" }, bRow),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: randomise }, "Random"),
        exampleSelect(EXAMPLES, (ex) => { state.mode = ex.mode; modeSel.value = ex.mode; area.value = toText(ex.m); if (ex.b) bIn.value = ex.b; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const newQuestion = () => practiceCard(practice, {
    intro: "Fresh questions in the GATE style, answered by the same engine. Type fractions like 3/4 if you like.",
    kinds: [["any", "Any type"], ["rank", "Rank"], ["det", "Determinant"], ["detProduct", "det(AB), det(kA⁻¹)"], ["eigenMax", "Eigenvalues (number)"], ["eigenMcq", "Eigenvalues (options)"], ["solution", "Number of solutions"]],
    make: (r, kind) => makeQuestion(r, kind),
  });

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  void fromText;
  return () => sim?.player.destroy();
}
