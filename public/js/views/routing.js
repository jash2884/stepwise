import { dijkstra, DIJKSTRA_CODE, distanceVector, DV_CODE, EXAMPLES, flood, FLOOD_CODE, parseNetwork, randomNetwork } from "../engines/routing.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";
import { packet } from "./net.js";
import { view3d } from "../view3d.js";

const scene3d = (g) => (box) => import("../net3d.js").then((m) => m.routingScene(box, g));

const inf = (c) => (c === Infinity ? "∞" : c);
const same = (l, a, b) => (l.a === a && l.b === b) || (l.a === b && l.b === a);

function layout(g) {
  const W = 420, H = 300, cx = W / 2, cy = H / 2, R = 115;
  return { W, H, pos: new Map(g.nodes.map((n, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / g.nodes.length; return [n, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }]; })) };
}

// The network. Options: highlight a tree / path / edge, and draw packets
// travelling along links ({ from, to, label, cls }) or along a whole path.
export function networkSvg(g, { current = null, done = [], tree = [], changed = [], edge = null, path = null, packets = [], drops = [], route = null } = {}) {
  const { W, H, pos } = layout(g);
  const inTree = (l) => tree.some(([a, b]) => same(l, a, b));
  const onPath = (l) => path && path.some((x, i) => i && same(l, path[i - 1], x));
  const moving = packets.map((p) => {
    const a = pos.get(p.from), b = pos.get(p.to);
    // Start and stop at the edge of the router circles, not their centres.
    const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const end = p.half ? len / 2 : len - 22;
    return packet(a.x + ux * 22, a.y + uy * 22, a.x + ux * end, a.y + uy * end, { label: p.label ?? "", cls: p.cls ?? "", dur: p.dur ?? 0.8 });
  });
  if (route && route.length > 1) {
    const d = route.map((n, i) => `${i ? "L" : "M"}${pos.get(n).x},${pos.get(n).y}`).join(" ");
    const last = pos.get(route.at(-1));
    moving.push(packet(pos.get(route[0]).x, pos.get(route[0]).y, last.x, last.y, { path: d, label: "pkt", cls: "data", dur: 0.9 * (route.length - 1), repeat: true }));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "net", role: "img", "aria-label": `Network: ${g.links.map((l) => `${l.a}-${l.b} cost ${l.cost}`).join(", ")}` },
    g.links.map((l) => {
      const a = pos.get(l.a), b = pos.get(l.b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const hot = edge && same(l, edge[0], edge[1]);
      return h("g", { class: `net-link${inTree(l) ? " tree" : ""}${onPath(l) ? " path" : ""}${hot ? " hot" : ""}` }, h("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
        h("rect", { x: mx - 13, y: my - 10, width: 26, height: 20, rx: 6, class: "cost-bg" }), h("text", { x: mx, y: my + 5, "text-anchor": "middle" }, l.cost));
    }),
    g.nodes.map((n) => { const { x, y } = pos.get(n); return h("g", { class: `net-node${n === current ? " current" : done.includes(n) ? " done" : ""}${changed.includes(n) ? " changed" : ""}` }, h("circle", { cx: x, cy: y, r: 20 }), h("text", { x, y: y + 5, "text-anchor": "middle" }, n)); }),
    drops.map((m) => {
      const a = pos.get(m.from), b = pos.get(m.to), len = Math.hypot(b.x - a.x, b.y - a.y);
      return h("text", { x: b.x - ((b.x - a.x) / len) * 32, y: b.y - ((b.y - a.y) / len) * 32 + 5, "text-anchor": "middle", class: "net-drop" }, "✗", h("title", null, `${m.to} drops the duplicate from ${m.from}`));
    }),
    moving);
}

export function render(root) {
  const p = readParams();
  const state = {
    algo: ["ls", "dv", "flood"].includes(p.get("algo")) ? p.get("algo") : "ls",
    text: (p.get("g") ?? EXAMPLES.kurose.text).replace(/;/g, "\n"),
    source: p.get("src") ?? "U",
    change: p.get("chg") ?? "", poison: p.get("pr") === "1",
  };
  let player = null;
  const v3 = view3d("routing");
  const head = page({
    subject: "Computer networks", title: "Routing algorithms",
    lede: "How routers find least-cost paths: link-state flooding and Dijkstra's algorithm, and the distance-vector algorithm with its count-to-infinity problem.",
    theory: h("div", null,
      h("p", null, h("b", null, "Link state"), " routing works in two phases. First every router ", h("b", null, "floods"), " a link-state packet (LSP) listing its links and their costs: each router forwards a new LSP on every link except the one it arrived on, and drops copies it has already seen (spotted by the sequence number). After flooding, every router has the same map."),
      h("p", null, "Then each router runs ", h("b", null, "Dijkstra's algorithm"), " on that map: it repeatedly picks the closest router it hasn't finalised (N′ holds the finalised ones) and checks whether going through it gives shorter paths to its neighbours. The result is a shortest-path tree and a forwarding table (next hop for each destination). With n routers, it's O(n²) with a simple scan."),
      h("p", null, h("b", null, "Distance vector (Bellman–Ford)"), ": each router only knows its neighbours' distance vectors and uses Dₓ(y) = min over neighbours v of { c(x,v) + Dᵥ(y) }. Good news spreads fast, but when a link gets worse, routers can keep pointing at each other and ", h("b", null, "count to infinity"), ". ", h("b", null, "Poisoned reverse"), " fixes the two-router case: if x routes to y through v, it tells v its distance to y is ∞.")),
    conventions: ["Links are undirected with positive costs.", "Ties go to the alphabetically first router.", "Distance vector runs in synchronous rounds: every router updates from its neighbours' previous vectors at the same time.", "A link change is applied in the round after the first convergence.", "In flooding every link takes one time unit whatever its cost, and simultaneous arrivals are handled alphabetically."],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    [["flood", "Link state: flooding LSPs"], ["ls", "Link state: Dijkstra"], ["dv", "Distance vector"]].map(([v, t]) => h("option", { value: v, selected: state.algo === v }, t)));
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

  function forwardingCard(g, r) {
    const stage = h("div", { class: "chart-wrap" }), hops = h("ol", { class: "notes" });
    const st3 = v3.stage(stage, scene3d(g));
    const reachable = r.table.filter((t) => t.path);
    const send = (dest) => {
      const t = r.table.find((x) => x.dest === dest);
      for (const b of picker.children) b.classList.toggle("on", b.dataset.dest === dest);
      morph(stage, networkSvg(g, { done: g.nodes, path: t.path, route: t.path }));
      st3.show({ done: t.path, path: t.path, route: t.path, statusTone: { [dest]: "good" },
        status: Object.fromEntries(t.path.map((x, i) => [x, i === t.path.length - 1 ? "destination" : `next hop → ${t.path[i + 1]}`])) });
      hops.replaceChildren(...t.path.slice(0, -1).map((x, i) => h("li", null, `At ${x}: the forwarding table says the next hop towards ${dest} is ${t.path[i + 1]}${i === 0 ? ` (total cost ${t.cost})` : ""}.`)), h("li", null, `The packet reaches ${dest}.`));
    };
    const picker = h("div", { class: "row" }, h("span", { class: "muted small" }, "Send a packet to:"), reachable.map((t) => h("button", { type: "button", class: "btn ghost small", "data-dest": t.dest, onclick: () => send(t.dest) }, t.dest)));
    const card = h("section", { class: "card" }, h("h2", null, `${state.source}'s forwarding table`), h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Destination", "Cost", "Next hop", "Path"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, r.table.map((t) => h("tr", null, h("th", { scope: "row" }, t.dest), h("td", null, inf(t.cost)), h("td", null, t.next ?? "unreachable"), h("td", { class: "mono" }, t.path ? t.path.join(" → ") : "–")))))),
    picker, h("div", { class: "grid-2 tight" }, st3.el, hops));
    if (reachable.length) queueMicrotask(() => send(reachable.at(-1).dest));
    return card;
  }

  function update() {
    player?.destroy();
    v3.disposeAll();
    writeParams({ algo: state.algo, g: state.text.split("\n").map((l) => l.trim()).filter(Boolean).join(";"), src: state.source, chg: state.change, pr: state.poison ? 1 : 0 });
    lsOpts.hidden = state.algo === "dv"; dvOpts.hidden = state.algo !== "dv";
    let g;
    try { g = parseNetwork(state.text); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    if (!g.nodes.includes(state.source)) state.source = g.nodes[0];
    srcSel.replaceChildren(...g.nodes.map((n) => h("option", { value: n, selected: n === state.source }, n)));
    msg.replaceChildren();
    const stage = h("div", { class: "chart-wrap" }), table = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const st3 = v3.stage(stage, scene3d(g));
    const shown = st3.el;
    if (state.algo === "ls") {
      const r = dijkstra(g, state.source);
      const code = codePanel(DIJKSTRA_CODE), vars = varsPanel();
      player = stepper({ count: r.steps.length, label: "Step", interval: 1000, render: (i) => {
        const s = r.steps[i];
        const tree = Object.entries(s.prev).filter(([n, v]) => v && (s.done.includes(n) || s.final)).map(([n, v]) => [n, v]);
        morph(stage, networkSvg(g, { current: s.current, done: s.done, tree, edge: s.edge, packets: s.edge ? [{ from: s.edge[0], to: s.edge[1], label: String(s.vars["D[u] + c"]), cls: "probe" }] : [] }));
        st3.show({ current: s.current, done: s.done, tree, edge: s.edge,
          status: Object.fromEntries(g.nodes.map((n) => [n, `D = ${inf(s.dist[n])}`])), statusTone: Object.fromEntries(s.done.map((n) => [n, "good"])),
          packets: s.edge ? [{ from: s.edge[0], to: s.edge[1], kind: "probe", label: `${s.vars["D[u] + c"]}` }] : [] });
        table.replaceChildren(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Router"), h("th", { scope: "col" }, "D"), h("th", { scope: "col" }, "prev"), h("th", { scope: "col" }, "In N′?"))),
          h("tbody", null, g.nodes.map((n) => h("tr", { class: n === s.current ? "current" : s.edge?.[1] === n ? "hot-row" : null }, h("th", { scope: "row" }, n), h("td", null, inf(s.dist[n])), h("td", null, s.prev[n] ?? "–"), h("td", null, s.done.includes(n) ? "✓" : "")))))));
        code.show(s.line); vars.show(s.vars);
        note.textContent = s.note;
        note.className = `step-note${s.final ? " good" : ""}`;
      } });
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, `Dijkstra from ${state.source}`), player.el, note, traceLayout(h("div", null, shown, table), code, vars)),
        forwardingCard(g, r));
    } else if (state.algo === "flood") {
      const r = flood(g, state.source);
      const code = codePanel(FLOOD_CODE), vars = varsPanel();
      player = stepper({ count: r.steps.length, label: "Time", interval: 1200, render: (i) => {
        const s = r.steps[i];
        morph(stage, networkSvg(g, { done: s.have, current: i === 0 ? state.source : null, changed: s.arriving.filter((m) => !m.dup).map((m) => m.to), drops: s.arriving.filter((m) => m.dup),
          packets: s.sending.map((m) => ({ from: m.from, to: m.to, label: `LSP ${state.source}`, cls: "lsp" })) }));
        st3.show({ done: s.have, current: i === 0 ? state.source : null, changed: s.arriving.filter((m) => !m.dup).map((m) => m.to), changedTone: "good",
          drops: s.arriving.filter((m) => m.dup), packets: s.sending.map((m) => ({ from: m.from, to: m.to, kind: "lsp" })),
          status: Object.fromEntries(s.have.map((n) => [n, n === state.source ? "origin" : `got LSP t=${r.arrivedAt[n]}`])), statusTone: Object.fromEntries(s.have.map((n) => [n, "good"])) });
        table.replaceChildren(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Router", `Has ${state.source}'s LSP?`, "Got it at"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, g.nodes.map((n) => h("tr", null, h("th", { scope: "row" }, n), h("td", null, s.have.includes(n) ? "✓" : ""), h("td", null, s.have.includes(n) ? `t = ${r.arrivedAt[n]}` : "–")))))));
        code.show(s.line); vars.show(s.vars);
        note.textContent = s.note;
        note.className = `step-note${i === r.steps.length - 1 ? " good" : ""}`;
      } });
      const E = g.links.length, N = r.reached.length;
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Flooding ${state.source}'s link-state packet`), player.el, note, traceLayout(h("div", null, shown, table), code, vars),
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Transmissions"), h("b", null, r.transmissions)),
          h("div", { class: "stat" }, h("span", null, "Duplicates dropped"), h("b", null, r.duplicates)),
          h("div", { class: "stat" }, h("span", null, "Time to reach everyone"), h("b", null, Math.max(...Object.values(r.arrivedAt))))),
        h("p", { class: "muted small" }, `Every router forwards the LSP once, on every link but the one it came in on, so there are ${2 * E} − (${N} − 1) = ${r.transmissions} transmissions for ${E} links and ${N} routers. In real networks every router floods its own LSP like this, so each one ends up with the whole map before running Dijkstra.`)));
    } else {
      let change = null;
      if (state.change.trim()) {
        const m = /^([A-Za-z]\w{0,2})\s*-\s*([A-Za-z]\w{0,2})\s+(\d{1,3})$/.exec(state.change.trim());
        if (!m) { msg.replaceChildren(notice("error", "Write the link change like X-Y 60.")); out.replaceChildren(); return; }
        change = { a: m[1].toUpperCase(), b: m[2].toUpperCase(), cost: Number(m[3]) };
        if (!g.links.some((l) => same(l, change.a, change.b))) { msg.replaceChildren(notice("error", `There's no ${change.a}-${change.b} link to change.`)); out.replaceChildren(); return; }
      }
      const r = distanceVector(g, { change, poison: state.poison });
      const code = codePanel(DV_CODE), vars = varsPanel();
      player = stepper({ count: r.rounds.length, label: "Round", interval: 1000, render: (i) => {
        const round = r.rounds[i];
        const changedCells = new Set(round.changes.map((c) => `${c.x}:${c.y}`));
        const gNow = i >= (r.changedAt ?? Infinity) ? { ...g, links: g.links.map((l) => (same(l, change.a, change.b) ? { ...l, cost: change.cost } : l)) } : g;
        // Each round, every router sends its vector to each neighbour.
        const packets = i === 0 ? [] : g.links.flatMap((l) => [{ from: l.a, to: l.b, label: `D${l.a}`, cls: "dv" }, { from: l.b, to: l.a, label: `D${l.b}`, cls: "dv" }]);
        morph(stage, networkSvg(gNow, { changed: [...new Set(round.changes.map((c) => c.x))], packets }));
        const perRouter = {};
        for (const c of round.changes) (perRouter[c.x] ??= []).push(`to ${c.y}: ${inf(c.from)}→${inf(c.to)}`);
        st3.show({ links: gNow.links, changed: Object.keys(perRouter), packets: packets.map((m) => ({ from: m.from, to: m.to, kind: "dv" })),
          status: Object.fromEntries(Object.entries(perRouter).map(([x, list]) => [x, list.length > 2 ? `${list.slice(0, 2).join(", ")} +${list.length - 2}` : list.join(", ")])) });
        table.replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "dv" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "From ↓ / to →"), g.nodes.map((n) => h("th", { scope: "col" }, n)))),
          h("tbody", null, g.nodes.map((x) => h("tr", null, h("th", { scope: "row" }, x), g.nodes.map((y) => {
            const e = round.vectors[x][y];
            return h("td", { class: changedCells.has(`${x}:${y}`) ? "changed" : null, title: e.via && x !== y ? `via ${e.via}` : null }, x === y ? "0" : `${inf(e.cost)}${e.via && x !== y ? ` (${e.via})` : ""}`);
          })))))));
        code.show(round.line); vars.show(round.vars);
        note.textContent = round.note;
        note.className = `step-note${i === r.rounds.length - 1 && r.finalStable ? " good" : ""}`;
      } });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Distance vector${change ? `, then ${change.a}-${change.b} becomes ${change.cost}` : ""}${state.poison ? " (poisoned reverse)" : ""}`), player.el, note,
        traceLayout(h("div", null, shown, table), code, vars),
        h("p", { class: "muted small" }, r.changedAt ? `Converged after ${r.convergedAt} round${r.convergedAt === 1 ? "" : "s"}; after the link change it took ${r.settledAt ? r.settledAt - r.changedAt : "more than 80"} more round${r.settledAt - r.changedAt === 1 ? "" : "s"} to settle.` : `Converged after ${r.convergedAt} round${r.convergedAt === 1 ? "" : "s"}. Each cell shows cost (next hop); highlighted cells changed this round.`)));
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, exampleSel, lsOpts, v3.el,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.text = randomNetwork(); netIn.value = state.text; update(); } }, "Random network"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      dvOpts,
      h("label", { class: "stack" }, "Links (one per line: A-B cost)", netIn), msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r0 = rng();
    const g = parseNetwork(randomNetwork(r0));
    const src = g.nodes[0];
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    const top = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    if (r0() < 0.3) {
      const f = flood(g, src);
      const tIn = h("input", { type: "number", "aria-label": "Transmissions" });
      practice.replaceChildren(h("section", { class: "card" }, top,
        h("h2", null, `${src} floods its LSP. How many times is it transmitted in total?`),
        h("p", { class: "muted" }, "Each router forwards a new LSP on every link except the one it came in on, and drops duplicates."),
        h("div", { class: "chart-wrap" }, networkSvg(g)),
        h("div", { class: "qa" }, h("label", null, "Transmissions", tIn)),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = tIn.value !== "" && Number(tIn.value) === f.transmissions; mark(tIn, ok, f.transmissions);
          feedback.replaceChildren(notice(ok ? "good" : "info", `${src} sends on all its links, and every other router forwards on all but one: 2 × ${g.links.length} links − (${g.nodes.length} − 1) = ${f.transmissions}, of which ${f.duplicates} arrive as duplicates.`));
        } }, "Check")), feedback));
      return;
    }
    const r = dijkstra(g, src);
    const targets = g.nodes.filter((n) => n !== src);
    const hopTarget = targets[targets.length - 1];
    const inputs = new Map(targets.map((n) => [n, h("input", { type: "number", "aria-label": `Distance to ${n}` })]));
    const hopIn = h("input", { type: "text", class: "mono short", "aria-label": `Next hop to ${hopTarget}` });
    practice.replaceChildren(h("section", { class: "card" }, top,
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
  return () => { player?.destroy(); v3.disposeAll(); };
}
