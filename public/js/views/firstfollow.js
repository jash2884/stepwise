import { CODE, END, EPS, EXAMPLES, firstFollow, parseGrammar, showProd } from "../engines/grammar.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? EXAMPLES.exprLL.text };
  let player = null;
  const head = page({
    subject: "Compiler design", title: "FIRST & FOLLOW",
    lede: "The two sets every predictive parser is built from, computed pass by pass until nothing changes.",
    theory: h("div", null,
      h("p", null, h("b", null, "FIRST(α)"), " is the set of terminals that can begin a string derived from α, plus ε if α can derive the empty string. For A → X1 X2 …, add FIRST(X1); if X1 can vanish, add FIRST(X2) too, and so on."),
      h("p", null, h("b", null, "FOLLOW(A)"), " is the set of terminals that can appear right after A in some sentential form. Put $ in FOLLOW(start). For every B → α A β, add FIRST(β) without ε; and if β can vanish (or is empty), add all of FOLLOW(B)."),
      h("p", null, "Both are fixed-point computations: keep making passes over the rules until a full pass adds nothing.")),
    conventions: ["ε is the empty string; $ is the end of input.", "Green cells are what the current step just added."],
  });
  const gIn = h("textarea", { rows: 7, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ g: state.g });
    let g, res;
    try { g = parseGrammar(state.g); res = firstFollow(g); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const tableBox = h("div", { class: "table-wrap" }), prodBox = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(CODE.firstFollow), vars = varsPanel();
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = res.steps[i];
        const isAdded = (kind, A, x) => st.phase === kind && st.target === A && st.added?.includes(x);
        const cell = (kind, A, list) => h("td", { class: "left" }, list.length ? list.map((x, k) => [k ? ", " : "", isAdded(kind, A, x) ? h("b", { class: "added-x" }, x) : x]) : h("span", { class: "muted" }, "–"));
        tableBox.replaceChildren(h("table", { class: "parse" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Non-terminal"), h("th", { scope: "col" }, "FIRST"), h("th", { scope: "col" }, "FOLLOW"))),
          h("tbody", null, g.nonterminals.map((A) => h("tr", { class: st.target === A ? "hot" : null },
            h("th", { scope: "row" }, A), cell("first", A, st.first[A]), cell("follow", A, st.follow[A]))))));
        prodBox.replaceChildren(h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", { class: pr.i === st.prod ? "hot" : null }, h("b", null, pr.i + 1), showProd(pr)))));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.phase === "done" ? " good" : ""}`;
      },
    });
    const nullable = res.nullable;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "FIRST and FOLLOW, pass by pass"), player.el, note,
        traceLayout(h("div", null, tableBox, h("h3", { class: "small muted tcd-sub" }, "Rules (the one being used is highlighted)"), prodBox), code, vars),
        h("div", { class: "stats-row" }, stat("Non-terminals", g.nonterminals.length), stat("Terminals", g.terminals.length), stat("Nullable", nullable.length ? nullable.join(", ") : "none", true)),
        h("p", null, h("a", { href: `/ll1-parsing?g=${encodeURIComponent(state.g)}` }, "Build the LL(1) table →"), " · ", h("a", { href: `/lr-parsing?g=${encodeURIComponent(state.g)}&kind=slr` }, "SLR(1) uses FOLLOW too →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.g = ex.text; gIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar", gIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const keys = ["exprLL", "cc", "lr", "balanced", "indirect", "expr"];
    const g = parseGrammar(EXAMPLES[keys[Math.floor(r() * keys.length)]].text);
    const res = firstFollow(g);
    const which = r() < 0.5 ? "FIRST" : "FOLLOW";
    const A = g.nonterminals[Math.floor(r() * g.nonterminals.length)];
    const truth = [...(which === "FIRST" ? res.first : res.follow).get(A)];
    const pool = [...g.terminals, which === "FIRST" ? EPS : END];
    const picked = new Set();
    const chips = h("div", { class: "row" }, pool.map((t) => h("button", { type: "button", class: "btn ghost toggle mono", "aria-pressed": "false", onclick: (e) => {
      picked.has(t) ? picked.delete(t) : picked.add(t);
      e.currentTarget.setAttribute("aria-pressed", String(picked.has(t)));
    } }, t)));
    const feedback = h("div");
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `What is ${which}(${A})?`),
      h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
      h("p", { class: "muted" }, "Select every symbol in the set."),
      chips,
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const ok = truth.length === picked.size && truth.every((x) => picked.has(x));
        feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} ${which}(${A}) = {${truth.join(", ")}}.`));
      } }, "Check")),
      feedback));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
