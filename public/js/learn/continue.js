// A compact "continue where you left off" card for the home page: the module
// to carry on with, reviews due and today's plan. Does nothing for a visitor
// with no activity. Used as:
//   import("./learn/continue.js").then(({ mountContinue }) => mountContinue(el));
import { ROADMAPS, roadmapOf } from "../roadmaps.js";
import { h } from "../ui.js";
import { moduleLink, plural } from "./common.js";
import { dueCount, isDone, lastModule, moduleState, nextModule, openMistakes, streak, todayKey, weakSlugs } from "./model.js";
import { buildPlan } from "./planner.js";
import { hasActivity, load } from "./store.js";

export function mountContinue(el) {
  if (!el) return;
  let s;
  try { s = load(); } catch { return; }
  if (!hasActivity(s)) return;
  const now = Date.now(), today = todayKey(now);
  const roadmap = roadmapOf(s.plan?.roadmap) ?? ROADMAPS[0];
  const place = lastModule(s, roadmap, now) ?? nextModule(s, roadmap, now);
  const due = dueCount(s, now), mistakes = openMistakes(s).length, days = streak(s, today);

  let todays = null;
  if (s.plan && roadmapOf(s.plan.roadmap)) {
    const done = new Set(roadmap.stages.flatMap((st) => st.modules).filter((m) => isDone(moduleState(s, m, now))).map((m) => m.id));
    const plan = buildPlan({ ...s.plan, roadmap, start: today }, done, new Set(weakSlugs(s)));
    if (plan.days[0]?.date === today) todays = plan.days[0].tasks;
  }

  const items = [
    place ? h("li", null, h("span", { class: "muted small" }, "Continue"), h("a", { href: moduleLink(roadmap.id, place.stage.id, place.module.id) }, place.module.title)) : null,
    todays ? h("li", null, h("span", { class: "muted small" }, "Today's plan"), h("a", { href: "/plan" }, todays.map((t) => (t.type === "module" ? t.title : t.type === "mock" ? "Full mock" : "Review")).join(", ") || "Catch up")) : null,
    due ? h("li", null, h("span", { class: "muted small" }, "Reviews"), h("a", { href: "/review" }, `${plural(due, "topic")} due`)) : null,
    mistakes ? h("li", null, h("span", { class: "muted small" }, "Mistakes"), h("a", { href: "/mistakes" }, `${mistakes} to go over`)) : null,
  ].filter(Boolean);
  if (!items.length) return;

  el.replaceChildren(h("section", { class: "card lp-continue", "aria-label": "Your study" },
    h("div", { class: "row spread lp-tight" },
      h("h2", null, "Pick up where you left off"),
      h("a", { class: "small", href: "/progress" }, days > 1 ? `${days} day streak · your progress` : "Your progress")),
    h("ul", { class: "lp-continue-list" }, items)));
  el.hidden = false;
}
