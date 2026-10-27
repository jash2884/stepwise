import assert from "node:assert/strict";
import { test } from "node:test";
import { ALGORITHMS, BUDDY_EXAMPLE, buddy, buddyTree, contiguous, EXAMPLE, parseHoles, parseScript, randomHoles, randomScript } from "../public/js/engines/memory.js";

const holes = parseHoles(EXAMPLE.holes), ops = parseScript(EXAMPLE.script);
const where = (r, name) => { const s = r.segs.find((x) => x.owner === name); return s ? s.start : null; };
// Hole start addresses in the textbook layout (holes separated by 40 KB blocks):
// 100 @ 0, 500 @ 140, 200 @ 680, 300 @ 920, 600 @ 1260.

// Silberschatz, Galvin & Gagne, Operating System Concepts, ch. 9 practice
// exercise: partitions 100, 500, 200, 300, 600 KB; processes 212, 417, 112, 426 KB.
test("first fit: 212 → 500, 417 → 600, 112 → what's left of 500, 426 must wait", () => {
  const r = contiguous(holes, ops, "first");
  assert.deepEqual(["P1", "P2", "P3", "P4"].map((n) => where(r, n)), [140, 1260, 352, null]);
  assert.equal(r.failed, 1);
  assert.match(r.steps.find((s) => s.failedOp).note, /external fragmentation/);
});

test("best fit places all four: 212 → 300, 417 → 500, 112 → 200, 426 → 600", () => {
  const r = contiguous(holes, ops, "best");
  assert.deepEqual(["P1", "P2", "P3", "P4"].map((n) => where(r, n)), [920, 140, 680, 1260]);
  assert.equal(r.failed, 0);
});

test("worst fit: 212 → 600, 417 → 500, 112 → what's left of 600, 426 must wait", () => {
  const r = contiguous(holes, ops, "worst");
  assert.deepEqual(["P1", "P2", "P3", "P4"].map((n) => where(r, n)), [1260, 140, 1472, null]);
  assert.equal(r.failed, 1);
});

test("next fit carries on from the rover instead of restarting at 0", () => {
  const r = contiguous(holes, ops, "next");
  // P1 → 500 hole; P2 → 600 hole; P3 continues from the rover inside the 600 hole.
  assert.deepEqual(["P1", "P2", "P3"].map((n) => where(r, n)), [140, 1260, 1677]);
  assert.equal(r.failed, 1);
});

test("steps carry pseudocode lines, variables and one step per hole examined", () => {
  for (const algo of ["first", "next", "best", "worst"]) {
    const r = contiguous(holes, ops, algo);
    for (const s of r.steps) if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= ALGORITHMS[algo].code.length, `${algo} line ${l}`);
    assert.ok(r.steps.every((s) => typeof s.note === "string" && s.note.length > 10));
  }
  // Best fit examines all five holes for every request.
  const best = contiguous(holes, ops.slice(0, 1), "best");
  assert.equal(best.steps.filter((s) => s.scan).length, 5);
  // First fit stops at the 500 KB hole: two holes examined.
  assert.equal(contiguous(holes, ops.slice(0, 1), "first").steps.filter((s) => s.scan).length, 2);
});

test("freeing coalesces with holes on both sides", () => {
  const r = contiguous([100, 100], parseScript("A 30; free U1; free A"), "first");
  assert.deepEqual(r.segs.map((s) => [s.start, s.size, s.owner]), [[0, 240, null]]);
  assert.equal(r.steps.filter((s) => s.merged).length, 3);
});

test("rounding to an allocation unit causes internal fragmentation", () => {
  const r = contiguous([500], parseScript("A 130; B 70"), "first", { unit: 64 });
  assert.equal(r.stats.internal, (192 - 130) + (128 - 70));
  assert.equal(r.stats.used, 320);
});

// Stallings, Operating Systems: Internals and Design Principles, fig. 7.6.
test("buddy system: the textbook 1 MB example", () => {
  const all = parseScript(BUDDY_EXAMPLE.script);
  const after = (k) => buddy(all.slice(0, k), { total: 1024, min: 16 }).blocks.map((b) => `${b.owner ?? "-"}${b.size}`).join(" ");
  assert.equal(after(1), "A128 -128 -256 -512");
  assert.equal(after(2), "A128 -128 B256 -512");
  assert.equal(after(3), "A128 C64 -64 B256 -512");
  assert.equal(after(4), "A128 C64 -64 B256 D256 -256");
  assert.equal(after(6), "-128 C64 -64 -256 D256 -256");
  assert.equal(after(7), "E128 C64 -64 -256 D256 -256");
  const end = buddy(all, { total: 1024, min: 16 });
  assert.deepEqual(end.blocks, [{ start: 0, size: 1024, owner: null }]);
  for (const s of end.steps) if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= ALGORITHMS.buddy.code.length);
});

// Silberschatz (ch. 10, "Buddy system"): a 21 KB request in a 256 KB segment
// splits 256 → 128 → 64 → 32 and gets a 32 KB block.
test("buddy system: Silberschatz's 21 KB request", () => {
  const r = buddy(parseScript("A 21"), { total: 256, min: 16 });
  assert.deepEqual(r.blocks.map((b) => b.size), [32, 32, 64, 128]);
  assert.equal(r.stats.internal, 11);
  assert.equal(r.steps.filter((s) => s.split).length, 3);
  assert.equal(buddyTree(r.blocks, 256).length, 7);
});

test("validation", () => {
  assert.throws(() => parseScript("A twelve"), /Can't read/);
  assert.throws(() => parseHoles("100 -5"), /whole numbers/);
  assert.throws(() => contiguous([100], parseScript("A 10; A 10"), "first"), /already has memory/);
  assert.throws(() => buddy([], { total: 1000 }), /power of two/);
  assert.match(contiguous([100], parseScript("free Z"), "first").steps[1].note, /nothing to free/);
});

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("fuzz: blocks never overlap, used + free = total, adjacent holes are always merged", () => {
  for (let k = 0; k < 300; k++) {
    const hs = randomHoles(rand), script = randomScript(rand), unit = [1, 8, 32][k % 3];
    for (const algo of ["first", "next", "best", "worst"]) {
      const r = contiguous(hs, script, algo, { unit });
      const total = hs.reduce((a, b) => a + b, 0) + 40 * (hs.length - 1);
      for (const s of r.steps) {
        let addr = 0;
        for (const [i, seg] of s.segs.entries()) {
          assert.equal(seg.start, addr, `${algo}: contiguous, no overlap`);
          assert.ok(seg.size > 0);
          addr += seg.size;
          if (i && !seg.owner && !s.segs[i - 1].owner && !s.merge?.length && !s.merged) assert.fail(`${algo}: two holes side by side`);
        }
        assert.equal(addr, total);
        assert.equal(s.stats.used + s.stats.free, total);
      }
    }
  }
});

test("fuzz: buddy blocks are aligned powers of two that tile memory", () => {
  for (let k = 0; k < 300; k++) {
    const total = [256, 512, 1024][k % 3];
    const r = buddy(randomScript(rand, 10, total / 2), { total, min: 16 });
    for (const s of r.steps) {
      let addr = 0;
      for (const b of s.blocks) {
        assert.equal(b.start, addr);
        assert.equal(b.size & (b.size - 1), 0, "power of two");
        assert.equal(b.start % b.size, 0, "aligned to its size");
        if (b.owner) assert.ok(b.req <= b.size && (b.size === 16 || b.req > b.size / 2), "smallest block that fits");
        addr += b.size;
      }
      assert.equal(addr, total);
    }
    // Once a free finishes, no two free buddies are left unmerged.
    for (const b of r.blocks) if (!b.owner && b.size < total) assert.ok(!r.blocks.some((x) => !x.owner && x.size === b.size && x.start === (b.start ^ b.size)));
  }
});
