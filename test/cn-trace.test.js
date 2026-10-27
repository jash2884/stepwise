// Computer networks: every engine step names valid pseudocode lines and carries
// its variables, plus checks for flooding, CUBIC and the TCP handshake.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handshake, HANDSHAKE_CODE, simulate as congestion, VARIANTS } from "../public/js/engines/congestion.js";
import { checksum, CHECKSUM_CODE, crc, CRC_CODE, HAMMING_CHECK_CODE, HAMMING_ENCODE_CODE, hammingCheck, hammingEncode, randomBits } from "../public/js/engines/errors.js";
import { fragment, FRAGMENT_CODE } from "../public/js/engines/fragment.js";
import { dijkstra, DIJKSTRA_CODE, distanceVector, DV_CODE, EXAMPLES, flood, FLOOD_CODE, parseNetwork, randomNetwork } from "../public/js/engines/routing.js";
import { PROTOCOLS, simulate as sliding } from "../public/js/engines/sliding.js";
import { analyse, ANALYSE_CODE, randomAddress, vlsm, VLSM_CODE } from "../public/js/engines/subnet.js";

let seed = 777;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const traced = (steps, code, what, { everyHasLine = false } = {}) => {
  for (const s of steps) {
    if (s.line == null) { assert.ok(!everyHasLine, `${what}: missing line`); continue; }
    for (const l of [s.line].flat()) assert.ok(Number.isInteger(l) && l >= 1 && l <= code.length, `${what}: line ${l}`);
    assert.equal(typeof s.vars, "object", `${what}: vars`);
    assert.ok((s.note ?? s.notes?.join(" ")).length > 10, `${what}: note`);
  }
};

test("every CN engine step has a valid line, vars and a note", () => {
  for (let k = 0; k < 120; k++) {
    const { ip, prefix } = randomAddress(rand);
    traced(analyse(ip, prefix).trace, ANALYSE_CODE, "subnet", { everyHasLine: true });
    traced(vlsm(ip, 22, [{ name: "A", hosts: 1 + Math.floor(rand() * 200) }, { name: "B", hosts: 1 + Math.floor(rand() * 60) }]).steps, VLSM_CODE, "vlsm", { everyHasLine: true });
    for (const protocol of Object.keys(PROTOCOLS)) {
      try { traced(sliding({ protocol, frames: 2 + Math.floor(rand() * 6), window: 1 + Math.floor(rand() * 4), losses: new Set([`F${Math.floor(rand() * 3)}#1`, `A${Math.floor(rand() * 3)}#1`]) }).ticks, PROTOCOLS[protocol].code, protocol); } catch (e) { assert.ok(e.livelock); }
    }
    const g = parseNetwork(randomNetwork(rand));
    traced(dijkstra(g, g.nodes[0]).steps, DIJKSTRA_CODE, "dijkstra", { everyHasLine: true });
    traced(distanceVector(g).rounds, DV_CODE, "dv", { everyHasLine: true });
    traced(flood(g, g.nodes[0]).steps, FLOOD_CODE, "flood", { everyHasLine: true });
    for (const variant of Object.keys(VARIANTS)) traced(congestion({ ssthresh: 2 + Math.floor(rand() * 30), rounds: 30, events: [{ round: 5 + Math.floor(rand() * 10), type: rand() < 0.5 ? "timeout" : "dupack" }], variant }).series, VARIANTS[variant].code, variant, { everyHasLine: true });
    const data = randomBits(rand, 4 + Math.floor(rand() * 10));
    traced(crc(data, "10011").steps, CRC_CODE, "crc", { everyHasLine: true });
    traced(hammingEncode(data).steps, HAMMING_ENCODE_CODE, "hamming", { everyHasLine: true });
    traced(hammingCheck(hammingEncode(data).codeword).steps, HAMMING_CHECK_CODE, "hamming check", { everyHasLine: true });
    traced(checksum(`${data.padStart(16, "0")} 1010101010101010`).steps, CHECKSUM_CODE, "checksum", { everyHasLine: true });
    traced(fragment(100 + Math.floor(rand() * 5000), 68 + Math.floor(rand() * 1500)).steps, FRAGMENT_CODE, "fragment", { everyHasLine: true });
  }
  traced(handshake({ bytes: 100, reply: 50 }).steps, HANDSHAKE_CODE, "handshake");
});

test("Dijkstra's finer steps still start with 'Visit U' and relax every edge once per visit", () => {
  const g = parseNetwork(EXAMPLES.kurose.text);
  const r = dijkstra(g, "U");
  assert.match(r.steps[1].note, /^Visit U/);
  assert.ok(r.steps.at(-1).final);
  // u's neighbours: V (2), X (1), W (5) → three checks right after visiting U.
  assert.deepEqual(r.steps.slice(2, 5).map((s) => s.edge.join("")), ["UV", "UW", "UX"]);
});

test("flooding: every reachable router stores the LSP once, at its hop distance; 2E − (N − 1) transmissions", () => {
  for (let k = 0; k < 200; k++) {
    const g = parseNetwork(randomNetwork(rand));
    const src = g.nodes[Math.floor(rand() * g.nodes.length)];
    const f = flood(g, src);
    assert.deepEqual([...f.reached].sort(), g.nodes);
    assert.equal(f.transmissions, 2 * g.links.length - (g.nodes.length - 1));
    assert.equal(f.duplicates, f.transmissions - (g.nodes.length - 1));
    // Hop distance by breadth-first search.
    const hops = { [src]: 0 }, queue = [src];
    while (queue.length) { const x = queue.shift(); for (const l of g.links) { const y = l.a === x ? l.b : l.b === x ? l.a : null; if (y && hops[y] === undefined) { hops[y] = hops[x] + 1; queue.push(y); } } }
    assert.deepEqual(f.arrivedAt, hops);
  }
});

// RFC 9438 §4.2: W(t) = C(t − K)³ + Wmax with K = ∛(Wmax(1 − β)/C), β = 0.7, C = 0.4.
test("CUBIC: cut to 0.7·W on 3 dup ACKs, regain Wmax at t = K, then grow past it", () => {
  const r = congestion({ ssthresh: 64, rounds: 60, events: [{ round: 8, type: "dupack" }], variant: "cubic", rtt: 0.2 });
  const cw = r.series.map((p) => p.cwnd);
  assert.deepEqual(cw.slice(0, 8), [1, 2, 4, 8, 16, 32, 64, 65]);
  assert.equal(cw[8], Math.floor(0.7 * 65));
  const K = Math.cbrt((65 * 0.3) / 0.4);
  const kRound = 8 + Math.ceil(K / 0.2);
  assert.ok(Math.abs(cw[kRound] - 65) <= 1, `cwnd ${cw[kRound]} near Wmax at t ≈ K`);
  assert.ok(cw.at(-1) > 65 + 5, "convex growth beyond Wmax");
  for (let i = 9; i < cw.length; i++) assert.ok(cw[i] >= cw[i - 1], "never shrinks without a loss");
  // A timeout still resets to 1.
  assert.equal(congestion({ ssthresh: 16, rounds: 12, events: [{ round: 6, type: "timeout" }], variant: "cubic" }).series[6].cwnd, 1);
});

// Kurose & Ross ch. 3 (TCP connection management): SYN seq = client_isn; SYNACK ack = client_isn + 1; the ACK carries
// server_isn + 1. Data and FIN numbering follow from SYN and FIN using one sequence number each.
test("three-way handshake and teardown numbers", () => {
  const r = handshake({ clientIsn: 42, serverIsn: 79, bytes: 10 });
  const labels = r.msgs.map((m) => m.label);
  assert.deepEqual(labels.slice(0, 3), ["SYN seq=42", "SYN+ACK seq=79 ack=43", "ACK seq=43 ack=80"]);
  assert.equal(labels[3], "ACK seq=43 ack=80 (10 B)");
  assert.equal(labels[4], "ACK seq=80 ack=53");
  assert.deepEqual(labels.slice(5), ["FIN seq=53 ack=80", "ACK seq=80 ack=54", "FIN seq=80 ack=54", "ACK seq=54 ack=81"]);
  assert.deepEqual(r.marks.filter((m) => m.lane === "client").map((m) => m.text), ["CLOSED", "SYN_SENT", "ESTABLISHED", "FIN_WAIT_1", "FIN_WAIT_2", "TIME_WAIT", "2·MSL → CLOSED"]);
  assert.equal(handshake().segments, 7);
  assert.throws(() => handshake({ clientIsn: -1 }), /Client ISN/);
});
