import { addTwos, ADD_CODE, convert, CONVERT_CODE, decode, DIGITS, fractionDigits, randomDigits, ranges, represent, SCHEMES, signedSteps, SIGNED_CODE, sub } from "../engines/numbers.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs, stat } from "./kit.js";
import { bitRow, segmented, traced } from "./dl-kit.js";

const MODES = [["convert", "Base conversion"], ["signed", "Signed numbers"], ["add", "Add and overflow"]];
const int = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.trunc(Number(v)) : d);

// Part 1: each digit over its place value.
function expansionView(r, done) {
  if (r.from === 10) return null;
  const cells = [...r.expansion.map((e) => ({ ...e, side: "int" })), ...r.fexp.map((e) => ({ ...e, side: "frac" }))];
  return h("div", { class: "nb-block" }, h("h3", null, `Part 1: base ${r.from} to decimal`),
    h("div", { class: "nb-places" }, cells.map((c, i) => [
      i === r.expansion.length && r.fexp.length ? h("span", { class: "nb-point" }, ".") : null,
      h("div", { class: `nb-place${done ? " on" : ""}` }, h("b", null, c.digit), h("span", null, `× ${r.from}`, h("sup", null, c.pos)))])),
    done ? h("p", { class: "mono small" }, `= ${r.value}${r.frac ? ` + ${r.fraction[0]}/${r.fraction[1]}` : ""}`) : null);
}

function divisionView(r, upto, reading) {
  if (r.to === 10) return null;
  return h("div", { class: "nb-block" }, h("h3", null, "Whole part: divide by ", r.to, " repeatedly"),
    h("div", { class: "table-wrap" }, h("table", { class: "parse nb-div" },
      h("thead", null, h("tr", null, ["n", `÷ ${r.to}`, "remainder", "digit"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, r.divisions.slice(0, upto).map((d, i) => h("tr", { class: i === upto - 1 && !reading ? "hot" : null },
        h("td", null, d.n.toString()), h("td", null, d.q.toString()), h("td", null, d.r), h("td", { class: reading ? "added" : null }, DIGITS[d.r])))))),
    reading ? h("p", { class: "small muted" }, "↑ Read the digit column from the bottom up: ", h("b", { class: "mono" }, r.intDigits)) : null);
}

function multiplyView(r, upto, final) {
  if (r.to === 10 || !r.multiplications.length) return null;
  // Decimal when it ends within 6 places, otherwise an exact fraction.
  const show = ([num, den]) => {
    if (num === 0n) return "0";
    const whole = num / den, rest = num % den, d = fractionDigits(rest, den, 10, 6);
    return d.exact ? `${whole}${rest ? `.${d.digits.join("")}` : ""}` : `${num}/${den}`;
  };
  return h("div", { class: "nb-block" }, h("h3", null, "Fraction: multiply by ", r.to, " repeatedly"),
    h("div", { class: "table-wrap" }, h("table", { class: "parse nb-div" },
      h("thead", null, h("tr", null, ["f", `f × ${r.to}`, "digit", "left over"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, r.multiplications.slice(0, upto).map((m, i) => h("tr", { class: i === upto - 1 && !final ? "hot" : r.repeatFrom === i ? "nb-repeat" : null },
        h("td", null, show(m.before)), h("td", null, show(m.product)), h("td", { class: final ? "added" : null }, DIGITS[m.digit]), h("td", null, show(m.after))))))),
    final ? h("p", { class: "small muted" }, "↓ Read the digits from the top down: ", h("b", { class: "mono" }, `.${r.fracDigits}`), r.repeatFrom !== null ? ` (repeats from place ${r.repeatFrom + 1})` : "") : null);
}

function convertStage(r, s) {
  const divUpto = s.phase === "div" ? s.divisions.length : ["read", "mul", "done"].includes(s.phase) ? r.divisions.length : 0;
  const mulUpto = s.phase === "mul" ? s.multiplications.length : s.phase === "done" ? r.multiplications.length : 0;
  return h("div", null,
    expansionView(r, true),
    divisionView(r, divUpto, ["read", "mul", "done"].includes(s.phase)),
    multiplyView(r, mulUpto, s.phase === "done"),
    s.phase === "done" ? h("p", { class: "big-answer" }, `(${r.input})${sub(r.from)} = `, h("b", null, `(${r.result}${r.exact ? "" : "…"})${sub(r.to)}`)) : null);
}

// Base 2 ↔ 8 ↔ 16 shortcut: group the bits.
function grouping(r) {
  const p2 = (b) => [2, 8, 16].includes(b);
  if (!p2(r.from) || !p2(r.to) || r.from === r.to || (r.from !== 2 && r.to !== 2) || r.frac) return null;
  const binary = r.from === 2 ? r.int : r.to === 2 ? r.result : null;
  const other = r.from === 2 ? r.to : r.from;
  const g = other === 8 ? 3 : 4;
  const padded = binary.padStart(Math.ceil(binary.length / g) * g, "0");
  const groups = padded.match(new RegExp(`.{${g}}`, "g"));
  return h("div", { class: "nb-block" }, h("h3", null, `Shortcut: groups of ${g} bits`),
    h("div", { class: "nb-groups" }, groups.map((x) => h("div", null, h("span", { class: "mono" }, x), h("b", null, DIGITS[parseInt(x, 2)])))),
    h("p", { class: "small muted" }, `${other} = 2^${g}, so each group of ${g} bits is exactly one base-${other} digit. Start grouping from the point.`));
}

function signedStage(r, s, bits) {
  const rows = [["sm", r.sm], ["ones", r.ones], ["twos", r.twos]];
  return h("div", null,
    h("div", { class: "nb-rep" }, rows.map(([k, v], i) => h("div", { class: `nb-rep-row${s.show === i + 1 ? " now" : ""}${s.show < i + 1 ? " later" : ""}` },
      h("span", { class: "nb-rep-name" }, SCHEMES[k]),
      s.show >= i + 1 ? (v ? bitRow(v, { marks: { 0: "sign" } }) : h("span", { class: "muted" }, "out of range")) : h("span", { class: "muted" }, "…"),
      h("span", { class: "small muted" }, `range ${r.ranges[k][0]} to ${r.ranges[k][1]}`)))),
    s.show >= 4 && r.extended ? h("div", { class: "nb-rep-row now" }, h("span", { class: "nb-rep-name" }, "Sign-extended"), bitRow(r.extended, { marks: Object.fromEntries(Array.from({ length: r.extended.length - bits + 1 }, (_, i) => [i, "sign"])) })) : null);
}

function decodeTable(bitsText) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse" },
    h("thead", null, h("tr", null, ["Bits", "Unsigned", "Signed magnitude", "1's complement", "2's complement"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", null, h("tr", null, h("td", null, bitsText), ...["unsigned", "sm", "ones", "twos"].map((k) => h("td", null, decode(bitsText, k)))))));
}

function addStage(r, s) {
  const n = r.bits;
  const col = s.col;
  const marks = (fn) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, fn(n - 1 - i)]));
  const now = (i) => (i === col ? "now" : "");
  const carries = Array.from({ length: n + 1 }, (_, i) => (i < s.carries.length ? String(s.carries[i]) : " "));
  return h("div", { class: "nb-add" },
    bitRow(carries.slice(0, n + 1).reverse().join("").slice(0, n + 1), { label: "carry", cls: "carry", marks: Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => [i, (n - i === col || n - i === col + 1) && col >= 0 && col < n ? "now" : ""])) }),
    bitRow(` ${r.A}`, { label: "A", marks: { ...marks(now), 0: "pad" } }),
    bitRow(` ${r.B}`, { label: r.op === "-" ? "NOT B" : "B", marks: { ...marks(now), 0: "pad" } }),
    h("div", { class: "nb-rule", style: `--n:${n + 1}` }),
    bitRow(` ${s.sum.map((x) => (x === null ? " " : x)).join("")}`, { label: r.op === "-" ? "A − B" : "A + B", marks: { ...marks((i) => (i === col ? "now" : s.col >= n && r.overflow ? "bad" : "")), 0: "pad" } }),
    s.col >= n ? h("p", { class: "small" }, r.overflow ? notice("bad", `Overflow: ${r.a} ${r.op === "-" ? "−" : "+"} ${r.b} = ${r.truth}, outside ${ranges(n).twos[0]} to ${ranges(n).twos[1]}.`) : notice("good", `No overflow: ${r.result} = ${r.value}.`)) : null);
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: MODES.some(([m]) => m === p.get("mode")) ? p.get("mode") : "convert",
    x: p.get("x") ?? "25.625", from: int(p.get("from"), 10), to: int(p.get("to"), 2), places: int(p.get("p"), 8),
    v: int(p.get("v"), -37), bits: int(p.get("b"), 8), ext: int(p.get("e"), 16),
    a: int(p.get("a"), 100), bb: int(p.get("bb"), 50), w: int(p.get("w"), 8), op: p.get("op") === "sub" ? "-" : "+",
  };
  let players = [];
  const head = page({
    subject: "Digital logic",
    title: "Number systems",
    lede: "Convert between any bases from 2 to 16, fractions included, and see how computers store negative numbers and spot overflow.",
    theory: h("div", null,
      h("p", null, "A digit is worth its value times the base raised to its position: in ", h("b", null, "(1A.8)₁₆"), ", 1 is worth 16, A (10) is worth 10 and 8 is worth 8/16. To convert ", h("b", null, "to decimal"), ", add those up. To convert ", h("b", null, "from decimal"), ": divide the whole part by the new base again and again (the remainders, read upwards, are the digits), and multiply the fraction by the new base again and again (the whole parts, read downwards, are the digits). Between bases 2, 8 and 16 you can just group bits in 3s or 4s."),
      h("p", null, "Some fractions never end in another base: 0.1 in decimal is 0.000110011… in binary, which is why floating point can't store it exactly."),
      h("p", null, "With n bits, ", h("b", null, "signed magnitude"), " uses the first bit for the sign; ", h("b", null, "1's complement"), " flips every bit to negate; ", h("b", null, "2's complement"), " flips and adds 1, which gives a single zero and the range −2^(n−1) to 2^(n−1) − 1. Adding in 2's complement is plain binary addition: the result is wrong (", h("b", null, "overflow"), ") exactly when the carry into the sign bit differs from the carry out of it, which only happens when both operands have the same sign and the result's sign is different."),
      h("p", null, h("b", null, "Sign extension"), " copies the sign bit into new high bits, so a value keeps its meaning in a wider register.")),
    conventions: [
      "The whole part is converted by repeated division, the fraction by repeated multiplication.",
      "A fraction that doesn't end is cut off after the number of places you choose (truncated, not rounded).",
      "Digits above 9 are A to F.",
      "Signed numbers use n bits including the sign bit; the most significant bit is on the left.",
      "Subtraction A − B is done as A + (NOT B) + 1.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" });
  const modeBar = h("div");
  const num = (key, label, attrs = {}) => h("label", { class: "inline" }, label, h("input", { type: "number", value: state[key], ...attrs, "aria-label": label, onchange: (e) => { state[key] = int(e.target.value, state[key]); update(); } }));
  const inputs = h("div");

  function drawInputs() {
    modeBar.replaceChildren(segmented(MODES, state.mode, (m) => { state.mode = m; drawInputs(); update(); }, "What to work on"));
    if (state.mode === "convert") {
      inputs.replaceChildren(h("div", { class: "row" },
        h("label", { class: "inline" }, "Number ", h("input", { type: "text", class: "mono", value: state.x, size: 14, "aria-label": "Number to convert", oninput: (e) => { state.x = e.target.value; update(); } })),
        num("from", "from base", { min: 2, max: 16 }), num("to", "to base", { min: 2, max: 16 }), num("places", "fraction places", { min: 1, max: 16 })),
        h("div", { class: "row" }, [["25.625", 10, 2], ["0.1", 10, 2], ["1A.8", 16, 8], ["11011101", 2, 16], ["255", 10, 16], ["1202.1", 3, 10]].map(([x, f, t]) =>
          h("button", { type: "button", class: "btn ghost small", onclick: () => { Object.assign(state, { x, from: f, to: t }); drawInputs(); update(); } }, `(${x})${sub(f)} → base ${t}`))));
    } else if (state.mode === "signed") {
      inputs.replaceChildren(h("div", { class: "row" }, num("v", "Value (decimal)", { min: -32768, max: 65535 }), num("bits", "bits", { min: 2, max: 16 }), num("ext", "extend to", { min: 2, max: 32 })),
        h("div", { class: "row" }, [[-37, 8], [-128, 8], [127, 8], [-1, 4], [-8, 4], [5, 4]].map(([v, b]) => h("button", { type: "button", class: "btn ghost small", onclick: () => { Object.assign(state, { v, bits: b, ext: b * 2 }); drawInputs(); update(); } }, `${v} in ${b} bits`))));
    } else {
      inputs.replaceChildren(h("div", { class: "row" }, num("a", "A", { min: -32768, max: 32767 }),
        h("select", { "aria-label": "Operation", onchange: (e) => { state.op = e.target.value; update(); } }, [["+", "+"], ["-", "−"]].map(([v, t]) => h("option", { value: v, selected: v === state.op }, t))),
        num("bb", "B", { min: -32768, max: 32767 }), num("w", "bits", { min: 2, max: 16 })),
        h("div", { class: "row" }, [[100, 50, 8, "+"], [-100, -50, 8, "+"], [-3, 5, 4, "+"], [5, 3, 4, "+"], [-8, 1, 4, "-"], [6, -2, 4, "-"]].map(([a, b, w, op]) =>
          h("button", { type: "button", class: "btn ghost small", onclick: () => { Object.assign(state, { a, bb: b, w, op }); drawInputs(); update(); } }, `${a} ${op === "-" ? "−" : "+"} ${b < 0 ? `(${b})` : b}, ${w} bits`))));
    }
  }

  function update() {
    players.forEach((x) => x.destroy()); players = [];
    writeParams(state.mode === "convert" ? { mode: "convert", x: state.x, from: state.from, to: state.to, p: state.places }
      : state.mode === "signed" ? { mode: "signed", v: state.v, b: state.bits, e: state.ext }
        : { mode: "add", a: state.a, bb: state.bb, w: state.w, op: state.op === "-" ? "sub" : "add" });
    msg.replaceChildren();
    try {
      if (state.mode === "convert") {
        const r = convert(state.x, state.from, state.to, { places: state.places });
        const t = traced(r.steps, CONVERT_CODE, (s) => convertStage(r, s));
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `(${r.input})${sub(r.from)} to base ${r.to}`), t.el,
          h("div", { class: "stats-row" }, stat("Answer", `${r.result}${r.exact ? "" : "…"}`, true), stat("Decimal value", `${r.value}${r.frac ? ` + ${r.fraction[0]}/${r.fraction[1]}` : ""}`, true), stat("Exact?", r.exact ? "yes" : "no, it goes on")),
          grouping(r)));
      } else if (state.mode === "signed") {
        const r = signedSteps(state.v, state.bits, state.ext);
        const t = traced(r.steps, SIGNED_CODE, (s) => signedStage(r, s, state.bits));
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.v} in ${state.bits} bits`), t.el),
          r.twos ? h("section", { class: "card" }, h("h2", null, "The same bits, read four ways"), h("p", { class: "muted small" }, `The 2's complement pattern ${r.twos} means different things depending on how you read it.`), decodeTable(r.twos)) : null,
          h("section", { class: "card" }, h("h2", null, `Ranges with ${state.bits} bits`), h("div", { class: "stats-row" },
            stat("Unsigned", `0 to ${r.ranges.unsigned[1]}`), stat("Signed magnitude", `${r.ranges.sm[0]} to ${r.ranges.sm[1]}`), stat("1's complement", `${r.ranges.ones[0]} to ${r.ranges.ones[1]}`), stat("2's complement", `${r.ranges.twos[0]} to ${r.ranges.twos[1]}`)),
          h("p", { class: "muted small" }, "Signed magnitude and 1's complement each have two zeros (+0 and −0), so they hold one value fewer than 2's complement.")));
      } else {
        const r = addTwos(state.a, state.bb, state.w, state.op);
        const t = traced(r.steps, ADD_CODE, (s) => addStage(r, s), { interval: 900 });
        players.push(t.player);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.a} ${state.op === "-" ? "−" : "+"} ${state.bb} in ${state.w}-bit 2's complement`), t.el,
          h("div", { class: "stats-row" }, stat("Result bits", r.result, true), stat("Reads as", r.value), stat("True answer", r.truth), stat("Overflow", r.overflow ? "yes" : "no"))));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, modeBar, inputs, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), msg),
    out);

  // --- Practice ---------------------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["convert", "convert", "twos", "decode", "overflow"][Math.floor(r() * 5)];
    let prompt, truth, explain, mode = "text";
    if (kind === "convert") {
      const pairs = [[10, 2], [2, 10], [10, 16], [16, 2], [8, 16], [10, 8], [2, 8], [16, 10]];
      const [f, t] = pairs[Math.floor(r() * pairs.length)];
      const withFrac = r() < 0.35 && (f === 10 || f === 2);
      let x = randomDigits(r, f, 2 + Math.floor(r() * 2));
      if (withFrac) x += f === 10 ? `.${["5", "25", "75", "125", "375", "625"][Math.floor(r() * 6)]}` : `.${randomDigits(r, 2, 2)}`;
      const c = convert(x, f, t, { places: 8 });
      prompt = [h("h2", null, "Convert"), h("p", null, "Write ", h("b", { class: "mono" }, `(${x})${sub(f)}`), ` in base ${t}.`)];
      truth = c.result; explain = () => h("ol", { class: "notes" }, c.steps.map((s) => h("li", null, s.note)));
    } else if (kind === "twos") {
      const bits = [4, 6, 8][Math.floor(r() * 3)];
      const v = -(1 + Math.floor(r() * (2 ** (bits - 1))));
      const c = represent(v, bits);
      prompt = [h("h2", null, "2's complement"), h("p", null, `Write ${v} in ${bits}-bit 2's complement.`)];
      truth = c.twos; explain = () => h("p", null, c.work[2].text);
    } else if (kind === "decode") {
      const bits = [4, 6, 8][Math.floor(r() * 3)];
      const pat = "1" + Array.from({ length: bits - 1 }, () => (r() < 0.5 ? "1" : "0")).join("");
      const scheme = ["sm", "ones", "twos"][Math.floor(r() * 3)];
      prompt = [h("h2", null, "Read the bits"), h("p", null, "What decimal value does ", h("b", { class: "mono" }, pat), ` stand for in ${SCHEMES[scheme]}?`)];
      truth = String(decode(pat, scheme)); explain = () => decodeTable(pat);
    } else {
      const bits = [4, 6, 8][Math.floor(r() * 3)], [lo, hi] = ranges(bits).twos;
      const a = lo + Math.floor(r() * (hi - lo + 1)), b = lo + Math.floor(r() * (hi - lo + 1));
      const c = addTwos(a, b, bits);
      prompt = [h("h2", null, "Overflow?"), h("p", null, `In ${bits}-bit 2's complement, does ${a} + ${b < 0 ? `(${b})` : b} overflow?`)];
      truth = c.overflow ? "yes" : "no"; mode = "yesno"; explain = () => h("ol", { class: "notes" }, c.steps.map((s) => h("li", null, s.note)));
    }
    const feedback = h("div");
    const input = h("input", { type: "text", class: "mono", "aria-label": "Your answer" });
    const mark = (given) => {
      const ok = given.replace(/\s/g, "").toUpperCase().replace(/^\+/, "") === truth.toUpperCase();
      input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
      feedback.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right!" : `✗ The answer is ${truth}.`), explain());
    };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      ...prompt,
      mode === "yesno"
        ? h("div", { class: "row" }, ["yes", "no"].map((v) => h("button", { type: "button", class: "btn ghost", onclick: () => mark(v) }, v === "yes" ? "Yes, it overflows" : "No overflow")))
        : h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => mark(input.value) }, "Check")),
      feedback));
  }

  drawInputs();
  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
