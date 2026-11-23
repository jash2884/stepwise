import { SUBJECTS, TOOLS } from "../tools.js";
import { ROADMAPS, hoursOf } from "../roadmaps.js";
import { GATE_SLUGS } from "../gate-link.js";
import { h, reducedMotion } from "../ui.js";

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


// --- Hero demo: a real bubble sort, stepping beside its pseudocode -------------------

const CODE = ["for i ← 0 to n − 2", "  for j ← 0 to n − i − 2", "    if a[j] > a[j + 1]", "      swap(a[j], a[j + 1])", "  if no swaps: stop"];

export function bubbleFrames(values) {
  const a = values.map((v, k) => ({ v, k })), n = a.length, frames = [];
  let cmp = 0, sw = 0;
  const snap = (line, note, x = {}) => frames.push({ order: a.map((e) => e.k), line, note, cmp, sw, sortedFrom: n, i: null, j: null, pair: [], ...x });
  snap(0, "Walk the array and swap neighbours that are out of order.");
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      cmp++;
      const out = a[j].v > a[j + 1].v, pair = [a[j].k, a[j + 1].k];
      snap(2, `Compare ${a[j].v} and ${a[j + 1].v}: ${out ? "out of order" : "already in order"}.`, { i, j, pair, sortedFrom: n - i });
      if (out) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        sw++; swapped = true;
        snap(3, `Swap them, so ${a[j + 1].v} moves right.`, { i, j, pair, swap: true, sortedFrom: n - i });
      }
    }
    if (!swapped) { snap(4, "A pass with no swaps, so the array is sorted.", { i, sortedFrom: 0 }); return frames; }
    snap(0, `Pass ${i + 1} done: ${a[n - 1 - i].v} is in its final place.`, { i, sortedFrom: n - 1 - i });
  }
  snap(0, "Sorted.", { sortedFrom: 0 });
  return frames;
}

function demo() {
  const N = 7;
  const shuffle = () => { const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9]; for (let k = pool.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [pool[k], pool[r]] = [pool[r], pool[k]]; } return pool.slice(0, N); };
  let values = [5, 2, 8, 3, 9, 1, 6], frames = bubbleFrames(values), at = 0, timer = null, userPaused = false;

  const bars = h("div", { class: "demo-bars", "aria-hidden": "true" });
  const code = h("ol", { class: "demo-code", "aria-label": "Pseudocode" }, CODE.map((c) => h("li", null, c)));
  const vars = h("dl", { class: "demo-vars" });
  const note = h("p", { class: "demo-note" });
  const count = h("span", { class: "demo-count" });
  const progress = h("i");
  const playBtn = h("button", { type: "button", class: "demo-ctl play", "aria-label": "Pause", onclick: () => (timer ? stop(true) : start()) });
  const ctl = (label, glyph, fn) => h("button", { type: "button", class: "demo-ctl", "aria-label": label, title: label, onclick: () => { stop(true); fn(); } }, glyph);

  const load = (vals) => {
    values = vals; frames = bubbleFrames(values); at = 0;
    bars.replaceChildren(...values.map((v, k) => h("span", { class: "demo-bar", "data-k": k, style: `--v:${v}` }, h("b", null, v))));
    draw();
  };
  function draw() {
    const f = frames[at];
    f.order.forEach((k, pos) => {
      const el = bars.children[k];
      el.style.setProperty("--x", pos);
      el.classList.toggle("cmp", f.pair.includes(k) && !f.swap);
      el.classList.toggle("swap", f.pair.includes(k) && !!f.swap);
      el.classList.toggle("done", pos >= f.sortedFrom);
    });
    [...code.children].forEach((li, n) => li.classList.toggle("on", n === f.line));
    const v = (k, val) => [h("dt", null, k), h("dd", null, val)];
    vars.replaceChildren(...v("i", f.i ?? "·"), ...v("j", f.j ?? "·"), ...v("comparisons", f.cmp), ...v("swaps", f.sw));
    note.textContent = f.note;
    count.textContent = `Step ${at + 1} of ${frames.length}`;
    progress.style.width = `${((at + 1) / frames.length) * 100}%`;
  }
  const go = (n) => { at = Math.max(0, Math.min(frames.length - 1, n)); draw(); };
  function tick() {
    if (at < frames.length - 1) go(at + 1);
    else load(shuffle());
  }
  function start() {
    userPaused = false;
    clearInterval(timer);
    timer = setInterval(tick, 950);
    playBtn.textContent = "❚❚"; playBtn.setAttribute("aria-label", "Pause");
  }
  function stop(byUser) {
    if (byUser) userPaused = true;
    clearInterval(timer); timer = null;
    playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play");
  }

  const el = h("section", { class: "demo", "aria-label": "Live demo: bubble sort, step by step" },
    h("div", { class: "demo-top" },
      h("span", { class: "demo-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("span", { class: "demo-title" }, "Bubble sort ", h("span", { class: "muted" }, "· live")),
      h("a", { class: "demo-open", href: "/sorting" }, "Open the full tool →")),
    h("div", { class: "demo-body" },
      h("div", { class: "demo-stage" }, bars, note),
      h("div", { class: "demo-side" }, code, vars)),
    h("div", { class: "demo-controls" },
      ctl("Previous step", "◀", () => go(at - 1)), playBtn, ctl("Next step", "▶▶", () => go(at + 1)),
      ctl("New numbers", "↻", () => load(shuffle())),
      h("span", { class: "demo-progress", "aria-hidden": "true" }, progress), count));
  load(values);
  stop(false);

  // Play only while it's on screen, and never on its own for reduced motion.
  const auto = !reducedMotion();
  const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => {
    if (e.isIntersecting && auto && !userPaused && !timer) start();
    else if (!e.isIntersecting && timer) stop(false);
  }) : null;
  io?.observe(el);
  if (!io && auto) start();
  return { el, dispose: () => { stop(false); io?.disconnect(); } };
}

// --- Catalogue ----------------------------------------------------------------------------

const KINDS = [["all", "Everything"], ["tool", "Visualisers"], ["practice", "Practice"], ["roadmap", "Roadmaps"]];
const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
const stageColour = (i) => `var(--series-${(i % 8) + 1})`;

const badges = (t) => {
  const list = [t.new ? h("span", { class: "badge-new" }, "New") : null, GATE_SLUGS.has(t.slug) ? h("span", { class: "badge-gate" }, "GATE") : null].filter(Boolean);
  return list.length ? h("span", { class: "badges" }, list) : null;
};

const toolCard = (t) => h("a", { class: "tool-card", href: `/${t.slug}` },
  h("div", { class: "art-wrap" }, t.preview ? t.preview(h) : art(t.art), badges(t)),
  h("h4", null, t.title),
  h("p", null, t.summary));

const practiceCard = (p) => h("a", { class: "tool-card practice-card", href: `/gate?topic=${p.slug}` },
  h("span", { class: "practice-mark", "aria-hidden": "true" }, "Q"),
  h("h4", null, `GATE questions: ${p.title}`),
  h("p", null, "MCQ, MSQ and NAT questions made fresh each time, marked the GATE way, with worked solutions."),
  h("span", { class: "badges static" }, h("span", { class: "badge-gate" }, "Practice")));

function roadmapCard(r, heading = "h3") {
  const modules = r.stages.flatMap((s) => s.modules);
  return h("a", { class: "rm-mini", href: `/roadmap/${r.id}` },
    h("span", { class: "rm-mini-bar", "aria-hidden": "true" }, r.stages.map((s, i) => h("i", { style: `flex:${s.modules.length};background:${stageColour(i)}` }))),
    h(heading, null, r.title),
    h("p", null, r.summary),
    h("span", { class: "rm-mini-facts" }, `${r.stages.length} stages · ${modules.length} topics · about ${hoursOf(modules)} h`));
}

function catalogue(initialSubject) {
  const tools = new Map(TOOLS.map((t) => [t.slug, t]));
  const practiceInfo = new Map();
  for (const r of ROADMAPS) for (const s of r.stages) for (const m of s.modules) for (const g of m.gate ?? []) if (!practiceInfo.has(g)) practiceInfo.set(g, { slug: g, title: tools.get(g)?.title ?? m.title, subject: tools.get(g)?.subject ?? s.subject });
  const subjects = SUBJECTS.map((s) => ({ ...s, n: TOOLS.filter((t) => t.subject === s.id).length }));

  const items = [
    ...TOOLS.map((t) => ({ kind: "tool", subjects: [t.subject], text: `${t.title} ${t.summary} ${t.description} ${t.slug}`.toLowerCase(), el: toolCard(t) })),
    ...[...practiceInfo.values()].map((p) => ({ kind: "practice", subjects: [p.subject], text: `gate practice questions ${p.title} ${p.slug}`.toLowerCase(), el: practiceCard(p) })),
    ...ROADMAPS.map((r) => ({ kind: "roadmap", subjects: [...new Set(r.stages.map((s) => s.subject))], text: `roadmap ${r.title} ${r.summary} ${r.stages.map((s) => s.title).join(" ")}`.toLowerCase(), el: roadmapCard(r, "h4") })),
  ];
  const state = { kind: "all", subject: subjects.some((s) => s.id === initialSubject) ? initialSubject : "all", q: [] };
  const fits = (it, { kind = state.kind, subject = state.subject } = {}) =>
    (kind === "all" || it.kind === kind) && (subject === "all" || it.subjects.includes(subject)) && state.q.every((w) => it.text.includes(w));

  const groups = [
    ...subjects.map((s) => ({ id: s.id, title: s.name, list: items.filter((it) => it.kind !== "roadmap" && it.subjects[0] === s.id) })),
    { id: "roadmaps", title: "Roadmaps", list: items.filter((it) => it.kind === "roadmap") },
  ];
  // Practice for a subject with no tools of its own yet still needs a home.
  const placed = new Set(groups.flatMap((g) => g.list));
  groups.push({ id: "more", title: "More practice", list: items.filter((it) => !placed.has(it)) });
  const sections = groups.filter((g) => g.list.length).map((g) => {
    const n = h("span", { class: "count" });
    const el = h("section", { class: "subject", "data-subject": g.id },
      h("h3", { class: "subject-title" }, g.title, n),
      h("div", { class: g.id === "roadmaps" ? "tool-grid rm-grid" : "tool-grid" }, g.list.map((it) => it.el)));
    return { ...g, el, n };
  });

  const pill = (group, id, label) => h("button", { type: "button", class: "pill", "data-group": group, "data-id": id, "aria-pressed": "false", onclick: () => { state[group] = id; apply(true); } },
    label, h("span", { class: "pill-n" }));
  const kindPills = h("div", { class: "pills", role: "group", "aria-label": "Filter by kind" }, KINDS.map(([id, label]) => pill("kind", id, label)));
  const subjectPills = h("div", { class: "pills scroll", role: "group", "aria-label": "Filter by subject" },
    pill("subject", "all", "All subjects"), subjects.map((s) => pill("subject", s.id, s.short)));
  const search = h("input", {
    type: "search", class: "tool-search", placeholder: `Search ${TOOLS.length} tools: LRU, B+ tree, subnetting, LALR…`, "aria-label": "Search the catalogue",
    oninput: (e) => { state.q = words(e.target.value); apply(false); },
  });
  const status = h("p", { class: "cat-status muted small", "aria-live": "polite" });
  const empty = h("div", { class: "cat-empty", hidden: true },
    h("p", null, "Nothing here matches that yet."),
    h("button", { type: "button", class: "btn ghost small", onclick: () => { state.kind = "all"; state.subject = "all"; state.q = []; search.value = ""; apply(true); } }, "Clear filters"));

  function apply(fromPill) {
    let shown = 0;
    for (const it of items) { it.el.hidden = !fits(it); if (!it.el.hidden) shown++; }
    for (const s of sections) {
      const n = s.list.filter((it) => !it.el.hidden).length;
      s.el.hidden = n === 0;
      s.n.textContent = ` ${n}`;
    }
    for (const b of [...kindPills.children, ...subjectPills.children]) {
      const g = b.dataset.group, id = b.dataset.id;
      const n = items.filter((it) => fits(it, { [g]: id })).length;
      b.setAttribute("aria-pressed", String(state[g] === id));
      b.classList.toggle("zero", n === 0 && state[g] !== id);
      b.querySelector(".pill-n").textContent = n;
    }
    empty.hidden = shown > 0;
    status.textContent = `${shown} ${shown === 1 ? "result" : "results"}`;
    if (fromPill) {
      const p = new URLSearchParams(location.search);
      if (state.subject === "all") p.delete("subject"); else p.set("subject", state.subject);
      if (state.kind === "all") p.delete("kind"); else p.set("kind", state.kind);
      const q = p.toString();
      history.replaceState(null, "", `/${q ? `?${q}` : ""}${location.hash}`);
    }
  }
  const kindParam = new URLSearchParams(location.search).get("kind");
  if (KINDS.some(([id]) => id === kindParam)) state.kind = kindParam;
  apply(false);

  return h("section", { class: "catalogue", id: "catalogue", "aria-labelledby": "cat-title" },
    h("div", { class: "section-head" },
      h("div", null, h("p", { class: "eyebrow" }, "Catalogue"), h("h2", { id: "cat-title" }, "Everything in one place")),
      status),
    h("div", { class: "cat-controls" }, search, kindPills, subjectPills),
    empty,
    sections.map((s) => s.el));
}

// --- The page ----------------------------------------------------------------------------

const LEARN = [
  ["/mock", "Mock test", "A timed paper in the GATE format.", "M"],
  ["/diagnostic", "Diagnostic", "A short test that finds where to start.", "D"],
  ["/plan", "Study plan", "Week by week, built from a roadmap.", "P"],
  ["/review", "Review", "Bring back topics just before you forget them.", "R"],
  ["/mistakes", "Mistakes", "Every question you missed, ready to retry.", "X"],
  ["/progress", "Progress", "What you've covered, subject by subject.", "%"],
];

export function render(root) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const subjectsLive = SUBJECTS.filter((s) => TOOLS.some((t) => t.subject === s.id));
  const live = demo();
  const kbd = () => h("kbd", null, isMac ? "⌘K" : "Ctrl K");

  const hero = h("section", { class: "home-hero" },
    h("div", { class: "hero-copy" },
      h("p", { class: "eyebrow" }, `Free · ${TOOLS.length} interactive tools · ${subjectsLive.length} subjects`),
      h("h1", null, "See every step."),
      h("p", { class: "lede" }, "Step through the algorithms in your syllabus beside the pseudocode, then test yourself on questions that check every answer."),
      h("div", { class: "hero-cta" },
        h("a", { class: "btn primary", href: "#catalogue" }, "Browse every tool"),
        h("a", { class: "btn ghost", href: "/roadmaps" }, "Follow a roadmap")),
      h("form", { class: "home-ask", action: "/ask", method: "get", role: "search" }, h("input", { name: "q", type: "text", maxlength: 600, required: true, "aria-label": "Ask a question", placeholder: "Ask anything: “LRU faults for 7 0 1 2 0 3, 3 frames”" }), h("button", { type: "submit", class: "btn ghost small" }, "Ask")),
      h("button", { type: "button", class: "palette-hint", "data-palette": "" }, "Press ", kbd(), " to jump to any tool, topic or roadmap")),
    live.el);

  const roadmaps = h("section", { class: "home-band", "aria-labelledby": "rm-title" },
    h("div", { class: "section-head" },
      h("div", null, h("p", { class: "eyebrow" }, "Roadmaps"), h("h2", { id: "rm-title" }, "Know what to study next")),
      h("a", { class: "link-more", href: "/roadmaps" }, "All roadmaps →")),
    h("div", { class: "rm-strip" }, ROADMAPS.map((r) => roadmapCard(r))));

  const learn = h("section", { class: "home-band", "aria-labelledby": "learn-title" },
    h("div", { class: "section-head" },
      h("div", null, h("p", { class: "eyebrow" }, "Practise and track"), h("h2", { id: "learn-title" }, "Test yourself, then fix the gaps"))),
    h("div", { class: "bento" },
      h("a", { class: "bento-main", href: "/gate" },
        h("p", { class: "eyebrow" }, "GATE CS practice"),
        h("h3", null, "Endless GATE-style questions"),
        h("p", null, `MCQ, MSQ and NAT questions on ${GATE_SLUGS.size} topics, made by the same engines as the visualisers, marked the GATE way, each with a worked solution you can replay step by step.`),
        h("span", { class: "btn primary" }, "Start practising →")),
      LEARN.map(([href, title, text, mark]) => h("a", { class: "bento-item", href },
        h("span", { class: "bento-mark", "aria-hidden": "true" }, mark),
        h("span", null, h("b", null, title), h("span", { class: "muted small" }, text))))));

  const how = h("section", { class: "home-band how", "aria-labelledby": "how-title" },
    h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "How it works"), h("h2", { id: "how-title" }, "Three steps per topic"))),
    h("ol", { class: "steps" }, [
      ["See it", "Watch the algorithm run one step at a time, with the line of pseudocode, the live variables and the reason for each move."],
      ["Try it", "Change the input and run it again. Every example lives in the link, so you can share the exact case you're stuck on."],
      ["Test yourself", "Answer fresh questions that are marked as you go, with the full working one click away."],
    ].map(([t, p], i, all) => h("li", null, h("span", { class: "step-n" }, `0${i + 1} / 0${all.length}`), h("h3", null, t), h("p", null, p)))));

  const stats = h("section", { class: "stats-strip", "aria-label": "Stepwise in numbers" },
    [[TOOLS.length, "interactive tools"], [subjectsLive.length, "subjects"], [ROADMAPS.length, ROADMAPS.length === 1 ? "roadmap" : "roadmaps"], [GATE_SLUGS.size, "GATE practice topics"]]
      .map(([n, label]) => h("div", null, h("b", null, n), h("span", null, label))));

  const cont = h("section", { id: "home-continue", hidden: true });
  root.replaceChildren(hero, cont, roadmaps, catalogue(new URLSearchParams(location.search).get("subject")), learn, how, stats);
  import("../learn/continue.js").then((m) => m.mountContinue(document.getElementById("home-continue"))).catch(() => {});
  if (location.hash === "#catalogue") requestAnimationFrame(() => document.getElementById("catalogue")?.scrollIntoView());
  return () => live.dispose();
}
