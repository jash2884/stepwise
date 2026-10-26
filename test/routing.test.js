import assert from "node:assert/strict";
import { test } from "node:test";
import { dijkstra, distanceVector, EXAMPLES, parseNetwork } from "../public/js/engines/routing.js";

test("Kurose's link-state example: least-cost paths from u", () => {
  const g = parseNetwork(EXAMPLES.kurose.text);
  const r = dijkstra(g, "U");
  assert.deepEqual(r.dist, { U: 0, V: 2, W: 3, X: 1, Y: 2, Z: 4 });
  assert.deepEqual(r.table.find((t) => t.dest === "Z").path, ["U", "X", "Y", "Z"]);
  assert.equal(r.table.find((t) => t.dest === "W").next, "X");
  assert.match(r.steps[1].note, /Visit U/);
});

test("distance vector converges to the same costs as Dijkstra", () => {
  const g = parseNetwork(EXAMPLES.kurose.text);
  const dv = distanceVector(g);
  const last = dv.rounds.at(-1).vectors;
  for (const x of g.nodes) {
    const d = dijkstra(g, x).dist;
    for (const y of g.nodes) assert.equal(last[x][y].cost, d[y], `${x}→${y}`);
  }
});

test("count-to-infinity: slow without poisoned reverse, fast with it", () => {
  const g = parseNetwork(EXAMPLES.count.text);
  const plain = distanceVector(g, { change: EXAMPLES.count.change });
  const poisoned = distanceVector(g, { change: EXAMPLES.count.change, poison: true });
  const final = (r) => r.rounds.at(-1).vectors;
  for (const r of [plain, poisoned]) {
    assert.equal(r.finalStable, true);
    assert.equal(final(r).Y.X.cost, 51);
    assert.equal(final(r).Z.X.cost, 50);
  }
  const roundsAfter = (r) => r.settledAt - r.changedAt;
  assert.ok(roundsAfter(plain) > 20, `plain took ${roundsAfter(plain)} rounds`);
  assert.ok(roundsAfter(poisoned) <= 3, `poisoned took ${roundsAfter(poisoned)} rounds`);
});

test("parsing", () => {
  assert.throws(() => parseNetwork("A-A 3"), /itself/);
  assert.throws(() => parseNetwork("A-B 3\nB-A 4"), /twice/);
  assert.throws(() => parseNetwork("A to B"), /Can't read/);
  assert.deepEqual(parseNetwork("a-b 3, b-c:2").nodes, ["A", "B", "C"]);
});
