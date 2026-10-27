import { ALGORITHMS, EXAMPLES, parseLog, parseValues, randomLog, recText, recover } from "../engines/recovery.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, reducedMotion, rng, stepper, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";

const PHASES = {
  undoRedo: [["crash", "Crash"], ["redo", "Redo pass"], ["undo", "Undo pass"], ["done", "Recovered"]],
  aries: [["crash", "Crash"], ["analysis", "Analysis"], ["redo", "Redo"], ["undo", "Undo"], ["done", "Recovered"]],
};
const colour = (t) => (t ? `--c:var(--series-${(Number(t.slice(1)) % 8) + 1})` : null);
const setText = (xs) => (xs.length ? xs.join(", ") : "none");

// Restart a CSS animation on an element (it only plays when the class is added).
function replay(el, cls) {
  el.classList.remove(cls);
  if (reducedMotion()) return;
  void el.offsetWidth;
  el.classList.add(cls);
}

function recordRow(r, aries) {
  return h("li", { class: `rc-rec${r.byRecovery ? " rc-added" : ""}${r.kind === "checkpoint" ? " rc-ck" : ""}`, style: colour(r.t) },
    h("span", { class: "rc-lsn" }, r.lsn),
    h("code", null, recText(r)),
    aries && r.kind !== "checkpoint" ? h("small", { class: "rc-meta" }, `prev ${r.prev ?? "–"}${r.kind === "clr" && r.undoNext != null ? ` · UndoNext ${r.undoNext}` : ""}`) : null,
    r.byRecovery ? h("small", { class: "rc-meta" }, "written by recovery") : null);
}

const chips = (xs, before = []) => h("div", { class: "rc-chips" }, xs.length
  ? xs.map((x) => h("span", { class: `rc-chip${before.includes(x) ? "" : " new"}`, style: typeof x === "string" ? colour(x) : null }, x))
  : h("span", { class: "muted small" }, "empty"));

function smallTable(head, rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse rc-table" },
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.length ? rows.map((r) => h("tr", null, r.map((x) => h("td", null, x)))) : h("tr", null, h("td", { colspan: head.length, class: "muted" }, "empty")))));
}

export function render(root) {
  const p = readParams();
  const first = EXAMPLES.checkpoint;
  const state = {
    algo: ALGORITHMS[p.get("a")] ? p.get("a") : first.algo,
    log: p.get("l") ?? first.log, init: p.get("v") ?? first.init,
    crash: p.get("c") != null && p.get("c") !== "" ? Number(p.get("c")) : null,
  };
  let player = null;
  const head = page({
    subject: "Databases", title: "Log-based recovery",
    lede: "Crash the system anywhere in the log, then watch recovery redo history and undo the transactions that never finished, record by record.",
    theory: h("div", null,
      h("p", null, "With ", h("b", null, "write-ahead logging"), " every change is logged (old and new value) before it reaches the disk, so after a crash the log alone says what to fix. A ", h("b", null, "committed"), " transaction's writes must survive (", h("b", null, "redo"), "); an unfinished one's must vanish (", h("b", null, "undo"), ")."),
      h("p", null, "Both algorithms here ", h("b", null, "repeat history"), ": redo replays every logged write, even those of transactions that will be undone, so the database is exactly as it was at the crash. Then undo rolls the losers back, logging each undo as a ", h("b", null, "redo-only (compensation) record"), " so a second crash during recovery doesn't undo anything twice."),
      h("p", null, "A ", h("b", null, "checkpoint"), " bounds the work. In the textbook undo/redo algorithm it flushes every modified block, so redo starts at the last checkpoint. ", h("b", null, "ARIES"), " uses fuzzy checkpoints instead: an analysis pass rebuilds the transaction table and the dirty page table, redo starts at the oldest RecLSN, and undo follows PrevLSN and UndoNextLSN chains.")),
    conventions: [
      "LSN = the record's line number. Updates are <Ti, X, old, new>; a redo-only record (CLR) <Ti, X, V> is written whenever a write is undone, during a normal rollback or during recovery.",
      "<checkpoint {T1, T2}> lists the transactions active at that moment. For undo/redo it also means every modified block was flushed, so redo starts there.",
      "Writes after the checkpoint may or may not be on disk at the crash; here they're shown as missing, and redo makes the result the same either way.",
      "ARIES: each data item is its own page. Add dirty X@n to a checkpoint to say page X had been dirty since LSN n (its RecLSN); unlisted pages were clean. Commit and abort remove a transaction from the TT (real ARIES also writes an end record).",
      "A transaction rolled back before the crash logs its redo-only records before <Ti abort>.",
    ],
  });

  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    Object.entries(ALGORITHMS).map(([k, a]) => h("option", { value: k, selected: k === state.algo }, a.name)));
  const logIn = h("textarea", { rows: 10, class: "mono", "aria-label": "Log", spellcheck: "false", oninput: (e) => { state.log = e.target.value; update(); } }, state.log);
  const initIn = h("input", { type: "text", class: "mono wide", value: state.init, "aria-label": "Initial values", oninput: (e) => { state.init = e.target.value; update(); } });
  const crashIn = h("input", { type: "range", min: 0, max: 1, value: 0, "aria-label": "Crash point", class: "rc-crash-range", oninput: (e) => { state.crash = Number(e.target.value); update(); } });
  const crashLabel = h("span", { class: "mono small" });
  const load = (ex) => { state.log = ex.log; state.init = ex.init; state.algo = ex.algo ?? state.algo; state.crash = ex.crash ?? null; logIn.value = state.log; initIn.value = state.init; algoSel.value = state.algo; update(); };
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    let records, init;
    try { records = parseLog(state.log); init = parseValues(state.init); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const n = records.length, crash = state.crash == null ? n : Math.max(0, Math.min(n, state.crash));
    crashIn.max = n; crashIn.value = crash;
    crashLabel.textContent = crash === n ? `after LSN ${n} (the end of the log)` : `after LSN ${crash}: the last ${n - crash} record${n - crash === 1 ? " was" : "s were"} never written`;
    writeParams({ a: state.algo, l: state.log, v: state.init, c: state.crash ?? "" });
    const algo = state.algo, aries = algo === "aries";
    const res = recover(records, crash, algo, init);

    const code = codePanel(ALGORITHMS[algo].code), vars = varsPanel();
    const phases = PHASES[algo].map(([id, label]) => h("li", { "data-p": id }, label));
    const rows = res.log.map((r) => recordRow(r, aries));
    const crashRow = h("li", { class: "rc-crash", "aria-hidden": "true" }, `⚡ crash after LSN ${crash}`);
    const ptr = h("div", { class: "rc-ptr", "aria-hidden": "true" }, "▶");
    const list = h("ol", { class: "rc-records" }, rows.slice(0, crash), crashRow, rows.slice(crash));
    const logBox = h("div", { class: "rc-log" }, ptr, list);
    const cards = Object.keys(res.values).map((k) => {
      const val = h("b"), from = h("s"), extra = h("small");
      return { k, val, from, extra, el: h("div", { class: "rc-val" }, h("span", { class: "rc-item" }, k), from, val, extra) };
    });
    const tables = h("div", { class: "rc-sets" });
    const note = h("p", { class: "step-note", "aria-live": "polite" });
    let shownBefore = crash;

    player = stepper({
      count: res.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const s = res.steps[i], prev = res.steps[i - 1];
        const order = PHASES[algo].map(([id]) => id), at = order.indexOf(s.phase);
        phases.forEach((li, j) => { li.className = j === at ? "on" : j < at ? "past" : ""; });
        rows.forEach((li, j) => {
          li.hidden = j >= s.shown;
          li.classList.toggle("on", j === s.ptr);
          if (j < s.shown && j >= shownBefore) replay(li, "rc-in");
        });
        shownBefore = s.shown;
        const cur = rows[s.ptr];
        if (cur && !cur.hidden) {
          ptr.style.opacity = "1";
          ptr.style.transform = `translateY(${cur.offsetTop + cur.offsetHeight / 2 - 10}px)`;
          const top = cur.offsetTop;
          if (top < logBox.scrollTop || top > logBox.scrollTop + logBox.clientHeight - 40) logBox.scrollTop = Math.max(0, top - 60);
        } else ptr.style.opacity = "0";
        if (s.appended && rows[s.shown - 1]) {
          const last = rows[s.shown - 1];
          if (last.offsetTop > logBox.scrollTop + logBox.clientHeight - 40) logBox.scrollTop = last.offsetTop - logBox.clientHeight + 60;
        }
        for (const c of cards) {
          c.val.textContent = s.values[c.k];
          const changed = s.changed === c.k;
          c.from.textContent = changed ? s.from : "";
          c.el.classList.toggle("changed", changed);
          if (changed) replay(c.el, "flash");
          const dirty = aries && s.dpt.find((d) => d.item === c.k);
          c.el.classList.toggle("dirty", !!dirty);
          c.extra.textContent = aries ? `PageLSN ${s.pageLSN[c.k]}${dirty ? ` · RecLSN ${dirty.rec}` : ""}` : "";
        }
        if (aries) {
          tables.replaceChildren(
            h("div", { class: "rc-box" }, h("div", { class: "panel-title" }, "Transaction table"), smallTable(["Txn", "lastLSN"], s.tt.map((x) => [x.t, x.lastLSN]))),
            h("div", { class: "rc-box" }, h("div", { class: "panel-title" }, "Dirty page table"), smallTable(["Page", "RecLSN"], s.dpt.map((x) => [x.item, x.rec]))),
            s.phase === "undo" || s.phase === "done" ? h("div", { class: "rc-box" }, h("div", { class: "panel-title" }, "ToUndo"), chips(s.toUndo, prev?.toUndo ?? [])) : null);
        } else tables.replaceChildren(h("div", { class: "rc-box" }, h("div", { class: "panel-title" }, "undo-list"), chips(s.list, prev?.list ?? s.list)));
        code.show(s.line);
        vars.show(s.vars);
        note.textContent = s.note;
        note.className = `step-note${s.done ? " good" : s.phase === "crash" ? " bad" : ""}`;
      },
    });

    const visual = h("div", { class: "rc-stage" },
      h("ol", { class: "rc-phases", "aria-label": "Recovery passes" }, phases),
      h("div", null, h("div", { class: "panel-title" }, "Log on stable storage"), logBox),
      h("div", null, h("div", { class: "panel-title" }, "Database on disk"), h("div", { class: "rc-values" }, cards.map((c) => c.el))),
      tables);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, ALGORITHMS[algo].name), player.el, note, traceLayout(visual, code, vars),
        h("div", { class: "stats-row" },
          stat("Committed (kept)", setText(res.committed)),
          stat("Undone", setText(res.undone)),
          stat("Writes redone by", setText(res.redone)),
          stat("Records appended", res.log.length - crash))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, algoSel, exampleSelect(EXAMPLES, load),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const g = randomLog(rng()); load({ log: g.text, init: g.initText, crash: g.crash }); } }, "Random log"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Log, one record per line", logIn),
      h("label", { class: "stack" }, "Initial values (before the first record)", initIn),
      h("label", { class: "stack" }, h("span", null, "Crash point: ", crashLabel), crashIn),
      msg),
    out);

  // --- Practice: what does recovery do? --------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let g, res;
    do {
      g = randomLog(r, { dirty: false });
      res = recover(g.records, g.crash, "undoRedo", g.init);
    } while (!g.records.slice(0, g.crash).some((x) => x.kind === "update"));
    const items = Object.keys(res.values);
    const item = items[Math.floor(r() * items.length)];
    const undoneIn = h("input", { type: "text", class: "mono", placeholder: "e.g. T2 T3, or none", "aria-label": "Transactions undone" });
    const valueIn = h("input", { type: "number", "aria-label": `Final value of ${item}` });
    const feedback = h("div"), solution = h("div");
    const mark = (el, ok, expected) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${expected}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, "The system crashes after the last record. Recover with the undo/redo algorithm."),
      h("p", { class: "muted" }, "Initial values: ", h("b", { class: "mono" }, g.initText), ". The checkpoint (if any) flushed every modified block."),
      h("div", { class: "rc-log rc-static" }, h("ol", { class: "rc-records" }, g.records.slice(0, g.crash).map((x) => recordRow(x, false)))),
      h("div", { class: "qa" },
        h("label", null, "1. Which transactions are undone?", undoneIn),
        h("label", null, `2. Final value of ${item} after recovery`, valueIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          const given = (undoneIn.value.toUpperCase().match(/T\d+/g) ?? []).map((t) => `T${Number(t.slice(1))}`);
          const okU = /^\s*(none|-|∅)?\s*$/i.test(undoneIn.value) && undoneIn.value.trim() !== "" ? !res.undone.length
            : given.length === res.undone.length && res.undone.every((t) => given.includes(t));
          const okV = valueIn.value !== "" && Number(valueIn.value) === res.values[item];
          mark(undoneIn, okU, setText(res.undone)); mark(valueIn, okV, res.values[item]);
          const n = [okU, okV].filter(Boolean).length;
          feedback.replaceChildren(notice(n === 2 ? "good" : "info", n === 2 ? "Both right! 🎉" : `${n} / 2 right. Undone: ${setText(res.undone)}; ${item} = ${res.values[item]}. Show the working to see why.`));
        } }, "Check"),
        h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Working"),
          h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note))),
          res.log.length > g.crash ? h("p", null, "Appended by recovery: ", h("span", { class: "mono" }, res.log.slice(g.crash).map(recText).join("  "))) : null)) }, "Show the working")),
      feedback), solution);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
