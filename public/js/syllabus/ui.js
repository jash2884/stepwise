// DOM pieces for personal syllabus roadmaps: the match list (on /syllabus and
// in the editor), the "Your syllabus" badge, and the editor shown on the
// roadmap page (rename or remove a topic, run the matching again, delete).
import { h } from "../ui.js";
import { ROADMAPS } from "../roadmaps.js";
import { TOOLS } from "../tools.js";
import { aiCall } from "../ai/client.js";
import { deleteRoadmap, saveRoadmap, update } from "../learn/store.js";
import { buildCatalogue } from "./catalogue.js";
import { applyRematch, gfgSearch, googleSearch, rematchBody, removeTopic, renameTopic } from "./assemble.js";

let entries = null;
export const catalogue = () => (entries ??= buildCatalogue(ROADMAPS, TOOLS));
const entry = (id) => catalogue().find((e) => e.id === id);

export const syllabusBadge = () => h("span", { class: "sy-badge" }, "Your syllabus");

const pct = (x) => `${Math.round(x * 100)}%`;

// One topic's match, as a short line: where it goes in drishi, or the
// honest "not covered" with search links.
export function matchLine(t, course = "") {
  if (t.match) {
    const e = entry(t.match.id);
    const href = e?.kind === "tool" ? `/${e.tool}` : e ? `/roadmap/${e.roadmap}/${e.stage}#${e.module}` : null;
    return h("span", { class: "sy-match" },
      h("span", { class: "sy-dot good", "aria-hidden": "true" }),
      href ? h("a", { href }, e.title) : t.match.id,
      h("span", { class: "muted small" }, ` ${pct(t.match.score)} similar${t.match.via === "verifier" ? ", checked by the AI" : ""}`),
      t.match.reason ? h("span", { class: "muted small sy-reason" }, `: ${t.match.reason}`) : null);
  }
  return h("span", { class: "sy-match" },
    h("span", { class: "sy-dot", "aria-hidden": "true" }),
    h("span", null, "Not covered by drishi yet. "),
    h("a", { href: gfgSearch(t.name), target: "_blank", rel: "noopener" }, "GeeksforGeeks"),
    h("span", { class: "muted" }, " · "),
    h("a", { href: googleSearch(t.name, course), target: "_blank", rel: "noopener" }, "Google"));
}

export function unitsList(syllabus) {
  return h("ol", { class: "sy-units" }, syllabus.units.map((u) => h("li", { class: "sy-unit" },
    h("h3", null, u.title, u.hours ? h("span", { class: "muted small" }, ` · ${u.hours} lecture hours`) : null, u.weight ? h("span", { class: "muted small" }, ` · ${u.weight}`) : null),
    h("ul", { class: "sy-topics" }, u.topics.map((t) => h("li", { class: "sy-topic" }, h("b", null, t.name), matchLine(t, syllabus.course)))))));
}

// The editor on /roadmap/my-…: rename, remove, re-run matching, delete.
// onChange(roadmap | null) redraws the page (null after a delete).
export function editor(roadmap, onChange) {
  const status = h("p", { class: "muted small", "aria-live": "polite" });
  const save = (r) => { update((s) => saveRoadmap(s, r)); onChange(r); };
  const rows = roadmap.syllabus.units.map((u) => h("li", { class: "sy-unit" },
    h("h3", null, u.title),
    h("ul", { class: "sy-topics" }, u.topics.map((t) => {
      const input = h("input", { type: "text", value: t.name, maxlength: 80, "aria-label": `Rename ${t.name}` });
      return h("li", { class: "sy-topic sy-edit-row" },
        h("div", { class: "sy-edit-name" }, input,
          h("button", { type: "button", class: "btn ghost small", onclick: () => { if (input.value.trim() && input.value.trim() !== t.name) save(renameTopic(roadmap, t.key, input.value, catalogue())); } }, "Rename"),
          h("button", { type: "button", class: "btn ghost small sy-remove", "aria-label": `Remove ${t.name}`, onclick: () => save(removeTopic(roadmap, t.key, catalogue())) }, "Remove")),
        matchLine(t, roadmap.syllabus.course),
        t.renamed ? h("span", { class: "muted small" }, "Renamed: run the matching again to update its match.") : null);
    }))));
  const rerun = h("button", { type: "button", class: "btn primary small", onclick: async () => {
    rerun.disabled = true;
    status.textContent = "Matching your topics again…";
    try {
      const result = await aiCall("syllabus", rematchBody(roadmap));
      save(applyRematch(roadmap, result, catalogue()));
    } catch (e) {
      status.textContent = e.message;
      rerun.disabled = false;
    }
  } }, "Run the matching again");
  return h("details", { class: "card sy-editor" },
    h("summary", null, "Edit this roadmap"),
    h("p", { class: "muted small" }, "Rename or remove topics. Renaming keeps your progress on that topic. Running the matching again sends the topic names (not your syllabus) to the AI model."),
    h("ol", { class: "sy-units" }, rows),
    h("div", { class: "row" }, rerun,
      h("button", { type: "button", class: "btn ghost small sy-delete", onclick: () => {
        if (!confirm(`Delete "${roadmap.title}"? Any study plan made from it goes too. Your practice history stays.`)) return;
        update((s) => deleteRoadmap(s, roadmap.id));
        onChange(null);
      } }, "Delete this roadmap")),
    status);
}
