import assert from "node:assert/strict";
import { test } from "node:test";
import { def, randomTac, uses } from "../public/js/engines/optimise.js";
import { analyse, chromatic, colour, COLOUR_CODE, EXAMPLES, GRAPH_CODE, LIVE_CODE, rewrite } from "../public/js/engines/regalloc.js";

const key = (e) => [e.a, e.b].sort().join("—");

// Appel, Modern Compiler Implementation, §10.1 (Graph 10.1 / Table 10.6): a = 0; L1: b = a + 1;
// c = c + b; a = b * 2; if a < N goto L1; return c. c is live on entry; the interference
// graph joins a—c, b—c, a—N, b—N, c—N, so three registers are needed and a, b can share one.
test("Appel's loop: liveness, interference graph and a 3-colouring", () => {
  const a = analyse(EXAMPLES.appel.text);
  assert.deepEqual([...a.live.IN.B1].sort(), ["N", "c"]);
  assert.deepEqual([...a.live.OUT.B2].sort(), ["N", "a", "c"]);
  assert.deepEqual(a.edges.map(key).sort(), ["N—a", "N—b", "N—c", "a—c", "b—c"]);
  assert.equal(chromatic(a.vars, a.edges), 3);
  const c = colour(a.vars, a.edges, 3, a.rows);
  assert.equal(c.spilled.length, 0);
  assert.equal(c.colours.a, c.colours.b);
  const two = colour(a.vars, a.edges, 2, a.rows);
  assert.equal(two.spilled.length, 1);
  assert.ok(two.steps.some((s) => s.phase === "spill"));
  assert.match(rewrite(a.rows, c.colours).at(-1).text, /^return R\d$/);
});

// Aho, Lam, Sethi & Ullman §9.2.5: IN[B] = use[B] ∪ (OUT[B] − def[B]) iterated to a fixed point.
test("liveness iterates until a pass changes nothing, and the steps say so", () => {
  const a = analyse(EXAMPLES.dragon.text);
  const last = a.liveSteps.at(-1);
  assert.ok(last.done);
  assert.deepEqual([...a.live.IN.B1].sort(), ["a", "b", "c"]);
  for (const s of a.liveSteps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= LIVE_CODE.length);
  for (const s of a.graphSteps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= GRAPH_CODE.length);
});

let seed = 31337;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("fuzz: fixed point, interference = simultaneously live at a definition, valid colourings", () => {
  for (let n = 0; n < 250; n++) {
    const src = randomTac(rand, { n: 4 + Math.floor(rand() * 9), jumps: n % 3 === 0, consts: false }) + (rand() < 0.5 ? "\nlive: x y" : "");
    const a = analyse(src);
    // Fixed point: one more application of the equations changes nothing.
    const { IN, OUT, ud } = a.live;
    for (const b of a.cfg.blocks) {
      const out = new Set(a.cfg.succ[b.id].flatMap((s) => [...IN[s]]));
      assert.deepEqual([...out].sort(), [...OUT[b.id]].sort(), src);
      const inn = new Set([...ud[b.id].use, ...[...out].filter((v) => !ud[b.id].def.includes(v))]);
      assert.deepEqual([...inn].sort(), [...IN[b.id]].sort(), src);
    }
    // Edges: exactly the pairs (x defined, y live after, not the copy source), plus inputs.
    const want = new Set();
    for (const r of a.rows) {
      const x = def(r.ins);
      if (!x) continue;
      const src2 = r.ins.kind === "assign" && r.ins.op === "=" ? r.ins.a : null;
      for (const y of r.after) if (y !== x && y !== src2) want.add([x, y].sort().join("—"));
      assert.ok(r.after.every((v) => a.vars.includes(v)));
      for (const u of uses(r.ins)) assert.ok(r.before.includes(u), `${u} is live before it is used`);
    }
    const entry = [...a.live.IN[a.cfg.blocks[0].id]];
    for (const x of entry) for (const y of entry) if (x < y) want.add(`${x}—${y}`);
    assert.deepEqual(a.edges.map(key).sort(), [...want].sort(), src);
    // Colourings are proper, use at most k colours, and spills get none.
    const chi = a.vars.length <= 8 ? chromatic(a.vars, a.edges) : 0;
    for (const k of [1, 2, 3, 4]) {
      const c = colour(a.vars, a.edges, k, a.rows);
      for (const e of a.edges) if (c.colours[e.a] != null && c.colours[e.b] != null) assert.notEqual(c.colours[e.a], c.colours[e.b]);
      for (const v of a.vars) assert.ok(c.spilled.includes(v) !== (c.colours[v] != null), `${v} is either coloured or spilled`);
      assert.ok(Object.values(c.colours).every((x) => x >= 0 && x < k));
      if (k >= a.vars.length) assert.equal(c.spilled.length, 0);
      if (k < chi) assert.ok(c.spilled.length > 0, "fewer registers than the chromatic number must spill");
      for (const s of c.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= COLOUR_CODE.length);
    }
  }
});
