// Golden-set eval for /api/ai/ask against a running Worker:
//   npx --yes wrangler@4 dev --port 8831     (in another terminal)
//   node scripts/eval-ask.mjs [http://localhost:8831] [--only=hinglish] [--verbose]
// Each case names the tool it should route to and, for questions with an
// answer, the params that reproduce it; the expected answer is computed by the
// engine through the tool's schema, never typed in. Prints tool accuracy, param
// validity, answer accuracy, and how often a "verified" answer was wrong.
import { SCHEMA_BY_SLUG, check } from "../public/js/ai/tool-schemas.js";
import { same } from "../src/ai/ask/verify.ts";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:8831";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const verbose = process.argv.includes("--verbose");

// kind: typed | hinglish | textbook (has options) | concept
const CASES = [
  // --- Typed requests -----------------------------------------------------------------
  { kind: "typed", tool: "cpu-scheduling", q: "Round robin with time quantum 2: P1 arrives at 0 with burst 5, P2 at 1 with burst 3, P3 at 2 with burst 1. What is the average waiting time?", ask: "avgWT", gold: { algo: "rr", q: 2, p: "0-5-0_1-3-0_2-1-0" } },
  { kind: "typed", tool: "cpu-scheduling", q: "SRTF: processes arrive at 0, 1, 2, 3 with bursts 8, 4, 9, 5. Average turnaround time?", ask: "avgTAT", gold: { algo: "srtf", p: "0-8-0_1-4-0_2-9-0_3-5-0" } },
  { kind: "typed", tool: "page-replacement", q: "How many page faults does LRU give with 3 frames for 7 0 1 2 0 3 0 4 2 3 0 3 2?", ask: "faults", gold: { r: "7 0 1 2 0 3 0 4 2 3 0 3 2", f: 3, algo: "lru" } },
  { kind: "typed", tool: "page-replacement", q: "FIFO page replacement, 4 frames, reference string 1 2 3 4 1 2 5 1 2 3 4 5. Number of faults?", ask: "faults", gold: { r: "1 2 3 4 1 2 5 1 2 3 4 5", f: 4, algo: "fifo" } },
  { kind: "typed", tool: "disk-scheduling", q: "SSTF disk scheduling, head at 53, queue 98 183 37 122 14 124 65 67. Total head movement?", ask: "total" },
  { kind: "typed", tool: "sorting", q: "Show me quicksort on 5 3 8 1 9 2" },
  { kind: "typed", tool: "binary-search-tree", q: "Insert 50 30 70 20 40 60 80 into a BST and show the inorder traversal" },
  { kind: "typed", tool: "shortest-paths", q: "Run Dijkstra from A on the graph A-B 4, A-C 1, C-B 2, B-D 5, C-D 8" },
  { kind: "typed", tool: "subnetting", q: "What is the broadcast address of 192.168.10.77/26?" },
  { kind: "typed", tool: "error-detection", q: "CRC: data 1101011011 with generator 10011. What is the transmitted frame?" },
  { kind: "typed", tool: "nfa-to-dfa", q: "Convert this NFA to a DFA using subset construction" },
  { kind: "typed", tool: "first-follow", q: "Find FIRST and FOLLOW for E -> T E', E' -> + T E' | ε, T -> F T', T' -> * F T' | ε, F -> ( E ) | id" },
  { kind: "typed", tool: "k-map", q: "Minimise f(A,B,C,D) = Σm(0,1,2,5,8,9,10) with a K-map" },
  { kind: "typed", tool: "ieee-754", q: "Convert -6.75 to IEEE 754 single precision" },
  { kind: "typed", tool: "matrices", q: "Find the determinant of [[2,1,3],[0,4,1],[1,2,1]]" },
  { kind: "typed", tool: "bankers-algorithm", q: "Check whether the system is in a safe state with the banker's algorithm" },
  // --- Hinglish ------------------------------------------------------------------------
  { kind: "hinglish", tool: "cpu-scheduling", q: "FCFS mein average waiting time kitna hoga? P1 0 pe aata hai burst 24, P2 0 pe burst 3, P3 0 pe burst 3", ask: "avgWT", gold: { algo: "fcfs", p: "0-24-0_0-3-0_0-3-0" } },
  { kind: "hinglish", tool: "page-replacement", q: "optimal page replacement se 3 frames mein kitne page fault aayenge: 7 0 1 2 0 3 0 4 2 3", ask: "faults", gold: { r: "7 0 1 2 0 3 0 4 2 3", f: 3, algo: "optimal" } },
  { kind: "hinglish", tool: "binary-heap", q: "mujhe min heap mein insert karke dikhao 10 4 7 1 3" },
  { kind: "hinglish", tool: "dfa-minimization", q: "DFA ko minimise kaise karte hai, ek example dikhao" },
  { kind: "hinglish", tool: "tcp-congestion-control", q: "TCP slow start aur congestion avoidance samjhao, cwnd kaise badhta hai" },
  { kind: "hinglish", tool: "normalization", q: "R(A,B,C,D) with A->B, B->C ke candidate keys aur normal form batao" },
  { kind: "hinglish", tool: "graph-traversal", q: "BFS aur DFS ka order dikhao is graph pe" },
  { kind: "hinglish", tool: "lr-parsing", q: "SLR parsing table kaise banate hai" },
  // --- Textbook questions with options -------------------------------------------------
  { kind: "textbook", tool: "cpu-scheduling", stem: "Consider three processes P1, P2, P3 with arrival times 0, 1, 2 and burst times 5, 3, 1 ms, scheduled with Round Robin with a time quantum of 2 ms. What is the average waiting time?", options: ["2.67", "3.33", "4.00", "4.67"], ask: "avgWT", gold: { algo: "rr", q: 2, p: "0-5-0_1-3-0_2-1-0" } },
  { kind: "textbook", tool: "cpu-scheduling", stem: "Four jobs arrive at time 0 with burst times 6, 8, 7 and 3. Using non-preemptive shortest job first, what is the average waiting time?", options: ["7", "10.25", "6", "5.5"], ask: "avgWT", gold: { algo: "sjf", p: "0-6-0_0-8-0_0-7-0_0-3-0" } },
  { kind: "textbook", tool: "page-replacement", stem: "A process has 3 frames, initially empty, and references pages 1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5. How many page faults occur with FIFO?", options: ["8", "9", "10", "11"], ask: "faults", gold: { r: "1 2 3 4 1 2 5 1 2 3 4 5", f: 3, algo: "fifo" } },
  { kind: "textbook", tool: "page-replacement", stem: "With 4 frames, initially empty, and the reference string 7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1, how many page faults does LRU cause?", options: ["6", "8", "9", "12"], ask: "faults", gold: { r: "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", f: 4, algo: "lru" } },
  { kind: "textbook", tool: "cpu-scheduling", stem: "Processes P1, P2, P3, P4 arrive at 0, 1, 2, 3 with burst times 8, 4, 9, 5. With preemptive SJF (SRTF), what is the average waiting time?", options: ["6.5", "7.75", "6.75", "5.25"], ask: "avgWT", gold: { algo: "srtf", p: "0-8-0_1-4-0_2-9-0_3-5-0" } },
  { kind: "textbook", tool: "page-replacement", stem: "Using optimal page replacement with 3 frames on 7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1, the number of page faults is", options: ["9", "12", "15", "10"], ask: "faults", gold: { r: "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", f: 3, algo: "optimal" } },
  { kind: "textbook", tool: "cpu-scheduling", stem: "Three processes arrive at time 0 with CPU bursts 24, 3 and 3 ms in the order P1, P2, P3. Under FCFS, the average turnaround time is", options: ["17", "27", "30", "13"], ask: "avgTAT", gold: { algo: "fcfs", p: "0-24-0_0-3-0_0-3-0" } },
  { kind: "textbook", tool: "cpu-scheduling", stem: "Processes P1 (arrival 0, burst 10, priority 3), P2 (arrival 0, burst 1, priority 1), P3 (arrival 0, burst 2, priority 4), P4 (arrival 0, burst 1, priority 5), P5 (arrival 0, burst 5, priority 2) are scheduled with non-preemptive priority, where a lower number means higher priority. The average waiting time is", options: ["8.2", "9.6", "7.4", "12"], ask: "avgWT", gold: { algo: "priority", p: "0-10-3_0-1-1_0-2-4_0-1-5_0-5-2" } },
  { kind: "textbook", tool: "page-replacement", stem: "Consider the reference string 1, 2, 3, 4, 2, 1, 5, 6, 2, 1, 2, 3, 7, 6, 3, 2, 1, 2, 3, 6 with 3 frames. How many faults with LRU?", options: ["15", "16", "14", "18"], ask: "faults", gold: { r: "1 2 3 4 2 1 5 6 2 1 2 3 7 6 3 2 1 2 3 6", f: 3, algo: "lru" } },
  { kind: "textbook", tool: "cpu-scheduling", stem: "Consider P1 (AT 0, BT 4), P2 (AT 1, BT 3), P3 (AT 2, BT 1), P4 (AT 3, BT 2) scheduled with Round Robin, quantum 1. What is the completion time of P2?", options: ["8", "9", "10", "7"], ask: "ct.P2", gold: { algo: "rr", q: 1, p: "0-4-0_1-3-0_2-1-0_3-2-0" } },
  // --- Conceptual questions -----------------------------------------------------------------
  { kind: "concept", tool: "cpu-scheduling", q: "Why does SJF starve long jobs?" },
  { kind: "concept", tool: "page-replacement", q: "What is Belady's anomaly and why doesn't LRU have it?" },
  { kind: "concept", tool: "avl-tree", q: "When does an AVL tree need a double rotation?" },
  { kind: "concept", tool: "serializability", q: "What is the difference between conflict and view serializability?" },
  { kind: "concept", tool: "sliding-window", q: "Why does Go-Back-N need a window smaller than 2^m?" },
  { kind: "concept", tool: "attention", q: "Why do transformers divide attention scores by the square root of d_k?" },
];

async function call(body) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/ai/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, debug: true }), signal: AbortSignal.timeout(180_000) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, ms: Date.now() - t0 };
}

const cases = CASES.filter((c) => !only || c.kind === only);
const rows = [];
for (const c of cases) {
  let expected = null;
  if (c.gold) {
    const r = check(SCHEMA_BY_SLUG.get(c.tool), c.gold);
    if (!r.ok) throw new Error(`Golden params fail for ${c.tool}: ${r.error}`);
    expected = r.answer.values[c.ask];
  }
  let out;
  for (let tries = 0; tries < 3; tries++) {
    out = await call(c.stem ? { transcript: { stem: c.stem, options: c.options } } : { q: c.q });
    if (out.status !== 429) break;
    await new Promise((r) => setTimeout(r, 62_000)); // the shared allowance: wait for the window
  }
  const d = out.data;
  const toolOk = d.tool?.slug === c.tool;
  const paramsOk = out.status === 200 && !!d.params;
  const got = d.answer?.value;
  const answerOk = expected === null ? null : got !== undefined && same(got, String(expected));
  const row = { kind: c.kind, tool: c.tool, routed: d.tool?.slug ?? `(${out.status} ${d.error ?? "none"})`, toolOk, paramsOk, expected, got, answerOk, verified: !!d.verified, verifiedBy: d.verifiedBy ?? "", ms: out.ms };
  rows.push(row);
  console.log(`${toolOk ? "✓" : "✗"} ${c.kind.padEnd(8)} ${c.tool.padEnd(22)} -> ${String(row.routed).padEnd(24)} params ${paramsOk ? "ok " : "BAD"}${expected !== null ? ` answer ${answerOk ? "ok " : "BAD"} (${got} vs ${expected})${d.verified ? ` verified:${d.verifiedBy}` : ""}` : ""} ${out.ms} ms`);
  if (verbose) console.log("   ", d.understood, "|", d.url, "|", d.reply?.slice(0, 160), d.log?.length ? `| log: ${d.log.join(" / ")}` : "");
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}% (${a}/${b})` : "n/a");
const solved = rows.filter((r) => r.expected !== null);
const verified = solved.filter((r) => r.verified);
console.log("\n--- Summary ---");
console.log(`Tool accuracy:        ${pct(rows.filter((r) => r.toolOk).length, rows.length)}`);
for (const k of ["typed", "hinglish", "textbook", "concept"]) {
  const g = rows.filter((r) => r.kind === k);
  if (g.length) console.log(`  ${k.padEnd(19)} ${pct(g.filter((r) => r.toolOk).length, g.length)}`);
}
console.log(`Param validity:       ${pct(rows.filter((r) => r.paramsOk).length, rows.length)}`);
console.log(`Answer accuracy:      ${pct(solved.filter((r) => r.answerOk).length, solved.length)}`);
console.log(`Verified rate:        ${pct(verified.length, solved.length)}`);
console.log(`Verified-answer acc.: ${pct(verified.filter((r) => r.answerOk).length, verified.length)} (verified but wrong: ${verified.filter((r) => !r.answerOk).length})`);
console.log(`Median latency:       ${rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)]} ms`);
