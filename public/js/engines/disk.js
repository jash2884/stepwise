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

const START = "head ← start; total ← 0";
export const ALGORITHMS = {
  fcfs: { name: "FCFS", code: [START, "for each request r in arrival order", "  total ← total + |r − head|; head ← r"] },
  sstf: { name: "SSTF (shortest seek first)", code: [START, "while requests are pending", "  r ← the pending request closest to head  // ties: earliest arrival", "  total ← total + |r − head|; head ← r; remove r"] },
  scan: { name: "SCAN (elevator)", direction: true, code: [START, "serve the requests ahead, nearest first", "if requests remain behind then carry on to the end of the disk", "reverse direction", "serve the remaining requests, nearest first"] },
  cscan: { name: "C-SCAN", direction: true, circular: true, code: [START, "serve the requests ahead, nearest first", "if requests remain then carry on to the end of the disk", "jump to the other end  // nothing is served on the way back", "serve the rest, moving in the same direction as before"] },
  look: { name: "LOOK", direction: true, code: [START, "serve the requests ahead, nearest first", "reverse at the last request  // no trip to the edge", "serve the remaining requests, nearest first"] },
  clook: { name: "C-LOOK", direction: true, circular: true, code: [START, "serve the requests ahead, nearest first", "jump back to the furthest pending request at the other end", "serve the rest, moving in the same direction as before"] },
  nstep: { name: "N-step SCAN", direction: true, batch: true, code: [START, "split the queue into batches of N, in arrival order", "for each batch B", "  serve B's requests ahead, nearest first", "  if B has requests behind then go to the end and reverse", "  serve the rest of B  // later batches wait, even if the head passes them"] },
};

export function parseRequests(text) {
  const reqs = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (!reqs.length) throw new Error("Enter the request queue, e.g. 98 183 37 122.");
  if (reqs.length > 30) throw new Error("Use at most 30 requests.");
  return reqs;
}

export function schedule(requests, head, algo, { cylinders = 200, direction = "up", countJump = true, n = 4 } = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(cylinders) || cylinders < 2 || cylinders > 10000) throw new Error("Cylinders must be between 2 and 10000.");
  if (algo === "nstep" && !(Number.isInteger(n) && n >= 1 && n <= 30)) throw new Error("N must be a whole number from 1 to 30.");
  const max = cylinders - 1;
  for (const r of [head, ...requests]) if (!Number.isInteger(r) || r < 0 || r > max) throw new Error(`Cylinders must be whole numbers from 0 to ${max}.`);

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

export function randomQueue(r = Math.random, cylinders = 200) {
  const n = 7 + Math.floor(r() * 4);
  return { requests: Array.from({ length: n }, () => Math.floor(r() * cylinders)), head: Math.floor(r() * cylinders) };
}

export const EXAMPLE = { requests: [98, 183, 37, 122, 14, 124, 65, 67], head: 53, cylinders: 200 };
