// Register allocation by graph colouring: liveness analysis to a fixed point,
// live ranges per instruction, the interference graph, and Chaitin-style
// simplify / spill / select with k registers (optimistic, as in Briggs).
import { basicBlocks, blockLine, def, liveAfter, liveness, parseTac, uses, varsOf } from "./optimise.js";

export const LIVE_CODE = [
  "IN[EXIT] ← the variables live at the end",
  "for each block B: IN[B] ← ∅",
  "repeat  // one pass over the blocks",
  "  for each block B, last to first",
  "    OUT[B] ← ∪ IN[S] over the successors S of B",
  "    IN[B] ← use[B] ∪ (OUT[B] − def[B])",
  "until no IN set changes in a whole pass",
];
export const GRAPH_CODE = [
  "for each instruction i that defines x",
  "  for each y live just after i, y ≠ x",
  "    if i is the copy x = y: skip  // they may share a register",
  "    else add the edge x — y  // both hold values at once",
  "variables live on entry all interfere with each other",
];
export const COLOUR_CODE = [
  "while the graph has nodes",
  "  if some node n has fewer than k neighbours",
  "    remove n and push it  // simplify: n can always be coloured",
  "  else",
  "    pick n with the most neighbours  // potential spill",
  "    remove n and push it",
  "while the stack is not empty",
  "  pop n and put it back in the graph",
  "  if some colour isn't used by n's coloured neighbours",
  "    give n the lowest such colour",
  "  else n is an actual spill  // kept in memory",
];

const fmtSet = (xs) => `{${xs.join(", ")}}`;

export function analyse(text) {
  const parsed = parseTac(text);
  const bb = basicBlocks(parsed), cfg = bb.cfg;
  const order = varsOf(parsed.prog);
  const lv = liveness(cfg);
  // Steps of the round-robin iteration.
  const liveSteps = [];
  const IN = Object.fromEntries(cfg.blocks.map((b) => [b.id, []])), OUT = Object.fromEntries(cfg.blocks.map((b) => [b.id, []]));
  const snap = () => ({ IN: { ...IN }, OUT: { ...OUT } });
  liveSteps.push({ line: [1, 2], it: 0, block: null, ...snap(), note: `Start with every IN set empty, except IN[EXIT] = ${fmtSet(cfg.liveExit)}: the variables still needed when the program ends.`, vars: { "IN[EXIT]": fmtSet(cfg.liveExit) } });
  for (const r of lv.rounds) {
    for (const v of r.visits) {
      const was = IN[v.id];
      IN[v.id] = v.in; OUT[v.id] = v.out;
      const { use, def: d } = lv.ud[v.id];
      const succ = cfg.succ[v.id];
      liveSteps.push({ line: [5, 6], it: r.it, block: v.id, changed: v.changed, grew: v.in.filter((x) => !was.includes(x)), ...snap(),
        note: `Pass ${r.it}, ${v.id}: OUT = ∪ IN of ${succ.join(", ")} = ${fmtSet(v.out)}; IN = use ${fmtSet(use)} ∪ (OUT − def ${fmtSet(d)}) = ${fmtSet(v.in)}${v.changed ? "" : ", no change"}.`,
        vars: { iteration: r.it, B: v.id, "use[B]": fmtSet(use), "def[B]": fmtSet(d), "OUT[B]": fmtSet(v.out), "IN[B]": fmtSet(v.in), changed: v.changed } });
    }
    liveSteps.push({ line: 7, it: r.it, block: null, ...snap(), note: r.changed ? `Pass ${r.it} changed some IN sets, so go round again.` : `Pass ${r.it} changed nothing: the sets have reached a fixed point.`, vars: { iteration: r.it, changed: r.changed }, done: !r.changed });
  }
  // Each instruction with the variables live before and after it.
  const rows = [];
  for (const b of cfg.blocks) {
    const la = liveAfter(b.code, lv.OUT[b.id]);
    b.code.forEach((ins, i) => {
      const before = i ? la.after[i - 1] : [...lv.IN[b.id]];
      rows.push({ block: b.id, num: ins.num, text: blockLine(ins), ins, before, after: la.after[i] });
    });
  }
  const seen = new Set(rows.flatMap((r) => [...r.before, ...r.after, def(r.ins)]));
  const vars = [...order, ...[...seen].filter((v) => v && !order.includes(v))].filter((v) => seen.has(v));
  // Interference graph.
  const edges = [], has = (x, y) => edges.some((e) => e.a === x && e.b === y || e.a === y && e.b === x);
  const graphSteps = [];
  const entry = [...(lv.IN[cfg.blocks[0].id] ?? [])];
  rows.forEach((r, k) => {
    const x = def(r.ins);
    if (!x) return;
    const copy = r.ins.kind === "assign" && r.ins.op === "=" ? r.ins.a : null;
    const added = [];
    for (const y of r.after) if (y !== x && y !== copy && !has(x, y)) { edges.push({ a: x, b: y }); added.push(y); }
    const skipped = copy && r.after.includes(copy) && copy !== x;
    graphSteps.push({ line: added.length ? [1, 2, 4] : skipped ? [1, 2, 3] : [1, 2], row: k, x, added, edges: edges.map((e) => ({ ...e })),
      note: `(${r.num}) ${r.text} defines ${x}. Live just after it: ${fmtSet(r.after)}.${added.length ? ` Add ${added.map((y) => `${x} — ${y}`).join(", ")}.` : " No new edges."}${skipped ? ` ${x} = ${copy} is a copy, so ${x} and ${copy} don't interfere because of it.` : ""}`,
      vars: { i: r.num, x, "live after": fmtSet(r.after), "new edges": added.map((y) => `${x}—${y}`) } });
  });
  const added = [];
  for (let i = 0; i < entry.length; i++) for (let j = i + 1; j < entry.length; j++) if (!has(entry[i], entry[j])) { edges.push({ a: entry[i], b: entry[j] }); added.push(`${entry[i]}—${entry[j]}`); }
  graphSteps.push({ line: 5, row: null, x: null, added: [], edges: edges.map((e) => ({ ...e })), note: entry.length > 1 ? `${fmtSet(entry)} are live on entry (inputs), so they all hold values at the same time${added.length ? `: add ${added.join(", ")}` : " (already joined)"}. The graph is complete: ${edges.length} edge${edges.length === 1 ? "" : "s"}.` : `The graph is complete: ${vars.length} variables, ${edges.length} edge${edges.length === 1 ? "" : "s"}.`, vars: { "live on entry": fmtSet(entry), edges: edges.length }, done: true });
  return { parsed, cfg, blocks: bb.blocks, live: lv, liveSteps, rows, vars, edges, graphSteps };
}

const neighbours = (edges, n) => edges.flatMap((e) => (e.a === n ? [e.b] : e.b === n ? [e.a] : []));

// Chaitin / Briggs colouring. Colours are 0 … k−1.
export function colour(vars, edges, k, rows = []) {
  const cost = (v) => rows.reduce((s, r) => s + (def(r.ins) === v ? 1 : 0) + (uses(r.ins).includes(v) ? 1 : 0), 0);
  const left = new Set(vars), stack = [], steps = [], colours = {}, spilled = [], potential = [];
  const deg = (n) => neighbours(edges, n).filter((m) => left.has(m)).length;
  const snap = (extra) => ({ removed: vars.filter((v) => !left.has(v)), stack: stack.map((s) => ({ ...s })), colours: { ...colours }, spilled: [...spilled], potential: [...potential], ...extra });
  steps.push(snap({ line: 1, node: null, note: `k = ${k} registers. Simplify first: a node with fewer than ${k} neighbours can always get a colour later, whatever its neighbours get.`, vars: { k, nodes: vars.length, stack: [] } }));
  while (left.size) {
    const easy = vars.find((v) => left.has(v) && deg(v) < k);
    if (easy) {
      const d = deg(easy);
      left.delete(easy); stack.push({ v: easy, spill: false });
      steps.push(snap({ line: [2, 3], node: easy, phase: "simplify", note: `${easy} has ${d} neighbour${d === 1 ? "" : "s"} left, fewer than k = ${k}: remove it and push it on the stack.`, vars: { k, n: easy, degree: d, stack: stack.map((s) => s.v) } }));
      continue;
    }
    const cand = vars.filter((v) => left.has(v)).sort((a, b) => deg(b) - deg(a) || cost(a) - cost(b) || vars.indexOf(a) - vars.indexOf(b))[0];
    const d = deg(cand);
    left.delete(cand); stack.push({ v: cand, spill: true }); potential.push(cand);
    steps.push(snap({ line: [4, 5, 6], node: cand, phase: "spill", note: `Every node left has at least ${k} neighbours, so simplify is stuck. Pick ${cand} (${d} neighbours, the most${cost(cand) ? `; used or defined ${cost(cand)} time${cost(cand) === 1 ? "" : "s"}` : ""}) as a potential spill and push it anyway: its neighbours might still share colours.`, vars: { k, n: cand, degree: d, stack: stack.map((s) => s.v) } }));
  }
  while (stack.length) {
    const { v } = stack.pop();
    left.add(v);
    const taken = new Set(neighbours(edges, v).map((m) => colours[m]).filter((c) => c != null));
    const free = Array.from({ length: k }, (_, c) => c).find((c) => !taken.has(c));
    if (free != null) {
      colours[v] = free;
      steps.push(snap({ line: [7, 8, 9, 10], node: v, phase: "select", note: `Pop ${v}. Its coloured neighbours use ${taken.size ? [...taken].sort().map((c) => `R${c + 1}`).join(", ") : "nothing yet"}, so ${v} gets R${free + 1}${potential.includes(v) ? ": the potential spill didn't need spilling after all" : ""}.`, vars: { n: v, "neighbour colours": [...taken].sort().map((c) => `R${c + 1}`), colour: `R${free + 1}`, stack: stack.map((s) => s.v) } }));
    } else {
      spilled.push(v);
      steps.push(snap({ line: [7, 8, 11], node: v, phase: "spilled", note: `Pop ${v}. Its neighbours already use all ${k} registers, so ${v} is an actual spill: it lives in memory, loaded before each use and stored after each definition.`, vars: { n: v, "neighbour colours": [...taken].sort().map((c) => `R${c + 1}`), colour: "spill", stack: stack.map((s) => s.v) } }));
    }
  }
  const used = new Set(Object.values(colours)).size;
  steps.push(snap({ line: 7, node: null, done: true, note: `Done: ${Object.keys(colours).length} variable${Object.keys(colours).length === 1 ? "" : "s"} in ${used} register${used === 1 ? "" : "s"}${spilled.length ? `, ${spilled.join(", ")} spilled to memory` : ", nothing spilled"}.`, vars: { k, registers: used, spilled } }));
  return { steps, colours, spilled, used };
}

export function rewrite(rows, colours) {
  const name = (x) => (x == null ? x : x in colours ? `R${colours[x] + 1}` : x);
  return rows.map((r) => {
    const ins = { ...r.ins };
    for (const f of ["res", "a", "b"]) if (ins[f] != null && (f !== "res" || def(r.ins))) ins[f] = name(ins[f]);
    return { block: r.block, num: r.num, text: blockLine(ins) };
  });
}

// Smallest k with a proper colouring (backtracking: graphs here are small).
export function chromatic(vars, edges) {
  if (!vars.length) return 0;
  const adj = new Map(vars.map((v) => [v, neighbours(edges, v)]));
  for (let k = 1; k <= vars.length; k++) {
    const col = {};
    const ok = (i) => {
      if (i === vars.length) return true;
      const v = vars[i];
      for (let c = 0; c < k; c++) if (!adj.get(v).some((m) => col[m] === c)) { col[v] = c; if (ok(i + 1)) return true; delete col[v]; }
      return false;
    };
    if (ok(0)) return k;
  }
  return vars.length;
}

export const EXAMPLES = {
  appel: { name: "Appel's loop (Modern Compiler Implementation, ch. 10)", text: "a = 0\nL1: b = a + 1\nc = c + b\na = b * 2\nif a < N goto L1\nreturn c", k: 3 },
  block: { name: "A straight-line block", text: "a = x + y\nb = a * 2\nc = a + b\nd = c - x\ne = d * b\nlive: e", k: 3 },
  dragon: { name: "Liveness with a branch (Dragon Book §9.2.5 style)", text: "d = a + b\ne = d - c\nif e < 0 goto L1\nf = e * 2\ngoto L2\nL1: f = d + a\nL2: g = f + c\nlive: g", k: 4 },
  spill: { name: "Needs a spill with k = 2", text: "a = p + q\nb = p - q\nc = a * b\nd = a + c\ne = b + d\nf = c + e\nlive: f", k: 2 },
};
