// Hashing: a static table with chaining or open addressing, and extendible
// hashing as used for database indexes.
//
// Static table: h(k) = k mod m.
//   linear:    (h(k) + i) mod m
//   quadratic: (h(k) + i²) mod m
//   double:    (h(k) + i·h2(k)) mod m, with h2(k) = R − (k mod R), R the largest prime < m
// Extendible hashing uses the LOWEST bits of k (its binary form).

export const STRATEGIES = {
  chaining: { name: "Separate chaining" },
  linear: { name: "Linear probing" },
  quadratic: { name: "Quadratic probing" },
  double: { name: "Double hashing" },
};

const PROBE = {
  linear: "slot ← (h + i) mod m",
  quadratic: "slot ← (h + i²) mod m",
  double: "slot ← (h + i·h2(k)) mod m  // h2(k) = R − (k mod R)",
};
export const CODE = {
  chaining: [
    "insert(k):",
    "  h ← k mod m",
    "  append k to the chain at T[h]  // colliding keys share a list",
  ],
  ...Object.fromEntries(Object.entries(PROBE).map(([id, probe]) => [id, [
    "insert(k):",
    "  h ← k mod m",
    "  for i ← 0, 1, 2, …, m−1",
    `    ${probe}`,
    "    if T[slot] is empty then T[slot] ← k; done",
    "    collision: T[slot] is taken, try the next i",
    "  no free slot on this probe sequence: insertion fails",
  ]])),
  extendible: [
    "insert(k):",
    "  i ← last g bits of k  // g = global depth",
    "  B ← the bucket directory entry i points to",
    "  if B has room then put k in B; done",
    "  if local depth of B = g then double the directory; g ← g + 1",
    "  else split B on its next bit; local depths + 1; repoint entries",
    "  try again from line 2",
  ],
};

const isPrime = (n) => n > 1 && Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, i) => i + 2).every((d) => n % d);
export const largestPrimeBelow = (m) => { for (let p = m - 1; p > 1; p--) if (isPrime(p)) return p; return 1; };
const mod = (a, m) => ((a % m) + m) % m;

export function parseKeys(text, max = 30) {
  const keys = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (!keys.length) throw new Error("Enter some keys, e.g. 89 18 49 58 69.");
  if (keys.some((k) => !Number.isInteger(k) || k < 0 || k > 99999)) throw new Error("Keys must be whole numbers from 0 to 99999.");
  if (keys.length > max) throw new Error(`Use at most ${max} keys.`);
  return keys;
}

export function hashTable(keys, m, strategy) {
  if (!STRATEGIES[strategy]) throw new Error(`Unknown strategy ${strategy}`);
  if (!Number.isInteger(m) || m < 2 || m > 31) throw new Error("Table size must be between 2 and 31.");
  const R = largestPrimeBelow(m);
  const table = strategy === "chaining" ? Array.from({ length: m }, () => []) : Array(m).fill(null);
  const steps = [], trace = [];
  let collisions = 0;
  const snapT = () => (strategy === "chaining" ? table.map((c) => [...c]) : [...table]);
  for (const k of keys) {
    const h = k % m;
    const formula = `h(${k}) = ${k} mod ${m} = ${h}`;
    trace.push({ key: k, probes: [], slot: null, table: snapT(), line: 2, vars: { k, m, h }, note: `Insert ${k}: ${formula}.${strategy === "double" ? ` The step size is h2(${k}) = ${R} − (${k} mod ${R}) = ${R - (k % R)}.` : ""}` });
    if (strategy === "chaining") {
      const hadItems = table[h].length > 0;
      if (hadItems) collisions++;
      table[h].push(k);
      trace.push({ key: k, probes: [h], slot: h, table: snapT(), line: 3, vars: { k, h, chain: table[h], collisions }, note: hadItems ? `Slot ${h} already holds ${table[h].slice(0, -1).join(", ")}: a collision, but chaining just appends ${k} to that slot's list. A search for ${k} will scan the chain.` : `Slot ${h} is empty, so ${k} starts a chain there.` });
      steps.push({ key: k, probes: [h], slot: h, table: table.map((c) => [...c]), note: `${formula}. ${hadItems ? `Slot ${h} already holds ${table[h].slice(0, -1).join(", ")}, so ${k} joins its chain.` : `Slot ${h} is empty: ${k} starts a chain there.`}` });
      continue;
    }
    if (table.includes(k)) { steps.push({ key: k, probes: [], slot: table.indexOf(k), table: [...table], note: `${k} is already in the table.` }); trace.push({ key: k, probes: [], slot: table.indexOf(k), table: snapT(), line: 1, vars: { k }, note: `${k} is already in the table, so it isn't inserted twice.` }); continue; }
    const h2 = R - (k % R);
    const probes = [];
    let placed = null;
    for (let i = 0; i < m; i++) {
      const slot = strategy === "linear" ? mod(h + i, m) : strategy === "quadratic" ? mod(h + i * i, m) : mod(h + i * h2, m);
      probes.push(slot);
      const how = strategy === "linear" ? `(${h} + ${i}) mod ${m}` : strategy === "quadratic" ? `(${h} + ${i}²) mod ${m}` : `(${h} + ${i}·${h2}) mod ${m}`;
      const vars = { k, h, i, slot, ...(strategy === "double" ? { h2 } : {}), "T[slot]": table[slot], collisions };
      if (table[slot] === null) {
        placed = slot;
        table[slot] = k;
        trace.push({ key: k, probes: [...probes], slot, table: snapT(), line: [4, 5], vars, note: `Probe ${i}: slot ${how} = ${slot} is empty, so ${k} goes there${i ? ` after ${i} collision${i > 1 ? "s" : ""}` : ""}.` });
        table[slot] = null;
        break;
      }
      collisions++;
      trace.push({ key: k, probes: [...probes], slot: null, table: snapT(), line: [4, 6], vars: { ...vars, collisions }, note: `Probe ${i}: slot ${how} = ${slot} holds ${table[slot]}: a collision.${strategy === "linear" && i >= 1 ? " Linear probing walks along a run of full slots: that's primary clustering." : strategy === "quadratic" ? ` Next jump: +${(i + 1) ** 2} from h.` : strategy === "double" ? ` Next jump: +${h2} again (each key has its own step size).` : ""}` });
    }
    const how = strategy === "double" ? `${formula}, h2(${k}) = ${R} − (${k} mod ${R}) = ${h2}` : formula;
    if (placed === null) {
      trace.push({ key: k, probes: [...probes], slot: null, failed: true, table: snapT(), line: 7, vars: { k, h, probes: probes.length }, note: `Every probe position is taken${strategy === "quadratic" ? " (quadratic probing only reaches about half the slots, so it can fail even with free slots)" : ""}: ${k} can't be inserted.` });
      steps.push({ key: k, probes, slot: null, failed: true, table: [...table], note: `${how}. Probed ${probes.join(" → ")} and found no free slot${strategy === "quadratic" ? " (quadratic probing can miss free slots when the table is over half full)" : ""}: insertion fails.` });
      continue;
    }
    table[placed] = k;
    steps.push({
      key: k, probes, slot: placed, table: [...table],
      note: probes.length === 1 ? `${how}. Slot ${placed} is free, so ${k} goes there.` : `${how}. Slots ${probes.slice(0, -1).join(", ")} are taken (${probes.length - 1} collision${probes.length > 2 ? "s" : ""}); ${k} lands in slot ${placed}.`,
    });
  }
  const filled = strategy === "chaining" ? keys.length : table.filter((x) => x !== null).length;
  return { table, steps, trace, collisions, loadFactor: filled / m, R };
}

// --- Extendible hashing ----------------------------------------------------

const bits = (n, d) => (d ? mod(n, 2 ** d).toString(2).padStart(d, "0") : "");

export function extendible(keys, bucketSize) {
  if (!Number.isInteger(bucketSize) || bucketSize < 1 || bucketSize > 4) throw new Error("Bucket size must be between 1 and 4.");
  let global = 0;
  let nextId = 1;
  const buckets = new Map([[0, { id: 0, local: 0, keys: [] }]]);
  let dir = [0];
  const steps = [];
  const snap = (note, extra = {}) => steps.push({
    note, global, dir: [...dir],
    buckets: [...buckets.values()].map((b) => ({ ...b, keys: [...b.keys] })),
    ...extra,
  });

  for (const k of keys) {
    if ([...buckets.values()].some((b) => b.keys.includes(k))) { snap(`${k} is already stored.`, { key: k, line: 1, vars: { k } }); continue; }
    let guard = 0;
    for (;;) {
      if (++guard > 40) throw new Error(`Too many splits while inserting ${k}.`);
      const idx = mod(k, 2 ** global), bucket = buckets.get(dir[idx]);
      const where = global ? `The last ${global} bit${global > 1 ? "s" : ""} of ${k} (${k.toString(2)}₂) are ${bits(k, global)}, so look in directory entry ${bits(k, global)}` : "Global depth is 0, so every key goes to the one bucket";
      if (bucket.keys.length < bucketSize) {
        bucket.keys.push(k);
        snap(`${where}: bucket B${bucket.id} has room (${bucket.keys.length - 1} of ${bucketSize} used); insert ${k}.`, { key: k, bucket: bucket.id, line: [2, 3, 4], vars: { k, g: global, i: bits(k, global) || "·", B: `B${bucket.id}`, "local depth": bucket.local, keys: bucket.keys } });
        break;
      }
      if (bucket.local === global) {
        // Keep the directory readable: 64 entries is plenty for teaching.
        if (global >= 6) throw new Error(`Inserting ${k} would need a directory of more than 64 entries: too many keys share their last 6 bits. Use different keys or a bigger bucket size.`);
        dir = [...dir, ...dir];
        global++;
        snap(`${where}: bucket B${bucket.id} is full and its local depth equals the global depth, so only one directory entry points to it and there's no spare bit to split on. DOUBLE the directory (global depth ${global}): each new entry points to the same bucket as its twin, so nothing moves yet.`, { key: k, bucket: bucket.id, doubled: true, line: [2, 3, 5], vars: { k, g: global, B: `B${bucket.id}`, "local depth": bucket.local, entries: dir.length } });
        continue;
      }
      // Split the bucket on its next bit.
      const bit = bucket.local;
      bucket.local++;
      const sibling = { id: nextId++, local: bucket.local, keys: [] };
      buckets.set(sibling.id, sibling);
      const all = bucket.keys;
      bucket.keys = all.filter((x) => !((x >> bit) & 1));
      sibling.keys = all.filter((x) => (x >> bit) & 1);
      dir = dir.map((b, i) => (b === bucket.id && ((i >> bit) & 1) ? sibling.id : b));
      snap(`${where}: bucket B${bucket.id} is full but its local depth was below the global depth, so several directory entries share it and it can SPLIT on bit ${bit}: keys with that bit 1 (${sibling.keys.join(", ") || "none"}) move to new bucket B${sibling.id}; both now have local depth ${bucket.local}.`, { key: k, bucket: bucket.id, split: sibling.id, line: [6, 7], vars: { k, g: global, B: `B${bucket.id}`, new: `B${sibling.id}`, bit, "local depth": bucket.local, stay: bucket.keys, move: sibling.keys } });
    }
  }
  return { steps, global, dir, buckets: [...buckets.values()] };
}

export { bits };

export const EXAMPLE = { keys: "89 18 49 58 69", m: 10 };
export const EXTENDIBLE_EXAMPLE = { keys: "16 4 6 22 24 10 31 7 9 20 26", size: 2 };

export function randomKeys(r = Math.random, n = 6 + Math.floor(r() * 3), max = 99) {
  const out = new Set();
  while (out.size < n) out.add(Math.floor(r() * max));
  return [...out];
}
