// File systems: the Unix inode (direct, single, double and triple indirect
// pointers), and contiguous, linked and indexed allocation compared.
//
// Conventions (stated in the UI):
// - k = block size ÷ pointer size pointers fit in one index block.
// - The inode is already in memory (it was read when the file was opened), so
//   it costs no disk access unless you ask for it to be counted.
// - Block accesses count every index block read on the way plus the data block.
// - Offsets and logical block numbers start at 0.
// - Linked allocation keeps the next-block pointer inside each data block, so a
//   block holds B − p bytes of data. Indexed allocation uses as many levels of
//   index blocks as the file needs.
// Sizes can pass 2^53 (64 KB blocks, 2-byte pointers), so totals use BigInt.

export const INODE_CODE = [
  "k ← B / p  // pointers in one index block",
  "max ← (d + s·k + dd·k² + t·k³) × B  // bytes",
  "n ← ⌊x / B⌋; r ← x mod B  // logical block, byte inside it",
  "if n < d then ptr ← direct[n]; reads ← 1",
  "n ← n − d; if n < s·k then read single[⌊n/k⌋]; ptr ← its entry n mod k",
  "n ← n − s·k; if n < dd·k² then read double, then one level-2 index block",
  "n ← n − dd·k²; read triple, then two more index blocks",
  "read the data block ptr; the byte is at r",
];

export const LEVELS = [
  { id: "direct", name: "Direct", depth: 0 },
  { id: "single", name: "Single indirect", depth: 1 },
  { id: "double", name: "Double indirect", depth: 2 },
  { id: "triple", name: "Triple indirect", depth: 3 },
];

export const BLOCK_SIZES = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
export const POINTER_SIZES = [2, 3, 4, 6, 8];

const big = BigInt;
const UNITS = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB"];

// 4398046511104n → "4 TB"; 4299210752n → "4.0 GB" style: binary units (1 KB = 1024 bytes).
export function human(bytes, digits = 2) {
  let b = typeof bytes === "bigint" ? bytes : big(Math.round(bytes));
  let u = 0, scale = 1n;
  while (u < UNITS.length - 1 && b >= scale * 1024n) { scale *= 1024n; u++; }
  if (u === 0) return `${b} bytes`;
  const whole = b / scale, rem = b % scale;
  if (rem === 0n) return `${whole} ${UNITS[u]}`;
  const value = Number(whole) + Number(rem) / Number(scale);
  return `${value.toFixed(digits)} ${UNITS[u]}`;
}
export const commas = (n) => (typeof n === "bigint" ? n : big(n)).toLocaleString("en-GB");

function check({ B, p, d, s, dd, t }) {
  if (!BLOCK_SIZES.includes(B)) throw new Error(`Block size must be a power of two from 128 to 65,536 bytes.`);
  if (!POINTER_SIZES.includes(p)) throw new Error("Pointer size must be 2, 3, 4, 6 or 8 bytes.");
  if (!Number.isInteger(d) || d < 0 || d > 64) throw new Error("Direct pointers must be a whole number from 0 to 64.");
  for (const [v, name] of [[s, "Single"], [dd, "Double"], [t, "Triple"]]) if (!Number.isInteger(v) || v < 0 || v > 4) throw new Error(`${name} indirect pointers must be 0 to 4.`);
  if (d + s + dd + t === 0) throw new Error("The inode needs at least one pointer.");
}

// Block counts each region of the inode can reach.
export function inodeCapacity(opts) {
  const { B, p, d, s, dd, t } = opts;
  check(opts);
  const k = Math.floor(B / p), K = big(k);
  const regions = [
    { ...LEVELS[0], pointers: d, blocks: big(d) },
    { ...LEVELS[1], pointers: s, blocks: big(s) * K },
    { ...LEVELS[2], pointers: dd, blocks: big(dd) * K * K },
    { ...LEVELS[3], pointers: t, blocks: big(t) * K * K * K },
  ];
  let start = 0n;
  for (const r of regions) { r.first = start; r.bytes = r.blocks * big(B); start += r.blocks; }
  const maxBlocks = start, maxBytes = maxBlocks * big(B);
  // A p-byte pointer can name only 2^(8p) blocks, which caps the disk itself.
  const diskBlocks = 1n << big(8 * p), diskBytes = diskBlocks * big(B);
  return { k, regions, maxBlocks, maxBytes, diskBlocks, diskBytes };
}

// Where byte x lives: which pointer region, which index entries, how many reads.
export function locate(opts) {
  const { B, p, d, s, dd, t, x, countInode = false } = { d: 12, s: 1, dd: 1, t: 1, countInode: false, ...opts };
  const o = { B, p, d, s, dd, t };
  const cap = inodeCapacity(o);
  const { k, regions, maxBytes, maxBlocks } = cap;
  if (!(typeof x === "bigint" || Number.isSafeInteger(x)) || x < 0) throw new Error("Byte offset must be a whole number, 0 or more.");
  const X = big(x);
  if (X >= maxBytes) throw new Error(`Byte offset must be below the maximum file size, ${commas(maxBytes)} bytes.`);
  const K = big(k), n = X / big(B), r = Number(X % big(B));
  const extra = countInode ? 1 : 0;
  const steps = [];
  const varsBase = { B, p };

  steps.push({ line: 1, region: null, path: [], vars: { ...varsBase, k }, note: `One index block of ${B} bytes holds ${B} ÷ ${p} = ${k} pointers of ${p} bytes each.` });
  const parts = regions.filter((g) => g.pointers).map((g) => `${g.name.toLowerCase()} ${commas(g.blocks)}`);
  steps.push({ line: 2, region: null, path: [], vars: { k, "max blocks": commas(maxBlocks), "max size": human(maxBytes) },
    note: `Blocks reachable: ${parts.join(" + ")} = ${commas(maxBlocks)}. Times ${B} bytes each: ${commas(maxBytes)} bytes, about ${human(maxBytes)}.${cap.diskBytes < maxBytes ? ` But ${p}-byte pointers can only name 2^${8 * p} blocks, so the disk itself holds at most ${human(cap.diskBytes)}: that is the real limit.` : ""}` });
  steps.push({ line: 3, region: null, path: [], vars: { x: commas(X), n: commas(n), r }, note: `Byte ${commas(X)} is in logical block ⌊${commas(X)} ÷ ${B}⌋ = ${commas(n)}, at byte ${r} inside it.` });

  let rest = n, region = null, path = [];
  for (const g of regions) {
    if (rest < g.blocks) { region = g; break; }
    rest -= g.blocks;
  }
  const line = 4 + region.depth;
  // Which top-level pointer, then the entry at each level down.
  const per = K ** big(region.depth); // blocks under one top-level pointer
  const top = region.depth === 0 ? rest : rest / per;
  path = [Number(top)];
  let within = region.depth === 0 ? 0n : rest % per;
  for (let lvl = region.depth - 1; lvl >= 0; lvl--) {
    const span = K ** big(lvl);
    path.push(Number(within / span));
    within %= span;
  }
  const reads = region.depth + 1 + extra;
  const skipped = regions.slice(0, regions.indexOf(region)).filter((g) => g.pointers);
  const skipNote = skipped.length ? `Skip the ${skipped.map((g) => `${commas(g.blocks)} ${g.name.toLowerCase()} block${g.blocks === 1n ? "" : "s"}`).join(" and ")}: ${commas(n)} − ${commas(region.first)} = ${commas(rest)}. ` : "";
  const idxName = (lvl) => ["", "single", "double", "triple"][lvl];
  let note;
  if (region.depth === 0) note = `${commas(n)} < ${d}, so direct pointer ${path[0]} in the inode points straight at the data block. No index block is needed.`;
  else {
    const chain = path.slice(1).map((e, i) => `entry ${e} of a level-${i + 1} index block`).join(", then ");
    note = `${skipNote}${commas(rest)} < ${commas(region.blocks)}, so it is under the ${idxName(region.depth)} indirect pointer${region.pointers > 1 ? ` number ${path[0]}` : ""}. Follow ${chain}: ${region.depth} index block${region.depth > 1 ? "s" : ""} read on the way.`;
  }
  steps.push({ line, region: region.id, path, vars: { n: commas(rest), k, level: region.name, entries: path.slice(1).join(" → ") || "none" }, note });
  steps.push({ line: 8, region: region.id, path, done: true, vars: { reads, "index blocks": region.depth, inode: countInode ? "counted" : "in memory" },
    note: `Read the data block and take byte ${r}. Disk reads: ${countInode ? "1 (inode) + " : ""}${region.depth ? `${region.depth} (index) + ` : ""}1 (data) = ${reads}.` });

  return { ...cap, B, p, d, s, dd, t, x: X, n, r, region: region.id, depth: region.depth, path, reads, steps };
}

// Index blocks needed to hold a file of `size` bytes in this inode.
export function indexBlocks(opts, size) {
  const { k, regions } = inodeCapacity(opts);
  const K = big(k);
  let left = (big(size) + big(opts.B) - 1n) / big(opts.B), total = 0n;
  for (const g of regions) {
    if (left <= 0n || !g.pointers) continue;
    const used = left < g.blocks ? left : g.blocks;
    left -= used;
    // Index blocks at each level below the inode for `used` data blocks.
    let need = used;
    for (let lvl = 0; lvl < g.depth; lvl++) { need = (need + K - 1n) / K; total += need; }
  }
  if (left > 0n) throw new Error("The file is bigger than the inode can address.");
  return total;
}

// Contiguous, linked and indexed allocation for one file and one byte offset.
export function allocation({ B, p, size, x }) {
  if (!BLOCK_SIZES.includes(B)) throw new Error("Block size must be a power of two from 128 to 65,536 bytes.");
  if (!POINTER_SIZES.includes(p)) throw new Error("Pointer size must be 2, 3, 4, 6 or 8 bytes.");
  if (!Number.isInteger(size) || size < 1 || size > 1e12) throw new Error("File size must be a whole number of bytes from 1 to 10^12.");
  if (!Number.isInteger(x) || x < 0 || x >= size) throw new Error("The byte offset must be inside the file.");
  const k = Math.floor(B / p);
  const blocks = Math.ceil(size / B);
  // Linked: each block gives p bytes to the next pointer.
  const linkedData = B - p, linkedBlocks = Math.ceil(size / linkedData), linkedN = Math.floor(x / linkedData);
  // Indexed: as many levels of index blocks as it takes to point at every block.
  let levels = 1, reach = k;
  while (reach < blocks) { reach *= k; levels++; }
  let idx = 0, need = blocks;
  for (let l = 0; l < levels; l++) { need = Math.ceil(need / k); idx += need; }
  const n = Math.floor(x / B);
  const c = (v) => v.toLocaleString("en-GB");
  return {
    k, blocks,
    rows: [
      { id: "contiguous", name: "Contiguous", blocks, overhead: 0, reads: 1, block: n,
        why: `Block ${c(n)} is at start + ${c(n)}, worked out without reading anything else.`,
        good: "Fastest sequential and random access", bad: "External fragmentation; hard to grow a file" },
      { id: "linked", name: "Linked", blocks: linkedBlocks, overhead: linkedBlocks * p, reads: linkedN + 1, block: linkedN,
        why: `Each block holds ${c(linkedData)} data bytes, so byte ${c(x)} is in block ${c(linkedN)}; reaching it means following ${c(linkedN)} pointer${linkedN === 1 ? "" : "s"} from the start.`,
        good: "No external fragmentation; easy to grow", bad: "Random access walks the chain; one bad pointer loses the rest" },
      { id: "indexed", name: "Indexed", blocks: blocks + idx, overhead: idx * B, reads: levels + 1, block: n,
        why: `${c(blocks)} blocks need ${levels} level${levels > 1 ? "s" : ""} of index (one block holds ${c(k)} pointers): ${levels} index read${levels > 1 ? "s" : ""} + 1 data read.`,
        good: "Direct access to any block; no external fragmentation", bad: "Whole index blocks wasted on small files" },
    ],
  };
}
