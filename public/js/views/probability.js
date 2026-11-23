import { BAYES_CODE, DISTS, DIST_CODE, EVENTS, EXAMPLES, EXPERIMENTS, QUERIES, RV_CODE, SPACE_CODE, bayes, distribution, fmt, randomVariable, sampleSpace } from "../engines/probability.js";
import { Fraction } from "../engines/fraction.js";
import { probability as makeQuestion } from "../gate/maths.js";
import { copyLink, h, notice, page, readParams, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { plotFrame, practiceCard, simulation } from "./maths-kit.js";

const MODES = { space: "Sample space and events", bayes: "Conditional probability and Bayes", rv: "Random variable: E[X] and Var(X)", dist: "Distributions" };
const pct = (f) => fmt(f.toNumber() * 100, 2);

// --- Sample space: a 6×6 dice grid or a coin tree -----------------------------------------

function diceGrid(res, show) {
  const S = 40, P = 30;
  const kids = [];
  for (let a = 1; a <= 6; a++) kids.push(h("text", { x: P + (a - 0.5) * S, y: 18, "text-anchor": "middle", class: "mx-tick" }, a), h("text", { x: 16, y: P + (a - 0.5) * S + 4, "text-anchor": "middle", class: "mx-tick" }, a));
  res.outcomes.forEach(([a, b], i) => {
    const A = res.inA[i], B = res.inB[i];
    const on = (show.includes("A") && A) || (show.includes("B") && B) || (show.includes("AB") && A && B);
    const cls = ["mx-cell", show.includes("A") && A ? "in-a" : "", show.includes("B") && B ? "in-b" : "", show.includes("AB") && A && B ? "in-ab" : "", !on && show.length ? "dim" : ""].filter(Boolean).join(" ");
    kids.push(h("g", { class: cls }, h("rect", { x: P + (a - 1) * S + 2, y: P + (b - 1) * S + 2, width: S - 4, height: S - 4, rx: 6 }),
      h("text", { x: P + (a - 0.5) * S, y: P + (b - 0.5) * S + 4, "text-anchor": "middle" }, `${a},${b}`)));
  });
  kids.push(h("text", { x: P + 3 * S, y: P + 6 * S + 22, "text-anchor": "middle", class: "mx-tick" }, "first die →  (rows: second die)"));
  return h("svg", { viewBox: `0 0 ${P + 6 * S + 6} ${P + 6 * S + 30}`, class: "mx-plot mx-dice", role: "img", "aria-label": `36 outcomes; ${res.nA} in A, ${res.nB} in B, ${res.nAB} in both` }, kids);
}

function coinTree(res, show) {
  const W = 520, H = 300, levels = 3;
  const kids = [];
  const xAt = (lvl) => 30 + (lvl * (W - 120)) / levels;
  const leafY = (i) => 20 + i * ((H - 40) / 7);
  // Nodes at each level: the y is the average of their leaves.
  for (let lvl = 0; lvl < levels; lvl++) {
    const groups = 2 ** lvl, span = 8 / groups;
    for (let g = 0; g < groups; g++) {
      const y = (leafY(g * span) + leafY(g * span + span - 1)) / 2;
      for (const [k, side] of [[0, "H"], [1, "T"]]) {
        const child = g * 2 + k, cspan = span / 2;
        const cy = (leafY(child * cspan) + leafY(child * cspan + cspan - 1)) / 2;
        kids.push(h("line", { x1: xAt(lvl), y1: y, x2: xAt(lvl + 1), y2: cy, class: "mx-branch" }),
          h("text", { x: (xAt(lvl) + xAt(lvl + 1)) / 2, y: (y + cy) / 2 - 4, "text-anchor": "middle", class: "mx-tick" }, `${side} ½`));
      }
    }
  }
  res.outcomes.forEach((o, i) => {
    const A = res.inA[i], B = res.inB[i];
    const on = (show.includes("A") && A) || (show.includes("B") && B) || (show.includes("AB") && A && B);
    const cls = ["mx-leaf", show.includes("A") && A ? "in-a" : "", show.includes("B") && B ? "in-b" : "", show.includes("AB") && A && B ? "in-ab" : "", !on && show.length ? "dim" : ""].filter(Boolean).join(" ");
    kids.push(h("g", { class: cls }, h("rect", { x: xAt(levels) + 4, y: leafY(i) - 13, width: 80, height: 26, rx: 6 }), h("text", { x: xAt(levels) + 44, y: leafY(i) + 5, "text-anchor": "middle" }, o.join(""))));
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "mx-plot", role: "img", "aria-label": `Tree of 8 outcomes; ${res.nA} in A, ${res.nB} in B` }, kids);
}

// --- Bayes: tree and area square ----------------------------------------------------------

function bayesPicture(res, stage) {
  const W = 300, H = 250, top = 20;
  const a = res.pA.toNumber(), h1 = res.pBA.toNumber(), h2 = res.pBnA.toNumber();
  const wA = Math.max(a * W, a > 0 ? 6 : 0);
  const area = [
    h("rect", { x: 0, y: top, width: wA, height: H - top, class: "mx-area a" }),
    h("rect", { x: wA, y: top, width: W - wA, height: H - top, class: "mx-area na" }),
  ];
  if (stage >= 2) area.push(
    h("rect", { x: 0, y: top + (1 - h1) * (H - top), width: wA, height: h1 * (H - top), class: `mx-area ab${stage >= 5 ? " hot" : ""}` }),
    h("rect", { x: wA, y: top + (1 - h2) * (H - top), width: W - wA, height: h2 * (H - top), class: "mx-area nab" }));
  area.push(h("text", { x: 4, y: 14, class: "mx-tick" }, `A: ${fmt(a)}`), h("text", { x: W - 4, y: 14, "text-anchor": "end", class: "mx-tick" }, `not A: ${fmt(1 - a)}`));
  const sq = h("svg", { viewBox: `0 0 ${W} ${H}`, class: "mx-plot mx-square", role: "img", "aria-label": "Unit square: width is P(A), the shaded heights are P(B | A) and P(B | not A)" }, area);
  // Tree.
  const T = (x, y, t, cls = "") => h("text", { x, y, class: `mx-tick ${cls}` }, t);
  const tw = 330, th = 220;
  const kids = [
    h("line", { x1: 10, y1: 110, x2: 110, y2: 55, class: "mx-branch" }), h("line", { x1: 10, y1: 110, x2: 110, y2: 165, class: "mx-branch" }),
    T(40, 72, String(res.pA)), T(40, 152, String(res.pnA)), T(114, 59, "A"), T(114, 169, "not A"),
  ];
  if (stage >= 2) kids.push(
    h("line", { x1: 150, y1: 55, x2: 220, y2: 25, class: "mx-branch" }), h("line", { x1: 150, y1: 55, x2: 220, y2: 85, class: "mx-branch" }),
    h("line", { x1: 165, y1: 165, x2: 220, y2: 135, class: "mx-branch" }), h("line", { x1: 165, y1: 165, x2: 220, y2: 195, class: "mx-branch" }),
    T(160, 30, String(res.pBA)), T(160, 135, String(res.pBnA)), T(224, 29, "B", stage >= 3 ? "hot" : ""), T(224, 89, "not B"), T(224, 139, "B", stage >= 3 ? "hot" : ""), T(224, 199, "not B"));
  if (stage >= 3) kids.push(T(250, 29, `= ${res.jA}`, "hot"), T(250, 139, `= ${res.jnA}`, "hot"));
  const tree = h("svg", { viewBox: `0 0 ${tw + 60} ${th}`, class: "mx-plot mx-tree", role: "img", "aria-label": "Probability tree for A then B" }, kids);
  const formula = stage >= 4 ? h("p", { class: "mono mx-formula" }, `P(B) = ${res.jA} + ${res.jnA} = ${res.pB}`, stage >= 5 ? h("br") : null, stage >= 5 ? `P(A | B) = ${res.jA} / ${res.pB} = ${res.posterior} ≈ ${fmt(res.posterior.toNumber())}` : null) : null;
  return h("div", { class: "mx-row" }, h("figure", { class: "mx-figure" }, tree, h("figcaption", { class: "muted small" }, "Multiply along branches.")), h("figure", { class: "mx-figure" }, sq, h("figcaption", { class: "muted small" }, "Width P(A); shaded = B. P(A | B) is the dark share of all shading.")), formula);
}

// --- Bars and curves ---------------------------------------------------------------------

function bars(xs, ps, { hi = [], comp = [], mean = null }) {
  const x0 = Math.min(...xs) - 0.8, x1 = Math.max(...xs) + 0.8, top = Math.max(...ps) * 1.15 || 1;
  const P = plotFrame({ x0, x1, y0: 0, y1: top, W: 560, H: 260 });
  const w = Math.max(4, Math.min(40, (P.sx(1) - P.sx(0)) * 0.7));
  const kids = xs.map((x, i) => h("rect", { x: P.sx(x) - w / 2, y: P.sy(ps[i]), width: w, height: Math.max(0, P.sy(0) - P.sy(ps[i])), class: `mx-bar${hi.includes(x) ? " hot" : comp.includes(x) ? " comp" : ""}` }, h("title", null, `P(X = ${x}) = ${fmt(ps[i], 5)}`)));
  if (mean !== null) kids.push(h("line", { x1: P.sx(mean), x2: P.sx(mean), y1: P.sy(0), y2: P.sy(top), class: "mx-mean" }), h("text", { x: P.sx(mean) + 4, y: P.sy(top) + 12, class: "mx-label" }, `E[X] = ${fmt(mean)}`));
  return P.svg(kids, "Probability mass function");
}

function curve(D, params, area, mean) {
  const [x0, x1] = D.range(params);
  let top = 0;
  for (let i = 0; i <= 200; i++) top = Math.max(top, D.pdf(params, x0 + ((x1 - x0) * i) / 200));
  const P = plotFrame({ x0, x1, y0: 0, y1: top * 1.15, W: 560, H: 260 });
  const kids = [];
  if (area) {
    const lo = Math.max(x0, area[0] === -Infinity ? x0 : area[0]), hi = Math.min(x1, area[1] === Infinity ? x1 : area[1]);
    if (hi > lo) {
      let d = `M${P.sx(lo)},${P.sy(0)}`;
      for (let i = 0; i <= 120; i++) { const x = lo + ((hi - lo) * i) / 120; d += `L${P.sx(x).toFixed(1)},${P.sy(D.pdf(params, x)).toFixed(1)}`; }
      d += `L${P.sx(hi)},${P.sy(0)}Z`;
      kids.push(h("path", { d, class: "mx-shade" }));
    }
  }
  kids.push(P.curve((x) => D.pdf(params, x), "mx-curve", 400));
  kids.push(h("line", { x1: P.sx(mean), x2: P.sx(mean), y1: P.sy(0), y2: P.sy(top * 1.15), class: "mx-mean" }));
  return P.svg(kids, "Probability density with the shaded area");
}

// --- The view ------------------------------------------------------------------------------

export function render(root) {
  const p = readParams();
  const g = (k, d) => p.get(k) ?? d;
  const state = {
    mode: MODES[p.get("mode")] ? p.get("mode") : "bayes",
    exp: EXPERIMENTS[g("exp")] ? g("exp") : "dice", a: g("a", "sum"), ka: Number(g("ka", 7)), b: g("b", "first"), kb: Number(g("kb", 3)),
    prior: g("prior", "0.01"), hit: g("hit", "0.9"), fa: g("fa", "0.09"),
    xs: g("xs", "0,1,2,3"), ps: g("ps", "1/8,3/8,3/8,1/8"),
    dist: DISTS[g("dist")] ? g("dist") : "binomial", q: QUERIES[g("q")] ? g("q") : "le", x: g("x", "3"), y: g("y", "5"),
    params: {},
  };
  for (const [id, D] of Object.entries(DISTS)) state.params[id] = Object.fromEntries(D.params.map(([k, , d]) => [k, d]));
  for (const [k] of DISTS[state.dist].params) if (p.has(k) && state.mode === "dist") state.params[state.dist][k] = Number(p.get(k));
  if (!EVENTS[state.exp][state.a]) { state.a = Object.keys(EVENTS[state.exp])[0]; state.ka = EVENTS[state.exp][state.a].k?.[2] ?? 0; }
  if (!EVENTS[state.exp][state.b]) { state.b = Object.keys(EVENTS[state.exp])[3]; state.kb = EVENTS[state.exp][state.b].k?.[2] ?? 0; }
  let sim = null;

  const head = page({
    subject: "Engineering maths",
    title: "Probability",
    lede: "Count outcomes on a grid or a tree, update beliefs with Bayes' theorem, and watch distributions add up their bars or fill their area.",
    theory: h("div", null,
      h("p", null, "With equally likely outcomes, ", h("b", null, "P(A) = |A| / |S|"), ". ", h("b", null, "Conditional probability"), " P(A | B) = P(A ∩ B) / P(B) shrinks the sample space to B. A and B are ", h("b", null, "independent"), " when P(A ∩ B) = P(A)·P(B): knowing one tells you nothing about the other. (Mutually exclusive events with non-zero probabilities are never independent.)"),
      h("p", null, h("b", null, "Bayes' theorem"), ": P(A | B) = P(B | A)·P(A) / P(B), with P(B) = P(B | A)P(A) + P(B | not A)P(not A) by the ", h("b", null, "law of total probability"), "."),
      h("p", null, "For a random variable, ", h("b", null, "E[X] = Σ x·p(x)"), " and ", h("b", null, "Var(X) = E[X²] − (E[X])²"), ". E[aX + b] = aE[X] + b and Var(aX + b) = a²Var(X)."),
      h("ul", null,
        h("li", null, h("b", null, "Binomial(n, p)"), ": successes in n independent trials. Mean np, variance np(1 − p)."),
        h("li", null, h("b", null, "Poisson(λ)"), ": counts of rare events at rate λ. Mean = variance = λ. It approximates Binomial when n is large and p small, with λ = np."),
        h("li", null, h("b", null, "Geometric(p)"), ": trials until the first success. Mean 1/p. It's memoryless."),
        h("li", null, h("b", null, "Uniform(a, b)"), ": flat density 1/(b − a). Mean (a + b)/2, variance (b − a)²/12."),
        h("li", null, h("b", null, "Exponential(λ)"), ": waiting time between Poisson events. P(X > t) = e^(−λt), mean 1/λ, memoryless."),
        h("li", null, h("b", null, "Normal(μ, σ)"), ": standardise with z = (x − μ)/σ. About 68%, 95% and 99.7% lies within 1, 2 and 3 σ."))),
    conventions: [
      "Bayes and sample-space results are exact fractions; decimals you type are read exactly (0.09 = 9/100).",
      "Geometric X counts trials up to and including the first success (k = 1, 2, …).",
      "Exponential uses the rate λ; the normal uses μ and σ (not σ²).",
      "Φ(z) is computed as ½ + ∫₀ᶻ φ(t) dt with Simpson's rule (2,000 strips), not from a printed table, so it agrees with tables to 4 places.",
      "For P(X ≥ a) on a discrete distribution, the complement 1 − P(X ≤ a − 1) is used when it needs fewer terms.",
    ],
  });

  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; drawInputs(); update(); } }, Object.entries(MODES).map(([id, n]) => h("option", { value: id, selected: id === state.mode }, n)));
  const inputs = h("div"), msg = h("div"), out = h("div", { class: "output" });
  const field = (key, label, obj = state, width = "short") => h("label", { class: "inline" }, `${label} `, h("input", { type: "text", class: width, value: obj[key], "aria-label": label, oninput: (e) => { obj[key] = e.target.value; update(); } }));

  function eventPicker(which) {
    const ev = EVENTS[state.exp];
    const kKey = which === "a" ? "ka" : "kb";
    const kIn = h("input", { type: "number", value: state[kKey], "aria-label": `Event ${which.toUpperCase()} value`, oninput: (e) => { state[kKey] = Number(e.target.value); update(); } });
    const sel = h("select", { "aria-label": `Event ${which.toUpperCase()}`, onchange: (e) => { state[which] = e.target.value; const k = ev[state[which]].k; if (k) { state[kKey] = k[2]; kIn.value = k[2]; } kIn.hidden = !k; update(); } },
      Object.entries(ev).map(([id, e]) => h("option", { value: id, selected: id === state[which] }, e.label("k"))));
    kIn.hidden = !ev[state[which]].k;
    return h("label", { class: "inline" }, `${which.toUpperCase()}: `, sel, kIn);
  }

  function drawInputs() {
    if (state.mode === "space") {
      const expSel = h("select", { "aria-label": "Experiment", onchange: (e) => { state.exp = e.target.value; const ids = Object.keys(EVENTS[state.exp]); state.a = ids[0]; state.b = ids[2]; state.ka = EVENTS[state.exp][state.a].k?.[2] ?? 0; state.kb = EVENTS[state.exp][state.b].k?.[2] ?? 0; drawInputs(); update(); } },
        Object.entries(EXPERIMENTS).map(([id, x]) => h("option", { value: id, selected: id === state.exp }, x.name)));
      inputs.replaceChildren(h("div", { class: "row" }, expSel, eventPicker("a"), eventPicker("b")));
    } else if (state.mode === "bayes") {
      inputs.replaceChildren(h("div", { class: "row" }, field("prior", "P(A)"), field("hit", "P(B | A)"), field("fa", "P(B | not A)")),
        h("p", { class: "muted small" }, "Think A = has the disease, B = tests positive. Decimals or fractions."));
    } else if (state.mode === "rv") {
      inputs.replaceChildren(h("div", { class: "row" }, field("xs", "values x", state, "wide"), field("ps", "P(X = x)", state, "wide")));
    } else {
      const D = DISTS[state.dist];
      const distSel = h("select", { "aria-label": "Distribution", onchange: (e) => { state.dist = e.target.value; if (!DISTS[state.dist].discrete && state.q === "eq") state.q = "le"; drawInputs(); update(); } }, Object.entries(DISTS).map(([id, d]) => h("option", { value: id, selected: id === state.dist }, d.name)));
      const qSel = h("select", { "aria-label": "Probability to find", onchange: (e) => { state.q = e.target.value; drawInputs(); update(); } }, Object.entries(QUERIES).map(([id, t]) => h("option", { value: id, selected: id === state.q }, t)));
      inputs.replaceChildren(h("div", { class: "row" }, distSel, ...D.params.map(([k, label]) => field(k, label, state.params[state.dist]))),
        h("div", { class: "row" }, qSel, field("x", "a"), state.q === "between" ? field("y", "b") : null));
    }
  }

  const num = (t) => Fraction.parse(String(t)).toNumber();
  function update() {
    sim?.player.destroy(); sim = null;
    let res, draw, code, card, url;
    try {
      if (state.mode === "space") {
        res = sampleSpace(state.exp, state.a, state.ka, state.b, state.kb);
        code = SPACE_CODE;
        draw = (s) => (state.exp === "dice" ? diceGrid(res, s.show) : coinTree(res, s.show));
        url = { mode: "space", exp: state.exp, a: state.a, ka: state.ka, b: state.b, kb: state.kb };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat("P(A)", String(res.pA)), stat("P(B)", String(res.pB)), stat("P(A ∩ B)", String(res.pAB)), stat("P(A ∪ B)", String(res.pAuB)), stat("P(A | B)", res.pAgB ? String(res.pAgB) : "undefined"), stat("Independent?", res.independent ? "Yes" : "No")),
          h("p", { class: "muted small" }, `A: ${res.labels[0]}. B: ${res.labels[1]}.`));
      } else if (state.mode === "bayes") {
        res = bayes(state.prior, state.hit, state.fa);
        code = BAYES_CODE;
        draw = (s) => bayesPicture(res, s.stage);
        url = { mode: "bayes", prior: state.prior, hit: state.hit, fa: state.fa };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat("P(B)", `${res.pB}`), stat("P(A | B)", `${res.posterior}`), stat("as a percentage", `${pct(res.posterior)}%`), stat("Prior P(A)", `${pct(res.pA)}%`)),
          h("p", { class: "muted small" }, `Out of 10,000 people: ${fmt(res.pA.toNumber() * 10000, 1)} have A, and ${fmt(res.jA.toNumber() * 10000, 1)} of them show B. Of the ${fmt(res.pnA.toNumber() * 10000, 1)} without A, ${fmt(res.jnA.toNumber() * 10000, 1)} show B anyway. So of the ${fmt(res.pB.toNumber() * 10000, 1)} who show B, only ${fmt(res.jA.toNumber() * 10000, 1)} have A.`));
      } else if (state.mode === "rv") {
        const xs = state.xs.split(/[,\s]+/).filter(Boolean), ps = state.ps.split(/[,\s]+/).filter(Boolean);
        res = randomVariable(xs, ps);
        code = RV_CODE;
        const xn = res.xs.map((x) => x.toNumber()), pn = res.ps.map((q) => q.toNumber());
        draw = (s) => bars(xn, pn, { hi: xn.slice(0, s.upto + 1), mean: s.done ? res.mean.toNumber() : null });
        url = { mode: "rv", xs: state.xs, ps: state.ps };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat("E[X]", String(res.mean)), stat("E[X²]", String(res.ex2)), stat("Var(X)", String(res.variance)), stat("SD", fmt(res.sd))));
      } else {
        const D = DISTS[state.dist];
        const params = Object.fromEntries(D.params.map(([k]) => [k, num(state.params[state.dist][k])]));
        res = distribution(state.dist, params, state.q, num(state.x), state.q === "between" ? num(state.y) : num(state.x));
        code = DIST_CODE;
        if (D.discrete) {
          const [lo, hi0] = D.support(params);
          const hi = Math.max(hi0, Math.ceil(num(state.x)), state.q === "between" ? Math.ceil(num(state.y)) : 0);
          const xs = Array.from({ length: Math.min(80, hi - lo + 1) }, (_, i) => lo + i), ps = xs.map((k) => D.pmf(params, k));
          draw = (s) => bars(xs, ps, { hi: s.shade ?? [], comp: s.comp ?? [], mean: s.done ? res.mean : null });
        } else draw = (s) => curve(D, params, s.area, res.mean);
        url = { mode: "dist", dist: state.dist, ...Object.fromEntries(D.params.map(([k]) => [k, state.params[state.dist][k]])), q: state.q, x: state.x, ...(state.q === "between" ? { y: state.y } : {}) };
        card = h("section", { class: "card" }, h("h2", null, "Result"), h("div", { class: "stats-row" },
          stat(res.label, fmt(res.answer)), stat("E[X]", fmt(res.mean)), stat("Var(X)", fmt(res.variance)), stat("SD", fmt(Math.sqrt(res.variance)))),
          h("p", { class: "muted small" }, `${D.formula}. ${D.meanText}.`));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    writeParams(url);
    sim = simulation(res.steps, code, draw);
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, MODES[state.mode]), sim.el), card);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel,
        exampleSelect(EXAMPLES, (ex) => {
          state.mode = ex.mode; modeSel.value = ex.mode;
          if (ex.mode === "bayes") Object.assign(state, { prior: ex.prior, hit: ex.hit, fa: ex.fa });
          if (ex.mode === "space") Object.assign(state, { exp: ex.exp, a: ex.a, ka: ex.ka, b: ex.b, kb: ex.kb });
          if (ex.mode === "rv") Object.assign(state, { xs: ex.xs, ps: ex.ps });
          if (ex.mode === "dist") { state.dist = ex.dist; state.q = ex.q; state.x = String(ex.a); state.y = String(ex.b ?? ex.a); for (const [k] of DISTS[ex.dist].params) if (ex[k] !== undefined) state.params[ex.dist][k] = ex[k]; }
          drawInputs(); update();
        }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      inputs, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const newQuestion = () => practiceCard(practice, {
    intro: "Fresh questions in the GATE style, worked out by the same engine. Give probabilities as decimals (two places) or fractions.",
    kinds: [["any", "Any type"], ["bayes", "Bayes' theorem"], ["conditional", "Conditional probability (dice)"], ["expectation", "Expectation and variance"], ["binomial", "Binomial"], ["poisson", "Poisson"], ["continuous", "Exponential, normal, uniform, geometric"]],
    make: (r, kind) => makeQuestion(r, kind),
  });

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => sim?.player.destroy();
}
