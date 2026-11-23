import { BUILD_CODE, HNSW, SEARCH_CODE, bruteForce, evaluate, levelFor, randomPoints, recallOf } from "../engines/hnsw.js";
import { copyLink, h, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { approxQuestion, practiceCard, svg, traceSim } from "./ai-kit.js";

const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return v != null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const copyLayers = (layers) => layers.map((m) => new Map([...m].map(([k, v]) => [k, v.slice()])));

// One panel per layer. `visible` limits which points exist yet (for the build).
function layerPanel(index, lc, layers, { visible = Infinity, hot = new Set(), ring = new Set(), good = new Set(), focus = null, rays = [], query = null, newLinks = [], onPick = null, big = false }) {
  const S = big ? 360 : 200, pad = 10, X = (v) => pad + (v / 100) * (S - 2 * pad), Y = (v) => S - pad - (v / 100) * (S - 2 * pad);
  const layer = layers[lc] ?? new Map();
  const kids = [h("rect", { x: 0, y: 0, width: S, height: S, rx: 10, class: "hn-bg" })];
  const pts = index.points;
  for (const [a, list] of layer) if (a < visible) for (const b of list) if (b < visible && (a < b || !layer.get(b)?.includes(a))) kids.push(h("line", { x1: X(pts[a].x), y1: Y(pts[a].y), x2: X(pts[b].x), y2: Y(pts[b].y), class: "hn-edge" }));
  for (const [a, b] of newLinks) kids.push(h("line", { x1: X(pts[a].x), y1: Y(pts[a].y), x2: X(pts[b].x), y2: Y(pts[b].y), class: "hn-edge new" }));
  for (const [a, b] of rays) kids.push(h("line", { x1: X(pts[a].x), y1: Y(pts[a].y), x2: X(pts[b].x), y2: Y(pts[b].y), class: "hn-ray" }));
  for (let i = 0; i < Math.min(visible, pts.length); i++) {
    const on = layer.has(i);
    if (!on && lc > 0) continue;
    const cls = `hn-pt${good.has(i) ? " good" : hot.has(i) ? " hot" : ""}${ring.has(i) ? " ring" : ""}${focus === i ? " focus" : ""}`;
    kids.push(h("circle", { cx: X(pts[i].x), cy: Y(pts[i].y), r: focus === i ? (big ? 6 : 5) : big ? 3.6 : 3, class: cls }));
  }
  if (query) kids.push(h("path", { d: `M${X(query.x) - 6},${Y(query.y)} h12 M${X(query.x)},${Y(query.y) - 6} v12`, class: "hn-q" }));
  const el = svg(S, S, `Layer ${lc}: ${[...layer.keys()].filter((k) => k < visible).length} points`, kids, "hn-svg");
  if (onPick) el.addEventListener("click", (e) => {
    const m = el.getScreenCTM?.();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    onPick({ x: Math.max(0, Math.min(100, ((pt.x - pad) / (S - 2 * pad)) * 100)), y: Math.max(0, Math.min(100, ((S - pad - pt.y) / (S - 2 * pad)) * 100)) });
  });
  return h("figure", { class: `hn-layer${lc === 0 ? " base" : ""}` }, el, h("figcaption", null, `Layer ${lc} · ${[...layer.keys()].filter((k) => k < visible).length} points`));
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: p.get("mode") === "build" ? "build" : "search",
    n: int(p.get("n"), 5, 150, 60), seed: int(p.get("seed"), 1, 9999, 3),
    M: int(p.get("M"), 2, 10, 4), efC: int(p.get("efc"), 2, 100, 16), ef: int(p.get("ef"), 1, 100, 4), k: int(p.get("k"), 1, 10, 3),
    q: { x: Number(p.get("qx") ?? 47), y: Number(p.get("qy") ?? 53) },
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "HNSW vector search",
    lede: "Build a Hierarchical Navigable Small World graph point by point, then watch a search drop through its layers and compare it with brute force.",
    theory: h("div", null,
      h("p", null, "Vector databases must find the nearest of millions of embeddings in milliseconds. Comparing the query with every vector (", h("b", null, "brute force"), ") is exact but slow. ", h("b", null, "Approximate nearest neighbour"), " indexes trade a little accuracy for a lot of speed; HNSW is one of the most widely used."),
      h("ul", null,
        h("li", null, h("b", null, "Layers like a skip list"), ": every point is on layer 0; each point also reaches higher layers with shrinking probability, so the top layers are sparse \"motorways\" and layer 0 is the dense local road network."),
        h("li", null, h("b", null, "Insert"), ": pick the new point's top layer at random, walk greedily down from the entry point to that layer, then on each layer below search for close points and link to the M closest (2M allowed on layer 0). Neighbours that end up with too many links drop their furthest."),
        h("li", null, h("b", null, "Search"), ": start at the entry point on the top layer and hop to whichever neighbour is closer to the query until none is; drop a layer and repeat. On layer 0 keep a beam of the ", h("b", null, "ef"), " best candidates instead of one, which recovers from dead ends."),
        h("li", null, h("b", null, "Recall@k"), " is the share of the true k nearest neighbours the search returns. A larger ef (or M) raises recall and costs more distance computations.")),
      h("p", null, "Real indexes hold hundreds of dimensions and millions of points, choose neighbours with a heuristic that favours links in different directions, and are tuned with M around 16 and ef in the hundreds. Here everything is 2D so you can see it; in 2D a simple grid would also work, and high dimensions are where graphs earn their keep.")),
    conventions: [
      "Top layer for a new point: ⌊−ln(U) / ln(M)⌋ with U uniform in (0, 1], from a seeded generator.",
      "Neighbour selection keeps the closest (the paper's simple method, not its diversity heuristic).",
      "Every distance worked out during the search is counted, including the entry point.",
      "Click or tap any layer to move the query (the cross).",
    ],
  });

  const field = (label, key, lo, hi) => h("label", { class: "inline" }, label, " ", h("input", { type: "number", min: lo, max: hi, value: state[key], onchange: (e) => { state[key] = int(e.target.value, lo, hi, state[key]); e.target.value = state[key]; update(); } }));
  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; update(); } }, [["search", "Search"], ["build", "Build the graph"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const out = h("div");

  function update() {
    writeParams({ mode: state.mode, n: state.n, seed: state.seed, M: state.M, efc: state.efC, ef: state.ef, k: state.k, qx: state.q.x.toFixed(1), qy: state.q.y.toFixed(1) });
    sim?.player.destroy();
    const points = randomPoints(state.n, state.seed);
    const index = new HNSW({ M: state.M, efConstruction: state.efC, seed: state.seed });
    const snaps = [];
    for (const pt of points) { index.insert(pt); snaps.push(copyLayers(index.layers)); }
    const top = index.top;
    const order = Array.from({ length: top + 1 }, (_, i) => top - i);
    const pick = (q) => { state.q = q; state.mode = "search"; modeSel.value = "search"; update(); };

    if (state.mode === "build") {
      const steps = index.log.map((ev, i) => ({
        line: ev.newEntry ? [1, 3, 5, 7] : [1, 2, 3, 4, 5, 6], ev, i,
        vars: { point: ev.id, "top layer": ev.l, links: ev.links.map((l) => `L${l.layer}: ${l.to.length}`), distances: ev.counter.n, "entry point": i === 0 || ev.newEntry ? ev.id : undefined },
        note: i === 0 ? `Point ${ev.id} is first, so it becomes the entry point, on layers 0 to ${ev.l}.` : `Point ${ev.id} draws top layer ${ev.l}. ${ev.links.map((l) => `Layer ${l.layer}: links to ${l.to.join(", ")}`).join(". ")}. ${ev.counter.n} distances measured.${ev.newEntry ? " It reaches higher than anyone before, so it becomes the new entry point." : ""}`,
        final: i === index.log.length - 1,
      }));
      sim = traceSim({ steps, code: BUILD_CODE, interval: 500, start: steps.length - 1, draw: (s) => h("div", { class: "hn-grid" }, order.map((lc) => {
        const links = s.ev.links.find((l) => l.layer === lc)?.to ?? [];
        return layerPanel(index, lc, snaps[s.i], { visible: s.i + 1, focus: s.ev.id, hot: new Set(links), newLinks: links.map((b) => [s.ev.id, b]), big: lc === 0 });
      })) });
      const counts = order.map((lc) => `layer ${lc}: ${index.layers[lc].size}`);
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Building: ${state.n} points, M = ${state.M}, efConstruction = ${state.efC}`), sim.el,
        h("p", { class: "muted small" }, `Points per layer: ${counts.join(", ")}. Each layer up holds roughly 1/${state.M} of the one below.`)));
      return;
    }

    const res = index.search(state.q, state.k, state.ef, { trace: true });
    const truth = bruteForce(points, state.q, state.k);
    const steps = [{ line: 1, ev: null, upto: -1, vars: { entry: index.entry, "top layer": top, distances: 0 }, note: `Start at the entry point, ${index.entry}, on the top layer (${top}).` }];
    let measured = 0;
    const path = [index.entry];
    res.trace.forEach((ev, i) => {
      measured += ev.measured.length;
      if (ev.layer > 0 && ev.kind === "expand" && ev.W[0] !== path.at(-1)) path.push(ev.W[0]);
      const line = ev.layer > 0 ? [2, 3] : ev.kind === "start" ? 4 : ev.kind === "stop" ? 6 : [5, 7];
      const note = ev.kind === "start"
        ? (ev.layer > 0 ? `Layer ${ev.layer}: greedy search from ${ev.W[0]}.` : `Layer 0: beam search from ${ev.W[0]}, keeping the ${Math.max(state.ef, state.k)} closest found.`)
        : ev.kind === "stop" ? `The closest unexpanded candidate (${ev.c}) is further than everything kept, so layer ${ev.layer} is done.`
        : `Expand ${ev.c}: measure ${ev.measured.length ? ev.measured.join(", ") : "nothing new"}. Best so far: ${ev.W.slice(0, 3).join(", ")}${ev.W.length > 3 ? ", …" : ""}.`;
      steps.push({ line, ev, upto: i, vars: { layer: ev.layer, current: ev.c, kept: ev.W, distances: measured }, note });
    });
    const recall = recallOf(res.results, truth);
    steps.push({ line: 8, ev: null, upto: res.trace.length - 1, final: true, vars: { results: res.results, "true nearest": truth, distances: res.count }, note: `Returned ${res.results.join(", ")} after ${res.count} distance computations (brute force needs ${state.n}). Recall@${state.k} = ${Math.round(recall * 100)}%.${recall < 1 ? " Raise ef to widen the beam." : ""}` });
    sim = traceSim({ steps, code: SEARCH_CODE, interval: 800, draw: (s) => {
      const seen = new Set(), evs = res.trace.slice(0, s.upto + 1);
      evs.forEach((e) => e.measured.forEach((m) => seen.add(m)));
      seen.add(index.entry);
      const ev = s.ev;
      return h("div", { class: "hn-grid" }, order.map((lc) => {
        const here = ev && ev.layer === lc;
        const lastOnLayer = [...evs].reverse().find((e) => e.layer === lc);
        return layerPanel(index, lc, index.layers, {
          query: state.q, ring: s.final ? new Set(truth) : seen,
          hot: new Set(here ? ev.W : lastOnLayer?.W.slice(0, lc > 0 ? 1 : undefined) ?? []),
          good: new Set(s.final && lc === 0 ? res.results : []),
          focus: here ? ev.c ?? ev.W[0] : null,
          rays: here && ev.kind === "expand" ? ev.measured.map((m) => [ev.c, m]) : [],
          onPick: pick, big: lc === 0,
        });
      }));
    } });
    const avg = evaluate(index, { queries: 50, k: state.k, ef: state.ef, seed: state.seed + 1 });
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Search for the ${state.k} nearest to (${state.q.x.toFixed(1)}, ${state.q.y.toFixed(1)})`),
      h("div", { class: "legend-chips" }, h("span", null, h("i", { class: "hn-key q" }), "query"), h("span", null, h("i", { class: "hn-key hot" }), "kept candidates"), h("span", null, h("i", { class: "hn-key ring" }), s0()), h("span", null, h("i", { class: "hn-key good" }), "returned")),
      sim.el,
      h("div", { class: "stats-row" },
        stat("Distances (HNSW)", res.count), stat("Distances (brute force)", state.n), stat(`Recall@${state.k}, this query`, `${Math.round(recall * 100)}%`),
        stat(`Average over 50 queries`, `${Math.round(avg.recall * 100)}% · ${avg.distances.toFixed(0)} distances`))));
  }
  const s0 = () => "measured (at the end: true nearest)";

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel, field("Points", "n", 5, 150), field("Seed", "seed", 1, 9999)),
      h("div", { class: "row" }, field("M", "M", 2, 10), field("efConstruction", "efC", 2, 100), field("ef (search)", "ef", 1, 100), field("k", "k", 1, 10)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.seed = 1 + Math.floor(Math.random() * 9999); update(); visual.querySelectorAll("input")[1].value = state.seed; } }, "New points"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.q = { x: Math.round(Math.random() * 1000) / 10, y: Math.round(Math.random() * 1000) / 10 }; state.mode = "search"; modeSel.value = "search"; update(); } }, "Random query"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link"))),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      const M = [2, 4, 8, 16][Math.floor(r() * 4)], U = Number((0.001 + r() * 0.5).toFixed(3));
      const l = levelFor(U, M);
      return { kind: "Levels", title: `M = ${M} and the random draw is U = ${U}. What is the new point's top layer?`, body: h("p", { class: "muted small" }, "l = ⌊−ln(U) / ln(M)⌋."),
        answer: approxQuestion(l, `−ln(${U}) = ${(-Math.log(U)).toFixed(3)}, ÷ ln(${M}) = ${(-Math.log(U) / Math.log(M)).toFixed(3)}, rounded down: ${l}.`, { tol: 0 }) };
    }
    if (kind === 1) {
      const k = 3 + Math.floor(r() * 4);
      const truth = Array.from({ length: k }, (_, i) => i + 1);
      const hits = 1 + Math.floor(r() * k);
      const found = [...truth.slice(0, hits), ...Array.from({ length: k - hits }, (_, i) => 20 + i)].sort(() => r() - 0.5);
      return { kind: "Recall", title: `The true ${k} nearest are {${truth.join(", ")}}. The index returned {${found.join(", ")}}. What is recall@${k}?`, body: h("p", { class: "muted small" }, "As a decimal, to 2 places."),
        answer: approxQuestion(Number((hits / k).toFixed(2)), `${hits} of the ${k} true neighbours were found: ${hits}/${k} = ${(hits / k).toFixed(3)}.`, { tol: 0.011 }) };
    }
    const M = [2, 4, 8][Math.floor(r() * 3)], n = [1000, 10000, 100000][Math.floor(r() * 3)], L = 1 + Math.floor(r() * 2);
    const v = n / M ** L;
    return { kind: "Layer sizes", title: `With M = ${M}, about how many of ${n.toLocaleString("en-GB")} points reach layer ${L} or above?`, body: h("p", { class: "muted small" }, "Each layer keeps about 1/M of the one below. Round to a whole number."),
      answer: approxQuestion(Math.round(v), `P(top layer ≥ ${L}) = (1/${M})^${L} = 1/${M ** L}, so about ${n.toLocaleString("en-GB")} / ${M ** L} ≈ ${Math.round(v)}.`, { tol: 1 }) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
