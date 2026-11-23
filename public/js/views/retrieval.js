import { ARTICLE, BM25_CODE, DOCS, STRATEGIES, bm25, chunk, dense, fixedCount, idf, pipeline, rerank, rrf, terms } from "../engines/retrieval.js";
import { copyLink, h, page, readParams, rng, writeParams } from "../ui.js";
import { choice, mountTabs } from "./kit.js";
import { approxQuestion, mix, num, practiceCard, series, traceSim } from "./ai-kit.js";

const MODES = [["bm25", "BM25"], ["dense", "Dense"], ["hybrid", "Hybrid (RRF)"], ["rerank", "Rerank"], ["chunking", "Chunking"], ["rag", "RAG pipeline"]];
const scoreCell = (s, max) => h("td", { class: "ai-scorecell", style: `--w:${max > 0 ? Math.max(0, s / max) * 100 : 0}%` }, num(s, 3));

function rankList(title, ranked, scores, docs, fmt = (x) => num(x, 3)) {
  return h("div", { class: "ai-rank" }, h("div", { class: "panel-title" }, title),
    h("ol", null, ranked.map((d) => h("li", null, h("b", null, `D${d + 1}`), h("span", { class: "muted small" }, ` ${fmt(scores[d])}`), h("div", { class: "small ai-clip" }, docs[d])))));
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: MODES.some(([m]) => m === p.get("mode")) ? p.get("mode") : "bm25",
    query: p.get("q") ?? "pet food for a kitten",
    docs: p.get("docs")?.split("\n").filter((d) => d.trim()) ?? DOCS.slice(),
    k: Number(p.get("k")) > 0 ? Number(p.get("k")) : 60,
    strategy: STRATEGIES[p.get("chunk")] ? p.get("chunk") : "heading",
    size: Math.min(200, Math.max(5, Number(p.get("size")) || 30)),
    overlap: Math.min(50, Math.max(0, Number(p.get("ov") ?? 10))),
    ragQuery: p.get("rq") ?? "how often should I feed a kitten",
    top: Math.min(4, Math.max(1, Number(p.get("top")) || 2)),
  };
  let sim = null;

  const head = page({
    subject: "AI engineering",
    title: "Retrieval and RAG",
    lede: "Find the right passages for a question: BM25 by hand, dense vectors, hybrid search with Reciprocal Rank Fusion, reranking, chunking and the prompt a RAG system sends.",
    theory: h("div", null,
      h("p", null, h("b", null, "Retrieval-augmented generation"), " (RAG) answers questions from your own documents: split them into chunks, find the chunks most relevant to the question, paste them into the prompt and ask the model to answer from them, citing which ones it used. The answer can only be as good as what retrieval finds."),
      h("ul", null,
        h("li", null, h("b", null, "BM25"), " is classic keyword search. A term scores more when it is rare across the collection (idf), when it appears often in the document (with diminishing returns, controlled by k1) and when the document is short (length normalisation, controlled by b). It is fast, exact and great for names and codes, but blind to synonyms."),
        h("li", null, h("b", null, "Dense retrieval"), " embeds the query and each chunk as vectors and ranks by cosine similarity, so \"pet\" can match \"kitten\". It can miss exact terms and depends on how good the embedding model is."),
        h("li", null, h("b", null, "Hybrid"), " runs both and merges the rankings. ", h("b", null, "Reciprocal Rank Fusion"), " adds 1 / (k + rank) from each list, so it needs only ranks, not comparable scores."),
        h("li", null, h("b", null, "Reranking"), " takes the top few results and rescores them with a slower, more careful model that reads query and passage together."),
        h("li", null, h("b", null, "Chunking"), " decides what a \"document\" is: too small and chunks lose context, too large and they dilute the match and waste prompt space. Overlap keeps sentences that straddle a boundary; splitting on sentences or headings keeps ideas whole.")),
      h("p", null, "Here the dense side uses the hand-made 8-dimensional word vectors from the embeddings tool, averaged per document, and the reranker is a simple stand-in (best word match per query word), not a trained model. The RAG answer is ", h("b", null, "not generated"), ": it copies the best-matching sentence from each retrieved chunk so you can see how citations line up with sources.")),
    conventions: [
      "Lower-case, letters only, a short stop-word list removed, no stemming (kitten and kittens differ).",
      "BM25: k1 = 1.2, b = 0.75, idf = ln(1 + (N − n + 0.5) / (n + 0.5)).",
      "RRF: score = Σ 1 / (k + rank), ranks from 1; k = 60 unless you change it. Ties keep document order.",
      "Sentence chunking packs whole sentences up to the size; a sentence longer than the size gets a chunk of its own. Headings start a new sentence.",
    ],
  });

  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; update(); } }, MODES.map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const queryIn = h("input", { type: "text", class: "ai-wide", value: state.query, "aria-label": "Query", onchange: (e) => { state.query = e.target.value; update(); } });
  const docsIn = h("textarea", { rows: 6, "aria-label": "Documents, one per line", value: state.docs.join("\n"), onchange: (e) => { state.docs = e.target.value.split("\n").filter((d) => d.trim()); if (!state.docs.length) state.docs = DOCS.slice(); update(); } });
  const controls = h("div"), out = h("div");
  const field = (label, key, min, max) => h("label", { class: "inline" }, label, " ", h("input", { type: "number", min, max, value: state[key], onchange: (e) => { state[key] = Math.min(max, Math.max(min, Number(e.target.value) || min)); e.target.value = state[key]; update(); } }));
  const docControls = h("div", null,
    h("div", { class: "row" }, h("label", { class: "inline ai-grow" }, "Query ", queryIn)),
    h("div", { class: "row" }, ["pet food for a kitten", "royal palace", "where does the cat sleep", "dog"].map((q) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.query = q; queryIn.value = q; update(); } }, q))),
    h("details", { class: "ai-details" }, h("summary", null, `Documents (${state.docs.length}), one per line`), docsIn, h("button", { type: "button", class: "btn ghost small", onclick: () => { state.docs = DOCS.slice(); docsIn.value = DOCS.join("\n"); update(); } }, "Reset documents")));

  function update() {
    const docsChanged = state.docs.join("\n") !== DOCS.join("\n");
    writeParams({ mode: state.mode, q: state.query, ...(docsChanged ? { docs: state.docs.join("\n") } : {}), k: state.k, chunk: state.strategy, size: state.size, ov: state.overlap, rq: state.ragQuery, top: state.top });
    sim?.player.destroy();
    sim = null;
    const docs = state.docs;
    const docTerms = docs.map(terms);
    if (["bm25", "dense", "hybrid", "rerank"].includes(state.mode)) controls.replaceChildren(docControls, state.mode === "hybrid" ? h("div", { class: "row" }, field("RRF k", "k", 1, 1000)) : "");
    else controls.replaceChildren(chunkControls());

    if (state.mode === "bm25") {
      const res = bm25(state.query, docs);
      const max = Math.max(...res.scores, 0.001);
      sim = traceSim({ steps: res.steps, code: BM25_CODE, interval: 1000, draw: (s) => h("div", { class: "table-wrap" }, h("table", { class: "ai-bm25" },
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Doc"), h("th", { scope: "col" }, "|d|"), res.query.map((t) => h("th", { scope: "col", class: t === s.term ? "hot" : null }, t, h("div", { class: "muted small" }, `idf ${num(idf(docs.length, docTerms.filter((d) => d.includes(t)).length), 2)}`))), h("th", { scope: "col" }, "Score"))),
        h("tbody", null, docs.map((d, i) => h("tr", { class: i === s.doc ? "hot" : s.ranked?.[0] === i ? "current" : null },
          h("th", { scope: "row", title: d }, `D${i + 1}`, h("div", { class: "muted small ai-clip" }, d)), h("td", null, docTerms[i].length),
          res.query.map((t) => {
            const f = docTerms[i].filter((x) => x === t).length;
            const done = res.query.indexOf(t) < res.query.indexOf(s.term) || s.final || (t === s.term && s.doc != null && i <= s.doc);
            return h("td", { class: t === s.term ? "hot" : null }, f ? h("span", null, `tf ${f}`, done && res.parts[i][t] != null ? h("div", { class: "small" }, `+${num(res.parts[i][t], 3)}`) : null) : h("span", { class: "muted" }, "0"));
          }),
          scoreCell(s.scores[i], max)))))) });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `BM25 for "${state.query}"`), sim.el));
    } else if (state.mode === "dense") {
      const res = dense(state.query, docs);
      const max = Math.max(...res.scores, 0.001);
      const lex = bm25(state.query, docs);
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Dense search for "${state.query}"`),
        h("p", { class: "muted" }, res.known.length ? `Query words with vectors: ${res.known.join(", ")}.` : "No query word has a vector, so every score is 0. A real embedding model covers far more words."),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Rank", "Doc", "Words with vectors", "Cosine", "BM25 rank"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, res.ranked.map((d, r) => h("tr", null, h("td", null, r + 1), h("th", { scope: "row" }, `D${d + 1}`, h("div", { class: "muted small ai-clip" }, docs[d])), h("td", { class: "small" }, res.docKnown[d].join(", ") || "none"), scoreCell(res.scores[d], max), h("td", null, lex.scores[d] > 0 ? lex.ranked.indexOf(d) + 1 : "no match")))))),
        h("p", { class: "muted small" }, "Each document vector is the average of its known word vectors. Dense search ranks every document, even ones that share no word with the query, which is how it finds synonyms, and also how it returns confident nonsense when nothing relevant exists.")));
    } else if (state.mode === "hybrid") {
      const lex = bm25(state.query, docs), sem = dense(state.query, docs);
      const lexRanked = lex.ranked.filter((d) => lex.scores[d] > 0);
      const fused = rrf([lexRanked, sem.ranked], state.k);
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, "Reciprocal Rank Fusion"),
        h("div", { class: "ai-cols" }, rankList("BM25 (matches only)", lexRanked, lex.scores, docs), rankList("Dense", sem.ranked, sem.scores, docs), rankList(`RRF, k = ${state.k}`, fused.ranked, Object.fromEntries(fused.scores), docs, (x) => num(x, 5))),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Doc", "BM25 rank", "Dense rank", "RRF score"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, fused.ranked.map((d) => {
            const a = lexRanked.indexOf(d) + 1, b = sem.ranked.indexOf(d) + 1;
            return h("tr", null, h("th", { scope: "row" }, `D${d + 1}`), h("td", null, a || "none"), h("td", null, b || "none"),
              h("td", { class: "mono small" }, [a ? `1/(${state.k}+${a})` : null, b ? `1/(${state.k}+${b})` : null].filter(Boolean).join(" + "), ` = ${num(fused.scores.get(d), 5)}`));
          })))),
        h("p", { class: "muted small" }, "RRF only uses positions, so it doesn't matter that BM25 scores and cosines are on different scales. A document near the top of both lists beats one that tops only one. A large k flattens the differences between ranks; a small k rewards first place more.")));
    } else if (state.mode === "rerank") {
      const lex = bm25(state.query, docs), sem = dense(state.query, docs);
      const fused = rrf([lex.ranked.filter((d) => lex.scores[d] > 0), sem.ranked], state.k);
      const cands = fused.ranked.slice(0, Math.min(4, fused.ranked.length));
      const rows = rerank(state.query, cands, docs);
      const q = terms(state.query);
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Rerank the top ${cands.length} hybrid results`),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "New rank"), h("th", { scope: "col" }, "Doc (was)"), q.map((w) => h("th", { scope: "col" }, w)), h("th", { scope: "col" }, "Score"))),
          h("tbody", null, rows.map((r, i) => h("tr", { class: i === 0 ? "current" : null }, h("td", null, i + 1), h("th", { scope: "row" }, `D${r.d + 1} (${cands.indexOf(r.d) + 1})`, h("div", { class: "muted small ai-clip" }, docs[r.d])),
            r.per.map((x) => h("td", { class: "small", style: `background:${mix(x.s * 45)}` }, x.best ? `${x.best} ${num(x.s, 2)}` : "no match")), h("td", null, h("b", null, num(r.score, 3)))))))),
        h("p", { class: "muted small" }, "Stand-in reranker: for each query word, the best cosine with any word in the document (an exact match scores 1), averaged. A real reranker is a trained cross-encoder that reads the query and passage together, which is too slow for the whole collection but affordable for the top few.")));
    } else if (state.mode === "chunking") {
      const chunks = chunk(ARTICLE, state.strategy, { size: state.size, overlap: state.overlap });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${STRATEGIES[state.strategy].name}: ${chunks.length} chunks`), articleView(chunks),
        h("ol", { class: "ai-chunks" }, chunks.map((c, i) => h("li", { style: `--c:${series(i)}` }, h("div", { class: "muted small" }, `Chunk ${c.id} · ${c.words} words`), h("pre", { class: "ai-pre" }, c.text)))),
        h("p", { class: "muted small" }, chunkNote(chunks))));
    } else {
      const res = pipeline(state.ragQuery, ARTICLE, { strategy: state.strategy, size: state.size, overlap: state.overlap, k: state.top });
      const steps = [
        { line: 1, vars: { strategy: STRATEGIES[state.strategy].name, chunks: res.chunks.length }, note: `Split the article into ${res.chunks.length} chunks (${STRATEGIES[state.strategy].name.toLowerCase()}). This happens once, ahead of time, and the chunks are indexed.` },
        { line: 2, vars: { query: state.ragQuery, ranked: res.ranked.map((d) => res.chunks[d].id) }, note: "Rank every chunk against the question with BM25 and dense search, fused with RRF." },
        { line: 3, vars: { k: state.top, kept: res.top.map((d) => res.chunks[d].id) }, note: `Keep the top ${state.top} and number them as sources. More sources give the model more to go on but cost tokens and can bury the useful one.` },
        { line: 4, vars: { "prompt characters": res.prompt.length }, note: "Assemble the prompt: instructions, numbered sources, then the question. Asking for citations makes the answer checkable." },
        { line: 5, vars: { cited: res.answer.map((a) => `[${a.cite}] = chunk ${a.chunk}`) }, final: true, note: "A model would now write the answer. Shown instead: the best-matching sentence from each source, with its citation, to show what a grounded answer can draw on." },
      ];
      const code = ["chunks ← split the document", "ranked ← hybrid search(question, chunks)", "sources ← the top k chunks, numbered [1], [2], …", "prompt ← instructions + sources + question", "answer ← model(prompt)  // should cite [n]"];
      sim = traceSim({ steps, code, interval: 1600, draw: (s, i) => h("div", { class: "ai-rag" },
        h("div", { class: `ai-stage${i === 0 ? " on" : ""}` }, h("b", null, "Chunks"), h("div", { class: "chips" }, res.chunks.map((c, j) => h("span", { class: `chip${i >= 2 && res.top.includes(j) ? " done" : ""}`, style: `--c:${series(j)}` }, c.id)))),
        h("div", { class: `ai-stage${i === 1 ? " on" : ""}` }, h("b", null, "Retrieve"), i >= 1 ? h("ol", { class: "small" }, res.ranked.slice(0, 4).map((d) => h("li", null, `Chunk ${res.chunks[d].id}: ${res.chunks[d].text.split("\n")[0].slice(0, 60)}`))) : h("p", { class: "muted small" }, `"${state.ragQuery}"`)),
        i >= 3 ? h("div", { class: `ai-stage${i === 3 ? " on" : ""}` }, h("b", null, "Prompt"), h("pre", { class: "ai-pre" }, res.prompt)) : null,
        i >= 4 ? h("div", { class: "ai-stage on" }, h("b", null, "Answer (placeholder, not generated)"), h("ul", null, res.answer.map((a) => h("li", null, a.sentence, " ", h("b", null, `[${a.cite}]`))))) : null) });
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, "RAG pipeline"),
        h("div", { class: "row" }, h("label", { class: "inline ai-grow" }, "Question ", h("input", { type: "text", class: "ai-wide", value: state.ragQuery, onchange: (e) => { state.ragQuery = e.target.value; update(); } })), field("Top k", "top", 1, 4)),
        h("div", { class: "row" }, ["how often should I feed a kitten", "when should the kitten see a vet", "can kittens drink milk", "why does my kitten scratch furniture"].map((q) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.ragQuery = q; update(); } }, q))),
        sim.el));
    }
  }

  function chunkControls() {
    const sel = h("select", { "aria-label": "Chunking strategy", onchange: (e) => { state.strategy = e.target.value; update(); } }, Object.entries(STRATEGIES).map(([k, s]) => h("option", { value: k, selected: k === state.strategy }, s.name)));
    const uses = STRATEGIES[state.strategy].uses;
    return h("div", { class: "row" }, sel, uses.includes("size") ? field(state.strategy === "sentence" ? "Max words" : "Words per chunk", "size", 5, 200) : null, uses.includes("overlap") ? field("Overlap", "overlap", 0, 50) : null);
  }

  // The article with each word coloured by its chunk; words in two chunks are underlined.
  function articleView(chunks) {
    const words = [...ARTICLE.matchAll(/\S+|\s+/g)];
    return h("div", { class: "ai-article" }, words.map((m) => {
      if (/^\s+$/.test(m[0])) return m[0].includes("\n") ? h("br") : " ";
      const at = chunks.filter((c) => m.index >= c.start && m.index < c.end);
      const c = at[0];
      return h("span", { class: `ai-cw${at.length > 1 ? " ov" : ""}${c && chunks.some((x) => x.start === m.index) ? " first" : ""}`, style: c ? `--c:${series(c.id - 1)}` : "", "data-chunk": c?.id }, m[0]);
    }));
  }

  function chunkNote(chunks) {
    switch (state.strategy) {
      case "fixed": return `Every chunk is ${state.size} words regardless of meaning, so sentences and sections get cut mid-thought. Simple and predictable.`;
      case "overlap": return `Each chunk repeats the last ${Math.min(state.overlap, state.size - 1)} words of the one before (underlined), so a sentence cut at a boundary appears whole somewhere. The cost: ${chunks.reduce((s, c) => s + c.words, 0) - ARTICLE.match(/\S+/g).length} extra words stored and embedded.`;
      case "sentence": return `Whole sentences are packed together up to ${state.size} words, so nothing is cut mid-sentence. Chunk sizes vary.`;
      default: return "One chunk per section: each keeps its heading, which tells the retriever (and the model) what the text is about. Sections can be very uneven in size; long ones are usually split further.";
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, h("div", { class: "row" }, modeSel, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), controls),
    out);

  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 4);
    if (kind === 0) {
      const N = 5 + Math.floor(r() * 46), n = 1 + Math.floor(r() * Math.min(N, 20));
      const v = idf(N, n);
      return { kind: "IDF", title: `A term appears in ${n} of ${N} documents. What is its BM25 idf?`, body: h("p", { class: "muted small" }, "idf = ln(1 + (N − n + 0.5) / (n + 0.5)). To 2 decimal places."),
        answer: approxQuestion(Number(v.toFixed(2)), `ln(1 + ${N - n + 0.5} / ${n + 0.5}) = ln(${(1 + (N - n + 0.5) / (n + 0.5)).toFixed(4)}) = ${v.toFixed(4)}.`, { tol: 0.011 }) };
    }
    if (kind === 1) {
      const k = [10, 60][Math.floor(r() * 2)];
      const ranks = Array.from({ length: 2 + Math.floor(r() * 2) }, () => 1 + Math.floor(r() * 10));
      const v = ranks.reduce((s, x) => s + 1 / (k + x), 0);
      return { kind: "RRF", title: `A document is ranked ${ranks.join(", ")} by ${ranks.length} retrievers. What is its RRF score with k = ${k}?`, body: h("p", { class: "muted small" }, "To 4 decimal places."),
        answer: approxQuestion(Number(v.toFixed(4)), `${ranks.map((x) => `1/(${k}+${x})`).join(" + ")} = ${v.toFixed(5)}.`, { tol: 0.00011 }) };
    }
    if (kind === 2) {
      const W = 40 + Math.floor(r() * 160), size = [10, 20, 25, 50][Math.floor(r() * 4)], ov = [0, 5, size / 2][Math.floor(r() * 3)];
      const n = fixedCount(W, size, ov);
      return { kind: "Chunking", title: `A ${W}-word document is split into ${size}-word chunks with ${ov} words of overlap. How many chunks?`, body: h("p", { class: "muted small" }, "Each chunk starts size − overlap words after the previous one; the last may be shorter."),
        answer: approxQuestion(n, `Step = ${size - ov}. After the first chunk, ${Math.max(0, W - size)} words remain, needing ⌈${Math.max(0, W - size)} / ${size - ov}⌉ = ${n - 1} more: ${n} chunks.`, { tol: 0 }) };
    }
    const vocab = ["cat", "dog", "food", "milk", "toy", "bed"];
    const term = vocab[Math.floor(r() * vocab.length)];
    const docs = Array.from({ length: 3 }, () => {
      const len = 3 + Math.floor(r() * 6), tf = Math.floor(r() * 3);
      const ws = Array.from({ length: len }, () => vocab.filter((v) => v !== term)[Math.floor(r() * 5)]);
      for (let i = 0; i < tf; i++) ws[Math.floor(r() * len)] = term;
      return ws.join(" ");
    });
    if (!docs.some((d) => d.split(" ").includes(term))) docs[0] = `${term} ${docs[0]}`;
    const res = bm25(term, docs);
    const opts = docs.map((_, i) => ({ label: `D${i + 1}`, correct: i === res.ranked[0] }));
    return { kind: "BM25 ranking", title: `Which document does BM25 rank first for the query "${term}"?`,
      body: h("ol", { class: "mono small" }, docs.map((d) => h("li", null, d))),
      answer: choice(opts, `Scores: ${res.scores.map((s, i) => `D${i + 1} ${s.toFixed(3)}`).join(", ")}. More occurrences help, but a shorter document with the same count wins. Ties go to the earlier document.`) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => sim?.player.destroy();
}
