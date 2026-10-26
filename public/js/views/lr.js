import { EXAMPLES, LR_KINDS, lrAutomaton, lrParse, lrTable, parseGrammar, showProd, tokenize } from "../engines/grammar.js";
import { stateDiagram, treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, series, stat } from "./kit.js";

const boxes = (auto, upTo = Infinity, conflictStates = new Set()) => auto.items.map((items, i) => ({
  id: `${i}`, label: `I${auto.names[i]}`,
  lines: items.map((it) => ({ text: `${it.text}${it.la ? `   ${it.la}` : ""}`, cls: it.complete ? "complete" : null })),
  visible: i <= upTo, conflict: conflictStates.has(i),
}));

// Up to build step `step`: the states found so far and the moves that found them
// (every build step after the first adds exactly one edge, in order).
function automatonDiagram(auto, { step = Infinity, fresh = null, lit = null, conflictStates }) {
  const upTo = step === Infinity ? Infinity : Math.max(...auto.build.slice(0, step + 1).map((b) => b.state));
  const all = boxes(auto, upTo, conflictStates).filter((b) => b.visible);
  const edges = (step === Infinity ? auto.edges : auto.edges.slice(0, step)).map((e) => ({ from: `${e.from}`, to: `${e.to}`, label: e.sym }));
  const classes = {}, styles = {};
  for (const b of all) if (b.conflict) classes[b.id] = "conflict";
  if (auto.merged) auto.merged.forEach((m, i) => { if (m.length > 1) { classes[`${i}`] = `${classes[`${i}`] ?? ""} grp`; styles[`${i}`] = series(i); } });
  return stateDiagram({ states: all, edges, start: "0", shape: "box", active: fresh != null ? [`${fresh}`] : [], lit: lit ? [lit] : [], classes, styles, aria: `${LR_KINDS[auto.kind]} automaton with ${auto.states.length} states.` });
}

function actionTable(auto, t, { hot = null, focus = null } = {}) {
  const conflict = new Set(t.conflicts.map((c) => `${c.state}\u0000${c.t}`));
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null,
      h("tr", null, h("th", { scope: "col", rowspan: 2 }, "State"), h("th", { scope: "col", colspan: t.cols.length, class: "group" }, "ACTION"), t.gotoCols.length ? h("th", { scope: "col", colspan: t.gotoCols.length, class: "group" }, "GOTO") : null),
      h("tr", null, t.cols.map((a) => h("th", { scope: "col" }, a)), t.gotoCols.map((A) => h("th", { scope: "col" }, A)))),
    h("tbody", null, auto.states.map((_, i) => h("tr", { class: focus === i ? "hot" : null }, h("th", { scope: "row" }, auto.names[i]),
      t.cols.map((a) => {
        const list = t.action[i].get(a) ?? [];
        return h("td", { class: [conflict.has(`${i}\u0000${a}`) && "conflict", hot && hot[0] === i && hot[1] === a && "hot"].filter(Boolean).join(" ") || null }, list.map(t.label).join(" / "));
      }),
      t.gotoCols.map((A) => h("td", null, t.go[i].has(A) ? auto.names[t.go[i].get(A)] : "")))))));
}

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? EXAMPLES.expr.text, w: p.get("w") ?? "id * id + id", kind: LR_KINDS[p.get("kind")] ? p.get("kind") : "slr" };
  let players = [];
  const head = page({
    subject: "Compiler design", title: "LR parsing",
    lede: "Build LR(0), SLR(1), LALR(1) and CLR(1) automata and tables, compare their conflicts, and parse bottom-up with the tree assembling itself.",
    theory: h("div", null,
      h("p", null, "An LR parser shifts tokens onto a stack and ", h("b", null, "reduces"), " a rule's body to its head once the body is on top. Each state is a set of ", h("b", null, "items"), ": rules with a dot showing how much has been seen."),
      h("ul", null,
        h("li", null, h("b", null, "LR(0)"), ": reduce whenever an item is complete, whatever comes next. Clashes are common."),
        h("li", null, h("b", null, "SLR(1)"), ": same automaton, but reduce A → α only on tokens in FOLLOW(A)."),
        h("li", null, h("b", null, "CLR(1)"), ": items carry a lookahead, the exact token that may follow. Most powerful, but many more states."),
        h("li", null, h("b", null, "LALR(1)"), ": merge CLR states with the same items (core), joining lookaheads. As few states as LR(0); what yacc and bison build.")),
      h("p", null, "A ", h("b", null, "shift/reduce"), " conflict means a state can both shift a token and reduce on it; ", h("b", null, "reduce/reduce"), " means two rules could be reduced. The grammar is in a class only if its table has no conflicts.")),
    conventions: ["sN = shift and go to state N; rN = reduce by rule N; acc = accept.", "Rule 0 is the augmented rule S′ → S. Items in green are complete (dot at the end).", "LALR states are named after the CLR states they merge, e.g. I36."],
  });
  const gIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const wIn = h("input", { type: "text", class: "mono wide", value: state.w, "aria-label": "Input tokens", oninput: (e) => { state.w = e.target.value; update(); } });
  const kindSel = h("select", { "aria-label": "Parser type", onchange: (e) => { state.kind = e.target.value; update(); } }, Object.entries(LR_KINDS).map(([k, v]) => h("option", { value: k, selected: k === state.kind }, v)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ g: state.g, w: state.w, kind: state.kind });
    kindSel.value = state.kind;
    let g, autos;
    try {
      g = parseGrammar(state.g);
      autos = Object.fromEntries(Object.keys(LR_KINDS).map((k) => [k, lrAutomaton(g, k)]));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const tables = Object.fromEntries(Object.entries(autos).map(([k, a]) => [k, lrTable(a)]));
    const auto = autos[state.kind], t = tables[state.kind];
    msg.replaceChildren(t.conflicts.length
      ? notice("bad", `Not ${LR_KINDS[state.kind]}: ${t.conflicts.map((c) => `${c.kind} in state ${auto.names[c.state]} on ${c.t} (${c.actions.map(t.label).join(" vs ")})`).join("; ")}.`)
      : notice("good", `The grammar is ${LR_KINDS[state.kind]}: no conflicts in the table.`));
    const conflictStates = new Set(t.conflicts.map((c) => c.state));

    // Compare the four.
    const compare = h("section", { class: "card" }, h("h2", null, "Which parsers can handle it?"),
      h("div", { class: "table-wrap" }, h("table", { class: "parse kind-compare" },
        h("thead", null, h("tr", null, ["Parser", "States", "Conflicts", "Verdict"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", null, Object.keys(LR_KINDS).map((k) => h("tr", { class: k === state.kind ? "hot" : null },
          h("th", { scope: "row" }, h("button", { type: "button", onclick: () => { state.kind = k; update(); } }, LR_KINDS[k])),
          h("td", null, autos[k].states.length), h("td", null, tables[k].conflicts.length),
          h("td", { class: tables[k].conflicts.length ? "conflict" : "added" }, tables[k].conflicts.length ? "✗ conflicts" : "✓ works")))))));

    // The automaton, built step by step (LALR is shown merged).
    const autoBox = h("div", { class: "chart-wrap" }), autoNote = h("p", { class: "step-note", "aria-live": "polite" });
    let autoSection;
    if (state.kind === "lalr") {
      morph(autoBox, automatonDiagram(auto, { conflictStates }));
      const merges = auto.merged.filter((m) => m.length > 1);
      autoSection = h("section", { class: "card" }, h("h2", null, "LALR(1) automaton"), autoBox,
        h("p", { class: "step-note" }, merges.length ? `${auto.lr1Count} CLR(1) states merge into ${auto.states.length}: ${merges.map((m) => `I${m.join(" + I")}`).join(", ")} share the same items and differ only in lookaheads.` : "No two CLR(1) states share a core, so LALR(1) is the same as CLR(1) here."));
    } else {
      const builds = auto.build;
      const pl = stepper({
        count: builds.length, label: "Step", interval: 900, start: builds.length - 1,
        render: (i) => {
          const b = builds[i];
          morph(autoBox, automatonDiagram(auto, { step: i, fresh: b.state, lit: b.from != null ? { from: `${b.from}`, to: `${b.state}` } : null, conflictStates: i === builds.length - 1 ? conflictStates : new Set() }));
          autoNote.textContent = b.note.replace(/I(\d+)/g, (m, n) => `I${auto.names[n] ?? n}`);
          autoNote.className = `step-note${i === builds.length - 1 ? " good" : ""}`;
        },
      });
      players.push(pl);
      autoSection = h("section", { class: "card" }, h("h2", null, `${LR_KINDS[state.kind]} automaton (${auto.kind === "clr" ? "LR(1)" : "LR(0)"} items)`), pl.el, autoNote, autoBox,
        h("p", { class: "muted small" }, "Red boxes have a conflict. Drag the slider back to watch the states get discovered."));
    }

    // Parse.
    const tokens = tokenize(state.w, g);
    const res = lrParse(auto, t, tokens);
    const tableBox = h("div"), stackBox = h("p", { class: "grammar-box" }), inputBox = h("div", { class: "input-chars" }), treeBox = h("div", { class: "chart-wrap" });
    const note = h("p", { class: "step-note", "aria-live": "polite" });
    const pp = stepper({
      count: res.steps.length, label: "Move", interval: 900,
      render: (i) => {
        const st = res.steps[i];
        tableBox.replaceChildren(actionTable(auto, t, { hot: st.cell ?? null, focus: st.states.at(-1) }));
        stackBox.textContent = st.stack;
        inputBox.replaceChildren(...st.input.map((s, k) => h("span", { class: k < st.pos ? "done" : k === st.pos ? "now" : null }, s)));
        if (st.forest.length) morph(treeBox, treeDiagram(st.forest, { align: "bottom", aria: "Parse forest on the stack" }));
        else treeBox.replaceChildren(h("p", { class: "muted" }, "Nothing on the stack yet."));
        note.textContent = st.action;
        note.className = `step-note${st.good ? " good" : st.bad ? " bad" : ""}`;
      },
    });
    players.push(pp);
    out.replaceChildren(compare, autoSection,
      h("section", { class: "card" }, h("h2", null, `${LR_KINDS[state.kind]} parse`), pp.el,
        h("div", { class: "ll-row" }, h("div", null, h("h3", { class: "small muted" }, "Stack (states and symbols)"), stackBox), h("div", null, h("h3", { class: "small muted" }, "Input"), inputBox)),
        note, h("h3", { class: "small muted" }, "Subtrees on the stack: reductions join them"), treeBox,
        h("div", { class: "stats-row" }, stat("Tokens", tokens.length), stat("Moves", res.steps.length - 1), stat("Result", res.accepted ? "Accepted" : "Error"))),
      h("section", { class: "card" }, h("h2", null, "Parsing table"), tableBox,
        h("h3", { class: "small muted" }, "Rules"), h("ul", { class: "prod-list" }, auto.g.prods.map((pr) => h("li", null, h("b", null, pr.i), showProd(pr))))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.g = ex.text; state.w = ex.input; gIn.value = ex.text; wIn.value = ex.input; update(); }), kindSel,
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar", gIn),
      h("label", { class: "stack" }, "Input", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const keys = ["expr", "cc", "lr", "ifelse", "balanced"];
    const key = keys[Math.floor(r() * keys.length)], g = parseGrammar(EXAMPLES[key].text);
    const kind = Object.keys(LR_KINDS)[Math.floor(r() * 4)];
    const a = lrAutomaton(g, kind), tb = lrTable(a);
    const ok = !tb.conflicts.length;
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Is this grammar ${LR_KINDS[kind]}?`),
      h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
      choice([{ label: "Yes, no conflicts", correct: ok }, { label: "No, the table has a conflict", correct: !ok }],
        ok ? `The ${LR_KINDS[kind]} table (${a.states.length} states) has no conflicts.` : `${tb.conflicts.map((c) => `${c.kind} in state ${a.names[c.state]} on ${c.t}`).join("; ")}.`),
      h("p", null, h("a", { href: `/lr-parsing?g=${encodeURIComponent(EXAMPLES[key].text)}&kind=${kind}` }, "See the automaton and table →"))));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
