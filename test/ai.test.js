// AI engineering track: engines checked against hand calculations, plus the
// subject registry and roadmap data.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as bpe from "../public/js/engines/bpe.js";
import * as vec from "../public/js/engines/vectors.js";
import * as att from "../public/js/engines/attention.js";
import * as smp from "../public/js/engines/sampling.js";
import * as kv from "../public/js/engines/kvcache.js";
import * as ret from "../public/js/engines/retrieval.js";
import * as hnsw from "../public/js/engines/hnsw.js";
import { TOOLS as AI_TOOLS, SUBJECT } from "../public/js/subjects/ai.js";
import { ROADMAPS as AI_ROADMAPS } from "../public/js/roadmaps/ai.js";
import { TOOLS as CORE_TOOLS } from "../public/js/tools.js";

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≠ ${b}`);

// --- Tokenisation ---------------------------------------------------------------------

test("BPE: a tie goes to the pair seen first, and training stops below count 2", () => {
  const m = bpe.train("aa ab aa", { merges: 10 });
  assert.deepEqual(m.merges.map((x) => x.token), ["aa"]);
  assert.equal(m.steps.at(-1).phase, "stop");
  assert.deepEqual(m.words.map((w) => w.syms), [["aa"], ["▁", "a", "b"], ["▁", "aa"]]);
});

test("BPE: low / lower / newest / widest merges by hand", () => {
  const m = bpe.train(" low low low lower lower newest newest newest widest", { merges: 5 });
  // Pair counts: ▁l, lo, ow, we all 5 (▁l seen first); then es and st at 4.
  assert.deepEqual(m.merges.map((x) => x.token), ["▁l", "▁lo", "▁low", "es", "est"]);
  assert.deepEqual(m.merges.map((x) => x.count), [5, 5, 5, 4, 4]);
  assert.equal(m.vocab.length, m.baseVocab.length + 5);
  // Encoding the training words gives the training segmentation.
  const e = bpe.encode(" lowest", m);
  assert.deepEqual(e.tokens, ["▁low", "est"]);
  assert.equal(e.tokens.length, 2);
});

test("BPE: tokens always join back to the text (chars and bytes)", () => {
  for (const base of ["chars", "bytes"]) {
    const m = bpe.train(bpe.CORPUS, { merges: 40, base });
    for (const { text } of Object.values(bpe.SAMPLES)) {
      const toks = bpe.encode(text, m).tokens;
      const joined = base === "bytes"
        ? new TextDecoder().decode(Uint8Array.from(toks.join("").split("").map((c) => c.charCodeAt(0))))
        : toks.join("").replaceAll("▁", " ");
      assert.equal(joined, bpe.pretokenise(text).join(""), `${base}: ${text}`);
    }
  }
});

test("BPE: byte-level never has unknown symbols; Devanagari costs more bytes than characters", () => {
  const bytes = bpe.train(bpe.CORPUS, { merges: 30, base: "bytes" });
  const chars = bpe.train(bpe.CORPUS, { merges: 30, base: "chars" });
  const hindi = bpe.SAMPLES.hindi.text;
  assert.equal(bpe.encode(hindi, bytes).unknown.length, 0);
  assert.ok(bpe.encode(hindi, chars).unknown.length > 0, "unseen Devanagari letters are unknown at character level");
  const c = bpe.compare(hindi, bytes);
  assert.ok(c.bytes >= 3 * (c.characters - 5), "most Devanagari code points are 3 bytes");
  assert.ok(bpe.encode(hindi, bytes).tokens.length > bpe.encode(bpe.SAMPLES.english.text, bytes).tokens.length);
});

test("BPE: digits split vs runs", () => {
  assert.deepEqual(bpe.pretokenise("in 2025", { digits: "split" }), ["in", " 2", "0", "2", "5"]);
  assert.deepEqual(bpe.pretokenise("in 2025"), ["in", " 2025"]);
  assert.equal(bpe.display("\xe0\xa4", "bytes"), "‹e0 a4›");
});

// --- Embeddings --------------------------------------------------------------------------

test("vectors: metrics, neighbours and analogies", () => {
  close(vec.cosine([1, 0], [0, 1]), 0);
  close(vec.cosine([1, 2], [2, 4]), 1);
  close(vec.euclidean([0, 0], [3, 4]), 5);
  assert.equal(vec.analogy("man", "king", "woman").answer, "queen");
  assert.equal(vec.analogy("dog", "puppy", "cat").answer, "kitten");
  assert.equal(vec.analogy("man", "boy", "woman").answer, "girl");
  const near = vec.neighbours("kitten", { k: 3 }).best.map((b) => b.word);
  assert.ok(near.includes("cat") && near.includes("puppy"), near.join());
  // Euclidean ranks smallest first.
  const r = vec.rank([0, 0], [["far", [5, 5]], ["near", [1, 0]]], "euclidean");
  assert.equal(r[0].word, "near");
});

test("vectors: PCA finds orthonormal eigenvectors of the covariance", () => {
  const p = vec.pca(Object.values(vec.VECTORS), 2);
  const [a, b] = p.components;
  close(vec.norm(a), 1, 1e-6);
  close(vec.norm(b), 1, 1e-6);
  close(vec.dot(a, b), 0, 1e-6);
  p.components.forEach((v, c) => {
    const Cv = p.covariance.map((row) => vec.dot(row, v));
    Cv.forEach((x, i) => close(x, p.values[c] * v[i], 1e-6, "C v = λ v"));
  });
  assert.ok(p.values[0] >= p.values[1]);
  assert.ok(p.explained[0] + p.explained[1] <= 1 + 1e-9);
});

test("semantic search ranks by meaning, not shared words", () => {
  // "royal home" shares no word with the palace sentence but means the same.
  assert.equal(vec.search("royal home").ranked[0].i, 0);
  assert.equal(vec.search("cake and bread").ranked[0].i, 3);
  assert.equal(vec.search("zzz").ranked[0].score, 0);
});

// --- Attention ---------------------------------------------------------------------------

test("attention: every row sums to 1 and the causal mask zeroes the future", () => {
  for (const heads of [1, 2]) for (const causal of [false, true]) {
    const a = att.attend("the cat sat on the mat", { heads, causal });
    for (const h of a.heads) h.weights.forEach((row, i) => {
      close(row.reduce((s, x) => s + x, 0), 1, 1e-9);
      row.forEach((w, j) => { if (causal && j > i) assert.equal(w, 0); else assert.ok(w > 0); });
    });
    if (causal) for (const h of a.heads) assert.equal(h.weights[0][0], 1);
    assert.equal(a.output[0].length, att.D_MODEL);
  }
});

test("attention: scores are Q·K / √d by hand", () => {
  const a = att.attend("dog bites man", { heads: 1 });
  const { Q, K } = a;
  const s01 = Q[0].reduce((s, x, i) => s + x * K[1][i], 0) / 2;
  close(a.heads[0].raw[0][1], s01, 1e-12);
  // Output is the weighted sum of V rows.
  const w = a.heads[0].weights[2];
  const out = a.V[0].map((_, c) => w.reduce((s, wj, j) => s + wj * a.V[j][c], 0));
  out.forEach((x, c) => close(a.output[2][c], x, 1e-12));
  // Positions make two copies of a word differ.
  const r = att.attend("the the", { positions: true });
  assert.notDeepEqual(r.X[0], r.X[1]);
  assert.deepEqual(att.attend("the the", { positions: false }).X[0], att.attend("the the", { positions: false }).X[1]);
});

test("attention practice: the weight matches a hand softmax", () => {
  const q = att.weightQuestion(() => 0.3);
  const e = q.scores.map(Math.exp);
  close(q.answer, e[q.j] / e.reduce((s, x) => s + x, 0), 1e-12);
});

// --- Sampling ------------------------------------------------------------------------------

test("softmax and temperature", () => {
  const p = smp.softmax([1, 2, 3]);
  close(p.reduce((s, x) => s + x, 0), 1);
  close(p[2], Math.exp(3) / (Math.exp(1) + Math.exp(2) + Math.exp(3)));
  for (const T of [0.25, 0.5, 1, 2]) {
    const q = smp.softmax([2, 1], T);
    close(q[0] / q[1], Math.exp(1 / T), 1e-9);
  }
  assert.ok(smp.softmax([2, 1], 0.5)[0] > smp.softmax([2, 1], 2)[0], "low T sharpens");
  close(smp.entropy([0.5, 0.5]), 1);
  close(smp.entropy([1, 0]), 0);
});

test("top-p keeps the smallest set reaching p, top-k the k best", () => {
  const P = [0.5, 0.3, 0.15, 0.05];
  assert.deepEqual(smp.nucleus(P, 0.8), [0, 1]);
  assert.deepEqual(smp.nucleus(P, 0.81), [0, 1, 2]);
  assert.deepEqual(smp.nucleus(P, 0.4), [0]);
  assert.deepEqual(smp.nucleus(P, 1), [0, 1, 2, 3]);
  assert.deepEqual(smp.topK([0.1, 3, 2, 5], 2), [3, 1]);
});

test("sampling pipeline: greedy, top-k = 1, repetition penalty, seeded draws", () => {
  const greedy = smp.run(smp.CANDIDATES, { temperature: 0 });
  assert.equal(greedy.tokens[greedy.chosen], "mat");
  for (const seed of [1, 2, 3, 4, 5]) assert.equal(smp.run(smp.CANDIDATES, { k: 1, seed }).tokens[smp.run(smp.CANDIDATES, { k: 1, seed }).chosen], "mat");
  const pen = smp.run(smp.CANDIDATES, { penalty: 1.5 });
  const cat = smp.CANDIDATES.findIndex((c) => c.token === "cat");
  close(pen.steps[1].values[cat], 1.8 / 1.5);
  close(smp.penalise(-1, 2), -2);
  const a = smp.run(smp.CANDIDATES, { seed: 42 }), b = smp.run(smp.CANDIDATES, { seed: 42 });
  assert.equal(a.chosen, b.chosen);
  const f = smp.run(smp.CANDIDATES, { p: 0.5 });
  close(f.final.reduce((s, x) => s + x, 0), 1);
  assert.ok(f.final.filter((x) => x > 0).length < smp.CANDIDATES.length);
});

// --- KV cache --------------------------------------------------------------------------------

test("KV cache memory arithmetic", () => {
  assert.equal(kv.bytesPerToken(kv.PRESETS.mha7b), 2 * 32 * 32 * 128 * 2);
  assert.equal(kv.bytesPerToken(kv.PRESETS.mha7b), 0.5 * kv.MiB);
  assert.equal(kv.bytesPerToken(kv.PRESETS.gqa8b), 128 * 1024);
  assert.equal(kv.cacheBytes(kv.PRESETS.mha7b, 4096), 2 * kv.GiB);
});

test("KV cache: work with and without the cache", () => {
  for (const [P, G] of [[1, 1], [5, 3], [6, 6], [10, 1], [3, 9]]) {
    const on = kv.simulate({ prompt: P, generate: G, context: 100, cache: true });
    const off = kv.simulate({ prompt: P, generate: G, context: 100, cache: false });
    assert.equal(on.totals.rows, P + G - 1);
    assert.equal(on.totals.rows, kv.rowsComputed(P, G, true));
    assert.equal(off.totals.rows, kv.rowsComputed(P, G, false));
    assert.equal(off.totals.rows, Array.from({ length: G }, (_, s) => P + s).reduce((a, b) => a + b, 0));
    assert.equal(on.totalsOther.rows, off.totals.rows);
    assert.ok(on.totals.scores <= off.totals.scores);
    assert.equal(on.finalMem, (P + G - 1) * on.perTok);
  }
  const full = kv.simulate({ prompt: 10, generate: 10, context: 12 });
  assert.equal(full.fits, 2);
  assert.ok(full.truncated);
});

// --- Retrieval ---------------------------------------------------------------------------------

test("BM25 matches a hand calculation", () => {
  const docs = ["cat cat dog", "dog fish", "bird"];
  const r = ret.bm25("cat", docs);
  // N = 3, n = 1, avgdl = 2, |d| = 3, f = 2.
  const idf = Math.log(1 + (3 - 1 + 0.5) / (1 + 0.5));
  const norm = 1 - 0.75 + (0.75 * 3) / 2;
  close(r.scores[0], (idf * 2 * 2.2) / (2 + 1.2 * norm), 1e-12);
  close(r.scores[0], 1.18237, 1e-4);
  assert.deepEqual(r.scores.slice(1), [0, 0]);
  const d = ret.bm25("dog", docs);
  assert.ok(d.scores[1] > d.scores[0], "same tf, shorter document wins");
  assert.deepEqual(ret.bm25("pet food", ret.DOCS).ranked[0], 5);
});

test("Reciprocal Rank Fusion", () => {
  const { scores, ranked } = ret.rrf([[0, 1, 2], [2, 0, 1]], 60);
  close(scores.get(0), 1 / 61 + 1 / 62);
  close(scores.get(2), 1 / 63 + 1 / 61);
  assert.deepEqual(ranked, [0, 2, 1]);
  assert.deepEqual(ret.rrf([[3, 1]], 1).ranked, [3, 1]);
});

test("chunking: fixed sizes with overlap match the closed form, and nothing is lost", () => {
  const words = ret.ARTICLE.match(/\S+/g).length;
  for (const size of [5, 12, 30, 200]) for (const overlap of [0, 2, 4]) {
    const c = ret.chunk(ret.ARTICLE, overlap ? "overlap" : "fixed", { size, overlap });
    assert.equal(c.length, ret.fixedCount(words, size, overlap), `${size}/${overlap}`);
    assert.equal(c[0].start, 0);
    assert.equal(c.at(-1).end, ret.ARTICLE.length);
  }
  const h = ret.chunk(ret.ARTICLE, "heading");
  assert.equal(h.length, 4);
  for (const c of h) assert.ok(c.text.startsWith("#"));
  for (const c of ret.chunk(ret.ARTICLE, "sentence", { size: 30 })) assert.ok(c.words <= 30 || !/[.!?]\s/.test(c.text));
  const rag = ret.pipeline("how often should I feed a kitten", ret.ARTICLE, { strategy: "heading", k: 2 });
  assert.equal(rag.chunks[rag.top[0]].text.split("\n")[0], "# Food");
  assert.match(rag.prompt, /\[1\]/);
});

// --- HNSW --------------------------------------------------------------------------------------

test("HNSW finds the true nearest neighbour on fuzzed seeds, with fewer distances than brute force", () => {
  let recall = 0, dists = 0, runs = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const pts = hnsw.randomPoints(200, seed);
    const index = hnsw.build(pts, { M: 6, efConstruction: 32, seed });
    const e = hnsw.evaluate(index, { queries: 30, k: 1, ef: 16, seed: seed + 100 });
    recall += e.recall; dists += e.distances; runs++;
    // Every link stays within the cap.
    index.layers.forEach((layer, lc) => { for (const list of layer.values()) assert.ok(list.length <= (lc === 0 ? 12 : 6)); });
  }
  assert.ok(recall / runs >= 0.97, `recall@1 ${recall / runs}`);
  assert.ok(dists / runs < 200, `distances ${dists / runs}`);
});

test("HNSW levels and recall", () => {
  assert.equal(hnsw.levelFor(1, 4), 0);
  assert.equal(hnsw.levelFor(0.2, 4), 1);
  assert.equal(hnsw.levelFor(0.01, 4), 3);
  assert.equal(hnsw.recallOf([1, 2, 3], [3, 4, 1]), 2 / 3);
  const pts = hnsw.randomPoints(30, 5);
  const index = hnsw.build(pts, { M: 3, seed: 5 });
  for (const p of pts) assert.deepEqual(index.search(p, 1, 30).results, [p.id], "exact search on a point finds itself");
});

// --- Registry and roadmap ---------------------------------------------------------------------

const dashes = /[—–]/;

test("AI tools are registered and well-formed", async () => {
  assert.equal(SUBJECT.id, "ai");
  const core = new Set(CORE_TOOLS.map((t) => t.slug));
  const seen = new Set();
  for (const t of AI_TOOLS) {
    assert.match(t.slug, /^[a-z0-9-]+$/);
    assert.ok(!seen.has(t.slug) && !core.has(t.slug), `duplicate ${t.slug}`);
    seen.add(t.slug);
    assert.equal(t.subject, "ai");
    assert.equal(t.noPractice, true);
    assert.ok(t.title && t.summary && t.art, t.slug);
    assert.ok(t.description.length <= 170, `${t.slug}: description ${t.description.length}`);
    assert.ok(!dashes.test(t.title + t.summary + t.description), `${t.slug}: no long dashes`);
    assert.equal(typeof t.preview, "function");
    const view = await t.load();
    assert.equal(typeof view.render, "function", `${t.slug} must export render()`);
  }
  assert.deepEqual([...seen], ["tokenisation", "embeddings", "attention", "sampling", "kv-cache", "retrieval", "hnsw"]);
});

test("AI roadmap: ids, prerequisites, tools and reading", () => {
  assert.equal(AI_ROADMAPS.length, 1);
  const r = AI_ROADMAPS[0];
  assert.equal(r.id, "ai-engineering");
  const slugs = new Set(AI_TOOLS.map((t) => t.slug));
  const all = r.stages.flatMap((s) => s.modules);
  const ids = new Set(all.map((m) => m.id));
  assert.equal(ids.size, all.length);
  assert.deepEqual(r.stages.map((s) => s.title), ["Foundations", "How models work", "Retrieval", "Building"]);
  const used = new Set();
  for (const s of r.stages) {
    assert.match(s.id, /^[a-z0-9-]+$/);
    assert.ok(s.summary && !dashes.test(s.summary));
  }
  for (const m of all) {
    assert.match(m.id, /^ai\.[a-z0-9-]+$/);
    assert.ok(m.title && m.outcomes.length && m.hours > 0 && m.placement >= 0 && m.placement <= 5, m.id);
    for (const n of m.needs) assert.ok(ids.has(n), `${m.id}: unknown need ${n}`);
    for (const t of m.tools) { assert.ok(slugs.has(t), `${m.id}: unknown tool ${t}`); used.add(t); }
    for (const t of m.tryIt ?? []) assert.ok(m.tools.includes(t.tool) && t.label && t.query && !t.query.startsWith("?"), m.id);
    for (const l of m.reading ?? []) assert.match(l.url, /^https:\/\//);
    if (!m.tools.length) assert.ok(m.comingSoon && m.reading?.length, `${m.id}: comingSoon and reading`);
    assert.ok(!dashes.test([m.title, ...m.outcomes, m.comingSoon ?? ""].join(" ")), `${m.id}: no long dashes`);
  }
  for (const t of slugs) assert.ok(used.has(t), `${t} is in no module`);
  // No cycles.
  const needs = new Map(all.map((m) => [m.id, m.needs]));
  const state = new Map();
  const visit = (id) => { if (state.get(id) === 2) return; assert.notEqual(state.get(id), 1, `cycle at ${id}`); state.set(id, 1); needs.get(id).forEach(visit); state.set(id, 2); };
  for (const id of needs.keys()) visit(id);
});
