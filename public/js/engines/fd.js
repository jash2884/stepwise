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
