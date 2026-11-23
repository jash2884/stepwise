import { ACTION, analyse, decodeEq, encodeEq, randomEquations, ANALYSE_CODE, binary, CHARACTERISTIC, characteristicTable, clockFF, convertFF, equationsText, excitation, FF_CODE, FLIP_FLOPS, modSequence, parseSequence, qNames, rippleCounter, RIPPLE_CODE, shiftCounter, syncCounter, SYNC_CODE } from "../engines/sequential.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { bitToggle, kmapSvg, segmented, stateDiagram, timingDiagram, traced } from "./dl-kit.js";

const MODES = [["ff", "Flip-flops"], ["convert", "Conversion"], ["sync", "Synchronous counter"], ["ripple", "Ripple counter"], ["shift", "Ring and Johnson"], ["analyse", "Analyse a circuit"]];
const TYPES = Object.entries(FLIP_FLOPS).map(([k, v]) => [k, v.name]);
const int = (v, d) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const show = (v) => (v === null ? "?" : v);

const DEFAULT_EQ = { t: [[[3, 7]], [[1, 3, 5, 7]], [[0, 1, 2, 3, 4, 5, 6, 7]]] };

function charTable(type, hot) {
  const rows = characteristicTable(type);
  const names = FLIP_FLOPS[type].inputs;
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, [...names, "Q", "Q+", "action"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, rows.map((r) => h("tr", { class: hot && r.inputs.join("") === hot.inputs.join("") && r.q === hot.q ? "hot" : null },
      r.inputs.map((x) => h("td", null, x)), h("td", null, r.q), h("td", null, show(r.qn)), h("td", { class: "left" }, ACTION[type](r.inputs)))))));
}
function excTable(type) {
  const names = FLIP_FLOPS[type].inputs;
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, ["Q", "Q+", ...names].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, [[0, 0], [0, 1], [1, 0], [1, 1]].map(([q, qn]) => h("tr", null, h("td", null, q), h("td", null, qn), excitation(type, q, qn).map((x) => h("td", null, x)))))));
}

export function render(root) {
  const p = readParams();
  const typeOf = (v, d) => (FLIP_FLOPS[v] ? v : d);
  const state = {
    mode: MODES.some(([m]) => m === p.get("mode")) ? p.get("mode") : "ff",
    t: typeOf(p.get("t"), "jk"), inp: p.get("in") ?? "10.11.00.11.01.11", q: int(p.get("q"), 0) ? 1 : 0,
    from: typeOf(p.get("from"), "d"), to: typeOf(p.get("to"), "jk"),
    seq: p.get("seq") ?? "0,1,2,3,4,5", N: int(p.get("N"), 10), tpd: int(p.get("tpd"), 10), down: p.get("down") === "1",
    kind: p.get("kind") === "johnson" ? "johnson" : "ring", bits: int(p.get("bits"), 4),
    eq: p.get("eq") ?? "", s: int(p.get("s"), 0),
  };
  if (state.mode === "analyse") state.bits = Math.min(4, Math.max(2, int(p.get("bits"), 3)));
  if (state.mode === "analyse" && !p.get("eq") && !p.get("t")) state.t = "t";
  let players = [];
  const head = page({
    subject: "Digital logic",
    title: "Sequential circuits",
    lede: "Flip-flops that change only on a clock edge, counters built from them, and how to read a circuit's state sequence. Step edge by edge with timing diagrams.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "flip-flop"), " stores one bit and changes it only at a clock edge, according to its inputs just before the edge."),
      h("ul", null,
        h("li", null, h("b", null, "SR"), ": set, reset or hold; S = R = 1 is not allowed. ", h("b", null, "JK"), ": like SR, but J = K = 1 toggles. ", h("b", null, "D"), ": Q+ = D. ", h("b", null, "T"), ": toggles when T = 1."),
        h("li", null, "The ", h("b", null, "characteristic table"), " says what happens for given inputs; the ", h("b", null, "excitation table"), " turns it round: which inputs produce a wanted change. Excitation tables plus K-maps design counters and convert one flip-flop into another."),
        h("li", null, "In a ", h("b", null, "synchronous counter"), " every flip-flop shares the clock, so all bits change together. In a ", h("b", null, "ripple (asynchronous) counter"), " each flip-flop is clocked by the one before, so a change ripples through and the delay adds up (n × tpd), which limits the clock speed."),
        h("li", null, "With n flip-flops you get up to 2^n states, so mod N needs ⌈log₂ N⌉ flip-flops. A ", h("b", null, "ring counter"), " uses n states, a ", h("b", null, "Johnson (twisted ring) counter"), " 2n."))),
    conventions: [
      "Flip-flops are positive-edge triggered here, except the ripple counter, where each stage toggles when the previous Q falls (up) or rises (down).",
      "Inputs are read just before each edge; outputs change right after it.",
      "Q2 Q1 Q0: the leftmost flip-flop is the most significant bit of the state number.",
      "SR with S = R = 1 gives an unknown output (shown as ?); in counter design it is a don't-care.",
      "Unused counter states are don't-cares when the input equations are minimised.",
      "A mod-N ripple counter resets with an asynchronous clear as soon as N appears.",
    ],
  });

  const modeBar = h("div"), inputs = h("div"), msg = h("div"), out = h("div", { class: "output" });
  const typeSel = (key, label, after = () => { drawInputs(); update(); }) => h("label", { class: "inline" }, label, h("select", { "aria-label": label, onchange: (e) => { state[key] = e.target.value; after(); } }, TYPES.map(([k, n]) => h("option", { value: k, selected: k === state[key] }, n))));
  const num = (key, label, attrs = {}) => h("label", { class: "inline" }, label, h("input", { type: "number", value: state[key], ...attrs, "aria-label": label, onchange: (e) => { state[key] = int(e.target.value, state[key]); update(); } }));

  const parseInputs = () => {
    const k = FLIP_FLOPS[state.t].inputs.length;
    return state.inp.split(".").filter(Boolean).map((c) => [...c.padEnd(k, "0").slice(0, k)].map((b) => (b === "1" ? 1 : 0)));
  };
  const setInputs = (rows) => { state.inp = rows.map((r) => r.join("")).join("."); };

  function drawInputs() {
    modeBar.replaceChildren(segmented(MODES, state.mode, (m) => { state.mode = m; if (m === "analyse") { state.bits = Math.min(4, Math.max(2, state.bits)); if (!state.eq) { state.t = "t"; state.bits = 3; } } drawInputs(); update(); }, "What to explore"));
    if (state.mode === "ff") {
      const rows = parseInputs(), names = FLIP_FLOPS[state.t].inputs;
      inputs.replaceChildren(h("div", { class: "row" }, typeSel("t", "Flip-flop"), bitToggle("Q start", state.q, (v) => { state.q = v; drawInputs(); update(); })),
        h("div", { class: "ff-grid", role: "group", "aria-label": "Inputs for each clock edge" },
          h("div", { class: "ff-col head" }, h("span", null, "edge"), names.map((n) => h("span", null, n))),
          rows.map((r, e) => h("div", { class: "ff-col" }, h("span", null, e + 1), names.map((n, j) => bitToggle(n, r[j], (v) => { rows[e][j] = v; setInputs(rows); drawInputs(); update(); }))))),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn ghost small", disabled: rows.length >= 16, onclick: () => { rows.push(names.map(() => 0)); setInputs(rows); drawInputs(); update(); } }, "+ Edge"),
          h("button", { type: "button", class: "btn ghost small", disabled: rows.length <= 1, onclick: () => { rows.pop(); setInputs(rows); drawInputs(); update(); } }, "− Edge"),
          h("button", { type: "button", class: "btn ghost small", onclick: () => { const r = rng(); setInputs(rows.map(() => names.map(() => (r() < 0.5 ? 1 : 0)))); drawInputs(); update(); } }, "Random inputs")));
    } else if (state.mode === "convert") {
      inputs.replaceChildren(h("div", { class: "row" }, typeSel("to", "Build a"), typeSel("from", "using a")));
    } else if (state.mode === "sync") {
      inputs.replaceChildren(h("div", { class: "row" },
        h("label", { class: "inline" }, "Count sequence ", h("input", { type: "text", class: "mono", size: 18, value: state.seq, "aria-label": "Count sequence", oninput: (e) => { state.seq = e.target.value; update(); } })), typeSel("t", "using")),
        h("div", { class: "row" }, [[4, false], [6, false], [8, false], [10, false], [5, true], [8, true]].map(([N, down]) => h("button", { type: "button", class: "btn ghost small", onclick: () => { state.seq = modSequence(N, down).join(","); drawInputs(); update(); } }, `mod ${N} ${down ? "down" : "up"}`)),
          h("button", { type: "button", class: "btn ghost small", onclick: () => { state.seq = "0,2,5,7"; drawInputs(); update(); } }, "0, 2, 5, 7"),
          h("button", { type: "button", class: "btn ghost small", onclick: () => { state.seq = "0,1,3,7,6,4"; drawInputs(); update(); } }, "Johnson-like")));
    } else if (state.mode === "ripple") {
      inputs.replaceChildren(h("div", { class: "row" }, num("N", "Modulus N", { min: 2, max: 64 }), num("tpd", "tpd per flip-flop (ns)", { min: 1, max: 100 }),
        h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.down, onchange: (e) => { state.down = e.target.checked; update(); } }), " count down")));
    } else if (state.mode === "shift") {
      inputs.replaceChildren(h("div", { class: "row" }, segmented([["ring", "Ring counter"], ["johnson", "Johnson counter"]], state.kind, (k) => { state.kind = k; drawInputs(); update(); }, "Counter"), num("bits", "flip-flops", { min: 2, max: 8 })));
    } else {
      const fns = decodeEq(state.eq, state.t, state.bits);
      inputs.replaceChildren(h("div", { class: "row" }, typeSel("t", "Flip-flops", () => { state.eq = ""; drawInputs(); update(); }),
        h("label", { class: "inline" }, "how many ", h("select", { "aria-label": "Number of flip-flops", onchange: (e) => { state.bits = Number(e.target.value); state.eq = ""; drawInputs(); update(); } }, [2, 3, 4].map((b) => h("option", { value: b, selected: b === state.bits }, b)))),
        num("s", "start state", { min: 0, max: 15 }),
        h("button", { type: "button", class: "btn ghost small", onclick: () => { state.eq = encodeEq(randomEquations(rng(), state.t, state.bits), state.bits); drawInputs(); update(); } }, "Random circuit")),
        fns ? null : h("p", { class: "muted small" }, "Showing a sample circuit. Press Random circuit for another one."));
    }
  }

  function update() {
    players.forEach((x) => x.destroy()); players = [];
    msg.replaceChildren();
    try {
      if (state.mode === "ff") {
        writeParams({ mode: "ff", t: state.t, in: state.inp, q: state.q });
        const seq = parseInputs();
        const r = clockFF(state.t, seq, state.q);
        const names = FLIP_FLOPS[state.t].inputs;
        const rowsFor = (upto) => [
          ...names.map((n, j) => ({ name: n, kind: "cycle", values: seq.map((v) => v[j]) })),
          { name: "Q", kind: "edge", initial: state.q, values: r.rows.map((x) => x.qn) },
          { name: "Q'", kind: "edge", initial: 1 - state.q, values: r.rows.map((x) => (x.qn === null ? null : 1 - x.qn)) },
        ].map((x) => ({ ...x, upto }));
        const t = traced(r.steps, FF_CODE, (s) => h("div", null,
          timingDiagram(seq.length, rowsFor(s.edge + 1), { upto: s.edge + 1, cursor: s.edge >= 0 ? s.edge : null }),
          h("h3", null, `${FLIP_FLOPS[state.t].name} characteristic table`), charTable(state.t, s.edge >= 0 ? r.rows[s.edge] : null)), { interval: 1000 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${FLIP_FLOPS[state.t].name} flip-flop over ${seq.length} clock edges`), t.el,
          h("div", { class: "stats-row" }, stat("Characteristic equation", CHARACTERISTIC[state.t], true), stat("Q sequence", r.rows.map((x) => show(x.qn)).join(" "), true))),
          h("section", { class: "card" }, h("h2", null, "Excitation table"), h("p", { class: "muted small" }, "Read it backwards: to make Q go from the left column to Q+, set the inputs like this (X = either)."), excTable(state.t)));
      } else if (state.mode === "convert") {
        writeParams({ mode: "convert", from: state.from, to: state.to });
        const r = convertFF(state.from, state.to);
        const yN = FLIP_FLOPS[state.to].inputs, xN = FLIP_FLOPS[state.from].inputs;
        const code = [`for each combination of ${yN.join(", ")} and Q`, `  Q+ ← what a ${FLIP_FLOPS[state.to].name} flip-flop would do`, `  ${xN.join(", ")} ← excitation of ${FLIP_FLOPS[state.from].name} for Q → Q+`, `minimise each of ${xN.join(", ")} with a K-map  // X rows are don't-cares`, `wire that logic in front of the ${FLIP_FLOPS[state.from].name} flip-flop`];
        const steps = r.rows.map((row, i) => ({ upto: i, line: [1, 2, 3], vars: { ...Object.fromEntries(yN.map((n, j) => [n, row.inputs[j]])), Q: row.q, "Q+": show(row.qn), ...Object.fromEntries(xN.map((n, j) => [n, row.need[j]])) },
          note: row.qn === null ? `${yN.map((n, j) => `${n}=${row.inputs[j]}`).join(", ")} is not allowed for SR, so every input is a don't-care.` : `${yN.map((n, j) => `${n}=${row.inputs[j]}`).join(", ")}, Q=${row.q}: a ${FLIP_FLOPS[state.to].name} would go to ${row.qn}. To get ${row.q} → ${row.qn} from a ${FLIP_FLOPS[state.from].name}: ${xN.map((n, j) => `${n}=${row.need[j]}`).join(", ")}.` }));
        steps.push({ upto: r.rows.length, line: [4, 5], vars: Object.fromEntries(r.eqs.map((e) => [e.name, e.expr])), note: `Minimise: ${r.eqs.map((e) => `${e.name} = ${e.expr}`).join(", ")}.` });
        const t = traced(steps, code, (s) => h("div", null,
          h("div", { class: "table-wrap" }, h("table", { class: "parse" },
            h("thead", null, h("tr", null, [...yN, "Q", "Q+", ...xN].map((x) => h("th", { scope: "col" }, x)))),
            h("tbody", null, r.rows.map((row, i) => h("tr", { class: i === s.upto ? "hot" : null }, row.inputs.map((x) => h("td", null, x)), h("td", null, row.q),
              h("td", null, i <= s.upto ? show(row.qn) : ""), row.need.map((x) => h("td", { class: i <= s.upto ? "added" : null }, i <= s.upto ? x : ""))))))),
          s.upto >= r.rows.length ? h("div", { class: "dl-kmaps" }, r.eqs.map((e) => h("div", null, h("h3", { class: "mono" }, `${e.name} = ${e.expr}`),
            h("div", { class: "chart-wrap km-wrap" }, kmapSvg(r.vars.length, Array.from({ length: 1 << r.vars.length }, (_, m) => (e.ones.includes(m) ? 1 : e.dcs.includes(m) ? "X" : 0)), { names: r.vars, groups: e.result.chosen.map((imp, i) => ({ imp, colour: i })), showIndex: false }))))) : null), { interval: 900 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `A ${FLIP_FLOPS[state.to].name} flip-flop from a ${FLIP_FLOPS[state.from].name} flip-flop`), t.el,
          h("div", { class: "stats-row" }, r.eqs.map((e) => stat(e.name, e.expr, true)))));
      } else if (state.mode === "sync") {
        writeParams({ mode: "sync", seq: state.seq, t: state.t });
        const seq = parseSequence(state.seq);
        const r = syncCounter(seq, state.t);
        const names = r.names;
        const states = seq.map((s) => ({ id: s, label: binary(s, r.bits) }));
        const edges = seq.map((s, i) => ({ from: s, to: seq[(i + 1) % seq.length] }));
        const cycles = seq.length;
        const t = traced(r.steps, SYNC_CODE, (s) => h("div", { class: "grid-2 tight" },
          h("div", { class: "chart-wrap sd-wrap" }, stateDiagram(states, edges, { active: s.state, activeEdge: s.from !== undefined ? [s.from, s.state] : null })),
          h("div", null, h("div", { class: "ff-chain" }, names.map((n, i) => h("div", { class: `ff-box${(s.state >> (r.bits - 1 - i)) & 1 ? " one" : ""}` }, h("span", null, n), h("b", null, (s.state >> (r.bits - 1 - i)) & 1)))),
            timingDiagram(cycles, names.map((n, i) => ({ name: n, kind: "edge", initial: (seq[0] >> (r.bits - 1 - i)) & 1, values: seq.map((_, k) => (seq[(k + 1) % seq.length] >> (r.bits - 1 - i)) & 1) })), { upto: s.edge ?? 0, cursor: s.edge ? s.edge - 1 : null }))), { interval: 1000 });
        players.push(t.player);
        const inNames = FLIP_FLOPS[state.t].inputs;
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, `Counter ${seq.join(" → ")} → ${seq[0]} with ${FLIP_FLOPS[state.t].name} flip-flops`), t.el,
            h("div", { class: "stats-row" }, stat("Flip-flops", r.bits), stat("States used", `${seq.length} of ${1 << r.bits}`), stat("Self-starting", r.unused.length ? (r.selfStarting ? "yes" : "no (it can lock out)") : "no unused states"))),
          h("section", { class: "card" }, h("h2", null, "State table and excitations"),
            h("div", { class: "table-wrap" }, h("table", { class: "parse" },
              h("thead", null, h("tr", null, [...names.map((n) => n), ...names.map((n) => `${n}+`), ...names.flatMap((n, f) => inNames.map((x) => `${x}${r.bits - 1 - f}`))].map((x) => h("th", { scope: "col" }, x)))),
              h("tbody", null, r.table.map((row) => h("tr", null, [...binary(row.s, r.bits)].map((b) => h("td", null, b)), [...binary(row.n, r.bits)].map((b) => h("td", null, b)), row.need.flat().map((x) => h("td", { class: "added" }, x))))))),
            r.unused.length ? h("p", { class: "muted small" }, `Unused states ${r.unused.join(", ")} are don't-cares. With the logic below they go: ${r.stray.map((x) => `${x.s} → ${x.n}`).join(", ")}.`) : null,
            h("div", { class: "dl-kmaps" }, r.fns.map((fn) => h("div", null, h("h3", { class: "mono" }, `${fn.label} = ${fn.expr}`),
              h("div", { class: "chart-wrap km-wrap" }, kmapSvg(r.bits, Array.from({ length: 1 << r.bits }, (_, m) => (fn.ones.includes(m) ? 1 : fn.dcs.includes(m) ? "X" : 0)), { names, groups: fn.result.chosen.map((imp, i) => ({ imp, colour: i })) })))))));
      } else if (state.mode === "ripple") {
        writeParams({ mode: "ripple", N: state.N, tpd: state.tpd, down: state.down ? 1 : 0 });
        const r = rippleCounter(state.N, { down: state.down, tpd: state.tpd });
        const names = qNames(r.bits);
        const finals = r.steps.slice(1).map((s) => s.state);
        const t = traced(r.steps, RIPPLE_CODE, (s) => h("div", null,
          h("div", { class: "ff-chain rev" }, names.map((n, i) => h("div", { class: `ff-box${(s.state >> (r.bits - 1 - i)) & 1 ? " one" : ""}` }, h("span", null, n), h("b", null, (s.state >> (r.bits - 1 - i)) & 1)))),
          h("div", { class: "rc-ripple" }, s.chain.map((c, k) => h("span", { class: `mono${k === s.chain.length - 1 ? " last" : ""}` }, binary(c, r.bits)))),
          timingDiagram(r.N, names.map((n, i) => ({ name: n, kind: "edge", initial: 0, values: finals.map((v) => (v >> (r.bits - 1 - i)) & 1) })), { upto: s.pulse, cursor: s.pulse ? s.pulse - 1 : null })), { interval: 1000 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Mod-${state.N} ripple ${state.down ? "down" : "up"} counter`), t.el,
          h("div", { class: "stats-row" }, stat("Flip-flops", r.bits), stat("Worst-case settling", `${r.maxDelay} ns`), stat("Max clock", `${+r.maxFreqMHz.toFixed(2)} MHz`)),
          h("p", { class: "muted small" }, `The slowest change passes through all ${r.bits} flip-flops, ${r.bits} × ${state.tpd} = ${r.maxDelay} ns, so the clock period must be at least that: f ≤ 1 / ${r.maxDelay} ns.`)));
      } else if (state.mode === "shift") {
        writeParams({ mode: "shift", kind: state.kind, bits: state.bits });
        const r = shiftCounter(state.kind, state.bits);
        const names = qNames(r.bits);
        const code = ["load the start pattern", state.kind === "ring" ? "on each edge: shift right, Q0 goes back into the leftmost flip-flop" : "on each edge: shift right, NOT Q0 goes into the leftmost flip-flop", "repeat until the start pattern returns"];
        const steps = r.seq.map((s, i) => ({ state: s, edge: i, line: i ? 2 : 1, vars: { edge: i, Q: binary(s, r.bits) }, note: i ? `Edge ${i}: ${binary(r.seq[i - 1], r.bits)} → ${binary(s, r.bits)}.` : `Start at ${binary(s, r.bits)}.` }));
        steps.push({ state: r.seq[0], edge: r.seq.length, line: 3, vars: { states: r.states, unused: r.unused }, note: `Edge ${r.seq.length} brings back ${binary(r.seq[0], r.bits)}: ${r.states} states (${state.kind === "ring" ? "n" : "2n"} for n = ${r.bits}), ${r.unused} unused.` });
        const t = traced(steps, code, (s) => h("div", { class: "grid-2 tight" },
          h("div", { class: "chart-wrap sd-wrap" }, stateDiagram(r.seq.map((x) => ({ id: x, label: binary(x, r.bits) })), r.seq.map((x, i) => ({ from: x, to: r.seq[(i + 1) % r.seq.length] })), { active: s.state })),
          h("div", null, h("div", { class: "ff-chain" }, names.map((n, i) => h("div", { class: `ff-box${(s.state >> (r.bits - 1 - i)) & 1 ? " one" : ""}` }, h("span", null, n), h("b", null, (s.state >> (r.bits - 1 - i)) & 1)))),
            h("p", { class: "muted small" }, state.kind === "ring" ? "One 1 circulates: each state is decoded by a single flip-flop, no gates needed." : "Ones fill up from the left, then zeros: 2n states, each decoded by a 2-input gate."))), { interval: 900 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.kind === "ring" ? "Ring" : "Johnson"} counter with ${r.bits} flip-flops`), t.el,
          h("div", { class: "stats-row" }, stat("States", r.states), stat("Unused states", r.unused), stat("Sequence", r.seq.map((x) => binary(x, r.bits)).join(" "), true))));
      } else {
        const fns = decodeEq(state.eq, state.t, state.bits) ?? (state.t === "t" && state.bits === 3 ? DEFAULT_EQ.t : randomEquations(rng(7), state.t, state.bits));
        writeParams({ mode: "analyse", t: state.t, bits: state.bits, eq: encodeEq(fns, state.bits), s: state.s });
        const r = analyse(state.t, state.bits, fns, state.s);
        const eqs = equationsText(state.t, state.bits, fns);
        const all = Array.from({ length: 1 << state.bits }, (_, x) => x);
        const t = traced(r.steps, ANALYSE_CODE, (s) => h("div", { class: "grid-2 tight" },
          h("div", { class: "chart-wrap sd-wrap" }, stateDiagram(all.map((x) => ({ id: x, label: binary(x, state.bits) })), all.map((x) => ({ from: x, to: r.map[x] })), { active: s.state, activeEdge: s.from !== undefined ? [s.from, s.state] : null, dim: all.filter((x) => !r.seq.includes(x)) })),
          h("div", null, h("div", { class: "ff-chain" }, r.names.map((n, i) => h("div", { class: `ff-box${(s.state >> (state.bits - 1 - i)) & 1 ? " one" : ""}` }, h("span", null, n), h("b", null, (s.state >> (state.bits - 1 - i)) & 1)))),
            h("ul", { class: "notes mono" }, eqs.map((e) => h("li", null, e))))), { interval: 1000 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.bits} ${FLIP_FLOPS[state.t].name} flip-flops from state ${binary(state.s, state.bits)}`), t.el,
          h("div", { class: "stats-row" }, stat("Sequence", `${r.seq.join(" → ")} → ${r.cycle[0]}`, true), stat("Distinct states", r.seq.length), stat("Cycle length", r.cycle.length))));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, modeBar, inputs, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), msg),
    out);

  // --- Practice ---------------------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["ff", "ff", "counter", "mod", "johnson"][Math.floor(r() * 5)];
    const fb = h("div");
    const input = h("input", { type: "text", class: "mono", "aria-label": "Your answer" });
    let body, truth, explain;
    if (kind === "ff") {
      const type = ["sr", "jk", "d", "t"][Math.floor(r() * 4)], k = FLIP_FLOPS[type].inputs.length;
      const seq = Array.from({ length: 5 }, () => { let v; do { v = Array.from({ length: k }, () => (r() < 0.5 ? 1 : 0)); } while (type === "sr" && v[0] && v[1]); return v; });
      const q0 = r() < 0.5 ? 1 : 0;
      const res = clockFF(type, seq, q0);
      truth = res.rows.map((x) => x.qn).join("");
      body = [h("h2", null, `${FLIP_FLOPS[type].name} flip-flop`), h("p", null, `Q starts at ${q0}. Over five rising edges the inputs (${FLIP_FLOPS[type].inputs.join(", ")}) are ${seq.map((v) => v.join("")).join(", ")}. Write Q after each edge (five bits).`),
        timingDiagram(5, FLIP_FLOPS[type].inputs.map((n, j) => ({ name: n, kind: "cycle", values: seq.map((v) => v[j]) })), { upto: 0 })];
      explain = () => h("ol", { class: "notes" }, res.steps.slice(1).map((s) => h("li", null, s.note)));
    } else if (kind === "counter") {
      const type = ["t", "d", "jk"][Math.floor(r() * 3)], bits = 3;
      const fns = randomEquations(r, type, bits);
      const start = Math.floor(r() * 8);
      const res = analyse(type, bits, fns, start);
      truth = res.seq.slice(0, 4).join(",");
      body = [h("h2", null, "Analyse a counter"), h("p", null, `Three ${FLIP_FLOPS[type].name} flip-flops Q2 Q1 Q0 (Q2 most significant) have inputs:`), h("ul", { class: "notes mono" }, equationsText(type, bits, fns).map((e) => h("li", null, e))),
        h("p", null, `Starting in ${start} (${binary(start, bits)}), list the first four states as decimals, e.g. 0,1,2,3.`)];
      explain = () => h("ol", { class: "notes" }, res.steps.slice(1).map((s) => h("li", null, s.note)));
    } else if (kind === "mod") {
      const N = 3 + Math.floor(r() * 60);
      truth = String(Math.ceil(Math.log2(N)));
      body = [h("h2", null, "How many flip-flops?"), h("p", null, `What is the smallest number of flip-flops for a mod-${N} counter?`)];
      explain = () => h("p", null, `2^${truth} = ${2 ** Number(truth)} ≥ ${N}, but 2^${Number(truth) - 1} = ${2 ** (Number(truth) - 1)} isn't.`);
    } else {
      const bits = 3 + Math.floor(r() * 5), ring = r() < 0.5;
      const res = shiftCounter(ring ? "ring" : "johnson", bits);
      const askUnused = r() < 0.4;
      truth = String(askUnused ? res.unused : res.states);
      body = [h("h2", null, ring ? "Ring counter" : "Johnson counter"), h("p", null, `A ${ring ? "ring" : "Johnson"} counter has ${bits} flip-flops. How many ${askUnused ? "unused" : "distinct"} states does it have?`)];
      explain = () => h("p", null, `It cycles through ${res.states} states (${ring ? "n" : "2n"}): ${res.seq.map((x) => binary(x, bits)).join(", ")}. ${2 ** bits} − ${res.states} = ${res.unused} are unused.`);
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body,
      h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
        const ok = input.value.replace(/\s/g, "") === truth;
        input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
        fb.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right!" : `✗ The answer is ${truth}.`), explain());
      } }, "Check")), fb));
  }

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}

