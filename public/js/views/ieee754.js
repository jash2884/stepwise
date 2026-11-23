import { decode, DECODE_CODE, encode, ENCODE_CODE, EXAMPLES, FORMATS, fromParams, randomValue, ranges, spec, toHex, toParams } from "../engines/ieee754.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { bitStrip, natQuestion, select, stepFrame, textQuestion } from "./coa-kit.js";

const FORMAT_NAMES = Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, v.name]));
const minus = (s) => String(s).replace(/^-/, "−");

function bits(res, lit, onBit) {
  const S = res.spec, f = res.fields;
  return bitStrip(f.s + f.e + f.f, [
    { size: 1, cls: "sign", label: "sign" },
    { size: S.e, cls: "exp", label: `exponent ${parseInt(f.e, 2)}` },
    { size: S.m, cls: "frac", label: "fraction" },
  ], { lit, onBit, small: S.bits > 32 });
}

function expansionTable(exp) {
  if (!exp || !exp.rows.length) return null;
  const rows = exp.rows.slice(0, 8);
  return h("details", { class: "coa-doubling" }, h("summary", null, "How the fraction bits come out (doubling)"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Fraction", "× 2", "Bit"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((r) => {
        const v = Number(r.before.num) / Number(r.before.den);
        return h("tr", null, h("td", { class: "mono" }, Number.isFinite(v) ? +v.toPrecision(8) : "…"), h("td", { class: "mono" }, Number.isFinite(v) ? +(2 * v).toPrecision(8) : "…"), h("td", null, h("b", null, r.bit)));
      })))),
    exp.repeatFrom != null ? h("p", { class: "muted small" }, `From bit ${exp.repeatFrom + 1} the pattern repeats forever.`) : exp.rows.length > 8 ? h("p", { class: "muted small" }, `… ${exp.rows.length - 8} more rows.`) : null);
}

export function simulation(res, mode, onBit = null) {
  const code = mode === "encode" ? ENCODE_CODE : DECODE_CODE;
  const expansion = res.steps.find((s) => s.expansion)?.expansion;
  return stepFrame(res.steps, code, (s, i) => {
    const last = i === res.steps.length - 1;
    const d = mode === "encode" ? res.decoded : res;
    return h("div", null,
      bits(res, last ? null : s.lit.length ? s.lit : ["none"], onBit),
      h("div", { class: "stats-row" },
        stat("Hex", `0x${res.hex}`, true),
        stat("Stored value", last ? minus(d.text) : "…", true),
        stat("Kind", last ? d.kind : "…")),
      s.expansion ? expansionTable(expansion) : null,
      last && mode === "encode" && !res.exact && d.kind !== "inf" ? h("p", { class: "muted small" }, `Exact stored value: ${minus(d.exact).slice(0, 80)}${d.exact.length > 80 ? "…" : ""}. Rounding error: it is the nearest ${res.spec.id} number to what you typed.`) : null,
      last && mode === "decode" && (d.kind === "normal" || d.kind === "denormal") ? h("p", { class: "muted small" }, `Exactly ${minus(d.exact).slice(0, 80)}${d.exact.length > 80 ? "…" : ""}`) : null);
  }, { label: "Step", interval: 1400 });
}

function rangeTable(current) {
  return h("section", { class: "card" }, h("h2", null, "Range and precision"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Format", "Bits (s / e / f)", "Bias", "Largest", "Smallest normal", "Smallest denormal", "Machine epsilon", "Decimal digits"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, Object.keys(FORMATS).map((f) => {
        const R = ranges(f), S = R.spec;
        const cell = (x) => h("td", null, h("div", { class: "mono small" }, x.formula), h("div", { class: "muted small" }, x.value.toPrecision(5)));
        return h("tr", { class: f === current ? "current" : null }, h("th", { scope: "row" }, S.name), h("td", null, `1 / ${S.e} / ${S.m}`), h("td", null, S.bias),
          cell(R.maxNormal), cell(R.minNormal), cell(R.minDenormal), cell(R.epsilon), h("td", null, `≈ ${R.digits}`));
      })))),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Exponent field", "Fraction", "Meaning"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null,
        h("tr", null, h("td", null, "all zeros"), h("td", null, "0"), h("td", null, "±0")),
        h("tr", null, h("td", null, "all zeros"), h("td", null, "not 0"), h("td", null, "denormal: ±0.f × 2^(1 − bias)")),
        h("tr", null, h("td", null, "1 to all ones − 1"), h("td", null, "anything"), h("td", null, "normal: ±1.f × 2^(e − bias)")),
        h("tr", null, h("td", null, "all ones"), h("td", null, "0"), h("td", null, "±∞")),
        h("tr", null, h("td", null, "all ones"), h("td", null, "not 0"), h("td", null, "NaN"))))));
}

export function render(root) {
  const init = fromParams(readParams());
  const st = { fmt: init.fmt, mode: init.x ? "decode" : "encode", v: init.v ?? "-6.25", x: init.x ?? "" };
  let sim = null;

  const head = page({
    subject: "Computer organisation",
    title: "IEEE 754 floating point",
    lede: "Turn a decimal into IEEE 754 bits and back, with every step of normalising, biasing and rounding shown.",
    theory: h("div", null,
      h("p", null, "A floating-point number is stored as a ", h("b", null, "sign"), " bit, a biased ", h("b", null, "exponent"), " and a ", h("b", null, "fraction"), ". A normal number is (−1)^s × 1.f × 2^(e − bias): the leading 1 is never stored (the hidden bit)."),
      h("ul", null,
        h("li", null, h("b", null, "Single"), ": 1 + 8 + 23 bits, bias 127. ", h("b", null, "Double"), ": 1 + 11 + 52 bits, bias 1023. ", h("b", null, "Half"), ": 1 + 5 + 10 bits, bias 15."),
        h("li", null, "To encode: write |x| in binary, move the point until one 1 is left in front (that gives E), store E + bias, and keep the bits after the point, rounding to nearest with ties to even."),
        h("li", null, "Exponent field 0 means ", h("b", null, "zero or a denormal"), ": no hidden 1, exponent fixed at 1 − bias, so numbers fade gradually towards zero. All ones means ", h("b", null, "∞ or NaN"), "."),
        h("li", null, "Most decimals (like 0.1) are repeating fractions in binary, so they can't be stored exactly. Machine epsilon, 2^−fraction bits, is the gap between 1 and the next number.")),
      h("p", null, "Click any bit in the strip to flip it and decode the result.")),
    conventions: [
      "Rounding is round to nearest, ties to even, done exactly on the decimal you type (not via a double first).",
      "Hex input needs exactly the format's width or fewer digits (leading zeros may be left out); a string of only 0s and 1s with the full bit count is read as binary.",
      "NaN is encoded as the quiet NaN with only the top fraction bit set.",
      "Overflow rounds to ±∞; numbers below half the smallest denormal round to ±0.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" }), inputs = h("div");
  const flip = (k) => {
    try {
      const S = spec(st.fmt);
      const cur = st.mode === "encode" ? encode(st.v, st.fmt).bits : decode(st.x, st.fmt).bits;
      st.x = toHex(cur ^ (1n << BigInt(S.bits - 1 - k)), S);
      st.mode = "decode";
      update();
    } catch (e) { msg.replaceChildren(notice("error", e.message)); }
  };

  function drawInputs() {
    inputs.replaceChildren(
      h("div", { class: "row" },
        select("", FORMAT_NAMES, st.fmt, (v) => { if (st.mode === "decode") { try { st.v = decode(st.x, st.fmt).text.replace("−", "-"); } catch { /* keep */ } st.mode = "encode"; } st.fmt = v; update(); }),
        select("", { encode: "Decimal → bits", decode: "Bits → decimal" }, st.mode, (v) => {
          try { if (v === "decode") st.x = encode(st.v, st.fmt).hex; else st.v = decode(st.x, st.fmt).text.replace("−", "-"); } catch { /* keep */ }
          st.mode = v; update();
        })),
      h("div", { class: "row" }, st.mode === "encode"
        ? h("label", { class: "inline", style: "flex:1;min-width:0" }, "Decimal", h("input", { type: "text", class: "wide mono", value: st.v, "aria-label": "Decimal number", onchange: (e) => { st.v = e.target.value; update(); } }))
        : h("label", { class: "inline", style: "flex:1;min-width:0" }, "Hex or bits", h("input", { type: "text", class: "wide mono", value: st.x, "aria-label": "Hex or binary bits", onchange: (e) => { st.x = e.target.value; update(); } }))),
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { st.fmt = ex.fmt; st.v = ex.v; st.mode = "encode"; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { st.v = randomValue(rng()); st.mode = "encode"; update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
  }

  function update() {
    drawInputs();
    writeParams(toParams({ fmt: st.fmt, ...(st.mode === "decode" ? { x: st.x } : { v: st.v }) }));
    sim?.player.destroy();
    try {
      const res = st.mode === "encode" ? encode(st.v, st.fmt) : decode(st.x, st.fmt);
      msg.replaceChildren();
      sim = simulation(res, st.mode, flip);
      const title = st.mode === "encode" ? `${minus(st.v)} in ${FORMATS[st.fmt].name.toLowerCase()}` : `0x${res.hex} as ${FORMATS[st.fmt].name.toLowerCase()}`;
      out.replaceChildren(h("section", { class: "card" }, h("h2", null, title), sim.el), rangeTable(st.fmt));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(rangeTable(st.fmt)); }
  }

  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, inputs, msg), out);

  // --- Practice -----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const fmt = r() < 0.75 ? "single" : "half";
    const S = spec(fmt);
    const again = h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question");
    const card = h("section", { class: "card" }, h("div", { class: "row" }, again));
    const kind = r();
    const sol = h("div");
    if (kind < 0.45) {
      const v = randomValue(r);
      const e = encode(v, fmt);
      card.append(h("h2", null, "Encode it"), h("p", null, `Write ${minus(v)} in IEEE 754 ${fmt} precision, as ${S.bits / 4} hex digits.`),
        textQuestion(e.hex, `Sign ${e.fields.s}, exponent ${e.fields.e}, fraction ${e.fields.f}.`, (s) => s.trim().toUpperCase().replace(/^0X/, "").padStart(S.bits / 4, "0")),
        h("button", { type: "button", class: "btn ghost", onclick: () => sol.replaceChildren(simulation(e, "encode").el) }, "Show the steps"), sol);
    } else if (kind < 0.8) {
      let e;
      do e = encode(`${r() < 0.5 ? "-" : ""}${(1 + Math.floor(r() * 200)) / [1, 2, 4, 8, 16, 32][Math.floor(r() * 6)]}`, fmt); while (e.kind !== "normal");
      const d = decode(e.bits, fmt);
      card.append(h("h2", null, "Decode it"), h("p", null, `What decimal value does the ${fmt}-precision pattern 0x${e.hex} hold?`),
        natQuestion(d.value, `${d.formula} = ${minus(d.text)}.`),
        h("button", { type: "button", class: "btn ghost", onclick: () => sol.replaceChildren(simulation(d, "decode").el) }, "Show the steps"), sol);
    } else {
      const v = randomValue(r);
      const e = encode(v, fmt);
      if (e.kind !== "normal") return newQuestion();
      card.append(h("h2", null, "The exponent field"), h("p", null, `${minus(v)} is stored in ${fmt} precision (bias ${S.bias}). What unsigned number is in the exponent field?`),
        natQuestion(e.E + S.bias, `Normalised, the exponent is ${e.E}; stored as ${e.E} + ${S.bias} = ${e.E + S.bias}.`, { step: 1 }));
    }
    practice.replaceChildren(card);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => sim?.player.destroy();
}
