import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE, EXAMPLES, kindOf, layoutER, mapER, parseER, randomER } from "../public/js/engines/er.js";

const run = (k, opts) => { const m = parseER(EXAMPLES[k].text); return { m, ...mapER(m, opts) }; };
const shape = (t) => `${t.name}(${t.cols.map((c) => (c.pk ? `_${c.name}_` : c.name)).join(", ")})`;
const fkList = (tables) => tables.flatMap((t) => t.fks.map((f) => `${t.name}.${f.cols.join("+")} → ${f.ref}.${f.refCols.join("+")}`)).sort();

// Elmasri & Navathe, Fundamentals of Database Systems, Figure 9.2: the COMPANY
// ER schema (Figure 7.2) mapped to relations. Primary keys are _underlined_.
test("COMPANY maps to the textbook's relations, keys and foreign keys", () => {
  const { tables, steps } = run("company");
  assert.deepEqual(tables.map(shape), [
    "EMPLOYEE(Fname, Minit, Lname, _Ssn_, Bdate, Address, Sex, Salary, Super_ssn, Dno)",
    "DEPARTMENT(Dname, _Dnumber_, Mgr_ssn, Mgr_start_date)",
    "PROJECT(Pname, _Pnumber_, Plocation, Dnum)",
    "DEPENDENT(_Essn_, _Dependent_name_, Sex, Bdate, Relationship)",
    "WORKS_ON(_Essn_, _Pno_, Hours)",
    "DEPT_LOCATIONS(_Dnumber_, _Dlocation_)",
  ]);
  assert.deepEqual(fkList(tables), [
    "DEPARTMENT.Mgr_ssn → EMPLOYEE.Ssn",
    "DEPENDENT.Essn → EMPLOYEE.Ssn",
    "DEPT_LOCATIONS.Dnumber → DEPARTMENT.Dnumber",
    "EMPLOYEE.Dno → DEPARTMENT.Dnumber",
    "EMPLOYEE.Super_ssn → EMPLOYEE.Ssn",
    "PROJECT.Dnum → DEPARTMENT.Dnumber",
    "WORKS_ON.Essn → EMPLOYEE.Ssn",
    "WORKS_ON.Pno → PROJECT.Pnumber",
  ]);
  // The derived attribute is not stored.
  assert.ok(!tables.some((t) => t.cols.some((c) => c.name === "Number_of_employees")));
  // Steps run 1 … 8 in order, each saying which rule applies.
  const rules = steps.map((s) => s.rule).filter((r) => typeof r === "number" && r > 0);
  assert.deepEqual([...new Set(rules)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(rules.every((r, i) => !i || r >= rules[i - 1]));
  for (const s of steps.filter((x) => typeof x.rule === "number" && x.rule > 0)) assert.match(s.note, new RegExp(`^Step ${s.rule}`));
});

test("every step names pseudocode lines, variables and a reason", () => {
  for (const k of Object.keys(EXAMPLES)) for (const spec of ["a", "single"]) {
    const { steps } = run(k, { spec });
    for (const s of steps) {
      for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE.length, `${k} line ${l}`);
      assert.ok(s.note.length > 30, s.note);
      assert.ok("step" in s.vars);
    }
    assert.equal(steps.at(-1).rule, "done");
  }
});

// The invariants the mapping must keep, on any model.
function checkInvariants(m, res, spec) {
  const names = res.tables.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "table names are unique");
  for (const t of res.tables) {
    assert.ok(t.cols.some((c) => c.pk), `${t.name} has a primary key`);
    assert.equal(new Set(t.cols.map((c) => c.name)).size, t.cols.length, `${t.name} has unique column names`);
    for (const f of t.fks) {
      const ref = res.tables.find((x) => x.name === f.ref);
      assert.ok(ref, `${t.name} refers to existing table ${f.ref}`);
      const pk = ref.cols.filter((c) => c.pk).map((c) => c.name);
      assert.deepEqual([...f.refCols].sort(), [...pk].sort(), `${t.name}.${f.cols} refers to the whole primary key of ${f.ref}`);
      assert.equal(f.cols.length, f.refCols.length);
      for (const c of f.cols) assert.ok(t.cols.some((x) => x.name === c), `${t.name} has FK column ${c}`);
    }
  }
  // Every entity maps to a table (its own, or its superclass's in the single-table option).
  for (const e of m.entities) {
    assert.ok(names.includes(res.tableOf[e.name]), `${e.name} has a table`);
    if (!m.parent.has(e.name) || spec === "a") assert.equal(res.tableOf[e.name], e.name);
  }
  // M:N and n-ary relationships always get their own table, with an FK to every participant.
  for (const r of m.rels.filter((x) => ["M:N", "n-ary"].includes(kindOf(x)))) {
    const t = res.tables.find((x) => x.name === r.name);
    assert.ok(t, `${r.name} has its own table`);
    assert.equal(t.fks.length, r.parts.length);
    if (kindOf(r) === "M:N") assert.ok(t.fks.every((f) => f.cols.every((c) => t.cols.find((x) => x.name === c).pk)), `${r.name}: both FKs are in the PK`);
  }
  // 1:1 and 1:N relationships never get a table.
  for (const r of m.rels.filter((x) => ["1:1", "1:N", "identifying"].includes(kindOf(x)))) assert.ok(!names.includes(r.name), `${r.name} has no table`);
  // Each multivalued attribute gets a table whose primary key is every column.
  const multis = m.entities.flatMap((e) => e.attrs.filter((a) => a.multi));
  assert.equal(res.tables.filter((t) => t.from?.startsWith("a:")).length, multis.length);
  for (const t of res.tables.filter((x) => x.from?.startsWith("a:"))) assert.ok(t.cols.every((c) => c.pk));
}

test("invariants hold on every example, both ways of mapping specialisation", () => {
  for (const k of Object.keys(EXAMPLES)) for (const spec of ["a", "single"]) {
    const { m, ...res } = run(k, { spec });
    checkInvariants(m, res, spec);
  }
});

test("weak entities: owner key + partial key; 1:N goes on the N side; n-ary PK", () => {
  const { tables } = run("university");
  const T = (n) => tables.find((t) => t.name === n);
  assert.equal(shape(T("SECTION")), "SECTION(_Code_, _Sec_no_, _Term_, Pid)");
  // ENROLS is M:N between STUDENT and the weak SECTION, so it takes all of SECTION's key.
  assert.equal(shape(T("ENROLS")), "ENROLS(_Pid_, _Code_, _Sec_no_, _Term_, Grade)");
  // Recursive M:N: the roles keep the two copies of Code apart.
  assert.equal(shape(T("PREREQ")), "PREREQ(_Course_Code_, _Prereq_Code_)");
  // Specialisation 8A: subclasses keyed by the superclass key; MEMBER_OF's FK waits for INSTRUCTOR.
  assert.equal(shape(T("INSTRUCTOR")), "INSTRUCTOR(_Pid_, Salary, Office, Dname)");
  assert.deepEqual(fkList([T("INSTRUCTOR")]), ["INSTRUCTOR.Dname → DEPARTMENT.Dname", "INSTRUCTOR.Pid → PERSON.Pid"]);
  // SUPPLY (ternary): PK is all three foreign keys.
  const s = run("supply").tables.find((t) => t.name === "SUPPLY");
  assert.equal(shape(s), "SUPPLY(_Sname_, _Proj_name_, _Part_no_, Quantity)");
});

test("1:1 puts the foreign key on the total side; single-table specialisation adds a type column", () => {
  const { tables } = run("library", { spec: "single" });
  const T = (n) => tables.find((t) => t.name === n);
  assert.equal(shape(T("LOCKER")), "LOCKER(_Floor_, _Number_, Size, Card_no, Since)");
  assert.equal(shape(T("ITEM")), "ITEM(_Item_id_, Title, ITEM_type, Isbn, Pages, Minutes)");
  assert.ok(!T("BOOK") && !T("DVD"));
  const o = run("university", { spec: "single" }).tables.find((t) => t.name === "PERSON");
  assert.ok(o.cols.some((c) => c.name === "Is_STUDENT") && o.cols.some((c) => c.name === "Is_INSTRUCTOR"), "overlapping → one flag per subclass");
});

test("parse errors are explained", () => {
  assert.throws(() => parseER("entity A: x"), /needs a key/);
  assert.throws(() => parseER("entity A: *x\nrel R: A 1"), /at least two participants/);
  assert.throws(() => parseER("entity A: *x\nrel R: A 1, B N"), /B in R isn't a declared entity/);
  assert.throws(() => parseER("entity A: *x\nweak W of A: y"), /partial key/);
  assert.throws(() => parseER("entity A: *x\nentity B: *y\nisa A: B"), /inherits its key/);
  assert.throws(() => parseER("entity A: *x, {*y}"), /isn't a valid attribute name|can't be a key/);
  assert.throws(() => parseER("table A"), /start with entity/);
});

test("layout: nodes don't overlap and every edge joins two drawn nodes", () => {
  for (const k of Object.keys(EXAMPLES)) {
    const L = layoutER(parseER(EXAMPLES[k].text));
    for (const e of L.edges) assert.ok(L.byId.get(e.a) && L.byId.get(e.b));
    for (const n of L.nodes) assert.ok(n.x - n.w / 2 >= 0 && n.y - n.h / 2 >= 0 && n.x + n.w / 2 <= L.W && n.y + n.h / 2 <= L.H, `${k}: ${n.id} inside the picture`);
    for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) {
      const a = L.nodes[i], b = L.nodes[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1;
      assert.ok(!overlap, `${k}: ${a.id} overlaps ${b.id}`);
    }
  }
});

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("fuzz: random models keep every invariant", () => {
  for (let k = 0; k < 150; k++) {
    const m = parseER(randomER(rand));
    for (const spec of ["a", "single"]) checkInvariants(m, mapER(m, { spec }), spec);
  }
});
