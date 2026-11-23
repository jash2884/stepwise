# Stepwise Roadmaps: Plan

Goal: turn Stepwise from "a set of visualisers" into **a guided path that gets a student from zero to exam-ready**, and measures how ready they are. Roadmaps tie together what Stepwise already has: 62 visualisers, GATE practice, practice links and the AI tutor.

---

## 1. What to take from the CampusX AI Engineering roadmap

(ai-engineer-roadmap-2026.vercel.app. I read the landing page and Levels 0 to 4.)

| Their idea | Use it in Stepwise as |
|---|---|
| Phases → levels → modules with codes (M4.3) | Track → stage → module → topic, with stable ids (OS.3.2) |
| "Assumes" prerequisites on each level | A prerequisite graph between modules, with a "you're missing X" warning |
| Outcomes per module ("you can...") | Outcomes that are **checked automatically** by practice questions, not ticked by hand |
| "Try it" exercises | "Try it" buttons that open a visualiser with a preset input |
| "Ship it" capstone per level | A **stage test**: a timed, mixed GATE-style quiz that unlocks "stage complete" |
| Interview weight vs on-the-job weight | **Exam weight** (marks share in GATE) and **placement weight** (how often it's asked in interviews) |
| Session counts + a fast "100 days" version | Hours per module + plans that fit your exam date (30 / 60 / 120 days) |
| Prev / next, back to map | Same, plus "continue where you left off" |
| Phase colours | Subject colours already used across Stepwise |

**Where Stepwise beats it:** their site is a reading list with no progress, no practice and no feedback. Stepwise can track progress, test each module, find weak spots and replan. That's the whole pitch.

Don't copy their text. Write our own module descriptions and credit their roadmap as inspiration in a "Further reading" line.

---

## 2. The roadmaps (tracks)

### Track A: GATE CS (main one)
Stages follow the GATE CS syllabus. Every module links to Stepwise tools where they exist, and shows "coming soon" plus good free resources (NPTEL, GATE Overflow) where they don't.

1. **Foundations:** discrete maths, engineering maths, digital logic *(no tools yet)*
2. **Programming & DSA:** existing DSA tools (sorting, searching, stacks-queues, linked-list, trees, heap, hashing, graphs, DP, union-find, trie)
3. **Algorithms:** complexity, divide and conquer, greedy, DP, graph algorithms (MST, shortest paths, SCC)
4. **COA** *(no tools yet: pipelining, cache mapping, addressing modes, number representation)*
5. **Operating systems:** CPU scheduling, semaphores, deadlocks, Banker's, memory allocation, address translation, page replacement, disk scheduling
6. **Databases:** ER to relational, normalisation, SQL joins, B / B+ trees, hashing, query processing, serialisability, concurrency control, recovery
7. **Computer networks:** subnetting, CIDR, error detection, MAC, sliding window, routing, IP fragmentation, TCP congestion, traffic shaping, DNS/HTTP
8. **Theory of computation:** all 10 TOC tools
9. **Compiler design:** all 10 CD tools
10. **Exam mode:** full-length mixed mocks, timing practice, revision of weak topics

### Track B: Placements (DSA + core CS for interviews)
Shorter: DSA → OS / DBMS / CN interview topics → practice links (LeetCode, GfG via problems.js) → mock interview using the AI tutor.

### Track C: Semester survival (per subject)
One small roadmap per subject (OS, DBMS, CN, TOC, CD) for university exams: "learn OS in 14 days".

### Track D (later): AI engineering, visualised
This is the CampusX idea turned into Stepwise's strength: **visualisers for AI concepts**, which almost nobody has built well:
- tokenisation (see how English vs Hindi vs code splits into tokens)
- embeddings and cosine similarity (points moving in 2D)
- attention (who looks at whom in a sentence)
- sampling: temperature, top-k, top-p reshaping a probability bar chart
- KV cache and prefill vs decode timeline
- BM25 vs dense search vs hybrid with Reciprocal Rank Fusion
- HNSW graph search animated
- chunking strategies on a real document
- RAG pipeline step by step

These are pure engines and views like the existing ones, with no API needed. Build after Track A is solid.

---

## 3. Data model

New file `public/js/roadmaps.js` (a registry like `tools.js`):

```js
export const ROADMAPS = [
  {
    id: "gate-cs",
    title: "GATE CS",
    summary: "...",
    stages: [
      {
        id: "os", title: "Operating systems", subject: "os",
        examWeight: null,            // fill from real data, see section 7
        modules: [
          {
            id: "os.1", title: "CPU scheduling",
            hours: 4,
            needs: ["dsa.2"],                 // prerequisites (module ids)
            outcomes: [
              "Compute waiting and turnaround time for FCFS, SJF, SRTF, RR, priority",
              "Explain why RR with a tiny quantum hurts",
            ],
            tools: ["cpu-scheduling"],        // Stepwise tool slugs
            tryIt: [{ tool: "cpu-scheduling", query: "algo=rr&q=2", label: "Round robin, q = 2" }],
            gate: ["cpu-scheduling"],         // GATE question generator topics
            placementWeight: 3,               // 0 to 5
            reading: [{ title: "...", url: "..." }],
          },
        ],
        stageTest: { topics: ["cpu-scheduling", "page-replacement", "..."], questions: 15, minutes: 30, pass: 0.6 },
      },
    ],
  },
];
```

### Tests (`test/roadmaps.test.js`)
- every `tools` and `tryIt.tool` slug exists in `TOOLS`
- every `gate` topic exists in `gate-questions.js`
- every `needs` id exists and there are no cycles
- every tool appears in at least one roadmap module
- module ids are unique and stable

---

## 4. Pages and UI

| Route | What it shows |
|---|---|
| `/roadmaps` | All tracks as cards: progress ring, hours, "continue" button |
| `/roadmap/gate-cs` | The map: stages as a vertical path coloured by subject, each module a node (locked / ready / in progress / mastered). Toggle list view and graph view (prerequisite graph, reuse `diagram.js` layered layout) |
| `/roadmap/gate-cs/os` | Stage page: modules with outcomes, Try it buttons, tools, practice, reading, stage test button, prev / next |
| `/plan` | Planner: pick a track, exam date and hours per day, get a day-by-day schedule |
| `/progress` | Mastery per topic, weak topics, streak, review queue |

Small additions to existing pages:
- every tool page shows "Part of: GATE CS → Operating systems → CPU scheduling" with prev / next module
- the home page shows "Continue: module X" for returning visitors
- the GATE page's "weakest topic" button links back to the roadmap module

`npm run build` emits static HTML for each roadmap and stage page (with SEO meta, JSON-LD `Course` / `ItemList`) and adds them to the sitemap. Searches like "GATE CS roadmap 2027" and "OS roadmap for GATE" are high intent and fit these pages.

---

## 5. Making Stepwise more effective (the learning loop)

Each module runs the same loop:

**See → Try → Test → Review**

1. **See:** the visualiser with a preset example.
2. **Try:** change the input yourself (Try it presets).
3. **Test:** 5 generated questions from `gate-questions.js`. Mastery = recent accuracy, weighted toward the latest attempts.
4. **Review:** spaced repetition. A topic you passed comes back after 2, 7, 21 and 45 days as 2 quick questions. Failing one brings it back sooner.

Mastery levels per module: not started → seen → practising → mastered (≥ 80% over the last 10 questions) → due for review.

### Features in order of impact
1. **Progress + mastery** saved in localStorage (extend `stepwise.gate`), with export / import as a file since there are no accounts.
2. **Diagnostic test:** 20 mixed questions, places you on the map and marks what you already know.
3. **Exam-date planner:** spreads remaining modules over the days left, puts high-weight and weak topics first, reserves the final 20% for mocks and review, and replans automatically if you fall behind.
4. **Review queue:** "6 quick reviews due today" on the home page.
5. **Mistake notebook:** every wrong answer is saved with the step-through solution and the replay link, and can be retried.
6. **Stage tests and full mocks:** timed, GATE marking (negative marks for MCQ), score report by topic.
7. **AI tutor with context:** the tutor knows which module you're on and your weak topics ("explain why my SRTF answer was wrong").
8. **Streak and weekly report:** modules done, accuracy trend, time spent. Keep it quiet: no confetti.

---

## 6. Content gaps to fill (needed for a complete GATE track)

| Missing | Tools to build | Question generators |
|---|---|---|
| GATE generators for CN, TOC, CD, DSA | none | subnetting, CIDR, CRC, sliding window, DFA minimisation, FIRST / FOLLOW, LL(1), sorting passes, heap ops, MST, shortest paths |
| Digital logic | K-map minimiser, combinational circuits, flip-flops and counters, number systems / 2's complement | K-map, conversions, counters |
| COA | cache mapping and hit / miss, pipelining hazards and timing diagrams, addressing modes, IEEE 754 | cache, pipeline speedup, floating point |
| Discrete maths | truth tables and logic, sets and relations, graph theory basics, combinatorics, recurrence solving | most are generator friendly |
| Algorithms | recurrence tree / master theorem, greedy (activity selection, Huffman), divide and conquer | master theorem, Huffman codes |
| Engineering maths and aptitude | link out (NPTEL, GATE Overflow) at first | later |

---

## 7. Build phases

### Phase 1 (1 week): roadmaps on the site
- `roadmaps.js` with Track A fully written (all existing tools mapped, missing subjects as "coming soon" with links)
- `/roadmaps`, `/roadmap/gate-cs`, stage pages, breadcrumbs on tool pages, build + sitemap, tests
- **Exam weights:** don't guess. Count questions per topic from GATE Overflow previous-year tags (last 5 to 10 years) with a script, store the counts with the year range, and show "about N marks a year".

### Phase 2 (1 week): progress and mastery
- progress store, module states, mastery from GATE practice results, continue button, export / import

### Phase 3 (1 to 2 weeks): planner, review, diagnostic
- `/plan`, spaced repetition queue, diagnostic test, mistake notebook

### Phase 4 (2 weeks): fill the generator gap
- GATE generators for CN, TOC, CD, DSA so every existing module has a test

### Phase 5 (3 to 4 weeks): new subjects
- digital logic, COA, discrete maths tools + generators, then Track B and Track C

### Phase 6: Track D (AI engineering visualisers)

### Launch steps (alongside Phase 1)
- Google Search Console + submit the sitemap (needs your Google sign-in)
- share `/roadmap/gate-cs` in GATE communities and college groups
- measure: weekly users, modules started, modules mastered, return rate after 7 days

---

## 8. Success measures

- A new visitor reaches a module and answers questions within 2 minutes.
- 30% of people who start a module come back within 7 days.
- Every module in Track A has a visualiser or a "coming soon" with good links, and a test.
- Search traffic for roadmap pages grows month on month.
