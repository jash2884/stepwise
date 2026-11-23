// A small card under a visualiser that has GATE-style questions, linking to
// the practice page for that topic. The list of topics comes from the roadmap
// data (module.gate), so a tool page doesn't load every engine just to show a
// link; test/gate.test.js checks it matches the real generators.
import { ROADMAPS } from "./roadmaps.js";
import { h } from "./ui.js";

export const GATE_SLUGS = new Set(ROADMAPS.flatMap((r) => r.stages.flatMap((s) => s.modules.flatMap((m) => m.gate ?? []))));

export function gateCard(slug) {
  if (!GATE_SLUGS.has(slug)) return null;
  return h("section", { class: "card gate-link" },
    h("div", null,
      h("h2", null, "Preparing for GATE?"),
      h("p", { class: "muted small" }, "Try endless GATE-style questions on this topic, marked the GATE way, with a worked solution that replays here step by step.")),
    h("a", { class: "btn primary", href: `/gate?topic=${slug}` }, "Practise GATE questions"));
}
