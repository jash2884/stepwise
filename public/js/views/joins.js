import { ALGORITHMS, costs, EXAMPLE, join, JOINS, parseTable, randomTables, runAlgorithm, show } from "../engines/joins.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, reducedMotion, rng, stepper, writeParams } from "../ui.js";
import { mountTabs, numberQuestion, stat } from "./kit.js";

// Which regions of the Venn diagram each join keeps: [A only, both, B only].
const VENN = { inner: [0, 1, 0], left: [1, 1, 0], right: [0, 1, 1], full: [1, 1, 1], cross: [1, 1, 1], natural: [0, 1, 0], semi: [0, 1, 0], anti: [1, 0, 0] };
const COST_DEFAULT = "5000,100,10000,400,20"; // Silberschatz's student ⋈ takes
const n = (x) => x.toLocaleString("en-GB");

function venn(type) {
  const [a, both, b] = VENN[type];
  return h("svg", { viewBox: "0 0 120 64", class: "venn", role: "img", "aria-label": `${JOINS[type].name} keeps ${[a && "rows only in A", both && "matching rows", b && "rows only in B"].filter(Boolean).join(", ")}` },
    h("defs", null,
      h("clipPath", { id: "va" }, h("circle", { cx: 46, cy: 32, r: 26 }))),
    h("circle", { cx: 46, cy: 32, r: 26, class: a ? "on" : "off" }),
    h("circle", { cx: 74, cy: 32, r: 26, class: b ? "on" : "off" }),
    h("circle", { cx: 74, cy: 32, r: 26, "clip-path": "url(#va)", class: both ? "on both" : "off both" }),
    h("text", { x: 30, y: 36, "text-anchor": "middle" }, "A"), h("text", { x: 90, y: 36, "text-anchor": "middle" }, "B"));
}

function tableView(t, active, matched, cls) {
  return h("div", { class: "table-wrap" }, h("table", { class: `sqltable ${cls}` },
    h("caption", null, t.name),
    h("thead", null, h("tr", null, t.columns.map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", null, t.rows.map((row, i) => h("tr", { class: i === active ? (matched === true ? "match" : matched === false ? "nomatch" : "active") : null },
      row.map((v) => h("td", { class: v === null ? "null" : null }, show(v))))))));
}

// `fresh` marks the last row as just added (it slides in).
function resultView(res, upto, fresh = upto > 0) {
  const rows = res.rows.slice(0, upto);
  return h("div", { class: "table-wrap" }, h("table", { class: "sqltable result" },
    h("caption", null, `Result: ${rows.length} row${rows.length === 1 ? "" : "s"}`),
    h("thead", null, h("tr", null, res.columns.map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", null, rows.length ? rows.map((row, i) => h("tr", { class: fresh && i === upto - 1 ? "fresh" : null }, row.map((v) => h("td", { class: v === null ? "null" : null }, show(v))))) : h("tr", null, h("td", { colspan: res.columns.length, class: "muted" }, "(no rows yet)")))));
}

// Swap in the next frame, gliding every keyed tuple chip from where it was.
// A chip that's new but names a `data-from` key flies out of that chip
// instead (a tuple read into memory, or hashed into a partition).
function flip(holder, next) {
  const before = new Map();
  if (!reducedMotion()) for (const el of holder.querySelectorAll("[data-k]")) before.set(el.dataset.k, el.getBoundingClientRect());
  holder.replaceChildren(next);
  if (reducedMotion() || !before.size) return;
  for (const el of next.querySelectorAll("[data-k]")) {
    const old = before.get(el.dataset.k) ?? (el.dataset.from ? before.get(el.dataset.from) : null);
    if (!old) continue;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left, dy = old.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.getBoundingClientRect(); // commit the start position, then let it transition home
    el.classList.add("jn-glide");
    el.style.transform = "";
  }
}

// --- Join algorithms: the disk, the buffer and (for hash join) partitions ---
function algoStage(st, A, B, on, perBlock, algo) {
  const ia = A.columns.indexOf(on.left), ib = B.columns.indexOf(on.right);
  const key = { r: (i) => A.rows[i][ia], s: (i) => B.rows[i][ib] };
  const hot = { r: new Set(st.hotR), s: new Set(st.hotS) };
  const state = st.match === true ? " match" : st.match === false ? " nomatch" : "";
  const chip = (file, i, k, from = null) => h("span", { class: `jn-t${hot[file].has(i) ? ` hot${state}` : ""}`, "data-k": k, "data-from": from, title: `${file}${i + 1}: ${(file === "r" ? A : B).columns.map((c, j) => `${c} = ${show((file === "r" ? A : B).rows[i][j])}`).join(", ")}` },
    h("small", null, `${file}${i + 1}`), show(key[file](i)));
  const order = (file) => (st.sorted ? st.sorted[file] : Array.from({ length: (file === "r" ? A : B).rows.length }, (_, i) => i));
  const blocksOf = (file) => {
    const o = order(file);
    return Array.from({ length: Math.ceil(o.length / perBlock) }, (_, b) => o.slice(b * perBlock, (b + 1) * perBlock));
  };
  const mem = new Set(st.mem);
  const ptrAt = (file) => (st.ptr && st.sorted ? st.sorted[file][st.ptr[file]] : null);
  const relation = (file, name) => h("div", { class: "jn-rel" },
    h("div", { class: "jn-label" }, `${file} = ${name}${st.sorted ? ` sorted on ${file === "r" ? on.left : on.right}` : ""}`),
    h("div", { class: "jn-blocks" }, blocksOf(file).map((blk, b) => h("div", { class: `jn-block${mem.has(`${file}:${b}`) ? " mem" : ""}` },
      h("b", null, `block ${b + 1}`),
      blk.map((i) => [ptrAt(file) === i ? h("i", { class: "jn-ptr", "aria-label": file === "r" ? "pr" : "ps" }, file === "r" ? "pr" : "ps") : null, chip(file, i, `${file}:${i}`)])))));
  // Tuples currently in the memory buffer, flying in from where they came from.
  const buffer = [];
  for (const m of st.mem) {
    let file, ids, from;
    if (/^[rs]:/.test(m)) {
      file = m[0];
      const b = Number(m.slice(2));
      ids = blocksOf(file)[b] ?? [];
      from = (i) => `${file}:${i}`;
    } else {
      file = m[1];
      ids = st.parts[file][Number(m.slice(2))];
      from = (i) => `H${file}:${i}`;
    }
    buffer.push(h("div", { class: "jn-buf" }, h("b", null, /^[rs]:/.test(m) ? `${m[0]} block ${Number(m.slice(2)) + 1}` : m), ids.length ? ids.map((i) => chip(file, i, `m:${file}:${i}`, from(i))) : h("span", { class: "muted small" }, "empty")));
  }
  const parts = st.parts ? h("div", { class: "jn-parts" },
    h("div", { class: "jn-label" }, "Partitions on disk"),
    st.parts.s.map((ps, i) => h("div", { class: `jn-part${st.probing === i ? " probing" : ""}${st.part?.i === i ? " landed" : ""}` },
      h("b", null, `${i}`),
      h("div", null, h("small", null, `Hs${i}`), ps.map((si) => chip("s", si, `Hs:${si}`, `s:${si}`))),
      h("div", null, h("small", null, `Hr${i}`), st.parts.r[i].map((ri) => chip("r", ri, `Hr:${ri}`, `r:${ri}`)))))) : null;
  return h("div", { class: "jn-stage" },
    h("div", { class: "jn-disk" }, relation("r", A.name), relation("s", B.name)),
    h("div", { class: "jn-memory" }, h("div", { class: "jn-label" }, `Memory buffer${algo === "hash" ? "" : " (one block per relation)"}`), buffer.length ? buffer : h("span", { class: "muted small" }, "empty")),
    parts);
}

function costTable(c) {
  const max = Math.max(...c.rows.map((r) => r.transfers), 2);
  return h("div", { class: "table-wrap" }, h("table", { class: "parse complexity jn-cost" },
    h("thead", null, h("tr", null, ["Algorithm", "Block transfers", "", "Seeks", "Formula"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, c.rows.map((r) => h("tr", { class: r.id === c.best ? "hot" : null },
      h("th", { scope: "row" }, r.name, r.id === c.best ? " ✓" : ""),
      h("td", null, n(r.transfers)),
      h("td", { class: "spark" }, h("i", { style: `width:${Math.max(2, (Math.log(r.transfers + 1) / Math.log(max + 1)) * 100)}%` })),
      h("td", null, n(r.seeks)),
      h("td", { class: "left jn-formula" }, r.formula, r.recursive ? " (needs recursive partitioning: n_h + 1 > M, so this is a lower bound)" : ""))))));
}

export function render(root) {
  const p = readParams();
  const state = {
    a: (p.get("a") ?? EXAMPLE.A).replace(/;/g, "\n"), b: (p.get("b") ?? EXAMPLE.B).replace(/;/g, "\n"),
    type: JOINS[p.get("type")] ? p.get("type") : "left",
    left: p.get("l") ?? EXAMPLE.on.left, right: p.get("rc") ?? EXAMPLE.on.right,
    mode: p.get("mode") === "algo" ? "algo" : "logic",
    algo: ALGORITHMS[p.get("alg")] ? p.get("alg") : "bnlj",
    perBlock: Math.min(4, Math.max(1, Number(p.get("pb")) || 2)),
    buckets: Math.min(5, Math.max(2, Number(p.get("nh")) || 3)),
    cost: (p.get("c") ?? COST_DEFAULT).split(",").map(Number),
    sorted: p.get("srt") ?? "",
  };
  let player = null;
  const head = page({
    subject: "Databases", title: "SQL joins",
    lede: "Watch the database compare rows pair by pair and decide what goes into the result, then see how real join algorithms (nested-loop, block nested-loop, sort-merge and hash join) read the disk and what they cost.",
    theory: h("div", null,
      h("p", null, "Conceptually, a join compares every row of A with every row of B (a ", h("b", null, "nested loop"), ") and keeps the pairs that satisfy the ON condition. Real databases pick a smarter algorithm, but the result is the same."),
      h("ul", null,
        h("li", null, h("b", null, "INNER"), " keeps matching pairs only. ", h("b", null, "LEFT / RIGHT / FULL OUTER"), " also keep unmatched rows from one or both sides, padded with NULLs."),
        h("li", null, h("b", null, "CROSS"), " keeps every pair. ", h("b", null, "NATURAL"), " joins on all columns with the same name and shows them once."),
        h("li", null, h("b", null, "SEMI"), " (WHERE EXISTS) keeps each A row at most once if it has a match; ", h("b", null, "ANTI"), " (WHERE NOT EXISTS) keeps the A rows with no match.")),
      h("p", null, h("b", null, "NULL is never equal to anything"), ", not even another NULL, so rows with a NULL key never match."),
      h("p", null, "The cost of a join is dominated by disk I/O. A ", h("b", null, "nested-loop join"), " rescans the inner relation s for every tuple of r; a ", h("b", null, "block nested-loop join"), " rescans it once per block of r instead. A ", h("b", null, "sort-merge join"), " sorts both inputs and reads each once, like merging two sorted lists. A ", h("b", null, "hash join"), " hashes both inputs into partitions so that only matching partitions are compared, about 3(b_r + b_s) transfers.")),
    conventions: [
      "Tables are typed as rows of comma-separated values; the first line is the column names. Type NULL (or leave a cell empty) for a missing value.",
      "Numbers and text compare exactly: 10 and '10' are equal here.",
      "Join algorithms: r = A is the outer (probe) input, s = B the inner (build) input. A transfer is one block read or written; a seek is counted whenever the next block isn't the one right after the last block accessed in the same file. Writing the result isn't counted.",
      "Block nested-loop is simulated with M = 3 buffer blocks (one for r, one for s, one for output). Hash join uses h(v) = v mod nh (text keys: sum of character codes mod nh).",
      "Cost formulas follow Silberschatz, Database System Concepts, ch. 15: NLJ n_r·b_s + b_r transfers and n_r + b_r seeks; BNLJ ⌈b_r/(M−2)⌉·b_s + b_r transfers and 2⌈b_r/(M−2)⌉ seeks; sorting b(2⌈log_{M−1}(b/M)⌉ + 1) transfers; hash join 3(b_r + b_s) + 4n_h transfers with n_h = ⌈b/M⌉ for the smaller input b.",
    ],
  });

  const aIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Table A", oninput: (e) => { state.a = e.target.value; update(); } }, state.a);
  const bIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Table B", oninput: (e) => { state.b = e.target.value; update(); } }, state.b);
  const modeSel = h("select", { "aria-label": "What to show", onchange: (e) => { state.mode = e.target.value; update(); } },
    h("option", { value: "logic", selected: state.mode === "logic" }, "Logical join (SQL meaning)"), h("option", { value: "algo", selected: state.mode === "algo" }, "Join algorithms (how it runs)"));
  const typeSel = h("select", { "aria-label": "Join type", onchange: (e) => { state.type = e.target.value; update(); } }, Object.entries(JOINS).map(([id, j]) => h("option", { value: id, selected: id === state.type }, j.name)));
  const algoSel = h("select", { "aria-label": "Join algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([id, a]) => h("option", { value: id, selected: id === state.algo }, a.name)));
  const pbIn = h("input", { type: "number", min: 1, max: 4, value: state.perBlock, "aria-label": "Rows per block", onchange: (e) => { state.perBlock = Math.min(4, Math.max(1, Number(e.target.value) || 2)); e.target.value = state.perBlock; update(); } });
  const nhIn = h("input", { type: "number", min: 2, max: 5, value: state.buckets, "aria-label": "Hash partitions", onchange: (e) => { state.buckets = Math.min(5, Math.max(2, Number(e.target.value) || 3)); e.target.value = state.buckets; update(); } });
  const nhLabel = h("label", { class: "inline" }, "Partitions nh ", nhIn);
  const algoRow = h("div", { class: "row" }, algoSel, h("label", { class: "inline" }, "Rows per block ", pbIn), nhLabel);
  const leftSel = h("select", { "aria-label": "Column from A", onchange: (e) => { state.left = e.target.value; update(); } });
  const rightSel = h("select", { "aria-label": "Column from B", onchange: (e) => { state.right = e.target.value; update(); } });
  const onRow = h("span", { class: "inline" }, "ON A.", leftSel, " = B.", rightSel);
  const typeRow = h("div", { class: "row" }, typeSel, onRow);
  const sqlBox = h("pre", { class: "sql" });
  const msg = h("div"), out = h("div", { class: "output" });

  // --- Cost estimate panel (independent of the tables above) ---------------
  const costOut = h("div");
  const costNames = ["n_r", "b_r", "n_s", "b_s", "M"];
  const costIns = costNames.map((name, i) => h("input", { type: "number", min: 1, value: state.cost[i] ?? "", "aria-label": name, oninput: () => { state.cost = costIns.map((x) => Number(x.value)); drawCost(); save(); } }));
  const sortBoxes = ["r", "s"].map((f) => h("input", { type: "checkbox", checked: state.sorted.includes(f), "aria-label": `${f} already sorted`, onchange: () => { state.sorted = ["r", "s"].filter((_, i) => sortBoxes[i].checked).join(""); drawCost(); save(); } }));
  function drawCost() {
    try {
      const [nr, br, ns, bs, M] = state.cost;
      const c = costs({ nr, br, ns, bs, M, rSorted: state.sorted.includes("r"), sSorted: state.sorted.includes("s") });
      const best = c.rows.find((r) => r.id === c.best);
      costOut.replaceChildren(costTable(c),
        h("p", { class: "muted small" }, `Bars use a log scale. Sorting with M = ${M}: r ${state.sorted.includes("r") ? "is already sorted" : `takes ${c.sort.r.passes} merge pass${c.sort.r.passes === 1 ? "" : "es"}, ${n(c.sort.r.transfers)} transfers`}; s ${state.sorted.includes("s") ? "is already sorted" : `takes ${c.sort.s.passes} merge pass${c.sort.s.passes === 1 ? "" : "es"}, ${n(c.sort.s.transfers)} transfers`}.`),
        notice("good", `Cheapest here: ${best.name}, ${n(best.transfers)} block transfers and ${n(best.seeks)} seeks. Swap r and s to see why the smaller relation should be the outer one.`));
    } catch (e) { costOut.replaceChildren(notice("error", e.message)); }
  }
  const costCard = h("section", { class: "card" }, h("h2", null, "I/O cost estimate"),
    h("p", { class: "muted small" }, "Sizes default to Silberschatz's example: student (5,000 tuples in 100 blocks) ⋈ takes (10,000 tuples in 400 blocks), with student as r."),
    h("div", { class: "jn-cost-in" }, costNames.map((name, i) => h("label", { class: "inline" }, h("span", { class: "mono" }, name), costIns[i])),
      h("label", { class: "inline" }, sortBoxes[0], "r already sorted"), h("label", { class: "inline" }, sortBoxes[1], "s already sorted"),
      h("button", { type: "button", class: "btn ghost small", onclick: () => { const [nr, br, ns, bs, M] = state.cost; state.cost = [ns, bs, nr, br, M]; costIns.forEach((x, i) => { x.value = state.cost[i]; }); drawCost(); save(); } }, "Swap r and s")),
    costOut);

  function save() {
    writeParams({ mode: state.mode, a: state.a.split("\n").join(";"), b: state.b.split("\n").join(";"), type: state.type, l: state.left, rc: state.right, alg: state.algo, pb: state.perBlock, nh: state.buckets, c: state.cost.join(","), srt: state.sorted });
  }

  function update() {
    player?.destroy();
    save();
    const logic = state.mode === "logic";
    typeSel.hidden = !logic; algoRow.hidden = logic; nhLabel.hidden = state.algo !== "hash";
    let A, B;
    try {
      A = parseTable("A", state.a); B = parseTable("B", state.b);
      if (!A.columns.includes(state.left)) state.left = A.columns.find((c) => B.columns.includes(c)) ?? A.columns[0];
      if (!B.columns.includes(state.right)) state.right = B.columns.includes(state.left) ? state.left : B.columns[0];
      leftSel.replaceChildren(...A.columns.map((c) => h("option", { value: c, selected: c === state.left }, c)));
      rightSel.replaceChildren(...B.columns.map((c) => h("option", { value: c, selected: c === state.right }, c)));
      onRow.hidden = logic && !!JOINS[state.type].noCondition;
      if (logic) showLogic(A, B); else showAlgo(A, B);
      msg.replaceChildren();
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); sqlBox.textContent = ""; }
  }

  function showLogic(A, B) {
    const res = join(A, B, state.type, { left: state.left, right: state.right });
    sqlBox.textContent = `${res.sql};`;
    const code = codePanel(res.code), vars = varsPanel();
    const stage = h("div", { class: "join-stage jn-logic" }), result = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({
      count: res.steps.length + 1, label: "Step", interval: 750,
      render: (i) => {
        if (i === 0) {
          stage.replaceChildren(tableView(A, null, null, "a"), tableView(B, null, null, "b"));
          result.replaceChildren(resultView(res, 0));
          note.textContent = `Start: compare each row of A with each row of B${JOINS[state.type].noCondition ? "" : ` using ${res.sql.split(/ ON | WHERE /).at(-1).replace(")", "")}`}.`;
          note.className = "step-note";
          code.show(null); vars.reset(); vars.show({ output: 0 });
          return;
        }
        const s = res.steps[i - 1], prev = res.steps[i - 2]?.rows ?? 0;
        stage.replaceChildren(tableView(A, s.i, s.j === null ? null : s.match, "a"), tableView(B, s.j, s.i === null ? null : s.match, "b"));
        result.replaceChildren(resultView(res, s.rows, s.rows > prev));
        note.textContent = s.note;
        note.className = `step-note${s.match === true || s.pad || s.rows > prev ? " good" : ""}`;
        code.show(s.line); vars.show(s.vars);
      },
    });
    out.replaceChildren(h("section", { class: "card jn-wrap" }, h("div", { class: "row spread" }, h("h2", null, JOINS[state.type].name), venn(state.type)), player.el, note,
      traceLayout(h("div", null, stage, result), code, vars),
      h("p", { class: "muted small" }, `${res.rows.length} row${res.rows.length === 1 ? "" : "s"} in the final result.`)));
  }

  function showAlgo(A, B) {
    const on = { left: state.left, right: state.right };
    const res = runAlgorithm(A, B, state.algo, on, { perBlock: state.perBlock, buckets: state.buckets });
    sqlBox.textContent = `SELECT * FROM A JOIN B ON A.${state.left} = B.${state.right};  -- r = A, s = B`;
    const code = codePanel(res.code), vars = varsPanel();
    const stage = h("div"), result = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" }), counters = h("div", { class: "stats-row" });
    const nr = A.rows.length, ns = B.rows.length, { r: br, s: bs } = res.blocks;
    const predicted = { nlj: [nr * bs + br, nr + br], bnlj: [br * bs + br, 2 * br], merge: [br + bs, null], hash: [null, null] }[state.algo];
    player = stepper({
      count: res.steps.length, label: "Step", interval: 800,
      render: (i) => {
        const s = res.steps[i], prev = res.steps[i - 1]?.rows ?? 0;
        flip(stage, algoStage(s, A, B, on, state.perBlock, state.algo));
        result.replaceChildren(resultView(res, s.rows, s.rows > prev));
        note.textContent = s.note;
        note.className = `step-note${s.done || s.match ? " good" : ""}`;
        code.show(s.line); vars.show(s.vars);
        counters.replaceChildren(stat("Block transfers", s.transfers), stat("Seeks", s.seeks), stat("Rows output", s.rows),
          state.algo === "hash" ? stat("Formula bound", `3(b_r + b_s) + 4n_h = ${3 * (br + bs) + 4 * state.buckets}`)
            : state.algo === "merge" ? stat("Formula bound", `b_r + b_s = ${predicted[0]} transfers`)
              : stat("Formula predicts", `${predicted[0]} transfers, ${predicted[1]} seeks`));
      },
    });
    out.replaceChildren(
      h("section", { class: "card jn-wrap" }, h("h2", null, ALGORITHMS[state.algo].name), player.el, note,
        traceLayout(h("div", null, stage, result), code, vars), counters,
        h("p", { class: "muted small" }, state.algo === "hash" ? "The hash-join formula is an upper bound: it assumes every partition ends in a partly filled block (the 4n_h term)." : state.algo === "merge" ? "This counts only the merge; sorting unsorted inputs costs extra (see the estimate below)." : `With these tiny tables the simulated counts match the textbook formula exactly (b_r = ${br}, b_s = ${bs}, n_r = ${nr}).`)),
      costCard);
    drawCost();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "grid-2 tight" }, h("label", { class: "stack" }, "Table A", aIn), h("label", { class: "stack" }, "Table B", bIn)),
      h("div", { class: "row" }, modeSel),
      typeRow, algoRow,
      sqlBox,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { const t = randomTables(); state.a = t.A; state.b = t.B; state.left = "k"; state.right = "k"; aIn.value = t.A; bIn.value = t.B; update(); } }, "Random tables"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.a = EXAMPLE.A; state.b = EXAMPLE.B; state.left = EXAMPLE.on.left; state.right = EXAMPLE.on.right; aIn.value = state.a; bIn.value = state.b; update(); } }, "Example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // --- Practice: row counts, and I/O cost of the join algorithms -------------
  const practice = h("div", { class: "panel-body" });
  function rowsQuestion(r) {
    const t = randomTables(r);
    const types = ["inner", "left", "right", "full", "semi", "anti"];
    const type = types[Math.floor(r() * types.length)];
    const A = parseTable("A", t.A), B = parseTable("B", t.B);
    const res = join(A, B, type, t.on);
    const solution = h("div");
    return [
      h("h2", null, "How many rows does this return?"),
      h("pre", { class: "sql" }, `${res.sql};`),
      h("div", { class: "join-stage" }, tableView(A, null, null, "a"), tableView(B, null, null, "b")),
      numberQuestion(res.rows.length, "Watch out for NULL keys and duplicate matches.", "Number of rows"),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("h3", null, "Result"), resultView(res, res.rows.length, false)) }, "Show the result")),
      solution,
    ];
  }
  function costQuestion(r) {
    const pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    for (;;) {
      const br = pick(2, 60) * 10, bs = pick(2, 60) * 10, nr = br * pick(10, 50), ns = bs * pick(10, 50), M = pick(5, 25);
      const c = costs({ nr, br, ns, bs, M });
      const kinds = ["nlj", "bnlj", "bnlj-m", "hash"];
      const id = kinds[Math.floor(r() * kinds.length)];
      const row = c.rows.find((x) => x.id === id);
      if (id === "hash" && (c.nh === 0 || row.recursive)) continue;
      const groups = Math.ceil(br / (M - 2));
      const working = {
        nlj: `n_r·b_s + b_r = ${n(nr)} × ${bs} + ${br} = ${n(row.transfers)}.`,
        bnlj: `With M = 3, b_r·b_s + b_r = ${br} × ${bs} + ${br} = ${n(row.transfers)}.`,
        "bnlj-m": `⌈b_r/(M−2)⌉ = ⌈${br}/${M - 2}⌉ = ${groups} scans of s, so ${groups} × ${bs} + ${br} = ${n(row.transfers)}.`,
        hash: `n_h = ⌈${Math.min(br, bs)}/${M}⌉ = ${c.nh}, so 3(${br} + ${bs}) + 4 × ${c.nh} = ${n(row.transfers)}.`,
      }[id];
      return [
        h("h2", null, `How many block transfers does ${{ nlj: "a nested-loop join", bnlj: "a block nested-loop join with M = 3", "bnlj-m": `a block nested-loop join with M = ${M}`, hash: "a hash join" }[id]} need?`),
        h("p", { class: "grammar-box" }, `r: n_r = ${n(nr)} tuples in b_r = ${br} blocks\ns: n_s = ${n(ns)} tuples in b_s = ${bs} blocks\nM = ${M} buffer blocks`),
        h("p", { class: "muted small" }, id === "hash" ? "Build on the smaller relation; ignore recursive partitioning." : "r is the outer relation. Use the worst case (only the blocks you need fit in memory)."),
        numberQuestion(row.transfers, working, "Block transfers"),
      ];
    }
  }
  function newQuestion() {
    const r = rng();
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      ...(r() < 0.5 ? rowsQuestion(r) : costQuestion(r))));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
