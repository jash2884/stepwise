// Roadmap pages:
//   /roadmaps                    every roadmap
//   /roadmap/<id>                the map: stages in order, each with its modules
//   /roadmap/<id>/<stage>        one stage: modules with outcomes, tools, practice, reading
// Personal roadmaps from /syllabus ("my-<hash>") resolve from this device's
// learning store, so they render here but are never prerendered.
import { ROADMAPS, hoursOf, localRoadmaps, roadmapOf, stageOf } from "../roadmaps.js";
import { SUBJECTS, TOOLS } from "../tools.js";
import { h } from "../ui.js";
import { badge, bar, fill, moduleLink, ring } from "../learn/common.js";
import { moduleState, nextModule, stageProgress, STATE_LABEL } from "../learn/model.js";
import { hasActivity, load, setDone, update } from "../learn/store.js";

const toolOf = (slug) => TOOLS.find((t) => t.slug === slug);
const stageColour = (i) => `var(--series-${(i % 8) + 1})`;
const subjectName = (id) => SUBJECTS.find((s) => s.id === id)?.name;
const hoursText = (n) => `about ${n} h`;
const hasGate = (stage) => stage.modules.some((m) => m.gate?.length);
const progressText = (p) => `${p.mastered} of ${p.total} mastered`;
const clip = (s, n = 168) => s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n - 1))}…`;

// Which page a path asks for, or null when it isn't a roadmap page.
export function parse(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "roadmaps") return { kind: "index" };
  if (parts[0] !== "roadmap" || parts.length < 2 || parts.length > 3) return null;
  const roadmap = roadmapOf(parts[1]);
  if (!roadmap) return null;
  if (parts.length === 2) return { kind: "map", roadmap };
  const stage = stageOf(roadmap, parts[2]);
  return stage ? { kind: "stage", roadmap, stage } : null;
}

// Title and description for the page, used by the router and the build.
export function meta(page, siteName) {
  if (page.roadmap?.local) return {
    title: `${page.stage ? `${page.stage.title}: ` : ""}${page.roadmap.title}, your syllabus roadmap · ${siteName}`,
    description: page.roadmap.description || "A personal roadmap built from your syllabus.",
  };
  if (page.kind === "index") return {
    title: `Study roadmaps for GATE, placements and semester exams · ${siteName}`,
    description: "Free step-by-step study roadmaps for computer science: every topic in order, linked to visualisers and practice questions.",
  };
  if (page.kind === "map") return {
    title: `${page.roadmap.title} roadmap: every topic in order · ${siteName}`,
    description: page.roadmap.description,
  };
  return {
    title: `${page.stage.title} for ${page.roadmap.title}: roadmap · ${siteName}`,
    description: clip(`${page.stage.title} roadmap for ${page.roadmap.title}: ${page.stage.modules.length} topics in order, with visualisers, practice and reading. ${page.stage.summary}`),
  };
}

export function render(root, page) {
  if (page.kind === "index") return renderIndex(root);
  if (page.kind === "map") return renderMap(root, page.roadmap);
  return renderStage(root, page.roadmap, page.stage);
}

// --- /roadmaps ---------------------------------------------------------------------

function renderIndex(root) {
  const s = load(), active = hasActivity(s);
  fill(root, 
    h("header", { class: "tool-head" },
      h("p", { class: "eyebrow" }, "Roadmaps"),
      h("h1", null, "Know what to study next"),
      h("p", { class: "lede" }, "Each roadmap puts the topics in a sensible order and links every one to a visualiser you can step through, questions that check you, and reading for the rest.")),
    (() => {
      const mine = localRoadmaps(s);
      return h("section", { class: "sy-index" },
        h("h2", null, mine.length ? "From your syllabus" : "Your own syllabus"),
        mine.length ? h("div", { class: "rm-list" }, mine.map((r) => h("a", { class: "card rm-card", href: `/roadmap/${r.id}` },
          h("p", { class: "eyebrow" }, h("span", { class: "sy-badge" }, "Your syllabus")),
          h("h2", null, r.title),
          h("p", { class: "muted" }, r.summary),
          h("span", { class: "btn primary" }, "Open the roadmap →")))) : null,
        h("p", { class: "muted" }, mine.length ? null : "Every college has its own syllabus. ", h("a", { href: "/syllabus" }, mine.length ? "Add another syllabus" : "Upload yours and get a roadmap that follows it"), mine.length ? "" : ", matched to drishi topic by topic."));
    })(),
    h("div", { class: "rm-list" }, ROADMAPS.map((r) => {
      const modules = r.stages.flatMap((s) => s.modules);
      return h("a", { class: "card rm-card", href: `/roadmap/${r.id}` },
        h("h2", null, r.title),
        h("p", { class: "muted" }, r.summary),
        h("p", { class: "rm-facts" }, `${r.stages.length} stages · ${modules.length} topics · ${hoursText(hoursOf(modules))}`),
        active ? (() => {
          const p = r.stages.map((st) => stageProgress(s, st)).reduce((a, b) => ({ mastered: a.mastered + b.mastered, total: a.total + b.total, progress: a.progress + b.progress * b.total }), { mastered: 0, total: 0, progress: 0 });
          return h("p", { class: "lp-inline" }, ring(p.progress / p.total, `${Math.round((100 * p.progress) / p.total)}% through`), h("span", { class: "muted small" }, progressText(p)));
        })() : null,
        h("span", { class: "btn primary" }, "Open the roadmap →"));
    })));
}

// --- /roadmap/<id> -------------------------------------------------------------------

// The "Your syllabus" badge and, on the map, the editor for a personal roadmap.
const localBadge = (roadmap) => roadmap.local ? h("span", { class: "sy-badge" }, "Your syllabus") : null;
function localEditor(root, roadmap, open) {
  if (!roadmap.local || !roadmap.syllabus) return null;
  const slot = h("div");
  import("../syllabus/ui.js").then(({ editor }) => {
    const el = editor(roadmap, (r) => {
      if (!r) { history.pushState(null, "", "/syllabus"); dispatchEvent(new PopStateEvent("popstate")); return; }
      renderMap(root, r, true);
    });
    el.open = !!open;
    slot.replaceChildren(el);
  }).catch(() => {});
  return slot;
}

function renderMap(root, roadmap, editing = false) {
  const all = roadmap.stages.flatMap((s) => s.modules);
  const withTools = all.filter((m) => m.tools.length).length;
  const st = load(), active = hasActivity(st);
  const next = nextModule(st, roadmap);
  fill(root, 
    h("header", { class: "tool-head" },
      h("p", { class: "eyebrow" }, h("a", { href: "/roadmaps" }, "Roadmaps"), " / ", roadmap.title),
      h("h1", null, `${roadmap.title} roadmap`, roadmap.local ? " " : null, localBadge(roadmap)),
      h("p", { class: "lede" }, roadmap.summary),
      h("ul", { class: "hero-facts rm-hero-facts" },
        h("li", null, h("b", null, roadmap.stages.length), roadmap.local ? " units" : " stages"),
        h("li", null, h("b", null, all.length), " topics"),
        h("li", null, h("b", null, withTools), " with visualisers"),
        h("li", null, h("b", null, hoursText(hoursOf(all))), " of study"))),
    next ? h("div", { class: "card lp-next" },
      h("div", null, h("p", { class: "eyebrow" }, active ? "Next up" : "Start here"), h("p", { class: "lp-next-title" }, next.module.title, h("span", { class: "muted small" }, ` · ${next.stage.title}`))),
      h("div", { class: "row lp-tight" },
        h("a", { class: "btn primary", href: moduleLink(roadmap.id, next.stage.id, next.module.id) }, `Continue: ${next.module.title}`),
        active ? h("a", { class: "btn ghost small", href: "/progress" }, "Your progress") : h("a", { class: "btn ghost small", href: "/diagnostic" }, "Take the diagnostic first"))) : null,
    localEditor(root, roadmap, editing),
    roadmap.howTo?.length ? h("section", { class: "card rm-howto" },
      h("h2", null, "How to use it"),
      h("ol", null, roadmap.howTo.map((t) => h("li", null, t)))) : null,
    h("ol", { class: "rm-path" }, roadmap.stages.map((stage, i) => h("li", { class: "rm-stage", style: `--c:${stageColour(i)}` },
      h("span", { class: "rm-dot", "aria-hidden": "true" }, i + 1),
      h("div", { class: "card" },
        h("div", { class: "rm-stage-head" },
          h("h2", null, h("a", { href: `/roadmap/${roadmap.id}/${stage.id}` }, stage.title)),
          h("span", { class: "muted small" }, `${stage.modules.length} topics · ${hoursText(hoursOf(stage.modules))}`)),
        h("p", { class: "muted" }, stage.summary),
        active ? (() => { const p = stageProgress(st, stage); return h("div", { class: "lp-stage-bar" }, bar(p.progress, `${stage.title}: ${Math.round(p.progress * 100)}%`), h("span", { class: "muted small" }, progressText(p))); })() : null,
        h("ul", { class: "rm-chips" }, stage.modules.map((m) => {
          const state = active ? moduleState(st, m).state : "not-started";
          return h("li", null,
            h("a", { class: m.tools.length || m.practiceAll ? "rm-chip" : "rm-chip soon", "data-state": state, href: `/roadmap/${roadmap.id}/${stage.id}#${m.id}`, title: state === "not-started" ? null : STATE_LABEL[state] }, m.title));
        })),
        h("a", { class: "btn ghost small", href: `/roadmap/${roadmap.id}/${stage.id}` }, "Open this stage →")))),
    ),
    h("p", { class: "muted small rm-note" }, roadmap.local
      ? "Hours are borrowed from the matching drishi topics (or your syllabus's lecture hours), so treat them as rough. Topics in grey aren't covered by drishi yet and link to searches instead."
      : "Hours are rough estimates for a first pass, including practice. Topics in grey don't have a drishi visualiser yet and link to reading instead."));
}

// --- /roadmap/<id>/<stage> -----------------------------------------------------------

function renderStage(root, roadmap, stage) {
  const i = roadmap.stages.indexOf(stage);
  const prev = roadmap.stages[i - 1], next = roadmap.stages[i + 1];
  const titles = new Map(roadmap.stages.flatMap((s) => s.modules.map((m) => [m.id, { title: m.title, stage: s }])));
  const subject = subjectName(stage.subject);
  const progressBox = h("div", { class: "lp-stage-bar" });
  const drawProgress = () => {
    const p = stageProgress(load(), stage);
    fill(progressBox, bar(p.progress, `Stage progress: ${Math.round(p.progress * 100)}%`), h("span", { class: "muted small" }, progressText(p)));
  };
  // The state badge, ring and (for modules without GATE questions) the done box.
  const status = (m) => {
    const box = h("div", { class: "lp-status" });
    const draw = () => {
      const { state, progress } = moduleState(load(), m);
      fill(box, ring(progress, `${STATE_LABEL[state]}, ${Math.round(progress * 100)}%`), badge(state),
        m.gate?.length ? null : h("label", { class: "lp-check" },
          h("input", { type: "checkbox", checked: state === "mastered", onchange: (e) => { update((s) => setDone(s, m.id, e.target.checked)); draw(); drawProgress(); } }),
          " Mark as done"));
    };
    draw();
    return box;
  };

  const moduleCard = (m, n) => h("section", { class: "card rm-module", id: m.id },
    h("div", { class: "rm-module-head" },
      h("span", { class: "rm-num" }, `${i + 1}.${n + 1}`),
      h("h2", null, m.title),
      h("span", { class: "muted small" }, hoursText(m.hours)),
      m.placement >= 4 ? h("span", { class: "tag" }, "Common in interviews") : null,
      status(m)),
    m.needs.length ? h("p", { class: "muted small rm-needs" }, "Needs: ", m.needs.map((id, k) => {
      const t = titles.get(id);
      return [k ? ", " : "", h("a", { href: `/roadmap/${roadmap.id}/${t.stage.id}#${id}` }, t.title)];
    })) : null,
    h("h3", null, "You should be able to"),
    h("ul", { class: "rm-outcomes" }, m.outcomes.map((o) => h("li", null, o))),
    m.tools.length ? [
      h("h3", null, "Learn it step by step"),
      h("div", { class: "rm-tools" }, m.tools.map((slug) => {
        const t = toolOf(slug);
        return h("a", { class: "rm-tool", href: `/${slug}` }, h("b", null, t.title), h("span", { class: "muted small" }, t.summary));
      })),
    ] : null,
    m.uncovered ? h("p", { class: "notice info rm-soon" }, "Not covered by drishi yet. Use your notes and the searches below.")
      : m.comingSoon ? h("p", { class: "notice info rm-soon" }, `No drishi visualiser for this yet. ${m.comingSoon === "Planned." ? "One is planned." : m.comingSoon} Use the reading below for now.`) : null,
    m.match?.title ? h("p", { class: "muted small sy-from" }, `Matched to the drishi topic "${m.match.title}"${m.match.via === "verifier" ? ", checked by the AI" : ""}.`) : null,
    m.tryIt?.length ? [
      h("h3", null, "Try these examples"),
      h("div", { class: "row rm-try" }, m.tryIt.map((t) => h("a", { class: "btn ghost small", href: `/${t.tool}?${t.query}` }, t.label))),
    ] : null,
    (m.gate?.length || m.practiceAll) ? [
      h("h3", null, "Check yourself"),
      h("div", { class: "row" }, m.practiceAll
        ? h("a", { class: "btn primary small", href: "/gate" }, "Mixed GATE questions")
        : m.gate.map((g) => h("a", { class: "btn primary small", href: `/gate?topic=${g}` }, `GATE questions: ${toolOf(g)?.title ?? g}`))),
    ] : null,
    m.reading?.length ? [
      h("h3", null, "Reading"),
      h("ul", { class: "rm-reading" }, m.reading.map((r) => h("li", null, h("a", { href: r.url, target: "_blank", rel: "noopener" }, r.title), h("span", { class: "muted small" }, ` · ${new URL(r.url).hostname.replace(/^www\./, "")}`)))),
    ] : null);

  fill(root, 
    h("header", { class: "tool-head rm-stage-top", style: `--c:${stageColour(i)}` },
      h("p", { class: "eyebrow" }, h("a", { href: "/roadmaps" }, "Roadmaps"), " / ", h("a", { href: `/roadmap/${roadmap.id}` }, roadmap.title), ` / ${roadmap.local ? "Unit" : "Stage"} ${i + 1} of ${roadmap.stages.length}`, roadmap.local ? " " : null, localBadge(roadmap)),
      h("h1", null, stage.title),
      h("p", { class: "lede" }, stage.summary),
      h("p", { class: "muted small" }, `${stage.modules.length} topics · ${hoursText(hoursOf(stage.modules))}${subject ? ` · ${subject} visualisers` : ""}`),
      progressBox,
      hasGate(stage) ? h("div", { class: "row" }, h("a", { class: "btn primary small", href: `/mock?roadmap=${roadmap.id}&stage=${stage.id}` }, "Take the stage test"), h("span", { class: "muted small" }, "15 questions, 30 minutes, GATE marking")) : null),
    h("nav", { class: "card rm-toc", "aria-label": "Topics in this stage" },
      h("ol", null, stage.modules.map((m) => h("li", null, h("a", { href: `#${m.id}` }, m.title))))),
    ...stage.modules.map(moduleCard),
    hasGate(stage) ? h("section", { class: "card lp-stage-test" },
      h("h2", null, "Stage test"),
      h("p", { class: "muted" }, "Check the whole stage under time pressure: 15 GATE-style questions from these topics in 30 minutes, marked the GATE way, with a score report by topic."),
      h("a", { class: "btn primary", href: `/mock?roadmap=${roadmap.id}&stage=${stage.id}` }, "Take the stage test")) : null,
    h("nav", { class: "rm-pager", "aria-label": "Stages" },
      prev ? h("a", { class: "btn ghost", href: `/roadmap/${roadmap.id}/${prev.id}` }, `← ${prev.title}`) : h("span"),
      h("a", { class: "btn ghost", href: `/roadmap/${roadmap.id}` }, "All stages"),
      next ? h("a", { class: "btn primary", href: `/roadmap/${roadmap.id}/${next.id}` }, `${next.title} →`) : h("span")));

  drawProgress();
  // Arriving at /roadmap/gate-cs/os#os.vm should land on that module.
  // The page is already in the document here, so no need to wait for a frame.
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
