import { CANDIDATES, CODE, CONTEXT, PROMPT, draws, entropy, nucleus, run, softmax } from "../engines/sampling.js";
import { copyLink, h, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { approxQuestion, bars, num, practiceCard, traceSim } from "./ai-kit.js";

const clamp = (x, lo, hi, d) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

export function render(root) {
  const p = readParams();
  const z = p.get("z")?.split(",").map(Number);
  const state = {
    T: clamp(Number(p.get("T") ?? 1), 0, 3, 1),
    k: clamp(Number(p.get("k") ?? 0), 0, CANDIDATES.length, 0),
    p: clamp(Number(p.get("p") ?? 1), 0.05, 1, 1),
    penalty: clamp(Number(p.get("rp") ?? 1), 1, 3, 1),
    seed: clamp(Number(p.get("seed") ?? 6), 0, 99999, 6),
    cands: CANDIDATES.map((c, i) => ({ ...c, logit: z && Number.isFinite(z[i]) ? z[i] : c.logit })),
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "Sampling",
    lede: "How a model picks its next word: logits, temperature, top-k, top-p, repetition penalty and a seeded random draw.",
    theory: h("div", null,
      h("p", null, "At every step a language model outputs a score (", h("b", null, "logit"), ") for every token in its vocabulary. A ", h("b", null, "decoding strategy"), " turns those scores into one chosen token, which is appended to the text before the next step."),
      h("ul", null,
        h("li", null, h("b", null, "Softmax"), " P(i) = e^(zᵢ/T) / Σⱼ e^(zⱼ/T) turns scores into probabilities."),
        h("li", null, h("b", null, "Temperature T"), " below 1 makes the favourite more likely (more predictable text); above 1 flattens the distribution (more varied, more mistakes). T = 0 is taken to mean greedy: always the top token."),
        h("li", null, h("b", null, "Top-k"), " keeps only the k highest-scoring tokens, cutting off the long tail of unlikely ones."),
        h("li", null, h("b", null, "Top-p (nucleus)"), " keeps the smallest set of top tokens whose probabilities add up to at least p. When the model is sure, that set is small; when it is unsure, it is large. This adapts in a way a fixed k can't."),
        h("li", null, h("b", null, "Repetition penalty"), " lowers the scores of tokens already in the text, to stop loops."),
        h("li", null, h("b", null, "Entropy"), " −Σ P log₂ P measures uncertainty in bits: 0 when one token is certain, log₂(n) when n are equally likely.")),
      h("p", null, "The ten candidate tokens and their scores are made up for illustration; a real model scores its whole vocabulary of tens of thousands of tokens. Providers also differ in which settings they offer, their defaults and the order they apply them in, and many add other options such as min-p or frequency and presence penalties.")),
    conventions: [
      "Order: repetition penalty, temperature, top-k, softmax, top-p, renormalise, draw.",
      "Repetition penalty p: a positive score already in the prompt is divided by p, a negative one multiplied by p.",
      "top-k = 0 and top-p = 1 mean off. Top-p always keeps at least one token.",
      "The draw takes r from a seeded generator and walks tokens from most to least likely until the running total passes r.",
    ],
  });

  const out = h("div");
  const seedIn = h("input", { type: "number", min: 0, max: 99999, value: state.seed, onchange: (e) => { state.seed = clamp(Number(e.target.value), 0, 99999, 6); update(); } });
  const slider = (label, key, min, max, step, fmt = (v) => v) => {
    const val = h("b", { class: "mono" }, fmt(state[key]));
    const input = h("input", { type: "range", min, max, step, value: state[key], "aria-label": label, oninput: (e) => { state[key] = Number(e.target.value); val.textContent = fmt(state[key]); update(); } });
    return h("label", { class: "ai-slider" }, h("span", null, label, " ", val), input);
  };
  const logitTable = h("div", { class: "ai-logits" }, state.cands.map((c, i) => h("label", { class: "inline" }, h("span", { class: "mono" }, c.token), h("input", { type: "number", step: 0.1, value: c.logit, "aria-label": `Score for ${c.token}`, onchange: (e) => { state.cands[i].logit = Number(e.target.value) || 0; update(); } }))));

  function update() {
    const changed = state.cands.some((c, i) => c.logit !== CANDIDATES[i].logit);
    writeParams({ T: state.T, k: state.k, p: state.p, rp: state.penalty, seed: state.seed, ...(changed ? { z: state.cands.map((c) => c.logit).join(",") } : {}) });
    sim?.player.destroy();
    const opts = { temperature: state.T, k: state.k, p: state.p, penalty: state.penalty, seed: state.seed, context: CONTEXT };
    const res = run(state.cands, opts);
    const labels = res.tokens.map((t) => (CONTEXT.includes(t) ? `${t}*` : t));
    sim = traceSim({ steps: res.steps, code: CODE, start: res.steps.length - 1, interval: 1100, draw: (s) => h("div", null,
      bars({ labels, values: s.values, kind: s.kind, removed: s.removed, chosen: s.chosen ?? null, before: s.before ?? null, highlight: s.nucleus ?? [], scale: s.kind === "prob" ? "fit" : "fit" }),
      s.r != null ? h("p", { class: "muted small" }, `r = ${s.r.toFixed(3)}. Running total from the top: ${(() => { let t = 0; return res.final.map((x, i) => [x, i]).filter(([x]) => x > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([x, i]) => `${res.tokens[i]} ${(t += x).toFixed(3)}`).join(", "); })()}.`) : null) });
    const n = 200;
    const counts = state.T === 0 ? res.final.map((x) => x * n) : draws(state.cands, opts, n);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `Next token after "${PROMPT} …"`), sim.el,
        h("p", { class: "muted small" }, "* already in the prompt, so the repetition penalty applies. Faint bars show the value before this step."),
        h("div", { class: "stats-row" },
          stat("Chosen", res.tokens[res.chosen]),
          stat("Its probability", `${(res.final[res.chosen] * 100).toFixed(1)}%`),
          stat("Entropy before", `${res.baseEntropy.toFixed(2)} bits`),
          stat("Entropy after", `${res.entropy.toFixed(2)} bits`))),
      h("section", { class: "card" }, h("h2", null, `${n} draws with these settings`),
        bars({ labels: res.tokens, values: counts.map((c) => c / n), kind: "prob", scale: "fit", caption: `Share of ${n} seeded draws per token` }),
        h("p", { class: "muted small" }, `Seeds ${state.seed * 1000} to ${state.seed * 1000 + n - 1}. The shares wobble around the final probabilities above; with more draws they would settle on them. ${state.T === 0 ? "Greedy: every draw is the same." : ""}`)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "ai-sliders" },
        slider("Temperature", "T", 0, 2, 0.1, (v) => (v === 0 ? "0 (greedy)" : v.toFixed(1))),
        slider("Top-k", "k", 0, CANDIDATES.length, 1, (v) => (v === 0 ? "off" : v)),
        slider("Top-p", "p", 0.05, 1, 0.05, (v) => (v >= 1 ? "1 (off)" : v.toFixed(2))),
        slider("Repetition penalty", "penalty", 1, 2, 0.1, (v) => v.toFixed(1)),
        h("label", { class: "inline" }, "Seed ", seedIn)),
      h("details", { class: "ai-details" }, h("summary", null, "Edit the scores"), logitTable),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.seed = Math.floor(Math.random() * 1000); seedIn.value = state.seed; update(); } }, "New seed"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { sim?.player.destroy(); writeParams({}); render(root); } }, "Reset"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link"))),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      const zs = [Math.floor(r() * 4) + 1, Math.floor(r() * 4), Math.floor(r() * 3) - 1];
      const T = [0.5, 1, 2][Math.floor(r() * 3)];
      const ps = softmax(zs, T);
      return { kind: "Temperature", title: `Scores A = ${zs[0]}, B = ${zs[1]}, C = ${zs[2]}. At temperature ${T}, what is P(A)?`, body: h("p", { class: "muted small" }, "To 2 decimal places."),
        answer: approxQuestion(Number(ps[0].toFixed(2)), `Divide by T: ${zs.map((x) => num(x / T)).join(", ")}; softmax gives ${ps.map((x) => x.toFixed(3)).join(", ")}.`, { tol: 0.011 }) };
    }
    if (kind === 1) {
      let raw = Array.from({ length: 5 }, () => 1 + Math.floor(r() * 9));
      const s = raw.reduce((a, b) => a + b, 0);
      const ps = raw.map((x) => Math.round((x / s) * 100) / 100);
      ps[0] = Number((1 - ps.slice(1).reduce((a, b) => a + b, 0)).toFixed(2));
      if (ps[0] <= 0) { ps[0] = 0.05; }
      const pp = [0.5, 0.7, 0.8, 0.9][Math.floor(r() * 4)];
      const keep = nucleus(ps, pp);
      return { kind: "Top-p", title: `Probabilities ${ps.map((x, i) => `${"ABCDE"[i]} ${x.toFixed(2)}`).join(", ")}. With top-p = ${pp}, how many tokens can be drawn?`,
        answer: approxQuestion(keep.length, `Sorted: ${keep.map((i) => `${"ABCDE"[i]} ${ps[i].toFixed(2)}`).join(", ")}; the running total first reaches ${pp} after ${keep.length} token${keep.length === 1 ? "" : "s"}.`, { tol: 0 }) };
    }
    const sets = [[0.5, 0.5], [0.25, 0.25, 0.25, 0.25], [0.5, 0.25, 0.25], [0.9, 0.1], [0.7, 0.2, 0.1], [0.125, 0.125, 0.25, 0.5]];
    const ps = sets[Math.floor(r() * sets.length)];
    const H = entropy(ps);
    return { kind: "Entropy", title: `What is the entropy, in bits, of the distribution [${ps.join(", ")}]?`, body: h("p", { class: "muted small" }, "H = −Σ p log₂ p. To 2 decimal places."),
      answer: approxQuestion(Number(H.toFixed(2)), ps.map((x) => `−${x} × log₂ ${x}`).join(" + ") + ` = ${H.toFixed(3)} bits.`, { tol: 0.011 }) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
