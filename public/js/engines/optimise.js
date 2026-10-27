// Three-address code with labels and jumps: basic blocks (leaders), the flow
// graph, global liveness, and local optimisations applied one rewrite at a
// time (constant propagation, copy propagation, common subexpressions,
// constant folding, algebraic identities / strength reduction, dead code).
//
// Programs are written one instruction per line, optionally numbered as in the
// Dragon Book, with labels written "L1:":
//   (1) i = m - 1
//   (5) i = i + 1
//   (8) if t3 < v goto (5)
//   L2: a[t7] = t9
//   goto L2
// "live: x y" names the variables live when the program ends; by default every
// variable except the temporaries t1, t2, … is live at the end.

export const TEMP = /^t\d+$/;
const NUM = /^-?\d+(\.\d+)?$/;
export const isNum = (x) => x != null && NUM.test(String(x));
export const isVar = (x) => x != null && /^[A-Za-z_]\w*$/.test(String(x));
const ARITH = ["+", "-", "*", "/", "%", "^", "<<"];
const REL = ["<", "<=", ">", ">=", "==", "!="];
const BIN = new Set([...ARITH, ...REL]);
const COMMUTES = new Set(["+", "*", "==", "!="]);
const KEYWORDS = new Set(["if", "iffalse", "goto", "return", "minus"]);

function lex(s) {
  const out = [], re = /\s*(<<|<=|>=|==|!=|[A-Za-z_]\w*|\d+(?:\.\d+)?|\S)/gy;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) if (m[1]) out.push(m[1]);
  return out;
}

// --- Parsing -------------------------------------------------------------------------
export function parseTac(text) {
  const prog = [], labels = new Map(), numbers = new Map();
  let pending = [], numbered = false, liveExit = null;
  for (const raw of String(text).split("\n")) {
    let line = raw.replace(/(\/\/|#).*$/, "").trim();
    if (!line) continue;
    const lm = /^live\s*:\s*(.*)$/i.exec(line);
    if (lm) { liveExit = lm[1].split(/[\s,]+/).filter(Boolean); continue; }
    let num = null;
    const nm = /^\(?(\d+)[).:]\s*/.exec(line);
    if (nm) { num = Number(nm[1]); numbered = true; line = line.slice(nm[0].length); }
    for (let m; (m = /^([A-Za-z_]\w*)\s*:\s*/.exec(line)) && !/^\s*=/.test(line.slice(m[0].length));) {
      pending.push(m[1]); line = line.slice(m[0].length);
    }
    if (!line) continue;
    const ins = parseInstr(line, raw.trim());
    ins.num = num ?? null;
    ins.labels = pending; pending = [];
    for (const l of ins.labels) { if (labels.has(l)) throw new Error(`The label ${l} is defined twice.`); labels.set(l, prog.length); }
    if (num != null) numbers.set(num, prog.length);
    prog.push(ins);
    if (prog.length > 40) throw new Error("Use at most 40 instructions.");
  }
  if (!prog.length) throw new Error("Enter some three-address code, one instruction per line, e.g. x = a + b.");
  if (pending.length) throw new Error(`The label ${pending[0]} isn't followed by an instruction.`);
  for (const ins of prog) {
    if (ins.target == null) continue;
    const t = ins.target;
    let at;
    if (labels.has(t)) at = labels.get(t);
    else if (/^\d+$/.test(t)) at = numbered ? numbers.get(Number(t)) : Number(t) - 1;
    if (at == null || at < 0 || at >= prog.length) throw new Error(`"${ins.src}": there's no instruction ${/^\d+$/.test(t) ? `(${t})` : `labelled ${t}`} to jump to.`);
    ins.to = at;
  }
  prog.forEach((ins, i) => { ins.num ??= i + 1; });
  return { prog, liveExit, numbered };
}

function operand(tok, src) {
  if (tok == null) throw new Error(`"${src}" ends too early.`);
  if (isNum(tok) || isVar(tok) && !KEYWORDS.has(tok.toLowerCase())) return tok;
  throw new Error(`"${src}": "${tok}" isn't a variable or a number.`);
}

function parseInstr(line, src) {
  const t = lex(line);
  const bad = () => new Error(`Can't read "${src}". Try x = a + b, x = a[i], a[i] = x, if a < b goto L1 or goto L1.`);
  const target = (rest) => {
    const s = rest.join("").replace(/^\((\d+)\)$/, "$1");
    if (!/^(\d+|[A-Za-z_]\w*)$/.test(s)) throw bad();
    return s;
  };
  // A negative literal is lexed as "-" then a number.
  const ops = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "-" && isNum(t[i + 1]) && (i === 0 || t[i - 1] === "=" || BIN.has(t[i - 1]) || t[i - 1] === "if" || t[i - 1] === "iffalse" || t[i - 1] === "[" || t[i - 1] === "return")) { ops.push(`-${t[i + 1]}`); i++; } else ops.push(t[i]);
  }
  const w = ops.map((x) => x.toLowerCase());
  if (w[0] === "goto") return { kind: "goto", target: target(ops.slice(1)), src };
  if (w[0] === "if" || w[0] === "iffalse") {
    const g = w.indexOf("goto");
    if (g < 2) throw bad();
    const c = ops.slice(1, g);
    const ins = { kind: "if", neg: w[0] === "iffalse", target: target(ops.slice(g + 1)), src };
    if (c.length === 1) return { ...ins, a: operand(c[0], src), rel: null, b: null };
    if (c.length === 3 && REL.includes(c[1])) return { ...ins, a: operand(c[0], src), rel: c[1], b: operand(c[2], src) };
    throw bad();
  }
  if (w[0] === "return") return { kind: "return", a: ops[1] != null ? operand(ops[1], src) : null, src };
  const eq = ops.indexOf("=");
  if (eq < 1) throw bad();
  const lhs = ops.slice(0, eq), rhs = ops.slice(eq + 1);
  if (lhs.length === 4 && lhs[1] === "[" && lhs[3] === "]") {
    if (rhs.length !== 1) throw new Error(`"${src}": an array store takes one value, e.g. a[i] = x.`);
    return { kind: "store", arr: operand(lhs[0], src), a: operand(lhs[2], src), b: operand(rhs[0], src), src };
  }
  if (lhs.length !== 1 || !isVar(lhs[0]) || KEYWORDS.has(w[0])) throw bad();
  const res = lhs[0];
  if (rhs.length === 1) return { kind: "assign", res, op: "=", a: operand(rhs[0], src), b: null, src };
  if (rhs.length === 2 && (rhs[0] === "-" || rhs[0].toLowerCase() === "minus")) return { kind: "assign", res, op: "minus", a: operand(rhs[1], src), b: null, src };
  if (rhs.length === 3 && BIN.has(rhs[1])) return { kind: "assign", res, op: rhs[1], a: operand(rhs[0], src), b: operand(rhs[2], src), src };
  if (rhs.length === 4 && rhs[1] === "[" && rhs[3] === "]") return { kind: "load", res, arr: operand(rhs[0], src), a: operand(rhs[2], src), src };
  throw bad();
}

// --- Printing, uses and definitions ---------------------------------------------------------
export function show(ins, targetName = (i) => (/^\d+$/.test(i.target) ? `(${i.target})` : i.target)) {
  switch (ins.kind) {
    case "assign": return ins.op === "=" ? `${ins.res} = ${ins.a}` : ins.op === "minus" ? `${ins.res} = minus ${ins.a}` : `${ins.res} = ${ins.a} ${ins.op} ${ins.b}`;
    case "load": return `${ins.res} = ${ins.arr}[${ins.a}]`;
    case "store": return `${ins.arr}[${ins.a}] = ${ins.b}`;
    case "if": return `${ins.neg ? "ifFalse" : "if"} ${ins.a}${ins.rel ? ` ${ins.rel} ${ins.b}` : ""} goto ${targetName(ins)}`;
    case "goto": return `goto ${targetName(ins)}`;
    default: return `return${ins.a != null ? ` ${ins.a}` : ""}`;
  }
}
// The fields an instruction reads.
const useFields = (ins) => (ins.kind === "goto" ? [] : ins.kind === "return" ? ["a"] : ins.kind === "load" ? ["a"] : ["a", "b"]);
export const uses = (ins) => [...new Set(useFields(ins).map((f) => ins[f]).filter(isVar))];
export const def = (ins) => (ins.kind === "assign" || ins.kind === "load" ? ins.res : null);
export const isJump = (ins) => ins.kind === "goto" || ins.kind === "if" || ins.kind === "return";
export const varsOf = (prog) => {
  const out = [];
  for (const ins of prog) for (const v of [def(ins), ...uses(ins)]) if (v && !out.includes(v)) out.push(v);
  return out;
};

// --- Leaders, basic blocks and the flow graph --------------------------------------------------
export const LEADER_CODE = [
  "leaders ← { first instruction }  // rule 1",
  "for each instruction i",
  "  if i is a jump (goto, if … goto, return)",
  "    mark the target of i as a leader  // rule 2",
  "    mark the instruction after i as a leader  // rule 3",
  "for each leader ℓ, in order",
  "  block ← ℓ up to the next leader (or the end)",
  "for each block B",
  "  if B ends in goto L: edge B → block(L)",
  "  if B ends in if … goto L: edges to block(L) and the next block",
  "  otherwise: edge B → next block  // fall through",
];

export function basicBlocks(parsed) {
  const { prog } = parsed;
  const n = (i) => prog[i].num;
  const leaders = new Map([[0, "rule 1: the first instruction"]]);
  const steps = [];
  const snap = (extra) => ({ leaders: [...leaders.keys()].sort((a, b) => a - b), reasons: Object.fromEntries(leaders), blocks: [], edges: [], ...extra });
  steps.push(snap({ line: 1, at: 0, note: `The first instruction, (${n(0)}), is always a leader (rule 1): execution enters there.`, vars: { i: n(0), leaders: `{${n(0)}}` } }));
  prog.forEach((ins, i) => {
    const added = [];
    if (ins.kind === "goto" || ins.kind === "if") if (!leaders.has(ins.to)) { leaders.set(ins.to, `rule 2: target of the jump in (${n(i)})`); added.push(`(${n(ins.to)}) is the target of the jump, so it is a leader (rule 2)`); }
    if (isJump(ins) && i + 1 < prog.length && !leaders.has(i + 1)) { leaders.set(i + 1, `rule 3: follows the jump in (${n(i)})`); added.push(`(${n(i + 1)}) comes straight after a jump, so it is a leader (rule 3)`); }
    const set = `{${[...leaders.keys()].sort((a, b) => a - b).map(n).join(", ")}}`;
    const note = !isJump(ins) ? `(${n(i)}) ${show(ins)} isn't a jump: nothing new.`
      : added.length ? `(${n(i)}) ${show(ins)} is a jump: ${added.join("; ")}.`
      : `(${n(i)}) ${show(ins)} is a jump, but its target${ins.kind === "return" ? "" : " and the next instruction"} are already leaders (or there is no next instruction).`;
    steps.push(snap({ line: isJump(ins) ? (added.length ? [3, ...(ins.kind !== "return" && added.some((a) => a.includes("rule 2")) ? [4] : []), ...(added.some((a) => a.includes("rule 3")) ? [5] : [])] : 3) : 2, at: i, note, vars: { i: n(i), instr: show(ins), jump: isJump(ins), leaders: set } }));
  });
  const starts = [...leaders.keys()].sort((a, b) => a - b);
  const blocks = starts.map((s, k) => ({ id: `B${k + 1}`, start: s, end: (starts[k + 1] ?? prog.length) - 1 }));
  const blockOf = (i) => blocks.find((b) => b.start <= i && i <= b.end).id;
  blocks.forEach((b, k) => steps.push(snap({ line: [6, 7], at: b.start, blocks: blocks.slice(0, k + 1), note: `Leader (${n(b.start)}) starts ${b.id}, which runs up to (${n(b.end)}), just before ${k + 1 < blocks.length ? `the next leader (${n(blocks[k + 1].start)})` : "the end"}.`, vars: { "ℓ": n(b.start), B: b.id, instrs: `(${n(b.start)})–(${n(b.end)})` } })));
  const edges = [{ from: "ENTRY", to: blocks[0].id, label: "" }];
  blocks.forEach((b, k) => {
    const last = prog[b.end], next = blocks[k + 1]?.id ?? "EXIT";
    const add = [];
    let line, note;
    if (last.kind === "goto") { add.push({ from: b.id, to: blockOf(last.to), label: "" }); line = 9; note = `${b.id} ends in ${show(last)}: one edge to ${blockOf(last.to)}.`; }
    else if (last.kind === "if") { add.push({ from: b.id, to: blockOf(last.to), label: "true" }, { from: b.id, to: next, label: "false" }); line = 10; note = `${b.id} ends in a conditional jump: an edge to ${blockOf(last.to)} when the test passes, and to ${next} when it fails.`; }
    else if (last.kind === "return") { add.push({ from: b.id, to: "EXIT", label: "" }); line = 11; note = `${b.id} ends in return: its only successor is EXIT.`; }
    else { add.push({ from: b.id, to: next, label: "" }); line = 11; note = `${b.id} doesn't end in a jump, so control falls through to ${next}.`; }
    for (const e of add) if (!edges.some((x) => x.from === e.from && x.to === e.to)) edges.push(e);
    steps.push(snap({ line: [8, line], at: b.end, blocks, edges: [...edges], note, vars: { B: b.id, last: show(last), successors: add.map((e) => e.to) } }));
  });
  const cfg = makeCfg(prog, blocks, edges, parsed.liveExit);
  return { leaders: starts, reasons: Object.fromEntries(leaders), blocks: cfg.blocks, edges, steps, cfg };
}

// Blocks hold their own instruction copies; jumps name the target block.
function makeCfg(prog, blocks, edges, liveExit) {
  const blockOf = (i) => blocks.find((b) => b.start <= i && i <= b.end).id;
  const bs = blocks.map((b) => ({ id: b.id, start: b.start, code: prog.slice(b.start, b.end + 1).map((ins) => ({ ...ins, ...(ins.to != null ? { block: blockOf(ins.to) } : {}) })) }));
  const succ = Object.fromEntries([...bs.map((b) => [b.id, []]), ["ENTRY", []], ["EXIT", []]]);
  for (const e of edges) succ[e.from].push(e.to);
  const all = varsOf(prog);
  return { blocks: bs, edges, succ, liveExit: liveExit ?? (prog.some((x) => x.kind === "return") ? [] : all.filter((v) => !TEMP.test(v))) };
}

export const cfgOf = (text) => basicBlocks(parseTac(text)).cfg;
export const blockLine = (ins) => show(ins, (x) => x.block);

// --- Liveness (backward data flow over the flow graph) --------------------------------------------
export function useDef(code) {
  const use = [], defs = [];
  for (const ins of code) {
    for (const v of uses(ins)) if (!defs.includes(v) && !use.includes(v)) use.push(v);
    const d = def(ins);
    if (d && !defs.includes(d)) defs.push(d);
  }
  return { use, def: defs };
}

export function liveness(cfg) {
  const ids = cfg.blocks.map((b) => b.id);
  const ud = Object.fromEntries(cfg.blocks.map((b) => [b.id, useDef(b.code)]));
  const IN = Object.fromEntries(ids.map((id) => [id, new Set()])), OUT = Object.fromEntries(ids.map((id) => [id, new Set()]));
  IN.EXIT = new Set(cfg.liveExit);
  const rounds = [];
  for (let it = 1; it <= 50; it++) {
    let changed = false;
    const visits = [];
    for (const id of [...ids].reverse()) {
      const out = new Set(cfg.succ[id].flatMap((s) => [...(IN[s] ?? [])]));
      const inn = new Set([...ud[id].use, ...[...out].filter((v) => !ud[id].def.includes(v))]);
      const ch = !same(inn, IN[id]) || !same(out, OUT[id]);
      if (!same(inn, IN[id])) changed = true;
      IN[id] = inn; OUT[id] = out;
      visits.push({ id, in: [...inn], out: [...out], changed: ch });
    }
    rounds.push({ it, visits, changed });
    if (!changed) break;
  }
  return { IN, OUT, ud, rounds };
}
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Live-after sets for each instruction of a block, scanning backwards from OUT.
export function liveAfter(code, out) {
  const live = new Set(out), after = [];
  for (let i = code.length - 1; i >= 0; i--) {
    after[i] = [...live];
    const d = def(code[i]);
    if (d) live.delete(d);
    for (const v of uses(code[i])) live.add(v);
  }
  return { after, before: [...live] };
}

// --- Local optimisation ----------------------------------------------------------------------------
export const PASSES = {
  constprop: { name: "Constant propagation", short: "const prop", lines: [3, 4] },
  copyprop: { name: "Copy propagation", short: "copy prop", lines: [5, 6] },
  cse: { name: "Common subexpressions", short: "CSE", lines: [7, 8] },
  fold: { name: "Constant folding", short: "folding", lines: [9, 10] },
  algebra: { name: "Algebraic identities & strength reduction", short: "algebra", lines: [11, 12] },
  dce: { name: "Dead-code elimination", short: "dead code", lines: [13, 14, 15] },
};
export const OPT_CODE = [
  "repeat",
  "  for each basic block B",
  "    for each use of x after x = c, in order  // constant propagation",
  "      replace x by the constant c",
  "    for each use of x after x = y  // copy propagation",
  "      replace x by y (until x or y changes)",
  "    for each x = y op z  // common subexpressions",
  "      if some v still holds y op z: x = v",
  "    for each x = c1 op c2  // constant folding",
  "      x = the value, worked out now",
  "    for each x = y op z  // algebra, strength reduction",
  "      x+0, x*1 → x;  x*2 → x+x;  x*2ᵏ → x<<k;  x^2 → x*x",
  "    live ← OUT[B]; scan B backwards  // dead code",
  "      if x = … and x ∉ live: delete it",
  "      else live ← (live − def) ∪ use",
  "until a whole round changes nothing",
];

const numStr = (v) => {
  if (!Number.isFinite(v)) return null;
  const s = String(Object.is(v, -0) ? 0 : v);
  return NUM.test(s) && s.length <= 12 ? s : null;
};
export function compute(op, x, y) {
  switch (op) {
    case "+": return x + y; case "-": return x - y; case "*": return x * y; case "/": return x / y; case "%": return x % y;
    case "^": return x ** y; case "<<": return x * 2 ** y;
    case "<": return +(x < y); case "<=": return +(x <= y); case ">": return +(x > y); case ">=": return +(x >= y); case "==": return +(x === y); case "!=": return +(x !== y);
    case "minus": return -x;
    default: throw new Error(`Unknown operator ${op}`);
  }
}
const exprKey = (ins) => {
  if (ins.kind === "load") return `[]|${ins.arr}|${ins.a}`;
  if (ins.kind !== "assign" || ins.op === "=") return null;
  if (ins.op === "minus") return `minus|${ins.a}`;
  const [x, y] = COMMUTES.has(ins.op) && String(ins.a) > String(ins.b) ? [ins.b, ins.a] : [ins.a, ins.b];
  return `${ins.op}|${x}|${y}`;
};
const exprText = (ins) => (ins.kind === "load" ? `${ins.arr}[${ins.a}]` : ins.op === "minus" ? `minus ${ins.a}` : `${ins.a} ${ins.op} ${ins.b}`);
const copyOf = (ins, a) => ({ ...ins, kind: "assign", op: "=", a, b: null, arr: undefined });

// Each pass walks one block's code and calls emit() after every rewrite.
const PASS_FNS = {
  constprop(code, emit) {
    const consts = new Map();
    for (let i = 0; i < code.length; i++) {
      const ins = code[i], hits = [];
      let next = ins;
      for (const f of useFields(ins)) if (isVar(ins[f]) && consts.has(ins[f])) { hits.push(`${ins[f]} = ${consts.get(ins[f])}`); next = { ...next, [f]: consts.get(ins[f]) }; }
      if (hits.length) { code[i] = next; emit(i, ins, next, `${[...new Set(hits)].join(" and ")} at this point, so use the constant${hits.length > 1 ? "s" : ""} directly.`, { x: hits.map((h) => h.split(" = ")[0]), c: hits.map((h) => h.split(" = ")[1]) }); }
      const d = def(code[i]);
      if (d) {
        consts.delete(d);
        if (code[i].kind === "assign" && code[i].op === "=" && isNum(code[i].a)) consts.set(d, code[i].a);
      }
    }
  },
  copyprop(code, emit) {
    const copies = new Map();
    for (let i = 0; i < code.length; i++) {
      const ins = code[i], hits = [];
      let next = ins;
      for (const f of useFields(ins)) if (isVar(ins[f]) && copies.has(ins[f])) { hits.push([ins[f], copies.get(ins[f])]); next = { ...next, [f]: copies.get(ins[f]) }; }
      if (hits.length) { code[i] = next; emit(i, ins, next, `${hits.map(([x, y]) => `${x} is a copy of ${y}`).join(" and ")} (neither has changed since), so read ${hits.map(([, y]) => y).join(" and ")} instead.`, { x: hits.map((h) => h[0]), y: hits.map((h) => h[1]) }); }
      const d = def(code[i]);
      if (d) {
        copies.delete(d);
        for (const [k, v] of [...copies]) if (v === d) copies.delete(k);
        if (code[i].kind === "assign" && code[i].op === "=" && isVar(code[i].a) && code[i].a !== d) copies.set(d, code[i].a);
      }
    }
  },
  cse(code, emit) {
    const avail = new Map();
    for (let i = 0; i < code.length; i++) {
      const ins = code[i], key = exprKey(ins);
      let replaced = false;
      if (key && avail.has(key)) {
        const v = avail.get(key);
        if (v === ins.res) { code.splice(i, 1); emit(i, ins, null, `${ins.res} already holds ${exprText(ins)}, so computing it again changes nothing: delete it.`, { expr: exprText(ins), v }); i--; continue; }
        const next = copyOf(ins, v);
        code[i] = next; replaced = true;
        emit(i, ins, next, `${exprText(ins)} was already computed into ${v}, and nothing it uses has changed since: reuse ${v}.`, { expr: exprText(ins), v });
      }
      const d = def(code[i]);
      if (d) for (const [k, holder] of [...avail]) if (holder === d || k.split("|").slice(1).includes(d)) avail.delete(k);
      if (ins.kind === "store") for (const k of [...avail.keys()]) if (k.startsWith(`[]|${ins.arr}|`)) avail.delete(k);
      if (key && !replaced && !key.split("|").slice(1).includes(ins.res)) avail.set(key, ins.res);
    }
  },
  fold(code, emit) {
    for (let i = 0; i < code.length; i++) {
      const ins = code[i];
      if (ins.kind !== "assign" || ins.op === "=") continue;
      if (!isNum(ins.a) || (ins.op !== "minus" && !isNum(ins.b))) continue;
      if ((ins.op === "/" || ins.op === "%") && Number(ins.b) === 0) continue;
      const v = numStr(compute(ins.op, Number(ins.a), ins.op === "minus" ? 0 : Number(ins.b)));
      if (v == null) continue;
      const next = copyOf(ins, v);
      code[i] = next;
      emit(i, ins, next, `Both operands are constants, so work out ${exprText(ins)} = ${v} now, at compile time.`, { expr: exprText(ins), value: v });
    }
  },
  algebra(code, emit) {
    for (let i = 0; i < code.length; i++) {
      const ins = code[i];
      if (ins.kind !== "assign" || ins.op === "=" || ins.op === "minus") continue;
      const { a, b, op } = ins, na = isNum(a) ? Number(a) : null, nb = isNum(b) ? Number(b) : null;
      if (na != null && nb != null) continue;
      let next = null, why = "";
      const pow2 = (n) => n != null && n >= 4 && Number.isInteger(Math.log2(n)) ? Math.log2(n) : null;
      if (op === "+" && nb === 0 || op === "-" && nb === 0) { next = copyOf(ins, a); why = `Adding or subtracting 0 changes nothing: ${a} ${op} 0 = ${a}.`; }
      else if (op === "+" && na === 0) { next = copyOf(ins, b); why = `0 + ${b} = ${b}.`; }
      else if ((op === "*" || op === "/") && nb === 1 || op === "^" && nb === 1) { next = copyOf(ins, a); why = `${a} ${op} 1 = ${a}.`; }
      else if (op === "*" && na === 1) { next = copyOf(ins, b); why = `1 * ${b} = ${b}.`; }
      else if (op === "*" && (na === 0 || nb === 0)) { next = copyOf(ins, "0"); why = "Anything times 0 is 0."; }
      else if (op === "-" && a === b) { next = copyOf(ins, "0"); why = `${a} − ${a} is always 0.`; }
      else if (op === "*" && (nb === 2 || na === 2)) { const x = nb === 2 ? a : b; next = { ...ins, op: "+", a: x, b: x }; why = `Strength reduction: ${x} * 2 = ${x} + ${x}, and an add is cheaper than a multiply.`; }
      else if (op === "*" && (pow2(nb) != null || pow2(na) != null)) { const k = pow2(nb) ?? pow2(na), x = pow2(nb) != null ? a : b; next = { ...ins, op: "<<", a: x, b: String(k) }; why = `Strength reduction: multiplying by ${2 ** k} = 2^${k} is a left shift by ${k} bits.`; }
      else if (op === "^" && nb === 2) { next = { ...ins, op: "*", a, b: a }; why = `Strength reduction: ${a}^2 = ${a} * ${a}, a multiply instead of a call to pow.`; }
      if (!next) continue;
      code[i] = next;
      emit(i, ins, next, why, { rule: `${exprText(ins)} → ${next.op === "=" ? next.a : exprText(next)}` });
    }
  },
  dce(code, emit, out) {
    const live = new Set(out);
    for (let i = code.length - 1; i >= 0; i--) {
      const ins = code[i], d = def(ins);
      const self = ins.kind === "assign" && ins.op === "=" && ins.a === ins.res;
      if (d && (!live.has(d) || self)) {
        const liveNow = `{${[...live].join(", ")}}`;
        code.splice(i, 1);
        emit(i, ins, null, self ? `${d} = ${d} copies a variable onto itself: delete it.` : `${d} is dead here: no later instruction reads it before it is overwritten${TEMP.test(d) ? "" : " or the program ends"}, so delete it.`, { x: d, live: liveNow });
        continue;
      }
      if (d) live.delete(d);
      for (const v of uses(ins)) live.add(v);
    }
  },
};

export function optimise(cfgIn, enabled = Object.keys(PASSES), { maxRounds = 8 } = {}) {
  const cfg = { ...cfgIn, blocks: cfgIn.blocks.map((b) => ({ ...b, code: b.code.map((x) => ({ ...x })) })) };
  const steps = [], show2 = (code) => code.map(blockLine);
  const counts = Object.fromEntries(Object.keys(PASSES).map((k) => [k, 0]));
  let round = 0;
  for (; round < maxRounds;) {
    round++;
    let changed = false;
    for (const b of cfg.blocks) for (const pass of Object.keys(PASSES)) {
      if (!enabled.includes(pass)) continue;
      const out = pass === "dce" ? [...liveness(cfg).OUT[b.id]] : null;
      const before = show2(b.code);
      PASS_FNS[pass](b.code, (i, old, next, why, vars) => {
        changed = true; counts[pass]++;
        const after = show2(b.code);
        steps.push({ round, block: b.id, pass, at: i, old: blockLine(old), now: next ? blockLine(next) : null, removed: !next, before: [...before], after, line: pass === "dce" ? [13, 14] : PASSES[pass].lines, note: `${PASSES[pass].name} in ${b.id}: ${why}`, vars: { round, B: b.id, pass: PASSES[pass].short, instr: blockLine(old), ...vars } });
        before.splice(0, before.length, ...after);
      }, out);
    }
    if (!changed) break;
  }
  const total = steps.length;
  steps.push({ round, done: true, line: 16, note: total ? `Round ${round} changed nothing, so the code is as good as these local passes can make it: ${total} rewrite${total === 1 ? "" : "s"} in all.` : "None of the selected passes finds anything to improve here.", vars: { round, rewrites: total } });
  return { cfg, steps, counts, rounds: round };
}

// Lay the blocks out again as one list, jumps pointing at block starts.
export function linearise(cfg) {
  const prog = [], startOf = {};
  for (const b of cfg.blocks) { startOf[b.id] = prog.length; prog.push(...b.code.map((x) => ({ ...x }))); }
  for (const ins of prog) if (ins.block) ins.to = startOf[ins.block];
  return prog;
}

// --- Running code (for tests and for checking answers) --------------------------------------------
export function execute(prog, env = {}, { limit = 5000 } = {}) {
  const v = { ...env }, mem = new Map();
  const val = (x) => (isNum(x) ? Number(x) : v[x] ?? 0);
  const arr = (a) => { if (!mem.has(a)) mem.set(a, new Map()); return mem.get(a); };
  let pc = 0, steps = 0;
  while (pc < prog.length) {
    if (++steps > limit) throw new Error("Program ran too long.");
    const ins = prog[pc];
    if (ins.kind === "assign") v[ins.res] = ins.op === "=" ? val(ins.a) : compute(ins.op, val(ins.a), ins.op === "minus" ? 0 : val(ins.b));
    else if (ins.kind === "load") v[ins.res] = arr(ins.arr).get(val(ins.a)) ?? 0;
    else if (ins.kind === "store") arr(ins.arr).set(val(ins.a), val(ins.b));
    else if (ins.kind === "goto") { pc = ins.to; continue; }
    else if (ins.kind === "if") {
      const t = ins.rel ? compute(ins.rel, val(ins.a), val(ins.b)) : val(ins.a);
      if (Boolean(t) !== Boolean(ins.neg)) { pc = ins.to; continue; }
    } else break;
    pc++;
  }
  return { vars: v, mem: Object.fromEntries([...mem].map(([k, m]) => [k, Object.fromEntries([...m].sort((a, b) => a[0] - b[0]))])) };
}

// Random straight-line block (or one with a forward jump) for practice and fuzzing.
export function randomTac(r, { n = 7, jumps = false, consts = true } = {}) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const names = ["a", "b", "c", "x", "y"], defined = ["a", "b", "c"];
  let t = 0;
  const lines = [];
  const opnd = () => (consts && r() < 0.3 ? pick(["0", "1", "2", "3", "4", "8"]) : pick(defined));
  for (let i = 0; i < n; i++) {
    if (jumps && i > 1 && i < n - 2 && r() < 0.15) { lines.push(`if ${pick(defined)} < ${opnd()} goto L${i}`); continue; }
    const res = r() < 0.5 ? `t${++t}` : pick(names);
    const k = r();
    lines.push(k < 0.2 ? `${res} = ${opnd()}` : `${res} = ${opnd()} ${pick(["+", "-", "*", "*", "+"])} ${opnd()}`);
    if (!defined.includes(res)) defined.push(res);
  }
  if (jumps) {
    // Each jump goes forward to a label placed on a later instruction.
    lines.forEach((l, i) => {
      const m = /goto L(\d+)$/.exec(l);
      if (!m) return;
      const at = Math.min(lines.length - 1, i + 1 + Math.floor(r() * 3));
      lines[at] = `L${m[1]}: ${lines[at]}`;
    });
  }
  return lines.join("\n");
}

export const EXAMPLES = {
  identity: { name: "Identity matrix (Dragon Book Fig. 8.7)", text: "(1) i = 1\n(2) j = 1\n(3) t1 = 10 * i\n(4) t2 = t1 + j\n(5) t3 = 8 * t2\n(6) t4 = t3 - 88\n(7) a[t4] = 0.0\n(8) j = j + 1\n(9) if j <= 10 goto (3)\n(10) i = i + 1\n(11) if i <= 10 goto (2)\n(12) i = 1\n(13) t5 = i - 1\n(14) t6 = 88 * t5\n(15) a[t6] = 1.0\n(16) i = i + 1\n(17) if i <= 10 goto (13)" },
  quicksort: { name: "Quicksort fragment (Dragon Book Fig. 9.2)", text: "(1) i = m - 1\n(2) j = n\n(3) t1 = 4 * n\n(4) v = a[t1]\n(5) i = i + 1\n(6) t2 = 4 * i\n(7) t3 = a[t2]\n(8) if t3 < v goto (5)\n(9) j = j - 1\n(10) t4 = 4 * j\n(11) t5 = a[t4]\n(12) if t5 > v goto (9)\n(13) if i >= j goto (23)\n(14) t6 = 4 * i\n(15) x = a[t6]\n(16) t7 = 4 * i\n(17) t8 = 4 * j\n(18) t9 = a[t8]\n(19) a[t7] = t9\n(20) t10 = 4 * j\n(21) a[t10] = x\n(22) goto (5)\n(23) t11 = 4 * i\n(24) x = a[t11]\n(25) t12 = 4 * i\n(26) t13 = 4 * n\n(27) t14 = a[t13]\n(28) a[t12] = t14\n(29) t15 = 4 * n\n(30) a[t15] = x" },
  cse: { name: "Common subexpression block (Dragon Book §8.5)", text: "a = b + c\nb = a - d\nc = b + c\nd = a - d\nlive: a b c d" },
  folding: { name: "Constants, copies and strength reduction", text: "a = 4\nb = a * 2\nc = b\nd = c + x\nt1 = d * 1\nt2 = t1 * 8\ne = t2 + 0\nf = x ^ 2\nlive: e f" },
  loop: { name: "A loop with labels", text: "s = 0\ni = 0\nL1: if i >= n goto L2\nt1 = i * 4\nt2 = a[t1]\ns = s + t2\ni = i + 1\ngoto L1\nL2: return s" },
};
