import { regexToNfa, run, toText } from "../engines/automata.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, faEdges, mountTabs, randomString, stat } from "./kit.js";

const EXAMPLES = {
  book: { name: "(a|b)*abb", re: "(a|b)*abb" },
  plus: { name: "a+b?", re: "a+b?" },
  even: { name: "(aa|bb)*", re: "(aa|bb)*" },
  binary: { name: "1(0|1)*0", re: "1(0|1)*0" },
  mixed: { name: "(ab|c)*d", re: "(ab|c)*d" },
};
const PRACTICE = ["(a|b)*abb", "a*b*", "(ab)*", "a(a|b)*b", "(a|b)*aa(a|b)*", "b*(ab*ab*)*", "(a|ba)*", "a+b+", "(a|b)(a|b)"];

export function render(root) {
  const p = readParams();
  const state = { re: p.get("re") ?? "(a|b)*abb", w: p.get("w") ?? "babb" };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "Regex to NFA",
    lede: "Thompson's construction builds an ε-NFA from a regular expression, one small piece per symbol and operator.",
    theory: h("div", null,
      h("p", null, "Read the expression in ", h("b", null, "postfix"), " order. Each symbol a becomes two states joined by an a-move. Then combine fragments:"),
      h("ul", null,
        h("li", null, h("b", null, "Concatenation"), " st: the end of s becomes the start of t."),
        h("li", null, h("b", null, "Union"), " s|t: a new start with ε-moves into both, and both ends ε-move to a new end."),
        h("li", null, h("b", null, "Star"), " s*: new start and end, an ε-loop from s's end back to its start, and an ε-bypass for zero repetitions. ", h("b", null, "+"), " drops the bypass; ", h("b", null, "?"), " drops the loop.")),
      h("p", null, "Every fragment has one start and one end, so the result has at most 2 states per symbol and operator. (a|b)*abb gives the 11-state NFA from the Dragon Book.")),
    conventions: ["Operators: | (or), * (zero or more), + (one or more), ? (optional), parentheses. Concatenation is implicit.", "Write ε for the empty string. Spaces are ignored.", "A state shown as 1′ will merge into state 1 at the next concatenation."],
  });

  const reIn = h("input", { type: "text", class: "mono wide", value: state.re, "aria-label": "Regular expression", oninput: (e) => { state.re = e.target.value; update(); } });
  const wIn = h("input", { type: "text", class: "mono", value: state.w, "aria-label": "Test string", oninput: (e) => { state.w = e.target.value.replace(/\s+/g, ""); test(); } });
  const msg = h("div"), out = h("div", { class: "output" }), testBox = h("div");
  let nfa = null;

  function test() {
    writeParams({ re: state.re, w: state.w });
    if (!nfa) { testBox.replaceChildren(); return; }
    const r = run(nfa, state.w);
    testBox.replaceChildren(notice(r.accepted ? "good" : "bad", `"${state.w || "ε"}" is ${r.accepted ? "matched" : "not matched"} by ${state.re}.`));
  }

  function update() {
    player?.destroy();
    let res;
    try { res = regexToNfa(state.re); } catch (e) { nfa = null; msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); test(); return; }
    msg.replaceChildren();
    nfa = res.nfa;
    const box = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), frag = h("p", { class: "big-answer" });
    const count = res.steps.length + 1;
    player = stepper({
      count, label: "Step", interval: 1200,
      render: (i) => {
        if (i < res.steps.length) {
          const st = res.steps[i];
          morph(box, stateDiagram({ states: st.nodes.map((id) => ({ id })), edges: st.edges, start: st.start, accept: [st.end], active: st.states, aria: `Fragment for ${st.text}` }));
          frag.replaceChildren("Fragment: ", h("b", null, st.text));
          note.textContent = st.note;
          note.className = "step-note";
        } else {
          morph(box, stateDiagram({ states: nfa.states.map((id) => ({ id })), edges: faEdges(nfa), start: nfa.start, accept: nfa.accept, aria: `ε-NFA with ${nfa.states.length} states.` }));
          frag.replaceChildren("NFA for ", h("b", null, state.re.replace(/\s+/g, "")));
          note.textContent = `Done: ${nfa.states.length} states, start ${nfa.start}, accepting ${nfa.accept[0]}.`;
          note.className = "step-note good";
        }
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Thompson's construction"), player.el, frag, box, note,
        h("div", { class: "stats-row" }, stat("Postfix", res.postfix, true), stat("States", nfa.states.length), stat("Alphabet", `{${nfa.alphabet.join(", ")}}`, true))),
      h("section", { class: "card" }, h("h2", null, "Test a string"), h("label", { class: "stack" }, "String", wIn), testBox,
        h("p", null, h("a", { href: `/nfa-to-dfa?fa=${encodeURIComponent(toText(nfa))}` }, "Convert this NFA to a DFA →"), " · ", h("a", { href: `/finite-automata?fa=${encodeURIComponent(toText(nfa))}&w=${encodeURIComponent(state.w)}` }, "Run it step by step →"))));
    test();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.re = ex.re; reIn.value = ex.re; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Regular expression", reIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const re = PRACTICE[Math.floor(r() * PRACTICE.length)];
    const { nfa: m } = regexToNfa(re);
    const yes = [], no = [];
    for (let k = 0; k < 200 && (yes.length < 3 || no.length < 3); k++) {
      const s = randomString(r, ["a", "b"], 1, 6);
      const bucket = run(m, s).accepted ? yes : no;
      if (!yes.includes(s) && !no.includes(s)) bucket.push(s);
    }
    const askMatch = yes.length && (r() < 0.5 || !no.length);
    const right = askMatch ? yes[0] : no[0];
    const wrong = (askMatch ? no : yes).slice(0, 3);
    const options = [{ label: right, correct: true }, ...wrong.map((s) => ({ label: s, correct: false }))].sort(() => r() - 0.5);
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Which string is ${askMatch ? "" : "NOT "}matched by `, h("span", { class: "mono" }, re), "?"),
      choice(options, `${right} is ${askMatch ? "" : "not "}in the language; the others are${askMatch ? "n't" : ""}.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
