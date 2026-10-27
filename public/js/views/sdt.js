import { SDDS, SDT_CODE, translate } from "../engines/sdt.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";

// The annotated tree, laid out once from the final labels so nothing moves
// or overlaps as values appear: each subtree gets at least the width of its
// widest row, and every node shows its attributes (? until evaluated).
function attrTree(root, values, final, { lit = null } = {}) {
  const CH = 7.4, GAP = 14, ROW = 70;
  const attrText = (n, vals) => n.attrs.filter((a) => a.kind !== "lex").map((a) => `${n.attrs.length > 1 ? `${a.name}=` : ""}${vals[`${n.id}.${a.name}`] ?? "?"}`).join(" ");
  const width = new Map(), boxW = new Map();
  const measure = (n) => {
    const sym = n.label ? (n.sym === "digit" ? n.label : `${n.sym} ${n.label}`) : n.sym;
    const bw = Math.max(34, Math.max([...sym].length, [...attrText(n, final)].length) * CH + 16);
    boxW.set(n.id, bw);
    const kids = n.kids.reduce((s, k) => s + measure(k), 0) + GAP * Math.max(0, n.kids.length - 1);
    width.set(n.id, Math.max(bw, kids));
    return width.get(n.id);
  };
  measure(root);
  const pos = new Map();
  let depthMax = 0;
  const place = (n, x0, d) => {
    depthMax = Math.max(depthMax, d);
    const w = width.get(n.id), kidsW = n.kids.reduce((s, k) => s + width.get(k.id), 0) + GAP * Math.max(0, n.kids.length - 1);
    let x = x0 + (w - kidsW) / 2;
    for (const k of n.kids) { place(k, x, d + 1); x += width.get(k.id) + GAP; }
    pos.set(n.id, { x: n.kids.length ? (pos.get(n.kids[0].id).x + pos.get(n.kids.at(-1).id).x) / 2 : x0 + w / 2, y: 30 + d * ROW });
  };
  place(root, 16, 0);
  const W = width.get(root.id) + 32, H = 60 + depthMax * ROW;
  const edges = [], nodes = [];
  const walk = (n) => {
    const p = pos.get(n.id), hasA = n.attrs.some((a) => a.kind !== "lex"), hh = hasA ? 40 : 26;
    for (const k of n.kids) {
      const c = pos.get(k.id), ch = k.attrs.some((a) => a.kind !== "lex") ? 40 : 26;
      edges.push(h("line", { x1: p.x.toFixed(1), y1: (p.y + hh / 2).toFixed(1), x2: c.x.toFixed(1), y2: (c.y - ch / 2).toFixed(1), class: "t-edge", "data-k": `e:${k.id}`, "data-ends": `${n.id}|${k.id}` }));
      walk(k);
    }
    const known = n.attrs.filter((a) => a.kind !== "lex").every((a) => `${n.id}.${a.name}` in values);
    const state = !n.kids.length ? "matched" : known ? "expanded" : "open";
    const bw = boxW.get(n.id), sym = n.label ? (n.sym === "digit" ? n.label : `${n.sym} ${n.label}`) : n.sym;
    nodes.push(h("g", { class: `t-node ${state}${lit === n.id ? " lit" : ""}`, "data-k": `n:${n.id}`, "data-x": p.x.toFixed(1), "data-y": p.y.toFixed(1) },
      h("rect", { x: (p.x - bw / 2).toFixed(1), y: (p.y - hh / 2).toFixed(1), width: bw.toFixed(1), height: hh, rx: state === "matched" ? 13 : 7 }),
      h("text", { x: p.x.toFixed(1), y: (p.y + (hasA ? -3 : 4.5)).toFixed(1), "text-anchor": "middle" }, sym),
      hasA ? h("text", { x: p.x.toFixed(1), y: (p.y + 13).toFixed(1), "text-anchor": "middle", class: "sdt-val" }, attrText(n, values)) : null));
  };
  walk(root);
  return h("svg", { viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, class: "diagram parse-tree", role: "img", "aria-label": "Annotated parse tree", style: `max-width:${Math.max(W * 1.1, 240).toFixed(0)}px;min-width:${Math.min(W, 560).toFixed(0)}px` }, edges, nodes);
}

function rulesTable(kind, hot) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse sdt-rules" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Production"), h("th", { scope: "col" }, "Semantic rules"))),
    h("tbody", null, SDDS[kind].rules.map(([p, r], i) => h("tr", { class: i === hot ? "hot" : null }, h("th", { scope: "row" }, p), h("td", { class: "left" }, r))))));
}

export function render(root) {
  const p = readParams();
  const state = { kind: SDDS[p.get("sdd")] ? p.get("sdd") : "desk" };
  state.w = p.get("w") ?? SDDS[state.kind].input;
  let player = null;
  const head = page({
    subject: "Compiler design", title: "Syntax-directed translation",
    lede: "Attach attributes to a parse tree and evaluate them in dependency order: values flow up as synthesised attributes and down as inherited ones.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "syntax-directed definition"), " gives every grammar symbol some attributes and every production some semantic rules. A ", h("b", null, "synthesised"), " attribute at a node is computed from its children (values flow up); an ", h("b", null, "inherited"), " attribute is computed from its parent and siblings (values flow down or across)."),
      h("p", null, "The ", h("b", null, "dependency graph"), " has an edge b → a whenever a's rule uses b. Any topological order of it is a valid evaluation order; a cycle would mean no order works."),
      h("p", null, "An ", h("b", null, "S-attributed"), " definition has only synthesised attributes, so one post-order pass (or an LR parser's reductions) evaluates it. An ", h("b", null, "L-attributed"), " one lets inherited attributes depend only on the parent and siblings to the left, so a single left-to-right depth-first pass (or an LL parser) works.")),
    conventions: ["Tree labels show a node's attributes once they are known: T · 15 means T.val = 15; with two attributes both are named.", "Dashed nodes still have attributes to evaluate. Among attributes that are ready, the one a left-to-right depth-first walk reaches first goes next.", "Numbers may have several digits; + and * with the usual precedence, and parentheses."],
  });

  const kindSel = h("select", { "aria-label": "Definition", onchange: (e) => { state.kind = e.target.value; state.w = SDDS[state.kind].input; wIn.value = state.w; update(); } },
    Object.entries(SDDS).map(([k, v]) => h("option", { value: k, selected: k === state.kind }, v.name)));
  const wIn = h("input", { type: "text", class: "mono wide", value: state.w, "aria-label": "Input", oninput: (e) => { state.w = e.target.value; update(); } });
  const about = h("p", { class: "muted small" });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ sdd: state.kind, w: state.w });
    about.textContent = SDDS[state.kind].about;
    let r;
    try { r = translate(state.kind, state.w); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const treeBox = h("div", { class: "chart-wrap" }), rules = h("div"), orderBox = h("ol", { class: "sdt-order" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(SDT_CODE), vars = varsPanel();
    player = stepper({
      count: r.steps.length, label: "Step", interval: 1000,
      render: (i) => {
        const st = r.steps[i];
        morph(treeBox, attrTree(r.root, st.values, r.steps.at(-1).values, { lit: st.node }));
        rules.replaceChildren(rulesTable(state.kind, st.rule));
        const n = r.steps.slice(1, i + 1).filter((s) => s.attr).length;
        orderBox.replaceChildren(...r.order.map((a, k) => h("li", { class: [k < n ? "done" : "todo", k === n - 1 && "now", a.kind].filter(Boolean).join(" ") }, `${a.sym}.${a.name}`, h("b", null, k < n ? String(a.value) : "?"))));
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : st.kind === "inh" ? " warn" : ""}`;
      },
    });
    const inh = r.order.filter((a) => a.kind === "inh").length;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Annotated parse tree"), player.el, note,
        traceLayout(h("div", null, treeBox, h("h3", { class: "small muted sdt-gap" }, "Evaluation order (amber = inherited, blue = synthesised)"), orderBox), code, vars),
        h("div", { class: "stats-row" }, stat("Attributes", r.order.length), stat("Synthesised", r.order.length - inh), stat("Inherited", inh), stat("Result", typeof r.result === "object" ? Object.values(r.result)[0] : r.result))),
      h("section", { class: "card" }, h("h2", null, "The definition"), rules,
        h("p", { class: "muted small" }, inh ? "This definition is L-attributed: inherited attributes use only the parent and siblings to their left, so one depth-first pass evaluates them." : "This definition is S-attributed: everything is synthesised, so the values can be computed during bottom-up parsing."),
        h("p", null, h("a", { href: "/three-address-code" }, "Translation to three-address code →"), " · ", h("a", { href: "/ll1-parsing" }, "LL(1) parsing →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, kindSel, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      about,
      h("label", { class: "stack" }, "Input", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    const d = () => String(1 + Math.floor(r() * 9));
    let body;
    if (kind < 0.4) {
      const src = [`${d()} * ${d()} + ${d()}`, `${d()} + ${d()} * ${d()}`, `(${d()} + ${d()}) * ${d()}`, `${d()} * (${d()} + ${d()})`][Math.floor(r() * 4)];
      const res = translate("desk", src);
      body = [h("h2", null, "What is L.val at the root of the annotated parse tree?"), h("p", { class: "grammar-box" }, `${src} n`), rulesTable("desk", null),
        numberQuestion(res.result, `Bottom-up: ${res.order.filter((a) => a.sym === "T" || a.sym === "E").map((a) => `${a.sym}.val = ${a.value}`).join(", ")}.`)];
    } else if (kind < 0.7) {
      const pickKind = r() < 0.5 ? "ll" : "decl";
      const res = translate(pickKind, SDDS[pickKind].input);
      const a = res.order[Math.floor(r() * res.order.length)];
      body = [h("h2", null, `In this definition, is ${a.sym}.${a.name} synthesised or inherited?`), rulesTable(pickKind, null),
        choice([{ label: "Synthesised", correct: a.kind === "syn" }, { label: "Inherited", correct: a.kind === "inh" }],
          a.kind === "syn" ? `${a.sym}.${a.name} is defined in a rule of a production with ${a.sym} on the left, from its children: synthesised.` : `${a.sym}.${a.name} is defined in a rule of a production where ${a.sym} is on the right, from its parent or siblings: inherited.`)];
    } else {
      const src = `${d()} * ${d()} + ${d()}`;
      const res = translate("ll", src);
      let i = 0, j = 0;
      while (i === j || res.order[i].sym === res.order[j].sym && res.order[i].name === res.order[j].name) { i = Math.floor(r() * res.order.length); j = Math.floor(r() * res.order.length); }
      const [x, y] = [res.order[i], res.order[j]];
      const lab = (a) => `${a.sym}.${a.name} = ${a.value}`;
      body = [h("h2", null, "Which of these is evaluated first?"), h("p", { class: "grammar-box" }, src), rulesTable("ll", null),
        choice([{ label: lab(x), correct: i < j }, { label: lab(y), correct: j < i }], `The full order is ${res.order.map(lab).join(", ")}. An attribute can only be computed after everything its rule uses.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
