// Matrices with exact fractions: Gaussian elimination to row echelon form and
// RREF, rank, determinant, inverse, solving Ax = b, and eigenvalues and
// eigenvectors of 2x2 and 3x3 matrices. Every row operation is a step with a
// pseudocode line, live variables and a note saying why.
//
// Conventions (stated in the UI):
// - The pivot is the first non-zero entry at or below the current row (no
//   "largest pivot" search; with exact fractions there's no rounding to avoid).
// - Determinant: elimination without scaling rows, so det = (−1)^swaps × the
//   product of the diagonal.
// - Eigenvalues are exact when they're rational; otherwise they're shown to
//   4 decimal places, with the exact surd form for real quadratics.
import { Fraction, F, fracSqrt } from "./fraction.js";

const Z = Fraction.ZERO, ONE = Fraction.ONE;
export const MAX = 5;

// --- Parsing and helpers --------------------------------------------------------------

// "1 2; 3 4", "1,2\n3,4" or "[[1,2],[3,4]]" → Fraction[][].
export function parseMatrix(text, { square = false, max = MAX } = {}) {
  const clean = String(text).replace(/[[\]]/g, (c) => (c === "]" ? ";" : " ")).trim();
  const rows = clean.split(/[;\n]+/).map((r) => r.trim()).filter(Boolean)
    .map((r) => r.split(/[\s,]+/).filter(Boolean).map((x) => Fraction.parse(x)));
  if (!rows.length) throw new Error("Type a matrix: one row per line (or separate rows with ;).");
  const n = rows[0].length;
  if (rows.some((r) => r.length !== n)) throw new Error("Every row needs the same number of entries.");
  if (rows.length > max || n > max + 1) throw new Error(`Keep it to at most ${max} rows and ${max} columns.`);
  if (square && rows.length !== n) throw new Error(`This needs a square matrix; yours is ${rows.length}×${n}.`);
  return rows;
}

export const encodeMatrix = (M) => M.map((r) => r.map((x) => Fraction.from(x).toText()).join(",")).join(";");
export const toFractions = (M) => M.map((r) => r.map((x) => Fraction.from(x)));
const copy = (M) => M.map((r) => [...r]);
export const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? ONE : Z)));
export function multiply(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s.add(a.mul(B[k][j])), Z)));
}
export const equalMatrices = (A, B) => A.length === B.length && A.every((r, i) => r.length === B[i].length && r.every((x, j) => x.equals(B[i][j])));
const showRowOp = (k, m, r) => (m.sign() < 0 ? `R${k + 1} ← R${k + 1} + ${coef(m.neg())}R${r + 1}` : `R${k + 1} ← R${k + 1} − ${coef(m)}R${r + 1}`);
const coef = (m) => (m.equals(ONE) ? "" : m.isInteger() ? `${m}·` : `(${m})·`);
const vecText = (v) => `(${v.map(String).join(", ")})`;

// --- Gaussian elimination -------------------------------------------------------------

export const CODE = {
  rref: [
    "r ← 1  // the row the next pivot goes in",
    "for each column c, left to right",
    "  i ← first row ≥ r with A[i][c] ≠ 0  // the pivot",
    "  if there is none: no pivot in column c  // a free column",
    "  if i ≠ r: swap R_i and R_r",
    "  R_r ← R_r ÷ A[r][c]  // make the pivot 1 (RREF only)",
    "  for every other row k: R_k ← R_k − A[k][c]·R_r  // clear the column",
    "  r ← r + 1",
    "rank ← number of pivots",
  ],
  det: [
    "sign ← 1",
    "for each column c",
    "  i ← first row ≥ c with A[i][c] ≠ 0",
    "  if there is none: det ← 0; stop  // a column of zeros under the diagonal",
    "  if i ≠ c: swap R_i and R_c; sign ← −sign  // a swap flips the sign",
    "  for each row k below c: R_k ← R_k − m·R_c, m = A[k][c] ÷ A[c][c]  // det unchanged",
    "det ← sign × a₁₁·a₂₂·…·aₙₙ  // triangular: product of the diagonal",
  ],
  inverse: [
    "write [A | I]",
    "for each column c",
    "  i ← first row ≥ c with A[i][c] ≠ 0",
    "  if there is none: A is singular; stop",
    "  if i ≠ c: swap R_i and R_c",
    "  R_c ← R_c ÷ A[c][c]  // pivot becomes 1",
    "  for every other row k: R_k ← R_k − A[k][c]·R_c",
    "the left block is I, so the right block is A⁻¹",
  ],
  solve: [
    "write the augmented matrix [A | b]",
    "for each column c of A",
    "  i ← first row ≥ r with a non-zero in column c",
    "  if there is none: x_c is a free variable",
    "  if i ≠ r: swap R_i and R_r",
    "  R_r ← R_r ÷ pivot; clear the rest of column c",
    "compare rank(A) with rank([A | b])  // a row 0 … 0 | k ≠ 0 means no solution",
    "rank(A) = rank([A|b]) = n: unique; < n: infinitely many",
    "read x off the reduced rows  // free variables become parameters",
  ],
  eigen: [
    "p(λ) ← det(A − λI)  // the characteristic polynomial",
    "2×2: p(λ) = λ² − tr(A)·λ + det(A)",
    "3×3: p(λ) = λ³ − tr(A)·λ² + (sum of principal 2×2 minors)·λ − det(A)",
    "eigenvalues ← roots of p(λ)  // rational root test first, then the formula",
    "for each eigenvalue λ:",
    "  reduce A − λI to RREF",
    "  eigenvectors ← its null space  // solve (A − λI)v = 0",
    "check: Σλ = tr(A) and Πλ = det(A)",
  ],
};

// Row reduction with a step after every operation. opts.reduced gives RREF,
// opts.scale scales pivots to 1, opts.cols limits pivot search to the first
// cols columns (so the right-hand side of [A | b] never gets a pivot of its own).
function eliminate(M0, { reduced = true, scale = true, cols = M0[0].length, mode = "rref", aug = 0, steps, at }) {
  const M = copy(M0), rows = M.length;
  let r = 0, swaps = 0;
  const pivots = [];
  const snap = (extra) => steps.push({ matrix: copy(M), aug, ...extra });
  for (let c = 0; c < cols && r < rows; c++) {
    let i = r;
    while (i < rows && M[i][c].isZero()) i++;
    if (i === rows) {
      snap({ line: at.none, pivot: null, col: c, rows: [], op: `no pivot in column ${c + 1}`,
        vars: { r: r + 1, c: c + 1, rank: pivots.length, swaps },
        note: mode === "det"
          ? `Column ${c + 1} has only zeros on and below the diagonal, so the matrix is singular: det = 0.`
          : mode === "solve" ? `Column ${c + 1} has no pivot at or below row ${r + 1}, so x${c + 1} is a free variable: it can take any value.`
          : mode === "inverse" ? `Column ${c + 1} has no non-zero entry at or below row ${r + 1}, so A can't be reduced to I: it is singular and has no inverse.`
          : `Column ${c + 1} has no non-zero entry at or below row ${r + 1}, so it gets no pivot. Move on to the next column.` });
      if (mode === "det" || mode === "inverse") return { M, pivots, swaps, singular: true };
      continue;
    }
    if (i !== r) {
      [M[i], M[r]] = [M[r], M[i]];
      swaps++;
      snap({ line: at.swap, pivot: [r, c], col: c, rows: [i, r], op: `R${r + 1} ↔ R${i + 1}`,
        vars: { r: r + 1, c: c + 1, pivot: M[r][c], swaps, ...(mode === "det" ? { sign: swaps % 2 ? -1 : 1 } : {}) },
        note: `The entry in row ${r + 1}, column ${c + 1} is 0, so swap in row ${i + 1}, the first row below with a non-zero there.${mode === "det" ? " Swapping two rows flips the sign of the determinant." : ""}` });
    } else {
      snap({ line: at.pick, pivot: [r, c], col: c, rows: [r], op: `pivot ${M[r][c]} at (${r + 1}, ${c + 1})`,
        vars: { r: r + 1, c: c + 1, pivot: M[r][c], swaps },
        note: `The pivot for column ${c + 1} is ${M[r][c]}, in row ${r + 1}. Everything ${reduced ? "else" : "below it"} in column ${c + 1} will be cleared to 0 using this row.` });
    }
    if (scale && !M[r][c].equals(ONE)) {
      const p = M[r][c];
      M[r] = M[r].map((x) => x.div(p));
      snap({ line: at.scale, pivot: [r, c], col: c, rows: [r], op: `R${r + 1} ← R${r + 1} ÷ ${p.d === 1n ? p : `(${p})`}`,
        vars: { r: r + 1, c: c + 1, pivot: M[r][c], divisor: p, swaps },
        note: `Divide row ${r + 1} by ${p} so the pivot becomes 1. In reduced row echelon form every pivot is 1.` });
    }
    for (let k = 0; k < rows; k++) {
      if (k === r || (!reduced && k < r) || M[k][c].isZero()) continue;
      const m = M[k][c].div(M[r][c]);
      M[k] = M[k].map((x, j) => x.sub(m.mul(M[r][j])));
      snap({ line: at.clear, pivot: [r, c], col: c, rows: [k], op: showRowOp(k, m, r),
        vars: { r: r + 1, c: c + 1, k: k + 1, m, swaps },
        note: `Row ${k + 1} has ${m.mul(M[r][c])} in column ${c + 1}. Subtract ${m} × row ${r + 1} (m = ${m.mul(M[r][c])} ÷ ${M[r][c]}) to make it 0.${mode === "det" ? " Adding a multiple of one row to another leaves the determinant unchanged." : ""}` });
    }
    pivots.push([r, c]);
    r++;
  }
  return { M, pivots, swaps, singular: false };
}

const AT = {
  rref: { pick: 3, none: 4, swap: 5, scale: 6, clear: 7, done: 9 },
  det: { pick: 3, none: 4, swap: 5, scale: 6, clear: 6, done: 7 },
  inverse: { pick: 3, none: 4, swap: 5, scale: 6, clear: 7, done: 8 },
  solve: { pick: 3, none: 4, swap: 5, scale: 6, clear: 6, done: 7 },
};

// Row echelon form (reduced = false) or RREF, with the rank.
export function rowReduce(A, { reduced = true } = {}) {
  A = toFractions(A);
  const steps = [{ matrix: copy(A), aug: 0, line: 1, pivot: null, rows: [], op: "start", vars: { rows: A.length, cols: A[0].length }, note: `A ${A.length}×${A[0].length} matrix. Work column by column, making a pivot and clearing ${reduced ? "everything else in its column" : "the entries below it"}.` }];
  const { M, pivots } = eliminate(A, { reduced, scale: reduced, steps, at: AT.rref, mode: "rref" });
  const rank = pivots.length;
  steps.push({ matrix: copy(M), aug: 0, line: AT.rref.done, pivot: null, rows: [], op: "done", done: true, pivotCells: pivots,
    vars: { rank, pivots: pivots.map(([, c]) => `col ${c + 1}`) },
    note: `${reduced ? "Reduced row echelon form" : "Row echelon form"} reached. There ${rank === 1 ? "is 1 pivot" : `are ${rank} pivots`}, so rank(A) = ${rank}${rank === Math.min(A.length, A[0].length) ? " (full rank)" : `, less than min(${A.length}, ${A[0].length}) = ${Math.min(A.length, A[0].length)}`}. Rows of zeros show dependent rows.` });
  return { matrix: M, rank, pivots, steps };
}
export const rank = (A) => rowReduce(A, { reduced: false }).rank;

export function determinant(A) {
  A = toFractions(A);
  if (A.length !== A[0].length) throw new Error("The determinant needs a square matrix.");
  const n = A.length;
  const steps = [{ matrix: copy(A), aug: 0, line: 1, pivot: null, rows: [], op: "start", vars: { n, sign: 1 }, note: "Reduce to upper triangular form using only row swaps and 'add a multiple of another row', then multiply the diagonal." }];
  const { M, swaps, singular } = eliminate(A, { reduced: false, scale: false, steps, at: AT.det, mode: "det" });
  let det;
  if (singular) det = Z;
  else {
    const prod = M.reduce((p, row, i) => p.mul(row[i]), ONE);
    det = swaps % 2 ? prod.neg() : prod;
    steps.push({ matrix: copy(M), aug: 0, line: AT.det.done, pivot: null, rows: [], op: "done", done: true, diag: true,
      vars: { swaps, sign: swaps % 2 ? -1 : 1, det },
      note: `Upper triangular. det = ${swaps % 2 ? "−" : ""}(${M.map((r, i) => r[i]).join(") × (")}) = ${det}${swaps ? ` (${swaps} swap${swaps > 1 ? "s" : ""}, so the sign is ${swaps % 2 ? "flipped" : "back to +"})` : ""}.` });
  }
  if (singular) steps.at(-1).done = true;
  return { det, steps };
}

export function inverse(A) {
  A = toFractions(A);
  const n = A.length;
  if (n !== A[0].length) throw new Error("Only square matrices have inverses.");
  const aug = A.map((r, i) => [...r, ...identity(n)[i]]);
  const steps = [{ matrix: copy(aug), aug: n, line: 1, pivot: null, rows: [], op: "start", vars: { n }, note: "Put the identity beside A. Every row operation that turns A into I turns I into A⁻¹." }];
  const { M, singular } = eliminate(aug, { reduced: true, scale: true, cols: n, steps, at: AT.inverse, mode: "inverse" });
  if (singular) return { inverse: null, steps };
  const inv = M.map((r) => r.slice(n));
  steps.push({ matrix: copy(M), aug: n, line: AT.inverse.done, pivot: null, rows: [], op: "done", done: true, vars: { "A⁻¹": "right block" }, note: "The left block is now I, so the right block is A⁻¹. Check: A·A⁻¹ = I." });
  return { inverse: inv, steps };
}

// Null space basis of an RREF matrix (cols columns), as exact vectors.
function nullBasis(R, cols) {
  const pivotCols = [];
  for (const row of R) { const c = row.findIndex((x) => !x.isZero()); if (c >= 0 && c < cols) pivotCols.push(c); }
  const free = [...Array(cols).keys()].filter((c) => !pivotCols.includes(c));
  return free.map((f) => {
    const v = Array(cols).fill(Z);
    v[f] = ONE;
    pivotCols.forEach((pc, i) => { v[pc] = R[i][f].neg(); });
    return v;
  });
}

// Scale a rational vector to the smallest integer one pointing the same way.
export function integerVector(v) {
  let l = 1n;
  const g = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  for (const x of v) l = (l * x.d) / g(l, x.d);
  let w = v.map((x) => x.mul(new Fraction(l)));
  let d = 0n;
  for (const x of w) d = g(d, x.n);
  if (d > 1n) w = w.map((x) => x.div(new Fraction(d)));
  const first = w.find((x) => !x.isZero());
  if (first && first.sign() < 0) w = w.map((x) => x.neg());
  return w;
}

export function solveSystem(A, b) {
  A = toFractions(A); b = b.map((x) => Fraction.from(x));
  const m = A.length, n = A[0].length;
  if (b.length !== m) throw new Error(`b needs ${m} entries, one per equation.`);
  const aug = A.map((r, i) => [...r, b[i]]);
  const steps = [{ matrix: copy(aug), aug: 1, line: 1, pivot: null, rows: [], op: "start", vars: { equations: m, unknowns: n }, note: `${m} equation${m > 1 ? "s" : ""} in ${n} unknown${n > 1 ? "s" : ""}. Reduce [A | b]; the last column is never a pivot column of A.` }];
  const { M, pivots } = eliminate(aug, { reduced: true, scale: true, cols: n, steps, at: AT.solve, mode: "solve" });
  const rankA = pivots.length;
  const bad = M.findIndex((row) => row.slice(0, n).every((x) => x.isZero()) && !row[n].isZero());
  const rankAug = rankA + (bad >= 0 ? 1 : 0);
  let kind, x = null, basis = [], text;
  if (bad >= 0) {
    kind = "none";
    text = `Row ${bad + 1} reads 0 = ${M[bad][n]}, which is impossible. rank(A) = ${rankA} < rank([A | b]) = ${rankAug}, so the system is inconsistent: no solution.`;
  } else {
    const particular = Array(n).fill(Z);
    pivots.forEach(([r, c]) => { particular[c] = M[r][n]; });
    x = particular;
    basis = nullBasis(M.map((r) => r.slice(0, n)), n);
    if (rankA === n) {
      kind = "unique";
      text = `rank(A) = rank([A | b]) = ${rankA} = n (the number of unknowns), so there is exactly one solution: x = ${vecText(x)}.`;
    } else {
      kind = "infinite";
      text = `rank(A) = rank([A | b]) = ${rankA} < n = ${n}, so ${n - rankA} variable${n - rankA > 1 ? "s are" : " is"} free and there are infinitely many solutions: x = ${vecText(x)}${basis.map((v, i) => ` + t${i + 1}${vecText(v)}`).join("")}.`;
    }
  }
  steps.push({ matrix: copy(M), aug: 1, line: kind === "none" ? 7 : 8, pivot: null, rows: bad >= 0 ? [bad] : [], op: "classify", vars: { "rank(A)": rankA, "rank([A|b])": rankAug, n, kind }, note: text });
  steps.push({ matrix: copy(M), aug: 1, line: kind === "none" ? 7 : 9, pivot: null, rows: [], op: "done", done: true, vars: { kind, ...(x ? { x: x.map(String) } : {}) }, note: kind === "none" ? "No solution: the equations contradict each other." : text });
  return { kind, rankA, rankAug, x, basis, steps, matrix: M };
}

// --- Eigenvalues ----------------------------------------------------------------------

export const trace = (A) => A.reduce((s, r, i) => s.add(Fraction.from(r[i])), Z);

// Coefficients of det(λI − A), highest power first (monic).
export function charPoly(A) {
  A = toFractions(A);
  const n = A.length;
  const det = determinant(A).det, tr = trace(A);
  if (n === 1) return [ONE, A[0][0].neg()];
  if (n === 2) return [ONE, tr.neg(), det];
  if (n === 3) {
    const minor = (i, j) => A[i][i].mul(A[j][j]).sub(A[i][j].mul(A[j][i]));
    const m2 = minor(0, 1).add(minor(0, 2)).add(minor(1, 2));
    return [ONE, tr.neg(), m2, det.neg()];
  }
  throw new Error("Eigenvalues here are for 2×2 and 3×3 matrices.");
}

const evalPoly = (c, x) => c.reduce((s, a) => s.mul(x).add(a), Z);
const evalPolyNum = (c, x) => c.reduce((s, a) => s * x + a.toNumber(), 0);

export function polyText(c, v = "λ") {
  const deg = c.length - 1;
  const parts = [];
  c.forEach((a, i) => {
    const p = deg - i;
    if (a.isZero()) return;
    const mag = a.abs(), sign = a.sign() < 0 ? "−" : "+";
    const body = p === 0 ? `${mag}` : `${mag.equals(ONE) ? "" : mag.d === 1n ? mag : `(${mag})`}${v}${p > 1 ? ["", "", "²", "³", "⁴", "⁵", "⁶"][p] : ""}`;
    parts.push(parts.length ? ` ${sign} ${body}` : `${sign === "−" ? "−" : ""}${body}`);
  });
  return parts.join("") || "0";
}

// The two roots of ax² + bx + k with an irrational discriminant, as
// "(p + s√t)/q" and "(p − s√t)/q" in lowest terms.
function surdText(a, b, k) {
  const g = (x, y) => { x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x; };
  let l = 1n;
  for (const x of [a, b, k]) l = (l * x.d) / g(l, x.d);
  let [A, B, K] = [a, b, k].map((x) => x.mul(new Fraction(l)).n);
  if (A < 0n) { A = -A; B = -B; K = -K; }
  const D = B * B - 4n * A * K;
  let s = 1n, t = D;
  for (let f = 2n; f * f <= t; f++) while (t % (f * f) === 0n) { t /= f * f; s *= f; }
  let p = -B, q = 2n * A;
  const d = g(g(p, s), q);
  p /= d; s /= d; q /= d;
  const root = `${s === 1n ? "" : s}√${t}`;
  const one = (sign) => {
    const top = p === 0n ? (sign === "+" ? root : `−${root}`) : `${String(p).replace("-", "−")} ${sign === "+" ? "+" : "−"} ${root}`;
    return q === 1n ? top : `(${top})/${q}`;
  };
  return [one("+"), one("−")];
}

function divisors(n) {
  n = n < 0n ? -n : n;
  const out = [];
  for (let d = 1n; d * d <= n; d++) if (n % d === 0n) { out.push(d); if (d * d !== n) out.push(n / d); }
  return out;
}

// Roots of a polynomial with rational coefficients (degree ≤ 3): rational ones
// exactly, the rest from the quadratic formula (as numbers, with a surd text).
export function polyRoots(coeffs) {
  let c = coeffs.map((x) => Fraction.from(x));
  while (c.length > 1 && c[0].isZero()) c = c.slice(1);
  const roots = [];
  const trail = [];
  // Pull out rational roots by the rational root test.
  for (;;) {
    if (c.length <= 1) break;
    if (c.at(-1).isZero()) { roots.push({ exact: Z }); trail.push("0 is a root (no constant term)"); c = c.slice(0, -1); continue; }
    if (c.length <= 3 && c.length === 3) break;
    if (c.length === 2) { const r = c[1].neg().div(c[0]); roots.push({ exact: r }); trail.push(`linear factor gives λ = ${r}`); c = [ONE]; break; }
    let l = 1n;
    const g = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
    for (const x of c) l = (l * x.d) / g(l, x.d);
    const ints = c.map((x) => x.mul(new Fraction(l)).n);
    let found = null;
    outer: for (const p of divisors(ints.at(-1))) for (const q of divisors(ints[0])) for (const s of [1n, -1n]) {
      const cand = new Fraction(s * p, q);
      if (evalPoly(c, cand).isZero()) { found = cand; break outer; }
    }
    if (!found) break;
    roots.push({ exact: found });
    trail.push(`rational root test: p(${found}) = 0`);
    // Synthetic division by (λ − found).
    const q = [c[0]];
    for (let i = 1; i < c.length - 1; i++) q.push(c[i].add(q[i - 1].mul(found)));
    c = q;
  }
  if (c.length === 3) {
    const [a, b, k] = c;
    const D = b.mul(b).sub(a.mul(k).mul(F(4)));
    const s = fracSqrt(D);
    const two = a.mul(F(2));
    if (s) {
      roots.push({ exact: b.neg().add(s).div(two) }, { exact: b.neg().sub(s).div(two) });
      trail.push(`quadratic formula, discriminant ${D} = (${s})²`);
    } else if (D.sign() > 0) {
      const re = b.neg().div(two), rad = Math.sqrt(D.toNumber()) / two.toNumber();
      const [plus, minus] = surdText(a, b, k);
      roots.push({ value: re.toNumber() + Math.abs(rad), surd: plus, irrational: true }, { value: re.toNumber() - Math.abs(rad), surd: minus, irrational: true });
      trail.push(`quadratic formula, discriminant ${D} is not a perfect square, so the roots are irrational`);
    } else if (D.sign() < 0) {
      const re = b.neg().div(two).toNumber(), im = Math.sqrt(-D.toNumber()) / Math.abs(two.toNumber());
      roots.push({ value: re, im }, { value: re, im: -im });
      trail.push(`quadratic formula, discriminant ${D} < 0, so the roots are complex`);
    }
  } else if (c.length === 4) {
    // Irreducible cubic over the rationals: three real roots or one; find numerically.
    for (const x of cubicRootsNumeric(c)) roots.push(x);
    trail.push("no rational root; solved numerically");
  }
  for (const r of roots) {
    if (r.exact) { r.value = r.exact.toNumber(); r.im = 0; r.text = String(r.exact); }
    else if (r.im) {
      const im = Math.abs(r.im), imText = `${Math.abs(im - 1) < 1e-12 ? "" : fmt4(im)}i`;
      r.text = Math.abs(r.value) < 1e-12 ? `${r.im < 0 ? "−" : ""}${imText}` : `${fmt4(r.value)} ${r.im < 0 ? "−" : "+"} ${imText}`;
    }
    else { r.im = 0; r.text = r.surd ?? fmt4(r.value); }
  }
  // Group repeated roots.
  const out = [];
  for (const r of roots) {
    const same = out.find((x) => (x.exact && r.exact ? x.exact.equals(r.exact) : Math.abs(x.value - r.value) < 1e-9 && Math.abs(x.im - r.im) < 1e-9));
    if (same) same.mult++;
    else out.push({ ...r, mult: 1 });
  }
  return { roots: out, trail };
}
export const fmt4 = (x) => (Math.abs(x - Math.round(x)) < 1e-12 ? String(Math.round(x)) : x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")).replace("-", "−");

function cubicRootsNumeric(c) {
  const a = c.map((x) => x.toNumber());
  const f = (x) => ((a[0] * x + a[1]) * x + a[2]) * x + a[3];
  const df = (x) => (3 * a[0] * x + 2 * a[1]) * x + a[2];
  // Critical points split the line into monotone pieces; bisect each sign change.
  const disc = 4 * a[1] * a[1] - 12 * a[0] * a[2];
  const crit = disc > 0 ? [(-2 * a[1] - Math.sqrt(disc)) / (6 * a[0]), (-2 * a[1] + Math.sqrt(disc)) / (6 * a[0])].sort((x, y) => x - y) : [];
  const B = 1 + Math.max(...a.slice(1).map((x) => Math.abs(x / a[0])));
  const pts = [-B, ...crit, B];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let lo = pts[i], hi = pts[i + 1];
    if (Math.sign(f(lo)) === Math.sign(f(hi))) continue;
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid; }
    out.push({ value: (lo + hi) / 2, irrational: true });
  }
  if (out.length === 1) {
    // One real root: divide it out and the quadratic left has complex roots.
    const r = out[0].value;
    const q1 = a[0], q2 = a[1] + r * q1, q3 = a[2] + r * q2;
    const D = q2 * q2 - 4 * q1 * q3, re = -q2 / (2 * q1), im = Math.sqrt(Math.max(0, -D)) / (2 * Math.abs(q1));
    out.push({ value: re, im }, { value: re, im: -im });
  }
  void df;
  return out;
}

// Floating-point null space for irrational eigenvalues (one free column).
function numericNullVector(A, lambda) {
  const n = A.length;
  const M = A.map((r, i) => r.map((x, j) => x.toNumber() - (i === j ? lambda : 0)));
  const piv = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let best = r;
    for (let i = r + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    if (Math.abs(M[best][c]) < 1e-9) continue;
    [M[best], M[r]] = [M[r], M[best]];
    const p = M[r][c];
    M[r] = M[r].map((x) => x / p);
    for (let k = 0; k < n; k++) if (k !== r) { const m = M[k][c]; M[k] = M[k].map((x, j) => x - m * M[r][j]); }
    piv.push(c); r++;
  }
  const free = [...Array(n).keys()].find((c) => !piv.includes(c));
  if (free === undefined) return null;
  const v = Array(n).fill(0);
  v[free] = 1;
  piv.forEach((pc, i) => { v[pc] = -M[i][free]; });
  return v;
}

export function eigen(A) {
  A = toFractions(A);
  const n = A.length;
  if (n !== A[0].length || n < 2 || n > 3) throw new Error("Eigenvalues here are for 2×2 and 3×3 matrices.");
  const steps = [];
  const tr = trace(A), det = determinant(A).det;
  const p = charPoly(A);
  const symbolic = A.map((r, i) => r.map((x, j) => (i === j ? `${x} − λ` : String(x))));
  steps.push({ matrix: copy(A), sym: symbolic, aug: 0, line: 1, pivot: null, rows: [], op: "A − λI", vars: { n }, note: "Subtract λ from every diagonal entry. The eigenvalues are the λ that make A − λI singular, so det(A − λI) = 0." });
  let m2 = null;
  if (n === 3) {
    const minor = (i, j) => A[i][i].mul(A[j][j]).sub(A[i][j].mul(A[j][i]));
    m2 = minor(0, 1).add(minor(0, 2)).add(minor(1, 2));
  }
  steps.push({ matrix: copy(A), sym: symbolic, aug: 0, line: n === 2 ? 2 : 3, pivot: null, rows: [], op: "p(λ)", vars: { "tr(A)": tr, ...(m2 ? { "Σ minors": m2 } : {}), "det(A)": det },
    note: n === 2
      ? `For a 2×2 matrix, det(A − λI) = λ² − (a + d)λ + (ad − bc). Here tr(A) = ${tr} and det(A) = ${det}, so p(λ) = ${polyText(p)}.`
      : `For a 3×3 matrix, det(λI − A) = λ³ − tr(A)λ² + Mλ − det(A), where M is the sum of the three principal 2×2 minors. tr(A) = ${tr}, M = ${m2}, det(A) = ${det}, so p(λ) = ${polyText(p)}.` });
  const { roots, trail } = polyRoots(p);
  steps.push({ matrix: copy(A), aug: 0, line: 4, pivot: null, rows: [], op: "roots", vars: { "p(λ)": polyText(p), eigenvalues: roots.map((r) => (r.mult > 1 ? `${r.text} (×${r.mult})` : r.text)) },
    note: `Solve p(λ) = 0: ${trail.join("; ")}. Eigenvalues: ${roots.map((r) => `${r.text}${r.mult > 1 ? ` (repeated ${r.mult} times)` : ""}`).join(", ")}.` });
  const values = [];
  for (const r of roots) {
    const entry = { ...r, vectors: [], geometric: 0 };
    if (r.exact) {
      const B = A.map((row, i) => row.map((x, j) => (i === j ? x.sub(r.exact) : x)));
      const red = rowReduce(B);
      const basis = nullBasis(red.matrix, n).map(integerVector);
      entry.vectors = basis.map((v) => v.map(String));
      entry.exactVectors = basis;
      entry.geometric = basis.length;
      steps.push({ matrix: copy(B), aug: 0, line: 6, pivot: null, rows: [], op: `A − (${r.text})I`, lambda: r.text, vars: { "λ": r.text, "rank(A − λI)": red.rank, "free variables": n - red.rank },
        note: `For λ = ${r.text}: A − λI has rank ${red.rank}, so its null space has dimension ${n} − ${red.rank} = ${n - red.rank}. That's the geometric multiplicity.` });
      steps.push({ matrix: copy(red.matrix), aug: 0, line: 7, pivot: null, rows: [], op: "null space", lambda: r.text, pivotCells: red.pivots,
        vars: { "λ": r.text, eigenvectors: basis.map((v) => vecText(v)) },
        note: `RREF of A − ${r.text}I. Set each free variable to 1 in turn and solve for the pivot variables: eigenvector${basis.length > 1 ? "s" : ""} ${basis.map(vecText).join(" and ")} (any non-zero multiple works).${r.mult > basis.length ? ` Algebraic multiplicity ${r.mult} > geometric ${basis.length}, so A is not diagonalisable.` : ""}` });
    } else if (!r.im) {
      const v = numericNullVector(A, r.value);
      if (v) {
        const big = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
        const w = v.map((x) => x / big);
        entry.vectors = [w.map(fmt4)];
        entry.numericVectors = [w];
        entry.geometric = 1;
      }
      steps.push({ matrix: copy(A), aug: 0, line: 7, pivot: null, rows: [], op: "null space", lambda: r.text, vars: { "λ": `${r.text} ≈ ${fmt4(r.value)}`, eigenvector: entry.vectors.map((x) => `(${x.join(", ")})`) },
        note: `λ = ${r.text} is irrational, so solve (A − λI)v = 0 numerically: v ≈ (${entry.vectors[0]?.join(", ")}), scaled so its largest entry is 1.` });
    } else {
      steps.push({ matrix: copy(A), aug: 0, line: 5, pivot: null, rows: [], op: "complex", lambda: r.text, vars: { "λ": r.text },
        note: `λ = ${r.text} is complex. Its eigenvectors have complex entries too; a real matrix with complex eigenvalues rotates every real vector, so no real direction is just stretched.` });
    }
    values.push(entry);
  }
  const all = values.flatMap((v) => Array(v.mult).fill(v));
  const sum = all.reduce((s, v) => s + v.value, 0), prod = all.reduce((acc, v) => {
    const [a, b] = acc; return [a * v.value - b * v.im, a * v.im + b * v.value];
  }, [1, 0])[0];
  steps.push({ matrix: copy(A), aug: 0, line: 8, pivot: null, rows: [], op: "check", done: true,
    vars: { "Σλ": fmt4(sum), "tr(A)": tr, "Πλ": fmt4(prod), "det(A)": det },
    note: `Check: the eigenvalues add up to ${fmt4(sum)} = tr(A) = ${tr}, and multiply to ${fmt4(prod)} = det(A) = ${det}. ${det.isZero() ? "det(A) = 0, so 0 is an eigenvalue and A is singular." : "No eigenvalue is 0, so A is invertible."}` });
  return { poly: p, values, trace: tr, det, steps, sum, product: prod };
}

// --- Random matrices for practice -----------------------------------------------------

const rint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export function randomMatrix(r, rows, cols = rows, lo = -4, hi = 5) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => F(rint(r, lo, hi))));
}
// A rows×cols integer matrix of rank exactly k (or less, rarely; callers check).
export function randomRankMatrix(r, rows, cols, k) {
  const B = randomMatrix(r, rows, k, -2, 3), C = randomMatrix(r, k, cols, -2, 3);
  return multiply(B, C);
}
// Unimodular P (det ±1) as a product of unit triangular integer matrices.
function unimodular(r, n) {
  const L = identity(n).map((row, i) => row.map((x, j) => (j < i ? F(rint(r, -1, 1)) : x)));
  const U = identity(n).map((row, i) => row.map((x, j) => (j > i ? F(rint(r, -1, 1)) : x)));
  return multiply(L, U);
}
// An integer matrix with integer eigenvalues: P·D·P⁻¹ with P unimodular.
export function randomEigenMatrix(r, n, values = null) {
  const P = unimodular(r, n), Pi = inverse(P).inverse;
  const vals = values ?? Array.from({ length: n }, () => rint(r, -3, 5));
  const D = identity(n).map((row, i) => row.map((x, j) => (i === j ? F(vals[i]) : x)));
  return { A: multiply(multiply(P, D), Pi), values: vals };
}

export const EXAMPLES = {
  rank3: { name: "3×4, rank 2 (dependent rows)", mode: "rref", m: "1,2,1,3;2,4,0,2;3,6,1,5" },
  det3: { name: "3×3 determinant (needs a swap)", mode: "det", m: "0,2,1;1,3,2;2,1,4" },
  inv3: { name: "3×3 inverse", mode: "inverse", m: "2,1,1;1,3,2;1,0,0" },
  unique: { name: "System with a unique solution", mode: "solve", m: "2,1,-1;-3,-1,2;-2,1,2", b: "8,-11,-3" },
  infinite: { name: "System with infinitely many solutions", mode: "solve", m: "1,1,1;1,2,3;2,3,4", b: "6,14,20" },
  none: { name: "Inconsistent system", mode: "solve", m: "1,1,1;1,2,3;2,3,4", b: "6,14,21" },
  eig2: { name: "2×2 eigen: [[4,1],[2,3]]", mode: "eigen", m: "4,1;2,3" },
  eig3: { name: "3×3 eigen with a repeated value", mode: "eigen", m: "3,1,1;1,3,1;1,1,3" },
  sym3: { name: "3×3 symmetric: [[2,0,0],[0,3,4],[0,4,9]]", mode: "eigen", m: "2,0,0;0,3,4;0,4,9" },
  defective: { name: "Not diagonalisable: [[2,1],[0,2]]", mode: "eigen", m: "2,1;0,2" },
  irrational: { name: "Irrational eigenvalues: [[1,2],[3,4]]", mode: "eigen", m: "1,2;3,4" },
  rotation: { name: "Complex eigenvalues (a rotation)", mode: "eigen", m: "0,-1;1,0" },
};
