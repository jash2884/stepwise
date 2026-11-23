import { CODE, DMA_MODES, dmaModes, EXAMPLES, fromParams, METHODS, overheads, randomParams, showTime, toParams, walkthrough } from "../engines/io.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { exampleSelect, mountTabs } from "./kit.js";
import { natQuestion, numIn, stepFrame } from "./coa-kit.js";

const ORDER = ["programmed", "interrupt", "dma"];
const pctText = (x) => `${Math.round(x * 1e4) / 1e4}%`;

// One strip per method: one period between CPU involvements, the busy part shaded.
function strips(o, s) {
  const reached = s.method === "all" ? 3 : s.method ? ORDER.indexOf(s.method) : -1;
  return h("div", { class: "coa-strips" }, ORDER.map((m, k) => {
    const x = o[m];
    const shown = k <= reached;
    const phase = k < reached || s.method === "all" ? 3 : k === reached ? s.phase : 0;
    const busy = Math.min(1, x.fraction);
    return h("div", { class: `coa-strip${shown ? "" : " future"}${k === reached && s.method !== "all" ? " now" : ""}` },
      h("div", { class: "coa-strip-head" }, h("b", null, METHODS[m]), h("span", { class: "muted small" }, phase >= 1 ? `one ${x.unitName} every ${showTime(x.period)}` : "")),
      h("div", { class: "coa-strip-bar", role: "img", "aria-label": phase >= 2 ? `CPU busy ${pctText(x.percent)} of each period` : "not reached yet" },
        phase >= 2 ? h("i", { class: `busy${x.keepsUp ? "" : " over"}`, style: `width:max(3px, ${busy * 100}%)` }) : null,
        h("span", null, phase >= 3 ? `CPU ${pctText(x.percent)}` : phase >= 2 ? `${x.cycles} cycles = ${showTime(x.busy)}` : "")));
  }));
}

export function simulation(w) {
  return stepFrame(w.steps, CODE, (s) => h("div", null, strips(w.overheads, s),
    h("p", { class: "muted small" }, "Each bar is one period between the CPU's involvements; the shaded part is CPU time spent on the transfer (drawn at least 3 px wide so tiny shares stay visible).")),
  { label: "Step", interval: 1500 });
}

function modesCard(X, Y, onChange) {
  let m, err;
  try { m = dmaModes(X, Y); } catch (e) { err = e.message; }
  const lane = (kind) => {
    const r = m[kind];
    const total = 2 * (X + Y);
    const segs = [];
    for (let k = 0; k < 2; k++) {
      if (kind === "burst") segs.push(["prep", X], ["xfer", Y]);
      else if (kind === "steal") segs.push(["prep", X - Math.min(Y, X)], ["xfer", Math.min(Y, X)]);
      else segs.push(["prep", X - Math.min(Y, X)], ["xfer free", Math.min(Y, X)]);
    }
    const used = segs.reduce((s, x) => s + x[1], 0);
    if (used < total) segs.push(["idle", total - used]);
    return h("div", { class: "coa-strip" },
      h("div", { class: "coa-strip-head" }, h("b", null, DMA_MODES[kind]), h("span", { class: "small" }, `CPU blocked ${r.formula} = `, h("b", null, pctText(r.blocked * 100)))),
      h("div", { class: "coa-strip-bar lanes", role: "img", "aria-label": `${DMA_MODES[kind]}: blocked ${pctText(r.blocked * 100)} of the time` },
        segs.map(([cls, d]) => h("i", { class: cls, style: `flex:${Math.max(d, 0)}`, title: cls === "prep" ? "device preparing, CPU runs" : cls === "xfer" ? "transfer: CPU blocked" : cls === "xfer free" ? "transfer in cycles the CPU doesn't use" : "" }))));
  };
  return h("section", { class: "card" }, h("h2", null, "DMA modes: how long is the CPU blocked?"),
    h("div", { class: "row" },
      numIn("Preparation X (µs)", X, (v) => onChange(v, Y), { min: 0, width: 90 }),
      numIn("Transfer Y (µs)", Y, (v) => onChange(X, v), { min: 0, width: 90 })),
    err ? notice("error", err) : h("div", null,
      h("div", { class: "coa-strips" }, ["burst", "steal", "interleave"].map(lane)),
      h("div", { class: "legend-row small" }, h("span", null, h("i", { class: "coa-key prep" }), " preparing (CPU runs)"), h("span", null, h("i", { class: "coa-key xfer" }), " transfer, CPU blocked"), h("span", null, h("i", { class: "coa-key free" }), " transfer, CPU not blocked")),
      h("p", { class: "muted small" }, "Burst: the device prepares the data, then the DMA holds the bus for the whole transfer, so the CPU loses Y in every X + Y. Cycle stealing: the next data is prepared while the current data moves, so one stolen slot of Y every X. Interleaving: the DMA only uses bus cycles the CPU doesn't need, so the CPU never waits.")));
}

export function render(root) {
  const p = fromParams(readParams());
  let sim = null;
  const head = page({
    subject: "Computer organisation",
    title: "I/O, interrupts and DMA",
    lede: "Compare polling, interrupts and DMA by how much CPU time each one eats, worked out step by step.",
    theory: h("div", null,
      h("p", null, "Moving data between a device and memory can be done three ways:"),
      h("ul", null,
        h("li", null, h("b", null, "Programmed I/O"), ": the CPU checks a status register (polls) and copies each unit itself. Simple, but the CPU must poll as often as data arrives."),
        h("li", null, h("b", null, "Interrupt-driven I/O"), ": the device interrupts when a unit is ready. No wasted polls, but each interrupt costs saving state, running the handler and returning."),
        h("li", null, h("b", null, "DMA"), ": the CPU tells a DMA controller the address, count and direction; the controller moves the whole block over the bus and interrupts once at the end. The CPU pays per block, not per unit.")),
      h("p", null, "Share of CPU time = (events per second × cycles per event) ÷ clock rate. Events per second = device rate ÷ bytes per event."),
      h("p", null, "While the DMA controller uses the bus, the CPU may have to wait for it: all at once in ", h("b", null, "burst mode"), ", one bus cycle at a time in ", h("b", null, "cycle stealing"), ", or never in ", h("b", null, "interleaving"), " mode.")),
    conventions: [
      "Rates are decimal: 1 KB/s = 1000 bytes per second, 1 MHz = 10⁶ cycles per second.",
      "Programmed I/O polls once per transfer unit (Hennessy & Patterson's model), so the polling rate matches the device.",
      "Interrupt-driven I/O takes one interrupt per transfer unit; the cycle count covers entry, handler and return.",
      "DMA's CPU cost here is set-up plus the completion interrupt, once per block. Bus time is covered by the DMA modes part.",
      "DMA modes: X is the device's preparation time and Y the transfer time. Burst blocks Y in every X + Y; cycle stealing blocks Y in every X.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" }), modes = h("div"), inputs = h("div");
  const save = () => writeParams(toParams(p));

  function drawInputs() {
    const set = (k) => (v) => { p[k] = v; update(); };
    inputs.replaceChildren(
      h("div", { class: "row" },
        numIn("CPU clock (MHz)", p.clockMHz, set("clockMHz"), { min: 0, width: 90 }),
        numIn("Device rate (KB/s)", p.rateKB, set("rateKB"), { min: 0, width: 100 })),
      h("div", { class: "row" },
        numIn("Bytes per poll / interrupt", p.unit, set("unit"), { min: 1, width: 80 }),
        numIn("Cycles per poll", p.poll, set("poll"), { min: 0, width: 80 }),
        numIn("Cycles per interrupt", p.isr, set("isr"), { min: 0, width: 80 })),
      h("div", { class: "row" },
        numIn("DMA block (bytes)", p.block, set("block"), { min: 1, width: 90 }),
        numIn("DMA set-up + completion cycles", p.dma, set("dma"), { min: 0, width: 90 })),
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { Object.assign(p, ex.p); update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(p, randomParams(rng())); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
  }

  function drawModes() {
    modes.replaceChildren(modesCard(p.X, p.Y, (X, Y) => { p.X = X; p.Y = Y; drawModes(); save(); }));
  }

  function update() {
    drawInputs();
    save();
    sim?.player.destroy();
    try {
      const w = walkthrough(p);
      msg.replaceChildren();
      sim = simulation(w);
      const o = w.overheads;
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, "Where the CPU's time goes"), sim.el),
        h("section", { class: "card" }, h("h2", null, "Side by side"),
          h("div", { class: "table-wrap" }, h("table", null,
            h("thead", null, h("tr", null, ["Method", "CPU involved per", "Times a second", "Cycles each", "Cycles a second", "CPU share"].map((t) => h("th", { scope: "col" }, t)))),
            h("tbody", null, ORDER.map((m) => h("tr", null, h("th", { scope: "row" }, METHODS[m]), h("td", null, `${o[m].size} bytes`), h("td", null, o[m].events), h("td", null, o[m].cycles), h("td", null, o[m].cyclesPerSecond), h("td", { class: o[m].keepsUp ? null : "bad-text" }, pctText(o[m].percent))))))),
          h("p", { class: "muted small" }, "A share over 100% means the CPU can't keep up with the device that way at all.")));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out, modes);

  // --- Practice -----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const again = h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question");
    const card = h("section", { class: "card" }, h("div", { class: "row" }, again));
    if (r() < 0.7) {
      const q = randomParams(r);
      const o = overheads(q);
      const m = ORDER[Math.floor(r() * 3)];
      if (!o[m].keepsUp || o[m].percent < 0.01) return newQuestion();
      const what = m === "programmed" ? `It is polled once per ${q.unit} bytes, each poll costing ${q.poll} cycles.` : m === "interrupt" ? `It interrupts once per ${q.unit} bytes; each interrupt costs ${q.isr} cycles.` : `It uses DMA with ${q.block}-byte blocks; set-up and completion cost ${q.dma} cycles per block.`;
      card.append(h("h2", null, METHODS[m]),
        h("p", null, `A device sends ${q.rateKB} KB/s (1 KB = 1000 bytes) to a ${q.clockMHz} MHz CPU. ${what} What percentage of CPU time does the transfer take (two decimals)?`),
        natQuestion(Math.round(o[m].percent * 100) / 100, `${o[m].events} ${o[m].unitName}s a second × ${o[m].cycles} cycles = ${o[m].cyclesPerSecond} cycles a second, out of ${o.f}: ${pctText(o[m].percent)}.`, { tol: 0.01 }));
    } else {
      const X = [20, 40, 100, 200, 1000][Math.floor(r() * 5)], Y = [1, 2, 4, 5, 10][Math.floor(r() * 5)];
      const kind = r() < 0.5 ? "burst" : "steal";
      const m = dmaModes(X, Y)[kind];
      card.append(h("h2", null, `DMA, ${DMA_MODES[kind].toLowerCase()}`),
        h("p", null, `Preparing data takes ${X} µs and transferring it takes ${Y} µs. In ${DMA_MODES[kind].toLowerCase()} mode, for what percentage of the time is the CPU blocked (two decimals)?`),
        natQuestion(Math.round(m.blocked * 1e4) / 100, `${m.formula} = ${kind === "burst" ? `${Y} ÷ ${X + Y}` : `${Y} ÷ ${X}`} = ${pctText(m.blocked * 100)}.`, { tol: 0.01 }));
    }
    practice.replaceChildren(card);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  drawModes();
  update();
  return () => sim?.player.destroy();
}
