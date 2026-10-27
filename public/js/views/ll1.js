import { CODE, END, EPS, EXAMPLES, leftFactor, ll1, ll1Parse, parseGrammar, removeLeftRecursion, showProd, toText, tokenize } from "../engines/grammar.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stackChips } from "./stackchips.js";
import { treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, stat } from "./kit.js";

export function parseTable(g, t, { hot = null } = {}) {
  const conflict = new Set(t.conflicts.map((c) => `${c.nt}\u0000${c.t}`));
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "M"), t.cols.map((a) => h("th", { scope: "col" }, a)))),
    h("tbody", null, g.nonterminals.map((A) => h("tr", null, h("th", { scope: "row" }, A), t.cols.map((a) => {
      const cell = t.cell(A, a), k = `${A}\u0000${a}`;
      return h("td", { class: [conflict.has(k) && "conflict", hot && hot[0] === A && hot[1] === a && "hot"].filter(Boolean).join(" ") || null, title: cell.length ? t.reasons.filter((x) => x.nt === A && x.t === a).map((x) => `${showProd(g.prods[x.prod])}: ${x.why}`).join("\n") : null },
        cell.length ? cell.map((i, n) => [n ? h("br") : "", `${A} → ${g.prods[i].rhs.join(" ") || EPS}`]) : "");
    }))))));
}

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? EXAMPLES.exprLL.text, w: p.get("w") ?? EXAMPLES.exprLL.input };
  let player = null;
  const head = page({
    subject: "Compiler design", title: "LL(1) parsing",
    lede: "Build the predictive parsing table from FIRST and FOLLOW, then parse a string top-down and watch the parse tree grow.",
    theory: h("div", null,
      h("p", null, "For each rule A → α: put it in M[A, a] for every terminal a in FIRST(α). If α can derive ε, also put it in M[A, b] for every b in FOLLOW(A)."),
      h("p", null, "The grammar is ", h("b", null, "LL(1)"), " if no cell gets two rules. Left recursion and common prefixes always cause clashes, so fix them first."),
      h("p", null, "To parse, keep a stack holding $ and the start symbol. If the top is a terminal, it must match the next token. If it's a non-terminal A, look up M[A, next token], pop A and push the rule's body in reverse. Accept when both reach $.")),
    conventions: ["Tokens are separated by spaces (or typed together when every terminal is one character or id).", "Red cells hold more than one rule: a conflict.", "Dashed tree nodes are on the stack but not expanded yet.", "X is the symbol on top of the stack and a is the next input token."],
  });
  const gIn = h("textarea", { rows: 7, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const wIn = h("input", { type: "text", class: "mono wide", value: state.w, "aria-label": "Input tokens", oninput: (e) => { state.w = e.target.value; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ g: state.g, w: state.w });
    let g, t;
    try { g = parseGrammar(state.g); t = ll1(g); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const leftRec = removeLeftRecursion(g).changed, factor = leftFactor(g).changed;
    msg.replaceChildren(t.conflicts.length
      ? notice("bad", `Not LL(1): ${t.conflicts.length} conflict${t.conflicts.length > 1 ? "s" : ""} (${t.conflicts.map((c) => `M[${c.nt}, ${c.t}]`).join(", ")}).${leftRec ? " The grammar is left-recursive." : ""}${factor ? " Some alternatives share a prefix." : ""}`)
      : notice("good", "LL(1): every cell has at most one rule."));
    if (t.conflicts.length && (leftRec || factor)) {
      const fixed = toText(leftFactor(removeLeftRecursion(g).grammar).grammar);
      msg.append(h("p", null, h("button", { type: "button", class: "btn ghost", onclick: () => { state.g = fixed; gIn.value = fixed; update(); } }, "Remove left recursion and left factor it"), " ", h("a", { href: `/left-recursion?g=${encodeURIComponent(state.g)}` }, "see the steps →")));
    }
    const tokens = tokenize(state.w, g);
    const res = ll1Parse(g, t, tokens);
    const tableBox = h("div"), stackBox = h("div", { class: "ll-stack" }), inputBox = h("div", { class: "input-chars" }), treeBox = h("div", { class: "chart-wrap" });
    const note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(CODE.ll1Parse, { title: "Pseudocode (table-driven LL(1))" }), vars = varsPanel();
    player = stepper({
      count: res.steps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = res.steps[i];
        tableBox.replaceChildren(parseTable(g, t, { hot: st.nt ? [st.nt, st.t] : null }));
        stackBox.replaceChildren(...stackChips(st.stack, i ? res.steps[i - 1].stack : null, { topFirst: true, classOf: (s) => (g.isNT(s) ? "nt" : null) }));
        code.show(st.line);
        vars.show(st.vars);
        inputBox.replaceChildren(...st.input.map((s, k) => h("span", { class: k < st.pos ? "done" : k === st.pos ? "now" : null }, s)));
        morph(treeBox, treeDiagram(st.tree, { aria: "Parse tree so far" }));
        note.textContent = st.action;
        note.className = `step-note${st.good ? " good" : st.bad ? " bad" : ""}`;
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Parsing table"), tableBox,
        h("p", { class: "muted small" }, "Hover a cell to see why the rule is there.")),
      h("section", { class: "card" }, h("h2", null, "Parse"), player.el, note,
        traceLayout(h("div", null,
          h("div", { class: "ll-row" },
            h("div", null, h("h3", { class: "small muted" }, "Stack (top first)"), stackBox),
            h("div", null, h("h3", { class: "small muted" }, "Input"), inputBox)),
          h("h3", { class: "small muted tcd-sub" }, "Parse tree so far"), treeBox), code, vars),
        h("div", { class: "stats-row" }, stat("Tokens", tokens.length), stat("Steps", res.steps.length - 1), stat("Result", res.accepted ? "Accepted" : "Error"))),
      h("section", { class: "card" }, h("h2", null, "Trace"), h("div", { class: "table-wrap" }, h("table", { class: "parse trace" },
        h("thead", null, h("tr", null, ["#", "Stack", "Input", "Action"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", null, res.steps.map((s, k) => h("tr", null, h("td", null, k), h("td", null, s.stack.join(" ")), h("td", null, s.input.slice(s.pos).join(" ")), h("td", null, s.action))))))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.g = ex.text; state.w = ex.input; gIn.value = ex.text; wIn.value = ex.input; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar", gIn),
      h("label", { class: "stack" }, "Input", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const g = parseGrammar(EXAMPLES[["exprLL", "balanced", "cc"][Math.floor(r() * 3)]].text), t = ll1(g);
    const A = g.nonterminals[Math.floor(r() * g.nonterminals.length)], a = t.cols[Math.floor(r() * t.cols.length)];
    const cell = t.cell(A, a);
    const options = [...g.prods.filter((pr) => pr.lhs === A).map((pr) => ({ label: showProd(pr), correct: cell.includes(pr.i) })), { label: "Empty (error)", correct: !cell.length }];
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `What goes in M[${A}, ${a}]?`),
      h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
      choice(options, cell.length ? t.reasons.filter((x) => x.nt === A && x.t === a).map((x) => `${showProd(g.prods[x.prod])} because ${x.why}.`).join(" ") : `No rule for ${A} can start with ${a}${a === END ? " or vanish before the end" : ""}, so a parser seeing it here reports an error.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
