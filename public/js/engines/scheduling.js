// CPU scheduling simulator. Time advances one unit at a time so every algorithm
// shares one loop and every tick can become a step in the visualisation.
//
// Conventions (stated in the UI, since textbooks differ):
// - Ties are broken by arrival time, then by process order in the table.
// - Preemptive algorithms only preempt for a strictly better candidate.
// - Round Robin: a process that arrives at the same moment another one's quantum
//   expires joins the ready queue first; the preempted process goes behind it.
// - Priority: a lower number means higher priority, unless told otherwise.

export const ALGORITHMS = {
  fcfs: { name: "First Come First Serve (FCFS)", preemptive: false },
  sjf: { name: "Shortest Job First (SJF)", preemptive: false },
  srtf: { name: "Shortest Remaining Time First (SRTF)", preemptive: true },
  priority: { name: "Priority (non-preemptive)", preemptive: false, usesPriority: true },
  "priority-p": { name: "Priority (preemptive)", preemptive: true, usesPriority: true },
  rr: { name: "Round Robin (RR)", preemptive: true, usesQuantum: true },
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

export function schedule(processes, algo, { quantum = 2, lowerIsHigher = true } = {}) {
  const spec = ALGORITHMS[algo];
  if (!spec) throw new Error(`Unknown algorithm ${algo}`);
  const error = validate(processes);
  if (error) throw new Error(error);
  if (spec.usesQuantum && !(Number.isInteger(quantum) && quantum >= 1 && quantum <= 20)) throw new Error("Time quantum must be a whole number from 1 to 20.");

  const procs = processes.map((p, index) => ({ ...p, index, priority: p.priority ?? 0, remaining: p.burst, start: null, finish: null }));
  const prio = (p) => (lowerIsHigher ? p.priority : -p.priority);
  const tieBreak = (a, b) => a.arrival - b.arrival || a.index - b.index;
  const better = {
    sjf: (a, b) => a.burst - b.burst || tieBreak(a, b),
    srtf: (a, b) => a.remaining - b.remaining || tieBreak(a, b),
    priority: (a, b) => prio(a) - prio(b) || tieBreak(a, b),
    "priority-p": (a, b) => prio(a) - prio(b) || tieBreak(a, b),
  }[algo];

  let t = 0, running = null, quantumLeft = 0;
  const ready = [], timeline = [], frames = [];
  const arrived = new Set(), done = [];
  const notes = [];

  const admit = (time) => {
    for (const p of procs.filter((x) => x.arrival === time && !arrived.has(x.id)).sort(tieBreak)) {
      arrived.add(p.id);
      ready.push(p);
      notes.push(`${p.id} arrives and joins the ready queue.`);
    }
  };
  const take = (p) => ready.splice(ready.indexOf(p), 1);
  const pickBest = () => [...ready].sort(better)[0];

  admit(0);
  while (done.length < procs.length) {
    // Choose who runs during [t, t+1).
    if (algo === "fcfs") {
      if (!running && ready.length) { running = ready.shift(); notes.push(`${running.id} is first in the queue, so it gets the CPU.`); }
    } else if (algo === "rr") {
      if (!running && ready.length) {
        running = ready.shift();
        quantumLeft = quantum;
        notes.push(`${running.id} takes the CPU for up to ${quantum} unit${quantum === 1 ? "" : "s"}.`);
      }
    } else if (!spec.preemptive) {
      if (!running && ready.length) {
        running = pickBest();
        take(running);
        notes.push(algo === "sjf"
          ? `${running.id} has the shortest burst (${running.burst}) among waiting processes.`
          : `${running.id} has the highest priority (${running.priority}) among waiting processes.`);
      }
    } else {
      const candidate = ready.length ? pickBest() : null;
      if (candidate && (!running || better(candidate, running) < 0 && (algo === "srtf" ? candidate.remaining < running.remaining : prio(candidate) < prio(running)))) {
        if (running) {
          notes.push(algo === "srtf"
            ? `${candidate.id} preempts ${running.id}: ${candidate.remaining} remaining < ${running.remaining}.`
            : `${candidate.id} preempts ${running.id}: priority ${candidate.priority} beats ${running.priority}.`);
          ready.push(running);
        } else {
          notes.push(algo === "srtf"
            ? `${candidate.id} has the shortest remaining time (${candidate.remaining}).`
            : `${candidate.id} has the highest priority (${candidate.priority}).`);
        }
        take(candidate);
        running = candidate;
      }
    }

    if (!running) {
      // CPU idles until the next arrival.
      const next = Math.min(...procs.filter((p) => !arrived.has(p.id)).map((p) => p.arrival));
      notes.push(`Nothing is ready, so the CPU is idle until t=${next}.`);
      frames.push(frame(t, null, ready, done, procs, notes.splice(0)));
      timeline.push({ id: null, start: t, end: next });
      t = next;
      admit(t);
      continue;
    }

    if (running.start === null) running.start = t;
    frames.push(frame(t, running, ready, done, procs, notes.splice(0)));
    const last = timeline.at(-1);
    if (last && last.id === running.id && last.end === t) last.end = t + 1;
    else timeline.push({ id: running.id, start: t, end: t + 1 });
    running.remaining--;
    quantumLeft--;
    t++;
    admit(t);

    if (running.remaining === 0) {
      running.finish = t;
      done.push(running.id);
      notes.push(`${running.id} finishes at t=${t}.`);
      running = null;
    } else if (algo === "rr" && quantumLeft === 0) {
      notes.push(ready.length ? `${running.id}'s quantum is used up; it goes to the back of the queue.` : `${running.id}'s quantum is used up, but nobody else is waiting, so it continues.`);
      ready.push(running);
      running = null;
    }
  }
  frames.push(frame(t, null, ready, done, procs, [...notes.splice(0), "All processes have finished."]));

  const results = procs.map((p) => {
    const tat = p.finish - p.arrival, wt = tat - p.burst;
    return { id: p.id, arrival: p.arrival, burst: p.burst, priority: p.priority, ct: p.finish, tat, wt, rt: p.start - p.arrival };
  });
  const avg = (k) => results.reduce((s, r) => s + r[k], 0) / results.length;
  const busy = results.reduce((s, r) => s + r.burst, 0);
  const firstArrival = Math.min(...procs.map((p) => p.arrival));
  return {
    timeline,
    frames,
    results,
    averages: { tat: avg("tat"), wt: avg("wt"), rt: avg("rt"), ct: avg("ct") },
    makespan: t,
    utilisation: busy / (t - firstArrival),
    throughput: procs.length / (t - firstArrival),
  };
}

function frame(t, running, ready, done, procs, notes) {
  return {
    t,
    running: running?.id ?? null,
    ready: ready.map((p) => p.id),
    done: [...done],
    remaining: Object.fromEntries(procs.map((p) => [p.id, p.remaining])),
    notes,
  };
}

export function randomProcesses(r = Math.random, count = 4 + Math.floor(r() * 2)) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: `P${i + 1}`, arrival: i === 0 ? 0 : Math.floor(r() * 8), burst: 1 + Math.floor(r() * 7), priority: 1 + Math.floor(r() * 5) });
  }
  return out;
}
