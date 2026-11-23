// Calculus: limits (a numeric table from both sides plus L'Hôpital for the
// indeterminate forms), maxima and minima of polynomials with a sign chart,
// definite integrals as Riemann sums against the exact value, and the mean
// value theorem. Each step has a formula line, live variables and a why-note.
//
// Conventions (stated in the UI):
// - Limits: x → a means from both sides; the table uses h = 0.1, 0.01, … 10⁻⁶.
// - L'Hôpital is applied only to 0/0 and ∞/∞; 0·∞, 1^∞, 0⁰ and ∞⁰ are first
//   rewritten into one of those.
// - Riemann sums use n equal strips; Simpson's rule needs n even.
import { Fraction } from "./fraction.js";
import { compile, derivative, evaluate, parse, polyDeriv, polyEval, polyEvalExact, polyIntegral, polyRealRoots, polyText, print, simplify, toPoly } from "./expr.js";

export const fmt = (x, d = 6) => {
  if (Number.isNaN(x)) return "undefined";
  if (x === Infinity) return "∞";
  if (x === -Infinity) return "−∞";
  if (Math.abs(x - Math.round(x)) < 1e-10) return String(Math.round(x)).replace("-", "−");
  return Number(x.toFixed(d)).toString().replace("-", "−");
};
// A nice exact-looking form for a decimal: 0.5 → 1/2, 2.7182… → e.
export function niceValue(x) {
  if (Number.isNaN(x)) return "does not exist";
  if (!Number.isFinite(x)) return fmt(x);
  for (const [v, t] of [[Math.E, "e"], [1 / Math.E, "1/e"], [Math.PI, "π"], [Math.LN2, "ln 2"], [Math.E ** 2, "e²"], [Math.sqrt(Math.E), "√e"]]) if (Math.abs(x - v) < 1e-7) return t;
  for (let q = 1; q <= 60; q++) { const p = Math.round(x * q); if (Math.abs(x - p / q) < 1e-9) return q === 1 ? String(p).replace("-", "−") : `${p}/${q}`.replace("-", "−"); }
  return fmt(x);
}

const N = (v) => ({ t: "num", v });
// A number typed as 2, -1.5, 3/4, pi or pi/2.
const RATIONAL = /^\s*[-−]?\d+(\.\d+)?(\/\d+)?\s*$/;
export function numArg(text) {
  const s = String(text).trim();
  if (RATIONAL.test(s)) return Fraction.parse(s).toNumber();
  const e = parse(s);
  if (JSON.stringify(e).includes('"x"')) throw new Error(`"${s}" should be a number, not use x.`);
  return evaluate(e, 0);
}
const show = (e) => print(simplify(e));

// --- Limits ---------------------------------------------------------------------------

export const LIMIT_CODE = [
  "try direct substitution: f(a)",
  "if f(a) is a number, the limit is f(a)  // continuous there",
  "make a table: f(a − h) and f(a + h) for h → 0",
  "0·∞, 1^∞, 0⁰, ∞⁰: rewrite as a quotient (take logs for powers)",
  "if N(a)/D(a) is 0/0 or ∞/∞:",
  "  lim N/D = lim N′/D′  // L'Hôpital: differentiate top and bottom separately",
  "  simplify, then substitute again",
  "otherwise read the limit off: c/∞ = 0, c/0 = ±∞, …",
];

// How e behaves as x → a from one side: { kind: "0" | "c" | "inf" | "?", v }.
function behave(e, a, side) {
  if (a === Infinity || a === -Infinity) {
    const s = a === Infinity ? 1 : -1;
    return probe((k) => evaluate(e, s * [1e3, 1e6, 1e12][k]));
  }
  const v = evaluate(e, a);
  if (Number.isFinite(v)) return { kind: Math.abs(v) < 1e-12 ? "0" : "c", v };
  if (!side) {
    const l = behave(e, a, -1), r = behave(e, a, 1);
    // Outside the domain on one side (ln x near 0): use the side that exists.
    if (l.kind === "?" && l.nan && r.kind !== "?") return { ...r, oneSided: 1 };
    if (r.kind === "?" && r.nan && l.kind !== "?") return { ...l, oneSided: -1 };
    if (l.kind === r.kind && (l.kind !== "inf" || Math.sign(l.v) === Math.sign(r.v)) && (l.kind !== "c" || Math.abs(l.v - r.v) < 1e-6)) return r;
    return { kind: l.kind === "inf" && r.kind === "inf" ? "inf±" : "?", l, r };
  }
  const hs = a === 0 ? [1e-4, 1e-8, 1e-16] : [1e-4, 1e-8, 1e-11];
  return probe((k) => evaluate(e, a + side * hs[k]));
}
function probe(at) {
  const vs = [0, 1, 2].map(at);
  if (vs.every(Number.isNaN)) return { kind: "?", nan: true };
  if (vs.some(Number.isNaN)) return { kind: "?" };
  if (vs[2] === Infinity || vs[2] === -Infinity) return { kind: "inf", v: vs[2] };
  const [v1, v2, v3] = vs.map((v) => (v === Infinity ? 1e300 : v === -Infinity ? -1e300 : v));
  if (Math.abs(v3) > 20 && Math.abs(v3) > Math.abs(v2) && Math.abs(v2) > Math.abs(v1)) return { kind: "inf", v: Math.sign(v3) * Infinity };
  if (Math.abs(v3) < 1e-6 && Math.abs(v3) <= Math.abs(v2)) return { kind: "0", v: 0 };
  if (Math.abs(v3 - v2) < 1e-4 * Math.max(1, Math.abs(v3))) return { kind: "c", v: v3 };
  return { kind: "?" };
}
const kindText = (b) => (b.kind === "0" ? "0" : b.kind === "inf" ? (b.v > 0 ? "∞" : "−∞") : b.kind === "inf±" ? "±∞" : b.kind === "c" ? fmt(b.v, 4) : "?");

// Rational functions: [P, Q] polynomial pairs, or null.
function toRational(e) {
  const pmul = (p, q) => { const r = Array(p.length + q.length - 1).fill(Fraction.ZERO); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] = r[i + j].add(a.mul(b)); })); return r; };
  const padd = (p, q) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] ?? Fraction.ZERO).add(q[i] ?? Fraction.ZERO));
  const neg = (p) => p.map((c) => c.neg());
  const go = (e) => {
    const p = toPoly(e);
    if (p) return [p, [Fraction.ONE]];
    switch (e.t) {
      case "neg": { const r = go(e.a); return r && [neg(r[0]), r[1]]; }
      case "+": case "-": { const a = go(e.a), b = go(e.b); if (!a || !b) return null; const bn = e.t === "-" ? neg(b[0]) : b[0]; return [padd(pmul(a[0], b[1]), pmul(bn, a[1])), pmul(a[1], b[1])]; }
      case "*": { const a = go(e.a), b = go(e.b); return a && b && [pmul(a[0], b[0]), pmul(a[1], b[1])]; }
      case "/": { const a = go(e.a), b = go(e.b); return a && b && [pmul(a[0], b[1]), pmul(a[1], b[0])]; }
      case "^": {
        if (e.b.t !== "num" || !Number.isInteger(e.b.v) || Math.abs(e.b.v) > 8) return null;
        const a = go(e.a); if (!a) return null;
        let r = [[Fraction.ONE], [Fraction.ONE]];
        for (let i = 0; i < Math.abs(e.b.v); i++) r = [pmul(r[0], a[0]), pmul(r[1], a[1])];
        return e.b.v < 0 ? [r[1], r[0]] : r;
      }
      default: return null;
    }
  };
  return go(e);
}
const trimP = (p) => { const q = [...p]; while (q.length > 1 && q.at(-1).isZero()) q.pop(); return q; };
function pdivmod(a, b) {
  a = trimP(a); b = trimP(b);
  if (a.length < b.length) return [[Fraction.ZERO], a];
  const q = Array(a.length - b.length + 1).fill(Fraction.ZERO);
  let r = [...a];
  for (let i = a.length - b.length; i >= 0; i--) {
    const c = r[i + b.length - 1].div(b.at(-1));
    q[i] = c;
    for (let j = 0; j < b.length; j++) r[i + j] = r[i + j].sub(c.mul(b[j]));
  }
  r = trimP(r.slice(0, Math.max(1, b.length - 1)));
  return [trimP(q), r];
}
function pgcd(a, b) {
  a = trimP(a); b = trimP(b);
  while (!(b.length === 1 && b[0].isZero())) [a, b] = [b, pdivmod(a, b)[1]];
  return a.map((c) => c.div(a.at(-1)));
}
function polyAst(p) {
  let e = null;
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i].isZero()) continue;
    const c = p[i].toNumber();
    const term = i === 0 ? N(Math.abs(c)) : { t: "*", a: N(Math.abs(c)), b: i === 1 ? { t: "x" } : { t: "^", a: { t: "x" }, b: N(i) } };
    e = e === null ? (c < 0 ? { t: "neg", a: term } : term) : { t: c < 0 ? "-" : "+", a: e, b: term };
  }
  return simplify(e ?? N(0));
}
// Cancel a quotient of rational functions to lowest terms: [num, den] ASTs.
function cancel(Nn, Dd) {
  const a = toRational(Nn), b = toRational(Dd);
  if (!a || !b) return null;
  let P = pmulF(a[0], b[1]), Q = pmulF(a[1], b[0]);
  const g = pgcd(P, Q);
  if (g.length > 1) { P = pdivmod(P, g)[0]; Q = pdivmod(Q, g)[0]; }
  const lead = Q.at(-1);
  P = P.map((c) => c.div(lead)); Q = Q.map((c) => c.div(lead));
  return [polyAst(P), polyAst(Q), g.length > 1 ? polyText(g) : null];
}
function pmulF(p, q) { const r = Array(p.length + q.length - 1).fill(Fraction.ZERO); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] = r[i + j].add(a.mul(b)); })); return r; }

export function limit(src, atText) {
  const e = parse(src);
  const at = String(atText).trim().toLowerCase().replace("−", "-");
  const a = at === "inf" || at === "∞" || at === "+inf" ? Infinity : at === "-inf" || at === "-∞" ? -Infinity : numArg(at);
  if (Number.isNaN(a)) throw new Error("x must approach a number, inf or -inf.");
  const f = compile(e);
  const where = a === Infinity ? "∞" : a === -Infinity ? "−∞" : fmt(a);
  const lim = `lim(x→${where})`;
  // Numeric table.
  const table = [];
  if (Number.isFinite(a)) for (let k = 1; k <= 6; k++) { const h = 10 ** -k; table.push({ h, left: f(a - h), right: f(a + h), xl: a - h, xr: a + h }); }
  else for (let k = 1; k <= 6; k++) { const x = (a > 0 ? 1 : -1) * 10 ** k; table.push({ x, value: f(x) }); }
  const steps = [];
  const est = Number.isFinite(a) ? { left: table.at(-1).left, right: table.at(-1).right } : { value: table.at(-1).value };
  // A one-sided domain (ln x, √x near 0): the limit is the side that exists.
  if (Number.isFinite(a) && table.every((r) => Number.isNaN(r.left))) est.left = est.right;
  if (Number.isFinite(a) && table.every((r) => Number.isNaN(r.right))) est.right = est.left;
  steps.push({ line: 3, rows: 0, vars: { f: print(e), "x →": where }, note: `Find ${lim} ${print(e)}. Start with numbers: evaluate f closer and closer to ${where}${Number.isFinite(a) ? " from both sides" : ""}.` });
  for (let i = 0; i < table.length; i++) {
    const r = table[i];
    steps.push({ line: 3, rows: i + 1, vars: Number.isFinite(a) ? { h: r.h, [`f(${fmt(r.xl)})`]: fmt(r.left, 6), [`f(${fmt(r.xr)})`]: fmt(r.right, 6) } : { x: r.x, "f(x)": fmt(r.value, 6) },
      note: Number.isFinite(a) ? `h = ${fmt(r.h)}: f(${fmt(a)} − h) = ${fmt(r.left, 6)}, f(${fmt(a)} + h) = ${fmt(r.right, 6)}.` : `x = ${fmt(r.x)}: f(x) = ${fmt(r.value, 6)}.` });
  }
  const rows = table.length;
  let answer = null, method = "numeric";
  const done = (v, note, line = 8) => { answer = v; steps.push({ line, rows, done: true, vars: { limit: niceValue(v) }, note }); };

  // Direct substitution.
  const direct = Number.isFinite(a) ? f(a) : NaN;
  if (Number.isFinite(direct)) {
    method = "substitution";
    steps.push({ line: 1, rows, vars: { [`f(${fmt(a)})`]: fmt(direct, 6) }, note: `Substitute x = ${fmt(a)}: f(${fmt(a)}) = ${fmt(direct, 6)}, a real number. f is continuous at ${fmt(a)}, so that's the limit.` });
    done(direct, `${lim} ${print(e)} = ${niceValue(direct)}. The table agrees.`, 2);
  } else {
    if (Number.isFinite(a)) steps.push({ line: 1, rows, vars: { [`f(${fmt(a)})`]: Number.isNaN(direct) ? "undefined" : fmt(direct) }, note: `Substituting x = ${fmt(a)} doesn't give a number, so look at the form of the expression.` });
    let num = null, den = null, wrapExp = false;
    const sideFor = 0;
    if (e.t === "/") { num = e.a; den = e.b; }
    else if (e.t === "*") {
      const bu = behave(e.a, a, sideFor), bv = behave(e.b, a, sideFor);
      const [zero, inf] = bu.kind === "0" && bv.kind.startsWith("inf") ? [e.a, e.b] : bv.kind === "0" && bu.kind.startsWith("inf") ? [e.b, e.a] : [null, null];
      if (zero) {
        num = inf; den = simplify({ t: "/", a: N(1), b: zero });
        steps.push({ line: 4, rows, vars: { form: "0·∞" }, note: `${show(zero)} → 0 and ${show(inf)} → ${kindText(behave(inf, a, sideFor))}: the form 0·∞. Rewrite u·v as v / (1/u): ${show(num)} / (${show(den)}), which is ∞/∞.` });
      }
    } else if (e.t === "^" && JSON.stringify(e.b).includes('"x"')) {
      const bb = behave(e.a, a, sideFor), be = behave(e.b, a, sideFor);
      const form = bb.kind === "c" && Math.abs(bb.v - 1) < 1e-9 && be.kind.startsWith("inf") ? "1^∞" : bb.kind === "0" && be.kind === "0" ? "0⁰" : bb.kind.startsWith("inf") && be.kind === "0" ? "∞⁰" : null;
      if (form) {
        wrapExp = true;
        const lnf = simplify({ t: "fn", f: "ln", a: e.a });
        // g·ln f → ln f / (1/g)
        num = lnf; den = simplify({ t: "/", a: N(1), b: e.b });
        steps.push({ line: 4, rows, vars: { form }, note: `The form ${form}. Take logs: if L is the limit, ln L = lim ${show(e.b)}·${show(lnf)} = lim ${show(lnf)} / (${show(den)}), a quotient we can attack with L'Hôpital.` });
      }
    }
    if (num) {
      for (let round = 0; round < 7 && answer === null; round++) {
        const bn = behave(num, a, 0), bd = behave(den, a, 0);
        const form = bn.kind === "0" && bd.kind === "0" ? "0/0" : bn.kind.startsWith("inf") && bd.kind.startsWith("inf") ? "∞/∞" : null;
        if (form) {
          method = "lhopital";
          const dn = derivative(num), dd = derivative(den);
          steps.push({ line: 5, rows, vars: { "N →": kindText(bn), "D →": kindText(bd), form }, note: `Top ${show(num)} → ${kindText(bn)} and bottom ${show(den)} → ${kindText(bd)}: the indeterminate form ${form}. It could be anything, so it needs more work.` });
          steps.push({ line: 6, rows, vars: { "N′": print(dn), "D′": print(dd) }, note: `L'Hôpital's rule: differentiate the top and the bottom separately (not as a quotient). N′ = ${print(dn)}, D′ = ${print(dd)}.` });
          num = dn; den = dd;
          const c = Number.isFinite(a) || true ? cancel(num, den) : null;
          if (c && (print(c[0]) !== print(num) || print(c[1]) !== print(den))) {
            steps.push({ line: 7, rows, vars: { "N′/D′": `${print(c[0])} / ${print(c[1])}` }, note: `Simplify algebraically: N′/D′ = ${print(c[1]) === "1" ? print(c[0]) : `(${print(c[0])}) / (${print(c[1])})`}${c[2] ? ` (a common factor ${c[2]} cancels)` : ""}.` });
            num = c[0]; den = c[1];
          }
          continue;
        }
        // Not indeterminate: read off the value.
        let v = null, why = "";
        if (bn.kind === "?" || bd.kind === "?" || bd.kind === "inf±" || bn.kind === "inf±") break;
        if (bd.kind === "c") { v = (bn.kind === "inf" ? bn.v * Math.sign(bd.v) : bn.v / bd.v); why = `${kindText(bn)} / ${kindText(bd)} = ${niceValue(v)}`; }
        else if (bd.kind === "inf") { v = 0; why = `${kindText(bn)} / ${kindText(bd)} → 0: a bounded top over an unbounded bottom`; }
        else if (bd.kind === "0") {
          // c/0: check the sign from each side.
          const ratio = (x) => evaluate(num, x) / evaluate(den, x);
          if (Number.isFinite(a)) {
            const l = ratio(a - 1e-7), r = ratio(a + 1e-7);
            v = Math.sign(l) === Math.sign(r) ? Math.sign(r) * Infinity : NaN;
            why = Number.isNaN(v) ? `${kindText(bn)} / 0: it blows up to ${l < 0 ? "−∞" : "+∞"} from the left and ${r < 0 ? "−∞" : "+∞"} from the right, so the limit doesn't exist` : `${kindText(bn)} / 0 with the same sign on both sides → ${fmt(v)}`;
          } else { v = Math.sign(ratio(a > 0 ? 1e8 : -1e8)) * Infinity; why = `${kindText(bn)} / 0 → ${fmt(v)}`; }
        }
        if (v !== null) {
          if (wrapExp) {
            steps.push({ line: 8, rows, vars: { "ln L": niceValue(v) }, note: `So ln L = ${niceValue(v)} (${why}).` });
            const L = Math.exp(v);
            done(L, `${lim} ${print(e)} = e^(${niceValue(v)}) = ${niceValue(L)}.`);
          } else done(v, Number.isNaN(v) ? `${lim} ${print(e)} does not exist: ${why}.` : `${lim} ${print(e)} = ${niceValue(v)}: ${why}.`);
        }
        break;
      }
    }
  }
  // Fall back to the table when the algebra couldn't finish.
  const tableValue = Number.isFinite(a) ? (Math.abs(est.left - est.right) < 1e-3 * Math.max(1, Math.abs(est.right)) ? est.right : NaN) : est.value;
  if (answer === null) {
    method = "numeric";
    const ok = Number.isFinite(tableValue);
    steps.push({ line: 3, rows, done: true, vars: { estimate: ok ? fmt(tableValue, 4) : "none" },
      note: ok ? `The algebra here needs a different trick, but the table settles near ${fmt(tableValue, 4)}${niceValue(tableValue) !== fmt(tableValue) ? ` (that's ${niceValue(tableValue)})` : ""}, so the limit is about ${fmt(tableValue, 4)}.` : `The values from the left (${fmt(est.left ?? est.value, 4)}) and right (${fmt(est.right ?? est.value, 4)}) don't settle on one number, so the limit doesn't exist.` });
    answer = ok ? tableValue : NaN;
  }
  return { expr: e, a, table, steps, answer, method, estimate: est, text: niceValue(answer) };
}

// --- Maxima and minima of polynomials -------------------------------------------------

export const EXTREMA_CODE = [
  "p′(x) ← differentiate term by term  // d/dx xⁿ = n·xⁿ⁻¹",
  "critical points ← solve p′(x) = 0",
  "sign chart: test p′ between critical points",
  "p′ goes + to −: local maximum;  − to +: local minimum",
  "no sign change: neither (a flat point)",
  "second derivative test: p″(c) < 0 max, > 0 min, = 0 inconclusive",
  "on [a, b]: compare p at the endpoints and the critical points inside",
];

const rootText = (r) => (r.exact ? r.exact.toString() : `≈ ${fmt(r.value, 4)}`);
export function extrema(src, interval = null) {
  const e = parse(src);
  const p = toPoly(e);
  if (!p) throw new Error("Type a polynomial in x, such as x^3 − 3x + 2.");
  if (p.length < 3) throw new Error("A polynomial of degree 0 or 1 has no turning points; try degree 2 or more.");
  if (p.length > 7) throw new Error("Keep the degree at 6 or less.");
  const dp = polyDeriv(p), ddp = polyDeriv(dp);
  const crit = polyRealRoots(dp);
  const steps = [];
  steps.push({ line: 1, chart: 0, vars: { "p(x)": polyText(p), "p′(x)": polyText(dp) }, note: `p(x) = ${polyText(p)}. Differentiate each term: p′(x) = ${polyText(dp)}.` });
  steps.push({ line: 2, chart: 0, crit: true, vars: { "p′(x) = 0": crit.length ? crit.map(rootText) : "no real roots" }, note: crit.length ? `Solve ${polyText(dp)} = 0: x = ${crit.map(rootText).join(", ")}${crit.some((r) => !r.exact) ? " (irrational roots to 4 places)" : ""}. These are the only places a smooth function can turn.` : `${polyText(dp)} = 0 has no real roots, so p never turns: it is ${polyEval(dp, 0) > 0 ? "always increasing" : "always decreasing"}.` });
  // Sign chart.
  const xs = crit.map((r) => r.value);
  const tests = xs.length ? [xs[0] - 1, ...xs.slice(1).map((x, i) => (x + xs[i]) / 2), xs.at(-1) + 1] : [0];
  const signs = tests.map((t) => Math.sign(polyEval(dp, t)));
  const intervals = tests.map((t, i) => ({ from: i === 0 ? -Infinity : xs[i - 1], to: i === xs.length ? Infinity : xs[i], test: t, sign: signs[i] }));
  steps.push({ line: 3, chart: 1, vars: { tests: tests.map((t, i) => `p′(${fmt(t, 3)}) ${signs[i] > 0 ? "> 0" : signs[i] < 0 ? "< 0" : "= 0"}`) }, note: `Pick a test point in each interval and check the sign of p′: ${intervals.map((iv) => `${iv.sign > 0 ? "+" : "−"} on (${fmt(iv.from, 3)}, ${fmt(iv.to, 3)})`).join(", ")}. Where p′ > 0, p is increasing; where p′ < 0, decreasing.` });
  const points = crit.map((r, i) => {
    const left = signs[i], right = signs[i + 1];
    const kind = left > 0 && right < 0 ? "max" : left < 0 && right > 0 ? "min" : "neither";
    const value = r.exact ? polyEvalExact(p, r.exact) : null;
    const second = r.exact ? polyEvalExact(ddp, r.exact) : null;
    return { x: r, kind, value: value ? value.toNumber() : polyEval(p, r.value), exactValue: value, second: second ? second.toNumber() : polyEval(ddp, r.value), exactSecond: second };
  });
  points.forEach((pt, i) => {
    const vText = pt.exactValue ? pt.exactValue.toString() : fmt(pt.value, 4);
    steps.push({ line: pt.kind === "neither" ? 5 : [4, 6], chart: 2 + i, vars: { x: rootText(pt.x), "p(x)": vText, "p″(x)": pt.exactSecond ? pt.exactSecond.toString() : fmt(pt.second, 4), type: pt.kind === "max" ? "local max" : pt.kind === "min" ? "local min" : "neither" },
      note: pt.kind === "neither" ? `At x = ${rootText(pt.x)}, p′ has the same sign on both sides, so it's neither a maximum nor a minimum (the graph flattens and carries on). p″ = ${pt.exactSecond ?? fmt(pt.second, 4)}.`
        : `At x = ${rootText(pt.x)}, p′ changes from ${pt.kind === "max" ? "+ to −" : "− to +"}, so p has a local ${pt.kind === "max" ? "maximum" : "minimum"}: p(${rootText(pt.x)}) = ${vText}. The second derivative agrees: p″ = ${pt.exactSecond ?? fmt(pt.second, 4)} ${Math.abs(pt.second) < 1e-12 ? "= 0 (inconclusive, but the sign chart decides)" : pt.second < 0 ? "< 0" : "> 0"}.` });
  });
  let absolute = null;
  if (interval) {
    const [lo, hi] = interval.map((v) => Fraction.from(v));
    if (lo.cmp(hi) >= 0) throw new Error("The interval needs a < b.");
    const cands = [{ x: lo.toString(), v: polyEvalExact(p, lo), why: "endpoint" }, ...points.filter((pt) => pt.x.value > lo.toNumber() && pt.x.value < hi.toNumber()).map((pt) => ({ x: rootText(pt.x), v: pt.exactValue ?? pt.value, why: "critical point" })), { x: hi.toString(), v: polyEvalExact(p, hi), why: "endpoint" }];
    const num = (v) => (typeof v === "number" ? v : v.toNumber());
    const max = cands.reduce((m, c) => (num(c.v) > num(m.v) ? c : m)), min = cands.reduce((m, c) => (num(c.v) < num(m.v) ? c : m));
    absolute = { candidates: cands.map((c) => ({ ...c, value: num(c.v), text: typeof c.v === "number" ? fmt(c.v, 4) : c.v.toString() })), max: { x: max.x, value: num(max.v) }, min: { x: min.x, value: num(min.v) } };
    steps.push({ line: 7, chart: 2 + points.length, vars: Object.fromEntries(absolute.candidates.map((c) => [`p(${c.x})`, c.text])), note: `On [${lo}, ${hi}], the absolute extremes are at the endpoints or at critical points inside. Compare: ${absolute.candidates.map((c) => `p(${c.x}) = ${c.text}`).join(", ")}. Absolute maximum ${absolute.candidates.find((c) => c.x === max.x).text} at x = ${max.x}; absolute minimum ${absolute.candidates.find((c) => c.x === min.x).text} at x = ${min.x}.` });
  }
  const maxes = points.filter((x) => x.kind === "max"), mins = points.filter((x) => x.kind === "min");
  steps.push({ line: 4, chart: 2 + points.length, done: true, vars: { "local max": maxes.map((m) => `x = ${rootText(m.x)}`), "local min": mins.map((m) => `x = ${rootText(m.x)}`) }, note: `${maxes.length ? `Local maxim${maxes.length > 1 ? "a" : "um"} at ${maxes.map((m) => `x = ${rootText(m.x)}`).join(", ")}` : "No local maximum"}; ${mins.length ? `local minim${mins.length > 1 ? "a" : "um"} at ${mins.map((m) => `x = ${rootText(m.x)}`).join(", ")}` : "no local minimum"}.` });
  return { poly: p, dp, ddp, crit, intervals, points, absolute, steps, interval };
}

// --- Definite integrals ---------------------------------------------------------------

export const METHODS = {
  left: { name: "Left Riemann sum", formula: "Σ f(xᵢ₋₁)·Δx" },
  right: { name: "Right Riemann sum", formula: "Σ f(xᵢ)·Δx" },
  mid: { name: "Midpoint rule", formula: "Σ f((xᵢ₋₁ + xᵢ)/2)·Δx" },
  trap: { name: "Trapezoidal rule", formula: "Δx/2·[f(x₀) + 2f(x₁) + … + 2f(xₙ₋₁) + f(xₙ)]" },
  simpson: { name: "Simpson's 1/3 rule", formula: "Δx/3·[f(x₀) + 4f(x₁) + 2f(x₂) + … + 4f(xₙ₋₁) + f(xₙ)]" },
};
export const INTEGRAL_CODE = [
  "Δx ← (b − a)/n;  xᵢ ← a + i·Δx",
  "left: Σ f(xᵢ₋₁)Δx   right: Σ f(xᵢ)Δx   midpoint: Σ f(mᵢ)Δx",
  "trapezoid: Δx/2·(f₀ + 2f₁ + … + 2fₙ₋₁ + fₙ)",
  "Simpson (n even): Δx/3·(f₀ + 4f₁ + 2f₂ + … + 4fₙ₋₁ + fₙ)",
  "double n and watch the sum close in on the area",
  "exact: ∫ₐᵇ f dx = F(b) − F(a), where F′ = f",
];

export function riemann(f, a, b, n, method) {
  const dx = (b - a) / n;
  const x = (i) => a + i * dx;
  let s = 0;
  if (method === "left") for (let i = 0; i < n; i++) s += f(x(i));
  else if (method === "right") for (let i = 1; i <= n; i++) s += f(x(i));
  else if (method === "mid") for (let i = 0; i < n; i++) s += f(x(i + 0.5));
  else if (method === "trap") { s = (f(a) + f(b)) / 2; for (let i = 1; i < n; i++) s += f(x(i)); }
  else if (method === "simpson") { if (n % 2) throw new Error("Simpson's rule needs an even n."); s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(x(i)) * (i % 2 ? 4 : 2); return (s * dx) / 3; }
  return s * dx;
}

// Antiderivative by the standard rules, or null when none applies.
export function antiderivative(e) {
  e = simplify(e);
  const X = { t: "x" };
  const free = (u) => !JSON.stringify(u).includes('"x"');
  const linear = (u) => { const p = toPoly(u); return p && p.length === 2 && !p[1].isZero() ? p[1].toNumber() : null; };
  const scale = (u, k) => (k === 1 ? u : { t: "/", a: u, b: N(k) });
  const go = (e) => {
    if (free(e)) return { t: "*", a: e, b: X };
    const p = toPoly(e);
    if (p) return polyAst(polyIntegral(p));
    switch (e.t) {
      case "neg": { const r = go(e.a); return r && { t: "neg", a: r }; }
      case "+": case "-": { const l = go(e.a), r = go(e.b); return l && r && { t: e.t, a: l, b: r }; }
      case "*":
        if (free(e.a)) { const r = go(e.b); return r && { t: "*", a: e.a, b: r }; }
        if (free(e.b)) { const r = go(e.a); return r && { t: "*", a: e.b, b: r }; }
        return null;
      case "/":
        if (free(e.b)) { const r = go(e.a); return r && { t: "/", a: r, b: e.b }; }
        if (free(e.a)) { const k = linear(e.b); if (k !== null) return { t: "*", a: e.a, b: scale({ t: "fn", f: "ln", a: { t: "fn", f: "abs", a: e.b } }, k) }; }
        return null;
      case "^": {
        if (free(e.b)) {
          const k = linear(e.a), n = evaluate(e.b, 0);
          if (k === null) return null;
          if (Math.abs(n + 1) < 1e-12) return scale({ t: "fn", f: "ln", a: { t: "fn", f: "abs", a: e.a } }, k);
          return { t: "/", a: { t: "^", a: e.a, b: N(n + 1) }, b: N((n + 1) * k) };
        }
        if (free(e.a)) {
          const k = linear(e.b);
          if (k === null) return null;
          if (e.a.t === "const" && e.a.v === "e") return scale(e, k);
          return { t: "/", a: e, b: { t: "*", a: N(k), b: { t: "fn", f: "ln", a: e.a } } };
        }
        return null;
      }
      case "fn": {
        const k = linear(e.a);
        if (k === null) return null;
        if (e.f === "sin") return { t: "neg", a: scale({ t: "fn", f: "cos", a: e.a }, k) };
        if (e.f === "cos") return scale({ t: "fn", f: "sin", a: e.a }, k);
        if (e.f === "exp") return scale(e, k);
        if (e.f === "sqrt") return { t: "/", a: { t: "*", a: N(2), b: { t: "^", a: e.a, b: N(1.5) } }, b: N(3 * k) };
        if (e.f === "tan") return { t: "neg", a: scale({ t: "fn", f: "ln", a: { t: "fn", f: "abs", a: { t: "fn", f: "cos", a: e.a } } }, k) };
        return null;
      }
    }
    return null;
  };
  const r = go(e);
  return r ? simplify(r) : null;
}

export function integral(src, aText, bText, method = "mid", nMax = 16) {
  const e = parse(src);
  const f = compile(e);
  const a = numArg(aText), b = numArg(bText);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("The limits a and b must be numbers.");
  if (a >= b) throw new Error("Use a < b.");
  if (!METHODS[method]) throw new Error("Unknown method.");
  if (!(Number.isInteger(nMax) && nMax >= 1 && nMax <= 256)) throw new Error("n must be a whole number from 1 to 256.");
  for (let i = 0; i <= 400; i++) { const v = f(a + ((b - a) * i) / 400); if (!Number.isFinite(v)) throw new Error(`f isn't defined everywhere on [${fmt(a)}, ${fmt(b)}] (it fails near x = ${fmt(a + ((b - a) * i) / 400, 3)}), so this integral is improper.`); }
  // Exact value.
  const p = toPoly(e);
  let exact = null, exactText = null, F = null;
  if (p && RATIONAL.test(String(aText)) && RATIONAL.test(String(bText))) {
    const I = polyIntegral(p), A = Fraction.parse(String(aText)), B = Fraction.parse(String(bText));
    const v = polyEvalExact(I, B).sub(polyEvalExact(I, A));
    exact = v.toNumber(); exactText = v.toString(); F = polyText(I);
  } else {
    const Fa = antiderivative(e);
    if (Fa) {
      F = print(Fa);
      exact = evaluate(Fa, b) - evaluate(Fa, a);
      exactText = niceValue(exact);
    }
  }
  const reference = exact ?? riemann(f, a, b, 20000, "simpson");
  const ns = [];
  for (let n = method === "simpson" ? 2 : 1; n <= nMax; n *= 2) ns.push(n);
  if (method === "simpson" && nMax < 2) ns.push(2);
  if (ns.at(-1) !== nMax && (method !== "simpson" || nMax % 2 === 0)) ns.push(nMax);
  const steps = [];
  steps.push({ line: 6, n: 0, vars: { "f(x)": print(e), a: fmt(a), b: fmt(b), ...(F ? { "F(x)": F } : {}) },
    note: F ? `An antiderivative is F(x) = ${F}, so ∫ = F(${fmt(a)}) to F(${fmt(b)}): F(b) − F(a) = ${exactText}${exactText !== fmt(exact) ? ` ≈ ${fmt(exact)}` : ""}. Now see how Riemann sums approach it.` : `No elementary antiderivative is used here, so the reference value ${fmt(reference)} comes from Simpson's rule with 20,000 strips. Now see how the sums approach it.` });
  const sums = [];
  for (const n of ns) {
    const s = riemann(f, a, b, n, method);
    const err = s - reference;
    sums.push({ n, sum: s, error: err });
    const prev = sums.at(-2);
    steps.push({ line: [1, method === "trap" ? 3 : method === "simpson" ? 4 : 2], n, vars: { n, "Δx": fmt((b - a) / n), sum: fmt(s), error: fmt(err) },
      note: `n = ${n}, Δx = ${fmt((b - a) / n)}: ${METHODS[method].name} = ${fmt(s)}, off by ${fmt(Math.abs(err))}.${prev && Math.abs(err) > 1e-12 && Math.abs(prev.error) > 1e-12 ? ` Doubling n cut the error by a factor of about ${fmt(Math.abs(prev.error / err), 1)}${method === "trap" || method === "mid" ? " (expect 4: error ∝ 1/n²)" : method === "simpson" ? " (expect 16: error ∝ 1/n⁴)" : " (expect 2: error ∝ 1/n)"}.` : ""}` });
  }
  steps.push({ line: [5, 6], n: ns.at(-1), done: true, vars: { exact: exactText ?? fmt(reference), [`n = ${ns.at(-1)}`]: fmt(sums.at(-1).sum) },
    note: `With ${ns.at(-1)} strips the ${METHODS[method].name.toLowerCase()} gives ${fmt(sums.at(-1).sum)}; the ${exact !== null ? "exact" : "reference"} value is ${exactText ?? fmt(reference)}. As n → ∞ every Riemann sum tends to the integral.` });
  return { expr: e, a, b, method, exact, exactText, F, reference, sums, steps };
}

// --- Mean value theorem ---------------------------------------------------------------

export const MVT_CODE = [
  "f continuous on [a, b] and differentiable on (a, b)",
  "secant slope m ← (f(b) − f(a)) / (b − a)",
  "f′(x) ← differentiate",
  "solve f′(c) = m for c in (a, b)  // the tangent there is parallel to the secant",
  "Rolle: if f(a) = f(b) then m = 0, so f′(c) = 0",
];

export function mvt(src, aText, bText) {
  const e = parse(src);
  const f = compile(e);
  const a = numArg(aText), b = numArg(bText);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new Error("Use numbers with a < b.");
  for (let i = 0; i <= 400; i++) if (!Number.isFinite(f(a + ((b - a) * i) / 400))) throw new Error("f must be defined (continuous) on all of [a, b].");
  const de = derivative(e), df = compile(de);
  const fa = f(a), fb = f(b), m = (fb - fa) / (b - a);
  const p = toPoly(e);
  let cs = [];
  if (p && RATIONAL.test(String(aText)) && RATIONAL.test(String(bText))) {
    const A = Fraction.parse(String(aText)), B = Fraction.parse(String(bText));
    const M = polyEvalExact(p, B).sub(polyEvalExact(p, A)).div(B.sub(A));
    const g = polyDeriv(p).map((c, i) => (i === 0 ? c.sub(M) : c));
    cs = (g.length > 1 ? polyRealRoots(g) : []).filter((r) => r.value > a + 1e-12 && r.value < b - 1e-12).map((r) => ({ value: r.value, text: r.exact ? r.exact.toString() : fmt(r.value, 4) }));
  } else {
    const K = 2000, g = (x) => df(x) - m;
    let prev = g(a + (b - a) / K / 2), px = a + (b - a) / K / 2;
    for (let i = 1; i < K; i++) {
      const x = a + ((b - a) * (i + 0.5)) / K, v = g(x);
      if (Number.isFinite(v) && Number.isFinite(prev) && Math.sign(v) !== Math.sign(prev)) {
        let lo = px, hi = x;
        for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (Math.sign(g(mid)) === Math.sign(g(lo))) lo = mid; else hi = mid; }
        cs.push({ value: (lo + hi) / 2, text: fmt((lo + hi) / 2, 4) });
      }
      prev = v; px = x;
    }
  }
  const steps = [
    { line: 1, show: "curve", vars: { "f(x)": print(e), a: fmt(a), b: fmt(b) }, note: `f(x) = ${print(e)} is continuous on [${fmt(a)}, ${fmt(b)}] and differentiable inside, so the mean value theorem applies.` },
    { line: Math.abs(fa - fb) < 1e-12 ? [2, 5] : 2, show: "secant", vars: { "f(a)": fmt(fa, 4), "f(b)": fmt(fb, 4), m: fmt(m, 4) }, note: `Secant slope m = (f(${fmt(b)}) − f(${fmt(a)})) / (${fmt(b)} − ${fmt(a)}) = (${fmt(fb, 4)} − ${fmt(fa, 4)}) / ${fmt(b - a)} = ${fmt(m, 4)}.${Math.abs(fa - fb) < 1e-12 ? " f(a) = f(b), so this is Rolle's theorem: some c has f′(c) = 0." : ""}` },
    { line: 3, show: "secant", vars: { "f′(x)": print(de) }, note: `f′(x) = ${print(de)}.` },
    { line: 4, show: "tangent", done: true, vars: { c: cs.map((c) => c.text), "f′(c)": fmt(m, 4) }, note: cs.length ? `Solve f′(c) = ${fmt(m, 4)}: c = ${cs.map((c) => c.text).join(" and ")}, inside (${fmt(a)}, ${fmt(b)}). The tangent at c is parallel to the secant: at some moment the instantaneous rate equals the average rate.` : "No c found numerically; check that f is differentiable on (a, b)." },
  ];
  return { expr: e, deriv: de, a, b, fa, fb, slope: m, cs, steps };
}

export const EXAMPLES = {
  sinx: { name: "sin(x)/x as x → 0 (0/0)", mode: "limit", f: "sin(x)/x", at: "0" },
  cosx: { name: "(1 − cos x)/x² as x → 0 (L'Hôpital twice)", mode: "limit", f: "(1 - cos(x))/x^2", at: "0" },
  rational: { name: "(x² − 1)/(x − 1) as x → 1", mode: "limit", f: "(x^2 - 1)/(x - 1)", at: "1" },
  xlnx: { name: "x·ln x as x → 0 (0·∞)", mode: "limit", f: "x*ln(x)", at: "0" },
  euler: { name: "(1 + 1/x)^x as x → ∞ (1^∞)", mode: "limit", f: "(1 + 1/x)^x", at: "inf" },
  expinf: { name: "x²/eˣ as x → ∞ (∞/∞)", mode: "limit", f: "x^2/exp(x)", at: "inf" },
  cubic: { name: "x³ − 3x + 2: turning points", mode: "extrema", f: "x^3 - 3x + 2" },
  quartic: { name: "x⁴ − 4x³ on [−1, 4]", mode: "extrema", f: "x^4 - 4x^3", lo: "-1", hi: "4" },
  area: { name: "∫₀² x² dx = 8/3", mode: "integral", f: "x^2", a: "0", b: "2", method: "left", n: 32 },
  sine: { name: "∫₀^π sin x dx = 2", mode: "integral", f: "sin(x)", a: "0", b: "pi", method: "trap", n: 16 },
  mvtcubic: { name: "MVT: x³ on [0, 2]", mode: "mvt", f: "x^3", a: "0", b: "2" },
};
