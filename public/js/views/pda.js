import { CODE, EPS, EXAMPLES, GRAMMARS, grammarToPda, moveLabel, parsePDA, showPush, simulate, tokenizeInput } from "../engines/pda.js";
import { parseGrammar, showProd } from "../engines/grammar.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram, treeDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, inputStrip, mountTabs, numberQuestion, randomString, stat } from "./kit.js";
import { viewToggle } from "../three-kit.js";

const SLOT = 34, SHOWN = 14;

// The stack, bottom at the bottom. Items keep the id they were pushed with, so
// between neighbouring configurations kept items stay put, pushed ones pop in
// and a popped one floats away.
function stackSvg(c, prev) {
  const items = c.stack, n = Math.min(items.length, SHOWN), hidden = items.length - n;
  const popped = prev && c.via.pop !== EPS ? prev.stack[0] : null;
  const slots = Math.max(n, prev ? Math.min(prev.stack.length, SHOWN) : 0, 4);
  const W = 150, H = slots * SLOT + 46, x = 34, w = 82;
  const y = (fromBottom) => H - 12 - (fromBottom + 1) * SLOT;
  const els = [h("line", { x1: x - 8, x2: x + w + 8, y1: H - 9, y2: H - 9, class: "pda-floor" }),
    h("path", { d: `M${x - 6},${y(slots - 1) - 6} V${H - 9} M${x + w + 6},${y(slots - 1) - 6} V${H - 9}`, class: "pda-walls" })];
  const kept = new Set(prev ? prev.stack.map((s) => s.u) : []);
  items.slice(0, n).forEach((it, i) => {
    const yy = y(n - 1 - i);
    els.push(h("g", { class: `pda-item${i === 0 ? " top" : ""}${prev && !kept.has(it.u) ? " pushed" : ""}`, "data-k": `s:${it.u}`, "data-x": x, "data-y": yy },
      h("rect", { x, y: yy, width: w, height: SLOT - 4, rx: 6 }),
      h("text", { x: x + w / 2, y: yy + SLOT / 2 + 3, "text-anchor": "middle" }, it.s)));
  });
  if (popped) {
    const yy = y(Math.min(prev.stack.length, SHOWN) - 1);
    els.push(h("g", { class: "pda-item gone" }, h("rect", { x, y: yy, width: w, height: SLOT - 4, rx: 6 }), h("text", { x: x + w / 2, y: yy + SLOT / 2 + 3, "text-anchor": "middle" }, popped.s)));
  }
  if (n) els.push(h("text", { x: x + w + 12, y: y(n - 1) + SLOT / 2 + 2, class: "pda-top-label" }, "← top"));
  else els.push(h("text", { x: x + w / 2, y: H - 22, "text-anchor": "middle", class: "pda-empty" }, "empty"));
  if (hidden) els.push(h("text", { x: x + w / 2, y: H + 4, "text-anchor": "middle", class: "pda-empty" }, `+ ${hidden} more below`));
  return h("svg", { viewBox: `0 0 ${W} ${H + (hidden ? 10 : 0)}`, class: "pda-stack", role: "img", "aria-label": `Stack, top first: ${items.map((s) => s.s).join(" ") || "empty"}` }, els);
}

// The configuration tree as it stands after BFS step i. Big trees show only the
// branch around the current configuration.
function configTree(res, i, expandedAt) {
  const st = res.steps[i], created = st.created;
  let include = null;
  if (created > 60) {
    include = new Set();
    const focus = st.cur ?? res.path.at(-1);
    for (let id = focus; id != null; id = res.configs[id].parent) {
      include.add(id);
      for (const k of res.configs[id].kids) if (k < created) include.add(k);
    }
  }
  const label = (c) => `(${c.state}, ${res.rest(c.pos)}, ${res.stackText(c.stack)})`;
  const build = (c) => {
    const done = expandedAt.has(c.id) && expandedAt.get(c.id) <= i;
    const state = c.id === res.acceptId && done ? "matched" : c.dead && done ? "error" : done ? "expanded" : "open";
    return { id: `c${c.id}`, label: label(c), state, kids: c.kids.filter((k) => k < created && (!include || include.has(k))).map((k) => build(res.configs[k])) };
  };
  return { tree: treeDiagram(build(res.configs[0]), { lit: st.cur != null ? [`c${st.cur}`] : [], gapY: 56, aria: `Configuration tree with ${created} configurations` }), partial: !!include };
}


export function render(root) {
  const p = readParams();
  const state = {
    mode: p.get("mode") === "cfg" ? "cfg" : "pda",
    pda: p.get("pda") ?? EXAMPLES.wwr.text,
    g: p.get("g") ?? GRAMMARS.expr.text,
    w: p.get("w") ?? (p.get("mode") === "cfg" ? GRAMMARS.expr.input : EXAMPLES.wwr.input),
  };
  let players = [];
  // Optional 3D view of the replayed branch: loaded only when chosen, rebuilt when the inputs change.
  let d3 = null, gen = 0, live = null;
  const drop3d = () => { gen++; d3?.dispose(); d3 = null; };
  const toggle = viewToggle("pushdown-automata", () => mount3d());
  async function mount3d() {
    drop3d();
    if (!live) return;
    const my = gen, { host, flat, pair } = live, mode = toggle.mode, on = mode !== "2d";
    host.hidden = !on;
    for (const el of flat) el.hidden = mode === "3d";
    pair.classList.toggle("both", mode === "both");
    if (!on) { host.replaceChildren(); return; }
    try {
      const { pdaScene } = await import("./pda-3d.js");
      const sc = await pdaScene(host, { ...live.args, height: matchMedia("(max-width: 600px)").matches ? 300 : 400 });
      if (my !== gen) { sc.dispose(); return; }
      d3 = sc;
      d3.show(live.player?.index ?? 0, true);
    } catch (e) { host.replaceChildren(notice("error", `3D view unavailable: ${e.message}`)); }
  }
  const head = page({
    subject: "Theory of computation", title: "Pushdown automata",
    lede: "A finite automaton with a stack. Watch a nondeterministic PDA try every choice at once, then replay the branch that accepts with the stack pushing and popping.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "pushdown automaton"), " reads its input left to right like an NFA, but it also has a stack. Each move depends on the state, the next input symbol (or ε for none) and the symbol on top of the stack; it pops that symbol and pushes a string in its place. The stack lets it count and match, so it recognises languages like aⁿbⁿ that no finite automaton can."),
      h("p", null, "A PDA is ", h("b", null, "nondeterministic"), ": in one situation it may have several moves. It accepts if ", h("i", null, "some"), " sequence of choices does. A ", h("b", null, "configuration"), " (q, x, γ) records the state, the unread input and the whole stack; simulating a PDA means exploring the tree of configurations. Here that is done breadth first, so the shortest accepting branch is found first."),
      h("p", null, "PDAs recognise exactly the ", h("b", null, "context-free languages"), ". Any grammar becomes a one-state PDA: keep the rest of a leftmost derivation on the stack, ", h("i", null, "expand"), " a variable on top by one of its rules (an ε-move), and ", h("i", null, "match"), " a terminal on top against the input. Deterministic PDAs are weaker: wwᴿ needs a guess of where the middle is, but wcwᴿ, with a marker, doesn't.")),
    conventions: [
      "One move per line: q0 a Z -> q0 AZ means in q0, reading a, with Z on top: pop Z and push AZ (A ends up on top). The pushed string is written top first.",
      "ε as the input reads nothing; ε as the pop leaves the stack alone; ε as the push pushes nothing. Separate multi-letter stack symbols with spaces.",
      "stack: Z sets the initial stack symbol. Accept by final state with accept: q2, or by empty stack with mode: empty. The grammar conversion accepts by empty stack, starting with the start symbol on the stack.",
      "The search skips configurations it has already seen, cuts branches whose stack grows past 40 symbols, and stops after 1,500 configurations.",
    ],
  });

  const modeSel = h("select", { style: "max-width:100%", "aria-label": "What to simulate", onchange: (e) => { state.mode = e.target.value; state.w = state.mode === "cfg" ? GRAMMARS.expr.input : EXAMPLES.wwr.input; wIn.value = state.w; syncInputs(); update(); } },
    h("option", { value: "pda", selected: state.mode === "pda" }, "Write a PDA"), h("option", { value: "cfg", selected: state.mode === "cfg" }, "Convert a grammar (CFG → PDA)"));
  const pdaIn = h("textarea", { rows: 8, class: "mono", "aria-label": "PDA moves", oninput: (e) => { state.pda = e.target.value; update(); } }, state.pda);
  const gIn = h("textarea", { rows: 5, class: "mono", "aria-label": "Grammar", oninput: (e) => { state.g = e.target.value; update(); } }, state.g);
  const wIn = h("input", { type: "text", class: "mono", value: state.w, "aria-label": "Input string", oninput: (e) => { state.w = e.target.value; update(); } });
  const about = h("p", { class: "muted small" });
  const pdaLabel = h("label", { class: "stack" }, "PDA", pdaIn), gLabel = h("label", { class: "stack" }, "Grammar", gIn);
  const exHolder = h("span", { style: "display:contents" });
  const msg = h("div"), out = h("div", { class: "output" });

  function syncInputs() {
    pdaLabel.hidden = state.mode !== "pda"; gLabel.hidden = state.mode !== "cfg";
    exHolder.replaceChildren(state.mode === "pda"
      ? exampleSelect(EXAMPLES, (ex) => { state.pda = ex.text; state.w = ex.input; pdaIn.value = ex.text; wIn.value = ex.input; about.textContent = ex.about; update(); }, "Load a PDA…")
      : exampleSelect(GRAMMARS, (ex) => { state.g = ex.text; state.w = ex.input; gIn.value = ex.text; wIn.value = ex.input; update(); }, "Load a grammar…"));
    exHolder.firstChild.style.maxWidth = "100%";
    about.textContent = state.mode === "pda" ? (Object.values(EXAMPLES).find((x) => x.text === state.pda)?.about ?? "") : "Each rule A → α becomes the move q ε A -> q α; each terminal a becomes q a a -> q ε.";
  }

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    drop3d();
    live = null;
    writeParams(state.mode === "pda" ? { pda: state.pda, w: state.w } : { mode: "cfg", g: state.g, w: state.w });
    let pda, g = null, conv = null, tokens, res;
    try {
      if (state.mode === "pda") pda = parsePDA(state.pda);
      else { g = parseGrammar(state.g); conv = grammarToPda(g); pda = conv.pda; }
      tokens = tokenizeInput(pda, state.w);
      res = simulate(pda, tokens, conv ? { prune: conv.prune } : {});
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    const unknown = tokens.filter((t) => !pda.inputs.includes(t));
    msg.replaceChildren(unknown.length ? notice("info", `${[...new Set(unknown)].join(", ")} never appear${unknown.length === 1 ? "s" : ""} in a move, so no branch can read past ${unknown.length === 1 ? "it" : "them"}.`) : "");
    const verdictText = res.verdict === "accept" ? "Accepted" : res.verdict === "reject" ? "Rejected" : "Gave up";

    // 1. Breadth-first search over configurations.
    const expandedAt = new Map(res.steps.map((s, i) => [s.cur, i]).filter(([c]) => c != null));
    const code = codePanel(CODE), vars = varsPanel();
    const treeBox = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), partial = h("p", { class: "muted small" });
    const p1 = stepper({
      count: res.steps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = res.steps[i], t = configTree(res, i, expandedAt);
        morph(treeBox, t.tree);
        partial.textContent = t.partial ? "The tree is big, so only the branch around the current configuration is drawn." : "";
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done === "accept" ? " good" : st.done ? " bad" : ""}`;
      },
    });
    players.push(p1);

    // 2. Replay one branch with the stack animated.
    const path = res.path.map((id) => res.configs[id]);
    const pathCode = codePanel(CODE, { title: "Pseudocode (one branch)" }), pathVars = varsPanel();
    const stackBox = h("div", { class: "pda-stack-box" }), strip = h("div"), side = h("div", { class: "chart-wrap" }), note2 = h("p", { class: "step-note", "aria-live": "polite" });
    const moveList = h("ol", { class: "prod-list pda-moves" });
    const edges = pda.moves.map((t) => ({ from: t.from, to: t.to, label: moveLabel(t) }));
    const p2 = stepper({
      count: path.length, label: "Move", interval: 1000,
      render: (j) => {
        const c = path[j], prev = j ? path[j - 1] : null, t = c.via, last = j === path.length - 1;
        morph(stackBox, stackSvg(c, prev));
        strip.replaceChildren(inputStrip(tokens, c.pos));
        if (conv) {
          const read = tokens.slice(0, c.pos), left = c.stack.map((s) => s.s);
          side.replaceChildren(h("p", { class: "pda-form" },
            read.length ? h("span", { class: "pda-read" }, read.join(" ")) : null,
            left.length ? h("span", { class: "pda-left" }, left.join(" ")) : null,
            !read.length && !left.length ? EPS : null),
          h("p", { class: "muted small" }, "Green: input already matched. Blue: still on the stack. Together they are the sentential form of a leftmost derivation."));
        } else {
          morph(side, stateDiagram({ states: pda.states.map((id) => ({ id })), edges, start: pda.start, accept: pda.mode === "final" ? pda.accept : [], active: [c.state], lit: t ? [{ from: t.from, to: t.to }] : [], tokens: true, aria: `PDA in state ${c.state}` }));
        }
        moveList.replaceChildren(...pda.moves.map((m) => h("li", { class: t === m ? "hot" : null }, h("b", null, m.i + 1), `${m.from} ${m.input} ${m.pop} → ${m.to} ${showPush(m.push)}`)));
        let text;
        if (!t) text = `Start in (${c.state}, ${res.rest(0)}, ${res.stackText(c.stack)}).`;
        else if (conv && t.input === EPS) text = `Expand ${t.pop} by ${showProd(g.prods[t.i])}: pop ${t.pop} and push ${showPush(t.push)}. This is one step of a leftmost derivation.`;
        else if (conv) text = `Match ${t.input}: it is on top of the stack and next in the input, so read it and pop it.`;
        else text = `In ${t.from}${t.input === EPS ? " without reading anything" : `, reading ${t.input}`}${t.pop === EPS ? "" : `, with ${t.pop} on top`}: ${t.pop === EPS ? "pop nothing" : `pop ${t.pop}`}, push ${t.push.length ? showPush(t.push) : "nothing"} and go to ${t.to}.`;
        if (last) text += res.accepted ? ` The input is used up and ${pda.mode === "empty" ? "the stack is empty" : `${c.state} is accepting`}: ACCEPTED.` : ` This is as far as any branch gets${c.pos < tokens.length ? `: no move can read ${tokens[c.pos]} here` : ""}, so the input is ${res.verdict === "limit" ? "not decided within the limit" : "REJECTED"}.`;
        note2.textContent = text;
        note2.className = `step-note${last ? (res.accepted ? " good" : " bad") : ""}`;
        pathCode.show(!t ? 1 : last && res.accepted ? [6, 7, 4] : [6, 7]);
        pathVars.show({ state: c.state, read: t ? t.input : "–", pop: t ? t.pop : "–", push: t ? showPush(t.push) : "–", unread: res.rest(c.pos), "stack (top first)": res.stackText(c.stack) });
        d3?.show(j);
      },
    });
    players.push(p2);
    const stage2d = h("div", { class: "pda-stage" }, h("div", null, h("h3", { class: "small muted" }, "Stack"), stackBox), h("div", { class: "pda-side" }, h("h3", { class: "small muted" }, conv ? "Leftmost derivation so far" : "State diagram"), side));
    const host3d = h("div", { class: "d3-host", hidden: true });
    const pair = h("div", { class: "view-pair" }, stage2d, host3d);

    const sections = [
      h("section", { class: "card" }, h("h2", null, "Breadth-first search over configurations"), p1.el, note,
        traceLayout(h("div", null, treeBox, partial,
          h("div", { class: "legend-chips" }, h("span", null, h("i", { style: "--c:var(--muted)" }), "dashed: queued, not yet expanded"), h("span", null, h("i", { style: "--c:var(--bad)" }), "branch dies"), h("span", null, h("i", { style: "--c:var(--accent)" }), "accepting"))), code, vars),
        h("div", { class: "stats-row" }, stat("Configurations", res.configs.length), stat("Branch length", path.length - 1), stat("Deterministic", pda.deterministic ? "Yes" : "No"), stat("Result", verdictText))),
      h("section", { class: "card" }, h("div", { class: "d3-head" }, h("h2", null, res.accepted ? "The accepting branch, move by move" : "The branch that got furthest"), toggle.el), p2.el, strip,
        traceLayout(pair, pathCode, pathVars, null),
        note2),
    ];
    if (conv) {
      sections.push(h("section", { class: "card" }, h("h2", null, "The construction"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse trace" },
          h("thead", null, h("tr", null, ["#", "Move", "Why"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, pda.moves.map((m, k) => h("tr", null, h("td", null, k + 1), h("td", null, `δ(q, ${m.input}, ${m.pop}) ∋ (q, ${showPush(m.push)})`), h("td", null, conv.why[k].text)))))),
        h("p", { class: "muted small" }, `${g.prods.length} rule${g.prods.length === 1 ? "" : "s"} + ${g.terminals.length} terminal${g.terminals.length === 1 ? "" : "s"} = ${pda.moves.length} moves, all in one state q. The PDA accepts by empty stack, starting with ${g.start} on the stack.`),
        h("p", null, h("a", { href: `/cfg-to-cnf?g=${encodeURIComponent(state.g)}` }, "Convert this grammar to Chomsky normal form →"), " · ", h("a", { href: `/ll1-parsing?g=${encodeURIComponent(state.g)}&w=${encodeURIComponent(tokens.join(" "))}` }, "A deterministic version: LL(1) →"))));
    } else {
      sections.push(h("section", { class: "card" }, h("h2", null, "Moves"), moveList,
        h("p", { class: "muted small" }, `Accepts by ${pda.mode === "empty" ? "empty stack" : `final state (${pda.accept.join(", ")})`}. Initial stack symbol ${pda.bottom}. ${pda.deterministic ? "At most one move ever applies, so this PDA is deterministic." : "Some situations allow more than one move, so this PDA is nondeterministic."}`)));
    }
    out.replaceChildren(...sections);
    live = { host: host3d, flat: [strip, stage2d], pair, player: p2, args: { res, pda, tokens } };
    if (toggle.mode !== "2d") mount3d();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel, exHolder, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      about, pdaLabel, gLabel,
      h("label", { class: "stack" }, "Input string", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    const shell = (...body) => practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
    if (kind < 0.4) {
      const key = ["anbn", "wcwr", "wwr", "parens"][Math.floor(r() * 4)], ex = EXAMPLES[key], m = parsePDA(ex.text);
      let w;
      if (r() < 0.5) {
        const half = randomString(r, ["a", "b"], 1, 3);
        w = key === "anbn" ? "a".repeat(half.length) + "b".repeat(half.length + (r() < 0.4 ? 1 : 0)) : key === "parens" ? ["()", "(())", "()()", "(()", "())("][Math.floor(r() * 5)] : key === "wcwr" ? `${half}c${[...half].reverse().join("")}` : half + [...half].reverse().join("");
      } else w = key === "parens" ? randomString(r, ["(", ")"], 2, 6) : randomString(r, key === "wcwr" ? ["a", "b", "c"] : ["a", "b"], 2, 6);
      const res = simulate(m, tokenizeInput(m, w));
      shell(h("h2", null, `Does the ${ex.name} PDA accept "${w}"?`), h("p", { class: "muted" }, ex.about), h("pre", { class: "grammar-box" }, ex.text),
        choice([{ label: "Accept", correct: res.accepted }, { label: "Reject", correct: !res.accepted }],
          res.accepted ? `An accepting branch takes ${res.path.length - 1} moves.` : `Every branch dies: the furthest one stops after reading ${res.configs[res.path.at(-1)].pos} of ${w.length} symbols.`));
    } else if (kind < 0.75) {
      const k = 2 + Math.floor(r() * 3), j = Math.floor(r() * k);
      const prefix = "a".repeat(k) + "b".repeat(j);
      const m = parsePDA(EXAMPLES.anbn.text), res = simulate(m, [...prefix]);
      const c = res.configs[res.path.at(-1)], right = res.stackText(c.stack);
      const opts = new Set([right, "A".repeat(k + j) + "Z", "A".repeat(Math.max(0, k - j + 1)) + "Z", "Z" + "A".repeat(k - j), "A".repeat(k) + "Z"]);
      shell(h("h2", null, `The aⁿbⁿ PDA has read "${prefix}". What is on the stack, top first?`), h("pre", { class: "grammar-box" }, EXAMPLES.anbn.text),
        choice([...opts].slice(0, 4).map((o) => ({ label: o, correct: o === right })).sort(() => r() - 0.5), `Each a pushes an A and each b pops one: ${k} pushes and ${j} pops leave ${k - j} A${k - j === 1 ? "" : "s"} above Z, so the stack is ${right}.`));
    } else {
      const ex = Object.values(GRAMMARS)[Math.floor(r() * Object.keys(GRAMMARS).length)], g = parseGrammar(ex.text);
      shell(h("h2", null, "How many moves does the CFG → PDA construction make for this grammar?"), h("ul", { class: "prod-list" }, g.prods.map((pr) => h("li", null, showProd(pr)))),
        numberQuestion(g.prods.length + g.terminals.length, `One expand move per rule (${g.prods.length}) and one match move per terminal (${g.terminals.length}: ${g.terminals.join(" ")}).`));
    }
  }

  syncInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => { players.forEach((x) => x.destroy()); drop3d(); };
}
