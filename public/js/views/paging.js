import { codePanel, traceLayout, varsPanel } from "../code.js";
import { ALGORITHMS, beladyCheck, CLASS_NAMES, formatAccesses, NRU_TICK, parseAccesses, randomRefs, randomWrites, replace, workingSet } from "../engines/paging.js";
import { copyLink, h, morph, notice, page, readParams, reducedMotion, rng, stepper, tabs, writeParams } from "../ui.js";
import { stat } from "./kit.js";

const BOOK = "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1";
// NRU needs writes: 2 and 3 get dirty, and the ticks after references 4 and 8
// show class 0 and then class 1 being chosen ahead of a recently used page.
const NRU_EXAMPLE = "1 2w 3 4 2 5 3w 1 6 7";

// Frames × time grid; columns after `upto` stay hidden until the step reaches them.
// For NRU each cell also shows that frame's R and M bits after the reference,
// and a ⏱ over a column marks the clock tick that cleared every R bit first.
function grid(refs, steps, frameCount, upto, { current = upto, writes = [], bits = false } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: `frames${bits ? " nru" : ""}` },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Ref"), refs.map((r, i) => h("th", { scope: "col", class: i === current ? "now" : i > upto ? "future" : null, title: writes[i] ? "write" : null }, bits && steps[i].tick ? h("span", { class: "tick", title: "clock tick: R bits cleared" }, "⏱") : null, `${r}${writes[i] ? "w" : ""}`)))),
    h("tbody", null,
      Array.from({ length: frameCount }, (_, f) => h("tr", null, h("th", { scope: "row" }, `F${f + 1}`), steps.map((s, i) => {
        if (i > upto) return h("td", { class: "future" });
        const v = s.frames[f];
        const changed = !s.hit && s.slot === f;
        return h("td", { class: [changed ? "loaded" : "", s.hit && s.slot === f ? "hitcell" : "", i === current ? "now" : ""].join(" ").trim() || null }, v ?? "",
          bits && v !== null ? h("small", { class: "rm", title: `R = ${s.R[f]}, M = ${s.M[f]}` }, `${s.R[f]}${s.M[f]}`) : null);
      }))),
      h("tr", { class: "outcome" }, h("th", { scope: "row" }, ""), steps.map((s, i) => h("td", { class: i > upto ? "future" : s.hit ? "hit" : "miss" }, i > upto ? "" : s.hit ? "✓" : "F"))))));
}

// Which load ("residency") each frame holds at each step, so a page keeps the
// same key while it stays in memory and the next reference can glide into its frame.
function residency(steps, frameCount) {
  const since = Array(frameCount).fill(null);
  return steps.map((s, i) => {
    const gone = s.hit ? null : since[s.slot];
    if (!s.hit) since[s.slot] = i;
    return { since: [...since], gone };
  });
}

const pageTok = (key, pg, x, y, cls) => h("g", { class: `pf-tok${cls}`, "data-k": key, "data-x": x, "data-y": y },
  h("rect", { x, y, width: 44, height: 36, rx: 8 }), h("text", { x: x + 22, y: y + 24, "text-anchor": "middle" }, pg));

// Frames as boxes. The next reference waits above the frame it will land in,
// then drops in; an evicted page slides down and out.
function framesSvg(steps, res, i, frameCount, nru = false) {
  const BW = nru ? 76 : 58, GAP = 14, X0 = 16, FY = 78, FH = nru ? 70 : 50, LY = FY + FH + 16, TX = (BW - 44) / 2, W = Math.max(300, X0 * 2 + frameCount * (BW + GAP));
  const s = steps[i], r = res[i], next = steps[i + 1];
  const x = (k) => X0 + k * (BW + GAP);
  const els = [h("text", { x: X0, y: 16, class: "pf-label" }, next ? `Next reference: page ${next.page}` : "End of the reference string")];
  for (let k = 0; k < frameCount; k++) {
    const cls = k === s.slot ? (s.hit ? " hit" : " loaded") : "";
    els.push(h("rect", { x: x(k), y: FY, width: BW, height: FH, rx: 10, class: `pf-frame${cls}` }),
      h("text", { x: x(k) + BW / 2, y: LY, "text-anchor": "middle", class: "pf-label" }, nru && s.frames[k] !== null ? `F${k + 1} · class ${s.classes[k]}` : `F${k + 1}`));
    if (nru && s.frames[k] !== null) els.push(h("text", { x: x(k) + BW / 2, y: FY + 60, "text-anchor": "middle", class: "pf-bits" }, `R${s.R[k]} M${s.M[k]}`));
    if (s.frames[k] !== null) els.push(pageTok(`r:${r.since[k]}`, s.frames[k], x(k) + TX, FY + 7, k === s.slot ? (s.hit ? " hit" : " new") : ""));
  }
  if (next) els.push(pageTok(`r:${i + 1}`, next.page, x(next.slot) + TX, 24, " incoming"));
  if (s.victim != null) els.push(pageTok(`r:${r.gone}`, s.victim, x(s.slot) + TX, LY + 8, " evicted"), h("text", { x: x(s.slot) + TX + 49, y: LY + 32, class: "pf-label" }, "out"));
  return h("svg", { viewBox: `0 0 ${W} ${LY + 50}`, class: "pf-svg", role: "img", style: `max-width:${W * 1.4}px`, "aria-label": `Frames: ${s.frames.map((v) => v ?? "empty").join(", ")}` }, els);
}

// NRU's four classes as buckets: where each page in memory stood when this
// reference arrived (after any clock tick), which is what an eviction looks at.
function classesSvg(steps, i) {
  const s = steps[i], BW = 78, GAP = 8, TW = 34, W = 4 * BW + 3 * GAP, H = 40 + Math.ceil(Math.max(1, s.frames.length) / 2) * 40 + 8;
  const occupied = s.before.filter((c) => c !== null);
  const lowest = occupied.length ? Math.min(...occupied) : null;
  const els = [];
  for (let c = 0; c < 4; c++) {
    const bx = c * (BW + GAP), members = s.before.map((v, k) => [v, k]).filter(([v]) => v === c);
    const decided = s.victim != null && c === lowest;
    els.push(h("rect", { x: bx, y: 0, width: BW, height: H, rx: 9, class: `nru-bucket${decided ? " lowest" : ""}` }),
      h("text", { x: bx + BW / 2, y: 15, "text-anchor": "middle", class: "pf-label" }, `Class ${c}`),
      h("text", { x: bx + BW / 2, y: 29, "text-anchor": "middle", class: "pf-bits" }, `R${c >> 1} M${c & 1}`));
    members.forEach(([, k], j) => {
      // The page this frame held before the reference (the victim if it was replaced).
      const pg = !s.hit && s.slot === k && s.victim != null ? s.victim : s.frames[k];
      const tx = bx + 4 + (j % 2) * (TW + 2), ty = 38 + Math.floor(j / 2) * 40;
      els.push(h("g", { class: `pf-tok small${pg === s.victim && s.victim != null ? " evicted-pick" : ""}`, "data-k": `c:${pg}`, "data-x": tx, "data-y": ty },
        h("rect", { x: tx, y: ty, width: TW, height: 32, rx: 7 }), h("text", { x: tx + TW / 2, y: ty + 21, "text-anchor": "middle" }, pg)));
    });
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "pf-svg nru-svg", role: "img", "aria-label": `Classes when page ${s.page} arrived: ${[0, 1, 2, 3].map((c) => `class ${c}: ${s.before.map((v, k) => (v === c ? (!s.hit && s.slot === k && s.victim != null ? s.victim : s.frames[k]) : null)).filter((x) => x !== null).join(", ") || "empty"}`).join("; ")}` }, els);
}

// The clock: frames round a circle with their reference bits, and a hand that
// turns forward through every frame it gives a second chance to.
function clockView(steps, n) {
  const C = 130, R = 92;
  const pos = (k) => { const a = (k / n) * 2 * Math.PI - Math.PI / 2; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
  const slots = Array.from({ length: n }, (_, k) => {
    const [cx, cy] = pos(k);
    const box = h("rect", { x: cx - 27, y: cy - 23, width: 54, height: 46, rx: 9, class: "ck-frame" });
    const pg = h("text", { x: cx, y: cy + 2, "text-anchor": "middle", class: "ck-page" });
    const bit = h("text", { x: cx, y: cy + 17, "text-anchor": "middle", class: "ck-bit" });
    return { g: h("g", null, box, pg, bit, h("text", { x: cx, y: cy - 28, "text-anchor": "middle", class: "pf-label" }, `F${k + 1}`)), box, pg, bit };
  });
  const hand = h("g", { class: "ck-hand" }, h("line", { x1: C, y1: C, x2: C, y2: C - R + 32 }), h("path", { d: `M${C - 7},${C - R + 38} L${C},${C - R + 26} L${C + 7},${C - R + 38} z` }));
  const svg = h("svg", { viewBox: `0 0 ${2 * C} ${2 * C}`, class: "ck-svg", role: "img" },
    h("circle", { cx: C, cy: C, r: R, class: "ck-ring" }), hand, h("circle", { cx: C, cy: C, r: 6, class: "ck-hub" }), slots.map((x) => x.g));
  // Cumulative hand moves, so the hand always turns clockwise (a full sweep is a full turn).
  let prev = 0, total = 0;
  const cum = steps.map((s) => {
    const moved = s.sweep && s.sweep.length > n ? n + 1 : (((s.hand - prev) % n) + n) % n;
    total += moved; prev = s.hand;
    return total;
  });
  let shown = 0;
  return {
    el: svg,
    show(i) {
      const s = steps[i];
      slots.forEach((x, k) => {
        x.pg.textContent = s.frames[k] ?? "";
        x.bit.textContent = s.frames[k] === null ? "empty" : `ref ${s.ref[k]}`;
        x.box.setAttribute("class", `ck-frame${k === s.slot ? (s.hit ? " hit" : " loaded") : ""}${!s.hit && s.sweep?.includes(k) && k !== s.slot ? " swept" : ""}`);
      });
      const moves = Math.abs(cum[i] - shown);
      hand.style.transitionDuration = reducedMotion() ? "0s" : `${Math.min(1.6, 0.3 + 0.22 * moves)}s`;
      hand.style.transform = `rotate(${(cum[i] * 360) / n}deg)`;
      shown = cum[i];
      svg.setAttribute("aria-label", `Clock hand at frame ${s.hand + 1}. ${s.frames.map((v, k) => `Frame ${k + 1}: ${v ?? "empty"}, bit ${s.ref[k]}`).join(". ")}`);
    },
  };
}

function workingSetCard(refs) {
  const deltaIn = h("input", { type: "number", min: 1, max: 20, value: 4, "aria-label": "Window size Δ", style: "max-width:80px" });
  const body = h("div");
  const draw = () => {
    let ws;
    try { ws = workingSet(refs, Number(deltaIn.value)); } catch (e) { body.replaceChildren(notice("error", e.message)); return; }
    body.replaceChildren(
      h("div", { class: "table-wrap" }, h("table", { class: "frames ws" },
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "t"), ws.rows.map((r) => h("th", { scope: "col" }, r.t + 1)))),
        h("tbody", null,
          h("tr", null, h("th", { scope: "row" }, "Ref"), ws.rows.map((r) => h("td", null, r.page))),
          h("tr", null, h("th", { scope: "row" }, "WS"), ws.rows.map((r) => h("td", { class: "ws-set" }, r.set.join(" ")))),
          h("tr", null, h("th", { scope: "row" }, "|WS|"), ws.rows.map((r) => h("td", { class: r.size === ws.max ? "ws-peak" : null }, r.size)))))),
      h("div", { class: "stats-row" }, stat("Largest working set", ws.max), stat("Average size", ws.average.toFixed(2))),
      h("p", { class: "muted small" }, `With Δ = ${deltaIn.value}, this process needs ${ws.max} frame${ws.max === 1 ? "" : "s"} at its busiest moment. If the working sets of all processes add up to more frames than exist, the OS should suspend a process rather than let the system thrash.`));
  };
  deltaIn.addEventListener("input", draw);
  draw();
  return h("section", { class: "card" }, h("h2", null, "Working set"),
    h("p", { class: "muted" }, "WS(t, Δ) is the set of distinct pages used in the last Δ references. A process should keep its whole working set in memory; its size is how many frames it needs right now."),
    h("label", { class: "inline" }, "Window Δ ", deltaIn), body);
}

function faultTable(refs, opts) {
  const rows = [1, 2, 3, 4, 5, 6].map((n) => [n, ...Object.keys(ALGORITHMS).map((a) => replace(refs, n, a, opts).faults)]);
  return h("section", { class: "card" }, h("h2", null, "Faults as you add frames"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Frames"), Object.values(ALGORITHMS).map((a) => h("th", { scope: "col" }, a.name)))),
      h("tbody", null, rows.map((row, i) => h("tr", null, h("th", { scope: "row" }, row[0]),
        row.slice(1).map((v, j) => h("td", { class: j === 0 && i > 0 && v > rows[i - 1][1] ? "anomaly" : null, title: j === 0 && i > 0 && v > rows[i - 1][1] ? "Belady's anomaly: more frames, more faults" : null }, v))))))),
    h("p", { class: "muted small" }, "Highlighted cells are Belady's anomaly: FIFO faulting more with more frames. LRU and Optimal never do this."));
}

export function render(root) {
  const params = readParams();
  const state = {
    refs: params.get("r") ?? BOOK,
    frames: Number(params.get("f")) || 3,
    algo: ALGORITHMS[params.get("algo")] ? params.get("algo") : "lru",
    tick: Number(params.get("k")) || NRU_TICK,
  };
  let player = null;

  const head = page({
    subject: "Operating systems",
    title: "Page replacement",
    lede: "When memory is full and a new page is needed, which page gets thrown out? Step through FIFO, LRU, Optimal, LFU, MFU, the clock and NRU, and count the faults.",
    theory: h("div", null,
      h("p", null, "A program references pages in order (the ", h("b", null, "reference string"), "). If the page is already in a frame it's a ", h("b", null, "hit"), "; if not, it's a ", h("b", null, "page fault"), " and the page is loaded, evicting another page when all frames are full."),
      h("ul", null,
        h("li", null, h("b", null, "FIFO"), " evicts the page that has been in memory longest."),
        h("li", null, h("b", null, "LRU"), " evicts the page used least recently."),
        h("li", null, h("b", null, "Optimal"), " evicts the page whose next use is furthest in the future. It needs to know the future, so it's a benchmark, not a real policy."),
        h("li", null, h("b", null, "LFU / MFU"), " count how often each page in memory has been used and evict the least (or most) used one. Counting algorithms are rarely used in practice: they're expensive and don't approximate OPT well."),
        h("li", null, h("b", null, "Second Chance (Clock)"), " approximates LRU cheaply. Each frame has a reference bit the hardware sets on every use. A hand sweeps round the frames: a page with bit 1 gets a second chance (the bit is cleared and the hand moves on); the first page with bit 0 is evicted."),
        h("li", null, h("b", null, "NRU (Not Recently Used)"), " uses two bits per page: ", h("b", null, "R"), " (referenced), set on every access, and ", h("b", null, "M"), " (modified), set on every write. On every clock tick the OS clears all the R bits, so R = 1 means \u201cused since the last tick\u201d. At a fault each page falls into one of four classes, 2R + M: class 0 (not referenced, not modified), class 1 (not referenced, modified), class 2 (referenced, not modified) and class 3 (referenced, modified). NRU evicts a page from the lowest non-empty class: a dirty page that hasn't been used lately is a better victim than a clean page in heavy use (Tanenbaum, ", h("i", null, "Modern Operating Systems"), ", 3.4.2). Mark writes with a w, as in 7w.")),
      h("p", null, "LRU and Optimal are ", h("b", null, "stack algorithms"), ": more frames never means more faults. FIFO isn't, which is why it can show ", h("b", null, "Belady's anomaly"), ".")),
    conventions: ["Empty frames are filled top to bottom (F1 first).", "Optimal: if several pages are never used again, the one loaded earliest is evicted.", "LFU/MFU: counts only cover the time a page has been in memory (a reloaded page starts at 1); ties evict the page loaded earliest.", "Clock: a page's reference bit is 1 when it's loaded and after every hit. The hand starts at F1 and moves to the frame after each page it loads.", "References are reads unless marked with w (7w is a write to page 7). Only NRU looks at writes; every other algorithm treats 7w as 7.", `NRU: a clock tick clears every R bit every k references (k = ${NRU_TICK} unless you change it), just before references k + 1, 2k + 1, and so on. A loaded page starts with R = 1, and M = 1 only if that reference is a write. M stays set until the page is evicted (a dirty victim is written back first).`, "NRU: Tanenbaum picks a random page from the lowest non-empty class; here the lowest-numbered frame in that class goes, so runs are repeatable."],
  });

  const refsIn = h("input", { type: "text", value: state.refs, "aria-label": "Reference string", class: "wide", oninput: (e) => { state.refs = e.target.value; update(); } });
  const framesIn = h("input", { type: "number", min: 1, max: 8, value: state.frames, "aria-label": "Number of frames", onchange: (e) => { state.frames = Number(e.target.value); update(); } });
  const tickIn = h("input", { type: "number", min: 1, max: 40, value: state.tick, "aria-label": "Clock tick every k references", onchange: (e) => { state.tick = Number(e.target.value); update(); } });
  const tickLabel = h("label", { class: "inline" }, "Clock tick every ", tickIn, " refs");
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id, selected: id === state.algo }, s.name)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ r: state.refs, f: state.frames, algo: state.algo, ...(state.algo === "nru" ? { k: state.tick } : {}) });
    const nru = state.algo === "nru";
    tickLabel.hidden = !nru;
    let refs, writes, result;
    try {
      ({ refs, writes } = parseAccesses(state.refs));
      result = replace(refs, state.frames, state.algo, { writes, tick: state.tick });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const spec = ALGORITHMS[state.algo], code = codePanel(spec.code), vars = varsPanel();
    const res = residency(result.steps, state.frames);
    const box = h("div", { class: "chart-wrap pf-wrap" });
    const clock = state.algo === "clock" ? clockView(result.steps, state.frames) : null;
    if (clock) box.replaceChildren(clock.el);
    const buckets = nru ? h("div", { class: "chart-wrap pf-wrap" }) : null, bucketCap = nru ? h("p", { class: "muted small" }) : null;
    const running = h("div", { class: "stats-row" });
    player = stepper({
      count: refs.length, label: "Reference", interval: 1000, start: 0,
      render: (i) => {
        stage.replaceChildren(grid(refs, result.steps, state.frames, i, { writes, bits: nru }));
        if (clock) clock.show(i); else morph(box, framesSvg(result.steps, res, i, state.frames, nru));
        if (nru) {
          morph(buckets, classesSvg(result.steps, i));
          const st = result.steps[i];
          bucketCap.textContent = `Classes as ${st.write ? "a write to" : "a read of"} page ${st.page} arrives${st.tick ? ", just after a clock tick cleared every R bit" : ""}.${st.victim != null ? ` The lowest non-empty class is ${CLASS_NAMES[st.vars["lowest class"]]}.` : ""}`;
        }
        const st = result.steps[i];
        note.textContent = `Step ${i + 1}: ${st.note}`;
        note.className = `step-note${st.hit ? " good" : ""}`;
        code.show(st.line);
        vars.show(st.vars);
        const f = result.steps.slice(0, i + 1).filter((x) => !x.hit).length;
        running.replaceChildren(stat("Faults so far", f), stat("Hits so far", i + 1 - f));
      },
    });
    const belady = beladyCheck(refs, state.frames);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, spec.name), player.el, note,
        traceLayout(h("div", null, box, buckets, bucketCap, running), code, vars),
        stage,
        h("div", { class: "stats-row" },
          stat("Page faults", result.faults), stat("Hits", result.hits),
          stat("Hit ratio", `${Math.round(result.hitRatio * 100)}%`), stat("Fault ratio", `${Math.round((1 - result.hitRatio) * 100)}%`)),
        belady.anomaly ? notice("info", `Belady's anomaly: FIFO has ${belady.faults} faults with ${belady.frames} frames but ${belady.moreFaults} with ${belady.moreFrames}.`) : null),
      faultTable(refs, { writes, tick: state.tick }),
      workingSetCard(refs));

  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Reference string (add w for a write, e.g. 7w)", refsIn),
      h("div", { class: "row" }, h("label", { class: "inline" }, "Frames ", framesIn), algoSel, tickLabel,
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const refs = randomRefs();
          state.refs = state.algo === "nru" ? formatAccesses(refs, randomWrites(Math.random, refs.length)) : refs.join(" ");
          refsIn.value = state.refs; update();
        } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.refs = BOOK; refsIn.value = BOOK; update(); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.refs = "1 2 3 4 1 2 5 1 2 3 4 5"; state.algo = "fifo"; refsIn.value = state.refs; algoSel.value = "fifo"; update(); } }, "Show Belady's anomaly"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          Object.assign(state, { refs: NRU_EXAMPLE, frames: 3, algo: "nru", tick: NRU_TICK });
          refsIn.value = NRU_EXAMPLE; framesIn.value = 3; algoSel.value = "nru"; tickIn.value = NRU_TICK; update();
        } }, "NRU example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // --- Practice: call each reference as you go ------------------------------
  const practice = h("div", { class: "panel-body" });
  const practiceAlgo = h("select", { "aria-label": "Practice algorithm" }, Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id }, s.name)));
  function newQuestion() {
    const r = rng();
    const algo = practiceAlgo.value, frames = 3;
    const refs = randomRefs(r);
    const nru = algo === "nru";
    const writes = nru ? randomWrites(r, refs.length) : [];
    const { steps } = replace(refs, frames, algo, { writes });
    let i = 0, score = 0;
    const board = h("div"), prompt = h("div", { class: "prompt" }), feedback = h("p", { class: "step-note", "aria-live": "polite" });
    const show = () => board.replaceChildren(grid(refs, steps, frames, i - 1, { current: i, writes, bits: nru }));
    const finish = () => {
      prompt.replaceChildren(h("p", { class: "score" }, `${score} / ${refs.length} correct.`), h("button", { type: "button", class: "btn primary", onclick: newQuestion }, "Another one"));
    };
    const ask = () => {
      if (i === refs.length) { show(); finish(); return; }
      show();
      const step = steps[i], prev = i ? steps[i - 1].frames : Array(frames).fill(null);
      const full = prev.every((x) => x !== null);
      const answer = (guess) => {
        const ok = guess === (step.hit ? "hit" : step.victim ?? "miss");
        if (ok) score++;
        feedback.textContent = `${ok ? "✓ Right." : "✗ Not quite."} ${step.note}`;
        feedback.className = `step-note ${ok ? "good" : "bad"}`;
        i++;
        ask();
      };
      prompt.replaceChildren(
        h("p", null, h("b", null, `Reference ${i + 1}: ${nru ? (step.write ? "write to " : "read of ") : ""}page ${step.page}. `), nru && step.tick ? "A clock tick has just cleared every R bit. " : "", full ? "Hit, or which page gets evicted?" : "Hit or miss?"),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn ghost", onclick: () => answer("hit") }, "Hit"),
          full ? prev.map((p) => h("button", { type: "button", class: "btn ghost", onclick: () => answer(p) }, `Miss, evict ${p}`))
            : h("button", { type: "button", class: "btn ghost", onclick: () => answer("miss") }, "Miss (free frame)")),
        h("p", { class: "muted small" }, `Score so far: ${score}`));
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, practiceAlgo, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `${ALGORITHMS[algo].name} with ${frames} frames`),
      h("p", { class: "muted" }, `Reference string: ${formatAccesses(refs, writes)}`),
      nru ? h("p", { class: "muted small" }, `Each frame shows its page and its R M bits. A clock tick clears every R bit every ${NRU_TICK} references; evict from the lowest non-empty class (2R + M), lowest-numbered frame first.`) : null,
      board, prompt, feedback));
    ask();
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}

