// A small card under a visualiser that has GATE-style questions, linking to
// the practice page for that topic. Kept separate from gate-questions.js so a
// tool page doesn't load every engine just to show a link.
import { h } from "./ui.js";

const TOPICS = ["cpu-scheduling", "page-replacement", "disk-scheduling", "bankers-algorithm", "memory-allocation", "address-translation", "normalization", "serializability", "hashing", "sql-joins"];

export function gateCard(slug) {
  if (!TOPICS.includes(slug)) return null;
  return h("section", { class: "card gate-link" },
    h("div", null,
      h("h2", null, "Preparing for GATE?"),
      h("p", { class: "muted small" }, "Try endless GATE-style questions on this topic, marked the GATE way, with a worked solution that replays here step by step.")),
    h("a", { class: "btn primary", href: `/gate?topic=${slug}` }, "Practise GATE questions"));
}
