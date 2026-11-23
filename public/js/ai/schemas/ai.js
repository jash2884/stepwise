// AI tool schemas: AI engineering. See ../schema-kit.js for the shape.
import { tool, round, nums } from "../schema-kit.js";
import { CORPUS, SAMPLES, compare, display, encode, train } from "../../engines/bpe.js";
import { METRICS, SENTENCES, WORDS, analogy, neighbours, rank, search, VECTORS } from "../../engines/vectors.js";
import { attend } from "../../engines/attention.js";
import { CANDIDATES, CONTEXT, run } from "../../engines/sampling.js";
import { PRESETS, bytesPerToken, cacheBytes, fmtBytes, simulate } from "../../engines/kvcache.js";
import { ARTICLE, DOCS, STRATEGIES, bm25, chunk, dense, pipeline, rerank, rrf } from "../../engines/retrieval.js";
import { HNSW, bruteForce, randomPoints, recallOf } from "../../engines/hnsw.js";

const pct = (x) => `${round(x * 100, 1)}%`;
const word = (desc, def) => ({ type: "enum", values: WORDS, default: def, desc: `${desc}; one of the 25 hand-made words` });

export const SCHEMAS = [
  tool("tokenisation", {
    keywords: "tokeniser tokenizer bpe byte pair encoding subword merges vocabulary vocab size token count tokens per word utf-8 bytes unknown token oov out of vocabulary gpt tiktoken sentencepiece wordpiece",
    params: {
      c: { type: "string", maxLength: 4000, format: "plain text, lines separated by newlines", default: CORPUS, desc: "training corpus the BPE merges are learned from (default: a mixed English, code, numbers and Hindi corpus)" },
      m: { type: "int", min: 1, max: 200, default: 30, desc: "number of merges to learn" },
      base: { type: "enum", values: ["chars", "bytes"], default: "chars", desc: "base symbols: chars (characters seen in the corpus) or bytes (all 256 UTF-8 bytes, nothing is unknown)" },
      digits: { type: "enum", values: ["runs", "split"], default: "runs", desc: "numbers: runs keeps a run of digits as one word before merging, split cuts every digit apart" },
      t: { type: "string", format: "plain text", default: SAMPLES.english.text, desc: "the text to tokenise with the trained merges" },
    },
    answers: {
      tokens: "number of BPE tokens for the text", pieces: "the tokens themselves, separated by |", characters: "characters in the text", charsPerToken: "characters per token",
      unknown: "tokens never seen in training (character mode)", merges: "merges actually learned (training stops early if no pair appears twice)", vocab: "vocabulary size after training", firstMerge: "the first pair merged",
      charTokens: "tokens if every character were one token", byteTokens: "UTF-8 bytes in the text", wordTokens: "tokens if every word were one token", oovWords: "words never seen in training",
    },
    examples: [
      { request: "How many tokens is 'the newest reading tower' after 30 BPE merges?", params: { t: "the newest reading tower", m: 30 } },
      { request: "Train BPE with 10 merges on 'low low low lower lower newest newest widest' and tokenise 'lowest'", params: { c: " low low low low low lower lower newest newest newest newest newest newest widest widest widest", m: 10, t: "lowest" } },
    ],
    validate(v) {
      if (!v.c.trim()) throw new Error("Type a training corpus first.");
      const model = train(v.c, { merges: v.m, base: v.base, digits: v.digits });
      const enc = encode(v.t, model);
      const cmp = compare(v.t, model);
      const chars = Array.from(v.t).length;
      const pieces = enc.tokens.map((x) => display(x, model.base)).join("|");
      const first = model.merges[0] ? `${display(model.merges[0].a, model.base)} + ${display(model.merges[0].b, model.base)}` : "none";
      return { text: `After ${model.merges.length} merges (vocabulary ${model.vocab.length}), "${v.t}" is ${enc.tokens.length} tokens for ${chars} characters: ${pieces}.`,
        values: { tokens: enc.tokens.length, pieces, characters: chars, charsPerToken: enc.tokens.length ? round(chars / enc.tokens.length, 2) : 0, unknown: enc.unknown.length, merges: model.merges.length, vocab: model.vocab.length, firstMerge: first,
          charTokens: cmp.chars, byteTokens: cmp.bytes, wordTokens: cmp.words, oovWords: cmp.oov } };
    },
  }),

  tool("embeddings", {
    keywords: "embedding word vector word2vec cosine similarity dot product euclidean distance nearest neighbours analogy king man woman queen semantic search vector space",
    params: {
      mode: { type: "enum", values: ["neighbours", "analogy", "search"], default: "neighbours", desc: "neighbours (5 nearest words), analogy (a is to b as c is to ?), search (rank 6 fixed sentences by meaning)" },
      metric: { type: "enum", values: Object.keys(METRICS), default: "cosine", desc: "neighbours and analogy: cosine, dot or euclidean (search always uses cosine)" },
      w: word("neighbours: the query word", "kitten"),
      a: word("analogy: a", "man"),
      b: word("analogy: b", "king"),
      c: word("analogy: c", "woman"),
      q: { type: "string", format: "a few words; only words from the vocabulary count", default: "royal home", desc: "search: the query" },
    },
    answers: {
      nearest: "closest word (neighbours)", neighbours: "the 5 nearest with scores (neighbours)", "score.queen": "similarity (or distance) from the query word to queen (one key per word, neighbours)",
      answer: "analogy answer", answerScore: "its score against b - a + c (analogy)", runnerUp: "second best (analogy)",
      best: "best sentence (search)", bestScore: "its cosine", order: "sentence numbers best first (search)",
    },
    examples: [
      { request: "What is the cosine similarity between king and queen?", params: { mode: "neighbours", w: "king", metric: "cosine" } },
      { request: "man is to king as woman is to what?", params: { mode: "analogy", a: "man", b: "king", c: "woman" } },
    ],
    validate(v) {
      const name = METRICS[v.metric].name.toLowerCase();
      if (v.mode === "neighbours") {
        const res = neighbours(v.w, { metric: v.metric, k: 5 });
        const values = { nearest: res.best[0].word, neighbours: res.best.map((x) => `${x.word} ${round(x.score, 3)}`).join(", ") };
        for (const x of rank(VECTORS[v.w], WORDS.filter((x) => x !== v.w).map((x) => [x, VECTORS[x]]), v.metric)) values[`score.${x.word}`] = round(x.score);
        return { text: `Nearest to "${v.w}" by ${name}: ${values.neighbours}.`, values };
      }
      if (v.mode === "analogy") {
        if (new Set([v.a, v.b, v.c]).size < 3) throw new Error("a, b and c should be three different words.");
        const res = analogy(v.a, v.b, v.c, { metric: v.metric });
        return { text: `${v.a} : ${v.b} :: ${v.c} : ${res.answer} (${name} ${round(res.ranked[0].score, 3)} with ${v.b} - ${v.a} + ${v.c}).`,
          values: { answer: res.answer, answerScore: round(res.ranked[0].score), runnerUp: res.ranked[1]?.word ?? "none" } };
      }
      const res = search(v.q);
      const top = res.ranked[0];
      return { text: res.query.known.length ? `Best match for "${v.q}": "${top.text}" (cosine ${round(top.score, 3)}); order ${res.ranked.map((r) => `D${r.i + 1}`).join(", ")}.` : `None of "${v.q}" is in the vocabulary, so every sentence scores 0.`,
        values: { best: top.text, bestScore: round(top.score), order: res.ranked.map((r) => r.i + 1).join(", "), known: res.query.known.join(", ") || "none" } };
    },
  }),

  tool("attention", {
    keywords: "self attention scaled dot product query key value qkv softmax attention weights causal mask masked multi head heads positional encoding transformer",
    params: {
      s: { type: "string", format: "words separated by spaces; only the first 8 are used", default: "the cat sat on the mat", desc: "the sentence; each word is one token" },
      causal: { type: "bool", default: false, desc: "apply a causal mask (each token sees only itself and earlier tokens)" },
      heads: { type: "int", min: 1, max: 2, default: 1, desc: "number of attention heads (1 or 2; d_model is 4)" },
      pos: { type: "bool", default: true, desc: "add positional encodings to the embeddings" },
    },
    answers: {
      "w.1.2": "head 1 weight of token 1 attending to token 2 (1-based; one key per pair, w2.i.j for head 2)", "top.1": "the token token 1 attends to most in head 1 (one key per token)",
      tokens: "the tokens used", dk: "size per head (scores are divided by its square root)",
    },
    examples: [
      { request: "Show the attention weights for 'the cat sat on the mat' with a causal mask", params: { s: "the cat sat on the mat", causal: true } },
      { request: "Two-head attention on 'i love deep learning'", params: { s: "i love deep learning", heads: 2 } },
    ],
    validate(v) {
      const res = attend(v.s, { causal: v.causal, heads: v.heads, positions: v.pos });
      const values = { tokens: res.tokens.join(" "), dk: res.dk };
      const tops = [];
      res.heads.forEach((hd, h) => hd.weights.forEach((row, i) => {
        row.forEach((x, j) => { values[`${h ? `w${h + 1}` : "w"}.${i + 1}.${j + 1}`] = round(x); });
        const best = row.reduce((b, x, j) => (x > row[b] ? j : b), 0);
        values[`${h ? "h2." : ""}top.${i + 1}`] = res.tokens[best];
        if (!h) tops.push(`${res.tokens[i]} -> ${res.tokens[best]} ${pct(row[best])}`);
      }));
      return { text: `${res.tokens.length} tokens, d_k = ${res.dk}${v.causal ? ", causal" : ""}; head 1 strongest links: ${tops.join(", ")}.`, values };
    },
  }),

  tool("sampling", {
    keywords: "decoding next token logits softmax temperature top-k top k top-p nucleus repetition penalty greedy random sampling seed entropy",
    params: {
      z: { type: "string", format: `up to 10 logits separated by ",", for the candidates ${CANDIDATES.map((c) => c.token).join(", ")} in that order; missing ones keep their defaults`, default: CANDIDATES.map((c) => c.logit).join(","), desc: `scores for the next token after "the cat sat on the"` },
      T: { type: "number", min: 0, max: 3, default: 1, desc: "temperature; 0 means greedy" },
      k: { type: "int", min: 0, max: CANDIDATES.length, default: 0, desc: "top-k; 0 means off" },
      p: { type: "number", min: 0.05, max: 1, default: 1, desc: "top-p (nucleus); 1 means off" },
      rp: { type: "number", min: 1, max: 3, default: 1, desc: `repetition penalty for tokens already in the prompt (${CONTEXT.join(", ")}): positive logits divided by it, negative multiplied` },
      seed: { type: "int", min: 0, max: 99999, default: 6, desc: "seed for the random draw" },
    },
    answers: {
      chosen: "the token drawn", pChosen: "its final probability", "P.mat": "final probability of mat (one key per candidate)", kept: "tokens left after top-k and top-p",
      entropy: "entropy of the final distribution in bits", baseEntropy: "entropy of the raw softmax at T = 1", r: "the random number used for the draw",
    },
    examples: [
      { request: "With temperature 0.5 and top-k 3, what are the probabilities of the next token?", params: { T: 0.5, k: 3 } },
      { request: "Give mat a logit of 2, floor 1, sofa 0.5 and the rest 0: with top-p 0.9, which tokens survive?", params: { z: "2,1,0.5,0,0,0,0,0,0,0", p: 0.9 } },
    ],
    validate(v) {
      const z = nums(v.z);
      if (z.length > CANDIDATES.length) throw new Error(`Give at most ${CANDIDATES.length} logits.`);
      const cands = CANDIDATES.map((c, i) => ({ ...c, logit: i < z.length ? z[i] : c.logit }));
      const res = run(cands, { temperature: v.T, k: v.k, p: v.p, penalty: v.rp, seed: v.seed, context: CONTEXT });
      const values = { chosen: res.tokens[res.chosen], pChosen: round(res.final[res.chosen]), entropy: round(res.entropy), baseEntropy: round(res.baseEntropy), r: res.r === null ? "none (greedy)" : round(res.r) };
      res.tokens.forEach((t, i) => { values[`P.${t}`] = round(res.final[i]); });
      const kept = res.tokens.map((t, i) => [t, res.final[i]]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
      values.kept = kept.map(([t]) => t).join(", ");
      return { text: `Drew "${values.chosen}" (${pct(res.final[res.chosen])}); final distribution ${kept.map(([t, x]) => `${t} ${pct(x)}`).join(", ")}; entropy ${round(res.entropy, 2)} bits.`, values };
    },
  }),

  tool("kv-cache", {
    keywords: "kv cache key value cache memory prefill decode time to first token ttft tokens per second throughput gqa grouped query attention mha context window llm inference serving bandwidth roofline",
    params: {
      model: { type: "enum", values: Object.keys(PRESETS), default: "mha7b", desc: `model shape: ${Object.entries(PRESETS).map(([k, m]) => `${k} (${m.layers} layers, ${m.kvHeads} KV heads, head size ${m.headDim})`).join(", ")}; all 2 bytes per number` },
      P: { type: "int", min: 1, max: 32, default: 6, desc: "prompt tokens" },
      G: { type: "int", min: 1, max: 32, default: 8, desc: "new tokens to generate" },
      C: { type: "int", min: 2, max: 64, default: 20, desc: "context window in tokens" },
      cache: { type: "bool", default: true, desc: "use a KV cache" },
      bw: { type: "int", min: 10, max: 10000, default: 1000, desc: "memory bandwidth in GB/s" },
      tf: { type: "int", min: 1, max: 5000, default: 100, desc: "compute in TFLOP/s" },
      n: { type: "int", min: 1, max: 1048576, default: 4096, desc: "tokens per request for the cache memory table" },
      batch: { type: "int", min: 1, max: 1024, default: 1, desc: "requests in the batch for the cache memory table" },
    },
    answers: {
      perToken: "cache bytes per token", perTokenText: "the same, readable", memory: "cache bytes for n tokens times batch", memoryText: "the same, readable (KiB, MiB, GiB)",
      rows: "K/V rows computed per layer over the run", rowsOther: "the same with the cache setting flipped", scores: "attention scores per head per layer", scoresOther: "the same with the cache flipped",
      ttft: "time to first token in seconds", decodeRate: "decode tokens per second", generated: "tokens that fit in the context window", finalCache: "cache bytes at the end of the run",
    },
    examples: [
      { request: "How much KV cache memory does an 8B GQA model need for 8192 tokens and a batch of 4?", params: { model: "gqa8b", n: 8192, batch: 4 } },
      { request: "Prompt of 10 tokens, generate 10, how many K/V rows are computed with and without a cache?", params: { P: 10, G: 10, C: 64, cache: true } },
    ],
    validate(v) {
      const shape = PRESETS[v.model];
      const res = simulate({ shape, prompt: v.P, generate: v.G, context: v.C, cache: v.cache, bandwidth: v.bw, tflops: v.tf });
      if (!res.steps.length) throw new Error("The prompt already fills the context window, so nothing can be generated.");
      const per = bytesPerToken(shape), mem = cacheBytes(shape, v.n) * v.batch;
      return {
        text: `${shape.name}: ${fmtBytes(per)} of cache per token, so ${v.n} tokens x ${v.batch} = ${fmtBytes(mem)}. Run of ${v.P} + ${res.fits} tokens ${v.cache ? "with" : "without"} a cache: ${res.totals.rows} K/V rows (${res.totalsOther.rows} ${v.cache ? "without" : "with"}), first token in ${round(res.ttft * 1000, 2)} ms.`,
        values: { perToken: per, perTokenText: fmtBytes(per), memory: mem, memoryText: fmtBytes(mem), rows: res.totals.rows, rowsOther: res.totalsOther.rows, scores: res.totals.scores, scoresOther: res.totalsOther.scores,
          ttft: round(res.ttft, 6), decodeRate: round(res.decodeRate, 1), generated: res.fits, finalCache: res.finalMem },
      };
    },
  }),

  tool("retrieval", {
    keywords: "rag retrieval augmented generation bm25 tf idf lexical keyword search dense vector search hybrid reciprocal rank fusion rrf rerank reranker cross encoder chunking chunk size overlap top k sources",
    params: {
      mode: { type: "enum", values: ["bm25", "dense", "hybrid", "rerank", "chunking", "rag"], default: "bm25", desc: "bm25, dense, hybrid (RRF of the two), rerank (top 4 hybrid results), chunking (split a fixed kitten-care article), rag (chunk, retrieve, build the prompt)" },
      q: { type: "string", format: "a short query", default: "pet food for a kitten", desc: "query for bm25, dense, hybrid and rerank" },
      docs: { type: "string", maxLength: 4000, format: "one document per line (separated by newlines)", default: DOCS.join("\n"), desc: "the documents for bm25, dense, hybrid and rerank; D1 is the first line" },
      k: { type: "int", min: 1, max: 1000, default: 60, desc: "hybrid and rerank: the RRF constant k in 1/(k + rank)" },
      chunk: { type: "enum", values: Object.keys(STRATEGIES), default: "heading", desc: "chunking and rag: fixed, overlap, sentence or heading" },
      size: { type: "int", min: 5, max: 200, default: 30, desc: "chunking and rag: words per chunk (max words for sentence)" },
      ov: { type: "int", min: 0, max: 50, default: 10, desc: "chunking and rag: overlap in words (overlap strategy only)" },
      rq: { type: "string", format: "a question", default: "how often should I feed a kitten", desc: "rag: the question" },
      top: { type: "int", min: 1, max: 4, default: 2, desc: "rag: number of chunks kept as sources" },
    },
    answers: {
      ranking: "documents best first, e.g. D6, D2, ...", best: "best document", bestScore: "its score", "score.D1": "score of D1 (one key per document; RRF score in hybrid, rerank score in rerank)",
      chunks: "number of chunks (chunking, rag)", words: "words per chunk (chunking)", sources: "chunk numbers kept as sources (rag)",
    },
    examples: [
      { request: "Rank these documents with BM25 for the query 'pet food for a kitten'", params: { mode: "bm25", q: "pet food for a kitten" } },
      { request: "How many chunks with fixed size 20 and overlap 5?", params: { mode: "chunking", chunk: "overlap", size: 20, ov: 5 } },
    ],
    validate(v) {
      if (v.mode === "chunking" || v.mode === "rag") {
        if (v.mode === "chunking") {
          const chunks = chunk(ARTICLE, v.chunk, { size: v.size, overlap: v.ov });
          return { text: `${STRATEGIES[v.chunk].name}: ${chunks.length} chunks of ${chunks.map((c) => c.words).join(", ")} words.`, values: { chunks: chunks.length, words: chunks.map((c) => c.words).join(", ") } };
        }
        const res = pipeline(v.rq, ARTICLE, { strategy: v.chunk, size: v.size, overlap: v.ov, k: v.top });
        const sources = res.top.map((d) => res.chunks[d].id);
        return { text: `${res.chunks.length} chunks; for "${v.rq}" hybrid search keeps chunk${sources.length > 1 ? "s" : ""} ${sources.join(", ")} as sources.`, values: { chunks: res.chunks.length, sources: sources.join(", "), ranking: res.ranked.map((d) => `C${res.chunks[d].id}`).join(", ") } };
      }
      const docs = v.docs.split("\n").filter((d) => d.trim());
      if (!docs.length) throw new Error("Give at least one document, one per line.");
      let ranked, score;
      if (v.mode === "bm25") { const r = bm25(v.q, docs); ranked = r.ranked; score = (d) => r.scores[d]; }
      else if (v.mode === "dense") { const r = dense(v.q, docs); ranked = r.ranked; score = (d) => r.scores[d]; }
      else {
        const lex = bm25(v.q, docs), sem = dense(v.q, docs);
        const fused = rrf([lex.ranked.filter((d) => lex.scores[d] > 0), sem.ranked], v.k);
        if (v.mode === "hybrid") { ranked = fused.ranked; score = (d) => fused.scores.get(d); }
        else { const rows = rerank(v.q, fused.ranked.slice(0, Math.min(4, fused.ranked.length)), docs); ranked = rows.map((x) => x.d); const m = new Map(rows.map((x) => [x.d, x.score])); score = (d) => m.get(d); }
      }
      const values = { ranking: ranked.map((d) => `D${d + 1}`).join(", "), best: ranked.length ? `D${ranked[0] + 1}` : "none", bestScore: ranked.length ? round(score(ranked[0]), 5) : 0 };
      for (const d of ranked) values[`score.D${d + 1}`] = round(score(d), 5);
      return { text: ranked.length ? `${v.mode === "bm25" ? "BM25" : v.mode === "dense" ? "Dense search" : v.mode === "hybrid" ? `RRF (k = ${v.k})` : "Reranking"} for "${v.q}": ${ranked.map((d) => `D${d + 1} ${round(score(d), 3)}`).join(", ")}; best is "${docs[ranked[0]]}".` : "No documents to rank.", values };
    },
  }),

  tool("hnsw", {
    keywords: "hnsw hierarchical navigable small world approximate nearest neighbour ann vector index graph layers efsearch ef efconstruction recall vector database faiss",
    params: {
      mode: { type: "enum", values: ["search", "build"], default: "search", desc: "search (find the k nearest to a query point) or build (insert the points one by one)" },
      n: { type: "int", min: 5, max: 150, default: 60, desc: "number of random 2D points" },
      seed: { type: "int", min: 1, max: 9999, default: 3, desc: "seed for the points and the level draws" },
      M: { type: "int", min: 2, max: 10, default: 4, desc: "max links per point on upper layers (2M on layer 0)" },
      efc: { type: "int", min: 2, max: 100, default: 16, desc: "efConstruction: beam width while building" },
      ef: { type: "int", min: 1, max: 100, default: 4, desc: "efSearch: beam width on layer 0 while searching" },
      k: { type: "int", min: 1, max: 10, default: 3, desc: "neighbours to return" },
      qx: { type: "number", min: 0, max: 100, default: 47, desc: "query x (points lie in 0 to 100)" },
      qy: { type: "number", min: 0, max: 100, default: 53, desc: "query y" },
    },
    answers: {
      found: "point ids HNSW returns, closest first", truth: "the true k nearest (brute force)", recall: "fraction of the true k found", distances: "distances computed by HNSW", brute: "distances brute force needs (n)",
      layers: "number of layers", perLayer: "points on each layer, top first", entry: "entry point id",
    },
    examples: [
      { request: "HNSW search with ef 4 and k 3: what is the recall?", params: { mode: "search", ef: 4, k: 3 } },
      { request: "Build an HNSW graph of 100 points with M = 6", params: { mode: "build", n: 100, M: 6 } },
    ],
    validate(v) {
      const points = randomPoints(v.n, v.seed);
      const index = new HNSW({ M: v.M, efConstruction: v.efc, seed: v.seed });
      for (const pt of points) index.insert(pt);
      const perLayer = Array.from({ length: index.top + 1 }, (_, i) => index.layers[index.top - i].size).join(", ");
      if (v.mode === "build") {
        return { text: `${v.n} points with M = ${v.M}: ${index.top + 1} layers holding ${perLayer} points (top first); entry point ${index.entry}.`, values: { layers: index.top + 1, perLayer, entry: index.entry } };
      }
      const q = { x: v.qx, y: v.qy };
      const res = index.search(q, v.k, v.ef);
      const truth = bruteForce(points, q, v.k);
      const recall = recallOf(res.results, truth);
      return { text: `HNSW finds ${res.results.join(", ")} for (${v.qx}, ${v.qy}) with ${res.count} distance computations (brute force: ${v.n}); the true ${v.k} nearest are ${truth.join(", ")}, so recall is ${round(recall, 3)}.`,
        values: { found: res.results.join(", "), truth: truth.join(", "), recall: round(recall), distances: res.count, brute: v.n, layers: index.top + 1, perLayer, entry: index.entry } };
    },
  }),
];
