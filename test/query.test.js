import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE, condRels, EXAMPLES, estimate, evaluate, optimise, parseCatalogue, parseQuery, randomData, randomQuery, relsOf, selectivity, validate, walkNodes } from "../public/js/engines/query.js";

const shape = (n) => (n.op === "rel" ? n.rel : `${n.op}(${n.kids.map(shape).join(", ")})`);

// Elmasri & Navathe, Fundamentals of Database Systems, §19.7 (Figure 19.4): the
// "Aquarius" query. After optimisation PROJECT (with its selection) comes first,
// joins WORKS_ON, then EMPLOYEE, and every σ over × has become a ⋈.
test("Elmasri & Navathe's Aquarius query is optimised as in the textbook figure", () => {
  const r = optimise(EXAMPLES.aquarius.query, EXAMPLES.aquarius.catalogue);
  const leaves = [];
  walkNodes(r.tree, (n) => { if (n.op === "rel") leaves.push(n.rel); });
  assert.deepEqual(leaves, ["PROJECT", "WORKS_ON", "EMPLOYEE"]);
  const ops = [];
  walkNodes(r.tree, (n) => ops.push(n.op));
  assert.ok(!ops.includes("cross"), "no Cartesian products left");
  assert.equal(ops.filter((o) => o === "join").length, 2);
  // σ Pname = 'Aquarius' sits directly on PROJECT; σ Bdate > 1957 directly on EMPLOYEE.
  walkNodes(r.tree, (n) => { if (n.op === "select") assert.equal(n.kids[0].op, "rel"); });
  assert.ok(r.finalCost < r.canonicalCost / 1e5);
  assert.match(r.steps.find((s) => s.line === 5).note, /start with PROJECT/);
});

// Silberschatz, Korth & Sudarshan, Database System Concepts, §16.2 (Figure 16.1/16.2):
// σ dept_name = 'Music' is pushed below the join onto instructor.
test("Silberschatz's Music query pushes the selection onto instructor", () => {
  const r = optimise(EXAMPLES.music.query, EXAMPLES.music.catalogue);
  let target = null;
  walkNodes(r.tree, (n) => { if (n.op === "select") target = n.kids[0]; });
  assert.equal(target.rel, "instructor");
  assert.equal(shape(r.tree), "project(join(project(join(project(select(instructor)), project(teaches))), project(course)))");
});

test("selectivity and size estimates follow the textbook formulas", () => {
  const cat = parseCatalogue(EXAMPLES.aquarius.catalogue);
  const q = parseQuery(EXAMPLES.aquarius.query, cat);
  const [pname, join1, , bdate] = q.conds;
  assert.equal(selectivity(pname, cat).sel, 1 / 200);                  // 1 / V(Pname, PROJECT)
  assert.equal(selectivity(join1, cat).sel, 1 / 200);                  // 1 / max(V(Pnumber), V(Pno))
  assert.ok(Math.abs(selectivity(bdate, cat).sel - 43 / 50) < 1e-9);   // (2000 − 1957) / (2000 − 1950)
  const noRange = parseCatalogue("R 30: a 3, b 10");
  assert.equal(selectivity(parseQuery("SELECT a FROM R WHERE b > 4", noRange).conds[0], noRange).sel, 1 / 3);
  // Join size n_r · n_s / max(V(A, r), V(A, s)): Research example 2000 · 50 / 50 = 2000 before σ Dname.
  const res = optimise("SELECT Lname FROM EMPLOYEE, DEPARTMENT WHERE Dnumber = Dno", EXAMPLES.research.catalogue);
  assert.equal(estimate(res.tree, res.cat).get(res.tree.id), 2000);
});

test("parsing explains mistakes", () => {
  const cat = parseCatalogue(EXAMPLES.music.catalogue);
  assert.throws(() => parseQuery("SELECT ID FROM instructor, teaches", cat), /ambiguous/);
  assert.throws(() => parseQuery("SELECT name FROM nobody", cat), /isn't in the catalogue/);
  assert.throws(() => parseQuery("SELECT name FROM instructor WHERE salary ! 3", cat), /Can't read the condition/);
  assert.throws(() => parseCatalogue("R: a 3"), /Can't read/);
  assert.throws(() => parseCatalogue("R 10: a 3 [5..1]"), /low to high/);
  assert.equal(parseQuery("select * from course where credits >= 3;", cat).select, null);
  const star = optimise("SELECT * FROM instructor, teaches WHERE instructor.ID = teaches.ID", EXAMPLES.music.catalogue);
  assert.equal(star.tree.op, "join", "SELECT * needs no projection at all");
});

test("fuzz: every step is valid, keeps every relation and condition, and gives the same answer", () => {
  let seed = 4242;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 300; k++) {
    const g = randomQuery(rand);
    const r = optimise(g.query, g.catalogue);
    const data = randomData(g.attrs, rand);
    const canon = (rows) => rows.map((x) => JSON.stringify(Object.entries(x).sort())).sort();
    const truth = canon(evaluate(r.steps[0].tree, data, r.q));
    for (const s of r.steps) {
      assert.deepEqual(validate(s.tree, r.q), [], g.query);
      assert.deepEqual([...relsOf(s.tree)].sort(), [...r.q.rels].sort());
      const ids = new Set();
      walkNodes(s.tree, (n) => { assert.ok(!ids.has(n.id), `duplicate id ${n.id}`); ids.add(n.id); });
      const condIds = [];
      walkNodes(s.tree, (n) => { if (n.conds) condIds.push(...n.conds.map((c) => c.id)); });
      assert.deepEqual(condIds.sort(), r.q.conds.map((c) => c.id).sort(), "conditions kept exactly once");
      for (const v of s.sizes.values()) assert.ok(v >= 0 && Number.isFinite(v));
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE.length);
      assert.deepEqual(canon(evaluate(s.tree, data, r.q)), truth, `${g.query} at line ${s.line}`);
    }
    // Heuristics: no σ left on top of a ×, single-relation conditions sit on their relation.
    walkNodes(r.tree, (n) => {
      if (n.op === "select") {
        assert.notEqual(n.kids[0].op, "cross");
        if (condRels(n.conds[0]).length === 1) assert.equal(relsOf(n).length, 1);
      }
    });
    assert.ok(r.finalCost <= r.canonicalCost + 1e-9);
  }
});
