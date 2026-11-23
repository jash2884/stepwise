// /review: spaced repetition. Topics you've mastered come back as two quick
// questions after 2, 7, 21 and 45 days; getting both right pushes the next
// review further out, a miss brings it back tomorrow.
import { generate } from "../gate-questions.js";
import { h } from "../ui.js";
import { dateText, fill, header, plural, subnav } from "../learn/common.js";
import { answer, openMistakes, predictSuccess, review } from "../learn/model.js";
import { pickAdaptive } from "../learn/elo.js";
import { learnFrom } from "../ai/doctor.js";
import { doctorPanel } from "../ai/doctor-panel.js";
import { practiceCard, topicTitle } from "../learn/question.js";
import { DAY, INTERVALS, REVIEW_QUESTIONS, dueTopics, nextDue } from "../learn/srs.js";
import { dayKey, load, update } from "../learn/store.js";

const newSeed = () => Math.floor(Math.random() * 1e9);

// A review question for a topic, chosen adaptively: of a few fresh seeds, one
// whose predicted chance of success (learn/elo.js) is in the useful band.
function adaptiveQuestion(topic) {
  const s = load(), cands = [];
  for (let i = 0; i < 6; i++) {
    try { const q = generate(topic, newSeed()); cands.push({ q, p: predictSuccess(s, { topic, type: q.type, marks: q.marks }) }); } catch { /* try another */ }
  }
  const pick = pickAdaptive(cands);
  if (!pick) throw new Error(`No ${topic} question`);
  return pick.q;
}

export function render(root) {
  const body = h("div");
  const s0 = load();
  root.replaceChildren(h("div", { class: "tool lp" },
    header("Reviews", "Quick reviews", `Topics you've mastered come back as ${REVIEW_QUESTIONS} quick questions after ${INTERVALS.slice(0, -1).join(", ")} and ${INTERVALS.at(-1)} days. Get both right and the next review moves further out; miss one and it comes back tomorrow.`),
    subnav("review", { review: dueTopics(s0.reviews, Date.now()).length, mistakes: openMistakes(s0).length }),
    body));

  function overview() {
    const s = load(), now = Date.now();
    const due = dueTopics(s.reviews, now);
    const next = nextDue(s.reviews, now);
    const upcoming = Object.entries(s.reviews).filter(([, r]) => r.due > now).sort((a, b) => a[1].due - b[1].due).slice(0, 8);
    fill(body, 
      h("section", { class: "card" },
        due.length ? [
          h("h2", null, `${plural(due.length, "topic")} due`),
          h("ul", { class: "lp-list" }, due.map((t) => h("li", null, h("b", null, topicTitle(t)), h("span", { class: "muted small" }, overdue(s.reviews[t].due, now))))),
          h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => session(due) }, `Start: ${plural(due.length * REVIEW_QUESTIONS, "question")}`)),
        ] : [
          h("h2", null, "Nothing due"),
          h("p", { class: "muted" }, Object.keys(s.reviews).length
            ? `You're up to date.${next ? ` The next review is on ${dateText(dayKey(next))}.` : ""}`
            : "A topic joins the review queue once you master it: when your answers make it at least 95% likely that you know it (usually three or four right in a row). Practise on the GATE page or take the diagnostic."),
          h("div", { class: "row" }, h("a", { class: "btn ghost", href: "/gate" }, "GATE practice"), h("a", { class: "btn ghost", href: "/mistakes" }, "Go over your mistakes")),
        ]),
      upcoming.length ? h("section", { class: "card" }, h("h2", null, "Coming back later"),
        h("ul", { class: "lp-list" }, upcoming.map(([t, r]) => h("li", null, h("span", null, topicTitle(t)), h("span", { class: "muted small" }, dateText(dayKey(r.due))))))) : null);
  }

  // One topic at a time, REVIEW_QUESTIONS questions each.
  function session(topics) {
    let ti = 0, qi = 0, rights = 0;
    const tally = [];
    const step = () => {
      if (ti >= topics.length) return finish();
      const topic = topics[ti];
      let q;
      try { q = adaptiveQuestion(topic); } catch { ti++; return step(); }
      const last = qi === REVIEW_QUESTIONS - 1;
      const card = practiceCard(q, {
        heading: h("p", { class: "eyebrow" }, `Review ${ti + 1} of ${topics.length}: ${topicTitle(topic)} · question ${qi + 1} of ${REVIEW_QUESTIONS}`),
        onResult: ({ correct, score, ms, response }) => {
          if (correct) rights++;
          let diagnosis = null;
          update((s) => {
            answer(s, { topic, seed: q.seed, correct, score, marks: q.marks, ms, src: "review", type: q.type, response });
            if (!correct) diagnosis = learnFrom(s, q, response);
            if (last) review(s, topic, rights === REVIEW_QUESTIONS);
          });
          if (last) tally.push({ topic, passed: rights === REVIEW_QUESTIONS });
          return correct ? null : doctorPanel(q, response, diagnosis);
        },
        actions: () => [h("button", { type: "button", class: "btn primary", onclick: () => {
          if (last) { ti++; qi = 0; rights = 0; } else qi++;
          step();
        } }, last && ti === topics.length - 1 ? "See how it went" : "Next →")],
      });
      fill(body, card);
      card.querySelector(".gate-nat, .gate-opt")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    const finish = () => {
      const s = load();
      fill(body, h("section", { class: "card" },
        h("h2", null, "Reviews done"),
        h("ul", { class: "lp-list" }, tally.map(({ topic, passed }) => h("li", null,
          h("b", null, topicTitle(topic)),
          h("span", { class: passed ? "lp-good small" : "lp-bad small" }, passed ? `Both right. Next review ${dateText(dayKey(s.reviews[topic].due))}.` : "Missed one. It comes back tomorrow.")))),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: overview }, "Back to reviews"), h("a", { class: "btn ghost", href: "/progress" }, "Your progress"))));
    };
    step();
  }

  overview();
}

function overdue(due, now) {
  const days = Math.floor((now - due) / DAY);
  return days >= 1 ? ` ${plural(days, "day")} overdue` : " due today";
}
