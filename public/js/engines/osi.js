// Encapsulation: a message going down the sender's protocol stack, gaining a
// header at each layer, across one router (which opens layers 1 to 3 only)
// and back up the receiver's stack. Header sizes, the number of segments,
// packets and frames, and the total overhead are all computed, including what
// the MTU does: TCP cuts the data to fit (MSS), IPv4 fragments UDP datagrams
// and, at the router, anything too big for the next link.
//
// Conventions (stated in the UI):
// - TCP and IPv4 headers are 20 bytes and IPv6 40, with no options. UDP is 8.
// - Ethernet adds a 14-byte header and a 4-byte FCS; a frame's payload is padded
//   to at least 46 bytes. The 8-byte preamble is counted only if asked.
// - MSS = MTU − IP header − TCP header, so TCP never needs IP fragmentation.
// - IPv4 routers fragment (DF = 0, the textbook case). IPv6 routers never do:
//   the sender learns the path MTU first and sizes its packets for it.
// - "n layers, h bytes each" is the textbook model where every layer adds the
//   same header and there is no MTU.
import { fragment } from "./fragment.js";

export const MODELS = {
  tcpip: { name: "TCP/IP (five layers)" },
  osi: { name: "OSI (seven layers)" },
  generic: { name: "n layers, h bytes each" },
};
export const TRANSPORTS = { tcp: { name: "TCP", header: 20, pdu: "segment" }, udp: { name: "UDP", header: 8, pdu: "datagram" } };
export const ETHERNET = { header: 14, trailer: 4, minPayload: 46, preamble: 8 };
const IP_HEADER = { 4: 20, 6: 40 };
const IPV6_FRAG = 8;

export const LAYERS = {
  app: { name: "Application", osi: 7, pdu: "message" },
  presentation: { name: "Presentation", osi: 6, pdu: "data" },
  session: { name: "Session", osi: 5, pdu: "data" },
  transport: { name: "Transport", osi: 4, pdu: "segment" },
  network: { name: "Network", osi: 3, pdu: "packet" },
  link: { name: "Data link", osi: 2, pdu: "frame" },
  physical: { name: "Physical", osi: 1, pdu: "bits" },
};
export const ROUTER_LAYERS = ["network", "link", "physical"];

// Pseudocode, one list per model. `at` maps a step name to its line.
const REAL = (osi) => {
  const lines = [
    ["app", "sender: data ← app header + message  // application layer"],
    osi ? ["pres", "presentation, session: format and manage the dialogue  // no header here"] : null,
    ["transport", "transport: cut data into pieces ≤ MSS; add a TCP or UDP header"],
    ["network", "network: add an IP header; if packet > MTU then fragment"],
    ["link", "data link: add frame header and FCS; pad short frames"],
    ["physical", "physical: send the frame as bits on link 1"],
    ["rx", "router: take the bits, check FCS, strip the frame  // layers 1, 2"],
    ["route", "  read the IP header: TTL ← TTL − 1, pick the next hop  // layer 3"],
    ["refrag", "  if packet > MTU of link 2 then fragment (IPv4 only)"],
    ["reframe", "  wrap it in a new frame for link 2 and send"],
    ["up", "receiver: going up, each layer checks and strips its header"],
    ["reasm", "  IP joins fragments; TCP puts segments in order"],
    ["total", "overhead ← bytes on the wire − message bytes"],
  ].filter(Boolean);
  return { code: lines.map(([, t]) => t), at: Object.fromEntries(lines.map(([k], i) => [k, i + 1])) };
};
const GENERIC = {
  code: [
    "pdu ← message  // M bytes",
    "for each layer from the top (n) down to 1",
    "  pdu ← header + pdu  // h bytes more",
    "send pdu: M + n·h bytes",
    "for each layer from 1 up to n",
    "  strip that layer's header, pass the rest up",
    "header share ← n·h ÷ (M + n·h)",
  ],
  at: { start: 1, down: [2, 3], send: 4, up: [5, 6], total: 7 },
};
export const codeFor = (model) => (model === "generic" ? GENERIC : REAL(model === "osi")).code;

export function stackOf(model, n = 5) {
  if (model === "generic") return Array.from({ length: n }, (_, i) => ({ id: `L${n - i}`, name: `Layer ${n - i}`, osi: n - i, num: n - i, pdu: "data" }));
  const ids = model === "osi" ? Object.keys(LAYERS) : ["app", "transport", "network", "link", "physical"];
  // num: the layer's number in this model (the five-layer model counts 5 down to 1).
  return ids.map((id, i) => ({ id, ...LAYERS[id], num: ids.length - i }));
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
// Cut `total` bytes into pieces of at most `size`.
const chunks = (total, size) => Array.from({ length: Math.ceil(total / size) }, (_, i) => Math.min(size, total - i * size));
const frameOf = (packet, preamble) => {
  const pad = Math.max(0, ETHERNET.minPayload - packet);
  return { packet, pad, length: packet + pad + ETHERNET.header + ETHERNET.trailer + (preamble ? ETHERNET.preamble : 0) };
};
// The first `len` bytes of an ordered list of blocks.
function take(blocks, len) {
  const out = [];
  for (const b of blocks) {
    if (len <= 0) break;
    const n = Math.min(b.bytes, len);
    if (n > 0) out.push({ ...b, bytes: n });
    len -= n;
  }
  return out;
}
const block = (layer, label, bytes, kind = "hdr") => ({ layer, label, bytes, kind });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function check(v, name, lo, hi) {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be a whole number from ${lo} to ${hi.toLocaleString("en-GB")}.`);
}

export function encapsulate(opts = {}) {
  const o = { model: "tcpip", msg: 4000, app: 0, transport: "tcp", ip: 4, mtu: 1500, mtu2: null, preamble: false, n: 5, h: 20, ...opts };
  if (!MODELS[o.model]) throw new Error(`Unknown model "${o.model}".`);
  if (o.model === "generic") return generic(o);
  return real(o);
}

// --- n layers, h bytes each --------------------------------------------------------------

function generic({ msg, n, h }) {
  check(msg, "Message size", 1, 1_000_000);
  check(n, "Number of layers", 1, 10);
  check(h, "Header size", 0, 1000);
  const stack = stackOf("generic", n);
  const { code, at } = GENERIC;
  const steps = [];
  let pdu = [block("msg", "Message", msg, "data")];
  steps.push({ line: at.start, at: { where: "sender", layer: stack[0].id }, pdu, vars: { M: msg, n, h, "pdu size": msg },
    note: `The top layer has a message of ${msg} bytes to send. Each of the ${n} layers on the way down will put its own ${h}-byte header in front.` });
  stack.forEach((L, i) => {
    pdu = [block(L.id, `H${L.osi}`, h), ...pdu];
    const size = msg + (i + 1) * h;
    steps.push({ line: at.down, at: { where: "sender", layer: L.id }, pdu, vars: { layer: L.osi, h, "pdu size": size },
      note: `${L.name} adds its ${h}-byte header: the unit is now ${msg} + ${i + 1} × ${h} = ${size} bytes. The layer below treats all of it as data.` });
  });
  const total = msg + n * h;
  steps.push({ line: at.send, at: { where: "wire1", layer: stack.at(-1).id }, pdu, vars: { M: msg, "n·h": n * h, "on the wire": total },
    note: `${total} bytes go onto the wire: the ${msg}-byte message plus ${n} × ${h} = ${n * h} bytes of headers.` });
  [...stack].reverse().forEach((L, i) => {
    pdu = pdu.slice(1);
    steps.push({ line: at.up, at: { where: "receiver", layer: L.id }, pdu, vars: { layer: L.osi, "pdu size": total - (i + 1) * h },
      note: `${L.name} at the receiver reads and removes its peer's header, then passes the remaining ${total - (i + 1) * h} bytes up.` });
  });
  const share = total ? (n * h) / total : 0;
  steps.push({ line: at.total, at: { where: "receiver", layer: stack[0].id }, pdu, done: true, vars: { "n·h": n * h, "M + n·h": total, share },
    note: `Fraction of the bandwidth spent on headers = n·h ÷ (M + n·h) = ${n * h} ÷ ${total} = ${(share * 100).toFixed(2)}%. Useful data is the other ${(100 - share * 100).toFixed(2)}%.` });
  const rows = stack.map((L) => ({ layer: L.id, name: L.name, header: h, units: 1, bytes: h }));
  return { model: "generic", stack, code, steps,
    summary: { message: msg, bytes1: total, bytes2: total, overhead: n * h, efficiency: msg / total, headerShare: share, rows, segments: 1, packets1: [total], packets2: [total], frames1: [total], frames2: [total] } };
}

// --- Real protocol stacks -------------------------------------------------------------------

function real(o) {
  const { model, msg, app, transport, preamble } = o;
  const ip = Number(o.ip);
  if (!TRANSPORTS[transport]) throw new Error(`Unknown transport "${transport}".`);
  if (!IP_HEADER[ip]) throw new Error("IP version must be 4 or 6.");
  const mtu2 = o.mtu2 ?? o.mtu, minMtu = ip === 6 ? 1280 : 68;
  check(msg, "Message size", 1, 1_000_000);
  check(app, "Application header", 0, 10_000);
  check(o.mtu, "MTU of link 1", minMtu, 65_535);
  check(mtu2, "MTU of link 2", minMtu, 65_535);
  const T = TRANSPORTS[transport], tH = T.header, ipH = IP_HEADER[ip];
  const data = app + msg;
  if (transport === "udp" && data + tH > 65_535 - (ip === 4 ? ipH : 0)) throw new Error(`A UDP datagram holds at most ${(65_535 - tH - (ip === 4 ? ipH : 0)).toLocaleString("en-GB")} bytes of data over IPv${ip}. Use TCP for bigger messages.`);

  const stack = stackOf(model);
  const { code, at } = REAL(model === "osi");
  const ipv6Pmtu = ip === 6 && mtu2 < o.mtu;
  const pmtu = ipv6Pmtu ? mtu2 : o.mtu; // the size the sender plans for

  // Transport: TCP cuts to the MSS; UDP sends one datagram.
  const mss = transport === "tcp" ? pmtu - ipH - tH : null;
  const pieces = transport === "tcp" ? chunks(data, mss) : [data];
  const tpdus = pieces.map((p) => p + tH);

  // Network on link 1: TCP always fits; a big UDP datagram is fragmented by the sender.
  let packets1 = [], sourceFrag = false;
  for (const t of tpdus) {
    if (t + ipH <= pmtu) { packets1.push(t + ipH); continue; }
    sourceFrag = true;
    if (ip === 4) packets1.push(...fragment(t + ipH, pmtu, ipH).fragments.map((f) => f.length));
    else packets1.push(...chunks(t, Math.floor((pmtu - ipH - IPV6_FRAG) / 8) * 8).map((x) => x + ipH + IPV6_FRAG));
  }
  // The router: IPv4 fragments anything too big for link 2.
  const packets2 = [];
  let routerFrag = 0;
  for (const L of packets1) {
    if (L <= mtu2) { packets2.push(L); continue; }
    routerFrag++;
    packets2.push(...fragment(L, mtu2, ipH).fragments.map((f) => f.length));
  }
  const frames1 = packets1.map((p) => frameOf(p, preamble)), frames2 = packets2.map((p) => frameOf(p, preamble));
  const bytes1 = sum(frames1.map((f) => f.length)), bytes2 = sum(frames2.map((f) => f.length));
  const linkPer = ETHERNET.header + ETHERNET.trailer + (preamble ? ETHERNET.preamble : 0);
  const v6frag = ip === 6 && sourceFrag ? IPV6_FRAG : 0;
  const rows = [
    { layer: "app", name: "Application", header: app, units: 1, bytes: app },
    { layer: "transport", name: T.name, header: tH, units: tpdus.length, bytes: tH * tpdus.length },
    { layer: "network", name: `IPv${ip}`, header: ipH + v6frag, units: packets1.length, bytes: (ipH + v6frag) * packets1.length },
    { layer: "link", name: `Ethernet${preamble ? " + preamble" : ""}`, header: linkPer, units: frames1.length, bytes: linkPer * frames1.length },
  ];
  const padding = sum(frames1.map((f) => f.pad));
  if (padding) rows.push({ layer: "link", name: "Padding (short frames)", header: null, units: frames1.filter((f) => f.pad).length, bytes: padding });
  const overhead = bytes1 - msg;
  const summary = { message: msg, bytes1, bytes2, overhead, efficiency: msg / bytes1, headerShare: overhead / bytes1, rows, mss, pmtu,
    segments: tpdus.length, tpdus, packets1, packets2, frames1: frames1.map((f) => f.length), frames2: frames2.map((f) => f.length), sourceFrag, routerFrag, padding };

  // --- The first unit, block by block, for the picture --------------------------------
  const appBlocks = [...(app ? [block("app", "App header", app)] : []), block("msg", "Message", msg, "data")];
  const stream = [block("transport", T.name, tH), ...take(appBlocks, pieces[0])]; // the first transport PDU
  const packetBlocks = (len, extra = 0) => [block("network", `IPv${ip}${extra ? " + frag" : ""}`, ipH + extra), ...take(stream, len - ipH - extra)];
  const frameBlocks = (inner, f) => [
    ...(preamble ? [block("physical", "Preamble", ETHERNET.preamble)] : []),
    block("link", "Eth", ETHERNET.header), ...inner,
    ...(f.pad ? [block("link", "Pad", f.pad, "pad")] : []), block("link", "FCS", ETHERNET.trailer, "trl")];
  const p1 = packetBlocks(packets1[0], v6frag), p2 = packetBlocks(packets2[0], v6frag);
  const f1 = frameBlocks(p1, frames1[0]), f2 = frameBlocks(p2, frames2[0]);
  const stripPre = (b) => b.filter((x) => x.layer !== "physical");

  const steps = [];
  const unitWord = transport === "tcp" ? "segment" : "datagram";
  const push = (line, where, layer, pdu, vars, note, extra = {}) => steps.push({ line, at: { where, layer }, pdu, vars, note, ...extra });

  push(at.app, "sender", "app", appBlocks, { message: msg, "app header": app, data },
    app ? `The application has a message of ${msg} bytes and puts its own ${app}-byte header in front (think HTTP request headers): ${data} bytes go down to the next layer.`
      : `The application hands a message of ${msg} bytes to the layer below. (Set an application header to model something like HTTP headers.)`);
  if (model === "osi") {
    push(at.pres, "sender", "presentation", appBlocks, { data }, "Presentation would translate, compress or encrypt the data. On the internet that work happens inside the application (TLS, for example), so no separate header is added here.");
    push(at.pres, "sender", "session", appBlocks, { data }, "Session would open, checkpoint and close the dialogue. Again the internet has no separate session header: TCP connections and the application cover it.");
  }
  if (transport === "tcp") {
    push(at.transport, "sender", "transport", stream, { MTU: pmtu, MSS: mss, data, segments: tpdus.length, "TCP header": tH },
      `${ipv6Pmtu ? `IPv6 routers never fragment, so the sender first learns the path MTU: the smaller of ${o.mtu} and ${mtu2}, which is ${pmtu}. ` : ""}TCP sizes segments so each IP packet fits the MTU: MSS = ${pmtu} − ${ipH} (IP) − ${tH} (TCP) = ${mss} bytes. ${data} bytes of data need ⌈${data} ÷ ${mss}⌉ = ${plural(tpdus.length, "segment")}${tpdus.length > 1 ? ` (${pieces.slice(0, 3).join(", ")}${pieces.length > 3 ? ", …" : ""} bytes)` : ""}, each with its own ${tH}-byte header. Shown: segment 1, ${tpdus[0]} bytes.`);
  } else {
    push(at.transport, "sender", "transport", stream, { data, "UDP header": tH, datagram: tpdus[0] },
      `UDP doesn't cut the data up: it adds an ${tH}-byte header to make one ${tpdus[0]}-byte datagram, whatever its size. If that's too big for the link, IP has to deal with it.`);
  }
  if (sourceFrag) {
    push(at.network, "sender", "network", p1, { "IP header": ipH + v6frag, MTU: pmtu, packet: tpdus[0] + ipH, fragments: packets1.length },
      ip === 4 ? `With a ${ipH}-byte IP header the packet would be ${tpdus[0] + ipH} bytes, more than the MTU of ${pmtu}. The sender's IP layer fragments it: ${packets1.length} fragments of ${packets1.slice(0, 3).join(", ")}${packets1.length > 3 ? ", …" : ""} bytes, each with its own IP header. Only the first carries the UDP header.`
        : `The packet would be ${tpdus[0] + ipH} bytes, more than the path MTU of ${pmtu}. In IPv6 only the sender may fragment: each fragment gets the 40-byte header plus an 8-byte fragment header, giving ${packets1.length} fragments of ${packets1.slice(0, 3).join(", ")}${packets1.length > 3 ? ", …" : ""} bytes.`);
  } else {
    push(at.network, "sender", "network", p1, { "IP header": ipH, MTU: pmtu, packets: packets1.length, "packet 1": packets1[0] },
      `IP adds a ${ipH}-byte IPv${ip} header with the source and destination addresses${ip === 4 ? ", TTL and a header checksum" : " and hop limit (no checksum in IPv6)"}. Packet 1 is ${tpdus[0]} + ${ipH} = ${packets1[0]} bytes, within the MTU of ${pmtu}, so nothing is fragmented.`);
  }
  push(at.link, "sender", "link", stripPre(f1), { "frame header": ETHERNET.header, FCS: ETHERNET.trailer, pad: frames1[0].pad, frames: frames1.length, "frame 1": frames1[0].length - (preamble ? ETHERNET.preamble : 0) },
    `Ethernet wraps each packet in a frame: a ${ETHERNET.header}-byte header (destination MAC, source MAC, type) and a ${ETHERNET.trailer}-byte FCS (a CRC over the frame).${frames1[0].pad ? ` The packet is only ${packets1[0]} bytes, under Ethernet's 46-byte minimum payload, so ${frames1[0].pad} bytes of padding are added: the frame is the 64-byte minimum.` : ""} The MAC addresses are for this link only: the sender to the router.`);
  push(at.physical, "wire1", "physical", f1, { frames: frames1.length, "bytes on link 1": bytes1, preamble: preamble ? ETHERNET.preamble : 0 },
    `The physical layer turns ${plural(frames1.length, "frame")} into signals: ${bytes1} bytes in all on link 1${preamble ? `, counting an ${ETHERNET.preamble}-byte preamble per frame` : ""}. It adds no header of its own${preamble ? " apart from the preamble that lets the receiver lock on" : " (the 8-byte preamble is sent too, but isn't counted unless you tick it)"}.`);
  push(at.rx, "router", "link", p1, { FCS: "ok", "frame stripped": ETHERNET.header + ETHERNET.trailer + frames1[0].pad },
    "The router receives the bits (layer 1) and checks the FCS (layer 2): a damaged frame would be dropped here. Then it throws the frame header and trailer away. They only mattered on link 1.");
  push(at.route, "router", "network", p1, { layers: "1, 2, 3", [ip === 4 ? "TTL" : "hop limit"]: "64 → 63" },
    `At layer 3 the router reads the destination IP address and looks it up in its forwarding table (longest prefix match), and lowers the ${ip === 4 ? "TTL, which means recomputing the header checksum" : "hop limit"}. It never looks above the IP header: the ${T.name} header and the data pass through untouched. A router opens layers 1, 2 and 3 only.`);
  if (routerFrag) {
    push(at.refrag, "router", "network", p2, { "MTU 2": mtu2, "packet 1": packets1[0], "fragments on link 2": packets2.length },
      `Link 2 has a smaller MTU of ${mtu2}. ${plural(routerFrag, "packet")} won't fit, so the router fragments ${routerFrag === 1 ? "it" : "them"} (IPv4 with DF = 0): each piece gets a copy of the ${ipH}-byte header and carries a multiple of 8 data bytes. Link 2 carries ${plural(packets2.length, "packet")} where link 1 carried ${packets1.length}.`);
  } else {
    push(at.refrag, "router", "network", p2, { "MTU 2": mtu2, "largest packet": Math.max(...packets1) },
      `Every packet (the largest is ${Math.max(...packets1)} bytes) fits link 2's MTU of ${mtu2}, so the router forwards them unchanged.${ipv6Pmtu ? " That's thanks to path MTU discovery: the sender already sized them for link 2." : ""}`);
  }
  push(at.reframe, "wire2", "physical", f2, { frames: frames2.length, "bytes on link 2": bytes2 },
    `The router builds a new frame for link 2, with its own MAC address as the source and the receiver's (found with ARP) as the destination, and a fresh FCS. ${bytes2} bytes go out on link 2${bytes2 !== bytes1 ? ` (link 1 carried ${bytes1})` : ""}.`);
  push(at.up, "receiver", "link", p2, { FCS: "ok" }, "The receiver's physical layer turns signals back into bits; the data link layer checks the FCS, sees its own MAC address as the destination and strips the frame.");
  const reasmIp = packets2.length > tpdus.length;
  push(at.reasm, "receiver", "network", stream, { packets: packets2.length, [`${unitWord}s`]: tpdus.length },
    `IP checks the destination address, strips its header and reads the protocol field to know the payload is ${T.name}.${reasmIp ? ` The ${packets2.length} pieces are fragments, so IP holds them until all have arrived and joins them back into ${plural(tpdus.length, unitWord)} using the identification field and offsets.` : ""}`);
  push(at.reasm, "receiver", "transport", appBlocks, { [`${unitWord}s`]: tpdus.length, data },
    transport === "tcp" ? `TCP strips its header from each of the ${plural(tpdus.length, "segment")}, uses the sequence numbers to put the bytes back in order (asking again for anything missing), acknowledges them and delivers ${data} bytes to the application through its port.`
      : `UDP checks its checksum, strips its 8-byte header and delivers the ${data} bytes to the application listening on the destination port. No ordering, no retransmission.`);
  if (model === "osi") {
    push(at.up, "receiver", "session", appBlocks, { data }, "Session and presentation pass the data up unchanged: there was no header to remove.");
  }
  push(at.up, "receiver", "app", [block("msg", "Message", msg, "data")], { message: msg },
    `The application ${app ? `reads and removes its ${app}-byte header and ` : ""}has the original ${msg}-byte message, exactly as it was sent.`);
  push(at.total, "receiver", "app", [block("msg", "Message", msg, "data")],
    { "on link 1": bytes1, message: msg, overhead, efficiency: msg / bytes1 },
    `To deliver ${msg} bytes, link 1 carried ${bytes1}: ${overhead} bytes of overhead (${rows.filter((r) => r.bytes).map((r) => `${r.name} ${r.bytes}`).join(", ")}). Efficiency = ${msg} ÷ ${bytes1} = ${(100 * msg / bytes1).toFixed(2)}%.`,
    { done: true });

  return { model, stack, code, steps, summary };
}

// The textbook one-liner: what fraction of the bandwidth is headers.
export const headerShare = (msg, n, h) => (n * h) / (msg + n * h);
