import { adderSteps, compare, COMPARE_CODE, decoderSteps, DECODER_CODE, FULL_ADDER_CODE, fullAdder, HALF_ADDER_CODE, halfAdder, muxFunction, muxImplement, MUX_CODE, ripple, RIPPLE_CODE } from "../engines/combinational.js";
import { NAMES, parseList } from "../engines/kmap.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { bitToggle, segmented, sig, traced } from "./dl-kit.js";

const PARTS = [["mux", "Multiplexer"], ["decoder", "Decoder"], ["half", "Half adder"], ["full", "Full adder"], ["ripple", "Ripple-carry adder"], ["compare", "Comparator"]];
const int = (v, d) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const bitsOf = (v, n) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1);

// --- Gate symbols --------------------------------------------------------------------------
const W = 50, G = 40;
const gate = (kind, x, y, label) => {
  const body = kind === "and"
    ? `M${x},${y} h${W / 2} a${G / 2},${G / 2} 0 0 1 0,${G} h${-W / 2} z`
    : `M${x},${y} Q${x + W * 0.35},${y + G / 2} ${x},${y + G} Q${x + W * 0.6},${y + G} ${x + W},${y + G / 2} Q${x + W * 0.6},${y} ${x},${y} z`;
  return h("g", { class: "gate" }, kind === "xor" ? h("path", { d: `M${x - 7},${y} Q${x + W * 0.35 - 7},${y + G / 2} ${x - 7},${y + G}`, class: "gate-back" }) : null,
    h("path", { d: body }), label ? h("text", { x: x + W / 2 - 4, y: y + G / 2 + 4, "text-anchor": "middle", class: "gate-label" }, label) : null);
};
const pinIn = (x, y, k) => [x, y + G * (k ? 0.7 : 0.3)];
const pinOut = (x, y) => [x + W, y + G / 2];
const wire = (pts, v, known = true) => h("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: `wire ${known ? sig(v) : "unk"}` });
const wtext = (x, y, text, v, known = true) => h("text", { x, y, class: `wire-val ${known ? sig(v) : "unk"}` }, text);

function fullAdderSvg(r, known) {
  const k = (w) => known.includes(w);
  const X1 = [110, 30], A1 = [110, 95], X2 = [240, 45], A2 = [240, 140], O = [330, 120];
  const { x1, g, p } = r.wires;
  return h("svg", { viewBox: "0 0 450 200", class: "dl-svg fa-svg", role: "img", "aria-label": `Full adder: A=${r.a}, B=${r.b}, Cin=${r.cin}, S=${r.sum}, Cout=${r.cout}` },
    wire([[40, 42], pinIn(...X1, 0)], r.a), wire([[60, 42], [60, 107], pinIn(...A1, 0)], r.a),
    wire([[40, 58], pinIn(...X1, 1)], r.b), wire([[80, 58], [80, 123], pinIn(...A1, 1)], r.b),
    wire([[44, 182], [215, 182], [215, 73], pinIn(...X2, 1)], r.cin), wire([[215, 168], pinIn(...A2, 1)], r.cin),
    wire([pinOut(...X1), [190, 50], [190, 57], pinIn(...X2, 0)], x1, k("x1")), wire([[190, 57], [190, 152], pinIn(...A2, 0)], x1, k("x1")),
    wire([pinOut(...A1), [315, 115], [315, 132], pinIn(...O, 0)], g, k("g")),
    wire([pinOut(...A2), [315, 160], [315, 148], pinIn(...O, 1)], p, k("p")),
    wire([pinOut(...X2), [440, 65]], r.sum, k("sum")), wire([pinOut(...O), [440, 140]], r.cout, k("cout")),
    gate("xor", ...X1), gate("and", ...A1), gate("xor", ...X2), gate("and", ...A2), gate("or", ...O),
    wtext(2, 46, `A ${r.a}`, r.a), wtext(2, 62, `B ${r.b}`, r.b), wtext(2, 186, `Cin ${r.cin}`, r.cin),
    wtext(166, 44, `X ${k("x1") ? x1 : "?"}`, x1, k("x1")), wtext(166, 110, `G ${k("g") ? g : "?"}`, g, k("g")), wtext(292, 176, `P ${k("p") ? p : "?"}`, p, k("p")),
    wtext(392, 59, `S ${k("sum") ? r.sum : "?"}`, r.sum, k("sum")), wtext(390, 132, `Cout ${k("cout") ? r.cout : "?"}`, r.cout, k("cout")));
}

function halfAdderSvg(r, known) {
  const k = (w) => known.includes(w);
  const X = [150, 20], A = [150, 90];
  return h("svg", { viewBox: "0 0 300 150", class: "dl-svg fa-svg", role: "img", "aria-label": `Half adder: A=${r.a}, B=${r.b}, S=${r.sum}, C=${r.carry}` },
    wire([[40, 32], pinIn(...X, 0)], r.a), wire([[80, 32], [80, 102], pinIn(...A, 0)], r.a),
    wire([[40, 48], pinIn(...X, 1)], r.b), wire([[105, 48], [105, 118], pinIn(...A, 1)], r.b),
    wire([pinOut(...X), [290, 40]], r.sum, k("sum")), wire([pinOut(...A), [290, 110]], r.carry, k("carry")),
    gate("xor", ...X), gate("and", ...A),
    wtext(2, 36, `A ${r.a}`, r.a), wtext(2, 52, `B ${r.b}`, r.b),
    wtext(240, 34, `S ${k("sum") ? r.sum : "?"}`, r.sum, k("sum")), wtext(240, 104, `C ${k("carry") ? r.carry : "?"}`, r.carry, k("carry")));
}

// A 2^s:1 MUX as a trapezoid; inputs labelled with what feeds them and their value now.
function muxSvg(impl, assign, upto) {
  const k = impl.k, n = impl.n;
  const rowH = k > 8 ? 18 : 26, top = 20, H = top + k * rowH + 60;
  const x0 = 150, x1 = 230;
  const sel = impl.selVars.reduce((s, v) => s * 2 + ((assign >> (n - 1 - v)) & 1), 0);
  const xv = (assign >> (n - 1 - impl.dataVar)) & 1;
  const valueOf = (inp) => (inp === "0" ? 0 : inp === "1" ? 1 : inp === impl.names[impl.dataVar] ? xv : 1 - xv);
  const els = [h("path", { d: `M${x0},${top} L${x1},${top + 20} L${x1},${top + k * rowH - 20} L${x0},${top + k * rowH} z`, class: "mux-body" }),
    h("text", { x: (x0 + x1) / 2, y: top + (k * rowH) / 2 + 4, "text-anchor": "middle", class: "gate-label" }, `${k}:1`)];
  impl.rows.forEach((row, i) => {
    const y = top + rowH * (i + 0.5);
    const shown = i <= upto;
    const v = shown ? valueOf(row.input) : null;
    els.push(h("line", { x1: 70, y1: y, x2: x0, y2: y, class: `wire ${shown ? sig(v) : "unk"}${i === sel ? " picked" : ""}` }),
      h("text", { x: 4, y: y + 4, class: "wire-val" }, `I${i}`),
      h("text", { x: 34, y: y + 4, class: `mux-in ${shown ? sig(v) : "unk"}` }, shown ? row.input : "?"));
    if (i === sel) els.push(h("line", { x1: x0 + 4, y1: y, x2: x1 - 4, y2: top + (k * rowH) / 2, class: `wire picked ${shown ? sig(v) : "unk"}` }));
  });
  const outShown = sel <= upto, out = outShown ? valueOf(impl.rows[sel].input) : null;
  els.push(h("line", { x1: x1, y1: top + (k * rowH) / 2, x2: 300, y2: top + (k * rowH) / 2, class: `wire ${outShown ? sig(out) : "unk"}` }),
    h("text", { x: 262, y: top + (k * rowH) / 2 - 6, class: `wire-val ${outShown ? sig(out) : "unk"}` }, `F ${outShown ? out : "?"}`));
  impl.selVars.forEach((v, j) => {
    const x = x0 + 14 + j * 28, b = (assign >> (n - 1 - v)) & 1;
    els.push(h("line", { x1: x, y1: top + k * rowH - 6 - j * 2, x2: x, y2: H - 18, class: `wire ${sig(b)}` }),
      h("text", { x, y: H - 4, "text-anchor": "middle", class: `wire-val ${sig(b)}` }, `${impl.names[v]}=${b}`));
  });
  return h("svg", { viewBox: `0 0 310 ${H}`, class: "dl-svg mux-svg", style: "max-width:420px", role: "img", "aria-label": `Multiplexer: select ${sel}, output ${out ?? "unknown"}` }, els);
}

function decoderSvg(d, ones, show) {
  const k = 1 << d.bits, rowH = k > 8 ? 16 : 24, top = 16, H = top + k * rowH + 30;
  const els = [h("rect", { x: 90, y: top, width: 70, height: k * rowH, rx: 8, class: "mux-body" }),
    h("text", { x: 125, y: top + (k * rowH) / 2 + 4, "text-anchor": "middle", class: "gate-label" }, `${d.bits}:${k}`)];
  bitsOf(d.value, d.bits).forEach((b, i) => {
    const y = top + ((i + 1) * k * rowH) / (d.bits + 1);
    els.push(h("line", { x1: 30, y1: y, x2: 90, y2: y, class: `wire ${sig(b)}` }), h("text", { x: 2, y: y + 4, class: `wire-val ${sig(b)}` }, `${NAMES[i]} ${b}`));
  });
  els.push(h("line", { x1: 125, y1: top + k * rowH, x2: 125, y2: H - 8, class: `wire ${sig(d.enable)}` }), h("text", { x: 132, y: H - 6, class: `wire-val ${sig(d.enable)}` }, `EN ${d.enable}`));
  const orX = 250, orY = top + (k * rowH) / 2 - 20;
  d.outputs.forEach((o, i) => {
    const y = top + rowH * (i + 0.5), v = show >= 1 ? o : null, used = ones.includes(i);
    els.push(h("line", { x1: 160, y1: y, x2: used ? 215 : 195, y2: y, class: `wire ${show >= 1 ? sig(v) : "unk"}` }),
      h("text", { x: 166, y: y - 3, class: "wire-val small-val" }, `D${i}`));
    if (used) els.push(h("polyline", { points: `215,${y} 230,${y} 230,${orY + 20} ${orX},${orY + 20}`, class: `wire ${show >= 1 ? sig(v) : "unk"} faint` }));
  });
  if (ones.length) {
    const F = show >= 2 ? (d.enable && ones.includes(d.value) ? 1 : 0) : null;
    els.push(gate("or", orX, orY), h("line", { x1: orX + W, y1: orY + 20, x2: orX + W + 30, y2: orY + 20, class: `wire ${show >= 2 ? sig(F) : "unk"}` }),
      h("text", { x: orX + W + 2, y: orY + 12, class: `wire-val ${show >= 2 ? sig(F) : "unk"}` }, `F ${F ?? "?"}`));
  }
  return h("svg", { viewBox: `0 0 340 ${H}`, class: "dl-svg mux-svg", style: "max-width:440px", role: "img", "aria-label": `Decoder: input ${d.value}, output D${d.value} high` }, els);
}

function rippleSvg(r, s) {
  const BW = 66, GAP = 30, n = r.n, Wd = 40 + n * (BW + GAP), H = 150;
  const els = [];
  const cReady = (i) => s.carriesReady.includes(i);
  for (let k = 0; k < n; k++) {
    const st = r.stages[k];
    const x = Wd - 40 - (k + 1) * (BW + GAP) + GAP; // bit 0 on the right
    const sumOk = s.sumsReady.includes(k);
    els.push(h("rect", { x, y: 40, width: BW, height: 54, rx: 8, class: `fa-box${sumOk ? " done" : cReady(k) ? " busy" : ""}` }),
      h("text", { x: x + BW / 2, y: 72, "text-anchor": "middle", class: "gate-label" }, `FA${k}`),
      h("text", { x: x + 14, y: 30, "text-anchor": "middle", class: `wire-val ${sig(st.a)}` }, `A${k}=${st.a}`),
      h("text", { x: x + BW - 14, y: 16, "text-anchor": "middle", class: `wire-val ${sig(st.b)}` }, `B${k}=${st.b}`),
      h("line", { x1: x + 14, y1: 33, x2: x + 14, y2: 40, class: `wire ${sig(st.a)}` }), h("line", { x1: x + BW - 14, y1: 20, x2: x + BW - 14, y2: 40, class: `wire ${sig(st.b)}` }),
      h("line", { x1: x + BW / 2, y1: 94, x2: x + BW / 2, y2: 116, class: `wire ${sumOk ? sig(st.sum) : "unk"}` }),
      h("text", { x: x + BW / 2, y: 132, "text-anchor": "middle", class: `wire-val ${sumOk ? sig(st.sum) : "unk"}` }, `S${k}=${sumOk ? st.sum : "?"}`));
    // Carry into this stage from the right.
    const cin = k === 0 ? r.cin : r.stages[k - 1].cout, ok = cReady(k);
    els.push(h("line", { x1: x + BW + GAP, y1: 67, x2: x + BW, y2: 67, class: `wire ${ok ? sig(cin) : "unk"}` }),
      h("text", { x: x + BW + GAP / 2, y: 60, "text-anchor": "middle", class: `wire-val ${ok ? sig(cin) : "unk"}` }, `C${k}${ok ? `=${cin}` : ""}`));
  }
  const ok = cReady(n);
  els.push(h("line", { x1: 4, y1: 67, x2: 40 - GAP + GAP, y2: 67, class: `wire ${ok ? sig(r.cout) : "unk"}` }),
    h("text", { x: 4, y: 60, class: `wire-val ${ok ? sig(r.cout) : "unk"}` }, `C${n}${ok ? `=${r.cout}` : ""}`));
  return h("div", null, h("div", { class: "chart-wrap" }, h("svg", { viewBox: `0 0 ${Wd} ${H}`, class: "dl-svg", style: `min-width:${Math.min(Wd, n * 58)}px;max-width:${Wd * 1.2}px`, role: "img", "aria-label": `Ripple-carry adder at time ${s.t}` }, els)),
    h("div", { class: "rc-time", "aria-hidden": "true" }, h("i", { style: `width:${(s.t / r.total) * 100}%` }), h("span", null, `t = ${s.t} of ${r.total}`)));
}

function compareView(r, s) {
  const upto = s.bit === -1 ? r.n : r.n - s.bit;
  const row = (label, bits) => h("tr", null, h("th", { scope: "row" }, label), [...bits].map((b, k) => h("td", { class: `${k === upto - 1 && s.bit !== -1 ? "hot" : ""}${r.at !== null && r.n - 1 - k === r.at && k < upto ? " added" : ""}` }, k < upto || label !== "x" ? b : "")));
  return h("div", null, h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "bit"), Array.from({ length: r.n }, (_, k) => h("th", { scope: "col" }, r.n - 1 - k)))),
    h("tbody", null, row("A", r.A), row("B", r.B), row("x", s.x.join("").padEnd(r.n, " "))))),
    h("div", { class: "cmp-out" }, [["A > B", "gt"], ["A = B", "eq"], ["A < B", "lt"]].map(([t, k]) => {
      const done = s.bit === -1 || (s.decided && k !== "eq");
      const v = done ? r[k] : null;
      return h("span", { class: `cmp-chip ${v === null ? "unk" : sig(v)}` }, `${t}: ${v ?? "?"}`);
    })));
}

function truthTable(head, rows, hot) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, head.map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, rows.map((r, i) => h("tr", { class: i === hot ? "hot" : null }, r.map((x) => h("td", null, x)))))));
}

export function render(root) {
  const p = readParams();
  const state = {
    c: PARTS.some(([k]) => k === p.get("c")) ? p.get("c") : "mux",
    n: Math.min(4, Math.max(2, int(p.get("n"), 3))), f: p.get("f") ?? "1,3,5,6", dv: int(p.get("dv"), -1), x: int(p.get("x"), 5),
    k: Math.min(4, Math.max(1, int(p.get("k"), 3))), en: int(p.get("en"), 1),
    a: int(p.get("a"), 1), b: int(p.get("b"), 1), ci: int(p.get("ci"), 0),
    ra: p.get("ra") ?? "1011", rb: p.get("rb") ?? "0111", tc: int(p.get("tc"), 2), ts: int(p.get("ts"), 3),
    ca: p.get("ca") ?? "1011", cb: p.get("cb") ?? "1001",
  };
  if (state.dv < 0 || state.dv >= state.n) state.dv = state.n - 1;
  let players = [];
  const head = page({
    subject: "Digital logic",
    title: "Combinational circuits",
    lede: "Multiplexers, decoders, adders and comparators with live 0s and 1s on every wire. Flip an input and follow it through.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "combinational"), " circuit's outputs depend only on its inputs right now (no memory)."),
      h("ul", null,
        h("li", null, "A ", h("b", null, "2^s : 1 multiplexer"), " passes input I(s) to the output, where s is the number on its select lines. Any function of n variables fits on a 2^(n−1) : 1 MUX: put n − 1 variables on the selects and feed each data input 0, 1, x or x' for the last variable."),
        h("li", null, "An ", h("b", null, "n-to-2^n decoder"), " raises exactly one output, the one numbered by its inputs. Each output is a minterm, so one OR gate on the right outputs makes any function."),
        h("li", null, "A ", h("b", null, "half adder"), " adds two bits (S = A XOR B, C = AB). A ", h("b", null, "full adder"), " adds three: S = A XOR B XOR Cin, Cout = AB + Cin(A XOR B). It is two half adders and an OR gate."),
        h("li", null, "A ", h("b", null, "ripple-carry adder"), " chains n full adders. Each stage has to wait for the carry from the one before, so the delay grows with n: about (n − 1)·tc + max(tc, ts)."),
        h("li", null, "A ", h("b", null, "magnitude comparator"), " compares from the most significant bit down; the first bit that differs decides. A = B when every xi = Ai XNOR Bi is 1."))),
    conventions: [
      "A is the most significant variable; for a MUX the first select variable is the most significant select bit.",
      "Green wires carry 1, grey wires 0, and dashed wires haven't settled yet.",
      "Ripple-carry timing uses the worst case: carry i+1 settles tc after carry i, sum i settles ts after carry i.",
      "A don't-care in a MUX input pair is resolved to the simplest input (a constant if possible).",
    ],
  });

  const partBar = h("div"), inputs = h("div"), msg = h("div"), out = h("div", { class: "output" });
  const num = (key, label, attrs = {}, after = update) => h("label", { class: "inline" }, label, h("input", { type: "number", value: state[key], ...attrs, "aria-label": label, onchange: (e) => { state[key] = int(e.target.value, state[key]); after(); } }));
  const text = (key, label) => h("label", { class: "inline" }, label, h("input", { type: "text", class: "mono", size: 12, value: state[key], "aria-label": label, oninput: (e) => { state[key] = e.target.value.trim(); update(); } }));

  function drawInputs() {
    partBar.replaceChildren(segmented(PARTS, state.c, (c) => { state.c = c; drawInputs(); update(); }, "Circuit"));
    if (state.c === "mux") {
      inputs.replaceChildren(h("div", { class: "row" },
        h("select", { "aria-label": "Variables", onchange: (e) => { state.n = Number(e.target.value); state.dv = state.n - 1; state.x = 0; drawInputs(); update(); } }, [2, 3, 4].map((k) => h("option", { value: k, selected: k === state.n }, `${k} variables`))),
        text("f", "F = Σm"),
        h("label", { class: "inline" }, "data input ", h("select", { "aria-label": "Variable on the data inputs", onchange: (e) => { state.dv = Number(e.target.value); update(); } }, NAMES.slice(0, state.n).map((v, i) => h("option", { value: i, selected: i === state.dv }, v))))));
    } else if (state.c === "decoder") {
      inputs.replaceChildren(h("div", { class: "row" },
        h("select", { "aria-label": "Decoder size", onchange: (e) => { state.k = Number(e.target.value); state.x = 0; drawInputs(); update(); } }, [1, 2, 3, 4].map((k) => h("option", { value: k, selected: k === state.k }, `${k}-to-${1 << k}`))),
        text("f", "F = Σm")));
    } else if (state.c === "ripple") {
      inputs.replaceChildren(h("div", { class: "row" }, text("ra", "A"), text("rb", "B"), num("tc", "carry delay tc", { min: 1, max: 50 }), num("ts", "sum delay ts", { min: 1, max: 50 })));
    } else if (state.c === "compare") {
      inputs.replaceChildren(h("div", { class: "row" }, text("ca", "A"), text("cb", "B")));
    } else inputs.replaceChildren();
  }

  const toggles = (names, value, n, set) => h("div", { class: "row dl-toggles" }, names.map((nm, i) => bitToggle(nm, (value >> (n - 1 - i)) & 1, (v) => { set(v ? value | (1 << (n - 1 - i)) : value & ~(1 << (n - 1 - i))); })));

  function update() {
    players.forEach((x) => x.destroy()); players = [];
    const params = { c: state.c };
    if (state.c === "mux") Object.assign(params, { n: state.n, f: state.f, dv: state.dv, x: state.x });
    if (state.c === "decoder") Object.assign(params, { k: state.k, f: state.f, x: state.x, en: state.en });
    if (state.c === "half" || state.c === "full") Object.assign(params, { a: state.a, b: state.b, ...(state.c === "full" ? { ci: state.ci } : {}) });
    if (state.c === "ripple") Object.assign(params, { ra: state.ra, rb: state.rb, ci: state.ci, tc: state.tc, ts: state.ts });
    if (state.c === "compare") Object.assign(params, { ca: state.ca, cb: state.cb });
    writeParams(params);
    msg.replaceChildren();
    try {
      let card;
      if (state.c === "mux") {
        const ones = parseList(state.f, state.n);
        const impl = muxImplement(state.n, ones, [], state.dv);
        state.x = Math.min(state.x, (1 << state.n) - 1);
        const t = traced(impl.steps, MUX_CODE, (s) => h("div", null,
          h("div", { class: "chart-wrap" }, muxSvg(impl, state.x, s.upto)),
          truthTable(["Select", `${impl.names[impl.dataVar]} = 0`, `${impl.names[impl.dataVar]} = 1`, "Input"], impl.rows.slice(0, s.upto + 1).map((r) => [`I${r.s}`, `m${r.m0}: ${r.f0}`, `m${r.m1}: ${r.f1}`, r.input]), s.upto)), { start: impl.steps.length - 1 });
        players.push(t.player);
        card = h("section", { class: "card" }, h("h2", null, `F(${NAMES.slice(0, state.n).join(", ")}) = Σm(${ones.join(", ") || "none"}) on a ${impl.k}:1 MUX`),
          h("p", { class: "muted small" }, "Flip the inputs: the highlighted line is the one the select lines pick."),
          toggles(NAMES.slice(0, state.n), state.x, state.n, (v) => { state.x = v; update(); }),
          t.el,
          h("div", { class: "stats-row" }, stat("Data inputs", impl.inputs.map((x, i) => `I${i}=${x}`).join("  "), true), stat(`F at ${state.x}`, ones.includes(state.x) ? 1 : 0)));
      } else if (state.c === "decoder") {
        const ones = parseList(state.f, state.k);
        state.x = Math.min(state.x, (1 << state.k) - 1);
        const d = decoderSteps(state.k, bitsOf(state.x, state.k), state.en, ones);
        const t = traced(d.steps, DECODER_CODE, (s) => h("div", { class: "chart-wrap" }, decoderSvg(d, ones, s.show)), { start: 2 });
        players.push(t.player);
        card = h("section", { class: "card" }, h("h2", null, `${state.k}-to-${1 << state.k} decoder`),
          h("div", { class: "row dl-toggles" }, ...NAMES.slice(0, state.k).map((nm, i) => bitToggle(nm, (state.x >> (state.k - 1 - i)) & 1, (v) => { state.x = v ? state.x | (1 << (state.k - 1 - i)) : state.x & ~(1 << (state.k - 1 - i)); update(); })),
            bitToggle("EN", state.en, (v) => { state.en = v; update(); })),
          t.el);
      } else if (state.c === "half" || state.c === "full") {
        const full = state.c === "full";
        const steps = adderSteps(state.c, state.a, state.b, state.ci);
        const r = full ? fullAdder(state.a, state.b, state.ci) : halfAdder(state.a, state.b);
        const t = traced(steps, full ? FULL_ADDER_CODE : HALF_ADDER_CODE, (s) => h("div", { class: "chart-wrap" }, full ? fullAdderSvg(r, s.known) : halfAdderSvg(r, s.known)), { start: steps.length - 1, interval: 900 });
        players.push(t.player);
        const rows = full
          ? Array.from({ length: 8 }, (_, m) => { const [a, b, c] = bitsOf(m, 3); const x = fullAdder(a, b, c); return [a, b, c, x.sum, x.cout]; })
          : Array.from({ length: 4 }, (_, m) => { const [a, b] = bitsOf(m, 2); const x = halfAdder(a, b); return [a, b, x.sum, x.carry]; });
        card = h("section", { class: "card" }, h("h2", null, full ? "Full adder" : "Half adder"),
          h("div", { class: "row dl-toggles" }, bitToggle("A", state.a, (v) => { state.a = v; update(); }), bitToggle("B", state.b, (v) => { state.b = v; update(); }), full ? bitToggle("Cin", state.ci, (v) => { state.ci = v; update(); }) : null),
          t.el, h("h3", null, "Truth table"),
          truthTable(full ? ["A", "B", "Cin", "S", "Cout"] : ["A", "B", "S", "C"], rows, full ? state.a * 4 + state.b * 2 + state.ci : state.a * 2 + state.b),
          h("p", { class: "muted small" }, full ? "S = A ⊕ B ⊕ Cin is 1 when an odd number of inputs are 1; Cout = AB + Cin(A ⊕ B) is 1 when at least two are." : "S = A ⊕ B, C = AB. It can't take a carry in, which is why chains need full adders."));
      } else if (state.c === "ripple") {
        const r = ripple(state.ra, state.rb, state.ci, { tc: state.tc, ts: state.ts });
        const t = traced(r.steps, RIPPLE_CODE, (s) => rippleSvg(r, s), { interval: 900 });
        players.push(t.player);
        card = h("section", { class: "card" }, h("h2", null, `${r.n}-bit ripple-carry adder: ${r.A} + ${r.B}`),
          h("div", { class: "row dl-toggles" }, bitToggle("C0", state.ci, (v) => { state.ci = v; update(); })),
          t.el,
          h("div", { class: "stats-row" }, stat("Sum", `${r.cout}${r.sum}`, true), stat("Decimal", `${parseInt(r.A, 2)} + ${parseInt(r.B, 2)}${r.cin ? " + 1" : ""} = ${r.value}`), stat("Total delay", `${r.total}`), stat("Formula", `(${r.n} − 1)·${r.tc} + max(${r.tc}, ${r.ts})`, true)));
      } else {
        const r = compare(state.ca, state.cb);
        const t = traced(r.steps, COMPARE_CODE, (s) => compareView(r, s));
        players.push(t.player);
        card = h("section", { class: "card" }, h("h2", null, `${r.n}-bit comparator: ${r.A} vs ${r.B}`), t.el,
          h("p", { class: "muted small" }, "A > B = A(n−1)B(n−1)' + x(n−1)A(n−2)B(n−2)' + … : each term says \"equal above, and A has the 1 here\"."));
      }
      out.replaceChildren(card);
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, partBar, inputs, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), msg),
    out);

  // --- Practice -------------------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["mux", "mux", "muxf", "ripple", "add"][Math.floor(r() * 5)];
    const fb = h("div");
    let body;
    if (kind === "mux") {
      let ones;
      do { ones = Array.from({ length: 8 }, (_, m) => m).filter(() => r() < 0.5); } while (ones.length < 2 || ones.length > 6);
      const impl = muxImplement(3, ones);
      const choices = ["0", "1", "C", "C'"];
      const sels = impl.rows.map((row) => h("select", { "aria-label": `I${row.s}` }, h("option", { value: "" }, `I${row.s} = ?`), choices.map((c) => h("option", { value: c }, `I${row.s} = ${c}`))));
      body = [h("h2", null, "Implement with a 4:1 MUX"), h("p", null, `F(A, B, C) = Σm(${ones.join(", ")}). A and B drive the select lines (A is the most significant). What goes on each data input?`),
        h("div", { class: "row" }, sels),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          let right = 0;
          sels.forEach((s, i) => { const ok = s.value === impl.inputs[i]; s.classList.toggle("right", ok); s.classList.toggle("wrong", !ok); if (ok) right++; });
          fb.replaceChildren(notice(right === 4 ? "good" : "bad", right === 4 ? "✓ All four right!" : `${right} / 4 right. Answer: ${impl.inputs.map((x, i) => `I${i} = ${x}`).join(", ")}.`), h("ol", { class: "notes" }, impl.steps.map((s) => h("li", null, s.note))));
        } }, "Check"))];
    } else if (kind === "muxf") {
      const choices = ["0", "1", "C", "C'"];
      const inputs = Array.from({ length: 4 }, () => choices[Math.floor(r() * 4)]);
      const ones = muxFunction(3, inputs);
      const input = h("input", { type: "text", class: "mono", placeholder: "e.g. 1,3,4", "aria-label": "Minterms" });
      body = [h("h2", null, "Read a MUX"), h("p", null, `A 4:1 MUX has A, B on its select lines (A most significant) and inputs I0 = ${inputs[0]}, I1 = ${inputs[1]}, I2 = ${inputs[2]}, I3 = ${inputs[3]}. List the minterms of F(A, B, C).`),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          let got = null;
          try { got = parseList(input.value, 3); } catch { got = null; }
          const ok = got && got.join(",") === ones.join(",");
          input.classList.toggle("right", !!ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right!" : "✗ Not quite."} F = Σm(${ones.join(", ") || "none"}). Each input Ik covers minterms 2k (C = 0) and 2k + 1 (C = 1).`));
        } }, "Check"))];
    } else if (kind === "ripple") {
      const n = [4, 8, 16, 32][Math.floor(r() * 4)], tc = 2 + Math.floor(r() * 4), ts = 2 + Math.floor(r() * 5);
      const total = Math.max(n * tc, (n - 1) * tc + ts);
      const input = h("input", { type: "number", "aria-label": "Delay" });
      body = [h("h2", null, "Ripple-carry delay"), h("p", null, `${n === 8 || n === 11 ? "An" : "A"} ${n}-bit ripple-carry adder is built from full adders whose carry output takes ${tc} ns and sum output ${ts} ns after their inputs settle. How long (ns) until every sum bit and the final carry are correct, in the worst case?`),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = Number(input.value) === total && input.value !== "";
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right!" : `✗ It's ${total} ns.`} The carry reaches stage ${n - 1} after ${(n - 1)} × ${tc} = ${(n - 1) * tc} ns; then the last sum needs ${ts} more and the last carry ${tc} more: ${total} ns.`));
        } }, "Check"))];
    } else {
      const n = 4, a = Math.floor(r() * 16), b = Math.floor(r() * 16);
      const A = a.toString(2).padStart(n, "0"), B = b.toString(2).padStart(n, "0");
      const res = ripple(A, B, 0);
      const input = h("input", { type: "text", class: "mono", "aria-label": "Sum" });
      body = [h("h2", null, "Add with full adders"), h("p", null, `A 4-bit ripple-carry adder gets A = ${A} and B = ${B} with C0 = 0. Write C4 followed by S3 S2 S1 S0.`),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          const want = `${res.cout}${res.sum}`, ok = input.value.replace(/\s/g, "") === want;
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right!" : `✗ It's ${want}.`} ${a} + ${b} = ${a + b}. Carries from bit 0 up: ${res.stages.map((s) => s.cout).join(", ")}.`));
        } }, "Check"))];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body, fb));
  }

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
