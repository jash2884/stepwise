// AI tool schemas: operating systems. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { schedule, ALGORITHMS as CPU } from "../../engines/scheduling.js";
import { parseAccesses, replace, ALGORITHMS as PAGING, NRU_TICK } from "../../engines/paging.js";
import { schedule as diskSchedule, parseArrivals, ALGORITHMS as DISK, EXAMPLE as DISK_EXAMPLE } from "../../engines/disk.js";
import { safety, need, parseRequests as parseBankRequests, requestTimeline, EXAMPLE as BANK_EXAMPLE, EXAMPLE_REQUESTS } from "../../engines/bankers.js";
import { parseGraph, analyse as analyseRag, EXAMPLES as RAG_EXAMPLES } from "../../engines/deadlock.js";
import { PRESETS as SYNC } from "../../engines/sync.js";
import { ALGORITHMS as MEMORY, EXAMPLE as FIT_EXAMPLE, BUDDY_EXAMPLE, parseScript, parseHoles, contiguous, buddy } from "../../engines/memory.js";
import {
  MODES as XLATE, POLICIES, PAGING_EXAMPLE, MULTI_EXAMPLE, SEGMENT_EXAMPLE, parsePageTable, parseAddresses, parseMappings, parseSegments, parseSegAddresses,
  translatePaging, translateMultilevel, translateSegments, eat,
} from "../../engines/translation.js";
import { locate, indexBlocks, allocation, human } from "../../engines/filesystems.js";

// cpu.js: p = "arrival-burst-priority" per process joined by "_", ids P1, P2, ...
const decodeProcs = (s) => s.split("_").map((part, i) => {
  const [arrival, burst, priority = 0] = part.split("-").map(Number);
  return { id: `P${i + 1}`, arrival, burst, priority };
});

// bankers.js: s = Allocation rows ~ Max rows ~ Available, rows joined by _, values by '.'.
function encodeBank(st) {
  return [st.allocation, st.max].map((m) => m.map((r) => r.join(".")).join("_")).concat(st.available.join(".")).join("~");
}
function decodeBank(text) {
  const [a, m, av] = String(text).split("~");
  if (a === undefined || m === undefined || av === undefined) throw new Error('s must be "Allocation~Max~Available", e.g. "0.1.0_2.0.0~7.5.3_3.2.2~3.3.2"');
  const rows = (t) => t.split("_").map((r) => r.split(".").map(Number));
  return { allocation: rows(a), max: rows(m), available: av.split(".").map(Number) };
}

export const SCHEMAS = [
  tool("cpu-scheduling", {
    keywords: "gantt chart waiting time turnaround time completion time response time fcfs sjf srtf round robin rr priority preemptive non-preemptive hrrn ljf lrtf mlq mlfq starvation convoy effect time quantum",
    params: {
      algo: { type: "enum", values: Object.keys(CPU), default: "srtf", desc: "scheduling algorithm: fcfs, sjf (non-preemptive), srtf (preemptive SJF), rr (round robin), priority (non-preemptive), priority-p (preemptive), hrrn, ljf, lrtf, mlq, mlfq" },
      q: { type: "int", min: 1, max: 20, default: 2, desc: "time quantum, used by rr, mlq and mlfq" },
      prio: { type: "enum", values: ["low", "high"], default: "low", desc: "low: a lower priority number is more important (the usual GATE convention); high: a higher number is more important" },
      p: { type: "string", format: "arrival-burst-priority for each process in order P1, P2, ... joined by _ (priority 0 if not given)", default: "0-8-3_1-4-1_2-9-4_3-5-2", desc: "the processes" },
    },
    answers: { avgWT: "average waiting time", avgTAT: "average turnaround time", "ct.P1": "completion time of P1 (one key per process: ct.P2, wt.P3, tat.P4, ...)", "wt.P1": "waiting time of P1", "tat.P1": "turnaround time of P1", makespan: "time the last process finishes" },
    examples: [
      { request: "Round robin with quantum 2: P1 arrives 0 burst 5, P2 arrives 1 burst 3, P3 arrives 2 burst 1", params: { algo: "rr", q: 2, p: "0-5-0_1-3-0_2-1-0" } },
      { request: "SJF non-preemptive, bursts 6 8 7 3 all arriving at 0, average waiting time?", params: { algo: "sjf", p: "0-6-0_0-8-0_0-7-0_0-3-0" } },
    ],
    validate(v) {
      const procs = decodeProcs(v.p);
      if (procs.some((x) => !Number.isFinite(x.arrival) || !Number.isFinite(x.burst))) throw new Error('p must look like "0-5-0_1-3-0" (arrival-burst-priority per process)');
      const res = schedule(procs, v.algo, { quantum: v.q, lowerIsHigher: v.prio !== "high" });
      const values = { avgWT: round(res.averages.wt), avgTAT: round(res.averages.tat), makespan: Math.max(...res.results.map((x) => x.ct)) };
      for (const x of res.results) { values[`ct.${x.id}`] = x.ct; values[`wt.${x.id}`] = x.wt; values[`tat.${x.id}`] = x.tat; }
      return { text: `${CPU[v.algo].name}: average waiting time ${values.avgWT}, average turnaround time ${values.avgTAT}; completion times ${res.results.map((x) => `${x.id} ${x.ct}`).join(", ")}.`, values };
    },
  }),

  tool("page-replacement", {
    keywords: "page fault hit ratio frames reference string fifo lru optimal opt lfu mfu clock second chance nru belady anomaly virtual memory",
    params: {
      r: { type: "string", format: "page numbers 0 to 99 separated by spaces, at most 40; add w for a write (7w), only NRU uses it", default: "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", desc: "reference string" },
      f: { type: "int", min: 1, max: 8, default: 3, desc: "number of frames" },
      algo: { type: "enum", values: Object.keys(PAGING), default: "lru", desc: "replacement policy" },
      k: { type: "int", min: 1, max: 40, default: NRU_TICK, desc: "NRU only: a clock tick clears R bits every k references" },
    },
    answers: { faults: "number of page faults", hits: "number of hits", hitRatio: "hits / references", missRatio: "faults / references" },
    examples: [
      { request: "How many page faults for 7 0 1 2 0 3 0 4 2 3 0 3 2 with 3 frames using FIFO?", params: { r: "7 0 1 2 0 3 0 4 2 3 0 3 2", f: 3, algo: "fifo" } },
      { request: "LRU with 4 frames on 1 2 3 4 1 2 5 1 2 3 4 5", params: { r: "1 2 3 4 1 2 5 1 2 3 4 5", f: 4, algo: "lru" } },
    ],
    validate(v) {
      const { refs, writes } = parseAccesses(v.r);
      const res = replace(refs, v.f, v.algo, { writes, tick: v.k });
      return { text: `${PAGING[v.algo].name} with ${v.f} frames: ${res.faults} page faults and ${res.hits} hits out of ${refs.length} references.`,
        values: { faults: res.faults, hits: res.hits, hitRatio: round(res.hitRatio), missRatio: round(1 - res.hitRatio) } };
    },
  }),

  tool("disk-scheduling", {
    keywords: "disk head movement seek time seek distance cylinders track request queue fcfs sstf scan c-scan cscan look c-look clook elevator algorithm n-step scan f-scan fscan arm stickiness",
    params: {
      r: { type: "string", format: "cylinder numbers in arrival order separated by spaces (at most 30); for F-SCAN a request may carry an arrival time as cylinder@time, e.g. 98@12", default: DISK_EXAMPLE.requests.join(" "), desc: "request queue" },
      h: { type: "int", min: 0, max: 9999, default: DISK_EXAMPLE.head, desc: "starting head position (cylinder)" },
      c: { type: "int", min: 2, max: 10000, default: DISK_EXAMPLE.cylinders, desc: "number of cylinders, numbered 0 to c - 1" },
      algo: { type: "enum", values: Object.keys(DISK), default: "sstf", desc: "fcfs, sstf, scan, cscan (C-SCAN), look, clook (C-LOOK), nstep (N-step SCAN), fscan (F-SCAN)" },
      dir: { type: "enum", values: ["up", "down"], default: "up", desc: "initial direction for SCAN-like algorithms: up = towards higher cylinders, down = towards 0" },
      jump: { type: "bool", default: true, desc: "C-SCAN and C-LOOK: count the return jump as head movement (textbooks differ)" },
      n: { type: "int", min: 1, max: 30, default: 4, desc: "N-step SCAN only: batch size N" },
    },
    answers: { total: "total head movement in cylinders", avgSeek: "average seek distance per request", path: "the cylinders the head visits in order, starting position first", "total.scan": "total head movement for each algorithm on the same queue (total.fcfs, total.sstf, total.look, ...)" },
    examples: [
      { request: "Head at 53, queue 98 183 37 122 14 124 65 67, 200 cylinders, total head movement with C-SCAN moving towards higher cylinders?", params: { r: "98 183 37 122 14 124 65 67", h: 53, c: 200, algo: "cscan", dir: "up", jump: true } },
      { request: "SSTF total seek distance for requests 82 170 43 140 24 16 190, head at 50, disk of 200 cylinders", params: { r: "82 170 43 140 24 16 190", h: 50, c: 200, algo: "sstf" } },
    ],
    validate(v) {
      const { requests, arrivals } = parseArrivals(v.r);
      const opts = { cylinders: v.c, direction: v.dir, countJump: v.jump, n: v.n, arrivals };
      const res = diskSchedule(requests, v.h, v.algo, opts);
      const values = { total: res.total, avgSeek: round(res.total / requests.length), path: res.path.join(" ") };
      for (const id of Object.keys(DISK)) values[`total.${id}`] = diskSchedule(requests, v.h, id, opts).total;
      return { text: `${DISK[v.algo].name} from cylinder ${v.h}: total head movement ${res.total} cylinders, visiting ${res.path.slice(1).join(", ")}.`, values };
    },
  }),

  tool("bankers-algorithm", {
    keywords: "banker's algorithm bankers safe state unsafe state safe sequence deadlock avoidance need matrix max allocation available work finish resource request algorithm",
    params: {
      s: { type: "string", format: "Allocation rows ~ Max rows ~ Available: rows (one per process P0, P1, ...) joined by _, the values in a row joined by '.', e.g. 0.1.0_2.0.0~7.5.3_3.2.2~3.3.2", default: encodeBank(BANK_EXAMPLE), desc: "the state: Allocation, Max and Available (1 to 10 processes, 1 to 6 resource types, values 0 to 99)" },
      req: { type: "string", format: "requests in order separated by ;, each a process then one number per resource, e.g. P1 1 0 2; P4 3 3 0", default: EXAMPLE_REQUESTS, desc: "resource requests to run through the request algorithm, one after another" },
    },
    answers: { safe: "true if the state is safe", sequence: "the safe sequence found by scanning P0, P1, ... in order (e.g. P1 P3 P4 P0 P2), or none", "need.P0": "Need row of P0 (one key per process)", "req.1": "outcome of request 1: granted, wait, unsafe (must wait) or error (exceeds need); one key per request" },
    examples: [
      { request: "Banker's algorithm: Allocation P0 0 1 0, P1 2 0 0, P2 3 0 2, P3 2 1 1, P4 0 0 2; Max 7 5 3, 3 2 2, 9 0 2, 2 2 2, 4 3 3; Available 3 3 2. Is it safe? Can P1 request 1 0 2?", params: { s: "0.1.0_2.0.0_3.0.2_2.1.1_0.0.2~7.5.3_3.2.2_9.0.2_2.2.2_4.3.3~3.3.2", req: "P1 1 0 2" } },
      { request: "4 processes, 2 resources: allocation (1,0) (0,1) (1,1) (0,0), max (2,1) (1,2) (2,2) (1,1), available (1,1). Find a safe sequence", params: { s: "1.0_0.1_1.1_0.0~2.1_1.2_2.2_1.1~1.1", req: "P0 1 0" } },
    ],
    validate(v) {
      const state = decodeBank(v.s);
      const res = safety(state);
      const seq = res.sequence.map((i) => `P${i}`);
      const values = { safe: res.safe, sequence: res.safe ? seq.join(" ") : "none" };
      need(state.max, state.allocation).forEach((row, i) => { values[`need.P${i}`] = row.join(" "); });
      let reqText = "";
      try {
        const tl = requestTimeline(state, parseBankRequests(v.req, state.available.length));
        tl.outcomes.forEach((o, k) => { values[`req.${k + 1}`] = o.outcome; });
        if (tl.outcomes.length) reqText = ` Requests: ${tl.outcomes.map((o) => `P${o.pid} (${o.req.join(", ")}) ${o.outcome}`).join("; ")}.`;
      } catch { /* the request list doesn't fit this state; the safety check still stands */ }
      return { text: `${res.safe ? `Safe, with safe sequence ${seq.join(", ")}` : "Unsafe: no safe sequence exists"}.${reqText}`, values };
    },
  }),

  tool("deadlock-detection", {
    keywords: "deadlock detection resource allocation graph rag wait-for graph cycle multiple instances single instance request edge assignment edge hold and wait circular wait",
    params: {
      res: { type: "string", format: "resources with instance counts, comma separated: R1:1, R2:2 (R1 to R99, at most 8)", default: RAG_EXAMPLES.book.resources, desc: "resources and how many instances each has" },
      e: { type: "string", format: "edges separated by ;, P1 -> R1 for a request (P1 waits for R1), R1 -> P2 for an assignment (P2 holds one instance of R1)", default: RAG_EXAMPLES.book.edges.split("\n").join(";"), desc: "edges of the resource-allocation graph" },
    },
    answers: { deadlock: "true if some process is deadlocked", deadlocked: "the deadlocked processes (e.g. P1 P2 P3), or none", cycle: "a cycle in the wait-for graph (e.g. P1 -> P2 -> P1), or none", available: "free instances of each resource, in resource order" },
    examples: [
      { request: "R1 and R2 have one instance each. P1 holds R1 and requests R2, P2 holds R2 and requests R1. Deadlock?", params: { res: "R1:1, R2:1", e: "R1 -> P1;P1 -> R2;R2 -> P2;P2 -> R1" } },
      { request: "R1 has 2 instances held by P1 and P3, R2 has 2 held by P2 and P4, P1 waits for R2 and P2 waits for R1: is there a deadlock?", params: { res: "R1:2, R2:2", e: "R1 -> P1;R1 -> P3;P1 -> R2;R2 -> P2;R2 -> P4;P2 -> R1" } },
    ],
    validate(v) {
      const graph = parseGraph(v.res, v.e.replace(/;/g, "\n"));
      if (!graph.processes.length) throw new Error("Add some edges to connect processes and resources.");
      const r = analyseRag(graph);
      return { text: r.verdict, values: { deadlock: r.deadlocked.length > 0, deadlocked: r.deadlocked.join(" ") || "none", cycle: r.waitFor.cycle ? r.waitFor.cycle.join(" -> ") : "none", available: r.available.join(" ") } };
    },
  }),

  tool("semaphores", {
    keywords: "semaphore wait signal p v mutex counting semaphore binary semaphore producer consumer bounded buffer readers writers dining philosophers race condition critical section synchronisation synchronization",
    params: {
      preset: { type: "enum", values: Object.keys(SYNC), default: "producer-consumer", desc: "the problem: producer-consumer (bounded buffer), readers-writers, philosophers (dining philosophers), race (counter race condition)" },
      v: { type: "enum", values: [...new Set(Object.values(SYNC).flatMap((x) => Object.keys(x.variants)))], desc: `version of that problem; default is the problem's first one. ${Object.entries(SYNC).map(([id, x]) => `${id}: ${Object.keys(x.variants).join(", ")}`).join("; ")}` },
    },
    answers: { semaphores: "the semaphores and their starting values", processes: "the processes that take part", bufferSize: "bounded buffer size (producer-consumer only, else 0)" },
    examples: [
      { request: "Show me the dining philosophers deadlock with semaphores", params: { preset: "philosophers", v: "naive" } },
      { request: "producer consumer without a mutex, show the race", params: { preset: "producer-consumer", v: "nomutex" } },
    ],
    validate(v) {
      const preset = SYNC[v.preset];
      const id = preset.variants[v.v] ? v.v : Object.keys(preset.variants)[0];
      const x = preset.variants[id];
      const sems = Object.entries(x.sems).map(([k, n]) => `${k}=${n}`).join(", ") || "none";
      return { text: `${preset.name}, ${x.name}: semaphores ${sems}; processes ${x.procs.map((p) => p.id).join(", ")}. Pick which process runs next to see blocking, races and deadlocks.`,
        values: { semaphores: sems, processes: x.procs.map((p) => p.id).join(" "), bufferSize: x.bufferSize ?? 0 } };
    },
  }),

  tool("memory-allocation", {
    keywords: "contiguous memory allocation partition hole first fit next fit best fit worst fit buddy system external fragmentation internal fragmentation coalescing compaction variable partition",
    params: {
      algo: { type: "enum", values: Object.keys(MEMORY), default: "first", desc: "first, next, best, worst (fit algorithms) or buddy (buddy system)" },
      h: { type: "string", format: "hole sizes in KB in address order separated by spaces (1 to 8 holes, each 1 to 9999)", default: FIT_EXAMPLE.holes, desc: "fit algorithms only: the free partitions" },
      u: { type: "int", min: 1, max: 1024, default: 1, desc: "fit algorithms only: allocation unit in KB that requests round up to (1 = no rounding)" },
      t: { type: "int", min: 64, max: 4096, default: BUDDY_EXAMPLE.total, desc: "buddy only: total memory in KB, a power of two" },
      m: { type: "int", min: 1, max: 4096, default: BUDDY_EXAMPLE.min, desc: "buddy only: smallest block in KB, a power of two" },
      s: { type: "string", format: "operations separated by ;, NAME SIZE to allocate SIZE KB to NAME (e.g. P1 212), free NAME to release it", desc: `requests in order (default for fit: ${FIT_EXAMPLE.script}; for buddy: ${BUDDY_EXAMPLE.script})` },
    },
    answers: { waited: "how many requests could not be placed", waitedList: "names of the requests that had to wait, or none", free: "free memory at the end (KB)", largest: "largest hole or free block at the end (KB)", holes: "number of holes or free blocks at the end", internal: "internal fragmentation at the end (KB)", "addr.P1": "start address of P1's block at the end (one key per name still holding memory)", "block.P1": "size of P1's block (buddy rounds up to a power of two)" },
    examples: [
      { request: "Partitions 100 500 200 300 600 KB, processes 212 417 112 426 KB, best fit: where does each go?", params: { algo: "best", h: "100 500 200 300 600", s: "P1 212; P2 417; P3 112; P4 426" } },
      { request: "Buddy system with 1 MB memory: A requests 100 KB, B 240 KB, C 64 KB, D 256 KB", params: { algo: "buddy", t: 1024, m: 16, s: "A 100; B 240; C 64; D 256" } },
    ],
    validate(v) {
      const isBuddy = v.algo === "buddy";
      const ops = parseScript(v.s ?? (isBuddy ? BUDDY_EXAMPLE.script : FIT_EXAMPLE.script));
      const res = isBuddy ? buddy(ops, { total: v.t, min: v.m }) : contiguous(parseHoles(v.h), ops, v.algo, { unit: v.u });
      const waitedList = res.steps.filter((x) => x.failedOp).map((x) => ops[x.op].name);
      const st = res.stats;
      const values = { waited: res.failed, waitedList: waitedList.join(" ") || "none", free: st.free, largest: st.largest, holes: st.holes, internal: st.internal };
      const held = (isBuddy ? res.blocks : res.segs).filter((b) => b.owner && b.req != null);
      for (const b of held) { values[`addr.${b.owner}`] = b.start; values[`block.${b.owner}`] = b.size; }
      return { text: `${MEMORY[v.algo].name}: ${held.map((b) => `${b.owner} at ${b.start} (${b.size} KB)`).join(", ") || "nothing allocated at the end"}; ${waitedList.length ? `${waitedList.join(", ")} had to wait` : "every request was placed"}. Free ${st.free} KB, largest ${st.largest} KB.`, values };
    },
  }),

  tool("address-translation", {
    keywords: "paging logical address physical address page number offset frame page table tlb translation lookaside buffer hit ratio effective access time eat multilevel paging hierarchical page table two level segmentation segment table base limit trap mmu",
    params: {
      mode: { type: "enum", values: Object.keys(XLATE), default: "paging", desc: "paging (single-level with a TLB), multilevel (hierarchical page tables) or segmentation" },
      ps: { type: "int", min: 2, max: 65536, default: PAGING_EXAMPLE.pageSize, desc: "paging: page size in bytes, a power of two" },
      ab: { type: "int", min: 2, max: 16, default: PAGING_EXAMPLE.addressBits, desc: "paging: logical address bits (at most 64 pages)" },
      pt: { type: "string", format: "frame number for page 0, 1, 2, ... separated by spaces, - for an invalid page", default: PAGING_EXAMPLE.pageTable, desc: "paging: the page table" },
      tlb: { type: "int", min: 1, max: 8, default: PAGING_EXAMPLE.tlbSize, desc: "paging: TLB entries" },
      pol: { type: "enum", values: Object.keys(POLICIES), default: PAGING_EXAMPLE.policy, desc: "paging: TLB replacement, fifo or lru" },
      a: { type: "string", format: "logical addresses separated by spaces (decimal, 0x hex or 0b binary), at most 24", default: PAGING_EXAMPLE.addresses, desc: "paging: addresses to translate" },
      m: { type: "number", min: 0, max: 100000, default: 100, desc: "paging: memory access time in ns, for EAT" },
      t: { type: "number", min: 0, max: 100000, default: 20, desc: "paging: TLB lookup time in ns, for EAT (0 if the book ignores it)" },
      bits: { type: "string", format: "bit widths p1 p2 ... offset separated by spaces, 2 to 4 numbers, total at most 32", default: MULTI_EXAMPLE.bits, desc: "multilevel: how the address splits" },
      map: { type: "string", format: "mappings separated by ;, each p1.p2 = frame (one index per level)", default: MULTI_EXAMPLE.mappings.split("\n").join(";"), desc: "multilevel: valid pages; anything not listed is invalid" },
      ma: { type: "string", format: "logical addresses separated by spaces (decimal or 0x hex), at most 12", default: MULTI_EXAMPLE.addresses, desc: "multilevel: addresses to translate" },
      seg: { type: "string", format: "segments 0, 1, 2, ... separated by ;, each base limit", default: SEGMENT_EXAMPLE.segments.split("\n").join(";"), desc: "segmentation: the segment table" },
      sa: { type: "string", format: "(segment, offset) pairs, e.g. (2, 53) (3, 852)", default: SEGMENT_EXAMPLE.addresses, desc: "segmentation: addresses to translate" },
    },
    answers: { "pa.1": "physical address of the 1st address (pa.2 for the 2nd, ...), or fault / trap", hits: "paging: TLB hits", misses: "paging: TLB misses", faults: "paging and multilevel: page faults (invalid pages)", hitRatio: "paging: TLB hit ratio", eat: "paging: effective access time in ns with the run's hit ratio", "acc.1": "multilevel: memory accesses for the 1st address", traps: "segmentation: addresses that trapped" },
    examples: [
      { request: "Page size 4 bytes, page table 5 6 1 2, translate logical addresses 0 3 4 13 with a 3-entry LRU TLB", params: { mode: "paging", ps: 4, ab: 4, pt: "5 6 1 2", tlb: 3, pol: "lru", a: "0 3 4 13" } },
      { request: "Segment table: 0 base 1400 limit 1000, 1 base 6300 limit 400, 2 base 4300 limit 400. Physical address of (2, 53) and (1, 450)?", params: { mode: "segmentation", seg: "1400 1000;6300 400;4300 400", sa: "(2, 53) (1, 450)" } },
    ],
    validate(v) {
      const values = {};
      if (v.mode === "paging") {
        const addresses = parseAddresses(v.a);
        const res = translatePaging({ pageSize: v.ps, addressBits: v.ab, pageTable: parsePageTable(v.pt), tlbSize: v.tlb, policy: v.pol, addresses });
        res.results.forEach((r, k) => { values[`pa.${k + 1}`] = r.fault ? "fault" : r.physical; });
        Object.assign(values, { hits: res.hits, misses: res.misses, faults: res.faults, hitRatio: round(res.hitRatio), eat: round(eat({ hitRatio: res.hitRatio, mem: v.m, tlb: v.t })) });
        return { text: `Physical addresses: ${res.results.map((r) => `${r.addr} -> ${r.fault ? "page fault" : r.physical}`).join(", ")}. TLB hits ${res.hits}, misses ${res.misses}, EAT ${values.eat} ns.`, values };
      }
      if (v.mode === "multilevel") {
        const bits = v.bits.trim().split(/[\s|,]+/).filter(Boolean).map(Number);
        const res = translateMultilevel({ bits, mappings: parseMappings(v.map.replace(/;/g, "\n")), addresses: parseAddresses(v.ma, 12) });
        res.results.forEach((r, k) => { values[`pa.${k + 1}`] = r.fault ? "fault" : r.physical; values[`acc.${k + 1}`] = r.accesses; });
        values.faults = res.results.filter((r) => r.fault).length;
        return { text: `${res.levels}-level paging: ${res.results.map((r) => `0x${r.addr.toString(16).toUpperCase()} -> ${r.fault ? "page fault" : `0x${r.physical.toString(16).toUpperCase()}`}`).join(", ")}.`, values };
      }
      const res = translateSegments({ segments: parseSegments(v.seg.replace(/;/g, "\n")), addresses: parseSegAddresses(v.sa) });
      res.results.forEach((r, k) => { values[`pa.${k + 1}`] = r.trap ? "trap" : r.physical; });
      values.traps = res.results.filter((r) => r.trap).length;
      return { text: `Segmentation: ${res.results.map((r) => `(${r.s}, ${r.d}) -> ${r.trap ? "trap" : r.physical}`).join(", ")}.`, values };
    },
  }),

  tool("file-systems", {
    keywords: "inode unix file system maximum file size direct pointer single indirect double indirect triple indirect index block block pointer disk block access contiguous linked indexed allocation fat",
    params: {
      b: { type: "int", min: 128, max: 65536, default: 4096, desc: "block size in bytes, a power of two" },
      p: { type: "int", min: 2, max: 8, default: 4, desc: "block pointer (address) size in bytes: 2, 3, 4, 6 or 8" },
      d: { type: "int", min: 0, max: 64, default: 12, desc: "direct pointers in the inode" },
      s: { type: "int", min: 0, max: 4, default: 1, desc: "single indirect pointers" },
      dd: { type: "int", min: 0, max: 4, default: 1, desc: "double indirect pointers" },
      t: { type: "int", min: 0, max: 4, default: 1, desc: "triple indirect pointers" },
      x: { type: "number", min: 0, default: 5000000, desc: "byte offset to locate (below the maximum file size)" },
      inode: { type: "bool", default: false, desc: "count reading the inode itself as a disk access" },
      size: { type: "number", min: 1, max: 1e12, default: 10485760, desc: "file size in bytes, for index-block overhead and the allocation comparison" },
    },
    answers: { k: "pointers per index block", maxBlocks: "maximum blocks in a file", maxBytes: "maximum file size in bytes", maxSize: "maximum file size in KB/MB/GB/TB", diskBytes: "largest disk the pointer size can address, in bytes", reads: "disk block accesses to read byte x", region: "which pointer region holds byte x (direct, single, double, triple)", block: "logical block number of byte x", indexBlocks: "index blocks needed for a file of the given size", "reads.linked": "block reads to reach byte x with linked allocation (reads.contiguous, reads.indexed too)" },
    examples: [
      { request: "Inode with 12 direct, 1 single, 1 double and 1 triple indirect pointer, 4 KB blocks and 4-byte addresses: maximum file size?", params: { b: 4096, p: 4, d: 12, s: 1, dd: 1, t: 1 } },
      { request: "Block size 1 KB, 4-byte pointers, 10 direct and one single and double indirect, how many disk accesses to read byte 300000?", params: { b: 1024, p: 4, d: 10, s: 1, dd: 1, t: 0, x: 300000 } },
    ],
    validate(v) {
      if (!Number.isSafeInteger(v.x)) throw new Error("x must be a whole number of bytes.");
      const r = locate({ B: v.b, p: v.p, d: v.d, s: v.s, dd: v.dd, t: v.t, x: v.x, countInode: v.inode });
      const num = (n) => (n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : String(n));
      const values = { k: r.k, maxBlocks: num(r.maxBlocks), maxBytes: num(r.maxBytes), maxSize: human(r.maxBytes), diskBytes: num(r.diskBytes), reads: r.reads, region: r.region, block: num(r.n) };
      try { values.indexBlocks = num(indexBlocks({ B: v.b, p: v.p, d: v.d, s: v.s, dd: v.dd, t: v.t }, v.size)); } catch { /* file too big for this inode */ }
      try { for (const row of allocation({ B: v.b, p: v.p, size: v.size, x: v.x }).rows) values[`reads.${row.id}`] = row.reads; } catch { /* x outside the file */ }
      return { text: `k = ${r.k} pointers per block, so the maximum file size is ${human(r.maxBytes)} (${String(r.maxBytes)} bytes); byte ${v.x} is in the ${r.region} region and takes ${r.reads} block access${r.reads === 1 ? "" : "es"}.`, values };
    },
  }),
];
