import { EXAMPLES, EXTREMA_CODE, INTEGRAL_CODE, LIMIT_CODE, METHODS, MVT_CODE, extrema, fmt, integral, limit, mvt, numArg } from "../engines/calculus.js";
import { compile, polyEval } from "../engines/expr.js";
import { calculus as makeQuestion } from "../gate/maths.js";
import { copyLink, h, notice, page, readParams, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { plotFrame, practiceCard, simulation, yRange } from "./maths-kit.js";

const MODES = { limit: "Limits and L'Hôpital", extrema: "Maxima and minima", integral: "Definite integrals", mvt: "Mean value theorem" };
const DEFAULT_F = { limit: "sin(x)/x", extrema: "x^3 - 3x + 2", integral: "x^2", mvt: "x^3" };

// --- Limits ---------------------------------------------------------------------------------

function limitVisual(res, s) {
  const f = compile(res.expr);
  const finite = Number.isFinite(res.a);
  const [x0, x1] = finite ? [res.a - 2, res.a + 2] : res.a > 0 ? [0.5, 60] : [-60, -0.5];
  const L = Number.isFinite(res.answer) ? res.answer : null;
  const [y0, y1] = yRange(f, x0, x1, L !== null ? [L] : []);
  const P = plotFrame({ x0, x1, y0, y1, W: 560, H: 260 });
  const kids = [P.curve(f)];
  if (finite) kids.push(h("line", { x1: P.sx(res.a), x2: P.sx(res.a), y1: P.sy(y0), y2: P.sy(y1), class: "mx-mean" }));
  const shown = res.table.slice(0, s.rows);
  for (const r of shown) {
    if (finite) for (const [x, y] of [[r.xl, r.left], [r.xr, r.right]]) { if (Number.isFinite(y) && y > y0 && y < y1) kids.push(h("circle", { cx: P.sx(x), cy: P.sy(y), r: 3.5, class: "mx-dot" })); }
    else if (Number.isFinite(r.value) && r.x >= x0 && r.x <= x1) kids.push(h("circle", { cx: P.sx(r.x), cy: P.sy(r.value), r: 3.5, class: "mx-dot" }));
  }
  if (s.done && L !== null) {
    kids.push(h("line", { x1: P.sx(x0), x2: P.sx(x1), y1: P.sy(L), y2: P.sy(L), class: "mx-target" }));
    if (finite) kids.push(h("circle", { cx: P.sx(res.a), cy: P.sy(L), r: 5, class: "mx-hole" }));
  }
  const table = h("div", { class: "table-wrap" }, h("table", { class: "parse mx-limtable" },
    h("thead", null, h("tr", null, (finite ? ["h", `f(${fmt(res.a)} − h)`, `f(${fmt(res.a)} + h)`] : ["x", "f(x)"]).map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, res.table.map((r, i) => h("tr", { class: i < s.rows ? (i === s.rows - 1 ? "hot" : null) : "later" },
      finite ? [h("td", null, fmt(r.h)), h("td", null, i < s.rows ? fmt(r.left, 6) : "…"), h("td", null, i < s.rows ? fmt(r.right, 6) : "…")] : [h("td", null, fmt(r.x)), h("td", null, i < s.rows ? fmt(r.value, 6) : "…")])))));
  return h("div", null, P.svg(kids, `Graph of f near ${finite ? fmt(res.a) : "infinity"}`), table);
}

// --- Extrema --------------------------------------------------------------------------------

function extremaVisual(res, s) {
  const xs = res.points.map((p) => p.x.value);
  let x0 = xs.length ? Math.min(...xs) - 2 : -3, x1 = xs.length ? Math.max(...xs) + 2 : 3;
  const iv = res.interval ? res.interval.map(numArg) : null;
  if (iv) { x0 = Math.min(x0, iv[0] - 0.5); x1 = Math.max(x1, iv[1] + 0.5); }
  const f = (x) => polyEval(res.poly, x);
  const [y0, y1] = yRange(f, x0, x1, res.points.map((p) => p.value));
  const P = plotFrame({ x0, x1, y0, y1, W: 560, H: 260 });
  const kids = [];
  if (iv) kids.push(h("rect", { x: P.sx(iv[0]), y: P.sy(y1), width: P.sx(iv[1]) - P.sx(iv[0]), height: P.sy(y0) - P.sy(y1), class: "mx-band" }));
  kids.push(P.curve(f));
  if (s.crit || s.chart >= 1) res.points.forEach((pt, i) => {
    const known = s.chart >= 2 + i;
    kids.push(h("circle", { cx: P.sx(pt.x.value), cy: P.sy(pt.value), r: 5.5, class: `mx-crit ${known ? pt.kind : ""}` }),
      known ? h("text", { x: P.sx(pt.x.value), y: P.sy(pt.value) + (pt.kind === "min" ? 18 : -10), "text-anchor": "middle", class: "mx-label" }, pt.kind === "max" ? "max" : pt.kind === "min" ? "min" : "flat") : null);
  });
  const chart = s.chart >= 1 ? h("div", { class: "mx-signs", role: "img", "aria-label": "Sign chart of p′" },
    res.intervals.flatMap((iv, i) => [
      h("div", { class: `mx-sign ${iv.sign > 0 ? "up" : "down"}` }, h("b", null, iv.sign > 0 ? "+" : "−"), h("span", null, iv.sign > 0 ? "↗ increasing" : "↘ decreasing"), h("small", null, `(${fmt(iv.from, 3)}, ${fmt(iv.to, 3)})`)),
      i < res.points.length ? h("div", { class: "mx-sign-pt" }, res.points[i].x.exact ? String(res.points[i].x.exact) : fmt(res.points[i].x.value, 3)) : null,
    ])) : null;
  return h("div", null, P.svg(kids, "Graph of p with its critical points"), chart);
}

// --- Integrals ------------------------------------------------------------------------------

function integralVisual(res, s) {
  const f = compile(res.expr);
  const m = (res.b - res.a) * 0.15;
  const x0 = res.a - m, x1 = res.b + m;
  const [y0r, y1r] = yRange(f, x0, x1, [0]);
  const P = plotFrame({ x0, x1, y0: Math.min(0, y0r), y1: Math.max(0, y1r), W: 560, H: 260 });
  const kids = [];
  // The exact area, lightly.
  let d = `M${P.sx(res.a)},${P.sy(0)}`;
  for (let i = 0; i <= 200; i++) { const x = res.a + ((res.b - res.a) * i) / 200; d += `L${P.sx(x).toFixed(1)},${P.sy(f(x)).toFixed(1)}`; }
  kids.push(h("path", { d: `${d}L${P.sx(res.b)},${P.sy(0)}Z`, class: "mx-shade light" }));
  const n = s.n;
  if (n) {
    const dx = (res.b - res.a) / n;
    for (let i = 0; i < n; i++) {
      const l = res.a + i * dx, r = l + dx;
      if (res.method === "trap") kids.push(h("path", { d: `M${P.sx(l)},${P.sy(0)}L${P.sx(l)},${P.sy(f(l))}L${P.sx(r)},${P.sy(f(r))}L${P.sx(r)},${P.sy(0)}Z`, class: "mx-strip" }));
      else if (res.method === "simpson") {
        if (i % 2) continue;
        const r2 = l + 2 * dx, fa = f(l), fm = f(l + dx), fb = f(r2);
        // The parabola through the three points.
        let pd = `M${P.sx(l)},${P.sy(0)}`;
        for (let k = 0; k <= 20; k++) { const t = k / 20, x = l + 2 * dx * t; const y = fa * (1 - t) * (1 - 2 * t) + 4 * fm * t * (1 - t) + fb * t * (2 * t - 1); pd += `L${P.sx(x).toFixed(1)},${P.sy(y).toFixed(1)}`; }
        kids.push(h("path", { d: `${pd}L${P.sx(r2)},${P.sy(0)}Z`, class: "mx-strip" }));
      } else {
        const at = res.method === "left" ? l : res.method === "right" ? r : (l + r) / 2, y = f(at);
        kids.push(h("rect", { x: P.sx(l), y: Math.min(P.sy(y), P.sy(0)), width: Math.max(0.5, P.sx(r) - P.sx(l)), height: Math.abs(P.sy(y) - P.sy(0)), class: `mx-strip${y < 0 ? " neg" : ""}` }),
          n <= 32 ? h("circle", { cx: P.sx(at), cy: P.sy(y), r: 2.5, class: "mx-dot" }) : null);
      }
    }
  }
  kids.push(P.curve(f));
  const rows = res.sums.filter((x) => x.n <= (n || 0));
  const table = h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, ["n", "Δx", "sum", "error"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, rows.map((x) => h("tr", { class: x.n === n ? "hot" : null }, h("td", null, x.n), h("td", null, fmt((res.b - res.a) / x.n, 4)), h("td", null, fmt(x.sum, 6)), h("td", null, fmt(x.error, 6)))))));
  return h("div", null, P.svg(kids, `Area under f from ${fmt(res.a)} to ${fmt(res.b)} with ${n} strips`), rows.length ? table : null);
}

// --- MVT ------------------------------------------------------------------------------------

function mvtVisual(res, s) {
  const f = compile(res.expr);
  const m = (res.b - res.a) * 0.25, x0 = res.a - m, x1 = res.b + m;
  const [y0, y1] = yRange(f, x0, x1, [res.fa, res.fb]);
  const P = plotFrame({ x0, x1, y0, y1, W: 560, H: 260 });
  const kids = [P.curve(f)];
  const line = (x, y, slope, cls) => h("line", { x1: P.sx(x0), y1: P.sy(y + slope * (x0 - x)), x2: P.sx(x1), y2: P.sy(y + slope * (x1 - x)), class: cls });
  kids.push(h("circle", { cx: P.sx(res.a), cy: P.sy(res.fa), r: 4.5, class: "mx-dot" }), h("circle", { cx: P.sx(res.b), cy: P.sy(res.fb), r: 4.5, class: "mx-dot" }));
  if (s.show !== "curve") kids.push(line(res.a, res.fa, res.slope, "mx-secant"));
  if (s.show === "tangent") for (const c of res.cs) {
    const fc = f(c.value);
    kids.push(line(c.value, fc, res.slope, "mx-tangent"), h("circle", { cx: P.sx(c.value), cy: P.sy(fc), r: 5, class: "mx-crit max" }), h("text", { x: P.sx(c.value), y: P.sy(fc) - 10, "text-anchor": "middle", class: "mx-label" }, `c = ${c.text}`));
  }
  return P.svg(kids, "The curve, the secant from a to b, and the parallel tangent at c");
}

// --- The view -------------------------------------------------------------------------------

export function render(root) {
  const p = readParams();
  const mode = MODES[p.get("mode")] ? p.get("mode") : "limit";
  const state = { mode, f: p.get("f") ?? DEFAULT_F[mode], at: p.get("at") ?? "0", lo: p.get("lo") ?? "", hi: p.get("hi") ?? "", a: p.get("a") ?? "0", b: p.get("b") ?? "2", method: METHODS[p.get("method")] ? p.get("method") : "mid", n: Number(p.get("n")) || 16 };
  let sim = null;

  const head = page({
    subject: "Engineering maths",
    title: "Calculus",
    lede: "Limits from a table of values and by L'Hôpital's rule, turning points from a sign chart, integrals as Riemann sums closing in on the exact area, and the mean value theorem drawn.",
    theory: h("div", null,
      h("p", null, h("b", null, "Limits"), ": if f is continuous at a, the limit is just f(a). When substituting gives ", h("b", null, "0/0 or ∞/∞"), ", L'Hôpital's rule says lim f/g = lim f′/g′ (differentiate top and bottom separately), as long as the new limit exists. Other forms are rewritten first: 0·∞ as a quotient, and 1^∞, 0⁰, ∞⁰ by taking logs. Standard results: sin x / x → 1, (1 − cos x)/x² → ½, (eˣ − 1)/x → 1, (1 + 1/x)ˣ → e."),
      h("p", null, h("b", null, "Maxima and minima"), ": turning points are where f′(x) = 0. If f′ changes from + to −, it's a local maximum; from − to +, a local minimum; no change, neither. The ", h("b", null, "second derivative test"), " agrees: f″ < 0 max, f″ > 0 min, f″ = 0 inconclusive. On a closed interval, the absolute extremes are at critical points or endpoints."),
      h("p", null, h("b", null, "Definite integrals"), " are limits of Riemann sums: cut [a, b] into n strips of width Δx and add up f × Δx. The ", h("b", null, "fundamental theorem"), " gives the exact value: ∫ₐᵇ f dx = F(b) − F(a) for any antiderivative F. Left and right sums have error about ∝ 1/n, midpoint and trapezoid ∝ 1/n², Simpson ∝ 1/n⁴."),
      h("p", null, h("b", null, "Mean value theorem"), ": if f is continuous on [a, b] and differentiable inside, some c in (a, b) has f′(c) = (f(b) − f(a))/(b − a). ", h("b", null, "Rolle's theorem"), " is the case f(a) = f(b), giving f′(c) = 0.")),
    conventions: [
      "Type functions with x: 3x^2 - 2x, sin(x)/x, exp(-x), ln(x), sqrt(x), abs(x), pi, e. Implicit multiplication works (2x, 3sin(x)).",
      "Limits: type inf or -inf for x → ±∞. The table uses h = 0.1, 0.01, … 0.000001 on both sides.",
      "Maxima and minima take polynomials up to degree 6; rational critical points are exact, others shown to 4 places.",
      "Integrals: exact values come from the standard antiderivatives (powers, 1/x, sin, cos, exp, √ of linear arguments); otherwise a Simpson's rule value with 20,000 strips is the reference.",
      "Simpson's rule needs an even n; the sums are shown for n = 1, 2, 4, 8, … up to your n.",
    ],
  });

  const modeSel = h("select", { "aria-label": "Topic", onchange: (e) => { state.mode = e.target.value; state.f = DEFAULT_F[state.mode]; if (state.mode === "integral") Object.assign(state, { a: "0", b: "2" }); if (state.mode === "mvt") Object.assign(state, { a: "0", b: "2" }); drawInputs(); update(); } },
    Object.entries(MODES).map(([id, n]) => h("option", { value: id, selected: id === state.mode }, n)));
  const inputs = h("div"), msg = h("div"), out = h("div", { class: "output" });
  const field = (key, label, cls = "short") => h("label", { class: "inline" }, `${label} `, h("input", { type: "text", class: `${cls} mono`, value: state[key], "aria-label": label, oninput: (e) => { state[key] = e.target.value; update(); } }));

  function drawInputs() {
    const fRow = h("div", { class: "row" }, h("label", { class: "inline mx-f" }, state.mode === "extrema" ? "p(x) = " : "f(x) = ", h("input", { type: "text", class: "wide mono", value: state.f, "aria-label": "Function of x", spellcheck: "false", oninput: (e) => { state.f = e.target.value; update(); } })));
    let extra;
    if (state.mode === "limit") extra = h("div", { class: "row" }, field("at", "x →"), h("span", { class: "muted small" }, "a number, inf or -inf"));
    else if (state.mode === "extrema") extra = h("div", { class: "row" }, h("span", { class: "muted small" }, "Optional interval for absolute max and min:"), field("lo", "a"), field("hi", "b"));
    else if (state.mode === "integral") extra = h("div", { class: "row" }, field("a", "from a"), field("b", "to b"),
      h("select", { "aria-label": "Method", onchange: (e) => { state.method = e.target.value; update(); } }, Object.entries(METHODS).map(([id, m]) => h("option", { value: id, selected: id === state.method }, m.name))),
      h("label", { class: "inline" }, "n ", h("input", { type: "number", min: 1, max: 256, value: state.n, "aria-label": "Number of strips", oninput: (e) => { state.n = Number(e.target.value); update(); } })));
    else extra = h("div", { class: "row" }, field("a", "a"), field("b", "b"));
    inputs.replaceChildren(fRow, extra);
  }

  function update() {
    sim?.player.destroy(); sim = null;
    let res, draw, code, card, url;
    try {
      if (state.mode === "limit") {
        res = limit(state.f, state.at);
        code = LIMIT_CODE; draw = (s) => limitVisual(res, s);
        url = { mode: "limit", f: state.f, at: state.at };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat("Limit", res.text), stat("Method", { substitution: "Direct substitution", lhopital: "L'Hôpital's rule", numeric: "Table of values" }[res.method]),
          Number.isFinite(res.a) ? stat("From the left (h = 10⁻⁶)", fmt(res.estimate.left, 5)) : stat("f(10⁶)", fmt(res.estimate.value, 5)),
          Number.isFinite(res.a) ? stat("From the right", fmt(res.estimate.right, 5)) : null));
      } else if (state.mode === "extrema") {
        const iv = state.lo.trim() && state.hi.trim() ? [state.lo.trim(), state.hi.trim()] : null;
        res = extrema(state.f, iv);
        code = EXTREMA_CODE; draw = (s) => extremaVisual(res, s);
        url = { mode: "extrema", f: state.f, ...(iv ? { lo: iv[0], hi: iv[1] } : {}) };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "table-wrap" }, h("table", { class: "parse" },
          h("thead", null, h("tr", null, ["x", "p(x)", "p″(x)", "Type"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, res.points.map((pt) => h("tr", null, h("td", null, pt.x.exact ? String(pt.x.exact) : fmt(pt.x.value, 4)), h("td", null, pt.exactValue ? String(pt.exactValue) : fmt(pt.value, 4)), h("td", null, pt.exactSecond ? String(pt.exactSecond) : fmt(pt.second, 4)), h("td", null, pt.kind === "max" ? "local maximum" : pt.kind === "min" ? "local minimum" : "neither")))))),
          res.absolute ? h("div", { class: "stats-row" }, stat(`Absolute max on [${iv[0]}, ${iv[1]}]`, `${fmt(res.absolute.max.value, 4)} at x = ${res.absolute.max.x}`), stat("Absolute min", `${fmt(res.absolute.min.value, 4)} at x = ${res.absolute.min.x}`)) : null);
      } else if (state.mode === "integral") {
        res = integral(state.f, state.a, state.b, state.method, state.n);
        code = INTEGRAL_CODE; draw = (s) => integralVisual(res, s);
        url = { mode: "integral", f: state.f, a: state.a, b: state.b, method: state.method, n: state.n };
        const last = res.sums.at(-1);
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat(res.exact !== null ? "Exact value" : "Reference value", res.exactText ?? fmt(res.reference)), stat(`${METHODS[state.method].name}, n = ${last.n}`, fmt(last.sum)), stat("Error", fmt(last.error)), res.F ? stat("F(x)", res.F, true) : null));
      } else {
        res = mvt(state.f, state.a, state.b);
        code = MVT_CODE; draw = (s) => mvtVisual(res, s);
        url = { mode: "mvt", f: state.f, a: state.a, b: state.b };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat("Secant slope", fmt(res.slope, 4)), stat("c", res.cs.map((c) => c.text).join(", ") || "none found"), stat("f′(x)", res.steps[2].vars["f′(x)"], true)));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    writeParams(url);
    sim = simulation(res.steps, code, draw, { interval: 1000 });
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, MODES[state.mode]), sim.el), card);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel,
        exampleSelect(EXAMPLES, (ex) => {
          state.mode = ex.mode; modeSel.value = ex.mode; state.f = ex.f;
          if (ex.at) state.at = ex.at;
          state.lo = ex.lo ?? ""; state.hi = ex.hi ?? "";
          if (ex.a) Object.assign(state, { a: ex.a, b: ex.b });
          if (ex.method) Object.assign(state, { method: ex.method, n: ex.n });
          drawInputs(); update();
        }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      inputs, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const newQuestion = () => practiceCard(practice, {
    intro: "Fresh GATE-style questions with answers worked out by the same engine. Give decimals to two places, or exact fractions.",
    kinds: [["any", "Any type"], ["limit", "Limits"], ["maxima", "Maxima and minima"], ["integral", "Definite integrals"], ["mvt", "Mean value theorem"]],
    make: (r, kind) => makeQuestion(r, kind),
  });

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => sim?.player.destroy();
}
