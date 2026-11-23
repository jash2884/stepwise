// Counting: permutations and combinations (with and without repetition),
// stars and bars, inclusion-exclusion with the Venn regions, pigeonhole,
// derangements, Catalan numbers, and linear recurrences solved by their
// characteristic roots and by generating functions. Big counts use BigInt.

import { choose, factorial } from "./relations.js";
export { choose, factorial };

const big = (x) => BigInt(x);
export const fmtBig = (x) => {
  if (x == null) return "-";
  const s = String(x);
  return s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s;
};

// --- Selections --------------------------------------------------------------------
export const SELECTIONS = {
  perm: { name: "Permutations, no repetition", ordered: true, repeat: false, formula: "P(n, r) = n! / (n − r)!" },
  permRep: { name: "Permutations with repetition", ordered: true, repeat: true, formula: "nʳ" },
  comb: { name: "Combinations, no repetition", ordered: false, repeat: false, formula: "C(n, r) = n! / (r! (n − r)!)" },
  combRep: { name: "Combinations with repetition", ordered: false, repeat: true, formula: "C(n + r − 1, r)" },
};

export function selection(kind, n, r) {
  if (!SELECTIONS[kind]) throw new Error("Unknown kind of selection");
  if (!(n >= 0 && r >= 0)) throw new Error("n and r must be whole numbers, 0 or more.");
  const s = SELECTIONS[kind];
  let value, work;
  if (kind === "perm") { value = r > n ? 0n : factorial(n) / factorial(n - r); work = r > n ? `r > n, so 0` : `${n}! / ${n - r}! = ${Array.from({ length: r }, (_, i) => n - i).join(" × ") || "1"}`; }
  if (kind === "permRep") { value = big(n) ** big(r); work = `${n}^${r}`; }
  if (kind === "comb") { value = choose(n, r); work = r > n ? "r > n, so 0" : `${n}! / (${r}! · ${n - r}!)`; }
  if (kind === "combRep") { value = choose(n + r - 1, r); work = `C(${n} + ${r} − 1, ${r}) = C(${n + r - 1}, ${r})`; }
  return { ...s, value, work, why: `${s.ordered ? "Order matters" : "Order doesn't matter"} and items ${s.repeat ? "can" : "can't"} repeat.` };
}

// List every selection when there are few enough (n ≤ 5), to see the count.
export function listSelections(kind, n, r, cap = 60) {
  const items = "abcdefgh".slice(0, n).split("");
  const out = [];
  const s = SELECTIONS[kind];
  const rec = (prefix, start) => {
    if (out.length >= cap) return;
    if (prefix.length === r) { out.push(prefix.join("")); return; }
    for (let i = s.ordered ? 0 : start; i < n; i++) {
      if (!s.repeat && prefix.includes(items[i])) continue;
      rec([...prefix, items[i]], s.repeat ? i : i + 1);
    }
  };
  if (n <= 8 && r <= 6) rec([], 0);
  return out;
}

// Arrangements of a word with repeated letters: n! / (n₁! n₂! …).
export function multiset(word) {
  const counts = {};
  for (const c of word) counts[c] = (counts[c] ?? 0) + 1;
  const reps = Object.entries(counts).filter(([, k]) => k > 1);
  const value = Object.values(counts).reduce((acc, k) => acc / factorial(k), factorial(word.length));
  return { counts, value, work: `${word.length}!${reps.length ? ` / (${reps.map(([c, k]) => `${k}! for ${c}`).join(", ")})` : ""}` };
}

// --- Stars and bars ---------------------------------------------------------------
// n identical items into k distinct boxes, box i getting at least lo[i].
export const STARS_CODE = [
  "give box i its minimum lᵢ first: n′ ← n − Σ lᵢ",
  "if n′ < 0 then return 0",
  "an arrangement = n′ stars and k − 1 bars in a row",
  "count ← C(n′ + k − 1, k − 1)  // choose where the bars go",
];
export function starsAndBars(n, k, lo = []) {
  const mins = Array.from({ length: k }, (_, i) => lo[i] ?? 0);
  const used = mins.reduce((a, b) => a + b, 0), rest = n - used;
  const value = rest < 0 ? 0n : choose(rest + k - 1, k - 1);
  // One example arrangement: spread the rest as evenly as possible.
  const example = mins.map((m, i) => m + (rest >= 0 ? Math.floor(rest / k) + (i < rest % k ? 1 : 0) : 0));
  const steps = [
    { line: 1, vars: { n, k, "Σ minimums": used, "n′": rest }, note: used ? `Hand out the minimums first (${mins.join(" + ")} = ${used}), leaving n′ = ${n} − ${used} = ${rest} to share freely.` : `No minimums, so all n′ = ${n} items are shared freely.`, example },
    rest < 0 ? { line: 2, vars: { count: 0 }, tone: "bad", note: "The minimums need more items than there are: no way to do it." }
      : { line: 3, vars: { stars: rest, bars: k - 1 }, note: `Lay out ${rest} stars and ${k - 1} bar${k - 1 === 1 ? "" : "s"}. The bars cut the row into ${k} boxes, and every arrangement is one distribution.`, example },
    ...(rest < 0 ? [] : [{ line: 4, vars: { count: value }, tone: "good", note: `Choose ${k - 1} of the ${rest + k - 1} positions for the bars: C(${rest + k - 1}, ${k - 1}) = ${fmtBig(value)}.`, example }]),
  ];
  return { value, rest, mins, example, steps, work: rest < 0 ? "0" : `C(${rest} + ${k} − 1, ${k} − 1) = C(${rest + k - 1}, ${k - 1})` };
}

// --- Inclusion-exclusion ----------------------------------------------------------
export const IE_CODE = [
  "total ← Σ |Aᵢ|  // every element counted once per set it is in",
  "total ← total − Σ |Aᵢ ∩ Aⱼ|  // pairs counted twice",
  "total ← total + |A₁ ∩ A₂ ∩ A₃|  // triples: back in once",
  "|A₁ ∪ A₂ ∪ A₃| ← total",
];
// sizes: { A, B, C, AB, AC, BC, ABC } (C, AC, BC, ABC absent for two sets).
export function inclusionExclusion(sizes, names = ["A", "B", "C"]) {
  const three = sizes.C != null;
  const g = (k) => sizes[k] ?? 0;
  const singles = three ? g("A") + g("B") + g("C") : g("A") + g("B");
  const pairs = three ? g("AB") + g("AC") + g("BC") : g("AB");
  const union = singles - pairs + (three ? g("ABC") : 0);
  // Regions of the Venn diagram: exactly the sets named.
  const regions = three ? {
    ABC: g("ABC"), AB: g("AB") - g("ABC"), AC: g("AC") - g("ABC"), BC: g("BC") - g("ABC"),
    A: g("A") - g("AB") - g("AC") + g("ABC"), B: g("B") - g("AB") - g("BC") + g("ABC"), C: g("C") - g("AC") - g("BC") + g("ABC"),
  } : { AB: g("AB"), A: g("A") - g("AB"), B: g("B") - g("AB") };
  const bad = Object.entries(regions).find(([, v]) => v < 0);
  const [a, b, c] = names;
  const steps = [
    { line: 1, show: ["single"], vars: { total: singles }, note: `Add the sets: ${three ? `${g("A")} + ${g("B")} + ${g("C")}` : `${g("A")} + ${g("B")}`} = ${singles}. Anything in two sets has now been counted twice.` },
    { line: 2, show: ["single", "pair"], vars: { total: singles - pairs }, note: `Subtract the overlaps: ${singles} − ${three ? `(${g("AB")} + ${g("AC")} + ${g("BC")})` : g("AB")} = ${singles - pairs}.${three ? " Something in all three was added 3 times and removed 3 times, so it's now missing." : ""}` },
    ...(three ? [{ line: 3, show: ["single", "pair", "triple"], vars: { total: union }, note: `Add back the triple overlap: ${singles - pairs} + ${g("ABC")} = ${union}.` }] : []),
    { line: 4, show: ["single", "pair", "triple", "regions"], vars: { union }, tone: bad ? "bad" : "good", note: bad ? `These sizes can't all be right: the region only in ${bad[0].split("").map((x) => names["ABC".indexOf(x)]).join(" and ")} would have ${bad[1]} elements.` : `|${three ? `${a} ∪ ${b} ∪ ${c}` : `${a} ∪ ${b}`}| = ${union}. Each region of the diagram now counts its own elements exactly once.` },
  ];
  return { union, regions, consistent: !bad, steps, three };
}

// How many of 1..N are divisible by at least one of the divisors?
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;
export function divisibleCount(N, divisors) {
  const names = divisors.map(String);
  const sizes = {}, keys = ["A", "B", "C"].slice(0, divisors.length);
  const subsets = [];
  for (let m = 1; m < 2 ** divisors.length; m++) {
    const pick = keys.filter((_, i) => (m >> i) & 1);
    const L = pick.reduce((acc, k) => lcm(acc, divisors[keys.indexOf(k)]), 1);
    sizes[pick.join("")] = Math.floor(N / L);
    subsets.push({ sets: pick, lcm: L, count: Math.floor(N / L) });
  }
  const res = inclusionExclusion(sizes, names.map((d) => `÷${d}`));
  let brute = 0;
  for (let x = 1; x <= N; x++) if (divisors.some((d) => x % d === 0)) brute++;
  return { ...res, sizes, subsets, brute, none: N - res.union };
}

// --- Pigeonhole --------------------------------------------------------------------
export function pigeonhole(items, boxes) {
  const atLeast = Math.ceil(items / boxes);
  const fill = Array.from({ length: boxes }, (_, i) => Math.floor(items / boxes) + (i < items % boxes ? 1 : 0));
  return { atLeast, fill, note: `${items} items in ${boxes} boxes: some box gets at least ⌈${items}/${boxes}⌉ = ${atLeast}. Spreading them as evenly as possible still gives a box ${atLeast}.` };
}
// Fewest items that force some box to hold r: k(r − 1) + 1.
export const forceCount = (boxes, r) => boxes * (r - 1) + 1;

// --- Derangements -----------------------------------------------------------------
export function derangements(n) {
  const D = [1n, 0n];
  for (let i = 2; i <= n; i++) D[i] = big(i - 1) * (D[i - 1] + D[i - 2]);
  return D.slice(0, n + 1);
}
export const derangement = (n) => derangements(n)[n];
export function listDerangements(n) {
  const out = [];
  const rec = (perm, used) => {
    if (perm.length === n) { out.push(perm.map((x) => x + 1).join("")); return; }
    for (let v = 0; v < n; v++) if (!used[v] && v !== perm.length) { used[v] = true; rec([...perm, v], used); used[v] = false; }
  };
  if (n <= 5) rec([], []);
  return out;
}
export const DERANGE_CODE = [
  "D(0) ← 1; D(1) ← 0",
  "for i ← 2 to n",
  "  D(i) ← (i − 1) · (D(i − 1) + D(i − 2))",
  "// also D(n) = n! · Σₖ (−1)ᵏ / k!  (inclusion-exclusion over fixed points)",
];
export function derangementSteps(n) {
  const D = derangements(n), steps = [{ i: 1, line: 1, vars: { "D(0)": 1, "D(1)": 0 }, note: "D(0) = 1 (the empty arrangement has no fixed point) and D(1) = 0 (one item can only stay put)." }];
  for (let i = 2; i <= n; i++) steps.push({ i, line: [2, 3], vars: { i, "D(i−1)": D[i - 1], "D(i−2)": D[i - 2], "D(i)": D[i] },
    note: `Item 1 goes to one of the ${i - 1} other places, say j. Either j comes back to 1 (then derange the other ${i - 2}: D(${i - 2})) or it doesn't (then it's like deranging ${i - 1}: D(${i - 1})). D(${i}) = ${i - 1} × (${D[i - 1]} + ${D[i - 2]}) = ${fmtBig(D[i])}.` });
  const terms = Array.from({ length: n + 1 }, (_, k) => `${k % 2 ? "−" : "+"} ${n}!/${k}!`).join(" ").replace(/^\+ /, "");
  steps.push({ i: n, line: 4, tone: "good", vars: { "D(n)": D[n], "n!": factorial(n) }, note: `Check with inclusion-exclusion: ${terms} = ${fmtBig(D[n])}. That's about n!/e = ${(Number(factorial(Math.min(n, 20))) / Math.E).toFixed(2)}.` });
  return { D, steps };
}

// --- Catalan -----------------------------------------------------------------------
export function catalans(n) {
  const C = [1n];
  for (let i = 1; i <= n; i++) { let s = 0n; for (let j = 0; j < i; j++) s += C[j] * C[i - 1 - j]; C[i] = s; }
  return C;
}
export const catalan = (n) => choose(2 * n, n) / big(n + 1);
export function balancedParens(n, cap = 50) {
  const out = [];
  const rec = (s, open, close) => {
    if (out.length >= cap) return;
    if (s.length === 2 * n) { out.push(s); return; }
    if (open < n) rec(s + "(", open + 1, close);
    if (close < open) rec(s + ")", open, close + 1);
  };
  rec("", 0, 0);
  return out;
}
export const CATALAN_CODE = [
  "C(0) ← 1",
  "for i ← 1 to n",
  "  C(i) ← Σ_{j=0}^{i−1} C(j) · C(i − 1 − j)  // split at the first matching pair",
  "// closed form: C(n) = C(2n, n) / (n + 1)",
];
export function catalanSteps(n) {
  const C = catalans(n), steps = [{ i: 0, line: 1, vars: { "C(0)": 1 }, note: "C(0) = 1: one way to arrange nothing." }];
  for (let i = 1; i <= n; i++) steps.push({ i, line: [2, 3], vars: { i, "C(i)": C[i] },
    note: `C(${i}) = ${Array.from({ length: i }, (_, j) => `C(${j})C(${i - 1 - j})`).join(" + ")} = ${Array.from({ length: i }, (_, j) => `${C[j] * C[i - 1 - j]}`).join(" + ")} = ${fmtBig(C[i])}.` });
  steps.push({ i: n, line: 4, tone: "good", vars: { "C(n)": C[n] }, note: `Closed form: C(${2 * n}, ${n}) / ${n + 1} = ${fmtBig(choose(2 * n, n))} / ${n + 1} = ${fmtBig(C[n])}. That counts balanced bracket strings with ${n} pairs, binary trees with ${n} nodes, BSTs on ${n} keys, triangulations of a ${n + 2}-gon and more.` });
  return { C, steps };
}

// --- Linear recurrences ------------------------------------------------------------
// aₙ = c1·aₙ₋₁ + c2·aₙ₋₂ + d  (c2 may be 0 for first order), with a₀, a₁ given.
const EPS = 1e-9;
// A number shown as a fraction when it is one with a small denominator.
export function nice(x) {
  if (!Number.isFinite(x)) return String(x);
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x)).replace("-", "−");
  for (let d = 2; d <= 64; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-9) return `${n < 0 ? "−" : ""}${Math.abs(n)}/${d}`;
  }
  return x.toFixed(4).replace("-", "−");
}
const sqrtText = (D) => {
  // √D simplified: √(k²·m) = k√m
  let k = 1, m = D;
  for (let f = Math.floor(Math.sqrt(D)); f > 1; f--) if (D % (f * f) === 0) { k = f; m = D / (f * f); break; }
  return m === 1 ? String(k) : `${k === 1 ? "" : k}√${m}`;
};

export function recurrenceValues({ c1, c2 = 0, d = 0, a0, a1 }, n) {
  const a = [a0, a1];
  for (let i = 2; i <= n; i++) a[i] = c1 * a[i - 1] + c2 * a[i - 2] + d;
  if (c2 === 0) { a.length = 0; a[0] = a0; for (let i = 1; i <= n; i++) a[i] = c1 * a[i - 1] + d; }
  return a.slice(0, n + 1);
}

function solveLinear(A, b) {
  const n = A.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < EPS) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export const REC_CODE = [
  "characteristic equation: x² − c₁x − c₂ = 0  (first order: x − c₁ = 0)",
  "roots r₁, r₂ → homogeneous part A·r₁ⁿ + B·r₂ⁿ  (repeated root: (A + Bn)·rⁿ)",
  "if d ≠ 0: add a particular solution p(n) (a constant, or p·n, p·n² if 1 is a root)",
  "solve for A, B from a₀ and a₁",
  "generating function: A(x) = P(x) / (1 − c₁x − c₂x²) gives the same closed form",
  "check the formula against the table of values",
];

export function solveRecurrence(spec, upto = 10) {
  const { c1, c2 = 0, d = 0, a0, a1 } = spec;
  const order = c2 === 0 ? 1 : 2;
  const values = recurrenceValues(spec, upto);
  const steps = [];
  let roots, kind, basis, rootText;
  if (order === 1) {
    roots = [c1]; kind = "single"; rootText = nice(c1);
    basis = [(n) => c1 ** n];
    steps.push({ line: 1, vars: { equation: `x − ${nice(c1)} = 0`, root: rootText }, note: `First order: the characteristic equation x − ${nice(c1)} = 0 has the root ${rootText}, so the homogeneous part is A·${rootText}ⁿ.` });
  } else {
    const D = c1 * c1 + 4 * c2;
    const eq = `x² ${c1 >= 0 ? "−" : "+"} ${nice(Math.abs(c1))}x ${c2 >= 0 ? "−" : "+"} ${nice(Math.abs(c2))} = 0`;
    if (Math.abs(D) < EPS) {
      const r = c1 / 2; roots = [r, r]; kind = "repeated"; rootText = `${nice(r)} (twice)`;
      basis = [(n) => r ** n, (n) => n * r ** n];
      steps.push({ line: [1, 2], vars: { equation: eq, discriminant: 0, root: nice(r) }, note: `${eq}: the discriminant c₁² + 4c₂ is 0, so there is one repeated root r = ${nice(r)}. The homogeneous part is (A + Bn)·${nice(r)}ⁿ.` });
    } else if (D > 0) {
      const s = Math.sqrt(D), r1 = (c1 + s) / 2, r2 = (c1 - s) / 2; roots = [r1, r2]; kind = "distinct";
      const exact = Number.isInteger(D) && Math.abs(s - Math.round(s)) > EPS && Number.isInteger(c1);
      const show = (sign) => (exact ? `(${nice(c1)} ${sign} ${sqrtText(D)})/2` : nice(sign === "+" ? r1 : r2));
      rootText = `${show("+")} and ${show("−")}`;
      basis = [(n) => r1 ** n, (n) => r2 ** n];
      steps.push({ line: [1, 2], vars: { equation: eq, discriminant: nice(D), r1: show("+"), r2: show("−") }, note: `${eq} has two distinct roots, r₁ = ${show("+")}${exact ? ` ≈ ${r1.toFixed(4)}` : ""} and r₂ = ${show("−")}${exact ? ` ≈ ${r2.toFixed(4)}` : ""}. The homogeneous part is A·r₁ⁿ + B·r₂ⁿ.` });
    } else {
      const mod = Math.sqrt(-c2), theta = Math.atan2(Math.sqrt(-D) / 2, c1 / 2); roots = [{ re: c1 / 2, im: Math.sqrt(-D) / 2 }]; kind = "complex";
      rootText = `${nice(c1 / 2)} ± ${nice(Math.sqrt(-D) / 2)}i`;
      basis = [(n) => mod ** n * Math.cos(n * theta), (n) => mod ** n * Math.sin(n * theta)];
      steps.push({ line: [1, 2], vars: { equation: eq, discriminant: nice(D), roots: rootText }, note: `${eq} has complex roots ${rootText}, of size ρ = ${nice(mod)} at angle θ = ${theta.toFixed(4)} rad. The homogeneous part is ρⁿ(A cos nθ + B sin nθ).` });
    }
  }
  // Particular solution for the constant d: try p·n^m where m = how often 1 is a root.
  let particular = null, pText = "";
  if (d !== 0) {
    const one = order === 1 ? (Math.abs(c1 - 1) < EPS ? 1 : 0) : (kind === "repeated" && Math.abs(roots[0] - 1) < EPS ? 2 : kind === "distinct" && roots.some((r) => Math.abs(r - 1) < EPS) ? 1 : 0);
    // Substituting p·n^m into the recurrence: p·[n^m − c1(n−1)^m − c2(n−2)^m] = d, constant in n.
    const at = 5, coef = at ** one - c1 * (at - 1) ** one - c2 * (at - 2) ** one;
    const p = d / coef;
    particular = (n) => p * n ** one;
    pText = one ? `${Math.abs(p - 1) < EPS ? "" : Math.abs(p + 1) < EPS ? "−" : `${nice(p)}·`}${one === 1 ? "n" : "n²"}` : nice(p);
    steps.push({ line: 3, vars: { d: nice(d), "p(n)": pText }, note: `The extra constant ${nice(d)} needs a particular solution. ${one ? `1 is a root${one === 2 ? " twice" : ""}, so a constant won't do; try p·n${one === 2 ? "²" : ""}.` : "1 isn't a root, so try a constant p."} Substituting gives p(n) = ${pText}.` });
  }
  const P = particular ?? (() => 0);
  const k = basis.length;
  const ns = order === 1 ? [0] : [0, 1];
  const A = ns.map((n) => basis.map((f) => f(n)));
  const b = ns.map((n) => values[n] - P(n));
  const coeffs = (k === 1 ? [b[0] / A[0][0]] : solveLinear(A, b)) ?? basis.map(() => NaN);
  const closed = (n) => coeffs.reduce((s, c, i) => s + c * basis[i](n), 0) + P(n);
  const names = ["A", "B"];
  // Coefficient times a power: 1·2ⁿ → 2ⁿ, 3·1ⁿ → 3, 2·(−1)ⁿ keeps its brackets.
  const pw = (r) => (Math.abs(r - 1) < EPS ? "" : r >= 0 && Number.isInteger(Math.round(r * 1e9) / 1e9) ? `${nice(r)}ⁿ` : `(${nice(r)})ⁿ`);
  const times = (c, rest) => {
    if (!rest) return nice(c);
    if (Math.abs(c - 1) < EPS) return rest;
    if (Math.abs(c + 1) < EPS) return `−${rest}`;
    return `${nice(c)}·${rest}`;
  };
  const termText = (i) => {
    const c = coeffs[i];
    if (kind === "single") return times(c, pw(roots[0]));
    if (kind === "repeated") return i === 0 ? times(c, pw(roots[0])) : times(c, `n${pw(roots[0]) ? `·${pw(roots[0])}` : ""}`);
    if (kind === "distinct") return times(c, pw(roots[i]));
    return times(c, `ρⁿ${i === 0 ? "cos" : "sin"} nθ`);
  };
  const formula = [...coeffs.map((_, i) => termText(i)).filter((_, i) => Math.abs(coeffs[i]) > EPS), ...(particular ? [pText] : [])].join(" + ").replace(/\+ −/g, "− ") || "0";
  steps.push({ line: 4, vars: Object.fromEntries(coeffs.map((c, i) => [names[i], nice(c)])), note: `Fit the start value${order === 2 ? "s" : ""}: ${ns.map((n) => `a${n === 0 ? "₀" : "₁"} = ${nice(values[n])}`).join(", ")} gives ${coeffs.map((c, i) => `${names[i]} = ${nice(c)}`).join(", ")}. So aₙ = ${formula}.` });
  // Generating function: (1 − c1 x − c2 x²) A(x) = a0 + (a1 − c1 a0) x + d·x²/(1−x)·… (shown for d = 0).
  const p0 = values[0], p1 = order === 2 ? values[1] - c1 * values[0] : 0;
  const den = order === 2 ? `1 ${c1 >= 0 ? "−" : "+"} ${nice(Math.abs(c1))}x ${c2 >= 0 ? "−" : "+"} ${nice(Math.abs(c2))}x²` : `1 ${c1 >= 0 ? "−" : "+"} ${nice(Math.abs(c1))}x`;
  const num = order === 2 ? `${nice(p0)} ${p1 >= 0 ? "+" : "−"} ${nice(Math.abs(p1))}x` : nice(p0);
  const gf = d === 0 ? `A(x) = (${num}) / (${den})` : `A(x) = (${num}) / (${den}) + ${nice(d)}x${order === 2 ? "²" : ""} / ((1 − x)(${den}))`;
  steps.push({ line: 5, vars: { "A(x)": gf }, note: `Generating function: multiply the recurrence by xⁿ and sum over n. The denominator ${den} is the characteristic polynomial read backwards, so its partial fractions give terms like 1/(1 − r x) = Σ rⁿxⁿ: the same roots, the same closed form.${d === 0 ? "" : " The constant term adds the 1/(1 − x) factor."}` });
  const check = values.map((v, n) => ({ n, value: v, formula: closed(n), ok: Math.abs(closed(n) - v) < 1e-6 * Math.max(1, Math.abs(v)) }));
  const ok = check.every((c) => c.ok);
  steps.push({ line: 6, vars: { checked: check.length, matches: ok }, tone: ok ? "good" : "bad", note: ok ? `The formula matches the table for n = 0 to ${upto}.` : "The formula doesn't match every value; the roots are probably too close to call in floating point." });
  return { order, kind, roots, rootText, coeffs, particular: pText, formula, values, closed, check, ok, steps, gf };
}

export const REC_EXAMPLES = {
  fib: { name: "Fibonacci: aₙ = aₙ₋₁ + aₙ₋₂", c1: 1, c2: 1, d: 0, a0: 0, a1: 1 },
  distinct: { name: "aₙ = 5aₙ₋₁ − 6aₙ₋₂ (roots 2 and 3)", c1: 5, c2: -6, d: 0, a0: 1, a1: 4 },
  repeated: { name: "aₙ = 4aₙ₋₁ − 4aₙ₋₂ (root 2 twice)", c1: 4, c2: -4, d: 0, a0: 1, a1: 6 },
  hanoi: { name: "Towers of Hanoi: aₙ = 2aₙ₋₁ + 1", c1: 2, c2: 0, d: 1, a0: 0, a1: 1 },
  strings: { name: "Bit strings with no 00: aₙ = aₙ₋₁ + aₙ₋₂", c1: 1, c2: 1, d: 0, a0: 1, a1: 2 },
  complex: { name: "Complex roots: aₙ = −aₙ₋₂", c1: 0, c2: -1, d: 0, a0: 1, a1: 1 },
  sum: { name: "aₙ = aₙ₋₁ + 3 (arithmetic)", c1: 1, c2: 0, d: 3, a0: 2, a1: 5 },
};
