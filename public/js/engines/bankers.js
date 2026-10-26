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
  steps.push({ work: [...work], finish: [...finish], checking: null, note: `Start: Work = Available = ${vec(work)}.` });

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
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: true,
          note: `P${i}: Need ${vec(needs[i])} ≤ Work ${vec(before)}, so P${i} can finish and release ${vec(allocation[i])}. Work = ${vec(work)}.` });
      } else {
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: false,
          note: `P${i}: Need ${vec(needs[i])} is not ≤ Work ${vec(work)}, so P${i} has to wait.` });
      }
    }
  }
  const safe = sequence.length === n;
  steps.push({ work: [...work], finish: [...finish], checking: null,
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
