import { ALGORITHMS, binaryProbes, COMPLEXITY, parseValues, randomValues, run } from "../engines/searching.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { glide, legend, practiceCard, shuffle, summaryTable, toolbar } from "./dsa-kit.js";

const EXAMPLES = {
  gfg: { name: "Binary search: 23 in ten values", algo: "binary", a: "2 5 8 12 16 23 38 56 72 91", t: 23 },
  miss: { name: "Binary search: a value that isn't there", algo: "binary", a: "3 9 14 20 27 31 40 48 52 60 66", t: 35 },
  dups: { name: "Lower bound with duplicates", algo: "lower", a: "1 3 3 3 5 7 7 9", t: 3 },
  upper: { name: "Upper bound with duplicates", algo: "upper", a: "1 3 3 3 5 7 7 9", t: 3 },
  jump: { name: "Jump search over 16 values", algo: "jump", a: "0 1 1 2 3 5 8 13 21 34 55 89 144 233 377 610", t: 55 },
  interp: { name: "Interpolation on evenly spread data", algo: "interpolation", a: "10 20 30 40 50 60 70 80 90 100 110 120", t: 90 },
  linear: { name: "Linear search, unsorted", algo: "linear", a: "41 7 19 63 2 88 25 30", t: 25 },
};

const CW = 46, GAP = 6, X0 = 18, PROBE = new Set(["mid", "pos", "i", "end"]);
const cx = (i) => X0 + i * (CW + GAP) + CW / 2;

// One row of cells with the live range bracket and lo / mid / hi pointers
// sliding underneath. `end` adds the one-past-the-end slot used by the bounds.
function cellsSvg(A, st, end) {
  const n = A.length, slots = n + (end ? 1 : 0), out = new Set(st.out);
  const W = X0 * 2 + slots * (CW + GAP) - GAP, top = 58;
  const els = [];
  if (st.range && st.range[1] >= st.range[0]) {
    const [lo, hi] = st.range;
    els.push(h("rect", { class: "srch-range", "data-tw": "range", x: cx(lo) - CW / 2 - 4, y: top - 10, width: (hi - lo) * (CW + GAP) + CW + 8, height: CW + 20, rx: 10 }));
  }
  for (let i = 0; i < slots; i++) {
    const ghost = i === n;
    const cls = ["srch-cell", ghost && "ghost", !ghost && out.has(i) && "out", st.probe === i && "probe", st.found === i && "found"].filter(Boolean).join(" ");
    els.push(h("g", { class: cls },
      h("rect", { x: cx(i) - CW / 2, y: top, width: CW, height: CW, rx: 8 }),
      h("text", { x: cx(i), y: top + CW / 2 + 5, "text-anchor": "middle", class: "v" }, ghost ? "end" : A[i]),
      h("text", { x: cx(i), y: top + CW + 16, "text-anchor": "middle", class: "idx" }, i)));
  }
  // The probe pointer (mid, pos, i, end) sits above the row; the range ends
  // below it. Pointers that share a cell stack downwards.
  const at = new Map();
  for (const [name, i] of Object.entries(st.ptrs ?? {})) {
    if (i == null || i < 0 || i >= slots) continue;
    if (PROBE.has(name)) { els.push(h("g", { class: `srch-ptr p-${name}`, "data-k": `p:${name}`, "data-x": cx(i), "data-y": 0 }, h("text", { x: cx(i), y: top - 30, "text-anchor": "middle" }, name), h("path", { d: `M${cx(i)},${top - 13} l-6,-9 h12 z` }))); continue; }
    at.set(i, [...(at.get(i) ?? []), name]);
  }
  let deepest = 0;
  for (const [i, names] of at) names.forEach((name, k) => {
    const y = top + CW + 26 + k * 30;
    deepest = Math.max(deepest, k);
    els.push(h("g", { class: `srch-ptr p-${name}`, "data-k": `p:${name}`, "data-x": cx(i), "data-y": y },
      h("path", { d: `M${cx(i)},${y} l-6,9 h12 z` }),
      h("text", { x: cx(i), y: y + 23, "text-anchor": "middle" }, name)));
  });
  const H = top + CW + 60 + deepest * 30;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "srch-svg", role: "img", "aria-label": `Array ${A.join(", ")}${st.found != null ? `, found at index ${st.found}` : ""}`, style: `max-width:${Math.max(W * 1.25, 320)}px` }, els);
}

export function render(root) {
  const p = readParams();
  const state = { algo: ALGORITHMS[p.get("algo")] ? p.get("algo") : "binary", values: p.get("a") ?? EXAMPLES.gfg.a, target: Number.isInteger(Number(p.get("t"))) && p.get("t") !== null ? Number(p.get("t")) : 23 };
  let player = null;
  const head = page({
    subject: "Data structures & algorithms", title: "Searching",
    lede: "Linear, binary, jump and interpolation search, plus lower and upper bound: watch the range of possible answers shrink with every probe.",
    theory: h("div", null,
      h("p", null, h("b", null, "Linear search"), " checks each element in turn. It works on any array but costs up to n comparisons."),
      h("p", null, h("b", null, "Binary search"), " needs a sorted array. Comparing the target with the middle element tells you which half it must be in, so each probe halves the range: at most ⌊log₂ n⌋ + 1 probes, about 20 for a million elements. The loop keeps an invariant: if the target is in the array at all, it is in A[lo..hi]."),
      h("p", null, h("b", null, "Jump search"), " checks every √n-th element to find the right block, then scans that block: O(√n). ", h("b", null, "Interpolation search"), " guesses the position from the value itself; on evenly spread data that takes O(log log n) probes, but on skewed data it can fall back to O(n)."),
      h("p", null, h("b", null, "Lower bound"), " returns the first index with A[i] ≥ target and ", h("b", null, "upper bound"), " the first with A[i] > target, so upper − lower is how many times the target appears. They never stop early, which makes them the right tool when there are duplicates (C++ std::lower_bound, Python bisect_left).")),
    conventions: ["Indices start at 0. mid = ⌊(lo + hi) / 2⌋ (rounds down).", "Every algorithm except linear search sorts the input first.", "Probes count the array elements compared with the target. Bounds use a half-open range [lo, hi), so hi may be n (the grey “end” slot)."],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([k, a]) => h("option", { value: k, selected: k === state.algo }, a.name)));
  const valIn = h("input", { type: "text", class: "mono wide", value: state.values, "aria-label": "Values", oninput: (e) => { state.values = e.target.value; update(); } });
  const tIn = h("input", { type: "number", value: state.target, "aria-label": "Target", oninput: (e) => { if (e.target.value !== "") { state.target = Number(e.target.value); update(); } } });
  const msg = h("div"), out = h("div", { class: "output" });
  const set = (algo, a, t) => { state.algo = algo; state.values = a; state.target = t; valIn.value = a; tIn.value = t; update(); };

  function update() {
    player?.destroy();
    writeParams({ algo: state.algo, a: state.values, t: state.target });
    algoSel.value = state.algo;
    let vals, res;
    try { vals = parseValues(state.values); res = run(state.algo, vals, state.target); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren(res.resorted ? notice("info", `${ALGORITHMS[state.algo].name} needs sorted input, so it searches ${res.A.join(", ")}.`) : "");
    const algo = ALGORITHMS[state.algo], bounds = state.algo === "lower" || state.algo === "upper";
    const code = codePanel(algo.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const trail = h("div", { class: "srch-trail" }), counters = h("div", { class: "stats-row" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1000,
      render: (i) => {
        const st = res.steps[i];
        glide(stage, cellsSvg(res.A, st, bounds));
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? (st.miss ? " warn" : " good") : ""}`;
        const seen = res.steps.slice(0, i + 1).filter((s) => s.probe != null).map((s) => s.probe);
        trail.replaceChildren(h("span", { class: "muted small" }, "Probes so far:"), ...(seen.length ? [...new Set(seen)].map((k) => h("b", { class: k === st.found ? "hit" : null }, `A[${k}] = ${res.A[k]}`)) : [h("span", { class: "muted small" }, "none yet")]));
        const size = st.range ? Math.max(0, st.range[1] - st.range[0] + 1) : 0;
        counters.replaceChildren(stat("Probes", st.probes), stat("Candidates left", st.done ? "–" : size), stat("Result", st.done ? (res.index === -1 ? "−1 (absent)" : res.index) : "…"));
      },
    });
    const n = res.A.length;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, algo.name), player.el, note,
        traceLayout(h("div", null, stage, trail,
          legend([["Range still in play", "var(--accent)"], ["Probe", "var(--series-4)"], ["Found", "var(--good)"], ["Ruled out", "var(--line)"]])), code, vars),
        counters),
      h("section", { class: "card" }, h("h2", null, "Same array, every algorithm"),
        summaryTable(["Algorithm", "Result", "Probes"], Object.keys(ALGORITHMS).map((k) => { const r = run(k, res.A, state.target); return { id: k, cells: [h("button", { type: "button", class: "linkish", onclick: () => { state.algo = k; update(); } }, ALGORITHMS[k].name), r.index, r.probes] }; }), state.algo),
        h("p", { class: "muted small" }, `With n = ${n}, binary search never needs more than ⌊log₂ ${n}⌋ + 1 = ${Math.floor(Math.log2(n)) + 1} probes; linear search can need ${n}.`)),
      h("section", { class: "card" }, h("h2", null, "Complexity"),
        summaryTable(["Algorithm", "Best", "Average", "Worst", "Needs sorted input"], COMPLEXITY, bounds ? "lower" : state.algo)));
  }

  const random = () => {
    const r = rng(), a = randomValues(r, 10 + Math.floor(r() * 6));
    const t = r() < 0.75 ? a[Math.floor(r() * a.length)] : 1 + Math.floor(r() * 99);
    set(state.algo, a.join(" "), t);
  };
  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, toolbar(EXAMPLES, (ex) => set(ex.algo, ex.a, ex.t), random)),
      h("div", { class: "row" }, h("label", { class: "stack", style: "flex:1;margin:0" }, "Values (up to 20)", valIn), h("label", { class: "stack", style: "margin:0" }, "Target", tIn)),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), A = randomValues(r, 9 + Math.floor(r() * 6)), kind = r();
    const t = r() < 0.7 ? A[Math.floor(r() * A.length)] : 1 + Math.floor(r() * 99);
    const box = h("p", { class: "grammar-box" }, A.map((v, i) => `${i}:${v}`).join("  "));
    let body;
    if (kind < 0.3) {
      const right = binaryProbes(A, t).map((i) => A[i]).join(" → ");
      const ceil = ceilProbes(A, t).map((i) => A[i]).join(" → ");
      const lin = A.slice(0, Math.max(1, A.indexOf(t) + 1 || 3)).slice(0, 4).join(" → ");
      const opts = [...new Set([right, ceil, lin, binaryProbes(A, t + 7).map((i) => A[i]).join(" → ")])];
      body = [h("h2", null, `Binary search for ${t}: which values are probed, in order?`), box,
        choice(shuffle(opts.map((o) => ({ label: o, correct: o === right })), r), `mid = ⌊(lo + hi) / 2⌋ each time gives ${right}.`)];
    } else if (kind < 0.55) {
      const res = run("binary", A, t);
      body = [h("h2", null, `How many elements does binary search compare with ${t} before it stops?`), box,
        numberQuestion(res.probes, `It probes ${binaryProbes(A, t).map((i) => A[i]).join(", ")}: ${res.probes} probe${res.probes > 1 ? "s" : ""}, ${res.index === -1 ? "and the range empties" : `finding it at index ${res.index}`}.`)];
    } else if (kind < 0.8) {
      const upper = r() < 0.5, B = [...A.slice(0, 3), A[3], A[3], ...A.slice(3)].sort((x, y) => x - y), tt = B[3];
      const ans = run(upper ? "upper" : "lower", B, tt).index;
      body = [h("h2", null, `What does ${upper ? "upper" : "lower"} bound return for ${tt}?`), h("p", { class: "grammar-box" }, B.map((v, i) => `${i}:${v}`).join("  ")),
        h("p", { class: "muted" }, upper ? "Upper bound: the first index whose value is greater than the target." : "Lower bound: the first index whose value is at least the target."),
        numberQuestion(ans, `The first index with A[i] ${upper ? ">" : "≥"} ${tt} is ${ans}.`)];
    } else {
      const n = [7, 15, 16, 31, 50, 100, 1000][Math.floor(r() * 7)];
      const ans = Math.floor(Math.log2(n)) + 1;
      body = [h("h2", null, `A sorted array holds ${n} elements. At most how many probes does binary search need?`),
        numberQuestion(ans, `Each probe at least halves the range, so ⌊log₂ ${n}⌋ + 1 = ${ans} probes always suffice.`)];
    }
    practiceCard(practice, newQuestion, body);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}

// The common mistake: rounding mid up.
function ceilProbes(A, t) {
  const seen = [];
  let lo = 0, hi = A.length - 1;
  while (lo <= hi) { const m = Math.ceil((lo + hi) / 2); seen.push(m); if (A[m] === t) break; if (A[m] < t) lo = m + 1; else hi = m - 1; }
  return seen;
}
