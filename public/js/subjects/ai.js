// AI engineering: client-side visualisers for how language models and
// retrieval work. Everything runs on small hand-made or seeded data, with no
// model downloads and no network calls.
//
// preview(h) draws the home-card thumbnail with inline SVG and theme tokens,
// so it renders without this subject's stylesheet.

export const SUBJECT = { id: "ai", name: "AI engineering", short: "AI" };

const S = (i) => `var(--series-${i})`;
const box = (h, kids, label) => h("div", { class: "art ai-art", "aria-hidden": "true" },
  h("svg", { viewBox: "0 0 150 58", width: "100%", height: "100%", role: "presentation", "aria-label": label }, kids));

export const TOOLS = [
  { slug: "tokenisation", subject: "ai", title: "Tokenisation (BPE)", art: "ai-tokens", noPractice: true,
    summary: "Train byte-pair encoding merge by merge on your own text, then see English, Hindi, code and numbers split into tokens.",
    description: "Byte-pair encoding visualiser: train BPE merge by merge, tokenise English, Hindi, code and numbers, and compare character, word and subword token counts.",
    load: () => import("../views/tokenisation.js"),
    preview: (h) => box(h, [["the", 4, 1], ["cat", 38, 2], ["s", 72, 3], ["at", 92, 4], ["▁ne", 4, 5, 32], ["west", 50, 6, 32], ["!", 104, 7, 32]].map(([t, x, c, y = 6]) => h("g", null,
      h("rect", { x, y, width: t.length * 9 + 12, height: 20, rx: 5, style: `fill:color-mix(in srgb, ${S(c)} 22%, transparent);stroke:${S(c)}` }),
      h("text", { x: x + 6, y: y + 14, style: "font:600 11px var(--mono);fill:var(--text)" }, t))), "Tokens") },
  { slug: "embeddings", subject: "ai", title: "Embeddings", art: "ai-embed", noPractice: true,
    summary: "Hand-made word vectors you can read: cosine vs dot product vs distance, neighbours, analogies and semantic search, plotted with PCA.",
    description: "Word embeddings visualiser: cosine similarity, dot product and Euclidean distance, nearest neighbours, king − man + woman, PCA in 2D and semantic search.",
    load: () => import("../views/embeddings.js"),
    preview: (h) => box(h, [
      ...[[20, 40], [32, 30], [44, 44], [100, 14], [112, 22], [124, 10], [70, 50], [84, 44]].map(([x, y], i) => h("circle", { cx: x, cy: y, r: 3.5, style: `fill:${S(i < 3 ? 1 : i < 6 ? 2 : 3)}` })),
      h("line", { x1: 32, y1: 30, x2: 100, y2: 14, style: "stroke:var(--accent);stroke-width:1.5;stroke-dasharray:3 3" }),
      h("line", { x1: 44, y1: 44, x2: 112, y2: 22, style: "stroke:var(--accent);stroke-width:1.5;stroke-dasharray:3 3" }),
    ], "Word vectors") },
  { slug: "attention", subject: "ai", title: "Attention", art: "ai-heat", noPractice: true,
    summary: "Scaled dot-product attention by hand: Q·Kᵀ, scaling, the causal mask, softmax row by row and two heads, as a heatmap.",
    description: "Attention visualiser: queries, keys and values, Q·Kᵀ scaled by √d, the causal mask, softmax row by row, weighted values and two-head attention as a heatmap.",
    load: () => import("../views/attention.js"),
    preview: (h) => box(h, Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => h("rect", { x: 40 + j * 14, y: 3 + i * 10.5, width: 12, height: 9, rx: 2,
      style: `fill:${j > i ? "var(--surface-2)" : `color-mix(in srgb, var(--accent) ${Math.round((j === i ? 0.7 : 0.15 + 0.5 / (i - j + 1)) * 100)}%, var(--surface))`}` }))).flat(), "Attention heatmap") },
  { slug: "sampling", subject: "ai", title: "Sampling", art: "ai-bars", noPractice: true,
    summary: "Next-token logits through temperature, top-k, top-p and repetition penalty, then a seeded draw, with entropy.",
    description: "LLM sampling visualiser: logits to softmax with temperature, top-k, top-p (nucleus), greedy and repetition penalty, a seeded random draw and entropy.",
    load: () => import("../views/sampling.js"),
    preview: (h) => box(h, [46, 36, 28, 18, 12, 8, 5].map((v, i) => h("rect", { x: 10 + i * 19, y: 54 - v, width: 14, height: v, rx: 2, style: `fill:${i < 3 ? "var(--accent)" : "var(--line)"}` })), "Probability bars") },
  { slug: "kv-cache", subject: "ai", title: "KV cache", art: "ai-kv", noPractice: true,
    summary: "Prefill vs decode step by step: what the KV cache saves, how its memory grows, time to first token and tokens per second.",
    description: "KV cache visualiser: prefill vs decode timeline, work with and without the cache, cache memory per token and per context, time to first token and tokens/s.",
    load: () => import("../views/kvcache.js"),
    preview: (h) => box(h, Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 + r }, (_, c) => h("rect", { x: 8 + c * 14, y: 4 + r * 10.5, width: 12, height: 9, rx: 2,
      style: `fill:${r === 0 || c === 4 + r ? "var(--accent)" : "color-mix(in srgb, var(--accent) 22%, var(--surface))"}` }))).flat(), "Prefill and decode") },
  { slug: "retrieval", subject: "ai", title: "Retrieval and RAG", art: "ai-rag", noPractice: true,
    summary: "BM25 by hand, dense search, hybrid with Reciprocal Rank Fusion, reranking, chunking strategies and the RAG prompt with citations.",
    description: "RAG retrieval visualiser: BM25 step by step, dense vector search, hybrid search with Reciprocal Rank Fusion, reranking, chunking strategies and the prompt.",
    load: () => import("../views/retrieval.js"),
    preview: (h) => box(h, [
      ...[0, 1, 2].map((i) => h("rect", { x: 6, y: 6 + i * 17, width: 40, height: 12, rx: 3, style: `fill:color-mix(in srgb, ${S(i + 1)} 30%, var(--surface));stroke:${S(i + 1)}` })),
      h("path", { d: "M50 12 L70 29 M50 29 L70 29 M50 46 L70 29", style: "stroke:var(--muted);fill:none" }),
      h("rect", { x: 72, y: 17, width: 72, height: 24, rx: 4, style: "fill:var(--accent-soft);stroke:var(--accent)" }),
      h("text", { x: 78, y: 33, style: "font:600 10px var(--mono);fill:var(--text)" }, "answer [1][3]"),
    ], "Retrieval pipeline") },
  { slug: "hnsw", subject: "ai", title: "HNSW vector search", art: "ai-hnsw", noPractice: true,
    summary: "Build a layered small-world graph from random points, then watch a search hop down the layers, against brute force.",
    description: "HNSW visualiser: build a layered navigable small-world graph point by point, greedy search down the layers, recall and distance counts vs brute force.",
    load: () => import("../views/hnsw.js"),
    preview: (h) => {
      const pts = [[12, 48], [30, 40], [48, 50], [66, 38], [84, 48], [104, 42], [124, 50], [138, 40]];
      return box(h, [
        ...pts.slice(1).map((p, i) => h("line", { x1: pts[i][0], y1: pts[i][1], x2: p[0], y2: p[1], style: "stroke:var(--line);stroke-width:1.5" })),
        h("line", { x1: 30, y1: 12, x2: 104, y2: 12, style: "stroke:var(--line);stroke-width:1.5" }),
        h("path", { d: "M30 12 L104 12 L104 42 L124 50", style: "stroke:var(--accent);stroke-width:2;fill:none" }),
        ...pts.map(([x, y]) => h("circle", { cx: x, cy: y, r: 3.5, style: "fill:var(--muted)" })),
        ...[[30, 12], [104, 12]].map(([x, y]) => h("circle", { cx: x, cy: y, r: 4, style: "fill:var(--accent)" })),
      ], "HNSW layers");
    } },
];
