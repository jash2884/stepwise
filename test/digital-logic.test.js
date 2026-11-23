// Digital logic engines: number systems, K-map / Quine-McCluskey minimisation,
// combinational circuits and sequential circuits, plus the GATE generators.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addTwos, convert, decode, fromBase, ranges, represent, signedSteps, signExtend, toBase } from "../public/js/engines/numbers.js";
import { evalPos, evalSop, layout, minimise, minLiterals, parseList, parseSop, randomFunction, tabulate } from "../public/js/engines/kmap.js";
import { adderSteps, compare, decoder, fullAdder, halfAdder, mux, muxFunction, muxImplement, ripple } from "../public/js/engines/combinational.js";
import { analyse, clockFF, convertFF, decodeEq, encodeEq, excitation, modSequence, next, randomEquations, rippleCounter, shiftCounter, syncCounter } from "../public/js/engines/sequential.js";
import { TOPICS as DL_TOPICS } from "../public/js/gate/digital-logic.js";
import { check, generate } from "../public/js/gate-questions.js";
import { TOOLS } from "../public/js/tools.js";
import { rng } from "../public/js/ui.js";

// --- Number systems -------------------------------------------------------------------------

test("base conversion: textbook examples, integer and fraction parts", () => {
  assert.equal(convert("25.625", 10, 2).result, "11001.101");
  assert.equal(convert("11001.101", 2, 10).result, "25.625");
  assert.equal(convert("1A.8", 16, 8).result, "32.4");
  assert.equal(convert("777", 8, 16).result, "1FF");
  assert.equal(convert("255", 10, 16).result, "FF");
  assert.equal(convert("0", 10, 2).result, "0");
  assert.equal(convert("1202", 3, 10).result, "47");
  const tenth = convert("0.1", 10, 2, { places: 10 });
  assert.equal(tenth.result, "0.0001100110");
  assert.equal(tenth.exact, false);
  assert.equal(tenth.repeatFrom, 1); // 0.0(0011)…
  assert.equal(convert("0.2", 3, 10, { places: 4 }).result, "0.6666");
  // Every division step is recorded: 25 → 12 r1 → 6 r0 → 3 r0 → 1 r1 → 0 r1.
  assert.deepEqual(convert("25", 10, 2).divisions.map((d) => d.r), [1, 0, 0, 1, 1]);
  assert.throws(() => convert("19", 8, 10), /isn't a digit in base 8/);
  assert.throws(() => convert("1.2.3", 10, 2), /isn't a number/);
  assert.throws(() => convert("5", 1, 2), /2 to 16/);
});

test("conversions round-trip between every pair of bases", () => {
  const r = rng(11);
  for (let k = 0; k < 400; k++) {
    const from = 2 + Math.floor(r() * 15), to = 2 + Math.floor(r() * 15);
    const n = Math.floor(r() * 100000);
    const x = toBase(n, from);
    const there = convert(x, from, to);
    assert.equal(there.result, toBase(n, to), `${x} base ${from} → ${to}`);
    assert.equal(fromBase(convert(there.result, to, from).result, from), BigInt(n));
  }
  // Fractions with power-of-two denominators end in every power-of-two base.
  for (const x of ["0.5", "0.75", "3.125", "10.0625"]) {
    for (const b of [2, 4, 8, 16]) {
      const there = convert(x, 10, b, { places: 16 });
      assert.ok(there.exact, `${x} in base ${b}`);
      assert.equal(convert(there.result, b, 10).result, x);
    }
  }
});

test("signed representations, ranges and sign extension", () => {
  const r = represent(-5, 8);
  assert.deepEqual([r.sm, r.ones, r.twos], ["10000101", "11111010", "11111011"]);
  assert.equal(represent(-128, 8).twos, "10000000");
  assert.equal(represent(-128, 8).sm, null);
  assert.equal(represent(127, 8).twos, "01111111");
  assert.deepEqual(ranges(8).twos, [-128, 127]);
  assert.deepEqual(ranges(8).sm, [-127, 127]);
  assert.deepEqual([decode("1011", "sm"), decode("1011", "ones"), decode("1011", "twos"), decode("1011", "unsigned")], [-3, -4, -5, 11]);
  assert.equal(signExtend("1011", 8), "11111011");
  assert.equal(signExtend("0101", 8), "00000101");
  assert.equal(signedSteps(-37, 8, 16).extended, "1111111111011011");
  // Every value in range survives encode → decode in every scheme.
  for (const bits of [4, 6, 8]) for (let v = -(2 ** (bits - 1)); v < 2 ** (bits - 1); v++) {
    const x = represent(v, bits);
    assert.equal(decode(x.twos, "twos"), v);
    if (x.sm) assert.equal(decode(x.sm, "sm"), v);
    if (x.ones) assert.equal(decode(x.ones, "ones"), v);
    assert.equal(decode(signExtend(x.twos, bits + 5), "twos"), v);
  }
});

test("2's complement addition flags overflow exactly when the true sum doesn't fit", () => {
  const a = addTwos(100, 50, 8);
  assert.equal(a.result, "10010110");
  assert.equal(a.value, -106);
  assert.equal(a.overflow, true);
  assert.equal(addTwos(-3, 5, 4).overflow, false);
  assert.equal(addTwos(-8, -1, 4).overflow, true);
  assert.equal(addTwos(-8, 1, 4, "-").overflow, true); // −9
  assert.equal(addTwos(5, -2, 4, "-").overflow, false);
  assert.equal(addTwos(6, -2, 4, "-").overflow, true); // 8 doesn't fit
  for (const bits of [3, 4, 5]) {
    const [lo, hi] = ranges(bits).twos;
    for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) for (const op of ["+", "-"]) {
      const s = addTwos(x, y, bits, op);
      const truth = op === "+" ? x + y : x - y;
      assert.equal(s.overflow, truth < lo || truth > hi, `${x} ${op} ${y}`);
      if (!s.overflow) assert.equal(s.value, truth);
      assert.equal(s.steps.length, bits + 2);
    }
  }
});

// --- K-maps --------------------------------------------------------------------------------------

const all = (n) => Array.from({ length: 1 << n }, (_, m) => m);

test("K-map: textbook minimisations, with and without don't-cares", () => {
  let r = minimise(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
  assert.equal(r.expr, "B'C' + CD' + A'BD");
  assert.equal(r.literals, 7);
  r = minimise(4, [1, 3, 7, 11, 15], [0, 2, 5]);
  assert.equal(r.expr, "A'B' + CD");
  assert.equal(minimise(4, [1, 3, 7, 11, 15], [0, 2, 5], { form: "pos" }).expr, "D(A' + C)");
  // BCD inputs above 9 never happen: F = 1 for 5 to 9.
  assert.equal(minimise(4, [5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15]).expr, "A + BD + BC");
  // Four corners.
  assert.equal(minimise(4, [0, 2, 8, 10]).expr, "B'D'");
  // XOR doesn't group at all.
  assert.equal(minimise(3, [1, 2, 4, 7]).chosen.length, 4);
  assert.equal(minimise(2, []).expr, "0");
  assert.equal(minimise(3, all(3)).expr, "1");
  assert.equal(minimise(3, [0, 1, 2, 3], [4, 5, 6, 7]).expr, "1");
});

test("K-map: prime and essential prime implicant counts", () => {
  // Cyclic function: six prime implicants, none essential.
  const cyc = minimise(3, [0, 1, 2, 5, 6, 7]);
  assert.equal(cyc.primes.length, 6);
  assert.equal(cyc.essential.length, 0);
  assert.equal(cyc.chosen.length, 3);
  const r = minimise(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
  assert.equal(r.primes.length, 6);
  assert.equal(r.essential.length, 2);
  // Prime implicants made only of don't-cares are left out.
  assert.ok(minimise(4, [0], [15]).primes.every((p) => p.on.length));
});

test("Quine-McCluskey tabulation finds the same prime implicants", () => {
  const t = tabulate(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
  assert.equal(t.primes.length, 6);
  assert.equal(t.columns.length, 3);
  assert.ok(t.steps.every((s) => s.note && s.line));
});

test("fuzz: minimal SOP and POS match the truth table, and the SOP is optimal", () => {
  const r = rng(2024);
  for (let k = 0; k < 400; k++) {
    const n = 2 + Math.floor(r() * 4); // 2 to 5 variables
    const f = randomFunction(r, n, { dcChance: r() < 0.5 ? 0.15 : 0, density: 0.2 + r() * 0.5 });
    const sop = minimise(n, f.ones, f.dcs), pos = minimise(n, f.ones, f.dcs, { form: "pos" });
    for (const m of all(n)) {
      if (f.dcs.includes(m)) continue;
      assert.equal(evalSop(sop.chosen, m), f.ones.includes(m), `SOP n=${n} ${JSON.stringify(f)} at ${m}`);
      assert.equal(evalPos(pos.chosen, m), f.ones.includes(m), `POS n=${n} ${JSON.stringify(f)} at ${m}`);
    }
    // Every essential PI is in the answer, every chosen term is prime.
    for (const e of sop.essential) assert.ok(sop.chosen.includes(e));
    for (const c of sop.chosen) assert.ok(sop.primes.includes(c));
    // The text form parses back to the same function.
    const back = parseSop(sop.expr, n);
    for (const m of all(n)) if (!f.dcs.includes(m)) assert.equal(evalSop(back, m), f.ones.includes(m));
    if (n <= 3 && f.ones.length) assert.ok(minLiterals(n, f.ones, f.dcs) <= sop.literals);
  }
});

test("fuzz: no SOP with fewer terms exists (exhaustive for 3 variables)", () => {
  // All products over 3 variables: each variable 0, 1 or absent.
  const products = [];
  for (let code = 0; code < 27; code++) {
    let value = 0, mask = 0, c = code;
    for (let i = 2; i >= 0; i--) { const d = c % 3; c = Math.floor(c / 3); if (d === 2) mask |= 1 << i; else value |= d << i; }
    products.push({ value, mask });
  }
  const cover = (terms) => all(3).filter((m) => evalSop(terms, m));
  for (let f = 0; f < 256; f++) {
    const ones = all(3).filter((m) => f >> m & 1);
    const r = minimise(3, ones);
    // Is there a cover with fewer products?
    const target = ones.join();
    let found = false;
    const rec = (start, chosen) => {
      if (found) return;
      if (cover(chosen).join() === target && chosen.length < r.chosen.length) { found = true; return; }
      if (chosen.length >= r.chosen.length - 1) return;
      for (let i = start; i < products.length; i++) rec(i + 1, [...chosen, products[i]]);
    };
    if (r.chosen.length > 1) rec(0, []);
    assert.equal(found, false, `F = ${target} has a smaller cover than ${r.expr}`);
  }
});

test("K-map layout is Gray-coded and covers every minterm once", () => {
  for (const n of [2, 3, 4, 5]) {
    const lay = layout(n);
    const seen = [];
    lay.maps.forEach((_, mi) => lay.rows.forEach((__, r) => lay.cols.forEach((___, c) => seen.push(lay.cell(mi, r, c)))));
    assert.deepEqual([...seen].sort((a, b) => a - b), all(n));
    assert.deepEqual(lay.colLabels.slice(0, 4), n === 2 ? ["0", "1"] : ["00", "01", "11", "10"]);
  }
  assert.deepEqual(parseList("0, 2, 5-7", 3), [0, 2, 5, 6, 7]);
  assert.throws(() => parseList("8", 3), /too big/);
  assert.deepEqual(parseSop("AB' + ~C", 3).length, 2);
  assert.deepEqual(parseSop("AA'", 3), []);
});

// --- Combinational ----------------------------------------------------------------------------

test("MUX implementation reproduces the function for every choice of data variable", () => {
  assert.deepEqual(muxImplement(3, [1, 3, 5, 6]).inputs, ["C", "C", "C", "C'"]);
  assert.deepEqual(muxImplement(3, [1, 3, 5, 6], [], 0).inputs, ["0", "1", "A", "A'"]);
  const r = rng(5);
  for (let k = 0; k < 200; k++) {
    const n = 2 + Math.floor(r() * 3);
    const ones = all(n).filter(() => r() < 0.5);
    for (let dv = 0; dv < n; dv++) {
      const impl = muxImplement(n, ones, [], dv);
      assert.deepEqual(muxFunction(n, impl.inputs, dv), ones, `n=${n} dv=${dv} ${ones}`);
    }
  }
  assert.deepEqual(mux([0, 1, 1, 0], 2), { select: 2, out: 1 });
  assert.throws(() => mux([0, 1, 1], 0), /2, 4, 8 or 16/);
});

test("decoders, half and full adders", () => {
  assert.deepEqual(decoder(3, [1, 0, 1], 1).outputs, [0, 0, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(decoder(2, [1, 1], 0).outputs, [0, 0, 0, 0]);
  for (let m = 0; m < 8; m++) {
    const [a, b, c] = [m >> 2 & 1, m >> 1 & 1, m & 1];
    const f = fullAdder(a, b, c);
    assert.equal(f.cout * 2 + f.sum, a + b + c);
    assert.equal(adderSteps("full", a, b, c).length, 6);
  }
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const x = halfAdder(a, b); assert.equal(x.carry * 2 + x.sum, a + b); }
});

test("ripple-carry adder: sums, and the worst-case delay formula", () => {
  const r = ripple("1011", "0110", 1, { tc: 2, ts: 3 });
  assert.equal(`${r.cout}${r.sum}`, "10010");
  assert.equal(r.total, 9); // (4 − 1)·2 + max(2, 3)
  assert.equal(ripple("1111", "0001", 0, { tc: 4, ts: 2 }).total, 16);
  const g = rng(9);
  for (let k = 0; k < 200; k++) {
    const n = 1 + Math.floor(g() * 10), a = Math.floor(g() * 2 ** n), b = Math.floor(g() * 2 ** n), c = g() < 0.5 ? 1 : 0;
    const x = ripple(a.toString(2).padStart(n, "0"), b.toString(2).padStart(n, "0"), c);
    assert.equal(parseInt(`${x.cout}${x.sum}`, 2), a + b + c);
    assert.equal(x.steps.at(-1).t, x.total);
  }
});

test("magnitude comparator", () => {
  const g = rng(3);
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(g() * 8), a = Math.floor(g() * 2 ** n), b = Math.floor(g() * 2 ** n);
    const c = compare(a.toString(2).padStart(n, "0"), b.toString(2).padStart(n, "0"));
    assert.deepEqual([c.gt, c.eq, c.lt], [a > b ? 1 : 0, a === b ? 1 : 0, a < b ? 1 : 0]);
  }
});

// --- Sequential ----------------------------------------------------------------------------------

test("flip-flops: characteristic and excitation tables agree", () => {
  for (const type of ["sr", "jk", "d", "t"]) for (const q of [0, 1]) for (const qn of [0, 1]) {
    const need = excitation(type, q, qn);
    // Every way of filling the X's must give qn.
    const fills = need.reduce((acc, v) => acc.flatMap((a) => (v === "X" ? [[...a, 0], [...a, 1]] : [[...a, v]])), [[]]);
    for (const inp of fills) if (!(type === "sr" && inp[0] && inp[1])) assert.equal(next(type, inp, q), qn, `${type} ${q}→${qn} with ${inp}`);
  }
  assert.equal(next("sr", [1, 1], 0), null);
  assert.deepEqual(clockFF("jk", [[1, 0], [1, 1], [0, 0], [1, 1]], 0).rows.map((x) => x.qn), [1, 0, 0, 1]);
  assert.deepEqual(clockFF("t", [[1], [1], [0], [1]], 0).rows.map((x) => x.qn), [1, 0, 0, 1]);
  assert.deepEqual(clockFF("d", [[1], [0], [0], [1]], 1).rows.map((x) => x.qn), [1, 0, 0, 1]);
});

test("flip-flop conversions match the textbook equations", () => {
  const eqs = (from, to) => convertFF(from, to).eqs.map((e) => `${e.name}=${e.expr}`).join(", ");
  assert.equal(eqs("d", "jk"), "D=K'Q + JQ'");
  assert.equal(eqs("jk", "t"), "J=T, K=T");
  assert.equal(eqs("jk", "d"), "J=D, K=D'");
  assert.equal(eqs("sr", "jk"), "S=JQ', R=KQ");
  assert.equal(eqs("t", "d"), "T=D'Q + DQ'");
  // The converted flip-flop behaves like the target for every input and state.
  for (const from of ["sr", "jk", "d", "t"]) for (const to of ["sr", "jk", "d", "t"]) {
    const r = convertFF(from, to);
    for (const row of r.rows) {
      if (row.qn === null) continue;
      const inp = r.eqs.map((e) => (evalSop(e.result.chosen, row.m) ? 1 : 0));
      assert.equal(next(from, inp, row.q), row.qn, `${from} as ${to} at ${row.m}`);
    }
  }
});

test("synchronous counters step through their sequence with the minimised logic", () => {
  const mod6 = syncCounter(modSequence(6), "t");
  assert.deepEqual(mod6.fns.map((f) => f.expr), ["Q1Q0 + Q2Q0", "Q2'Q0", "1"]);
  for (const type of ["sr", "jk", "d", "t"]) for (const seq of [modSequence(5), modSequence(10), modSequence(7, true), [0, 2, 5, 7], [3, 1, 6]]) {
    const r = syncCounter(seq, type);
    seq.forEach((s, i) => {
      let n = 0;
      for (let f = r.bits - 1; f >= 0; f--) {
        const inp = r.fns.filter((x) => x.ff === f).map((x) => (evalSop(x.result.chosen, s) ? 1 : 0));
        n |= next(type, inp, s >> f & 1) << f;
      }
      assert.equal(n, seq[(i + 1) % seq.length], `${type} ${seq} from ${s}`);
    });
  }
  assert.deepEqual(modSequence(4, true), [0, 3, 2, 1]);
});

test("ripple, ring and Johnson counters", () => {
  const r = rippleCounter(10, { tpd: 10 });
  assert.equal(r.bits, 4);
  assert.deepEqual(r.steps.slice(1).map((s) => s.state), [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  assert.deepEqual(r.steps.at(-1).chain, [9, 8, 10, 0]); // 1001 → 1000 → 1010 → cleared
  assert.equal(r.maxFreqMHz, 25);
  assert.deepEqual(rippleCounter(8, { down: true }).steps.slice(1).map((s) => s.state), [7, 6, 5, 4, 3, 2, 1, 0]);
  for (let N = 2; N <= 32; N++) assert.deepEqual(rippleCounter(N).steps.slice(1).map((s) => s.state), [...modSequence(N).slice(1), 0]);
  assert.deepEqual(shiftCounter("ring", 4).seq, [8, 4, 2, 1]);
  assert.deepEqual(shiftCounter("johnson", 4).seq, [0, 8, 12, 14, 15, 7, 3, 1]);
  for (let b = 2; b <= 8; b++) {
    assert.equal(shiftCounter("ring", b).states, b);
    assert.equal(shiftCounter("johnson", b).states, 2 * b);
  }
});

test("analysing a circuit from its equations", () => {
  // T2 = Q1Q0, T1 = Q0, T0 = 1 is a 3-bit binary up counter.
  const r = analyse("t", 3, [[[3, 7]], [[1, 3, 5, 7]], [all(3)]], 0);
  assert.deepEqual(r.seq, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.cycle.length, 8);
  // URL encoding round-trips.
  const g = rng(1);
  for (const type of ["t", "d", "jk"]) for (const bits of [2, 3, 4]) {
    const fns = randomEquations(g, type, bits);
    assert.deepEqual(decodeEq(encodeEq(fns, bits), type, bits), fns);
  }
});

// --- GATE -------------------------------------------------------------------------------------------

test("GATE generators: valid for seeds 1 to 150, answers check, replays open the tool", () => {
  const slugs = new Set(TOOLS.filter((t) => t.subject === "digital-logic").map((t) => t.slug));
  assert.equal(DL_TOPICS.length, 4);
  for (const t of DL_TOPICS) {
    assert.ok(slugs.has(t.slug), t.slug);
    assert.equal(t.subject, "digital-logic");
    const types = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const q = generate(t.slug, seed);
      const where = `${t.slug} seed ${seed}`;
      types.add(q.type);
      assert.ok(q.replay.startsWith(`/${t.slug}?`), where);
      assert.ok(q.stem.length && q.solution.length, where);
      if (q.type !== "nat") assert.equal(new Set(q.options).size, 4, where);
      assert.equal(check(q, q.answer).correct, true, where);
      const text = JSON.stringify([q.stem, q.options ?? [], q.solution]);
      assert.ok(!/[—–]/.test(text), `${where}: no long dashes`);
      assert.ok(!/undefined|NaN|null/.test(text), `${where}: ${text.slice(0, 200)}`);
    }
    assert.ok(types.size >= 2 || t.slug === "k-map", `${t.slug} should mix question types`);
  }
});

test("GATE answers agree with the engines when recomputed from the replay URL", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const q = generate("k-map", seed);
    const p = new URLSearchParams(q.replay.split("?")[1]);
    const n = Number(p.get("n")), ones = parseList(p.get("m"), n), dcs = parseList(p.get("d"), n);
    const r = minimise(n, ones, dcs);
    const stem = q.stem.join(" ");
    if (q.type === "nat" && /literals/.test(stem)) assert.equal(q.answer, r.literals);
    if (q.type === "nat" && /essential/.test(stem)) assert.equal(q.answer, r.essential.length);
    else if (q.type === "nat" && /prime implicants/.test(stem)) assert.equal(q.answer, r.primes.length);
  }
  for (let seed = 1; seed <= 150; seed++) {
    const q = generate("combinational-circuits", seed);
    const p = new URLSearchParams(q.replay.split("?")[1]);
    if (p.get("c") === "mux") {
      const ones = parseList(p.get("f"), 3);
      const impl = muxImplement(3, ones);
      assert.ok(q.options.some((o) => o.includes(impl.inputs.map((x, i) => `I${i} = ${x}`).join(", ")) || o === `Σm(${ones.join(", ")})`));
    } else assert.equal(q.answer, ripple(p.get("ra"), p.get("rb"), 0, { tc: Number(p.get("tc")), ts: Number(p.get("ts")) }).total);
  }
});
