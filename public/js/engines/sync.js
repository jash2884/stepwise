// A tiny semaphore machine. Each process runs a program of operations in a loop;
// the student chooses which process takes the next step, so races and
// deadlocks happen in front of them.
//
// Semantics (Silberschatz-style counting semaphores):
//   wait(S):   S = S - 1; if S < 0 the process blocks on S's queue.
//   signal(S): S = S + 1; if S ≤ 0 the first blocked process is woken.

const clone = (x) => structuredClone(x);

// What wait and signal do inside, so the view can highlight the line that ran.
export const SEM_CODE = [
  "wait(S):",
  "  S.value ← S.value − 1",
  "  if S.value < 0 then",
  "    add this process to S.queue; block()  // sleeps: no busy waiting",
  "signal(S):",
  "  S.value ← S.value + 1",
  "  if S.value ≤ 0 then  // someone is still waiting",
  "    remove P from the front of S.queue; wakeup(P)",
];

export function initial(preset) {
  return {
    procs: preset.procs.map((p) => ({ id: p.id, role: p.role ?? null, program: p.program, pc: 0, status: "ready", reg: 0, rounds: 0, blockedOn: null })),
    sems: Object.fromEntries(Object.entries(preset.sems).map(([k, v]) => [k, { value: v, queue: [] }])),
    vars: { ...(preset.vars ?? {}) },
    buffer: [],
    bufferSize: preset.bufferSize ?? null,
    regions: Object.fromEntries(Object.keys(preset.regions ?? {}).map((k) => [k, []])),
    rules: preset.regions ?? {},
    produced: 0,
    increments: 0,
    time: 0,
    violation: null,
    deadlock: false,
  };
}

export const label = (op) => {
  const cond = op.if ? ` if ${op.if.v} == ${op.if.eq}` : "";
  switch (op.op) {
    case "wait": return `wait(${op.s})${cond}`;
    case "signal": return `signal(${op.s})${cond}`;
    case "enter": return op.text ?? `enter ${op.region}`;
    case "exit": return op.text ?? `leave ${op.region}`;
    case "inc": return `${op.v}++`;
    case "dec": return `${op.v}--`;
    case "put": return "put item in buffer";
    case "take": return "take item from buffer";
    case "load": return `reg = ${op.v}`;
    case "add": return "reg = reg + 1";
    case "store": return `${op.v} = reg`;
    default: return op.text ?? op.op;
  }
};

export function canRun(state, i) {
  return state.procs[i].status === "ready" && !state.deadlock;
}

export function step(prev, i) {
  const s = clone(prev);
  const p = s.procs[i];
  if (p.status !== "ready") throw new Error(`${p.id} is blocked and can't run.`);
  const op = p.program[p.pc];
  s.time++;
  let note, line = [];
  const advance = () => {
    p.pc++;
    if (p.pc === p.program.length) { p.pc = 0; p.rounds++; }
  };

  if (op.if && s.vars[op.if.v] !== op.if.eq) {
    note = `${p.id}: ${op.if.v} is ${s.vars[op.if.v]}, not ${op.if.eq}, so it skips ${label({ ...op, if: undefined })}.`;
    advance();
    return finish(s, note, line);
  }

  switch (op.op) {
    case "wait": {
      const sem = s.sems[op.s];
      sem.value--;
      advance();
      line = sem.value < 0 ? [1, 2, 3, 4] : [1, 2, 3];
      if (sem.value < 0) {
        p.status = "blocked";
        p.blockedOn = op.s;
        sem.queue.push(p.id);
        note = `${p.id}: wait(${op.s}) → ${op.s} = ${sem.value} (< 0), so ${p.id} BLOCKS and joins ${op.s}'s queue. A negative value means ${-sem.value} process${sem.value === -1 ? " is" : "es are"} waiting on ${op.s}; it can't continue until someone signals.`;
      } else {
        note = `${p.id}: wait(${op.s}) → ${op.s} = ${sem.value}, still ≥ 0, so there was a unit free and ${p.id} continues.`;
      }
      break;
    }
    case "signal": {
      const sem = s.sems[op.s];
      sem.value++;
      advance();
      line = sem.value <= 0 && sem.queue.length ? [5, 6, 7, 8] : [5, 6, 7];
      if (sem.value <= 0 && sem.queue.length) {
        const next = sem.queue.shift();
        const woken = s.procs.find((x) => x.id === next);
        woken.status = "ready";
        woken.blockedOn = null;
        note = `${p.id}: signal(${op.s}) → ${op.s} = ${sem.value} (≤ 0), which means someone was waiting, so it wakes ${woken.id}, the process that has waited longest.`;
      } else {
        note = `${p.id}: signal(${op.s}) → ${op.s} = ${sem.value}. Nobody was waiting, so the unit is simply banked for the next wait.`;
      }
      break;
    }
    case "enter": {
      const occupants = s.regions[op.region];
      occupants.push(p.id);
      const rule = s.rules[op.region];
      const roles = occupants.map((id) => s.procs.find((x) => x.id === id).role);
      if (rule.max && occupants.length > rule.max) s.violation = `Mutual exclusion broken: ${occupants.join(" and ")} are in the ${op.region} at the same time.`;
      if (rule.readersWriters && occupants.length > 1 && roles.includes("writer")) s.violation = `A writer shares the database with ${occupants.filter((x) => x !== p.id).join(", ")}: the data can be corrupted.`;
      note = `${p.id}: ${label(op)}.${s.violation ? " ⚠️" : ""}`;
      advance();
      break;
    }
    case "exit": {
      const occupants = s.regions[op.region];
      occupants.splice(occupants.indexOf(p.id), 1);
      note = `${p.id}: ${label(op)}.`;
      advance();
      break;
    }
    case "inc": case "dec": {
      s.vars[op.v] += op.op === "inc" ? 1 : -1;
      note = `${p.id}: ${op.v} becomes ${s.vars[op.v]}.`;
      advance();
      break;
    }
    case "put": {
      if (s.bufferSize && s.buffer.length >= s.bufferSize) s.violation = `${p.id} wrote into a full buffer: an item was overwritten.`;
      else s.buffer.push(`${p.id}#${++s.produced}`);
      note = `${p.id}: puts an item in the buffer (${s.buffer.length}/${s.bufferSize}).`;
      advance();
      break;
    }
    case "take": {
      if (!s.buffer.length) { s.violation = `${p.id} took from an empty buffer: it read garbage.`; note = `${p.id}: takes from an EMPTY buffer.`; }
      else note = `${p.id}: takes ${s.buffer.shift()} from the buffer (${s.buffer.length}/${s.bufferSize}).`;
      advance();
      break;
    }
    case "load": p.reg = s.vars[op.v]; note = `${p.id}: reads ${op.v} = ${p.reg} into its register.`; advance(); break;
    case "add": p.reg++; note = `${p.id}: register becomes ${p.reg} (${op.v ?? "x"} itself is still ${s.vars.x}).`; advance(); break;
    case "store": {
      s.vars[op.v] = p.reg;
      s.increments++;
      note = `${p.id}: writes ${p.reg} back to ${op.v}.`;
      if (s.vars[op.v] !== s.increments) s.violation = `Lost update: ${s.increments} increments ran but ${op.v} = ${s.vars[op.v]}. Another process's write was overwritten.`;
      advance();
      break;
    }
    default:
      note = `${p.id}: ${label(op)}.`;
      advance();
  }
  return finish(s, note, line);
}

function finish(s, note, line = []) {
  if (s.procs.every((p) => p.status === "blocked")) {
    s.deadlock = true;
    note += ` Every process is now blocked: DEADLOCK. ${s.procs.map((p) => `${p.id} waits on ${p.blockedOn}`).join(", ")}.`;
  }
  return { state: s, note, line };
}

const w = (s, extra) => ({ op: "wait", s, ...extra });
const sig = (s, extra) => ({ op: "signal", s, ...extra });

const producer = (mutex = true) => [{ op: "note", text: "produce an item" }, w("empty"), ...(mutex ? [w("mutex")] : []), { op: "enter", region: "buffer", text: "enter buffer" }, { op: "put" }, { op: "exit", region: "buffer", text: "leave buffer" }, ...(mutex ? [sig("mutex")] : []), sig("full")];
const consumer = (mutex = true, swapped = false) => [
  ...(swapped ? [w("mutex"), w("full")] : [w("full"), ...(mutex ? [w("mutex")] : [])]),
  { op: "enter", region: "buffer", text: "enter buffer" }, { op: "take" }, { op: "exit", region: "buffer", text: "leave buffer" },
  ...(mutex ? [sig("mutex")] : []), sig("empty"), { op: "note", text: "consume the item" }];

const reader = [w("mutex"), { op: "inc", v: "readcount" }, w("wrt", { if: { v: "readcount", eq: 1 } }), sig("mutex"),
  { op: "enter", region: "database", text: "start reading" }, { op: "exit", region: "database", text: "finish reading" },
  w("mutex"), { op: "dec", v: "readcount" }, sig("wrt", { if: { v: "readcount", eq: 0 } }), sig("mutex")];
const writer = [w("wrt"), { op: "enter", region: "database", text: "start writing" }, { op: "exit", region: "database", text: "finish writing" }, sig("wrt")];

const philosopher = (i, n, asymmetric) => {
  const left = `c${i}`, right = `c${(i + 1) % n}`;
  const [first, second] = asymmetric && i === n - 1 ? [right, left] : [left, right];
  return [{ op: "note", text: "think" }, w(first), w(second), { op: "note", text: "eat 🍝" }, sig(first), sig(second)];
};

const incrementer = (mutex) => [...(mutex ? [w("m")] : []), { op: "load", v: "x" }, { op: "add", v: "x" }, { op: "store", v: "x" }, ...(mutex ? [sig("m")] : [])];

export const PRESETS = {
  "producer-consumer": {
    name: "Producer–consumer (bounded buffer)",
    variants: {
      correct: { name: "Correct", procs: [{ id: "P1", program: producer() }, { id: "P2", program: producer() }, { id: "C1", program: consumer() }], sems: { mutex: 1, empty: 3, full: 0 }, bufferSize: 3, regions: { buffer: { max: 1 } } },
      nomutex: { name: "Bug: no mutex", procs: [{ id: "P1", program: producer(false) }, { id: "P2", program: producer(false) }, { id: "C1", program: consumer(false) }], sems: { empty: 3, full: 0 }, bufferSize: 3, regions: { buffer: { max: 1 } } },
      swapped: { name: "Bug: consumer locks mutex before full", procs: [{ id: "P1", program: producer() }, { id: "C1", program: consumer(true, true) }], sems: { mutex: 1, empty: 3, full: 0 }, bufferSize: 3, regions: { buffer: { max: 1 } } },
    },
    hint: "empty counts free slots, full counts items, mutex guards the buffer itself.",
  },
  "readers-writers": {
    name: "Readers–writers (readers first)",
    variants: {
      correct: { name: "Correct", procs: [{ id: "R1", role: "reader", program: reader }, { id: "R2", role: "reader", program: reader }, { id: "W1", role: "writer", program: writer }], sems: { mutex: 1, wrt: 1 }, vars: { readcount: 0 }, regions: { database: { readersWriters: true } } },
    },
    hint: "The first reader in locks writers out; the last reader out lets them back in. Writers can starve.",
  },
  philosophers: {
    name: "Dining philosophers",
    variants: {
      naive: { name: "Naive (can deadlock)", procs: Array.from({ length: 5 }, (_, i) => ({ id: `Ph${i}`, program: philosopher(i, 5, false) })), sems: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, 1])) },
      asymmetric: { name: "Fix: last philosopher picks right first", procs: Array.from({ length: 5 }, (_, i) => ({ id: `Ph${i}`, program: philosopher(i, 5, true) })), sems: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, 1])) },
    },
    hint: "Try letting every philosopher pick up their left chopstick first.",
  },
  race: {
    name: "Race condition (counter)",
    variants: {
      unsafe: { name: "No lock", procs: [{ id: "T1", program: incrementer(false) }, { id: "T2", program: incrementer(false) }], sems: {}, vars: { x: 0 } },
      safe: { name: "With a mutex", procs: [{ id: "T1", program: incrementer(true) }, { id: "T2", program: incrementer(true) }], sems: { m: 1 }, vars: { x: 0 } },
    },
    hint: "Let T1 read x, then let T2 read x before T1 writes it back.",
  },
};

// Practice: a sequence of wait/signal calls on two semaphores.
export function randomSequence(r = Math.random) {
  const sems = { S: 1 + Math.floor(r() * 2), T: Math.floor(r() * 2) };
  const procs = ["P1", "P2", "P3"];
  const values = { ...sems }, queues = { S: [], T: [] }, blocked = new Set();
  const ops = [];
  for (let k = 0; k < 6 + Math.floor(r() * 3); k++) {
    const ready = procs.filter((p) => !blocked.has(p));
    if (!ready.length) break;
    const p = ready[Math.floor(r() * ready.length)];
    const s = r() < 0.5 ? "S" : "T";
    const kind = r() < 0.55 ? "wait" : "signal";
    ops.push({ p, kind, s });
    if (kind === "wait") { values[s]--; if (values[s] < 0) { blocked.add(p); queues[s].push(p); } }
    else { values[s]++; if (values[s] <= 0 && queues[s].length) blocked.delete(queues[s].shift()); }
  }
  return { initial: sems, ops, final: values, blocked: procs.filter((p) => blocked.has(p)) };
}

// Dining philosophers as a table: who holds which fork, who waits for which,
// and whether the waits form a cycle. Semaphores don't record their holders,
// so this reads it off each philosopher's program counter:
//   [think, wait(first), wait(second), eat, signal(first), signal(second)].
// A wait that blocked has already advanced pc, so it holds nothing new yet.
export function diningState(state) {
  const n = state.procs.length;
  const forkNo = (name) => Number(String(name).slice(1));
  const forks = Array.from({ length: n }, () => ({ holder: null }));
  const phils = state.procs.map((p, i) => {
    const first = forkNo(p.program[1].s), second = forkNo(p.program[2].s);
    const blocked = p.status === "blocked";
    const holdsFirst = (p.pc === 2 && !blocked) || p.pc === 3 || p.pc === 4;
    const holdsSecond = (p.pc === 3 && !blocked) || p.pc === 4 || p.pc === 5;
    const holds = [...(holdsFirst ? [first] : []), ...(holdsSecond ? [second] : [])];
    for (const f of holds) forks[f].holder = i;
    // The fork it is stuck on, or about to reach for next.
    const wants = blocked ? forkNo(p.blockedOn) : p.pc === 1 ? first : p.pc === 2 ? second : null;
    const phase = holds.length === 2 ? "eating" : p.pc === 5 ? "done" : blocked || holds.length || p.pc === 1 ? "hungry" : "thinking";
    return { id: p.id, first, second, holds, wants, blocked, phase };
  });
  // Circular wait: everyone holds exactly one fork and wants the one their
  // neighbour holds. Nobody can ever finish, even before the last one blocks.
  const circular = n > 1 && phils.every((p) => p.holds.length === 1 && p.wants != null && forks[p.wants].holder != null && forks[p.wants].holder !== phils.indexOf(p));
  return { phils, forks, circular, deadlock: state.deadlock };
}
