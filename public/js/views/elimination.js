import { parseAutomaton, regexToNfa, subsetConstruction, toText } from "../engines/automata.js";
import { agree, allStrings, alt, cat, ELIMINATION_CODE, eliminate, EXAMPLES, PRODUCT_CODE, PRODUCT_EXAMPLES, PRODUCT_OPS, product, star, str } from "../engines/elimination.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, randomDfaText, stat } from "./kit.js";

// Long labels are cut short on the diagram; the table shows them in full.
const cut = (s) => ([...s].length > 24 ? `${[...s].slice(0, 22).join("")}…` : s);
const parseOrder = (text) => text.split(/[\s,]+/).filter(Boolean);

function elimDiagram(st, res) {
  const classes = { [res.start]: "elim-new", [res.final]: "elim-new" };
  if (st.focus && st.states.includes(st.focus)) classes[st.focus] = "elim-going";
  return stateDiagram({
    states: st.states.map((id) => ({ id })), edges: st.edges.map((e) => ({ ...e, label: cut(e.label) })),
    start: res.start, accept: [res.final], active: st.changed ? [...new Set([st.changed.from, st.changed.to])] : [], lit: st.lit, classes,
    aria: `Generalised automaton with states ${st.states.join(", ")}.`,
  });
}

function edgeTable(st) {
  const ch = st.changed;
  return h("div", { class: "table-wrap" }, h("table", { class: "parse elim-table" },
    h("thead", null, h("tr", null, ["From", "To", "Regular expression"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, st.edges.length ? st.edges.map((e) => h("tr", { class: ch && ch.from === e.from && ch.to === e.to ? "hot" : st.focus && (e.from === st.focus || e.to === st.focus) ? "elim-via" : null },
      h("td", null, e.from), h("td", null, e.to), h("td", { class: "elim-re" }, e.label))) : h("tr", null, h("td", { colspan: 3, class: "muted" }, "No edges")))));
}

export function render(root) {
  const p = readParams();
  const state = {
    fa: p.get("fa") ?? EXAMPLES.sipser74.text, order: p.get("order") ?? "",
    b: p.get("b") ?? PRODUCT_EXAMPLES.evenOdd.b, op: PRODUCT_OPS[p.get("op")] ? p.get("op") : "intersection",
  };
  let players = [];
  const head = page({
    subject: "Theory of computation", title: "DFA to regular expression",
    lede: "State elimination: rip states out of the automaton one at a time, rerouting every path through them as a regular-expression edge, until one edge is left.",
    theory: h("div", null,
      h("p", null, "First make a ", h("b", null, "generalised NFA"), ": add a new start s with an ε-edge to the old start, and a new accepting state f with ε-edges from every old accepting state. Edges may now carry whole regular expressions."),
      h("p", null, "To eliminate a state k, look at every pair of an edge i → k (label R", h("sub", null, "ik"), ") and an edge k → j (label R", h("sub", null, "kj"), "). Going from i to j through k reads R", h("sub", null, "ik"), ", then k's self-loop any number of times, then R", h("sub", null, "kj"), ". So the edge i → j becomes R", h("sub", null, "ij"), " | R", h("sub", null, "ik"), " R", h("sub", null, "kk"), "* R", h("sub", null, "kj"), ". Then delete k."),
      h("p", null, "When only s and f are left, the label on s → f is the answer. Different elimination orders give different-looking (but equivalent) expressions; eliminating states with few edges first usually keeps it shorter."),
      h("p", null, "The ", h("b", null, "product construction"), " runs two DFAs in step: its states are pairs (p, q). Choosing which pairs accept gives union, intersection or difference, which proves regular languages are closed under all three.")),
    conventions: [
      "Regular expressions use | for union, * for zero or more, + for one or more, ? for optional, and ε for the empty string (the syntax of the Regex to NFA tool). ∅ means the empty language.",
      "Labels are simplified as they're built: ∅ and ε vanish from concatenations, X X* becomes X+, and ε | X becomes X?.",
      "Default order: the states as listed. Long labels are shortened on the diagram; the table shows them in full.",
      "In the product, a missing move sends that DFA to a dead state ∅. Pair (p, q) is written p·q.",
    ],
  });

  const faIn = h("textarea", { rows: 8, class: "mono", "aria-label": "Automaton", oninput: (e) => { state.fa = e.target.value; update(); } }, state.fa);
  const orderIn = h("input", { type: "text", class: "mono wide", value: state.order, placeholder: "as listed", "aria-label": "Elimination order", oninput: (e) => { state.order = e.target.value; update(); } });
  const bIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Second DFA", oninput: (e) => { state.b = e.target.value; update(); } }, state.b);
  const opSel = h("select", { "aria-label": "Operation", onchange: (e) => { state.op = e.target.value; update(); } }, Object.entries(PRODUCT_OPS).map(([k, o]) => h("option", { value: k, selected: k === state.op }, o.name)));
  const msg = h("div"), out = h("div", { class: "output" });
  const setOrder = (v) => { state.order = v; orderIn.value = v; update(); };

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ fa: state.fa, ...(state.order.trim() ? { order: state.order.trim() } : {}), b: state.b, op: state.op });
    let fa, res;
    try {
      fa = parseAutomaton(state.fa);
      const order = parseOrder(state.order);
      res = eliminate(fa, { order: order.length ? order : null });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();

    // 1. State elimination.
    const code = codePanel(ELIMINATION_CODE), vars = varsPanel();
    const box = h("div", { class: "chart-wrap" }), table = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const p1 = stepper({
      count: res.steps.length, label: "Step", interval: 1300,
      render: (i) => {
        const st = res.steps[i];
        morph(box, elimDiagram(st, res));
        table.replaceChildren(edgeTable(st));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? (res.empty ? " bad" : " good") : ""}`;
      },
    });
    players.push(p1);

    // Check the answer: the regex's ε-NFA against the automaton on every short string.
    let check;
    if (res.empty) check = notice("info", "The language is empty, so there's no regular expression to test (∅ isn't written in this syntax).");
    else {
      try {
        const n = fa.alphabet.length > 2 ? 5 : 7, count = allStrings(fa.alphabet, n).length, a = agree(fa, regexToNfa(res.regex).nfa, n);
        check = a.ok ? notice("good", `Checked: the expression and the automaton agree on all ${count} strings of length up to ${n}.`)
          : notice("bad", `Mismatch on "${a.w}" (automaton ${a.fa ? "accepts" : "rejects"}, expression ${a.other ? "accepts" : "rejects"}).`);
      } catch (e) { check = notice("info", `The expression is too long to check here (${e.message})`); }
    }
    // The same automaton under three orders.
    const orders = [["As listed", null], ["Greedy", "greedy"], ["Reversed", [...fa.states].reverse()]].map(([label, o]) => {
      const r = eliminate(fa, { order: o });
      return { label, r };
    });
    const best = Math.min(...orders.map((o) => o.r.regex.length));

    // 2. Product construction.
    let productCard;
    try {
      const A = fa.kind === "DFA" ? fa : subsetConstruction(fa, { includeDead: false }).dfa;
      let B = parseAutomaton(state.b);
      if (B.kind !== "DFA") B = subsetConstruction(B, { includeDead: false }).dfa;
      const pr = product(A, B, state.op);
      const code2 = codePanel(PRODUCT_CODE), vars2 = varsPanel();
      const box2 = h("div", { class: "chart-wrap" }), note2 = h("p", { class: "step-note", "aria-live": "polite" });
      const p2 = stepper({
        count: pr.steps.length, label: "Step", interval: 900,
        render: (i) => {
          const st = pr.steps[i];
          morph(box2, stateDiagram({ states: st.states.map((id) => ({ id })), edges: st.edges, start: pr.dfa.start, accept: pr.dfa.accept.filter((q) => st.states.includes(q)), active: [st.cur], lit: st.lit, tokens: true, aria: `Product automaton so far: ${st.states.join(", ")}` }));
          code2.show(st.line);
          vars2.show(st.vars);
          note2.textContent = st.note;
          note2.className = `step-note${st.done ? " good" : ""}`;
        },
      });
      players.push(p2);
      productCard = h("section", { class: "card" }, h("h2", null, `Product construction: ${PRODUCT_OPS[state.op].name}`),
        h("p", { class: "muted small" }, `A is the automaton above${fa.kind === "DFA" ? "" : " (converted to a DFA)"}; B is below. Edit either, or load a pair.`),
        h("div", { class: "row" }, exampleSelect(PRODUCT_EXAMPLES, (ex) => { state.fa = ex.a; state.b = ex.b; state.order = ""; faIn.value = ex.a; bIn.value = ex.b; orderIn.value = ""; update(); }, "Load a pair…"), opSel),
        h("label", { class: "stack" }, "DFA B", bIn),
        p2.el, note2, traceLayout(box2, code2, vars2),
        h("div", { class: "stats-row" }, stat("States in A", A.states.length), stat("States in B", B.states.length), stat("Reachable pairs", pr.dfa.states.length), stat("Accepting", pr.dfa.accept.length)),
        h("p", null, h("a", { href: `/finite-automata?fa=${encodeURIComponent(toText(pr.dfa))}` }, "Run the product DFA →"), " · ", h("a", { href: `/dfa-minimization?fa=${encodeURIComponent(toText(pr.dfa))}` }, "Minimise it →")));
    } catch (e) {
      productCard = h("section", { class: "card" }, h("h2", null, "Product construction"), h("label", { class: "stack" }, "DFA B", bIn), notice("error", e.message));
    }

    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "State elimination"), p1.el, note,
        traceLayout(h("div", null, box, h("h3", { class: "small muted elim-sub" }, "Edges now"), table), code, vars),
        h("div", { class: "stats-row" }, stat("States", fa.states.length), stat("Steps", res.steps.length), stat("Order", res.order.join(" "), true), stat("Length", res.regex.length))),
      h("section", { class: "card" }, h("h2", null, "Result"),
        h("p", { class: "big-answer elim-regex" }, res.empty ? h("b", null, "∅ (empty language)") : h("b", null, res.regex)),
        check,
        res.empty ? null : h("p", null, h("a", { href: `/regex-to-nfa?re=${encodeURIComponent(res.regex)}` }, "Turn it back into an NFA (Thompson) →")),
        h("h3", { class: "small muted elim-sub" }, "Same automaton, different orders"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse elim-table" },
          h("thead", null, h("tr", null, ["Order", "Expression", "Length", ""].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, orders.map(({ label, r }) => h("tr", { class: r.order.join(" ") === res.order.join(" ") ? "hot" : null },
            h("th", { scope: "row" }, `${label}: ${r.order.join(" ")}`), h("td", { class: "elim-re" }, r.regex), h("td", null, r.regex.length + (r.regex.length === best ? " ✓" : "")),
            h("td", null, h("button", { type: "button", class: "linkish", onclick: () => setOrder(r.order.join(" ")) }, "use")))))))),
      productCard);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.fa = ex.text; faIn.value = ex.text; state.order = ""; orderIn.value = ""; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "DFA (or NFA)", faIn),
      h("label", { class: "stack" }, "Elimination order (states separated by spaces; empty = as listed)", orderIn),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost small", onclick: () => setOrder("") }, "As listed"),
        h("button", { type: "button", class: "btn ghost small", onclick: () => { try { setOrder(eliminate(parseAutomaton(state.fa), { order: "greedy" }).order.join(" ")); } catch { /* the error shows below */ } } }, "Greedy: fewest new edges first")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let fa, res, st;
    for (let k = 0; k < 60; k++) {
      fa = parseAutomaton(randomDfaText(r, 3));
      res = eliminate(fa);
      const pairs = res.steps.filter((s) => s.parts && (s.parts.kk.t !== "empty" || s.parts.old.t !== "empty"));
      st = pairs[Math.floor(r() * pairs.length)];
      if (st) break;
    }
    const before = res.steps[res.steps.indexOf(st) - 1];
    const diagram = h("div", { class: "chart-wrap" }, elimDiagram({ ...before, lit: [], changed: null, focus: st.vars.k }, res));
    const head2 = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    let body;
    if (r() < 0.7) {
      const { ik, kk, kj, old } = st.parts, right = st.vars["new R(i,j)"];
      const wrongs = [alt(old, cat(ik, kk, kj)), cat(ik, star(kk), kj), alt(old, cat(kj, star(kk), ik)), alt(old, cat(ik, kj)), alt(old, cat(star(ik), kk, kj))].map(str);
      const opts = [...new Set([right, ...wrongs])].slice(0, 4);
      body = [h("h2", null, `Eliminating ${st.vars.k}: what is the new label on ${st.vars.i} → ${st.vars.j}?`), diagram,
        h("p", { class: "muted" }, `R(${st.vars.i},${st.vars.k}) = ${st.vars["R(i,k)"]}, R(${st.vars.k},${st.vars.k}) = ${st.vars["R(k,k)"]}, R(${st.vars.k},${st.vars.j}) = ${st.vars["R(k,j)"]}, and the old R(${st.vars.i},${st.vars.j}) = ${st.vars["old R(i,j)"]}.`),
        choice(opts.map((o) => ({ label: o, correct: o === right })).sort(() => r() - 0.5), `R(i,j) | R(i,k) R(k,k)* R(k,j) = ${right}. Don't forget the star on the loop or the union with the old label.`)];
    } else {
      const start = res.steps.find((s) => s.line?.[0] === 3 && s.focus === st.vars.k);
      const n = start.vars.into * start.vars["out of"];
      body = [h("h2", null, `How many (i, j) pairs must be rerouted when ${st.vars.k} is eliminated?`), diagram,
        h("p", { class: "muted" }, "Count edges into it times edges out of it, ignoring its self-loop."),
        numberQuestion(n, `${start.vars.into} edge${start.vars.into === 1 ? "" : "s"} in × ${start.vars["out of"]} out = ${n}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, head2, ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
