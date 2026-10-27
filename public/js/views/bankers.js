import { codePanel, traceLayout, varsPanel } from "../code.js";
import { EXAMPLE, EXAMPLE_REQUESTS, isSafeSequence, need, parseRequests, randomState, REQUEST_CODE, requestTimeline, SAFETY_CODE, safety, validate, vec } from "../engines/bankers.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

const R = (j) => String.fromCharCode(65 + j);
const clone = (s) => ({ allocation: s.allocation.map((r) => [...r]), max: s.max.map((r) => [...r]), available: [...s.available] });
const encode = (s) => [s.allocation, s.max].map((m) => m.map((r) => r.join(".")).join("_")).concat(s.available.join(".")).join("~");
function decode(text) {
  const [a, m, av] = text.split("~");
  const rows = (t) => t.split("_").map((r) => r.split(".").map(Number));
  return { allocation: rows(a), max: rows(m), available: av.split(".").map(Number) };
}

// Work as rows of unit blocks, one row per resource type. Units released by a
// finishing process pop in at the end of the row, in that process's colour.
function workBars(steps, i, m) {
  const st = steps[i], U = 16, G = 3, L = 34;
  const owner = Array.from({ length: m }, () => []);
  steps[0].work.forEach((v, j) => { for (let k = 0; k < v; k++) owner[j].push(null); });
  for (const s of steps.slice(1, i + 1)) if (s.released) s.released.forEach((v, j) => { for (let k = 0; k < v; k++) owner[j].push(s.checking); });
  const widest = Math.max(...owner.map((o) => o.length), 1);
  const W = Math.max(260, L + widest * (U + G) + 10);
  return h("svg", { viewBox: `0 0 ${W} ${m * 26 + 6}`, class: "work-bars", role: "img", style: `max-width:${W * 1.3}px`, "aria-label": `Work = ${vec(st.work)}` },
    owner.map((o, j) => [h("text", { x: 4, y: j * 26 + 20, class: "wb-label" }, R(j)),
      o.map((pid, k) => h("rect", { x: L + k * (U + G), y: j * 26 + 6, width: U, height: 18, rx: 4, class: `wb-unit${pid == null ? "" : " back"}`, style: pid == null ? null : `--c:var(--series-${(pid % 8) + 1})`, "data-k": `u:${j}:${k}`, "data-x": L + k * (U + G), "data-y": j * 26 + 6 },
        h("title", null, pid == null ? "free at the start" : `released by P${pid}`)))]));
}

// Matrices for one step: the row being checked is highlighted, finished rows dimmed.
function matrices(state, step) {
  const needs = need(state.max, state.allocation);
  const m = state.available.length;
  const head = (label) => [h("th", { scope: "col", colspan: m, class: "group" }, label)];
  return h("div", { class: "table-wrap" }, h("table", { class: "bank" },
    h("thead", null,
      h("tr", null, h("th", { scope: "col", rowspan: 2 }, "Process"), ...head("Allocation"), ...head("Max"), ...head("Need = Max − Allocation"), h("th", { scope: "col", rowspan: 2 }, "Finished")),
      h("tr", null, [0, 1, 2].flatMap(() => state.available.map((_, j) => h("th", { scope: "col" }, R(j)))))),
    h("tbody", null, state.allocation.map((row, i) => h("tr", {
      class: [step?.checking === i ? (step.fits ? "fits" : "waits") : "", step?.finish[i] ? "finished" : ""].join(" ").trim() || null,
    },
    h("th", { scope: "row" }, `P${i}`),
    row.map((v) => h("td", null, v)), state.max[i].map((v) => h("td", null, v)), needs[i].map((v) => h("td", { class: "need" }, v)),
    h("td", null, step?.finish[i] ? "✓" : "")))),
  ));
}

export function render(root) {
  const params = readParams();
  let state = params.get("s") ? (() => { try { return decode(params.get("s")); } catch { return clone(EXAMPLE); } })() : clone(EXAMPLE);
  let player = null;

  const head = page({
    subject: "Operating systems",
    title: "Banker's algorithm",
    lede: "Can every process still finish? Watch the safety check hand out resources and find a safe sequence, or prove there isn't one.",
    theory: h("div", null,
      h("p", null, "Each process declares the most it will ever need (", h("b", null, "Max"), "). The system tracks what it holds (", h("b", null, "Allocation"), ") and what is free (", h("b", null, "Available"), "). ", h("b", null, "Need"), " = Max − Allocation."),
      h("p", null, "The ", h("b", null, "safety check"), " pretends to run processes one at a time: any process whose Need fits in the free resources (", h("b", null, "Work"), ") can finish and give back its allocation. If everyone can finish, the state is ", h("b", null, "safe"), "."),
      h("p", null, "A ", h("b", null, "request"), " is granted only if it's within the process's Need, fits in Available, and the state after granting it is still safe.")),
    conventions: ["The safety check scans P0, P1, … in order and repeats until a full pass finishes nobody.", "Other safe sequences may exist; practice mode accepts any valid one.", "Request timeline: requests are handled in the order given; a refused request isn't retried later."],
  });

  const msg = h("div"), editor = h("div"), out = h("div", { class: "output" });
  const sizeSel = (label, value, max, onchange) => h("label", { class: "inline" }, `${label} `, h("select", { onchange: (e) => onchange(Number(e.target.value)) },
    Array.from({ length: max }, (_, i) => i + 1).map((n) => h("option", { value: n, selected: n === value }, n))));

  function resize(n, m) {
    const fit = (rows) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => rows[i]?.[j] ?? 0));
    state = { allocation: fit(state.allocation), max: fit(state.max), available: Array.from({ length: m }, (_, j) => state.available[j] ?? 0) };
    update();
  }

  function drawEditor() {
    const n = state.allocation.length, m = state.available.length;
    const cell = (matrix, i, j) => h("input", { type: "number", min: 0, max: 99, value: matrix[i][j], "aria-label": `P${i} ${R(j)}`, oninput: (e) => { matrix[i][j] = Number(e.target.value); update(false); } });
    editor.replaceChildren(
      h("div", { class: "row" },
        sizeSel("Processes", n, 10, (v) => resize(v, m)), sizeSel("Resource types", m, 6, (v) => resize(n, v)),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state = clone(EXAMPLE); update(); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state = randomState(); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("div", { class: "table-wrap" }, h("table", { class: "edit bank-edit" },
        h("thead", null, h("tr", null, h("th", { scope: "col" }, ""), state.available.map((_, j) => h("th", { scope: "col" }, `Alloc ${R(j)}`)), state.available.map((_, j) => h("th", { scope: "col" }, `Max ${R(j)}`)))),
        h("tbody", null, state.allocation.map((_, i) => h("tr", null, h("th", { scope: "row" }, `P${i}`),
          state.available.map((__, j) => h("td", null, cell(state.allocation, i, j))),
          state.available.map((__, j) => h("td", null, cell(state.max, i, j)))))))),
      h("div", { class: "row" }, h("b", null, "Available "), state.available.map((v, j) => h("label", { class: "inline" }, `${R(j)} `,
        h("input", { type: "number", min: 0, max: 99, value: v, "aria-label": `Available ${R(j)}`, oninput: (e) => { state.available[j] = Number(e.target.value); update(false); } })))));
  }

  function update(redraw = true) {
    player?.destroy();
    timelinePlayer?.destroy();
    if (redraw) drawEditor();
    writeParams({ s: encode(state), req: requestText });
    const error = validate(state);
    if (error) { msg.replaceChildren(notice("error", error)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const result = safety(state);
    const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" }), bars = h("div", { class: "chart-wrap" }), seq = h("div", { class: "row work" });
    const code = codePanel(SAFETY_CODE), vars = varsPanel();
    player = stepper({
      count: result.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const step = result.steps[i];
        const sequenceSoFar = result.sequence.slice(0, step.finish.filter(Boolean).length);
        stage.replaceChildren(matrices(state, step));
        morph(bars, workBars(result.steps, i, state.available.length));
        seq.replaceChildren(h("span", null, "Work"), h("b", { class: "vector" }, vec(step.work)),
          h("span", null, "Safe sequence so far"), h("span", { class: "chips" }, sequenceSoFar.length ? sequenceSoFar.map((p) => h("span", { class: "chip chip-in" }, `P${p}`)) : h("span", { class: "muted" }, "—")));
        note.textContent = step.note;
        note.className = `step-note${i === result.steps.length - 1 ? (result.safe ? " good" : " bad") : step.checking != null ? (step.fits ? " good" : " warn") : ""}`;
        code.show(step.line);
        vars.show(step.vars);
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Safety check"), player.el, note,
        traceLayout(h("div", null, seq, bars, h("p", { class: "muted small" }, "Work, one block per free unit. When a process finishes, the units it gives back pop in at the end in its colour.")), code, vars),
        stage),
      requestPanel(),
      timelinePanel());
  }

  function requestPanel() {
    const m = state.available.length;
    const pidSel = h("select", { "aria-label": "Requesting process" }, state.allocation.map((_, i) => h("option", { value: i }, `P${i}`)));
    const reqIns = state.available.map((_, j) => h("input", { type: "number", min: 0, max: 99, value: 0, "aria-label": `Request ${R(j)}` }));
    const result = h("div");
    return h("section", { class: "card" }, h("h2", null, "Resource request"),
      h("p", { class: "muted" }, "Ask for resources on behalf of a process and see whether the banker grants it."),
      h("div", { class: "row" }, pidSel, "requests", reqIns.map((el, j) => h("label", { class: "inline" }, `${R(j)} `, el)),
        h("button", { type: "button", class: "btn primary", onclick: () => {
          const r = request(state, Number(pidSel.value), reqIns.map((el) => Number(el.value) || 0).slice(0, m));
          result.replaceChildren(notice(r.granted ? "good" : "bad", r.reason),
            r.granted ? h("button", { type: "button", class: "btn ghost", onclick: () => { state = r.state; update(); } }, "Apply it and re-check") : null);
        } }, "Request")),
      result);
  }

  // A run of requests, each walked through the request algorithm.
  let timelinePlayer = null;
  let requestText = params.get("req") ?? EXAMPLE_REQUESTS;
  function timelinePanel() {
    const box = h("div");
    const input = h("input", { type: "text", class: "wide mono", value: requestText, "aria-label": "Requests, in order", oninput: (e) => { requestText = e.target.value; draw(); } });
    const draw = () => {
      timelinePlayer?.destroy();
      writeParams({ s: encode(state), req: requestText });
      let tl;
      try { tl = requestTimeline(state, parseRequests(requestText, state.available.length)); } catch (e) { box.replaceChildren(notice("error", e.message)); return; }
      if (!tl.steps.length) { box.replaceChildren(notice("info", "Add a request, e.g. P1 1 0 2.")); return; }
      const code = codePanel(REQUEST_CODE, { title: "Resource-request algorithm" }), vars = varsPanel();
      const note = h("p", { class: "step-note", "aria-live": "polite" }), stage = h("div"), chips = h("div", { class: "chips req-chips" });
      timelinePlayer = stepper({
        count: tl.steps.length, label: "Check", interval: 1300,
        render: (i) => {
          const st = tl.steps[i];
          stage.replaceChildren(matrices(st.state, { checking: st.pid, fits: st.outcome !== "unsafe" && st.outcome !== "wait" && st.outcome !== "error", finish: st.state.allocation.map(() => false) }),
            h("div", { class: "row work" }, h("span", null, st.pretend ? "Available (pretend)" : "Available"), h("b", { class: "vector" }, vec(st.state.available))));
          chips.replaceChildren(...tl.outcomes.map((o, k) => {
            const seen = k < st.k || k === st.k && st.outcome;
            return h("span", { class: `chip req ${seen ? o.outcome : k === st.k ? "now" : "later"}` }, `P${o.pid} ${vec(o.req)}`, seen ? h("small", null, ` ${{ granted: "✓ granted", wait: "waits", unsafe: "unsafe: waits", error: "error" }[o.outcome]}`) : null);
          }));
          note.textContent = st.note;
          note.className = `step-note${st.outcome === "granted" ? " good" : st.outcome ? " bad" : ""}`;
          code.show(st.line);
          vars.show(st.vars);
        },
      });
      box.replaceChildren(timelinePlayer.el, chips, note, traceLayout(stage, code, vars),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: () => { state = tl.final; update(); } }, "Continue from the final state")));
    };
    draw();
    return h("section", { class: "card" }, h("h2", null, "Request timeline"),
      h("p", { class: "muted" }, "A sequence of requests, handled one after another. Granted requests change the state for the next one; refused ones leave it alone."),
      h("label", { class: "stack" }, "Requests in order (e.g. P1 1 0 2; P4 3 3 0)", input), box);
  }

  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, editor, msg), out);

  // --- Practice -------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    // Make it worth solving: about 30% unsafe, and safe ones not solvable as P0, P1, P2, … in order.
    const wantUnsafe = r() < 0.3;
    let q = null;
    for (let tries = 0; tries < 400 && !q; tries++) {
      const c = randomState(r, 4 + Math.floor(r() * 2), 3);
      if (wantUnsafe) c.available = c.available.map((v) => Math.floor(v / 2));
      if (validate(c)) continue;
      const s = safety(c);
      const inOrder = s.safe && s.sequence.every((p, i) => p === i);
      if (s.safe !== wantUnsafe && !inOrder) q = c;
    }
    q ??= randomState(r, 5, 3);
    const truth = safety(q);
    const picked = [];
    const seqView = h("div", { class: "chips sequence" });
    const feedback = h("div");
    const drawSeq = () => seqView.replaceChildren(...(picked.length ? picked.map((p) => h("span", { class: "chip" }, `P${p}`)) : [h("span", { class: "muted" }, "Tap processes in the order they can finish…")]));
    const buttons = h("div", { class: "row" }, q.allocation.map((_, i) => h("button", { type: "button", class: "btn ghost", onclick: (e) => {
      if (picked.includes(i)) return;
      picked.push(i);
      e.currentTarget.disabled = true;
      drawSeq();
    } }, `P${i}`)));
    const reset = () => { picked.length = 0; buttons.querySelectorAll("button").forEach((b) => { b.disabled = false; }); drawSeq(); feedback.replaceChildren(); };
    const reveal = () => {
      const steps = h("ol", { class: "notes" }, truth.steps.map((s) => h("li", null, s.note)));
      feedback.append(steps);
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "Is this state safe?"),
      h("p", { class: "muted" }, `Available = ${vec(q.available)}. Build a safe sequence, or call it unsafe.`),
      matrices(q, null),
      buttons, seqView,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          if (picked.length !== q.allocation.length) { feedback.replaceChildren(notice("info", "Pick every process, or choose “It's unsafe”.")); return; }
          const ok = isSafeSequence(q, picked);
          feedback.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ That's a valid safe sequence." : truth.safe ? "✗ That order gets stuck: some process's Need doesn't fit in Work when its turn comes." : "✗ No order works here: the state is unsafe."));
          if (!ok) reveal();
        } }, "Check sequence"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          feedback.replaceChildren(notice(truth.safe ? "bad" : "good", truth.safe ? `✗ It's actually safe, e.g. ${truth.sequence.map((i) => `P${i}`).join(" → ")}.` : "✓ Right, it's unsafe: no process order lets everyone finish."));
          reveal();
        } }, "It's unsafe"),
        h("button", { type: "button", class: "btn ghost", onclick: reset }, "Clear")),
      feedback));
    drawSeq();
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => { player?.destroy(); timelinePlayer?.destroy(); };
}
