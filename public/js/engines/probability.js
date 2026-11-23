// Probability: sample spaces (dice grid, coin tree), conditional probability,
// independence and Bayes' theorem (exact fractions), discrete random variables
// (expectation and variance), and the standard distributions with a numeric
// normal CDF (Simpson's rule on the density, no z-table).
//
// Conventions (stated in the UI):
// - Geometric: X counts the trials up to and including the first success, so
//   P(X = k) = (1 − p)^(k − 1)·p for k = 1, 2, 3, …
// - Exponential uses the rate λ (mean 1/λ). Normal uses μ and σ (not σ²).
// - Continuous distributions give P(X = x) = 0, so ≤ and < are the same there.
import { Fraction, F } from "./fraction.js";

const Z = Fraction.ZERO, ONE = Fraction.ONE;
export const fmt = (x, d = 4) => {
  if (!Number.isFinite(x)) return String(x);
  if (Math.abs(x - Math.round(x)) < 1e-12) return String(Math.round(x)).replace("-", "−");
  return x.toFixed(d).replace(/0+$/, "").replace(/\.$/, "").replace("-", "−");
};

// --- Sample spaces --------------------------------------------------------------------

export const EXPERIMENTS = {
  dice: { name: "Two dice", outcomes: () => { const o = []; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) o.push([a, b]); return o; } },
  coins: { name: "Three coins", outcomes: () => { const o = []; for (let i = 0; i < 8; i++) o.push([4, 2, 1].map((m) => (i & m ? "T" : "H"))); return o; } },
};

const isPrime = (n) => n > 1 && [...Array(n).keys()].slice(2).every((d) => n % d);
// Each event: label from k, and a test on an outcome. k is the parameter.
export const EVENTS = {
  dice: {
    sum: { label: (k) => `sum = ${k}`, test: ([a, b], k) => a + b === k, k: [2, 12, 7] },
    sumAtLeast: { label: (k) => `sum ≥ ${k}`, test: ([a, b], k) => a + b >= k, k: [2, 12, 10] },
    doubles: { label: () => "a double", test: ([a, b]) => a === b },
    first: { label: (k) => `first die = ${k}`, test: ([a], k) => a === k, k: [1, 6, 3] },
    some: { label: (k) => `at least one ${k}`, test: ([a, b], k) => a === k || b === k, k: [1, 6, 6] },
    evenProduct: { label: () => "product is even", test: ([a, b]) => (a * b) % 2 === 0 },
    primeSum: { label: () => "sum is prime", test: ([a, b]) => isPrime(a + b) },
    firstBigger: { label: () => "first > second", test: ([a, b]) => a > b },
  },
  coins: {
    heads: { label: (k) => `exactly ${k} heads`, test: (o, k) => o.filter((c) => c === "H").length === k, k: [0, 3, 2] },
    atLeast: { label: (k) => `at least ${k} heads`, test: (o, k) => o.filter((c) => c === "H").length >= k, k: [0, 3, 1] },
    firstH: { label: () => "first coin is H", test: (o) => o[0] === "H" },
    lastH: { label: () => "last coin is H", test: (o) => o[2] === "H" },
    same: { label: () => "all the same", test: (o) => o.every((c) => c === o[0]) },
    noRun: { label: () => "no two heads in a row", test: (o) => !o.join("").includes("HH") },
  },
};

export const SPACE_CODE = [
  "S ← every outcome  // all equally likely",
  "A ← outcomes where event A happens",
  "B ← outcomes where event B happens",
  "P(A) = |A| / |S|,  P(B) = |B| / |S|",
  "P(A ∩ B) = |A ∩ B| / |S|;  P(A ∪ B) = P(A) + P(B) − P(A ∩ B)",
  "P(A | B) = P(A ∩ B) / P(B) = |A ∩ B| / |B|  // B becomes the new sample space",
  "independent ⇔ P(A ∩ B) = P(A)·P(B)",
];

export function sampleSpace(exp, a, ka, b, kb) {
  const E = EXPERIMENTS[exp], ev = EVENTS[exp];
  if (!E || !ev[a] || !ev[b]) throw new Error("Unknown experiment or event.");
  const S = E.outcomes();
  const inA = S.map((o) => ev[a].test(o, ka)), inB = S.map((o) => ev[b].test(o, kb));
  const n = S.length, nA = inA.filter(Boolean).length, nB = inB.filter(Boolean).length;
  const nAB = S.filter((_, i) => inA[i] && inB[i]).length;
  const la = ev[a].label(ka), lb = ev[b].label(kb);
  const pA = F(nA, n), pB = F(nB, n), pAB = F(nAB, n), pAuB = pA.add(pB).sub(pAB);
  const pAgB = nB ? F(nAB, nB) : null, pBgA = nA ? F(nAB, nA) : null;
  const indep = pAB.equals(pA.mul(pB));
  const steps = [
    { line: 1, show: [], vars: { "|S|": n }, note: `${E.name}: ${n} equally likely outcomes. Every probability here is a count divided by ${n}.` },
    { line: 2, show: ["A"], vars: { "|S|": n, "|A|": nA }, note: `A = ${la}: ${nA} outcome${nA === 1 ? "" : "s"} (highlighted).` },
    { line: 3, show: ["A", "B"], vars: { "|S|": n, "|A|": nA, "|B|": nB }, note: `B = ${lb}: ${nB} outcome${nB === 1 ? "" : "s"}.` },
    { line: 4, show: ["A", "B"], vars: { "P(A)": pA, "P(B)": pB }, note: `P(A) = ${nA}/${n} = ${pA}, P(B) = ${nB}/${n} = ${pB}.` },
    { line: 5, show: ["AB"], vars: { "|A∩B|": nAB, "P(A∩B)": pAB, "P(A∪B)": pAuB }, note: `${nAB} outcome${nAB === 1 ? " is" : "s are"} in both, so P(A ∩ B) = ${nAB}/${n} = ${pAB}. P(A ∪ B) = ${pA} + ${pB} − ${pAB} = ${pAuB}.` },
    { line: 6, show: ["B", "AB"], vars: { "P(A|B)": pAgB ?? "undefined", "P(B|A)": pBgA ?? "undefined" }, note: nB ? `Given B, only the ${nB} outcomes of B are possible, and ${nAB} of them are in A: P(A | B) = ${nAB}/${nB} = ${pAgB}. Compare P(A) = ${pA}.` : "P(B) = 0, so P(A | B) is undefined." },
    { line: 7, show: ["A", "B"], done: true, vars: { "P(A)·P(B)": pA.mul(pB), "P(A∩B)": pAB, independent: indep }, note: indep ? `P(A)·P(B) = ${pA} × ${pB} = ${pA.mul(pB)} = P(A ∩ B), so A and B are independent: knowing B doesn't change the chance of A.` : `P(A)·P(B) = ${pA} × ${pB} = ${pA.mul(pB)} ≠ P(A ∩ B) = ${pAB}, so A and B are not independent: knowing B changes the chance of A.${nAB === 0 && nA && nB ? " (They're mutually exclusive, which is the opposite of independent.)" : ""}` },
  ];
  return { outcomes: S, inA, inB, n, nA, nB, nAB, pA, pB, pAB, pAuB, pAgB, pBgA, independent: indep, labels: [la, lb], steps };
}

// --- Bayes ----------------------------------------------------------------------------

export const BAYES_CODE = [
  "P(A)  // prior: how common A is before any evidence",
  "P(B | A), P(B | not A)  // how likely the evidence is either way",
  "P(A ∩ B) = P(A)·P(B | A);  P(not A ∩ B) = P(not A)·P(B | not A)",
  "P(B) = P(A ∩ B) + P(not A ∩ B)  // total probability",
  "P(A | B) = P(A ∩ B) / P(B)  // Bayes' theorem",
];

const prob = (x, what) => {
  const f = Fraction.from(x);
  if (f.sign() < 0 || f.cmp(ONE) > 0) throw new Error(`${what} must be between 0 and 1.`);
  return f;
};

export function bayes(prior, hit, falseHit) {
  const pA = prob(prior, "P(A)"), pBA = prob(hit, "P(B | A)"), pBnA = prob(falseHit, "P(B | not A)");
  const pnA = ONE.sub(pA);
  const jA = pA.mul(pBA), jnA = pnA.mul(pBnA);
  const pB = jA.add(jnA);
  if (pB.isZero()) throw new Error("P(B) works out to 0, so P(A | B) is undefined.");
  const post = jA.div(pB);
  const postNot = pnA.mul(ONE.sub(pBnA)).div(ONE.sub(pB).isZero() ? ONE : ONE.sub(pB));
  const d = (f) => `${f}${f.isInteger() ? "" : ` ≈ ${fmt(f.toNumber())}`}`;
  const steps = [
    { line: 1, stage: 1, vars: { "P(A)": pA, "P(not A)": pnA }, note: `Before any evidence, P(A) = ${d(pA)}, so P(not A) = 1 − ${pA} = ${pnA}.` },
    { line: 2, stage: 2, vars: { "P(B|A)": pBA, "P(B|not A)": pBnA }, note: `If A is true, B happens with probability ${pBA}; if not, with probability ${pBnA} (false alarms).` },
    { line: 3, stage: 3, vars: { "P(A∩B)": jA, "P(not A∩B)": jnA }, note: `Multiply along each branch: P(A ∩ B) = ${pA} × ${pBA} = ${d(jA)} and P(not A ∩ B) = ${pnA} × ${pBnA} = ${d(jnA)}.` },
    { line: 4, stage: 4, vars: { "P(B)": pB }, note: `B can happen two ways, so P(B) = ${jA} + ${jnA} = ${d(pB)}. That's the law of total probability.` },
    { line: 5, stage: 5, done: true, vars: { "P(A|B)": post, "≈": fmt(post.toNumber()) }, note: `Of all the ways B happens, the share where A is true is P(A | B) = ${jA} / ${pB} = ${d(post)}.${post.cmp(F(1, 2)) < 0 && pBA.cmp(F(9, 10)) >= 0 ? " Even with reliable evidence, a rare A stays fairly unlikely: most B's come from the much larger not-A group." : ""}` },
  ];
  return { pA, pnA, pBA, pBnA, jA, jnA, pB, posterior: post, postNotGivenNotB: postNot, steps };
}

// --- Discrete random variables --------------------------------------------------------

export const RV_CODE = [
  "check every p ≥ 0 and Σp = 1",
  "E[X] ← Σ x·p(x)  // the balance point",
  "E[X²] ← Σ x²·p(x)",
  "Var(X) ← E[X²] − (E[X])²",
  "SD ← √Var(X)",
];

export function randomVariable(xs, ps) {
  if (!xs.length || xs.length !== ps.length) throw new Error("Give one probability for each value.");
  if (xs.length > 10) throw new Error("Use at most 10 values.");
  const X = xs.map((x) => Fraction.from(x)), P = ps.map((p) => prob(p, "Each probability"));
  const total = P.reduce((s, p) => s.add(p), Z);
  if (!total.equals(ONE)) throw new Error(`The probabilities add up to ${total}, not 1.`);
  const steps = [{ line: 1, upto: -1, vars: { "Σp": total }, note: `${X.length} values; the probabilities add up to 1, so this is a valid distribution.` }];
  let ex = Z, ex2 = Z;
  X.forEach((x, i) => {
    ex = ex.add(x.mul(P[i]));
    ex2 = ex2.add(x.mul(x).mul(P[i]));
    steps.push({ line: [2, 3], upto: i, vars: { x, "p(x)": P[i], "x·p": x.mul(P[i]), "x²·p": x.mul(x).mul(P[i]), "E[X] so far": ex, "E[X²] so far": ex2 }, note: `x = ${x}: add ${x} × ${P[i]} = ${x.mul(P[i])} to E[X] and ${x}² × ${P[i]} = ${x.mul(x).mul(P[i])} to E[X²].` });
  });
  const v = ex2.sub(ex.mul(ex));
  steps.push({ line: 4, upto: X.length - 1, vars: { "E[X]": ex, "E[X²]": ex2, "Var(X)": v }, note: `Var(X) = E[X²] − (E[X])² = ${ex2} − (${ex})² = ${v}.` });
  steps.push({ line: 5, upto: X.length - 1, done: true, vars: { "E[X]": ex, "Var(X)": v, SD: fmt(Math.sqrt(v.toNumber())) }, note: `Standard deviation = √${v} ≈ ${fmt(Math.sqrt(v.toNumber()))}. The mean is ${ex}${ex.isInteger() ? "" : ` ≈ ${fmt(ex.toNumber())}`}.` });
  return { xs: X, ps: P, mean: ex, ex2, variance: v, sd: Math.sqrt(v.toNumber()), steps };
}

// --- Distributions --------------------------------------------------------------------

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}
const factorial = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };

// Simpson's rule, n even.
export function simpson(f, a, b, n = 2000) {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}
export const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
// Standard normal CDF: Φ(z) = 1/2 + ∫₀^z φ(t) dt, integrated numerically.
export function Phi(z) {
  if (z > 9) return 1;
  if (z < -9) return 0;
  const area = simpson(phi, 0, Math.abs(z), 2000);
  return z >= 0 ? 0.5 + area : 0.5 - area;
}

export const DISTS = {
  binomial: { name: "Binomial", discrete: true, params: [["n", "trials", 10], ["p", "success probability", 0.3]],
    pmf: ({ n, p }, k) => (Number.isInteger(k) && k >= 0 && k <= n ? choose(n, k) * p ** k * (1 - p) ** (n - k) : 0),
    support: ({ n }) => [0, n], mean: ({ n, p }) => n * p, variance: ({ n, p }) => n * p * (1 - p),
    formula: "P(X = k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ", meanText: "E[X] = np, Var(X) = np(1 − p)",
    term: ({ n, p }, k) => `C(${n}, ${k})·${fmt(p)}^${k}·${fmt(1 - p)}^${n - k} = ${choose(n, k)} × ${fmt(p ** k, 6)} × ${fmt((1 - p) ** (n - k), 6)}`,
    check: ({ n, p }) => (!Number.isInteger(n) || n < 1 || n > 60 ? "n must be a whole number from 1 to 60." : !(p >= 0 && p <= 1) ? "p must be between 0 and 1." : null) },
  poisson: { name: "Poisson", discrete: true, params: [["lambda", "rate λ (mean)", 3]],
    pmf: ({ lambda }, k) => (Number.isInteger(k) && k >= 0 ? Math.exp(-lambda) * lambda ** k / factorial(k) : 0),
    support: ({ lambda }) => [0, Math.max(8, Math.ceil(lambda + 4 * Math.sqrt(lambda)))], mean: ({ lambda }) => lambda, variance: ({ lambda }) => lambda,
    formula: "P(X = k) = e^(−λ)·λᵏ / k!", meanText: "E[X] = Var(X) = λ",
    term: ({ lambda }, k) => `e^(−${fmt(lambda)})·${fmt(lambda)}^${k} / ${k}! = ${fmt(Math.exp(-lambda), 6)} × ${fmt(lambda ** k, 6)} / ${factorial(k)}`,
    check: ({ lambda }) => (!(lambda > 0 && lambda <= 30) ? "λ must be between 0 and 30." : null) },
  geometric: { name: "Geometric", discrete: true, params: [["p", "success probability", 0.25]],
    pmf: ({ p }, k) => (Number.isInteger(k) && k >= 1 ? (1 - p) ** (k - 1) * p : 0),
    support: ({ p }) => [1, Math.max(6, Math.min(40, Math.ceil(Math.log(0.002) / Math.log(1 - p || 0.5))))], mean: ({ p }) => 1 / p, variance: ({ p }) => (1 - p) / (p * p),
    formula: "P(X = k) = (1 − p)ᵏ⁻¹·p  (k = 1, 2, …)", meanText: "E[X] = 1/p, Var(X) = (1 − p)/p²",
    term: ({ p }, k) => `${fmt(1 - p)}^${k - 1} × ${fmt(p)}`,
    check: ({ p }) => (!(p > 0 && p <= 1) ? "p must be above 0 and at most 1." : null) },
  uniform: { name: "Uniform (continuous)", discrete: false, params: [["a", "lower end a", 0], ["b", "upper end b", 10]],
    pdf: ({ a, b }, x) => (x >= a && x <= b ? 1 / (b - a) : 0),
    cdf: ({ a, b }, x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)),
    range: ({ a, b }) => [a - (b - a) * 0.15, b + (b - a) * 0.15], mean: ({ a, b }) => (a + b) / 2, variance: ({ a, b }) => (b - a) ** 2 / 12,
    formula: "f(x) = 1/(b − a) on [a, b];  F(x) = (x − a)/(b − a)", meanText: "E[X] = (a + b)/2, Var(X) = (b − a)²/12",
    cdfText: ({ a, b }, x) => (x <= a ? `${fmt(x)} ≤ a, so F = 0` : x >= b ? `${fmt(x)} ≥ b, so F = 1` : `F(${fmt(x)}) = (${fmt(x)} − ${fmt(a)}) / (${fmt(b)} − ${fmt(a)}) = ${fmt((x - a) / (b - a))}`),
    check: ({ a, b }) => (!(b > a) ? "b must be bigger than a." : null) },
  exponential: { name: "Exponential", discrete: false, params: [["lambda", "rate λ", 0.5]],
    pdf: ({ lambda }, x) => (x >= 0 ? lambda * Math.exp(-lambda * x) : 0),
    cdf: ({ lambda }, x) => (x <= 0 ? 0 : 1 - Math.exp(-lambda * x)),
    range: ({ lambda }) => [0, 5 / lambda], mean: ({ lambda }) => 1 / lambda, variance: ({ lambda }) => 1 / lambda ** 2,
    formula: "f(x) = λe^(−λx) for x ≥ 0;  F(x) = 1 − e^(−λx)", meanText: "E[X] = 1/λ, Var(X) = 1/λ²",
    cdfText: ({ lambda }, x) => (x <= 0 ? `${fmt(x)} ≤ 0, so F = 0` : `F(${fmt(x)}) = 1 − e^(−${fmt(lambda)} × ${fmt(x)}) = 1 − ${fmt(Math.exp(-lambda * x), 6)} = ${fmt(1 - Math.exp(-lambda * x))}`),
    check: ({ lambda }) => (!(lambda > 0 && lambda <= 50) ? "λ must be above 0." : null) },
  normal: { name: "Normal", discrete: false, params: [["mu", "mean μ", 50], ["sigma", "standard deviation σ", 10]],
    pdf: ({ mu, sigma }, x) => phi((x - mu) / sigma) / sigma,
    cdf: ({ mu, sigma }, x) => Phi((x - mu) / sigma),
    range: ({ mu, sigma }) => [mu - 3.6 * sigma, mu + 3.6 * sigma], mean: ({ mu }) => mu, variance: ({ sigma }) => sigma * sigma,
    formula: "z = (x − μ)/σ;  Φ(z) = ½ + ∫₀ᶻ φ(t) dt, φ(t) = e^(−t²/2)/√(2π)", meanText: "E[X] = μ, Var(X) = σ²",
    cdfText: ({ mu, sigma }, x) => { const z = (x - mu) / sigma; return `z = (${fmt(x)} − ${fmt(mu)}) / ${fmt(sigma)} = ${fmt(z)}; Φ(${fmt(z)}) = ½ ${z < 0 ? "−" : "+"} ∫₀^${fmt(Math.abs(z))} φ(t) dt ≈ 0.5 ${z < 0 ? "−" : "+"} ${fmt(Math.abs(Phi(z) - 0.5))} = ${fmt(Phi(z))}`; },
    check: ({ sigma }) => (!(sigma > 0) ? "σ must be above 0." : null) },
};

export const QUERIES = { eq: "P(X = a)", le: "P(X ≤ a)", ge: "P(X ≥ a)", between: "P(a ≤ X ≤ b)" };
export const DIST_CODE = [
  "choose the model and its parameters",
  "discrete: P(X = k) from the pmf formula",
  "P(X ≤ a) = Σ P(X = k) for k ≤ a  // add up the bars",
  "P(X ≥ a) = 1 − P(X ≤ a − 1)  // complement: fewer terms",
  "continuous: P(a ≤ X ≤ b) = F(b) − F(a)  // area under f",
  "mean and variance from the closed forms",
];

const qText = (q, a, b) => (q === "eq" ? `P(X = ${fmt(a)})` : q === "le" ? `P(X ≤ ${fmt(a)})` : q === "ge" ? `P(X ≥ ${fmt(a)})` : `P(${fmt(a)} ≤ X ≤ ${fmt(b)})`);

export function distribution(id, params, query = "le", a = 0, b = a) {
  const D = DISTS[id];
  if (!D) throw new Error("Unknown distribution.");
  const err = D.check(params);
  if (err) throw new Error(err);
  if (!Number.isFinite(a) || (query === "between" && !Number.isFinite(b))) throw new Error("Type the value(s) a (and b).");
  if (query === "between" && b < a) throw new Error("Need a ≤ b.");
  const mean = D.mean(params), variance = D.variance(params);
  const label = qText(query, a, b);
  const ptext = D.params.map(([k]) => `${k === "lambda" ? "λ" : k === "mu" ? "μ" : k === "sigma" ? "σ" : k} = ${fmt(params[k])}`).join(", ");
  const steps = [{ line: 1, shade: [], vars: Object.fromEntries(D.params.map(([k]) => [k === "lambda" ? "λ" : k === "mu" ? "μ" : k === "sigma" ? "σ" : k, params[k]])), note: `${D.name} with ${ptext}. Find ${label}. ${D.formula}.` }];
  let answer;
  if (D.discrete) {
    if (query === "eq" && !Number.isInteger(a)) throw new Error("For a discrete distribution, a must be a whole number.");
    const [lo, hiSup] = D.support(params);
    const hi = id === "binomial" ? params.n : Infinity;
    let ks;
    let complement = false;
    if (query === "eq") ks = [a];
    else if (query === "le") ks = range(lo, Math.min(Math.floor(a), hi));
    else if (query === "between") ks = range(Math.max(lo, Math.ceil(a)), Math.min(Math.floor(b), hi));
    else {
      const from = Math.max(lo, Math.ceil(a));
      if (hi !== Infinity && hi - from + 1 <= from - lo) ks = range(from, hi);
      else { complement = true; ks = range(lo, from - 1); }
    }
    let sum = 0;
    const shown = [];
    for (const k of ks) {
      const pk = D.pmf(params, k);
      sum += pk;
      if (shown.length < 8) {
        shown.push(k);
        steps.push({ line: query === "eq" ? 2 : complement ? 4 : 3, shade: complement ? [] : [...ks.slice(0, ks.indexOf(k) + 1)], comp: complement ? ks.slice(0, ks.indexOf(k) + 1) : null, vars: { k, "P(X=k)": fmt(pk, 6), "running sum": fmt(sum, 6) }, note: `P(X = ${k}) = ${D.term(params, k)} = ${fmt(pk, 6)}.${ks.length > 1 ? ` Running total ${fmt(sum, 6)}.` : ""}` });
      }
    }
    if (ks.length > shown.length) steps.push({ line: 3, shade: complement ? [] : ks, comp: complement ? ks : null, vars: { terms: ks.length, "running sum": fmt(sum, 6) }, note: `The other ${ks.length - shown.length} terms (k = ${ks[shown.length]} to ${ks.at(-1)}) are added the same way: the total is ${fmt(sum, 6)}.` });
    answer = complement ? 1 - sum : sum;
    if (complement) steps.push({ line: 4, shade: [], ge: Math.ceil(a), vars: { "P(X<a)": fmt(sum, 6), answer: fmt(answer) }, note: `${label} = 1 − P(X ≤ ${Math.ceil(a) - 1}) = 1 − ${fmt(sum, 6)} = ${fmt(answer)}. The complement needs only ${ks.length} term${ks.length === 1 ? "" : "s"}.` });
    if (!ks.length && !complement) steps.push({ line: 3, shade: [], vars: { answer: 0 }, note: `No value of X is in that range, so ${label} = 0.` });
    void hiSup;
  } else {
    let lo, hi;
    if (query === "eq") { answer = 0; lo = hi = a; steps.push({ line: 5, area: [a, a], vars: { answer: 0 }, note: `X is continuous, so a single point has no area: P(X = ${fmt(a)}) = 0. Ask for a range instead.` }); }
    else {
      [lo, hi] = query === "le" ? [-Infinity, a] : query === "ge" ? [a, Infinity] : [a, b];
      const Fh = hi === Infinity ? 1 : D.cdf(params, hi), Fl = lo === -Infinity ? 0 : D.cdf(params, lo);
      if (hi !== Infinity) steps.push({ line: 5, area: [lo, hi], vars: { [`F(${fmt(hi)})`]: fmt(Fh, 6) }, note: D.cdfText(params, hi) + "." });
      if (lo !== -Infinity) steps.push({ line: 5, area: [lo, hi], vars: { [`F(${fmt(lo)})`]: fmt(Fl, 6) }, note: D.cdfText(params, lo) + "." });
      answer = Fh - Fl;
      steps.push({ line: 5, area: [lo, hi], vars: { answer: fmt(answer) }, note: query === "le" ? `${label} = F(${fmt(a)}) = ${fmt(answer)}: the shaded area.` : query === "ge" ? `${label} = 1 − F(${fmt(a)}) = 1 − ${fmt(Fl, 6)} = ${fmt(answer)}.` : `${label} = F(${fmt(b)}) − F(${fmt(a)}) = ${fmt(Fh, 6)} − ${fmt(Fl, 6)} = ${fmt(answer)}.` });
    }
  }
  steps.push({ line: 6, shade: steps.at(-1).shade ?? [], comp: steps.at(-1).comp ?? null, area: steps.at(-1).area, done: true, vars: { [label]: fmt(answer), "E[X]": fmt(mean), "Var(X)": fmt(variance) }, note: `${label} = ${fmt(answer)}. ${D.meanText}: here E[X] = ${fmt(mean)}, Var(X) = ${fmt(variance)}, SD = ${fmt(Math.sqrt(variance))}.` });
  return { id, params, query, a, b, answer, mean, variance, steps, label };
}
const range = (lo, hi) => (hi < lo ? [] : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));

export const EXAMPLES = {
  disease: { name: "Bayes: a rare disease and a good test", mode: "bayes", prior: "0.01", hit: "0.9", fa: "0.09" },
  factory: { name: "Bayes: which machine made the faulty bolt?", mode: "bayes", prior: "0.25", hit: "0.05", fa: "0.04" },
  dice7: { name: "Two dice: sum 7 vs first die 3", mode: "space", exp: "dice", a: "sum", ka: 7, b: "first", kb: 3 },
  dice8: { name: "Two dice: sum 8 vs a double", mode: "space", exp: "dice", a: "sum", ka: 8, b: "doubles", kb: 0 },
  coins: { name: "Three coins: at least 2 heads vs first is H", mode: "space", exp: "coins", a: "atLeast", ka: 2, b: "firstH", kb: 0 },
  die: { name: "A fair die: E[X] = 3.5", mode: "rv", xs: "1,2,3,4,5,6", ps: "1/6,1/6,1/6,1/6,1/6,1/6" },
  binom: { name: "Binomial: 10 tosses, P(X ≤ 3)", mode: "dist", dist: "binomial", n: 10, p: 0.5, q: "le", a: 3 },
  poisson: { name: "Poisson λ = 2: P(X ≥ 1)", mode: "dist", dist: "poisson", lambda: 2, q: "ge", a: 1 },
  normal: { name: "Normal: within one σ of the mean", mode: "dist", dist: "normal", mu: 0, sigma: 1, q: "between", a: -1, b: 1 },
};
