// Classic 5-stage RISC pipeline (IF ID EX MEM WB) timing diagrams with data and
// control hazards. The program is the order instructions actually execute (a
// dynamic trace), so a taken branch's target is simply the next line.
//
// Conventions (stated in the UI):
// - Separate instruction and data memories, so there are no structural hazards.
// - The register file is written in the first half of a cycle and read in the
//   second half, so WB and ID can share a cycle.
// - Stalls hold an instruction in ID (and the one behind it in IF) and put a
//   bubble into EX.
// - Forwarding: ALU results can be used by the next instruction's EX; a load's
//   value only after MEM (one load-use stall). A store's data can be forwarded
//   into MEM. A branch compared in ID needs its operands at the start of ID.
// - Branches: "stall" holds fetch until the branch resolves (1, 2 or 3 bubbles
//   for ID, EX or MEM); "predict not taken" keeps fetching and only loses those
//   cycles when the branch is marked taken.

export const STAGES = ["IF", "ID", "EX", "MEM", "WB"];
export const RESOLVE = { id: "ID", ex: "EX", mem: "MEM" };
export const BRANCH = { stall: "Stall until resolved", pnt: "Predict not taken" };

const ALU = new Set(["ADD", "SUB", "AND", "OR", "XOR", "SLT", "MUL", "DIV", "NOR", "SLL", "SRL"]);
const ALUI = new Set(["ADDI", "SUBI", "ANDI", "ORI", "XORI", "SLTI"]);
const REG = /^[RF]\d{1,2}$/i;

export const CODE = [
  "for each clock cycle",
  "  WB: write results into the register file (first half)",
  "  MEM: loads read and stores write data memory",
  "  EX: compute; take operands from EX/MEM or MEM/WB when forwarding",
  "  ID: read registers (second half); an operand not ready yet → stall",
  "    stall: hold ID and IF, send a bubble into EX",
  "  IF: fetch the next instruction, unless waiting for a branch",
  "  if a branch resolves now and fetch was wrong then flush",
];

function reg(tok, line) {
  const t = tok.trim().toUpperCase();
  if (!REG.test(t)) throw new Error(`Line ${line}: "${tok.trim()}" isn't a register (use R0 to R31).`);
  return t;
}

export function parseProgram(text) {
  const lines = String(text).split(/\n|;/).map((l) => l.replace(/(#|\/\/).*$/, "").trim()).filter(Boolean);
  if (!lines.length) throw new Error("Type at least one instruction.");
  if (lines.length > 16) throw new Error("Use at most 16 instructions.");
  return lines.map((src, k) => {
    const n = k + 1;
    const taken = /\btaken\b/i.test(src) && !/\bnot\s+taken\b/i.test(src);
    const clean = src.replace(/\b(not\s+)?taken\b/gi, "").trim();
    const [opRaw, ...rest] = clean.split(/\s+/);
    const op = opRaw.toUpperCase();
    const args = rest.join(" ").split(",").map((s) => s.trim()).filter(Boolean);
    const mem = (a) => { const m = /^(-?\d*)\((\w+)\)$/.exec(a ?? ""); if (!m) throw new Error(`Line ${n}: write the address as offset(register), like 4(R2).`); return reg(m[2], n); };
    if (op === "NOP") return { n, op, text: "NOP", kind: "nop", dest: null, srcs: [] };
    if (op === "LW" || op === "LD" || op === "LOAD") {
      if (args.length !== 2) throw new Error(`Line ${n}: LW needs a register and an address, like LW R1, 0(R2).`);
      return { n, op: "LW", text: `LW ${reg(args[0], n)}, ${args[1]}`, kind: "load", dest: reg(args[0], n), srcs: [{ r: mem(args[1]), use: "ex" }] };
    }
    if (op === "SW" || op === "SD" || op === "STORE") {
      if (args.length !== 2) throw new Error(`Line ${n}: SW needs a register and an address, like SW R1, 0(R2).`);
      return { n, op: "SW", text: `SW ${reg(args[0], n)}, ${args[1]}`, kind: "store", dest: null, srcs: [{ r: mem(args[1]), use: "ex" }, { r: reg(args[0], n), use: "mem" }] };
    }
    if (ALU.has(op)) {
      if (args.length !== 3) throw new Error(`Line ${n}: ${op} needs three registers, like ${op} R1, R2, R3.`);
      const [d, a, b] = args.map((x) => reg(x, n));
      return { n, op, text: `${op} ${d}, ${a}, ${b}`, kind: "alu", dest: d, srcs: [{ r: a, use: "ex" }, { r: b, use: "ex" }] };
    }
    if (ALUI.has(op)) {
      if (args.length !== 3 || !/^-?\d+$/.test(args[2])) throw new Error(`Line ${n}: ${op} needs two registers and a number, like ${op} R1, R2, 4.`);
      const [d, a] = [reg(args[0], n), reg(args[1], n)];
      return { n, op, text: `${op} ${d}, ${a}, ${args[2]}`, kind: "alu", dest: d, srcs: [{ r: a, use: "ex" }] };
    }
    if (op === "BEQ" || op === "BNE") {
      if (args.length < 2) throw new Error(`Line ${n}: ${op} needs two registers, like ${op} R1, R2, L1.`);
      const [a, b] = [reg(args[0], n), reg(args[1], n)];
      return { n, op, text: `${op} ${a}, ${b}${args[2] ? `, ${args[2]}` : ""}${taken ? " (taken)" : ""}`, kind: "branch", taken, dest: null, srcs: [{ r: a, use: "branch" }, { r: b, use: "branch" }] };
    }
    throw new Error(`Line ${n}: unknown instruction "${opRaw}". Use LW, SW, ADD, SUB, AND, OR, MUL, ADDI, BEQ, BNE or NOP.`);
  });
}

// Schedule every instruction: cycle numbers start at 1.
export function schedule(program, { forwarding = true, resolve = "ex", branch = "stall" } = {}) {
  if (!RESOLVE[resolve]) throw new Error(`Unknown branch resolution stage ${resolve}`);
  if (!BRANCH[branch]) throw new Error(`Unknown branch policy ${branch}`);
  const rows = [], hazards = [], forwards = [];
  const resolveOffset = { id: 0, ex: 1, mem: 2 }[resolve]; // cycles after EX_i − 1
  let prev = null;
  program.forEach((ins, i) => {
    // Fetch: right after the previous instruction enters ID, unless a branch ahead holds it.
    let IF = prev ? prev.ID : 1, control = null;
    if (prev && prev.ins.kind === "branch" && (branch === "stall" || prev.ins.taken)) {
      const at = prev.EX + resolveOffset; // first cycle after the branch resolves
      if (at > IF) { control = { lost: at + 1 - prev.EX, from: prev.i }; IF = at; }
    }
    const ID = Math.max(IF + 1, prev ? prev.EX : 0);
    let EX = ID + 1, binding = null;
    const deps = [];
    for (const s of ins.srcs) {
      if (s.r === "R0") continue;
      const p = [...rows].reverse().find((x) => x.ins.dest === s.r);
      if (!p) continue;
      const ready = p.ins.kind === "load" ? p.MEM : p.EX; // value exists at the end of this cycle
      let need;
      if (!forwarding) need = p.WB + 1; // read in ID (cycle EX − 1) no earlier than WB
      else if (s.use === "ex") need = ready + 1;
      else if (s.use === "mem") need = ready; // MEM = EX + 1 ≥ ready + 1
      else need = resolve === "id" ? ready + 2 : ready + 1; // branch compares in ID or EX
      deps.push({ s, p, need });
      if (need > EX) { EX = need; binding = { s, p }; }
    }
    const row = { i, ins, IF, ID, EX, MEM: EX + 1, WB: EX + 2, stalls: EX - ID - 1, fetchWait: ID - IF - 1, control };
    if (row.stalls > 0) {
      const p = binding.p;
      const loadUse = forwarding && p.ins.kind === "load";
      hazards.push({ type: loadUse ? "load-use" : "data", at: i, from: p.i, reg: binding.s.r, cycles: row.stalls,
        text: `I${i + 1} needs ${binding.s.r} from I${p.i + 1} (${p.ins.op})${loadUse ? ": a loaded value exists only after MEM" : forwarding ? (ins.kind === "branch" && resolve === "id" ? ": the branch compares in ID, before the result can be forwarded" : "") : ": without forwarding it must wait for WB"}. ${row.stalls} stall${row.stalls === 1 ? "" : "s"}.` });
    }
    if (control) hazards.push({ type: "control", at: i, from: control.from, cycles: control.lost, text: `I${control.from + 1} is a branch resolved in ${RESOLVE[resolve]}${branch === "pnt" ? " and is taken, so the wrongly fetched instructions are flushed" : ", so fetch waits"}: ${control.lost} cycle${control.lost === 1 ? "" : "s"} lost.` });
    // Where each operand comes from.
    for (const { s, p } of deps) {
      const use = s.use === "ex" ? row.EX : s.use === "mem" ? row.MEM : resolve === "id" ? row.EX - 1 : row.EX;
      const readCycle = row.EX - 1;
      if (!forwarding || readCycle >= p.WB) continue; // from the register file
      const at = use - p.EX; // 1: producer in MEM (EX/MEM latch), 2: in WB (MEM/WB latch)
      const latch = at <= 1 ? "EX/MEM" : "MEM/WB";
      forwards.push({ cycle: use, from: p.i, to: i, reg: s.r, latch, into: s.use === "mem" ? "MEM" : s.use === "branch" && resolve === "id" ? "ID" : "EX" });
    }
    rows.push(row);
    prev = row;
  });
  const total = rows.length ? rows[rows.length - 1].WB : 0;
  const n = program.length;
  const ideal = n + STAGES.length - 1;
  const stallCycles = total - ideal;
  return {
    rows, hazards, forwards, total, ideal, stallCycles, n,
    cpi: total / n, steadyCpi: 1 + stallCycles / n,
    opts: { forwarding, resolve, branch },
  };
}

// Stage of instruction row at cycle c: { stage, stall } or null.
export function cell(row, c) {
  if (c < row.IF || c > row.WB) return null;
  if (c < row.ID) return { stage: "IF", stall: c > row.IF };
  if (c < row.EX) return { stage: "ID", stall: c > row.ID };
  return { stage: STAGES[c - row.EX + 2], stall: false };
}

// One step per clock cycle, with what each stage holds and why.
export function cycles(res) {
  const steps = [];
  const lastEX = res.rows.length ? res.rows[res.rows.length - 1].EX : 0;
  let bubbles = 0;
  for (let c = 1; c <= res.total; c++) {
    const occ = Object.fromEntries(STAGES.map((s) => [s, null]));
    const stalled = [];
    for (const row of res.rows) {
      const x = cell(row, c);
      if (!x) continue;
      occ[x.stage] = `I${row.i + 1}`;
      if (x.stall) stalled.push({ row, stage: x.stage });
    }
    const notes = [], line = new Set([1]);
    const fw = res.forwards.filter((f) => f.cycle === c);
    for (const f of fw) { notes.push(`${f.reg} is forwarded from the ${f.latch} latch (I${f.from + 1}) into I${f.to + 1}'s ${f.into}.`); line.add(4); }
    for (const s of stalled.filter((x) => x.stage === "ID")) {
      const hz = res.hazards.find((hh) => hh.at === s.row.i && hh.type !== "control");
      notes.push(`Stall: ${hz ? hz.text.replace(/\. \d+ stalls?\.$/, "") : `I${s.row.i + 1} waits in ID`}. A bubble goes into EX.`);
      line.add(5); line.add(6);
    }
    for (const row of res.rows) {
      if (row.control && c === row.IF) { notes.push(`I${row.i + 1} is fetched only now: ${row.control.lost} cycle${row.control.lost === 1 ? "" : "s"} were lost to the branch I${row.control.from + 1}.`); line.add(7); line.add(8); }
    }
    for (const row of res.rows) {
      if (row.ins.kind === "branch") {
        const at = row.EX + { id: -1, ex: 0, mem: 1 }[res.opts.resolve];
        if (at === c) notes.push(`I${row.i + 1} (${row.ins.op}) resolves in ${RESOLVE[res.opts.resolve]}: ${row.ins.taken ? "taken" : "not taken"}.`);
      }
    }
    if (occ.WB) { line.add(2); const r = res.rows[Number(occ.WB.slice(1)) - 1]; if (r.ins.dest) notes.push(`I${r.i + 1} writes ${r.ins.dest} back.`); }
    if (occ.MEM) line.add(3);
    if (occ.EX && !stalled.some((x) => x.stage === "ID")) line.add(4);
    if (occ.ID && !stalled.length) line.add(5);
    if (occ.IF) line.add(7);
    const done = res.rows.filter((r) => r.WB <= c).length;
    if (c >= 3 && c <= lastEX && !occ.EX) bubbles++;
    if (!notes.length) notes.push(occ.IF && !occ.ID && c === 1 ? "I1 is fetched. The pipeline starts to fill." : `No hazards this cycle: every stage moves its instruction along.`);
    if (c === res.total) notes.push(`All ${res.n} instructions are done after ${res.total} cycles (${res.ideal} ideal + ${res.stallCycles} lost to hazards).`);
    steps.push({
      cycle: c, occ, line: [...line].sort((a, b) => a - b), note: notes.join(" "),
      vars: { cycle: c, IF: occ.IF ?? "empty", ID: occ.ID ?? "empty", EX: occ.EX ?? "bubble", MEM: occ.MEM ?? "empty", WB: occ.WB ?? "empty", finished: done, bubbles },
    });
  }
  return steps;
}

// Clock period and speedup with non-uniform stage delays and latch overhead.
export function timing(delays, latch, n, cyclesTotal = n + delays.length - 1) {
  if (!delays.length || delays.some((d) => !(d > 0))) throw new Error("Every stage delay must be more than 0.");
  if (!(latch >= 0)) throw new Error("Latch delay must be 0 or more.");
  const clock = Math.max(...delays) + latch;
  const single = delays.reduce((a, b) => a + b, 0);
  const pipelined = cyclesTotal * clock, unpipelined = n * single;
  const r = (x) => Math.round(x * 1e6) / 1e6;
  return { clock, single, pipelined, unpipelined, speedup: r(unpipelined / pipelined), limit: r(single / clock), throughput: r(n / pipelined), cycles: cyclesTotal, n };
}

export function randomProgram(r = Math.random, n = 4 + Math.floor(r() * 3)) {
  const R = () => `R${1 + Math.floor(r() * 6)}`;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = r();
    const recent = out.length ? out[out.length - 1].match(/R\d+/)[0] : R();
    const src = () => (r() < 0.6 ? recent : R());
    if (x < 0.3) out.push(`LW ${R()}, ${4 * Math.floor(r() * 4)}(${src()})`);
    else if (x < 0.4 && i > 0) out.push(`SW ${src()}, ${4 * Math.floor(r() * 4)}(R7)`);
    else out.push(`${["ADD", "SUB", "AND", "OR"][Math.floor(r() * 4)]} ${R()}, ${src()}, ${src()}`);
  }
  return out;
}

export const EXAMPLES = {
  loaduse: { name: "Load-use hazard (Hennessy & Patterson)", program: ["LW R1, 0(R2)", "SUB R4, R1, R5", "AND R6, R1, R7", "OR R8, R1, R9"] },
  chain: { name: "Dependent ALU chain", program: ["SUB R2, R1, R3", "AND R12, R2, R5", "OR R13, R6, R2", "ADD R14, R2, R2", "SW R15, 100(R2)"] },
  branch: { name: "A branch in the middle", program: ["ADD R1, R2, R3", "BEQ R1, R4, L1 taken", "SUB R5, R6, R7", "OR R8, R5, R9"] },
  copy: { name: "Load then store (memory copy)", program: ["LW R1, 0(R2)", "SW R1, 0(R3)", "LW R4, 4(R2)", "SW R4, 4(R3)"] },
};

// Shareable URL state.
export const DEFAULT = { program: EXAMPLES.loaduse.program, opts: { forwarding: true, resolve: "ex", branch: "stall" }, delays: [200, 100, 200, 200, 100], latch: 0 };
export function toParams({ program, opts, delays, latch }) {
  return { p: program.join(";"), fw: opts.forwarding ? 1 : 0, br: opts.resolve, bp: opts.branch, d: delays.join(","), l: latch };
}
export function fromParams(q) {
  const D = DEFAULT;
  const d = (q.get("d") ?? "").split(",").map(Number);
  const l = q.get("l");
  return {
    program: q.get("p") ? q.get("p").split(";").map((s) => s.trim()).filter(Boolean) : [...D.program],
    opts: { forwarding: q.get("fw") !== "0", resolve: RESOLVE[q.get("br")] ? q.get("br") : D.opts.resolve, branch: BRANCH[q.get("bp")] ? q.get("bp") : D.opts.branch },
    delays: d.length === 5 && d.every((x) => x > 0) ? d : [...D.delays],
    latch: l != null && l !== "" && Number(l) >= 0 ? Number(l) : D.latch,
  };
}
