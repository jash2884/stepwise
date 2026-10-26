// Page replacement simulator: FIFO, LRU and Optimal (Belady's MIN).
// Each reference becomes one step with the frame contents and the reasoning.
//
// Conventions: empty frames fill left to right. For Optimal, when several pages
// are never used again, the one loaded earliest is evicted.

export const ALGORITHMS = {
  fifo: { name: "FIFO" },
  lru: { name: "LRU (Least Recently Used)" },
  optimal: { name: "Optimal (OPT / MIN)" },
};

export function parseRefs(text) {
  const refs = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (!refs.length) throw new Error("Enter a reference string, e.g. 7 0 1 2 0 3 0 4.");
  if (refs.length > 40) throw new Error("Use at most 40 references.");
  if (refs.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) throw new Error("Pages must be whole numbers from 0 to 99.");
  return refs;
}

export function replace(refs, frameCount, algo) {
  if (!ALGORITHMS[algo]) throw new Error(`Unknown algorithm ${algo}`);
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 8) throw new Error("Frames must be between 1 and 8.");
  const frames = Array(frameCount).fill(null);
  const loadedAt = new Map(), lastUsed = new Map();
  const steps = [];
  let faults = 0;

  refs.forEach((page, i) => {
    const slot = frames.indexOf(page);
    if (slot !== -1) {
      lastUsed.set(page, i);
      steps.push({ page, frames: [...frames], hit: true, slot, victim: null, note: `Page ${page} is already in frame ${slot + 1}: a hit.` });
      return;
    }
    faults++;
    const empty = frames.indexOf(null);
    if (empty !== -1) {
      frames[empty] = page;
      loadedAt.set(page, i);
      lastUsed.set(page, i);
      steps.push({ page, frames: [...frames], hit: false, slot: empty, victim: null, note: `Page fault: ${page} goes into empty frame ${empty + 1}.` });
      return;
    }
    let victimSlot, reason;
    if (algo === "fifo") {
      victimSlot = argMin(frames, (p) => loadedAt.get(p));
      reason = `${frames[victimSlot]} (in memory longest, loaded at step ${loadedAt.get(frames[victimSlot]) + 1})`;
    } else if (algo === "lru") {
      victimSlot = argMin(frames, (p) => lastUsed.get(p));
      reason = `${frames[victimSlot]} (least recently used, at step ${lastUsed.get(frames[victimSlot]) + 1})`;
    } else {
      const nextUse = (p) => { const j = refs.indexOf(p, i + 1); return j === -1 ? Infinity : j; };
      const far = Math.max(...frames.map(nextUse));
      const tied = frames.map((p, k) => [p, k]).filter(([p]) => nextUse(p) === far);
      victimSlot = tied.reduce((a, b) => (loadedAt.get(b[0]) < loadedAt.get(a[0]) ? b : a))[1];
      reason = far === Infinity
        ? `${frames[victimSlot]} (never used again${tied.length > 1 ? ", and loaded earliest of those" : ""})`
        : `${frames[victimSlot]} (not needed again until step ${far + 1}, the furthest away)`;
    }
    const victim = frames[victimSlot];
    frames[victimSlot] = page;
    loadedAt.delete(victim);
    loadedAt.set(page, i);
    lastUsed.set(page, i);
    steps.push({ page, frames: [...frames], hit: false, slot: victimSlot, victim, note: `Page fault: evict ${reason}; ${page} takes frame ${victimSlot + 1}.` });
  });
  return { steps, faults, hits: refs.length - faults, hitRatio: (refs.length - faults) / refs.length };
}

const argMin = (arr, key) => arr.reduce((best, x, i) => (key(x) < key(arr[best]) ? i : best), 0);

// FIFO can fault more with more frames (Belady's anomaly). Compare n and n+1 frames.
export function beladyCheck(refs, frameCount) {
  const a = replace(refs, frameCount, "fifo").faults, b = replace(refs, frameCount + 1, "fifo").faults;
  return { frames: frameCount, faults: a, moreFrames: frameCount + 1, moreFaults: b, anomaly: b > a };
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
