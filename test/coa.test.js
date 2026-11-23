// Computer organisation & architecture: cache mapping, pipelining, addressing
// modes, IEEE 754 and I/O. Textbook numbers, fuzzed invariants, and GATE
// questions whose replay link reproduces the answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as cache from "../public/js/engines/cache.js";
import * as pipe from "../public/js/engines/pipeline.js";
import * as addr from "../public/js/engines/addressing.js";
import * as fp from "../public/js/engines/ieee754.js";
import * as io from "../public/js/engines/io.js";
import { rng } from "../public/js/ui.js";
import { TOPICS as COA_TOPICS } from "../public/js/gate/coa.js";
import { check, generate } from "../public/js/gate-questions.js";

const blocks = (s) => cache.parseTrace(s);
const tiny = (mapping, extra = {}) => ({ mapping, ways: mapping === "set" ? 2 : 1, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb", ...extra });

// --- Cache --------------------------------------------------------------------------
test("cache: address split for a 64 KB cache with 16-byte blocks and 32-bit addresses", () => {
  const dm = cache.geometry({ addressBits: 32, blockSize: 16, cacheSize: 65536, mapping: "direct" });
  assert.deepEqual([dm.tagBits, dm.indexBits, dm.offsetBits, dm.lines], [16, 12, 4, 4096]);
  const sa = cache.geometry({ addressBits: 32, blockSize: 16, cacheSize: 65536, mapping: "set", ways: 4 });
  assert.deepEqual([sa.tagBits, sa.indexBits, sa.sets], [18, 10, 1024]);
  const fa = cache.geometry({ addressBits: 32, blockSize: 16, cacheSize: 65536, mapping: "full" });
  assert.deepEqual([fa.tagBits, fa.indexBits], [28, 0]);
  // Tag storage with valid + dirty bits: 4096 × (16 + 2).
  assert.equal(cache.tagDirectory(dm, { valid: 1, dirty: 1 }).total, 4096 * 18);
  assert.throws(() => cache.geometry({ addressBits: 32, blockSize: 12, cacheSize: 64, mapping: "direct" }), /power of two/);
});

test("cache: Hennessy & Patterson's 0 8 0 6 8 trace in three organisations", () => {
  const t = blocks("0 8 0 6 8");
  const dm = cache.simulate(t, tiny("direct"));
  assert.equal(dm.misses, 5);
  assert.deepEqual(dm.steps.slice(1).map((s) => s.kind), ["compulsory", "compulsory", "conflict", "compulsory", "conflict"]);
  const sa = cache.simulate(t, tiny("set"));
  assert.equal(sa.misses, 4);
  assert.deepEqual(sa.steps.slice(1).map((s) => s.hit), [false, false, true, false, false]);
  assert.equal(sa.steps[4].victim.block, 8); // LRU throws out 8, not 0
  const fa = cache.simulate(t, tiny("full", { ways: 4 }));
  assert.equal(fa.misses, 3);
  assert.equal(fa.kinds.conflict, 0);
});

test("cache: LRU and FIFO differ when a hit refreshes a block", () => {
  const t = blocks("1 2 1 3 1");
  const cfg = { mapping: "full", addressBits: 8, blockSize: 1, cacheSize: 2, unit: "block", write: "wb" };
  assert.equal(cache.simulate(t, { ...cfg, policy: "lru" }).misses, 3);
  assert.equal(cache.simulate(t, { ...cfg, policy: "fifo" }).misses, 4);
});

test("cache: byte addresses split into block, set and offset", () => {
  const res = cache.simulate(blocks("0 4 16 132 0x40"), { mapping: "direct", addressBits: 16, blockSize: 16, cacheSize: 64, unit: "addr", policy: "lru", write: "wb" });
  assert.deepEqual(res.steps.slice(1).map((s) => [s.block, s.set, s.tag, s.offset]), [[0, 0, 0, 0], [0, 0, 0, 4], [1, 1, 0, 0], [8, 0, 2, 4], [4, 0, 1, 0]]);
  assert.deepEqual(res.steps.slice(1).map((s) => s.hit), [false, true, false, false, false]);
});

test("cache: write-back versus write-through traffic", () => {
  const t = blocks("W0 2 W1 3 0");
  const cfg = { mapping: "direct", addressBits: 8, blockSize: 1, cacheSize: 2, unit: "block", policy: "lru" };
  const wb = cache.simulate(t, { ...cfg, write: "wb" });
  assert.deepEqual([wb.misses, wb.memReads, wb.writeBacks], [5, 5, 2]);
  const wt = cache.simulate(t, { ...cfg, write: "wt" });
  assert.deepEqual([wt.misses, wt.memReads, wt.memWrites, wt.writeBacks], [5, 3, 2, 0]);
  const wta = cache.simulate(t, { ...cfg, write: "wta" });
  assert.deepEqual([wta.memReads, wta.memWrites], [5, 2]);
});

test("cache: average memory access time, hierarchical and simultaneous", () => {
  assert.equal(cache.amat([{ t: 1, h: 0.95 }], 100).value, 6);
  assert.equal(cache.amat([{ t: 1, h: 0.9 }, { t: 10, h: 0.8 }], 100, "hier").value, 4);
  assert.equal(cache.amat([{ t: 1, h: 0.9 }, { t: 10, h: 0.8 }], 100, "simul").value, 3.7);
  assert.throws(() => cache.amat([{ t: 1, h: 2 }], 100), /hit ratio/);
});

test("cache: fuzzed invariants", () => {
  const r = rng(7);
  for (let k = 0; k < 300; k++) {
    const cfg = { ...cache.randomConfig(r), policy: r() < 0.5 ? "lru" : "fifo", write: ["wb", "wt", "wta"][Math.floor(r() * 3)] };
    const refs = cache.randomBlocks(r, 12, 20).map((x) => ({ ...x, write: r() < 0.3 }));
    const g = cache.geometry(cfg);
    assert.equal(g.tagBits + g.indexBits + g.offsetBits, g.addressBits);
    const res = cache.simulate(refs, cfg);
    assert.equal(res.hits + res.misses, refs.length);
    assert.equal(res.kinds.compulsory + res.kinds.capacity + res.kinds.conflict, res.misses);
    if (cfg.mapping === "full") assert.equal(res.kinds.conflict, 0);
    if (cfg.write !== "wt") assert.equal(res.kinds.compulsory, new Set(refs.map((x) => x.addr)).size);
    for (const s of res.steps) for (const set of s.sets) assert.ok(set.length === g.ways);
    // Never more valid lines than the cache has, and no block twice.
    const last = res.steps.at(-1).sets.flat().filter(Boolean).map((w) => w.block);
    assert.equal(new Set(last).size, last.length);
  }
});

// --- Pipelining ---------------------------------------------------------------------------
const run = (lines, opts) => pipe.schedule(pipe.parseProgram(lines.join("\n")), opts);

test("pipeline: load-use costs one stall with forwarding, two without", () => {
  const p = pipe.EXAMPLES.loaduse.program;
  const fw = run(p, { forwarding: true });
  assert.deepEqual([fw.total, fw.stallCycles], [9, 1]);
  assert.equal(fw.hazards[0].type, "load-use");
  assert.ok(fw.forwards.some((f) => f.reg === "R1" && f.latch === "MEM/WB" && f.to === 1));
  const no = run(p, { forwarding: false });
  assert.deepEqual([no.total, no.stallCycles], [10, 2]);
});

test("pipeline: Hennessy & Patterson's dependent chain needs no stalls with forwarding", () => {
  const p = pipe.EXAMPLES.chain.program;
  const fw = run(p, { forwarding: true });
  assert.deepEqual([fw.total, fw.stallCycles], [9, 0]);
  assert.deepEqual(fw.forwards.filter((f) => f.reg === "R2").map((f) => [f.to, f.latch]), [[1, "EX/MEM"], [2, "MEM/WB"]]);
  assert.deepEqual([run(p, { forwarding: false }).total], [11]);
});

test("pipeline: independent instructions take n + 4 cycles", () => {
  for (let n = 1; n <= 12; n++) {
    const prog = Array.from({ length: n }, (_, i) => `ADD R${i % 8 + 1}, R10, R11`);
    assert.equal(run(prog, { forwarding: false }).total, n + 4);
  }
});

test("pipeline: branch penalty is 1, 2 or 3 cycles for ID, EX or MEM resolution", () => {
  const p = ["ADD R1, R2, R3", "BEQ R4, R5, L1", "ADD R6, R7, R8"];
  for (const [resolve, lost] of [["id", 1], ["ex", 2], ["mem", 3]]) {
    const res = run(p, { forwarding: true, resolve, branch: "stall" });
    assert.equal(res.total, 7 + lost, resolve);
    assert.equal(res.hazards.find((x) => x.type === "control").cycles, lost);
  }
  assert.equal(run(p, { resolve: "ex", branch: "pnt" }).total, 7);
  assert.equal(run(["ADD R1, R2, R3", "BEQ R4, R5, L1 taken", "ADD R6, R7, R8"], { resolve: "ex", branch: "pnt" }).total, 9);
  // A branch compared in ID right after an ALU result: one data stall, then one lost fetch.
  const id = run(["ADD R1, R2, R3", "BEQ R1, R4, L1", "SUB R5, R6, R7"], { forwarding: true, resolve: "id" });
  assert.deepEqual([id.stallCycles, id.total], [2, 9]);
});

test("pipeline: stage delays, latches and speedup (H&P: 3 loads, 2400 ps vs 1400 ps)", () => {
  const t = pipe.timing([200, 100, 200, 200, 100], 0, 3);
  assert.deepEqual([t.clock, t.unpipelined, t.pipelined], [200, 2400, 1400]);
  assert.equal(t.speedup, Math.round((2400 / 1400) * 1e6) / 1e6);
  assert.equal(t.limit, 4);
  const l = pipe.timing([150, 120, 160, 140, 110], 10, 100);
  assert.deepEqual([l.clock, l.cycles, l.pipelined], [170, 104, 17680]);
});

test("pipeline: fuzzed invariants", () => {
  const r = rng(11);
  for (let k = 0; k < 300; k++) {
    const prog = pipe.randomProgram(r);
    const fw = run(prog, { forwarding: true }), no = run(prog, { forwarding: false });
    assert.ok(fw.total <= no.total, prog.join("; "));
    for (const res of [fw, no]) {
      assert.ok(res.total >= res.n + 4);
      assert.equal(res.stallCycles, res.hazards.reduce((s, x) => s + x.cycles, 0));
      res.rows.forEach((row, i) => {
        assert.equal(row.WB, row.EX + 2);
        if (i) assert.ok(row.EX > res.rows[i - 1].EX && row.ID >= res.rows[i - 1].EX);
      });
      const steps = pipe.cycles(res);
      assert.equal(steps.length, res.total);
      // Each stage holds at most one instruction per cycle.
      for (const s of steps) assert.equal(new Set(Object.values(s.occ).filter(Boolean)).size, Object.values(s.occ).filter(Boolean).length);
    }
  }
  assert.throws(() => pipe.parseProgram("FOO R1"), /unknown instruction/);
  assert.throws(() => pipe.parseProgram("LW R1, R2"), /offset\(register\)/);
});

// --- Addressing modes ---------------------------------------------------------------------
test("addressing: Mano's Fig. 8-7 table, every mode", () => {
  const want = {
    direct: [500, 800], immediate: [null, 500], indirect: [800, 300], relative: [702, 325], indexed: [600, 900],
    register: [null, 400], regindirect: [400, 700], autoinc: [400, 700], autodec: [399, 450], base: [800, 300],
  };
  for (const [mode, [ea, ac]] of Object.entries(want)) {
    const res = addr.run(mode, addr.MANO);
    assert.deepEqual([res.ea, res.operand], [ea, ac], mode);
  }
  assert.equal(addr.run("autoinc").R, 401);
  assert.equal(addr.run("autodec").R, 399);
  assert.equal(addr.run("indirect").memRefs, 2);
  assert.equal(addr.run("register").memRefs, 0);
});

test("addressing: instruction format and expanding opcodes (GATE 2016, GATE 2018)", () => {
  assert.equal(addr.format({ L: 32, opcodes: 40, registers: 24, regFields: 2 }).rest, 16);
  // 16-bit, 4 × (3 int regs), 8 × (2 FP regs), 14 × (int + FP), N × (one FP reg): N = 32.
  assert.equal(addr.expanding(16, [{ count: 4, bits: 12 }, { count: 8, bits: 12 }, { count: 14, bits: 10 }, { count: null, bits: 6 }]).answer, 32);
  // 16-bit, 6-bit address fields, 15 two-address → 64 one-address.
  assert.equal(addr.expanding(16, [{ count: 15, bits: 12 }, { count: null, bits: 6 }]).answer, 64);
  // Order typed doesn't matter.
  assert.equal(addr.expanding(16, [{ count: null, bits: 6 }, { count: 15, bits: 12 }]).answer, 64);
  assert.throws(() => addr.expanding(8, [{ count: 20, bits: 4 }]), /patterns/);
});

test("addressing: fuzzed modes agree with their definitions", () => {
  const r = rng(5);
  for (let k = 0; k < 200; k++) {
    const st = addr.randomState(r);
    const m = (a) => st.mem[a] ?? 0;
    assert.equal(addr.run("direct", st).operand, m(st.A));
    assert.equal(addr.run("indirect", st).operand, m(m(st.A)));
    assert.equal(addr.run("relative", st).ea, st.pc + st.words + st.A);
    assert.equal(addr.run("indexed", st).ea, st.A + st.X);
    assert.equal(addr.run("base", st).ea, st.B + st.A);
    assert.equal(addr.run("autodec", st).ea, st.R - 1);
  }
});

// --- IEEE 754 ----------------------------------------------------------------------------
test("ieee 754: textbook encodings", () => {
  assert.equal(fp.encode("-6.25", "single").hex, "C0C80000");
  assert.equal(fp.encode("0.1", "single").hex, "3DCCCCCD");
  assert.equal(fp.encode("0.1", "double").hex, "3FB999999999999A");
  assert.equal(fp.encode("1", "single").hex, "3F800000");
  assert.equal(fp.encode("-0", "single").hex, "80000000");
  assert.equal(fp.encode("65504", "half").hex, "7BFF");
  assert.equal(fp.encode("65520", "half").kind, "overflow"); // rounds up past the largest half
  assert.equal(fp.encode("1e-45", "single").hex, "00000001");
  assert.equal(fp.encode("inf", "single").hex, "7F800000");
  assert.equal(fp.encode("0.1", "single").exact, false);
  assert.equal(fp.encode("-6.25", "single").exact, true);
  // Ties go to even: 1 + 2^-24 is halfway between 1 and the next single.
  assert.equal(fp.encode("1.000000059604644775390625", "single").hex, "3F800000");
  assert.equal(fp.encode("1.000000178813934326171875", "single").hex, "3F800002");
});

test("ieee 754: decoding, specials and ranges", () => {
  assert.equal(fp.decode("C0C80000", "single").value, -6.25);
  assert.equal(fp.decode("0x3F800000", "single").formula, "1.0 × 2^0");
  assert.equal(fp.decode("7F800000", "single").kind, "inf");
  assert.equal(fp.decode("7FC00000", "single").kind, "nan");
  assert.equal(fp.decode("00000001", "single").kind, "denormal");
  assert.equal(fp.decode("00000001", "single").value, 2 ** -149);
  assert.equal(fp.decode("0011110111001101", "half").hex, "3DCD");
  const s = fp.ranges("single");
  assert.equal(s.maxNormal.value, 3.4028234663852886e38);
  assert.equal(s.minNormal.value, 2 ** -126);
  assert.equal(fp.ranges("half").maxNormal.value, 65504);
  assert.equal(fp.decode("3DCCCCCD", "single").exact, "0.100000001490116119384765625");
});

test("ieee 754: fuzz against the platform's own conversions", () => {
  const r = rng(3), dv = new DataView(new ArrayBuffer(8));
  for (let k = 0; k < 3000; k++) {
    const x = (r() - 0.5) * 10 ** (Math.floor(r() * 80) - 40);
    const s = String(x);
    dv.setFloat64(0, Number(s));
    assert.equal(fp.encode(s, "double").hex, dv.getBigUint64(0).toString(16).toUpperCase().padStart(16, "0"), s);
    // Feed single precision the double's exact value, so both round once from the same number.
    const exact = fp.decode(dv.getBigUint64(0), "double").exact;
    dv.setFloat32(0, Math.fround(Number(s)));
    const hex = dv.getUint32(0).toString(16).toUpperCase().padStart(8, "0");
    assert.equal(fp.encode(exact, "single").hex, hex, s);
    assert.ok(Object.is(fp.decode(hex, "single").value, Math.fround(Number(s))), s);
  }
});

// --- I/O ----------------------------------------------------------------------------------
test("io: Hennessy & Patterson's polling and interrupt overheads", () => {
  // Mouse polled 30 times a second, 400 cycles a poll, 500 MHz: 0.0024%.
  assert.equal(io.overheads({ clockMHz: 500, rateKB: 0.03, unit: 1, poll: 400, isr: 500, block: 1, dma: 0 }).programmed.percent, 0.0024);
  const disk = io.overheads(io.EXAMPLES.disk.p);
  assert.equal(disk.programmed.percent, 20); // 4 MB/s in 16-byte units
  assert.equal(disk.interrupt.percent, 25);
});

test("io: GATE 2004 DMA question is 0.1%", () => {
  const o = io.overheads(io.EXAMPLES.gate.p);
  assert.equal(o.dma.percent, 0.1);
  assert.ok(o.dma.fraction < o.interrupt.fraction);
});

test("io: DMA modes", () => {
  const m = io.dmaModes(2000, 20);
  assert.equal(m.burst.blocked, Math.round((20 / 2020) * 1e6) / 1e6);
  assert.equal(m.steal.blocked, 0.01);
  assert.equal(m.interleave.blocked, 0);
  assert.throws(() => io.overheads({ ...io.DEFAULT, clockMHz: 0 }), /Clock/);
  const w = io.walkthrough(io.DEFAULT);
  assert.equal(w.steps.length, 11);
  assert.ok(w.steps.every((s) => s.note && s.vars));
});

// --- GATE ----------------------------------------------------------------------------------
// Rerun the engine from the replay URL alone and get the same answer.
function replayAnswer(q) {
  const [path, qs] = q.replay.split("?");
  const p = new URLSearchParams(qs);
  const text = q.stem.filter((x) => typeof x === "string").join(" ");
  if (path === "/cache-mapping") {
    const st = cache.fromParams(p);
    if (/average memory access time/.test(text)) return cache.amat(st.amat.levels, st.amat.mem, st.amat.mode).value;
    const res = cache.simulate(cache.parseTrace(st.trace), st.cfg);
    const g = res.geometry;
    if (/tag field/.test(text)) return g.tagBits;
    if (/index field/.test(text)) return g.indexBits;
    if (/tag storage/.test(text)) return cache.tagDirectory(g, { valid: 1, dirty: 1 }).total;
    if (/misses occur/.test(text)) return res.misses;
    if (/hits occur/.test(text)) return res.hits;
    return res.hitRatio;
  }
  if (path === "/pipelining") {
    const st = pipe.fromParams(p);
    const res = pipe.schedule(pipe.parseProgram(st.program.join("\n")), st.opts);
    const t = pipe.timing(st.delays, st.latch, res.n, res.total);
    if (/speedup/.test(text)) return t.speedup;
    if (/How long/.test(text)) return t.pipelined;
    return /stall cycles/.test(text) ? res.stallCycles : res.total;
  }
  if (path === "/addressing-modes") {
    const st = addr.fromParams(p);
    if (/expanding/.test(text)) return addr.expanding(st.exp.L, st.exp.types).answer;
    if (/immediate field/.test(text)) return addr.format(st.format).rest;
    const res = addr.run(st.mode, st.st);
    return /effective address/.test(text) ? res.ea : res.operand;
  }
  if (path === "/ieee-754") {
    const st = fp.fromParams(p);
    if (st.x) return fp.decode(st.x, st.fmt).value;
    const e = fp.encode(st.v, st.fmt);
    return /exponent field/.test(text) ? e.E + e.spec.bias : `0x${e.hex}`;
  }
  if (path === "/io-dma") {
    const st = io.fromParams(p);
    if (/burst/.test(text)) return io.dmaModes(st.X, st.Y).burst.blocked * 100;
    if (/cycle-stealing/.test(text)) return io.dmaModes(st.X, st.Y).steal.blocked * 100;
    const o = io.overheads(st);
    return (/DMA/.test(text) ? o.dma : /interrupts/.test(text) ? o.interrupt : o.programmed).percent;
  }
  throw new Error(`unknown replay ${path}`);
}

test("GATE: COA generators are valid for seeds 1 to 150 and replays reproduce the answer", () => {
  assert.equal(COA_TOPICS.length, 5);
  for (const t of COA_TOPICS) {
    assert.equal(t.subject, "coa");
    for (let seed = 1; seed <= 150; seed++) {
      const q = generate(t.slug, seed);
      const where = `${t.slug} seed ${seed}`;
      assert.ok(["mcq", "msq", "nat"].includes(q.type), where);
      assert.ok(q.marks === 1 || q.marks === 2, where);
      assert.ok(q.stem.length && q.solution.length, where);
      assert.ok(q.replay.startsWith(`/${t.slug}?`), where);
      assert.equal(check(q, q.answer).correct, true, where);
      const text = JSON.stringify([q.stem, q.solution, q.options ?? []]);
      assert.ok(!/[—–]/.test(text), `${where}: no long dashes`);
      assert.ok(!/NaN|undefined|Infinity/.test(text), `${where}: ${text}`);
      const again = replayAnswer(q);
      if (q.type === "nat") assert.ok(Math.abs(again - q.answer) <= (q.tolerance ?? 0) + 0.005, `${where}: replay gives ${again}, answer ${q.answer}`);
      else assert.equal(again, q.options[q.answer], where);
    }
  }
});
