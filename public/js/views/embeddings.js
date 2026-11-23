import { ANALOGY_CODE, AXES, METRICS, NEIGHBOUR_CODE, SEARCH_CODE, SENTENCES, VECTORS, WORDS, analogy, cosine, euclidean, neighbours, pca, rank, search } from "../engines/vectors.js";
import { copyLink, h, page, readParams, rng, writeParams } from "../ui.js";
import { choice, mountTabs, stat } from "./kit.js";
import { approxQuestion, bars, mix, num, practiceCard, svg, traceSim } from "./ai-kit.js";

const P = pca(Object.values(VECTORS), 2);
const XY = Object.fromEntries(WORDS.map((w, i) => [w, P.points[i]]));

function scatter({ hot = [], query = null, lines = [], arrows = [], extra = [] }) {
  const W = 360, H = 300, pad = 30;
  const pts = [...Object.values(XY), ...extra.map((e) => e.p)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const hotSet = new Set(hot);
  const kids = [
    h("defs", null, h("marker", { id: "ai-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M0,0 L10,5 L0,10 z", class: "ai-arrowhead" }))),
    h("line", { x1: X(0), x2: X(0), y1: pad / 2, y2: H - pad / 2, class: "ai-axis faint" }),
    h("line", { y1: Y(0), y2: Y(0), x1: pad / 2, x2: W - pad / 2, class: "ai-axis faint" }),
  ];
  for (const [a, b] of lines) if (XY[a] && XY[b]) kids.push(h("line", { x1: X(XY[a][0]), y1: Y(XY[a][1]), x2: X(XY[b][0]), y2: Y(XY[b][1]), class: "ai-link" }));
  for (const ar of arrows) kids.push(h("line", { x1: X(ar.from[0]), y1: Y(ar.from[1]), x2: X(ar.to[0]), y2: Y(ar.to[1]), class: `ai-vec ${ar.cls ?? ""}`, "marker-end": "url(#ai-arrow)" }));
  for (const w of WORDS) {
    const [x, y] = XY[w];
    const cls = w === query ? " q" : hotSet.has(w) ? " hot" : "";
    kids.push(h("g", { class: `ai-pt${cls}` }, h("circle", { cx: X(x), cy: Y(y), r: w === query ? 6 : 4 }), h("text", { x: X(x) + 7, y: Y(y) + 4 }, w)));
  }
  for (const e of extra) kids.push(h("g", { class: "ai-pt target" }, h("rect", { x: X(e.p[0]) - 5, y: Y(e.p[1]) - 5, width: 10, height: 10, transform: `rotate(45 ${X(e.p[0])} ${Y(e.p[1])})` }), h("text", { x: X(e.p[0]) + 8, y: Y(e.p[1]) - 6 }, e.label)));
  return svg(W, H, `Words projected to 2D with PCA${query ? `, ${query} highlighted` : ""}`, kids, "ai-scatter");
}

function axisStrip(rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "ai-axes" },
    h("thead", null, h("tr", null, h("th"), AXES.map((a) => h("th", { scope: "col" }, a)))),
    h("tbody", null, rows.map(([label, v]) => h("tr", null, h("th", { scope: "row" }, label), v.map((x) => h("td", { style: `background:${x >= 0 ? mix(x * 90) : mix(-x * 90, "var(--bad)")}` }, num(x))))))));
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: ["neighbours", "analogy", "search"].includes(p.get("mode")) ? p.get("mode") : "neighbours",
    word: VECTORS[p.get("w")] ? p.get("w") : "kitten",
    metric: METRICS[p.get("metric")] ? p.get("metric") : "cosine",
    a: VECTORS[p.get("a")] ? p.get("a") : "man", b: VECTORS[p.get("b")] ? p.get("b") : "king", c: VECTORS[p.get("c")] ? p.get("c") : "woman",
    query: p.get("q") ?? "royal home",
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "Embeddings",
    lede: "Words as vectors: measure how close they are three ways, find neighbours, do analogy arithmetic and search sentences by meaning.",
    theory: h("div", null,
      h("p", null, "An ", h("b", null, "embedding"), " is a list of numbers standing for a word, sentence or image, placed so that similar things end up close together. Search, recommendations, clustering and retrieval for RAG all rely on this."),
      h("p", null, "The vectors here are ", h("b", null, "made by hand"), " with 8 readable axes (royal, male, female, young, animal, feline, food, place) so you can check every number. Learned embeddings have hundreds or thousands of dimensions, come from training on huge amounts of text, and their individual dimensions usually don't mean anything on their own."),
      h("ul", null,
        h("li", null, h("b", null, "Dot product"), " Σ aᵢbᵢ grows with both the angle and the lengths, so long vectors win."),
        h("li", null, h("b", null, "Cosine similarity"), " divides by both lengths, leaving only the angle: 1 means same direction, 0 unrelated. For vectors scaled to length 1 it equals the dot product, which is why many vector databases normalise first."),
        h("li", null, h("b", null, "Euclidean distance"), " is the straight-line gap; smaller is closer.")),
      h("p", null, h("b", null, "Analogies"), ": if the step from man to king is \"add royalty\", adding the same step to woman should land near queen. This worked famously with word2vec, but on real embeddings it is less reliable than the examples suggest."),
      h("p", null, "The scatter plot uses ", h("b", null, "PCA"), " to flatten 8 dimensions into the 2 that keep the most spread. ", `Here those 2 keep ${Math.round((P.explained[0] + P.explained[1]) * 100)}% of the variance, so points that look close in 2D may not be close in 8D: trust the scores, not the picture.`)),
    conventions: [
      "Analogy answers leave out the three input words.",
      "Sentence vectors are the average of the vectors of the words we have; other words are skipped.",
      "PCA is computed in your browser by power iteration on the 8 × 8 covariance matrix.",
    ],
  });

  const opt = (list, cur) => list.map((w) => h("option", { value: w, selected: w === cur }, w));
  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; update(); } },
    [["neighbours", "Nearest neighbours"], ["analogy", "Analogy"], ["search", "Semantic search"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const metricSel = h("select", { "aria-label": "Metric", onchange: (e) => { state.metric = e.target.value; update(); } }, Object.entries(METRICS).map(([k, m]) => h("option", { value: k, selected: k === state.metric }, m.name)));
  const wordSel = h("select", { "aria-label": "Word", onchange: (e) => { state.word = e.target.value; update(); } }, opt(WORDS, state.word));
  const abc = ["a", "b", "c"].map((k) => h("select", { "aria-label": `Word ${k}`, onchange: (e) => { state[k] = e.target.value; update(); } }, opt(WORDS, state[k])));
  const queryIn = h("input", { type: "text", value: state.query, class: "ai-wide", "aria-label": "Search query", onchange: (e) => { state.query = e.target.value; update(); } });
  const controls = h("div", { class: "row" });
  const out = h("div");

  function update() {
    writeParams({ mode: state.mode, metric: state.metric, ...(state.mode === "neighbours" ? { w: state.word } : state.mode === "analogy" ? { a: state.a, b: state.b, c: state.c } : { q: state.query }) });
    sim?.player.destroy();
    const m = METRICS[state.metric];
    if (state.mode === "neighbours") {
      controls.replaceChildren(h("label", { class: "inline" }, "Word ", wordSel), h("label", { class: "inline" }, "Metric ", metricSel));
      const res = neighbours(state.word, { metric: state.metric, k: 5 });
      sim = traceSim({ steps: res.steps, code: NEIGHBOUR_CODE, start: res.steps.length - 1, interval: 500, draw: (s) => h("div", null,
        scatter({ query: state.word, hot: s.best.map((b) => b.word), lines: [...s.best.map((b) => [state.word, b.word]), ...(s.current ? [[state.word, s.current]] : [])] }),
        axisStrip([[state.word, VECTORS[state.word]], ...(s.current ? [[s.current, VECTORS[s.current]]] : s.best.slice(0, 1).map((b) => [b.word, VECTORS[b.word]]))])) });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Nearest to "${state.word}" by ${m.name.toLowerCase()}`), sim.el), metricCard());
    } else if (state.mode === "analogy") {
      controls.replaceChildren(abc[0], h("span", null, "is to"), abc[1], h("span", null, "as"), abc[2], h("span", null, "is to ?"), h("label", { class: "inline" }, "Metric ", metricSel));
      const res = analogy(state.a, state.b, state.c, { metric: state.metric });
      const T = P.project(res.target);
      sim = traceSim({ steps: res.steps, code: ANALOGY_CODE, draw: (s) => h("div", null,
        scatter({ query: state.c, hot: [state.a, state.b, ...(s.final ? [res.answer] : [])], arrows: s.target ? [{ from: XY[state.a], to: XY[state.b] }, { from: XY[state.c], to: T, cls: "alt" }] : [{ from: XY[state.a], to: XY[state.b] }], extra: s.target ? [{ p: T, label: "t" }] : [] }),
        s.ranked ? bars({ labels: s.ranked.map((x) => x.word), values: s.ranked.map((x) => x.score), kind: state.metric === "euclidean" ? "prob" : "logit", chosen: s.final ? 0 : null, scale: "fit", caption: "Best candidates" }) : null,
        axisStrip([[state.a, VECTORS[state.a]], [state.b, VECTORS[state.b]], [state.c, VECTORS[state.c]], ...(s.target ? [["t", s.target]] : []), ...(s.final ? [[res.answer, VECTORS[res.answer]]] : [])])) });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.a} : ${state.b} :: ${state.c} : ?`),
        h("div", { class: "row" }, [["man", "king", "woman"], ["dog", "puppy", "cat"], ["man", "boy", "woman"], ["queen", "palace", "boy"]].map(([a, b, c]) => h("button", { type: "button", class: "btn ghost small", onclick: () => { Object.assign(state, { a, b, c }); abc.forEach((s, i) => { s.value = [a, b, c][i]; }); update(); } }, `${a} : ${b} :: ${c} : ?`))),
        sim.el));
    } else {
      controls.replaceChildren(h("label", { class: "inline ai-grow" }, "Query ", queryIn));
      const res = search(state.query);
      sim = traceSim({ steps: res.steps, code: SEARCH_CODE, interval: 900, draw: (s) => h("div", null,
        scatter({ hot: res.query.known, query: null }),
        h("ol", { class: "ai-results" }, (s.ranked ?? s.scores).map((r) => h("li", { class: r.i === s.current ? "hot" : null },
          h("span", { class: "ai-score", style: `--w:${Math.max(0, r.score) * 100}%` }, num(r.score, 3)), " ", SENTENCES[r.i], h("span", { class: "muted small" }, ` (D${r.i + 1}: ${r.known.join(", ")})`))))) });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, "Semantic search with averaged word vectors"),
        h("div", { class: "row" }, ["royal home", "cake and bread", "pet food", "young animal"].map((q) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.query = q; queryIn.value = q; update(); } }, q))),
        sim.el,
        h("p", { class: "muted small" }, `Words with a vector: ${WORDS.join(", ")}. "royal home" shares no word with sentence 1, yet matches it best, which keyword search could never do. "young animal" finds nothing: neither word has a vector, a reminder that a real embedding model must cover the words people actually type.`)));
    }
  }

  function metricCard() {
    const q = VECTORS[state.word];
    const others = WORDS.filter((w) => w !== state.word);
    const top = (metric) => rank(q, others.map((w) => [w, VECTORS[w]]), metric).slice(0, 3).map((x) => `${x.word} (${num(x.score, 2)})`).join(", ");
    return h("section", { class: "card" }, h("h2", null, "Same word, three metrics"),
      h("div", { class: "stats-row facts" }, Object.entries(METRICS).map(([k, m]) => stat(`${m.name} · ${m.formula}`, top(k), true))),
      h("p", { class: "muted small" }, "Dot product favours long vectors (words strong on several axes), cosine only looks at direction, and Euclidean distance punishes any difference in length."));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, h("div", { class: "row" }, modeSel, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), controls),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    const int = () => Math.floor(r() * 7) - 3;
    if (kind === 0) {
      let a, b;
      do { a = [int(), int(), int()]; b = [int(), int(), int()]; } while (!a.some(Boolean) || !b.some(Boolean));
      const c = cosine(a, b);
      return { kind: "Cosine", title: `Cosine similarity of a = [${a.join(", ")}] and b = [${b.join(", ")}]?`, body: h("p", { class: "muted small" }, "To 2 decimal places."),
        answer: approxQuestion(Number(c.toFixed(2)), `a·b = ${a.reduce((s, x, i) => s + x * b[i], 0)}, |a| = ${Math.hypot(...a).toFixed(3)}, |b| = ${Math.hypot(...b).toFixed(3)}, so cos = ${c.toFixed(4)}.`, { tol: 0.011 }) };
    }
    if (kind === 1) {
      const a = [int(), int()], b = [int(), int()];
      const d = euclidean(a, b);
      return { kind: "Distance", title: `Euclidean distance between [${a.join(", ")}] and [${b.join(", ")}]?`, body: h("p", { class: "muted small" }, "To 2 decimal places."),
        answer: approxQuestion(Number(d.toFixed(2)), `√((${a[0]} − ${b[0]})² + (${a[1]} − ${b[1]})²) = ${d.toFixed(4)}.`, { tol: 0.011 }) };
    }
    const metric = Object.keys(METRICS)[Math.floor(r() * 3)];
    const w = WORDS[Math.floor(r() * WORDS.length)];
    const ranked = rank(VECTORS[w], WORDS.filter((x) => x !== w).map((x) => [x, VECTORS[x]]), metric);
    const picks = [ranked[0], ranked[3], ranked[8], ranked.at(-2)].map((x) => ({ label: x.word, correct: x === ranked[0] }));
    picks.sort(() => r() - 0.5);
    return { kind: "Neighbour", title: `Using ${METRICS[metric].name.toLowerCase()}, which word is closest to "${w}"?`,
      body: axisStrip([w, ...picks.map((x) => x.label)].map((x) => [x, VECTORS[x]])),
      answer: choice(picks, ranked.slice(0, 3).map((x) => `${x.word} ${num(x.score, 3)}`).join(", ") + ".") };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
