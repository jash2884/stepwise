import assert from "node:assert/strict";
import { test } from "node:test";
import { aloha, ALOHA_CODE, csmaca, CSMACA_CODE, csmacd, CSMACD_CODE, minFrame, parseStations, peak, throughput } from "../public/js/engines/mac.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const linesOk = (steps, code) => { for (const s of steps) if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= code.length, `line ${l}`); };

// Kurose & Ross ch. 6 (random access protocols) and Tanenbaum ch. 4 (ALOHA): pure ALOHA peaks at 1/(2e) ≈ 18.4% when G = 0.5,
// slotted ALOHA at 1/e ≈ 36.8% when G = 1.
test("ALOHA throughput curves and their peaks", () => {
  close(throughput(0.5, "pure"), 1 / (2 * Math.E));
  close(throughput(1, "slotted"), 1 / Math.E);
  assert.equal(peak("pure").S.toFixed(3), "0.184");
  assert.equal(peak("slotted").S.toFixed(3), "0.368");
  for (const G of [0.1, 0.3, 0.7, 1.5, 3]) {
    assert.ok(throughput(G, "pure") < peak("pure").S);
    assert.ok(throughput(G, "slotted") < peak("slotted").S);
  }
});

test("ALOHA simulation: a frame succeeds exactly when nothing overlaps it; long runs match the formula", () => {
  for (const mode of ["pure", "slotted"]) {
    const r = aloha({ mode, stations: 6, G: 1, slots: 60, seed: 42 });
    for (const f of r.frames) {
      const overlap = r.frames.some((o) => o !== f && o.start < f.end && f.start < o.end);
      assert.equal(f.ok, !overlap, `${mode} frame ${f.id}`);
      if (mode === "slotted") assert.ok(Number.isInteger(f.start));
    }
    linesOk(r.steps, ALOHA_CODE[mode]);
    assert.equal(r.steps.length, 60);
  }
  // 20,000 frame times with 26 stations: within 1.5 percentage points of G·e^(−kG).
  const pure = aloha({ mode: "pure", stations: 26, G: 0.5, slots: 20000, seed: 7 });
  const slotted = aloha({ mode: "slotted", stations: 26, G: 1, slots: 20000, seed: 7 });
  assert.ok(Math.abs(pure.S - 0.184) < 0.015, `pure ${pure.S}`);
  assert.ok(Math.abs(slotted.S - 0.368) < 0.015, `slotted ${slotted.S}`);
});

test("CSMA/CD: two stations colliding pick k from 0–1, then 0–3; frames all get through", () => {
  const picks = [];
  const r = csmacd({ stations: parseStations("A 0, B 0"), frameSlots: 2, pick: (n, s) => { picks.push([s, n]); return s === "A" ? 0 : n === 1 ? 0 : 2; } });
  // Collision in slot 0 (both pick 0) → collide again in slot 1 → A picks 0, B picks 2.
  assert.deepEqual(picks, [["A", 1], ["B", 1], ["A", 2], ["B", 2]]);
  assert.equal(r.collisions, 2);
  assert.deepEqual(r.stations.map((s) => s.state), ["done", "done"]);
  assert.equal(r.cells.A[0], "collide");
  assert.equal(r.cells.A[2], "tx");
  assert.equal(r.cells.B[2], "backoff");
  linesOk(r.steps, CSMACD_CODE);
  assert.throws(() => parseStations("A 0, A 1"), /twice/);
});

test("CSMA/CD backoff ranges grow as 2^n and stop doubling at n = 10", () => {
  const seen = new Map();
  for (let seed = 1; seed < 60; seed++) {
    csmacd({ stations: parseStations("A 0, B 0, C 0"), seed, maxSlots: 400, pick: (n) => { const k = Math.floor(Math.random() * 2 ** Math.min(n, 10)); seen.set(n, Math.max(seen.get(n) ?? 0, k)); return k; } });
  }
  for (const [n, k] of seen) assert.ok(k < 2 ** Math.min(n, 10), `n=${n} k=${k}`);
});

// Forouzan, Data Communications and Networking, the CSMA/CD minimum-frame example: 10 Mbps, maximum
// propagation time 25.6 µs → minimum frame 2 × 25.6 µs × 10 Mbps = 512 bits = 64 bytes.
test("CSMA/CD minimum frame size", () => {
  const r = minFrame({ bandwidth: 10e6, propagation: 25.6e-6 });
  close(r.bits, 512, 1e-6);
  close(r.bytes, 64, 1e-6);
  close(minFrame({ bandwidth: 1e9, distance: 200, speed: 2e8 }).bits, 2000, 1e-6);
});

test("CSMA/CA: the smaller backoff wins, the other freezes and resumes; ties collide and double CW", () => {
  const r = csmaca({ backoffs: { A: 3, C: 5 } });
  const kinds = r.msgs.map((m) => `${m.from}:${m.label}`);
  assert.deepEqual(kinds, ["A:RTS", "AP:CTS", "A:DATA", "AP:ACK", "C:RTS", "AP:CTS", "C:DATA", "AP:ACK"]);
  // C froze at 5 − 3 = 2 and only counts down those 2 slots the second time.
  assert.ok(r.bars.some((b) => b.lane === "C" && b.kind === "backoff" && b.text === "2→0"));
  assert.ok(r.bars.some((b) => b.lane === "C" && b.kind === "nav"));
  const tie = csmaca({ backoffs: { A: 2, C: 2 }, seed: 5 });
  assert.equal(tie.msgs[0].cls, "collide");
  assert.equal(tie.steps.find((s) => /collide/.test(s.note)).vars["CW A"], 16);
  assert.equal(tie.msgs.filter((m) => m.label === "ACK").length, 2);
  const plain = csmaca({ backoffs: { A: 1, C: 4 }, rtscts: false });
  assert.deepEqual(plain.msgs.map((m) => m.label), ["DATA", "ACK", "DATA", "ACK"]);
  for (const x of [r, tie, plain]) linesOk(x.steps, CSMACA_CODE);
});
