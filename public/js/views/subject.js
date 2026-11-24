// /subject/<id>: every topic of one subject, in the order to study them.
import { SUBJECTS, TOOLS } from "../tools.js";
import { ROADMAPS, modulesOf } from "../roadmaps.js";
import { h } from "../ui.js";

export const subjectOf = (id) => SUBJECTS.find((s) => s.id === id) ?? null;
// Study order: where each tool first appears in a roadmap (GATE first).
export function studyOrder(id) {
  const rank = new Map();
  for (const r of ROADMAPS) for (const { module } of modulesOf(r)) for (const t of module.tools) if (!rank.has(t)) rank.set(t, rank.size);
  return TOOLS.filter((t) => t.subject === id).sort((a, b) => (rank.get(a.slug) ?? 1e6) - (rank.get(b.slug) ?? 1e6));
}
export function meta(s, site) {
  return { title: `${s.name}: every topic, step by step · ${site}`, description: `${s.name} for CS students: ${studyOrder(s.id).length} topics in study order, each a step-by-step visualiser with practice questions.` };
}
export function render(root, s) {
  const list = studyOrder(s.id), stage = h("div", { class: "subject-figure", "aria-hidden": "true" });
  root.replaceChildren(h("div", { class: "subject-page" },
    h("header", { class: "tool-head" }, h("h1", null, s.name), h("p", { class: "lede" }, `${list.length} topics, in a good order to study them.`)),
    h("div", { class: "subject-grid" }, h("ol", { class: "subject-topics" }, list.map((t) => h("li", null, h("a", { href: `/${t.slug}` }, h("b", null, t.title), h("span", null, t.summary))))), stage)));
  let eye = null, gone = false;
  if (matchMedia("(min-width: 900px)").matches) import("../eye.js").then((m) => m.mountEye(stage, { scale: 1.05 })).then((e) => { if (gone) { e?.dispose(); return; } eye = e; e?.shape(s.id); }).catch(() => {});
  return () => { gone = true; eye?.dispose(); };
}
