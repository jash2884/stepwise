// Cache mapping simulator: direct-mapped, k-way set-associative and fully
// associative caches. An address splits into tag | index | offset; a reference
// trace is run one access at a time, each one a step with the pseudocode line,
// live variables and the reason for the outcome.
//
// Conventions (stated in the UI):
// - Sizes are in bytes and must be powers of two; addresses are byte addresses
//   unless the trace is given as block numbers.
// - An empty way is filled before anything is evicted (lowest way first).
// - Misses are classified the usual "three Cs" way: compulsory if the block was
//   never referenced before; otherwise capacity if a fully associative cache of
//   the same size (same policy) would also miss, else conflict.
// - Write-back uses write-allocate; write-through uses no-write-allocate unless
//   "write-through + allocate" is chosen.
// - Average access time: hierarchical (a miss goes on to the next level, so its
//   time adds) or simultaneous (all levels are looked up at once).

export const MAPPINGS = { direct: "Direct-mapped", set: "Set-associative", full: "Fully associative" };
export const POLICIES = { lru: "LRU", fifo: "FIFO" };
export const WRITES = {
  wb: "Write-back + write-allocate",
  wt: "Write-through + no-write-allocate",
  wta: "Write-through + write-allocate",
};

export const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
export const log2 = (n) => Math.round(Math.log2(n));
export const toBin = (n, bits) => (bits <= 0 ? "" : n.toString(2).padStart(bits, "0").slice(-bits));

export const CODE = [
  "split addr into tag | index | offset",
  "S ← set[index]",
  "if some way in S is valid with this tag then",
  "  hit  // update LRU order; a write sets dirty or writes through",
  "else miss  // compulsory, capacity or conflict",
  "  if S has an empty way then fill it",
  "  else victim ← LRU / FIFO way in S; write it back if dirty",
  "  load the block: tag, valid ← 1",
];

// Geometry: how many bits go to tag, index (set) and offset.
export function geometry({ addressBits = 16, blockSize = 16, cacheSize = 256, mapping = "direct", ways = 2 }) {
  for (const [k, v] of [["Block size", blockSize], ["Cache size", cacheSize]]) if (!isPow2(v)) throw new Error(`${k} must be a power of two.`);
  if (!Number.isInteger(addressBits) || addressBits < 4 || addressBits > 48) throw new Error("Address bits must be a whole number from 4 to 48.");
  if (blockSize > cacheSize) throw new Error("The block can't be bigger than the cache.");
  const lines = cacheSize / blockSize;
  if (!MAPPINGS[mapping]) throw new Error(`Unknown mapping ${mapping}`);
  const k = mapping === "direct" ? 1 : mapping === "full" ? lines : ways;
  if (!isPow2(k)) throw new Error("Associativity must be a power of two.");
  if (k > lines) throw new Error(`A ${k}-way cache needs at least ${k} lines; this one has ${lines}.`);
  const sets = lines / k;
  const offsetBits = log2(blockSize), indexBits = log2(sets);
  const tagBits = addressBits - indexBits - offsetBits;
  if (tagBits < 0) throw new Error("The cache is bigger than the whole address space.");
  return { addressBits, blockSize, cacheSize, mapping, lines, ways: k, sets, offsetBits, indexBits, tagBits };
}

// Bits of tag storage ("tag directory"): one entry per line.
export function tagDirectory(g, { valid = 1, dirty = 0, lruBits = 0 } = {}) {
  const per = g.tagBits + valid + dirty + lruBits;
  return { perLine: per, total: per * g.lines };
}

// "12 W0x1F 40" → [{ addr, write }]
export function parseTrace(text) {
  const out = [];
  for (const raw of String(text).split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([rRwW])?:?((?:0x)?[0-9a-fA-F]+)$/.exec(raw);
    if (!m) throw new Error(`Can't read "${raw}". Use numbers like 12 or 0x1C, with W in front for a write.`);
    const num = m[2].toLowerCase().startsWith("0x") ? parseInt(m[2], 16) : /^[0-9]+$/.test(m[2]) ? Number(m[2]) : NaN;
    if (!Number.isSafeInteger(num) || num < 0) throw new Error(`"${raw}" isn't a valid address. Hex needs 0x in front.`);
    out.push({ addr: num, write: (m[1] ?? "").toLowerCase() === "w" });
  }
  if (!out.length) throw new Error("Type at least one address.");
  if (out.length > 64) throw new Error("Use at most 64 references.");
  return out;
}
export const traceText = (refs) => refs.map((r) => `${r.write ? "W" : ""}${r.addr}`).join(" ");

// Run one cache (no steps), used for the shadow fully associative cache.
function makeCache(sets, ways) {
  return Array.from({ length: sets }, () => ({ ways: Array.from({ length: ways }, () => null), order: [] }));
}

function access(cache, set, tag, block, write, cfg) {
  const S = cache[set];
  const way = S.ways.findIndex((w) => w && w.tag === tag);
  if (way >= 0) {
    if (cfg.policy === "lru") { S.order = S.order.filter((x) => x !== way); S.order.push(way); }
    if (write && cfg.write === "wb") S.ways[way].dirty = true;
    return { hit: true, way };
  }
  const allocate = !write || cfg.write !== "wt";
  if (!allocate) return { hit: false, way: -1, allocated: false };
  let target = S.ways.findIndex((w) => w === null), victim = null;
  if (target < 0) {
    target = S.order.shift();
    victim = { ...S.ways[target] };
  } else S.order = S.order.filter((x) => x !== target);
  S.ways[target] = { tag, block, dirty: write && cfg.write === "wb" };
  S.order.push(target);
  return { hit: false, way: target, victim, allocated: true };
}

export function simulate(refs, cfgIn) {
  const g = geometry(cfgIn);
  const cfg = { policy: "lru", write: "wb", unit: "addr", ...cfgIn };
  if (!POLICIES[cfg.policy]) throw new Error(`Unknown replacement policy ${cfg.policy}`);
  if (!WRITES[cfg.write]) throw new Error(`Unknown write policy ${cfg.write}`);
  const maxAddr = cfg.unit === "block" ? 2 ** (g.tagBits + g.indexBits) : 2 ** g.addressBits;
  for (const r of refs) if (r.addr >= maxAddr) throw new Error(`${cfg.unit === "block" ? "Block" : "Address"} ${r.addr} doesn't fit in ${cfg.unit === "block" ? `${g.tagBits + g.indexBits} block-number bits` : `${g.addressBits} bits`}.`);

  const cache = makeCache(g.sets, g.ways), shadow = makeCache(1, g.lines);
  const seen = new Set();
  const steps = [];
  let hits = 0, misses = 0, memReads = 0, memWrites = 0, writeBacks = 0;
  const kinds = { compulsory: 0, capacity: 0, conflict: 0 };
  const snap = () => cache.map((S) => S.ways.map((w, i) => (w ? { ...w, rank: S.order.indexOf(i) } : null)));
  const vars = (extra = {}) => ({ ...extra, hits, misses, ...(cfg.write === "wb" ? { writeBacks } : { memWrites }) });

  steps.push({ i: -1, sets: snap(), line: [], vars: vars(), note: `Empty cache: ${g.lines} line${g.lines === 1 ? "" : "s"} in ${g.sets} set${g.sets === 1 ? "" : "s"} of ${g.ways} way${g.ways === 1 ? "" : "s"}. Every valid bit is 0, so the first touch of each block must miss.` });

  refs.forEach((r, i) => {
    const block = cfg.unit === "block" ? r.addr : Math.floor(r.addr / g.blockSize);
    const offset = cfg.unit === "block" ? null : r.addr % g.blockSize;
    const set = block % g.sets, tag = Math.floor(block / g.sets);
    const res = access(cache, set, tag, block, r.write, cfg);
    const sh = access(shadow, 0, block, block, r.write, cfg);
    let kind = null;
    if (res.hit) hits++;
    else {
      misses++;
      kind = !seen.has(block) ? "compulsory" : sh.hit ? "conflict" : "capacity";
      kinds[kind]++;
      if (res.allocated) memReads++;
    }
    seen.add(block);
    if (r.write && cfg.write !== "wb") memWrites++;
    if (res.victim?.dirty) writeBacks++;

    const where = g.mapping === "full" ? "the only set" : `set ${set}`;
    const what = r.write ? "Write" : "Read";
    const label = cfg.unit === "block" ? `block ${block}` : `address ${r.addr} (block ${block})`;
    let note;
    if (res.hit) note = `${what} ${label}: tag ${tag} is already in ${where}, way ${res.way}. Hit.${r.write ? (cfg.write === "wb" ? " The line is marked dirty; memory is updated only when it is evicted." : " Write-through: memory is written too.") : ""}`;
    else {
      const why = { compulsory: "Compulsory miss: this block has never been loaded.", capacity: "Capacity miss: even a fully associative cache this size would have thrown it out.", conflict: `Conflict miss: it was evicted only because too many blocks map to ${where}.` }[kind];
      if (!res.allocated) note = `${what} ${label}: miss. ${why} No-write-allocate: the word goes straight to memory and the cache is left alone.`;
      else if (res.victim) note = `${what} ${label}: miss. ${why} ${where[0].toUpperCase()}${where.slice(1)} is full, so ${POLICIES[cfg.policy]} evicts block ${res.victim.block} from way ${res.way}${res.victim.dirty ? ", which is dirty and is written back first" : ""}.`;
      else note = `${what} ${label}: miss. ${why} It goes into empty way ${res.way} of ${where}.`;
    }
    const line = res.hit ? [1, 2, 3, 4] : res.victim ? [1, 2, 5, 7, 8] : res.allocated ? [1, 2, 5, 6, 8] : [1, 2, 5];
    steps.push({
      i, addr: r.addr, write: r.write, block, tag, set, offset, hit: res.hit, kind, way: res.way, victim: res.victim ?? null, allocated: res.allocated ?? true,
      sets: snap(), line, note,
      vars: vars({ ...(cfg.unit === "block" ? {} : { addr: r.addr }), block, tag, index: g.indexBits ? set : "none (one set)", ...(offset != null ? { offset } : {}), result: res.hit ? "hit" : `${kind} miss` }),
    });
  });

  const n = refs.length;
  const dirtyAtEnd = cache.flatMap((S) => S.ways).filter((w) => w?.dirty).length;
  steps[steps.length - 1].final = true;
  return { geometry: g, cfg, steps, hits, misses, kinds, hitRatio: hits / n, missRatio: misses / n, memReads, memWrites, writeBacks, dirtyAtEnd, refs: n };
}

// Average memory access time. levels: [{ t, h }] with h the local hit ratio
// (0..1); mem: main memory time. Returns the value and the working.
export function amat(levels, mem, mode = "hier") {
  if (!levels.length) throw new Error("Add at least one cache level.");
  for (const l of levels) {
    if (!(l.t >= 0) || !(l.h >= 0 && l.h <= 1)) throw new Error("Each level needs a time ≥ 0 and a hit ratio from 0 to 1.");
  }
  if (!(mem >= 0)) throw new Error("Memory time must be 0 or more.");
  const r = (x) => Math.round(x * 1e6) / 1e6;
  if (mode === "hier") {
    // T = t1 + m1 (t2 + m2 (… + tm))
    let value = mem, expr = `${mem}`;
    for (let k = levels.length - 1; k >= 0; k--) {
      const { t, h } = levels[k];
      value = t + (1 - h) * value;
      expr = `${t} + ${r(1 - h)} × (${expr})`;
    }
    return { value: r(value), formula: "T = t1 + (1 − h1)(t2 + (1 − h2)(… + memory))", working: expr };
  }
  if (mode !== "simul") throw new Error(`Unknown mode ${mode}`);
  let value = 0, reach = 1;
  const terms = [];
  levels.forEach(({ t, h }) => { value += reach * h * t; terms.push(`${r(reach * h)} × ${t}`); reach *= 1 - h; });
  value += reach * mem;
  terms.push(`${r(reach)} × ${mem}`);
  return { value: r(value), formula: "T = h1·t1 + (1 − h1)h2·t2 + … + (1 − h1)(1 − h2)…·memory", working: terms.join(" + ") };
}

// Random set-up for practice and GATE questions.
export function randomConfig(r = Math.random) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const mapping = pick(["direct", "set", "set", "full"]);
  const blockSize = pick([4, 8, 16, 32, 64]);
  const lines = pick([4, 8, 16]);
  const ways = mapping === "set" ? pick([2, 4].filter((k) => k < lines)) : 1;
  return { addressBits: pick([12, 16, 20, 32]), blockSize, cacheSize: blockSize * lines, mapping, ways, policy: "lru", write: "wb", unit: "block" };
}
export function randomBlocks(r = Math.random, n = 10, max = 16) {
  // A few hot blocks so there are hits worth counting.
  const hot = Array.from({ length: 4 }, () => Math.floor(r() * max));
  return Array.from({ length: n }, () => ({ addr: r() < 0.6 ? hot[Math.floor(r() * hot.length)] : Math.floor(r() * max), write: false }));
}

export const EXAMPLES = {
  sa2: { name: "2-way set-associative, LRU (Hennessy & Patterson)", cfg: { mapping: "set", ways: 2, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb" }, trace: "0 8 0 6 8" },
  dm: { name: "Direct-mapped: the same trace, more misses", cfg: { mapping: "direct", ways: 1, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb" }, trace: "0 8 0 6 8" },
  fa: { name: "Fully associative: the same trace, fewest misses", cfg: { mapping: "full", ways: 4, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb" }, trace: "0 8 0 6 8" },
  bytes: { name: "Byte addresses, 16-byte blocks, 4 lines", cfg: { mapping: "direct", ways: 1, addressBits: 16, blockSize: 16, cacheSize: 64, unit: "addr", policy: "lru", write: "wb" }, trace: "0 4 W16 132 64 W8 128 200 20 0" },
  writes: { name: "Write-back vs write-through", cfg: { mapping: "set", ways: 2, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: "lru", write: "wb" }, trace: "W1 W3 1 5 W7 3 9 W1 5" },
};

// Shareable URL state, shared by the view, GATE replays and tests.
export const DEFAULT = { cfg: { ...EXAMPLES.sa2.cfg }, trace: EXAMPLES.sa2.trace, amat: { levels: [{ t: 1, h: 0.9 }, { t: 10, h: 0.8 }], mem: 100, mode: "hier" } };
export function toParams({ cfg, trace, amat: a }) {
  const out = { map: cfg.mapping, k: cfg.ways, ab: cfg.addressBits, bs: cfg.blockSize, cs: cfg.cacheSize, u: cfg.unit, rp: cfg.policy, wp: cfg.write, t: trace };
  if (a) Object.assign(out, { lv: a.levels.map((l) => `${l.t}:${l.h}`).join(","), tm: a.mem, am: a.mode });
  return out;
}
export function fromParams(q) {
  const num = (k, d) => (q.get(k) != null && q.get(k) !== "" && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const D = DEFAULT;
  const cfg = {
    mapping: MAPPINGS[q.get("map")] ? q.get("map") : D.cfg.mapping, ways: num("k", D.cfg.ways), addressBits: num("ab", D.cfg.addressBits),
    blockSize: num("bs", D.cfg.blockSize), cacheSize: num("cs", D.cfg.cacheSize), unit: q.get("u") === "addr" ? "addr" : q.get("u") === "block" ? "block" : D.cfg.unit,
    policy: POLICIES[q.get("rp")] ? q.get("rp") : D.cfg.policy, write: WRITES[q.get("wp")] ? q.get("wp") : D.cfg.write,
  };
  let levels = D.amat.levels;
  if (q.get("lv")) {
    const parsed = q.get("lv").split(",").map((s) => s.split(":").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([t, h]) => ({ t, h }));
    if (parsed.length) levels = parsed.slice(0, 3);
  }
  return { cfg, trace: q.get("t") ?? D.trace, amat: { levels, mem: num("tm", D.amat.mem), mode: q.get("am") === "simul" ? "simul" : "hier" } };
}
