// GATE question generators for this subject. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer comes from the same engine the visualiser runs, and every replay
// URL opens the tool on exactly the question's input.
import { pick, int, round2, show, query, mcq } from "./kit.js";
import { geometry, simulate, amat, toParams as cacheParams, tagDirectory, randomBlocks } from "../engines/cache.js";
import { parseProgram, schedule, timing, randomProgram, toParams as pipeParams } from "../engines/pipeline.js";
import { run, MODES, expanding, format, randomState, toParams as addrParams, DEFAULT as ADDR } from "../engines/addressing.js";
import { encode, decode, spec, toHex } from "../engines/ieee754.js";
import { overheads, dmaModes, toParams as ioParams, DEFAULT as IO } from "../engines/io.js";

const kb = (bytes) => (bytes >= 1024 && bytes % 1024 === 0 ? `${bytes / 1024} KB` : `${bytes} bytes`);
const mapText = (g) => (g.mapping === "direct" ? "direct-mapped" : g.mapping === "full" ? "fully associative" : `${g.ways}-way set-associative`);

// --- Cache ------------------------------------------------------------------------
function cacheMapping(r) {
  const kind = pick(r, ["bits", "bits", "trace", "trace", "amat"]);
  if (kind === "bits") {
    const addressBits = pick(r, [16, 24, 32]);
    const blockSize = pick(r, [16, 32, 64, 128]);
    const cacheSize = pick(r, [8, 16, 32, 64, 256]) * 1024;
    const mapping = pick(r, ["direct", "set", "set", "full"]);
    const ways = mapping === "set" ? pick(r, [2, 4, 8]) : 1;
    let g;
    try { g = geometry({ addressBits, blockSize, cacheSize, mapping, ways }); } catch { return null; }
    const ask = pick(r, mapping === "full" ? ["tag", "dir"] : ["tag", "index", "dir"]);
    const dir = tagDirectory(g, { valid: 1, dirty: 1 });
    const answer = ask === "tag" ? g.tagBits : ask === "index" ? g.indexBits : dir.total;
    const cfg = { mapping, ways: g.ways, addressBits, blockSize, cacheSize, unit: "addr", policy: "lru", write: "wb" };
    return {
      topic: "cache-mapping", type: "nat", marks: ask === "dir" ? 2 : 1, answer, tolerance: 0,
      stem: [
        `A ${kb(cacheSize)} ${mapText(g)} cache has ${blockSize}-byte blocks. The processor issues ${addressBits}-bit byte addresses.`,
        ask === "tag" ? "How many bits are in the tag field?" : ask === "index" ? `How many bits are in the ${mapping === "direct" ? "line" : "set"} index field?`
          : "Each cache line stores its tag plus one valid bit and one dirty bit. What is the total size of this tag storage, in bits?",
      ],
      solution: [
        `Lines = ${cacheSize} ÷ ${blockSize} = ${g.lines}; sets = ${g.lines} ÷ ${g.ways} = ${g.sets}.`,
        `Offset = log₂ ${blockSize} = ${g.offsetBits} bits; index = log₂ ${g.sets} = ${g.indexBits} bits; tag = ${addressBits} − ${g.indexBits} − ${g.offsetBits} = ${g.tagBits} bits.`,
        ask === "dir" ? `Tag storage = ${g.lines} lines × (${g.tagBits} + 1 + 1) bits = ${dir.total} bits.` : `Answer: ${answer}.`,
      ],
      replay: query("/cache-mapping", cacheParams({ cfg, trace: "0" })),
    };
  }
  if (kind === "trace") {
    const lines = pick(r, [4, 8]);
    const mapping = pick(r, ["direct", "set", "full"]);
    const ways = mapping === "set" ? 2 : 1;
    const policy = pick(r, ["lru", "lru", "fifo"]);
    const cfg = { mapping, ways: mapping === "full" ? lines : ways, addressBits: 8, blockSize: 1, cacheSize: lines, unit: "block", policy, write: "wb" };
    const refs = randomBlocks(r, int(r, 10, 12), 16);
    const res = simulate(refs, cfg);
    if (res.hits < 2 || res.misses < 4) return null;
    const ask = pick(r, ["misses", "hits", "ratio"]);
    const g = res.geometry;
    const answer = ask === "misses" ? res.misses : ask === "hits" ? res.hits : round2(res.hitRatio);
    const outcome = res.steps.slice(1).map((s) => `${s.block}${s.hit ? " H" : " M"}`).join(", ");
    return {
      topic: "cache-mapping", type: "nat", marks: 2, answer, tolerance: ask === "ratio" ? 0.01 : 0,
      stem: [
        `A ${mapText(g)} cache has ${lines} blocks${mapping === "set" ? ` (${g.sets} sets of 2)` : ""} and is initially empty.${mapping === "direct" ? " Block b goes to line b mod " + lines + "." : mapping === "set" ? ` Block b goes to set b mod ${g.sets}.` : ""} ${mapping === "direct" ? "" : `It uses ${policy.toUpperCase()} replacement. `}The processor references these main-memory blocks in order:`,
        refs.map((x) => x.addr).join(", "),
        ask === "misses" ? "How many misses occur?" : ask === "hits" ? "How many hits occur?" : "What is the hit ratio, correct to two decimal places?",
      ],
      solution: [
        `Outcome of each reference (H = hit, M = miss): ${outcome}.`,
        `${res.hits} hits and ${res.misses} misses (${res.kinds.compulsory} compulsory, ${res.kinds.conflict} conflict, ${res.kinds.capacity} capacity).`,
        ask === "ratio" ? `Hit ratio = ${res.hits} ÷ ${refs.length} = ${show(answer)}.` : `Answer: ${answer}.`,
      ],
      replay: query("/cache-mapping", cacheParams({ cfg, trace: refs.map((x) => x.addr).join(" ") })),
    };
  }
  // AMAT
  const two = r() < 0.6;
  const levels = two ? [{ t: pick(r, [1, 2, 5]), h: pick(r, [0.8, 0.85, 0.9, 0.95]) }, { t: pick(r, [10, 15, 20, 25]), h: pick(r, [0.5, 0.6, 0.7, 0.8, 0.9]) }]
    : [{ t: pick(r, [1, 2, 5, 10]), h: pick(r, [0.8, 0.9, 0.95, 0.98]) }];
  const mem = pick(r, [50, 60, 100, 120, 200]);
  const mode = two ? pick(r, ["hier", "simul"]) : "hier";
  const res = amat(levels, mem, mode);
  const answer = round2(res.value);
  const desc = levels.map((l, i) => `L${i + 1}: access time ${l.t} ns, hit ratio ${l.h}`).join("; ");
  return {
    topic: "cache-mapping", type: "nat", marks: two ? 2 : 1, answer, tolerance: 0.01,
    stem: [
      `A memory hierarchy has ${levels.length === 1 ? "one cache level" : "two cache levels"} and main memory. ${desc}; main memory access time ${mem} ns.`,
      mode === "hier" ? "A miss at one level goes on to the next level, so access times add up along the way (hierarchical access)." : "All levels are searched at the same time; an access that is satisfied at a level costs only that level's access time (simultaneous access).",
      "What is the average memory access time in ns, correct to two decimal places?",
    ],
    solution: [res.formula + ".", `= ${res.working} = ${show(answer)} ns.`],
    replay: query("/cache-mapping", cacheParams({ cfg: { mapping: "direct", ways: 1, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb" }, trace: "0", amat: { levels, mem, mode } })),
  };
}

// --- Pipelining ----------------------------------------------------------------------
function pipelining(r) {
  const kind = pick(r, ["cycles", "cycles", "speedup"]);
  const delays = [200, 100, 200, 200, 100];
  if (kind === "cycles") {
    const program = randomProgram(r, int(r, 4, 6));
    const forwarding = r() < 0.5;
    const res = schedule(parseProgram(program.join("\n")), { forwarding });
    if (res.stallCycles < 1) return null;
    const ask = pick(r, ["total", "stalls"]);
    const answer = ask === "total" ? res.total : res.stallCycles;
    return {
      topic: "pipelining", type: "nat", marks: 2, answer, tolerance: 0,
      stem: [
        `A 5-stage pipeline (IF, ID, EX, MEM, WB) ${forwarding ? "has full operand forwarding: an ALU result can be used by the very next instruction's EX, and a loaded value after MEM" : "has no operand forwarding"}. The register file is written in the first half of a cycle and read in the second half. Instruction and data memories are separate. The following instructions run in order:`,
        program.join("; "),
        ask === "total" ? "How many clock cycles does it take to complete all of them?" : "How many stall cycles are inserted in total?",
      ],
      solution: [
        ...res.hazards.map((x) => x.text),
        `Ideal: ${res.n} + 4 = ${res.ideal} cycles. With ${res.stallCycles} stall${res.stallCycles === 1 ? "" : "s"}: ${res.total} cycles.`,
      ],
      replay: query("/pipelining", pipeParams({ program, opts: { forwarding, resolve: "ex", branch: "stall" }, delays, latch: 0 })),
    };
  }
  const d = Array.from({ length: 5 }, () => pick(r, [100, 120, 140, 150, 160, 180, 200]));
  const latch = pick(r, [0, 5, 10, 20]);
  const n = int(r, 5, 12);
  const program = Array.from({ length: n }, (_, i) => `ADD R${(i % 6) + 1}, R7, R8`);
  const t = timing(d, latch, n);
  const ask = pick(r, ["speedup", "time"]);
  const answer = ask === "speedup" ? round2(t.speedup) : t.pipelined;
  return {
    topic: "pipelining", type: "nat", marks: 2, answer, tolerance: ask === "speedup" ? 0.01 : 0,
    stem: [
      `A non-pipelined processor takes ${d.join(" + ")} ps for the five steps of each instruction. It is converted into a 5-stage pipeline with those stage delays and a pipeline register delay of ${latch} ps after each stage.`,
      `${n} independent instructions are executed (no hazards).`,
      ask === "speedup" ? "What is the speedup of the pipelined processor over the non-pipelined one, correct to two decimal places?" : "How long, in ps, does the pipelined processor take to execute them?",
    ],
    solution: [
      `Clock period = max stage delay + latch = ${Math.max(...d)} + ${latch} = ${t.clock} ps.`,
      `Pipelined: (5 + ${n} − 1) × ${t.clock} = ${t.cycles} × ${t.clock} = ${t.pipelined} ps. Non-pipelined: ${n} × ${t.single} = ${t.unpipelined} ps.`,
      ask === "speedup" ? `Speedup = ${t.unpipelined} ÷ ${t.pipelined} = ${show(answer)}.` : `Answer: ${t.pipelined} ps.`,
    ],
    replay: query("/pipelining", pipeParams({ program, opts: { forwarding: true, resolve: "ex", branch: "stall" }, delays: d, latch })),
  };
}

// --- Addressing modes and instruction formats --------------------------------------------
function addressingModes(r) {
  const kind = pick(r, ["ea", "ea", "expanding", "format"]);
  if (kind === "ea") {
    const st = randomState(r);
    const mode = pick(r, ["direct", "indirect", "regindirect", "autoinc", "autodec", "indexed", "base", "relative"]);
    const res = run(mode, st);
    const ask = pick(r, ["ea", "operand"]);
    const answer = ask === "ea" ? res.ea : res.operand;
    const memRows = Object.entries(st.mem).sort((a, b) => a[0] - b[0]).map(([a, v]) => [a, v]);
    return {
      topic: "addressing-modes", type: "nat", marks: mode === "indirect" || mode === "relative" || mode === "autodec" ? 2 : 1, answer, tolerance: 0,
      stem: [
        `A two-word instruction LOAD AC is stored at addresses ${st.pc} and ${st.pc + 1}. Its address field A = ${st.A}. Register R = ${st.R}, index register XR = ${st.X}, base register BR = ${st.B}. Autoincrement and autodecrement change R by 1. Memory holds:`,
        { table: { head: ["Address", "Contents"], rows: memRows } },
        `With ${MODES[mode].name.toLowerCase()} addressing, what is ${ask === "ea" ? "the effective address" : "the value loaded into AC"}?`,
      ],
      solution: [...res.steps.slice(2).map((s) => s.note)],
      replay: query("/addressing-modes", addrParams({ mode, st, format: ADDR.format, exp: ADDR.exp })),
    };
  }
  if (kind === "expanding") {
    const L = pick(r, [12, 16, 16, 20, 24]);
    const a = pick(r, L <= 12 ? [3, 4] : L <= 16 ? [4, 5, 6] : [6, 7, 8]);
    if (2 * a >= L) return null;
    const free2 = 2 ** (L - 2 * a);
    const n2 = int(r, 1, free2 - 1);
    const left1 = (free2 - n2) * 2 ** a;
    const n1 = r() < 0.5 ? int(r, 1, left1 - 1) : null;
    const types = n1 == null ? [{ count: n2, bits: 2 * a }, { count: null, bits: a }] : [{ count: n2, bits: 2 * a }, { count: n1, bits: a }, { count: null, bits: 0 }];
    let res;
    try { res = expanding(L, types); } catch { return null; }
    return {
      topic: "addressing-modes", type: "nat", marks: 2, answer: res.answer, tolerance: 0,
      stem: [
        `A processor has ${L}-bit instructions and ${a}-bit address fields, and uses expanding opcodes. There are ${n2} two-address instructions${n1 != null ? ` and ${n1} one-address instructions` : ""}.`,
        `What is the largest possible number of ${n1 == null ? "one-address" : "zero-address"} instructions?`,
      ],
      solution: res.steps,
      replay: query("/addressing-modes", addrParams({ mode: "direct", st: ADDR.st, format: ADDR.format, exp: { L, types } })),
    };
  }
  const L = pick(r, [16, 24, 32]);
  const opcodes = int(r, 20, 120), registers = pick(r, [8, 12, 16, 24, 32, 64]), regFields = pick(r, [1, 2]);
  const f = format({ L, opcodes, registers, regFields });
  if (f.rest < 2) return null;
  return {
    topic: "addressing-modes", type: "nat", marks: 1, answer: f.rest, tolerance: 0,
    stem: [`A processor has ${opcodes} distinct instructions and ${registers} general-purpose registers. A ${L}-bit instruction word has an opcode, ${regFields === 1 ? "one register operand" : "two register operands"} and an immediate operand. How many bits are available for the immediate field?`],
    solution: f.steps,
    replay: query("/addressing-modes", addrParams({ mode: "direct", st: ADDR.st, format: { L, opcodes, registers, regFields, memWords: 0 }, exp: ADDR.exp })),
  };
}

// --- IEEE 754 -------------------------------------------------------------------------
function ieee754(r) {
  const kind = pick(r, ["hex", "value", "exponent"]);
  const fmt = pick(r, ["single", "single", "half"]);
  const S = spec(fmt);
  const sign = r() < 0.5 ? "-" : "";
  const value = `${sign}${int(r, 1, 120) / pick(r, [1, 2, 4, 8, 16])}`;
  const e = encode(value, fmt);
  if (e.kind !== "normal") return null;
  if (kind === "hex") {
    const flip = (bits) => toHex(bits, S);
    const one = 1n;
    const wrongs = [
      flip(e.bits ^ (one << BigInt(S.bits - 1))), // sign
      flip(e.bits + (one << BigInt(S.m))), // exponent off by one
      flip(e.bits - (one << BigInt(S.m))),
      flip((e.bits & ~((one << BigInt(S.m)) - one)) | (((e.bits & ((one << BigInt(S.m)) - one)) >> 1n) | (one << BigInt(S.m - 1)))), // hidden 1 stored
    ].map((x) => `0x${x}`);
    const q = mcq(r, `0x${e.hex}`, wrongs);
    if (!q) return null;
    return {
      topic: "ieee-754", type: "mcq", marks: 1, ...q,
      stem: [`What is the IEEE 754 ${S.name.toLowerCase().replace(/ \(.*/, "")} precision (${S.bits}-bit) representation of ${value.replace("-", "−")}, in hexadecimal?`],
      solution: e.steps.map((s) => s.note),
      replay: query("/ieee-754", { f: fmt, v: value }),
    };
  }
  if (kind === "value") {
    const d = decode(e.bits, fmt);
    return {
      topic: "ieee-754", type: "nat", marks: 1, answer: d.value, tolerance: 0,
      stem: [`The ${S.bits}-bit IEEE 754 ${fmt} precision number 0x${e.hex} is stored in a register. What decimal value does it represent?`],
      solution: d.steps.map((s) => s.note),
      replay: query("/ieee-754", { f: fmt, x: e.hex }),
    };
  }
  return {
    topic: "ieee-754", type: "nat", marks: 1, answer: e.E + S.bias, tolerance: 0,
    stem: [`${value.replace("-", "−")} is stored in IEEE 754 ${fmt} precision (${S.e}-bit exponent, bias ${S.bias}). What is the value of the stored (biased) exponent field, as an unsigned decimal number?`],
    solution: e.steps.slice(0, 4).map((s) => s.note),
    replay: query("/ieee-754", { f: fmt, v: value }),
  };
}

// --- I/O and DMA ------------------------------------------------------------------------
function ioDma(r) {
  const kind = pick(r, ["dma", "interrupt", "poll", "modes"]);
  if (kind === "modes") {
    const X = pick(r, [40, 80, 100, 200, 400, 1000, 2000]), Y = pick(r, [2, 4, 5, 10, 20, 25]);
    const m = dmaModes(X, Y);
    const mode = pick(r, ["burst", "steal"]);
    const answer = round2(m[mode].blocked * 100);
    if (answer <= 0) return null;
    return {
      topic: "io-dma", type: "nat", marks: 2, answer, tolerance: 0.01,
      stem: [
        `An I/O device takes ${X} µs to prepare its data, and the DMA transfer of that data takes ${Y} µs on the bus.`,
        mode === "burst" ? "In burst mode, the data is prepared first and then moved with the bus held throughout the transfer." : "In cycle-stealing mode, the next data is prepared while the current data is being transferred.",
        "What percentage of the time is the CPU blocked, correct to two decimal places?",
      ],
      solution: [`${mode === "burst" ? "Burst" : "Cycle stealing"}: blocked share = ${m[mode].formula} = ${Y} ÷ ${mode === "burst" ? `(${X} + ${Y})` : X} = ${show(answer)}%.`],
      replay: query("/io-dma", ioParams({ ...IO, X, Y })),
    };
  }
  const p = {
    clockMHz: pick(r, [200, 250, 400, 500, 600, 800, 1000]), rateKB: pick(r, [500, 1000, 2000, 4000, 5000, 8000, 10000]),
    unit: pick(r, [4, 8, 16, 32]), poll: pick(r, [100, 200, 300, 400]), isr: pick(r, [200, 300, 400, 500, 600]),
    block: pick(r, [1000, 2000, 4000, 8000, 10000, 20000]), dma: pick(r, [600, 1000, 1200, 1500, 2000, 3000]),
    X: IO.X, Y: IO.Y,
  };
  const o = overheads(p);
  const x = o[kind === "poll" ? "programmed" : kind];
  const answer = round2(x.percent);
  if (answer <= 0 || !x.keepsUp) return null;
  const what = kind === "dma"
    ? `The disk transfers data by DMA in blocks of ${p.block / 1000} KB. Setting up each DMA transfer and handling its completion interrupt take ${p.dma} CPU clock cycles in all.`
    : kind === "interrupt" ? `The disk interrupts the CPU each time ${p.unit} bytes are ready; handling one interrupt (including entry and exit) takes ${p.isr} CPU clock cycles.`
      : `The CPU polls the disk once for every ${p.unit} bytes, and each poll takes ${p.poll} clock cycles.`;
  return {
    topic: "io-dma", type: "nat", marks: kind === "dma" ? 2 : 1, answer, tolerance: 0.01,
    stem: [
      `A disk is constantly transferring data at ${p.rateKB >= 1000 ? `${p.rateKB / 1000} MB` : `${p.rateKB} KB`} per second to a processor running at ${p.clockMHz} MHz. ${what} Take 1 KB = 1000 bytes and 1 MB = 10⁶ bytes.`,
      "What percentage of the processor's time is spent on this transfer, correct to two decimal places?",
    ],
    solution: [
      `Events per second = ${o.rate} ÷ ${x.size} = ${x.events}.`,
      `CPU cycles per second = ${x.events} × ${x.cycles} = ${x.cyclesPerSecond}.`,
      `Share = ${x.cyclesPerSecond} ÷ ${o.f} = ${show(answer)}%.`,
    ],
    replay: query("/io-dma", ioParams(p)),
  };
}

export const TOPICS = [
  { slug: "cache-mapping", subject: "coa", title: "Cache mapping and AMAT", make: cacheMapping },
  { slug: "pipelining", subject: "coa", title: "Pipelining", make: pipelining },
  { slug: "addressing-modes", subject: "coa", title: "Addressing modes and formats", make: addressingModes },
  { slug: "ieee-754", subject: "coa", title: "IEEE 754 floating point", make: ieee754 },
  { slug: "io-dma", subject: "coa", title: "I/O, interrupts and DMA", make: ioDma },
];
