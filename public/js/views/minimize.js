import { CODE, EXAMPLES, minimize, parseAutomaton, subsetConstruction, toText } from "../engines/automata.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { exampleSelect, faEdges, mountTabs, numberQuestion, randomDfaText, series, stat } from "./kit.js";

const DFA_EXAMPLES = {
  redundant: EXAMPLES.redundant,
  book: { name: "DFA for (a|b)*abb from the subset construction", text: "start: A\naccept: E\nA a B\nA b C\nB a B\nB b D\nC a B\nC b C\nD a B\nD b E\nE a B\nE b C" },
  mod3: { name: "Binary numbers divisible by 3 (with copies)", text: "start: r0\naccept: r0 s0\nr0 0 s0\nr0 1 r1\ns0 0 r0\ns0 1 r1\nr1 0 r2\nr1 1 s0\nr2 0 r1\nr2 1 r2" },
  unreachable: { name: "With an unreachable state", text: "start: p\naccept: r\np 0 q\np 1 p\nq 0 r\nq 1 p\nr 0 r\nr 1 r\nx 0 r\nx 1 p" },
};

export function render(root) {
  const p = readParams();
  const state = { fa: p.get("fa") ?? DFA_EXAMPLES.book.text };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "DFA minimisation",
    lede: "Merge states that no input string can tell apart. Partition refinement splits groups until every group behaves the same way.",
    theory: h("div", null,
      h("p", null, "Two states are ", h("b", null, "equivalent"), " if, for every string w, either both reach an accepting state on w or neither does. Equivalent states can be merged without changing the language."),
      h("p", null, "Start (", h("b", null, "0-equivalence"), ") with two groups: accepting and non-accepting. In each round (", h("b", null, "k-equivalence"), "), split a group whenever two of its states move into ", h("i", null, "different"), " groups on some symbol. When a round splits nothing, each group is one state of the minimal DFA."),
      h("p", null, "First remove unreachable states, and add a dead state if moves are missing. The minimal DFA is unique up to renaming (Myhill–Nerode).")),
    conventions: ["The input must be a DFA: one target per move, no ε-moves. Convert NFAs first.", "Merged states are named after their group, e.g. {A,C}.", "Colours show the current groups; a group keeps its colour while it survives."],
  });

  const faIn = h("textarea", { rows: 8, class: "mono", "aria-label": "DFA", oninput: (e) => { state.fa = e.target.value; update(); } }, state.fa);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ fa: state.fa });
    let dfa, res;
    try {
      dfa = parseAutomaton(state.fa);
      if (dfa.kind !== "DFA") {
        msg.replaceChildren(notice("info", `That's an ${dfa.kind}, so it was converted to a DFA first (subset construction).`));
        dfa = subsetConstruction(dfa, { includeDead: false }).dfa;
      } else msg.replaceChildren();
      res = minimize(dfa);
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const { rounds, min } = res;
    const shownStates = [...dfa.states.filter((q) => !res.unreachable.includes(q)), ...(res.dead ? ["dead"] : [])];
    const edges = faEdges(dfa).filter((e) => !res.unreachable.includes(e.from));
    if (res.dead) {
      for (const q of shownStates) for (const a of dfa.alphabet) if (q === "dead" || !dfa.next(q, a).length) edges.push({ from: q, to: "dead", label: a });
    }
    const box = h("div", { class: "chart-wrap" }), groupsBox = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(CODE.minimize), vars = varsPanel();
    // Colour groups so a group that survives a round keeps its colour.
    const colourOf = new Map();
    let nextColour = 0;
    const colours = rounds.map((r) => r.groups.map((g) => {
      const key = g.join(",");
      if (!colourOf.has(key)) colourOf.set(key, nextColour++);
      return colourOf.get(key);
    }));
    player = stepper({
      count: rounds.length + 1, label: "Round", interval: 1500,
      render: (i) => {
        if (i < rounds.length) {
          const r = rounds[i];
          const styles = {}, classes = {};
          r.groups.forEach((g, gi) => g.forEach((q) => { styles[q] = series(colours[i][gi]); classes[q] = "grp"; }));
          morph(box, stateDiagram({ states: shownStates.map((id) => ({ id })), edges, start: dfa.start, accept: dfa.accept, classes, styles, aria: `Round ${r.k}: groups ${r.groups.map((g) => `{${g.join(", ")}}`).join(" ")}` }));
          groupsBox.replaceChildren(rounds.slice(0, i + 1).map((rr, ri) => h("div", null,
            h("div", { class: "partition-k" }, `${rr.k}-equivalence`),
            h("div", { class: "partition" }, rr.groups.map((g, gi) => h("span", { style: series(colours[ri][gi]) }, `{${g.join(", ")}}`))))));
          note.textContent = (i === 0 && res.steps.length ? `${res.steps.map((s) => s.note).join(" ")} ` : "") + r.note;
          note.className = "step-note";
          code.show(r.line);
          vars.show(r.vars);
        } else {
          morph(box, stateDiagram({ states: min.states.map((id) => ({ id })), edges: faEdges(min), start: min.start, accept: min.accept, classes: Object.fromEntries(min.states.map((q) => [q, "grp"])), styles: Object.fromEntries(rounds.at(-1).groups.map((g, gi) => [g.length === 1 ? g[0] : `{${g.join(",")}}`, series(colours.at(-1)[gi])])), aria: `Minimal DFA with ${min.states.length} states.` }));
          note.textContent = `Minimal DFA: ${min.states.length} state${min.states.length === 1 ? "" : "s"}${min.states.length < dfa.states.length ? `, down from ${dfa.states.length}` : ". It was already minimal"}.`;
          note.className = "step-note good";
          code.show(10);
          vars.show({ groups: rounds.at(-1).groups.length, "minimal states": min.states.length, start: min.start, accepting: min.accept });
        }
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Partition refinement"), player.el, note, traceLayout(h("div", null, box, groupsBox), code, vars),
        h("div", { class: "stats-row" }, stat("Original states", dfa.states.length), stat("Unreachable", res.unreachable.length), stat("Minimal states", min.states.length), stat("Rounds", rounds.length - 1))),
      h("section", { class: "card" }, h("h2", null, "Minimal DFA"),
        h("pre", { class: "grammar-box" }, toText(min)),
        h("p", null, h("a", { href: `/finite-automata?fa=${encodeURIComponent(toText(min))}` }, "Run the minimal DFA →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(DFA_EXAMPLES, (ex) => { state.fa = ex.text; faIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "DFA", faIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let dfa, res;
    for (let k = 0; k < 40; k++) {
      dfa = parseAutomaton(randomDfaText(r, 4 + Math.floor(r() * 2)));
      res = minimize(dfa);
      if (res.min.states.length < dfa.states.length - res.unreachable.length || k > 30) break;
    }
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "How many states does the minimal DFA have?"),
      h("p", { class: "muted" }, "Remember to drop unreachable states. Missing moves would need a dead state, but every move is drawn here."),
      h("div", { class: "chart-wrap" }, stateDiagram({ states: dfa.states.map((id) => ({ id })), edges: faEdges(dfa), start: dfa.start, accept: dfa.accept })),
      numberQuestion(res.min.states.length, `Final groups: ${res.rounds.at(-1).groups.map((g) => `{${g.join(", ")}}`).join(", ")}${res.unreachable.length ? ` (after removing unreachable ${res.unreachable.join(", ")})` : ""}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
