// CPU scheduling simulator. Time advances one unit at a time so every algorithm
// shares one loop and every tick can become a step in the visualisation. Each
// step (frame) names the pseudocode line being executed and the variables then.
//
// Conventions (stated in the UI, since textbooks differ):
// - Ties are broken by arrival time, then by process order in the table.
// - Preemptive algorithms only preempt for a strictly better candidate.
// - Round Robin: a process that arrives at the same moment another one's quantum
//   expires joins the ready queue first; the preempted process goes behind it.
// - Priority: a lower number means higher priority, unless told otherwise.
// - Multilevel queue: the priority column is the queue number. Every queue but
//   the lowest runs Round Robin; the lowest runs FCFS. A higher queue always
//   preempts a lower one.
// - MLFQ: three levels, Q0 (RR, quantum q), Q1 (RR, quantum 2q), Q2 (FCFS).
//   Everyone starts in Q0; using a whole quantum demotes a process one level.
//   A process preempted by a higher level keeps its level and goes to the back.
// - A context switch is counted whenever the CPU moves from one process to a
//   different one (idle gaps are skipped over; the first dispatch is free).

const NONPRE = (rule, why) => [
  "while some process is unfinished",
  "  move every process with AT ≤ t into ready",
  "  if ready is empty then idle until the next arrival",
  `  p ← ${rule}  // ${why}`,
  "  run p to completion  // non-preemptive: nobody can interrupt",
  "  CT[p] ← t; TAT ← CT − AT; WT ← TAT − BT",
];
const PRE = (rule, beats) => [
  "for each time unit t",
  "  move every process with AT ≤ t into ready",
  "  if ready is empty and the CPU is free then idle",
  `  best ← ${rule}`,
  `  if best ${beats} running then preempt running  // back to ready`,
  "  run the chosen process for 1 unit; rem ← rem − 1",
  "  if rem = 0 then CT ← t + 1  // finished",
];
const NP_AT = { arrive: 2, idle: 3, pick: 4, run: 5, finish: 6, done: 1 };
const P_AT = { arrive: 2, idle: 3, pick: 4, preempt: 5, run: 6, finish: 7, done: 1 };

export const ALGORITHMS = {
  fcfs: { name: "First Come First Serve (FCFS)", preemptive: false, code: NONPRE("the head of ready", "earliest arrival first"), at: NP_AT },
  sjf: { name: "Shortest Job First (SJF)", preemptive: false, code: NONPRE("ready process with the smallest burst", "short jobs first"), at: NP_AT },
  ljf: { name: "Longest Job First (LJF)", preemptive: false, code: NONPRE("ready process with the largest burst", "long jobs first"), at: NP_AT },
  hrrn: { name: "Highest Response Ratio Next (HRRN)", preemptive: false, code: NONPRE("ready process with the largest (W + B) / B", "waiting raises the ratio"), at: NP_AT },
  srtf: { name: "Shortest Remaining Time First (SRTF)", preemptive: true, code: PRE("ready process with the least remaining time", "has strictly less remaining than"), at: P_AT },
  lrtf: { name: "Longest Remaining Time First (LRTF)", preemptive: true, code: PRE("ready process with the most remaining time", "has strictly more remaining than"), at: P_AT },
  priority: { name: "Priority (non-preemptive)", preemptive: false, usesPriority: true, code: NONPRE("ready process with the best priority", "most important first"), at: NP_AT },
  "priority-p": { name: "Priority (preemptive)", preemptive: true, usesPriority: true, code: PRE("ready process with the best priority", "has a strictly better priority than"), at: P_AT },
  rr: {
    name: "Round Robin (RR)", preemptive: true, usesQuantum: true,
    code: [
      "for each time unit t",
      "  move every process with AT ≤ t to the back of ready",
      "  if the CPU is free and ready is empty then idle",
      "  if the CPU is free then p ← pop front of ready; slice ← q",
      "  run p for 1 unit; rem ← rem − 1; slice ← slice − 1",
      "  if rem = 0 then CT ← t + 1  // finished",
      "  else if slice = 0 then push p to the back of ready  // quantum used up",
    ],
    at: { arrive: 2, idle: 3, pick: 4, run: 5, finish: 6, quantum: 7, done: 1 },
  },
  mlq: {
    name: "Multilevel queue (MLQ)", preemptive: true, usesQuantum: true, usesPriority: true, levels: true,
    code: [
      "for each time unit t",
      "  put each arrival in queue[its priority]  // fixed for life",
      "  if every queue is empty then idle",
      "  k ← the highest non-empty queue",
      "  if k is above running's queue then preempt running",
      "  if the CPU is free then p ← pop front of queue[k]",
      "  run p for 1 unit  // RR in upper queues, FCFS in the lowest",
      "  if rem = 0 then CT ← t + 1  // finished",
      "  else if its slice is used up then back of the same queue",
    ],
    at: { arrive: 2, idle: 3, pick: [4, 6], preempt: [4, 5], run: 7, finish: 8, quantum: 9, done: 1 },
  },
  mlfq: {
    name: "Multilevel feedback queue (MLFQ)", preemptive: true, usesQuantum: true, levels: true,
    code: [
      "for each time unit t",
      "  put each arrival at the back of Q0  // everyone starts on top",
      "  if every queue is empty then idle",
      "  k ← the highest non-empty queue",
      "  if k is above running's queue then preempt running  // it keeps its level",
      "  if the CPU is free then p ← pop front of Q[k]; slice ← quantum[k]",
      "  run p for 1 unit; rem ← rem − 1; slice ← slice − 1",
      "  if rem = 0 then CT ← t + 1  // finished",
      "  else if slice = 0 then demote p to Q[k+1]  // CPU-hungry: drop a level",
    ],
    at: { arrive: 2, idle: 3, pick: [4, 6], preempt: [4, 5], run: 7, finish: 8, quantum: 9, done: 1 },
  },
};

export function validate(processes) {
  if (!processes.length) return "Add at least one process.";
  if (processes.length > 12) return "Use at most 12 processes.";
  for (const p of processes) {
    if (![p.arrival, p.burst, p.priority ?? 0].every(Number.isInteger)) return `${p.id}: use whole numbers.`;
    if (p.arrival < 0 || p.arrival > 100) return `${p.id}: arrival time must be between 0 and 100.`;
    if (p.burst < 1 || p.burst > 50) return `${p.id}: burst time must be between 1 and 50.`;
  }
  return null;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function schedule(processes, algo, { quantum = 2, lowerIsHigher = true } = {}) {
  const spec = ALGORITHMS[algo];
  if (!spec) throw new Error(`Unknown algorithm ${algo}`);
  const error = validate(processes);
  if (error) throw new Error(error);
  if (spec.usesQuantum && !(Number.isInteger(quantum) && quantum >= 1 && quantum <= 20)) throw new Error("Time quantum must be a whole number from 1 to 20.");

  const procs = processes.map((p, index) => ({ ...p, index, priority: p.priority ?? 0, remaining: p.burst, start: null, finish: null, level: 0 }));
  const prio = (p) => (lowerIsHigher ? p.priority : -p.priority);
  const tieBreak = (a, b) => a.arrival - b.arrival || a.index - b.index;
  const ratio = (p, t) => (t - p.arrival + p.burst) / p.burst;
  let t = 0;
  const better = {
    sjf: (a, b) => a.burst - b.burst || tieBreak(a, b),
    ljf: (a, b) => b.burst - a.burst || tieBreak(a, b),
    hrrn: (a, b) => ratio(b, t) - ratio(a, t) || tieBreak(a, b),
    srtf: (a, b) => a.remaining - b.remaining || tieBreak(a, b),
    lrtf: (a, b) => b.remaining - a.remaining || tieBreak(a, b),
    priority: (a, b) => prio(a) - prio(b) || tieBreak(a, b),
    "priority-p": (a, b) => prio(a) - prio(b) || tieBreak(a, b),
  }[algo];

  // Queue levels. Single-queue algorithms use level 0 only.
  let levelNames = ["Ready"], slices = [quantum];
  if (algo === "mlq") {
    const ps = [...new Set(procs.map(prio))].sort((a, b) => a - b);
    for (const p of procs) p.level = ps.indexOf(prio(p));
    levelNames = ps.map((v, k) => `Q${k} · priority ${lowerIsHigher ? v : -v} · ${k === ps.length - 1 ? "FCFS" : `RR q=${quantum}`}`);
    slices = ps.map((_, k) => (k === ps.length - 1 ? Infinity : quantum));
  } else if (algo === "mlfq") {
    levelNames = [`Q0 · RR q=${quantum}`, `Q1 · RR q=${2 * quantum}`, "Q2 · FCFS"];
    slices = [quantum, 2 * quantum, Infinity];
  }
  const queues = levelNames.map(() => []);
  const levelled = !!spec.levels;

  let running = null, quantumLeft = 0, switches = 0, preemptions = 0, lastRan = null;
  const timeline = [], frames = [];
  const arrived = new Set(), done = [];
  const notes = [];
  let events = new Set(), pickVars = {};

  const allReady = () => queues.flat();
  const admit = (time) => {
    for (const p of procs.filter((x) => x.arrival === time && !arrived.has(x.id)).sort(tieBreak)) {
      arrived.add(p.id);
      queues[p.level].push(p);
      events.add("arrive");
      notes.push(levelled
        ? `${p.id} arrives at t=${time} and joins ${levelNames[p.level].split(" ·")[0]}${algo === "mlfq" ? " (every new process starts in the top queue)" : ` (its priority ${p.priority} fixes it to that queue)`}.`
        : `${p.id} arrives at t=${time} and joins the ready queue.`);
    }
  };
  const take = (p) => queues[p.level].splice(queues[p.level].indexOf(p), 1);
  const pickBest = () => [...queues[0]].sort(better)[0];
  const dispatch = (p) => {
    if (lastRan && lastRan !== p.id) switches++;
    running = p;
  };

  admit(0);
  while (done.length < procs.length) {
    // Choose who runs during [t, t+1).
    const ready = queues[0];
    if (algo === "fcfs") {
      if (!running && ready.length) {
        dispatch(ready.shift());
        events.add("pick");
        notes.push(`${running.id} is at the head of the queue (it arrived first, at t=${running.arrival}), so it gets the CPU and keeps it until it finishes.`);
      }
    } else if (algo === "rr") {
      if (!running && ready.length) {
        dispatch(ready.shift());
        quantumLeft = quantum;
        events.add("pick");
        notes.push(`${running.id} is at the front of the queue, so it gets the CPU for a time slice of up to ${plural(quantum, "unit")} (it needs ${running.remaining} more).`);
      }
    } else if (levelled) {
      const top = queues.findIndex((q) => q.length);
      if (running && top !== -1 && top < running.level) {
        events.add("preempt");
        preemptions++;
        notes.push(`${queues[top][0].id} is waiting in ${levelNames[top].split(" ·")[0]}, a higher queue than ${running.id}'s ${levelNames[running.level].split(" ·")[0]}, so ${running.id} is preempted. Higher queues always win; ${running.id} keeps its level and goes to the back of its queue.`);
        queues[running.level].push(running);
        lastRan = running.id;
        running = null;
      }
      if (!running && top !== -1) {
        const lvl = queues.findIndex((q) => q.length);
        dispatch(queues[lvl].shift());
        quantumLeft = slices[lvl];
        events.add("pick");
        const higherEmpty = lvl > 0 ? ` Every queue above ${levelNames[lvl].split(" ·")[0]} is empty, so this queue gets its turn.` : "";
        notes.push(`${running.id} is at the front of ${levelNames[lvl].split(" ·")[0]}, the highest non-empty queue.${higherEmpty} ${slices[lvl] === Infinity ? "This is the FCFS queue, so it can run to completion unless a higher queue fills up." : `It gets a slice of up to ${plural(slices[lvl], "unit")}.`}`);
        pickVars = { queue: `Q${lvl}`, slice: slices[lvl] };
      }
    } else if (!spec.preemptive) {
      if (!running && ready.length) {
        const cands = [...ready];
        const best = pickBest();
        take(best);
        dispatch(best);
        events.add("pick");
        const others = cands.filter((p) => p !== best);
        if (algo === "sjf" || algo === "ljf") {
          notes.push(`${best.id} has the ${algo === "sjf" ? "shortest" : "longest"} burst (${best.burst}) of the ${plural(cands.length, "waiting process")}${others.length ? ` (${others.map((p) => `${p.id}: ${p.burst}`).join(", ")})` : ""}, so it runs to completion.`);
          pickVars = { bursts: cands.map((p) => `${p.id}=${p.burst}`) };
        } else if (algo === "hrrn") {
          const rs = cands.map((p) => `${p.id}: (${t - p.arrival} + ${p.burst}) / ${p.burst} = ${ratio(p, t).toFixed(2)}`);
          notes.push(`Response ratio = (waiting + burst) / burst. ${rs.join("; ")}. ${best.id} has the highest, so it runs next. Long waits push a job's ratio up, so long jobs can't starve.`);
          pickVars = { ratios: cands.map((p) => `${p.id}=${ratio(p, t).toFixed(2)}`) };
        } else {
          notes.push(`${best.id} has the best priority (${best.priority}) of the ${plural(cands.length, "waiting process")}${others.length ? ` (${others.map((p) => `${p.id}: ${p.priority}`).join(", ")})` : ""}, so it runs to completion.`);
          pickVars = { priorities: cands.map((p) => `${p.id}=${p.priority}`) };
        }
      }
    } else {
      const candidate = ready.length ? pickBest() : null;
      const beats = (c, r) => (algo === "srtf" ? c.remaining < r.remaining : algo === "lrtf" ? c.remaining > r.remaining : prio(c) < prio(r));
      if (candidate && (!running || better(candidate, running) < 0 && beats(candidate, running))) {
        const key = algo === "priority-p" ? "priority" : "remaining";
        if (running) {
          events.add("preempt");
          preemptions++;
          notes.push(algo === "srtf"
            ? `${candidate.id} preempts ${running.id}: it needs only ${candidate.remaining} more unit${candidate.remaining === 1 ? "" : "s"}, less than ${running.id}'s ${running.remaining}. Running the shortest remaining job first is what keeps the average wait minimal.`
            : algo === "lrtf"
              ? `${candidate.id} preempts ${running.id}: it has ${candidate.remaining} units left, more than ${running.id}'s ${running.remaining}, and LRTF always runs the longest remaining job.`
              : `${candidate.id} preempts ${running.id}: priority ${candidate.priority} beats ${running.priority}, and a more important process never waits behind a less important one.`);
          queues[0].push(running);
          lastRan = running.id;
        } else {
          events.add("pick");
          notes.push(algo === "priority-p"
            ? `${candidate.id} has the best priority (${candidate.priority}) of everyone ready, so it gets the CPU.`
            : `${candidate.id} has the ${algo === "srtf" ? "shortest" : "longest"} remaining time (${candidate.remaining}) of everyone ready, so it gets the CPU.`);
        }
        pickVars = { [key === "priority" ? "priorities" : "remaining"]: ready.map((p) => `${p.id}=${p[key]}`) };
        take(candidate);
        dispatch(candidate);
      }
    }

    if (!running) {
      // CPU idles until the next arrival.
      const next = Math.min(...procs.filter((p) => !arrived.has(p.id)).map((p) => p.arrival));
      notes.push(`Nothing is ready, so the CPU is idle until the next arrival at t=${next}.`);
      events.add("idle");
      frames.push(frame(t, null, allReady(), done, procs, notes.splice(0), lineFor(spec, events), vars(), queues));
      events = new Set(); pickVars = {};
      timeline.push({ id: null, start: t, end: next });
      t = next;
      admit(t);
      continue;
    }

    if (running.start === null) running.start = t;
    events.add("run");
    const waiting = allReady();
    const keepWhy = !waiting.length ? " Nobody else is ready."
      : !spec.preemptive ? " Non-preemptive: it keeps the CPU until it finishes."
      : algo === "srtf" ? ` Nobody ready has less remaining (${waiting.map((p) => `${p.id}: ${p.remaining}`).join(", ")}).`
      : algo === "lrtf" ? ` Nobody ready has more remaining (${waiting.map((p) => `${p.id}: ${p.remaining}`).join(", ")}).`
      : algo === "priority-p" ? ` Nobody ready has a better priority (${waiting.map((p) => `${p.id}: ${p.priority}`).join(", ")}).`
      : algo === "rr" || levelled ? ` ${quantumLeft === Infinity ? "FCFS queue: no time limit." : `${plural(quantumLeft, "unit")} of its slice left.`}` : "";
    frames.push(frame(t, running, waiting, done, procs, notes.splice(0), lineFor(spec, events), vars(), queues, keepWhy));
    events = new Set(); pickVars = {};
    const last = timeline.at(-1);
    if (last && last.id === running.id && last.end === t) last.end = t + 1;
    else timeline.push({ id: running.id, start: t, end: t + 1 });
    running.remaining--;
    quantumLeft--;
    lastRan = running.id;
    t++;
    admit(t);

    if (running.remaining === 0) {
      running.finish = t;
      done.push(running.id);
      events.add("finish");
      notes.push(`${running.id} finishes at t=${t}: CT = ${t}, TAT = ${t} − ${running.arrival} = ${t - running.arrival}, WT = ${t - running.arrival} − ${running.burst} = ${t - running.arrival - running.burst}.`);
      running = null;
    } else if (algo === "rr" && quantumLeft === 0) {
      events.add("quantum");
      notes.push(queues[0].length ? `${running.id}'s quantum is used up with ${running.remaining} left, so it goes to the back of the queue (behind anyone who just arrived). That's what stops one long job hogging the CPU.` : `${running.id}'s quantum is used up, but nobody else is waiting, so it simply carries on.`);
      queues[0].push(running);
      running = null;
    } else if (levelled && quantumLeft === 0) {
      events.add("quantum");
      const from = running.level;
      if (algo === "mlfq" && from < 2) running.level = from + 1;
      notes.push(algo === "mlfq"
        ? `${running.id} used its whole ${slices[from]}-unit slice in Q${from} without finishing, so it looks CPU-bound and is demoted to Q${running.level}. Short, interactive jobs stay on top; long ones sink.`
        : `${running.id}'s slice in Q${from} is used up, so it goes to the back of the same queue (in a multilevel queue, a process never changes queue).`);
      queues[running.level].push(running);
      running = null;
    }
  }
  frames.push(frame(t, null, allReady(), done, procs, [...notes.splice(0), "All processes have finished."], lineFor(spec, new Set([...events, "done"])), vars(), queues));

  function vars() {
    const v = { t };
    v.running = running?.id ?? "idle";
    if (running) v[`rem[${running.id}]`] = running.remaining;
    if (spec.usesQuantum && running) v.slice = quantumLeft === Infinity || (levelled && slices[running.level] === Infinity) ? "∞ (FCFS)" : quantumLeft;
    if (levelled && running) v.level = `Q${running.level}`;
    Object.assign(v, pickVars);
    v.ready = allReady().map((p) => p.id);
    v.finished = done.length;
    v.switches = switches;
    return v;
  }

  const results = procs.map((p) => {
    const tat = p.finish - p.arrival, wt = tat - p.burst;
    return { id: p.id, arrival: p.arrival, burst: p.burst, priority: p.priority, ct: p.finish, tat, wt, rt: p.start - p.arrival };
  });
  const avg = (k) => results.reduce((s, r) => s + r[k], 0) / results.length;
  const busy = results.reduce((s, r) => s + r.burst, 0);
  const firstArrival = Math.min(...procs.map((p) => p.arrival));
  return {
    algo,
    timeline,
    frames,
    results,
    averages: { tat: avg("tat"), wt: avg("wt"), rt: avg("rt"), ct: avg("ct") },
    makespan: t,
    utilisation: busy / (t - firstArrival),
    throughput: procs.length / (t - firstArrival),
    contextSwitches: switches,
    preemptions,
    levels: levelNames,
  };
}

function lineFor(spec, events) {
  const order = ["finish", "quantum", "arrive", "idle", "preempt", "pick", "run", "done"];
  const lines = order.filter((e) => events.has(e) && spec.at[e] != null).flatMap((e) => [spec.at[e]].flat());
  return [...new Set(lines)];
}

function frame(t, running, ready, done, procs, notes, line, vars, queues, keepWhy = "") {
  return {
    t,
    running: running?.id ?? null,
    ready: ready.map((p) => p.id),
    queues: queues.map((q) => q.map((p) => p.id)),
    level: Object.fromEntries(procs.map((p) => [p.id, p.level])),
    done: [...done],
    remaining: Object.fromEntries(procs.map((p) => [p.id, p.remaining])),
    notes,
    note: notes.length ? notes.join(" ") : running ? `${running.id} keeps the CPU: ${running.remaining} unit${running.remaining === 1 ? "" : "s"} left.${keepWhy}` : "Waiting.",
    line,
    vars,
  };
}

export function randomProcesses(r = Math.random, count = 4 + Math.floor(r() * 2)) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: `P${i + 1}`, arrival: i === 0 ? 0 : Math.floor(r() * 8), burst: 1 + Math.floor(r() * 7), priority: 1 + Math.floor(r() * 5) });
  }
  return out;
}

// Silberschatz-style examples to load in the view.
export const EXAMPLES = {
  book: { name: "Textbook (SRTF example)", processes: [{ id: "P1", arrival: 0, burst: 8, priority: 3 }, { id: "P2", arrival: 1, burst: 4, priority: 1 }, { id: "P3", arrival: 2, burst: 9, priority: 4 }, { id: "P4", arrival: 3, burst: 5, priority: 2 }] },
  convoy: { name: "Convoy effect (FCFS)", processes: [{ id: "P1", arrival: 0, burst: 24, priority: 1 }, { id: "P2", arrival: 0, burst: 3, priority: 1 }, { id: "P3", arrival: 0, burst: 3, priority: 1 }] },
  hrrn: { name: "HRRN (Stallings)", processes: [{ id: "A", arrival: 0, burst: 3, priority: 1 }, { id: "B", arrival: 2, burst: 6, priority: 1 }, { id: "C", arrival: 4, burst: 4, priority: 1 }, { id: "D", arrival: 6, burst: 5, priority: 1 }, { id: "E", arrival: 8, burst: 2, priority: 1 }] },
  mlq: { name: "Multilevel queue: system vs batch", processes: [{ id: "P1", arrival: 0, burst: 6, priority: 2 }, { id: "P2", arrival: 1, burst: 3, priority: 1 }, { id: "P3", arrival: 2, burst: 4, priority: 2 }, { id: "P4", arrival: 4, burst: 2, priority: 1 }] },
  mlfq: { name: "MLFQ: short jobs stay on top", processes: [{ id: "P1", arrival: 0, burst: 9, priority: 1 }, { id: "P2", arrival: 1, burst: 2, priority: 1 }, { id: "P3", arrival: 2, burst: 5, priority: 1 }, { id: "P4", arrival: 6, burst: 1, priority: 1 }] },
};
