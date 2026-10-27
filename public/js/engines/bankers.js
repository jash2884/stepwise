// Banker's algorithm: Need matrix, safety check and resource requests.
//
// Convention for the safety check: scan P0..Pn-1 in order, letting any process
// that fits finish (and release its resources), and repeat full passes until a
// pass finishes nobody. Other valid safe sequences may exist; practice mode
// accepts any of them.

const leq = (a, b) => a.every((x, j) => x <= b[j]);
const add = (a, b) => a.map((x, j) => x + b[j]);
const sub = (a, b) => a.map((x, j) => x - b[j]);
export const vec = (v) => `(${v.join(", ")})`;

export const SAFETY_CODE = [
  "Work ← Available; Finish[i] ← false for every i",
  "repeat until a full pass finishes nobody",
  "  for i ← 0 … n−1",
  "    if not Finish[i] and Need[i] ≤ Work then",
  "      Work ← Work + Allocation[i]  // Pi finishes and gives back all it holds",
  "      Finish[i] ← true; append Pi to the safe sequence",
  "    else Pi waits for now  // it may fit once others have released",
  "safe ⇔ Finish[i] is true for every i",
];

export const REQUEST_CODE = [
  "if Request > Need[i] then error  // more than Pi declared",
  "if Request > Available then Pi waits  // not enough free right now",
  "pretend: Available ← Available − Request",
  "  Allocation[i] ← Allocation[i] + Request; Need[i] ← Need[i] − Request",
  "if safety(pretend state) is safe then grant the request",
  "else roll back to the old state; Pi waits",
];

export function need(max, allocation) {
  return max.map((row, i) => sub(row, allocation[i]));
}

export function validate({ allocation, max, available }) {
  const n = allocation.length, m = available.length;
  if (!n || n > 10) return "Use between 1 and 10 processes.";
  if (!m || m > 6) return "Use between 1 and 6 resource types.";
  if (max.length !== n || [...allocation, ...max].some((r) => r.length !== m)) return "Every row needs one value per resource.";
  if ([...allocation.flat(), ...max.flat(), ...available].some((x) => !Number.isInteger(x) || x < 0 || x > 99)) return "Use whole numbers from 0 to 99.";
  const bad = allocation.findIndex((row, i) => !leq(row, max[i]));
  if (bad !== -1) return `P${bad} is allocated more than its maximum.`;
  return null;
}

export function safety({ allocation, max, available }) {
  const error = validate({ allocation, max, available });
  if (error) throw new Error(error);
  const needs = need(max, allocation);
  const n = allocation.length;
  let work = [...available];
  const finish = Array(n).fill(false), sequence = [], steps = [];
  const names = (list) => list.map((i) => `P${i}`);
  const vars = (i, extra = {}) => ({ i: i == null ? "–" : `P${i}`, ...(i == null ? {} : { "Need[i]": needs[i] }), Work: [...work], Finish: finish.map((f) => (f ? "T" : "F")), sequence: names(sequence), ...extra });
  steps.push({ work: [...work], finish: [...finish], checking: null, line: 1, vars: vars(null), note: `Start: Work = Available = ${vec(work)}, and no process has finished yet. We look for a process whose remaining Need can be met from Work.` });

  for (let progress = true; progress && sequence.length < n;) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      if (leq(needs[i], work)) {
        const before = work;
        work = add(work, allocation[i]);
        finish[i] = true;
        sequence.push(i);
        progress = true;
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: true, released: [...allocation[i]], line: [4, 5, 6], vars: vars(i, { "Allocation[i]": allocation[i] }),
          note: `P${i}: Need ${vec(needs[i])} ≤ Work ${vec(before)} in every resource, so even if P${i} asks for everything it might still need, the system can satisfy it. P${i} runs to completion and gives back its allocation ${vec(allocation[i])}, so Work grows to ${vec(work)}.` });
      } else {
        const short = needs[i].map((x, j) => (x > work[j] ? `${String.fromCharCode(65 + j)} (needs ${x}, only ${work[j]} free)` : null)).filter(Boolean);
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: false, line: [4, 7], vars: vars(i),
          note: `P${i}: Need ${vec(needs[i])} is not ≤ Work ${vec(work)}: it falls short in ${short.join(", ")}. P${i} can't be guaranteed to finish yet, so we skip it for now and try it again on a later pass.` });
      }
    }
  }
  const safe = sequence.length === n;
  steps.push({ work: [...work], finish: [...finish], checking: null, line: 8, vars: vars(null, { safe }),
    note: safe ? `Every process can finish: the state is SAFE. Safe sequence: ${sequence.map((i) => `P${i}`).join(" → ")}.`
      : `No waiting process fits in Work ${vec(work)}: the state is UNSAFE (possible deadlock).` });
  return { safe, sequence, steps, need: needs };
}

// A request is granted only if it's within the process's declared need, the
// resources are free right now, and pretending to grant it leaves a safe state.
export function request(state, pid, req) {
  const needs = need(state.max, state.allocation);
  if (!leq(req, needs[pid])) return { granted: false, reason: `Request ${vec(req)} exceeds P${pid}'s remaining need ${vec(needs[pid])}: error, it asked for more than it declared.` };
  if (!leq(req, state.available)) return { granted: false, reason: `Request ${vec(req)} exceeds Available ${vec(state.available)}: P${pid} must wait.` };
  const trial = {
    allocation: state.allocation.map((row, i) => (i === pid ? add(row, req) : [...row])),
    max: state.max,
    available: sub(state.available, req),
  };
  const check = safety(trial);
  return check.safe
    ? { granted: true, state: trial, check, reason: `Pretending to grant it leaves a safe state (${check.sequence.map((i) => `P${i}`).join(" → ")}), so the request is granted.` }
    : { granted: false, check, reason: "Granting it would leave an unsafe state, so P" + pid + " must wait even though the resources are free." };
}

export function isSafeSequence(state, order) {
  const needs = need(state.max, state.allocation);
  let work = [...state.available];
  const seen = new Set();
  for (const i of order) {
    if (seen.has(i) || i < 0 || i >= state.allocation.length || !leq(needs[i], work)) return false;
    seen.add(i);
    work = add(work, state.allocation[i]);
  }
  return seen.size === state.allocation.length;
}

export function randomState(r = Math.random, n = 5, m = 3) {
  const total = Array.from({ length: m }, () => 6 + Math.floor(r() * 6));
  const max = Array.from({ length: n }, () => total.map((t) => Math.floor(r() * (t * 0.7))));
  const allocation = max.map((row) => row.map((x) => Math.floor(r() * (x + 1))));
  const used = allocation.reduce((acc, row) => add(acc, row), Array(m).fill(0));
  const available = total.map((t, j) => Math.max(0, t - used[j]));
  return { allocation, max, available };
}

// The textbook state (Silberschatz ch. 8): safe with <P1, P3, P4, P2, P0>.
export const EXAMPLE = {
  allocation: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
  max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
  available: [3, 3, 2],
};

// A run of requests, one after another, each through the resource-request
// algorithm. Granted requests change the state; refused ones leave it alone
// (the process simply waits). Every check is a step, so the view can walk
// through the pseudocode for each request in turn.
export function parseRequests(text, m) {
  const out = [];
  for (const part of String(text).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const mm = /^P?(\d+)\s*[:=]?\s*\(?\s*([\d\s,]+?)\s*\)?$/i.exec(part);
    if (!mm) throw new Error(`Can't read "${part}". Write a request like P1 1 0 2.`);
    const req = mm[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (req.length !== m) throw new Error(`"${part}" needs ${m} numbers, one per resource.`);
    out.push({ pid: Number(mm[1]), req });
  }
  if (out.length > 12) throw new Error("Use at most 12 requests.");
  return out;
}

export function requestTimeline(initialState, requests) {
  let state = { allocation: initialState.allocation.map((r) => [...r]), max: initialState.max.map((r) => [...r]), available: [...initialState.available] };
  const error = validate(state);
  if (error) throw new Error(error);
  const steps = [], outcomes = [];
  requests.forEach(({ pid, req }, k) => {
    const tag = `Request ${k + 1}: P${pid} asks for ${vec(req)}.`;
    if (pid < 0 || pid >= state.allocation.length) throw new Error(`There is no P${pid}.`);
    const needs = need(state.max, state.allocation);
    const base = { k, pid, req, state, need: needs };
    const vars = (extra) => ({ request: `P${pid} ${vec(req)}`, "Need[i]": needs[pid], Available: state.available, ...extra });
    if (!leq(req, needs[pid])) {
      steps.push({ ...base, line: 1, outcome: "error", vars: vars({ result: "error" }), note: `${tag} That's more than its remaining Need ${vec(needs[pid])}, i.e. more than it declared at the start. This is an error: the request is refused outright.` });
      outcomes.push({ pid, req, outcome: "error" });
      return;
    }
    steps.push({ ...base, line: 1, vars: vars({}), note: `${tag} Check 1: is it within P${pid}'s remaining Need ${vec(needs[pid])}? Yes, so it's a legal request.` });
    if (!leq(req, state.available)) {
      steps.push({ ...base, line: 2, outcome: "wait", vars: vars({ result: "wait" }), note: `${tag} Check 2: only ${vec(state.available)} is free, which isn't enough. P${pid} must wait until other processes release resources. The state doesn't change.` });
      outcomes.push({ pid, req, outcome: "wait" });
      return;
    }
    const r = request(state, pid, req);
    const trial = r.check ? { allocation: state.allocation.map((row, i) => (i === pid ? add(row, req) : [...row])), max: state.max, available: sub(state.available, req) } : state;
    steps.push({ ...base, state: trial, need: need(trial.max, trial.allocation), pretend: true, line: [2, 3, 4], vars: vars({ "Available'": trial.available, "Allocation'[i]": trial.allocation[pid] }),
      note: `${tag} Check 2: ${vec(req)} ≤ Available ${vec(state.available)}, so the resources are free. Now pretend to grant it: Available becomes ${vec(trial.available)} and P${pid}'s Need drops to ${vec(sub(needs[pid], req))}. Is that state still safe?` });
    if (r.granted) {
      steps.push({ ...base, state: r.state, need: need(r.state.max, r.state.allocation), line: 5, outcome: "granted", vars: vars({ result: "granted", sequence: r.check.sequence.map((i) => `P${i}`) }),
        note: `${tag} The safety check finds a safe sequence (${r.check.sequence.map((i) => `P${i}`).join(" → ")}) in the pretend state, so every process can still finish. The request is GRANTED and the pretend state becomes real.` });
      state = r.state;
      outcomes.push({ pid, req, outcome: "granted", sequence: r.check.sequence });
    } else {
      steps.push({ ...base, line: 6, outcome: "unsafe", vars: vars({ result: "unsafe → wait" }),
        note: `${tag} In the pretend state the safety check gets stuck: no order lets every process finish, so granting could lead to deadlock. Roll back: P${pid} must WAIT, even though the resources are free right now.` });
      outcomes.push({ pid, req, outcome: "unsafe" });
    }
  });
  return { steps, outcomes, final: state };
}

export const EXAMPLE_REQUESTS = "P1 1 0 2; P4 3 3 0; P0 0 2 0";
