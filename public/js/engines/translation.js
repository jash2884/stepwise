// Address translation: how the MMU turns a logical address into a physical one.
// Three schemes, each recorded step by step with the pseudocode line, the
// variables at that moment and the reasoning:
//   - paging with a TLB in front of a single-level page table,
//   - multilevel (hierarchical) page tables,
//   - segmentation with base and limit registers.
//
// Conventions (stated in the UI):
// - The TLB is fully associative. tlb[0] is always the next victim: FIFO keeps
//   load order; LRU moves an entry to the back whenever it is used.
// - A page fault traps to the OS; the faulting access isn't retried here and
//   nothing is put in the TLB.
// - Segmentation: an offset must be strictly less than the limit.

export const MODES = {
  paging: {
    name: "Paging with a TLB",
    code: [
      "p ← addr div pageSize; d ← addr mod pageSize  // split the bits",
      "if TLB has an entry for p then",
      "  f ← TLB[p]  // TLB hit: no page-table access",
      "else  // TLB miss",
      "  if pageTable[p] is invalid then trap: page fault",
      "  f ← pageTable[p].frame  // one extra memory access",
      "  if TLB is full then evict a victim (FIFO / LRU)",
      "  TLB[p] ← f",
      "physical ← f × pageSize + d",
    ],
  },
  multilevel: {
    name: "Multilevel page table",
    code: [
      "split addr into p1 | p2 | … | d",
      "table ← outer page table  // its address is in the PTBR",
      "for each level i ← 1 … L",
      "  entry ← table[pᵢ]  // one memory access per level",
      "  if entry is invalid then trap: page fault",
      "  table ← entry  // the next table, or the frame at the last level",
      "physical ← frame × 2^(offset bits) + d",
      "read memory[physical]  // the access we wanted all along",
    ],
  },
  segmentation: {
    name: "Segmentation",
    code: [
      "(s, d) ← logical address  // segment number, offset",
      "if s ≥ number of segments then trap: invalid segment",
      "if d ≥ limit[s] then trap: addressing error",
      "physical ← base[s] + d",
    ],
  },
};

export const POLICIES = { fifo: "FIFO", lru: "LRU" };

export const toBin = (n, width) => n.toString(2).padStart(width, "0");
const hex = (n) => `0x${n.toString(16).toUpperCase()}`;
const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
export const log2 = (n) => Math.round(Math.log2(n));
const plural = (n, w, pl = `${w}s`) => `${n} ${n === 1 ? w : pl}`;

// "12 0x1F 0b101" → [12, 31, 5]
export function parseNumber(token) {
  const t = String(token).trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
  if (/^0b[01]+$/i.test(t)) return parseInt(t.slice(2), 2);
  if (/^\d+$/.test(t)) return Number(t);
  throw new Error(`"${t}" isn't a number. Use decimal, 0x hex or 0b binary.`);
}
export function parseAddresses(text, max = 24) {
  const list = String(text).trim().split(/[\s,;]+/).filter(Boolean).map(parseNumber);
  if (!list.length) throw new Error("Enter at least one logical address.");
  if (list.length > max) throw new Error(`Use at most ${max} addresses.`);
  return list;
}

// "5 6 - 2" → page 2 is invalid (not in memory).
export function parsePageTable(text) {
  const tokens = String(text).trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) throw new Error("Enter the page table: one frame number per page, or - for an invalid page.");
  return tokens.map((t) => (/^[-x×i]$/i.test(t) ? { frame: null, valid: false } : { frame: parseNumber(t), valid: true }));
}

// --- Paging with a TLB ----------------------------------------------------------

export function validatePaging({ pageSize, addressBits, pageTable, tlbSize, policy, addresses }) {
  if (!isPow2(pageSize) || pageSize < 2 || pageSize > 65536) return "Page size must be a power of 2 from 2 to 65536 bytes.";
  const offsetBits = log2(pageSize);
  if (!Number.isInteger(addressBits) || addressBits <= offsetBits || addressBits > 16) return `Logical addresses need more bits than the offset (${offsetBits}) and at most 16 here.`;
  const pages = 2 ** (addressBits - offsetBits);
  if (pages > 64) return `That gives ${pages} pages; keep it to 64 or fewer so the page table fits on screen (fewer address bits or bigger pages).`;
  if (pageTable.length > pages) return `The page table has ${pageTable.length} entries but there are only ${pages} pages.`;
  if (pageTable.some((e) => e.valid && (!Number.isInteger(e.frame) || e.frame < 0 || e.frame > 255))) return "Frame numbers must be whole numbers from 0 to 255.";
  if (!Number.isInteger(tlbSize) || tlbSize < 1 || tlbSize > 8) return "The TLB holds between 1 and 8 entries.";
  if (!POLICIES[policy]) return "TLB replacement must be FIFO or LRU.";
  const bad = addresses.find((a) => !Number.isInteger(a) || a < 0 || a >= 2 ** addressBits);
  if (bad !== undefined) return `Address ${bad} doesn't fit in ${addressBits} bits (0 to ${2 ** addressBits - 1}).`;
  return null;
}

export function translatePaging(cfg) {
  const error = validatePaging(cfg);
  if (error) throw new Error(error);
  const { pageSize, addressBits, pageTable, tlbSize, policy, addresses } = cfg;
  const offsetBits = log2(pageSize), pageBits = addressBits - offsetBits;
  const maxFrame = Math.max(0, ...pageTable.filter((e) => e.valid).map((e) => e.frame));
  const frameBits = Math.max(1, Math.ceil(Math.log2(maxFrame + 1)));
  const physBits = frameBits + offsetBits;
  let tlb = [];
  let hits = 0, misses = 0, faults = 0;
  const steps = [], results = [];
  const tlbText = () => (tlb.length ? tlb.map((e) => `${e.page}→${e.frame}`) : []);
  const snap = (base, extra) => steps.push({
    ...base, tlb: tlb.map((e) => ({ ...e })), hits, misses, faults,
    vars: { addr: base.addr, p: base.split ? base.p : null, d: base.split ? base.d : null, f: extra.f ?? null, TLB: tlbText(), physical: extra.physical ?? null, hits, misses },
    ...extra,
  });

  addresses.forEach((addr, k) => {
    const p = Math.floor(addr / pageSize), d = addr % pageSize;
    const base = { k, addr, p, d, split: false };
    const bits = toBin(addr, addressBits);
    snap(base, { phase: "read", line: 1, note: `The CPU asks for logical address ${addr} (binary ${bits}). Memory only understands physical addresses, so the MMU has to translate it first.` });
    base.split = true;
    snap(base, { phase: "split", line: 1, note: `With ${pageSize}-byte pages the low ${plural(offsetBits, "bit")} are the offset and the high ${plural(pageBits, "bit")} are the page number: ${bits.slice(0, pageBits)} | ${bits.slice(pageBits)}, so p = ${p} and d = ${d}. (That's just ${addr} ÷ ${pageSize} = ${p} remainder ${d}.)` });
    const at = tlb.findIndex((e) => e.page === p);
    if (at !== -1) {
      hits++;
      const f = tlb[at].frame;
      let extraNote = "";
      if (policy === "lru") {
        const [e] = tlb.splice(at, 1);
        tlb.push(e);
        extraNote = tlb.length > 1 ? " LRU records the use, so this entry moves to the back of the eviction order." : "";
      } else if (tlb.length > 1) extraNote = " FIFO ignores uses, so its place in the eviction order doesn't change.";
      snap(base, { phase: "tlb", hit: true, f, lit: { tlb: p }, line: [2, 3], note: `TLB hit: page ${p} is cached, mapped to frame ${f}. The page table in memory isn't touched, which is exactly what the TLB is for.${extraNote}` });
      const physical = f * pageSize + d;
      snap(base, { phase: "physical", hit: true, f, physical, lit: { tlb: p }, line: 9, note: physNote(f, d, pageSize, physical, frameBits, offsetBits) });
      results.push({ addr, p, d, f, physical, hit: true, fault: false });
      return;
    }
    misses++;
    snap(base, { phase: "tlb", hit: false, line: [2, 4], note: `TLB miss: page ${p} isn't among the cached pages${tlb.length ? ` (${tlb.map((e) => e.page).join(", ")})` : " (the TLB is still empty)"}. The MMU must read the page table in main memory, an extra memory access.` });
    const entry = pageTable[p];
    if (!entry || !entry.valid) {
      faults++;
      snap(base, { phase: "fault", hit: false, fault: true, lit: { pt: p }, line: 5, note: `Page-table entry ${p} is ${entry ? "marked invalid" : "missing (beyond the table)"}: page ${p} isn't in memory, so the hardware traps to the OS with a page fault. The OS would load the page and restart the instruction; nothing goes into the TLB yet.` });
      results.push({ addr, p, d, f: null, physical: null, hit: false, fault: true });
      return;
    }
    const f = entry.frame;
    snap(base, { phase: "walk", hit: false, f, lit: { pt: p }, line: 6, note: `Page-table entry ${p} is valid and holds frame ${f}.` });
    if (tlb.length >= tlbSize) {
      const victim = tlb.shift();
      snap(base, { phase: "evict", hit: false, f, victim, lit: { pt: p }, line: 7, note: `The TLB is full (${plural(tlbSize, "entry", "entries")}), so an entry must go. ${policy === "fifo" ? `FIFO evicts page ${victim.page}, the entry that was loaded earliest.` : `LRU evicts page ${victim.page}, the entry used least recently.`}` });
    }
    tlb.push({ page: p, frame: f });
    snap(base, { phase: "insert", hit: false, f, lit: { tlb: p, pt: p }, line: 8, note: `Cache page ${p} → frame ${f} in the TLB, so the next access to page ${p} will be a hit.` });
    const physical = f * pageSize + d;
    snap(base, { phase: "physical", hit: false, f, physical, lit: { tlb: p }, line: 9, note: physNote(f, d, pageSize, physical, frameBits, offsetBits) });
    results.push({ addr, p, d, f, physical, hit: false, fault: false });
  });
  const total = addresses.length;
  steps.push({ phase: "done", done: true, tlb: tlb.map((e) => ({ ...e })), hits, misses, faults, split: false, line: null,
    vars: { TLB: tlbText(), hits, misses, faults, "hit ratio": hits / total },
    note: `Done: ${plural(hits, "TLB hit")} and ${plural(misses, "miss", "misses")} out of ${total}${faults ? `, ${plural(faults, "page fault")}` : ""}. TLB hit ratio = ${hits}/${total} = ${Math.round((hits / total) * 100)}%.` });
  return { steps, results, hits, misses, faults, hitRatio: hits / total, offsetBits, pageBits, frameBits, physBits };
}

function physNote(f, d, pageSize, physical, frameBits, offsetBits) {
  return `Physical address = f × page size + d = ${f} × ${pageSize} + ${d} = ${physical}. In binary the frame number simply replaces the page number and the offset is copied unchanged: ${toBin(f, frameBits)} | ${toBin(d, offsetBits)}.`;
}

// Effective access time (Silberschatz): a hit costs the TLB lookup plus one
// memory access; a miss costs the lookup plus two (page table, then the data).
export function eat({ hitRatio, mem, tlb = 0 }) {
  return hitRatio * (tlb + mem) + (1 - hitRatio) * (tlb + 2 * mem);
}

// --- Multilevel page tables ------------------------------------------------------

// "1.3 = 42" maps p1 = 1, p2 = 3 to frame 42.
export function parseMappings(text) {
  const out = [];
  for (const line of String(text).split(/[\n;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^([\dx.a-f]+(?:\s*\.\s*[\dx.a-f]+)*)\s*(?:=|->|→|:)\s*(\S+)$/i.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write a mapping like 1.3 = 42 (p1 = 1, p2 = 3 → frame 42).`);
    out.push({ path: m[1].split(".").map((x) => parseNumber(x.trim())), frame: parseNumber(m[2]) });
  }
  return out;
}

export function tableName(prefix, levels) {
  if (!prefix.length) return "outer";
  return `${prefix.length === levels - 1 ? "inner" : "middle"} ${prefix.join(".")}`;
}

export function buildTables(bits, mappings) {
  const levels = bits.length - 1;
  const tables = new Map([["", new Map()]]);
  for (const m of mappings) {
    if (m.path.length !== levels) throw new Error(`Mapping ${m.path.join(".")} needs ${levels} index${levels === 1 ? "" : "es"}, one per level.`);
    m.path.forEach((x, i) => { if (x >= 2 ** bits[i]) throw new Error(`Index ${x} doesn't fit in ${bits[i]} bits at level ${i + 1}.`); });
    if (!Number.isInteger(m.frame) || m.frame < 0 || m.frame >= 2 ** 20) throw new Error("Frame numbers must be from 0 to 1048575.");
    for (let i = 0; i < levels; i++) {
      const key = m.path.slice(0, i).join("."), table = tables.get(key);
      if (i === levels - 1) {
        if (table.has(m.path[i])) throw new Error(`Page ${m.path.join(".")} is mapped twice.`);
        table.set(m.path[i], { frame: m.frame });
      } else {
        const next = m.path.slice(0, i + 1).join(".");
        if (!tables.has(next)) tables.set(next, new Map());
        table.set(m.path[i], { table: next });
      }
    }
  }
  return tables;
}

export function validateMultilevel({ bits, addresses }) {
  if (!Array.isArray(bits) || bits.length < 2 || bits.length > 4) return "Give 2 to 4 bit widths: one per page-table level, then the offset (e.g. 10 10 12).";
  if (bits.some((b) => !Number.isInteger(b) || b < 1 || b > 20)) return "Each bit width must be a whole number from 1 to 20.";
  const total = bits.reduce((a, b) => a + b, 0);
  if (total > 32) return `That's ${total} bits; logical addresses here are at most 32 bits.`;
  const bad = addresses.find((a) => !Number.isInteger(a) || a < 0 || a >= 2 ** total);
  if (bad !== undefined) return `Address ${bad} doesn't fit in ${total} bits.`;
  return null;
}

export function splitAddress(addr, bits) {
  const parts = [];
  let rest = addr;
  for (let i = bits.length - 1; i >= 0; i--) { const size = 2 ** bits[i]; parts.unshift(rest % size); rest = Math.floor(rest / size); }
  return parts; // [p1, p2, …, d]
}

export function translateMultilevel({ bits, mappings, addresses }) {
  const error = validateMultilevel({ bits, addresses });
  if (error) throw new Error(error);
  const tables = buildTables(bits, mappings);
  const levels = bits.length - 1, total = bits.reduce((a, b) => a + b, 0), dBits = bits.at(-1);
  const steps = [], results = [];
  const pName = (i) => `p${i + 1}`;
  addresses.forEach((addr, k) => {
    const parts = splitAddress(addr, bits), d = parts.at(-1), idx = parts.slice(0, -1);
    const base = { k, addr, parts, split: false, walk: [], accesses: 0 };
    const vars = (extra = {}) => ({ addr: hex(addr), ...(base.split ? Object.fromEntries(idx.map((x, i) => [pName(i), x]).concat([["d", d]])) : {}), table: extra.table ?? null, accesses: base.accesses, ...extra.more });
    const snap = (extra) => steps.push({ ...base, walk: base.walk.map((w) => ({ ...w })), vars: vars(extra), ...extra });
    const bin = toBin(addr, total);
    snap({ phase: "read", line: 1, note: `Logical address ${hex(addr)} = ${addr} (${total} bits: ${bin}). The MMU has to walk the page tables to find its frame.` });
    base.split = true;
    let pos = 0;
    const groups = bits.map((b) => { const g = bin.slice(pos, pos + b); pos += b; return g; });
    snap({ phase: "split", line: 1, note: `Cut the bits ${bits.join(" | ")}: ${groups.join(" | ")}. So ${idx.map((x, i) => `${pName(i)} = ${x}`).join(", ")} and the offset d = ${d}. Each pᵢ indexes one level of the page table; d passes straight through.` });
    let key = "", fault = false, frame = null;
    for (let i = 0; i < levels; i++) {
      const name = tableName(idx.slice(0, i), levels);
      const entry = tables.get(key)?.get(idx[i]);
      base.accesses++;
      base.walk.push({ level: i, key, name, index: idx[i], entry: entry ?? null });
      if (!entry) {
        fault = true;
        snap({ phase: "fault", level: i, fault: true, table: name, line: [4, 5], note: `Read entry ${idx[i]} of the ${name} table (memory access ${base.accesses}). It's invalid: ${i < levels - 1 ? "no inner table exists for this part of the address space, which is how multilevel tables save memory" : "the page isn't in memory"}. Trap to the OS: page fault.` });
        break;
      }
      if (entry.table !== undefined) {
        snap({ phase: "walk", level: i, table: name, line: [4, 6], note: `Read entry ${idx[i]} of the ${name} table (memory access ${base.accesses}). It's valid and points to the ${tableName(idx.slice(0, i + 1), levels)} table, so ${pName(i + 1)} = ${idx[i + 1]} is used there next.` });
        key = entry.table;
      } else {
        frame = entry.frame;
        snap({ phase: "walk", level: i, table: name, frame, line: [4, 6], more: { frame }, note: `Read entry ${idx[i]} of the ${name} table (memory access ${base.accesses}). This is the last level, so the entry holds the frame number: ${frame}.` });
      }
    }
    if (fault) { results.push({ addr, parts, frame: null, physical: null, fault: true, accesses: base.accesses }); return; }
    const physical = frame * 2 ** dBits + d;
    snap({ phase: "physical", frame, physical, line: 7, more: { frame, physical: hex(physical) }, note: `Physical address = frame × 2^${dBits} + d = ${frame} × ${2 ** dBits} + ${d} = ${physical} (${hex(physical)}). The offset bits are copied unchanged.` });
    base.accesses++;
    snap({ phase: "data", frame, physical, line: 8, more: { frame, physical: hex(physical) }, note: `Finally read the data at ${hex(physical)} (memory access ${base.accesses}). With ${plural(levels, "level")} every reference costs ${levels + 1} memory accesses without a TLB, which is why a TLB matters even more here.` });
    results.push({ addr, parts, frame, physical, fault: false, accesses: base.accesses });
  });
  steps.push({ phase: "done", done: true, split: false, walk: [], line: null, vars: { addresses: addresses.length, faults: results.filter((r) => r.fault).length },
    note: `Done. ${plural(results.filter((r) => !r.fault).length, "address", "addresses")} translated${results.some((r) => r.fault) ? `, ${plural(results.filter((r) => r.fault).length, "page fault")}` : ""}. Only ${tables.size} small table${tables.size === 1 ? "" : "s"} exist; a single-level table would need ${2 ** (total - dBits)} entries.` });
  return { steps, results, tables, levels, totalBits: total };
}

// --- Segmentation ------------------------------------------------------------------

// One segment per line: "1400 1000" (base, limit).
export function parseSegments(text) {
  const segs = String(text).split(/[\n;]+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const nums = line.split(/[\s,/:]+/).filter(Boolean).map(parseNumber);
    if (nums.length !== 2) throw new Error(`Can't read "${line}". Write each segment as: base limit.`);
    return { base: nums[0], limit: nums[1] };
  });
  if (!segs.length) throw new Error("Add at least one segment (base limit).");
  if (segs.length > 10) throw new Error("Use at most 10 segments.");
  if (segs.some((s) => s.base > 99999 || s.limit < 1 || s.limit > 99999)) throw new Error("Bases go up to 99999 and limits from 1 to 99999.");
  return segs;
}

// "(2, 53) (3, 852)" or "2:53 3:852"
export function parseSegAddresses(text) {
  const out = [];
  const re = /\(?\s*(\d+)\s*[,:]\s*(\d+)\s*\)?/g;
  const rest = String(text).replace(re, (_, s, d) => { out.push({ s: Number(s), d: Number(d) }); return " "; });
  if (rest.trim().replace(/[,;\s]/g, "")) throw new Error("Write addresses as (segment, offset) pairs, e.g. (2, 53) (3, 852).");
  if (!out.length) throw new Error("Enter at least one (segment, offset) address.");
  if (out.length > 16) throw new Error("Use at most 16 addresses.");
  return out;
}

export function translateSegments({ segments, addresses }) {
  const steps = [], results = [];
  addresses.forEach(({ s, d }, k) => {
    const base = { k, s, d };
    const seg = segments[s];
    const vars = (extra = {}) => ({ s, d, base: seg?.base ?? null, limit: seg?.limit ?? null, physical: null, ...extra });
    steps.push({ ...base, phase: "read", line: 1, vars: vars(), note: `Logical address (${s}, ${d}): segment ${s}, offset ${d} bytes into it.` });
    if (!seg) {
      steps.push({ ...base, phase: "trap", trap: true, line: 2, vars: vars(), note: `There are only ${plural(segments.length, "segment")} (0 to ${segments.length - 1}), so segment ${s} doesn't exist. Trap to the OS: invalid segment.` });
      results.push({ s, d, trap: true, physical: null });
      return;
    }
    steps.push({ ...base, phase: "lookup", lit: s, line: 2, vars: vars(), note: `Segment ${s} exists. Its table entry says base = ${seg.base}, limit = ${seg.limit}: it occupies physical addresses ${seg.base} to ${seg.base + seg.limit - 1}.` });
    if (d >= seg.limit) {
      steps.push({ ...base, phase: "trap", trap: true, lit: s, line: 3, vars: vars(), note: `Offset ${d} ≥ limit ${seg.limit}: the address would point past the end of segment ${s} (into someone else's memory), so the hardware traps to the OS with an addressing error.` });
      results.push({ s, d, trap: true, physical: null });
      return;
    }
    const physical = seg.base + d;
    steps.push({ ...base, phase: "check", lit: s, line: 3, vars: vars(), note: `Offset ${d} < limit ${seg.limit}, so the address is inside the segment and the access is legal.` });
    steps.push({ ...base, phase: "physical", lit: s, physical, line: 4, vars: vars({ physical }), note: `Physical address = base + d = ${seg.base} + ${d} = ${physical}.` });
    results.push({ s, d, trap: false, physical });
  });
  const traps = results.filter((r) => r.trap).length;
  steps.push({ phase: "done", done: true, line: null, vars: { addresses: addresses.length, traps }, note: `Done: ${addresses.length - traps} legal, ${traps} trapped.` });
  return { steps, results };
}

// --- Examples and random inputs ------------------------------------------------------

// Silberschatz, "Paging model" figure: 4-byte pages, 32-byte memory, page table 5 6 1 2.
export const PAGING_EXAMPLE = { pageSize: 4, addressBits: 4, pageTable: "5 6 1 2", tlbSize: 3, policy: "lru", addresses: "0 3 4 13 1 5 9 14 2 6" };
// The classic 32-bit address with 4 KB pages, split 10 | 10 | 12.
export const MULTI_EXAMPLE = { bits: "10 10 12", mappings: "0.0 = 7\n0.1 = 12\n1.3 = 42\n1.4 = 43\n3.1023 = 99", addresses: "0x00000ABC 0x00403ABC 0x00404010 0x00800123 0x00FFFFFF" };
// Silberschatz, segmentation example: five segments.
export const SEGMENT_EXAMPLE = { segments: "1400 1000\n6300 400\n4300 400\n3200 1100\n4700 1000", addresses: "(2, 53) (3, 852) (0, 1222) (4, 999) (1, 400)" };

export function randomPaging(r = Math.random) {
  const pageSize = 2 ** (1 + Math.floor(r() * 4)), offsetBits = log2(pageSize);
  const pageBits = 2 + Math.floor(r() * 2), addressBits = offsetBits + pageBits;
  const frames = Array.from({ length: 16 }, (_, i) => i).sort(() => r() - 0.5);
  const pageTable = Array.from({ length: 2 ** pageBits }, (_, i) => (r() < 0.15 ? { frame: null, valid: false } : { frame: frames[i], valid: true }));
  const n = 5 + Math.floor(r() * 6);
  const addresses = [];
  for (let i = 0; i < n; i++) addresses.push(i && r() < 0.4 ? (Math.floor(addresses[i - 1] / pageSize) * pageSize + Math.floor(r() * pageSize)) : Math.floor(r() * 2 ** addressBits));
  return { pageSize, addressBits, pageTable, tlbSize: 1 + Math.floor(r() * 3), policy: r() < 0.5 ? "fifo" : "lru", addresses };
}

export function randomSegments(r = Math.random) {
  const n = 3 + Math.floor(r() * 3);
  let base = 100 * (1 + Math.floor(r() * 10));
  const segments = [];
  for (let i = 0; i < n; i++) { const limit = 100 * (1 + Math.floor(r() * 10)); segments.push({ base, limit }); base += limit + 100 * Math.floor(r() * 5); }
  const order = segments.map((s, i) => ({ s, i })).sort(() => r() - 0.5);
  return order.map((x) => x.s);
}
