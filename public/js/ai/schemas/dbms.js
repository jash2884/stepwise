// AI tool schemas: dbms. See ../schema-kit.js for the shape.
import { tool, round } from "../schema-kit.js";
import { BPlusTree } from "../../engines/bptree.js";
import { BTree, CLRS_18_8 } from "../../engines/btree.js";
import { ALGOS as FD_ALGOS, parseAttrs, parseFds, candidateKeys, closure, normalForm, minimalCover, synthesize3NF, decomposeBCNF, fdText } from "../../engines/fd.js";
import { JOINS, ALGORITHMS as JOIN_ALGOS, EXAMPLE as JOIN_EXAMPLE, parseTable, join, runAlgorithm, costs } from "../../engines/joins.js";
import { optimise, estimate, EXAMPLES as QUERY_EXAMPLES } from "../../engines/query.js";
import { analyse as analyseSchedule, EXAMPLES as SCHEDULE_EXAMPLES } from "../../engines/schedules.js";
import { run as runProtocol, PROTOCOLS, EXAMPLES as CC_EXAMPLES } from "../../engines/concurrency.js";
import { ALGORITHMS as RECOVERY, EXAMPLES as RECOVERY_EXAMPLES, parseLog, parseValues, recover } from "../../engines/recovery.js";
import { STRATEGIES, EXAMPLE as HASH_EXAMPLE, EXTENDIBLE_EXAMPLE, parseKeys as parseHashKeys, hashTable, extendible } from "../../engines/hashing.js";
import { EXAMPLES as ER_EXAMPLES, parseER, mapER, layoutER } from "../../engines/er.js";

// bptree.js / btree.js: ops = "i10,d5,s7" (insert, delete, search), replayed in order.
function readOps(text, letters) {
  const ops = String(text).split(",").map((o) => o.trim()).filter(Boolean);
  for (const o of ops) {
    if (!/^[ids]/.test(o) || !(/^.-?\d+$/.test(o) || (letters && /^.[A-Za-z]$/.test(o)))) throw new Error(`Can't read operation "${o}". Write i10 to insert 10, d10 to delete it, s10 to search for it, separated by commas.`);
  }
  if (ops.length > 120) throw new Error("Use at most 120 operations.");
  return ops;
}
const T = (t) => `T${t}`;
const yes = (b) => (b ? "yes" : "no");

export const SCHEMAS = [
  tool("b-plus-tree", {
    keywords: "b+ tree bplus tree b plus tree index insertion deletion leaf split internal split copy up push up borrow merge redistribution order fan-out height dbms indexing",
    params: {
      order: { type: "int", min: 3, max: 7, default: 4, desc: "order n = maximum children per node, so at most n - 1 keys per node" },
      ops: { type: "string", format: "operations in order separated by commas: i10 inserts 10, d10 deletes 10, s10 searches for 10", default: "i10,i20,i5,i6,i12,i30,i7,i17", desc: "the operations, starting from an empty tree" },
    },
    answers: { height: "height of the tree (levels, a single leaf is 1)", leaves: "number of leaves", nodes: "total number of nodes", internal: "number of internal (non-leaf) nodes", keys: "number of keys stored", root: "keys in the root", leafKeys: "the leaves left to right, e.g. 5 6 | 7 10 | 12 17", found: "result of the last search: yes or no (only when ops has a search)" },
    examples: [
      { request: "Insert 10, 20, 5, 6, 12, 30, 7, 17 into a B+ tree of order 4. What does the root hold?", params: { order: 4, ops: "i10,i20,i5,i6,i12,i30,i7,i17" } },
      { request: "B+ tree of order 3: insert 1 to 7 then delete 4, how many leaves?", params: { order: 3, ops: "i1,i2,i3,i4,i5,i6,i7,d4" } },
    ],
    validate(v) {
      const tree = new BPlusTree(v.order);
      let found = null;
      for (const op of readOps(v.ops, false)) {
        const k = Number(op.slice(1));
        if (op[0] === "i") tree.insert(k); else if (op[0] === "d") tree.delete(k); else found = tree.search(k).found;
      }
      const f = tree.facts();
      let nodes = 0;
      const walk = (id) => { nodes++; tree.node(id).children.forEach(walk); };
      walk(tree.root);
      const values = { height: f.height, leaves: f.leafCount, nodes, internal: nodes - f.leafCount, keys: f.leaves.flat().length, root: f.root.join(" ") || "empty", leafKeys: f.leaves.map((l) => l.join(" ")).join(" | ") };
      if (found !== null) values.found = yes(found);
      return { text: `Order ${v.order} B+ tree: height ${f.height}, root [${f.root.join(", ")}], ${f.leafCount} leaves: ${values.leafKeys}.${found !== null ? ` Last search: ${found ? "found" : "not found"}.` : ""}`, values };
    },
  }),

  tool("b-tree", {
    keywords: "b tree btree minimum degree t clrs insertion deletion split median predecessor successor borrow merge 2-3-4 tree multiway search tree height",
    params: {
      t: { type: "int", min: 2, max: 4, default: 3, desc: "minimum degree t: every node except the root has t - 1 to 2t - 1 keys (t = 2 is a 2-3-4 tree)" },
      tree: { type: "string", format: "levels separated by /, nodes in a level by |, keys in a node by spaces, e.g. P / C G M | T X / A B | D E F | ...; a single space \" \" means an empty tree", default: CLRS_18_8, desc: "the starting tree (default CLRS figure 18.8)" },
      ops: { type: "string", format: "operations in order separated by commas: i10 inserts 10, d10 deletes 10, s10 searches; keys are numbers or single letters", default: "dF,dM,dG,dD,dB", desc: "the operations applied to the starting tree" },
    },
    answers: { height: "height of the tree (levels)", nodes: "number of nodes", keys: "number of keys stored", root: "keys in the root", levels: "the tree level by level, e.g. 4 / 2 | 6 8 / 1 | 3 | 5 | 7 | 9 10", found: "result of the last search: yes or no (only when ops has a search)" },
    examples: [
      { request: "Insert 1 to 10 in order into an empty B-tree of minimum degree 2. What is the final tree?", params: { t: 2, tree: " ", ops: "i1,i2,i3,i4,i5,i6,i7,i8,i9,i10" } },
      { request: "CLRS figure 18.8: delete F, M, G, D, B from the t = 3 B-tree", params: { t: 3, tree: CLRS_18_8, ops: "dF,dM,dG,dD,dB" } },
    ],
    validate(v) {
      const tree = v.tree ? BTree.fromLevels(v.t, v.tree) : new BTree(v.t);
      let found = null;
      for (const op of readOps(v.ops, true)) {
        const s = op.slice(1), k = /^-?\d+$/.test(s) ? Number(s) : s.toUpperCase();
        if (op[0] === "i") tree.insert(k); else if (op[0] === "d") tree.delete(k); else found = tree.search(k).found;
      }
      const f = tree.facts();
      const values = { height: f.height, nodes: f.nodes, keys: f.keys.length, root: f.root.join(" ") || "empty", levels: tree.levels() };
      if (found !== null) values.found = yes(found);
      return { text: `B-tree with t = ${v.t}: height ${f.height}, ${f.nodes} nodes, ${f.keys.length} keys; levels ${values.levels}.${found !== null ? ` Last search: ${found ? "found" : "not found"}.` : ""}`, values };
    },
  }),

  tool("normalization", {
    keywords: "normalisation normalization functional dependency fd candidate key super key prime attribute closure attribute closure minimal cover canonical cover 1nf 2nf 3nf bcnf highest normal form partial dependency transitive dependency decomposition lossless dependency preserving",
    params: {
      r: { type: "string", format: "single-letter attribute names run together, e.g. ABCDE (at most 10)", default: "ABCDE", desc: "the relation's attributes" },
      fd: { type: "string", format: "dependencies separated by ;, each like AB->C (at most 12)", default: "A -> B;B -> C;A -> D;D -> E", desc: "the functional dependencies" },
      x: { type: "string", format: "attribute letters, e.g. AB", default: "", desc: "attributes to take the closure of (empty: the first candidate key)" },
      algo: { type: "enum", values: Object.keys(FD_ALGOS), default: "keys", desc: "which algorithm to step through: closure, keys, nf (normal form check), cover (minimal cover), three (3NF synthesis), bcnf (BCNF decomposition)" },
    },
    answers: { keys: "candidate keys, e.g. AB, AC", keyCount: "number of candidate keys", prime: "prime attributes", highestNF: "highest normal form: 1NF, 2NF, 3NF or BCNF", closure: "closure of x (or of the first key)", cover: "a minimal cover", threeNF: "3NF synthesis relations", bcnf: "BCNF decomposition relations", lost: "dependencies the BCNF decomposition doesn't preserve, or none" },
    examples: [
      { request: "R(A, B, C, D, E) with A -> B, B -> C, A -> D, D -> E. Candidate keys and highest normal form?", params: { r: "ABCDE", fd: "A->B;B->C;A->D;D->E", algo: "nf" } },
      { request: "Find all candidate keys of R(ABCDEF) with AB->C, C->D, D->E, E->F, F->A", params: { r: "ABCDEF", fd: "AB->C;C->D;D->E;E->F;F->A", algo: "keys" } },
    ],
    validate(v) {
      const attrs = parseAttrs(v.r);
      const fds = parseFds(v.fd, attrs);
      const keys = candidateKeys(attrs, fds);
      const nf = normalForm(attrs, fds);
      const cover = minimalCover(fds).cover;
      const three = synthesize3NF(attrs, fds), bcnf = decomposeBCNF(attrs, fds);
      const x = (v.x.toUpperCase().replace(/[^A-Z]/g, "")) || keys.keys[0];
      const cl = closure(x, fds).closure;
      const rel = (list) => list.map((r) => `R(${typeof r === "string" ? r : r.attrs ?? r})`).join(", ");
      const values = {
        keys: keys.keys.join(", "), keyCount: keys.keys.length, prime: keys.prime || "none", highestNF: nf.form, closure: `${x}+ = ${cl}`,
        cover: cover.map(fdText).join(", "), threeNF: rel(three.relations), bcnf: rel(bcnf.relations), lost: bcnf.lost?.length ? bcnf.lost.map(fdText).join(", ") : "none",
      };
      return { text: `Candidate key${keys.keys.length === 1 ? "" : "s"}: ${values.keys}. Highest normal form: ${nf.form}. ${values.closure}.`, values };
    },
  }),

  tool("sql-joins", {
    keywords: "sql join inner join left outer join right outer join full outer join cross join natural join semi join anti join exists not exists null nested loop join block nested loop join sort merge join hash join block transfers seeks join cost io cost",
    params: {
      mode: { type: "enum", values: ["logic", "algo"], default: "logic", desc: "logic: the SQL meaning of a join on two small tables; algo: run a join algorithm on them block by block" },
      a: { type: "string", format: "rows separated by ;, values by commas, first row the column names; NULL for a missing value (at most 10 rows)", default: JOIN_EXAMPLE.A.split("\n").join(";"), desc: "table A (r, the outer relation)" },
      b: { type: "string", format: "same format as a", default: JOIN_EXAMPLE.B.split("\n").join(";"), desc: "table B (s, the inner relation)" },
      type: { type: "enum", values: Object.keys(JOINS), default: "left", desc: "logic mode: inner, left, right, full, cross, natural, semi (WHERE EXISTS), anti (WHERE NOT EXISTS)" },
      l: { type: "string", default: JOIN_EXAMPLE.on.left, desc: "join column of A (ON A.l = B.rc)" },
      rc: { type: "string", default: JOIN_EXAMPLE.on.right, desc: "join column of B" },
      alg: { type: "enum", values: Object.keys(JOIN_ALGOS), default: "bnlj", desc: "algo mode: nlj (nested-loop), bnlj (block nested-loop), merge (sort-merge), hash" },
      pb: { type: "int", min: 1, max: 4, default: 2, desc: "algo mode: rows per block" },
      nh: { type: "int", min: 2, max: 5, default: 3, desc: "algo mode, hash join: number of partitions" },
      c: { type: "string", format: "n_r,b_r,n_s,b_s,M: tuples and blocks of r, tuples and blocks of s, memory blocks M (at least 3)", default: "5000,100,10000,400,20", desc: "sizes for the I/O cost estimate (Silberschatz formulas); independent of the tables" },
      srt: { type: "string", format: "empty, r, s or rs", default: "", desc: "cost estimate: which inputs are already sorted (for sort-merge)" },
    },
    answers: { rows: "rows in the join result (logic or algo mode)", transfers: "algo mode: block transfers the simulated run made", seeks: "algo mode: seeks the simulated run made", "cost.nlj": "estimated block transfers for nlj (also cost.bnlj with M = 3, cost.bnlj-m with M blocks, cost.merge, cost.hash, and cost.best when the smaller relation fits)", "seeks.nlj": "estimated seeks, same ids as cost", cheapest: "cheapest algorithm in the estimate" },
    examples: [
      { request: "r has 5000 tuples in 100 blocks, s has 10000 tuples in 400 blocks, M = 20. Block transfers for nested loop, block nested loop and hash join?", params: { mode: "algo", c: "5000,100,10000,400,20" } },
      { request: "LEFT JOIN employees (id, name, dept) with departments (dept, title) on dept: how many rows?", params: { mode: "logic", type: "left", a: "id, name, dept;1, Asha, 10;2, Ben, 20;3, Cara, NULL", b: "dept, title;10, Sales;20, Design;20, Research", l: "dept", rc: "dept" } },
    ],
    validate(v) {
      const A = parseTable("A", v.a.replace(/;/g, "\n")), B = parseTable("B", v.b.replace(/;/g, "\n"));
      // The view quietly falls back to a shared column when a name is missing.
      const left = A.columns.includes(v.l) ? v.l : A.columns.find((c) => B.columns.includes(c)) ?? A.columns[0];
      const right = B.columns.includes(v.rc) ? v.rc : B.columns.includes(left) ? left : B.columns[0];
      const values = {};
      let text;
      if (v.mode === "logic") {
        const res = join(A, B, v.type, { left, right });
        values.rows = res.rows.length;
        text = `${JOINS[v.type].name} gives ${res.rows.length} row${res.rows.length === 1 ? "" : "s"} (${res.sql}).`;
      } else {
        const res = runAlgorithm(A, B, v.alg, { left, right }, { perBlock: v.pb, buckets: v.nh });
        Object.assign(values, { rows: res.rows.length, transfers: res.transfers, seeks: res.seeks });
        text = `${JOIN_ALGOS[v.alg].name} on A and B: ${res.rows.length} result rows, ${res.transfers} block transfers and ${res.seeks} seeks.`;
      }
      if (!/^(r|s|rs|sr)?$/.test(v.srt)) throw new Error('srt must be empty, "r", "s" or "rs".');
      const [nr, br, ns, bs, M] = v.c.split(",").map(Number);
      const c = costs({ nr, br, ns, bs, M, rSorted: v.srt.includes("r"), sSorted: v.srt.includes("s") });
      for (const row of c.rows) { values[`cost.${row.id}`] = row.transfers; values[`seeks.${row.id}`] = row.seeks; }
      values.cheapest = c.rows.find((r) => r.id === c.best).name;
      text += ` Cost estimate for n_r ${nr}, b_r ${br}, n_s ${ns}, b_s ${bs}, M ${M}: ${c.rows.map((r) => `${r.name} ${r.transfers}`).join(", ")} block transfers.`;
      return { text, values };
    },
  }),

  tool("query-processing", {
    keywords: "query processing query optimisation optimization relational algebra query tree heuristic optimisation push selection down join ordering projection selectivity cardinality estimation catalogue statistics canonical tree",
    params: {
      q: { type: "string", format: "SELECT ... FROM ... WHERE ... with AND-ed conditions (attribute = 'value', attribute = attribute, <, >)", default: QUERY_EXAMPLES.aquarius.query, desc: "the SQL query" },
      c: { type: "string", format: "one relation per entry separated by ;, each NAME n_r: attribute V(A, r) [min..max], ... e.g. EMPLOYEE 2000: Ssn 2000, Bdate 50 [1950..2000]", default: QUERY_EXAMPLES.aquarius.catalogue.split("\n").join(";"), desc: "catalogue statistics: tuple counts and distinct values per attribute" },
    },
    answers: { canonicalCost: "estimated work (intermediate tuples) of the canonical tree", optimisedCost: "estimated work after heuristic optimisation", result: "estimated number of result tuples", rules: "number of optimisation steps shown" },
    examples: [
      { request: "Optimise SELECT Lname FROM EMPLOYEE, WORKS_ON, PROJECT WHERE Pname = 'Aquarius' AND Pnumber = Pno AND Essn = Ssn AND Bdate > 1957", params: { q: QUERY_EXAMPLES.aquarius.query, c: QUERY_EXAMPLES.aquarius.catalogue.split("\n").join(";") } },
    ],
    validate(v) {
      const r = optimise(v.q, v.c.replace(/;/g, "\n"));
      const result = estimate(r.tree, r.cat).get(r.tree.id);
      return { text: `Heuristic optimisation cuts the estimated work from ${round(r.canonicalCost, 2)} to ${round(r.finalCost, 2)} intermediate tuples; the result is about ${round(result, 2)} tuples.`,
        values: { canonicalCost: round(r.canonicalCost, 2), optimisedCost: round(r.finalCost, 2), result: round(result, 2), rules: r.steps.length } };
    },
  }),

  tool("serializability", {
    keywords: "serialisability serializability conflict serialisable conflict serializable view serialisable view serializable precedence graph serialisation graph conflict equivalent serial schedule recoverable cascadeless strict schedule blind write dirty read",
    params: {
      s: { type: "string", format: "operations separated by spaces: R1(A) read, W2(B) write, C1 commit, A2 abort", default: SCHEDULE_EXAMPLES[2][1], desc: "the schedule" },
    },
    answers: { conflictSerializable: "true if conflict serialisable", viewSerializable: "true if view serialisable", edges: "number of edges in the precedence graph", edgeList: "the edges, e.g. T1->T2, T2->T3", cycle: "a cycle in the precedence graph, or none", serialOrder: "an equivalent serial order (e.g. T1 T2 T3), or none", recoverable: "true, false or unknown (needs a commit or abort per transaction)", cascadeless: "true, false or unknown", strict: "true, false or unknown" },
    examples: [
      { request: "Is R1(A) R2(A) W1(A) W2(A) C1 C2 conflict serialisable? Recoverable?", params: { s: "R1(A) R2(A) W1(A) W2(A) C1 C2" } },
      { request: "Check S: R1(A) W2(A) W1(A) W3(A) C1 C2 C3 for view serialisability", params: { s: "R1(A) W2(A) W1(A) W3(A) C1 C2 C3" } },
    ],
    validate(v) {
      const r = analyseSchedule(v.s);
      const rec = (k) => (r.recovery.known ? r.recovery[k] : "unknown");
      const order = r.order ?? r.viewOrder;
      const values = {
        conflictSerializable: r.conflictSerializable, viewSerializable: r.viewSerializable, edges: r.edges.length,
        edgeList: r.edges.map((e) => `${T(e.from)}->${T(e.to)}`).join(", ") || "none", cycle: r.cycle ? r.cycle.map(T).join(" -> ") : "none",
        serialOrder: order ? order.map(T).join(" ") : "none", recoverable: rec("recoverable"), cascadeless: rec("cascadeless"), strict: rec("strict"),
      };
      return { text: `${r.conflictSerializable ? `Conflict serialisable, equivalent to ${values.serialOrder}` : `Not conflict serialisable (cycle ${values.cycle})${r.viewSerializable ? `, but view serialisable as ${values.serialOrder}` : ", and not view serialisable"}`}. Precedence edges: ${values.edgeList}. Recoverable: ${values.recoverable}, cascadeless: ${values.cascadeless}, strict: ${values.strict}.`, values };
    },
  }),

  tool("concurrency-control", {
    keywords: "concurrency control two phase locking 2pl basic 2pl strict 2pl rigorous 2pl shared lock exclusive lock lock upgrade deadlock waits-for graph timestamp ordering thomas write rule rollback validation optimistic concurrency control occ",
    params: {
      p: { type: "enum", values: Object.keys(PROTOCOLS), default: "basic", desc: "basic, strict or rigorous 2PL; to (timestamp ordering); thomas (timestamp ordering with Thomas' write rule); occ (validation)" },
      s: { type: "string", format: "operations separated by spaces: R1(A) read, W2(B) write, C1 commit, A2 abort (a transaction without C or A commits after its last operation)", default: CC_EXAMPLES.deadlock.s, desc: "the schedule" },
      ts: { type: "enum", values: ["start", "number"], default: "start", desc: "timestamp ordering: timestamps by the order transactions start, or by transaction number" },
    },
    answers: { committed: "transactions that commit, e.g. T1 T2, or none", aborted: "transactions rolled back or aborted, or none", waits: "2PL: number of waits", deadlocks: "2PL: number of deadlocks found", deadlock: "2PL: the first deadlock cycle, or none", ignored: "Thomas' write rule: obsolete writes ignored" },
    examples: [
      { request: "Under basic 2PL, what happens with W1(B) R2(A) R2(B) W1(A) C1 C2?", params: { p: "basic", s: "W1(B) R2(A) R2(B) W1(A) C1 C2" } },
      { request: "Timestamp ordering with Thomas' write rule on R1(Q) W2(Q) W1(Q)", params: { p: "thomas", s: "R1(Q) W2(Q) W1(Q) C1 C2" } },
    ],
    validate(v) {
      const r = runProtocol(v.s, v.p, { ts: v.ts });
      const values = { committed: r.committed.map(T).join(" ") || "none", aborted: r.aborted.map(T).join(" ") || "none", waits: r.stats.waits, deadlocks: r.stats.deadlocks.length, deadlock: r.stats.deadlocks[0] ? r.stats.deadlocks[0].map((t) => (String(t).startsWith("T") ? t : T(t))).join(" -> ") : "none" };
      if (v.p === "thomas") values.ignored = r.stats.ignored ?? 0;
      return { text: `${PROTOCOLS[v.p].name}: committed ${values.committed}; aborted ${values.aborted}.${PROTOCOLS[v.p].family === "2pl" ? ` ${values.waits} wait${values.waits === 1 ? "" : "s"}, ${values.deadlocks} deadlock${values.deadlocks === 1 ? "" : "s"}.` : ""}`, values };
    },
  }),

  tool("recovery", {
    keywords: "log based recovery write ahead logging wal undo redo checkpoint aries analysis redo undo compensation log record clr crash recovery immediate update deferred update",
    params: {
      a: { type: "enum", values: Object.keys(RECOVERY), default: "undoRedo", desc: "undoRedo (Silberschatz undo/redo with checkpoints) or aries" },
      l: { type: "string", format: "one log record per line (newline separated): <T0 start>, <T0, A, 1000, 950> (update: old then new), <T0, A, 1000> (redo-only / CLR), <T0 commit>, <T0 abort>, <checkpoint {T0, T1}> (ARIES: add dirty A@2)", default: RECOVERY_EXAMPLES.checkpoint.log, desc: "the log, at most 40 records" },
      v: { type: "string", format: "initial values like A=1000, B=2000", default: RECOVERY_EXAMPLES.checkpoint.init, desc: "data item values before the log starts" },
      c: { type: "int", min: 0, max: 40, desc: "crash after this many records (default: at the end of the log)" },
    },
    answers: { values: "database values after recovery, e.g. A=950, B=2050", "value.A": "value of item A after recovery (one key per item)", undone: "transactions undone (losers), or none", redone: "transactions whose writes were redone, or none", committed: "transactions committed before the crash, or none" },
    examples: [
      { request: "Log: <T0 start> <T0, A, 1000, 950> <T0, B, 2000, 2050> <T0 commit> <T1 start> <T1, C, 700, 600>, crash. What is redone and undone?", params: { a: "undoRedo", l: "<T0 start>\n<T0, A, 1000, 950>\n<T0, B, 2000, 2050>\n<T0 commit>\n<T1 start>\n<T1, C, 700, 600>", v: "A=1000, B=2000, C=700" } },
      { request: "ARIES recovery for the fuzzy checkpoint example", params: { a: "aries", l: RECOVERY_EXAMPLES.aries.log, v: RECOVERY_EXAMPLES.aries.init } },
    ],
    validate(v) {
      if (!v.l.includes("\n") && (v.l.match(/</g) ?? []).length > 1) throw new Error("Put each log record on its own line (separate records with newlines).");
      const records = parseLog(v.l), init = parseValues(v.v);
      const crash = v.c === undefined ? records.length : Math.max(0, Math.min(records.length, v.c));
      const res = recover(records, crash, v.a, init);
      const values = { values: Object.entries(res.values).map(([k, x]) => `${k}=${x}`).join(", "), undone: res.undone.join(" ") || "none", redone: res.redone.join(" ") || "none", committed: res.committed.join(" ") || "none" };
      for (const [k, x] of Object.entries(res.values)) values[`value.${k}`] = x;
      return { text: `${RECOVERY[v.a].name}, crash after record ${crash}: redo ${values.redone}, undo ${values.undone}; values after recovery ${values.values}.`, values };
    },
  }),

  tool("hashing", {
    keywords: "hashing hash table open addressing linear probing quadratic probing double hashing separate chaining collision load factor mod hash function extendible hashing global depth local depth directory bucket split",
    params: {
      mode: { type: "enum", values: ["table", "extendible"], default: "table", desc: "table: a hash table with h(k) = k mod m; extendible: extendible hashing" },
      k: { type: "string", format: "whole numbers 0 to 99999 separated by spaces, at most 30", default: HASH_EXAMPLE.keys, desc: "table mode: keys inserted in order" },
      m: { type: "int", min: 2, max: 31, default: HASH_EXAMPLE.m, desc: "table mode: table size, h(k) = k mod m" },
      st: { type: "enum", values: Object.keys(STRATEGIES), default: "linear", desc: "table mode: chaining, linear, quadratic (h + i squared) or double hashing (h2 = R - k mod R, R the largest prime below m)" },
      ek: { type: "string", format: "whole numbers separated by spaces, at most 24", default: EXTENDIBLE_EXAMPLE.keys, desc: "extendible mode: keys inserted in order (uses the low bits)" },
      b: { type: "int", min: 1, max: 4, default: EXTENDIBLE_EXAMPLE.size, desc: "extendible mode: bucket size" },
    },
    answers: { "slot.89": "slot where key 89 ends up (one key per key; table mode)", "probes.89": "probes needed to insert key 89", collisions: "number of collisions", loadFactor: "load factor", longestChain: "chaining: longest chain length", failed: "keys that couldn't be inserted", table: "final table, slot: contents", globalDepth: "extendible: global depth", buckets: "extendible: number of buckets", directory: "extendible: directory size", "bucket.16": "extendible: bucket holding key 16, e.g. B2 (local depth d)" },
    examples: [
      { request: "Insert 89 18 49 58 69 into a table of size 10 with linear probing, where does 69 go?", params: { mode: "table", k: "89 18 49 58 69", m: 10, st: "linear" } },
      { request: "Extendible hashing with bucket size 2, insert 16 4 6 22 24 10 31 7 9 20 26: global depth?", params: { mode: "extendible", ek: "16 4 6 22 24 10 31 7 9 20 26", b: 2 } },
    ],
    validate(v) {
      const values = {};
      if (v.mode === "table") {
        const keys = parseHashKeys(v.k);
        const r = hashTable(keys, v.m, v.st);
        if (v.st === "chaining") {
          keys.forEach((k) => { values[`slot.${k}`] = k % v.m; });
          values.longestChain = Math.max(...r.table.map((c) => c.length));
          values.table = r.table.map((c, i) => (c.length ? `${i}: ${c.join(" ")}` : null)).filter(Boolean).join("; ");
        } else {
          for (const s of r.steps) { values[`slot.${s.key}`] = s.failed ? "failed" : s.slot; values[`probes.${s.key}`] = s.probes.length; }
          values.table = r.table.map((x, i) => (x === null ? null : `${i}: ${x}`)).filter(Boolean).join("; ");
        }
        Object.assign(values, { collisions: r.collisions, loadFactor: round(r.loadFactor), failed: r.steps.filter((s) => s.failed).length });
        return { text: `${STRATEGIES[v.st].name}, m = ${v.m}: ${values.table}. ${r.collisions} collision${r.collisions === 1 ? "" : "s"}.`, values };
      }
      const r = extendible(parseHashKeys(v.ek, 24), v.b);
      for (const b of r.buckets) for (const k of b.keys) values[`bucket.${k}`] = `B${b.id} (local depth ${b.local})`;
      Object.assign(values, { globalDepth: r.global, buckets: r.buckets.length, directory: r.dir.length });
      return { text: `Extendible hashing, bucket size ${v.b}: global depth ${r.global}, ${r.dir.length} directory entries, ${r.buckets.length} buckets (${r.buckets.map((b) => `B${b.id} [${b.keys.join(" ")}] d=${b.local}`).join(", ")}).`, values };
    },
  }),

  tool("er-to-relational", {
    keywords: "er diagram entity relationship model er to relational mapping chen notation weak entity identifying relationship 1:1 1:n m:n cardinality participation multivalued attribute composite attribute derived attribute specialisation generalisation isa foreign key primary key how many tables",
    params: {
      er: { type: "string", format: "one declaration per line (newline separated): entity NAME: *Key, Attr, {Multi}, Comp(Part, Part), /Derived; weak NAME of OWNER: ~Partial, Attr; rel NAME: ENTITY 1|N|M [total] [as ROLE], ENTITY ...; rel attributes; isa SUPER: SUB1, SUB2; disjoint|overlapping, total|partial", default: ER_EXAMPLES.company.text, desc: "the ER model" },
      spec: { type: "enum", values: ["a", "single"], default: "a", desc: "specialisation mapping: a = a table per subclass (8A); single = one table for the hierarchy (8C/8D)" },
    },
    answers: { tables: "number of tables", foreignKeys: "number of foreign keys", tableNames: "the table names", schema: "every table with its columns, PK and FK marks, separated by ;" },
    examples: [
      { request: "Entities STUDENT(*Sid, Name) and COURSE(*Cid, Title), M:N relationship ENROLS with Grade. How many tables?", params: { er: "entity STUDENT: *Sid, Name\nentity COURSE: *Cid, Title\nrel ENROLS: STUDENT M, COURSE N; Grade" } },
      { request: "Map the COMPANY ER schema from Elmasri and Navathe to relations", params: { er: ER_EXAMPLES.company.text } },
    ],
    validate(v) {
      const m = parseER(v.er);
      const res = mapER(m, { spec: v.spec });
      layoutER(m);
      const fks = res.tables.reduce((n, t) => n + t.fks.length, 0);
      const schema = res.tables.map((t) => `${t.name}(${t.cols.map((c) => `${c.name}${c.pk ? " PK" : ""}${c.fk ? ` FK->${c.fk}` : ""}`).join(", ")})`);
      return { text: `${res.tables.length} tables with ${fks} foreign key${fks === 1 ? "" : "s"}: ${schema.join("; ")}.`,
        values: { tables: res.tables.length, foreignKeys: fks, tableNames: res.tables.map((t) => t.name).join(", "), schema: schema.join("; ") } };
    },
  }),
];
