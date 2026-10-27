import { CODE, EXAMPLES, parseAutomaton, subsetConstruction, toText } from "../engines/automata.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { exampleSelect, faEdges, mountTabs, numberQuestion, stat } from "./kit.js";

const NFA_EXAMPLES = Object.fromEntries(Object.entries(EXAMPLES).filter(([k]) => k === "nfa" || k === "enfa").concat([
  ["abb", { name: "ε-NFA for (a|b)*abb (Thompson)", text: "start: 0\naccept: 10\n0 ε 1 7\n1 ε 2 4\n2 a 3\n4 b 5\n3 ε 6\n5 ε 6\n6 ε 1 7\n7 a 8\n8 b 9\n9 b 10" }],
  ["contains", { name: "NFA: contains 01", text: "start: p\naccept: r\np 0 p q\np 1 p\nq 1 r\nr 0 r\nr 1 r" }],
]));

export function render(root) {
  const p = readParams();
  const state = { fa: p.get("fa") ?? NFA_EXAMPLES.abb.text, dead: p.get("dead") !== "0" };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "NFA to DFA",
    lede: "The subset construction: each DFA state is the set of NFA states the NFA could be in. Watch the DFA grow one move at a time.",
    theory: h("div", null,
      h("p", null, "Start with the ", h("b", null, "ε-closure"), " of the NFA's start state: every state reachable by ε-moves alone. That set is the DFA's start state."),
      h("p", null, "For each new set S and each symbol a, collect every state an NFA state in S can reach on a (", h("i", null, "move"), "), then take the ε-closure. If that set is new, it becomes a new DFA state. Stop when no new sets appear."),
      h("p", null, "A DFA state is accepting if its set contains any accepting NFA state. In the worst case the DFA needs 2", h("sup", null, "n"), " states, which is why the \"third symbol from the end\" NFA blows up.")),
    conventions: ["Unmarked DFA states (the worklist) are processed in the order they were found, symbols in alphabetical order.", "DFA states are named A, B, C… in the order they are discovered.", "∅ is the dead state (the empty set): every move from it stays there.", "Write NFAs one transition per line, e.g. q0 a q0 q1."],
  });

  const faIn = h("textarea", { rows: 8, class: "mono", "aria-label": "NFA", oninput: (e) => { state.fa = e.target.value; update(); } }, state.fa);
  const deadBox = h("input", { type: "checkbox", checked: state.dead, onchange: (e) => { state.dead = e.target.checked; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ fa: state.fa, ...(state.dead ? {} : { dead: "0" }) });
    let nfa, res;
    try { nfa = parseAutomaton(state.fa); res = subsetConstruction(nfa, { includeDead: state.dead }); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren(nfa.kind === "DFA" ? notice("info", "This is already a DFA, so every set has one state. Try an NFA to see the construction do some work.") : "");
    const { dfa, sets, steps } = res;
    const nfaBox = h("div", { class: "chart-wrap" }), dfaBox = h("div", { class: "chart-wrap" }), tableBox = h("div", { class: "table-wrap" });
    const note = h("p", { class: "step-note", "aria-live": "polite" });
    const code = codePanel(CODE.subset), vars = varsPanel({ title: "Variables and worklist" });
    const nfaEdges = faEdges(nfa);
    // Which DFA states and moves exist after step i.
    const seen = (i) => {
      const states = new Set(["A"]), edges = [];
      for (const st of steps.slice(1, i + 1)) { states.add(st.to); edges.push({ from: st.from, to: st.to, label: st.sym }); }
      return { states, edges };
    };
    player = stepper({
      count: steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = steps[i], cur = st.to ?? st.state, from = st.from ?? null;
        const { states, edges } = seen(i);
        const set = sets[cur] ?? [];
        morph(nfaBox, stateDiagram({ states: nfa.states.map((id) => ({ id })), edges: nfaEdges, start: nfa.start, accept: nfa.accept, active: set, classes: Object.fromEntries((from ? sets[from] : []).filter((q) => !set.includes(q)).map((q) => [q, "dim-src"])), aria: `NFA; highlighted: ${set.join(", ")}` }));
        morph(dfaBox, stateDiagram({
          states: dfa.states.filter((q) => states.has(q)).map((id) => ({ id })), edges, start: "A",
          accept: dfa.accept.filter((q) => states.has(q)), active: [cur], lit: from ? [{ from, to: cur }] : [], tokens: true,
          aria: `DFA so far: ${[...states].join(", ")}`,
        }));
        tableBox.replaceChildren(h("table", { class: "parse" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "DFA state"), h("th", { scope: "col" }, "NFA states"), dfa.alphabet.map((a) => h("th", { scope: "col" }, a)))),
          h("tbody", null, dfa.states.filter((q) => states.has(q)).map((q) => h("tr", { class: q === cur ? "hot" : null },
            h("th", { scope: "row" }, `${q === "A" ? "→ " : ""}${dfa.accept.includes(q) ? "* " : ""}${q}`),
            h("td", { class: "left" }, `{${sets[q].join(", ")}}`),
            dfa.alphabet.map((a) => { const e = edges.find((x) => x.from === q && x.label === a); return h("td", { class: e && from === q && st.sym === a ? "added" : null }, e ? e.to : ""); }))))));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${i === steps.length - 1 ? " good" : ""}`;
        if (i === steps.length - 1) note.textContent += ` Done: ${dfa.states.length} DFA states from ${nfa.states.length} NFA states.`;
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Subset construction"), player.el, note,
        traceLayout(h("div", { class: "tcd-stack" },
          h("div", null, h("h3", { class: "small muted" }, `NFA (${nfa.states.length} states) · the set U highlighted, T dashed`), nfaBox),
          h("div", null, h("h3", { class: "small muted" }, "DFA so far"), dfaBox)), code, vars),
        h("div", { class: "stats-row" }, stat("NFA states", nfa.states.length), stat("DFA states", dfa.states.length), stat("Worst case 2ⁿ", 2 ** nfa.states.length > 1e6 ? "> 10⁶" : 2 ** nfa.states.length))),
      h("section", { class: "card" }, h("h2", null, "DFA transition table"), tableBox,
        h("p", null, h("a", { href: `/dfa-minimization?fa=${encodeURIComponent(toText(dfa))}` }, "Minimise this DFA →"), " · ", h("a", { href: `/finite-automata?fa=${encodeURIComponent(toText(dfa))}&w=` }, "Run it →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(NFA_EXAMPLES, (ex) => { state.fa = ex.text; faIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "NFA or ε-NFA", faIn),
      h("label", { class: "row small" }, deadBox, "Include the dead state ∅ (makes the DFA complete)"),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let nfa, dfa;
    for (let k = 0; k < 40; k++) {
      const n = 3 + Math.floor(r() * 2), names = Array.from({ length: n }, (_, i) => `q${i}`);
      const lines = ["start: q0", `accept: ${names[n - 1]}`];
      for (const q of names) for (const a of ["0", "1"]) {
        const t = names.filter(() => r() < 0.35);
        if (t.length) lines.push(`${q} ${a} ${t.join(" ")}`);
      }
      try { nfa = parseAutomaton(lines.join("\n")); dfa = subsetConstruction(nfa, { includeDead: false }).dfa; } catch { continue; }
      if (nfa.kind === "NFA" && dfa.states.length >= 3 && dfa.states.length <= 7) break;
    }
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "How many states does the subset construction produce?"),
      h("p", { class: "muted" }, "Count only the reachable sets, and don't count the dead state ∅."),
      h("div", { class: "chart-wrap" }, stateDiagram({ states: nfa.states.map((id) => ({ id })), edges: faEdges(nfa), start: nfa.start, accept: nfa.accept })),
      numberQuestion(dfa.states.length, `The sets are ${Object.entries(subsetConstruction(nfa, { includeDead: false }).sets).map(([k, v]) => `${k} = {${v.join(", ")}}`).join(", ")}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
