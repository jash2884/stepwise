// The "Mistake doctor" panel shown after a wrong answer (GATE practice, mock
// review, the mistake notebook). Everything in it is computed by doctor.js
// and the misconception library, so it works with no AI at all; "Explain
// more" optionally asks /api/ai/doctor to reword the same diagnosis kindly,
// with the numbers fixed.
import { generate, topicOf } from "../gate-questions.js";
import { h } from "../ui.js";
import { aiCall } from "./client.js";
import { OTHER_LABEL, explanationOf, percent, stepOf, stepUrl, targetSeed, verdict } from "./doctor.js";
import { answerText } from "../learn/question.js";

// d: a diagnosis from doctor.js (diagnose, learnFrom or diagnoseSaved).
export function doctorPanel(q, response, d) {
  if (!d) return null;
  const m = d.claim?.m ?? null;
  const explanation = m ? explanationOf(m, q) : "";
  const step = m ? stepOf(m, q) : null;
  const others = d.posterior.filter((x) => x.p >= 0.05).slice(0, 4);
  const aiOut = h("div", { class: "doc-ai", "aria-live": "polite" });
  const actions = h("div", { class: "row doc-actions" });
  const panel = h("section", { class: `doc-panel${m ? "" : " doc-unsure"}`, "aria-label": "Mistake doctor" },
    h("p", { class: "doc-eyebrow" }, "Mistake doctor"),
    h("p", { class: "doc-verdict" }, verdict(d)),
    explanation ? h("p", { class: "doc-explain" }, explanation) : h("p", { class: "doc-explain muted" }, "Go through the worked solution step by step and compare it with your own working."),
    others.length > 1 ? h("details", { class: "doc-odds" },
      h("summary", null, "How sure is it?"),
      h("ul", null, others.map((x) => h("li", null,
        h("span", null, x.m ? `You ${x.m.label}` : `It was ${OTHER_LABEL[x.id]}`),
        h("span", { class: "doc-bar", role: "img", "aria-label": `${percent(x.p)}%` }, h("i", { style: `width:${Math.round(x.p * 100)}%` })),
        h("b", null, `${percent(x.p)}%`)))),
      h("p", { class: "muted small" }, "Each possibility is scored by how well it reproduces your exact answer, weighed by how often you've made it before.")) : null,
    actions, aiOut);

  if (m && step) actions.append(h("a", { class: "btn ghost small", href: stepUrl(q.replay, step) }, "See the step where it goes wrong"));
  if (m) {
    const target = h("button", { type: "button", class: "btn ghost small", onclick: () => {
      target.disabled = true;
      target.textContent = "Finding one…";
      const seed = targetSeed(q.topic, m.id, generate);
      if (seed == null) { target.textContent = "No question found for this one"; return; }
      location.href = `/gate?topic=${encodeURIComponent(q.topic)}&seed=${seed}`;
    } }, "Try a question that targets this");
    actions.append(target);
  }
  const more = h("button", { type: "button", class: "btn ghost small", onclick: async () => {
    more.disabled = true;
    aiOut.replaceChildren(h("p", { class: "muted small" }, "Asking the AI to put it more simply…"));
    try {
      const res = await aiCall("doctor", {
        topic: topicOf(q.topic)?.title ?? q.topic,
        diagnosis: m ? m.label : "",
        confidence: m ? percent(d.claim.p) : null,
        explanation: m ? explanation : "",
        yourAnswer: answerText(q, response),
        rightAnswer: answerText(q),
        step: step ?? null,
      });
      if (typeof res?.text !== "string" || !res.text.trim()) throw new Error("The AI couldn't answer just now.");
      aiOut.replaceChildren(h("p", { class: "doc-ai-text" }, res.text), h("p", { class: "muted small" }, "Reworded by an AI from the diagnosis above; the numbers are checked against it."));
      more.remove();
    } catch (err) {
      aiOut.replaceChildren(h("p", { class: "muted small" }, `${err.message} The diagnosis above is complete without it.`));
      more.disabled = false;
    }
  } }, "Explain more");
  actions.append(more);
  return panel;
}
