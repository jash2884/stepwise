import { CODE, nodeCount, OPS, parseWords, Trie } from "../engines/trie.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";
import { chips, forestLayout, legend, opsTable, shuffle, stepCard, treeSvg } from "./dsa-kit.js";

const EXAMPLES = {
  car: { name: "car card care cat dog", words: ["car", "card", "care", "cat", "dog"] },
  tea: { name: "Classic: to tea ted ten i in inn", words: ["to", "tea", "ted", "ten", "i", "in", "inn"], q: "ate" },
  sea: { name: "she sells sea shells by the shore", words: ["she", "sells", "sea", "shells", "by", "the", "shore"], q: "ash" },
  prefix: { name: "A prefix is not a word: search \"car\" in card, care", words: ["card", "care", "cart"], q: "scar" },
  del: { name: "Delete with pruning", words: ["bat", "bath", "bad", "ball"], then: "dbath" },
};
const WORD_BANK = ["car", "card", "care", "careful", "cat", "cart", "can", "cane", "do", "dog", "dot", "dote", "tea", "ten", "tent", "to", "toe", "top", "tap", "tape", "ant", "and", "an", "app", "apple", "ape", "bat", "ball", "bad", "bed"];
const LEGEND = [["On the path", "var(--series-1)"], ["Current", "var(--accent)"], ["Shared prefix", "var(--series-4)"], ["New / found", "var(--good)"], ["Missing / removed", "var(--bad)"], ["End of a word", "var(--text)"]];

function trieSvg(step) {
  const L = forestLayout([step.tree], { gapX: 46, gapY: 62, top: 30 });
  const nodes = [], edges = [];
  const walk = (n) => {
    const p = L.pos.get(n.id);
    nodes.push({ id: `^${n.id}`, x: p.x, y: p.y, label: n.id ? "" : "root", ring: n.end, cls: `${n.id ? "" : "root "}${n.end ? "end " : ""}${step.lit?.[n.id] ?? ""}`, sub: n.end && !n.kids.length ? n.id : null, badge: n.end && n.kids.length ? n.id : null, badgeCls: "word", title: n.id ? `"${n.id}"${n.end ? " (a word)" : ""}` : "The root (empty prefix)" });
    for (const k of n.kids) { edges.push({ from: `^${n.id}`, to: `^${k.id}`, label: k.id.at(-1), cls: step.lit?.[k.id] ? "lit" : "" }); walk(k); }
  };
  walk(step.tree);
  return treeSvg({ nodes, edges, W: Math.max(L.W, 160), H: L.H + 18, aria: `Trie with ${nodes.length} nodes`, cls: "trie" });
}

function wordStrip(step) {
  if (step.word == null) return null;
  return h("div", { class: "dt-word", "aria-hidden": "true" }, [...(step.word || "ε")].map((c, i) => h("span", { class: i < step.typed ? "done" : i === step.typed ? "now" : null }, c)));
}

export function render(root) {
  const p = readParams();
  const state = { ops: (p.get("ops") ?? "icar,icard,icare,icat,idog").split(",").filter((s) => /^[id][a-z]+$/.test(s)), q: /^[spa][a-z]*$/.test(p.get("q") ?? "") ? p.get("q") : null, from: null };
  let player = null;

  const head = page({
    subject: "Data structures & algorithms", title: "Trie",
    lede: "A prefix tree: words that start the same way share a path. Insert, search, prefix search, autocomplete and delete, letter by letter.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "trie"), " stores strings one letter per edge. The path from the root to a node spells a prefix, and a node is marked when a whole word ends there (the double ring). Words with a common prefix share its nodes, so \"car\", \"card\" and \"care\" need only six nodes beyond the root."),
      h("p", null, "Every operation walks one letter at a time, so it costs O(L) for a word of length L, ", h("b", null, "however many words are stored"), ". A hash table also gives O(L) lookups, but a trie can answer \"which words start with ca?\" by walking to \"ca\" and collecting everything below it: that's ", h("b", null, "autocomplete"), "."),
      h("p", null, "Search must check the end mark at the end: \"car\" can be a path in the trie (because \"card\" is stored) without being a word. ", h("b", null, "Delete"), " clears the end mark, then removes nodes bottom-up while they have no children and aren't the end of another word.")),
    conventions: ["Letters a to z only; words are lowercased.", "Children are kept in alphabetical order, so autocomplete lists words alphabetically.", "Node counts include the root.", "Inserting a word that's already stored changes nothing."],
  });

  const wordIn = h("input", { type: "text", class: "mono", "aria-label": "Word", placeholder: "word or prefix", onkeydown: (e) => { if (e.key === "Enter") mutate("i"); } });
  const wordsIn = h("input", { type: "text", class: "mono wide", "aria-label": "Words to insert" });
  const msg = h("div"), out = h("div", { class: "output" }), history = h("p", { class: "muted small history" });
  const btn = (label, fn, cls = "ghost") => h("button", { type: "button", class: `btn ${cls}`, onclick: fn }, label);
  const fail = (e) => msg.replaceChildren(notice("error", e.message));
  const word = (allowEmpty = false) => {
    const w = wordIn.value.trim().toLowerCase();
    if (!w && allowEmpty) return "";
    const [one] = parseWords(w);
    if (!one) throw new Error("Type a word first.");
    return one;
  };

  function mutate(kind) {
    msg.replaceChildren();
    try {
      const ws = kind === "i" ? parseWords(wordIn.value) : [word()];
      if (!ws.length) throw new Error("Type a word first.");
      if (state.ops.length + ws.length > 40) throw new Error("That's a lot of history. Build a fresh trie from a word list instead.");
      state.from = state.ops.length; state.q = null;
      state.ops.push(...ws.map((w) => kind + w));
      rebuild();
    } catch (e) { fail(e); }
  }
  function ask(kind) { msg.replaceChildren(); try { state.q = kind + word(kind === "a"); state.from = null; rebuild(); } catch (e) { fail(e); } }
  function build(words) {
    msg.replaceChildren();
    try {
      words ??= parseWords(wordsIn.value);
      state.ops = words.map((w) => `i${w}`); state.q = null; state.from = 0;
      rebuild();
    } catch (e) { fail(e); }
  }

  function rebuild() {
    const t = new Trie();
    let steps = [], code = "insert";
    state.ops.forEach((op, i) => {
      const s = op[0] === "i" ? t.insert(op.slice(1)) : t.delete(op.slice(1));
      if (state.from == null ? i === state.ops.length - 1 : i >= state.from) { steps.push(...s); code = op[0] === "i" ? "insert" : "delete"; }
    });
    if (state.q) {
      const [k, w] = [state.q[0], state.q.slice(1)];
      steps = k === "s" ? t.search(w) : k === "p" ? t.search(w, "prefix") : t.complete(w);
      code = { s: "search", p: "prefix", a: "complete" }[k];
    }
    if (!steps.length) steps = [{ tree: t.snapTree(), line: null, note: "The trie is empty: just the root. Insert some words.", vars: {} }];
    wordsIn.value = t.words().join(" ");
    writeParams({ ops: state.ops.join(","), ...(state.q ? { q: state.q } : {}) });
    history.textContent = state.ops.length ? `History: ${state.ops.map((o) => `${o[0] === "i" ? "+" : "−"}${o.slice(1)}`).join(" ")}` : "";
    show(t, steps, code);
  }

  function show(t, steps, code) {
    player?.destroy();
    const sc = stepCard(steps, {
      title: { insert: "Insert", delete: "Delete", search: "Search", prefix: "Starts with", complete: "Autocomplete" }[code], code: CODE[code], draw: trieSvg,
      below: (s) => [wordStrip(s), s.found ? chips("Suggestions", s.found, "visit") : null, legend(LEGEND)],
    });
    player = sc.player;
    const words = t.words(), letters = words.reduce((a, w) => a + w.length, 0);
    out.replaceChildren(sc.card,
      h("section", { class: "card" }, h("h2", null, "This trie"),
        h("div", { class: "stats-row" }, stat("Words", words.length), stat("Nodes (with root)", t.size()), stat("Letters in all words", letters), stat("Saved by sharing", Math.max(0, letters + 1 - t.size()))),
        h("p", { class: "muted small" }, words.length ? `Stored words, alphabetically: ${words.join(", ")}.` : "")),
      h("section", { class: "card" }, h("h2", null, "Complexity"), opsTable(OPS, code), h("p", { class: "muted small" }, "L is the length of the word, k the number of nodes under the prefix and Σ the alphabet size (26 here).")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { build(ex.words); if (ex.then) { state.from = state.ops.length; state.ops.push(ex.then); rebuild(); } else if (ex.q) { state.q = ex.q; rebuild(); } }),
        btn("Random", () => { const r = rng(); build(shuffle(WORD_BANK, r).slice(0, 5 + Math.floor(r() * 4))); }),
        btn("Clear", () => { state.ops = []; state.q = null; rebuild(); }),
        btn("Copy link", (e) => copyLink(e.currentTarget))),
      h("div", { class: "row" }, wordIn, btn("Insert", () => mutate("i"), "primary"), btn("Delete", () => mutate("d")), btn("Search", () => ask("s")), btn("Starts with", () => ask("p")), btn("Autocomplete", () => ask("a"))),
      h("label", { class: "stack" }, "Build from a word list (letters a to z, up to 16 words)", h("div", { class: "row", style: "margin:0" }, wordsIn, btn("Build", () => build()))),
      msg, history),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const words = shuffle(WORD_BANK, r).slice(0, 4 + Math.floor(r() * 3));
    const t = new Trie();
    for (const w of words) t.insert(w);
    const q = Math.floor(r() * 4);
    let body;
    if (q === 0) {
      body = [h("h2", null, "How many nodes does a trie holding these words have, counting the root?"), h("p", { class: "grammar-box" }, words.join(", ")),
        numberQuestion(nodeCount(words), `One node per distinct prefix, plus the root: ${nodeCount(words)}.`)];
    } else if (q === 1) {
      const pre = words[Math.floor(r() * words.length)].slice(0, 1 + Math.floor(r() * 2));
      const right = t.words().filter((w) => w.startsWith(pre)).join(", ");
      const opts = new Set([right, t.words().filter((w) => w.startsWith(pre.slice(0, 1))).join(", "), t.words().filter((w) => w.startsWith(pre) && w !== pre).join(", ") || "(none)", t.words().filter((w) => w.length > pre.length + 1 && w.startsWith(pre)).join(", ") || "(none)"]);
      body = [h("h2", null, `The trie holds ${words.join(", ")}. What does autocomplete("${pre}") return, in order?`),
        choice(shuffle([...opts], r).map((o) => ({ label: o || "(none)", correct: o === right })), `Walk to "${pre}" and collect every marked node below it, a to z: ${right || "(none)"}.`)];
    } else if (q === 2) {
      const prefixes = [...new Set(words.flatMap((w) => [...Array(w.length)].map((_, i) => w.slice(0, i + 1))))];
      const cands = shuffle(prefixes, r).slice(0, 4);
      const pick = cands[Math.floor(r() * cands.length)];
      body = [h("h2", null, `The trie holds ${words.join(", ")}. Does search("${pick}") return true?`),
        choice([{ label: "true", correct: t.has(pick) }, { label: "false", correct: !t.has(pick) }], t.has(pick) ? `"${pick}" is stored and its node is marked.` : `The path for "${pick}" exists, but its node isn't marked as the end of a word: it's only a prefix.`)];
    } else {
      const w = words[Math.floor(r() * words.length)], before = t.size();
      t.delete(w);
      body = [h("h2", null, `The trie holds ${words.join(", ")}. How many nodes are removed when "${w}" is deleted?`),
        numberQuestion(before - t.size(), `Clear the end mark, then prune upwards while a node has no children and isn't a word: ${before - t.size()} removed.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, btn("New question", newQuestion)), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  rebuild();
  return () => player?.destroy();
}
