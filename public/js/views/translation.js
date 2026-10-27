import {
  eat, log2, MODES, MULTI_EXAMPLE, PAGING_EXAMPLE, parseAddresses, parseMappings, parsePageTable, parseSegAddresses, parseSegments,
  POLICIES, randomPaging, randomSegments, SEGMENT_EXAMPLE, splitAddress, toBin, translateMultilevel, translatePaging, translateSegments,
} from "../engines/translation.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, fmt, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";

const hex = (n) => `0x${n.toString(16).toUpperCase()}`;
const txt = (x, y, s, cls = null, anchor = "start") => h("text", { x, y, class: cls, "text-anchor": anchor }, s);

// A row of bit boxes. Each box is keyed so the gap opening between fields glides.
function bitRow({ bits, groups, x0, y, bw, keyPrefix, gap = 14, split = true }) {
  const els = [];
  let i = 0, x = x0;
  const spans = [];
  groups.forEach((g, gi) => {
    const start = x;
    for (let k = 0; k < g.size; k++, i++) {
      const bx = x;
      els.push(h("g", { class: `xl-bit ${split ? g.cls : "plain"}`, "data-k": `${keyPrefix}:${i}`, "data-x": bx, "data-y": y },
        h("rect", { x: bx, y, width: bw - 2, height: 26, rx: 4 }),
        txt(bx + (bw - 2) / 2, y + 18, bits[i], null, "middle")));
      x += bw;
    }
    spans.push({ start, end: x - 2, g });
    if (split && gi < groups.length - 1) x += gap;
  });
  // Narrow fields stagger their labels so they never overlap.
  const narrow = spans.some((s) => s.end - s.start + gap < s.g.label.length * 7.6);
  if (split) spans.forEach((s, gi) => els.push(h("g", { class: "xl-brace" }, h("path", { d: `M${s.start},${y + 32} v4 H${s.end} v-4` }),
    txt((s.start + s.end) / 2, y + 50 + (narrow && gi % 2 ? 15 : 0), s.g.label, `xl-field ${s.g.cls}`, "middle"))));
  return { els, end: x };
}

// --- Paging with a TLB -----------------------------------------------------------
function pagingSvg(st, cfg, res) {
  const { pageSize, addressBits } = cfg, pageBits = res.pageBits, offsetBits = res.offsetBits;
  const bw = addressBits > 10 ? 20 : 26, rowH = 26;
  const pages = 2 ** pageBits;
  const els = [];
  const addr = st.addr ?? null;
  // Logical address
  if (addr != null) {
    els.push(txt(20, 16, `Logical address ${addr}`, "xl-title"));
    const row = bitRow({ bits: toBin(addr, addressBits), x0: 20, y: 24, bw, keyPrefix: "lb", split: st.split,
      groups: [{ size: pageBits, cls: "p0", label: `page p = ${st.p}` }, { size: offsetBits, cls: "off", label: `offset d = ${st.d}` }] });
    els.push(...row.els);
  } else els.push(txt(20, 16, "All addresses translated", "xl-title"));
  // TLB
  const top = 104, tlbX = 20, tlbW = 150, ptX = 210, ptW = 150;
  els.push(txt(tlbX, top, `TLB (${cfg.tlbSize} entr${cfg.tlbSize === 1 ? "y" : "ies"}, ${POLICIES[cfg.policy]})`, "xl-title"));
  els.push(txt(tlbX + 6, top + 20, "page", "xl-head"), txt(tlbX + tlbW - 8, top + 20, "frame", "xl-head", "end"));
  const rowY = (i) => top + 28 + i * rowH;
  for (let i = 0; i < cfg.tlbSize; i++) els.push(h("rect", { x: tlbX, y: rowY(i), width: tlbW, height: rowH - 4, rx: 5, class: "xl-slot" }));
  st.tlb.forEach((e, i) => {
    const lit = st.lit?.tlb === e.page;
    els.push(h("g", { class: `xl-row${lit ? (st.phase === "insert" ? " new" : " lit") : ""}`, "data-k": `tlb:${e.page}`, "data-x": tlbX, "data-y": rowY(i) },
      h("rect", { x: tlbX, y: rowY(i), width: tlbW, height: rowH - 4, rx: 5 }),
      txt(tlbX + 10, rowY(i) + 15, e.page), txt(tlbX + tlbW - 10, rowY(i) + 15, e.frame, null, "end")));
  });
  if (st.victim) els.push(h("g", { class: "xl-row out", "data-k": `tlb:${st.victim.page}`, "data-x": tlbX, "data-y": rowY(0) },
    h("rect", { x: tlbX, y: rowY(0), width: tlbW, height: rowH - 4, rx: 5 }),
    txt(tlbX + 10, rowY(0) + 15, st.victim.page), txt(tlbX + tlbW - 10, rowY(0) + 15, st.victim.frame, null, "end")));
  if (st.tlb.length === cfg.tlbSize && !st.done) els.push(txt(tlbX + tlbW / 2, rowY(cfg.tlbSize) + 12, "↑ top row goes next", "xl-hint", "middle"));
  // Page table (a window of 16 rows when it's longer)
  const centre = st.lit?.pt ?? st.p ?? 0;
  const first = pages <= 16 ? 0 : Math.max(0, Math.min(pages - 16, centre - 7));
  const shown = Array.from({ length: Math.min(16, pages) }, (_, i) => first + i);
  els.push(txt(ptX, top, "Page table (in memory)", "xl-title"));
  els.push(txt(ptX + 6, top + 20, "page", "xl-head"), txt(ptX + ptW - 8, top + 20, "frame · valid", "xl-head", "end"));
  shown.forEach((pg, i) => {
    const e = cfg.pageTable[pg];
    const lit = st.lit?.pt === pg;
    els.push(h("g", { class: `xl-row pt${lit ? (st.fault ? " bad" : " lit") : ""}${e?.valid ? "" : " invalid"}`, "data-k": `pt:${pg}`, "data-x": ptX, "data-y": rowY(i) },
      h("rect", { x: ptX, y: rowY(i), width: ptW, height: rowH - 4, rx: 5 }),
      txt(ptX + 10, rowY(i) + 15, pg), txt(ptX + ptW - 10, rowY(i) + 15, e?.valid ? `${e.frame} · v` : "– · i", null, "end")));
  });
  if (pages > 16) els.push(txt(ptX + ptW / 2, rowY(16) + 12, `rows ${first}–${first + 15} of ${pages}`, "xl-hint", "middle"));
  // Physical address
  const rows = Math.max(cfg.tlbSize + 1, Math.min(16, pages) + (pages > 16 ? 1 : 0));
  const physY = rowY(rows) + 34;
  els.push(txt(20, physY - 10, st.physical != null ? `Physical address ${st.physical}` : st.fault ? "Page fault: trap to the OS" : "Physical address", `xl-title${st.fault ? " bad" : ""}`));
  let physEnd = 20;
  if (st.physical != null) {
    const r = bitRow({ bits: toBin(st.f, res.frameBits) + toBin(st.d, offsetBits), x0: 20, y: physY, bw, keyPrefix: `ph${st.k}`,
      groups: [{ size: res.frameBits, cls: "fr", label: `frame f = ${st.f}` }, { size: offsetBits, cls: "off", label: `offset d = ${st.d}` }] });
    els.push(...r.els);
    physEnd = r.end;
  }
  // The token: where the MMU is looking right now.
  const tok = st.done ? null
    : st.phase === "read" || st.phase === "split" ? [12, 37]
      : st.phase === "tlb" ? (st.hit ? [tlbX - 8, rowY(st.tlb.findIndex((e) => e.page === st.p)) + 11] : [tlbX - 8, top + 14])
        : st.phase === "walk" || st.phase === "fault" || st.phase === "evict" ? [ptX - 8, rowY(shown.indexOf(st.lit.pt)) + 11]
          : st.phase === "insert" ? [tlbX - 8, rowY(st.tlb.length - 1) + 11]
            : [12, physY + 13];
  if (tok) els.push(h("circle", { cx: tok[0], cy: tok[1], r: 6, class: `xl-token${st.fault ? " bad" : ""}`, "data-k": "tok", "data-x": tok[0], "data-y": tok[1] }));
  const W = Math.max(ptX + ptW + 20, 20 + addressBits * bw + 40, physEnd + 20);
  return h("svg", { viewBox: `0 0 ${W} ${physY + 78}`, class: "xl-svg", role: "img", style: `max-width:${W * 1.4}px`,
    "aria-label": `${st.note}` }, els);
}

// --- Multilevel -----------------------------------------------------------------
function multiSvg(st, bits, res) {
  const total = res.totalBits, levels = res.levels, bw = total > 20 ? 13 : total > 12 ? 18 : 24;
  const els = [];
  const cls = (i) => (i === levels ? "off" : `p${i}`);
  if (st.addr != null) {
    els.push(txt(20, 16, `Logical address ${hex(st.addr)}`, "xl-title"));
    const parts = st.parts;
    els.push(...bitRow({ bits: toBin(st.addr, total), x0: 20, y: 24, bw, keyPrefix: "mb", split: st.split, gap: 12,
      groups: bits.map((b, i) => ({ size: b, cls: cls(i), label: i === levels ? `d = ${parts[i]}` : `p${i + 1} = ${parts[i]}` })) }).els);
  } else els.push(txt(20, 16, "All addresses translated", "xl-title"));
  const top = 108, colW = 150, gapX = 34, rowH = 24;
  const colX = (i) => 20 + i * (colW + gapX);
  els.push(txt(colX(0), top - 6, "PTBR →", "xl-hint"));
  const walk = st.walk ?? [];
  let tok = st.done ? null : st.phase === "read" || st.phase === "split" ? [12, 37] : null;
  walk.forEach((w, i) => {
    const x = colX(i);
    els.push(h("g", { class: "xl-col", "data-k": `col:${w.key}`, "data-x": x, "data-y": top },
      txt(x, top + 12, `${w.name} table`, "xl-title"), txt(x, top + 26, `${2 ** bits[i]} entries`, "xl-hint")));
    const size = 2 ** bits[i];
    const ids = [w.index - 1, w.index, w.index + 1].filter((n) => n >= 0 && n < size);
    const table = res.tables.get(w.key);
    ids.forEach((n, r) => {
      const y = top + 46 + r * rowH, e = table?.get(n), hot = n === w.index;
      const val = !e ? "invalid" : e.table !== undefined ? `→ ${e.table.split(".").length === levels - 1 ? "inner" : "middle"} ${e.table}` : `frame ${e.frame}`;
      els.push(h("g", { class: `xl-row${hot ? (e ? " lit" : " bad") : ""}${e ? "" : " invalid"}`, "data-k": `e:${w.key}:${n}`, "data-x": x, "data-y": y },
        h("rect", { x, y, width: colW, height: rowH - 4, rx: 5 }), txt(x + 8, y + 14, n), txt(x + colW - 8, y + 14, val, null, "end")));
      if (hot) {
        if (i === walk.length - 1) tok = [x - 8, y + 10];
        if (e && i < walk.length - 1) els.push(h("path", { d: `M${x + colW + 2},${y + 10} C${x + colW + 20},${y + 10} ${colX(i + 1) - 20},${top + 8} ${colX(i + 1) - 4},${top + 8}`, class: "xl-arrow", "marker-end": "url(#xl-head)" }));
      }
    });
    if (ids[0] > 0) els.push(txt(x + colW / 2, top + 42, "⋮", "xl-hint", "middle"));
    if (ids.at(-1) < size - 1) els.push(txt(x + colW / 2, top + 46 + ids.length * rowH + 8, "⋮", "xl-hint", "middle"));
  });
  const physY = top + 46 + 3 * rowH + 44;
  if (st.physical != null) {
    els.push(txt(20, physY - 10, `Physical address ${hex(st.physical)} = ${st.physical}`, "xl-title"));
    const fBits = Math.max(1, Math.ceil(Math.log2(st.frame + 1)));
    els.push(...bitRow({ bits: toBin(st.frame, fBits) + toBin(st.parts.at(-1), bits.at(-1)), x0: 20, y: physY, bw, keyPrefix: `mp${st.k}`, gap: 12,
      groups: [{ size: fBits, cls: "fr", label: `frame = ${st.frame}` }, { size: bits.at(-1), cls: "off", label: `d = ${st.parts.at(-1)}` }] }).els);
    if (!tok || st.phase === "physical" || st.phase === "data") tok = [12, physY + 13];
  } else if (st.fault) els.push(txt(20, physY - 10, "Page fault: trap to the OS", "xl-title bad"));
  if (tok) els.push(h("circle", { cx: tok[0], cy: tok[1], r: 6, class: `xl-token${st.fault ? " bad" : ""}`, "data-k": "tok", "data-x": tok[0], "data-y": tok[1] }));
  const W = Math.max(20 + total * bw + levels * 12 + 30, colX(levels) + 10, 440);
  return h("svg", { viewBox: `0 0 ${W} ${physY + 78}`, class: "xl-svg", role: "img", style: `max-width:${W * 1.3}px;min-width:${Math.min(W, 560)}px`, "aria-label": st.note },
    h("defs", null, h("marker", { id: "xl-head", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, h("path", { d: "M0,0 L10,5 L0,10 z", class: "xl-arrowhead" }))),
    els);
}

// --- Segmentation -------------------------------------------------------------------
function segSvg(st, segments) {
  const els = [], rowH = 26, top = 40, tx = 20;
  els.push(txt(tx, top - 20, st.s != null ? `Logical address (${st.s}, ${st.d})` : "All addresses translated", "xl-title"));
  els.push(txt(tx + 8, top, "seg", "xl-head"), txt(tx + 90, top, "base", "xl-head", "end"), txt(tx + 150, top, "limit", "xl-head", "end"));
  segments.forEach((sg, i) => {
    const y = top + 8 + i * rowH, lit = st.lit === i;
    els.push(h("g", { class: `xl-row${lit ? (st.trap ? " bad" : " lit") : ""}` }, h("rect", { x: tx, y, width: 160, height: rowH - 4, rx: 5 }),
      txt(tx + 8, y + 15, i), txt(tx + 90, y + 15, sg.base, null, "end"), txt(tx + 150, y + 15, sg.limit, null, "end")));
  });
  // Physical memory as a vertical bar, 0 at the top.
  const memTop = 30, memH = Math.max(segments.length * rowH + 40, 260), mx = 260, mw = 120;
  const end = Math.max(...segments.map((s) => s.base + s.limit)), max = Math.ceil((end * 1.08) / 100) * 100;
  const y = (a) => memTop + (Math.min(a, max) / max) * memH;
  els.push(txt(mx, memTop - 10, "Physical memory", "xl-title"), h("rect", { x: mx, y: memTop, width: mw, height: memH, class: "xl-mem" }));
  segments.forEach((sg, i) => {
    const lit = st.lit === i;
    els.push(h("g", { class: `xl-seg${lit ? (st.trap ? " bad" : " lit") : ""}`, style: `--c:var(--series-${(i % 8) + 1})` },
      h("rect", { x: mx, y: y(sg.base), width: mw, height: Math.max(2, y(sg.base + sg.limit) - y(sg.base)) }),
      y(sg.base + sg.limit) - y(sg.base) > 13 ? txt(mx + mw / 2, (y(sg.base) + y(sg.base + sg.limit)) / 2 + 4, `segment ${i}`, null, "middle") : null),
    txt(mx - 6, y(sg.base) + 4, sg.base, "xl-axis", "end"));
  });
  els.push(txt(mx - 6, memTop + memH, max, "xl-axis", "end"));
  const seg = segments[st.s];
  if (seg && st.phase !== "read") {
    const target = seg.base + st.d, ty = y(target);
    const ok = !st.trap;
    els.push(h("g", { class: `xl-marker${ok ? "" : " bad"}`, "data-k": "mk", "data-x": 0, "data-y": ty },
      h("line", { x1: mx - 4, x2: mx + mw + 10, y1: ty, y2: ty }), h("path", { d: `M${mx + mw + 10},${ty} l10,-6 v12 z` }),
      txt(mx + mw + 24, ty + 4, ok ? (st.physical != null ? `${st.physical}` : `${seg.base} + ${st.d}`) : `${target}?`)));
    if (st.phase === "check" || st.phase === "physical" || st.trap) els.push(h("line", { x1: mx - 4, x2: mx + mw + 4, y1: y(seg.base + seg.limit), y2: y(seg.base + seg.limit), class: "xl-limit" }));
  }
  const H = Math.max(memTop + memH + 20, top + 8 + segments.length * rowH + 10);
  return h("svg", { viewBox: `0 0 ${mx + mw + 90} ${H}`, class: "xl-svg", role: "img", style: "max-width:620px", "aria-label": st.note }, els);
}

// --- The page ------------------------------------------------------------------------
export function render(root) {
  const p = readParams();
  const mode = MODES[p.get("mode")] ? p.get("mode") : "paging";
  const state = {
    mode,
    pageSize: Number(p.get("ps") ?? PAGING_EXAMPLE.pageSize), addressBits: Number(p.get("ab") ?? PAGING_EXAMPLE.addressBits),
    pageTable: p.get("pt") ?? PAGING_EXAMPLE.pageTable, tlbSize: Number(p.get("tlb") ?? PAGING_EXAMPLE.tlbSize),
    policy: POLICIES[p.get("pol")] ? p.get("pol") : PAGING_EXAMPLE.policy, addresses: p.get("a") ?? PAGING_EXAMPLE.addresses,
    mem: Number(p.get("m") ?? 100), tlbTime: Number(p.get("t") ?? 20),
    bits: p.get("bits") ?? MULTI_EXAMPLE.bits, mappings: (p.get("map") ?? MULTI_EXAMPLE.mappings).replace(/;/g, "\n"), maddr: p.get("ma") ?? MULTI_EXAMPLE.addresses,
    segments: (p.get("seg") ?? SEGMENT_EXAMPLE.segments).replace(/;/g, "\n"), saddr: p.get("sa") ?? SEGMENT_EXAMPLE.addresses,
  };
  let player = null;
  const head = page({
    subject: "Operating systems", title: "Address translation",
    lede: "Follow a logical address through the MMU: split into bits, looked up in the TLB and page tables (or the segment table), and turned into a physical address.",
    theory: h("div", null,
      h("p", null, h("b", null, "Paging"), " cuts memory into equal pages (logical) and frames (physical). With pages of 2ⁿ bytes, the low n bits of an address are the ", h("b", null, "offset"), " d and the rest is the ", h("b", null, "page number"), " p. The page table maps p to a frame f, and the physical address is f × page size + d."),
      h("p", null, "The page table lives in memory, so every access would cost two memory reads. The ", h("b", null, "TLB"), " is a small, fast cache of recent page → frame mappings. Effective access time: ", h("span", { class: "mono" }, "EAT = h(t + m) + (1 − h)(t + 2m)"), " for hit ratio h, TLB time t and memory time m."),
      h("p", null, "A big address space needs a huge single page table, so ", h("b", null, "multilevel paging"), " pages the page table itself: p1 picks an entry in the outer table that points to an inner table, and so on. Tables for unused regions simply don't exist, but each level costs one more memory access."),
      h("p", null, h("b", null, "Segmentation"), " splits a program into variable-sized segments (code, stack, …). An address is (s, d); the hardware checks d < limit[s] and adds base[s].")),
    conventions: [
      "The TLB is fully associative. Its top row is always the next victim: FIFO keeps load order, LRU moves an entry to the bottom when it's used.",
      "A page fault traps to the OS; the faulting access isn't retried here and nothing is added to the TLB.",
      "EAT counts the TLB lookup on both hits and misses; set the TLB time to 0 to match books that ignore it.",
      "Multilevel mappings are written p1.p2 = frame; any entry not listed is invalid. Segmentation: an offset must be strictly less than the limit.",
    ],
  });

  const modeSel = h("select", { "aria-label": "Scheme", onchange: (e) => { state.mode = e.target.value; drawInputs(); update(); } },
    Object.entries(MODES).map(([k, m]) => h("option", { value: k, selected: k === state.mode }, m.name)));
  const inputs = h("div"), msg = h("div"), out = h("div", { class: "output" });
  const field = (key, label, attrs = {}, numeric = false) => h("label", { class: attrs.stack ? "stack" : "inline" }, `${label} `,
    h(attrs.textarea ? "textarea" : "input", { type: numeric ? "number" : "text", class: numeric ? null : `mono${attrs.stack ? " wide" : ""}`, rows: attrs.textarea ? 5 : null, value: attrs.textarea ? null : state[key], min: attrs.min, max: attrs.max, "aria-label": label,
      [numeric ? "onchange" : "oninput"]: (e) => { state[key] = numeric ? Number(e.target.value) : e.target.value; update(); } }, attrs.textarea ? state[key] : null));

  function drawInputs() {
    const m = state.mode;
    const reset = (ex) => h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(state, ex); drawInputs(); update(); } }, "Textbook example");
    if (m === "paging") {
      inputs.replaceChildren(
        h("div", { class: "row" }, field("pageSize", "Page size (bytes)", { min: 2, max: 65536 }, true), field("addressBits", "Address bits", { min: 2, max: 16 }, true),
          field("tlbSize", "TLB entries", { min: 1, max: 8 }, true),
          h("label", { class: "inline" }, "Replacement ", h("select", { onchange: (e) => { state.policy = e.target.value; update(); } }, Object.entries(POLICIES).map(([k, v]) => h("option", { value: k, selected: k === state.policy }, v))))),
        field("pageTable", "Page table: frame for page 0, 1, 2, … (– for invalid)", { stack: true }),
        field("addresses", "Logical addresses (decimal, 0x hex or 0b binary)", { stack: true }),
        h("div", { class: "row" }, reset({ ...PAGING_EXAMPLE }),
          h("button", { type: "button", class: "btn ghost", onclick: () => { const c = randomPaging(); Object.assign(state, { ...c, pageTable: c.pageTable.map((e) => (e.valid ? e.frame : "-")).join(" "), addresses: c.addresses.join(" ") }); drawInputs(); update(); } }, "Random"),
          h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
    } else if (m === "multilevel") {
      inputs.replaceChildren(
        field("bits", "Bit widths: p1 p2 … offset", { stack: true }),
        field("mappings", "Mappings (one per line: p1.p2 = frame)", { stack: true, textarea: true }),
        field("maddr", "Logical addresses", { stack: true }),
        h("div", { class: "row" }, reset({ ...MULTI_EXAMPLE }),
          h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(state, { bits: "4 4 4 4", mappings: "0.0.1 = 5\n0.0.2 = 6\n15.15.15 = 9", maddr: "0x0012 0x0020 0xFFF8 0x1000" }); drawInputs(); update(); } }, "Three levels"),
          h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
    } else {
      inputs.replaceChildren(
        field("segments", "Segment table (one per line: base limit)", { stack: true, textarea: true }),
        field("saddr", "Logical addresses as (segment, offset)", { stack: true }),
        h("div", { class: "row" }, reset({ ...SEGMENT_EXAMPLE }),
          h("button", { type: "button", class: "btn ghost", onclick: () => { const r = rng(), s = randomSegments(r); state.segments = s.map((x) => `${x.base} ${x.limit}`).join("\n"); state.saddr = Array.from({ length: 5 }, () => { const i = Math.floor(r() * (s.length + (r() < 0.15 ? 1 : 0))); return `(${i}, ${Math.floor(r() * ((s[i]?.limit ?? 300) * 1.25))})`; }).join(" "); drawInputs(); update(); } }, "Random"),
          h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
    }
  }

  function update() {
    player?.destroy();
    const m = state.mode;
    const params = { mode: m };
    if (m === "paging") Object.assign(params, { ps: state.pageSize, ab: state.addressBits, pt: state.pageTable, tlb: state.tlbSize, pol: state.policy, a: state.addresses, m: state.mem, t: state.tlbTime });
    if (m === "multilevel") Object.assign(params, { bits: state.bits, map: state.mappings.split("\n").map((x) => x.trim()).filter(Boolean).join(";"), ma: state.maddr });
    if (m === "segmentation") Object.assign(params, { seg: state.segments.split("\n").map((x) => x.trim()).filter(Boolean).join(";"), sa: state.saddr });
    writeParams(params);
    let res, cfg, draw, extra;
    try {
      if (m === "paging") {
        cfg = { pageSize: state.pageSize, addressBits: state.addressBits, pageTable: parsePageTable(state.pageTable), tlbSize: state.tlbSize, policy: state.policy, addresses: parseAddresses(state.addresses) };
        res = translatePaging(cfg);
        draw = (st) => pagingSvg(st, cfg, res);
      } else if (m === "multilevel") {
        const bits = state.bits.trim().split(/[\s|,]+/).filter(Boolean).map(Number);
        cfg = { bits, mappings: parseMappings(state.mappings), addresses: parseAddresses(state.maddr, 12) };
        res = translateMultilevel(cfg);
        draw = (st) => multiSvg(st, bits, res);
      } else {
        cfg = { segments: parseSegments(state.segments), addresses: parseSegAddresses(state.saddr) };
        res = translateSegments(cfg);
        draw = (st) => segSvg(st, cfg.segments);
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(MODES[m].code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap xl-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" }), counters = h("div", { class: "stats-row" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1000,
      render: (i) => {
        const st = res.steps[i];
        morph(stage, draw(st));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.fault || st.trap ? " bad" : st.done ? " good" : st.hit ? " good" : ""}`;
        if (m === "paging") counters.replaceChildren(stat("TLB hits", st.hits), stat("TLB misses", st.misses), stat("Page faults", st.faults), stat("Addresses", `${Math.min(st.done ? cfg.addresses.length : st.k + 1, cfg.addresses.length)} / ${cfg.addresses.length}`));
        else if (m === "multilevel") counters.replaceChildren(stat("Levels", res.levels), stat("Memory accesses (this address)", st.accesses ?? "–"), stat("Tables that exist", res.tables.size));
        else counters.replaceChildren(stat("Segments", cfg.segments.length), stat("Address", st.done ? "done" : `${st.k + 1} / ${cfg.addresses.length}`));
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, MODES[m].name), player.el, note, traceLayout(stage, code, vars), counters),
      resultsCard(m, res, cfg));
  }

  function resultsCard(m, res, cfg) {
    const rows = res.results;
    if (m === "paging") {
      const eatBox = h("div");
      const drawEat = () => {
        const hr = res.hitRatio, v = eat({ hitRatio: hr, mem: state.mem, tlb: state.tlbTime });
        const t = state.tlbTime, mm = state.mem;
        eatBox.replaceChildren(h("p", { class: "mono xl-eat" }, `EAT = ${fmt(hr, 3)} × (${t} + ${mm}) + ${fmt(1 - hr, 3)} × (${t} + 2×${mm}) = ${fmt(v)} ns`),
          h("p", { class: "muted small" }, `Without a TLB every access would cost 2 × ${mm} = ${2 * mm} ns. Textbook check: 80% hits, t = 20, m = 100 gives ${eat({ hitRatio: 0.8, mem: 100, tlb: 20 })} ns; 98% gives ${fmt(eat({ hitRatio: 0.98, mem: 100, tlb: 20 }))} ns.`));
        writeParams({ ...Object.fromEntries(readParams()), m: state.mem, t: state.tlbTime });
      };
      const num = (key, label) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min: 0, max: 1000, value: state[key], "aria-label": label, oninput: (e) => { state[key] = Number(e.target.value) || 0; drawEat(); } }));
      drawEat();
      return h("section", { class: "card" }, h("h2", null, "Results and effective access time"),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Logical", "p", "d", "TLB", "Frame", "Physical"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, rows.map((r) => h("tr", null, h("th", { scope: "row" }, r.addr), h("td", null, r.p), h("td", null, r.d),
            h("td", { class: r.hit ? "xl-hit" : "xl-miss" }, r.fault ? "miss · fault" : r.hit ? "hit" : "miss"), h("td", null, r.f ?? "–"), h("td", null, r.physical ?? "trap")))))),
        h("div", { class: "stats-row" }, stat("Hit ratio", `${Math.round(res.hitRatio * 100)}%`), stat("Page faults", res.faults)),
        h("div", { class: "row" }, num("mem", "Memory access m (ns)"), num("tlbTime", "TLB lookup t (ns)")), eatBox);
    }
    if (m === "multilevel") {
      const single = 2 ** (res.totalBits - cfg.bits.at(-1));
      const multi = [...res.tables.keys()].reduce((s, k) => s + 2 ** cfg.bits[k === "" ? 0 : k.split(".").length], 0);
      return h("section", { class: "card" }, h("h2", null, "Results"),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Logical", ...cfg.bits.slice(0, -1).map((_, i) => `p${i + 1}`), "d", "Frame", "Physical", "Accesses"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, rows.map((r) => h("tr", null, h("th", { scope: "row", class: "mono" }, hex(r.addr)), r.parts.map((x) => h("td", null, x)), h("td", null, r.frame ?? "–"), h("td", { class: "mono" }, r.physical != null ? hex(r.physical) : "fault"), h("td", null, r.accesses)))))),
        h("p", { class: "muted small" }, `A single-level table would need ${single.toLocaleString("en-GB")} entries; the ${res.tables.size} tables that exist here hold ${multi.toLocaleString("en-GB")} entries between them.`));
    }
    return h("section", { class: "card" }, h("h2", null, "Results"),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, ["(s, d)", "Base", "Limit", "Check", "Physical"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", null, rows.map((r) => { const sg = cfg.segments[r.s]; return h("tr", null, h("th", { scope: "row" }, `(${r.s}, ${r.d})`), h("td", null, sg?.base ?? "–"), h("td", null, sg?.limit ?? "–"),
          h("td", { class: r.trap ? "xl-miss" : "xl-hit" }, !sg ? "no such segment" : r.trap ? `${r.d} ≥ ${sg.limit}` : `${r.d} < ${sg.limit}`), h("td", null, r.trap ? "trap" : r.physical)); })))));
  }

  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, h("div", { class: "row" }, modeSel), inputs, msg), out);

  // --- Practice -------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = Math.floor(r() * 5);
    let body;
    if (kind === 0) {
      const ps = 2 ** (8 + Math.floor(r() * 5)), addr = Math.floor(r() * ps * 64), pg = Math.floor(addr / ps), d = addr % ps;
      body = [h("h2", null, `Pages are ${ps} bytes. For logical address ${addr}, what are the page number and offset?`),
        h("p", { class: "muted" }, `Hint: ${ps} = 2^${log2(ps)}, so the offset is the low ${log2(ps)} bits.`),
        h("p", null, h("b", null, "Page number")), numberQuestion(pg, `${addr} ÷ ${ps} = ${pg} remainder ${d}.`, "Page number"),
        h("p", null, h("b", null, "Offset")), numberQuestion(d, `The offset is ${addr} mod ${ps} = ${d}.`, "Offset")];
    } else if (kind === 1) {
      const c = randomPaging(r);
      const valid = c.addresses.filter((a) => c.pageTable[Math.floor(a / c.pageSize)]?.valid);
      const addr = valid[0] ?? 0;
      if (!c.pageTable[Math.floor(addr / c.pageSize)].valid) c.pageTable[0] = { frame: 3, valid: true };
      const pg = Math.floor(addr / c.pageSize), d = addr % c.pageSize, f = c.pageTable[pg].frame;
      body = [h("h2", null, `Page size ${c.pageSize} bytes. Translate logical address ${addr}.`),
        h("p", { class: "grammar-box mono" }, `Page table: ${c.pageTable.map((e, i) => `${i}→${e.valid ? e.frame : "invalid"}`).join("  ")}`),
        numberQuestion(f * c.pageSize + d, `p = ${pg}, d = ${d}; page ${pg} is in frame ${f}, so ${f} × ${c.pageSize} + ${d} = ${f * c.pageSize + d}.`, "Physical address")];
    } else if (kind === 2) {
      const hr = [0.8, 0.9, 0.95, 0.98, 0.99][Math.floor(r() * 5)], mem = [50, 100, 200][Math.floor(r() * 3)], t = [0, 10, 20][Math.floor(r() * 3)];
      const ans = Math.round(eat({ hitRatio: hr, mem, tlb: t }) * 100) / 100;
      body = [h("h2", null, `TLB hit ratio ${Math.round(hr * 100)}%, memory access ${mem} ns, TLB lookup ${t} ns. What is the effective access time (ns)?`),
        h("p", { class: "muted" }, "A hit costs the lookup plus one memory access; a miss costs the lookup plus two (page table, then data)."),
        numberQuestion(ans, `EAT = ${hr} × (${t} + ${mem}) + ${fmt(1 - hr)} × (${t} + ${2 * mem}) = ${ans} ns.`, "Effective access time")];
    } else if (kind === 3) {
      const addr = Math.floor(r() * 2 ** 32), [p1, p2, d] = splitAddress(addr, [10, 10, 12]);
      const ask = Math.floor(r() * 3), ans = [p1, p2, d][ask], name = ["p1 (outer index)", "p2 (inner index)", "the offset d"][ask];
      body = [h("h2", null, `A 32-bit address with 4 KB pages and a two-level table split 10 | 10 | 12. For ${hex(addr)}, what is ${name}?`),
        h("p", { class: "grammar-box mono" }, toBin(addr, 32).replace(/^(.{10})(.{10})/, "$1 $2 ")),
        numberQuestion(ans, `Bits: ${toBin(addr, 32).replace(/^(.{10})(.{10})/, "$1 | $2 | ")}, so p1 = ${p1}, p2 = ${p2}, d = ${d}.`, "Answer")];
    } else {
      const segs = randomSegments(r), s = Math.floor(r() * segs.length), d = Math.floor(r() * segs[s].limit * 1.4);
      const trap = d >= segs[s].limit, right = trap ? "Trap" : String(segs[s].base + d);
      const opts = new Set([right, "Trap", String(segs[s].base + d), String(segs[s].limit + d), String(segs[(s + 1) % segs.length].base + d)]);
      body = [h("h2", null, `Translate the logical address (${s}, ${d}).`),
        h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, ["Segment", "Base", "Limit"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, segs.map((g, i) => h("tr", null, h("th", { scope: "row" }, i), h("td", null, g.base), h("td", null, g.limit)))))),
        choice([...opts].map((o) => ({ label: o, correct: o === right })), trap ? `${d} ≥ limit ${segs[s].limit}, so the hardware traps.` : `${d} < ${segs[s].limit}, so physical = ${segs[s].base} + ${d} = ${segs[s].base + d}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  drawInputs();
  update();
  return () => player?.destroy();
}
