// Shared question pieces for the learning pages (review, mistakes, diagnostic,
// mocks): the stem, the answer inputs, the solution, and a practice card that
// checks one answer. Questions come from gate-questions.js.
import { check, topicOf } from "../gate-questions.js";
import { h } from "../ui.js";

export const LETTERS = "ABCD";
export const TYPE_NAME = { mcq: "MCQ · one correct option", msq: "MSQ · one or more correct options", nat: "NAT · type the number" };

export function block(b) {
  if (typeof b === "string") return h("p", null, b);
  return h("div", { class: "table-wrap" }, h("table", { class: "gate-table" },
    h("thead", null, h("tr", null, b.table.head.map((c) => h("th", null, c)))),
    h("tbody", null, b.table.rows.map((row) => h("tr", null, row.map((c) => h("td", null, c)))))));
}

export function answerText(q, r = q.answer) {
  if (r == null || (Array.isArray(r) && !r.length)) return "not answered";
  if (q.type === "nat") return String(r);
  if (q.type === "mcq") return LETTERS[r];
  return [...r].sort().map((i) => LETTERS[i]).join(", ");
}

export const topicTitle = (slug) => topicOf(slug)?.title ?? slug;

export function metaRow(q, extra = null) {
  return h("div", { class: "row spread gate-meta" },
    h("span", null, h("a", { href: `/${q.topic}` }, topicTitle(q.topic)), ` · ${TYPE_NAME[q.type]}`, extra),
    h("span", { class: "badge" }, `${q.marks} mark${q.marks > 1 ? "s" : ""}`));
}

export const stem = (q) => h("div", { class: "gate-stem" }, q.stem.map(block));

// The options or number box. get() returns null when nothing is chosen.
export function inputs(q, { initial = null, onChange = () => {} } = {}) {
  let chosen = q.type === "msq" ? new Set(initial ?? []) : q.type === "mcq" ? initial : null;
  const sync = () => opts?.querySelectorAll(".gate-opt").forEach((b) => b.setAttribute("aria-checked", String(q.type === "mcq" ? Number(b.dataset.i) === chosen : chosen.has(Number(b.dataset.i)))));
  const opts = q.options ? h("div", { class: "gate-options", role: q.type === "mcq" ? "radiogroup" : "group", "aria-label": "Options" }, q.options.map((o, i) =>
    h("button", { type: "button", class: "gate-opt", "data-i": i, role: q.type === "mcq" ? "radio" : "checkbox", "aria-checked": "false", onclick: (e) => {
      if (q.type === "mcq") chosen = i; else if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
      sync();
      e.currentTarget.focus();
      onChange(get());
    } }, h("b", null, LETTERS[i]), h("span", null, o)))) : null;
  const nat = q.type === "nat" ? h("input", { type: "text", inputmode: "decimal", class: "gate-nat", "aria-label": "Your answer", autocomplete: "off", placeholder: "Your answer", value: initial ?? "", oninput: () => onChange(get()) }) : null;
  function get() {
    if (q.type === "nat") { const v = nat.value.trim().replace(/,/g, ""); return v === "" || !Number.isFinite(Number(v)) ? null : Number(v); }
    if (q.type === "mcq") return chosen ?? null;
    return chosen.size ? [...chosen].sort() : null;
  }
  function clear() {
    if (nat) nat.value = "";
    chosen = q.type === "msq" ? new Set() : null;
    sync();
    onChange(null);
  }
  function lock(mark = true) {
    if (nat) nat.readOnly = true;
    opts?.querySelectorAll(".gate-opt").forEach((b) => {
      const i = Number(b.dataset.i), right = q.type === "mcq" ? i === q.answer : q.answer.includes(i);
      b.disabled = true;
      if (mark) b.classList.add(right ? "right" : b.getAttribute("aria-checked") === "true" ? "wrong" : "plain");
    });
  }
  sync();
  return { el: h("div", null, opts, nat), get, clear, lock, nat };
}

export function solution(q, { open = true } = {}) {
  const body = [q.solution.map(block), h("p", null, h("a", { class: "btn ghost small", href: q.replay }, "Watch it step by step"))];
  return open
    ? h("div", { class: "gate-solution" }, h("h2", null, "Solution"), body)
    : h("details", { class: "gate-solution lp-sol" }, h("summary", null, "Solution"), body);
}

// One question to answer and check. onResult({ correct, score, ms, response })
// runs once, when the answer is checked, and may return a node to show under
// the verdict (the mistake doctor). actions: extra buttons shown after.
export function practiceCard(q, { onResult, actions = () => [], heading = null } = {}) {
  const started = Date.now();
  const result = h("div");
  const submit = h("button", { type: "button", class: "btn primary", disabled: true, onclick: mark }, "Check answer");
  const box = inputs(q, { onChange: (r) => { submit.disabled = r == null; } });
  if (box.nat) box.nat.addEventListener("keydown", (e) => { if (e.key === "Enter" && !submit.disabled) { e.preventDefault(); mark(); } });
  const card = h("section", { class: "card gate-q lp-q", "aria-live": "polite" }, heading, metaRow(q), stem(q), box.el, h("div", { class: "row" }, submit), result);

  function mark() {
    const response = box.get();
    if (response == null) return;
    const { correct, score } = check(q, response);
    submit.remove();
    box.lock();
    const extra = onResult?.({ correct, score, ms: Date.now() - started, response });
    result.replaceChildren(...[
      h("p", { class: `notice ${correct ? "good" : "bad"}`, tabindex: "-1" },
        correct ? `Correct: +${q.marks}` : `Not quite. The answer is ${answerText(q)}.${score < 0 ? ` GATE marking: ${score}.` : ""}`),
      extra instanceof Node ? extra : null,
      solution(q, { open: !correct }),
      h("div", { class: "row" }, actions({ correct, score })),
    ].filter(Boolean));
    result.firstChild.focus({ preventScroll: true });
  }
  return card;
}
