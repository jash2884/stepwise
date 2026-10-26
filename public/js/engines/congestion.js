// TCP congestion control, one value of cwnd (in MSS) per transmission round (RTT).
//
// Conventions (stated in the UI):
// - Slow start doubles cwnd each round but never past ssthresh (cwnd = min(2·cwnd, ssthresh)).
// - At or above ssthresh, congestion avoidance adds 1 MSS per round.
// - A loss event in round r changes the window used in round r + 1.
// - On a loss, ssthresh = max(⌊cwnd / 2⌋, 2).
// - Timeout: cwnd = 1 (both variants). Triple duplicate ACK: Tahoe sets cwnd = 1;
//   Reno sets cwnd = ssthresh (or ssthresh + 3 with Kurose's fast-recovery accounting).

export const VARIANTS = { tahoe: { name: "TCP Tahoe" }, reno: { name: "TCP Reno" } };

export function parseEvents(text) {
  const events = [];
  for (const part of String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(?:round\s*)?(\d{1,3})\s*[:=]?\s*(timeout|to|t|3\s*dup(?:licate)?\s*acks?|dup|3dup|d)$/i.exec(part);
    if (!m) throw new Error(`Can't read "${part}". Write events like "8: 3dup" or "14: timeout".`);
    events.push({ round: Number(m[1]), type: /^t/i.test(m[2]) ? "timeout" : "dupack" });
  }
  return events.sort((a, b) => a.round - b.round);
}

export function simulate({ ssthresh = 8, rounds = 20, events = [], variant = "reno", plus3 = false, maxWindow = Infinity } = {}) {
  if (!VARIANTS[variant]) throw new Error(`Unknown variant ${variant}`);
  if (!Number.isInteger(ssthresh) || ssthresh < 2 || ssthresh > 256) throw new Error("Initial ssthresh must be between 2 and 256 MSS.");
  if (!Number.isInteger(rounds) || rounds < 2 || rounds > 60) throw new Error("Show between 2 and 60 rounds.");
  const at = new Map(events.map((e) => [e.round, e.type]));
  let cwnd = 1, ss = ssthresh;
  const series = [];
  for (let r = 1; r <= rounds; r++) {
    const phase = cwnd < ss ? "slow start" : "congestion avoidance";
    const point = { round: r, cwnd, ssthresh: ss, phase, event: at.get(r) ?? null };
    series.push(point);
    const ev = at.get(r);
    if (ev) {
      const newSs = Math.max(Math.floor(cwnd / 2), 2);
      const next = ev === "timeout" || variant === "tahoe" ? 1 : newSs + (plus3 ? 3 : 0);
      point.note = ev === "timeout"
        ? `Round ${r}: a TIMEOUT. ssthresh = ⌊${cwnd}/2⌋ = ${newSs}, cwnd drops to 1 and slow start begins again.`
        : variant === "tahoe"
          ? `Round ${r}: 3 duplicate ACKs. Tahoe treats it like a timeout: ssthresh = ${newSs}, cwnd = 1.`
          : `Round ${r}: 3 duplicate ACKs. Reno does fast recovery: ssthresh = ${newSs}, cwnd = ${plus3 ? `${newSs} + 3 = ` : ""}${next}, then congestion avoidance.`;
      ss = newSs;
      cwnd = next;
    } else if (cwnd < ss) {
      const next = Math.min(cwnd * 2, ss);
      point.note = `Round ${r}: slow start, cwnd ${cwnd} → ${next}${next === ss && cwnd * 2 > ss ? ` (capped at ssthresh ${ss})` : " (doubles)"}.`;
      cwnd = next;
    } else {
      point.note = `Round ${r}: congestion avoidance, cwnd ${cwnd} → ${cwnd + 1} (+1 MSS per round).`;
      cwnd += 1;
    }
    cwnd = Math.min(cwnd, maxWindow);
  }
  return { series, totalSegments: series.reduce((s, p) => s + p.cwnd, 0) };
}

export function randomScenario(r = Math.random) {
  const ssthresh = [8, 12, 16, 20, 32][Math.floor(r() * 5)];
  const first = 6 + Math.floor(r() * 6);
  const events = [{ round: first, type: r() < 0.5 ? "timeout" : "dupack" }];
  if (r() < 0.5) events.push({ round: first + 4 + Math.floor(r() * 4), type: r() < 0.5 ? "timeout" : "dupack" });
  return { ssthresh, events, variant: r() < 0.5 ? "tahoe" : "reno" };
}
