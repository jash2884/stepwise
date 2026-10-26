import assert from "node:assert/strict";
import { test } from "node:test";
import { fragment } from "../public/js/engines/fragment.js";

test("Kurose: a 4000-byte datagram over a 1500-byte MTU", () => {
  const r = fragment(4000, 1500);
  assert.deepEqual(r.fragments.map((f) => [f.length, f.offset, f.mf]), [[1500, 0, 1], [1500, 185, 1], [1040, 370, 0]]);
  assert.equal(r.perFragment, 1480);
});

test("data per fragment rounds down to a multiple of 8", () => {
  const r = fragment(2000, 820); // 800 bytes of room → 800; 1980 data → 800, 800, 380
  assert.deepEqual(r.fragments.map((f) => [f.data, f.offset]), [[800, 0], [800, 100], [380, 200]]);
  const odd = fragment(1000, 509); // 489 bytes of room → 488
  assert.equal(odd.perFragment, 488);
  assert.ok(odd.fragments.slice(0, -1).every((f) => f.data % 8 === 0));
});

test("no fragmentation when it fits; validation", () => {
  assert.equal(fragment(1000, 1500).fragments.length, 1);
  assert.throws(() => fragment(1000, 20), /MTU/);
  assert.throws(() => fragment(1000, 576, 22), /steps of 4/);
});
