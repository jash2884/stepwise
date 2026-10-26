// The single list of tools. Routes, navigation, the home page, page titles and
// the sitemap are all generated from it, so adding a tool is one entry here
// plus its view module.

export const SUBJECTS = [
  { id: "os", name: "Operating systems", short: "OS" },
  { id: "dbms", name: "Databases", short: "DBMS" },
];

export const TOOLS = [
  { slug: "cpu-scheduling", legacy: "cpu", subject: "os", title: "CPU scheduling", art: "gantt",
    summary: "FCFS, SJF, SRTF, Priority and Round Robin with a live Gantt chart and ready queue.",
    description: "Interactive CPU scheduling visualiser: FCFS, SJF, SRTF, Priority and Round Robin with an animated Gantt chart, waiting and turnaround times, and practice questions.",
    load: () => import("./views/cpu.js") },
  { slug: "page-replacement", legacy: "paging", subject: "os", title: "Page replacement", art: "frames",
    summary: "FIFO, LRU and Optimal, frame by frame, with Belady's anomaly spotted for you.",
    description: "Step through FIFO, LRU and Optimal page replacement frame by frame, count page faults and see Belady's anomaly, with practice questions.",
    load: () => import("./views/paging.js") },
  { slug: "disk-scheduling", subject: "os", title: "Disk scheduling", art: "disk",
    summary: "FCFS, SSTF, SCAN, C-SCAN, LOOK and C-LOOK, with the head's path drawn out.",
    description: "Disk scheduling visualiser for FCFS, SSTF, SCAN, C-SCAN, LOOK and C-LOOK: head movement chart, total seek distance and practice questions.",
    load: () => import("./views/disk.js") },
  { slug: "bankers-algorithm", legacy: "bankers", subject: "os", title: "Banker's algorithm", art: "matrix",
    summary: "Need matrix, safety check and resource requests: is the system safe?",
    description: "Banker's algorithm step by step: Need matrix, safety sequence, resource requests and practice questions for deadlock avoidance.",
    load: () => import("./views/bankers.js") },
  { slug: "deadlock-detection", subject: "os", title: "Deadlock detection", art: "graph",
    summary: "Draw a resource-allocation graph and watch cycles and the detection algorithm.",
    description: "Resource-allocation graph visualiser: wait-for graph cycles, the deadlock detection algorithm, and why a cycle isn't always a deadlock.",
    load: () => import("./views/deadlock.js") },
  { slug: "semaphores", subject: "os", title: "Semaphores & synchronisation", art: "sync",
    summary: "Producer–consumer, readers–writers, dining philosophers and race conditions. You pick who runs.",
    description: "Interactive semaphore simulator: producer-consumer, readers-writers, dining philosophers and race conditions. Choose who runs next and trigger deadlocks yourself.",
    load: () => import("./views/sync.js") },
  { slug: "b-plus-tree", legacy: "bptree", subject: "dbms", title: "B+ tree", art: "tree",
    summary: "Insert, delete and search with every split, borrow and merge animated.",
    description: "B+ tree visualiser: insert, delete and search with splits, borrows and merges animated step by step, plus practice questions.",
    load: () => import("./views/bptree.js") },
  { slug: "normalization", legacy: "normalization", subject: "dbms", title: "Normalisation", art: "fd",
    summary: "Closures, candidate keys, 1NF to BCNF, minimal cover and decompositions.",
    description: "Normalisation calculator with steps: attribute closure, candidate keys, 2NF/3NF/BCNF checks, minimal cover, 3NF synthesis and BCNF decomposition.",
    load: () => import("./views/normalization.js") },
  { slug: "sql-joins", subject: "dbms", title: "SQL joins", art: "join",
    summary: "INNER, OUTER, CROSS, NATURAL, SEMI and ANTI joins, one row comparison at a time.",
    description: "See SQL joins row by row: INNER, LEFT, RIGHT, FULL OUTER, CROSS, NATURAL, SEMI and ANTI joins, including how NULLs behave.",
    load: () => import("./views/joins.js") },
  { slug: "serializability", subject: "dbms", title: "Serialisability", art: "schedule",
    summary: "Precedence graphs, conflict and view serialisability, recoverable and strict schedules.",
    description: "Transaction schedule checker: precedence graph, conflict and view serialisability, serial order, and recoverable, cascadeless and strict schedules.",
    load: () => import("./views/schedules.js") },
  { slug: "hashing", subject: "dbms", title: "Hashing & indexing", art: "hash",
    summary: "Chaining, linear, quadratic and double hashing, plus extendible hashing.",
    description: "Hashing visualiser: separate chaining, linear and quadratic probing, double hashing and extendible hashing with directory doubling and bucket splits.",
    load: () => import("./views/hashing.js") },
];

export const SITE = { name: "Stepwise", url: "https://stepwise.jashparmar.com" };
