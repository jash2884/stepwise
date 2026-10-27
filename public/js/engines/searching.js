// Searching an array: every probe is a step that names the pseudocode line,
// the live variables and the range of indices still in play.

export const ALGORITHMS = {
  linear: {
    name: "Linear search", sorted: false,
    code: [
      "for i ← 0 … n−1",
      "  if A[i] = target then",
      "    return i",
      "return −1  // checked everything: not there",
    ],
    run: linear,
  },
  binary: {
    name: "Binary search", sorted: true,
    code: [
      "lo ← 0; hi ← n − 1",
      "while lo ≤ hi",
      "  mid ← ⌊(lo + hi) / 2⌋",
      "  if A[mid] = target then return mid",
      "  else if A[mid] < target then",
      "    lo ← mid + 1  // target can only be to the right",
      "  else hi ← mid − 1  // target can only be to the left",
      "return −1  // the range is empty",
    ],
    run: binary,
  },
  jump: {
    name: "Jump search", sorted: true,
    code: [
      "m ← ⌊√n⌋; prev ← 0; step ← m",
      "while A[min(step, n) − 1] < target  // last value of this block",
      "  prev ← step; step ← step + m",
      "  if prev ≥ n then return −1",
      "for i ← prev … min(step, n) − 1  // linear scan inside the block",
      "  if A[i] = target then return i",
      "return −1",
    ],
    run: jump,
  },
  interpolation: {
    name: "Interpolation search", sorted: true,
    code: [
      "lo ← 0; hi ← n − 1",
      "while lo ≤ hi and A[lo] ≤ target ≤ A[hi]",
      "  if A[hi] = A[lo] then pos ← lo",
      "  else pos ← lo + ⌊(target − A[lo]) · (hi − lo) / (A[hi] − A[lo])⌋",
      "  if A[pos] = target then return pos",
      "  if A[pos] < target then lo ← pos + 1",
      "  else hi ← pos − 1",
      "return −1",
    ],
    run: interpolation,
  },
  lower: {
    name: "Lower bound", sorted: true,
    code: [
      "lo ← 0; hi ← n  // the answer is somewhere in [lo, hi]",
      "while lo < hi",
      "  mid ← ⌊(lo + hi) / 2⌋",
      "  if A[mid] < target then lo ← mid + 1",
      "  else hi ← mid  // mid itself might be the answer",
      "return lo  // first index with A[i] ≥ target",
    ],
    run: (r) => bound(r, false),
  },
  upper: {
    name: "Upper bound", sorted: true,
    code: [
      "lo ← 0; hi ← n  // the answer is somewhere in [lo, hi]",
      "while lo < hi",
      "  mid ← ⌊(lo + hi) / 2⌋",
      "  if A[mid] ≤ target then lo ← mid + 1",
      "  else hi ← mid  // mid itself might be the answer",
      "return lo  // first index with A[i] > target",
    ],
    run: (r) => bound(r, true),
  },
};

export const COMPLEXITY = [
  { id: "linear", cells: ["Linear", "O(1)", "O(n)", "O(n)", "No"] },
  { id: "binary", cells: ["Binary", "O(1)", "O(log n)", "O(log n)", "Yes"] },
  { id: "jump", cells: ["Jump", "O(1)", "O(√n)", "O(√n)", "Yes"] },
  { id: "interpolation", cells: ["Interpolation", "O(1)", "O(log log n) if uniform", "O(n)", "Yes"] },
  { id: "lower", cells: ["Lower / upper bound", "O(log n)", "O(log n)", "O(log n)", "Yes"] },
];

function recorder(A, target) {
  const r = {
    A, target, n: A.length, probes: 0, steps: [], out: new Set(),
    // Mark every index outside [lo, hi] as ruled out.
    keep(lo, hi) { for (let i = 0; i < r.n; i++) if (i < lo || i > hi) r.out.add(i); },
    snap(line, note, extra = {}) { r.steps.push({ line, note, probes: r.probes, out: [...r.out], ...extra }); },
    probe(i) { r.probes++; return A[i]; },
  };
  return r;
}

export function run(algo, values, target) {
  const a = ALGORITHMS[algo];
  if (!a) throw new Error(`Unknown algorithm ${algo}.`);
  const A = a.sorted ? [...values].sort((x, y) => x - y) : [...values];
  const r = recorder(A, target);
  const resorted = a.sorted && A.some((v, i) => v !== values[i]);
  r.snap(null, `${a.name} for ${target} in ${A.length} values.${resorted ? " It needs a sorted array, so the values were sorted first." : ""}`, { vars: { n: A.length, target } });
  const index = a.run(r);
  return { A, steps: r.steps, index, probes: r.probes, resorted };
}

function linear(r) {
  const { A, n, target } = r;
  for (let i = 0; i < n; i++) {
    r.snap(1, `Look at index ${i}.`, { ptrs: { i }, vars: { n, target, i } });
    const v = r.probe(i);
    if (v === target) {
      r.snap(3, `A[${i}] = ${v} is the target: found it at index ${i} after ${r.probes} comparison${r.probes > 1 ? "s" : ""}.`, { ptrs: { i }, probe: i, found: i, done: true, vars: { n, target, i, "A[i]": v } });
      return i;
    }
    r.out.add(i);
    r.snap(2, `A[${i}] = ${v} ≠ ${target}, so move on.`, { ptrs: { i }, probe: i, vars: { n, target, i, "A[i]": v } });
  }
  r.snap(4, `Every element has been checked and none equals ${target}: return −1. An unsuccessful search always costs n = ${n} comparisons.`, { done: true, miss: true, vars: { n, target, result: -1 } });
  return -1;
}

function binary(r) {
  const { A, n, target } = r;
  let lo = 0, hi = n - 1;
  r.snap(1, `The target could be anywhere in A[0..${n - 1}].`, { range: [lo, hi], ptrs: { lo, hi }, vars: { target, lo, hi } });
  while (lo <= hi) {
    r.snap(2, `lo = ${lo} ≤ hi = ${hi}: there are ${hi - lo + 1} candidate${hi > lo ? "s" : ""} left.`, { range: [lo, hi], ptrs: { lo, hi }, vars: { target, lo, hi } });
    const mid = Math.floor((lo + hi) / 2);
    r.snap(3, `mid = ⌊(${lo} + ${hi}) / 2⌋ = ${mid}: probe the middle of the range.`, { range: [lo, hi], ptrs: { lo, mid, hi }, vars: { target, lo, hi, mid } });
    const v = r.probe(mid);
    if (v === target) {
      r.snap(4, `A[${mid}] = ${v} = target: found at index ${mid} after ${r.probes} probe${r.probes > 1 ? "s" : ""}.`, { range: [lo, hi], ptrs: { lo, mid, hi }, probe: mid, found: mid, done: true, vars: { target, lo, hi, mid, "A[mid]": v } });
      return mid;
    }
    if (v < target) {
      lo = mid + 1; r.keep(lo, hi);
      r.snap(6, `A[${mid}] = ${v} < ${target}, and the array is sorted, so everything at or left of mid is too small. Throw it away: lo ← ${lo}.`, { range: [lo, hi], ptrs: { lo, mid, hi }, probe: mid, vars: { target, lo, hi, mid, "A[mid]": v } });
    } else {
      hi = mid - 1; r.keep(lo, hi);
      r.snap(7, `A[${mid}] = ${v} > ${target}, so everything at or right of mid is too big. Throw it away: hi ← ${hi}.`, { range: [lo, hi], ptrs: { lo, mid, hi }, probe: mid, vars: { target, lo, hi, mid, "A[mid]": v } });
    }
  }
  r.snap(8, `lo = ${lo} > hi = ${hi}: the range is empty, so ${target} isn't in the array. Return −1 (it would belong at index ${lo}).`, { ptrs: { lo, hi }, done: true, miss: true, vars: { target, lo, hi, result: -1 } });
  return -1;
}

function jump(r) {
  const { A, n, target } = r;
  const m = Math.max(1, Math.floor(Math.sqrt(n)));
  let prev = 0, step = m;
  r.snap(1, `Jump in blocks of ⌊√${n}⌋ = ${m}, checking only the last value of each block.`, { range: [0, Math.min(step, n) - 1], ptrs: { prev, end: Math.min(step, n) - 1 }, vars: { n, target, m, prev, step } });
  for (;;) {
    const end = Math.min(step, n) - 1, v = r.probe(end);
    if (!(v < target)) {
      r.snap(2, `A[${end}] = ${v} ≥ ${target}: if the target is anywhere, it is in this block A[${prev}..${end}].`, { range: [prev, end], probe: end, ptrs: { prev, end }, vars: { n, target, m, prev, step, [`A[${end}]`]: v } });
      break;
    }
    for (let i = prev; i <= end; i++) r.out.add(i);
    prev = step; step += m;
    r.snap(3, `A[${end}] = ${v} < ${target}: the whole block is too small. Jump ahead: prev ← ${prev}, step ← ${step}.`, { range: prev < n ? [prev, Math.min(step, n) - 1] : null, probe: end, ptrs: { prev: Math.min(prev, n - 1), end: Math.min(step, n) - 1 }, vars: { n, target, m, prev, step, [`A[${end}]`]: v } });
    if (prev >= n) {
      r.snap(4, `prev = ${prev} has run off the end: every value is smaller than ${target}. Return −1.`, { done: true, miss: true, vars: { n, target, prev, result: -1 } });
      return -1;
    }
  }
  const end = Math.min(step, n) - 1;
  for (let i = prev; i <= end; i++) {
    const v = r.probe(i);
    if (v === target) {
      r.snap(6, `Linear scan: A[${i}] = ${v} = target. Found at index ${i} after ${r.probes} probes.`, { range: [prev, end], probe: i, found: i, ptrs: { i }, done: true, vars: { n, target, prev, i, "A[i]": v } });
      return i;
    }
    r.out.add(i);
    r.snap(5, `Linear scan: A[${i}] = ${v} ≠ ${target}.`, { range: [prev, end], probe: i, ptrs: { i }, vars: { n, target, prev, i, "A[i]": v } });
    if (v > target) break; // sorted: nothing later in the block can match
  }
  r.snap(7, `${target} isn't in the block, so it isn't in the array. Return −1.`, { done: true, miss: true, vars: { n, target, result: -1 } });
  return -1;
}

function interpolation(r) {
  const { A, n, target } = r;
  let lo = 0, hi = n - 1;
  r.snap(1, "Like binary search, but guess where the target should be from its value, the way you'd open a dictionary near the right letter.", { range: [lo, hi], ptrs: { lo, hi }, vars: { target, lo, hi } });
  while (lo <= hi && A[lo] <= target && target <= A[hi]) {
    r.snap(2, `${A[lo]} ≤ ${target} ≤ ${A[hi]}, so the target could be in A[${lo}..${hi}].`, { range: [lo, hi], ptrs: { lo, hi }, vars: { target, lo, hi, "A[lo]": A[lo], "A[hi]": A[hi] } });
    let pos;
    if (A[hi] === A[lo]) {
      pos = lo;
      r.snap(3, `A[lo] = A[hi], so every value in the range is equal: pos ← lo = ${pos}.`, { range: [lo, hi], ptrs: { lo, pos, hi }, vars: { target, lo, hi, pos } });
    } else {
      pos = lo + Math.floor(((target - A[lo]) * (hi - lo)) / (A[hi] - A[lo]));
      r.snap(4, `${target} is ${(((target - A[lo]) / (A[hi] - A[lo])) * 100).toFixed(0)}% of the way from ${A[lo]} to ${A[hi]}, so guess pos = ${lo} + ⌊(${target} − ${A[lo]})·${hi - lo} / ${A[hi] - A[lo]}⌋ = ${pos}.`, { range: [lo, hi], ptrs: { lo, pos, hi }, vars: { target, lo, hi, pos } });
    }
    const v = r.probe(pos);
    if (v === target) {
      r.snap(5, `A[${pos}] = ${v} = target: found at index ${pos}.`, { range: [lo, hi], probe: pos, found: pos, ptrs: { lo, pos, hi }, done: true, vars: { target, lo, hi, pos, "A[pos]": v } });
      return pos;
    }
    if (v < target) { lo = pos + 1; r.keep(lo, hi); r.snap(6, `A[${pos}] = ${v} < ${target}: lo ← ${lo}.`, { range: [lo, hi], probe: pos, ptrs: { lo, pos, hi }, vars: { target, lo, hi, pos, "A[pos]": v } }); }
    else { hi = pos - 1; r.keep(lo, hi); r.snap(7, `A[${pos}] = ${v} > ${target}: hi ← ${hi}.`, { range: [lo, hi], probe: pos, ptrs: { lo, pos, hi }, vars: { target, lo, hi, pos, "A[pos]": v } }); }
  }
  r.keep(n, n);
  r.snap(8, lo > hi ? `The range is empty: ${target} isn't in the array. Return −1.` : `${target} lies outside [${A[lo]}, ${A[hi]}], so it can't be in the range. Return −1.`, { done: true, miss: true, ptrs: { lo: Math.min(lo, n - 1), hi: Math.max(hi, 0) }, vars: { target, lo, hi, result: -1 } });
  return -1;
}

function bound(r, upper) {
  const { A, n, target } = r, op = upper ? "≤" : "<", want = upper ? ">" : "≥";
  let lo = 0, hi = n;
  r.snap(1, `Find the first index whose value is ${want} ${target}. If there is none, the answer is n = ${n}, one past the end.`, { range: [lo, hi - 1], ptrs: { lo, hi }, vars: { target, lo, hi } });
  while (lo < hi) {
    r.snap(2, `lo = ${lo} < hi = ${hi}: ${hi - lo} candidate${hi - lo > 1 ? "s" : ""} left.`, { range: [lo, hi - 1], ptrs: { lo, hi }, vars: { target, lo, hi } });
    const mid = Math.floor((lo + hi) / 2);
    r.snap(3, `mid = ⌊(${lo} + ${hi}) / 2⌋ = ${mid}.`, { range: [lo, hi - 1], ptrs: { lo, mid, hi }, vars: { target, lo, hi, mid } });
    const v = r.probe(mid);
    if (upper ? v <= target : v < target) {
      lo = mid + 1; r.keep(lo, hi - 1);
      r.snap(4, `A[${mid}] = ${v} ${op} ${target}: mid and everything before it is too small. lo ← ${lo}.`, { range: [lo, hi - 1], probe: mid, ptrs: { lo, mid, hi }, vars: { target, lo, hi, mid, "A[mid]": v } });
    } else {
      hi = mid; r.keep(lo, hi);
      r.snap(5, `A[${mid}] = ${v} ${want} ${target}: mid could be the answer, but maybe something earlier is too. hi ← ${hi} (keep mid).`, { range: [lo, hi], probe: mid, ptrs: { lo, mid, hi }, vars: { target, lo, hi, mid, "A[mid]": v } });
    }
  }
  r.keep(lo, lo);
  r.snap(6, lo < n ? `lo = hi = ${lo}: A[${lo}] = ${A[lo]} is the first value ${want} ${target}.` : `lo = hi = ${n}: no value is ${want} ${target}, so the answer is n.`, { found: lo < n ? lo : null, done: true, ptrs: { lo }, vars: { target, lo, hi, result: lo } });
  return lo;
}

export function parseValues(text) {
  const vals = String(text).split(/[\s,]+/).filter(Boolean).map(Number);
  if (vals.some((v) => !Number.isInteger(v))) throw new Error("Enter whole numbers separated by spaces or commas.");
  if (vals.length < 1) throw new Error("Enter at least one number.");
  if (vals.length > 20) throw new Error("Use at most 20 numbers so every cell stays readable.");
  if (vals.some((v) => v < -999 || v > 999)) throw new Error("Use numbers from −999 to 999.");
  return vals;
}

export function randomValues(r = Math.random, n = 14, max = 99) {
  return Array.from({ length: n }, () => 1 + Math.floor(r() * max)).sort((a, b) => a - b);
}

// The indices binary search probes, in order (for practice questions).
export function binaryProbes(A, target) {
  return run("binary", A, target).steps.filter((s) => s.line === 3).map((s) => s.vars.mid);
}
