import { COMPLEXITY, PROBLEMS, run } from "../engines/dp.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { treeDiagram } from "../diagram.js";
import { h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { arrowDefs, curve, glide, legend, practiceCard, shuffle, summaryTable, toolbar } from "./dsa-motion.js";

const EXAMPLES = {
  clrs: { name: "LCS of ABCBDAB and BDCABA (CLRS)", problem: "lcs", input: { a: "ABCBDAB", b: "BDCABA" } },
  dna: { name: "LCS of two DNA strands", problem: "lcs", input: { a: "GXTXAYB", b: "AGGTAB" } },
  kitten: { name: "Edit distance: kitten → sitting", problem: "edit", input: { a: "kitten", b: "sitting" } },
  sunday: { name: "Edit distance: sunday → saturday", problem: "edit", input: { a: "sunday", b: "saturday" } },
  knap: { name: "Knapsack: W = 7, four items", problem: "knapsack", input: { w: "1 3 4 5", v: "1 4 5 7", cap: 7 } },
  knap2: { name: "Knapsack: W = 10, five items", problem: "knapsack", input: { w: "5 4 6 3 2", v: "10 40 30 50 15", cap: 10 } },
  ways: { name: "Ways to make 5 from {1, 2, 5}", problem: "coinWays", input: { coins: "1 2 5", amount: 5 } },
  ways2: { name: "Ways to make 10 from {2, 3, 5, 6}", problem: "coinWays", input: { coins: "2 3 5 6", amount: 10 } },
  greedy: { name: "Fewest coins where greedy fails: {1, 3, 4}, 6", problem: "coinMin", input: { coins: "1 3 4", amount: 6 } },
  min11: { name: "Fewest coins: {1, 2, 5}, 11", problem: "coinMin", input: { coins: "1 2 5", amount: 11 } },
  mcm: { name: "Matrix chain, six matrices (CLRS)", problem: "mcm", input: { p: "30 35 15 5 10 20 25" } },
  mcm4: { name: "Matrix chain, four matrices", problem: "mcm", input: { p: "10 20 30 40 30" } },
  lis: { name: "LIS of 10 9 2 5 3 7 101 18", problem: "lis", input: { a: "10 9 2 5 3 7 101 18" } },
  lis2: { name: "LIS of 0 8 4 12 2 10 6 14 1 9", problem: "lis", input: { a: "0 8 4 12 2 10 6 14 1 9" } },
  fib: { name: "Fibonacci: memoised fib(6)", problem: "fibMemo", input: { n: 6 } },
  fibt: { name: "Fibonacci: table up to 12", problem: "fibTable", input: { n: 12 } },
};

const BLURB = {
  lcs: "c[i][j] = length of the LCS of the first i letters of A and the first j letters of B.",
  edit: "D[i][j] = fewest edits turning the first i letters of “from” into the first j letters of “to”. Letters in cells: = keep, S substitute, D delete, I insert.",
  knapsack: "K[i][w] = best value using only items 1 … i with capacity w. Rows are labelled “item (weight, value)”; ✓ marks cells where taking the item won.",
  coinWays: "ways[i][a] = number of ways to pay a using only the first i coin types.",
  coinMin: "M[i][a] = fewest coins to pay a using only the first i coin types (∞ = impossible).",
  mcm: "m[i][j] = cheapest way to multiply Ai … Aj; the small k is s[i][j], where the best split goes. Only cells with i ≤ j are used.",
  lis: "Row L holds the longest increasing run ending at each index; prev points to the element before it in that run.",
  fibMemo: "The call tree grows as the recursion runs. Green nodes are answered straight from the memo.",
  fibTable: "Bottom-up: fill F from the left, so every value you need is already there.",
};

// The table as SVG so the cursor can glide between cells and arrows can run
// from the cells a value depends on.
function gridSvg(res, st, { hide = null } = {}) {
  const rows = res.rowHeads.length, cols = res.colHeads.length;
  const longest = Math.max(2, ...res.steps.at(-1).cells.flat().filter(Boolean).map((c) => String(c.t).length), ...res.colHeads.map((x) => [...x].length));
  const subs = res.steps.at(-1).cells.flat().some((c) => c?.s);
  const CW = Math.max(38, longest * 9 + 16), CH = subs ? 42 : 34;
  const HW = Math.max(30, ...res.rowHeads.map((x) => [...x].length * 8 + 14)), X0 = 8 + HW, Y0 = 34;
  const W = X0 + cols * CW + 10, H = Y0 + rows * CH + 10;
  const cx = (j) => X0 + j * CW + CW / 2, cy = (i) => Y0 + i * CH + CH / 2;
  const key = (c) => `${c[0]},${c[1]}`;
  const deps = new Set((st.deps ?? []).map(key)), best = new Set((st.best ?? []).map(key)), path = new Set(st.path.map(key));
  const els = [];
  const defs = arrowDefs("dep", "best");
  res.colHeads.forEach((t, j) => els.push(h("text", { x: cx(j), y: Y0 - 12, "text-anchor": "middle", class: "dp-head" }, t === "" ? "∅" : t)));
  res.rowHeads.forEach((t, i) => els.push(h("text", { x: X0 - 8, y: cy(i) + 4.5, "text-anchor": "end", class: "dp-head" }, t === "" ? "∅" : t)));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const c = st.cells[i][j], k = `${i},${j}`, unused = res.lower && i > j;
    const cls = ["dp-cell", unused && "unused", deps.has(k) && "dep", best.has(k) && "best", path.has(k) && "path", st.take && key(st.take) === k && "take"].filter(Boolean).join(" ");
    els.push(h("rect", { x: X0 + j * CW, y: Y0 + i * CH, width: CW, height: CH, class: cls }));
    if (c && !(hide && hide[0] === i && hide[1] === j)) els.push(h("g", { class: "dp-val", "data-k": `v:${k}`, "data-x": cx(j), "data-y": cy(i) },
      h("text", { x: cx(j), y: cy(i) + (c.s ? 0 : 5), "text-anchor": "middle" }, c.t),
      c.s ? h("text", { x: cx(j), y: cy(i) + 14, "text-anchor": "middle", class: "dp-sub" }, c.s) : null));
  }
  // Traceback path, drawn through the cell centres.
  if (st.path.length > 1) els.push(h("polyline", { class: "dp-path", points: st.path.map(([i, j]) => `${cx(j)},${cy(i)}`).join(" ") }));
  (st.deps ?? []).forEach((d, n) => {
    if (!st.cur) return;
    const [i, j] = st.cur, on = best.has(key(d));
    const x1 = cx(d[1]), y1 = cy(d[0]), x2 = cx(j), y2 = cy(i);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, sh = Math.min(CW, CH) * 0.32;
    els.push(h("path", { class: `dp-arrow${on ? " best" : ""}`, "data-tw": `dep${n}`, "marker-end": `url(#${defs.id}-${on ? "best" : "dep"})`,
      d: curve(x1 + ((x2 - x1) / len) * sh, y1 + ((y2 - y1) / len) * sh, x2 - ((x2 - x1) / len) * sh, y2 - ((y2 - y1) / len) * sh, d[0] === i ? 10 : 0) }));
  });
  if (st.cur) els.push(h("rect", { class: "dp-cur", "data-tw": "cur", x: X0 + st.cur[1] * CW + 1.5, y: Y0 + st.cur[0] * CH + 1.5, width: CW - 3, height: CH - 3, rx: 5 }));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "dp-svg", role: "img", "aria-label": `DP table, ${rows} by ${cols}`, style: `max-width:${Math.max(W * 1.15, 300)}px;min-width:${Math.min(W, 520)}px` }, defs.el, els);
}

export function render(root) {
  const p = readParams();
  const problem = PROBLEMS[p.get("problem")] ? p.get("problem") : "lcs";
  const state = { problem, input: Object.fromEntries(PROBLEMS[problem].params.map((q) => [q.key, p.get(q.key) ?? q.def])) };
  let player = null;
  const head = page({
    subject: "Data structures & algorithms", title: "Dynamic programming",
    lede: "Watch DP tables fill cell by cell: the cells each answer depends on light up, then the traceback walks back to the solution. LCS, edit distance, knapsack, coin change, matrix chain, LIS and Fibonacci.",
    theory: h("div", null,
      h("p", null, "Dynamic programming works when a problem has ", h("b", null, "optimal substructure"), " (the best answer is built from best answers to smaller versions) and ", h("b", null, "overlapping subproblems"), " (plain recursion would solve the same small problems over and over). Solve each subproblem once and store it."),
      h("p", null, h("b", null, "Top-down"), " (memoisation) keeps the recursive code and caches each result; ", h("b", null, "bottom-up"), " (tabulation) fills a table in an order where every cell's inputs are already done. Both turn Fibonacci's exponential recursion into O(n)."),
      h("p", null, "To design one, ask: what does a cell mean? What choice does the last step make (take this item or not, match these letters or drop one, where to split the chain)? Each choice points to smaller cells, and the recurrence takes the best of them. The table gives the optimal ", h("i", null, "value"), "; walking back through the choices that produced it, the ", h("b", null, "traceback"), ", recovers the solution itself.")),
    conventions: ["Strings and items are numbered from 1; row and column 0 are the empty prefix (∅) or no items.", "LCS traceback goes ↑ on ties (as in CLRS); edit distance prefers keep/substitute, then delete, then insert. Other tie-breaks give different but equally good answers.", "Matrix Ai is p[i−1] × p[i]. Coin change ways counts combinations (1+2 and 2+1 are the same way)."],
  });

  const probSel = h("select", { "aria-label": "Problem", onchange: (e) => { state.problem = e.target.value; state.input = Object.fromEntries(PROBLEMS[state.problem].params.map((q) => [q.key, q.def])); fields(); update(); } },
    Object.entries(PROBLEMS).map(([k, v]) => h("option", { value: k, selected: k === state.problem }, v.name)));
  const fieldRow = h("div", { class: "row" });
  function fields() {
    fieldRow.replaceChildren(...PROBLEMS[state.problem].params.map((q) => h("label", { class: "stack", style: `margin:0;${q.num ? "" : "flex:1;min-width:140px"}` }, q.label,
      h("input", { type: q.num ? "number" : "text", class: q.num ? null : "mono wide", value: state.input[q.key], "aria-label": q.label, style: q.num ? null : "min-width:120px",
        oninput: (e) => { state.input[q.key] = e.target.value; update(); } }))));
  }
  const msg = h("div"), out = h("div", { class: "output" });
  const set = (prob, input) => { state.problem = prob; state.input = { ...Object.fromEntries(PROBLEMS[prob].params.map((q) => [q.key, q.def])), ...input }; probSel.value = prob; fields(); update(); };

  function update() {
    player?.destroy();
    writeParams({ problem: state.problem, ...state.input });
    probSel.value = state.problem;
    let res;
    try { res = run(state.problem, state.input); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const P = PROBLEMS[state.problem], code = codePanel(P.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), treeBox = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const counters = h("div", { class: "stats-row" }), total = res.steps.at(-1).cells.flat().filter(Boolean).length;
    treeBox.hidden = state.problem !== "fibMemo";
    player = stepper({
      count: res.steps.length, label: "Step", interval: state.problem === "mcm" ? 900 : 700,
      render: (i) => {
        const st = res.steps[i];
        glide(stage, gridSvg(res, st));
        if (st.tree) morph(treeBox, treeDiagram(st.tree, { lit: st.lit ?? [], aria: "Recursion tree", gapY: 54 }));
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : ""}`;
        const filled = st.cells.flat().filter(Boolean).length;
        counters.replaceChildren(
          stat(state.problem === "fibMemo" ? "Calls" : "Cells filled", state.problem === "fibMemo" ? st.calls : `${filled} / ${total}`),
          stat(state.problem === "fibMemo" ? "Memo hits" : "Inputs to this cell", state.problem === "fibMemo" ? st.hits : (st.deps?.length ?? "–")),
          stat("Answer", st.done ? (res.answer === -1 ? "impossible" : res.answer) : "…"),
          stat("Solution", st.done ? res.detail || "–" : "…", true));
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, P.name), player.el, note,
        traceLayout(h("div", null, treeBox, stage, h("p", { class: "muted small" }, BLURB[state.problem]),
          legend([["Cell being filled", "var(--accent)"], ["Cells it reads", "var(--series-4)"], ["The one that wins", "var(--series-2)"], ["Traceback", "var(--good)"]])), code, vars),
        counters),
      h("section", { class: "card" }, h("h2", null, "Complexity"),
        summaryTable(["Problem", "Time", "Space", "The choice at each step"], COMPLEXITY, state.problem)));
  }

  const random = () => {
    const r = rng(), pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(r() * s.length)]).join("");
    const ints = (n, lo, hi) => Array.from({ length: n }, () => lo + Math.floor(r() * (hi - lo + 1))).join(" ");
    const gen = {
      lcs: () => ({ a: pick("ABCD", 5 + Math.floor(r() * 3)), b: pick("ABCD", 5 + Math.floor(r() * 3)) }),
      edit: () => ({ a: pick("abcde", 4 + Math.floor(r() * 3)), b: pick("abcde", 4 + Math.floor(r() * 3)) }),
      knapsack: () => { const n = 3 + Math.floor(r() * 2); return { w: ints(n, 1, 6), v: ints(n, 1, 20), cap: 6 + Math.floor(r() * 5) }; },
      coinWays: () => ({ coins: [...new Set(ints(3, 1, 6).split(" "))].join(" "), amount: 6 + Math.floor(r() * 7) }),
      coinMin: () => ({ coins: [...new Set(ints(3, 2, 7).split(" "))].join(" "), amount: 7 + Math.floor(r() * 9) }),
      mcm: () => ({ p: ints(5 + Math.floor(r() * 2), 2, 30) }),
      lis: () => ({ a: ints(8 + Math.floor(r() * 3), 1, 40) }),
      fibMemo: () => ({ n: 4 + Math.floor(r() * 4) }),
      fibTable: () => ({ n: 8 + Math.floor(r() * 10) }),
    };
    set(state.problem, gen[state.problem]());
  };
  fields();
  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, probSel, toolbar(EXAMPLES, (ex) => set(ex.problem, ex.input), random)),
      fieldRow, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = Math.floor(r() * 6);
    const pick = (s, n) => Array.from({ length: n }, () => s[Math.floor(r() * s.length)]).join("");
    let body;
    if (kind <= 1) {
      // Fill in one cell, with the table drawn up to just before it.
      const prob = kind === 0 ? "lcs" : "edit", input = { a: pick("ABC", 4 + Math.floor(r() * 2)), b: pick("ABC", 4 + Math.floor(r() * 2)) };
      const res = run(prob, input), fills = res.steps.filter((s) => s.cur && s.deps?.length && !s.done && s.line !== 9 && s.line !== 7);
      const st = fills[Math.floor(fills.length * (0.5 + r() * 0.5)) - 1] ?? fills.at(-1), [i, j] = st.cur, ans = res.table[i][j];
      const holder = h("div", { class: "chart-wrap" });
      holder.append(gridSvg(res, { ...st, deps: [], best: [], path: [] }, { hide: st.cur }));
      body = [h("h2", null, `${prob === "lcs" ? "LCS" : "Edit distance"}: what goes in the highlighted cell (row ${i}, column ${j})?`), holder,
        numberQuestion(ans, st.note)];
    } else if (kind === 2) {
      const n = 3 + Math.floor(r() * 2), input = { w: Array.from({ length: n }, () => 1 + Math.floor(r() * 5)).join(" "), v: Array.from({ length: n }, () => 1 + Math.floor(r() * 15)).join(" "), cap: 5 + Math.floor(r() * 4) };
      const res = run("knapsack", input);
      body = [h("h2", null, `0/1 knapsack with capacity ${input.cap}: what is the best total value?`),
        h("p", { class: "grammar-box" }, input.w.split(" ").map((w, i) => `item ${i + 1}: weight ${w}, value ${input.v.split(" ")[i]}`).join("\n")),
        numberQuestion(res.answer, `Take ${res.detail}: value ${res.answer}.`)];
    } else if (kind === 3) {
      const fewest = r() < 0.5, coins = [...new Set([fewest ? 1 : 1 + Math.floor(r() * 2), 3 + Math.floor(r() * 2), 5 + Math.floor(r() * 3)])].join(" "), amount = 6 + Math.floor(r() * 7);
      const res = run(fewest ? "coinMin" : "coinWays", { coins, amount });
      body = [h("h2", null, fewest ? `What is the fewest number of coins from {${coins.replace(/ /g, ", ")}} that make ${amount}?` : `How many ways can you make ${amount} from coins {${coins.replace(/ /g, ", ")}}? (Order doesn't matter.)`),
        numberQuestion(res.answer, fewest ? `${amount} = ${res.detail}.` : `The last cell of the table holds ${res.answer}.`)];
    } else if (kind === 4) {
      const p = Array.from({ length: 4 }, () => 2 + Math.floor(r() * 9) * 2);
      if (p[0] * p[1] * p[2] + p[0] * p[2] * p[3] === p[1] * p[2] * p[3] + p[0] * p[1] * p[3]) return newQuestion();
      const res = run("mcm", { p: p.join(" ") });
      const alt = `(A1A2)A3`, alt2 = `A1(A2A3)`, right = res.order.replace(/^\((.*)\)$/, "$1");
      body = [h("h2", null, `A1 is ${p[0]}×${p[1]}, A2 is ${p[1]}×${p[2]}, A3 is ${p[2]}×${p[3]}. Which order needs the fewest scalar multiplications?`),
        choice(shuffle([alt, alt2].map((o) => ({ label: o, correct: o === right })), r), `(A1A2)A3 costs ${p[0] * p[1] * p[2] + p[0] * p[2] * p[3]}; A1(A2A3) costs ${p[1] * p[2] * p[3] + p[0] * p[1] * p[3]}. Minimum: ${res.answer}.`)];
    } else {
      const a = Array.from({ length: 8 }, () => 1 + Math.floor(r() * 30));
      const res = run("lis", { a: a.join(" ") });
      body = [h("h2", null, "How long is the longest strictly increasing subsequence?"), h("p", { class: "grammar-box" }, a.join(", ")),
        numberQuestion(res.answer, `One longest one is ${res.detail}.`)];
    }
    practiceCard(practice, newQuestion, body);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
