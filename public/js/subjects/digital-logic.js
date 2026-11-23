// Tools for Digital logic. Same shape as the entries in ../tools.js; views live in
// ../views/ (so load: () => import("../views/<file>.js")). A subject with no
// tools is hidden everywhere.
export const SUBJECT = { id: "digital-logic", name: "Digital logic", short: "DL" };

// Home-card thumbnails, drawn with the h() the home page passes in.
const bits = (h, text, hot = []) => h("div", { class: "dl-art-bits" }, [...text].map((b, i) => h("i", { class: `${b === "1" ? "one" : ""}${hot.includes(i) ? " hot" : ""}` }, b)));

export const TOOLS = [
  { slug: "number-systems", subject: "digital-logic", title: "Number systems", art: "numbers",
    summary: "Base conversion with every division and multiplication, fractions included, plus 1's and 2's complement and overflow.",
    description: "Number system converter with steps: any base 2 to 16, integer and fraction parts, signed magnitude, 1's and 2's complement, sign extension and overflow.",
    load: () => import("../views/numbers.js"),
    preview: (h) => h("div", { class: "art dl-art" },
      h("span", { class: "dl-art-line" }, "(25.625)₁₀ ="), bits(h, "11001.101", [5]), h("span", { class: "dl-art-line hot" }, "−5 → 11111011")) },
  { slug: "k-map", subject: "digital-logic", title: "K-map minimiser", art: "kmap",
    summary: "Karnaugh maps for 2 to 5 variables with don't-cares: prime implicants, essential ones, minimal SOP and POS, and Quine-McCluskey.",
    description: "K-map solver with steps: 2 to 5 variables, don't-cares, prime and essential prime implicants, minimal SOP and POS, and the Quine-McCluskey table.",
    load: () => import("../views/kmap.js"),
    preview: (h) => h("div", { class: "art dl-art dl-art-km" },
      h("div", { class: "dl-km" }, [1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0].map((v, i) => h("i", { class: v ? "one" : "" }, v))),
      h("span", { class: "dl-km-ring a" }), h("span", { class: "dl-km-ring b" })) },
  { slug: "combinational-circuits", subject: "digital-logic", title: "Combinational circuits", art: "gates",
    summary: "Multiplexers, decoders, half and full adders, ripple-carry delay and comparators, with live values on every wire.",
    description: "Combinational circuits with live signals: implement a function with a MUX, decoders, half and full adders, ripple-carry delay and magnitude comparators.",
    load: () => import("../views/combinational.js"),
    preview: (h) => h("div", { class: "art dl-art" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true", class: "dl-art-svg" },
      h("polyline", { points: "4,16 40,16", class: "hi" }), h("polyline", { points: "4,40 40,40", class: "lo" }),
      h("path", { d: "M40,8 Q58,28 40,48 Q78,48 96,28 Q78,8 40,8 z", class: "g" }), h("path", { d: "M33,8 Q51,28 33,48", class: "g2" }),
      h("polyline", { points: "96,28 146,28", class: "hi" }), h("text", { x: 108, y: 22 }, "S = 1"))) },
  { slug: "sequential-circuits", subject: "digital-logic", title: "Sequential circuits", art: "clock",
    summary: "SR, JK, D and T flip-flops with timing diagrams, conversions, synchronous and ripple counters, ring and Johnson counters.",
    description: "Flip-flops and counters step by step: SR, JK, D, T with timing diagrams, excitation tables, conversion, mod-N synchronous and ripple counters.",
    load: () => import("../views/sequential.js"),
    preview: (h) => h("div", { class: "art dl-art" }, h("svg", { viewBox: "0 0 150 58", "aria-hidden": "true", class: "dl-art-svg" },
      h("polyline", { points: "4,22 14,22 14,6 26,6 26,22 38,22 38,6 50,6 50,22 62,22 62,6 74,6 74,22 86,22 86,6 98,6 98,22 110,22 110,6 122,6 122,22 134,22 134,6 146,6", class: "clk" }),
      h("polyline", { points: "4,52 14,52 14,36 62,36 62,52 110,52 110,36 146,36", class: "hi" }))) },
];
