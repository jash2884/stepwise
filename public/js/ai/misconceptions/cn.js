// Computer networks misconceptions: subnetting, CIDR, CRC and Hamming codes,
// and sliding window protocols.
import { analyse, dotted, maskOf, vlsm } from "../../engines/subnet.js";
import { contains, show as prefixText, summarise } from "../../engines/cidr.js";
import { divide, crc } from "../../engines/errors.js";
import { efficiency, simulate } from "../../engines/sliding.js";
import { anyOf, define, num, opt, round2 } from "./kit.js";

// --- Subnetting -------------------------------------------------------------------------

const hostBits = (g) => 32 - g.prefix;
const blockText = (row) => `${dotted(row.network)}/${row.prefix}`;
// VLSM in the order listed (no sorting by size), each block aligned to its size.
function vlsmListed(g) {
  let cursor = g.base;
  const rows = [];
  for (const n of g.needs) {
    const bits = Math.max(2, Math.ceil(Math.log2(n.hosts + 2))), size = 2 ** bits;
    const start = Math.ceil((cursor - g.base) / size) * size + g.base;
    rows.push({ name: n.name, network: start, prefix: 32 - bits });
    cursor = start + size;
  }
  return rows;
}
const subnetting = define("subnetting", [
  {
    id: "forgot-reserved",
    label: "forgot that the network and broadcast addresses can't be given to hosts",
    predict: (q) => (q.given.variant === "hosts" ? 2 ** hostBits(q.given) : null),
    explain: (q) => `A /${q.given.prefix} has 2^${hostBits(q.given)} = ${2 ** hostBits(q.given)} addresses, but the first is the network address and the last the broadcast address, so ${q.answer} are usable.`,
  },
  {
    id: "one-reserved",
    label: "took off only one reserved address",
    predict: (q) => (q.given.variant === "hosts" ? 2 ** hostBits(q.given) - 1 : null),
    explain: (q) => `Two addresses are reserved, not one: the network address (all host bits 0) and the broadcast (all host bits 1). 2^${hostBits(q.given)} − 2 = ${q.answer}.`,
  },
  {
    id: "host-bits-off-by-one",
    label: "counted the host bits one out",
    predict: (q) => (q.given.variant === "hosts" ? anyOf([2 ** (hostBits(q.given) - 1) - 2, 2 ** (hostBits(q.given) + 1) - 2]) : null),
    explain: (q) => `The mask has ${q.given.prefix} one bits, so 32 − ${q.given.prefix} = ${hostBits(q.given)} bits are left for hosts: 2^${hostBits(q.given)} − 2 = ${q.answer}.`,
  },
  {
    id: "last-usable",
    label: "gave the last usable host instead of the broadcast address",
    predict: (q) => (q.given.variant === "broadcast" ? opt(q, dotted(analyse(q.given.ip, q.given.prefix).last)) : null),
    explain: (q) => `The broadcast address has every host bit set to 1: ${dotted(analyse(q.given.ip, q.given.prefix).broadcast)}. The address just below it is the last one a host can use.`,
  },
  {
    id: "network-address",
    label: "gave the network address instead of the broadcast address",
    predict: (q) => (q.given.variant === "broadcast" ? opt(q, dotted(analyse(q.given.ip, q.given.prefix).network)) : null),
    explain: () => "ANDing with the mask (host bits all 0) gives the network address. The broadcast address sets every host bit to 1 instead.",
  },
  {
    id: "prefix-off-by-one",
    label: "worked with a prefix one bit too long or too short",
    predict: (q) => (q.given.variant === "broadcast" ? anyOf([opt(q, dotted(analyse(q.given.ip, q.given.prefix + 1).broadcast)), opt(q, dotted(analyse(q.given.ip, q.given.prefix - 1).broadcast))]) : null),
    explain: (q) => `Count the host bits from the prefix exactly: a /${q.given.prefix} leaves ${32 - q.given.prefix} host bits, so the block is ${2 ** (32 - q.given.prefix)} addresses long.`,
  },
  {
    id: "vlsm-listed-order",
    label: "allocated the subnets in the order listed instead of largest first",
    predict: (q) => {
      if (q.given.variant !== "vlsm") return null;
      const row = vlsmListed(q.given).find((x) => x.name === q.given.target);
      return row ? opt(q, blockText(row)) : null;
    },
    explain: () => "VLSM gives out the largest block first, so every later, smaller block starts on an aligned boundary with no gaps. Going in the listed order moves the blocks.",
  },
]);

// --- CIDR and longest prefix match ----------------------------------------------------------

const iface = (e) => `Interface ${e.iface}`;
const cidr = define("cidr-and-longest-prefix-match", [
  {
    id: "first-match",
    label: "took the first matching entry instead of the longest prefix",
    predict: (q) => {
      if (q.given.variant !== "lpm") return null;
      const e = q.given.rows.find((x) => contains(x, q.given.ip));
      return e ? opt(q, iface(e)) : null;
    },
    explain: () => "A router compares every entry and forwards on the one with the longest matching prefix, the most specific route, wherever it is in the table.",
  },
  {
    id: "shortest-match",
    label: "took the shortest matching prefix",
    predict: (q) => {
      if (q.given.variant !== "lpm") return null;
      const m = q.given.rows.filter((x) => contains(x, q.given.ip)).sort((a, b) => a.len - b.len)[0];
      return m ? opt(q, iface(m)) : null;
    },
    explain: () => "Longer prefixes are more specific, so the longest match wins. A short prefix (or the default route) is only used when nothing more specific matches.",
  },
  {
    id: "log2-of-count",
    label: "shortened the prefix by log₂ of the number of blocks without checking alignment",
    predict: (q) => {
      if (q.given.variant !== "sum") return null;
      const p = q.given.prefixes, len = p[0].len - Math.ceil(Math.log2(p.length));
      return opt(q, prefixText({ net: (p[0].net & maskOf(len)) >>> 0, len }));
    },
    explain: (q) => (q.given.variant === "sum" ? `Write the first and last addresses in binary and count the bits they share. ${q.given.prefixes.length} blocks only fit in a /${q.given.prefixes[0].len - Math.ceil(Math.log2(q.given.prefixes.length))} when they start on a matching boundary; here the shared bits give ${prefixText(summarise(q.given.prefixes).supernet)}.` : ""),
  },
]);

// --- CRC and Hamming codes ------------------------------------------------------------------

const errors = define("error-detection", [
  {
    id: "crc-no-padding",
    label: "divided without appending the zeros first",
    predict: (q) => (q.given.variant === "crc" ? opt(q, divide(q.given.data, q.given.gen).remainder.padStart(q.given.gen.length - 1, "0")) : null),
    explain: (q) => (q.given.variant === "crc" ? `Before dividing, append ${q.given.gen.length - 1} zeros (one fewer than the generator's ${q.given.gen.length} bits): ${crc(q.given.data, q.given.gen).padded}. The remainder of that is the CRC.` : ""),
  },
  {
    id: "crc-reversed",
    label: "wrote the remainder bits in reverse order",
    predict: (q) => (q.given.variant === "crc" ? opt(q, [...crc(q.given.data, q.given.gen).remainder].reverse().join("")) : null),
    explain: () => "The remainder is read from the last row of the division, left to right, and appended to the data as it is.",
  },
  {
    id: "syndrome-reversed",
    label: "read the syndrome bits in the wrong order",
    predict: (q) => {
      if (q.given.variant !== "hamming" || !q.answer) return null;
      const k = Math.floor(Math.log2(q.given.n)) + 1;
      const rev = parseInt(q.answer.toString(2).padStart(k, "0").split("").reverse().join(""), 2);
      return rev === q.answer || rev > q.given.n ? null : rev;
    },
    explain: (q) => `The syndrome is the sum of the failing checks' positions: P1 is worth 1, P2 is worth 2, P4 is worth 4 and so on. Here it adds up to ${q.answer}.`,
  },
  {
    id: "numbered-from-right",
    label: "numbered the bit positions from the right",
    predict: (q) => (q.given.variant === "hamming" && q.answer ? q.given.n + 1 - q.answer : null),
    explain: (q) => `Positions are numbered from 1 at the left here, so the parity bits sit at 1, 2, 4, 8 from the left. Bit ${q.answer} from the left is bit ${q.given.n + 1 - q.answer} from the right.`,
  },
]);

// --- Sliding window -------------------------------------------------------------------------

const eff = (g) => efficiency({ bandwidth: g.bwMbps * 1e6, frameBits: g.frameBits, propagation: g.tpMs / 1000, window: g.W });
const sliding = define("sliding-window", [
  {
    id: "one-way-only",
    label: "used the one-way delay instead of the round trip (W / (1 + a))",
    predict: (q) => (q.given.kind === "util" ? round2(Math.min(1, q.given.W / (1 + eff(q.given).a)) * 100) : null),
    explain: (q) => `The sender waits a full round trip for the first acknowledgement: the cycle is Tt + 2Tp, so utilisation = W / (1 + 2a) = ${num(q.answer)}%.`,
  },
  {
    id: "ignored-window",
    label: "worked out stop-and-wait utilisation, ignoring the window",
    predict: (q) => (q.given.kind === "util" ? round2(100 / (1 + 2 * eff(q.given).a)) : null),
    explain: (q) => `With a window of ${q.given.W} frames the sender sends ${q.given.W} frames per round trip, not one, so the stop-and-wait figure is multiplied by ${q.given.W}: ${num(q.answer)}%.`,
  },
  {
    id: "gbn-rule-for-sr",
    label: "used the Go-Back-N rule (W ≤ 2ᵐ − 1) for Selective Repeat",
    predict: (q) => (q.given.kind === "bits" && q.given.protocol === "sr" ? Math.ceil(Math.log2(q.given.W + 1)) : null),
    explain: (q) => `Selective Repeat needs the sender and receiver windows together to fit: 2W ≤ 2ᵐ, so 2ᵐ ≥ ${2 * q.given.W} and m = ${q.answer}.`,
  },
  {
    id: "sr-rule-for-gbn",
    label: "used the Selective Repeat rule (2W ≤ 2ᵐ) for Go-Back-N",
    predict: (q) => (q.given.kind === "bits" && q.given.protocol === "gbn" ? Math.ceil(Math.log2(2 * q.given.W)) : null),
    explain: (q) => `Go-Back-N's receiver accepts one frame at a time, so it only needs W ≤ 2ᵐ − 1: 2ᵐ ≥ ${q.given.W + 1}, m = ${q.answer}.`,
  },
  {
    id: "window-equals-space",
    label: "let the window use every sequence number (W ≤ 2ᵐ)",
    predict: (q) => (q.given.kind === "bits" && q.given.protocol === "gbn" ? Math.ceil(Math.log2(q.given.W)) : null),
    explain: () => "With W = 2ᵐ, the receiver can't tell a new frame from a retransmission of the old one with the same number. Go-Back-N needs W ≤ 2ᵐ − 1.",
  },
  {
    id: "protocol-swapped",
    label: "resent frames the other protocol's way",
    predict: (q) => {
      const g = q.given;
      if (g.kind !== "sim") return null;
      try { return simulate({ protocol: g.protocol === "gbn" ? "sr" : "gbn", frames: g.frames, window: g.window, everyKth: g.k }).framesSent; } catch { return null; }
    },
    explain: (q) => (q.given.protocol === "gbn" ? "Go-Back-N resends every outstanding frame after a timeout, not just the lost one, so it sends more." : "Selective Repeat resends only the frame that timed out; the receiver keeps the later ones."),
  },
]);

export const CN = [...subnetting, ...cidr, ...errors, ...sliding];
