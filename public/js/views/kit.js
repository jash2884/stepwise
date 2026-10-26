// Pieces shared by the theory-of-computation and compiler views.
import { EPS } from "../engines/automata.js";
import { h, notice, tabs } from "../ui.js";

export function exampleSelect(examples, pick, label = "Load an example…") {
  return h("select", { "aria-label": "Example", onchange: (e) => { const k = e.target.value; if (!k) return; e.target.value = ""; pick(examples[k], k); } },
    h("option", { value: "" }, label), Object.entries(examples).map(([k, v]) => h("option", { value: k }, v.name)));
}

export const stat = (label, value, mono = false) => h("div", { class: "stat" }, h("span", null, label), h("b", { class: mono ? "mono" : null }, value));

// Visualise / Practice tabs, with the practice question made on first open.
export function mountTabs(root, head, visual, practice, newQuestion, labels = ["Visualise", "Practice"]) {
  const panels = h("div");
  const tab = tabs([["visual", labels[0]], ["practice", labels[1]]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
}

// A multiple-choice question: one click answers it and shows the working.
export function choice(options, explain) {
  const feedback = h("div");
  const row = h("div", { class: "row" }, options.map((o) => h("button", {
    type: "button", class: "btn ghost", onclick: (e) => {
      for (const b of row.children) b.disabled = true;
      e.currentTarget.classList.add(o.correct ? "right" : "wrong");
      const right = options.find((x) => x.correct);
      feedback.replaceChildren(notice(o.correct ? "good" : "bad", `${o.correct ? "✓ Right." : `✗ Not quite: the answer is ${right.label}.`} ${explain ?? ""}`));
    },
  }, o.label)));
  return h("div", null, row, feedback);
}

export function numberQuestion(answer, explain, aria = "Your answer") {
  const input = h("input", { type: "number", "aria-label": aria, style: "max-width:140px" });
  const feedback = h("div");
  const check = () => {
    const ok = input.value !== "" && Number(input.value) === answer;
    input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
    feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ Not quite: it's ${answer}.`} ${explain ?? ""}`));
  };
  return h("div", null, h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), feedback);
}

// Automaton → diagram edges.
export function faEdges(fa) {
  const edges = [];
  for (const q of fa.states) for (const a of [...fa.alphabet, EPS]) for (const t of fa.next(q, a)) edges.push({ from: q, to: t, label: a });
  return edges;
}

// The transition table, one row per state, sets of targets for NFAs.
export function deltaTable(fa, { active = [], hotSym = null, extra = null } = {}) {
  const syms = [...fa.alphabet, ...(fa.kind === "ε-NFA" ? [EPS] : [])];
  const act = new Set(active);
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "State"), syms.map((a) => h("th", { scope: "col" }, a)), extra ? h("th", { scope: "col" }, extra.head) : null)),
    h("tbody", null, fa.states.map((q) => h("tr", { class: act.has(q) ? "hot" : null },
      h("th", { scope: "row" }, `${q === fa.start ? "→ " : ""}${fa.accept.includes(q) ? "* " : ""}${q}`),
      syms.map((a) => {
        const t = fa.next(q, a);
        return h("td", { class: act.has(q) && a === hotSym ? "hot" : null }, t.length ? (fa.kind === "DFA" ? t[0] : `{${t.join(", ")}}`) : "–");
      }),
      extra ? h("td", { class: "left" }, extra.cell(q)) : null)))));
}

export function inputStrip(symbols, index) {
  return h("div", { class: "input-chars", "aria-hidden": "true" }, symbols.length
    ? symbols.map((c, i) => h("span", { class: i < index ? "done" : i === index ? "now" : null }, c))
    : h("span", { class: "now" }, "ε"));
}

export const series = (i) => `--c:var(--series-${(i % 8) + 1})`;

// Random DFA over {a, b} for practice questions.
export function randomDfaText(r, n = 3 + Math.floor(r() * 2)) {
  const names = Array.from({ length: n }, (_, i) => `q${i}`);
  const accept = names.filter(() => r() < 0.4);
  if (!accept.length) accept.push(names[n - 1]);
  const lines = ["start: q0", `accept: ${accept.join(" ")}`];
  for (const q of names) for (const a of ["a", "b"]) lines.push(`${q} ${a} ${names[Math.floor(r() * n)]}`);
  return lines.join("\n");
}

export function randomString(r, alphabet = ["a", "b"], min = 2, max = 6) {
  const len = min + Math.floor(r() * (max - min + 1));
  return Array.from({ length: len }, () => alphabet[Math.floor(r() * alphabet.length)]).join("");
}
