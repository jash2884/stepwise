import { h } from "../ui.js";

export const TOOLS = [
  { path: "cpu", subject: "Operating systems", title: "CPU scheduling", text: "FCFS, SJF, SRTF, Priority and Round Robin with a live Gantt chart and ready queue.", art: "gantt" },
  { path: "paging", subject: "Operating systems", title: "Page replacement", text: "FIFO, LRU and Optimal, frame by frame, with Belady's anomaly spotted for you.", art: "frames" },
  { path: "bankers", subject: "Operating systems", title: "Banker's algorithm", text: "Need matrix, safety check and resource requests: is the system safe?", art: "matrix" },
  { path: "bptree", subject: "Databases", title: "B+ tree", text: "Insert, delete and search with every split, borrow and merge animated.", art: "tree" },
  { path: "normalization", subject: "Databases", title: "Normalisation", text: "Closures, candidate keys, 1NF to BCNF, minimal cover and decompositions.", art: "fd" },
];

const NEXT = ["Disk scheduling (FCFS, SSTF, SCAN, C-LOOK)", "Deadlock detection with resource-allocation graphs", "Process synchronisation: semaphores and the classic problems", "SQL joins, row by row", "Transaction schedules and serialisability", "Hashing and indexing"];

function art(kind) {
  if (kind === "gantt") return h("div", { class: "art gantt-art" }, [3, 2, 4, 1, 3].map((w, i) => h("i", { style: `flex:${w};--c:var(--series-${i + 1})` })));
  if (kind === "frames") return h("div", { class: "art frames-art" }, Array.from({ length: 18 }, (_, i) => h("i", { class: [2, 7, 11, 15].includes(i) ? "hot" : "" })));
  if (kind === "matrix") return h("div", { class: "art matrix-art" }, Array.from({ length: 15 }, (_, i) => h("i", { class: i >= 6 && i < 9 ? "hot" : "" })));
  if (kind === "tree") return h("div", { class: "art tree-art" }, h("i", { class: "r" }), h("div", null, h("i"), h("i"), h("i")));
  return h("div", { class: "art fd-art" }, h("span", null, "AB → C"), h("span", null, "C → D"), h("span", { class: "hot" }, "AB⁺ = ABCD"));
}

export function render(root) {
  root.replaceChildren(
    h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, "Interactive OS & DBMS visualisers"),
      h("h1", null, "See every step."),
      h("p", { class: "lede" }, "The algorithms in your operating systems and database exams, animated one step at a time with the reasoning written out. Then practise on fresh questions that check every answer."),
      h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/cpu" }, "Start with CPU scheduling"), h("a", { class: "btn ghost", href: "#/bptree" }, "Play with a B+ tree"))),
    h("section", { class: "tool-grid", "aria-label": "Visualisers" }, TOOLS.map((t) => h("a", { class: "tool-card", href: `#/${t.path}` },
      art(t.art),
      h("span", { class: "eyebrow" }, t.subject),
      h("h2", null, t.title),
      h("p", null, t.text),
      h("span", { class: "tag" }, "Visualise + practice")))),
    h("section", { class: "why" },
      h("div", null, h("h3", null, "Built for exams"), h("p", null, "Every tool states the conventions it uses (tie-breaking, split rules) so your answers match what your examiner expects.")),
      h("div", null, h("h3", null, "Practice that checks you"), h("p", null, "Fresh questions every time, with each answer marked and the full working one click away.")),
      h("div", null, h("h3", null, "Share an example"), h("p", null, "Every input lives in the link, so you can send a classmate the exact question you're stuck on."))),
    h("section", { class: "next" }, h("h2", null, "Coming next"), h("ul", null, NEXT.map((n) => h("li", null, n)))));
  return () => {};
}
