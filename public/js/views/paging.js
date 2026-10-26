import { ALGORITHMS, beladyCheck, parseRefs, randomRefs, replace } from "../engines/paging.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

const BOOK = "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1";

// Frames × time grid; columns after `upto` stay hidden until the step reaches them.
function grid(refs, steps, frameCount, upto, { current = upto } = {}) {
  return h("div", { class: "table-wrap" }, h("table", { class: "frames" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Ref"), refs.map((r, i) => h("th", { scope: "col", class: i === current ? "now" : i > upto ? "future" : null }, r)))),
    h("tbody", null,
      Array.from({ length: frameCount }, (_, f) => h("tr", null, h("th", { scope: "row" }, `F${f + 1}`), steps.map((s, i) => {
        if (i > upto) return h("td", { class: "future" });
        const v = s.frames[f];
        const changed = !s.hit && s.slot === f;
        return h("td", { class: [changed ? "loaded" : "", s.hit && s.slot === f ? "hitcell" : "", i === current ? "now" : ""].join(" ").trim() || null }, v ?? "");
      }))),
      h("tr", { class: "outcome" }, h("th", { scope: "row" }, ""), steps.map((s, i) => h("td", { class: i > upto ? "future" : s.hit ? "hit" : "miss" }, i > upto ? "" : s.hit ? "✓" : "F"))))));
}

function faultTable(refs) {
  const rows = [1, 2, 3, 4, 5, 6].map((n) => [n, ...Object.keys(ALGORITHMS).map((a) => replace(refs, n, a).faults)]);
  return h("section", { class: "card" }, h("h2", null, "Faults as you add frames"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Frames"), Object.values(ALGORITHMS).map((a) => h("th", { scope: "col" }, a.name)))),
      h("tbody", null, rows.map((row, i) => h("tr", null, h("th", { scope: "row" }, row[0]),
        row.slice(1).map((v, j) => h("td", { class: j === 0 && i > 0 && v > rows[i - 1][1] ? "anomaly" : null, title: j === 0 && i > 0 && v > rows[i - 1][1] ? "Belady's anomaly: more frames, more faults" : null }, v))))))),
    h("p", { class: "muted small" }, "Highlighted cells are Belady's anomaly: FIFO faulting more with more frames. LRU and Optimal never do this."));
}

export function render(root) {
  const params = readParams();
  const state = {
    refs: params.get("r") ?? BOOK,
    frames: Number(params.get("f")) || 3,
    algo: ALGORITHMS[params.get("algo")] ? params.get("algo") : "lru",
  };
  let player = null;

  const head = page({
    subject: "Operating systems",
    title: "Page replacement",
    lede: "When memory is full and a new page is needed, which page gets thrown out? Step through FIFO, LRU and Optimal and count the faults.",
    theory: h("div", null,
      h("p", null, "A program references pages in order (the ", h("b", null, "reference string"), "). If the page is already in a frame it's a ", h("b", null, "hit"), "; if not, it's a ", h("b", null, "page fault"), " and the page is loaded, evicting another page when all frames are full."),
      h("ul", null,
        h("li", null, h("b", null, "FIFO"), " evicts the page that has been in memory longest."),
        h("li", null, h("b", null, "LRU"), " evicts the page used least recently."),
        h("li", null, h("b", null, "Optimal"), " evicts the page whose next use is furthest in the future. It needs to know the future, so it's a benchmark, not a real policy."))),
    conventions: ["Empty frames are filled top to bottom.", "Optimal: if several pages are never used again, the one loaded earliest is evicted."],
  });

  const refsIn = h("input", { type: "text", value: state.refs, "aria-label": "Reference string", class: "wide", oninput: (e) => { state.refs = e.target.value; update(); } });
  const framesIn = h("input", { type: "number", min: 1, max: 8, value: state.frames, "aria-label": "Number of frames", onchange: (e) => { state.frames = Number(e.target.value); update(); } });
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } },
    Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id, selected: id === state.algo }, s.name)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ r: state.refs, f: state.frames, algo: state.algo });
    let refs, result;
    try {
      refs = parseRefs(state.refs);
      result = replace(refs, state.frames, state.algo);
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({
      count: refs.length, label: "Reference", interval: 900, start: 0,
      render: (i) => {
        stage.replaceChildren(grid(refs, result.steps, state.frames, i));
        note.textContent = `Step ${i + 1}: ${result.steps[i].note}`;
      },
    });
    const belady = beladyCheck(refs, state.frames);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, ALGORITHMS[state.algo].name), player.el, stage, note,
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Page faults"), h("b", null, result.faults)),
          h("div", { class: "stat" }, h("span", null, "Hits"), h("b", null, result.hits)),
          h("div", { class: "stat" }, h("span", null, "Hit ratio"), h("b", null, `${Math.round(result.hitRatio * 100)}%`)),
          h("div", { class: "stat" }, h("span", null, "Fault ratio"), h("b", null, `${Math.round((1 - result.hitRatio) * 100)}%`))),
        belady.anomaly ? notice("info", `Belady's anomaly: FIFO has ${belady.faults} faults with ${belady.frames} frames but ${belady.moreFaults} with ${belady.moreFrames}.`) : null),
      faultTable(refs));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Reference string", refsIn),
      h("div", { class: "row" }, h("label", { class: "inline" }, "Frames ", framesIn), algoSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.refs = randomRefs().join(" "); refsIn.value = state.refs; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.refs = BOOK; refsIn.value = BOOK; update(); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { state.refs = "1 2 3 4 1 2 5 1 2 3 4 5"; state.algo = "fifo"; refsIn.value = state.refs; algoSel.value = "fifo"; update(); } }, "Show Belady's anomaly"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // --- Practice: call each reference as you go ------------------------------
  const practice = h("div", { class: "panel-body" });
  const practiceAlgo = h("select", { "aria-label": "Practice algorithm" }, Object.entries(ALGORITHMS).map(([id, s]) => h("option", { value: id }, s.name)));
  function newQuestion() {
    const r = rng();
    const algo = practiceAlgo.value, frames = 3;
    const refs = randomRefs(r);
    const { steps } = replace(refs, frames, algo);
    let i = 0, score = 0;
    const board = h("div"), prompt = h("div", { class: "prompt" }), feedback = h("p", { class: "step-note", "aria-live": "polite" });
    const show = () => board.replaceChildren(grid(refs, steps, frames, i - 1, { current: i }));
    const finish = () => {
      prompt.replaceChildren(h("p", { class: "score" }, `${score} / ${refs.length} correct.`), h("button", { type: "button", class: "btn primary", onclick: newQuestion }, "Another one"));
    };
    const ask = () => {
      if (i === refs.length) { show(); finish(); return; }
      show();
      const step = steps[i], prev = i ? steps[i - 1].frames : Array(frames).fill(null);
      const full = prev.every((x) => x !== null);
      const answer = (guess) => {
        const ok = guess === (step.hit ? "hit" : step.victim ?? "miss");
        if (ok) score++;
        feedback.textContent = `${ok ? "✓ Right." : "✗ Not quite."} ${step.note}`;
        feedback.className = `step-note ${ok ? "good" : "bad"}`;
        i++;
        ask();
      };
      prompt.replaceChildren(
        h("p", null, h("b", null, `Reference ${i + 1}: page ${step.page}. `), full ? "Hit, or which page gets evicted?" : "Hit or miss?"),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn ghost", onclick: () => answer("hit") }, "Hit"),
          full ? prev.map((p) => h("button", { type: "button", class: "btn ghost", onclick: () => answer(p) }, `Miss, evict ${p}`))
            : h("button", { type: "button", class: "btn ghost", onclick: () => answer("miss") }, "Miss (free frame)")),
        h("p", { class: "muted small" }, `Score so far: ${score}`));
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, practiceAlgo, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `${ALGORITHMS[algo].name} with ${frames} frames`),
      h("p", { class: "muted" }, `Reference string: ${refs.join(" ")}`),
      board, prompt, feedback));
    ask();
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

