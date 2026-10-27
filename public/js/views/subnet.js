import { analyse, ANALYSE_CODE, binary, dotted, parseAddress, parseMask, randomAddress, vlsm, VLSM_CODE } from "../engines/subnet.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// Address, mask and network in binary, with the prefix boundary marked. With a
// trace step, only the rows worked out so far are shown and the active one
// (and octet) is highlighted.
const ROWS = ["mask", "network", "broadcast"];
function bitsView(r, st = null) {
  const upto = st ? ROWS.indexOf(st.row) : 2;
  const row = (label, n, cls, key) => h("div", { class: `bits-row${st && st.row === key ? " hot" : ""}` }, h("span", { class: "bits-label" }, label),
    h("span", { class: "bits" }, [...binary(n)].map((c, i) => {
      if (c === ".") return h("i", { class: "dot" }, ".");
      const bitIndex = i - Math.floor(i / 9);
      return h("i", { class: `${bitIndex < r.prefix ? "net" : "host"} ${cls}${st?.octet === Math.floor(i / 9) ? " oct" : ""}` }, c);
    })),
    h("span", { class: "bits-dec mono" }, dotted(n)));
  return h("div", { class: "bits-grid", role: "img", "aria-label": `In binary, the first ${r.prefix} bits are the network part and the last ${32 - r.prefix} are the host part.` },
    row("Address", r.ip, "", "address"), row("Mask", r.mask, "mask", "mask"),
    upto >= 1 ? row("AND → network", r.network, "result", "network") : null,
    upto >= 2 ? row("Broadcast", r.broadcast, "bcast", "broadcast") : null,
    h("p", { class: "muted small" }, h("span", { class: "key-net" }, `■ ${r.prefix} network bits`), "  ", h("span", { class: "key-host" }, `■ ${32 - r.prefix} host bits`)));
}

// The block as a strip, each allocated subnet sliding into place as it's made.
function spaceBar(rows, blockStart, span, upto = Infinity) {
  const W = 600, H = 46;
  const placed = rows.filter((x) => !x.failed).map((x, i) => ({ ...x, i })).filter((x) => x.i < upto);
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "space-svg", role: "img", "aria-label": `${placed.length} subnets allocated` },
    h("rect", { x: 0, y: 4, width: W, height: H - 8, rx: 8, class: "space-bg" }),
    placed.map((x) => {
      const px = ((x.network - blockStart) / span) * W, w = Math.max(3, (x.size / span) * W);
      return h("g", { class: "space-blk", style: `--c:var(--series-${(x.i % 8) + 1})`, "data-k": `s:${x.name}`, "data-x": px, "data-y": 4 },
        h("rect", { x: px, y: 4, width: w, height: H - 8, rx: 4 }, h("title", null, `${x.name}: ${dotted(x.network)}/${x.prefix}`)),
        w > 46 ? h("text", { x: px + w / 2, y: H / 2 + 4, "text-anchor": "middle" }, x.name.slice(0, Math.floor(w / 8))) : null);
    }));
}

const fact = (label, value, note) => h("div", { class: "stat" }, h("span", null, label), h("b", { class: "mono" }, value), note ? h("small", { class: "muted" }, note) : null);

export function render(root) {
  const p = readParams();
  const state = { mode: p.get("mode") === "vlsm" ? "vlsm" : "address", address: p.get("a") ?? "192.168.10.77/26", base: p.get("base") ?? "192.168.1.0/24", needs: p.get("needs") ?? "Sales 100, Office 50, Lab 20, Link 2" };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "Subnetting & VLSM",
    lede: "Find the network, broadcast and usable host range of any IPv4 address, see the binary AND that produces them, and plan variable-length subnets.",
    theory: h("div", null,
      h("p", null, "A prefix such as ", h("span", { class: "mono" }, "/26"), " says the first 26 bits are the ", h("b", null, "network"), " part and the remaining 6 are the ", h("b", null, "host"), " part. The ", h("b", null, "network address"), " is the address AND the mask (host bits all 0); the ", h("b", null, "broadcast"), " has every host bit set to 1."),
      h("p", null, "A block of 2ⁿ addresses has 2ⁿ − 2 usable hosts, since the network and broadcast addresses are reserved. ", h("b", null, "VLSM"), " gives each subnet only the block size it needs: allocate the biggest first, each on a boundary that's a multiple of its size.")),
    conventions: ["/31 links have 2 usable addresses and no broadcast (RFC 3021); a /32 is one host.", "VLSM allocates the largest requirement first and never lets blocks overlap.", "Address classes are shown for reference only; modern networks are classless (CIDR)."],
  });

  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; update(); } },
    h("option", { value: "address", selected: state.mode === "address" }, "Analyse an address"), h("option", { value: "vlsm", selected: state.mode === "vlsm" }, "VLSM planner"));
  const addrIn = h("input", { type: "text", class: "wide mono", value: state.address, "aria-label": "IPv4 address with prefix", placeholder: "192.168.10.77/26 or 192.168.10.77 255.255.255.192", oninput: (e) => { state.address = e.target.value; update(); } });
  const baseIn = h("input", { type: "text", class: "mono", value: state.base, "aria-label": "Address block to divide", oninput: (e) => { state.base = e.target.value; update(); } });
  const needsIn = h("input", { type: "text", class: "wide", value: state.needs, "aria-label": "Subnets and hosts needed", oninput: (e) => { state.needs = e.target.value; update(); } });
  const addrBox = h("div", null, h("label", { class: "stack" }, "Address (with /prefix, or followed by a dotted mask)", addrIn));
  const vlsmBox = h("div", null, h("label", { class: "stack" }, "Address block", baseIn), h("label", { class: "stack" }, "Subnets needed (name hosts, comma-separated)", needsIn));
  const msg = h("div"), out = h("div", { class: "output" });

  const parseInput = (text) => {
    const parts = text.trim().split(/\s+/);
    const a = parseAddress(parts[0]);
    const prefix = parts[1] ? parseMask(parts[1]) : a.prefix;
    if (prefix === null) throw new Error("Add a prefix (/26) or a mask (255.255.255.192).");
    return { ip: a.ip, prefix };
  };

  // A stepper over a trace, with the drawing beside the pseudocode and variables.
  function traceCard(steps, lines, title, draw) {
    const code = codePanel(lines), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: steps.length, label: "Step", interval: 1100, render: (i) => {
      const st = steps[i];
      morph(stage, draw(st, i));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.failed ? " bad" : st.done || i === steps.length - 1 ? " good" : ""}`;
    } });
    return h("section", { class: "card" }, h("h2", null, title), player.el, note, traceLayout(stage, code, vars));
  }

  function update() {
    player?.destroy(); player = null;
    writeParams({ mode: state.mode, a: state.address, base: state.base, needs: state.needs });
    addrBox.hidden = state.mode !== "address";
    vlsmBox.hidden = state.mode !== "vlsm";
    try {
      if (state.mode === "address") {
        const { ip, prefix } = parseInput(state.address);
        const r = analyse(ip, prefix);
        msg.replaceChildren();
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, `${dotted(r.ip)}/${r.prefix}`),
            h("div", { class: "stats-row facts" },
              fact("Network address", dotted(r.network)), fact("Broadcast", r.prefix >= 31 ? "none" : dotted(r.broadcast)),
              fact("First usable", dotted(r.first)), fact("Last usable", dotted(r.last)),
              fact("Usable hosts", r.usable.toLocaleString("en"), `of ${r.total.toLocaleString("en")} addresses`),
              fact("Subnet mask", dotted(r.mask)), fact("Wildcard", dotted(r.wildcard)), fact("Class · type", `${r.cls}`, r.type))),
          traceCard(r.trace, ANALYSE_CODE, "How it's worked out", (st) => bitsView(r, st)));
      } else {
        const { ip, prefix } = parseInput(state.base);
        const needs = state.needs.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x, i) => {
          const m = /^(.*?)\s*[:=]?\s*(\d+)$/.exec(x);
          if (!m) throw new Error(`Can't read "${x}". Write it like "Sales 100".`);
          return { name: m[1] || `Subnet ${i + 1}`, hosts: Number(m[2]) };
        });
        if (!needs.length) throw new Error("List at least one subnet, e.g. Sales 100.");
        if (needs.length > 12) throw new Error("Plan at most 12 subnets at a time.");
        const r = vlsm(ip, prefix, needs);
        msg.replaceChildren();
        const span = r.total;
        const blockStart = analyse(ip, prefix).network;
        const placedBy = (i) => r.steps.slice(0, i + 1).filter((s) => s.row != null).length;
        out.replaceChildren(
          traceCard(r.steps, VLSM_CODE, `Dividing ${dotted(blockStart)}/${prefix} (${span.toLocaleString("en")} addresses)`, (st, i) => spaceBar(r.rows, blockStart, span, placedBy(i))),
          h("section", { class: "card" }, h("h2", null, "The plan"),
          h("p", { class: "muted small" }, `${r.used.toLocaleString("en")} of ${span.toLocaleString("en")} addresses allocated (${Math.round((r.used / span) * 100)}%).`),
          h("div", { class: "table-wrap" }, h("table", null,
            h("thead", null, h("tr", null, ["Subnet", "Hosts needed", "Block", "Network", "Usable range", "Broadcast", "Spare hosts"].map((t) => h("th", { scope: "col" }, t)))),
            h("tbody", null, r.rows.map((x) => h("tr", { class: x.failed ? "failed" : null },
              h("th", { scope: "row" }, x.name), h("td", null, x.hosts), h("td", { class: "mono" }, `/${x.prefix}`),
              ...(x.failed ? [h("td", { colspan: 4, class: "bad-text" }, "Doesn't fit in the block")] : [h("td", { class: "mono" }, dotted(x.network)), h("td", { class: "mono" }, `${dotted(x.first)} – ${dotted(x.last)}`), h("td", { class: "mono" }, dotted(x.broadcast)), h("td", null, x.usable - x.hosts)]))))))));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { const a = randomAddress(); state.address = `${dotted(a.ip)}/${a.prefix}`; addrIn.value = state.address; state.mode = "address"; modeSel.value = "address"; update(); } }, "Random address"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      addrBox, vlsmBox, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const a = randomAddress(rng());
    const r = analyse(a.ip, a.prefix);
    const useMask = Math.random() < 0.4;
    const q = useMask ? `${dotted(a.ip)}  mask ${dotted(r.mask)}` : `${dotted(a.ip)}/${a.prefix}`;
    const netIn = h("input", { type: "text", class: "mono", "aria-label": "Network address" }), bcIn = h("input", { type: "text", class: "mono", "aria-label": "Broadcast address" }), hostsIn = h("input", { type: "number", "aria-label": "Usable hosts" });
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, h("span", { class: "mono" }, q)),
      h("div", { class: "qa" }, h("label", null, "Network address", netIn), h("label", null, "Broadcast address", bcIn), h("label", null, "Number of usable hosts", hostsIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const okN = netIn.value.trim() === dotted(r.network), okB = bcIn.value.trim() === dotted(r.broadcast), okH = Number(hostsIn.value) === r.usable && hostsIn.value !== "";
        mark(netIn, okN, dotted(r.network)); mark(bcIn, okB, dotted(r.broadcast)); mark(hostsIn, okH, r.usable);
        const n = [okN, okB, okH].filter(Boolean).length;
        feedback.replaceChildren(notice(n === 3 ? "good" : "info", n === 3 ? "All three right! 🎉" : `${n} / 3 right. Hover a red answer, or see the working below.`), n === 3 ? null : bitsView(r));
      } }, "Check")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Calculate"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}

