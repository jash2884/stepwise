// Sequential circuits: SR, JK, D and T flip-flops clocked edge by edge, their
// characteristic and excitation tables, flip-flop conversion (minimised with the
// K-map engine), synchronous counters designed for any count sequence, ripple
// counters with mod-N reset, ring and Johnson counters, and the analysis of a
// synchronous circuit from its flip-flop input equations.
import { minimise, NAMES } from "./kmap.js";

export const FLIP_FLOPS = {
  sr: { name: "SR", inputs: ["S", "R"] },
  jk: { name: "JK", inputs: ["J", "K"] },
  d: { name: "D", inputs: ["D"] },
  t: { name: "T", inputs: ["T"] },
};

// Next state, or null for SR with S = R = 1 (not allowed). Q may be null (unknown).
export function next(type, inp, q) {
  if (type === "d") return inp[0];
  if (type === "t") return q === null ? null : inp[0] ? 1 - q : q;
  const [a, b] = inp;
  if (type === "sr") return a && b ? null : a ? 1 : b ? 0 : q;
  if (type === "jk") return a && b ? (q === null ? null : 1 - q) : a ? 1 : b ? 0 : q;
  throw new Error(`Unknown flip-flop ${type}`);
}

export const ACTION = {
  sr: (i) => (i[0] && i[1] ? "invalid (S = R = 1 is not allowed)" : i[0] ? "set" : i[1] ? "reset" : "hold"),
  jk: (i) => (i[0] && i[1] ? "toggle" : i[0] ? "set" : i[1] ? "reset" : "hold"),
  d: (i) => (i[0] ? "store 1" : "store 0"),
  t: (i) => (i[0] ? "toggle" : "hold"),
};

export const CHARACTERISTIC = {
  sr: "Q+ = S + R'Q  (SR = 0)",
  jk: "Q+ = JQ' + K'Q",
  d: "Q+ = D",
  t: "Q+ = T XOR Q",
};

// Inputs needed to go from q to qn: an array per input of 0, 1 or "X".
export function excitation(type, q, qn) {
  if (type === "d") return [qn];
  if (type === "t") return [q ^ qn];
  if (type === "sr") return [[0, "X"], [1, 0], [0, 1], ["X", 0]][q * 2 + qn];
  if (type === "jk") return [[0, "X"], [1, "X"], ["X", 1], ["X", 0]][q * 2 + qn];
  throw new Error(`Unknown flip-flop ${type}`);
}

// Rows of the characteristic table: every input combination with Q = 0 and 1.
export function characteristicTable(type) {
  const k = FLIP_FLOPS[type].inputs.length, rows = [];
  for (let v = 0; v < 1 << k; v++) for (const q of [0, 1]) {
    const inp = Array.from({ length: k }, (_, j) => (v >> (k - 1 - j)) & 1);
    rows.push({ inputs: inp, q, qn: next(type, inp, q) });
  }
  return rows;
}

export const FF_CODE = [
  "wait for the rising clock edge",
  "read the inputs just before the edge",
  "Q+ ← characteristic(inputs, Q)",
  "Q ← Q+; Q' ← NOT Q+  // holds until the next edge",
];

// Clock a flip-flop through a list of input vectors (one per rising edge).
export function clockFF(type, inputSeq, q0 = 0) {
  if (!FLIP_FLOPS[type]) throw new Error("Pick SR, JK, D or T.");
  const k = FLIP_FLOPS[type].inputs.length;
  if (!inputSeq.length) throw new Error("Give at least one clock cycle of inputs.");
  if (inputSeq.length > 16) throw new Error("Use at most 16 clock cycles.");
  for (const v of inputSeq) if (v.length !== k || v.some((b) => b !== 0 && b !== 1)) throw new Error(`Each clock cycle needs ${k} input bit${k === 1 ? "" : "s"} (${FLIP_FLOPS[type].inputs.join(", ")}).`);
  let q = q0;
  const rows = [], steps = [];
  const names = FLIP_FLOPS[type].inputs;
  steps.push({ edge: -1, q, line: 1, vars: { Q: q, edge: 0 }, note: `Start with Q = ${q}. Nothing changes between clock edges, whatever the inputs do.` });
  inputSeq.forEach((inp, e) => {
    const qn = next(type, inp, q);
    const act = ACTION[type](inp);
    rows.push({ edge: e + 1, inputs: inp, q, qn, action: act });
    steps.push({ edge: e, q: qn, line: [2, 3, 4], vars: { edge: e + 1, ...Object.fromEntries(names.map((n, j) => [n, inp[j]])), Q: q ?? "?", "Q+": qn ?? "?" },
      note: `Edge ${e + 1}: ${names.map((n, j) => `${n} = ${inp[j]}`).join(", ")} with Q = ${q ?? "?"}: ${act}, so Q becomes ${qn ?? "unknown"}.${qn === null && type === "sr" ? " The output is unpredictable until the flip-flop is set or reset again." : ""}` });
    q = qn;
  });
  return { type, q0, rows, steps, final: q };
}

// --- Conversion ---------------------------------------------------------------------------

// Build flip-flop `to` out of flip-flop `from` plus logic: the inputs of `from`
// as minimised functions of the inputs of `to` and Q.
export function convertFF(from, to) {
  if (!FLIP_FLOPS[from] || !FLIP_FLOPS[to]) throw new Error("Pick SR, JK, D or T.");
  const yIn = FLIP_FLOPS[to].inputs, xIn = FLIP_FLOPS[from].inputs;
  const vars = [...yIn, "Q"], n = vars.length;
  const rows = [];
  const ones = xIn.map(() => []), dcs = xIn.map(() => []);
  for (let m = 0; m < 1 << n; m++) {
    const bits = Array.from({ length: n }, (_, i) => (m >> (n - 1 - i)) & 1);
    const inp = bits.slice(0, -1), q = bits[n - 1];
    const qn = next(to, inp, q);
    const need = qn === null ? xIn.map(() => "X") : excitation(from, q, qn);
    rows.push({ m, inputs: inp, q, qn, need });
    need.forEach((v, j) => { if (v === 1) ones[j].push(m); else if (v === "X") dcs[j].push(m); });
  }
  const eqs = xIn.map((name, j) => {
    const r = minimise(n, ones[j], dcs[j], { names: vars });
    return { name, ones: ones[j], dcs: dcs[j], expr: r.expr, result: r };
  });
  return { from, to, vars, rows, eqs };
}

// --- Synchronous counters ---------------------------------------------------------------------

export const SYNC_CODE = [
  "list the count sequence; unused states are don't-cares",
  "for each present state Q, next state Q+ ← the following count",
  "  for each flip-flop: inputs ← excitation(Q bit, Q+ bit)",
  "minimise each flip-flop input with a K-map",
  "on every clock edge: all flip-flops change together",
];

export function bitsFor(maxState) { let b = 1; while (1 << b <= maxState) b++; return b; }
const qNames = (bits) => Array.from({ length: bits }, (_, i) => `Q${bits - 1 - i}`);
const binary = (v, bits) => v.toString(2).padStart(bits, "0");

// Mod-N up or down count sequence.
export function modSequence(N, down = false) {
  if (!Number.isInteger(N) || N < 2 || N > 32) throw new Error("Use a modulus from 2 to 32.");
  const seq = Array.from({ length: N }, (_, i) => i);
  return down ? [0, ...seq.slice(1).reverse()] : seq;
}

export function parseSequence(text) {
  const parts = String(text).split(/[\s,→>-]+/).filter(Boolean);
  const seq = parts.map(Number);
  if (seq.length < 2) throw new Error("Give at least two states.");
  if (seq.some((x) => !Number.isInteger(x) || x < 0 || x > 31)) throw new Error("States must be whole numbers from 0 to 31.");
  if (new Set(seq).size !== seq.length) throw new Error("Each state may appear only once in the sequence.");
  return seq;
}

// Design a synchronous counter that steps through `seq` (and back to the start).
export function syncCounter(seq, type = "t") {
  if (!FLIP_FLOPS[type]) throw new Error("Pick SR, JK, D or T.");
  const bits = Math.max(2, bitsFor(Math.max(...seq)));
  if (bits > 5) throw new Error("Use states below 32.");
  const names = qNames(bits);
  const nxt = new Map(seq.map((s, i) => [s, seq[(i + 1) % seq.length]]));
  const unused = Array.from({ length: 1 << bits }, (_, s) => s).filter((s) => !nxt.has(s));
  const inputs = FLIP_FLOPS[type].inputs;
  // One function per flip-flop input, over Q(bits-1)…Q0.
  const fns = [];
  for (let f = bits - 1; f >= 0; f--) for (let j = 0; j < inputs.length; j++) fns.push({ ff: f, label: `${inputs[j]}${f}`, j, ones: [], dcs: [...unused] });
  const table = seq.map((s) => {
    const n = nxt.get(s);
    const need = [];
    for (let f = bits - 1; f >= 0; f--) need.push(excitation(type, (s >> f) & 1, (n >> f) & 1));
    fns.forEach((fn) => {
      const v = need[bits - 1 - fn.ff][fn.j];
      if (v === 1) fn.ones.push(s); else if (v === "X") fn.dcs.push(s);
    });
    return { s, n, need };
  });
  for (const fn of fns) {
    fn.dcs.sort((a, b) => a - b); fn.ones.sort((a, b) => a - b);
    const r = minimise(bits, fn.ones, fn.dcs, { names });
    fn.expr = r.expr;
    fn.result = r;
  }
  const steps = [];
  steps.push({ state: seq[0], line: [1, 2, 3, 4], vars: { "flip-flops": bits, states: seq.length, unused: unused.length },
    note: `${seq.length} states need ${bits} flip-flops (2^${bits} = ${1 << bits} ≥ ${seq.length}${Math.max(...seq) >= seq.length ? `, and the largest state ${Math.max(...seq)} must fit` : ""}).${unused.length ? ` Unused states ${unused.join(", ")} are don't-cares.` : ""} Inputs: ${fns.map((f) => `${f.label} = ${f.expr}`).join(", ")}.` });
  seq.forEach((s, i) => {
    const n = nxt.get(s);
    steps.push({ state: n, from: s, edge: i + 1, line: 5, vars: { edge: i + 1, Q: binary(s, bits), "Q+": binary(n, bits), ...Object.fromEntries(fns.map((f) => [f.label, evalFn(f, s)])) },
      note: `Edge ${i + 1}: in state ${binary(s, bits)} (${s}) the inputs are ${fns.map((f) => `${f.label}=${evalFn(f, s)}`).join(", ")}, so every flip-flop changes at once to ${binary(n, bits)} (${n}).${i === seq.length - 1 ? " Back to the start: the count repeats." : ""}` });
  });
  // Where each unused state goes with the minimised logic (lock-out check).
  const stray = unused.map((s) => ({ s, n: simulateStateWith(fns, type, bits, s) }));
  return { seq, type, bits, names, table, fns, unused, stray, steps, selfStarting: selfStarting(stray, seq, fns, type, bits) };
}
const evalFn = (fn, s) => (fn.result.chosen.some((t) => (s & ~t.mask) === t.value) ? 1 : 0);
function simulateStateWith(fns, type, bits, s) {
  let n = 0;
  for (let f = bits - 1; f >= 0; f--) {
    const inp = fns.filter((x) => x.ff === f).map((x) => evalFn(x, s));
    const q = next(type, inp, (s >> f) & 1);
    n |= (q ?? 0) << f;
  }
  return n;
}
function selfStarting(stray, seq, fns, type, bits) {
  const inSeq = new Set(seq);
  return stray.every(({ s }) => {
    let x = s;
    for (let k = 0; k < 40; k++) { if (inSeq.has(x)) return true; x = simulateStateWith(fns, type, bits, x); }
    return false;
  });
}

// --- Ripple counters -------------------------------------------------------------------------

export const RIPPLE_CODE = [
  "FF0 toggles on every clock pulse",
  "FFi toggles when FF(i−1) goes 1 → 0  // up counter: clocked by Q(i−1)",
  "each flip-flop changes tpd after its own clock, so changes ripple",
  "if the count reaches N then clear every flip-flop  // mod-N reset",
];

// Asynchronous up (or down) counter of `bits` T flip-flops; mod N via asynchronous
// clear when the count reaches N (up counters only). tpd per flip-flop.
export function rippleCounter(N, { down = false, tpd = 10 } = {}) {
  if (!Number.isInteger(N) || N < 2 || N > 64) throw new Error("Use a modulus from 2 to 64.");
  const bits = bitsFor(N - 1);
  const full = 1 << bits;
  const steps = [];
  let s = 0;
  steps.push({ state: s, chain: [s], pulse: 0, line: 1, vars: { count: s, bits }, note: `${bits} flip-flops (2^${bits} = ${full} ≥ ${N}). Start at ${binary(0, bits)}.${N < full && !down ? ` To count mod ${N}, a gate watches for ${N} (${binary(N, bits)}) and clears every flip-flop at once.` : ""}` });
  for (let p = 1; p <= N; p++) {
    // Toggle FF0, then ripple while a flip-flop makes the edge that clocks the next one.
    const chain = [s];
    let x = s;
    for (let i = 0; i < bits; i++) {
      const old = (x >> i) & 1;
      x ^= 1 << i;
      chain.push(x);
      const fell = old === 1; // 1 → 0 clocks the next stage in an up counter
      const rose = old === 0;
      if (!(down ? rose : fell)) break;
    }
    let reset = false;
    if (!down && x === N && N < full) { x = 0; chain.push(0); reset = true; }
    if (down && N < full && x >= N) { x = N - 1; chain.push(x); reset = true; }
    s = x;
    const settle = (chain.length - 1) * tpd;
    steps.push({ state: s, chain, pulse: p, reset, line: reset ? [3, 4] : chain.length > 2 ? [1, 2, 3] : 1, vars: { pulse: p, count: s, "passes through": chain.map((c) => binary(c, bits)).join(" → "), settles: `${settle} ns` },
      note: `Pulse ${p}: ${chain.map((c) => binary(c, bits)).join(" → ")}.${chain.length > 2 ? ` The change ripples through ${chain.length - 1 - (reset ? 1 : 0)} flip-flop${chain.length - 1 - (reset ? 1 : 0) === 1 ? "" : "s"}, so the in-between values are brief glitches.` : ""}${reset ? ` ${binary(chain[chain.length - 2], bits)} appears for an instant and the ${down ? `preset loads ${binary(N - 1, bits)}` : "clear sends it back to 0"}.` : ""}` });
  }
  return { N, bits, down, tpd, steps, maxDelay: bits * tpd, maxFreqMHz: 1000 / (bits * tpd) };
}

// --- Ring and Johnson counters ------------------------------------------------------------

export function shiftCounter(kind, bits) {
  if (!Number.isInteger(bits) || bits < 2 || bits > 8) throw new Error("Use 2 to 8 flip-flops.");
  let s = kind === "ring" ? 1 << (bits - 1) : 0;
  const seq = [s];
  for (;;) {
    const lsb = s & 1;
    const inBit = kind === "ring" ? lsb : 1 - lsb; // Johnson feeds back Q0'
    s = (s >> 1) | (inBit << (bits - 1));
    if (s === seq[0]) break;
    seq.push(s);
  }
  return { kind, bits, seq, states: seq.length, unused: (1 << bits) - seq.length };
}

// --- Analysis -------------------------------------------------------------------------------------

export const ANALYSE_CODE = [
  "start in the given state",
  "evaluate every flip-flop input from the present state",
  "Q+ ← characteristic(inputs, Q) for every flip-flop at once",
  "repeat until a state comes back",
];

// fns: per flip-flop (MSB first) an array of input truth tables, each a list of
// minterms over the state bits. Returns the state sequence from `start`.
export function analyse(type, bits, fns, start = 0) {
  if (!FLIP_FLOPS[type]) throw new Error("Pick SR, JK, D or T.");
  if (!Number.isInteger(bits) || bits < 2 || bits > 4) throw new Error("Use 2 to 4 flip-flops.");
  if (!Number.isInteger(start) || start < 0 || start >= 1 << bits) throw new Error(`The start state must be 0 to ${(1 << bits) - 1}.`);
  const step = (s) => {
    let n = 0, invalid = false;
    const ins = [];
    for (let f = 0; f < bits; f++) {
      const idx = bits - 1 - f; // flip-flop number (Q idx)
      const inp = fns[f].map((ones) => (ones.includes(s) ? 1 : 0));
      ins.push(inp);
      const q = next(type, inp, (s >> idx) & 1);
      if (q === null) invalid = true;
      n |= (q ?? 0) << idx;
    }
    return { n, ins, invalid };
  };
  const seq = [start], steps = [];
  const names = qNames(bits), inNames = FLIP_FLOPS[type].inputs;
  steps.push({ state: start, line: 1, vars: { Q: binary(start, bits) }, note: `Start in ${binary(start, bits)} (${start}).` });
  const seen = new Set([start]);
  let s = start, cycleStart = null;
  for (let k = 0; k < 1 << bits; k++) {
    const { n, ins, invalid } = step(s);
    const inText = ins.map((inp, f) => inp.map((v, j) => `${inNames[j]}${bits - 1 - f}=${v}`).join(" ")).join(", ");
    steps.push({ state: n, from: s, line: [2, 3], vars: { Q: binary(s, bits), inputs: inText, "Q+": binary(n, bits) },
      note: `In ${binary(s, bits)}: ${inText}${invalid ? " (S = R = 1, not allowed; treated as 0)" : ""}. Next state ${binary(n, bits)} (${n}).${seen.has(n) ? ` ${n} has been seen before, so the sequence repeats from here.` : ""}` });
    if (seen.has(n)) { cycleStart = n; break; }
    seen.add(n); seq.push(n); s = n;
  }
  const cycle = seq.slice(seq.indexOf(cycleStart));
  // Full transition map, for the state diagram.
  const map = Array.from({ length: 1 << bits }, (_, x) => step(x).n);
  steps.push({ state: cycleStart, line: 4, vars: { distinct: seq.length, "cycle length": cycle.length }, note: `Sequence: ${seq.join(" → ")} → ${cycleStart}. ${seq.length} distinct states; it then loops through ${cycle.length}.` });
  return { type, bits, names, seq, cycle, map, steps };
}

// Format input equations for display: minimised SOP over Q names.
export function equationsText(type, bits, fns) {
  const names = qNames(bits), inNames = FLIP_FLOPS[type].inputs;
  return fns.flatMap((list, f) => list.map((ones, j) => `${inNames[j]}${bits - 1 - f} = ${minimise(bits, ones, [], { names }).expr}`));
}

// Analysis equations in the URL: one hex truth table per flip-flop input, MSB flip-flop first.
export const encodeEq = (fns, bits) => fns.flat().map((ones) => ones.reduce((m, s) => m | (1 << s), 0).toString(16).padStart(Math.max(1, (1 << bits) / 4), "0")).join(".");
export function decodeEq(text, type, bits) {
  const k = FLIP_FLOPS[type].inputs.length, parts = String(text ?? "").split(".");
  if (parts.length !== bits * k || parts.some((x) => !/^[0-9a-f]+$/i.test(x))) return null;
  const masks = parts.map((x) => parseInt(x, 16));
  return Array.from({ length: bits }, (_, f) => Array.from({ length: k }, (_, j) => Array.from({ length: 1 << bits }, (_, s) => s).filter((s) => masks[f * k + j] >> s & 1)));
}

// Random input equations for analysis questions: one truth table per input.
export function randomEquations(r, type, bits) {
  const k = FLIP_FLOPS[type].inputs.length;
  return Array.from({ length: bits }, () => Array.from({ length: k }, () => {
    // Keep functions simple: a random product of at most two literals, or a constant.
    const lits = [];
    const count = r() < 0.15 ? 0 : 1 + Math.floor(r() * 2);
    const vars = Array.from({ length: bits }, (_, i) => i).sort(() => r() - 0.5).slice(0, count);
    for (const v of vars) lits.push([v, r() < 0.5 ? 1 : 0]);
    const constant = count === 0 ? (r() < 0.6 ? 1 : 0) : null;
    return Array.from({ length: 1 << bits }, (_, s) => s).filter((s) => (constant !== null ? constant : lits.every(([v, want]) => ((s >> (bits - 1 - v)) & 1) === want)));
  }));
}

export { NAMES, qNames, binary };
