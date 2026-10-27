import { analyse, breakers, GAME_CODE, LANGUAGES, maxI, play, pump, splits } from "../engines/pumping.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { choice, mountTabs } from "./kit.js";

const show = (w) => (w === "" ? "ε" : w);
const sup = (n) => String(n).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);

// The string as coloured blocks: x, then y (once, repeated, or crossed out), then z.
function blocks(split, i = null) {
  const seg = (cls, label, text, extra = {}) => h("div", { class: `pump-seg ${cls}`, ...extra },
    h("div", { class: "pump-chars" }, text ? [...text].map((c) => h("span", null, c)) : h("span", { class: "pump-none" }, "ε")),
    h("small", null, label));
  const parts = [seg("pump-x", "x", split.x)];
  if (i == null || i === 1) parts.push(seg("pump-y", "y", split.y));
  else if (i === 0) parts.push(seg("pump-y pump-gone", "y removed", split.y));
  else for (let k = 0; k < i; k++) parts.push(seg(`pump-y${k ? " pump-copy" : ""}`, "y", split.y, { style: `--n:${Math.min(k, 12)}` }));
  parts.push(seg("pump-z", "z", split.z));
  return h("div", { class: "pump-str", role: "img", "aria-label": `x = ${show(split.x)}, y = ${split.y}${i != null ? ` repeated ${i} times` : ""}, z = ${show(split.z)}` }, parts);
}

// Extra languages for the "is it regular?" practice question.
const MORE = [
  { set: "{ w ∈ {a, b}* | w ends in ab }", regular: true, why: "A 3-state DFA remembers the last two symbols." },
  { set: "{ binary numbers divisible by 3 }", regular: true, why: "A 3-state DFA tracks the remainder mod 3." },
  { set: "{ aⁿbⁿcⁿ | n ≥ 0 }", regular: false, why: "Pump s = aᵖbᵖcᵖ: y is all a's. (It isn't even context-free.)" },
  { set: "{ a^(2ⁿ) | n ≥ 0 }", regular: false, why: "Lengths double each time, but pumping adds a fixed |y|, landing between two powers of 2." },
  { set: "{ aⁿbᵐ | n, m ≤ 100 }", regular: true, why: "It's finite, and every finite language is regular." },
  { set: "{ w | w has as many 01s as 10s }", regular: true, why: "Surprisingly regular: the counts differ by at most one, and they're equal exactly when w starts and ends with the same symbol." },
  { set: "{ ww | w ∈ {a, b}* }", regular: false, why: "Pump s = aᵖbaᵖb: y is in the first block of a's, so the halves stop matching." },
];

export function render(root) {
  const p0 = readParams();
  const key0 = LANGUAGES[p0.get("lang")] ? p0.get("lang") : "anbn";
  const state = { lang: key0, p: Number(p0.get("p")) || LANGUAGES[key0].p || 4, s: p0.get("s") ?? null, i: p0.has("i") ? Number(p0.get("i")) : null };
  const head = page({
    subject: "Theory of computation", title: "Pumping lemma",
    lede: "Prove a language isn't regular by beating an adversary: you choose the string, it chooses how to split it, you choose how many times to pump.",
    theory: h("div", null,
      h("p", null, h("b", null, "The pumping lemma:"), " if L is regular, there's a number p (the pumping length) such that every s ∈ L with |s| ≥ p can be written s = xyz where |xy| ≤ p, |y| ≥ 1, and xyⁱz ∈ L for every i ≥ 0."),
      h("p", null, "Why: a DFA with p states reading p symbols must visit some state twice, so the symbols read between the two visits (y) form a loop that can be taken any number of times, or skipped."),
      h("p", null, "To show L is ", h("b", null, "not"), " regular, argue by contradiction. The quantifiers make it a game: the adversary picks p; you pick s ∈ L with |s| ≥ p; the adversary picks ANY legal split; you pick i so that xyⁱz ∉ L. You need a strategy that wins against every split, which is why a good choice of s (one where |xy| ≤ p pins y down) matters most."),
      h("p", null, "The lemma only goes one way: some non-regular languages can be pumped too, so surviving the game doesn't prove a language is regular. For regular languages, though, you can never win.")),
    conventions: [
      "The computer plays the adversary fairly but cleverly: it picks the legal split that the fewest values of i break.",
      "For regular languages the adversary's p is the number of states of a DFA for the language; otherwise it's any number (it changes when you ask).",
      "i = 0 removes y; i = 2 doubles it. The table of every split checks i from 0 up to |s| + 2.",
    ],
  });

  const langSel = h("select", { "aria-label": "Language", onchange: (e) => { state.lang = e.target.value; state.p = LANGUAGES[state.lang].p ?? 4; state.s = null; state.i = null; update(); } },
    Object.entries(LANGUAGES).map(([k, l]) => h("option", { value: k, selected: k === state.lang }, l.name)));
  const sIn = h("input", { type: "text", class: "mono wide", "aria-label": "Your string s", placeholder: "type a string in the language" });
  const iIn = h("input", { type: "number", min: 0, max: 40, value: 2, "aria-label": "Your i" });
  const out = h("div", { class: "output" });

  const choose = (s) => { state.s = s; state.i = null; update(); };
  const pickI = (i) => { state.i = Math.max(0, Math.min(40, Math.floor(i))); update(); };

  function update() {
    const lang = LANGUAGES[state.lang];
    writeParams({ lang: state.lang, p: state.p, ...(state.s != null ? { s: state.s } : {}), ...(state.i != null ? { i: state.i } : {}) });
    langSel.value = state.lang;
    const game = play(lang, state.p, state.s, state.i);
    const last = game.steps.at(-1);
    const code = codePanel(GAME_CODE), vars = varsPanel();
    code.show(last.line);
    vars.show(last.vars);
    if (state.s != null) sIn.value = state.s;

    const moves = h("ol", { class: "notes reveal" }, game.steps.slice(0, -1).map((s) => h("li", null, s.note)));
    const note = h("p", { class: `step-note${last.good ? " good" : last.bad ? " bad" : ""}`, "aria-live": "polite" }, last.note);
    const board = [moves, note];

    // Your move: s.
    const sugg = lang.suggest(state.p);
    board.push(h("div", { class: "pump-panel" },
      h("h3", { class: "small muted" }, `Your move: pick s ∈ ${lang.set} with |s| ≥ ${state.p}`),
      h("div", { class: "row" }, sIn, h("button", { type: "button", class: "btn primary", onclick: () => choose(sIn.value.replace(/\s+/g, "")) }, "Play this s")),
      h("div", { class: "row" }, h("span", { class: "small muted" }, "Or try:"), sugg.map((s) => h("button", { type: "button", class: `btn ghost small mono${s === state.s ? " right" : ""}`, onclick: () => { sIn.value = s; choose(s); } }, s.length > 20 ? `${s.slice(0, 8)}… (${s.length})` : s)))));

    let every = null;
    if (game.split) {
      const sp = game.split;
      board.push(h("div", { class: "pump-panel" }, h("h3", { class: "small muted" }, "The adversary's split"), blocks(sp)));
      board.push(h("div", { class: "pump-panel" },
        h("h3", { class: "small muted" }, "Your move: pick i"),
        h("div", { class: "row" }, [0, 1, 2, 3, 4, 5].map((i) => h("button", { type: "button", class: `btn ghost small${state.i === i ? (game.inL ? " wrong" : " right") : ""}`, onclick: () => pickI(i) }, `i = ${i}`)),
          iIn, h("button", { type: "button", class: "btn ghost small", onclick: () => pickI(Number(iIn.value) || 0) }, "Pump"))));
      if (state.i != null) board.push(h("div", { class: "pump-panel" }, h("h3", { class: "small muted" }, `xy${state.i === 1 ? "" : sup(state.i)}z (length ${game.pumped.length})`), blocks(sp, state.i),
        notice(game.inL ? "bad" : "good", game.inL ? `Still in ${lang.set}: the adversary survives.` : `Not in ${lang.set}: contradiction!`)));
      const an = analyse(lang, state.s, state.p);
      every = h("section", { class: "card" }, h("h2", null, "Every split the adversary could make"),
        h("p", { class: "muted small" }, `A proof needs every row to break. ${an.winning ? `They all do, so s = ${state.s.length > 24 ? `${state.s.slice(0, 20)}…` : state.s} proves ${lang.name} is not regular.` : "At least one split survives every i, so this s can't prove anything."}`),
        h("div", { class: "table-wrap" }, h("table", { class: "parse" },
          h("thead", null, h("tr", null, ["x", "y", "z", `i that break it (0 … ${maxI(state.s)})`].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, an.all.slice(0, 40).map((r) => h("tr", { class: r.x === sp.x && r.y === sp.y ? "hot" : null },
            h("td", null, show(r.x)), h("td", null, r.y), h("td", { class: "pump-z-cell" }, show(r.z)),
            h("td", { class: r.breakers.length ? "added" : "conflict" }, r.breakers.length ? r.breakers.slice(0, 8).join(", ") + (r.breakers.length > 8 ? ", …" : "") : "none: it survives")))))),
        an.all.length > 40 ? h("p", { class: "muted small" }, `Showing 40 of ${an.all.length} splits.`) : null);
    }

    const hint = h("p", { class: "muted small", hidden: true }, `${lang.hint} ${lang.why}`);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `The game for ${lang.set}`),
        traceLayout(h("div", null, board), code, vars),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn ghost small", onclick: (e) => { hint.hidden = !hint.hidden; e.currentTarget.textContent = hint.hidden ? "Show a hint" : "Hide the hint"; } }, "Show a hint"),
          h("button", { type: "button", class: "btn ghost small", onclick: () => { state.s = null; state.i = null; sIn.value = ""; update(); } }, "Start again")),
        hint),
      every);
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, langSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { const l = LANGUAGES[state.lang], r = rng(); state.p = (l.p ?? 2) + Math.floor(r() * 4); if (state.s != null && state.s.length < state.p) state.s = null; state.i = null; update(); } }, "Adversary: pick a new p"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("p", { class: "muted small" }, "Some of these languages are regular. Can you tell which before you play?")),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    const top = h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question"));
    let body;
    if (kind < 0.35) {
      const all = [...Object.values(LANGUAGES).map((l) => ({ set: l.set, regular: l.regular, why: l.regular ? l.why : `${l.why} ${l.hint}` })), ...MORE];
      const L = all[Math.floor(r() * all.length)];
      body = [h("h2", null, "Is this language regular?"), h("p", { class: "grammar-box" }, L.set),
        choice([{ label: "Regular", correct: L.regular }, { label: "Not regular", correct: !L.regular }], L.why)];
    } else if (kind < 0.7) {
      const nonReg = Object.values(LANGUAGES).filter((l) => !l.regular), lang = nonReg[Math.floor(r() * nonReg.length)];
      const p = 2 + Math.floor(r() * 3), s = lang.suggest(p)[0], all = splits(s, p), sp = all[Math.floor(r() * all.length)];
      const i = [0, 2, 3][Math.floor(r() * 3)], w = pump(sp, i), out = !lang.member(w);
      body = [h("h2", null, `In ${lang.set} with p = ${p}, does i = ${i} pump this split out of the language?`), blocks(sp),
        choice([{ label: "Yes, xyⁱz ∉ L", correct: out }, { label: "No, it stays in L", correct: !out }], `xy${sup(i)}z = ${show(w)}, which is ${out ? "not " : ""}in the language. The i's that break this split: ${breakers(lang, sp).join(", ") || "none"}.`)];
    } else {
      const traps = Object.values(LANGUAGES).filter((l) => !l.regular && l.suggest(4).some((s) => !analyse(l, s, 4).winning));
      const lang = traps[Math.floor(r() * traps.length)], p = 4;
      const opts = lang.suggest(p).map((s) => ({ s, win: analyse(lang, s, p).winning }));
      const good = opts.find((o) => o.win), bad = opts.filter((o) => !o.win);
      body = [h("h2", null, `To show ${lang.set} isn't regular with p = ${p}, which string wins against every split?`),
        choice([good, ...bad].map((o) => ({ label: o.s, correct: o === good })).sort(() => r() - 0.5), `${good.s} works. ${lang.hint}`)];
    }
    practice.replaceChildren(h("section", { class: "card" }, top, ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => {};
}
