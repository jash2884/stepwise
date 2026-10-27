// Sliding-window protocols simulated tick by tick: Stop-and-Wait, Go-Back-N and
// Selective Repeat.
//
// Model (stated in the UI): the sender can put one frame on the wire per tick;
// a frame sent at tick t reaches the other side at t + d; the receiver ACKs
// immediately. Frames are numbered 0, 1, 2, … (no wrap-around). Timeouts are
// measured from the last (re)send.
// GBN: one timer for the oldest unacknowledged frame; the receiver only accepts
// the next frame in order and sends cumulative ACKs (ACK k = "everything up to
// k arrived"); a timeout resends every outstanding frame.
// SR: one timer per frame; the receiver buffers out-of-order frames inside its
// window and ACKs each frame individually; a timeout resends only that frame.
// Every tick names the pseudocode lines that ran (`line`) and the protocol's
// variables at the end of the tick (`vars`).

export const PROTOCOLS = {
  sw: {
    name: "Stop-and-Wait", window: false,
    code: [
      "send frame next; start the timer  // one frame at a time",
      "wait for its ACK (ignore stale ACKs)",
      "on ACK of frame base: base ← base + 1; stop the timer",
      "on timeout: resend frame base; restart the timer",
      "receiver, on frame k:",
      "  if k = expected then deliver it; expected ← expected + 1",
      "  else it's a duplicate: discard it",
      "  ACK the last frame received in order",
    ],
    lines: { send: 1, wait: 2, dupack: 2, ack: 3, done: 3, timeout: 4, resend: 4, deliver: [5, 6, 8], discard: [5, 7, 8] },
  },
  gbn: {
    name: "Go-Back-N", window: true,
    code: [
      "if next < base + W then",
      "  send frame next; next ← next + 1",
      "  if the timer isn't running, start it",
      "else the window is full: wait",
      "on ACK k (cumulative): base ← k + 1",
      "  restart the timer if frames are still outstanding",
      "on timeout: next ← base  // go back: resend base … next−1",
      "receiver, on frame k:",
      "  if k = expected then deliver; ACK k; expected ← expected + 1",
      "  else discard it; resend ACK expected − 1",
    ],
    lines: { send: [1, 2, 3], resend: [1, 2], wait: 4, ack: [5, 6], dupack: 5, done: 5, timeout: 7, deliver: [8, 9], discard: [8, 10] },
  },
  sr: {
    name: "Selective Repeat", window: true,
    code: [
      "if a timed-out frame is queued then resend it; restart its timer",
      "else if next < base + W then",
      "  send frame next; start its own timer; next ← next + 1",
      "else the window is full: wait",
      "on ACK k: mark frame k acknowledged",
      "  while frame base is acknowledged: base ← base + 1",
      "on frame k's timer expiring: queue frame k for resending",
      "receiver, on frame k:",
      "  if expected ≤ k < expected + W then buffer it; send ACK k",
      "    while expected is buffered: deliver it; expected ← expected + 1",
      "  else if k < expected then send ACK k again  // its ACK was lost",
    ],
    lines: { resend: 1, send: [2, 3], wait: 4, ack: [5, 6], dupack: 5, done: [5, 6], timeout: 7, buffer: [8, 9], deliver: [8, 9, 10], duplicate: [8, 11] },
  },
};

export function parseLosses(text) {
  const keys = new Set();
  for (const part of String(text).split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([FA])(\d{1,2})(?:#(\d))?$/i.exec(part);
    if (!m) throw new Error(`Can't read "${part}". Write F3 (lose frame 3's first transmission), F3#2 (its second), or A2 (lose the first ACK 2).`);
    keys.add(`${m[1].toUpperCase()}${Number(m[2])}#${m[3] ? Number(m[3]) : 1}`);
  }
  return keys;
}

export function simulate({ protocol = "gbn", frames = 6, window = 4, delay = 1, timeout = null, losses = new Set(), everyKth = 0 } = {}) {
  if (!PROTOCOLS[protocol]) throw new Error(`Unknown protocol ${protocol}`);
  if (!Number.isInteger(frames) || frames < 1 || frames > 16) throw new Error("Send between 1 and 16 frames.");
  const W = protocol === "sw" ? 1 : window;
  if (!Number.isInteger(W) || W < 1 || W > 8) throw new Error("Window size must be between 1 and 8.");
  if (!Number.isInteger(delay) || delay < 1 || delay > 4) throw new Error("Propagation delay must be 1 to 4 ticks.");
  const T = timeout ?? 2 * delay + 2;
  if (!Number.isInteger(T) || T < 2 * delay || T > 30) throw new Error(`The timeout must be at least the round trip (${2 * delay} ticks).`);

  const sends = [];               // every frame or ACK put on the wire
  const inFlight = [];            // { arrive, kind, n, lost }
  const attempts = new Map(), ackAttempts = new Map();
  const delivered = [];
  const ticks = [];
  let base = 0, next = 0, timerStart = null;
  const sentAt = new Map(), acked = new Set(), retransmit = [];
  let expected = 0;               // receiver: next in-order frame
  const buffer = new Set();       // SR receiver buffer
  let frameCount = 0, done = null;

  const send = (t, kind, n, note) => {
    const map = kind === "F" ? attempts : ackAttempts;
    const a = (map.get(n) ?? 0) + 1;
    map.set(n, a);
    if (kind === "F") frameCount++;
    const lost = losses.has(`${kind}${n}#${a}`) || (kind === "F" && everyKth > 0 && frameCount % everyKth === 0);
    const s = { kind, n, attempt: a, sent: t, arrive: t + delay, lost, note };
    sends.push(s);
    inFlight.push(s);
    return s;
  };

  const P = PROTOCOLS[protocol];
  const snapTick = (t, notes, kinds) => {
    const line = [...new Set(kinds.flatMap((k) => [P.lines[k] ?? []].flat()))].sort((a, b) => a - b);
    const timer = timerStart === null ? "off" : `${Math.max(0, T - (t - timerStart))} ticks left`;
    const vars = protocol === "sw" ? { t, base, expected, timer }
      : protocol === "gbn" ? { t, W, base, next, expected, timer, outstanding: next - base }
        : { t, W, base, next, expected, buffered: [...buffer].sort((a, b) => a - b), resendQueue: [...retransmit] };
    return { t, base, next, expected, buffer: [...buffer], acked: [...acked], notes, note: notes.join(" "), line: line.length ? line : null, vars };
  };

  for (let t = 0; t < 400 && done === null; t++) {
    const notes = [], kinds = [];
    const say = (kind, text) => { notes.push(text); if (kind) kinds.push(kind); };
    // 1. ACKs reaching the sender.
    for (const s of inFlight.filter((x) => x.arrive === t && x.kind === "A")) {
      if (s.lost) { say(null, `ACK ${s.n} was lost on the way back, so the sender never sees it.`); continue; }
      if (protocol === "sr") {
        if (!acked.has(s.n)) { acked.add(s.n); say("ack", `Sender gets ACK ${s.n} and marks frame ${s.n} acknowledged, which stops its timer.`); }
        while (acked.has(base)) base++;
      } else if (s.n >= base) {
        base = s.n + 1;
        timerStart = base < next ? t : null;
        say("ack", protocol === "sw" ? `Sender gets ACK ${s.n}: frame ${s.n} is confirmed, so it can move on to frame ${base}.` : `Sender gets ACK ${s.n}. ACKs are cumulative, so every frame up to ${s.n} is confirmed and the window slides to start at ${base}.`);
      } else say("dupack", `Sender gets a duplicate ACK ${s.n}. Everything up to ${s.n} is already confirmed, so it ignores it.`);
    }
    if (base >= frames) { done = t; say("done", `All ${frames} frames are acknowledged: the transfer is complete.`); ticks.push(snapTick(t, notes, kinds)); break; }

    // 2. Frames reaching the receiver.
    for (const s of inFlight.filter((x) => x.arrive === t && x.kind === "F")) {
      if (s.lost) { say(null, `Frame ${s.n} was lost on the way, so the receiver never sees it.`); continue; }
      if (protocol === "sr") {
        if (s.n >= expected && s.n < expected + W) {
          buffer.add(s.n);
          const before = expected;
          while (buffer.has(expected)) { delivered.push(expected); buffer.delete(expected); expected++; }
          s.result = expected > before ? "delivered" : "buffered";
          say(expected > before ? "deliver" : "buffer", expected > before
            ? `Receiver gets frame ${s.n} and can now deliver ${before === expected - 1 ? before : `${before}–${expected - 1}`} to the layer above, in order; it sends ACK ${s.n}.`
            : `Receiver gets frame ${s.n} early (it still needs ${expected}), so it buffers it instead of throwing it away, and sends ACK ${s.n}.`);
          send(t, "A", s.n);
        } else if (s.n < expected) {
          s.result = "duplicate";
          say("duplicate", `Receiver already has frame ${s.n}, so its ACK must have been lost; it sends ACK ${s.n} again so the sender can move on.`);
          send(t, "A", s.n);
        }
      } else if (s.n === expected) {
        delivered.push(expected);
        expected++;
        s.result = "delivered";
        say("deliver", `Receiver gets frame ${s.n}, the one it was expecting, delivers it and sends ACK ${s.n}.`);
        send(t, "A", s.n);
      } else {
        s.result = "discarded";
        say("discard", `Receiver expected frame ${expected} but got ${s.n}. ${s.n < expected ? "It already has that one" : "It keeps no buffer for out-of-order frames"}, so it discards it${expected > 0 ? ` and repeats ACK ${expected - 1}` : ""}.`);
        if (expected > 0) send(t, "A", expected - 1);
      }
    }

    // 3. Timeouts.
    if (protocol === "sr") {
      for (let k = base; k < next; k++) {
        if (!acked.has(k) && t - sentAt.get(k) >= T && !retransmit.includes(k)) { retransmit.push(k); say("timeout", `Frame ${k}'s timer expires (no ACK within ${T} ticks): queue frame ${k}, and only frame ${k}, for resending.`); }
      }
    } else if (timerStart !== null && t - timerStart >= T && base < next) {
      say("timeout", protocol === "sw" ? `The timer expires: no ACK for frame ${base} within ${T} ticks, so it will be sent again.` : `The timer for frame ${base} expires: go back and resend frames ${base}${next - 1 > base ? `–${next - 1}` : ""}, because the receiver discarded everything after the gap.`);
      next = base;
      timerStart = null;
    }

    // 4. Send at most one frame this tick.
    if (protocol === "sr" && retransmit.length) {
      const k = retransmit.shift();
      sentAt.set(k, t);
      const s = send(t, "F", k);
      say("resend", `Sender resends frame ${k}${s.lost ? " (it will be lost again)" : ""} and restarts its timer.`);
    } else if (next < Math.min(base + W, frames)) {
      const k = next++;
      const again = (attempts.get(k) ?? 0) > 0;
      sentAt.set(k, t);
      const s = send(t, "F", k);
      if (timerStart === null && protocol !== "sr") timerStart = t;
      say(again ? "resend" : "send", `Sender ${again ? "resends" : "sends"} frame ${k}${s.lost ? " (it will be lost)" : ""}.`);
    } else if (base < frames && next >= Math.min(base + W, frames)) {
      say("wait", protocol === "sw" ? `Frame ${base} is still unacknowledged, so the sender waits.` : `Window [${base}–${base + W - 1}] is full (every frame in it is sent), so the sender waits for an ACK.`);
    }
    ticks.push(snapTick(t, notes, kinds));
  }
  if (done === null) {
    // A deterministic loss pattern can line up with the retry pattern forever.
    const [worst, tries] = [...attempts].reduce((a, b) => (b[1] > a[1] ? b : a));
    const err = new Error(`This never finishes: frame ${worst} was sent ${tries} times and the loss pattern hits it on every retry${everyKth ? ` (every ${everyKth}th transmission lines up with the window of ${W})` : ""}. Try a different window size or loss setting.`);
    err.livelock = true;
    throw err;
  }
  const framesSent = sends.filter((s) => s.kind === "F").length;
  return { protocol, W, T, delay, frames, sends, ticks, delivered, done, framesSent, retransmissions: framesSent - frames, acksSent: sends.filter((s) => s.kind === "A").length };
}

// Link utilisation for a sliding window: U = min(1, W / (1 + 2a)), a = Tp / Tt.
export function efficiency({ bandwidth, frameBits, propagation, window = 1 }) {
  for (const [v, name] of [[bandwidth, "Bandwidth"], [frameBits, "Frame size"], [propagation, "Propagation delay"], [window, "Window"]]) {
    if (!(v > 0)) throw new Error(`${name} must be positive.`);
  }
  const Tt = frameBits / bandwidth, a = propagation / Tt;
  const u = Math.min(1, window / (1 + 2 * a));
  return { Tt, a, utilisation: u, optimalWindow: Math.ceil(1 + 2 * a), throughput: u * bandwidth };
}

export const minSeqBits = (W, protocol) => Math.ceil(Math.log2(protocol === "sr" ? 2 * W : W + 1));
export const maxWindow = (bits, protocol) => (protocol === "sr" ? 2 ** (bits - 1) : 2 ** bits - 1);
