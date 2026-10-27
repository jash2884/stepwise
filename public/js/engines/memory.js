// Memory allocation: contiguous allocation into holes (first, next, best and
// worst fit) and the buddy system. A script of "alloc"/"free" operations drives
// both; every hole examined, split and merge becomes a step with the pseudocode
// line, the variables at that moment and the reason for the decision.
//
// Conventions (stated in the UI):
// - Memory is drawn with address 0 on the left. Holes are searched in address order.
// - Best and worst fit break ties by the lowest address.
// - Next fit resumes at the hole containing (or just after) the end of the last
//   allocation, and wraps round to address 0 once.
// - Requests are rounded up to the allocation unit; the difference is internal
//   fragmentation. In the buddy system they round up to a power of two.
// - Freed blocks merge with any hole directly to their left or right.

const FREE_CODE = [
  "free(name):",
  "  b ← name's block; turn b into a hole",
  "  if the hole on the left touches b then merge them",
  "  if the hole on the right touches b then merge them",
];

const fitCode = (search) => [
  "allocate(name, n):",
  "  size ← roundUp(n, unit)  // the rest is internal fragmentation",
  ...search,
  ...FREE_CODE,
];

// Line numbers for the parts every contiguous listing shares.
const lines = (code) => {
  const at = (re) => code.findIndex((l) => re.test(l)) + 1;
  return { req: 1, round: 2, free: at(/^free/), turn: at(/turn b into/), left: at(/on the left/), right: at(/on the right/) };
};

export const ALGORITHMS = {
  first: {
    name: "First fit", kind: "fit",
    code: fitCode([
      "  for each hole h in address order",
      "    if h.size ≥ size then",
      "      put name at h.start; h.start += size; h.size −= size",
      "      return  // stop at the first hole that is big enough",
      "  fail: no single hole is big enough",
    ]),
    at: { loop: 3, test: 4, place: 5, fail: 7 },
  },
  next: {
    name: "Next fit", kind: "fit",
    code: fitCode([
      "  start at rover  // where the last search left off",
      "  for each hole h from rover, wrapping round once",
      "    if h.size ≥ size then",
      "      put name at h.start; shrink h; rover ← end of name",
      "      return",
      "  fail: no single hole is big enough",
    ]),
    at: { loop: 4, test: 5, place: 6, fail: 8, rover: 3 },
  },
  best: {
    name: "Best fit", kind: "fit",
    code: fitCode([
      "  best ← none",
      "  for each hole h in address order",
      "    if h.size ≥ size and (best = none or h.size < best.size) then",
      "      best ← h  // the tightest fit so far",
      "  if best = none then fail",
      "  put name at best.start; shrink best by size",
    ]),
    at: { init: 3, loop: 4, test: 5, keep: 6, fail: 7, place: 8 },
  },
  worst: {
    name: "Worst fit", kind: "fit",
    code: fitCode([
      "  worst ← none",
      "  for each hole h in address order",
      "    if h.size ≥ size and (worst = none or h.size > worst.size) then",
      "      worst ← h  // the biggest hole so far",
      "  if worst = none then fail",
      "  put name at worst.start; shrink worst by size",
    ]),
    at: { init: 3, loop: 4, test: 5, keep: 6, fail: 7, place: 8 },
  },
  buddy: {
    name: "Buddy system", kind: "buddy",
    code: [
      "allocate(name, n):",
      "  k ← smallest power of 2 ≥ n (at least the minimum block)",
      "  b ← smallest free block with b.size ≥ k  // lowest address on ties",
      "  if there is none then fail",
      "  while b.size > k",
      "    split b into two buddies of b.size / 2; b ← the left one",
      "  give b to name  // internal fragmentation = k − n",
      "free(name):",
      "  b ← name's block; mark b free",
      "  while b's buddy (address b.start XOR b.size) is a whole free block",
      "    merge b with its buddy; b ← the merged block",
    ],
  },
};
for (const a of Object.values(ALGORITHMS)) if (a.kind === "fit") Object.assign(a.at, lines(a.code));

// Silberschatz, Galvin & Gagne, Operating System Concepts (ch. 9, "Memory
// Management", practice exercise): partitions of 100, 500, 200, 300 and 600 KB,
// processes of 212, 417, 112 and 426 KB in order.
export const EXAMPLE = { holes: "100 500 200 300 600", script: "P1 212; P2 417; P3 112; P4 426" };
// Stallings, Operating Systems: Internals and Design Principles (fig. 7.6,
// "Example of buddy system"): 1 MB of memory, sizes in KB.
export const BUDDY_EXAMPLE = { total: 1024, min: 16, script: "A 100; B 240; C 64; D 256; free B; free A; E 75; free C; free E; free D" };

export function parseScript(text) {
  const parts = String(text).split(/[;\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Write at least one operation, e.g. A 212; free A.");
  if (parts.length > 30) throw new Error("Use at most 30 operations.");
  return parts.map((p) => {
    let m = /^free\s+([A-Za-z]\w{0,5})$/i.exec(p);
    if (m) return { op: "free", name: m[1] };
    m = /^(?:alloc(?:ate)?\s+)?([A-Za-z]\w{0,5})\s*[:=]?\s*(\d+)\s*(?:k|kb)?$/i.exec(p);
    if (!m || /^free$/i.test(m[1])) throw new Error(`Can't read "${p}". Write "A 212" to allocate 212 KB to A, or "free A".`);
    const size = Number(m[2]);
    if (size < 1 || size > 9999) throw new Error(`${m[1]}: sizes must be from 1 to 9999 KB.`);
    return { op: "alloc", name: m[1], size };
  });
}

export function parseHoles(text) {
  const holes = String(text).trim().split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!holes.length) throw new Error("List the hole sizes in address order, e.g. 100 500 200.");
  if (holes.length > 8) throw new Error("Use at most 8 holes.");
  if (holes.some((x) => !Number.isInteger(x) || x < 1 || x > 9999)) throw new Error("Hole sizes must be whole numbers from 1 to 9999 KB.");
  return holes;
}

const copy = (segs) => segs.map((s) => ({ ...s }));
const desc = (s) => `${s.size} KB at ${s.start}`;

export function summarise(segs) {
  const holes = segs.filter((s) => !s.owner), used = segs.filter((s) => s.owner);
  const free = holes.reduce((t, s) => t + s.size, 0);
  return {
    total: segs.reduce((t, s) => t + s.size, 0),
    used: used.reduce((t, s) => t + s.size, 0),
    free,
    holes: holes.length,
    largest: Math.max(0, ...holes.map((s) => s.size)),
    internal: used.reduce((t, s) => t + (s.req != null ? s.size - s.req : 0), 0),
  };
}

// Contiguous allocation. The initial layout is the holes in address order with
// a block already in use (U1, U2, …) between neighbours, so they can't merge.
export function contiguous(holeSizes, ops, algo, { unit = 1, gap = 40 } = {}) {
  const spec = ALGORITHMS[algo];
  if (!spec || spec.kind !== "fit") throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(unit) || unit < 1 || unit > 1024) throw new Error("The allocation unit must be from 1 to 1024 KB.");
  const at = spec.at;
  const segs = [];
  let addr = 0, hid = 0, serial = 0;
  holeSizes.forEach((size, i) => {
    segs.push({ id: `h${hid++}`, start: addr, size, owner: null });
    addr += size;
    if (i < holeSizes.length - 1) { segs.push({ id: `U${i + 1}`, start: addr, size: gap, owner: `U${i + 1}`, fixed: true }); addr += gap; }
  });
  const steps = [];
  let rover = 0, failed = 0, placed = 0;
  const push = (s) => steps.push({ segs: copy(segs), rover: algo === "next" ? rover : null, failed, placed, ...s, stats: summarise(segs) });
  const holeList = () => segs.filter((s) => !s.owner);
  push({ line: null, vars: {}, note: `Memory starts with ${holeSizes.length} hole${holeSizes.length === 1 ? "" : "s"} (${holeSizes.join(", ")} KB), separated by blocks already in use.` });

  ops.forEach((o, opIndex) => {
    if (o.op === "alloc") {
      if (segs.some((s) => s.owner === o.name)) throw new Error(`${o.name} already has memory; free it before allocating again.`);
      const size = Math.ceil(o.size / unit) * unit;
      const base = { name: o.name, n: o.size, size };
      push({ op: opIndex, line: [at.req, at.round], vars: base, note: `${o.name} asks for ${o.size} KB.${unit > 1 ? ` Memory is handed out in ${unit} KB units, so it gets ${size} KB; ${size - o.size} KB of that is internal fragmentation.` : ""}` });
      let order = holeList();
      if (algo === "next") {
        const k = order.findIndex((s) => s.start + s.size > rover);
        order = k <= 0 ? order : [...order.slice(k), ...order.slice(0, k)];
        push({ op: opIndex, line: at.rover, vars: { ...base, rover }, scan: order[0]?.id, note: `Next fit doesn't restart at address 0: it carries on from the rover at ${rover}${order.length ? `, so it looks at the hole of ${desc(order[0])} first` : ""}.` });
      }
      let chosen = null;
      if (algo === "first" || algo === "next") {
        for (const h of order) {
          const fits = h.size >= size;
          push({ op: opIndex, line: [at.loop, at.test], vars: { ...base, h: desc(h), ...(algo === "next" ? { rover } : {}) }, scan: h.id,
            note: fits ? `The hole of ${desc(h)} is big enough (${h.size} ≥ ${size}). ${spec.name} takes the first hole that fits, so the search stops here.` : `The hole of ${desc(h)} is too small (${h.size} < ${size}); move on to the next hole.` });
          if (fits) { chosen = h; break; }
        }
      } else {
        const better = algo === "best" ? (a, b) => a.size < b.size : (a, b) => a.size > b.size;
        push({ op: opIndex, line: at.init, vars: { ...base, [algo]: "none" }, note: `${spec.name} must look at every hole before it decides, so it starts with no candidate.` });
        for (const h of order) {
          const fits = h.size >= size, wins = fits && (!chosen || better(h, chosen));
          const prev = chosen;
          if (wins) chosen = h;
          push({ op: opIndex, line: wins ? [at.test, at.keep] : at.test, vars: { ...base, h: desc(h), [algo]: chosen ? desc(chosen) : "none" }, scan: h.id, pick: chosen?.id,
            note: !fits ? `The hole of ${desc(h)} is too small (${h.size} < ${size}), so it can't be used.`
              : wins ? (prev ? `${h.size} KB is ${algo === "best" ? "smaller" : "bigger"} than the current ${algo} (${prev.size} KB), so this hole becomes the new ${algo}. It would leave ${h.size - size} KB over.` : `The hole of ${desc(h)} fits (${h.size} ≥ ${size}) and is the first one that does, so it's the ${algo} so far.`)
              : `The hole of ${desc(h)} fits, but it isn't ${algo === "best" ? "smaller" : "bigger"} than the ${algo} so far (${chosen.size} KB${h.size === chosen.size ? "; ties go to the lower address" : ""}), so keep looking.` });
        }
      }
      if (!chosen) {
        failed++;
        const st = summarise(segs);
        push({ op: opIndex, line: at.fail, vars: { ...base, free: st.free, largest: st.largest }, failedOp: true,
          note: st.free >= size
            ? `${o.name} must wait: there is ${st.free} KB free in total, enough for ${size} KB, but it's split across ${st.holes} holes and the largest is only ${st.largest} KB. That is external fragmentation.`
            : `${o.name} must wait: only ${st.free} KB is free in total, less than the ${size} KB it needs.` });
        return;
      }
      const id = `${o.name}#${serial++}`;
      const left = chosen.size - size;
      segs.splice(segs.indexOf(chosen), 0, { id, start: chosen.start, size, owner: o.name, req: o.size });
      chosen.start += size;
      chosen.size -= size;
      if (!chosen.size) segs.splice(segs.indexOf(chosen), 1);
      if (algo === "next") rover = chosen.start;
      placed++;
      const why = { first: "it's the first hole in address order that fits", next: "it's the first hole after the rover that fits", best: "it's the smallest hole that fits, which wastes the least", worst: "it's the largest hole, so the piece left over is as big (and as useful) as possible" }[algo];
      push({ op: opIndex, line: at.place, vars: { ...base, at: chosen.start - size, left, ...(algo === "next" ? { rover } : {}) }, fresh: id, pick: left ? chosen.id : null,
        note: `${o.name} goes at address ${chosen.start - size} because ${why}. The hole splits: ${size} KB for ${o.name}${left ? ` and a ${left} KB hole left over` : ", and nothing is left over"}.` });
    } else {
      const b = segs.find((s) => s.owner === o.name);
      if (!b) { push({ op: opIndex, line: at.free, vars: { name: o.name }, note: `${o.name} doesn't hold any memory (it was never allocated or is already free), so there's nothing to free.` }); return; }
      b.owner = null;
      delete b.req;
      const i = segs.indexOf(b), L = segs[i - 1], R = segs[i + 1];
      const merging = [L, R].filter((x) => x && !x.owner);
      push({ op: opIndex, line: [at.free, at.turn], vars: { name: o.name, b: desc(b) }, pick: b.id, merge: merging.map((x) => x.id),
        note: `${o.name} gives back ${desc(b)}, which becomes a hole.${merging.length ? ` It touches ${merging.length === 2 ? "holes on both sides" : `a hole on the ${merging[0] === L ? "left" : "right"}`}, so they will merge.` : " Both neighbours are in use, so there's nothing to merge with."}` });
      let cur = b;
      if (L && !L.owner) {
        L.size += cur.size;
        segs.splice(segs.indexOf(cur), 1);
        cur = L;
        push({ op: opIndex, line: at.left, vars: { name: o.name, b: desc(cur) }, pick: cur.id, merged: true, note: `Merge with the hole on the left: one hole of ${desc(cur)}. Coalescing like this fights external fragmentation.` });
      }
      if (R && !R.owner) {
        cur.size += R.size;
        segs.splice(segs.indexOf(R), 1);
        push({ op: opIndex, line: at.right, vars: { name: o.name, b: desc(cur) }, pick: cur.id, merged: true, note: `Merge with the hole on the right: one hole of ${desc(cur)}.` });
      }
    }
  });
  const end = summarise(segs);
  push({ line: null, vars: { placed, failed, free: end.free, largest: end.largest }, done: true,
    note: `Done: ${placed} request${placed === 1 ? "" : "s"} placed, ${failed} had to wait. ${end.free} KB is free in ${end.holes} hole${end.holes === 1 ? "" : "s"}; the largest is ${end.largest} KB.` });
  return { steps, segs, stats: end, failed, placed };
}

// --- Buddy system -----------------------------------------------------------------
const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
export const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

export function buddy(ops, { total = 1024, min = 16 } = {}) {
  if (!isPow2(total) || total < 64 || total > 4096) throw new Error("Total memory must be a power of two from 64 to 4096 KB.");
  if (!isPow2(min) || min > total || total / min > 64) throw new Error(`The smallest block must be a power of two, at least ${total / 64} KB and at most ${total} KB.`);
  const code = ALGORITHMS.buddy.code;
  const blocks = [{ start: 0, size: total, owner: null }];
  const steps = [];
  let failed = 0, placed = 0;
  const sort = () => blocks.sort((a, b) => a.start - b.start);
  const stats = () => summarise(blocks);
  const push = (s) => steps.push({ blocks: blocks.map((b) => ({ ...b })), failed, placed, ...s, stats: stats() });
  const key = (b) => `${b.start}/${b.size}`;
  push({ line: null, vars: {}, note: `Memory is one free block of ${total} KB. Blocks are only ever split in half, so every block is a power of two and starts at a multiple of its own size.` });

  ops.forEach((o, opIndex) => {
    if (o.op === "alloc") {
      if (blocks.some((b) => b.owner === o.name)) throw new Error(`${o.name} already has memory; free it before allocating again.`);
      const k = Math.max(min, nextPow2(o.size));
      push({ op: opIndex, line: [1, 2], vars: { name: o.name, n: o.size, k }, note: `${o.name} asks for ${o.size} KB. The buddy system only hands out powers of two, so it rounds up to ${k} KB${k > o.size ? `, wasting ${k - o.size} KB inside the block (internal fragmentation)` : ""}.` });
      const cands = blocks.filter((b) => !b.owner && b.size >= k).sort((a, b) => a.size - b.size || a.start - b.start);
      let b = cands[0];
      if (!b) {
        failed++;
        const st = stats();
        push({ op: opIndex, line: [3, 4], vars: { name: o.name, n: o.size, k, b: "none" }, failedOp: true,
          note: `No free block is ${k} KB or bigger, so ${o.name} must wait.${st.free >= k ? ` ${st.free} KB is free in total, but buddies that aren't free together can't merge into a big enough block.` : ""}` });
        return;
      }
      push({ op: opIndex, line: 3, vars: { name: o.name, n: o.size, k, b: `${b.size} KB at ${b.start}` }, hot: key(b),
        note: `The smallest free block that is at least ${k} KB is ${b.size} KB at address ${b.start}${b.size > k ? ", which is too big, so it will be split" : ", an exact fit"}.` });
      while (b.size > k) {
        const half = b.size / 2;
        blocks.splice(blocks.indexOf(b), 1, { start: b.start, size: half, owner: null }, { start: b.start + half, size: half, owner: null });
        const left = blocks.find((x) => x.start === b.start && x.size === half);
        push({ op: opIndex, line: [5, 6], vars: { name: o.name, n: o.size, k, b: `${half} KB at ${left.start}` }, hot: key(left), split: key(b),
          note: `${b.size} KB is still bigger than ${k} KB, so split it into two ${half} KB buddies (at ${b.start} and ${b.start + half}). Keep the left one and leave the right one free.` });
        b = left;
      }
      b.owner = o.name;
      b.req = o.size;
      placed++;
      push({ op: opIndex, line: 7, vars: { name: o.name, n: o.size, k, b: `${k} KB at ${b.start}`, waste: k - o.size }, hot: key(b), fresh: key(b),
        note: `${o.name} gets the ${k} KB block at address ${b.start}. ${k > o.size ? `${k - o.size} KB of it is unused: that's internal fragmentation.` : "It's an exact power of two, so nothing is wasted."}` });
    } else {
      let b = blocks.find((x) => x.owner === o.name);
      if (!b) { push({ op: opIndex, line: 8, vars: { name: o.name }, note: `${o.name} doesn't hold a block, so there's nothing to free.` }); return; }
      b.owner = null;
      delete b.req;
      push({ op: opIndex, line: [8, 9], vars: { name: o.name, b: `${b.size} KB at ${b.start}` }, hot: key(b), note: `${o.name} frees its ${b.size} KB block at ${b.start}.` });
      for (;;) {
        if (b.size === total) { push({ op: opIndex, line: 10, vars: { name: o.name, b: `${b.size} KB at 0` }, hot: key(b), note: "The block is the whole of memory again, so there's no buddy left to look for." }); break; }
        const bAddr = b.start ^ b.size;
        const bud = blocks.find((x) => x.start === bAddr && x.size === b.size && !x.owner);
        if (!bud) {
          const why = blocks.some((x) => x.start === bAddr && x.size === b.size) ? "is in use" : "has been split into smaller pieces";
          push({ op: opIndex, line: 10, vars: { name: o.name, b: `${b.size} KB at ${b.start}`, buddy: bAddr }, hot: key(b), buddy: `${bAddr}/${b.size}`,
            note: `Its buddy is the ${b.size} KB block at ${b.start} XOR ${b.size} = ${bAddr}, which ${why}, so merging stops here.` });
          break;
        }
        push({ op: opIndex, line: 10, vars: { name: o.name, b: `${b.size} KB at ${b.start}`, buddy: bAddr }, hot: key(b), buddy: key(bud),
          note: `Its buddy is at ${b.start} XOR ${b.size} = ${bAddr}, and that whole ${b.size} KB block is free, so the two can join back together.` });
        const merged = { start: Math.min(b.start, bud.start), size: b.size * 2, owner: null };
        blocks.splice(blocks.indexOf(b), 1);
        blocks.splice(blocks.indexOf(bud), 1, merged);
        sort();
        b = merged;
        push({ op: opIndex, line: 11, vars: { name: o.name, b: `${b.size} KB at ${b.start}` }, hot: key(b), merged: true, note: `Merged into one free ${b.size} KB block at ${b.start}. Now check whether this bigger block's buddy is free too.` });
      }
    }
  });
  const end = stats();
  push({ line: null, vars: { placed, failed, free: end.free, waste: end.internal }, done: true,
    note: `Done: ${placed} placed, ${failed} had to wait. ${end.free} KB is free in ${end.holes} block${end.holes === 1 ? "" : "s"}, and ${end.internal} KB is lost to internal fragmentation inside the blocks in use.` });
  return { steps, blocks, stats: end, failed, placed };
}

// Every block that exists now, plus the split-off ancestors it came from.
export function buddyTree(blocks, total) {
  const nodes = new Map();
  for (const b of blocks) {
    nodes.set(`${b.start}/${b.size}`, { ...b, leaf: true });
    for (let size = b.size * 2; size <= total; size *= 2) {
      const start = b.start - (b.start % size);
      if (!nodes.has(`${start}/${size}`)) nodes.set(`${start}/${size}`, { start, size, leaf: false });
    }
  }
  return [...nodes.values()].map((n) => ({ ...n, depth: Math.log2(total / n.size), key: `${n.start}/${n.size}` }));
}

export function randomHoles(r = Math.random, n = 4 + Math.floor(r() * 3)) {
  return Array.from({ length: n }, () => 10 * (5 + Math.floor(r() * 56)));
}

// A believable script: mostly allocations, with some frees of live blocks.
export function randomScript(r = Math.random, length = 6 + Math.floor(r() * 5), maxSize = 400) {
  const ops = [], live = [];
  let next = 1;
  for (let i = 0; i < length; i++) {
    if (live.length && r() < 0.35) ops.push({ op: "free", name: live.splice(Math.floor(r() * live.length), 1)[0] });
    else { const name = `P${next++}`; live.push(name); ops.push({ op: "alloc", name, size: 1 + Math.floor(r() * maxSize) }); }
  }
  return ops;
}

export const scriptText = (ops) => ops.map((o) => (o.op === "free" ? `free ${o.name}` : `${o.name} ${o.size}`)).join("; ");
