// Deadlock detection from a resource-allocation graph (RAG).
// A graph has processes, resources (with instance counts), request edges P → R
// and assignment edges R → P. We run both classic checks:
//  - the detection algorithm (works for any number of instances), and
//  - a cycle search in the wait-for graph (decisive when every resource has one instance).

export function parseGraph(resourcesText, edgesText) {
  const resources = new Map();
  for (const part of String(resourcesText).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(R\d{1,2})\s*(?:[:=x×]\s*(\d{1,2}))?$/i.exec(part);
    if (!m) throw new Error(`Can't read resource "${part}". Write it like R1:2 (R1 with 2 instances).`);
    resources.set(m[1].toUpperCase(), Number(m[2] ?? 1));
  }
  const edges = [];
  const processes = new Set();
  for (const line of String(edgesText).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^([PR]\d{1,2})\s*(?:->|→)\s*([PR]\d{1,2})$/i.exec(line);
    if (!m) throw new Error(`Can't read edge "${line}". Use P1 -> R1 (request) or R1 -> P2 (assignment).`);
    const [from, to] = [m[1].toUpperCase(), m[2].toUpperCase()];
    if (from[0] === to[0]) throw new Error(`"${line}" must connect a process and a resource.`);
    const r = from[0] === "R" ? from : to, p = from[0] === "P" ? from : to;
    if (!resources.has(r)) throw new Error(`${r} isn't in the resource list.`);
    processes.add(p);
    edges.push({ from, to, kind: from[0] === "P" ? "request" : "assign" });
  }
  if (!resources.size) throw new Error("List at least one resource, e.g. R1:1, R2:2.");
  if (resources.size > 8 || processes.size > 8) throw new Error("Use at most 8 processes and 8 resources.");
  const graph = { processes: [...processes].sort(byNumber), resources: [...resources.keys()].sort(byNumber), instances: Object.fromEntries(resources), edges };
  for (const r of graph.resources) {
    const held = edges.filter((e) => e.from === r).length;
    if (held > resources.get(r)) throw new Error(`${r} has ${resources.get(r)} instance${resources.get(r) === 1 ? "" : "s"} but ${held} assignment edges.`);
  }
  return graph;
}

const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1)) || (a < b ? -1 : 1);

export function matrices(graph) {
  const count = (from, to) => graph.edges.filter((e) => e.from === from && e.to === to).length;
  const allocation = graph.processes.map((p) => graph.resources.map((r) => count(r, p)));
  const request = graph.processes.map((p) => graph.resources.map((r) => count(p, r)));
  const available = graph.resources.map((r, j) => graph.instances[r] - allocation.reduce((s, row) => s + row[j], 0));
  return { allocation, request, available };
}

const leq = (a, b) => a.every((x, j) => x <= b[j]);
const vec = (v) => `(${v.join(", ")})`;

export const DETECT_CODE = [
  "Work ← Available",
  "Finish[i] ← (Allocation[i] = 0)  // holds nothing, so it can't be deadlocked",
  "repeat until a full pass finishes nobody",
  "  for each Pi with Finish[i] = false",
  "    if Request[i] ≤ Work then",
  "      Work ← Work + Allocation[i]; Finish[i] ← true  // Pi can finish and release",
  "    else Pi keeps waiting  // maybe someone else will release enough",
  "deadlocked ← every Pi with Finish[i] = false",
];

// The detection algorithm: like the Banker's safety check, but with current
// Requests instead of maximum Needs. Processes holding nothing can't deadlock.
export function detect(graph) {
  const { allocation, request, available } = matrices(graph);
  const n = graph.processes.length;
  let work = [...available];
  const finish = allocation.map((row) => row.every((x) => x === 0));
  const names = () => graph.processes.filter((_, i) => finish[i]);
  const vars = (i, extra = {}) => ({ Pi: i == null ? "–" : graph.processes[i], ...(i == null ? {} : { "Request[i]": request[i], "Allocation[i]": allocation[i] }), Work: [...work], finished: names(), ...extra });
  const steps = [{ work: [...work], finish: [...finish], line: [1, 2], vars: vars(null), note: `Work = Available = ${vec(work)}. ${finish.some(Boolean) ? `${graph.processes.filter((_, i) => finish[i]).join(", ")} hold${finish.filter(Boolean).length === 1 ? "s" : ""} nothing, so ${finish.filter(Boolean).length === 1 ? "it can't be" : "they can't be"} deadlocked.` : ""}`.trim() }];
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      if (leq(request[i], work)) {
        work = work.map((x, j) => x + allocation[i][j]);
        finish[i] = true;
        progress = true;
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: true, line: [5, 6], vars: vars(i),
          note: `${graph.processes[i]}: Request ${vec(request[i])} ≤ Work ${vec(work.map((x, j) => x - allocation[i][j]))}, so everything it is waiting for is free. Optimistically assume it gets it, finishes, and releases what it holds, ${vec(allocation[i])}. Work = ${vec(work)}.` });
      } else {
        steps.push({ work: [...work], finish: [...finish], checking: i, fits: false, line: [5, 7], vars: vars(i),
          note: `${graph.processes[i]}: Request ${vec(request[i])} isn't ≤ Work ${vec(work)}: what it wants is held by processes that haven't finished. It waits; another pass may free enough.` });
      }
    }
  }
  const deadlocked = graph.processes.filter((_, i) => !finish[i]);
  steps.push({ work: [...work], finish: [...finish], line: 8, vars: vars(null, { deadlocked }), note: deadlocked.length ? `${deadlocked.join(", ")} can never finish: they are DEADLOCKED.` : "Every process can finish: no deadlock." });
  return { deadlocked, steps, allocation, request, available };
}

// Wait-for graph: Pi waits for Pj if Pi requests a resource Pj holds.
export function waitFor(graph) {
  const holders = (r) => graph.edges.filter((e) => e.from === r).map((e) => e.to);
  const edges = [];
  for (const e of graph.edges.filter((x) => x.kind === "request")) {
    for (const h of holders(e.to)) if (h !== e.from && !edges.some((x) => x.from === e.from && x.to === h)) edges.push({ from: e.from, to: h, via: e.to });
  }
  // DFS for a cycle.
  const adj = new Map(graph.processes.map((p) => [p, edges.filter((e) => e.from === p).map((e) => e.to)]));
  const state = new Map(), stack = [];
  let cycle = null;
  const dfs = (p) => {
    state.set(p, "open");
    stack.push(p);
    for (const q of adj.get(p)) {
      if (cycle) return;
      if (state.get(q) === "open") { cycle = [...stack.slice(stack.indexOf(q)), q]; return; }
      if (!state.has(q)) dfs(q);
    }
    stack.pop();
    state.set(p, "done");
  };
  for (const p of graph.processes) if (!state.has(p) && !cycle) dfs(p);
  const singleInstance = graph.resources.every((r) => graph.instances[r] === 1);
  return { edges, cycle, singleInstance };
}

export function analyse(graph) {
  const d = detect(graph), w = waitFor(graph);
  let verdict;
  if (w.cycle && d.deadlocked.length) verdict = `Deadlock: ${w.cycle.join(" → ")} is a cycle, and the detection algorithm confirms ${d.deadlocked.join(", ")} can never finish.`;
  else if (w.cycle) verdict = `There's a cycle (${w.cycle.join(" → ")}), but no deadlock: some resource has spare instances, so a process in the cycle can still finish. With multiple instances a cycle is necessary but not sufficient.`;
  else verdict = "No cycle, so no deadlock.";
  return { ...d, waitFor: w, verdict };
}

export const EXAMPLES = {
  deadlock: { name: "Two processes, crossed requests", resources: "R1:1, R2:1", edges: "R1 -> P1\nP1 -> R2\nR2 -> P2\nP2 -> R1" },
  cycleNoDeadlock: { name: "Cycle without deadlock (2 instances)", resources: "R1:2, R2:2", edges: "R1 -> P1\nR1 -> P3\nP1 -> R2\nR2 -> P2\nR2 -> P4\nP2 -> R1" },
  book: { name: "Textbook: three processes in a cycle", resources: "R1:1, R2:2, R3:1, R4:3", edges: "R1 -> P2\nR2 -> P1\nR2 -> P2\nR3 -> P3\nP1 -> R1\nP2 -> R3\nP3 -> R2" },
  safe: { name: "Waiting, but no deadlock", resources: "R1:1, R2:1", edges: "R1 -> P1\nP2 -> R1\nR2 -> P2" },
};

export function randomGraph(r = Math.random) {
  const np = 3 + Math.floor(r() * 2), nr = 2 + Math.floor(r() * 2);
  const resources = Array.from({ length: nr }, (_, j) => `R${j + 1}:${r() < 0.7 ? 1 : 2}`).join(", ");
  const inst = resources.split(", ").map((s) => Number(s.split(":")[1]));
  const lines = [];
  const held = Array(nr).fill(0);
  for (let i = 1; i <= np; i++) {
    const j = Math.floor(r() * nr);
    if (held[j] < inst[j]) { lines.push(`R${j + 1} -> P${i}`); held[j]++; }
    const k = Math.floor(r() * nr);
    if (k !== j && r() < 0.8) lines.push(`P${i} -> R${k + 1}`);
  }
  return { resources, edges: lines.join("\n") };
}
