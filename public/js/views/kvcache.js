import { CODE_CACHE, CODE_NOCACHE, MiB, PRESETS, bytesPerToken, cacheBytes, fmtBytes, rowsComputed, simulate } from "../engines/kvcache.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { approxQuestion, practiceCard, svg, traceSim } from "./ai-kit.js";

const int = (x, lo, hi, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) && x !== null && x !== "" ? Math.min(hi, Math.max(lo, n)) : d; };
const fmtTime = (s) => (s >= 1 ? `${s.toFixed(2)} s` : s >= 1e-3 ? `${(s * 1e3).toFixed(1)} ms` : `${(s * 1e6).toFixed(1)} µs`);

// Rows: steps. Columns: token positions. Each cell says what happened to that
// token's K and V at that step.
function timeline(sim, { prompt, context, cache }, upto) {
  const cols = Math.min(context, prompt + sim.fits), rows = sim.steps.length;
  const left = 74, W = 360, cw = Math.max(4, Math.min(22, (W - left - 4) / Math.max(cols, 1))), ch = Math.max(10, Math.min(20, 260 / Math.max(rows, 1)));
  const H = 22 + rows * ch + 6;
  const kids = [];
  for (let c = 0; c < cols; c++) if (cols <= 24 || c % 4 === 0) kids.push(h("text", { x: left + c * cw + cw / 2, y: 14, "text-anchor": "middle", class: "ai-lab tiny" }, c + 1));
  sim.steps.forEach((s, r) => {
    const y = 20 + r * ch;
    kids.push(h("text", { x: left - 6, y: y + ch / 2 + 4, "text-anchor": "end", class: `ai-lab${r === upto ? " chosen" : ""}` }, s.prefill ? "prefill" : `decode ${s.s}`));
    for (let c = 0; c < s.len; c++) {
      const fresh = cache ? (s.prefill || c === s.len - 1) : true;
      const cls = r > upto ? "kv-future" : fresh ? (cache || s.prefill ? "kv-new" : "kv-redo") : "kv-read";
      kids.push(h("rect", { x: left + c * cw + 0.5, y: y + 0.5, width: cw - 1, height: ch - 1, rx: 2, class: `kv-cell ${cls}${c < prompt ? "" : " gen"}` }));
    }
    if (r <= upto) kids.push(h("rect", { x: left + s.len * cw + 0.5, y: y + 0.5, width: cw - 1, height: ch - 1, rx: 2, class: "kv-cell kv-out" }));
  });
  return svg(W, H, `Prefill and decode timeline up to step ${upto + 1}`, kids, "ai-timeline");
}

export function render(root) {
  const p = readParams();
  const state = {
    preset: PRESETS[p.get("model")] ? p.get("model") : "mha7b",
    prompt: int(p.get("P"), 1, 32, 6),
    generate: int(p.get("G"), 1, 32, 8),
    context: int(p.get("C"), 2, 64, 20),
    cache: p.get("cache") !== "0",
    bandwidth: int(p.get("bw"), 10, 10000, 1000),
    tflops: int(p.get("tf"), 1, 5000, 100),
    scale: int(p.get("n"), 1, 1048576, 4096),
    batch: int(p.get("batch"), 1, 1024, 1),
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "KV cache",
    lede: "Why generation has a slow start and a steady stream: prefill vs decode, what the KV cache saves, and how much memory it eats.",
    theory: h("div", null,
      h("p", null, "A decoder-only model writes one token at a time. In every layer each new token's query is compared with the ", h("b", null, "keys"), " of all earlier tokens and blends their ", h("b", null, "values"), ". Earlier tokens' keys and values never change (the causal mask means they can't see later tokens), so they can be computed once and kept: that store is the ", h("b", null, "KV cache"), "."),
      h("ul", null,
        h("li", null, h("b", null, "Prefill"), ": the whole prompt is processed in one parallel pass, filling the cache and giving the first new token. Many tokens at once keeps the arithmetic units busy (compute-bound). Its length sets the ", h("b", null, "time to first token"), "."),
        h("li", null, h("b", null, "Decode"), ": each later step processes just one token, but must read all the model's weights and the whole cache from memory. Little arithmetic per byte read makes it memory-bound, and sets the ", h("b", null, "tokens per second"), "."),
        h("li", null, h("b", null, "Without a cache"), " every step would rerun the whole sequence, so total work grows with the square of the length.")),
      h("p", { class: "mono-notes" }, "cache bytes = 2 (K and V) × layers × KV heads × head size × bytes per number × tokens"),
      h("p", null, "The cache grows with every token and every request in a batch, which is why long contexts are expensive to serve. ", h("b", null, "Grouped-query attention"), " (GQA) lets several query heads share one key/value head, shrinking the cache; serving systems also page the cache in blocks, quantise it, or slide a window over old tokens."),
      h("p", null, "The model shapes are typical of open models of that size but not any specific one. Times use a simple roofline: each step takes the longer of doing about 2 × parameters operations per token or reading the weights (and cache) once from memory. Real numbers depend on batching, kernels and hardware, so read them as orders of magnitude.")),
    conventions: [
      "Step 0 is prefill. Decode step s works on a sequence of P + s tokens.",
      "K/V rows are counted per layer; scores (query·key dot products) per head per layer, with a causal mask.",
      "Generation stops when the prompt plus new tokens would pass the context window.",
      "MiB = 1,048,576 bytes; GiB = 1024 MiB.",
    ],
  });

  const num = (label, key, min, max) => h("label", { class: "inline" }, label, " ", h("input", { type: "number", min, max, value: state[key], onchange: (e) => { state[key] = int(e.target.value, min, max, state[key]); e.target.value = state[key]; update(); } }));
  const presetSel = h("select", { "aria-label": "Model shape", onchange: (e) => { state.preset = e.target.value; update(); } }, Object.entries(PRESETS).map(([k, m]) => h("option", { value: k, selected: k === state.preset }, m.name)));
  const cacheSel = h("select", { "aria-label": "Cache", onchange: (e) => { state.cache = e.target.value === "on"; update(); } }, h("option", { value: "on", selected: state.cache }, "with KV cache"), h("option", { value: "off", selected: !state.cache }, "without a cache"));
  const msg = h("div"), out = h("div");

  function update() {
    writeParams({ model: state.preset, P: state.prompt, G: state.generate, C: state.context, cache: state.cache ? 1 : 0, bw: state.bandwidth, tf: state.tflops, n: state.scale, batch: state.batch });
    sim?.player.destroy();
    const shape = PRESETS[state.preset];
    const res = simulate({ shape, prompt: state.prompt, generate: state.generate, context: state.context, cache: state.cache, bandwidth: state.bandwidth, tflops: state.tflops });
    if (!res.steps.length) { msg.replaceChildren(notice("error", "The prompt already fills the context window, so nothing can be generated.")); out.replaceChildren(); return; }
    msg.replaceChildren(res.truncated ? notice("info", `The context window holds ${state.context} tokens, so only ${res.fits} of the ${state.generate} new tokens fit. Real systems stop, drop old tokens or summarise.`) : "");
    const used = (s) => s.len + 1;
    sim = traceSim({ steps: res.steps, code: state.cache ? CODE_CACHE : CODE_NOCACHE, interval: 900, draw: (s, i) => h("div", null,
      timeline(res, state, i),
      h("div", { class: "legend-chips" }, h("span", null, h("i", { class: "kv-key kv-new" }), "K, V computed"), state.cache ? h("span", null, h("i", { class: "kv-key kv-read" }), "read from cache") : h("span", null, h("i", { class: "kv-key kv-redo" }), "recomputed"), h("span", null, h("i", { class: "kv-key kv-out" }), "token produced")),
      h("div", { class: "ai-meter", role: "img", "aria-label": `Context window ${used(s)} of ${state.context} tokens` },
        h("span", { style: `width:${(state.prompt / state.context) * 100}%`, class: "prompt" }), h("span", { style: `width:${((used(s) - state.prompt) / state.context) * 100}%`, class: "gen" })),
      h("p", { class: "muted small" }, `Context window: ${used(s)} of ${state.context} tokens used (prompt ${state.prompt}, generated ${used(s) - state.prompt}).`),
      h("div", { class: "stats-row" },
        stat("Cache now", state.cache ? fmtBytes(s.mem) : "none"),
        stat("This step", fmtTime(s.time)),
        stat("Limited by", s.bound))) });
    const other = state.cache ? "without" : "with";
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `${state.prompt}-token prompt, ${res.fits} new tokens, ${state.cache ? "with" : "without"} a KV cache`), sim.el),
      h("section", { class: "card" }, h("h2", null, "Totals for the whole run"),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th"), h("th", { scope: "col" }, state.cache ? "With cache (shown)" : "Without cache (shown)"), h("th", { scope: "col" }, `${other[0].toUpperCase()}${other.slice(1)} cache`))),
          h("tbody", null,
            h("tr", null, h("th", { scope: "row" }, "K/V rows computed, per layer"), h("td", null, res.totals.rows), h("td", null, res.totalsOther.rows)),
            h("tr", null, h("th", { scope: "row" }, "Attention scores, per head per layer"), h("td", null, res.totals.scores), h("td", null, res.totalsOther.scores))))),
        h("div", { class: "stats-row" },
          stat("Time to first token", fmtTime(res.ttft)),
          stat("Decode speed", res.decodeRate ? `${res.decodeRate.toFixed(1)} tokens/s` : "n/a"),
          stat("Cache per token", fmtBytes(res.perTok)),
          stat("Cache at the end", state.cache ? fmtBytes(res.finalMem) : "none")),
        h("p", { class: "muted small" }, `With a cache, K and V are computed once per token: P + G − 1 = ${rowsComputed(state.prompt, res.fits, true)} rows. Without one, step s recomputes all P + s: ${rowsComputed(state.prompt, res.fits, false)} rows. Rough timing for ${shape.params >= 1 ? `${shape.params}B` : "a tiny"} parameters at ${state.bandwidth} GB/s and ${state.tflops} TFLOP/s.`)),
      scaleCard(shape));
  }

  function scaleCard(shape) {
    return h("section", { class: "card" }, h("h2", null, "Cache memory at real context lengths"),
      h("div", { class: "row" }, num("Tokens per request", "scale", 1, 1048576), num("Requests in the batch", "batch", 1, 1024)),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, ["Model shape", "Layers", "KV heads", "Head size", "Per token", `${state.scale.toLocaleString("en-GB")} tokens × ${state.batch}`].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, Object.entries(PRESETS).map(([k, m]) => h("tr", { class: k === state.preset ? "current" : null }, h("th", { scope: "row" }, m.name), h("td", null, m.layers), h("td", null, `${m.kvHeads} of ${m.heads}`), h("td", null, m.headDim), h("td", null, fmtBytes(bytesPerToken(m))), h("td", null, h("b", null, fmtBytes(cacheBytes(m, state.scale) * state.batch)))))))),
      h("p", { class: "muted small" }, `All at 2 bytes per number (16-bit). The 8B-class shape stores 8 key/value heads instead of 32, so its cache is a quarter the size of the 7B-class one: that is grouped-query attention at work. ${shape.name}: ${fmtBytes(bytesPerToken(shape))} per token.`));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, presetSel, cacheSel),
      h("div", { class: "row" }, num("Prompt tokens", "prompt", 1, 32), num("New tokens", "generate", 1, 32), num("Context window", "context", 2, 64)),
      h("div", { class: "row" }, num("Memory GB/s", "bandwidth", 10, 10000), num("TFLOP/s", "tflops", 1, 5000), h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      const L = [12, 24, 32, 40][Math.floor(r() * 4)], kvh = [4, 8, 16, 32][Math.floor(r() * 4)], d = [64, 128][Math.floor(r() * 2)], bytes = [1, 2][Math.floor(r() * 2)];
      const n = [512, 1024, 2048, 4096, 8192][Math.floor(r() * 5)];
      const mib = cacheBytes({ layers: L, kvHeads: kvh, headDim: d, bytes }, n) / MiB;
      return { kind: "Cache memory", title: `${L} layers, ${kvh} KV heads of size ${d}, ${bytes === 2 ? "16-bit (2 bytes)" : "8-bit (1 byte)"} numbers. How many MiB of KV cache for ${n} tokens?`,
        body: h("p", { class: "muted small" }, "1 MiB = 1,048,576 bytes. To 2 decimal places."),
        answer: approxQuestion(Number(mib.toFixed(2)), `2 × ${L} × ${kvh} × ${d} × ${bytes} = ${2 * L * kvh * d * bytes} bytes per token; × ${n} = ${(2 * L * kvh * d * bytes * n).toLocaleString("en-GB")} bytes = ${mib.toFixed(2)} MiB.`, { tol: 0.011, unit: " MiB" }) };
    }
    if (kind === 1) {
      const P = 3 + Math.floor(r() * 10), G = 2 + Math.floor(r() * 8), cache = r() < 0.5;
      const ans = rowsComputed(P, G, cache);
      return { kind: "Work", title: `A ${P}-token prompt, ${G} tokens generated ${cache ? "with" : "without"} a KV cache. How many K/V rows does one layer compute in total?`,
        body: h("p", { class: "muted small" }, "Step 0 (prefill) produces the first token; step s works on P + s tokens."),
        answer: approxQuestion(ans, cache ? `Prefill computes ${P}, then each of the other ${G - 1} steps computes 1: ${ans}.` : `Every step recomputes the whole sequence: ${Array.from({ length: G }, (_, s) => P + s).join(" + ")} = ${ans}.`, { tol: 0 }) };
    }
    const heads = [16, 32, 64][Math.floor(r() * 3)], kvh = [1, 2, 4, 8].filter((x) => x < heads)[Math.floor(r() * 4)];
    return { kind: "GQA", title: `A model has ${heads} query heads. With grouped-query attention it keeps ${kvh} key/value head${kvh === 1 ? "" : "s"}. What fraction of the full cache does it need?`,
      body: h("p", { class: "muted small" }, "As a decimal, to 4 places."),
      answer: approxQuestion(Number((kvh / heads).toFixed(4)), `The cache scales with the number of KV heads: ${kvh} / ${heads} = ${(kvh / heads).toFixed(4)}. Query heads don't need caching; only keys and values do.`, { tol: 0.0001 }) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
