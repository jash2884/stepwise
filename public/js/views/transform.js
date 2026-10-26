import { EXAMPLES, leftFactor, parseGrammar, removeLeftRecursion, toText } from "../engines/grammar.js";
import { copyLink, h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs } from "./kit.js";

const PICK = { expr: EXAMPLES.expr, indirect: EXAMPLES.indirect, ifelse: EXAMPLES.ifelse,
  both: { name: "Needs both", text: "A -> A b | a c | a d" },
  stmt: { name: "Statements with common prefixes", text: "S -> id = E | id ( L ) | id\nL -> L , E | E\nE -> id" } };

// Show a grammar, marking rules that weren't in the previous version.
function grammarBox(text, before) {
  const old = new Set((before ?? "").split("\n"));
  return h("pre", { class: "grammar-box" }, text.split("\n").map((line, i) => [i ? "\n" : "", before != null && !old.has(line) ? h("span", { class: "new" }, line) : line]));
}

function section(title, original, result, empty) {
  const box = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
  const versions = [toText(original), ...result.steps.map((s) => s.grammar)];
  if (!result.steps.length) return { el: h("section", { class: "card" }, h("h2", null, title), notice("good", empty)), destroy: () => {} };
  const player = stepper({
    count: versions.length, label: "Step", interval: 1600,
    render: (i) => {
      box.replaceChildren(grammarBox(versions[i], i ? versions[i - 1] : null));
      note.textContent = i ? result.steps[i - 1].note : "The grammar as given.";
      note.className = `step-note${i === versions.length - 1 ? " good" : ""}`;
    },
  });
  return { el: h("section", { class: "card" }, h("h2", null, title), player.el, box, note,
    result.warnings?.length ? h("div", null, result.warnings.map((w) => notice("info", w))) : null), destroy: player.destroy };
}

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? PICK.indirect.text };
  let parts = [];
  const head = page({
    subject: "Compiler design", title: "Left recursion & left factoring",
    lede: "Get a grammar ready for top-down (LL) parsing: remove left recursion, then factor out common prefixes.",
    theory: h("div", null,
      h("p", null, "A recursive-descent parser for A → A α would call itself forever before reading anything. ", h("b", null, "Immediate left recursion"), " A → A α | β is rewritten as A → β A′, A′ → α A′ | ε: the same strings, built right-recursively."),
      h("p", null, h("b", null, "Indirect"), " recursion (S → A a, A → S d) hides the cycle. The textbook algorithm orders the non-terminals A1…An, substitutes Aj's bodies into every Ai → Aj γ with j < i, and then removes Ai's immediate recursion."),
      h("p", null, h("b", null, "Left factoring"), " fixes rules like S → i E t S | i E t S e S, where the parser can't choose by looking at the next token: pull out the common prefix and decide later, S → i E t S S′, S′ → e S | ε.")),
    conventions: ["One non-terminal per line: A -> A b | c. The first one is the start symbol.", "New non-terminals get primes: A′, A′′…", "Rules that changed in a step are highlighted."],
  });
  const gIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    parts.forEach((x) => x.destroy());
    writeParams({ g: state.g });
    let g;
    try { g = parseGrammar(state.g); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const lr = removeLeftRecursion(g), lf = leftFactor(lr.grammar);
    parts = [
      section("1. Remove left recursion", g, lr, "No left recursion: nothing to do."),
      section("2. Left factor", lr.grammar, lf, "No two alternatives share a prefix: nothing to factor."),
    ];
    const final = toText(lf.grammar);
    out.replaceChildren(...parts.map((x) => x.el),
      h("section", { class: "card" }, h("h2", null, "Result"), grammarBox(final),
        h("p", null, h("a", { href: `/ll1-parsing?g=${encodeURIComponent(final)}` }, "Build the LL(1) table for it →"), " · ", h("a", { href: `/first-follow?g=${encodeURIComponent(final)}` }, "FIRST and FOLLOW →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(PICK, (ex) => { state.g = ex.text; gIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar", gIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const A = ["A", "B", "S", "E"][Math.floor(r() * 4)];
    const alpha = [["+", "x"], ["a"], ["b", "c"], ["*", "y"]][Math.floor(r() * 4)], beta = [["d"], ["z"], ["(", "x", ")"], ["id"]][Math.floor(r() * 4)];
    const text = `${A} -> ${A} ${alpha.join(" ")} | ${beta.join(" ")}`;
    const right = toText(removeLeftRecursion(parseGrammar(text)).grammar);
    const A2 = `${A}'`;
    const wrongs = [
      `${A} -> ${beta.join(" ")} ${A2}\n${A2} -> ${alpha.join(" ")} ${A2}`,
      `${A} -> ${A2} ${beta.join(" ")}\n${A2} -> ${A2} ${alpha.join(" ")} | ε`,
      `${A} -> ${alpha.join(" ")} ${A2}\n${A2} -> ${beta.join(" ")} ${A2} | ε`,
    ];
    const options = [{ label: right, correct: true }, ...wrongs.map((w) => ({ label: w, correct: false }))].sort(() => r() - 0.5);
    const c = choice(options, `A → A α | β becomes A → β A′, A′ → α A′ | ε. Here α = ${alpha.join(" ")} and β = ${beta.join(" ")}.`);
    for (const b of c.querySelectorAll("button")) b.classList.add("mono", "pre");
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "Which grammar removes the left recursion correctly?"),
      grammarBox(text), c));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => parts.forEach((x) => x.destroy());
}
