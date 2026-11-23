// /mock: timed tests with GATE marking.
//   /mock                               choose a test (and resume one in progress)
//   /mock?type=full                     a full mock: 65 questions, 180 minutes
//   /mock?roadmap=gate-cs&stage=os      a stage test: ~15 questions, 30 minutes
// The exam screen copies the real GATE one: a question palette showing what's
// answered, marked for review or not visited yet, a countdown, and a submit.
// A test in progress is saved, so a reload or a closed tab can carry on.
import { TOPICS, check, generate } from "../gate-questions.js";
import { ROADMAPS, roadmapOf, stageOf } from "../roadmaps.js";
import { h, readParams } from "../ui.js";
import { dateText, duration, fill, header, plural, subnav } from "../learn/common.js";
import { FULL, STAGE, fullMock, scoreByTopic, stageMock, stageTopics } from "../learn/compose.js";
import { answer, dueCount, openMistakes } from "../learn/model.js";
import { answerText, inputs, solution, stem, topicTitle, TYPE_NAME } from "../learn/question.js";
import { dayKey, load, recordMock, update } from "../learn/store.js";

const CURRENT = "stepwise.mock";
const readCurrent = () => { try { const m = JSON.parse(localStorage.getItem(CURRENT)); return m && Array.isArray(m.items) && m.deadline ? m : null; } catch { return null; } };
const writeCurrent = (m) => { try { localStorage.setItem(CURRENT, JSON.stringify(m)); } catch { /* private mode */ } };
const clearCurrent = () => { try { localStorage.removeItem(CURRENT); } catch { /* ignore */ } };

const testUrl = (m) => (m.kind === "full" ? "/mock?type=full" : `/mock?roadmap=${m.roadmap}&stage=${m.stage}`);

// What the URL asks for: { kind, roadmap?, stage?, title } or null for the chooser.
function wanted(params) {
  if (params.get("type") === "full") return { kind: "full", title: "Full mock test" };
  const roadmap = roadmapOf(params.get("roadmap") ?? "gate-cs"), stage = stageOf(roadmap, params.get("stage"));
  if (stage) return { kind: "stage", roadmap, stage, title: `${stage.title}: stage test` };
  return null;
}

let timer = null;

export function render(root) {
  clearInterval(timer);
  const params = readParams();
  const want = wanted(params);
  const saved = readCurrent();
  const body = h("div");
  const s0 = load();
  root.replaceChildren(h("div", { class: "tool lp" }, body));
  const intro = (eyebrow, title, lede) => [header(eyebrow, title, lede), subnav("mock", { review: dueCount(s0), mistakes: openMistakes(s0).length })];

  if (saved && saved.deadline <= Date.now()) { submit(saved, true); return stop; }
  if (want && saved && testUrl(saved) === testUrl({ kind: want.kind, roadmap: want.roadmap?.id, stage: want.stage?.id })) { exam(saved); return stop; }
  if (want) {
    const test = want.kind === "full" ? fullMock(TOPICS, seed()) : stageMock(want.roadmap, want.stage, TOPICS, seed());
    if (!test) { fill(body, ...intro("Mock tests", want.title, "This stage has no GATE questions yet, so there's no stage test for it. Use the reading and visualisers on the stage page instead."), h("a", { class: "btn ghost", href: "/mock" }, "All mock tests")); return stop; }
    test.title = want.title;
    fill(body, ...intro("Mock tests", want.title, null), rules(test, saved));
    return stop;
  }
  chooser();
  return stop;

  function stop() { clearInterval(timer); }

  // --- Choosing a test ---------------------------------------------------------------
  function chooser() {
    const s = load();
    const past = s.mocks.slice(-8).reverse();
    fill(body, ...intro("Mock tests", "Timed tests, marked the GATE way", "Stage tests check one subject in 30 minutes. The full mock is GATE length: 65 questions in 3 hours, spread evenly over every subject with GATE questions so far. MCQs lose a third of their marks when wrong."),
      saved ? h("section", { class: "card lp-resume" },
        h("h2", null, "You have a test in progress"),
        h("p", { class: "muted" }, `${saved.title}: ${Object.keys(saved.answers).length} of ${saved.items.length} answered, ${duration(saved.deadline - Date.now())} left.`),
        h("div", { class: "row" }, h("a", { class: "btn primary", href: testUrl(saved) }, "Carry on"),
          h("button", { type: "button", class: "btn ghost", onclick: () => { if (confirm("Abandon this test? Nothing from it will be saved.")) { clearCurrent(); render(root); } } }, "Abandon it"))) : null,
      h("section", { class: "card lp-mock-full" },
        h("h2", null, "Full mock"),
        h("p", { class: "muted" }, `${FULL.questions} questions · ${FULL.minutes / 60} hours · ${[...new Set(TOPICS.map((t) => t.subject))].length} subjects`),
        h("a", { class: "btn primary", href: "/mock?type=full" }, "Set up a full mock")),
      ROADMAPS.map((r) => h("section", { class: "card" },
        h("h2", null, `${r.title} stage tests`),
        h("p", { class: "muted small" }, `${STAGE.questions} questions in ${STAGE.minutes} minutes from the stage's topics. Only stages with GATE questions have a test so far.`),
        h("ul", { class: "lp-list" }, r.stages.filter((st) => stageTopics(st, TOPICS).length).map((st) => h("li", null,
          h("span", null, h("b", null, st.title), h("span", { class: "muted small" }, ` ${stageTopics(st, TOPICS).map(topicTitle).join(", ")}`)),
          h("a", { class: "btn ghost small", href: `/mock?roadmap=${r.id}&stage=${st.id}` }, "Take the test")))))),
      past.length ? h("section", { class: "card" }, h("h2", null, "Your past tests"),
        h("ul", { class: "lp-list" }, past.map((m) => h("li", null,
          h("span", null, h("b", null, m.title ?? "Test"), h("span", { class: "muted small" }, ` ${dateText(dayKey(m.at), { weekday: false })} · ${m.right} right, ${m.wrong ?? 0} wrong of ${m.n}`)),
          h("span", { class: "mono" }, `${m.score} / ${m.max}`))))) : null);
  }

  // --- Instructions -------------------------------------------------------------------
  function rules(test, other) {
    return h("section", { class: "card" },
      h("h2", null, "Instructions"),
      h("ul", null,
        h("li", null, `${plural(test.items.length, "question")}, ${test.minutes} minutes. The timer starts when you press Start and the test is submitted when it runs out.`),
        h("li", null, "MCQ: one correct option, a wrong answer loses a third of the marks. MSQ: one or more correct options, all must be picked, no negative marks. NAT: type a number, no negative marks."),
        h("li", null, "Use the palette to jump between questions. Mark a question for review to come back to it; a marked question with an answer is still counted."),
        h("li", null, "Your answers are saved as you go, so you can reload the page and carry on.")),
      paletteLegend(),
      other ? h("p", { class: "notice info" }, `Starting this will abandon your test in progress (${other.title}).`) : null,
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const now = Date.now();
        const m = { ...test, started: now, deadline: now + test.minutes * 60000, answers: {}, marked: {}, visited: {}, current: 0 };
        writeCurrent(m);
        exam(m);
      } }, "Start the test"), h("a", { class: "btn ghost", href: "/mock" }, "Back")));
  }

  // --- The exam screen ------------------------------------------------------------------
  function exam(m) {
    const cache = new Map();
    const get = (i) => {
      if (!cache.has(i)) { try { cache.set(i, generate(m.items[i].topic, m.items[i].seed)); } catch { cache.set(i, null); } }
      return cache.get(i);
    };
    const clock = h("span", { class: "lp-clock", role: "timer", "aria-label": "Time left" });
    const qBox = h("section", { class: "card lp-exam-q" });
    const palette = h("div", { class: "lp-palette-grid" });
    const counts = h("p", { class: "small muted" });
    // The bar comes after the questions and sticks to the bottom of the
    // screen, so the clock and Submit stay in view on a phone too.
    fill(body, 
      h("h1", { class: "lp-exam-title" }, m.title),
      h("div", { class: "lp-exam" }, qBox, h("aside", { class: "card lp-palette" }, h("h2", null, "Questions"), palette, counts, paletteLegend())),
      h("div", { class: "lp-exam-bar" }, h("b", null, `${m.items.length} questions`), clock, h("button", { type: "button", class: "btn primary small", onclick: () => trySubmit() }, "Submit")));

    const status = (i) => {
      const answered = m.answers[i] != null, marked = !!m.marked[i];
      if (!m.visited[i]) return ["nv", "not visited"];
      if (marked && answered) return ["amr", "answered and marked for review"];
      if (marked) return ["mr", "marked for review"];
      return answered ? ["ans", "answered"] : ["na", "not answered"];
    };
    function drawPalette() {
      palette.replaceChildren(...m.items.map((_, i) => {
        const [cls, text] = status(i);
        return h("button", { type: "button", class: `lp-pal ${cls}`, "aria-current": i === m.current ? "true" : "false", "aria-label": `Question ${i + 1}, ${text}`, onclick: () => show(i) }, i + 1);
      }));
      const n = (c) => m.items.filter((_, i) => status(i)[0] === c).length;
      counts.textContent = `${n("ans") + n("amr")} answered · ${n("mr") + n("amr")} marked · ${n("na")} not answered · ${n("nv")} not visited`;
    }
    function show(i) {
      m.current = i; m.visited[i] = true; writeCurrent(m);
      const q = get(i);
      if (!q) { fill(qBox, h("p", { class: "notice error" }, "This question couldn't be made. Skip it.")); drawPalette(); return; }
      const box = inputs(q, { initial: m.answers[i] ?? null, onChange: (r) => { if (r == null) delete m.answers[i]; else m.answers[i] = r; writeCurrent(m); drawPalette(); } });
      const last = i === m.items.length - 1;
      fill(qBox, 
        h("div", { class: "row spread gate-meta" }, h("b", null, `Question ${i + 1} of ${m.items.length}`), h("span", null, TYPE_NAME[q.type], h("span", { class: "badge" }, `${q.marks} mark${q.marks > 1 ? "s" : ""}`))),
        stem(q), box.el,
        h("div", { class: "row lp-exam-actions" },
          h("button", { type: "button", class: "btn ghost small", onclick: () => { m.marked[i] = !m.marked[i]; writeCurrent(m); if (m.marked[i] && !last) show(i + 1); else drawPalette(); } }, m.marked[i] ? "Unmark" : last ? "Mark for review" : "Mark for review and next"),
          h("button", { type: "button", class: "btn ghost small", onclick: () => box.clear() }, "Clear response"),
          i > 0 ? h("button", { type: "button", class: "btn ghost small", onclick: () => show(i - 1) }, "← Previous") : null,
          h("button", { type: "button", class: "btn primary small", onclick: () => (last ? trySubmit() : show(i + 1)) }, last ? "Save and submit" : "Save and next")));
      drawPalette();
      // Bring the question's top into view, below the sticky site header.
      const head = document.querySelector(".top")?.offsetHeight ?? 0, top = qBox.getBoundingClientRect().top;
      if (top < head || top > innerHeight / 2) window.scrollTo(0, top + scrollY - head - 12);
    }
    function tick() {
      const left = Math.max(0, m.deadline - Date.now());
      const sec = Math.ceil(left / 1000), hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
      clock.textContent = `${hh ? `${hh}:` : ""}${String(mm).padStart(hh ? 2 : 1, "0")}:${String(ss).padStart(2, "0")} left`;
      clock.classList.toggle("warn", left < 5 * 60000);
      if (left <= 0) { clearInterval(timer); submit(m, true); }
    }
    function trySubmit() {
      const answered = Object.keys(m.answers).length, marked = Object.values(m.marked).filter(Boolean).length;
      if (!confirm(`Submit the test now? ${answered} of ${m.items.length} answered${marked ? `, ${marked} marked for review` : ""}. You can't change answers after this.`)) return;
      clearInterval(timer);
      submit(m, false);
    }
    clearInterval(timer);
    timer = setInterval(tick, 1000);
    tick();
    show(Math.min(m.current ?? 0, m.items.length - 1));
  }

  // --- Marking and the score report -------------------------------------------------------
  function submit(m, timeUp) {
    clearInterval(timer);
    clearCurrent();
    const now = Date.now();
    const rows = m.items.map((it, i) => {
      let q = null;
      try { q = generate(it.topic, it.seed); } catch { /* skipped below */ }
      const response = m.answers[i] ?? null;
      const answered = q && response != null;
      const { correct, score } = answered ? check(q, response) : { correct: false, score: 0 };
      return { i, q, topic: it.topic, response, answered, correct, score, marks: q?.marks ?? 0 };
    }).filter((r) => r.q);
    const score = Math.round(rows.reduce((a, r) => a + r.score, 0) * 100) / 100;
    const max = rows.reduce((a, r) => a + r.marks, 0);
    const right = rows.filter((r) => r.correct).length, wrong = rows.filter((r) => r.answered && !r.correct).length;
    const used = Math.min(now, m.deadline) - m.started;
    const each = rows.filter((r) => r.answered).length ? used / rows.filter((r) => r.answered).length : 0;
    update((s) => {
      for (const r of rows) if (r.answered) answer(s, { topic: r.topic, seed: r.q.seed, correct: r.correct, score: r.score, marks: r.marks, ms: each, src: "mock" }, now);
      recordMock(s, { kind: m.kind, roadmap: m.roadmap, stage: m.stage, title: m.title, at: now, score, max, n: rows.length, right, wrong, ms: used });
    });
    const byTopic = scoreByTopic(rows);
    fill(body, 
      header(m.title, "Your result", timeUp ? "Time ran out, so the test was submitted with the answers you'd saved." : null),
      h("section", { class: "card lp-score" },
        h("p", { class: "lp-big" }, h("b", null, score), h("span", { class: "muted" }, ` / ${max} marks`)),
        h("ul", { class: "hero-facts lp-facts" },
          h("li", null, h("b", null, right), " right"),
          h("li", null, h("b", null, wrong), " wrong"),
          h("li", null, h("b", null, rows.length - right - wrong), " not answered"),
          h("li", null, h("b", null, duration(used)), " used")),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => { if (location.pathname + location.search !== testUrl(m)) history.replaceState(null, "", testUrl(m)); render(root); } }, "Take another"), h("a", { class: "btn ghost", href: "/mock" }, "All mock tests"), wrong ? h("a", { class: "btn ghost", href: "/mistakes" }, "Mistake notebook") : null)),
      h("section", { class: "card" },
        h("h2", null, "By topic"),
        h("div", { class: "table-wrap" }, h("table", { class: "gate-table lp-table" },
          h("thead", null, h("tr", null, ["Topic", "Right", "Wrong", "Not answered", "Marks"].map((c) => h("th", null, c)))),
          h("tbody", null, byTopic.map((t) => h("tr", null, h("td", null, h("a", { href: `/gate?topic=${t.topic}` }, topicTitle(t.topic))), h("td", null, t.right), h("td", null, t.wrong), h("td", null, t.skipped), h("td", null, `${t.score} / ${t.max}`))))))),
      h("section", { class: "card" },
        h("h2", null, "Every question"),
        h("ol", { class: "lp-review-list" }, rows.map((r) => h("li", null,
          h("details", null,
            h("summary", null, h("span", { class: r.correct ? "lp-good" : r.answered ? "lp-bad" : "muted" }, r.correct ? `+${r.score}` : r.answered ? `${r.score}` : "0"), ` · Q${r.i + 1} · ${topicTitle(r.topic)}`),
            stem(r.q),
            h("p", null, `Your answer: ${answerText(r.q, r.response)}. Correct answer: ${answerText(r.q)}.`),
            solution(r.q)))))));
    window.scrollTo(0, 0);
  }
}

const seed = () => Math.floor(Math.random() * 1e9);

function paletteLegend() {
  return h("ul", { class: "lp-legend small" },
    [["nv", "Not visited"], ["na", "Not answered"], ["ans", "Answered"], ["mr", "Marked for review"], ["amr", "Answered and marked"]].map(([c, t]) => h("li", null, h("span", { class: `lp-pal ${c}`, "aria-hidden": "true" }), t)));
}
