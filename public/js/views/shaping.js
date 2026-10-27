import { burst, LEAKY_CODE, leakyBucket, maxInInterval, parseArrivals, TOKEN_CODE, tokenBucket } from "../engines/shaping.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, fmt, h, morph, notice, page, readParams, reducedMotion, rng, stepper, writeParams } from "../ui.js";
import { mountTabs, numberQuestion, stat } from "./kit.js";

// A small square (packet) or circle (token) that falls/slides along a path.
function mover(kind, x0, y0, x1, y1, cls) {
  const shape = kind === "token" ? h("circle", { r: 6 }) : h("rect", { x: -7, y: -7, width: 14, height: 14, rx: 3 });
  if (reducedMotion()) return h("g", { class: `mv ${kind} ${cls}`, transform: `translate(${x1},${y1})` }, shape);
  return h("g", { class: `mv ${kind} ${cls}` }, shape,
    h("animateMotion", { dur: "0.8s", begin: "indefinite", fill: "freeze", path: `M${x0},${y0} L${x1},${y1}`, calcMode: "spline", keyTimes: "0;1", keySplines: "0.4 0 0.3 1" }));
}

// The bucket at one tick: what's inside, what fell in, what leaked out, what spilled.
function bucketSvg(st, kind, capacity) {
  const W = 640, H = 270, bx = 230, bw = 150, top = 70, bottom = 230;
  const cols = 6, rows = Math.ceil(capacity / cols), cell = Math.min(22, (bottom - top - 8) / rows), cw = (bw - 12) / cols;
  const slot = (i) => ({ x: bx + 6 + (i % cols) * cw + cw / 2, y: bottom - 6 - Math.floor(i / cols) * cell - cell / 2 });
  const els = [
    h("path", { d: `M${bx},${top} L${bx},${bottom} L${bx + bw},${bottom} L${bx + bw},${top}`, class: "bucket-wall" }),
    h("text", { x: bx + bw / 2, y: bottom + 22, "text-anchor": "middle", class: "bucket-label" }, kind === "leaky" ? `bucket holds ${capacity} packets` : `bucket holds ${capacity} tokens`),
    h("line", { x1: 30, x2: bx - 70, y1: bottom - 12, y2: bottom - 12, class: "wire" }),
    h("line", { x1: bx + bw, x2: W - 20, y1: bottom - 12, y2: bottom - 12, class: "wire" }),
    h("text", { x: W - 20, y: bottom - 22, "text-anchor": "end", class: "bucket-label" }, `out: ${st.sent}`),
  ];
  const level = kind === "leaky" ? st.level : st.tokens;
  for (let i = 0; i < level; i++) {
    const p = slot(i);
    els.push(kind === "leaky" ? h("rect", { x: p.x - 7, y: p.y - 7, width: 14, height: 14, rx: 3, class: "in-bucket" }) : h("circle", { cx: p.x, cy: p.y, r: 6, class: "token" }));
  }
  const moving = [];
  if (kind === "leaky") {
    els.push(h("rect", { x: bx + bw - 4, y: bottom - 20, width: 10, height: 16, class: "hole" }));
    // Accepted arrivals drop in from above; the overflow spills over the left rim.
    // Arrivals fall in and merge into the level (they fade once they land, so the count stays honest).
    if (!reducedMotion()) for (let i = 0; i < st.accepted; i++) { const p = slot(Math.min(level, capacity - 1)); moving.push(mover("pkt", bx + bw / 2 + (i - st.accepted / 2) * 16, 8, bx + bw / 2 + (i - st.accepted / 2) * 16, p.y - 8, "arrive")); }
    for (let i = 0; i < st.dropped; i++) moving.push(mover("pkt", bx + 30 + i * 12, 8, bx - 50 - i * 18, H - 10, "drop"));
    for (let i = 0; i < st.sent; i++) moving.push(mover("pkt", bx + bw, bottom - 12, W - 40 - i * 20, bottom - 12, "sent"));
  } else {
    // Tokens drip in from the top; packets come along the wire, use a token at the gate and go out.
    if (!reducedMotion()) for (let i = 0; i < st.added; i++) { const p = slot(Math.min(level, capacity - 1)); moving.push(mover("token", bx + bw / 2, top - 20, bx + bw / 2 + i * 14, p.y - 8, "drip")); }
    els.push(h("rect", { x: bx + bw / 2 - 18, y: top - 34, width: 36, height: 14, rx: 4, class: "tap" }), h("text", { x: bx + bw / 2 + 26, y: top - 23, class: "bucket-label" }, "tokens drip in"));
    for (let i = 0; i < st.sent; i++) moving.push(mover("pkt", 40 + i * 6, bottom - 12, W - 40 - i * 20, bottom - 12, "sent"));
    for (let i = 0; i < st.queued; i++) els.push(h("rect", { x: bx - 90 - i * 17, y: bottom - 19, width: 14, height: 14, rx: 3, class: "queued" }));
    for (let i = 0; i < st.dropped; i++) moving.push(mover("pkt", 40, bottom - 12, 60 + i * 16, H - 8, "drop"));
    if (st.queued) els.push(h("text", { x: bx - 90, y: bottom - 28, "text-anchor": "end", class: "bucket-label" }, `queue: ${st.queued}`));
  }
  els.push(h("text", { x: 30, y: 24, class: "bucket-label" }, `tick ${st.t}: ${st.arrived} arrive${st.dropped ? `, ${st.dropped} dropped` : ""}`));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "bucket", role: "img", "aria-label": `Tick ${st.t}: ${st.arrived} arrive, ${st.sent} sent, ${st.dropped} dropped, ${level} ${kind === "leaky" ? "packets" : "tokens"} in the bucket` }, els, moving);
}

// Input against output per tick, so the smoothing is easy to see.
function flowChart(steps, upto) {
  const W = 640, H = 150, L = 30, B = 22, n = steps.length, max = Math.max(1, ...steps.map((s) => Math.max(s.arrived, s.sent)));
  const bw = (W - L - 10) / n, y = (v) => H - B - (v / max) * (H - B - 12);
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "flow", role: "img", "aria-label": `Arrivals ${steps.map((s) => s.arrived).join(", ")}; sent ${steps.map((s) => s.sent).join(", ")}` },
    h("line", { x1: L, x2: W - 10, y1: H - B, y2: H - B, class: "grid" }),
    steps.map((s, t) => h("g", { class: t > upto ? "later" : t === upto ? "now" : null },
      h("rect", { x: L + t * bw + 2, y: y(s.arrived), width: bw / 2 - 3, height: H - B - y(s.arrived), class: "in" }),
      h("rect", { x: L + t * bw + bw / 2, y: y(s.sent), width: bw / 2 - 3, height: H - B - y(s.sent), class: "out" }),
      s.dropped ? h("text", { x: L + t * bw + bw / 2, y: 12, "text-anchor": "middle", class: "drop-mark" }, "✗") : null,
      h("text", { x: L + t * bw + bw / 2, y: H - 6, "text-anchor": "middle", class: "tick" }, t))),
    h("text", { x: L, y: 10, class: "tick" }, `max ${max}`));
}

export function render(root) {
  const p = readParams();
  const state = { kind: p.get("k") === "token" ? "token" : "leaky", arrivals: p.get("in") ?? "5 0 0 8 0 1 0 0 6 0 0 0", capacity: Number(p.get("b") ?? 6), rate: Number(p.get("r") ?? 2), mode: p.get("mode") === "police" ? "police" : "shape", queue: Number(p.get("q") ?? 8) };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "Traffic shaping",
    lede: "The leaky bucket and the token bucket, tick by tick: watch bursts go in, a steady stream come out, and packets spill when the bucket is full. Plus the classic burst-length calculation.",
    theory: h("div", null,
      h("p", null, h("b", null, "Leaky bucket"), ": packets pour into a bucket with a hole in the bottom. Whatever the input, at most ρ packets leave per tick, so bursts are smoothed into a steady stream. If the bucket is full, new packets overflow and are lost."),
      h("p", null, h("b", null, "Token bucket"), ": tokens drip into a bucket at rate ρ, up to its capacity C. A packet may only leave if it takes a token. When traffic is quiet the tokens save up, so a burst of up to C packets can go out at once: it allows ", h("i", null, "controlled"), " bursts. In any interval t, at most C + ρt can leave (Kurose writes this as rt + b). A ", h("b", null, "shaper"), " queues packets that have no token; a ", h("b", null, "policer"), " drops them."),
      h("p", null, h("b", null, "Burst length"), " (Tanenbaum): if the output line can run at M bytes/s, a full bucket empties in S seconds where C + ρS = MS, so ", h("b", null, "S = C / (M − ρ)"), ", and the burst carries M·S bytes.")),
    conventions: ["Traffic is counted in whole packets, one row of arrivals per tick.", "Leaky bucket: arrivals go in first, then up to ρ packets leak out in the same tick.", "Token bucket: it starts full; from the second tick on, ρ tokens are added at the start of each tick (capped at C), and each packet uses one token.", "Burst calculator units: C in bytes, M and ρ in bytes per second (1 MB = 10⁶ bytes)."],
  });

  const kindSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.kind = e.target.value; update(); } }, [["leaky", "Leaky bucket"], ["token", "Token bucket"]].map(([v, t]) => h("option", { value: v, selected: v === state.kind }, t)));
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const modeSel = h("select", { "aria-label": "What happens to packets without a token", onchange: (e) => { state.mode = e.target.value; update(); } }, [["shape", "shaper: queue them"], ["police", "policer: drop them"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const tokenOpts = h("span", { class: "row inline-row" }, modeSel, num("queue", "Queue size", 0, 100));
  const inIn = h("input", { type: "text", class: "mono wide", value: state.arrivals, "aria-label": "Packets arriving each tick", oninput: (e) => { state.arrivals = e.target.value; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy(); player = null;
    writeParams({ k: state.kind, in: state.arrivals, b: state.capacity, r: state.rate, mode: state.mode, q: state.queue });
    tokenOpts.hidden = state.kind !== "token";
    let r;
    try {
      const arrivals = parseArrivals(state.arrivals);
      r = state.kind === "leaky" ? leakyBucket({ arrivals, capacity: state.capacity, rate: state.rate }) : tokenBucket({ arrivals, capacity: state.capacity, rate: state.rate, mode: state.mode, queueSize: state.queue });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(state.kind === "leaky" ? LEAKY_CODE : TOKEN_CODE), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), flow = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: r.steps.length, label: "Tick", interval: 1300, render: (i) => {
      const st = r.steps[i];
      morph(stage, bucketSvg(st, state.kind, state.capacity));
      flow.replaceChildren(flowChart(r.steps, i));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.dropped ? " bad" : ""}`;
    } });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, state.kind === "leaky" ? `Leaky bucket: holds ${state.capacity}, leaks ${state.rate} per tick` : `Token bucket: C = ${state.capacity} tokens, ρ = ${state.rate} per tick (${state.mode === "shape" ? "shaper" : "policer"})`),
        player.el, note, traceLayout(h("div", null, stage, flow, h("div", { class: "legend-chips" }, h("span", null, h("i", { style: "--c:var(--muted)" }), "arrived"), h("span", null, h("i", { style: "--c:var(--series-1)" }), "sent"), h("span", null, h("i", { style: "--c:var(--bad)" }), "✗ some dropped"))), code, vars),
        h("div", { class: "stats-row" }, stat("Arrived", r.arrived), stat("Sent", r.sent), stat("Dropped", r.dropped), stat("Ticks to drain", r.steps.length))),
      burstCard());
  }

  function burstCard() {
    const ins = { C: h("input", { type: "number", value: 250, min: 0.001, step: "any", "aria-label": "Bucket capacity in KB" }), rho: h("input", { type: "number", value: 2, min: 0.001, step: "any", "aria-label": "Token rate in MB/s" }), M: h("input", { type: "number", value: 25, min: 0.001, step: "any", "aria-label": "Maximum output rate in MB/s" }) };
    const res = h("div");
    const calc = () => {
      try {
        const C = Number(ins.C.value) * 1e3, rho = Number(ins.rho.value) * 1e6, M = Number(ins.M.value) * 1e6;
        const b = burst({ C, M, rho });
        res.replaceChildren(h("div", { class: "stats-row" }, stat("Burst length S", `${fmt(b.S * 1000, 3)} ms`), stat("Burst size M·S", `${fmt(b.bytes / 1e3, 1)} KB`), stat("Tokens used C + ρS", `${fmt(b.tokensUsed / 1e3, 1)} KB`)),
          h("p", { class: "muted small" }, `During the burst the bucket's ${fmt(C / 1e3)} KB plus the ${fmt(rho * b.S / 1e3, 1)} KB of tokens that drip in meanwhile are spent at ${ins.M.value} MB/s: S = C / (M − ρ) = ${fmt(C / 1e3)} KB / (${ins.M.value} − ${ins.rho.value}) MB/s = ${fmt(b.S * 1000, 3)} ms. After that the output falls back to ρ = ${ins.rho.value} MB/s.`));
      } catch (e) { res.replaceChildren(notice("error", e.message)); }
    };
    Object.values(ins).forEach((el) => el.addEventListener("input", calc));
    calc();
    return h("section", { class: "card" }, h("h2", null, "Maximum burst: S = C / (M − ρ)"),
      h("div", { class: "row" }, h("label", { class: "inline" }, "C (KB) ", ins.C), h("label", { class: "inline" }, "ρ (MB/s) ", ins.rho), h("label", { class: "inline" }, "M (MB/s) ", ins.M)), res);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, kindSel, num("capacity", "Bucket size", 1, 60), num("rate", "Rate ρ per tick", 1, 20), tokenOpts),
      h("label", { class: "stack" }, "Packets arriving in each tick", inIn),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { const r = rng(); state.arrivals = Array.from({ length: 12 }, () => (r() < 0.35 ? Math.floor(r() * 9) : 0)).join(" "); inIn.value = state.arrivals; update(); } }, "Random bursts"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = Math.floor(r() * 3);
    let body;
    if (kind === 0) {
      const C = [250, 500, 1000, 64][Math.floor(r() * 4)], rho = [1, 2, 5][Math.floor(r() * 3)], M = [10, 20, 25, 50][Math.floor(r() * 4)];
      const S = burst({ C: C * 1e3, M: M * 1e6, rho: rho * 1e6 }).S * 1000;
      const input = h("input", { type: "number", step: "any", "aria-label": "Burst length in ms" }), fb = h("div");
      body = [h("h2", null, `A token bucket has capacity C = ${C} KB and token rate ρ = ${rho} MB/s; the line can carry M = ${M} MB/s. How long (ms, 2 decimal places) can it send at full speed when the bucket is full?`),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = input.value !== "" && Math.abs(Number(input.value) - S) <= 0.011;
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ It's ${S.toFixed(2)} ms.`} S = C / (M − ρ) = ${C} KB / ${M - rho} MB/s = ${S.toFixed(2)} ms.`));
        } }, "Check")), fb];
    } else if (kind === 1) {
      const b = 2 + Math.floor(r() * 10), rate = 1 + Math.floor(r() * 4), t = 2 + Math.floor(r() * 8);
      body = [h("h2", null, `A token bucket holds b = ${b} tokens and gains r = ${rate} tokens per second. At most how many packets can it let through in any ${t}-second interval?`),
        numberQuestion(maxInInterval({ b, r: rate, t }), `It can empty the full bucket (${b}) and also spend every token that arrives meanwhile (${rate} × ${t}): r·t + b = ${rate * t + b}.`)];
    } else {
      const arrivals = Array.from({ length: 5 }, () => (r() < 0.5 ? 1 + Math.floor(r() * 7) : 0)); arrivals[0] = 3 + Math.floor(r() * 6);
      const cap = 3 + Math.floor(r() * 4), rate = 1 + Math.floor(r() * 2);
      const res = leakyBucket({ arrivals, capacity: cap, rate });
      const k = 2 + Math.floor(r() * 3), st = res.steps[k];
      body = [h("h2", null, `A leaky bucket holds ${cap} packets and leaks ${rate} per tick. Arrivals in ticks 0–4: ${arrivals.join(", ")}. How many packets are in the bucket at the end of tick ${k}?`),
        numberQuestion(st.level, `Tick by tick (arrive, drop, leak): ${res.steps.slice(0, k + 1).map((s) => `t${s.t}: +${s.accepted}${s.dropped ? ` (−${s.dropped} spilt)` : ""} −${s.sent} → ${s.level}`).join("; ")}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
