// AI tool schemas: engineering maths. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { determinant, eigen, encodeMatrix, inverse, parseMatrix, polyText, rowReduce, solveSystem } from "../../engines/matrices.js";
import { Fraction } from "../../engines/fraction.js";
import { METHODS, extrema, integral, limit, mvt } from "../../engines/calculus.js";
import { DISTS, EVENTS, EXPERIMENTS, QUERIES, bayes, distribution, randomVariable, sampleSpace } from "../../engines/probability.js";
import { TOPICS as APT, solve as aptSolve } from "../../engines/aptitude.js";

// matrices.js: the default matrix depends on the mode.
const MATRIX_DEFAULTS = { ref: "1,2,1,3;2,4,0,2;3,6,1,5", rref: "1,2,1,3;2,4,0,2;3,6,1,5", det: "0,2,1;1,3,2;2,1,4", inverse: "2,1,1;1,3,2;1,0,0", solve: "2,1,-1;-3,-1,2;-2,1,2", eigen: "4,1;2,3" };
// calculus.js: the default function depends on the mode.
const CALC_DEFAULTS = { limit: "sin(x)/x", extrema: "x^3 - 3x + 2", integral: "x^2", mvt: "x^3" };
const finite = (x) => (Number.isFinite(x) ? round(x) : String(x));
const ascii = (s) => String(s).replace(/\u2212/g, "-");
const frac = (f) => (f === null ? "undefined" : f.toText());
const dec = (f) => (f === null ? "undefined" : round(f.toNumber()));
// probability.js reads the uniform ends as decimals or fractions.
const fnum = (x, what) => {
  try { return Fraction.parse(String(x)).toNumber(); } catch { throw new Error(`${what} must be a number or fraction like 3/4 (got "${x}").`); }
};
const EVENT_LIST = Object.entries(EVENTS).map(([exp, ev]) => `${exp}: ${Object.entries(ev).map(([id, e]) => `${id} (${e.label("k")})`).join(", ")}`).join("; ");
// aptitude.js: every key any question type reads, with what it means there.
const APT_KEYS = {};
for (const [t, T] of Object.entries(APT)) for (const [vid, V] of Object.entries(T.variants)) for (const [k, label, d] of V.params) (APT_KEYS[k] ??= []).push(`${t}/${vid}: ${label} (default ${d})`);
const APT_TYPES = Object.entries(APT).map(([t, T]) => `${t}: ${Object.entries(T.variants).map(([vid, V]) => `${vid} (${V.name}; ${V.params.map(([k, label]) => `${k} = ${label}`).join(", ")})`).join(", ")}`).join(". ");

export const SCHEMAS = [
  tool("matrices", {
    keywords: "matrix linear algebra rank nullity row echelon form ref rref gaussian elimination gauss jordan determinant det inverse singular invertible system of linear equations ax=b consistent unique infinitely many solutions eigenvalue eigenvector characteristic polynomial trace diagonalisable algebraic geometric multiplicity",
    params: {
      mode: { type: "enum", values: Object.keys(MATRIX_DEFAULTS), default: "rref", desc: "ref (row echelon form and rank), rref (reduced row echelon form and rank), det (determinant), inverse (Gauss-Jordan inverse), solve (Ax = b), eigen (eigenvalues and eigenvectors, 2x2 or 3x3 only)" },
      m: { type: "string", format: 'rows separated by ";", entries by ","; integers, decimals or fractions like 3/4; at most 5 rows and 6 columns; e.g. "2,1;1,3" is [[2,1],[1,3]]', desc: "the matrix A (det, inverse and eigen need it square); if absent the view shows a sample matrix for the mode" },
      b: { type: "string", format: 'one entry per row of A separated by ","; e.g. "8,-11,-3"', default: "8,-11,-3", desc: "right-hand side b, solve mode only" },
    },
    answers: {
      rank: "rank of A (ref, rref, solve)", nullity: "columns minus rank (ref, rref)", pivots: "pivot columns, 1-based (ref, rref)", rref: "the reduced matrix, rows split by ; (ref, rref)",
      det: "determinant (det, inverse, eigen)", invertible: "whether A is invertible (det, inverse)", inverse: "A inverse, rows split by ; (inverse)",
      kind: "unique, infinite or none (solve)", rankAug: "rank of [A | b] (solve)", x: "the solution, or a particular solution plus free directions (solve)", "x1": "x1 of a unique solution (one key per unknown: x2, x3, ...)",
      eigenvalues: "eigenvalues with repeats, as text (eigen)", largest: "largest real eigenvalue", smallest: "smallest real eigenvalue", sumSquares: "sum of squares of the eigenvalues, the trace of A squared", trace: "trace of A", poly: "characteristic polynomial", diagonalisable: "whether A is diagonalisable over the reals", eigenvectors: "eigenvectors for each eigenvalue",
    },
    examples: [
      { request: "Find the eigenvalues of [[2, 1], [1, 2]]", params: { mode: "eigen", m: "2,1;1,2" } },
      { request: "Solve x + y + z = 6, 2y + 5z = -4, 2x + 5y - z = 27", params: { mode: "solve", m: "1,1,1;0,2,5;2,5,-1", b: "6,-4,27" } },
    ],
    validate(v) {
      const square = ["det", "inverse", "eigen"].includes(v.mode);
      const A = parseMatrix(v.m ?? MATRIX_DEFAULTS[v.mode], { square, max: 5 });
      const enc = encodeMatrix(A);
      if (v.mode === "ref" || v.mode === "rref") {
        const r = rowReduce(A, { reduced: v.mode === "rref" });
        const pivots = r.pivots.map(([, c]) => c + 1).join(", ") || "none";
        return { text: `A has rank ${r.rank} and nullity ${A[0].length - r.rank}; pivot columns ${pivots}; ${v.mode === "rref" ? "RREF" : "echelon form"} ${encodeMatrix(r.matrix)}.`,
          values: { rank: r.rank, nullity: A[0].length - r.rank, pivots, rref: encodeMatrix(r.matrix) } };
      }
      if (v.mode === "det") {
        const { det } = determinant(A);
        return { text: `det(A) = ${det.toText()}, so A is ${det.isZero() ? "singular" : "invertible"}.`, values: { det: det.toText(), invertible: !det.isZero() } };
      }
      if (v.mode === "inverse") {
        const { det } = determinant(A);
        const r = inverse(A);
        if (!r.inverse) return { text: "A is singular (det A = 0), so it has no inverse.", values: { det: "0", invertible: false } };
        return { text: `det(A) = ${det.toText()}; A inverse = ${encodeMatrix(r.inverse)} (rows split by ;).`, values: { det: det.toText(), invertible: true, inverse: encodeMatrix(r.inverse) } };
      }
      if (v.mode === "solve") {
        const b = v.b.split(/[,\s]+/).filter(Boolean).map((x) => Fraction.parse(x));
        if (b.length !== A.length) throw new Error(`b needs ${A.length} entries, one per row of A (got ${b.length}).`);
        const r = solveSystem(A, b);
        const vec = (w) => `(${w.map((x) => x.toText?.() ?? String(x)).join(", ")})`;
        const x = r.kind === "none" ? "none" : `${vec(r.x)}${r.basis.map((w, i) => ` + t${i + 1}*${vec(w)}`).join("")}`;
        const values = { kind: r.kind, rank: r.rankA, rankAug: r.rankAug, x };
        if (r.kind === "unique") r.x.forEach((xi, i) => { values[`x${i + 1}`] = Fraction.from(xi).toNumber(); });
        const said = { unique: "exactly one solution", infinite: "infinitely many solutions", none: "no solution" }[r.kind];
        return { text: `rank(A) = ${r.rankA}, rank([A | b]) = ${r.rankAug}, so the system has ${said}${r.kind === "none" ? "" : `: x = ${x}`}.`, values };
      }
      if (A.length < 2 || A.length > 3) throw new Error("Eigenvalues here are for 2x2 and 3x3 matrices.");
      const r = eigen(A);
      const show = (e) => ascii(e.exact ? e.exact.toText() : e.text);
      const all = r.values.flatMap((e) => Array(e.mult).fill(e)).sort((x, y) => x.value - y.value || (x.im ?? 0) - (y.im ?? 0));
      const real = all.filter((e) => !e.im).map((e) => e.value).sort((a, b) => a - b);
      const diag = !r.values.some((e) => e.im) && r.values.every((e) => e.geometric === e.mult);
      const eigenvalues = all.map(show).join(", ");
      const values = { eigenvalues, trace: r.trace.toText(), det: r.det.toText(), poly: ascii(polyText(r.poly)), diagonalisable: diag,
        eigenvectors: ascii(r.values.map((e) => `${show(e)}: ${e.vectors.length ? e.vectors.map((w) => `(${w.join(", ")})`).join(" ") : "complex"}`).join("; ")) };
      if (real.length) { values.largest = round(real.at(-1)); values.smallest = round(real[0]); }
      if (real.length === all.length) values.sumSquares = round(real.reduce((s, x) => s + x * x, 0));
      return { text: `A = ${enc}: eigenvalues ${eigenvalues} (trace ${values.trace}, determinant ${values.det}); ${diag ? "diagonalisable" : "not diagonalisable"} over the reals.`, values };
    },
  }),

  tool("calculus", {
    keywords: "limit lhopital l'hopital indeterminate form 0/0 infinity maxima minima turning point stationary critical point local global absolute maximum minimum derivative second derivative test definite integral area riemann sum trapezoidal simpson midpoint mean value theorem rolle",
    params: {
      mode: { type: "enum", values: ["limit", "extrema", "integral", "mvt"], default: "limit", desc: "limit, extrema (maxima and minima of a polynomial), integral (definite integral), mvt (mean value theorem)" },
      f: { type: "string", format: 'a function of x: + - * / ^, sin cos tan exp ln sqrt abs, pi, e; implicit multiplication allowed, e.g. "3x^2 - 2x", "sin(2x)/(3x)", "(1 + 2/x)^x"; extrema needs a polynomial of degree 2 to 6', desc: "the function; if absent the view shows a sample function for the mode" },
      at: { type: "string", format: 'a number, pi expression, "inf" or "-inf"; e.g. "0", "2", "inf"', default: "0", desc: "limit only: the point x tends to" },
      lo: { type: "string", format: 'a number or fraction, e.g. "-1"', default: "", desc: "extrema only: left end of a closed interval for absolute max and min (give with hi)" },
      hi: { type: "string", format: 'a number or fraction, e.g. "3"', default: "", desc: "extrema only: right end of the interval" },
      a: { type: "string", format: 'a number, fraction or pi expression, e.g. "0", "1/2", "pi/2"', default: "0", desc: "integral and mvt: lower end" },
      b: { type: "string", format: 'a number, fraction or pi expression, e.g. "2", "pi"', default: "2", desc: "integral and mvt: upper end (must be above a)" },
      method: { type: "enum", values: Object.keys(METHODS), default: "mid", desc: "integral only: left, right, mid (midpoint), trap (trapezoidal) or simpson (needs even n)" },
      n: { type: "int", min: 1, max: 256, default: 16, desc: "integral only: number of strips for the numerical rule" },
    },
    answers: {
      limit: "the limit (number, or Infinity)", limitText: "the limit in exact-looking form (e.g. 1/2, e, does not exist)", method: "how the limit was found",
      maxAt: "x of the first local maximum", maxValue: "local maximum value", minAt: "x of the first local minimum", minValue: "local minimum value", points: "every critical point with its type", absMax: "absolute maximum on [lo, hi]", absMaxAt: "where it is", absMin: "absolute minimum on [lo, hi]", absMinAt: "where it is",
      exact: "exact (or reference) value of the integral", exactText: "exact value as text", approx: "value from the chosen rule with n strips", error: "rule minus exact",
      c: "the c from the mean value theorem (first one)", cs: "all such c", slope: "secant slope (f(b) - f(a)) / (b - a)",
    },
    examples: [
      { request: "Evaluate the limit of (1 - cos(2x))/x^2 as x tends to 0", params: { mode: "limit", f: "(1 - cos(2x))/x^2", at: "0" } },
      { request: "Absolute maximum of 2x^3 - 9x^2 + 12x + 1 on [0, 3]", params: { mode: "extrema", f: "2x^3 - 9x^2 + 12x + 1", lo: "0", hi: "3" } },
      { request: "Integrate sin(x) from 0 to pi with Simpson's rule, n = 8", params: { mode: "integral", f: "sin(x)", a: "0", b: "pi", method: "simpson", n: 8 } },
    ],
    validate(v) {
      const f = v.f ?? CALC_DEFAULTS[v.mode];
      if (v.mode === "limit") {
        const r = limit(f, v.at);
        return { text: `The limit of ${f} as x tends to ${v.at} ${r.text === "does not exist" ? "does not exist" : `is ${ascii(r.text)}`} (found by ${r.method === "lhopital" ? "L'Hopital's rule" : r.method === "substitution" ? "direct substitution" : "a table of values"}).`,
          values: { limit: finite(r.answer), limitText: ascii(r.text), method: r.method } };
      }
      if (v.mode === "extrema") {
        const iv = v.lo.trim() && v.hi.trim() ? [v.lo.trim(), v.hi.trim()] : null;
        const r = extrema(f, iv);
        const at = (pt) => (pt.x.exact ? pt.x.exact.toNumber() : round(pt.x.value));
        const values = { points: ascii(r.points.map((pt) => `x = ${pt.x.exact ? pt.x.exact.toText() : round(pt.x.value)}: ${pt.kind} (${round(pt.value)})`).join("; ")) || "none" };
        const mx = r.points.find((pt) => pt.kind === "max"), mn = r.points.find((pt) => pt.kind === "min");
        if (mx) { values.maxAt = at(mx); values.maxValue = round(mx.value); }
        if (mn) { values.minAt = at(mn); values.minValue = round(mn.value); }
        let extra = "";
        if (r.absolute) {
          Object.assign(values, { absMax: round(r.absolute.max.value), absMaxAt: ascii(r.absolute.max.x), absMin: round(r.absolute.min.value), absMinAt: ascii(r.absolute.min.x) });
          extra = ` On [${iv[0]}, ${iv[1]}] the absolute maximum is ${values.absMax} at x = ${values.absMaxAt} and the absolute minimum ${values.absMin} at x = ${values.absMinAt}.`;
        }
        return { text: `${mx ? `Local maximum ${values.maxValue} at x = ${values.maxAt}` : "No local maximum"}; ${mn ? `local minimum ${values.minValue} at x = ${values.minAt}` : "no local minimum"}.${extra}`, values };
      }
      if (v.mode === "integral") {
        if (v.method === "simpson" && v.n % 2) throw new Error("Simpson's rule needs an even n.");
        const r = integral(f, v.a, v.b, v.method, v.n);
        const last = r.sums.at(-1);
        const exact = r.exact ?? r.reference;
        const exactText = r.exactText === null ? String(round(exact)) : ascii(r.exactText);
        return { text: `The integral of ${f} from ${v.a} to ${v.b} is ${exactText}${r.exact === null ? " (numerical reference)" : ""}; the ${METHODS[v.method].name} with n = ${last.n} gives ${round(last.sum)}.`,
          values: { exact: round(exact), exactText, approx: round(last.sum), error: round(last.error, 6) } };
      }
      const r = mvt(f, v.a, v.b);
      return { text: `Secant slope ${round(r.slope)}; f'(c) equals it at c = ${ascii(r.cs.map((c) => c.text).join(", ")) || "none found"} in (${v.a}, ${v.b}).`,
        values: { slope: round(r.slope), cs: ascii(r.cs.map((c) => c.text).join(", ")) || "none", ...(r.cs.length ? { c: round(r.cs[0].value) } : {}) } };
    },
  }),

  tool("probability", {
    keywords: "probability sample space dice coins events conditional probability independent mutually exclusive bayes theorem total probability prior posterior false positive random variable expectation expected value mean variance standard deviation distribution binomial poisson geometric uniform exponential normal gaussian z score pmf pdf cdf",
    params: {
      mode: { type: "enum", values: ["space", "bayes", "rv", "dist"], default: "bayes", desc: "space (two dice or three coins, events A and B), bayes (P(A | B) from a prior and two likelihoods), rv (E[X] and Var(X) of a discrete random variable), dist (a standard distribution)" },
      exp: { type: "enum", values: Object.keys(EXPERIMENTS), default: "dice", desc: "space: dice (two dice) or coins (three coins)" },
      a: { type: "string", format: `space: an event id (${EVENT_LIST}); dist with uniform: the lower end, a number`, default: "sum", desc: "space: event A; uniform distribution: lower end a (0 if not given)" },
      ka: { type: "int", min: 0, max: 12, default: 7, desc: "space: the k in event A, for events that take one (sum = k, at least k heads, ...)" },
      b: { type: "string", format: "space: an event id as for a; dist with uniform: the upper end, a number", default: "first", desc: "space: event B; uniform distribution: upper end b (10 if not given)" },
      kb: { type: "int", min: 0, max: 12, default: 3, desc: "space: the k in event B" },
      prior: { type: "string", format: 'a decimal or fraction in [0, 1], e.g. "0.01" or "1/4"', default: "0.01", desc: "bayes: P(A), the prior" },
      hit: { type: "string", format: "a decimal or fraction in [0, 1]", default: "0.9", desc: "bayes: P(B | A), e.g. a test's sensitivity" },
      fa: { type: "string", format: "a decimal or fraction in [0, 1]", default: "0.09", desc: "bayes: P(B | not A), the false-alarm rate" },
      xs: { type: "string", format: 'values separated by ",", at most 10, e.g. "0,1,2,3"', default: "0,1,2,3", desc: "rv: the values of X" },
      ps: { type: "string", format: 'one probability per value separated by ",", decimals or fractions adding up to exactly 1, e.g. "1/8,3/8,3/8,1/8"', default: "1/8,3/8,3/8,1/8", desc: "rv: P(X = x) for each value" },
      dist: { type: "enum", values: Object.keys(DISTS), default: "binomial", desc: "dist: binomial (n, p), poisson (lambda), geometric (p; X counts trials up to and including the first success), uniform (a, b), exponential (lambda, the rate, mean 1/lambda), normal (mu, sigma)" },
      n: { type: "int", min: 1, max: 60, desc: "binomial: number of trials (default 10)" },
      p: { type: "number", min: 0, max: 1, desc: "binomial or geometric: success probability (default 0.3 binomial, 0.25 geometric)" },
      lambda: { type: "number", min: 0, max: 50, desc: "poisson: mean rate, at most 30 (default 3); exponential: rate, mean 1/lambda (default 0.5)" },
      mu: { type: "number", desc: "normal: mean (default 50)" },
      sigma: { type: "number", min: 0, desc: "normal: standard deviation, not variance (default 10)" },
      q: { type: "enum", values: Object.keys(QUERIES), default: "le", desc: "dist: eq P(X = x), le P(X <= x), ge P(X >= x), between P(x <= X <= y)" },
      x: { type: "number", default: 3, desc: "dist: the value x in the query" },
      y: { type: "number", default: 5, desc: "dist: the upper value y, for between only" },
    },
    answers: {
      pA: "P(A) (space)", pB: "P(B) (space)", pAB: "P(A and B) (space)", pAuB: "P(A or B) (space)", pAgB: "P(A | B) (space, bayes)", pBgA: "P(B | A) (space)", independent: "whether A and B are independent (space)",
      pAgB_frac: "P(A | B) as an exact fraction", posterior: "P(A | B) from Bayes (bayes)", pBtotal: "P(B) by total probability (bayes)",
      mean: "E[X] (rv, dist)", variance: "Var(X) (rv, dist)", sd: "standard deviation", ex2: "E[X^2] (rv)", answer: "the probability asked for (dist)",
    },
    examples: [
      { request: "1% of people have a disease; the test catches 90% of cases with 9% false positives. P(disease | positive)?", params: { mode: "bayes", prior: "0.01", hit: "0.9", fa: "0.09" } },
      { request: "A coin with P(heads) 0.6 is tossed 8 times. Probability of at least 6 heads?", params: { mode: "dist", dist: "binomial", n: 8, p: 0.6, q: "ge", x: 6 } },
      { request: "Two dice: P(sum is 8 | a double)?", params: { mode: "space", exp: "dice", a: "sum", ka: 8, b: "doubles" } },
    ],
    validate(v) {
      if (v.mode === "space") {
        const ev = EVENTS[v.exp];
        // As the view: an unknown event falls back to a sample one.
        let { a, ka, b, kb } = v;
        if (!ev[a]) { a = Object.keys(ev)[0]; ka = ev[a].k?.[2] ?? 0; }
        if (!ev[b]) { b = Object.keys(ev)[3]; kb = ev[b].k?.[2] ?? 0; }
        for (const [id, k] of [[a, ka], [b, kb]]) if (ev[id].k && (k < ev[id].k[0] || k > ev[id].k[1])) throw new Error(`k for ${id} must be from ${ev[id].k[0]} to ${ev[id].k[1]}.`);
        const r = sampleSpace(v.exp, a, ka, b, kb);
        return { text: `A = ${r.labels[0]}, B = ${r.labels[1]}: P(A) = ${frac(r.pA)}, P(B) = ${frac(r.pB)}, P(A and B) = ${frac(r.pAB)}, P(A | B) = ${frac(r.pAgB)}; ${r.independent ? "independent" : "not independent"}.`,
          values: { pA: dec(r.pA), pB: dec(r.pB), pAB: dec(r.pAB), pAuB: dec(r.pAuB), pAgB: dec(r.pAgB), pBgA: dec(r.pBgA), pAgB_frac: frac(r.pAgB), independent: r.independent } };
      }
      if (v.mode === "bayes") {
        const r = bayes(v.prior, v.hit, v.fa);
        return { text: `P(B) = ${frac(r.pB)}, so P(A | B) = ${frac(r.posterior)} = ${round(r.posterior.toNumber())}.`,
          values: { posterior: dec(r.posterior), pAgB: dec(r.posterior), pAgB_frac: frac(r.posterior), pBtotal: dec(r.pB) } };
      }
      if (v.mode === "rv") {
        const r = randomVariable(v.xs.split(/[,\s]+/).filter(Boolean), v.ps.split(/[,\s]+/).filter(Boolean));
        return { text: `E[X] = ${frac(r.mean)}, E[X^2] = ${frac(r.ex2)}, Var(X) = ${frac(r.variance)}, SD = ${round(r.sd)}.`,
          values: { mean: dec(r.mean), ex2: dec(r.ex2), variance: dec(r.variance), sd: round(r.sd) } };
      }
      const D = DISTS[v.dist];
      const params = {};
      for (const [k, , d] of D.params) {
        if (k === "a" || k === "b") params[k] = v[k] === (k === "a" ? "sum" : "first") ? d : fnum(v[k], k);
        else params[k] = v[k] ?? d;
      }
      const r = distribution(v.dist, params, v.q, v.x, v.q === "between" ? v.y : v.x);
      const label = r.label.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/−/g, "-");
      return { text: `${D.name} with ${D.params.map(([k]) => `${k} = ${params[k]}`).join(", ")}: ${label} = ${round(r.answer)}; E[X] = ${round(r.mean)}, Var(X) = ${round(r.variance)}.`,
        values: { answer: round(r.answer), mean: round(r.mean), variance: round(r.variance), sd: round(Math.sqrt(r.variance)) } };
    },
  }),

  tool("aptitude", {
    keywords: "quantitative aptitude percentage successive change profit loss discount marked price cost price selling price ratio alligation mixture time and work pipes cisterns speed distance time train boat stream average simple interest compound interest number series clock angle hands calendar day of the week",
    params: {
      topic: { type: "enum", values: Object.keys(APT), default: "work", desc: "the question topic" },
      type: { type: "string", format: `a question type of the topic: ${APT_TYPES}`, desc: "the question type within the topic (default: the topic's first type)" },
      ...Object.fromEntries(Object.entries(APT_KEYS).map(([k, uses]) => [k, k === "s"
        ? { type: "string", format: 'series: terms separated by ", ", e.g. "3, 8, 15, 24, 35"; train: a number', desc: `the input "s": ${uses.join("; ")}` }
        : { type: "number", desc: `the input "${k}": ${uses.join("; ")}` }])),
    },
    answers: { answer: "the answer (a number, or a weekday for calendar questions)", display: "the answer as shown, with units or as an exact fraction", question: "the question, worded in full" },
    examples: [
      { request: "A can do a job in 12 days and B in 15 days. How long together?", params: { topic: "work", type: "together", a: 12, b: 15 } },
      { request: "What day of the week was 26 January 1950?", params: { topic: "calendar", type: "weekday", d: 26, m: 1, y: 1950 } },
    ],
    validate(v) {
      const vs = APT[v.topic].variants;
      const variant = v.type ?? Object.keys(vs)[0];
      if (!vs[variant]) throw new Error(`type for ${v.topic} must be one of ${Object.keys(vs).join(", ")}.`);
      const params = {};
      for (const [k, , d] of vs[variant].params) {
        const x = v[k];
        if (x === undefined) params[k] = d;
        else if (typeof d === "number") { const n = Number(x); if (!Number.isFinite(n)) throw new Error(`${k} must be a number.`); params[k] = n; }
        else params[k] = String(x);
      }
      const r = aptSolve(v.topic, variant, params);
      return { text: `${r.text} Answer: ${ascii(r.display)}.`, values: { answer: typeof r.answer === "number" ? round(r.answer) : r.answer, display: ascii(r.display), question: r.text } };
    },
  }),
];
