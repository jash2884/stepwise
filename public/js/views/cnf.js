import { CODE, EXAMPLES, languageUpTo, toCNF, withoutEmpty } from "../engines/cnf.js";
import { EPS, parseGrammar, showProd, toText } from "../engines/grammar.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const PHASES = [["START", "new start"], ["DEL", "ε-rules"], ["UNIT", "unit rules"], ["USELESS", "useless"], ["TERM", "terminals"], ["BIN", "binarise"]];

const okRule = (p, nts, start) => (p.rhs.length === 2 && p.rhs.every((s) => nts.has(s) && s !== start)) || (p.rhs.length === 1 && !nts.has(p.rhs[0])) || (!p.rhs.length && p.lhs === start);

// The grammar at one step: each variable on a row, its bodies as pills. New
// bodies pop in, removed ones are struck through as they leave, and bodies not
// yet in CNF form have a dashed outline.
function grammarView(st) {
  const nts = new Set(st.nonterminals), order = [...st.nonterminals];
  for (const p of st.removed) if (!order.includes(p.lhs)) order.push(p.lhs);
  for (const p of st.prods) if (!order.includes(p.lhs)) order.push(p.lhs);
  const rows = order.map((A) => {
    const alts = [...st.prods.filter((p) => p.lhs === A).map((p) => ({ ...p, cls: [p.mark === "new" && "new", !okRule(p, nts, st.start) && "todo", st.focus === `${p.lhs}\u0000${p.rhs.join("\u0001")}` && "focus"] })),
      ...st.removed.filter((p) => p.lhs === A).map((p) => ({ ...p, cls: ["gone"] }))];
    if (!alts.length) return null;
    return h("div", { class: "cnf-rule" }, h("span", { class: "cnf-lhs" }, A), h("span", { class: "cnf-arrow", "aria-hidden": "true" }, "→"),
      h("span", { class: "cnf-alts" }, alts.map((a) => h("span", { class: ["cnf-alt", ...a.cls].filter(Boolean).join(" "), title: a.cls.includes("gone") ? "removed in this step" : a.cls.includes("new") ? "added in this step" : null }, a.rhs.length ? a.rhs.join(" ") : EPS))));
  }).filter(Boolean);
  return h("div", { class: "cnf-grammar", role: "list", "aria-label": "Grammar at this step" }, rows.length ? rows : h("p", { class: "muted" }, "No rules left: the language is empty."));
}

function phaseRibbon(phase) {
  const at = PHASES.findIndex(([p]) => p === phase), done = phase === "done";
  return h("ol", { class: "cnf-phases" }, PHASES.map(([p, label], i) => h("li", { class: done || i < at ? "done" : i === at ? "on" : null }, h("b", null, p), h("span", null, label))));
}

const showLang = (set) => [...set].sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((w) => (w ? w.replace(/ /g, "") : EPS));

export function render(root) {
  const p = readParams();
  const state = { g: p.get("g") ?? EXAMPLES.sipser.text, w: p.get("w") ?? EXAMPLES.sipser.input };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "CFG to Chomsky normal form",
    lede: "Turn any context-free grammar into Chomsky normal form one change at a time, with the rules being added and removed right in front of you.",
    theory: h("div", null,
      h("p", null, "A grammar is in ", h("b", null, "Chomsky normal form"), " (CNF) when every rule is A → B C (two variables) or A → a (one terminal). Parse trees are then binary, a string of length n always takes exactly 2n − 1 steps to derive, and the CYK algorithm can decide membership in O(n³) time."),
      h("ol", null,
        h("li", null, h("b", null, "START"), ": add S0 → S, so the start symbol is never on a right-hand side."),
        h("li", null, h("b", null, "DEL"), ": find the nullable variables (those that can derive ε). For each rule, add a copy with each combination of nullable symbols left out, then delete the ε-rules."),
        h("li", null, h("b", null, "UNIT"), ": a unit rule A → B just renames. Find every unit pair (A, B), give A all of B's real bodies, then delete the unit rules."),
        h("li", null, h("b", null, "USELESS"), ": delete variables that can never finish (non-generating), then those that can never be reached from S0. This order matters: removing the first kind can create more of the second."),
        h("li", null, h("b", null, "TERM"), ": in bodies of length 2 or more, replace each terminal a by a new variable Tₐ with Tₐ → a."),
        h("li", null, h("b", null, "BIN"), ": split A → X1 X2 … Xk into a chain of two-symbol rules using new variables.")),
      h("p", null, "Doing DEL before UNIT matters: removing ε-rules can create new unit rules (S → A S A with A nullable gives S → S). ", h("b", null, "Greibach normal form"), " (every rule A → a α) is the other classic normal form; it isn't shown here.")),
    conventions: [
      "If ε is in the language, S0 → ε is kept: the one ε-rule CNF allows, as in Sipser. CYK is run without it.",
      "New variables: S0 for the start, Tₐ (written Ta, T+, …) for a terminal a, and X1, X2, … for the tails of long bodies. Identical tails share one variable.",
      "Green pills were just added, struck-through red ones were just removed, and dashed pills aren't in CNF form yet.",
      "One rule per line, alternatives with |, ε for the empty string. The first variable is the start symbol.",
    ],
  });
  const gIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const wIn = h("input", { type: "text", class: "mono", value: state.w, "aria-label": "String to test with CYK", oninput: (e) => { state.w = e.target.value; update(); } });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ g: state.g, w: state.w });
    let g, res;
    try { g = parseGrammar(state.g); res = toCNF(g); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(CODE), vars = varsPanel();
    const ribbon = h("div"), box = h("div", { class: "cnf-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1500,
      render: (i) => {
        const st = res.steps[i];
        ribbon.replaceChildren(phaseRibbon(st.phase));
        box.replaceChildren(grammarView(st));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.phase === "done" ? " good" : ""}`;
      },
    });
    const final = res.grammar, cykG = withoutEmpty(final), finalText = toText(final);
    const ab = g.terminals.length, n = ab <= 3 ? 4 : ab <= 6 ? 3 : 2;
    let check = null;
    try {
      const before = languageUpTo(g, n), after = languageUpTo(final, n);
      const same = before.size === after.size && [...before].every((w) => after.has(w));
      const list = showLang(before);
      check = notice(same ? "good" : "bad", `${same ? "✓" : "✗"} Up to length ${n}, both grammars generate the same ${before.size} string${before.size === 1 ? "" : "s"}${list.length ? `: ${list.slice(0, 14).join(", ")}${list.length > 14 ? ", …" : ""}` : ""}.`);
    } catch { check = null; }
    const cykLink = cykG.prods.length ? `/cyk-parsing?g=${encodeURIComponent(toText(cykG))}&w=${encodeURIComponent(state.w)}` : null;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Conversion"), player.el, ribbon, note,
        traceLayout(box, code, vars),
        h("div", { class: "stats-row" }, stat("Rules before", g.prods.length), stat("Rules after", final.prods.length), stat("Variables", `${g.nonterminals.length} → ${final.nonterminals.length}`), stat("Nullable", res.nullable.length ? res.nullable.join(", ") : "none", true))),
      h("section", { class: "card" }, h("h2", null, "Chomsky normal form"),
        h("pre", { class: "grammar-box" }, finalText || `${res.S0} has no rules: the language is empty.`),
        check,
        h("label", { class: "stack" }, "Test a string with CYK", wIn),
        cykLink ? h("p", null, h("a", { href: cykLink }, "Run CYK on this grammar →"), final.prods.length !== cykG.prods.length ? h("span", { class: "muted small" }, ` (without ${res.S0} → ε, since CYK only handles non-empty strings)`) : null, " · ", h("a", { href: `/pushdown-automata?mode=cfg&g=${encodeURIComponent(state.g)}&w=${encodeURIComponent(state.w)}` }, "Turn the original into a PDA →")) : null));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.g = ex.text; state.w = ex.input; gIn.value = ex.text; wIn.value = ex.input; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Grammar", gIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    const shell = (...body) => practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
    if (kind < 0.4) {
      // Which variables are nullable?
      let g, res;
      for (let k = 0; k < 30; k++) {
        const nts = ["S", "A", "B", "C"], pickS = (xs) => xs[Math.floor(r() * xs.length)];
        g = parseGrammar(nts.map((A) => `${A} -> ${[pickS(["a", "b"]), ...Array.from({ length: 1 + Math.floor(r() * 2) }, () => Array.from({ length: 1 + Math.floor(r() * 2) }, () => pickS(["a", "b", ...nts])).join(" ")), ...(r() < 0.35 ? ["ε"] : [])].join(" | ")}`).join("\n"));
        res = toCNF(g);
        if (res.nullable.length && res.nullable.length < 4) break;
      }
      const truth = new Set(res.nullable.filter((A) => A !== res.S0)), picked = new Set(), feedback = h("div");
      shell(h("h2", null, "Which variables are nullable?"), h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
        h("p", { class: "muted" }, "A variable is nullable if it can derive ε, directly or through other nullable variables. Select them all."),
        h("div", { class: "row" }, g.nonterminals.map((A) => h("button", { type: "button", class: "btn ghost toggle mono", "aria-pressed": "false", onclick: (e) => { picked.has(A) ? picked.delete(A) : picked.add(A); e.currentTarget.setAttribute("aria-pressed", String(picked.has(A))); } }, A))),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = picked.size === truth.size && [...truth].every((A) => picked.has(A));
          feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} Nullable: {${[...truth].join(", ")}}. ${res.steps.filter((s) => s.line === 2 && s.vars.nullable !== "∅" && !s.note.startsWith(`${res.S0} `)).map((s) => s.note).join(" ")}`));
        } }, "Check")), feedback);
    } else if (kind < 0.75) {
      const nts = ["S", "A", "B"], start = "S";
      const shapes = [
        [{ lhs: "A", rhs: ["B", "S"] }, false, "S is the start symbol, and in CNF (as Sipser defines it) the start symbol may not appear on a right-hand side: that is why S0 is added."],
        [{ lhs: "A", rhs: ["A", "B"] }, true, "Two variables: allowed."],
        [{ lhs: "B", rhs: ["a"] }, true, "A single terminal: allowed."],
        [{ lhs: "A", rhs: ["a", "B"] }, false, "A terminal in a body of length two: TERM would replace a by Ta."],
        [{ lhs: "A", rhs: ["B"] }, false, "A unit rule: UNIT removes these."],
        [{ lhs: "B", rhs: [] }, false, "Only the start symbol may derive ε directly."],
        [{ lhs: "A", rhs: ["A", "B", "A"] }, false, "Three symbols: BIN would split it into A → A X1, X1 → B A."],
        [{ lhs: "S", rhs: [] }, true, "S is the start symbol and never appears on a right-hand side here, so S → ε is the one ε-rule allowed."],
      ];
      const [rule, ok, why] = shapes[Math.floor(r() * shapes.length)];
      shell(h("h2", null, "Is this rule allowed in Chomsky normal form?"), h("p", { class: "grammar-box" }, showProd(rule)),
        h("p", { class: "muted" }, `Variables: ${nts.join(", ")} (start symbol ${start}, which appears on no right-hand side except where shown). Terminals: a, b.`),
        choice([{ label: "Yes, it's in CNF", correct: ok }, { label: "No", correct: !ok }], why));
    } else {
      const k = 3 + Math.floor(r() * 4), body = Array.from({ length: k }, (_, i) => "ABCDEF"[i]);
      shell(h("h2", null, `How many new variables does BIN need for S → ${body.join(" ")}?`),
        h("p", { class: "muted" }, "Assume no other rule shares a tail with it."),
        numberQuestion(k - 2, `A body of ${k} symbols becomes ${k - 1} two-symbol rules, which needs ${k - 2} new variables: S → A X1, ${body.slice(1, -2).map((s, i) => `X${i + 1} → ${s} X${i + 2}`).concat(`X${k - 2} → ${body.at(-2)} ${body.at(-1)}`).join(", ")}.`));
    }
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
