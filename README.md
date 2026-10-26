# Stepwise

**See every step of the OS and DBMS algorithms you get examined on.** Interactive visualisers that animate each algorithm one step at a time with the reasoning written out, plus a practice mode that generates fresh exam-style questions and checks every answer.

**Live:** https://stepwise.jashparmar.com

| Subject | Visualiser | Practice mode |
|---|---|---|
| OS | **CPU scheduling**: FCFS, SJF, SRTF, Priority (both), Round Robin. Animated Gantt chart, CPU and ready queue, CT/TAT/WT/RT, and every algorithm compared on the same input | Fill in CT, TAT and WT for a random process set; each cell is checked |
| OS | **Page replacement**: FIFO, LRU, Optimal. Frame-by-frame grid with the reason for every eviction; faults for 1–6 frames with Belady's anomaly flagged | Call each reference: hit, or which page gets evicted |
| OS | **Banker's algorithm**: Need matrix, step-by-step safety check, resource requests with "apply and re-check" | Build a safe sequence (any valid one is accepted) or call the state unsafe |
| DBMS | **B+ tree**: insert, delete and search with splits, copy-up vs move-up, borrows, merges and root changes animated as an SVG | Predict the root keys, leaf count and height after a run of inserts |
| DBMS | **Normalisation**: closures, candidate keys, 1NF→BCNF with the violating dependencies, minimal cover, 3NF synthesis, BCNF decomposition with a dependency-preservation check | Closure, candidate keys and highest normal form for a random schema |

## Why it's built this way

- **Correctness first.** Each algorithm is a pure engine (`public/js/engines/`) that returns the full list of steps, and the UI only renders them. The engines are tested against the worked examples in Silberschatz's *Operating System Concepts* and *Database System Concepts*, plus a property test that runs 12,000 random B+ tree inserts and deletes across orders 3–7 and checks every invariant (sorted keys, balanced leaves, fill limits, the leaf chain) after each one.
- **Conventions are stated, not hidden.** Textbooks disagree on tie-breaking, Round Robin arrival order and B+ tree split points, so every page lists the rules it follows. Answers match what an examiner expects.
- **One step player for everything.** Play, pause, step back and forward, scrub, change speed, use the keyboard. Every visualiser shares it.
- **Shareable.** Every input is in the URL, so a student can send the exact question they're stuck on.
- **No backend, no dependencies.** Plain ES modules served as static assets from Cloudflare. It loads fast on a phone and has a strict CSP.

## Develop

```bash
npm test                 # 29 engine tests
node scripts/static.js   # http://localhost:8793
npx wrangler deploy      # Cloudflare (static assets)
```
