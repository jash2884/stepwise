import { DNS_CODE, DNS_LANES, dnsLookup, HTTP_CODE, HTTP_MODES, httpTiming, totalFormula } from "../engines/dnshttp.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, fmt, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { seqDiagram } from "./net.js";

export function render(root) {
  const p = readParams();
  const state = {
    name: p.get("q") ?? "gaia.cs.umass.edu", dmode: p.get("dm") === "recursive" ? "recursive" : "iterative", cache: ["none", "tld", "answer"].includes(p.get("c")) ? p.get("c") : "none",
    hmode: HTTP_MODES[p.get("hm")] ? p.get("hm") : "np-serial", objects: Number(p.get("n") ?? 3), rtt: Number(p.get("rtt") ?? 100), tx: Number(p.get("tx") ?? 0), parallel: Number(p.get("par") ?? 5), dns: p.get("dns") ?? "",
  };
  let dPlayer = null, hPlayer = null;
  const head = page({
    subject: "Computer networks", title: "DNS & HTTP",
    lede: "Follow a DNS lookup from your laptop through the root, TLD and authoritative servers, iteratively or recursively, with caching. Then time an HTTP page load for every kind of connection.",
    theory: h("div", null,
      h("p", null, h("b", null, "DNS"), " is a distributed database. ", h("b", null, "Root servers"), " know where the top-level-domain servers are; ", h("b", null, "TLD servers"), " (.com, .edu, .uk, …) know each domain's ", h("b", null, "authoritative server"), ", which holds the actual records. Your host asks its ", h("b", null, "local DNS server"), ", which does the legwork."),
      h("p", null, "In an ", h("b", null, "iterative"), " lookup the local server asks each server in turn and each one replies with a referral (\"ask them\"). In a ", h("b", null, "recursive"), " lookup each server asks the next on your behalf and passes the answer back. Both take 8 messages without caching; caches (with a TTL on every record) let later lookups skip most of the chain."),
      h("p", null, h("b", null, "HTTP"), " over TCP: opening a connection costs one RTT (SYN, SYN+ACK), and each request–response another RTT plus the time to transmit the object. ", h("b", null, "Non-persistent"), " HTTP opens a new connection for every object (2 RTTs each), optionally several in parallel. ", h("b", null, "Persistent"), " HTTP reuses one connection: 1 RTT per object, or about 1 RTT for all of them with ", h("b", null, "pipelining"), ".")),
    conventions: ["Every DNS message takes the same one-way time; the local DNS server always answers its own host recursively.", "Names resolve to made-up addresses in 203.0.113.0/24, a range reserved for examples.", "HTTP: the GET rides on the handshake's final ACK; parallel connections don't slow each other down; transmission times are added once per response (Kurose & Ross's model)."],
  });

  // --- DNS ---
  const nameIn = h("input", { type: "text", class: "mono", value: state.name, "aria-label": "Name to look up", oninput: (e) => { state.name = e.target.value; dns(); } });
  const sel = (key, label, opts, fn) => h("select", { "aria-label": label, onchange: (e) => { state[key] = e.target.value; fn(); } }, opts.map(([v, t]) => h("option", { value: v, selected: v === state[key] }, t)));
  const dnsMsg = h("div"), dnsOut = h("div");
  function save() { writeParams({ q: state.name, dm: state.dmode, c: state.cache, hm: state.hmode, n: state.objects, rtt: state.rtt, tx: state.tx, par: state.parallel, dns: state.dns }); }
  function dns() {
    dPlayer?.destroy(); dPlayer = null; save();
    let r;
    try { r = dnsLookup({ name: state.name, mode: state.dmode, cache: state.cache }); } catch (e) { dnsMsg.replaceChildren(notice("error", e.message)); dnsOut.replaceChildren(); return; }
    dnsMsg.replaceChildren();
    const lanes = DNS_LANES.filter((l) => r.msgs.some((m) => m.from === l.id || m.to === l.id));
    const code = codePanel(DNS_CODE[state.dmode]), vars = varsPanel();
    const stage = h("div", { class: "timeline-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    dPlayer = stepper({ count: r.steps.length, label: "Message", interval: 1300, render: (i) => {
      morph(stage, seqDiagram({ lanes, msgs: r.msgs, current: i, tMax: r.tMax, laneGap: 125, margin: 62, rowH: 40, aria: `DNS lookup of ${state.name}` }));
      code.show(r.steps[i].line); vars.show(r.steps[i].vars);
      note.textContent = r.steps[i].note;
      note.className = `step-note${i === r.steps.length - 1 ? " good" : ""}`;
    } });
    dnsOut.replaceChildren(dPlayer.el, note, traceLayout(stage, code, vars),
      h("div", { class: "stats-row" }, stat("Messages", r.messages), stat("Round trips", fmt(r.time / 2, 1)), stat("Answer", r.ip, true)));
  }

  // --- HTTP ---
  const hmsg = h("div"), hOut = h("div");
  const hnum = (key, label, min, max, step = 1) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, step, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); http(); } }));
  const parBox = hnum("parallel", "Parallel connections", 1, 30);
  const dnsIn = h("input", { type: "text", class: "mono", value: state.dns, placeholder: "e.g. 20 30 50", "aria-label": "DNS round trips in ms", oninput: (e) => { state.dns = e.target.value; http(); } });
  function http() {
    hPlayer?.destroy(); hPlayer = null; save();
    parBox.hidden = state.hmode !== "np-parallel";
    let r, dnsList;
    try {
      dnsList = state.dns.trim() ? state.dns.trim().split(/[\s,+]+/).map((x) => { const v = Number(x); if (!(v >= 0)) throw new Error(`"${x}" isn't a DNS round-trip time in ms.`); return v; }) : [];
      r = httpTiming({ mode: state.hmode, objects: state.objects, rtt: state.rtt, tx: state.tx, parallel: state.parallel, dns: dnsList });
    } catch (e) { hmsg.replaceChildren(notice("error", e.message)); hOut.replaceChildren(); return; }
    hmsg.replaceChildren();
    const code = codePanel(HTTP_CODE), vars = varsPanel();
    const stage = h("div", { class: "timeline-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const rowH = Math.max(28, Math.min(80, 760 / Math.max(r.tMax, 1)));
    hPlayer = stepper({ count: r.steps.length, label: "Step", interval: 1000, render: (i) => {
      morph(stage, seqDiagram({ lanes: [{ id: "client", label: "Browser" }, { id: "server", label: "Web server" }], msgs: r.msgs, spans: r.spans, current: i, tMax: r.tMax, laneGap: 300, margin: 110, rowH, unit: " RTT", aria: `${HTTP_MODES[state.hmode].name}: ${fmt(r.total)} ms` }));
      code.show(r.steps[i].line); vars.show(r.steps[i].vars);
      note.textContent = r.steps[i].note;
      note.className = `step-note${r.steps[i].done ? " good" : ""}`;
    } });
    const dnsTotal = dnsList.reduce((a, b) => a + b, 0);
    const all = Object.entries(HTTP_MODES).map(([id, m]) => ({ id, name: m.name, f: totalFormula({ mode: id, objects: state.objects, rtt: state.rtt, tx: state.tx, parallel: state.parallel, dnsTotal }) }));
    const most = Math.max(...all.map((x) => x.f.ms), 1);
    hOut.replaceChildren(hPlayer.el, note, traceLayout(stage, code, vars),
      h("div", { class: "stats-row" }, stat("Total", `${fmt(r.total)} ms`), stat("In RTTs", fmt(r.total / state.rtt, 2)), stat("TCP connections", r.connections)),
      h("h3", { class: "sub" }, "Every option for this page"),
      h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
        h("thead", null, h("tr", null, ["Connection type", "Formula", "Time", ""].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", null, all.map((x) => h("tr", { class: x.id === state.hmode ? "hot" : null },
          h("th", { scope: "row" }, h("button", { type: "button", class: "linkish", onclick: () => { state.hmode = x.id; hModeSel.value = x.id; http(); } }, x.name)),
          h("td", { class: "left" }, x.f.text), h("td", null, `${fmt(x.f.ms)} ms`), h("td", { class: "spark" }, h("i", { style: `width:${(x.f.ms / most) * 100}%` }))))))));
  }
  const hModeSel = sel("hmode", "HTTP connection type", Object.entries(HTTP_MODES).map(([k, v]) => [k, v.name]), http);

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card" }, h("h2", null, "DNS lookup"),
      h("div", { class: "row" }, h("label", { class: "inline" }, "Look up ", nameIn), sel("dmode", "Query style", [["iterative", "Iterative"], ["recursive", "Recursive"]], dns),
        sel("cache", "Local DNS cache", [["none", "Cache empty"], ["tld", "TLD servers cached"], ["answer", "Answer cached"]], dns),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      dnsMsg, dnsOut),
    h("section", { class: "card" }, h("h2", null, "HTTP response time"),
      h("div", { class: "row" }, hModeSel, parBox),
      h("div", { class: "row" }, hnum("objects", "Referenced objects", 0, 30), hnum("rtt", "RTT (ms)", 1, 10000), hnum("tx", "Transmission per object (ms)", 0, 10000), h("label", { class: "inline" }, "DNS RTTs (ms) ", dnsIn)),
      hmsg, hOut));

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = Math.floor(r() * 3);
    let body;
    if (kind === 0) {
      const mode = Object.keys(HTTP_MODES)[Math.floor(r() * 4)], N = 2 + Math.floor(r() * 9), P = 2 + Math.floor(r() * 4), rtt = [10, 20, 50, 100][Math.floor(r() * 4)];
      const dns = Array.from({ length: Math.floor(r() * 3) }, () => [5, 10, 20, 30][Math.floor(r() * 4)]);
      const f = totalFormula({ mode, objects: N, rtt, parallel: P, dnsTotal: dns.reduce((a, b) => a + b, 0) });
      body = [h("h2", null, `A page references ${N} small objects. RTT to the server is ${rtt} ms${dns.length ? `, and finding its address takes ${dns.length} DNS round trip${dns.length > 1 ? "s" : ""} of ${dns.join(", ")} ms` : ""}. With ${HTTP_MODES[mode].name.toLowerCase()}${mode === "np-parallel" ? ` (up to ${P} at once)` : ""}, how many ms until the whole page has arrived? (Ignore transmission times.)`),
        numberQuestion(f.ms, `${f.text} = ${f.ms} ms.`)];
    } else if (kind === 1) {
      const cache = ["none", "tld", "answer"][Math.floor(r() * 3)], mode = r() < 0.5 ? "iterative" : "recursive";
      const res = dnsLookup({ mode, cache });
      body = [h("h2", null, `A ${mode} lookup of gaia.cs.umass.edu, with the local DNS server's cache ${cache === "none" ? "empty" : cache === "tld" ? "holding the .edu TLD servers" : "already holding the answer"}. How many DNS messages are sent in total (including the host's query and the reply)?`),
        numberQuestion(res.messages, `${res.msgs.map((m) => `${m.from} → ${m.to}`).join(", ")}.`)];
    } else {
      body = [h("h2", null, "In an iterative DNS lookup, what does the root server send back to the local DNS server?"),
        choice([{ label: "A referral to the TLD servers", correct: true }, { label: "The IP address of the host", correct: false }, { label: "A referral to the authoritative server", correct: false }, { label: "Nothing; it forwards the query to the TLD server", correct: false }].sort(() => r() - 0.5),
          "Root servers only know who runs each top-level domain, so they reply with the TLD servers' names (NS records) and addresses (glue). Forwarding the query is what happens in a recursive lookup.")];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  dns(); http();
  return () => { dPlayer?.destroy(); hPlayer?.destroy(); };
}
