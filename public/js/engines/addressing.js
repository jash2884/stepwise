// Addressing modes on a small machine: one accumulator (AC), a register R
// named in the instruction, an index register XR and a base register BR. A
// two-word instruction "LOAD AC, mode, A" sits at address PC, so after it is
// fetched PC points at the next instruction (PC + 2). The default example is
// Mano's (Computer System Architecture, Fig. 8-7).
//
// Also: instruction format design (opcode, register and address bits) and
// expanding opcodes (how many instructions of each kind fit).

export const MODES = {
  immediate: { name: "Immediate", ea: "none: the operand is A itself", code: "AC ← A  // the operand is in the instruction" },
  direct: { name: "Direct", ea: "EA = A", code: "EA ← A" },
  indirect: { name: "Indirect", ea: "EA = M[A]", code: "EA ← M[A]  // one extra memory read for the address" },
  register: { name: "Register", ea: "none: the operand is in R", code: "AC ← R  // no memory access at all" },
  regindirect: { name: "Register indirect", ea: "EA = R", code: "EA ← R" },
  autoinc: { name: "Autoincrement", ea: "EA = R, then R ← R + d", code: "EA ← R; R ← R + d  // after the access" },
  autodec: { name: "Autodecrement", ea: "R ← R − d, then EA = R", code: "R ← R − d; EA ← R  // before the access" },
  indexed: { name: "Indexed", ea: "EA = A + XR", code: "EA ← A + XR" },
  base: { name: "Base register", ea: "EA = BR + A", code: "EA ← BR + A  // A is a displacement" },
  relative: { name: "PC-relative", ea: "EA = PC + A", code: "EA ← PC + A  // PC already points at the next instruction" },
};

export const MANO = { pc: 200, words: 2, A: 500, R: 400, X: 100, B: 300, d: 1, mem: { 399: 450, 400: 700, 500: 800, 600: 900, 702: 325, 800: 300 } };

export function parseMemory(text) {
  const mem = {};
  for (const tok of String(text).split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(-?\d+)[:=](-?\d+)$/.exec(tok);
    if (!m) throw new Error(`Write memory as address:value pairs, like 500:800 ("${tok}" isn't one).`);
    mem[Number(m[1])] = Number(m[2]);
  }
  if (Object.keys(mem).length > 24) throw new Error("Use at most 24 memory words.");
  return mem;
}
export const memoryText = (mem) => Object.entries(mem).sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a}:${v}`).join(" ");

const read = (mem, a) => mem[a] ?? 0;

export function codeFor(mode) {
  const M = MODES[mode];
  const lines = ["IR ← M[PC..]; PC ← PC + w  // fetch the instruction", "decode the mode field"];
  if (mode === "immediate" || mode === "register") lines.push(M.code);
  else lines.push(M.code, "AC ← M[EA]  // fetch the operand");
  return lines;
}

// Run one LOAD AC in the given mode; every step is a stage of the instruction.
export function run(mode, stIn = MANO) {
  const M = MODES[mode];
  if (!M) throw new Error(`Unknown mode ${mode}`);
  const st = { ...MANO, ...stIn, mem: { ...(stIn.mem ?? MANO.mem) } };
  for (const k of ["pc", "words", "A", "R", "X", "B", "d"]) if (!Number.isInteger(st[k])) throw new Error(`${k} must be a whole number.`);
  if (st.words < 1 || st.words > 4) throw new Error("An instruction is 1 to 4 words long.");
  const nextPC = st.pc + st.words;
  let R = st.R, ea = null, operand, memRefs = 0, lit = [];
  const steps = [];
  const vars = () => ({ PC: pc, R, XR: st.X, BR: st.B, ...(ea != null ? { EA: ea } : {}), ...(operand != null ? { AC: operand } : {}) });
  let pc = st.pc;
  steps.push({ line: [1], lit: [], reads: Array.from({ length: st.words }, (_, i) => st.pc + i), note: `Fetch: the ${st.words}-word instruction at ${st.pc}${st.words > 1 ? ` to ${st.pc + st.words - 1}` : ""} goes into IR, and PC moves on to ${nextPC}.`, vars: (pc = nextPC, vars()) });
  steps.push({ line: [2], lit: [], note: `Decode: the mode field says ${M.name.toLowerCase()} addressing, address field A = ${st.A}.`, vars: vars() });
  switch (mode) {
    case "immediate":
      operand = st.A;
      steps.push({ line: [3], lit: [], note: `Immediate: the operand is the address field itself, so AC = ${operand}. No memory read for the operand.`, vars: vars() });
      break;
    case "register":
      operand = R;
      steps.push({ line: [3], lit: ["R"], note: `Register mode: the operand is in R, so AC = R = ${operand}. No memory read for the operand.`, vars: vars() });
      break;
    default: {
      let why;
      if (mode === "direct") { ea = st.A; why = `Direct: EA = A = ${ea}.`; }
      else if (mode === "indirect") { ea = read(st.mem, st.A); memRefs++; why = `Indirect: A = ${st.A} holds the address. EA = M[${st.A}] = ${ea}. That costs one memory read.`; }
      else if (mode === "regindirect") { ea = R; why = `Register indirect: R holds the address. EA = R = ${ea}.`; lit = ["R"]; }
      else if (mode === "autoinc") { ea = R; R = R + st.d; why = `Autoincrement: EA = R = ${ea}, then R steps on to ${R} so the next access gets the next word.`; lit = ["R"]; }
      else if (mode === "autodec") { R = R - st.d; ea = R; why = `Autodecrement: R first steps back to ${R}, then EA = R = ${ea}.`; lit = ["R"]; }
      else if (mode === "indexed") { ea = st.A + st.X; why = `Indexed: EA = A + XR = ${st.A} + ${st.X} = ${ea}.`; lit = ["XR"]; }
      else if (mode === "base") { ea = st.B + st.A; why = `Base register: EA = BR + A = ${st.B} + ${st.A} = ${ea}.`; lit = ["BR"]; }
      else if (mode === "relative") { ea = nextPC + st.A; why = `PC-relative: PC is already ${nextPC} (the next instruction), so EA = PC + A = ${nextPC} + ${st.A} = ${ea}.`; lit = ["PC"]; }
      steps.push({ line: [3], lit, reads: mode === "indirect" ? [st.A] : [], note: why, vars: vars() });
      operand = read(st.mem, ea);
      memRefs++;
      steps.push({ line: [4], lit: [], reads: [ea], ea, note: `Fetch the operand: AC = M[${ea}] = ${operand}${st.mem[ea] == null ? " (that word wasn't set, so it reads 0)" : ""}.`, vars: vars() });
    }
  }
  const last = steps[steps.length - 1];
  last.final = true;
  last.note += ` In all, ${memRefs} memory read${memRefs === 1 ? "" : "s"} after the fetch.`;
  return { mode, ea, operand, memRefs, R, nextPC, steps, state: st };
}

export const runAll = (st) => Object.keys(MODES).map((m) => ({ mode: m, ...run(m, st) }));

// Instruction format: opcode bits, register fields, and what is left.
export function format({ L, opcodes, registers, regFields = 0, memWords = 0 }) {
  if (!Number.isInteger(L) || L < 4 || L > 128) throw new Error("Instruction length must be 4 to 128 bits.");
  if (!(opcodes >= 1) || !(registers >= 0)) throw new Error("Give the number of instructions and registers.");
  const ceilLog = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
  const opBits = ceilLog(opcodes), regBits = registers ? ceilLog(registers) : 0;
  const used = opBits + regFields * regBits;
  const rest = L - used;
  const addrBits = memWords ? ceilLog(memWords) : null;
  const steps = [
    `${opcodes} different instructions need ⌈log₂ ${opcodes}⌉ = ${opBits} opcode bits.`,
    regFields ? `${registers} registers need ⌈log₂ ${registers}⌉ = ${regBits} bits each; ${regFields} register field${regFields === 1 ? "" : "s"} take ${regFields * regBits} bits.` : "No register fields.",
    rest >= 0 ? `That leaves ${L} − ${used} = ${rest} bits for the address or immediate field.` : `That needs ${used} bits, more than the ${L} available.`,
  ];
  if (addrBits != null) steps.push(`A memory of ${memWords} words needs ${addrBits}-bit addresses, which ${rest >= addrBits ? "fits" : "does not fit"} in ${Math.max(rest, 0)} bits.`);
  return { opBits, regBits, regFields, rest, fits: rest >= 0, addrBits, maxImmediate: rest > 0 ? 2 ** rest - 1 : 0, steps };
}

// Expanding opcodes by counting bit patterns. types: [{ count, bits }] where
// bits is the operand bits of that kind; the one with count null is asked for.
export function expanding(L, types) {
  if (!Number.isInteger(L) || L < 2 || L > 64) throw new Error("Instruction length must be 2 to 64 bits.");
  const unknown = types.filter((t) => t.count == null);
  if (unknown.length > 1) throw new Error("Leave at most one count blank (the one to work out).");
  for (const t of types) {
    if (!Number.isInteger(t.bits) || t.bits < 0 || t.bits >= L) throw new Error(`Operand bits must be 0 to ${L - 1}.`);
    if (t.count != null && (!Number.isInteger(t.count) || t.count < 0)) throw new Error("Counts must be whole numbers.");
  }
  // Most operand bits first: those use the most patterns per instruction.
  const order = types.map((t, i) => ({ ...t, i })).sort((a, b) => b.bits - a.bits || (a.count == null) - (b.count == null));
  let left = 2n ** BigInt(L);
  const steps = [`A ${L}-bit instruction has 2^${L} = ${left} bit patterns in all.`];
  let answer = null;
  for (const t of order) {
    const per = 2n ** BigInt(t.bits);
    const freeOps = left / per;
    if (t.count == null) {
      answer = Number(freeOps);
      steps.push(`Kind ${t.i + 1} (${t.bits} operand bits): ${left} patterns left ÷ 2^${t.bits} = ${answer} instructions at most.`);
      left -= freeOps * per;
      continue;
    }
    const used = BigInt(t.count) * per;
    if (used > left) throw new Error(`Kind ${t.i + 1} needs ${used} patterns but only ${left} are left.`);
    left -= used;
    steps.push(`Kind ${t.i + 1}: ${t.count} instruction${t.count === 1 ? "" : "s"} × 2^${t.bits} operand patterns = ${used}, leaving ${left}.`);
  }
  if (answer == null) steps.push(`${left} pattern${left === 1n ? "" : "s"} ${left === 1n ? "is" : "are"} left over for more instructions.`);
  return { answer, left: Number(left), steps, order: order.map((t) => t.i) };
}

export const parseTypes = (text) => String(text).split(/[\s,;]+/).filter(Boolean).map((tok) => {
  const m = /^(\?|\d+):(\d+)$/.exec(tok);
  if (!m) throw new Error(`Write each kind as count:operandBits, like 4:12, with ? for the unknown count ("${tok}").`);
  return { count: m[1] === "?" ? null : Number(m[1]), bits: Number(m[2]) };
});
export const typesText = (types) => types.map((t) => `${t.count ?? "?"}:${t.bits}`).join(" ");

export function randomState(r = Math.random) {
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pc = int(10, 40) * 10, A = int(20, 60) * 10, R = int(20, 60) * 10, X = int(1, 20) * 5, B = int(10, 40) * 10;
  const st = { pc, words: 2, A, R, X, B, d: 1 };
  const addrs = new Set([A, R, R - 1, A + X, B + A, pc + 2 + A]);
  const mem = {};
  for (const a of addrs) mem[a] = int(10, 99) * 10;
  // Make indirect point somewhere that holds a value too.
  mem[mem[A]] = mem[mem[A]] ?? int(10, 99) * 10;
  return { ...st, mem };
}

// Shareable URL state.
export const DEFAULT = { mode: "indirect", st: MANO, format: { L: 32, opcodes: 40, registers: 24, regFields: 2, memWords: 0 }, exp: { L: 16, types: [{ count: 4, bits: 12 }, { count: 8, bits: 12 }, { count: 14, bits: 10 }, { count: null, bits: 6 }] } };
export function toParams({ mode, st, format: f, exp }) {
  const out = { m: mode, pc: st.pc, w: st.words, a: st.A, r: st.R, x: st.X, b: st.B, d: st.d, mem: memoryText(st.mem) };
  if (f) Object.assign(out, { fL: f.L, fo: f.opcodes, fr: f.registers, fn: f.regFields, fm: f.memWords });
  if (exp) Object.assign(out, { eL: exp.L, ty: typesText(exp.types) });
  return out;
}
export function fromParams(q) {
  const D = DEFAULT;
  const int = (k, d) => (q.get(k) != null && /^-?\d+$/.test(q.get(k)) ? Number(q.get(k)) : d);
  let mem = D.st.mem, types = D.exp.types;
  try { if (q.get("mem") != null) mem = parseMemory(q.get("mem")); } catch { /* keep the default */ }
  try { if (q.get("ty")) types = parseTypes(q.get("ty")); } catch { /* keep the default */ }
  return {
    mode: MODES[q.get("m")] ? q.get("m") : D.mode,
    st: { pc: int("pc", D.st.pc), words: int("w", D.st.words), A: int("a", D.st.A), R: int("r", D.st.R), X: int("x", D.st.X), B: int("b", D.st.B), d: int("d", D.st.d), mem },
    format: { L: int("fL", D.format.L), opcodes: int("fo", D.format.opcodes), registers: int("fr", D.format.registers), regFields: int("fn", D.format.regFields), memWords: int("fm", D.format.memWords) },
    exp: { L: int("eL", D.exp.L), types },
  };
}
