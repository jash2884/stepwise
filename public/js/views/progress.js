// /progress: the learner's dashboard. Streak, this week, mastery per roadmap
// stage, weakest topics, reviews due, and the data controls (export, import,
// reset). Everything comes from the learning store on this device.
import { TOPICS } from "../gate-questions.js";
import { ROADMAPS } from "../roadmaps.js";
import { h } from "../ui.js";
import { bar, dateText, duration, header, moduleLink, pct, plural, subnav, weekdayLetter } from "../learn/common.js";
import { topicTitle } from "../learn/question.js";
import { dueCount, nextModule, openMistakes, stageProgress, streak, todayKey, weakTopics, week } from "../learn/model.js";
import { dayKey, exportText, hasActivity, importText, load, reset } from "../learn/store.js";
import { commonMistakes, percent } from "../ai/doctor.js";

export function render(root) {
  const draw = () => {
    const s = load(), now = Date.now(), today = todayKey(now);
    const due = dueCount(s, now), mistakes = openMistakes(s).length;
    const days = week(s, today);
    const q = days.reduce((a, d) => a + d.q, 0), right = days.reduce((a, d) => a + d.right, 0);
    const active = days.filter((d) => d.q || d.visits || d.ms >= 60000).length;
    const time = days.reduce((a, d) => a + d.ms, 0);
    const maxQ = Math.max(1, ...days.map((d) => d.q));
    const weak = weakTopics(s, TOPICS, 6);

    const facts = h("ul", { class: "hero-facts lp-facts" },
      h("li", null, h("b", null, plural(streak(s, today), "day")), " streak"),
      h("li", null, h("b", null, `${active} of 7`), " days active this week"),
      h("li", null, h("b", null, q), ` questions this week`),
      h("li", null, h("b", null, pct(q ? right / q : null)), " right this week"),
      h("li", null, h("b", null, duration(time)), " studied this week"));

    const weekCard = h("section", { class: "card" },
      h("h2", null, "This week"),
      h("ol", { class: "lp-week", "aria-label": "Questions answered each day this week" }, days.map((d) => h("li", { class: d.key === today ? "today" : "" },
        h("span", { class: "lp-week-n" }, d.q || ""),
        h("span", { class: "lp-week-col", title: `${dateText(d.key)}: ${plural(d.q, "question")}, ${pct(d.accuracy)} right` },
          h("i", { style: `height:${(d.q / maxQ) * 100}%` }),
          d.accuracy != null ? h("b", { class: "lp-week-acc", style: `bottom:${d.accuracy * 100}%` }) : null),
        h("span", { class: "lp-week-day" }, weekdayLetter(d.key)),
        h("span", { class: "lp-week-acc-text muted" }, d.accuracy == null ? "" : pct(d.accuracy))))),
      h("p", { class: "muted small" }, "Bars show questions answered each day; the dot and the figure under each day show how many were right."));

    const actions = h("section", { class: "card lp-actions" },
      h("h2", null, "What next"),
      h("div", { class: "lp-action-grid" },
        action("/review", due ? `${plural(due, "review")} due` : "No reviews due", "Quick questions on topics you've mastered, so they stick."),
        action("/mistakes", mistakes ? `${plural(mistakes, "mistake")} to go over` : "Mistake notebook", "Every wrong answer, with the solution and a retry."),
        action("/plan", s.plan ? "Today's plan" : "Make a study plan", "A day by day schedule up to your exam date."),
        action("/mock", "Mock tests", "Timed stage tests and full GATE-length mocks."),
        action("/diagnostic", "Diagnostic test", "20 mixed questions to find what you already know.")));

    const stages = ROADMAPS.map((r) => {
      const next = nextModule(s, r, now);
      return h("section", { class: "card" },
        h("div", { class: "row spread lp-tight" }, h("h2", null, `${r.title}: mastery by stage`),
          next ? h("a", { class: "btn primary small", href: moduleLink(r.id, next.stage.id, next.module.id) }, `Continue: ${next.module.title}`) : null),
        h("ul", { class: "lp-stages" }, r.stages.map((stage, i) => {
          const p = stageProgress(s, stage, now);
          return h("li", null,
            h("a", { href: `/roadmap/${r.id}/${stage.id}`, style: `--c:var(--series-${(i % 8) + 1})` }, stage.title),
            bar(p.progress, `${stage.title}: ${Math.round(p.progress * 100)}%`),
            h("span", { class: "muted small" }, `${p.mastered} of ${p.total}`));
        })));
    });

    const weakCard = h("section", { class: "card" },
      h("h2", null, "Weakest topics"),
      weak.length ? h("ul", { class: "lp-list" }, weak.map((w) => h("li", null,
        h("span", null, h("b", null, w.topic.title), h("span", { class: "muted small" }, ` ${pct(w.pKnown)} likely you know it, ${w.right} of ${w.total} right overall`)),
        h("a", { class: "btn ghost small", href: `/gate?topic=${w.topic.slug}` }, "Practise"))))
        : h("p", { class: "muted" }, "No weak spots yet. A topic shows up here once you've answered at least 3 questions on it and your answers make it less than 70% likely that you know it."));

    const common = commonMistakes(s, 5);
    const commonCard = h("section", { class: "card doc-common" },
      h("h2", null, "Your common mistakes"),
      common.length ? [
        h("ul", { class: "lp-list" }, common.map((c) => h("li", null,
          h("span", null, h("b", null, `You ${c.label}`), h("span", { class: "muted small" }, ` ${topicTitle(c.topic)} · seen in about ${plural(Math.max(1, Math.round(c.evidence)), "answer")} · about ${percent(c.share)}% of your diagnosed mistakes there`)),
          h("a", { class: "btn ghost small", href: `/gate?topic=${c.topic}` }, "Practise")))),
        h("p", { class: "muted small" }, "From the mistake doctor: each wrong answer is matched against known mistakes by recomputing the answer each way, and the ones you keep making add up here."),
      ] : h("p", { class: "muted" }, "Nothing yet. When a wrong answer matches a known mistake (like using FIFO instead of LRU), the mistake doctor keeps count and the ones you make most show up here."));

    const mocks = s.mocks.slice(-6).reverse();
    const mockCard = mocks.length ? h("section", { class: "card" },
      h("h2", null, "Recent tests"),
      h("ul", { class: "lp-list" }, mocks.map((m) => h("li", null,
        h("span", null, h("b", null, m.title ?? (m.kind === "full" ? "Full mock" : "Stage test")), h("span", { class: "muted small" }, ` ${dateText(dayKey(m.at), { weekday: false })}`)),
        h("span", { class: "mono" }, `${m.score} / ${m.max}`))))) : null;

    const file = h("input", { type: "file", accept: "application/json,.json", class: "lp-file", "aria-label": "Progress file to import", onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      try { importText(await f.text()); status.textContent = "Imported. Your progress has been replaced with the file's."; draw(); }
      catch (err) { status.textContent = err.message; }
    } });
    const status = h("p", { class: "muted small", role: "status" });
    const dataCard = h("section", { class: "card" },
      h("h2", null, "Your data"),
      h("p", { class: "muted small" }, "Progress is saved in this browser only. There's no account, so export a file to move it to another device or keep a backup."),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost small", onclick: download }, "Export progress"),
        h("button", { type: "button", class: "btn ghost small", onclick: () => file.click() }, "Import a file"),
        h("button", { type: "button", class: "btn ghost small lp-danger", onclick: () => {
          if (!confirm("Delete all your Stepwise progress on this device? This can't be undone. Export a copy first if you might want it.")) return;
          reset(); draw();
        } }, "Reset everything")),
      file, status);

    root.replaceChildren(h("div", { class: "tool lp" },
      header("Your progress", "How you're doing", "Your streak, this week's work, mastery across the roadmap and what to do next. Saved on this device only."),
      subnav("progress", { review: due, mistakes }),
      hasActivity(s) ? [facts, actions, weekCard, ...stages, weakCard, commonCard, mockCard] : [
        h("section", { class: "card lp-empty" },
          h("h2", null, "Nothing here yet"),
          h("p", null, "Answer some questions or open a visualiser and your progress will show up here. The quickest start is the diagnostic test: 20 questions that mark what you already know."),
          h("div", { class: "row" }, h("a", { class: "btn primary", href: "/diagnostic" }, "Take the diagnostic"), h("a", { class: "btn ghost", href: "/roadmap/gate-cs" }, "Open the GATE CS roadmap"))),
        actions],
      dataCard));
  };
  draw();
}

function action(href, title, text) {
  return h("a", { class: "lp-action", href }, h("b", null, title), h("span", { class: "muted small" }, text));
}

function download() {
  const blob = new Blob([exportText()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: `stepwise-progress-${todayKey()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

