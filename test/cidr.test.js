import assert from "node:assert/strict";
import { test } from "node:test";
import { contains, lookup, LPM_CODE, parsePrefix, parsePrefixes, parseTable, randomTable, show, summarise, SUMMARY_CODE } from "../public/js/engines/cidr.js";
import { parseAddress } from "../public/js/engines/subnet.js";

const ip = (s) => parseAddress(s).ip;

// Kurose & Ross ch. 4, destination-based forwarding (longest prefix matching): 11001000 00010111 00010*** → 0,
// 11001000 00010111 00011000 → 1, 11001000 00010111 00011*** → 2, otherwise 3.
test("Kurose's longest-prefix-match table", () => {
  const t = parseTable("200.23.16.0/21 0\n200.23.24.0/24 1\n200.23.24.0/21 2\ndefault 3");
  assert.equal(lookup(t, ip("200.23.22.161")).best.iface, "0"); // 11001000 00010111 00010110 10100001
  const r = lookup(t, ip("200.23.24.170")); // 11001000 00010111 00011000 10101010
  assert.equal(r.best.iface, "1");
  assert.equal(r.matches.length, 3, "matches /24, /21 and the default; the /24 wins");
  assert.equal(lookup(t, ip("8.8.8.8")).best.iface, "3");
  assert.equal(lookup(parseTable("10.0.0.0/8 a"), ip("11.0.0.1")).best, null);
  for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= LPM_CODE.length);
  assert.throws(() => parsePrefix("200.23.16.1/21"), /host bits set/);
});

// Kurose & Ross ch. 4, route aggregation: Fly-By-Night-ISP advertises the eight /23 blocks
// 200.23.16.0/23 … 200.23.30.0/23 of its organisations as one route, 200.23.16.0/20.
test("route aggregation: eight /23s become one /20", () => {
  const list = parsePrefixes(Array.from({ length: 8 }, (_, i) => `200.23.${16 + 2 * i}.0/23`).join(" "));
  const s = summarise(list);
  assert.deepEqual(s.blocks.map(show), ["200.23.16.0/20"]);
  assert.equal(s.exact, true);
  const gap = summarise(parsePrefixes("192.168.0.0/24 192.168.1.0/24 192.168.3.0/24"));
  assert.deepEqual(gap.blocks.map(show), ["192.168.0.0/23", "192.168.3.0/24"]);
  assert.equal(show(gap.supernet), "192.168.0.0/22");
  assert.equal(gap.exact, false);
  for (const st of s.steps) for (const l of [st.line].flat()) assert.ok(l >= 1 && l <= SUMMARY_CODE.length);
});

test("fuzz: lookup agrees with brute force; summaries cover exactly the same addresses and can't merge further", () => {
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) {
    const { rows, ip: addr } = randomTable(rand);
    const best = lookup(rows, addr).best;
    const brute = rows.filter((e) => contains(e, addr)).sort((a, b) => b.len - a.len)[0];
    assert.equal(best.len, brute.len);
    // Random /24s inside one /20, so the union is easy to check address block by block.
    const picks = [...new Set(Array.from({ length: 1 + Math.floor(rand() * 12) }, () => Math.floor(rand() * 16)))];
    const s = summarise(parsePrefixes(picks.map((k) => `10.1.${16 + k}.0/24`).join(" ")));
    for (let k = 0; k < 16; k++) {
      const inSummary = s.blocks.some((b) => contains(b, ip(`10.1.${16 + k}.9`)));
      assert.equal(inSummary, picks.includes(k), `10.1.${16 + k}.0 ${s.blocks.map(show)}`);
    }
    for (const a of s.blocks) for (const b of s.blocks) if (a !== b) assert.ok(!(a.len === b.len && (a.net ^ b.net) >>> 0 === 2 ** (32 - a.len) && Math.min(a.net, b.net) % 2 ** (33 - a.len) === 0), "no mergeable pair left");
    for (const b of s.blocks) assert.ok(contains(s.supernet, b.net));
  }
});
