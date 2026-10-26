import { ALGORITHMS, EXAMPLE, parseRequests, randomQueue, schedule } from "../engines/disk.js";
import { copyLink, fmt, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// Classic textbook chart: cylinders across the top, time going down.
function chart(result, cylinders, upto, requests, head) {
  const W = 680, L = 28, R = 20, top = 34, row = 30;
  const max = cylinders - 1;
  const x = (c) => L + (c / max) * (W - L - R);
  const n = result.path.length;
  const H = top + (n - 1) * row + 24;
  const pts = result.path.slice(0, upto + 1).map((c, i) => [x(c), top + i * row]);
  const marks = [...new Set([0, max, head, ...requests])].sort((a, b) => a - b);
  // Only label ticks that won't collide.
  const labels = marks.reduce((kept, c) => (kept.length && x(c) - x(kept.at(-1)) < 22 && c !== max ? kept : [...kept, c]), []);
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const m = result.moves[i - 1];
    segs.push(h("line", { x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], class: `seek ${m.kind}${i === upto ? " current" : ""}` }));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "disk-chart", role: "img", "aria-label": `Head path: ${result.path.slice(0, upto + 1).join(" → ")}` },
    h("line", { x1: L, y1: top - 12, x2: W - R, y2: top - 12, class: "axis" }),
    labels.map((c) => [h("line", { x1: x(c), y1: top - 16, x2: x(c), y2: H - 10, class: "grid" }), h("text", { x: x(c), y: top - 20, "text-anchor": "middle", class: c === head ? "head-label" : "" }, c)]),
    segs,
    pts.map(([px, py], i) => h("circle", { cx: px, cy: py, r: i === upto ? 6 : 4, class: i === 0 ? "start" : result.moves[i - 1].kind === "serve" || result.moves[i - 1].served ? "served" : "edge" },
      h("title", null, i === 0 ? `Start at ${result.path[0]}` : result.moves[i - 1].note))));
}

function compare(requests, head, opts) {
  const rows = Object.entries(ALGORITHMS).map(([id, a]) => ({ id, name: a.name, total: schedule(requests, head, id, opts).total }));
  const best = Math.min(...rows.map((r) => r.total));
  return h("section", { class: "card" }, h("h2", null, "Same queue, every algorithm"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Algorithm"), h("th", { scope: "col" }, "Total head movement"), h("th", { scope: "col" }, "Average seek"))),
      h("tbody", null, rows.map((r) => h("tr", null, h("th", { scope: "row" }, r.name, r.total === best ? h("span", { class: "badge" }, "least movement") : null), h("td", null, r.total), h("td", null, fmt(r.total / requests.length)))))),
    ),
    h("p", { class: "muted small" }, `Direction: ${opts.direction === "up" ? "towards higher cylinders" : "towards 0"}. SSTF is fast but can starve far-away requests; SCAN and LOOK give fairer waiting times.`));
}

export function render(root) {
  const p = readParams();
  const state = {
    requests: p.get("r") ?? EXAMPLE.requests.join(" "),
    head: Number(p.get("h") ?? EXAMPLE.head),
    cylinders: Number(p.get("c") ?? EXAMPLE.cylinders),
    algo: ALGORITHMS[p.get("algo")] ? p.get("algo") : "sstf",
    direction: p.get("dir") === "down" ? "down" : "up",
    countJump: p.get("jump") !== "0",
  };
  let player = null;
  const head = page({
    subject: "Operating systems", title: "Disk scheduling",
    lede: "A queue of cylinder requests and a read/write head: in what order should it move? Watch each algorithm's path and total seek distance.",
    theory: h("div", null,
      h("p", null, "Moving the disk head (", h("b", null, "seeking"), ") is slow, so the OS reorders requests to reduce total head movement."),
      h("ul", null,
        h("li", null, h("b", null, "FCFS"), " serves requests in arrival order. Fair, but it zig-zags."),
        h("li", null, h("b", null, "SSTF"), " always goes to the nearest request. Short seeks, but distant requests can starve."),
        h("li", null, h("b", null, "SCAN"), " sweeps to one end of the disk, then reverses, like a lift. ", h("b", null, "LOOK"), " reverses at the last request instead of the edge."),
        h("li", null, h("b", null, "C-SCAN / C-LOOK"), " only serve in one direction, then jump back to the start for more uniform waiting times."))),
    conventions: ["Cylinders are numbered 0 to (cylinders − 1).", "SSTF ties go to the request that arrived first.", "SCAN and C-SCAN go all the way to the edge; LOOK and C-LOOK turn at the last request.", "The C-SCAN/C-LOOK return jump counts as head movement unless you untick it (textbooks differ)."],
  });

  const reqIn = h("input", { type: "text", class: "wide", value: state.requests, "aria-label": "Request queue", oninput: (e) => { state.requests = e.target.value; update(); } });
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([id, a]) => h("option", { value: id, selected: id === state.algo }, a.name)));
  const dirSel = h("label", { class: "inline" }, "Direction ", h("select", { onchange: (e) => { state.direction = e.target.value; update(); } }, h("option", { value: "up", selected: state.direction === "up" }, "towards higher"), h("option", { value: "down", selected: state.direction === "down" }, "towards 0")));
  const jumpBox = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.countJump, onchange: (e) => { state.countJump = e.target.checked; update(); } }), " count the return jump");
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ r: state.requests, h: state.head, c: state.cylinders, algo: state.algo, dir: state.direction, jump: state.countJump ? 1 : 0 });
    dirSel.hidden = !ALGORITHMS[state.algo].direction;
    jumpBox.hidden = !ALGORITHMS[state.algo].circular;
    let requests, result;
    const opts = { cylinders: state.cylinders, direction: state.direction, countJump: state.countJump };
    try { requests = parseRequests(state.requests); result = schedule(requests, state.head, state.algo, opts); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), running = h("p", { class: "muted small" });
    player = stepper({
      count: result.path.length, label: "Move", interval: 900,
      render: (i) => {
        stage.replaceChildren(chart(result, state.cylinders, i, requests, state.head));
        note.textContent = i === 0 ? `The head starts at cylinder ${state.head}.` : result.moves[i - 1].note;
        running.textContent = `Head movement so far: ${i ? result.moves[i - 1].total : 0} cylinders.`;
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, ALGORITHMS[state.algo].name), player.el, stage, note, running,
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Total head movement"), h("b", null, result.total)),
          h("div", { class: "stat" }, h("span", null, "Average seek"), h("b", null, fmt(result.average))),
          h("div", { class: "stat wide-stat" }, h("span", null, "Service order"), h("b", { class: "mono order" }, result.order.join(" → "))))),
      compare(requests, state.head, opts));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Request queue (cylinders, in arrival order)", reqIn),
      h("div", { class: "row" }, num("head", "Head at", 0, 9999), num("cylinders", "Cylinders", 2, 10000), algoSel, dirSel, jumpBox),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const q = randomQueue(Math.random, state.cylinders);
          player?.destroy();
          writeParams({ r: q.requests.join(" "), h: q.head, c: state.cylinders, algo: state.algo, dir: state.direction, jump: state.countJump ? 1 : 0 });
          render(root);
        } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); history.replaceState(null, "", location.pathname); render(root); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const algo = Object.keys(ALGORITHMS)[Math.floor(r() * 6)];
    const direction = r() < 0.5 ? "up" : "down";
    const q = randomQueue(r);
    const opts = { cylinders: 200, direction, countJump: true };
    const truth = schedule(q.requests, q.head, algo, opts);
    const totalIn = h("input", { type: "number", "aria-label": "Total head movement" });
    const orderIn = h("input", { type: "text", class: "wide mono", placeholder: "e.g. 65 67 37 14", "aria-label": "Service order" });
    const feedback = h("div"), solution = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `${ALGORITHMS[algo].name}${ALGORITHMS[algo].direction ? `, moving ${direction === "up" ? "towards higher cylinders" : "towards 0"}` : ""}`),
      h("p", null, "Queue: ", h("b", { class: "mono" }, q.requests.join(", ")), ` · head at ${q.head} · cylinders 0–199${ALGORITHMS[algo].circular ? " · count the return jump" : ""}.`),
      h("div", { class: "qa" }, h("label", null, "Total head movement", totalIn), h("label", null, "Order the requests are served", orderIn)),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          const okT = Number(totalIn.value) === truth.total;
          const given = orderIn.value.trim().split(/[\s,→>-]+/).filter(Boolean).map(Number);
          const okO = given.join(",") === truth.order.join(",");
          mark(totalIn, okT, truth.total); mark(orderIn, okO, truth.order.join(" "));
          feedback.replaceChildren(notice(okT && okO ? "good" : "info", okT && okO ? "Both right! 🎉" : `${[okT, okO].filter(Boolean).length} / 2 right. Hover a red answer, or show the solution.`));
        } }, "Check"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note" });
          const pl = stepper({ count: truth.path.length, label: "Move", render: (i) => { stage.replaceChildren(chart(truth, 200, i, q.requests, q.head)); note.textContent = i ? truth.moves[i - 1].note : `Start at ${q.head}.`; } });
          solution.replaceChildren(h("section", { class: "card" }, h("h2", null, `Solution: ${truth.total} cylinders`), pl.el, stage, note));
        } }, "Show solution")),
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
