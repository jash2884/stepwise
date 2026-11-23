// I/O transfer methods and how much CPU time each one costs.
//
// Conventions (stated in the UI):
// - Rates are decimal: 1 KB/s = 1000 bytes per second, 1 MHz = 10^6 cycles/s.
// - Programmed I/O polls once per transfer unit, and each poll costs a fixed
//   number of cycles (Hennessy & Patterson's model). Interrupt-driven I/O takes
//   one interrupt per unit. DMA costs the CPU only its set-up and completion
//   cycles per block (bus cycles stolen are covered by the DMA modes part).
// - DMA modes: X is the time the device needs to prepare data, Y the time the
//   transfer holds the bus. Burst mode prepares, then transfers with the bus
//   held, so the CPU loses Y every X + Y. Cycle stealing prepares the next word
//   while the current one moves, so the CPU loses Y every X. Interleaving uses
//   only cycles the CPU isn't using the bus, so it loses nothing.

export const METHODS = { programmed: "Programmed I/O (polling)", interrupt: "Interrupt-driven I/O", dma: "DMA" };
export const DMA_MODES = { burst: "Burst", steal: "Cycle stealing", interleave: "Interleaving" };

export const CODE = [
  "// Programmed I/O: the CPU checks the device itself",
  "repeat for every unit: while status ≠ ready: poll  // costs cycles each check",
  "  copy the data register to memory",
  "// Interrupt-driven: the device calls the CPU",
  "on each interrupt: save state; jump to the handler  // overhead",
  "  copy one unit; restore state; return",
  "// DMA: the controller moves whole blocks",
  "CPU writes address, count and direction to the DMA controller  // set-up",
  "DMA moves the whole block over the bus, no CPU instructions",
  "DMA interrupts the CPU when the count reaches 0  // completion",
];

const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function validate(p) {
  const need = [["clockMHz", "Clock"], ["rateKB", "Device rate"], ["unit", "Transfer unit"], ["block", "DMA block"]];
  for (const [k, name] of need) if (!(p[k] > 0)) throw new Error(`${name} must be more than 0.`);
  for (const k of ["poll", "isr", "dma"]) if (!(p[k] >= 0)) throw new Error("Cycle counts must be 0 or more.");
  if (p.block < p.unit) throw new Error("A DMA block should be at least one transfer unit.");
}

// CPU fraction for each method, and the working.
export function overheads(p) {
  validate(p);
  const f = p.clockMHz * 1e6, rate = p.rateKB * 1000;
  const one = (cycles, unitName, size) => {
    const events = rate / size; // per second
    const period = 1 / events; // seconds between events
    const busy = cycles / f; // seconds of CPU per event
    const fraction = (events * cycles) / f;
    return { events: r6(events), period, busy, cyclesPerSecond: r6(events * cycles), fraction, percent: r6(fraction * 100), unitName, size, cycles, keepsUp: fraction <= 1 };
  };
  return {
    programmed: one(p.poll, "poll", p.unit),
    interrupt: one(p.isr, "interrupt", p.unit),
    dma: one(p.dma, "block", p.block),
    f, rate,
  };
}

const time = (s) => {
  const a = Math.abs(s);
  if (a === 0) return "0";
  if (a >= 1) return `${r6(s)} s`;
  if (a >= 1e-3) return `${r6(s * 1e3)} ms`;
  if (a >= 1e-6) return `${r6(s * 1e6)} µs`;
  return `${r6(s * 1e9)} ns`;
};
export { time as showTime };

// Steps through the working for all three methods.
export function walkthrough(p) {
  const o = overheads(p);
  const steps = [];
  const v = (extra) => ({ "f (Hz)": o.f, "rate (B/s)": o.rate, ...extra });
  steps.push({ method: null, line: [], note: `The device moves ${o.rate} bytes a second; the CPU runs ${o.f} cycles a second. For each method: how often does the CPU get involved, how long does each involvement take, and what share of its time is that?`, vars: v({}) });
  const parts = [
    ["programmed", [2], [3], "poll", `Programmed I/O: the CPU must check the device once per ${p.unit}-byte unit, so ${o.rate} ÷ ${p.unit} = ${o.programmed.events} polls a second, one every ${time(o.programmed.period)}.`, `Each poll costs ${p.poll} cycles = ${time(o.programmed.busy)} of CPU time.`],
    ["interrupt", [5], [5, 6], "interrupt", `Interrupt-driven: the device interrupts once per ${p.unit}-byte unit: ${o.interrupt.events} interrupts a second, one every ${time(o.interrupt.period)}. Between them the CPU is free.`, `Each interrupt (save state, handler, return) costs ${p.isr} cycles = ${time(o.interrupt.busy)}.`],
    ["dma", [8], [8, 10], "block", `DMA: the CPU is involved once per ${p.block}-byte block: ${o.rate} ÷ ${p.block} = ${o.dma.events} blocks a second, one every ${time(o.dma.period)}.`, `Per block the CPU spends ${p.dma} cycles setting up and handling the completion interrupt = ${time(o.dma.busy)}. The bytes themselves move without it.`],
  ];
  for (const [m, l1, l2, word, s1, s2] of parts) {
    const x = o[m];
    steps.push({ method: m, phase: 1, line: l1, note: s1, vars: v({ [`${word}s/s`]: x.events, period: time(x.period) }) });
    steps.push({ method: m, phase: 2, line: l2, note: s2, vars: v({ [`${word}s/s`]: x.events, [`cycles/${word}`]: x.cycles, "busy each": time(x.busy) }) });
    steps.push({ method: m, phase: 3, line: l2, note: `Share of CPU time = ${x.events} × ${x.cycles} ÷ ${o.f} = ${x.percent}%.${x.keepsUp ? "" : " That is over 100%: the CPU can't keep up with this device this way."}`, vars: v({ "cycles/s": x.cyclesPerSecond, "CPU share": `${x.percent}%` }) });
  }
  const best = ["programmed", "interrupt", "dma"].reduce((a, b) => (o[a].fraction <= o[b].fraction ? a : b));
  steps.push({ method: "all", line: [], final: true, note: `Programmed ${o.programmed.percent}%, interrupt-driven ${o.interrupt.percent}%, DMA ${o.dma.percent}%. ${METHODS[best]} costs the CPU least here${best === "dma" ? ", because it pays once per block instead of once per unit" : ""}.`, vars: v({ programmed: `${o.programmed.percent}%`, interrupt: `${o.interrupt.percent}%`, dma: `${o.dma.percent}%` }) });
  return { overheads: o, steps };
}

// DMA modes: share of time the CPU is blocked, given prep X and transfer Y.
export function dmaModes(X, Y) {
  if (!(X > 0) || !(Y > 0)) throw new Error("Preparation and transfer times must be more than 0.");
  return {
    burst: { blocked: r6(Y / (X + Y)), period: X + Y, formula: "Y ÷ (X + Y)" },
    steal: { blocked: r6(Math.min(1, Y / X)), period: X, formula: "Y ÷ X" },
    interleave: { blocked: 0, period: X, formula: "0" },
  };
}

export const DEFAULT = { clockMHz: 500, rateKB: 4000, unit: 16, poll: 400, isr: 500, block: 4096, dma: 1500, X: 2000, Y: 20 };

export const EXAMPLES = {
  disk: { name: "Disk, 4 MB/s (Hennessy & Patterson)", p: { clockMHz: 500, rateKB: 4000, unit: 16, poll: 400, isr: 500, block: 4096, dma: 1500 } },
  mouse: { name: "Slow device: keyboard-like, 1 KB/s", p: { clockMHz: 500, rateKB: 1, unit: 1, poll: 400, isr: 500, block: 64, dma: 1500 } },
  gate: { name: "GATE 2004: 10 MB/s disk, 20 KB DMA", p: { clockMHz: 600, rateKB: 10000, unit: 4, poll: 300, isr: 600, block: 20000, dma: 1200 } },
};

export function randomParams(r = Math.random) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  return {
    clockMHz: pick([100, 200, 250, 400, 500, 800, 1000]), rateKB: pick([1, 10, 100, 500, 1000, 2000, 4000, 8000]),
    unit: pick([1, 2, 4, 8, 16]), poll: pick([100, 200, 400, 500]), isr: pick([200, 400, 500, 1000]),
    block: pick([512, 1000, 1024, 2000, 4096]), dma: pick([500, 1000, 1500, 2000]),
  };
}

// Shareable URL state.
const KEYS = { f: "clockMHz", rate: "rateKB", unit: "unit", poll: "poll", isr: "isr", blk: "block", dma: "dma", X: "X", Y: "Y" };
export function toParams(p) { return Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, p[v]])); }
export function fromParams(q) {
  const out = { ...DEFAULT };
  for (const [k, v] of Object.entries(KEYS)) { const x = Number(q.get(k)); if (q.get(k) != null && q.get(k) !== "" && Number.isFinite(x) && x >= 0) out[v] = x; }
  return out;
}
