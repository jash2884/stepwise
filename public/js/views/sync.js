import { canRun, initial, label, PRESETS, randomSequence, step } from "../engines/sync.js";
import { h, notice, page, readParams, rng, tabs, writeParams } from "../ui.js";

export function render(root) {
  const p = readParams();
  let presetId = PRESETS[p.get("preset")] ? p.get("preset") : "producer-consumer";
  let variantId = PRESETS[presetId].variants[p.get("v")] ? p.get("v") : Object.keys(PRESETS[presetId].variants)[0];
  let history = [], log = [], timer = null;

  const head = page({
    subject: "Operating systems", title: "Semaphores & synchronisation",
    lede: "You are the scheduler. Pick which process runs next and watch semaphores block and wake them, or break things on purpose to see races and deadlocks happen.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "semaphore"), " is a counter with two atomic operations. ", h("span", { class: "mono" }, "wait(S)"), " decrements it and blocks the caller if it drops below zero; ", h("span", { class: "mono" }, "signal(S)"), " increments it and wakes one blocked process if any are waiting."),
      h("p", null, "A semaphore that starts at 1 is a ", h("b", null, "mutex"), " (one process at a time). One that starts at n counts free resources, like empty buffer slots."),
      h("p", null, "Every preset has a correct version and buggy ones. Try to break the buggy ones: the page flags lost updates, mutual-exclusion violations and deadlocks the moment they happen.")),
    conventions: ["Counting semaphores: a negative value −k means k processes are blocked on it.", "signal wakes the process that has waited longest (FIFO queue).", "Each process loops its program forever."],
  });

  const presetSel = h("select", { "aria-label": "Problem", onchange: (e) => { presetId = e.target.value; variantId = Object.keys(PRESETS[presetId].variants)[0]; drawVariants(); reset(); } },
    Object.entries(PRESETS).map(([id, x]) => h("option", { value: id, selected: id === presetId }, x.name)));
  const variantSel = h("select", { "aria-label": "Version", onchange: (e) => { variantId = e.target.value; reset(); } });
  const drawVariants = () => variantSel.replaceChildren(...Object.entries(PRESETS[presetId].variants).map(([id, v]) => h("option", { value: id, selected: id === variantId }, v.name)));
  const hint = h("p", { class: "muted small" });
  const board = h("div", { class: "sync-board" });
  const banner = h("div");
  const logList = h("ol", { class: "notes log", reversed: true });
  const autoBtn = h("button", { type: "button", class: "btn ghost", onclick: () => (timer ? stopAuto() : startAuto()) }, "▶ Auto-run");

  let state;
  function reset() {
    stopAuto();
    state = initial(PRESETS[presetId].variants[variantId]);
    history = [];
    log = [];
    writeParams({ preset: presetId, v: variantId });
    hint.textContent = `Hint: ${PRESETS[presetId].hint}`;
    draw();
  }

  function run(i) {
    if (!canRun(state, i)) return;
    history.push(state);
    const r = step(state, i);
    state = r.state;
    log.unshift(r.note);
    draw();
    if (state.deadlock || state.violation) stopAuto();
  }
  function undo() {
    if (!history.length) return;
    state = history.pop();
    log.shift();
    draw();
  }
  function randomStep() {
    const ready = state.procs.map((_, i) => i).filter((i) => canRun(state, i));
    if (ready.length) run(ready[Math.floor(Math.random() * ready.length)]);
  }
  function startAuto() { timer = setInterval(randomStep, 650); autoBtn.textContent = "❚❚ Pause"; }
  function stopAuto() { clearInterval(timer); timer = null; autoBtn.textContent = "▶ Auto-run"; }

  function draw() {
    board.replaceChildren(
      h("div", { class: "procs" }, state.procs.map((pr, i) => h("section", { class: `proc ${pr.status}` },
        h("header", null, h("b", null, pr.id), pr.role ? h("small", null, pr.role) : null,
          h("span", { class: `status ${pr.status}` }, pr.status === "blocked" ? `blocked on ${pr.blockedOn}` : "ready")),
        // A blocked process is stuck inside the wait it just executed, so point there.
        h("ol", { class: "program" }, pr.program.map((op, k) => h("li", { class: k === (pr.status === "blocked" ? (pr.pc - 1 + pr.program.length) % pr.program.length : pr.pc) ? (pr.status === "blocked" ? "pc stuck" : "pc") : null }, label(op)))),
        h("button", { type: "button", class: "btn primary small", disabled: !canRun(state, i), onclick: () => run(i), title: `Shortcut: ${i + 1}` }, `Run ${pr.id}`),
        pr.rounds ? h("small", { class: "muted" }, `Completed ${pr.rounds} round${pr.rounds === 1 ? "" : "s"}`) : null))),
      h("div", { class: "shared" },
        Object.keys(state.sems).length ? h("section", null, h("h3", null, "Semaphores"),
          h("div", { class: "sems" }, Object.entries(state.sems).map(([name, s]) => h("div", { class: `sem${s.value < 0 ? " negative" : ""}` },
            h("span", { class: "mono" }, name), h("b", null, s.value), h("small", null, s.queue.length ? `waiting: ${s.queue.join(", ")}` : "nobody waiting"))))) : null,
        state.bufferSize ? h("section", null, h("h3", null, `Buffer (${state.buffer.length}/${state.bufferSize})`),
          h("div", { class: "buffer" }, Array.from({ length: state.bufferSize }, (_, k) => h("span", { class: state.buffer[k] ? "full" : "" }, state.buffer[k] ?? "")))) : null,
        Object.keys(state.vars).length ? h("section", null, h("h3", null, "Shared variables"),
          h("div", { class: "sems" }, Object.entries(state.vars).map(([k, v]) => h("div", { class: "sem" }, h("span", { class: "mono" }, k), h("b", null, v),
            k === "x" ? h("small", null, `${state.increments} increment${state.increments === 1 ? "" : "s"} completed`) : null)),
          state.procs.some((x) => x.program.some((o) => o.op === "load")) ? state.procs.map((x) => h("div", { class: "sem" }, h("span", { class: "mono" }, `${x.id}.reg`), h("b", null, x.reg))) : null)) : null,
        Object.keys(state.regions).length ? h("section", null, h("h3", null, "Inside"),
          Object.entries(state.regions).map(([k, v]) => h("p", null, h("span", { class: "mono" }, k), ": ", v.length ? v.join(", ") : h("span", { class: "muted" }, "empty")))) : null));
    banner.replaceChildren(
      state.violation ? notice("bad", `⚠️ ${state.violation}`) : null,
      state.deadlock ? notice("bad", "💀 Deadlock: every process is blocked and nobody can signal. Undo a step or reset.") : null);
    logList.replaceChildren(...log.slice(0, 14).map((n) => h("li", null, n)));
  }

  const keys = (e) => {
    if (e.target.closest("input, select, textarea")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= state.procs.length) run(n - 1);
    if (e.key === "z" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
  };
  document.addEventListener("keydown", keys);

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, presetSel, variantSel,
        h("button", { type: "button", class: "btn ghost", onclick: undo }, "↶ Undo"),
        h("button", { type: "button", class: "btn ghost", onclick: randomStep }, "Random step"),
        autoBtn,
        h("button", { type: "button", class: "btn ghost", onclick: reset }, "Reset")),
      hint, h("p", { class: "muted small" }, "Tip: press 1, 2, 3… to run that process; ⌘/Ctrl+Z to undo.")),
    banner, board,
    h("section", { class: "card" }, h("h2", null, "What happened (newest first)"), logList));

  // --- Practice: trace a sequence of wait/signal calls ------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const q = randomSequence(rng());
    const sIn = h("input", { type: "number", "aria-label": "Final S" }), tIn = h("input", { type: "number", "aria-label": "Final T" });
    const blockedPick = new Set();
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `S starts at ${q.initial.S}, T starts at ${q.initial.T}`),
      h("p", { class: "muted" }, "These calls happen in this order (a blocked process makes no further calls until it's woken):"),
      h("ol", { class: "notes mono" }, q.ops.map((o) => h("li", null, `${o.p}: ${o.kind}(${o.s})`))),
      h("div", { class: "qa" }, h("label", null, "Final value of S", sIn), h("label", null, "Final value of T", tIn)),
      h("p", null, h("b", null, "Which processes end up blocked?")),
      h("div", { class: "row" }, ["P1", "P2", "P3"].map((pid) => h("button", { type: "button", class: "btn ghost toggle", "aria-pressed": "false", onclick: (e) => {
        blockedPick.has(pid) ? blockedPick.delete(pid) : blockedPick.add(pid);
        e.currentTarget.setAttribute("aria-pressed", String(blockedPick.has(pid)));
      } }, pid))),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const okS = sIn.value !== "" && Number(sIn.value) === q.final.S, okT = tIn.value !== "" && Number(tIn.value) === q.final.T;
        const okB = [...blockedPick].sort().join() === q.blocked.join();
        mark(sIn, okS, q.final.S); mark(tIn, okT, q.final.T);
        feedback.replaceChildren(notice(okS && okT && okB ? "good" : "info",
          okS && okT && okB ? "All right! 🎉" : `${[okS, okT, okB].filter(Boolean).length} / 3 right. Final S = ${q.final.S}, T = ${q.final.T}; blocked: ${q.blocked.join(", ") || "nobody"}.`));
      } }, "Check")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Simulate"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  drawVariants();
  tab.select("visual");
  reset();
  return () => { stopAuto(); document.removeEventListener("keydown", keys); };
}
