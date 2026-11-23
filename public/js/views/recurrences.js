import {
  EXAMPLES, GROWTHS, MASTER_CODE, SUBST_CODE, TREE_CODE, compareGrowth, exactT, fmtNum, levelFormula, log2Value, num, parseF, parseRecurrence, recursionTree,
  sampleN, showGrowth, solve, substitution, theta,
} from "../engines/recurrences.js";
import { h, notice, page, readParams, writeParams } from "../ui.js";
import { choice, numberQuestion } from "./kit.js";
import { linkButton, select, shell, table, traceCard } from "./dm-kit.js";

const MODES = {
  tree: "Recursion tree",
  master: "Master theorem",
  subst: "Substitution check",
  growth: "Growth rates compared",
};

// Node labels: symbolic where the pattern is simple, else the number.
function sizeLabel(rec, depth, size) {
  if (rec.type === "divide" && rec.terms.length === 1) {
    const b = Math.round(1 / rec.terms[0].frac);
    if (Math.abs(1 / rec.terms[0].frac - b) < 1e-9) return depth === 0 ? "n" : `n/${b ** depth}`;
  }
  if (rec.type === "subtract" && rec.terms.length === 1) return depth === 0 ? "n" : `n−${rec.terms[0].b * depth}`;
  if (rec.type === "root") return depth === 0 ? "n" : `n^(1/${rec.terms[0].r ** depth})`;
  return num(size, 1);
}

function treeSvg(rec, tree, upto) {
  const shown = tree.levels.slice(0, 7), W = 640, rowH = 58, H = shown.length * rowH + 20, MAX = 8;
  const els = [];
  let prevXs = [];
  shown.forEach((lvl, d) => {
    const y = 26 + d * rowH, on = d <= upto;
    const flat = lvl.groups.flatMap((g) => Array.from({ length: Math.min(g.count, MAX) }, () => g.size)).slice(0, MAX);
    const more = lvl.count - flat.length;
    const area = 430, xs = flat.map((_, i) => 20 + ((i + 0.5) * area) / flat.length);
    if (d > 0 && on) xs.forEach((x, i) => { const px = prevXs[Math.min(prevXs.length - 1, Math.floor((i * prevXs.length) / xs.length))]; if (px != null) els.push(h("line", { x1: px, y1: y - rowH + 13, x2: x, y2: y - 13, class: "dm-tedge" })); });
    flat.forEach((s, i) => {
      const label = sizeLabel(rec, d, s), w = Math.min(area / flat.length - 6, Math.max(34, label.length * 7.4 + 12));
      els.push(h("g", { class: `dm-tnode${on ? "" : " off"}${s <= 1 + 1e-9 ? " leaf" : ""}`, "data-k": `t:${d}:${i}`, "data-x": xs[i], "data-y": y },
        h("rect", { x: xs[i] - w / 2, y: y - 13, width: w, height: 26, rx: 8 }), h("text", { x: xs[i], y: y + 4.5, "text-anchor": "middle" }, w > 30 ? label : "")));
    });
    if (more > 0 && on) els.push(h("text", { x: 458, y: y + 4, class: "dm-more" }, `… ${fmtNum(lvl.count)} nodes`));
    if (on) els.push(h("text", { x: W - 10, y: y + 4, "text-anchor": "end", class: "dm-lcost" }, `${fmtNum(lvl.cost)}`));
    prevXs = xs;
  });
  els.push(h("text", { x: W - 10, y: 12, "text-anchor": "end", class: "dm-lhead" }, "level cost"));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dm-tree", role: "img", "aria-label": `Recursion tree, ${shown.length} levels shown; level costs ${shown.slice(0, upto + 1).map((l) => fmtNum(l.cost)).join(", ")}` }, els);
}

function treeMode(rec) {
  const n = sampleN(rec), tree = recursionTree(rec, n), lf = levelFormula(rec), sol = solve(rec);
  const L = tree.levels, steps = [];
  L.slice(0, 7).forEach((lvl, d) => {
    const leaf = lvl.groups.every((g) => g.size <= 1 + 1e-9);
    steps.push({ upto: d, line: d === 0 ? 1 : leaf ? 4 : [2, 3], vars: { level: d, nodes: lvl.count, "level cost": fmtNum(lvl.cost) },
      note: d === 0 ? `Take n = ${n}. The root does f(${n}) = ${fmtNum(lvl.cost)} work.` : leaf ? `Level ${d} is all leaves: ${fmtNum(lvl.count)} of them at T(1) = 1 each.` : `Level ${d}: ${fmtNum(lvl.count)} node${lvl.count === 1 ? "" : "s"}, costing ${fmtNum(lvl.cost)} in total${L[d - 1].cost ? ` (${(lvl.cost / L[d - 1].cost).toFixed(2)}× the level above)` : ""}.` });
  });
  if (L.length > 7) steps.push({ upto: 6, line: 2, vars: { levels: L.length }, note: `… and so on: ${L.length} levels in all for n = ${n}.` });
  const trend = lf ? (lf.trend === "equal" ? `Every level costs about the same (ratio ${num(lf.ratio)}), so T(n) ≈ f(n) × the number of levels.` : lf.trend === "falling" ? `Level costs fall geometrically (ratio ${num(lf.ratio, 3)} < 1), so the root's f(n) dominates.` : `Level costs rise geometrically (ratio ${num(lf.ratio, 3)} > 1), so the leaves dominate.`) : "";
  steps.push({ upto: 6, line: 5, tone: "good", vars: { "T(n)": fmtNum(tree.total), answer: sol.answer }, note: `Sum of all levels: T(${n}) = ${fmtNum(tree.total)}. ${trend} T(n) = ${sol.answer}.` });
  const card = traceCard({ title: `Recursion tree for ${rec.text}`, steps, code: TREE_CODE, interval: 1100, draw: (st) => treeSvg(rec, tree, st.upto) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, `T(n) = ${sol.answer}`),
    lf ? h("p", null, h("code", { class: "dm-formula" }, lf.text)) : null,
    table(["Level", "Nodes", "Level cost (n = " + n + ")"], L.slice(0, 12).map((l) => [String(l.depth), fmtNum(l.count), fmtNum(l.cost)])),
    h("p", { class: "muted small" }, "Numbers use T(1) = 1, log base 2 and exact sizes; the Θ answer ignores constants and rounding."))], destroy: card.destroy };
}

function masterMode(rec) {
  const sol = solve(rec);
  const card = traceCard({ title: rec.text, steps: sol.steps, code: MASTER_CODE, interval: 1400,
    draw: (st, i) => {
      const done = i === sol.steps.length - 1;
      const cases = [["1", "f smaller", "leaves win: Θ(n^c)"], ["2", "f about equal", "every level: Θ(n^c log^(k+1) n)"], ["3", "f bigger", "root wins: Θ(f(n))"]];
      return h("div", { class: "dm-cases" }, cases.map(([k, a, b]) => h("div", { class: `dm-case${done && String(sol.case) === k ? " on" : ""}` }, h("b", null, `Case ${k}`), h("span", null, a), h("small", null, b))));
    } });
  const rows = Object.values(EXAMPLES).map((ex) => { const r = parseRecurrence(ex.text), s = solve(r); return [ex.name, r.text, s.case ? `${s.method === "master" ? "master" : s.method === "akra" ? "Akra-Bazzi" : s.method} ${s.case}${s.basic === false ? " (extended)" : ""}` : s.method, s.answer]; });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Common recurrences"), table(["Where", "Recurrence", "Method / case", "Solution"], rows, { rowCls: (i) => (rows[i][1] === rec.text ? "hot" : null) }))], destroy: card.destroy };
}

function substMode(rec, guessText) {
  const sol = solve(rec);
  const guess = guessText.trim() ? parseF(guessText) : sol.growth;
  const res = substitution(rec, guess);
  const maxR = Math.max(...res.rows.map((r) => r.ratio));
  const card = traceCard({ title: `Does T(n) = Θ(${showGrowth(guess)}) hold?`, steps: res.steps, code: SUBST_CODE,
    draw: (st) => h("div", null, table(["n", "T(n)", "g(n)", "T(n) / g(n)"], res.rows.map((r, i) => (i <= st.row ? [String(r.n), fmtNum(r.t), fmtNum(r.g), r.ratio.toPrecision(4)] : [String(r.n), "", "", ""])), { rowCls: (i) => (i === st.row ? "hot" : null) }),
      h("div", { class: "dm-ratio", role: "img", "aria-label": "Ratio bars" }, res.rows.map((r, i) => h("i", { style: `height:${i <= st.row ? Math.max(3, (r.ratio / maxR) * 100) : 0}%`, title: r.ratio.toPrecision(4) })))) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "The proof by induction"),
    h("p", null, `To prove T(n) ≤ c·g(n), assume it for every m < n and substitute into the recurrence. For ${rec.text} the solution is ${sol.answer}; a guess that is too small leaves an extra term you can't absorb into c·g(n), and the numbers above show it as a ratio that keeps growing.`),
    h("p", { class: "muted small" }, "A numeric check can't separate factors that grow very slowly (like log log n) over this range of n. Try guessing the wrong answer, say n for merge sort, and watch the ratio climb."))], destroy: card.destroy };
}

function chartSvg(keys, extra, upto, N = 40) {
  const W = 640, H = 300, pad = 40;
  const series = [...keys.map((k) => ({ key: k, label: GROWTHS[k].label, g: GROWTHS[k].g })), ...(extra ? [{ key: "rec", label: extra.label, g: extra.g, hot: true }] : [])];
  const ymax = 64; // log2 of the value, capped
  const x = (n) => pad + ((n - 1) / (N - 1)) * (W - pad - 90), y = (v) => H - pad - (Math.min(v, ymax) / ymax) * (H - 2 * pad);
  const drawn = series.slice(0, upto + 1).map((s, i) => {
    const pts = [];
    for (let n = 1; n <= N; n++) { const v = Math.max(0, log2Value(s.g, n)); pts.push(`${x(n).toFixed(1)},${y(v).toFixed(1)}`); if (v > ymax) break; }
    const last = pts[pts.length - 1].split(",").map(Number);
    return { s, i, pts, lx: Math.min(last[0] + 4, W - 88), ly: Math.max(12, last[1] + 4), end: pts.length === N };
  });
  // Curves that reach the right edge bunch up there: push their labels apart.
  const ends = drawn.filter((d) => d.end).sort((a, b) => b.ly - a.ly);
  for (let k = 1; k < ends.length; k++) ends[k].ly = Math.min(ends[k].ly, ends[k - 1].ly - 12);
  const lines = drawn.map(({ s, i, pts, lx, ly }) => h("g", { class: `dm-curve${s.hot ? " hot" : ""}`, style: `--c:var(--series-${(i % 8) + 1})` },
    h("polyline", { points: pts.join(" ") }), h("text", { x: lx, y: ly }, s.label)));
  const ticks = [0, 16, 32, 48, 64].map((v) => h("g", { class: "dm-axis" }, h("line", { x1: pad, x2: W - 90, y1: y(v), y2: y(v) }), h("text", { x: pad - 6, y: y(v) + 4, "text-anchor": "end" }, v ? `2^${v}` : "1")));
  const xt = [1, 10, 20, 30, 40].map((n) => h("text", { x: x(n), y: H - pad + 16, "text-anchor": "middle", class: "dm-axis" }, n));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dm-chart", role: "img", "aria-label": `Growth of ${series.slice(0, upto + 1).map((s) => s.label).join(", ")} for n from 1 to ${N}, log scale` }, ticks, xt,
    h("text", { x: W - 90, y: H - 8, "text-anchor": "end", class: "dm-axis" }, "n"), lines);
}

function growthMode(rec) {
  const sol = rec ? solve(rec) : null;
  const keys = Object.keys(GROWTHS).sort((a, b) => compareGrowth(GROWTHS[a].g, GROWTHS[b].g));
  const steps = keys.map((k, i) => ({ upto: i, line: null, vars: { added: GROWTHS[k].label }, note: i === 0 ? `Start with ${GROWTHS[k].label}: constant time.` : `${GROWTHS[keys[i - 1]].label} = o(${GROWTHS[k].label}): ${GROWTHS[k].label} grows strictly faster, and eventually beats any constant multiple of it.` }));
  if (sol) steps.push({ upto: keys.length, line: null, tone: "good", vars: { "your T(n)": showGrowth(sol.growth) }, note: `Your recurrence, ${rec.text}, is ${sol.answer} (the thick line).` });
  const code = ["sort by: nⁿ, then n!, then the base of cⁿ, then the power of n, then of log n, then of log log n", "f = o(g) when f/g → 0: the first place they differ decides"];
  const card = traceCard({ title: "From slowest to fastest", steps, code, interval: 900, draw: (st) => chartSvg(keys, sol ? { label: "T(n)", g: sol.growth } : null, st.upto) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "The order"), h("p", { class: "dm-order" }, keys.map((k) => GROWTHS[k].label).join("  <  ")),
    h("p", { class: "muted small" }, "The vertical axis is logarithmic (each gridline is 2¹⁶ times the one below), so polynomials look like gentle curves and exponentials like straight lines. Useful facts: any power of log n is o(nᵉ) for every ε > 0; any polynomial is o(cⁿ) for c > 1; and n! is between (n/e)ⁿ and nⁿ."))], destroy: card.destroy };
}

// --- Practice -------------------------------------------------------------------------
function question(r) {
  const kind = ["master", "master", "value", "order", "case"][Math.floor(r() * 5)];
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  if (kind === "master" || kind === "case") {
    const a = pick([1, 2, 3, 4, 7, 8, 9]), b = pick([2, 3, 4]), f = pick(["1", "n", "n^2", "n log n", "sqrt(n)", "n^3", "log n"]);
    const rec = parseRecurrence(`T(n) = ${a}T(n/${b}) + ${f}`), sol = solve(rec);
    if (kind === "case") return [h("h2", null, `Which case of the master theorem applies to ${rec.text}?`), choice([1, 2, 3].map((k) => ({ label: `Case ${k}`, correct: sol.case === k })), sol.steps.map((s) => s.note).join(" "))];
    const wrong = [theta(sol.growth), "Θ(n)", "Θ(n log n)", "Θ(n²)", "Θ(log n)", `Θ(n^${num(Math.log(a) / Math.log(b))} log n)`, "Θ(n² log n)", "Θ(n³)"];
    const opts = [...new Set(wrong)].slice(0, 6).sort(() => r() - 0.5).slice(0, 4);
    if (!opts.includes(theta(sol.growth))) opts[0] = theta(sol.growth);
    return [h("h2", null, `Solve ${rec.text}.`), choice(opts.sort().map((o) => ({ label: o, correct: o === theta(sol.growth) })), sol.steps.map((s) => s.note).join(" "))];
  }
  if (kind === "value") {
    const ex = pick(["T(n) = 2T(n/2) + n", "T(n) = T(n/2) + 1", "T(n) = T(n-1) + n", "T(n) = 2T(n-1) + 1", "T(n) = 3T(n/2) + 1", "T(n) = 4T(n/2) + n"]);
    const rec = parseRecurrence(ex), n = rec.type === "subtract" ? pick([5, 6, 8, 10]) : pick([8, 16, 32]);
    return [h("h2", null, `If T(1) = 1 and ${rec.text}, what is T(${n})?`), numberQuestion(exactT(rec, n), `Unroll it from T(1) = 1 upwards; the asymptotic answer is ${solve(rec).answer}.`)];
  }
  const ks = Object.keys(GROWTHS).sort(() => r() - 0.5).slice(0, 4);
  const sorted = [...ks].sort((x, y) => compareGrowth(GROWTHS[x].g, GROWTHS[y].g));
  const show = (o) => o.map((k) => GROWTHS[k].label).join(" < ");
  const perms = [sorted, [sorted[1], sorted[0], sorted[2], sorted[3]], [sorted[0], sorted[2], sorted[1], sorted[3]], [sorted[0], sorted[1], sorted[3], sorted[2]]];
  return [h("h2", null, `Put in increasing order of growth: ${ks.map((k) => GROWTHS[k].label).join(", ")}.`), choice(perms.sort(() => r() - 0.5).map((o) => ({ label: show(o), correct: o === sorted })), `The order is ${show(sorted)}.`)];
}

export function render(root) {
  const p = readParams();
  const state = { mode: MODES[p.get("mode")] ? p.get("mode") : "tree", t: p.get("t") ?? EXAMPLES.merge.text, guess: p.get("guess") ?? "" };
  const head = page({
    subject: "Discrete maths · Algorithms", title: "Recurrences",
    lede: "Where does Θ(n log n) come from? Draw the recursion tree level by level, pick the master theorem case with the reasoning written out, check a guess against real numbers, and compare growth rates.",
    theory: h("div", null,
      h("p", null, "A divide-and-conquer algorithm that splits a problem of size n into ", h("b", null, "a"), " parts of size ", h("b", null, "n/b"), " and does ", h("b", null, "f(n)"), " extra work costs T(n) = a·T(n/b) + f(n)."),
      h("p", null, "In the ", h("b", null, "recursion tree"), ", level i has aⁱ nodes of size n/bⁱ, so it costs aⁱ·f(n/bⁱ), and there are log_b n levels ending in n^(log_b a) leaves. Whichever dominates decides the answer:"),
      h("ul", null,
        h("li", null, h("b", null, "Case 1"), ": f(n) is polynomially smaller than n^(log_b a). The leaves dominate: T(n) = Θ(n^(log_b a))."),
        h("li", null, h("b", null, "Case 2"), ": f(n) = Θ(n^(log_b a) logᵏ n). Every level costs about the same: T(n) = Θ(n^(log_b a) logᵏ⁺¹ n)."),
        h("li", null, h("b", null, "Case 3"), ": f(n) is polynomially bigger (and a·f(n/b) ≤ δ·f(n) for some δ < 1). The root dominates: T(n) = Θ(f(n)).")),
      h("p", null, "Recurrences like T(n − 1) + f(n) peel one item at a time, so they just add f over n levels; 2T(n − 1) + 1 doubles each level and grows like 2ⁿ. Unequal splits such as T(n/3) + T(2n/3) + n need Akra-Bazzi, and T(√n) needs the substitution m = log n.")),
    conventions: [
      "Type the right-hand side with terms like 2T(n/2), T(2n/3), T(n-1) or T(sqrt(n)), plus f(n) such as n, n^2, n log n, n/log n, sqrt(n) or 1.",
      "T(1) = 1, logs are base 2 in the numbers, and n/b rounds down. None of this changes the Θ answer.",
      "Case 2 with k < 0 (for example f(n) = n/log n) is outside the basic CLRS theorem; the extended version used here gives Θ(n log log n) for k = −1 and Θ(n^(log_b a)) for k < −1.",
      "For T(n − b) with a > 1 the answer is Θ(a^(n/b)) when f is polynomial.",
    ],
  });
  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  let destroy = null;
  function drawInputs() {
    inputs.replaceChildren(
      h("div", { class: "row" }, select(MODES, state.mode, (v) => { state.mode = v; drawInputs(); update(); }, "Mode"),
        select({ "": "Load an example…", ...Object.fromEntries(Object.entries(EXAMPLES).map(([k, v]) => [k, `${v.name}: ${v.text.replace("T(n) = ", "")}`])) }, "", (k) => { if (k) { state.t = EXAMPLES[k].text; drawInputs(); update(); } }, "Example"),
        linkButton()),
      h("label", { class: "stack" }, "Recurrence", h("input", { type: "text", class: "mono wide", value: state.t, spellcheck: "false", "aria-label": "Recurrence", oninput: (e) => { state.t = e.target.value; update(); } })),
      state.mode === "subst" ? h("label", { class: "stack" }, "Your guess g(n) (empty = the solution)", h("input", { type: "text", class: "mono wide", value: state.guess, placeholder: "n log n", spellcheck: "false", "aria-label": "Guess", oninput: (e) => { state.guess = e.target.value; update(); } })) : null);
  }
  function update() {
    destroy?.(); destroy = null;
    writeParams({ mode: state.mode, t: state.t, ...(state.mode === "subst" && state.guess ? { guess: state.guess } : {}) });
    try {
      const rec = parseRecurrence(state.t);
      const res = state.mode === "tree" ? treeMode(rec) : state.mode === "master" ? masterMode(rec) : state.mode === "subst" ? substMode(rec, state.guess) : growthMode(rec);
      msg.replaceChildren(); out.replaceChildren(...res.els); destroy = res.destroy;
    } catch (e) {
      msg.replaceChildren(notice("error", e.message));
      if (state.mode === "growth") { const res = growthMode(null); out.replaceChildren(...res.els); destroy = res.destroy; } else out.replaceChildren();
    }
  }
  drawInputs();
  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);
  shell(root, head, visual, question);
  update();
  return () => destroy?.();
}
