// Exact rational numbers for the maths tools. Numerator and denominator are
// BigInts kept in lowest terms with a positive denominator, so row reduction
// never picks up rounding error and A·A⁻¹ really is I.

const babs = (a) => (a < 0n ? -a : a);
function bgcd(a, b) {
  a = babs(a); b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Fraction {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new Error("Division by zero.");
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
    Object.freeze(this);
  }

  // Accepts a Fraction, an integer, a finite decimal number, or text such as
  // "3", "-2/5", "0.75" or "1.5/2".
  static from(x) {
    if (x instanceof Fraction) return x;
    if (typeof x === "bigint") return new Fraction(x);
    if (typeof x === "number") {
      if (!Number.isFinite(x)) throw new Error("Not a finite number.");
      if (Number.isInteger(x)) return new Fraction(BigInt(x));
      return Fraction.parse(String(x));
    }
    return Fraction.parse(String(x));
  }

  static parse(text) {
    const s = String(text).trim().replace(/−/g, "-");
    const m = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:\/(\d+(?:\.\d*)?|\.\d+))?$/.exec(s);
    if (!m) throw new Error(`"${text}" is not a number or fraction.`);
    const dec = (t) => {
      const [i, f = ""] = t.split(".");
      return new Fraction(BigInt((i || "0") + f), 10n ** BigInt(f.length));
    };
    let v = dec(m[2]);
    if (m[3] !== undefined) {
      const den = dec(m[3]);
      if (den.isZero()) throw new Error("Division by zero.");
      v = v.div(den);
    }
    return m[1] === "-" ? v.neg() : v;
  }

  static get ZERO() { return ZERO; }
  static get ONE() { return ONE; }

  add(o) { o = Fraction.from(o); return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Fraction.from(o); return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Fraction.from(o); return new Fraction(this.n * o.n, this.d * o.d); }
  div(o) { o = Fraction.from(o); if (o.n === 0n) throw new Error("Division by zero."); return new Fraction(this.n * o.d, this.d * o.n); }
  neg() { return new Fraction(-this.n, this.d); }
  inv() { return new Fraction(this.d, this.n); }
  abs() { return this.n < 0n ? this.neg() : this; }
  pow(k) { let r = ONE; for (let i = 0; i < Math.abs(k); i++) r = r.mul(this); return k < 0 ? r.inv() : r; }
  isZero() { return this.n === 0n; }
  isInteger() { return this.d === 1n; }
  sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
  equals(o) { o = Fraction.from(o); return this.n === o.n && this.d === o.d; }
  cmp(o) { o = Fraction.from(o); const x = this.n * o.d - o.n * this.d; return x > 0n ? 1 : x < 0n ? -1 : 0; }
  valueOf() { return Number(this.n) / Number(this.d); }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? `${this.n}`.replace("-", "−") : `${this.n}/${this.d}`.replace("-", "−"); }
  // Plain ASCII for URLs and inputs.
  toText() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}

const ZERO = new Fraction(0n), ONE = new Fraction(1n);
export const F = (x, d) => (d === undefined ? Fraction.from(x) : Fraction.from(x).div(Fraction.from(d)));

// Integer square root of a non-negative BigInt, or null when it isn't a perfect square.
export function bigSqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x * x === n ? x : null;
}

// Exact square root of a non-negative fraction, or null when it isn't rational.
export function fracSqrt(f) {
  if (f.sign() < 0) return null;
  const a = bigSqrt(f.n), b = bigSqrt(f.d);
  return a === null || b === null ? null : new Fraction(a, b);
}
