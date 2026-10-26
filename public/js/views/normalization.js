import { candidateKeys, closure, decomposeBCNF, fdText, minimalCover, normalForm, parseAttrs, parseFds, randomSchema, sameSet, synthesize3NF } from "../engines/fd.js";
import { copyLink, h, notice, page, readParams, rng, tabs, writeParams } from "../ui.js";

const EXAMPLES = [
  ["Partial dependency (1NF)", "ABCD", "AB -> C\nA -> D"],
  ["Transitive dependency (2NF)", "ABCDE", "A -> B\nB -> C\nA -> D\nD -> E"],
  ["3NF but not BCNF", "ABC", "AB -> C\nC -> B"],
  ["Several candidate keys", "ABCD", "AB -> C\nC -> D\nD -> A"],
  ["Classic exam question", "ABCDEF", "AB -> C\nC -> D\nD -> E\nE -> F\nF -> A"],
];
const LEVELS = ["1NF", "2NF", "3NF", "BCNF"];

// Steps revealed one at a time, so students can predict the next line first.
function steps(items, label = "Next step") {
  let shown = 1;
  const list = h("ol", { class: "notes reveal" });
  const more = h("button", { type: "button", class: "btn ghost small" }, label);
  const all = h("button", { type: "button", class: "btn ghost small" }, "Show all");
  const draw = () => {
    list.replaceChildren(...items.slice(0, shown).map((s) => h("li", null, s)));
    more.hidden = all.hidden = shown >= items.length;
  };
  more.addEventListener("click", () => { shown++; draw(); });
  all.addEventListener("click", () => { shown = items.length; draw(); });
  draw();
  return h("div", null, list, h("div", { class: "row" }, more, all));
}

export function render(root) {
  const params = readParams();
  const state = { attrs: params.get("r") ?? EXAMPLES[1][1], fds: params.get("fd")?.replace(/;/g, "\n") ?? EXAMPLES[1][2], x: params.get("x") ?? "" };

  const head = page({
    subject: "Databases",
    title: "Normalisation",
    lede: "From functional dependencies to candidate keys, normal forms and decompositions, with every step of the reasoning shown.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "functional dependency"), " X → Y means equal X values always give equal Y values. The ", h("b", null, "closure"), " X⁺ is every attribute X determines. X is a ", h("b", null, "superkey"), " if X⁺ is the whole relation, and a ", h("b", null, "candidate key"), " if no smaller part of it is."),
      h("ul", null,
        h("li", null, h("b", null, "2NF"), ": no non-prime attribute depends on just part of a candidate key."),
        h("li", null, h("b", null, "3NF"), ": for every X → A, X is a superkey or A is prime (part of some candidate key)."),
        h("li", null, h("b", null, "BCNF"), ": for every non-trivial X → A, X is a superkey."))),
    conventions: ["Attributes are single letters (A–Z), as in most exam questions.", "Relations are assumed to be in 1NF (atomic values).", "Write dependencies one per line, e.g. AB -> C or AB → C, D."],
  });

  const exampleSel = h("select", { "aria-label": "Example", onchange: (e) => { if (e.target.value === "") return; const [, a, f] = EXAMPLES[Number(e.target.value)]; state.attrs = a; state.fds = f; attrsIn.value = a; fdsIn.value = f; update(); e.target.value = ""; } },
    h("option", { value: "" }, "Load an example…"), EXAMPLES.map(([name], i) => h("option", { value: i }, name)));
  const attrsIn = h("input", { type: "text", value: state.attrs, "aria-label": "Attributes", class: "mono", oninput: (e) => { state.attrs = e.target.value; update(); } });
  const fdsIn = h("textarea", { rows: 5, "aria-label": "Functional dependencies", class: "mono", oninput: (e) => { state.fds = e.target.value; update(); } }, state.fds);
  const msg = h("div"), out = h("div", { class: "output grid-2" });

  function update() {
    let attrs, fds;
    try { attrs = parseAttrs(state.attrs); fds = parseFds(state.fds, attrs); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    if (!fds.length) { msg.replaceChildren(notice("info", "Add at least one dependency.")); out.replaceChildren(); return; }
    msg.replaceChildren();
    writeParams({ r: attrs, fd: fds.map((f) => `${f.lhs}->${f.rhs}`).join(";"), x: state.x });

    const keys = candidateKeys(attrs, fds);
    const nf = normalForm(attrs, fds);
    const cover = minimalCover(fds);
    const three = synthesize3NF(attrs, fds);
    const bcnf = decomposeBCNF(attrs, fds);

    const xIn = h("input", { type: "text", value: state.x || keys.keys[0], "aria-label": "Attributes to close", class: "mono short" });
    const closureOut = h("div");
    const calc = () => {
      state.x = xIn.value;
      const x = xIn.value.toUpperCase().replace(/[^A-Z]/g, "");
      if (!x) { closureOut.replaceChildren(); return; }
      const bad = [...x].filter((c) => !attrs.includes(c));
      if (bad.length) { closureOut.replaceChildren(notice("error", `${bad.join(", ")} isn't in the relation.`)); return; }
      const c = closure(x, fds);
      closureOut.replaceChildren(h("p", { class: "big-answer" }, `${[...new Set(x)].sort().join("")}⁺ = `, h("b", null, c.closure),
        c.closure === attrs ? h("span", { class: "badge" }, "superkey") : null), steps(c.steps.map((s) => s.note)));
    };
    xIn.addEventListener("input", calc);
    calc();

    const ladder = h("ol", { class: "ladder" }, LEVELS.map((lvl) => {
      const reached = LEVELS.indexOf(lvl) <= LEVELS.indexOf(nf.form);
      const v = nf.violations[lvl] ?? [];
      return h("li", { class: reached ? "ok" : "no" },
        h("b", null, `${reached ? "✓" : "✗"} ${lvl}`),
        !reached && v.length ? h("ul", null, v.map((x) => h("li", null, h("span", { class: "mono" }, `${x.lhs} → ${x.rhs}`), `: ${x.why}`))) : null);
    }));

    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Candidate keys"),
        h("p", { class: "big-answer" }, keys.keys.map((k) => h("span", { class: "key mono" }, k))),
        steps(keys.reasoning)),
      h("section", { class: "card" }, h("h2", null, "Closure calculator"), h("label", { class: "inline" }, "Close ", xIn), closureOut),
      h("section", { class: "card" }, h("h2", null, `Highest normal form: ${nf.form}`), ladder),
      h("section", { class: "card" }, h("h2", null, "Minimal cover"), h("p", { class: "mono" }, cover.cover.map(fdText).join(",  ")), steps(cover.steps.map((s) => s.note))),
      h("section", { class: "card" }, h("h2", null, "3NF synthesis"),
        h("p", { class: "relations" }, three.relations.map((r) => h("span", { class: "rel mono" }, `R(${r})`))),
        h("p", { class: "muted small" }, "Lossless and dependency-preserving, always."), steps(three.steps.map((s) => s.note))),
      h("section", { class: "card" }, h("h2", null, "BCNF decomposition"),
        h("p", { class: "relations" }, bcnf.relations.map((r) => h("span", { class: "rel mono" }, `R(${r})`))),
        h("p", { class: "muted small" }, bcnf.lost.length ? "Lossless, but some dependencies are lost." : "Lossless and dependency-preserving."), steps(bcnf.steps.map((s) => s.note))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { const s = randomSchema(); state.attrs = s.attrs; state.fds = s.fds.map((f) => `${f.lhs} -> ${f.rhs}`).join("\n"); attrsIn.value = state.attrs; fdsIn.value = state.fds; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Relation attributes", attrsIn),
      h("label", { class: "stack" }, "Functional dependencies", fdsIn),
      msg),
    out);

  // --- Practice: closure, keys and normal form for a random schema ----------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const { attrs, fds } = randomSchema(r);
    const x = [...attrs].filter(() => r() < 0.35).join("") || attrs[0];
    const truth = { closure: closure(x, fds).closure, keys: candidateKeys(attrs, fds).keys, form: normalForm(attrs, fds).form };
    const closureIn = h("input", { type: "text", class: "mono", "aria-label": `Closure of ${x}` });
    const keysIn = h("input", { type: "text", class: "mono", placeholder: "e.g. AB, CD", "aria-label": "Candidate keys" });
    const formSel = h("select", { "aria-label": "Highest normal form" }, h("option", { value: "" }, "Choose…"), LEVELS.map((l) => h("option", { value: l }, l)));
    const feedback = h("div");
    const mark = (el, ok, expected) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${expected}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, h("span", { class: "mono" }, `R(${attrs})`)),
      h("p", { class: "mono fds" }, fds.map(fdText).join("   ·   ")),
      h("div", { class: "qa" },
        h("label", null, h("span", null, "1. Closure ", h("span", { class: "mono" }, `${x}⁺`)), closureIn),
        h("label", null, "2. All candidate keys (comma-separated)", keysIn),
        h("label", null, "3. Highest normal form", formSel)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          const okC = sameSet(closureIn.value, truth.closure);
          const given = keysIn.value.split(/[,;\s]+/).filter(Boolean);
          const okK = given.length === truth.keys.length && truth.keys.every((k) => given.some((g) => sameSet(g, k)));
          const okF = formSel.value === truth.form;
          mark(closureIn, okC, truth.closure); mark(keysIn, okK, truth.keys.join(", ")); mark(formSel, okF, truth.form);
          const n = [okC, okK, okF].filter(Boolean).length;
          feedback.replaceChildren(notice(n === 3 ? "good" : "info", n === 3 ? "All three right! 🎉" : `${n} / 3 right. Hover a red answer to see the expected one, or open the full working.`));
        } }, "Check"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          state.attrs = attrs; state.fds = fds.map((f) => `${f.lhs} -> ${f.rhs}`).join("\n"); state.x = x;
          attrsIn.value = state.attrs; fdsIn.value = state.fds;
          tab.select("visual"); update();
        } }, "Open the full working")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => {};
}
