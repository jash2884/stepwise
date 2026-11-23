// Number systems: base conversion (integer and fraction parts, any base 2 to 16)
// with every division and multiplication as a step; signed magnitude, 1's and
// 2's complement; sign extension; and binary addition with overflow detection.
// Arithmetic is exact (BigInt numerators and denominators), so fractions such
// as 0.1 in base 10 are handled honestly: they repeat in base 2.

export const DIGITS = "0123456789ABCDEF";
const digitOf = (ch) => DIGITS.indexOf(ch);
const big = BigInt;

export function checkBase(b) {
  if (!Number.isInteger(b) || b < 2 || b > 16) throw new Error("Bases must be whole numbers from 2 to 16.");
}

// "1A.4" in base 16 → { int: "1A", frac: "4" }.
export function parse(text, base) {
  checkBase(base);
  const s = String(text ?? "").trim().toUpperCase().replace(/[\s_]/g, "");
  if (!s) throw new Error("Type a number to convert.");
  if (s.startsWith("-")) throw new Error("Use a number without a sign here; negative numbers are on the Signed numbers tab.");
  if (!/^[0-9A-F]*\.?[0-9A-F]*$/.test(s) || s === ".") throw new Error(`"${text}" isn't a number: use digits 0 to 9, A to F and at most one point.`);
  const [i = "", f = ""] = s.split(".");
  for (const ch of i + f) if (digitOf(ch) >= base) throw new Error(`"${ch}" isn't a digit in base ${base} (digits go from 0 to ${DIGITS[base - 1]}).`);
  if (i.length > 24) throw new Error("Keep the whole-number part to 24 digits.");
  if (f.length > 10) throw new Error("Keep the fraction part to 10 digits.");
  return { int: i.replace(/^0+(?=.)/, "") || "0", frac: f.replace(/0+$/, "") };
}

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };

// Digits of num/den (0 ≤ num < den) in `base`: stops when exact or after `places`.
// Reports where a repeating block starts, if one is found within the digits made.
export function fractionDigits(num, den, base, places) {
  const digits = [], seen = new Map(), rows = [];
  let repeatFrom = null;
  const B = big(base);
  while (num !== 0n && digits.length < places) {
    if (seen.has(num)) { if (repeatFrom === null) repeatFrom = seen.get(num); } else seen.set(num, digits.length);
    const product = num * B;
    const d = Number(product / den);
    rows.push({ before: [num, den], product: [product, den], digit: d, after: [product % den, den] });
    digits.push(d);
    num = product % den;
  }
  if (num !== 0n && repeatFrom === null && seen.has(num)) repeatFrom = seen.get(num);
  return { digits, exact: num === 0n, repeatFrom, rows };
}

// A fraction as a short decimal for display: exact when it terminates within 8 places.
export function decimalText(num, den, places = 8) {
  if (num === 0n) return "0";
  const { digits, exact } = fractionDigits(num, den, 10, places);
  return `0.${digits.join("")}${exact ? "" : "…"}`;
}

export const CONVERT_CODE = [
  "value ← Σ digit × from^position  // whole part: positions 0, 1, 2 … leftwards",
  "fraction ← Σ digit × from^−position  // fraction: positions 1, 2 … rightwards",
  "while n > 0  // whole part to base 'to'",
  "  r ← n mod to; n ← n div to  // r is the next digit, right to left",
  "read the remainders from the last one to the first",
  "repeat until f = 0 or enough digits  // fraction to base 'to'",
  "  f ← f × to; digit ← whole part of f; f ← f − digit  // digits left to right",
  "answer ← whole digits . fraction digits",
];

// Convert, recording each step. Part 1 (to decimal) is skipped when from = 10,
// part 2 (from decimal) when to = 10.
export function convert(text, from, to, { places = 8 } = {}) {
  checkBase(from); checkBase(to);
  if (!Number.isInteger(places) || places < 1 || places > 16) throw new Error("Fraction places must be 1 to 16.");
  const { int, frac } = parse(text, from);
  const F = big(from), T = big(to);
  const steps = [];
  // Part 1: positional expansion.
  let value = 0n;
  const expansion = [];
  [...int].forEach((ch, k) => {
    const pos = int.length - 1 - k, d = digitOf(ch);
    const term = big(d) * F ** big(pos);
    value += term;
    expansion.push({ digit: ch, pos, term });
  });
  const fexp = [...frac].map((ch, k) => ({ digit: ch, pos: -(k + 1) }));
  // Exact fraction value: Σ d × from^−k, as fnum / fden.
  let fnum = 0n, fden = F ** big(frac.length);
  [...frac].forEach((ch, k) => { fnum += big(digitOf(ch)) * F ** big(frac.length - 1 - k); });
  const g = gcd(fnum, fden) || 1n;
  fnum /= g; fden /= g;
  if (from !== 10) {
    steps.push({ phase: "expand", line: 1, upto: expansion.length, vars: { value: value.toString() },
      note: `Part 1, to decimal: multiply each digit by its place value. ${expansion.map((e) => `${e.digit}×${from}^${e.pos}`).join(" + ")} = ${expansion.map((e) => e.term.toString()).join(" + ")} = ${value}.` });
    if (frac) {
      steps.push({ phase: "expand-frac", line: 2, vars: { value: value.toString(), fraction: decimalText(fnum, fden) },
        note: `The fraction digits are worth ${fexp.map((e) => `${e.digit}×${from}^${e.pos}`).join(" + ")} = ${fnum}/${fden}${fden === 1n ? "" : ` = ${decimalText(fnum, fden)}`} in decimal.` });
    }
  } else {
    steps.push({ phase: "expand", line: 1, upto: 0, vars: { value: value.toString(), fraction: frac ? decimalText(fnum, fden) : "0" },
      note: `The number is already in base 10: whole part ${value}${frac ? `, fraction 0.${frac}` : ""}. Go straight to part 2.` });
  }

  // Part 2: whole part by repeated division.
  const divisions = [];
  let n = value;
  if (to !== 10) {
    if (n === 0n) steps.push({ phase: "div", line: 3, divisions: [], vars: { n: "0" }, note: "The whole part is 0, so it is 0 in every base." });
    while (n > 0n) {
      const q = n / T, r = n % T;
      divisions.push({ n, q, r: Number(r) });
      steps.push({ phase: "div", line: 4, divisions: [...divisions], vars: { n: n.toString(), "n div to": q.toString(), r: Number(r), digit: DIGITS[Number(r)] },
        note: `${n} ÷ ${to} = ${q} remainder ${r}${Number(r) > 9 ? ` (digit ${DIGITS[Number(r)]})` : ""}.${q === 0n ? " The quotient is 0, so stop." : ""}` });
      n = q;
    }
  }
  const intDigits = to === 10 ? value.toString() : divisions.length ? divisions.map((d) => DIGITS[d.r]).reverse().join("") : "0";
  if (to !== 10 && divisions.length) steps.push({ phase: "read", line: 5, divisions, vars: { whole: intDigits },
    note: `Read the remainders from the bottom up: ${intDigits}. The last remainder is the most significant digit.` });

  // Part 2: fraction by repeated multiplication.
  let fracDigits = "", exact = true, repeatFrom = null, multiplications = [];
  if (fnum !== 0n) {
    const fd = fractionDigits(fnum, fden, to, places);
    exact = fd.exact; repeatFrom = fd.repeatFrom;
    multiplications = fd.rows.map((row) => ({ ...row, digit: row.digit }));
    fracDigits = fd.digits.map((d) => DIGITS[d]).join("");
    if (to !== 10) {
      fd.rows.forEach((row, k) => {
        const fx = row.before[1] === 1n ? "0" : decimalText(row.before[0], row.before[1]);
        steps.push({ phase: "mul", line: 7, multiplications: multiplications.slice(0, k + 1), vars: { f: fx, "f × to": `${row.digit} + ${decimalText(row.after[0], row.after[1])}`, digit: DIGITS[row.digit] },
          note: `${fx} × ${to} = ${row.digit}${row.after[0] ? ` + ${decimalText(row.after[0], row.after[1])}` : ""}: the next fraction digit is ${DIGITS[row.digit]}.${row.after[0] === 0n ? " Nothing is left, so the fraction ends here." : ""}` });
      });
      if (!exact) steps.push({ phase: "mul", line: 6, multiplications, vars: { digits: fracDigits.length },
        note: repeatFrom !== null ? `A fraction value has come back, so the digits repeat from place ${repeatFrom + 1} for ever. Stop at ${fracDigits.length} digits.` : `The fraction hasn't ended after ${places} digits, so stop there (the answer is truncated).` });
    }
  }
  const result = fracDigits ? `${intDigits}.${fracDigits}` : intDigits;
  steps.push({ phase: "done", line: 8, divisions, multiplications, vars: { answer: result },
    note: `(${int}${frac ? `.${frac}` : ""})${sub(from)} = (${result}${exact ? "" : "…"})${sub(to)}${exact ? "" : `, truncated after ${fracDigits.length} fraction digits`}.` });
  return { input: `${int}${frac ? `.${frac}` : ""}`, from, to, int, frac, value, fraction: [fnum, fden], expansion, fexp, divisions, multiplications, intDigits, fracDigits, result, exact, repeatFrom, steps };
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
export const sub = (n) => String(n).split("").map((d) => SUBS[Number(d)]).join("");

// Plain integer conversion for checks and questions.
export const toBase = (n, base) => big(n).toString(base).toUpperCase();
export const fromBase = (s, base) => [...String(s).toUpperCase()].reduce((v, ch) => v * big(base) + big(digitOf(ch)), 0n);

// --- Signed representations ------------------------------------------------------------------

export const ranges = (bits) => ({
  sm: [-(2 ** (bits - 1) - 1), 2 ** (bits - 1) - 1],
  ones: [-(2 ** (bits - 1) - 1), 2 ** (bits - 1) - 1],
  twos: [-(2 ** (bits - 1)), 2 ** (bits - 1) - 1],
  unsigned: [0, 2 ** bits - 1],
});

export const SCHEMES = { sm: "Signed magnitude", ones: "1's complement", twos: "2's complement" };

const bin = (v, bits) => v.toString(2).padStart(bits, "0");
const flip = (s) => [...s].map((b) => (b === "1" ? "0" : "1")).join("");

export function checkBits(bits) {
  if (!Number.isInteger(bits) || bits < 2 || bits > 16) throw new Error("Use 2 to 16 bits.");
}

// Every representation of a decimal value, with the working. null where out of range.
export function represent(value, bits) {
  checkBits(bits);
  if (!Number.isInteger(value)) throw new Error("Type a whole number (it may be negative).");
  const rg = ranges(bits);
  const mag = Math.abs(value);
  const inRange = (k) => value >= rg[k][0] && value <= rg[k][1];
  const magBits = mag < 2 ** (bits - 1) ? bin(mag, bits - 1) : null;
  const out = { value, bits, ranges: rg, magnitude: mag.toString(2) };
  out.sm = inRange("sm") ? (value < 0 ? "1" : "0") + magBits : null;
  out.ones = inRange("ones") ? (value < 0 ? flip("0" + magBits) : "0" + magBits) : null;
  out.twos = inRange("twos") ? bin(((value % 2 ** bits) + 2 ** bits) % 2 ** bits, bits) : null;
  const work = [];
  work.push({ scheme: "sm", text: `|${value}| = ${mag} = ${mag.toString(2)} in binary. ${out.sm ? `Pad to ${bits - 1} magnitude bits and put the sign bit (${value < 0 ? "1, negative" : "0, positive"}) in front: ${out.sm}.` : `That needs more than ${bits - 1} magnitude bits, so it doesn't fit.`}` });
  work.push({ scheme: "ones", text: out.ones ? (value < 0 ? `Write +${mag} as ${"0" + magBits}, then flip every bit: ${out.ones}.` : `Positive, so it is the same as signed magnitude: ${out.ones}.`) : `Out of range: ${bits}-bit 1's complement holds ${rg.ones[0]} to ${rg.ones[1]}.` });
  work.push({ scheme: "twos", text: out.twos ? (value < 0 ? (mag === 2 ** (bits - 1) ? `${value} is the most negative value: 1 followed by zeros, ${out.twos}. It has no positive partner.` : `Flip the bits of +${mag} (${"0" + magBits} → ${flip("0" + magBits)}), then add 1: ${out.twos}.`) : `Positive, so it is plain binary with a 0 sign bit: ${out.twos}.`) : `Out of range: ${bits}-bit 2's complement holds ${rg.twos[0]} to ${rg.twos[1]}.` });
  out.work = work;
  return out;
}

// The value a bit pattern stands for under each scheme.
export function decode(bitsText, scheme) {
  const s = String(bitsText).replace(/\s/g, "");
  if (!/^[01]+$/.test(s)) throw new Error("Use only 0s and 1s.");
  const n = s.length, u = parseInt(s, 2);
  if (scheme === "unsigned") return u;
  if (s[0] === "0") return u;
  if (scheme === "sm") return -parseInt(s.slice(1) || "0", 2);
  if (scheme === "ones") return -parseInt(flip(s), 2);
  return u - 2 ** n;
}

export function signExtend(bitsText, width) {
  const s = String(bitsText).replace(/\s/g, "");
  if (width < s.length) throw new Error("Sign extension can only make a number wider.");
  return s[0].repeat(width - s.length) + s;
}

export const ADD_CODE = [
  "c ← 0  // for A − B: invert B and start with c ← 1",
  "for i from 0 (rightmost bit) to n − 1",
  "  s[i] ← a[i] XOR b[i] XOR c",
  "  c ← majority(a[i], b[i], c)  // carry out of this column",
  "overflow ← carry into the sign bit ≠ carry out of it",
];

// n-bit 2's complement A + B or A − B, one column per step.
export function addTwos(a, b, bits, op = "+") {
  checkBits(bits);
  const rg = ranges(bits).twos;
  for (const [x, name] of [[a, "A"], [b, "B"]]) {
    if (!Number.isInteger(x)) throw new Error(`${name} must be a whole number.`);
    if (x < rg[0] || x > rg[1]) throw new Error(`${name} = ${x} doesn't fit in ${bits}-bit 2's complement (${rg[0]} to ${rg[1]}).`);
  }
  const A = represent(a, bits).twos, Braw = represent(b, bits).twos;
  const B = op === "-" ? flip(Braw) : Braw;
  let c = op === "-" ? 1 : 0;
  const carries = [c], sum = Array(bits).fill(null), steps = [];
  steps.push({ col: -1, sum: [...sum], carries: [...carries], line: 1, vars: { c },
    note: op === "-" ? `A − B = A + (2's complement of B). Invert B (${Braw} → ${B}) and add 1 by starting with a carry of 1.` : `Write A = ${A} and B = ${B} and add column by column from the right, starting with no carry.` });
  for (let i = 0; i < bits; i++) {
    const ai = Number(A[bits - 1 - i]), bi = Number(B[bits - 1 - i]);
    const s = ai ^ bi ^ c, co = (ai & bi) | (ai & c) | (bi & c);
    sum[bits - 1 - i] = s;
    steps.push({ col: i, sum: [...sum], carries: [...carries, co], line: [3, 4], vars: { i, "a[i]": ai, "b[i]": bi, "c in": c, "s[i]": s, "c out": co },
      note: `Column ${i}${i === bits - 1 ? " (the sign bit)" : ""}: ${ai} + ${bi} + ${c} = ${ai + bi + c}, so write ${s} and carry ${co}.` });
    c = co; carries.push(co);
  }
  const result = sum.join("");
  const cin = carries[bits - 1], cout = carries[bits];
  const overflow = cin !== cout;
  const truth = op === "-" ? a - b : a + b;
  const got = decode(result, "twos");
  steps.push({ col: bits, sum: [...sum], carries, line: 5, vars: { "carry into sign": cin, "carry out": cout, overflow },
    note: overflow
      ? `Carry into the sign bit is ${cin} but carry out is ${cout}: OVERFLOW. The true answer ${truth} doesn't fit in ${bits} bits, and the pattern ${result} reads as ${got}.`
      : `Carry into the sign bit (${cin}) equals the carry out (${cout}), so no overflow${cout ? "; the carry out is simply dropped" : ""}. ${result} = ${got}.` });
  return { a, b, op, bits, A, B, Braw, result, value: got, truth, overflow, carryIn: cin, carryOut: cout, carries, steps };
}

export const SIGNED_CODE = [
  "m ← |v| in binary",
  "signed magnitude ← sign bit (1 if v < 0) then m in n − 1 bits",
  "1's complement ← +|v| in n bits, every bit flipped if v < 0",
  "2's complement ← 1's complement + 1 if v < 0  // or 2^n − |v|",
  "sign extension: copy the sign bit into the new high bits",
];

// The signed-representation working as steps for the stepper.
export function signedSteps(value, bits, ext = null) {
  const r = represent(value, bits);
  const steps = [
    { show: 0, line: 1, vars: { v: value, n: bits, "|v|": Math.abs(value), m: r.magnitude }, note: `|${value}| = ${Math.abs(value)}, which is ${r.magnitude} in binary. ${bits} bits leave ${bits - 1} for the magnitude after the sign bit.` },
    { show: 1, line: 2, vars: { "signed magnitude": r.sm ?? "out of range" }, note: r.work[0].text },
    { show: 2, line: 3, vars: { "1's complement": r.ones ?? "out of range" }, note: r.work[1].text },
    { show: 3, line: 4, vars: { "2's complement": r.twos ?? "out of range" }, note: r.work[2].text },
  ];
  if (ext && r.twos && ext > bits) {
    const e = signExtend(r.twos, ext);
    steps.push({ show: 4, line: 5, vars: { [`${ext}-bit`]: e }, note: `Widen to ${ext} bits by copying the sign bit ${r.twos[0]} into the ${ext - bits} new place${ext - bits === 1 ? "" : "s"}: ${e}. It still means ${value}.` });
    r.extended = e;
  }
  return { ...r, steps };
}

// --- Random inputs for practice ------------------------------------------------------------
export function randomDigits(r, base, len) {
  let s = DIGITS[1 + Math.floor(r() * (base - 1))];
  for (let i = 1; i < len; i++) s += DIGITS[Math.floor(r() * base)];
  return s;
}
