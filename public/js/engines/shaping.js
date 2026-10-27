// Traffic shaping: the leaky bucket and the token bucket, tick by tick, and the
// classic burst-length calculation.
//
// Conventions (stated in the UI):
// - Traffic is counted in whole packets; arrivals[t] packets arrive in tick t.
// - Leaky bucket: arrivals join the bucket (a queue of `capacity` packets) if
//   there's room, otherwise they overflow and are dropped; then up to `rate`
//   packets leave through the hole. A packet can arrive and leave in one tick.
// - Token bucket: the bucket starts full; at the start of every tick `rate`
//   tokens are added (never more than `capacity`). Each packet sent uses one
//   token. Packets without a token are queued (shaper, finite queue) or dropped
//   at once (policer).

export const LEAKY_CODE = [
  "every tick:",
  "  for each arriving packet",
  "    if the bucket has room then add it to the bucket",
  "    else drop it  // the bucket overflows",
  "  send min(rate, packets in bucket) out of the hole",
];

export const TOKEN_CODE = [
  "tokens ← capacity  // the bucket starts full",
  "every tick: tokens ← min(capacity, tokens + rate)",
  "  for each packet waiting (queued first, then new arrivals)",
  "    if tokens ≥ 1 then send it; tokens ← tokens − 1",
  "    else if shaping and the queue has room then queue it",
  "    else drop it  // non-conforming",
];

export function parseArrivals(text) {
  const list = String(text).trim().split(/[\s,;]+/).filter(Boolean).map((x) => {
    if (!/^\d{1,2}$/.test(x)) throw new Error(`"${x}" isn't a packet count. Write whole numbers, one per tick, like "5 0 0 8 2".`);
    return Number(x);
  });
  if (!list.length) throw new Error("Enter at least one tick of arrivals.");
  if (list.length > 40) throw new Error("Use at most 40 ticks.");
  return list;
}

const check = (v, name, min, max) => { if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`); };

export function leakyBucket({ arrivals, capacity = 6, rate = 2, drain = 6 } = {}) {
  check(capacity, "Bucket size", 1, 60); check(rate, "Leak rate", 1, 20);
  const ticks = [...arrivals, ...Array(drain).fill(0)];
  let queue = 0, sentAll = 0, droppedAll = 0;
  const steps = [];
  ticks.forEach((a, t) => {
    if (t >= arrivals.length && queue === 0) return;
    const room = capacity - queue, accepted = Math.min(a, room), dropped = a - accepted;
    queue += accepted;
    const sent = Math.min(rate, queue);
    queue -= sent; sentAll += sent; droppedAll += dropped;
    steps.push({ t, arrived: a, accepted, dropped, sent, level: queue, line: [1, ...(a ? [2, 3] : []), ...(dropped ? [4] : []), 5],
      vars: { t, arrived: a, "room before": room, dropped, sent, "in bucket": queue, "total sent": sentAll, "total dropped": droppedAll },
      note: `Tick ${t}: ${a ? `${a} packet${a === 1 ? "" : "s"} arrive${a === 1 ? "s" : ""}; ${dropped ? `there's room for only ${room}, so ${dropped} overflow${dropped === 1 ? "s" : ""} and ${dropped === 1 ? "is" : "are"} dropped` : `the bucket has room for ${room}, so all ${a} go in`}. ` : "nothing arrives. "}${sent ? `${sent} packet${sent === 1 ? "" : "s"} leak${sent === 1 ? "s" : ""} out (at most ${rate} per tick, however bursty the input)` : "The bucket is empty, so nothing leaves"}; ${queue} left in the bucket.` });
  });
  return { steps, sent: sentAll, dropped: droppedAll, arrived: arrivals.reduce((s, x) => s + x, 0), left: queue };
}

export function tokenBucket({ arrivals, capacity = 4, rate = 1, mode = "shape", queueSize = 10, drain = 10 } = {}) {
  check(capacity, "Bucket size", 1, 60); check(rate, "Token rate", 1, 20); check(queueSize, "Queue size", 0, 100);
  if (!["shape", "police"].includes(mode)) throw new Error(`Unknown mode ${mode}`);
  const ticks = [...arrivals, ...Array(drain).fill(0)];
  let tokens = capacity, queue = 0, sentAll = 0, droppedAll = 0;
  const steps = [];
  ticks.forEach((a, t) => {
    if (t >= arrivals.length && queue === 0) return;
    const before = tokens;
    tokens = Math.min(capacity, tokens + (t === 0 ? 0 : rate));
    const added = tokens - before;
    const waiting = queue + a;
    const sent = Math.min(tokens, waiting);
    tokens -= sent;
    const left = waiting - sent;
    const kept = mode === "shape" ? Math.min(left, queueSize) : 0;
    const dropped = left - kept;
    queue = kept; sentAll += sent; droppedAll += dropped;
    steps.push({ t, arrived: a, sent, dropped, queued: queue, tokens, added, line: [t === 0 ? 1 : 2, ...(waiting ? [3, 4] : []), ...(kept ? [5] : []), ...(dropped ? [6] : [])],
      vars: { t, "tokens added": added, arrived: a, sent, queued: queue, dropped, "tokens left": tokens, "total sent": sentAll },
      note: `Tick ${t}: ${t === 0 ? `the bucket starts full with ${capacity} tokens` : added ? `${added} token${added === 1 ? "" : "s"} drip${added === 1 ? "s" : ""} in (capped at ${capacity})` : `the bucket is already full (${capacity} tokens), so the new tokens are wasted`}. ${a ? `${a} packet${a === 1 ? "" : "s"} arrive${a === 1 ? "s" : ""}. ` : ""}${waiting ? `${sent} of the ${waiting} waiting packet${waiting === 1 ? "" : "s"} have tokens and go straight out${sent > rate ? `: a burst of ${sent}, faster than the token rate, because saved-up tokens allow it` : ""}.` : "No packets are waiting."}${kept ? ` ${kept} wait${kept === 1 ? "s" : ""} in the queue for future tokens.` : ""}${dropped ? ` ${dropped} ${mode === "police" ? "have no token, so the policer drops them" : "don't fit in the queue and are dropped"}.` : ""}` });
  });
  return { steps, sent: sentAll, dropped: droppedAll, arrived: arrivals.reduce((s, x) => s + x, 0), left: queue };
}

// Tanenbaum's burst length for a token bucket of capacity C bytes, token rate ρ
// and maximum output rate M (both bytes/s): the burst lasts S = C / (M − ρ),
// because C + ρS = MS. Kurose's bound: at most r·t + b packets in any interval t.
export function burst({ C, M, rho }) {
  for (const [v, n] of [[C, "Bucket size C"], [M, "Maximum rate M"], [rho, "Token rate ρ"]]) if (!(v > 0)) throw new Error(`${n} must be positive.`);
  if (M <= rho) throw new Error("The maximum output rate M must be bigger than the token rate ρ, or the bucket never empties and the burst is unlimited.");
  const S = C / (M - rho);
  return { S, bytes: M * S, tokensUsed: C + rho * S };
}

export const maxInInterval = ({ b, r, t }) => r * t + b;
