// Dynamic programming, one table cell at a time. Each step records the whole
// table, the cell being filled, the cells it depends on (and which of them won),
// the traceback path so far, the pseudocode line and the live variables.

const INF = Infinity;
const cellText = (v) => (v == null ? null : v === INF ? "∞" : v);

function table(rows, cols, fill = null) { return Array.from({ length: rows }, () => Array(cols).fill(fill)); }

function recorder(rowHeads, colHeads) {
  const r = {
    T: table(rowHeads.length, colHeads.length), sub: table(rowHeads.length, colHeads.length), path: [], steps: [],
    snap(line, note, extra = {}) {
      r.steps.push({ cells: r.T.map((row, i) => row.map((v, j) => (v == null ? null : { t: cellText(v), s: r.sub[i][j] }))), path: [...r.path], line, note, ...extra });
    },
  };
  return r;
}

export const PROBLEMS = {
  lcs: {
    name: "Longest common subsequence",
    params: [{ key: "a", label: "String A", def: "ABCBDAB" }, { key: "b", label: "String B", def: "BDCABA" }],
    code: [
      "for i ← 0 … m: c[i][0] ← 0; for j ← 0 … n: c[0][j] ← 0",
      "for i ← 1 … m",
      "  for j ← 1 … n",
      "    if A[i] = B[j] then",
      "      c[i][j] ← c[i−1][j−1] + 1  // extend the diagonal",
      "    else c[i][j] ← max(c[i−1][j], c[i][j−1])",
      "traceback from (m, n):",
      "  if A[i] = B[j] then take it and go ↖",
      "  else go ↑ if c[i−1][j] ≥ c[i][j−1], otherwise ←",
    ],
    run: lcs,
  },
  edit: {
    name: "Edit distance (Levenshtein)",
    params: [{ key: "a", label: "From", def: "kitten" }, { key: "b", label: "To", def: "sitting" }],
    code: [
      "for i ← 0 … m: D[i][0] ← i  // delete all of A[1..i]",
      "for j ← 0 … n: D[0][j] ← j  // insert all of B[1..j]",
      "for i ← 1 … m",
      "  for j ← 1 … n",
      "    cost ← 0 if A[i] = B[j], else 1",
      "    D[i][j] ← min(D[i−1][j] + 1,  // delete A[i]",
      "                  D[i][j−1] + 1,  // insert B[j]",
      "                  D[i−1][j−1] + cost)  // keep or substitute",
      "traceback from (m, n) along the moves that gave each minimum",
    ],
    run: edit,
  },
  knapsack: {
    name: "0/1 knapsack",
    params: [{ key: "w", label: "Weights", def: "1 3 4 5" }, { key: "v", label: "Values", def: "1 4 5 7" }, { key: "cap", label: "Capacity W", def: "7", num: true }],
    code: [
      "for w ← 0 … W: K[0][w] ← 0  // no items, no value",
      "for i ← 1 … n",
      "  for w ← 0 … W",
      "    K[i][w] ← K[i−1][w]  // option 1: skip item i",
      "    if wt[i] ≤ w then",
      "      K[i][w] ← max(K[i][w], K[i−1][w − wt[i]] + val[i])  // option 2: take it",
      "traceback: if K[i][w] ≠ K[i−1][w] then item i was taken; w ← w − wt[i]",
    ],
    run: knapsack,
  },
  coinWays: {
    name: "Coin change: number of ways",
    params: [{ key: "coins", label: "Coins", def: "1 2 5" }, { key: "amount", label: "Amount", def: "5", num: true }],
    code: [
      "ways[0][0] ← 1; ways[0][a] ← 0 for a > 0  // no coins: only 0 is payable",
      "for i ← 1 … k  // allow coins c1 … ci",
      "  for a ← 0 … N",
      "    ways[i][a] ← ways[i−1][a]  // ways that never use ci",
      "    if ci ≤ a then ways[i][a] ← ways[i][a] + ways[i][a − ci]  // ways that use ci at least once",
    ],
    run: (input) => coins(input, false),
  },
  coinMin: {
    name: "Coin change: fewest coins",
    params: [{ key: "coins", label: "Coins", def: "1 3 4" }, { key: "amount", label: "Amount", def: "6", num: true }],
    code: [
      "M[0][0] ← 0; M[0][a] ← ∞ for a > 0  // no coins: impossible",
      "for i ← 1 … k  // allow coins c1 … ci",
      "  for a ← 0 … N",
      "    M[i][a] ← M[i−1][a]  // don't use ci",
      "    if ci ≤ a then M[i][a] ← min(M[i][a], M[i][a − ci] + 1)  // one more ci",
      "traceback: if M[i][a] = M[i−1][a] go ↑, else use ci and go ← by ci",
    ],
    run: (input) => coins(input, true),
  },
  mcm: {
    name: "Matrix-chain multiplication",
    params: [{ key: "p", label: "Dimensions p0 … pn", def: "30 35 15 5 10 20 25" }],
    code: [
      "for i ← 1 … n: m[i][i] ← 0  // a single matrix costs nothing",
      "for len ← 2 … n  // chain length",
      "  for i ← 1 … n − len + 1",
      "    j ← i + len − 1; m[i][j] ← ∞",
      "    for k ← i … j − 1  // split between Ak and Ak+1",
      "      q ← m[i][k] + m[k+1][j] + p[i−1]·p[k]·p[j]",
      "      if q < m[i][j] then m[i][j] ← q; s[i][j] ← k",
      "print the parenthesisation by following s[1][n]",
    ],
    run: mcm,
  },
  lis: {
    name: "Longest increasing subsequence",
    params: [{ key: "a", label: "Sequence", def: "10 9 2 5 3 7 101 18" }],
    code: [
      "for i ← 0 … n−1",
      "  L[i] ← 1; prev[i] ← −1  // A[i] on its own",
      "  for j ← 0 … i−1",
      "    if A[j] < A[i] and L[j] + 1 > L[i] then",
      "      L[i] ← L[j] + 1; prev[i] ← j  // extend the best run ending at j",
      "end ← an index with the largest L; follow prev back from end",
    ],
    run: lis,
  },
  fibMemo: {
    name: "Fibonacci: memoised recursion",
    params: [{ key: "n", label: "n", def: "6", num: true }],
    code: [
      "fib(n):",
      "  if n ≤ 1 then return n",
      "  if memo[n] is set then return memo[n]  // solved before: reuse it",
      "  memo[n] ← fib(n−1) + fib(n−2)",
      "  return memo[n]",
    ],
    run: fibMemo,
  },
  fibTable: {
    name: "Fibonacci: bottom-up table",
    params: [{ key: "n", label: "n", def: "10", num: true }],
    code: [
      "F[0] ← 0; F[1] ← 1",
      "for i ← 2 … n",
      "  F[i] ← F[i−1] + F[i−2]  // both already in the table",
      "return F[n]",
    ],
    run: fibTable,
  },
};

export const COMPLEXITY = [
  { id: "lcs", cells: ["LCS", "O(mn)", "O(mn), or O(min(m, n)) for the length only", "Optimal substructure on prefixes"] },
  { id: "edit", cells: ["Edit distance", "O(mn)", "O(mn), or O(n) for the distance only", "Last characters: delete, insert or substitute"] },
  { id: "knapsack", cells: ["0/1 knapsack", "O(nW), pseudo-polynomial", "O(nW), or O(W) with one row", "Take item i or not"] },
  { id: "coinWays", cells: ["Coin change (ways)", "O(kN)", "O(kN), or O(N)", "Use coin i or not: combinations, not orders"] },
  { id: "coinMin", cells: ["Coin change (fewest)", "O(kN)", "O(kN), or O(N)", "Last coin used"] },
  { id: "mcm", cells: ["Matrix chain", "O(n³)", "O(n²)", "Where the last multiplication splits"] },
  { id: "lis", cells: ["LIS", "O(n²) here; O(n log n) with patience sorting", "O(n)", "Best run ending at each index"] },
  { id: "fibMemo", cells: ["Fibonacci (memo)", "O(n)", "O(n) memo + O(n) stack", "fib(n−1) + fib(n−2)"] },
  { id: "fibTable", cells: ["Fibonacci (table)", "O(n)", "O(n), or O(1) keeping two values", "fib(n−1) + fib(n−2)"] },
];

// --- Input parsing -----------------------------------------------------------------
const nums = (text, label, { min = 1, max = 999, len = [1, 12] } = {}) => {
  const xs = String(text ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  if (xs.some((x) => !Number.isInteger(x) || x < min || x > max)) throw new Error(`${label}: use whole numbers from ${min} to ${max}.`);
  if (xs.length < len[0] || xs.length > len[1]) throw new Error(`${label}: give ${len[0] === len[1] ? len[0] : `${len[0]} to ${len[1]}`} numbers.`);
  return xs;
};
const word = (text, label, max) => {
  const s = String(text ?? "").replace(/\s+/g, "");
  if (s.length > max) throw new Error(`${label}: use at most ${max} characters so the table fits.`);
  return [...s];
};
const int = (v, label, min, max) => {
  const x = Number(v);
  if (!Number.isInteger(x) || x < min || x > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return x;
};

export function run(problem, input = {}) {
  const P = PROBLEMS[problem];
  if (!P) throw new Error(`Unknown problem ${problem}.`);
  const full = Object.fromEntries(P.params.map((p) => [p.key, input[p.key] ?? p.def]));
  return P.run(full);
}

// --- LCS ---------------------------------------------------------------------------
function lcs({ a, b }) {
  const A = word(a, "String A", 12), B = word(b, "String B", 12), m = A.length, n = B.length;
  const r = recorder(["", ...A], ["", ...B]), c = r.T;
  for (let i = 0; i <= m; i++) c[i][0] = 0;
  for (let j = 0; j <= n; j++) c[0][j] = 0;
  r.snap(1, "Row 0 and column 0 are 0: the LCS of anything with an empty string is empty.", { vars: { m, n } });
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const v = { i, j, "A[i]": A[i - 1], "B[j]": B[j - 1] };
    if (A[i - 1] === B[j - 1]) {
      c[i][j] = c[i - 1][j - 1] + 1; r.sub[i][j] = "↖";
      r.snap([4, 5], `A[${i}] = B[${j}] = “${A[i - 1]}”: this character can end a common subsequence, so take the LCS of the shorter prefixes and add 1: c[${i}][${j}] = ${c[i - 1][j - 1]} + 1 = ${c[i][j]}.`, { cur: [i, j], deps: [[i - 1, j - 1]], best: [[i - 1, j - 1]], vars: { ...v, "c[i][j]": c[i][j] } });
    } else {
      const up = c[i - 1][j], left = c[i][j - 1];
      c[i][j] = Math.max(up, left); r.sub[i][j] = up >= left ? "↑" : "←";
      r.snap([4, 6], `“${A[i - 1]}” ≠ “${B[j - 1]}”: one of them isn't in the LCS. Drop A[${i}] (↑ ${up}) or drop B[${j}] (← ${left}) and keep the better: ${c[i][j]}.`, { cur: [i, j], deps: [[i - 1, j], [i, j - 1]], best: [up >= left ? [i - 1, j] : [i, j - 1]], vars: { ...v, "c[i][j]": c[i][j] } });
    }
  }
  let i = m, j = n;
  const out = [];
  r.path.push([i, j]);
  r.snap(7, `c[${m}][${n}] = ${c[m][n]} is the length. Now walk back from the bottom-right corner to recover the characters.`, { cur: [m, n], vars: { length: c[m][n] } });
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) { out.unshift(A[i - 1]); i--; j--; r.path.push([i, j]); r.snap(8, `“${A[i]}” matches: it's in the LCS. Go ↖ to (${i}, ${j}).`, { cur: [i, j], take: [i + 1, j + 1], vars: { i, j, lcs: out.join("") } }); }
    else if (c[i - 1][j] >= c[i][j - 1]) { i--; r.path.push([i, j]); r.snap(9, `No match; c[${i}][${j}] ≥ c[${i + 1}][${j - 1}], so go ↑.`, { cur: [i, j], vars: { i, j, lcs: out.join("") } }); }
    else { j--; r.path.push([i, j]); r.snap(9, `No match; the left cell is larger, so go ←.`, { cur: [i, j], vars: { i, j, lcs: out.join("") } }); }
  }
  const s = out.join("");
  r.snap(null, `LCS length ${c[m][n]}${s ? `: “${s}”` : ""}. (Ties can give other LCSs of the same length.)`, { done: true, vars: { length: c[m][n], lcs: s || "(empty)" } });
  return { steps: r.steps, rowHeads: ["", ...A], colHeads: ["", ...B], answer: c[m][n], detail: s, table: c };
}

// --- Edit distance ------------------------------------------------------------------
function edit({ a, b }) {
  const A = word(a, "From", 10), B = word(b, "To", 10), m = A.length, n = B.length;
  const r = recorder(["", ...A], ["", ...B]), D = r.T;
  for (let i = 0; i <= m; i++) D[i][0] = i;
  r.snap(1, `Column 0: turning the first i letters of “${A.join("")}” into nothing takes i deletions.`, { vars: { m, n } });
  for (let j = 0; j <= n; j++) D[0][j] = j;
  r.snap(2, `Row 0: building the first j letters of “${B.join("")}” from nothing takes j insertions.`, { vars: { m, n } });
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = A[i - 1] === B[j - 1] ? 0 : 1;
    const del = D[i - 1][j] + 1, ins = D[i][j - 1] + 1, sub = D[i - 1][j - 1] + cost;
    D[i][j] = Math.min(del, ins, sub);
    const best = sub === D[i][j] ? [i - 1, j - 1] : del === D[i][j] ? [i - 1, j] : [i, j - 1];
    r.sub[i][j] = sub === D[i][j] ? (cost ? "S" : "=") : del === D[i][j] ? "D" : "I";
    r.snap([5, 6, 7, 8], `“${A[i - 1]}” vs “${B[j - 1]}”: ${cost ? "different, so substituting costs 1" : "the same, so keeping it is free"}. min(delete ${del}, insert ${ins}, ${cost ? "substitute" : "keep"} ${sub}) = ${D[i][j]}.`, { cur: [i, j], deps: [[i - 1, j], [i, j - 1], [i - 1, j - 1]], best: [best], vars: { i, j, cost, delete: del, insert: ins, [cost ? "substitute" : "keep"]: sub, "D[i][j]": D[i][j] } });
  }
  let i = m, j = n;
  const ops = [];
  r.path.push([i, j]);
  r.snap(9, `D[${m}][${n}] = ${D[m][n]} edits. Walk back to see which ones.`, { cur: [m, n], vars: { distance: D[m][n] } });
  while (i > 0 || j > 0) {
    const cost = i > 0 && j > 0 && A[i - 1] === B[j - 1] ? 0 : 1;
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + cost) { ops.unshift(cost ? `substitute ${A[i - 1]} → ${B[j - 1]}` : `keep ${A[i - 1]}`); i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { ops.unshift(`delete ${A[i - 1]}`); i--; }
    else { ops.unshift(`insert ${B[j - 1]}`); j--; }
    r.path.push([i, j]);
    r.snap(9, `${ops[0][0].toUpperCase()}${ops[0].slice(1)}${ops[0].startsWith("keep") ? " (free)" : " (1 edit)"}, moving back to (${i}, ${j}).`, { cur: [i, j], vars: { i, j, edits: ops.filter((o) => !o.startsWith("keep")).length } });
  }
  const real = ops.filter((o) => !o.startsWith("keep"));
  r.snap(null, `Edit distance ${D[m][n]}: ${real.join(", ") || "the strings are equal"}.`, { done: true, vars: { distance: D[m][n] } });
  return { steps: r.steps, rowHeads: ["", ...A], colHeads: ["", ...B], answer: D[m][n], detail: real.join(", "), ops, table: D };
}

// --- 0/1 knapsack ---------------------------------------------------------------------
function knapsack({ w, v, cap }) {
  const wt = nums(w, "Weights", { max: 50, len: [1, 7] }), val = nums(v, "Values", { max: 999, len: [wt.length, wt.length] });
  const W = int(cap, "Capacity", 1, 50), n = wt.length;
  const rows = ["0", ...wt.map((x, i) => `${i + 1} (${x}, ${val[i]})`)], cols = Array.from({ length: W + 1 }, (_, i) => String(i));
  const r = recorder(rows, cols), K = r.T;
  for (let c = 0; c <= W; c++) K[0][c] = 0;
  r.snap(1, "Row 0: with no items to choose from, every capacity is worth 0.", { vars: { n, W } });
  for (let i = 1; i <= n; i++) for (let c = 0; c <= W; c++) {
    const skip = K[i - 1][c], vars = { i, w: c, "wt[i]": wt[i - 1], "val[i]": val[i - 1], skip };
    if (wt[i - 1] > c) {
      K[i][c] = skip;
      r.snap([4, 5], `Item ${i} weighs ${wt[i - 1]} > ${c}: it doesn't fit, so copy the value from above (${skip}).`, { cur: [i, c], deps: [[i - 1, c]], best: [[i - 1, c]], vars: { ...vars, "K[i][w]": skip } });
    } else {
      const take = K[i - 1][c - wt[i - 1]] + val[i - 1];
      K[i][c] = Math.max(skip, take);
      r.sub[i][c] = take > skip ? "✓" : null;
      r.snap([4, 5, 6], `Capacity ${c}: skip item ${i} (${skip}) or take it (${val[i - 1]} + K[${i - 1}][${c - wt[i - 1]}] = ${take}). ${take > skip ? "Taking it" : "Skipping it"} is better: ${K[i][c]}.`, { cur: [i, c], deps: [[i - 1, c], [i - 1, c - wt[i - 1]]], best: [take > skip ? [i - 1, c - wt[i - 1]] : [i - 1, c]], vars: { ...vars, take, "K[i][w]": K[i][c] } });
    }
  }
  let c = W;
  const taken = [];
  r.path.push([n, W]);
  r.snap(7, `The best value is K[${n}][${W}] = ${K[n][W]}. Trace back to find the items.`, { cur: [n, W], vars: { best: K[n][W] } });
  for (let i = n; i >= 1; i--) {
    if (K[i][c] !== K[i - 1][c]) { taken.unshift(i); c -= wt[i - 1]; r.path.push([i - 1, c]); r.snap(7, `K[${i}][${c + wt[i - 1]}] ≠ K[${i - 1}][${c + wt[i - 1]}], so item ${i} was taken. Capacity left: ${c}.`, { cur: [i - 1, c], take: [i, c + wt[i - 1]], vars: { i, w: c, items: taken.join(", ") } }); }
    else { r.path.push([i - 1, c]); r.snap(7, `K[${i}][${c}] = K[${i - 1}][${c}]: item ${i} wasn't needed. Go up.`, { cur: [i - 1, c], vars: { i, w: c, items: taken.join(", ") || "none" } }); }
  }
  const weight = taken.reduce((s, i) => s + wt[i - 1], 0);
  r.snap(null, `Take item${taken.length === 1 ? "" : "s"} ${taken.join(", ") || "none"}: weight ${weight} ≤ ${W}, value ${K[n][W]}.`, { done: true, vars: { best: K[n][W], items: taken.join(", ") || "none", weight } });
  return { steps: r.steps, rowHeads: rows, colHeads: cols, answer: K[n][W], detail: `items ${taken.join(", ") || "none"}`, taken, table: K };
}

// --- Coin change ------------------------------------------------------------------------
function coins({ coins: text, amount }, fewest) {
  const cs = nums(text, "Coins", { max: 50, len: [1, 6] }), N = int(amount, "Amount", 0, 40), k = cs.length;
  const rows = ["none", ...cs.map((c) => `+ ${c}`)], cols = Array.from({ length: N + 1 }, (_, i) => String(i));
  const r = recorder(rows, cols), T = r.T;
  for (let a = 0; a <= N; a++) T[0][a] = a === 0 ? (fewest ? 0 : 1) : (fewest ? INF : 0);
  r.snap(1, fewest ? "With no coins, 0 needs 0 coins and every other amount is impossible (∞)." : "With no coins there is exactly one way to pay 0 (pay nothing) and no way to pay anything else.", { vars: { k, N } });
  for (let i = 1; i <= k; i++) for (let a = 0; a <= N; a++) {
    const c = cs[i - 1], up = T[i - 1][a];
    const vars = { i, ci: c, a, [fewest ? "skip" : "without ci"]: cellText(up) };
    if (c > a) {
      T[i][a] = up;
      r.snap([4, 5], `Coin ${c} is bigger than ${a}, so it can't help: copy ${cellText(up)} from above.`, { cur: [i, a], deps: [[i - 1, a]], best: [[i - 1, a]], vars: { ...vars, result: cellText(up) } });
      continue;
    }
    const left = T[i][a - c];
    if (fewest) {
      const use = left + 1;
      T[i][a] = Math.min(up, use);
      r.sub[i][a] = use < up ? `+${c}` : null;
      r.snap([4, 5], `Amount ${a}: without coin ${c} it takes ${cellText(up)}; with one more ${c} on top of amount ${a - c} it takes ${cellText(left)} + 1 = ${cellText(use)}. Keep ${cellText(T[i][a])}.`, { cur: [i, a], deps: [[i - 1, a], [i, a - c]], best: [use < up ? [i, a - c] : [i - 1, a]], vars: { ...vars, use: cellText(use), result: cellText(T[i][a]) } });
    } else {
      T[i][a] = up + left;
      r.snap([4, 5], `Amount ${a}: ${up} way${up === 1 ? "" : "s"} without coin ${c}, plus ${left} way${left === 1 ? "" : "s"} that use at least one ${c} (pay ${c}, then ${a - c} the same way) = ${T[i][a]}.`, { cur: [i, a], deps: [[i - 1, a], [i, a - c]], best: [[i - 1, a], [i, a - c]], vars: { ...vars, "with ci": left, result: T[i][a] } });
    }
  }
  const ans = T[k][N];
  if (!fewest) {
    r.path.push([k, N]);
    r.snap(null, `${ans} way${ans === 1 ? "" : "s"} to make ${N} from {${cs.join(", ")}}. Each row adds one coin type, so a way is counted once whatever order its coins are paid in.`, { done: true, cur: [k, N], vars: { ways: ans } });
    return { steps: r.steps, rowHeads: rows, colHeads: cols, answer: ans, detail: `${ans} ways`, table: T };
  }
  if (ans === INF) {
    r.snap(null, `${N} can't be made from {${cs.join(", ")}}: the answer is ∞ (impossible, often returned as −1).`, { done: true, cur: [k, N], vars: { coins: "impossible" } });
    return { steps: r.steps, rowHeads: rows, colHeads: cols, answer: -1, detail: "impossible", used: [], table: T };
  }
  let i = k, a = N;
  const used = [];
  r.path.push([i, a]);
  r.snap(6, `${ans} coin${ans === 1 ? "" : "s"}. Trace back to see which.`, { cur: [i, a], vars: { coins: ans } });
  while (a > 0) {
    if (T[i][a] === T[i - 1][a]) { i--; r.path.push([i, a]); r.snap(6, `Same value above: coin ${cs[i]} isn't needed here. Go ↑.`, { cur: [i, a], vars: { a, used: used.join(" + ") || "–" } }); }
    else { used.push(cs[i - 1]); a -= cs[i - 1]; r.path.push([i, a]); r.snap(6, `Use a ${cs[i - 1]}: ${a} left. Go ← by ${cs[i - 1]}.`, { cur: [i, a], take: [i, a + cs[i - 1]], vars: { a, used: used.join(" + ") } }); }
  }
  const greedy = greedyCoins(cs, N);
  r.snap(null, `${N} = ${used.join(" + ")}: ${ans} coin${ans === 1 ? "" : "s"}.${greedy !== ans ? ` Greedy (always the largest coin that fits) would ${greedy === INF ? "get stuck" : `use ${greedy}`}: that's why this needs DP.` : ""}`, { done: true, vars: { coins: ans, used: used.join(" + ") } });
  return { steps: r.steps, rowHeads: rows, colHeads: cols, answer: ans, detail: used.join(" + "), used, table: T };
}

function greedyCoins(cs, N) {
  let left = N, count = 0;
  for (const c of [...cs].sort((a, b) => b - a)) { count += Math.floor(left / c); left %= c; }
  return left ? INF : count;
}

// --- Matrix chain ------------------------------------------------------------------------
function mcm({ p: text }) {
  const p = nums(text, "Dimensions", { max: 99, len: [3, 9] }), n = p.length - 1;
  const heads = Array.from({ length: n }, (_, i) => `A${i + 1}`);
  const r = recorder(heads, heads), M = r.T, S = table(n, n);
  const at = (i, j) => [i - 1, j - 1];
  for (let i = 1; i <= n; i++) M[i - 1][i - 1] = 0;
  r.snap(1, `${n} matrices: A${1} is ${p[0]}×${p[1]}${n > 1 ? `, …, A${n} is ${p[n - 1]}×${p[n]}` : ""}. A chain of one matrix needs no multiplications.`, { vars: { n } });
  for (let len = 2; len <= n; len++) for (let i = 1; i <= n - len + 1; i++) {
    const j = i + len - 1;
    M[i - 1][j - 1] = INF;
    r.snap([2, 3, 4], `Chain A${i}…A${j} (length ${len}): try every place to split it.`, { cur: at(i, j), vars: { len, i, j } });
    for (let k = i; k < j; k++) {
      const q = M[i - 1][k - 1] + M[k][j - 1] + p[i - 1] * p[k] * p[j];
      const better = q < M[i - 1][j - 1];
      if (better) { M[i - 1][j - 1] = q; S[i - 1][j - 1] = k; r.sub[i - 1][j - 1] = `k=${k}`; }
      r.snap(better ? [6, 7] : 6, `Split after A${k}: (A${i}…A${k})(A${k + 1}…A${j}) costs ${M[i - 1][k - 1]} + ${M[k][j - 1]} + ${p[i - 1]}·${p[k]}·${p[j]} = ${q}.${better ? " Best so far." : ` Not better than ${M[i - 1][j - 1]}.`}`, { cur: at(i, j), deps: [at(i, k), at(k + 1, j)], best: better ? [at(i, k), at(k + 1, j)] : [], vars: { len, i, j, k, q, "m[i][j]": M[i - 1][j - 1], "s[i][j]": S[i - 1][j - 1] } });
    }
  }
  const paren = (i, j) => (i === j ? `A${i}` : `(${paren(i, S[i - 1][j - 1])}${paren(S[i - 1][j - 1] + 1, j)})`);
  const splits = (i, j) => (i === j ? [] : [at(i, j), ...splits(i, S[i - 1][j - 1]), ...splits(S[i - 1][j - 1] + 1, j)]);
  const order = paren(1, n);
  r.path.push(...splits(1, n));
  r.snap(8, `Follow the splits from s[1][${n}] = ${S[0][n - 1] ?? "–"}: ${order}.`, { cur: at(1, n), vars: { cost: M[0][n - 1] } });
  r.snap(null, `Minimum cost ${M[0][n - 1]} scalar multiplications with ${order}. Multiplying left to right would cost ${leftToRight(p)}.`, { done: true, vars: { cost: M[0][n - 1], order } });
  return { steps: r.steps, rowHeads: heads, colHeads: heads, answer: M[0][n - 1], detail: order, order, table: M, lower: true };
}
const leftToRight = (p) => { let cost = 0; for (let k = 2; k < p.length; k++) cost += p[0] * p[k - 1] * p[k]; return cost; };

// --- LIS --------------------------------------------------------------------------------
function lis({ a }) {
  const A = nums(a, "Sequence", { min: -999, max: 999, len: [1, 14] }), n = A.length;
  const r = recorder(["A", "L", "prev"], A.map((_, i) => String(i))), T = r.T;
  A.forEach((v, i) => { T[0][i] = v; });
  r.snap(null, "L[i] will be the length of the longest increasing subsequence that ends exactly at A[i].", { vars: { n } });
  for (let i = 0; i < n; i++) {
    T[1][i] = 1; T[2][i] = -1;
    r.snap([1, 2], `A[${i}] = ${A[i]} on its own is a run of length 1.`, { cur: [1, i], vars: { i, "A[i]": A[i], "L[i]": 1 } });
    for (let j = 0; j < i; j++) {
      const ok = A[j] < A[i], better = ok && T[1][j] + 1 > T[1][i];
      if (better) { T[1][i] = T[1][j] + 1; T[2][i] = j; }
      r.snap(better ? [4, 5] : 4, !ok ? `A[${j}] = ${A[j]} is not less than ${A[i]}: ${A[i]} can't follow it.` : better ? `${A[i]} can follow ${A[j]}, whose run has length ${T[1][j]}: L[${i}] ← ${T[1][i]}, prev[${i}] ← ${j}.` : `${A[i]} can follow ${A[j]}, but ${T[1][j]} + 1 isn't longer than ${T[1][i]}.`,
        { cur: [1, i], deps: [[1, j], [0, j]], best: better ? [[1, j]] : [], vars: { i, j, "A[i]": A[i], "A[j]": A[j], "L[j]": T[1][j], "L[i]": T[1][i] } });
    }
  }
  const best = Math.max(...T[1]);
  let e = T[1].indexOf(best);
  const idx = [];
  while (e !== -1) { idx.unshift(e); r.path.push([0, e]); e = T[2][e]; }
  const seq = idx.map((i) => A[i]);
  r.snap(6, `The longest run ends at index ${idx.at(-1)} (L = ${best}). Following prev back gives ${seq.join(", ")}.`, { vars: { length: best, lis: seq } });
  r.snap(null, `LIS length ${best}: ${seq.join(", ")}.`, { done: true, vars: { length: best, lis: seq } });
  return { steps: r.steps, rowHeads: ["A", "L", "prev"], colHeads: A.map((_, i) => String(i)), answer: best, detail: seq.join(", "), seq, table: T };
}

// --- Fibonacci ----------------------------------------------------------------------------
function fibMemo({ n: nn }) {
  const n = int(nn, "n", 0, 12);
  const r = recorder(["memo"], Array.from({ length: n + 1 }, (_, i) => String(i))), memo = r.T[0];
  const nodes = new Map();
  let calls = 0, hits = 0;
  const tree = () => {
    const build = (id) => { const x = nodes.get(id); return { id, label: x.label, state: x.state, kids: x.kids.map(build) }; };
    return build(0);
  };
  const snap = (line, note, extra = {}) => r.snap(line, note, { tree: tree(), calls, hits, ...extra });
  const call = (k, parent, stack) => {
    const id = nodes.size;
    nodes.set(id, { label: `fib(${k})`, state: "open", kids: [] });
    if (parent != null) nodes.get(parent).kids.push(id);
    calls++;
    const vars = { n: k, depth: stack.length, stack: [...stack, k].join(" → ") };
    snap(1, `Call fib(${k}).`, { lit: [id], vars });
    if (k <= 1) {
      Object.assign(nodes.get(id), { state: "expanded", label: `fib(${k}) = ${k}` });
      snap(2, `Base case: fib(${k}) = ${k}.`, { lit: [id], vars: { ...vars, return: k } });
      return k;
    }
    if (memo[k] != null) {
      hits++;
      Object.assign(nodes.get(id), { state: "matched", label: `fib(${k}) = ${memo[k]}` });
      snap(3, `memo[${k}] = ${memo[k]} is already known: return it at once instead of recomputing a whole subtree.`, { lit: [id], cur: [0, k], vars: { ...vars, return: memo[k] } });
      return memo[k];
    }
    snap(4, `memo[${k}] is empty: compute fib(${k - 1}) and fib(${k - 2}) first.`, { lit: [id], vars });
    const x = call(k - 1, id, [...stack, k]);
    const y = call(k - 2, id, [...stack, k]);
    memo[k] = x + y;
    Object.assign(nodes.get(id), { state: "expanded", label: `fib(${k}) = ${memo[k]}` });
    snap([4, 5], `fib(${k}) = fib(${k - 1}) + fib(${k - 2}) = ${x} + ${y} = ${memo[k]}. Store it in memo[${k}].`, { lit: [id], cur: [0, k], deps: k - 2 >= 2 ? [[0, k - 1], [0, k - 2]] : k - 1 >= 2 ? [[0, k - 1]] : [], vars: { ...vars, return: memo[k] } });
    return memo[k];
  };
  const ans = call(n, null, []);
  const naive = 2 * fibNum(n + 1) - 1;
  r.snap(null, `fib(${n}) = ${ans} using ${calls} call${calls > 1 ? "s" : ""} (${hits} answered from the memo). Plain recursion would make ${naive} calls: it recomputes the same subproblems again and again.`, { done: true, tree: tree(), calls, hits, vars: { "fib(n)": ans, calls, "naive calls": naive } });
  return { steps: r.steps, rowHeads: ["memo"], colHeads: r.T[0].map((_, i) => String(i)), answer: ans, detail: `${calls} calls vs ${naive}`, calls, naive, table: r.T };
}

function fibTable({ n: nn }) {
  const n = int(nn, "n", 1, 30);
  const r = recorder(["F"], Array.from({ length: n + 1 }, (_, i) => String(i))), F = r.T[0];
  F[0] = 0; F[1] = 1;
  r.snap(1, "Fill the two base cases first.", { vars: { n } });
  for (let i = 2; i <= n; i++) {
    F[i] = F[i - 1] + F[i - 2];
    r.snap([2, 3], `F[${i}] = F[${i - 1}] + F[${i - 2}] = ${F[i - 1]} + ${F[i - 2]} = ${F[i]}. No recursion: both inputs are already in the table.`, { cur: [0, i], deps: [[0, i - 1], [0, i - 2]], best: [[0, i - 1], [0, i - 2]], vars: { i, "F[i−1]": F[i - 1], "F[i−2]": F[i - 2], "F[i]": F[i] } });
  }
  r.snap(4, `F[${n}] = ${F[n]}, after ${Math.max(0, n - 1)} additions.`, { cur: [0, n], done: true, vars: { "F[n]": F[n] } });
  return { steps: r.steps, rowHeads: ["F"], colHeads: F.map((_, i) => String(i)), answer: F[n], detail: `${n - 1} additions`, table: r.T };
}

export function fibNum(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; }
