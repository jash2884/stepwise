// AI tool schemas: computer networks. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { analyse, vlsm, dotted, parseAddress, parseMask } from "../../engines/subnet.js";
import { simulate as slide, parseLosses, PROTOCOLS, efficiency, minSeqBits } from "../../engines/sliding.js";
import { parseNetwork, dijkstra, distanceVector, flood, EXAMPLES } from "../../engines/routing.js";
import { simulate as cwndSim, parseEvents, handshake, VARIANTS } from "../../engines/congestion.js";
import { crc, hammingEncode, hammingCheck, checksum } from "../../engines/errors.js";
import { fragment } from "../../engines/fragment.js";
import { lookup, parseTable, parsePrefixes, summarise, show as showPrefix } from "../../engines/cidr.js";
import { aloha, csmacd, csmaca, parseStations, minFrame, throughput, peak } from "../../engines/mac.js";
import { leakyBucket, tokenBucket, parseArrivals, burst } from "../../engines/shaping.js";
import { dnsLookup, httpTiming, HTTP_MODES } from "../../engines/dnshttp.js";
import { encapsulate, MODELS, TRANSPORTS } from "../../engines/osi.js";

const inf = (x) => (x === Infinity ? "inf" : x);
const key = (s) => String(s).trim().replace(/\s+/g, "_");
// True when any of the calculator params differs from its default: those links open at #calc.
const usesCalc = (schema, v, keys) => keys.some((k) => v[k] !== schema.params[k].default);

// subnet.js: "a.b.c.d/p" or "a.b.c.d 255.255.255.192".
function parseInput(text) {
  const parts = String(text).trim().split(/\s+/);
  const a = parseAddress(parts[0]);
  const prefix = parts[1] ? parseMask(parts[1]) : a.prefix;
  if (prefix === null) throw new Error("Add a prefix (/26) or a mask (255.255.255.192) to the address.");
  return { ip: a.ip, prefix };
}

const SLIDING_CALC = ["ebw", "esize", "etp", "ew"];
const MAC_CALC = ["fbw", "fd", "fv"];
const SHAPING_CALC = ["bc", "brho", "bm"];

const sliding = tool("sliding-window", {
  keywords: "stop and wait go back n gbn selective repeat sr arq window size sequence number bits link utilisation efficiency throughput propagation delay transmission time bandwidth delay product retransmissions timeout ack lost frame",
  params: {
    p: { type: "enum", values: Object.keys(PROTOCOLS), default: "gbn", desc: "simulation protocol: sw (stop-and-wait), gbn (Go-Back-N), sr (Selective Repeat)" },
    n: { type: "int", min: 1, max: 16, default: 6, desc: "simulation: number of frames to send, numbered from 0" },
    w: { type: "int", min: 1, max: 8, default: 4, desc: "simulation: window size (ignored by sw)" },
    d: { type: "int", min: 1, max: 4, default: 1, desc: "simulation: one-way delay in ticks" },
    to: { type: "int", min: 2, max: 30, desc: "simulation: timeout in ticks (default 2d + 2; at least 2d)" },
    loss: { type: "string", format: 'F3 loses frame 3\'s first transmission, F3#2 its second, A2 the first ACK 2; separated by spaces; "" for no specific losses', default: "F2", allowEmpty: true, desc: "simulation: lost transmissions (pass \"\" for none, otherwise frame 2 is lost)" },
    k: { type: "int", min: 0, max: 20, default: 0, desc: "simulation: lose every kth frame transmission, counting retransmissions (0 = off)" },
    ebw: { type: "number", min: 0.000001, max: 1e6, default: 1, desc: "calculator: bandwidth in Mbps" },
    esize: { type: "number", min: 1, max: 1e9, default: 1000, desc: "calculator: frame size in bits" },
    etp: { type: "number", min: 0.000001, max: 1e6, default: 5, desc: "calculator: one-way propagation delay in ms" },
    ew: { type: "int", min: 1, max: 1000, default: 7, desc: "calculator: window size in frames (also used for the sequence number bits)" },
  },
  answers: {
    framesSent: "simulation: frame transmissions including retransmissions", retransmissions: "simulation: retransmissions", acksSent: "simulation: ACKs sent", finishTick: "simulation: tick the transfer completes",
    Tt: "calculator: transmission time in ms", a: "calculator: a = Tp / Tt", utilSW: "calculator: stop-and-wait utilisation in percent", utilW: "calculator: utilisation in percent with window ew",
    throughputMbps: "calculator: throughput with window ew in Mbps", optimalWindow: "calculator: smallest window for 100% utilisation (1 + 2a rounded up)",
    gbnBits: "minimum sequence number bits for Go-Back-N with window ew", srBits: "minimum sequence number bits for Selective Repeat with window ew",
  },
  hash: (v) => (usesCalc(sliding, v, SLIDING_CALC) ? "calc" : undefined),
  examples: [
    { request: "1 Mbps link, 1000-bit frames, propagation delay 20 ms, window of 7 frames: what is the link utilisation?", params: { ebw: 1, esize: 1000, etp: 20, ew: 7 } },
    { request: "Go-Back-N with window 3 sending 8 frames where every 4th transmission is lost: how many transmissions?", params: { p: "gbn", n: 8, w: 3, loss: "", k: 4 } },
  ],
  validate(v) {
    const sim = slide({ protocol: v.p, frames: v.n, window: v.w, delay: v.d, timeout: v.to ?? null, losses: parseLosses(v.loss), everyKth: v.k });
    const prop = v.etp / 1000, bw = v.ebw * 1e6;
    const sw = efficiency({ bandwidth: bw, frameBits: v.esize, propagation: prop });
    const sl = efficiency({ bandwidth: bw, frameBits: v.esize, propagation: prop, window: v.ew });
    const values = {
      framesSent: sim.framesSent, retransmissions: sim.retransmissions, acksSent: sim.acksSent, finishTick: sim.done,
      Tt: round(sw.Tt * 1000, 6), a: round(sw.a), utilSW: round(sw.utilisation * 100), utilW: round(sl.utilisation * 100),
      throughputMbps: round(sl.throughput / 1e6, 6), optimalWindow: sw.optimalWindow, gbnBits: minSeqBits(v.ew, "gbn"), srBits: minSeqBits(v.ew, "sr"),
    };
    const text = usesCalc(sliding, v, SLIDING_CALC)
      ? `Tt = ${values.Tt} ms and a = ${values.a}, so utilisation is ${values.utilSW}% for stop-and-wait and ${values.utilW}% with a window of ${v.ew}; window ${v.ew} needs ${values.gbnBits} sequence bits for Go-Back-N and ${values.srBits} for Selective Repeat.`
      : `${PROTOCOLS[v.p].name} sends ${sim.framesSent} frame transmissions (${sim.retransmissions} retransmissions) and finishes at tick ${sim.done}.`;
    return { text, values };
  },
});

const mac = tool("mac-protocols", {
  keywords: "pure aloha slotted aloha throughput offered load G e^-2G e^-G 18.4% 36.8% csma cd collision detection binary exponential backoff minimum frame size slot time ethernet csma ca rts cts hidden terminal wifi 802.11 nav",
  params: {
    m: { type: "enum", values: ["aloha", "csmacd", "csmaca"], default: "aloha", desc: "which protocol: aloha, csmacd (also holds the minimum frame size calculator), csmaca" },
    a: { type: "enum", values: ["slotted", "pure"], default: "slotted", desc: "aloha: pure or slotted" },
    G: { type: "number", min: 0, max: 26, default: 1, desc: "aloha: offered load G, frames per frame time (at most n)" },
    n: { type: "int", min: 1, max: 26, default: 5, desc: "aloha: stations in the simulation" },
    t: { type: "int", min: 1, max: 2000, default: 14, desc: "aloha: frame times to simulate" },
    s: { type: "int", min: 0, max: 100000, default: 1, desc: "random seed for the simulations" },
    st: { type: "string", format: "name and the slot its frame is ready, comma-separated, at most 6 stations", default: "A 0, B 0, C 3", desc: "csmacd: stations" },
    f: { type: "int", min: 1, max: 8, default: 3, desc: "csmacd: frame length in slots" },
    ba: { type: "int", min: 0, max: 7, default: 3, desc: "csmaca: station A's backoff counter" },
    bc: { type: "int", min: 0, max: 7, default: 5, desc: "csmaca: station C's backoff counter" },
    rts: { type: "bool", default: true, desc: "csmaca: use RTS/CTS" },
    fbw: { type: "number", min: 0.000001, max: 1e6, default: 10, desc: "minimum frame calculator (m = csmacd): bandwidth in Mbps" },
    fd: { type: "number", min: 0.000001, max: 1e9, default: 2500, desc: "minimum frame calculator (m = csmacd): cable length in metres" },
    fv: { type: "number", min: 1, max: 3e8, default: 2e8, desc: "minimum frame calculator (m = csmacd): signal speed in m/s" },
  },
  answers: {
    S: "aloha: throughput S at load G (successful frames per frame time)", Spercent: "aloha: S as a percentage", peakS: "aloha: maximum throughput of the chosen variant", peakG: "aloha: load G giving the maximum",
    simSuccesses: "aloha: frames through in the simulation", collisions: "csmacd: collisions in the simulation", slots: "csmacd: slots until every frame is sent", endSlot: "csmaca: slot when all frames are delivered",
    minFrameBits: "minimum CSMA/CD frame size in bits (2 x Tp x bandwidth)", minFrameBytes: "minimum frame size in bytes", tpMicros: "one-way propagation delay in microseconds", slotMicros: "slot time (round trip) in microseconds",
  },
  hash: (v) => (usesCalc(mac, v, MAC_CALC) ? "calc" : undefined),
  examples: [
    { request: "Pure ALOHA with offered load G = 0.5: what is the throughput?", params: { m: "aloha", a: "pure", G: 0.5 } },
    { request: "CSMA/CD at 100 Mbps over 1 km of cable with signal speed 2 x 10^8 m/s: minimum frame size?", params: { m: "csmacd", fbw: 100, fd: 1000, fv: 2e8 } },
  ],
  validate(v) {
    const calc = usesCalc(mac, v, MAC_CALC);
    if (calc && v.m !== "csmacd") throw new Error("The minimum frame size calculator is on the CSMA/CD page: set m to csmacd.");
    const f = minFrame({ bandwidth: v.fbw * 1e6, distance: v.fd, speed: v.fv });
    const values = { minFrameBits: round(f.bits), minFrameBytes: round(f.bytes), tpMicros: round(f.tp * 1e6), slotMicros: round(f.slot * 1e6) };
    if (v.m === "aloha") {
      const sim = aloha({ mode: v.a, stations: v.n, G: v.G, slots: v.t, seed: v.s });
      const S = throughput(v.G, v.a), pk = peak(v.a);
      Object.assign(values, { S: round(S), Spercent: round(S * 100), peakS: round(pk.S), peakG: pk.G, simSuccesses: sim.successes });
      return { text: `${v.a === "pure" ? "Pure" : "Slotted"} ALOHA at G = ${v.G}: S = ${values.S} (${round(S * 100, 2)}%); the peak is ${round(pk.S * 100, 2)}% at G = ${pk.G}.`, values };
    }
    if (v.m === "csmacd") {
      const r = csmacd({ stations: parseStations(v.st), frameSlots: v.f, seed: v.s });
      Object.assign(values, { collisions: r.collisions, slots: r.slots });
      return { text: calc ? `Tp = ${values.tpMicros} microseconds, so the minimum frame is 2 x Tp x bandwidth = ${values.minFrameBits} bits = ${values.minFrameBytes} bytes.` : `CSMA/CD: ${r.collisions} collisions, all frames sent after ${r.slots} slots.`, values };
    }
    const r = csmaca({ backoffs: { A: v.ba, C: v.bc }, rtscts: v.rts, seed: v.s });
    values.endSlot = r.end;
    return { text: `CSMA/CA${v.rts ? " with RTS/CTS" : ""}: every frame is delivered by slot ${r.end}.`, values };
  },
});

const shaping = tool("traffic-shaping", {
  keywords: "leaky bucket token bucket traffic shaping policing burst rate tokens bucket size capacity dropped packets maximum burst length C/(M-rho) token rate output rate",
  params: {
    k: { type: "enum", values: ["leaky", "token"], default: "leaky", desc: "leaky bucket or token bucket" },
    in: { type: "string", format: "packets arriving in each tick (0 to 99), separated by spaces, at most 40 ticks", default: "5 0 0 8 0 1 0 0 6 0 0 0", desc: "arrivals per tick" },
    b: { type: "int", min: 1, max: 60, default: 6, desc: "bucket size: packets (leaky) or tokens (token, full at tick 0)" },
    r: { type: "int", min: 1, max: 20, default: 2, desc: "packets leaked per tick (leaky) or tokens added per tick (token)" },
    mode: { type: "enum", values: ["shape", "police"], default: "shape", desc: "token bucket: shape (queue packets without tokens) or police (drop them)" },
    q: { type: "int", min: 0, max: 100, default: 8, desc: "token bucket shaper: queue size in packets" },
    bc: { type: "number", min: 0.000001, max: 1e9, default: 250, desc: "burst calculator: bucket capacity C in KB (10^3 bytes)" },
    brho: { type: "number", min: 0.000001, max: 1e6, default: 2, desc: "burst calculator: token rate rho in MB/s (10^6 bytes/s)" },
    bm: { type: "number", min: 0.000001, max: 1e6, default: 25, desc: "burst calculator: maximum output rate M in MB/s, more than rho" },
  },
  answers: { sent: "packets sent", dropped: "packets dropped", arrived: "packets that arrived", ticks: "ticks until the bucket drains", burstMs: "calculator: burst length S = C / (M - rho) in ms", burstKB: "calculator: data sent in the burst, M x S, in KB", tokensKB: "calculator: tokens used C + rho x S in KB" },
  hash: (v) => (usesCalc(shaping, v, SHAPING_CALC) ? "calc" : undefined),
  examples: [
    { request: "Token bucket of 500 KB filling at 2 MB/s, max output 10 MB/s: how long can it burst at full speed?", params: { bc: 500, brho: 2, bm: 10 } },
    { request: "Leaky bucket holding 4 packets, leaking 1 per tick; arrivals 3 2 0 5 1 0: how many are dropped?", params: { k: "leaky", in: "3 2 0 5 1 0", b: 4, r: 1 } },
  ],
  validate(v) {
    const arrivals = parseArrivals(v.in);
    const r = v.k === "leaky" ? leakyBucket({ arrivals, capacity: v.b, rate: v.r }) : tokenBucket({ arrivals, capacity: v.b, rate: v.r, mode: v.mode, queueSize: v.q });
    const bu = burst({ C: v.bc * 1e3, M: v.bm * 1e6, rho: v.brho * 1e6 });
    const values = { sent: r.sent, dropped: r.dropped, arrived: r.arrived, ticks: r.steps.length, burstMs: round(bu.S * 1000), burstKB: round(bu.bytes / 1e3), tokensKB: round(bu.tokensUsed / 1e3) };
    const text = usesCalc(shaping, v, SHAPING_CALC)
      ? `The burst lasts S = C / (M - rho) = ${values.burstMs} ms, sending ${values.burstKB} KB at the full rate.`
      : `${v.k === "leaky" ? "Leaky bucket" : `Token bucket ${v.mode === "shape" ? "shaper" : "policer"}`}: ${r.arrived} packets arrive, ${r.sent} are sent and ${r.dropped} dropped.`;
    return { text, values };
  },
});

export const SCHEMAS = [
  tool("subnetting", {
    keywords: "subnet mask network address broadcast address host range first last usable hosts cidr prefix vlsm variable length subnet masking ipv4 address class wildcard",
    params: {
      mode: { type: "enum", values: ["address", "vlsm"], default: "address", desc: "address: analyse one address; vlsm: plan subnets in a block" },
      a: { type: "string", format: "a.b.c.d/prefix or a.b.c.d followed by a dotted mask", default: "192.168.10.77/26", desc: "address mode: the address and its prefix or mask" },
      base: { type: "string", format: "a.b.c.d/prefix", default: "192.168.1.0/24", desc: "vlsm mode: the block to divide" },
      needs: { type: "string", format: "name and hosts needed, comma-separated, e.g. Sales 100, Lab 20 (at most 12)", default: "Sales 100, Office 50, Lab 20, Link 2", desc: "vlsm mode: subnets and their host counts" },
    },
    answers: {
      network: "network address", broadcast: "broadcast address", mask: "subnet mask", first: "first usable host", last: "last usable host", usable: "number of usable hosts", total: "addresses in the block", prefix: "prefix length", wildcard: "wildcard mask", class: "address class",
      "block.Sales": "vlsm: block allocated to a subnet (one key per name, spaces as _)", "first.Sales": "vlsm: first usable host of that subnet", "last.Sales": "vlsm: last usable host", "broadcast.Sales": "vlsm: broadcast address", used: "vlsm: addresses allocated in all", free: "vlsm: addresses left over",
    },
    examples: [
      { request: "What is the broadcast address and number of hosts for 172.16.45.14/20?", params: { mode: "address", a: "172.16.45.14/20" } },
      { request: "Divide 10.0.0.0/24 with VLSM for Sales 60, HR 25, Lab 10", params: { mode: "vlsm", base: "10.0.0.0/24", needs: "Sales 60, HR 25, Lab 10" } },
    ],
    validate(v) {
      if (v.mode === "address") {
        const { ip, prefix } = parseInput(v.a);
        const r = analyse(ip, prefix);
        const values = { network: dotted(r.network), broadcast: r.prefix >= 31 ? "none" : dotted(r.broadcast), mask: dotted(r.mask), first: dotted(r.first), last: dotted(r.last), usable: r.usable, total: r.total, prefix: r.prefix, wildcard: dotted(r.wildcard), class: r.cls };
        return { text: `${dotted(ip)}/${prefix}: mask ${values.mask}, network ${values.network}, broadcast ${values.broadcast}, hosts ${values.first} to ${values.last} (${r.usable} usable).`, values };
      }
      const { ip, prefix } = parseInput(v.base);
      const needs = v.needs.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x, i) => {
        const m = /^(.*?)\s*[:=]?\s*(\d+)$/.exec(x);
        if (!m) throw new Error(`Can't read "${x}" in needs. Write it like "Sales 100".`);
        return { name: m[1] || `Subnet ${i + 1}`, hosts: Number(m[2]) };
      });
      if (!needs.length) throw new Error("List at least one subnet in needs, e.g. Sales 100.");
      if (needs.length > 12) throw new Error("Plan at most 12 subnets at a time.");
      const r = vlsm(ip, prefix, needs);
      const values = { used: r.used, free: r.total - r.used };
      for (const x of r.rows) {
        const k = key(x.name);
        if (x.failed) { values[`block.${k}`] = "does not fit"; continue; }
        values[`block.${k}`] = `${dotted(x.network)}/${x.prefix}`;
        values[`first.${k}`] = dotted(x.first); values[`last.${k}`] = dotted(x.last); values[`broadcast.${k}`] = dotted(x.broadcast);
      }
      return { text: `VLSM in ${dotted(ip)}/${prefix}: ${r.rows.map((x) => `${x.name} ${x.failed ? "does not fit" : `${dotted(x.network)}/${x.prefix}`}`).join(", ")}.`, values };
    },
  }),

  tool("cidr-and-longest-prefix-match", {
    keywords: "longest prefix match forwarding table router interface next hop route aggregation summarisation supernet supernetting classless inter-domain routing",
    params: {
      t: { type: "string", format: 'entries "prefix interface" joined by ";", e.g. 200.23.16.0/21 0;default 3 (at most 12)', default: "200.23.16.0/21 0;200.23.24.0/24 1;200.23.24.0/21 2;default 3", desc: "forwarding table" },
      a: { type: "string", format: "a.b.c.d", default: "200.23.24.170", desc: "destination address to look up" },
      s: { type: "string", format: "prefixes a.b.c.d/len separated by spaces, at most 32", default: "200.23.16.0/23 200.23.18.0/23 200.23.20.0/23 200.23.22.0/23 200.23.24.0/23 200.23.26.0/23 200.23.28.0/23 200.23.30.0/23", desc: "prefixes to summarise" },
    },
    answers: { iface: "interface the packet is forwarded on (drop if none matches)", bestPrefix: "longest matching prefix", matches: "number of matching entries", supernet: "smallest single prefix covering every listed prefix", summary: "minimal list of prefixes after merging", exact: "true if the supernet covers exactly the listed addresses" },
    examples: [
      { request: "Forwarding table 131.16.0.0/16 A, 131.16.128.0/17 B, 131.16.192.0/18 C, default D: where does 131.16.200.5 go?", params: { t: "131.16.0.0/16 A;131.16.128.0/17 B;131.16.192.0/18 C;default D", a: "131.16.200.5" } },
      { request: "Summarise 192.168.4.0/24, 192.168.5.0/24, 192.168.6.0/24 and 192.168.7.0/24", params: { s: "192.168.4.0/24 192.168.5.0/24 192.168.6.0/24 192.168.7.0/24" } },
    ],
    validate(v) {
      const table = parseTable(v.t.replace(/;/g, "\n"));
      const { ip, prefix } = parseAddress(v.a);
      if (prefix !== null) throw new Error("The destination address takes no prefix: write it like 200.23.24.170.");
      const r = lookup(table, ip);
      const sum = summarise(parsePrefixes(v.s));
      const label = (e) => (e.len ? showPrefix(e) : "default");
      const values = { iface: r.best ? r.best.iface : "drop", bestPrefix: r.best ? label(r.best) : "none", matches: r.matches.length, supernet: showPrefix(sum.supernet), summary: sum.blocks.map(showPrefix).join(" "), exact: sum.exact };
      return { text: `${dotted(ip)} ${r.best ? `matches ${values.bestPrefix} longest and goes out on interface ${values.iface}` : "matches nothing and is dropped"}; the listed prefixes summarise to ${values.summary} (single supernet ${values.supernet}).`, values };
    },
  }),

  tool("ip-fragmentation", {
    keywords: "ipv4 fragmentation mtu fragment offset more fragments mf flag total length datagram header 8-byte units reassembly identification",
    params: {
      len: { type: "int", min: 21, max: 65535, default: 4000, desc: "total length of the original datagram in bytes, header included" },
      mtu: { type: "int", min: 28, max: 65535, default: 1500, desc: "MTU of the link in bytes" },
      hdr: { type: "int", min: 20, max: 60, default: 20, desc: "IP header length in bytes (multiple of 4)" },
    },
    answers: { fragments: "number of fragments", perFragment: "data bytes per full fragment", data: "data bytes in the datagram", "offset.1": "offset field of fragment 1 in 8-byte units (one key per fragment: offset.2, ...)", "length.1": "total length of fragment 1", "mf.1": "MF flag of fragment 1", "data.1": "data bytes in fragment 1", lastLength: "total length of the last fragment", lastOffset: "offset of the last fragment", overhead: "extra header bytes caused by fragmenting" },
    examples: [
      { request: "A 4000-byte datagram with a 20-byte header crosses a 1500-byte MTU link: fragments, offsets and MF flags?", params: { len: 4000, mtu: 1500, hdr: 20 } },
      { request: "IP packet of 2400 bytes total, MTU 620: offset of the last fragment?", params: { len: 2400, mtu: 620 } },
    ],
    validate(v) {
      const r = fragment(v.len, v.mtu, v.hdr);
      const fs = r.fragments, n = fs.length;
      const values = { fragments: n, perFragment: r.perFragment, data: r.data, lastLength: fs.at(-1).length, lastOffset: fs.at(-1).offset, overhead: (n - 1) * v.hdr };
      fs.forEach((f, i) => { values[`offset.${i + 1}`] = f.offset; values[`length.${i + 1}`] = f.length; values[`mf.${i + 1}`] = f.mf; values[`data.${i + 1}`] = f.data; });
      return { text: n === 1 ? `${v.len} bytes fit in the MTU of ${v.mtu}: no fragmentation.` : `${n} fragments of up to ${r.perFragment} data bytes; offsets ${fs.map((f) => f.offset).join(", ")}; total lengths ${fs.map((f) => f.length).join(", ")}; MF is 1 on all but the last.`, values };
    },
  }),

  tool("error-detection", {
    keywords: "crc cyclic redundancy check generator polynomial remainder transmitted frame codeword hamming code parity bits check bits syndrome error position corrected word single bit error internet checksum ones complement",
    params: {
      mode: { type: "enum", values: ["crc", "hamming", "checksum"], default: "crc", desc: "which code" },
      d: { type: "string", format: "bits, at most 40", default: "1101011111", desc: "crc: the data bits" },
      g: { type: "string", format: "bits starting with 1, at most 17 (x^4 + x + 1 is 10011)", default: "10011", desc: "crc: the generator" },
      hd: { type: "string", format: "bits, at most 26", default: "1011", desc: "hamming: data bits to encode (even parity, parity bits at positions 1, 2, 4, 8, ...)" },
      rx: { type: "string", format: "bits, positions numbered from 1 at the left", default: "0110111", desc: "hamming: received codeword to check and correct" },
      w: { type: "string", format: "16-bit words as 16 binary digits or up to 4 hex digits, separated by spaces (at most 12)", default: "0110011001100000 0101010101010101 1000111100001100", desc: "checksum: the words" },
    },
    answers: { remainder: "crc: remainder (the CRC bits)", frame: "crc: transmitted frame (data + CRC)", crcBits: "crc: number of CRC bits", codeword: "hamming: codeword for hd", parityBits: "hamming: number of parity bits for hd", n: "hamming: codeword length", syndrome: "hamming: position of the bit in error in rx (0 = none)", corrected: "hamming: corrected word", checksum: "checksum in binary", hex: "checksum in hex", sum: "ones complement sum in binary" },
    examples: [
      { request: "Data 1101011011 with generator x^4 + x + 1: what is the transmitted frame?", params: { mode: "crc", d: "1101011011", g: "10011" } },
      { request: "Hamming code: received 1110101, which bit is in error?", params: { mode: "hamming", hd: "1011", rx: "1110101" } },
    ],
    validate(v) {
      if (v.mode === "crc") {
        const r = crc(v.d, v.g);
        return { text: `Append ${r.r} zeros and divide by ${r.gen}: the remainder is ${r.remainder}, so the transmitted frame is ${r.codeword}.`, values: { remainder: r.remainder, frame: r.codeword, crcBits: r.r } };
      }
      if (v.mode === "hamming") {
        const e = hammingEncode(v.hd), c = hammingCheck(v.rx);
        const check = c.syndrome === 0 ? `received ${v.rx.trim()} has no error` : c.syndrome <= v.rx.replace(/\s/g, "").length ? `received ${v.rx.trim()} has bit ${c.syndrome} wrong, corrected to ${c.corrected}` : `received ${v.rx.trim()} has syndrome ${c.syndrome}, past the end, so more than one bit is wrong`;
        return { text: `Data ${e.data} needs ${e.parityBits} parity bits: codeword ${e.codeword}; ${check}.`, values: { codeword: e.codeword, parityBits: e.parityBits, n: e.n, syndrome: c.syndrome, corrected: c.corrected } };
      }
      const r = checksum(v.w);
      return { text: `The ones complement sum is ${r.sum.toString(2).padStart(16, "0")}, so the checksum is ${r.binary} (0x${r.hex}).`, values: { checksum: r.binary, hex: r.hex, sum: r.sum.toString(2).padStart(16, "0") } };
    },
  }),

  sliding,

  tool("routing", {
    keywords: "dijkstra link state shortest path least cost distance vector bellman ford count to infinity poisoned reverse split horizon forwarding table next hop flooding lsp ospf rip",
    params: {
      algo: { type: "enum", values: ["ls", "dv", "flood"], default: "ls", desc: "ls: Dijkstra link state; dv: distance vector in synchronous rounds; flood: flooding one LSP" },
      g: { type: "string", format: 'links "A-B cost" joined by ";", router names a letter plus up to 2 letters or digits, at most 10 routers', default: EXAMPLES.kurose.text.split("\n").join(";"), desc: "the network" },
      src: { type: "string", format: "a router name in capitals", default: "U", desc: "source router (ls, flood) or the router whose vector is shown (dv)" },
      chg: { type: "string", format: 'dv only: "X-Y cost", or empty', default: "", desc: "dv: after convergence this link's cost changes (count-to-infinity)" },
      pr: { type: "bool", default: false, desc: "dv: poisoned reverse" },
    },
    answers: { "cost.X": "least cost from src to X (ls; dv after convergence)", "next.X": "next hop from src towards X", "path.X": "ls: least-cost path to X", "r1.X": "dv: src's cost to X after round 1 (r2.X after round 2)", vector1: "dv: src's whole vector after round 1, in node order", vectorFinal: "dv: src's final vector", rounds: "dv: rounds until stable", transmissions: "flood: LSP transmissions", duplicates: "flood: duplicate copies dropped", time: "flood: time to reach every router" },
    examples: [
      { request: "Dijkstra from A: A-B 2, A-C 5, B-C 1, B-D 4, C-D 1. Least cost to D?", params: { algo: "ls", g: "A-B 2;A-C 5;B-C 1;B-D 4;C-D 1", src: "A" } },
      { request: "Distance vector on X-Y 4, Y-Z 1, X-Z 50: what is X's vector after the first round?", params: { algo: "dv", g: "X-Y 4;Y-Z 1;X-Z 50", src: "X" } },
    ],
    validate(v) {
      const g = parseNetwork(v.g.replace(/;/g, "\n"));
      if (!g.nodes.includes(v.src)) throw new Error(`src ${v.src} isn't in the network (routers: ${g.nodes.join(", ")}).`);
      const values = {};
      if (v.algo === "ls") {
        const r = dijkstra(g, v.src);
        for (const t of r.table) { values[`cost.${t.dest}`] = inf(t.cost); values[`next.${t.dest}`] = t.next ?? "none"; values[`path.${t.dest}`] = t.path ? t.path.join("-") : "none"; }
        return { text: `Dijkstra from ${v.src}: ${r.table.map((t) => `${t.dest} ${inf(t.cost)}${t.path ? ` via ${t.path.join("-")}` : ""}`).join(", ")}.`, values };
      }
      if (v.algo === "flood") {
        const r = flood(g, v.src);
        Object.assign(values, { transmissions: r.transmissions, duplicates: r.duplicates, time: Math.max(...Object.values(r.arrivedAt)) });
        return { text: `Flooding ${v.src}'s LSP takes ${r.transmissions} transmissions (${r.duplicates} duplicates dropped) and reaches everyone by t = ${values.time}.`, values };
      }
      let change = null;
      if (v.chg.trim()) {
        const m = /^([A-Za-z]\w{0,2})\s*-\s*([A-Za-z]\w{0,2})\s+(\d{1,3})$/.exec(v.chg.trim());
        if (!m) throw new Error("Write the link change like X-Y 60.");
        change = { a: m[1].toUpperCase(), b: m[2].toUpperCase(), cost: Number(m[3]) };
      }
      const r = distanceVector(g, { change, poison: v.pr });
      const fin = r.rounds.at(-1).vectors[v.src];
      for (const y of g.nodes) {
        if (y === v.src) continue;
        values[`cost.${y}`] = inf(fin[y].cost); values[`next.${y}`] = fin[y].via ?? "none";
        if (r.rounds[1]) values[`r1.${y}`] = inf(r.rounds[1].vectors[v.src][y].cost);
        if (r.rounds[2]) values[`r2.${y}`] = inf(r.rounds[2].vectors[v.src][y].cost);
      }
      values.rounds = r.rounds.length - 1;
      const vec = (vv) => g.nodes.map((y) => inf(vv[y].cost)).join(", ");
      if (r.rounds[1]) values.vector1 = vec(r.rounds[1].vectors[v.src]);
      values.vectorFinal = vec(fin);
      return { text: `Distance vector: ${v.src}'s vector to ${g.nodes.join(", ")} is ${r.rounds[1] ? vec(r.rounds[1].vectors[v.src]) : "unchanged"} after round 1 and ${vec(fin)} at the end (${values.rounds} rounds${r.finalStable ? "" : ", still not stable"}).`, values };
    },
  }),

  tool("tcp-congestion-control", {
    keywords: "tcp congestion window cwnd ssthresh slow start congestion avoidance aimd fast retransmit fast recovery triple duplicate ack timeout tahoe reno cubic three way handshake syn ack sequence number fin",
    params: {
      v: { type: "enum", values: Object.keys(VARIANTS), default: "reno", desc: "TCP variant" },
      ss: { type: "int", min: 2, max: 256, default: 8, desc: "initial ssthresh in MSS (cwnd starts at 1 in round 1)" },
      r: { type: "int", min: 2, max: 60, default: 22, desc: "rounds (RTTs) to simulate; must reach the round asked about" },
      e: { type: "string", format: 'loss events "round: 3dup" or "round: timeout", comma-separated; a loss in round n changes the window of round n + 1; "" for no losses', default: "8: 3dup, 16: timeout", allowEmpty: true, desc: "loss events (pass \"\" for none, otherwise the default events apply)" },
      p3: { type: "bool", default: false, desc: "Reno: cwnd = ssthresh + 3 after 3 duplicate ACKs" },
      rtt: { type: "number", min: 1, max: 2000, default: 200, desc: "cubic only: RTT in ms" },
      x: { type: "int", min: 0, max: 4294967295, default: 100, desc: "handshake: client initial sequence number" },
      y: { type: "int", min: 0, max: 4294967295, default: 300, desc: "handshake: server initial sequence number" },
      b: { type: "int", min: 0, max: 100000, default: 500, desc: "handshake: bytes the client sends" },
      rb: { type: "int", min: 0, max: 100000, default: 0, desc: "handshake: bytes the server sends back" },
    },
    answers: { "cwnd.N": "cwnd in MSS during round N (one key per round: cwnd.1, cwnd.2, ...)", "ssthresh.N": "ssthresh during round N", totalSegments: "segments sent over all rounds", maxCwnd: "largest window", synAckAck: "handshake: ack number in the SYN+ACK", ackAck: "handshake: ack number in the client's third segment", clientFinSeq: "handshake: sequence number of the client's FIN", segments: "handshake: segments exchanged from SYN to the last ACK" },
    examples: [
      { request: "TCP Reno, ssthresh 16, three duplicate ACKs in round 9 and a timeout in round 14: what is cwnd in round 17?", params: { v: "reno", ss: 16, r: 20, e: "9: 3dup, 14: timeout" } },
      { request: "TCP Tahoe with initial ssthresh 12 and a timeout in round 7: cwnd in each round?", params: { v: "tahoe", ss: 12, r: 15, e: "7: timeout" } },
    ],
    validate(v) {
      const res = cwndSim({ ssthresh: v.ss, rounds: v.r, events: parseEvents(v.e), variant: v.v, plus3: v.p3, rtt: v.rtt / 1000 });
      const hs = handshake({ clientIsn: v.x, serverIsn: v.y, bytes: v.b, reply: v.rb });
      const values = { totalSegments: res.totalSegments, maxCwnd: Math.max(...res.series.map((p) => p.cwnd)), synAckAck: v.x + 1, ackAck: v.y + 1, clientFinSeq: v.x + 1 + v.b, segments: hs.segments };
      for (const p of res.series) { values[`cwnd.${p.round}`] = p.cwnd; values[`ssthresh.${p.round}`] = p.ssthresh; }
      return { text: `${VARIANTS[v.v].name}: cwnd by round ${res.series.map((p) => p.cwnd).join(", ")}; ssthresh ends at ${res.series.at(-1).ssthresh}.`, values };
    },
  }),

  shaping,
  mac,

  tool("dns-and-http", {
    keywords: "dns iterative recursive query local root tld authoritative name server messages cache http response time persistent non-persistent pipelining parallel connections rtt base html objects page load time",
    params: {
      q: { type: "string", format: "a domain name with at least three parts", default: "gaia.cs.umass.edu", desc: "DNS: the name to resolve" },
      dm: { type: "enum", values: ["iterative", "recursive"], default: "iterative", desc: "DNS: how the local server resolves the name" },
      c: { type: "enum", values: ["none", "tld", "answer"], default: "none", desc: "DNS: what the local server has cached (nothing, the TLD server, or the answer)" },
      hm: { type: "enum", values: Object.keys(HTTP_MODES), default: "np-serial", desc: "HTTP: np-serial (non-persistent, one at a time), np-parallel, p-nopipe (persistent without pipelining), p-pipe (persistent with pipelining)" },
      n: { type: "int", min: 0, max: 30, default: 3, desc: "HTTP: objects referenced by the base HTML file" },
      rtt: { type: "number", min: 0.001, max: 10000, default: 100, desc: "HTTP: RTT to the server in ms" },
      tx: { type: "number", min: 0, max: 10000, default: 0, desc: "HTTP: transmission time per object in ms" },
      par: { type: "int", min: 1, max: 30, default: 5, desc: "HTTP: parallel connections (np-parallel)" },
      dns: { type: "string", format: "DNS round-trip times in ms separated by spaces, or empty", default: "", desc: "HTTP: DNS lookups before connecting" },
    },
    answers: { dnsMessages: "DNS messages (queries and replies)", dnsHops: "DNS one-way message times in sequence", httpMs: "HTTP: total time in ms until the last object arrives", httpRtts: "HTTP: total in RTTs (excluding DNS and transmission)", connections: "HTTP: TCP connections opened" },
    examples: [
      { request: "Base page plus 8 objects, RTT 50 ms, non-persistent HTTP with 4 parallel connections, DNS takes 20 ms: total time?", params: { hm: "np-parallel", n: 8, rtt: 50, par: 4, dns: "20" } },
      { request: "Iterative DNS lookup of www.example.org with nothing cached: how many messages?", params: { q: "www.example.org", dm: "iterative", c: "none" } },
    ],
    validate(v) {
      const d = dnsLookup({ name: v.q, mode: v.dm, cache: v.c });
      const dnsList = v.dns.trim() ? v.dns.trim().split(/[\s,+]+/).map((x) => { const n = Number(x); if (!(n >= 0)) throw new Error(`"${x}" isn't a DNS round-trip time in ms.`); return n; }) : [];
      const h = httpTiming({ mode: v.hm, objects: v.n, rtt: v.rtt, tx: v.tx, parallel: v.par, dns: dnsList });
      const values = { dnsMessages: d.messages, dnsHops: d.time, httpMs: round(h.formula.ms), httpRtts: h.formula.rtts, connections: h.connections };
      return { text: `${HTTP_MODES[v.hm].name}: ${h.formula.text} = ${values.httpMs} ms. ${v.dm === "iterative" ? "Iterative" : "Recursive"} DNS for ${v.q}: ${d.messages} messages.`, values };
    },
  }),

  tool("osi-encapsulation", {
    keywords: "osi model tcp ip layers encapsulation headers overhead efficiency mss mtu segment packet frame ethernet header trailer fcs padding router layers n layers h bytes header fraction bandwidth",
    params: {
      model: { type: "enum", values: Object.keys(MODELS), default: "tcpip", desc: "tcpip (five layers), osi (seven), or generic (n layers each adding h bytes, no MTU)" },
      m: { type: "int", min: 1, max: 1000000, default: 4000, desc: "message size in bytes" },
      a: { type: "int", min: 0, max: 10000, default: 0, desc: "tcpip/osi: application header in bytes" },
      tp: { type: "enum", values: Object.keys(TRANSPORTS), default: "tcp", desc: "tcpip/osi: transport protocol" },
      ip: { type: "enum", values: ["4", "6"], default: "4", desc: "tcpip/osi: IP version" },
      mtu: { type: "int", min: 68, max: 65535, default: 1500, desc: "tcpip/osi: MTU of the first link (IPv6 at least 1280)" },
      mtu2: { type: "int", min: 68, max: 65535, default: 1500, desc: "tcpip/osi: MTU of the link after the router" },
      pre: { type: "bool", default: false, desc: "tcpip/osi: count the 8-byte Ethernet preamble" },
      n: { type: "int", min: 1, max: 10, default: 5, desc: "generic: number of layers" },
      h: { type: "int", min: 0, max: 1000, default: 20, desc: "generic: header bytes per layer" },
    },
    answers: { bytes1: "bytes on the first link", bytes2: "bytes on the second link", overhead: "overhead bytes on the first link", efficiency: "message / bytes on link 1, in percent", headerShare: "share of bandwidth taken by headers, in percent", segments: "transport segments or datagrams", packets1: "IP packets on link 1", packets2: "IP packets on link 2", mss: "TCP MSS in bytes" },
    examples: [
      { request: "A 500-byte message goes down 5 layers, each adding a 20-byte header: what fraction of the bandwidth is headers?", params: { model: "generic", m: 500, n: 5, h: 20 } },
      { request: "Send 4000 bytes over TCP/IPv4 on Ethernet with MTU 1500: how many segments and how much overhead?", params: { model: "tcpip", m: 4000, tp: "tcp", ip: "4", mtu: 1500 } },
    ],
    validate(v) {
      const r = encapsulate({ model: v.model, msg: v.m, app: v.a, transport: v.tp, ip: Number(v.ip), mtu: v.mtu, mtu2: v.mtu2, preamble: v.pre, n: v.n, h: v.h });
      const s = r.summary;
      const values = { bytes1: s.bytes1, bytes2: s.bytes2, overhead: s.overhead, efficiency: round(s.efficiency * 100), headerShare: round(s.headerShare * 100), segments: s.segments, packets1: s.packets1.length, packets2: s.packets2.length };
      if (s.mss != null) values.mss = s.mss;
      return { text: v.model === "generic"
        ? `${v.n} headers of ${v.h} bytes add ${s.overhead} bytes to ${v.m}, so headers take ${values.headerShare}% of the ${s.bytes1} bytes sent.`
        : `${v.m} bytes need ${s.segments} ${v.tp === "tcp" ? `segment(s) (MSS ${s.mss})` : "datagram(s)"} and ${s.packets1.length} packet(s); link 1 carries ${s.bytes1} bytes, ${s.overhead} of overhead (efficiency ${round(s.efficiency * 100, 2)}%).`, values };
    },
  }),
];
