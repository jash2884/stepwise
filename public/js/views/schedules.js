import { analyse, EXAMPLES, opText, randomSchedule } from "../engines/schedules.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// The textbook layout: one column per transaction, time going down.
function grid(r, highlight = []) {
  const hi = new Set(highlight);
  return h("div", { class: "table-wrap" }, h("table", { class: "schedule-grid" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Time"), r.txns.map((t) => h("th", { scope: "col" }, `T${t}`)))),
    h("tbody", null, r.ops.map((o, i) => h("tr", null, h("th", { scope: "row" }, i + 1),
      r.txns.map((t) => h("td", { class: t === o.t ? (hi.has(o.i) ? "op hot" : `op ${o.kind === "W" ? "write" : o.kind === "R" ? "read" : "end"}`) : null }, t === o.t ? opText(o) : "")))))));
}

// Precedence graph with transactions on a circle; edges appear as they're found.
export function precedenceSvg(txns, edges, { cycle = null, latest = null } = {}) {
  const W = 300, Hh = 230, cx = W / 2, cy = Hh / 2, R = txns.length > 2 ? 80 : 70;
  const pos = new Map(txns.map((t, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / txns.length;
    return [t, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }];
  }));
  const inCycle = (e) => cycle && cycle.some((t, i) => i < cycle.length - 1 && t === e.from && cycle[i + 1] === e.to);
  return h("svg", { viewBox: `0 0 ${W} ${Hh}`, class: "precedence", role: "img", "aria-label": `Precedence graph: ${edges.map((e) => `T${e.from} → T${e.to}`).join(", ") || "no edges"}` },
    h("defs", null, h("marker", { id: "pg-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "arrowhead" }))),
    edges.map((e) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      const back = edges.some((x) => x.from === e.to && x.to === e.from);
      // Offset two-way edges so both arrows are visible.
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ox = back ? (-dy / len) * 8 : 0, oy = back ? (dx / len) * 8 : 0;
      const r = 22;
      return h("line", { x1: a.x + (dx / len) * r + ox, y1: a.y + (dy / len) * r + oy, x2: b.x - (dx / len) * r + ox, y2: b.y - (dy / len) * r + oy,
        class: `pg-edge${inCycle(e) ? " cycle" : ""}${latest && latest.from === e.from && latest.to === e.to ? " latest" : ""}`, "marker-end": "url(#pg-arrow)" });
    }),
    txns.map((t) => { const { x, y } = pos.get(t); return h("g", { class: `pg-node${cycle?.includes(t) ? " cycle" : ""}` }, h("circle", { cx: x, cy: y, r: 22 }), h("text", { x, y: y + 5, "text-anchor": "middle" }, `T${t}`)); }));
}

const verdict = (ok, yes, no) => h("li", { class: ok ? "ok" : "no" }, h("b", null, ok ? `✓ ${yes}` : `✗ ${no}`));

export function render(root) {
  const p = readParams();
  const state = { text: p.get("s") ?? EXAMPLES[2][1] };
  let player = null;
  const head = page({
    subject: "Databases", title: "Serialisability",
    lede: "Is an interleaved schedule as good as running the transactions one after another? Find the conflicts, draw the precedence graph, and check recoverability.",
    theory: h("div", null,
      h("p", null, "Two operations ", h("b", null, "conflict"), " if they come from different transactions, touch the same item, and at least one is a write. Each conflict gives an edge ", h("span", { class: "mono" }, "Ti → Tj"), " (Ti's operation came first)."),
      h("p", null, "A schedule is ", h("b", null, "conflict-serialisable"), " exactly when this precedence graph has no cycle; a topological order of the graph is an equivalent serial schedule. ", h("b", null, "View serialisability"), " is weaker: it can also hold with a cycle when there are blind writes."),
      h("p", null, h("b", null, "Recoverable"), ": nobody commits before the transactions they read from. ", h("b", null, "Cascadeless"), ": nobody reads uncommitted data. ", h("b", null, "Strict"), ": nobody reads or overwrites uncommitted data.")),
    conventions: ["Write operations like R1(A) W2(B) C1 A2 (A = abort), separated by spaces.", "Serial orders prefer the lowest-numbered transaction when several are possible.", "Recoverability needs a commit or abort for every transaction."],
  });

  const input = h("input", { type: "text", class: "wide mono", value: state.text, "aria-label": "Schedule", oninput: (e) => { state.text = e.target.value; update(); } });
  const exampleSel = h("select", { "aria-label": "Example", onchange: (e) => { if (e.target.value === "") return; state.text = EXAMPLES[Number(e.target.value)][1]; input.value = state.text; e.target.value = ""; update(); } },
    h("option", { value: "" }, "Load an example…"), EXAMPLES.map(([name], i) => h("option", { value: i }, name)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ s: state.text });
    let r;
    try { r = analyse(state.text); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const sched = h("div"), graph = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const count = r.steps.length + 1;
    player = stepper({
      count, label: "Step", interval: 1100,
      render: (i) => {
        const shown = r.steps.slice(0, i);
        const edges = [];
        for (const s of shown) if (!edges.some((e) => e.from === s.pair.from && e.to === s.pair.to)) edges.push({ from: s.pair.from, to: s.pair.to });
        const last = shown.at(-1);
        sched.replaceChildren(grid(r, last ? [last.pair.a.i, last.pair.b.i] : []));
        const done = i === count - 1;
        graph.replaceChildren(precedenceSvg(r.txns, edges, { cycle: done ? r.cycle : null, latest: last?.pair }));
        note.textContent = i === 0 ? (r.pairs.length ? "Scan every pair of operations for conflicts." : "No two operations conflict, so the graph has no edges.") : last.note;
        if (done) note.textContent += r.cycle ? ` Done: the cycle ${r.cycle.map((t) => `T${t}`).join(" → ")} means it is NOT conflict-serialisable.` : ` Done: no cycle, so it is conflict-serialisable as ${r.order.map((t) => `T${t}`).join(" → ")}.`;
        note.className = `step-note${done ? (r.cycle ? " bad" : " good") : ""}`;
      },
    });
    const rec = r.recovery;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Conflicts and the precedence graph"), player.el,
        h("div", { class: "grid-2 tight" }, sched, graph), note),
      h("section", { class: "card" }, h("h2", null, "Verdict"),
        h("ul", { class: "ladder" },
          verdict(r.conflictSerializable, `Conflict-serialisable: equivalent to ${r.order?.map((t) => `T${t}`).join(" → ")}`, `Not conflict-serialisable (cycle ${r.cycle?.map((t) => `T${t}`).join(" → ")})`),
          verdict(r.viewSerializable, `View-serialisable${r.viewOrder ? `: equivalent to ${r.viewOrder.map((t) => `T${t}`).join(" → ")}` : ""}`, "Not view-serialisable"),
          !r.conflictSerializable && r.viewSerializable ? h("li", { class: "info" }, "View- but not conflict-serialisable: this only happens with blind writes (writing an item without reading it first).") : null,
          rec.known ? [
            verdict(rec.recoverable, "Recoverable", `Not recoverable: ${rec.problems.recoverable[0]}`),
            verdict(rec.cascadeless, "Cascadeless (no dirty reads)", `Not cascadeless: ${rec.problems.cascadeless[0]}`),
            verdict(rec.strict, "Strict", `Not strict: ${rec.problems.strict[0]}`),
          ] : h("li", { class: "info" }, rec.note))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Schedule", input),
      h("div", { class: "row" }, exampleSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.text = randomSchedule(); input.value = state.text; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const text = randomSchedule(rng());
    const r = analyse(text);
    const orderIn = h("input", { type: "text", class: "mono", placeholder: "e.g. T2 T1", "aria-label": "Serial order" });
    const feedback = h("div"), solution = h("div");
    const answer = (serial) => {
      if (!serial) {
        feedback.replaceChildren(notice(r.conflictSerializable ? "bad" : "good", r.conflictSerializable ? `✗ It is conflict-serialisable, as ${r.order.map((t) => `T${t}`).join(" → ")}.` : `✓ Right: the cycle ${r.cycle.map((t) => `T${t}`).join(" → ")} rules it out.`));
        return;
      }
      const given = orderIn.value.toUpperCase().match(/\d+/g)?.map(Number) ?? [];
      const valid = r.conflictSerializable && given.length === r.txns.length && new Set(given).size === given.length && r.txns.every((t) => given.includes(t)) && r.edges.every((e) => given.indexOf(e.from) < given.indexOf(e.to));
      orderIn.classList.toggle("right", valid); orderIn.classList.toggle("wrong", !valid);
      feedback.replaceChildren(notice(valid ? "good" : "bad", valid ? "✓ That's a valid equivalent serial order." : r.conflictSerializable ? `✗ That order breaks an edge. One valid order: ${r.order.map((t) => `T${t}`).join(" → ")}.` : `✗ No serial order works: there's a cycle ${r.cycle.map((t) => `T${t}`).join(" → ")}.`));
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "Is this schedule conflict-serialisable?"),
      h("p", { class: "mono big-mono" }, text),
      grid(r),
      h("div", { class: "qa" }, h("label", null, "If yes, give an equivalent serial order", orderIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => answer(true) }, "Check my order"),
        h("button", { type: "button", class: "btn ghost", onclick: () => answer(false) }, "It's not serialisable"),
        h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Precedence graph"), h("div", { class: "chart-wrap" }, precedenceSvg(r.txns, r.edges, { cycle: r.cycle })), h("ul", { class: "notes" }, r.steps.map((s) => h("li", null, s.note))))) }, "Show the graph")),
      feedback), solution);
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
