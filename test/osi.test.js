import assert from "node:assert/strict";
import { test } from "node:test";
import { codeFor, encapsulate, headerShare, MODELS, stackOf } from "../public/js/engines/osi.js";
import { modulesOf, ROADMAPS } from "../public/js/roadmaps.js";

// Kurose & Ross: TCP over IPv4 on Ethernet, MTU 1500, so MSS = 1500 − 20 − 20 = 1460.
test("TCP: segments sized by the MSS, 18 bytes of Ethernet per frame", () => {
  const s = encapsulate({ msg: 4000 }).summary;
  assert.equal(s.mss, 1460);
  assert.deepEqual(s.tpdus, [1480, 1480, 1100]);
  assert.deepEqual(s.packets1, [1500, 1500, 1120]);
  assert.deepEqual(s.frames1, [1518, 1518, 1138]);
  assert.equal(s.bytes1, 4174);
  assert.equal(s.overhead, 174); // 3 × (20 + 20 + 18)
  assert.ok(Math.abs(s.efficiency - 4000 / 4174) < 1e-12);
  assert.equal(s.routerFrag, 0);
});

test("UDP: one datagram, fragmented by IPv4 like the 4000-byte textbook example", () => {
  // 4000 data + 8 UDP = 4008; + 20 IP = 4028 bytes, MTU 1500: data 1480, 1480, 1048.
  const s = encapsulate({ msg: 4000, transport: "udp" }).summary;
  assert.deepEqual(s.tpdus, [4008]);
  assert.equal(s.sourceFrag, true);
  assert.deepEqual(s.packets1, [1500, 1500, 1068]);
  assert.equal(s.bytes1, 1518 + 1518 + 1086);
  assert.equal(s.overhead, 8 + 3 * 20 + 3 * 18);
});

test("a 1-byte message makes a minimum 64-byte Ethernet frame", () => {
  const s = encapsulate({ msg: 1 }).summary;
  assert.deepEqual(s.packets1, [41]);
  assert.equal(s.padding, 5);
  assert.deepEqual(s.frames1, [64]);
  assert.deepEqual(encapsulate({ msg: 1, preamble: true }).summary.frames1, [72]);
});

test("the router fragments for a smaller MTU (IPv4); IPv6 uses the path MTU instead", () => {
  const v4 = encapsulate({ msg: 4000, mtu2: 576 }).summary;
  // 1500 → data 1480 in pieces of ⌊556 / 8⌋ × 8 = 552: 552, 552, 376; the 1120 packet → 552, 548.
  assert.deepEqual(v4.packets2, [572, 572, 396, 572, 572, 396, 572, 568]);
  assert.equal(v4.routerFrag, 3);
  assert.ok(v4.bytes2 > v4.bytes1);
  const v6 = encapsulate({ msg: 4000, ip: 6, mtu2: 1280 }).summary;
  assert.equal(v6.pmtu, 1280);
  assert.equal(v6.mss, 1280 - 40 - 20);
  assert.deepEqual(v6.packets1, v6.packets2);
  assert.equal(v6.routerFrag, 0);
  // IPv6 UDP fragmented by the sender: 40 + 8 bytes of header per fragment.
  assert.deepEqual(encapsulate({ msg: 3000, ip: 6, transport: "udp" }).summary.packets1, [1496, 1496, 160]);
});

test("a smaller MTU always costs more overhead", () => {
  let last = Infinity;
  for (const mtu of [9000, 1500, 1006, 576]) {
    const e = encapsulate({ msg: 20000, mtu, mtu2: mtu }).summary.efficiency;
    assert.ok(e < last, `MTU ${mtu}`);
    last = e;
  }
});

// Tanenbaum, ch. 1: n layers each add an h-byte header to an M-byte message;
// the fraction of bandwidth spent on headers is hn / (M + hn).
test("n layers, h bytes each", () => {
  const r = encapsulate({ model: "generic", msg: 1000, n: 5, h: 20 });
  assert.equal(r.summary.bytes1, 1100);
  assert.ok(Math.abs(r.summary.headerShare - 100 / 1100) < 1e-12);
  assert.equal(headerShare(1000, 5, 20), r.summary.headerShare);
  assert.equal(r.steps.filter((s) => s.at.where === "sender").length, 6);
  assert.deepEqual(r.steps.at(-1).pdu.map((b) => b.label), ["Message"]);
});

test("stacks, router and steps are consistent", () => {
  assert.deepEqual(stackOf("tcpip").map((l) => l.num), [5, 4, 3, 2, 1]);
  assert.equal(stackOf("osi").length, 7);
  for (const model of Object.keys(MODELS)) {
    for (const transport of ["tcp", "udp"]) {
      const r = encapsulate({ model, transport, msg: 3000, mtu2: 1006 });
      const lines = codeFor(model).length;
      for (const s of r.steps) {
        for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= lines, `${model}: line ${l}`);
        assert.ok(s.note && !/[—–]/.test(s.note), s.note);
        assert.ok(r.stack.some((L) => L.id === s.at.layer), `${model}: layer ${s.at.layer}`);
      }
      assert.ok(r.steps.at(-1).done);
      if (model !== "generic") {
        // A router only ever touches layers 1 to 3.
        for (const s of r.steps.filter((x) => x.at.where === "router")) assert.ok(["network", "link", "physical"].includes(s.at.layer));
        // The message arrives whole.
        assert.deepEqual(r.steps.at(-1).pdu, [{ layer: "msg", label: "Message", bytes: 3000, kind: "data" }]);
      }
    }
  }
});

test("validation", () => {
  assert.throws(() => encapsulate({ msg: 0 }), /Message size/);
  assert.throws(() => encapsulate({ ip: 6, mtu: 1000 }), /MTU of link 1/);
  assert.throws(() => encapsulate({ transport: "udp", msg: 70000 }), /UDP datagram/);
  assert.throws(() => encapsulate({ model: "nope" }), /Unknown model/);
});

test("roadmap presets for this tool use real models", () => {
  for (const r of ROADMAPS) for (const { module: m } of modulesOf(r)) for (const t of m.tryIt ?? []) {
    if (t.tool !== "osi-encapsulation") continue;
    const q = new URLSearchParams(t.query);
    if (q.has("model")) assert.ok(MODELS[q.get("model")], `${m.id}: model ${q.get("model")}`);
  }
});
