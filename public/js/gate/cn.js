// GATE question generators for computer networks. Each topic: { slug, subject, title, make(r) }.
// slug must be a tool slug; make(r) returns a question (see ../gate-questions.js) or null to retry.
// Every answer comes from the same engine the visualiser runs.
import { pick, int, round2, show, shuffle, query, mcq } from "./kit.js";
import { analyse, vlsm, dotted, toInt, maskOf, randomAddress } from "../engines/subnet.js";
import { lookup, randomTable, summarise, show as showPrefix } from "../engines/cidr.js";
import { fragment } from "../engines/fragment.js";
import { crc, divide, hammingEncode, hammingCheck, randomBits, GENERATORS } from "../engines/errors.js";
import { simulate as slide, PROTOCOLS } from "../engines/sliding.js";
import { parseNetwork, dijkstra, distanceVector, randomNetwork } from "../engines/routing.js";
import { simulate as cwndSim, parseEvents, VARIANTS } from "../engines/congestion.js";
import { leakyBucket, tokenBucket } from "../engines/shaping.js";
import { throughput } from "../engines/mac.js";
import { dnsLookup, httpTiming, HTTP_MODES } from "../engines/dnshttp.js";

const inf = (x) => (x === Infinity ? "∞" : String(x));

// --- Subnetting ------------------------------------------------------------------------

function subnetting(r) {
  const variant = pick(r, ["broadcast", "hosts", "vlsm"]);
  if (variant === "vlsm") {
    const names = shuffle(r, ["Sales", "Office", "Lab", "Admin", "Store", "Guest"]).slice(0, int(r, 3, 4));
    const needs = names.map((name) => ({ name, hosts: pick(r, [2, 5, 10, 12, 20, 25, 30, 40, 50, 60, 100, 120]) }));
    const third = int(r, 0, 255), first = pick(r, [10, 172, 192]);
    const base = toInt(first === 192 ? [192, 168, third, 0] : first === 172 ? [172, 16 + int(r, 0, 15), third, 0] : [10, int(r, 0, 255), third, 0]);
    const res = vlsm(base, 24, needs);
    if (res.rows.some((x) => x.failed)) return null;
    const target = pick(r, res.rows.filter((x) => x.network !== base));
    if (!target) return null;
    const right = `${dotted(target.network)}/${target.prefix}`;
    const wrongs = [
      ...res.rows.filter((x) => x !== target).map((x) => `${dotted(x.network)}/${x.prefix}`),
      `${dotted(target.network)}/${target.prefix + 1}`, `${dotted(target.network)}/${target.prefix - 1}`,
      `${dotted(target.network + target.size)}/${target.prefix}`,
    ];
    const opts = mcq(r, right, shuffle(r, wrongs));
    if (!opts) return null;
    const needText = needs.map((n) => `${n.name} ${n.hosts}`).join(", ");
    return {
      topic: "subnetting", type: "mcq", marks: 2, ...opts,
      stem: [
        `An organisation has the block ${dotted(base)}/24 and needs these subnets (name and number of hosts):`,
        { table: { head: ["Subnet", "Hosts needed"], rows: needs.map((n) => [n.name, n.hosts]) } },
        "It uses VLSM: the largest requirement is allocated first (ties in the order listed), each subnet gets the smallest block that fits its hosts plus the network and broadcast addresses, and each block starts at the lowest free address that is a multiple of its size.",
        `Which block is allocated to ${target.name}?`,
      ],
      solution: [
        { table: { head: ["Subnet", "Hosts", "Block size", "Allocated"], rows: res.rows.map((x) => [x.name, x.hosts, x.size, `${dotted(x.network)}/${x.prefix}`]) } },
        `${target.name} needs ${target.hosts} + 2 = ${target.hosts + 2} addresses, rounded up to ${target.size} (a /${target.prefix}), and gets ${right}.`,
      ],
      replay: query("/subnetting", { mode: "vlsm", base: `${dotted(base)}/24`, needs: needText }),
    };
  }
  const { ip } = randomAddress(r);
  const prefix = int(r, 18, 29);
  const a = analyse(ip, prefix);
  if (variant === "hosts") {
    const usable = a.usable;
    return {
      topic: "subnetting", type: "nat", marks: 1, answer: usable, tolerance: 0,
      stem: [`A host has IP address ${dotted(ip)} with subnet mask ${dotted(a.mask)}. How many usable host addresses does its subnet have?`],
      solution: [
        `The mask ${dotted(a.mask)} has ${prefix} one bits, so it is a /${prefix} and leaves ${32 - prefix} host bits.`,
        `The block has 2^${32 - prefix} = ${a.total} addresses; the network address ${dotted(a.network)} and the broadcast ${dotted(a.broadcast)} are reserved, so ${a.total} − 2 = ${usable} are usable.`,
      ],
      replay: query("/subnetting", { mode: "address", a: `${dotted(ip)}/${prefix}` }),
    };
  }
  const right = dotted(a.broadcast);
  const wrongs = [analyse(ip, prefix + 1).broadcast, analyse(ip, prefix - 1).broadcast, a.last, a.network, analyse(ip, prefix + 2).broadcast].map(dotted);
  const opts = mcq(r, right, wrongs);
  if (!opts) return null;
  return {
    topic: "subnetting", type: "mcq", marks: 1, ...opts,
    stem: [`What is the broadcast address of the subnet that contains ${dotted(ip)}/${prefix}?`],
    solution: [
      `A /${prefix} mask is ${dotted(a.mask)}. ANDing it with the address gives the network ${dotted(a.network)}.`,
      `Setting all ${32 - prefix} host bits to 1 gives the broadcast address ${right}.`,
    ],
    replay: query("/subnetting", { mode: "address", a: `${dotted(ip)}/${prefix}` }),
  };
}

// --- CIDR and longest prefix match --------------------------------------------------------

function cidr(r) {
  if (r() < 0.6) {
    const { rows, ip } = randomTable(r);
    const res = lookup(rows, ip);
    const label = (e) => (e.len ? showPrefix(e) : "default (0.0.0.0/0)");
    const ifaces = rows.map((e) => `Interface ${e.iface}`);
    const opts = mcq(r, `Interface ${res.best.iface}`, shuffle(r, ifaces));
    if (!opts) return null;
    return {
      topic: "cidr-and-longest-prefix-match", type: "mcq", marks: 1, ...opts,
      stem: [
        "A router has the following forwarding table.",
        { table: { head: ["Prefix", "Interface"], rows: rows.map((e) => [label(e), e.iface]) } },
        `On which interface does it forward a packet addressed to ${dotted(ip)}?`,
      ],
      solution: [
        `Matching prefixes: ${res.matches.map(label).join(", ")}.`,
        `The longest is ${label(res.best)}, so the packet goes out on interface ${res.best.iface}.`,
      ],
      replay: query("/cidr-and-longest-prefix-match", { t: rows.map((e) => `${e.len ? showPrefix(e) : "default"} ${e.iface}`).join(";"), a: dotted(ip) }),
    };
  }
  // Summarisation: some consecutive, aligned blocks of the same size.
  const len = pick(r, [22, 23, 24, 25, 26]);
  const k = pick(r, [2, 3, 4, 4, 6, 8]);
  const size = 2 ** (32 - len);
  const first = toInt([pick(r, [130, 172, 200, 192, 64]), int(r, 0, 255), 0, 0]);
  const startBlock = int(r, 0, Math.floor(2 ** (len - 16) / 8) - 1) * 8 + (r() < 0.5 ? 0 : int(r, 0, 4));
  const prefixes = Array.from({ length: k }, (_, i) => ({ net: (first + (startBlock + i) * size) >>> 0, len }));
  if (prefixes.some((p) => (p.net >>> 16) !== (first >>> 16))) return null;
  const res = summarise(prefixes);
  const sup = res.supernet;
  const right = showPrefix(sup);
  const wrongs = [-1, 1, 2, -2].map((d) => ({ net: (sup.net & maskOf(sup.len + d)) >>> 0, len: sup.len + d })).filter((p) => p.len > 0 && p.len <= len).map(showPrefix);
  wrongs.push(showPrefix({ net: prefixes[0].net, len: sup.len }));
  const opts = mcq(r, right, wrongs);
  if (!opts) return null;
  return {
    topic: "cidr-and-longest-prefix-match", type: "mcq", marks: 2, ...opts,
    stem: [
      `A router advertises the routes ${prefixes.map(showPrefix).join(", ")}.`,
      "What is the smallest single prefix (supernet) that covers all of them?",
    ],
    solution: [
      `In binary the blocks run from ${dotted(Math.min(...prefixes.map((p) => p.net)))} to ${dotted(prefixes.at(-1).net + size - 1)}; these two addresses agree on their first ${sup.len} bits and no more.`,
      `So the supernet is ${right}.${res.exact ? " It covers exactly the listed blocks." : ` It also covers ${2 ** (32 - sup.len) - k * size} addresses that are not in the list.`}`,
    ],
    replay: query("/cidr-and-longest-prefix-match", { s: prefixes.map(showPrefix).join(" ") }),
  };
}

// --- IP fragmentation ------------------------------------------------------------------

function ipFragmentation(r) {
  const mtu = pick(r, [420, 500, 576, 620, 820, 1000, 1200, 1500]);
  const header = r() < 0.8 ? 20 : pick(r, [24, 28]);
  const total = 20 * int(r, Math.ceil((mtu + 40) / 20), Math.floor(Math.min(6000, mtu * 6) / 20));
  const res = fragment(total, mtu, header);
  const n = res.fragments.length;
  if (n < 2) return null;
  const variant = pick(r, ["count", "offset", "last"]);
  const base = `An IPv4 datagram of total length ${total} bytes (with a ${header}-byte header) must cross a link with an MTU of ${mtu} bytes. Every fragment carries a ${header}-byte header.`;
  const table = { table: { head: ["Fragment", "Data bytes", "Total length", "Offset (8-byte units)", "MF"], rows: res.fragments.map((f, i) => [i + 1, f.data, f.length, f.offset, f.mf]) } };
  const working = `Data = ${total} − ${header} = ${res.data} bytes. Each fragment can carry ⌊(${mtu} − ${header}) / 8⌋ × 8 = ${res.perFragment} data bytes.`;
  const replay = query("/ip-fragmentation", { len: total, mtu, hdr: header });
  if (variant === "count") {
    return {
      topic: "ip-fragmentation", type: "nat", marks: 1, answer: n, tolerance: 0,
      stem: [base, "Into how many fragments is it split?"],
      solution: [working, `Fragments = ⌈${res.data} / ${res.perFragment}⌉ = ${n}.`, table],
      replay,
    };
  }
  if (variant === "offset") {
    const i = int(r, 1, n - 1);
    const f = res.fragments[i];
    return {
      topic: "ip-fragmentation", type: "nat", marks: 1, answer: f.offset, tolerance: 0,
      stem: [base, `What is the fragment offset field of fragment ${i + 1} (fragments numbered from 1 in order)?`],
      solution: [working, `Fragment ${i + 1} starts at data byte ${i} × ${res.perFragment} = ${f.first}, and the offset counts 8-byte units: ${f.first} / 8 = ${f.offset}.`, table],
      replay,
    };
  }
  const f = res.fragments.at(-1);
  return {
    topic: "ip-fragmentation", type: "nat", marks: 2, answer: f.length, tolerance: 0,
    stem: [base, "What is the total length field, in bytes, of the last fragment?"],
    solution: [working, `The first ${n - 1} fragments carry ${(n - 1) * res.perFragment} bytes, leaving ${res.data} − ${(n - 1) * res.perFragment} = ${f.data} data bytes for the last one. With its header, its total length is ${f.data} + ${header} = ${f.length}.`, table],
    replay,
  };
}

// --- Error detection --------------------------------------------------------------------

function errorDetection(r) {
  if (r() < 0.55) {
    const gen = pick(r, GENERATORS);
    const data = randomBits(r, int(r, 6, 10));
    const res = crc(data, gen);
    const len = gen.length - 1;
    const wrongs = [divide(data, gen).remainder.padStart(len, "0"), [...res.remainder].map((b) => (b === "1" ? "0" : "1")).join(""), [...res.remainder].reverse().join("")];
    for (let i = 0; i < 6; i++) wrongs.push(randomBits(() => r() * 0.999 + 0.0005, len).replace(/^1/, r() < 0.5 ? "0" : "1"));
    const opts = mcq(r, res.remainder, wrongs);
    if (!opts) return null;
    return {
      topic: "error-detection", type: "mcq", marks: 2, ...opts,
      stem: [`The data ${data} is sent using CRC with generator ${gen}. What is the CRC (the remainder appended to the data)?`],
      solution: [
        `The generator has ${gen.length} bits, so append ${len} zeros: ${res.padded}.`,
        `Divide by ${gen} using XOR: ${res.steps.filter((s) => s.by !== "0".repeat(gen.length)).length} subtractions, leaving the remainder ${res.remainder}.`,
        `The transmitted frame is ${res.codeword}.`,
      ],
      replay: query("/error-detection", { mode: "crc", d: data, g: gen }),
    };
  }
  const data = randomBits(r, int(r, 4, 8));
  const enc = hammingEncode(data);
  const flip = r() < 0.12 ? 0 : int(r, 1, enc.n);
  const rx = flip ? enc.codeword.slice(0, flip - 1) + (enc.codeword[flip - 1] === "1" ? "0" : "1") + enc.codeword.slice(flip) : enc.codeword;
  const res = hammingCheck(rx);
  if (res.syndrome !== flip) return null;
  return {
    topic: "error-detection", type: "nat", marks: 2, answer: res.syndrome, tolerance: 0,
    stem: [
      `A ${enc.n}-bit Hamming codeword with even parity, parity bits at positions 1, 2, 4, 8 and so on, and positions numbered from 1 at the left, is received as ${rx}. At most one bit is in error.`,
      "Which bit position is in error? Enter 0 if there is no error.",
    ],
    solution: [
      { table: { head: ["Check", "Positions covered", "Result"], rows: res.steps.filter((s) => s.parity).map((s) => [`P${s.parity}`, s.covered.join(", "), s.fails ? "fails" : "passes"]) } },
      res.syndrome ? `The failing checks add up to ${res.syndrome}, so bit ${res.syndrome} is wrong. The corrected word is ${res.corrected}.` : "Every check passes, so the syndrome is 0: no error.",
    ],
    replay: query("/error-detection", { mode: "hamming", hd: data, rx }),
  };
}

// --- Sliding window ---------------------------------------------------------------------

function slidingWindow(r) {
  {
    const protocol = pick(r, ["gbn", "gbn", "sr"]);
    const frames = int(r, 6, 10), window = int(r, 2, 4), k = pick(r, [3, 4, 5, 6]);
    let res;
    try { res = slide({ protocol, frames, window, everyKth: k }); } catch { return null; }
    if (!res.retransmissions) return null;
    return {
      topic: "sliding-window", type: "nat", marks: 2, answer: res.framesSent, tolerance: 0,
      stem: [
        `A sender uses ${PROTOCOLS[protocol].name} with a window of ${window} to send ${frames} frames, numbered from 0. Every ${k}th frame transmission is lost (the ${k}th, ${2 * k}th and so on, counting retransmissions too); no acknowledgement is lost.`,
        `${protocol === "gbn" ? "On a timeout the sender resends every outstanding frame." : "On a timeout the sender resends only the frame that timed out; the receiver buffers frames that arrive out of order."} How many frame transmissions are needed in all, including retransmissions?`,
      ],
      solution: [
        `Transmission order: ${res.sends.filter((s) => s.kind === "F").map((s) => `${s.n}${s.lost ? " (lost)" : ""}`).join(", ")}.`,
        `${res.framesSent} transmissions: ${frames} frames plus ${res.retransmissions} retransmissions.`,
      ],
      replay: query("/sliding-window", { p: protocol, n: frames, w: window, d: 1, loss: "", k }),
    };
  }
}

// --- Routing ---------------------------------------------------------------------------

function routing(r) {
  const text = randomNetwork(r);
  const g = parseNetwork(text);
  const net = { table: { head: ["Link", "Cost"], rows: g.links.map((l) => [`${l.a} to ${l.b}`, l.cost]) } };
  const gParam = text.split("\n").join(";");
  if (r() < 0.55) {
    const dv = distanceVector(g);
    const r0 = dv.rounds[0].vectors, r1 = dv.rounds[1].vectors;
    const pairs = [];
    for (const x of g.nodes) for (const y of g.nodes) if (x !== y && r1[x][y].cost !== r0[x][y].cost && r1[x][y].cost !== Infinity) pairs.push([x, y]);
    if (!pairs.length) return null;
    const x = pick(r, g.nodes.filter((n) => pairs.some((p) => p[0] === n)));
    const right = g.nodes.map((y) => inf(r1[x][y].cost)).join(", ");
    const wrongs = [
      g.nodes.map((y) => inf(r0[x][y].cost)).join(", "),
      g.nodes.map((y) => inf(dv.rounds.at(-1).vectors[x][y].cost)).join(", "),
      g.nodes.map((y) => inf(dv.rounds[2]?.vectors[x][y].cost ?? Infinity)).join(", "),
      g.nodes.map((y) => (r1[x][y].cost === Infinity ? "∞" : String(r1[x][y].cost + (y === pick(r, g.nodes.filter((n) => n !== x)) ? 1 : 0)))).join(", "),
      g.nodes.map((y) => (r1[x][y].cost === Infinity || y === x ? inf(r1[x][y].cost) : String(r1[x][y].cost + 2))).join(", "),
    ];
    const opts = mcq(r, right, wrongs);
    if (!opts) return null;
    const nbs = g.links.filter((l) => l.a === x || l.b === x).map((l) => (l.a === x ? l.b : l.a)).sort();
    return {
      topic: "routing", type: "mcq", marks: 2, ...opts,
      stem: [
        "Routers in the network below run distance-vector routing in synchronous rounds. Initially each router knows only the costs of its own links (∞ elsewhere). In each round, every router sends its current vector to its neighbours and then recomputes Dx(y) = min over neighbours v of c(x, v) + Dv(y).",
        net,
        `What is ${x}'s distance vector, to ${g.nodes.join(", ")} in that order, after the first round?`,
      ],
      solution: [
        `${x}'s neighbours are ${nbs.join(", ")}. It combines their initial vectors with its link costs.`,
        { table: { head: ["Destination", "Before", "After round 1", "Via"], rows: g.nodes.map((y) => [y, inf(r0[x][y].cost), inf(r1[x][y].cost), r1[x][y].via ?? "none"]) } },
        "Destinations two hops away become reachable after one round; ones further away are still ∞.",
      ],
      replay: query("/routing", { algo: "dv", g: gParam, src: x, chg: "", pr: 0 }),
    };
  }
  const src = pick(r, g.nodes);
  const res = dijkstra(g, src);
  const row = pick(r, res.table.filter((t) => t.path && t.path.length > 2) );
  if (!row) return null;
  return {
    topic: "routing", type: "nat", marks: 1, answer: row.cost, tolerance: 0,
    stem: ["Router costs are shown below; links are bidirectional.", net, `Using Dijkstra's link-state algorithm, what is the least cost from ${src} to ${row.dest}?`],
    solution: [
      { table: { head: ["Destination", "Cost", "Path", "Next hop"], rows: res.table.map((t) => [t.dest, inf(t.cost), t.path ? t.path.join(" → ") : "none", t.next ?? "none"]) } },
      `The least cost path to ${row.dest} is ${row.path.join(" → ")}, cost ${row.cost}.`,
    ],
    replay: query("/routing", { algo: "ls", g: gParam, src, chg: "", pr: 0 }),
  };
}

// --- TCP congestion control -------------------------------------------------------------

function tcpCongestion(r) {
  const variant = pick(r, ["tahoe", "reno"]);
  const ss = pick(r, [8, 12, 16, 20, 32]);
  const first = int(r, 6, 10);
  const events = [{ round: first, type: pick(r, ["timeout", "dupack"]) }];
  if (r() < 0.6) events.push({ round: first + int(r, 4, 7), type: pick(r, ["timeout", "dupack"]) });
  const last = events.at(-1).round;
  const target = last + int(r, 1, 5);
  const rounds = Math.max(target, 12);
  const eventText = events.map((e) => `${e.round}: ${e.type === "timeout" ? "timeout" : "3dup"}`).join(", ");
  const res = cwndSim({ ssthresh: ss, rounds, events: parseEvents(eventText), variant });
  const ask = r() < 0.75 ? "cwnd" : "ssthresh";
  const point = res.series[target - 1];
  const answer = ask === "cwnd" ? point.cwnd : point.ssthresh;
  const desc = (e) => `${e.type === "timeout" ? "a timeout" : "three duplicate ACKs"} in round ${e.round}`;
  return {
    topic: "tcp-congestion-control", type: "nat", marks: 2, answer, tolerance: 0,
    stem: [
      `A ${VARIANTS[variant].name} connection starts with cwnd = 1 MSS in round 1 and ssthresh = ${ss} MSS. In slow start cwnd doubles each round but never past ssthresh; from ssthresh on it grows by 1 MSS per round. On a loss, ssthresh = max(⌊cwnd / 2⌋, 2); a timeout sets cwnd = 1, and three duplicate ACKs set cwnd = ${variant === "tahoe" ? "1 (Tahoe)" : "the new ssthresh (Reno fast recovery)"}. A loss in round r changes the window used in round r + 1.`,
      `The sender sees ${events.map(desc).join(" and ")}. What is ${ask} (in MSS) during round ${target}?`,
    ],
    solution: [
      { table: { head: ["Round", "cwnd", "ssthresh", "Event"], rows: res.series.slice(0, target).map((p) => [p.round, p.cwnd, p.ssthresh, p.event ? (p.event === "timeout" ? "timeout" : "3 dup ACKs") : ""]) } },
      `In round ${target}, ${ask} = ${answer}.`,
    ],
    replay: query("/tcp-congestion-control", { v: variant, ss, r: rounds, e: eventText, p3: 0 }),
  };
}

// --- Traffic shaping --------------------------------------------------------------------

function trafficShaping(r) {
  const variant = pick(r, ["leaky", "token"]);
  const ticks = int(r, 6, 9);
  const arrivals = Array.from({ length: ticks }, () => (r() < 0.45 ? 0 : int(r, 1, 8)));
  const capacity = int(r, 3, 7), rate = int(r, 1, 3);
  const arrText = arrivals.join(" ");
  const table = { table: { head: ["Tick", ...arrivals.map((_, i) => i)], rows: [["Packets arriving", ...arrivals]] } };
  if (variant === "leaky") {
    const res = leakyBucket({ arrivals, capacity, rate });
    if (!res.dropped) return null;
    return {
      topic: "traffic-shaping", type: "nat", marks: 2, answer: res.dropped, tolerance: 0,
      stem: [
        `A leaky bucket holds at most ${capacity} packets and lets ${rate} packet${rate > 1 ? "s" : ""} out per tick. In each tick, arriving packets enter the bucket if there is room (the rest are dropped) and then up to ${rate} leave. The bucket starts empty.`,
        table,
        "How many packets are dropped?",
      ],
      solution: [
        { table: { head: ["Tick", "Arrive", "Dropped", "Sent", "In bucket after"], rows: res.steps.map((s) => [s.t, s.arrived, s.dropped, s.sent, s.level]) } },
        `${res.dropped} packet${res.dropped === 1 ? " is" : "s are"} dropped in all.`,
      ],
      replay: query("/traffic-shaping", { k: "leaky", in: arrText, b: capacity, r: rate, mode: "shape", q: 8 }),
    };
  }
  const res = tokenBucket({ arrivals, capacity, rate, mode: "police" });
  if (!res.dropped) return null;
  return {
    topic: "traffic-shaping", type: "nat", marks: 2, answer: res.dropped, tolerance: 0,
    stem: [
      `A token bucket policer has a bucket of ${capacity} tokens, full at tick 0. From tick 1 on, ${rate} token${rate > 1 ? "s are" : " is"} added at the start of every tick (never more than ${capacity}). Each packet sent uses one token; a packet that finds no token is dropped at once.`,
      table,
      "How many packets are dropped?",
    ],
    solution: [
      { table: { head: ["Tick", "Arrive", "Sent", "Dropped", "Tokens left"], rows: res.steps.map((s) => [s.t, s.arrived, s.sent, s.dropped, s.tokens]) } },
      `${res.dropped} packet${res.dropped === 1 ? " is" : "s are"} dropped in all.`,
    ],
    replay: query("/traffic-shaping", { k: "token", in: arrText, b: capacity, r: rate, mode: "police", q: 8 }),
  };
}

// --- MAC protocols ----------------------------------------------------------------------

function macProtocols(r) {
  {
    const mode = pick(r, ["pure", "slotted"]);
    const frameBits = pick(r, [200, 500, 1000, 2000]);
    const capacity = pick(r, [100, 200, 500, 1000]) * 1e3;
    const perFrameTime = capacity / frameBits; // frames per second at full load
    const G = pick(r, [0.25, 0.5, 1, 2]);
    const offered = perFrameTime * G;
    if (!Number.isInteger(offered)) return null;
    const S = throughput(G, mode);
    const answer = round2(S * perFrameTime);
    return {
      topic: "mac-protocols", type: "nat", marks: 2, answer, tolerance: Math.max(0.5, answer * 0.005),
      stem: [`A group of stations shares a ${capacity / 1e3} kbps channel using ${mode} ALOHA and sends ${frameBits}-bit frames. Together they offer ${offered} frames per second (new frames and retransmissions, a Poisson process). What is the throughput in frames per second? Give the answer to two decimal places.`],
      solution: [
        `A frame takes ${frameBits} / ${capacity} s, so the channel carries ${perFrameTime} frames per second at most and the offered load is G = ${offered} / ${perFrameTime} = ${G} (frames per frame time).`,
        `${mode === "pure" ? "Pure" : "Slotted"} ALOHA: S = G·e^(${mode === "pure" ? "−2G" : "−G"}) = ${G} × e^(−${mode === "pure" ? 2 * G : G}) = ${S.toFixed(4)}.`,
        `Throughput = ${S.toFixed(4)} × ${perFrameTime} = ${show(answer)} frames per second.`,
      ],
      replay: query("/mac-protocols", { m: "aloha", a: mode, G, n: 5, t: 14, s: 1 }),
    };
  }
}

// --- DNS and HTTP -----------------------------------------------------------------------

function dnsHttp(r) {
  if (r() < 0.65) {
    const mode = pick(r, Object.keys(HTTP_MODES));
    const objects = int(r, 3, 12), rtt = pick(r, [10, 20, 50, 100]), parallel = int(r, 2, 5);
    const dns = Array.from({ length: int(r, 0, 3) }, () => pick(r, [5, 10, 20, 30, 40, 50]));
    const res = httpTiming({ mode, objects, rtt, tx: 0, parallel, dns });
    const how = {
      "np-serial": "non-persistent HTTP with one TCP connection at a time",
      "np-parallel": `non-persistent HTTP with up to ${parallel} parallel TCP connections`,
      "p-nopipe": "persistent HTTP without pipelining",
      "p-pipe": "persistent HTTP with pipelining",
    }[mode];
    return {
      topic: "dns-and-http", type: "nat", marks: 2, answer: res.formula.ms, tolerance: 0,
      stem: [
        `A browser fetches a web page: a base HTML file that references ${objects} small objects on the same server. The RTT to the server is ${rtt} ms and transmission times are negligible. ${dns.length ? `Before connecting, the browser needs ${dns.length} DNS round trip${dns.length > 1 ? "s" : ""} of ${dns.length > 1 ? `${dns.slice(0, -1).join(" ms, ")} ms and ${dns.at(-1)} ms` : `${dns[0]} ms`}.` : "The server's IP address is already cached."}`,
        `With ${how}, how many milliseconds pass from the start until the last object is received?`,
      ],
      solution: [
        "Opening a TCP connection costs 1 RTT, and each request and response costs another RTT.",
        `Total = ${res.formula.text} = ${res.formula.ms} ms.`,
      ],
      replay: query("/dns-and-http", { hm: mode, n: objects, rtt, tx: 0, par: parallel, dns: dns.join(" ") }),
    };
  }
  const dmode = pick(r, ["iterative", "recursive"]);
  const cache = pick(r, ["none", "tld", "answer"]);
  const name = pick(r, ["gaia.cs.umass.edu", "www.example.org", "mail.college.ac.in", "news.bbc.co.uk", "api.shop.com"]);
  const res = dnsLookup({ name, mode: dmode, cache });
  return {
    topic: "dns-and-http", type: "nat", marks: 1, answer: res.messages, tolerance: 0,
    stem: [
      `A host asks its local DNS server for the address of ${name}. The host's query to the local server is recursive; the local server resolves the name with ${dmode} queries${dmode === "recursive" ? " (each server asks the next on its behalf)" : " (it asks the root, then the TLD server, then the authoritative server itself)"}.`,
      `${cache === "none" ? "No DNS server has anything cached." : cache === "tld" ? "The local server already has the TLD server's address cached, so it does not need the root." : "The local server already has the answer cached."} How many DNS messages (queries and replies) are sent in all?`,
    ],
    solution: [
      { table: { head: ["#", "From", "To", "Message"], rows: res.msgs.map((m, i) => [i + 1, m.from, m.to, m.label]) } },
      `${res.messages} messages in all.`,
    ],
    replay: query("/dns-and-http", { q: name, dm: dmode, c: cache }),
  };
}

export const TOPICS = [
  { slug: "subnetting", subject: "cn", title: "Subnetting and VLSM", make: subnetting },
  { slug: "cidr-and-longest-prefix-match", subject: "cn", title: "CIDR and longest prefix match", make: cidr },
  { slug: "ip-fragmentation", subject: "cn", title: "IP fragmentation", make: ipFragmentation },
  { slug: "error-detection", subject: "cn", title: "CRC and Hamming codes", make: errorDetection },
  { slug: "sliding-window", subject: "cn", title: "Sliding window", make: slidingWindow },
  { slug: "routing", subject: "cn", title: "Routing", make: routing },
  { slug: "tcp-congestion-control", subject: "cn", title: "TCP congestion control", make: tcpCongestion },
  { slug: "traffic-shaping", subject: "cn", title: "Leaky and token buckets", make: trafficShaping },
  { slug: "mac-protocols", subject: "cn", title: "ALOHA and CSMA/CD", make: macProtocols },
  { slug: "dns-and-http", subject: "cn", title: "DNS and HTTP timing", make: dnsHttp },
];
