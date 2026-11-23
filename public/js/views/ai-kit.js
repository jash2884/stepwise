// Pieces shared by the AI engineering views: the step-through frame, inline
// SVG charts (bars, heatmap, scatter), matrices and tolerant number questions.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, notice, stepper } from "../ui.js";

export const num = (x, d = 2) => (x === -Infinity ? "−∞" : x === Infinity ? "∞" : Number.isInteger(x) ? String(x) : x.toFixed(d).replace(/^-/, "−"));
export const series = (i) => `var(--series-${(i % 8) + 1})`;
export const mix = (pct, colour = "var(--accent)") => `color-mix(in srgb, ${colour} ${Math.round(Math.max(0, Math.min(100, pct)))}%, var(--surface))`;

export function svg(w, hgt, label, kids, cls = "") {
  return h("svg", { viewBox: `0 0 ${w} ${hgt}`, class: `ai-svg ${cls}`, role: "img", "aria-label": label, preserveAspectRatio: "xMidYMid meet" }, kids);
}

// A stepper, the step note, the visual, and the pseudocode + variables beside it.
// draw(step, i) returns the visual for that step (or updates it in place).
export function traceSim({ steps, code, draw, label = "Step", interval = 1100, extra = null, start = 0 }) {
  const cp = codePanel(code), vars = varsPanel();
  const holder = h("div", { class: "ai-visual" });
  const note = h("p", { class: "step-note", "aria-live": "polite" });
  const player = stepper({
    count: steps.length, label, interval, start,
    render: (i) => {
      const s = steps[i];
      const out = draw(s, i);
      if (out) holder.replaceChildren(out);
      cp.show(s.line);
      vars.show(s.vars);
      note.textContent = s.note;
      note.className = `step-note${s.final ? " good" : ""}`;
    },
  });
  return { el: h("div", { class: "sim" }, player.el, note, traceLayout(holder, cp, vars, extra)), player };
}

// Horizontal bars: one row per label. kind "logit" draws around a zero line;
// kind "prob" from 0 to 1 (or to the largest value when scale = "fit").
export function bars({ labels, values, kind = "prob", removed = [], chosen = null, highlight = [], before = null, scale = "fit", caption = "" }) {
  const rowH = 26, labelW = 78, valueW = 58, W = 360, plotW = W - labelW - valueW - 8;
  const H = labels.length * rowH + 8;
  const finite = (xs) => xs.filter((x) => Number.isFinite(x));
  const all = finite([...values, ...(before ?? [])]);
  const lo = kind === "logit" ? Math.min(0, ...all) : 0;
  const hi = kind === "logit" ? Math.max(0.001, ...all) : scale === "fit" ? Math.max(0.001, ...all) : 1;
  const x = (v) => labelW + ((v - lo) / (hi - lo || 1)) * plotW;
  const out = new Set(removed), hot = new Set(highlight);
  const kids = [];
  if (kind === "logit") kids.push(h("line", { x1: x(0), x2: x(0), y1: 2, y2: H - 4, class: "ai-axis" }));
  labels.forEach((lab, i) => {
    const y = 4 + i * rowH, v = values[i];
    const gone = out.has(i) || v === -Infinity;
    const cls = `ai-bar${gone ? " gone" : ""}${i === chosen ? " chosen" : ""}${hot.has(i) ? " hot" : ""}`;
    kids.push(h("text", { x: labelW - 6, y: y + 16, "text-anchor": "end", class: `ai-lab${gone ? " gone" : ""}${i === chosen ? " chosen" : ""}` }, lab));
    if (before && Number.isFinite(before[i]) && before[i] !== v) {
      const a = x(Math.min(0, before[i])), b = x(Math.max(0, before[i]));
      kids.push(h("rect", { x: kind === "logit" ? a : labelW, y: y + 4, width: Math.max(1, kind === "logit" ? b - a : x(before[i]) - labelW), height: rowH - 8, class: "ai-ghost", rx: 3 }));
    }
    if (Number.isFinite(v)) {
      const a = kind === "logit" ? x(Math.min(0, v)) : labelW, b = kind === "logit" ? x(Math.max(0, v)) : x(v);
      kids.push(h("rect", { x: a, y: y + 4, width: Math.max(gone ? 0 : 1, b - a), height: rowH - 8, rx: 3, class: cls, style: `--c:${series(i)}` }));
    }
    kids.push(h("text", { x: W - 4, y: y + 16, "text-anchor": "end", class: `ai-val${gone ? " gone" : ""}` }, gone && kind === "prob" ? "cut" : kind === "prob" ? `${(v * 100).toFixed(1)}%` : num(v)));
  });
  return svg(W, H, caption || `${kind === "prob" ? "Probabilities" : "Scores"}: ${labels.map((l, i) => `${l} ${num(values[i])}`).join(", ")}`, kids, "ai-bars");
}

// A heatmap of a square-ish matrix: rows are queries, columns keys.
// Rows after `upto` are blank; `row` is outlined.
export function heatmap({ rows, cols, matrix, upto = rows.length - 1, row = -1, mask = null, digits = 2, caption = "Attention weights" }) {
  const cell = 44, left = 78, top = 70;
  const W = left + cols.length * cell + 4, H = top + rows.length * cell + 4;
  const kids = [];
  cols.forEach((c, j) => kids.push(h("text", { x: left + j * cell + cell / 2, y: top - 8, transform: `rotate(-40 ${left + j * cell + cell / 2} ${top - 8})`, class: "ai-lab" }, c)));
  rows.forEach((r, i) => {
    kids.push(h("text", { x: left - 8, y: top + i * cell + cell / 2 + 4, "text-anchor": "end", class: `ai-lab${i === row ? " chosen" : ""}` }, r));
    cols.forEach((_, j) => {
      const v = matrix[i]?.[j];
      const shown = i <= upto && v !== undefined;
      const masked = mask?.[i]?.[j];
      kids.push(h("rect", { x: left + j * cell + 1, y: top + i * cell + 1, width: cell - 2, height: cell - 2, rx: 4, class: `ai-cell${masked ? " masked" : ""}`, style: shown && !masked && Number.isFinite(v) ? `fill:${mix(v * 100)}` : "" }));
      if (shown) kids.push(h("text", { x: left + j * cell + cell / 2, y: top + i * cell + cell / 2 + 4, "text-anchor": "middle", class: `ai-cell-t${v > 0.55 ? " on" : ""}` }, masked ? "0" : num(v, digits)));
    });
  });
  if (row >= 0) kids.push(h("rect", { x: left - 1, y: top + row * cell, width: cols.length * cell + 2, height: cell, rx: 6, class: "ai-row-ring" }));
  return svg(W, H, caption, kids, "ai-heat");
}

// A small numeric matrix as a table.
export function matrix(M, { rows, cols, hot = -1, digits = 2, title = null } = {}) {
  return h("div", { class: "ai-matrix" }, title ? h("div", { class: "panel-title" }, title) : null,
    h("div", { class: "table-wrap" }, h("table", null,
      cols ? h("thead", null, h("tr", null, h("th"), cols.map((c) => h("th", { scope: "col" }, c)))) : null,
      h("tbody", null, M.map((r, i) => h("tr", { class: i === hot ? "hot" : null }, h("th", { scope: "row" }, rows?.[i] ?? i + 1), r.map((x) => h("td", null, typeof x === "number" && !Number.isNaN(x) ? num(x, digits) : ""))))))));
}

// A numeric answer accepted within a tolerance.
export function approxQuestion(answer, explain, { tol = 0.01, aria = "Your answer", unit = "" } = {}) {
  const input = h("input", { type: "number", step: "any", "aria-label": aria, class: "answer", style: "max-width:150px" });
  const feedback = h("div");
  const check = () => {
    const v = Number(input.value);
    const ok = input.value !== "" && Math.abs(v - answer) <= tol + 1e-12;
    input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
    feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ Not quite: it's ${Number.isInteger(answer) ? answer : answer.toFixed(Math.max(2, -Math.floor(Math.log10(tol))))}${unit}.`} ${explain ?? ""}`));
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  return h("div", null, h("div", { class: "row" }, input, unit ? h("span", { class: "muted" }, unit.trim()) : null, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), feedback);
}

// A practice card with a "New question" button.
export function practiceCard(practice, make) {
  const q = make();
  practice.replaceChildren(h("section", { class: "card" },
    h("div", { class: "row spread" }, h("span", { class: "eyebrow" }, q.kind ?? "Question"), h("button", { type: "button", class: "btn ghost", onclick: () => practiceCard(practice, make) }, "New question")),
    h("h2", null, q.title), q.body ?? null, q.answer));
}

// Token chips: one coloured chip per token.
export function tokenChips(tokens, { show = (t) => t, unknown = new Set(), key = "" } = {}) {
  return h("div", { class: "ai-tokens" }, tokens.map((t, i) => h("span", { class: `ai-tok${unknown.has(t) ? " unk" : ""}`, style: `--c:${series(i)}`, "data-k": `${key}${i}` }, show(t).replaceAll(" ", "▁"))));
}
