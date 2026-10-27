import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCEPT, CODE, delta, EXAMPLES, lex, showToken } from "../public/js/engines/lexer.js";

// Aho, Lam, Sethi & Ullman (the Dragon Book), §3.4 (Examples 3.8–3.12): the
// statement "if x <= 10 then …" becomes keyword, id, relop and number tokens,
// with the relop attribute naming which operator it was (Fig. 3.12).
test("Dragon Book §3.4: if x <= 10 then y = y + 1.5e3", () => {
  const r = lex(EXAMPLES.dragon.src);
  assert.deepEqual(r.tokens.map(showToken), ["⟨if⟩", "⟨id, 1⟩", "⟨relop, LE⟩", "⟨number, 10⟩", "⟨then⟩", "⟨id, 2⟩", "⟨assign⟩", "⟨id, 2⟩", "⟨arith, +⟩", "⟨number, 1.5e3⟩"]);
  assert.deepEqual(r.symbols.map((s) => s.name), ["x", "y"]);
  assert.equal(r.symbols[1].uses, 2);
  assert.equal(r.errors.length, 0);
});

// Dragon Book Fig. 3.13: the transition diagram for relop.
test("relational operators get the right attributes", () => {
  const r = lex(EXAMPLES.relop.src);
  assert.deepEqual(r.tokens.filter((t) => t.cls === "relop").map((t) => t.attr), ["LT", "LE", "NE", "GT", "GE", "EQ", "NE"]);
});

test("maximal munch rolls back to the last accepting state", () => {
  assert.deepEqual(lex("<=>").tokens.map((t) => t.lexeme), ["<=", ">"]);
  const r = lex("12.5e+ 3.x");
  assert.deepEqual(r.all.filter((t) => !t.skip).map((t) => t.lexeme), ["12.5", "e", "+", "3", ".", "x"]);
  assert.ok(r.steps.some((s) => s.rollback === 2)); // read "e+" past 12.5
  assert.equal(r.errors[0].lexeme, ".");
  assert.deepEqual(lex("x // note\ny").tokens.map((t) => t.lexeme), ["x", "y"]);
  assert.deepEqual(lex("if2 then").tokens.map((t) => t.cls), ["id", "keyword"]);
});

test("every step names a pseudocode line and carries variables", () => {
  for (const ex of Object.values(EXAMPLES)) for (const s of lex(ex.src).steps) {
    for (const l of [s.line].flat()) assert.ok(l >= 1 && l <= CODE.length);
    assert.equal(typeof s.vars, "object");
    assert.ok(s.note.length > 10);
  }
});

// An independent oracle for "is this string exactly one token?"
const TOKEN = /^(?:[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|<=|<>|<|>=|>|==|=|!=|[-+*]|\/\/[^\n]*|\/|[(){};,]|[ \t\n]+)$/;

let seed = 4242;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

test("fuzz: lexemes rebuild the source and every token is maximal", () => {
  const pieces = ["a", "x1", "_t", "if", "e", "E", "0", "12", "3", ".", "+", "-", "*", "/", "<", ">", "=", "!", "(", ")", ";", " ", "\n", "@", "e5", "1e", "//c"];
  for (let k = 0; k < 400; k++) {
    const src = Array.from({ length: 1 + Math.floor(rand() * 14) }, () => pick(pieces)).join("");
    const r = lex(src);
    // All lexemes (tokens, skipped whitespace and comments, errors) rebuild the source…
    assert.equal(r.all.map((t) => t.lexeme).join(""), src, JSON.stringify(src));
    // …and the token stream alone is the source minus whitespace, comments and errors.
    assert.equal(r.tokens.map((t) => t.lexeme).join(""), r.all.filter((t) => !t.skip && t.cls !== "error").map((t) => t.lexeme).join(""));
    for (const t of r.all) {
      if (t.cls === "error") {
        for (let L = 1; t.pos + L <= src.length; L++) assert.ok(!TOKEN.test(src.slice(t.pos, t.pos + L)), `error ${JSON.stringify(src)} @${t.pos}`);
        continue;
      }
      assert.ok(TOKEN.test(t.lexeme), `${JSON.stringify(t.lexeme)} is a token`);
      for (let L = t.lexeme.length + 1; t.pos + L <= src.length; L++) assert.ok(!TOKEN.test(src.slice(t.pos, t.pos + L)), `${JSON.stringify(src)}: "${t.lexeme}" isn't maximal`);
    }
  }
});

test("the DFA accepts exactly the token language on every short string", () => {
  const alpha = ["a", "1", ".", "e", "+", "<", "=", ">", "!", "/", " ", "(", "\n"];
  const walk = (s) => { let q = "start"; for (const c of s) { q = delta(q, c); if (!q) return false; } return !!ACCEPT[q]; };
  let layer = [""];
  for (let len = 1; len <= 4; len++) {
    layer = layer.flatMap((p) => alpha.map((c) => p + c));
    for (const s of layer) assert.equal(walk(s), TOKEN.test(s), JSON.stringify(s));
  }
});
