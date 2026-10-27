import { COMPLEXITY, evalPostfix, isBalanced, MODES, runExpr, runOps, tokenize, toPostfix } from "../engines/stacks.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { glide, legend, practiceCard, shuffle, summaryTable, toolbar } from "./dsa-motion.js";

const DEFAULTS = {
  stack: "push 5, push 3, pop, push 7, push 2, peek, pop, push 9, push 4, push 6, push 8",
  queue: "enqueue 10, enqueue 20, enqueue 30, dequeue, dequeue, enqueue 40, enqueue 50, enqueue 60, enqueue 70, dequeue, enqueue 80",
  deque: "pushBack 1, pushBack 2, pushFront 3, pushFront 4, popBack, pushFront 5, popFront, pushBack 6",
  parens: "{ [ ( a + b ) * c ] - ( d ) }",
  infix: "a + b * ( c ^ d - e ) ^ ( f + g * h ) - i",
  postfix: "2 3 1 * + 9 -",
};
const EXAMPLES = {
  stack: { name: "Stack: push, pop and overflow", mode: "stack", text: DEFAULTS.stack, cap: 5 },
  queue: { name: "Circular queue that wraps round", mode: "queue", text: DEFAULTS.queue, cap: 5 },
  full: { name: "Queue full and empty errors", mode: "queue", text: "enqueue 1, enqueue 2, enqueue 3, enqueue 4, dequeue, dequeue, dequeue, dequeue, dequeue", cap: 3 },
  deque: { name: "Deque at both ends", mode: "deque", text: DEFAULTS.deque, cap: 6 },
  parens: { name: "Balanced brackets", mode: "parens", text: DEFAULTS.parens },
  crossed: { name: "Crossed brackets ( [ ) ]", mode: "parens", text: "( [ ) ]" },
  infix: { name: "Infix → postfix (GfG classic)", mode: "infix", text: DEFAULTS.infix },
  power: { name: "Right-associative ^: a ^ b ^ c", mode: "infix", text: "a ^ b ^ c * d" },
  numeric: { name: "Infix with numbers", mode: "infix", text: "( 5 + 3 ) * 2 - 8 / 4" },
  postfix: { name: "Postfix 2 3 1 * + 9 −", mode: "postfix", text: DEFAULTS.postfix },
  postfix2: { name: "Postfix 5 1 2 + 4 * + 3 −", mode: "postfix", text: "5 1 2 + 4 * + 3 -" },
};

const box = (text) => Math.max(32, [...String(text)].length * 9 + 16);

// --- Stack (vertical array) ------------------------------------------------------
function stackSvg(st, cap) {
  const SW = 92, SH = 40, X = 74, base = 26 + (cap + 1) * SH, W = 330, H = base + 40;
  const y = (i) => base - (i + 1) * SH;
  const hot = new Set(st.hot ?? []), els = [];
  for (let i = 0; i < cap; i++) els.push(h("g", { class: "sq-slot" }, h("rect", { x: X, y: y(i), width: SW, height: SH }), h("text", { x: X - 10, y: y(i) + SH / 2 + 4, "text-anchor": "end", class: "idx" }, i)));
  els.push(h("path", { class: "sq-wall", d: `M${X - 4},${y(cap - 1) - 6} V${base + 4} H${X + SW + 4} V${y(cap - 1) - 6}` }));
  st.slots.forEach((it, i) => { if (it) els.push(item(it, X + SW / 2, y(i) + SH / 2, SW - 12, hot.has(i) ? "hot" : "")); });
  const top = st.ptrs.top;
  els.push(h("g", { class: "sq-ptr", "data-k": "p:top", "data-x": 0, "data-y": y(top) + SH / 2 },
    h("path", { d: `M${X - 30},${y(top) + SH / 2} h18`, class: "sq-arrow" }), h("path", { d: `M${X - 10},${y(top) + SH / 2} l-8,-5 v10 z` }),
    h("text", { x: X - 34, y: y(top) + SH / 2 + 4, "text-anchor": "end" }, "top")));
  if (st.hand) {
    const hy = y(st.hand.out ? st.hand.at : top + 1) + SH / 2;
    els.push(item(st.hand, X + SW + 80, hy, SW - 12, st.error ? "bad" : st.hand.out ? "out" : "in"),
      h("text", { x: X + SW + 80, y: hy - 26, "text-anchor": "middle", class: "sq-tag" }, st.hand.out ? "returned" : st.error ? "rejected" : "incoming"));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "sq-svg", role: "img", "aria-label": `Stack, bottom to top: ${st.slots.filter(Boolean).map((x) => x.v).join(", ") || "empty"}`, style: `max-width:${W * 1.2}px` }, els);
}

function item(it, x, y, w, cls) {
  return h("g", { class: `sq-item ${cls}`, "data-k": `i:${it.id}`, "data-x": x, "data-y": y },
    h("rect", { x: x - w / 2, y: y - 15, width: w, height: 30, rx: 7 }),
    h("text", { x, y: y + 5, "text-anchor": "middle" }, it.v));
}

// --- Queue / deque: the array laid out flat, and the same array as a ring --------
function rowSvg(st, cap) {
  const CW = 58, X = 30, Y = 52, W = X * 2 + cap * CW + 90, H = 150;
  const cx = (i) => X + i * CW + CW / 2, hot = new Set(st.hot ?? []), els = [];
  for (let i = 0; i < cap; i++) els.push(h("g", { class: "sq-slot" }, h("rect", { x: X + i * CW, y: Y, width: CW, height: 44 }), h("text", { x: cx(i), y: Y + 60, "text-anchor": "middle", class: "idx" }, i)));
  st.slots.forEach((it, i) => { if (it) els.push(item(it, cx(i), Y + 22, CW - 12, hot.has(i) ? "hot" : "")); });
  const { front, rear } = st.ptrs, both = front === rear && st.count > 0;
  const ptr = (name, i, below) => {
    const yy = below ? Y + 70 : Y - 8, x = cx(i) + (both ? (name === "front" ? -12 : 12) : 0);
    return h("g", { class: `sq-ptr ${name}`, "data-k": `p:${name}`, "data-x": x, "data-y": 0 },
      h("path", { d: below ? `M${x},${yy} l-6,9 h12 z` : `M${x},${yy} l-6,-9 h12 z` }),
      h("text", { x, y: below ? yy + 24 : yy - 13, "text-anchor": "middle" }, name));
  };
  if (front != null) els.push(ptr("front", front, false));
  if (rear != null && rear >= 0) els.push(ptr("rear", rear, true));
  if (st.hand) els.push(item(st.hand, X + cap * CW + 50, Y + 22, CW - 12, st.error ? "bad" : st.hand.out ? "out" : "in"),
    h("text", { x: X + cap * CW + 50, y: Y - 4, "text-anchor": "middle", class: "sq-tag" }, st.hand.out ? "removed" : st.error ? "rejected" : "incoming"));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "sq-svg", role: "img", "aria-label": `Array slots: ${st.slots.map((x) => (x ? x.v : "_")).join(", ")}`, style: `max-width:${W * 1.2}px` }, els);
}

function ringSvg(st, cap) {
  const C = 110, R = 72, W = 2 * C, ang = (i) => (i * 360) / cap - 90;
  const at = (i, r) => ({ x: C + r * Math.cos((ang(i) * Math.PI) / 180), y: C + r * Math.sin((ang(i) * Math.PI) / 180) });
  const hot = new Set(st.hot ?? []), els = [h("circle", { cx: C, cy: C, r: R, class: "ring" })];
  for (let i = 0; i < cap; i++) {
    const p = at(i, R), q = at(i, R + 30);
    els.push(h("circle", { cx: p.x, cy: p.y, r: 19, class: "ring-slot" }), h("text", { x: q.x, y: q.y + 4, "text-anchor": "middle", class: "idx" }, i));
  }
  st.slots.forEach((it, i) => {
    if (!it) return;
    const p = at(i, R);
    els.push(h("g", { class: `sq-item ring-item ${hot.has(i) ? "hot" : ""}`, "data-k": `i:${it.id}`, "data-x": p.x, "data-y": p.y }, h("circle", { cx: p.x, cy: p.y, r: 16 }), h("text", { x: p.x, y: p.y + 4.5, "text-anchor": "middle" }, it.v)));
  });
  // Pointers are hands of a clock, so a wrap from the last slot to 0 is a
  // small forward turn rather than a jump.
  const hand = (name, i, len) => h("g", { class: `ring-hand ${name}`, "data-tw": `hand:${name}`, transform: `rotate(${(i * 360) / cap} ${C} ${C})` },
    h("line", { x1: C, y1: C, x2: C, y2: C - len }), h("path", { d: `M${C},${C - len - 6} l-6,9 h12 z` }));
  const { front, rear } = st.ptrs;
  if (front != null) els.push(hand("front", front, R - 30));
  if (rear != null && rear >= 0) els.push(hand("rear", rear, R - 44));
  els.push(h("circle", { cx: C, cy: C, r: 4, class: "ring-hub" }));
  return h("svg", { viewBox: `0 0 ${W} ${W}`, class: "sq-ring", role: "img", "aria-label": "The same array drawn as a ring" }, els);
}

// --- Expression modes: input row, output row, the stack and a work area ----------
function exprSvg(st, mode, all) {
  const tokens = all[0].input, gap = 6;
  const xs = new Map();
  let x = 20;
  for (const t of tokens) { xs.set(t.id, x + box(t.text) / 2); x += box(t.text) + gap; }
  const depth = Math.max(1, ...all.map((s) => s.stack.length));
  const outY = 96, stackX = 76, stackBase = (mode === "infix" ? outY + 62 : outY - 10) + depth * 34 + 14;
  const W = Math.max(x + 20, mode === "infix" ? x + 20 : 420, 340), H = stackBase + 34;
  const hot = new Set(st.hot ?? []), good = new Set(st.good ?? []), bad = new Set(st.bad ?? []);
  const cls = (t) => (bad.has(t.id) ? "bad" : good.has(t.id) ? "good" : hot.has(t.id) ? "hot" : "");
  const tok = (t, cx, cy, extra = "") => h("g", { class: `sq-item tok ${cls(t)} ${extra}`, "data-k": `k:${t.id}`, "data-x": cx, "data-y": cy },
    h("rect", { x: cx - box(t.text) / 2, y: cy - 15, width: box(t.text), height: 30, rx: 7 }), h("text", { x: cx, y: cy + 5, "text-anchor": "middle" }, t.text));
  const els = [h("text", { x: 20, y: 14, class: "sq-tag", "text-anchor": "start" }, "Input")];
  for (const t of st.input) els.push(tok(t, xs.get(t.id), 40, t.state));
  if (mode === "infix") {
    els.push(h("text", { x: 20, y: outY - 22, class: "sq-tag", "text-anchor": "start" }, "Output (postfix)"));
    let ox = 20;
    for (const t of st.output) { els.push(tok(t, ox + box(t.text) / 2, outY)); ox += box(t.text) + gap; }
  }
  const sw = 84, top = stackBase - depth * 34 - 8;
  els.push(h("path", { class: "sq-wall", d: `M${stackX - sw / 2 - 4},${top} V${stackBase} H${stackX + sw / 2 + 4} V${top}` }),
    h("text", { x: stackX, y: stackBase + 22, "text-anchor": "middle", class: "sq-tag" }, mode === "postfix" ? "Operand stack" : mode === "infix" ? "Operator stack" : "Stack"));
  st.stack.forEach((t, i) => els.push(tok(t, stackX, stackBase - 20 - i * 34)));
  if (st.apply.length) {
    const ay = stackBase - 20 - Math.max(0, st.stack.length) * 34;
    let ax = stackX + sw / 2 + 40;
    for (const t of st.apply) {
      if (t.role === "res") { els.push(h("text", { x: ax + 4, y: ay + 5, class: "sq-eq" }, "=")); ax += 22; }
      els.push(tok(t, ax + box(t.text) / 2, ay)); ax += box(t.text) + gap;
    }
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "sq-svg", role: "img", "aria-label": `Stack: ${st.stack.map((t) => t.text).join(" ") || "empty"}`, style: `max-width:${Math.max(W * 1.25, 360)}px;min-width:${Math.min(W, 520)}px` }, els);
}

export function render(root) {
  const p = readParams();
  const mode0 = MODES[p.get("mode")] ? p.get("mode") : "infix";
  const state = { mode: mode0, text: p.get("in") ?? DEFAULTS[mode0], cap: Math.min(10, Math.max(2, Number(p.get("cap")) || 5)) };
  let player = null;
  const head = page({
    subject: "Data structures & algorithms", title: "Stacks & queues",
    lede: "Push, pop, enqueue and dequeue on real arrays, a circular queue that wraps round, and the stack at work: bracket matching, infix to postfix and postfix evaluation.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "stack"), " is last in, first out (LIFO): you only touch the top, like a pile of plates. A ", h("b", null, "queue"), " is first in, first out (FIFO): add at the rear, remove from the front. A ", h("b", null, "deque"), " (double-ended queue) allows both at either end. All of these operations are O(1)."),
      h("p", null, "A queue in a plain array would drift to the right as items leave the front. A ", h("b", null, "circular array"), " treats the slots as a ring: front and rear move forward with mod cap, so freed slots at the start get reused and nothing ever shifts."),
      h("p", null, "Stacks undo nesting. ", h("b", null, "Bracket matching"), " pushes each opener and pops when a closer arrives; the most recent opener must close first. ", h("b", null, "Shunting-yard"), " (Dijkstra) turns infix into postfix: operators wait on a stack until an operator that binds less tightly, or a “)”, arrives. ", h("b", null, "Postfix evaluation"), " needs no precedence at all: push numbers, and each operator combines the top two.")),
    conventions: ["Arrays start at index 0. A stack starts with top = −1; a queue with front = 0, rear = −1 and keeps a count, so full is count = cap.", "Precedence: ^ highest (right-associative), then * / %, then + −. Operators of equal precedence are left-associative.", "In postfix a b −, a is popped second: it is the left operand. Division is real (not integer) division."],
  });

  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; state.text = DEFAULTS[state.mode]; txt.value = state.text; update(); } }, Object.entries(MODES).map(([k, m]) => h("option", { value: k, selected: k === state.mode }, m.name)));
  const txt = h("input", { type: "text", class: "mono wide", value: state.text, "aria-label": "Input", oninput: (e) => { state.text = e.target.value; update(); } });
  const capIn = h("input", { type: "number", min: 2, max: 10, value: state.cap, "aria-label": "Capacity", oninput: (e) => { const v = Number(e.target.value); if (v >= 2 && v <= 10) { state.cap = v; update(); } } });
  const capLabel = h("label", { class: "stack", style: "margin:0" }, "Capacity", capIn);
  const txtLabel = h("span");
  const msg = h("div"), out = h("div", { class: "output" });
  const set = (mode, text, cap) => { state.mode = mode; state.text = text; if (cap) state.cap = cap; modeSel.value = mode; txt.value = text; capIn.value = state.cap; update(); };

  function update() {
    player?.destroy();
    const ops = MODES[state.mode].kind === "ops";
    writeParams(ops ? { mode: state.mode, in: state.text, cap: state.cap } : { mode: state.mode, in: state.text });
    modeSel.value = state.mode;
    capLabel.hidden = !ops;
    txtLabel.textContent = ops ? "Operations, separated by commas" : state.mode === "parens" ? "Brackets (other characters are skipped)" : state.mode === "infix" ? "Infix expression" : "Postfix expression (separate numbers with spaces)";
    let res;
    try { res = ops ? runOps(state.mode, state.text, state.cap) : runExpr(state.mode, state.text); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const m = MODES[state.mode], code = codePanel(m.code), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), ring = h("div", { class: "ring-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    const chips = h("div", { class: "op-chips" }), counters = h("div", { class: "stats-row" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1000,
      render: (i) => {
        const st = res.steps[i];
        if (ops) {
          glide(stage, state.mode === "stack" ? stackSvg(st, state.cap) : rowSvg(st, state.cap));
          if (state.mode !== "stack") glide(ring, ringSvg(st, state.cap));
          const errs = new Set(res.steps.slice(0, i + 1).filter((s) => s.error).map((s) => s.opIndex));
          chips.replaceChildren(...res.ops.map((o, k) => h("span", { class: [k === st.opIndex && "now", (st.done || k < st.opIndex) && "done", errs.has(k) && "bad"].filter(Boolean).join(" ") }, o.text)));
          counters.replaceChildren(stat("Items", `${st.count} / ${state.cap}`), stat("Removed so far", st.popped.length ? st.popped.join(", ") : "–", true), stat("Operation", st.opIndex >= 0 ? `${st.opIndex + 1} of ${res.ops.length}` : "–"));
        } else {
          glide(stage, exprSvg(st, state.mode, res.steps));
          counters.replaceChildren(stat("Stack depth", st.stack.length), stat("Deepest", Math.max(...res.steps.slice(0, i + 1).map((s) => s.stack.length))),
            stat("Result", st.done ? (state.mode === "parens" ? (st.result ? "Balanced ✓" : "Not balanced ✗") : String(state.mode === "postfix" ? +st.result.toFixed(3) : st.result)) : "…", state.mode === "infix"));
        }
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.error ? " bad" : st.done ? (st.result === false ? " bad" : " good") : ""}`;
      },
    });
    const numeric = state.mode === "infix" && tokenize(state.text).every((t) => !/^[A-Za-z_]/.test(t));
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, m.name), player.el, note,
        traceLayout(h("div", null, ops ? chips : null, h("div", { class: ops && state.mode !== "stack" ? "sq-pair" : null }, stage, ops && state.mode !== "stack" ? ring : null),
          legend([["Being used now", "var(--accent)"], ["Matched / result", "var(--good)"], ["Error", "var(--bad)"], ["Incoming / removed", "var(--series-4)"]])), code, vars),
        counters,
        numeric ? h("p", { class: "muted small" }, h("button", { type: "button", class: "linkish", onclick: () => set("postfix", res.postfix) }, "Evaluate this postfix →")) : null),
      h("section", { class: "card" }, h("h2", null, "Cost"), summaryTable(["Operation", "Time per op", "Typical", "Space"], COMPLEXITY, state.mode),
        h("p", { class: "muted small" }, "Every application reads its input once and pushes and pops each symbol at most once, so it runs in O(n) time with a stack as deep as the deepest nesting.")));
  }

  const random = () => {
    const r = rng(), mode = state.mode;
    if (mode === "stack" || mode === "queue" || mode === "deque") set(mode, randomOps(r, mode, 9), state.cap);
    else if (mode === "parens") set(mode, randomBrackets(r));
    else if (mode === "infix") set(mode, randomInfix(r).join(" "));
    else set(mode, toPostfix(randomInfix(r, true).join(" ")));
  };
  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel, toolbar(EXAMPLES, (ex) => set(ex.mode, ex.text, ex.cap), random)),
      h("div", { class: "row" }, h("label", { class: "stack", style: "flex:1;margin:0" }, txtLabel, txt), capLabel),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = Math.floor(r() * 5);
    let body;
    if (kind === 0) {
      const toks = randomInfix(r), right = toPostfix(toks.join(" "));
      const opts = [...new Set([right, naive(toks), toks.filter((t) => t !== "(" && t !== ")").join(" "), right.split(" ").reverse().join(" ")])];
      body = [h("h2", null, "What is the postfix form of this expression?"), h("p", { class: "grammar-box" }, toks.join(" ")),
        choice(shuffle(opts.map((o) => ({ label: o, correct: o === right })), r), `Shunting-yard gives ${right}.`)];
    } else if (kind === 1) {
      const pf = toPostfix(randomInfix(r, true).join(" ")), v = evalPostfix(pf);
      if (!Number.isInteger(v)) return newQuestion();
      body = [h("h2", null, "Evaluate this postfix expression."), h("p", { class: "grammar-box" }, pf), numberQuestion(v, `Push numbers; each operator pops b then a and pushes a op b. The last value left is ${v}.`)];
    } else if (kind === 2) {
      const cap = 4 + Math.floor(r() * 2), text = randomOps(r, "queue", 8), res = runOps("queue", text, cap), last = res.steps.at(-1);
      const askFront = r() < 0.5;
      body = [h("h2", null, `A circular queue has ${cap} slots, starting with front = 0 and rear = −1. After these operations, what is ${askFront ? "front" : "rear"}?`), h("p", { class: "grammar-box" }, text),
        h("p", { class: "muted" }, "A full queue rejects an enqueue; an empty one rejects a dequeue."),
        numberQuestion(askFront ? last.ptrs.front : last.vars.rear, `Each enqueue does rear ← (rear + 1) mod ${cap}; each dequeue does front ← (front + 1) mod ${cap}. The queue ends as [${res.final.join(", ")}] with front = ${last.ptrs.front} and rear = ${last.vars.rear}.`)];
    } else if (kind === 3) {
      const s = randomBrackets(r), ok = isBalanced(s);
      body = [h("h2", null, "Are these brackets balanced?"), h("p", { class: "grammar-box" }, s),
        choice([{ label: "Balanced", correct: ok }, { label: "Not balanced", correct: !ok }], ok ? "Every closer matches the most recent unclosed opener, and nothing is left open." : "Run it through the stack: a closer meets the wrong opener (or none), or an opener is left over.")];
    } else {
      const text = randomOps(r, "stack", 8), res = runOps("stack", text, 6), right = res.popped.join(", ") || "nothing";
      const fifo = runOps("queue", text.replace(/push/g, "enqueue").replace(/pop/g, "dequeue"), 6).popped.join(", ") || "nothing";
      const opts = [...new Set([right, fifo, [...res.popped].reverse().join(", ") || "nothing"])];
      body = [h("h2", null, "In what order do values come out of this stack?"), h("p", { class: "grammar-box" }, text),
        choice(shuffle(opts.map((o) => ({ label: o, correct: o === right })), r), `Each pop takes the most recent push still on the stack: ${right}.`)];
    }
    practiceCard(practice, newQuestion, body);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}

function randomOps(r, mode, n) {
  const ops = [];
  let size = 0, v = 10;
  for (let k = 0; k < n; k++) {
    const add = size === 0 || r() < 0.62;
    if (mode === "deque") ops.push(add ? `${r() < 0.5 ? "pushFront" : "pushBack"} ${v++}` : r() < 0.5 ? "popFront" : "popBack");
    else ops.push(add ? `${mode === "stack" ? "push" : "enqueue"} ${(v += 1 + Math.floor(r() * 9))}` : mode === "stack" ? "pop" : "dequeue");
    size += add ? 1 : -1;
  }
  return ops.join(", ");
}

function randomBrackets(r) {
  const pairs = ["()", "[]", "{}"], s = [];
  const grow = (d) => { const n = 1 + Math.floor(r() * 2); for (let i = 0; i < n; i++) { const p = pairs[Math.floor(r() * 3)]; s.push(p[0]); if (d < 2 && r() < 0.6) grow(d + 1); s.push(p[1]); } };
  grow(0);
  if (r() < 0.5) { const i = Math.floor(r() * s.length); const c = s[i]; s[i] = { "(": "[", "[": "{", "{": "(", ")": "]", "]": "}", "}": ")" }[c]; }
  return s.join(" ");
}

function randomInfix(r, numbers = false) {
  const n = 3 + Math.floor(r() * 3), ops = numbers ? ["+", "-", "*"] : ["+", "-", "*", "/", "^"];
  const toks = [];
  const operand = (i) => (numbers ? String(1 + Math.floor(r() * 9)) : "abcdefgh"[i]);
  for (let i = 0; i < n; i++) { if (i) toks.push(ops[Math.floor(r() * ops.length)]); toks.push(operand(i)); }
  if (r() < 0.7) {
    const a = Math.floor(r() * (n - 1)), b = a + 1 + Math.floor(r() * (n - 1 - a));
    if (!(a === 0 && b === n - 1)) { toks.splice(b * 2 + 1, 0, ")"); toks.splice(a * 2, 0, "("); }
  }
  return toks;
}

// A common slip: ignoring precedence and treating every operator alike.
function naive(toks) {
  const out = [], st = [];
  for (const t of toks) {
    if (/^[\w]/.test(t)) out.push(t);
    else if (t === "(") st.push(t);
    else if (t === ")") { while (st.at(-1) !== "(") out.push(st.pop()); st.pop(); }
    else { while (st.length && st.at(-1) !== "(") out.push(st.pop()); st.push(t); }
  }
  while (st.length) out.push(st.pop());
  return out.join(" ");
}
