import { CODE, D_MODEL, WEIGHTS, attend, weightQuestion } from "../engines/attention.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs } from "./kit.js";
import { approxQuestion, heatmap, matrix, num, practiceCard, series, svg, traceSim } from "./ai-kit.js";

// Who looks at whom: arcs from the query token to every key, thicker for more weight.
function arcs(tokens, weights, row) {
  const W = 360, step = (W - 40) / Math.max(1, tokens.length - 1), base = 120;
  const x = (j) => (tokens.length === 1 ? W / 2 : 20 + j * step);
  const kids = [];
  if (row >= 0 && weights) weights.forEach((w, j) => {
    if (w <= 0) return;
    const x1 = x(row), x2 = x(j), mid = (x1 + x2) / 2, hgt = Math.min(95, 18 + Math.abs(x2 - x1) * 0.45);
    kids.push(h("path", { d: j === row ? `M${x1 - 6},${base - 14} C${x1 - 22},${base - 50} ${x1 + 22},${base - 50} ${x1 + 6},${base - 14}` : `M${x1},${base - 14} Q${mid},${base - 14 - hgt * 2} ${x2},${base - 14}`, class: "ai-arc", style: `stroke-width:${Math.max(0.6, w * 12)};opacity:${0.25 + w * 0.75}` }));
  });
  tokens.forEach((t, j) => kids.push(h("text", { x: x(j), y: base + 4, "text-anchor": "middle", class: `ai-arc-t${j === row ? " q" : ""}`, style: `--c:${series(j)}` }, t)));
  return svg(W, base + 14, row >= 0 ? `Arcs from "${tokens[row]}" to the tokens it attends to` : "Tokens", kids, "ai-arcs");
}

export function render(root) {
  const p = readParams();
  const state = {
    text: p.get("s") ?? "the cat sat on the mat",
    causal: p.get("causal") === "1",
    heads: p.get("heads") === "2" ? 2 : 1,
    positions: p.get("pos") !== "0",
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "Attention",
    lede: "Scaled dot-product attention worked through on a short sentence: scores, scaling, the causal mask, softmax row by row and the weighted sum of values.",
    theory: h("div", null,
      h("p", null, "Attention lets each token build its new representation from the other tokens, weighting them by relevance. Every token has a ", h("b", null, "query"), " (what it is looking for), a ", h("b", null, "key"), " (what it offers to others) and a ", h("b", null, "value"), " (what it passes on), each made by multiplying its vector by a learned matrix."),
      h("p", { class: "mono-notes" }, "Attention(Q, K, V) = softmax(Q·Kᵀ / √d) · V"),
      h("ul", null,
        h("li", null, h("b", null, "Q·Kᵀ"), ": the score of token i for token j is the dot product of i's query and j's key."),
        h("li", null, h("b", null, "÷ √d"), ": dot products grow with the vector size d; scaling keeps softmax from saturating, where one weight is nearly 1 and learning stalls."),
        h("li", null, h("b", null, "Causal mask"), ": in a model that writes text left to right, token i must not see later tokens, so their scores are set to −∞ before softmax."),
        h("li", null, h("b", null, "Softmax"), " turns each row of scores into weights that are positive and add up to 1."),
        h("li", null, h("b", null, "Weighted sum"), ": token i's output is Σ w[i][j]·V[j], a blend of the values it attends to."),
        h("li", null, h("b", null, "Multi-head"), ": several smaller attentions run side by side on different slices, so one head can track, say, the previous word while another tracks the subject. Their outputs are joined.")),
      h("p", null, "Everything here is tiny and ", h("b", null, "not trained"), `: the ${D_MODEL}-number word vectors and the Wq, Wk, Wv matrices come from a fixed random seed, so the patterns don't mean anything linguistic. Real models use vectors of thousands of numbers, dozens of layers and heads, and add an output matrix, residual connections and normalisation around each attention block.`)),
    conventions: [
      `d_model = ${D_MODEL}. With 2 heads each head uses 2 columns of Q, K and V and scales by √2.`,
      "Word vectors depend only on the word, so the two \"the\"s are identical until a sinusoidal position signal is added.",
      "Numbers are rounded for display; the calculations use full precision.",
    ],
  });

  const textIn = h("input", { type: "text", value: state.text, class: "ai-wide", "aria-label": "Sentence (up to 8 words)", onchange: (e) => { state.text = e.target.value; update(); } });
  const causalIn = h("input", { type: "checkbox", checked: state.causal, onchange: (e) => { state.causal = e.target.checked; update(); } });
  const posIn = h("input", { type: "checkbox", checked: state.positions, onchange: (e) => { state.positions = e.target.checked; update(); } });
  const headsSel = h("select", { "aria-label": "Heads", onchange: (e) => { state.heads = Number(e.target.value); update(); } }, [1, 2].map((n) => h("option", { value: n, selected: n === state.heads }, `${n} head${n > 1 ? "s" : ""}`)));
  const msg = h("div"), out = h("div");

  function update() {
    writeParams({ s: state.text, causal: state.causal ? 1 : 0, heads: state.heads, pos: state.positions ? 1 : 0 });
    sim?.player.destroy();
    let a;
    try { a = attend(state.text, state); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren(state.text.trim().split(/\s+/).length > 8 ? notice("info", "Only the first 8 words are used.") : "");
    const toks = a.tokens, labels = toks.map((t, i) => `${t}${toks.indexOf(t) !== i ? `·${i + 1}` : ""}`);
    const dk = a.dk;
    const draw = (s) => {
      if (s.phase === "x") return h("div", null, arcs(labels, null, -1), matrix(a.X, { rows: labels, cols: Array.from({ length: D_MODEL }, (_, j) => `x${j + 1}`), title: state.positions ? "X = word vector + position" : "X = word vectors" }));
      if (s.phase === "qkv") return h("div", { class: "ai-mats" },
        matrix(WEIGHTS.Wq, { title: "Wq (learned in a real model)", digits: 1 }),
        matrix(a.Q, { rows: labels, title: "Q = X·Wq" }), matrix(a.K, { rows: labels, title: "K = X·Wk" }), matrix(a.V, { rows: labels, title: "V = X·Wv" }));
      const hd = a.heads[s.head];
      const i = s.row;
      const doneRows = s.phase === "softmax" || s.phase === "out" || s.phase === "concat" ? i : i - 1;
      const masked = s.phase === "score" ? hd.raw[i] : hd.scores[i];
      const scoreRows = hd.raw.map((r, k) => (k < i ? hd.scores[k] : k === i ? masked : r.map(() => NaN)));
      const cols = labels;
      return h("div", null,
        a.heads.length > 1 ? h("p", { class: "eyebrow" }, `Head ${s.head + 1} of ${a.heads.length}`) : null,
        arcs(labels, s.phase === "softmax" || s.phase === "out" || s.phase === "concat" ? hd.weights[i] : null, i),
        h("div", { class: "ai-mats" },
          h("div", null, h("div", { class: "panel-title" }, `Scores Q·Kᵀ / √${dk}${state.causal ? " (masked)" : ""}`),
            matrix(scoreRows.map((r, k) => (k <= i ? r : r.map(() => "")).map((x) => (x === "" || Number.isNaN(x) ? "" : x))), { rows: labels, cols, hot: i })),
          h("div", null, h("div", { class: "panel-title" }, "Weights = softmax(scores)"),
            heatmap({ rows: labels, cols, matrix: hd.weights, upto: doneRows, row: i, mask: state.causal ? hd.weights.map((r, k) => r.map((_, j) => j > k)) : null, caption: `Attention weights, rows done up to ${doneRows + 1}` }))),
        s.phase === "out" || s.phase === "concat" ? matrix(hd.out.slice(0, i + 1), { rows: labels.slice(0, i + 1), cols: Array.from({ length: dk }, (_, j) => `o${j + 1}`), hot: i, title: `Output rows (head ${s.head + 1})` }) : null);
    };
    sim = traceSim({ steps: a.steps, code: CODE, draw, interval: 1200 });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `Attention over "${toks.join(" ")}"`), sim.el),
      h("section", { class: "card" }, h("h2", null, a.heads.length > 1 ? "Final weights, both heads" : "Final weights"),
        h("div", { class: "ai-mats" }, a.heads.map((hd, k) => h("div", null, a.heads.length > 1 ? h("div", { class: "panel-title" }, `Head ${k + 1}`) : null,
          heatmap({ rows: labels, cols: labels, matrix: hd.weights, mask: state.causal ? hd.weights.map((r, i) => r.map((_, j) => j > i)) : null })))),
        h("p", { class: "muted small" }, `Each row is one token's attention and adds up to 1.${state.causal ? " The grey upper triangle is the causal mask: nobody sees the future, and the first token can only attend to itself." : " Without a mask every token sees every other, as in an encoder like BERT."}`),
        matrix(a.output, { rows: labels, cols: Array.from({ length: D_MODEL }, (_, j) => `o${j + 1}`), title: a.heads.length > 1 ? "Output (heads joined)" : "Output" })));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, textIn),
      h("div", { class: "row" },
        h("label", { class: "inline" }, causalIn, "Causal mask"),
        h("label", { class: "inline" }, posIn, "Add positions"),
        headsSel,
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("div", { class: "row" }, ["the cat sat on the mat", "dog bites man", "man bites dog", "she gave him the book"].map((t) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.text = t; textIn.value = t; update(); } }, t))),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      const q = weightQuestion(r);
      return { kind: "Attention weight", title: `Query q = [${q.q.join(", ")}], keys k1 = [${q.K[0].join(", ")}], k2 = [${q.K[1].join(", ")}], k3 = [${q.K[2].join(", ")}], d = 2. What weight goes to k${q.j + 1}?`,
        body: h("p", { class: "muted small" }, "Score = q·k / √2, then softmax over the three scores. To 2 decimal places."),
        answer: approxQuestion(Number(q.answer.toFixed(2)), `Scores ${q.scores.map((x) => num(x, 3)).join(", ")}; softmax gives ${q.weights.map((x) => num(x, 3)).join(", ")}.`, { tol: 0.011 }) };
    }
    if (kind === 1) {
      const n = 4 + Math.floor(r() * 5), i = 1 + Math.floor(r() * n);
      return { kind: "Causal mask", title: `A ${n}-token sentence with a causal mask. How many non-zero weights are in the attention row of token ${i}?`,
        answer: approxQuestion(i, `Token ${i} sees itself and the ${i - 1} before it; the ${n - i} after it are masked to −∞, so they get weight 0.`, { tol: 0 }) };
    }
    const d = [4, 16, 64][Math.floor(r() * 3)], dotv = Math.round((r() * 2 - 0.5) * Math.sqrt(d) * 4);
    return { kind: "Scaling", title: `A query and key of size d = ${d} have dot product ${dotv}. What is the scaled score?`,
      answer: approxQuestion(Number((dotv / Math.sqrt(d)).toFixed(2)), `${dotv} / √${d} = ${dotv} / ${Math.sqrt(d)} = ${num(dotv / Math.sqrt(d), 3)}.`, { tol: 0.011 }) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
