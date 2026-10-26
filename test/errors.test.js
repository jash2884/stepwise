import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum, crc, crcCheck, hammingCheck, hammingEncode } from "../public/js/engines/errors.js";

test("CRC: Tanenbaum's example (frame 1101011111, generator 10011)", () => {
  const r = crc("1101011111", "10011");
  assert.equal(r.remainder, "0010");
  assert.equal(r.codeword, "11010111110010");
  assert.equal(crcCheck(r.codeword, "10011").ok, true);
  const flipped = r.codeword.slice(0, 3) + (r.codeword[3] === "1" ? "0" : "1") + r.codeword.slice(4);
  assert.equal(crcCheck(flipped, "10011").ok, false);
});

test("CRC: another classic (data 100100, generator 1101 → remainder 001)", () => {
  assert.equal(crc("100100", "1101").remainder, "001");
  assert.throws(() => crc("1012", "1101"), /0s and 1s/);
  assert.throws(() => crc("1010", "0101"), /start with 1/);
});

test("Hamming(7,4): encode 1011 → 0110011, then find and fix a flipped bit", () => {
  const e = hammingEncode("1011");
  assert.equal(e.codeword, "0110011");
  assert.equal(e.parityBits, 3);
  const bad = "0110111"; // bit 5 flipped
  const c = hammingCheck(bad);
  assert.equal(c.syndrome, 5);
  assert.equal(c.corrected, "0110011");
  assert.equal(hammingCheck("0110011").syndrome, 0);
});

test("Hamming works for longer data and every single-bit flip is corrected", () => {
  const e = hammingEncode("10011010");
  assert.equal(e.n, 12);
  for (let i = 0; i < e.n; i++) {
    const bad = e.codeword.slice(0, i) + (e.codeword[i] === "1" ? "0" : "1") + e.codeword.slice(i + 1);
    const c = hammingCheck(bad);
    assert.equal(c.syndrome, i + 1);
    assert.equal(c.corrected, e.codeword);
  }
});

test("Internet checksum: Kurose's three 16-bit words", () => {
  const r = checksum("0110011001100000 0101010101010101 1000111100001100");
  assert.equal(r.binary, "1011010100111101");
  assert.match(r.steps[2].note, /carry wraps around/);
  assert.equal(checksum("4500 0073").hex, "BA8C");
});
