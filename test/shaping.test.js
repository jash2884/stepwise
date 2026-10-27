import assert from "node:assert/strict";
import { test } from "node:test";
import { burst, LEAKY_CODE, leakyBucket, maxInInterval, parseArrivals, TOKEN_CODE, tokenBucket } from "../public/js/engines/shaping.js";

// Tanenbaum, Computer Networks ch. 5 (traffic shaping): C = 250 KB, ρ = 2 MB/s, M = 25 MB/s gives a burst of
// about 11 ms (250,000 / 23,000,000 s ≈ 10.9 ms with decimal units).
test("token bucket burst length S = C / (M − ρ)", () => {
  const r = burst({ C: 250e3, M: 25e6, rho: 2e6 });
  assert.equal((r.S * 1000).toFixed(2), "10.87");
  assert.ok(Math.abs(r.bytes - r.tokensUsed) < 1e-6, "C + ρS = MS");
  assert.throws(() => burst({ C: 1, M: 2, rho: 2 }), /bigger than the token rate/);
  // Kurose & Ross, policing with a leaky (token) bucket: at most r·t + b packets in any interval t.
  assert.equal(maxInInterval({ b: 10, r: 2, t: 5 }), 20);
});

test("leaky bucket: output never exceeds the rate; overflow is dropped", () => {
  const r = leakyBucket({ arrivals: parseArrivals("8 0 0 3"), capacity: 5, rate: 2 });
  assert.deepEqual(r.steps.map((s) => s.sent), [2, 2, 1, 2, 1]);
  assert.equal(r.steps[0].dropped, 3);
  assert.equal(r.sent + r.dropped + r.left, r.arrived);
  for (const s of r.steps) for (const l of s.line) assert.ok(l >= 1 && l <= LEAKY_CODE.length);
  assert.throws(() => parseArrivals("3 x"), /packet count/);
});

test("token bucket: saved tokens allow a burst; shaping queues, policing drops", () => {
  const arrivals = parseArrivals("6 0 0 0 3");
  const shape = tokenBucket({ arrivals, capacity: 4, rate: 1, mode: "shape" });
  assert.deepEqual(shape.steps.slice(0, 3).map((s) => s.sent), [4, 1, 1]);
  assert.equal(shape.dropped, 0);
  const police = tokenBucket({ arrivals, capacity: 4, rate: 1, mode: "police" });
  assert.equal(police.steps[0].dropped, 2);
  assert.equal(police.sent + police.dropped, police.arrived);
  for (const s of [...shape.steps, ...police.steps]) for (const l of s.line) assert.ok(l >= 1 && l <= TOKEN_CODE.length);
});

test("fuzz: token bucket never sends more than b + r·k in any k ticks; leaky never more than its rate", () => {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) {
    const arrivals = Array.from({ length: 4 + Math.floor(rand() * 20) }, () => Math.floor(rand() * 9));
    const b = 1 + Math.floor(rand() * 8), rate = 1 + Math.floor(rand() * 3);
    const tb = tokenBucket({ arrivals, capacity: b, rate, mode: rand() < 0.5 ? "shape" : "police", queueSize: Math.floor(rand() * 12) });
    const sent = tb.steps.map((s) => s.sent);
    for (let i = 0; i < sent.length; i++) for (let k = 1; i + k <= sent.length; k++) assert.ok(sent.slice(i, i + k).reduce((x, y) => x + y, 0) <= b + rate * k);
    assert.equal(tb.sent + tb.dropped + tb.left, tb.arrived);
    for (const s of tb.steps) assert.ok(s.tokens >= 0 && s.tokens <= b);
    const lb = leakyBucket({ arrivals, capacity: b, rate });
    for (const s of lb.steps) assert.ok(s.sent <= rate && s.level <= b);
    assert.equal(lb.sent + lb.dropped + lb.left, lb.arrived);
  }
});
