import { ALGORITHMS, BUDDY_EXAMPLE, buddy, buddyTree, contiguous, EXAMPLE, nextPow2, parseHoles, parseScript, randomHoles, randomScript, scriptText } from "../engines/memory.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";

const W = 680;
const FITS = ["first", "next", "best", "worst"];

// One colour per process name, in the order they first appear in the script.
const palette = (ops) => {
  const names = [...new Set(ops.map((o) => o.name))];
  return (name) => `--c:var(--series-${(names.indexOf(name) % 8 + 8) % 8 + 1})`;
};

const hatch = () => h("defs", null, h("pattern", { id: "mem-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
  h("rect", { width: 6, height: 6, class: "mem-hatch-bg" }), h("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "mem-hatch-line" })));

// Address ticks under a bar, dropping any that would collide.
function ticks(points, x, y) {
  const kept = [...new Set(points)].sort((a, b) => a - b).reduce((k, a) => (k.length && x(a) - x(k.at(-1)) < 26 ? k : [...k, a]), []);
  return h("g", { class: "mem-ticks" }, kept.map((a) => h("text", { x: x(a), y, "text-anchor": "middle" }, a)));
}

// Contiguous memory: holes and blocks along one bar. Blocks are keyed so a hole
// that shrinks slides right as the new block grows in from its left edge.
function barSvg(step, colour) {
  const total = step.stats.total;
  const x = (a) => 12 + (a / total) * (W - 24);
  const y0 = 34, hgt = 54;
  const merge = new Set(step.merge ?? []);
  const els = [hatch()];
  for (const s of step.segs) {
    const x1 = x(s.start), w = Math.max(1, x(s.start + s.size) - x1);
    const cls = ["mem-seg", s.owner ? (s.fixed ? "fixed" : "used") : "hole", step.scan === s.id && "scan", step.pick === s.id && "pick", merge.has(s.id) && "merging",
      step.fresh === s.id && "mem-new", step.merged && step.pick === s.id && "mem-merged"].filter(Boolean).join(" ");
    const keyed = step.fresh === s.id ? {} : { "data-k": `s:${s.id}`, "data-x": x1.toFixed(1), "data-y": 0 };
    const waste = s.req != null && s.size > s.req ? (s.size - s.req) / s.size * w : 0;
    els.push(h("g", { class: cls, style: s.owner && !s.fixed ? colour(s.owner) : null, ...keyed },
      h("rect", { x: x1, y: y0, width: w, height: hgt, rx: 3 }),
      waste ? h("rect", { x: x1 + w - waste, y: y0, width: waste, height: hgt, class: "mem-waste" }) : null,
      w >= 26 ? h("text", { x: x1 + w / 2, y: y0 + 23, "text-anchor": "middle", class: "mem-name" }, s.owner ?? "free") : null,
      w >= 26 ? h("text", { x: x1 + w / 2, y: y0 + 40, "text-anchor": "middle", class: "mem-size" }, s.size) : null,
      h("title", null, `${s.owner ? (s.fixed ? `${s.owner} (already in use)` : `${s.owner}: ${s.req} KB requested`) : "Hole"}, ${s.size} KB at ${s.start}–${s.start + s.size}`)));
  }
  const scan = step.segs.find((s) => s.id === step.scan);
  if (scan) {
    const cx = x(scan.start + scan.size / 2);
    els.push(h("g", { class: "mem-ptr", "data-k": "ptr", "data-x": cx.toFixed(1), "data-y": 0 },
      h("path", { d: `M${cx},${y0 - 4} l-7,-11 h14 z` }), h("text", { x: cx, y: y0 - 19, "text-anchor": "middle" }, "h")));
  }
  let H = y0 + hgt + 22;
  els.push(ticks(step.segs.flatMap((s) => [s.start, s.start + s.size]), x, y0 + hgt + 15));
  if (step.rover != null) {
    const rx = x(step.rover);
    els.push(h("g", { class: "mem-rover", "data-k": "rover", "data-x": rx.toFixed(1), "data-y": 0 },
      h("path", { d: `M${rx},${H - 2} l-6,10 h12 z` }), h("text", { x: rx, y: H + 21, "text-anchor": "middle" }, "rover")));
    H += 26;
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "mem-bar", role: "img", "aria-label": `Memory: ${step.segs.map((s) => `${s.owner ?? "hole"} ${s.size} KB at ${s.start}`).join(", ")}` }, els);
}

// The buddy system: the split tree on top (each block drawn across the
// addresses it covers) and the memory itself along the bottom.
function buddySvg(step, total, colour) {
  const nodes = buddyTree(step.blocks, total);
  const depth = Math.max(...nodes.map((n) => n.depth));
  const x = (a) => 12 + (a / total) * (W - 24);
  const rowH = 40, top = 10, bh = 26;
  const y = (d) => top + d * rowH;
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const els = [hatch()];
  for (const n of nodes) {
    if (!n.depth) continue;
    const p = byKey.get(`${n.start - (n.start % (n.size * 2))}/${n.size * 2}`);
    els.push(h("line", { x1: x(p.start + p.size / 2), y1: y(p.depth) + bh, x2: x(n.start + n.size / 2), y2: y(n.depth), class: "mem-edge", "data-k": `e:${n.key}`, "data-ends": `${p.key}|${n.key}` }));
  }
  for (const n of nodes) {
    const x1 = x(n.start) + 1, w = Math.max(2, x(n.start + n.size) - x(n.start) - 2), yy = y(n.depth);
    const cls = ["mem-node", n.leaf ? (n.owner ? "used" : "hole") : "split", step.hot === n.key && "hot", step.buddy === n.key && "buddy", step.fresh === n.key && "mem-merged"].filter(Boolean).join(" ");
    const label = n.leaf && n.owner ? (w > 44 ? `${n.owner} ${n.size}` : n.owner) : String(n.size);
    els.push(h("g", { class: cls, style: n.owner ? colour(n.owner) : null, "data-k": `n:${n.key}`, "data-x": x1.toFixed(1), "data-y": yy },
      h("rect", { x: x1, y: yy, width: w, height: bh, rx: 4 }),
      w >= 22 ? h("text", { x: x1 + w / 2, y: yy + 17, "text-anchor": "middle" }, label) : null,
      h("title", null, `${n.size} KB block at ${n.start}: ${n.leaf ? (n.owner ? `${n.owner} (asked for ${n.req} KB)` : "free") : "split into two buddies"}`)));
  }
  // The memory bar: just the leaves, with wasted space hatched.
  const by = y(depth) + bh + 26;
  els.push(h("text", { x: 12, y: by - 7, class: "mem-label" }, "Memory"));
  for (const b of step.blocks) {
    const x1 = x(b.start), w = Math.max(1, x(b.start + b.size) - x1);
    const waste = b.req != null ? (b.size - b.req) / b.size * w : 0;
    els.push(h("g", { class: `mem-seg ${b.owner ? "used" : "hole"}${step.hot === `${b.start}/${b.size}` ? " pick" : ""}`, style: b.owner ? colour(b.owner) : null, "data-k": `m:${b.start}/${b.size}`, "data-x": x1.toFixed(1), "data-y": by },
      h("rect", { x: x1, y: by, width: w, height: 34, rx: 2 }),
      waste ? h("rect", { x: x1 + w - waste, y: by, width: waste, height: 34, class: "mem-waste" }) : null,
      w >= 26 ? h("text", { x: x1 + w / 2, y: by + 22, "text-anchor": "middle", class: "mem-name" }, b.owner ?? "") : null));
  }
  const H = by + 34 + 22;
  els.push(ticks(step.blocks.flatMap((b) => [b.start, b.start + b.size]), x, by + 34 + 15));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "mem-bar mem-buddy", role: "img", "aria-label": `Buddy blocks: ${step.blocks.map((b) => `${b.size} KB at ${b.start} ${b.owner ?? "free"}`).join(", ")}` }, els);
}

function fitCompare(holes, ops, unit, current, pick) {
  const rows = FITS.map((id) => {
    try { const r = contiguous(holes, ops, id, { unit }); return { id, ...r.stats, placed: r.placed, failed: r.failed }; } catch { return { id, bad: true }; }
  });
  return h("section", { class: "card" }, h("h2", null, "Same memory and requests, every fit"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Algorithm", "Placed", "Had to wait", "Free at the end", "Largest hole", "Holes"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "current" : null },
        h("th", { scope: "row" }, h("button", { type: "button", class: "linkish", onclick: () => pick(r.id) }, ALGORITHMS[r.id].name)),
        r.bad ? h("td", { colspan: 5 }, "–") : [r.placed, r.failed, `${r.free} KB`, `${r.largest} KB`, r.holes].map((v) => h("td", null, v))))))),
    h("p", { class: "muted small" }, "Best fit leaves the smallest leftovers, which often become slivers too small to use; worst fit keeps the leftovers big. First fit is usually just as good as best fit and faster, because it stops early."));
}

function buddyTable(result) {
  const rows = result.blocks.filter((b) => b.owner);
  return h("section", { class: "card" }, h("h2", null, "Blocks in use at the end"),
    rows.length ? h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Process", "Asked for", "Block", "Address", "Wasted inside"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((b) => h("tr", null, h("th", { scope: "row" }, b.owner), h("td", null, `${b.req} KB`), h("td", null, `${b.size} KB`), h("td", null, b.start), h("td", null, `${b.size - b.req} KB`)))))) : h("p", null, "Everything has been freed, and every pair of buddies has merged back."),
    h("p", { class: "muted small" }, "The buddy system never has holes that can't merge for long (buddies rejoin straight away), but rounding up to a power of two can waste up to almost half of each block."));
}

export function render(root) {
  const p = readParams();
  const algo0 = ALGORITHMS[p.get("algo")] ? p.get("algo") : "first";
  const state = {
    algo: algo0,
    holes: p.get("h") ?? EXAMPLE.holes,
    unit: Number(p.get("u")) || 1,
    total: Number(p.get("t")) || BUDDY_EXAMPLE.total,
    min: Number(p.get("m")) || BUDDY_EXAMPLE.min,
    fitScript: algo0 !== "buddy" && p.get("s") ? p.get("s") : EXAMPLE.script,
    buddyScript: algo0 === "buddy" && p.get("s") ? p.get("s") : BUDDY_EXAMPLE.script,
  };
  let player = null;
  const head = page({
    subject: "Operating systems", title: "Memory allocation",
    lede: "Processes come and go, and memory gets chopped into holes. Watch first, next, best and worst fit choose a hole, and the buddy system split and merge blocks.",
    theory: h("div", null,
      h("p", null, "With ", h("b", null, "contiguous allocation"), " each process gets one unbroken run of memory. Free memory is a list of ", h("b", null, "holes"), ". A request is placed in a hole, which splits: part for the process, the rest stays a hole. When a process ends, its block becomes a hole and merges (", h("b", null, "coalesces"), ") with any hole beside it."),
      h("ul", null,
        h("li", null, h("b", null, "First fit"), " takes the first hole that is big enough. ", h("b", null, "Next fit"), " does the same but carries on from where the last search stopped."),
        h("li", null, h("b", null, "Best fit"), " takes the smallest hole that is big enough; ", h("b", null, "worst fit"), " the largest. Both must scan every hole.")),
      h("p", null, h("b", null, "External fragmentation"), " is free memory split into holes too small to use, even though the total would be enough. ", h("b", null, "Internal fragmentation"), " is memory given to a process that it doesn't use, because requests are rounded up."),
      h("p", null, "The ", h("b", null, "buddy system"), " only uses blocks whose size is a power of two. To serve a request it halves a block until the next halving would be too small; the two halves are ", h("b", null, "buddies"), ". When both buddies are free again they merge straight back, which is fast because a block's buddy is at address start XOR size.")),
    conventions: [
      "Sizes are in KB and memory is drawn with address 0 on the left. The holes you type are separated by blocks already in use (U1, U2, …, 40 KB each), which you can free in the script.",
      "Script: “A 212” allocates 212 KB to A; “free A” releases it. Separate operations with ; or new lines.",
      "Best and worst fit break ties by the lower address. Next fit resumes at the hole containing the end of its last allocation and wraps round once.",
      "Requests are rounded up to the allocation unit (1 KB means no rounding). A request that doesn't fit waits and is not retried.",
      "Buddy system: requests round up to a power of two, at least the minimum block; the smallest free block that fits is split, lowest address first.",
    ],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([k, a]) => h("option", { value: k, selected: k === state.algo }, a.name)));
  const holesIn = h("input", { type: "text", class: "mono wide", value: state.holes, "aria-label": "Hole sizes", oninput: (e) => { state.holes = e.target.value; update(); } });
  const scriptIn = h("textarea", { rows: 2, class: "mono", "aria-label": "Allocation script", oninput: (e) => { state[state.algo === "buddy" ? "buddyScript" : "fitScript"] = e.target.value; update(); } });
  const num = (key, label, opts) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", value: state[key], "aria-label": label, ...opts, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const unitIn = num("unit", "Allocation unit (KB)", { min: 1, max: 1024 });
  const totalIn = h("label", { class: "inline" }, "Memory (KB) ", h("select", { "aria-label": "Total memory", onchange: (e) => { state.total = Number(e.target.value); update(); } }, [64, 128, 256, 512, 1024, 2048, 4096].map((v) => h("option", { value: v, selected: v === state.total }, v))));
  const minIn = h("label", { class: "inline" }, "Smallest block ", h("select", { "aria-label": "Smallest block", onchange: (e) => { state.min = Number(e.target.value); update(); } }, [1, 2, 4, 8, 16, 32, 64, 128].map((v) => h("option", { value: v, selected: v === state.min }, v))));
  const holesRow = h("label", { class: "stack" }, "Hole sizes in address order (KB)", holesIn);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    const isBuddy = state.algo === "buddy";
    const script = isBuddy ? state.buddyScript : state.fitScript;
    algoSel.value = state.algo;
    scriptIn.value = script;
    holesRow.hidden = isBuddy; unitIn.hidden = isBuddy; totalIn.hidden = !isBuddy; minIn.hidden = !isBuddy;
    writeParams(isBuddy ? { algo: state.algo, t: state.total, m: state.min, s: script } : { algo: state.algo, h: state.holes, u: state.unit, s: script });
    let ops, holes, res;
    try {
      ops = parseScript(script);
      if (isBuddy) res = buddy(ops, { total: state.total, min: state.min });
      else { holes = parseHoles(state.holes); res = contiguous(holes, ops, state.algo, { unit: state.unit }); }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const spec = ALGORITHMS[state.algo], colour = palette(ops);
    const code = codePanel(spec.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap mem-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const opsList = h("ol", { class: "mem-ops" });
    const counters = h("div", { class: "stats-row" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = res.steps[i];
        morph(stage, isBuddy ? buddySvg(st, state.total, colour) : barSvg(st, colour));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.failedOp ? " bad" : st.done ? " good" : ""}`;
        const failedOps = new Set(res.steps.slice(0, i + 1).filter((s) => s.failedOp).map((s) => s.op));
        opsList.replaceChildren(...ops.map((o, k) => h("li", { class: [k === st.op && "now", (st.op ?? (st.done ? ops.length : -1)) > k && "past", failedOps.has(k) && "failed"].filter(Boolean).join(" ") || null, style: colour(o.name) },
          o.op === "free" ? `free ${o.name}` : `${o.name} ${o.size}`)));
        const s = st.stats;
        counters.replaceChildren(stat("Free", `${s.free} KB`), stat(isBuddy ? "Largest free block" : "Largest hole", `${s.largest} KB`), stat(isBuddy ? "Free blocks" : "Holes", s.holes),
          stat("Internal fragmentation", `${s.internal} KB`), stat("Had to wait", st.failed));
      },
    });
    const legend = h("div", { class: "legend-chips" },
      h("span", null, h("i", { class: "mem-key-hole" }), "Hole (free)"), isBuddy ? h("span", null, h("i", { class: "mem-key-split" }), "Split block") : h("span", null, h("i", { class: "mem-key-fixed" }), "Already in use"),
      h("span", null, h("i", { class: "mem-key-waste" }), "Internal fragmentation"), isBuddy ? h("span", null, h("i", { class: "mem-key-buddy" }), "Buddy being checked") : h("span", null, h("i", { class: "mem-key-pick" }), "Chosen / candidate hole"));
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, spec.name), player.el, note,
        traceLayout(h("div", null, opsList, stage, legend), code, vars), counters),
      isBuddy ? buddyTable(res) : fitCompare(holes, ops, state.unit, state.algo, (id) => { state.algo = id; update(); }));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, unitIn, totalIn, minIn,
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(state, { holes: EXAMPLE.holes, fitScript: EXAMPLE.script, buddyScript: BUDDY_EXAMPLE.script, unit: 1, total: BUDDY_EXAMPLE.total, min: BUDDY_EXAMPLE.min }); holesIn.value = state.holes; totalIn.querySelector("select").value = state.total; minIn.querySelector("select").value = state.min; unitIn.querySelector("input").value = 1; update(); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const r = rng();
          if (state.algo === "buddy") state.buddyScript = scriptText(randomScript(r, 7 + Math.floor(r() * 4), state.total / 3));
          else { state.holes = randomHoles(r).join(" "); holesIn.value = state.holes; state.fitScript = scriptText(randomScript(r)); }
          update();
        } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      holesRow,
      h("label", { class: "stack" }, "Requests, in order (e.g. A 212; B 417; free A)", scriptIn),
      msg),
    out);

  // --- Practice ----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = Math.floor(r() * 4);
    let body;
    if (kind === 0) {
      const holes = randomHoles(r, 5), algo = ["first", "best", "worst"][Math.floor(r() * 3)];
      const size = 10 * (5 + Math.floor(r() * Math.max(...holes) / 10));
      const res = contiguous(holes, [{ op: "alloc", name: "P", size }], algo);
      const placed = res.steps.find((s) => s.fresh);
      const hit = placed ? holes.findIndex((_, i) => res.steps[0].segs.filter((s) => !s.owner)[i].start === placed.segs.find((s) => s.id === placed.fresh).start) : -1;
      body = [h("h2", null, `${ALGORITHMS[algo].name}: which hole does a ${size} KB request go into?`),
        h("p", { class: "grammar-box" }, `Holes in address order: ${holes.map((x, i) => `#${i + 1} ${x} KB`).join(", ")}`),
        choice([...holes.map((x, i) => ({ label: `#${i + 1} (${x} KB)`, correct: i === hit })), { label: "None: it waits", correct: hit === -1 }], placed ? placed.note : res.steps.find((s) => s.failedOp).note)];
    } else if (kind === 1) {
      const holes = randomHoles(r, 5), algo = FITS[Math.floor(r() * 4)];
      const ops = Array.from({ length: 4 }, (_, i) => ({ op: "alloc", name: `P${i + 1}`, size: 10 * (8 + Math.floor(r() * 45)) }));
      const res = contiguous(holes, ops, algo);
      body = [h("h2", null, `${ALGORITHMS[algo].name}: how many of these requests have to wait?`),
        h("p", { class: "grammar-box" }, `Holes: ${holes.join(", ")} KB (in address order) · Requests: ${ops.map((o) => `${o.name} ${o.size}`).join(", ")}`),
        h("p", { class: "muted" }, "A hole that's used keeps its leftover piece as a smaller hole. Requests that don't fit wait and aren't retried."),
        numberQuestion(res.failed, `Placements: ${res.steps.filter((s) => s.fresh || s.failedOp).map((s) => s.note.split(".")[0]).join("; ")}.`)];
    } else if (kind === 2) {
      const n = 1 + Math.floor(r() * 500), min = 16, k = Math.max(min, nextPow2(n));
      body = [h("h2", null, `Buddy system, 1024 KB, smallest block ${min} KB: a process asks for ${n} KB. How many KB are lost to internal fragmentation?`),
        numberQuestion(k - n, `It rounds up to the next power of two, ${k} KB, so ${k} − ${n} = ${k - n} KB is wasted.`)];
    } else {
      const ops = Array.from({ length: 3 }, (_, i) => ({ op: "alloc", name: String.fromCharCode(65 + i), size: 8 + Math.floor(r() * 250) }));
      const res = buddy(ops, { total: 1024, min: 16 });
      const last = res.blocks.find((b) => b.owner === "C");
      body = [h("h2", null, "Buddy system, 1024 KB of memory starting at address 0: at what address does C go?"),
        h("p", { class: "grammar-box" }, ops.map((o) => `${o.name} ${o.size} KB`).join(", then ")),
        h("p", { class: "muted" }, "Round each request up to a power of two, use the smallest free block that fits (lowest address on ties), and split it in half as often as needed, keeping the left half."),
        last ? numberQuestion(last.start, `Blocks: ${res.blocks.map((b) => `${b.owner ?? "free"} ${b.size} KB at ${b.start}`).join(", ")}.`) : h("p", null, "C doesn't fit. Try another question.")];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
