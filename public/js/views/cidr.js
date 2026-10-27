import { contains, lookup, LPM_CODE, parsePrefixes, parseTable, randomTable, show, summarise, SUMMARY_CODE } from "../engines/cidr.js";
import { binary, dotted, parseAddress } from "../engines/subnet.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion } from "./kit.js";
import { packet } from "./net.js";

// The address and the entry being compared, bit by bit.
function bitCompare(ip, e, st) {
  const a = binary(ip), pbits = e ? binary(e.net) : null;
  let k = -1;
  const row = (label, s, isPrefix) => h("div", { class: "bits-row" }, h("span", { class: "bits-label" }, label),
    h("span", { class: "bits" }, [...s].map((c) => {
      if (c === ".") return h("i", { class: "dot" }, ".");
      k++;
      if (!e) return h("i", null, c);
      const inPrefix = k < e.len, bad = st.diff === k;
      return h("i", { class: !inPrefix ? "host" : bad ? "miss" : st.hit || k < st.diff ? "net" : "pending" }, isPrefix && !inPrefix ? "*" : c);
    })),
    h("span", { class: "bits-dec mono" }, isPrefix ? show(e) : dotted(ip)));
  const first = row("Address", a, false);
  k = -1;
  return h("div", { class: "bits-grid" }, first, e ? row(`Entry → ${e.iface}`, pbits, true) : null);
}

// A router with one line per interface; the packet leaves on the winner.
function routerSvg(table, st, best) {
  const ifaces = [...new Set(table.map((e) => e.iface))];
  const W = 420, H = Math.max(140, 40 + ifaces.length * 34), rx = 120, ry = H / 2;
  const y = (i) => 30 + i * ((H - 60) / Math.max(1, ifaces.length - 1));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "router", role: "img", "aria-label": best && st.done ? `Forwarded on interface ${best.iface}` : "Router" },
    h("line", { x1: 10, x2: rx - 30, y1: ry, y2: ry, class: "wire" }),
    ifaces.map((f, i) => h("g", { class: `iface${st.done && best?.iface === f ? " win" : st.entry != null && table[st.entry].iface === f && st.hit ? " hit" : ""}` },
      h("line", { x1: rx + 30, y1: ry, x2: W - 70, y2: y(i) }), h("text", { x: W - 62, y: y(i) + 4 }, `if ${f}`))),
    h("rect", { x: rx - 30, y: ry - 24, width: 60, height: 48, rx: 10, class: "router-box" }), h("text", { x: rx, y: ry + 5, "text-anchor": "middle", class: "router-label" }, "R"),
    st.done && best ? packet(rx + 30, ry, W - 74, y(ifaces.indexOf(best.iface)), { label: "pkt", cls: "data", dur: 0.9 }) : !st.done ? packet(14, ry, rx - 34, ry, { label: "pkt", cls: "data", dur: 0.6 }) : null);
}

// Prefixes as blocks on the address line, merging as they're summarised.
function blocksSvg(st, lo, hi, original) {
  const W = 640, H = 120, span = hi - lo + 1, x = (a) => 10 + ((a - lo) / span) * (W - 20);
  const blk = (b, y, cls, key) => {
    const x0 = x(b.net), w = Math.max(3, x(b.net + 2 ** (32 - b.len)) - x0);
    return h("g", { class: `blk ${cls}`, "data-k": key, "data-x": x0, "data-y": y }, h("rect", { x: x0, y, width: w, height: 30, rx: 4 }, h("title", null, show(b))), w > 70 ? h("text", { x: x0 + w / 2, y: y + 19, "text-anchor": "middle" }, show(b)) : w > 30 ? h("text", { x: x0 + w / 2, y: y + 19, "text-anchor": "middle" }, `/${b.len}`) : null);
  };
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "blocks", role: "img", "aria-label": `Blocks: ${st.blocks.map(show).join(", ")}` },
    h("text", { x: 10, y: 12, class: "tick" }, "given"), original.map((b, i) => blk(b, 16, "orig", `o${i}`)),
    h("text", { x: 10, y: 66, class: "tick" }, st.supernet ? `summary (supernet ${show(st.supernet)})` : "summary so far"),
    st.supernet ? h("rect", { x: x(st.supernet.net), y: 70, width: x(st.supernet.net + 2 ** (32 - st.supernet.len)) - x(st.supernet.net), height: 38, rx: 6, class: "supernet" }) : null,
    st.blocks.map((b) => blk(b, 74, st.merged && b.net === st.merged.net && b.len === st.merged.len ? "merged" : "sum", `s${b.net}/${b.len}`)));
}

export function render(root) {
  const p = readParams();
  const state = { table: (p.get("t") ?? "200.23.16.0/21 0;200.23.24.0/24 1;200.23.24.0/21 2;default 3").replace(/;/g, "\n"), addr: p.get("a") ?? "200.23.24.170",
    list: p.get("s") ?? "200.23.16.0/23 200.23.18.0/23 200.23.20.0/23 200.23.22.0/23 200.23.24.0/23 200.23.26.0/23 200.23.28.0/23 200.23.30.0/23" };
  let lPlayer = null, sPlayer = null;
  const head = page({
    subject: "Computer networks", title: "CIDR & longest prefix match",
    lede: "How a router picks the outgoing link: compare the destination with every prefix and take the longest match. Then summarise many routes into one with CIDR aggregation.",
    theory: h("div", null,
      h("p", null, "With ", h("b", null, "CIDR"), " a route is a prefix like 200.23.16.0/21: the first 21 bits are fixed and the rest can be anything. A forwarding table lists prefixes and the interface for each. Several prefixes can match one address (a /21 and a /24 inside it, plus the /0 default route); the router uses the ", h("b", null, "longest prefix match"), ", the most specific route."),
      h("p", null, h("b", null, "Route aggregation"), " (summarisation, supernetting) goes the other way: two blocks of the same size that are the two halves of a bigger aligned block can be advertised as that one block. Repeat until nothing merges. Advertising a single supernet that also covers addresses you don't own is possible but attracts traffic for them; longest-prefix matching is what lets a more specific route elsewhere override it.")),
    conventions: ["Entries are written \"prefix interface\"; \"default\" means 0.0.0.0/0.", "Prefixes must have their host bits set to 0.", "Bits are numbered from 1 at the left (most significant)."],
  });

  const tableIn = h("textarea", { rows: 5, class: "mono", "aria-label": "Forwarding table", oninput: (e) => { state.table = e.target.value; lpm(); } }, state.table);
  const addrIn = h("input", { type: "text", class: "mono", value: state.addr, "aria-label": "Destination address", oninput: (e) => { state.addr = e.target.value; lpm(); } });
  const listIn = h("textarea", { rows: 3, class: "mono", "aria-label": "Prefixes to summarise", oninput: (e) => { state.list = e.target.value; sum(); } }, state.list);
  const lMsg = h("div"), lOut = h("div"), sMsg = h("div"), sOut = h("div");
  const save = () => writeParams({ t: state.table.split("\n").map((x) => x.trim()).filter(Boolean).join(";"), a: state.addr, s: state.list });

  function lpm() {
    lPlayer?.destroy(); lPlayer = null; save();
    let table, ip, r;
    try {
      table = parseTable(state.table);
      const a = parseAddress(state.addr);
      if (a.prefix !== null) throw new Error("Give the destination as a plain address, without a /prefix.");
      ip = a.ip; r = lookup(table, ip);
    } catch (e) { lMsg.replaceChildren(notice("error", e.message)); lOut.replaceChildren(); return; }
    lMsg.replaceChildren();
    const code = codePanel(LPM_CODE), vars = varsPanel();
    const bits = h("div"), rt = h("div", { class: "chart-wrap" }), tbl = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    lPlayer = stepper({ count: r.steps.length, label: "Step", interval: 1200, render: (i) => {
      const st = r.steps[i], e = st.entry != null ? table[st.entry] : null;
      bits.replaceChildren(bitCompare(ip, st.done ? r.best : e, st.done ? { hit: true } : st));
      morph(rt, routerSvg(table, st, r.best));
      tbl.replaceChildren(h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, ["Prefix", "Interface", "Matches?"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", null, table.map((row, k) => {
          const seen = r.steps.slice(0, i + 1).some((s) => s.entry === k && !s.done);
          return h("tr", { class: st.entry === k ? (st.done ? "win-row" : "current") : null }, h("th", { scope: "row", class: "mono" }, show(row)), h("td", null, row.iface), h("td", null, seen ? (contains(row, ip) ? `✓ /${row.len}` : "✗") : ""));
        })))));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.done ? (r.best ? " good" : " bad") : ""}`;
    } });
    lOut.replaceChildren(lPlayer.el, note, traceLayout(h("div", null, bits, h("div", { class: "grid-2 tight" }, tbl, rt)), code, vars));
  }

  function sum() {
    sPlayer?.destroy(); sPlayer = null; save();
    let list, r;
    try { list = parsePrefixes(state.list); r = summarise(list); } catch (e) { sMsg.replaceChildren(notice("error", e.message)); sOut.replaceChildren(); return; }
    sMsg.replaceChildren();
    const lo = r.supernet.net, hi = r.supernet.net + 2 ** (32 - r.supernet.len) - 1;
    const code = codePanel(SUMMARY_CODE), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    sPlayer = stepper({ count: r.steps.length, label: "Step", interval: 1100, render: (i) => {
      const st = r.steps[i];
      morph(stage, blocksSvg(st, lo, hi, list));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.done ? (r.exact ? " good" : " warn") : ""}`;
    } });
    sOut.replaceChildren(sPlayer.el, note, traceLayout(stage, code, vars),
      h("p", { class: "muted small" }, `Result: ${r.blocks.map(show).join(", ")}${r.blocks.length > 1 ? ` (or the single supernet ${show(r.supernet)}${r.exact ? "" : ", which is bigger than the list"})` : ""}.`));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card" }, h("h2", null, "Longest prefix match"),
      h("div", { class: "grid-2 tight" }, h("label", { class: "stack" }, "Forwarding table (prefix interface)", tableIn),
        h("div", null, h("label", { class: "stack" }, "Destination address", addrIn),
          h("div", { class: "row" },
            h("button", { type: "button", class: "btn ghost", onclick: () => { const t = randomTable(); state.table = t.rows.map((e) => `${e.len ? show(e) : "default"} ${e.iface}`).join("\n"); state.addr = dotted(t.ip); tableIn.value = state.table; addrIn.value = state.addr; lpm(); } }, "Random table"),
            h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")))),
      lMsg, lOut),
    h("section", { class: "card" }, h("h2", null, "Route summarisation"),
      h("label", { class: "stack" }, "Prefixes to aggregate (space or comma separated)", listIn), sMsg, sOut));

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    let body;
    if (r() < 0.6) {
      const t = randomTable(r);
      const res = lookup(t.rows, t.ip);
      const ifaces = [...new Set(t.rows.map((e) => e.iface))];
      body = [h("h2", null, `Which interface does the router use for ${dotted(t.ip)}?`),
        h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", { scope: "col" }, "Prefix"), h("th", { scope: "col" }, "Interface"))),
          h("tbody", null, t.rows.map((e) => h("tr", null, h("td", { class: "mono" }, e.len ? show(e) : "default"), h("td", null, e.iface)))))),
        choice(ifaces.map((f) => ({ label: `Interface ${f}`, correct: f === res.best.iface })), `Matching prefixes: ${res.matches.map(show).join(", ")}. The longest is ${show(res.best)}, so interface ${res.best.iface}.`)];
    } else {
      const k = 2 ** (1 + Math.floor(r() * 3)), len = 24 - Math.log2(k);
      const third = Math.floor(r() * (256 / k)) * k, a = 10 + Math.floor(r() * 200), b = Math.floor(r() * 256);
      const list = Array.from({ length: k }, (_, i) => `${a}.${b}.${third + i}.0/24`);
      body = [h("h2", null, `${list.join(", ")} are summarised into one route. What is its prefix length?`),
        numberQuestion(len, `${k} consecutive, aligned /24s cover 2^${Math.log2(k)} × 256 addresses, so they share the first 24 − ${Math.log2(k)} = ${len} bits: ${a}.${b}.${third}.0/${len}.`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  lpm(); sum();
  return () => { lPlayer?.destroy(); sPlayer?.destroy(); };
}
