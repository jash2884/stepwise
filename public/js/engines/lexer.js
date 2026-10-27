// A lexical analyser driven by one hand-built DFA, using maximal munch: from
// each position, keep reading while the DFA has a move, remember the last
// accepting state seen, and when it gets stuck roll back to that point. The
// lexeme is classified (keyword, identifier, number, operator…) and
// identifiers are installed in the symbol table.

export const KEYWORDS = ["if", "then", "else", "while", "do", "for", "return", "int", "float", "void", "break"];

const isLetter = (c) => /^[A-Za-z_]$/.test(c);
const isDigit = (c) => /^[0-9]$/.test(c);
const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
const PUNCT = "(){};,";

// The DFA. Accepting states map to the token class they recognise.
export const STATES = ["start", "id", "int", "dot", "frac", "e", "sign", "exp", "<", "<=", "<>", ">", ">=", "=", "==", "!", "!=", "op", "/", "//", "punct", "ws"];
export const ACCEPT = {
  id: "id", int: "number", frac: "number", exp: "number",
  "<": "relop", "<=": "relop", "<>": "relop", ">": "relop", ">=": "relop", "==": "relop", "!=": "relop",
  "=": "assign", op: "arith", "/": "arith", "//": "comment", punct: "punct", ws: "whitespace",
};
const RELOP = { "<": "LT", "<=": "LE", "<>": "NE", ">": "GT", ">=": "GE", "==": "EQ", "!=": "NE" };

export function delta(q, c) {
  if (c == null) return null;
  switch (q) {
    case "start":
      if (isLetter(c)) return "id";
      if (isDigit(c)) return "int";
      if (c === "<" || c === ">" || c === "=" || c === "!") return c;
      if (c === "+" || c === "-" || c === "*") return "op";
      if (c === "/") return "/";
      if (PUNCT.includes(c)) return "punct";
      if (isSpace(c)) return "ws";
      return null;
    case "id": return isLetter(c) || isDigit(c) ? "id" : null;
    case "int": return isDigit(c) ? "int" : c === "." ? "dot" : c === "e" || c === "E" ? "e" : null;
    case "dot": return isDigit(c) ? "frac" : null;
    case "frac": return isDigit(c) ? "frac" : c === "e" || c === "E" ? "e" : null;
    case "e": return isDigit(c) ? "exp" : c === "+" || c === "-" ? "sign" : null;
    case "sign": case "exp": return isDigit(c) ? "exp" : null;
    case "<": return c === "=" ? "<=" : c === ">" ? "<>" : null;
    case ">": return c === "=" ? ">=" : null;
    case "=": return c === "=" ? "==" : null;
    case "!": return c === "=" ? "!=" : null;
    case "/": return c === "/" ? "//" : null;
    case "//": return c === "\n" ? null : "//";
    case "ws": return isSpace(c) ? "ws" : null;
    default: return null;
  }
}

// Edges for drawing the DFA, with character classes as labels.
export const EDGES = [
  ["start", "id", "letter"], ["id", "id", "letter"], ["id", "id", "digit"],
  ["start", "int", "digit"], ["int", "int", "digit"], ["int", "dot", "."], ["dot", "frac", "digit"], ["frac", "frac", "digit"],
  ["int", "e", "e"], ["frac", "e", "e"], ["e", "sign", "+ −"], ["e", "exp", "digit"], ["sign", "exp", "digit"], ["exp", "exp", "digit"],
  ["start", "<", "<"], ["<", "<=", "="], ["<", "<>", ">"], ["start", ">", ">"], [">", ">=", "="],
  ["start", "=", "="], ["=", "==", "="], ["start", "!", "!"], ["!", "!=", "="],
  ["start", "op", "+ − *"], ["start", "/", "/"], ["/", "//", "/"], ["//", "//", "not ↵"],
  ["start", "punct", "( ) { } ; ,"], ["start", "ws", "space"], ["ws", "ws", "space"],
].map(([from, to, label]) => ({ from, to, label }));

export const CODE = [
  "while pos < n",
  "  state ← start; lastAccept ← none; i ← pos",
  "  while i < n and δ(state, src[i]) is defined",
  "    state ← δ(state, src[i]); i ← i + 1",
  "    if state is accepting then lastAccept ← (state, i)",
  "  if lastAccept = none then report an error; pos ← pos + 1; continue",
  "  lexeme ← src[pos .. lastAccept.i)  // roll back to the last accept",
  "  if lexeme is whitespace or a comment then skip it",
  "  else if lexeme is in the keyword table then emit ⟨lexeme⟩",
  "  else if it's an identifier then install it in the symbol table; emit ⟨id, entry⟩",
  "  else emit ⟨class, attribute⟩",
  "  pos ← lastAccept.i",
];

const shown = (c) => (c === "\n" ? "↵" : c === " " ? "␣" : c === "\t" ? "⇥" : c);
const showLex = (s) => [...s].map(shown).join("");

export function lex(src, { limit = 2500 } = {}) {
  src = String(src).replace(/\r\n?/g, "\n");
  if (src.length > 500) throw new Error("Use at most 500 characters of source.");
  const n = src.length, tokens = [], symbols = [], errors = [], all = [], steps = [];
  let pos = 0;
  const lineCol = (p) => { const before = src.slice(0, p).split("\n"); return { line: before.length, col: before.at(-1).length + 1 }; };
  const push = (s) => {
    steps.push({ tokens: tokens.length, symbols: symbols.length, ...s });
    if (steps.length > limit) throw new Error("That source is too long to animate.");
  };
  while (pos < n) {
    let state = "start", i = pos, last = null;
    push({ pos, i, state, last: null, line: [1, 2], vars: { pos, i, state, lastAccept: null, lexeme: "" }, note: `Start a new token at position ${pos} (${lineCol(pos).line}:${lineCol(pos).col}), in the start state, with no accepting state seen yet.` });
    for (;;) {
      const c = src[i], to = i < n ? delta(state, c) : null;
      if (!to) {
        const why = i >= n ? "the input ends" : `there's no move from ${state} on "${shown(c)}"`;
        push({ pos, i, state, last, stuck: true, line: 3, vars: { pos, i, state, char: i < n ? shown(c) : "EOF", lastAccept: last ? `${last.state} @ ${last.i}` : null, lexeme: showLex(src.slice(pos, i)) }, note: `Stop reading: ${why}.` });
        break;
      }
      const from = state;
      state = to; i++;
      const acc = ACCEPT[state];
      if (acc) last = { state, i };
      push({ pos, i, state, from, ch: c, last, line: acc ? [4, 5] : [3, 4], vars: { pos, i, state, char: shown(c), lastAccept: last ? `${last.state} @ ${last.i}` : null, lexeme: showLex(src.slice(pos, i)) },
        note: `Read "${shown(c)}": ${from} → ${state}.${acc ? ` ${state} is accepting (a complete ${acc === "whitespace" ? "run of whitespace" : acc}), so remember it: lastAccept = (${state}, ${i}).` : ` ${state} isn't accepting, so "${showLex(src.slice(pos, i))}" isn't a token by itself yet. Keep going in case it becomes one.`}` });
    }
    if (!last) {
      const { line, col } = lineCol(pos);
      const err = { lexeme: src[pos], pos, line, col, cls: "error" };
      errors.push(err); all.push(err);
      push({ pos, i: pos + 1, state, last: null, error: err, line: 6, vars: { pos, i, state, lastAccept: null, lexeme: shown(src[pos]) }, note: `No prefix starting at "${shown(src[pos])}" is a token, so report a lexical error at ${line}:${col} and skip that one character.` });
      pos++;
      continue;
    }
    const lexeme = src.slice(pos, last.i), back = i - last.i, cls = ACCEPT[last.state];
    const { line, col } = lineCol(pos);
    const rollNote = back ? `Roll back ${back} character${back > 1 ? "s" : ""} to the last accepting state (${last.state} at ${last.i}): "${showLex(src.slice(last.i, i))}" will be read again as part of the next token. ` : "";
    push({ pos, i: last.i, state: last.state, last, rollback: back, line: 7, vars: { pos, i: last.i, state: last.state, lastAccept: `${last.state} @ ${last.i}`, lexeme: showLex(lexeme) }, note: `${rollNote}The longest token here is "${showLex(lexeme)}" (maximal munch).` });
    let tok, ln, note;
    if (cls === "whitespace" || cls === "comment") {
      tok = { cls, lexeme, pos, line, col, skip: true };
      ln = 8; note = `"${showLex(lexeme)}" is ${cls === "comment" ? "a comment" : "whitespace"}: the parser never sees it, so drop it.`;
    } else if (cls === "id" && KEYWORDS.includes(lexeme)) {
      tok = { cls: "keyword", lexeme, pos, line, col, attr: null };
      ln = 9; note = `"${lexeme}" matches the identifier pattern, but it's in the keyword table, so emit the keyword token ⟨${lexeme}⟩.`;
    } else if (cls === "id") {
      let entry = symbols.findIndex((s) => s.name === lexeme);
      const fresh = entry === -1;
      if (fresh) { symbols.push({ name: lexeme, line, col, uses: 1 }); entry = symbols.length - 1; } else symbols[entry].uses++;
      tok = { cls: "id", lexeme, pos, line, col, attr: entry + 1, fresh };
      ln = 10; note = fresh ? `"${lexeme}" is a new identifier: install it as symbol-table entry ${entry + 1} and emit ⟨id, ${entry + 1}⟩.` : `"${lexeme}" is already entry ${entry + 1} in the symbol table, so emit ⟨id, ${entry + 1}⟩ pointing at it.`;
    } else {
      const attr = cls === "relop" ? RELOP[last.state] : cls === "number" ? lexeme : cls === "arith" ? lexeme : null;
      tok = { cls, lexeme, pos, line, col, attr };
      ln = 11; note = `Emit ⟨${cls}${attr != null ? `, ${attr}` : ""}⟩ for "${lexeme}".`;
    }
    all.push(tok);
    if (!tok.skip) tokens.push(tok);
    push({ pos, i: last.i, state: last.state, last, emit: tok, line: ln, vars: { pos, i: last.i, token: showToken(tok), lexeme: showLex(lexeme) }, note });
    pos = last.i;
  }
  push({ pos: n, i: n, state: "start", done: true, line: 1, vars: { pos: n, tokens: tokens.length, symbols: symbols.length, errors: errors.length }, note: `pos = n: the whole input is read. ${tokens.length} token${tokens.length === 1 ? "" : "s"}, ${symbols.length} identifier${symbols.length === 1 ? "" : "s"} in the symbol table${errors.length ? `, ${errors.length} lexical error${errors.length > 1 ? "s" : ""}` : ""}.` });
  return { tokens, symbols, errors, all, steps, src };
}

export const showToken = (t) => (t.cls === "keyword" ? `⟨${t.lexeme}⟩` : t.cls === "error" ? `error "${t.lexeme}"` : t.skip ? t.cls : t.cls === "punct" ? `⟨${t.lexeme}⟩` : `⟨${t.cls}${t.attr != null ? `, ${t.attr}` : ""}⟩`);

export const EXAMPLES = {
  dragon: { name: "if x <= 10 then y = y + 1.5e3", src: "if x <= 10 then y = y + 1.5e3" },
  relop: { name: "Relational operators (Dragon Book Fig. 3.13)", src: "a<b a<=b a<>b a>b a>=b a==b a!=b" },
  c: { name: "A C-like snippet", src: "int count = 0;\nwhile (count < 10) {\n  // add up\n  total = total + count * 2.5;\n  count = count + 1;\n}" },
  munch: { name: "Maximal munch and rollback", src: "x<=>y 12.5e+ 3.x" },
  errors: { name: "Lexical errors", src: "price = 4 @ 2 # tax" },
};
