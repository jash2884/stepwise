// AI tool schemas: digital logic. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { addTwos, convert, signedSteps } from "../../engines/numbers.js";
import { minimise, minLiterals, parseList } from "../../engines/kmap.js";
import { compare, decoder, fullAdder, halfAdder, muxImplement, ripple } from "../../engines/combinational.js";
import { analyse, clockFF, convertFF, decodeEq, equationsText, FLIP_FLOPS, parseSequence, rippleCounter, shiftCounter, syncCounter } from "../../engines/sequential.js";

const FF_TYPES = Object.keys(FLIP_FLOPS);
const bitsOf = (v, n) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1);

export const SCHEMAS = [
  tool("number-systems", {
    keywords: "base conversion binary decimal octal hexadecimal hex radix fraction 2's complement two's complement 1's complement ones complement signed magnitude sign extension overflow range of n bits representation",
    params: {
      mode: { type: "enum", values: ["convert", "signed", "add"], default: "convert", desc: "convert: change a number between bases; signed: show a decimal value in signed magnitude, 1's and 2's complement (and the ranges for that many bits); add: n-bit 2's complement addition or subtraction with overflow" },
      x: { type: "string", format: "digits 0-9 and A-F with at most one point, no sign, e.g. 25.625 or 1A.8 or 11011101", default: "25.625", desc: "convert mode: the number to convert, written in base from" },
      from: { type: "int", min: 2, max: 16, default: 10, desc: "convert mode: base of x" },
      to: { type: "int", min: 2, max: 16, default: 2, desc: "convert mode: base to convert to" },
      p: { type: "int", min: 1, max: 16, default: 8, desc: "convert mode: fraction digits to keep when the fraction does not end (truncated)" },
      v: { type: "int", min: -32768, max: 65535, default: -37, desc: "signed mode: the decimal value to represent" },
      b: { type: "int", min: 2, max: 16, default: 8, desc: "signed mode: number of bits, sign bit included" },
      e: { type: "int", min: 2, max: 32, default: 16, desc: "signed mode: width to sign-extend the 2's complement pattern to" },
      a: { type: "int", min: -32768, max: 32767, default: 100, desc: "add mode: operand A (decimal)" },
      bb: { type: "int", min: -32768, max: 32767, default: 50, desc: "add mode: operand B (decimal)" },
      w: { type: "int", min: 2, max: 16, default: 8, desc: "add mode: word width in bits" },
      op: { type: "enum", values: ["add", "sub"], default: "add", desc: "add mode: add (A + B) or sub (A - B, done as A + NOT B + 1)" },
    },
    answers: {
      result: "convert: the number in base to (digits)", decimal: "convert: the decimal value of x", exact: "convert: true if the converted fraction ends",
      sm: "signed: signed magnitude pattern", ones: "signed: 1's complement pattern", twos: "signed: 2's complement pattern", extended: "signed: 2's complement sign-extended to e bits",
      twosMin: "signed: smallest 2's complement value with b bits", twosMax: "signed: largest 2's complement value", smMin: "signed: smallest signed magnitude (and 1's complement) value", smMax: "signed: largest signed magnitude value",
      twosCount: "signed: distinct values in b-bit 2's complement", smCount: "signed: distinct values in signed magnitude or 1's complement (two zeros)",
      bits: "add: result bit pattern", value: "add: what the result bits read as", truth: "add: the true sum or difference", overflow: "add: true if it overflowed", carryIn: "add: carry into the sign bit", carryOut: "add: carry out of the sign bit",
    },
    examples: [
      { request: "Convert (1A.8) in hex to octal", params: { mode: "convert", x: "1A.8", from: 16, to: 8 } },
      { request: "8-bit 2's complement of -37, and does 100 + 50 overflow in 8 bits?", params: { mode: "signed", v: -37, b: 8 } },
      { request: "Does -100 + -50 overflow in 8-bit two's complement?", params: { mode: "add", a: -100, bb: -50, w: 8, op: "add" } },
    ],
    validate(v) {
      if (v.mode === "convert") {
        const r = convert(v.x, v.from, v.to, { places: v.p });
        const decimal = round(Number(r.value) + Number(r.fraction[0]) / Number(r.fraction[1]), 10);
        return { text: `(${r.input}) in base ${v.from} is (${r.result}${r.exact ? "" : "..."}) in base ${v.to}${r.exact ? "" : `, truncated to ${v.p} fraction digits`}; its decimal value is ${decimal}.`,
          values: { result: r.result, decimal, exact: r.exact } };
      }
      if (v.mode === "signed") {
        const r = signedSteps(v.v, v.b, v.e);
        const rg = r.ranges;
        const values = { sm: r.sm ?? "out of range", ones: r.ones ?? "out of range", twos: r.twos ?? "out of range", twosMin: rg.twos[0], twosMax: rg.twos[1], smMin: rg.sm[0], smMax: rg.sm[1], twosCount: 2 ** v.b, smCount: 2 ** v.b - 1 };
        if (r.extended) values.extended = r.extended;
        return { text: `${v.v} in ${v.b} bits: signed magnitude ${values.sm}, 1's complement ${values.ones}, 2's complement ${values.twos}${r.extended ? ` (${r.extended} sign-extended to ${v.e} bits)` : ""}. ${v.b}-bit 2's complement covers ${rg.twos[0]} to ${rg.twos[1]}.`, values };
      }
      const r = addTwos(v.a, v.bb, v.w, v.op === "sub" ? "-" : "+");
      return { text: `${v.a} ${v.op === "sub" ? "-" : "+"} ${v.bb} in ${v.w}-bit 2's complement gives ${r.result} (${r.value}); the true answer is ${r.truth}, so ${r.overflow ? "it overflows" : "no overflow"} (carry in to sign ${r.carryIn}, carry out ${r.carryOut}).`,
        values: { bits: r.result, value: r.value, truth: r.truth, overflow: r.overflow, carryIn: r.carryIn, carryOut: r.carryOut } };
    },
  }),

  tool("k-map", {
    keywords: "karnaugh map kmap k map minimise minimize boolean function sop pos sum of products product of sums prime implicants essential prime implicants epi quine mccluskey qm tabulation don't care minterms maxterms literals",
    params: {
      n: { type: "int", min: 2, max: 5, default: 4, desc: "number of variables (A is the most significant bit)" },
      m: { type: "string", format: "minterm numbers separated by commas, ranges allowed, e.g. 0,1,2,5,6,7 or 10-15", default: "0,1,2,5,6,7,8,9,10,14", desc: "minterms where F = 1" },
      d: { type: "string", format: "same as m, e.g. 10-15; empty for none", default: "", desc: "don't-care minterms" },
      form: { type: "enum", values: ["sop", "pos"], default: "sop", desc: "sop: minimal sum of products (group 1s); pos: minimal product of sums (group 0s)" },
    },
    answers: { expr: "a minimal expression in the chosen form", terms: "number of terms in it", literals: "number of literals in it", primes: "number of prime implicants", essential: "number of essential prime implicants", minLiterals: "sop only: fewest literals over every cover" },
    examples: [
      { request: "Minimise F(A,B,C,D) = Σm(1,3,7,11,15) + d(0,2,5)", params: { n: 4, m: "1,3,7,11,15", d: "0,2,5" } },
      { request: "How many prime implicants does F(A,B,C) = Σm(0,1,2,5,6,7) have?", params: { n: 3, m: "0,1,2,5,6,7" } },
    ],
    validate(v) {
      const ones = parseList(v.m, v.n), dcs = parseList(v.d, v.n, "Don't-cares");
      const r = minimise(v.n, ones, dcs, { form: v.form });
      const values = { expr: r.expr, terms: r.chosen.length, literals: r.literals, primes: r.primes.length, essential: r.essential.length };
      if (v.form === "sop") values.minLiterals = minLiterals(v.n, ones, dcs);
      return { text: `Minimal ${v.form.toUpperCase()}: F = ${r.expr} (${values.terms} terms, ${values.literals} literals). ${values.primes} prime implicants, ${values.essential} essential.`, values };
    },
  }),

  tool("combinational-circuits", {
    keywords: "multiplexer mux 4:1 8:1 implement function with mux decoder half adder full adder ripple carry adder propagation delay carry delay comparator magnitude comparator",
    params: {
      c: { type: "enum", values: ["mux", "decoder", "half", "full", "ripple", "compare"], default: "mux", desc: "which circuit" },
      n: { type: "int", min: 2, max: 4, default: 3, desc: "mux: number of variables of F (a 2^(n-1):1 MUX)" },
      f: { type: "string", format: "minterm numbers separated by commas, e.g. 1,3,5,6", default: "1,3,5,6", desc: "mux and decoder: the function F = Σm(...)" },
      dv: { type: "int", min: -1, max: 3, default: -1, desc: "mux: index of the variable on the data inputs (0 = A); -1 means the last variable" },
      k: { type: "int", min: 1, max: 4, default: 3, desc: "decoder: input bits (k-to-2^k decoder)" },
      a: { type: "int", min: 0, max: 1, default: 1, desc: "half and full adder: input A" },
      b: { type: "int", min: 0, max: 1, default: 1, desc: "half and full adder: input B" },
      ci: { type: "int", min: 0, max: 1, default: 0, desc: "full adder and ripple: carry in" },
      ra: { type: "string", format: "binary digits, same length as rb, 1 to 12 bits, e.g. 1011", default: "1011", desc: "ripple: operand A" },
      rb: { type: "string", format: "binary digits, e.g. 0111", default: "0111", desc: "ripple: operand B" },
      tc: { type: "int", min: 1, max: 50, default: 2, desc: "ripple: carry delay of one full adder" },
      ts: { type: "int", min: 1, max: 50, default: 3, desc: "ripple: sum delay of one full adder" },
      ca: { type: "string", format: "binary digits, same length as cb, e.g. 1011", default: "1011", desc: "compare: A" },
      cb: { type: "string", format: "binary digits, e.g. 1001", default: "1001", desc: "compare: B" },
    },
    answers: {
      inputs: "mux: the data inputs, I0 to I(k-1)", I0: "mux: data input I0 (I1, I2, ... likewise): 0, 1, the data variable or its complement",
      outputs: "decoder: outputs ORed together to make F", sum: "adders: sum bit (ripple: sum bits)", carry: "adders: carry out", delay: "ripple: worst-case time until every sum and the carry out are valid", value: "ripple: decimal value of the sum",
      gt: "compare: 1 if A > B", eq: "compare: 1 if A = B", lt: "compare: 1 if A < B",
    },
    examples: [
      { request: "Implement F(A,B,C) = Σm(1,3,5,6) with a 4:1 mux, A and B on the selects", params: { c: "mux", n: 3, f: "1,3,5,6" } },
      { request: "8-bit ripple carry adder, carry delay 3 ns and sum delay 4 ns: total delay?", params: { c: "ripple", ra: "10110110", rb: "01101011", tc: 3, ts: 4 } },
    ],
    validate(v) {
      if (v.c === "mux") {
        const ones = parseList(v.f, v.n);
        const dv = v.dv < 0 || v.dv >= v.n ? v.n - 1 : v.dv;
        const r = muxImplement(v.n, ones, [], dv);
        const values = { inputs: r.inputs.map((x, i) => `I${i}=${x}`).join(", ") };
        r.inputs.forEach((x, i) => { values[`I${i}`] = x; });
        return { text: `F = Σm(${ones.join(", ")}) on a ${r.k}:1 MUX with ${r.names[dv]} on the data inputs: ${values.inputs}.`, values };
      }
      if (v.c === "decoder") {
        const ones = parseList(v.f, v.k);
        decoder(v.k, bitsOf(0, v.k), 1);
        const outputs = ones.map((m) => `D${m}`).join(", ") || "none";
        return { text: `With a ${v.k}-to-${1 << v.k} decoder, F = Σm(${ones.join(", ")}) is the OR of outputs ${outputs}.`, values: { outputs, gates: ones.length } };
      }
      if (v.c === "half" || v.c === "full") {
        const r = v.c === "half" ? halfAdder(v.a, v.b) : fullAdder(v.a, v.b, v.ci);
        const carry = v.c === "half" ? r.carry : r.cout;
        return { text: `${v.c === "half" ? "Half" : "Full"} adder with A = ${v.a}, B = ${v.b}${v.c === "full" ? `, Cin = ${v.ci}` : ""}: sum ${r.sum}, carry ${carry}.`, values: { sum: r.sum, carry } };
      }
      if (v.c === "ripple") {
        const r = ripple(v.ra, v.rb, v.ci, { tc: v.tc, ts: v.ts });
        return { text: `${r.n}-bit ripple-carry adder: ${r.A} + ${r.B}${r.cin ? " + 1" : ""} = ${r.cout}${r.sum} (${r.value}); worst-case delay max(${r.n} x ${r.tc}, ${r.n - 1} x ${r.tc} + ${r.ts}) = ${r.total}.`,
          values: { sum: r.sum, carry: r.cout, value: r.value, delay: r.total } };
      }
      const r = compare(v.ca, v.cb);
      return { text: `Comparing ${r.A} with ${r.B}: A ${r.gt ? ">" : r.lt ? "<" : "="} B.`, values: { gt: r.gt, eq: r.eq, lt: r.lt } };
    },
  }),

  tool("sequential-circuits", {
    keywords: "flip flop flip-flop sr jk d t latch characteristic table excitation table conversion counter synchronous counter asynchronous ripple counter mod n counter ring counter johnson counter twisted ring state sequence state diagram analyse circuit maximum clock frequency",
    params: {
      mode: { type: "enum", values: ["ff", "convert", "sync", "ripple", "shift", "analyse"], default: "ff", desc: "ff: clock one flip-flop edge by edge; convert: build flip-flop to from flip-flop from; sync: design a synchronous counter for a sequence; ripple: mod-N ripple counter timing; shift: ring or Johnson counter; analyse: state sequence of a circuit from its input equations" },
      t: { type: "enum", values: FF_TYPES, desc: "flip-flop type for ff, sync and analyse. If left out: jk, except analyse with no eq, which uses t" },
      in: { type: "string", format: "one group per clock edge joined by '.', each group the input bits in order (SR/JK: two bits like 10, D/T: one bit), e.g. 10.11.00.11", default: "10.11.00.11.01.11", desc: "ff: inputs just before each rising edge" },
      q: { type: "int", min: 0, max: 1, default: 0, desc: "ff: starting Q" },
      from: { type: "enum", values: FF_TYPES, default: "d", desc: "convert: the flip-flop you have" },
      to: { type: "enum", values: FF_TYPES, default: "jk", desc: "convert: the flip-flop to build" },
      seq: { type: "string", format: "states 0 to 31 in count order, separated by commas, e.g. 0,1,2,3,4,5 (a mod-6 up counter)", default: "0,1,2,3,4,5", desc: "sync: the count sequence" },
      N: { type: "int", min: 2, max: 64, default: 10, desc: "ripple: modulus" },
      tpd: { type: "int", min: 1, max: 1000, default: 10, desc: "ripple: propagation delay of one flip-flop in ns" },
      down: { type: "bool", default: false, desc: "ripple: count down instead of up" },
      kind: { type: "enum", values: ["ring", "johnson"], default: "ring", desc: "shift: ring or Johnson (twisted ring) counter" },
      bits: { type: "int", min: 2, max: 8, desc: "shift: number of flip-flops (default 4); analyse: number of flip-flops, 2 to 4 (default 3)" },
      eq: { type: "string", format: "one hex truth table per flip-flop input, most significant flip-flop first (for JK/SR: J then K), joined by '.'; bit s of a table is the input's value in state s, padded to 2^bits/4 hex digits. e.g. with t = t and bits = 3, T2 = Q1Q0, T1 = Q0, T0 = 1 is 88.aa.ff", default: "", desc: "analyse: the flip-flop input equations; always give t with it (empty eq shows the built-in example, 3 T flip-flops)" },
      s: { type: "int", min: 0, max: 15, default: 0, desc: "analyse: start state as a number (Q2 Q1 Q0 read as binary)" },
    },
    answers: {
      sequence: "ff: Q after each edge; analyse: states visited; sync: inputs equations", final: "ff: Q after the last edge", "Q1": "ff: Q after edge 1 (Q2, Q3, ... likewise)",
      J: "convert: equation for an input of the from flip-flop (one key per input name)", bits: "sync, ripple, analyse: number of flip-flops", "J1": "sync: minimal equation of each flip-flop input (J1, K0, T2, D0, ...)",
      selfStarting: "sync: true if every unused state reaches the count", unused: "sync and shift: unused states", maxDelay: "ripple: worst-case settling time in ns", maxFreqMHz: "ripple: maximum clock frequency in MHz",
      states: "shift: states in the cycle", distinct: "analyse: distinct states before one repeats", cycle: "analyse: length of the loop it ends in",
    },
    examples: [
      { request: "JK flip-flop starting at Q = 0 with JK = 10, 11, 00, 11 on four edges: Q after each edge?", params: { mode: "ff", t: "jk", in: "10.11.00.11", q: 0 } },
      { request: "Max clock frequency of a mod-10 ripple counter with 10 ns flip-flops", params: { mode: "ripple", N: 10, tpd: 10 } },
      { request: "Design a mod-6 synchronous counter with T flip-flops", params: { mode: "sync", seq: "0,1,2,3,4,5", t: "t" } },
    ],
    validate(v) {
      const t = v.t ?? (v.mode === "analyse" && !v.eq ? "t" : "jk");
      if (v.mode === "ff") {
        const k = FLIP_FLOPS[t].inputs.length;
        const seq = v.in.split(".").filter(Boolean).map((c) => [...c.padEnd(k, "0").slice(0, k)].map((b) => (b === "1" ? 1 : 0)));
        const r = clockFF(t, seq, v.q);
        const qs = r.rows.map((x) => (x.qn === null ? "?" : x.qn));
        const values = { sequence: qs.join(", "), final: r.final === null ? "?" : r.final };
        qs.forEach((x, i) => { values[`Q${i + 1}`] = x; });
        return { text: `${FLIP_FLOPS[t].name} flip-flop from Q = ${v.q}: Q after each edge is ${values.sequence}.`, values };
      }
      if (v.mode === "convert") {
        const r = convertFF(v.from, v.to);
        const values = Object.fromEntries(r.eqs.map((e) => [e.name, e.expr]));
        return { text: `A ${FLIP_FLOPS[v.to].name} flip-flop from a ${FLIP_FLOPS[v.from].name}: ${r.eqs.map((e) => `${e.name} = ${e.expr}`).join(", ")}.`, values };
      }
      if (v.mode === "sync") {
        const r = syncCounter(parseSequence(v.seq), t);
        const values = { bits: r.bits, unused: r.unused.length, selfStarting: r.selfStarting, sequence: r.fns.map((f) => `${f.label} = ${f.expr}`).join(", ") };
        for (const f of r.fns) values[f.label] = f.expr;
        return { text: `Counter ${r.seq.join(", ")} with ${r.bits} ${FLIP_FLOPS[t].name} flip-flops: ${values.sequence}.${r.unused.length ? ` ${r.selfStarting ? "Self-starting" : "Not self-starting"}.` : ""}`, values };
      }
      if (v.mode === "ripple") {
        const r = rippleCounter(v.N, { down: v.down, tpd: v.tpd });
        return { text: `Mod-${v.N} ripple ${v.down ? "down" : "up"} counter: ${r.bits} flip-flops, worst-case settling ${r.maxDelay} ns, maximum clock ${round(r.maxFreqMHz, 2)} MHz.`,
          values: { bits: r.bits, maxDelay: r.maxDelay, maxFreqMHz: round(r.maxFreqMHz, 4) } };
      }
      if (v.mode === "shift") {
        const r = shiftCounter(v.kind, v.bits ?? 4);
        return { text: `A ${v.kind === "ring" ? "ring" : "Johnson"} counter with ${r.bits} flip-flops has ${r.states} states and ${r.unused} unused.`, values: { states: r.states, unused: r.unused } };
      }
      const bits = Math.min(4, Math.max(2, v.bits ?? 3));
      const fns = decodeEq(v.eq, t, bits) ?? (t === "t" && bits === 3 && !v.eq ? [[[3, 7]], [[1, 3, 5, 7]], [[0, 1, 2, 3, 4, 5, 6, 7]]] : null);
      if (!fns) throw new Error(`eq must hold ${bits * FLIP_FLOPS[t].inputs.length} hex truth tables of ${Math.max(1, (1 << bits) / 4)} digits joined by '.', most significant flip-flop first.`);
      const r = analyse(t, bits, fns, v.s);
      const seq = r.seq.map((x) => x.toString(2).padStart(bits, "0"));
      return { text: `With ${equationsText(t, bits, fns).join(", ")}, starting at ${seq[0]}: ${seq.join(" -> ")}, then back to ${r.cycle[0].toString(2).padStart(bits, "0")}. ${r.seq.length} distinct states, a loop of ${r.cycle.length}.`,
        values: { sequence: seq.join(" "), distinct: r.seq.length, cycle: r.cycle.length, bits } };
    },
  }),
];
