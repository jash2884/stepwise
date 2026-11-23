// /syllabus: upload your syllabus, get your roadmap. The PDF is read in the
// browser; the text goes to the AI model to pull out units and topics, which
// are matched to Stepwise; the roadmap is saved on this device only.
import { h } from "../ui.js";
import { aiCall } from "../ai/client.js";
import { fill, header, plural } from "../learn/common.js";
import { isDone, moduleState, todayKey, weakSlugs } from "../learn/model.js";
import { buildPlan, snapshot } from "../learn/planner.js";
import { addDays, deleteRoadmap, load, saveRoadmap, update } from "../learn/store.js";
import { localRoadmaps } from "../roadmaps.js";
import { assembleRoadmap } from "../syllabus/assemble.js";
import { catalogue, syllabusBadge, unitsList } from "../syllabus/ui.js";

export const META = {
  title: "Turn your syllabus into a study roadmap",
  description: "Upload your university syllabus PDF or paste it in: Stepwise matches every topic to visualisers and practice, then plans your study to the exam date.",
};
const MAX_CHARS = 60000;

export function render(root) {
  const today = todayKey(Date.now());
  const s0 = load();
  const file = h("input", { type: "file", id: "sy-file", accept: "application/pdf,.pdf,text/plain,.txt" });
  const text = h("textarea", { id: "sy-text", rows: 12, maxlength: MAX_CHARS, placeholder: "Paste your syllabus here, or pick a PDF above. Units and their topics are what matter; the rest is ignored.", "aria-describedby": "sy-count" });
  const count = h("span", { id: "sy-count", class: "muted small" });
  const fileStatus = h("p", { class: "muted small", "aria-live": "polite" });
  const exam = h("input", { type: "date", id: "sy-exam", required: true, min: addDays(today, 1), value: s0.plan?.exam ?? addDays(today, 60) });
  const hours = h("input", { type: "number", id: "sy-hours", min: 0.5, max: 14, step: 0.5, required: true, value: s0.plan?.hoursPerDay ?? 2 });
  const error = h("p", { class: "notice error", hidden: true, role: "alert" });
  const go = h("button", { type: "submit", class: "btn primary" }, "Build my roadmap");
  const progress = h("p", { class: "muted small", "aria-live": "polite" });
  const result = h("div", { class: "sy-result" });
  const saved = h("div");
  const counter = () => { count.textContent = `${text.value.length.toLocaleString("en-GB")} characters${text.value.length > MAX_CHARS * 0.9 ? ` of ${MAX_CHARS.toLocaleString("en-GB")}` : ""}`; };
  text.addEventListener("input", counter);
  counter();
  const fail = (msg) => { error.textContent = msg; error.hidden = false; };

  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    error.hidden = true;
    if (f.size > 15_000_000) return fail("That file is over 15 MB. Try a smaller PDF, or paste the text.");
    try {
      if (/\.txt$/i.test(f.name) || f.type === "text/plain") { text.value = (await f.text()).slice(0, MAX_CHARS); fileStatus.textContent = `Read ${f.name}.`; }
      else {
        fileStatus.textContent = "Loading the PDF reader…";
        const { pdfToText } = await import("../syllabus/pdf.js");
        const out = await pdfToText(f, (i, n) => { fileStatus.textContent = `Reading page ${i} of ${n}…`; });
        if (out.text.replace(/--- Page \d+ ---|\s/g, "").length < 40) return fail("No text came out of that PDF. It may be a scan; paste the text instead, or copy it from the university website.");
        text.value = out.text.slice(0, MAX_CHARS);
        fileStatus.textContent = `Read ${plural(out.pages, "page")} of ${f.name}${out.truncated ? " (only the first 40)" : ""}. Check the text below, and delete anything that isn't this course.`;
      }
      counter();
      text.focus();
    } catch (e) {
      console.error(e);
      fileStatus.textContent = "";
      fail("Couldn't read that PDF. Paste the text instead.");
    }
  });

  const form = h("form", { class: "card sy-form", onsubmit: async (e) => {
    e.preventDefault();
    error.hidden = true;
    const body = text.value.trim();
    if (body.length < 40) return fail("Paste your syllabus, or pick a PDF, first.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exam.value) || exam.value <= today) return fail("Pick an exam date after today.");
    if (!(Number(hours.value) >= 0.5 && Number(hours.value) <= 14)) return fail("Hours a day should be between 0.5 and 14.");
    go.disabled = true;
    progress.textContent = "Reading your syllabus and matching every topic. This usually takes 20 to 60 seconds.";
    fill(result);
    try {
      const data = await aiCall("syllabus", { text: body });
      const roadmap = assembleRoadmap(data, catalogue());
      roadmap.settings = { exam: exam.value, hoursPerDay: Number(hours.value) };
      update((s) => saveRoadmap(s, roadmap));
      progress.textContent = "";
      showResult(roadmap, data);
      drawSaved();
      result.scrollIntoView({ block: "start" });
    } catch (err) {
      progress.textContent = "";
      fail(err.status === 429 ? err.message : `${err.message} If it keeps failing, try pasting less text (one course at a time).`);
    } finally { go.disabled = false; }
  } },
    h("h2", null, "1. Your syllabus"),
    h("label", { class: "lp-field" }, h("span", null, "A PDF or text file"), file),
    fileStatus,
    h("label", { class: "lp-field", for: "sy-text" }, h("span", null, "Syllabus text")),
    text, count,
    h("p", { class: "notice info small sy-privacy" }, "Privacy: the syllabus text is sent to the AI model (Stepwise's own, or yours if you added a key in AI settings) to read the units and topics. Nothing is stored on the server. Your roadmap is saved in this browser only."),
    h("h2", null, "2. Your exam"),
    h("div", { class: "lp-fields" },
      h("label", { class: "lp-field" }, h("span", null, "Exam date"), exam),
      h("label", { class: "lp-field" }, h("span", null, "Hours a day"), hours, h("span", { class: "muted small" }, "On study days"))),
    error,
    h("div", { class: "row" }, go),
    progress);

  function makePlan(roadmap) {
    const s = load(), now = Date.now();
    const settings = { roadmap: roadmap.id, exam: exam.value, hoursPerDay: Number(hours.value), daysPerWeek: s.plan?.daysPerWeek ?? 6 };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.exam) || settings.exam <= today) return fail("Pick an exam date after today.");
    const done = new Set(roadmap.stages.flatMap((st) => st.modules).filter((m) => isDone(moduleState(s, m, now))).map((m) => m.id));
    const built = buildPlan({ ...settings, roadmap, start: today }, done, new Set(weakSlugs(s)));
    if (built.error) return fail(built.error);
    if (s.plan && s.plan.roadmap !== roadmap.id && !confirm("This replaces your current study plan. Your progress stays.")) return;
    update((st) => { st.plan = { ...settings, created: now, snapshot: snapshot(built) }; });
    history.pushState(null, "", "/plan");
    dispatchEvent(new PopStateEvent("popstate"));
  }

  function showResult(roadmap, data) {
    const topics = roadmap.stages.flatMap((st) => st.modules);
    const covered = topics.filter((m) => !m.uncovered).length;
    fill(result, h("section", { class: "card sy-done" },
      h("p", { class: "eyebrow" }, syllabusBadge()),
      h("h2", null, roadmap.title),
      h("ul", { class: "hero-facts lp-facts" },
        h("li", null, h("b", null, roadmap.stages.length), " units"),
        h("li", null, h("b", null, topics.length), " topics"),
        h("li", null, h("b", null, covered), " matched to Stepwise"),
        h("li", null, h("b", null, topics.length - covered), " to study elsewhere")),
      data.stats?.verifierFailed ? h("p", { class: "notice info small" }, "The AI check on borderline matches didn't answer, so those were decided on similarity alone. You can run the matching again from the roadmap page.") : null,
      h("div", { class: "row" },
        h("a", { class: "btn primary", href: `/roadmap/${roadmap.id}` }, "Open your roadmap"),
        h("button", { type: "button", class: "btn ghost", onclick: () => makePlan(roadmap) }, "Make my study plan")),
      h("h3", null, "What each topic matched"),
      unitsList(roadmap.syllabus)));
  }

  function drawSaved() {
    const mine = localRoadmaps();
    fill(saved, mine.length ? h("section", { class: "card" },
      h("h2", null, "Your syllabus roadmaps"),
      h("ul", { class: "sy-saved" }, mine.map((r) => h("li", null,
        h("a", { href: `/roadmap/${r.id}` }, r.title),
        h("span", { class: "muted small" }, ` ${plural(r.stages.length, "unit")}, ${plural(r.stages.reduce((a, st) => a + st.modules.length, 0), "topic")}`),
        h("button", { type: "button", class: "btn ghost small", "aria-label": `Delete ${r.title}`, onclick: () => {
          if (!confirm(`Delete "${r.title}"? Any study plan made from it goes too.`)) return;
          update((s) => deleteRoadmap(s, r.id));
          drawSaved();
        } }, "Delete"))))) : null);
  }

  fill(root, h("div", { class: "tool sy" },
    header("Your syllabus", "Upload your syllabus, get your roadmap", "Every college teaches its own syllabus. Give Stepwise yours and it lists the units in order, matches each topic to the visualisers and practice that teach it, says plainly which topics it doesn't cover, and plans your study to the exam."),
    form, result, saved));
  drawSaved();
}
