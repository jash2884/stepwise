// GATE question generators for this subject. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer comes from the same engines the visualisers run.
import { pick, int, round2, show, shuffle, query, mcq } from "./kit.js";
import { F, Fraction } from "../engines/fraction.js";
import { determinant, eigen, encodeMatrix, inverse, multiply, randomEigenMatrix, randomMatrix, randomRankMatrix, rowReduce, solveSystem } from "../engines/matrices.js";
import { bayes, distribution, randomVariable, sampleSpace, EVENTS, Phi } from "../engines/probability.js";
import { parse, print } from "../engines/expr.js";
import { extrema, integral, limit, mvt } from "../engines/calculus.js";
import { TOPICS as APT, makeQuestion } from "../engines/aptitude.js";

const mtable = (M) => ({ table: { head: M[0].map((_, j) => `c${j + 1}`), rows: M.map((r) => r.map(String)) } });
const mtext = (M) => `[${M.map((r) => r.map(String).join(", ")).join("; ")}]`;
const near = (x) => round2(x);

// --- Matrices ---------------------------------------------------------------------------

export function matrices(r, only = null) {
  const kind = only ?? pick(r, ["rank", "det", "detProduct", "eigenMax", "eigenMcq", "solution"]);
  if (kind === "rank") {
    const rows = int(r, 3, 4), cols = int(r, 3, 4), k = int(r, 1, Math.min(rows, cols));
    const A = randomRankMatrix(r, rows, cols, k);
    const res = rowReduce(A, { reduced: false });
    if (A.flat().every((x) => x.isZero())) return null;
    return {
      topic: "matrices", type: "nat", marks: 1, answer: res.rank, tolerance: 0,
      stem: [`What is the rank of the following ${rows}×${cols} matrix?`, mtable(A)],
      solution: [`Row reduce to echelon form: ${res.rank} non-zero row${res.rank === 1 ? "" : "s"} (pivots in column${res.pivots.length === 1 ? "" : "s"} ${res.pivots.map(([, c]) => c + 1).join(", ")}).`, `Echelon form: ${mtext(res.matrix)}.`, `So the rank is ${res.rank}.`],
      replay: query("/matrices", { mode: "rref", m: encodeMatrix(A) }),
    };
  }
  if (kind === "det") {
    const A = randomMatrix(r, 3, 3, -3, 4);
    const { det } = determinant(A);
    return {
      topic: "matrices", type: "nat", marks: 1, answer: det.toNumber(), tolerance: 0,
      stem: ["What is the determinant of the matrix below?", mtable(A)],
      solution: [`Reduce to upper triangular form with row swaps (each flips the sign) and row additions (no change), then multiply the diagonal.`, `det = ${det}.`],
      replay: query("/matrices", { mode: "det", m: encodeMatrix(A) }),
    };
  }
  if (kind === "detProduct") {
    const n = 3, A = randomMatrix(r, n, n, -2, 3), B = randomMatrix(r, n, n, -2, 3);
    const dA = determinant(A).det, dB = determinant(B).det;
    if (dA.isZero() || dB.isZero()) return null;
    const k = int(r, 2, 3);
    const variant = pick(r, ["AB", "kAinv"]);
    if (variant === "AB") {
      const ans = determinant(multiply(A, B)).det;
      return {
        topic: "matrices", type: "nat", marks: 2, answer: ans.toNumber(), tolerance: 0,
        stem: ["A and B are the 3×3 matrices below. What is det(AB)?", "A:", mtable(A), "B:", mtable(B)],
        solution: [`det(AB) = det(A)·det(B); no need to multiply the matrices.`, `det(A) = ${dA}, det(B) = ${dB}, so det(AB) = ${ans}.`],
        replay: query("/matrices", { mode: "det", m: encodeMatrix(A) }),
      };
    }
    const ans = F(k).pow(n).div(dA);
    return {
      topic: "matrices", type: "nat", marks: 2, answer: near(ans.toNumber()), tolerance: ans.isInteger() ? 0 : 0.01,
      stem: [`A is the 3×3 matrix below. What is det(${k}·A⁻¹)?${ans.isInteger() ? "" : " Give the answer to two decimal places."}`, mtable(A)],
      solution: [`det(kM) = kⁿ·det(M) for an n×n matrix, and det(A⁻¹) = 1/det(A).`, `det(A) = ${dA}, so det(${k}A⁻¹) = ${k}³ / ${dA} = ${ans}${ans.isInteger() ? "" : ` ≈ ${show(near(ans.toNumber()))}`}.`],
      replay: query("/matrices", { mode: "inverse", m: encodeMatrix(A) }),
    };
  }
  if (kind === "eigenMax" || kind === "eigenMcq") {
    const n = int(r, 2, 3);
    const { A, values } = randomEigenMatrix(r, n);
    if (A.flat().some((x) => x.abs().cmp(F(12)) > 0)) return null;
    const res = eigen(A);
    const vals = res.values.flatMap((v) => Array(v.mult).fill(v.value)).sort((a, b) => a - b);
    if (kind === "eigenMax") {
      const ask = pick(r, ["largest", "smallest", "sumSquares"]);
      const answer = ask === "largest" ? vals.at(-1) : ask === "smallest" ? vals[0] : vals.reduce((s, v) => s + v * v, 0);
      return {
        topic: "matrices", type: "nat", marks: 2, answer, tolerance: 0,
        stem: [`For the matrix below, what is ${ask === "largest" ? "the largest eigenvalue" : ask === "smallest" ? "the smallest eigenvalue" : "the sum of the squares of the eigenvalues (that is, the trace of A²)"}?`, mtable(A)],
        solution: [`Characteristic polynomial: ${res.steps[1].note.split("so ").pop()}`, `Eigenvalues: ${vals.join(", ")}.`, ask === "sumSquares" ? `Eigenvalues of A² are the squares, so the answer is ${vals.map((v) => `${v}²`).join(" + ")} = ${answer}.` : `Check: they add up to tr(A) = ${res.trace} and multiply to det(A) = ${res.det}.`],
        replay: query("/matrices", { mode: "eigen", m: encodeMatrix(A) }),
      };
    }
    const right = `{${vals.join(", ")}}`.replace(/-/g, "−");
    const alt = (f) => `{${vals.map(f).sort((a, b) => a - b).join(", ")}}`.replace(/-/g, "−");
    const m = mcq(r, right, [alt((v) => -v), alt((v) => v + 1), alt((v) => v - 1), alt((v) => 2 * v), alt((v, i) => (i === 0 ? v + 2 : v))]);
    if (!m) return null;
    return {
      topic: "matrices", type: "mcq", marks: 1, ...m,
      stem: ["Which of these is the set of eigenvalues of the matrix below (with repeats)?", mtable(A)],
      solution: [`The eigenvalues are ${vals.join(", ")}. Quick check without solving: they must add up to tr(A) = ${res.trace} and multiply to det(A) = ${res.det}, which rules out the other options.`],
      replay: query("/matrices", { mode: "eigen", m: encodeMatrix(A) }),
    };
  }
  // Solution type.
  const k = int(r, 2, 3);
  const A = randomRankMatrix(r, 3, 3, k);
  const red = rowReduce(A);
  if (red.rank !== k) return null;
  const consistent = k === 3 || r() < 0.5;
  let b;
  if (consistent) { const x = [int(r, -3, 3), int(r, -3, 3), int(r, -3, 3)].map((v) => F(v)); b = multiply(A, x.map((v) => [v])).map((row) => row[0]); }
  else b = [F(int(r, -5, 5)), F(int(r, -5, 5)), F(int(r, -5, 5))];
  const res = solveSystem(A, b);
  const labels = { unique: "a unique solution", infinite: "infinitely many solutions", none: "no solution" };
  const options = shuffle(r, [labels.unique, labels.infinite, labels.none, "exactly two solutions"]);
  return {
    topic: "matrices", type: "mcq", marks: 2, options, answer: options.indexOf(labels[res.kind]),
    stem: ["The system Ax = b has", { table: { head: ["A: c1", "c2", "c3", "b"], rows: A.map((row, i) => [...row.map(String), String(b[i])]) } }, "How many solutions does it have?"],
    solution: [`rank(A) = ${res.rankA} and rank([A | b]) = ${res.rankAug}, with n = 3 unknowns.`, res.steps.at(-2).note, "A linear system never has exactly two solutions: if x and y both work, so does every point on the line through them."],
    replay: query("/matrices", { mode: "solve", m: encodeMatrix(A), b: b.map((x) => x.toText()).join(",") }),
  };
}

// --- Probability ------------------------------------------------------------------------

export function probability(r, only = null) {
  const kind = only ?? pick(r, ["bayes", "conditional", "expectation", "binomial", "poisson", "continuous"]);
  if (kind === "bayes") {
    const prior = pick(r, ["0.01", "0.02", "0.05", "0.1", "0.2", "0.3", "0.4"]), hit = pick(r, ["0.8", "0.9", "0.95", "0.99"]), fa = pick(r, ["0.02", "0.05", "0.1", "0.15", "0.2"]);
    const res = bayes(prior, hit, fa);
    const story = pick(r, ["test", "machine"]);
    const stem = story === "test"
      ? `A disease affects ${Number(prior) * 100}% of a population. A test detects it in ${Number(hit) * 100}% of people who have it, but also gives a positive result for ${Number(fa) * 100}% of people who don't. A randomly chosen person tests positive. What is the probability that they have the disease, correct to two decimal places?`
      : `Machine M1 makes ${Number(prior) * 100}% of a factory's bolts and machine M2 makes the rest. ${Number(hit) * 100}% of M1's bolts and ${Number(fa) * 100}% of M2's bolts are defective. A bolt picked at random is defective. What is the probability that M1 made it, correct to two decimal places?`;
    return {
      topic: "probability", type: "nat", marks: 2, answer: near(res.posterior.toNumber()), tolerance: 0.01,
      stem: [stem],
      solution: [`P(B) = ${prior} × ${hit} + ${res.pnA} × ${fa} = ${show(res.pB.toNumber())}${res.pB.toNumber().toString().length > 6 ? "…" : ""} (total probability).`, `P(A | B) = ${prior} × ${hit} / P(B) = ${res.posterior} ≈ ${show(near(res.posterior.toNumber()))}.`],
      replay: query("/probability", { mode: "bayes", prior, hit, fa }),
    };
  }
  if (kind === "conditional") {
    const ev = EVENTS.dice;
    const pickEvent = () => { const id = pick(r, Object.keys(ev)); const k = ev[id].k ? int(r, ev[id].k[0], ev[id].k[1]) : 0; return [id, k]; };
    const [a, ka] = pickEvent(), [b, kb] = pickEvent();
    if (a === b) return null;
    const res = sampleSpace("dice", a, ka, b, kb);
    if (!res.nB || !res.nAB || res.nB === 36) return null;
    return {
      topic: "probability", type: "nat", marks: 1, answer: near(res.pAgB.toNumber()), tolerance: 0.01,
      stem: [`Two fair dice are rolled. Let A be the event "${res.labels[0]}" and B the event "${res.labels[1]}". What is P(A | B), correct to two decimal places?`],
      solution: [`Of the 36 outcomes, ${res.nB} have ${res.labels[1]}, and ${res.nAB} of those also have ${res.labels[0]}.`, `P(A | B) = ${res.nAB}/${res.nB} = ${res.pAgB} ≈ ${show(near(res.pAgB.toNumber()))}.`],
      replay: query("/probability", { mode: "space", exp: "dice", a, ka, b, kb }),
    };
  }
  if (kind === "expectation") {
    const n = int(r, 3, 4);
    const xs = shuffle(r, [-2, -1, 0, 1, 2, 3, 4, 5]).slice(0, n).sort((p, q) => p - q);
    const cuts = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, n - 1).sort((p, q) => p - q);
    const tenths = [...cuts, 10].map((c, i) => c - (i ? cuts[i - 1] : 0));
    const ps = tenths.map((t) => F(t, 10));
    const res = randomVariable(xs, ps);
    const ask = pick(r, ["mean", "variance"]);
    const answer = ask === "mean" ? res.mean.toNumber() : res.variance.toNumber();
    return {
      topic: "probability", type: "nat", marks: ask === "mean" ? 1 : 2, answer: near(answer), tolerance: 0.01,
      stem: [`A random variable X takes these values with these probabilities:`, { table: { head: ["x", ...xs.map(String)], rows: [["P(X = x)", ...ps.map((p) => show(p.toNumber()))]] } }, `What is ${ask === "mean" ? "E[X]" : "the variance of X"}${Number.isInteger(answer) ? "" : ", correct to two decimal places"}?`],
      solution: [`E[X] = Σ x·p = ${xs.map((x, i) => `${x}(${show(ps[i].toNumber())})`).join(" + ")} = ${show(res.mean.toNumber())}.`, ...(ask === "variance" ? [`E[X²] = ${show(res.ex2.toNumber())}, so Var(X) = E[X²] − (E[X])² = ${show(res.ex2.toNumber())} − ${show(res.mean.toNumber())}² = ${show(round2(answer))}.`] : [])],
      replay: query("/probability", { mode: "rv", xs: xs.join(","), ps: ps.map((p) => p.toText()).join(",") }),
    };
  }
  if (kind === "binomial") {
    const n = int(r, 4, 10), p = pick(r, [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6]), k = int(r, 0, Math.min(n, 4));
    const q = pick(r, ["eq", "le", "ge"]);
    const res = distribution("binomial", { n, p }, q, k);
    if (res.answer < 0.02) return null;
    return {
      topic: "probability", type: "nat", marks: 2, answer: near(res.answer), tolerance: 0.01,
      stem: [`A biased coin shows heads with probability ${p}. It is tossed ${n} times. What is the probability of ${q === "eq" ? `exactly ${k}` : q === "le" ? `at most ${k}` : `at least ${k}`} heads, correct to two decimal places?`],
      solution: [`X ~ Binomial(n = ${n}, p = ${p}): P(X = k) = C(${n}, k)·${p}ᵏ·${round2(1 - p)}^(${n} − k).`, ...res.steps.slice(1, -1).map((s) => s.note), `So ${res.label} ≈ ${show(near(res.answer))}.`],
      replay: query("/probability", { mode: "dist", dist: "binomial", n, p, q, x: k }),
    };
  }
  if (kind === "poisson") {
    const lambda = pick(r, [0.5, 1, 1.5, 2, 2.5, 3, 4]), k = int(r, 0, 3), q = pick(r, ["eq", "le", "ge"]);
    if (q === "ge" && k === 0) return null;
    const res = distribution("poisson", { lambda }, q, k);
    return {
      topic: "probability", type: "nat", marks: 2, answer: near(res.answer), tolerance: 0.01,
      stem: [`Calls reach a help desk at an average of ${lambda} per minute, following a Poisson distribution. What is the probability of ${q === "eq" ? `exactly ${k}` : q === "le" ? `at most ${k}` : `at least ${k}`} call${k === 1 ? "" : "s"} in a given minute, correct to two decimal places?`],
      solution: [`P(X = k) = e^(−${lambda})·${lambda}ᵏ / k!.`, ...res.steps.slice(1, -1).map((s) => s.note), `So ${res.label} ≈ ${show(near(res.answer))}.`],
      replay: query("/probability", { mode: "dist", dist: "poisson", lambda, q, x: k }),
    };
  }
  const which = pick(r, ["exponential", "normal", "uniform", "geometric"]);
  if (which === "exponential") {
    const mean = pick(r, [2, 4, 5, 10]), t = int(r, 1, 2 * mean);
    const res = distribution("exponential", { lambda: 1 / mean }, "ge", t);
    return {
      topic: "probability", type: "nat", marks: 1, answer: near(res.answer), tolerance: 0.01,
      stem: [`The lifetime of a bulb is exponentially distributed with mean ${mean} years. What is the probability that a bulb lasts at least ${t} years, correct to two decimal places?`],
      solution: [`Rate λ = 1/${mean}. P(X ≥ ${t}) = e^(−λ·${t}) = e^(−${show(round2(t / mean))}) ≈ ${show(near(res.answer))}.`],
      replay: query("/probability", { mode: "dist", dist: "exponential", lambda: 1 / mean, q: "ge", x: t }),
    };
  }
  if (which === "normal") {
    const mu = pick(r, [50, 60, 70, 100]), sigma = pick(r, [5, 10, 15]), za = pick(r, [-2, -1.5, -1, -0.5, 0]), zb = za + pick(r, [1, 1.5, 2, 2.5]);
    const a = mu + za * sigma, b = mu + zb * sigma;
    const res = distribution("normal", { mu, sigma }, "between", a, b);
    return {
      topic: "probability", type: "nat", marks: 2, answer: near(res.answer), tolerance: 0.01,
      stem: [`Marks in an exam are normally distributed with mean ${mu} and standard deviation ${sigma}. What fraction of students score between ${a} and ${b}? Give the answer correct to two decimal places.`],
      solution: [`Standardise: z = (x − μ)/σ, so ${a} and ${b} become z = ${za} and z = ${zb}.`, `P = Φ(${zb}) − Φ(${za}) = ${Phi(zb).toFixed(4)} − ${Phi(za).toFixed(4)} ≈ ${show(near(res.answer))}.`],
      replay: query("/probability", { mode: "dist", dist: "normal", mu, sigma, q: "between", x: a, y: b }),
    };
  }
  if (which === "uniform") {
    const a0 = int(r, 0, 5), b0 = a0 + int(r, 4, 12), x = int(r, a0 + 1, b0 - 1), y = int(r, x + 1, b0);
    const res = distribution("uniform", { a: a0, b: b0 }, "between", x, y);
    return {
      topic: "probability", type: "nat", marks: 1, answer: near(res.answer), tolerance: 0.01,
      stem: [`X is uniformly distributed on [${a0}, ${b0}]. What is P(${x} ≤ X ≤ ${y}), correct to two decimal places?`],
      solution: [`For a uniform distribution, probability = length ÷ total length = (${y} − ${x}) / (${b0} − ${a0}) = ${show(near(res.answer))}.`],
      replay: query("/probability", { mode: "dist", dist: "uniform", a: a0, b: b0, q: "between", x, y }),
    };
  }
  const p = pick(r, [0.2, 0.25, 0.4, 0.5]);
  const ask = pick(r, ["mean", "prob"]);
  if (ask === "mean") {
    const wrong = [round2(1 / p - 1), round2((1 - p) / p / p), round2(p * 10), round2(1 / (1 - p))];
    const m = mcq(r, show(round2(1 / p)), wrong.map(show));
    if (!m) return null;
    return {
      topic: "probability", type: "mcq", marks: 1, ...m,
      stem: [`A die-like game is won with probability ${p} on each independent try. What is the expected number of tries up to and including the first win?`],
      solution: [`The number of tries is geometric with p = ${p}, so E[X] = 1/p = ${show(round2(1 / p))}.`],
      replay: query("/probability", { mode: "dist", dist: "geometric", p, q: "le", x: 3 }),
    };
  }
  const k = int(r, 2, 4);
  const res = distribution("geometric", { p }, "eq", k);
  return {
    topic: "probability", type: "nat", marks: 1, answer: near(res.answer), tolerance: 0.01,
    stem: [`Each independent try succeeds with probability ${p}. What is the probability that the first success comes on try ${k}, correct to two decimal places?`],
    solution: [`(1 − p)^(k − 1)·p = ${round2(1 - p)}^${k - 1} × ${p} ≈ ${show(near(res.answer))}.`],
    replay: query("/probability", { mode: "dist", dist: "geometric", p, q: "eq", x: k }),
  };
}

// --- Calculus ---------------------------------------------------------------------------

export function calculus(r, only = null) {
  const kind = only ?? pick(r, ["limit", "limit", "maxima", "integral", "mvt"]);
  if (kind === "limit") {
    const a = int(r, 2, 6), b = int(r, 1, 5), c = int(r, 1, 5);
    const forms = [
      [`sin(${a}x)/(${b}x)`, "0", "sin(kx)/x → k as x → 0"],
      [`(1 - cos(${a}x))/x^2`, "0", "1 − cos(kx) ≈ k²x²/2 near 0"],
      [`(exp(${a}x) - 1)/(${b}x)`, "0", "eᵏˣ − 1 ≈ kx near 0"],
      [`(x^2 - ${c * c})/(x - ${c})`, String(c), "factor x² − c² = (x − c)(x + c)"],
      [`(${a}x^2 + ${b})/(${c}x^2 - x)`, "inf", "divide top and bottom by x²"],
      [`ln(1 + ${a}x)/(${b}x)`, "0", "ln(1 + kx) ≈ kx near 0"],
      [`(1 + ${b}/x)^x`, "inf", "(1 + k/x)ˣ → eᵏ"],
      [`(tan(${a}x) - ${a}x)/x^3`, "0", "tan u ≈ u + u³/3 near 0"],
    ];
    const [f, at, hint] = pick(r, forms);
    const res = limit(f, at);
    if (!Number.isFinite(res.answer) || res.method === "numeric") return null;
    const integerish = Math.abs(res.answer - Math.round(res.answer)) < 1e-9;
    const lhop = res.steps.filter((s) => s.line === 6 || s.line === 7).map((s) => s.note);
    return {
      topic: "calculus", type: "nat", marks: lhop.length > 2 ? 2 : 1, answer: integerish ? Math.round(res.answer) : near(res.answer), tolerance: integerish ? 0 : 0.01,
      stem: [`Evaluate lim (x → ${at === "inf" ? "∞" : at}) of ${print(res.expr)}${integerish ? "" : ", correct to two decimal places"}.`],
      solution: [...res.steps.filter((s) => s.line >= 4).map((s) => s.note), `(Shortcut: ${hint}.)`],
      replay: query("/calculus", { mode: "limit", f, at }),
    };
  }
  if (kind === "maxima") {
    // p(x) = 2x³ − 3(a+b)x² + 6abx + c has turning points at a and b.
    const a = int(r, -3, 2), b = a + int(r, 1, 4), c = int(r, -5, 5);
    const f = `2x^3 - ${3 * (a + b)}x^2 + ${6 * a * b}x + ${c}`.replace(/\+ -/g, "- ").replace(/- -/g, "+ ");
    const interval = r() < 0.4;
    const lo = a - int(r, 1, 2), hi = b + int(r, 1, 2);
    const res = extrema(f, interval ? [String(lo), String(hi)] : null);
    const ask = pick(r, ["maxValue", "minValue", "maxAt"]);
    const mx = res.points.find((p) => p.kind === "max"), mn = res.points.find((p) => p.kind === "min");
    if (!mx || !mn) return null;
    let answer, what;
    if (interval) { answer = ask === "minValue" ? res.absolute.min.value : res.absolute.max.value; what = ask === "minValue" ? `the absolute minimum value of f on [${lo}, ${hi}]` : `the absolute maximum value of f on [${lo}, ${hi}]`; }
    else if (ask === "maxAt") { answer = mx.x.value; what = "the value of x at which f has a local maximum"; }
    else { answer = ask === "maxValue" ? mx.value : mn.value; what = `the local ${ask === "maxValue" ? "maximum" : "minimum"} value of f`; }
    return {
      topic: "calculus", type: "nat", marks: interval ? 2 : 1, answer, tolerance: 0,
      stem: [`For f(x) = ${res.steps[0].vars["p(x)"]}, what is ${what}?`],
      solution: res.steps.slice(1).map((s) => s.note),
      replay: query("/calculus", interval ? { mode: "extrema", f, lo, hi } : { mode: "extrema", f }),
    };
  }
  if (kind === "integral") {
    const which = pick(r, ["poly", "trig", "exp", "recip"]);
    let f, a, b;
    if (which === "poly") { const p = int(r, 1, 4), q = int(r, -3, 4); f = `${p}x^2 + ${q}x`.replace("+ -", "- "); a = String(int(r, -1, 1)); b = String(int(r, 2, 3)); }
    else if (which === "trig") { const k = pick(r, [1, 2]); const kx = k === 1 ? "x" : `${k}x`; f = pick(r, [`sin(${kx})`, `cos(${kx})`]); a = "0"; b = pick(r, ["pi/2", "pi/4", "pi"]); }
    else if (which === "exp") { const k = pick(r, [1, 2]); f = `exp(${k === 1 ? "x" : `${k}x`})`; a = "0"; b = "1"; }
    else { const k = int(r, 1, 3); f = `1/(x + ${k})`; a = "0"; b = String(int(r, 1, 4)); }
    const res = integral(f, a, b, "simpson", 8);
    if (res.exact === null) return null;
    const integerish = Math.abs(res.exact - Math.round(res.exact)) < 1e-9;
    return {
      topic: "calculus", type: "nat", marks: 1, answer: integerish ? Math.round(res.exact) : near(res.exact), tolerance: integerish ? 0 : 0.01,
      stem: [`Evaluate the definite integral of ${print(parse(f))} with respect to x from ${a.replace("pi", "π")} to ${b.replace("pi", "π")}${integerish ? "" : ", correct to two decimal places"}.`],
      solution: [`An antiderivative is F(x) = ${res.F}.`, `F(${b.replace("pi", "π")}) − F(${a.replace("pi", "π")}) = ${res.exactText}${integerish ? "" : ` ≈ ${show(near(res.exact))}`}.`],
      replay: query("/calculus", { mode: "integral", f, a, b, method: "simpson", n: 8 }),
    };
  }
  const a = int(r, 0, 2), b = a + int(r, 1, 3), p = int(r, 1, 3), q = int(r, -4, 4);
  const f = pick(r, [`${p}x^2 + ${q}x`, `x^3`, `x^3 - ${p}x`]).replace("+ -", "- ");
  const res = mvt(f, String(a), String(b));
  if (res.cs.length !== 1) return null;
  return {
    topic: "calculus", type: "nat", marks: 1, answer: near(res.cs[0].value), tolerance: Number.isInteger(res.cs[0].value) ? 0 : 0.01,
    stem: [`By the mean value theorem, there is a c in (${a}, ${b}) with f′(c) = (f(${b}) − f(${a}))/(${b} − ${a}), for f(x) = ${f}. What is c${Number.isInteger(res.cs[0].value) ? "" : ", correct to two decimal places"}?`],
    solution: res.steps.slice(1).map((s) => s.note),
    replay: query("/calculus", { mode: "mvt", f, a, b }),
  };
}

// --- Aptitude ---------------------------------------------------------------------------

function aptitude(r) {
  const q = makeQuestion(r);
  const replay = query("/aptitude", { topic: q.topic, type: q.variant, ...q.params });
  const solution = [...q.steps.map((s) => s.note), `Answer: ${q.display}.`];
  if (q.choices) {
    const m = mcq(r, q.answer, shuffle(r, q.choices.filter((d) => d !== q.answer)));
    return { topic: "aptitude", type: "mcq", marks: 1, ...m, stem: [q.text], solution, replay };
  }
  const exact = q.exact;
  const integer = exact.isInteger();
  if (r() < 0.5) {
    const v = q.answer;
    const wrongs = [v * 1.1, v * 0.9, v + 1, v - 1, v * 2, v / 2, v + 5].map((x) => (integer ? Math.round(x) : round2(x))).filter((x) => x !== (integer ? v : round2(v)));
    const right = integer ? v : round2(v);
    const m = mcq(r, show(right), wrongs.map(show));
    if (!m) return null;
    return { topic: "aptitude", type: "mcq", marks: pick(r, [1, 2]), ...m, stem: [q.text + (integer ? "" : " (Options are rounded to two decimal places.)")], solution, replay };
  }
  return {
    topic: "aptitude", type: "nat", marks: pick(r, [1, 2]), answer: integer ? q.answer : round2(q.answer), tolerance: integer ? 0 : 0.01,
    stem: [q.text + (integer ? "" : " Give the answer correct to two decimal places.")], solution, replay,
  };
}
void APT; void Fraction; void inverse;

export const TOPICS = [
  { slug: "matrices", subject: "maths", title: "Matrices and eigenvalues", make: matrices },
  { slug: "probability", subject: "maths", title: "Probability", make: probability },
  { slug: "calculus", subject: "maths", title: "Calculus", make: calculus },
  { slug: "aptitude", subject: "maths", title: "General aptitude", make: aptitude },
];
