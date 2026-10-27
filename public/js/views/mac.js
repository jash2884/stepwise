import { aloha, ALOHA_CODE, CA_TIMES, csmaca, CSMACA_CODE, csmacd, CSMACD_CODE, minFrame, parseStations, peak, throughput } from "../engines/mac.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, fmt, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { packet } from "./net.js";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// S against G for both ALOHAs, with the peaks marked and the chosen G shown.
function throughputChart(G) {
  const W = 560, H = 250, L = 46, R = 14, T = 18, B = 40, maxG = 3, maxS = 0.4;
  const x = (g) => L + (g / maxG) * (W - L - R), y = (s) => H - B - (s / maxS) * (H - T - B);
  const curve = (mode) => Array.from({ length: 121 }, (_, i) => { const g = (i / 120) * maxG; return `${i ? "L" : "M"}${x(g).toFixed(1)},${y(throughput(g, mode)).toFixed(1)}`; }).join(" ");
  const mark = (mode, cls) => { const p = peak(mode); return h("g", { class: `peak ${cls}` }, h("circle", { cx: x(p.G), cy: y(p.S), r: 5 }), h("text", { x: x(p.G) + 8, y: y(p.S) - 8 }, `${pct(p.S)} at G = ${p.G}`)); };
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "cwnd-chart aloha-chart", role: "img", "aria-label": `Throughput: pure ALOHA ${pct(throughput(G, "pure"))} and slotted ${pct(throughput(G, "slotted"))} at G = ${G}` },
    [0, 0.1, 0.2, 0.3, 0.4].map((s) => [h("line", { x1: L, x2: W - R, y1: y(s), y2: y(s), class: "grid" }), h("text", { x: L - 6, y: y(s) + 4, "text-anchor": "end" }, `${s * 100}%`)]),
    [0, 0.5, 1, 1.5, 2, 2.5, 3].map((g) => h("text", { x: x(g), y: H - B + 16, "text-anchor": "middle" }, g)),
    h("text", { x: (W + L) / 2, y: H - 6, "text-anchor": "middle", class: "axis-title" }, "G: frames offered per frame time"),
    h("text", { x: L, y: 10, class: "axis-title" }, "S: throughput"),
    h("path", { d: curve("slotted"), class: "line main" }), h("path", { d: curve("pure"), class: "line pure" }),
    mark("slotted", "main"), mark("pure", "pure"),
    h("line", { x1: x(G), x2: x(G), y1: T, y2: H - B, class: "g-now", "data-k": "g", "data-x": x(G), "data-y": 0 }),
    h("circle", { cx: x(G), cy: y(throughput(G, "slotted")), r: 6, class: "now-dot", "data-k": "gs", "data-x": x(G), "data-y": y(throughput(G, "slotted")) }),
    h("circle", { cx: x(G), cy: y(throughput(G, "pure")), r: 6, class: "now-dot pure", "data-k": "gp", "data-x": x(G), "data-y": y(throughput(G, "pure")) }),
    h("g", { class: "legend" }, h("line", { x1: W - 190, x2: W - 170, y1: 30, y2: 30, class: "line main" }), h("text", { x: W - 165, y: 34 }, "Slotted: G·e^−G"),
      h("line", { x1: W - 190, x2: W - 170, y1: 48, y2: 48, class: "line pure" }), h("text", { x: W - 165, y: 52 }, "Pure: G·e^−2G")));
}

// Station rows with each frame as a bar; the channel row shows what the medium carries.
function alohaLanes(r, upto) {
  const n = r.names.length, span = Math.max(r.steps.length, 8), L = 40, W = 640, rowH = 26, T = 22;
  const x = (t) => L + (t / span) * (W - L - 12);
  const H = T + (n + 1) * rowH + 30, chanY = T + n * rowH + 10;
  const shown = r.frames.filter((f) => f.start < upto);
  const fresh = shown.filter((f) => f.start >= upto - 1);
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "lanes", role: "img", "aria-label": `${shown.length} frames sent by time ${upto}` },
    Array.from({ length: Math.floor(span) + 1 }, (_, t) => [h("line", { x1: x(t), x2: x(t), y1: T - 6, y2: chanY + rowH - 4, class: r.mode === "slotted" ? "slot-line" : "grid" }), h("text", { x: x(t), y: H - 6, "text-anchor": "middle", class: "tick" }, t)]),
    h("rect", { x: x(upto - 1), y: T - 8, width: x(upto) - x(upto - 1), height: chanY + rowH - T + 4, class: "now-band", "data-k": "band", "data-x": x(upto - 1), "data-y": 0 }),
    r.names.map((s, i) => h("text", { x: L - 8, y: T + i * rowH + 15, "text-anchor": "end", class: "lane-name" }, s)),
    h("text", { x: L - 8, y: chanY + 15, "text-anchor": "end", class: "lane-name" }, "ch"),
    shown.map((f) => {
      const row = r.names.indexOf(f.station);
      return h("g", { class: `frame-bar ${f.ok ? "ok" : "bad"}` },
        h("rect", { x: x(f.start), y: T + row * rowH + 3, width: x(f.end) - x(f.start), height: rowH - 8, rx: 4 }, h("title", null, `${f.station}: ${f.start}–${f.end}, ${f.ok ? "success" : "collision"}`)),
        h("rect", { x: x(f.start), y: chanY + 3, width: x(f.end) - x(f.start), height: rowH - 8, rx: 4, class: "chan" }));
    }),
    fresh.map((f) => { const row = r.names.indexOf(f.station), px = x(f.start) + (x(f.end) - x(f.start)) / 2; return packet(px, T + row * rowH + 12, px, chanY + 12, { label: f.station, cls: f.ok ? "ok" : "bad", dur: 0.6 }); }));
}

// The shared bus: stations above it, signals spreading along it this slot.
function busSvg(r, st, names) {
  const W = 640, H = 150, busY = 100, n = names.length;
  const sx = (i) => 60 + (i * (W - 120)) / Math.max(1, n - 1);
  const pos = Object.fromEntries(names.map((s, i) => [s, n === 1 ? W / 2 : sx(i)]));
  const sigs = [];
  for (const s of [...st.sending, ...st.colliding]) {
    const cls = st.colliding.includes(s) ? "bad" : "ok";
    sigs.push(packet(pos[s], busY, 24, busY, { cls: `sig ${cls}`, dur: 0.9 }), packet(pos[s], busY, W - 24, busY, { cls: `sig ${cls}`, dur: 0.9 }));
  }
  const coll = st.colliding.length > 1 ? (Math.min(...st.colliding.map((s) => pos[s])) + Math.max(...st.colliding.map((s) => pos[s]))) / 2 : null;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "bus", role: "img", "aria-label": `Slot ${st.t}: ${st.sending.length ? `${st.sending.join(", ")} sending` : ""}${st.colliding.length ? `${st.colliding.join(" and ")} collide` : ""}` },
    h("line", { x1: 20, x2: W - 20, y1: busY, y2: busY, class: `bus-line${st.colliding.length ? " jam" : st.sending.length ? " busy" : ""}` }),
    names.map((s) => {
      const state = String(st.vars[s] ?? "");
      return h("g", { class: `bus-st${st.sending.includes(s) ? " tx" : ""}${st.colliding.includes(s) ? " coll" : ""}` },
        h("line", { x1: pos[s], x2: pos[s], y1: 56, y2: busY, class: "tap" }),
        h("rect", { x: pos[s] - 24, y: 22, width: 48, height: 34, rx: 8 }), h("text", { x: pos[s], y: 44, "text-anchor": "middle", class: "st-name" }, s),
        h("text", { x: pos[s], y: 14, "text-anchor": "middle", class: "st-state" }, state.replace(/ \(n=\d+\)/, "").replace(/, n=\d+/, "")));
    }),
    coll !== null ? h("g", { class: "burst" }, h("circle", { cx: coll, cy: busY, r: 14 }), h("text", { x: coll, y: busY + 5, "text-anchor": "middle" }, "✗"), h("text", { x: coll, y: busY + 34, "text-anchor": "middle", class: "st-state" }, "collision → jam")) : null,
    sigs);
}

function slotGrid(r, upto, names) {
  const label = { tx: "send", collide: "✗", wait: "wait", backoff: "", done: "✓", "gave up": "✗✗" };
  return h("div", { class: "table-wrap" }, h("table", { class: "slot-grid" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Slot"), Array.from({ length: r.slots }, (_, t) => h("th", { scope: "col", class: t === upto ? "now" : null }, t)))),
    h("tbody", null, names.map((s) => h("tr", null, h("th", { scope: "row" }, s), Array.from({ length: r.slots }, (_, t) => {
      const c = t <= upto ? r.cells[s][t] ?? "" : "";
      // A collision cell names the backoff the station picked there.
      const k = c === "collide" && r.steps[t].picks[s] != null ? `✗ k=${r.steps[t].picks[s]}` : "";
      return h("td", { class: `${c.replace(" ", "-")}${t === upto ? " now" : ""}` }, k || label[c] || "");
    }))))));
}

// CSMA/CA: lanes A, AP, C with time running to the right.
function caLanes(r, st) {
  const lanes = [r.names[0], "AP", ...r.names.slice(1)];
  const W = 660, L = 40, rowH = 40, T = 16, end = Math.max(r.end, 10);
  const x = (t) => L + (t / end) * (W - L - 12), y = (lane) => T + lanes.indexOf(lane) * rowH;
  const H = T + lanes.length * rowH + 26;
  const bars = r.bars.slice(0, st.bars), msgs = r.msgs.filter((m) => m.step === r.steps.indexOf(st));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "lanes ca", role: "img", "aria-label": `Time ${st.t}: ${bars.map((b) => `${b.lane} ${b.kind}`).join(", ")}` },
    lanes.map((l) => [h("text", { x: L - 8, y: y(l) + 24, "text-anchor": "end", class: "lane-name" }, l), h("line", { x1: L, x2: W - 12, y1: y(l) + 34, y2: y(l) + 34, class: "grid" })]),
    Array.from({ length: Math.floor(end / 5) + 1 }, (_, i) => h("text", { x: x(i * 5), y: H - 6, "text-anchor": "middle", class: "tick" }, i * 5)),
    bars.map((b) => h("g", { class: `ca-bar ${b.kind}` }, h("rect", { x: x(b.t0), y: y(b.lane) + (b.kind === "nav" ? 22 : 8), width: Math.max(2, x(b.t1) - x(b.t0)), height: b.kind === "nav" ? 10 : 26, rx: 4 }),
      x(b.t1) - x(b.t0) > 22 && b.kind !== "nav" ? h("text", { x: (x(b.t0) + x(b.t1)) / 2, y: y(b.lane) + 25, "text-anchor": "middle" }, b.text) : b.kind === "nav" && x(b.t1) - x(b.t0) > 30 ? h("text", { x: x(b.t0) + 4, y: y(b.lane) + 18, class: "nav-label" }, "NAV") : null)),
    h("line", { x1: x(st.t), x2: x(st.t), y1: 6, y2: H - 20, class: "now-line", "data-k": "now", "data-x": x(st.t), "data-y": 0 }),
    msgs.map((m) => { const px = (x(m.t0) + x(m.t1)) / 2; return packet(px, y(m.from) + 21, px, y(m.to) + 21, { label: m.label.replace(" ✗", ""), cls: m.cls, dur: 0.7 }); }));
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: ["aloha", "csmacd", "csmaca"].includes(p.get("m")) ? p.get("m") : "aloha",
    aloha: p.get("a") === "pure" ? "pure" : "slotted", G: Number(p.get("G") ?? 1), n: Number(p.get("n") ?? 5), slots: Number(p.get("t") ?? 14), seed: Number(p.get("s") ?? 1),
    stations: p.get("st") ?? "A 0, B 0, C 3", frame: Number(p.get("f") ?? 3),
    bA: Number(p.get("ba") ?? 3), bC: Number(p.get("bc") ?? 5), rts: p.get("rts") !== "0",
  };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "MAC protocols",
    lede: "How stations share one channel: pure and slotted ALOHA with their throughput curves, CSMA/CD's collisions and binary exponential backoff, and CSMA/CA with RTS/CTS.",
    theory: h("div", null,
      h("p", null, h("b", null, "ALOHA"), ": send whenever you have a frame. In ", h("b", null, "pure ALOHA"), " a frame is hit by any other frame starting up to one frame time before or after it, so the vulnerable period is 2T and the throughput is S = G·e^(−2G), peaking at 1/(2e) ≈ 18.4% when G = 0.5. ", h("b", null, "Slotted ALOHA"), " only lets frames start at slot boundaries, halving the vulnerable period: S = G·e^(−G), peaking at 1/e ≈ 36.8% when G = 1."),
      h("p", null, h("b", null, "CSMA/CD"), " (classic Ethernet): listen before sending, and keep listening while you send. On a collision, send a jam signal, then wait a random k slot times with k from 0 … 2ⁿ − 1 after the n-th collision (", h("b", null, "binary exponential backoff"), "; n stops growing at 10, and the station gives up after 16 tries). A frame must last at least one round trip across the cable, so L ≥ 2 × propagation delay × bandwidth: 512 bits for 10 Mbps Ethernet."),
      h("p", null, h("b", null, "CSMA/CA"), " (Wi-Fi) can't detect collisions while sending, so it tries to avoid them: wait for the channel to be idle for DIFS, count down a random backoff (frozen while the channel is busy), optionally reserve the channel with RTS/CTS, and rely on an ACK to know the frame arrived.")),
    conventions: ["ALOHA: each station sends a new frame each frame time with probability G/N; retransmissions are counted inside G, as in the formula's derivation.", "CSMA/CD runs in contention slots (one round trip each); stations that start in the same slot collide and detect it within that slot. Stations are 1-persistent.", `CSMA/CA times are in slots: DIFS ${CA_TIMES.DIFS}, SIFS ${CA_TIMES.SIFS}, RTS ${CA_TIMES.RTS}, CTS ${CA_TIMES.CTS}, DATA ${CA_TIMES.DATA}, ACK ${CA_TIMES.ACK} (illustrative values). The backoff values are chosen by you; after a collision the new ones are random.`],
  });

  const modeSel = h("select", { "aria-label": "Protocol", onchange: (e) => { state.mode = e.target.value; update(); } },
    [["aloha", "ALOHA (pure and slotted)"], ["csmacd", "CSMA/CD with backoff"], ["csmaca", "CSMA/CA (Wi-Fi)"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const num = (key, label, min, max, step = 1) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, step, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const alohaSel = h("select", { "aria-label": "ALOHA variant", onchange: (e) => { state.aloha = e.target.value; update(); } }, [["slotted", "Slotted"], ["pure", "Pure"]].map(([v, t]) => h("option", { value: v, selected: v === state.aloha }, t)));
  const reroll = h("button", { type: "button", class: "btn ghost", onclick: () => { state.seed = 1 + Math.floor(Math.random() * 9999); update(); } }, "Re-roll the dice");
  const stIn = h("input", { type: "text", class: "mono", value: state.stations, "aria-label": "Stations and the slot each is ready", oninput: (e) => { state.stations = e.target.value; update(); } });
  const rtsBox = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.rts, onchange: (e) => { state.rts = e.target.checked; update(); } }), " use RTS/CTS");
  const opts = {
    aloha: h("div", { class: "row" }, alohaSel, num("G", "G", 0, 5, 0.1), num("n", "Stations", 2, 8), num("slots", "Frame times", 4, 40)),
    csmacd: h("div", { class: "row" }, h("label", { class: "inline" }, "Stations (name, ready slot) ", stIn), num("frame", "Frame length (slots)", 1, 8)),
    csmaca: h("div", { class: "row" }, num("bA", "A's backoff", 0, 7), num("bC", "C's backoff", 0, 7), rtsBox),
  };
  const msg = h("div"), out = h("div", { class: "output" });

  function traceCard(title, steps, code, draw, extra = []) {
    const c = codePanel(code), v = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), below = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: steps.length, label: "Step", interval: 1200, render: (i) => {
      const [main, sub] = draw(steps[i], i);
      morph(stage, main);
      below.replaceChildren(sub ?? "");
      c.show(steps[i].line); v.show(steps[i].vars);
      note.textContent = steps[i].note;
      note.className = `step-note${/COLLISION|collide|lost/.test(steps[i].note) ? " bad" : i === steps.length - 1 ? " good" : ""}`;
    } });
    return h("section", { class: "card" }, h("h2", null, title), player.el, note, traceLayout(h("div", null, stage, below), c, v), ...extra);
  }

  function update() {
    player?.destroy(); player = null;
    writeParams({ m: state.mode, a: state.aloha, G: state.G, n: state.n, t: state.slots, s: state.seed, st: state.stations, f: state.frame, ba: state.bA, bc: state.bC, rts: state.rts ? 1 : 0 });
    for (const [k, el] of Object.entries(opts)) el.hidden = k !== state.mode;
    try {
      msg.replaceChildren();
      if (state.mode === "aloha") {
        const r = aloha({ mode: state.aloha, stations: state.n, G: state.G, slots: state.slots, seed: state.seed });
        const curves = h("div", { class: "chart-wrap" });
        const slider = h("input", { type: "range", min: 0, max: 3, step: 0.05, value: Math.min(3, state.G), "aria-label": "Offered load G", class: "wide",
          oninput: (e) => { const G = Number(e.target.value); morph(curves, throughputChart(G)); readout.replaceChildren(stat("G", fmt(G)), stat("Pure S", pct(throughput(G, "pure"))), stat("Slotted S", pct(throughput(G, "slotted")))); } });
        const readout = h("div", { class: "stats-row" }, stat("G", fmt(state.G)), stat("Pure S", pct(throughput(state.G, "pure"))), stat("Slotted S", pct(throughput(state.G, "slotted"))));
        curves.append(throughputChart(Math.min(3, state.G)));
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, "Throughput against offered load"), curves, h("label", { class: "stack" }, "Drag to change G", slider), readout,
            h("p", { class: "muted small" }, "Too little traffic wastes the channel; too much and almost every frame collides. Slotted ALOHA's best case is exactly double pure ALOHA's, because only frames in the same slot can collide.")),
          traceCard(`${state.aloha === "pure" ? "Pure" : "Slotted"} ALOHA: ${state.n} stations, G = ${state.G}`, r.steps, ALOHA_CODE[state.aloha], (st) => [alohaLanes(r, st.upto)], [
            h("div", { class: "stats-row" }, stat("Frames sent", r.frames.length), stat("Got through", r.successes), stat("Collided", r.collided), stat("Measured S", pct(r.S)), stat("Formula S", pct(throughput(r.offered, state.aloha)))),
            h("div", { class: "row" }, reroll, h("span", { class: "muted small" }, "A short run is noisy; the formula is what happens on average over a long run.")),
          ]));
      } else if (state.mode === "csmacd") {
        const stations = parseStations(state.stations);
        const r = csmacd({ stations, frameSlots: state.frame, seed: state.seed });
        const names = stations.map((s) => s.name);
        out.replaceChildren(
          traceCard("CSMA/CD on a shared bus", r.steps, CSMACD_CODE, (st, i) => [busSvg(r, st, names), slotGrid(r, i, names)], [
            h("div", { class: "stats-row" }, stat("Slots used", r.slots), stat("Collisions", r.collisions), ...r.stations.map((s) => stat(`${s.name} collisions`, s.collisions))),
            h("div", { class: "row" }, reroll, h("span", { class: "muted small" }, "Each re-roll draws new random backoffs.")),
            h("p", { class: "muted small" }, "After the first collision two stations each pick 0 or 1, so they collide again with probability 1/2; after the second, 0–3, so 1/4; the range doubles each time, which is why contention clears quickly."),
          ]),
          minFrameCard());
      } else {
        const r = csmaca({ backoffs: { A: state.bA, C: state.bC }, rtscts: state.rts, seed: state.seed });
        out.replaceChildren(traceCard(`CSMA/CA ${state.rts ? "with" : "without"} RTS/CTS`, r.steps, CSMACA_CODE, (st) => [caLanes(r, st)], [
          h("div", { class: "legend-chips" }, [["DIFS", "difs"], ["backoff", "backoff"], ["RTS / CTS", "rts"], ["DATA", "data"], ["ACK", "ack"], ["NAV (keep quiet)", "nav"], ["collision", "collide"]].map(([t, c]) => h("span", { class: `ca-key ${c}` }, h("i"), t))),
          h("p", { class: "muted small" }, "Try equal backoffs to see a collision. Without RTS/CTS a collision wastes a whole DATA frame; with it, only the short RTS frames."),
        ]));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  function minFrameCard() {
    const ins = { bw: h("input", { type: "number", value: 10, min: 0.001, step: "any", "aria-label": "Bandwidth in Mbps" }), d: h("input", { type: "number", value: 2500, min: 1, step: "any", "aria-label": "Cable length in metres" }), v: h("input", { type: "number", value: 2e8, min: 1, step: "any", "aria-label": "Signal speed in metres per second" }) };
    const res = h("div");
    const calc = () => {
      try {
        const r = minFrame({ bandwidth: Number(ins.bw.value) * 1e6, distance: Number(ins.d.value), speed: Number(ins.v.value) });
        res.replaceChildren(h("div", { class: "stats-row" }, stat("Propagation delay", `${fmt(r.tp * 1e6)} µs`), stat("Round trip (slot)", `${fmt(r.slot * 1e6)} µs`), stat("Minimum frame", `${fmt(r.bits)} bits`), stat("In bytes", fmt(r.bytes))),
          h("p", { class: "muted small" }, `L ≥ 2 × ${fmt(r.tp * 1e6)} µs × ${ins.bw.value} Mbps = ${fmt(r.bits)} bits. A shorter frame could finish before news of a collision at the far end got back, and the sender would wrongly think it had succeeded.`));
      } catch (e) { res.replaceChildren(notice("error", e.message)); }
    };
    Object.values(ins).forEach((el) => el.addEventListener("input", calc));
    calc();
    return h("section", { class: "card" }, h("h2", null, "Minimum frame size"), h("div", { class: "row" }, h("label", { class: "inline" }, "Bandwidth (Mbps) ", ins.bw), h("label", { class: "inline" }, "Cable (m) ", ins.d), h("label", { class: "inline" }, "Signal speed (m/s) ", ins.v)), res);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      ...Object.values(opts), msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = Math.floor(r() * 4);
    let body;
    if (kind === 0) {
      const mode = r() < 0.5 ? "pure" : "slotted", G = [0.25, 0.5, 0.75, 1, 1.5, 2][Math.floor(r() * 6)];
      const S = throughput(G, mode) * 100;
      const input = h("input", { type: "number", step: "any", "aria-label": "Throughput in percent" }), fb = h("div");
      body = [h("h2", null, `${mode === "pure" ? "Pure" : "Slotted"} ALOHA with G = ${G}: what's the throughput S, as a percentage (1 decimal place)?`),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = input.value !== "" && Math.abs(Number(input.value) - S) <= 0.06;
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ It's ${S.toFixed(1)}%.`} S = ${mode === "pure" ? `G·e^(−2G) = ${G} × e^(−${2 * G})` : `G·e^(−G) = ${G} × e^(−${G})`} = ${(S / 100).toFixed(4)}.`));
        } }, "Check")), fb];
    } else if (kind === 1) {
      const n = 1 + Math.floor(r() * 12), max = 2 ** Math.min(n, 10) - 1;
      body = [h("h2", null, `CSMA/CD: after its ${n}${["st", "nd", "rd"][n - 1] ?? "th"} collision in a row, what's the largest backoff k a station can pick?`),
        numberQuestion(max, `k is chosen from 0 … 2^min(n, 10) − 1 = 2^${Math.min(n, 10)} − 1 = ${max}${n > 10 ? "; the range stops doubling after 10 collisions" : ""}.`)];
    } else if (kind === 2) {
      const bw = [10, 100][Math.floor(r() * 2)], tp = [25.6, 5.12, 10, 20][Math.floor(r() * 4)];
      const bits = Math.round(minFrame({ bandwidth: bw * 1e6, propagation: tp * 1e-6 }).bits);
      body = [h("h2", null, `A ${bw} Mbps CSMA/CD network has a maximum propagation delay of ${tp} µs. What's the minimum frame size in bits?`),
        numberQuestion(bits, `L = 2 × ${tp} µs × ${bw} Mbps = ${bits} bits (${bits / 8} bytes).`)];
    } else {
      const n = 1 + Math.floor(r() * 3), p = 1 / 2 ** n;
      const opts = [p, p / 2, p * 2, 1 - p].map((x) => (x >= 1 ? 0.75 : x)).filter((x, i, a) => a.indexOf(x) === i);
      body = [h("h2", null, `Two stations have just collided for the ${["first", "second", "third"][n - 1]} time. What's the chance they pick the same backoff and collide again?`),
        choice(opts.map((x) => ({ label: `${x === 0.75 ? "3/4" : `1/${Math.round(1 / x)}`}`, correct: x === p })).sort(() => r() - 0.5), `Each picks uniformly from ${2 ** n} values, so they match with probability 1/${2 ** n}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
