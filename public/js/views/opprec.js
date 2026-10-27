import { build, EQ, EXAMPLES, fromGrammar, fromRules, GT, LT, opParse, PARSE_CODE, precedenceFunctions, tokenizeOp } from "../engines/opprec.js";
import { parseGrammar, showProd } from "../engines/grammar.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, stat } from "./kit.js";

const RELCLASS = { [LT]: "op-lt", [EQ]: "op-eq", [GT]: "op-gt" };

// The relation table: row = topmost terminal on the stack, column = next input.
function relTable(res, { cells, fresh = [], hot = null } = {}) {
  const cols = res.table.cols, freshSet = new Set(fresh.map((f) => f.replace(/ [⋖≐⋗] /, "\u0000")));
  const get = (a, b) => (cells ? cells[`${a}\u0000${b}`] ?? [] : res.table.get(a, b));
  return h("div", { class: "table-wrap" }, h("table", { class: "parse op-rel" },
    h("thead", null, h("tr", null, h("th", { scope: "col", title: "stack ↓ / input →" }, "↓ \\ →"), cols.map((a) => h("th", { scope: "col" }, a)))),
    h("tbody", null, cols.map((a) => h("tr", null, h("th", { scope: "row" }, a), cols.map((b) => {
      const list = get(a, b), k = `${a}\u0000${b}`;
      const cls = [list.length > 1 && "conflict", freshSet.has(k) && "added", hot && hot[0] === a && hot[1] === b && "hot", list.length === 1 && RELCLASS[list[0]]].filter(Boolean).join(" ");
      return h("td", { class: cls || null, title: res.table.why(a, b).join("\n") || null }, list.join(" "));
    }))))));
}

function setsTable(res, st) {
  const T = (kind, A) => (st ? st[kind][A] : [...res[kind].get(A)]) ?? [];
  const isNew = (k, A, x) => st?.target === A && st.added?.includes(`${k}:${x}`);
  const cell = (kind, k, A) => { const list = T(kind, A); return h("td", { class: "left" }, list.length ? list.map((x, i) => [i ? ", " : "", isNew(k, A, x) ? h("b", { class: "added-x" }, x) : x]) : h("span", { class: "muted" }, "–")); };
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, ["Non-terminal", "LEADING", "TRAILING"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, res.g.nonterminals.map((A) => h("tr", { class: st?.target === A ? "hot" : null }, h("th", { scope: "row" }, A), cell("leading", "L", A), cell("trailing", "T", A))))));
}

export function render(root) {
  const p = readParams();
  const mode0 = p.get("mode") === "rules" ? "rules" : "grammar";
  const state = { mode: mode0, text: p.get("g") ?? (mode0 === "rules" ? EXAMPLES.ambiguous.text : EXAMPLES.expr.text), w: p.get("w") ?? (mode0 === "rules" ? EXAMPLES.ambiguous.input : EXAMPLES.expr.input) };
  let players = [];
  const head = page({
    subject: "Compiler design", title: "Operator-precedence parsing",
    lede: "Three relations between terminals, ⋖ ≐ ⋗, are enough to parse expressions bottom-up. Build them from LEADING and TRAILING or from precedence rules, then shift and reduce.",
    theory: h("div", null,
      h("p", null, "An ", h("b", null, "operator grammar"), " has no ε bodies and never two non-terminals side by side, so between any two terminals in a sentential form there's at most one non-terminal. The parser only ever compares terminals: the topmost terminal b on the stack against the next input a."),
      h("ul", null,
        h("li", null, h("b", null, "b ⋖ a"), ": a starts a new handle (b yields precedence). Shift."),
        h("li", null, h("b", null, "b ≐ a"), ": they're in the same handle, like ( and ). Shift."),
        h("li", null, h("b", null, "b ⋗ a"), ": b ends a handle (b takes precedence). Pop until the terminal below the last one popped is ⋖ it, and reduce what was popped.")),
      h("p", null, h("b", null, "LEADING(A)"), " is the set of terminals that can be the first terminal in a string derived from A; ", h("b", null, "TRAILING(A)"), " the last. Then: a ⋖ every b in LEADING(B) when a B appears in a body; every a in TRAILING(B) ⋗ b when B b appears; and terminals separated by at most one non-terminal are ≐."),
      h("p", null, "For an ambiguous grammar like E → E + E | E * E, write the table from precedence and associativity instead: the tighter operator ⋗ the looser one, and equal left-associative operators ⋗ each other. ", h("b", null, "Precedence functions"), " f and g squeeze the table into two numbers per terminal (a ⋖ b iff f(a) < g(b)), at the cost of no longer detecting some errors.")),
    conventions: [
      "Rows are the topmost terminal on the stack, columns the next input token. Blank cells are errors; red cells are conflicts.",
      "Non-terminals are placeholders: a handle like N + N is reduced by whichever production matches it, and unit productions (E → T) are never reduced on their own.",
      "Precedence levels are listed lowest first, one per line: operators then left or right.",
    ],
  });

  const modeSel = h("select", { "aria-label": "Build the table from", onchange: (e) => {
    state.mode = e.target.value;
    const ex = state.mode === "rules" ? EXAMPLES.ambiguous : EXAMPLES.expr;
    state.text = ex.text; state.w = ex.input; textIn.value = ex.text; wIn.value = ex.input; update();
  } }, [["grammar", "From an operator grammar"], ["rules", "From precedence rules"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const textIn = h("textarea", { rows: 5, class: "mono", "aria-label": "Grammar or precedence levels", oninput: (e) => { state.text = e.target.value; update(); } }, state.text);
  const textLabel = h("span");
  const wIn = h("input", { type: "text", class: "mono wide", value: state.w, "aria-label": "Input tokens", oninput: (e) => { state.w = e.target.value; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ mode: state.mode, g: state.text, w: state.w });
    modeSel.value = state.mode;
    textLabel.textContent = state.mode === "rules" ? "Precedence levels, lowest first (operators, then left or right)" : "Operator grammar";
    let res;
    try { res = build(state.mode, state.text); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const conflicts = res.table.conflicts();
    msg.replaceChildren(conflicts.length
      ? notice("bad", `Not an operator-precedence grammar: ${conflicts.map((c) => `${c.a} ${c.rels.join("/")} ${c.b}`).join(", ")}. The parser below uses the first relation.`)
      : notice("good", "No conflicts: every pair of terminals has at most one relation."));

    // 1. Build.
    const code1 = codePanel(res.code, { title: res.mode === "rules" ? "Table from rules" : "LEADING, TRAILING, table" }), vars1 = varsPanel();
    const setsBox = h("div"), tableBox = h("div"), note1 = h("p", { class: "step-note", "aria-live": "polite" }), prodBox = h("div");
    const p1 = stepper({
      count: res.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = res.steps[i];
        if (res.mode === "grammar") {
          setsBox.replaceChildren(setsTable(res, st));
          prodBox.replaceChildren(h("ul", { class: "prod-list" }, res.g.prods.map((pr) => h("li", { class: pr.i === st.prod ? "hot" : null }, h("b", null, pr.i + 1), showProd(pr)))));
        }
        tableBox.replaceChildren(relTable(res, { cells: st.cells, fresh: st.fresh ?? [] }));
        code1.show(st.line);
        vars1.show(st.vars);
        note1.textContent = st.note;
        note1.className = `step-note${i === res.steps.length - 1 ? " good" : ""}`;
      },
    });

    // 2. Parse.
    const tokens = tokenizeOp(state.w, res.table.cols);
    const run = opParse(res, tokens);
    const code2 = codePanel(PARSE_CODE, { title: "Shift-reduce driver" }), vars2 = varsPanel();
    const stackBox = h("div", { class: "op-stack" }), inputBox = h("div", { class: "input-chars" }), parseTable = h("div"), treeBox = h("div", { class: "chart-wrap" });
    const note2 = h("p", { class: "step-note", "aria-live": "polite" });
    const p2 = stepper({
      count: run.steps.length, label: "Move", interval: 900,
      render: (i) => {
        const st = run.steps[i], before = new Set((run.steps[i - 1]?.stack ?? []).map((x) => x.id));
        const topT = [...st.stack].reverse().find((x) => !x.nt);
        stackBox.replaceChildren(...st.stack.map((x) => h("span", { class: [x.nt ? "nt" : "", x === topT ? "top" : "", i && !before.has(x.id) ? (x.nt ? "op-reduced" : "op-pushed") : ""].filter(Boolean).join(" ") || null }, x.sym)));
        inputBox.replaceChildren(...st.input.map((s, k) => h("span", { class: k < st.pos ? "done" : k === st.pos ? "now" : null }, s)));
        parseTable.replaceChildren(relTable(res, { hot: st.cell ?? null }));
        if (st.forest.length) morph(treeBox, treeDiagram(st.forest, { align: "bottom", lit: [st.reduced, st.shift].filter(Boolean), aria: "Subtrees on the stack" }));
        else treeBox.replaceChildren(h("p", { class: "muted" }, "Nothing shifted yet."));
        code2.show(st.line);
        vars2.show(st.vars ?? {});
        note2.textContent = st.note;
        note2.className = `step-note${st.good ? " good" : st.bad ? " bad" : ""}`;
      },
    });
    players.push(p1, p2);

    const fg = precedenceFunctions(res.table);
    const fgSection = h("section", { class: "card" }, h("h2", null, "Precedence functions"),
      fg ? h("div", null,
        h("div", { class: "table-wrap" }, h("table", { class: "parse" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, ""), res.table.cols.map((a) => h("th", { scope: "col" }, a)))),
          h("tbody", null, [["f", fg.f], ["g", fg.g]].map(([n, m]) => h("tr", null, h("th", { scope: "row" }, n), res.table.cols.map((a) => h("td", null, m[a]))))))),
        h("p", { class: "muted small" }, "Graph method: a node for each fa and ga; a ≐ b merges fa with gb; a ⋗ b draws fa → gb and a ⋖ b draws gb → fa. Each value is the longest path from that node. Now a ⋖ b exactly when f(a) < g(b) and a ⋗ b when f(a) > g(b), but blank (error) cells become ordinary comparisons, so some errors are caught later."))
        : notice("info", conflicts.length ? "The table has conflicts, so there are no precedence functions." : "The graph has a cycle, so no precedence functions represent this table."));

    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `1. Build the table${res.mode === "grammar" ? " from LEADING and TRAILING" : " from precedence and associativity"}`), p1.el, note1,
        traceLayout(h("div", null,
          res.mode === "grammar" ? h("div", null, h("h3", { class: "small muted" }, "Productions"), prodBox, h("h3", { class: "small muted op-gap" }, "LEADING and TRAILING"), setsBox) : h("p", { class: "muted small" }, `Grammar: ${res.g.prods.map((pr) => pr.rhs.join(" ")).join(" | ").replace(/^/, "E → ")}`),
          h("h3", { class: "small muted op-gap" }, "Relations (green = just added)"), tableBox), code1, vars1)),
      h("section", { class: "card" }, h("h2", null, "2. Shift-reduce parse"), p2.el, note2,
        traceLayout(h("div", null,
          h("div", { class: "ll-row" },
            h("div", null, h("h3", { class: "small muted" }, "Stack (bottom → top; the topmost terminal is outlined)"), stackBox),
            h("div", null, h("h3", { class: "small muted" }, "Input"), inputBox)),
          h("h3", { class: "small muted op-gap" }, "Subtrees on the stack"), treeBox,
          h("h3", { class: "small muted op-gap" }, "Relation used"), parseTable), code2, vars2),
        h("div", { class: "stats-row" }, stat("Tokens", tokens.length), stat("Moves", run.steps.length - 1), stat("Reductions", run.reductions.length), stat("Result", run.accepted ? "Accepted" : "Error"))),
      fgSection);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.mode = ex.mode; state.text = ex.text; state.w = ex.input; textIn.value = ex.text; wIn.value = ex.input; update(); }), modeSel,
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, textLabel, textIn),
      h("label", { class: "stack" }, "Input tokens", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), any = (xs) => xs[Math.floor(r() * xs.length)];
    const kind = r();
    let body;
    if (kind < 0.35) {
      const ex = any([EXAMPLES.expr, EXAMPLES.power]);
      const res = fromGrammar(parseGrammar(ex.text));
      const cols = res.table.cols, a = any(cols), b = any(cols), rel = res.table.rel(a, b);
      body = [h("h2", null, `What is the relation between ${a} (on the stack) and ${b} (next input)?`),
        h("ul", { class: "prod-list" }, res.g.prods.map((pr) => h("li", null, showProd(pr)))),
        choice([[LT, "⋖ (shift)"], [EQ, "≐ (shift)"], [GT, "⋗ (reduce)"], [null, "Blank (error)"]].map(([x, l]) => ({ label: l, correct: x === rel })),
          rel ? `${a} ${rel} ${b}: ${res.table.why(a, b)[0]}.` : `No production puts ${a} and ${b} next to each other in a way that relates them, so it's an error entry.`)];
    } else if (kind < 0.65) {
      const ex = any([EXAMPLES.expr, EXAMPLES.power, EXAMPLES.minus]);
      const res = fromGrammar(parseGrammar(ex.text));
      const which = r() < 0.5 ? "leading" : "trailing", A = any(res.g.nonterminals);
      const truth = [...res[which].get(A)], picked = new Set(), feedback = h("div");
      body = [h("h2", null, `What is ${which.toUpperCase()}(${A})?`),
        h("ul", { class: "prod-list" }, res.g.prods.map((pr) => h("li", null, showProd(pr)))),
        h("p", { class: "muted" }, "Select every terminal in the set."),
        h("div", { class: "row" }, res.g.terminals.map((t) => h("button", { type: "button", class: "btn ghost toggle mono", "aria-pressed": "false", onclick: (e) => {
          picked.has(t) ? picked.delete(t) : picked.add(t);
          e.currentTarget.setAttribute("aria-pressed", String(picked.has(t)));
        } }, t))),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = truth.length === picked.size && truth.every((x) => picked.has(x));
          feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} ${which.toUpperCase()}(${A}) = {${truth.join(", ")}}.`));
        } }, "Check")),
        feedback];
    } else {
      const [x, y] = any([["+", "*"], ["-", "/"], ["+", "-"], ["*", "^"], ["-", "^"]]);
      const sameLevel = r() < 0.4, assoc = any(["left", "right"]);
      const levels = sameLevel ? [{ ops: [x, y], assoc }] : r() < 0.5 ? [{ ops: [x], assoc: "left" }, { ops: [y], assoc }] : [{ ops: [y], assoc }, { ops: [x], assoc: "left" }];
      const [o1, o2] = r() < 0.5 ? [x, y] : [y, x];
      const res = fromRules(levels), run = opParse(res, ["id", o1, "id", o2, "id"]);
      const first = run.steps.find((s) => s.prod != null && res.g.prods[s.prod].rhs.length === 3);
      const firstOp = res.g.prods[first.prod].rhs[1];
      const text = levels.map((l) => `${l.ops.join(" ")} ${l.assoc}`).join("; ");
      body = [h("h2", null, `In id ${o1} id ${o2} id, which operator is reduced first?`),
        h("p", { class: "grammar-box" }, `Levels, lowest first: ${text}`),
        choice([{ label: `The first one (${o1})`, correct: firstOp === o1 }, { label: `The second one (${o2})`, correct: firstOp === o2 }],
          `${o1} ${res.table.rel(o1, o2)} ${o2}, so ${res.table.rel(o1, o2) === GT ? `the ${o1} handle is reduced as soon as ${o2} arrives` : `${o2} is shifted on top and its handle is reduced first`}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}

