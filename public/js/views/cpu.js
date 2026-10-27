import { codePanel, traceLayout, varsPanel } from "../code.js";
import { ALGORITHMS, EXAMPLES, randomProcesses, schedule, validate } from "../engines/scheduling.js";
import { copyLink, fmt, h, morph, notice, page, readParams, reducedMotion, rng, stepper, tabs, writeParams } from "../ui.js";
import { exampleSelect, stat } from "./kit.js";
import { viewToggle } from "../three-kit.js";

const EXAMPLE = [
  { id: "P1", arrival: 0, burst: 8, priority: 3 },
  { id: "P2", arrival: 1, burst: 4, priority: 1 },
  { id: "P3", arrival: 2, burst: 9, priority: 4 },
  { id: "P4", arrival: 3, burst: 5, priority: 2 },
];

const colour = (i) => `var(--series-${(i % 8) + 1})`;

function encode(ps) { return ps.map((p) => `${p.arrival}-${p.burst}-${p.priority}`).join("_"); }
function decode(s) {
  return s.split("_").map((part, i) => {
    const [arrival, burst, priority] = part.split("-").map(Number);
    return { id: `P${i + 1}`, arrival, burst, priority };
  });
}

// Processes as tokens: in the CPU, in a ready queue (one row per level for
// MLQ/MLFQ) or finished. Tokens are keyed so morph() glides them between places.
function queueSvg(f, result, order) {
  const TW = 40, TH = 34, GAP = 6, ROW = 64, n = order.size;
  const W = Math.max(520, 150 + n * (TW + GAP));
  const levels = result.levels;
  const H = 84 + levels.length * ROW;
  const els = [];
  const token = (id, x, y, extra = "") => h("g", { class: `tok${extra}`, "data-k": `p:${id}`, "data-x": x, "data-y": y, style: `--c:var(--series-${(order.get(id) % 8) + 1})` },
    h("rect", { x, y, width: TW, height: TH, rx: 8 }),
    h("text", { x: x + TW / 2, y: y + 15, "text-anchor": "middle", class: "tok-id" }, id),
    h("text", { x: x + TW / 2, y: y + 28, "text-anchor": "middle", class: "tok-rem" }, f.remaining[id] ? `${f.remaining[id]} left` : "done"));
  // CPU box and finished area.
  els.push(h("rect", { x: 8, y: 22, width: 64, height: 50, rx: 10, class: `q-cpu${f.running ? " busy" : ""}` }),
    h("text", { x: 40, y: 16, "text-anchor": "middle", class: "q-label" }, `CPU · t = ${f.t}`),
    h("text", { x: 96, y: 16, class: "q-label" }, "Finished"));
  if (f.running) els.push(token(f.running, 20, 30, " on-cpu"));
  else els.push(h("text", { x: 40, y: 52, "text-anchor": "middle", class: "q-idle" }, "idle"));
  f.done.forEach((id, i) => els.push(token(id, 96 + i * (TW + GAP), 30, " fin")));
  levels.forEach((name, k) => {
    const y = 96 + k * ROW;
    els.push(h("text", { x: 8, y: y - 6, class: "q-label" }, levels.length > 1 ? name : "Ready queue (front on the left)"),
      h("rect", { x: 4, y: y - 2, width: W - 8, height: TH + 4, rx: 9, class: "q-lane" }));
    f.queues[k].forEach((id, i) => els.push(token(id, 8 + i * (TW + GAP), y, "")));
    if (!f.queues[k].length) els.push(h("text", { x: 14, y: y + 22, class: "q-idle" }, "empty"));
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "q-svg", role: "img", style: `min-width:${Math.min(W, 480)}px`,
    "aria-label": `CPU: ${f.running ?? "idle"}. ${levels.map((name, k) => `${name}: ${f.queues[k].join(", ") || "empty"}`).join(". ")}. Finished: ${f.done.join(", ") || "none"}.` }, els);
}

// The animated simulation: growing Gantt chart, queues, pseudocode, variables, results.
// With a `toggle` (a viewToggle), the flat Gantt/queue view gets an optional 3D
// twin beside or instead of it; the caller wires toggle changes to mount3d().
export function simulation(result, processes, { compact = false, toggle = null } = {}) {
  const order = new Map(processes.map((p, i) => [p.id, i]));
  const total = result.makespan;
  const spec = ALGORITHMS[result.algo];
  const code = codePanel(spec.code), vars = varsPanel();
  const track = h("div", { class: "gantt-track" }), axis = h("div", { class: "gantt-axis" });
  const gantt = h("div", { class: "gantt", role: "img" }, track, axis);
  const qbox = h("div", { class: "chart-wrap q-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
  const counters = h("div", { class: "stats-row" }), table = h("div");
  const ends = result.frames.map((f, i) => (i < result.frames.length - 1 ? result.frames[i + 1].t : total));
  const segEls = new Map();

  const draw = (i) => {
    const f = result.frames[i], now = ends[i];
    const segments = result.timeline.map((s, k) => ({ ...s, k })).filter((s) => s.start < now).map((s) => ({ ...s, end: Math.min(s.end, now) }));
    // Skip axis labels that would collide; the final time always shows.
    const ticks = [...new Set(segments.flatMap((s) => [s.start, s.end]))].reduceRight((kept, t) => (kept.length && (kept[0] - t) / total < 0.045 ? kept : [t, ...kept]), []);
    gantt.setAttribute("aria-label", `Gantt chart up to time ${now}: ${segments.map((s) => `${s.id ?? "idle"} ${s.start}-${s.end}`).join(", ")}`);
    // Segments persist between steps, so their width transition makes the bars grow.
    for (const [k, el] of segEls) if (!segments.some((s) => s.k === k)) { el.remove(); segEls.delete(k); }
    for (const s of segments) {
      let el = segEls.get(s.k);
      const fresh = !el;
      if (fresh) {
        el = h("div", { class: `seg${s.id ? "" : " idle"}${order.get(s.id) >= 8 ? " hatch" : ""}`, style: `left:${(s.start / total) * 100}%;width:0;${s.id ? `--c:${colour(order.get(s.id))}` : ""}` });
        segEls.set(s.k, el);
        track.append(el);
      }
      el.title = `${s.id ?? "Idle"}: ${s.start} → ${s.end}`;
      el.textContent = s.end - s.start >= total / 40 ? s.id ?? "" : "";
      el.classList.toggle("live", s.end === now && f.running === s.id && !!s.id);
      const width = `${((s.end - s.start) / total) * 100}%`;
      if (fresh && !reducedMotion()) { el.getBoundingClientRect(); requestAnimationFrame(() => { el.style.width = width; }); } else el.style.width = width;
    }
    axis.replaceChildren(...ticks.map((t) => h("span", { style: `left:${(t / total) * 100}%` }, t)));
    morph(qbox, queueSvg(f, result, order));
    code.show(f.line);
    vars.show(f.vars);
    const last = i === result.frames.length - 1;
    note.textContent = f.note;
    note.className = `step-note${last ? " good" : ""}`;
    counters.replaceChildren(
      stat("Context switches", last ? result.contextSwitches : `${f.vars.switches} so far`),
      stat("Preemptions", spec.preemptive ? result.preemptions : "none"),
      stat("CPU utilisation", last ? `${Math.round(result.utilisation * 100)}%` : "…"),
      stat("Throughput", last ? `${fmt(result.throughput, 3)}/unit` : "…"));
    table.replaceChildren(compact ? null : results(result, new Set(f.done), last));
    d3?.show(i);
  };
  // Optional 3D view: built only when chosen, disposed on 2D and on rebuild.
  let d3 = null, gen = 0;
  const host3d = h("div", { class: "d3-host", hidden: true });
  const drop3d = () => { gen++; d3?.dispose(); d3 = null; };

  const player = stepper({ count: result.frames.length, render: draw, label: "Step", interval: 800 });
  const flat = h("div", null, gantt, qbox);
  const pair = h("div", { class: "view-pair" }, flat, host3d);
  const visual = h("div", null, pair, h("p", { class: "muted small" }, "Tokens show each process's remaining burst. They slide to the CPU when dispatched and back to a queue when preempted."));
  async function mount3d() {
    drop3d();
    if (!toggle) return;
    const my = gen, mode = toggle.mode, on = mode !== "2d";
    host3d.hidden = !on;
    flat.hidden = mode === "3d";
    pair.classList.toggle("both", mode === "both");
    if (!on) { host3d.replaceChildren(); return; }
    try {
      const { cpuScene } = await import("./cpu-3d.js");
      const sc = await cpuScene(host3d, { result, processes, height: matchMedia("(max-width: 600px)").matches ? 300 : 400 });
      if (my !== gen) { sc.dispose(); return; }
      d3 = sc;
      d3.show(player.index, true);
    } catch (e) { host3d.replaceChildren(notice("error", `3D view unavailable: ${e.message}`)); }
  }
  if (toggle && toggle.mode !== "2d") mount3d();
  return { el: h("div", { class: "sim" }, player.el, note, traceLayout(visual, code, vars), counters, table), player, mount3d, drop3d };
}

function results(result, done, finished) {
  const cell = (r, k) => (done.has(r.id) || finished ? r[k] : "…");
  return h("div", { class: "table-wrap" }, h("table", { class: "results" },
    h("thead", null, h("tr", null, ["Process", "Arrival", "Burst", "Completion (CT)", "Turnaround (TAT)", "Waiting (WT)", "Response (RT)"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, result.results.map((r) => h("tr", null, h("th", { scope: "row" }, r.id), h("td", null, r.arrival), h("td", null, r.burst),
      h("td", null, cell(r, "ct")), h("td", null, cell(r, "tat")), h("td", null, cell(r, "wt")), h("td", null, cell(r, "rt"))))),
    finished ? h("tfoot", null, h("tr", null, h("th", { scope: "row", colspan: 3 }, "Average"), h("td", null, fmt(result.averages.ct)), h("td", null, fmt(result.averages.tat)), h("td", null, fmt(result.averages.wt)), h("td", null, fmt(result.averages.rt)))) : null),
    h("p", { class: "muted small" }, "TAT = CT − Arrival · WT = TAT − Burst · RT = first time on the CPU − Arrival",
      finished ? ` · Throughput ${fmt(result.throughput, 3)} processes/unit · CPU utilisation ${Math.round(result.utilisation * 100)}%` : ""));
}

function comparison(processes, opts, current) {
  const rows = Object.entries(ALGORITHMS).map(([id, spec]) => {
    const r = schedule(processes, id, opts);
    return { id, name: spec.name, ...r.averages, cs: r.contextSwitches };
  });
  const best = Math.min(...rows.map((r) => r.wt));
  return h("section", { class: "card" }, h("h2", null, "Same processes, every algorithm"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Algorithm", "Avg waiting", "Avg turnaround", "Avg response", "Context switches"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "current" : null },
        h("th", { scope: "row" }, r.name, r.wt === best ? h("span", { class: "badge" }, "lowest wait") : null),
        h("td", null, fmt(r.wt)), h("td", null, fmt(r.tat)), h("td", null, fmt(r.rt)), h("td", null, r.cs)))))),
    h("p", { class: "muted small" }, "SRTF always gives the minimum average waiting time; Round Robin and MLFQ trade waiting time for responsiveness, at the cost of more context switches. CPU utilisation is the same for every algorithm here, because none of them leaves the CPU idle while something is ready."));
}

export function render(root) {
  const params = readParams();
  const state = {
    algo: ALGORITHMS[params.get("algo")] ? params.get("algo") : "srtf",
    quantum: Number(params.get("q")) || 2,
    lowerIsHigher: params.get("prio") !== "high",
    processes: params.get("p") ? decode(params.get("p")) : EXAMPLE.map((p) => ({ ...p })),
  };
  let sim = null;
  const toggle = viewToggle("cpu-scheduling", () => sim?.mount3d());

  const head = page({
    subject: "Operating systems",
    title: "CPU scheduling",
    lede: "Watch the scheduler decide, tick by tick, who gets the CPU, and see where every waiting minute comes from.",
    theory: h("div", null,
      h("p", null, "When several processes are ready, the scheduler picks which one runs. ", h("b", null, "Non-preemptive"), " algorithms let a process run until it finishes; ", h("b", null, "preemptive"), " ones can take the CPU away when a better candidate arrives (SRTF, preemptive priority) or when a time slice runs out (Round Robin)."),
      h("ul", null,
        h("li", null, h("b", null, "FCFS, SJF, LJF, Priority"), ": pick by arrival, shortest burst, longest burst or priority, then run to completion. SJF minimises average waiting time among non-preemptive schedules, but long jobs can starve."),
        h("li", null, h("b", null, "HRRN"), " picks the highest response ratio (waiting + burst) / burst. A job's ratio grows while it waits, so short jobs go first but long ones can't starve."),
        h("li", null, h("b", null, "SRTF / LRTF"), " are the preemptive versions of SJF / LJF: every time unit, the job with the least (most) remaining time runs."),
        h("li", null, h("b", null, "Round Robin"), " gives each process a time slice (quantum) in turn. A small quantum means good response but many context switches."),
        h("li", null, h("b", null, "Multilevel queue"), " puts each process in a fixed queue (say, system above interactive above batch). A higher queue always runs first; each queue has its own algorithm."),
        h("li", null, h("b", null, "Multilevel feedback queue"), " lets processes move: everyone starts on top, and a process that uses its whole slice is demoted. I/O-bound, interactive jobs stay on top; CPU-bound ones sink to the FCFS queue at the bottom.")),
      h("p", null, "For each process: ", h("b", null, "Turnaround"), " = completion − arrival, ", h("b", null, "Waiting"), " = turnaround − burst, ", h("b", null, "Response"), " = first time it runs − arrival. ", h("b", null, "CPU utilisation"), " = busy time ÷ total time, and every ", h("b", null, "context switch"), " (saving one process's state and loading another's) is pure overhead.")),
    conventions: [
      "Ties are broken by arrival time, then by order in the table.",
      "Preemptive algorithms only preempt for a strictly better process.",
      "Round Robin: a process arriving at the same moment a quantum expires joins the queue before the preempted process.",
      "Priority: by default a lower number means higher priority (you can flip it).",
      "HRRN: response ratio = (waiting time + burst) / burst, worked out when the CPU becomes free.",
      "Multilevel queue: the priority column is the queue number; upper queues use Round Robin, the lowest FCFS, and a higher queue preempts a lower one.",
      "MLFQ: Q0 is RR with quantum q, Q1 RR with 2q, Q2 FCFS. A process that uses its whole slice drops a level; one preempted by a higher queue keeps its level.",
      "A context switch is counted each time the CPU changes from one process to a different one; the first dispatch is free and idle gaps are skipped over.",
    ],
  });

  // --- Visualise tab --------------------------------------------------------
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id, selected: id === state.algo }, s.name)));
  const quantumIn = h("label", { class: "inline" }, "Quantum ", h("input", { type: "number", min: 1, max: 20, value: state.quantum, onchange: (e) => { state.quantum = Number(e.target.value); update(); } }));
  const prioSel = h("label", { class: "inline" }, "Priority ", h("select", { onchange: (e) => { state.lowerIsHigher = e.target.value === "low"; update(); } },
    h("option", { value: "low", selected: state.lowerIsHigher }, "lower number = higher"), h("option", { value: "high", selected: !state.lowerIsHigher }, "higher number = higher")));
  const tableBody = h("tbody");
  const msg = h("div");
  const out = h("div", { class: "output" });
  const linkBtn = h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link");

  const drawTable = () => {
    const usesPrio = ALGORITHMS[state.algo].usesPriority;
    tableBody.replaceChildren(...state.processes.map((p, i) => h("tr", null,
      h("th", { scope: "row" }, h("span", { class: "swatch", style: `--c:${colour(i)}` }), p.id),
      ...["arrival", "burst", "priority"].map((k) => h("td", { class: k === "priority" && !usesPrio ? "dim" : null },
        h("input", { type: "number", value: p[k], min: k === "burst" ? 1 : 0, max: 100, "aria-label": `${p.id} ${k}`, oninput: (e) => { p[k] = Number(e.target.value); update(false); } }))),
      h("td", null, h("button", { type: "button", class: "icon", "aria-label": `Remove ${p.id}`, disabled: state.processes.length === 1, onclick: () => { state.processes.splice(i, 1); renumber(); update(); } }, "×")))));
  };
  const renumber = () => state.processes.forEach((p, i) => { p.id = `P${i + 1}`; });

  function update(redrawTable = true) {
    const spec = ALGORITHMS[state.algo];
    quantumIn.hidden = !spec.usesQuantum;
    prioSel.hidden = !spec.usesPriority;
    if (redrawTable) drawTable();
    writeParams({ algo: state.algo, q: state.quantum, prio: state.lowerIsHigher ? "low" : "high", p: encode(state.processes) });
    sim?.player.destroy();
    sim?.drop3d();
    const error = validate(state.processes);
    if (error) { msg.replaceChildren(notice("error", error)); out.replaceChildren(); return; }
    msg.replaceChildren();
    try {
      const opts = { quantum: state.quantum, lowerIsHigher: state.lowerIsHigher };
      const result = schedule(state.processes, state.algo, opts);
      sim = simulation(result, state.processes, { toggle });
      out.replaceChildren(h("section", { class: "card" }, h("div", { class: "d3-head" }, h("h2", null, spec.name), toggle.el), sim.el), comparison(state.processes, opts, state.algo));
    } catch (e) {
      msg.replaceChildren(notice("error", e.message));
      out.replaceChildren();
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, quantumIn, prioSel),
      h("div", { class: "table-wrap" }, h("table", { class: "edit" },
        h("thead", null, h("tr", null, ["Process", "Arrival", "Burst", "Priority / queue", ""].map((t) => h("th", { scope: "col" }, t)))), tableBody)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { if (state.processes.length < 12) { state.processes.push({ id: "", arrival: 0, burst: 3, priority: 1 }); renumber(); update(); } } }, "+ Add process"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.processes = randomProcesses(); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.processes = EXAMPLE.map((p) => ({ ...p })); update(); } }, "Textbook example"),
        exampleSelect(EXAMPLES, (ex, k) => { state.processes = ex.processes.map((p, i) => ({ ...p, id: `P${i + 1}` })); if (k === "mlq" || k === "mlfq" || k === "hrrn") state.algo = k; algoSel.value = state.algo; update(); }),
        linkBtn),
      msg),
    out);

  // --- Practice tab ----------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  const practiceAlgo = h("select", { "aria-label": "Practice algorithm" }, h("option", { value: "any" }, "Any algorithm"), Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id }, s.name)));
  function newQuestion() {
    const r = rng();
    const algo = practiceAlgo.value === "any" ? Object.keys(ALGORITHMS)[Math.floor(r() * Object.keys(ALGORITHMS).length)] : practiceAlgo.value;
    const processes = randomProcesses(r);
    const quantum = 2 + Math.floor(r() * 2);
    const result = schedule(processes, algo, { quantum });
    const inputs = new Map();
    const field = (id, k) => { const el = h("input", { type: "number", class: "answer", "aria-label": `${id} ${k}` }); inputs.set(`${id}.${k}`, el); return el; };
    const score = h("p", { class: "score", "aria-live": "polite" });
    const solution = h("div");
    practice.replaceChildren(
      h("section", { class: "card" },
        h("div", { class: "row" }, practiceAlgo, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
        h("h2", null, `Schedule these with ${ALGORITHMS[algo].name}${ALGORITHMS[algo].usesQuantum ? `, quantum ${quantum}` : ""}`),
        h("p", { class: "muted" }, "Work out completion, turnaround and waiting time for each process.", ALGORITHMS[algo].usesPriority ? " Lower priority number = higher priority." : ""),
        h("div", { class: "table-wrap" }, h("table", { class: "edit" },
          h("thead", null, h("tr", null, ["Process", "Arrival", "Burst", ALGORITHMS[algo].usesPriority ? "Priority" : null, "CT", "TAT", "WT"].filter(Boolean).map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, processes.map((p) => h("tr", null, h("th", { scope: "row" }, p.id), h("td", null, p.arrival), h("td", null, p.burst),
            ALGORITHMS[algo].usesPriority ? h("td", null, p.priority) : null,
            h("td", null, field(p.id, "ct")), h("td", null, field(p.id, "tat")), h("td", null, field(p.id, "wt"))))))),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn primary", onclick: check }, "Check answers"),
          h("button", { type: "button", class: "btn ghost", onclick: () => { solution.replaceChildren(simulation(result, processes).el); } }, "Show solution")),
        score),
      solution);
    function check() {
      let right = 0;
      for (const r of result.results) for (const k of ["ct", "tat", "wt"]) {
        const el = inputs.get(`${r.id}.${k}`);
        const ok = el.value !== "" && Number(el.value) === r[k];
        el.classList.toggle("right", ok);
        el.classList.toggle("wrong", !ok);
        el.title = ok ? "Correct" : `Expected ${r[k]}`;
        if (ok) right++;
      }
      const total = result.results.length * 3;
      score.textContent = right === total ? `All ${total} correct! 🎉` : `${right} / ${total} correct. Red cells are wrong; hover them for the answer, or open the solution.`;
    }
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => { sim?.player.destroy(); sim?.drop3d(); };
}
