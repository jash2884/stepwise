// AI tool schemas: computer organisation and architecture. See ../schema-kit.js for the shape.
// These views decode their URL with the engine's own fromParams(), so validate()
// rebuilds the query string and calls the same function: what the schema checks
// is exactly what the view will show.
import { tool, round } from "../schema-kit.js";
import { amat, fromParams as cacheFrom, parseTrace, simulate, geometry, tagDirectory, MAPPINGS, POLICIES, WRITES, DEFAULT as CACHE } from "../../engines/cache.js";
import { parseProgram, schedule, timing, fromParams as pipeFrom, RESOLVE, BRANCH, DEFAULT as PIPE } from "../../engines/pipeline.js";
import { run, MODES as ADDR_MODES, format, expanding, parseMemory, parseTypes, memoryText, typesText, fromParams as addrFrom, DEFAULT as ADDR } from "../../engines/addressing.js";
import { encode, decode, fromParams as fpFrom, FORMATS } from "../../engines/ieee754.js";
import { overheads, dmaModes, fromParams as ioFrom, DEFAULT as IO } from "../../engines/io.js";

// Typed values back to the query string the view would read.
const query = (v) => new URLSearchParams(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, typeof x === "boolean" ? (x ? "1" : "0") : String(x)]));

const C = CACHE.cfg, A = CACHE.amat;

export const SCHEMAS = [
  tool("cache-mapping", {
    keywords: "cache memory direct mapped set associative fully associative k-way tag index offset bits line block size tag directory tag memory hit ratio miss ratio lru fifo replacement compulsory conflict capacity miss write back write through amat average memory access time hierarchical simultaneous access",
    params: {
      map: { type: "enum", values: Object.keys(MAPPINGS), default: C.mapping, desc: "direct, set (k-way set-associative) or full (fully associative)" },
      k: { type: "int", min: 1, max: 1048576, default: C.ways, desc: "ways per set, a power of two (set mapping only)" },
      ab: { type: "int", min: 4, max: 48, default: C.addressBits, desc: "address bits (byte addresses)" },
      bs: { type: "int", min: 1, max: 1048576, default: C.blockSize, desc: "block (line) size in bytes, a power of two" },
      cs: { type: "int", min: 1, max: 1073741824, default: C.cacheSize, desc: "cache size in bytes (data only), a power of two; 32 KB is 32768" },
      u: { type: "enum", values: ["block", "addr"], default: C.unit, desc: "how the trace is written: block numbers, or byte addresses" },
      rp: { type: "enum", values: Object.keys(POLICIES), default: C.policy, desc: "replacement policy" },
      wp: { type: "enum", values: Object.keys(WRITES), default: C.write, desc: "wb: write-back + write-allocate; wt: write-through + no-write-allocate; wta: write-through + write-allocate" },
      t: { type: "string", format: "references separated by spaces, decimal or 0x hex, W in front for a write, at most 64, e.g. 0 8 0 6 8 or 0x1C W12 40", default: CACHE.trace, desc: "the reference trace (use 0 when only the address split is asked)" },
      lv: { type: "string", format: "time:hitRatio for each cache level, L1 first, joined by commas (hit ratio 0 to 1, local to that level), e.g. 1:0.9,10:0.8", default: A.levels.map((l) => `${l.t}:${l.h}`).join(","), desc: "AMAT: cache levels" },
      tm: { type: "number", min: 0, default: A.mem, desc: "AMAT: main memory access time" },
      am: { type: "enum", values: ["hier", "simul"], default: A.mode, desc: "AMAT: hier (a miss goes on to the next level, times add) or simul (all levels looked up at once)" },
    },
    answers: {
      tagBits: "tag bits", indexBits: "index (set or line) bits", offsetBits: "offset (word in block) bits", lines: "number of cache lines", sets: "number of sets",
      tagStore: "tag directory size in bits, tag only", tagStoreValid: "tag directory with a valid bit per line", tagStoreValidDirty: "tag directory with a valid and a dirty bit per line",
      hits: "hits on the trace", misses: "misses on the trace", hitRatio: "hits / references", missRatio: "misses / references",
      compulsory: "compulsory misses", conflict: "conflict misses", capacity: "capacity misses", writeBacks: "write-backs of dirty blocks", memWrites: "memory writes (write-through)",
      amat: "average memory access time from lv, tm and am",
    },
    examples: [
      { request: "32 KB 4-way set associative cache, 64-byte blocks, 32-bit addresses: how many tag bits?", params: { map: "set", k: 4, ab: 32, bs: 64, cs: 32768, u: "addr", t: "0" } },
      { request: "Direct-mapped cache of 4 blocks, block references 0 8 0 6 8: how many misses?", params: { map: "direct", k: 1, ab: 8, bs: 1, cs: 4, u: "block", t: "0 8 0 6 8" } },
      { request: "L1 1 ns hit ratio 0.9, L2 10 ns hit ratio 0.8, memory 100 ns, hierarchical: AMAT?", params: { lv: "1:0.9,10:0.8", tm: 100, am: "hier" } },
    ],
    validate(v) {
      const levels = v.lv.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const [t, h, extra] = s.split(":").map(Number);
        if (extra !== undefined || !Number.isFinite(t) || !Number.isFinite(h)) throw new Error(`lv: "${s}" should be time:hitRatio, like 1:0.9`);
        return { t, h };
      });
      if (!levels.length || levels.length > 3) throw new Error("lv needs 1 to 3 levels, like 1:0.9,10:0.8");
      const st = cacheFrom(query(v));
      const g = geometry(st.cfg);
      const res = simulate(parseTrace(st.trace), st.cfg);
      const am = amat(st.amat.levels, st.amat.mem, st.amat.mode);
      const values = {
        tagBits: g.tagBits, indexBits: g.indexBits, offsetBits: g.offsetBits, lines: g.lines, sets: g.sets,
        tagStore: tagDirectory(g, { valid: 0 }).total, tagStoreValid: tagDirectory(g).total, tagStoreValidDirty: tagDirectory(g, { valid: 1, dirty: 1 }).total,
        hits: res.hits, misses: res.misses, hitRatio: round(res.hitRatio), missRatio: round(res.missRatio),
        compulsory: res.kinds.compulsory, conflict: res.kinds.conflict, capacity: res.kinds.capacity, writeBacks: res.writeBacks, memWrites: res.memWrites,
        amat: round(am.value),
      };
      return { text: `${g.lines} lines in ${g.sets} sets of ${g.ways}: tag ${g.tagBits}, index ${g.indexBits}, offset ${g.offsetBits} bits. The trace gives ${res.hits} hits and ${res.misses} misses (hit ratio ${values.hitRatio}). AMAT (${st.amat.mode === "hier" ? "hierarchical" : "simultaneous"}) = ${values.amat}.`, values };
    },
  }),

  tool("pipelining", {
    keywords: "pipeline 5 stage IF ID EX MEM WB hazard data hazard load use stall stall cycles forwarding bypassing operand forwarding branch control hazard predict not taken flush speedup clock period stage delay latch register overhead CPI throughput",
    params: {
      p: { type: "string", format: "instructions separated by ';', each LW Rd, off(Rs) / SW Rs, off(Rb) / ADD|SUB|AND|OR|MUL Rd, Rs, Rt / ADDI Rd, Rs, n / BEQ|BNE Rs, Rt, L taken / NOP; at most 16, e.g. LW R1, 0(R2); SUB R4, R1, R5", default: PIPE.program.join(";"), desc: "the program" },
      fw: { type: "bool", default: PIPE.opts.forwarding, desc: "full operand forwarding (bypassing)" },
      br: { type: "enum", values: Object.keys(RESOLVE), default: PIPE.opts.resolve, desc: "stage where a branch is resolved" },
      bp: { type: "enum", values: Object.keys(BRANCH), default: PIPE.opts.branch, desc: "branch policy: stall until resolved, or pnt (predict not taken; only taken branches cost cycles)" },
      d: { type: "string", format: "five stage delays IF,ID,EX,MEM,WB, all above 0, e.g. 200,100,200,200,100", default: PIPE.delays.join(","), desc: "stage delays (any time unit), used for clock period and speedup" },
      l: { type: "number", min: 0, default: PIPE.latch, desc: "pipeline register (latch) delay added to the clock period" },
    },
    answers: {
      cycles: "total clock cycles for the program", stalls: "stall cycles inserted", ideal: "cycles with no hazards (n + 4)", cpi: "cycles per instruction", hazards: "number of hazards that cost cycles",
      clock: "pipelined clock period (max stage delay + latch)", time: "pipelined execution time (cycles x clock)", unpipelined: "non-pipelined time (n x sum of delays)", speedup: "speedup over the non-pipelined processor",
    },
    examples: [
      { request: "LW R1, 0(R2) then SUB R4, R1, R5 with forwarding: how many stalls?", params: { p: "LW R1, 0(R2); SUB R4, R1, R5; AND R6, R1, R7; OR R8, R1, R9", fw: true } },
      { request: "Stage delays 150 120 160 140 100 ps with a 10 ps latch, 10 independent instructions: speedup?", params: { p: Array.from({ length: 10 }, (_, i) => `ADD R${(i % 6) + 1}, R7, R8`).join(";"), d: "150,120,160,140,100", l: 10 } },
    ],
    validate(v) {
      const d = v.d.split(",").map(Number);
      if (d.length !== 5 || !d.every((x) => x > 0)) throw new Error("d needs five stage delays above 0, like 200,100,200,200,100");
      const st = pipeFrom(query(v));
      const res = schedule(parseProgram(st.program.join("\n")), st.opts);
      const t = timing(st.delays, st.latch, res.n, res.total);
      const values = { cycles: res.total, stalls: res.stallCycles, ideal: res.ideal, cpi: round(res.cpi), hazards: res.hazards.length, clock: t.clock, time: t.pipelined, unpipelined: t.unpipelined, speedup: round(t.speedup) };
      return { text: `${res.n} instructions take ${res.total} cycles (${res.stallCycles} stall${res.stallCycles === 1 ? "" : "s"}, ideal ${res.ideal}) ${st.opts.forwarding ? "with" : "without"} forwarding. Clock ${t.clock}, time ${t.pipelined} against ${t.unpipelined} unpipelined: speedup ${values.speedup}.`, values };
    },
  }),

  tool("addressing-modes", {
    keywords: "addressing modes effective address EA immediate direct indirect register register indirect autoincrement autodecrement indexed base register pc relative displacement operand instruction format opcode bits expanding opcode one address two address zero address instructions",
    params: {
      m: { type: "enum", values: Object.keys(ADDR_MODES), default: ADDR.mode, desc: "addressing mode of the LOAD AC instruction" },
      pc: { type: "int", min: 0, max: 1000000, default: ADDR.st.pc, desc: "address of the instruction (PC before fetch)" },
      w: { type: "int", min: 1, max: 4, default: ADDR.st.words, desc: "instruction length in words (PC-relative adds A to PC + w)" },
      a: { type: "int", min: -1000000, max: 1000000, default: ADDR.st.A, desc: "address field A of the instruction" },
      r: { type: "int", min: -1000000, max: 1000000, default: ADDR.st.R, desc: "register R named in the instruction" },
      x: { type: "int", min: -1000000, max: 1000000, default: ADDR.st.X, desc: "index register XR" },
      b: { type: "int", min: -1000000, max: 1000000, default: ADDR.st.B, desc: "base register BR" },
      d: { type: "int", min: 0, max: 16, default: ADDR.st.d, desc: "step for autoincrement and autodecrement" },
      mem: { type: "string", format: "address:value pairs separated by spaces, at most 24, e.g. 399:450 400:700 500:800", default: memoryText(ADDR.st.mem), desc: "memory contents (unlisted words read as 0)" },
      fL: { type: "int", min: 4, max: 128, default: ADDR.format.L, desc: "format: instruction length in bits" },
      fo: { type: "int", min: 1, max: 100000, default: ADDR.format.opcodes, desc: "format: number of distinct instructions (opcodes)" },
      fr: { type: "int", min: 0, max: 100000, default: ADDR.format.registers, desc: "format: number of registers" },
      fn: { type: "int", min: 0, max: 4, default: ADDR.format.regFields, desc: "format: register fields per instruction" },
      fm: { type: "int", min: 0, max: 1000000000, default: ADDR.format.memWords, desc: "format: memory words to address (0 to skip that check)" },
      eL: { type: "int", min: 2, max: 64, default: ADDR.exp.L, desc: "expanding opcodes: instruction length in bits" },
      ty: { type: "string", format: "count:operandBits for each kind of instruction, separated by spaces, with ? for the one count to find, e.g. 4:12 8:12 14:10 ?:6 (two-address with 6-bit fields in a 16-bit word is n:12)", default: typesText(ADDR.exp.types), desc: "expanding opcodes: the instruction kinds" },
    },
    answers: {
      ea: "effective address in mode m", operand: "value loaded into AC in mode m", memRefs: "memory reads for the operand after the fetch", R: "R after the instruction (autoincrement / autodecrement)",
      "ea.indexed": "effective address in each mode (ea.direct, ea.indirect, ea.relative, ...)", "ac.indexed": "value loaded in each mode (ac.immediate, ac.base, ...)",
      opBits: "format: opcode bits", regBits: "format: bits per register field", rest: "format: bits left for the immediate or address field",
      expanding: "expanding opcodes: largest count for the ? kind", left: "expanding opcodes: unused bit patterns",
    },
    examples: [
      { request: "PC-relative: instruction at 200 (2 words), A = 500, memory 702 holds 325: effective address and operand?", params: { m: "relative", pc: 200, w: 2, a: 500, mem: "702:325 800:300" } },
      { request: "32-bit instruction, 40 opcodes, 24 registers, two register operands: bits left for the immediate?", params: { fL: 32, fo: 40, fr: 24, fn: 2 } },
      { request: "16-bit instructions, 6-bit address fields, 15 two-address instructions: how many one-address instructions at most?", params: { eL: 16, ty: "15:12 ?:6" } },
    ],
    validate(v) {
      parseMemory(v.mem);
      parseTypes(v.ty);
      const st = addrFrom(query(v));
      const r = run(st.mode, st.st);
      const f = format(st.format);
      const e = expanding(st.exp.L, st.exp.types);
      const values = { ea: r.ea ?? "none", operand: r.operand, memRefs: r.memRefs, R: r.R, opBits: f.opBits, regBits: f.regBits, rest: f.rest, left: e.left };
      if (e.answer != null) values.expanding = e.answer;
      for (const m of Object.keys(ADDR_MODES)) { const x = run(m, st.st); values[`ea.${m}`] = x.ea ?? "none"; values[`ac.${m}`] = x.operand; }
      return { text: `${ADDR_MODES[st.mode].name}: EA = ${values.ea}, AC = ${r.operand}. Format: ${f.opBits} opcode bits, ${f.regBits} per register field, ${f.rest} bits left. Expanding opcodes: ${e.answer != null ? `at most ${e.answer} of the ? kind` : `${e.left} patterns left over`}.`, values };
    },
  }),

  tool("ieee-754", {
    keywords: "ieee 754 floating point single precision double precision half precision float32 float64 hex representation sign exponent mantissa fraction bias biased exponent hidden bit normalised denormal subnormal nan infinity rounding",
    params: {
      f: { type: "enum", values: Object.keys(FORMATS), default: "single", desc: "format: half (16-bit), single (32-bit) or double (64-bit)" },
      v: { type: "string", format: "a decimal number, e.g. -6.25, 0.1, 1.5e3, inf or nan", default: "-6.25", desc: "the decimal value to encode (ignored when x is given)" },
      x: { type: "string", format: "hex digits for the whole word, e.g. C0C80000 (or the full bit string of 0s and 1s)", default: "", desc: "bits to decode instead; empty to encode v" },
    },
    answers: { hex: "the bits in hex", sign: "sign bit", exponentField: "stored (biased) exponent as an unsigned number", E: "unbiased exponent", fraction: "fraction (mantissa) bits as stored", kind: "normal, denormal, zero, inf, nan, overflow or underflow", value: "the value actually stored, in decimal", exact: "true if v is stored exactly" },
    examples: [
      { request: "IEEE 754 single precision representation of -6.25 in hex", params: { f: "single", v: "-6.25" } },
      { request: "What decimal value is 0x41A40000 in single precision?", params: { f: "single", x: "41A40000" } },
    ],
    validate(v) {
      const st = fpFrom(query(v));
      if (st.x) {
        const d = decode(st.x, st.fmt);
        return { text: `0x${d.hex} in ${st.fmt} precision is ${d.text} (${d.kind}): sign ${d.fields.s}, exponent ${d.fields.e} (${d.e}), so ${d.formula}.`,
          values: { hex: d.hex, sign: d.sign, exponentField: d.e, E: d.E ?? "none", fraction: d.fields.f, kind: d.kind, value: Number.isFinite(d.value) ? d.value : d.text } };
      }
      const e = encode(st.v, st.fmt);
      const exponentField = parseInt(e.fields.e, 2);
      return { text: `${st.v} in ${st.fmt} precision is 0x${e.hex}: sign ${e.fields.s}, exponent ${e.fields.e} (${exponentField}), fraction ${e.fields.f}. ${e.exact ? "Stored exactly." : `Stored as ${e.decoded.text}.`}`,
        values: { hex: e.hex, sign: Number(e.fields.s), exponentField, E: e.decoded.E ?? "none", fraction: e.fields.f, kind: e.kind, value: Number.isFinite(e.decoded.value) ? e.decoded.value : e.decoded.text, exact: !!e.exact } };
    },
  }),

  tool("io-dma", {
    keywords: "io i/o programmed io polling interrupt driven io interrupt overhead dma direct memory access burst mode cycle stealing interleaving cpu time percentage disk transfer rate",
    params: {
      f: { type: "number", min: 0, default: IO.clockMHz, desc: "CPU clock in MHz" },
      rate: { type: "number", min: 0, default: IO.rateKB, desc: "device transfer rate in KB per second (1 KB = 1000 bytes; 4 MB/s is 4000)" },
      unit: { type: "number", min: 0, default: IO.unit, desc: "bytes per poll or per interrupt" },
      poll: { type: "number", min: 0, default: IO.poll, desc: "CPU cycles per poll" },
      isr: { type: "number", min: 0, default: IO.isr, desc: "CPU cycles per interrupt (entry, handler, exit)" },
      blk: { type: "number", min: 0, default: IO.block, desc: "DMA block size in bytes" },
      dma: { type: "number", min: 0, default: IO.dma, desc: "CPU cycles per DMA block (set-up plus completion interrupt)" },
      X: { type: "number", min: 0, default: IO.X, desc: "DMA modes: time to prepare the data" },
      Y: { type: "number", min: 0, default: IO.Y, desc: "DMA modes: time to transfer it on the bus" },
    },
    answers: { pollPercent: "% of CPU time with programmed I/O (polling)", interruptPercent: "% with interrupt-driven I/O", dmaPercent: "% with DMA", burstPercent: "% of time the CPU is blocked in burst mode, Y / (X + Y)", stealPercent: "% blocked in cycle stealing, Y / X", dmaPerSecond: "DMA blocks per second", interruptsPerSecond: "interrupts per second" },
    examples: [
      { request: "10 MB/s disk, 600 MHz CPU, DMA in 20 KB blocks with 1200 cycles each: % CPU time?", params: { f: 600, rate: 10000, blk: 20000, dma: 1200, unit: 4, poll: 300, isr: 600 } },
      { request: "Device prepares data in 40 µs and DMA transfer takes 2 µs: % CPU blocked in cycle stealing mode?", params: { X: 40, Y: 2 } },
    ],
    validate(v) {
      const p = ioFrom(query(v));
      const o = overheads(p), m = dmaModes(p.X, p.Y);
      const values = { pollPercent: round(o.programmed.percent), interruptPercent: round(o.interrupt.percent), dmaPercent: round(o.dma.percent), burstPercent: round(m.burst.blocked * 100), stealPercent: round(m.steal.blocked * 100), dmaPerSecond: o.dma.events, interruptsPerSecond: o.interrupt.events };
      return { text: `CPU share: polling ${values.pollPercent}%, interrupts ${values.interruptPercent}%, DMA ${values.dmaPercent}%. With X = ${p.X} and Y = ${p.Y} the CPU is blocked ${values.burstPercent}% in burst mode and ${values.stealPercent}% in cycle stealing.`, values };
    },
  }),
];
