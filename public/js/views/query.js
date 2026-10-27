import { CODE, condRels, condText, EXAMPLES, fmtN, nodeLabel, optimise, randomQuery, selectivity } from "../engines/query.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

// The plan as a tree diagram: every node shows its estimated output size.
// Base relations are filled, × products are flagged red, the node a rule just
// changed is outlined.
function planTree(step, q) {
  const lit = new Set(step.lit ?? []);
  const node = (n) => ({
    id: n.id,
    label: `${nodeLabel(n, q)}  ≈${fmtN(step.sizes.get(n.id))}`,
    state: n.op === "rel" ? "matched" : n.op === "cross" ? "error" : "expanded",
    kids: n.kids.map(node),
  });
  return treeDiagram(node(step.tree), { lit: [...lit], gapY: 58, aria: `Query plan: ${describe(step.tree, q)}` });
}

function describe(n, q) {
  return n.kids.length ? `${nodeLabel(n, q)} of (${n.kids.map((k) => describe(k, q)).join(", ")})` : n.rel;
}

const LEGEND = [["Base relation", "var(--accent)"], ["σ, π or ⋈", "var(--muted)"], ["Cartesian product ×", "var(--bad)"], ["Just changed", "var(--series-2)"]];

export function render(root) {
  const p = readParams();
  const state = { query: p.get("q") ?? EXAMPLES.aquarius.query, cat: (p.get("c") ?? EXAMPLES.aquarius.catalogue).replace(/;/g, "\n") };
  let player = null;
  const head = page({
    subject: "Databases", title: "Query processing & optimisation",
    lede: "Turn SQL into a relational algebra tree, then watch the heuristic rules push selections down, turn products into joins, reorder joins and trim attributes, with the estimated size of every intermediate result.",
    theory: h("div", null,
      h("p", null, "A query is first translated into a ", h("b", null, "canonical tree"), ": the Cartesian product of every relation in FROM, one big σ for the WHERE clause, and a π for SELECT. It gives the right answer, but the product can have billions of tuples."),
      h("p", null, h("b", null, "Heuristic optimisation"), " rewrites the tree with rules that never change the result: split the σ into a cascade, push each σ as far down as its attributes allow, put the most restrictive relations first so every step is a join and not a ×, merge σ over × into ⋈, and project away attributes nobody above needs."),
      h("p", null, h("b", null, "Cost estimation"), " uses catalogue statistics: n_r tuples in r and V(A, r), the number of distinct values of A. An equality A = c keeps about n_r / V(A, r) tuples; a range A < v keeps the fraction (v − min) / (max − min); a join on A keeps n_r · n_s / max(V(A, r), V(A, s)).")),
    conventions: [
      "Catalogue lines read NAME n_r: attribute V(A, r) [min..max], … (the range is optional).",
      "Equality selectivity 1 / V; ranges use (v − min) / (max − min), or 1/3 when no range is known; attribute comparisons other than = use 1/3.",
      "Values are assumed uniform and independent. π keeps duplicates, as SQL does without DISTINCT.",
      "Work = tuples produced by every σ, × and ⋈ (projections are pipelined). Ties in join order go to the relation listed first in FROM.",
    ],
  });

  const qIn = h("textarea", { rows: 3, class: "mono", "aria-label": "SQL query", oninput: (e) => { state.query = e.target.value; update(); } }, state.query);
  const cIn = h("textarea", { rows: 4, class: "mono", "aria-label": "Catalogue statistics", oninput: (e) => { state.cat = e.target.value; update(); } }, state.cat);
  const load = (query, cat) => { state.query = query; state.cat = cat; qIn.value = query; cIn.value = cat; update(); };
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ q: state.query, c: state.cat.split("\n").map((l) => l.trim()).filter(Boolean).join(";") });
    let r;
    try { r = optimise(state.query, state.cat); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(CODE, { title: "Heuristic optimisation" }), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap qp-plan" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const counters = h("div", { class: "stats-row" });
    player = stepper({
      count: r.steps.length, label: "Rule", interval: 1700,
      render: (i) => {
        const st = r.steps[i];
        morph(stage, planTree(st, r.q));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : ""}`;
        counters.replaceChildren(stat("Work now", fmtN(st.cost)), stat("Canonical", fmtN(r.canonicalCost)), stat("Optimised", fmtN(r.finalCost)), stat("Result ≈", fmtN(st.sizes.get(st.tree.id))));
      },
    });
    const most = Math.max(r.canonicalCost, 1);
    const bar = (label, v) => h("tr", null, h("th", { scope: "row" }, label), h("td", null, fmtN(v)),
      h("td", { class: "spark" }, h("i", { style: `width:${Math.max(0.5, (Math.log10(v + 1) / Math.log10(most + 1)) * 100)}%` })));
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "From SQL to an optimised plan"), player.el, note,
        traceLayout(h("div", null, stage,
          h("div", { class: "legend-chips" }, LEGEND.map(([t, c]) => h("span", null, h("i", { style: `background:${c}` }), t)))), code, vars),
        counters),
      h("section", { class: "card" }, h("h2", null, "Selectivity of each condition"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse qp-sel" },
          h("thead", null, h("tr", null, ["Condition", "Relations", "Estimate", "Selectivity"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, r.q.conds.map((c) => {
            const s = selectivity(c, r.cat);
            return h("tr", null, h("th", { scope: "row" }, condText(c, r.q)), h("td", null, condRels(c).join(", ")), h("td", { class: "left" }, s.why), h("td", null, `${fmtN(s.sel * 100)}%`));
          })))),
        r.q.conds.length ? null : h("p", { class: "muted small" }, "No WHERE clause, so nothing to filter.")),
      h("section", { class: "card" }, h("h2", null, "How much work did it save?"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
          h("thead", null, h("tr", null, ["Plan", "Intermediate tuples", ""].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, bar("Canonical tree", r.canonicalCost), bar("Heuristically optimised", r.finalCost)))),
        h("p", { class: "muted small" }, "Bars use a logarithmic scale: each tenth of the bar is ten times more tuples. Both plans give exactly the same answer.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => load(ex.query, ex.catalogue)),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const g = randomQuery(); load(g.query, g.catalogue); } }, "Random query"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "SQL query (SELECT … FROM … WHERE … AND …)", qIn),
      h("label", { class: "stack" }, "Catalogue: NAME n_r: attribute V(A, r) [min..max], …", cIn),
      msg),
    out);

  // --- Practice ---------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const kind = Math.floor(r() * 4);
    let body;
    if (kind === 0) {
      const v = pick([4, 5, 10, 20, 25, 50]), n = v * (2 + Math.floor(r() * 40));
      if (r() < 0.5) {
        body = [h("h2", null, "How many tuples does this selection return?"),
          h("p", { class: "grammar-box" }, `σ dept = 'Sales' (EMPLOYEE)\nn_EMPLOYEE = ${n}, V(dept, EMPLOYEE) = ${v}`),
          numberQuestion(n / v, `Equality selectivity is 1 / V = 1 / ${v}, so about ${n} / ${v} = ${n / v} tuples (assuming every department is equally common).`)];
      } else {
        const N = 100 * (1 + Math.floor(r() * 30)), cut = 10 * (1 + Math.floor(r() * 9));
        body = [h("h2", null, "How many tuples does this selection return?"),
          h("p", { class: "grammar-box" }, `σ age < ${cut} (PERSON)\nn_PERSON = ${N}, age ranges from 0 to 100`),
          numberQuestion(N * cut / 100, `The fraction below ${cut} is (${cut} − 0) / (100 − 0) = ${cut}%, so ${N} × ${cut / 100} = ${N * cut / 100} tuples.`)];
      }
    } else if (kind === 1) {
      const vr = pick([10, 20, 50, 100]), vs = pick([10, 20, 50, 100]), big = Math.max(vr, vs);
      const nr = big * (1 + Math.floor(r() * 20)), ns = vs * (1 + Math.floor(r() * 20));
      body = [h("h2", null, "Estimate the size of this join"),
        h("p", { class: "grammar-box" }, `r ⋈_r.A = s.A s\nn_r = ${nr}, V(A, r) = ${vr}\nn_s = ${ns}, V(A, s) = ${vs}`),
        numberQuestion(nr * ns / big, `n_r · n_s / max(V(A, r), V(A, s)) = ${nr} × ${ns} / ${big} = ${nr * ns / big}. Each tuple of the side with fewer distinct values matches n / V tuples of the other.`)];
    } else if (kind === 2) {
      const ex = pick(Object.values(EXAMPLES)), res = optimise(ex.query, ex.catalogue);
      const c = pick(res.q.conds), rels = condRels(c);
      const label = (rs) => (rs.length === 1 ? `Directly on ${rs[0]}` : `On the join of ${[...rs].sort().join(" and ")}`);
      const opts = new Set([label(rels), ...res.q.rels.map((x) => label([x])), ...res.q.conds.filter((d) => condRels(d).length > 1).map((d) => label(condRels(d)))]);
      const step = res.steps.find((s) => s.line?.[1] === 4 && s.vars.c === condText(c, res.q));
      body = [h("h2", null, `Where does σ ${condText(c, res.q)} end up after pushing selections down?`),
        h("p", { class: "grammar-box" }, ex.query),
        choice([...opts].slice(0, 6).map((o) => ({ label: o, correct: o === label(rels) })).sort(() => r() - 0.5), step?.note ?? "")];
    } else {
      const ns = [100, 200, 500, 1000];
      const R = pick(ns), S = pick(ns), T = pick(ns);
      const vb = [pick([10, 50, 100]), pick([10, 50, 100])], vc = [pick([10, 20, 100]), pick([10, 20, 100])];
      const rs = (R * S) / Math.max(...vb), st = (S * T) / Math.max(...vc);
      if (rs === st) return newQuestion();
      const first = rs < st;
      body = [h("h2", null, "Which join order has the smaller intermediate result?"),
        h("p", { class: "grammar-box" }, `R(A, B) ⋈ S(B, C) ⋈ T(C, D)\nn_R = ${R}, n_S = ${S}, n_T = ${T}\nV(B, R) = ${vb[0]}, V(B, S) = ${vb[1]}\nV(C, S) = ${vc[0]}, V(C, T) = ${vc[1]}`),
        choice([{ label: "(R ⋈ S) ⋈ T", correct: first }, { label: "R ⋈ (S ⋈ T)", correct: !first }],
          `R ⋈ S ≈ ${R} × ${S} / ${Math.max(...vb)} = ${fmtN(rs)}; S ⋈ T ≈ ${S} × ${T} / ${Math.max(...vc)} = ${fmtN(st)}. The final result is the same either way, so build the smaller intermediate first.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
