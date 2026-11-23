import assert from "node:assert/strict";
import { test } from "node:test";
import { allocation, human, indexBlocks, inodeCapacity, INODE_CODE, locate } from "../public/js/engines/filesystems.js";

const UNIX = { B: 4096, p: 4, d: 12, s: 1, dd: 1, t: 1 };

// Silberschatz: 4 KB blocks, 4-byte pointers, 12 direct + single + double + triple.
// k = 1024, so (12 + 1024 + 1024² + 1024³) × 4096 bytes, just over 4 TB.
test("textbook inode: 4 KB blocks, 4-byte pointers", () => {
  const c = inodeCapacity(UNIX);
  assert.equal(c.k, 1024);
  assert.equal(c.maxBlocks, 12n + 1024n + 1024n ** 2n + 1024n ** 3n);
  assert.equal(c.maxBytes, 4_402_345_721_856n);
  assert.equal(human(c.maxBytes), "4.00 TB");
  assert.equal(c.diskBytes, 2n ** 32n * 4096n); // 16 TB of addressable disk
});

// GATE CS 2019: 12 direct, one single and one double indirect pointer, 4 kB blocks,
// 32-bit block addresses. Maximum file size ≈ 4.0 GB.
test("GATE 2019: no triple indirect pointer", () => {
  const c = inodeCapacity({ ...UNIX, t: 0 });
  assert.equal(c.maxBytes, (12n + 1024n + 1024n * 1024n) * 4096n);
  assert.equal((Number(c.maxBytes) / 2 ** 30).toFixed(1), "4.0");
});

// GATE CS 2012: 8 direct, 1 indirect, 1 doubly indirect; 128-byte blocks and 8-byte addresses → 35 KB.
test("GATE 2012: 128-byte blocks, 8-byte addresses", () => {
  const c = inodeCapacity({ B: 128, p: 8, d: 8, s: 1, dd: 1, t: 0 });
  assert.equal(c.k, 16);
  assert.equal(c.maxBytes, (8n + 16n + 256n) * 128n);
  assert.equal(human(c.maxBytes), "35 KB");
});

test("classic Unix V7-style: 1 KB blocks, 10 direct", () => {
  const c = inodeCapacity({ B: 1024, p: 4, d: 10, s: 1, dd: 1, t: 1 });
  assert.equal(c.maxBlocks, 10n + 256n + 65536n + 16777216n);
  assert.equal(c.maxBytes, 17_247_250_432n); // about 16 GB
});

test("block accesses for an offset, at each region's edges", () => {
  const cases = [
    [0, "direct", 1, [0]],
    [11 * 4096 + 4095, "direct", 1, [11]],
    [12 * 4096, "single", 2, [0, 0]],
    [(12 + 1023) * 4096, "single", 2, [0, 1023]],
    [(12 + 1024) * 4096, "double", 3, [0, 0, 0]],
    [5_000_000, "double", 3, [0, 0, 184]], // block 1220 → 1220 − 1036 = 184
    [(12 + 1024 + 1500) * 4096, "double", 3, [0, 1, 476]],
    [(12 + 1024 + 1024 ** 2) * 4096, "triple", 4, [0, 0, 0, 0]],
    [(12 + 1024 + 1024 ** 2 + 1024 ** 2 + 3 * 1024 + 5) * 4096, "triple", 4, [0, 1, 3, 5]],
  ];
  for (const [x, region, reads, path] of cases) {
    const r = locate({ ...UNIX, x });
    assert.equal(r.region, region, `x = ${x}`);
    assert.equal(r.reads, reads, `x = ${x}`);
    assert.deepEqual(r.path, path, `x = ${x}`);
  }
  assert.equal(locate({ ...UNIX, x: 5_000_000 }).r, 5_000_000 % 4096);
  assert.equal(locate({ ...UNIX, x: 5_000_000, countInode: true }).reads, 4);
});

test("several indirect pointers of one kind", () => {
  // Two single indirect pointers, k = 256: block 10 + 256 + 3 is in the second one.
  const r = locate({ B: 1024, p: 4, d: 10, s: 2, dd: 0, t: 0, x: (10 + 256 + 3) * 1024 });
  assert.equal(r.region, "single");
  assert.deepEqual(r.path, [1, 3]);
  assert.equal(r.reads, 2);
});

test("steps: lines in range, last step is done, no long dashes", () => {
  for (const x of [0, 60_000, 5_000_000, 5_000_000_000]) {
    const r = locate({ ...UNIX, x });
    for (const s of r.steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= INODE_CODE.length);
      assert.ok(!/[—–]/.test(s.note), s.note);
    }
    assert.ok(r.steps.at(-1).done);
  }
});

test("index blocks needed for a file", () => {
  assert.equal(indexBlocks(UNIX, 12 * 4096), 0n);
  assert.equal(indexBlocks(UNIX, 12 * 4096 + 1), 1n);
  // 100 MB = 25,600 blocks: 1 single + (1 double + 24 level-2 blocks for the other 24,564).
  assert.equal(indexBlocks(UNIX, 100 * 1024 * 1024), 26n);
});

test("contiguous, linked and indexed allocation", () => {
  const a = allocation({ B: 512, p: 4, size: 100_000, x: 5000 });
  const by = Object.fromEntries(a.rows.map((r) => [r.id, r]));
  assert.equal(a.blocks, 196);
  assert.equal(by.contiguous.reads, 1);
  // 508 data bytes per linked block: byte 5000 is in block 9, so 10 reads.
  assert.equal(by.linked.blocks, 197);
  assert.equal(by.linked.reads, 10);
  // 196 blocks, 128 pointers per index block: two levels, 2 + 1 index blocks.
  assert.equal(by.indexed.reads, 3);
  assert.equal(by.indexed.blocks, 196 + 3);
});

test("validation", () => {
  assert.throws(() => inodeCapacity({ ...UNIX, B: 1000 }), /power of two/);
  assert.throws(() => inodeCapacity({ ...UNIX, p: 5 }), /Pointer size/);
  assert.throws(() => locate({ ...UNIX, t: 0, x: 5_000_000_000 }), /maximum file size/);
  assert.throws(() => locate({ ...UNIX, x: -1 }), /0 or more/);
  assert.throws(() => allocation({ B: 512, p: 4, size: 100, x: 100 }), /inside the file/);
});
