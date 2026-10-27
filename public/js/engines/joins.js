// SQL joins evaluated the way a nested-loop join reads them: every pair of
// rows is compared, and each comparison is a step. Steps carry the pseudocode
// `line` and the `vars` at that moment. The second half runs the physical join
// algorithms (nested-loop, block nested-loop, sort-merge, hash) on a toy disk
// and estimates their I/O cost with the textbook formulas.
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

// Pseudocode for the nested-loop evaluation of each logical join. `cond` is
// the ON condition as text (e.g. "a.dept = b.dept").
export function joinCode(type, cond = "a.x = b.y") {
  const c = type === "cross" ? "true  // no condition: every pair is kept" : type === "natural" ? "a, b agree on every shared column" : cond;
  switch (type) {
    case "left": return ["for each row a in A", "  matched ← false", "  for each row b in B", `    if ${c} then`, "      output a · b; matched ← true", "  if not matched then", "    output a · NULLs  // keep the unmatched A row"];
    case "right": return ["for each row a in A", "  for each row b in B", `    if ${c} then`, "      output a · b; mark b as matched", "for each row b in B not marked", "  output NULLs · b  // keep the unmatched B row"];
    case "full": return ["for each row a in A", "  matched ← false", "  for each row b in B", `    if ${c} then`, "      output a · b; matched ← true; mark b", "  if not matched then output a · NULLs", "for each row b in B not marked", "  output NULLs · b"];
    case "semi": return ["for each row a in A", "  for each row b in B", `    if ${c} then`, "      output a; go to the next a  // EXISTS stops at the first match"];
    case "anti": return ["for each row a in A", "  found ← false", "  for each row b in B", `    if ${c} then`, "      found ← true; stop scanning B  // NOT EXISTS is now false", "  if not found then output a"];
    default: return ["for each row a in A", "  for each row b in B", `    if ${c} then`, "      output a · b"];
  }
}

// Which pseudocode line each kind of step is on, per join type.
const LINES = {
  inner: { cmp: 3, out: 4 }, cross: { cmp: 3, out: 4 }, natural: { cmp: 3, out: 4 },
  left: { cmp: 4, out: 5, pad: [6, 7] },
  right: { cmp: 3, out: 4, padB: [5, 6] },
  full: { cmp: 4, out: 5, pad: 6, padB: [7, 8] },
  semi: { cmp: 3, out: 4, drop: 2 },
  anti: { cmp: 4, out: 5, keep: 6 },
};

export function join(A, B, type, on = {}) {
  const spec = JOINS[type];
  if (!spec) throw new Error(`Unknown join ${type}`);
  let match, condition, common = [];
  if (type === "natural") {
    common = A.columns.filter((c) => B.columns.includes(c));
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
  const code = joinCode(type, type === "natural" || type === "cross" ? undefined : `a.${on.left} = b.${on.right}`);
  const L = LINES[type];

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
  // The values the condition looks at, for the variables panel.
  const keyVars = (a, b) => {
    if (type === "cross") return {};
    const cols = type === "natural" ? common.map((c) => [c, c]) : [[on.left, on.right]];
    const out = {};
    for (const [l, r] of cols) {
      if (a) out[`a.${l}`] = show(a[A.columns.indexOf(l)]);
      if (b) out[`b.${r}`] = show(b[B.columns.indexOf(r)]);
    }
    return out;
  };
  const why = (a, b) => {
    if (!condition) return "CROSS JOIN pairs every row with every row";
    if (type === "natural") {
      const parts = common.map((c) => `${c}: ${show(a[A.columns.indexOf(c)])} vs ${show(b[B.columns.indexOf(c)])}`).join(", ");
      return match(a, b) ? `${condition} holds (${parts})` : `${condition} doesn't hold (${parts})`;
    }
    const x = a[A.columns.indexOf(on.left)], y = b[B.columns.indexOf(on.right)];
    if (x === null || y === null) return `${show(x)} = ${show(y)} is UNKNOWN (NULL never matches)`;
    return x === y ? `${A.name}.${on.left} = ${show(x)} and ${B.name}.${on.right} = ${show(y)}, so ${show(x)} = ${show(y)} is TRUE` : `${show(x)} ≠ ${show(y)}, so the condition is FALSE`;
  };
  const tracked = type === "left" || type === "full" ? "matched" : type === "anti" ? "found" : null;

  A.rows.forEach((a, i) => {
    let found = false;
    for (let j = 0; j < B.rows.length; j++) {
      const b = B.rows[j];
      const ok = match(a, b);
      if (ok) { found = true; matchedB.add(j); }
      let note = `${A.name} row ${i + 1} vs ${B.name} row ${j + 1}: ${why(a, b)}`;
      const vars = () => ({ a: `${A.name} row ${i + 1}`, b: `${B.name} row ${j + 1}`, ...keyVars(a, b), ...(tracked ? { [tracked]: found } : {}), output: rows.length });
      if (spec.semi) {
        if (ok) {
          if (type === "semi") { rows.push([...a]); note += `, so a match EXISTS: ${A.name} row ${i + 1} is output once and the scan of ${B.name} stops (later matches can't add it twice).`; }
          else note += `, so NOT EXISTS is already false: ${A.name} row ${i + 1} is ruled out and the scan of ${B.name} stops.`;
          steps.push({ i, j, match: ok, note, rows: rows.length, line: [L.cmp, L.out], vars: vars() });
          break; // EXISTS stops at the first match
        }
        note += ", so keep looking.";
      } else if (ok) {
        rows.push(combine(a, b));
        note += type === "cross" ? " → output the pair." : ` → the pair satisfies ${type === "natural" ? "every shared column" : "ON"}, so a joined row is output.`;
      } else note += " → no output for this pair.";
      steps.push({ i, j, match: ok, note, rows: rows.length, line: ok ? [L.cmp, L.out] : L.cmp, vars: vars() });
    }
    if ((type === "left" || type === "full") && !found) {
      rows.push([...a, ...nullB]);
      steps.push({ i, j: null, pad: "right", note: `${A.name} row ${i + 1} matched no row of ${B.name} (matched is still false), so a ${spec.name} keeps it, with NULL in every ${B.name} column.`, rows: rows.length, line: L.pad, vars: { a: `${A.name} row ${i + 1}`, ...keyVars(a, null), matched: false, output: rows.length } });
    }
    if (type === "anti" && !found) {
      rows.push([...a]);
      steps.push({ i, j: null, note: `${A.name} row ${i + 1} has no match anywhere in ${B.name} (found is still false), so NOT EXISTS is true and it's kept.`, rows: rows.length, line: L.keep, vars: { a: `${A.name} row ${i + 1}`, ...keyVars(a, null), found: false, output: rows.length } });
    }
    if (type === "semi" && !found && B.rows.length) steps.push({ i, j: null, note: `${A.name} row ${i + 1} reached the end of ${B.name} without a match, so EXISTS is false and it's dropped.`, rows: rows.length, line: L.drop, vars: { a: `${A.name} row ${i + 1}`, ...keyVars(a, null), output: rows.length } });
  });
  if (type === "right" || type === "full") {
    B.rows.forEach((b, j) => {
      if (matchedB.has(j)) return;
      rows.push([...nullA, ...b]);
      steps.push({ i: null, j, pad: "left", note: `${B.name} row ${j + 1} was never marked as matched by any ${A.name} row, so it's kept with NULL in every ${A.name} column.`, rows: rows.length, line: L.padB, vars: { b: `${B.name} row ${j + 1}`, ...keyVars(null, b), output: rows.length } });
    });
  }
  // Column order for RIGHT JOIN results stays A then B, as SQL prints it.
  const sql = spec.semi
    ? `SELECT * FROM ${A.name} WHERE ${type === "anti" ? "NOT " : ""}EXISTS (SELECT 1 FROM ${B.name} WHERE ${condition})`
    : `SELECT * FROM ${A.name} ${spec.sql} ${B.name}${condition && type !== "natural" ? ` ON ${condition}` : ""}`;
  return { columns, rows, steps, sql, code };
}

// --- Join algorithms ---------------------------------------------------------
// How a DBMS actually evaluates an equi-join r ⋈ s (r = A, s = B), on a toy
// disk: each relation is stored in blocks of `perBlock` rows. Every block read
// or written is one transfer; a seek is counted whenever the head has to move,
// i.e. the access isn't the block right after the previous one in the same file.

export const ALGORITHMS = {
  nlj: {
    name: "Nested-loop join",
    code: [
      "for each tuple tr in r  // read r block by block",
      "  for each tuple ts in s  // a full scan of s for EVERY tr",
      "    if tr[A] = ts[B] then",
      "      add tr · ts to the result",
    ],
  },
  bnlj: {
    name: "Block nested-loop join",
    code: [
      "for each block Br of r",
      "  for each block Bs of s  // one scan of s per BLOCK of r",
      "    for each tuple tr in Br",
      "      for each tuple ts in Bs",
      "        if tr[A] = ts[B] then",
      "          add tr · ts to the result",
    ],
  },
  merge: {
    name: "Sort-merge join",
    code: [
      "sort r on A and s on B  // skipped if already sorted",
      "pr ← first tuple of r; ps ← first tuple of s",
      "while pr ≠ null and ps ≠ null",
      "  if tr[A] < ts[B] then advance pr",
      "  else if tr[A] > ts[B] then advance ps",
      "  else  // equal keys",
      "    Ss ← ts and every following s tuple with the same key",
      "    for each tr with that key: add tr · (each tuple of Ss)",
      "return the result",
    ],
  },
  hash: {
    name: "Hash join",
    code: [
      "for each tuple ts in s: add ts to partition Hs[h(ts[B])]  // build input",
      "for each tuple tr in r: add tr to partition Hr[h(tr[A])]  // probe input",
      "for i ← 0 … nh − 1",
      "  read Hs[i] and build an in-memory hash index on it",
      "  for each tuple tr in Hr[i]",
      "    probe the index for ts with ts[B] = tr[A]",
      "    add tr · ts to the result for each match",
    ],
  },
};

const keyCmp = (x, y) => (typeof x === typeof y ? (x < y ? -1 : x > y ? 1 : 0) : typeof x === "number" ? -1 : 1);
export const hashOf = (v, nh) => (typeof v === "number" ? ((Math.floor(v) % nh) + nh) % nh : [...String(v)].reduce((s, c) => s + c.charCodeAt(0), 0) % nh);
const hashText = (v, nh) => (typeof v === "number" ? `h(${v}) = ${v} mod ${nh} = ${hashOf(v, nh)}` : `h('${v}') = (sum of character codes) mod ${nh} = ${hashOf(v, nh)}`);

export function runAlgorithm(A, B, algo, on, { perBlock = 2, buckets = 3 } = {}) {
  const spec = ALGORITHMS[algo];
  if (!spec) throw new Error(`Unknown join algorithm ${algo}.`);
  if (!Number.isInteger(perBlock) || perBlock < 1 || perBlock > 4) throw new Error("Rows per block must be between 1 and 4.");
  if (!Number.isInteger(buckets) || buckets < 2 || buckets > 5) throw new Error("Use 2 to 5 hash partitions.");
  const ia = A.columns.indexOf(on.left), ib = B.columns.indexOf(on.right);
  if (ia < 0 || ib < 0) throw new Error("Choose a column from each table to join on.");
  const ka = (ri) => A.rows[ri][ia], kb = (si) => B.rows[si][ib];
  const blockOf = (pos) => Math.floor(pos / perBlock);
  const nBlocks = (n) => Math.ceil(n / perBlock);
  const columns = [...A.columns.map((c) => `${A.name}.${c}`), ...B.columns.map((c) => `${B.name}.${c}`)];
  const rows = [], steps = [];
  let transfers = 0, seeks = 0, last = null;
  // One block access: returns a short description of its cost.
  const access = (file, block, write = false) => {
    transfers++;
    const seq = last && last.file === file && last.block === block - 1;
    if (!seq) seeks++;
    last = { file, block };
    return `${write ? "write" : "read"} ${file} block ${block + 1}: 1 transfer${seq ? ", no seek (the next block on disk)" : " + 1 seek"}`;
  };
  let mem = [], parts = null, sorted = null, ptr = null, probing = null;
  const snap = (line, note, extra = {}) => steps.push({
    line, note, rows: rows.length, transfers, seeks, mem: [...mem],
    parts: parts && { s: parts.s.map((p) => [...p]), r: parts.r.map((p) => [...p]) }, sorted, ptr: ptr && { ...ptr }, probing,
    hotR: [], hotS: [], ...extra,
    vars: { ...extra.vars, output: rows.length, transfers, seeks },
  });
  const out = (ri, si) => rows.push([...A.rows[ri], ...B.rows[si]]);
  const kA = `tr.${on.left}`, kB = `ts.${on.right}`;
  const cmpNote = (ri, si) => {
    const x = ka(ri), y = kb(si);
    if (x === null || y === null) return `r${ri + 1}.${on.left} = ${show(x)} vs s${si + 1}.${on.right} = ${show(y)}: NULL never matches.`;
    return x === y ? `r${ri + 1}.${on.left} = ${show(x)} = s${si + 1}.${on.right}: a match, so r${ri + 1} · s${si + 1} goes into the result.` : `r${ri + 1}.${on.left} = ${show(x)} ≠ ${show(y)} = s${si + 1}.${on.right}: no match.`;
  };
  const nr = A.rows.length, ns = B.rows.length;
  snap(null, `r = ${A.name} (${nr} rows, ${nBlocks(nr)} block${nBlocks(nr) === 1 ? "" : "s"}) and s = ${B.name} (${ns} rows, ${nBlocks(ns)} block${nBlocks(ns) === 1 ? "" : "s"}), ${perBlock} row${perBlock === 1 ? "" : "s"} per block. ${spec.name} on ${A.name}.${on.left} = ${B.name}.${on.right}.`, { vars: { n_r: nr, b_r: nBlocks(nr), n_s: ns, b_s: nBlocks(ns) } });

  if (algo === "nlj" || algo === "bnlj") {
    for (let br = 0; br < nBlocks(nr); br++) {
      const rIdx = A.rows.map((_, i) => i).filter((i) => blockOf(i) === br);
      mem = [`r:${br}`];
      snap(1, `Bring block ${br + 1} of r into memory: ${access("r", br)}.`, { hotR: rIdx, vars: { Br: br + 1 } });
      const scan = (ri) => {
        for (let bs = 0; bs < nBlocks(ns); bs++) {
          const sIdx = B.rows.map((_, i) => i).filter((i) => blockOf(i) === bs);
          mem = [`r:${br}`, `s:${bs}`];
          const io = access("s", bs);
          const again = bs === 0 && (algo === "nlj" ? ri > 0 : br > 0);
          snap(2, `${algo === "nlj" ? `Scan s for r${ri + 1}` : `Scan s once for the whole of r block ${br + 1}`}: ${io}.${again ? " s is read again from the start, so the head jumps back." : ""}`, { hotR: algo === "nlj" ? [ri] : rIdx, hotS: sIdx, vars: algo === "nlj" ? { tr: `r${ri + 1}`, Bs: bs + 1 } : { Br: br + 1, Bs: bs + 1 } });
          const pairs = algo === "nlj" ? sIdx.map((si) => [ri, si]) : rIdx.flatMap((r) => sIdx.map((si) => [r, si]));
          for (const [r, si] of pairs) {
            const ok = ka(r) !== null && ka(r) === kb(si);
            if (ok) out(r, si);
            const base = algo === "nlj" ? 3 : 5;
            snap(ok ? [base, base + 1] : base, cmpNote(r, si), { hotR: [r], hotS: [si], match: ok, vars: { ...(algo === "bnlj" ? { Br: br + 1, Bs: bs + 1 } : {}), tr: `r${r + 1}`, ts: `s${si + 1}`, [kA]: show(ka(r)), [kB]: show(kb(si)) } });
          }
        }
      };
      if (algo === "nlj") for (const ri of rIdx) scan(ri); else scan(null);
    }
  } else if (algo === "merge") {
    const order = (n, key) => Array.from({ length: n }, (_, i) => i).filter((i) => key(i) !== null).sort((x, y) => keyCmp(key(x), key(y)) || x - y);
    const R = order(nr, ka), S = order(ns, kb);
    sorted = { r: R, s: S };
    const dropped = nr - R.length + ns - S.length;
    snap(1, `Sort r on ${on.left} and s on ${on.right} (shown sorted below).${dropped ? ` ${dropped} row${dropped === 1 ? " has" : "s have"} a NULL key and can never match, so ${dropped === 1 ? "it is" : "they are"} left out.` : ""} Sorting costs extra I/O unless the relations are already sorted: see the cost estimate.`, { vars: {} });
    const inMem = { r: -1, s: -1 };
    const load = (file, pos) => {
      const b = blockOf(pos);
      if (inMem[file] === b) return "";
      inMem[file] = b;
      mem = [inMem.r >= 0 ? `r:${inMem.r}` : null, inMem.s >= 0 ? `s:${inMem.s}` : null].filter(Boolean);
      return ` (${access(file, b)})`;
    };
    let p = 0, q = 0;
    ptr = { r: 0, s: 0 };
    const io0 = (R.length ? load("r", 0) : "") + (S.length ? load("s", 0) : "");
    const pv = () => ({ pr: p < R.length ? `r${R[p] + 1}` : "null", ps: q < S.length ? `s${S[q] + 1}` : "null" });
    snap(2, `Point pr at the first tuple of sorted r and ps at the first tuple of sorted s${io0}.`, { hotR: R.slice(0, 1), hotS: S.slice(0, 1), vars: pv() });
    while (p < R.length && q < S.length) {
      const x = ka(R[p]), y = kb(S[q]), c = keyCmp(x, y);
      if (c < 0) {
        snap(4, `${show(x)} < ${show(y)}: s is sorted, so no tuple of s from here on can match r${R[p] + 1}. Advance pr.`, { hotR: [R[p]], hotS: [S[q]], match: false, vars: { ...pv(), [kA]: show(x), [kB]: show(y) } });
        p++; ptr = { r: p, s: q };
        if (p < R.length) { const io = load("r", p); if (io) snap(4, `pr moves into the next block of r${io}.`, { hotR: [R[p]], vars: pv() }); }
      } else if (c > 0) {
        snap(5, `${show(x)} > ${show(y)}: ts is smaller than every key left in r, so it can't match anything. Advance ps.`, { hotR: [R[p]], hotS: [S[q]], match: false, vars: { ...pv(), [kA]: show(x), [kB]: show(y) } });
        q++; ptr = { r: p, s: q };
        if (q < S.length) { const io = load("s", q); if (io) snap(5, `ps moves into the next block of s${io}.`, { hotS: [S[q]], vars: pv() }); }
      } else {
        const group = [];
        let io = "";
        while (q < S.length && kb(S[q]) === x) { io += load("s", q); group.push(S[q]); q++; }
        ptr = { r: p, s: q };
        const ss = group.map((si) => `s${si + 1}`);
        snap([6, 7], `Keys equal (${show(x)}). Gather Ss = every s tuple with key ${show(x)}: ${ss.join(", ")}${io}. ps moves past them.`, { hotR: [R[p]], hotS: group, match: true, vars: { ...pv(), key: show(x), Ss: ss } });
        while (p < R.length && ka(R[p]) === x) {
          for (const si of group) out(R[p], si);
          snap(8, `r${R[p] + 1} has key ${show(x)}: join it with all of Ss, adding ${group.length} row${group.length === 1 ? "" : "s"}.`, { hotR: [R[p]], hotS: group, match: true, vars: { ...pv(), key: show(x), Ss: ss } });
          p++; ptr = { r: p, s: q };
          if (p < R.length) { const io2 = load("r", p); if (io2) snap(8, `pr moves into the next block of r${io2}.`, { hotR: [R[p]], vars: pv() }); }
        }
      }
    }
    snap(9, `${p >= R.length ? "r" : "s"} is used up, so nothing further can match. Each block of each sorted relation was read exactly once.`, { vars: pv() });
  } else {
    const nh = buckets;
    parts = { s: Array.from({ length: nh }, () => []), r: Array.from({ length: nh }, () => []) };
    const written = { s: Array(nh).fill(0), r: Array(nh).fill(0) };
    const partition = (file, n, key, line) => {
      const P = parts[file], buf = Array(nh).fill(0), H = `H${file}`;
      const hotKey = file === "r" ? "hotR" : "hotS", tv = file === "r" ? "tr" : "ts", kv = file === "r" ? kA : kB;
      for (let b = 0; b < nBlocks(n); b++) {
        mem = [`${file}:${b}`];
        snap(line, `Partition ${file}: ${access(file, b)}.`, { [hotKey]: Array.from({ length: n }, (_, i) => i).filter((i) => blockOf(i) === b), vars: { block: b + 1 } });
        for (let t = b * perBlock; t < Math.min(n, (b + 1) * perBlock); t++) {
          const v = key(t);
          if (v === null) { snap(line, `${file}${t + 1} has a NULL key: it can never match, so it isn't put in any partition.`, { [hotKey]: [t], vars: { [tv]: `${file}${t + 1}`, [kv]: "NULL" } }); continue; }
          const i = hashOf(v, nh);
          P[i].push(t); buf[i]++;
          let io = "";
          if (buf[i] === perBlock) { io = ` The output buffer for ${H}${i} is full: ${access(`${H}${i}`, written[file][i]++, true)}.`; buf[i] = 0; }
          snap(line, `${hashText(v, nh)}, so ${file}${t + 1} goes to partition ${H}${i}.${io}`, { [hotKey]: [t], part: { file, i }, vars: { [tv]: `${file}${t + 1}`, [kv]: show(v), i } });
        }
      }
      const partial = buf.map((c, i) => [c, i]).filter(([c]) => c > 0);
      if (partial.length) {
        const ios = partial.map(([, i]) => access(`${H}${i}`, written[file][i]++, true));
        snap(line, `Flush the partly filled output buffers: ${ios.join("; ")}. Partly filled blocks are why the cost formula adds 4·nh.`, { vars: {} });
      }
    };
    snap(1, `Use nh = ${nh} partitions and h(v) = v mod ${nh}. s (${B.name}) is the build input. Tuples with equal keys always hash to the same partition, so only Hr[i] and Hs[i] ever need comparing.`, { vars: { nh } });
    partition("s", ns, kb, 1);
    partition("r", nr, ka, 2);
    for (let i = 0; i < nh; i++) {
      probing = i;
      const hs = parts.s[i], hr = parts.r[i];
      const reads = [];
      for (let b = 0; b < written.s[i]; b++) reads.push(access(`Hs${i}`, b));
      mem = [`Hs${i}`];
      snap([3, 4], `Partition ${i}: read Hs${i} (${hs.length} tuple${hs.length === 1 ? "" : "s"}${reads.length ? `; ${reads.join("; ")}` : ", nothing to read"}) and build an in-memory hash index on ${on.right}.`, { hotS: hs, vars: { i, "|Hs[i]|": hs.length, "|Hr[i]|": hr.length } });
      if (!hr.length) { snap(5, `Hr${i} is empty, so partition ${i} adds nothing.`, { vars: { i } }); continue; }
      for (let b = 0; b < written.r[i]; b++) {
        mem = [`Hs${i}`, `Hr${i}`];
        const chunk = hr.slice(b * perBlock, (b + 1) * perBlock);
        snap(5, `Read the next block of Hr${i}: ${access(`Hr${i}`, b)}.`, { hotR: chunk, vars: { i } });
        for (const ri of chunk) {
          const m = hs.filter((si) => kb(si) === ka(ri));
          m.forEach((si) => out(ri, si));
          snap(m.length ? [6, 7] : 6, m.length
            ? `Probe with r${ri + 1}.${on.left} = ${show(ka(ri))}: the index finds ${m.map((si) => `s${si + 1}`).join(", ")}, so ${m.length} row${m.length === 1 ? " is" : "s are"} output.`
            : `Probe with r${ri + 1}.${on.left} = ${show(ka(ri))}: ${hs.length ? `nothing in Hs${i} has that key (they only share the hash value ${i})` : `Hs${i} is empty`}, so no output.`,
          { hotR: [ri], hotS: m, match: m.length > 0, vars: { i, tr: `r${ri + 1}`, [kA]: show(ka(ri)), matches: m.map((si) => `s${si + 1}`) } });
        }
      }
    }
    probing = null;
  }
  mem = [];
  snap(null, `Done: ${rows.length} row${rows.length === 1 ? "" : "s"}, ${transfers} block transfers and ${seeks} seeks (writing the result isn't counted).`, { done: true, vars: {} });
  return { columns, rows, steps, transfers, seeks, code: spec.code, perBlock, blocks: { r: nBlocks(nr), s: nBlocks(ns) } };
}

// --- I/O cost estimates (Silberschatz, Database System Concepts, ch. 15) -------
// r is the outer / probe relation, s the inner relation. Block transfers and
// seeks are counted separately; writing the final result is not counted.
const sortPasses = (b, M) => (b <= M ? 0 : Math.ceil(Math.log(b / M) / Math.log(M - 1) - 1e-9));
export const sortCost = (b, M) => {
  const p = sortPasses(b, M);
  return { transfers: b * (2 * p + 1), seeks: 2 * Math.ceil(b / M) + b * Math.max(0, 2 * p - 1), passes: p };
};

export function costs({ nr, br, ns, bs, M, rSorted = false, sSorted = false }) {
  for (const [k, v] of Object.entries({ n_r: nr, b_r: br, n_s: ns, b_s: bs, M })) if (!Number.isInteger(v) || v < 1) throw new Error(`${k} must be a whole number of at least 1.`);
  if (M < 3) throw new Error("M must be at least 3 (one block for each input and one for the output).");
  const groups = Math.ceil(br / (M - 2));
  const none = { transfers: 0, seeks: 0, passes: 0 };
  const sr = rSorted ? none : sortCost(br, M), ss = sSorted ? none : sortCost(bs, M);
  const build = Math.min(br, bs);
  const fits = build <= M - 2;
  const nh = fits ? 0 : Math.ceil(build / M);
  const rows = [
    { id: "nlj", name: "Nested-loop (worst case)", transfers: nr * bs + br, seeks: nr + br, formula: "n_r·b_s + b_r transfers; n_r + b_r seeks" },
    { id: "bnlj", name: "Block nested-loop, M = 3 (worst case)", transfers: br * bs + br, seeks: 2 * br, formula: "b_r·b_s + b_r transfers; 2·b_r seeks" },
    { id: "bnlj-m", name: `Block nested-loop, M = ${M}`, transfers: groups * bs + br, seeks: 2 * groups, formula: "⌈b_r/(M−2)⌉·b_s + b_r transfers; 2⌈b_r/(M−2)⌉ seeks" },
    { id: "merge", name: `Sort-merge${rSorted && sSorted ? " (both already sorted)" : ""}`, transfers: br + bs + sr.transfers + ss.transfers, seeks: br + bs + sr.seeks + ss.seeks, formula: "b_r + b_s, plus b(2⌈log_{M−1}(b/M)⌉ + 1) to sort each unsorted input" },
    { id: "hash", name: "Hash join", transfers: fits ? br + bs : 3 * (br + bs) + 4 * nh, seeks: fits ? 2 : 2 * (br + bs) + 2 * nh, formula: fits ? "b_r + b_s: the smaller input fits in memory, so no partitioning" : `3(b_r + b_s) + 4·n_h transfers; 2(b_r + b_s) + 2·n_h seeks, n_h = ⌈b/M⌉ = ${nh}`, nh, recursive: !fits && nh + 1 > M },
  ];
  if (fits) rows.splice(3, 0, { id: "best", name: "Block nested-loop (smaller fits in memory)", transfers: br + bs, seeks: 2, formula: "b_r + b_s transfers; 2 seeks" });
  const best = rows.reduce((a, b) => (b.transfers < a.transfers || (b.transfers === a.transfers && b.seeks < a.seeks) ? b : a));
  return { rows, best: best.id, sort: { r: sr, s: ss }, nh };
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
