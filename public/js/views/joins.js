import { EXAMPLE, join, JOINS, parseTable, randomTables, show } from "../engines/joins.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// Which regions of the Venn diagram each join keeps: [A only, both, B only].
const VENN = { inner: [0, 1, 0], left: [1, 1, 0], right: [0, 1, 1], full: [1, 1, 1], cross: [1, 1, 1], natural: [0, 1, 0], semi: [0, 1, 0], anti: [1, 0, 0] };

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

function resultView(res, upto) {
  const rows = res.rows.slice(0, upto);
  return h("div", { class: "table-wrap" }, h("table", { class: "sqltable result" },
    h("caption", null, `Result: ${rows.length} row${rows.length === 1 ? "" : "s"}`),
    h("thead", null, h("tr", null, res.columns.map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", null, rows.length ? rows.map((row, i) => h("tr", { class: i === upto - 1 ? "fresh" : null }, row.map((v) => h("td", { class: v === null ? "null" : null }, show(v))))) : h("tr", null, h("td", { colspan: res.columns.length, class: "muted" }, "(no rows yet)")))));
}

export function render(root) {
  const p = readParams();
  const state = {
    a: (p.get("a") ?? EXAMPLE.A).replace(/;/g, "\n"), b: (p.get("b") ?? EXAMPLE.B).replace(/;/g, "\n"),
    type: JOINS[p.get("type")] ? p.get("type") : "left",
    left: p.get("l") ?? EXAMPLE.on.left, right: p.get("rc") ?? EXAMPLE.on.right,
  };
  let player = null;
  const head = page({
    subject: "Databases", title: "SQL joins",
    lede: "Watch the database compare rows pair by pair and decide what goes into the result, including what happens with NULLs and unmatched rows.",
    theory: h("div", null,
      h("p", null, "Conceptually, a join compares every row of A with every row of B (a ", h("b", null, "nested loop"), ") and keeps the pairs that satisfy the ON condition. Real databases use smarter algorithms, but the result is the same."),
      h("ul", null,
        h("li", null, h("b", null, "INNER"), " keeps matching pairs only. ", h("b", null, "LEFT / RIGHT / FULL OUTER"), " also keep unmatched rows from one or both sides, padded with NULLs."),
        h("li", null, h("b", null, "CROSS"), " keeps every pair. ", h("b", null, "NATURAL"), " joins on all columns with the same name and shows them once."),
        h("li", null, h("b", null, "SEMI"), " (WHERE EXISTS) keeps each A row at most once if it has a match; ", h("b", null, "ANTI"), " (WHERE NOT EXISTS) keeps the A rows with no match.")),
      h("p", null, h("b", null, "NULL is never equal to anything"), ", not even another NULL, so rows with a NULL key never match.")),
    conventions: ["Tables are typed as rows of comma-separated values; the first line is the column names.", "Type NULL (or leave a cell empty) for a missing value.", "Numbers and text compare exactly: 10 and '10' are equal here."],
  });

  const aIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Table A", oninput: (e) => { state.a = e.target.value; update(); } }, state.a);
  const bIn = h("textarea", { rows: 6, class: "mono", "aria-label": "Table B", oninput: (e) => { state.b = e.target.value; update(); } }, state.b);
  const typeSel = h("select", { "aria-label": "Join type", onchange: (e) => { state.type = e.target.value; update(); } }, Object.entries(JOINS).map(([id, j]) => h("option", { value: id, selected: id === state.type }, j.name)));
  const leftSel = h("select", { "aria-label": "Column from A", onchange: (e) => { state.left = e.target.value; update(); } });
  const rightSel = h("select", { "aria-label": "Column from B", onchange: (e) => { state.right = e.target.value; update(); } });
  const onRow = h("span", { class: "inline" }, "ON A.", leftSel, " = B.", rightSel);
  const sqlBox = h("pre", { class: "sql" });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ a: state.a.split("\n").join(";"), b: state.b.split("\n").join(";"), type: state.type, l: state.left, rc: state.right });
    let A, B, res;
    try {
      A = parseTable("A", state.a); B = parseTable("B", state.b);
      if (!A.columns.includes(state.left)) state.left = A.columns.find((c) => B.columns.includes(c)) ?? A.columns[0];
      if (!B.columns.includes(state.right)) state.right = B.columns.includes(state.left) ? state.left : B.columns[0];
      leftSel.replaceChildren(...A.columns.map((c) => h("option", { value: c, selected: c === state.left }, c)));
      rightSel.replaceChildren(...B.columns.map((c) => h("option", { value: c, selected: c === state.right }, c)));
      onRow.hidden = !!JOINS[state.type].noCondition;
      res = join(A, B, state.type, { left: state.left, right: state.right });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); sqlBox.textContent = ""; return; }
    msg.replaceChildren();
    sqlBox.textContent = `${res.sql};`;
    const stage = h("div", { class: "join-stage" }), result = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const count = res.steps.length + 1;
    player = stepper({
      count, label: "Step", interval: 750,
      render: (i) => {
        if (i === 0) {
          stage.replaceChildren(tableView(A, null, null, "a"), tableView(B, null, null, "b"));
          result.replaceChildren(resultView(res, 0));
          note.textContent = `Start: compare each row of A with each row of B${JOINS[state.type].noCondition ? "" : ` using ${res.sql.split(" ON ")[1] ?? "the condition"}`}.`;
          return;
        }
        const s = res.steps[i - 1];
        stage.replaceChildren(tableView(A, s.i, s.j === null ? null : s.match, "a"), tableView(B, s.j, s.i === null ? null : s.match, "b"));
        result.replaceChildren(resultView(res, s.rows));
        note.textContent = s.note;
        note.className = `step-note${s.match === true || s.pad ? " good" : ""}`;
      },
    });
    out.replaceChildren(h("section", { class: "card" }, h("div", { class: "row spread" }, h("h2", null, JOINS[state.type].name), venn(state.type)), player.el, stage, note, result,
      h("p", { class: "muted small" }, `${res.rows.length} row${res.rows.length === 1 ? "" : "s"} in the final result.`)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "grid-2 tight" }, h("label", { class: "stack" }, "Table A", aIn), h("label", { class: "stack" }, "Table B", bIn)),
      h("div", { class: "row" }, typeSel, onRow),
      sqlBox,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { const t = randomTables(); state.a = t.A; state.b = t.B; state.left = "k"; state.right = "k"; aIn.value = t.A; bIn.value = t.B; update(); } }, "Random tables"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.a = EXAMPLE.A; state.b = EXAMPLE.B; state.left = EXAMPLE.on.left; state.right = EXAMPLE.on.right; aIn.value = state.a; bIn.value = state.b; update(); } }, "Example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const t = randomTables(r);
    const types = ["inner", "left", "right", "full", "semi", "anti"];
    const type = types[Math.floor(r() * types.length)];
    const A = parseTable("A", t.A), B = parseTable("B", t.B);
    const res = join(A, B, type, t.on);
    const ans = h("input", { type: "number", min: 0, "aria-label": "Number of rows" });
    const feedback = h("div"), solution = h("div");
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "How many rows does this return?"),
      h("pre", { class: "sql" }, `${res.sql};`),
      h("div", { class: "join-stage" }, tableView(A, null, null, "a"), tableView(B, null, null, "b")),
      h("div", { class: "qa" }, h("label", null, "Number of rows", ans)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = ans.value !== "" && Number(ans.value) === res.rows.length;
          ans.classList.toggle("right", ok); ans.classList.toggle("wrong", !ok);
          feedback.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right!" : `✗ It returns ${res.rows.length} row${res.rows.length === 1 ? "" : "s"}. Watch out for NULL keys and duplicate matches.`));
        } }, "Check"),
        h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Result"), resultView(res, res.rows.length))) }, "Show the result")),
      feedback), solution);
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}
