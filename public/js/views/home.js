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
    case "bfs": return h("div", { class: "art gart" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true" },
      [[20, 29, 60, 12], [20, 29, 60, 46], [60, 12, 100, 6], [60, 12, 100, 29], [60, 46, 100, 52], [100, 29, 136, 29]].map(([a, b, c, d], i) => h("line", { x1: a, y1: b, x2: c, y2: d, class: i < 2 ? "on" : "" })),
      [[20, 29, "done"], [60, 12, "on"], [60, 46, "on"], [100, 6, ""], [100, 29, ""], [100, 52, ""], [136, 29, ""]].map(([x, y, c]) => h("circle", { cx: x, cy: y, r: 7, class: c }))));
    case "mst": return h("div", { class: "art gart" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true" },
      [[16, 30, 54, 8, 1], [16, 30, 54, 50, 0], [54, 8, 96, 8, 1], [54, 8, 54, 50, 1], [54, 50, 96, 50, 0], [96, 8, 96, 50, 1], [96, 8, 134, 30, 1], [96, 50, 134, 30, 0]].map(([a, b, c, d, on]) => h("line", { x1: a, y1: b, x2: c, y2: d, class: on ? "good" : "faint" })),
      [[16, 30], [54, 8], [54, 50], [96, 8], [96, 50], [134, 30]].map(([x, y]) => h("circle", { cx: x, cy: y, r: 7 }))));
    case "paths": return h("div", { class: "art gart" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true" },
      [[14, 30, 52, 10, 1], [14, 30, 52, 48, 0], [52, 10, 96, 22, 1], [52, 48, 96, 22, 0], [96, 22, 136, 40, 1], [52, 48, 136, 40, 0]].map(([a, b, c, d, on]) => h("line", { x1: a, y1: b, x2: c, y2: d, class: on ? "path" : "" })),
      [[14, 30, "0"], [52, 10, "4"], [52, 48, "7"], [96, 22, "6"], [136, 40, "9"]].map(([x, y, t]) => h("g", null, h("circle", { cx: x, cy: y, r: 8, class: t === "0" ? "on" : "" }), h("text", { x, y: y + 3.5, "text-anchor": "middle" }, t)))));
    case "scc": return h("div", { class: "art gart" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true" },
      h("ellipse", { cx: 40, cy: 29, rx: 34, ry: 25, class: "c1" }), h("ellipse", { cx: 112, cy: 29, rx: 32, ry: 23, class: "c2" }),
      [[24, 16, 56, 16], [56, 16, 40, 44], [40, 44, 24, 16], [56, 16, 98, 18], [98, 18, 126, 40], [126, 40, 98, 40], [98, 40, 98, 18]].map(([a, b, c, d]) => h("line", { x1: a, y1: b, x2: c, y2: d })),
      [[24, 16, 1], [56, 16, 1], [40, 44, 1], [98, 18, 2], [126, 40, 2], [98, 40, 2]].map(([x, y, k]) => h("circle", { cx: x, cy: y, r: 7, class: `c${k}` }))));
    case "memory": return h("div", { class: "art mem-art" }, [["used", 3], ["", 2], ["used", 4], ["hot", 2], ["", 3], ["used", 2]].map(([c, w], i) => h("i", { class: c, style: `flex:${w};--c:var(--series-${i + 1})` })));
    case "translate": return h("div", { class: "art translate-art" }, h("span", null, h("b", { class: "p" }, "0011"), h("b", { class: "d" }, "1010")), h("span", { class: "arrow" }, "→"), h("span", null, h("b", { class: "f" }, "0110"), h("b", { class: "d" }, "1010")));
    case "lpm": return h("div", { class: "art fd-art" }, h("span", null, "200.23.24.170"), h("span", null, "/21 ✓  /24 ✓  /0 ✓"), h("span", { class: "hot" }, "longest: /24 → if 1"));
    case "aloha": return h("div", { class: "art disk-art aloha-art" }, h("svg", { viewBox: "0 0 120 50", "aria-hidden": "true" }, h("path", { d: "M4,46 C20,16 34,10 44,12 C64,16 88,34 116,42", class: "s" }), h("path", { d: "M4,46 C14,30 22,26 28,26 C46,28 80,42 116,45", class: "p" })));
    case "bucket": return h("div", { class: "art bucket-art" }, h("div", { class: "b" }, h("i"), h("i"), h("i"), h("i")), h("span", null, "→ ▪ ▪ ▪"));
    case "dns": return h("div", { class: "art fd-art" }, h("span", null, "gaia.cs.umass.edu ?"), h("span", null, "root → .edu → umass"), h("span", { class: "hot" }, "→ A record, cached"));
    case "bars": return h("div", { class: "art bars-art" }, [5, 9, 3, 7, 2, 8, 4, 6].map((v, i) => h("i", { style: `height:${v * 10}%`, class: i === 2 || i === 3 ? "hot" : "" })));
    case "search": return h("div", { class: "art search-art" }, [3, 8, 12, 19, 23, 31, 40].map((v, i) => h("i", { class: i === 3 ? "hot" : i < 3 ? "out" : "" }, v)));
    case "stack": return h("div", { class: "art stack-art" }, h("div", null, ["7", "3", "5"].map((v, i) => h("i", { class: i === 0 ? "hot" : "" }, v))), h("span", null, "a b c * +"));
    case "list": return h("div", { class: "art list-art" }, ["4", "8", "15"].map((v, i) => [i ? h("b", { "aria-hidden": "true" }, "→") : null, h("i", { class: i === 1 ? "hot" : "" }, v)]), h("b", null, "→ ∅"));
    case "dp": return h("div", { class: "art dp-art" }, Array.from({ length: 15 }, (_, i) => h("i", { class: i === 8 ? "hot" : i === 2 || i === 7 ? "dep" : [0, 6, 12].includes(i) ? "path" : "" })));
    case "states": return h("div", { class: "art states-art" }, h("svg", { viewBox: "0 0 150 54", "aria-hidden": "true" },
      h("path", { d: "M2,27 L14,27", class: "a" }), h("path", { d: "M44,27 L60,27", class: "a" }), h("path", { d: "M90,27 L106,27", class: "a" }), h("path", { d: "M117,13 C108,-6 140,-6 131,13", class: "a" }),
      h("circle", { cx: 29, cy: 27, r: 14 }), h("circle", { cx: 75, cy: 27, r: 14, class: "on" }), h("circle", { cx: 124, cy: 27, r: 14 }), h("circle", { cx: 124, cy: 27, r: 10 })));
    case "bst": case "avl": {
      const pts = [[75, 12], [42, 32], [108, 32], [24, 52], [58, 52], [92, 52]], links = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5]];
      return h("div", { class: `art dt-art ${kind}-art` }, h("svg", { viewBox: "0 0 150 64", "aria-hidden": "true" },
        links.map(([a, b]) => h("line", { x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1] })),
        pts.map(([x, y], i) => h("circle", { cx: x, cy: y, r: 8, class: (kind === "bst" ? [0, 1, 4] : [2, 5]).includes(i) ? "on" : "" })),
        kind === "avl" ? [[0, "+1"], [1, "0"], [2, "−1"]].map(([i, t]) => h("text", { x: pts[i][0] + 10, y: pts[i][1] - 4 }, t)) : null));
    }
    case "heap": return h("div", { class: "art heap-art" }, [2, 5, 3, 9, 7, 4].map((v, i) => h("i", { class: i === 0 ? "hot" : "" }, v)));
    case "trie": return h("div", { class: "art fd-art" }, h("span", null, "insert car, card, cat"), h("span", null, "c → a → r◎ → d◎, a → t◎"), h("span", { class: "hot" }, "prefix \"ca\" → car, card, cat"));
    case "uf": return h("div", { class: "art dt-art uf-art" }, h("svg", { viewBox: "0 0 150 64", "aria-hidden": "true" },
      [[40, 14, 22, 50], [40, 14, 58, 50], [112, 14, 112, 50]].map(([x1, y1, x2, y2]) => h("line", { x1, y1, x2, y2 })),
      [[40, 14, "on"], [22, 50], [58, 50], [112, 14, "on"], [112, 50]].map(([x, y, c]) => h("circle", { cx: x, cy: y, r: 8, class: c ?? "" }))));
    case "subset": return h("div", { class: "art fd-art" }, h("span", null, "ε-closure({0}) = A"), h("span", null, "move(A, a) = {3, 8}"), h("span", { class: "hot" }, "→ new state B"));
    case "partition": return h("div", { class: "art part-art" }, ["A C", "B", "D", "E"].map((x, i) => h("span", { style: `--c:var(--series-${i + 1})` }, x)));
    case "thompson": return h("div", { class: "art fd-art" }, h("span", null, "(a|b)*abb"), h("span", null, "postfix ab|*a·b·b·"), h("span", { class: "hot" }, "→ 11-state ε-NFA"));
    case "cyk": return h("div", { class: "art cyk-art" }, [1, 2, 3].map((n) => h("div", null, Array.from({ length: n }, (_, i) => h("i", { class: n === 1 ? "hot" : "" })))));
    case "tape": return h("div", { class: "art tape-art" }, [..."XaYb_"].map((c, i) => h("i", { class: i === 2 ? "hot" : "" }, c)));
    case "rewrite": return h("div", { class: "art fd-art" }, h("span", null, "E → E + T | T"), h("span", { class: "hot" }, "E → T E′"), h("span", { class: "hot" }, "E′ → + T E′ | ε"));
    case "first": return h("div", { class: "art fd-art" }, h("span", null, "FIRST(E) = { (, id }"), h("span", null, "FOLLOW(E) = { ), $ }"), h("span", { class: "hot" }, "FOLLOW(T) += { + }"));
    case "ll1": return h("div", { class: "art matrix-art" }, cells(15, [4, 6, 13]));
    case "lr": return h("div", { class: "art fd-art" }, h("span", null, "I0 —id→ I5"), h("span", null, "s5  r6  acc"), h("span", { class: "hot" }, "shift/reduce on ="));
    case "dag": return h("div", { class: "art fd-art" }, h("span", null, "t1 = minus c"), h("span", null, "t2 = b * t1"), h("span", { class: "hot" }, "t3 = t2 + t2  ← shared"));
    case "btree": return h("div", { class: "art tree-art btree-art" }, h("i", { class: "r" }, "P"), h("div", null, h("i", null, "C G"), h("i", { class: "hot" }, "T X")));
    case "locks": return h("div", { class: "art locks-art" }, h("div", null, h("b", null, "A"), h("i", { class: "x" }, "T1 X"), h("i", { class: "q" }, "T2 S")), h("div", null, h("b", null, "B"), h("i", null, "T2 S"), h("i", null, "T3 S")));
    case "algebra": return h("div", { class: "art fd-art algebra-art" }, h("span", null, "π σ (R × S × T)"), h("span", null, "→ σ(R) ⋈ S ⋈ T"), h("span", { class: "hot" }, "2.4 × 10⁹ → 1,777 tuples"));
    case "log": return h("div", { class: "art fd-art log-art" }, h("span", null, "<T2, A, 500, 400>"), h("span", { class: "hot" }, "⚡ crash"), h("span", null, "undo T2 → A = 500"));
    case "cnf": return h("div", { class: "art cnf-art" }, h("span", null, "S → A S A | a B"), h("span", { class: "gone" }, "B → ε"), h("span", { class: "hot" }, "S → A X1 | Ta B | a"));
    case "opt": return h("div", { class: "art fd-art opt-art" }, h("span", null, "t7 = 4 * i"), h("span", { class: "hot" }, "t7 = t6   ← CSE"), h("span", { class: "gone" }, "t10 = t8"));
    case "elim": return h("div", { class: "art fd-art" }, h("span", null, "1 —a→ 2 —b*→ 2 —a→ 3"), h("span", null, "eliminate 2"), h("span", { class: "hot" }, "1 —ab*a→ 3"));
    case "lexer": return h("div", { class: "art fd-art" }, h("span", null, "if x <= 10"), h("span", null, "<=> → <= | >"), h("span", { class: "hot" }, "⟨if⟩ ⟨id,1⟩ ⟨relop,LE⟩"));
    case "opprec": return h("div", { class: "art fd-art" }, h("span", null, "+ ⋖ *    * ⋗ +"), h("span", null, "$ ⋖ id ⋗ $"), h("span", { class: "hot" }, "reduce id * id"));
    case "pump": return h("div", { class: "art pump-art" }, h("i", { class: "x" }, "aa"), h("i", { class: "y" }, "a"), h("i", { class: "y" }, "a"), h("i", { class: "z" }, "abbb"));
    case "stack": return h("div", { class: "art pda-art" }, h("span", null, "a, A/AA"), h("div", { class: "stk" }, h("i", { class: "hot" }), h("i"), h("i"), h("i")));
    case "colour": return h("div", { class: "art graph-art ra-art" }, ["a", "b", "c", "N"].map((v, i) => h("span", { class: "p", style: `--c:var(--series-${[1, 1, 2, 3][i]})` }, v)));
    case "sdt": return h("div", { class: "art fd-art" }, h("span", null, "E.val = E₁.val + T.val"), h("span", null, "T′.inh = F.val  ↓"), h("span", { class: "hot" }, "L.val = 19"));
    case "er": return h("div", { class: "art er-art" }, h("svg", { viewBox: "0 0 150 60", "aria-hidden": "true" },
      h("line", { x1: 40, y1: 38, x2: 110, y2: 38 }), h("line", { x1: 22, y1: 24, x2: 22, y2: 14 }), h("line", { x1: 128, y1: 24, x2: 128, y2: 14 }),
      h("rect", { x: 4, y: 28, width: 36, height: 20 }), h("path", { d: "M75,26 L97,38 L75,50 L53,38 Z", class: "hot" }), h("rect", { x: 110, y: 28, width: 36, height: 20 }), h("rect", { class: "in", x: 113, y: 31, width: 30, height: 14 }),
      h("ellipse", { cx: 22, cy: 9, rx: 15, ry: 7 }), h("ellipse", { cx: 128, cy: 9, rx: 15, ry: 7 }), h("line", { class: "u", x1: 14, y1: 9, x2: 30, y2: 9 })));
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
  const empty = h("p", { class: "muted", hidden: true }, "No tool matches that yet. Try “deadlock”, “join”, “subnet”, “DFA” or “parsing”.");
  const search = h("input", {
    type: "search", class: "tool-search", placeholder: `Search ${TOOLS.length} tools: LRU, B+ tree, subnetting, LALR…`, "aria-label": "Search tools",
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
      h("p", { class: "eyebrow" }, `${TOOLS.length} CS visualisers: DSA, OS, DBMS, networks, theory, compilers`),
      h("h1", null, "See every step."),
      h("p", { class: "lede" }, "The algorithms in your data structures, operating systems, databases, networks, theory of computation and compiler design exams, animated one step at a time beside the pseudocode, with the line being run highlighted, the variables live and the reasoning written out. Then practise on fresh questions that check every answer."),
      search),
    empty,
    ...sections,
    h("section", { class: "why" },
      h("div", null, h("h3", null, "Built for exams"), h("p", null, "Every tool states the conventions it uses (tie-breaking, split rules, what counts as head movement) so your answers match what your examiner expects.")),
      h("div", null, h("h3", null, "Practice that checks you"), h("p", null, "Fresh questions every time, with each answer marked and the full working one click away.")),
      h("div", null, h("h3", null, "Share any example"), h("p", null, "Every input is in the link, so you can send a classmate the exact question you're stuck on."))));
  return () => {};
}
