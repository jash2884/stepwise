// Disk scheduling: the order the head visits cylinders and the total head movement.
//
// Conventions (stated in the UI):
// - SSTF ties go to the request that arrived first.
// - SCAN and C-SCAN travel all the way to the last cylinder; LOOK and C-LOOK
//   turn at the last request.
// - The return jump of C-SCAN / C-LOOK counts as head movement unless switched off.

export const ALGORITHMS = {
  fcfs: { name: "FCFS" },
  sstf: { name: "SSTF (shortest seek first)" },
  scan: { name: "SCAN (elevator)", direction: true },
  cscan: { name: "C-SCAN", direction: true, circular: true },
  look: { name: "LOOK", direction: true },
  clook: { name: "C-LOOK", direction: true, circular: true },
};

export function parseRequests(text) {
  const reqs = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (!reqs.length) throw new Error("Enter the request queue, e.g. 98 183 37 122.");
  if (reqs.length > 30) throw new Error("Use at most 30 requests.");
  return reqs;
}

export function schedule(requests, head, algo, { cylinders = 200, direction = "up", countJump = true } = {}) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(cylinders) || cylinders < 2 || cylinders > 10000) throw new Error("Cylinders must be between 2 and 10000.");
  const max = cylinders - 1;
  for (const r of [head, ...requests]) if (!Number.isInteger(r) || r < 0 || r > max) throw new Error(`Cylinders must be whole numbers from 0 to ${max}.`);

  const path = [head];
  const moves = [];
  let pos = head, total = 0;
  const move = (to, kind, note) => {
    const distance = kind === "jump" && !countJump ? 0 : Math.abs(to - pos);
    total += distance;
    moves.push({ from: pos, to, distance, kind, total, note });
    path.push(to);
    pos = to;
  };
  const serve = (r, why) => move(r, "serve", `Move ${pos} → ${r} (${Math.abs(r - pos)} cylinders)${why ? `: ${why}` : ""}.`);

  if (algo === "fcfs") {
    requests.forEach((r) => serve(r, "next in arrival order"));
  } else if (algo === "sstf") {
    const left = requests.map((r, i) => ({ r, i }));
    while (left.length) {
      const best = left.reduce((a, b) => (Math.abs(b.r - pos) < Math.abs(a.r - pos) ? b : a));
      left.splice(left.indexOf(best), 1);
      serve(best.r, "closest to the head");
    }
  } else {
    const up = direction === "up";
    const ahead = requests.filter((r) => (up ? r >= pos : r <= pos)).sort((a, b) => (up ? a - b : b - a));
    const behind = requests.filter((r) => (up ? r < pos : r > pos)).sort((a, b) => (up ? b - a : a - b));
    ahead.forEach((r) => serve(r, `next while moving ${up ? "up" : "down"}`));
    const edge = up ? max : 0, far = up ? 0 : max;
    if (algo === "scan") {
      if (behind.length && pos !== edge) move(edge, "edge", `Keep going to the end of the disk (${edge}) before reversing.`);
      behind.forEach((r) => serve(r, `next while moving ${up ? "down" : "up"}`));
    } else if (algo === "look") {
      behind.forEach((r) => serve(r, `reverse at the last request, then continue ${up ? "down" : "up"}`));
    } else {
      const wrapped = [...behind].reverse(); // continue in the same direction after the jump
      if (wrapped.length) {
        if (algo === "cscan") {
          if (pos !== edge) move(edge, "edge", `Keep going to the end of the disk (${edge}).`);
          move(far, "jump", `Jump back to cylinder ${far}${countJump ? "" : " (not counted)"} without serving anything.`);
        } else {
          move(wrapped[0], "jump", `Jump back to the furthest pending request (${wrapped[0]})${countJump ? "" : " (not counted)"}.`);
          moves.at(-1).served = true;
          wrapped.shift();
        }
        wrapped.forEach((r) => serve(r, `next while moving ${up ? "up" : "down"} again`));
      }
    }
  }
  const served = moves.filter((m) => m.kind === "serve" || m.served).map((m) => m.to);
  return { path, moves, total, order: served, average: total / requests.length };
}

export function randomQueue(r = Math.random, cylinders = 200) {
  const n = 7 + Math.floor(r() * 4);
  return { requests: Array.from({ length: n }, () => Math.floor(r() * cylinders)), head: Math.floor(r() * cylinders) };
}

export const EXAMPLE = { requests: [98, 183, 37, 122, 14, 124, 65, 67], head: 53, cylinders: 200 };
