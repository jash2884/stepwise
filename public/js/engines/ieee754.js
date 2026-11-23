// IEEE 754 binary floating point: half, single and double precision.
// Encoding works on the exact decimal value (as a fraction of big integers),
// so rounding is exactly round-to-nearest, ties-to-even, including denormals.

export const FORMATS = {
  half: { name: "Half (16-bit)", e: 5, m: 10 },
  single: { name: "Single (32-bit)", e: 8, m: 23 },
  double: { name: "Double (64-bit)", e: 11, m: 52 },
};
export const spec = (f) => {
  const F = FORMATS[f];
  if (!F) throw new Error(`Unknown format ${f}`);
  const bias = 2 ** (F.e - 1) - 1;
  return { ...F, id: f, bits: 1 + F.e + F.m, bias, emin: 1 - bias, emax: bias, allOnes: 2 ** F.e - 1 };
};

export const ENCODE_CODE = [
  "s ← 1 if x < 0 else 0; x ← |x|",
  "write x in binary",
  "normalise: x = 1.f × 2^E  // move the binary point",
  "if E < 1 − bias then denormal: x = 0.f × 2^(1 − bias)",
  "e ← E + bias  // biased exponent (0 for a denormal)",
  "keep M bits of f; round to nearest, ties to even",
  "if rounding carries out of the top then E ← E + 1",
  "if e is all ones then overflow to ±∞",
  "bits ← s | e | f",
];
export const DECODE_CODE = [
  "s ← top bit; e ← next E bits; f ← last M bits",
  "if e is all ones then (f = 0 ? ±∞ : NaN)",
  "if e = 0 then value = (−1)^s × 0.f × 2^(1 − bias)  // zero or denormal",
  "else value = (−1)^s × 1.f × 2^(e − bias)  // normal",
];

const abs = (x) => (x < 0n ? -x : x);
const bitLen = (x) => (x === 0n ? 0 : x.toString(2).length);
const pow2 = (k) => 1n << BigInt(k);

// "-6.25", "1e-5", ".5", "inf", "nan", "-0" → { sign, num, den } or { special }
export function parseDecimal(text) {
  const t = String(text).trim().toLowerCase().replace(/[_\s]/g, "").replace(/^−/, "-");
  const sign = t.startsWith("-") ? 1 : 0;
  const body = t.replace(/^[+-]/, "");
  if (/^(inf|infinity|∞)$/.test(body)) return { sign, special: "inf" };
  if (body === "nan") return { sign, special: "nan" };
  const m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(body);
  if (!m || (!m[1] && !m[2])) throw new Error(`Can't read "${text}" as a number. Try something like -6.25, 0.1 or 1e-5.`);
  const digits = (m[1] || "") + (m[2] || "");
  let exp10 = (m[3] ? Number(m[3]) : 0) - (m[2] || "").length;
  if (Math.abs(exp10) > 400) throw new Error("Keep the exponent between −400 and 400.");
  let num = BigInt(digits || "0"), den = 1n;
  if (exp10 >= 0) num *= 10n ** BigInt(exp10);
  else den = 10n ** BigInt(-exp10);
  return { sign, num, den };
}

// Exact decimal for mant × 2^exp (mant ≥ 0), trimmed of trailing zeros.
export function exactDecimal(mant, exp) {
  if (mant === 0n) return "0";
  if (exp >= 0) return (mant << BigInt(exp)).toString();
  const k = -exp;
  const scaled = (mant * 5n ** BigInt(k)).toString().padStart(k + 1, "0");
  const int = scaled.slice(0, scaled.length - k), frac = scaled.slice(scaled.length - k).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}
const shortDecimal = (s, sig = 17) => {
  const digits = s.replace(".", "").replace(/^0+/, "");
  if (digits.length <= sig + 3) return s;
  return Number(s).toPrecision(sig).replace(/\.?0+(e|$)/, "$1");
};

// Binary digits of a positive fraction num/den: integer part, then up to `max`
// fraction bits from repeated doubling, noting where it starts repeating.
export function binaryExpansion(num, den, max = 40) {
  const int = num / den;
  let rem = num % den;
  const rows = [], seen = new Map();
  let repeatFrom = null;
  while (rem !== 0n && rows.length < max) {
    if (seen.has(rem)) { repeatFrom = seen.get(rem); break; }
    seen.set(rem, rows.length);
    const doubled = rem * 2n;
    const bit = doubled >= den ? 1 : 0;
    rows.push({ before: { num: rem, den }, bit });
    rem = doubled - (bit ? den : 0n);
  }
  return { int: int.toString(2), bits: rows.map((r) => r.bit).join(""), rows, repeatFrom, terminates: rem === 0n };
}

const fieldsOf = (bits, S) => {
  const b = bits.toString(2).padStart(S.bits, "0");
  return { s: b.slice(0, 1), e: b.slice(1, 1 + S.e), f: b.slice(1 + S.e) };
};
export const toHex = (bits, S) => bits.toString(16).toUpperCase().padStart(S.bits / 4, "0");

export function encode(text, fmt = "single") {
  const S = spec(fmt);
  const x = parseDecimal(text);
  const steps = [];
  const out = (bits, extra) => {
    const d = decode(bits, fmt);
    return { ...extra, fmt, spec: S, bits, hex: toHex(bits, S), fields: fieldsOf(bits, S), decoded: d, steps };
  };
  const signBit = BigInt(x.sign) << BigInt(S.bits - 1);
  steps.push({ line: [1], lit: ["s"], note: `The sign bit is ${x.sign}: the number is ${x.sign ? "negative" : "positive or zero"}. From here on we work with |x|.`, vars: { s: x.sign } });
  if (x.special) {
    const mant = x.special === "nan" ? pow2(S.m - 1) : 0n;
    const bits = signBit | (BigInt(S.allOnes) << BigInt(S.m)) | mant;
    steps.push({ line: [8, 9], lit: ["e", "f"], note: x.special === "inf" ? "Infinity is stored with an all-ones exponent and a zero fraction." : "NaN is stored with an all-ones exponent and a non-zero fraction (here the quiet-NaN bit).", vars: { e: "all ones", f: x.special === "inf" ? "0" : "≠ 0" } });
    return out(bits, { kind: x.special, exact: x.special === "inf", input: text });
  }
  if (x.num === 0n) {
    steps.push({ line: [4, 9], lit: ["e", "f"], note: `Zero has an all-zero exponent and fraction${x.sign ? "; with the sign bit set it is −0" : ""}.`, vars: { e: 0, f: 0 } });
    return out(signBit, { kind: "zero", exact: true, input: text });
  }
  const { num, den } = x;
  const exp = binaryExpansion(num, den, Math.max(S.m + 12, 40));
  // E = floor(log2(num/den))
  let E = bitLen(num) - bitLen(den);
  const ge = (k) => (k >= 0 ? num >= den * pow2(k) : num * pow2(-k) >= den);
  while (!ge(E)) E--;
  while (ge(E + 1)) E++;
  const intText = exp.int.length > 28 ? `${exp.int.slice(0, 20)}…(${exp.int.length} bits)` : exp.int;
  const binText = `${intText}.${exp.bits.slice(0, 24) || "0"}${exp.terminates && exp.bits.length <= 24 ? "" : "…"}`;
  steps.push({ line: [2], lit: [], note: `In binary, |x| = ${binText}${exp.repeatFrom != null ? " (the fraction repeats forever, so it can't be stored exactly)" : ""}. The fraction part comes from doubling: each time, the digit before the point is the next bit.`, vars: { x: binText }, expansion: exp });
  const denormal = E < S.emin;
  const after = (E >= 0 ? exp.int.slice(1) + exp.bits : exp.bits.slice(-E)).replace(/0+$/, "");
  const scaleExp = denormal ? S.emin : E; // value = q × 2^(scaleExp − m)
  steps.push({ line: denormal ? [3, 4] : [3], lit: [], note: denormal
    ? `Normalised it would be 1.… × 2^${E}, but the smallest normal exponent is ${S.emin}. So it is stored as a denormal: 0.f × 2^${S.emin}, with fewer bits of precision.`
    : `Move the point so one 1 is left in front: |x| = 1.${after.slice(0, 16) || "0"}${after.length > 16 || !exp.terminates ? "…" : ""} × 2^${E}. So E = ${E}.`, vars: { E: denormal ? `${E} (< ${S.emin})` : E } });
  // q = x × 2^(m − scaleExp), split into integer part and remainder.
  const sh = S.m - scaleExp;
  let N = num, D = den;
  if (sh >= 0) N *= pow2(sh); else D *= pow2(-sh);
  let q = N / D;
  const rem = N % D;
  const guard = 2n * rem >= D ? 1 : 0;
  const sticky = guard ? (2n * rem !== D ? 1 : 0) : (rem !== 0n ? 1 : 0);
  const tie = 2n * rem === D;
  const up = 2n * rem > D || (tie && (q & 1n) === 1n);
  const kept = q;
  if (up) q += 1n;
  let finalE = denormal ? null : E;
  let carried = false;
  if (!denormal && q === pow2(S.m + 1)) { q = pow2(S.m); finalE = E + 1; carried = true; }
  if (denormal && q === pow2(S.m)) { finalE = S.emin; carried = true; }
  const isDenormalOut = finalE === null;
  steps.push({ line: [5], lit: ["e"], note: isDenormalOut
    ? `A denormal has an exponent field of all zeros.`
    : `Biased exponent e = E + bias = ${E} + ${S.bias} = ${E + S.bias}${E + S.bias > 0 && E + S.bias < S.allOnes ? ` = ${(E + S.bias).toString(2).padStart(S.e, "0")} in binary` : ""}.`, vars: { bias: S.bias, e: isDenormalOut ? 0 : E + S.bias } });
  const keptBits = (denormal ? kept : kept - pow2(S.m)).toString(2).padStart(S.m, "0");
  steps.push({ line: carried ? [6, 7] : [6], lit: ["f"], note: rem === 0n
    ? `The fraction fits in ${S.m} bits exactly, so no rounding is needed.`
    : `Only ${S.m} fraction bits fit. The next bit (guard) is ${guard} and ${sticky ? "some" : "none"} of the bits after it are 1 (sticky ${sticky}), so we ${up ? (tie ? "have an exact tie and round up to make the last bit even" : "round up") : tie ? "have an exact tie and keep the even value" : "round down (just cut off)"}.${carried ? " Rounding up carries all the way out, so the exponent goes up by one." : ""}`,
  vars: { guard, sticky, rounding: rem === 0n ? "exact" : up ? "up" : "down" }, kept: keptBits });
  if (!isDenormalOut && finalE > S.emax) {
    const bits = signBit | (BigInt(S.allOnes) << BigInt(S.m));
    steps.push({ line: [8], lit: ["e", "f"], note: `E = ${finalE} is bigger than the largest exponent ${S.emax}: the number overflows to ${x.sign ? "−" : "+"}∞.`, vars: { E: finalE } });
    return out(bits, { kind: "overflow", exact: false, input: text, E: finalE, guard, sticky, roundedUp: up });
  }
  const eField = isDenormalOut ? 0n : BigInt(finalE + S.bias);
  const fField = isDenormalOut ? q : q - pow2(S.m);
  const bits = signBit | (eField << BigInt(S.m)) | fField;
  const result = out(bits, { kind: isDenormalOut ? (q === 0n ? "underflow" : "denormal") : "normal", exact: rem === 0n, input: text, E: finalE, guard, sticky, roundedUp: up, repeating: exp.repeatFrom != null });
  const f = result.fields;
  steps.push({ line: [9], lit: ["s", "e", "f"], note: `Put the fields together: ${f.s} | ${f.e} | ${f.f} = 0x${result.hex}. ${rem === 0n ? "It is stored exactly." : `The stored value is ${result.decoded.text}, not quite the number you typed.`}`, vars: { hex: `0x${result.hex}` } });
  return result;
}

// Bits (BigInt or string of hex / binary) → the value and how it's worked out.
export function parseBits(text, fmt = "single") {
  const S = spec(fmt);
  const t = String(text).trim().replace(/[\s_|]/g, "").replace(/^0x/i, "");
  if (/^[01]+$/.test(t) && t.length === S.bits) return BigInt(`0b${t}`);
  if (!/^[0-9a-f]+$/i.test(t)) throw new Error(`Type ${S.bits / 4} hex digits or ${S.bits} bits.`);
  if (t.length > S.bits / 4) throw new Error(`${S.name} has ${S.bits / 4} hex digits; "${text}" has ${t.length}.`);
  return BigInt(`0x${t}`);
}

export function decode(bitsIn, fmt = "single") {
  const S = spec(fmt);
  const bits = typeof bitsIn === "bigint" ? bitsIn : parseBits(bitsIn, fmt);
  if (bits < 0n || bits >= pow2(S.bits)) throw new Error("Too many bits for this format.");
  const f = fieldsOf(bits, S);
  const s = Number(f.s), e = parseInt(f.e, 2), frac = BigInt(`0b${f.f}`);
  const sg = s ? "−" : "";
  let kind, mant = 0n, exp2 = 0, text, formula;
  if (e === S.allOnes) {
    kind = frac === 0n ? "inf" : "nan";
    text = kind === "inf" ? `${s ? "−" : "+"}∞` : "NaN";
    formula = kind === "inf" ? "exponent all ones, fraction 0" : "exponent all ones, fraction not 0";
  } else if (e === 0) {
    kind = frac === 0n ? "zero" : "denormal";
    mant = frac; exp2 = S.emin - S.m;
    text = kind === "zero" ? `${sg}0` : `${sg}${shortDecimal(exactDecimal(mant, exp2))}`;
    formula = `${sg}0.${f.f.replace(/0+$/, "") || "0"} × 2^${S.emin}`;
  } else {
    kind = "normal";
    mant = pow2(S.m) | frac; exp2 = e - S.bias - S.m;
    text = `${sg}${shortDecimal(exactDecimal(mant, exp2))}`;
    formula = `${sg}1.${f.f.replace(/0+$/, "") || "0"} × 2^${e - S.bias}`;
  }
  const exact = kind === "normal" || kind === "denormal" ? `${sg}${exactDecimal(mant, exp2)}` : text;
  const value = kind === "nan" ? NaN : kind === "inf" ? (s ? -Infinity : Infinity) : (s ? -1 : 1) * Number(exactDecimal(mant, exp2));
  const steps = [
    { line: [1], lit: ["s", "e", "f"], note: `Split the ${S.bits} bits: sign ${f.s}, exponent ${f.e} (= ${e}), fraction ${f.f}.`, vars: { s, e, f: `0b${f.f.replace(/0+$/, "") || "0"}` } },
  ];
  if (kind === "inf" || kind === "nan") steps.push({ line: [2], lit: ["e", "f"], note: `The exponent is all ones and the fraction is ${frac === 0n ? "zero" : "not zero"}: ${text}.`, vars: { value: text } });
  else if (e === 0) steps.push({ line: [3], lit: ["e", "f"], note: kind === "zero" ? `Exponent and fraction are both zero: this is ${sg}0.` : `Exponent field 0 means a denormal: no hidden 1, and the exponent is fixed at 1 − bias = ${S.emin}. Value = ${formula} = ${text}.`, vars: { value: text } });
  else steps.push({ line: [4], lit: ["e", "f"], note: `Normal number: hidden 1 in front of the fraction, exponent ${e} − ${S.bias} = ${e - S.bias}. Value = ${formula} = ${text}.`, vars: { E: e - S.bias, value: text } });
  return { fmt, spec: S, bits, hex: toHex(bits, S), fields: f, kind, value, text, exact, formula, steps, sign: s, e, E: kind === "normal" ? e - S.bias : kind === "denormal" ? S.emin : null };
}

// Range and precision of a format.
export function ranges(fmt) {
  const S = spec(fmt);
  const maxMant = pow2(S.m + 1) - 1n;
  return {
    spec: S,
    maxNormal: { formula: `(2 − 2^−${S.m}) × 2^${S.emax}`, value: Number(exactDecimal(maxMant, S.emax - S.m)) },
    minNormal: { formula: `2^${S.emin}`, value: 2 ** S.emin },
    minDenormal: { formula: `2^${S.emin - S.m}`, value: 2 ** (S.emin - S.m) },
    epsilon: { formula: `2^−${S.m}`, value: 2 ** -S.m },
    digits: Math.round((S.m + 1) * Math.log10(2) * 100) / 100,
  };
}

export function randomValue(r = Math.random) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const kind = r();
  const sign = r() < 0.4 ? "-" : "";
  if (kind < 0.55) {
    // Exactly representable: a few bits of integer and fraction.
    const int = Math.floor(r() * 40), frac = pick([0, 0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875, 0.0625, 0.3125]);
    const v = int + frac;
    return `${sign}${v === 0 ? 0.5 : v}`;
  }
  if (kind < 0.8) return `${sign}${pick(["0.1", "0.2", "0.3", "1.1", "2.6", "0.7", "3.3", "12.4"])}`;
  return `${sign}${pick(["1024", "0.001953125", "65504", "1e-5", "100.5", "1.5e3"])}`;
}

export const EXAMPLES = {
  m625: { name: "−6.25 (single)", fmt: "single", v: "-6.25" },
  p01: { name: "0.1 (single): it can't be exact", fmt: "single", v: "0.1" },
  one: { name: "1.0 (single)", fmt: "single", v: "1" },
  big: { name: "65504: the largest half", fmt: "half", v: "65504" },
  tiny: { name: "1e-45 (single denormal)", fmt: "single", v: "1e-45" },
  dbl: { name: "0.1 (double)", fmt: "double", v: "0.1" },
};

// Shareable URL state: f = format, and either v (a decimal to encode) or x (bits to decode).
export function toParams({ fmt, v, x }) { return x != null ? { f: fmt, x } : { f: fmt, v }; }
export function fromParams(q) {
  const fmt = FORMATS[q.get("f")] ? q.get("f") : "single";
  if (q.get("x")) return { fmt, x: q.get("x") };
  return { fmt, v: q.get("v") ?? "-6.25" };
}
