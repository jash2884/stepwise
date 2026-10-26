import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, dotted, parseAddress, parseMask, vlsm } from "../public/js/engines/subnet.js";

const of = (s) => { const { ip, prefix } = parseAddress(s); return analyse(ip, prefix); };

test("a /26 inside a /24", () => {
  const r = of("192.168.10.77/26");
  assert.equal(dotted(r.network), "192.168.10.64");
  assert.equal(dotted(r.broadcast), "192.168.10.127");
  assert.equal(dotted(r.mask), "255.255.255.192");
  assert.equal([dotted(r.first), dotted(r.last), r.usable].join(" "), "192.168.10.65 192.168.10.126 62");
  assert.equal(r.cls, "C");
  assert.equal(r.type, "Private (RFC 1918)");
  assert.match(r.steps[3].note, /77 AND 192 = .* = 64/);
});

test("a /20 crossing octets, plus /31 and /32", () => {
  const r = of("172.16.5.4/20");
  assert.equal([dotted(r.network), dotted(r.broadcast), r.usable].join(" "), "172.16.0.0 172.16.15.255 4094");
  assert.equal(dotted(r.wildcard), "0.0.15.255");
  assert.equal(of("10.0.0.1/31").usable, 2);
  assert.equal(of("8.8.8.8/32").usable, 1);
  assert.equal(of("8.8.8.8/32").type, "Public");
});

test("masks in either notation", () => {
  assert.equal(parseMask("255.255.255.240"), 28);
  assert.equal(parseMask("/19"), 19);
  assert.throws(() => parseMask("255.0.255.0"), /contiguous/);
  assert.throws(() => parseAddress("300.1.1.1/24"), /0 to 255/);
});

test("VLSM: largest first, aligned blocks", () => {
  const { ip, prefix } = parseAddress("192.168.1.0/24");
  const r = vlsm(ip, prefix, [{ name: "D", hosts: 2 }, { name: "A", hosts: 100 }, { name: "C", hosts: 20 }, { name: "B", hosts: 50 }]);
  assert.deepEqual(r.rows.map((x) => `${x.name} ${dotted(x.network)}/${x.prefix}`), ["A 192.168.1.0/25", "B 192.168.1.128/26", "C 192.168.1.192/27", "D 192.168.1.224/30"]);
  const tooBig = vlsm(ip, prefix, [{ name: "X", hosts: 200 }, { name: "Y", hosts: 100 }]);
  assert.ok(tooBig.rows[1].failed);
});
