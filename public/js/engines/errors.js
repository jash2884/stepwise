// Error detection and correction: CRC, Hamming code and the Internet checksum.

const bitsOnly = (s, what) => {
  const b = String(s).replace(/[\s_]/g, "");
  if (!/^[01]+$/.test(b)) throw new Error(`${what} must be a string of 0s and 1s.`);
  return b;
};
const xor = (a, b) => [...a].map((c, i) => (c === b[i] ? "0" : "1")).join("");

// --- CRC: polynomial long division over GF(2) ---------------------------------
export function crc(dataText, genText) {
  const data = bitsOnly(dataText, "The data"), gen = bitsOnly(genText, "The generator");
  if (gen.length < 2 || gen[0] !== "1") throw new Error("The generator must start with 1 and have at least 2 bits.");
  if (data.length > 40 || gen.length > 17) throw new Error("Keep data to 40 bits and the generator to 17 bits.");
  const r = gen.length - 1;
  const padded = data + "0".repeat(r);
  const { remainder, steps } = divide(padded, gen);
  return { data, gen, r, padded, remainder, steps, codeword: data + remainder };
}

export function divide(dividend, gen) {
  const steps = [];
  let current = dividend.slice(0, gen.length);
  for (let i = gen.length; ; i++) {
    const lead = current[0];
    const by = lead === "1" ? gen : "0".repeat(gen.length);
    const result = xor(current, by);
    steps.push({ at: i - gen.length, current, by, result: result.slice(1), note: lead === "1" ? `Leading bit is 1: XOR ${current} with ${gen} → ${result}.` : `Leading bit is 0: XOR with zeros (just shift) → ${result}.` });
    if (i >= dividend.length) return { remainder: result.slice(1), steps };
    current = result.slice(1) + dividend[i];
  }
}

export function crcCheck(receivedText, genText) {
  const received = bitsOnly(receivedText, "The received frame"), gen = bitsOnly(genText, "The generator");
  const { remainder, steps } = divide(received, gen);
  return { ok: /^0*$/.test(remainder), remainder, steps };
}

// --- Hamming code (even parity, parity bits at positions 1, 2, 4, 8, …) ---------
export function hammingEncode(dataText) {
  const data = bitsOnly(dataText, "The data");
  if (data.length > 26) throw new Error("Keep the data to 26 bits.");
  let p = 0;
  while (2 ** p < data.length + p + 1) p++;
  const n = data.length + p;
  const word = Array(n + 1).fill(null);
  let k = 0;
  for (let pos = 1; pos <= n; pos++) if ((pos & (pos - 1)) !== 0) word[pos] = data[k++];
  const steps = [];
  for (let i = 0; i < p; i++) {
    const pp = 2 ** i;
    const covered = [];
    for (let pos = 1; pos <= n; pos++) if (pos & pp && pos !== pp) covered.push(pos);
    const ones = covered.filter((pos) => word[pos] === "1").length;
    word[pp] = ones % 2 ? "1" : "0";
    steps.push({ parity: pp, covered, note: `P${pp} covers positions ${covered.join(", ")}: ${ones} one${ones === 1 ? "" : "s"}, so P${pp} = ${word[pp]} to make the count even.` });
  }
  return { data, parityBits: p, n, codeword: word.slice(1).join(""), steps };
}

export function hammingCheck(receivedText) {
  const w = bitsOnly(receivedText, "The received word");
  const n = w.length;
  if (n < 3) throw new Error("A Hamming codeword needs at least 3 bits.");
  const bit = (pos) => w[pos - 1];
  let syndrome = 0;
  const steps = [];
  for (let pp = 1; pp <= n; pp *= 2) {
    const covered = [];
    for (let pos = 1; pos <= n; pos++) if (pos & pp) covered.push(pos);
    const ones = covered.filter((pos) => bit(pos) === "1").length;
    const fails = ones % 2 === 1;
    if (fails) syndrome += pp;
    steps.push({ parity: pp, covered, fails, note: `Check P${pp} (positions ${covered.join(", ")}): ${ones} one${ones === 1 ? "" : "s"}, ${fails ? `odd, so it FAILS (add ${pp})` : "even, so it passes"}.` });
  }
  let corrected = w;
  if (syndrome && syndrome <= n) corrected = w.slice(0, syndrome - 1) + (w[syndrome - 1] === "1" ? "0" : "1") + w.slice(syndrome);
  return {
    syndrome, steps, corrected,
    note: syndrome === 0 ? "Every check passes: no single-bit error." : syndrome <= n ? `The failing checks add up to ${syndrome}, so bit ${syndrome} is wrong. Flip it: ${corrected}.` : `Syndrome ${syndrome} is past the end of the word: more than one bit is wrong.`,
  };
}

// --- Internet checksum (16-bit one's complement) ------------------------------------
export function checksum(wordsText) {
  const words = String(wordsText).trim().split(/[\s,]+/).filter(Boolean).map((w) => {
    const v = /^[01]{16}$/.test(w) ? parseInt(w, 2) : /^(0x)?[0-9a-f]{1,4}$/i.test(w) ? parseInt(w.replace(/^0x/i, ""), 16) : NaN;
    if (Number.isNaN(v)) throw new Error(`"${w}" isn't a 16-bit word. Use 16 binary digits or up to 4 hex digits.`);
    return v;
  });
  if (!words.length) throw new Error("Enter at least one 16-bit word.");
  if (words.length > 12) throw new Error("Use at most 12 words.");
  const b16 = (v) => v.toString(2).padStart(16, "0");
  let sum = 0;
  const steps = [];
  for (const w of words) {
    const raw = sum + w;
    const wrapped = (raw & 0xffff) + (raw >> 16);
    steps.push({ word: w, note: `${b16(sum)} + ${b16(w)} = ${raw.toString(2).padStart(17, "0")}${raw > 0xffff ? `; the carry wraps around → ${b16(wrapped)}` : ""}.` });
    sum = wrapped;
  }
  const result = ~sum & 0xffff;
  steps.push({ note: `Flip every bit of the sum ${b16(sum)} (one's complement): checksum = ${b16(result)}.` });
  return { words, sum, checksum: result, steps, binary: b16(result), hex: result.toString(16).padStart(4, "0").toUpperCase() };
}

export function randomBits(r = Math.random, n) {
  return Array.from({ length: n }, (_, i) => (i === 0 ? "1" : r() < 0.5 ? "0" : "1")).join("");
}
export const GENERATORS = ["1011", "1101", "10011", "11001", "100101"];
