# Stepwise

**See every step of the OS and DBMS algorithms you get examined on.** 11 interactive tools. Interactive visualisers that animate each algorithm one step at a time with the reasoning written out, plus a practice mode that generates fresh exam-style questions and checks every answer.

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

## Why it's built this way

- **Correctness first.** Each algorithm is a pure engine (`public/js/engines/`) that returns the full list of steps, and the UI only renders them. The engines are tested against the worked examples in Silberschatz's *Operating System Concepts* and *Database System Concepts*, plus a property test that runs 12,000 random B+ tree inserts and deletes across orders 3–7 and checks every invariant (sorted keys, balanced leaves, fill limits, the leaf chain) after each one.
- **Conventions are stated, not hidden.** Textbooks disagree on tie-breaking, Round Robin arrival order and B+ tree split points, so every page lists the rules it follows. Answers match what an examiner expects.
- **One step player for everything.** Play, pause, step back and forward, scrub, change speed, use the keyboard. Every visualiser shares it.
- **Shareable.** Every input is in the URL, so a student can send the exact question they're stuck on.
- **No backend, no dependencies.** Plain ES modules served as static assets from Cloudflare's CDN, so it scales without servers. Each tool's code loads only when opened.

## Production setup

- **One registry** (`public/js/tools.js`) drives routes, menus, the home page, titles and the sitemap. Adding a tool means one entry plus its engine, view and tests.
- **Real URLs and SEO.** `npm run build` writes a page per tool (`/cpu-scheduling`, …) with its own title, description, canonical link, Open Graph tags and `LearningResource` structured data, plus `sitemap.xml`, `robots.txt` and a 404 page. Old `/#/cpu` links redirect.
- **Offline.** A service worker, versioned by a content hash at build time, precaches every tool; the site is installable as an app.
- **Resilience.** Failed loads show a retry screen, unexpected errors show a reload prompt, and every route has a loading state.
- **Security and caching.** Strict CSP, HSTS, `nosniff`, a locked-down Permissions-Policy; scripts revalidate on every load (so a deploy is never half-applied), icons cache for a week.
- **Tests.** 71 tests: textbook examples, a fuzz suite running every engine on thousands of random inputs against invariants, and module checks that every file parses and every view loads. CI runs them plus the production build on every push.

## Develop

```bash
npm test          # 71 tests
npm run dev       # http://localhost:8793 (serves public/)
npm run preview   # build, then serve dist/ like production
npm run deploy    # test, build, deploy to Cloudflare
```
