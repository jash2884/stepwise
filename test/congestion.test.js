import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEvents, simulate } from "../public/js/engines/congestion.js";

const cw = (r) => r.series.map((p) => p.cwnd);

// Kurose & Ross, figure 3.53: ssthresh starts at 8, triple duplicate ACK in round 8 (cwnd 12).
test("Kurose fig. 3.53: Tahoe vs Reno after a triple duplicate ACK", () => {
  const events = [{ round: 8, type: "dupack" }];
  const tahoe = simulate({ ssthresh: 8, rounds: 15, events, variant: "tahoe" });
  const reno = simulate({ ssthresh: 8, rounds: 15, events, variant: "reno", plus3: true });
  assert.deepEqual(cw(tahoe).slice(0, 8), [1, 2, 4, 8, 9, 10, 11, 12]);
  assert.deepEqual(cw(tahoe).slice(8), [1, 2, 4, 6, 7, 8, 9]);
  assert.deepEqual(cw(reno).slice(8), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(tahoe.series[8].ssthresh, 6);
});

test("Reno without +3, timeouts reset both variants, slow start caps at ssthresh", () => {
  const r = simulate({ ssthresh: 8, rounds: 12, events: [{ round: 8, type: "dupack" }], variant: "reno" });
  assert.equal(r.series[8].cwnd, 6);
  const t = simulate({ ssthresh: 6, rounds: 10, events: [{ round: 6, type: "timeout" }], variant: "reno" });
  assert.deepEqual(cw(t), [1, 2, 4, 6, 7, 8, 1, 2, 4, 5]); // ssthresh becomes ⌊8/2⌋ = 4, then +1 once cwnd reaches it
  assert.match(t.series[5].note, /TIMEOUT/);
});

test("event parsing", () => {
  assert.deepEqual(parseEvents("14: timeout, 8: 3dup"), [{ round: 8, type: "dupack" }, { round: 14, type: "timeout" }]);
  assert.throws(() => parseEvents("8 boom"), /Can't read/);
});
