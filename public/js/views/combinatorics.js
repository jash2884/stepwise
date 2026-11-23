import {
  CATALAN_CODE, DERANGE_CODE, IE_CODE, REC_CODE, REC_EXAMPLES, SELECTIONS, STARS_CODE, balancedParens, catalan, catalanSteps, choose, derangement, derangementSteps,
  divisibleCount, fmtBig, forceCount, inclusionExclusion, listDerangements, listSelections, multiset, nice, pigeonhole, selection, solveRecurrence, starsAndBars,
} from "../engines/combinatorics.js";
import { h, notice, page, readParams, writeParams } from "../ui.js";
import { numberQuestion, stat } from "./kit.js";
import { linkButton, numberInput, reveal, select, shell, table, textInput, traceCard } from "./dm-kit.js";

const MODES = {
  select: "Permutations and combinations",
  stars: "Stars and bars",
  ie: "Inclusion-exclusion",
  pigeon: "Pigeonhole principle",
  derange: "Derangements",
  catalan: "Catalan numbers",
  rec: "Linear recurrences",
};

// --- Drawings ------------------------------------------------------------------------
function chips(items, upto = items.length) {
  return h("div", { class: "dm-chips" }, items.map((x, i) => h("span", { class: `dm-chip${i < upto ? " on" : ""}` }, x)));
}

function starsRow(dist) {
  const parts = [];
  dist.forEach((k, i) => {
    if (i) parts.push(h("span", { class: "dm-bar", "aria-hidden": "true" }, "|"));
    for (let s = 0; s < k; s++) parts.push(h("span", { class: "dm-star", style: `--c:var(--series-${(i % 8) + 1})` }, "★"));
  });
  return h("div", { class: "dm-stars", role: "img", "aria-label": `Example: ${dist.join(", ")}` }, parts,
    h("div", { class: "dm-boxes" }, dist.map((k, i) => h("span", { style: `--c:var(--series-${(i % 8) + 1})` }, `box ${i + 1}: ${k}`))));
}

const VENN3 = { A: [118, 108], B: [202, 108], C: [160, 178] };
const LABEL3 = { A: [86, 92], B: [234, 92], C: [160, 222], AB: [160, 84], AC: [122, 162], BC: [198, 162], ABC: [160, 132] };
const VENN2 = { A: [125, 120], B: [205, 120] };
const LABEL2 = { A: [95, 124], B: [235, 124], AB: [165, 124] };
function venn(res, names, show) {
  const three = res.three, C = three ? VENN3 : VENN2, L = three ? LABEL3 : LABEL2;
  const on = new Set(show);
  return h("svg", { viewBox: `0 0 320 ${three ? 284 : 220}`, class: "dm-venn", role: "img", "aria-label": `Venn diagram: ${Object.entries(res.regions).map(([k, v]) => `only ${k} ${v}`).join(", ")}` },
    h("rect", { x: 4, y: 4, width: 312, height: three ? 276 : 212, rx: 12, class: "dm-universe" }),
    Object.entries(C).map(([k, [x, y]], i) => h("g", null, h("circle", { cx: x, cy: y, r: 72, class: "dm-set", style: `--c:var(--series-${i + 1})` }),
      h("text", { x: x + (k === "A" ? -58 : k === "B" ? 58 : 0), y: y + (k === "C" ? 86 : -62), "text-anchor": "middle", class: "dm-setname" }, names["ABC".indexOf(k)]))),
    Object.entries(L).map(([k, [x, y]]) => {
      const level = k.length === 1 ? "single" : k.length === 2 ? "pair" : "triple";
      const visible = on.has("regions") || on.has(level);
      return h("text", { x, y, "text-anchor": "middle", class: `dm-region${on.has("regions") ? " final" : ""}${visible ? "" : " off"}` }, on.has("regions") ? String(res.regions[k]) : visible ? `${k}` : "");
    }));
}

function pigeonSvg(fill, placed, items) {
  const k = fill.length, W = Math.max(280, k * 54 + 20), top = Math.max(...fill) * 16 + 40;
  const counts = Array(k).fill(0);
  for (let i = 0; i < placed; i++) counts[i % k]++;
  return h("svg", { viewBox: `0 0 ${W} ${top + 30}`, class: "dm-pigeon", role: "img", "aria-label": `${placed} of ${items} items placed: ${counts.join(", ")}` },
    fill.map((_, b) => {
      const x = 14 + b * 54;
      return h("g", null, h("rect", { x, y: 20, width: 44, height: top - 10, rx: 8, class: `dm-box${counts[b] === Math.max(...counts) && placed ? " full" : ""}` }),
        Array.from({ length: counts[b] }, (_, j) => h("circle", { cx: x + 22, cy: top + 2 - j * 16, r: 6, class: `dm-ball${placed && (placed - 1) % k === b && j === counts[b] - 1 ? " now" : ""}` })),
        h("text", { x: x + 22, y: top + 24, "text-anchor": "middle", class: "dm-boxcount" }, counts[b]));
    }));
}

// --- Modes -------------------------------------------------------------------------------
function selectMode(s) {
  const res = selection(s.kind, s.n, s.r);
  const list = listSelections(s.kind, s.n, s.r);
  const total = Number(res.value);
  const steps = [
    { line: 1, vars: { n: s.n, r: s.r, ordered: res.ordered, repeats: res.repeat }, upto: 0, note: `${res.why} So this is: ${res.name.toLowerCase()}.` },
    { line: 2, vars: { formula: res.formula }, upto: 0, note: `Formula: ${res.formula}.` },
    { line: 3, vars: { count: fmtBig(res.value) }, upto: list.length, tone: "good", note: `${res.work} = ${fmtBig(res.value)}.${list.length && list.length === total ? " Every one is listed below, using the items a, b, c, …" : list.length ? ` The first ${list.length} are listed.` : ""}` },
  ];
  const code = ["does order matter? can items repeat?", "pick the formula for that case", "count ← the formula with n and r"];
  const card = traceCard({ title: `Choosing ${s.r} from ${s.n}`, steps, code, draw: (st) => (list.length ? chips(list, st.upto) : h("p", { class: "muted" }, "Too many to list.")) });
  const all = Object.entries(SELECTIONS).map(([k, v]) => { const x = selection(k, s.n, s.r); return [v.name, v.formula, x.work, fmtBig(x.value)]; });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "The four cases side by side"), table(["Case", "Formula", "Here", "Count"], all, { rowCls: (i) => (Object.keys(SELECTIONS)[i] === s.kind ? "hot" : null) }),
    s.word ? h("p", null, `Arrangements of the letters of ${s.word.toUpperCase()}: ${multiset(s.word.toUpperCase()).work} = ${fmtBig(multiset(s.word.toUpperCase()).value)}.`) : null)], destroy: card.destroy };
}

function starsMode(s) {
  const mins = (s.lo.match(/\d+/g) ?? []).map(Number);
  const res = starsAndBars(s.n, s.k, mins);
  const card = traceCard({ title: `${s.n} identical items into ${s.k} boxes`, steps: res.steps, code: STARS_CODE, draw: (st) => (res.rest >= 0 ? starsRow(st.example) : h("p", { class: "muted" }, "No valid distribution.")) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Same idea, other words"),
    h("p", null, `The number of solutions of x₁ + … + x${s.k > 9 ? s.k : "₁₂₃₄₅₆₇₈₉"[s.k - 1]} = ${s.n} in whole numbers${mins.some(Boolean) ? ` with xᵢ ≥ ${res.mins.join(", ")}` : " (each ≥ 0)"} is ${res.work} = ${fmtBig(res.value)}.`),
    h("p", { class: "muted small" }, `With every box non-empty it's C(n − 1, k − 1) = C(${s.n - 1}, ${s.k - 1}) = ${fmtBig(choose(s.n - 1, s.k - 1))}. Choosing r items from n kinds with repetition is the same count: r stars, n − 1 bars.`))], destroy: card.destroy };
}

function ieMode(s) {
  let res, names, extra = null;
  if (s.ie === "div") {
    const ds = (s.divs.match(/\d+/g) ?? []).map(Number).filter((x) => x > 0).slice(0, 3);
    if (ds.length < 2) throw new Error("Give two or three divisors, like 2 3 5.");
    res = divisibleCount(s.N, ds);
    names = ds.map((d) => `÷${d}`);
    extra = [table(["Set", "Divisible by (lcm)", "Count = ⌊N / lcm⌋"], res.subsets.map((x) => [x.sets.map((k) => names["ABC".indexOf(k)]).join(" ∩ "), x.lcm, `⌊${s.N}/${x.lcm}⌋ = ${x.count}`])),
      h("p", null, `So ${res.union} of the numbers 1 to ${s.N} are divisible by at least one of ${ds.join(", ")}, and ${res.none} by none of them (a brute-force count agrees: ${res.brute}).`)];
  } else {
    const sizes = {};
    for (const [, k, v] of s.sizes.matchAll(/([ABC]{1,3})\s*=\s*(\d+)/g)) sizes[[...k].sort().join("")] = Number(v);
    for (const k of ["A", "B", "AB"]) if (sizes[k] == null) throw new Error(`Give a size for ${k}, like A=20 B=15 AB=5 (add C, AC, BC, ABC for three sets).`);
    if (sizes.C != null) for (const k of ["AC", "BC", "ABC"]) sizes[k] ??= 0;
    res = inclusionExclusion(sizes);
    names = ["A", "B", "C"];
  }
  const card = traceCard({ title: `|${res.three ? `${names[0]} ∪ ${names[1]} ∪ ${names[2]}` : `${names[0]} ∪ ${names[1]}`}|`, steps: res.steps, code: IE_CODE, draw: (st) => venn(res, names, st.show) });
  return { els: [card.el, ...(extra ? [h("section", { class: "card" }, h("h2", null, "Working"), ...extra)] : [])], destroy: card.destroy };
}

function pigeonMode(s) {
  const res = pigeonhole(s.items, s.boxes);
  const steps = [{ placed: 0, line: 1, vars: { items: s.items, boxes: s.boxes }, note: `Put ${s.items} items into ${s.boxes} boxes, as evenly as possible.` }];
  const show = Math.min(s.items, 40);
  for (let i = 1; i <= show; i++) steps.push({ placed: i, line: 2, vars: { placed: i, fullest: Math.ceil(i / s.boxes) }, note: i <= s.boxes ? `Item ${i} goes in an empty box.` : `Every box already has ${Math.floor((i - 1) / s.boxes)}, so item ${i} makes some box hold ${Math.ceil(i / s.boxes)}.` });
  steps.push({ placed: show, line: 3, vars: { "at least": res.atLeast }, tone: "good", note: `${res.note} To force some box to hold r items you need k(r − 1) + 1 = ${forceCount(s.boxes, res.atLeast)} items for r = ${res.atLeast}.` });
  const code = ["spread n items over k boxes", "each new item goes to a least-full box", "some box holds at least ⌈n / k⌉"];
  const card = traceCard({ title: "Pigeonhole", steps, code, interval: 500, draw: (st) => pigeonSvg(res.fill, st.placed, s.items) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Classic uses"), h("ul", null,
    h("li", null, "Among 13 people, two share a birth month (13 > 12)."),
    h("li", null, "Any 5 points in a unit square: two are within √2/2 of each other (4 quarter squares)."),
    h("li", null, "Any n + 1 numbers from 1 to 2n: two are consecutive, so coprime."),
    h("li", null, `Socks of ${s.boxes} colours: ${forceCount(s.boxes, 2)} socks guarantee a pair of one colour.`)))], destroy: card.destroy };
}

function derangeMode(s) {
  const res = derangementSteps(s.n);
  const list = listDerangements(s.n);
  const card = traceCard({ title: `Derangements of ${s.n}`, steps: res.steps, code: DERANGE_CODE,
    draw: (st) => table(["n", ...res.D.map((_, i) => String(i))], [["D(n)", ...res.D.map((d, i) => (i <= st.i ? fmtBig(d) : ""))]], { cls: (_, c) => (c - 1 === st.i ? "hot" : null) }),
    side: (st) => (st.i === s.n && list.length ? h("div", null, h("p", { class: "muted small" }, `All ${list.length} derangements of 1…${s.n} (position i never holds i):`), chips(list)) : null) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Where it shows up"), h("p", null, `${s.n} letters in ${s.n} envelopes, none in its own: D(${s.n}) = ${fmtBig(derangement(s.n))}. Hat-check problem: the chance nobody gets their own hat tends to 1/e ≈ 0.3679 (here ${(Number(derangement(Math.min(s.n, 20))) / Number([...Array(Math.min(s.n, 20))].reduce((a, _, i) => a * BigInt(i + 1), 1n))).toFixed(4)}).`))], destroy: card.destroy };
}

function catalanMode(s) {
  const res = catalanSteps(s.n);
  const parens = s.n <= 4 ? balancedParens(s.n) : [];
  const card = traceCard({ title: `Catalan numbers up to C(${s.n})`, steps: res.steps, code: CATALAN_CODE,
    draw: (st) => table(["n", ...res.C.map((_, i) => String(i))], [["C(n)", ...res.C.map((c, i) => (i <= st.i ? fmtBig(c) : ""))]], { cls: (_, c) => (c - 1 === st.i ? "hot" : null) }),
    side: (st) => (st.i === s.n && parens.length ? h("div", null, h("p", { class: "muted small" }, `The ${parens.length} balanced strings of ${s.n} bracket pairs:`), chips(parens)) : null) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, `C(${s.n}) = ${fmtBig(catalan(s.n))} counts`), h("ul", null,
    h("li", null, `binary trees with ${s.n} nodes, and BSTs on ${s.n} distinct keys`),
    h("li", null, `ways to fully bracket a product of ${s.n + 1} factors (matrix-chain orders)`),
    h("li", null, `triangulations of a convex polygon with ${s.n + 2} sides`),
    h("li", null, `stack-permutations of 1…${s.n} (push and pop orders)`),
    h("li", null, `monotone lattice paths across an ${s.n} × ${s.n} grid that never cross the diagonal`)))], destroy: card.destroy };
}

function recMode(s) {
  const spec = { c1: s.c1, c2: s.c2, d: s.d, a0: s.a0, a1: s.a1 };
  const res = solveRecurrence(spec, 10);
  const order = s.c2 === 0 ? 1 : 2;
  const card = traceCard({ title: `aₙ = ${nice(s.c1)}aₙ₋₁${order === 2 ? ` ${s.c2 < 0 ? "−" : "+"} ${nice(Math.abs(s.c2))}aₙ₋₂` : ""}${s.d ? ` ${s.d < 0 ? "−" : "+"} ${nice(Math.abs(s.d))}` : ""}`, steps: res.steps, code: REC_CODE, interval: 1400,
    draw: (st) => table(["n", "aₙ (recurrence)", "formula"], res.check.map((c) => [String(c.n), nice(c.value), st.line >= 4 ? nice(Math.round(c.formula * 1e6) / 1e6) : "…"]), { cls: (r, c) => (c === 2 && st.line === 6 ? (res.check[r].ok ? "added" : "conflict") : null) }) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Closed form"),
    h("p", null, h("code", { class: "dm-formula big" }, `aₙ = ${res.formula}`)),
    h("div", { class: "stats-row" }, stat("Roots", res.rootText), stat("a₁₀", nice(res.values[10]))),
    h("p", null, "Generating function: ", h("code", { class: "dm-formula" }, res.gf)))], destroy: card.destroy };
}

// --- Practice ----------------------------------------------------------------------------
function question(r) {
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const kind = ["select", "stars", "ie", "derange", "catalan", "rec", "pigeon"][Math.floor(r() * 7)];
  if (kind === "select") {
    const k = Object.keys(SELECTIONS)[int(0, 3)], n = int(3, 8), rr = int(2, Math.min(4, n));
    const res = selection(k, n, rr);
    const story = { perm: `How many ways can ${rr} of ${n} runners finish first to ${["", "", "second", "third", "fourth"][rr]}?`, permRep: `How many ${rr}-character codes can be made from ${n} symbols, repeats allowed?`,
      comb: `How many ways can a committee of ${rr} be chosen from ${n} people?`, combRep: `How many ways can you pick ${rr} scoops from ${n} flavours (repeats allowed, order doesn't matter)?` }[k];
    return [h("h2", null, story), numberQuestion(Number(res.value), `${res.why} ${res.formula}: ${res.work} = ${fmtBig(res.value)}.`)];
  }
  if (kind === "stars") {
    const n = int(6, 14), k = int(3, 4), atLeastOne = r() < 0.5;
    const res = starsAndBars(n, k, atLeastOne ? Array(k).fill(1) : []);
    return [h("h2", null, `How many solutions does x₁ + … + x${"₁₂₃₄"[k - 1]} = ${n} have in ${atLeastOne ? "positive" : "non-negative"} integers?`), numberQuestion(Number(res.value), `Stars and bars: ${res.work} = ${fmtBig(res.value)}.`)];
  }
  if (kind === "ie") {
    const N = [100, 120, 200, 250, 500, 1000][int(0, 5)], ds = [[2, 3], [2, 5], [3, 5], [2, 3, 5], [2, 3, 7], [3, 5, 7]][int(0, 5)];
    const res = divisibleCount(N, ds), none = r() < 0.4;
    return [h("h2", null, `How many of the integers 1 to ${N} are divisible by ${none ? "none" : "at least one"} of ${ds.join(", ")}?`), numberQuestion(none ? res.none : res.union, `Inclusion-exclusion: ${res.subsets.map((x) => `${x.count}`).join(", ")} for the single sets and intersections (signs alternate), giving ${res.union} divisible by at least one${none ? `, so ${N} − ${res.union} = ${res.none} by none` : ""}.`)];
  }
  if (kind === "derange") {
    const n = int(3, 7);
    return [h("h2", null, `${n} letters go into ${n} addressed envelopes. In how many ways is no letter in its own envelope?`), numberQuestion(Number(derangement(n)), `D(${n}) = ${fmtBig(derangement(n))}, from D(n) = (n − 1)(D(n − 1) + D(n − 2)).`)];
  }
  if (kind === "catalan") {
    const n = int(3, 7), story = r() < 0.5 ? `How many structurally different binary trees have ${n} nodes?` : `How many strings of ${n} pairs of balanced brackets are there?`;
    return [h("h2", null, story), numberQuestion(Number(catalan(n)), `The Catalan number C(${n}) = C(${2 * n}, ${n})/${n + 1} = ${fmtBig(catalan(n))}.`)];
  }
  if (kind === "pigeon") {
    const boxes = int(3, 12), want = int(2, 5);
    return [h("h2", null, `A drawer has socks in ${boxes} colours. How many socks must you take, without looking, to be sure of ${want} of the same colour?`), numberQuestion(forceCount(boxes, want), `Worst case: ${want - 1} of every colour (${boxes * (want - 1)} socks), then one more: k(r − 1) + 1 = ${forceCount(boxes, want)}.`)];
  }
  const ex = Object.values(REC_EXAMPLES).filter((x) => x.c2 !== -1)[int(0, 4)];
  const res = solveRecurrence(ex, 8), n = int(5, 8);
  return [h("h2", null, `With ${ex.name.split(":").pop().replace(/\(.*\)/, "").trim()}, a₀ = ${ex.a0}${ex.c2 ? `, a₁ = ${ex.a1}` : ""}, what is a${"₀₁₂₃₄₅₆₇₈"[n]}?`), numberQuestion(res.values[n], `The values run ${res.values.slice(0, n + 1).join(", ")}; the closed form is aₙ = ${res.formula}.`)];
}

export function render(root) {
  const p = readParams(), num = (k, d) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : d);
  const state = {
    mode: MODES[p.get("mode")] ? p.get("mode") : "select",
    kind: SELECTIONS[p.get("kind")] ? p.get("kind") : "comb", n: num("n", 5), r: num("r", 3), word: p.get("word") ?? "",
    k: num("k", 3), lo: p.get("lo") ?? "",
    ie: p.get("ie") === "sizes" ? "sizes" : "div", N: num("N", 100), divs: p.get("d") ?? "2 3 5", sizes: p.get("s") ?? "A=20 B=15 C=10 AB=5 AC=4 BC=3 ABC=2",
    items: num("items", 13), boxes: num("boxes", 4),
    c1: num("c1", 1), c2: num("c2", 1), d: num("cd", 0), a0: num("a0", 0), a1: num("a1", 1),
  };
  const head = page({
    subject: "Discrete maths", title: "Combinatorics",
    lede: "Count without listing: permutations and combinations, stars and bars, inclusion-exclusion on a live Venn diagram, pigeonhole, derangements, Catalan numbers and linear recurrences.",
    theory: h("div", null,
      h("p", null, "Most counting questions come down to two choices: ", h("b", null, "does order matter"), ", and ", h("b", null, "can things repeat"), "? That picks one of nʳ, P(n, r), C(n, r) or C(n + r − 1, r)."),
      h("ul", null,
        h("li", null, h("b", null, "Stars and bars"), ": n identical items into k boxes is C(n + k − 1, k − 1), because an arrangement is n stars and k − 1 bars in a row."),
        h("li", null, h("b", null, "Inclusion-exclusion"), ": |A ∪ B ∪ C| = |A| + |B| + |C| − |A∩B| − |A∩C| − |B∩C| + |A∩B∩C|. Add singles, subtract pairs, add triples, …"),
        h("li", null, h("b", null, "Pigeonhole"), ": n items in k boxes put at least ⌈n/k⌉ in some box."),
        h("li", null, h("b", null, "Derangements"), " D(n) count permutations with no fixed point: D(n) = (n − 1)(D(n − 1) + D(n − 2)) = n! Σ (−1)ᵏ/k!."),
        h("li", null, h("b", null, "Catalan numbers"), " C(n) = C(2n, n)/(n + 1) = 1, 1, 2, 5, 14, 42, … count balanced brackets, binary trees and more."),
        h("li", null, "A ", h("b", null, "linear recurrence"), " aₙ = c₁aₙ₋₁ + c₂aₙ₋₂ is solved by the roots of x² = c₁x + c₂: distinct roots give A·r₁ⁿ + B·r₂ⁿ, a repeated root (A + Bn)rⁿ."))),
    conventions: [
      "Big counts are exact (no rounding), with commas every three digits.",
      "Inclusion-exclusion sizes are typed as A=20 B=15 AB=5 (add C, AC, BC, ABC for three sets).",
      "Recurrences: aₙ = c₁aₙ₋₁ + c₂aₙ₋₂ + d. Set c₂ = 0 for a first-order recurrence (then a₁ is ignored).",
      "Irrational roots and coefficients are shown to 4 decimal places; the table checks the formula against the recurrence.",
    ],
  });
  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  let destroy = null;
  const set = (k, lo = -999, hi = 999) => (v) => { state[k] = Math.max(lo, Math.min(hi, v)); update(); };
  function drawInputs() {
    const m = state.mode;
    const fields = {
      select: [select(Object.fromEntries(Object.entries(SELECTIONS).map(([k, v]) => [k, v.name])), state.kind, (v) => { state.kind = v; update(); }, "Kind"),
        numberInput("n", state.n, set("n", 0, 30)), numberInput("r", state.r, set("r", 0, 20)), textInput("Word to arrange (optional)", state.word, (v) => { state.word = v.replace(/[^A-Za-z]/g, "").slice(0, 12); update(); }, { wide: false })],
      stars: [numberInput("Items n", state.n, set("n", 0, 40)), numberInput("Boxes k", state.k, set("k", 1, 8)), textInput("Minimum per box (optional, e.g. 1 1 2)", state.lo, (v) => { state.lo = v; update(); }, { wide: false })],
      ie: [select({ div: "Divisible by…", sizes: "Set sizes" }, state.ie, (v) => { state.ie = v; drawInputs(); update(); }, "Kind"),
        ...(state.ie === "div" ? [numberInput("Up to N", state.N, set("N", 1, 100000), { max: 100000, width: 96 }), textInput("Divisors", state.divs, (v) => { state.divs = v; update(); }, { wide: false })]
          : [textInput("Sizes", state.sizes, (v) => { state.sizes = v; update(); })])],
      pigeon: [numberInput("Items", state.items, set("items", 1, 200), { max: 200 }), numberInput("Boxes", state.boxes, set("boxes", 1, 12))],
      derange: [numberInput("n", state.n, set("n", 1, 20))],
      catalan: [numberInput("n", state.n, set("n", 0, 20))],
      rec: [select({ "": "Load an example…", ...Object.fromEntries(Object.entries(REC_EXAMPLES).map(([k, v]) => [k, v.name])) }, "", (k) => { if (!k) return; Object.assign(state, { c1: REC_EXAMPLES[k].c1, c2: REC_EXAMPLES[k].c2, d: REC_EXAMPLES[k].d, a0: REC_EXAMPLES[k].a0, a1: REC_EXAMPLES[k].a1 }); drawInputs(); update(); }, "Example"),
        numberInput("c₁", state.c1, set("c1", -20, 20), { min: -20, max: 20 }), numberInput("c₂", state.c2, set("c2", -20, 20), { min: -20, max: 20 }), numberInput("d", state.d, set("d", -50, 50), { min: -50, max: 50 }),
        numberInput("a₀", state.a0, set("a0", -100, 100), { min: -100, max: 100 }), numberInput("a₁", state.a1, set("a1", -100, 100), { min: -100, max: 100 })],
    }[m];
    inputs.replaceChildren(h("div", { class: "row" }, select(MODES, m, (v) => { state.mode = v; if (v === "derange" || v === "catalan") state.n = Math.min(state.n, 8); drawInputs(); update(); }, "Mode"), linkButton()), h("div", { class: "row" }, fields));
  }
  function update() {
    destroy?.(); destroy = null;
    const s = state, m = s.mode;
    const params = { mode: m, ...{ select: { kind: s.kind, n: s.n, r: s.r, ...(s.word ? { word: s.word } : {}) }, stars: { n: s.n, k: s.k, ...(s.lo ? { lo: s.lo } : {}) },
      ie: s.ie === "div" ? { ie: "div", N: s.N, d: s.divs } : { ie: "sizes", s: s.sizes }, pigeon: { items: s.items, boxes: s.boxes }, derange: { n: s.n }, catalan: { n: s.n },
      rec: { c1: s.c1, c2: s.c2, cd: s.d, a0: s.a0, a1: s.a1 } }[m] };
    writeParams(params);
    try {
      const res = { select: selectMode, stars: starsMode, ie: ieMode, pigeon: pigeonMode, derange: derangeMode, catalan: catalanMode, rec: recMode }[m](s);
      msg.replaceChildren(); out.replaceChildren(...res.els); destroy = res.destroy;
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }
  drawInputs();
  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);
  shell(root, head, visual, question);
  update();
  return () => destroy?.();
}
