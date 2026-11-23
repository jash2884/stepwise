import { parseGraph } from "../engines/graph.js";
import {
  BIP_CODE, COLOUR_CODE, EULER_CODE, EXAMPLES, HAM_CODE, HH_CODE, KIRCHHOFF_CODE, MATCH_CODE, SEQ_EXAMPLES, bipartite, chromatic, degrees, edgeId, euler,
  hamilton, havelHakimi, matching, parseSequence, planarCounts, randomSimpleGraph, spanningTrees,
} from "../engines/graphtheory.js";
import { graphSvg, layoutGraph, legend } from "../graph-view.js";
import { h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, numberQuestion, stat } from "./kit.js";
import { linkButton, reveal, select, shell, table, traceCard, yesNo } from "./dm-kit.js";

const MODES = {
  hh: "Degree sequence (Havel-Hakimi)",
  euler: "Euler trails and circuits",
  hamilton: "Hamiltonian cycle",
  bipartite: "Bipartite check",
  colour: "Colouring and chromatic number",
  matching: "Maximum matching",
  planar: "Planarity and Euler's formula",
  kirchhoff: "Spanning trees (Kirchhoff)",
};
const DEFAULT_GRAPH = { euler: "house", hamilton: "w6", bipartite: "c5", colour: "petersen", matching: "k33", planar: "k5", kirchhoff: "k4" };

const draw = (g, opts) => graphSvg(g, layoutGraph(g), { weights: false, ...opts });
const colourStyle = (c) => `--c:var(--series-${((c - 1) % 8) + 1})`;
const pathEdges = (g, list, cls) => Object.fromEntries(list.slice(1).map((v, i) => [edgeId(g, list[i], v), cls]).filter(([k]) => k));

function hhMode(seq) {
  const res = havelHakimi(seq);
  let added = 0;
  const built = res.steps.map((s) => { added += s.removed ?? 0; return added; });
  const g = res.graphic ? parseGraph([...res.edges.map((e) => e.join(" ")), ...res.names].join("\n")) : null;
  const card = traceCard({ title: `Is ${seq.join(", ")} graphic?`, steps: res.steps, code: HH_CODE, interval: 1100,
    draw: (st) => h("div", { class: "dm-seq" }, st.seq.length ? st.seq.map((d, i) => h("span", { class: `dm-chip on${i < (st.hit ?? 0) ? " hit" : ""}${d < 0 ? " neg" : ""}` }, d)) : h("span", { class: "muted" }, "empty")),
    side: (st, i) => (g ? h("div", { class: "chart-wrap dm-stage" }, draw(g, { edgeCls: Object.fromEntries(g.edges.map((e, k) => [e.id, k < built[i] ? "tree" : "dim"])), badges: degrees(g) })) : null) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, res.graphic ? "Graphic" : "Not graphic"),
    notice(res.graphic ? "good" : "bad", res.graphic ? `A simple graph with degrees ${seq.join(", ")} exists: the drawing above is one (vertex vᵢ has the i-th degree).` : `No simple graph has degrees ${seq.join(", ")}.`),
    h("p", { class: "muted small" }, "Havel-Hakimi: a sequence is graphic exactly when removing the largest degree d and subtracting 1 from the next d largest leaves a graphic sequence. Erdős-Gallai gives the same answer with inequalities."))], destroy: card.destroy };
}

function eulerMode(g) {
  const res = euler(g), deg = degrees(g);
  const card = traceCard({ title: "Hierholzer's algorithm", steps: res.steps, code: EULER_CODE,
    draw: (st) => draw(g, { nodeCls: { ...Object.fromEntries(res.odd.map((v) => [v, "bad"])), ...(st.current ? { [st.current]: "current" } : {}) }, edgeCls: Object.fromEntries((st.used ?? []).map((id) => [id, "tree"])), active: st.active, badges: deg }),
    side: (st) => h("div", { class: "dm-strips" }, h("div", null, h("b", null, "Stack: "), (st.stack ?? []).join(" ") || "empty"), h("div", null, h("b", null, "Trail: "), (st.trail ?? []).join(" → ") || "empty")),
    after: legend([["Odd degree", "n-bad"], ["Edge used", "e-tree"], ["Edge being walked", "e-active"]]) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, res.kind === "circuit" ? "Euler circuit" : res.kind === "trail" ? "Euler trail (not a circuit)" : "No Euler trail"),
    h("p", null, "A connected graph has an ", h("b", null, "Euler circuit"), " when every degree is even, and an ", h("b", null, "Euler trail"), " (open) when exactly two degrees are odd; the trail runs between them."))], destroy: card.destroy };
}

function hamiltonMode(g) {
  const res = hamilton(g);
  const card = traceCard({ title: "Backtracking search", steps: res.steps, code: HAM_CODE, interval: 600,
    draw: (st) => {
      const closed = st.tone === "good" ? [...st.path, st.path[0]] : st.path;
      return draw(g, { nodeCls: { ...Object.fromEntries(st.path.map((v) => [v, "path"])), ...(st.path.length ? { [st.path[st.path.length - 1]]: "current" } : {}), ...(st.dead ? { [st.dead]: "bad" } : {}) }, edgeCls: pathEdges(g, closed, "path") });
    } });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, res.cycle ? "Hamiltonian" : "Not Hamiltonian"),
    h("div", { class: "stats-row" }, stat("Dirac (δ ≥ n/2)", yesNo(res.dirac)), stat("Ore (deg u + deg v ≥ n)", yesNo(res.ore)), stat("Cycle found", yesNo(!!res.cycle))),
    h("p", { class: "muted small" }, "Dirac's and Ore's conditions are sufficient, not necessary: a graph can be Hamiltonian without meeting them (any cycle Cₙ, for example). There is no quick test in general, so the tool searches.", res.truncated ? " Only the first 400 search steps are shown." : ""))], destroy: card.destroy };
}

function bipartiteMode(g) {
  const res = bipartite(g);
  const card = traceCard({ title: "Two-colouring by BFS", steps: res.steps, code: BIP_CODE,
    draw: (st) => draw(g, { nodeCls: { ...Object.fromEntries(Object.keys(st.side).map((v) => [v, "grp"])), ...(st.current ? { [st.current]: `grp current` } : {}) }, nodeStyle: Object.fromEntries(Object.entries(st.side).map(([v, s]) => [v, colourStyle(s + 1)])),
      edgeCls: st.cycle ? pathEdges(g, [...st.cycle, st.cycle[0]], "cycle") : {}, active: st.active }),
    side: (st) => h("div", { class: "dm-strips" }, h("div", null, h("b", null, "Queue: "), (st.queue ?? []).join(" ") || "empty")) });
  return { els: [card.el], destroy: card.destroy };
}

function colourMode(g) {
  const res = chromatic(g);
  const card = traceCard({ title: "Backtracking colouring", steps: res.steps, code: COLOUR_CODE, interval: 500,
    draw: (st) => draw(g, { nodeCls: { ...Object.fromEntries(Object.keys(st.colour).map((v) => [v, "grp"])), ...(st.current ? { [st.current]: st.colour[st.current] ? "grp current" : "current" } : {}) }, nodeStyle: Object.fromEntries(Object.entries(st.colour).map(([v, c]) => [v, colourStyle(c)])), badges: Object.fromEntries(Object.entries(st.colour).map(([v, c]) => [v, `c${c}`])) }) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, `χ(G) = ${res.chi}`),
    h("div", { class: "stats-row" }, stat("Chromatic number", res.chi), stat("Largest clique", res.clique.length), stat("Max degree + 1", Math.max(0, ...Object.values(degrees(g))) + 1)),
    h("p", { class: "muted small" }, "Bounds: ω(G) ≤ χ(G) ≤ Δ(G) + 1, where ω is the largest clique and Δ the largest degree. Brooks: χ ≤ Δ unless G is complete or an odd cycle. Planar graphs need at most 4 colours; bipartite graphs (with an edge) exactly 2.", res.truncated ? " Only the first 500 search steps are shown." : ""))], destroy: card.destroy };
}

function matchingMode(g) {
  const res = matching(g);
  const matchedEdges = (mate) => Object.fromEntries(Object.entries(mate).filter(([a, b]) => a < b).map(([a, b]) => [edgeId(g, a, b), "mst"]));
  const card = traceCard({ title: "Augmenting paths", steps: res.steps, code: MATCH_CODE, interval: 1200,
    draw: (st) => draw(g, { edgeCls: { ...matchedEdges(st.mate), ...(st.path ? Object.fromEntries(Object.entries(pathEdges(g, st.path, "path")).filter(([id]) => !matchedEdges(st.mate)[id])) : {}) }, nodeCls: Object.fromEntries(g.nodes.map((v) => [v, st.mate[v] ? "done" : null]).filter(([, c]) => c)) }),
    after: legend([["Matched edge", "e-mst"], ["Matched vertex", "n-done"]]) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, `Matching number ν(G) = ${res.size}`),
    h("p", { class: "muted small" }, "Berge: a matching is maximum exactly when no augmenting path exists. In a bipartite graph, König's theorem says the largest matching equals the smallest vertex cover. Hall's theorem: one side can be fully matched when every set S of its vertices has at least |S| neighbours."))], destroy: card.destroy };
}

function planarMode(g) {
  const c = planarCounts(g);
  const steps = [
    { line: 1, vars: { v: c.v, e: c.e, components: c.c }, note: `Count: v = ${c.v} vertices, e = ${c.e} edges, ${c.c} component${c.c === 1 ? "" : "s"}.` },
    { line: 2, vars: { "f if planar": c.faces }, note: `If it's drawn without crossings, Euler's formula v − e + f = ${c.c === 1 ? "2" : "1 + c"} gives f = ${c.e} − ${c.v} + ${c.c + 1} = ${c.faces} faces (counting the outside one).` },
    { line: 3, vars: { "3v − 6": c.bound ?? "-", e: c.e }, tone: c.bound != null && c.e > c.bound ? "bad" : null, note: c.bound == null ? "With fewer than 3 vertices it's planar." : `Every face has at least 3 edges and each edge borders 2 faces, so 3f ≤ 2e, giving e ≤ 3v − 6 = ${c.bound}. Here e = ${c.e}: ${c.e > c.bound ? "too many, so it's NOT planar." : "fine."}` },
    { line: 4, vars: { girth: c.girth === Infinity ? "∞" : c.girth, bound: c.boundG ?? "-" }, tone: c.boundG != null && c.c === 1 && c.e > c.boundG ? "bad" : null,
      note: c.girth === Infinity ? "No cycles: it's a forest, which is always planar." : `The shortest cycle has length g = ${c.girth}, so every face has at least ${c.girth} edges: e ≤ g(v − 2)/(g − 2) = ${c.boundG}.${c.girth === 4 ? " (For triangle-free graphs that's e ≤ 2v − 4.)" : ""} ${c.e > c.boundG && c.c === 1 ? "Broken, so NOT planar." : "Holds."}` },
    { line: 5, vars: { verdict: c.violates ? "not planar" : "may be planar" }, tone: c.violates ? "bad" : "good", note: c.violates ? "A counting bound fails, so the graph can't be planar (K₅ and K₃,₃ are the classic examples)." : "Every counting bound holds. That's necessary, not sufficient: by Kuratowski's theorem the graph is planar exactly when it contains no subdivision of K₅ or K₃,₃." },
  ];
  const code = ["count v, e and components c", "if planar: f = e − v + c + 1  (v − e + f = 2 when connected)", "3f ≤ 2e  ⇒  e ≤ 3v − 6", "girth g: g·f ≤ 2e  ⇒  e ≤ g(v − 2)/(g − 2)", "a bound fails ⇒ not planar"];
  const card = traceCard({ title: "Euler's formula and the edge bounds", steps, code, interval: 1400, draw: () => draw(g, { badges: degrees(g) }) });
  return { els: [card.el], destroy: card.destroy };
}

function kirchhoffMode(g) {
  const res = spanningTrees(g);
  const card = traceCard({ title: "Matrix-tree theorem", steps: res.steps, code: KIRCHHOFF_CODE, interval: 1200,
    draw: (st, i) => h("div", null, h("div", { class: "chart-wrap dm-stage" }, draw(g, { badges: degrees(g) })),
      st.M.length ? table(["", ...(i === 0 ? g.nodes : g.nodes.slice(1))], st.M.map((row, r) => [(i === 0 ? g.nodes : g.nodes.slice(1))[r], ...row.map((x) => String(x).replace("-", "−"))]), { cls: (r, c) => (st.pivot != null && r === st.pivot && c === st.pivot + 1 ? "hot" : null) }) : null) });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, `τ(G) = ${res.count}`), h("p", { class: "muted small" }, "Known values: Kₙ has nⁿ⁻² spanning trees (Cayley), the cycle Cₙ has n, any tree has exactly 1, and K₂,₃ has 12."))], destroy: card.destroy };
}

// --- Practice ----------------------------------------------------------------------
function question(r) {
  const kind = ["chi", "euler", "hh", "trees", "faces", "bip", "match"][Math.floor(r() * 7)];
  const g = parseGraph(randomSimpleGraph(r, 5 + Math.floor(r() * 2), 0.5));
  const picture = () => h("div", { class: "chart-wrap dm-stage" }, draw(g, {}));
  if (kind === "chi") { const res = chromatic(g); return [h("h2", null, "What is the chromatic number of this graph?"), picture(), numberQuestion(res.chi, `A proper colouring with ${res.chi} colours: ${Object.entries(res.colouring).map(([v, c]) => `${v}=${c}`).join(", ")}; the clique {${res.clique.join(", ")}} shows ${res.clique.length} are needed${res.chi > res.clique.length ? ", and the search shows fewer than " + res.chi + " fail" : ""}.`)]; }
  if (kind === "euler") {
    const res = euler(g);
    return [h("h2", null, "Does this graph have an Euler circuit, an Euler trail, or neither?"), picture(),
      choice([["circuit", "Euler circuit"], ["trail", "Euler trail only"], ["none", "Neither"]].map(([k, label]) => ({ label, correct: res.kind === k })), `Odd vertices: ${res.odd.join(", ") || "none"}.`)];
  }
  if (kind === "hh") {
    const seqs = [[3, 3, 2, 2, 2], [4, 4, 4, 1, 1], [3, 3, 3, 3, 3, 3], [5, 3, 3, 3, 2, 2], [4, 3, 3, 2, 2], [3, 3, 3, 1], [6, 6, 5, 4, 3, 3, 1], [2, 2, 2, 2, 2], [5, 5, 4, 3, 2, 1], [4, 4, 3, 3, 2, 2]];
    const seq = seqs[Math.floor(r() * seqs.length)], res = havelHakimi(seq);
    return [h("h2", null, `Is ${seq.join(", ")} the degree sequence of a simple graph?`), choice([{ label: "Yes, graphic", correct: res.graphic }, { label: "No", correct: !res.graphic }], res.steps[res.steps.length - 1].note)];
  }
  if (kind === "trees") { const res = spanningTrees(g); return [h("h2", null, "How many spanning trees does this graph have?"), picture(), numberQuestion(Number(res.count), `Kirchhoff: the determinant of the Laplacian with one row and column removed is ${res.count}.`)]; }
  if (kind === "faces") {
    const v = 6 + Math.floor(r() * 10), d = [3, 4][Math.floor(r() * 2)];
    const vv = d === 3 && v % 2 ? v + 1 : v, e = (vv * d) / 2;
    return [h("h2", null, `A connected planar graph has ${vv} vertices, each of degree ${d}. How many faces does a plane drawing of it have?`), numberQuestion(e - vv + 2, `Handshake: e = ${vv}·${d}/2 = ${e}. Euler: f = e − v + 2 = ${e} − ${vv} + 2 = ${e - vv + 2}.`)];
  }
  if (kind === "bip") { const res = bipartite(g); return [h("h2", null, "Is this graph bipartite?"), picture(), choice([{ label: "Yes", correct: res.bipartite }, { label: "No", correct: !res.bipartite }], res.steps[res.steps.length - 1].note)]; }
  const res = matching(g);
  return [h("h2", null, "What is the size of a maximum matching?"), picture(), numberQuestion(res.size, res.steps[res.steps.length - 1].note), reveal("Show one", () => h("p", null, Object.entries(res.mate).filter(([a, b]) => a < b).map(([a, b]) => `${a}-${b}`).join(", ")))];
}

export function render(root) {
  const p = readParams();
  const mode = MODES[p.get("mode")] ? p.get("mode") : "euler";
  const state = { mode, g: (p.get("g") ?? EXAMPLES[DEFAULT_GRAPH[mode] ?? "house"].text).replace(/;/g, "\n"), seq: p.get("seq") ?? SEQ_EXAMPLES.yes };
  const head = page({
    subject: "Discrete maths", title: "Graph theory",
    lede: "The results behind the graph questions: which degree sequences are possible, Euler and Hamilton tours, two-colouring, chromatic number, matchings, Euler's formula and counting spanning trees.",
    theory: h("div", null,
      h("p", null, "Here a graph is ", h("b", null, "simple and undirected"), ": no loops, no repeated edges. The ", h("b", null, "handshake lemma"), " says the degrees add up to 2e, so the number of odd-degree vertices is even."),
      h("ul", null,
        h("li", null, h("b", null, "Havel-Hakimi"), " decides whether a list of degrees belongs to some simple graph."),
        h("li", null, "An ", h("b", null, "Euler circuit"), " uses every edge once and returns: it exists in a connected graph exactly when every degree is even. A ", h("b", null, "Hamiltonian cycle"), " visits every vertex once; no easy test is known (it's NP-complete)."),
        h("li", null, "A graph is ", h("b", null, "bipartite"), " exactly when it has no odd cycle. The ", h("b", null, "chromatic number"), " χ(G) is the fewest colours so that adjacent vertices differ."),
        h("li", null, "A ", h("b", null, "matching"), " is a set of edges with no shared vertex. For a connected ", h("b", null, "planar"), " graph v − e + f = 2, which gives e ≤ 3v − 6."),
        h("li", null, h("b", null, "Kirchhoff's theorem"), ": the number of spanning trees is any cofactor of the Laplacian L = D − A."))),
    conventions: [
      "Edges are typed one per line, like A B; a lone name adds an isolated vertex.",
      "Searches go through neighbours in alphabetical order, so the steps are the same every time.",
      "Colouring tries vertices from highest degree down, and colours 1, 2, 3, … in order.",
      "Havel-Hakimi names the vertices v1, v2, … in the order of the sequence you type.",
      "Euler's formula with c components: v − e + f = 1 + c.",
    ],
  });
  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  let destroy = null;
  function drawInputs() {
    const top = h("div", { class: "row" }, select(MODES, state.mode, (v) => { state.mode = v; drawInputs(); update(); }, "Mode"),
      state.mode === "hh" ? select({ "": "Load an example…", ...Object.fromEntries(Object.entries(SEQ_EXAMPLES).map(([k, v]) => [k, v])) }, "", (k) => { if (k) { state.seq = SEQ_EXAMPLES[k]; drawInputs(); update(); } }, "Example")
        : select({ "": "Load an example…", ...Object.fromEntries(Object.entries(EXAMPLES).map(([k, v]) => [k, v.name])) }, "", (k) => { if (k) { state.g = EXAMPLES[k].text; drawInputs(); update(); } }, "Example"),
      state.mode === "hh" ? null : h("button", { type: "button", class: "btn ghost", onclick: () => { state.g = randomSimpleGraph(rng()); drawInputs(); update(); } }, "Random graph"),
      linkButton());
    const field = state.mode === "hh"
      ? h("label", { class: "stack" }, "Degree sequence", h("input", { type: "text", class: "mono wide", value: state.seq, "aria-label": "Degree sequence", oninput: (e) => { state.seq = e.target.value; update(); } }))
      : h("label", { class: "stack" }, "Edges, one per line: A B", h("textarea", { rows: 5, class: "mono", spellcheck: "false", "aria-label": "Edges", oninput: (e) => { state.g = e.target.value; update(); } }, state.g));
    inputs.replaceChildren(top, field);
  }
  function update() {
    destroy?.(); destroy = null;
    writeParams(state.mode === "hh" ? { mode: "hh", seq: state.seq } : { mode: state.mode, g: state.g.split("\n").map((l) => l.trim()).filter(Boolean).join(";") });
    try {
      let res;
      if (state.mode === "hh") res = hhMode(parseSequence(state.seq));
      else {
        const g = parseGraph(state.g, { maxNodes: state.mode === "hamilton" || state.mode === "colour" ? 10 : 12, maxEdges: 30 });
        res = { euler: eulerMode, hamilton: hamiltonMode, bipartite: bipartiteMode, colour: colourMode, matching: matchingMode, planar: planarMode, kirchhoff: kirchhoffMode }[state.mode](g);
      }
      msg.replaceChildren(); out.replaceChildren(...res.els); destroy = res.destroy;
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }
  drawInputs();
  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);
  shell(root, head, visual, question);
  update();
  return () => destroy?.();
}
