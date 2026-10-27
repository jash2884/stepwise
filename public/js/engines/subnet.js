// IPv4 subnetting: addresses as unsigned 32-bit integers.
//
// Conventions: /31 has 2 usable addresses and no broadcast (RFC 3021); /32 is a
// single host. VLSM allocates the largest requirement first, on aligned blocks.

const u32 = (n) => n >>> 0;
export const toInt = (o) => u32(((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]));
export const toOctets = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const dotted = (n) => toOctets(n).join(".");
export const maskOf = (p) => (p === 0 ? 0 : u32(0xffffffff << (32 - p)));
export const binary = (n) => toOctets(n).map((o) => o.toString(2).padStart(8, "0")).join(".");

export function parseAddress(text) {
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*(?:\/\s*(\d{1,2}))?\s*$/.exec(String(text));
  if (!m) throw new Error("Write an address like 192.168.10.77/26.");
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) throw new Error("Each part of an IPv4 address is 0 to 255.");
  const prefix = m[5] === undefined ? null : Number(m[5]);
  if (prefix !== null && prefix > 32) throw new Error("The prefix length is 0 to 32.");
  return { ip: toInt(octets), prefix };
}

export function parseMask(text) {
  const t = String(text).trim();
  if (/^\/?\d{1,2}$/.test(t)) { const p = Number(t.replace("/", "")); if (p > 32) throw new Error("The prefix length is 0 to 32."); return p; }
  const { ip } = parseAddress(t);
  const p = 32 - Math.log2(u32(~ip) + 1);
  if (!Number.isInteger(p)) throw new Error(`${t} isn't a valid subnet mask (its 1s must be contiguous).`);
  return p;
}

function classOf(first) {
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D (multicast)";
  return "E (reserved)";
}

function kind(ip) {
  const [a, b] = toOctets(ip);
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "Private (RFC 1918)";
  if (a === 127) return "Loopback";
  if (a === 169 && b === 254) return "Link-local";
  if (a >= 224 && a < 240) return "Multicast";
  return "Public";
}

export const ANALYSE_CODE = [
  "mask ← prefix ones, then 32 − prefix zeros",
  "network ← address AND mask  // clear the host bits",
  "broadcast ← network OR (NOT mask)  // set the host bits",
  "total ← 2^(32 − prefix)",
  "usable ← total − 2  // /31 → 2, /32 → 1",
  "first ← network + 1; last ← broadcast − 1",
];

export const VLSM_CODE = [
  "sort the subnets by hosts needed, largest first",
  "next ← start of the block",
  "for each subnet",
  "  size ← smallest power of 2 ≥ hosts + 2",
  "  prefix ← 32 − log2(size)",
  "  start ← next, rounded up to a multiple of size",
  "  if start + size > end of block then it doesn't fit",
  "  else allocate start … start + size − 1; next ← start + size",
];

export function analyse(ip, prefix) {
  const mask = maskOf(prefix), network = u32(ip & mask), broadcast = u32(network | ~mask);
  const total = 2 ** (32 - prefix);
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2;
  const first = prefix >= 31 ? network : network + 1, last = prefix >= 31 ? broadcast : broadcast - 1;
  const io = toOctets(ip), mo = toOctets(mask);
  const steps = io.map((o, i) => ({
    octet: i + 1,
    note: mo[i] === 255 ? `Octet ${i + 1}: mask 255 keeps it, ${o}.` : mo[i] === 0 ? `Octet ${i + 1}: mask 0 clears it, 0.` : `Octet ${i + 1}: ${o} AND ${mo[i]} = ${o.toString(2).padStart(8, "0")} AND ${mo[i].toString(2).padStart(8, "0")} = ${o & mo[i]}.`,
  }));
  // The same working as a trace through ANALYSE_CODE, one line at a time.
  const v = (extra) => ({ address: dotted(ip), prefix, ...extra });
  const hostBits = 32 - prefix;
  const trace = [
    { line: 1, row: "mask", vars: v({ mask: dotted(mask) }), note: `A /${prefix} mask is ${prefix} ones followed by ${hostBits} zeros: ${dotted(mask)}. The ones mark the network part of the address, the zeros the host part.` },
    ...steps.map((s, i) => ({ line: 2, row: "network", octet: i, vars: v({ mask: dotted(mask), octet: i + 1, "address octet": io[i], "mask octet": mo[i], "result octet": io[i] & mo[i] }), note: `${s.note} ANDing with a 1 keeps a bit; ANDing with a 0 clears it.` })),
    { line: 2, row: "network", vars: v({ mask: dotted(mask), network: dotted(network) }), note: `So the network address is ${dotted(network)}: the address with every host bit cleared. Every address in this subnet shares those first ${prefix} bits.` },
    { line: 3, row: "broadcast", vars: v({ network: dotted(network), broadcast: dotted(broadcast) }), note: prefix >= 31 ? `${prefix === 31 ? "A /31 has no broadcast address (RFC 3021)" : "A /32 is a single host"}, but setting the host bits still gives the top of the block: ${dotted(broadcast)}.` : `Set all ${hostBits} host bits to 1 to get the broadcast address, the last address in the block: ${dotted(broadcast)}.` },
    { line: 4, row: "broadcast", vars: v({ network: dotted(network), broadcast: dotted(broadcast), total }), note: `${hostBits} host bits give 2^${hostBits} = ${total.toLocaleString("en")} addresses in the block, from ${dotted(network)} to ${dotted(broadcast)}.` },
    { line: 5, row: "broadcast", vars: v({ network: dotted(network), broadcast: dotted(broadcast), total, usable }), note: prefix >= 31 ? `A /${prefix} keeps every address for hosts: ${usable} usable.` : `Two addresses are reserved (the network address and the broadcast), so ${total.toLocaleString("en")} − 2 = ${usable.toLocaleString("en")} can be given to hosts.` },
    { line: 6, row: "broadcast", done: true, vars: v({ network: dotted(network), broadcast: dotted(broadcast), usable, first: dotted(first), last: dotted(last) }), note: `Usable hosts run from ${dotted(first)} to ${dotted(last)}.` },
  ];
  return {
    ip, prefix, mask, network, broadcast, total, usable, first, last,
    wildcard: u32(~mask),
    cls: classOf(io[0]), type: kind(ip),
    steps, trace,
    broadcastNote: prefix >= 31 ? (prefix === 31 ? "A /31 is a point-to-point link: both addresses are usable and there's no broadcast." : "A /32 is a single host.") : `Broadcast = network with all ${32 - prefix} host bits set to 1.`,
  };
}

// Variable-length subnet masks: biggest requirement first, each on a block aligned to its size.
export function vlsm(base, prefix, needs) {
  const network = u32(base & maskOf(prefix));
  const end = network + 2 ** (32 - prefix);
  const order = needs.map((n, i) => ({ ...n, i })).sort((a, b) => b.hosts - a.hosts || a.i - b.i);
  let cursor = network;
  const rows = [], steps = [];
  steps.push({ line: [1, 2], vars: { block: `${dotted(network)}/${prefix}`, next: dotted(network), order: order.map((n) => n.name) }, note: `Sort by size: ${order.map((n) => `${n.name} (${n.hosts})`).join(", ")}. Placing the biggest blocks first means every later, smaller block lands on a boundary that's already aligned, so no space is wasted between them.` });
  for (const n of order) {
    if (!Number.isInteger(n.hosts) || n.hosts < 1) throw new Error(`${n.name}: hosts must be a whole number of at least 1.`);
    const bits = Math.ceil(Math.log2(n.hosts + 2));
    const p = 32 - Math.max(bits, 2), size = 2 ** (32 - p);
    const start = Math.ceil((cursor - network) / size) * size + network;
    const vars = { subnet: n.name, hosts: n.hosts, size, prefix: `/${p}`, start: dotted(start), next: dotted(cursor) };
    if (start + size > end) {
      steps.push({ line: [3, 4, 5, 6, 7], vars, note: `${n.name} needs ${n.hosts} hosts (a /${p}, ${size} addresses), but only ${end - cursor} addresses are left. The block is too small.`, failed: true });
      rows.push({ ...n, prefix: p, failed: true });
      continue;
    }
    const a = analyse(start, p);
    rows.push({ ...n, prefix: p, size, network: a.network, broadcast: a.broadcast, first: a.first, last: a.last, usable: a.usable });
    steps.push({ line: [3, 4, 5, 6, 8], vars: { ...vars, next: dotted(start + size) }, row: rows.length - 1, note: `${n.name}: ${n.hosts} hosts + network + broadcast = ${n.hosts + 2} → round up to ${size} addresses = /${p}. Allocate ${dotted(a.network)}/${p} (${dotted(a.first)} – ${dotted(a.last)}).` });
    cursor = start + size;
  }
  return { rows, steps, used: cursor - network, total: end - network };
}

export function randomAddress(r = Math.random) {
  const pools = [[10, r() * 256, r() * 256, r() * 256], [172, 16 + r() * 16, r() * 256, r() * 256], [192, 168, r() * 256, r() * 256]];
  const o = pools[Math.floor(r() * pools.length)].map(Math.floor);
  return { ip: toInt(o), prefix: 16 + Math.floor(r() * 15) };
}
