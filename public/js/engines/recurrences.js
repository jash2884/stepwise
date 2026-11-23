// Recurrences for algorithm analysis: parse T(n) = a·T(n/b) + f(n) (and
// subtract-and-conquer, several unequal parts, and T(√n)), solve with the
// master theorem (CLRS cases plus the extended log cases), Akra-Bazzi for
// unequal splits, the recursion tree level by level, a numeric substitution
// check, and growth-rate comparison.
//
// A growth is n^k · (log n)^p · (log log n)^q, optionally times bⁿ, n! or nⁿ:
//   { k, p, q, exp: base (1 = none), fact: 0/1, nn: 0/1 }.
// Conventions: logs are base 2 in numbers (any base in Θ), T(n) = 1 for n ≤ 1,
// and n/b is rounded down when computing values.

const EPS = 1e-9;
const close = (a, b) => Math.abs(a - b) < 1e-7;
export const G = (k = 0, p = 0, q = 0, extra = {}) => ({ k, p, q, exp: 1, fact: 0, nn: 0, ...extra });

// --- Showing numbers and growths ---------------------------------------------------
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", ".": "·", "-": "⁻", "/": "ᐟ" };
export function num(x, d = 3) {
  if (close(x, Math.round(x))) return String(Math.round(x));
  for (const den of [2, 3, 4, 5, 6]) if (close(x * den, Math.round(x * den))) return `${Math.round(x * den)}/${den}`;
  return x.toFixed(d).replace(/0+$/, "");
}
const power = (base, e) => {
  if (close(e, 0)) return "";
  if (close(e, 1)) return base;
  const t = num(e);
  return /^[\d]+$/.test(t) ? `${base}${[...t].map((c) => SUP[c]).join("")}` : `${base}^${t.includes("/") ? `(${t})` : t}`;
};
export function showGrowth(g) {
  const parts = [];
  if (g.nn) parts.push("nⁿ");
  if (g.fact) parts.push("n!");
  if (g.exp > 1 + EPS) parts.push(g.expText ?? `${num(g.exp)}ⁿ`);
  const pk = close(g.k, 0.5) ? "√n" : power("n", g.k); if (pk) parts.push(pk);
  const logPow = (name, e) => (close(e, 1) ? name : close(e, Math.round(e)) ? name.replace("log", `log${power("", e)}`) : `(${name})^${num(e)}`);
  const below = [];
  if (!close(g.p, 0)) (g.p > 0 ? parts : below).push(logPow("log n", Math.abs(g.p)));
  if (!close(g.q, 0)) (g.q > 0 ? parts : below).push(logPow("log log n", Math.abs(g.q)));
  // Negative log powers read better as a fraction.
  if (below.length) return `${parts.join(" ") || "1"} / ${below.join(" ")}`;
  return parts.length ? parts.join(" ") : "1";
}
export const theta = (g) => `Θ(${showGrowth(g)})`;

// Compare growth rates: −1 slower, 0 same order, 1 faster.
export function compareGrowth(a, b) {
  const keys = ["nn", "fact", "exp", "k", "p", "q"];
  for (const key of keys) {
    const x = a[key] ?? 0, y = b[key] ?? 0;
    if (!close(x, y)) return x < y ? -1 : 1;
  }
  return 0;
}
// Value of a growth at n (for charts and tables), as log2 to avoid overflow.
export function log2Value(g, n) {
  const lg = Math.log2(Math.max(n, 1));
  let v = g.k * lg;
  if (g.p) v += g.p * Math.log2(Math.max(lg, 1e-9));
  if (g.q) v += g.q * Math.log2(Math.max(Math.log2(Math.max(lg, 1)), 1e-9));
  if (g.exp > 1) v += n * Math.log2(g.exp);
  if (g.fact) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log2(i); v += s; }
  if (g.nn) v += n * lg;
  return v;
}

// --- Parsing f(n) ------------------------------------------------------------------
// f is a sum of products of n, log n, log log n, numbers and powers of them.
export function parseF(text) {
  const src = String(text).replace(/\s+/g, " ").replace(/·|×/g, "*").replace(/√\s*\(/g, "sqrt(").replace(/√\s*n/g, "sqrt(n)").replace(/\blg\b|\bln\b/g, "log").trim();
  if (!src) throw new Error("f(n) is empty. Write 1 for a constant.");
  const toks = src.match(/\d+(?:\.\d+)?|n|log|sqrt|[()^*/+]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const fail = (m) => { throw new Error(`Can't read f(n) = ${text}: ${m}.`); };
  const mul = (a, b, s = 1) => ({ k: a.k + s * b.k, p: a.p + s * b.p, q: a.q + s * b.q, c: s === 1 ? a.c * b.c : a.c / b.c });
  const pow = (a, e) => ({ k: a.k * e, p: a.p * e, q: a.q * e, c: a.c ** e });
  const ONE = { k: 0, p: 0, q: 0, c: 1 };
  function exponent() {
    if (peek() === "(") { i++; const a = Number(toks[i++]); let v = a; if (peek() === "/") { i++; v = a / Number(toks[i++]); } if (toks[i++] !== ")") fail("expected )"); if (!Number.isFinite(v)) fail("bad exponent"); return v; }
    const t = toks[i++];
    if (!/^\d/.test(t ?? "")) fail("expected a number after ^");
    return Number(t);
  }
  function sum() {
    const terms = [product()];
    while (peek() === "+") { i++; terms.push(product()); }
    return terms.reduce((best, t) => (cmp(t, best) > 0 ? t : best));
  }
  const cmp = (a, b) => (!close(a.k, b.k) ? Math.sign(a.k - b.k) : !close(a.p, b.p) ? Math.sign(a.p - b.p) : Math.sign(a.q - b.q));
  function product() {
    let acc = factor();
    for (;;) {
      if (peek() === "*") { i++; acc = mul(acc, factor()); continue; }
      if (peek() === "/") { i++; acc = mul(acc, factor(), -1); continue; }
      if (peek() && !["+", ")"].includes(peek())) { acc = mul(acc, factor()); continue; }
      return acc;
    }
  }
  function factor() {
    let a = atom();
    if (peek() === "^") { i++; a = pow(a, exponent()); }
    return a;
  }
  function atom() {
    const t = toks[i++];
    if (t == null) fail("it ends too early");
    if (/^\d/.test(t)) return { ...ONE, c: Number(t) };
    if (t === "n") return { k: 1, p: 0, q: 0, c: 1 };
    if (t === "(") { const a = sum(); if (toks[i++] !== ")") fail("expected )"); return a; }
    if (t === "sqrt") { if (toks[i++] !== "(") fail("write sqrt(n)"); const a = sum(); if (toks[i++] !== ")") fail("expected )"); return pow(a, 0.5); }
    if (t === "log") {
      let e = 1;
      if (peek() === "^") { i++; e = exponent(); }
      const inner = peek() === "(" ? (i++, (() => { const a = sum(); if (toks[i++] !== ")") fail("expected )"); return a; })()) : peek() === "log" ? atom() : factor();
      const lg = inner.k > EPS ? { k: 0, p: 1, q: 0, c: 1 } : inner.p > EPS ? { k: 0, p: 0, q: 1, c: 1 } : fail("take the log of something that grows");
      return pow(lg, e);
    }
    fail(`unexpected "${t}"`);
  }
  const out = sum();
  if (i < toks.length) fail(`unexpected "${toks[i]}"`);
  return G(out.k, out.p, out.q, { c: out.c });
}

// --- Parsing the recurrence ----------------------------------------------------------
function splitTop(s) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "+" && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}

export function parseRecurrence(text) {
  let s = String(text).replace(/[⌊⌋⌈⌉]/g, "").replace(/−/g, "-").replace(/\s+/g, " ").trim();
  if (s.includes("=")) s = s.slice(s.lastIndexOf("=") + 1);
  const parts = splitTop(s);
  const rec = [], rest = [];
  for (const part of parts) {
    const m = /^(\d+(?:\.\d+)?)?\s*\*?\s*T\s*\((.+)\)$/.exec(part);
    if (!m) { if (/T\s*\(/.test(part)) throw new Error(`Can't read "${part}". Write terms like 2T(n/2), T(n-1) or T(2n/3).`); rest.push(part); continue; }
    const a = m[1] ? Number(m[1]) : 1, arg = m[2].replace(/\s+/g, "");
    let t;
    let x;
    if ((x = /^\(?(\d*)\*?n\)?\/(\d+)$/.exec(arg))) t = { type: "divide", a, frac: (x[1] ? Number(x[1]) : 1) / Number(x[2]), text: arg };
    else if ((x = /^n-(\d+)$/.exec(arg))) t = { type: "subtract", a, b: Number(x[1]), text: arg };
    else if (/^(sqrt\(n\)|√n|n\^\(?1\/2\)?|n\^0\.5)$/.test(arg)) t = { type: "root", a, r: 2, text: "√n" };
    else if ((x = /^n\^\(?1\/(\d+)\)?$/.exec(arg))) t = { type: "root", a, r: Number(x[1]), text: arg };
    else throw new Error(`Can't read T(${arg}). Use n/b, cn/d, n-b or sqrt(n).`);
    if (t.type === "divide" && !(t.frac > 0 && t.frac < 1)) throw new Error(`T(${arg}) must shrink the problem: the fraction has to be between 0 and 1.`);
    if (t.type === "subtract" && t.b < 1) throw new Error("T(n − b) needs b ≥ 1.");
    if (!(a > 0)) throw new Error("Each coefficient must be positive.");
    rec.push(t);
  }
  if (!rec.length) throw new Error("There's no T(…) term on the right-hand side.");
  const types = new Set(rec.map((t) => t.type));
  if (types.size > 1) throw new Error("Mix of different kinds of T(…) terms; use one kind (all n/b, all n − b or all √n).");
  const f = rest.length ? parseF(rest.join(" + ")) : G(0, 0, 0, { c: 0 });
  const type = rec[0].type;
  // Merge equal terms: T(n/2) + T(n/2) = 2T(n/2).
  const merged = [];
  for (const t of rec) {
    const same = merged.find((x) => x.frac === t.frac && x.b === t.b && x.r === t.r);
    if (same) same.a += t.a; else merged.push({ ...t });
  }
  const fText = rest.length ? rest.join(" + ") : "0";
  return { type, terms: merged, f, fText, text: `T(n) = ${merged.map((t) => `${t.a === 1 ? "" : num(t.a)}T(${t.type === "divide" ? fracText(t.frac) : t.type === "subtract" ? `n − ${t.b}` : t.r === 2 ? "√n" : `n^(1/${t.r})`})`).join(" + ")}${rest.length ? ` + ${fText}` : ""}` };
}
const fracText = (fr) => { for (let d = 2; d <= 12; d++) { const c = Math.round(fr * d); if (close(c / d, fr)) return c === 1 ? `n/${d}` : `${c}n/${d}`; } return `${num(fr)}n`; };

// --- Solving --------------------------------------------------------------------------
// Compare f = n^k log^p n with n^c: the master-theorem case split, extended.
function caseSplit(c, f) {
  if (f.k < c - EPS) return { case: 1, growth: G(c), why: `f(n) = ${showGrowth(f)} grows polynomially slower than n^c = ${showGrowth(G(c))}` };
  if (f.k > c + EPS) return { case: 3, growth: G(f.k, f.p, f.q), why: `f(n) = ${showGrowth(f)} grows polynomially faster than n^c = ${showGrowth(G(c))}` };
  if (!close(f.q, 0)) return { case: 2, growth: G(c, f.p + (f.p > -1 ? 1 : 0), f.q), why: "f(n) matches n^c up to log factors", rough: true };
  if (f.p > -1 + EPS) return { case: 2, growth: G(c, f.p + 1), why: `f(n) = ${showGrowth(f)} is n^c times log^${num(f.p)} n with ${num(f.p)} > −1` };
  if (close(f.p, -1)) return { case: 2, growth: G(c, 0, 1), why: `f(n) = n^c / log n: the levels add up like the harmonic series` };
  return { case: 2, growth: G(c), why: `f(n) = n^c · log^${num(f.p)} n with ${num(f.p)} < −1: the level costs shrink fast enough to sum to Θ(n^c)` };
}

// Akra-Bazzi exponent: Σ aᵢ bᵢ^p = 1, solved by bisection (the sum falls as p rises).
export function akraP(terms) {
  const F = (p) => terms.reduce((s, t) => s + t.a * t.frac ** p, 0) - 1;
  let lo = -10, hi = 20;
  for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (F(mid) > 0) lo = mid; else hi = mid; }
  const p = (lo + hi) / 2;
  return close(p, Math.round(p * 1e6) / 1e6) ? Math.round(p * 1e6) / 1e6 : p;
}

export const MASTER_CODE = [
  "T(n) = a·T(n/b) + f(n), with a ≥ 1, b > 1",
  "c ← log_b a  // the leaves: a^(log_b n) = n^c of them",
  "case 1: f(n) = O(n^(c−ε)) → T(n) = Θ(n^c)  // leaves dominate",
  "case 2: f(n) = Θ(n^c log^k n), k ≥ 0 → T(n) = Θ(n^c log^(k+1) n)  // every level equal",
  "case 3: f(n) = Ω(n^(c+ε)) and a·f(n/b) ≤ δ·f(n) → T(n) = Θ(f(n))  // root dominates",
  "otherwise (e.g. k < 0 in case 2) the basic theorem says nothing: use the extended version",
];

export function solve(rec) {
  const { type, terms, f } = rec;
  const steps = [];
  const fz = f.c === 0;
  const fg = fz ? G(0) : f;
  if (type === "divide" && terms.length === 1) {
    const { a } = terms[0], b = 1 / terms[0].frac;
    const c = Math.log(a) / Math.log(b);
    const cText = close(c, Math.round(c)) ? String(Math.round(c)) : `log${sub(num(b))} ${num(a)} ≈ ${c.toFixed(3)}`;
    steps.push({ line: 1, vars: { a: num(a), b: num(b), "f(n)": fz ? "0" : showGrowth(fg) }, note: `Match the form: a = ${num(a)} subproblems, each of size n/${num(b)}, plus f(n) = ${fz ? "0" : showGrowth(fg)} work to split and combine.` });
    steps.push({ line: 2, vars: { c: cText }, note: `c = log_b a = log${sub(num(b))} ${num(a)} = ${cText}. The tree has n^c = ${showGrowth(G(c))} leaves.` });
    const sp = fz ? { case: 1, growth: G(c), why: "there is no f(n)" } : caseSplit(c, fg);
    const basic = sp.case !== 2 || close(fg.p, 0) || fg.p > 0;
    const line = sp.case === 1 ? 3 : sp.case === 3 ? 5 : basic ? 4 : 6;
    const regular = sp.case === 3 ? `Regularity: a·f(n/b) = ${num(a)}·f(n/${num(b)}) ≈ ${num(a / b ** fg.k, 3)}·f(n) and ${num(a / b ** fg.k, 3)} < 1.` : "";
    steps.push({ line, vars: { case: sp.case, "T(n)": theta(sp.growth) }, tone: "good",
      note: `${sp.why[0].toUpperCase()}${sp.why.slice(1)}, so case ${sp.case}${basic ? "" : " of the extended master theorem (the basic CLRS theorem doesn't cover it)"}. ${regular} T(n) = ${theta(sp.growth)}.` });
    return { method: "master", a, b, c, case: sp.case, basic, growth: sp.growth, answer: theta(sp.growth), steps, ratio: a / b ** fg.k };
  }
  if (type === "divide") {
    const p = akraP(terms);
    steps.push({ line: 1, vars: { parts: terms.map((t) => `${num(t.a)}×${fracText(t.frac)}`).join(", ") }, note: `The parts have different sizes (${terms.map((t) => fracText(t.frac)).join(", ")}), so the master theorem doesn't apply. Use Akra-Bazzi.` });
    steps.push({ line: 2, vars: { p: num(p, 4) }, note: `Find p with ${terms.map((t) => `${num(t.a) === "1" ? "" : num(t.a)}(${num(t.frac)})^p`).join(" + ")} = 1: p = ${num(p, 4)}.` });
    const sp = fz ? { case: 1, growth: G(p), why: "there is no f(n)" } : caseSplit(p, fg);
    steps.push({ line: sp.case === 1 ? 3 : sp.case === 3 ? 5 : 4, vars: { "T(n)": theta(sp.growth) }, tone: "good", note: `Compare f(n) = ${showGrowth(fg)} with n^p: ${sp.why.replace(/n\^c/g, "n^p")}. T(n) = ${theta(sp.growth)}.` });
    return { method: "akra", p, case: sp.case, growth: sp.growth, answer: theta(sp.growth), steps };
  }
  if (type === "subtract") {
    if (terms.length === 1) {
      const { a, b } = terms[0];
      steps.push({ line: 1, vars: { a: num(a), b, "f(n)": fz ? "0" : showGrowth(fg) }, note: `Subtract and conquer: ${num(a)} subproblem${a === 1 ? "" : "s"} of size n − ${b}. The tree is n/${b} levels deep.` });
      if (close(a, 1)) {
        const g = fz ? G(1) : G(fg.k + 1, fg.p, fg.q);
        steps.push({ line: 4, vars: { "T(n)": theta(g) }, tone: "good", note: `One child per level, so T(n) just adds f over the n/${b} levels: ${fz ? "n/b constant steps" : `Σ f(n − ${b}i) ≈ n · ${showGrowth(fg)}`}. T(n) = ${theta(g)}.` });
        return { method: "subtract", growth: g, answer: theta(g), steps };
      }
      const base = a ** (1 / b);
      const g = G(0, 0, 0, { exp: base, expText: b === 1 ? `${num(a)}ⁿ` : `${num(a)}^(n/${b})` });
      steps.push({ line: 3, vars: { leaves: g.expText, "T(n)": theta(g) }, tone: "good", note: `Level i has ${num(a)}^i nodes, so the ${g.expText} leaves dominate any polynomial f: T(n) = ${theta(g)}.` });
      return { method: "subtract", growth: g, answer: theta(g), steps };
    }
    // aᵢ T(n − bᵢ): T grows like rⁿ for the largest root of Σ aᵢ r^(−bᵢ) = 1.
    const F = (r) => terms.reduce((s, t) => s + t.a * r ** -t.b, 0) - 1;
    let lo = 1, hi = 1 + terms.reduce((s, t) => s + t.a, 0);
    for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (F(mid) > 0) lo = mid; else hi = mid; }
    const r = (lo + hi) / 2;
    const g = G(0, 0, 0, { exp: r, expText: `${num(r, 3)}ⁿ` });
    steps.push({ line: 1, vars: { terms: terms.length }, note: `Several shrinking terms (${terms.map((t) => `T(n − ${t.b})`).join(", ")}): treat it like a linear recurrence.` });
    steps.push({ line: 2, vars: { r: num(r, 4) }, tone: "good", note: `The characteristic root r solves ${terms.map((t) => `${num(t.a) === "1" ? "" : num(t.a)}r^(−${t.b})`).join(" + ")} = 1, giving r ≈ ${r.toFixed(4)}${close(r, (1 + Math.sqrt(5)) / 2) ? " (the golden ratio φ)" : ""}. A polynomial f doesn't change it: T(n) = ${theta(g)}.` });
    return { method: "linear", r, growth: g, answer: theta(g), steps };
  }
  // T(n) = a T(n^(1/r)) + f: substitute m = log n.
  const { a, r } = terms[0];
  if (fg.k > EPS) {
    steps.push({ line: 1, vars: { a: num(a), r }, note: `With T(n^(1/${r})), the sizes fall from n to n^(1/${r}) at once.` });
    steps.push({ line: 5, vars: { "T(n)": theta(fg) }, tone: "good", note: `f(n) = ${showGrowth(fg)} is polynomial in n, and ${num(a)}·f(n^(1/${r})) is far smaller, so the root dominates: T(n) = ${theta(fg)}.` });
    return { method: "root", growth: G(fg.k, fg.p, fg.q), answer: theta(G(fg.k, fg.p, fg.q)), steps };
  }
  const fm = G(fg.p, fg.q, 0); // f in terms of m = log n
  const c = Math.log(a) / Math.log(r);
  steps.push({ line: 1, vars: { m: "log n", "S(m)": `${num(a)}S(m/${r}) + ${showGrowth(fm).replace(/n/g, "m")}` }, note: `Substitute m = log n, so n^(1/${r}) becomes m/${r}. With S(m) = T(2^m): S(m) = ${num(a)}·S(m/${r}) + ${fz ? "0" : showGrowth(fm).replace(/n/g, "m")}.` });
  const sp = fz ? { case: 1, growth: G(c), why: "there is no f" } : caseSplit(c, fm);
  const back = G(0, sp.growth.k, sp.growth.p);
  steps.push({ line: 2, vars: { c: num(c), case: sp.case }, note: `Master theorem on S: c = log${sub(String(r))} ${num(a)} = ${num(c)}; ${sp.why.replace(/n/g, "m")}. S(m) = ${theta(sp.growth).replace(/n/g, "m")}.` });
  steps.push({ line: sp.case === 1 ? 3 : sp.case === 3 ? 5 : 4, vars: { "T(n)": theta(back) }, tone: "good", note: `Put m = log n back: T(n) = ${theta(back)}.` });
  return { method: "root", case: sp.case, growth: back, answer: theta(back), steps };
}
const sub = (s) => String(s).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);

// --- Numbers ---------------------------------------------------------------------------
const fValue = (f, n) => (f.c === 0 ? 0 : f.c * Math.max(n, 0) ** f.k * (f.p ? Math.max(Math.log2(Math.max(n, 2)), 1) ** f.p : 1) * (f.q ? Math.max(Math.log2(Math.max(Math.log2(Math.max(n, 4)), 2)), 1) ** f.q : 1));
export function evaluateT(rec, n, memo = new Map()) {
  if (n <= 1) return 1;
  if (memo.has(n)) return memo.get(n);
  let v = fValue(rec.f, n);
  for (const t of rec.terms) {
    const m = t.type === "divide" ? Math.floor(n * t.frac + 1e-9) : t.type === "subtract" ? n - t.b : Math.floor(n ** (1 / t.r) + 1e-9);
    v += t.a * evaluateT(rec, m >= n ? n - 1 : m, memo);
  }
  memo.set(n, v);
  return v;
}
// T(n) exactly for small integer-valued cases (used by GATE NAT questions).
export function exactT(rec, n, base = 1) {
  const memo = new Map();
  const go = (x) => {
    if (x <= 1) return base;
    if (memo.has(x)) return memo.get(x);
    let v = rec.f.c === 0 ? 0 : Math.round(fValue(rec.f, x));
    for (const t of rec.terms) v += t.a * go(t.type === "divide" ? Math.floor(x * t.frac + 1e-9) : t.type === "subtract" ? x - t.b : Math.floor(Math.sqrt(x)));
    memo.set(x, v);
    return v;
  };
  return go(n);
}

// --- Recursion tree ----------------------------------------------------------------------
export const TREE_CODE = [
  "level 0: one node of size n, cost f(n)",
  "level i: every node of level i − 1 splits into its subproblems",
  "  cost of level i ← Σ f(size) over the level's nodes",
  "leaves: nodes of size 1, cost T(1) each",
  "T(n) ← Σ over all levels  // compare how the level costs change",
];

// Levels for a sample n: node sizes (grouped), node counts and cost per level.
export function recursionTree(rec, n) {
  const levels = [];
  let nodes = [{ size: n, count: 1 }];
  const shrink = (size, t) => (t.type === "divide" ? size * t.frac : t.type === "subtract" ? size - t.b : Math.floor(size ** (1 / t.r) + 1e-9));
  for (let depth = 0; depth < 200 && nodes.length; depth++) {
    const internal = nodes.filter((x) => x.size > 1 + 1e-9), leaves = nodes.filter((x) => x.size <= 1 + 1e-9);
    const cost = internal.reduce((s, x) => s + x.count * fValue(rec.f, x.size), 0) + leaves.reduce((s, x) => s + x.count, 0);
    const count = nodes.reduce((s, x) => s + x.count, 0);
    levels.push({ depth, groups: nodes.map((x) => ({ ...x })), count, cost, leaves: leaves.reduce((s, x) => s + x.count, 0) });
    const next = new Map();
    for (const x of internal) for (const t of rec.terms) {
      const s = shrink(x.size, t), key = Math.round(Math.max(s, 1) * 1e6) / 1e6;
      next.set(key, (next.get(key) ?? 0) + x.count * t.a);
    }
    nodes = [...next.entries()].map(([size, count]) => ({ size, count })).sort((a, b) => b.size - a.size);
    if (count > 1e12) break;
  }
  const total = levels.reduce((s, l) => s + l.cost, 0);
  return { levels, total };
}

// Symbolic level costs for the single-split divide case: a^i · f(n/b^i).
export function levelFormula(rec) {
  if (rec.type !== "divide" || rec.terms.length !== 1) return null;
  const a = rec.terms[0].a, b = 1 / rec.terms[0].frac, f = rec.f.c === 0 ? G(0) : rec.f;
  const ratio = a / b ** f.k;
  return { a, b, ratio, text: `level i: ${num(a)}^i nodes × f(n/${num(b)}^i) = ${showGrowth(G(f.k, f.p, f.q))} × (${num(a)}/${num(b)}${f.k ? power("", f.k) : ""})^i${f.p ? " (log factors aside)" : ""}`,
    trend: close(ratio, 1) ? "equal" : ratio < 1 ? "falling" : "rising" };
}

// Sample size for the tree: a power of b small enough to draw.
export function sampleN(rec) {
  if (rec.type === "divide") { const b = 1 / Math.max(...rec.terms.map((t) => t.frac)); return Math.round(Math.min(4096, Math.max(16, b ** 4))); }
  if (rec.type === "subtract") return 6;
  return 65536;
}

// --- Substitution check -------------------------------------------------------------------
export const SUBST_CODE = [
  "guess T(n) = Θ(g(n))",
  "compute T(n) exactly for growing n (T(1) = 1)",
  "ratio ← T(n) / g(n)",
  "ratio settles to a constant → the guess is right (up to constants)",
  "ratio keeps growing → the guess is too small; shrinking to 0 → too big",
];
export function substitution(rec, guess) {
  const ns = rec.type === "subtract" ? [8, 12, 16, 20, 24, 28, 32] : rec.type === "root" ? [16, 256, 4096, 65536, 2 ** 20, 2 ** 24] : (() => {
    const b = 1 / Math.max(...rec.terms.map((t) => t.frac));
    const out = [];
    for (let x = b ** 3; x <= 2 ** 24 && out.length < 8; x *= b ** 2) out.push(Math.round(x));
    return out;
  })();
  const memo = new Map();
  const rows = ns.map((n) => { const t = evaluateT(rec, n, memo); return { n, t, g: 2 ** log2Value(guess, n), ratio: t / 2 ** log2Value(guess, n) }; });
  const first = rows[Math.floor(rows.length / 2)].ratio, last = rows[rows.length - 1].ratio;
  const verdict = last / first > 1.4 ? "small" : last / first < 1 / 1.4 ? "big" : "fits";
  const steps = rows.map((r, i) => ({ row: i, line: [2, 3], vars: { n: r.n, "T(n)": r.t, "g(n)": r.g, ratio: r.ratio }, note: `n = ${r.n}: T(n) = ${fmtNum(r.t)}, g(n) = ${fmtNum(r.g)}, ratio ${r.ratio.toPrecision(4)}.` }));
  steps.push({ row: rows.length, line: verdict === "fits" ? 4 : 5, tone: verdict === "fits" ? "good" : "bad", vars: { verdict },
    note: verdict === "fits" ? `The ratio settles near ${last.toPrecision(3)}: T(n) = Θ(${showGrowth(guess)}) is consistent with the numbers.` : verdict === "small" ? `The ratio keeps growing (×${(last / first).toFixed(2)} over the last rows): ${showGrowth(guess)} is too small a guess.` : `The ratio keeps shrinking: ${showGrowth(guess)} is too big a guess (true, as an O bound, but not tight).` });
  return { rows, verdict, steps };
}
export const fmtNum = (x) => (x < 1e6 ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : x.toExponential(2));

// --- Growth library -------------------------------------------------------------------------
export const GROWTHS = {
  one: { label: "1", g: G(0) },
  loglog: { label: "log log n", g: G(0, 0, 1) },
  log: { label: "log n", g: G(0, 1) },
  log2: { label: "log² n", g: G(0, 2) },
  sqrt: { label: "√n", g: G(0.5) },
  n: { label: "n", g: G(1) },
  nlog: { label: "n log n", g: G(1, 1) },
  n2: { label: "n²", g: G(2) },
  n3: { label: "n³", g: G(3) },
  exp2: { label: "2ⁿ", g: G(0, 0, 0, { exp: 2 }) },
  exp3: { label: "3ⁿ", g: G(0, 0, 0, { exp: 3 }) },
  fact: { label: "n!", g: G(0, 0, 0, { fact: 1 }) },
  nn: { label: "nⁿ", g: G(0, 0, 0, { nn: 1 }) },
};

export const EXAMPLES = {
  merge: { name: "Merge sort", text: "T(n) = 2T(n/2) + n" },
  bsearch: { name: "Binary search", text: "T(n) = T(n/2) + 1" },
  linear: { name: "Insertion sort worst case", text: "T(n) = T(n-1) + n" },
  count: { name: "Counting down", text: "T(n) = T(n-1) + 1" },
  hanoi: { name: "Towers of Hanoi", text: "T(n) = 2T(n-1) + 1" },
  karatsuba: { name: "Karatsuba", text: "T(n) = 3T(n/2) + n" },
  strassen: { name: "Strassen", text: "T(n) = 7T(n/2) + n^2" },
  tree: { name: "Tree traversal", text: "T(n) = 2T(n/2) + 1" },
  select: { name: "Root-heavy: T(n/2) + n", text: "T(n) = T(n/2) + n" },
  case3: { name: "Case 3: 3T(n/4) + n log n", text: "T(n) = 3T(n/4) + n log n" },
  nlogn2: { name: "Extended case 2: 2T(n/2) + n log n", text: "T(n) = 2T(n/2) + n log n" },
  gap: { name: "Not in the basic theorem: 2T(n/2) + n/log n", text: "T(n) = 2T(n/2) + n/log n" },
  unequal: { name: "Unequal split (Akra-Bazzi)", text: "T(n) = T(n/3) + T(2n/3) + n" },
  fib: { name: "Naive Fibonacci", text: "T(n) = T(n-1) + T(n-2) + 1" },
  sqrt: { name: "Change of variable", text: "T(n) = 2T(sqrt(n)) + log n" },
};
