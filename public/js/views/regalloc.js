import { def, randomTac, uses } from "../engines/optimise.js";
import { analyse, chromatic, colour, COLOUR_CODE, EXAMPLES, GRAPH_CODE, LIVE_CODE, rewrite } from "../engines/regalloc.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const fmt = (xs) => (xs.length ? `{${xs.join(", ")}}` : "∅");
const colourVar = (c) => `--c:var(--series-${(c % 8) + 1})`;

// The interference graph: nodes on a circle, drawn once and then restyled
// step by step so fades and colour changes animate.
function graphSvg(vars, edges) {
  const n = vars.length, R = Math.max(80, n * 20), pad = 34, W = 2 * R + pad * 2;
  const pos = new Map(vars.map((v, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return [v, { x: pad + R + R * Math.cos(a), y: pad + R + R * Math.sin(a) }];
  }));
  const edgeEls = new Map(), nodeEls = new Map();
  const lines = edges.map((e) => {
    const a = pos.get(e.a), b = pos.get(e.b);
    const el = h("line", { x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1), class: "ra-edge" }, h("title", null, `${e.a} interferes with ${e.b}`));
    edgeEls.set([e.a, e.b].sort().join("|"), el);
    return el;
  });
  const nodes = vars.map((v) => {
    const p = pos.get(v);
    const el = h("g", { class: "ra-node" }, h("title", null, v),
      h("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: Math.max(17, v.length * 4.5 + 9) }),
      h("text", { x: p.x.toFixed(1), y: (p.y + 4.5).toFixed(1), "text-anchor": "middle" }, v),
      h("text", { x: p.x.toFixed(1), y: (p.y + 34).toFixed(1), "text-anchor": "middle", class: "ra-reg" }, ""));
    nodeEls.set(v, el);
    return el;
  });
  const el = h("svg", { viewBox: `0 0 ${W.toFixed(0)} ${(W + 10).toFixed(0)}`, class: "diagram ra-graph", role: "img", "aria-label": `Interference graph: ${vars.length} variables, ${edges.length} edges.`, style: `max-width:${Math.max(W * 1.1, 220).toFixed(0)}px` }, lines, nodes);
  return {
    el,
    // edgesOn: keys present; fresh: keys just added; node styling per variable.
    show({ edgesOn = null, fresh = [], gone = new Set(), cur = null, colours = {}, spilled = [], potential = [], highlight = [] }) {
      const fr = new Set(fresh), hi = new Set(highlight);
      for (const [k, line] of edgeEls) {
        const [a, b] = k.split("|");
        line.setAttribute("class", ["ra-edge", edgesOn && !edgesOn.has(k) && "hidden", fr.has(k) && "fresh", (gone.has(a) || gone.has(b)) && "faded"].filter(Boolean).join(" "));
      }
      for (const [v, g] of nodeEls) {
        const c = colours[v];
        g.setAttribute("class", ["ra-node", gone.has(v) && "gone", c != null && "col", spilled.includes(v) && "spill", potential.includes(v) && c == null && !spilled.includes(v) && "maybe", v === cur && "cur", hi.has(v) && "hi"].filter(Boolean).join(" "));
        g.setAttribute("style", c != null ? colourVar(c) : "");
        g.lastChild.textContent = c != null ? `R${c + 1}` : spilled.includes(v) ? "spill" : "";
      }
    },
  };
}

const edgeKey = (e) => [e.a, e.b].sort().join("|");

function liveTable(a, { hot = null } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse ra-ranges" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "#"), h("th", { scope: "col" }, "Instruction"), a.vars.map((v) => h("th", { scope: "col" }, v)))),
    h("tbody", null, a.rows.map((r, k) => h("tr", { class: k === hot ? "hot" : null },
      h("th", { scope: "row" }, `${r.block === a.rows[k - 1]?.block ? "" : `${r.block} `}(${r.num})`),
      h("td", { class: "left" }, r.text),
      a.vars.map((v) => {
        const live = r.after.includes(v), d = def(r.ins) === v, u = uses(r.ins).includes(v);
        return h("td", { class: [live && "live", (r.before.includes(v)) && "live-in"].filter(Boolean).join(" ") || null, title: `${v} ${live ? "is live" : "is dead"} after (${r.num})` }, d ? "def" : u ? "use" : "");
      }))))));
}

function blockTable(a, st) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, ["Block", "use", "def", "OUT", "IN"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, a.cfg.blocks.map((b) => {
      const on = st.block === b.id;
      return h("tr", { class: on ? "hot" : null }, h("th", { scope: "row" }, b.id),
        h("td", { class: "left" }, fmt(a.live.ud[b.id].use)), h("td", { class: "left" }, fmt(a.live.ud[b.id].def)),
        h("td", { class: "left" }, fmt(st.OUT[b.id])),
        h("td", { class: `left${on && st.grew?.length ? " added" : ""}` }, fmt(st.IN[b.id])));
    }),
    h("tr", null, h("th", { scope: "row" }, "EXIT"), h("td", { colspan: 3 }, ""), h("td", { class: "left" }, fmt(a.cfg.liveExit))))));
}

function flowGraph(a, active) {
  const used = new Set(a.cfg.edges.flatMap((e) => [e.from, e.to]));
  const states = [{ id: "ENTRY", lines: [] }, ...a.cfg.blocks.map((b) => ({ id: b.id, lines: b.code.map((x) => a.rows.find((r) => r.ins === x)?.text ?? "") })), ...(used.has("EXIT") ? [{ id: "EXIT", lines: [] }] : [])];
  return stateDiagram({ states, edges: a.cfg.edges, start: "ENTRY", shape: "box", active: active ? [active] : [], aria: "Flow graph" });
}

export function render(root) {
  const p = readParams();
  const state = { src: p.get("src") ?? EXAMPLES.appel.text, k: Math.min(8, Math.max(1, Number(p.get("k")) || EXAMPLES.appel.k)) };
  let players = [];
  const head = page({
    subject: "Compiler design", title: "Register allocation",
    lede: "Which variables can share a register? Liveness analysis, the interference graph, then graph colouring with k registers, spilling when it has to.",
    theory: h("div", null,
      h("p", null, "A variable is ", h("b", null, "live"), " at a point if its current value may still be read later. Liveness flows backwards: IN[B] = use[B] ∪ (OUT[B] − def[B]) and OUT[B] is the union of IN over B's successors. Start from empty sets and repeat until nothing changes (a ", h("b", null, "fixed point"), ")."),
      h("p", null, "Two variables ", h("b", null, "interfere"), " if one is defined while the other is live: they hold values at the same time, so they need different registers. That gives the ", h("b", null, "interference graph"), ", and allocating k registers is colouring it with k colours."),
      h("p", null, "Colouring is NP-hard, so compilers use Chaitin's heuristic. ", h("b", null, "Simplify"), ": a node with fewer than k neighbours can always be coloured, so remove it and push it on a stack. If every node has k or more, pick one as a ", h("b", null, "potential spill"), " and push it anyway. ", h("b", null, "Select"), ": pop nodes, giving each the lowest colour its neighbours don't use. A node with no free colour is an ", h("b", null, "actual spill"), ": it lives in memory instead.")),
    conventions: ["Write three-address code as in Code optimisation; live: x y names what is live at the end (default: every non-temporary, or nothing after a return).", "For a copy x = y, x and y don't interfere because of it (they may share a register). Variables live on entry all interfere.", "Simplify takes the first node, in order of appearance, with fewer than k neighbours. The potential spill is the node with the most neighbours (ties: fewest uses and definitions)."],
  });

  const srcIn = h("textarea", { rows: 8, class: "mono", "aria-label": "Three-address code", oninput: (e) => { state.src = e.target.value; update(); } }, state.src);
  const kSel = h("select", { "aria-label": "Number of registers k", onchange: (e) => { state.k = Number(e.target.value); update(); } }, Array.from({ length: 8 }, (_, i) => h("option", { value: i + 1, selected: i + 1 === state.k }, `k = ${i + 1} register${i ? "s" : ""}`)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ src: state.src, k: state.k });
    kSel.value = String(state.k);
    let a;
    try { a = analyse(state.src); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    if (a.vars.length > 16) { msg.replaceChildren(notice("error", "Use at most 16 variables so the graph stays readable.")); out.replaceChildren(); return; }
    msg.replaceChildren();

    // 1. Liveness.
    const tab1 = h("div"), flow1 = h("div", { class: "chart-wrap" }), note1 = h("p", { class: "step-note", "aria-live": "polite" });
    const code1 = codePanel(LIVE_CODE), vars1 = varsPanel();
    const p1 = stepper({
      count: a.liveSteps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = a.liveSteps[i];
        tab1.replaceChildren(blockTable(a, st));
        morph(flow1, flowGraph(a, st.block));
        code1.show(st.line); vars1.show(st.vars);
        note1.textContent = st.note;
        note1.className = `step-note${st.done ? " good" : ""}`;
      },
    });

    // 2. Live ranges and the interference graph.
    const g2 = graphSvg(a.vars, a.edges), ranges = h("div"), note2 = h("p", { class: "step-note", "aria-live": "polite" });
    const code2 = codePanel(GRAPH_CODE), vars2 = varsPanel();
    const p2 = stepper({
      count: a.graphSteps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = a.graphSteps[i];
        ranges.replaceChildren(liveTable(a, { hot: st.row }));
        const row = st.row != null ? a.rows[st.row] : null;
        g2.show({ edgesOn: new Set(st.edges.map(edgeKey)), fresh: st.added.map((y) => [st.x, y].sort().join("|")), cur: st.x, highlight: row ? row.after : [] });
        code2.show(st.line); vars2.show(st.vars);
        note2.textContent = st.note;
        note2.className = `step-note${st.done ? " good" : ""}`;
      },
    });

    // 3. Colouring.
    const res = colour(a.vars, a.edges, state.k, a.rows);
    const g3 = graphSvg(a.vars, a.edges), stackBox = h("div", { class: "ra-stack", "aria-label": "Stack, top first" }), note3 = h("p", { class: "step-note", "aria-live": "polite" });
    const code3 = codePanel(COLOUR_CODE), vars3 = varsPanel();
    let shown = 0;
    const p3 = stepper({
      count: res.steps.length, label: "Step", interval: 1000,
      render: (i) => {
        const st = res.steps[i];
        g3.show({ gone: new Set(st.removed), cur: st.node, colours: st.colours, spilled: st.spilled, potential: st.potential });
        stackBox.replaceChildren(h("span", { class: "ra-stack-label" }, "stack"), ...st.stack.map((s, k) => h("span", { class: [s.spill && "maybe", k >= shown && k === st.stack.length - 1 && "push"].filter(Boolean).join(" ") || null }, s.v)));
        shown = st.stack.length;
        code3.show(st.line); vars3.show(st.vars);
        note3.textContent = st.note;
        note3.className = `step-note${st.done ? (st.spilled.length ? " bad" : " good") : st.phase === "spill" || st.phase === "spilled" ? " warn" : ""}`;
      },
    });
    players.push(p1, p2, p3);
    const chi = a.vars.length <= 10 ? chromatic(a.vars, a.edges) : null;
    const rw = rewrite(a.rows, res.colours);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "1. Liveness analysis"), p1.el, note1,
        traceLayout(h("div", null, tab1, h("h3", { class: "small muted ra-gap" }, "Flow graph (the block being worked on is highlighted)"), flow1), code1, vars1),
        h("div", { class: "stats-row" }, stat("Blocks", a.cfg.blocks.length), stat("Passes", a.live.rounds.length), stat("Live at the end", fmt(a.cfg.liveExit), true))),
      h("section", { class: "card" }, h("h2", null, "2. Live ranges and the interference graph"), p2.el, note2,
        traceLayout(h("div", null, h("div", { class: "chart-wrap ra-graph-wrap" }, g2.el), ranges, h("p", { class: "muted small" }, "Shaded cells: the variable is live just after that instruction. Highlighted nodes are live after the current definition.")), code2, vars2),
        h("div", { class: "stats-row" }, stat("Variables", a.vars.length), stat("Edges", a.edges.length), stat("Most neighbours", Math.max(0, ...a.vars.map((v) => a.edges.filter((e) => e.a === v || e.b === v).length))), chi != null ? stat("Registers needed", chi) : null)),
      h("section", { class: "card" }, h("h2", null, `3. Colouring with k = ${state.k}`), h("div", { class: "row" }, kSel), p3.el, note3,
        traceLayout(h("div", { class: "ra-colour" }, h("div", { class: "chart-wrap ra-graph-wrap" }, g3.el), stackBox), code3, vars3),
        h("div", { class: "stats-row" }, stat("Registers used", res.used), stat("Spilled", res.spilled.length ? res.spilled.join(", ") : "none", true), chi != null ? stat("Fewest possible", chi) : null)),
      h("div", { class: "grid-2" },
        h("section", { class: "card" }, h("h2", null, "Assignment"),
          h("div", { class: "ra-assign" }, a.vars.map((v) => h("span", { style: res.colours[v] != null ? colourVar(res.colours[v]) : null, class: res.colours[v] != null ? "col" : "spill" }, h("b", null, v), res.colours[v] != null ? `R${res.colours[v] + 1}` : "memory")))),
        h("section", { class: "card" }, h("h2", null, "Code with registers"),
          h("ol", { class: "prod-list code-list" }, rw.map((r) => h("li", null, h("b", null, `(${r.num})`), r.text))),
          res.spilled.length ? h("p", { class: "muted small" }, `${res.spilled.join(", ")} stay in memory: a real compiler would insert a load before each use and a store after each definition, then allocate again.`) : null)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.src = ex.text; state.k = ex.k; srcIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Three-address code", srcIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    let a, src;
    const fresh = () => {
      for (let t = 0; t < 40; t++) {
        src = `${randomTac(r, { n: 4 + Math.floor(r() * 3), consts: false })}\nlive: x y`;
        a = analyse(src);
        if (a.vars.length >= 4 && a.vars.length <= 7 && a.edges.length >= 3) return;
      }
    };
    fresh();
    const codeBox = h("ol", { class: "prod-list code-list" }, a.rows.map((row) => h("li", null, h("b", null, `(${row.num})`), row.text)));
    let body;
    if (kind < 0.33) {
      const g = graphSvg(a.vars, a.edges);
      g.show({});
      const chi = chromatic(a.vars, a.edges);
      body = [h("h2", null, "How many registers does this interference graph need, with no spills?"), h("div", { class: "chart-wrap ra-graph-wrap" }, g.el),
        numberQuestion(chi, `The graph can be coloured with ${chi} colours but not ${chi - 1}${chi > 2 ? " (look for a group of mutually joined variables)" : ""}. That's its chromatic number.`)];
    } else if (kind < 0.66) {
      const row = a.rows[Math.floor(r() * (a.rows.length - 1))];
      const picked = new Set(), feedback = h("div");
      body = [h("h2", null, `Which variables are live just after instruction (${row.num})?`), codeBox, h("p", { class: "muted" }, "x and y are live at the end. Select every live variable (none is a valid answer)."),
        h("div", { class: "row" }, a.vars.map((v) => h("button", { type: "button", class: "btn ghost toggle mono small", "aria-pressed": "false", onclick: (e) => {
          picked.has(v) ? picked.delete(v) : picked.add(v);
          e.currentTarget.setAttribute("aria-pressed", String(picked.has(v)));
        } }, v))),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = row.after.length === picked.size && row.after.every((x) => picked.has(x));
          feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} Live after (${row.num}): ${fmt(row.after)}. Scan backwards from the end: a use makes a variable live, a definition kills it.`));
        } }, "Check")), feedback];
    } else {
      let k = 2, deg;
      for (let t = 0; t < 40; t++) {
        deg = (v) => a.edges.filter((e) => e.a === v || e.b === v).length;
        k = 2 + Math.floor(r() * 2);
        if (a.vars.some((v) => deg(v) < k) && a.vars.filter((v) => deg(v) >= k).length >= 2) break;
        fresh();
      }
      if (!a.vars.some((v) => deg(v) < k)) k = Math.min(...a.vars.map(deg)) + 1;
      const easy = a.vars.filter((v) => deg(v) < k), hard = a.vars.filter((v) => deg(v) >= k);
      const right = easy[Math.floor(r() * easy.length)];
      const g = graphSvg(a.vars, a.edges);
      g.show({});
      const opts = [right, ...hard.slice(0, 3)].map((v) => ({ label: v, correct: easy.includes(v) && v === right })).sort(() => r() - 0.5);
      body = [h("h2", null, `With k = ${k} registers, which node can be simplified (pushed on the stack) straight away?`), h("div", { class: "chart-wrap ra-graph-wrap" }, g.el),
        choice(opts, `${right} has ${deg(right)} neighbour${deg(right) === 1 ? "" : "s"}, fewer than ${k}, so it is safe to remove: whatever colours its neighbours get, one is left for it. ${hard.slice(0, 3).map((v) => `${v} has ${deg(v)}`).join(", ")}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
