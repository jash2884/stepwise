// Syntax-directed definitions: build the parse tree, attach attributes with
// their semantic rules, then evaluate them in a topological order of the
// dependency graph (synthesised attributes flow up, inherited ones down/across).

export const SDT_CODE = [
  "build the parse tree for the input",
  "for each node, attach the attributes of its production",
  "add an edge b → a whenever a's rule uses b  // dependency graph",
  "for each attribute a, in topological order",
  "  if a is synthesised: compute it from the node's children",
  "  else (inherited): compute it from the parent and siblings",
  "the root's attribute is the result",
];

// Productions and semantic rules shown in the SDD table, per definition.
export const SDDS = {
  desk: {
    name: "Desk calculator (S-attributed)",
    input: "3 * 5 + 4",
    about: "Every attribute is synthesised, so a single bottom-up (post-order) pass evaluates the tree: what an LR parser does as it reduces.",
    rules: [
      ["L → E n", "L.val = E.val  // print it"],
      ["E → E₁ + T", "E.val = E₁.val + T.val"],
      ["E → T", "E.val = T.val"],
      ["T → T₁ * F", "T.val = T₁.val × F.val"],
      ["T → F", "T.val = F.val"],
      ["F → ( E )", "F.val = E.val"],
      ["F → digit", "F.val = digit.lexval"],
    ],
  },
  ll: {
    name: "Expressions for top-down parsing (inherited attributes)",
    input: "3 * 5 + 4",
    about: "Without left recursion the left operand isn't a child any more, so it is passed down to E′ and T′ as an inherited attribute (inh), and the answer comes back up as syn.",
    rules: [
      ["E → T E′", "E′.inh = T.val;  E.val = E′.syn"],
      ["E′ → + T E′₁", "E′₁.inh = E′.inh + T.val;  E′.syn = E′₁.syn"],
      ["E′ → ε", "E′.syn = E′.inh"],
      ["T → F T′", "T′.inh = F.val;  T.val = T′.syn"],
      ["T′ → * F T′₁", "T′₁.inh = T′.inh × F.val;  T′.syn = T′₁.syn"],
      ["T′ → ε", "T′.syn = T′.inh"],
      ["F → ( E )", "F.val = E.val"],
      ["F → digit", "F.val = digit.lexval"],
    ],
  },
  decl: {
    name: "Declarations: float id₁, id₂, id₃ (inherited type)",
    input: "float x, y, z",
    about: "The type is known at the left (T) but needed by every identifier in the list, so it is handed down the list L as the inherited attribute L.inh.",
    rules: [
      ["D → T L", "L.inh = T.type"],
      ["T → int", "T.type = integer"],
      ["T → float", "T.type = float"],
      ["L → L₁ , id", "L₁.inh = L.inh;  addType(id.entry, L.inh)"],
      ["L → id", "addType(id.entry, L.inh)"],
    ],
  },
};

let uid = 0;
const node = (sym, kids = [], rule = null) => ({ id: `n${++uid}`, sym, kids, rule, attrs: [] });
// attr(owner, name, kind, text, deps, fn): deps are [node, name] pairs.
const attr = (owner, name, kind, text, deps, fn) => { owner.attrs.push({ owner, name, kind, text, deps, fn, value: undefined }); };
const get = (n, name) => n.attrs.find((a) => a.name === name);

function lex(src, kind) {
  const s = String(src).trim();
  if (!s) throw new Error("Enter an input to translate.");
  if (kind === "decl") {
    const m = /^(int|float)\s+(.+)$/.exec(s);
    if (!m) throw new Error('Write a declaration like "float x, y, z" (int or float, then names separated by commas).');
    const ids = m[2].split(",").map((x) => x.trim());
    if (ids.some((x) => !/^[A-Za-z_]\w*$/.test(x))) throw new Error("Each name must be an identifier, separated by commas.");
    if (ids.length > 6) throw new Error("Use at most 6 names.");
    return { type: m[1], ids };
  }
  const toks = [];
  for (const m of s.matchAll(/\s*(\d+|\S)/g)) {
    if (!/^(\d+|[-+*()])$/.test(m[1]) || m[1] === "-") throw new Error(`Unexpected "${m[1]}". Use numbers, + and *, and parentheses.`);
    toks.push(m[1]);
  }
  if (toks.length > 25) throw new Error("Keep the expression under 25 symbols.");
  return toks;
}

function digit(toks, i) {
  const t = toks[i.at];
  if (t == null || !/^\d+$/.test(t)) throw new Error(t == null ? "The expression ends too early." : `Expected a number but found "${t}".`);
  i.at++;
  const d = node("digit");
  d.label = t;
  attr(d, "lexval", "lex", "digit.lexval (from the lexer)", [], () => Number(t));
  return d;
}

function buildDesk(toks) {
  const i = { at: 0 };
  const F = () => {
    if (toks[i.at] === "(") {
      i.at++;
      const e = E();
      if (toks[i.at++] !== ")") throw new Error("A '(' is never closed.");
      const f = node("F", [node("("), e, node(")")], 5);
      attr(f, "val", "syn", "F.val = E.val", [[e, "val"]], (v) => v);
      return f;
    }
    const d = digit(toks, i), f = node("F", [d], 6);
    attr(f, "val", "syn", "F.val = digit.lexval", [[d, "lexval"]], (v) => v);
    return f;
  };
  const T = () => {
    let t = node("T", [F()], 4);
    attr(t, "val", "syn", "T.val = F.val", [[t.kids[0], "val"]], (v) => v);
    while (toks[i.at] === "*") {
      i.at++;
      const f = F(), up = node("T", [t, node("*"), f], 3);
      attr(up, "val", "syn", "T.val = T₁.val × F.val", [[t, "val"], [f, "val"]], (a, b) => a * b);
      t = up;
    }
    return t;
  };
  const E = () => {
    let e = node("E", [T()], 2);
    attr(e, "val", "syn", "E.val = T.val", [[e.kids[0], "val"]], (v) => v);
    while (toks[i.at] === "+") {
      i.at++;
      const t = T(), up = node("E", [e, node("+"), t], 1);
      attr(up, "val", "syn", "E.val = E₁.val + T.val", [[e, "val"], [t, "val"]], (a, b) => a + b);
      e = up;
    }
    return e;
  };
  const e = E();
  if (i.at < toks.length) throw new Error(`Unexpected "${toks[i.at]}".`);
  const L = node("L", [e, node("n")], 0);
  attr(L, "val", "syn", "L.val = E.val (print it)", [[e, "val"]], (v) => v);
  return L;
}

function buildLL(toks) {
  const i = { at: 0 };
  const F = () => {
    if (toks[i.at] === "(") {
      i.at++;
      const e = E();
      if (toks[i.at++] !== ")") throw new Error("A '(' is never closed.");
      const f = node("F", [node("("), e, node(")")], 6);
      attr(f, "val", "syn", "F.val = E.val", [[e, "val"]], (v) => v);
      return f;
    }
    const d = digit(toks, i), f = node("F", [d], 7);
    attr(f, "val", "syn", "F.val = digit.lexval", [[d, "lexval"]], (v) => v);
    return f;
  };
  // X′ → op Y X′₁ | ε, with inh passed in by the caller.
  const tail = (sym, op, next, ruleOp, ruleEps, combine, opName) => {
    if (toks[i.at] === op) {
      i.at++;
      const y = next(), rest = tail(sym, op, next, ruleOp, ruleEps, combine, opName);
      const n = node(sym, [node(op), y, rest], ruleOp);
      n.after = () => {
        attr(rest, "inh", "inh", `${sym}₁.inh = ${sym}.inh ${opName} ${y.sym}.val`, [[n, "inh"], [y, "val"]], combine);
        rest.after?.();
        attr(n, "syn", "syn", `${sym}.syn = ${sym}₁.syn`, [[rest, "syn"]], (v) => v);
      };
      return n;
    }
    const n = node(sym, [node("ε")], ruleEps);
    n.after = () => attr(n, "syn", "syn", `${sym}.syn = ${sym}.inh`, [[n, "inh"]], (v) => v);
    return n;
  };
  const T = () => {
    const f = F(), rest = tail("T′", "*", F, 4, 5, (a, b) => a * b, "×");
    const t = node("T", [f, rest], 3);
    attr(rest, "inh", "inh", "T′.inh = F.val", [[f, "val"]], (v) => v);
    rest.after();
    attr(t, "val", "syn", "T.val = T′.syn", [[rest, "syn"]], (v) => v);
    return t;
  };
  function E() {
    const t = T(), rest = tail("E′", "+", T, 1, 2, (a, b) => a + b, "+");
    const e = node("E", [t, rest], 0);
    attr(rest, "inh", "inh", "E′.inh = T.val", [[t, "val"]], (v) => v);
    rest.after();
    attr(e, "val", "syn", "E.val = E′.syn", [[rest, "syn"]], (v) => v);
    return e;
  }
  const e = E();
  if (i.at < toks.length) throw new Error(`Unexpected "${toks[i.at]}".`);
  return e;
}

function buildDecl({ type, ids }) {
  const T = node("T", [node(type)], type === "int" ? 1 : 2);
  attr(T, "type", "syn", `T.type = ${type === "int" ? "integer" : "float"}`, [], () => (type === "int" ? "integer" : "float"));
  const idNode = (name) => { const n = node("id"); n.label = name; return n; };
  let L = node("L", [idNode(ids[0])], 4);
  const lists = [L];
  for (const name of ids.slice(1)) { L = node("L", [L, node(","), idNode(name)], 3); lists.push(L); }
  const D = node("D", [T, L], 0);
  attr(L, "inh", "inh", "L.inh = T.type", [[T, "type"]], (v) => v);
  // Walk down the list: each L passes its type to L₁ and records its id's type.
  for (let k = lists.length - 1; k >= 0; k--) {
    const l = lists[k], id = l.kids.at(-1);
    if (k > 0) attr(lists[k - 1], "inh", "inh", "L₁.inh = L.inh", [[l, "inh"]], (v) => v);
    attr(id, "type", "inh", `addType(${id.label}.entry, L.inh)`, [[l, "inh"]], (v) => v);
  }
  return D;
}

export function translate(kind, src) {
  if (!SDDS[kind]) throw new Error("Unknown definition.");
  uid = 0;
  const toks = lex(src, kind);
  const root = kind === "desk" ? buildDesk(toks) : kind === "ll" ? buildLL(toks) : buildDecl(toks);
  // Rank attributes by a left-to-right depth-first walk: inherited ones when the
  // walk enters the node, synthesised ones when it leaves. Kahn's algorithm then
  // always takes the ready attribute with the smallest rank.
  const all = [], rank = new Map();
  let r = 0;
  const walk = (n) => {
    for (const a of n.attrs) if (a.kind !== "syn") { rank.set(a, r++); all.push(a); }
    n.kids.forEach(walk);
    for (const a of n.attrs) if (a.kind === "syn") { rank.set(a, r++); all.push(a); }
  };
  walk(root);
  const depsOf = (a) => a.deps.map(([n, name]) => get(n, name));
  const edges = all.flatMap((a) => depsOf(a).map((b) => ({ from: b, to: a })));
  const steps = [];
  const done = new Set();
  const view = () => ({ values: Object.fromEntries(all.filter((a) => done.has(a)).map((a) => [`${a.owner.id}.${a.name}`, a.value])) });
  // Lexer-supplied values are known before evaluation starts.
  for (const a of all) if (a.kind === "lex") { a.value = a.fn(); done.add(a); }
  steps.push({ line: [1, 2, 3], node: null, note: `Parse tree built, with ${all.filter((a) => a.kind !== "lex").length} attributes to evaluate and ${edges.length} dependency edges.${all.some((a) => a.kind === "lex") ? " The digits' lexval values come from the lexer, so they are known already." : ""}`, vars: { attributes: all.length, edges: edges.length }, ...view() });
  const order = [];
  while (done.size < all.length) {
    const ready = all.filter((a) => !done.has(a) && depsOf(a).every((b) => done.has(b))).sort((x, y) => rank.get(x) - rank.get(y));
    if (!ready.length) throw new Error("The dependency graph has a cycle.");
    const a = ready[0];
    const args = depsOf(a).map((b) => b.value);
    a.value = a.fn(...args);
    done.add(a);
    order.push(a);
    const label = `${a.owner.sym}.${a.name}`;
    const from = depsOf(a).map((b) => `${b.owner.sym}${b.owner.label ? `(${b.owner.label})` : ""}.${b.name} = ${b.value}`);
    steps.push({
      line: a.kind === "syn" ? [4, 5] : [4, 6], node: a.owner.id, attr: a.name, kind: a.kind, rule: a.owner.rule,
      note: `${a.kind === "syn" ? "Synthesised" : "Inherited"} ${label}${a.owner.label ? ` at ${a.owner.label}` : ""}: ${a.text}${from.length ? `, using ${from.join(" and ")}` : ""}, so it is ${a.value}.${a.kind === "inh" ? " It flows down (or across) the tree." : " It flows up the tree."}`,
      vars: { node: a.owner.sym, attribute: label, kind: a.kind === "syn" ? "synthesised" : "inherited", rule: a.text, "uses": from, value: a.value }, ...view(),
    });
  }
  const result = kind === "decl" ? Object.fromEntries(all.filter((a) => a.owner.sym === "id").map((a) => [a.owner.label, a.value])) : get(root, "val").value;
  steps.push({ line: 7, node: root.id, note: kind === "decl" ? `Every identifier now has its type in the symbol table: ${Object.entries(result).map(([k, v]) => `${k}: ${v}`).join(", ")}.` : `The root's ${root.sym}.val = ${result} is the value of the expression.`, vars: { result: kind === "decl" ? Object.entries(result).map(([k, v]) => `${k}:${v}`) : result }, done: true, ...view() });
  return { root, steps, order: order.map((a) => ({ node: a.owner.id, sym: a.owner.sym, name: a.name, kind: a.kind, value: a.value })), result, edges: edges.map((e) => ({ from: `${e.from.owner.id}.${e.from.name}`, to: `${e.to.owner.id}.${e.to.name}` })), attrs: all };
}

// Tree for treeDiagram with the values known at a step.
export function annotated(root, values, { short = true } = {}) {
  const conv = (n) => {
    const shown = n.attrs.filter((a) => `${n.id}.${a.name}` in values).map((a) => `${short && n.attrs.length === 1 ? "" : `${a.name}=`}${values[`${n.id}.${a.name}`]}`);
    const base = n.label ? (n.sym === "digit" ? n.label : `${n.sym} ${n.label}`) : n.sym;
    const label = shown.length && n.sym !== "digit" ? `${base} · ${shown.join(" ")}` : base;
    const leaf = !n.kids.length;
    return { id: n.id, label, state: leaf ? "matched" : n.attrs.length && n.attrs.every((a) => `${n.id}.${a.name}` in values) ? "expanded" : "open", kids: n.kids.map(conv) };
  };
  return conv(root);
}
