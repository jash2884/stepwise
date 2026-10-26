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
  return {
    ip, prefix, mask, network, broadcast, total, usable, first, last,
    wildcard: u32(~mask),
    cls: classOf(io[0]), type: kind(ip),
    steps,
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
  for (const n of order) {
    if (!Number.isInteger(n.hosts) || n.hosts < 1) throw new Error(`${n.name}: hosts must be a whole number of at least 1.`);
    const bits = Math.ceil(Math.log2(n.hosts + 2));
    const p = 32 - Math.max(bits, 2), size = 2 ** (32 - p);
    const start = Math.ceil((cursor - network) / size) * size + network;
    if (start + size > end) {
      steps.push({ note: `${n.name} needs ${n.hosts} hosts (a /${p}, ${size} addresses), but only ${end - cursor} addresses are left. The block is too small.`, failed: true });
      rows.push({ ...n, prefix: p, failed: true });
      continue;
    }
    const a = analyse(start, p);
    rows.push({ ...n, prefix: p, size, network: a.network, broadcast: a.broadcast, first: a.first, last: a.last, usable: a.usable });
    steps.push({ note: `${n.name}: ${n.hosts} hosts + network + broadcast = ${n.hosts + 2} → round up to ${size} addresses = /${p}. Allocate ${dotted(a.network)}/${p} (${dotted(a.first)} – ${dotted(a.last)}).` });
    cursor = start + size;
  }
  return { rows, steps, used: cursor - network, total: end - network };
}

export function randomAddress(r = Math.random) {
  const pools = [[10, r() * 256, r() * 256, r() * 256], [172, 16 + r() * 16, r() * 256, r() * 256], [192, 168, r() * 256, r() * 256]];
  const o = pools[Math.floor(r() * pools.length)].map(Math.floor);
  return { ip: toInt(o), prefix: 16 + Math.floor(r() * 15) };
}
