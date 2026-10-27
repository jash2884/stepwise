// Intermediate code for a basic block of assignments: syntax trees, the DAG
// (common subexpressions shared), three-address code, quadruples and triples.
//   a = b * -c + b * -c

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

export const CODE = {
  gen: [
    "gen(n):  // post-order: children before the operator",
    "  if n is a name or a constant then return n",
    "  l ← gen(left child); r ← gen(right child)",
    "  t ← newtemp()",
    "  emit(t = l op r)  // or t = minus l",
    "  return t",
    "for each statement x = E",
    "  emit(x = gen(E))",
  ],
  dag: [
    "for each statement x = E",
    "  n ← node(E)  // built bottom-up",
    "  move the label x onto n",
    "node(leaf y): the node labelled y, or a new leaf y",
    "node(op, l, r):",
    "  if a node with label op and children l, r exists then",
    "    return it  // a common subexpression",
    "  create the node op(l, r) and return it",
  ],
};

function lex(src) {
  const out = [];
  const re = /\s*(?:([A-Za-z_]\w*)|(\d+(?:\.\d+)?)|(.))/gy;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1]) out.push({ t: "id", v: m[1] });
    else if (m[2]) out.push({ t: "num", v: m[2] });
    else if (m[3] && m[3].trim()) {
      if (!"+-*/%^()=".includes(m[3])) throw new Error(`Unexpected "${m[3]}". Use + - * / % ^, parentheses and names.`);
      out.push({ t: m[3] });
    }
  }
  return out;
}

function parseExpr(tokens) {
  let i = 0;
  const peek = () => tokens[i], take = () => tokens[i++];
  const primary = () => {
    const t = take();
    if (!t) throw new Error("The expression ends too early.");
    if (t.t === "id") return { op: "id", name: t.v };
    if (t.t === "num") return { op: "num", name: t.v };
    if (t.t === "-") return { op: "minus", kids: [unary()] };
    if (t.t === "(") {
      const e = expr(0);
      if (take()?.t !== ")") throw new Error("A '(' is never closed.");
      return e;
    }
    throw new Error(`Unexpected "${t.t}".`);
  };
  const unary = () => primary();
  const expr = (min) => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t || !(t.t in PREC) || PREC[t.t] < min) return left;
      take();
      const right = expr(t.t === "^" ? PREC[t.t] : PREC[t.t] + 1);
      left = { op: t.t, kids: [left, right] };
    }
  };
  const e = expr(1);
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].v ?? tokens[i].t}" after the expression.`);
  return e;
}

export function parseBlock(text) {
  const stmts = [];
  for (const raw of String(text).split(/[\n;]/)) {
    const line = raw.trim();
    if (!line) continue;
    const toks = lex(line);
    let target = null, body = toks;
    if (toks[1]?.t === "=") {
      if (toks[0].t !== "id") throw new Error(`"${line}": the left of = must be a variable name.`);
      target = toks[0].v; body = toks.slice(2);
    }
    if (body.some((t) => t.t === "=")) throw new Error(`"${line}": one assignment per line.`);
    stmts.push({ target: target ?? "result", tree: parseExpr(body), src: line });
  }
  if (!stmts.length) throw new Error("Enter at least one assignment, e.g. a = b * -c + b * -c.");
  if (stmts.length > 12) throw new Error("Use at most 12 statements.");
  return stmts;
}

const label = (n) => (n.op === "id" || n.op === "num" ? n.name : n.op);

// Naive code: every operator node in every tree gets a new temporary.
export function generate(stmts) {
  let t = 0;
  const code = [], steps = [];
  for (const [si, s] of stmts.entries()) {
    let order = 0;
    const walk = (n, path) => {
      n.path = path;
      if (n.op === "id" || n.op === "num") return n.name;
      const args = n.kids.map((k, i) => walk(k, `${path}.${i}`));
      const res = `t${++t}`;
      const ins = n.op === "minus" ? { op: "minus", a1: args[0], a2: null, res } : { op: n.op, a1: args[0], a2: args[1], res };
      code.push(ins);
      steps.push({ stmt: si, node: path, order: order++, code: code.length - 1, line: [3, 4, 5, 6], vars: { x: s.target, op: n.op, l: args[0], r: args[1] ?? "–", t: res, temps: t }, note: `${n.op === "minus" ? "Unary minus" : `Operator ${n.op}`}: its operands are ready (${args.join(", ")}), so emit ${show(ins)}. Its value now lives in ${res} for the parent to use.` });
      return res;
    };
    const v = walk(s.tree, "r");
    code.push({ op: "=", a1: v, a2: null, res: s.target });
    steps.push({ stmt: si, node: "root", code: code.length - 1, line: [7, 8], vars: { x: s.target, op: "=", l: v, r: "–", t: "–", temps: t }, note: `Assign the result to ${s.target}: ${s.target} = ${v}.` });
  }
  return { code, steps, temps: t };
}

export const show = (i) => (i.op === "=" ? `${i.res} = ${i.a1}` : i.op === "minus" ? `${i.res} = minus ${i.a1}` : `${i.res} = ${i.a1} ${i.op} ${i.a2}`);

// The DAG by value numbering: a node is reused when the same operator is applied
// to the same operand nodes. Assigning to x moves the label x onto the new value.
export function dag(stmts) {
  const nodes = [], byKey = new Map(), current = new Map(), steps = [];
  const leaf = (name) => {
    if (current.has(name)) return { id: current.get(name), reused: true };
    const k = `leaf:${name}`;
    if (byKey.has(k)) return { id: byKey.get(k), reused: true };
    nodes.push({ id: nodes.length, op: name, leaf: true, kids: [], labels: [] });
    byKey.set(k, nodes.length - 1);
    return { id: nodes.length - 1, reused: false };
  };
  for (const [si, s] of stmts.entries()) {
    const walk = (n) => {
      if (n.op === "id" || n.op === "num") {
        const r = leaf(n.name);
        if (!r.reused) steps.push({ stmt: si, node: r.id, line: [2, 4], vars: { x: s.target, op: n.name, node: `node ${r.id + 1}`, "DAG nodes": nodes.length }, note: `Leaf for ${n.name}: its initial value, since no node is labelled ${n.name} yet.` });
        return r.id;
      }
      const kids = n.kids.map(walk);
      const k = `${n.op}:${kids.join(",")}`;
      if (byKey.has(k)) {
        const id = byKey.get(k);
        steps.push({ stmt: si, node: id, reused: true, line: [2, 5, 6, 7], vars: { x: s.target, op: n.op, children: kids.map((k) => nodeName(nodes[k])), node: `node ${id + 1}`, "DAG nodes": nodes.length }, note: `${describeNode(n.op, kids, nodes)} already exists as node ${id + 1}: a common subexpression, so reuse it instead of computing it again.` });
        return id;
      }
      nodes.push({ id: nodes.length, op: n.op, kids, labels: [] });
      byKey.set(k, nodes.length - 1);
      steps.push({ stmt: si, node: nodes.length - 1, line: [2, 5, 6, 8], vars: { x: s.target, op: n.op, children: kids.map((k) => nodeName(nodes[k])), node: `node ${nodes.length}`, "DAG nodes": nodes.length }, note: `No node ${n.op} with these children exists yet, so create node ${nodes.length} for ${describeNode(n.op, kids, nodes)}.` });
      return nodes.length - 1;
    };
    const id = walk(s.tree);
    for (const n of nodes) n.labels = n.labels.filter((x) => x !== s.target);
    nodes[id].labels.push(s.target);
    current.set(s.target, id);
    steps.push({ stmt: si, node: id, line: [1, 3], vars: { x: s.target, node: `node ${id + 1}`, labels: nodes[id].labels, "DAG nodes": nodes.length }, note: `Attach ${s.target} to node ${id + 1}${nodes[id].labels.length > 1 ? ` (it now names ${nodes[id].labels.join(", ")})` : ""}. Any earlier node labelled ${s.target} loses the label: later uses of ${s.target} mean this new value.` });
  }
  // Code from the DAG: each interior node once, in creation order.
  const name = new Map(), code = [];
  let t = 0;
  for (const n of nodes) {
    if (n.leaf) { name.set(n.id, n.op); continue; }
    const args = n.kids.map((k) => name.get(k));
    const res = `t${++t}`;
    name.set(n.id, res);
    code.push(n.op === "minus" ? { op: "minus", a1: args[0], a2: null, res } : { op: n.op, a1: args[0], a2: args[1], res });
  }
  for (const s of stmts) {
    const id = current.get(s.target);
    if (name.get(id) !== s.target) code.push({ op: "=", a1: name.get(id), a2: null, res: s.target });
  }
  return { nodes, steps, code };
}
const describeNode = (op, kids, nodes) => (op === "minus" ? `minus ${nodeName(nodes[kids[0]])}` : `${nodeName(nodes[kids[0]])} ${op} ${nodeName(nodes[kids[1]])}`);
const nodeName = (n) => (n.leaf ? n.op : `node ${n.id + 1}`);

export function quadruples(code) {
  return code.map((i) => ({ op: i.op, arg1: i.a1, arg2: i.a2 ?? "", result: i.res }));
}

// Triples refer to earlier results by position instead of naming temporaries.
export function triples(code) {
  const at = new Map();
  const ref = (x) => (at.has(x) ? `(${at.get(x)})` : x);
  return code.map((i, k) => {
    const row = i.op === "=" ? { op: "=", arg1: i.res, arg2: ref(i.a1) } : { op: i.op, arg1: ref(i.a1), arg2: i.a2 == null ? "" : ref(i.a2) };
    if (/^t\d+$/.test(i.res)) at.set(i.res, k);
    return row;
  });
}

export function tree(stmt) {
  const conv = (n, path) => ({ id: path, label: label(n), state: n.op === "id" || n.op === "num" ? "matched" : "expanded", kids: (n.kids ?? []).map((k, i) => conv(k, `${path}.${i}`)) });
  return { id: "root", label: "=", state: "expanded", kids: [{ id: "lhs", label: stmt.target, state: "matched", kids: [] }, conv(stmt.tree, "r")] };
}

export const EXAMPLES = {
  dragon: { name: "a = b * -c + b * -c", text: "a = b * -c + b * -c" },
  cse: { name: "a + a * (b - c) + (b - c) * d", text: "x = a + a * (b - c) + (b - c) * d" },
  block: { name: "A basic block", text: "a = b + c\nb = a - d\nc = b + c\nd = a - d" },
  quad: { name: "Quadratic formula", text: "d = b * b - 4 * a * c\nx = (-b + d ^ 0.5) / (2 * a)" },
};
