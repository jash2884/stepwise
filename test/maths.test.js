// Engineering maths engines checked against textbook results, plus fuzzing
// with exact fractions and the GATE generators for many seeds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fraction, F } from "../public/js/engines/fraction.js";
import { determinant, eigen, equalMatrices, identity, inverse, multiply, parseMatrix, randomEigenMatrix, randomMatrix, rank, rowReduce, solveSystem, charPoly } from "../public/js/engines/matrices.js";
import { bayes, distribution, Phi, randomVariable, sampleSpace, choose } from "../public/js/engines/probability.js";
import { extrema, integral, limit, mvt, antiderivative } from "../public/js/engines/calculus.js";
import { derivative, parse, print, evaluate, toPoly, polyText } from "../public/js/engines/expr.js";
import { TOPICS as APT, makeQuestion, solve as aptSolve, solveSeries, weekday, randomSeries } from "../public/js/engines/aptitude.js";
import { TOPICS as GATE_MATHS } from "../public/js/gate/maths.js";
import { check, generate } from "../public/js/gate-questions.js";
import { rng } from "../public/js/ui.js";

const M = (s) => parseMatrix(s);
const close = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} ≉ ${b}`);

// --- Fractions ----------------------------------------------------------------------------

test("fractions stay exact and in lowest terms", () => {
  assert.equal(F(6, 8).toText(), "3/4");
  assert.equal(F(1, 3).add(F(1, 6)).toText(), "1/2");
  assert.equal(Fraction.parse("-0.75").toText(), "-3/4");
  assert.equal(Fraction.parse("1.5/2").toText(), "3/4");
  assert.equal(F(-2, -4).toText(), "1/2");
  assert.equal(F(2, 3).pow(-2).toText(), "9/4");
  assert.throws(() => F(1, 0), /zero/);
  assert.throws(() => Fraction.parse("abc"));
});

// --- Matrices -----------------------------------------------------------------------------

test("determinants: textbook values", () => {
  assert.equal(determinant(M("1,2;3,4")).det.toText(), "-2");
  assert.equal(determinant(M("6,1,1;4,-2,5;2,8,7")).det.toText(), "-306");
  assert.equal(determinant(M("0,2,1;1,3,2;2,1,4")).det.toText(), "-5");
  assert.equal(determinant(M("1,2,3;4,5,6;7,8,9")).det.toText(), "0");
  assert.equal(determinant(M("2,0,0,0;0,3,0,0;0,0,4,0;0,0,0,5")).det.toText(), "120");
  assert.equal(determinant(M("1/2,1/3;1/4,1/5")).det.toText(), "1/60");
});

test("rank: textbook values", () => {
  assert.equal(rank(M("1,2,3;4,5,6;7,8,9")), 2);
  assert.equal(rank(M("1,2,1,3;2,4,0,2;3,6,1,5")), 2);
  assert.equal(rank(M("1,1,1;1,1,1;1,1,1")), 1);
  assert.equal(rank(M("0,0;0,0")), 0);
  assert.equal(rank(identity(4)), 4);
  const r = rowReduce(M("1,2,1,3;2,4,0,2;3,6,1,5"));
  assert.equal(r.matrix.map((row) => row.map((x) => x.toText()).join(" ")).join("; "), "1 2 0 1; 0 0 1 2; 0 0 0 0");
});

test("inverse: known inverse and singular matrices", () => {
  const inv = inverse(M("2,1,1;1,3,2;1,0,0")).inverse;
  assert.equal(inv.map((r) => r.map((x) => x.toText()).join(" ")).join("; "), "0 0 1; -2 1 3; 3 -1 -5");
  assert.equal(inverse(M("4,7;2,6")).inverse.map((r) => r.map((x) => x.toText()).join(" ")).join("; "), "3/5 -7/10; -1/5 2/5");
  assert.equal(inverse(M("1,2;2,4")).inverse, null);
});

test("systems: unique, infinitely many and no solutions by the rank test", () => {
  const u = solveSystem(M("2,1,-1;-3,-1,2;-2,1,2"), [8, -11, -3]);
  assert.equal(u.kind, "unique");
  assert.deepEqual(u.x.map(String), ["2", "3", "−1"]);
  const inf = solveSystem(M("1,1,1;1,2,3;2,3,4"), [6, 14, 20]);
  assert.equal(inf.kind, "infinite");
  assert.equal(inf.rankA, 2);
  // Every point on the solution line works.
  const A = M("1,1,1;1,2,3;2,3,4");
  for (const t of [0, 1, -3, F(1, 2)]) {
    const x = inf.x.map((v, i) => v.add(inf.basis[0][i].mul(Fraction.from(t))));
    assert.deepEqual(multiply(A, x.map((v) => [v])).map((r) => r[0].toText()), ["6", "14", "20"]);
  }
  const none = solveSystem(M("1,1,1;1,2,3;2,3,4"), [6, 14, 21]);
  assert.equal(none.kind, "none");
  assert.equal(none.rankAug, 3);
  assert.equal(solveSystem(M("1,2;2,4"), [0, 0]).kind, "infinite");
});

test("eigenvalues and eigenvectors: textbook examples", () => {
  const e2 = eigen(M("4,1;2,3"));
  assert.deepEqual(e2.values.map((v) => v.text).sort(), ["2", "5"]);
  assert.deepEqual(e2.values.find((v) => v.text === "5").vectors, [["1", "1"]]);
  assert.deepEqual(e2.values.find((v) => v.text === "2").vectors, [["1", "−2"]]);
  // Repeated eigenvalue with a 2-dimensional eigenspace.
  const e3 = eigen(M("3,1,1;1,3,1;1,1,3"));
  const two = e3.values.find((v) => v.text === "2");
  assert.equal(two.mult, 2);
  assert.equal(two.geometric, 2);
  assert.equal(e3.values.find((v) => v.text === "5").mult, 1);
  // Defective: algebraic 2, geometric 1.
  const d = eigen(M("2,1;0,2")).values[0];
  assert.equal(d.mult, 2);
  assert.equal(d.geometric, 1);
  // Irrational and complex.
  const irr = eigen(M("1,2;3,4"));
  assert.deepEqual(irr.values.map((v) => v.text), ["(5 + √33)/2", "(5 − √33)/2"]);
  close(irr.values[0].value, (5 + Math.sqrt(33)) / 2);
  const rot = eigen(M("0,-1;1,0"));
  assert.deepEqual(rot.values.map((v) => v.text), ["i", "−i"]);
  // Classic tridiagonal: 2 − √2, 2, 2 + √2.
  const tri = eigen(M("2,-1,0;-1,2,-1;0,-1,2"));
  assert.deepEqual(tri.values.map((v) => v.value.toFixed(6)).sort(), [2 - Math.SQRT2, 2, 2 + Math.SQRT2].map((x) => x.toFixed(6)).sort());
  // Characteristic polynomial of a 3×3.
  assert.deepEqual(charPoly(M("2,0,0;0,3,4;0,4,9")).map((x) => x.toText()), ["1", "-14", "35", "-22"]);
});

test("trace = sum of eigenvalues, det = product, and Av = λv", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed);
    const n = 2 + (seed % 2);
    const A = randomMatrix(r, n, n, -4, 5);
    const e = eigen(A);
    close(e.sum, e.trace.toNumber(), 1e-6, `trace seed ${seed}`);
    close(e.product, e.det.toNumber(), 1e-5 * Math.max(1, Math.abs(e.det.toNumber())), `det seed ${seed}`);
    for (const v of e.values) for (const w of v.exactVectors ?? []) {
      const Av = multiply(A, w.map((x) => [x])).map((row) => row[0]);
      assert.deepEqual(Av.map((x) => x.toText()), w.map((x) => x.mul(v.exact).toText()), `Av = λv seed ${seed}`);
    }
  }
  // Integer eigenvalues by construction come back exactly.
  for (let seed = 1; seed <= 40; seed++) {
    const { A, values } = randomEigenMatrix(rng(seed), 3);
    const got = eigen(A).values.flatMap((v) => Array(v.mult).fill(v.exact?.toNumber()));
    assert.deepEqual(got.sort((a, b) => a - b), [...values].sort((a, b) => a - b), `seed ${seed}`);
  }
});

test("fuzz: A·A⁻¹ = I exactly and det(AB) = det(A)·det(B)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const n = 2 + (seed % 3);
    const A = randomMatrix(r, n, n, -5, 6), B = randomMatrix(r, n, n, -5, 6);
    const dA = determinant(A).det, dB = determinant(B).det;
    assert.ok(determinant(multiply(A, B)).det.equals(dA.mul(dB)), `det(AB) seed ${seed}`);
    const inv = inverse(A).inverse;
    if (dA.isZero()) assert.equal(inv, null, `singular seed ${seed}`);
    else {
      assert.ok(equalMatrices(multiply(A, inv), identity(n)), `A·A⁻¹ seed ${seed}`);
      assert.ok(equalMatrices(multiply(inv, A), identity(n)), `A⁻¹·A seed ${seed}`);
      assert.ok(determinant(inv).det.equals(dA.inv()), `det(A⁻¹) seed ${seed}`);
    }
    // Rank agrees with invertibility, and rank(A) = rank(Aᵀ).
    assert.equal(rank(A) === n, !dA.isZero());
    const At = A[0].map((_, j) => A.map((row) => row[j]));
    assert.equal(rank(A), rank(At));
  }
});

test("every matrix step names a pseudocode line and has a note", () => {
  for (const s of [...rowReduce(M("0,2,1;1,3,2;2,1,4")).steps, ...determinant(M("0,2,1;1,3,2;2,1,4")).steps, ...inverse(M("2,1;1,1")).steps, ...solveSystem(M("1,1;1,1"), [1, 2]).steps, ...eigen(M("4,1;2,3")).steps]) {
    assert.ok(s.line && s.note && s.vars, JSON.stringify(s.op));
  }
});

// --- Probability --------------------------------------------------------------------------

test("Bayes: classic examples", () => {
  // 1% prevalence, 90% sensitivity, 9% false positives: P(disease | positive) = 10/109 ≈ 9.2%.
  const b = bayes("0.01", "0.9", "0.09");
  assert.equal(b.posterior.toText(), "10/109");
  assert.equal(b.pB.toText(), "981/10000");
  // 1 in 1000, 99% / 5%: about 1.94%.
  close(bayes("0.001", "0.99", "0.05").posterior.toNumber(), 0.0194, 1e-4);
  assert.throws(() => bayes("1.2", "0.5", "0.5"), /between 0 and 1/);
});

test("sample space: dice and coins", () => {
  const s = sampleSpace("dice", "sum", 7, "first", 3);
  assert.equal(s.pA.toText(), "1/6");
  assert.equal(s.pAgB.toText(), "1/6");
  assert.equal(s.independent, true);
  const t = sampleSpace("dice", "sum", 8, "doubles", 0);
  assert.equal(t.pA.toText(), "5/36");
  assert.equal(t.pAgB.toText(), "1/6");
  assert.equal(t.independent, false);
  const c = sampleSpace("coins", "atLeast", 2, "firstH", 0);
  assert.equal(c.pA.toText(), "1/2");
  assert.equal(c.pAgB.toText(), "3/4");
  assert.equal(c.pAuB.toText(), "5/8");
});

test("random variables: E[X] and Var(X)", () => {
  const die = randomVariable([1, 2, 3, 4, 5, 6], Array(6).fill("1/6"));
  assert.equal(die.mean.toText(), "7/2");
  assert.equal(die.variance.toText(), "35/12");
  const coins = randomVariable([0, 1, 2, 3], ["1/8", "3/8", "3/8", "1/8"]);
  assert.equal(coins.mean.toText(), "3/2");
  assert.equal(coins.variance.toText(), "3/4");
  assert.throws(() => randomVariable([1, 2], ["0.5", "0.6"]), /add up/);
});

test("distributions: binomial, Poisson, geometric, uniform, exponential, normal", () => {
  assert.equal(choose(10, 3), 120);
  close(distribution("binomial", { n: 10, p: 0.5 }, "le", 3).answer, 176 / 1024);
  close(distribution("binomial", { n: 5, p: 0.3 }, "eq", 2).answer, 0.3087);
  close(distribution("binomial", { n: 20, p: 0.4 }, "ge", 15).answer, 0.0016115, 1e-6);
  close(distribution("poisson", { lambda: 2 }, "ge", 1).answer, 1 - Math.exp(-2));
  close(distribution("poisson", { lambda: 3 }, "eq", 2).answer, 0.224042, 1e-6);
  close(distribution("poisson", { lambda: 4 }, "le", 2).answer, 13 * Math.exp(-4));
  close(distribution("geometric", { p: 0.25 }, "le", 3).answer, 1 - 0.75 ** 3);
  close(distribution("geometric", { p: 0.2 }, "ge", 4).answer, 0.8 ** 3);
  close(distribution("uniform", { a: 0, b: 10 }, "between", 2, 5).answer, 0.3);
  close(distribution("exponential", { lambda: 0.5 }, "ge", 2).answer, Math.exp(-1));
  // Normal: the 68-95-99.7 rule and Φ(1.96) = 0.975 without a table.
  close(distribution("normal", { mu: 0, sigma: 1 }, "between", -1, 1).answer, 0.682689, 1e-6);
  close(distribution("normal", { mu: 100, sigma: 15 }, "between", 70, 130).answer, 0.954500, 1e-6);
  close(Phi(1.96), 0.975002, 1e-6);
  close(Phi(-3), 0.0013499, 1e-7);
  close(Phi(0), 0.5, 1e-12);
  const b = distribution("binomial", { n: 12, p: 0.25 }, "le", 4);
  close(b.mean, 3); close(b.variance, 2.25);
  assert.equal(distribution("normal", { mu: 0, sigma: 1 }, "eq", 1).answer, 0);
});

// --- Calculus -----------------------------------------------------------------------------

test("expressions: parse, differentiate, print", () => {
  assert.equal(print(parse("2x^3 - 3x + 1")), "2x³ − 3x + 1");
  assert.equal(print(derivative(parse("x^2*sin(x)"))), "2x·sin(x) + x²·cos(x)");
  close(evaluate(derivative(parse("ln(x^2 + 1)")), 2), 4 / 5);
  close(evaluate(derivative(parse("exp(3x)")), 0), 3);
  close(evaluate(derivative(parse("sqrt(x)")), 4), 0.25);
  close(evaluate(parse("sin x cos x"), 1), Math.sin(1) * Math.cos(1));
  assert.equal(polyText(toPoly(parse("(x+1)^3"))), "x³ + 3x² + 3x + 1");
  assert.throws(() => parse("2x +"), /ends/);
  assert.throws(() => parse("sinh(x)"));
});

test("limits: standard results by L'Hôpital and the table", () => {
  const cases = [
    ["sin(x)/x", "0", 1], ["(1 - cos(x))/x^2", "0", 0.5], ["(x^2 - 1)/(x - 1)", "1", 2], ["(exp(x) - 1)/x", "0", 1],
    ["x*ln(x)", "0", 0], ["(1 + 1/x)^x", "inf", Math.E], ["x^2/exp(x)", "inf", 0], ["(3x^2 + 2)/(5x^2 - x)", "inf", 0.6],
    ["(tan(x) - x)/x^3", "0", 1 / 3], ["ln(1 + 2x)/x", "0", 2], ["x^x", "0", 1], ["sin(3x)/(2x)", "0", 1.5], ["x^2 + 1", "2", 5],
  ];
  for (const [f, at, want] of cases) {
    const r = limit(f, at);
    close(r.answer, want, 1e-6, `${f} at ${at}: got ${r.answer}`);
    assert.notEqual(r.method, "numeric", `${f} should be solved exactly`);
  }
  assert.ok(Number.isNaN(limit("1/x", "0").answer), "1/x has no limit at 0");
  assert.ok(Number.isNaN(limit("sin(1/x)", "0").answer));
  assert.equal(limit("(1 + 1/x)^x", "inf").text, "e");
  assert.equal(limit("(1 - cos(x))/x^2", "0").text, "1/2");
});

test("maxima and minima of polynomials", () => {
  const a = extrema("x^3 - 3x + 2");
  assert.deepEqual(a.points.map((p) => [p.kind, p.x.exact.toText(), p.exactValue.toText()]), [["max", "-1", "4"], ["min", "1", "0"]]);
  const b = extrema("2x^3 - 9x^2 + 12x");
  assert.deepEqual(b.points.map((p) => [p.kind, p.x.exact.toText(), p.value]), [["max", "1", 5], ["min", "2", 4]]);
  const c = extrema("x^4 - 4x^3", ["-1", "4"]);
  assert.deepEqual(c.points.map((p) => p.kind), ["neither", "min"]);
  assert.equal(c.absolute.max.value, 5);
  assert.equal(c.absolute.min.value, -27);
  const d = extrema("x^3 - 2x");
  close(d.points[0].x.value, -Math.sqrt(2 / 3));
  assert.throws(() => extrema("sin(x)"), /polynomial/);
});

test("integrals: exact values and Riemann sums converging", () => {
  assert.equal(integral("x^2", "0", "2", "left", 8).exactText, "8/3");
  assert.equal(integral("3x^2 + 2x", "1", "3", "mid", 8).exactText, "34");
  close(integral("sin(x)", "0", "pi", "trap", 8).exact, 2);
  close(integral("exp(x)", "0", "1", "simpson", 8).exact, Math.E - 1);
  close(integral("1/x", "1", "e", "mid", 8).exact, 1);
  close(integral("cos(2x)", "0", "pi/4", "mid", 8).exact, 0.5);
  close(integral("sqrt(x)", "0", "4", "mid", 8).exact, 16 / 3);
  // No elementary rule here: the Simpson reference is still right.
  close(integral("1/(1 + x^2)", "0", "1", "simpson", 16).reference, Math.PI / 4, 1e-9);
  // Simpson is exact for cubics; errors shrink as n doubles.
  close(integral("x^3", "0", "2", "simpson", 2).sums[0].sum, 4, 1e-12);
  const sums = integral("x^2", "0", "1", "left", 64).sums;
  for (let i = 1; i < sums.length; i++) assert.ok(Math.abs(sums[i].error) < Math.abs(sums[i - 1].error));
  assert.throws(() => integral("1/x", "-1", "1"), /improper/);
  assert.equal(print(antiderivative(parse("cos(3x)"))), "sin(3x)/3");
});

test("mean value theorem", () => {
  close(mvt("x^3", "0", "2").cs[0].value, 2 / Math.sqrt(3));
  assert.equal(mvt("x^2 - 4x", "0", "4").cs[0].text, "2");
  close(mvt("sin(x)", "0", "pi").cs[0].value, Math.PI / 2, 1e-6);
  close(mvt("ln(x)", "1", "e").cs[0].value, Math.E - 1, 1e-6);
});

// --- Aptitude -----------------------------------------------------------------------------

test("aptitude: textbook answers", () => {
  const s = (t, v, p) => aptSolve(t, v, p).answer;
  close(s("work", "together", { a: 12, b: 15 }), 20 / 3);
  close(s("work", "pipes", { a: 6, b: 10 }), 15);
  assert.equal(s("percent", "successive", { p: 20, q: -10 }), 8);
  assert.equal(s("percent", "consumption", { r: 25 }), 20);
  assert.equal(s("profit", "sameSp", { x: 20 }), 4);
  assert.equal(s("profit", "discount", { m: 800, d: 10, g: 20 }), 600);
  assert.equal(s("speed", "average", { u: 40, v: 60 }), 48);
  assert.equal(s("speed", "train", { l: 150, s: 54, p: 250 }), 80 / 3);
  assert.equal(s("speed", "boat", { d: 24, td: 2, tu: 3 }), 2);
  assert.equal(s("interest", "ci", { p: 10000, r: 10, t: 2 }), 2100);
  assert.equal(s("interest", "diff", { p: 8000, r: 5, t: 2 }), 20);
  assert.equal(s("interest", "si", { p: 5000, r: 8, t: 3 }), 1200);
  assert.equal(s("averages", "replace", { n: 8, w: 65, d: 2.5 }), 85);
  assert.equal(s("ratio", "alligation", { c1: 40, c2: 60, m: 52 }), 2 / 3);
  close(s("ratio", "replace", { v: 40, x: 4, n: 2 }), 32.4);
  assert.equal(s("clock", "angle", { h: 3, m: 40 }), 130);
  assert.equal(s("clock", "angle", { h: 9, m: 0 }), 90);
  close(s("clock", "together", { h: 4 }), 240 / 11);
  assert.equal(weekday(15, 8, 1947).answer, "Friday");
  assert.equal(weekday(26, 1, 1950).answer, "Thursday");
  assert.equal(weekday(1, 1, 2000).answer, "Saturday");
  assert.equal(weekday(29, 2, 2024).answer, "Thursday");
  assert.throws(() => weekday(29, 2, 1900), /28 days/);
});

test("number series: patterns found and every generated series solved", () => {
  assert.equal(solveSeries([3, 8, 15, 24, 35]).answer, 48);
  assert.equal(solveSeries([2, 6, 18, 54]).answer, 162);
  assert.equal(solveSeries([1, 3, 7, 15, 31]).answer, 63);
  assert.equal(solveSeries([1, 1, 2, 3, 5, 8]).answer, 13);
  assert.equal(solveSeries([2, 10, 4, 20, 6, 30]).answer, 8);
  assert.equal(solveSeries([0, 7, 26, 63]).answer, 124);
  for (let seed = 1; seed <= 300; seed++) {
    const s = randomSeries(rng(seed));
    assert.equal(solveSeries(s.slice(0, -1)).answer, s.at(-1), `seed ${seed}: ${s}`);
  }
});

test("aptitude generators always make solvable questions", () => {
  for (const [t, topic] of Object.entries(APT)) for (const v of Object.keys(topic.variants)) for (let seed = 1; seed <= 25; seed++) {
    const q = makeQuestion(rng(seed), t, v);
    assert.ok(q.text && q.steps.length && q.display, `${t}/${v} seed ${seed}`);
    assert.ok(q.choices ? q.choices.includes(q.answer) : Number.isFinite(q.answer), `${t}/${v} seed ${seed}`);
  }
});

// --- GATE generators ----------------------------------------------------------------------

test("GATE maths topics make valid questions for seeds 1 to 150", () => {
  assert.deepEqual(GATE_MATHS.map((t) => t.slug), ["matrices", "probability", "calculus", "aptitude"]);
  for (const t of GATE_MATHS) {
    const types = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const q = generate(t.slug, seed);
      const where = `${t.slug} seed ${seed}`;
      types.add(q.type);
      assert.ok(["mcq", "msq", "nat"].includes(q.type), where);
      assert.ok(q.marks === 1 || q.marks === 2, where);
      assert.ok(q.stem.length && q.solution.length, where);
      assert.ok(q.replay.startsWith(`/${t.slug}?`), where);
      if (q.type === "nat") {
        assert.ok(Number.isFinite(q.answer), where);
        assert.ok(q.tolerance === 0 || q.tolerance === 0.01, `${where}: tolerance`);
      } else {
        assert.equal(q.options.length, 4, where);
        assert.equal(new Set(q.options).size, 4, `${where}: duplicate options`);
        assert.ok(q.answer >= 0 && q.answer < 4, where);
      }
      assert.equal(check(q, q.answer).correct, true, where);
      // No en or em dashes in the copy.
      assert.doesNotMatch(JSON.stringify([q.stem, q.solution, q.options ?? []]), /[–—]/, `${where}: dash`);
    }
    if (t.slug === "matrices" || t.slug === "aptitude") assert.ok(types.has("mcq") && types.has("nat"), `${t.slug} should have MCQ and NAT`);
  }
});

test("GATE replays reproduce the question's input", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const q = generate("matrices", seed);
    const params = new URLSearchParams(q.replay.split("?")[1]);
    const A = parseMatrix(params.get("m"));
    const mode = params.get("mode");
    if (mode === "det" && q.type === "nat" && q.stem.length === 2) assert.equal(determinant(A).det.toNumber(), q.answer, `det seed ${seed}`);
    if (mode === "rref") assert.equal(rank(A), q.answer, `rank seed ${seed}`);
  }
  for (let seed = 1; seed <= 60; seed++) {
    const q = generate("calculus", seed);
    const p = new URLSearchParams(q.replay.split("?")[1]);
    if (p.get("mode") === "limit") close(limit(p.get("f"), p.get("at")).answer, q.answer, 0.01, `limit seed ${seed}`);
    if (p.get("mode") === "integral") close(integral(p.get("f"), p.get("a"), p.get("b"), "simpson", 8).exact, q.answer, 0.01, `integral seed ${seed}`);
  }
  for (let seed = 1; seed <= 60; seed++) {
    const q = generate("aptitude", seed);
    const p = Object.fromEntries(new URLSearchParams(q.replay.split("?")[1]));
    const v = APT[p.topic].variants[p.type];
    const params = Object.fromEntries(v.params.map(([k, , d]) => [k, typeof d === "number" ? Number(p[k]) : p[k]]));
    const res = aptSolve(p.topic, p.type, params);
    if (q.type === "nat") close(res.answer, q.answer, 0.01, `aptitude seed ${seed}`);
  }
  for (let seed = 1; seed <= 60; seed++) {
    const q = generate("probability", seed);
    const p = Object.fromEntries(new URLSearchParams(q.replay.split("?")[1]));
    if (p.mode === "bayes") close(bayes(p.prior, p.hit, p.fa).posterior.toNumber(), q.answer, 0.01, `bayes seed ${seed}`);
    if (p.mode === "dist" && q.type === "nat") {
      const keys = { binomial: ["n", "p"], poisson: ["lambda"], geometric: ["p"], uniform: ["a", "b"], exponential: ["lambda"], normal: ["mu", "sigma"] }[p.dist];
      const r = distribution(p.dist, Object.fromEntries(keys.map((k) => [k, Number(p[k])])), p.q, Number(p.x), p.y === undefined ? Number(p.x) : Number(p.y));
      close(r.answer, q.answer, 0.01, `dist seed ${seed}`);
    }
  }
});
