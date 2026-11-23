// GATE questions for DSA, CN, TOC and compiler design: every topic makes
// well-formed, deterministic questions whose stored answer passes its own
// check, and a few answers are checked against textbook examples.
import assert from "node:assert/strict";
import { test } from "node:test";
import { check, generate } from "../public/js/gate-questions.js";
import { TOOLS } from "../public/js/tools.js";
import { TOPICS as DSA } from "../public/js/gate/dsa.js";
import { TOPICS as CN } from "../public/js/gate/cn.js";
import { TOPICS as TOC } from "../public/js/gate/toc.js";
import { TOPICS as CD } from "../public/js/gate/cd.js";
import { ROADMAPS } from "../public/js/roadmaps.js";
import { run as sortRun } from "../public/js/engines/sorting.js";
import { toPostfix, evalPostfix } from "../public/js/engines/stacks.js";
import { run as listRun } from "../public/js/engines/lists.js";
import { buildBst, traversal } from "../public/js/engines/bst.js";
import { rotationCase, buildAvl } from "../public/js/engines/avl.js";
import { parseGraph } from "../public/js/engines/graph.js";
import { kruskal } from "../public/js/engines/mst.js";
import { dijkstra } from "../public/js/engines/paths.js";
import { run as dpRun } from "../public/js/engines/dp.js";
import { crc, hammingEncode, hammingCheck } from "../public/js/engines/errors.js";
import { fragment } from "../public/js/engines/fragment.js";
import { simulate as slide, minSeqBits } from "../public/js/engines/sliding.js";
import { throughput, peak, minFrame } from "../public/js/engines/mac.js";
import { httpTiming } from "../public/js/engines/dnshttp.js";
import { parseAutomaton, subsetConstruction, minimize, regexToNfa } from "../public/js/engines/automata.js";
import { EXAMPLES as GRAMMARS, parseGrammar, cyk, firstFollow, lrAutomaton, lrTable, ll1 } from "../public/js/engines/grammar.js";
import { MACHINES, parseTM, runTM } from "../public/js/engines/turing.js";
import { LANGUAGES, proof } from "../public/js/engines/pumping.js";
import { lex } from "../public/js/engines/lexer.js";
import { parseBlock, generate as naiveTac, dag } from "../public/js/engines/tac.js";
import { parseTac, basicBlocks, EXAMPLES as OPT_EXAMPLES } from "../public/js/engines/optimise.js";
import { analyse, chromatic } from "../public/js/engines/regalloc.js";

const SUBJECT_TOPICS = { dsa: DSA, cn: CN, toc: TOC, cd: CD };

for (const [subject, topics] of Object.entries(SUBJECT_TOPICS)) {
  test(`${subject}: every topic makes valid, deterministic questions for seeds 1 to 150`, () => {
    assert.ok(topics.length > 0, `${subject} has no topics`);
    for (const t of topics) {
      assert.equal(t.subject, subject, t.slug);
      assert.ok(TOOLS.some((x) => x.slug === t.slug && x.subject === subject), `${t.slug} is not a ${subject} tool`);
      for (let seed = 1; seed <= 150; seed++) {
        const q = generate(t.slug, seed);
        const where = `${t.slug} seed ${seed}`;
        assert.equal(q.topic, t.slug, where);
        assert.ok(["mcq", "msq", "nat"].includes(q.type), where);
        assert.ok(q.marks === 1 || q.marks === 2, where);
        assert.ok(Array.isArray(q.stem) && q.stem.length && Array.isArray(q.solution) && q.solution.length, where);
        for (const b of [...q.stem, ...q.solution]) {
          if (typeof b === "string") { assert.ok(b.length, `${where}: empty block`); assert.ok(!/—/.test(b), `${where}: em dash in "${b}"`); }
          else assert.ok(Array.isArray(b.table?.head) && Array.isArray(b.table?.rows), `${where}: bad block`);
        }
        assert.ok(q.replay.startsWith(`/${t.slug}`), where);
        if (q.type === "nat") assert.ok(Number.isFinite(q.answer), where);
        else {
          assert.equal(q.options.length, 4, where);
          assert.equal(new Set(q.options).size, 4, `${where}: duplicate options ${q.options}`);
          assert.ok(q.options.every((o) => typeof o === "string" && o.length), where);
        }
        if (q.type === "mcq") assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, where);
        if (q.type === "msq") assert.ok(q.answer.length >= 1 && q.answer.every((i) => i >= 0 && i < 4), where);
        assert.deepEqual(check(q, q.answer), { correct: true, score: q.marks }, where);
        assert.deepEqual(generate(t.slug, seed), q, `${where}: not deterministic`);
      }
    }
  });
}

// --- Spot checks against hand-computed textbook examples ---------------------------

test("every new topic is listed in a GATE CS roadmap module's gate list", () => {
  const listed = new Set(ROADMAPS.find((r) => r.id === "gate-cs").stages.flatMap((s) => s.modules.flatMap((m) => m.gate ?? [])));
  for (const t of [...DSA, ...CN, ...TOC, ...CD]) assert.ok(listed.has(t.slug), t.slug);
});

test("dsa spot check: bubble sort swaps equal inversions; postfix by hand", () => {
  // [5, 1, 4, 2, 8] has 4 inversions: (5,1), (5,4), (5,2), (4,2).
  const swaps = sortRun("bubble", [5, 1, 4, 2, 8]).steps.filter((s) => s.swap && s.swap[0] !== s.swap[1]).length;
  assert.equal(swaps, 4);
  assert.equal(toPostfix("a + b * c - d"), "a b c * + d -");
  assert.equal(toPostfix("a ^ b ^ c"), "a b c ^ ^");
  assert.equal(evalPostfix("2 3 1 * + 9 -"), -4);
});

test("dsa spot check: Floyd on 1..7 with the tail back to position 2 meets after 5 steps", () => {
  // slow is at index k, fast at 2k folded into the 5-node loop starting at index 2: they meet when k = 5.
  assert.equal(listRun({ kind: "s", values: [1, 2, 3, 4, 5, 6, 7], op: "floyd", cycleAt: 2 }).meetAfter, 5);
});

test("dsa spot check: BST traversals and AVL rotations", () => {
  const t = buildBst([50, 30, 70, 20, 40, 60, 80]);
  assert.deepEqual(traversal(t.root, "preorder"), [50, 30, 20, 40, 70, 60, 80]);
  assert.deepEqual(traversal(t.root, "postorder"), [20, 40, 30, 60, 80, 70, 50]);
  assert.equal(rotationCase([3, 2], 1), "LL");
  assert.equal(rotationCase([1, 3], 2), "RL");
  assert.equal(buildAvl([1, 2, 3, 4, 5, 6, 7]).root.key, 4);
});

test("dsa spot check: MST weight and CLRS Dijkstra distances", () => {
  assert.equal(kruskal(parseGraph("A B 4\nA C 1\nB C 2\nB D 5\nC D 8")).weight, 8);
  // CLRS Figure 24.6: from s, d = t 8, x 9, y 5, z 7.
  const g = parseGraph("s t 10\ns y 5\nt x 1\nt y 2\ny t 3\ny x 9\ny z 2\nx z 4\nz x 6\nz s 7", { directed: true });
  const { dist } = dijkstra(g, "s");
  assert.deepEqual([dist.t, dist.x, dist.y, dist.z], [8, 9, 5, 7]);
});

test("dsa spot check: CLRS dynamic programming answers", () => {
  assert.equal(dpRun("lcs", { a: "ABCBDAB", b: "BDCABA" }).answer, 4);
  assert.equal(dpRun("edit", { a: "kitten", b: "sitting" }).answer, 3);
  assert.equal(dpRun("mcm", { p: "30 35 15 5 10 20 25" }).answer, 15125);
  assert.equal(dpRun("knapsack", { w: "1 3 4 5", v: "1 4 5 7", cap: "7" }).answer, 9);
});

test("cn: CRC of 1101011111 with generator 10011 is 0010 (Tanenbaum)", () => {
  assert.equal(crc("1101011111", "10011").remainder, "0010");
});

test("cn: 4000-byte datagram over a 1500-byte MTU makes 3 fragments with offsets 0, 185, 370", () => {
  const res = fragment(4000, 1500, 20);
  assert.deepEqual(res.fragments.map((f) => f.offset), [0, 185, 370]);
  assert.deepEqual(res.fragments.map((f) => f.length), [1500, 1500, 1040]);
});

test("cn: Hamming code of 1011 is 0110011; flipping bit 3 gives syndrome 3", () => {
  assert.equal(hammingEncode("1011").codeword, "0110011");
  assert.equal(hammingCheck("0100011").syndrome, 3);
});

test("cn: GATE 2014 Go-Back-N, window 3, every 5th packet lost, 10 packets: 18 transmissions", () => {
  assert.equal(slide({ protocol: "gbn", frames: 10, window: 3, everyKth: 5 }).framesSent, 18);
  assert.equal(minSeqBits(7, "gbn"), 3);
  assert.equal(minSeqBits(4, "sr"), 3);
});

test("cn: ALOHA peaks, minimum Ethernet frame and HTTP timing", () => {
  assert.ok(Math.abs(peak("slotted").S - 1 / Math.E) < 1e-12);
  assert.ok(Math.abs(throughput(0.5, "pure") - 0.5 * Math.exp(-1)) < 1e-12); // 0.184
  // 10 Mbps, 2500 m at 2 × 10⁸ m/s: 2 × 12.5 µs × 10 Mbps = 250 bits.
  assert.ok(Math.abs(minFrame({ bandwidth: 1e7, distance: 2500, speed: 2e8 }).bits - 250) < 1e-9);
  // Kurose: 8 objects, non-persistent serial, no DNS: 18 RTTs.
  assert.equal(httpTiming({ mode: "np-serial", objects: 8, rtt: 100 }).formula.ms, 1800);
});

test("toc spot check: NFA for 'third symbol from the end is 1' needs 8 DFA states", () => {
  // Classic blow-up: n + 1 = 4 NFA states give 2^3 = 8 reachable subsets.
  const nfa = parseAutomaton("start: q0\naccept: q3\nq0 0 q0\nq0 1 q0 q1\nq1 0 q2\nq1 1 q2\nq2 0 q3\nq2 1 q3");
  assert.equal(subsetConstruction(nfa).dfa.states.length, 8);
});

test("toc spot check: the dragon-book DFA for (a|b)*abb minimises to 4 states", () => {
  // Aho et al. Example 3.40: A and C are equivalent, leaving {A,C}, B, D, E.
  const dfa = parseAutomaton("start: A\naccept: E\nA a B\nA b C\nB a B\nB b D\nC a B\nC b C\nD a B\nD b E\nE a B\nE b C");
  const { min, rounds } = minimize(dfa);
  assert.equal(min.states.length, 4);
  assert.ok(rounds.at(-1).groups.some((g) => g.includes("A") && g.includes("C")));
});

test("toc spot check: Thompson's construction for (a|b)*abb has 11 states", () => {
  // Dragon book Fig. 3.34: states 0 to 10. 2·5 symbols + 2·2 operators − 3 concatenations = 11.
  assert.equal(regexToNfa("(a|b)*abb").nfa.states.length, 11);
});

test("toc spot check: CYK on the classic grammar accepts baaba", () => {
  // Hopcroft, Motwani & Ullman Example 7.34: S → AB | BC, A → BA | a, B → CC | b, C → AB | a.
  const g = parseGrammar("S -> A B | B C\nA -> B A | a\nB -> C C | b\nC -> A B | a");
  const res = cyk(g, [..."baaba"]);
  assert.equal(res.accepted, true);
  assert.deepEqual([...res.table[4][0]].sort(), ["A", "C", "S"]);
  assert.deepEqual([...res.table[0][0]].sort(), ["B"]);
});

test("toc spot check: binary increment and aⁿbⁿ Turing machines", () => {
  assert.equal(runTM(parseTM(MACHINES.increment.text), "1011").output, "1100");
  assert.equal(runTM(parseTM(MACHINES.add.text), "111+11").output, "11111");
  assert.equal(runTM(parseTM(MACHINES.anbn.text), "aabb").result, "accept");
  assert.equal(runTM(parseTM(MACHINES.anbn.text), "aab").result, "reject");
});

test("toc spot check: aᵖbᵖ beats every split for aⁿbⁿ", () => {
  const pr = proof(LANGUAGES.anbn, 4);
  assert.equal(pr.s, "aaaabbbb");
  assert.equal(pr.winning, true);
  assert.equal(pr.all.length, 10); // splits with |xy| ≤ 4, |y| ≥ 1: 4 + 3 + 2 + 1
});

test("cd spot check: tokens in the Dragon Book's if x <= 10 then y = y + 1.5e3", () => {
  const res = lex("if x <= 10 then y = y + 1.5e3");
  assert.equal(res.tokens.length, 10);
  assert.deepEqual(res.symbols.map((s) => s.name), ["x", "y"]);
});

test("cd spot check: FIRST and FOLLOW of the LL(1) expression grammar", () => {
  const g = parseGrammar(GRAMMARS.exprLL.text);
  const { first, follow } = firstFollow(g);
  const s = (set) => [...set].sort();
  assert.deepEqual(s(first.get("E")), ["(", "id"].sort());
  assert.deepEqual(s(first.get("E'")), ["+", "ε"].sort());
  assert.deepEqual(s(follow.get("E")), [")", "$"].sort());
  assert.deepEqual(s(follow.get("T")), ["+", ")", "$"].sort());
  assert.deepEqual(s(follow.get("F")), ["*", "+", ")", "$"].sort());
  assert.equal(ll1(g).conflicts.length, 0);
});

test("cd spot check: LR state counts (expression grammar 12 LR(0) states; S → CC has 10 CLR and 7 LALR states)", () => {
  assert.equal(lrAutomaton(parseGrammar(GRAMMARS.expr.text), "lr0").states.length, 12);
  const cc = parseGrammar(GRAMMARS.cc.text);
  assert.equal(lrAutomaton(cc, "clr").states.length, 10);
  assert.equal(lrAutomaton(cc, "lalr").states.length, 7);
  // S → L = R | R is the classic grammar that is LALR(1) but not SLR(1).
  const lr = parseGrammar(GRAMMARS.lr.text);
  assert.ok(lrTable(lrAutomaton(lr, "slr")).conflicts.some((c) => c.kind === "shift/reduce"));
  assert.equal(lrTable(lrAutomaton(lr, "lalr")).conflicts.length, 0);
});

test("cd spot check: a = b * -c + b * -c needs 5 temporaries naively and its DAG has 5 nodes", () => {
  const stmts = parseBlock("a = b * -c + b * -c");
  assert.equal(naiveTac(stmts).temps, 5);
  assert.equal(dag(stmts).nodes.length, 5); // b, c, minus c, b * minus c, +
});

test("cd spot check: the quicksort fragment has 6 basic blocks; a small block needs 2 registers", () => {
  assert.equal(basicBlocks(parseTac(OPT_EXAMPLES.quicksort.text)).blocks.length, 6);
  const res = analyse("a = x + y\nb = a * 2\nc = a + b\nlive: c");
  assert.equal(chromatic(res.vars, res.edges), 2);
});
