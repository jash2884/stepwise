// /mistakes: the mistake notebook. Every wrong answer is kept as its topic and
// seed, so the exact question comes back here with a retry, the worked
// solution and the step-by-step replay. Mark one as understood to file it away.
import { generate } from "../gate-questions.js";
import { h } from "../ui.js";
import { dateText, fill, header, subnav } from "../learn/common.js";
import { answer, dueCount, openMistakes } from "../learn/model.js";
import { answerText, metaRow, practiceCard, solution, stem, topicTitle } from "../learn/question.js";
import { dayKey, load, setUnderstood, update } from "../learn/store.js";
import { diagnoseSaved, learnFrom } from "../ai/doctor.js";
import { doctorPanel } from "../ai/doctor-panel.js";

const PAGE = 15;

export function render(root) {
  let view = "open", shown = PAGE, topic = "all";
  const body = h("div");
  const nav = h("div");
  root.replaceChildren(h("div", { class: "tool lp" },
    header("Mistake notebook", "Your mistakes", "Every question you got wrong, rebuilt exactly as you saw it. Try it again, read the solution, replay it step by step, then mark it as understood."),
    nav, body));

  function draw() {
    const s = load();
    const open = openMistakes(s), done = s.mistakes.filter((m) => m.ok);
    nav.replaceChildren(subnav("mistakes", { review: dueCount(s), mistakes: open.length }));
    const list = (view === "open" ? open : done).filter((m) => topic === "all" || m.t === topic).slice().reverse();
    const topics = [...new Set((view === "open" ? open : done).map((m) => m.t))];
    const tab = (id, label) => h("button", { type: "button", class: "btn ghost small toggle", "aria-pressed": String(view === id), onclick: () => { view = id; shown = PAGE; topic = "all"; draw(); } }, label);
    fill(body, 
      h("div", { class: "row" }, tab("open", `To go over (${open.length})`), tab("done", `Understood (${done.length})`),
        topics.length > 1 ? h("select", { "aria-label": "Topic", onchange: (e) => { topic = e.target.value; shown = PAGE; draw(); } },
          h("option", { value: "all" }, "All topics"), topics.map((t) => h("option", { value: t, selected: t === topic }, topicTitle(t)))) : null),
      list.length ? list.slice(0, shown).map(entry) : h("section", { class: "card" },
        h("p", { class: "muted" }, view === "open"
          ? (s.mistakes.length ? "Nothing left to go over. Well done." : "No mistakes saved yet. Wrong answers from GATE practice, reviews, mocks and the diagnostic land here.")
          : "Nothing marked as understood yet."),
        h("a", { class: "btn ghost", href: "/gate" }, "GATE practice")),
      list.length > shown ? h("button", { type: "button", class: "btn ghost", onclick: () => { shown += PAGE; draw(); } }, `Show more (${list.length - shown} left)`) : null);
  }

  function entry(m) {
    let q;
    try { q = generate(m.t, m.s); } catch { return null; }
    const slot = h("div");
    // The mistake doctor on the answer that was saved with this mistake.
    const doc = !m.ok && m.r != null ? doctorPanel(q, m.r, diagnoseSaved(load(), q, m)) : null;
    const card = h("section", { class: "card lp-mistake" },
      metaRow(q, h("span", { class: "muted" }, ` · got wrong on ${dateText(dayKey(m.at))}`)),
      h("details", { class: "lp-stem" }, h("summary", null, "Show the question"), stem(q)),
      doc ? h("p", { class: "muted small" }, `Your answer was ${answerText(q, m.r)}.`) : null,
      doc,
      slot,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary small", onclick: (e) => {
          e.currentTarget.remove();
          doc?.remove();
          slot.replaceChildren(practiceCard(q, {
            onResult: ({ correct, score, ms, response }) => {
              let diagnosis = null;
              update((s) => {
                answer(s, { topic: m.t, seed: m.s, correct, score, marks: q.marks, ms, src: "mistakes", type: q.type, response });
                if (!correct) diagnosis = learnFrom(s, q, response);
              });
              return correct ? null : doctorPanel(q, response, diagnosis);
            },
            actions: ({ correct }) => correct && !m.ok ? [h("button", { type: "button", class: "btn primary small", onclick: () => mark(true) }, "Mark as understood")] : [],
          }));
          card.querySelector(".lp-stem")?.remove();
        } }, "Try it again"),
        h("button", { type: "button", class: "btn ghost small", onclick: (e) => { e.currentTarget.remove(); slot.replaceChildren(solution(q)); } }, "Show the solution"),
        h("a", { class: "btn ghost small", href: q.replay }, "Watch it step by step"),
        h("button", { type: "button", class: "btn ghost small", onclick: () => mark(!m.ok) }, m.ok ? "Move back to go over" : "Mark as understood")));
    function mark(ok) { update((s) => setUnderstood(s, m.t, m.s, ok)); draw(); }
    return card;
  }

  draw();
}

