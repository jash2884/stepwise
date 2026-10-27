// Medium access control: pure and slotted ALOHA, CSMA/CD with binary
// exponential backoff, and CSMA/CA (802.11) with RTS/CTS.
//
// Conventions (stated in the UI):
// - Time is measured in frame times (ALOHA) or contention slots (CSMA/CD).
// - ALOHA: each station starts a new frame in each frame time with probability
//   G / N, so the offered load is G frames per frame time. Retransmissions are
//   folded into G, as in the throughput derivation. Pure ALOHA frames start at any
//   hundredth of a frame time; slotted ALOHA frames start on slot boundaries.
// - CSMA/CD: 1-persistent; stations that start in the same slot collide, detect
//   it within that slot and jam; after the n-th collision a station waits k
//   slots, k random from 0 … 2^min(n,10) − 1, and gives up after 16 attempts.
// - CSMA/CA: times in slots with DIFS = 3, SIFS = 1, RTS = 2, CTS = 2, DATA = 8,
//   ACK = 2 (illustrative); every station hears every other one.

// A small seeded generator, so a scenario can be replayed exactly.
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- ALOHA -------------------------------------------------------------------------
export const throughput = (G, mode) => (mode === "pure" ? G * Math.exp(-2 * G) : G * Math.exp(-G));
export const peak = (mode) => (mode === "pure" ? { G: 0.5, S: 1 / (2 * Math.E) } : { G: 1, S: 1 / Math.E });

export const ALOHA_CODE = {
  pure: [
    "when a station has a frame: send it at once",
    "the frame is safe only if no other frame starts",
    "  within one frame time before or after it  // vulnerable period 2T",
    "if nothing overlaps then success",
    "else collision: every overlapping frame is lost",
    "  // lost frames are retried later; that traffic is part of G",
  ],
  slotted: [
    "when a station has a frame: wait for the next slot boundary",
    "send it at the start of the slot",
    "  only frames in the same slot can collide  // vulnerable period T",
    "if it's alone in its slot then success",
    "else collision: every frame in the slot is lost",
    "  // lost frames are retried later; that traffic is part of G",
  ],
};

export function aloha({ mode = "slotted", stations = 5, G = 1, slots = 12, seed = 1 } = {}) {
  if (!ALOHA_CODE[mode]) throw new Error(`Unknown ALOHA mode ${mode}`);
  if (!Number.isInteger(stations) || stations < 1 || stations > 26) throw new Error("Use 1 to 26 stations.");
  if (!(G >= 0 && G <= stations)) throw new Error(`G must be between 0 and the number of stations (${stations}).`);
  if (!Number.isInteger(slots) || slots < 1 || slots > 100000) throw new Error("Simulate 1 to 100,000 frame times.");
  const r = seeded(seed), names = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, stations).split("");
  const frames = [];
  for (let t = 0; t < slots; t++) for (const s of names) if (r() < G / stations) {
    const start = mode === "slotted" ? t : t + Math.floor(r() * 100) / 100;
    frames.push({ id: frames.length, station: s, start, end: start + 1 });
  }
  frames.sort((a, b) => a.start - b.start || (a.station < b.station ? -1 : 1));
  for (const f of frames) {
    f.hits = frames.filter((o) => o !== f && Math.abs(o.start - f.start) < 1).map((o) => o.id);
    f.ok = f.hits.length === 0;
  }
  const steps = [];
  let ok = 0, lost = 0;
  const detailed = slots <= 200;
  for (let t = 0; t < slots && detailed; t++) {
    const now = frames.filter((f) => f.start >= t && f.start < t + 1);
    for (const f of now) f.ok ? ok++ : lost++;
    const vars = { t, sending: now.map((f) => f.station), successes: ok, "lost frames": lost, "S so far": ok / (t + 1) };
    let note, line;
    if (!now.length) { note = `${mode === "slotted" ? "Slot" : "Frame time"} ${t}: nobody sends, so the channel is idle and this time is wasted.`; line = null; }
    else if (mode === "slotted") {
      line = now.length === 1 ? [1, 2, 4] : [1, 2, 3, 5];
      note = now.length === 1 ? `Slot ${t}: only ${now[0].station} sends, so its frame gets through.` : `Slot ${t}: ${now.map((f) => f.station).join(" and ")} ${now.length === 2 ? "both" : "all"} send at the start of the slot, so their frames collide and ${now.length === 2 ? "both" : "all"} are lost.`;
    } else {
      line = now.every((f) => f.ok) ? [1, 2, 4] : [1, 2, 3, 5];
      note = now.map((f) => f.ok
        ? `${f.station} sends at ${f.start.toFixed(2)} and no other frame starts within one frame time of it, so it gets through.`
        : `${f.station} sends at ${f.start.toFixed(2)} but ${f.hits.map((id) => frames.find((x) => x.id === id)).map((o) => `${o.station}'s frame (${o.start.toFixed(2)}–${o.end.toFixed(2)})`).join(" and ")} overlaps it, so it is lost.`).join(" ");
    }
    steps.push({ t, upto: t + 1, line, vars, note });
  }
  const successes = frames.filter((f) => f.ok).length;
  return { mode, names, frames, steps, successes, collided: frames.length - successes, S: successes / slots, offered: frames.length / slots };
}

// --- CSMA/CD with binary exponential backoff ------------------------------------------
export const CSMACD_CODE = [
  "n ← 0  // collisions so far for this frame",
  "sense the bus; wait while it's busy  // 1-persistent",
  "transmit, listening while you do",
  "if no collision then done: the frame got through",
  "else send a jam signal; n ← n + 1",
  "  if n = 16 then give up and report an error",
  "  k ← random number from 0 … 2^min(n, 10) − 1",
  "  wait k slot times, then go back to line 2",
];

export function parseStations(text) {
  const out = [];
  for (const part of String(text).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([A-Za-z])\s*[:=@]?\s*(\d{1,2})$/.exec(part);
    if (!m) throw new Error(`Can't read "${part}". Write stations like "A 0, B 0, C 3" (name and the slot its frame is ready).`);
    const name = m[1].toUpperCase();
    if (out.some((s) => s.name === name)) throw new Error(`Station ${name} is listed twice.`);
    out.push({ name, ready: Number(m[2]) });
  }
  if (!out.length) throw new Error("List at least one station.");
  if (out.length > 6) throw new Error("Use at most 6 stations.");
  return out;
}

export function csmacd({ stations, frameSlots = 3, seed = 7, maxSlots = 120, pick = null } = {}) {
  if (!Number.isInteger(frameSlots) || frameSlots < 1 || frameSlots > 8) throw new Error("A frame lasts 1 to 8 slots.");
  const r = seeded(seed);
  const choose = pick ?? ((n) => Math.floor(r() * 2 ** Math.min(n, 10)));
  const st = stations.map((s) => ({ name: s.name, ready: s.ready, n: 0, state: "idle", k: null, doneAt: null, history: [] }));
  let busyUntil = 0, owner = null;
  const steps = [], cells = Object.fromEntries(st.map((s) => [s.name, []]));
  let collisions = 0;
  for (let t = 0; t < maxSlots && st.some((s) => s.state !== "done" && s.state !== "gave up"); t++) {
    const busy = t < busyUntil;
    const want = st.filter((s) => (s.state === "idle" || s.state === "waiting" || s.state === "backoff") && s.ready <= t);
    const notes = [], lines = new Set(), picks = {};
    if (busy) {
      for (const s of want) { s.state = "waiting"; lines.add(2); }
      notes.push(`${owner} is still sending (slot ${t - (busyUntil - frameSlots) + 1} of ${frameSlots}).${want.length ? ` ${want.map((s) => s.name).join(", ")} sense${want.length === 1 ? "s" : ""} the bus busy and wait${want.length === 1 ? "s" : ""}.` : ""}`);
      lines.add(3);
    } else if (want.length === 1) {
      const s = want[0];
      s.state = "sending"; owner = s.name; busyUntil = t + frameSlots; s.doneAt = t + frameSlots - 1;
      lines.add(2); lines.add(3); lines.add(4);
      notes.push(`${s.name} senses the bus idle and starts sending. Nobody else starts in this slot, so after one slot every station has heard it and it owns the bus: no collision is possible now. Its frame takes ${frameSlots} slot${frameSlots === 1 ? "" : "s"}.`);
    } else if (want.length > 1) {
      collisions++;
      lines.add(2); lines.add(3); lines.add(5); lines.add(7); lines.add(8);
      const parts = [];
      for (const s of want) {
        s.n++;
        if (s.n >= 16) { s.state = "gave up"; lines.add(6); parts.push(`${s.name} has collided 16 times and gives up`); continue; }
        s.k = choose(s.n, s.name); picks[s.name] = s.k;
        s.state = "backoff"; s.ready = t + 1 + s.k;
        parts.push(`${s.name} (collision ${s.n}) picks k = ${s.k} from 0–${2 ** Math.min(s.n, 10) - 1}, so it waits ${s.k} slot${s.k === 1 ? "" : "s"} and tries again in slot ${s.ready}`);
      }
      notes.push(`${want.map((s) => s.name).join(" and ")} all sense the bus idle and start in the same slot: COLLISION. Each hears the other, stops, and sends a jam signal so everyone notices. ${parts.join("; ")}.`);
      for (const s of want) cells[s.name][t] = "collide";
    } else notes.push(`Slot ${t}: the bus is idle and nobody is ready to send.`);
    for (const s of st) {
      if (cells[s.name][t]) continue;
      cells[s.name][t] = s.state === "sending" ? "tx" : s.state === "waiting" ? "wait" : s.state === "backoff" && s.ready > t ? "backoff" : s.state === "done" ? "done" : s.state === "gave up" ? "gave up" : "";
    }
    // Frames that finish at the end of this slot.
    for (const s of st) if (s.state === "sending" && s.doneAt === t) { s.state = "done"; notes.push(`${s.name}'s frame is complete: success after ${s.n} collision${s.n === 1 ? "" : "s"}.`); }
    const vars = Object.fromEntries(st.flatMap((s) => [[`${s.name}`, s.state === "backoff" ? `backoff k=${s.k}, n=${s.n}` : s.state === "sending" || s.state === "done" ? `${s.state} (n=${s.n})` : s.state]]));
    steps.push({ t, line: [...lines].sort((a, b) => a - b), vars: { slot: t, bus: busy || st.some((s) => s.state === "sending") ? `busy (${owner})` : want.length > 1 ? "collision" : "idle", ...vars }, note: notes.join(" "),
      picks, sending: st.filter((s) => cells[s.name][t] === "tx").map((s) => s.name), colliding: st.filter((s) => cells[s.name][t] === "collide").map((s) => s.name) });
  }
  return { steps, cells, stations: st.map((s) => ({ name: s.name, collisions: s.n, state: s.state, doneAt: s.doneAt })), collisions, slots: steps.length };
}

// Minimum frame size so a sender is still transmitting when news of a
// collision at the far end gets back: L ≥ 2 × propagation delay × bandwidth.
export function minFrame({ bandwidth, distance = null, speed = 2e8, propagation = null }) {
  const tp = propagation ?? distance / speed;
  if (!(bandwidth > 0) || !(tp > 0)) throw new Error("Bandwidth and the propagation delay (or distance) must be positive.");
  const bits = 2 * tp * bandwidth;
  return { tp, bits, bytes: bits / 8, slot: 2 * tp };
}

// --- CSMA/CA (802.11 DCF) ------------------------------------------------------------
export const CSMACA_CODE = [
  "wait until the channel has been idle for DIFS",
  "count the backoff counter down one per idle slot",
  "  freeze the counter whenever the channel is busy",
  "when it reaches 0: send RTS; the AP answers CTS after SIFS",
  "everyone else hearing RTS or CTS sets its NAV and stays quiet",
  "send DATA; the AP answers ACK after SIFS",
  "no CTS (or no ACK) means a collision: CW ← 2·CW, pick a new backoff",
];

export const CA_TIMES = { DIFS: 3, SIFS: 1, RTS: 2, CTS: 2, DATA: 8, ACK: 2 };

export function csmaca({ backoffs = { A: 3, C: 5 }, rtscts = true, seed = 3, cw = 8 } = {}) {
  const T = CA_TIMES, r = seeded(seed);
  const names = Object.keys(backoffs);
  for (const n of names) if (!Number.isInteger(backoffs[n]) || backoffs[n] < 0 || backoffs[n] >= cw) throw new Error(`Backoffs are whole numbers from 0 to CW − 1 = ${cw - 1}.`);
  const rem = { ...backoffs }, CW = Object.fromEntries(names.map((n) => [n, cw]));
  const bars = [], msgs = [], steps = [];
  let t = 0;
  const pending = new Set(names);
  const snap = (line, note, extra = {}) => steps.push({ t, line, note, bars: bars.length, msgs: msgs.length, vars: { t, ...Object.fromEntries(names.map((n) => [`${n} backoff`, pending.has(n) ? rem[n] : "sent"])), ...Object.fromEntries(names.map((n) => [`CW ${n}`, CW[n]])), ...extra } });
  snap(null, `${names.join(" and ")} each have a frame for the access point (AP). The channel has just gone idle. Backoffs: ${names.map((n) => `${n} = ${rem[n]}`).join(", ")} slots.`);
  for (let guard = 0; pending.size && guard < 20; guard++) {
    const list = [...pending];
    for (const n of list) bars.push({ lane: n, t0: t, t1: t + T.DIFS, kind: "difs", text: "DIFS" });
    t += T.DIFS;
    snap(1, `Everyone waiting senses the channel idle for a DIFS (${T.DIFS} slots) before counting down. DIFS is longer than SIFS, so replies like CTS and ACK always get in first.`);
    const m = Math.min(...list.map((n) => rem[n]));
    for (const n of list) bars.push({ lane: n, t0: t, t1: t + m, kind: "backoff", text: m ? `${rem[n]}→${rem[n] - m}` : "" });
    for (const n of list) rem[n] -= m;
    t += m;
    const winners = list.filter((n) => rem[n] === 0);
    snap([2, 3], m ? `The counters tick down together for ${m} slot${m === 1 ? "" : "s"}. ${winners.join(" and ")} reach${winners.length === 1 ? "es" : ""} 0 first${list.length > winners.length ? `; ${list.filter((n) => rem[n] > 0).map((n) => `${n} freezes at ${rem[n]}`).join(", ")} and will resume from there instead of starting again` : ""}.` : `${winners.join(" and ")} already have a backoff of 0.`);
    const first = rtscts ? "RTS" : "DATA";
    if (winners.length > 1) {
      for (const n of winners) { bars.push({ lane: n, t0: t, t1: t + T[first], kind: "collide", text: first }); msgs.push({ from: n, to: "AP", t0: t, t1: t + T[first], label: `${first} ✗`, cls: "collide", step: steps.length }); }
      t += T[first];
      const wait = T.SIFS + (rtscts ? T.CTS : T.ACK);
      bars.push({ lane: "AP", t0: t - T[first], t1: t, kind: "collide", text: "garbled" });
      t += wait;
      for (const n of winners) { CW[n] *= 2; rem[n] = Math.floor(r() * CW[n]); }
      snap([4, 7], `${winners.join(" and ")} both send ${first} at the same moment: they collide at the AP, which hears only noise and so sends no ${rtscts ? "CTS" : "ACK"}. After waiting ${wait} slots for it, each doubles its contention window and picks a new backoff: ${winners.map((n) => `${n}: CW = ${CW[n]}, backoff ${rem[n]}`).join("; ")}.${rtscts ? " Only the short RTS frames were wasted, not a whole data frame." : ""}`);
      continue;
    }
    const w = winners[0], others = list.filter((n) => n !== w);
    const exch = rtscts ? [["RTS", w, "AP"], ["CTS", "AP", "all"], ["DATA", w, "AP"], ["ACK", "AP", w]] : [["DATA", w, "AP"], ["ACK", "AP", w]];
    const end = t + exch.reduce((s, [k]) => s + T[k], 0) + (exch.length - 1) * T.SIFS;
    exch.forEach(([kind, from, to], i) => {
      bars.push({ lane: from, t0: t, t1: t + T[kind], kind: kind.toLowerCase(), text: kind });
      msgs.push({ from, to: to === "all" ? w : to, t0: t, t1: t + T[kind], label: kind, cls: kind.toLowerCase(), step: steps.length });
      const navFrom = kind === "RTS" || (!rtscts && kind === "DATA") || kind === "CTS";
      if (navFrom && others.length && (kind !== "CTS" || true)) for (const n of others) if (!bars.some((b) => b.lane === n && b.kind === "nav")) bars.push({ lane: n, t0: t + T[kind], t1: end, kind: "nav", text: "NAV" });
      t += T[kind];
      const lineOf = { RTS: [4], CTS: [4, 5], DATA: rtscts ? [6] : [4, 5, 6], ACK: [6] }[kind];
      const notes = {
        RTS: `${w}'s counter reaches 0, so it sends a short Request To Send. The RTS says how long the whole exchange will take (until slot ${end}).`,
        CTS: `After a SIFS the AP replies Clear To Send. Every station that hears the RTS or the CTS sets its NAV (network allocation vector) to the end of the exchange and keeps quiet${others.length ? `: ${others.join(", ")} won't even sense the channel until slot ${end}` : ""}. A station hidden from ${w} still hears the AP's CTS, which is how RTS/CTS beats the hidden-terminal problem.`,
        DATA: `${rtscts ? "After a SIFS" : `${w}'s counter reaches 0, so`} ${w} sends its DATA frame.${!rtscts && others.length ? ` Its duration field sets the NAV of ${others.join(", ")}.` : ""}`,
        ACK: `The AP checks the frame and, after a SIFS, sends an ACK. Wireless stations can't detect collisions while sending, so the ACK is the only proof the frame arrived.`,
      };
      snap(lineOf, notes[kind], { sending: `${kind} (${from} → ${to === "all" ? "everyone" : to})`, NAV: others.length && kind !== "RTS" ? `until ${end}` : "–" });
      if (i < exch.length - 1) t += T.SIFS;
    });
    pending.delete(w);
    if (pending.size) snap(1, `${w}'s exchange is over. ${[...pending].join(", ")} still ${pending.size === 1 ? "has" : "have"} frames, so the contention starts again with the frozen counters.`);
  }
  snap(null, `All frames delivered by slot ${t}.`, { done: true });
  return { names, bars, msgs, steps, end: t };
}
