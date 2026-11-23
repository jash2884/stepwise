// Pieces shared by the computer organisation views: bit strips, number
// questions with a tolerance, labelled inputs and the step-through frame.
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, notice, stepper } from "../ui.js";

// A row of bits split into coloured fields: groups = [{ size, cls, label }].
export function bitStrip(bits, groups, { lit = null, onBit = null, small = false } = {}) {
  let i = 0;
  const parts = groups.map((g) => { const p = { g, start: i, bits: bits.slice(i, i + g.size) }; i += g.size; return p; });
  return h("div", { class: `coa-bits${small ? " small" : ""}`, role: onBit ? "group" : "img", "aria-label": parts.map((p) => `${p.g.label}: ${p.bits || "none"}`).join(", ") },
    parts.filter((p) => p.g.size > 0).map(({ g, start, bits: part }) => h("div", { class: `coa-field f-${g.cls}${lit && !lit.includes(g.cls) ? " dim" : ""}` },
      h("div", { class: "coa-field-bits" }, [...part].map((b, k) => onBit
        ? h("button", { type: "button", class: "coa-bit", "aria-label": `Bit ${bits.length - 1 - (start + k)} is ${b}. Flip it`, onclick: () => onBit(start + k) }, b)
        : h("span", { class: "coa-bit" }, b))),
      h("div", { class: "coa-field-label" }, g.label))));
}

// Number answer, right within a tolerance.
export function natQuestion(answer, explain, { tol = 0, aria = "Your answer", step = "any" } = {}) {
  const input = h("input", { type: "number", step, "aria-label": aria, style: "max-width:160px" });
  const feedback = h("div");
  const check = () => {
    const v = Number(input.value);
    const ok = input.value !== "" && Math.abs(v - answer) <= tol + 1e-9;
    input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
    feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ Not quite: it's ${answer}.`} ${explain ?? ""}`));
  };
  return h("div", null, h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), feedback);
}

// Text answer (hex and the like), compared after a normalising function.
export function textQuestion(answer, explain, normal = (s) => s.trim().toUpperCase(), aria = "Your answer") {
  const input = h("input", { type: "text", "aria-label": aria, class: "short", autocomplete: "off", spellcheck: "false" });
  const feedback = h("div");
  const check = () => {
    const ok = normal(input.value) === normal(answer);
    input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
    feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ Not quite: it's ${answer}.`} ${explain ?? ""}`));
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  return h("div", null, h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), feedback);
}

// A labelled number input that calls back with a number.
export function numIn(label, value, onChange, { min = 0, max = null, step = "any", width = null } = {}) {
  return h("label", { class: "inline" }, label, h("input", {
    type: "number", value, min, max, step, style: width ? `width:${width}px` : null,
    onchange: (e) => onChange(Number(e.target.value)),
  }));
}

export function select(label, options, value, onChange) {
  const sel = h("select", { "aria-label": label, onchange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([k, v]) => h("option", { value: k, selected: k === value }, v)));
  return label ? h("label", { class: "inline" }, label, sel) : sel;
}

// Stepper + note + (visual | code and variables). draw(step, i) returns the visual.
export function stepFrame(steps, code, draw, { label = "Step", interval = 1000, after = null } = {}) {
  const cp = codePanel(code), vp = varsPanel();
  const holder = h("div", { class: "coa-visual" });
  const note = h("p", { class: "step-note", "aria-live": "polite" });
  const below = h("div");
  const player = stepper({
    count: steps.length, label, interval, render: (i) => {
      const s = steps[i];
      holder.replaceChildren(draw(s, i));
      cp.show(s.line);
      vp.show(s.vars);
      note.textContent = s.note;
      note.className = `step-note${i === steps.length - 1 ? " good" : s.bad ? " bad" : ""}`;
      if (after) below.replaceChildren(after(s, i) ?? "");
    },
  });
  return { el: h("div", null, player.el, note, traceLayout(holder, cp, vp), below), player };
}

export const pct = (x, d = 2) => `${Math.round(x * 100 * 10 ** d) / 10 ** d}%`;
export const r4 = (x) => Math.round(x * 1e4) / 1e4;
