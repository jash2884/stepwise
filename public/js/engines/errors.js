// Error detection and correction: CRC, Hamming code and the Internet checksum.

const bitsOnly = (s, what) => {
  const b = String(s).replace(/[\s_]/g, "");
  if (!/^[01]+$/.test(b)) throw new Error(`${what} must be a string of 0s and 1s.`);
  return b;
};
const xor = (a, b) => [...a].map((c, i) => (c === b[i] ? "0" : "1")).join("");

export const CRC_CODE = [
  "r ← length(G) − 1; append r zeros to the data",
  "window ← the first length(G) bits",
  "repeat",
  "  if the window's leading bit is 1 then window ← window XOR G",
  "  else window ← window XOR 0…0  // just shift",
  "  drop the leading bit; bring down the next bit",
  "until every bit has been brought down",
  "remainder ← the last r bits; send data followed by remainder",
];
export const HAMMING_ENCODE_CODE = [
  "p ← smallest p with 2^p ≥ m + p + 1",
  "put the data bits at the positions that aren't powers of 2",
  "for each parity position P = 1, 2, 4, 8, …",
  "  ones ← number of 1s at positions whose binary includes P (not P itself)",
  "  bit P ← ones mod 2  // so the group has an even number of 1s",
];
export const HAMMING_CHECK_CODE = [
  "syndrome ← 0",
  "for each parity position P = 1, 2, 4, … ≤ n",
  "  ones ← number of 1s at positions whose binary includes P",
  "  if ones is odd then syndrome ← syndrome + P  // this check fails",
  "if syndrome = 0 then no single-bit error",
  "else flip bit number syndrome",
];
export const CHECKSUM_CODE = [
  "sum ← 0",
  "for each 16-bit word w",
  "  sum ← sum + w",
  "  if there's a carry out of bit 16, wrap it round: add it to the sum",
  "checksum ← NOT sum  // flip every bit (one's complement)",
];

// --- CRC: polynomial long division over GF(2) ---------------------------------
export function crc(dataText, genText) {
  const data = bitsOnly(dataText, "The data"), gen = bitsOnly(genText, "The generator");
  if (gen.length < 2 || gen[0] !== "1") throw new Error("The generator must start with 1 and have at least 2 bits.");
  if (data.length > 40 || gen.length > 17) throw new Error("Keep data to 40 bits and the generator to 17 bits.");
  const r = gen.length - 1;
  const padded = data + "0".repeat(r);
  const { remainder, steps } = divide(padded, gen);
  steps[0] = { ...steps[0], line: [1, 2, ...steps[0].line], note: `Append r = ${r} zeros (one fewer than the generator's ${gen.length} bits) to make room for the remainder: ${padded}. Then divide, starting with the first ${gen.length} bits. ${steps[0].note}` };
  return { data, gen, r, padded, remainder, steps, codeword: data + remainder };
}

export function divide(dividend, gen) {
  const steps = [];
  let current = dividend.slice(0, gen.length);
  for (let i = gen.length; ; i++) {
    const lead = current[0];
    const by = lead === "1" ? gen : "0".repeat(gen.length);
    const result = xor(current, by);
    const last = i >= dividend.length;
    steps.push({ at: i - gen.length, current, by, result: result.slice(1), line: last ? [lead === "1" ? 4 : 5, 7, 8] : [lead === "1" ? 4 : 5, 6],
      vars: { window: current, "leading bit": lead, "XOR with": by, result: result.slice(1), "bits left": dividend.length - i },
      note: (lead === "1" ? `Leading bit is 1, so the generator "goes into" ${current}: XOR it with ${gen} → ${result}. XOR is subtraction without borrows, which is how division works over GF(2).` : `Leading bit is 0, so the generator doesn't go in: XOR with zeros (just shift) → ${result}.`) + (last ? ` No bits are left to bring down, so the remainder is ${result.slice(1)}.` : ` Drop the leading 0 and bring down the next bit, ${dividend[i]}.`) });
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
    steps.push({ parity: pp, covered, line: [3, 4, 5], vars: { P: pp, covers: covered, ones, ["P" + pp]: word[pp] }, note: `P${pp} covers positions ${covered.join(", ")}: ${ones} one${ones === 1 ? "" : "s"}, so P${pp} = ${word[pp]} to make the count even.` });
  }
  if (steps[0]) steps[0] = { ...steps[0], line: [1, 2, ...steps[0].line], note: `${data.length} data bits need p = ${p} parity bits (2^${p} = ${2 ** p} ≥ ${data.length} + ${p} + 1), so the codeword has ${n} bits. ${steps[0].note}` };
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
    steps.push({ parity: pp, covered, fails, line: fails ? [2, 3, 4] : [2, 3], vars: { P: pp, covers: covered, ones, syndrome }, note: `Check P${pp} (positions ${covered.join(", ")}): ${ones} one${ones === 1 ? "" : "s"}, ${fails ? `odd, so it FAILS (add ${pp})` : "even, so it passes"}.` });
  }
  let corrected = w;
  if (syndrome && syndrome <= n) corrected = w.slice(0, syndrome - 1) + (w[syndrome - 1] === "1" ? "0" : "1") + w.slice(syndrome);
  const note = syndrome === 0 ? "Every check passes: no single-bit error." : syndrome <= n ? `The failing checks add up to ${syndrome}, so bit ${syndrome} is wrong. Flip it: ${corrected}.` : `Syndrome ${syndrome} is past the end of the word: more than one bit is wrong.`;
  steps[0] = { ...steps[0], line: [1, ...steps[0].line] };
  steps.push({ parity: null, covered: [], verdict: true, line: syndrome ? 6 : 5, vars: { syndrome, corrected }, note: `${note}${syndrome && syndrome <= n ? " Each position has a unique set of checks covering it, which is why the sum of the failing checks names exactly one bit." : ""}` });
  return { syndrome, steps, corrected, note };
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
    steps.push({ word: w, line: raw > 0xffff ? [2, 3, 4] : [2, 3], vars: { w: b16(w), "sum + w": raw.toString(2).padStart(17, "0"), carry: raw >> 16, sum: b16(wrapped) }, note: `${b16(sum)} + ${b16(w)} = ${raw.toString(2).padStart(17, "0")}${raw > 0xffff ? `; the carry wraps around → ${b16(wrapped)}. In one's complement arithmetic a carry out of the top bit is added back in at the bottom` : ": no carry out of the top bit, so nothing wraps"}.` });
    sum = wrapped;
  }
  const result = ~sum & 0xffff;
  steps.push({ line: 5, vars: { sum: b16(sum), checksum: b16(result) }, note: `Flip every bit of the sum ${b16(sum)} (one's complement): checksum = ${b16(result)}. The receiver adds all the words and the checksum; if nothing was corrupted it gets 1111111111111111.` });
  steps[0] = { ...steps[0], line: [1, ...steps[0].line] };
  return { words, sum, checksum: result, steps, binary: b16(result), hex: result.toString(16).padStart(4, "0").toUpperCase() };
}

export function randomBits(r = Math.random, n) {
  return Array.from({ length: n }, (_, i) => (i === 0 ? "1" : r() < 0.5 ? "0" : "1")).join("");
}
export const GENERATORS = ["1011", "1101", "10011", "11001", "100101"];
