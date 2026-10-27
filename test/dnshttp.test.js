import assert from "node:assert/strict";
import { test } from "node:test";
import { DNS_CODE, dnsLookup, HTTP_CODE, HTTP_MODES, httpTiming, parseName, totalFormula } from "../public/js/engines/dnshttp.js";

// Kurose & Ross ch. 2 (DNS), the iterative and recursive query figures: resolving gaia.cs.umass.edu from cse.nyu.edu
// takes eight DNS messages, whether the local server queries iteratively or recursively.
test("DNS: eight messages without caching, fewer with it", () => {
  for (const mode of ["iterative", "recursive"]) {
    assert.equal(dnsLookup({ mode }).messages, 8);
    assert.equal(dnsLookup({ mode, cache: "tld" }).messages, 6);
    assert.equal(dnsLookup({ mode, cache: "answer" }).messages, 2);
  }
  const it = dnsLookup({ mode: "iterative" });
  assert.deepEqual(it.msgs.map((m) => `${m.from}>${m.to}`), ["host>local", "local>root", "root>local", "local>tld", "tld>local", "local>auth", "auth>local", "local>host"]);
  const rec = dnsLookup({ mode: "recursive" });
  assert.deepEqual(rec.msgs.map((m) => `${m.from}>${m.to}`), ["host>local", "local>root", "root>tld", "tld>auth", "auth>tld", "tld>root", "root>local", "local>host"]);
  assert.equal(it.steps.at(-1).vars.cache.length, 3, "local server caches the TLD, domain and host records");
  for (const r of [it, rec]) for (const s of r.steps) if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= DNS_CODE.iterative.length);
  assert.throws(() => parseName("localhost"), /full domain name/);
  assert.equal(parseName("www.example.co.uk").domain, "co.uk");
});

// Kurose & Ross, chapter 2 problems P7–P8: n DNS lookups (RTT₁ … RTTₙ), RTT₀ to the server,
// a base file referencing 8 small objects. Answers: non-persistent 18 RTT₀, 5 parallel
// connections 6 RTT₀, persistent with pipelining 3 RTT₀ and without 10 RTT₀, plus the DNS time.
test("HTTP response times match Kurose's P7–P8", () => {
  const dns = [20, 30, 50], R = 100;
  const t = (mode, extra = {}) => httpTiming({ mode, objects: 8, rtt: R, dns, ...extra }).total;
  assert.equal(t("np-serial"), 100 + 18 * R);
  assert.equal(t("np-parallel", { parallel: 5 }), 100 + 6 * R);
  assert.equal(t("p-nopipe"), 100 + 10 * R);
  assert.equal(t("p-pipe"), 100 + 3 * R);
  assert.equal(httpTiming({ mode: "np-serial", objects: 0, rtt: R }).total, 2 * R);
});

test("fuzz: the drawn timeline always ends exactly when the formula says, and the modes rank as expected", () => {
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) {
    const objects = Math.floor(rand() * 15), rtt = 10 + Math.floor(rand() * 200), tx = rand() < 0.5 ? 0 : Math.floor(rand() * 50), parallel = 1 + Math.floor(rand() * 8);
    const dns = Array.from({ length: Math.floor(rand() * 3) }, () => Math.floor(rand() * 80));
    const totals = {};
    for (const mode of Object.keys(HTTP_MODES)) {
      const r = httpTiming({ mode, objects, rtt, tx, parallel, dns });
      const f = totalFormula({ mode, objects, rtt, tx, parallel, dnsTotal: dns.reduce((a, b) => a + b, 0) });
      assert.ok(Math.abs(r.total - f.ms) < 1e-6, `${mode}: ${r.total} vs ${f.ms}`);
      for (const s of r.steps) if (s.line != null) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= HTTP_CODE.length);
      for (const m of r.msgs) assert.ok(m.t1 > m.t0 && m.step < r.steps.length);
      totals[mode] = r.total;
    }
    assert.ok(totals["p-pipe"] <= totals["p-nopipe"] + 1e-9);
    assert.ok(totals["p-nopipe"] <= totals["np-serial"] + 1e-9);
    assert.ok(totals["np-parallel"] <= totals["np-serial"] + 1e-9);
  }
});
