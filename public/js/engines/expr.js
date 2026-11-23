// A small expression language in x for the calculus tools: parse, evaluate,
// differentiate symbolically, print, and turn polynomials into exact
// coefficient lists. Supports + − * / ^, implicit multiplication (2x, 3sin x),
// sin cos tan exp ln log sqrt abs, and the constants pi and e.
import { Fraction } from "./fraction.js";

const FNS = ["sin", "cos", "tan", "exp", "ln", "log", "sqrt", "abs"];
const num = (v) => ({ t: "num", v });
const X = { t: "x" };

function tokenize(src) {
  const s = String(src).replace(/[−–]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/²/g, "^2").replace(/³/g, "^3").replace(/\*\*/g, "^");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      out.push({ k: "num", v: Number(m[0]), text: m[0] }); i += m[0].length; continue;
    }
    if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(s.slice(i))[0].toLowerCase();
      // Split runs like "xsinx" or "2pix" into known words.
      let j = 0;
      while (j < m.length) {
        const w = [...FNS, "pi", "x", "e"].find((f) => m.startsWith(f, j));
        if (!w) throw new Error(`Unknown name "${m.slice(j)}". Use x, pi, e and sin cos tan exp ln log sqrt abs.`);
        out.push(FNS.includes(w) ? { k: "fn", v: w } : w === "x" ? { k: "x" } : { k: "const", v: w });
        j += w.length;
      }
      i += m.length; continue;
    }
    if ("+-*/^()".includes(c)) { out.push({ k: c }); i++; continue; }
    throw new Error(`Unexpected "${c}".`);
  }
  return out;
}

export function parse(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new Error("Type an expression in x.");
  let p = 0;
  const peek = () => toks[p], eat = (k) => { if (toks[p]?.k !== k) throw new Error(k === ")" ? "A bracket isn't closed." : `Expected ${k}.`); return toks[p++]; };
  const startsAtom = (t) => t && (t.k === "num" || t.k === "x" || t.k === "const" || t.k === "fn" || t.k === "(");
  function sum() {
    let a = product();
    while (peek()?.k === "+" || peek()?.k === "-") { const op = toks[p++].k; a = { t: op, a, b: product() }; }
    return a;
  }
  function product() {
    let a = unary();
    for (;;) {
      if (peek()?.k === "*" || peek()?.k === "/") { const op = toks[p++].k; a = { t: op, a, b: unary() }; }
      else if (startsAtom(peek())) a = { t: "*", a, b: power() }; // implicit: 2x, x(x+1)
      else return a;
    }
  }
  function unary() {
    if (peek()?.k === "-") { p++; return { t: "neg", a: unary() }; }
    if (peek()?.k === "+") { p++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek()?.k === "^") { p++; return { t: "^", a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const t = toks[p++];
    if (!t) throw new Error("The expression ends too soon.");
    if (t.k === "num") return num(t.v);
    if (t.k === "x") return X;
    if (t.k === "const") return { t: "const", v: t.v };
    if (t.k === "(") { const e = sum(); eat(")"); return e; }
    if (t.k === "fn") {
      // sin x, sin(x), sin^2 x are all accepted; sin 2x means sin(2x).
      let pow = null;
      if (peek()?.k === "^") { p++; pow = atom(); }
      let arg;
      if (peek()?.k === "(") arg = atom();
      else {
        // sin 2x = sin(2x), but sin x cos x = sin(x)·cos(x).
        arg = power();
        while (peek()?.k === "x" || peek()?.k === "const") arg = { t: "*", a: arg, b: power() };
      }
      const f = { t: "fn", f: t.v === "log" ? "ln" : t.v, a: arg };
      return pow ? { t: "^", a: f, b: pow } : f;
    }
    throw new Error(`Unexpected "${t.k}".`);
  }
  const e = sum();
  if (p < toks.length) throw new Error(toks[p].k === ")" ? "There's an extra closing bracket." : "Couldn't read the whole expression.");
  return e;
}

export function evaluate(e, x) {
  switch (e.t) {
    case "num": return e.v;
    case "x": return x;
    case "const": return e.v === "pi" ? Math.PI : Math.E;
    case "neg": return -evaluate(e.a, x);
    case "+": return evaluate(e.a, x) + evaluate(e.b, x);
    case "-": return evaluate(e.a, x) - evaluate(e.b, x);
    case "*": return evaluate(e.a, x) * evaluate(e.b, x);
    case "/": return evaluate(e.a, x) / evaluate(e.b, x);
    case "^": {
      const a = evaluate(e.a, x), b = evaluate(e.b, x);
      if (a === 0 && b === 0) return NaN; // 0⁰ is indeterminate
      // Odd roots of negatives, e.g. x^(1/3), stay real.
      if (a < 0 && !Number.isInteger(b)) { const q = 1 / b; if (Number.isInteger(Math.round(q)) && Math.abs(q - Math.round(q)) < 1e-9 && Math.round(q) % 2) return -((-a) ** b); }
      return a ** b;
    }
    case "fn": {
      const a = evaluate(e.a, x);
      return { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs }[e.f](a);
    }
  }
  throw new Error("Bad expression.");
}
export const compile = (e) => (x) => evaluate(e, x);

// --- Simplification and derivatives ---------------------------------------------------

const isNum = (e, v) => e.t === "num" && (v === undefined || e.v === v);
const freeOfX = (e) => e.t === "num" || e.t === "const" || (e.t !== "x" && ["a", "b"].every((k) => !e[k] || freeOfX(e[k])));

export function simplify(e) {
  if (e.t === "num" || e.t === "x" || e.t === "const") return e;
  const a = e.a ? simplify(e.a) : null, b = e.b ? simplify(e.b) : null;
  const both = a && b && isNum(a) && isNum(b);
  switch (e.t) {
    case "neg":
      if (isNum(a)) return num(-a.v);
      if (a.t === "neg") return a.a;
      return { t: "neg", a };
    case "+":
      if (both) return num(a.v + b.v);
      if (isNum(a, 0)) return b;
      if (isNum(b, 0)) return a;
      if (b.t === "neg") return simplify({ t: "-", a, b: b.a });
      if (isNum(b) && b.v < 0) return { t: "-", a, b: num(-b.v) };
      return { t: "+", a, b };
    case "-":
      if (both) return num(a.v - b.v);
      if (isNum(b, 0)) return a;
      if (isNum(a, 0)) return simplify({ t: "neg", a: b });
      if (b.t === "neg") return simplify({ t: "+", a, b: b.a });
      return { t: "-", a, b };
    case "*":
      if (both) return num(a.v * b.v);
      if (isNum(a, 0) || isNum(b, 0)) return num(0);
      if (isNum(a, 1)) return b;
      if (isNum(b, 1)) return a;
      if (isNum(a, -1)) return simplify({ t: "neg", a: b });
      if (isNum(b, -1)) return simplify({ t: "neg", a });
      if (isNum(b) && !isNum(a)) return simplify({ t: "*", a: b, b: a });
      if (a.t === "neg") return simplify({ t: "neg", a: { t: "*", a: a.a, b } });
      if (b.t === "neg") return simplify({ t: "neg", a: { t: "*", a, b: b.a } });
      if (isNum(a) && b.t === "*" && isNum(b.a)) return { t: "*", a: num(a.v * b.a.v), b: b.b };
      if (a.t === "x" && b.t === "x") return { t: "^", a: X, b: num(2) };
      // (1/u)·v → v/u and (c/u)·v → c·v/u
      if (a.t === "/" && isNum(a.a)) return simplify({ t: "/", a: isNum(a.a, 1) ? b : { t: "*", a: a.a, b }, b: a.b });
      if (b.t === "/" && isNum(b.a, 1)) return simplify({ t: "/", a, b: b.b });
      return { t: "*", a, b };
    case "/":
      if (both && b.v !== 0) { const q = a.v / b.v; if (Number.isInteger(q)) return num(q); }
      if (isNum(a, 0) && !isNum(b, 0)) return num(0);
      if (isNum(b, 1)) return a;
      if (a.t === "neg") return simplify({ t: "neg", a: { t: "/", a: a.a, b } });
      return { t: "/", a, b };
    case "^":
      if (both) return num(a.v ** b.v);
      if (isNum(b, 0)) return num(1);
      if (isNum(b, 1)) return a;
      return { t: "^", a, b };
    case "fn":
      if (e.f === "ln" && a.t === "const" && a.v === "e") return num(1);
      if (e.f === "ln" && isNum(a, 1)) return num(0);
      return { t: "fn", f: e.f, a };
  }
  return e;
}

export function derivative(e) {
  return simplify(d(e));
}
function d(e) {
  switch (e.t) {
    case "num": case "const": return num(0);
    case "x": return num(1);
    case "neg": return { t: "neg", a: d(e.a) };
    case "+": case "-": return { t: e.t, a: d(e.a), b: d(e.b) };
    case "*":
      if (freeOfX(e.a)) return { t: "*", a: e.a, b: d(e.b) };
      if (freeOfX(e.b)) return { t: "*", a: d(e.a), b: e.b };
      return { t: "+", a: { t: "*", a: d(e.a), b: e.b }, b: { t: "*", a: e.a, b: d(e.b) } };
    case "/":
      if (freeOfX(e.b)) return { t: "/", a: d(e.a), b: e.b };
      return { t: "/", a: { t: "-", a: { t: "*", a: d(e.a), b: e.b }, b: { t: "*", a: e.a, b: d(e.b) } }, b: { t: "^", a: e.b, b: num(2) } };
    case "^":
      if (freeOfX(e.b)) {
        // Power rule with the chain rule: n·u^(n−1)·u′.
        const n = e.b;
        const lower = isNum(n) ? num(n.v - 1) : { t: "-", a: n, b: num(1) };
        return { t: "*", a: { t: "*", a: n, b: { t: "^", a: e.a, b: lower } }, b: d(e.a) };
      }
      if (e.a.t === "const" && e.a.v === "e") return { t: "*", a: e, b: d(e.b) };
      if (freeOfX(e.a)) return { t: "*", a: { t: "*", a: e, b: { t: "fn", f: "ln", a: e.a } }, b: d(e.b) };
      // u^v = e^(v ln u)
      return { t: "*", a: e, b: d({ t: "*", a: e.b, b: { t: "fn", f: "ln", a: e.a } }) };
    case "fn": {
      const u = e.a, du = d(u);
      const outer = {
        sin: { t: "fn", f: "cos", a: u },
        cos: { t: "neg", a: { t: "fn", f: "sin", a: u } },
        tan: { t: "/", a: num(1), b: { t: "^", a: { t: "fn", f: "cos", a: u }, b: num(2) } },
        exp: { t: "fn", f: "exp", a: u },
        ln: { t: "/", a: num(1), b: u },
        sqrt: { t: "/", a: num(1), b: { t: "*", a: num(2), b: { t: "fn", f: "sqrt", a: u } } },
        abs: { t: "/", a: u, b: { t: "fn", f: "abs", a: u } },
      }[e.f];
      return { t: "*", a: outer, b: du };
    }
  }
  throw new Error("Bad expression.");
}

// --- Printing -------------------------------------------------------------------------

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const PREC = { "+": 1, "-": 1, neg: 2, "*": 3, "/": 3, "^": 5 };
const numText = (v) => {
  if (Number.isInteger(v)) return String(v);
  const f = Fraction.from(Number(v.toPrecision(12)));
  return f.d <= 1000n ? f.toText() : String(Number(v.toPrecision(6)));
};
export function print(e, parent = 0) {
  let s, prec;
  switch (e.t) {
    case "num": s = numText(e.v); prec = e.v < 0 || !Number.isInteger(e.v) ? 2 : 9; break;
    case "x": return "x";
    case "const": return e.v === "pi" ? "π" : "e";
    case "neg": s = `−${print(e.a, 3)}`; prec = 2; break;
    case "+": s = `${print(e.a, 1)} + ${print(e.b, 1.5)}`; prec = 1; break;
    case "-": s = `${print(e.a, 1)} − ${print(e.b, 1.5)}`; prec = 1; break;
    case "*": {
      const l = print(e.a, 3), r = print(e.b, 3.5);
      // 3x, 3sin(x), x·e^x
      s = isNum(e.a) && e.a.v > 0 && /^[a-zπ(√]/i.test(r) && !/^\d/.test(r) ? `${l}${r}` : `${l}·${r}`;
      prec = 3; break;
    }
    case "/": s = `${print(e.a, 3)}/${print(e.b, 3.5)}`; prec = 3; break;
    case "^": {
      const base = print(e.a, 6);
      s = isNum(e.b) && Number.isInteger(e.b.v) && e.b.v >= 0 ? base + String(e.b.v).split("").map((c) => SUP[c]).join("") : `${base}^${print(e.b, 6)}`;
      prec = 5; break;
    }
    case "fn": s = e.f === "sqrt" ? `√(${print(e.a)})` : e.f === "abs" ? `|${print(e.a)}|` : `${e.f}(${print(e.a)})`; prec = 9; break;
  }
  return prec < parent ? `(${s})` : s;
}
void PREC;

// --- Polynomials ----------------------------------------------------------------------

// Exact coefficients [c0, c1, c2, …] (lowest power first), or null if e isn't a polynomial.
export function toPoly(e) {
  const F = (v) => Fraction.from(Number.isInteger(v) ? v : Number(v.toPrecision(12)));
  const add = (p, q) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] ?? Fraction.ZERO).add(q[i] ?? Fraction.ZERO));
  const mul = (p, q) => { const r = Array(p.length + q.length - 1).fill(Fraction.ZERO); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] = r[i + j].add(a.mul(b)); })); return r; };
  const go = (e) => {
    switch (e.t) {
      case "num": return [F(e.v)];
      case "x": return [Fraction.ZERO, Fraction.ONE];
      case "const": return null;
      case "neg": { const p = go(e.a); return p && p.map((c) => c.neg()); }
      case "+": case "-": { const p = go(e.a), q = go(e.b); return p && q && add(p, e.t === "+" ? q : q.map((c) => c.neg())); }
      case "*": { const p = go(e.a), q = go(e.b); return p && q && mul(p, q); }
      case "/": { const p = go(e.a), q = go(e.b); if (!p || !q || trim(q).length !== 1 || q[0].isZero()) return null; return p.map((c) => c.div(q[0])); }
      case "^": {
        const p = go(e.a), q = go(e.b);
        if (!p || !q || trim(q).length !== 1 || !q[0].isInteger() || q[0].sign() < 0 || q[0].n > 12n) return null;
        let r = [Fraction.ONE];
        for (let i = 0; i < Number(q[0].n); i++) r = mul(r, p);
        return r;
      }
      default: return null;
    }
  };
  const p = go(e);
  return p ? trim(p) : null;
}
function trim(p) { const q = [...p]; while (q.length > 1 && q.at(-1).isZero()) q.pop(); return q; }

export const polyEval = (p, x) => p.reduceRight((s, c) => s * x + c.toNumber(), 0);
export const polyEvalExact = (p, x) => p.reduceRight((s, c) => s.mul(x).add(c), Fraction.ZERO);
export const polyDeriv = (p) => (p.length <= 1 ? [Fraction.ZERO] : p.slice(1).map((c, i) => c.mul(new Fraction(BigInt(i + 1)))));
export const polyIntegral = (p) => [Fraction.ZERO, ...p.map((c, i) => c.div(new Fraction(BigInt(i + 1))))];

export function polyText(p, v = "x") {
  const parts = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (c.isZero()) continue;
    const mag = c.abs(), sign = c.sign() < 0 ? "−" : "+";
    const coef = i === 0 ? mag.toString() : mag.equals(Fraction.ONE) ? "" : mag.isInteger() ? mag.toString() : `(${mag})`;
    const body = i === 0 ? coef : `${coef}${v}${i > 1 ? String(i).split("").map((d) => SUP[d]).join("") : ""}`;
    parts.push(parts.length ? ` ${sign} ${body}` : `${sign === "−" ? "−" : ""}${body}`);
  }
  return parts.join("") || "0";
}

// Real roots of a polynomial: rational ones exactly (rational root test, with
// multiplicity), the rest numerically by bisecting between critical points.
export function polyRealRoots(p) {
  let c = trim(p);
  const exact = [];
  const g = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  const divs = (n) => { n = n < 0n ? -n : n; const o = []; for (let d = 1n; d * d <= n && d < 100000n; d++) if (n % d === 0n) { o.push(d); if (d * d !== n) o.push(n / d); } return o; };
  for (let guard = 0; guard < 12 && c.length > 1; guard++) {
    if (c[0].isZero()) { exact.push(Fraction.ZERO); c = c.slice(1); continue; }
    let l = 1n;
    for (const x of c) l = (l * x.d) / g(l, x.d);
    const ints = c.map((x) => x.mul(new Fraction(l)).n);
    let found = null;
    outer: for (const a of divs(ints[0])) for (const b of divs(ints.at(-1))) for (const s of [1n, -1n]) {
      const cand = new Fraction(s * a, b);
      if (polyEvalExact(c, cand).isZero()) { found = cand; break outer; }
    }
    if (!found) break;
    exact.push(found);
    // Divide by (x − found): coefficients are lowest first.
    const hi = [...c].reverse(), q = [hi[0]];
    for (let i = 1; i < hi.length - 1; i++) q.push(hi[i].add(q[i - 1].mul(found)));
    c = q.reverse();
  }
  const numeric = c.length > 1 ? numericRoots(c.map((x) => x.toNumber())) : [];
  const roots = [...exact.map((f) => ({ exact: f, value: f.toNumber() })), ...numeric.map((v) => ({ exact: null, value: v }))];
  roots.sort((a, b) => a.value - b.value);
  // Merge repeats (multiplicity).
  const out = [];
  for (const r of roots) {
    const last = out.at(-1);
    if (last && (last.exact && r.exact ? last.exact.equals(r.exact) : Math.abs(last.value - r.value) < 1e-9)) last.mult++;
    else out.push({ ...r, mult: 1 });
  }
  return out;
}
function numericRoots(a) {
  // a: lowest power first, numbers.
  while (a.length > 1 && Math.abs(a.at(-1)) < 1e-15) a = a.slice(0, -1);
  const n = a.length - 1;
  if (n < 1) return [];
  if (n === 1) return [-a[0] / a[1]];
  const f = (x) => a.reduceRight((s, c) => s * x + c, 0);
  const da = a.slice(1).map((c, i) => c * (i + 1));
  const crit = numericRoots(da);
  const B = 1 + Math.max(...a.slice(0, -1).map((c) => Math.abs(c / a.at(-1))));
  const pts = [-B, ...crit.filter((x) => x > -B && x < B), B];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let lo = pts[i], hi = pts[i + 1];
    const flo = f(lo), fhi = f(hi);
    if (Math.abs(flo) < 1e-10 * Math.max(1, Math.abs(a.at(-1)))) { if (!out.some((r) => Math.abs(r - lo) < 1e-7)) out.push(lo); continue; }
    if (Math.sign(flo) === Math.sign(fhi)) continue;
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(flo)) lo = mid; else hi = mid; }
    out.push((lo + hi) / 2);
  }
  const last = pts.at(-1);
  if (Math.abs(f(last)) < 1e-10 && !out.some((r) => Math.abs(r - last) < 1e-7)) out.push(last);
  return out;
}
