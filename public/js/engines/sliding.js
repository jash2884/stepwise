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

export const PROTOCOLS = {
  sw: { name: "Stop-and-Wait", window: false },
  gbn: { name: "Go-Back-N", window: true },
  sr: { name: "Selective Repeat", window: true },
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

  for (let t = 0; t < 400 && done === null; t++) {
    const notes = [];
    // 1. ACKs reaching the sender.
    for (const s of inFlight.filter((x) => x.arrive === t && x.kind === "A")) {
      if (s.lost) { notes.push(`ACK ${s.n} was lost on the way back.`); continue; }
      if (protocol === "sr") {
        if (!acked.has(s.n)) { acked.add(s.n); notes.push(`Sender gets ACK ${s.n}.`); }
        while (acked.has(base)) base++;
      } else if (s.n >= base) {
        base = s.n + 1;
        timerStart = base < next ? t : null;
        notes.push(`Sender gets ACK ${s.n}: frames up to ${s.n} are confirmed, window slides to start at ${base}.`);
      } else notes.push(`Sender gets a duplicate ACK ${s.n} and ignores it.`);
    }
    if (base >= frames) { done = t; ticks.push({ t, base, next, expected, buffer: [...buffer], acked: [...acked], notes: [...notes, `All ${frames} frames are acknowledged.`] }); break; }

    // 2. Frames reaching the receiver.
    for (const s of inFlight.filter((x) => x.arrive === t && x.kind === "F")) {
      if (s.lost) { notes.push(`Frame ${s.n} was lost on the way.`); continue; }
      if (protocol === "sr") {
        if (s.n >= expected && s.n < expected + W) {
          buffer.add(s.n);
          const before = expected;
          while (buffer.has(expected)) { delivered.push(expected); buffer.delete(expected); expected++; }
          s.result = expected > before ? "delivered" : "buffered";
          notes.push(expected > before ? `Receiver gets frame ${s.n} and delivers ${before === expected - 1 ? before : `${before}–${expected - 1}`} in order; sends ACK ${s.n}.` : `Receiver buffers out-of-order frame ${s.n} (waiting for ${expected}); sends ACK ${s.n}.`);
          send(t, "A", s.n);
        } else if (s.n < expected) {
          s.result = "duplicate";
          notes.push(`Receiver already has frame ${s.n} (its ACK must have been lost); sends ACK ${s.n} again.`);
          send(t, "A", s.n);
        }
      } else if (s.n === expected) {
        delivered.push(expected);
        expected++;
        s.result = "delivered";
        notes.push(`Receiver gets frame ${s.n} in order, delivers it and sends ACK ${s.n}.`);
        send(t, "A", s.n);
      } else {
        s.result = "discarded";
        notes.push(`Receiver expected frame ${expected} but got ${s.n}: discards it${expected > 0 ? ` and repeats ACK ${expected - 1}` : ""}.`);
        if (expected > 0) send(t, "A", expected - 1);
      }
    }

    // 3. Timeouts.
    if (protocol === "sr") {
      for (let k = base; k < next; k++) {
        if (!acked.has(k) && t - sentAt.get(k) >= T && !retransmit.includes(k)) { retransmit.push(k); notes.push(`Timer for frame ${k} expires: resend frame ${k} only.`); }
      }
    } else if (timerStart !== null && t - timerStart >= T && base < next) {
      notes.push(`Timer expires for frame ${base}: go back and resend frames ${base}${next - 1 > base ? `–${next - 1}` : ""}.`);
      next = base;
      timerStart = null;
    }

    // 4. Send at most one frame this tick.
    if (protocol === "sr" && retransmit.length) {
      const k = retransmit.shift();
      sentAt.set(k, t);
      const s = send(t, "F", k);
      notes.push(`Sender resends frame ${k}${s.lost ? " (lost again)" : ""}.`);
    } else if (next < Math.min(base + W, frames)) {
      const k = next++;
      const again = (attempts.get(k) ?? 0) > 0;
      sentAt.set(k, t);
      const s = send(t, "F", k);
      if (timerStart === null && protocol !== "sr") timerStart = t;
      notes.push(`Sender ${again ? "resends" : "sends"} frame ${k}${s.lost ? " (it will be lost)" : ""}.`);
    } else if (base < frames && next >= Math.min(base + W, frames)) {
      notes.push(`Window [${base}–${base + W - 1}] is full: sender waits.`);
    }
    ticks.push({ t, base, next, expected, buffer: [...buffer], acked: [...acked], notes });
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
