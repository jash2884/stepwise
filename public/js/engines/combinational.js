// Combinational circuits: multiplexers (and implementing a function with one),
// decoders, half and full adders at gate level, a ripple-carry adder with carry
// propagation delay, and an n-bit magnitude comparator.
import { NAMES } from "./kmap.js";

const bitAt = (m, n, i) => (m >> (n - 1 - i)) & 1; // variable i (0 = A, the MSB) of minterm m

// --- Multiplexers --------------------------------------------------------------------------

// 2^s : 1 MUX: output = inputs[select].
export function mux(inputs, select) {
  const k = inputs.length;
  if (k < 2 || (k & (k - 1))) throw new Error("A multiplexer has 2, 4, 8 or 16 inputs.");
  if (!Number.isInteger(select) || select < 0 || select >= k) throw new Error(`The select lines must pick an input from 0 to ${k - 1}.`);
  return { select, out: inputs[select] };
}

export const MUX_CODE = [
  "choose the data variable; the other variables drive the select lines",
  "for each select combination s (I0, I1, …)",
  "  f0 ← F with the data variable = 0; f1 ← F with it = 1",
  "  if f0 = f1 then Is ← that constant (0 or 1)",
  "  else if f1 = 1 then Is ← the data variable  // F follows it",
  "  else Is ← its complement  // F is the opposite",
];

// Implement F(names) = Σm(ones) + d(dcs) with a 2^(n−1):1 MUX. dataVar is the
// variable left over for the data inputs (default: the last one); the rest go
// on the select lines in order, first one as the most significant select bit.
// A don't-care pair is resolved to the simplest input.
export function muxImplement(n, ones, dcs = [], dataVar = n - 1, names = NAMES) {
  if (!Number.isInteger(n) || n < 2 || n > 5) throw new Error("Use 2 to 5 variables.");
  if (!Number.isInteger(dataVar) || dataVar < 0 || dataVar >= n) throw new Error("Pick one of the variables for the data inputs.");
  const val = (m) => (ones.includes(m) ? 1 : dcs.includes(m) ? "X" : 0);
  const selVars = Array.from({ length: n }, (_, i) => i).filter((i) => i !== dataVar);
  const x = names[dataVar];
  const k = 1 << (n - 1);
  const rows = [], steps = [];
  steps.push({ upto: -1, line: 1, vars: { data: x, selects: selVars.map((i) => names[i]).join("") },
    note: `${x} goes to the data inputs and ${selVars.map((i) => names[i]).join(", ")} drive the select lines, so we need a ${k}:1 MUX. For each select combination, look at the two minterms that differ only in ${x}.` });
  for (let s = 0; s < k; s++) {
    // Build the two minterms: select bits in order, data var 0 / 1.
    const mk = (xv) => {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const bit = i === dataVar ? xv : (s >> (n - 2 - selVars.indexOf(i))) & 1;
        m = (m << 1) | bit;
      }
      return m;
    };
    const m0 = mk(0), m1 = mk(1);
    let f0 = val(m0), f1 = val(m1);
    if (f0 === "X" && f1 === "X") { f0 = 0; f1 = 0; } else if (f0 === "X") f0 = f1; else if (f1 === "X") f1 = f0;
    const input = f0 === f1 ? String(f0) : f1 === 1 ? x : `${x}'`;
    rows.push({ s, m0, m1, f0: val(m0), f1: val(m1), input });
    steps.push({ upto: s, line: f0 === f1 ? [2, 3, 4] : f1 === 1 ? [2, 3, 5] : [2, 3, 6], vars: { s, [`${x}=0`]: `m${m0} → ${val(m0)}`, [`${x}=1`]: `m${m1} → ${val(m1)}`, [`I${s}`]: input },
      note: `I${s}: select ${selVars.map((i, j) => `${names[i]}=${(s >> (n - 2 - j)) & 1}`).join(", ")}. With ${x}=0 we get m${m0} = ${val(m0)}, with ${x}=1 m${m1} = ${val(m1)}${val(m0) === "X" || val(m1) === "X" ? " (X can be either, so pick what is simplest)" : ""}, so I${s} = ${input}.` });
  }
  return { n, k, dataVar, selVars, names, rows, inputs: rows.map((r) => r.input), steps };
}

// Which minterms a MUX realises when its inputs are constants, x or x'.
export function muxFunction(n, inputs, dataVar = n - 1, names = NAMES) {
  const x = names[dataVar], selVars = Array.from({ length: n }, (_, i) => i).filter((i) => i !== dataVar);
  const ones = [];
  for (let m = 0; m < 1 << n; m++) {
    let s = 0;
    selVars.forEach((i) => { s = (s << 1) | bitAt(m, n, i); });
    const xv = bitAt(m, n, dataVar);
    const inp = inputs[s];
    const v = inp === "1" ? 1 : inp === "0" ? 0 : inp === x ? xv : 1 - xv;
    if (v) ones.push(m);
  }
  return ones;
}

// --- Decoders ----------------------------------------------------------------------------------

export function decoder(bits, inputs, enable = 1) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 4) throw new Error("Use a 1-to-2 up to a 4-to-16 decoder.");
  const value = inputs.reduce((v, b) => v * 2 + b, 0);
  const outputs = Array.from({ length: 1 << bits }, (_, i) => (enable && i === value ? 1 : 0));
  return { bits, value, outputs, enable };
}

// --- Adders ---------------------------------------------------------------------------------------

// Gate-level half and full adders: every wire's value.
export function halfAdder(a, b) {
  return { a, b, sum: a ^ b, carry: a & b, wires: { xor: a ^ b, and: a & b } };
}
export function fullAdder(a, b, cin) {
  const x1 = a ^ b, s = x1 ^ cin, g = a & b, p = x1 & cin, cout = g | p;
  return { a, b, cin, sum: s, cout, wires: { x1, g, p } };
}

export const FULL_ADDER_CODE = [
  "read A, B and Cin",
  "X ← A XOR B  // half adder 1: sum",
  "G ← A · B  // half adder 1: carry (generate)",
  "S ← X XOR Cin  // half adder 2: sum",
  "P ← X · Cin  // half adder 2: carry (propagate)",
  "Cout ← G + P",
];
export const HALF_ADDER_CODE = ["read A and B", "S ← A XOR B  // 1 when exactly one input is 1", "C ← A · B  // 1 only when both are 1"];

// Gate-by-gate evaluation: each step reveals more wires.
export function adderSteps(kind, a, b, cin = 0) {
  if (kind === "half") {
    const r = halfAdder(a, b);
    return [
      { known: ["a", "b"], line: 1, vars: { A: a, B: b }, note: `Inputs A = ${a}, B = ${b}.` },
      { known: ["a", "b", "sum"], line: 2, vars: { A: a, B: b, S: r.sum }, note: `S = A XOR B = ${a} XOR ${b} = ${r.sum}.` },
      { known: ["a", "b", "sum", "carry"], line: 3, vars: { A: a, B: b, S: r.sum, C: r.carry }, note: `C = A · B = ${r.carry}. ${a} + ${b} = ${r.carry}${r.sum} in binary.` },
    ];
  }
  const r = fullAdder(a, b, cin);
  const k = ["a", "b", "cin"];
  return [
    { known: k, line: 1, vars: { A: a, B: b, Cin: cin }, note: `Inputs A = ${a}, B = ${b}, Cin = ${cin}.` },
    { known: [...k, "x1"], line: 2, vars: { X: r.wires.x1 }, note: `First XOR: X = ${a} XOR ${b} = ${r.wires.x1}.` },
    { known: [...k, "x1", "g"], line: 3, vars: { X: r.wires.x1, G: r.wires.g }, note: `First AND: G = ${a} · ${b} = ${r.wires.g}${r.wires.g ? ": A and B make a carry by themselves" : ""}.` },
    { known: [...k, "x1", "g", "sum"], line: 4, vars: { X: r.wires.x1, G: r.wires.g, S: r.sum }, note: `Second XOR: S = X XOR Cin = ${r.wires.x1} XOR ${cin} = ${r.sum}.` },
    { known: [...k, "x1", "g", "sum", "p"], line: 5, vars: { X: r.wires.x1, G: r.wires.g, S: r.sum, P: r.wires.p }, note: `Second AND: P = X · Cin = ${r.wires.p}${r.wires.p ? ": the incoming carry passes through" : ""}.` },
    { known: [...k, "x1", "g", "sum", "p", "cout"], line: 6, vars: { S: r.sum, Cout: r.cout }, note: `OR: Cout = G + P = ${r.cout}. ${a} + ${b} + ${cin} = ${a + b + cin} = ${r.cout}${r.sum} in binary.` },
  ];
}

export const DECODER_CODE = [
  "read the input bits and the enable",
  "if enable = 0 then every output ← 0",
  "else k ← the input bits read as a binary number",
  "  output k ← 1, every other output ← 0  // output k is minterm k",
  "F ← OR of the outputs for F's minterms",
];
export function decoderSteps(bits, inputs, enable, ones = []) {
  const d = decoder(bits, inputs, enable);
  const F = enable && ones.includes(d.value) ? 1 : 0;
  return { ...d, F, steps: [
    { show: 0, line: 1, vars: { inputs: inputs.join(""), enable }, note: `Inputs ${inputs.join("")}${enable ? "" : " with enable off"}.` },
    { show: 1, line: enable ? [3, 4] : 2, vars: { k: enable ? d.value : "none", [`D${d.value}`]: enable ? 1 : 0 }, note: enable ? `${inputs.join("")} is ${d.value} in binary, so only output D${d.value} goes high. Each output is one minterm.` : "Enable is 0, so every output stays low whatever the inputs." },
    { show: 2, line: 5, vars: { F }, note: ones.length ? `F = Σm(${ones.join(", ")}) is the OR of outputs ${ones.map((m) => `D${m}`).join(", ")}. ${F ? `D${d.value} is one of them, so F = 1.` : "None of them is high, so F = 0."}` : "Add minterms for F to see a function built from the decoder and one OR gate." },
  ] };
}

export const RIPPLE_CODE = [
  "C0 ← carry in  // ready at time 0, with A and B",
  "for i from 0 to n − 1  // stage i waits for Ci",
  "  Si ← Ai XOR Bi XOR Ci  // ready ts after Ci",
  "  Ci+1 ← AiBi + Ci(Ai XOR Bi)  // ready tc after Ci",
  "the sum is ready when the last Si and Cn have settled",
];

// n-bit ripple-carry adder. Worst-case timing: carry i+1 is ready tc after carry i,
// sum i is ready ts after carry i. Steps are the moments something settles.
export function ripple(aBits, bBits, cin = 0, { tc = 2, ts = 3 } = {}) {
  const A = String(aBits), B = String(bBits);
  if (!/^[01]+$/.test(A) || !/^[01]+$/.test(B)) throw new Error("A and B must be binary.");
  if (A.length !== B.length) throw new Error("A and B need the same number of bits.");
  const n = A.length;
  if (n < 1 || n > 12) throw new Error("Use 1 to 12 bits.");
  if (![tc, ts].every((t) => Number.isInteger(t) && t >= 1 && t <= 50)) throw new Error("Delays must be whole numbers from 1 to 50.");
  const stages = [];
  let c = cin;
  for (let i = 0; i < n; i++) {
    const a = Number(A[n - 1 - i]), b = Number(B[n - 1 - i]);
    const fa = fullAdder(a, b, c);
    stages.push({ i, a, b, cin: c, sum: fa.sum, cout: fa.cout, carryAt: i * tc, sumAt: i * tc + ts, coutAt: (i + 1) * tc });
    c = fa.cout;
  }
  const total = Math.max(n * tc, (n - 1) * tc + ts);
  const times = [...new Set([0, ...stages.flatMap((s) => [s.sumAt, s.coutAt])])].sort((x, y) => x - y);
  const sum = stages.map((s) => s.sum).reverse().join("");
  const steps = times.map((t, k) => {
    const sumsReady = stages.filter((s) => s.sumAt <= t).map((s) => s.i);
    const carriesReady = [0, ...stages.filter((s) => s.coutAt <= t).map((s) => s.i + 1)];
    const fresh = [...stages.filter((s) => s.sumAt === t).map((s) => `S${s.i} = ${s.sum}`), ...stages.filter((s) => s.coutAt === t).map((s) => `C${s.i + 1} = ${s.cout}`)];
    const last = k === times.length - 1;
    return { t, sumsReady, carriesReady, line: t === 0 ? 1 : last ? 5 : [2, 3, 4], vars: { t, "carries ready": `C0…C${Math.max(...carriesReady)}`, "sums ready": sumsReady.length },
      note: t === 0 ? `t = 0: A, B and C0 = ${cin} arrive. Every stage starts computing, but only stage 0 has its real carry in.` : `t = ${t}: ${fresh.join(", ")} settle${fresh.length === 1 ? "s" : ""}.${last ? ` The ${n}-bit sum ${c}|${sum} is complete after ${total} time units: the carry had to ripple through all ${n} stages.` : ""}` };
  });
  return { n, A, B, cin, stages, sum, cout: c, total, tc, ts, steps, value: parseInt(A, 2) + parseInt(B, 2) + cin };
}

// --- Comparator ---------------------------------------------------------------------------------

export const COMPARE_CODE = [
  "for i from the most significant bit down",
  "  xi ← Ai XNOR Bi  // 1 when the bits are equal",
  "  if Ai = 1 and Bi = 0 and every higher x is 1 then A > B",
  "  if Ai = 0 and Bi = 1 and every higher x is 1 then A < B",
  "A = B ← x(n−1) · … · x1 · x0",
];

export function compare(aBits, bBits) {
  const A = String(aBits), B = String(bBits);
  if (!/^[01]+$/.test(A) || !/^[01]+$/.test(B)) throw new Error("A and B must be binary.");
  if (A.length !== B.length) throw new Error("A and B need the same number of bits.");
  const n = A.length;
  if (n > 12) throw new Error("Use at most 12 bits.");
  const steps = [];
  let decided = null, at = null;
  const x = [];
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k, a = Number(A[k]), b = Number(B[k]);
    x.push(a === b ? 1 : 0);
    let note = `Bit ${i}: A${i} = ${a}, B${i} = ${b}, so x${i} = ${a === b ? 1 : 0}.`;
    if (!decided) {
      if (a > b) { decided = "gt"; at = i; note += ` All higher bits were equal, so A > B is decided here.`; }
      else if (a < b) { decided = "lt"; at = i; note += ` All higher bits were equal, so A < B is decided here.`; }
      else note += " Equal so far: look at the next bit.";
    } else note += " Already decided by a higher bit, so this bit doesn't matter.";
    steps.push({ bit: i, x: [...x], decided, line: a > b ? [1, 2, 3] : a < b ? [1, 2, 4] : [1, 2], vars: { i, [`A${i}`]: a, [`B${i}`]: b, [`x${i}`]: a === b ? 1 : 0, result: decided ?? "equal so far" }, note });
  }
  const eq = decided === null ? 1 : 0;
  steps.push({ bit: -1, x, decided: decided ?? "eq", line: 5, vars: { "A>B": decided === "gt" ? 1 : 0, "A=B": eq, "A<B": decided === "lt" ? 1 : 0 },
    note: decided === null ? "Every x is 1, so A = B." : `A ${decided === "gt" ? ">" : "<"} B, decided at bit ${at}. A = B is 0 because x${at} = 0.` });
  return { n, A, B, gt: decided === "gt" ? 1 : 0, eq, lt: decided === "lt" ? 1 : 0, x, at, steps };
}
