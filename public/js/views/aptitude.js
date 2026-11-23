import { TOPICS, fmt, makeQuestion, solve } from "../engines/aptitude.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs } from "./kit.js";
import { readNumber, simulation } from "./maths-kit.js";

// A clock face for the clock questions: hands at the given time.
function clockFace(hh, mm) {
  const C = 90, R = 76;
  const at = (deg, r) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];
  const hourDeg = 30 * (hh % 12) + 0.5 * mm, minDeg = 6 * mm;
  const [hx, hy] = at(hourDeg, R * 0.55), [mx, my] = at(minDeg, R * 0.85);
  const ticks = Array.from({ length: 12 }, (_, i) => { const [x1, y1] = at(i * 30, R - 6), [x2, y2] = at(i * 30, R); return h("line", { x1, y1, x2, y2, class: "mx-axis" }); });
  const lo = Math.min(hourDeg, minDeg), hi = Math.max(hourDeg, minDeg);
  const small = hi - lo <= 180;
  const [s1, e1] = small ? [lo, hi] : [hi, lo + 360];
  const [ax, ay] = at(s1, 30), [bx, by] = at(e1, 30);
  return h("svg", { viewBox: "0 0 180 180", class: "mx-plot mx-clock", role: "img", "aria-label": `Clock showing ${hh}:${String(mm).padStart(2, "0")}` },
    h("circle", { cx: C, cy: C, r: R, class: "mx-face" }), ticks,
    h("path", { d: `M${C},${C} L${ax},${ay} A30,30 0 0 1 ${bx},${by} Z`, class: "mx-shade" }),
    h("line", { x1: C, y1: C, x2: hx, y2: hy, class: "mx-hand hour" }), h("line", { x1: C, y1: C, x2: mx, y2: my, class: "mx-hand" }),
    h("circle", { cx: C, cy: C, r: 4, class: "mx-dot" }));
}

const answerOk = (q, raw) => {
  if (q.choices) return raw === q.answer;
  const v = readNumber(raw);
  if (v === null) return false;
  return q.exact?.isInteger() ? Math.abs(v - q.answer) < 1e-9 : Math.abs(v - q.answer) <= 0.01 + 1e-9;
};

export function render(root) {
  const p = readParams();
  const topic = TOPICS[p.get("topic")] ? p.get("topic") : "work";
  const variant = TOPICS[topic].variants[p.get("type")] ? p.get("type") : Object.keys(TOPICS[topic].variants)[0];
  const state = { topic, variant, params: {} };
  const defaults = () => Object.fromEntries(TOPICS[state.topic].variants[state.variant].params.map(([k, , d]) => [k, d]));
  state.params = defaults();
  for (const [k, , d] of TOPICS[topic].variants[variant].params) if (p.has(k)) state.params[k] = typeof d === "number" ? Number(p.get(k)) : p.get(k);
  let sim = null, timer = null;

  const head = page({
    subject: "Engineering maths",
    title: "Quantitative aptitude",
    lede: "Percentages, profit and loss, mixtures, work, speed, averages, interest, series, clocks and calendars: every question type solved step by step, then timed sets to build speed.",
    theory: h("div", null,
      h("ul", null,
        h("li", null, h("b", null, "Percentages"), ": successive changes of p% and q% give p + q + pq/100. To keep spending fixed after an r% price rise, cut use by r/(100 + r)."),
        h("li", null, h("b", null, "Profit and loss"), ": profit % is always on the cost price, discount % on the marked price. Selling two items at the same price with x% gain and x% loss always loses x²/100 %."),
        h("li", null, h("b", null, "Mixtures"), ": alligation gives cheaper : dearer = (dearer − mean) : (mean − cheaper). Replacing x of V litres n times leaves V(1 − x/V)ⁿ."),
        h("li", null, h("b", null, "Time and work"), ": add rates (jobs per day), not times. A in a days and B in b days together take ab/(a + b)."),
        h("li", null, h("b", null, "Speed"), ": average speed over equal distances is 2uv/(u + v). A train passing a platform covers its own length plus the platform's. km/h × 5/18 = m/s."),
        h("li", null, h("b", null, "Interest"), ": SI = Prt/100; compound amount P(1 + r/100)ᵗ; for 2 years CI − SI = P(r/100)²."),
        h("li", null, h("b", null, "Clocks"), ": the angle between the hands is |30h − 5.5m|. The minute hand gains 5.5° a minute, so the hands meet every 65 5/11 minutes."),
        h("li", null, h("b", null, "Calendars"), ": count odd days (days beyond whole weeks). 100 years give 5, 200 give 3, 300 give 1, 400 give 0; an ordinary year gives 1 and a leap year 2."))),
    conventions: [
      "Answers are exact fractions where possible; decimal answers are checked to within 0.01.",
      "Profit and loss percentages are on the cost price unless the question says otherwise.",
      "Compound interest is compounded once a year.",
      "Calendars use the Gregorian calendar for every year, and 0 odd days means Sunday.",
    ],
  });

  // --- Visualise ----------------------------------------------------------------------------
  const topicSel = h("select", { "aria-label": "Topic", onchange: (e) => { state.topic = e.target.value; state.variant = Object.keys(TOPICS[state.topic].variants)[0]; state.params = defaults(); drawInputs(); update(); } },
    Object.entries(TOPICS).map(([id, t]) => h("option", { value: id, selected: id === state.topic }, t.name)));
  const variantSel = h("select", { "aria-label": "Question type" });
  const inputs = h("div", { class: "row" }), msg = h("div"), out = h("div", { class: "output" });

  function drawInputs() {
    topicSel.value = state.topic;
    variantSel.replaceChildren(...Object.entries(TOPICS[state.topic].variants).map(([id, v]) => h("option", { value: id, selected: id === state.variant }, v.name)));
    variantSel.onchange = (e) => { state.variant = e.target.value; state.params = defaults(); drawInputs(); update(); };
    const v = TOPICS[state.topic].variants[state.variant];
    inputs.replaceChildren(...v.params.map(([k, label, d]) => h("label", { class: "inline" }, `${label} `,
      h("input", { type: typeof d === "number" ? "number" : "text", class: typeof d === "number" ? null : "wide", step: "any", value: state.params[k], "aria-label": label, oninput: (e) => { state.params[k] = typeof d === "number" ? Number(e.target.value) : e.target.value; update(); } }))));
  }

  function update() {
    sim?.player.destroy(); sim = null;
    writeParams({ topic: state.topic, type: state.variant, ...state.params });
    let res;
    try { res = solve(state.topic, state.variant, state.params); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const steps = res.steps.map((s, i) => ({ ...s, done: i === res.steps.length - 1 }));
    const clock = state.topic === "clock";
    const draw = (s, i) => h("div", { class: "mx-worked" },
      clock ? clockFace(state.params.h, state.variant === "angle" ? state.params.m : i === steps.length - 1 ? res.answer : 0) : null,
      h("p", { class: "mx-qtext" }, res.text),
      h("ol", { class: "mx-lines" }, steps.slice(0, i + 1).map((st, k) => h("li", { class: k === i ? "now" : null }, st.note))),
      s.done ? h("p", { class: "mx-answer-box" }, "Answer: ", h("b", null, res.display)) : null);
    sim = simulation(steps, res.code, draw, { interval: 1600 });
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, TOPICS[state.topic].variants[state.variant].name), sim.el));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, topicSel, variantSel),
      inputs,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.params = TOPICS[state.topic].variants[state.variant].random(Math.random); drawInputs(); update(); } }, "New numbers"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // --- Practice: timed sets ------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  const pTopic = h("select", { "aria-label": "Practice topic" }, h("option", { value: "mix" }, "Mixed topics"), Object.entries(TOPICS).map(([id, t]) => h("option", { value: id }, t.name)));
  const pCount = h("select", { "aria-label": "Questions in the set" }, [5, 10, 15].map((n) => h("option", { value: n, selected: n === 5 }, `${n} questions`)));
  const pTime = h("select", { "aria-label": "Time per question" }, [[45, "45 s each"], [60, "1 min each"], [90, "1.5 min each"], [120, "2 min each"], [0, "No timer"]].map(([v, t]) => h("option", { value: v, selected: v === 90 }, t)));
  const setHolder = h("div");

  function newSet() {
    clearInterval(timer); timer = null;
    const r = rng(Math.floor(Math.random() * 1e9));
    const n = Number(pCount.value), per = Number(pTime.value);
    // Avoid repeating a question type until the topic runs out of new ones.
    const used = new Set(), qs = [];
    while (qs.length < n) {
      let q;
      for (let tries = 0; tries < 12; tries++) { q = makeQuestion(r, pTopic.value === "mix" ? null : pTopic.value); if (!used.has(`${q.topic}/${q.variant}`)) break; }
      used.add(`${q.topic}/${q.variant}`);
      qs.push(q);
    }
    const fields = qs.map((q, i) => q.choices
      ? h("select", { "aria-label": `Answer ${i + 1}` }, h("option", { value: "" }, "Choose…"), q.choices.map((c) => h("option", { value: c }, c)))
      : h("input", { type: "text", inputmode: "decimal", class: "mx-answer", "aria-label": `Answer ${i + 1}`, placeholder: q.unit || "answer" }));
    const clock = h("span", { class: "mx-timer", "aria-live": "off" });
    const result = h("div");
    const start = Date.now(), limit = per * n * 1000;
    let finished = false;
    const submit = h("button", { type: "button", class: "btn primary", onclick: () => finish(false) }, "Submit set");
    const tick = () => {
      if (!limit) { clock.textContent = `${Math.floor((Date.now() - start) / 1000)} s`; return; }
      const left = Math.max(0, limit - (Date.now() - start));
      clock.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} left`;
      clock.classList.toggle("low", left < 15000);
      if (left <= 0) finish(true);
    };
    function finish(timeUp) {
      if (finished) return;
      finished = true;
      clearInterval(timer); timer = null;
      submit.disabled = true;
      let right = 0;
      qs.forEach((q, i) => {
        const ok = answerOk(q, fields[i].value.trim());
        if (ok) right++;
        fields[i].disabled = true;
        fields[i].classList.toggle("right", ok); fields[i].classList.toggle("wrong", !ok);
        items[i].append(h("details", { class: "mx-steps", open: !ok }, h("summary", null, ok ? "✓ Right: see the working" : `✗ Answer: ${q.display}`), h("ol", null, q.steps.map((s) => h("li", null, s.note)))));
      });
      const secs = Math.round((Date.now() - start) / 1000);
      result.replaceChildren(notice(right === n ? "good" : "info", `${timeUp ? "Time's up. " : ""}${right} of ${n} right in ${Math.floor(secs / 60)} min ${secs % 60} s (${fmt(secs / n, 0)} s a question).${right === n ? " 🎉" : " Open the red ones to see the working."}`),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: newSet }, "New set")));
    }
    const items = qs.map((q, i) => h("li", { class: "mx-item" }, h("p", null, h("span", { class: "muted small" }, `${TOPICS[q.topic].name} · `), q.text), h("div", { class: "row" }, fields[i], q.unit ? h("span", { class: "muted small" }, q.unit) : null)));
    setHolder.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row spread" }, h("h2", null, `${n} questions`), clock),
      h("ol", { class: "mx-set" }, items),
      h("div", { class: "row" }, submit),
      result));
    tick();
    timer = setInterval(tick, 500);
  }

  const newQuestion = () => {
    practice.replaceChildren(h("section", { class: "card inputs" },
      h("p", { class: "muted" }, "A timed set of fresh questions. Answer as many as you can, then submit (or let the clock run out) to see the score and the working. Fractions like 20/3 are fine; decimals within 0.01 count."),
      h("div", { class: "row" }, pTopic, pCount, pTime, h("button", { type: "button", class: "btn primary", onclick: newSet }, "Start a set"))), setHolder);
  };

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => { sim?.player.destroy(); clearInterval(timer); };
}
