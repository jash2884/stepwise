import { encapsulate, ETHERNET, MODELS, ROUTER_LAYERS, TRANSPORTS } from "../engines/osi.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, fmt, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, stat } from "./kit.js";

// A colour per layer, so a header keeps its colour from the stack to the PDU strip.
const LAYER_COLOUR = { app: 1, presentation: 5, session: 6, transport: 2, network: 3, link: 4, physical: 7, msg: 8 };
const colourOf = (layer) => `var(--series-${LAYER_COLOUR[layer] ?? ((Number(String(layer).slice(1)) % 7) + 1)})`;

// The three stacks: sender, router (layers 1 to 3 only) and receiver, with the
// unit being sent drawn as a token that glides from cell to cell.
function stacks(r, step, opts) {
  const rows = r.stack, generic = r.model === "generic";
  const RH = 40, GAP = 6, top = 30, CW = 170, W = 700;
  const X = { sender: 14, router: (W - CW) / 2, receiver: W - CW - 14 };
  const yOf = (i) => top + i * (RH + GAP);
  const H = yOf(rows.length) + 34;
  const header = (id) => {
    if (generic) return `+${opts.h} B`;
    const row = r.summary.rows.find((x) => x.layer === id && x.header != null);
    if (id === "physical") return opts.preamble ? `+${ETHERNET.preamble} B preamble` : "bits";
    if (id === "link") return `+${ETHERNET.header} B, +${ETHERNET.trailer} B FCS`;
    if (id === "presentation" || id === "session") return "no header";
    return row ? `+${row.header} B` : "";
  };
  const els = [];
  const label = (x, text) => h("text", { x: x + CW / 2, y: 18, "text-anchor": "middle", class: "osi-col" }, text);
  els.push(label(X.sender, "Sender"), label(X.receiver, "Receiver"));
  if (!generic) els.push(label(X.router, "Router"));
  const cell = (where, L, i) => {
    const on = step.at.where === where && step.at.layer === L.id;
    return h("g", { class: `osi-cell${on ? " on" : ""}${where === "router" ? " router" : ""}`, style: `--c:${colourOf(L.id)}` },
      h("rect", { x: X[where], y: yOf(i), width: CW, height: RH, rx: 8 }),
      h("text", { x: X[where] + 10, y: yOf(i) + 17, class: "osi-name" }, `${L.num} ${L.name}`),
      h("text", { x: X[where] + 10, y: yOf(i) + 32, class: "osi-hdr" }, where === "router" ? (L.id === "network" ? "reads IP, TTL − 1" : L.id === "link" ? "checks FCS, new frame" : "bits in, bits out") : header(L.id)));
  };
  rows.forEach((L, i) => { els.push(cell("sender", L, i), cell("receiver", L, i)); });
  if (!generic) rows.forEach((L, i) => { if (ROUTER_LAYERS.includes(L.id)) els.push(cell("router", L, i)); });
  // The path: down the sender, along the wire(s), up the receiver.
  const last = yOf(rows.length - 1) + RH / 2, bottom = yOf(rows.length - 1) + RH + 14;
  const wire = (x1, x2, on, text) => [
    h("line", { x1, x2, y1: last, y2: last, class: `osi-wire${on ? " on" : ""}` }),
    h("text", { x: (x1 + x2) / 2, y: bottom + 4, "text-anchor": "middle", class: "osi-col" }, text)];
  if (generic) els.push(wire(X.sender + CW, X.receiver, step.at.where === "wire1", "the wire"));
  else {
    els.push(wire(X.sender + CW, X.router, step.at.where === "wire1", `link 1 · MTU ${opts.mtu}`),
      wire(X.router + CW, X.receiver, step.at.where === "wire2", `link 2 · MTU ${opts.mtu2}`));
    const opened = yOf(rows.findIndex((L) => L.id === "network"));
    els.push(h("text", { x: X.router + CW / 2, y: opened - 8, "text-anchor": "middle", class: "osi-note" }, "opens layers 1 to 3 only"));
  }
  // The token.
  const i = Math.max(0, rows.findIndex((L) => L.id === step.at.layer));
  let tx, ty;
  if (step.at.where === "wire1") { tx = generic ? (X.sender + CW + X.receiver) / 2 : (X.sender + CW + X.router) / 2; ty = last; }
  else if (step.at.where === "wire2") { tx = (X.router + CW + X.receiver) / 2; ty = last; }
  else { tx = X[step.at.where] + CW - 34; ty = yOf(i) + RH / 2; }
  const pduName = step.at.where.startsWith("wire") ? "bits" : rows[i].pdu === "segment" && opts.transport === "udp" ? "datagram" : rows[i].pdu;
  els.push(h("g", { class: "osi-tok", "data-k": "t:pdu", "data-x": tx, "data-y": ty },
    h("rect", { x: tx - 30, y: ty - 11, width: 60, height: 22, rx: 11 }),
    h("text", { x: tx, y: ty + 4, "text-anchor": "middle" }, pduName)));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "osi-svg", role: "img", "aria-label": `Now at the ${step.at.where.startsWith("wire") ? "wire" : `${step.at.where}'s ${rows[i].name} layer`}` }, els);
}

// The unit as it is right now: headers in their layer colours, then the data.
function pduStrip(blocks) {
  return h("div", { class: "osi-pdu", role: "img", "aria-label": blocks.map((b) => `${b.label} ${b.bytes} bytes`).join(", ") },
    blocks.map((b) => h("div", { class: `osi-blk ${b.kind}`, style: `--c:${colourOf(b.layer)}${b.kind === "data" ? `;flex:1 1 ${Math.min(320, 40 + b.bytes / 6)}px` : ""}` },
      h("b", null, b.label), h("span", null, `${b.bytes} B`))));
}

const pct = (x) => `${(100 * x).toFixed(2)}%`;

export function render(root) {
  const p = readParams();
  const num = (k, d) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : d);
  const state = {
    model: MODELS[p.get("model")] ? p.get("model") : "tcpip",
    msg: num("m", 4000), app: num("a", 0), transport: TRANSPORTS[p.get("tp")] ? p.get("tp") : "tcp", ip: p.get("ip") === "6" ? 6 : 4,
    mtu: num("mtu", 1500), mtu2: num("mtu2", 1500), preamble: p.get("pre") === "1", n: num("n", 5), h: num("h", 20),
  };
  const head = page({
    subject: "Computer networks", title: "OSI and TCP/IP encapsulation",
    lede: "Send a message down the stack and watch each layer wrap it in a header, cross a router that opens only the bottom three layers, then come back up. Every byte of overhead is counted.",
    theory: h("div", null,
      h("p", null, "Each layer treats everything handed down from above as plain data and puts its own ", h("b", null, "header"), " in front (the data link layer adds a trailer too). The unit has a different name at each layer: ", h("b", null, "message"), " (application), ", h("b", null, "segment"), " (TCP) or ", h("b", null, "datagram"), " (UDP), ", h("b", null, "packet"), " (network), ", h("b", null, "frame"), " (data link) and ", h("b", null, "bits"), " (physical). The receiver peels the headers off in the opposite order, each layer reading only the header its peer wrote."),
      h("p", null, "The ", h("b", null, "OSI model"), " has seven layers; the internet's ", h("b", null, "TCP/IP model"), " folds presentation and session into the application, and is often taught with five layers (application, transport, network, data link, physical). A ", h("b", null, "router"), " works at layers 1 to 3: it strips the frame, reads the IP header to forward the packet, and builds a new frame for the next link. A switch stops at layer 2 and a hub at layer 1."),
      h("p", null, "The ", h("b", null, "MTU"), " is the largest packet a link can carry (1500 bytes on Ethernet). TCP keeps under it by cutting data into segments of at most ", h("b", null, "MSS = MTU − IP header − TCP header"), " bytes. UDP doesn't, so a big UDP datagram is fragmented by IP. Smaller packets mean more headers, so efficiency = message ÷ bytes on the wire drops as the MTU shrinks."),
      h("p", null, "The classic textbook version: with ", h("b", null, "n"), " layers each adding an ", h("b", null, "h"), "-byte header to an ", h("b", null, "M"), "-byte message, the share of bandwidth taken by headers is ", h("b", null, "n·h ÷ (M + n·h)"), ".")),
    conventions: [
      "TCP and IPv4 headers are 20 bytes, IPv6 is 40 and UDP 8, with no options.",
      "Ethernet adds a 14-byte header and a 4-byte FCS, and pads the payload to at least 46 bytes (so the smallest frame is 64 bytes). The 8-byte preamble is only counted if you tick it.",
      "MSS = MTU − IP header − TCP header, so TCP never needs IP fragmentation on the first link.",
      "IPv4 routers fragment packets too big for the next link (DF = 0). IPv6 routers never fragment: the sender uses the path MTU, the smallest on the route.",
      "The picture follows the first segment or fragment; the counts and totals cover all of them.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" });
  const field = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const select = (key, label, options, cast = String) => h("select", { "aria-label": label, onchange: (e) => { state[key] = cast(e.target.value); update(); } },
    options.map(([v, t]) => h("option", { value: v, selected: String(state[key]) === String(v) }, t)));
  const realBox = h("div", { class: "row" },
    select("transport", "Transport", Object.entries(TRANSPORTS).map(([k, t]) => [k, t.name])),
    select("ip", "IP version", [[4, "IPv4"], [6, "IPv6"]], Number),
    field("app", "App header", 0, 10000), field("mtu", "MTU link 1", 68, 65535), field("mtu2", "MTU link 2", 68, 65535),
    h("label", { class: "inline" }, h("input", { type: "checkbox", checked: state.preamble, onchange: (e) => { state.preamble = e.target.checked; update(); } }), " count the preamble"));
  const genericBox = h("div", { class: "row" }, field("n", "Layers (n)", 1, 10), field("h", "Header per layer (h)", 0, 1000));

  let player = null;
  function update() {
    player?.destroy(); player = null;
    const generic = state.model === "generic";
    realBox.hidden = generic; genericBox.hidden = !generic;
    writeParams(generic ? { model: state.model, m: state.msg, n: state.n, h: state.h }
      : { model: state.model, m: state.msg, a: state.app, tp: state.transport, ip: state.ip, mtu: state.mtu, mtu2: state.mtu2, ...(state.preamble ? { pre: 1 } : {}) });
    let r;
    try { r = encapsulate(state); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(r.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), strip = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: r.steps.length, label: "Step", interval: 1500, render: (i) => {
      const st = r.steps[i];
      morph(stage, stacks(r, st, state));
      strip.replaceChildren(h("p", { class: "muted small osi-cap" }, st.at.where.startsWith("wire") ? "On the wire:" : `What the ${st.at.where}'s ${r.stack.find((L) => L.id === st.at.layer).name.toLowerCase()} layer holds:`), pduStrip(st.pdu));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.done ? " good" : ""}`;
    } });
    const s = r.summary;
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Down, across and up, step by step"), player.el, note, traceLayout(h("div", null, stage, strip), code, vars)),
      generic ? genericSummary(s, state) : realSummary(s, state));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" },
        select("model", "Model", Object.entries(MODELS).map(([k, m]) => [k, m.name])),
        field("msg", "Message (bytes)", 1, 1000000),
        h("button", { type: "button", class: "btn ghost", onclick: () => {
          const r = Math.random;
          Object.assign(state, { msg: 200 + Math.floor(r() * 9000), app: [0, 0, 120, 300][Math.floor(r() * 4)], transport: r() < 0.7 ? "tcp" : "udp", mtu: [576, 1006, 1500, 1500][Math.floor(r() * 4)], mtu2: [576, 1006, 1500][Math.floor(r() * 3)], ip: 4 });
          rebuild();
        } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      realBox, genericBox, msg),
    out);
  // Inputs hold their own values, so rebuild the whole page after "Random".
  const rebuild = () => { writeParams({ model: state.model, m: state.msg, a: state.app, tp: state.transport, ip: state.ip, mtu: state.mtu, mtu2: state.mtu2 }); player?.destroy(); render(root); };

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["real", "real", "generic", "concept"][Math.floor(r() * 4)];
    const again = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    if (kind === "generic") {
      const M = [500, 800, 1000, 1200, 1500, 2000][Math.floor(r() * 6)], n = 3 + Math.floor(r() * 5), hh = [10, 16, 20, 24, 40][Math.floor(r() * 5)];
      const share = Math.round(10000 * (n * hh) / (M + n * hh)) / 100;
      const input = h("input", { type: "number", step: "0.01", "aria-label": "Header percentage", style: "max-width:140px" }), feedback = h("div");
      practice.replaceChildren(h("section", { class: "card" }, again,
        h("h2", null, `A stack of ${n} layers adds a ${hh}-byte header at every layer to a message of ${M} bytes.`),
        h("p", null, "What percentage of the bandwidth is taken by headers? Give two decimal places."),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
          const ok = input.value !== "" && Math.abs(Number(input.value) - share) <= 0.011;
          input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
          feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : `✗ Not quite: it's ${share.toFixed(2)}%.`} n·h ÷ (M + n·h) = ${n * hh} ÷ ${M + n * hh}.`));
        } }, "Check")), feedback));
      return;
    }
    if (kind === "concept") {
      const pool = [
        ["Which layers does a router process?", ["Layers 1 to 3", "Layers 1 and 2", "Layer 1 only", "All seven"], 0, "A router strips the frame and reads the IP header to forward the packet; it never reads the transport header."],
        ["Which layers does a learning switch process?", ["Layers 1 and 2", "Layers 1 to 3", "Layer 1 only", "Layers 1 to 4"], 0, "A switch forwards frames by MAC address, so it reads the data link header and no further."],
        ["Which header carries the port numbers?", ["Transport", "Network", "Data link", "Application"], 0, "TCP and UDP headers carry source and destination ports, which pick the process at each end."],
        ["Which header is replaced at every hop?", ["The data link frame", "The IP header", "The TCP header", "None of them"], 0, "The frame header holds MAC addresses for one link only, so each router builds a new frame. The IP addresses stay the same end to end."],
        ["Where is the TTL (hop limit)?", ["Network header", "Transport header", "Frame header", "Frame trailer"], 0, "It is in the IP header, and every router lowers it by one."],
        ["What does UDP do with a message bigger than the MTU?", ["Nothing: IP fragments the datagram", "Cuts it into segments", "Drops it", "Asks the sender to slow down"], 0, "UDP sends one datagram whatever its size; IP has to fragment it, and only the first fragment carries the UDP header."],
      ];
      const [q, opts, right, why] = pool[Math.floor(r() * pool.length)];
      const order = opts.map((o, i) => ({ label: o, correct: i === right, k: r() })).sort((a, b) => a.k - b.k);
      practice.replaceChildren(h("section", { class: "card" }, again, h("h2", null, q), choice(order, why)));
      return;
    }
    const tp = r() < 0.7 ? "tcp" : "udp", m = 500 + Math.floor(r() * 8000), mtu = [576, 1006, 1500][Math.floor(r() * 3)];
    const res = encapsulate({ msg: m, transport: tp, mtu });
    const unitsIn = h("input", { type: "number", "aria-label": tp === "tcp" ? "Segments" : "Fragments" }), bytesIn = h("input", { type: "number", "aria-label": "Bytes on the wire" }), ohIn = h("input", { type: "number", "aria-label": "Overhead bytes" });
    const units = tp === "tcp" ? res.summary.segments : res.summary.packets1.length;
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" }, again,
      h("h2", null, `A message of ${m} bytes goes over ${tp.toUpperCase()}, IPv4 and Ethernet with an MTU of ${mtu}.`),
      h("p", { class: "muted" }, "No options in any header; Ethernet adds 14 + 4 bytes per frame; don't count the preamble."),
      h("div", { class: "qa" },
        h("label", null, tp === "tcp" ? "How many TCP segments?" : "How many IP fragments?", unitsIn),
        h("label", null, "Total bytes in the Ethernet frames", bytesIn),
        h("label", null, "Overhead bytes (everything but the message)", ohIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const a = Number(unitsIn.value) === units, b = Number(bytesIn.value) === res.summary.bytes1, c = Number(ohIn.value) === res.summary.overhead;
        mark(unitsIn, a, units); mark(bytesIn, b, res.summary.bytes1); mark(ohIn, c, res.summary.overhead);
        feedback.replaceChildren(notice(a && b && c ? "good" : "info", a && b && c ? "All three right." : `${[a, b, c].filter(Boolean).length} / 3 right.`), h("ol", { class: "notes" }, res.steps.filter((s) => s.at.where === "sender" || s.done).map((s) => h("li", null, s.note))));
      } }, "Check")), feedback));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}

function realSummary(s, state) {
  const mtus = [...new Set([576, 1006, 1280, 1500, 4352, 9000, state.mtu])].filter((m) => m >= (state.ip === 6 ? 1280 : 68)).sort((a, b) => a - b);
  const sweep = mtus.map((m) => {
    try { return { m, r: encapsulate({ ...state, mtu: m, mtu2: m }).summary }; } catch { return null; }
  }).filter(Boolean);
  const show = (list) => `${list.slice(0, 10).join(", ")}${list.length > 10 ? `, … (${list.length} in all)` : ""}`;
  return h("section", { class: "card" }, h("h2", null, "Where the bytes go"),
    h("div", { class: "stats-row" },
      stat("Message", `${s.message} B`), stat(state.transport === "tcp" ? "Segments" : "Datagrams", s.segments),
      stat("Frames on link 1", s.frames1.length), stat("Bytes on link 1", s.bytes1), stat("Overhead", `${s.overhead} B`), stat("Efficiency", pct(s.efficiency))),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Layer", "Header per unit", "Units", "Bytes"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, s.rows.map((row) => h("tr", null, h("th", { scope: "row" }, h("span", { class: "swatch", style: `--c:${colourOf(row.layer)}` }), row.name), h("td", null, row.header ?? "varies"), h("td", null, row.units), h("td", null, row.bytes)))),
      h("tfoot", null, h("tr", null, h("th", { scope: "row", colspan: 3 }, "Total overhead"), h("td", null, s.overhead))))),
    h("p", { class: "muted small" }, `Packets on link 1: ${show(s.packets1)} bytes.${s.routerFrag ? ` On link 2, after the router fragments: ${show(s.packets2)} bytes, ${s.bytes2} bytes of frames.` : ""}${s.mss ? ` MSS = ${s.mss}.` : ""}`),
    h("h3", null, "The MTU effect"),
    h("p", { class: "muted small" }, "The same message with both links at each MTU. Smaller packets mean more headers."),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["MTU", state.transport === "tcp" ? "MSS" : "Fragments", "Frames", "Bytes on the wire", "Efficiency"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, sweep.map(({ m, r }) => h("tr", { class: m === state.mtu ? "current" : null }, h("th", { scope: "row" }, m),
        h("td", null, state.transport === "tcp" ? r.mss : r.packets1.length), h("td", null, r.frames1.length), h("td", null, r.bytes1), h("td", null, pct(r.efficiency))))))));
}

function genericSummary(s, state) {
  return h("section", { class: "card" }, h("h2", null, "Header share"),
    h("div", { class: "stats-row" }, stat("Message (M)", `${state.msg} B`), stat("Headers (n·h)", `${s.overhead} B`), stat("On the wire", `${s.bytes1} B`), stat("Headers share", pct(s.headerShare)), stat("Efficiency", pct(s.efficiency))),
    h("p", { class: "muted small" }, `n·h ÷ (M + n·h) = ${state.n} × ${state.h} ÷ (${state.msg} + ${state.n * state.h}) = ${fmt(s.headerShare, 4)}.`));
}
