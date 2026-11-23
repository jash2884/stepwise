import {
  EQUIV_CODE, EXAMPLES, FOL_CODE, INFER_CODE, NORMAL_CODE, RULES, TABLE_CODE, assignments, equivalence, evaluate, evaluateFol,
  inference, negateFol, normalForms, parse, parseDomain, randomFormula, show, truthTable, variables,
} from "../engines/logic.js";
import { h, notice, page, readParams, writeParams } from "../ui.js";
import { choice, exampleSelect, numberQuestion, stat } from "./kit.js";
import { linkButton, reveal, select, shell, table, tf, traceCard } from "./dm-kit.js";

const MODES = {
  table: "Truth table",
  equiv: "Are two formulas equivalent?",
  normal: "CNF and DNF",
  infer: "Rules of inference",
  fol: "Quantifiers over a finite domain",
};
const FOL_EXAMPLES = {
  succ: { name: "Every x has a bigger y", f: "∀x ∃y (x < y)", dom: "1 2 3 4" },
  swap: { name: "Swap the quantifiers", f: "∃y ∀x (x ≤ y)", dom: "1 2 3 4" },
  even: { name: "Some even number above 2", f: "∃x (even(x) ∧ x > 2)", dom: "1 2 3 4 5" },
  primes: { name: "Every prime is odd?", f: "∀x (prime(x) → odd(x))", dom: "1..8" },
  divides: { name: "1 divides everything", f: "∃x ∀y divides(x, y)", dom: "1..6" },
  negation: { name: "Negated universal", f: "¬∀x (x mod 2 = 0)", dom: "1 2 3 4" },
};
const INFER_EXAMPLES = {
  mp: { name: "Modus ponens", p: "p → q; p", c: "q" },
  mt: { name: "Modus tollens", p: "p → q; ¬q", c: "¬p" },
  hs: { name: "Hypothetical syllogism", p: "p → q; q → r", c: "p → r" },
  ds: { name: "Disjunctive syllogism", p: "p ∨ q; ¬p", c: "q" },
  res: { name: "Resolution", p: "p ∨ q; ¬p ∨ r", c: "q ∨ r" },
  ac: { name: "Affirming the consequent (invalid)", p: "p → q; q", c: "p" },
  cd: { name: "Constructive dilemma", p: "p → q; r → s; p ∨ r", c: "q ∨ s" },
};

// A truth table; cols = [{ label, values }], shown = how many columns are filled.
function ttable(rows, cols, { shown = cols.length, hot = -1, hotRow = -1, rowCls = () => null, colCls = () => null } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse dm-tt" },
    h("thead", null, h("tr", null, cols.map((c, i) => h("th", { scope: "col", class: [i === hot && "hot", i >= shown && "future", colCls(i)].filter(Boolean).join(" ") || null }, c.label)))),
    h("tbody", null, rows.map((_, r) => h("tr", { class: [r === hotRow && "hot", rowCls(r)].filter(Boolean).join(" ") || null },
      cols.map((c, i) => h("td", { class: [i >= shown ? "future" : c.values[r] ? "t" : "f", i === hot && "hotcol", colCls(i)].filter(Boolean).join(" ") }, i >= shown ? "" : tf(c.values[r]))))))));
}

function tableMode(f) {
  const t = truthTable(f);
  const nf = normalForms(f);
  const card = traceCard({
    title: `Truth table of ${show(f)}`, steps: t.steps, code: TABLE_CODE, interval: 1100,
    draw: (st) => ttable(t.rows, t.cols, { shown: st.shown, hot: st.hot ?? -1, colCls: (i) => (st.done && i === t.cols.length - 1 ? "final" : null) }),
  });
  const ts = t.final.filter(Boolean).length;
  const summary = h("section", { class: "card" }, h("h2", null, "What the table tells you"),
    h("div", { class: "stats-row" }, stat("Rows", t.rows.length), stat("True rows", ts), stat("False rows", t.rows.length - ts), stat("Kind", t.kind)),
    h("p", null, "Canonical DNF (one minterm per T row): ", h("code", { class: "dm-formula" }, nf.canonical.dnfText)),
    h("p", null, "Canonical CNF (one maxterm per F row): ", h("code", { class: "dm-formula" }, nf.canonical.cnfText)),
    h("p", { class: "muted small" }, t.kind === "tautology" ? "No F rows, so the canonical CNF is empty (T)." : t.kind === "contradiction" ? "No T rows, so the canonical DNF is empty (F)." : "Satisfiable (some T row) and falsifiable (some F row)."));
  return { els: [card.el, summary], destroy: card.destroy };
}

function equivMode(f, g) {
  const e = equivalence(f, g);
  const cols = [...e.vars.map((v) => ({ label: v, values: e.rows.map((r) => r[v]) })), { label: `F: ${show(f)}`, values: e.f }, { label: `G: ${show(g)}`, values: e.g }];
  const card = traceCard({
    title: "Row by row", steps: e.steps, code: EQUIV_CODE,
    draw: (st) => ttable(e.rows, cols, { hotRow: st.row, rowCls: (r) => (r < st.row || st.row >= e.rows.length ? (e.f[r] === e.g[r] ? "agree" : "differ") : r === st.row && e.f[r] !== e.g[r] ? "differ" : null) }),
  });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, e.equivalent ? "Equivalent" : "Not equivalent"),
    notice(e.equivalent ? "good" : "bad", e.equivalent ? `${show(f)} ≡ ${show(g)}: they have the same truth table, so ${show(f)} ↔ ${show(g)} is a tautology.` : `They differ when ${Object.entries(e.counter.env).map(([k, v]) => `${k} = ${tf(v)}`).join(", ")}: F is ${tf(evaluate(f, e.counter.env))} but G is ${tf(evaluate(g, e.counter.env))}.`))], destroy: card.destroy };
}

function clauseChips(text, outer) {
  if (text === "T" || text === "F") return h("div", { class: "dm-clauses" }, h("span", { class: "dm-chip" }, text));
  const parts = text.split(outer === "and" ? " ∧ " : " ∨ ");
  return h("div", { class: "dm-clauses" }, parts.map((p, i) => [i ? h("b", { class: "dm-join" }, outer === "and" ? "∧" : "∨") : null, h("span", { class: "dm-chip" }, p.replace(/^\(|\)$/g, ""))]));
}

function normalMode(f) {
  const nf = normalForms(f);
  const cnfOk = equivalence(f, nf.cnfFormula).equivalent, dnfOk = equivalence(f, nf.dnfFormula).equivalent;
  const card = traceCard({
    title: `Rewriting ${show(f)}`, steps: nf.steps, code: NORMAL_CODE, interval: 1300,
    draw: (st) => h("div", { class: "dm-rewrite" }, h("code", { class: "dm-formula big" }, st.form)),
    side: (st, i) => (i >= nf.steps.length - 4 ? clauseChips(st.form, /CNF/.test(st.note) ? "and" : "or") : null),
  });
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Results"),
    h("p", null, h("b", null, "CNF: "), h("code", { class: "dm-formula" }, nf.cnfText), " ", h("span", { class: cnfOk ? "dm-ok" : "dm-bad" }, cnfOk ? "✓ same truth table" : "✗")),
    h("p", null, h("b", null, "DNF: "), h("code", { class: "dm-formula" }, nf.dnfText), " ", h("span", { class: dnfOk ? "dm-ok" : "dm-bad" }, dnfOk ? "✓ same truth table" : "✗")),
    h("p", null, h("b", null, "Canonical (full) DNF: "), h("code", { class: "dm-formula" }, nf.canonical.dnfText)),
    h("p", null, h("b", null, "Canonical (full) CNF: "), h("code", { class: "dm-formula" }, nf.canonical.cnfText)),
    h("p", { class: "muted small" }, "Rewriting gives a CNF or DNF, not a unique one. The canonical forms (every variable in every clause) are unique and come straight from the truth table."))], destroy: card.destroy };
}

function inferMode(premises, conclusion) {
  const res = inference(premises, conclusion);
  const cols = [...res.vars.map((v) => ({ label: v, values: res.rows.map((r) => r[v]) })), ...premises.map((p, i) => ({ label: `P${i + 1}: ${show(p)}`, values: res.table.map((t) => t.p[i]) })), { label: `C: ${show(conclusion)}`, values: res.table.map((t) => t.c) }];
  const critical = (r) => res.table[r].p.every(Boolean);
  const card = traceCard({
    title: "Check every row", steps: res.steps, code: INFER_CODE,
    draw: (st) => ttable(res.rows, cols, { hotRow: st.row, rowCls: (r) => (r <= st.row || st.row >= res.rows.length ? (critical(r) ? (res.table[r].c ? "agree" : "differ") : "dim") : null) }),
  });
  const verdict = h("section", { class: "card" }, h("h2", null, res.valid ? "Valid argument" : "Invalid argument"),
    notice(res.valid ? "good" : "bad", res.valid ? `The conclusion follows.${res.rule && !res.rule.fallacy ? ` This is ${res.rule.name.toLowerCase()}.` : ""}` : `Counterexample: ${Object.entries(res.counter.env).map(([k, v]) => `${k} = ${tf(v)}`).join(", ")} makes every premise true and the conclusion false.${res.rule?.fallacy ? ` This is the fallacy of ${res.rule.name.replace(" (a fallacy)", "").toLowerCase()}.` : ""}`),
    h("h3", null, "Rules of inference"),
    table(["Rule", "Premises", "Conclusion"], RULES.map((r) => [r.name, r.premises.join(";  "), r.conclusion]), { rowCls: (i) => (res.rule && RULES[i].id === res.rule.id ? "hot" : null) }),
    h("p", { class: "muted small" }, "A, B, C and D stand for any formulas. The last two rows look like rules but are invalid."));
  return { els: [card.el, verdict], destroy: card.destroy };
}

function folMode(f, domain) {
  const res = evaluateFol(f, domain);
  const card = traceCard({
    title: `Evaluating ${show(f)} over {${domain.join(", ")}}`, steps: res.steps, code: FOL_CODE, interval: 800,
    draw: (_, i) => h("ol", { class: "dm-fol" }, res.steps.slice(0, i + 1).map((s, k) => h("li", { class: [k === i && "hot", s.value ? "t" : "f", s.done && "done"].filter(Boolean).join(" "), style: `--depth:${s.depth}` },
      h("span", { class: "dm-env" }, Object.entries(s.env).map(([a, b]) => `${a}=${b}`).join(" ") || "·"), h("code", null, s.sub), h("b", null, tf(s.value))))),
  });
  const neg = negateFol(f);
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, res.value ? "True" : "False"),
    notice(res.value ? "good" : "bad", `${show(f)} is ${res.value ? "true" : "false"} over {${domain.join(", ")}}.`),
    h("p", null, "Its negation, with ¬ pushed inwards (¬∀x P ≡ ∃x ¬P, ¬∃x P ≡ ∀x ¬P): ", h("code", { class: "dm-formula" }, show(neg)), ` is ${evaluateFol(neg, domain).value ? "true" : "false"}.`),
    res.truncated ? h("p", { class: "muted small" }, "Only the first 400 steps are shown.") : null)], destroy: card.destroy };
}

// --- Practice ------------------------------------------------------------------------
function question(r) {
  const kind = ["classify", "count", "equiv", "argument", "fol"][Math.floor(r() * 5)];
  if (kind === "classify" || kind === "count") {
    let f, t;
    for (let i = 0; i < 30; i++) {
      f = randomFormula(r, ["p", "q", "r"].slice(0, 2 + Math.floor(r() * 2)), 3);
      t = truthTable(f);
      if (kind === "count" || i > 20 || t.kind !== "contingency" || r() < 0.4) break;
    }
    const solution = () => ttable(t.rows, t.cols);
    if (kind === "count") {
      const n = t.final.filter(Boolean).length;
      return [h("h2", null, "How many rows make it true?"), h("p", null, h("code", { class: "dm-formula big" }, show(f))), numberQuestion(n, `${n} of the ${t.rows.length} rows are T.`), reveal("Show the truth table", solution)];
    }
    return [h("h2", null, "Tautology, contradiction or contingency?"), h("p", null, h("code", { class: "dm-formula big" }, show(f))),
      choice(["tautology", "contradiction", "contingency"].map((k) => ({ label: k, correct: k === t.kind })), `Its last column has ${t.final.filter(Boolean).length} T out of ${t.rows.length}.`), reveal("Show the truth table", solution)];
  }
  if (kind === "equiv") {
    const pairs = [["p → q", "¬q → ¬p", true], ["p → q", "q → p", false], ["p → q", "¬p ∨ q", true], ["¬(p ∧ q)", "¬p ∨ ¬q", true], ["¬(p ∨ q)", "¬p ∨ ¬q", false], ["p → (q → r)", "(p ∧ q) → r", true], ["p → (q → r)", "(p → q) → r", false],
      ["p ↔ q", "(p → q) ∧ (q → p)", true], ["p ⊕ q", "¬(p ↔ q)", true], ["p ∨ (q ∧ r)", "(p ∨ q) ∧ r", false], ["(p → r) ∧ (q → r)", "(p ∨ q) → r", true], ["(p → q) ∧ (p → r)", "p → (q ∧ r)", true], ["(p → r) ∨ (q → r)", "(p ∨ q) → r", false]];
    const [a, b] = pairs[Math.floor(r() * pairs.length)];
    const e = equivalence(parse(a), parse(b));
    return [h("h2", null, "Are these logically equivalent?"), h("p", null, h("code", { class: "dm-formula big" }, a), "  and  ", h("code", { class: "dm-formula big" }, b)),
      choice([{ label: "Equivalent", correct: e.equivalent }, { label: "Not equivalent", correct: !e.equivalent }], e.equivalent ? "They agree on every row." : `They differ at ${Object.entries(e.counter.env).map(([k, v]) => `${k} = ${tf(v)}`).join(", ")}.`)];
  }
  if (kind === "argument") {
    const ex = Object.values(INFER_EXAMPLES)[Math.floor(r() * Object.keys(INFER_EXAMPLES).length)];
    const extra = [{ p: "p → q; ¬p", c: "¬q" }, { p: "p ∨ q; p", c: "¬q" }, { p: "p → q; q → r; ¬r", c: "¬p" }][Math.floor(r() * 3)];
    const pick = r() < 0.6 ? ex : extra;
    const res = inference(pick.p.split(";").map((s) => parse(s)), parse(pick.c));
    return [h("h2", null, "Is this argument valid?"), h("ul", { class: "dm-premises" }, pick.p.split(";").map((s) => h("li", null, h("code", null, s.trim()))), h("li", { class: "concl" }, "∴ ", h("code", null, pick.c))),
      choice([{ label: "Valid", correct: res.valid }, { label: "Invalid", correct: !res.valid }], res.valid ? `In every row where all premises are true, the conclusion is too${res.rule ? ` (${res.rule.name.toLowerCase()})` : ""}.` : `Counterexample: ${Object.entries(res.counter.env).map(([k, v]) => `${k} = ${tf(v)}`).join(", ")}.`)];
  }
  const ex = Object.values(FOL_EXAMPLES)[Math.floor(r() * Object.keys(FOL_EXAMPLES).length)];
  const dom = parseDomain(ex.dom), fo = parse(ex.f, { mode: "fol" }), v = evaluateFol(fo, dom).value;
  return [h("h2", null, "True or false over this domain?"), h("p", null, h("code", { class: "dm-formula big" }, ex.f), ` over {${dom.join(", ")}}`),
    choice([{ label: "True", correct: v }, { label: "False", correct: !v }], `It's ${v ? "true" : "false"}. Open the quantifier mode to watch it evaluated.`)];
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: MODES[p.get("mode")] ? p.get("mode") : "table",
    f: p.get("f") ?? EXAMPLES.mp.f,
    g: p.get("g") ?? "¬q → ¬p",
    premises: p.get("p") ?? INFER_EXAMPLES.mp.p,
    conclusion: p.get("c") ?? INFER_EXAMPLES.mp.c,
    dom: p.get("dom") ?? FOL_EXAMPLES.succ.dom,
  };
  if (state.mode === "fol" && !p.get("f")) state.f = FOL_EXAMPLES.succ.f;
  if (state.mode === "equiv" && !p.get("f")) state.f = "p → q";
  const head = page({
    subject: "Discrete maths", title: "Propositional logic",
    lede: "Type a formula and watch its truth table fill in one column at a time. Then test equivalences, rewrite to CNF and DNF, check arguments and evaluate quantifiers.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "proposition"), " is true (T) or false (F). Connectives build bigger formulas: ¬ (not), ∧ (and), ∨ (or), ⊕ (exclusive or), → (implies) and ↔ (if and only if). ", h("b", null, "p → q"), " is false only when p is true and q is false."),
      h("p", null, "With n variables a truth table has 2ⁿ rows. A formula true in every row is a ", h("b", null, "tautology"), ", false in every row a ", h("b", null, "contradiction"), ", and otherwise a ", h("b", null, "contingency"), ". Two formulas are ", h("b", null, "equivalent"), " (≡) when their columns match, that is when F ↔ G is a tautology."),
      h("p", null, h("b", null, "CNF"), " is an AND of clauses, each an OR of literals; ", h("b", null, "DNF"), " is an OR of terms, each an AND of literals. Every formula has both. An ", h("b", null, "argument"), " is valid when the conclusion is true in every row where all the premises are true."),
      h("p", null, "In first-order logic, ", h("b", null, "∀x P(x)"), " says P holds for every x in the domain and ", h("b", null, "∃x P(x)"), " that it holds for at least one. Order matters: ∀x ∃y (x < y) and ∃y ∀x (x < y) say different things.")),
    conventions: [
      "Precedence, tightest first: ¬, ∧, ∨, ⊕, →, ↔. p → q → r means p → (q → r).",
      "You can type ~ ! for ¬, & ^ for ∧, | for ∨, -> for →, <-> for ↔, and T, F for the constants.",
      "Truth tables run from all T down to all F, with the first variable changing slowest.",
      "A quantifier covers only what follows it directly: ∀x P(x) ∧ Q means (∀x P(x)) ∧ Q. Use brackets for more.",
      "First-order formulas use numbers from the domain with <, ≤, =, ≠, +, −, ×, mod and the predicates even, odd, prime and divides(x, y).",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  let destroy = null;
  const set = (k) => (v) => { state[k] = v; update(); };
  const field = (label, key, placeholder) => h("label", { class: "stack" }, label, h("input", { type: "text", class: "mono wide", value: state[key], placeholder, spellcheck: "false", "aria-label": label, oninput: (e) => { state[key] = e.target.value; update(); } }));
  const symbols = h("div", { class: "row dm-keys" }, ["¬", "∧", "∨", "→", "↔", "⊕", "∀", "∃", "(", ")"].map((s) => h("button", { type: "button", class: "btn ghost small", onmousedown: (e) => e.preventDefault(), onclick: () => {
    const el = document.activeElement?.tagName === "INPUT" && inputs.contains(document.activeElement) ? document.activeElement : inputs.querySelector("input");
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    el.value = el.value.slice(0, a) + s + el.value.slice(b);
    el.setSelectionRange(a + s.length, a + s.length);
    el.dispatchEvent(new Event("input"));
  } }, s)));

  function drawInputs() {
    const ex = state.mode === "infer" ? exampleSelect(INFER_EXAMPLES, (x) => { state.premises = x.p; state.conclusion = x.c; drawInputs(); update(); })
      : state.mode === "fol" ? exampleSelect(FOL_EXAMPLES, (x) => { state.f = x.f; state.dom = x.dom; drawInputs(); update(); })
        : exampleSelect(EXAMPLES, (x) => { state.f = x.f; drawInputs(); update(); });
    const fields = state.mode === "infer" ? [field("Premises, separated by ;", "premises", "p → q; p"), field("Conclusion", "conclusion", "q")]
      : state.mode === "fol" ? [field("Formula", "f", "∀x ∃y (x < y)"), field("Domain (numbers, or a range like 1..5)", "dom", "1 2 3 4")]
        : state.mode === "equiv" ? [field("F", "f", "p → q"), field("G", "g", "¬q → ¬p")]
          : [field("Formula", "f", "(p → q) ∧ p → q")];
    inputs.replaceChildren(h("div", { class: "row" }, select(MODES, state.mode, (v) => {
      state.mode = v;
      if (v === "fol" && !/∀|∃|forall|exists/i.test(state.f)) { state.f = FOL_EXAMPLES.succ.f; state.dom = FOL_EXAMPLES.succ.dom; }
      if (v !== "fol" && /∀|∃|forall|exists/i.test(state.f)) state.f = EXAMPLES.mp.f;
      drawInputs(); update();
    }, "Mode"), ex, linkButton()), ...fields, symbols);
  }

  function update() {
    destroy?.(); destroy = null;
    const params = { mode: state.mode };
    if (state.mode === "infer") Object.assign(params, { p: state.premises, c: state.conclusion });
    else params.f = state.f;
    if (state.mode === "equiv") params.g = state.g;
    if (state.mode === "fol") params.dom = state.dom;
    writeParams(params);
    try {
      let res;
      if (state.mode === "table") res = tableMode(guard(parse(state.f)));
      else if (state.mode === "equiv") res = equivMode(guard(parse(state.f)), guard(parse(state.g)));
      else if (state.mode === "normal") res = normalMode(guard(parse(state.f), 5));
      else if (state.mode === "infer") {
        const ps = state.premises.split(";").map((s) => s.trim()).filter(Boolean).map((s) => parse(s));
        if (!ps.length) throw new Error("Add at least one premise.");
        const c = parse(state.conclusion);
        guard({ type: "bin", op: "and", a: ps.reduce((a, b) => ({ type: "bin", op: "and", a, b })), b: c });
        res = inferMode(ps, c);
      } else res = folMode(parse(state.f, { mode: "fol" }), parseDomain(state.dom));
      msg.replaceChildren();
      out.replaceChildren(...res.els);
      destroy = res.destroy;
    } catch (e) {
      msg.replaceChildren(notice("error", e.message));
      out.replaceChildren();
    }
  }
  const guard = (f, max = 6) => {
    const n = variables(f).length;
    if (n > max) throw new Error(`Use at most ${max} variables here (this has ${n}): the table would have ${2 ** n} rows.`);
    if (n && assignments(variables(f)).length > 64) throw new Error("Too many rows.");
    return f;
  };

  drawInputs();
  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);
  shell(root, head, visual, question);
  update();
  return () => destroy?.();
}
