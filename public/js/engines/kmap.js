// K-map and Quine-McCluskey minimisation for 2 to 5 variables, with don't-cares.
//
// An implicant is { value, mask }: mask has a 1 for every variable that has been
// eliminated (a dash), and value holds the fixed bits (0 wherever mask is 1).
// Variable A is the most significant bit of a minterm number.
//
// Conventions (stated in the UI):
// - A minimal SOP has the fewest terms, then the fewest literals; ties are
//   broken by taking larger groups first, then lower minterm numbers.
// - Prime implicants made only of don't-cares are left out: they never help.
// - The minimal POS is found by minimising the 0s (F') and complementing.

export const NAMES = ["A", "B", "C", "D", "E"];

const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
const key = (imp) => `${imp.value}|${imp.mask}`;

export function covers(imp, n) {
  const out = [];
  for (let m = 0; m < 1 << n; m++) if ((m & ~imp.mask) === imp.value) out.push(m);
  return out;
}
export const size = (imp) => 1 << popcount(imp.mask);
export const literals = (imp, n) => n - popcount(imp.mask);

// "1-0-" style pattern, A first.
export function pattern(imp, n) {
  let s = "";
  for (let i = n - 1; i >= 0; i--) s += imp.mask >> i & 1 ? "-" : String(imp.value >> i & 1);
  return s;
}

// AB'D, or 1 when every variable is gone.
export function productTerm(imp, n, names = NAMES) {
  let s = "";
  for (let i = n - 1; i >= 0; i--) if (!(imp.mask >> i & 1)) s += names[n - 1 - i] + (imp.value >> i & 1 ? "" : "'");
  return s || "1";
}
// The sum term for an implicant of F': (A' + B + D'), or 0 when nothing is left.
export function sumTerm(imp, n, names = NAMES) {
  const lits = [];
  for (let i = n - 1; i >= 0; i--) if (!(imp.mask >> i & 1)) lits.push(names[n - 1 - i] + (imp.value >> i & 1 ? "'" : ""));
  if (!lits.length) return "0";
  return lits.length === 1 ? lits[0] : `(${lits.join(" + ")})`;
}

export function sopText(terms, n, names = NAMES) {
  if (!terms.length) return "0";
  return terms.map((t) => productTerm(t, n, names)).join(" + ");
}
export function posText(terms, n, names = NAMES) {
  if (!terms.length) return "1";
  return terms.map((t) => sumTerm(t, n, names)).join("");
}

// Parse "1, 3, 5-7" (ranges allowed) into sorted distinct numbers below 2^n.
export function parseList(text, n, what = "Minterms") {
  const out = new Set();
  const s = String(text ?? "").trim();
  if (!s) return [];
  for (const part of s.split(/[\s,]+/).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    const nums = range ? Array.from({ length: Math.max(0, Number(range[2]) - Number(range[1]) + 1) }, (_, k) => Number(range[1]) + k) : [Number(part)];
    for (const x of nums) {
      if (!Number.isInteger(x) || !/^\d+(-\d+)?$/.test(part)) throw new Error(`${what}: "${part}" isn't a whole number.`);
      if (x >= 1 << n) throw new Error(`${what}: ${x} is too big for ${n} variables (use 0 to ${(1 << n) - 1}).`);
      out.add(x);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function validate(n, ones, dcs) {
  if (!Number.isInteger(n) || n < 2 || n > 5) throw new Error("Use 2 to 5 variables.");
  const clash = ones.find((m) => dcs.includes(m));
  if (clash !== undefined) throw new Error(`${clash} is listed as both a minterm and a don't-care.`);
}

// --- Quine-McCluskey tabulation ------------------------------------------------------

export const QM_CODE = [
  "list every minterm and don't-care in binary",
  "group them by the number of 1s",
  "repeat",
  "  for each pair of neighbouring groups",
  "    combine terms that differ in exactly one bit  // that bit becomes -",
  "    tick both terms: they're covered by the new one",
  "  move to the next column",
  "until nothing combines",
  "prime implicants ← every term never ticked",
];

export function tabulate(n, ones, dcs = []) {
  validate(n, ones, dcs);
  const isOne = new Set(ones);
  let current = [...new Set([...ones, ...dcs])].sort((a, b) => a - b).map((m) => ({ value: m, mask: 0, ms: [m] }));
  const columns = [], steps = [], primes = [];
  steps.push({ line: [1, 2], column: 0, pair: null, made: [], intro: true, ticked: new Set(), vars: { column: 1, terms: current.length },
    note: current.length ? `Write the ${ones.length} minterm${ones.length === 1 ? "" : "s"}${dcs.length ? ` and ${dcs.length} don't-care${dcs.length === 1 ? "" : "s"}` : ""} in binary and group them by how many 1s they have. Don't-cares join in: they can help make bigger groups.` : "There are no minterms, so F = 0." });
  while (current.length) {
    const groups = [];
    for (const t of current) { const g = popcount(t.value); (groups[g] ??= []).push(t); }
    const col = { groups: groups.map((g) => g ?? []), terms: current };
    columns.push(col);
    const c = columns.length - 1;
    const next = new Map(), used = new Set();
    for (let g = 0; g < groups.length - 1; g++) {
      const A = groups[g] ?? [], B = groups[g + 1] ?? [];
      if (!A.length || !B.length) continue;
      const made = [];
      for (const a of A) for (const b of B) {
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (popcount(diff) !== 1 || (b.value & diff) === 0) continue;
        used.add(key(a)); used.add(key(b));
        const t = { value: a.value & ~diff, mask: a.mask | diff, ms: [...a.ms, ...b.ms].sort((x, y) => x - y) };
        const k = key(t);
        made.push({ from: [a, b], term: t, fresh: !next.has(k) });
        if (!next.has(k)) next.set(k, t);
      }
      steps.push({ line: [4, 5, 6], column: c, pair: g, made, ticked: new Set(used), vars: { column: c + 1, groups: `${g} & ${g + 1} ones`, combined: made.length },
        note: made.length
          ? `Column ${c + 1}: compare the group with ${g} one${g === 1 ? "" : "s"} against the group with ${g + 1}. ${made.map((x) => `${pattern(x.from[0], n)} + ${pattern(x.from[1], n)} → ${pattern(x.term, n)}`).join(", ")}${made.some((x) => !x.fresh) ? " (a repeat is only kept once)" : ""}.`
          : `Column ${c + 1}: nothing in the group with ${g} one${g === 1 ? "" : "s"} differs from the group with ${g + 1} in exactly one bit (in the same dash positions).` });
    }
    for (const t of current) if (!used.has(key(t))) primes.push(t);
    col.used = used;
    const nextTerms = [...next.values()].sort((a, b) => a.mask - b.mask || a.value - b.value);
    steps.push({ line: nextTerms.length ? [7] : [8, 9], column: c, pair: null, made: [], ticked: new Set(used), vars: { column: c + 1, unticked: current.filter((t) => !used.has(key(t))).length, "next column": nextTerms.length },
      note: nextTerms.length
        ? `Column ${c + 1} done. ${current.filter((t) => !used.has(key(t))).length ? `Unticked here: ${current.filter((t) => !used.has(key(t))).map((t) => pattern(t, n)).join(", ")}. They can't grow, so they are prime implicants.` : "Every term was ticked."} Move on to column ${c + 2}.`
        : `Nothing more combines. Every unticked term is a prime implicant: ${primes.map((t) => pattern(t, n)).join(", ") || "none"}.` });
    current = nextTerms;
  }
  // Drop prime implicants that cover only don't-cares.
  const useful = primes.filter((p) => p.ms.some((m) => isOne.has(m)));
  useful.sort((a, b) => popcount(b.mask) - popcount(a.mask) || a.ms[0] - b.ms[0] || a.value - b.value);
  return { columns, steps, primes: useful, dropped: primes.filter((p) => !useful.includes(p)) };
}

// --- Choosing a cover ------------------------------------------------------------------

// Exact minimum cover of `need` by `cands` (branch and bound).
// cost: "terms" compares (terms, literals); "literals" compares (literals, terms).
function bestCover(need, cands, n, cost = "terms") {
  const score = (list) => { const t = list.length, l = list.reduce((s, p) => s + literals(p, n), 0); return cost === "terms" ? [t, l] : [l, t]; };
  const worse = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
  let best = null, bestScore = [Infinity, Infinity];
  const rec = (left, chosen) => {
    const s = score(chosen);
    if (left.size === 0) { if (!worse(s, bestScore)) { best = [...chosen]; bestScore = s; } return; }
    // Any finished cover needs at least one more term (and no fewer literals).
    if (cost === "terms" ? s[0] + 1 > bestScore[0] || (s[0] + 1 === bestScore[0] && s[1] >= bestScore[1]) : s[0] > bestScore[0]) return;
    let opts = null;
    for (const m of left) {
      const o = cands.filter((p) => p.ms.includes(m));
      if (!opts || o.length < opts.length) opts = o;
    }
    if (!opts.length) return;
    for (const p of opts) {
      const next = new Set([...left].filter((m) => !p.ms.includes(m)));
      chosen.push(p); rec(next, chosen); chosen.pop();
    }
  };
  rec(new Set(need), []);
  return best ?? [];
}

export const KMAP_CODE = [
  "mark every 1, 0 and X (don't-care) on the map",
  "circle each largest block of 1s and Xs (1, 2, 4, 8 … cells, edges wrap)  // prime implicants",
  "for each 1 inside exactly one block",
  "  that block is essential: it must be in the answer",
  "while some 1 is still uncovered",
  "  add the fewest, then smallest, extra blocks that cover the rest",
  "F ← OR of the chosen blocks",
];

// Minimise F (sop) or F' (pos). Returns prime implicants, essentials, the cover and steps.
export function minimise(n, ones, dcs = [], { form = "sop", names = NAMES } = {}) {
  validate(n, ones, dcs);
  const all = Array.from({ length: 1 << n }, (_, m) => m);
  const zeros = all.filter((m) => !ones.includes(m) && !dcs.includes(m));
  const target = form === "pos" ? zeros : [...ones];
  const word = form === "pos" ? "0" : "1";
  const qm = tabulate(n, target, dcs);
  const primes = qm.primes.map((p) => ({ ...p, ms: covers(p, n), on: covers(p, n).filter((m) => target.includes(m)) }));
  const coveredBy = new Map(target.map((m) => [m, primes.filter((p) => p.ms.includes(m))]));
  const essential = [];
  const reasons = new Map();
  for (const m of target) {
    const list = coveredBy.get(m);
    if (list.length === 1 && !essential.includes(list[0])) { essential.push(list[0]); reasons.set(list[0], m); }
  }
  essential.sort((a, b) => primes.indexOf(a) - primes.indexOf(b));
  const left = target.filter((m) => !essential.some((p) => p.ms.includes(m)));
  const rest = primes.filter((p) => !essential.includes(p) && p.on.some((m) => left.includes(m)));
  const extra = bestCover(left, rest.map((p) => ({ ...p, ms: p.on, ref: p })), n, "terms").map((x) => x.ref);
  extra.sort((a, b) => primes.indexOf(a) - primes.indexOf(b));
  const chosen = [...essential, ...extra].sort((a, b) => primes.indexOf(a) - primes.indexOf(b));
  const termText = (p) => (form === "pos" ? sumTerm(p, n, names) : productTerm(p, n, names));
  const exprOf = (list) => (form === "pos" ? posText(list, n, names) : sopText(list, n, names));
  const expr = target.length === 0 ? (form === "pos" ? "1" : "0") : exprOf(chosen);

  // Steps for the K-map view.
  const steps = [];
  const base = { primes: [], essential: [], chosen: [], focus: null, cell: null };
  steps.push({ ...base, line: 1, vars: { [`${word}s`]: target.length, "don't-cares": dcs.length },
    note: target.length === 0
      ? `There are no ${word}s to group, so F = ${form === "pos" ? "1" : "0"}.`
      : target.length + dcs.length === 1 << n && form === "sop"
        ? "Every cell is a 1 or a don't-care, so one block covers the whole map and F = 1."
        : `${form === "pos" ? "For the POS form we group the 0s (the 1s of F'). " : ""}The map has ${target.length} ${word}${target.length === 1 ? "" : "s"}${dcs.length ? ` and ${dcs.length} don't-care${dcs.length === 1 ? "" : "s"} (X), which may be grouped if they help` : ""}. Rows and columns go in Gray-code order, so neighbouring cells differ in one variable.` });
  primes.forEach((p, i) => {
    steps.push({ ...base, primes: primes.slice(0, i + 1), focus: p, line: 2, vars: { block: pattern(p, n), cells: size(p), term: termText(p), "prime implicants": i + 1 },
      note: `Block of ${size(p)} cell${size(p) === 1 ? "" : "s"} (${p.ms.join(", ")}) gives ${termText(p)}. It can't be doubled without taking in a ${form === "pos" ? "1" : "0"}, so it's a prime implicant.` });
  });
  essential.forEach((p, i) => {
    const m = reasons.get(p);
    steps.push({ ...base, primes, essential: essential.slice(0, i + 1), chosen: essential.slice(0, i + 1), focus: p, cell: m, line: [3, 4], vars: { cell: m, block: termText(p), essential: i + 1 },
      note: `Cell ${m} sits in only one block, ${termText(p)}, so that block is essential.` });
  });
  if (target.length && !essential.length) steps.push({ ...base, primes, line: 3, vars: { essential: 0 }, note: "Every 1 is in at least two blocks, so there are no essential prime implicants (a cyclic map). We must choose." });
  if (left.length) {
    extra.forEach((p, i) => {
      steps.push({ ...base, primes, essential, chosen: [...essential, ...extra.slice(0, i + 1)], focus: p, line: [5, 6], vars: { uncovered: left.filter((m) => !extra.slice(0, i).some((q) => q.on.includes(m))).join(", "), add: termText(p) },
        note: `Still uncovered: ${left.filter((m) => !extra.slice(0, i).some((q) => q.on.includes(m))).join(", ")}. The cheapest way to finish uses ${termText(p)}${extra.length > 1 ? ` (one of ${extra.length} extra blocks)` : ""}.` });
    });
  } else if (target.length && essential.length) {
    steps.push({ ...base, primes, essential, chosen, line: 5, vars: { uncovered: "none" }, note: `The essential prime implicants already cover every ${word}. Any other prime implicant would be redundant.` });
  }
  if (target.length) {
    const lits = chosen.reduce((s, p) => s + literals(p, n), 0);
    steps.push({ ...base, primes, essential, chosen, line: 7, vars: { terms: chosen.length, literals: lits },
      note: `Minimal ${form === "pos" ? "POS" : "SOP"}: F = ${expr}. ${chosen.length} term${chosen.length === 1 ? "" : "s"}, ${lits} literal${lits === 1 ? "" : "s"}.` });
  }
  return {
    n, ones, dcs, zeros, form, target, primes, essential, extra, chosen, expr, steps, qm,
    literals: chosen.reduce((s, p) => s + literals(p, n), 0),
  };
}

// Minimal literal count over every cover (ignoring how many terms): used to make
// sure GATE questions are unambiguous.
export function minLiterals(n, ones, dcs = []) {
  const r = minimise(n, ones, dcs);
  if (!ones.length) return 0;
  const cover = bestCover(ones, r.primes.map((p) => ({ ...p, ms: p.on, ref: p })), n, "literals");
  return cover.reduce((s, p) => s + literals(p, n), 0);
}

// Truth value of a SOP (list of implicants) at minterm m.
export const evalSop = (terms, m) => terms.some((t) => (m & ~t.mask) === t.value);
export const evalPos = (terms, m) => terms.every((t) => (m & ~t.mask) !== t.value);

// --- Map layout -------------------------------------------------------------------------
const gray = (bits) => Array.from({ length: 1 << bits }, (_, k) => k ^ (k >> 1));

// Rows and columns in Gray order. Five variables: two 4-variable maps, A = 0 and A = 1.
export function layout(n, names = NAMES) {
  const split = { 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 2] }[n];
  const sub = n === 5 ? 4 : n;
  const [rb, cb] = split;
  const offset = n === 5 ? 1 : 0;
  const rowVars = names.slice(offset, offset + rb), colVars = names.slice(offset + rb, offset + rb + cb);
  const rows = gray(rb), cols = gray(cb);
  const maps = n === 5 ? [{ label: `${names[0]} = 0`, high: 0 }, { label: `${names[0]} = 1`, high: 1 }] : [{ label: null, high: 0 }];
  const cell = (map, r, c) => (maps[map].high << sub) | (rows[r] << cb) | cols[c];
  const bin = (v, b) => v.toString(2).padStart(b, "0");
  return { n, maps, rowVars, colVars, rows, cols, cell, rowLabels: rows.map((v) => bin(v, rb)), colLabels: cols.map((v) => bin(v, cb)) };
}

// The rectangles to draw for one implicant: [{ map, r0, r1, c0, c1 }] (inclusive),
// split where a block wraps round an edge.
export function blocks(imp, lay) {
  const out = [];
  lay.maps.forEach((_, mi) => {
    const rs = [], cs = [];
    lay.rows.forEach((_, r) => { if (lay.cols.some((__, c) => covers1(imp, lay.cell(mi, r, c)))) rs.push(r); });
    lay.cols.forEach((_, c) => { if (lay.rows.some((__, r) => covers1(imp, lay.cell(mi, r, c)))) cs.push(c); });
    for (const [r0, r1] of runs(rs)) for (const [c0, c1] of runs(cs)) out.push({ map: mi, r0, r1, c0, c1 });
  });
  return out;
}
const covers1 = (imp, m) => (m & ~imp.mask) === imp.value;
function runs(list) {
  const out = [];
  for (const x of list) { const last = out[out.length - 1]; if (last && last[1] === x - 1) last[1] = x; else out.push([x, x]); }
  return out;
}

// --- Random functions for practice -----------------------------------------------------------
export function randomFunction(r, n, { dcChance = 0, density = 0.45 } = {}) {
  const ones = [], dcs = [];
  for (let m = 0; m < 1 << n; m++) {
    const x = r();
    if (x < density) ones.push(m);
    else if (x < density + dcChance) dcs.push(m);
  }
  return { ones, dcs };
}

// Parse a typed SOP such as "AB' + C'D + 1" into implicants. Accepts ' after a
// letter, or ~ before it.
export function parseSop(text, n, names = NAMES) {
  const s = String(text ?? "").replace(/\s+/g, "").replace(/[’`]/g, "'");
  if (!s) throw new Error("Type an expression, for example AB' + C.");
  if (s === "0") return [];
  return s.split("+").map((part) => {
    if (!part) throw new Error("There's an empty term: check the + signs.");
    if (part === "1") return { value: 0, mask: (1 << n) - 1 };
    let value = 0, fixed = 0, i = 0, vanishes = false;
    while (i < part.length) {
      let neg = false;
      if (part[i] === "~") { neg = true; i++; }
      const ch = part[i]?.toUpperCase();
      const v = names.slice(0, n).findIndex((x) => x.toUpperCase() === ch);
      if (v < 0) throw new Error(`"${part[i] ?? part}" isn't one of the variables ${names.slice(0, n).join(", ")}.`);
      i++;
      if (part[i] === "'") { neg = !neg; i++; }
      const bit = 1 << (n - 1 - v), want = neg ? 0 : bit;
      if (fixed & bit && (value & bit) !== want) vanishes = true; // x · x' = 0
      fixed |= bit; value |= want;
    }
    return vanishes ? null : { value, mask: ((1 << n) - 1) & ~fixed };
  }).filter(Boolean);
}
