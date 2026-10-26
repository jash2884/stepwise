import { parseEvents, randomScenario, simulate, VARIANTS } from "../engines/congestion.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// cwnd per round for the chosen variant (solid) with the other variant faint for comparison.
function chart(main, other, upto, names) {
  const W = 640, H = 310, L = 40, R = 16, T = 34, B = 34;
  const n = main.series.length;
  const max = Math.max(...main.series.map((p) => Math.max(p.cwnd, p.ssthresh)), ...other.series.map((p) => p.cwnd)) + 1;
  const x = (r) => L + ((r - 1) / Math.max(n - 1, 1)) * (W - L - R);
  const y = (v) => H - B - (v / max) * (H - T - B);
  const path = (s, k, lim) => s.slice(0, lim).map((p, i) => `${i ? "L" : "M"}${x(p.round)},${y(p[k])}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max * i) / 4));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "cwnd-chart", role: "img", "aria-label": `${names[0]} congestion window by round: ${main.series.slice(0, upto + 1).map((p) => p.cwnd).join(", ")}` },
    ticks.map((v) => [h("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), h("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, v)]),
    main.series.filter((p) => p.round % (n > 30 ? 5 : n > 15 ? 2 : 1) === 0 || p.round === 1).map((p) => h("text", { x: x(p.round), y: H - B + 16, "text-anchor": "middle" }, p.round)),
    h("text", { x: (W + L) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title" }, "Transmission round"),
    h("text", { x: L - 8, y: T - 14, "text-anchor": "end", class: "axis-title" }, "MSS"),
    h("path", { d: path(other.series, "cwnd", upto + 1), class: "line other" }),
    h("path", { d: main.series.slice(0, upto + 1).map((p, i) => `${i ? "L" : "M"}${x(p.round)},${y(p.ssthresh)}`).join(" "), class: "line ssthresh" }),
    h("path", { d: path(main.series, "cwnd", upto + 1), class: "line main" }),
    main.series.slice(0, upto + 1).map((p) => h("circle", { cx: x(p.round), cy: y(p.cwnd), r: p.event ? 6 : 3.5, class: p.event ? `event ${p.event}` : "pt" }, h("title", null, `Round ${p.round}: cwnd ${p.cwnd}, ssthresh ${p.ssthresh}${p.event ? `, ${p.event === "timeout" ? "timeout" : "3 duplicate ACKs"}` : ""}`))),
    h("g", { class: "legend" },
      h("line", { x1: W - 330, x2: W - 310, y1: 14, y2: 14, class: "line main" }), h("text", { x: W - 304, y: 18 }, names[0]),
      h("line", { x1: W - 210, x2: W - 190, y1: 14, y2: 14, class: "line other" }), h("text", { x: W - 184, y: 18 }, names[1]),
      h("line", { x1: W - 88, x2: W - 68, y1: 14, y2: 14, class: "line ssthresh" }), h("text", { x: W - 62, y: 18 }, "ssthresh")));
}

export function render(root) {
  const p = readParams();
  const state = { variant: VARIANTS[p.get("v")] ? p.get("v") : "reno", ss: Number(p.get("ss") ?? 8), rounds: Number(p.get("r") ?? 22), events: p.get("e") ?? "8: 3dup, 16: timeout", plus3: p.get("p3") === "1" };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "TCP congestion control",
    lede: "Watch TCP's congestion window grow, hit a loss and back off: slow start, congestion avoidance, Tahoe and Reno, round by round.",
    theory: h("div", null,
      h("p", null, h("b", null, "Slow start"), ": cwnd starts at 1 MSS and doubles every round trip until it reaches the threshold ", h("b", null, "ssthresh"), ". ", h("b", null, "Congestion avoidance"), ": above ssthresh, cwnd grows by just 1 MSS per round."),
      h("p", null, "On a loss, ssthresh becomes half the current window. A ", h("b", null, "timeout"), " is serious: cwnd drops to 1 and slow start begins again. ", h("b", null, "Three duplicate ACKs"), " mean packets are still getting through: ", h("b", null, "Tahoe"), " still drops to 1, but ", h("b", null, "Reno"), " halves the window (fast recovery) and carries on linearly. That's the familiar sawtooth.")),
    conventions: ["cwnd is shown in MSS, one value per transmission round.", "Slow start never jumps past ssthresh: cwnd = min(2·cwnd, ssthresh).", "A loss in round r changes the window of round r + 1, and ssthresh = max(⌊cwnd/2⌋, 2).", "Reno sets cwnd = ssthresh after 3 duplicate ACKs; tick the box for Kurose's ssthresh + 3 accounting."],
  });

  const varSel = h("select", { "aria-label": "Variant", onchange: (e) => { state.variant = e.target.value; update(); } }, Object.entries(VARIANTS).map(([id, v]) => h("option", { value: id, selected: id === state.variant }, v.name)));
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const eventsIn = h("input", { type: "text", class: "wide mono", value: state.events, "aria-label": "Loss events", placeholder: "8: 3dup, 16: timeout", oninput: (e) => { state.events = e.target.value; update(); } });
  const plus3 = h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.plus3, onchange: (e) => { state.plus3 = e.target.checked; update(); } }), " Reno uses ssthresh + 3 (Kurose)");
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ v: state.variant, ss: state.ss, r: state.rounds, e: state.events, p3: state.plus3 ? 1 : 0 });
    let main, other;
    try {
      const events = parseEvents(state.events);
      const opts = { ssthresh: state.ss, rounds: state.rounds, events, plus3: state.plus3 };
      main = simulate({ ...opts, variant: state.variant });
      other = simulate({ ...opts, variant: state.variant === "reno" ? "tahoe" : "reno" });
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const names = [VARIANTS[state.variant].name, VARIANTS[state.variant === "reno" ? "tahoe" : "reno"].name];
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: main.series.length, label: "Round", interval: 650, render: (i) => {
      stage.replaceChildren(chart(main, other, i, names));
      const pt = main.series[i];
      note.textContent = `cwnd = ${pt.cwnd}, ssthresh = ${pt.ssthresh} (${pt.phase}). ${pt.note}`;
      note.className = `step-note${pt.event ? " bad" : ""}`;
    } });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, names[0]), player.el, stage, note,
        h("div", { class: "stats-row" },
          h("div", { class: "stat" }, h("span", null, `Segments sent in ${state.rounds} rounds`), h("b", null, main.totalSegments)),
          h("div", { class: "stat" }, h("span", null, `${names[1]} for comparison`), h("b", null, other.totalSegments)),
          h("div", { class: "stat" }, h("span", null, "Largest window"), h("b", null, Math.max(...main.series.map((x) => x.cwnd)))))),
      h("section", { class: "card" }, h("h2", null, "Round by round"), h("div", { class: "table-wrap tall" }, h("table", null,
        h("thead", null, h("tr", null, ["Round", "cwnd", "ssthresh", "Phase", "Event"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, main.series.map((x) => h("tr", { class: x.event ? "failed" : null }, h("th", { scope: "row" }, x.round), h("td", null, x.cwnd), h("td", null, x.ssthresh), h("td", null, x.phase), h("td", null, x.event ? (x.event === "timeout" ? "timeout" : "3 dup ACKs") : ""))))))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, varSel, num("ss", "Initial ssthresh", 2, 256), num("rounds", "Rounds", 2, 60), plus3),
      h("label", { class: "stack" }, "Loss events (round: timeout or 3dup)", eventsIn),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const s = randomScenario();
          player?.destroy();
          writeParams({ v: s.variant, ss: s.ssthresh, r: state.rounds, e: s.events.map((e) => `${e.round}: ${e.type === "timeout" ? "timeout" : "3dup"}`).join(", "), p3: state.plus3 ? 1 : 0 });
          render(root);
        } }, "Random scenario"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); history.replaceState(null, "", `${location.pathname}?v=tahoe&ss=8&r=15&e=8%3A+3dup&p3=1`); render(root); } }, "Kurose's figure"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const s = randomScenario(rng());
    const r = simulate({ ssthresh: s.ssthresh, rounds: 30, events: s.events, variant: s.variant });
    const ev = s.events[0];
    const askRound = ev.round + 2 + Math.floor(Math.random() * 4);
    const cwIn = h("input", { type: "number", "aria-label": `cwnd in round ${askRound}` }), ssIn = h("input", { type: "number", "aria-label": "ssthresh after the loss" });
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    const truthCw = r.series[askRound - 1].cwnd, truthSs = r.series[ev.round].ssthresh;
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, VARIANTS[s.variant].name),
      h("p", null, `cwnd starts at 1 MSS with ssthresh = ${s.ssthresh}. In round ${ev.round} there ${ev.type === "timeout" ? "is a timeout" : "are 3 duplicate ACKs"}${s.events[1] && s.events[1].round < askRound ? `, and in round ${s.events[1].round} ${s.events[1].type === "timeout" ? "a timeout" : "3 duplicate ACKs"}` : ""}.`),
      h("div", { class: "qa" }, h("label", null, `ssthresh right after the round-${ev.round} loss`, ssIn), h("label", null, `cwnd in round ${askRound}`, cwIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const okC = cwIn.value !== "" && Number(cwIn.value) === truthCw, okS = ssIn.value !== "" && Number(ssIn.value) === truthSs;
        mark(cwIn, okC, truthCw); mark(ssIn, okS, truthSs);
        feedback.replaceChildren(notice(okC && okS ? "good" : "info", `Windows by round: ${r.series.slice(0, askRound).map((x) => x.cwnd).join(", ")}.`));
      } }, "Check")),
      feedback));
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
