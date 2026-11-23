// /diagnostic: 20 mixed questions across every subject that has GATE
// questions. No timer and no feedback until the end; then a result per
// subject, the topics you already know (marked as known in your progress)
// and where to start in the roadmap.
import { TOPICS, check, generate } from "../gate-questions.js";
import { roadmapOf } from "../roadmaps.js";
import { SUBJECTS } from "../tools.js";
import { h } from "../ui.js";
import { bar, fill, header, moduleLink, plural, subnav } from "../learn/common.js";
import { diagnostic, diagnosticReport, DIAGNOSTIC } from "../learn/compose.js";
import { answer, dueCount, markKnown, nextModule, openMistakes } from "../learn/model.js";
import { answerText, inputs, metaRow, solution, stem, topicTitle } from "../learn/question.js";
import { load, update } from "../learn/store.js";

const subjectName = (id) => SUBJECTS.find((s) => s.id === id)?.name ?? id;

export function render(root) {
  const roadmap = roadmapOf("gate-cs");
  const body = h("div");
  const s0 = load();
  const subjects = [...new Set(TOPICS.map((t) => t.subject))].map(subjectName);
  root.replaceChildren(h("div", { class: "tool lp" },
    header("Diagnostic test", "Find out what you already know", `${DIAGNOSTIC.questions} mixed questions across ${subjects.join(" and ")}. No timer and no negative marks. At the end you'll see how you did in each subject, the topics you already know will be marked on the roadmap, and you'll get a place to start.`),
    subnav("diagnostic", { review: dueCount(s0), mistakes: openMistakes(s0).length }),
    body));

  fill(body, h("section", { class: "card" },
    h("h2", null, "Before you start"),
    h("ul", null,
      h("li", null, "Take it without notes, so the result is honest."),
      h("li", null, "If you don't know an answer, press “I don't know” rather than guessing."),
      h("li", null, "It takes about 30 to 40 minutes.")),
    h("button", { type: "button", class: "btn primary", onclick: start }, "Start the diagnostic")));

  function start() {
    const items = diagnostic(TOPICS, Math.floor(Math.random() * 1e9));
    const qs = items.map((it) => { try { return generate(it.topic, it.seed); } catch { return null; } }).filter(Boolean);
    const results = [];
    let i = 0, started = Date.now();
    const step = () => {
      if (i >= qs.length) return finish(qs, results);
      const q = qs[i];
      started = Date.now();
      const save = h("button", { type: "button", class: "btn primary", disabled: true, onclick: () => go(box.get()) }, i === qs.length - 1 ? "Finish" : "Save and next");
      const box = inputs(q, { onChange: (r) => { save.disabled = r == null; } });
      if (box.nat) box.nat.addEventListener("keydown", (e) => { if (e.key === "Enter" && !save.disabled) { e.preventDefault(); save.click(); } });
      fill(body, 
        h("div", { class: "lp-progress" }, h("span", { class: "small muted" }, `Question ${i + 1} of ${qs.length}`), bar(i / qs.length, `${i} of ${qs.length} done`)),
        h("section", { class: "card gate-q lp-q" }, metaRow(q), stem(q), box.el,
          h("div", { class: "row" }, save, h("button", { type: "button", class: "btn ghost", onclick: () => go(null) }, "I don't know"))));
      window.scrollTo(0, 0);
    };
    function go(response) {
      const q = qs[i];
      const { correct, score } = response == null ? { correct: false, score: 0 } : check(q, response);
      results.push({ q, response, correct, score, ms: Date.now() - started });
      i++;
      step();
    }
    step();
  }

  function finish(qs, results) {
    const report = diagnosticReport(results.map((r) => ({ topic: r.q.topic, correct: r.correct })), TOPICS, roadmap);
    update((s) => {
      for (const r of results) answer(s, { topic: r.q.topic, seed: r.q.seed, correct: r.correct, score: r.score, marks: r.q.marks, ms: r.ms, src: "diagnostic" });
      markKnown(s, report.known);
    });
    const next = nextModule(load(), roadmap);
    const right = results.filter((r) => r.correct).length;
    const startHere = report.start;
    fill(body, 
      h("section", { class: "card" },
        h("h2", null, `You got ${right} of ${results.length} right`),
        report.known.length
          ? h("p", null, `Marked as known: ${report.known.map(topicTitle).join(", ")}. These count as mastered on the roadmap and will come back as quick reviews.`)
          : h("p", { class: "muted" }, "No topic is marked as known yet: that needs every question on it right. That's normal on a first go."),
        startHere ? h("p", null, "Your weakest subject was ", h("b", null, subjectName(report.weakest)), ". A good place to start: ",
          h("a", { href: moduleLink(roadmap.id, startHere.stage, startHere.module) }, startHere.title), ".") : null,
        h("div", { class: "row" },
          startHere ? h("a", { class: "btn primary", href: moduleLink(roadmap.id, startHere.stage, startHere.module) }, `Start with ${startHere.title}`) : null,
          next && next.module.id !== startHere?.module ? h("a", { class: "btn ghost", href: moduleLink(roadmap.id, next.stage.id, next.module.id) }, `Or follow the roadmap: ${next.module.title}`) : null,
          h("a", { class: "btn ghost", href: "/plan" }, "Make a study plan"))),
      h("div", { class: "lp-subjects" }, report.subjects.map((sub) => h("section", { class: "card" },
        h("h2", null, subjectName(sub.subject)),
        h("p", { class: "lp-big" }, `${sub.right} / ${sub.total}`),
        bar(sub.right / sub.total, `${sub.right} of ${sub.total} right`),
        sub.known.length ? h("p", { class: "small" }, "You know: ", sub.known.map(topicTitle).join(", ")) : h("p", { class: "small muted" }, "No topic fully right yet."),
        sub.start ? h("p", { class: "small" }, "Start with: ", h("a", { href: moduleLink(roadmap.id, sub.start.stage, sub.start.module) }, sub.start.title)) : h("p", { class: "small" }, "Every topic here is known. Keep it fresh with reviews.")))),
      h("section", { class: "card" },
        h("h2", null, "Go through the questions"),
        h("ol", { class: "lp-review-list" }, results.map((r) => h("li", null,
          h("details", null,
            h("summary", null, h("span", { class: r.correct ? "lp-good" : "lp-bad" }, r.correct ? "Right" : r.response == null ? "Skipped" : "Wrong"), ` · ${topicTitle(r.q.topic)}`),
            metaRow(r.q), stem(r.q),
            h("p", null, `Your answer: ${answerText(r.q, r.response)}. Correct answer: ${answerText(r.q)}.`),
            solution(r.q)))))),
      h("p", { class: "muted small" }, `${plural(results.filter((r) => !r.correct).length, "question")} went into your `, h("a", { href: "/mistakes" }, "mistake notebook"), "."));
    window.scrollTo(0, 0);
  }
}
