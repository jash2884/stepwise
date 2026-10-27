import { afterPasses, ALGORITHMS, COMPLEXITY, parseValues, randomValues, run } from "../engines/sorting.js";
import { codePanel, complexityTable, traceLayout, varsPanel } from "../code.js";
import { treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";

const AUX = new Set(["merge", "counting"]);
const LEGEND = [["Comparing", 4], ["Swapping / moving", 8], ["Pivot", 7], ["Current min", 2], ["Key being placed", 5], ["Final position", 3]];

// Bars for one step: row A on top, and the temporary array (T or B) below it
// for merge and counting sort. Bars are keyed by element id so they slide.
function barsSvg(step, n, maxV, algo) {
  const bw = Math.max(16, Math.min(44, 620 / n)), gap = Math.max(3, bw * 0.16), H = 150;
  const W = n * (bw + gap) + 30, rowH = H + 58, aux = AUX.has(algo);
  const base = (row) => 20 + H + row * rowH;
  const x = (i) => 20 + i * (bw + gap);
  const hi = new Set([...(step.cmp ?? [])]), sw = new Set(step.swap ?? []), sorted = new Set(step.sorted);
  const inRange = (i) => !step.range || (i >= step.range[0] && i <= step.range[1]);
  const els = [];
  if (step.range) {
    const [lo, r] = step.range;
    els.push(h("rect", { x: x(lo) - gap / 2 - 2, y: 6, width: (r - lo + 1) * (bw + gap) + 4, height: H + 34, rx: 8, class: "range-mark" }));
    if (step.split != null) els.push(h("line", { x1: x(step.split + 1) - gap / 2, x2: x(step.split + 1) - gap / 2, y1: 6, y2: H + 40, class: "range-mark" }));
  }
  const bar = (item, i, row) => {
    const hgt = Math.max(4, (item.v / maxV) * H), b = base(row);
    const cls = ["bar", row === 0 && sw.has(i) && "swap", row === 0 && !sw.has(i) && hi.has(i) && "cmp", row === 0 && step.pivot === i && "pivot", row === 0 && step.min === i && "min",
      row === 0 && step.key === i && "key", row === 0 && sorted.has(i) && !hi.has(i) && !sw.has(i) && "sorted", row === 0 && !inRange(i) && "dim", row === 0 && step.heap != null && i >= step.heap && !sorted.has(i) && "dim"].filter(Boolean).join(" ");
    return h("g", { class: cls, "data-k": `b:${item.id}`, "data-x": x(i), "data-y": b },
      h("rect", { x: x(i), y: b - hgt, width: bw, height: hgt, rx: 3 }),
      h("text", { x: x(i) + bw / 2, y: b - hgt - 5, "text-anchor": "middle" }, item.v));
  };
  step.A.forEach((item, i) => { if (item) els.push(bar(item, i, 0)); });
  if (aux && step.T) step.T.forEach((item, i) => { if (item) els.push(bar(item, i, 1)); });
  const idx = (row) => Array.from({ length: n }, (_, i) => h("text", { x: x(i) + bw / 2, y: base(row) + 14, "text-anchor": "middle", class: "idx" }, i));
  els.push(h("g", { class: "idx-row" }, idx(0)));
  if (aux) els.push(h("g", { class: "idx-row" }, idx(1)), h("text", { x: 4, y: base(1) - H / 2, class: "row-label" }, algo === "merge" ? "T" : "B"));
  // Pointers (i, j, …) under the index row; several on one cell stack up.
  const at = new Map();
  for (const [name, i] of Object.entries(step.ptrs ?? {})) if (i != null && i >= 0 && i < n) at.set(i, [...(at.get(i) ?? []), name]);
  for (const [i, names] of at) els.push(h("g", { class: "ptr" },
    h("path", { d: `M${x(i) + bw / 2},${base(0) + 20} l-5,8 h10 z` }),
    h("text", { x: x(i) + bw / 2, y: base(0) + 41, "text-anchor": "middle" }, names.join(","))));
  const height = aux ? base(1) + 24 : base(0) + 48;
  return h("svg", { viewBox: `0 0 ${W} ${height}`, class: "bars", role: "img", "aria-label": `Array: ${step.A.map((x) => (x ? x.v : "_")).join(", ")}`, style: `max-width:${Math.max(W * 1.3, 360)}px` }, els);
}

function heapTree(step) {
  const size = step.heap;
  if (!size) return null;
  const node = (i) => ({ id: `h${step.A[i].id}`, label: String(step.A[i].v), state: (step.swap ?? []).includes(i) ? "error" : (step.cmp ?? []).includes(i) ? "matched" : "expanded", kids: [2 * i + 1, 2 * i + 2].filter((k) => k < size).map(node) });
  return treeDiagram(node(0), { aria: "The heap as a tree", gapY: 54 });
}

function countsGrid(step) {
  if (!step.counts) return null;
  return h("div", { class: "counts" }, step.counts.values.map(({ v, c }) => h("div", { class: `count-cell${step.hotCount === v ? " hot" : ""}${c ? "" : " zero"}` }, h("b", null, v), h("span", null, c))));
}

function bucketsRow(step) {
  if (!step.buckets) return null;
  return h("div", { class: "rbuckets" }, step.buckets.map((b, d) => h("div", { class: `rbucket${step.hotBucket === d ? " hot" : ""}` }, h("b", null, d), b.map((v) => h("span", null, v)))));
}

export function render(root) {
  const p = readParams();
  const state = { algo: ALGORITHMS[p.get("algo")] ? p.get("algo") : "quick", values: p.get("a") ?? "38 27 43 3 9 82 10 55 19 64" };
  let player = null;
  const head = page({
    subject: "Data structures & algorithms", title: "Sorting",
    lede: "Nine sorting algorithms, every comparison and move animated, with the pseudocode line and variables beside it.",
    theory: h("div", null,
      h("p", null, h("b", null, "Comparison sorts"), " decide the order only by comparing pairs, so no comparison sort can beat Ω(n log n) in the worst case. Bubble, selection and insertion sort are O(n²) but simple; insertion sort is fast on nearly sorted data. Merge sort and heap sort are always O(n log n); quick sort is O(n log n) on average and usually fastest in practice, but O(n²) when pivots are unlucky (for example already-sorted input with the last element as pivot)."),
      h("p", null, h("b", null, "Non-comparison sorts"), " use the values themselves: counting sort counts each value (O(n + k) for a range of k values); radix sort runs a stable counting-style pass per digit."),
      h("p", null, "A sort is ", h("b", null, "stable"), " if equal values keep their original order, which matters when sorting records by one field after another. It's ", h("b", null, "in place"), " if it needs only O(1) or O(log n) extra memory.")),
    conventions: ["Indices start at 0. Quick sort uses Lomuto partitioning with the last element as pivot.", "Merge sort splits at ⌊(lo + hi) / 2⌋ and takes from the left half on ties.", "Shell sort uses the gaps n/2, n/4, …, 1. Writes count every element written into an array."],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([k, a]) => h("option", { value: k, selected: k === state.algo }, a.name)));
  const valIn = h("input", { type: "text", class: "mono wide", value: state.values, "aria-label": "Values", oninput: (e) => { state.values = e.target.value; update(); } });
  const preset = (label, make) => h("button", { type: "button", class: "btn ghost", onclick: () => { state.values = make(rng()).join(" "); valIn.value = state.values; update(); } }, label);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ algo: state.algo, a: state.values });
    algoSel.value = state.algo;
    let vals, res;
    try { vals = parseValues(state.values); res = run(state.algo, vals); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const algo = ALGORITHMS[state.algo], maxV = Math.max(...vals, 1);
    const code = codePanel(algo.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), extra = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const counters = h("div", { class: "stats-row" });
    const heapBox = h("div", { class: "chart-wrap" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 650,
      render: (i) => {
        const st = res.steps[i];
        morph(stage, barsSvg(st, vals.length, maxV, state.algo));
        const tree = heapTree(st);
        if (tree) { heapBox.hidden = false; morph(heapBox, tree); } else heapBox.hidden = true;
        extra.replaceChildren(...[countsGrid(st), bucketsRow(st)].filter(Boolean));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : ""}`;
        counters.replaceChildren(stat("Comparisons", st.comparisons), stat("Writes", st.writes), stat("Final positions", `${st.sorted.length} / ${vals.length}`));
      },
    });
    // Same input, every algorithm.
    const all = Object.keys(ALGORITHMS).map((k) => { try { return { k, r: run(k, vals) }; } catch { return { k, r: null }; } });
    const most = Math.max(...all.map((x) => x.r?.comparisons ?? 0), 1);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, algo.name), player.el, note,
        traceLayout(h("div", null, stage, heapBox, extra,
          h("div", { class: "legend-chips" }, LEGEND.map(([t, c]) => h("span", null, h("i", { style: `--c:var(--series-${c})` }), t)))), code, vars),
        counters),
      h("section", { class: "card" }, h("h2", null, "Same input, every algorithm"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
          h("thead", null, h("tr", null, ["Algorithm", "Comparisons", "", "Writes", "Steps"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, all.map(({ k, r }) => h("tr", { class: k === state.algo ? "hot" : null },
            h("th", { scope: "row" }, h("button", { type: "button", class: "linkish", onclick: () => { state.algo = k; update(); } }, ALGORITHMS[k].name)),
            h("td", null, r ? r.comparisons : "–"),
            h("td", { class: "spark" }, r ? h("i", { style: `width:${(r.comparisons / most) * 100}%` }) : null),
            h("td", null, r ? r.writes : "–"), h("td", null, r ? r.steps.length : "–")))))),
        h("p", { class: "muted small" }, "Counting and radix sort make no comparisons between elements at all. Try a reversed or already sorted array to see each algorithm's best and worst case.")),
      h("section", { class: "card" }, h("h2", null, "Complexity"), complexityTable(COMPLEXITY, state.algo)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel,
        preset("Random", (r) => randomValues(r, 10, 90)),
        preset("Nearly sorted", (r) => { const a = randomValues(r, 10, 90).sort((x, y) => x - y); const i = Math.floor(r() * 9); [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; }),
        preset("Reversed", (r) => randomValues(r, 10, 90).sort((x, y) => y - x)),
        preset("Few unique", (r) => Array.from({ length: 12 }, () => [12, 30, 30, 55][Math.floor(r() * 4)])),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Values (up to 24, from 0 to 999)", valIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const vals = randomValues(r, 6 + Math.floor(r() * 3), 60);
    const kind = r();
    let body;
    if (kind < 0.5) {
      const algo = ["bubble", "selection", "insertion"][Math.floor(r() * 3)], k = 1 + Math.floor(r() * 2);
      const right = afterPasses(algo, vals, k).join(", ");
      const opts = new Set([right, afterPasses(algo, vals, k + 1).join(", "), afterPasses(algo === "bubble" ? "selection" : "bubble", vals, k).join(", "), afterPasses(algo, vals, k - 1).join(", ")]);
      body = [h("h2", null, `What does the array look like after pass ${k} of ${ALGORITHMS[algo].name.toLowerCase()}?`), h("p", { class: "grammar-box" }, vals.join(", ")),
        choice([...opts].map((o) => ({ label: o, correct: o === right })).sort(() => r() - 0.5), `After ${k} pass${k > 1 ? "es" : ""}: ${right}.`)];
    } else if (kind < 0.75) {
      const res = run("quick", vals), part = res.steps.find((s) => s.line === 10);
      const pivotPos = part.vars.p;
      body = [h("h2", null, "Quick sort (Lomuto, last element as pivot): after the first partition, at which index does the pivot land?"), h("p", { class: "grammar-box" }, vals.join(", ")),
        numberQuestion(pivotPos, `The pivot ${vals.at(-1)} has ${pivotPos} value${pivotPos === 1 ? "" : "s"} ≤ it in front of it, so it lands at index ${pivotPos}: ${part.A.map((x) => x.v).join(", ")}.`)];
    } else {
      const swaps = run("bubble", vals).writes / 2;
      body = [h("h2", null, "How many swaps does bubble sort make on this array?"), h("p", { class: "grammar-box" }, vals.join(", ")),
        h("p", { class: "muted" }, "Hint: every swap fixes exactly one inversion (a pair that's out of order)."),
        numberQuestion(swaps, `There are ${swaps} inversions, so bubble sort makes ${swaps} swaps.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
