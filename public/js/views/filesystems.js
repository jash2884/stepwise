import { allocation, BLOCK_SIZES, commas, human, indexBlocks, inodeCapacity, INODE_CODE, LEVELS, locate, POINTER_SIZES } from "../engines/filesystems.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";

const REGION_COLOUR = { direct: 1, single: 2, double: 3, triple: 4 };
const colourOf = (id) => `var(--series-${REGION_COLOUR[id] ?? 7})`;

// The inode on the left, and the chain of index blocks to the data block for
// the current step. Earlier steps show the inode alone.
function inodeSvg(r, step) {
  const W = 600, SH = 24, top = 34, IX = 8, IW = 140;
  const slots = [];
  const directShown = r.d <= 8 ? [...Array(r.d).keys()] : [0, 1, 2, null, r.d - 1];
  for (const i of directShown) slots.push(i === null ? { gap: true, region: "direct" } : { region: "direct", i, label: `direct ${i}` });
  for (const g of LEVELS.slice(1)) for (let i = 0; i < r[g.id === "single" ? "s" : g.id === "double" ? "dd" : "t"]; i++) slots.push({ region: g.id, i, label: `${g.name.toLowerCase()}${i ? ` ${i}` : ""}` });
  const H = Math.max(top + slots.length * SH + 40, 200);
  const els = [h("text", { x: IX, y: 18, class: "fs-title" }, "inode"),
    h("rect", { x: IX, y: top - 6, width: IW, height: slots.length * SH + 12, rx: 8, class: "fs-inode" })];
  const onPath = (s) => step.path?.length && s.region === step.region && s.i === step.path[0];
  slots.forEach((s, k) => {
    const y = top + k * SH;
    if (s.gap) { els.push(h("text", { x: IX + 12, y: y + 14, class: "fs-dim" }, "⋮")); return; }
    const hot = onPath(s), lit = !step.region && step.line === 2;
    els.push(h("g", { class: `fs-slot${hot ? " on" : ""}${lit ? " lit" : ""}`, style: `--c:${colourOf(s.region)}` },
      h("rect", { x: IX + 6, y, width: IW - 12, height: SH - 3, rx: 4 }),
      h("text", { x: IX + 12, y: y + 14 }, s.label)));
  });
  if (step.path?.length) {
    const slot = slots.findIndex(onPath);
    const sy = top + slot * SH + (SH - 3) / 2;
    const cols = [180, 290, 400], DX = 505, BW = 92;
    const blockH = 86, by = Math.max(top, Math.min(sy - blockH / 2, H - blockH - 10));
    let px = IX + IW - 6, py = sy;
    const depth = step.path.length - 1;
    for (let lvl = 1; lvl <= depth; lvl++) {
      const x = cols[lvl - 1], e = step.path[lvl];
      const ey = by + 30 + Math.round((e / Math.max(1, r.k - 1)) * (blockH - 52));
      els.push(h("path", { d: `M${px},${py} C${px + 30},${py} ${x - 30},${by + 10} ${x},${by + 10}`, class: "fs-link", "data-k": `l:${lvl}`, "data-ends": `${lvl - 1}|${lvl}` }),
        h("g", { class: "fs-index", "data-k": `b:${lvl}`, "data-x": x, "data-y": by, style: `--c:${colourOf(step.region)}` },
          h("rect", { x, y: by, width: BW, height: blockH, rx: 6 }),
          h("text", { x: x + 6, y: by + 14, class: "fs-cap" }, `level ${lvl} index`), h("text", { x: x + 6, y: by + blockH - 6, class: "fs-cap" }, `${commas(r.k)} pointers`),
          h("rect", { x: x + 3, y: ey - 10, width: BW - 6, height: 16, rx: 3, class: "fs-entry" }),
          h("text", { x: x + 7, y: ey + 3, class: "fs-entry-t" }, `entry ${commas(e)}`)));
      px = x + BW - 4; py = ey - 2;
    }
    els.push(h("path", { d: `M${px},${py} C${px + 30},${py} ${DX - 30},${by + 30} ${DX},${by + 30}`, class: "fs-link on" }),
      h("g", { class: `fs-data${step.done ? " on" : ""}`, "data-k": "d:0", "data-x": DX, "data-y": by + 8 },
        h("rect", { x: DX, y: by + 8, width: 88, height: 44, rx: 6 }),
        h("text", { x: DX + 8, y: by + 26, class: "fs-cap" }, `data block`),
        h("text", { x: DX + 8, y: by + 42, class: "fs-entry-t" }, `byte ${r.r}`)));
  } else if (step.line === 2) {
    els.push(h("text", { x: 180, y: top + 14, class: "fs-cap" }, "Blocks each kind of pointer reaches:"));
    r.regions.filter((g) => g.pointers).forEach((g, i) => els.push(h("g", { class: "fs-slot lit", style: `--c:${colourOf(g.id)}` },
      h("rect", { x: 180, y: top + 26 + i * 26, width: 14, height: 14, rx: 3 }),
      h("text", { x: 201, y: top + 37 + i * 26 }, `${g.name}: ${g.pointers} × k${["", "", "²", "³"][g.depth]} = ${commas(g.blocks)} blocks`))));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "fs-svg", role: "img", "aria-label": step.path?.length ? `Path: ${step.region} pointer ${step.path[0]}, entries ${step.path.slice(1).join(", ") || "none"}` : "The inode's pointers" }, els);
}

export function render(root) {
  const p = readParams();
  const num = (k, d) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : d);
  const state = { B: num("b", 4096), p: num("p", 4), d: num("d", 12), s: num("s", 1), dd: num("dd", 1), t: num("t", 1), x: num("x", 5000000), inode: p.get("inode") === "1", size: num("size", 10485760) };
  const head = page({
    subject: "Operating systems", title: "File systems and inodes",
    lede: "Find the biggest file an inode can describe, then follow its pointers to any byte and count the disk reads. Compare contiguous, linked and indexed allocation on the same file.",
    theory: h("div", null,
      h("p", null, "A Unix ", h("b", null, "inode"), " holds a file's metadata and a list of block pointers. The first ", h("b", null, "d direct"), " pointers point straight at data blocks. A ", h("b", null, "single indirect"), " pointer points at an index block full of pointers to data blocks; a ", h("b", null, "double indirect"), " one at an index block of single indirect blocks; a ", h("b", null, "triple indirect"), " one goes one level deeper."),
      h("p", null, "An index block of B bytes holds ", h("b", null, "k = B ÷ p"), " pointers of p bytes, so the file can have at most ", h("b", null, "d + k + k² + k³"), " blocks, and the ", h("b", null, "maximum file size"), " is that times B. Small files use only the fast direct pointers; huge ones pay one more disk read per level."),
      h("p", null, "To find byte x: the logical block is ", h("b", null, "n = ⌊x ÷ B⌋"), ". Subtract each region's size in turn (d, then k, then k²) until n fits; the number of index levels on the way plus one for the data block is the number of ", h("b", null, "block accesses"), "."),
      h("p", null, h("b", null, "Contiguous"), " allocation stores a start block and a length: any block is one calculation away, but files can't grow easily and free space fragments. ", h("b", null, "Linked"), " allocation chains blocks with a pointer in each, so reading block i means reading i blocks before it (FAT keeps the chain in a table in memory to avoid that). ", h("b", null, "Indexed"), " allocation gathers the pointers into index blocks, like the inode.")),
    conventions: [
      "k = B ÷ p pointers fit in an index block; sizes use 1 KB = 1024 bytes.",
      "The inode is already in memory (read when the file was opened), so it costs no disk access unless you tick the box.",
      "Block accesses = index blocks read on the way + 1 for the data block.",
      "Offsets and block numbers start at 0.",
      "Linked allocation keeps the next pointer inside each block (B − p bytes of data per block). Indexed allocation adds index levels until one block can point at the rest.",
      "A p-byte pointer can name 2^(8p) blocks, which also limits the disk; if that is smaller than the inode's limit, the disk wins.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" }), allocOut = h("div");
  const sel = (key, label, list, fmtv = (v) => v) => h("label", { class: "inline" }, `${label} `, h("select", { "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } },
    list.map((v) => h("option", { value: v, selected: v === state[key] }, fmtv(v)))));
  const field = (key, label, min, max, width = 90) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], style: `width:${width}px`, "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));

  let player = null;
  function update() {
    player?.destroy(); player = null;
    writeParams({ b: state.B, p: state.p, d: state.d, s: state.s, dd: state.dd, t: state.t, x: state.x, size: state.size, ...(state.inode ? { inode: 1 } : {}) });
    let r;
    try { r = locate({ ...state, countInode: state.inode }); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); allocOut.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(INODE_CODE), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: r.steps.length, label: "Step", interval: 1600, render: (i) => {
      const st = r.steps[i];
      morph(stage, inodeSvg(r, st));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.done ? " good" : ""}`;
    } });
    let idx = null;
    try { idx = indexBlocks(state, state.size); } catch { idx = null; }
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `Byte ${commas(state.x)}: ${r.reads} block access${r.reads === 1 ? "" : "es"}`), player.el, note, traceLayout(stage, code, vars)),
      h("section", { class: "card" }, h("h2", null, "How big can a file get?"),
        h("div", { class: "stats-row" }, stat("Pointers per block (k)", commas(r.k)), stat("Max blocks", commas(r.maxBlocks)), stat("Max file size", human(r.maxBytes)), stat("Disk limit (2^" + 8 * state.p + " blocks)", human(r.diskBytes))),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Pointer", "Count", "Blocks reached", "Logical blocks", "Bytes", "Reads"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, r.regions.map((g) => h("tr", { class: g.id === r.region ? "current" : null },
            h("th", { scope: "row" }, h("span", { class: "swatch", style: `--c:${colourOf(g.id)}` }), g.name), h("td", null, g.pointers), h("td", null, commas(g.blocks)),
            h("td", { class: "mono" }, g.blocks ? `${commas(g.first)} to ${commas(g.first + g.blocks - 1n)}` : "none"), h("td", null, human(g.bytes)), h("td", null, g.depth + 1 + (state.inode ? 1 : 0))))),
          h("tfoot", null, h("tr", null, h("th", { scope: "row", colspan: 2 }, "Total"), h("td", null, commas(r.maxBlocks)), h("td"), h("td", null, `${commas(r.maxBytes)} bytes`), h("td")))))),
      );
    drawAllocation(idx);
  }

  function drawAllocation(idx) {
    let a;
    try { a = allocation({ B: state.B, p: state.p, size: state.size, x: state.x }); } catch (e) {
      allocOut.replaceChildren(h("section", { class: "card" }, h("h2", null, "Contiguous, linked or indexed?"), sizeRow(), notice("info", e.message))); return;
    }
    allocOut.replaceChildren(h("section", { class: "card" }, h("h2", null, "Contiguous, linked or indexed?"), sizeRow(),
      h("p", { class: "muted small" }, `A file of ${human(state.size)} is ${commas(a.blocks)} blocks of ${state.B} bytes.${idx != null ? ` In the inode above it needs ${commas(idx)} index block${idx === 1n ? "" : "s"}.` : ""} Reads to reach byte ${commas(state.x)}, from a cold start:`),
      h("div", { class: "fs-bars" }, a.rows.map((row) => {
        const max = Math.max(...a.rows.map((x) => x.reads));
        return h("div", { class: "fs-bar", style: `--c:var(--series-${a.rows.indexOf(row) + 5})` },
          h("span", null, row.name), h("i", { style: `width:${Math.max(4, (100 * row.reads) / max)}%` }), h("b", null, commas(row.reads)));
      })),
      h("div", { class: "table-wrap" }, h("table", { class: "fs-table" },
        h("thead", null, h("tr", null, ["Method", "Blocks used", "Space overhead", "Reads to byte x", "Why", "Good", "Bad"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, a.rows.map((row) => h("tr", null, h("th", { scope: "row" }, row.name), h("td", null, commas(row.blocks)), h("td", null, `${commas(row.overhead)} B`), h("td", null, commas(row.reads)),
          h("td", { class: "left small" }, row.why), h("td", { class: "left small" }, row.good), h("td", { class: "left small" }, row.bad))))))));
  }
  const sizeRow = () => h("div", { class: "row" }, field("size", "File size (bytes)", 1, 1e12, 140), h("span", { class: "muted small" }, `= ${human(state.size)}; byte offset is shared with the inode above`));

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" },
        sel("B", "Block size", BLOCK_SIZES, (v) => (v >= 1024 ? `${v / 1024} KB` : `${v} B`)), sel("p", "Pointer size", POINTER_SIZES, (v) => `${v} B`),
        field("d", "Direct", 0, 64, 64), field("s", "Single", 0, 4, 56), field("dd", "Double", 0, 4, 56), field("t", "Triple", 0, 4, 56)),
      h("div", { class: "row" },
        field("x", "Byte offset x", 0, Number.MAX_SAFE_INTEGER, 170),
        h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.inode, onchange: (e) => { state.inode = e.target.checked; update(); } }), " count reading the inode"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(state, { B: 1024, p: 4, d: 10, s: 1, dd: 1, t: 1, x: 70000 }); rebuild(); } }, "Classic Unix (1 KB, 10 direct)"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(state, { B: 4096, p: 4, d: 12, s: 1, dd: 1, t: 0, x: 4 * 1024 * 1024 }); rebuild(); } }, "GATE 2019 (no triple)"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out, allocOut);
  const rebuild = () => { writeParams({ b: state.B, p: state.p, d: state.d, s: state.s, dd: state.dd, t: state.t, x: state.x, size: state.size }); player?.destroy(); render(root); };

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const pick = (list) => list[Math.floor(r() * list.length)];
    const o = { B: pick([512, 1024, 2048, 4096]), p: pick([4, 4, 8]), d: pick([8, 10, 12]), s: 1, dd: 1, t: pick([0, 1, 1]) };
    const cap = inodeCapacity(o);
    const region = pick(cap.regions.filter((g) => g.pointers));
    const blk = region.first + BigInt(Math.floor(r() * Math.min(Number(region.blocks), 1e9)));
    const x = blk * BigInt(o.B) + BigInt(Math.floor(r() * o.B));
    const res = locate({ ...o, x });
    const kind = pick(["k", "max", "reads", "region"]);
    const desc = `An inode has ${o.d} direct pointers, 1 single indirect${o.t ? ", 1 double indirect and 1 triple indirect" : " and 1 double indirect"} pointer. Blocks are ${o.B} bytes and a block pointer is ${o.p} bytes.`;
    let q, body;
    const working = h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note)));
    if (kind === "k") { q = "How many pointers fit in one index block?"; body = numberQuestion(cap.k, `k = ${o.B} ÷ ${o.p}.`); }
    else if (kind === "max") { q = "What is the maximum file size, in blocks?"; body = numberQuestion(Number(cap.maxBlocks), `${cap.regions.filter((g) => g.pointers).map((g) => commas(g.blocks)).join(" + ")} = ${commas(cap.maxBlocks)} blocks, about ${human(cap.maxBytes)}.`); }
    else if (kind === "reads") { q = `How many disk block reads does it take to read byte ${commas(x)}? The inode is already in memory.`; body = numberQuestion(res.reads, res.steps.at(-2).note); }
    else {
      q = `Which pointer leads to byte ${commas(x)}?`;
      body = choice(cap.regions.filter((g) => g.pointers).map((g) => ({ label: g.name, correct: g.id === res.region })), res.steps.at(-2).note);
    }
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("p", null, desc), h("h2", null, q), body,
      h("details", null, h("summary", null, "Full working"), working)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
