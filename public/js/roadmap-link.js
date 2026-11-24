// A card under a visualiser saying where it sits in the GATE CS roadmap, with
// the topics before and after it, so a student always knows what to do next.
import { placeOfTool, roadmapOf } from "./roadmaps.js";
import { studyOrder } from "./views/subject.js";
import { h } from "./ui.js";

export function roadmapCard(slug, roadmapId = "gate-cs") {
  const roadmap = roadmapOf(roadmapId);
  const place = roadmap && placeOfTool(roadmap, slug);
  if (!place) return null;
  const link = ({ stage, module }) => `/roadmap/${roadmap.id}/${stage.id}#${module.id}`;
  const n = roadmap.stages.indexOf(place.stage) + 1;
  return h("nav", { class: "card rm-place", "aria-label": `${roadmap.title} roadmap` },
    h("p", { class: "eyebrow" }, `${roadmap.title} roadmap · stage ${n}: ${place.stage.title}`),
    h("p", { class: "rm-place-title" }, "This is part of ", h("a", { href: link(place) }, place.module.title), "."),
    h("div", { class: "rm-place-nav" },
      place.prev ? h("a", { class: "btn ghost small", href: link(place.prev) }, `← ${place.prev.module.title}`) : null,
      h("a", { class: "btn ghost small", href: `/roadmap/${roadmap.id}` }, "Full roadmap"),
      place.next ? h("a", { class: "btn ghost small", href: link(place.next) }, `Next: ${place.next.module.title} →`) : null));
}

// One obvious next step at the end of a topic.
export function nextStep(tool, practise) {
  const list = studyOrder(tool.subject), at = list.findIndex((t) => t.slug === tool.slug), next = list[at + 1] ?? null;
  return h("nav", { class: "next-step", "aria-label": "Next" },
    practise ? h("a", { class: "btn primary", href: `/gate?topic=${tool.slug}` }, "Practise this") : null,
    next ? h("a", { class: practise ? "btn ghost" : "btn primary", href: `/${next.slug}` }, `Next: ${next.title}`) : h("a", { class: practise ? "btn ghost" : "btn primary", href: `/subject/${tool.subject}` }, "Back to the subject"));
}
