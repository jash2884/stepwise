import { BLANK, CODE, MACHINES, parseTM, runTM } from "../engines/turing.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, randomString, stat } from "./kit.js";

const CELL = 44;

function tmEdges(tm) {
  return tm.rules.map((r) => ({ from: r.q, to: r.next, label: `${r.read}→${r.write},${r.move}` }));
}

export function render(root) {
  const p = readParams();
  const state = { tm: p.get("tm") ?? MACHINES.anbn.text, input: p.get("w") ?? MACHINES.anbn.input };
  let player = null;
  const head = page({
    subject: "Theory of computation", title: "Turing machine",
    lede: "A tape, a head and a table of rules. Load a machine, give it an input and watch it read, write and move.",
    theory: h("div", null,
      h("p", null, "A Turing machine has an infinite tape of cells, a head over one cell, and a current state. Each rule says: ", h("i", null, "in state q reading a, write b, move L or R, and go to state p"), "."),
      h("p", null, "The machine ", h("b", null, "halts"), " when no rule applies. It accepts if it halts in an accepting state. It might also run forever, which is why the halting problem is undecidable: no program can always tell in advance."),
      h("p", null, "Turing machines can recognise languages no pushdown automaton can, like aⁿbⁿcⁿ, and compute anything a computer can (the Church–Turing thesis).")),
    conventions: ["One rule per line: q0 a -> q1 X R (state, read, new state, write, move).", "_ is the blank symbol. Moves: L, R or S (stay).", "Runs stop after 2,000 moves in case the machine never halts."],
  });

  const tmIn = h("textarea", { rows: 9, class: "mono", "aria-label": "Machine rules", oninput: (e) => { state.tm = e.target.value; update(); } }, state.tm);
  const wIn = h("input", { type: "text", class: "mono", value: state.input, "aria-label": "Input", oninput: (e) => { state.input = e.target.value.replace(/\s+/g, ""); update(); } });
  const about = h("p", { class: "muted small" }, MACHINES.anbn.about);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ tm: state.tm, w: state.input });
    let tm, res;
    try { tm = parseTM(state.tm); res = runTM(tm, state.input); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const tapeWrap = h("div", { class: "tape-wrap" }), tape = h("div", { class: "tape" }), headTag = h("div", { class: "tape-head" });
    tapeWrap.append(headTag, tape);
    const box = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), rules = h("div", { class: "table-wrap" });
    const edges = tmEdges(tm);
    const code = codePanel(CODE), vars = varsPanel();
    const lo = Math.min(...res.steps.map((s) => s.lo)), hi = Math.max(...res.steps.map((s) => s.lo + s.cells.length - 1));
    const PADC = 8, first = lo - PADC, total = hi - lo + 1 + PADC * 2;
    const cells = Array.from({ length: total }, () => h("span"));
    tape.replaceChildren(...cells);
    player = stepper({
      count: res.steps.length, label: "Move", interval: 600,
      render: (i) => {
        const st = res.steps[i];
        cells.forEach((c, k) => {
          const pos = first + k, v = pos >= st.lo && pos < st.lo + st.cells.length ? st.cells[pos - st.lo] : BLANK;
          if (c.textContent !== v) { c.textContent = v; if (i) { c.classList.remove("wrote"); void c.offsetWidth; c.classList.add("wrote"); } }
          c.classList.toggle("blank", v === BLANK);
          c.classList.toggle("head", pos === st.head);
        });
        // Keep the head centred: slide the tape under it.
        const w = tapeWrap.clientWidth || 600;
        tape.style.transform = `translateX(${(w / 2 - (st.head - first) * (CELL - 1.5) - CELL / 2).toFixed(1)}px)`;
        headTag.textContent = st.state;
        const last = res.steps[i - 1];
        morph(box, stateDiagram({ states: tm.states.map((id) => ({ id })), edges, start: tm.start, accept: tm.accept, active: [st.state], lit: st.rule ? [{ from: last.state, to: st.state }] : [], classes: st.halt ? { [st.state]: st.halt === "accept" ? "good" : "bad" } : {}, tokens: true, aria: `Turing machine in state ${st.state}` }));
        rules.replaceChildren(h("table", { class: "parse" },
          h("thead", null, h("tr", null, ["State", "Read", "Write", "Move", "Next"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, tm.rules.map((r) => h("tr", { class: r === st.rule ? "hot" : null }, [r.q, r.read, r.write, r.move, r.next].map((x) => h("td", null, x)))))));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.halt ? (st.halt === "accept" ? " good" : " bad") : ""}`;
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Run"), player.el, tapeWrap, note, traceLayout(box, code, vars),
        h("div", { class: "stats-row" }, stat("Moves", res.moves), stat("Result", res.result === "accept" ? "Accepted" : res.result === "reject" ? "Rejected" : "Still running"), stat("Tape at the end", res.output || "blank", true), stat("States", tm.states.length))),
      h("section", { class: "card" }, h("h2", null, "Rules"), rules, h("p", { class: "muted small" }, "In the diagram each arrow reads a → b, M: read a, write b, move M.")));
    requestAnimationFrame(() => player.go(player.index));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(MACHINES, (m) => { state.tm = m.text; state.input = m.input; tmIn.value = m.text; wIn.value = m.input; about.textContent = m.about; update(); }, "Load a machine…"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      about,
      h("label", { class: "stack" }, "Rules", tmIn),
      h("label", { class: "stack" }, "Input", wIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const pick = r();
    if (pick < 0.35) {
      const n = 1 + Math.floor(r() * 30);
      const bin = n.toString(2);
      const res = runTM(parseTM(MACHINES.increment.text), bin);
      practice.replaceChildren(h("section", { class: "card" },
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
        h("h2", null, `The binary increment machine runs on ${bin}. What's on the tape when it halts?`),
        choice([res.output, (n + 2).toString(2), (n * 2).toString(2), bin.replace(/1$/, "0") || "0"].filter((v, i, a) => a.indexOf(v) === i).map((v, i) => ({ label: v, correct: i === 0 })).sort(() => r() - 0.5),
          `${bin} is ${n}; adding 1 gives ${n + 1} = ${res.output}. The machine turns the trailing 1s into 0s and the first 0 (or blank) into 1.`)));
      return;
    }
    const key = pick < 0.7 ? "anbn" : "palindrome";
    const m = MACHINES[key];
    let w = randomString(r, ["a", "b"], 2, 6);
    if (key === "anbn" && r() < 0.5) { const n = 1 + Math.floor(r() * 3); w = "a".repeat(n) + "b".repeat(n + (r() < 0.5 ? 0 : 1)); }
    const res = runTM(parseTM(m.text), w);
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `Does the ${m.name} machine accept "${w}"?`),
      h("p", { class: "muted" }, m.about),
      choice([{ label: "Accept", correct: res.result === "accept" }, { label: "Reject", correct: res.result !== "accept" }], `It halts after ${res.moves} moves in a ${res.result === "accept" ? "accepting" : "non-accepting"} state.`)));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
