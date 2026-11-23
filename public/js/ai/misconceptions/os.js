// Operating systems misconceptions: CPU scheduling, page replacement, disk
// scheduling, the Banker's algorithm, contiguous allocation and paging.
import { schedule } from "../../engines/scheduling.js";
import { replace } from "../../engines/paging.js";
import { schedule as diskSchedule } from "../../engines/disk.js";
import { contiguous } from "../../engines/memory.js";
import { eat } from "../../engines/translation.js";
import { anyOf, define, firstDiff, num, round2 } from "./kit.js";

// --- CPU scheduling ---------------------------------------------------------------

const CPU_NAME = { fcfs: "FCFS", sjf: "SJF", srtf: "SRTF", rr: "Round Robin", priority: "non-preemptive priority", "priority-p": "preemptive priority" };
const asked = (g) => (g.ask === "ct" ? `the completion time of ${g.target}` : `the average ${g.ask === "wt" ? "waiting" : "turnaround"} time`);
function measure(res, g) {
  if (g.ask === "ct") return res.results.find((x) => x.id === g.target)?.ct ?? null;
  return round2(res.averages[g.ask]);
}
const run = (g, algo = g.algo, opts = {}) => schedule(g.procs, algo, { quantum: g.quantum, ...opts });
// Who runs at time t.
const runningAt = (res, t) => res.timeline.find((s) => s.start <= t && t < s.end)?.id ?? null;
// The step of the correct replay where the two schedules first run different processes.
function cpuStep(g, wrong) {
  const right = run(g);
  const end = Math.max(right.makespan ?? 0, wrong.makespan ?? 0);
  for (let t = 0; t <= end; t++) {
    if (runningAt(right, t) !== runningAt(wrong, t)) {
      const k = right.frames.findIndex((f) => f.t >= t);
      return k >= 0 ? k + 1 : null;
    }
  }
  return null;
}
const PREEMPTIVE = { srtf: "sjf", "priority-p": "priority" };
const NONPREEMPTIVE = { sjf: "srtf", priority: "priority-p" };

const cpu = define("cpu-scheduling", [
  {
    id: "fcfs-instead",
    label: "served the processes in arrival order (FCFS)",
    predict: (q) => (q.given.algo === "fcfs" ? null : measure(run(q.given, "fcfs"), q.given)),
    explain: (q) => `${CPU_NAME[q.given.algo]} picks the next process by its own rule, not by arrival. Taking them in arrival order gives ${num(measure(run(q.given, "fcfs"), q.given))} for ${asked(q.given)}; ${CPU_NAME[q.given.algo]} gives ${num(q.answer)}.`,
    step: (q) => cpuStep(q.given, run(q.given, "fcfs")),
  },
  {
    id: "no-preemption",
    label: "let the running process finish instead of preempting it",
    predict: (q) => (PREEMPTIVE[q.given.algo] ? measure(run(q.given, PREEMPTIVE[q.given.algo]), q.given) : null),
    explain: (q) => `${CPU_NAME[q.given.algo]} is preemptive: when a process arrives that should run first, it takes the CPU straight away. Running each process to completion gives ${num(measure(run(q.given, PREEMPTIVE[q.given.algo]), q.given))} instead of ${num(q.answer)}.`,
    step: (q) => cpuStep(q.given, run(q.given, PREEMPTIVE[q.given.algo])),
  },
  {
    id: "preempted",
    label: "preempted the running process when this version doesn't",
    predict: (q) => (NONPREEMPTIVE[q.given.algo] ? measure(run(q.given, NONPREEMPTIVE[q.given.algo]), q.given) : null),
    explain: (q) => `${CPU_NAME[q.given.algo]} is non-preemptive: once a process starts it runs until it finishes, even if a better one arrives. Switching on arrival gives ${num(measure(run(q.given, NONPREEMPTIVE[q.given.algo]), q.given))} instead of ${num(q.answer)}.`,
    step: (q) => cpuStep(q.given, run(q.given, NONPREEMPTIVE[q.given.algo])),
  },
  {
    id: "ignore-arrival",
    label: "treated every process as arriving at time 0",
    predict: (q) => {
      const g = q.given;
      if (!g.procs.some((p) => p.arrival > 0)) return null;
      return measure(schedule(g.procs.map((p) => ({ ...p, arrival: 0 })), g.algo, { quantum: g.quantum }), g);
    },
    explain: (q) => `A process can't be scheduled before it arrives, and waiting is counted from its arrival time. Ignoring the arrival times gives ${num(measure(schedule(q.given.procs.map((p) => ({ ...p, arrival: 0 })), q.given.algo, { quantum: q.given.quantum }), q.given))}; the answer is ${num(q.answer)}.`,
  },
  {
    id: "forgot-arrival-subtract",
    label: "forgot to subtract the arrival time (TAT = CT − AT)",
    predict: (q) => {
      const g = q.given;
      if (g.ask === "ct" || !g.procs.some((p) => p.arrival > 0)) return null;
      const res = run(g);
      const vals = res.results.map((x) => (g.ask === "tat" ? x.ct : x.ct - x.burst));
      return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
    },
    explain: (q) => `Turnaround time is completion time minus arrival time, and waiting time is turnaround minus burst. Using the completion time as the turnaround time counts the time before each process arrived; the correct ${asked(q.given)} is ${num(q.answer)}.`,
  },
  {
    id: "wt-tat-swapped",
    label: "mixed up waiting time and turnaround time",
    predict: (q) => (q.given.ask === "ct" ? null : round2(run(q.given).averages[q.given.ask === "wt" ? "tat" : "wt"])),
    explain: (q) => `Turnaround time is the whole time from arrival to completion; waiting time is that minus the time spent running (TAT − BT). The question asks for ${asked(q.given)}: ${num(q.answer)}, and the other average is ${num(round2(run(q.given).averages[q.given.ask === "wt" ? "tat" : "wt"]))}.`,
  },
  {
    id: "priority-reversed",
    label: "took a higher number to mean a higher priority",
    predict: (q) => (/priority/.test(q.given.algo) ? measure(run(q.given, q.given.algo, { lowerIsHigher: false }), q.given) : null),
    explain: (q) => `Here a lower number means a higher priority. Reading it the other way round gives ${num(measure(run(q.given, q.given.algo, { lowerIsHigher: false }), q.given))} instead of ${num(q.answer)}.`,
    step: (q) => cpuStep(q.given, run(q.given, q.given.algo, { lowerIsHigher: false })),
  },
]);

// --- Page replacement --------------------------------------------------------------

const PAGE_NAME = { fifo: "FIFO", lru: "LRU", optimal: "Optimal" };
const RULE = {
  fifo: "FIFO evicts the page that was loaded earliest, however recently it was used",
  lru: "LRU evicts the page whose last use is furthest in the past",
  optimal: "Optimal evicts the page whose next use is furthest in the future",
};
const faults = (g, algo) => replace(g.refs, g.frames, algo).faults;
function pageStep(g, algo) {
  const a = replace(g.refs, g.frames, g.algo).steps, b = replace(g.refs, g.frames, algo).steps;
  const i = firstDiff(a, b, (x, y) => x.hit === y.hit && [...x.frames].sort().join() === [...y.frames].sort().join());
  return i >= 0 ? i + 1 : null;
}
const swapAlgo = (from, to) => ({
  id: `${to}-for-${from}`,
  label: `used ${PAGE_NAME[to]} instead of ${PAGE_NAME[from]}`,
  predict: (q) => (q.given.algo === from ? faults(q.given, to) : null),
  explain: (q) => `${RULE[from]}; ${RULE[to]}. With ${PAGE_NAME[to]} you get ${faults(q.given, to)} faults; ${PAGE_NAME[from]} gives ${q.answer}.`,
  step: (q) => (q.given.algo === from ? pageStep(q.given, to) : null),
});
const paging = define("page-replacement", [
  swapAlgo("lru", "fifo"), swapAlgo("fifo", "lru"), swapAlgo("optimal", "lru"), swapAlgo("optimal", "fifo"),
  {
    id: "skipped-cold-misses",
    label: "didn't count the first loads into empty frames as faults",
    predict: (q) => q.answer - Math.min(q.given.frames, new Set(q.given.refs).size),
    explain: (q) => `Every reference to a page that isn't in memory is a fault, including the first ${Math.min(q.given.frames, new Set(q.given.refs).size)} that fill the empty frames (compulsory misses). Leaving them out gives ${q.answer - Math.min(q.given.frames, new Set(q.given.refs).size)}; the total is ${q.answer}.`,
  },
  {
    id: "counted-hits",
    label: "counted hits instead of faults",
    predict: (q) => replace(q.given.refs, q.given.frames, q.given.algo).hits,
    explain: (q) => `There are ${q.given.refs.length} references: ${q.answer} faults and ${q.given.refs.length - q.answer} hits. The question asks for the faults.`,
  },
]);

// --- Disk scheduling ----------------------------------------------------------------

const DISK_NAME = { fcfs: "FCFS", sstf: "SSTF", scan: "SCAN", cscan: "C-SCAN", look: "LOOK", clook: "C-LOOK" };
const DIRECTIONAL = new Set(["scan", "cscan", "look", "clook"]);
const disk = (g, over = {}) => diskSchedule(g.queue, g.head, over.algo ?? g.algo, { cylinders: 200, direction: over.direction ?? g.direction, countJump: over.countJump ?? true });
function diskStep(g, over) {
  const i = firstDiff(disk(g).path, disk(g, over).path);
  return i >= 0 ? i + 1 : null;
}
const diskSwap = (from, to, why) => ({
  id: `${to}-for-${from}`,
  label: `used ${DISK_NAME[to]} instead of ${DISK_NAME[from]}`,
  predict: (q) => (q.given.algo === from ? disk(q.given, { algo: to }).total : null),
  explain: (q) => `${why} That gives ${disk(q.given, { algo: to }).total} cylinders with ${DISK_NAME[to]}; ${DISK_NAME[from]} gives ${q.answer}.`,
  step: (q) => (q.given.algo === from ? diskStep(q.given, { algo: to }) : null),
});
const diskM = define("disk-scheduling", [
  diskSwap("scan", "look", "SCAN carries on to the last cylinder (0 or 199) before turning; LOOK turns at the last request."),
  diskSwap("look", "scan", "LOOK turns round at the last request in its direction; it doesn't travel to the end of the disk."),
  diskSwap("cscan", "clook", "C-SCAN runs to the end of the disk, jumps to the other end and carries on; C-LOOK only goes as far as the last request."),
  diskSwap("clook", "cscan", "C-LOOK turns at the last request and jumps to the lowest pending one; it doesn't visit the ends of the disk."),
  diskSwap("sstf", "fcfs", "SSTF always serves the closest pending request next, not the next one in arrival order."),
  {
    id: "no-return-seek",
    label: "left out the return seek",
    predict: (q) => (["cscan", "clook"].includes(q.given.algo) ? disk(q.given, { countJump: false }).total : null),
    explain: (q) => `The question says to count the jump back as head movement. Leaving it out gives ${disk(q.given, { countJump: false }).total}; with it, ${q.answer}.`,
  },
  {
    id: "wrong-direction",
    label: "started moving the head the wrong way",
    predict: (q) => (DIRECTIONAL.has(q.given.algo) ? disk(q.given, { direction: q.given.direction === "up" ? "down" : "up" }).total : null),
    explain: (q) => `The head is moving towards ${q.given.direction === "up" ? "higher cylinders" : "cylinder 0"}, so it serves that side first. Going the other way first gives ${disk(q.given, { direction: q.given.direction === "up" ? "down" : "up" }).total} instead of ${q.answer}.`,
    step: (q) => (DIRECTIONAL.has(q.given.algo) ? diskStep(q.given, { direction: q.given.direction === "up" ? "down" : "up" }) : null),
  },
  {
    id: "counted-from-zero",
    label: "measured the movement from cylinder 0 instead of the head's starting position",
    predict: (q) => q.answer + q.given.head,
    explain: (q) => `Head movement starts where the head is now, cylinder ${q.given.head}. Counting from cylinder 0 adds ${q.given.head} cylinders that were never travelled: ${q.answer + q.given.head} instead of ${q.answer}.`,
  },
]);

// --- Banker's algorithm ------------------------------------------------------------------

// Does this order pass the safety check under a (possibly mistaken) rule?
function passes(state, order, { needOf, release = true }) {
  let work = [...state.available];
  for (const i of order) {
    const need = needOf(state, i);
    if (need.some((x, j) => x > work[j])) return false;
    if (release) work = work.map((w, j) => w + state.allocation[i][j]);
  }
  return true;
}
const seqText = (order) => order.map((i) => `P${i}`).join(", ");
const realNeed = (st, i) => st.max[i].map((m, j) => m - st.allocation[i][j]);
// The options a student with this rule would accept; "unsafe" if none.
function bankersPick(q, rule) {
  const st = q.given.state;
  const ok = q.options.map((o, i) => {
    if (!/^P\d/.test(o)) return null;
    const order = o.split(", ").map((p) => Number(p.slice(1)));
    return passes(st, order, rule) ? i : null;
  }).filter((i) => i !== null);
  return ok.length ? anyOf(ok) : q.options.findIndex((o) => /unsafe/.test(o));
}
const bankers = define("bankers-algorithm", [
  {
    id: "compared-max",
    label: "compared Max with Work instead of Need",
    predict: (q) => bankersPick(q, { needOf: (st, i) => st.max[i] }),
    explain: (q) => `A process can finish if what it still needs, Need = Max − Allocation, fits in Work. Comparing its whole Max asks for resources it already holds, so safe orders look unsafe. ${q.given.state.max.map((_, i) => `Need of P${i} is (${realNeed(q.given.state, i).join(", ")})`).slice(0, 2).join("; ")}.`,
  },
  {
    id: "no-release",
    label: "didn't add a finished process's allocation back to Work",
    predict: (q) => bankersPick(q, { needOf: realNeed, release: false }),
    explain: () => "When a process finishes it returns everything it holds, so Work grows by its Allocation before the next check. Without that, Work never grows and later processes seem stuck.",
  },
  {
    id: "compared-allocation",
    label: "compared Allocation with Work instead of Need",
    predict: (q) => bankersPick(q, { needOf: (st, i) => st.allocation[i] }),
    explain: () => "The safety check asks whether the resources a process may still request (Need = Max − Allocation) are free. What it already holds (Allocation) is the wrong thing to compare.",
  },
]);

// --- Memory allocation ------------------------------------------------------------------

const FIT_IDS = ["first", "next", "best", "worst"], FIT_NAMES = ["First fit", "Next fit", "Best fit", "Worst fit"];
const fitsAll = (g) => FIT_IDS.map((id) => contiguous(g.holes, g.sizes.map((size, i) => ({ op: "alloc", name: `P${i + 1}`, size })), id).failed === 0);
// Fixed partitions: a hole is used whole, never split.
function fitsNoSplit(g) {
  return FIT_IDS.map((algo) => {
    const used = g.holes.map(() => false);
    let rover = 0;
    for (const size of g.sizes) {
      const free = g.holes.map((h, i) => (!used[i] && h >= size ? i : null)).filter((i) => i !== null);
      if (!free.length) return false;
      let pick;
      if (algo === "first") pick = free[0];
      else if (algo === "next") pick = free.find((i) => i >= rover) ?? free[0];
      else if (algo === "best") pick = free.reduce((a, b) => (g.holes[b] < g.holes[a] ? b : a));
      else pick = free.reduce((a, b) => (g.holes[b] > g.holes[a] ? b : a));
      used[pick] = true; rover = pick;
    }
    return true;
  });
}
const toSet = (flags) => { const s = flags.map((f, i) => (f ? i : null)).filter((i) => i !== null); return s.length ? s : null; };
const memory = define("memory-allocation", [
  {
    id: "no-split",
    label: "used each partition whole instead of splitting it",
    predict: (q) => toSet(fitsNoSplit(q.given)),
    explain: (q) => `Here a larger partition is split and the rest stays free for later processes. Using partitions whole wastes the leftover, so fewer algorithms manage: ${FIT_NAMES.filter((_, i) => fitsNoSplit(q.given)[i]).join(", ") || "none"} instead of ${FIT_NAMES.filter((_, i) => fitsAll(q.given)[i]).join(", ")}.`,
  },
  {
    id: "best-worst-swapped",
    label: "mixed up best fit and worst fit",
    predict: (q) => { const f = fitsAll(q.given); return f[2] === f[3] ? null : toSet([f[0], f[1], f[3], f[2]]); },
    explain: () => "Best fit takes the smallest hole that is big enough; worst fit takes the largest hole.",
  },
  {
    id: "next-is-first",
    label: "treated next fit as first fit",
    predict: (q) => { const f = fitsAll(q.given); return f[0] === f[1] ? null : toSet([f[0], f[0], f[2], f[3]]); },
    explain: () => "Next fit starts each search where the last allocation ended, not at the start of memory, so it can skip a hole that first fit would use.",
  },
]);

// --- Paging and TLBs ----------------------------------------------------------------------

const eatOf = (g) => round2(eat({ hitRatio: g.hitRatio, mem: g.mem, tlb: g.tlb }));
const sizeOf = (g, { offset = 10 + Math.log2(g.pageKB), pte = g.pte, unit = 2 ** 20 } = {}) => (2 ** (g.bits - offset) * pte) / unit;
const translation = define("address-translation", [
  {
    id: "no-tlb-time-on-miss",
    label: "left the TLB lookup out of the miss time",
    predict: (q) => (q.given.variant === "eat" ? round2(q.given.hitRatio * (q.given.tlb + q.given.mem) + (1 - q.given.hitRatio) * 2 * q.given.mem) : null),
    explain: (q) => `On a TLB miss the TLB has still been searched first, so a miss costs TLB + page table + memory = ${q.given.tlb + 2 * q.given.mem} ns, not ${2 * q.given.mem} ns. The EAT is ${num(q.answer)} ns.`,
  },
  {
    id: "no-tlb-time",
    label: "left the TLB lookup time out altogether",
    predict: (q) => (q.given.variant === "eat" ? round2(q.given.hitRatio * q.given.mem + (1 - q.given.hitRatio) * 2 * q.given.mem) : null),
    explain: (q) => `Every access searches the TLB first, so both the hit time (${q.given.tlb + q.given.mem} ns) and the miss time (${q.given.tlb + 2 * q.given.mem} ns) include the ${q.given.tlb} ns lookup. The EAT is ${num(q.answer)} ns.`,
  },
  {
    id: "miss-one-access",
    label: "forgot the page table access on a TLB miss",
    predict: (q) => (q.given.variant === "eat" ? round2(q.given.tlb + q.given.mem) : null),
    explain: (q) => `A TLB miss means reading the page table in memory before the actual access: two memory accesses, ${q.given.tlb + 2 * q.given.mem} ns. With that, EAT = ${num(q.answer)} ns.`,
  },
  {
    id: "forgot-entry-size",
    label: "counted page table entries but not their size",
    predict: (q) => (q.given.variant === "size" ? sizeOf(q.given, { pte: 1 }) : null),
    explain: (q) => (q.given.variant === "size" ? `The table has 2^${q.given.bits - 10 - Math.log2(q.given.pageKB)} entries of ${q.given.pte} bytes each, so its size is entries × ${q.given.pte} B = ${num(q.answer)} MB.` : ""),
  },
  {
    id: "offset-without-1024",
    label: "took the offset bits from the page size in KB without the 1024",
    predict: (q) => (q.given.variant === "size" ? sizeOf(q.given, { offset: Math.log2(q.given.pageKB) }) : null),
    explain: (q) => (q.given.variant === "size" ? `A ${q.given.pageKB} KB page is ${q.given.pageKB} × 1024 = 2^${10 + Math.log2(q.given.pageKB)} bytes, so the offset has ${10 + Math.log2(q.given.pageKB)} bits, not ${Math.log2(q.given.pageKB)}. That leaves ${q.given.bits - 10 - Math.log2(q.given.pageKB)} bits of page number and a ${num(q.answer)} MB table.` : ""),
  },
  {
    id: "answered-in-kb",
    label: "gave the size in KB instead of MB",
    predict: (q) => (q.given.variant === "size" ? sizeOf(q.given, { unit: 2 ** 10 }) : null),
    explain: (q) => `The size is ${num(sizeOf(q.given, { unit: 2 ** 10 }))} KB, which is ${num(q.answer)} MB (divide by 1024 again).`,
  },
]);

export const OS = [...cpu, ...paging, ...diskM, ...bankers, ...memory, ...translation];
