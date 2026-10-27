import { CODE, EXAMPLES, parseAutomaton, run } from "../engines/automata.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, deltaTable, exampleSelect, faEdges, inputStrip, mountTabs, randomDfaText, randomString, stat } from "./kit.js";

export function render(root) {
  const p = readParams();
  const state = { fa: p.get("fa") ?? EXAMPLES.endsAbb.text, input: p.get("w") ?? "babb" };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "Finite automata",
    lede: "Draw a DFA, NFA or ε-NFA as a list of transitions, feed it a string and watch the active states light up.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "DFA"), " is in exactly one state at a time and has exactly one move per symbol. An ", h("b", null, "NFA"), " can have several moves (or none), so it's in a ", h("i", null, "set"), " of states at once; an ", h("b", null, "ε-NFA"), " can also move without reading anything."),
      h("p", null, "The string is ", h("b", null, "accepted"), " if, once every symbol is read, at least one active state is accepting (drawn with a double circle). Every NFA can be turned into an equivalent DFA by the subset construction, so all three recognise exactly the regular languages.")),
    conventions: ["The pseudocode panel follows the DFA loop for a DFA, and the set-of-states loop for an NFA or ε-NFA.", "One transition per line: q0 a q1. List several targets for an NFA: q0 a q1 q2.", "Write ε (or eps) for empty moves.", "Start and accepting states: start: q0 and accept: q2 q3."],
  });

  const faIn = h("textarea", { rows: 8, class: "mono", "aria-label": "Automaton", oninput: (e) => { state.fa = e.target.value; update(); } }, state.fa);
  const wIn = h("input", { type: "text", class: "mono", value: state.input, "aria-label": "Input string", oninput: (e) => { state.input = e.target.value.replace(/\s+/g, ""); update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ fa: state.fa, w: state.input });
    let fa;
    try { fa = parseAutomaton(state.fa); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const symbols = [...state.input];
    const res = run(fa, state.input);
    const edges = faEdges(fa);
    const diagram = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const strip = h("div"), table = h("div");
    const code = codePanel(fa.kind === "DFA" ? CODE.dfa : CODE.nfa, { title: fa.kind === "DFA" ? "Pseudocode (DFA)" : `Pseudocode (${fa.kind}: a set of states)` }), vars = varsPanel();
    player = stepper({
      count: res.steps.length, label: "Symbol", interval: 1000,
      render: (i) => {
        const st = res.steps[i];
        morph(diagram, stateDiagram({ states: fa.states.map((id) => ({ id })), edges, start: fa.start, accept: fa.accept, active: st.active, lit: st.via, tokens: true, aria: `Automaton with ${fa.states.length} states; active: ${st.active.join(", ") || "none"}.` }));
        strip.replaceChildren(inputStrip(symbols, i < res.steps.length - 1 ? i : symbols.length));
        table.replaceChildren(deltaTable(fa, { active: st.active, hotSym: symbols[i] }));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${i === res.steps.length - 1 ? (res.accepted ? " good" : " bad") : ""}`;
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Run"), player.el, note, traceLayout(h("div", null, strip, diagram), code, vars),
        h("div", { class: "stats-row" }, stat("Type", fa.kind), stat("States", fa.states.length), stat("Alphabet", `{${fa.alphabet.join(", ")}}`, true), stat("Result", res.accepted ? "Accepted" : "Rejected"))),
      h("section", { class: "card" }, h("h2", null, "Transition table"), table,
        h("p", { class: "muted small" }, "→ marks the start state and * the accepting states. The highlighted row is where the automaton is now.",
          fa.kind === "DFA" && !fa.complete ? " Some moves are missing: a DFA drawn this way has an implicit dead state." : ""),
        fa.kind !== "DFA" ? h("p", null, h("a", { href: `/nfa-to-dfa?fa=${encodeURIComponent(state.fa)}` }, "Convert this to a DFA →")) : h("p", null, h("a", { href: `/dfa-minimization?fa=${encodeURIComponent(state.fa)}` }, "Minimise this DFA →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.fa = ex.text; faIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Automaton", faIn),
      h("label", { class: "stack" }, "Input string", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const fa = parseAutomaton(randomDfaText(r));
    const w = randomString(r, ["a", "b"], 3, 6);
    const res = run(fa, w);
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Does this DFA accept "${w}"?`),
      h("div", { class: "chart-wrap" }, stateDiagram({ states: fa.states.map((id) => ({ id })), edges: faEdges(fa), start: fa.start, accept: fa.accept })),
      choice([{ label: "Accepted", correct: res.accepted }, { label: "Rejected", correct: !res.accepted }],
        `The run goes ${res.steps.map((s) => s.active[0] ?? "∅").join(" → ")}, ending ${res.accepted ? "in an accepting state" : "outside the accepting states"}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
