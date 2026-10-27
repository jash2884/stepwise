// Functional dependencies and normalisation, the way exam questions pose them:
// attributes are single letters (A-Z) and FDs look like "AB -> C, D".
// Attribute sets are kept as sorted strings ("ABD") so they're easy to compare and show.

const norm = (s) => [...new Set(s)].sort().join("");
const union = (a, b) => norm(a + b);
const minus = (a, b) => [...a].filter((x) => !b.includes(x)).join("");
const subset = (a, b) => [...a].every((x) => b.includes(x));
const show = (s) => s || "∅";
export const fdText = ({ lhs, rhs }) => `${lhs} → ${rhs}`;

export function parseAttrs(text) {
  const attrs = norm(String(text).toUpperCase().replace(/[^A-Z]/g, ""));
  if (!attrs) throw new Error("List the relation's attributes, e.g. ABCDE.");
  if (attrs.length > 10) throw new Error("Use at most 10 attributes.");
  return attrs;
}

export function parseFds(text, attrs) {
  const fds = [];
  for (const line of String(text).split(/[\n;]+/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*(?:->|→|=>|-)\s*(.+)$/.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write dependencies like AB -> C.`);
    const lhs = norm(m[1].toUpperCase().replace(/[^A-Z]/g, "")), rhs = norm(m[2].toUpperCase().replace(/[^A-Z]/g, ""));
    if (!lhs || !rhs) throw new Error(`"${line}" needs attributes on both sides.`);
    const unknown = minus(lhs + rhs, attrs);
    if (unknown) throw new Error(`"${line}" uses ${[...unknown].join(", ")}, which isn't in the relation.`);
    fds.push({ lhs, rhs });
  }
  if (fds.length > 12) throw new Error("Use at most 12 dependencies.");
  return fds;
}

export function closure(x, fds) {
  let result = norm(x);
  const steps = [{ result, note: `Start with ${show(result)}.` }];
  for (let changed = true; changed;) {
    changed = false;
    for (const fd of fds) {
      if (subset(fd.lhs, result) && !subset(fd.rhs, result)) {
        const added = minus(fd.rhs, result);
        result = union(result, fd.rhs);
        steps.push({ result, fd, added, note: `${fdText(fd)} applies because ${fd.lhs} is already in the set, so add ${added}: ${result}.` });
        changed = true;
      }
    }
  }
  return { closure: result, steps };
}

const subsets = (s) => {
  const out = [];
  for (let mask = 0; mask < 1 << s.length; mask++) out.push([...s].filter((_, i) => mask & (1 << i)).join(""));
  return out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
};

export function candidateKeys(attrs, fds) {
  const rhsAll = norm(fds.map((f) => f.rhs).join("")), lhsAll = norm(fds.map((f) => f.lhs).join(""));
  // Attributes never on a right-hand side can't be derived: every key needs them.
  const core = minus(attrs, rhsAll);
  // Attributes only ever on the right (never on the left) are never in a key.
  const middle = [...attrs].filter((a) => rhsAll.includes(a) && lhsAll.includes(a)).join("");
  const keys = [];
  const coreClosure = closure(core, fds).closure;
  if (coreClosure === attrs) keys.push(core);
  else {
    for (const extra of subsets(middle)) {
      if (!extra) continue;
      const k = union(core, extra);
      if (keys.some((key) => subset(key, k))) continue;
      if (closure(k, fds).closure === attrs) keys.push(k);
    }
  }
  const prime = norm(keys.join(""));
  const reasoning = [
    `Never on a right-hand side, so in every key: ${show(core)}.`,
    `${show(core)}+ = ${coreClosure}${coreClosure === attrs ? ", which is everything, so it is the only key." : `, which isn't everything, so try adding attributes from ${show(middle)} (those on both sides).`}`,
    `Candidate key${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}. Prime attributes: ${prime}.`,
  ];
  return { keys, prime, core, reasoning };
}

// Split right-hand sides into single attributes and drop trivial ones.
const singletons = (fds) => fds.flatMap(({ lhs, rhs }) => [...minus(rhs, lhs)].map((a) => ({ lhs, rhs: a })));

export function normalForm(attrs, fds) {
  const { keys, prime } = candidateKeys(attrs, fds);
  const isSuperkey = (x) => closure(x, fds).closure === attrs;
  const single = singletons(fds);
  const violations = { "2NF": [], "3NF": [], BCNF: [] };

  for (const key of keys) {
    for (const part of subsets(key)) {
      if (part === key) continue;
      const dependsOnPart = minus(closure(part, fds).closure, part);
      for (const a of dependsOnPart) {
        if (!prime.includes(a) && !violations["2NF"].some((v) => v.lhs === part && v.rhs === a)) {
          violations["2NF"].push({ lhs: part || "∅", rhs: a, why: `${a} is non-prime and depends on ${show(part)}, only part of key ${key} (a partial dependency).` });
        }
      }
    }
  }
  for (const fd of single) {
    if (isSuperkey(fd.lhs)) continue;
    violations.BCNF.push({ ...fd, why: `${fd.lhs} isn't a superkey.` });
    if (!prime.includes(fd.rhs)) violations["3NF"].push({ ...fd, why: `${fd.lhs} isn't a superkey and ${fd.rhs} isn't prime.` });
  }
  const form = !violations["2NF"].length ? (!violations["3NF"].length ? (!violations.BCNF.length ? "BCNF" : "3NF") : "2NF") : "1NF";
  return { form, keys, prime, violations };
}

export function minimalCover(fds) {
  const steps = [];
  let f = singletons(fds);
  steps.push({ fds: f, note: `Split every right-hand side into single attributes: ${f.map(fdText).join(", ")}.` });
  // Remove extraneous left-hand attributes.
  f = f.map((fd) => {
    let lhs = fd.lhs;
    for (const a of fd.lhs) {
      const smaller = minus(lhs, a);
      if (smaller && closure(smaller, f).closure.includes(fd.rhs)) {
        steps.push({ note: `In ${lhs} → ${fd.rhs}, ${a} is extraneous: ${smaller}+ already contains ${fd.rhs}.` });
        lhs = smaller;
      }
    }
    return { lhs, rhs: fd.rhs };
  });
  f = f.filter((fd, i) => f.findIndex((g) => g.lhs === fd.lhs && g.rhs === fd.rhs) === i);
  // Remove redundant dependencies.
  for (let i = 0; i < f.length;) {
    const rest = f.filter((_, j) => j !== i);
    if (closure(f[i].lhs, rest).closure.includes(f[i].rhs)) {
      steps.push({ note: `${fdText(f[i])} is redundant: it follows from the others.` });
      f = rest;
    } else i++;
  }
  steps.push({ fds: f, note: `Minimal cover: ${f.map(fdText).join(", ")}.` });
  return { cover: f, steps };
}

export function synthesize3NF(attrs, fds) {
  const { cover } = minimalCover(fds);
  const groups = new Map();
  for (const fd of cover) groups.set(fd.lhs, union(groups.get(fd.lhs) ?? fd.lhs, fd.rhs));
  let relations = [...groups.values()];
  const steps = [...groups].map(([lhs, r]) => ({ note: `From the dependencies with left side ${lhs}: R(${r}).` }));
  const { keys } = candidateKeys(attrs, fds);
  if (!relations.some((r) => keys.some((k) => subset(k, r)))) {
    relations.push(keys[0]);
    steps.push({ note: `No relation contains a candidate key, so add R(${keys[0]}) to keep the join lossless.` });
  }
  const covered = norm(relations.join(""));
  if (covered !== attrs) {
    const missing = minus(attrs, covered);
    relations.push(missing);
    steps.push({ note: `${missing} appears in no dependency, so keep it in its own relation R(${missing}).` });
  }
  const before = relations.length;
  relations = relations.filter((r, i) => !relations.some((s, j) => j !== i && subset(r, s) && (r !== s || j < i)));
  if (relations.length < before) steps.push({ note: "Remove any relation contained in another." });
  return { relations, steps };
}

export function decomposeBCNF(attrs, fds) {
  const steps = [];
  const result = [];
  const queue = [attrs];
  while (queue.length) {
    const r = queue.shift();
    let violation = null;
    for (const x of subsets(r)) {
      if (!x || x === r) continue;
      const xc = closure(x, fds).closure;
      const y = minus([...xc].filter((a) => r.includes(a)).join(""), x);
      if (y && !subset(r, xc)) { violation = { x, y }; break; }
    }
    if (!violation) {
      result.push(r);
      steps.push({ note: `R(${r}) is in BCNF.` });
      continue;
    }
    const r1 = union(violation.x, violation.y), r2 = minus(r, violation.y);
    steps.push({ note: `R(${r}) violates BCNF: ${violation.x} → ${violation.y} holds but ${violation.x} isn't a superkey of R(${r}). Split into R(${r1}) and R(${r2}).` });
    queue.push(r1, r2);
  }
  // Dependency preservation: does the union of the projections imply every original FD?
  const projected = result.flatMap((r) => subsets(r).filter((x) => x && x !== r).flatMap((x) => {
    const y = minus([...closure(x, fds).closure].filter((a) => r.includes(a)).join(""), x);
    return y ? [{ lhs: x, rhs: y }] : [];
  }));
  const lost = singletons(fds).filter((fd) => !closure(fd.lhs, projected).closure.includes(fd.rhs));
  steps.push({ note: lost.length ? `The decomposition is lossless, but it does not preserve ${lost.map(fdText).join(", ")}.` : "The decomposition is lossless and preserves every dependency." });
  return { relations: result, steps, lost };
}

export function randomSchema(r = Math.random) {
  const letters = "ABCDEF".slice(0, 5 + Math.floor(r() * 2));
  const pick = () => letters[Math.floor(r() * letters.length)];
  const fds = [];
  const count = 3 + Math.floor(r() * 2);
  while (fds.length < count) {
    const lhs = norm(r() < 0.4 ? pick() + pick() : pick());
    const rhs = pick();
    if (lhs.includes(rhs) || fds.some((f) => f.lhs === lhs && f.rhs === rhs)) continue;
    fds.push({ lhs, rhs });
  }
  return { attrs: letters, fds };
}

export const sameSet = (a, b) => norm(String(a).toUpperCase().replace(/[^A-Z]/g, "")) === norm(String(b).toUpperCase().replace(/[^A-Z]/g, ""));

// --- Step-by-step traces with pseudocode -------------------------------------
// trace(algo, attrs, fds, x) returns steps carrying `line`, `vars`, `note` and
// what the view draws: `set` (attributes lit), `added`, `fdState` (one mark per
// dependency) and `rels` (relations so far).

export const CODE = {
  closure: [
    "closure(X, F):",
    "  result ← X",
    "  repeat",
    "    for each FD α → β in F",
    "      if α ⊆ result then result ← result ∪ β",
    "  until result doesn't change",
    "  return result  // X is a superkey iff result = R",
  ],
  keys: [
    "core ← attributes on no right-hand side  // in every key",
    "if core⁺ = R then core is the only key; stop",
    "middle ← attributes on both sides  // right-only ones never help",
    "for each subset S of middle, smallest first",
    "  if core ∪ S contains a key found already then skip it",
    "  if (core ∪ S)⁺ = R then core ∪ S is a candidate key",
    "prime ← every attribute in some candidate key",
  ],
  nf: [
    "for each non-trivial X → A (one attribute on the right)",
    "  if X⁺ = R then X is a superkey: fine for BCNF and 3NF",
    "  else BCNF is violated",
    "    if A is prime then 3NF still holds",
    "    else 3NF is violated too",
    "for each candidate key K and proper subset P of K",
    "  if P⁺ holds a non-prime attribute then 2NF is violated",
  ],
  cover: [
    "F ← split every right-hand side into single attributes",
    "for each α → A in F, for each B in α",
    "  if A ∈ (α − B)⁺ then B is extraneous: drop it",
    "for each f in F",
    "  if f follows from F − {f} then remove f  // redundant",
    "return F",
  ],
  three: [
    "Fc ← a minimal cover of F",
    "for each left side α in Fc: add R(α ∪ every β with α → β)",
    "if no relation contains a candidate key then add one",
    "put any attribute not used yet in a relation of its own",
    "remove relations contained in another",
  ],
  bcnf: [
    "result ← {R}",
    "while some Rᵢ in result is not in BCNF",
    "  find X → Y on Rᵢ (Y = X⁺ ∩ Rᵢ − X) with X not a superkey of Rᵢ",
    "  replace Rᵢ by (X ∪ Y) and (Rᵢ − Y)  // lossless: they share X, X → Y",
    "check which dependencies are preserved",
  ],
};

export const ALGOS = {
  closure: "Attribute closure X⁺",
  keys: "Candidate keys",
  nf: "Normal form check",
  cover: "Minimal cover",
  three: "3NF synthesis",
  bcnf: "BCNF decomposition",
};

export function trace(algo, attrs, fds, x = "") {
  const steps = [];
  const fdState = (marks = {}) => fds.map((f, i) => ({ text: fdText(f), mark: marks[i] ?? "" }));
  const push = (line, note, extra = {}) => steps.push({ line, note, set: "", added: "", fdState: null, rels: null, vars: {}, ...extra });

  if (algo === "closure") {
    const X = norm(x || attrs[0]);
    let result = X;
    const marks = {};
    push(2, `Start with result = ${result}: X always determines itself.`, { set: result, fdState: fdState(), vars: { X, result } });
    for (let pass = 1, changed = true; changed; pass++) {
      changed = false;
      fds.forEach((fd, i) => {
        const missing = minus(fd.lhs, result);
        if (missing) {
          push(5, `${fdText(fd)}: ${[...missing].join(", ")} ${missing.length > 1 ? "aren't" : "isn't"} in ${result} yet, so it can't fire (yet).`, { set: result, fd: i, fdState: fdState({ ...marks, [i]: "skip hot" }), vars: { X, result, pass, "α": fd.lhs, "β": fd.rhs, "α ⊆ result": false } });
          return;
        }
        const added = minus(fd.rhs, result);
        if (!added) {
          marks[i] = "done";
          push(5, `${fdText(fd)}: ${fd.lhs} ⊆ ${result}, but ${fd.rhs} is already there, so nothing new.`, { set: result, fd: i, fdState: fdState({ ...marks, [i]: "done hot" }), vars: { X, result, pass, "α": fd.lhs, "β": fd.rhs, "α ⊆ result": true } });
          return;
        }
        result = union(result, fd.rhs);
        marks[i] = "done";
        changed = true;
        push(5, `${fdText(fd)} fires: everything in ${fd.lhs} is already determined by ${X}, so (by transitivity) ${X} determines ${added} too. result = ${result}.`, { set: result, added, fd: i, fdState: fdState({ ...marks, [i]: "fire hot" }), vars: { X, result, pass, "α": fd.lhs, "β": fd.rhs, "α ⊆ result": true } });
      });
      push(6, changed ? `Pass ${pass} added something, so scan the dependencies again: one that couldn't fire before might fire now.` : `Pass ${pass} added nothing, so the closure is complete.`, { set: result, fdState: fdState(marks), vars: { X, result, pass, changed } });
    }
    push(7, `${X}⁺ = ${result}.${result === attrs ? ` That's every attribute of R, so ${X} is a superkey.` : ` It's missing ${minus(attrs, result)}, so ${X} is not a superkey.`}`, { set: result, done: true, fdState: fdState(marks), vars: { X, result, superkey: result === attrs } });
    return steps;
  }

  if (algo === "keys") {
    const rhsAll = norm(fds.map((f) => f.rhs).join("")), lhsAll = norm(fds.map((f) => f.lhs).join(""));
    const core = minus(attrs, rhsAll), middle = [...attrs].filter((a) => rhsAll.includes(a) && lhsAll.includes(a)).join("");
    const rightOnly = [...attrs].filter((a) => rhsAll.includes(a) && !lhsAll.includes(a)).join("");
    const keys = [];
    push(1, core ? `${core} ${core.length === 1 ? "is" : "are"} on no right-hand side: nothing determines ${core.length === 1 ? "it" : "them"}, so every key must contain ${core.length === 1 ? "it" : "them"}.` : "Every attribute appears on some right-hand side, so the core is empty.", { set: core, vars: { core: show(core) } });
    const cc = closure(core, fds).closure;
    if (cc === attrs) {
      keys.push(core);
      push(2, `${core}⁺ = ${cc} = R, so ${core} is a superkey, and since every key must contain it, it is the one and only candidate key.`, { set: cc, vars: { core, "core⁺": cc, keys } });
    } else {
      push(2, `${show(core)}⁺ = ${show(cc)}, which isn't all of R, so we need to add more attributes.`, { set: cc, vars: { core: show(core), "core⁺": show(cc) } });
      push(3, `Try adding attributes that are on both sides: ${show(middle)}.${rightOnly ? ` ${rightOnly} only ever appear${rightOnly.length > 1 ? "" : "s"} on the right, so ${rightOnly.length > 1 ? "they're" : "it's"} always derived and never needed in a key.` : ""}`, { set: core, vars: { core: show(core), middle: show(middle) } });
      for (const extra of subsets(middle).filter(Boolean)) {
        const k = union(core, extra);
        if (steps.length > 160) { push(4, "…and so on for the remaining subsets.", { set: core, vars: { keys } }); break; }
        const inside = keys.find((key) => subset(key, k));
        if (inside) { push(5, `${k} contains the key ${inside} already, so it can't be minimal: skip.`, { set: k, vars: { core: show(core), S: extra, try: k, keys } }); continue; }
        const c = closure(k, fds).closure;
        if (c === attrs) keys.push(k);
        push(6, c === attrs ? `${k}⁺ = ${c} = R, and no smaller set worked, so ${k} is a candidate key.` : `${k}⁺ = ${c}, not all of R: not a key.`, { set: c, added: c === attrs ? k : "", vars: { core: show(core), S: extra, try: k, "try⁺": c, keys } });
      }
    }
    const prime = norm(keys.join(""));
    push(7, `Candidate key${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}. Prime attributes (in some key): ${prime}; the rest (${show(minus(attrs, prime))}) are non-prime.`, { set: prime, done: true, vars: { keys, prime } });
    return steps;
  }

  if (algo === "nf") {
    const { keys, prime } = candidateKeys(attrs, fds);
    const single = singletons(fds);
    const marks = single.map(() => "");
    const st = (hot = -1) => single.map((f, i) => ({ text: fdText(f), mark: i === hot ? `${marks[i]} hot` : marks[i] }));
    let bcnf = true, third = true, second = true;
    push(1, `Candidate key${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}; prime attributes ${prime}. Check each dependency with one attribute on the right.`, { fdState: st(), set: prime, vars: { keys, prime } });
    single.forEach((fd, i) => {
      const xc = closure(fd.lhs, fds).closure;
      const vars = { X: fd.lhs, A: fd.rhs, "X⁺": xc, superkey: xc === attrs, "A prime": prime.includes(fd.rhs) };
      if (xc === attrs) {
        marks[i] = "fire";
        push(2, `${fdText(fd)}: ${fd.lhs}⁺ = ${xc} = R, so ${fd.lhs} is a superkey. This dependency is fine for every normal form.`, { fd: i, fdState: st(i), set: xc, vars });
        return;
      }
      bcnf = false;
      if (prime.includes(fd.rhs)) {
        marks[i] = "warn";
        push([3, 4], `${fdText(fd)}: ${fd.lhs}⁺ = ${xc} isn't all of R, so ${fd.lhs} is not a superkey and BCNF is violated. But ${fd.rhs} is prime (part of a candidate key), so 3NF allows it.`, { fd: i, fdState: st(i), set: xc, vars });
      } else {
        third = false;
        marks[i] = "bad";
        const partOf = keys.find((k) => subset(fd.lhs, k));
        push([3, 5], `${fdText(fd)}: ${fd.lhs} is not a superkey (${fd.lhs}⁺ = ${xc}) and ${fd.rhs} is not prime, so both BCNF and 3NF are violated: ${fd.rhs} depends on something other than a whole key${partOf ? ` (on part of the key ${partOf})` : ", a transitive dependency"}.`, { fd: i, fdState: st(i), set: xc, vars });
      }
    });
    for (const key of keys) for (const part of subsets(key)) {
      if (part === key || !part) continue;
      const dep = [...minus(closure(part, fds).closure, part)].filter((a) => !prime.includes(a)).join("");
      if (!dep) continue;
      second = false;
      push([6, 7], `${part} is a proper part of the key ${key}, yet ${part}⁺ contains the non-prime ${dep}: a partial dependency, so 2NF is violated.`, { fdState: st(), set: union(part, dep), added: dep, vars: { K: key, P: part, "non-prime in P⁺": dep } });
    }
    const form = second ? (third ? (bcnf ? "BCNF" : "3NF") : "2NF") : "1NF";
    push(6, `${form === "BCNF" ? "No dependency breaks any normal form" : `Nothing breaks ${form}, but something breaks ${["2NF", "3NF", "BCNF"][["1NF", "2NF", "3NF"].indexOf(form)]}`}, so the highest normal form is ${form}.`, { fdState: st(), done: true, set: prime, vars: { "2NF": second, "3NF": third, BCNF: bcnf, form } });
    return steps;
  }

  if (algo === "cover") {
    let f = singletons(fds).map((d) => ({ ...d }));
    const st = (hot = -1, mark = "hot") => f.map((d, i) => ({ text: fdText(d), mark: i === hot ? mark : "" }));
    push(1, `Split right-hand sides so each dependency determines one attribute: ${f.map(fdText).join(", ")}.`, { fdState: st(), vars: { "|F|": f.length } });
    f.forEach((fd, i) => {
      for (const b of fd.lhs) {
        if (fd.lhs.length < 2) break;
        const smaller = minus(fd.lhs, b);
        const c = closure(smaller, f).closure;
        if (c.includes(fd.rhs)) {
          const before = fd.lhs;
          fd.lhs = smaller;
          push(3, `In ${before} → ${fd.rhs}, is ${b} needed? ${smaller}⁺ = ${c} already contains ${fd.rhs}, so ${b} is extraneous: the dependency becomes ${fdText(fd)}.`, { fd: i, fdState: st(i, "fire hot"), set: c, vars: { "α": before, B: b, "(α − B)⁺": c, A: fd.rhs } });
        } else push(3, `In ${fdText(fd)}, is ${b} needed? ${smaller}⁺ = ${c} doesn't contain ${fd.rhs}, so ${b} stays.`, { fd: i, fdState: st(i, "skip hot"), set: c, vars: { "α": fd.lhs, B: b, "(α − B)⁺": c, A: fd.rhs } });
      }
    });
    f = f.filter((fd, i) => f.findIndex((g) => g.lhs === fd.lhs && g.rhs === fd.rhs) === i);
    for (let i = 0; i < f.length;) {
      const rest = f.filter((_, j) => j !== i), c = closure(f[i].lhs, rest).closure;
      if (c.includes(f[i].rhs)) {
        push(5, `${fdText(f[i])} is redundant: without it, ${f[i].lhs}⁺ = ${c} still contains ${f[i].rhs}. Remove it.`, { fd: i, fdState: st(i, "bad hot"), set: c, vars: { f: fdText(f[i]), "α⁺ without f": c } });
        f = rest;
      } else {
        push(5, `${fdText(f[i])} is needed: without it, ${f[i].lhs}⁺ = ${c} doesn't contain ${f[i].rhs}.`, { fd: i, fdState: st(i, "fire hot"), set: c, vars: { f: fdText(f[i]), "α⁺ without f": c } });
        i++;
      }
    }
    push(6, `Minimal cover: ${f.map(fdText).join(", ")}. It has the same closure as F, but nothing in it can be dropped.`, { fdState: st(), done: true, vars: { cover: f.map(fdText) } });
    return steps;
  }

  if (algo === "three") {
    const { cover } = minimalCover(fds);
    const coverState = (lhs = null) => cover.map((d) => ({ text: fdText(d), mark: d.lhs === lhs ? "fire hot" : "" }));
    let rels = [];
    const R = (mark = {}) => rels.map((r) => ({ attrs: r, mark: mark[r] ?? "" }));
    push(1, `Minimal cover: ${cover.map(fdText).join(", ")}.`, { fdState: coverState(), rels: [], vars: { Fc: cover.map(fdText) } });
    const groups = new Map();
    for (const fd of cover) groups.set(fd.lhs, union(groups.get(fd.lhs) ?? fd.lhs, fd.rhs));
    for (const [lhs, r] of groups) {
      rels.push(r);
      push(2, `The dependencies with left side ${lhs} give R(${r}), with key ${lhs}. Each dependency now lives inside one relation, so it can be checked without a join.`, { fdState: coverState(lhs), rels: R({ [r]: "new" }), vars: { "α": lhs, relation: r } });
    }
    const { keys } = candidateKeys(attrs, fds);
    const holder = rels.find((r) => keys.some((k) => subset(k, r)));
    if (!holder) {
      rels.push(keys[0]);
      push(3, `No relation contains a candidate key (${keys.join(", ")}), so add R(${keys[0]}). Without it, joining the pieces back could produce spurious tuples: the join wouldn't be lossless.`, { fdState: coverState(), rels: R({ [keys[0]]: "new" }), vars: { keys } });
    } else push(3, `R(${holder}) contains the candidate key ${keys.find((k) => subset(k, holder))}, which makes the decomposition lossless.`, { fdState: coverState(), rels: R({ [holder]: "hot" }), vars: { keys } });
    const missing = minus(attrs, norm(rels.join("")));
    if (missing) {
      rels.push(missing);
      push(4, `${missing} appear${missing.length > 1 ? "" : "s"} in no dependency, so keep ${missing.length > 1 ? "them" : "it"} in R(${missing}).`, { rels: R({ [missing]: "new" }), vars: { missing } });
    }
    const before = [...rels];
    rels = rels.filter((r, i) => !rels.some((s, j) => j !== i && subset(r, s) && (r !== s || j < i)));
    const gone = before.filter((r) => !rels.includes(r));
    push(5, gone.length ? `Remove ${gone.map((r) => `R(${r})`).join(", ")}: contained in another relation. Result: ${rels.map((r) => `R(${r})`).join(", ")}.` : `No relation is contained in another. Result: ${rels.map((r) => `R(${r})`).join(", ")}, lossless and dependency-preserving.`, { rels: R(), done: true, vars: { relations: rels } });
    return steps;
  }

  if (algo === "bcnf") {
    const done = [], queue = [attrs];
    const R = (hot = null, fresh = []) => [...done.map((r) => ({ attrs: r, mark: "good" })), ...queue.map((r) => ({ attrs: r, mark: r === hot ? "hot" : fresh.includes(r) ? "new" : "" }))];
    push(1, `Start with the whole relation R(${attrs}).`, { rels: R(attrs), vars: { result: [attrs] } });
    while (queue.length) {
      const r = queue[0];
      let violation = null;
      for (const s of subsets(r)) {
        if (!s || s === r) continue;
        const xc = closure(s, fds).closure;
        const y = minus([...xc].filter((a) => r.includes(a)).join(""), s);
        if (y && !subset(r, xc)) { violation = { x: s, y, xc }; break; }
      }
      if (!violation) {
        queue.shift(); done.push(r);
        push(2, `R(${r}): every set whose closure adds attributes inside R(${r}) is a superkey of it, so R(${r}) is in BCNF.`, { rels: R(), set: r, vars: { "Rᵢ": r, BCNF: true } });
        continue;
      }
      const { x: lhs, y, xc } = violation;
      push(3, `R(${r}) is not in BCNF: ${lhs}⁺ = ${xc}, so ${lhs} → ${y} holds inside R(${r}), but ${lhs} doesn't determine all of R(${r}) (it's not a superkey there).`, { rels: R(r), set: union(lhs, y), added: y, vars: { "Rᵢ": r, X: lhs, Y: y, "X⁺": xc } });
      const r1 = union(lhs, y), r2 = minus(r, y);
      queue.shift(); queue.push(r1, r2);
      push(4, `Split R(${r}) into R(${r1}) (where ${lhs} is a key) and R(${r2}) (everything but ${y}). They share ${lhs}, and ${lhs} → ${y}, so joining them gives back exactly R(${r}).`, { rels: R(null, [r1, r2]), set: lhs, vars: { "Rᵢ": r, X: lhs, Y: y, R1: r1, R2: r2 } });
    }
    const { lost } = decomposeBCNF(attrs, fds);
    push(5, lost.length ? `Done: ${done.map((r) => `R(${r})`).join(", ")}. Lossless, but ${lost.map(fdText).join(", ")} ${lost.length > 1 ? "are" : "is"} lost: no relation holds all ${lost.length > 1 ? "their" : "its"} attributes, so checking ${lost.length > 1 ? "them" : "it"} needs a join. That's the price of BCNF.` : `Done: ${done.map((r) => `R(${r})`).join(", ")}. Lossless, and every dependency is preserved.`, { rels: R(), done: true, vars: { result: done, lost: lost.map(fdText) } });
    return steps;
  }
  throw new Error(`Unknown algorithm ${algo}`);
}
