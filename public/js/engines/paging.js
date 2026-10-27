// Page replacement simulator: FIFO, LRU, Optimal (Belady's MIN), LFU, MFU,
// Second Chance (the clock algorithm) and NRU, plus the working-set model.
// Each reference becomes one step with the frame contents, the reasoning, the
// pseudocode line being executed and the variables at that moment.
//
// Conventions: empty frames fill left to right. For Optimal, when several pages
// are never used again, the one loaded earliest is evicted. LFU/MFU count
// references only while a page is in memory (an evicted page starts again at 1)
// and break ties by evicting the page loaded earliest. Clock: a page's reference
// bit is set to 1 when it is loaded and on every hit; the hand starts at frame 1
// and moves to the frame after each page it loads.
//
// NRU (Tanenbaum, Modern Operating Systems, 3.4.2): every frame has a referenced
// bit R and a modified bit M. A reference sets R; a write ("7w") also sets M. A
// loaded page starts with R = 1 and M = 1 only if the loading reference is a
// write. Every k references (default 4) a clock tick clears every R bit; the
// tick happens just before references k + 1, 2k + 1, ... M is never cleared
// while the page stays in memory (it must be written back when evicted). On a
// fault with no free frame, each page is in class 2R + M (0: R0 M0, 1: R0 M1,
// 2: R1 M0, 3: R1 M1) and the victim comes from the lowest non-empty class.
// Tanenbaum picks at random within the class; here the lowest-numbered frame
// in that class goes, so every run is reproducible.

const HEAD = ["for each page p in the reference string"];
const MISS = ["  else faults ← faults + 1", "    if a frame is free then load p into it"];

export const ALGORITHMS = {
  fifo: {
    name: "FIFO",
    code: [...HEAD, "  if p is in a frame then hit  // FIFO order doesn't change", ...MISS,
      "    else victim ← page loaded longest ago  // front of the queue", "      replace victim with p; p joins the back of the queue"],
    at: { hit: 2, fault: 3, free: 4, choose: 5, replace: 6 },
  },
  lru: {
    name: "LRU (Least Recently Used)",
    code: [...HEAD, "  if p is in a frame then hit", ...MISS,
      "    else victim ← page with the smallest last[ ]  // unused for longest", "      replace victim with p", "  last[p] ← now  // every use refreshes the timestamp"],
    at: { hit: [2, 7], fault: 3, free: [4, 7], choose: 5, replace: [6, 7] },
  },
  optimal: {
    name: "Optimal (OPT / MIN)",
    code: [...HEAD, "  if p is in a frame then hit", ...MISS,
      "    else victim ← page whose next use is furthest away  // or never used again", "      replace victim with p"],
    at: { hit: 2, fault: 3, free: 4, choose: 5, replace: 6 },
  },
  lfu: {
    name: "LFU (Least Frequently Used)",
    code: [...HEAD, "  if p is in a frame then hit; count[p] ← count[p] + 1", ...MISS,
      "    else victim ← page with the smallest count  // ties: loaded earliest", "      replace victim with p", "    count[p] ← 1  // counting starts afresh"],
    at: { hit: 2, fault: 3, free: [4, 7], choose: 5, replace: [6, 7] },
  },
  mfu: {
    name: "MFU (Most Frequently Used)",
    code: [...HEAD, "  if p is in a frame then hit; count[p] ← count[p] + 1", ...MISS,
      "    else victim ← page with the largest count  // ties: loaded earliest", "      replace victim with p", "    count[p] ← 1  // a fresh page has the smallest count"],
    at: { hit: 2, fault: 3, free: [4, 7], choose: 5, replace: [6, 7] },
  },
  clock: {
    name: "Second Chance (Clock)",
    code: [...HEAD, "  if p is in a frame then hit; ref[p] ← 1", ...MISS.slice(0, 1),
      "    if a frame is free then load p there; ref ← 1; hand ← next frame",
      "    else while ref[hand] = 1",
      "      ref[hand] ← 0; hand ← hand + 1  // a second chance",
      "    replace the page at hand with p; ref ← 1; hand ← hand + 1"],
    at: { hit: 2, fault: 3, free: 4, choose: [5, 6], replace: 7 },
  },
  nru: {
    name: "NRU (Not Recently Used)",
    code: [...HEAD, "  if k references have passed since the last tick then R ← 0 in every frame  // clock tick",
      "  if p is in a frame then hit; R[p] ← 1; if p is written then M[p] ← 1", ...MISS,
      "    else class[q] ← 2·R[q] + M[q] for every page q in memory",
      "      victim ← lowest-numbered frame in the lowest non-empty class",
      "      replace victim with p  // a victim with M = 1 is written back first",
      "    R[p] ← 1; M[p] ← 1 if p is written, else 0"],
    at: { tick: 2, hit: 3, fault: 4, free: [5, 9], choose: [6, 7], replace: [8, 9] },
  },
};

export const NRU_TICK = 4;
export const CLASS_NAMES = ["class 0: not referenced, not modified", "class 1: not referenced, modified", "class 2: referenced, not modified", "class 3: referenced, modified"];

// A reference is a page number, optionally followed by w (a write) or r (a
// read, the default): "7w 0 1 2w". Only NRU looks at the writes.
export function parseAccesses(text) {
  const tokens = String(text).trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error("Enter a reference string, e.g. 7 0 1 2 0 3 0 4.");
  if (tokens.length > 40) throw new Error("Use at most 40 references.");
  const refs = [], writes = [];
  for (const t of tokens) {
    const m = /^(\d+)([rw]?)$/i.exec(t);
    const n = m ? Number(m[1]) : NaN;
    if (!m || n > 99) throw new Error("Pages must be whole numbers from 0 to 99, optionally followed by w for a write (e.g. 7w).");
    refs.push(n);
    writes.push(m[2].toLowerCase() === "w");
  }
  return { refs, writes };
}

export const parseRefs = (text) => parseAccesses(text).refs;

// The reference string back as text, with writes marked.
export const formatAccesses = (refs, writes = []) => refs.map((p, i) => `${p}${writes[i] ? "w" : ""}`).join(" ");

const list = (m, frames) => frames.filter((p) => p !== null).map((p) => `${p}:${m.get(p)}`);

export function replace(refs, frameCount, algo, { writes = [], tick = NRU_TICK } = {}) {
  const spec = ALGORITHMS[algo];
  if (!spec) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 8) throw new Error("Frames must be between 1 and 8.");
  if (algo === "nru" && !(Number.isInteger(tick) && tick >= 1 && tick <= 40)) throw new Error("The clock tick k must be a whole number from 1 to 40.");
  const R = Array(frameCount).fill(0), M = Array(frameCount).fill(0);
  const cls = (k) => (frames[k] === null ? null : 2 * R[k] + M[k]);
  const frames = Array(frameCount).fill(null);
  const loadedAt = new Map(), lastUsed = new Map(), count = new Map();
  const ref = Array(frameCount).fill(0);
  let hand = 0;
  const steps = [];
  let faults = 0;
  const lines = (...keys) => [...new Set(keys.flatMap((k) => [spec.at[k]].flat()))];

  // The variables this algorithm keeps, as the pseudocode names them.
  const state = (page, extra = {}) => {
    const v = { p: page, frames: frames.map((x) => x ?? "–"), faults };
    if (algo === "fifo") v.queue = [...loadedAt.entries()].sort((a, b) => a[1] - b[1]).map(([x]) => x);
    if (algo === "lru") v["last[ ]"] = list(lastUsed, frames);
    if (algo === "lfu" || algo === "mfu") v["count[ ]"] = list(count, frames);
    if (algo === "clock") { v.hand = `frame ${hand + 1}`; v["ref[ ]"] = frames.map((x, k) => (x === null ? "–" : `${x}:${ref[k]}`)); }
    if (algo === "nru") {
      v.k = tick;
      v["R M[ ]"] = frames.map((x, k) => (x === null ? "–" : `${x}:${R[k]}${M[k]}`));
      v["class[ ]"] = frames.map((x, k) => (x === null ? "–" : `${x}:${cls(k)}`));
    }
    return { ...v, ...extra };
  };

  refs.forEach((page, i) => {
    const write = !!writes[i];
    // NRU: the clock tick before references k + 1, 2k + 1, ... clears every R bit.
    const ticked = algo === "nru" && i > 0 && i % tick === 0;
    if (ticked) R.fill(0);
    const nru = algo === "nru" ? { write, tick: ticked, before: frames.map((_, k) => cls(k)) } : {};
    const tickNote = ticked ? `Clock tick (every ${tick} references): every R bit is cleared to 0. ` : "";
    const nruBits = () => (algo === "nru" ? { R: [...R], M: [...M], classes: frames.map((_, k) => cls(k)) } : {});
    const nruLines = (...keys) => (ticked ? [spec.at.tick, ...lines(...keys)] : lines(...keys));
    const slot = frames.indexOf(page);
    if (algo === "nru" && slot !== -1) {
      const was = cls(slot);
      R[slot] = 1;
      if (write) M[slot] = 1;
      const now = cls(slot);
      steps.push({ page, frames: [...frames], hit: true, slot, victim: null, ref: [...ref], hand, ...nru, ...nruBits(), line: nruLines("hit"), vars: state(page),
        note: `${tickNote}Page ${page} is already in frame ${slot + 1}: a hit. ${write ? "It is written, so R and M are both set" : "It is read, so R is set"}${was === now ? ` (it stays in class ${now})` : `, moving it from class ${was} to class ${now}`}. The hardware sets these bits on every access; the OS only reads them at a fault.` });
      return;
    }
    if (slot !== -1) {
      lastUsed.set(page, i);
      count.set(page, count.get(page) + 1);
      const before = ref[slot];
      ref[slot] = 1;
      const why = {
        fifo: "FIFO ignores hits, so the queue order stays the same.",
        lru: `Its last-use time is refreshed to step ${i + 1}, so it is now the most recently used page.`,
        optimal: "Nothing needs to be evicted.",
        lfu: `Its count rises to ${count.get(page)}.`,
        mfu: `Its count rises to ${count.get(page)}.`,
        clock: before ? "Its reference bit is already 1." : "Its reference bit is set to 1, so it will survive the hand's next pass.",
      }[algo];
      steps.push({ page, frames: [...frames], hit: true, slot, victim: null, ref: [...ref], hand, line: lines("hit"), vars: state(page), note: `Page ${page} is already in frame ${slot + 1}: a hit. ${why}` });
      return;
    }
    faults++;
    const empty = frames.indexOf(null);
    if (algo === "nru" && empty !== -1) {
      frames[empty] = page;
      R[empty] = 1;
      M[empty] = write ? 1 : 0;
      steps.push({ page, frames: [...frames], hit: false, slot: empty, victim: null, ref: [...ref], hand, ...nru, ...nruBits(), line: nruLines("fault", "free"), vars: state(page),
        note: `${tickNote}Page fault: ${page} isn't in memory, but frame ${empty + 1} is still empty, so it goes straight in with R = 1, M = ${M[empty]} (class ${cls(empty)})${write ? ", since this reference writes to it" : ""}.` });
      return;
    }
    if (empty !== -1) {
      frames[empty] = page;
      loadedAt.set(page, i);
      lastUsed.set(page, i);
      count.set(page, 1);
      ref[empty] = 1;
      const sweep = algo === "clock" ? [hand] : [];
      if (algo === "clock") hand = (empty + 1) % frameCount;
      steps.push({ page, frames: [...frames], hit: false, slot: empty, victim: null, ref: [...ref], hand, sweep, line: lines("fault", "free"), vars: state(page), note: `Page fault: ${page} isn't in memory, but frame ${empty + 1} is still empty, so it goes straight in. No eviction needed.` });
      return;
    }
    let victimSlot, reason, extra = {};
    const sweep = [];
    if (algo === "fifo") {
      victimSlot = argMin(frames, (p) => loadedAt.get(p));
      reason = `${frames[victimSlot]} (in memory longest, loaded at step ${loadedAt.get(frames[victimSlot]) + 1}). FIFO doesn't care how often or how recently a page is used, only how long it has been there`;
    } else if (algo === "lru") {
      victimSlot = argMin(frames, (p) => lastUsed.get(p));
      const others = frames.filter((_, k) => k !== victimSlot).map((p) => `${p} at step ${lastUsed.get(p) + 1}`).join(", ");
      reason = `${frames[victimSlot]} (least recently used, last at step ${lastUsed.get(frames[victimSlot]) + 1}; the others were used later: ${others}). The recent past predicts the near future, so the page idle longest is the best guess to drop`;
    } else if (algo === "optimal") {
      const nextUse = (p) => { const j = refs.indexOf(p, i + 1); return j === -1 ? Infinity : j; };
      const far = Math.max(...frames.map(nextUse));
      const tied = frames.map((p, k) => [p, k]).filter(([p]) => nextUse(p) === far);
      victimSlot = tied.reduce((a, b) => (loadedAt.get(b[0]) < loadedAt.get(a[0]) ? b : a))[1];
      extra = { "next use": frames.map((p) => `${p}:${nextUse(p) === Infinity ? "never" : nextUse(p) + 1}`) };
      reason = far === Infinity
        ? `${frames[victimSlot]} (never used again${tied.length > 1 ? ", and loaded earliest of those" : ""}), so evicting it can never cause a future fault`
        : `${frames[victimSlot]} (not needed again until step ${far + 1}, the furthest away of ${frames.map((p) => `${p}→${nextUse(p) + 1}`).join(", ")})`;
    } else if (algo === "lfu" || algo === "mfu") {
      const pick = algo === "lfu" ? Math.min : Math.max;
      const target = pick(...frames.map((p) => count.get(p)));
      const tied = frames.map((p, k) => [p, k]).filter(([p]) => count.get(p) === target);
      victimSlot = tied.reduce((a, b) => (loadedAt.get(b[0]) < loadedAt.get(a[0]) ? b : a))[1];
      reason = `${frames[victimSlot]} (${algo === "lfu" ? "smallest" : "largest"} count, ${target}${tied.length > 1 ? `, tied with ${tied.filter(([, k]) => k !== victimSlot).map(([p]) => p).join(", ")}, so the one loaded earliest goes` : ""}). ${algo === "lfu" ? "A page used rarely is assumed not to be needed" : "MFU's bet: a page with a big count has had its turn, while a page with a small count was probably only just brought in"}`;
    } else if (algo === "nru") {
      const lowest = Math.min(...nru.before);
      victimSlot = nru.before.indexOf(lowest);
      const inClass = frames.filter((_, k) => nru.before[k] === lowest);
      const all = frames.map((p, k) => `${p} class ${nru.before[k]}`).join(", ");
      const why = ["it hasn't been used since the last clock tick and is clean, so it can be dropped without a disk write",
        "no page is in class 0; this one hasn't been used since the last tick, so Tanenbaum's rule prefers it to any recently used page, even though it is dirty",
        "every page has been used since the last tick, and this one is at least clean, so no write-back is needed",
        "every page has been used since the last tick and written to, so there is no better choice"][lowest];
      reason = `${frames[victimSlot]} from frame ${victimSlot + 1}, the lowest non-empty class, class ${lowest} (${all})${inClass.length > 1 ? `. ${inClass.join(" and ")} share class ${lowest}, so the lowest-numbered frame goes` : ""}: ${why}`;
      extra = { "lowest class": lowest };
    } else {
      const chances = [];
      while (ref[hand] === 1) {
        sweep.push(hand);
        chances.push(frames[hand]);
        ref[hand] = 0;
        hand = (hand + 1) % frameCount;
      }
      sweep.push(hand);
      victimSlot = hand;
      reason = `${frames[victimSlot]} in frame ${victimSlot + 1}: ${chances.length === frameCount ? `every page had its reference bit set, so the hand went all the way round giving each a second chance (clearing ${chances.join(", ")} to 0) and came back to ${frames[victimSlot]}, now with bit 0. When every bit is 1, the clock behaves exactly like FIFO` : chances.length ? `the hand passed ${chances.join(", ")}, whose reference bits were 1, so each got a second chance (bit cleared to 0) before it reached a page with bit 0` : "the hand points at it and its reference bit is 0, so it hasn't been used since the hand last passed"}`;
      extra = { "second chances": chances.length ? chances : "none" };
    }
    const victim = frames[victimSlot];
    frames[victimSlot] = page;
    loadedAt.delete(victim);
    count.delete(victim);
    loadedAt.set(page, i);
    lastUsed.set(page, i);
    count.set(page, 1);
    ref[victimSlot] = 1;
    if (algo === "clock") hand = (victimSlot + 1) % frameCount;
    const dirty = M[victimSlot];
    if (algo === "nru") { R[victimSlot] = 1; M[victimSlot] = write ? 1 : 0; }
    steps.push({ page, frames: [...frames], hit: false, slot: victimSlot, victim, ref: [...ref], hand, sweep, ...nru, ...nruBits(), line: algo === "nru" ? nruLines("fault", "choose", "replace") : lines("fault", "choose", "replace"),
      vars: state(page, { victim, ...extra }), note: `${tickNote}Page fault: all ${frameCount} frames are full, so evict ${reason}. ${algo === "nru" && dirty ? `${victim} is modified, so it is written back to disk first. ` : ""}${page} takes frame ${victimSlot + 1}${algo === "nru" ? ` with R = 1, M = ${M[victimSlot]}` : ""}.` });
  });
  return { steps, faults, hits: refs.length - faults, hitRatio: (refs.length - faults) / refs.length };
}

const argMin = (arr, key) => arr.reduce((best, x, i) => (key(x) < key(arr[best]) ? i : best), 0);

// FIFO can fault more with more frames (Belady's anomaly). Compare n and n+1 frames.
export function beladyCheck(refs, frameCount) {
  const a = replace(refs, frameCount, "fifo").faults, b = replace(refs, frameCount + 1, "fifo").faults;
  return { frames: frameCount, faults: a, moreFrames: frameCount + 1, moreFaults: b, anomaly: b > a };
}

// The working-set model: WS(t, Δ) is the set of distinct pages in the last Δ
// references. Its size is how many frames the process needs right now.
export function workingSet(refs, delta) {
  if (!Number.isInteger(delta) || delta < 1 || delta > 20) throw new Error("Δ must be a whole number from 1 to 20.");
  const rows = refs.map((page, t) => {
    const window = refs.slice(Math.max(0, t - delta + 1), t + 1);
    const set = [...new Set(window)].sort((a, b) => a - b);
    return { t, page, window, set, size: set.length };
  });
  return { rows, max: Math.max(...rows.map((r) => r.size)), average: rows.reduce((s, r) => s + r.size, 0) / rows.length };
}

// Random writes for NRU: roughly a third of references write.
export const randomWrites = (r = Math.random, length = 12) => Array.from({ length }, () => r() < 0.3);

export function randomRefs(r = Math.random, length = 12 + Math.floor(r() * 4)) {
  const pages = 5 + Math.floor(r() * 3);
  const refs = [];
  for (let i = 0; i < length; i++) {
    // Some locality: often re-reference something recent, as real programs do.
    refs.push(i > 1 && r() < 0.35 ? refs[i - 1 - Math.floor(r() * Math.min(3, i))] : Math.floor(r() * pages));
  }
  return refs;
}
