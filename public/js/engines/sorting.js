// Sorting algorithms that record every comparison and move. Elements keep a
// stable id so the view can slide each bar to its new place. Every step names
// the pseudocode line being executed and the variables at that moment.

export const ALGORITHMS = {
  bubble: {
    name: "Bubble sort",
    code: [
      "for i ← 0 … n−2",
      "  swapped ← false",
      "  for j ← 0 … n−2−i",
      "    if A[j] > A[j+1] then",
      "      swap A[j], A[j+1]; swapped ← true",
      "  A[n−1−i] is now in place  // the largest bubbled up",
      "  if not swapped then stop  // no swaps: already sorted",
    ],
    run: bubble,
  },
  selection: {
    name: "Selection sort",
    code: [
      "for i ← 0 … n−2",
      "  min ← i",
      "  for j ← i+1 … n−1",
      "    if A[j] < A[min] then",
      "      min ← j",
      "  swap A[i], A[min]",
      "  A[i] is now in place",
    ],
    run: selection,
  },
  insertion: {
    name: "Insertion sort",
    code: [
      "for i ← 1 … n−1",
      "  key ← A[i]; j ← i − 1",
      "  while j ≥ 0 and A[j] > key",
      "    A[j+1] ← A[j]  // shift right",
      "    j ← j − 1",
      "  A[j+1] ← key",
    ],
    run: insertion,
  },
  shell: {
    name: "Shell sort",
    code: [
      "gap ← ⌊n/2⌋",
      "while gap > 0",
      "  for i ← gap … n−1",
      "    temp ← A[i]; j ← i",
      "    while j ≥ gap and A[j−gap] > temp",
      "      A[j] ← A[j−gap]; j ← j − gap",
      "    A[j] ← temp",
      "  gap ← ⌊gap/2⌋",
    ],
    run: shell,
  },
  merge: {
    name: "Merge sort",
    code: [
      "mergeSort(A, lo, hi):",
      "  if lo ≥ hi then return",
      "  mid ← ⌊(lo + hi) / 2⌋",
      "  mergeSort(A, lo, mid); mergeSort(A, mid+1, hi)",
      "merge(A, lo, mid, hi):",
      "  i ← lo; j ← mid+1; k ← lo",
      "  while i ≤ mid and j ≤ hi",
      "    if A[i] ≤ A[j] then T[k++] ← A[i++]",
      "    else T[k++] ← A[j++]",
      "  copy the rest of either half into T",
      "  A[lo..hi] ← T[lo..hi]",
    ],
    run: merge,
  },
  quick: {
    name: "Quick sort (Lomuto)",
    code: [
      "quickSort(A, lo, hi):",
      "  if lo < hi then",
      "    p ← partition(A, lo, hi)",
      "    quickSort(A, lo, p−1); quickSort(A, p+1, hi)",
      "partition(A, lo, hi):",
      "  pivot ← A[hi]; i ← lo − 1",
      "  for j ← lo … hi−1",
      "    if A[j] ≤ pivot then",
      "      i ← i + 1; swap A[i], A[j]",
      "  swap A[i+1], A[hi]  // pivot lands in its final place",
      "  return i + 1",
    ],
    run: quick,
  },
  heap: {
    name: "Heap sort",
    code: [
      "for i ← ⌊n/2⌋−1 down to 0  // build a max-heap",
      "  siftDown(A, i, n)",
      "for end ← n−1 down to 1",
      "  swap A[0], A[end]  // the max goes to the end",
      "  siftDown(A, 0, end)",
      "siftDown(A, i, size):",
      "  largest ← i; l ← 2i+1; r ← 2i+2",
      "  if l < size and A[l] > A[largest] then largest ← l",
      "  if r < size and A[r] > A[largest] then largest ← r",
      "  if largest ≠ i then swap A[i], A[largest]; siftDown(A, largest, size)",
    ],
    run: heap,
  },
  counting: {
    name: "Counting sort",
    code: [
      "count[min..max] ← 0",
      "for each x in A: count[x] ← count[x] + 1",
      "for v ← min+1 … max: count[v] ← count[v] + count[v−1]",
      "for i ← n−1 down to 0  // backwards keeps it stable",
      "  count[A[i]] ← count[A[i]] − 1",
      "  B[count[A[i]]] ← A[i]",
      "A ← B",
    ],
    run: counting,
  },
  radix: {
    name: "Radix sort (LSD)",
    code: [
      "for exp ← 1, 10, 100, … while max ÷ exp ≥ 1",
      "  bucket[0..9] ← empty",
      "  for each x in A, left to right",
      "    append x to bucket[⌊x ÷ exp⌋ mod 10]",
      "  A ← bucket[0] + bucket[1] + … + bucket[9]",
    ],
    run: radix,
  },
};

export const COMPLEXITY = [
  { id: "bubble", name: "Bubble", best: "O(n)", avg: "O(n²)", worst: "O(n²)", space: "O(1)", stable: true, inPlace: true },
  { id: "selection", name: "Selection", best: "O(n²)", avg: "O(n²)", worst: "O(n²)", space: "O(1)", stable: false, inPlace: true },
  { id: "insertion", name: "Insertion", best: "O(n)", avg: "O(n²)", worst: "O(n²)", space: "O(1)", stable: true, inPlace: true },
  { id: "shell", name: "Shell (n/2 gaps)", best: "O(n log n)", avg: "≈ O(n^1.5)", worst: "O(n²)", space: "O(1)", stable: false, inPlace: true },
  { id: "merge", name: "Merge", best: "O(n log n)", avg: "O(n log n)", worst: "O(n log n)", space: "O(n)", stable: true, inPlace: false },
  { id: "quick", name: "Quick", best: "O(n log n)", avg: "O(n log n)", worst: "O(n²)", space: "O(log n)", stable: false, inPlace: true },
  { id: "heap", name: "Heap", best: "O(n log n)", avg: "O(n log n)", worst: "O(n log n)", space: "O(1)", stable: false, inPlace: true },
  { id: "counting", name: "Counting", best: "O(n + k)", avg: "O(n + k)", worst: "O(n + k)", space: "O(n + k)", stable: true, inPlace: false },
  { id: "radix", name: "Radix (LSD)", best: "O(d(n + b))", avg: "O(d(n + b))", worst: "O(d(n + b))", space: "O(n + b)", stable: true, inPlace: false },
];

// Records steps. A holds { id, v } objects; null marks an empty slot (an element
// that is temporarily in T, B or a bucket).
function recorder(values) {
  const r = {
    A: values.map((v, id) => ({ id, v })),
    T: null, steps: [], comparisons: 0, writes: 0, sorted: new Set(),
    snap(line, note, extra = {}) {
      r.steps.push({
        A: r.A.map((x) => (x ? { ...x } : null)), T: r.T ? r.T.map((x) => (x ? { ...x } : null)) : null,
        sorted: [...r.sorted], line, note, comparisons: r.comparisons, writes: r.writes, ...extra,
      });
    },
    less(x, y) { r.comparisons++; return x < y; },
    swap(i, j) { if (i !== j) { [r.A[i], r.A[j]] = [r.A[j], r.A[i]]; r.writes += 2; } },
  };
  return r;
}

export function run(algo, values) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}.`);
  const r = recorder(values);
  r.snap(null, `Start: ${values.length} values. ${ALGORITHMS[algo].name} begins.`, { vars: { n: values.length } });
  ALGORITHMS[algo].run(r);
  r.sorted = new Set(values.map((_, i) => i));
  r.snap(null, `Sorted, using ${r.comparisons} comparisons and ${r.writes} writes.`, { done: true, vars: { n: values.length, comparisons: r.comparisons, writes: r.writes } });
  return { steps: r.steps, comparisons: r.comparisons, writes: r.writes, result: r.A.map((x) => x.v) };
}

function bubble(r) {
  const A = r.A, n = A.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    r.snap(2, `Pass ${i + 1}: walk from the left, swapping neighbours that are out of order.`, { vars: { n, i, swapped }, ptrs: { i: n - 1 - i } });
    for (let j = 0; j < n - 1 - i; j++) {
      const out = r.less(A[j + 1].v, A[j].v);
      r.snap(4, `Compare A[${j}] = ${A[j].v} with A[${j + 1}] = ${A[j + 1].v}: ${out ? "out of order" : "fine"}.`, { cmp: [j, j + 1], vars: { n, i, j, swapped, "A[j]": A[j].v, "A[j+1]": A[j + 1].v }, ptrs: { j } });
      if (out) {
        r.swap(j, j + 1); swapped = true;
        r.snap(5, `Swap them: ${A[j].v} moves left, ${A[j + 1].v} moves right.`, { swap: [j, j + 1], vars: { n, i, j, swapped }, ptrs: { j } });
      }
    }
    r.sorted.add(n - 1 - i);
    r.snap(6, `End of pass ${i + 1}: ${A[n - 1 - i].v} has bubbled up to index ${n - 1 - i}, its final place.`, { vars: { n, i, swapped } });
    if (!swapped) {
      for (let k = 0; k < n - 1 - i; k++) r.sorted.add(k);
      r.snap(7, "No swaps in this pass, so the array is already sorted: stop early.", { vars: { n, i, swapped } });
      return;
    }
  }
}

function selection(r) {
  const A = r.A, n = A.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    r.snap(2, `Find the smallest value in A[${i}..${n - 1}]. Start with min = ${i} (${A[i].v}).`, { min, vars: { n, i, min, "A[min]": A[min].v }, ptrs: { i } });
    for (let j = i + 1; j < n; j++) {
      const smaller = r.less(A[j].v, A[min].v);
      r.snap(4, `Is A[${j}] = ${A[j].v} < A[min] = ${A[min].v}? ${smaller ? "Yes" : "No"}.`, { cmp: [j, min], min, vars: { n, i, j, min, "A[j]": A[j].v, "A[min]": A[min].v }, ptrs: { i, j } });
      if (smaller) {
        min = j;
        r.snap(5, `New minimum: min = ${j} (${A[j].v}).`, { min, vars: { n, i, j, min, "A[min]": A[min].v }, ptrs: { i, j } });
      }
    }
    r.swap(i, min);
    r.snap(6, min === i ? `A[${i}] = ${A[i].v} is already the smallest: no swap needed.` : `Swap A[${i}] and A[${min}]: ${A[i].v} goes to index ${i}.`, { swap: [i, min], vars: { n, i, min }, ptrs: { i } });
    r.sorted.add(i);
    r.snap(7, `A[0..${i}] is sorted and final.`, { vars: { n, i } });
  }
}

function insertion(r) {
  const A = r.A, n = A.length;
  r.sorted.add(0);
  for (let i = 1; i < n; i++) {
    const key = A[i].v;
    let j = i - 1, at = i;
    r.snap(2, `Take key = A[${i}] = ${key} and insert it into the sorted part A[0..${i - 1}].`, { key: at, vars: { n, i, key, j }, ptrs: { i, j } });
    for (;;) {
      if (j < 0) { r.snap(3, "j < 0: the key is the smallest so far, so it goes to the front.", { key: at, vars: { n, i, key, j } }); break; }
      const bigger = r.less(key, A[j].v);
      r.snap(3, `Is A[${j}] = ${A[j].v} > key ${key}? ${bigger ? "Yes, keep shifting" : "No, stop here"}.`, { cmp: [j, at], key: at, vars: { n, i, key, j, "A[j]": A[j].v }, ptrs: { j } });
      if (!bigger) break;
      r.swap(j, at); r.writes--; // a shift is one write; the key is written once at the end
      at = j;
      r.snap(4, `Shift ${A[j + 1].v} one place right.`, { swap: [j, j + 1], key: at, vars: { n, i, key, j }, ptrs: { j } });
      j--;
      r.snap(5, `j ← ${j}.`, { key: at, vars: { n, i, key, j }, ptrs: j >= 0 ? { j } : {} });
    }
    r.sorted.add(i);
    r.snap(6, `Place key ${key} at index ${at}. A[0..${i}] is sorted (but not final: later keys can still slot in).`, { key: at, vars: { n, i, key, j }, partial: i });
  }
}

function shell(r) {
  const A = r.A, n = A.length;
  for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
    r.snap(2, `Gap ${gap}: insertion-sort every ${gap === 1 ? "element (a plain insertion sort, now cheap because the array is nearly sorted)" : `${gap}th element, in ${gap} interleaved lists`}.`, { vars: { n, gap } });
    for (let i = gap; i < n; i++) {
      const temp = A[i].v;
      let j = i;
      r.snap(4, `temp ← A[${i}] = ${temp}.`, { key: j, vars: { n, gap, i, j, temp }, ptrs: { i } });
      while (j >= gap) {
        const bigger = r.less(temp, A[j - gap].v);
        r.snap(5, `Is A[${j - gap}] = ${A[j - gap].v} > ${temp}? ${bigger ? "Yes" : "No"}.`, { cmp: [j - gap, j], key: j, vars: { n, gap, i, j, temp }, ptrs: { j } });
        if (!bigger) break;
        r.swap(j - gap, j); r.writes--;
        r.snap(6, `Move ${A[j].v} from index ${j - gap} up to ${j}; j ← ${j - gap}.`, { swap: [j - gap, j], key: j - gap, vars: { n, gap, i, j: j - gap, temp }, ptrs: { j: j - gap } });
        j -= gap;
      }
      r.snap(7, `temp ${temp} stays at index ${j}.`, { key: j, vars: { n, gap, i, j, temp } });
    }
    r.snap(8, `Gap ${gap} done${gap > 1 ? `; next gap ${Math.floor(gap / 2)}` : ""}.`, { vars: { n, gap } });
  }
}

function merge(r) {
  const A = r.A, n = A.length;
  r.T = Array(n).fill(null);
  const sort = (lo, hi, depth) => {
    if (lo >= hi) { r.snap(2, `A[${lo}] alone is already sorted.`, { range: [lo, hi], vars: { lo, hi, depth } }); return; }
    const mid = Math.floor((lo + hi) / 2);
    r.snap(3, `Split A[${lo}..${hi}] at mid = ${mid}: sort the left half, then the right half.`, { range: [lo, hi], split: mid, vars: { lo, hi, mid, depth } });
    sort(lo, mid, depth + 1);
    sort(mid + 1, hi, depth + 1);
    let i = lo, j = mid + 1, k = lo;
    r.snap(6, `Merge the sorted halves A[${lo}..${mid}] and A[${mid + 1}..${hi}] into T.`, { range: [lo, hi], split: mid, vars: { lo, mid, hi, i, j, k } });
    while (i <= mid && j <= hi) {
      const takeLeft = !r.less(A[j].v, A[i].v);
      r.snap(takeLeft ? 8 : 9, `Compare ${A[i].v} and ${A[j].v}: take ${takeLeft ? A[i].v : A[j].v}${A[i].v === A[j].v ? " (ties take the left one, keeping the sort stable)" : ""}.`, { range: [lo, hi], cmp: [i, j], vars: { lo, mid, hi, i, j, k }, ptrs: { i, j } });
      const from = takeLeft ? i++ : j++;
      r.T[k++] = A[from]; A[from] = null; r.writes++;
      r.snap(takeLeft ? 8 : 9, `T[${k - 1}] ← ${r.T[k - 1].v}.`, { range: [lo, hi], vars: { lo, mid, hi, i, j, k }, ptrs: { i: Math.min(i, mid), j: Math.min(j, hi) } });
    }
    const rest = [];
    while (i <= mid) { r.T[k++] = A[i]; rest.push(A[i].v); A[i++] = null; r.writes++; }
    while (j <= hi) { r.T[k++] = A[j]; rest.push(A[j].v); A[j++] = null; r.writes++; }
    if (rest.length) r.snap(10, `One half is used up; copy the rest (${rest.join(", ")}) into T.`, { range: [lo, hi], vars: { lo, mid, hi, i, j, k } });
    for (let t = lo; t <= hi; t++) { A[t] = r.T[t]; r.T[t] = null; r.writes++; }
    if (lo === 0 && hi === n - 1) for (let t = 0; t < n; t++) r.sorted.add(t);
    r.snap(11, `Copy T back: A[${lo}..${hi}] = ${A.slice(lo, hi + 1).map((x) => x.v).join(", ")} is sorted.`, { range: [lo, hi], vars: { lo, mid, hi } });
  };
  sort(0, n - 1, 0);
  r.T = null;
}

function quick(r) {
  const A = r.A;
  const sort = (lo, hi, depth) => {
    if (lo >= hi) {
      if (lo === hi) { r.sorted.add(lo); r.snap(2, `A[${lo}] = ${A[lo].v} alone is in place.`, { range: [lo, hi], vars: { lo, hi, depth } }); }
      return;
    }
    const pivot = A[hi].v;
    let i = lo - 1;
    r.snap(6, `Partition A[${lo}..${hi}] around pivot = A[${hi}] = ${pivot}. i ← ${i}.`, { range: [lo, hi], pivot: hi, vars: { lo, hi, pivot, i }, ptrs: { i: Math.max(i, lo) } });
    for (let j = lo; j < hi; j++) {
      const le = !r.less(pivot, A[j].v);
      r.snap(8, `Is A[${j}] = ${A[j].v} ≤ pivot ${pivot}? ${le ? "Yes: it belongs on the left" : "No: leave it on the right"}.`, { range: [lo, hi], pivot: hi, cmp: [j, hi], vars: { lo, hi, pivot, i, j }, ptrs: { i: Math.max(i, lo), j } });
      if (le) {
        i++;
        r.swap(i, j);
        r.snap(9, i === j ? `i ← ${i}; A[${i}] is already in the left part.` : `i ← ${i}; swap A[${i}] and A[${j}].`, { range: [lo, hi], pivot: hi, swap: [i, j], vars: { lo, hi, pivot, i, j }, ptrs: { i, j } });
      }
    }
    r.swap(i + 1, hi);
    r.sorted.add(i + 1);
    r.snap(10, `Swap the pivot into A[${i + 1}]: everything left of it is ≤ ${pivot}, everything right is greater. ${pivot} is in its final place.`, { range: [lo, hi], pivot: i + 1, swap: [i + 1, hi], vars: { lo, hi, pivot, p: i + 1 } });
    sort(lo, i, depth + 1);
    sort(i + 2, hi, depth + 1);
  };
  sort(0, A.length - 1, 0);
}

function heap(r) {
  const A = r.A, n = A.length;
  const sift = (i, size, phase) => {
    for (;;) {
      let largest = i;
      const l = 2 * i + 1, rr = 2 * i + 2;
      r.snap(7, `Sift down from index ${i} (${A[i].v}): children ${l < size ? `A[${l}] = ${A[l].v}` : "none"}${rr < size ? ` and A[${rr}] = ${A[rr].v}` : ""}.`, { heap: size, cmp: [i, ...(l < size ? [l] : []), ...(rr < size ? [rr] : [])], vars: { phase, size, i, l, r: rr, largest } });
      if (l < size && r.less(A[largest].v, A[l].v)) largest = l;
      if (rr < size && r.less(A[largest].v, A[rr].v)) largest = rr;
      if (largest === i) { r.snap(10, `${A[i].v} is at least as big as its children: the heap property holds here.`, { heap: size, vars: { phase, size, i, largest } }); return; }
      r.swap(i, largest);
      r.snap(10, `Swap with the larger child: ${A[i].v} moves up, ${A[largest].v} moves down to index ${largest}.`, { heap: size, swap: [i, largest], vars: { phase, size, i, largest } });
      i = largest;
    }
  };
  r.snap(1, `Build a max-heap: sift down every internal node, from index ${Math.floor(n / 2) - 1} back to 0.`, { heap: n, vars: { n } });
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) { r.snap(2, `siftDown(A, ${i}, ${n}).`, { heap: n, vars: { n, i } }); sift(i, n, "build"); }
  r.snap(3, `A is a max-heap: A[0] = ${A[0].v} is the largest.`, { heap: n, vars: { n } });
  for (let end = n - 1; end >= 1; end--) {
    r.swap(0, end);
    r.sorted.add(end);
    r.snap(4, `Swap the max A[0] with A[${end}]: ${A[end].v} is now final. The heap shrinks to ${end}.`, { heap: end, swap: [0, end], vars: { n, end } });
    r.snap(5, `Restore the heap: siftDown(A, 0, ${end}).`, { heap: end, vars: { n, end } });
    sift(0, end, "sort");
  }
}

function counting(r) {
  const A = r.A, n = A.length;
  const vals = A.map((x) => x.v), min = Math.min(...vals), max = Math.max(...vals);
  if (max - min > 120) throw new Error("Counting sort here needs values within a range of 120. Try smaller numbers.");
  const count = Array(max - min + 1).fill(0);
  const cnt = () => ({ min, values: count.map((c, k) => ({ v: min + k, c })) });
  r.snap(1, `Values run from ${min} to ${max}, so make ${count.length} counters.`, { counts: cnt(), vars: { n, min, max } });
  for (let i = 0; i < n; i++) {
    count[A[i].v - min]++;
    r.snap(2, `count[${A[i].v}] ← ${count[A[i].v - min]}.`, { counts: cnt(), hotCount: A[i].v, key: i, vars: { n, i, x: A[i].v } });
  }
  for (let v = 1; v < count.length; v++) count[v] += count[v - 1];
  r.snap(3, "Prefix sums: count[v] is now how many values are ≤ v, i.e. one past where the last v goes.", { counts: cnt(), vars: { n, min, max } });
  r.T = Array(n).fill(null);
  for (let i = n - 1; i >= 0; i--) {
    const x = A[i], pos = --count[x.v - min];
    r.T[pos] = x; A[i] = null; r.writes++;
    r.snap(6, `A[${i}] = ${x.v}: count[${x.v}] ← ${pos}, so B[${pos}] ← ${x.v}.`, { counts: cnt(), hotCount: x.v, vars: { n, i, x: x.v, pos } });
  }
  for (let i = 0; i < n; i++) { A[i] = r.T[i]; r.T[i] = null; r.writes++; }
  r.T = null;
  r.snap(7, "Copy B back into A.", { vars: { n } });
}

function radix(r) {
  const A = r.A, n = A.length;
  if (A.some((x) => x.v < 0)) throw new Error("Radix sort here works on non-negative numbers.");
  const max = Math.max(...A.map((x) => x.v));
  for (let exp = 1; Math.floor(max / exp) > 0 || exp === 1; exp *= 10) {
    const buckets = Array.from({ length: 10 }, () => []);
    const show = () => buckets.map((b) => b.map((x) => x.v));
    r.snap(2, `Pass on the ${exp === 1 ? "ones" : exp === 10 ? "tens" : exp === 100 ? "hundreds" : `${exp}s`} digit: empty the 10 buckets.`, { buckets: show(), vars: { exp, max } });
    for (let i = 0; i < n; i++) {
      const x = A[i], d = Math.floor(x.v / exp) % 10;
      buckets[d].push(x); A[i] = null; r.writes++;
      r.snap(4, `${x.v}: digit ${d}, into bucket ${d}.`, { buckets: show(), hotBucket: d, vars: { exp, i, x: x.v, digit: d } });
    }
    let k = 0;
    for (const b of buckets) for (const x of b) { A[k++] = x; r.writes++; }
    r.snap(5, `Collect buckets 0 to 9 in order: ${A.map((x) => x.v).join(", ")}. Each bucket keeps arrival order, which is what makes this work.`, { buckets: show(), vars: { exp } });
    if (exp > 1e9) break;
  }
}

export function randomValues(r = Math.random, n = 10, max = 60) {
  return Array.from({ length: n }, () => 1 + Math.floor(r() * max));
}

export function parseValues(text) {
  const vals = String(text).split(/[\s,]+/).filter(Boolean).map(Number);
  if (vals.some((v) => !Number.isInteger(v))) throw new Error("Enter whole numbers separated by spaces or commas.");
  if (vals.length < 2) throw new Error("Enter at least 2 numbers.");
  if (vals.length > 24) throw new Error("Use at most 24 numbers so every step stays readable.");
  if (vals.some((v) => v < 0 || v > 999)) throw new Error("Use numbers from 0 to 999.");
  return vals;
}

// The array after k passes of the simple sorts (for practice questions).
export function afterPasses(algo, values, k) {
  const A = [...values], n = A.length;
  if (algo === "bubble") for (let i = 0; i < k; i++) for (let j = 0; j < n - 1 - i; j++) { if (A[j] > A[j + 1]) [A[j], A[j + 1]] = [A[j + 1], A[j]]; }
  if (algo === "selection") for (let i = 0; i < k; i++) { let m = i; for (let j = i + 1; j < n; j++) if (A[j] < A[m]) m = j; [A[i], A[m]] = [A[m], A[i]]; }
  if (algo === "insertion") for (let i = 1; i <= k; i++) { const key = A[i]; let j = i - 1; while (j >= 0 && A[j] > key) { A[j + 1] = A[j]; j--; } A[j + 1] = key; }
  return A;
}
