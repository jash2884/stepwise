// TCP congestion control, one value of cwnd (in MSS) per transmission round (RTT).
//
// Conventions (stated in the UI):
// - Slow start doubles cwnd each round but never past ssthresh (cwnd = min(2·cwnd, ssthresh)).
// - At or above ssthresh, congestion avoidance adds 1 MSS per round.
// - A loss event in round r changes the window used in round r + 1.
// - On a loss, ssthresh = max(⌊cwnd / 2⌋, 2).
// - Timeout: cwnd = 1 (every variant). Triple duplicate ACK: Tahoe sets cwnd = 1;
//   Reno sets cwnd = ssthresh (or ssthresh + 3 with Kurose's fast-recovery accounting).
// - CUBIC (RFC 9438): on a loss Wmax = cwnd and cwnd = ⌊β·cwnd⌋ with β = 0.7; it
//   then follows W(t) = C(t − K)³ + Wmax with C = 0.4, K = ∛(Wmax(1 − β)/C),
//   t in seconds since the loss and one round = one RTT (an input, 100 ms by
//   default). Slow start before the first loss is the same as Reno's. The
//   "TCP-friendly" region of the RFC is left out to keep the curve visible.
// Every round names the pseudocode lines it ran (`line`) and its variables (`vars`).

export const VARIANTS = {
  tahoe: {
    name: "TCP Tahoe",
    code: [
      "cwnd ← 1; ssthresh ← initial value",
      "every round: send cwnd segments and wait for their ACKs",
      "  if a timeout or 3 duplicate ACKs then",
      "    ssthresh ← max(⌊cwnd / 2⌋, 2); cwnd ← 1  // back to slow start",
      "  else if cwnd < ssthresh then",
      "    cwnd ← min(2 · cwnd, ssthresh)  // slow start",
      "  else cwnd ← cwnd + 1  // congestion avoidance",
    ],
    lines: { timeout: [3, 4], dupack: [3, 4], ss: [5, 6], ca: 7 },
  },
  reno: {
    name: "TCP Reno",
    code: [
      "cwnd ← 1; ssthresh ← initial value",
      "every round: send cwnd segments and wait for their ACKs",
      "  if a timeout then",
      "    ssthresh ← max(⌊cwnd / 2⌋, 2); cwnd ← 1",
      "  else if 3 duplicate ACKs then  // fast retransmit",
      "    ssthresh ← max(⌊cwnd / 2⌋, 2); cwnd ← ssthresh (+3)  // fast recovery",
      "  else if cwnd < ssthresh then",
      "    cwnd ← min(2 · cwnd, ssthresh)  // slow start",
      "  else cwnd ← cwnd + 1  // congestion avoidance",
    ],
    lines: { timeout: [3, 4], dupack: [5, 6], ss: [7, 8], ca: 9 },
  },
  cubic: {
    name: "TCP CUBIC",
    code: [
      "cwnd ← 1; ssthresh ← initial value; β ← 0.7; C ← 0.4",
      "every round: send cwnd segments and wait for their ACKs",
      "  if a timeout then ssthresh ← max(⌊β · cwnd⌋, 2); cwnd ← 1",
      "  else if 3 duplicate ACKs then",
      "    Wmax ← cwnd; cwnd ← max(⌊β · cwnd⌋, 2); t ← 0",
      "    K ← ∛(Wmax · (1 − β) / C)  // time to climb back to Wmax",
      "  else if cwnd < ssthresh then cwnd ← min(2 · cwnd, ssthresh)",
      "  else t ← t + RTT; cwnd ← C · (t − K)³ + Wmax  // the cubic curve",
    ],
    lines: { timeout: 3, dupack: [4, 5, 6], ss: 7, ca: 8 },
  },
};

export function parseEvents(text) {
  const events = [];
  for (const part of String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(?:round\s*)?(\d{1,3})\s*[:=]?\s*(timeout|to|t|3\s*dup(?:licate)?\s*acks?|dup|3dup|d)$/i.exec(part);
    if (!m) throw new Error(`Can't read "${part}". Write events like "8: 3dup" or "14: timeout".`);
    events.push({ round: Number(m[1]), type: /^t/i.test(m[2]) ? "timeout" : "dupack" });
  }
  return events.sort((a, b) => a.round - b.round);
}

const BETA = 0.7, C = 0.4;

export function simulate({ ssthresh = 8, rounds = 20, events = [], variant = "reno", plus3 = false, maxWindow = Infinity, rtt = 0.1 } = {}) {
  if (!VARIANTS[variant]) throw new Error(`Unknown variant ${variant}`);
  if (!Number.isInteger(ssthresh) || ssthresh < 2 || ssthresh > 256) throw new Error("Initial ssthresh must be between 2 and 256 MSS.");
  if (!Number.isInteger(rounds) || rounds < 2 || rounds > 60) throw new Error("Show between 2 and 60 rounds.");
  if (!(rtt > 0 && rtt <= 2)) throw new Error("The RTT must be between 0 and 2 seconds.");
  const V = VARIANTS[variant];
  const at = new Map(events.map((e) => [e.round, e.type]));
  let cwnd = 1, ss = ssthresh;
  let wmax = null, K = null, epoch = 0; // CUBIC state: rounds since the last loss
  const series = [];
  for (let r = 1; r <= rounds; r++) {
    const phase = cwnd < ss ? "slow start" : variant === "cubic" && wmax !== null ? "cubic growth" : "congestion avoidance";
    const point = { round: r, cwnd, ssthresh: ss, phase, event: at.get(r) ?? null };
    series.push(point);
    const ev = at.get(r);
    let kind;
    if (ev && variant === "cubic") {
      kind = ev;
      if (ev === "timeout") {
        const newSs = Math.max(Math.floor(BETA * cwnd), 2);
        point.note = `Round ${r}: a TIMEOUT. CUBIC reacts like Reno: ssthresh = ⌊0.7 × ${cwnd}⌋ = ${newSs}, cwnd = 1 and slow start again.`;
        ss = newSs; cwnd = 1; wmax = null; K = null;
      } else {
        wmax = cwnd;
        const next = Math.max(Math.floor(BETA * cwnd), 2);
        K = Math.cbrt((wmax * (1 - BETA)) / C);
        epoch = 0;
        point.note = `Round ${r}: 3 duplicate ACKs. CUBIC remembers Wmax = ${wmax}, cuts cwnd by 30% to ⌊0.7 × ${cwnd}⌋ = ${next}, and works out K = ∛(${wmax} × 0.3 / 0.4) = ${K.toFixed(2)} s: how long it will take to grow back to Wmax.`;
        ss = next; cwnd = next;
      }
    } else if (ev) {
      kind = ev;
      const newSs = Math.max(Math.floor(cwnd / 2), 2);
      const next = ev === "timeout" || variant === "tahoe" ? 1 : newSs + (plus3 ? 3 : 0);
      point.note = ev === "timeout"
        ? `Round ${r}: a TIMEOUT means nothing is getting through, the worst signal. ssthresh = ⌊${cwnd}/2⌋ = ${newSs}, cwnd drops to 1 and slow start begins again.`
        : variant === "tahoe"
          ? `Round ${r}: 3 duplicate ACKs. Tahoe treats it like a timeout: ssthresh = ⌊${cwnd}/2⌋ = ${newSs}, cwnd = 1.`
          : `Round ${r}: 3 duplicate ACKs, so later segments are still arriving and the network isn't badly congested. Reno retransmits the missing segment at once (fast retransmit), halves the window (ssthresh = ${newSs}, cwnd = ${plus3 ? `${newSs} + 3 = ` : ""}${next}) and carries on in congestion avoidance (fast recovery).`;
      ss = newSs;
      cwnd = next;
    } else if (cwnd < ss) {
      kind = "ss";
      const next = Math.min(cwnd * 2, ss);
      point.note = `Round ${r}: slow start. All ${cwnd} segment${cwnd === 1 ? "" : "s"} are ACKed and each ACK adds 1 MSS, so cwnd ${cwnd} → ${next}${next === ss && cwnd * 2 > ss ? ` (capped at ssthresh ${ss})` : " (it doubles)"}.`;
      cwnd = next;
    } else if (variant === "cubic" && wmax !== null) {
      kind = "ca";
      epoch++;
      const t = epoch * rtt;
      const w = C * (t - K) ** 3 + wmax;
      const next = Math.max(cwnd, Math.round(w));
      point.note = `Round ${r}: t = ${t.toFixed(1)} s since the loss, W(t) = 0.4 × (${t.toFixed(1)} − ${K.toFixed(2)})³ + ${wmax} = ${w.toFixed(1)}, so cwnd ${cwnd} → ${next}. ${t < K ? "Before K the curve is concave: fast at first, then flattening as it nears Wmax." : "Past K the curve is convex: it probes for more bandwidth faster and faster."}`;
      point.cubic = { t, K, wmax, w };
      cwnd = next;
    } else {
      kind = "ca";
      point.note = `Round ${r}: congestion avoidance. cwnd has reached ssthresh, so it grows carefully: ${cwnd} → ${cwnd + 1} (+1 MSS per round).`;
      cwnd += 1;
    }
    cwnd = Math.min(cwnd, maxWindow);
    point.line = V.lines[kind];
    point.vars = { round: r, cwnd: point.cwnd, ssthresh: point.ssthresh, event: point.event ?? "none", "next cwnd": cwnd, "next ssthresh": ss,
      ...(variant === "cubic" && wmax !== null ? { Wmax: wmax, K: Number(K.toFixed(2)) } : {}) };
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

// --- Connection set-up and teardown --------------------------------------------
// The three-way handshake, an optional data exchange and the four-way close.
// Sequence numbers: SYN and FIN each use up one sequence number; data uses one
// per byte. ACK numbers name the next byte expected.
export const HANDSHAKE_CODE = [
  "client: send SYN, seq = x  // CLOSED → SYN_SENT",
  "server: send SYN+ACK, seq = y, ack = x + 1  // LISTEN → SYN_RCVD",
  "client: send ACK, seq = x + 1, ack = y + 1  // → ESTABLISHED",
  "exchange data: seq counts bytes, ack = next byte expected",
  "closer: send FIN  // → FIN_WAIT_1",
  "other side: ACK the FIN  // → CLOSE_WAIT; closer → FIN_WAIT_2",
  "other side: send its own FIN when done  // → LAST_ACK",
  "closer: ACK it, wait 2·MSL  // TIME_WAIT, then CLOSED",
];

export function handshake({ clientIsn = 100, serverIsn = 300, bytes = 0, reply = 0 } = {}) {
  for (const [v, n] of [[clientIsn, "Client ISN"], [serverIsn, "Server ISN"], [bytes, "Client data"], [reply, "Server data"]]) {
    if (!Number.isInteger(v) || v < 0 || v > 4294967295) throw new Error(`${n} must be a whole number from 0 to 2³² − 1.`);
  }
  if (bytes > 100000 || reply > 100000) throw new Error("Keep the data to at most 100,000 bytes each way.");
  const x = clientIsn, y = serverIsn;
  const msgs = [], marks = [];
  let t = 0;
  const st = { client: "CLOSED", server: "LISTEN" };
  const steps = [{ line: null, vars: { client: st.client, server: st.server }, note: `The server is listening (LISTEN); the client is CLOSED. Each side picks a random initial sequence number (ISN): x = ${x} for the client, y = ${y} for the server, so old segments from an earlier connection can't be mistaken for new ones.` }];
  marks.push({ lane: "client", t: 0, text: "CLOSED", step: 0 }, { lane: "server", t: 0, text: "LISTEN", step: 0 });
  const send = (from, flags, seq, ack, line, note, extra = {}) => {
    const step = steps.length;
    msgs.push({ from, to: from === "client" ? "server" : "client", t0: t, t1: t + 1, label: `${flags} seq=${seq}${ack != null ? ` ack=${ack}` : ""}${extra.len ? ` (${extra.len} B)` : ""}`, short: flags, cls: flags.includes("SYN") ? "syn" : flags.includes("FIN") ? "fin" : extra.len ? "data" : "ack", step });
    if (extra.state) for (const [lane, s] of Object.entries(extra.state)) { st[lane] = s; marks.push({ lane, t: lane === from ? t : t + 1, text: s, step }); }
    steps.push({ line, vars: { client: st.client, server: st.server, flags, seq, ack: ack ?? "–", ...extra.vars }, note });
    t += 1;
  };
  send("client", "SYN", x, null, 1, `The client sends a SYN with seq = ${x} and no data. A SYN uses up one sequence number, so the client's next byte will be ${x + 1}.`, { state: { client: "SYN_SENT" } });
  send("server", "SYN+ACK", y, x + 1, 2, `The server allocates buffers and replies SYN+ACK: seq = ${y} (its own ISN) and ack = ${x} + 1 = ${x + 1}, meaning "I got your SYN; send byte ${x + 1} next".`, { state: { server: "SYN_RCVD", client: "ESTABLISHED" } });
  send("client", "ACK", x + 1, y + 1, 3, `The client acknowledges the server's SYN: ack = ${y} + 1 = ${y + 1}. Three segments, and both directions are open; this ACK may already carry data.`, { state: { server: "ESTABLISHED" } });
  let cseq = x + 1, sseq = y + 1;
  if (bytes) {
    send("client", "ACK", cseq, sseq, 4, `The client sends ${bytes} bytes numbered ${cseq}–${cseq + bytes - 1}; the segment's seq is the number of its first byte.`, { len: bytes, vars: { bytes } });
    cseq += bytes;
    send("server", "ACK", sseq, cseq, 4, `The server acknowledges with ack = ${cseq - bytes} + ${bytes} = ${cseq}: the next byte it expects.${reply ? ` It piggybacks ${reply} bytes of its own (${sseq}–${sseq + reply - 1}).` : ""}`, { len: reply, vars: { bytes: reply } });
    sseq += reply;
    if (reply) send("client", "ACK", cseq, sseq, 4, `The client acknowledges the server's data: ack = ${sseq}.`);
  }
  send("client", "FIN", cseq, sseq, 5, `The client has nothing more to send, so it sends FIN with seq = ${cseq}. Like a SYN, a FIN uses up one sequence number.`, { state: { client: "FIN_WAIT_1" } });
  send("server", "ACK", sseq, cseq + 1, 6, `The server acknowledges the FIN (ack = ${cseq + 1}) and tells its application. The connection is now half-closed: the server may still send data.`, { state: { server: "CLOSE_WAIT", client: "FIN_WAIT_2" } });
  send("server", "FIN", sseq, cseq + 1, 7, `When the server's application closes too, the server sends its own FIN, seq = ${sseq}.`, { state: { server: "LAST_ACK" } });
  send("client", "ACK", cseq + 1, sseq + 1, 8, `The client acknowledges it (ack = ${sseq + 1}) and waits in TIME_WAIT for twice the maximum segment lifetime, in case this last ACK is lost and the FIN comes again. The server closes as soon as the ACK arrives.`, { state: { client: "TIME_WAIT", server: "CLOSED" } });
  marks.push({ lane: "client", t: t + 1, text: "2·MSL → CLOSED", step: steps.length - 1 });
  return { msgs, marks, steps, tMax: t + 1, segments: msgs.length };
}
