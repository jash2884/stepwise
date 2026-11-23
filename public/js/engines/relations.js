// Relations on a small finite set: properties with a witness for every
// failure, reflexive / symmetric / transitive closures (Warshall step by step),
// equivalence classes, partial orders with their Hasse diagram and lattice
// checks, and the standard counting formulas with the numbers worked out.
//
// A relation is a boolean matrix M over the elements, M[i][j] meaning
// (elements[i], elements[j]) ∈ R.

const byName = (a, b) => a.localeCompare(b, "en", { numeric: true });

export function parseSet(text) {
  const items = String(text).match(/[A-Za-z0-9]+/g) ?? [];
  const els = [...new Set(items)];
  if (!els.length) throw new Error("List the elements of the set, like 1 2 3 4.");
  if (els.length > 8) throw new Error("Use at most 8 elements so the matrix stays readable.");
  return els;
}

// Pairs written any way: (1,2) (2,3), or 1 2, 2 3, or 1-2 2-3.
export function parsePairs(text, elements) {
  const items = String(text).match(/[A-Za-z0-9]+/g) ?? [];
  if (items.length % 2) throw new Error(`"${items[items.length - 1]}" has no partner. Write pairs like (1,2) (2,3).`);
  const index = new Map(elements.map((e, i) => [e, i]));
  const n = elements.length, M = matrix(n);
  for (let k = 0; k < items.length; k += 2) {
    const [a, b] = [items[k], items[k + 1]];
    if (!index.has(a) || !index.has(b)) throw new Error(`(${a}, ${b}) uses an element that isn't in the set {${elements.join(", ")}}.`);
    M[index.get(a)][index.get(b)] = true;
  }
  return M;
}

export const matrix = (n, fill = false) => Array.from({ length: n }, () => Array(n).fill(fill));
export const copy = (M) => M.map((row) => [...row]);
export const pairsOf = (M, els) => M.flatMap((row, i) => row.map((x, j) => (x ? [els[i], els[j]] : null)).filter(Boolean));
export const showPairs = (pairs) => (pairs.length ? `{${pairs.map(([a, b]) => `(${a},${b})`).join(", ")}}` : "∅");
export const countPairs = (M) => M.flat().filter(Boolean).length;

// --- Properties --------------------------------------------------------------------
export const PROPERTY_CODE = [
  "reflexive  ⟺ for every a: (a,a) ∈ R",
  "irreflexive ⟺ for every a: (a,a) ∉ R",
  "symmetric  ⟺ (a,b) ∈ R ⇒ (b,a) ∈ R",
  "antisymmetric ⟺ (a,b) ∈ R and (b,a) ∈ R ⇒ a = b",
  "asymmetric ⟺ (a,b) ∈ R ⇒ (b,a) ∉ R",
  "transitive ⟺ (a,b) ∈ R and (b,c) ∈ R ⇒ (a,c) ∈ R",
];

export function properties(M, els) {
  const n = M.length, out = {};
  const find = (test) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const w = test(i, j); if (w) return w; } return null; };
  const r = find((i, j) => i === j && !M[i][i] && { cells: [[i, i]], text: `(${els[i]},${els[i]}) is missing` });
  out.reflexive = { ok: !r, witness: r, line: 1 };
  const ir = find((i, j) => i === j && M[i][i] && { cells: [[i, i]], text: `(${els[i]},${els[i]}) is in R` });
  out.irreflexive = { ok: !ir, witness: ir, line: 2 };
  const s = find((i, j) => M[i][j] && !M[j][i] && { cells: [[i, j], [j, i]], text: `(${els[i]},${els[j]}) is in R but (${els[j]},${els[i]}) isn't` });
  out.symmetric = { ok: !s, witness: s, line: 3 };
  const a = find((i, j) => i < j && M[i][j] && M[j][i] && { cells: [[i, j], [j, i]], text: `both (${els[i]},${els[j]}) and (${els[j]},${els[i]}) are in R` });
  out.antisymmetric = { ok: !a, witness: a, line: 4 };
  const as = find((i, j) => M[i][j] && M[j][i] && { cells: [[i, j], [j, i]], text: i === j ? `(${els[i]},${els[i]}) is in R` : `both (${els[i]},${els[j]}) and (${els[j]},${els[i]}) are in R` });
  out.asymmetric = { ok: !as, witness: as, line: 5 };
  let t = null;
  for (let i = 0; i < n && !t; i++) for (let j = 0; j < n && !t; j++) if (M[i][j]) for (let k = 0; k < n && !t; k++) if (M[j][k] && !M[i][k]) t = { cells: [[i, j], [j, k], [i, k]], text: `(${els[i]},${els[j]}) and (${els[j]},${els[k]}) are in R but (${els[i]},${els[k]}) isn't` };
  out.transitive = { ok: !t, witness: t, line: 6 };
  out.equivalence = out.reflexive.ok && out.symmetric.ok && out.transitive.ok;
  out.partialOrder = out.reflexive.ok && out.antisymmetric.ok && out.transitive.ok;
  out.strictOrder = out.irreflexive.ok && out.transitive.ok;
  return out;
}

export function propertySteps(M, els) {
  const p = properties(M, els), steps = [];
  for (const key of ["reflexive", "irreflexive", "symmetric", "antisymmetric", "asymmetric", "transitive"]) {
    const x = p[key];
    steps.push({ key, line: x.line, hot: x.witness?.cells ?? [], tone: x.ok ? "good" : "bad", vars: { property: key, holds: x.ok },
      note: `${key[0].toUpperCase()}${key.slice(1)}: ${x.ok ? "yes." : `no, ${x.witness.text}.`}` });
  }
  const kinds = [p.equivalence && "an equivalence relation", p.partialOrder && "a partial order", p.strictOrder && "a strict order"].filter(Boolean);
  steps.push({ key: "summary", line: [1, 3, 4, 6], hot: [], tone: kinds.length ? "good" : null, vars: { equivalence: p.equivalence, "partial order": p.partialOrder },
    note: kinds.length ? `So R is ${kinds.join(" and ")}.` : "So R is neither an equivalence relation nor a partial order." });
  return { props: p, steps };
}

// --- Closures ----------------------------------------------------------------------
export const WARSHALL_CODE = [
  "W ← M  // W₀",
  "for k ← 1 to n  // allow element k as a middle stop",
  "  for i ← 1 to n",
  "    if W[i][k] = 1 then",
  "      for j ← 1 to n: W[i][j] ← W[i][j] or W[k][j]  // OR row k into row i",
  "return W  // the transitive closure R⁺",
];

export function warshall(M, els) {
  const n = M.length, W = copy(M), steps = [];
  steps.push({ W: copy(W), k: -1, i: -1, added: [], line: 1, vars: { k: "-", pairs: countPairs(W) }, note: `Start with W₀ = M, the relation itself (${countPairs(W)} pairs).` });
  for (let k = 0; k < n; k++) {
    let addedK = 0;
    steps.push({ W: copy(W), k, i: -1, added: [], line: 2, vars: { k: els[k], pairs: countPairs(W) }, note: `k = ${els[k]}: a path may now pass through ${els[k]}. Every row with a 1 in column ${els[k]} gets row ${els[k]} ORed into it.` });
    for (let i = 0; i < n; i++) {
      if (!W[i][k]) continue;
      const added = [];
      for (let j = 0; j < n; j++) if (W[k][j] && !W[i][j]) { W[i][j] = true; added.push([i, j]); }
      addedK += added.length;
      steps.push({ W: copy(W), k, i, added, line: [4, 5], vars: { k: els[k], i: els[i], new: added.length, pairs: countPairs(W) },
        note: added.length ? `W[${els[i]}][${els[k]}] = 1 and row ${els[k]} reaches ${added.map(([, j]) => els[j]).join(", ")}, so add ${added.map(([a, b]) => `(${els[a]},${els[b]})`).join(", ")}.`
          : `W[${els[i]}][${els[k]}] = 1, but row ${els[k]} adds nothing new to row ${els[i]}.` });
    }
    if (!addedK) steps[steps.length - 1].note += ` W${sub(k + 1)} = W${sub(k)}.`;
  }
  steps.push({ W: copy(W), k: n, i: -1, added: [], line: 6, tone: "good", vars: { pairs: countPairs(W), added: countPairs(W) - countPairs(M) },
    note: `Done: the transitive closure has ${countPairs(W)} pairs, ${countPairs(W) - countPairs(M)} more than R.` });
  return { closure: W, steps };
}
const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);

export function reflexiveClosure(M) { const W = copy(M); W.forEach((row, i) => { row[i] = true; }); return W; }
export function symmetricClosure(M) { const W = copy(M); M.forEach((row, i) => row.forEach((x, j) => { if (x) W[j][i] = true; })); return W; }
export function transitiveClosure(M) { return warshall(M, M.map((_, i) => String(i))).closure; }
export function equivalenceClosure(M) { return transitiveClosure(symmetricClosure(reflexiveClosure(M))); }

// --- Equivalence classes ---------------------------------------------------------
export function classes(M, els) {
  const n = M.length, seen = new Set(), out = [];
  for (let i = 0; i < n; i++) {
    if (seen.has(i)) continue;
    const cls = [];
    for (let j = 0; j < n; j++) if (M[i][j]) { cls.push(j); seen.add(j); }
    seen.add(i);
    out.push(cls.length ? cls : [i]);
  }
  return out.map((c) => c.map((i) => els[i]));
}

// --- Partial orders ----------------------------------------------------------------
// Hasse diagram: drop the loops and every pair implied by transitivity.
// level = length of the longest chain below an element.
export function hasse(M, els) {
  const n = M.length;
  const lt = (i, j) => i !== j && M[i][j];
  const covers = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (!lt(i, j)) continue;
    let between = false;
    for (let k = 0; k < n && !between; k++) if (lt(i, k) && lt(k, j)) between = true;
    if (!between) covers.push([i, j]);
  }
  const level = Array(n).fill(0);
  for (let pass = 0; pass < n; pass++) for (const [i, j] of covers) level[j] = Math.max(level[j], level[i] + 1);
  const minimal = [], maximal = [];
  for (let i = 0; i < n; i++) {
    if (!els.some((_, k) => lt(k, i))) minimal.push(i);
    if (!els.some((_, k) => lt(i, k))) maximal.push(i);
  }
  const least = minimal.length === 1 && els.every((_, k) => M[minimal[0]][k]) ? minimal[0] : null;
  const greatest = maximal.length === 1 && els.every((_, k) => M[k][maximal[0]]) ? maximal[0] : null;
  return { covers, level, minimal, maximal, least, greatest, removed: countPairs(M) - covers.length };
}

const upper = (M, a, b) => M.map((_, k) => k).filter((k) => M[a][k] && M[b][k]);
const lower = (M, a, b) => M.map((_, k) => k).filter((k) => M[k][a] && M[k][b]);
// The least element of a set S (w.r.t. M), or null.
const leastOf = (M, S) => S.find((x) => S.every((y) => M[x][y])) ?? null;
const greatestOf = (M, S) => S.find((x) => S.every((y) => M[y][x])) ?? null;
export const join = (M, a, b) => leastOf(M, upper(M, a, b));
export const meet = (M, a, b) => greatestOf(M, lower(M, a, b));

export const LATTICE_CODE = [
  "for every pair a, b",
  "  U ← common upper bounds; L ← common lower bounds",
  "  a ∨ b ← least element of U (if none: not a lattice)",
  "  a ∧ b ← greatest element of L (if none: not a lattice)",
  "distributive ⟺ a ∧ (b ∨ c) = (a ∧ b) ∨ (a ∧ c) for all a, b, c",
  "complemented ⟺ every a has some b with a ∧ b = 0 and a ∨ b = 1",
];

export function lattice(M, els) {
  const n = M.length, steps = [];
  let failure = null;
  const J = matrix(n, null), Mt = matrix(n, null);
  for (let a = 0; a < n && !failure; a++) for (let b = a + 1; b < n && !failure; b++) {
    const U = upper(M, a, b), Lw = lower(M, a, b);
    const j = leastOf(M, U), m = greatestOf(M, Lw);
    J[a][b] = J[b][a] = j; Mt[a][b] = Mt[b][a] = m;
    const ok = j != null && m != null;
    steps.push({ pair: [a, b], hot: [a, b, ...(j != null ? [j] : []), ...(m != null ? [m] : [])], line: ok ? [2, 3, 4] : j == null ? 3 : 4, tone: ok ? null : "bad",
      vars: { a: els[a], b: els[b], "upper bounds": U.map((x) => els[x]), "lower bounds": Lw.map((x) => els[x]), join: j == null ? "none" : els[j], meet: m == null ? "none" : els[m] },
      note: ok ? `${els[a]} ∨ ${els[b]} = ${els[j]} and ${els[a]} ∧ ${els[b]} = ${els[m]}.`
        : j == null ? `${els[a]} and ${els[b]} have ${U.length ? `upper bounds ${U.map((x) => els[x]).join(", ")} but no least one` : "no common upper bound"}, so there is no join: not a lattice.`
          : `${els[a]} and ${els[b]} have ${Lw.length ? `lower bounds ${Lw.map((x) => els[x]).join(", ")} but no greatest one` : "no common lower bound"}, so there is no meet: not a lattice.` });
    if (!ok) failure = { a, b, kind: j == null ? "join" : "meet" };
  }
  for (let a = 0; a < n; a++) { J[a][a] = a; Mt[a][a] = a; }
  const isLattice = !failure;
  let distributive = null, complemented = null, complements = null, distFail = null, compFail = null;
  if (isLattice) {
    distributive = true;
    for (let a = 0; a < n && distributive; a++) for (let b = 0; b < n && distributive; b++) for (let c = 0; c < n && distributive; c++) {
      const left = Mt[a][J[b][c]], right = J[Mt[a][b]][Mt[a][c]];
      if (left !== right) { distributive = false; distFail = [a, b, c, left, right]; }
    }
    const bottom = leastOf(M, M.map((_, k) => k)), top = greatestOf(M, M.map((_, k) => k));
    complements = M.map((_, a) => M.map((__, b) => b).filter((b) => Mt[a][b] === bottom && J[a][b] === top));
    complemented = complements.every((c) => c.length > 0);
    compFail = complements.findIndex((c) => !c.length);
    steps.push({ pair: null, hot: distFail ? distFail.slice(0, 3) : [], line: 5, tone: distributive ? "good" : "bad", vars: { distributive },
      note: distributive ? "Every pair has a join and a meet, so it's a lattice. a ∧ (b ∨ c) = (a ∧ b) ∨ (a ∧ c) holds for every triple, so it's distributive."
        : `It's a lattice, but not distributive: with a = ${els[distFail[0]]}, b = ${els[distFail[1]]}, c = ${els[distFail[2]]}, a ∧ (b ∨ c) = ${els[distFail[3]]} while (a ∧ b) ∨ (a ∧ c) = ${els[distFail[4]]}.` });
    steps.push({ pair: null, hot: complemented ? [] : [compFail], line: 6, tone: complemented ? "good" : null, vars: { complemented, bottom: els[bottom], top: els[top] },
      note: complemented ? `Every element has a complement (0 = ${els[bottom]}, 1 = ${els[top]}), so it's complemented${distributive ? ", and with distributivity that makes it a Boolean algebra" : ""}.`
        : `${els[compFail]} has no complement: nothing meets it in ${els[bottom]} and joins it to ${els[top]}. So it's not complemented.` });
  }
  return { isLattice, failure, join: J, meet: Mt, distributive, complemented, complements, steps };
}

// --- Preset relations -------------------------------------------------------------
export function divisibility(nums) {
  const els = [...new Set(nums.map(Number))].sort((a, b) => a - b).map(String);
  const M = els.map((a) => els.map((b) => Number(b) % Number(a) === 0));
  return { els, M };
}
export const divisorsOf = (n) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0);
export function powerSet(base) {
  const subsets = [];
  for (let m = 0; m < 2 ** base.length; m++) subsets.push(base.filter((_, i) => (m >> i) & 1));
  subsets.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
  const els = subsets.map((s) => (s.length ? s.join("") : "∅"));
  const M = subsets.map((a) => subsets.map((b) => a.every((x) => b.includes(x))));
  return { els, M };
}

// --- Counting ----------------------------------------------------------------------
const big = (x) => BigInt(x);
export function factorial(n) { let f = 1n; for (let i = 2n; i <= big(n); i++) f *= i; return f; }
export function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 1n; i <= big(k); i++) r = (r * (big(n) - big(k) + i)) / i;
  return r;
}
export function stirling2(n, k) {
  const S = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0n));
  S[0][0] = 1n;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= k; j++) S[i][j] = big(j) * S[i - 1][j] + S[i - 1][j - 1];
  return S[n][k];
}
export function bell(n) {
  let row = [1n];
  for (let i = 0; i < n; i++) {
    const next = [row[row.length - 1]];
    for (const x of row) next.push(next[next.length - 1] + x);
    row = next;
  }
  return row[0];
}
// Partial orders on n labelled elements (OEIS A001035): no closed formula.
export const POSETS = [1n, 1n, 3n, 19n, 219n, 4231n, 130023n, 6129859n, 431723379n];
export const surjections = (n, m) => factorial(m) * stirling2(n, m);

// Every count asked about relations and functions, with its formula.
export function counts(n, m = n) {
  const sq = n * n;
  const pow = (b, e) => big(b) ** big(e);
  const rows = [
    { id: "relations", name: "Relations on A", formula: "2^(n²)", work: `2^${sq}`, value: pow(2, sq) },
    { id: "relationsAB", name: "Relations from A to B", formula: "2^(nm)", work: `2^${n * m}`, value: pow(2, n * m) },
    { id: "reflexive", name: "Reflexive relations", formula: "2^(n² − n)", work: `2^${sq - n}`, value: pow(2, sq - n) },
    { id: "irreflexive", name: "Irreflexive relations", formula: "2^(n² − n)", work: `2^${sq - n}`, value: pow(2, sq - n) },
    { id: "symmetric", name: "Symmetric relations", formula: "2^(n(n+1)/2)", work: `2^${(n * (n + 1)) / 2}`, value: pow(2, (n * (n + 1)) / 2) },
    { id: "antisymmetric", name: "Antisymmetric relations", formula: "2^n · 3^(n(n−1)/2)", work: `2^${n} · 3^${(n * (n - 1)) / 2}`, value: pow(2, n) * pow(3, (n * (n - 1)) / 2) },
    { id: "asymmetric", name: "Asymmetric relations", formula: "3^(n(n−1)/2)", work: `3^${(n * (n - 1)) / 2}`, value: pow(3, (n * (n - 1)) / 2) },
    { id: "reflexiveSymmetric", name: "Reflexive and symmetric", formula: "2^(n(n−1)/2)", work: `2^${(n * (n - 1)) / 2}`, value: pow(2, (n * (n - 1)) / 2) },
    { id: "equivalence", name: "Equivalence relations", formula: "Bell number Bₙ", work: `B${sub(n)}`, value: bell(n) },
    { id: "partialOrders", name: "Partial orders", formula: "no closed formula (OEIS A001035)", work: n < POSETS.length ? "from the table" : "unknown here", value: n < POSETS.length ? POSETS[n] : null },
    { id: "functions", name: "Functions A → B", formula: "mⁿ", work: `${m}^${n}`, value: pow(m, n) },
    { id: "injective", name: "One-to-one functions", formula: "m!/(m − n)! when n ≤ m", work: n <= m ? `${m}!/${m - n}!` : "n > m, so none", value: n <= m ? factorial(m) / factorial(m - n) : 0n },
    { id: "surjective", name: "Onto functions", formula: "Σ (−1)ᵏ C(m,k) (m − k)ⁿ = m! · S(n, m)", work: n >= m ? `${m}! · S(${n}, ${m})` : "n < m, so none", value: n >= m ? surjections(n, m) : 0n },
    { id: "bijective", name: "Bijections", formula: "n! when n = m", work: n === m ? `${n}!` : "n ≠ m, so none", value: n === m ? factorial(n) : 0n },
    { id: "partialFunctions", name: "Partial functions A → B", formula: "(m + 1)ⁿ", work: `${m + 1}^${n}`, value: pow(m + 1, n) },
    { id: "binaryOps", name: "Binary operations on A", formula: "n^(n²)", work: `${n}^${sq}`, value: pow(n, sq) },
  ];
  return rows;
}

// Brute force over every relation on n ≤ 3 elements (used by the tests and
// shown in the UI for n ≤ 3 as a check).
export function bruteCounts(n) {
  const els = Array.from({ length: n }, (_, i) => String(i));
  const tally = { relations: 0, reflexive: 0, symmetric: 0, antisymmetric: 0, asymmetric: 0, irreflexive: 0, transitive: 0, equivalence: 0, partialOrders: 0, reflexiveSymmetric: 0 };
  for (let mask = 0; mask < 2 ** (n * n); mask++) {
    const M = els.map((_, i) => els.map((__, j) => !!((mask >> (i * n + j)) & 1)));
    const p = properties(M, els);
    tally.relations++;
    for (const k of ["reflexive", "symmetric", "antisymmetric", "asymmetric", "irreflexive", "transitive"]) if (p[k].ok) tally[k]++;
    if (p.equivalence) tally.equivalence++;
    if (p.partialOrder) tally.partialOrders++;
    if (p.reflexive.ok && p.symmetric.ok) tally.reflexiveSymmetric++;
  }
  return tally;
}

export function randomRelation(r, n = 4, density = 0.35) {
  const M = matrix(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = r() < density;
  return M;
}

export const EXAMPLES = {
  equiv: { name: "Congruence mod 3 on 1..6", set: "1 2 3 4 5 6", pairs: "" , build: (els) => els.map((a) => els.map((b) => (Number(a) - Number(b)) % 3 === 0)) },
  div12: { name: "Divisibility on divisors of 12", set: "1 2 3 4 6 12", build: (els) => els.map((a) => els.map((b) => Number(b) % Number(a) === 0)) },
  div30: { name: "Divisibility on divisors of 30", set: "1 2 3 5 6 10 15 30", build: (els) => els.map((a) => els.map((b) => Number(b) % Number(a) === 0)) },
  m3: { name: "M3 (diamond): a lattice, not distributive", set: "0 a b c 1", pairs: "0 0, a a, b b, c c, 1 1, 0 a, 0 b, 0 c, 0 1, a 1, b 1, c 1" },
  n5: { name: "N5 (pentagon): a lattice, not distributive", set: "0 a b c 1", pairs: "0 0, a a, b b, c c, 1 1, 0 a, 0 b, 0 c, 0 1, a b, a 1, b 1, c 1" },
  nolat: { name: "Two tops: not a lattice", set: "a b c d", pairs: "a a, b b, c c, d d, a c, a d, b c, b d" },
  chain: { name: "Path relation (needs closure)", set: "1 2 3 4", pairs: "(1,2) (2,3) (3,4) (4,1)" },
  sample: { name: "A mixed relation", set: "1 2 3 4", pairs: "(1,1) (1,2) (2,1) (2,3) (3,3) (4,4)" },
};
