import assert from "node:assert/strict";
import { test } from "node:test";
import { evalPostfix, isBalanced, MODES, runExpr, runOps, toPostfix } from "../public/js/engines/stacks.js";

let seed = 31337;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("textbook infix → postfix (Weiss, Data Structures and Algorithm Analysis §3.6.3; GeeksforGeeks)", () => {
  assert.equal(toPostfix("a + b * c + ( d * e + f ) * g"), "a b c * + d e * f + g * +"); // Weiss
  assert.equal(toPostfix("a + b * ( c ^ d - e ) ^ ( f + g * h ) - i"), "a b c d ^ e - f g h * + ^ * + i -"); // GfG
  assert.equal(toPostfix("a ^ b ^ c"), "a b c ^ ^"); // ^ is right-associative
  assert.equal(toPostfix("a - b - c"), "a b - c -"); // − is left-associative
  assert.throws(() => toPostfix("a + * b"));
  assert.throws(() => toPostfix("( a + b"));
});

test("textbook postfix evaluation", () => {
  assert.equal(evalPostfix("2 3 1 * + 9 -"), -4); // GfG
  assert.equal(evalPostfix("6 5 2 3 + 8 * + 3 + *"), 288); // Weiss §3.6.3
  assert.equal(evalPostfix("5 1 2 + 4 * + 3 -"), 14); // Wikipedia, Reverse Polish notation
  assert.throws(() => evalPostfix("1 +"));
  assert.throws(() => evalPostfix("1 2"));
});

test("brackets: engine agrees with repeatedly deleting adjacent pairs", () => {
  const brute = (s) => { let t = s.replace(/[^()[\]{}]/g, ""), prev; do { prev = t; t = t.replace(/\(\)|\[\]|\{\}/g, ""); } while (t !== prev); return t === ""; };
  for (let k = 0; k < 800; k++) {
    const s = Array.from({ length: Math.floor(rand() * 12) + 1 }, () => "()[]{}a"[Math.floor(rand() * 7)]).join("");
    assert.equal(runExpr("parens", s).balanced, brute(s), s);
    assert.equal(isBalanced(s), brute(s), s);
  }
});

// Evaluate infix directly with a recursive-descent parser and compare.
function direct(tokens) {
  let i = 0;
  const atom = () => { const t = tokens[i++]; if (t === "(") { const v = add(); i++; return v; } return Number(t); };
  const pow = () => { const b = atom(); if (tokens[i] === "^") { i++; return b ** pow(); } return b; };
  const mul = () => { let v = pow(); while (tokens[i] === "*" || tokens[i] === "/") v = tokens[i++] === "*" ? v * pow() : v / pow(); return v; };
  const add = () => { let v = mul(); while (tokens[i] === "+" || tokens[i] === "-") v = tokens[i++] === "+" ? v + mul() : v - mul(); return v; };
  return add();
}

test("fuzz: evaluating the postfix gives the same value as evaluating the infix directly", () => {
  for (let k = 0; k < 400; k++) {
    const gen = (d) => {
      if (d > 2 || rand() < 0.3) return [String(1 + Math.floor(rand() * 5))];
      const op = "+-*^"[Math.floor(rand() * 4)];
      const l = gen(d + 1), r = op === "^" ? [String(1 + Math.floor(rand() * 2))] : gen(d + 1);
      return rand() < 0.4 ? ["(", ...l, op, ...r, ")"] : [...l, op, ...r];
    };
    const toks = gen(0), text = toks.join(" ");
    assert.equal(evalPostfix(toPostfix(text)), direct(toks), text);
    for (const s of runExpr("infix", text).steps) if (s.line != null) assert.ok(s.line >= 1 && s.line <= MODES.infix.code.length);
  }
});

test("fuzz: array stack, circular queue and deque match a plain JS array model", () => {
  const names = { stack: ["push", "pop"], queue: ["enqueue", "dequeue"], deque: ["pushFront", "pushBack", "popFront", "popBack"] };
  for (let k = 0; k < 300; k++) {
    const cap = 2 + Math.floor(rand() * 5);
    for (const mode of ["stack", "queue", "deque"]) {
      const ops = Array.from({ length: 2 + Math.floor(rand() * 14) }, (_, i) => { const o = names[mode][Math.floor(rand() * names[mode].length)]; return o.startsWith("push") || o === "enqueue" ? `${o} ${i}` : o; });
      const model = [], out = [];
      for (const o of ops) {
        const [op, x] = o.split(" ");
        if (x != null) { if (model.length < cap) { if (op === "pushFront") model.unshift(Number(x)); else model.push(Number(x)); } }
        else if (model.length) out.push(op === "pop" || op === "popBack" ? model.pop() : model.shift());
      }
      const r = runOps(mode, ops.join(", "), cap);
      assert.deepEqual(r.final, model, `${mode} ${ops}`);
      assert.deepEqual(r.popped, out, `${mode} ${ops}`);
      for (const s of r.steps) {
        assert.ok(s.slots.filter(Boolean).length <= cap);
        if (s.line != null) assert.ok(s.line >= 1 && s.line <= MODES[mode].code.length, `${mode} line ${s.line}`);
      }
    }
  }
});
