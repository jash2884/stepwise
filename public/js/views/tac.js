import { CODE, dag, EXAMPLES, generate, parseBlock, quadruples, show, tree, triples } from "../engines/tac.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { dagDiagram, treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const codeList = (code, hot = -1, upTo = code.length - 1) => h("ol", { class: "prod-list code-list", start: 1 },
  code.map((c, i) => h("li", { class: [i === hot && "hot", i > upTo && "later"].filter(Boolean).join(" ") || null }, show(c))));

function grid(head, rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", null, r.map((x) => h("td", null, x)))))));
}

export function render(root) {
  const p = readParams();
  const state = { src: p.get("src") ?? EXAMPLES.dragon.text };
  let players = [];
  const head = page({
    subject: "Compiler design", title: "Three-address code & DAGs",
    lede: "Turn assignments into three-address code, then build the DAG that spots common subexpressions and computes each one only once.",
    theory: h("div", null,
      h("p", null, h("b", null, "Three-address code"), " has at most one operator per instruction: x = y op z. Walking the syntax tree bottom-up, every operator gets a fresh temporary t1, t2, …"),
      h("p", null, "A ", h("b", null, "DAG"), " (directed acyclic graph) is a syntax tree where identical subexpressions share one node. Building it with ", h("b", null, "value numbering"), ": before creating a node for op(l, r), look for an existing node with the same operator and children. If one exists, reuse it. Assignments attach the variable's name to a node, and a later assignment moves the name."),
      h("p", null, "Instructions can be stored as ", h("b", null, "quadruples"), " (op, arg1, arg2, result), or as ", h("b", null, "triples"), " (op, arg1, arg2) where a result is referred to by its position, like (2).")),
    conventions: ["One assignment per line (or separate them with ;).", "Operators: + - * / % ^ and unary minus, with the usual precedence; ^ is right-associative.", "Green DAG nodes were reused: a common subexpression found."],
  });
  const srcIn = h("textarea", { rows: 5, class: "mono", "aria-label": "Assignments", oninput: (e) => { state.src = e.target.value; update(); } }, state.src);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ src: state.src });
    let stmts;
    try { stmts = parseBlock(state.src); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const naive = generate(stmts), d = dag(stmts);

    // 1. Syntax trees → naive code.
    const treeBox = h("div", { class: "chart-wrap" }), codeBox = h("div"), note1 = h("p", { class: "step-note", "aria-live": "polite" });
    const code1 = codePanel(CODE.gen, { title: "Pseudocode (tree walk)" }), vars1 = varsPanel();
    const code2 = codePanel(CODE.dag, { title: "Pseudocode (value numbering)" }), vars2 = varsPanel();
    const p1 = stepper({
      count: naive.steps.length, label: "Instruction", interval: 1000,
      render: (i) => {
        const st = naive.steps[i];
        morph(treeBox, treeDiagram(tree(stmts[st.stmt]), { lit: [st.node === "root" ? "root" : st.node], aria: `Syntax tree of ${stmts[st.stmt].src}` }));
        codeBox.replaceChildren(codeList(naive.code, st.code, st.code));
        note1.textContent = `${stmts[st.stmt].src}: ${st.note}`;
        code1.show(st.line);
        vars1.show(st.vars);
        note1.className = `step-note${i === naive.steps.length - 1 ? " good" : ""}`;
      },
    });
    // 2. The DAG, node by node.
    const dagBox = h("div", { class: "chart-wrap" }), note2 = h("p", { class: "step-note", "aria-live": "polite" });
    const p2 = stepper({
      count: d.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = d.steps[i];
        const seen = Math.max(...d.steps.slice(0, i + 1).map((s) => s.node));
        // Names attached so far: replay the label moves up to this step.
        const names = new Map(d.nodes.map((n) => [n.id, []]));
        for (const s of d.steps.slice(0, i + 1)) if (/^Attach/.test(s.note)) {
          const v = stmts[s.stmt].target;
          for (const l of names.values()) { const k = l.indexOf(v); if (k >= 0) l.splice(k, 1); }
          names.get(s.node).push(v);
        }
        const nodes = d.nodes.filter((n) => n.id <= seen).map((n) => ({ id: n.id, label: n.op, kids: n.kids, labels: names.get(n.id), leaf: n.leaf }));
        morph(dagBox, dagDiagram(nodes, { lit: st.reused ? [] : [st.node], reused: st.reused ? [st.node] : [], aria: "Expression DAG so far" }));
        note2.textContent = `${stmts[st.stmt].src}: ${st.note}`;
        code2.show(st.line);
        vars2.show(st.vars);
        note2.className = `step-note${st.reused ? " good" : ""}`;
      },
    });
    players.push(p1, p2);
    const saved = naive.code.length - d.code.length;
    const quads = quadruples(d.code), trips = triples(d.code);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "1. Syntax tree to three-address code"), p1.el, note1,
        traceLayout(h("div", { class: "tcd-stack" }, treeBox, codeBox), code1, vars1)),
      h("section", { class: "card" }, h("h2", null, "2. Build the DAG"), p2.el, note2, traceLayout(dagBox, code2, vars2),
        h("div", { class: "stats-row" }, stat("Tree code", `${naive.code.length} instr.`), stat("DAG code", `${d.code.length} instr.`), stat("Saved", saved), stat("DAG nodes", d.nodes.length))),
      h("div", { class: "grid-2" },
        h("section", { class: "card" }, h("h2", null, "Code from the DAG"), codeList(d.code),
          h("p", { class: "muted small" }, saved > 0 ? `Shared subexpressions are computed once: ${saved} fewer instruction${saved > 1 ? "s" : ""} than the tree version.` : "No common subexpressions here, so the DAG saves nothing.")),
        h("section", { class: "card" }, h("h2", null, "Quadruples"), grid(["#", "op", "arg1", "arg2", "result"], quads.map((q, i) => [i, q.op, q.arg1, q.arg2, q.result])))),
      h("section", { class: "card" }, h("h2", null, "Triples"), grid(["#", "op", "arg1", "arg2"], trips.map((q, i) => [`(${i})`, q.op, q.arg1, q.arg2])),
        h("p", { class: "muted small" }, "Triples drop the result column: (n) means the value computed by instruction n. Indirect triples add a separate list of pointers so instructions can be reordered without renumbering.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.src = ex.text; srcIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Assignments (a basic block)", srcIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const v = () => "abcd"[Math.floor(r() * 4)];
    const op = () => "+-*"[Math.floor(r() * 3)];
    const sub = `${v()} ${op()} ${v()}`;
    const shapes = [`(${sub}) * ${v()} + (${sub})`, `${v()} * (${sub}) - (${sub}) * ${v()}`, `(${sub}) ${op()} (${sub})`, `${v()} ${op()} ${v()} * ${v()}`];
    const src = `x = ${shapes[Math.floor(r() * shapes.length)]}`;
    const d = dag(parseBlock(src));
    const interior = d.nodes.filter((n) => !n.leaf).length;
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "How many operator (interior) nodes does the DAG have?"),
      h("p", { class: "grammar-box" }, src),
      h("p", { class: "muted" }, "Leaves are variables; don't count them. Identical subexpressions share one node."),
      numberQuestion(interior, `The DAG computes: ${d.code.filter((c) => c.op !== "=").map(show).join("; ")}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
