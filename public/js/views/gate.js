// GATE practice: endless GATE-format questions (MCQ, MSQ, NAT) made by the
// visualisers' own engines, marked the GATE way, each with a worked solution
// and a link that replays it step by step. Progress stays on this device.
import { TOPICS, check, generate, topicOf } from "../gate-questions.js";
import { SUBJECTS } from "../tools.js";
import { h, readParams, writeParams } from "../ui.js";

const KEY = "stepwise.gate";
const TYPE_NAME = { mcq: "MCQ · one correct option", msq: "MSQ · one or more correct options", nat: "NAT · type the number" };
const LETTERS = "ABCD";

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (stats) => { try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* private mode */ } };
const newSeed = () => Math.floor(Math.random() * 1e9);

function block(b) {
  if (typeof b === "string") return h("p", null, b);
  return h("div", { class: "table-wrap" }, h("table", { class: "gate-table" },
    h("thead", null, h("tr", null, b.table.head.map((c) => h("th", null, c)))),
    h("tbody", null, b.table.rows.map((row) => h("tr", null, row.map((c) => h("td", null, c)))))));
}

export function render(root) {
  const params = readParams();
  const stats = load();
  const session = { score: 0, max: 0, done: 0, right: 0 };
  let topic = topicOf(params.get("topic")) ? params.get("topic") : "mix";
  let seed = Number(params.get("seed")) || newSeed();
  let current = null;

  const head = h("header", { class: "tool-head" },
    h("p", { class: "eyebrow" }, "GATE CS practice"),
    h("h1", null, "GATE-style questions, with every step shown"),
    h("p", { class: "lede" }, "Fresh questions in the GATE formats, made by the same engines as the visualisers, so every answer is worked out rather than typed in. Marked the GATE way, with a full solution and a replay you can step through."));

  // --- Topic picker -----------------------------------------------------------------
  const pickerBtn = (id, label) => h("button", { type: "button", class: "btn ghost small toggle", "data-topic": id, "aria-pressed": String(id === topic), onclick: () => choose(id) }, label);
  const picker = h("div", { class: "card gate-picker" },
    h("div", { class: "row" }, pickerBtn("mix", "Mixed (all topics)")),
    ["os", "dbms"].map((sid) => h("div", { class: "gate-group" },
      h("span", { class: "gate-subject" }, SUBJECTS.find((s) => s.id === sid).short),
      h("div", { class: "row" }, TOPICS.filter((t) => t.subject === sid).map((t) => pickerBtn(t.slug, t.title))))));

  function choose(id) {
    topic = id;
    picker.querySelectorAll("[data-topic]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === id)));
    next();
  }

  // --- Question -----------------------------------------------------------------------
  const qCard = h("section", { class: "card gate-q", "aria-live": "polite" });
  const statsCard = h("aside", { class: "card gate-stats" });

  function next() {
    seed = newSeed();
    show();
  }

  function show() {
    const slug = topic === "mix" ? TOPICS[seed % TOPICS.length].slug : topic;
    writeParams({ topic, seed });
    try { current = generate(slug, seed); } catch (err) { qCard.replaceChildren(h("p", { class: "notice error" }, err.message)); return; }
    const q = current, info = topicOf(slug);
    let chosen = q.type === "msq" ? new Set() : null;

    const opts = q.options ? h("div", { class: "gate-options", role: q.type === "mcq" ? "radiogroup" : "group", "aria-label": "Options" }, q.options.map((o, i) =>
      h("button", { type: "button", class: "gate-opt", "data-i": i, role: q.type === "mcq" ? "radio" : "checkbox", "aria-checked": "false", onclick: (e) => {
        if (q.type === "mcq") chosen = i; else if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
        opts.querySelectorAll(".gate-opt").forEach((b) => b.setAttribute("aria-checked", String(q.type === "mcq" ? Number(b.dataset.i) === chosen : chosen.has(Number(b.dataset.i)))));
        submit.disabled = q.type === "msq" && !chosen.size;
        e.currentTarget.focus();
      } }, h("b", null, LETTERS[i]), h("span", null, o)))) : null;
    const nat = q.type === "nat" ? h("input", { type: "text", inputmode: "decimal", class: "gate-nat", "aria-label": "Your answer", autocomplete: "off", placeholder: "Your answer", oninput: () => { submit.disabled = !nat.value.trim(); }, onkeydown: (e) => { if (e.key === "Enter" && !submit.disabled) { e.preventDefault(); submit.click(); } } }) : null;
    const submit = h("button", { type: "button", class: "btn primary", disabled: true, onclick: mark }, "Check answer");
    const skip = h("button", { type: "button", class: "btn ghost", onclick: next }, "Skip");
    const result = h("div");

    qCard.replaceChildren(...[
      h("div", { class: "row spread gate-meta" },
        h("span", null, h("a", { href: `/${slug}` }, info.title), ` · ${TYPE_NAME[q.type]}`),
        h("span", { class: "badge" }, `${q.marks} mark${q.marks > 1 ? "s" : ""}`)),
      h("div", { class: "gate-stem" }, q.stem.map(block)),
      opts, nat,
      h("div", { class: "row" }, submit, skip),
      result,
    ].filter(Boolean));
    if (nat) nat.focus({ preventScroll: true });

    function mark() {
      const response = q.type === "nat" ? Number(nat.value.trim().replace(/,/g, "")) : q.type === "mcq" ? chosen : [...chosen];
      if (q.type === "mcq" && response === null) return;
      const { correct, score } = check(q, response);
      session.done++; session.max += q.marks; session.score += score; if (correct) session.right++;
      const s = (stats[slug] ??= { right: 0, total: 0 });
      s.total++; if (correct) s.right++;
      save(stats);
      drawStats();

      submit.disabled = true; skip.remove();
      if (nat) nat.readOnly = true;
      if (opts) opts.querySelectorAll(".gate-opt").forEach((b) => {
        const i = Number(b.dataset.i), right = q.type === "mcq" ? i === q.answer : q.answer.includes(i);
        b.disabled = true;
        b.classList.add(right ? "right" : b.getAttribute("aria-checked") === "true" ? "wrong" : "plain");
      });
      const answerText = q.type === "nat" ? String(q.answer) : q.type === "mcq" ? LETTERS[q.answer] : q.answer.map((i) => LETTERS[i]).join(", ");
      const nextBtn = h("button", { type: "button", class: "btn primary", onclick: next }, "Next question →");
      result.replaceChildren(
        h("p", { class: `notice ${correct ? "good" : "bad"}`, tabindex: "-1" },
          correct ? `Correct: +${q.marks}` : `Not quite. The answer is ${answerText}. ${score < 0 ? `GATE marking: ${score}.` : "No negative marks for this format."}`),
        h("div", { class: "gate-solution" }, h("h2", null, "Solution"), q.solution.map(block)),
        h("div", { class: "row" },
          nextBtn,
          h("a", { class: "btn ghost", href: q.replay }, "Watch it step by step"),
          h("button", { type: "button", class: "btn ghost", onclick: (e) => { navigator.clipboard?.writeText(location.href).then(() => { e.target.textContent = "Link copied ✓"; }).catch(() => {}); } }, "Share this question")));
      // Focus the verdict, not Next: an Enter still in flight would skip the solution.
      result.firstChild.focus({ preventScroll: true });
    }
  }

  // --- Progress -------------------------------------------------------------------------
  function drawStats() {
    const tried = TOPICS.filter((t) => stats[t.slug]?.total);
    const pct = (s) => Math.round((100 * s.right) / s.total);
    const weakest = tried.filter((t) => stats[t.slug].total >= 3).sort((a, b) => pct(stats[a.slug]) - pct(stats[b.slug]))[0];
    statsCard.replaceChildren(...[
      h("h2", null, "Your progress"),
      session.done ? h("p", { class: "gate-score" }, h("b", null, `${Math.round(session.score * 100) / 100}`), h("span", { class: "muted" }, ` / ${session.max} marks this session · ${session.right} of ${session.done} right`))
        : h("p", { class: "muted small" }, "Answer a question to start tracking. Progress is saved on this device only."),
      tried.length ? h("ul", { class: "gate-bars" }, tried.map((t) => {
        const s = stats[t.slug], p = pct(s);
        return h("li", null,
          h("span", { class: "gate-bar-label" }, t.title, h("span", { class: "muted" }, ` ${s.right}/${s.total}`)),
          h("span", { class: "gate-bar", role: "img", "aria-label": `${p}% correct` }, h("i", { style: `width:${Math.max(p, 2)}%` })),
          h("span", { class: "gate-pct" }, `${p}%`));
      })) : null,
      weakest && pct(stats[weakest.slug]) < 100 ? h("button", { type: "button", class: "btn ghost small", onclick: () => choose(weakest.slug) }, `Practise your weakest: ${weakest.title}`) : null,
      tried.length ? h("button", { type: "button", class: "btn ghost small gate-reset", onclick: () => { for (const k of Object.keys(stats)) delete stats[k]; save(stats); drawStats(); } }, "Reset progress") : null,
    ].filter(Boolean));
  }

  const about = h("details", { class: "theory" },
    h("summary", null, "How GATE marks these"),
    h("ul", null,
      h("li", null, h("b", null, "MCQ"), ": one correct option. A wrong answer costs a third of the question's marks."),
      h("li", null, h("b", null, "MSQ"), ": one or more correct options. You score only if you pick exactly the right ones; no negative marks."),
      h("li", null, h("b", null, "NAT"), ": type a number. No negative marks; answers asked to two decimal places accept ±0.01.")),
    h("p", { class: "muted small" }, "These are original questions in the GATE style, not past papers. For solved past-paper questions, ", h("a", { href: "https://gateoverflow.in", target: "_blank", rel: "noopener" }, "GATE Overflow"), " is the best free archive."));

  root.replaceChildren(h("div", { class: "tool gate" }, head, picker, h("div", { class: "gate-layout" }, qCard, statsCard), about));
  drawStats();
  show();
}
