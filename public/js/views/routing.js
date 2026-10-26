import { dijkstra, distanceVector, EXAMPLES, parseNetwork, randomNetwork } from "../engines/routing.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

const inf = (c) => (c === Infinity ? "∞" : c);

export function networkSvg(g, { current = null, done = [], tree = [], changed = [] } = {}) {
  const W = 420, H = 300, cx = W / 2, cy = H / 2, R = 115;
  const pos = new Map(g.nodes.map((n, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / g.nodes.length; return [n, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }]; }));
  const inTree = (l) => tree.some(([a, b]) => (a === l.a && b === l.b) || (a === l.b && b === l.a));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "net", role: "img", "aria-label": `Network: ${g.links.map((l) => `${l.a}-${l.b} cost ${l.cost}`).join(", ")}` },
    g.links.map((l) => {
      const a = pos.get(l.a), b = pos.get(l.b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      return h("g", { class: `net-link${inTree(l) ? " tree" : ""}` }, h("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
        h("rect", { x: mx - 13, y: my - 10, width: 26, height: 20, rx: 6, class: "cost-bg" }), h("text", { x: mx, y: my + 5, "text-anchor": "middle" }, l.cost));
    }),
    g.nodes.map((n) => { const { x, y } = pos.get(n); return h("g", { class: `net-node${n === current ? " current" : done.includes(n) ? " done" : ""}${changed.includes(n) ? " changed" : ""}` }, h("circle", { cx: x, cy: y, r: 20 }), h("text", { x, y: y + 5, "text-anchor": "middle" }, n)); }));
}

export function render(root) {
  const p = readParams();
  const state = {
    algo: p.get("algo") === "dv" ? "dv" : "ls",
    text: (p.get("g") ?? EXAMPLES.kurose.text).replace(/;/g, "\n"),
    source: p.get("src") ?? "U",
    change: p.get("chg") ?? "", poison: p.get("pr") === "1",
  };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "Routing algorithms",
    lede: "How routers find least-cost paths: Dijkstra's link-state algorithm, and the distance-vector algorithm, including the count-to-infinity problem.",
    theory: h("div", null,
      h("p", null, h("b", null, "Link state (Dijkstra)"), ": every router knows the whole map. It repeatedly picks the closest router it hasn't finalised and checks whether going through it gives shorter paths to its neighbours. The result is a shortest-path tree and a forwarding table (next hop for each destination)."),
      h("p", null, h("b", null, "Distance vector (Bellman–Ford)"), ": each router only knows its neighbours' distance vectors and uses Dₓ(y) = min over neighbours v of { c(x,v) + Dᵥ(y) }. Good news spreads fast, but when a link gets worse, routers can keep pointing at each other and ", h("b", null, "count to infinity"), ". ", h("b", null, "Poisoned reverse"), " fixes the two-router case: if x routes to y through v, it tells v its distance to y is ∞.")),
    conventions: ["Links are undirected with positive costs.", "Ties go to the alphabetically first router.", "Distance vector runs in synchronous rounds: every router updates from its neighbours' previous vectors at the same time.", "A link change is applied in the round after the first convergence."],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    h("option", { value: "ls", selected: state.algo === "ls" }, "Link state (Dijkstra)"), h("option", { value: "dv", selected: state.algo === "dv" }, "Distance vector"));
  const exampleSel = h("select", { "aria-label": "Example", onchange: (e) => {
    if (!e.target.value) return;
    const ex = EXAMPLES[e.target.value];
    state.text = ex.text; state.source = ex.source; netIn.value = ex.text;
    if (ex.change) { state.algo = "dv"; algoSel.value = "dv"; state.change = `${ex.change.a}-${ex.change.b} ${ex.change.cost}`; changeIn.value = state.change; }
    e.target.value = ""; update();
  } }, h("option", { value: "" }, "Load an example…"), Object.entries(EXAMPLES).map(([k, v]) => h("option", { value: k }, v.name)));
  const netIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Links", oninput: (e) => { state.text = e.target.value; update(); } }, state.text);
  const srcSel = h("select", { "aria-label": "Source router", onchange: (e) => { state.source = e.target.value; update(); } });
  const changeIn = h("input", { type: "text", class: "mono", value: state.change, placeholder: "e.g. X-Y 60", "aria-label": "Link cost change", oninput: (e) => { state.change = e.target.value; update(); } });
  const poisonBox = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.poison, onchange: (e) => { state.poison = e.target.checked; update(); } }), " poisoned reverse");
  const lsOpts = h("label", { class: "inline" }, "From ", srcSel);
  const dvOpts = h("span", { class: "row inline-row" }, h("label", { class: "inline" }, "After convergence, change link ", changeIn), poisonBox);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ algo: state.algo, g: state.text.split("\n").map((l) => l.trim()).filter(Boolean).join(";"), src: state.source, chg: state.change, pr: state.poison ? 1 : 0 });
    lsOpts.hidden = state.algo !== "ls"; dvOpts.hidden = state.algo !== "dv";
    let g;
    try { g = parseNetwork(state.text); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    if (!g.nodes.includes(state.source)) state.source = g.nodes[0];
    srcSel.replaceChildren(...g.nodes.map((n) => h("option", { value: n, selected: n === state.source }, n)));
    msg.replaceChildren();
    const stage = h("div", { class: "chart-wrap" }), table = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    if (state.algo === "ls") {
      const r = dijkstra(g, state.source);
      player = stepper({ count: r.steps.length, label: "Step", interval: 1100, render: (i) => {
        const s = r.steps[i];
        const tree = Object.entries(s.prev).filter(([n, v]) => v && s.done.includes(n)).map(([n, v]) => [n, v]);
        stage.replaceChildren(networkSvg(g, { current: s.current, done: s.done, tree }));
        table.replaceChildren(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Router"), h("th", { scope: "col" }, "Distance"), h("th", { scope: "col" }, "Previous"), h("th", { scope: "col" }, "Final?"))),
          h("tbody", null, g.nodes.map((n) => h("tr", { class: n === s.current ? "current" : null }, h("th", { scope: "row" }, n), h("td", null, inf(s.dist[n])), h("td", null, s.prev[n] ?? "–"), h("td", null, s.done.includes(n) ? "✓" : "")))))));
        note.textContent = s.note;
      } });
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, `Dijkstra from ${state.source}`), player.el, h("div", { class: "grid-2 tight" }, stage, table), note),
        h("section", { class: "card" }, h("h2", null, `${state.source}'s forwarding table`), h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Destination", "Cost", "Next hop", "Path"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, r.table.map((t) => h("tr", null, h("th", { scope: "row" }, t.dest), h("td", null, inf(t.cost)), h("td", null, t.next ?? "unreachable"), h("td", { class: "mono" }, t.path ? t.path.join(" → ") : "–"))))))));
    } else {
      let change = null;
      if (state.change.trim()) {
        const m = /^([A-Za-z]\w{0,2})\s*-\s*([A-Za-z]\w{0,2})\s+(\d{1,3})$/.exec(state.change.trim());
        if (!m) { msg.replaceChildren(notice("error", "Write the link change like X-Y 60.")); out.replaceChildren(); return; }
        change = { a: m[1].toUpperCase(), b: m[2].toUpperCase(), cost: Number(m[3]) };
        if (!g.links.some((l) => (l.a === change.a && l.b === change.b) || (l.a === change.b && l.b === change.a))) { msg.replaceChildren(notice("error", `There's no ${change.a}-${change.b} link to change.`)); out.replaceChildren(); return; }
      }
      const r = distanceVector(g, { change, poison: state.poison });
      player = stepper({ count: r.rounds.length, label: "Round", interval: 900, render: (i) => {
        const round = r.rounds[i];
        const changedCells = new Set(round.changes.map((c) => `${c.x}:${c.y}`));
        stage.replaceChildren(networkSvg(i >= (r.changedAt ?? Infinity) ? { ...g, links: g.links.map((l) => ((l.a === change.a && l.b === change.b) || (l.a === change.b && l.b === change.a) ? { ...l, cost: change.cost } : l)) } : g, { changed: [...new Set(round.changes.map((c) => c.x))] }));
        table.replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "dv" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "From ↓ / to →"), g.nodes.map((n) => h("th", { scope: "col" }, n)))),
          h("tbody", null, g.nodes.map((x) => h("tr", null, h("th", { scope: "row" }, x), g.nodes.map((y) => {
            const e = round.vectors[x][y];
            return h("td", { class: changedCells.has(`${x}:${y}`) ? "changed" : null, title: e.via && x !== y ? `via ${e.via}` : null }, x === y ? "0" : `${inf(e.cost)}${e.via && x !== y ? ` (${e.via})` : ""}`);
          })))))));
        note.textContent = round.note;
      } });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Distance vector${change ? `, then ${change.a}-${change.b} becomes ${change.cost}` : ""}${state.poison ? " (poisoned reverse)" : ""}`), player.el,
        h("div", { class: "grid-2 tight" }, stage, table), note,
        h("p", { class: "muted small" }, r.changedAt ? `Converged after ${r.convergedAt} round${r.convergedAt === 1 ? "" : "s"}; after the link change it took ${r.settledAt ? r.settledAt - r.changedAt : "more than 80"} more round${r.settledAt - r.changedAt === 1 ? "" : "s"} to settle.` : `Converged after ${r.convergedAt} round${r.convergedAt === 1 ? "" : "s"}. Each cell shows cost (next hop); highlighted cells changed this round.`)));
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, exampleSel, lsOpts,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.text = randomNetwork(); netIn.value = state.text; update(); } }, "Random network"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      dvOpts,
      h("label", { class: "stack" }, "Links (one per line: A-B cost)", netIn), msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const g = parseNetwork(randomNetwork(rng()));
    const src = g.nodes[0];
    const r = dijkstra(g, src);
    const targets = g.nodes.filter((n) => n !== src);
    const hopTarget = targets[targets.length - 1];
    const inputs = new Map(targets.map((n) => [n, h("input", { type: "number", "aria-label": `Distance to ${n}` })]));
    const hopIn = h("input", { type: "text", class: "mono short", "aria-label": `Next hop to ${hopTarget}` });
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Least-cost paths from ${src}`),
      h("div", { class: "chart-wrap" }, networkSvg(g)),
      h("div", { class: "qa" }, targets.map((n) => h("label", null, `Cost to ${n}`, inputs.get(n))), h("label", null, `${src}'s next hop towards ${hopTarget}`, hopIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        let right = 0;
        for (const n of targets) { const ok = inputs.get(n).value !== "" && Number(inputs.get(n).value) === r.dist[n]; mark(inputs.get(n), ok, r.dist[n]); if (ok) right++; }
        const truth = r.table.find((t) => t.dest === hopTarget).next;
        const okHop = hopIn.value.trim().toUpperCase() === truth; mark(hopIn, okHop, truth); if (okHop) right++;
        feedback.replaceChildren(notice(right === targets.length + 1 ? "good" : "info", right === targets.length + 1 ? "All right! 🎉" : `${right} / ${targets.length + 1} right. Paths: ${r.table.map((t) => `${t.dest} ${t.path?.join("→")} (${t.cost})`).join(", ")}.`));
      } }, "Check")),
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
