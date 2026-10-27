// Disk scheduling: the order the head visits cylinders and the total head movement.
// Every move names the pseudocode line it comes from and the variables after it.
//
// Conventions (stated in the UI):
// - SSTF ties go to the request that arrived first.
// - SCAN and C-SCAN travel all the way to the last cylinder; LOOK and C-LOOK
//   turn at the last request.
// - The return jump of C-SCAN / C-LOOK counts as head movement unless switched off.
// - N-step SCAN splits the queue, in arrival order, into batches of N and runs
//   SCAN on one batch at a time; requests in later batches wait their turn even
//   if the head passes over them.
// - F-SCAN keeps two queues. Requests can carry an arrival time ("98@12"; plain
//   "98" means time 0). The head moves 1 cylinder per time unit and serving a
//   request takes no extra time. At time 0 the active queue is every request
//   that has arrived; it is frozen and served with SCAN (exactly as one N-step
//   batch), while anything arriving meanwhile goes into the waiting queue, even
//   if the head passes over its cylinder. When the active queue empties the two
//   swap; a request arriving at that exact moment is included. If both are empty
//   the head waits, without moving, for the next arrival. Direction carries over
//   from one sweep to the next. Other algorithms ignore arrival times.

const START = "head ← start; total ← 0";
export const ALGORITHMS = {
  fcfs: { name: "FCFS", code: [START, "for each request r in arrival order", "  total ← total + |r − head|; head ← r"] },
  sstf: { name: "SSTF (shortest seek first)", code: [START, "while requests are pending", "  r ← the pending request closest to head  // ties: earliest arrival", "  total ← total + |r − head|; head ← r; remove r"] },
  scan: { name: "SCAN (elevator)", direction: true, code: [START, "serve the requests ahead, nearest first", "if requests remain behind then carry on to the end of the disk", "reverse direction", "serve the remaining requests, nearest first"] },
  cscan: { name: "C-SCAN", direction: true, circular: true, code: [START, "serve the requests ahead, nearest first", "if requests remain then carry on to the end of the disk", "jump to the other end  // nothing is served on the way back", "serve the rest, moving in the same direction as before"] },
  look: { name: "LOOK", direction: true, code: [START, "serve the requests ahead, nearest first", "reverse at the last request  // no trip to the edge", "serve the remaining requests, nearest first"] },
  clook: { name: "C-LOOK", direction: true, circular: true, code: [START, "serve the requests ahead, nearest first", "jump back to the furthest pending request at the other end", "serve the rest, moving in the same direction as before"] },
  nstep: { name: "N-step SCAN", direction: true, batch: true, code: [START, "split the queue into batches of N, in arrival order", "for each batch B", "  serve B's requests ahead, nearest first", "  if B has requests behind then go to the end and reverse", "  serve the rest of B  // later batches wait, even if the head passes them"] },
  fscan: { name: "F-SCAN", direction: true, batch: true, timed: true, code: ["head ← start; total ← 0; t ← 0  // the head moves 1 cylinder per time unit", "active ← requests arrived by t; waiting ← empty", "repeat until no requests remain", "  serve active's requests ahead, nearest first  // arrivals join waiting", "  if active has requests behind then go to the end and reverse", "  serve the rest of active  // waiting is frozen out, even if the head passes it", "  swap: active ← waiting; waiting ← empty  // idle until an arrival if both are empty"] },
};

// Requests are cylinders, each optionally followed by @time: "98@0 183@12 37".
export function parseArrivals(text) {
  const tokens = String(text).trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error("Enter the request queue, e.g. 98 183 37 122.");
  if (tokens.length > 30) throw new Error("Use at most 30 requests.");
  const requests = [], arrivals = [];
  for (const t of tokens) {
    const m = /^(-?\d*\.?\d+)(?:@(\d+))?$/.exec(t);
    if (!m) throw new Error(`Couldn't read "${t}". Write a cylinder, or cylinder@time for F-SCAN (e.g. 98@12).`);
    requests.push(Number(m[1]));
    arrivals.push(m[2] === undefined ? 0 : Number(m[2]));
  }
  if (arrivals.some((a) => a > 100000)) throw new Error("Arrival times must be whole numbers from 0 to 100000.");
  return { requests, arrivals };
}

export const parseRequests = (text) => parseArrivals(text).requests;

export const formatArrivals = (requests, arrivals = []) => requests.map((r, i) => (arrivals[i] ? `${r}@${arrivals[i]}` : String(r))).join(" ");

export function schedule(requests, head, algo, { cylinders = 200, direction = "up", countJump = true, n = 4, arrivals = [] } = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(cylinders) || cylinders < 2 || cylinders > 10000) throw new Error("Cylinders must be between 2 and 10000.");
  if (algo === "nstep" && !(Number.isInteger(n) && n >= 1 && n <= 30)) throw new Error("N must be a whole number from 1 to 30.");
  const max = cylinders - 1;
  for (const r of [head, ...requests]) if (!Number.isInteger(r) || r < 0 || r > max) throw new Error(`Cylinders must be whole numbers from 0 to ${max}.`);

  if (algo === "fscan") return fscan(requests, head, { max: cylinders - 1, direction, arrivals });
  const path = [head];
  const moves = [];
  const pending = [...requests];
  let pos = head, total = 0, dir = direction, batch = null;
  const move = (to, kind, note, line) => {
    const distance = kind === "jump" && !countJump ? 0 : Math.abs(to - pos);
    total += distance;
    if (kind === "serve" || kind === "jump" && algo === "clook") pending.splice(pending.indexOf(to), 1);
    const vars = { head: to, from: pos, distance, total, direction: dir === "up" ? "towards " + max : "towards 0", pending: [...pending] };
    if (batch) vars.batch = batch;
    moves.push({ from: pos, to, distance, kind, total, note, line, vars });
    path.push(to);
    pos = to;
  };
  const serve = (r, why, line) => move(r, "serve", `Move ${pos} → ${r} (${Math.abs(r - pos)} cylinders)${why ? `: ${why}` : ""}.`, line);
  const ahead = (list, up) => list.filter((r) => (up ? r >= pos : r <= pos)).sort((a, b) => (up ? a - b : b - a));
  const behind = (list, up) => list.filter((r) => (up ? r < pos : r > pos)).sort((a, b) => (up ? b - a : a - b));
  const nearest = (list, up) => `it's the nearest request ${up ? "above" : "below"} the head${list.length > 1 ? ` (the others ahead: ${list.slice(1).join(", ")})` : ""}`;

  if (algo === "fcfs") {
    requests.forEach((r, i) => serve(r, `request ${i + 1} in arrival order. FCFS never reorders, so it zig-zags`, 3));
  } else if (algo === "sstf") {
    const left = requests.map((r, i) => ({ r, i }));
    while (left.length) {
      const best = left.reduce((a, b) => (Math.abs(b.r - pos) < Math.abs(a.r - pos) ? b : a));
      const others = left.filter((x) => x !== best).map((x) => `${x.r} is ${Math.abs(x.r - pos)} away`);
      left.splice(left.indexOf(best), 1);
      serve(best.r, `${best.r} is only ${Math.abs(best.r - pos)} cylinders away, the closest pending request${others.length ? ` (${others.slice(0, 3).join(", ")}${others.length > 3 ? ", …" : ""})` : ""}`, [3, 4]);
    }
  } else if (algo === "nstep") {
    const batches = [];
    for (let i = 0; i < requests.length; i += n) batches.push(requests.slice(i, i + n));
    batches.forEach((b, k) => {
      batch = `${k + 1} of ${batches.length}: [${b.join(", ")}]`;
      const up = dir === "up";
      const a = ahead(b, up), be = behind(b, up);
      a.forEach((r, j) => serve(r, `batch ${k + 1} is being swept ${up ? "up" : "down"}; ${nearest(a.slice(j), up)}`, k === 0 && j === 0 ? [2, 3, 4] : j === 0 ? [3, 4] : 4));
      if (be.length) {
        const edge = up ? max : 0;
        if (pos !== edge) move(edge, "edge", `Batch ${k + 1} still has ${be.join(", ")} behind the head, so carry on to the end of the disk (${edge}) and reverse, as SCAN does.`, 5);
        dir = up ? "down" : "up";
        be.forEach((r) => serve(r, `the rest of batch ${k + 1}, now moving ${up ? "down" : "up"}`, 6));
      }
    });
  } else {
    const up = direction === "up";
    const A = ahead(requests, up), B = behind(requests, up);
    A.forEach((r, j) => serve(r, nearest(A.slice(j), up), 2));
    const edge = up ? max : 0, far = up ? 0 : max;
    if (algo === "scan") {
      if (B.length && pos !== edge) move(edge, "edge", `${B.join(", ")} ${B.length === 1 ? "is" : "are"} still waiting behind the head, but SCAN only reverses at the end of the disk, so it carries on to ${edge} first.`, 3);
      dir = up ? "down" : "up";
      B.forEach((r, j) => serve(r, `reversed, now sweeping ${up ? "down" : "up"}; ${nearest(B.slice(j), !up)}`, j === 0 ? [4, 5] : 5));
    } else if (algo === "look") {
      dir = up ? "down" : "up";
      B.forEach((r, j) => serve(r, `there's nothing further ${up ? "up" : "down"}, so LOOK reverses straight away instead of travelling to the edge; ${nearest(B.slice(j), !up)}`, j === 0 ? [3, 4] : 4));
    } else {
      const wrapped = [...B].reverse(); // continue in the same direction after the jump
      if (wrapped.length) {
        if (algo === "cscan") {
          if (pos !== edge) move(edge, "edge", `Carry on to the end of the disk (${edge}): C-SCAN always sweeps the full width in one direction.`, 3);
          move(far, "jump", `Jump back to cylinder ${far}${countJump ? "" : " (not counted)"} without serving anything. Serving in one direction only gives every cylinder a more even wait.`, 4);
        } else {
          move(wrapped[0], "jump", `Jump back to the furthest pending request at the other end (${wrapped[0]})${countJump ? "" : " (not counted)"}: C-LOOK only goes as far as there are requests, then starts the next one-way sweep.`, 3);
          moves.at(-1).served = true;
          wrapped.shift();
        }
        wrapped.forEach((r, j) => serve(r, `sweeping ${up ? "up" : "down"} again after the jump; ${nearest(wrapped.slice(j), up)}`, 5 - (algo === "clook" ? 1 : 0)));
      }
    }
  }
  const served = moves.filter((m) => m.kind === "serve" || m.served).map((m) => m.to);
  const initial = {
    line: 1,
    vars: { head, total: 0, direction: ALGORITHMS[algo].direction ? (direction === "up" ? `towards ${max}` : "towards 0") : "–", pending: [...requests], ...(algo === "nstep" ? { N: n } : {}) },
    note: `The head starts at cylinder ${head} with ${requests.length} requests waiting.${ALGORITHMS[algo].direction ? ` It is moving ${direction === "up" ? "towards higher cylinders" : "towards 0"}.` : ""}`,
  };
  return { path, moves, total, order: served, average: total / requests.length, initial };
}

// F-SCAN: two queues. The active one is frozen and swept with SCAN while new
// arrivals collect in the waiting one; when the active queue empties they swap.
function fscan(requests, head, { max, direction, arrivals }) {
  const at = requests.map((_, i) => arrivals[i] ?? 0);
  if (at.some((a) => !Number.isInteger(a) || a < 0)) throw new Error("Arrival times must be whole numbers from 0 upwards.");
  const reqs = requests.map((c, i) => ({ id: i, c, at: at[i] }));
  const label = (q) => `${q.c}@${q.at}`;
  const served = new Set();
  let pos = head, t = 0, total = 0, dir = direction, active = [], sweep = 0;
  const moves = [], path = [head];
  const arrived = () => reqs.filter((q) => q.at <= t && !served.has(q.id));
  const waiting = () => arrived().filter((q) => !active.includes(q));
  const vars = (extra = {}) => ({
    head: pos, t, total, direction: dir === "up" ? `towards ${max}` : "towards 0",
    active: active.map(label), waiting: waiting().map(label),
    "not arrived": reqs.filter((q) => q.at > t).map(label),
    pending: reqs.filter((q) => !served.has(q.id)).map((q) => q.c), ...extra,
  });
  const snap = () => ({ active: active.map((q) => q.id), waiting: waiting().map((q) => q.id), later: reqs.filter((q) => q.at > t).map((q) => q.id), served: [...served] });
  const step = (to, kind, note, line, req = null) => {
    const from = pos, distance = Math.abs(to - from);
    t += distance; total += distance; pos = to;
    if (req) { served.add(req.id); active.splice(active.indexOf(req), 1); }
    const fresh = reqs.filter((q) => q.at > t - distance && q.at <= t && !active.includes(q) && !served.has(q.id));
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const passed = kind === "swap" ? [] : reqs.filter((q) => q.at <= t - distance && !served.has(q.id) && !active.includes(q) && q.c > lo && q.c < hi);
    const skipped = passed.length ? ` On the way it passes ${passed.map((q) => q.c).join(", ")}, but ${passed.length === 1 ? "that request is" : "those requests are"} in the waiting queue, so the head doesn't stop.` : "";
    const joined = kind !== "swap" && fresh.length ? ` Meanwhile ${fresh.map(label).join(", ")} arrived and joined the waiting queue: the active queue is frozen.` : "";
    moves.push({ from, to, distance, kind, total, time: t, id: req?.id ?? null, note: note + skipped + joined, line, vars: vars(), queues: snap() });
    path.push(to);
  };
  const swap = (first) => {
    const idle = arrived().length ? 0 : Math.min(...reqs.filter((q) => !served.has(q.id)).map((q) => q.at)) - t;
    t += idle;
    active = arrived().sort((a, b) => a.at - b.at || a.id - b.id);
    sweep++;
    const names = active.map(label).join(", ");
    if (first) return idle;
    step(pos, "swap", `${idle ? `Both queues are empty, so the head waits at ${pos} until t = ${t}, when the next request arrives. ` : ""}The active queue is empty, so the queues swap: ${names} ${active.length === 1 ? "becomes" : "become"} the active queue for sweep ${sweep}, and a new empty waiting queue starts collecting arrivals.`, 7);
    return idle;
  };
  const idle0 = swap(true);
  const initial = {
    line: [1, 2],
    vars: vars(),
    queues: snap(),
    note: `The head starts at cylinder ${head}${idle0 ? `, but nothing has arrived until t = ${t}, so it waits there` : ""}, moving ${direction === "up" ? "towards higher cylinders" : "towards 0"}. The active queue is frozen as ${active.map(label).join(", ")}; anything that arrives from now on waits in the other queue.`,
  };
  while (served.size < reqs.length) {
    if (!active.length) swap(false);
    const up = dir === "up";
    const a = active.filter((q) => (up ? q.c >= pos : q.c <= pos)).sort((x, y) => (up ? x.c - y.c : y.c - x.c) || x.id - y.id);
    const be = active.filter((q) => (up ? q.c < pos : q.c > pos)).sort((x, y) => (up ? y.c - x.c : x.c - y.c) || x.id - y.id);
    const k = sweep;
    a.forEach((q, j) => step(q.c, "serve", `Move ${pos} → ${q.c} (${Math.abs(q.c - pos)} cylinders, now t = ${t + Math.abs(q.c - pos)}): sweep ${k} is going ${up ? "up" : "down"} and ${q.c} is the nearest active request ${up ? "above" : "below"} the head${a.length - j > 1 ? ` (the other active ones ahead: ${a.slice(j + 1).map((x) => x.c).join(", ")})` : ""}.`, j === 0 ? [3, 4] : 4, q));
    if (be.length) {
      const edge = up ? max : 0;
      if (pos !== edge) step(edge, "edge", `Sweep ${k} still has ${be.map((q) => q.c).join(", ")} behind the head, so carry on to the end of the disk (${edge}) and reverse, as SCAN does.`, 5);
      dir = up ? "down" : "up";
      be.forEach((q) => step(q.c, "serve", `Move ${pos} → ${q.c} (${Math.abs(q.c - pos)} cylinders, now t = ${t + Math.abs(q.c - pos)}): the rest of sweep ${k}, now moving ${up ? "down" : "up"}.`, 6, q));
    }
  }
  const order = moves.filter((m) => m.kind === "serve").map((m) => m.to);
  return { path, moves, total, order, average: total / requests.length, initial, sweeps: sweep };
}

export function randomQueue(r = Math.random, cylinders = 200) {
  const n = 7 + Math.floor(r() * 4);
  return { requests: Array.from({ length: n }, () => Math.floor(r() * cylinders)), head: Math.floor(r() * cylinders) };
}

export const EXAMPLE = { requests: [98, 183, 37, 122, 14, 124, 65, 67], head: 53, cylinders: 200 };

// Arrival times for F-SCAN: about half the queue is there at the start and the
// rest trickles in, in multiples of 10, in the order listed.
export const randomArrivals = (r = Math.random, n = 8) =>
  Array.from({ length: n }, () => (r() < 0.5 ? 0 : 10 * (1 + Math.floor(r() * 20)))).sort((a, b) => a - b);

// The Silberschatz queue with the last four requests arriving mid-sweep.
export const FSCAN_EXAMPLE = { requests: [98, 183, 37, 122, 14, 124, 65, 67], arrivals: [0, 0, 0, 0, 20, 20, 60, 60], head: 53, cylinders: 200 };
