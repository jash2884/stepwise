// GATE question generators for this subject. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
import { pick, int, round2, shuffle, query, mcq } from "./kit.js";
import { addTwos, convert, decode, randomDigits, ranges, represent, sub } from "../engines/numbers.js";
import { evalSop, minimise, minLiterals, NAMES, parseSop, randomFunction } from "../engines/kmap.js";
import { muxFunction, muxImplement } from "../engines/combinational.js";
import { analyse, binary, clockFF, encodeEq, equationsText, FLIP_FLOPS, modSequence, randomEquations, rippleCounter, shiftCounter, syncCounter } from "../engines/sequential.js";

const list = (xs) => xs.join(", ");

// --- Number systems ---------------------------------------------------------------------------

function numberSystems(r) {
  const variant = pick(r, ["convert", "convert", "base", "range", "overflow", "twos", "decode"]);
  if (variant === "convert") {
    const [from, to] = pick(r, [[2, 10], [16, 10], [8, 10], [3, 10], [10, 2], [10, 16], [16, 8], [8, 2], [2, 16], [5, 10]]);
    const frac = r() < 0.3 && (from === 2 || from === 10);
    let x = randomDigits(r, from, int(r, 2, from === 2 ? 7 : 3));
    if (frac) x += from === 2 ? `.${randomDigits(r, 2, 2)}` : `.${pick(r, ["5", "25", "75", "125", "375", "625"])}`;
    const c = convert(x, from, to, { places: 8 });
    if (!c.exact) return null;
    const replay = query("/number-systems", { mode: "convert", x, from, to, p: 8 });
    const solution = c.steps.map((s) => s.note);
    if (to === 10) {
      const value = Number(c.result);
      return { topic: "number-systems", type: "nat", marks: 1, answer: value, tolerance: frac ? 0.001 : 0,
        given: { variant, x, from, to },
        stem: [`The value of (${x})${sub(from)} in decimal is ________.${frac ? " (Give the exact value.)" : ""}`], solution, replay };
    }
    // MCQ: wrong answers that look plausible.
    const wrongs = new Set();
    const asBase = (v) => convert(String(v), 10, to).result;
    const v = Number(c.value);
    for (const w of [v + 1, v - 1, v * 2, Math.floor(v / 2), v + to]) if (w > 0) wrongs.add(frac ? `${asBase(w)}.${c.fracDigits}` : asBase(w));
    if (!frac && c.result.length > 1) wrongs.add([...c.result].reverse().join("").replace(/^0+(?=.)/, ""));
    const q = mcq(r, c.result, [...wrongs].filter((w) => w !== c.result));
    if (!q) return null;
    return { topic: "number-systems", type: "mcq", marks: 1, ...q,
      given: { variant, x, from, to },
      stem: [`(${x})${sub(from)} written in base ${to} is:`], solution, replay };
  }
  if (variant === "base") {
    // (digits)_b = N in decimal: find b.
    const b = int(r, 4, 12);
    const len = int(r, 2, 3);
    const x = randomDigits(r, Math.min(b, 10), len);
    if ([...x].some((d) => Number(d) >= b)) return null;
    const value = Number(convert(x, b, 10).result);
    // Unique base check.
    const fits = [];
    for (let t = Math.max(2, ...[...x].map((d) => Number(d) + 1)); t <= 16; t++) if (Number(convert(x, t, 10).result) === value) fits.push(t);
    if (fits.length !== 1) return null;
    return { topic: "number-systems", type: "nat", marks: 1, answer: b, tolerance: 0,
      given: { variant, x, value },
      stem: [`If (${x})ᵦ = (${value})₁₀, the base b is ________.`],
      solution: [`Expand in base b: ${[...x].map((d, i) => `${d}·b^${x.length - 1 - i}`).join(" + ")} = ${value}.`, `Only b = ${b} works (and every digit must be less than b): ${convert(x, b, 10).expansion.map((e) => `${e.digit}×${b}^${e.pos}`).join(" + ")} = ${value}.`],
      replay: query("/number-systems", { mode: "convert", x, from: b, to: 10, p: 8 }) };
  }
  if (variant === "range") {
    const bits = pick(r, [4, 5, 6, 8, 10, 12, 16]);
    const scheme = pick(r, ["twos", "twos", "sm", "ones"]);
    const ask = pick(r, ["min", "max", "count"]);
    const rg = ranges(bits)[scheme];
    const name = { twos: "2's complement", sm: "signed magnitude", ones: "1's complement" }[scheme];
    const answer = ask === "min" ? rg[0] : ask === "max" ? rg[1] : rg[1] - rg[0] + 1;
    return { topic: "number-systems", type: "nat", marks: 1, answer, tolerance: 0,
      given: { variant, bits, scheme, ask },
      stem: [`In ${bits}-bit ${name} representation, ${ask === "min" ? "the smallest (most negative) value that can be represented" : ask === "max" ? "the largest value that can be represented" : "the number of distinct integer values that can be represented"} is ________.`],
      solution: [`${bits}-bit ${name} covers ${rg[0]} to ${rg[1]}.`, scheme === "twos" ? "2's complement has a single zero, so all 2^n patterns are different values and the negative side has one extra." : "There are two patterns for zero (+0 and −0), so only 2^n − 1 distinct values.", `Answer: ${answer}.`],
      replay: query("/number-systems", { mode: "signed", v: rg[0], b: bits, e: bits * 2 }) };
  }
  if (variant === "overflow") {
    const bits = pick(r, [4, 6, 8]);
    const [lo, hi] = ranges(bits).twos;
    const pairs = [];
    const seen = new Set();
    while (pairs.length < 4) {
      const a = int(r, lo, hi), b = int(r, lo, hi);
      if (seen.has(`${a},${b}`)) continue;
      seen.add(`${a},${b}`);
      pairs.push({ a, b, res: addTwos(a, b, bits) });
    }
    const answer = pairs.map((p, i) => (p.res.overflow ? i : null)).filter((x) => x !== null);
    if (!answer.length || answer.length === 4) return null;
    const fmt = (v) => (v < 0 ? `(${v})` : String(v));
    const first = pairs[answer[0]];
    return { topic: "number-systems", type: "msq", marks: 2, answer,
      given: { variant, bits, pairs: pairs.map((p) => ({ a: p.a, b: p.b })) },
      options: pairs.map((p) => `${fmt(p.a)} + ${fmt(p.b)}`),
      stem: [`The following additions are done in ${bits}-bit 2's complement arithmetic (range ${lo} to ${hi}). Which of them overflow?`],
      solution: pairs.map((p) => `${fmt(p.a)} + ${fmt(p.b)}: ${p.res.A} + ${p.res.B} = ${p.res.result} (carry in to sign ${p.res.carryIn}, out ${p.res.carryOut}). True sum ${p.res.truth}: ${p.res.overflow ? "overflow" : "fits"}.`),
      replay: query("/number-systems", { mode: "add", a: first.a, bb: first.b, w: bits, op: "add" }) };
  }
  if (variant === "twos") {
    const bits = pick(r, [6, 8]);
    const v = -int(r, 1, 2 ** (bits - 1) - 1);
    const rep = represent(v, bits);
    const wrong = [rep.sm, rep.ones, represent(-v - 1, bits).twos, represent(v + 1, bits).twos, represent(-v, bits).twos].filter(Boolean);
    const q = mcq(r, rep.twos, wrong);
    if (!q) return null;
    return { topic: "number-systems", type: "mcq", marks: 1, ...q,
      given: { variant, bits, v },
      stem: [`The ${bits}-bit 2's complement representation of ${v} is:`],
      solution: [rep.work[2].text, `(Signed magnitude would be ${rep.sm}, 1's complement ${rep.ones}.)`],
      replay: query("/number-systems", { mode: "signed", v, b: bits, e: bits * 2 }) };
  }
  // decode
  const bits = pick(r, [5, 6, 8]);
  const pat = `1${Array.from({ length: bits - 1 }, () => (r() < 0.5 ? "1" : "0")).join("")}`;
  const scheme = pick(r, ["twos", "twos", "sm", "ones"]);
  const name = { twos: "2's complement", sm: "signed magnitude", ones: "1's complement" }[scheme];
  const answer = decode(pat, scheme);
  return { topic: "number-systems", type: "nat", marks: 1, answer, tolerance: 0,
    given: { variant: "decode", bits, pat, scheme },
    stem: [`The ${bits}-bit pattern ${pat} is a number in ${name}. Its decimal value is ________.`],
    solution: [scheme === "twos" ? `The sign bit is worth −2^${bits - 1} = ${-(2 ** (bits - 1))}; the rest add ${parseInt(pat.slice(1), 2)}. Total ${answer}.` : scheme === "sm" ? `Sign bit 1 means negative; magnitude ${pat.slice(1)} = ${-answer}. Value ${answer}.` : `Negative, so flip every bit to get the magnitude: ${[...pat].map((b) => (b === "1" ? "0" : "1")).join("")} = ${-answer}. Value ${answer}.`],
    replay: query("/number-systems", { mode: "signed", v: answer, b: bits, e: bits * 2 }) };
}

// --- K-maps -----------------------------------------------------------------------------------

function kmap(r) {
  const variant = pick(r, ["literals", "literals", "pi", "epi", "sop"]);
  const n = variant === "sop" ? pick(r, [3, 4]) : 4;
  const useDc = (variant === "literals" || variant === "sop") && r() < 0.5;
  const f = randomFunction(r, n, { dcChance: useDc ? 0.15 : 0, density: 0.42 });
  if (f.ones.length < 3 || f.ones.length > (1 << n) - 3) return null;
  const res = minimise(n, f.ones, f.dcs);
  if (res.chosen.length < 2) return null;
  const vars = NAMES.slice(0, n).join(", ");
  const fText = `F(${vars}) = Σm(${list(f.ones)})${f.dcs.length ? ` + d(${list(f.dcs)})` : ""}`;
  const replay = query("/k-map", { n, m: f.ones.join(","), d: f.dcs.join(","), form: "sop", view: "kmap" });
  const solution = [
    `Prime implicants: ${res.primes.map((p) => `${productTerm(p, n)} (${p.on.join(",")})`).join(", ")}.`,
    res.essential.length ? `Essential: ${res.essential.map((p) => productTerm(p, n)).join(", ")}.` : "There are no essential prime implicants.",
    `A minimal SOP: F = ${res.expr} (${res.chosen.length} terms, ${res.literals} literals).`,
  ];
  if (variant === "literals") {
    if (minLiterals(n, f.ones, f.dcs) !== res.literals) return null; // fewest terms and fewest literals must agree
    return { topic: "k-map", type: "nat", marks: 2, answer: res.literals, tolerance: 0,
      given: { variant, n, ones: f.ones, dcs: f.dcs },
      stem: [`Consider ${fText}${f.dcs.length ? ", where d marks don't-care conditions" : ""}.`, "The number of literals in a minimal sum-of-products expression for F is ________."], solution, replay };
  }
  if (variant === "pi") return { topic: "k-map", type: "nat", marks: 1, answer: res.primes.length, tolerance: 0,
    given: { variant, n, ones: f.ones, dcs: f.dcs },
    stem: [`Consider ${fText}.`, "The number of prime implicants of F is ________."], solution, replay };
  if (variant === "epi") return { topic: "k-map", type: "nat", marks: 1, answer: res.essential.length, tolerance: 0,
    given: { variant, n, ones: f.ones, dcs: f.dcs },
    stem: [`Consider ${fText}.`, "The number of essential prime implicants of F is ________."], solution, replay };
  // MCQ: which is a minimal SOP? Wrong options are not equivalent to F.
  const equivalent = (text) => {
    const terms = parseSop(text, n);
    return Array.from({ length: 1 << n }, (_, m) => m).every((m) => f.dcs.includes(m) || evalSop(terms, m) === f.ones.includes(m));
  };
  const wrongs = [];
  const flipOne = (imp) => { const fixed = [...Array(n).keys()].filter((i) => !(imp.mask >> i & 1)); if (!fixed.length) return null; const b = 1 << pick(r, fixed); return { value: imp.value ^ b, mask: imp.mask }; };
  for (let k = 0; k < 12 && wrongs.length < 6; k++) {
    const terms = res.chosen.map((t) => ({ ...t }));
    const i = int(r, 0, terms.length - 1);
    const kind = pick(r, ["flip", "drop", "grow"]);
    if (kind === "flip") { const x = flipOne(terms[i]); if (!x) continue; terms[i] = x; }
    else if (kind === "drop") terms.splice(i, 1);
    else { const free = [...Array(n).keys()].filter((b) => terms[i].mask >> b & 1); if (!free.length) continue; const b = 1 << pick(r, free); terms[i] = { value: terms[i].value, mask: terms[i].mask & ~b }; }
    const text = terms.length ? terms.map((t) => productTerm(t, n)).join(" + ") : "0";
    if (!equivalent(text)) wrongs.push(text);
  }
  const q = mcq(r, res.expr, shuffle(r, wrongs));
  if (!q) return null;
  return { topic: "k-map", type: "mcq", marks: 2, ...q, given: { variant, n, ones: f.ones, dcs: f.dcs }, stem: [`Which of the following is a minimal sum-of-products expression for ${fText}?`], solution, replay };
}
const productTerm = (imp, n) => {
  let s = "";
  for (let i = n - 1; i >= 0; i--) if (!(imp.mask >> i & 1)) s += NAMES[n - 1 - i] + (imp.value >> i & 1 ? "" : "'");
  return s || "1";
};

// --- Combinational circuits -------------------------------------------------------------------

function combinational(r) {
  const variant = pick(r, ["implement", "read", "ripple"]);
  if (variant === "ripple") {
    const n = pick(r, [4, 6, 8, 10, 12]), tc = int(r, 2, 6), ts = int(r, 2, 8);
    const total = Math.max(n * tc, (n - 1) * tc + ts);
    const A = Array.from({ length: n }, () => (r() < 0.5 ? "1" : "0")).join(""), B = Array.from({ length: n }, () => (r() < 0.5 ? "1" : "0")).join("");
    return { topic: "combinational-circuits", type: "nat", marks: 1, answer: total, tolerance: 0,
      stem: [`${n === 8 || n === 11 ? "An" : "A"} ${n}-bit ripple-carry adder is built from ${n} full adders. In each full adder the carry output is valid ${tc} ns and the sum output ${ts} ns after its inputs (including the carry in) are valid. All inputs are applied at time 0. In the worst case, the time in ns after which every sum bit and the final carry out are valid is ________.`],
      solution: [`The carry ripples: C(i) is valid at i × ${tc} ns, so C${n - 1} (into the last stage) is valid at ${(n - 1) * tc} ns.`, `The last stage then needs ${ts} ns for its sum and ${tc} ns for C${n}: max(${(n - 1) * tc} + ${ts}, ${n} × ${tc}) = ${total} ns.`],
      replay: query("/combinational-circuits", { c: "ripple", ra: A, rb: B, ci: 0, tc, ts }) };
  }
  const n = 3;
  let ones;
  do { ones = Array.from({ length: 8 }, (_, m) => m).filter(() => r() < 0.5); } while (ones.length < 2 || ones.length > 6);
  const impl = muxImplement(n, ones);
  const choices = ["0", "1", "C", "C'"];
  const show = (inp) => inp.map((x, i) => `I${i} = ${x}`).join(", ");
  const replay = query("/combinational-circuits", { c: "mux", n, f: ones.join(","), dv: 2, x: 0 });
  const solution = [...impl.steps.slice(1).map((s) => s.note), `So ${show(impl.inputs)}.`];
  if (variant === "implement") {
    const wrongs = [];
    for (let k = 0; k < 20 && wrongs.length < 6; k++) {
      const w = [...impl.inputs];
      const i = int(r, 0, 3);
      w[i] = pick(r, choices.filter((c) => c !== w[i]));
      if (r() < 0.4) { const j = int(r, 0, 3); w[j] = pick(r, choices.filter((c) => c !== w[j])); }
      if (muxFunction(n, w).join() !== ones.join()) wrongs.push(show(w));
    }
    const q = mcq(r, show(impl.inputs), wrongs);
    if (!q) return null;
    return { topic: "combinational-circuits", type: "mcq", marks: 2, ...q,
      stem: [`F(A, B, C) = Σm(${list(ones)}) is implemented with a 4:1 multiplexer. A and B drive the select lines S1 and S0 (A is S1). Which data inputs are needed?`], solution, replay };
  }
  // read: given the inputs, which function?
  const fn = (inp) => `Σm(${list(muxFunction(n, inp))})`;
  const wrongs = [];
  for (let k = 0; k < 20 && wrongs.length < 6; k++) {
    const w = [...impl.inputs];
    const i = int(r, 0, 3);
    w[i] = pick(r, choices.filter((c) => c !== w[i]));
    wrongs.push(fn(w));
  }
  // A classic slip: reading C and C' the wrong way round.
  wrongs.unshift(fn(impl.inputs.map((x) => (x === "C" ? "C'" : x === "C'" ? "C" : x))));
  const q = mcq(r, fn(impl.inputs), wrongs.filter((w) => w !== fn(impl.inputs)));
  if (!q) return null;
  return { topic: "combinational-circuits", type: "mcq", marks: 1, ...q,
    stem: [`A 4:1 multiplexer has A on S1 and B on S0 (A is the more significant select bit). Its data inputs are ${show(impl.inputs)}. The function F(A, B, C) at its output is:`],
    solution: [`Input Ik is selected when AB = k. It covers minterms 2k (C = 0) and 2k + 1 (C = 1): a 1 covers both, C covers 2k + 1, C' covers 2k, 0 neither.`, `So F = ${fn(impl.inputs)}.`], replay };
}

// --- Sequential circuits ------------------------------------------------------------------------

function sequential(r) {
  const variant = pick(r, ["ff", "ff", "analyse", "analyse", "mod", "shift", "ripple", "design"]);
  if (variant === "ff") {
    const type = pick(r, ["sr", "jk", "jk", "d", "t"]), k = FLIP_FLOPS[type].inputs.length, edges = 4;
    const seq = Array.from({ length: edges }, () => { let v; do { v = Array.from({ length: k }, () => (r() < 0.5 ? 1 : 0)); } while (type === "sr" && v[0] && v[1]); return v; });
    const q0 = r() < 0.5 ? 1 : 0;
    const res = clockFF(type, seq, q0);
    const right = res.rows.map((x) => x.qn).join(", ");
    const wrongs = [
      res.rows.map((x) => 1 - x.qn).join(", "),
      [q0, ...res.rows.slice(0, -1).map((x) => x.qn)].join(", "),
      res.rows.map((x, i) => (i === edges - 1 ? 1 - x.qn : x.qn)).join(", "),
      res.rows.map((x, i) => (i === 1 ? 1 - x.qn : x.qn)).join(", "),
      res.rows.map((x, i) => (i === 0 ? 1 - x.qn : x.qn)).join(", "),
    ];
    const q = mcq(r, right, wrongs);
    if (!q) return null;
    const names = FLIP_FLOPS[type].inputs;
    return { topic: "sequential-circuits", type: "mcq", marks: 1, ...q,
      stem: [`A positive-edge-triggered ${FLIP_FLOPS[type].name} flip-flop starts with Q = ${q0}. Its inputs just before the next four rising clock edges are:`,
        { table: { head: ["Edge", ...names], rows: seq.map((v, i) => [i + 1, ...v]) } },
        "The values of Q after edges 1, 2, 3 and 4 are:"],
      solution: res.steps.slice(1).map((s) => s.note),
      replay: query("/sequential-circuits", { mode: "ff", t: type, in: seq.map((v) => v.join("")).join("."), q: q0 }) };
  }
  if (variant === "analyse") {
    const type = pick(r, ["t", "d", "jk"]), bits = 3;
    const fns = randomEquations(r, type, bits);
    const start = pick(r, [0, 0, int(r, 0, 7)]);
    const res = analyse(type, bits, fns, start);
    if (res.seq.length < 3) return null;
    const eqs = equationsText(type, bits, fns);
    const stemBase = [`A synchronous circuit has three ${FLIP_FLOPS[type].name} flip-flops with outputs Q2 Q1 Q0 (Q2 is the most significant bit of the state). Their inputs are:`, eqs.join(";  "), `The circuit starts in state Q2Q1Q0 = ${binary(start, bits)}.`];
    const solution = res.steps.slice(1).map((s) => s.note);
    const replay = query("/sequential-circuits", { mode: "analyse", t: type, bits, eq: encodeEq(fns, bits), s: start });
    if (r() < 0.5) return { topic: "sequential-circuits", type: "nat", marks: 2, answer: res.seq.length, tolerance: 0,
      stem: [...stemBase, "The number of distinct states the circuit passes through (including the start state) before a state repeats is ________."], solution, replay };
    if (res.seq.length < 4) return null;
    const right = res.seq.slice(0, 4).map((s) => binary(s, bits)).join(" → ");
    const wrongs = [];
    for (let k = 0; k < 10; k++) {
      const alt = res.seq.slice(0, 4).map((s, i) => (i > 0 && r() < 0.5 ? s ^ (1 << int(r, 0, 2)) : s));
      wrongs.push(alt.map((s) => binary(s, bits)).join(" → "));
    }
    const q = mcq(r, right, wrongs);
    if (!q) return null;
    return { topic: "sequential-circuits", type: "mcq", marks: 2, ...q, stem: [...stemBase, "The first four states, starting with the start state, are:"], solution, replay };
  }
  if (variant === "mod") {
    const N = int(r, 5, 64);
    const bits = Math.ceil(Math.log2(N));
    return { topic: "sequential-circuits", type: "nat", marks: 1, answer: bits, tolerance: 0,
      stem: [`The minimum number of flip-flops needed to build a mod-${N} counter is ________.`],
      solution: [`n flip-flops give 2^n states. 2^${bits - 1} = ${2 ** (bits - 1)} < ${N} ≤ 2^${bits} = ${2 ** bits}, so ${bits} flip-flops.`],
      replay: query("/sequential-circuits", { mode: "ripple", N, tpd: 10, down: 0 }) };
  }
  if (variant === "shift") {
    const bits = int(r, 3, 8), kind = pick(r, ["ring", "johnson"]);
    const res = shiftCounter(kind, bits);
    const unused = r() < 0.4;
    return { topic: "sequential-circuits", type: "nat", marks: 1, answer: unused ? res.unused : res.states, tolerance: 0,
      stem: [`A ${kind === "ring" ? "ring" : "Johnson (twisted ring)"} counter is built from ${bits} flip-flops and started in its normal initial state. The number of ${unused ? "unused states (of all possible flip-flop states)" : "distinct states in its counting sequence"} is ________.`],
      solution: [`A ${kind === "ring" ? "ring counter circulates a single 1, giving n" : "Johnson counter feeds back Q0', giving 2n"} states: ${res.seq.map((s) => binary(s, bits)).join(", ")}.`, `${res.states} states used, ${2 ** bits} − ${res.states} = ${res.unused} unused.`],
      replay: query("/sequential-circuits", { mode: "shift", kind, bits }) };
  }
  if (variant === "ripple") {
    const N = int(r, 5, 64), tpd = pick(r, [5, 8, 10, 12, 15, 20, 25]);
    const res = rippleCounter(N, { tpd });
    return { topic: "sequential-circuits", type: "nat", marks: 2, answer: round2(res.maxFreqMHz), tolerance: 0.01,
      stem: [`A mod-${N} ripple (asynchronous) up counter uses the minimum number of flip-flops, each with a propagation delay of ${tpd} ns. Ignoring the reset logic, the maximum clock frequency in MHz is ________ (to two decimal places).`],
      solution: [`Mod ${N} needs ${res.bits} flip-flops. In the worst case a change ripples through all of them: ${res.bits} × ${tpd} = ${res.maxDelay} ns.`, `f max = 1 / ${res.maxDelay} ns = ${round2(res.maxFreqMHz)} MHz.`],
      replay: query("/sequential-circuits", { mode: "ripple", N, tpd, down: 0 }) };
  }
  // design: a mod-N synchronous counter; which is the input equation of one flip-flop?
  const N = int(r, 3, 7), type = pick(r, ["t", "d", "jk"]);
  const res = syncCounter(modSequence(N), type);
  const fn = pick(r, res.fns.filter((f) => f.expr !== "0" && f.expr !== "1"));
  if (!fn) return null;
  const careEq = (a, b) => modSequence(N).every((s) => evalSop(a, s) === evalSop(b, s));
  const wrongs = res.fns.filter((g) => g !== fn && !careEq(g.result.chosen, fn.result.chosen)).map((g) => g.expr);
  const names = res.names;
  for (let k = 0; k < 10; k++) {
    const t = fn.result.chosen.map((x) => ({ ...x }));
    if (!t.length) break;
    const i = int(r, 0, t.length - 1), fixed = [...Array(res.bits).keys()].filter((b) => !(t[i].mask >> b & 1));
    if (!fixed.length) continue;
    t[i].value ^= 1 << pick(r, fixed);
    if (!careEq(t, fn.result.chosen)) wrongs.push(t.map((x) => termOver(x, res.bits, names)).join(" + "));
  }
  const q = mcq(r, fn.expr, wrongs);
  if (!q) return null;
  return { topic: "sequential-circuits", type: "mcq", marks: 2, ...q,
    stem: [`A synchronous mod-${N} up counter (0 to ${N - 1}, then back to 0) is built from ${res.bits} ${FLIP_FLOPS[type].name} flip-flops ${names.join(" ")} (${names[0]} most significant). Unused states are treated as don't-cares. A minimal expression for ${fn.label} is:`],
    solution: [`Excitations for each present state: ${res.table.map((row) => `${binary(row.s, res.bits)} → ${binary(row.n, res.bits)}: ${fn.label} = ${row.need[res.bits - 1 - fn.ff][fn.j]}`).join("; ")}.`, `Unused states ${res.unused.join(", ") || "none"} are don't-cares. The K-map gives ${fn.label} = ${fn.expr}.`],
    replay: query("/sequential-circuits", { mode: "sync", seq: modSequence(N).join(","), t: type }) };
}
const termOver = (imp, n, names) => {
  let s = "";
  for (let i = n - 1; i >= 0; i--) if (!(imp.mask >> i & 1)) s += names[n - 1 - i] + (imp.value >> i & 1 ? "" : "'");
  return s || "1";
};

export const TOPICS = [
  { slug: "number-systems", subject: "digital-logic", title: "Number systems", make: numberSystems },
  { slug: "k-map", subject: "digital-logic", title: "K-maps and minimisation", make: kmap },
  { slug: "combinational-circuits", subject: "digital-logic", title: "Combinational circuits", make: combinational },
  { slug: "sequential-circuits", subject: "digital-logic", title: "Flip-flops and counters", make: sequential },
];
