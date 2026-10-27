import { ACCEPT, CODE, EDGES, EXAMPLES, KEYWORDS, lex, showToken, STATES } from "../engines/lexer.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const CLASSES = { keyword: 1, id: 2, number: 3, relop: 4, arith: 5, assign: 6, punct: 7, error: 8 };
const shown = (c) => (c === " " ? "␣" : c === "\t" ? "⇥" : c);

// The source, one cell per character: consumed, the lexeme being scanned, and
// on a rollback the characters that will be read again.
function sourceStrip(src, st) {
  const kids = [];
  [...src].forEach((c, k) => {
    const cls = ["lex-ch",
      k < st.pos && "done",
      k >= st.pos && k < st.i && (st.error ? "err" : st.emit ? "emit" : "scan"),
      st.rollback && k >= st.i && k < st.i + st.rollback && "back",
      !st.done && k === st.i && !st.emit && !st.error && "next",
      (c === " " || c === "\t" || c === "\n") && "space"].filter(Boolean).join(" ");
    kids.push(h("span", { class: cls, title: `position ${k}` }, c === "\n" ? "↵" : shown(c)));
    if (c === "\n") kids.push(h("i", { class: "lex-br" }));
  });
  if (!st.done) kids.push(h("span", { class: `lex-ch eof${st.i >= src.length && !st.emit ? " next" : ""}` }, "EOF"));
  return h("div", { class: "lex-src", "aria-label": "Source characters" }, kids);
}

const chip = (t, fresh) => h("span", { class: `lex-tok${fresh ? " lex-new" : ""}`, style: `--c:var(--series-${CLASSES[t.cls] ?? 1})`, title: `${t.cls} "${t.lexeme}" at ${t.line}:${t.col}` },
  h("b", null, showToken(t)), h("small", null, t.lexeme));

function symbolTable(symbols, upTo, freshName) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse lex-sym" },
    h("thead", null, h("tr", null, ["Entry", "Name", "Token", "First seen"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, upTo ? symbols.slice(0, upTo).map((s, k) => h("tr", { class: s.name === freshName ? "lex-new hot" : null },
      h("td", null, k + 1), h("td", { class: "left" }, s.name), h("td", null, "id"), h("td", null, `line ${s.line}, col ${s.col}`)))
      : h("tr", null, h("td", { colspan: 4, class: "muted" }, "Empty: no identifiers yet.")))));
}

export function render(root) {
  const p = readParams();
  const state = { src: p.get("src") ?? EXAMPLES.dragon.src };
  let player = null;
  const head = page({
    subject: "Compiler design", title: "Lexical analysis",
    lede: "Watch a lexer turn characters into tokens: a DFA reads as far as it can, rolls back to the last accepting state, and fills the symbol table.",
    theory: h("div", null,
      h("p", null, "The ", h("b", null, "lexical analyser"), " (scanner) is the compiler's first phase. It groups characters into ", h("b", null, "lexemes"), " and hands the parser a ", h("b", null, "token"), " for each: a class name plus an optional attribute, such as ⟨id, 3⟩ (entry 3 of the symbol table) or ⟨relop, LE⟩. Whitespace and comments are thrown away."),
      h("p", null, "Each token class is a regular expression, and all of them together become one DFA. The rule is ", h("b", null, "maximal munch"), ": always take the longest lexeme that forms a token. So the scanner keeps reading while the DFA has a move, remembers the last accepting state it passed, and when it gets stuck it ", h("b", null, "rolls back"), " to that point. On \"<=>\" it reads <, <=, then gets stuck on >, so the token is <= and > starts the next one."),
      h("p", null, "Keywords such as if and while match the identifier pattern too. Rather than give each its own states, the lexer looks every identifier up in a keyword table first (the Dragon Book installs them in the symbol table up front). A character that can't start any token is a lexical error: report it and skip it.")),
    conventions: [
      `Keywords: ${KEYWORDS.join(", ")}. Identifiers: a letter or _ then letters, digits or _.`,
      "Numbers: digits, an optional fraction .digits and an optional exponent e[+|−]digits, e.g. 1.5e3.",
      "relop is one of < <= <> > >= == != (attributes LT LE NE GT GE EQ); = is assignment. // starts a comment to the end of the line.",
      "Positions count from 0; lines and columns from 1. ␣ is a space and ↵ a newline.",
    ],
  });

  const srcIn = h("textarea", { rows: 5, class: "mono", "aria-label": "Source code", oninput: (e) => { state.src = e.target.value; update(); } }, state.src);
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ src: state.src });
    let res;
    try {
      if (!state.src.trim()) throw new Error("Type some source code, e.g. if x <= 10 then y = y + 1.");
      res = lex(state.src);
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren(res.errors.length ? notice("info", `${res.errors.length} lexical error${res.errors.length > 1 ? "s" : ""}: ${res.errors.map((x) => `"${x.lexeme}" at ${x.line}:${x.col}`).join(", ")}. Each is reported and skipped.`) : "");
    const code = codePanel(CODE), vars = varsPanel({ title: "Scanner state" });
    const srcBox = h("div"), dfaBox = h("div", { class: "chart-wrap" }), streamBox = h("div", { class: "lex-stream", "aria-live": "off" }), symBox = h("div");
    const note = h("p", { class: "step-note", "aria-live": "polite" });
    const counters = h("div", { class: "stats-row" });
    const accept = Object.keys(ACCEPT);
    player = stepper({
      count: res.steps.length, label: "Step", interval: 550,
      render: (i) => {
        const st = res.steps[i];
        srcBox.replaceChildren(sourceStrip(res.src, st));
        const classes = {};
        if (st.stuck) classes[st.state] = st.last ? "dim-src" : "bad";
        if (st.rollback != null && st.last) classes[st.last.state] = "good";
        if (st.emit) classes[st.state] = "good";
        if (st.error) classes.start = "bad";
        morph(dfaBox, stateDiagram({ states: STATES.map((id) => ({ id })), edges: EDGES, start: "start", accept, active: st.done ? [] : [st.state], lit: st.from ? [{ from: st.from, to: st.state }] : [], classes, tokens: true, aria: `Lexer DFA, in state ${st.state}` }));
        const toks = res.all.filter((t) => !t.skip).filter((t) => t.pos < (st.emit || st.error ? st.pos + 1 : st.pos));
        const freshTok = st.emit && !st.emit.skip ? st.emit : st.error ?? null;
        streamBox.replaceChildren(...(toks.length ? toks.map((t) => chip(t, t === freshTok)) : [h("span", { class: "muted small" }, "No tokens yet.")]));
        symBox.replaceChildren(symbolTable(res.symbols, st.symbols, st.emit?.fresh ? st.emit.lexeme : null));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : st.error ? " bad" : st.rollback ? " warn" : ""}`;
        counters.replaceChildren(stat("Characters read", Math.min(st.i, res.src.length)), stat("Tokens", st.tokens), stat("Identifiers", st.symbols), stat("Errors", res.errors.filter((x) => x.pos < st.i).length));
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Scan"), player.el, note,
        traceLayout(h("div", null,
          h("h3", { class: "small muted" }, "Source (the lexeme being scanned is highlighted)"), srcBox,
          h("h3", { class: "small muted lex-gap" }, "Lexer DFA"), dfaBox,
          h("p", { class: "muted small" }, "Double circles are accepting. Orange dashes: stuck here, so roll back to the green state, the last accepting one."),
          h("h3", { class: "small muted lex-gap" }, "Token stream (what the parser sees)"), streamBox), code, vars, h("div", null, h("div", { class: "panel-title" }, "Symbol table"), symBox)),
        counters),
      h("section", { class: "card" }, h("h2", null, "All tokens"),
        h("div", { class: "table-wrap" }, h("table", { class: "parse" },
          h("thead", null, h("tr", null, ["#", "Lexeme", "Token", "Line:col"].map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", null, res.all.filter((t) => !t.skip).map((t, k) => h("tr", { class: t.cls === "error" ? "lex-err" : null },
            h("td", null, k + 1), h("td", { class: "left" }, t.lexeme), h("td", { class: "left" }, showToken(t)), h("td", null, `${t.line}:${t.col}`)))))),
        h("p", { class: "muted small" }, `${res.all.filter((t) => t.skip).length} whitespace and comment lexemes were dropped. Keyword table: ${KEYWORDS.join(", ")}.`)));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.src = ex.src; srcIn.value = ex.src; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Source code (up to 500 characters)", srcIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), any = (xs) => xs[Math.floor(r() * xs.length)];
    const kind = r();
    let body;
    if (kind < 0.35) {
      const parts = [];
      for (let k = 0, n = 4 + Math.floor(r() * 5); k < n; k++) parts.push(any(["x", "count", "if", "while", "12", "3.14", "<=", "<", "==", "=", "+", "*", "(", ")", ";", "y2", "2e5"]));
      const src = parts.join(any([" ", " ", ""])).replace(/\s+/g, " ");
      const res = lex(src);
      body = [h("h2", null, "How many tokens does the lexer produce?"), h("p", { class: "grammar-box" }, src),
        h("p", { class: "muted" }, "Whitespace isn't a token. Remember maximal munch when operators touch."),
        numberQuestion(res.tokens.length, `The tokens are ${res.tokens.map((t) => `"${t.lexeme}"`).join(", ")}.`)];
    } else if (kind < 0.65) {
      const lexeme = any(["while", "while2", "_tmp", "42", "4.2e1", "<>", ">=", "=", "==", "*", ";", "return", "then", "x9"]);
      const t = lex(lexeme).tokens[0];
      const names = { keyword: "Keyword", id: "Identifier", number: "Number", relop: "Relational operator", arith: "Arithmetic operator", assign: "Assignment", punct: "Punctuation" };
      body = [h("h2", null, "Which token class does this lexeme belong to?"), h("p", { class: "big-answer" }, h("b", null, lexeme)),
        choice(Object.entries(names).map(([k, v]) => ({ label: v, correct: k === t.cls })).sort(() => r() - 0.5), `"${lexeme}" becomes ${showToken(t)}.${t.cls === "keyword" ? " It matches the identifier pattern, but the keyword table claims it first." : ""}`)];
    } else {
      const src = any(["<=>", "x<>=y", "a==b=c", "12.x", "1.5e+x", "a<=b>=c", "x=-y", "if2then", "3e5.5"]);
      const res = lex(src), right = res.all.filter((t) => !t.skip).map((t) => t.lexeme).join(" | ");
      const opts = new Set([right]);
      for (let k = 0; k < 40 && opts.size < 4; k++) {
        const chars = [...src], cut = [];
        chars.forEach((c, j) => { cut.push(c); if (j < chars.length - 1 && r() < 0.4) cut.push(" | "); });
        opts.add(cut.join(""));
      }
      body = [h("h2", null, "How does maximal munch split this input?"), h("p", { class: "big-answer" }, h("b", null, src)),
        h("p", { class: "muted" }, "| separates lexemes. A character that can't start a token is still split off (as an error)."),
        choice([...opts].map((o) => ({ label: o, correct: o === right })).sort(() => r() - 0.5), `Longest match each time: ${res.all.filter((t) => !t.skip).map((t) => `"${t.lexeme}" (${t.cls})`).join(", ")}.`)];
      for (const b of body[3].querySelectorAll("button")) b.classList.add("mono");
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
