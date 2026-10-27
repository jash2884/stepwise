import { codePanel, traceLayout, varsPanel } from "../code.js";
import { ALGORITHMS, EXAMPLE, FSCAN_EXAMPLE, formatArrivals, parseArrivals, randomArrivals, randomQueue, schedule } from "../engines/disk.js";
import { copyLink, fmt, h, morph, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";
import { viewToggle } from "../three-kit.js";

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
    segs.push(h("line", { x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], class: `seek ${m.kind}${i === upto ? " current" : ""}`, pathLength: i === upto && m.kind !== "jump" ? 1 : null }));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "disk-chart", role: "img", "aria-label": `Head path: ${result.path.slice(0, upto + 1).join(" → ")}` },
    h("line", { x1: L, y1: top - 12, x2: W - R, y2: top - 12, class: "axis" }),
    labels.map((c) => [h("line", { x1: x(c), y1: top - 16, x2: x(c), y2: H - 10, class: "grid" }), h("text", { x: x(c), y: top - 20, "text-anchor": "middle", class: c === head ? "head-label" : "" }, c)]),
    segs,
    pts.map(([px, py], i) => h("circle", { cx: px, cy: py, r: i === upto ? 6 : 4, class: i === 0 ? "start" : result.moves[i - 1].kind === "serve" || result.moves[i - 1].served ? "served" : "edge" },
      h("title", null, i === 0 ? `Start at ${result.path[0]}` : result.moves[i - 1].note))));
}

// The platter seen from above as a strip of cylinders: pending requests,
// served ones ticked off, and the head gliding to its next stop.
function headStrip(result, cylinders, upto, requests) {
  const W = 680, L = 28, R = 20, max = cylinders - 1;
  const x = (c) => L + (c / max) * (W - L - R);
  const pos = result.path[upto];
  const servedSoFar = result.moves.slice(0, upto).filter((m) => m.kind === "serve" || m.served).map((m) => m.to);
  const left = [...requests];
  for (const r of servedSoFar) left.splice(left.indexOf(r), 1);
  const isLeft = new Set(left);
  return h("svg", { viewBox: `0 0 ${W} 58`, class: "disk-strip", role: "img", "aria-label": `Head at cylinder ${pos}. Pending: ${left.join(", ") || "none"}.` },
    h("rect", { x: L, y: 26, width: W - L - R, height: 10, rx: 5, class: "ds-track" }),
    [...new Set(requests)].map((c) => h("circle", { cx: x(c), cy: 31, r: 5, class: isLeft.has(c) ? "ds-req" : "ds-done" })),
    h("g", { class: "ds-head", "data-k": "head", "data-x": x(pos), "data-y": 0 },
      h("path", { d: `M${x(pos)},22 l-7,-12 h14 z` }),
      h("text", { x: x(pos), y: 52, "text-anchor": "middle" }, pos)));
}

// F-SCAN's two queues (plus requests still to arrive and those served), with
// each request gliding from row to row as it arrives, is swapped in and is served.
const ROWS = [["active", "Active queue (frozen, being swept)"], ["waiting", "Waiting queue (new arrivals)"], ["later", "Not arrived yet"], ["served", "Served"]];
function queueSvg(result, requests, arrivals, i) {
  const PER = 7, TW = 44, TH = 38, GX = 6, GY = 6, W = PER * (TW + GX) + 10;
  const all = [result.initial, ...result.moves].map((s) => s.queues);
  const rows = ROWS.map(([k]) => Math.max(1, Math.ceil(Math.max(...all.map((q) => q[k].length)) / PER)));
  const q = all[i], swapped = i > 0 && result.moves[i - 1].kind === "swap", just = i > 0 ? result.moves[i - 1].id : null;
  const els = [];
  let y = 0;
  ROWS.forEach(([k, name], r) => {
    els.push(h("text", { x: 4, y: y + 13, class: "pf-label" }, `${name}${k === "active" && swapped ? ": just swapped in" : ""}`));
    y += 20;
    els.push(h("rect", { x: 0, y: y - 3, width: W, height: rows[r] * (TH + GY) + 2, rx: 8, class: `fq-lane ${k}` }));
    q[k].forEach((id, j) => {
      const x = 5 + (j % PER) * (TW + GX), ty = y + Math.floor(j / PER) * (TH + GY);
      els.push(h("g", { class: `fq-tok ${k}${id === just ? " now" : ""}`, "data-k": `q:${id}`, "data-x": x, "data-y": ty },
        h("rect", { x, y: ty, width: TW, height: TH, rx: 7 }),
        h("text", { x: x + TW / 2, y: ty + 17, "text-anchor": "middle", class: "fq-cyl" }, requests[id]),
        h("text", { x: x + TW / 2, y: ty + 31, "text-anchor": "middle", class: "fq-at" }, `@${arrivals[id] ?? 0}`)));
    });
    y += rows[r] * (TH + GY) + 8;
  });
  return h("svg", { viewBox: `0 0 ${W} ${y}`, class: "fq-svg", role: "img", "aria-label": ROWS.map(([k, name]) => `${name}: ${q[k].map((id) => requests[id]).join(", ") || "empty"}`).join(". ") }, els);
}

function compare(requests, head, opts) {
  const rows = Object.entries(ALGORITHMS).map(([id, a]) => ({ id, name: id === "nstep" ? `${a.name} (N = ${opts.n})` : a.name, total: schedule(requests, head, id, opts).total }));
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
    n: Number(p.get("n")) || 4,
  };
  let player = null;
  // Optional 3D view: loaded only when chosen, rebuilt when the inputs change.
  let d3 = null, gen = 0, live = null;
  const drop3d = () => { gen++; d3?.dispose(); d3 = null; };
  const toggle = viewToggle("disk-scheduling", () => mount3d());
  async function mount3d() {
    drop3d();
    if (!live) return;
    const my = gen, { host, flat } = live;
    const on = toggle.mode === "3d";
    host.hidden = !on;
    for (const el of flat) el.hidden = on;
    if (!on) { host.replaceChildren(); return; }
    try {
      const { diskScene } = await import("./disk-3d.js");
      const sc = await diskScene(host, { ...live.args, height: matchMedia("(max-width: 600px)").matches ? 300 : 400 });
      if (my !== gen) { sc.dispose(); return; }
      d3 = sc;
      d3.show(player?.index ?? 0, true);
    } catch (e) { host.replaceChildren(notice("error", `3D view unavailable: ${e.message}`)); }
  }
  const head = page({
    subject: "Operating systems", title: "Disk scheduling",
    lede: "A queue of cylinder requests and a read/write head: in what order should it move? Watch each algorithm's path and total seek distance.",
    theory: h("div", null,
      h("p", null, "Moving the disk head (", h("b", null, "seeking"), ") is slow, so the OS reorders requests to reduce total head movement."),
      h("ul", null,
        h("li", null, h("b", null, "FCFS"), " serves requests in arrival order. Fair, but it zig-zags."),
        h("li", null, h("b", null, "SSTF"), " always goes to the nearest request. Short seeks, but distant requests can starve."),
        h("li", null, h("b", null, "SCAN"), " sweeps to one end of the disk, then reverses, like a lift. ", h("b", null, "LOOK"), " reverses at the last request instead of the edge."),
        h("li", null, h("b", null, "C-SCAN / C-LOOK"), " only serve in one direction, then jump back to the start for more uniform waiting times."),
        h("li", null, h("b", null, "N-step SCAN"), " splits the queue into batches of N requests and SCANs one batch at a time. New requests can't keep pulling the head back to the same busy area (\u201carm stickiness\u201d), because they wait for a later batch."),
        h("li", null, h("b", null, "F-SCAN"), " is the two-queue version. When a sweep starts, the active queue is frozen; anything that arrives during the sweep goes into the other queue. When the sweep has served the whole active queue, the two queues swap. Give requests arrival times (98@12) to see it.")),
      h("p", null, "Seek time is roughly proportional to the distance the arm travels, so every algorithm here is judged on ", h("b", null, "total head movement"), " in cylinders.")),
    conventions: ["Cylinders are numbered 0 to (cylinders − 1).", "A request can carry an arrival time, written cylinder@time (e.g. 98@12); a plain cylinder arrives at time 0. Only F-SCAN uses arrival times: every other algorithm treats the whole queue as present from the start.", "F-SCAN: the head moves 1 cylinder per time unit and serving a request takes no extra time. The active queue is frozen and swept with SCAN (to the edge before reversing, like one N-step batch); arrivals wait in the other queue even if the head passes their cylinder. When the active queue empties the queues swap, and a request arriving at that exact moment is included. If nothing is waiting, the head stays put until the next arrival. The direction carries over from one sweep to the next.", "SSTF ties go to the request that arrived first.", "SCAN and C-SCAN go all the way to the edge; LOOK and C-LOOK turn at the last request.", "The C-SCAN/C-LOOK return jump counts as head movement unless you untick it (textbooks differ).", "N-step SCAN batches the queue in arrival order; within a batch it behaves like SCAN (to the edge before reversing)."],
  });

  const reqIn = h("input", { type: "text", class: "wide", value: state.requests, "aria-label": "Request queue", oninput: (e) => { state.requests = e.target.value; update(); } });
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const algoSel = h("select", { "aria-label": "Algorithm", onchange: (e) => { state.algo = e.target.value; update(); } }, Object.entries(ALGORITHMS).map(([id, a]) => h("option", { value: id, selected: id === state.algo }, a.name)));
  const dirSel = h("label", { class: "inline" }, "Direction ", h("select", { onchange: (e) => { state.direction = e.target.value; update(); } }, h("option", { value: "up", selected: state.direction === "up" }, "towards higher"), h("option", { value: "down", selected: state.direction === "down" }, "towards 0")));
  const nIn = num("n", "N", 1, 30);
  const jumpBox = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.countJump, onchange: (e) => { state.countJump = e.target.checked; update(); } }), " count the return jump");
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    drop3d();
    live = null;
    writeParams({ r: state.requests, h: state.head, c: state.cylinders, algo: state.algo, dir: state.direction, jump: state.countJump ? 1 : 0, n: state.n });
    nIn.hidden = state.algo !== "nstep";
    dirSel.hidden = !ALGORITHMS[state.algo].direction;
    jumpBox.hidden = !ALGORITHMS[state.algo].circular;
    let requests, result;
    const opts = { cylinders: state.cylinders, direction: state.direction, countJump: state.countJump, n: state.n };
    let arrivals;
    try { ({ requests, arrivals } = parseArrivals(state.requests)); opts.arrivals = arrivals; result = schedule(requests, state.head, state.algo, opts); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), running = h("p", { class: "muted small" });
    const strip = h("div", { class: "chart-wrap" });
    const timed = ALGORITHMS[state.algo].timed;
    const queues = timed ? h("div", { class: "chart-wrap fq-wrap" }) : null;
    const code = codePanel(ALGORITHMS[state.algo].code), vars = varsPanel();
    const host3d = h("div", { class: "d3-host", hidden: true });
    player = stepper({
      count: result.path.length, label: "Move", interval: 900,
      render: (i) => {
        stage.replaceChildren(chart(result, state.cylinders, i, requests, state.head));
        morph(strip, headStrip(result, state.cylinders, i, requests));
        if (queues) morph(queues, queueSvg(result, requests, arrivals, i));
        const st = i === 0 ? result.initial : result.moves[i - 1];
        note.textContent = st.note;
        code.show(st.line);
        vars.show(st.vars);
        running.textContent = `Head movement so far: ${i ? result.moves[i - 1].total : 0} cylinders.${timed ? ` Time t = ${st.vars.t}.` : ""}`;
        d3?.show(i);
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("div", { class: "d3-head" }, h("h2", null, ALGORITHMS[state.algo].name), toggle.el), player.el, note,
        traceLayout(h("div", null, queues, host3d, strip, stage, running), code, vars),
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, "Total head movement"), h("b", null, result.total)),
          timed ? h("div", { class: "stat" }, h("span", null, "Sweeps"), h("b", null, result.sweeps)) : null,
          h("div", { class: "stat" }, h("span", null, "Average seek"), h("b", null, fmt(result.average))),
          h("div", { class: "stat wide-stat" }, h("span", null, "Service order"), h("b", { class: "mono order" }, result.order.join(" → "))))),
      compare(requests, state.head, opts));
    live = { host: host3d, flat: [strip, stage], args: { result, requests, cylinders: state.cylinders, timed } };
    if (toggle.mode === "3d") mount3d();
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("label", { class: "stack" }, "Request queue (cylinders in arrival order; add @time for F-SCAN, e.g. 14@20)", reqIn),
      h("div", { class: "row" }, num("head", "Head at", 0, 9999), num("cylinders", "Cylinders", 2, 10000), algoSel, dirSel, nIn, jumpBox),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const q = randomQueue(Math.random, state.cylinders);
          const text = ALGORITHMS[state.algo].timed ? formatArrivals(q.requests, randomArrivals(Math.random, q.requests.length)) : q.requests.join(" ");
          player?.destroy(); drop3d();
          writeParams({ r: text, h: q.head, c: state.cylinders, algo: state.algo, dir: state.direction, jump: state.countJump ? 1 : 0, n: state.n });
          render(root);
        } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); drop3d(); history.replaceState(null, "", location.pathname); render(root); } }, "Textbook example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          player?.destroy(); drop3d();
          writeParams({ r: formatArrivals(FSCAN_EXAMPLE.requests, FSCAN_EXAMPLE.arrivals), h: FSCAN_EXAMPLE.head, c: FSCAN_EXAMPLE.cylinders, algo: "fscan", dir: "up", jump: 1, n: state.n });
          render(root);
        } }, "F-SCAN example"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    // N-step SCAN is left to the visualiser; F-SCAN comes up as often as the others.
    const algo = [...Object.keys(ALGORITHMS).slice(0, 6), "fscan"][Math.floor(r() * 7)];
    const direction = r() < 0.5 ? "up" : "down";
    const q = randomQueue(r);
    const timed = ALGORITHMS[algo].timed;
    const arrivals = timed ? randomArrivals(r, q.requests.length) : [];
    const opts = { cylinders: 200, direction, countJump: true, arrivals };
    const truth = schedule(q.requests, q.head, algo, opts);
    const totalIn = h("input", { type: "number", "aria-label": "Total head movement" });
    const orderIn = h("input", { type: "text", class: "wide mono", placeholder: "e.g. 65 67 37 14", "aria-label": "Service order" });
    const feedback = h("div"), solution = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `${ALGORITHMS[algo].name}${ALGORITHMS[algo].direction ? `, moving ${direction === "up" ? "towards higher cylinders" : "towards 0"}` : ""}`),
      h("p", null, "Queue: ", h("b", { class: "mono" }, timed ? q.requests.map((c, i) => `${c}@${arrivals[i]}`).join(", ") : q.requests.join(", ")), ` · head at ${q.head} · cylinders 0–199${ALGORITHMS[algo].circular ? " · count the return jump" : ""}.`),
      timed ? h("p", { class: "muted small" }, "cylinder@time is the arrival time. The head moves 1 cylinder per time unit; a request that arrives during a sweep waits for the next one, and the queues swap when the active one is empty.") : null,
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
          const lanes = timed ? h("div", { class: "chart-wrap fq-wrap" }) : null;
          const pl = stepper({ count: truth.path.length, label: "Move", render: (i) => {
            stage.replaceChildren(chart(truth, 200, i, q.requests, q.head));
            if (lanes) morph(lanes, queueSvg(truth, q.requests, arrivals, i));
            note.textContent = i ? truth.moves[i - 1].note : timed ? truth.initial.note : `Start at ${q.head}.`;
          } });
          solution.replaceChildren(h("section", { class: "card" }, h("h2", null, `Solution: ${truth.total} cylinders`), pl.el, note, lanes, stage));
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
  return () => { player?.destroy(); drop3d(); };
}
