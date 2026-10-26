import { ALGORITHMS, randomProcesses, schedule, validate } from "../engines/scheduling.js";
import { copyLink, fmt, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

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

// The animated simulation: Gantt chart, CPU, ready queue, notes and results.
export function simulation(result, processes, { compact = false } = {}) {
  const order = new Map(processes.map((p, i) => [p.id, i]));
  const total = result.makespan;
  const stage = h("div", { class: "stage" });
  const ends = result.frames.map((f, i) => (i < result.frames.length - 1 ? result.frames[i + 1].t : total));

  const draw = (i) => {
    const f = result.frames[i], now = ends[i];
    const segments = result.timeline.filter((s) => s.start < now).map((s) => ({ ...s, end: Math.min(s.end, now) }));
    // Skip axis labels that would collide; the final time always shows.
    const ticks = [...new Set(segments.flatMap((s) => [s.start, s.end]))].reduceRight((kept, t) => (kept.length && (kept[0] - t) / total < 0.045 ? kept : [t, ...kept]), []);
    const done = new Set(f.done);
    stage.replaceChildren(
      h("div", { class: "gantt", role: "img", "aria-label": `Gantt chart up to time ${now}: ${segments.map((s) => `${s.id ?? "idle"} ${s.start}-${s.end}`).join(", ")}` },
        h("div", { class: "gantt-track" }, segments.map((s) => h("div", {
          class: `seg${s.id ? "" : " idle"}${s.end === now && f.running === s.id && s.id ? " live" : ""}${order.get(s.id) >= 8 ? " hatch" : ""}`,
          style: `left:${(s.start / total) * 100}%;width:${((s.end - s.start) / total) * 100}%;${s.id ? `--c:${colour(order.get(s.id))}` : ""}`,
          title: `${s.id ?? "Idle"}: ${s.start} → ${s.end}`,
        }, s.end - s.start >= total / 40 ? s.id ?? "" : ""))),
        h("div", { class: "gantt-axis" }, ticks.map((t) => h("span", { style: `left:${(t / total) * 100}%` }, t)))),
      h("div", { class: "cpu-row" },
        h("div", { class: "cpu" }, h("span", null, `t = ${f.t}`), h("b", { style: f.running ? `--c:${colour(order.get(f.running))}` : null, class: f.running ? "busy" : "" }, f.running ?? "idle"), h("small", null, "CPU")),
        h("div", { class: "queue" }, h("small", null, "Ready queue →"), h("div", { class: "chips" }, f.ready.length ? f.ready.map((id) => h("span", { class: "chip", style: `--c:${colour(order.get(id))}` }, id, h("small", null, ` ${f.remaining[id]} left`))) : h("span", { class: "muted" }, "empty"))),
        h("div", { class: "queue" }, h("small", null, "Finished"), h("div", { class: "chips" }, f.done.length ? f.done.map((id) => h("span", { class: "chip done", style: `--c:${colour(order.get(id))}` }, id)) : h("span", { class: "muted" }, "none yet")))),
      h("ul", { class: "notes" }, (f.notes.length ? f.notes : [f.running ? `${f.running} keeps running: ${f.remaining[f.running]} unit${f.remaining[f.running] === 1 ? "" : "s"} left.` : "Waiting."]).map((n) => h("li", null, n))),
      compact ? null : results(result, done, i === result.frames.length - 1));
  };

  const player = stepper({ count: result.frames.length, render: draw, label: "Step", interval: 800 });
  return { el: h("div", { class: "sim" }, player.el, stage), player };
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
    return { id, name: spec.name, ...r.averages };
  });
  const best = Math.min(...rows.map((r) => r.wt));
  return h("section", { class: "card" }, h("h2", null, "Same processes, every algorithm"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Algorithm", "Avg waiting", "Avg turnaround", "Avg response"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "current" : null },
        h("th", { scope: "row" }, r.name, r.wt === best ? h("span", { class: "badge" }, "lowest wait") : null),
        h("td", null, fmt(r.wt)), h("td", null, fmt(r.tat)), h("td", null, fmt(r.rt))))))),
    h("p", { class: "muted small" }, "SRTF always gives the minimum average waiting time; Round Robin trades waiting time for responsiveness."));
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

  const head = page({
    subject: "Operating systems",
    title: "CPU scheduling",
    lede: "Watch the scheduler decide, tick by tick, who gets the CPU, and see where every waiting minute comes from.",
    theory: h("div", null,
      h("p", null, "When several processes are ready, the scheduler picks which one runs. ", h("b", null, "Non-preemptive"), " algorithms let a process run until it finishes; ", h("b", null, "preemptive"), " ones can take the CPU away when a better candidate arrives (SRTF, preemptive priority) or when a time slice runs out (Round Robin)."),
      h("p", null, "For each process: ", h("b", null, "Turnaround"), " = completion − arrival, ", h("b", null, "Waiting"), " = turnaround − burst, ", h("b", null, "Response"), " = first time it runs − arrival.")),
    conventions: [
      "Ties are broken by arrival time, then by order in the table.",
      "Preemptive algorithms only preempt for a strictly better process.",
      "Round Robin: a process arriving at the same moment a quantum expires joins the queue before the preempted process.",
      "Priority: by default a lower number means higher priority (you can flip it).",
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
    const error = validate(state.processes);
    if (error) { msg.replaceChildren(notice("error", error)); out.replaceChildren(); return; }
    msg.replaceChildren();
    try {
      const opts = { quantum: state.quantum, lowerIsHigher: state.lowerIsHigher };
      const result = schedule(state.processes, state.algo, opts);
      sim = simulation(result, state.processes);
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, spec.name), sim.el), comparison(state.processes, opts, state.algo));
    } catch (e) {
      msg.replaceChildren(notice("error", e.message));
      out.replaceChildren();
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, quantumIn, prioSel),
      h("div", { class: "table-wrap" }, h("table", { class: "edit" },
        h("thead", null, h("tr", null, ["Process", "Arrival", "Burst", "Priority", ""].map((t) => h("th", { scope: "col" }, t)))), tableBody)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { if (state.processes.length < 12) { state.processes.push({ id: "", arrival: 0, burst: 3, priority: 1 }); renumber(); update(); } } }, "+ Add process"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.processes = randomProcesses(); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.processes = EXAMPLE.map((p) => ({ ...p })); update(); } }, "Textbook example"),
        linkBtn),
      msg),
    out);

  // --- Practice tab ----------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  const practiceAlgo = h("select", { "aria-label": "Practice algorithm" }, h("option", { value: "any" }, "Any algorithm"), Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id }, s.name)));
  function newQuestion() {
    const r = rng();
    const algo = practiceAlgo.value === "any" ? Object.keys(ALGORITHMS)[Math.floor(r() * 6)] : practiceAlgo.value;
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
  return () => sim?.player.destroy();
}
