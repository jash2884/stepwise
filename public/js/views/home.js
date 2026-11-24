// Home: the eye and one question on the left, every subject on the right.
import { SUBJECTS, TOOLS } from "../tools.js";
import { ROADMAPS } from "../roadmaps.js";
import { h } from "../ui.js";

const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
const DOORS = [
  ["/roadmaps", "Follow a roadmap", `${ROADMAPS.length} paths: GATE, placements, semester exams and AI.`],
  ["/gate", "Practise questions", "Endless GATE-style questions with worked solutions."],
  ["/mock", "Sit a mock test", "Timed, marked the GATE way."],
  ["/mistakes", "Fix your mistakes", "See which misconception you most likely had, and where."],
  ["/syllabus", "Bring your syllabus", "Turn your college PDF into a plan."],
];

export function render(root) {
  const stage = h("div", { class: "eye-stage", "aria-hidden": "true" });
  const input = h("input", { id: "see", class: "see-input", type: "text", autocomplete: "off", spellcheck: "false", maxlength: 1200, placeholder: "LRU with 3 frames", "aria-describedby": "see-help" });
  const matches = h("ul", { class: "see-matches", "aria-live": "polite" });
  const form = h("form", { class: "see", onsubmit: (e) => { e.preventDefault(); go(); } },
    h("h1", null, h("label", { for: "see" }, "What do you want to see?")),
    h("div", { class: "see-line" }, input, h("button", { type: "submit", class: "see-go" }, "See it")),
    matches,
    h("p", { id: "see-help", class: "vh" }, "Type a topic or a whole question. Matches appear as you type, worked out on your device."));
  const links = SUBJECTS.map((s) => h("li", null, h("a", { href: `/subject/${s.id}`, "data-subject": s.id }, s.name)));
  root.replaceChildren(h("div", { class: "home" },
    h("section", { class: "home-top" },
      h("div", { class: "home-left" }, stage, form),
      h("nav", { class: "home-subjects", id: "explore", "aria-label": "Subjects" }, h("ul", null, links))),
    h("section", { id: "home-continue", hidden: true }),
    h("section", { class: "doors" }, h("h2", null, "Then make it stick"),
      h("ul", null, DOORS.map(([href, t, d]) => h("li", null, h("a", { href }, h("b", null, t), h("span", null, d))))))));
  import("../learn/continue.js").then((m) => m.mountContinue(document.getElementById("home-continue"))).catch(() => {});

  let eye = null, gone = false, hover = null, typed = null;
  import("../eye.js").then((m) => m.mountEye(stage, { scale: 1.02 })).then((e) => {
    if (gone) { e?.dispose(); return; }
    if (!e) { stage.classList.add("no-webgl"); return; }
    eye = e; sync();
  }).catch(() => stage.classList.add("no-webgl"));
  const sync = () => eye?.shape(hover ?? typed ?? "eye");
  for (const li of links) {
    const a = li.firstChild, on = () => { hover = a.dataset.subject; sync(); }, off = () => { hover = null; sync(); };
    a.addEventListener("pointerenter", on); a.addEventListener("focus", on);
    a.addEventListener("pointerleave", off); a.addEventListener("blur", off);
  }

  // Ask, answered on the device.
  let run = 0, timer = 0;
  async function match() {
    const q = input.value.trim(), id = ++run;
    if (q.length < 2) { matches.replaceChildren(); typed = null; sync(); return; }
    try {
      const { guess } = await import("../ai/local/router.js");
      const r = await guess(q);
      if (id !== run || gone) return;
      const hits = r.tools.filter((t) => t.slug !== "none" && t.p > 0.06).slice(0, 3);
      if (!hits.length || r.tools[0].slug === "none") { matches.replaceChildren(h("li", { class: "muted" }, "Nothing here shows that yet. Try a CS topic.")); typed = null; sync(); return; }
      matches.replaceChildren(...hits.map((t, i) => h("li", null, h("a", { href: `/${t.slug}`, class: i ? null : "top" }, bySlug.get(t.slug).title))));
      typed = bySlug.get(hits[0].slug).subject;
      sync();
    } catch { if (id === run) matches.replaceChildren(); }
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(match, 110); });
  input.addEventListener("focus", () => import("../ai/local/router.js").then((m) => m.loadRouter()).catch(() => {}), { once: true });
  async function go() {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    clearTimeout(timer);
    const { navigate } = await import("../app.js");
    navigate(`/ask?q=${encodeURIComponent(q.slice(0, 600))}`);
  }
  if (location.hash === "#explore") requestAnimationFrame(() => document.getElementById("explore")?.scrollIntoView({ block: "center" }));
  return () => { gone = true; clearTimeout(timer); eye?.dispose(); };
}
