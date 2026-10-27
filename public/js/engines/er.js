// ER model → relational schema, by the mapping algorithm of Elmasri & Navathe
// (Fundamentals of Database Systems, ch. 9): one step per kind of construct,
// one table (or foreign key) at a time. Also a layout for a Chen-notation ER
// diagram, kept pure so it can be tested.
//
// The input format, one declaration per line (# starts a comment):
//   entity EMPLOYEE: Name(Fname, Lname), *Ssn, Salary, {Phone}, /Age
//   weak DEPENDENT of EMPLOYEE by DEPENDENTS_OF fk Essn: ~Dependent_name, Sex
//   rel WORKS_FOR: EMPLOYEE N total, DEPARTMENT 1 fk Dno
//   rel WORKS_ON: EMPLOYEE M total, PROJECT N total; Hours
//   rel SUPERVISION: EMPLOYEE 1 as Supervisor fk Super_ssn, EMPLOYEE N as Supervisee
//   isa PERSON: STUDENT, INSTRUCTOR; overlapping, total
// Attributes: *key (several * make one composite key), ~partial key (weak
// entities), {multivalued} ({A in TABLE} names its table), /derived,
// Composite(Part, Part). Participants: ENTITY card [total|partial] [as role]
// [fk column], where card is 1 or a letter (N, M, P …) for "many"; "fk" names
// the foreign key column that refers to that participant.

export const CODE = [
  "step 1  for each regular entity E  // not weak, not a subclass",
  "          table E(simple attributes of E)  // composites → their parts",
  "          PK ← key of E",
  "step 2  for each weak entity W with owner O",
  "          table W(PK(O) as a foreign key, simple attributes of W)",
  "          PK ← PK(O) + partial key of W",
  "step 3  for each binary 1:1 relationship R between S and T",
  "          add PK(T) to S as a foreign key, plus R's attributes  // S total if possible",
  "step 4  for each binary 1:N relationship R  // S is the N side",
  "          add PK(1 side) to S as a foreign key, plus R's attributes",
  "step 5  for each binary M:N relationship R",
  "          table R(PK of each side as a foreign key, R's attributes)",
  "          PK ← both foreign keys",
  "step 6  for each multivalued attribute A of E",
  "          table E_A(PK(E) as a foreign key, A); PK ← every column",
  "step 7  for each n-ary relationship R  // n > 2",
  "          table R(a foreign key to every participant, R's attributes)",
  "          PK ← foreign keys of the participants on a many side",
  "step 8  for each specialisation of C into S1 … Sm",
  "          8A: table Si(PK(C) as PK and foreign key, attributes of Si)",
  "          8C/8D: add every Si's attributes to C's table + a type column or flags",
];

export const RULES = {
  1: "Step 1: regular entity types", 2: "Step 2: weak entity types", 3: "Step 3: binary 1:1 relationships", 4: "Step 4: binary 1:N relationships",
  5: "Step 5: binary M:N relationships", 6: "Step 6: multivalued attributes", 7: "Step 7: n-ary relationships", 8: "Step 8: specialisation and generalisation",
};

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LIMITS = { entities: 14, rels: 16, attrs: 90 };

// --- Parsing ----------------------------------------------------------------------

// Split on commas that aren't inside ( ) or { }.
function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "{") depth++;
    if (ch === ")" || ch === "}") depth--;
    if (depth < 0) throw new Error(`Unbalanced brackets in "${s.trim()}".`);
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (depth) throw new Error(`Unbalanced brackets in "${s.trim()}".`);
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseAttr(raw, where) {
  let s = raw.trim(), kind = "plain", derived = false, multi = false, table = null;
  if (s.startsWith("*")) { kind = "key"; s = s.slice(1).trim(); } else if (s.startsWith("~")) { kind = "partial"; s = s.slice(1).trim(); }
  if (s.startsWith("/")) { derived = true; s = s.slice(1).trim(); }
  if (s.startsWith("{")) {
    if (!s.endsWith("}")) throw new Error(`${where}: "${raw}" opens { but doesn't close it.`);
    multi = true; s = s.slice(1, -1).trim();
    const m = /^(.*\S)\s+in\s+([A-Za-z_]\w*)$/.exec(s);
    if (m) { s = m[1]; table = m[2]; }
  }
  let parts = [];
  const c = /^([^()]+)\((.*)\)$/.exec(s);
  if (c) { s = c[1].trim(); parts = splitTop(c[2]).map((x) => parseAttr(x, where)); if (!parts.length) throw new Error(`${where}: composite attribute ${s} needs parts.`); }
  if (!NAME.test(s)) throw new Error(`${where}: "${raw}" isn't a valid attribute name (letters, digits and _).`);
  if (multi && kind !== "plain") throw new Error(`${where}: a multivalued attribute (${s}) can't be a key.`);
  if (derived && kind !== "plain") throw new Error(`${where}: a derived attribute (${s}) can't be a key.`);
  for (const p of parts) if (p.kind !== "plain" || p.multi) throw new Error(`${where}: mark the whole composite ${s} as a key, not its parts.`);
  return { name: s, kind, multi, derived, table, parts };
}

const attrList = (s, where) => (s && s.trim() ? splitTop(s).map((x) => parseAttr(x, where)) : []);

export function parseER(text) {
  const entities = [], rels = [], specs = [];
  const lines = String(text).split("\n");
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const where = `Line ${i + 1}`;
    const kw = line.split(/\s+/)[0].toLowerCase();
    const colon = line.indexOf(":");
    const headText = colon >= 0 ? line.slice(0, colon) : line, body = colon >= 0 ? line.slice(colon + 1) : "";
    const head = headText.trim().split(/\s+/);
    if (kw === "entity") {
      if (head.length !== 2 || !NAME.test(head[1])) throw new Error(`${where}: write "entity NAME: attributes".`);
      entities.push({ name: head[1], weak: false, attrs: attrList(body, where), line: i + 1 });
    } else if (kw === "weak") {
      const m = /^weak\s+(\w+)\s+of\s+(\w+)(?:\s+by\s+(\w+))?(?:\s+fk\s+(\w+))?$/i.exec(headText.trim());
      if (!m) throw new Error(`${where}: write "weak NAME of OWNER [by RELATIONSHIP] [fk COLUMN]: attributes".`);
      entities.push({ name: m[1], weak: true, owner: m[2], idRel: m[3] ?? `${m[1]}_OF`, fk: m[4] ?? null, attrs: attrList(body, where), line: i + 1 });
    } else if (kw === "rel" || kw === "relationship") {
      if (head.length !== 2 || !NAME.test(head[1]) || colon < 0) throw new Error(`${where}: write "rel NAME: ENTITY 1, ENTITY N; attributes".`);
      const [partText, attrText = ""] = body.split(";");
      const parts = partText.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
        const t = x.split(/\s+/);
        const p = { entity: t[0], card: null, total: false, role: null, fk: null };
        if (!t[1] || !/^(1|[A-Za-z*])$/.test(t[1])) throw new Error(`${where}: "${x}" needs a cardinality after the entity: 1, or a letter such as N or M for many.`);
        p.card = t[1] === "1" ? "1" : t[1] === "*" ? "N" : t[1].toUpperCase();
        for (let k = 2; k < t.length; k++) {
          const w = t[k].toLowerCase();
          if (w === "total" || w === "partial") p.total = w === "total";
          else if ((w === "as" || w === "fk") && t[k + 1] && NAME.test(t[k + 1])) { p[w === "as" ? "role" : "fk"] = t[++k]; }
          else throw new Error(`${where}: didn't understand "${t[k]}" in "${x}". Use total, partial, as ROLE or fk COLUMN.`);
        }
        return p;
      });
      if (parts.length < 2) throw new Error(`${where}: a relationship needs at least two participants (write the entity twice, with roles, for a recursive one).`);
      const attrs = attrList(attrText, where);
      if (attrs.some((a) => a.kind !== "plain" || a.multi)) throw new Error(`${where}: relationship attributes can't be keys or multivalued here.`);
      rels.push({ name: head[1], parts, attrs, identifying: false, line: i + 1 });
    } else if (kw === "isa" || kw === "spec") {
      if (head.length !== 2 || colon < 0) throw new Error(`${where}: write "isa SUPERCLASS: SUB1, SUB2; disjoint|overlapping, total|partial".`);
      const [subText, optText = ""] = body.split(";");
      const subs = subText.split(",").map((x) => x.trim()).filter(Boolean);
      const s = { sup: head[1], subs, disjoint: true, total: false, line: i + 1 };
      for (const o of optText.split(/[\s,]+/).filter(Boolean)) {
        const w = o.toLowerCase();
        if (w === "disjoint" || w === "d") s.disjoint = true;
        else if (w === "overlapping" || w === "o") s.disjoint = false;
        else if (w === "total" || w === "partial") s.total = w === "total";
        else throw new Error(`${where}: didn't understand "${o}". Use disjoint or overlapping, and total or partial.`);
      }
      if (!subs.length) throw new Error(`${where}: list the subclasses after the colon.`);
      specs.push(s);
    } else throw new Error(`${where}: start with entity, weak, rel or isa.`);
  });
  return check({ entities, rels, specs });
}

const flat = (a) => (a.parts.length ? a.parts.flatMap(flat) : [a.name]);
const countAttrs = (as) => as.reduce((n, a) => n + 1 + countAttrs(a.parts), 0);

function check(m) {
  const E = new Map();
  if (!m.entities.length) throw new Error("Declare at least one entity, e.g. entity STUDENT: *Id, Name.");
  if (m.entities.length > LIMITS.entities) throw new Error(`Use at most ${LIMITS.entities} entities.`);
  if (m.rels.length > LIMITS.rels) throw new Error(`Use at most ${LIMITS.rels} relationships.`);
  for (const e of m.entities) {
    if (E.has(e.name)) throw new Error(`Line ${e.line}: ${e.name} is declared twice.`);
    E.set(e.name, e);
  }
  const names = new Set(m.entities.map((e) => e.name));
  for (const r of m.rels) { if (names.has(r.name)) throw new Error(`Line ${r.line}: ${r.name} is already used as a name.`); names.add(r.name); }
  const parent = new Map();
  for (const s of m.specs) {
    if (!E.has(s.sup)) throw new Error(`Line ${s.line}: ${s.sup} isn't a declared entity.`);
    for (const sub of s.subs) {
      if (!E.has(sub)) throw new Error(`Line ${s.line}: subclass ${sub} isn't a declared entity.`);
      if (sub === s.sup) throw new Error(`Line ${s.line}: ${sub} can't be its own subclass.`);
      if (parent.has(sub)) throw new Error(`Line ${s.line}: ${sub} already has a superclass (shared subclasses aren't supported).`);
      if (E.get(sub).weak) throw new Error(`Line ${s.line}: a weak entity can't be a subclass.`);
      parent.set(sub, s.sup);
    }
  }
  for (const [sub] of parent) { const seen = new Set([sub]); for (let x = parent.get(sub); x; x = parent.get(x)) { if (seen.has(x)) throw new Error(`The specialisations form a cycle through ${x}.`); seen.add(x); } }
  if (new Set(m.specs.map((s) => s.sup)).size !== m.specs.length) throw new Error("Write each superclass's subclasses on one isa line.");
  let total = 0;
  for (const e of m.entities) {
    total += countAttrs(e.attrs);
    const keys = e.attrs.filter((a) => a.kind === "key"), partial = e.attrs.filter((a) => a.kind === "partial");
    if (e.weak) {
      if (!E.has(e.owner)) throw new Error(`Line ${e.line}: owner ${e.owner} isn't a declared entity.`);
      if (keys.length) throw new Error(`Line ${e.line}: a weak entity has no key of its own; mark its partial key with ~.`);
      if (!partial.length) throw new Error(`Line ${e.line}: weak entity ${e.name} needs a partial key, e.g. ~Name.`);
      if (names.has(e.idRel)) throw new Error(`Line ${e.line}: ${e.idRel} is already used as a name.`);
      names.add(e.idRel);
    } else {
      if (partial.length) throw new Error(`Line ${e.line}: only weak entities have partial keys (~). Use * for a key.`);
      if (parent.has(e.name) && keys.length) throw new Error(`Line ${e.line}: ${e.name} is a subclass, so it inherits its key from ${parent.get(e.name)}. Leave out the *.`);
      if (!parent.has(e.name) && !keys.length) throw new Error(`Line ${e.line}: ${e.name} needs a key: mark it with *, e.g. *Id.`);
    }
  }
  // A weak entity's owner chain must end at a strong entity.
  for (const e of m.entities) if (e.weak) { const seen = new Set(); for (let x = e; x.weak; x = E.get(x.owner)) { if (seen.has(x.name)) throw new Error(`Weak entities ${[...seen].join(", ")} own each other in a circle.`); seen.add(x.name); } }
  for (const r of m.rels) {
    total += countAttrs(r.attrs);
    for (const p of r.parts) if (!E.has(p.entity)) throw new Error(`Line ${r.line}: ${p.entity} in ${r.name} isn't a declared entity.`);
  }
  if (total > LIMITS.attrs) throw new Error(`Use at most ${LIMITS.attrs} attributes in all.`);
  // Identifying relationships come from the weak declarations.
  const idRels = m.entities.filter((e) => e.weak).map((e) => ({ name: e.idRel, parts: [{ entity: e.owner, card: "1", total: false, role: null, fk: null }, { entity: e.name, card: "N", total: true, role: null, fk: null }], attrs: [], identifying: true, weakOf: e.name }));
  return { entities: m.entities, rels: [...idRels, ...m.rels], specs: m.specs, parent, byName: E };
}

export const kindOf = (r) => {
  if (r.identifying) return "identifying";
  if (r.parts.length > 2) return "n-ary";
  const ones = r.parts.filter((p) => p.card === "1").length;
  return ones === 2 ? "1:1" : ones === 1 ? "1:N" : "M:N";
};

// --- Mapping ----------------------------------------------------------------------

export function mapER(m, { spec = "a" } = {}) {
  const E = m.byName, steps = [];
  const tables = [];
  const pending = new Map();
  const T = (name) => tables.find((t) => t.name === name);
  const root = (e) => (m.parent.has(e) ? root(m.parent.get(e)) : e);
  // Which table holds entity e (it may not exist yet: subclasses wait for step 8).
  const tableOf = (e) => (m.parent.has(e) && spec !== "a" ? tableOf(m.parent.get(e)) : e);
  const usedNames = new Set(m.entities.map((e) => e.name));
  const freshTable = (base) => { let n = base, k = 2; while (tables.some((t) => t.name === n) || (usedNames.has(n) && n !== base)) n = `${base}_${k++}`; return n; };
  // Primary key columns of entity e's table, worked out from the model alone.
  const ownerCols = (w) => {
    const ok = keyCols(w.owner), part = w.attrs.filter((a) => a.kind === "partial").flatMap(flat);
    const base = w.fk ? (ok.length === 1 ? [w.fk] : ok.map((c) => `${w.fk}_${c}`)) : ok;
    return base.map((c) => (part.includes(c) ? `${w.owner}_${c}` : c));
  };
  function keyCols(name) {
    const e = E.get(name);
    if (m.parent.has(name)) return keyCols(m.parent.get(name));
    if (e.weak) return [...ownerCols(e), ...e.attrs.filter((a) => a.kind === "partial").flatMap(flat)];
    return e.attrs.filter((a) => a.kind === "key").flatMap(flat);
  }
  const simple = (attrs) => attrs.filter((a) => !a.multi && !a.derived).flatMap(flat);
  const uniq = (cols, name, prefix) => {
    if (!cols.some((c) => c.name === name)) return name;
    let n = `${prefix}_${name}`, k = 2;
    while (cols.some((c) => c.name === n)) n = `${prefix}_${name}${k++}`;
    return n;
  };
  // Foreign-key column names for a reference to entity `to` from inside table cols.
  const fkNames = (cols, to, p, relName) => {
    const key = keyCols(to);
    const base = p?.fk ? (key.length === 1 ? [p.fk] : key.map((c) => `${p.fk}_${c}`)) : p?.role ? key.map((c) => `${p.role}_${c}`) : key;
    const out = [];
    for (const b of base) { const n = uniq([...cols, ...out.map((x) => ({ name: x }))], b, p?.role ?? relName); out.push(n); }
    return out.map((n, i) => ({ name: n, refCol: key[i] }));
  };

  let mapped = new Set();
  const snap = (rule, line, note, { added = [], focus = [], vars = {}, newCols = [] } = {}) => {
    const addSet = new Set(added), colSet = new Set(newCols);
    steps.push({
      rule, line, note, vars: { step: rule, ...vars, tables: tables.length },
      focus: [...focus], mapped: [...mapped],
      tables: tables.map((t) => ({
        name: t.name, from: t.from, isNew: addSet.has(t.name),
        cols: t.cols.map((c) => ({ ...c, isNew: addSet.has(t.name) || colSet.has(`${t.name}.${c.name}`) })),
        fks: t.fks.map((f) => ({ ...f, cols: [...f.cols], refCols: [...f.refCols] })),
      })),
    });
  };
  const newTable = (name, from) => { const t = { name, from, cols: [], fks: [] }; tables.push(t); return t; };
  const addFK = (t, to, p, relName, { pk = false } = {}) => {
    const cols = fkNames(t.cols, to, p, relName);
    for (const c of cols) t.cols.push({ name: c.name, pk, fk: tableOf(to) });
    t.fks.push({ cols: cols.map((c) => c.name), ref: tableOf(to), refCols: cols.map((c) => c.refCol) });
    return cols.map((c) => c.name);
  };
  const addAttrs = (t, attrs, prefix) => simple(attrs).map((a) => { const n = uniq(t.cols, a, prefix); t.cols.push({ name: n, pk: false, fk: null }); return n; });
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
  const extras = (e) => {
    const multi = e.attrs.filter((a) => a.multi).map((a) => a.name), der = e.attrs.filter((a) => a.derived).map((a) => a.name);
    const comp = e.attrs.filter((a) => a.parts.length && !a.multi);
    return [
      comp.length ? `${list(comp.map((a) => a.name))} ${comp.length === 1 ? "is" : "are"} composite, so only ${comp.length === 1 ? "its" : "their"} simple parts become columns (${list(comp.flatMap(flat))}).` : "",
      multi.length ? `${list(multi)} ${multi.length === 1 ? "is" : "are"} multivalued and ${multi.length === 1 ? "waits" : "wait"} for step 6.` : "",
      der.length ? `${list(der)} ${der.length === 1 ? "is" : "are"} derived, so ${der.length === 1 ? "it isn't" : "they aren't"} stored (compute ${der.length === 1 ? "it" : "them"} in a query or view).` : "",
    ].filter(Boolean).join(" ");
  };
  const attrIds = (owner, attrs, filter = () => true) => attrs.filter(filter).flatMap((a) => [`a:${owner}/${a.name}`, ...a.parts.map((p) => `a:${owner}/${a.name}/${p.name}`)]);

  const strong = m.entities.filter((e) => !e.weak && !m.parent.has(e.name));
  const weak = [];
  { const left = m.entities.filter((e) => e.weak); while (left.length) { const i = left.findIndex((w) => !E.get(w.owner).weak || weak.includes(E.get(w.owner))); weak.push(...left.splice(i, 1)); } }
  const binary = (k) => m.rels.filter((r) => kindOf(r) === k);
  const multis = m.entities.flatMap((e) => e.attrs.filter((a) => a.multi).map((a) => ({ e, a })));
  const specsTop = [];
  { const left = [...m.specs]; while (left.length) { const i = left.findIndex((s) => !m.parent.has(s.sup) || specsTop.some((t) => t.subs.includes(s.sup))); specsTop.push(...left.splice(i, 1)); } }

  snap(0, [], `The ER model has ${m.entities.length} entit${m.entities.length === 1 ? "y" : "ies"} and ${m.rels.length} relationship${m.rels.length === 1 ? "" : "s"}. The mapping visits each kind of construct in a fixed order, so every foreign key points at a table that is already settled.`);

  // Step 1
  if (!strong.length) snap(1, 1, `${RULES[1]}: none here.`);
  for (const e of strong) {
    const t = newTable(e.name, `e:${e.name}`);
    const key = keyCols(e.name);
    for (const c of simple(e.attrs)) t.cols.push({ name: c, pk: key.includes(c), fk: null });
    mapped.add(`e:${e.name}`); for (const id of attrIds(e.name, e.attrs, (a) => !a.multi)) mapped.add(id);
    snap(1, [1, 2, 3], `${RULES[1]}. ${e.name} is a regular (strong) entity, so it gets its own table with its simple attributes. Its key ${list(key)} becomes the primary key.${extras(e) ? ` ${extras(e)}` : ""}`,
      { added: [t.name], focus: [`e:${e.name}`], vars: { E: e.name, PK: key.join(", ") } });
  }
  // Step 2
  if (!weak.length) snap(2, 4, `${RULES[2]}: there are no weak entities, so nothing to do.`);
  for (const w of weak) {
    const t = newTable(w.name, `e:${w.name}`);
    const own = ownerCols(w), okey = keyCols(w.owner), part = w.attrs.filter((a) => a.kind === "partial").flatMap(flat);
    own.forEach((c) => t.cols.push({ name: c, pk: true, fk: tableOf(w.owner) }));
    t.fks.push({ cols: own, ref: tableOf(w.owner), refCols: okey });
    for (const c of simple(w.attrs)) t.cols.push({ name: c, pk: part.includes(c), fk: null });
    mapped.add(`e:${w.name}`); mapped.add(`r:${w.idRel}`); for (const id of attrIds(w.name, w.attrs, (a) => !a.multi)) mapped.add(id);
    snap(2, [4, 5, 6], `${RULES[2]}. ${w.name} is weak: it can only be identified through its owner ${w.owner} (via ${w.idRel}). So its table includes ${w.owner}'s key as a foreign key ${list(own)}${own.join() !== okey.join() ? ` (renamed from ${list(okey)})` : ""}, and the primary key is that plus the partial key: (${[...own, ...part].join(", ")}). The identifying relationship ${w.idRel} needs no table of its own.${extras(w) ? ` ${extras(w)}` : ""}`,
      { added: [t.name], focus: [`e:${w.name}`, `r:${w.idRel}`], vars: { W: w.name, owner: w.owner, PK: [...own, ...part].join(", ") } });
  }
  // Steps 3 and 4: a foreign key in an existing table (or one step 8 will make).
  const intoTable = (target, ref, p, r, rule, line, why) => {
    const tn = tableOf(target.entity), t = T(tn) ?? (pending.get(tn) ?? pending.set(tn, { name: tn, from: null, cols: [], fks: [] }).get(tn));
    const before = t.cols.length;
    const cols = addFK(t, ref.entity, ref, r.name);
    const ra = addAttrs(t, r.attrs, r.name);
    mapped.add(`r:${r.name}`); for (const id of attrIds(r.name, r.attrs)) mapped.add(id);
    const waiting = !T(tn);
    snap(rule, line, `${RULES[rule]}. ${r.name} is ${kindOf(r)}. ${why} So add ${ref.entity}'s key to ${tn} as the foreign key ${list(cols)}${ra.length ? `, and ${r.name}'s own attribute${ra.length === 1 ? "" : "s"} ${list(ra)} go${ra.length === 1 ? "es" : ""} with it` : ""}. No new table is needed.${waiting ? ` ${target.entity} is a subclass, so its table is made in step 8; the column${cols.length + ra.length === 1 ? " is" : "s are"} added then.` : ""}`,
      { focus: [`r:${r.name}`, `e:${target.entity}`, `e:${ref.entity}`], newCols: waiting ? [] : t.cols.slice(before).map((c) => `${tn}.${c.name}`), vars: { R: r.name, kind: kindOf(r), "FK in": tn, FK: cols.join(", ") } });
  };
  const ones = binary("1:1");
  if (!ones.length) snap(3, 7, `${RULES[3]}: none here.`);
  for (const r of ones) {
    const [a, b] = r.parts;
    const S = b.total && !a.total ? b : a, Tt = S === a ? b : a;
    const why = a.entity === b.entity
      ? `It's recursive (both sides are ${a.entity}), so the foreign key goes in ${a.entity} itself, named for the role.`
      : a.total && b.total ? `Both sides take part totally, so either table could hold the foreign key (or the two tables could even be merged); put it in ${S.entity}.`
        : S.total ? `${S.entity} takes part totally (every ${S.entity} is in ${r.name}), so the foreign key goes there and is never NULL.`
          : `Neither side takes part totally, so either table works; put it in ${S.entity} (it will be NULL for ${S.entity} rows not in ${r.name}).`;
    intoTable(S, Tt, r, r, 3, [7, 8], why);
  }
  const ns = binary("1:N");
  if (!ns.length) snap(4, 9, `${RULES[4]}: none here.`);
  for (const r of ns) {
    const S = r.parts.find((p) => p.card !== "1"), one = r.parts.find((p) => p.card === "1");
    const why = S.entity === one.entity
      ? `It's recursive on ${S.entity}: each ${S.role ?? "row"} relates to at most one ${one.role ?? "other row"}, so the foreign key goes in ${S.entity} itself.`
      : `Each ${S.entity} is related to at most one ${one.entity}, so ${S.entity} (the N side) can hold a single reference.`;
    intoTable(S, one, r, r, 4, [9, 10], why);
  }
  // Steps 5 and 7: relationship tables.
  const relTable = (r, rule, line) => {
    const t = newTable(freshTable(r.name), `r:${r.name}`);
    const per = r.parts.map((p) => ({ p, cols: addFK(t, p.entity, p, r.name) }));
    const many = per.filter((x) => x.p.card !== "1");
    const pkParts = rule === 5 ? per : many.length ? many : per;
    for (const x of pkParts) for (const c of x.cols) t.cols.find((col) => col.name === c).pk = true;
    const ra = addAttrs(t, r.attrs, r.name);
    mapped.add(`r:${r.name}`); for (const id of attrIds(r.name, r.attrs)) mapped.add(id);
    const pk = pkParts.flatMap((x) => x.cols);
    const note = rule === 5
      ? `${RULES[5]}. ${r.name} is M:N: one ${r.parts[0].entity} relates to many ${r.parts[1].entity}s and the other way round, so neither table can hold a single reference. ${r.name} gets its own table with a foreign key to each side (${list(per.map((x) => x.cols.join(", ")))})${ra.length ? ` and its attribute${ra.length === 1 ? "" : "s"} ${list(ra)}` : ""}. The primary key is both foreign keys together: (${pk.join(", ")}).`
      : `${RULES[7]}. ${r.name} joins ${r.parts.length} entities, so it needs a table of its own with a foreign key to each (${list(per.map((x) => x.cols.join(", ")))})${ra.length ? ` and ${list(ra)}` : ""}. ${many.length && many.length < per.length ? `The primary key leaves out the foreign key of ${list(per.filter((x) => x.p.card === "1").map((x) => x.p.entity))}, whose cardinality is 1 (the others already decide it): (${pk.join(", ")}).` : `The primary key is all the foreign keys together: (${pk.join(", ")}).`}`;
    snap(rule, line, note, { added: [t.name], focus: [`r:${r.name}`, ...r.parts.map((p) => `e:${p.entity}`)], vars: { R: r.name, kind: kindOf(r), PK: pk.join(", ") } });
  };
  const mns = binary("M:N");
  if (!mns.length) snap(5, 11, `${RULES[5]}: none here.`);
  for (const r of mns) relTable(r, 5, [11, 12, 13]);
  // Step 6
  if (!multis.length) snap(6, 14, `${RULES[6]}: there are no multivalued attributes.`);
  for (const { e, a } of multis) {
    const t = newTable(freshTable(a.table ?? `${e.name}_${a.name.toUpperCase()}`), `a:${e.name}/${a.name}`);
    const cols = addFK(t, e.name, null, e.name, { pk: true });
    const vals = flat(a).map((c) => { const n = uniq(t.cols, c, a.name); t.cols.push({ name: n, pk: true, fk: null }); return n; });
    mapped.add(`a:${e.name}/${a.name}`); for (const id of attrIds(e.name, [a])) mapped.add(id);
    snap(6, [14, 15], `${RULES[6]}. ${e.name} can have several ${a.name} values, and a column holds just one value (first normal form). So ${a.name} gets a table ${t.name} with ${e.name}'s key ${list(cols)} as a foreign key and one row per value. The primary key is every column: (${[...cols, ...vals].join(", ")}).`,
      { added: [t.name], focus: [`a:${e.name}/${a.name}`, `e:${e.name}`], vars: { E: e.name, A: a.name, PK: [...cols, ...vals].join(", ") } });
  }
  // Step 7
  const nary = m.rels.filter((r) => kindOf(r) === "n-ary");
  if (!nary.length) snap(7, 16, `${RULES[7]}: every relationship here is binary.`);
  for (const r of nary) relTable(r, 7, [16, 17, 18]);
  // Step 8
  if (!specsTop.length) snap(8, 19, `${RULES[8]}: there are no subclasses. (Step 9, for union types or categories, doesn't arise either.)`);
  for (const s of specsTop) {
    const sup = tableOf(s.sup), supKey = keyCols(s.sup);
    mapped.add(`s:${s.sup}`);
    if (spec === "a") {
      const made = [];
      for (const sub of s.subs) {
        const e = E.get(sub), t = newTable(sub, `e:${sub}`);
        supKey.forEach((c) => t.cols.push({ name: c, pk: true, fk: sup }));
        t.fks.push({ cols: [...supKey], ref: sup, refCols: [...supKey] });
        for (const c of simple(e.attrs)) t.cols.push({ name: uniq(t.cols, c, sub), pk: false, fk: null });
        const pend = pending.get(sub);
        if (pend) { for (const c of pend.cols) t.cols.push({ ...c, name: uniq(t.cols, c.name, sub) }); t.fks.push(...pend.fks); pending.delete(sub); }
        mapped.add(`e:${sub}`); for (const id of attrIds(sub, e.attrs, (a) => !a.multi)) mapped.add(id);
        made.push(t.name);
      }
      snap(8, [19, 20], `${RULES[8]}, option 8A (a table per class). ${s.subs.join(", ")} ${s.subs.length === 1 ? "is a subclass" : "are subclasses"} of ${s.sup}${s.disjoint ? " (disjoint" : " (overlapping"}, ${s.total ? "total)" : "partial)"}. Each gets a table with ${s.sup}'s key ${list(supKey)} as both its primary key and a foreign key to ${sup}, plus its own attributes. This works for any kind of specialisation; finding everything about one member takes a join.${s.subs.some((x) => m.rels.some((r) => r.parts.some((p) => p.entity === x) && ["1:1", "1:N"].includes(kindOf(r)))) ? " Foreign keys from steps 3 and 4 that belong to a subclass are added now." : ""}`,
        { added: made, focus: [`s:${s.sup}`, `e:${s.sup}`, ...s.subs.map((x) => `e:${x}`)], vars: { C: s.sup, option: "8A", PK: supKey.join(", ") } });
    } else {
      const t = T(sup), before = t.cols.length;
      let flagNote;
      if (s.disjoint) {
        const n = uniq(t.cols, `${s.sup}_type`, s.sup);
        t.cols.push({ name: n, pk: false, fk: null });
        flagNote = `Because the subclasses are disjoint, one type column ${n} says which subclass a row is in (option 8C)${s.total ? "" : "; it is NULL for members of no subclass"}.`;
      } else {
        const fl = s.subs.map((sub) => { const n = uniq(t.cols, `Is_${sub}`, s.sup); t.cols.push({ name: n, pk: false, fk: null }); return n; });
        flagNote = `Because the subclasses overlap, a Boolean flag per subclass (${list(fl)}) says which ones a row belongs to (option 8D).`;
      }
      for (const sub of s.subs) { addAttrs(t, E.get(sub).attrs, sub); mapped.add(`e:${sub}`); for (const id of attrIds(sub, E.get(sub).attrs, (a) => !a.multi)) mapped.add(id); }
      snap(8, [19, 21], `${RULES[8]}, single-table option. ${s.subs.join(", ")} ${s.subs.length === 1 ? "is a subclass" : "are subclasses"} of ${s.sup}, so their attributes are added to ${sup} itself. ${flagNote} No joins are needed, but a row has NULLs for every subclass it isn't in.`,
        { focus: [`s:${s.sup}`, `e:${s.sup}`, ...s.subs.map((x) => `e:${x}`)], newCols: t.cols.slice(before).map((c) => `${sup}.${c.name}`), vars: { C: s.sup, option: s.disjoint ? "8C" : "8D" } });
    }
  }
  const fks = tables.reduce((n, t) => n + t.fks.length, 0);
  snap("done", [], `Done: ${tables.length} table${tables.length === 1 ? "" : "s"} and ${fks} foreign key${fks === 1 ? "" : "s"}. Every entity has a home, every foreign key refers to a primary key, and every M:N or n-ary relationship has its own table.`);
  steps.at(-1).mapped = [...mapped];
  return { tables: steps.at(-1).tables, steps, tableOf: Object.fromEntries(m.entities.map((e) => [e.name, tableOf(e.name)])), keyOf: Object.fromEntries(m.entities.map((e) => [e.name, keyCols(e.name)])) };
}

// One line per table: EMPLOYEE(Ssn PK, …, Dno FK → DEPARTMENT).
export function schemaText(tables) {
  return tables.map((t) => `${t.name}(${t.cols.map((c) => `${c.name}${c.pk ? " PK" : ""}${c.fk ? ` FK→${c.fk}` : ""}`).join(", ")})`).join("\n");
}

// --- Layout for a Chen diagram -------------------------------------------------------

const textW = (s, px = 7.3) => s.length * px;

export function layoutER(m) {
  const nodes = [], edges = [], byId = new Map();
  const add = (n) => { nodes.push(n); byId.set(n.id, n); return n; };
  for (const e of m.entities) add({ id: `e:${e.name}`, kind: "entity", label: e.name, weak: e.weak, w: Math.max(86, textW(e.name, 8) + 28), h: 40, core: true });
  for (const r of m.rels) add({ id: `r:${r.name}`, kind: "rel", label: r.name, identifying: r.identifying, w: Math.max(100, textW(r.name, 7.6) + 56), h: 56, core: true });
  for (const s of m.specs) add({ id: `s:${s.sup}`, kind: "isa", label: s.disjoint ? "d" : "o", w: 28, h: 28, core: true });
  const attrNodes = (ownerId, prefix, attrs, parentId) => {
    for (const a of attrs) {
      const id = `a:${prefix}/${a.name}`;
      add({ id, kind: "attr", label: a.name, key: a.kind, multi: a.multi, derived: a.derived, owner: parentId, w: textW(a.name, 7) + 26, h: 28 });
      edges.push({ a: parentId, b: id, kind: "attr" });
      if (a.parts.length) attrNodes(ownerId, `${prefix}/${a.name}`, a.parts, id);
    }
  };
  for (const e of m.entities) attrNodes(`e:${e.name}`, e.name, e.attrs, `e:${e.name}`);
  for (const r of m.rels) attrNodes(`r:${r.name}`, r.name, r.attrs, `r:${r.name}`);
  for (const r of m.rels) r.parts.forEach((p, i) => {
    const dup = r.parts.filter((q) => q.entity === p.entity).length > 1;
    edges.push({ a: `r:${r.name}`, b: `e:${p.entity}`, kind: "part", total: p.total, card: p.card, role: p.role, lane: dup ? (r.parts.filter((q, j) => q.entity === p.entity && j < i).length ? 1 : -1) : 0 });
  });
  for (const s of m.specs) {
    edges.push({ a: `e:${s.sup}`, b: `s:${s.sup}`, kind: "isa-sup", total: s.total });
    for (const sub of s.subs) edges.push({ a: `s:${s.sup}`, b: `e:${sub}`, kind: "isa-sub" });
  }
  const core = nodes.filter((n) => n.core), coreEdges = edges.filter((e) => e.kind !== "attr");
  // Room each core node needs for its ring of attributes.
  const kids = (id) => edges.filter((e) => e.kind === "attr" && e.a === id).map((e) => byId.get(e.b));
  for (const n of core) {
    const ks = kids(n.id), widest = Math.max(0, ...ks.map((k) => k.w));
    n.r = Math.hypot(n.w, n.h) / 2 + (ks.length ? 30 + widest * 0.55 + Math.max(0, ks.length - 3) * 12 + (ks.some((k) => kids(k.id).length) ? 60 : 0) : 12);
  }
  const arrange = (trial) => {
    // 1. Core nodes: start from a BFS order on a grid, then a deterministic spring embedding.
    const adj = new Map(core.map((n) => [n.id, []]));
    for (const e of coreEdges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
    const order = [];
    const ents = core.filter((n) => n.kind === "entity");
    const startAt = [...ents.slice(trial % ents.length), ...ents.slice(0, trial % ents.length)];
    for (const n of startAt) if (!order.includes(n.id)) {
      const q = [n.id]; order.push(n.id);
      while (q.length) { const x = q.shift(); for (const y of adj.get(x)) if (!order.includes(y)) { order.push(y); q.push(y); } }
    }
    for (const n of core) if (!order.includes(n.id)) order.push(n.id);
    const cols = Math.max(2, Math.ceil(Math.sqrt(order.length * 1.6)) + (trial % 3) - 1);
    let seed = 7 + trial * 7919;
    const jit = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 80; };
    order.forEach((id, i) => { const n = byId.get(id); n.x = (i % cols) * 230 + (Math.floor(i / cols) % 2) * 90 + (trial ? jit() : 0); n.y = Math.floor(i / cols) * 190 + (trial ? jit() : 0); });
    for (let it = 0, temp = 60; it < 700; it++, temp = Math.max(1, temp * 0.993)) {
      const f = new Map(core.map((n) => [n.id, [0, 0]]));
      for (let i = 0; i < core.length; i++) for (let j = i + 1; j < core.length; j++) {
        const A = core[i], B = core[j];
        let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 1 + i; dy = 1 + j; d = Math.hypot(dx, dy); }
        const gap = d - (A.r + B.r) * 0.9;
        const push = gap < 0 ? -gap * 0.5 + 20 : 30000 / (d * d + 400) * 6 / Math.max(1, gap / 40);
        f.get(A.id)[0] -= (dx / d) * push; f.get(A.id)[1] -= (dy / d) * push;
        f.get(B.id)[0] += (dx / d) * push; f.get(B.id)[1] += (dy / d) * push;
      }
      for (const e of coreEdges) {
        const A = byId.get(e.a), B = byId.get(e.b);
        if (A === B) continue;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.max(0.01, Math.hypot(dx, dy));
        const rest = (A.r + B.r) * 0.62 + 20, pull = (d - rest) * 0.12;
        f.get(A.id)[0] += (dx / d) * pull; f.get(A.id)[1] += (dy / d) * pull;
        f.get(B.id)[0] -= (dx / d) * pull; f.get(B.id)[1] -= (dy / d) * pull;
        if (e.kind === "isa-sub") { const lift = Math.max(0, A.y + 90 - B.y) * 0.4; f.get(B.id)[1] += lift; f.get(A.id)[1] -= lift; }
        if (e.kind === "isa-sup") { const lift = Math.max(0, A.y + 80 - B.y) * 0.4; f.get(B.id)[1] += lift; f.get(A.id)[1] -= lift; }
      }
      let cx = 0, cy = 0;
      for (const n of core) { cx += n.x; cy += n.y; }
      cx /= core.length; cy /= core.length;
      for (const n of core) {
        const [fx0, fy0] = f.get(n.id), fx = fx0 + (cx - n.x) * 0.01, fy = fy0 + (cy - n.y) * 0.012, m2 = Math.hypot(fx, fy);
        if (m2 > 0) { const s = Math.min(m2, temp) / m2; n.x += fx * s; n.y += fy * s; }
      }
    }
    // 2. Attributes: spread over the widest angular gaps between an owner's core edges.
    const angleTo = (A, B) => Math.atan2(B.y - A.y, B.x - A.x);
    const place = (owner, ks, avoid, ring) => {
      if (!ks.length) return;
      const TAU = Math.PI * 2;
      const ang = avoid.map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
      const gaps = ang.length ? ang.map((a, i) => [a, (i + 1 < ang.length ? ang[i + 1] : ang[0] + TAU) - a]) : [[-Math.PI / 2 - Math.PI / Math.max(2, ks.length), TAU]];
      const slots = gaps.map(() => 0);
      for (let k = 0; k < ks.length; k++) {
        let best = 0, bestV = -1;
        gaps.forEach(([, g], i) => { const v = g / (slots[i] + 1); if (v > bestV) { bestV = v; best = i; } });
        slots[best]++;
      }
      const angles = [];
      gaps.forEach(([a0, g], i) => { for (let s = 1; s <= slots[i]; s++) angles.push(a0 + (g * s) / (slots[i] + 1) - (ang.length ? 0 : 0)); });
      if (!ang.length) angles.splice(0, angles.length, ...ks.map((_, i) => -Math.PI / 2 + (TAU * i) / ks.length));
      ks.forEach((k, i) => {
        const t = angles[i], stagger = ks.length > 6 && i % 2 ? 30 : 0;
        const rx = owner.w / 2 + k.w / 2 + ring + stagger, ry = owner.h / 2 + k.h / 2 + ring * 0.75 + stagger;
        k.x = owner.x + Math.cos(t) * rx; k.y = owner.y + Math.sin(t) * ry; k.t = t;
      });
    };
    for (const n of core) {
      const avoid = coreEdges.filter((e) => e.a === n.id || e.b === n.id).map((e) => angleTo(n, byId.get(e.a === n.id ? e.b : e.a)));
      place(n, kids(n.id), avoid, 22);
    }
    for (const n of nodes.filter((x) => x.kind === "attr")) {
      const ks = kids(n.id);
      if (!ks.length) continue;
      const back = n.t + Math.PI;
      place(n, ks, [back, back + 0.9, back - 0.9], 14);
    }
    // 2b. Move each attribute (with its parts) to the nearby spot that sits on the
    // fewest lines and nodes.
    const family = (n) => [n, ...kids(n.id).flatMap(family)];
    const parentOf = (n) => byId.get(n.owner);
    const tops = nodes.filter((x) => x.kind === "attr" && parentOf(x).core);
    const costOf = (fam, famSet, owner) => {
      let c = 0;
      for (const e of edges) {
        const A = byId.get(e.a), B = byId.get(e.b);
        if (famSet.has(A) || famSet.has(B)) continue;
        for (const f of fam) if (hitsBox(A, B, f)) c += 4;
        if (cross(owner, fam[0], A, B) && A !== owner && B !== owner) c += 1.5;
      }
      for (const f of fam) {
        const P = parentOf(f);
        for (const o of nodes) {
          if (famSet.has(o)) continue;
          if (o !== P && hitsBox(P, f, o)) c += 4;
          if (Math.abs(o.x - f.x) < (o.w + f.w) / 2 + 6 && Math.abs(o.y - f.y) < (o.h + f.h) / 2 + 6) c += 3;
        }
      }
      return c + Math.hypot(fam[0].x - owner.x, fam[0].y - owner.y) / 150;
    };
    for (let pass = 0; pass < 2; pass++) for (const n of tops) {
      const owner = parentOf(n), fam = family(n), famSet = new Set(fam);
      const shift = (dx, dy) => { for (const f of fam) { f.x += dx; f.y += dy; } };
      let bestC = costOf(fam, famSet, owner), bestP = [n.x, n.y];
      if (bestC < 0.9) continue;
      for (let k = 0; k < 24; k++) for (const extra of [0, 26, 52]) {
        const t = (k * Math.PI) / 12;
        const rx = owner.w / 2 + n.w / 2 + 22 + extra, ry = owner.h / 2 + n.h / 2 + 16 + extra;
        shift(owner.x + Math.cos(t) * rx - n.x, owner.y + Math.sin(t) * ry - n.y);
        const c = costOf(fam, famSet, owner);
        if (c < bestC - 1e-9) { bestC = c; bestP = [n.x, n.y]; }
      }
      shift(bestP[0] - n.x, bestP[1] - n.y);
    }
    // 3. Remove overlaps: attributes give way to core nodes, and to each other.
    const pad = 10;
    for (let it = 0; it < 160; it++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        const ox = (A.w + B.w) / 2 + pad - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 + pad - Math.abs(A.y - B.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wa = A.core && !B.core ? 0 : B.core && !A.core ? 1 : 0.5;
        if (ox < oy) { const s = (A.x < B.x || (A.x === B.x && i < j) ? -1 : 1) * ox; A.x += s * wa; B.x -= s * (1 - wa); }
        else { const s = (A.y < B.y || (A.y === B.y && i < j) ? -1 : 1) * oy; A.y += s * wa; B.y -= s * (1 - wa); }
      }
      if (!moved) break;
    }
  };
  // Try a few starting layouts and keep the one with the fewest crossings.
  const segs = () => edges.map((e) => [byId.get(e.a), byId.get(e.b), e]);
  const cross = (p1, p2, p3, p4) => {
    const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
  };
  const hitsBox = (A, B, n) => {
    // Sample the segment: cheap and good enough at this scale.
    for (let k = 1; k < 14; k++) {
      const x = A.x + ((B.x - A.x) * k) / 14, y = A.y + ((B.y - A.y) * k) / 14;
      if (Math.abs(x - n.x) < n.w / 2 - 2 && Math.abs(y - n.y) < n.h / 2 - 2) return true;
    }
    return false;
  };
  const score = () => {
    const S = segs();
    let sc = 0;
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const [a, b] = S[i], [c, d] = S[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (cross(a, b, c, d)) sc += S[i][2].kind !== "attr" && S[j][2].kind !== "attr" ? 3 : 2;
    }
    for (const [a, b] of S) for (const n of nodes) if (n !== a && n !== b && hitsBox(a, b, n)) sc += 4;
    for (const [a, b, e] of S) if (e.kind !== "attr") sc += Math.hypot(a.x - b.x, a.y - b.y) / 500;
    // Superclass above the circle, the circle above its subclasses.
    for (const [a, b, e] of S) if (e.kind.startsWith("isa") && a.y > b.y - 20) sc += 25;
    return sc;
  };
  let best = null;
  for (let t = 0; t < 8; t++) {
    arrange(t);
    const sc = score();
    if (!best || sc < best.sc - 1e-9) best = { sc, pos: nodes.map((n) => [n.x, n.y]) };
  }
  nodes.forEach((n, i) => { [n.x, n.y] = best.pos[i]; });
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2)) - 16, minY = Math.min(...nodes.map((n) => n.y - n.h / 2)) - 16;
  for (const n of nodes) { n.x = Math.round(n.x - minX); n.y = Math.round(n.y - minY); }
  const W = Math.ceil(Math.max(...nodes.map((n) => n.x + n.w / 2)) + 16), H = Math.ceil(Math.max(...nodes.map((n) => n.y + n.h / 2)) + 16);
  return { nodes, edges, W, H, byId };
}

// --- Random models for practice --------------------------------------------------------

export function randomER(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const pool = [["STUDENT", "Sid", "Name"], ["COURSE", "Code", "Title"], ["TEACHER", "Tid", "Name"], ["ROOM", "Rno", "Capacity"], ["CLUB", "Cname", "Budget"], ["BOOK", "Isbn", "Title"]];
  const n = 2 + Math.floor(r() * 3);
  const ents = [...pool].sort(() => r() - 0.5).slice(0, n);
  const lines = ents.map(([e, k, a], i) => `entity ${e}: *${k}, ${a}${r() < 0.35 ? `, {${i % 2 ? "Phone" : "Email"}}` : ""}`);
  if (r() < 0.4) lines.push(`weak ${ents[0][0]}_NOTE of ${ents[0][0]}: ~Note_no, Text`);
  const card = () => pick(["1", "N", "M"]);
  const rels = 1 + Math.floor(r() * Math.min(3, n));
  for (let i = 0; i < rels; i++) {
    const a = ents[i % n][0], b = ents[(i + 1) % n][0];
    if (a === b) continue;
    let c1 = card(), c2 = card();
    if (c1 === "M" && c2 === "1") c1 = "N";
    if (c1 !== "1" && c2 !== "1") { c1 = "M"; c2 = "N"; }
    lines.push(`rel R${i + 1}: ${a} ${c1}${r() < 0.4 ? " total" : ""}, ${b} ${c2}${r() < 0.3 ? " total" : ""}${r() < 0.3 ? "; Since" : ""}`);
  }
  return lines.join("\n");
}

export const EXAMPLES = {
  company: {
    name: "COMPANY (Elmasri & Navathe, reduced)",
    text: `# Elmasri & Navathe's COMPANY database
entity EMPLOYEE: Name(Fname, Minit, Lname), *Ssn, Bdate, Address, Sex, Salary
entity DEPARTMENT: Dname, *Dnumber, {Dlocation in DEPT_LOCATIONS}, /Number_of_employees
entity PROJECT: Pname, *Pnumber, Plocation
weak DEPENDENT of EMPLOYEE by DEPENDENTS_OF fk Essn: ~Dependent_name, Sex, Bdate, Relationship
rel MANAGES: EMPLOYEE 1 fk Mgr_ssn, DEPARTMENT 1 total; Mgr_start_date
rel SUPERVISION: EMPLOYEE 1 as Supervisor fk Super_ssn, EMPLOYEE N as Supervisee
rel WORKS_FOR: EMPLOYEE N total, DEPARTMENT 1 total fk Dno
rel CONTROLS: DEPARTMENT 1 fk Dnum, PROJECT N total
rel WORKS_ON: EMPLOYEE M total fk Essn, PROJECT N total fk Pno; Hours`,
  },
  university: {
    name: "University (weak, M:N, ternary, specialisation)",
    text: `entity PERSON: *Pid, Name(First, Last), {Phone}
entity STUDENT: Year
entity INSTRUCTOR: Salary, Office
isa PERSON: STUDENT, INSTRUCTOR; overlapping, partial
entity DEPARTMENT: *Dname, Building
entity COURSE: *Code, Title, Credits
weak SECTION of COURSE by SECTION_OF: ~Sec_no, ~Term
entity ROOM: *Room_no, Capacity
rel MEMBER_OF: INSTRUCTOR N total, DEPARTMENT 1
rel OFFERS: DEPARTMENT 1, COURSE N total
rel ENROLS: STUDENT M, SECTION N; Grade
rel PREREQ: COURSE M as Course, COURSE N as Prereq
rel TEACHES: INSTRUCTOR 1, SECTION N total
rel EXAM: STUDENT M, SECTION N, ROOM P; Seat`,
  },
  supply: {
    name: "Ternary SUPPLY (Elmasri & Navathe)",
    text: `entity SUPPLIER: *Sname, City
entity PROJECT: *Proj_name, Budget
entity PART: *Part_no, Description
rel SUPPLY: SUPPLIER M, PROJECT N, PART P; Quantity`,
  },
  library: {
    name: "Library (1:1, composite key, disjoint total)",
    text: `entity MEMBER: *Card_no, Name, Address(Street, Town, Postcode)
entity LOCKER: *Locker_id(Floor, Number), Size
entity ITEM: *Item_id, Title, /Age
entity BOOK: Isbn, Pages
entity DVD: Minutes
isa ITEM: BOOK, DVD; disjoint, total
weak COPY of ITEM: ~Copy_no, Shelf
rel HAS_LOCKER: MEMBER 1, LOCKER 1 total; Since
rel BORROWS: MEMBER 1, COPY N; Due`,
  },
};
