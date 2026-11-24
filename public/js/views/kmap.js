import { blockStage, view3d } from "../view3d.js";
import { kmapFrame } from "../frames3d.js";
import { KMAP_CODE, literals, minimise, NAMES, parseList, parseSop, pattern, productTerm, QM_CODE, randomFunction, sumTerm, evalSop } from "../engines/kmap.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { kmapSvg, segmented, traced } from "./dl-kit.js";

const EXAMPLES = {
  classic: { name: "4 variables, textbook", n: 4, m: "0,1,2,5,6,7,8,9,10,14", d: "" },
  dc: { name: "With don't-cares", n: 4, m: "1,3,7,11,15", d: "0,2,5" },
  cyclic: { name: "Cyclic (no essential PIs)", n: 3, m: "0,1,2,5,6,7", d: "" },
  corners: { name: "Four corners", n: 4, m: "0,2,8,10,5,7", d: "" },
  bcd: { name: "BCD > 4 (codes 10 to 15 unused)", n: 4, m: "5,6,7,8,9", d: "10-15" },
  five: { name: "5 variables", n: 5, m: "0,2,4,6,9,13,21,23,25,29,31", d: "" },
  xor: { name: "XOR: nothing groups", n: 3, m: "1,2,4,7", d: "" },
};

// The extended pseudocode for the tabulation view: QM, then the chart.
const QM_FULL = [...QM_CODE,
  "build the chart: one row per prime implicant, one column per minterm",
  "a column with a single mark makes its row essential",
  "cover the remaining columns with the fewest rows",
  "F ← OR of the chosen rows",
];
const chartLine = (line) => ({ 1: 10, 2: 10, 3: 11, 4: 11, 5: 12, 6: 12, 7: 13 })[[line].flat()[0]] ?? 10;

export function render(root) {
  const p = readParams();
  const n0 = Number(p.get("n"));
  const state = {
    n: n0 >= 2 && n0 <= 5 ? n0 : 4,
    m: p.get("m") ?? EXAMPLES.classic.m, d: p.get("d") ?? "",
    form: p.get("form") === "pos" ? "pos" : "sop",
    view: p.get("view") === "qm" ? "qm" : "kmap",
  };
  let players = [];
  const v3 = view3d("k-map");
  const head = page({
    subject: "Digital logic",
    title: "K-map minimiser",
    lede: "Group the 1s of a Karnaugh map, find every prime implicant and the essential ones, and get the minimal SOP and POS. Or watch Quine-McCluskey do it by table.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "Karnaugh map"), " lays out a truth table so that neighbouring cells differ in exactly one variable (rows and columns go 00, 01, 11, 10, and the edges wrap round). A block of 2, 4, 8 … neighbouring 1s loses one variable for every doubling, so bigger blocks mean shorter terms."),
      h("ul", null,
        h("li", null, "An ", h("b", null, "implicant"), " is a block of 1s (and don't-cares). A ", h("b", null, "prime implicant"), " is one that can't be doubled any more."),
        h("li", null, "A prime implicant is ", h("b", null, "essential"), " if it covers some 1 that no other prime implicant covers. Every minimal answer contains all of them."),
        h("li", null, h("b", null, "Don't-cares"), " (X) are inputs that never happen or whose output doesn't matter. Use them when they make a block bigger; never cover one just for its own sake."),
        h("li", null, "For the ", h("b", null, "POS"), " form, group the 0s instead: that gives a minimal SOP for F', and De Morgan turns each term into a sum."),
        h("li", null, h("b", null, "Quine-McCluskey"), " does the same job by table, so it works for any number of variables: combine terms that differ in one bit, again and again, then pick a cover from the prime implicant chart.")),
      h("p", null, "Cost here: fewest terms first, then fewest literals.")),
    conventions: [
      "A is the most significant bit of a minterm number: in 4 variables, m13 = 1101 means A=1, B=1, C=0, D=1.",
      "Rows and columns are in Gray-code order; five variables use two 4-variable maps (A = 0 and A = 1) that sit on top of each other.",
      "Minimal means fewest terms, then fewest literals. When several answers tie, larger blocks and lower minterms are picked first.",
      "Prime implicants made only of don't-cares are not counted.",
      "Write NOT as a prime: AB' means A AND (NOT B).",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" });
  const nSel = h("select", { "aria-label": "Number of variables", onchange: (e) => { state.n = Number(e.target.value); clean(); sync(); update(); } },
    [2, 3, 4, 5].map((k) => h("option", { value: k, selected: k === state.n }, `${k} variables`)));
  const mIn = h("input", { type: "text", class: "mono wide", value: state.m, "aria-label": "Minterms", oninput: (e) => { state.m = e.target.value; update(); } });
  const dIn = h("input", { type: "text", class: "mono wide", value: state.d, "aria-label": "Don't-cares", oninput: (e) => { state.d = e.target.value; update(); } });
  const formBar = h("div"), viewBar = h("div");
  const sync = () => { mIn.value = state.m; dIn.value = state.d; nSel.value = state.n;
    formBar.replaceChildren(segmented([["sop", "Minimal SOP (group 1s)"], ["pos", "Minimal POS (group 0s)"]], state.form, (f) => { state.form = f; sync(); update(); }, "Form"));
    viewBar.replaceChildren(segmented([["kmap", "K-map"], ["qm", "Quine-McCluskey table"]], state.view, (v) => { state.view = v; sync(); update(); }, "Method")); };
  // Drop numbers that don't fit after the variable count shrinks.
  const clean = () => {
    const keep = (t) => { try { return parseList(t, 5).filter((x) => x < 1 << state.n).join(","); } catch { return t; } };
    state.m = keep(state.m); state.d = keep(state.d);
  };
  // Clicking a cell cycles 0 → 1 → X → 0.
  const cycleCell = (m) => {
    let ones = [], dcs = [];
    try { ones = parseList(state.m, state.n); dcs = parseList(state.d, state.n, "Don't-cares"); } catch { /* keep what parses */ }
    if (ones.includes(m)) { ones = ones.filter((x) => x !== m); dcs.push(m); }
    else if (dcs.includes(m)) dcs = dcs.filter((x) => x !== m);
    else ones.push(m);
    state.m = ones.sort((a, b) => a - b).join(","); state.d = dcs.sort((a, b) => a - b).join(",");
    sync(); update();
  };

  function primeList(r, s) {
    const termOf = (pi) => (r.form === "pos" ? sumTerm(pi, r.n) : productTerm(pi, r.n));
    return h("div", { class: "km-pis" }, r.primes.map((pi, i) => {
      const shown = s.primes.includes(pi);
      return h("div", { class: `km-pi${shown ? "" : " later"}${s.focus === pi ? " now" : ""}${s.chosen.includes(pi) ? " chosen" : ""}`, style: `--c:var(--series-${(i % 8) + 1})` },
        h("span", { class: "km-swatch" }), h("b", { class: "mono" }, shown ? termOf(pi) : "?"),
        h("span", { class: "small muted mono" }, shown ? `${pattern(pi, r.n)} · ${pi.ms.join(",")}` : ""),
        s.essential.includes(pi) ? h("span", { class: "badge" }, "essential") : null);
    }));
  }

  function mapStage(r, s, values) {
    const groups = s.primes.map((pi) => ({ imp: pi, colour: r.primes.indexOf(pi), style: s.focus === pi ? "focus" : s.chosen.includes(pi) ? "solid" : "dashed" }));
    return h("div", null, h("div", { class: "chart-wrap km-wrap" }, kmapSvg(r.n, values, { groups, hot: s.cell !== null && s.cell !== undefined ? [s.cell] : [], onCell: cycleCell })),
      h("p", { class: "small muted" }, "Click a cell to change it: 0 → 1 → X → 0. Solid outlines are chosen blocks, dashed ones are prime implicants not (yet) used."),
      primeList(r, s));
  }

  function qmStage(r, s) {
    if (s.chart) return chartView(r, s);
    const cols = r.qm.columns;
    const upto = s.column;
    return h("div", { class: "qm-cols" }, cols.slice(0, upto + 1).map((col, c) => h("div", { class: "qm-col" },
      h("h3", null, `Column ${c + 1}`, h("span", { class: "muted small" }, c === 0 ? " · minterms" : ` · ${2 ** c}-cell groups`)),
      h("div", { class: "table-wrap" }, h("table", { class: "parse qm-table" },
        h("tbody", null, col.groups.flatMap((g, gi) => g.length ? [h("tr", { class: "qm-gh" }, h("th", { colspan: 3, scope: "rowgroup" }, `${gi} one${gi === 1 ? "" : "s"}`)), ...g.map((t) => {
          const k = `${t.value}|${t.mask}`;
          const ticked = (c < upto ? col.used : s.ticked)?.has(k);
          const final = c < upto || (s.pair === null && !s.intro);
          const inPair = c === upto && s.pair !== null && (gi === s.pair || gi === s.pair + 1);
          const used = c === upto && s.made.some((x) => x.from.includes(t));
          return h("tr", { class: `${inPair ? "hot" : ""}${used ? " qm-used" : ""}` },
            h("td", { class: "left" }, t.ms.join(",")), h("td", null, pattern(t, r.n)), h("td", null, ticked ? "✓" : final ? h("b", { class: "qm-pi" }, "PI") : ""));
        })] : [])))))),
    s.made.length ? h("div", { class: "qm-col qm-new" }, h("h3", null, "New terms"), h("ul", { class: "notes mono" }, s.made.map((x) => h("li", null, `${pattern(x.from[0], r.n)} + ${pattern(x.from[1], r.n)} → ${pattern(x.term, r.n)}${x.fresh ? "" : " (repeat)"}`)))) : null);
  }

  function chartView(r, s) {
    const termOf = (pi) => (r.form === "pos" ? sumTerm(pi, r.n) : productTerm(pi, r.n));
    return h("div", null, h("h3", null, "Prime implicant chart"), h("div", { class: "table-wrap" }, h("table", { class: "parse qm-chart" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Prime implicant"), r.target.map((m) => h("th", { scope: "col", class: s.cell === m ? "hot" : null }, m)))),
      h("tbody", null, r.primes.map((pi, i) => h("tr", { class: s.focus === pi ? "hot" : s.chosen.includes(pi) ? "qm-chosen" : null },
        h("th", { scope: "row" }, h("span", { class: "km-swatch", style: `--c:var(--series-${(i % 8) + 1})` }), ` ${termOf(pi)}`, s.essential.includes(pi) ? h("span", { class: "badge" }, "essential") : null),
        r.target.map((m) => h("td", { class: pi.ms.includes(m) && s.chosen.some((q) => q.ms.includes(m)) ? "added" : null }, pi.ms.includes(m) ? "×" : ""))))))));
  }

  function update() {
    players.forEach((x) => x.destroy()); players = [];
    v3.disposeAll();
    writeParams({ n: state.n, m: state.m, d: state.d, form: state.form, view: state.view });
    msg.replaceChildren();
    try {
      const ones = parseList(state.m, state.n), dcs = parseList(state.d, state.n, "Don't-cares");
      const r = minimise(state.n, ones, dcs, { form: state.form });
      const values = Array.from({ length: 1 << state.n }, (_, m) => (ones.includes(m) ? 1 : dcs.includes(m) ? "X" : 0));
      let t;
      if (state.view === "kmap") {
        const flat = h("div"), st3 = blockStage(v3, flat, r.steps.length, (i) => kmapFrame(state.n, values, r.steps[i], r.primes), { tilt: 0.8, turn: 0.3, aria: "K-map in 3D" });
        t = traced(r.steps, KMAP_CODE, (s, i) => { const d = mapStage(r, s, values); flat.replaceChildren(...[...d.children].slice(0, 2)); st3.show(i); return h("div", null, st3.el, ...d.children); });
      }
      else {
        const steps = [...r.qm.steps.map((s) => ({ ...s, chart: false })),
          ...r.steps.filter((s) => s.line !== 2 && s.line !== 1).map((s) => ({ ...s, chart: true, line: chartLine(s.line) }))];
        if (!steps.some((s) => s.chart) && r.target.length) steps.push({ ...r.steps.at(-1), chart: true, line: 13 });
        t = traced(steps, QM_FULL, (s) => qmStage(r, s), { interval: 1300 });
      }
      players.push(t.player);
      const formName = state.form === "pos" ? "POS" : "SOP";
      const other = minimise(state.n, ones, dcs, { form: state.form === "pos" ? "sop" : "pos" });
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, `F(${NAMES.slice(0, state.n).join(", ")}) = Σm(${ones.join(", ") || "none"})${dcs.length ? ` + d(${dcs.join(", ")})` : ""}`), t.el,
          h("div", { class: "stats-row" },
            stat("Prime implicants", r.primes.length), stat("Essential", r.essential.length),
            stat(`Minimal ${formName}`, `F = ${r.expr}`, true), stat("Terms · literals", `${r.chosen.length} · ${r.literals}`)),
          h("p", { class: "muted small" }, `Minimal ${state.form === "pos" ? "SOP" : "POS"} for comparison: F = ${other.expr}.`)),
        state.view === "kmap" ? h("section", { class: "card" }, h("h2", null, "Check your own answer"), sopChecker(r, ones, dcs)) : null);
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  // Type an SOP and see whether it is equivalent and minimal.
  function sopChecker(r, ones, dcs) {
    const n = state.n;
    const input = h("input", { type: "text", class: "mono wide", placeholder: "e.g. AB' + CD", "aria-label": "Your SOP" });
    const fb = h("div");
    const best = state.form === "sop" ? r : minimise(n, ones, dcs);
    const check = () => {
      try {
        const terms = parseSop(input.value, n);
        const wrong = Array.from({ length: 1 << n }, (_, m) => m).filter((m) => !dcs.includes(m) && evalSop(terms, m) !== ones.includes(m));
        if (wrong.length) { fb.replaceChildren(notice("bad", `Not equivalent: it gives the wrong output for minterm${wrong.length === 1 ? "" : "s"} ${wrong.slice(0, 8).join(", ")}${wrong.length > 8 ? "…" : ""}.`)); return; }
        const lits = terms.reduce((s, t) => s + literals(t, n), 0);
        const minimal = terms.length === best.chosen.length && lits === best.literals;
        fb.replaceChildren(notice(minimal ? "good" : "bad", minimal ? "✓ Equivalent and minimal." : `Equivalent, but not minimal: yours has ${terms.length} terms and ${lits} literals; the minimum is ${best.chosen.length} terms and ${best.literals} literals (${best.expr}).`));
      } catch (e) { fb.replaceChildren(notice("error", e.message)); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    return h("div", null, h("p", { class: "muted small" }, "Type a sum of products for this function and check whether it is right and as small as possible."),
      h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), fb);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, v3.el,
      h("div", { class: "row" }, nSel, exampleSelect(EXAMPLES, (ex) => { Object.assign(state, { n: ex.n, m: ex.m, d: ex.d }); sync(); update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const f = randomFunction(rng(), state.n, { dcChance: 0.12 }); state.m = f.ones.join(","); state.d = f.dcs.join(","); sync(); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("div", { class: "grid-2 tight" },
        h("label", { class: "stack" }, "Minterms (1s), e.g. 0,1,5-7", mIn),
        h("label", { class: "stack" }, "Don't-cares (X)", dIn)),
      formBar, viewBar, msg),
    out);

  // --- Practice ------------------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const n = r() < 0.35 ? 3 : 4;
    let f, res;
    do { f = randomFunction(r, n, { dcChance: r() < 0.4 ? 0.12 : 0, density: 0.4 }); res = minimise(n, f.ones, f.dcs); } while (f.ones.length < 3 || res.chosen.length < 2);
    const kind = ["sop", "pi", "epi", "literals"][Math.floor(r() * 4)];
    const values = Array.from({ length: 1 << n }, (_, m) => (f.ones.includes(m) ? 1 : f.dcs.includes(m) ? "X" : 0));
    const fb = h("div"), solution = h("div");
    const input = h("input", { type: kind === "sop" ? "text" : "number", class: "mono", "aria-label": "Your answer" });
    const ask = { sop: "Write a minimal SOP for F.", pi: "How many prime implicants does F have?", epi: "How many essential prime implicants does F have?", literals: "How many literals are in a minimal SOP for F?" }[kind];
    const truth = { pi: res.primes.length, epi: res.essential.length, literals: res.literals }[kind];
    const show = () => solution.replaceChildren(h("div", { class: "chart-wrap km-wrap" }, kmapSvg(n, values, { groups: res.primes.map((pi, i) => ({ imp: pi, colour: i, style: res.chosen.includes(pi) ? "solid" : "dashed" })) })),
      h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note))));
    const check = () => {
      if (kind === "sop") {
        try {
          const terms = parseSop(input.value, n);
          const wrong = Array.from({ length: 1 << n }, (_, m) => m).filter((m) => !f.dcs.includes(m) && evalSop(terms, m) !== f.ones.includes(m));
          const lits = terms.reduce((s, t) => s + literals(t, n), 0);
          const ok = !wrong.length && terms.length === res.chosen.length && lits === res.literals;
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          fb.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right: equivalent and minimal." : wrong.length ? `✗ Not equivalent (wrong at minterm ${wrong[0]}). One minimal answer: ${res.expr}.` : `✗ Equivalent but not minimal. One minimal answer: ${res.expr}.`));
        } catch (e) { fb.replaceChildren(notice("error", e.message)); return; }
      } else {
        const ok = input.value !== "" && Number(input.value) === truth;
        input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
        fb.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right!" : `✗ It's ${truth}.`));
      }
      show();
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `F(${NAMES.slice(0, n).join(", ")}) = Σm(${f.ones.join(", ")})${f.dcs.length ? ` + d(${f.dcs.join(", ")})` : ""}`),
      h("div", { class: "chart-wrap km-wrap" }, kmapSvg(n, values, {})),
      h("p", null, ask, kind === "sop" ? h("span", { class: "muted small" }, " Use ' for NOT, e.g. AB' + C.") : null),
      h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: check }, "Check")), fb, solution));
  }

  sync();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => { players.forEach((x) => x.destroy()); v3.disposeAll(); };
}
