import { analyse, EXAMPLES, parseGraph, randomGraph } from "../engines/deadlock.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

const vec = (v) => `(${v.join(", ")})`;

// Processes across the top, resources across the bottom (with one dot per instance).
export function ragSvg(graph, { deadlocked = [], cycle = null } = {}) {
  const W = 640, cols = Math.max(graph.processes.length, graph.resources.length);
  const gap = Math.min(150, (W - 80) / Math.max(cols - 1, 1));
  const px = (i, n) => W / 2 + (i - (n - 1) / 2) * gap;
  const P = new Map(graph.processes.map((p, i) => [p, { x: px(i, graph.processes.length), y: 56 }]));
  const R = new Map(graph.resources.map((r, i) => [r, { x: px(i, graph.resources.length), y: 214 }]));
  const dead = new Set(deadlocked);
  const inCycle = new Set(cycle ?? []);
  const used = new Map(); // instance dots already assigned, per resource
  const edges = graph.edges.map((e) => {
    if (e.kind === "request") {
      const a = P.get(e.from), b = R.get(e.to);
      return h("line", { x1: a.x, y1: a.y + 24, x2: b.x, y2: b.y - 26, class: "rag-edge request", "marker-end": "url(#rag-arrow)" }, h("title", null, `${e.from} requests ${e.to}`));
    }
    const r = R.get(e.from), p = P.get(e.to), k = used.get(e.from) ?? 0;
    used.set(e.from, k + 1);
    const n = graph.instances[e.from];
    const dotX = r.x + (k - (n - 1) / 2) * 14;
    return h("line", { x1: dotX, y1: r.y - 6, x2: p.x, y2: p.y + 24, class: "rag-edge assign", "marker-end": "url(#rag-arrow)" }, h("title", null, `${e.from} is held by ${e.to}`));
  });
  return h("svg", { viewBox: `0 0 ${W} 270`, class: "rag", role: "img", "aria-label": `Resource-allocation graph. ${graph.edges.map((e) => (e.kind === "request" ? `${e.from} requests ${e.to}` : `${e.from} held by ${e.to}`)).join(". ")}.` },
    h("defs", null, h("marker", { id: "rag-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "arrowhead" }))),
    edges,
    graph.processes.map((p) => { const { x, y } = P.get(p); return h("g", { class: `rag-node process${dead.has(p) ? " dead" : ""}${inCycle.has(p) ? " cycle" : ""}` }, h("circle", { cx: x, cy: y, r: 24 }), h("text", { x, y: y + 5, "text-anchor": "middle" }, p)); }),
    graph.resources.map((r) => {
      const { x, y } = R.get(r), n = graph.instances[r], w = Math.max(56, n * 14 + 22);
      return h("g", { class: "rag-node resource" }, h("rect", { x: x - w / 2, y: y - 24, width: w, height: 48, rx: 8 }),
        Array.from({ length: n }, (_, k) => h("circle", { cx: x + (k - (n - 1) / 2) * 14, cy: y - 6, r: 4, class: "dot" })),
        h("text", { x, y: y + 16, "text-anchor": "middle" }, r));
    }));
}

function matrixTable(graph, result, step) {
  const head = (label) => graph.resources.map((r) => h("th", { scope: "col" }, r));
  return h("div", { class: "table-wrap" }, h("table", { class: "bank" },
    h("thead", null,
      h("tr", null, h("th", { scope: "col", rowspan: 2 }, "Process"), h("th", { scope: "col", colspan: graph.resources.length, class: "group" }, "Allocation (held)"), h("th", { scope: "col", colspan: graph.resources.length, class: "group" }, "Request (waiting for)"), h("th", { scope: "col", rowspan: 2 }, "Finished")),
      h("tr", null, head(), head())),
    h("tbody", null, graph.processes.map((p, i) => h("tr", { class: [step?.checking === i ? (step.fits ? "fits" : "waits") : "", step?.finish[i] ? "finished" : ""].join(" ").trim() || null },
      h("th", { scope: "row" }, p), result.allocation[i].map((v) => h("td", null, v)), result.request[i].map((v) => h("td", { class: "need" }, v)), h("td", null, step?.finish[i] ? "✓" : ""))))));
}

export function render(root) {
  const p = readParams();
  const state = { resources: p.get("res") ?? EXAMPLES.book.resources, edges: (p.get("e") ?? EXAMPLES.book.edges).replace(/;/g, "\n") };
  let player = null;
  const head = page({
    subject: "Operating systems", title: "Deadlock detection",
    lede: "Describe who holds what and who is waiting for what. Then see whether the processes are stuck forever, and why.",
    theory: h("div", null,
      h("p", null, "In a ", h("b", null, "resource-allocation graph"), ", an arrow ", h("span", { class: "mono" }, "P → R"), " means P is waiting for R (a request); ", h("span", { class: "mono" }, "R → P"), " means P holds one instance of R (an assignment)."),
      h("p", null, "If every resource has one instance, a ", h("b", null, "cycle"), " means deadlock. With several instances a cycle is only a warning sign, so the ", h("b", null, "detection algorithm"), " decides: it lets any process whose requests can be met finish and release what it holds, and whoever is left can never finish.")),
    conventions: ["Write resources as R1:2 (resource R1 with 2 instances).", "Write one edge per line: P1 -> R1 for a request, R1 -> P1 for an assignment.", "Processes holding nothing are never counted as deadlocked."],
  });

  const exampleSel = h("select", { "aria-label": "Example", onchange: (e) => { if (!e.target.value) return; const ex = EXAMPLES[e.target.value]; state.resources = ex.resources; state.edges = ex.edges; resIn.value = ex.resources; edgesIn.value = ex.edges; e.target.value = ""; update(); } },
    h("option", { value: "" }, "Load an example…"), Object.entries(EXAMPLES).map(([k, v]) => h("option", { value: k }, v.name)));
  const resIn = h("input", { type: "text", class: "wide mono", value: state.resources, "aria-label": "Resources and instance counts", oninput: (e) => { state.resources = e.target.value; update(); } });
  const edgesIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Edges", oninput: (e) => { state.edges = e.target.value; update(); } }, state.edges);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ res: state.resources, e: state.edges.split("\n").map((l) => l.trim()).filter(Boolean).join(";") });
    let graph;
    try { graph = parseGraph(state.resources, state.edges); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    if (!graph.processes.length) { msg.replaceChildren(notice("info", "Add some edges to connect processes and resources.")); out.replaceChildren(); return; }
    msg.replaceChildren();
    const result = analyse(graph);
    const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" }), work = h("div", { class: "row work" });
    player = stepper({
      count: result.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = result.steps[i];
        stage.replaceChildren(matrixTable(graph, result, st));
        work.replaceChildren(h("span", null, "Available"), h("b", { class: "vector" }, vec(result.available)), h("span", null, "Work"), h("b", { class: "vector" }, vec(st.work)));
        note.textContent = st.note;
        note.className = `step-note${i === result.steps.length - 1 ? (result.deadlocked.length ? " bad" : " good") : ""}`;
      },
    });
    const wf = result.waitFor;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Resource-allocation graph"),
        h("div", { class: "chart-wrap" }, ragSvg(graph, { deadlocked: result.deadlocked, cycle: wf.cycle })),
        h("p", { class: "legend muted small" }, h("span", { class: "key-req" }, "→ request (waiting)"), " · ", h("span", { class: "key-asg" }, "→ assignment (holding)"), " · dots are resource instances"),
        notice(result.deadlocked.length ? "bad" : wf.cycle ? "info" : "good", result.verdict)),
      h("div", { class: "grid-2" },
        h("section", { class: "card" }, h("h2", null, "Detection algorithm"), player.el, work, stage, note),
        h("section", { class: "card" }, h("h2", null, "Wait-for graph"),
          h("p", { class: "muted" }, "Remove the resources: Pi → Pj means Pi is waiting for something Pj holds."),
          wf.edges.length ? h("ul", { class: "notes" }, wf.edges.map((e) => h("li", { class: wf.cycle?.includes(e.from) && wf.cycle?.includes(e.to) ? "cycle-edge" : null }, h("span", { class: "mono" }, `${e.from} → ${e.to}`), ` (waiting for ${e.via})`))) : h("p", null, "Nobody is waiting on anybody."),
          wf.cycle ? h("p", { class: "big-answer" }, "Cycle: ", h("b", null, wf.cycle.join(" → "))) : h("p", { class: "big-answer" }, "No cycle"),
          h("p", { class: "muted small" }, wf.singleInstance ? "Every resource has a single instance, so a cycle here is exactly a deadlock." : "Some resource has several instances, so trust the detection algorithm over the cycle."))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { const g = randomGraph(); state.resources = g.resources; state.edges = g.edges; resIn.value = g.resources; edgesIn.value = g.edges; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Resources (name:instances)", resIn),
      h("label", { class: "stack" }, "Edges (P1 -> R1 requests, R1 -> P1 holds)", edgesIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let g, res;
    for (let k = 0; k < 50; k++) {
      const q = randomGraph(r);
      try { g = parseGraph(q.resources, q.edges); } catch { continue; }
      if (g.processes.length < 2) continue;
      res = analyse(g);
      if (r() < 0.5 ? res.deadlocked.length : true) break;
    }
    const picked = new Set();
    const chips = h("div", { class: "row" }, g.processes.map((pid) => h("button", { type: "button", class: "btn ghost toggle", "aria-pressed": "false", onclick: (e) => {
      picked.has(pid) ? picked.delete(pid) : picked.add(pid);
      e.currentTarget.setAttribute("aria-pressed", String(picked.has(pid)));
    } }, pid)));
    const feedback = h("div");
    const check = (none) => {
      const truth = [...res.deadlocked].sort().join(",");
      const given = none ? "" : [...picked].sort().join(",");
      const ok = truth === given;
      feedback.replaceChildren(notice(ok ? "good" : "bad", ok ? `✓ Right. ${res.verdict}` : `✗ Not quite. ${res.verdict}`));
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "Which processes are deadlocked?"),
      h("div", { class: "chart-wrap" }, ragSvg(g)),
      h("p", { class: "muted" }, `Instances: ${g.resources.map((x) => `${x} × ${g.instances[x]}`).join(", ")}. Select every deadlocked process, or say there's no deadlock.`),
      chips,
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => check(false) }, "Check"), h("button", { type: "button", class: "btn ghost", onclick: () => check(true) }, "No deadlock")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}
