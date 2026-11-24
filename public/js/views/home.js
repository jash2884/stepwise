// Home: the eye, one question, then every subject as a list that opens in place.
import { SUBJECTS, TOOLS } from "../tools.js";
import { ROADMAPS } from "../roadmaps.js";
import { h } from "../ui.js";

const toolsOf = (id) => TOOLS.filter((t) => t.subject === id);
const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
const DOORS = [
  ["/roadmaps", "Follow a roadmap", `${ROADMAPS.length} paths: GATE, placements, semester exams and AI.`],
  ["/gate", "Practise questions", "Endless GATE-style questions with worked solutions."],
  ["/mock", "Sit a mock test", "Timed, marked the GATE way."],
  ["/mistakes", "Fix your mistakes", "See which misconception you most likely had, and where."],
  ["/syllabus", "Bring your syllabus", "Turn your college PDF into a plan."],
];

export function render(root) {
  const canvas = h("div", { class: "eye-stage", "aria-hidden": "true" });
  const input = h("input", { id: "see", class: "see-input", type: "text", autocomplete: "off", spellcheck: "false", maxlength: 1200, placeholder: "LRU with 3 frames", "aria-describedby": "see-help" });
  const matches = h("ul", { class: "see-matches", "aria-live": "polite" });
  const form = h("form", { class: "see", onsubmit: (e) => { e.preventDefault(); go(); } },
    h("h1", null, h("label", { for: "see" }, "What do you want to see?")),
    h("div", { class: "see-line" }, input, h("button", { type: "submit", class: "see-go" }, "See it")),
    matches,
    h("p", { id: "see-help", class: "vh" }, "Type a topic or a whole question. Matches appear as you type, worked out on your device."));

  const open = new URLSearchParams(location.search).get("subject");
  const subjects = SUBJECTS.map((s) => {
    const list = h("ul", { class: "x-tools" }, toolsOf(s.id).map((t) => h("li", null, h("a", { href: `/${t.slug}` }, t.title))));
    return h("details", { class: "x-subject", name: "subject", "data-subject": s.id, open: s.id === open },
      h("summary", null, h("span", null, s.name), h("span", { class: "x-n" }, toolsOf(s.id).length)), list);
  });
  const explore = h("section", { class: "explore", id: "explore" }, h("h2", { class: "vh" }, "Explore"), h("div", { class: "x-list" }, subjects));

  document.body.prepend(canvas);
  root.replaceChildren(h("div", { class: "home" },
    h("section", { class: "home-hero" }, form),
    h("section", { id: "home-continue", hidden: true }),
    explore,
    h("section", { class: "doors" }, h("h2", null, "Then make it stick"),
      h("ul", null, DOORS.map(([href, t, d]) => h("li", null, h("a", { href }, h("b", null, t), h("span", null, d))))))));
  import("../learn/continue.js").then((m) => m.mountContinue(document.getElementById("home-continue"))).catch(() => {});

  // --- The eye -----------------------------------------------------------------------
  let eye = null, gone = false, resting = "eye", typed = null;
  import("../eye.js").then((m) => m.mountEye(canvas)).then((e) => {
    if (gone) { e?.dispose(); return; }
    if (!e) { canvas.classList.add("no-webgl"); return; }
    eye = e; sync();
  }).catch(() => canvas.classList.add("no-webgl"));
  const wide = matchMedia("(min-width: 900px)");
  function sync() {
    if (!eye) return;
    const r = explore.getBoundingClientRect(), inside = r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.35;
    canvas.classList.toggle("past", r.bottom < innerHeight * 0.35);
    if (inside) eye.place(wide.matches ? { x: -2.3, y: 0, scale: 0.85 } : { x: 0, y: 2.3, scale: 0.62 });
    else eye.place(wide.matches ? { x: 0, y: 0.82, scale: 0.72 } : { x: 0, y: 1.15, scale: 0.84 });
    const shown = explore.querySelector("details[open]")?.dataset.subject;
    eye.shape(inside ? resting !== "eye" ? resting : shown ?? "eye" : typed ?? "eye");
  }
  for (const d of subjects) {
    d.addEventListener("toggle", () => { resting = "eye"; sync(); });
    d.firstChild.addEventListener("pointerenter", () => { resting = d.dataset.subject; sync(); });
    d.firstChild.addEventListener("pointerleave", () => { resting = "eye"; sync(); });
    d.firstChild.addEventListener("focus", () => { resting = d.dataset.subject; sync(); });
    d.firstChild.addEventListener("blur", () => { resting = "eye"; sync(); });
  }
  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; sync(); }); } };
  addEventListener("scroll", onScroll, { passive: true });

  // --- Ask, answered on the device -----------------------------------------------------
  let best = null, run = 0, timer = 0;
  async function match() {
    const q = input.value.trim(), id = ++run;
    best = null;
    if (q.length < 2) { matches.replaceChildren(); typed = null; sync(); return; }
    try {
      const { guess } = await import("../ai/local/router.js");
      const r = await guess(q);
      if (id !== run || gone) return;
      const hits = r.tools.filter((t) => t.slug !== "none" && t.p > 0.06).slice(0, 3);
      if (!hits.length || r.tools[0].slug === "none") { matches.replaceChildren(h("li", { class: "muted" }, "Nothing here shows that yet. Try a CS topic.")); typed = null; sync(); return; }
      best = r.tools[0];
      matches.replaceChildren(...hits.map((t, i) => { const tool = bySlug.get(t.slug); return h("li", null, h("a", { href: `/${t.slug}`, class: i ? null : "top" }, tool.title)); }));
      typed = bySlug.get(best.slug).subject;
      sync();
    } catch { if (id === run) matches.replaceChildren(); }
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(match, 110); });
  input.addEventListener("focus", () => import("../ai/local/router.js").then((m) => m.loadRouter()).catch(() => {}), { once: true });
  async function go() {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    clearTimeout(timer);
    await match();
    const { navigate } = await import("../app.js");
    navigate(`/ask?q=${encodeURIComponent(q.slice(0, 600))}`);
  }

  if (location.hash === "#explore" || location.hash === "#catalogue" || open) requestAnimationFrame(() => explore.scrollIntoView());
  return () => { gone = true; clearTimeout(timer); removeEventListener("scroll", onScroll); eye?.dispose(); canvas.remove(); };
}
