import { efficiency, maxWindow, minSeqBits, parseLosses, PROTOCOLS, simulate } from "../engines/sliding.js";
import { copyLink, fmt, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// The textbook timeline: sender on the left, receiver on the right, time going down.
function timeline(r, upto) {
  const W = 460, SX = 90, RX = 370, top = 34, row = 34;
  const H = top + (r.done + 2) * row;
  const y = (t) => top + t * row;
  const visible = r.sends.filter((s) => s.sent <= upto);
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "timeline", role: "img", "aria-label": `Timeline up to tick ${upto}: ${visible.map((s) => `${s.kind === "F" ? "frame" : "ACK"} ${s.n}${s.lost ? " lost" : ""}`).join(", ")}` },
    h("defs", null, h("marker", { id: "tl-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z" }))),
    h("text", { x: SX, y: 18, "text-anchor": "middle", class: "lane-label" }, "Sender"),
    h("text", { x: RX, y: 18, "text-anchor": "middle", class: "lane-label" }, "Receiver"),
    h("line", { x1: SX, y1: top - 6, x2: SX, y2: H - 6, class: "lane" }),
    h("line", { x1: RX, y1: top - 6, x2: RX, y2: H - 6, class: "lane" }),
    Array.from({ length: r.done + 1 }, (_, t) => h("text", { x: 14, y: y(t) + 4, class: `tick${t === upto ? " now" : ""}` }, `t${t}`)),
    h("line", { x1: 26, y1: y(upto), x2: W - 10, y2: y(upto), class: "now-line" }),
    visible.map((s) => {
      const fromX = s.kind === "F" ? SX : RX, toX = s.kind === "F" ? RX : SX;
      const y1 = y(s.sent), y2 = y(s.arrive);
      const label = `${s.kind === "F" ? "F" : "ACK "}${s.n}${s.attempt > 1 ? "′".repeat(Math.min(s.attempt - 1, 2)) : ""}`;
      const cls = `msg ${s.kind === "F" ? "frame" : "ack"}${s.lost ? " lost" : ""}${s.result === "discarded" ? " discarded" : ""}${s.arrive > upto ? " flying" : ""}`;
      // Label each arrow near where it starts, so a frame and an ACK crossing
      // mid-link never put their labels on top of each other.
      const at = (k) => ({ x: fromX + (toX - fromX) * k, y: y1 + (y2 - y1) * k });
      const lab = at(0.22);
      if (s.lost) {
        const m = at(0.5);
        return h("g", { class: cls }, h("line", { x1: fromX, y1, x2: m.x, y2: m.y }), h("text", { x: m.x, y: m.y + 5, "text-anchor": "middle", class: "cross" }, "✗"), h("text", { x: lab.x, y: lab.y - 5, "text-anchor": "middle", class: "msg-label" }, label));
      }
      return h("g", { class: cls }, h("line", { x1: fromX, y1, x2: toX, y2: y2, "marker-end": "url(#tl-arrow)" }),
        h("text", { x: lab.x, y: lab.y - 5, "text-anchor": "middle", class: "msg-label" }, label),
        s.result && s.kind === "F" && s.arrive <= upto ? h("text", { x: toX + 8, y: y2 + 4, class: "result-label" }, s.result) : null);
    }));
}

function windows(r, tick) {
  return h("div", { class: "win-rows" },
    h("div", { class: "win-row" }, h("span", { class: "win-label" }, "Sender"), Array.from({ length: r.frames }, (_, k) => {
      const acked = r.protocol === "sr" ? tick.acked.includes(k) || k < tick.base : k < tick.base;
      const inWin = k >= tick.base && k < tick.base + r.W;
      const sent = k < tick.next || (r.protocol === "sr" && r.sends.some((s) => s.kind === "F" && s.n === k && s.sent <= tick.t));
      return h("i", { class: acked ? "acked" : inWin ? (sent ? "sent" : "usable") : "out", title: `Frame ${k}` }, k);
    })),
    h("div", { class: "win-row" }, h("span", { class: "win-label" }, "Receiver"), Array.from({ length: r.frames }, (_, k) => h("i", {
      class: k < tick.expected ? "acked" : tick.buffer.includes(k) ? "sent" : k < tick.expected + (r.protocol === "sr" ? r.W : 1) ? "usable" : "out",
    }, k))),
    h("p", { class: "muted small" }, h("span", { class: "key acked" }, "■ acknowledged / delivered"), " ", h("span", { class: "key sent" }, "■ sent, not yet ACKed / buffered"), " ", h("span", { class: "key usable" }, "□ inside the window"), " ", h("span", { class: "key out" }, "■ outside")));
}

export function render(root) {
  const p = readParams();
  const state = {
    protocol: PROTOCOLS[p.get("p")] ? p.get("p") : "gbn",
    frames: Number(p.get("n") ?? 6), window: Number(p.get("w") ?? 4), delay: Number(p.get("d") ?? 1),
    timeout: p.get("to") ? Number(p.get("to")) : null, losses: p.get("loss") ?? "F2", every: Number(p.get("k") ?? 0),
  };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "Sliding window protocols",
    lede: "Stop-and-Wait, Go-Back-N and Selective Repeat on a timeline: lose a frame or an ACK and watch how each protocol recovers, and what it costs.",
    theory: h("div", null,
      h("p", null, h("b", null, "Stop-and-Wait"), " sends one frame and waits for its ACK. Simple, but the link sits idle for a whole round trip. ", h("b", null, "Sliding window"), " protocols keep up to W frames in flight."),
      h("ul", null,
        h("li", null, h("b", null, "Go-Back-N"), ": the receiver only accepts frames in order, so after a loss the sender resends that frame ", h("i", null, "and everything after it"), ". Needs W ≤ 2ᵐ − 1 for m-bit sequence numbers."),
        h("li", null, h("b", null, "Selective Repeat"), ": the receiver buffers out-of-order frames, so only the lost frame is resent. Needs W ≤ 2ᵐ⁻¹.")),
      h("p", null, "Utilisation = W / (1 + 2a), where a = propagation delay ÷ transmission time (capped at 100%).")),
    conventions: ["One frame enters the link per tick; a frame sent at tick t arrives at t + d; ACKs are sent immediately.", "Frames are numbered 0, 1, 2, … without wrap-around so they're easy to follow.", "Go-Back-N uses cumulative ACKs (ACK k = everything up to k arrived) and one timer; Selective Repeat ACKs each frame and times each frame.", "Losses: F3 loses frame 3's first transmission, F3#2 its second, A2 the first ACK 2."],
  });

  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key] ?? "", placeholder: key === "timeout" ? "auto" : null, "aria-label": label, onchange: (e) => { state[key] = e.target.value === "" ? null : Number(e.target.value); update(); } }));
  const protoSel = h("select", { "aria-label": "Protocol", onchange: (e) => { state.protocol = e.target.value; update(); } }, Object.entries(PROTOCOLS).map(([id, x]) => h("option", { value: id, selected: id === state.protocol }, x.name)));
  const winBox = num("window", "Window", 1, 8);
  const lossIn = h("input", { type: "text", class: "mono", value: state.losses, "aria-label": "Lost transmissions", placeholder: "e.g. F2 A4", oninput: (e) => { state.losses = e.target.value; update(); } });
  const everySel = h("select", { "aria-label": "Periodic loss", onchange: (e) => { state.every = Number(e.target.value); update(); } },
    [[0, "no periodic loss"], [3, "lose every 3rd frame sent"], [4, "lose every 4th frame sent"], [5, "lose every 5th frame sent"]].map(([v, t]) => h("option", { value: v, selected: v === state.every }, t)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ p: state.protocol, n: state.frames, w: state.window, d: state.delay, ...(state.timeout ? { to: state.timeout } : {}), loss: state.losses, k: state.every });
    winBox.hidden = state.protocol === "sw";
    let r;
    try { r = simulate({ protocol: state.protocol, frames: state.frames, window: state.window, delay: state.delay, timeout: state.timeout, losses: parseLosses(state.losses), everyKth: state.every }); }
    catch (e) { msg.replaceChildren(notice(e.livelock ? "info" : "error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const stage = h("div", { class: "timeline-wrap" }), win = h("div"), note = h("ul", { class: "notes", "aria-live": "polite" });
    player = stepper({ count: r.ticks.length, label: "Tick", interval: 800, render: (i) => {
      const tick = r.ticks[i];
      stage.replaceChildren(timeline(r, tick.t));
      win.replaceChildren(windows(r, tick));
      note.replaceChildren(...(tick.notes.length ? tick.notes : ["Nothing new this tick; frames are in flight."]).map((n) => h("li", null, n)));
    } });
    const compare = Object.entries(PROTOCOLS).map(([id, x]) => {
      try { const c = simulate({ protocol: id, frames: state.frames, window: state.window, delay: state.delay, timeout: state.timeout, losses: parseLosses(state.losses), everyKth: state.every }); return [x.name, c.framesSent, c.retransmissions, c.done]; }
      catch { return [x.name, "never finishes", "–", "–"]; }
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `${PROTOCOLS[state.protocol].name}${state.protocol === "sw" ? "" : `, window ${r.W}`} · timeout ${r.T} ticks`), player.el,
        h("div", { class: "grid-2 tight" }, stage, h("div", null, win, note)),
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Frames sent"), h("b", null, r.framesSent)),
          h("div", { class: "stat" }, h("span", null, "Retransmissions"), h("b", null, r.retransmissions)),
          h("div", { class: "stat" }, h("span", null, "ACKs sent"), h("b", null, r.acksSent)),
          h("div", { class: "stat" }, h("span", null, "Finished at"), h("b", null, `tick ${r.done}`)))),
      h("section", { class: "card" }, h("h2", null, "Same losses, every protocol"),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Protocol", "Frames sent", "Retransmissions", "Finished at tick"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, compare.map(([n, a, b, c]) => h("tr", null, h("th", { scope: "row" }, n), h("td", null, a), h("td", null, b), h("td", null, c))))))),
      efficiencyCard());
  }

  function efficiencyCard() {
    const ins = { bw: h("input", { type: "number", value: 1, min: 0.001, step: "any", "aria-label": "Bandwidth in Mbps" }), size: h("input", { type: "number", value: 1000, min: 1, "aria-label": "Frame size in bits" }), tp: h("input", { type: "number", value: 5, min: 0.001, step: "any", "aria-label": "Propagation delay in ms" }), w: h("input", { type: "number", value: 7, min: 1, max: 1000, "aria-label": "Window" }) };
    const res = h("div");
    const calc = () => {
      try {
        const sw = efficiency({ bandwidth: Number(ins.bw.value) * 1e6, frameBits: Number(ins.size.value), propagation: Number(ins.tp.value) / 1000 });
        const sl = efficiency({ bandwidth: Number(ins.bw.value) * 1e6, frameBits: Number(ins.size.value), propagation: Number(ins.tp.value) / 1000, window: Number(ins.w.value) });
        const W = Number(ins.w.value);
        res.replaceChildren(h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Tt = L / B"), h("b", null, `${fmt(sw.Tt * 1000, 3)} ms`)),
          h("div", { class: "stat" }, h("span", null, "a = Tp / Tt"), h("b", null, fmt(sw.a, 3))),
          h("div", { class: "stat" }, h("span", null, "Stop-and-Wait utilisation"), h("b", null, `${fmt(sw.utilisation * 100)}%`)),
          h("div", { class: "stat" }, h("span", null, `Window ${W} utilisation`), h("b", null, `${fmt(sl.utilisation * 100)}%`)),
          h("div", { class: "stat" }, h("span", null, "Window for 100%"), h("b", null, sw.optimalWindow)),
          h("div", { class: "stat" }, h("span", null, `Sequence bits for W = ${W}`), h("b", null, `GBN ${minSeqBits(W, "gbn")} · SR ${minSeqBits(W, "sr")}`))),
          h("p", { class: "muted small" }, `With m-bit sequence numbers, the largest windows are 2ᵐ − 1 for Go-Back-N and 2ᵐ⁻¹ for Selective Repeat (e.g. 3 bits: ${maxWindow(3, "gbn")} and ${maxWindow(3, "sr")}).`));
      } catch (e) { res.replaceChildren(notice("error", e.message)); }
    };
    Object.values(ins).forEach((el) => el.addEventListener("input", calc));
    calc();
    return h("section", { class: "card" }, h("h2", null, "Efficiency calculator"),
      h("div", { class: "row" }, h("label", { class: "inline" }, "Bandwidth (Mbps) ", ins.bw), h("label", { class: "inline" }, "Frame (bits) ", ins.size), h("label", { class: "inline" }, "Propagation (ms) ", ins.tp), h("label", { class: "inline" }, "Window ", ins.w)), res);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, protoSel, num("frames", "Frames", 1, 16), winBox, num("delay", "Delay (ticks)", 1, 4), num("timeout", "Timeout", 2, 30)),
      h("div", { class: "row" }, h("label", { class: "inline" }, "Lose ", lossIn), everySel,
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // Practice: the formula questions exams ask most.
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const bwMbps = [1, 2, 4, 10, 100][Math.floor(r() * 5)], frameBits = [500, 1000, 2000, 4000, 8000][Math.floor(r() * 5)], tpMs = [1, 2, 5, 10, 20, 25][Math.floor(r() * 6)];
    const W = [3, 4, 5, 7, 8, 15][Math.floor(r() * 6)];
    const sw = efficiency({ bandwidth: bwMbps * 1e6, frameBits, propagation: tpMs / 1000 });
    const proto = r() < 0.5 ? "gbn" : "sr";
    const uIn = h("input", { type: "number", step: "any", "aria-label": "Utilisation in percent" }), bitsIn = h("input", { type: "number", "aria-label": "Sequence bits" });
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "Link efficiency"),
      h("p", null, `A ${bwMbps} Mbps link sends ${frameBits}-bit frames. The one-way propagation delay is ${tpMs} ms.`),
      h("div", { class: "qa" },
        h("label", null, "Stop-and-Wait utilisation (%, to 1 decimal)", uIn),
        h("label", null, `Minimum sequence-number bits for ${proto === "gbn" ? "Go-Back-N" : "Selective Repeat"} with window ${W}`, bitsIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const okU = uIn.value !== "" && Math.abs(Number(uIn.value) - sw.utilisation * 100) <= 0.15, okB = Number(bitsIn.value) === minSeqBits(W, proto);
        mark(uIn, okU, `${fmt(sw.utilisation * 100)}%`); mark(bitsIn, okB, minSeqBits(W, proto));
        feedback.replaceChildren(notice(okU && okB ? "good" : "info", `Tt = ${frameBits} / ${bwMbps}×10⁶ = ${fmt(sw.Tt * 1000, 3)} ms; a = ${tpMs} / ${fmt(sw.Tt * 1000, 3)} = ${fmt(sw.a, 3)}; U = 1 / (1 + 2a) = ${fmt(sw.utilisation * 100)}%. ${proto === "gbn" ? `GBN needs W ≤ 2ᵐ − 1, so m = ${minSeqBits(W, proto)}` : `SR needs W ≤ 2ᵐ⁻¹, so m = ${minSeqBits(W, proto)}`}.`));
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
  return () => player?.destroy();
}
