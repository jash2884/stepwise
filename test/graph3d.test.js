// The 3D graph layout must be deterministic (the scene is built once and every
// step reuses it), finite, and keep vertices apart so spheres never overlap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLES, parseGraph, randomGraph } from "../public/js/engines/graph.js";
import { layout3d } from "../public/js/graph3d.js";
import { rng } from "../public/js/ui.js";

const graphs = () => [
  ...Object.values(EXAMPLES).map((ex) => parseGraph(ex.text, { directed: ex.directed })),
  ...Array.from({ length: 12 }, (_, i) => { const r = rng(1000 + i); return parseGraph(randomGraph(r, { n: 5 + (i % 8), extra: i % 5, connected: i % 3 !== 0 })); }),
  parseGraph("A"), parseGraph("A B"),
];

test("3D layout is finite, centred and keeps vertices apart", () => {
  for (const g of graphs()) {
    const { pos, radius } = layout3d(g);
    assert.equal(pos.size, g.nodes.length);
    assert.ok(Number.isFinite(radius) && radius > 0);
    const P = g.nodes.map((v) => pos.get(v));
    for (const q of P) for (const a of ["x", "y", "z"]) assert.ok(Number.isFinite(q[a]), `${g.nodes} ${a}`);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y, P[i].z - P[j].z);
      assert.ok(d >= 1.95, `${g.nodes[i]} and ${g.nodes[j]} are only ${d.toFixed(2)} apart`);
    }
    for (const q of P) assert.ok(Math.hypot(q.x, q.y, q.z) <= radius + 1e-9);
  }
});

test("3D layout is deterministic, with or without a 2D seed", () => {
  for (const g of graphs()) {
    const seed = new Map(g.nodes.map((v, i) => [v, { x: (i * 37) % 300, y: (i * 91) % 200 }]));
    for (const s of [null, seed]) {
      const a = layout3d(g, s, { cache: false }), b = layout3d({ nodes: [...g.nodes], edges: g.edges.map((e) => ({ ...e })) }, s && new Map(s), { cache: false });
      assert.notEqual(a, b);
      for (const v of g.nodes) assert.deepEqual(b.pos.get(v), a.pos.get(v));
    }
  }
});
