// Tools for Computer organisation. Same shape as the entries in ../tools.js; views live in
// ../views/ (so load: () => import("../views/<file>.js")). A subject with no
// tools is hidden everywhere.
export const SUBJECT = { id: "coa", name: "Computer organisation", short: "COA" };

// Home-card thumbnails, drawn with a few elements so the home page stays light.
const field = (h, cls, text, flex) => h("span", { class: `coa-pv-f f-${cls}`, style: `flex:${flex}` }, text);

export const TOOLS = [
  { slug: "cache-mapping", subject: "coa", title: "Cache mapping", art: "cache",
    summary: "Tag, index and offset bits, then a reference trace with every hit, miss and LRU or FIFO eviction, plus average access time.",
    description: "Cache mapping visualiser: direct, set-associative and fully associative caches, tag/index/offset bits, hits and misses by type, LRU/FIFO and AMAT.",
    load: () => import("../views/cache.js"),
    preview: (h) => h("div", { class: "art coa-pv" },
      h("div", { class: "coa-pv-bits" }, field(h, "tag", "tag", 5), field(h, "idx", "index", 3), field(h, "off", "off", 2)),
      h("div", { class: "coa-pv-sets" }, [["B0", "B8"], ["B6", ""], ["", ""]].map((ways, k) => h("div", { class: k === 0 ? "hot" : null }, ways.map((w) => h("i", { class: w ? "full" : null }, w)))))) },
  { slug: "pipelining", subject: "coa", title: "Pipelining", art: "pipe",
    summary: "A 5-stage timing diagram cycle by cycle: data hazards, forwarding, load-use stalls, branch penalties, CPI and speedup.",
    description: "5-stage pipeline timing diagrams step by step: data hazards with and without forwarding, load-use stalls, branch penalties, CPI, speedup and clock period.",
    load: () => import("../views/pipeline.js"),
    preview: (h) => h("div", { class: "art coa-pv coa-pv-pipe" }, [0, 1, 2].map((row) => h("div", null,
      Array.from({ length: row }, () => h("i")), ["IF", "ID", row === 2 ? "··" : "EX", row === 2 ? "EX" : "MEM", row === 2 ? "MEM" : "WB"].map((s, k) => h("b", { class: s === "··" ? "stall" : `s${k}` }, s))))) },
  { slug: "addressing-modes", subject: "coa", title: "Addressing modes", art: "ea",
    summary: "Immediate, direct, indirect, register, indexed, base, relative and auto-increment, on a small machine; plus instruction formats.",
    description: "Addressing modes step by step: effective address for immediate, direct, indirect, register, indexed, base, PC-relative and auto modes; expanding opcodes.",
    load: () => import("../views/addressing.js"),
    preview: (h) => h("div", { class: "art fd-art" }, h("span", null, "LOAD AC, @500"), h("span", null, "M[500] = 800"), h("span", { class: "hot" }, "EA = 800 → AC = 300")) },
  { slug: "ieee-754", subject: "coa", title: "IEEE 754 floating point", art: "float",
    summary: "Encode and decode half, single and double precision: normalise, bias, round to nearest even, denormals, ∞ and NaN.",
    description: "IEEE 754 converter with steps: decimal to half, single or double precision and back, bias, rounding to nearest even, denormals, specials, range.",
    load: () => import("../views/ieee754.js"),
    preview: (h) => h("div", { class: "art coa-pv" },
      h("div", { class: "coa-pv-bits mono" }, field(h, "sign", "1", 1), field(h, "exp", "10000001", 6), field(h, "frac", "1001000…", 9)),
      h("span", { class: "coa-pv-cap" }, "−6.25 = 0xC0C80000")) },
  { slug: "io-dma", subject: "coa", title: "I/O, interrupts and DMA", art: "dma",
    summary: "Polling, interrupts and DMA compared by CPU time, worked out step by step, plus burst and cycle-stealing DMA.",
    description: "Programmed I/O, interrupt-driven I/O and DMA compared: CPU time share step by step, with burst, cycle-stealing and interleaved DMA on a timeline.",
    load: () => import("../views/io.js"),
    preview: (h) => h("div", { class: "art coa-pv coa-pv-io" }, [["poll", 70], ["irq", 28], ["dma", 4]].map(([k, w]) => h("div", null, h("small", null, k), h("span", null, h("i", { style: `width:${w}%` })))) ) },
];
