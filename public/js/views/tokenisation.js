import { CORPUS, ENCODE_CODE, SAMPLES, TRAIN_CODE, compare, display, encode, practiceCorpus, symbolsOf, train } from "../engines/bpe.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, mountTabs, stat } from "./kit.js";
import { approxQuestion, practiceCard, series, traceSim } from "./ai-kit.js";

const chips = (syms, base, { hot = null, unknown = null } = {}) => h("span", { class: "ai-word" }, syms.map((t, i) => h("span", {
  class: `ai-tok${hot && t === hot ? " hot" : ""}${unknown && !unknown.has(t) ? " unk" : ""}`, style: `--c:${series(i)}`,
}, display(t, base))));

function trainVisual(step, model) {
  const merges = model.merges.slice(0, step.phase === "start" ? 0 : model.merges.indexOf(step.merge) + 1 || model.merges.length);
  const hot = step.merge?.token;
  return h("div", { class: "ai-bpe" },
    h("div", { class: "ai-bpe-top" },
      h("div", null, h("div", { class: "panel-title" }, `Merge table (${merges.length})`),
        merges.length ? h("ol", { class: "ai-merges" }, merges.slice(-12).map((m) => h("li", { class: m === step.merge ? "hot" : null, value: m.rank },
          h("code", null, display(m.a, model.base)), " + ", h("code", null, display(m.b, model.base)), " → ", h("b", null, display(m.token, model.base)), h("span", { class: "muted small" }, ` ×${m.count}`))))
          : h("p", { class: "muted small" }, "No merges yet.")),
      h("div", null, h("div", { class: "panel-title" }, "Most frequent pairs"),
        step.pairs.length ? h("ul", { class: "ai-pairs" }, step.pairs.map((p, i) => h("li", { class: i === 0 && step.merge ? "hot" : null },
          h("code", null, display(p.a, model.base)), " ", h("code", null, display(p.b, model.base)), h("span", { class: "muted" }, ` ${p.count}`))))
          : h("p", { class: "muted small" }, "None left."))),
    h("div", { class: "panel-title" }, `Corpus words, split into current tokens · vocabulary ${step.vocabSize}`),
    h("div", { class: "ai-words" }, step.words.map((w) => h("span", { class: "ai-wordbox" }, chips(w.syms, model.base, { hot }), w.count > 1 ? h("small", null, `×${w.count}`) : null))));
}

function encodeVisual(step, model) {
  const toks = step.words.flat();
  return h("div", null,
    h("div", { class: "ai-words big" }, step.words.map((w) => chips(w, model.base, { hot: step.merge?.token, unknown: step.final ? model.known : null }))),
    h("p", { class: "muted small" }, `${toks.length} token${toks.length === 1 ? "" : "s"}${step.final && model.base === "chars" ? " · dashed = not in the vocabulary" : ""}`));
}

function comparison(model, text) {
  const rows = [["Your text", text], ...Object.values(SAMPLES).map((s) => [s.name, s.text])];
  return h("section", { class: "card" }, h("h2", null, "Character vs word vs subword"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Text", "Characters", "UTF-8 bytes", "Word tokens", "Unseen words", "BPE tokens"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map(([name, t]) => {
        const c = compare(t, model);
        return h("tr", null, h("th", { scope: "row" }, name, h("div", { class: "muted small ai-clip" }, t)), h("td", null, c.chars), h("td", null, c.bytes), h("td", null, c.words), h("td", { class: c.oov ? "bad-text" : null }, c.oov), h("td", null, h("b", null, c.subword)));
      })))),
    h("p", { class: "muted small" }, "Character tokens never meet an unknown symbol but make long sequences. Word tokens are short but any word not seen in training is unknown. Subwords sit between: common words become one token, rare ones fall apart into pieces. Text the tokeniser saw little of in training (here Hindi, and code) splits into many more tokens per word, which costs more and fills the context window sooner."));
}

export function render(root) {
  const p = readParams();
  const state = {
    corpus: p.get("c") ?? CORPUS,
    merges: Math.min(200, Math.max(1, Number(p.get("m")) || 30)),
    base: p.get("base") === "bytes" ? "bytes" : "chars",
    digits: p.get("digits") === "split" ? "split" : "runs",
    text: p.get("t") ?? SAMPLES.english.text,
  };
  let sims = [];

  const head = page({
    subject: "AI engineering",
    title: "Tokenisation (BPE)",
    lede: "Train a byte-pair encoder on your own text, one merge at a time, then see how it cuts up English, Hindi, code and numbers.",
    theory: h("div", null,
      h("p", null, "Language models read numbers, not letters. A ", h("b", null, "tokeniser"), " turns text into a list of token ids from a fixed vocabulary. Characters make tiny vocabularies but long sequences; whole words make short sequences but huge vocabularies and many unknown words. ", h("b", null, "Subword"), " tokenisers sit in between."),
      h("p", null, h("b", null, "Byte-pair encoding"), " starts from single characters (or bytes) and repeatedly merges the most frequent neighbouring pair into a new symbol. Each merge is remembered. To tokenise new text, the same merges are replayed in the order they were learned, so frequent words end up as one token and rare words as several."),
      h("p", null, "Working on ", h("b", null, "UTF-8 bytes"), " instead of characters means every possible text can be encoded with a base vocabulary of 256, so nothing is ever unknown. The price: a Devanagari letter is 3 bytes and an emoji 4, so scripts the tokeniser saw little of need more tokens."),
      h("p", null, "Real tokenisers are trained on billions of words to reach vocabularies of 30,000 to 200,000 tokens, and add details this page skips: special tokens, careful rules for splitting text before merging, and normalisation. The idea is the same.")),
    conventions: [
      "Text is first cut into words, number runs and punctuation runs. A single leading space stays with its word and is shown as ▁. Other whitespace is dropped.",
      "Pairs are counted across all words, weighted by how often each word appears. Ties go to the pair seen first in the corpus.",
      "Training stops early if no pair appears at least twice.",
      "Character mode: the base vocabulary is the characters in the corpus, so unseen characters are unknown. Byte mode: all 256 byte values. Bytes that are not a whole character are shown in hex.",
    ],
  });

  // --- Visualise -----------------------------------------------------------------
  const corpusIn = h("textarea", { rows: 6, "aria-label": "Training corpus", value: state.corpus, oninput: (e) => { state.corpus = e.target.value; schedule(); } });
  const mergesIn = h("input", { type: "number", min: 1, max: 200, value: state.merges, onchange: (e) => { state.merges = Math.min(200, Math.max(1, Number(e.target.value) || 1)); update(); } });
  const baseSel = h("select", { onchange: (e) => { state.base = e.target.value; update(); } }, h("option", { value: "chars", selected: state.base === "chars" }, "characters"), h("option", { value: "bytes", selected: state.base === "bytes" }, "UTF-8 bytes"));
  const digitSel = h("select", { onchange: (e) => { state.digits = e.target.value; update(); } }, h("option", { value: "runs", selected: state.digits === "runs" }, "whole runs"), h("option", { value: "split", selected: state.digits === "split" }, "single digits"));
  const textIn = h("input", { type: "text", value: state.text, "aria-label": "Text to tokenise", class: "ai-wide", oninput: (e) => { state.text = e.target.value; schedule(); } });
  const msg = h("div"), out = h("div");
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 350); };

  function update() {
    writeParams({ ...(state.corpus !== CORPUS ? { c: state.corpus } : {}), m: state.merges, base: state.base, digits: state.digits, t: state.text });
    sims.forEach((s) => s.player.destroy());
    if (!state.corpus.trim()) { msg.replaceChildren(notice("error", "Type a training corpus first.")); out.replaceChildren(); return; }
    msg.replaceChildren();
    const model = train(state.corpus, { merges: state.merges, base: state.base, digits: state.digits });
    const t = traceSim({ steps: model.steps, code: TRAIN_CODE, draw: (s) => trainVisual(s, model), label: "Step", start: model.steps.length - 1 });
    const enc = encode(state.text, model);
    const e = traceSim({ steps: enc.steps, code: ENCODE_CODE, draw: (s) => encodeVisual(s, model), label: "Step", start: enc.steps.length - 1 });
    sims = [t, e];
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Training: merges learned one by one"), t.el,
        h("div", { class: "stats-row" }, stat("Merges learned", model.merges.length), stat("Vocabulary size", model.vocab.length), stat("Base symbols", state.base === "bytes" ? "256 bytes" : model.baseVocab.length))),
      h("section", { class: "card" }, h("h2", null, "Tokenising new text"),
        h("div", { class: "row" }, textIn),
        h("div", { class: "row" }, Object.entries(SAMPLES).map(([k, s]) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.text = s.text; textIn.value = s.text; update(); } }, s.name))),
        e.el,
        h("div", { class: "stats-row" }, stat("Tokens", enc.tokens.length), stat("Characters", Array.from(state.text).length), stat("Characters per token", enc.tokens.length ? (Array.from(state.text).length / enc.tokens.length).toFixed(2) : "n/a"))),
      comparison(model, state.text));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "panel-title", for: "bpe-corpus" }, "Training corpus"), corpusIn,
      h("div", { class: "row" },
        h("label", { class: "inline" }, "Merges ", mergesIn),
        h("label", { class: "inline" }, "Base ", baseSel),
        h("label", { class: "inline" }, "Numbers ", digitSel)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.corpus = CORPUS; corpusIn.value = CORPUS; update(); } }, "Default corpus"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.corpus = " low low low low low lower lower newest newest newest newest newest newest widest widest widest"; corpusIn.value = state.corpus; state.merges = 10; mergesIn.value = 10; update(); } }, "Classic low/lower/newest example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);
  corpusIn.id = "bpe-corpus";

  // --- Practice --------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  const make = () => {
    const r = rng();
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      const corpus = practiceCorpus(r);
      const n = 2 + Math.floor(r() * 2);
      const m = train(corpus, { merges: n });
      const total = m.words.reduce((s, w) => s + w.syms.length * w.count, 0);
      const start = m.words.reduce((s, w) => s + symbolsOf(w.word).length * w.count, 0);
      return { kind: "Merges", title: `Train BPE on this corpus for ${m.merges.length} merge${m.merges.length === 1 ? "" : "s"}. How many tokens is the corpus then?`,
        body: h("div", null, h("pre", { class: "ai-pre" }, corpus), h("p", { class: "muted small" }, `Characters, with the space before a word as ▁ (${start} symbols to start). Ties go to the pair seen first.`)),
        answer: approxQuestion(total, `Merges: ${m.merges.map((x) => `${x.a}+${x.b} (×${x.count})`).join(", ")}. Each merge removes one token per occurrence.`, { tol: 0 }) };
    }
    if (kind === 1) {
      const corpus = practiceCorpus(r);
      const m = train(corpus, { merges: 1 });
      const pairs = m.steps[0].pairs;
      const right = m.merges[0];
      const opts = [...new Map([right, ...pairs].map((p) => [`${p.a}${p.b}`, p])).values()].slice(0, 4).map((p) => ({ label: `${p.a} + ${p.b}`, correct: p.a === right.a && p.b === right.b }));
      opts.sort(() => r() - 0.5);
      return { kind: "First merge", title: "Which pair does BPE merge first?", body: h("pre", { class: "ai-pre" }, corpus),
        answer: choice(opts, `Counts: ${pairs.slice(0, 4).map((p) => `${p.a}${p.b} ${p.count}`).join(", ")}. Ties go to the pair seen first.`) };
    }
    const words = ["घर", "नमस्ते", "café", "hello", "日本", "naïve", "भारत", "पानी"];
    const w = words[Math.floor(r() * words.length)];
    const bytes = new TextEncoder().encode(w).length;
    return { kind: "Bytes", title: `How many UTF-8 bytes (so how many base tokens for a byte-level tokeniser) is "${w}"?`,
      body: h("p", { class: "muted small" }, "ASCII letters take 1 byte, accented Latin letters 2, Devanagari and most Chinese or Japanese characters 3."),
      answer: approxQuestion(bytes, `"${w}" has ${Array.from(w).length} code points and ${bytes} bytes.`, { tol: 0 }) };
  };
  mountTabs(root, head, visual, practice, () => practiceCard(practice, make));
  update();
  return () => { clearTimeout(timer); sims.forEach((s) => s.player.destroy()); };
}
