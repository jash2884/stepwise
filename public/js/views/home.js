import { SUBJECTS, TOOLS } from "../tools.js";
import { h } from "../ui.js";

// Little previews drawn with CSS so the home page stays light.
function art(kind) {
  const cells = (n, hot = []) => Array.from({ length: n }, (_, i) => h("i", { class: hot.includes(i) ? "hot" : "" }));
  switch (kind) {
    case "gantt": return h("div", { class: "art gantt-art" }, [3, 2, 4, 1, 3].map((w, i) => h("i", { style: `flex:${w};--c:var(--series-${i + 1})` })));
    case "frames": return h("div", { class: "art frames-art" }, cells(18, [2, 7, 11, 15]));
    case "matrix": return h("div", { class: "art matrix-art" }, cells(15, [6, 7, 8]));
    case "disk": return h("div", { class: "art disk-art" }, h("svg", { viewBox: "0 0 120 50", "aria-hidden": "true" }, h("polyline", { points: "10,8 40,14 62,20 30,28 90,36 112,44" })));
    case "graph": return h("div", { class: "art graph-art" }, h("span", { class: "p" }, "P1"), h("span", { class: "r" }, "R1"), h("span", { class: "p" }, "P2"), h("span", { class: "r" }, "R2"));
    case "sync": return h("div", { class: "art sync-art" }, h("span", null, "wait(S)"), h("span", { class: "hot" }, "S = −1"), h("span", null, "signal(S)"));
    case "tree": return h("div", { class: "art tree-art" }, h("i", { class: "r" }), h("div", null, h("i"), h("i"), h("i")));
    case "join": return h("div", { class: "art join-art" }, h("i"), h("i", { class: "hot" }));
    case "schedule": return h("div", { class: "art fd-art" }, h("span", null, "R1(A) W2(A)"), h("span", null, "T1 → T2"), h("span", { class: "hot" }, "serialisable ✓"));
    case "hash": return h("div", { class: "art matrix-art hash-art" }, cells(10, [3, 4, 5]));
    case "ip": return h("div", { class: "art fd-art" }, h("span", null, "192.168.10.77/26"), h("span", { class: "hot" }, "11000000…01|001101"), h("span", null, "→ .64 – .127"));
    case "window": return h("div", { class: "art win-art" }, Array.from({ length: 8 }, (_, i) => h("i", { class: i < 2 ? "acked" : i < 5 ? "sent" : "" })));
    case "routing": return h("div", { class: "art graph-art routing-art" }, h("span", { class: "p" }, "A"), h("span", { class: "p hot" }, "B"), h("span", { class: "p" }, "C"), h("span", { class: "p" }, "D"));
    case "cwnd": return h("div", { class: "art disk-art" }, h("svg", { viewBox: "0 0 120 50", "aria-hidden": "true" }, h("polyline", { points: "6,46 18,42 30,32 42,14 54,11 66,8 78,5 84,46 96,40 108,28 116,20" })));
    case "crc": return h("div", { class: "art fd-art" }, h("span", null, "1101011111 0000"), h("span", null, "÷ 10011"), h("span", { class: "hot" }, "remainder 0010"));
    case "frag": return h("div", { class: "art frag-art" }, h("i", { style: "flex:37" }), h("i", { style: "flex:37" }), h("i", { style: "flex:26" }));
    default: return h("div", { class: "art fd-art" }, h("span", null, "AB → C"), h("span", null, "C → D"), h("span", { class: "hot" }, "AB⁺ = ABCD"));
  }
}

const card = (t) => h("a", { class: "tool-card", href: `/${t.slug}`, "data-search": `${t.title} ${t.summary} ${t.description}`.toLowerCase() },
  art(t.art),
  h("h3", null, t.title),
  h("p", null, t.summary),
  h("span", { class: "tag" }, "Visualise + practice"));

export function render(root) {
  const sections = SUBJECTS.map((s) => h("section", { class: "subject", "data-subject": s.id },
    h("h2", null, s.name, h("span", { class: "count" }, ` · ${TOOLS.filter((t) => t.subject === s.id).length} tools`)),
    h("div", { class: "tool-grid" }, TOOLS.filter((t) => t.subject === s.id).map(card))));
  const empty = h("p", { class: "muted", hidden: true }, "No tool matches that yet. Try “deadlock”, “join”, “subnet” or “tree”.");
  const search = h("input", {
    type: "search", class: "tool-search", placeholder: `Search ${TOOLS.length} tools: LRU, B+ tree, subnetting…`, "aria-label": "Search tools",
    oninput: (e) => {
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      for (const c of root.querySelectorAll(".tool-card")) { const hit = !q || c.dataset.search.includes(q); c.hidden = !hit; if (hit) shown++; }
      for (const s of sections) s.hidden = ![...s.querySelectorAll(".tool-card")].some((c) => !c.hidden);
      empty.hidden = shown > 0;
    },
  });
  root.replaceChildren(
    h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, "Interactive OS, DBMS & networking visualisers"),
      h("h1", null, "See every step."),
      h("p", { class: "lede" }, "The algorithms in your operating systems, databases and computer networks exams, animated one step at a time with the reasoning written out. Then practise on fresh questions that check every answer."),
      search),
    empty,
    ...sections,
    h("section", { class: "why" },
      h("div", null, h("h3", null, "Built for exams"), h("p", null, "Every tool states the conventions it uses (tie-breaking, split rules, what counts as head movement) so your answers match what your examiner expects.")),
      h("div", null, h("h3", null, "Practice that checks you"), h("p", null, "Fresh questions every time, with each answer marked and the full working one click away.")),
      h("div", null, h("h3", null, "Share any example"), h("p", null, "Every input is in the link, so you can send a classmate the exact question you're stuck on."))));
  return () => {};
}
