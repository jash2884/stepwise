// Page replacement simulator: FIFO, LRU, Optimal (Belady's MIN), LFU, MFU and
// Second Chance (the clock algorithm), plus the working-set model.
// Each reference becomes one step with the frame contents, the reasoning, the
// pseudocode line being executed and the variables at that moment.
//
// Conventions: empty frames fill left to right. For Optimal, when several pages
// are never used again, the one loaded earliest is evicted. LFU/MFU count
// references only while a page is in memory (an evicted page starts again at 1)
// and break ties by evicting the page loaded earliest. Clock: a page's reference
// bit is set to 1 when it is loaded and on every hit; the hand starts at frame 1
// and moves to the frame after each page it loads.

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
};

export function parseRefs(text) {
  const refs = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (!refs.length) throw new Error("Enter a reference string, e.g. 7 0 1 2 0 3 0 4.");
  if (refs.length > 40) throw new Error("Use at most 40 references.");
  if (refs.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) throw new Error("Pages must be whole numbers from 0 to 99.");
  return refs;
}

const list = (m, frames) => frames.filter((p) => p !== null).map((p) => `${p}:${m.get(p)}`);

export function replace(refs, frameCount, algo) {
  const spec = ALGORITHMS[algo];
  if (!spec) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 8) throw new Error("Frames must be between 1 and 8.");
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
    return { ...v, ...extra };
  };

  refs.forEach((page, i) => {
    const slot = frames.indexOf(page);
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
    steps.push({ page, frames: [...frames], hit: false, slot: victimSlot, victim, ref: [...ref], hand, sweep, line: lines("fault", "choose", "replace"), vars: state(page, { victim, ...extra }), note: `Page fault: all ${frameCount} frames are full, so evict ${reason}. ${page} takes frame ${victimSlot + 1}.` });
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

export function randomRefs(r = Math.random, length = 12 + Math.floor(r() * 4)) {
  const pages = 5 + Math.floor(r() * 3);
  const refs = [];
  for (let i = 0; i < length; i++) {
    // Some locality: often re-reference something recent, as real programs do.
    refs.push(i > 1 && r() < 0.35 ? refs[i - 1 - Math.floor(r() * Math.min(3, i))] : Math.floor(r() * pages));
  }
  return refs;
}
