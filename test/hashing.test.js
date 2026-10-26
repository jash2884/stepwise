import assert from "node:assert/strict";
import { test } from "node:test";
import { extendible, hashTable, largestPrimeBelow } from "../public/js/engines/hashing.js";

const keys = [89, 18, 49, 58, 69];
const where = (strategy) => { const { table } = hashTable(keys, 10, strategy); return keys.map((k) => table.indexOf(k)); };

// Weiss, Data Structures and Algorithm Analysis, figures 5.11, 5.13 and 5.18 (m = 10, R = 7).
test("open addressing matches the textbook figures", () => {
  assert.deepEqual(where("linear"), [9, 8, 0, 1, 2]);
  assert.deepEqual(where("quadratic"), [9, 8, 0, 2, 3]);
  assert.equal(largestPrimeBelow(10), 7);
  assert.deepEqual(where("double"), [9, 8, 6, 3, 0]);
});

test("chaining, collisions and load factor", () => {
  const r = hashTable(keys, 10, "chaining");
  assert.deepEqual(r.table[9], [89, 49, 69]);
  assert.deepEqual(r.table[8], [18, 58]);
  assert.equal(r.collisions, 3);
  assert.equal(r.loadFactor, 0.5);
  assert.equal(hashTable(keys, 10, "linear").collisions, 1 + 3 + 3); // 49 hits 9; 58 hits 8, 9, 0; 69 hits 9, 0, 1
});

test("a full table or a quadratic dead end fails gracefully", () => {
  const full = hashTable([1, 2, 3], 2, "linear");
  assert.equal(full.steps[2].failed, true);
  const quad = hashTable([0, 4, 8, 12, 16, 20], 4, "quadratic");
  assert.ok(quad.steps.some((s) => s.failed && /quadratic probing can miss free slots/.test(s.note)));
});

test("extendible hashing doubles the directory and splits buckets", () => {
  const one = extendible([0, 1], 1);
  assert.equal(one.global, 1);
  const two = extendible([0, 2], 1); // 00 and 10 differ only in bit 1
  assert.equal(two.global, 2);
  assert.ok(two.steps.some((s) => s.doubled));
  const r = extendible([16, 4, 6, 22, 24, 10, 31, 7, 9, 20, 26], 2);
  // Invariants: directory size 2^global, every key sits in the bucket its low bits point to.
  assert.equal(r.dir.length, 2 ** r.global);
  for (const b of r.buckets) {
    assert.ok(b.keys.length <= 2);
    assert.ok(b.local <= r.global);
    for (const k of b.keys) assert.equal(r.dir[k % 2 ** r.global], b.id);
  }
  assert.deepEqual(r.buckets.flatMap((b) => b.keys).sort((a, b) => a - b), [4, 6, 7, 9, 10, 16, 20, 22, 24, 26, 31]);
});

test("extendible hashing refuses impossible inputs instead of looping", () => {
  assert.throws(() => extendible([0, 64, 128], 1), /more than 64 entries/);
  assert.equal(extendible([0, 32], 1).global, 6, "differing only in bit 5 is still allowed");
});
