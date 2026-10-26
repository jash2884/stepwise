// SQL joins evaluated the way a nested-loop join reads them: every pair of
// rows is compared, and each comparison is a step.
//
// SQL rules shown explicitly: NULL never equals anything (not even NULL), and
// outer joins pad the missing side with NULLs.

export const JOINS = {
  inner: { name: "INNER JOIN", sql: "JOIN" },
  left: { name: "LEFT OUTER JOIN", sql: "LEFT JOIN" },
  right: { name: "RIGHT OUTER JOIN", sql: "RIGHT JOIN" },
  full: { name: "FULL OUTER JOIN", sql: "FULL JOIN" },
  cross: { name: "CROSS JOIN", sql: "CROSS JOIN", noCondition: true },
  natural: { name: "NATURAL JOIN", sql: "NATURAL JOIN", noCondition: true },
  semi: { name: "SEMI JOIN (WHERE EXISTS)", semi: true },
  anti: { name: "ANTI JOIN (WHERE NOT EXISTS)", semi: true },
};

export function parseTable(name, text) {
  const lines = String(text).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error(`Table ${name} needs a header row.`);
  const split = (l) => l.split(/\s*[,|\t]\s*/).map((c) => c.trim());
  const columns = split(lines[0]);
  if (columns.some((c) => !/^[A-Za-z_]\w{0,19}$/.test(c))) throw new Error(`Table ${name}: column names must be simple words (letters, digits, _).`);
  if (new Set(columns).size !== columns.length) throw new Error(`Table ${name} has duplicate column names.`);
  const rows = lines.slice(1).map((l, i) => {
    const cells = split(l);
    if (cells.length !== columns.length) throw new Error(`Table ${name}, row ${i + 1}: expected ${columns.length} values, got ${cells.length}.`);
    return cells.map((c) => (/^null$/i.test(c) || c === "" ? null : /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c));
  });
  if (rows.length > 10) throw new Error(`Keep table ${name} to 10 rows so every step is readable.`);
  return { name, columns, rows };
}

export const show = (v) => (v === null ? "NULL" : String(v));

export function join(A, B, type, on = {}) {
  const spec = JOINS[type];
  if (!spec) throw new Error(`Unknown join ${type}`);
  let match, condition;
  if (type === "natural") {
    const common = A.columns.filter((c) => B.columns.includes(c));
    if (!common.length) throw new Error("A natural join needs at least one column name in common.");
    match = (a, b) => common.every((c) => { const x = a[A.columns.indexOf(c)], y = b[B.columns.indexOf(c)]; return x !== null && y !== null && x === y; });
    condition = common.map((c) => `${A.name}.${c} = ${B.name}.${c}`).join(" AND ");
  } else if (type === "cross") {
    match = () => true;
    condition = null;
  } else {
    const ia = A.columns.indexOf(on.left), ib = B.columns.indexOf(on.right);
    if (ia < 0 || ib < 0) throw new Error("Choose a column from each table to join on.");
    match = (a, b) => a[ia] !== null && b[ib] !== null && a[ia] === b[ib];
    condition = `${A.name}.${on.left} = ${B.name}.${on.right}`;
  }

  const naturalCols = type === "natural" ? B.columns.filter((c) => !A.columns.includes(c)) : null;
  const columns = spec.semi ? A.columns.map((c) => `${A.name}.${c}`)
    : type === "natural" ? [...A.columns, ...naturalCols]
      : [...A.columns.map((c) => `${A.name}.${c}`), ...B.columns.map((c) => `${B.name}.${c}`)];
  const combine = (a, b) => (type === "natural"
    ? [...a, ...naturalCols.map((c) => b[B.columns.indexOf(c)])]
    : [...a, ...b]);
  const nullA = A.columns.map(() => null), nullB = B.columns.map(() => null);

  const rows = [], steps = [];
  const matchedB = new Set();
  const why = (a, b) => {
    if (!condition) return "CROSS JOIN pairs every row with every row";
    if (type === "natural") return match(a, b) ? `${condition} holds` : `${condition} doesn't hold`;
    const x = a[A.columns.indexOf(on.left)], y = b[B.columns.indexOf(on.right)];
    if (x === null || y === null) return `${show(x)} = ${show(y)} is UNKNOWN (NULL never matches)`;
    return x === y ? `${show(x)} = ${show(y)}` : `${show(x)} ≠ ${show(y)}`;
  };

  A.rows.forEach((a, i) => {
    let found = false;
    for (let j = 0; j < B.rows.length; j++) {
      const b = B.rows[j];
      const ok = match(a, b);
      if (ok) { found = true; matchedB.add(j); }
      let note = `${A.name} row ${i + 1} vs ${B.name} row ${j + 1}: ${why(a, b)}`;
      if (spec.semi) {
        if (ok) {
          if (type === "semi") { rows.push([...a]); note += `, so ${A.name} row ${i + 1} is kept (a match exists).`; }
          else note += `, so ${A.name} row ${i + 1} is ruled out.`;
          steps.push({ i, j, match: ok, note, rows: rows.length });
          break; // EXISTS stops at the first match
        }
        note += ".";
      } else {
        if (ok) { rows.push(combine(a, b)); note += " → output a joined row."; } else note += " → no output.";
      }
      steps.push({ i, j, match: ok, note, rows: rows.length });
    }
    if ((type === "left" || type === "full") && !found) {
      rows.push([...a, ...nullB]);
      steps.push({ i, j: null, pad: "right", note: `${A.name} row ${i + 1} matched nothing, so a ${spec.name} keeps it with NULLs for ${B.name}'s columns.`, rows: rows.length });
    }
    if (type === "anti" && !found) {
      rows.push([...a]);
      steps.push({ i, j: null, note: `${A.name} row ${i + 1} has no match, so NOT EXISTS keeps it.`, rows: rows.length });
    }
    if (type === "semi" && !found && B.rows.length) steps.push({ i, j: null, note: `${A.name} row ${i + 1} has no match, so it's dropped.`, rows: rows.length });
  });
  if (type === "right" || type === "full") {
    B.rows.forEach((b, j) => {
      if (matchedB.has(j)) return;
      rows.push([...nullA, ...b]);
      steps.push({ i: null, j, pad: "left", note: `${B.name} row ${j + 1} matched nothing, so it's kept with NULLs for ${A.name}'s columns.`, rows: rows.length });
    });
  }
  // Column order for RIGHT JOIN results stays A then B, as SQL prints it.
  const sql = spec.semi
    ? `SELECT * FROM ${A.name} WHERE ${type === "anti" ? "NOT " : ""}EXISTS (SELECT 1 FROM ${B.name} WHERE ${condition})`
    : `SELECT * FROM ${A.name} ${spec.sql} ${B.name}${condition && type !== "natural" ? ` ON ${condition}` : ""}`;
  return { columns, rows, steps, sql };
}

export const EXAMPLE = {
  A: "id, name, dept\n1, Asha, 10\n2, Ben, 20\n3, Cara, NULL\n4, Dev, 30",
  B: "dept, title\n10, Sales\n20, Design\n20, Research\n40, Legal",
  on: { left: "dept", right: "dept" },
};

export function randomTables(r = Math.random) {
  const names = ["Asha", "Ben", "Cara", "Dev", "Esa", "Femi"];
  const keys = [1, 2, 3, 4];
  const pick = () => (r() < 0.12 ? "NULL" : keys[Math.floor(r() * keys.length)]);
  const nA = 3 + Math.floor(r() * 3), nB = 3 + Math.floor(r() * 2);
  const A = ["id, name, k", ...Array.from({ length: nA }, (_, i) => `${i + 1}, ${names[i]}, ${pick()}`)].join("\n");
  const B = ["k, label", ...Array.from({ length: nB }, (_, i) => `${pick()}, ${String.fromCharCode(97 + i)}`)].join("\n");
  return { A, B, on: { left: "k", right: "k" } };
}
