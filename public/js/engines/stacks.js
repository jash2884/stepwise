// Stacks, queues and their classic applications. Every item keeps a stable id
// so the view can slide it from the input into the stack, out to the output,
// or round a circular array. Steps carry the pseudocode line and variables.

export const MODES = {
  stack: {
    name: "Stack (array)", kind: "ops",
    code: [
      "push(x):",
      "  if top = cap − 1 then error “overflow”",
      "  top ← top + 1",
      "  S[top] ← x",
      "pop():",
      "  if top = −1 then error “underflow”",
      "  x ← S[top]",
      "  top ← top − 1  // the slot is free again",
      "  return x",
      "peek():",
      "  return S[top]  // look without removing",
    ],
  },
  queue: {
    name: "Queue (circular array)", kind: "ops",
    code: [
      "enqueue(x):",
      "  if count = cap then error “queue full”",
      "  rear ← (rear + 1) mod cap  // wraps past the end to 0",
      "  Q[rear] ← x; count ← count + 1",
      "dequeue():",
      "  if count = 0 then error “queue empty”",
      "  x ← Q[front]",
      "  front ← (front + 1) mod cap",
      "  count ← count − 1; return x",
      "peek():",
      "  return Q[front]",
    ],
  },
  deque: {
    name: "Deque (circular array)", kind: "ops",
    code: [
      "pushFront(x):",
      "  if count = cap then error “full”",
      "  front ← (front − 1 + cap) mod cap; D[front] ← x",
      "  count ← count + 1",
      "pushBack(x):",
      "  if count = cap then error “full”",
      "  D[(front + count) mod cap] ← x; count ← count + 1",
      "popFront():",
      "  if count = 0 then error “empty”",
      "  x ← D[front]; front ← (front + 1) mod cap",
      "  count ← count − 1; return x",
      "popBack():",
      "  if count = 0 then error “empty”",
      "  x ← D[(front + count − 1) mod cap]; count ← count − 1",
      "  return x",
    ],
  },
  parens: {
    name: "Balanced brackets", kind: "expr",
    code: [
      "for each character c in s",
      "  if c is ( [ or { then push(c)",
      "  else if c is ) ] or } then",
      "    if the stack is empty then return false  // nothing to close",
      "    if pop() doesn't match c then return false",
      "return the stack is empty  // leftovers were never closed",
    ],
  },
  infix: {
    name: "Infix → postfix (shunting-yard)", kind: "expr",
    code: [
      "for each token t, left to right",
      "  if t is an operand then output t",
      "  else if t = “(” then push t",
      "  else if t = “)” then",
      "    while top ≠ “(”: output pop()",
      "    pop()  // discard the “(”",
      "  else  // t is an operator",
      "    while top has higher precedence than t, or equal and t is left-associative",
      "      output pop()",
      "    push t",
      "while the stack isn't empty: output pop()",
    ],
  },
  postfix: {
    name: "Postfix evaluation", kind: "expr",
    code: [
      "for each token t, left to right",
      "  if t is a number then push t",
      "  else  // t is an operator",
      "    b ← pop(); a ← pop()  // the top is the RIGHT operand",
      "    push(a t b)",
      "return pop()  // exactly one value must be left",
    ],
  },
};

export const COMPLEXITY = [
  { id: "stack", cells: ["Stack push / pop / peek", "O(1)", "O(1)", "O(n)"] },
  { id: "queue", cells: ["Queue enqueue / dequeue", "O(1)", "O(1)", "O(n)"] },
  { id: "deque", cells: ["Deque, either end", "O(1)", "O(1)", "O(n)"] },
  { id: "parens", cells: ["Bracket matching", "O(n)", "O(n)", "O(n) stack"] },
  { id: "infix", cells: ["Infix → postfix", "O(n)", "O(n)", "O(n) stack"] },
  { id: "postfix", cells: ["Postfix evaluation", "O(n)", "O(n)", "O(n) stack"] },
];

const OPS = {
  stack: { push: "push", pop: "pop", peek: "peek", top: "peek" },
  queue: { enqueue: "enqueue", enq: "enqueue", push: "enqueue", dequeue: "dequeue", deq: "dequeue", pop: "dequeue", peek: "peek", front: "peek" },
  deque: { pushfront: "pushFront", addfirst: "pushFront", pushback: "pushBack", addlast: "pushBack", push: "pushBack", popfront: "popFront", removefirst: "popFront", popback: "popBack", removelast: "popBack", pop: "popBack" },
};

export function parseOps(mode, text) {
  const ops = String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [w, arg, more] = s.split(/[\s()]+/).filter(Boolean);
    const op = OPS[mode][w?.toLowerCase()];
    if (!op) throw new Error(`“${s}”: use ${[...new Set(Object.values(OPS[mode]))].join(", ")}.`);
    const takes = ["push", "enqueue", "pushFront", "pushBack"].includes(op);
    if (takes && (arg == null || !/^-?\d{1,4}$/.test(arg))) throw new Error(`“${s}”: ${op} needs a whole number, like “${op} 7”.`);
    if (!takes && arg != null || more != null) throw new Error(`“${s}”: ${op} takes no value.`);
    return { op, x: takes ? Number(arg) : null, text: takes ? `${op} ${arg}` : op };
  });
  if (!ops.length) throw new Error("Enter some operations, separated by commas.");
  if (ops.length > 30) throw new Error("Use at most 30 operations.");
  return ops;
}

// --- Array-backed stack, circular queue and deque ---------------------------------
export function runOps(mode, opsText, cap = 5) {
  if (!["stack", "queue", "deque"].includes(mode)) throw new Error(`Unknown mode ${mode}.`);
  if (!Number.isInteger(cap) || cap < 2 || cap > 10) throw new Error("Capacity must be from 2 to 10.");
  const ops = parseOps(mode, opsText);
  const S = Array(cap).fill(null), steps = [], popped = [];
  let top = -1, front = 0, rear = -1, count = 0, nextId = 0, hand = null, opIndex = -1;
  const ptrs = () => (mode === "stack" ? { top } : { front, rear: mode === "deque" ? (count ? (front + count - 1) % cap : null) : rear });
  const base = () => (mode === "stack" ? { cap, top } : mode === "queue" ? { cap, front, rear, count } : { cap, front, count });
  const snap = (line, note, extra = {}) => steps.push({
    slots: S.map((x) => (x ? { ...x } : null)), hand: hand ? { ...hand } : null, opIndex, popped: [...popped], count: mode === "stack" ? top + 1 : count,
    ptrs: ptrs(), line, note, ...extra, vars: { ...base(), ...extra.vars },
  });
  snap(null, `An empty ${MODES[mode].name.toLowerCase()} with room for ${cap} items.${mode === "queue" ? " front = 0 and rear = −1, so the first enqueue lands in slot 0." : ""}`);
  const fail = (line, msg, x) => { snap(line, msg, { error: true, vars: x != null ? { x } : {} }); hand = null; };
  const take = (i, line, note, x) => { hand = { ...S[i], out: true, at: i }; S[i] = null; popped.push(hand.v); snap(line, note, { vars: { x } }); };
  for (const [k, o] of ops.entries()) {
    opIndex = k; hand = null;
    const isIn = o.x != null;
    if (isIn) hand = { id: nextId++, v: o.x, in: true };
    const L = (s, q, d) => (mode === "stack" ? s : mode === "queue" ? q : d);
    if (o.op === "peek") {
      const at = mode === "stack" ? top : front, none = mode === "stack" ? top === -1 : count === 0;
      snap(11, none ? `peek on an empty ${mode}: there is nothing to look at (an error in most libraries).` : `peek returns ${S[at].v} and leaves it where it is.`, { error: none, hot: none ? [] : [at] });
      continue;
    }
    if (isIn) {
      const full = mode === "stack" ? top === cap - 1 : count === cap;
      snap(L(1, 1, o.op === "pushFront" ? 1 : 5), `${o.text}: a new item ${o.x} arrives.`, { vars: { x: o.x } });
      if (full) { fail(L(2, 2, o.op === "pushFront" ? 2 : 6), `${mode === "stack" ? "Stack overflow" : `The ${mode} is full`}: all ${cap} slots are used, so ${o.x} is rejected.`, o.x); continue; }
      if (mode === "stack") {
        top++;
        snap(3, `top ← ${top}: the next free slot.`, { vars: { x: o.x } });
        S[top] = { id: hand.id, v: o.x }; hand = null;
        snap(4, `S[${top}] ← ${o.x}. It sits on top, so it will be the first to leave (last in, first out).`, { vars: { x: o.x }, hot: [top] });
      } else if (mode === "queue") {
        const old = rear;
        rear = (rear + 1) % cap;
        snap(3, `rear ← (${old} + 1) mod ${cap} = ${rear}${old === cap - 1 ? ": it wraps round from the last slot back to slot 0, reusing space freed by dequeues" : ""}.`, { vars: { x: o.x } });
        S[rear] = { id: hand.id, v: o.x }; hand = null; count++;
        snap(4, `Q[${rear}] ← ${o.x}; count ← ${count}. It joins the back of the line.`, { vars: { x: o.x }, hot: [rear] });
      } else if (o.op === "pushFront") {
        const old = front;
        front = (front - 1 + cap) % cap;
        S[front] = { id: hand.id, v: o.x }; hand = null;
        snap(3, `front ← (${old} − 1 + ${cap}) mod ${cap} = ${front}${old === 0 ? ": stepping back from slot 0 wraps to the last slot" : ""}; D[${front}] ← ${o.x}.`, { vars: { x: o.x }, hot: [front] });
        count++;
        snap(4, `count ← ${count}. ${o.x} is now at the front.`, { vars: { x: o.x }, hot: [front] });
      } else {
        const at = (front + count) % cap;
        S[at] = { id: hand.id, v: o.x }; hand = null; count++;
        snap(7, `The slot after the back is (${front} + ${count - 1}) mod ${cap} = ${at}: D[${at}] ← ${o.x}; count ← ${count}.`, { vars: { x: o.x }, hot: [at] });
      }
      continue;
    }
    // Removals.
    const empty = mode === "stack" ? top === -1 : count === 0;
    snap(L(5, 5, o.op === "popFront" ? 8 : 12), `${o.text}: remove the ${mode === "stack" ? "top" : o.op === "popBack" ? "back" : "front"} item.`);
    if (empty) { fail(L(6, 6, o.op === "popFront" ? 9 : 13), `${mode === "stack" ? "Stack underflow" : `The ${mode} is empty`}: there is nothing to remove.`); continue; }
    if (mode === "stack") {
      const x = S[top].v;
      take(top, 7, `x ← S[${top}] = ${x}: the most recently pushed item leaves first.`, x);
      top--;
      snap(8, `top ← ${top}.`, { vars: { x } });
      snap(9, `pop returns ${x}.`, { vars: { x } });
    } else if (mode === "queue") {
      const x = S[front].v;
      take(front, 7, `x ← Q[${front}] = ${x}: the oldest item leaves first (first in, first out).`, x);
      const old = front;
      front = (front + 1) % cap;
      snap(8, `front ← (${old} + 1) mod ${cap} = ${front}${old === cap - 1 ? ", wrapping round to slot 0" : ""}. Nothing else moves: that's why a circular queue is O(1).`, { vars: { x } });
      count--;
      snap(9, `count ← ${count}; dequeue returns ${x}.`, { vars: { x } });
    } else if (o.op === "popFront") {
      const x = S[front].v, old = front;
      take(front, 10, `x ← D[${front}] = ${x}.`, x);
      front = (front + 1) % cap;
      snap(10, `front ← (${old} + 1) mod ${cap} = ${front}.`, { vars: { x } });
      count--;
      snap(11, `count ← ${count}; popFront returns ${x}.`, { vars: { x } });
    } else {
      const at = (front + count - 1) % cap, x = S[at].v;
      take(at, 14, `The back is at (${front} + ${count} − 1) mod ${cap} = ${at}: x ← ${x}; count ← ${count - 1}.`, x);
      count--;
      snap(15, `popBack returns ${x}.`, { vars: { x } });
    }
  }
  opIndex = -1; hand = null;
  const left = S.filter(Boolean).length;
  snap(null, `Done. ${left ? `${left} item${left > 1 ? "s" : ""} left` : "Empty"}${popped.length ? `; removed in order: ${popped.join(", ")}` : ""}.`, { done: true });
  return { steps, ops, popped, final: order(mode, S, top, front, count) };
}

// Items in logical order: bottom → top for a stack, front → back otherwise.
function order(mode, S, top, front, count) {
  if (mode === "stack") return S.slice(0, top + 1).map((x) => x.v);
  return Array.from({ length: count }, (_, k) => S[(front + k) % S.length].v);
}

// --- Expressions ------------------------------------------------------------------
const PREC = { "+": 1, "-": 1, "−": 1, "*": 2, "×": 2, "/": 2, "÷": 2, "%": 2, "^": 3 };
const RIGHT = new Set(["^"]);
const OPEN = { "(": ")", "[": "]", "{": "}" }, CLOSE = { ")": "(", "]": "[", "}": "{" };

export function tokenize(text, { numbersOnly = false } = {}) {
  const out = [];
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^%()×÷−])/y;
  const s = String(text).trim();
  let m, at = 0;
  re.lastIndex = 0;
  while (at < s.length && (m = re.exec(s))) { out.push(m[1]); at = re.lastIndex; }
  if (s.slice(at).trim()) throw new Error(`Can't read “${s.slice(at).trim()[0]}”. Use letters, numbers, + − * / % ^ and brackets.`);
  if (numbersOnly && out.some((t) => /^[A-Za-z_]/.test(t))) throw new Error("Postfix evaluation needs numbers, not variables.");
  if (out.length > 40) throw new Error("Use at most 40 tokens.");
  return out;
}
const isOperand = (t) => /^[\dA-Za-z_]/.test(t);

function checkInfix(tokens) {
  if (!tokens.length) throw new Error("Type an expression such as a + b * c.");
  let wantOperand = true, depth = 0;
  for (const t of tokens) {
    if (wantOperand) {
      if (isOperand(t)) wantOperand = false;
      else if (t === "(") depth++;
      else throw new Error(t === ")" ? "A “)” comes where an operand should be." : `“${t}” needs an operand before it (unary minus isn't supported: write 0 − x).`);
    } else if (t === ")") { if (--depth < 0) throw new Error("There's a “)” with no matching “(”."); }
    else if (PREC[t]) wantOperand = true;
    else throw new Error(`Expected an operator before “${t}”.`);
  }
  if (wantOperand) throw new Error("The expression ends with an operator.");
  if (depth) throw new Error("A “(” is never closed.");
}

function exprRecorder(tokens) {
  const r = {
    toks: tokens.map((text, id) => ({ id: `t${id}`, text })), at: 0, stack: [], output: [], apply: [], gone: new Set(), steps: [],
    snap(line, note, extra = {}) {
      r.steps.push({
        input: r.toks.map((t, i) => ({ ...t, state: i < r.at ? "done" : i === r.at ? "now" : "todo" })).filter((t) => !r.moved(t.id)),
        stack: r.stack.map((x) => ({ ...x })), output: r.output.map((x) => ({ ...x })), apply: r.apply.map((x) => ({ ...x })),
        line, note, ...extra,
      });
    },
    moved: (id) => r.gone.has(id) || r.stack.some((x) => x.id === id) || r.output.some((x) => x.id === id) || r.apply.some((x) => x.id === id),
  };
  return r;
}

export function runExpr(mode, text) {
  if (mode === "parens") return parens(text);
  if (mode === "infix") return infix(text);
  if (mode === "postfix") return postfix(text);
  throw new Error(`Unknown mode ${mode}.`);
}

function parens(text) {
  const s = String(text);
  if (!s.trim()) throw new Error("Type some brackets, such as {[()()]}.");
  if (s.length > 40) throw new Error("Use at most 40 characters.");
  const r = exprRecorder([...s].filter((c) => c.trim()));
  const st = () => r.stack.map((x) => x.text).join("") || "empty";
  r.snap(null, "Scan left to right. Every opening bracket waits on the stack until its partner arrives; the most recent opener must close first.", { vars: { stack: "empty" } });
  for (r.at = 0; r.at < r.toks.length; r.at++) {
    const t = r.toks[r.at], c = t.text;
    if (OPEN[c]) {
      r.stack.push(t);
      r.snap(2, `“${c}” opens a bracket: push it.`, { hot: [t.id], vars: { c, stack: st() } });
    } else if (CLOSE[c]) {
      r.snap(3, `“${c}” closes a bracket: it must match the most recent unclosed opener.`, { hot: [t.id], vars: { c, stack: st() } });
      if (!r.stack.length) {
        r.snap(4, `The stack is empty, so “${c}” has nothing to close: not balanced.`, { hot: [t.id], bad: [t.id], done: true, result: false, vars: { c, stack: "empty", result: false } });
        return { steps: r.steps, balanced: false };
      }
      const top = r.stack.pop();
      r.apply = [top, t];
      const ok = top.text === CLOSE[c];
      r.snap(5, ok ? `pop() gives “${top.text}”, which matches “${c}”. The pair is done.` : `pop() gives “${top.text}”, but “${c}” needs “${CLOSE[c]}”: mismatched, so not balanced.`, { hot: [top.id, t.id], ...(ok ? { good: [top.id, t.id] } : { bad: [top.id, t.id], done: true, result: false }), vars: { c, popped: top.text, stack: st(), ...(ok ? {} : { result: false }) } });
      if (!ok) return { steps: r.steps, balanced: false };
      r.gone.add(top.id).add(t.id); r.apply = [];
    } else {
      r.gone.add(t.id);
      r.snap(1, `“${c}” isn't a bracket: skip it.`, { vars: { c, stack: st() } });
    }
  }
  const ok = r.stack.length === 0;
  r.snap(6, ok ? "End of the string and the stack is empty: every bracket was closed in the right order. Balanced." : `End of the string, but ${r.stack.map((x) => `“${x.text}”`).join(", ")} ${r.stack.length > 1 ? "were" : "was"} never closed: not balanced.`, { done: true, result: ok, ...(ok ? {} : { bad: r.stack.map((x) => x.id) }), vars: { stack: st(), result: ok } });
  return { steps: r.steps, balanced: ok };
}

function infix(text) {
  const tokens = tokenize(text);
  checkInfix(tokens);
  const r = exprRecorder(tokens);
  const vars = (t) => ({ t, stack: r.stack.map((x) => x.text).join(" ") || "empty", output: r.output.map((x) => x.text).join(" ") || "–" });
  const prec = (t) => PREC[t] ?? 0;
  r.snap(null, "Read the tokens left to right. Operands go straight to the output; operators wait on the stack until something with lower precedence (or a “)”) pushes them out.", { vars: vars(null) });
  for (r.at = 0; r.at < r.toks.length; r.at++) {
    const t = r.toks[r.at], c = t.text;
    if (isOperand(c)) {
      r.output.push(t);
      r.snap(2, `“${c}” is an operand: straight to the output. Operands keep their left-to-right order in postfix.`, { hot: [t.id], vars: vars(c) });
    } else if (c === "(") {
      r.stack.push(t);
      r.snap(3, "“(” is pushed. It acts as a floor: nothing below it is popped until the matching “)”.", { hot: [t.id], vars: vars(c) });
    } else if (c === ")") {
      r.snap(4, "“)”: pop operators to the output until the matching “(”.", { hot: [t.id], vars: vars(c) });
      while (r.stack.at(-1).text !== "(") {
        const x = r.stack.pop(); r.output.push(x);
        r.snap(5, `Pop “${x.text}” to the output.`, { hot: [x.id, t.id], vars: vars(c) });
      }
      const o = r.stack.pop();
      r.apply = [o, t];
      r.snap(6, "Pop the “(” and throw both brackets away: postfix needs no brackets.", { hot: [o.id, t.id], good: [o.id, t.id], vars: vars(c) });
      r.apply = []; r.gone.add(o.id).add(t.id);
    } else {
      r.snap(7, `“${c}” is an operator (precedence ${prec(c)}${RIGHT.has(c) ? ", right-associative" : ""}).`, { hot: [t.id], vars: vars(c) });
      for (;;) {
        const top = r.stack.at(-1);
        if (!top || top.text === "(") break;
        const p = prec(top.text), q = prec(c);
        const pops = p > q || (p === q && !RIGHT.has(c));
        r.snap(8, pops ? `The top “${top.text}” binds ${p > q ? "more tightly than" : `as tightly as “${c}” and “${c}” is left-associative, so it goes before`} “${c}”: it must be applied first.` : `The top “${top.text}” binds ${p < q ? "less tightly" : `as tightly, but “${c}” is right-associative`}: leave it.`, { hot: [top.id, t.id], vars: vars(c) });
        if (!pops) break;
        r.stack.pop(); r.output.push(top);
        r.snap(9, `Pop “${top.text}” to the output.`, { hot: [top.id], vars: vars(c) });
      }
      r.stack.push(t);
      r.snap(10, `Push “${c}”.`, { hot: [t.id], vars: vars(c) });
    }
  }
  r.at = r.toks.length;
  while (r.stack.length) {
    const x = r.stack.pop(); r.output.push(x);
    r.snap(11, `End of input: pop “${x.text}” to the output.`, { hot: [x.id], vars: vars(null) });
  }
  const postfix = r.output.map((x) => x.text).join(" ");
  r.snap(null, `Postfix: ${postfix}. Every operator now comes right after its two operands, so a machine can evaluate it with one stack and no precedence rules.`, { done: true, result: postfix, vars: { output: postfix } });
  return { steps: r.steps, postfix };
}

const APPLY = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "−": (a, b) => a - b, "*": (a, b) => a * b, "×": (a, b) => a * b,
  "/": (a, b) => a / b, "÷": (a, b) => a / b, "%": (a, b) => a % b, "^": (a, b) => a ** b,
};
const show = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));

function postfix(text) {
  const tokens = tokenize(text, { numbersOnly: true });
  if (!tokens.length) throw new Error("Type a postfix expression such as 2 3 1 * + 9 −.");
  if (tokens.some((t) => t === "(" || t === ")")) throw new Error("Postfix needs no brackets.");
  const r = exprRecorder(tokens);
  const vars = (t, extra = {}) => ({ t, stack: r.stack.map((x) => x.text).join(" ") || "empty", ...extra });
  let made = 0;
  r.snap(null, "Read left to right. Numbers wait on the stack; each operator takes the top two, combines them and pushes the result back.", { vars: vars(null) });
  for (r.at = 0; r.at < r.toks.length; r.at++) {
    const t = r.toks[r.at], c = t.text;
    if (isOperand(c)) {
      r.stack.push({ ...t, v: Number(c) });
      r.snap(2, `${c} is a number: push it.`, { hot: [t.id], vars: vars(c) });
      continue;
    }
    if (r.stack.length < 2) throw new Error(`“${c}” (token ${r.at + 1}) needs two operands but the stack has ${r.stack.length}. Is this really postfix?`);
    const b = r.stack.pop(), a = r.stack.pop();
    r.apply = [{ ...a, role: "a" }, { ...t, role: "op" }, { ...b, role: "b" }];
    r.snap(4, `“${c}”: pop b = ${b.text} (the top), then a = ${a.text}. Order matters: this is ${a.text} ${c} ${b.text}, not ${b.text} ${c} ${a.text}.`, { hot: [a.id, b.id, t.id], vars: vars(c, { a: a.v, b: b.v }) });
    if ((c === "/" || c === "÷" || c === "%") && b.v === 0) throw new Error(`Division by zero at token ${r.at + 1}.`);
    const v = APPLY[c](a.v, b.v);
    if (!Number.isFinite(v) || Math.abs(v) > 1e12) throw new Error("The numbers get too large to show.");
    const res = { id: `r${made++}`, text: show(v), v };
    r.apply = [...r.apply, { ...res, role: "res" }];
    r.snap(5, `${a.text} ${c} ${b.text} = ${res.text}.`, { hot: [res.id], vars: vars(c, { a: a.v, b: b.v, result: v }) });
    r.apply = []; r.gone.add(a.id).add(b.id).add(t.id);
    r.stack.push(res);
    r.snap(5, `Push ${res.text}.`, { hot: [res.id], vars: vars(c, { a: a.v, b: b.v }) });
  }
  if (r.stack.length !== 1) throw new Error(`${r.stack.length} values are left on the stack (${r.stack.map((x) => x.text).join(", ")}): there aren't enough operators.`);
  const value = r.stack[0].v;
  r.snap(6, `One value is left: the answer is ${show(value)}.`, { done: true, result: value, good: [r.stack[0].id], vars: vars(null, { result: value }) });
  return { steps: r.steps, value };
}

// Plain reference implementations for tests and practice answers.
export function toPostfix(text) { return infix(text).postfix; }
export function evalPostfix(text) { return postfix(text).value; }
export function isBalanced(text) {
  const st = [];
  for (const c of String(text)) {
    if (OPEN[c]) st.push(c);
    else if (CLOSE[c] && st.pop() !== CLOSE[c]) return false;
  }
  return st.length === 0;
}
