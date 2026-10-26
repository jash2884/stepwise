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
