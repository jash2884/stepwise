// GATE-style questions made by the same engines the visualisers run, so every
// answer is computed rather than typed in, and the supply never runs out.
// A question is plain data (no DOM), built from a seed so it can be shared:
//   { topic, type: "mcq" | "msq" | "nat", marks, stem, options?, answer,
//     tolerance?, solution, replay }
// stem and solution are lists of blocks: a string is a paragraph, and
// { table: { head, rows } } is a table. replay opens the visualiser on the
// exact same input. Formats follow GATE: MCQ has one correct option, MSQ one
// or more, NAT a number typed in.
import { schedule, ALGORITHMS as CPU, randomProcesses } from "./engines/scheduling.js";
import { replace, randomRefs, ALGORITHMS as PAGING } from "./engines/paging.js";
import { schedule as diskSchedule, randomQueue } from "./engines/disk.js";
import { safety, isSafeSequence, randomState, need, vec } from "./engines/bankers.js";
import { contiguous, randomHoles } from "./engines/memory.js";
import { eat } from "./engines/translation.js";
import { candidateKeys, closure, normalForm, randomSchema } from "./engines/fd.js";
import { analyse } from "./engines/schedules.js";
import { hashTable } from "./engines/hashing.js";
import { costs } from "./engines/joins.js";
import { rng } from "./ui.js";

const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const round2 = (x) => Math.round(x * 100) / 100;
const show = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const query = (path, params) => `${path}?${new URLSearchParams(params)}`;

// --- Operating systems ------------------------------------------------------------

function cpuScheduling(r) {
  const algo = pick(r, ["fcfs", "sjf", "srtf", "rr", "priority", "priority-p"]);
  const procs = randomProcesses(r, int(r, 4, 5));
  const quantum = int(r, 2, 3);
  const res = schedule(procs, algo, { quantum });
  const spec = CPU[algo];
  const ask = pick(r, ["wt", "tat", "ct"]);
  const target = pick(r, res.results);
  const head = ["Process", "Arrival time", "Burst time", ...(spec.usesPriority ? ["Priority"] : [])];
  const rows = procs.map((p) => [p.id, p.arrival, p.burst, ...(spec.usesPriority ? [p.priority] : [])]);
  const how = `${spec.name}${spec.usesQuantum ? ` with time quantum ${quantum}` : ""}`;
  const askText = ask === "ct" ? `the completion time of ${target.id}` : `the average ${ask === "wt" ? "waiting" : "turnaround"} time`;
  const answer = ask === "ct" ? target.ct : round2(res.averages[ask]);
  const slices = res.timeline.reduce((out, s) => {
    const last = out[out.length - 1];
    if (last && last.id === s.id && last.end === s.start) last.end = s.end;
    else out.push({ ...s });
    return out;
  }, []);
  const order = slices.map((s) => `${s.id ?? "idle"} ${s.start}–${s.end}`).join(", ");
  return {
    topic: "cpu-scheduling", type: "nat", marks: ask === "ct" ? 1 : 2, answer, tolerance: 0.01,
    stem: [
      `Consider the following processes, scheduled with ${how}. Times are in milliseconds.`,
      { table: { head, rows } },
      `${spec.usesPriority ? "A lower number means a higher priority. " : ""}Ties are broken in favour of the process that arrived first, then the lower process number. Ignore context-switch overhead.`,
      `What is ${askText}${ask === "ct" ? "" : ", correct to two decimal places"}?`,
    ],
    solution: [
      `Gantt chart: ${order}.`,
      { table: { head: ["Process", "CT", "TAT = CT − AT", "WT = TAT − BT"], rows: res.results.map((x) => [x.id, x.ct, x.tat, x.wt]) } },
      ask === "ct" ? `${target.id} completes at ${target.ct}.` : `Average ${ask === "wt" ? "waiting" : "turnaround"} time = ${res.results.map((x) => x[ask]).join(" + ")} over ${procs.length} = ${show(answer)}.`,
    ],
    replay: query("/cpu-scheduling", { algo, q: quantum, prio: "low", p: procs.map((p) => `${p.arrival}-${p.burst}-${p.priority}`).join("_") }),
  };
}

function pageReplacement(r) {
  const algo = pick(r, ["fifo", "lru", "optimal"]);
  const refs = randomRefs(r, int(r, 12, 16));
  const frames = int(r, 3, 4);
  const res = replace(refs, frames, algo);
  if (new Set(refs).size < frames + 2 || res.faults < frames + 3) return null; // too few evictions to be worth asking
  const faultsAt = res.steps.map((s, i) => (s.hit ? null : refs[i])).filter((x) => x !== null);
  return {
    topic: "page-replacement", type: "nat", marks: res.faults > 9 ? 2 : 1, answer: res.faults, tolerance: 0,
    stem: [
      `A process has ${frames} page frames, all initially empty. It makes this sequence of page references:`,
      refs.join(", "),
      `How many page faults occur with ${PAGING[algo].name} page replacement?`,
    ],
    solution: [
      `Faults happen on the references to ${faultsAt.join(", ")}: the first ${Math.min(frames, new Set(refs).size)} fill the empty frames, and every later fault evicts a page.`,
      `Total: ${res.faults} faults and ${res.hits} hits out of ${refs.length} references.`,
    ],
    replay: query("/page-replacement", { r: refs.join(" "), f: frames, algo }),
  };
}

const DISK = { fcfs: "FCFS", sstf: "SSTF", scan: "SCAN", cscan: "C-SCAN", look: "LOOK", clook: "C-LOOK" };
function diskScheduling(r) {
  const algo = pick(r, Object.keys(DISK));
  const { requests, head } = randomQueue(r, 200);
  const queue = [...new Set(requests)].filter((c) => c !== head).slice(0, int(r, 6, 8));
  if (queue.length < 6) return null;
  const direction = r() < 0.5 ? "up" : "down";
  const res = diskSchedule(queue, head, algo, { cylinders: 200, direction, countJump: true });
  const directional = !["fcfs", "sstf"].includes(algo);
  return {
    topic: "disk-scheduling", type: "nat", marks: directional ? 2 : 1, answer: res.total, tolerance: 0,
    stem: [
      `A disk has 200 cylinders, numbered 0 to 199. The head is at cylinder ${head}${directional ? ` and is moving towards ${direction === "up" ? "higher-numbered cylinders" : "cylinder 0"}` : ""}. The request queue, in arrival order, is:`,
      queue.join(", "),
      `Using ${DISK[algo]} scheduling, what is the total head movement in cylinders?${algo === "cscan" || algo === "clook" ? " Count the return seek as head movement." : ""}${algo === "sstf" ? " Break ties in favour of the request that arrived first." : ""}`,
    ],
    solution: [
      `Service order from ${head}: ${res.path.slice(1).join(" → ")}.`,
      `Total head movement = ${res.moves.map((m) => Math.abs(m.to - m.from)).join(" + ")} = ${res.total} cylinders.`,
    ],
    replay: query("/disk-scheduling", { r: queue.join(" "), h: head, c: 200, algo, dir: direction, jump: 1 }),
  };
}

function bankers(r) {
  const n = int(r, 4, 5), m = 3;
  const state = randomState(r, n, m);
  const res = safety(state);
  const perm = () => shuffle(r, Array.from({ length: n }, (_, i) => i));
  const wrong = [];
  for (let tries = 0; wrong.length < 3 && tries < 200; tries++) {
    const p = perm();
    if (!isSafeSequence(state, p) && !wrong.some((w) => w.join() === p.join())) wrong.push(p);
  }
  if (wrong.length < 3) return null; // nearly every order is safe: not a useful question
  const seq = (p) => p.map((i) => `P${i}`).join(", ");
  const unsafe = "None of these: the state is unsafe";
  const options = res.safe ? [...shuffle(r, [seq(res.sequence), seq(wrong[0]), seq(wrong[1])]), unsafe] : [seq(wrong[0]), seq(wrong[1]), seq(wrong[2]), unsafe];
  const needs = need(state.max, state.allocation);
  return {
    topic: "bankers-algorithm", type: "mcq", marks: 2, options, answer: res.safe ? options.indexOf(seq(res.sequence)) : 3,
    stem: [
      `A system has ${n} processes and 3 resource types A, B and C. Available = ${vec(state.available)}.`,
      { table: { head: ["Process", "Allocation (A B C)", "Max (A B C)"], rows: state.allocation.map((a, i) => [`P${i}`, a.join(" "), state.max[i].join(" ")]) } },
      "Using the Banker's algorithm, which of the following is a safe sequence?",
    ],
    solution: [
      { table: { head: ["Process", "Need = Max − Allocation"], rows: needs.map((x, i) => [`P${i}`, x.join(" ")]) } },
      res.safe ? `Running the safety algorithm from Work = ${vec(state.available)} finishes everyone in the order ${seq(res.sequence)}. Each wrong option gets stuck: some process's Need exceeds Work at its turn.`
        : `The safety algorithm gets stuck: after ${res.sequence.length ? seq(res.sequence) : "no process"}, no remaining process's Need fits in Work. The state is unsafe, so no sequence is safe.`,
    ],
    replay: query("/bankers-algorithm", { s: [state.allocation, state.max].map((x) => x.map((row) => row.join(".")).join("_")).concat(state.available.join(".")).join("~") }),
  };
}

const FITS = [["first", "First fit"], ["next", "Next fit"], ["best", "Best fit"], ["worst", "Worst fit"]];
function memoryAllocation(r) {
  const holes = randomHoles(r, 5);
  const sizes = Array.from({ length: 4 }, () => 10 * int(r, 8, 50));
  const ops = sizes.map((size, i) => ({ op: "alloc", name: `P${i + 1}`, size }));
  const results = FITS.map(([id]) => contiguous(holes, ops, id));
  const answer = results.map((x, i) => (x.failed === 0 ? i : null)).filter((x) => x !== null);
  if (!answer.length || answer.length === 4) return null;
  return {
    topic: "memory-allocation", type: "msq", marks: 2, options: FITS.map(([, name]) => name), answer,
    stem: [
      `Memory has free partitions of ${holes.join(" KB, ")} KB, in that order. Processes of ${sizes.join(" KB, ")} KB (P1 to P4) arrive in that order. A partition that is larger than a request is split, and the rest stays free.`,
      "Which placement algorithms can allocate memory to all four processes?",
    ],
    solution: FITS.map(([, name], i) => `${name}: ${results[i].failed ? `${results[i].failed} process${results[i].failed > 1 ? "es" : ""} must wait` : "every process fits"}. Free memory left: ${results[i].stats.free} KB, largest hole ${results[i].stats.largest} KB.`),
    replay: query("/memory-allocation", { algo: "first", h: holes.join(" "), s: ops.map((o) => `${o.name} ${o.size}`).join("; ") }),
  };
}

function addressTranslation(r) {
  if (r() < 0.5) {
    const hitRatio = pick(r, [0.8, 0.85, 0.9, 0.95, 0.98]), mem = pick(r, [50, 80, 100, 120, 150, 200]), tlb = pick(r, [5, 10, 20]);
    const answer = round2(eat({ hitRatio, mem, tlb }));
    return {
      topic: "address-translation", type: "nat", marks: 1, answer, tolerance: 0.01,
      stem: [`A paged system has a TLB with a hit ratio of ${hitRatio * 100}%. A TLB lookup takes ${tlb} ns and a memory access ${mem} ns. The page table is in memory and has one level. What is the effective memory access time in ns?`],
      solution: [`Hit: TLB + memory = ${tlb + mem} ns. Miss: TLB + page table + memory = ${tlb + 2 * mem} ns.`, `EAT = ${hitRatio} × ${tlb + mem} + ${round2(1 - hitRatio)} × ${tlb + 2 * mem} = ${show(answer)} ns.`],
      replay: "/address-translation",
    };
  }
  const bits = pick(r, [32, 34, 36]), pageKB = pick(r, [1, 2, 4, 8, 16]), pte = pick(r, [2, 4, 8]);
  const offset = 10 + Math.log2(pageKB), entries = 2 ** (bits - offset), bytes = entries * pte;
  const answer = bytes / 2 ** 20;
  return {
    topic: "address-translation", type: "nat", marks: 1, answer, tolerance: 0.01,
    stem: [`A system uses ${bits}-bit virtual addresses, a page size of ${pageKB} KB and ${pte}-byte page table entries. With a single-level page table, what is the size of one process's page table in MB?`],
    solution: [`Offset bits = log₂(${pageKB} × 1024) = ${offset}, so the page number has ${bits} − ${offset} = ${bits - offset} bits: 2^${bits - offset} entries.`, `Size = 2^${bits - offset} × ${pte} B = ${show(answer)} MB.`],
    replay: "/address-translation",
  };
}

// --- Databases --------------------------------------------------------------------

const fdList = (fds) => fds.map((f) => `${f.lhs} → ${f.rhs}`).join(", ");
const fdParam = (fds) => fds.map((f) => `${f.lhs}->${f.rhs}`).join(";");
function normalisation(r) {
  const { attrs, fds } = randomSchema(r);
  const relation = `R(${attrs.split("").join(", ")})`;
  const { keys } = candidateKeys(attrs, fds);
  const variant = pick(r, ["nf", "count", "which"]);
  const base = [`Relation ${relation} has these functional dependencies: ${fdList(fds)}.`];
  if (variant === "nf") {
    const nf = normalForm(attrs, fds);
    const options = ["1NF but not 2NF", "2NF but not 3NF", "3NF but not BCNF", "BCNF"];
    const v = nf.violations[nf.form === "1NF" ? "2NF" : nf.form === "2NF" ? "3NF" : "BCNF"];
    return {
      topic: "normalization", type: "mcq", marks: 2, options, answer: ["1NF", "2NF", "3NF", "BCNF"].indexOf(nf.form),
      stem: [...base, "What is the highest normal form R is in?"],
      solution: [`Candidate key${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}.`, nf.form === "BCNF" ? "Every non-trivial dependency has a superkey on the left, so R is in BCNF." : `R is in ${nf.form} but no higher: ${v[0].lhs} → ${v[0].rhs} breaks the next form because ${v[0].why}`],
      replay: query("/normalization", { r: attrs, fd: fdParam(fds), algo: "nf" }),
    };
  }
  if (variant === "count") {
    return {
      topic: "normalization", type: "nat", marks: 1, answer: keys.length, tolerance: 0,
      stem: [...base, "How many candidate keys does R have?"],
      solution: [...candidateKeys(attrs, fds).reasoning],
      replay: query("/normalization", { r: attrs, fd: fdParam(fds), algo: "keys" }),
    };
  }
  // Which of these are candidate keys? Mix real keys with superkeys that aren't
  // minimal and sets that don't determine everything.
  const isKey = (x) => keys.includes(x);
  const sorted = (s) => [...new Set(s)].sort().join("");
  const pool = new Set(keys);
  for (const k of keys) for (const a of attrs) if (!k.includes(a)) pool.add(sorted(k + a));
  for (let i = 0; i < 20; i++) pool.add(sorted(attrs.split("").filter(() => r() < 0.4).join("") || pick(r, attrs.split(""))));
  const candidates = shuffle(r, [...pool].filter((x) => x.length < attrs.length));
  const chosen = [...shuffle(r, keys).slice(0, int(r, 1, Math.min(2, keys.length))), ...candidates.filter((x) => !isKey(x))].slice(0, 4);
  if (chosen.length < 4) return null;
  const options = shuffle(r, chosen);
  return {
    topic: "normalization", type: "msq", marks: 2, options, answer: options.map((x, i) => (isKey(x) ? i : null)).filter((x) => x !== null),
    stem: [...base, "Which of the following are candidate keys of R?"],
    solution: [...options.map((x) => `${x}⁺ = ${closure(x, fds).closure}: ${isKey(x) ? "everything, and no proper subset works, so a candidate key." : closure(x, fds).closure === attrs ? "a superkey, but a smaller part of it is already a key, so not minimal." : "not every attribute, so not a key."}`)],
    replay: query("/normalization", { r: attrs, fd: fdParam(fds), algo: "keys" }),
  };
}

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}
function serialisability(r) {
  const n = int(r, 2, 3), items = n === 3 ? ["A", "B"] : ["A", "B", "C"].slice(0, int(r, 2, 3));
  const per = Array.from({ length: n }, (_, k) => {
    const list = [];
    for (let len = int(r, 2, 3); list.length < len;) {
      const op = `${r() < 0.5 ? "R" : "W"}${k + 1}(${pick(r, items)})`;
      if (!list.includes(op)) list.push(op);
    }
    return list;
  });
  const ops = [];
  while (per.some((p) => p.length)) {
    const live = per.filter((p) => p.length);
    const p = pick(r, live);
    ops.push(p.shift());
    if (!p.length) ops.push(`C${per.indexOf(p) + 1}`); // commit right after a transaction's last operation
  }
  const text = ops.join(" ");
  const res = analyse(text);
  const variant = pick(r, ["msq", "edges", "order"]);
  const T = (t) => `T${t}`;
  const base = ["Consider the schedule S below, where R and W are reads and writes, and Ci is Ti's commit.", text];
  const replay = query("/serializability", { s: text });
  const edgeList = res.edges.length ? res.edges.map((e) => `${T(e.from)} → ${T(e.to)}`).join(", ") : "none";
  if (variant === "edges") {
    return {
      topic: "serializability", type: "nat", marks: 1, answer: res.edges.length, tolerance: 0,
      stem: [...base, "How many edges does the precedence graph of S have?"],
      solution: [`Conflicting pairs: ${res.pairs.length ? res.pairs.map((p) => `${opLabel(p.a)} before ${opLabel(p.b)}`).join(", ") : "none"}.`, `Distinct edges: ${edgeList}. That's ${res.edges.length}.`],
      replay,
    };
  }
  if (variant === "order" && res.conflictSerializable && n === 3) {
    const all = permutations(res.txns);
    const valid = all.filter((p) => res.edges.every((e) => p.indexOf(e.from) < p.indexOf(e.to)));
    if (valid.length === 1) {
      const fmtOrder = (p) => p.map(T).join(" → ");
      const options = shuffle(r, [valid[0], ...shuffle(r, all.filter((p) => p !== valid[0])).slice(0, 3)]).map(fmtOrder);
      return {
        topic: "serializability", type: "mcq", marks: 2, options, answer: options.indexOf(fmtOrder(valid[0])),
        stem: [...base, "S is conflict serialisable. Which serial schedule is it conflict equivalent to?"],
        solution: [`Precedence graph edges: ${edgeList}. It has no cycle, and the only topological order is ${fmtOrder(valid[0])}.`],
        replay,
      };
    }
  }
  const statements = [
    ["S is conflict serialisable", res.conflictSerializable],
    ["S is view serialisable", res.viewSerializable],
    ["S is recoverable", res.recovery.recoverable],
    ["S is cascadeless", res.recovery.cascadeless],
  ];
  const answer = statements.map(([, ok], i) => (ok ? i : null)).filter((x) => x !== null);
  if (!answer.length) return null;
  return {
    topic: "serializability", type: "msq", marks: 2, options: statements.map(([s]) => s), answer,
    stem: [...base, "Which of the following statements are true?"],
    solution: [
      `Precedence graph edges: ${edgeList}. ${res.cycle ? `Cycle ${res.cycle.map(T).join(" → ")}, so not conflict serialisable.` : "No cycle, so conflict serialisable (and therefore view serialisable)."}`,
      res.conflictSerializable ? "" : res.viewSerializable ? `It is view equivalent to ${res.viewOrder.map(T).join(" → ")} (it has blind writes).` : "No serial order is view equivalent, so it isn't view serialisable either.",
      `Recoverable: ${res.recovery.recoverable ? "yes" : "no"}. Cascadeless: ${res.recovery.cascadeless ? "yes" : "no"}.${res.recovery.note ? ` ${res.recovery.note}` : ""}`,
    ].filter(Boolean),
    replay,
  };
}
const opLabel = (o) => `${o.kind}${o.t}(${o.item})`;

const PROBES = { linear: "linear probing", quadratic: "quadratic probing", chaining: "separate chaining" };
function hashing(r) {
  const strategy = pick(r, ["linear", "linear", "quadratic", "chaining"]);
  const m = pick(r, [7, 10, 11, 13]);
  const keys = [];
  while (keys.length < int(r, 6, 7)) { const k = int(r, 10, 99); if (!keys.includes(k)) keys.push(k); }
  const res = hashTable(keys, m, strategy);
  if (res.steps.some((s) => s.failed)) return null;
  const base = [`The keys ${keys.join(", ")} are inserted in that order into an empty hash table of size ${m}, using h(k) = k mod ${m} and ${PROBES[strategy]}${strategy === "quadratic" ? " (probe h(k) + i² for i = 0, 1, 2, …)" : ""}.`];
  const replay = query("/hashing", { mode: "table", k: keys.join(" "), m, st: strategy });
  if (strategy === "chaining") {
    const longest = Math.max(...res.table.map((c) => c.length));
    return {
      topic: "hashing", type: "nat", marks: 1, answer: longest, tolerance: 0,
      stem: [...base, "What is the length of the longest chain?"],
      solution: [`Slots: ${res.table.map((c, i) => (c.length ? `${i}: ${c.join(", ")}` : null)).filter(Boolean).join("; ")}.`, `The longest chain has ${longest} key${longest === 1 ? "" : "s"}.`],
      replay,
    };
  }
  const collided = res.steps.filter((s) => s.probes.length > 1);
  const target = collided.length ? collided[collided.length - 1] : res.steps[res.steps.length - 1];
  return {
    topic: "hashing", type: "nat", marks: collided.length ? 2 : 1, answer: target.slot, tolerance: 0,
    stem: [...base, `In which slot is key ${target.key} stored?`],
    solution: [...res.steps.map((s) => s.note)],
    replay,
  };
}

function joinCost(r) {
  const nr = 100 * int(r, 10, 100), br = 10 * int(r, 5, 60), ns = 100 * int(r, 10, 100), bs = 10 * int(r, 5, 60), M = int(r, 4, 12);
  const c = costs({ nr, br, ns, bs, M });
  const variant = pick(r, ["nlj", "bnlj-m", "bnlj"]);
  const row = c.rows.find((x) => x.id === variant);
  const what = { nlj: "a tuple-at-a-time nested-loop join", "bnlj-m": `a block nested-loop join with ${M} buffer blocks`, bnlj: "a block nested-loop join when only one block of each relation fits in memory" }[variant];
  return {
    topic: "sql-joins", type: "nat", marks: 2, answer: row.transfers, tolerance: 0,
    stem: [`Relation r has ${nr} tuples in ${br} blocks and relation s has ${ns} tuples in ${bs} blocks. They are joined with ${what}, with r as the outer relation. In the worst case, how many block transfers are needed? (Don't count writing the result.)`],
    solution: [`${row.name}: ${row.formula}.`, `= ${{ nlj: `${nr} × ${bs} + ${br}`, "bnlj-m": `⌈${br} / ${M - 2}⌉ × ${bs} + ${br} = ${Math.ceil(br / (M - 2))} × ${bs} + ${br}`, bnlj: `${br} × ${bs} + ${br}` }[variant]} = ${row.transfers} block transfers.`],
    replay: query("/sql-joins", { mode: "algo", c: [nr, br, ns, bs, M].join(",") }),
  };
}

// --- Registry -----------------------------------------------------------------------

export const TOPICS = [
  { slug: "cpu-scheduling", subject: "os", title: "CPU scheduling", make: cpuScheduling },
  { slug: "page-replacement", subject: "os", title: "Page replacement", make: pageReplacement },
  { slug: "disk-scheduling", subject: "os", title: "Disk scheduling", make: diskScheduling },
  { slug: "bankers-algorithm", subject: "os", title: "Banker's algorithm", make: bankers },
  { slug: "memory-allocation", subject: "os", title: "Memory allocation", make: memoryAllocation },
  { slug: "address-translation", subject: "os", title: "Paging and TLBs", make: addressTranslation },
  { slug: "normalization", subject: "dbms", title: "Keys and normal forms", make: normalisation },
  { slug: "serializability", subject: "dbms", title: "Serialisability", make: serialisability },
  { slug: "hashing", subject: "dbms", title: "Hashing", make: hashing },
  { slug: "sql-joins", subject: "dbms", title: "Join cost", make: joinCost },
];
export const topicOf = (slug) => TOPICS.find((t) => t.slug === slug);

// The same seed always gives the same question, so a question can be shared.
export function generate(slug, seed) {
  const topic = topicOf(slug);
  if (!topic) throw new Error(`No GATE questions for ${slug}`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const q = topic.make(rng(seed + attempt * 7919));
    if (q) return { ...q, seed };
  }
  throw new Error(`Couldn't make a ${slug} question from seed ${seed}`);
}

// GATE marking: a wrong MCQ costs a third of its marks; MSQ and NAT have no
// negative marks, and an MSQ only scores when exactly the right options are picked.
export function check(q, response) {
  let correct;
  if (q.type === "nat") correct = Number.isFinite(response) && Math.abs(response - q.answer) <= (q.tolerance ?? 0) + 1e-9;
  else if (q.type === "mcq") correct = response === q.answer;
  else correct = Array.isArray(response) && response.length === q.answer.length && [...response].sort().every((x, i) => x === [...q.answer].sort()[i]);
  const score = correct ? q.marks : q.type === "mcq" ? -round2(q.marks / 3) : 0;
  return { correct, score };
}
