import { cyk, EXAMPLES, parseGrammar, showProd, tokenize } from "../engines/grammar.js";
import { treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, randomString, stat } from "./kit.js";

const CNF_EXAMPLES = { cnf: EXAMPLES.cnf, anbn: EXAMPLES.anbn, pal: { name: "Even palindromes in CNF", text: "S -> A X | B Y | A A | B B\nX -> S A\nY -> S B\nA -> a\nB -> b", input: "a b b a" } };

// Row 0 of the pyramid is the longest span (the whole string).
function pyramid(table, n, { hot = null, left = [], right = [], verdict = null, filled }) {
  const isIn = (cells, len, i) => cells.some(([l, j]) => l === len - 1 && j === i);
  return h("div", { class: "cyk", role: "table", "aria-label": "CYK table" },
    Array.from({ length: n }, (_, r) => {
      const len = n - r;
      return h("div", { class: "cyk-row", role: "row" }, Array.from({ length: n - len + 1 }, (_, i) => {
        const done = filled(len, i), set = table[len - 1][i];
        const cls = ["cyk-cell", !done && "todo", done && !set.length && "empty",
          hot && hot[0] === len && hot[1] === i && "hot", isIn(left, len, i) && "left", isIn(right, len, i) && "right",
          verdict && len === n && i === 0 && verdict].filter(Boolean).join(" ");
        return h("div", { class: cls, role: "cell", title: `Span of length ${len} starting at symbol ${i + 1}` }, done ? (set.length ? set.join(", ") : "∅") : "");
      }));
    }));
}

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? EXAMPLES.cnf.text, w: p.get("w") ?? EXAMPLES.cnf.input };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "CYK parsing",
    lede: "Does a grammar generate a string? Cocke–Younger–Kasami fills a triangular table bottom-up, from single symbols to the whole string.",
    theory: h("div", null,
      h("p", null, "CYK needs a grammar in ", h("b", null, "Chomsky normal form"), ": every rule is A → B C (two non-terminals) or A → a (one terminal). Every context-free grammar can be converted to CNF."),
      h("p", null, "The bottom row holds, for each symbol, the non-terminals that produce it. A cell higher up covers a longer substring: for each way to split it into a left part and a right part, if B derives the left part, C derives the right part and A → B C is a rule, then A goes in the cell."),
      h("p", null, "The string is in the language if the start symbol is in the top cell. With n symbols and |G| rules this takes O(n³·|G|) time.")),
    conventions: ["Bottom row = single symbols; the top cell is the whole string.", "Blue = left part, orange = right part of a split that produced something.", "Separate symbols with spaces, or type them together if each is one character."],
  });

  const gIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Grammar in CNF", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const wIn = h("input", { type: "text", class: "mono", value: state.w, "aria-label": "String", oninput: (e) => { state.w = e.target.value; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ g: state.g, w: state.w });
    let g, tokens, res;
    try { g = parseGrammar(state.g); tokens = tokenize(state.w, g); res = cyk(g, tokens); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const n = tokens.length;
    const tableBox = h("div", { class: "table-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), treeBox = h("div", { class: "chart-wrap" });
    const order = res.steps.map((s) => [s.len, s.i]);
    player = stepper({
      count: res.steps.length, label: "Cell", interval: 1200,
      render: (k) => {
        const st = res.steps[k];
        const doneUpTo = new Set(order.slice(0, k + 1).map(([l, i]) => `${l}.${i}`));
        const useful = st.splits.filter((s) => s.found.length);
        const last = k === res.steps.length - 1;
        tableBox.replaceChildren(
          pyramid(st.table, n, { hot: [st.len, st.i], left: useful.map((s) => s.left), right: useful.map((s) => s.right), verdict: last ? (res.accepted ? "win" : "lose") : null, filled: (l, i) => doneUpTo.has(`${l}.${i}`) }),
          h("div", { class: "cyk-word" }, tokens.map((t) => h("span", null, t))));
        note.textContent = st.note + (last ? (res.accepted ? ` ${g.start} is in the top cell: the string IS in the language.` : ` ${g.start} isn't in the top cell: the string is NOT in the language.`) : "");
        note.className = `step-note${last ? (res.accepted ? " good" : " bad") : ""}`;
      },
    });
    if (res.tree) morph(treeBox, treeDiagram(res.tree, { aria: "Parse tree from the CYK table" }));
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "CYK table"), player.el, tableBox, note,
        h("div", { class: "stats-row" }, stat("Symbols", n), stat("Cells", (n * (n + 1)) / 2), stat("Rules", g.prods.length), stat("Result", res.accepted ? "In the language" : "Not in it"))),
      h("div", { class: "grid-2" },
        h("section", { class: "card" }, h("h2", null, "Grammar"), h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr))))),
        h("section", { class: "card" }, h("h2", null, "Parse tree"), res.tree ? treeBox : h("p", { class: "muted" }, "No parse tree: the string isn't generated by the grammar."))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(CNF_EXAMPLES, (ex) => { state.g = ex.text; state.w = ex.input; gIn.value = ex.text; wIn.value = ex.input; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar (Chomsky normal form)", gIn),
      h("label", { class: "stack" }, "String", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const ex = r() < 0.5 ? CNF_EXAMPLES.cnf : CNF_EXAMPLES.anbn;
    const g = parseGrammar(ex.text);
    let w = randomString(r, ["a", "b"], 2, 5);
    if (ex === CNF_EXAMPLES.anbn && r() < 0.5) { const k = 1 + Math.floor(r() * 3); w = "a".repeat(k) + "b".repeat(k); }
    const res = cyk(g, [...w]);
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Is "${w}" generated by this grammar?`),
      h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
      choice([{ label: "Yes", correct: res.accepted }, { label: "No", correct: !res.accepted }], `The top cell is {${res.table[w.length - 1][0].join(", ") || "∅"}}, which ${res.accepted ? "contains" : "doesn't contain"} ${g.start}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
