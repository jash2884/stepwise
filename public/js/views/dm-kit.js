// Pieces shared by the discrete-maths views: a step-by-step card (stepper,
// note, drawing, pseudocode and live variables), the Visualise / Practice
// shell, mode pickers and small tables.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, rng, stepper, tabs } from "../ui.js";

// steps: [{ line, vars, note, tone }]; draw(step, i) → element for the stage;
// side(step, i) → optional elements under it.
export function traceCard({ title, steps, code, draw, side, interval = 900, start = 0, after = null, label = "Step" }) {
  const cp = codePanel(code), vp = varsPanel();
  const stage = h("div", { class: "chart-wrap dm-stage" }), below = h("div", { class: "dm-below" });
  const note = h("p", { class: "step-note", "aria-live": "polite" });
  const player = stepper({
    count: steps.length, interval, label, start,
    render: (i) => {
      const st = steps[i];
      const next = draw(st, i);
      if (next instanceof SVGElement && stage.firstElementChild instanceof SVGElement) morph(stage, next);
      else stage.replaceChildren(next);
      below.replaceChildren(...[side?.(st, i)].flat().filter(Boolean));
      cp.show(st.line); vp.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.tone ? ` ${st.tone}` : ""}`;
    },
  });
  const el = h("section", { class: "card" }, title ? h("h2", null, title) : null, player.el, note,
    traceLayout(h("div", { class: "dm-visual" }, stage, below), cp, vp), after);
  return { el, destroy: () => player.destroy() };
}

// Visualise and Practice tabs. makeQuestion(r) returns a list of elements.
export function shell(root, head, visual, makeQuestion, { filters = null } = {}) {
  const practice = h("div", { class: "panel-body" });
  const newQuestion = () => {
    let body;
    try { body = makeQuestion(rng()); } catch (e) { body = [notice("error", e.message)]; }
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, filters, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  };
  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  return { newQuestion };
}

export function select(options, value, onChange, aria) {
  return h("select", { "aria-label": aria, onchange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([k, v]) => h("option", { value: k, selected: k === value }, typeof v === "string" ? v : v.name)));
}

export const linkButton = () => h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link");

export function numberInput(label, value, onChange, { min = 0, max = 99, step = 1, width = 72 } = {}) {
  return h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, step, value, style: `width:${width}px`, "aria-label": label, onchange: (e) => onChange(Number(e.target.value)) }));
}

export function textInput(label, value, onChange, { wide = true, placeholder = "" } = {}) {
  return h("label", { class: "stack" }, label, h("input", { type: "text", class: `mono${wide ? " wide" : ""}`, value, placeholder, spellcheck: "false", "aria-label": label,
    onchange: (e) => onChange(e.target.value), onkeydown: (e) => { if (e.key === "Enter") onChange(e.target.value); } }));
}

// A plain table: head is a list of headings, rows a list of cell lists.
// cls(r, c) gives a class for a cell.
export function table(head, rows, { cls = () => null, caption = null, rowCls = () => null } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse dm-table" },
    caption ? h("caption", null, caption) : null,
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((row, r) => h("tr", { class: rowCls(r) }, row.map((x, c) => (c === 0 ? h("th", { scope: "row", class: cls(r, c) }, x) : h("td", { class: cls(r, c) }, x))))))));
}

// A worked-solution toggle under a practice question.
export function reveal(label, build) {
  const box = h("div");
  const btn = h("button", { type: "button", class: "btn ghost", onclick: () => { box.replaceChildren(...[build()].flat()); btn.hidden = true; } }, label);
  return h("div", null, h("div", { class: "row" }, btn), box);
}

export const tf = (b) => (b ? "T" : "F");
export const yesNo = (b) => (b ? "yes" : "no");
