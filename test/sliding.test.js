import assert from "node:assert/strict";
import { test } from "node:test";
import { efficiency, maxWindow, minSeqBits, parseLosses, simulate } from "../public/js/engines/sliding.js";

const inOrder = (r) => assert.deepEqual(r.delivered, Array.from({ length: r.frames }, (_, i) => i));

test("no losses: one transmission per frame", () => {
  for (const protocol of ["sw", "gbn", "sr"]) {
    const r = simulate({ protocol, frames: 6, window: 4 });
    assert.equal(r.framesSent, 6);
    inOrder(r);
  }
  // Stop-and-wait waits a round trip per frame; a window of 4 pipelines them.
  assert.ok(simulate({ protocol: "sw", frames: 6 }).done > simulate({ protocol: "gbn", frames: 6, window: 4 }).done);
});

test("frame 1 lost: Go-Back-N resends 1–4 (9 sends), Selective Repeat only 1 (6 sends)", () => {
  // Hand-traced with delay 1 and timeout 4 (see the comments in sliding.js).
  const losses = parseLosses("F1");
  const gbn = simulate({ protocol: "gbn", frames: 5, window: 4, losses });
  const sr = simulate({ protocol: "sr", frames: 5, window: 4, losses });
  assert.equal(gbn.framesSent, 9);
  assert.equal(gbn.done, 11);
  assert.equal(sr.framesSent, 6);
  assert.equal(sr.done, 7);
  inOrder(gbn); inOrder(sr);
  assert.ok(gbn.sends.some((s) => s.kind === "F" && s.result === "discarded"));
  assert.ok(sr.sends.some((s) => s.kind === "F" && s.result === "buffered"));
});

test("a lost ACK in Selective Repeat: the frame is resent and re-ACKed, delivered once", () => {
  const r = simulate({ protocol: "sr", frames: 4, window: 3, losses: parseLosses("A1") });
  inOrder(r);
  assert.ok(r.sends.some((s) => s.kind === "F" && s.n === 1 && s.result === "duplicate"));
});

test("stop-and-wait with every 3rd transmission lost still delivers everything", () => {
  const r = simulate({ protocol: "sw", frames: 5, everyKth: 3 });
  inOrder(r);
  assert.ok(r.retransmissions >= 2);
});

test("efficiency and sequence numbers", () => {
  // 1 Mbps, 1000-bit frames (Tt = 1 ms), 5 ms propagation: a = 5, stop-and-wait U = 1/11.
  const sw = efficiency({ bandwidth: 1e6, frameBits: 1000, propagation: 0.005 });
  assert.equal(sw.a, 5);
  assert.equal(sw.utilisation.toFixed(4), (1 / 11).toFixed(4));
  assert.equal(sw.optimalWindow, 11);
  assert.equal(efficiency({ bandwidth: 1e6, frameBits: 1000, propagation: 0.005, window: 20 }).utilisation, 1);
  assert.equal(minSeqBits(7, "gbn"), 3);
  assert.equal(minSeqBits(4, "sr"), 3);
  assert.equal(maxWindow(3, "gbn"), 7);
  assert.equal(maxWindow(3, "sr"), 4);
  assert.throws(() => parseLosses("X3"), /Can't read/);
});

test("a periodic loss that lines up with the window never finishes, and says why", () => {
  assert.throws(() => simulate({ protocol: "gbn", frames: 9, window: 4, everyKth: 4, losses: parseLosses("F6 F2 A6") }), /never finishes: frame \d+ was sent \d+ times/);
});
