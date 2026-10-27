import assert from "node:assert/strict";
import { test } from "node:test";
import { annotated, SDT_CODE, translate } from "../public/js/engines/sdt.js";

// Aho, Lam, Sethi & Ullman, Example 5.1 / Fig. 5.3: the annotated parse tree for 3 * 5 + 4 n has L.val = 19.
test("desk calculator: 3 * 5 + 4 gives 19, evaluated bottom-up", () => {
  const r = translate("desk", "3 * 5 + 4");
  assert.equal(r.result, 19);
  assert.ok(r.order.every((a) => a.kind === "syn"));
  assert.deepEqual(r.order.filter((a) => a.sym === "T").map((a) => a.value), [3, 15, 4]);
});

// Dragon Book Example 5.3 / Fig. 5.5: T → F T′ with T′.inh; 3 * 5 gives T.val = 15.
test("inherited attributes: T′.inh carries the left operand down", () => {
  const r = translate("ll", "3 * 5");
  assert.equal(r.result, 15);
  const inh = r.order.filter((a) => a.sym === "T′" && a.name === "inh").map((a) => a.value);
  assert.deepEqual(inh, [3, 15]);
  assert.equal(translate("ll", "2 + 3 * (4 + 1)").result, 17);
});

// Dragon Book Example 5.10 / Fig. 5.9: float id1, id2, id3.
test("declarations: the type is inherited down the list", () => {
  const r = translate("decl", "float id1, id2, id3");
  assert.deepEqual(r.result, { id1: "float", id2: "float", id3: "float" });
  assert.equal(r.order[0].name, "type");
  assert.ok(r.order.filter((a) => a.sym === "L").every((a) => a.kind === "inh"));
  assert.throws(() => translate("decl", "double x"), /int or float/);
});

let seed = 99;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const expr = (d = 0) => (d > 2 || rand() < 0.35 ? String(Math.floor(rand() * 10)) : rand() < 0.2 ? `(${expr(d + 1)})` : `${expr(d + 1)} ${rand() < 0.5 ? "+" : "*"} ${expr(d + 1)}`);

test("fuzz: both definitions agree with arithmetic, and every attribute is evaluated after what it uses", () => {
  for (let k = 0; k < 300; k++) {
    const src = expr();
    const want = Function(`return ${src}`)();
    for (const kind of ["desk", "ll"]) {
      const r = translate(kind, src);
      assert.equal(r.result, want, `${kind}: ${src}`);
      const at = new Map(r.order.map((a, i) => [`${a.node}.${a.name}`, i]));
      for (const e of r.edges) if (at.has(e.from)) assert.ok(at.get(e.from) < at.get(e.to), `${src}: ${e.from} before ${e.to}`);
      for (const s of r.steps) for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= SDT_CODE.length);
      const tree = annotated(r.root, r.steps.at(-1).values);
      assert.equal(tree.state, "expanded");
    }
  }
});
