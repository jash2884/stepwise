import { handshake, HANDSHAKE_CODE, parseEvents, randomScenario, simulate, VARIANTS } from "../engines/congestion.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, reducedMotion, rng, stepper, tabs, writeParams } from "../ui.js";
import { seqDiagram } from "./net.js";

const COMPARE = { tahoe: "reno", reno: "tahoe", cubic: "reno" };

// cwnd per round for the chosen variant (solid) with another variant faint for comparison.
function chart(main, other, upto, names) {
  const W = 640, H = 310, L = 40, R = 16, T = 34, B = 34;
  const n = main.series.length;
  const max = Math.max(...main.series.map((p) => Math.max(p.cwnd, p.ssthresh)), ...other.series.map((p) => p.cwnd)) + 1;
  const x = (r) => L + ((r - 1) / Math.max(n - 1, 1)) * (W - L - R);
  const y = (v) => H - B - (v / max) * (H - T - B);
  const path = (s, k, lim) => s.slice(0, lim).map((p, i) => `${i ? "L" : "M"}${x(p.round)},${y(p[k])}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max * i) / 4));
  const cur = main.series[upto];
  const wmax = cur.vars.Wmax;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "cwnd-chart", role: "img", "aria-label": `${names[0]} congestion window by round: ${main.series.slice(0, upto + 1).map((p) => p.cwnd).join(", ")}` },
    ticks.map((v) => [h("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), h("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, v)]),
    main.series.filter((p) => p.round % (n > 30 ? 5 : n > 15 ? 2 : 1) === 0 || p.round === 1).map((p) => h("text", { x: x(p.round), y: H - B + 16, "text-anchor": "middle" }, p.round)),
    h("text", { x: (W + L) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title" }, "Transmission round"),
    h("text", { x: L - 8, y: T - 14, "text-anchor": "end", class: "axis-title" }, "MSS"),
    wmax ? h("g", { class: "wmax" }, h("line", { x1: L, x2: W - R, y1: y(wmax), y2: y(wmax) }), h("text", { x: L + 6, y: y(wmax) - 5 }, `Wmax = ${wmax}`)) : null,
    h("path", { d: path(other.series, "cwnd", upto + 1), class: "line other" }),
    h("path", { d: main.series.slice(0, upto + 1).map((p, i) => `${i ? "L" : "M"}${x(p.round)},${y(p.ssthresh)}`).join(" "), class: "line ssthresh" }),
    h("path", { d: path(main.series, "cwnd", upto + 1), class: "line main" }),
    main.series.slice(0, upto + 1).map((p) => h("circle", { cx: x(p.round), cy: y(p.cwnd), r: p.event ? 6 : 3.5, class: p.event ? `event ${p.event}` : "pt" }, h("title", null, `Round ${p.round}: cwnd ${p.cwnd}, ssthresh ${p.ssthresh}${p.event ? `, ${p.event === "timeout" ? "timeout" : "3 duplicate ACKs"}` : ""}`))),
    // The current point glides along the curve.
    h("circle", { cx: x(cur.round), cy: y(cur.cwnd), r: 9, class: "now-dot", "data-k": "now", "data-x": x(cur.round), "data-y": y(cur.cwnd) }),
    h("g", { class: "legend" },
      h("line", { x1: W - 330, x2: W - 310, y1: 14, y2: 14, class: "line main" }), h("text", { x: W - 304, y: 18 }, names[0]),
      h("line", { x1: W - 210, x2: W - 190, y1: 14, y2: 14, class: "line other" }), h("text", { x: W - 184, y: 18 }, names[1]),
      h("line", { x1: W - 88, x2: W - 68, y1: 14, y2: 14, class: "line ssthresh" }), h("text", { x: W - 62, y: 18 }, "ssthresh")));
}

// This round's window as a train of segments crossing from sender to receiver.
function pipe(point) {
  const W = 640, H = 64, n = point.cwnd, shown = Math.min(n, 24), gap = 14;
  const lostAt = point.event ? Math.floor(shown / 2) : -1;
  const train = (shown - 1) * gap;
  const from = 70, to = W - 70 - train;
  const segs = Array.from({ length: shown }, (_, i) => {
    const x0 = from - train + i * gap, x1 = to + i * gap, lost = i === lostAt;
    const body = h("rect", { x: -5, y: -9, width: 10, height: 18, rx: 2 });
    if (reducedMotion()) return h("g", { class: `seg-pkt${lost ? " lost" : ""}`, transform: `translate(${lost ? (x0 + x1) / 2 : x1},${H / 2})` }, body);
    const end = lost ? (x0 + x1) / 2 : x1;
    return h("g", { class: `seg-pkt${lost ? " lost" : ""}` }, body, h("animateMotion", { dur: "0.9s", begin: "indefinite", fill: "freeze", path: `M${x0},${H / 2} L${end},${H / 2}`, calcMode: "spline", keyTimes: "0;1", keySplines: "0.4 0 0.2 1" }));
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "pipe", role: "img", "aria-label": `Round ${point.round}: ${n} segments in flight${point.event ? ", one is lost" : ""}` },
    h("defs", null, h("clipPath", { id: "pipe-clip" }, h("rect", { x: 58, y: 0, width: W - 116, height: H }))),
    h("rect", { x: 58, y: H / 2 - 16, width: W - 116, height: 32, rx: 16, class: "pipe-bg" }),
    h("g", { "clip-path": "url(#pipe-clip)" }, segs),
    h("text", { x: 28, y: H / 2 + 4, "text-anchor": "middle", class: "pipe-end" }, "Sender"),
    h("text", { x: W - 28, y: H / 2 + 4, "text-anchor": "middle", class: "pipe-end" }, "Recv."),
    n > shown ? h("text", { x: W / 2, y: 12, "text-anchor": "middle", class: "pipe-more" }, `${n} segments this round (${shown} drawn)`) : h("text", { x: W / 2, y: 12, "text-anchor": "middle", class: "pipe-more" }, `${n} segment${n === 1 ? "" : "s"} this round`));
}

export function render(root) {
  const p = readParams();
  const state = { variant: VARIANTS[p.get("v")] ? p.get("v") : "reno", ss: Number(p.get("ss") ?? 8), rounds: Number(p.get("r") ?? 22), events: p.get("e") ?? "8: 3dup, 16: timeout", plus3: p.get("p3") === "1", rtt: Number(p.get("rtt") ?? 200),
    isn: Number(p.get("x") ?? 100), sisn: Number(p.get("y") ?? 300), bytes: Number(p.get("b") ?? 500), reply: Number(p.get("rb") ?? 0) };
  let player = null, hsPlayer = null;
  const head = page({
    subject: "Computer networks", title: "TCP congestion control",
    lede: "Watch TCP's congestion window grow, hit a loss and back off: slow start, congestion avoidance, Tahoe, Reno and CUBIC round by round, plus the handshake that opens and closes a connection.",
    theory: h("div", null,
      h("p", null, h("b", null, "Slow start"), ": cwnd starts at 1 MSS and doubles every round trip until it reaches the threshold ", h("b", null, "ssthresh"), ". ", h("b", null, "Congestion avoidance"), ": above ssthresh, cwnd grows by just 1 MSS per round (additive increase)."),
      h("p", null, "On a loss, ssthresh becomes half the current window (multiplicative decrease). A ", h("b", null, "timeout"), " is serious: cwnd drops to 1 and slow start begins again. ", h("b", null, "Three duplicate ACKs"), " mean packets are still getting through: ", h("b", null, "Tahoe"), " still drops to 1, but ", h("b", null, "Reno"), " halves the window (fast recovery) and carries on linearly. That's the familiar sawtooth. ", h("b", null, "NewReno"), " behaves like Reno at this level of detail; it only differs when several segments from one window are lost."),
      h("p", null, h("b", null, "CUBIC"), " (Linux's default) cuts the window by 30% on a loss and then follows a cubic curve that heads quickly back towards the window where the loss happened (Wmax), levels off near it, then probes beyond it faster and faster. Its growth depends on time since the loss, not on the RTT, so it's fairer to long-distance connections."),
      h("p", null, "Before any data flows, TCP opens the connection with a ", h("b", null, "three-way handshake"), " (SYN, SYN+ACK, ACK) and closes each direction separately with a FIN and its ACK.")),
    conventions: ["cwnd is shown in MSS, one value per transmission round.", "Slow start never jumps past ssthresh: cwnd = min(2·cwnd, ssthresh).", "A loss in round r changes the window of round r + 1, and ssthresh = max(⌊cwnd/2⌋, 2) for Tahoe and Reno.", "Reno sets cwnd = ssthresh after 3 duplicate ACKs; tick the box for Kurose's ssthresh + 3 accounting.", "CUBIC uses β = 0.7 and C = 0.4 (RFC 9438), rounds cwnd to whole MSS and never lets the curve shrink the window; its TCP-friendly region is left out."],
  });

  const varSel = h("select", { "aria-label": "Variant", onchange: (e) => { state.variant = e.target.value; update(); } }, Object.entries(VARIANTS).map(([id, v]) => h("option", { value: id, selected: id === state.variant }, v.name)));
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const eventsIn = h("input", { type: "text", class: "wide mono", value: state.events, "aria-label": "Loss events", placeholder: "8: 3dup, 16: timeout", oninput: (e) => { state.events = e.target.value; update(); } });
  const plus3 = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.plus3, onchange: (e) => { state.plus3 = e.target.checked; update(); } }), " Reno uses ssthresh + 3 (Kurose)");
  const rttBox = num("rtt", "RTT (ms)", 10, 2000);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ v: state.variant, ss: state.ss, r: state.rounds, e: state.events, p3: state.plus3 ? 1 : 0, rtt: state.rtt, x: state.isn, y: state.sisn, b: state.bytes, rb: state.reply });
    rttBox.hidden = state.variant !== "cubic";
    plus3.hidden = state.variant === "cubic";
    let main, other;
    try {
      const events = parseEvents(state.events);
      const opts = { ssthresh: state.ss, rounds: state.rounds, events, plus3: state.plus3, rtt: state.rtt / 1000 };
      main = simulate({ ...opts, variant: state.variant });
      other = simulate({ ...opts, variant: COMPARE[state.variant] });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const names = [VARIANTS[state.variant].name, VARIANTS[COMPARE[state.variant]].name];
    const stage = h("div", { class: "chart-wrap" }), pipeBox = h("div", { class: "chart-wrap pipe-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(VARIANTS[state.variant].code), vars = varsPanel();
    player = stepper({ count: main.series.length, label: "Round", interval: 900, render: (i) => {
      morph(stage, chart(main, other, i, names));
      const pt = main.series[i];
      morph(pipeBox, pipe(pt));
      code.show(pt.line); vars.show(pt.vars);
      note.textContent = `cwnd = ${pt.cwnd}, ssthresh = ${pt.ssthresh} (${pt.phase}). ${pt.note}`;
      note.className = `step-note${pt.event ? " bad" : ""}`;
    } });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, names[0]), player.el, note, traceLayout(h("div", null, stage, pipeBox), code, vars),
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, `Segments sent in ${state.rounds} rounds`), h("b", null, main.totalSegments)),
          h("div", { class: "stat" }, h("span", null, `${names[1]} for comparison`), h("b", null, other.totalSegments)),
          h("div", { class: "stat" }, h("span", null, "Largest window"), h("b", null, Math.max(...main.series.map((x) => x.cwnd)))))),
      h("section", { class: "card" }, h("h2", null, "Round by round"), h("div", { class: "table-wrap tall" }, h("table", null,
        h("thead", null, h("tr", null, ["Round", "cwnd", "ssthresh", "Phase", "Event"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, main.series.map((x) => h("tr", { class: x.event ? "failed" : null }, h("th", { scope: "row" }, x.round), h("td", null, x.cwnd), h("td", null, x.ssthresh), h("td", null, x.phase), h("td", null, x.event ? (x.event === "timeout" ? "timeout" : "3 dup ACKs") : ""))))))),
      handshakeCard());
  }

  function handshakeCard() {
    hsPlayer?.destroy();
    const box = h("div");
    const field = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); writeParams({ ...Object.fromEntries(readParams()), x: state.isn, y: state.sisn, b: state.bytes, rb: state.reply }); draw(); } }));
    function draw() {
      hsPlayer?.destroy();
      let r;
      try { r = handshake({ clientIsn: state.isn, serverIsn: state.sisn, bytes: state.bytes, reply: state.reply }); } catch (e) { box.replaceChildren(notice("error", e.message)); return; }
      const stage = h("div", { class: "timeline-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
      const code = codePanel(HANDSHAKE_CODE), vars = varsPanel();
      hsPlayer = stepper({ count: r.steps.length, label: "Segment", interval: 1300, render: (i) => {
        morph(stage, seqDiagram({ lanes: [{ id: "client", label: "Client" }, { id: "server", label: "Server" }], msgs: r.msgs, marks: r.marks, current: i, tMax: r.tMax, laneGap: 260, margin: 110, rowH: 36, aria: "TCP connection set-up and teardown" }));
        code.show(r.steps[i].line); vars.show(r.steps[i].vars);
        note.textContent = r.steps[i].note;
      } });
      box.replaceChildren(hsPlayer.el, note, traceLayout(stage, code, vars),
        h("p", { class: "muted small" }, `${r.segments} segments in all: 3 to open, ${r.segments - 7} carrying data or ACKs, and 4 to close. SYN and FIN each consume one sequence number even though they carry no data.`));
    }
    draw();
    return h("section", { class: "card" }, h("h2", null, "Opening and closing a connection"),
      h("div", { class: "row" }, field("isn", "Client ISN", 0, 4294967295), field("sisn", "Server ISN", 0, 4294967295), field("bytes", "Client sends (bytes)", 0, 100000), field("reply", "Server replies (bytes)", 0, 100000)), box);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, varSel, num("ss", "Initial ssthresh", 2, 256), num("rounds", "Rounds", 2, 60), plus3, rttBox),
      h("label", { class: "stack" }, "Loss events (round: timeout or 3dup)", eventsIn),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const s = randomScenario();
          player?.destroy(); hsPlayer?.destroy();
          writeParams({ v: s.variant, ss: s.ssthresh, r: state.rounds, e: s.events.map((e) => `${e.round}: ${e.type === "timeout" ? "timeout" : "3dup"}`).join(", "), p3: state.plus3 ? 1 : 0 });
          render(root);
        } }, "Random scenario"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); hsPlayer?.destroy(); history.replaceState(null, "", `${location.pathname}?v=tahoe&ss=8&r=15&e=8%3A+3dup&p3=1`); render(root); } }, "Kurose's figure"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); hsPlayer?.destroy(); history.replaceState(null, "", `${location.pathname}?v=cubic&ss=64&r=40&e=8%3A+3dup&rtt=200`); render(root); } }, "CUBIC curve"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r0 = rng();
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    const top = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    if (r0() < 0.3) {
      const x = 100 + Math.floor(r0() * 9000), y = 100 + Math.floor(r0() * 9000), bytes = [200, 500, 1000, 1460][Math.floor(r0() * 4)];
      const hs = handshake({ clientIsn: x, serverIsn: y, bytes });
      const fin = hs.msgs.find((m) => m.short === "FIN");
      const ackIn = h("input", { type: "number", "aria-label": "Acknowledgement number" }), finIn = h("input", { type: "number", "aria-label": "FIN sequence number" });
      practice.replaceChildren(h("section", { class: "card" }, top,
        h("h2", null, "Handshake numbers"),
        h("p", null, `A client with ISN ${x} connects to a server with ISN ${y}, then sends ${bytes} bytes of data and closes.`),
        h("div", { class: "qa" }, h("label", null, "ack number in the server's SYN+ACK", ackIn), h("label", null, "seq number of the client's FIN", finIn)),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          const finSeq = Number(/seq=(\d+)/.exec(fin.label)[1]);
          const a = Number(ackIn.value) === x + 1 && ackIn.value !== "", b = Number(finIn.value) === finSeq && finIn.value !== "";
          mark(ackIn, a, x + 1); mark(finIn, b, finSeq);
          feedback.replaceChildren(notice(a && b ? "good" : "info", `The SYN uses up sequence number ${x}, so the server acks ${x + 1}. Data bytes are ${x + 1}–${x + bytes}, so the FIN carries seq = ${x + 1} + ${bytes} = ${finSeq}.`));
        } }, "Check")), feedback));
      return;
    }
    const s = randomScenario(r0);
    const r = simulate({ ssthresh: s.ssthresh, rounds: 30, events: s.events, variant: s.variant });
    const ev = s.events[0];
    const askRound = ev.round + 2 + Math.floor(r0() * 4);
    const cwIn = h("input", { type: "number", "aria-label": `cwnd in round ${askRound}` }), ssIn = h("input", { type: "number", "aria-label": "ssthresh after the loss" });
    const truthCw = r.series[askRound - 1].cwnd, truthSs = r.series[ev.round].ssthresh;
    practice.replaceChildren(h("section", { class: "card" }, top,
      h("h2", null, VARIANTS[s.variant].name),
      h("p", null, `cwnd starts at 1 MSS with ssthresh = ${s.ssthresh}. In round ${ev.round} there ${ev.type === "timeout" ? "is a timeout" : "are 3 duplicate ACKs"}${s.events[1] && s.events[1].round < askRound ? `, and in round ${s.events[1].round} ${s.events[1].type === "timeout" ? "a timeout" : "3 duplicate ACKs"}` : ""}.`),
      h("div", { class: "qa" }, h("label", null, `ssthresh right after the round-${ev.round} loss`, ssIn), h("label", null, `cwnd in round ${askRound}`, cwIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const okC = cwIn.value !== "" && Number(cwIn.value) === truthCw, okS = ssIn.value !== "" && Number(ssIn.value) === truthSs;
        mark(cwIn, okC, truthCw); mark(ssIn, okS, truthSs);
        feedback.replaceChildren(notice(okC && okS ? "good" : "info", `Windows by round: ${r.series.slice(0, askRound).map((x) => x.cwnd).join(", ")}.`));
      } }, "Check")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => { player?.destroy(); hsPlayer?.destroy(); };
}
