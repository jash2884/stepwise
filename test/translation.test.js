import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eat, MODES, MULTI_EXAMPLE, parseAddresses, parseMappings, parsePageTable, parseSegAddresses, parseSegments, randomPaging, randomSegments,
  SEGMENT_EXAMPLE, splitAddress, translateMultilevel, translatePaging, translateSegments,
} from "../public/js/engines/translation.js";

const paging = (over = {}) => translatePaging({ pageSize: 4, addressBits: 4, pageTable: parsePageTable("5 6 1 2"), tlbSize: 2, policy: "fifo", addresses: [0, 3, 4, 13], ...over });

// Silberschatz, Operating System Concepts, "Paging example for a 32-byte memory with
// 4-byte pages": page table 5 6 1 2; logical 0 → 20, 3 → 23, 4 → 24, 13 → 9.
test("textbook paging example", () => {
  const r = paging();
  assert.deepEqual(r.results.map((x) => x.physical), [20, 23, 24, 9]);
  assert.deepEqual(r.results.map((x) => [x.p, x.d]), [[0, 0], [0, 3], [1, 0], [3, 1]]);
  assert.equal(r.hits, 1); // 3 is on page 0, cached by the access to 0
  assert.equal(r.misses, 3);
  assert.match(r.steps.find((s) => s.phase === "evict").note, /FIFO evicts page 0/);
});

test("FIFO and LRU pick different TLB victims", () => {
  // TLB of 2: pages 0, 1 loaded; page 0 used again; then page 3 needs a slot.
  const addrs = [0, 4, 1, 13];
  const fifo = paging({ addresses: addrs, policy: "fifo" }), lru = paging({ addresses: addrs, policy: "lru" });
  assert.equal(fifo.steps.find((s) => s.phase === "evict").victim.page, 0, "FIFO: 0 was loaded first");
  assert.equal(lru.steps.find((s) => s.phase === "evict").victim.page, 1, "LRU: 1 was used least recently");
});

test("invalid entries page-fault and stay out of the TLB", () => {
  const r = paging({ pageTable: parsePageTable("5 - 1"), addresses: [4, 14, 0] });
  assert.deepEqual(r.results.map((x) => x.fault), [true, true, false]);
  assert.equal(r.faults, 2);
  assert.ok(r.steps.every((s) => !s.tlb.some((e) => e.page === 1 || e.page === 3)));
  assert.equal(r.steps.find((s) => s.phase === "fault").line, 5);
});

// Silberschatz: 80% hit ratio, 20 ns TLB, 100 ns memory → 140 ns; 98% → 122 ns.
// Newer editions ignore the TLB time with 10 ns memory: 80% → 12 ns, 99% → 10.1 ns.
test("effective access time", () => {
  assert.equal(eat({ hitRatio: 0.8, mem: 100, tlb: 20 }), 140);
  assert.equal(Math.round(eat({ hitRatio: 0.98, mem: 100, tlb: 20 }) * 1000) / 1000, 122);
  assert.equal(Math.round(eat({ hitRatio: 0.8, mem: 10 }) * 1000) / 1000, 12);
  assert.equal(Math.round(eat({ hitRatio: 0.99, mem: 10 }) * 1000) / 1000, 10.1);
});

// The classic 32-bit address, 4 KB pages, two-level table split 10 | 10 | 12.
test("two-level paging: 10 | 10 | 12", () => {
  assert.deepEqual(splitAddress(0x00403abc, [10, 10, 12]), [1, 3, 0xabc]);
  const r = translateMultilevel({ bits: [10, 10, 12], mappings: parseMappings(MULTI_EXAMPLE.mappings), addresses: parseAddresses(MULTI_EXAMPLE.addresses) });
  const hit = r.results[1];
  assert.equal(hit.frame, 42);
  assert.equal(hit.physical, 42 * 4096 + 0xabc);
  assert.equal(hit.accesses, 3, "two table reads plus the data access");
  const miss = r.results.find((x) => x.fault);
  assert.equal(miss.accesses, 1, "no inner table for p1 = 2, so the walk stops at the outer table");
  assert.match(r.steps.find((s) => s.fault).note, /page fault/);
});

test("three-level paging costs four accesses", () => {
  const r = translateMultilevel({ bits: [4, 4, 4, 4], mappings: parseMappings("0.0.1 = 5"), addresses: [0x0012] });
  assert.deepEqual(r.results[0].parts, [0, 0, 1, 2]);
  assert.equal(r.results[0].physical, 5 * 16 + 2);
  assert.equal(r.results[0].accesses, 4);
  assert.throws(() => parseMappings("1 = 2 = 3"), /Can't read/);
  assert.throws(() => translateMultilevel({ bits: [20, 20], mappings: [], addresses: [1] }), /32 bits/);
});

// Silberschatz segmentation example: (2, 53) → 4353, (3, 852) → 4052, (0, 1222) traps.
test("segmentation: textbook segment table", () => {
  const segments = parseSegments(SEGMENT_EXAMPLE.segments);
  const r = translateSegments({ segments, addresses: parseSegAddresses("(2, 53) (3, 852) (0, 1222) (1, 399) (1, 400) (7, 0)") });
  assert.deepEqual(r.results.map((x) => x.physical), [4353, 4052, null, 6699, null, null]);
  assert.match(r.steps.find((s) => s.trap).note, /1222 ≥ limit 1000/);
  assert.match(r.steps.filter((s) => s.trap).at(-1).note, /doesn't exist/);
  assert.throws(() => parseSegAddresses("2 53"), /pairs/);
});

test("every step names a valid pseudocode line and carries vars and a note", () => {
  const runs = [
    ["paging", paging()],
    ["multilevel", translateMultilevel({ bits: [10, 10, 12], mappings: parseMappings(MULTI_EXAMPLE.mappings), addresses: parseAddresses(MULTI_EXAMPLE.addresses) })],
    ["segmentation", translateSegments({ segments: parseSegments(SEGMENT_EXAMPLE.segments), addresses: parseSegAddresses(SEGMENT_EXAMPLE.addresses) })],
  ];
  for (const [mode, r] of runs) for (const s of r.steps) {
    if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= MODES[mode].code.length, `${mode} line ${l}`);
    assert.ok(s.vars && typeof s.note === "string" && s.note.length > 10);
  }
});

// Fuzz invariants on random configurations.
let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("fuzz: paging invariants", () => {
  for (let k = 0; k < 400; k++) {
    const c = randomPaging(rand);
    const r = translatePaging(c);
    assert.equal(r.hits + r.misses, c.addresses.length);
    for (const x of r.results) {
      assert.ok(x.d < c.pageSize && x.p * c.pageSize + x.d === x.addr);
      if (!x.fault) assert.equal(x.physical, x.f * c.pageSize + x.d);
      else assert.equal(c.pageTable[x.p]?.valid ?? false, false);
    }
    for (const s of r.steps) {
      assert.ok(s.tlb.length <= c.tlbSize, "TLB never overflows");
      assert.equal(new Set(s.tlb.map((e) => e.page)).size, s.tlb.length, "TLB never holds a page twice");
      for (const e of s.tlb) assert.equal(c.pageTable[e.page].frame, e.frame, "TLB agrees with the page table");
    }
  }
});

test("fuzz: multilevel and segmentation invariants", () => {
  for (let k = 0; k < 300; k++) {
    const bits = [1 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 4), 1 + Math.floor(rand() * 6)];
    const total = bits.reduce((a, b) => a + b, 0);
    const maps = new Map();
    for (let i = 0; i < 4; i++) maps.set(`${Math.floor(rand() * 2 ** bits[0])}.${Math.floor(rand() * 2 ** bits[1])}`, Math.floor(rand() * 64));
    const mappings = parseMappings([...maps].map(([p, f]) => `${p} = ${f}`).join("\n"));
    const addresses = Array.from({ length: 6 }, () => Math.floor(rand() * 2 ** total));
    const r = translateMultilevel({ bits, mappings, addresses });
    for (const x of r.results) {
      const d = x.parts.at(-1);
      assert.ok(d < 2 ** bits[2]);
      if (!x.fault) { assert.equal(x.physical, x.frame * 2 ** bits[2] + d); assert.equal(x.accesses, 3); }
      else assert.ok(!maps.has(x.parts.slice(0, 2).join(".")));
    }
    const segments = randomSegments(rand);
    const sa = Array.from({ length: 5 }, () => ({ s: Math.floor(rand() * (segments.length + 1)), d: Math.floor(rand() * 1200) }));
    const sr = translateSegments({ segments, addresses: sa });
    sr.results.forEach((x) => {
      const sg = segments[x.s];
      assert.equal(x.trap, !sg || x.d >= sg.limit);
      if (!x.trap) assert.ok(x.physical >= sg.base && x.physical < sg.base + sg.limit);
    });
  }
});
