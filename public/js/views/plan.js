// /plan: the exam-date planner. The learner picks a roadmap, exam date, hours
// a day and days a week; the plan is rebuilt from today on every visit from
// what is still to master, so it replans by itself when they fall behind.
import { allRoadmaps, roadmapOf } from "../roadmaps.js";
import { h } from "../ui.js";
import { dateText, header, moduleLink, plural, subnav } from "../learn/common.js";
import { dueCount, isDone, moduleState, openMistakes, todayKey, weakSlugs } from "../learn/model.js";
import { behind, buildPlan, snapshot } from "../learn/planner.js";
import { addDays, load, update } from "../learn/store.js";

const doneSet = (s, roadmap, now) => new Set(roadmap.stages.flatMap((st) => st.modules).filter((m) => isDone(moduleState(s, m, now))).map((m) => m.id));
const weakSet = (s) => new Set(weakSlugs(s));

export function render(root) {
  const draw = () => {
    const s = load(), now = Date.now(), today = todayKey(now);
    const plan = s.plan && roadmapOf(s.plan.roadmap) ? s.plan : null;
    root.replaceChildren(h("div", { class: "tool lp" },
      header("Study plan", "Your plan to exam day", "Pick your exam date and how much time you have. The plan spreads what you haven't mastered yet over the days left, keeps every topic after the ones it needs, brings weak topics forward and saves the last fifth of the time for mocks and review."),
      subnav("plan", { review: dueCount(s, now), mistakes: openMistakes(s).length }),
      plan ? planView(s, plan, now, today, draw) : null,
      form(plan, today, draw)));
  };
  draw();
}

function form(plan, today, redraw) {
  const roadmap = h("select", { id: "lp-roadmap" }, allRoadmaps().map((r) => h("option", { value: r.id, selected: plan?.roadmap === r.id }, r.local ? `${r.title} (your syllabus)` : r.title)));
  const exam = h("input", { type: "date", id: "lp-exam", required: true, min: addDays(today, 1), value: plan?.exam ?? addDays(today, 90) });
  const hours = h("input", { type: "number", id: "lp-hours", min: 0.5, max: 14, step: 0.5, required: true, value: plan?.hoursPerDay ?? 3 });
  const days = h("select", { id: "lp-days" }, [7, 6, 5, 4, 3, 2, 1].map((n) => h("option", { value: n, selected: (plan?.daysPerWeek ?? 6) === n }, n === 7 ? "Every day" : `${n} days (${["", "Mon", "Mon to Tue", "Mon to Wed", "Mon to Thu", "Mon to Fri", "Mon to Sat"][n]})`)));
  const error = h("p", { class: "notice error", hidden: true, role: "alert" });
  const field = (label, input, hint) => h("label", { class: "lp-field" }, h("span", null, label), input, hint ? h("span", { class: "muted small" }, hint) : null);
  return h("form", { class: "card lp-form", onsubmit: (e) => {
    e.preventDefault();
    const settings = { roadmap: roadmap.value, exam: exam.value, hoursPerDay: Number(hours.value), daysPerWeek: Number(days.value) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.exam) || settings.exam <= today) { error.textContent = "Pick an exam date after today."; error.hidden = false; return; }
    if (!(settings.hoursPerDay >= 0.5 && settings.hoursPerDay <= 14)) { error.textContent = "Hours a day should be between 0.5 and 14."; error.hidden = false; return; }
    const s = load(), now = Date.now();
    const r = roadmapOf(settings.roadmap);
    const built = buildPlan({ ...settings, roadmap: r, start: today }, doneSet(s, r, now), weakSet(s));
    if (built.error) { error.textContent = built.error; error.hidden = false; return; }
    update((st) => { st.plan = { ...settings, created: now, snapshot: snapshot(built) }; });
    redraw();
    document.querySelector(".lp-today")?.scrollIntoView({ block: "start" });
  } },
    h("h2", null, plan ? "Change your plan" : "Make your plan"),
    h("div", { class: "lp-fields" },
      field("Roadmap", roadmap, h("a", { href: "/syllabus" }, "Or use your own syllabus")),
      field("Exam date", exam),
      field("Hours a day", hours, "On study days"),
      field("Days a week", days)),
    error,
    h("div", { class: "row" },
      h("button", { type: "submit", class: "btn primary" }, plan ? "Update my plan" : "Make my plan"),
      plan ? h("button", { type: "button", class: "btn ghost", onclick: () => { if (confirm("Remove your study plan? Your progress stays.")) { update((st) => { st.plan = null; }); redraw(); } } }, "Remove the plan") : null));
}

function planView(s, plan, now, today, redraw) {
  const roadmap = roadmapOf(plan.roadmap);
  const done = doneSet(s, roadmap, now);
  const built = buildPlan({ ...plan, roadmap, start: today }, done, weakSet(s));
  if (built.error) return h("p", { class: "notice info" }, `${built.error} Change the exam date below.`);
  const late = behind(plan.snapshot, done, today);
  const due = dueCount(s, now);
  const first = built.days[0];
  const todays = first?.date === today ? first : null;

  const task = (t) => {
    if (t.type === "module") return h("li", { class: "lp-task" },
      h("a", { href: moduleLink(roadmap.id, t.stage, t.id) }, t.title),
      h("span", { class: "muted small" }, ` ${t.stageTitle} · ${t.hours} h${t.parts > 1 ? ` · part ${t.part} of ${t.parts}` : ""}`));
    if (t.type === "mock") return h("li", { class: "lp-task" }, h("a", { href: "/mock?type=full" }, "Full mock test"), h("span", { class: "muted small" }, " 65 questions, 3 hours, then go through every wrong answer"));
    return h("li", { class: "lp-task" }, h("a", { href: "/review" }, t.light ? "Light review" : "Review and mistakes"), h("span", { class: "muted small" }, t.light ? " due reviews only, then rest" : " due reviews, your mistake notebook and your weakest topics"));
  };
  const dayCard = (d) => h("li", { class: `lp-day ${d.kind}` },
    h("span", { class: "lp-day-date" }, dateText(d.date)),
    h("ul", null, d.tasks.length ? d.tasks.map(task) : h("li", { class: "muted small" }, "Catch-up time")));

  const soon = built.days.slice(todays ? 1 : 0, 15);
  const rest = built.days.slice(15);
  return [
    late.length ? h("p", { class: "notice info" }, `You're ${plural(late.length, "topic")} behind the plan you made, so the plan below has been spread again over the days left. `,
      h("button", { type: "button", class: "btn ghost small", onclick: () => { update((st) => { st.plan.snapshot = snapshot(built); }); redraw(); } }, "Start counting from today")) : null,
    built.scale < 1 ? h("p", { class: "notice info" }, `There isn't enough time for every topic at the full suggested hours, so each topic gets about ${Math.round(built.scale * 100)}% of them. More hours a day or a later date would help.`) : null,
    h("section", { class: "card lp-today" },
      h("p", { class: "eyebrow" }, `Today, ${dateText(today)}`),
      h("h2", null, todays ? (todays.kind === "learn" ? "Today's topics" : "Today: revision") : "No study planned today"),
      todays ? h("ul", { class: "lp-tasks" }, todays.tasks.map(task)) : h("p", { class: "muted" }, first ? `Next study day: ${dateText(first.date)}.` : ""),
      due ? h("p", null, h("a", { class: "btn ghost small", href: "/review" }, `Plus ${plural(due, "quick review")} due`)) : null),
    h("ul", { class: "hero-facts lp-facts" },
      h("li", null, h("b", null, built.days.length), " study days left"),
      h("li", null, h("b", null, built.remaining), " topics to master"),
      h("li", null, h("b", null, built.reserveDays), " days for mocks and review"),
      h("li", null, "exam on ", h("b", null, dateText(plan.exam)))),
    soon.length ? h("section", { class: "card" }, h("h2", null, "Coming up"), h("ol", { class: "lp-days" }, soon.map(dayCard))) : null,
    rest.length ? h("details", { class: "card lp-more" }, h("summary", null, `The rest of the plan (${plural(rest.length, "day")})`), h("ol", { class: "lp-days" }, rest.map(dayCard))) : null,
  ];
}
