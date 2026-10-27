import assert from "node:assert/strict";
import { test } from "node:test";
import { beladyCheck, parseRefs, replace } from "../public/js/engines/paging.js";

// The reference string from Silberschatz (ch. 10), 3 frames.
const BOOK = parseRefs("7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1");

test("textbook fault counts: FIFO 15, LRU 12, Optimal 9", () => {
  assert.equal(replace(BOOK, 3, "fifo").faults, 15);
  assert.equal(replace(BOOK, 3, "lru").faults, 12);
  assert.equal(replace(BOOK, 3, "optimal").faults, 9);
});

test("each step records frames, hit/miss and the victim", () => {
  const { steps } = replace(BOOK, 3, "lru");
  assert.deepEqual(steps[2].frames, [7, 0, 1]);
  assert.equal(steps[3].victim, 7); // 2 replaces 7, the least recently used
  assert.deepEqual(steps[3].frames, [2, 0, 1]);
  assert.equal(steps[4].hit, true); // 0 is a hit
  assert.match(steps[3].note, /least recently/);
});

test("Optimal breaks ties among never-used-again pages by earliest load", () => {
  const { steps } = replace([1, 2, 3, 4], 3, "optimal");
  assert.equal(steps[3].victim, 1);
  assert.match(steps[3].note, /never used again/);
});

test("Belady's anomaly: FIFO faults more with 4 frames than 3 on the classic string", () => {
  const refs = parseRefs("1,2,3,4,1,2,5,1,2,3,4,5");
  assert.deepEqual(beladyCheck(refs, 3), { frames: 3, faults: 9, moreFrames: 4, moreFaults: 10, anomaly: true });
  assert.equal(replace(refs, 4, "lru").faults <= replace(refs, 3, "lru").faults, true, "LRU is a stack algorithm: no anomaly");
});

test("input validation", () => {
  assert.throws(() => parseRefs(""), /reference string/);
  assert.throws(() => parseRefs("1 2 x"), /whole numbers/);
  assert.throws(() => replace([1], 0, "fifo"), /Frames/);
});

// --- LFU, MFU, the clock and the working set ----------------------------------
import { ALGORITHMS, randomRefs, workingSet } from "../public/js/engines/paging.js";

test("LFU and MFU, ties going to the page loaded earliest", () => {
  const refs = [1, 2, 3, 1, 4, 5];
  const lfu = replace(refs, 3, "lfu").steps;
  assert.equal(lfu[4].victim, 2, "2 and 3 both have count 1; 2 was loaded first");
  assert.equal(lfu[5].victim, 3);
  assert.deepEqual(lfu.at(-1).frames, [1, 4, 5]);
  const mfu = replace(refs, 3, "mfu").steps;
  assert.equal(mfu[4].victim, 1, "1 has the largest count (2)");
  assert.deepEqual(mfu.at(-1).frames, [4, 5, 3]);
});

test("Second chance (clock): pages with bit 1 are skipped once", () => {
  const { steps, faults } = replace([1, 2, 3, 2, 4, 1, 5], 3, "clock");
  assert.equal(faults, 6);
  assert.deepEqual(steps[4].sweep, [0, 1, 2, 0], "every bit was 1, so the hand goes all the way round");
  assert.equal(steps[4].victim, 1);
  assert.deepEqual(steps[4].ref, [1, 0, 0]);
  assert.equal(steps[4].hand, 1);
  assert.equal(steps[5].victim, 2, "2's bit was cleared, so it goes next");
  assert.match(steps[4].note, /like FIFO/);
});

test("working set: Silberschatz fig. 10.22, Δ = 10", () => {
  const refs = parseRefs("2 6 1 5 7 7 7 7 5 1 6 2 3 4 1 2 3 4 4 4 3 4 3 4 4 4 1 3 2 3 4 4 4 3 4 4 4");
  const ws = workingSet(refs, 10);
  assert.deepEqual(ws.rows[9].set, [1, 2, 5, 6, 7]); // WS(t1)
  assert.deepEqual(ws.rows[25].set, [3, 4]); // WS(t2)
  assert.throws(() => workingSet(refs, 0), /Δ/);
});

test("fuzz: lines, variables and the clock hand stay in range", () => {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 300; k++) {
    const refs = randomRefs(rand), frames = 1 + Math.floor(rand() * 5);
    const opt = replace(refs, frames, "optimal").faults;
    for (const [algo, spec] of Object.entries(ALGORITHMS)) {
      const r = replace(refs, frames, algo);
      for (const s of r.steps) {
        assert.ok(s.line.every((l) => l >= 1 && l <= spec.code.length), `${algo} ${s.line}`);
        assert.equal(s.vars.p, s.page);
        assert.ok(s.hand >= 0 && s.hand < frames);
        if (!s.hit && s.victim != null) assert.ok(!s.frames.includes(s.victim));
      }
      assert.ok(r.faults >= opt, `${algo} can't beat OPT`);
    }
  }
});
