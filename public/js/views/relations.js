import {
  EXAMPLES, LATTICE_CODE, PROPERTY_CODE, WARSHALL_CODE, bell, bruteCounts, classes, countPairs, counts, divisibility, divisorsOf, equivalenceClosure,
  hasse, lattice, pairsOf, parsePairs, parseSet, powerSet, properties, propertySteps, randomRelation, reflexiveClosure, showPairs, stirling2,
  symmetricClosure, warshall,
} from "../engines/relations.js";
import { h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, numberQuestion, stat } from "./kit.js";
import { linkButton, numberInput, reveal, select, shell, table, traceCard, yesNo } from "./dm-kit.js";

const MODES = {
  props: "Properties",
  closure: "Closures (Warshall)",
  classes: "Equivalence classes",
  poset: "Partial order, Hasse diagram, lattice",
  count: "Counting relations and functions",
};
const key = (i, j) => `${i},${j}`;
const fmt = (x) => (x == null ? "-" : String(x).length > 5 ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(x));

// The relation as a 0/1 matrix. hot / added: lists of [i, j].
function matrixView(M, els, { hot = [], added = [], row = -1, col = -1 } = {}) {
  const H = new Set(hot.map(([i, j]) => key(i, j))), A = new Set(added.map(([i, j]) => key(i, j)));
  return h("div", { class: "table-wrap" }, h("table", { class: "parse dm-matrix" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "R"), els.map((e, j) => h("th", { scope: "col", class: j === col ? "hotcol" : null }, e)))),
    h("tbody", null, M.map((r, i) => h("tr", { class: i === row ? "hotrow" : null }, h("th", { scope: "row", class: i === row ? "hotcol" : null }, els[i]),
      r.map((x, j) => h("td", { class: [x ? "one" : "zero", H.has(key(i, j)) && "hot", A.has(key(i, j)) && "added", j === col && "colk"].filter(Boolean).join(" ") }, x ? "1" : "0")))))));
}

// The relation as a digraph on a circle, with loops for (a, a).
let uid = 0;
function digraph(M, els, { hot = [], added = [] } = {}) {
  const n = els.length, R = n <= 4 ? 80 : 104, cx = 150, cy = 140, id = `dmg${++uid}`;
  const pos = els.map((_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; });
  const H = new Set(hot.map(([i, j]) => key(i, j))), A = new Set(added.map(([i, j]) => key(i, j)));
  const edges = [];
  M.forEach((r, i) => r.forEach((x, j) => {
    if (!x) return;
    const cls = `dm-arc${H.has(key(i, j)) ? " hot" : ""}${A.has(key(i, j)) ? " added" : ""}`;
    const p = pos[i], q = pos[j];
    if (i === j) {
      const ox = Math.cos(p.a) * 26, oy = Math.sin(p.a) * 26;
      edges.push(h("circle", { cx: p.x + ox, cy: p.y + oy, r: 11, class: `${cls} loop` }));
      return;
    }
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const s = { x: p.x + ux * 17, y: p.y + uy * 17 }, t = { x: q.x - ux * 19, y: q.y - uy * 19 };
    const bend = M[j][i] ? 14 : 0, mx = (s.x + t.x) / 2 - uy * bend, my = (s.y + t.y) / 2 + ux * bend;
    edges.push(h("path", { d: `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${t.x.toFixed(1)},${t.y.toFixed(1)}`, class: cls, "marker-end": `url(#${id}-${H.has(key(i, j)) ? "h" : A.has(key(i, j)) ? "a" : "n"})` }));
  }));
  const marker = (k, cls) => h("marker", { id: `${id}-${k}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", class: `dm-head ${cls}` }, h("path", { d: "M0,0 L10,5 L0,10 z" }));
  return h("svg", { viewBox: "0 0 300 280", class: "dm-digraph", role: "img", "aria-label": `Digraph of R: ${showPairs(pairsOf(M, els))}` },
    h("defs", null, marker("n", ""), marker("h", "hot"), marker("a", "added")), edges,
    pos.map((p, i) => h("g", { class: "dm-vert" }, h("circle", { cx: p.x, cy: p.y, r: 15 }), h("text", { x: p.x, y: p.y + 4.5, "text-anchor": "middle" }, els[i]))));
}

// Hasse diagram: levels bottom to top. lit: element indexes to highlight.
function hasseSvg(H, els, { lit = [] } = {}) {
  const levels = [];
  H.level.forEach((l, i) => (levels[l] ??= []).push(i));
  const W = Math.max(260, Math.max(...levels.map((l) => l.length)) * 74 + 40), gap = 72, Ht = levels.length * gap + 30;
  const pos = [];
  levels.forEach((l, k) => l.forEach((i, m) => { pos[i] = { x: (W * (m + 1)) / (l.length + 1), y: Ht - 30 - k * gap }; }));
  const L = new Set(lit);
  const w = (i) => Math.max(30, els[i].length * 8 + 14);
  return h("svg", { viewBox: `0 0 ${W} ${Ht}`, class: "dm-hasse", role: "img", style: `max-width:${W * 1.3}px`, "aria-label": `Hasse diagram with covering pairs ${H.covers.map(([a, b]) => `${els[a]} below ${els[b]}`).join(", ")}` },
    H.covers.map(([a, b]) => h("line", { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, class: `dm-cover${L.has(a) && L.has(b) ? " hot" : ""}` })),
    els.map((e, i) => h("g", { class: `dm-hnode${L.has(i) ? " hot" : ""}` }, h("rect", { x: pos[i].x - w(i) / 2, y: pos[i].y - 14, width: w(i), height: 28, rx: 14 }), h("text", { x: pos[i].x, y: pos[i].y + 4.5, "text-anchor": "middle" }, e))));
}

const pair = (M, els, opts) => h("div", { class: "dm-pair" }, matrixView(M, els, opts), h("div", { class: "dm-graph-box" }, digraph(M, els, opts)));

function propsMode(M, els) {
  const { props, steps } = propertySteps(M, els);
  const card = traceCard({ title: "Checking each property", steps, code: PROPERTY_CODE, interval: 1200, draw: (st) => pair(M, els, { hot: st.hot }) });
  const summary = h("section", { class: "card" }, h("h2", null, "Summary"),
    h("div", { class: "stats-row" }, ["reflexive", "symmetric", "antisymmetric", "transitive"].map((k) => stat(k[0].toUpperCase() + k.slice(1), yesNo(props[k].ok))),
      stat("Equivalence", yesNo(props.equivalence)), stat("Partial order", yesNo(props.partialOrder))),
    h("p", { class: "muted small" }, `R = ${showPairs(pairsOf(M, els))}, ${countPairs(M)} pairs.`));
  return { els: [card.el, summary], destroy: card.destroy };
}

function closureMode(M, els) {
  const w = warshall(M, els);
  const card = traceCard({ title: "Transitive closure by Warshall's algorithm", steps: w.steps, code: WARSHALL_CODE, interval: 1000,
    draw: (st) => pair(st.W, els, { added: st.added, row: st.i, col: st.k >= 0 && st.k < els.length ? st.k : -1 }) });
  const rows = [
    ["Reflexive closure", reflexiveClosure(M), "add every (a, a)"],
    ["Symmetric closure", symmetricClosure(M), "add (b, a) for every (a, b)"],
    ["Transitive closure R⁺", w.closure, "Warshall, above"],
    ["Reflexive transitive closure R*", reflexiveClosure(w.closure), "R⁺ plus every (a, a)"],
    ["Equivalence closure", equivalenceClosure(M), "reflexive, then symmetric, then transitive"],
  ];
  return { els: [card.el, h("section", { class: "card" }, h("h2", null, "Every closure of R"),
    table(["Closure", "Pairs", "How", "Result"], rows.map(([name, C, how]) => [name, countPairs(C), how, showPairs(pairsOf(C, els))]), { cls: (_, c) => (c === 3 ? "left wrap" : null) }),
    h("p", { class: "muted small" }, "The closure is the smallest relation containing R that has the property. Order matters for the equivalence closure: take the symmetric closure before the transitive one."))], destroy: card.destroy };
}

function classesMode(M, els) {
  const p = properties(M, els);
  const E = p.equivalence ? M : equivalenceClosure(M);
  const cls = classes(E, els);
  const colourOf = new Map(cls.flatMap((c, k) => c.map((e) => [e, k])));
  const seen = new Set(), steps = [];
  if (!p.equivalence) steps.push({ line: 1, vars: { equivalence: false }, tone: "bad", note: `R isn't an equivalence relation (${["reflexive", "symmetric", "transitive"].filter((k) => !p[k].ok).map((k) => `not ${k}: ${p[k].witness.text}`).join("; ")}). Use its equivalence closure instead.` });
  els.forEach((e, i) => {
    if (seen.has(e)) return;
    const c = cls.find((x) => x.includes(e));
    c.forEach((x) => seen.add(x));
    steps.push({ i, upto: colourOf.get(e), line: 2, vars: { a: e, "[a]": `{${c.join(", ")}}` }, note: `${e} isn't in a class yet. Its row lists everything related to it: [${e}] = {${c.join(", ")}}.` });
  });
  steps.push({ i: -1, upto: cls.length, line: 3, tone: "good", vars: { classes: cls.length }, note: `${cls.length} class${cls.length === 1 ? "" : "es"}: ${cls.map((c) => `{${c.join(", ")}}`).join(", ")}. They don't overlap and they cover the set: a partition.` });
  const code = ["if R is not an equivalence relation then R ← its equivalence closure", "for each a not yet in a class: [a] ← { b : (a, b) ∈ R }", "the classes partition the set"];
  const card = traceCard({ title: "Equivalence classes", steps, code,
    draw: (st) => h("div", { class: "dm-pair" }, matrixView(E, els, { row: st.i }),
      h("div", { class: "dm-classes" }, cls.map((c, k) => h("div", { class: `dm-class${k <= (st.upto ?? -1) ? " on" : ""}`, style: `--c:var(--series-${(k % 8) + 1})` }, c.map((x) => h("span", null, x)))))) });
  return { els: [card.el], destroy: card.destroy };
}

function posetMode(M, els) {
  const p = properties(M, els);
  if (!p.partialOrder) {
    const why = ["reflexive", "antisymmetric", "transitive"].filter((k) => !p[k].ok).map((k) => `not ${k} (${p[k].witness.text})`);
    return { els: [h("section", { class: "card" }, h("h2", null, "Not a partial order"), notice("bad", `A partial order must be reflexive, antisymmetric and transitive. This relation is ${why.join("; ")}.`), pair(M, els, { hot: ["reflexive", "antisymmetric", "transitive"].flatMap((k) => p[k].witness?.cells ?? []) }))], destroy: null };
  }
  const H = hasse(M, els), L = lattice(M, els);
  const steps = [
    { lit: [], line: null, vars: { pairs: countPairs(M) }, note: `R is reflexive, antisymmetric and transitive: a partial order with ${countPairs(M)} pairs.`, hasse: false },
    { lit: [], line: null, vars: { "covering pairs": H.covers.length, removed: H.removed }, note: `Hasse diagram: drop the ${els.length} loops and every pair implied by transitivity. ${H.covers.length} covering pairs are left (a is covered by b when nothing sits strictly between them). Larger elements go higher.`, hasse: true },
    { lit: [...H.minimal, ...H.maximal], line: null, vars: { minimal: H.minimal.map((i) => els[i]), maximal: H.maximal.map((i) => els[i]) }, hasse: true,
      note: `Minimal: ${H.minimal.map((i) => els[i]).join(", ")}; maximal: ${H.maximal.map((i) => els[i]).join(", ")}. ${H.least != null ? `Least element ${els[H.least]}` : "No least element"}, ${H.greatest != null ? `greatest element ${els[H.greatest]}` : "no greatest element"}.` },
    ...L.steps.map((s) => ({ ...s, lit: s.hot, hasse: true })),
  ];
  const card = traceCard({ title: "Hasse diagram and lattice check", steps, code: LATTICE_CODE, interval: 1100,
    draw: (st) => (st.hasse ? hasseSvg(H, els, { lit: st.lit }) : matrixView(M, els)) });
  const verdict = h("section", { class: "card" }, h("h2", null, L.isLattice ? "A lattice" : "Not a lattice"),
    h("div", { class: "stats-row" }, stat("Lattice", yesNo(L.isLattice)), stat("Distributive", L.isLattice ? yesNo(L.distributive) : "-"), stat("Complemented", L.isLattice ? yesNo(L.complemented) : "-"), stat("Boolean algebra", L.isLattice ? yesNo(L.distributive && L.complemented) : "-")),
    L.isLattice ? table(["∨ (join)", ...els], els.map((a, i) => [a, ...els.map((_, j) => els[L.join[i][j]])])) : null,
    L.isLattice ? h("p", { class: "muted small" }, `Complements: ${els.map((e, i) => `${e} → ${L.complements[i].length ? L.complements[i].map((j) => els[j]).join(" or ") : "none"}`).join("; ")}. In a distributive lattice a complement, when it exists, is unique.`) : null);
  return { els: [card.el, verdict], destroy: card.destroy };
}

function countMode(n, m) {
  const rows = counts(n, m);
  const brute = n <= 3 && n === m ? bruteCounts(n) : null;
  const bellRow = Array.from({ length: 9 }, (_, i) => bell(i));
  return { els: [h("section", { class: "card" }, h("h2", null, `|A| = ${n}, |B| = ${m}`),
    table(["What", "Formula", "Here", "Count", ...(brute ? ["By brute force"] : [])], rows.map((r) => [r.name, r.formula, r.work, fmt(r.value), ...(brute ? [brute[r.id] != null ? String(brute[r.id]) : ""] : [])]), { cls: (_, c) => (c === 3 ? "num" : null) }),
    h("p", { class: "muted small" }, "Why: a relation on A is any subset of the n² ordered pairs. Reflexive fixes the n diagonal pairs. Symmetric pairs up (a, b) with (b, a): n diagonal + n(n−1)/2 off-diagonal choices. Antisymmetric: each diagonal pair in or out (2ⁿ), and each off-diagonal pair {a, b} has 3 choices: neither, (a, b) only, or (b, a) only."),
    brute ? h("p", { class: "muted small" }, `With n = ${n} the brute-force column checks every one of the 2^${n * n} relations.`) : null),
  h("section", { class: "card" }, h("h2", null, "Bell numbers and Stirling numbers"),
    h("p", null, "An equivalence relation is the same thing as a partition, so there are Bₙ of them. S(n, k) counts partitions into exactly k blocks, and Bₙ = Σₖ S(n, k)."),
    table(["n", ...Array.from({ length: 9 }, (_, i) => String(i))], [["Bₙ", ...bellRow.map(String)], ...[1, 2, 3, 4].map((k) => [`S(n, ${k})`, ...Array.from({ length: 9 }, (_, i) => String(stirling2(i, k)))])]))], destroy: null };
}

// --- Practice ----------------------------------------------------------------------------
function question(r) {
  const kind = ["count", "count", "props", "closure", "hasse", "classes"][Math.floor(r() * 6)];
  if (kind === "count") {
    const n = 2 + Math.floor(r() * 3), m = 2 + Math.floor(r() * 3);
    const ids = ["reflexive", "symmetric", "antisymmetric", "equivalence", "functions", "injective", "surjective", "relations"];
    const id = ids[Math.floor(r() * ids.length)];
    const row = counts(n, ["functions", "injective", "surjective"].includes(id) ? m : n).find((x) => x.id === id);
    const what = { reflexive: `reflexive relations on a set of ${n} elements`, symmetric: `symmetric relations on a set of ${n} elements`, antisymmetric: `antisymmetric relations on a set of ${n} elements`, equivalence: `equivalence relations on a set of ${n} elements`,
      relations: `relations on a set of ${n} elements`, functions: `functions from a ${n}-element set to a ${m}-element set`, injective: `one-to-one functions from a ${n}-element set to a ${m}-element set`, surjective: `onto functions from a ${n}-element set to a ${m}-element set` }[id];
    return [h("h2", null, `How many ${what}?`), numberQuestion(Number(row.value), `${row.formula}: ${row.work} = ${fmt(row.value)}.`)];
  }
  const els = ["1", "2", "3", "4"];
  const M = randomRelation(r, 4, 0.4);
  if (kind === "props") {
    const p = properties(M, els);
    const prop = ["reflexive", "symmetric", "antisymmetric", "transitive"][Math.floor(r() * 4)];
    return [h("h2", null, `Is R ${prop}?`), h("p", null, `On {1, 2, 3, 4}, R = ${showPairs(pairsOf(M, els))}.`), pair(M, els),
      choice([{ label: "Yes", correct: p[prop].ok }, { label: "No", correct: !p[prop].ok }], p[prop].ok ? "No pair breaks the rule." : `No: ${p[prop].witness.text}.`)];
  }
  if (kind === "closure") {
    const T = warshall(M, els).closure;
    return [h("h2", null, "How many pairs are in the transitive closure of R?"), h("p", null, `On {1, 2, 3, 4}, R = ${showPairs(pairsOf(M, els))}.`), pair(M, els),
      numberQuestion(countPairs(T), `R⁺ = ${showPairs(pairsOf(T, els))}.`), reveal("Show the closure", () => pair(T, els, { added: T.flatMap((row, i) => row.map((x, j) => (x && !M[i][j] ? [i, j] : null)).filter(Boolean)) }))];
  }
  if (kind === "classes") {
    const E = equivalenceClosure(M), cls = classes(E, els);
    return [h("h2", null, "How many equivalence classes does the equivalence closure of R have?"), h("p", null, `On {1, 2, 3, 4}, R = ${showPairs(pairsOf(M, els))}.`),
      numberQuestion(cls.length, `Classes: ${cls.map((c) => `{${c.join(", ")}}`).join(", ")}.`)];
  }
  const n = [6, 8, 12, 18, 20, 24, 30, 36][Math.floor(r() * 8)];
  const { els: E, M: D } = divisibility(divisorsOf(n));
  const H = hasse(D, E), L = lattice(D, E);
  if (r() < 0.5) return [h("h2", null, `How many edges does the Hasse diagram of (D${n}, |) have?`), h("p", null, `D${n} = {${E.join(", ")}}, ordered by divisibility.`),
    numberQuestion(H.covers.length, `Each edge joins d to d·p for a prime p: ${H.covers.map(([a, b]) => `${E[a]}-${E[b]}`).join(", ")}.`), reveal("Show the diagram", () => h("div", { class: "chart-wrap dm-stage" }, hasseSvg(H, E)))];
  return [h("h2", null, `Is (D${n}, |) a Boolean algebra?`), h("p", null, `D${n} = {${E.join(", ")}}, ordered by divisibility. (It's always a distributive lattice.)`),
    choice([{ label: "Yes", correct: L.complemented }, { label: "No", correct: !L.complemented }], L.complemented ? `${n} is square-free, so every divisor d has the complement ${n}/d.` : `${n} has a squared prime factor, so some divisor has no complement (for example ${E[L.complements.findIndex((c) => !c.length)]}).`)];
}

export function render(root) {
  const p = readParams();
  const state = { mode: MODES[p.get("mode")] ? p.get("mode") : "props", set: p.get("set") ?? EXAMPLES.sample.set, r: p.get("r") ?? EXAMPLES.sample.pairs, n: Number(p.get("n")) || 3, m: Number(p.get("m")) || 3 };
  const head = page({
    subject: "Discrete maths", title: "Sets and relations",
    lede: "A relation drawn as a matrix and a digraph at once. Check its properties, build closures with Warshall's algorithm, split it into classes, draw a Hasse diagram and test for a lattice.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "relation"), " R on a set A is a set of ordered pairs from A × A. In the matrix, row a column b is 1 when (a, b) ∈ R; in the digraph that's an arrow a → b, and (a, a) is a loop."),
      h("ul", null,
        h("li", null, h("b", null, "Reflexive"), ": every loop present (all 1s on the diagonal). ", h("b", null, "Symmetric"), ": the matrix equals its transpose. ", h("b", null, "Antisymmetric"), ": never both (a, b) and (b, a) for a ≠ b. ", h("b", null, "Transitive"), ": a → b → c forces a → c."),
        h("li", null, "An ", h("b", null, "equivalence relation"), " (reflexive, symmetric, transitive) splits A into disjoint ", h("b", null, "classes"), ". A ", h("b", null, "partial order"), " (reflexive, antisymmetric, transitive) is drawn as a ", h("b", null, "Hasse diagram"), ": no loops, no arrows implied by transitivity, larger elements higher."),
        h("li", null, "A ", h("b", null, "lattice"), " is a partial order where every pair has a least upper bound (join, ∨) and a greatest lower bound (meet, ∧). It is ", h("b", null, "distributive"), " when ∧ distributes over ∨, and ", h("b", null, "complemented"), " when every element has a complement."),
        h("li", null, h("b", null, "Warshall's algorithm"), " finds the transitive closure in n rounds: in round k, any i that reaches k also gets everything k reaches."))),
    conventions: [
      "Write pairs any way you like: (1,2) (2,3), or 1 2, 2 3. Elements are separated by spaces.",
      "Warshall's rounds go through the elements in the order you listed them.",
      "The Hasse diagram puts each element on the level of the longest chain below it.",
      "Partial-order and lattice checks use the relation exactly as given: it must already be reflexive, antisymmetric and transitive.",
      "Counting formulas: n = |A|, m = |B|. Partial orders have no closed formula; the values come from OEIS A001035.",
    ],
  });
  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  let destroy = null;
  const presets = Object.fromEntries(Object.entries(EXAMPLES).map(([k, v]) => [k, v.name]));
  function loadPreset(k) {
    const ex = EXAMPLES[k];
    state.set = ex.set;
    if (ex.build) { const els = parseSet(ex.set); state.r = pairsOf(ex.build(els), els).map(([a, b]) => `(${a},${b})`).join(" "); } else state.r = ex.pairs;
    if (["div12", "div30", "m3", "n5", "nolat"].includes(k)) state.mode = "poset";
    else if (k === "equiv") state.mode = "classes";
    else if (k === "chain") state.mode = "closure";
    drawInputs(); update();
  }
  function drawInputs() {
    const top = h("div", { class: "row" }, select(MODES, state.mode, (v) => { state.mode = v; drawInputs(); update(); }, "Mode"),
      state.mode === "count" ? null : select({ "": "Load an example…", ...presets }, "", (k) => k && loadPreset(k), "Example"),
      state.mode === "count" ? null : h("button", { type: "button", class: "btn ghost", onclick: () => {
        const r = rng(), els = parseSet(state.set);
        state.r = pairsOf(randomRelation(r, els.length, 0.3), els).map(([a, b]) => `(${a},${b})`).join(" "); drawInputs(); update();
      } }, "Random relation"),
      state.mode === "count" ? null : select({ "": "Divisibility on Dₙ…", ...Object.fromEntries([6, 8, 12, 16, 18, 20, 24, 30, 42].map((n) => [n, `D${n} = divisors of ${n}`])) }, "", (v) => {
        if (!v) return;
        const { els, M } = divisibility(divisorsOf(Number(v)));
        state.set = els.join(" "); state.r = pairsOf(M, els).map(([a, b]) => `(${a},${b})`).join(" "); state.mode = "poset"; drawInputs(); update();
      }, "Divisibility poset"),
      state.mode === "count" ? null : h("button", { type: "button", class: "btn ghost", onclick: () => {
        const { els, M } = powerSet(["a", "b", "c"]);
        const e2 = els.map((e) => (e === "∅" ? "0" : e));
        state.set = e2.join(" ");
        state.r = pairsOf(M, e2).map(([a, b]) => `(${a},${b})`).join(" "); state.mode = "poset"; drawInputs(); update();
      } }, "Subsets of {a, b, c} (0 = ∅)"),
      linkButton());
    const fields = state.mode === "count"
      ? [h("div", { class: "row" }, numberInput("|A| = n", state.n, (v) => { state.n = Math.max(1, Math.min(8, v)); update(); }, { min: 1, max: 8 }), numberInput("|B| = m", state.m, (v) => { state.m = Math.max(1, Math.min(8, v)); update(); }, { min: 1, max: 8 }))]
      : [h("label", { class: "stack" }, "Set A", h("input", { type: "text", class: "mono wide", value: state.set, "aria-label": "Set A", oninput: (e) => { state.set = e.target.value; update(); } })),
        h("label", { class: "stack" }, "Pairs in R", h("textarea", { rows: 3, class: "mono", spellcheck: "false", "aria-label": "Pairs in R", oninput: (e) => { state.r = e.target.value; update(); } }, state.r))];
    inputs.replaceChildren(top, ...fields);
  }
  function update() {
    destroy?.(); destroy = null;
    writeParams(state.mode === "count" ? { mode: "count", n: state.n, m: state.m } : { mode: state.mode, set: state.set, r: state.r });
    try {
      let res;
      if (state.mode === "count") res = countMode(state.n, state.m);
      else {
        const els = parseSet(state.set), M = parsePairs(state.r, els);
        res = { props: propsMode, closure: closureMode, classes: classesMode, poset: posetMode }[state.mode](M, els);
      }
      msg.replaceChildren(); out.replaceChildren(...res.els); destroy = res.destroy;
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }
  drawInputs();
  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);
  shell(root, head, visual, question);
  update();
  return () => destroy?.();
}

