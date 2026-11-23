// Roadmaps: guided paths through Stepwise. A roadmap is a list of stages (one
// per syllabus subject), each stage a list of modules, and each module points
// at the visualisers, GATE question topics and reading that teach it.
//
// Ids are stable (progress will be keyed on them), so rename titles freely but
// never change an id once published. test/roadmaps.test.js checks that every
// tool slug, GATE topic and prerequisite here really exists.
//
// hours: rough study time for someone seeing the topic for the first time,
// including practice. placement: 0 to 5, how often it comes up in campus
// placement interviews. Both are editorial estimates, labelled as such in the UI.

import { ROADMAPS as PLACEMENTS } from "./roadmaps/placements.js";
import { ROADMAPS as SEMESTER } from "./roadmaps/semester.js";
import { ROADMAPS as AI } from "./roadmaps/ai.js";

const GFG = "https://www.geeksforgeeks.org";

const GATE_CS = [
  {
    id: "gate-cs",
    title: "GATE CS",
    summary: "Every GATE CS subject in a sensible order, each topic tied to a visualiser you can step through and questions that check you.",
    description: "A free GATE CS roadmap: every subject in order, each topic linked to a step-by-step visualiser, GATE-style practice questions and reading.",
    howTo: [
      "Go in order the first time. Later stages assume the earlier ones.",
      "For each module: watch the visualiser, change the input yourself, then answer questions until you get them right without looking.",
      "Maths and aptitude are worth steady marks. Do a little of stage 11 every week rather than leaving it to the end.",
    ],
    stages: [
      {
        id: "programming-ds", title: "Programming & data structures", subject: "dsa",
        summary: "The base everything else builds on: how data is laid out and moved.",
        modules: [
          { id: "ds.arrays", title: "Arrays and searching", hours: 3, placement: 5, needs: [],
            outcomes: ["Trace linear, binary, jump and interpolation search and count comparisons", "Say when binary search applies and find its off-by-one traps"],
            tools: ["searching"] },
          { id: "ds.stacks", title: "Stacks and queues", hours: 4, placement: 5, needs: ["ds.arrays"],
            outcomes: ["Convert infix to postfix and evaluate postfix with a stack", "Implement a circular queue and explain the full vs empty condition"],
            tools: ["stacks-queues"] },
          { id: "ds.lists", title: "Linked lists", hours: 4, placement: 5, needs: ["ds.arrays"],
            outcomes: ["Insert, delete and reverse singly and doubly linked lists by hand", "Compare list and array costs for each operation"],
            tools: ["linked-list"] },
          { id: "ds.bst", title: "Binary trees and BSTs", hours: 6, placement: 5, needs: ["ds.stacks"],
            outcomes: ["Write all four traversals of a tree", "Delete from a BST in all three cases", "Rebuild a tree from two traversals"],
            tools: ["binary-search-tree"] },
          { id: "ds.avl", title: "Balanced trees (AVL)", hours: 4, placement: 3, needs: ["ds.bst"],
            outcomes: ["Pick the right rotation (LL, RR, LR, RL) from balance factors", "Bound the height of an AVL tree with n nodes"],
            tools: ["avl-tree"] },
          { id: "ds.heaps", title: "Heaps and priority queues", hours: 4, placement: 4, needs: ["ds.bst"],
            outcomes: ["Insert and extract on a heap stored as an array", "Explain why build-heap is O(n), not O(n log n)"],
            tools: ["binary-heap"] },
          { id: "ds.hashing", title: "Hash tables", hours: 4, placement: 4, needs: ["ds.arrays"],
            outcomes: ["Fill a table with chaining, linear, quadratic and double hashing", "Count probes and explain primary and secondary clustering"],
            tools: ["hashing"], gate: ["hashing"] },
          { id: "ds.sets", title: "Tries and disjoint sets", hours: 3, placement: 3, needs: ["ds.bst"],
            outcomes: ["Build a trie and use it for prefix search", "Run union-find with union by rank and path compression"],
            tools: ["trie", "union-find"] },
        ],
      },
      {
        id: "algorithms", title: "Algorithms", subject: "dsa",
        summary: "How to design algorithms and prove how fast they are.",
        modules: [
          { id: "algo.analysis", title: "Asymptotic analysis and recurrences", hours: 6, placement: 4, needs: ["ds.arrays"],
            outcomes: ["Compare growth rates with O, Ω and Θ", "Solve recurrences with the recursion tree and the master theorem"],
            tools: [], comingSoon: "A recurrence-tree visualiser is planned.",
            reading: [{ title: "Big-O analysis", url: `${GFG}/dsa/analysis-algorithms-big-o-analysis/` }, { title: "Master theorem for divide and conquer", url: `${GFG}/dsa/advanced-master-theorem-for-divide-and-conquer-recurrences/` }] },
          { id: "algo.sorting", title: "Sorting", hours: 6, placement: 5, needs: ["algo.analysis", "ds.heaps"],
            outcomes: ["Trace every classic sort and state its best, worst and average cost", "Say which sorts are stable and in place", "Count comparisons and swaps for a given input"],
            tools: ["sorting"],
            tryIt: [{ tool: "sorting", query: "algo=merge", label: "Merge sort" }, { tool: "sorting", query: "algo=quick", label: "Quick sort" }, { tool: "sorting", query: "algo=heap", label: "Heap sort" }] },
          { id: "algo.graphs", title: "Graph traversal", hours: 5, placement: 5, needs: ["ds.stacks"],
            outcomes: ["Run BFS and DFS and classify every edge", "Find components, detect cycles and topologically sort a DAG"],
            tools: ["graph-traversal", "strongly-connected-components"] },
          { id: "algo.greedy", title: "Greedy algorithms and MSTs", hours: 5, placement: 4, needs: ["algo.graphs", "ds.sets"],
            outcomes: ["Run Kruskal's and Prim's and explain the cut property", "Recognise when greedy fails"],
            tools: ["minimum-spanning-tree"],
            reading: [{ title: "Greedy algorithms", url: `${GFG}/dsa/greedy-algorithms/` }] },
          { id: "algo.paths", title: "Shortest paths", hours: 5, placement: 4, needs: ["algo.graphs", "ds.heaps"],
            outcomes: ["Run Dijkstra, Bellman-Ford and Floyd-Warshall by hand", "Say why Dijkstra fails with negative edges"],
            tools: ["shortest-paths"] },
          { id: "algo.dp", title: "Dynamic programming", hours: 8, placement: 5, needs: ["algo.analysis"],
            outcomes: ["Fill LCS, knapsack, edit distance and matrix-chain tables", "Spot overlapping subproblems and write the recurrence"],
            tools: ["dynamic-programming"] },
        ],
      },
      {
        id: "discrete-maths", title: "Discrete mathematics", subject: null,
        summary: "Logic, sets, counting and graphs: about a tenth of the paper and the language of TOC and algorithms.",
        modules: [
          { id: "dm.logic", title: "Propositional and first-order logic", hours: 6, placement: 1, needs: [],
            outcomes: ["Check validity with truth tables and equivalences", "Translate English into quantified statements"],
            tools: [], comingSoon: "A truth-table and logic visualiser is planned.",
            reading: [{ title: "Propositional logic", url: `${GFG}/engineering-mathematics/proposition-logic/` }] },
          { id: "dm.sets", title: "Sets, relations, functions and groups", hours: 6, placement: 1, needs: [],
            outcomes: ["Test a relation for reflexive, symmetric, transitive and equivalence", "Count functions and relations between finite sets", "Check group properties"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Set theory", url: `${GFG}/maths/set-theory/` }, { title: "Relations", url: `${GFG}/maths/relation-in-maths/` }, { title: "Group theory", url: `${GFG}/maths/group-theory/` }] },
          { id: "dm.counting", title: "Combinatorics and recurrences", hours: 6, placement: 2, needs: [],
            outcomes: ["Use permutations, combinations, pigeonhole and inclusion-exclusion", "Solve linear recurrences"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Combinatorics", url: `${GFG}/maths/combinatorics/` }] },
          { id: "dm.graphs", title: "Graph theory", hours: 5, placement: 2, needs: [],
            outcomes: ["Use degree sums, connectivity, matching and colouring results", "Count edges and components from given conditions"],
            tools: [], comingSoon: "Graph-theory visualisers are planned.",
            reading: [{ title: "Graph theory basics", url: `${GFG}/engineering-mathematics/mathematics-graph-theory-basics/` }] },
        ],
      },
      {
        id: "digital-logic", title: "Digital logic", subject: null,
        summary: "Gates, circuits and number formats: short, scoring and needed for COA.",
        modules: [
          { id: "dl.numbers", title: "Number systems and representation", hours: 3, placement: 2, needs: [],
            outcomes: ["Convert between bases", "Work with signed magnitude, 1's and 2's complement and detect overflow"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Number systems and base conversion", url: `${GFG}/digital-logic/number-system-and-base-conversions/` }] },
          { id: "dl.boolean", title: "Boolean algebra and K-maps", hours: 4, placement: 1, needs: [],
            outcomes: ["Minimise a function with a K-map, including don't-cares", "Count prime and essential prime implicants"],
            tools: [], comingSoon: "A K-map minimiser is planned.",
            reading: [{ title: "K-maps", url: `${GFG}/digital-logic/introduction-of-k-map-karnaugh-map/` }] },
          { id: "dl.circuits", title: "Combinational and sequential circuits", hours: 5, placement: 1, needs: ["dl.boolean"],
            outcomes: ["Analyse multiplexers, decoders and adders", "Trace flip-flops and design counters"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Digital logic tutorial", url: `${GFG}/digital-logic/digital-electronics-logic-design-tutorials/` }, { title: "Flip-flops", url: `${GFG}/digital-logic/flip-flop-types-their-conversion-and-applications/` }] },
        ],
      },
      {
        id: "coa", title: "Computer organisation & architecture", subject: null,
        summary: "How the machine runs your code: instructions, pipelines and the memory hierarchy.",
        modules: [
          { id: "coa.isa", title: "Instructions and addressing modes", hours: 4, placement: 1, needs: ["dl.numbers"],
            outcomes: ["Work out effective addresses for each addressing mode", "Design instruction formats from opcode and operand counts"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Addressing modes", url: `${GFG}/computer-organization-architecture/addressing-modes/` }] },
          { id: "coa.float", title: "Floating point (IEEE 754)", hours: 2, placement: 1, needs: ["dl.numbers"],
            outcomes: ["Encode and decode single-precision numbers"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "IEEE 754", url: `${GFG}/computer-organization-architecture/ieee-standard-754-floating-point-numbers/` }] },
          { id: "coa.pipeline", title: "Pipelining", hours: 5, placement: 1, needs: ["coa.isa"],
            outcomes: ["Compute speedup and throughput", "Find data, control and structural hazards and the stalls they cause"],
            tools: [], comingSoon: "A pipeline timing-diagram visualiser is planned.",
            reading: [{ title: "Pipelining", url: `${GFG}/computer-organization-architecture/computer-organization-and-architecture-pipelining-set-1-execution-stages-and-throughput/` }] },
          { id: "coa.cache", title: "Cache and memory hierarchy", hours: 6, placement: 2, needs: ["coa.isa"],
            outcomes: ["Split an address into tag, index and offset for direct, set-associative and fully associative caches", "Compute hit ratios and average access time"],
            tools: [], comingSoon: "A cache-mapping visualiser is planned.",
            reading: [{ title: "Cache memory", url: `${GFG}/computer-science-fundamentals/cache-memory/` }] },
          { id: "coa.io", title: "I/O, interrupts and DMA", hours: 2, placement: 1, needs: ["coa.isa"],
            outcomes: ["Compare programmed, interrupt-driven and DMA transfer and compute their overheads"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "I/O interface, interrupts and DMA", url: `${GFG}/computer-organization-architecture/io-interface-interrupt-dma-mode/` }] },
        ],
      },
      {
        id: "os", title: "Operating systems", subject: "os",
        summary: "Processes, synchronisation, deadlocks and memory: heavy on numericals.",
        modules: [
          { id: "os.scheduling", title: "CPU scheduling", hours: 5, placement: 4, needs: ["ds.stacks"],
            outcomes: ["Draw Gantt charts for FCFS, SJF, SRTF, priority and round robin", "Compute waiting, turnaround and response time"],
            tools: ["cpu-scheduling"], gate: ["cpu-scheduling"],
            tryIt: [{ tool: "cpu-scheduling", query: "algo=srtf", label: "Shortest remaining time first" }, { tool: "cpu-scheduling", query: "algo=rr&q=2", label: "Round robin, quantum 2" }] },
          { id: "os.sync", title: "Process synchronisation", hours: 6, placement: 4, needs: ["os.scheduling"],
            outcomes: ["Spot a race condition in interleaved code", "Solve producer-consumer, readers-writers and dining philosophers with semaphores"],
            tools: ["semaphores"] },
          { id: "os.deadlock", title: "Deadlocks", hours: 4, placement: 4, needs: ["os.sync"],
            outcomes: ["Run the Banker's safety and request algorithms", "Detect deadlock from a resource-allocation graph or matrices"],
            tools: ["bankers-algorithm", "deadlock-detection"], gate: ["bankers-algorithm"] },
          { id: "os.memory", title: "Memory management and paging", hours: 6, placement: 3, needs: ["coa.cache"],
            outcomes: ["Place processes with first, next, best and worst fit and buddy allocation", "Translate addresses with page tables and TLBs and compute effective access time"],
            tools: ["memory-allocation", "address-translation"], gate: ["memory-allocation", "address-translation"],
            tryIt: [{ tool: "memory-allocation", query: "algo=best", label: "Best fit" }, { tool: "memory-allocation", query: "algo=buddy", label: "Buddy system" }] },
          { id: "os.vm", title: "Virtual memory and page replacement", hours: 4, placement: 4, needs: ["os.memory"],
            outcomes: ["Count page faults for FIFO, LRU and optimal", "Show Belady's anomaly with FIFO"],
            tools: ["page-replacement"], gate: ["page-replacement"],
            tryIt: [{ tool: "page-replacement", query: "algo=fifo&f=3&r=1 2 3 4 1 2 5 1 2 3 4 5", label: "Belady's anomaly, 3 frames" }, { tool: "page-replacement", query: "algo=fifo&f=4&r=1 2 3 4 1 2 5 1 2 3 4 5", label: "…and with 4 frames" }] },
          { id: "os.disk", title: "Disk scheduling and file systems", hours: 4, placement: 2, needs: ["os.scheduling"],
            outcomes: ["Compute head movement for FCFS, SSTF, SCAN, C-SCAN, LOOK and C-LOOK", "Size file allocation tables and inode block pointers"],
            tools: ["disk-scheduling"], gate: ["disk-scheduling"],
            tryIt: [{ tool: "disk-scheduling", query: "algo=scan", label: "SCAN" }, { tool: "disk-scheduling", query: "algo=clook", label: "C-LOOK" }],
            reading: [{ title: "File systems", url: `${GFG}/operating-systems/file-systems-in-operating-system/` }] },
        ],
      },
      {
        id: "dbms", title: "Databases", subject: "dbms",
        summary: "Modelling, normalisation, indexing and transactions.",
        modules: [
          { id: "db.er", title: "ER model to relations", hours: 3, placement: 3, needs: [],
            outcomes: ["Turn entities, weak entities and relationships into tables", "Work out the minimum number of tables"],
            tools: ["er-to-relational"] },
          { id: "db.sql", title: "Relational algebra, SQL and joins", hours: 6, placement: 5, needs: ["db.er"],
            outcomes: ["Predict the output of joins, including outer, semi and anti joins and NULLs", "Estimate the cost of nested-loop, block and hash joins"],
            tools: ["sql-joins", "query-processing"], gate: ["sql-joins"] },
          { id: "db.normal", title: "Functional dependencies and normal forms", hours: 6, placement: 4, needs: ["db.er"],
            outcomes: ["Find closures, candidate keys and a minimal cover", "Decide the highest normal form and decompose losslessly"],
            tools: ["normalization"], gate: ["normalization"] },
          { id: "db.index", title: "Indexing: B-trees, B+ trees and hashing", hours: 6, placement: 3, needs: ["ds.bst", "ds.hashing"],
            outcomes: ["Insert into and delete from B and B+ trees", "Compute the order and height of an index from block sizes"],
            tools: ["b-tree", "b-plus-tree", "hashing"] },
          { id: "db.txn", title: "Transactions and concurrency control", hours: 6, placement: 4, needs: ["db.sql"],
            outcomes: ["Test schedules for conflict and view serialisability", "Classify schedules as recoverable, cascadeless or strict", "Run 2PL and timestamp ordering"],
            tools: ["serializability", "concurrency-control"], gate: ["serializability"] },
          { id: "db.recovery", title: "Recovery", hours: 2, placement: 2, needs: ["db.txn"],
            outcomes: ["Replay a log with undo and redo after a crash, with checkpoints"],
            tools: ["recovery"] },
        ],
      },
      {
        id: "cn", title: "Computer networks", subject: "cn",
        summary: "Layer by layer, with plenty of numericals in addressing and flow control.",
        modules: [
          { id: "cn.layers", title: "Layering and the OSI and TCP/IP models", hours: 2, placement: 4, needs: [],
            outcomes: ["Place each protocol in its layer and explain encapsulation"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "OSI model", url: `${GFG}/computer-networks/open-systems-interconnection-model-osi/` }] },
          { id: "cn.link", title: "Data link: errors and medium access", hours: 5, placement: 2, needs: ["cn.layers"],
            outcomes: ["Compute CRC remainders and Hamming codes", "Compare ALOHA, CSMA/CD and their efficiency"],
            tools: ["error-detection", "mac-protocols"] },
          { id: "cn.flow", title: "Flow control: sliding window", hours: 4, placement: 2, needs: ["cn.link"],
            outcomes: ["Compute utilisation for stop-and-wait, Go-Back-N and Selective Repeat", "Find the minimum sequence-number bits"],
            tools: ["sliding-window"] },
          { id: "cn.ip", title: "IP addressing, subnetting and CIDR", hours: 5, placement: 4, needs: ["cn.layers"],
            outcomes: ["Find network, broadcast and host ranges from a prefix", "Plan VLSM and apply longest-prefix match", "Fragment a datagram and fill the offsets"],
            tools: ["subnetting", "cidr-and-longest-prefix-match", "ip-fragmentation"],
            tryIt: [{ tool: "subnetting", query: "mode=vlsm", label: "VLSM planner" }] },
          { id: "cn.routing", title: "Routing", hours: 4, placement: 2, needs: ["cn.ip", "algo.paths"],
            outcomes: ["Run link-state and distance-vector routing", "Explain count-to-infinity and poisoned reverse"],
            tools: ["routing"] },
          { id: "cn.transport", title: "Transport: TCP and congestion control", hours: 5, placement: 4, needs: ["cn.flow"],
            outcomes: ["Trace the congestion window through slow start, avoidance and loss", "Compute token and leaky bucket outputs"],
            tools: ["tcp-congestion-control", "traffic-shaping"] },
          { id: "cn.app", title: "Application layer: DNS and HTTP", hours: 2, placement: 4, needs: ["cn.transport"],
            outcomes: ["Count RTTs for DNS lookups and persistent vs non-persistent HTTP"],
            tools: ["dns-and-http"] },
        ],
      },
      {
        id: "toc", title: "Theory of computation", subject: "toc",
        summary: "What machines can and can't compute, from finite automata to Turing machines.",
        modules: [
          { id: "toc.regular", title: "Finite automata", hours: 6, placement: 0, needs: ["dm.sets"],
            outcomes: ["Design DFAs and NFAs for a language", "Convert NFA to DFA and minimise it"],
            tools: ["finite-automata", "nfa-to-dfa", "dfa-minimization"] },
          { id: "toc.regex", title: "Regular expressions", hours: 4, placement: 1, needs: ["toc.regular"],
            outcomes: ["Convert between regular expressions and automata in both directions", "Build product automata for intersection and difference"],
            tools: ["regex-to-nfa", "dfa-to-regex"] },
          { id: "toc.pumping", title: "Non-regular languages", hours: 3, placement: 0, needs: ["toc.regex"],
            outcomes: ["Prove a language is not regular with the pumping lemma", "Use closure properties to decide regularity"],
            tools: ["pumping-lemma"] },
          { id: "toc.cfl", title: "Context-free languages and PDAs", hours: 6, placement: 0, needs: ["toc.pumping"],
            outcomes: ["Design a PDA for a language", "Convert a grammar to CNF and GNF", "Check membership with CYK"],
            tools: ["pushdown-automata", "cfg-to-cnf", "cyk-parsing"] },
          { id: "toc.tm", title: "Turing machines and decidability", hours: 5, placement: 0, needs: ["toc.cfl"],
            outcomes: ["Trace a Turing machine", "Classify problems as decidable, semi-decidable or undecidable"],
            tools: ["turing-machine"] },
        ],
      },
      {
        id: "compilers", title: "Compiler design", subject: "cd",
        summary: "From source text to optimised code. Builds directly on TOC.",
        modules: [
          { id: "cd.lexing", title: "Lexical analysis", hours: 2, placement: 0, needs: ["toc.regex"],
            outcomes: ["Count tokens in a program and explain longest match"],
            tools: ["lexical-analysis"] },
          { id: "cd.grammars", title: "Grammar clean-up, FIRST and FOLLOW", hours: 4, placement: 0, needs: ["toc.cfl"],
            outcomes: ["Remove left recursion and left-factor", "Compute FIRST and FOLLOW sets"],
            tools: ["left-recursion", "first-follow"] },
          { id: "cd.topdown", title: "Top-down parsing", hours: 4, placement: 0, needs: ["cd.grammars"],
            outcomes: ["Build an LL(1) table and find conflicts"],
            tools: ["ll1-parsing"] },
          { id: "cd.bottomup", title: "Bottom-up parsing", hours: 8, placement: 0, needs: ["cd.topdown"],
            outcomes: ["Build LR(0), SLR, LALR and CLR tables and count states", "Find shift-reduce and reduce-reduce conflicts", "Parse with operator precedence"],
            tools: ["lr-parsing", "operator-precedence"],
            tryIt: [{ tool: "lr-parsing", query: "kind=lalr", label: "LALR(1) table" }, { tool: "lr-parsing", query: "kind=clr", label: "CLR(1) table" }] },
          { id: "cd.sdt", title: "Syntax-directed translation", hours: 3, placement: 0, needs: ["cd.bottomup"],
            outcomes: ["Evaluate S- and L-attributed definitions on a parse tree"],
            tools: ["syntax-directed-translation"] },
          { id: "cd.ir", title: "Intermediate code and optimisation", hours: 5, placement: 0, needs: ["cd.sdt"],
            outcomes: ["Write three-address code, quadruples and triples, and build a DAG", "Apply local optimisations and liveness-based register allocation"],
            tools: ["three-address-code", "code-optimisation", "register-allocation"] },
        ],
      },
      {
        id: "maths-aptitude", title: "Engineering maths & aptitude", subject: null,
        summary: "Linear algebra, calculus, probability and general aptitude: dependable marks for steady practice.",
        modules: [
          { id: "em.linear", title: "Linear algebra", hours: 6, placement: 0, needs: [],
            outcomes: ["Find rank, determinants, eigenvalues and eigenvectors", "Decide when a system of equations has solutions"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Linear algebra", url: `${GFG}/maths/linear-algebra/` }] },
          { id: "em.calculus", title: "Calculus", hours: 4, placement: 0, needs: [],
            outcomes: ["Evaluate limits, find maxima and minima, and integrate standard forms"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Calculus", url: `${GFG}/maths/math-calculus/` }] },
          { id: "em.probability", title: "Probability and statistics", hours: 6, placement: 2, needs: ["dm.counting"],
            outcomes: ["Use conditional probability and Bayes' theorem", "Work with expectation, variance and common distributions"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Probability theory", url: `${GFG}/maths/probability-theory/` }] },
          { id: "em.aptitude", title: "General aptitude", hours: 8, placement: 3, needs: [],
            outcomes: ["Solve quantitative, verbal, analytical and spatial questions quickly"],
            tools: [], comingSoon: "Planned.",
            reading: [{ title: "Aptitude questions", url: `${GFG}/aptitude/aptitude-questions-and-answers/` }] },
        ],
      },
      {
        id: "revision", title: "Revision & mock practice", subject: null,
        summary: "Mixed questions under time pressure, and going back over weak topics.",
        modules: [
          { id: "rev.mixed", title: "Mixed GATE practice", hours: 20, placement: 0, needs: ["os.vm", "db.txn"],
            outcomes: ["Answer mixed questions across subjects with GATE marking", "Find your weakest topic and fix it"],
            tools: [], practiceAll: true,
            reading: [{ title: "GATE CS syllabus", url: `${GFG}/gate/gate-cse-syllabus/` }] },
        ],
      },
    ],
  },
];

export const ROADMAPS = [...GATE_CS, ...PLACEMENTS, ...SEMESTER, ...AI];

// --- Lookups -----------------------------------------------------------------------

export const roadmapOf = (id) => ROADMAPS.find((r) => r.id === id);

export const stageOf = (roadmap, id) => roadmap?.stages.find((s) => s.id === id);

export function modulesOf(roadmap) {
  return roadmap.stages.flatMap((stage) => stage.modules.map((module) => ({ stage, module })));
}

export const hoursOf = (modules) => modules.reduce((sum, m) => sum + (m.hours ?? 0), 0);

// The first place a tool appears in a roadmap, with the modules either side
// (across stage boundaries), for the "part of" card on tool pages.
export function placeOfTool(roadmap, slug) {
  const all = modulesOf(roadmap);
  const i = all.findIndex(({ module }) => module.tools.includes(slug));
  if (i < 0) return null;
  return { ...all[i], index: i, prev: all[i - 1] ?? null, next: all[i + 1] ?? null };
}
