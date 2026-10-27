import { EXAMPLES, PROTOCOLS, randomSchedule, run } from "../engines/concurrency.js";
import { opText } from "../engines/schedules.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const colour = (t) => `--c:var(--series-${((t - 1) % 8) + 1})`;
const MARKS = [["done", "Ran"], ["now", "This step"], ["wait", "Waiting"], ["fail", "Rolled back here"], ["ignored", "Ignored (Thomas)"], ["skip", "Skipped"]];
const STATUS = { active: "Active", waiting: "Waiting", committed: "Committed", aborted: "Rolled back", reading: "Read phase", validating: "Validating" };

// The schedule as a strip of operations, each coloured by what happened to it.
function strip(seq, step) {
  return h("ol", { class: "cc-strip", "aria-label": "Schedule" }, seq.map((o, k) => h("li", {
    class: `cc-op ${step.marks[k]}${step.at === k ? " now" : ""}${o.implicit ? " implicit" : ""}`, style: colour(o.t),
    title: o.implicit ? `Implicit commit of T${o.t}` : opText(o),
  }, opText(o))));
}

// Lock table as SVG so a request can glide from the queue to the holders.
const CW = 58, CH = 26, GAP = 6, ROW = 36, ITEM_W = 44;
function lockTable(step, maxH, maxQ, current) {
  const qx = ITEM_W + Math.max(1, maxH) * (CW + GAP) + 22;
  const W = qx + Math.max(1, maxQ) * (CW + GAP) + 4, H = 26 + step.table.length * ROW;
  const els = [
    h("text", { x: 4, y: 15, class: "cc-head" }, "Item"), h("text", { x: ITEM_W, y: 15, class: "cc-head" }, "Granted"), h("text", { x: qx, y: 15, class: "cc-head" }, "Queue →"),
    h("line", { x1: qx - 12, x2: qx - 12, y1: 22, y2: H - 4, class: "cc-sep" }),
  ];
  const chip = (key, x, y, t, label, cls) => h("g", { class: `cc-chip ${cls}`, style: colour(t), "data-k": key, "data-x": x, "data-y": y },
    h("rect", { x, y, width: CW, height: CH, rx: 7 }), h("text", { x: x + CW / 2, y: y + 17.5, "text-anchor": "middle" }, label));
  step.table.forEach((row, r) => {
    const y = 26 + r * ROW;
    els.push(h("rect", { x: 0, y: y - 2, width: W, height: ROW - 4, rx: 8, class: `cc-row${row.item === current ? " hot" : ""}` }),
      h("text", { x: 12, y: y + 18, class: "cc-item" }, row.item));
    row.holders.forEach((x, i) => els.push(chip(`c:${x.t}:${row.item}`, ITEM_W + i * (CW + GAP), y + 1, x.t, `T${x.t} ${x.m}`, `held ${x.m}`)));
    row.queue.forEach((q, i) => els.push(chip(`${q.up ? "u" : "c"}:${q.t}:${row.item}`, qx + i * (CW + GAP), y + 1, q.t, `T${q.t} ${q.up ? "S→X" : q.m}`, "queued")));
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "cc-locks", role: "img", style: `max-width:${Math.round(W * 1.35)}px`,
    "aria-label": step.table.map((r) => `${r.item}: held by ${r.holders.map((x) => `T${x.t} ${x.m}`).join(", ") || "nobody"}${r.queue.length ? `, queue ${r.queue.map((q) => `T${q.t}`).join(", ")}` : ""}`).join(". ") }, els);
}

function waitsFor(step) {
  const cyc = new Set(step.wfg.cycle ?? []);
  const c = step.wfg.cycle;
  return stateDiagram({
    states: step.txns.map((x) => ({ id: `T${x.t}` })), start: null,
    edges: step.wfg.edges.map((e) => ({ from: `T${e.from}`, to: `T${e.to}`, label: e.item })),
    lit: c ? c.slice(0, -1).map((t, i) => ({ from: `T${t}`, to: `T${c[i + 1]}` })) : [],
    classes: Object.fromEntries(step.txns.map((x) => [`T${x.t}`, cyc.has(x.t) ? "bad" : { waiting: "active", committed: "good", aborted: "dim" }[x.status] ?? null])),
    aria: `Waits-for graph: ${step.wfg.edges.map((e) => `T${e.from} waits for T${e.to}`).join(", ") || "nobody is waiting"}.`,
  });
}

const cell = (v, prev) => h("td", { class: prev !== undefined && prev !== v ? "cc-changed" : null }, v ?? "–");
function table(head, rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse cc-table" },
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col" }, x)))), h("tbody", null, rows)));
}
const txnHead = (x) => h("th", { scope: "row", style: colour(x.t) }, h("i", { class: "cc-dot" }), `T${x.t}`);
const statusCell = (x) => h("td", { class: `cc-st ${x.status}` }, STATUS[x.status]);

function history(step) {
  return h("ol", { class: "cc-hist", "aria-label": "Lock manager log" }, step.history.map((x, i, all) => h("li", { class: `cc-h ${x.kind}${i === all.length - 1 ? " new" : ""}`, style: colour(x.t) }, h("b", null, `T${x.t}`), " ", x.text)));
}

function stageFor(res, step, prev, family) {
  if (family === "2pl") {
    return [
      h("h3", { class: "cc-sub" }, "Lock table"), h("div", { "data-morph": "locks" }),
      h("div", { class: "cc-two" },
        h("div", null, h("h3", { class: "cc-sub" }, "Waits-for graph"), h("div", { "data-morph": "wfg" })),
        h("div", null, h("h3", { class: "cc-sub" }, "Transactions"), table(["Txn", "Status", "Phase", "Holds", "Lock point"], step.txns.map((x) => {
          const p = prev?.txns.find((y) => y.t === x.t);
          return h("tr", null, txnHead(x), statusCell(x), cell(x.status === "active" || x.status === "waiting" ? x.phase : "–", p && (p.status === "active" || p.status === "waiting") ? p.phase : "–"), cell(x.held.join(" ") || "–", p ? p.held.join(" ") || "–" : undefined), h("td", null, x.lockPoint ? `after ${x.lockPoint}` : "–"));
        })))),
      h("h3", { class: "cc-sub" }, "Lock manager log"), history(step),
    ];
  }
  if (family === "to") {
    return [
      h("div", { class: "cc-two" },
        h("div", null, h("h3", { class: "cc-sub" }, "Data items"), table(["Item", "R-TS", "W-TS", "Last writer"], step.items.map((x) => {
          const p = prev?.items.find((y) => y.item === x.item);
          return h("tr", { class: step.vars?.[`R-TS(${x.item})`] !== undefined ? "hot" : null }, h("th", { scope: "row" }, x.item), cell(x.r, p?.r), cell(x.w, p?.w), cell(x.writer ? `T${x.writer}` : "–", p ? (p.writer ? `T${p.writer}` : "–") : undefined));
        }))),
        h("div", null, h("h3", { class: "cc-sub" }, "Transactions"), table(["Txn", "TS", "Status"], step.txns.map((x) => h("tr", null, txnHead(x), h("td", null, x.ts), statusCell(x)))))),
      h("h3", { class: "cc-sub" }, "Timestamp order"), tsLine(step),
    ];
  }
  return [h("h3", { class: "cc-sub" }, "Transactions"), table(["Txn", "Start", "Validation", "Finish", "ReadSet", "WriteSet", "Status"], step.txns.map((x) => {
    const p = prev?.txns.find((y) => y.t === x.t);
    const set = (s) => (s.length ? `{${s.join(", ")}}` : "∅");
    return h("tr", null, txnHead(x), cell(x.start, p?.start), cell(x.val, p?.val), cell(x.fin, p?.fin), cell(set(x.rs), p ? set(p.rs) : undefined), cell(set(x.ws), p ? set(p.ws) : undefined), statusCell(x));
  })), h("h3", { class: "cc-sub" }, "Phases on the clock"), occTimeline(res, step)];
}

// Timestamp order: transactions laid out oldest to youngest.
function tsLine(step) {
  const sorted = [...step.txns].sort((a, b) => a.ts - b.ts);
  return h("div", { class: "cc-tsline" }, sorted.map((x) => h("span", { class: `cc-ts ${x.status}`, style: colour(x.t) }, h("b", null, `T${x.t}`), h("small", null, `TS ${x.ts}`))), h("em", null, "older → younger"));
}

// Each transaction's read phase as a bar along the clock, validation as a tick.
function occTimeline(res, step) {
  const n = res.seq.length, cw = 26, lw = 34, W = lw + n * cw + 6, H = 14 + step.txns.length * 26;
  const shown = step.at ?? (step.kind === "done" ? n - 1 : -1);
  const els = [];
  for (let k = 0; k < n; k++) els.push(h("text", { x: lw + k * cw + cw / 2, y: 10, "text-anchor": "middle", class: `cc-tick${k === step.at ? " now" : ""}` }, k + 1));
  step.txns.forEach((x, r) => {
    const y = 16 + r * 26;
    els.push(h("text", { x: 2, y: y + 14, class: "cc-item" }, `T${x.t}`));
    if (x.start == null) return;
    const end = x.val ?? Math.min(shown + 1, res.seq.filter((o) => o.t === x.t).at(-1).k + 1);
    els.push(h("rect", { x: lw + (x.start - 1) * cw + 2, y: y + 3, width: Math.max(cw - 4, (end - x.start + 1) * cw - 4), height: 14, rx: 5, class: `cc-bar ${x.status}`, style: colour(x.t) }));
    if (x.val != null) els.push(h("path", { d: `M${lw + (x.val - 1) * cw + cw / 2},${y} v20`, class: `cc-val ${x.status}` }));
  });
  return h("div", { class: "chart-wrap" }, h("svg", { viewBox: `0 0 ${W} ${H}`, class: "cc-occ", role: "img", style: `max-width:${W * 1.3}px`, "aria-label": "Read phases and validation points" }, els));
}

export function render(root) {
  const p = readParams();
  const state = { p: PROTOCOLS[p.get("p")] ? p.get("p") : "basic", s: p.get("s") ?? EXAMPLES.deadlock.s, ts: p.get("ts") === "number" ? "number" : "start" };
  let player = null;
  const head = page({
    subject: "Databases", title: "Concurrency control",
    lede: "Run a schedule through two-phase locking, timestamp ordering or validation and watch locks being granted and queued, deadlocks forming and transactions rolling back.",
    theory: h("div", null,
      h("p", null, h("b", null, "Two-phase locking (2PL)"), ": a transaction takes a shared (S) lock to read and an exclusive (X) lock to write. Many S locks can coexist; an X lock excludes everyone else. Each transaction has a ", h("b", null, "growing phase"), " (it only acquires locks) and then a ", h("b", null, "shrinking phase"), " (it only releases them). The moment it holds every lock it needs is its ", h("b", null, "lock point"), ", and the order of lock points is an equivalent serial order, so 2PL schedules are conflict-serialisable."),
      h("ul", null,
        h("li", null, h("b", null, "Basic 2PL"), " may release a lock any time after the lock point, which can expose uncommitted data (cascading aborts)."),
        h("li", null, h("b", null, "Strict 2PL"), " holds X locks until commit or abort, so nobody reads uncommitted writes."),
        h("li", null, h("b", null, "Rigorous 2PL"), " holds every lock until commit or abort, so transactions serialise in commit order.")),
      h("p", null, "Locking can ", h("b", null, "deadlock"), ": draw an edge Ti → Tj when Ti waits for a lock Tj holds. A cycle in this ", h("b", null, "waits-for graph"), " is a deadlock, broken by aborting a victim."),
      h("p", null, h("b", null, "Timestamp ordering"), " gives each transaction a timestamp and makes the schedule equivalent to running them in timestamp order. Each item remembers the largest timestamp that read it (R-TS) and wrote it (W-TS); an operation that arrives too late rolls its transaction back. ", h("b", null, "Thomas' write rule"), " ignores a write that a younger transaction has already overwritten instead of rolling back. Nobody waits, so there are no deadlocks."),
      h("p", null, h("b", null, "Validation"), " (optimistic) lets transactions run freely on private copies, then checks each one at commit: it fails if an overlapping transaction that validated earlier wrote something it read.")),
    conventions: [
      "Write schedules like R1(A) W2(A) C1 A2. A transaction with no C or A commits straight after its last operation.",
      "2PL: a read needs lock-S, a write lock-X, and a holder of S upgrades to X. Requests are served first come, first served, but an upgrade goes to the front of the queue.",
      "A waiting transaction's later operations are delayed; the others carry on in schedule order.",
      "The waits-for graph is checked after every wait. The deadlock victim is the youngest transaction on the cycle (the highest number). Aborted transactions are not restarted.",
      "Timestamp ordering: TS(Ti) is the order in which transactions start, or the transaction number if you choose. R-TS and W-TS start at 0 and aren't reset after a rollback.",
      "Validation: the clock is the position in the schedule. Ti validates at its commit and writes at once, so Finish(Ti) = Validation(Ti).",
    ],
  });

  const protoSel = h("select", { "aria-label": "Protocol", onchange: (e) => { state.p = e.target.value; update(); } },
    h("optgroup", { label: "Two-phase locking" }, ["basic", "strict", "rigorous"].map((k) => h("option", { value: k, selected: k === state.p }, PROTOCOLS[k].name))),
    h("optgroup", { label: "Timestamps" }, ["to", "thomas", "occ"].map((k) => h("option", { value: k, selected: k === state.p }, PROTOCOLS[k].name))));
  const tsSel = h("select", { "aria-label": "Timestamps", onchange: (e) => { state.ts = e.target.value; update(); } },
    h("option", { value: "start", selected: state.ts === "start" }, "TS = start order"), h("option", { value: "number", selected: state.ts === "number" }, "TS = transaction number"));
  const input = h("input", { type: "text", class: "wide mono", value: state.s, "aria-label": "Schedule", oninput: (e) => { state.s = e.target.value; update(); } });
  const examples = exampleSelect(EXAMPLES, (ex) => { state.s = ex.s; state.p = ex.p; input.value = ex.s; update(); });
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ p: state.p, s: state.s, ...(state.ts === "number" ? { ts: "number" } : {}) });
    protoSel.value = state.p;
    const spec = PROTOCOLS[state.p];
    tsSel.hidden = spec.family !== "to";
    let res;
    try { res = run(state.s, state.p, { ts: state.ts }); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(spec.code), vars = varsPanel();
    const stage = h("div", { class: "cc-stage" }), stripBox = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    const lockBox = h("div", { class: "chart-wrap cc-lockwrap" }), wfgBox = h("div", { class: "chart-wrap" });
    const dims = spec.family === "2pl" ? {
      maxH: Math.max(1, ...res.steps.flatMap((s) => s.table.map((r) => r.holders.length))),
      maxQ: Math.max(1, ...res.steps.flatMap((s) => s.table.map((r) => r.queue.length))),
    } : null;
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = res.steps[i], prev = i ? res.steps[i - 1] : null;
        stripBox.replaceChildren(strip(res.seq, st));
        stage.replaceChildren(...stageFor(res, st, prev, spec.family));
        if (spec.family === "2pl") {
          // The diagram holders live across steps so morph() can glide chips and nodes.
          stage.querySelector('[data-morph="locks"]').replaceWith(lockBox);
          stage.querySelector('[data-morph="wfg"]').replaceWith(wfgBox);
          morph(lockBox, lockTable(st, dims.maxH, dims.maxQ, st.vars?.X ?? null));
          morph(wfgBox, waitsFor(st));
        }
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.kind === "done" ? " good" : st.kind === "deadlock" || st.kind === "abort" || st.kind === "warn" ? " bad" : ""}`;
      },
    });
    const all = Object.keys(PROTOCOLS).map((k) => ({ k, r: run(state.s, k, { ts: state.ts }) }));
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, spec.name), player.el, stripBox, note,
        traceLayout(h("div", null, stage, h("div", { class: "legend-chips cc-legend" }, MARKS.map(([c, t]) => h("span", { class: `cc-key ${c}` }, h("i"), t)))), code, vars),
        h("div", { class: "stats-row" },
          stat("Waits", res.stats.waits), stat("Deadlocks", res.stats.deadlocks.length),
          stat("Committed", res.committed.map((t) => `T${t}`).join(" ") || "none"), stat("Rolled back", res.aborted.map((t) => `T${t}`).join(" ") || "none"))),
      h("section", { class: "card" }, h("h2", null, "Same schedule, every protocol"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
          h("thead", null, h("tr", null, ["Protocol", "Waits", "Deadlocks", "Rolled back", "Committed"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, all.map(({ k, r }) => h("tr", { class: k === state.p ? "hot" : null },
            h("th", { scope: "row" }, h("button", { type: "button", class: "linkish", onclick: () => { state.p = k; update(); } }, PROTOCOLS[k].name)),
            h("td", null, r.stats.waits), h("td", null, r.stats.deadlocks.length),
            h("td", null, r.aborted.map((t) => `T${t}`).join(" ") || "–"), h("td", null, r.committed.map((t) => `T${t}`).join(" ") || "–")))))),
        h("p", { class: "muted small" }, "Locking makes transactions wait (and can deadlock); timestamp ordering and validation never wait but roll transactions back instead.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Schedule", input),
      h("div", { class: "row" }, protoSel, tsSel, examples,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.s = randomSchedule(Math.random, { txns: 2 + Math.floor(Math.random() * 2), items: ["A", "B", "C"].slice(0, 2 + Math.floor(Math.random() * 2)) }); input.value = state.s; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const text = randomSchedule(r, { txns: 2 + (r() < 0.5 ? 1 : 0), items: ["A", "B"] });
    const kind = Math.floor(r() * 4);
    const working = h("div");
    let body;
    const showWorking = (res) => h("button", { type: "button", class: "btn ghost", onclick: () => working.replaceChildren(h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note)))) }, "Show the working");
    const opts = (txns, none) => [...txns.map((t) => `T${t}`), none];
    if (kind === 0) {
      const variant = ["basic", "strict", "rigorous"][Math.floor(r() * 3)], res = run(text, variant);
      const yes = res.stats.deadlocks.length > 0;
      body = [h("h2", null, `Under ${PROTOCOLS[variant].name}, does this schedule deadlock?`), h("p", { class: "grammar-box" }, text),
        choice([{ label: "Yes", correct: yes }, { label: "No", correct: !yes }], yes ? `The waits-for graph gets the cycle ${res.stats.deadlocks[0].map((t) => `T${t}`).join(" → ")}.` : `Every wait ends when a lock is released, so the waits-for graph never has a cycle (${res.stats.waits} wait${res.stats.waits === 1 ? "" : "s"} in all).`), showWorking(res)];
    } else if (kind === 1) {
      const variant = ["basic", "strict", "rigorous"][Math.floor(r() * 3)], res = run(text, variant);
      const right = res.stats.firstWait ? `T${res.stats.firstWait}` : "Nobody waits";
      const first = res.steps.find((s) => s.kind === "wait");
      body = [h("h2", null, `Under ${PROTOCOLS[variant].name}, which transaction is the first to wait for a lock?`), h("p", { class: "grammar-box" }, text),
        choice(opts(res.txns, "Nobody waits").map((l) => ({ label: l, correct: l === right })), first ? first.note : "Every lock request can be granted straight away."), showWorking(res)];
    } else if (kind === 2) {
      const res = run(text, "to");
      const right = res.stats.firstAbort ? `T${res.stats.firstAbort}` : "Nobody";
      const first = res.steps.find((s) => s.kind === "abort");
      body = [h("h2", null, "Under basic timestamp ordering (TS = start order), which transaction is rolled back first?"), h("p", { class: "grammar-box" }, text),
        choice(opts(res.txns, "Nobody").map((l) => ({ label: l, correct: l === right })), first ? first.note : "Every operation arrives in timestamp order, so nothing is rolled back."), showWorking(res)];
    } else {
      const thomas = r() < 0.5, res = run(text, thomas ? "thomas" : "to");
      const item = res.items[Math.floor(r() * res.items.length)], which = r() < 0.5 ? "r" : "w";
      const ans = res.final[item][which];
      body = [h("h2", null, `Under ${thomas ? "timestamp ordering with Thomas' write rule" : "basic timestamp ordering"} (TS = start order), what is ${which === "r" ? "R-TS" : "W-TS"}(${item}) at the end?`), h("p", { class: "grammar-box" }, text),
        h("p", { class: "muted" }, `Timestamps: ${Object.entries(res.TS).map(([t, v]) => `TS(T${t}) = ${v}`).join(", ")}. Both start at 0; a rolled-back transaction's later operations are skipped.`),
        numberQuestion(ans, `${which === "r" ? "R-TS" : "W-TS"}(${item}) = ${ans}: the largest timestamp of a transaction that successfully ${which === "r" ? "read" : "wrote"} ${item}${ans ? "" : " (nobody did)"}.`), showWorking(res)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body, working));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
