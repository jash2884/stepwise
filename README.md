# Stepwise

**See every step of the OS, DBMS, computer networks, theory of computation and compiler design algorithms you get examined on.** 28 interactive tools. Interactive visualisers that animate each algorithm one step at a time with the reasoning written out, plus a practice mode that generates fresh exam-style questions and checks every answer.

**Live:** https://stepwise.jashparmar.com

| Subject | Visualiser | Practice mode |
|---|---|---|
| OS | **CPU scheduling**: FCFS, SJF, SRTF, Priority (both), Round Robin; animated Gantt chart, ready queue, CT/TAT/WT/RT, all algorithms compared | Fill in CT, TAT and WT; every cell checked |
| OS | **Page replacement**: FIFO, LRU, Optimal frame by frame; faults for 1–6 frames with Belady's anomaly flagged | Call each reference: hit, or which page is evicted |
| OS | **Disk scheduling**: FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK; head-movement chart, totals compared | Total head movement and service order |
| OS | **Banker's algorithm**: Need matrix, safety check, resource requests | Build a safe sequence or call it unsafe |
| OS | **Deadlock detection**: resource-allocation graph, wait-for cycles, detection algorithm | Pick the deadlocked processes |
| OS | **Semaphores**: producer–consumer, readers–writers, dining philosophers, race conditions. You choose who runs; races and deadlocks are detected live | Trace a sequence of wait/signal calls |
| DBMS | **B+ tree**: insert, delete, search with splits, borrows and merges | Predict root keys, leaves and height |
| DBMS | **Normalisation**: closure, candidate keys, 1NF→BCNF, minimal cover, 3NF synthesis, BCNF decomposition | Closure, keys and normal form |
| DBMS | **SQL joins**: INNER, LEFT, RIGHT, FULL, CROSS, NATURAL, SEMI, ANTI, row pair by row pair, with NULL semantics | Predict the row count |
| DBMS | **Serialisability**: precedence graph, conflict/view serialisability, recoverable/cascadeless/strict | Serialisable? Give a serial order |
| DBMS | **Hashing**: chaining, linear/quadratic/double hashing, extendible hashing | Final slot and collisions; global depth and buckets |
| CN | **Subnetting & VLSM**: network/broadcast/host range with the binary AND, VLSM planner | Network, broadcast and usable hosts |
| CN | **Sliding window**: Stop-and-Wait, Go-Back-N, Selective Repeat on a sender/receiver timeline with lost frames and ACKs, plus an efficiency calculator | Utilisation and sequence-number bits |
| CN | **Routing**: Dijkstra with forwarding tables; distance vector with count-to-infinity and poisoned reverse | Least costs and next hop |
| CN | **TCP congestion control**: slow start, congestion avoidance, Tahoe vs Reno, cwnd chart | cwnd and ssthresh after losses |
| CN | **Error detection**: CRC long division, Hamming encode/correct, Internet checksum | CRC remainder, flipped bit, checksum |
| CN | **IP fragmentation**: fragment sizes, offsets and MF flags | Fragment count, last offset and length |
| TOC | **Finite automata**: DFA, NFA, ε-NFA runs with active states and moves animated on the state diagram | Accept or reject a string |
| TOC | **NFA to DFA**: subset construction with ε-closures, DFA drawn as it's discovered | Number of DFA states |
| TOC | **DFA minimisation**: unreachable states, dead state, k-equivalence partition refinement | Size of the minimal DFA |
| TOC | **Regex to NFA**: Thompson's construction fragment by fragment, string tester | Which string matches |
| TOC | **CYK parsing**: triangular table cell by cell with every split, parse tree | Is the string in the language |
| TOC | **Turing machine**: animated tape and head, aⁿbⁿ, aⁿbⁿcⁿ, palindromes, binary increment, busy beaver | Accept/reject and final tape |
| CD | **Left recursion & factoring**: immediate and indirect left recursion, left factoring | Pick the correct rewrite |
| CD | **FIRST & FOLLOW**: pass by pass with the reason for every symbol | Select the set's members |
| CD | **LL(1) parsing**: predictive table, conflicts, stack trace with the parse tree growing | Fill a table cell |
| CD | **LR parsing**: LR(0), SLR(1), LALR(1), CLR(1) item-set automata, ACTION/GOTO tables, conflicts compared, shift-reduce parse with the forest assembling | Is the grammar in the class |
| CD | **Three-address code & DAG**: syntax tree to TAC, value-numbered DAG, quadruples and triples | Count the DAG's nodes |

## Why it's built this way

- **Correctness first.** Each algorithm is a pure engine (`public/js/engines/`) that returns the full list of steps, and the UI only renders them. The engines are tested against the worked examples in Silberschatz's *Operating System Concepts* and *Database System Concepts*, Kurose & Ross's *Computer Networking*, Tanenbaum's *Computer Networks*, Hopcroft, Motwani & Ullman's *Automata Theory* and Aho, Lam, Sethi & Ullman's *Compilers* (the Dragon Book), plus a property test that runs 12,000 random B+ tree inserts and deletes across orders 3–7 and checks every invariant (sorted keys, balanced leaves, fill limits, the leaf chain) after each one.
- **Conventions are stated, not hidden.** Textbooks disagree on tie-breaking, Round Robin arrival order and B+ tree split points, so every page lists the rules it follows. Answers match what an examiner expects.
- **One step player for everything.** Play, pause, step back and forward, scrub, change speed, use the keyboard. Every visualiser shares it.
- **Diagrams that move.** State diagrams, item-set automata, parse trees and DAGs are laid out automatically (layered, barycentre-ordered) and nodes glide between steps instead of redrawing.
- **Shareable.** Every input is in the URL, so a student can send the exact question they're stuck on.
- **No backend, no dependencies.** Plain ES modules served as static assets from Cloudflare's CDN, so it scales without servers. Each tool's code loads only when opened.

## Production setup

- **One registry** (`public/js/tools.js`) drives routes, menus, the home page, titles and the sitemap. Adding a tool means one entry plus its engine, view and tests.
- **Real URLs and SEO.** `npm run build` writes a page per tool (`/cpu-scheduling`, …) with its own title, description, canonical link, Open Graph tags and `LearningResource` structured data, plus `sitemap.xml`, `robots.txt` and a 404 page. Old `/#/cpu` links redirect.
- **Offline.** A service worker, versioned by a content hash at build time, precaches every tool; the site is installable as an app.
- **Resilience.** Failed loads show a retry screen, unexpected errors show a reload prompt, and every route has a loading state.
- **Security and caching.** Strict CSP, HSTS, `nosniff`, a locked-down Permissions-Policy; scripts revalidate on every load (so a deploy is never half-applied), icons cache for a week.
- **Tests.** 133 tests: textbook examples (Silberschatz, Dragon Book, Hopcroft–Ullman…), fuzz suites running every engine on thousands of random inputs against invariants, and module checks that every file parses and every view loads. CI runs them plus the production build on every push.

## Develop

```bash
npm test          # 102 tests
npm run dev       # http://localhost:8793 (serves public/)
npm run preview   # build, then serve dist/ like production
npm run deploy    # test, build, deploy to Cloudflare
```
