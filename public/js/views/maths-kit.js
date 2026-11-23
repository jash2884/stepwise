// Pieces shared by the engineering maths views: SVG plotting, matrix
// rendering, the step simulation frame and a GATE-format practice card.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { Fraction } from "../engines/fraction.js";
import { h, notice, rng, stepper } from "../ui.js";

// --- Plotting --------------------------------------------------------------------------

const niceStep = (span, target = 6) => {
  const raw = span / target, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};
const tickText = (v) => (Math.abs(v) < 1e-9 ? "0" : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(0) : String(Number(v.toPrecision(4)))).replace("-", "−");

let clips = 0;
// A plot frame mapping data to SVG coordinates, with axes and gridlines.
export function plotFrame({ x0, x1, y0, y1, W = 560, H = 300, pad = 34, label = "" }) {
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const sx = (x) => pad + ((x - x0) / (x1 - x0)) * (W - pad - 10);
  const sy = (y) => H - pad + 10 - ((y - y0) / (y1 - y0)) * (H - pad - 10);
  const els = [];
  const xs = niceStep(x1 - x0), ys = niceStep(y1 - y0);
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) els.push(h("line", { x1: sx(v), x2: sx(v), y1: sy(y0), y2: sy(y1), class: "mx-grid" }), h("text", { x: sx(v), y: H - 4, "text-anchor": "middle", class: "mx-tick" }, tickText(v)));
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) els.push(h("line", { x1: sx(x0), x2: sx(x1), y1: sy(v), y2: sy(v), class: "mx-grid" }), h("text", { x: pad - 4, y: sy(v) + 4, "text-anchor": "end", class: "mx-tick" }, tickText(v)));
  if (y0 <= 0 && y1 >= 0) els.push(h("line", { x1: sx(x0), x2: sx(x1), y1: sy(0), y2: sy(0), class: "mx-axis" }));
  if (x0 <= 0 && x1 >= 0) els.push(h("line", { x1: sx(0), x2: sx(0), y1: sy(y0), y2: sy(y1), class: "mx-axis" }));
  // A path for y = f(x), broken where f is undefined or jumps off the chart.
  const curve = (f, cls = "mx-curve", n = 400, from = x0, to = x1) => {
    let d = "", pen = false, prev = null;
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n, y = f(x);
      const ok = Number.isFinite(y) && y > y0 - (y1 - y0) * 2 && y < y1 + (y1 - y0) * 2;
      if (ok && prev !== null && Math.abs(y - prev) > (y1 - y0) * 1.5) pen = false;
      if (ok) { const cy = Math.max(-H, Math.min(2 * H, sy(y))); d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${cy.toFixed(1)}`; pen = true; prev = y; } else { pen = false; prev = null; }
    }
    return h("path", { d, class: cls });
  };
  const id = `mx-clip-${++clips}`;
  const svg = (kids, aria) => h("svg", { viewBox: `0 0 ${W} ${H}`, class: "mx-plot", role: "img", "aria-label": aria ?? label },
    h("defs", null, h("clipPath", { id }, h("rect", { x: pad, y: 0, width: W - pad, height: H - pad + 10 }))),
    els, h("g", { "clip-path": `url(#${id})` }, kids));
  return { sx, sy, curve, svg, W, H, pad };
}

// Sensible y-range for f on [x0, x1]: robust to poles by trimming extremes.
export function yRange(f, x0, x1, include = []) {
  const vs = [];
  for (let i = 0; i <= 300; i++) { const y = f(x0 + ((x1 - x0) * i) / 300); if (Number.isFinite(y)) vs.push(y); }
  vs.push(...include);
  if (!vs.length) return [-1, 1];
  vs.sort((a, b) => a - b);
  let lo = vs[Math.floor(vs.length * 0.03)], hi = vs[Math.ceil(vs.length * 0.97) - 1];
  for (const v of include) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const m = (hi - lo || 1) * 0.12;
  return [lo - m, hi + m];
}

// --- Matrices --------------------------------------------------------------------------

// A matrix in brackets. Options: aug (number of augmented columns, drawn after
// a bar), pivot [r, c], rows (highlighted rows), sym (symbolic text instead
// of values), diag (highlight the diagonal), pivotCells.
export function matrixView(M, { aug = 0, pivot = null, rows = [], sym = null, diag = false, pivotCells = [], label = null } = {}) {
  const cols = M[0].length, split = cols - aug;
  const piv = new Set(pivotCells.map(([r, c]) => `${r},${c}`));
  return h("div", { class: "mx-matrix-wrap" },
    label ? h("div", { class: "mx-op" }, label) : null,
    h("table", { class: "mx-matrix", "aria-label": `Matrix with ${M.length} rows` },
      h("tbody", null, M.map((row, i) => h("tr", { class: rows.includes(i) ? "hot" : null },
        row.map((x, j) => h("td", {
          class: [j === split && aug ? "aug" : "", pivot && pivot[0] === i && pivot[1] === j ? "pivot" : "", piv.has(`${i},${j}`) ? "pivot soft" : "", diag && i === j ? "diag" : "", pivot && j === pivot[1] && i !== pivot[0] && !(sym) ? "col" : ""].filter(Boolean).join(" ") || null,
        }, sym ? sym[i][j] : String(x))))))));
}

// --- Step simulation -------------------------------------------------------------------

// Stepper + note + (visual | code + variables). draw(step, i) returns the visual.
export function simulation(steps, code, draw, { interval = 1100, extra = null } = {}) {
  const cp = codePanel(code, { title: "Formulas and steps" }), vp = varsPanel();
  const stage = h("div", { class: "chart-wrap mx-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" });
  const player = stepper({ count: steps.length, interval, render: (i) => {
    const s = steps[i];
    stage.replaceChildren(draw(s, i));
    cp.show(s.line); vp.show(s.vars);
    note.textContent = s.note;
    note.className = `step-note${s.done ? " good" : ""}`;
  } });
  return { el: h("div", { class: "sim" }, player.el, note, traceLayout(stage, cp, vp, extra)), player };
}

// --- Answers ---------------------------------------------------------------------------

// Read a typed answer: 7, -2.5, 3/4, or ½-style text; null if unreadable.
export function readNumber(text) {
  const s = String(text).trim().replace(/,/g, "");
  if (!s) return null;
  try { return Fraction.parse(s).toNumber(); } catch { /* not a fraction */ }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function block(b) {
  if (typeof b === "string") return h("p", null, b);
  return h("div", { class: "table-wrap" }, h("table", { class: "parse mx-qtable" },
    b.table.head ? h("thead", null, h("tr", null, b.table.head.map((c) => h("th", { scope: "col" }, c)))) : null,
    h("tbody", null, b.table.rows.map((row) => h("tr", null, row.map((c) => h("td", null, c)))))));
}

// Practice with GATE-format questions from make(r, kind): one at a time,
// checked against the engine's answer, with the worked solution after.
export function practiceCard(holder, { kinds, make, intro }) {
  const sel = h("select", { "aria-label": "Question type" }, kinds.map(([id, label]) => h("option", { value: id }, label)));
  const body = h("div");
  let score = { right: 0, done: 0 };
  const tally = h("span", { class: "muted small" });
  const drawTally = () => { tally.textContent = score.done ? `${score.right} of ${score.done} right this session` : ""; };
  function next() {
    const r = rng(Math.floor(Math.random() * 1e9));
    const kind = sel.value === "any" ? null : sel.value;
    let q = null;
    for (let i = 0; i < 60 && !q; i++) q = make(r, kind);
    if (!q) { body.replaceChildren(notice("error", "Couldn't make a question; try again.")); return; }
    const feedback = h("div");
    let chosen = null;
    const input = q.type === "nat" ? h("input", { type: "text", inputmode: "decimal", class: "mx-answer", "aria-label": "Your answer", placeholder: "Your answer", onkeydown: (e) => { if (e.key === "Enter") check(); } }) : null;
    const opts = q.options ? h("div", { class: "mx-options", role: "radiogroup", "aria-label": "Options" }, q.options.map((o, i) => h("button", { type: "button", class: "btn ghost", role: "radio", "aria-checked": "false", onclick: (e) => {
      chosen = i;
      for (const b of opts.children) b.setAttribute("aria-checked", String(b === e.currentTarget));
    } }, `${"ABCD"[i]}. ${o}`))) : null;
    const checkBtn = h("button", { type: "button", class: "btn primary", onclick: check }, "Check");
    function check() {
      let ok;
      if (q.type === "nat") {
        const v = readNumber(input.value);
        if (v === null) { feedback.replaceChildren(notice("info", "Type a number (fractions like 3/4 are fine).")); return; }
        ok = Math.abs(v - q.answer) <= (q.tolerance ?? 0) + 1e-9;
        input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
      } else {
        if (chosen === null) { feedback.replaceChildren(notice("info", "Pick an option first.")); return; }
        ok = chosen === q.answer;
        [...opts.children].forEach((b, i) => { b.disabled = true; b.classList.toggle("right", i === q.answer); b.classList.toggle("wrong", i === chosen && !ok); });
      }
      checkBtn.disabled = true;
      score = { right: score.right + (ok ? 1 : 0), done: score.done + 1 };
      drawTally();
      const ans = q.type === "nat" ? String(q.answer).replace("-", "−") : `${"ABCD"[q.answer]}. ${q.options[q.answer]}`;
      feedback.replaceChildren(
        notice(ok ? "good" : "bad", ok ? "✓ Right." : `✗ Not quite: the answer is ${ans}${q.tolerance ? ` (±${q.tolerance} accepted)` : ""}.`),
        h("div", { class: "mx-solution" }, h("h3", null, "Worked solution"), q.solution.map(block)),
        h("div", { class: "row" }, h("a", { class: "btn ghost", href: q.replay }, "Step through it"), h("button", { type: "button", class: "btn primary", onclick: next }, "Next question")));
    }
    body.replaceChildren(h("div", { class: "mx-question" }, q.stem.map(block)), opts, input ? h("div", { class: "row" }, input, checkBtn) : h("div", { class: "row" }, checkBtn), feedback);
    input?.focus({ preventScroll: true });
  }
  holder.replaceChildren(h("section", { class: "card" },
    intro ? h("p", { class: "muted" }, intro) : null,
    h("div", { class: "row" }, sel, h("button", { type: "button", class: "btn ghost", onclick: next }, "New question"), tally),
    body));
  next();
}

export const series = (i) => `var(--series-${(i % 8) + 1})`;
