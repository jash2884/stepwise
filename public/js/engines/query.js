// Query processing: turn a small SQL query into its canonical relational
// algebra tree, then apply the textbook heuristic rules one at a time
// (Elmasri & Navathe, "Fundamentals of Database Systems", ch. 19;
// Silberschatz, Korth & Sudarshan, "Database System Concepts", ch. 16),
// estimating the size of every intermediate result from catalogue statistics.
//
// Trees are plain objects { id, op, kids, ... } with op one of
//   rel (a base relation), select (one condition, or several in the canonical
//   tree), cross (×), join (⋈ with conditions), project (π).
// Node ids stay the same from step to step, so the view can glide them.

export const CODE = [
  "T ← π_L(σ_C(R1 × R2 × … × Rn))  // canonical tree",
  "split σ_c1∧…∧ck into σ_c1(σ_c2(…σ_ck(…)))  // cascade",
  "for each condition c",
  "  move σ_c down to the lowest node that has all of c's attributes",
  "order the leaves: most restrictive first, never × when a join fits",
  "for each × with join conditions σ_c just above it",
  "  replace σ_c(A × B) with A ⋈_c B",
  "for each subtree below the root",
  "  add π keeping only the attributes needed higher up",
  "return T",
];

// --- Parsing --------------------------------------------------------------------

// One relation per line:  EMPLOYEE 2000: Ssn 2000, Bdate 50 [1950..2000], Dno 50
// name, number of tuples n_r, then each attribute with V(A, r) and an optional range.
export function parseCatalogue(text) {
  const rels = new Map();
  for (const raw of String(text).split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Za-z_]\w{0,19})\s+(\d+)\s*:\s*(.+)$/.exec(raw);
    if (!m) throw new Error(`Can't read "${raw}". Write NAME rows: attr V, attr V [min..max], …`);
    const [, name, n, rest] = m;
    if (rels.has(name.toLowerCase())) throw new Error(`${name} is listed twice.`);
    const attrs = new Map();
    for (const part of rest.split(",").map((x) => x.trim()).filter(Boolean)) {
      const a = /^([A-Za-z_]\w{0,19})\s+(\d+)(?:\s*\[\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*\])?$/.exec(part);
      if (!a) throw new Error(`${name}: can't read "${part}". Write an attribute name and V(A, r), e.g. Dno 50 or Salary 900 [20000..100000].`);
      const v = Number(a[2]);
      if (v < 1) throw new Error(`${name}.${a[1]}: V must be at least 1.`);
      const range = a[3] != null ? [Number(a[3]), Number(a[4])] : null;
      if (range && range[1] <= range[0]) throw new Error(`${name}.${a[1]}: the range must go from low to high.`);
      attrs.set(a[1], { name: a[1], v: Math.min(v, Math.max(1, Number(n))), range });
    }
    if (!attrs.size) throw new Error(`${name} needs at least one attribute.`);
    rels.set(name.toLowerCase(), { name, n: Number(n), attrs });
  }
  if (!rels.size) throw new Error("The catalogue is empty: add one line per relation.");
  if (rels.size > 8) throw new Error("Use at most 8 relations in the catalogue.");
  return rels;
}

const OPS = { "=": "=", "<": "<", ">": ">", "<=": "≤", ">=": "≥" };

export function parseQuery(text, cat) {
  const sql = String(text).replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/\s+/g, " ").trim().replace(/;$/, "");
  const m = /^SELECT (.+?) FROM (.+?)(?: WHERE (.+))?$/i.exec(sql);
  if (!m) throw new Error("Write the query as SELECT … FROM … WHERE … (WHERE is optional).");
  const rels = m[2].split(",").map((x) => x.trim()).map((name) => {
    const r = cat.get(name.toLowerCase());
    if (!r) throw new Error(`${name} isn't in the catalogue.`);
    return r.name;
  });
  if (new Set(rels).size !== rels.length) throw new Error("Each relation can appear once in FROM (aliases aren't supported).");
  if (rels.length > 5) throw new Error("Use at most 5 relations.");
  const relOf = (n) => cat.get(n.toLowerCase());
  const ref = (t) => {
    const q = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/.exec(t), u = /^([A-Za-z_]\w*)$/.exec(t);
    if (q) {
      const r = rels.find((x) => x.toLowerCase() === q[1].toLowerCase());
      if (!r) throw new Error(`${q[1]} isn't in FROM.`);
      const a = [...relOf(r).attrs.keys()].find((x) => x.toLowerCase() === q[2].toLowerCase());
      if (!a) throw new Error(`${r} has no attribute ${q[2]}.`);
      return { rel: r, attr: a };
    }
    if (!u) return null;
    const hits = rels.flatMap((r) => [...relOf(r).attrs.keys()].filter((a) => a.toLowerCase() === u[1].toLowerCase()).map((a) => ({ rel: r, attr: a })));
    if (!hits.length) throw new Error(`No relation in FROM has an attribute ${t}.`);
    if (hits.length > 1) throw new Error(`${t} is ambiguous: write ${hits.map((x) => `${x.rel}.${x.attr}`).join(" or ")}.`);
    return hits[0];
  };
  const select = m[1].trim() === "*" ? null : m[1].split(",").map((x) => x.trim()).map((t) => {
    const r = ref(t);
    if (!r) throw new Error(`Can't read the column "${t}".`);
    return r;
  });
  const conds = (m[3] ? m[3].split(/ AND /i) : []).map((c, i) => {
    const p = /^(.+?)\s*(<=|>=|=|<|>)\s*(.+)$/.exec(c.trim());
    if (!p) throw new Error(`Can't read the condition "${c.trim()}". Use =, <, >, <= or >=, joined by AND.`);
    const left = ref(p[1].trim());
    if (!left) throw new Error(`The left side of "${c.trim()}" must be an attribute.`);
    const rhs = p[3].trim();
    let right;
    if (/^-?\d+(\.\d+)?$/.test(rhs)) right = { value: Number(rhs) };
    else if (/^'[^']*'$/.test(rhs)) right = { value: rhs.slice(1, -1) };
    else right = ref(rhs);
    if (!right) throw new Error(`Can't read "${rhs}": use a number, 'text' or an attribute.`);
    return { id: i, left, op: p[2], right };
  });
  if (conds.length > 8) throw new Error("Use at most 8 conditions.");
  return { rels, select, conds };
}

// --- Display helpers ------------------------------------------------------------

export const refText = (r, q) => {
  if (!q) return `${r.rel}.${r.attr}`;
  const clash = q.rels.filter((x) => x !== r.rel).some((x) => q.attrsOf(x).includes(r.attr));
  return clash ? `${r.rel}.${r.attr}` : r.attr;
};
export function condText(c, q) {
  const right = "value" in c.right ? (typeof c.right.value === "string" ? `'${c.right.value}'` : String(c.right.value)) : refText(c.right, q);
  return `${refText(c.left, q)} ${OPS[c.op]} ${right}`;
}
export const condRels = (c) => [...new Set([c.left.rel, ...("value" in c.right ? [] : [c.right.rel])])];

export function fmtN(x) {
  if (!Number.isFinite(x)) return "∞";
  if (x >= 1e9) {
    const e = Math.floor(Math.log10(x)), sup = (n) => [...String(n)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("");
    return `${(x / 10 ** e).toFixed(1)} × 10${sup(e)}`;
  }
  if (x >= 1e6) return `${(x / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 1 })} M`;
  if (x >= 100) return Math.round(x).toLocaleString("en-GB");
  return String(Math.round(x * 10) / 10);
}

// --- Estimates -----------------------------------------------------------------

export function selectivity(c, cat) {
  const A = cat.get(c.left.rel.toLowerCase()).attrs.get(c.left.attr);
  if ("value" in c.right) {
    if (c.op === "=") return { sel: 1 / A.v, why: `1 / V(${c.left.attr}, ${c.left.rel}) = 1 / ${A.v}` };
    const v = c.right.value;
    if (A.range && typeof v === "number") {
      const [lo, hi] = A.range, span = hi - lo;
      const below = Math.min(1, Math.max(0, (v - lo) / span));
      const sel = c.op === "<" || c.op === "<=" ? below : 1 - below;
      const f = c.op === "<" || c.op === "<=" ? `(${v} − ${lo}) / (${hi} − ${lo})` : `(${hi} − ${v}) / (${hi} − ${lo})`;
      return { sel, why: `${f} = ${fmtN(sel * 100)}%` };
    }
    return { sel: 1 / 3, why: "no range known, so assume 1/3" };
  }
  const B = cat.get(c.right.rel.toLowerCase()).attrs.get(c.right.attr);
  if (c.op === "=") {
    const big = Math.max(A.v, B.v);
    return { sel: 1 / big, why: `1 / max(V(${c.left.attr}, ${c.left.rel}), V(${c.right.attr}, ${c.right.rel})) = 1 / ${big}` };
  }
  return { sel: 1 / 3, why: "a comparison between attributes: assume 1/3" };
}

// Estimated tuples out of each node (a Map id → size).
export function estimate(tree, cat) {
  const out = new Map();
  const walk = (n) => {
    const kids = n.kids.map(walk);
    let s;
    if (n.op === "rel") s = cat.get(n.rel.toLowerCase()).n;
    else if (n.op === "select" || n.op === "join") s = (n.op === "join" ? kids[0] * kids[1] : kids[0]) * n.conds.reduce((p, c) => p * selectivity(c, cat).sel, 1);
    else if (n.op === "cross") s = kids[0] * kids[1];
    else s = kids[0]; // π keeps duplicates (SQL without DISTINCT)
    out.set(n.id, s);
    return s;
  };
  walk(tree);
  return out;
}

// Tuples produced by every σ, × and ⋈: the work an unpipelined plan does.
export function cost(tree, cat) {
  const sizes = estimate(tree, cat);
  let total = 0;
  const walk = (n) => { if (["select", "cross", "join"].includes(n.op)) total += sizes.get(n.id); n.kids.forEach(walk); };
  walk(tree);
  return total;
}

// --- Tree helpers ---------------------------------------------------------------

const clone = (n) => ({ ...n, conds: n.conds ? [...n.conds] : undefined, attrs: n.attrs ? [...n.attrs] : undefined, kids: n.kids.map(clone) });
export const relsOf = (n) => (n.op === "rel" ? [n.rel] : n.kids.flatMap(relsOf));
const covers = (n, c) => { const r = relsOf(n); return condRels(c).every((x) => r.includes(x)); };
export function walkNodes(n, f, parent = null) { f(n, parent); n.kids.forEach((k) => walkNodes(k, f, n)); }

export function nodeLabel(n, q) {
  if (n.op === "rel") return n.rel;
  if (n.op === "cross") return "×";
  if (n.op === "join") return `⋈ ${n.conds.map((c) => condText(c, q)).join(" ∧ ")}`;
  if (n.op === "select") return `σ ${n.conds.map((c) => condText(c, q)).join(" ∧ ")}`;
  return `π ${n.attrs.map((a) => refText(a, q)).join(", ")}`;
}

// Attributes available at a node's output.
export function outputAttrs(n, q) {
  if (n.op === "rel") return q.attrsOf(n.rel).map((attr) => ({ rel: n.rel, attr }));
  if (n.op === "project") return n.attrs;
  return n.kids.flatMap((k) => outputAttrs(k, q));
}

// Every condition and projection only uses attributes its input provides.
export function validate(tree, q) {
  const errors = [];
  walkNodes(tree, (n) => {
    if (!n.kids.length) return;
    const have = new Set(n.kids.flatMap((k) => outputAttrs(k, q)).map((a) => `${a.rel}.${a.attr}`));
    const need = [...(n.conds ?? []).flatMap((c) => [c.left, ...("value" in c.right ? [] : [c.right])]), ...(n.attrs ?? [])];
    for (const a of need) if (!have.has(`${a.rel}.${a.attr}`)) errors.push(`${n.id} needs ${a.rel}.${a.attr}`);
    if ((n.op === "cross" || n.op === "join") && n.kids.length !== 2) errors.push(`${n.id} needs two inputs`);
  });
  return errors;
}

// --- The optimiser --------------------------------------------------------------

export function optimise(queryText, catalogueText) {
  const cat = parseCatalogue(catalogueText);
  const parsed = parseQuery(queryText, cat);
  const q = { ...parsed, attrsOf: (r) => [...cat.get(r.toLowerCase()).attrs.keys()] };
  const { rels, conds } = q;
  const steps = [];
  const L = q.select ?? null;
  const ctext = (c) => condText(c, q);

  // Canonical tree.
  let body = { id: `R:${rels[0]}`, op: "rel", rel: rels[0], kids: [] };
  rels.slice(1).forEach((r, k) => { body = { id: `X:${k + 1}`, op: "cross", kids: [body, { id: `R:${r}`, op: "rel", rel: r, kids: [] }] }; });
  if (conds.length) body = { id: conds.length === 1 ? `S:${conds[0].id}` : "S:all", op: "select", conds: [...conds], kids: [body] };
  const wrap = (b) => (L ? { id: "P:top", op: "project", attrs: L, kids: [b] } : b);
  let tree = wrap(body);
  const canonicalCost = cost(tree, cat);

  const snap = (line, note, extra = {}) => {
    const sizes = estimate(tree, cat), c = cost(tree, cat);
    steps.push({ tree: clone(tree), sizes, cost: c, line, note, ...extra, vars: { ...extra.vars, "work (tuples)": Math.round(c) } });
  };
  const n0 = rels.map((r) => `${r} ${fmtN(cat.get(r.toLowerCase()).n)}`).join(" × ");
  snap(1, `The canonical tree: take the product of every relation in FROM (${n0} = ${fmtN(rels.reduce((p, r) => p * cat.get(r.toLowerCase()).n, 1))} tuples), apply the whole WHERE clause to it, then project${L ? "" : " (SELECT *: nothing to project)"}. It's correct but hugely wasteful.`, { vars: { relations: rels.length, conditions: conds.length } });

  const below = () => (L ? tree.kids[0] : tree);
  const setBelow = (b) => { if (L) tree.kids[0] = b; else tree = b; };

  // 1. Cascade of selections.
  if (conds.length > 1) {
    let chain = below().kids[0];
    for (let i = conds.length - 1; i >= 0; i--) chain = { id: `S:${conds[i].id}`, op: "select", conds: [conds[i]], kids: [chain] };
    setBelow(chain);
    snap(2, `Split the conjunction into a cascade of ${conds.length} single-condition selections, σ_c1∧c2(R) = σ_c1(σ_c2(R)). Each one can now move on its own.`, { lit: conds.map((c) => `S:${c.id}`), vars: { k: conds.length } });
  }

  // 2. Push each selection down.
  const removeSel = (n, id) => { n.kids = n.kids.map((k) => (k.id === id ? k.kids[0] : k)); n.kids.forEach((k) => removeSel(k, id)); };
  for (const c of conds) {
    const id = `S:${c.id}`;
    const sizesBefore = estimate(tree, cat);
    let oldSel = null;
    walkNodes(tree, (n) => { if (n.id === id) oldSel = n; });
    const beforeIn = sizesBefore.get(oldSel.kids[0].id);
    const holder = { kids: [tree] };
    removeSel(holder, id);
    tree = holder.kids[0];
    const sel = { id, op: "select", conds: [c], kids: [] };
    // Walk down while a child still has every relation the condition needs.
    const sink = (n) => {
      const k = n.kids.findIndex((x) => covers(x, c));
      if (k < 0) return null;
      const deeper = sink(n.kids[k]);
      if (!deeper) { sel.kids = [n.kids[k]]; n.kids[k] = sel; }
      return true;
    };
    const top = { kids: [tree], op: "root" };
    sink(top);
    tree = top.kids[0];
    const sizes = estimate(tree, cat), inSize = sizes.get(sel.kids[0].id), outSize = sizes.get(id);
    const rs = condRels(c), s = selectivity(c, cat);
    const where = sel.kids[0].op === "rel" || (sel.kids[0].op === "select" && relsOf(sel.kids[0]).length === 1)
      ? `straight onto ${rs[0]}` : `onto the × that first brings ${rs.join(" and ")} together`;
    snap([3, 4], rs.length === 1
      ? `σ ${ctext(c)} only mentions ${rs[0]}'s attributes, so it can be applied ${where}, before any product: ${fmtN(inSize)} → ~${fmtN(outSize)} tuples (selectivity ${s.why}).${beforeIn !== inSize ? ` Up in the cascade it had to scan ~${fmtN(beforeIn)} tuples.` : ""}`
      : `σ ${ctext(c)} compares ${rs.join(" and ")}, so it can't go lower than the point where both are available: it moves ${where}. ${fmtN(inSize)} → ~${fmtN(outSize)} tuples (selectivity ${s.why}).`,
    { lit: [id], vars: { c: ctext(c), relations: rs, "input size": inSize, "output size": outSize, selectivity: s.sel } });
  }

  // 3. Reorder the leaves (left-deep), most restrictive first.
  if (rels.length > 1) {
    const branches = new Map(), joinSels = [];
    const collect = (n) => {
      if (relsOf(n).length === 1) { branches.set(relsOf(n)[0], n); return; }
      if (n.op === "select") joinSels.push(n);
      n.kids.forEach(collect);
    };
    collect(below());
    const sizeOf = (n) => estimate(n, cat).get(n.id);
    const joinCondsBetween = (setA, r) => joinSels.map((s) => s.conds[0]).filter((c) => { const cr = condRels(c); return cr.includes(r) && cr.every((x) => x === r || setA.includes(x)) && cr.some((x) => setA.includes(x)); });
    const before = rels.slice(), order = [];
    const restSize = new Map(rels.map((r) => [r, sizeOf(branches.get(r))]));
    order.push([...rels].sort((a, b) => restSize.get(a) - restSize.get(b) || rels.indexOf(a) - rels.indexOf(b))[0]);
    let curSize = restSize.get(order[0]);
    const why = [`start with ${order[0]} (~${fmtN(curSize)} tuples after its selections, the smallest)`];
    while (order.length < rels.length) {
      const left = rels.filter((r) => !order.includes(r));
      const options = left.map((r) => {
        const cs = joinCondsBetween(order, r);
        const size = curSize * restSize.get(r) * cs.reduce((p, c) => p * selectivity(c, cat).sel, 1);
        return { r, cs, size };
      });
      const joined = options.filter((o) => o.cs.length);
      const pool = joined.length ? joined : options;
      pool.sort((a, b) => a.size - b.size || rels.indexOf(a.r) - rels.indexOf(b.r));
      const pick = pool[0];
      why.push(pick.cs.length ? `then ${pick.r} (it joins on ${pick.cs.map(ctext).join(" ∧ ")}, giving ~${fmtN(pick.size)})` : `then ${pick.r} (no join condition links it, so a × is unavoidable: ~${fmtN(pick.size)})`);
      order.push(pick.r);
      curSize = pick.size;
    }
    // Rebuild: X:k = (previous) × branch, with its join selections on top.
    let cur = branches.get(order[0]);
    const placed = new Set();
    order.slice(1).forEach((r, k) => {
      cur = { id: `X:${k + 1}`, op: "cross", kids: [cur, branches.get(r)] };
      const have = order.slice(0, k + 2);
      for (const s of joinSels) {
        if (placed.has(s.id) || !condRels(s.conds[0]).every((x) => have.includes(x))) continue;
        placed.add(s.id);
        cur = { ...s, kids: [cur] };
      }
    });
    const same = order.every((r, i) => r === before[i]);
    setBelow(cur);
    snap(5, same
      ? `Check the join order: ${why.join(", ")}. FROM already lists them in this order, so nothing moves.`
      : `Reorder the leaves so the most restrictive comes first and every step is a join rather than a ×: ${why.join(", ")}. New order: ${order.join(", ")}.`,
    { lit: order.map((r) => `R:${r}`), vars: { order, "previous order": before } });
  }

  // 4. σ over × becomes ⋈.
  for (let k = 1; k < rels.length; k++) {
    const id = `X:${k}`;
    let parent = null, chainTop = null;
    const conds2 = [];
    // Find the run of selections sitting directly on X:k.
    walkNodes({ id: "root", kids: [tree] }, (n) => {
      if (chainTop || !n.kids.length) return;
      for (let j = 0; j < n.kids.length; j++) {
        let m = n.kids[j];
        const run = [];
        while (m.op === "select") { run.push(m); m = m.kids[0]; }
        if (m.id === id && run.length) { parent = n; chainTop = j; conds2.push(...run.flatMap((s) => s.conds)); return; }
      }
    });
    if (!parent) {
      snap(6, `${id.replace("X:", "× number ")} has no join condition above it, so it stays a Cartesian product: every pair of tuples is kept.`, { lit: [id], vars: { k } });
      continue;
    }
    let m = parent.kids[chainTop];
    while (m.op === "select") m = m.kids[0];
    const before = estimate(tree, cat).get(id);
    parent.kids[chainTop] = { id, op: "join", conds: conds2, kids: m.kids };
    if (parent.id === "root") tree = parent.kids[0];
    const after = estimate(tree, cat).get(id);
    snap([6, 7], `σ ${conds2.map(ctext).join(" ∧ ")} sits directly on a ×, so together they are a join: ⋈ ${conds2.map(ctext).join(" ∧ ")}. A join algorithm never builds the ${fmtN(before)}-tuple product; it goes straight to the ~${fmtN(after)} matching pairs.`,
      { lit: [id], vars: { k, conditions: conds2.length, "× size": before, "⋈ size": after } });
  }

  // 5. Push projections down.
  if (L && rels.length > 1) {
    const need = new Map(); // node id → attributes its parent needs from it
    const key = (a) => `${a.rel}.${a.attr}`;
    const uniq = (xs) => [...new Map(xs.map((a) => [key(a), a])).values()];
    const fill = (n, needed) => {
      need.set(n.id, needed);
      const own = [...(n.conds ?? []).flatMap((c) => [c.left, ...("value" in c.right ? [] : [c.right])]), ...(n.op === "project" ? n.attrs : [])];
      const passDown = n.op === "project" ? uniq(n.attrs) : uniq([...needed, ...own]);
      n.kids.forEach((k) => { const r = relsOf(k); fill(k, passDown.filter((a) => r.includes(a.rel))); });
    };
    fill(tree, L);
    // Branch tops (a relation and its selections) and joins below the top one.
    const targets = [];
    walkNodes({ id: "root", op: "root", kids: [tree] }, (n, parent) => {
      if (!parent || n.op === "project" || parent.op === "project") return;
      if (parent.op === "select" && relsOf(n).length === 1) return; // not the top of the branch
      if (relsOf(n).length === 1 || n.op === "join" || n.op === "cross") targets.push({ n, parent });
    });
    let added = 0;
    for (const { n, parent } of targets.reverse()) {
      const keep = need.get(n.id), all = outputAttrs(n, q);
      if (keep.length >= all.length || !keep.length) continue;
      const p = { id: `P:${n.id}`, op: "project", attrs: keep, kids: [n] };
      parent.kids[parent.kids.indexOf(n)] = p;
      if (parent.id === "root") tree = p;
      added++;
      const dropped = all.filter((a) => !keep.some((b) => key(b) === key(a)));
      snap([8, 9], `Above ${relsOf(n).length === 1 ? relsOf(n)[0] : nodeLabel(n, q)}, only ${keep.map((a) => refText(a, q)).join(", ")} ${keep.length === 1 ? "is" : "are"} used higher up (in the output or a join condition), so project the rest away: ${dropped.map((a) => refText(a, q)).join(", ")}. Same number of tuples, but each one is narrower, so fewer blocks to read and write.`,
        { lit: [p.id], vars: { keep: keep.map((a) => refText(a, q)), drop: dropped.length } });
    }
    if (!added) snap(8, "Every attribute is needed higher up, so there's nothing to project away early.", {});
  }

  snap(10, `Done. Estimated work fell from ${fmtN(canonicalCost)} to ${fmtN(cost(tree, cat))} intermediate tuples, and the answer (about ${fmtN(estimate(tree, cat).get(tree.id))} tuples) is exactly the same.`, { done: true, vars: { "canonical work": Math.round(canonicalCost) } });
  return { q, cat, steps, canonical: steps[0].tree, tree, canonicalCost, finalCost: cost(tree, cat) };
}

// --- Evaluation on sample data (used by the tests) ------------------------------

const test = (a, op, b) => (op === "=" ? a === b : op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b);

export function evaluate(tree, data, q) {
  const get = (row, r) => row[`${r.rel}.${r.attr}`];
  const holds = (row, c) => test(get(row, c.left), c.op, "value" in c.right ? c.right.value : get(row, c.right));
  const ev = (n) => {
    if (n.op === "rel") return data[n.rel].map((t) => Object.fromEntries(q.attrsOf(n.rel).map((a) => [`${n.rel}.${a}`, t[a]])));
    const kids = n.kids.map(ev);
    if (n.op === "select") return kids[0].filter((row) => n.conds.every((c) => holds(row, c)));
    if (n.op === "cross" || n.op === "join") {
      const out = [];
      for (const a of kids[0]) for (const b of kids[1]) { const row = { ...a, ...b }; if (n.op === "cross" || n.conds.every((c) => holds(row, c))) out.push(row); }
      return out;
    }
    return kids[0].map((row) => Object.fromEntries(n.attrs.map((a) => [`${a.rel}.${a.attr}`, get(row, a)])));
  };
  return ev(tree);
}

// --- Examples and random queries ------------------------------------------------

export const EXAMPLES = {
  aquarius: {
    name: "Employees on project Aquarius (Elmasri & Navathe)",
    query: "SELECT Lname FROM EMPLOYEE, WORKS_ON, PROJECT WHERE Pname = 'Aquarius' AND Pnumber = Pno AND Essn = Ssn AND Bdate > 1957",
    catalogue: "EMPLOYEE 2000: Ssn 2000, Lname 1500, Bdate 50 [1950..2000], Dno 50\nWORKS_ON 6000: Essn 2000, Pno 200, Hours 40 [0..40]\nPROJECT 200: Pnumber 200, Pname 200, Plocation 20, Dnum 50",
  },
  music: {
    name: "Music instructors and their courses (Silberschatz)",
    query: "SELECT name, title FROM instructor, teaches, course WHERE instructor.dept_name = 'Music' AND instructor.ID = teaches.ID AND teaches.course_id = course.course_id",
    catalogue: "instructor 50: ID 50, name 48, dept_name 10, salary 45 [40000..120000]\nteaches 100: ID 40, course_id 80, sec_id 3, semester 2, year 5 [2017..2022]\ncourse 200: course_id 200, title 180, dept_name 20, credits 4 [1..4]",
  },
  research: {
    name: "Who works for Research? (Elmasri & Navathe Q1)",
    query: "SELECT Fname, Lname, Address FROM EMPLOYEE, DEPARTMENT WHERE Dname = 'Research' AND Dnumber = Dno",
    catalogue: "EMPLOYEE 2000: Ssn 2000, Fname 1200, Lname 1500, Address 1900, Salary 900 [20000..100000], Dno 50\nDEPARTMENT 50: Dnumber 50, Dname 50, Mgr_ssn 50",
  },
  cross: {
    name: "A join order that avoids a × (four relations)",
    query: "SELECT S.sname FROM S, SP, P, J WHERE S.city = 'London' AND S.sno = SP.sno AND SP.pno = P.pno AND P.colour = 'Red' AND J.jno = SP.jno AND J.city = 'Paris'",
    catalogue: "S 500: sno 500, sname 480, city 25, status 10 [0..100]\nSP 20000: sno 500, pno 1000, jno 200, qty 300 [1..1000]\nP 1000: pno 1000, pname 900, colour 8, weight 50 [1..50]\nJ 200: jno 200, jname 200, city 25",
  },
};

export function randomQuery(r = Math.random) {
  const names = ["R", "S", "T", "U"].slice(0, 2 + Math.floor(r() * 3));
  const lines = [], attrs = {};
  names.forEach((name, i) => {
    const n = 2 + Math.floor(r() * 4);
    const own = [`${name.toLowerCase()}${1}`, `${name.toLowerCase()}${2}`, ...(r() < 0.5 ? [`${name.toLowerCase()}3`] : [])];
    attrs[name] = own;
    lines.push(`${name} ${10 * n}: ${own.map((a, j) => `${a} ${2 + ((i + j) % 4)}${j === 1 ? " [0..4]" : ""}`).join(", ")}`);
  });
  const conds = [];
  for (let i = 1; i < names.length; i++) {
    const other = names[Math.floor(r() * i)];
    if (r() < 0.85) conds.push(`${names[i]}.${attrs[names[i]][0]} = ${other}.${attrs[other][0]}`);
  }
  for (const name of names) if (r() < 0.6) conds.push(r() < 0.5 ? `${name}.${attrs[name][1]} = ${Math.floor(r() * 4)}` : `${name}.${attrs[name][1]} ${r() < 0.5 ? "<" : ">="} ${1 + Math.floor(r() * 3)}`);
  const sel = names.filter(() => r() < 0.6).map((n) => `${n}.${attrs[n][attrs[n].length - 1]}`);
  if (!sel.length) sel.push(`${names[0]}.${attrs[names[0]][0]}`);
  return {
    query: `SELECT ${sel.join(", ")} FROM ${names.join(", ")}${conds.length ? ` WHERE ${conds.join(" AND ")}` : ""}`,
    catalogue: lines.join("\n"),
    attrs,
  };
}

export function randomData(attrs, r = Math.random) {
  return Object.fromEntries(Object.entries(attrs).map(([rel, as]) => [rel,
    Array.from({ length: Math.floor(r() * 5) }, () => Object.fromEntries(as.map((a) => [a, Math.floor(r() * 4)])))]));
}
