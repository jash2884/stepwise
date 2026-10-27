import { KINDS, OPS, codeFor, parseValues, run } from "../engines/lists.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, mountTabs, numberQuestion, stat } from "./kit.js";
import { arrowDefs, curve, glide, legend, practiceCard, shuffle, summaryTable, toolbar } from "./dsa-motion.js";

const EXAMPLES = {
  rev: { name: "Reverse a singly linked list", kind: "s", a: "10 20 30 40 50", op: "reverse" },
  ins: { name: "Insert 25 at position 2", kind: "s", a: "10 20 30 40", op: "insertAt", pos: 2, x: 25 },
  dins: { name: "Doubly: insert in the middle", kind: "d", a: "4 8 15 16", op: "insertAt", pos: 2, x: 42 },
  ddel: { name: "Doubly: delete a value", kind: "d", a: "4 8 15 16 23", op: "delete", x: 15 },
  cdel: { name: "Circular: delete the head", kind: "c", a: "7 14 21 28", op: "delete", x: 7 },
  chead: { name: "Circular: insert at head", kind: "c", a: "7 14 21", op: "insertHead", x: 3 },
  floyd: { name: "Floyd: cycle back to position 2", kind: "s", a: "1 2 3 4 5 6 7", op: "floyd", cycle: 2 },
  nocyc: { name: "Floyd: no cycle", kind: "s", a: "1 2 3 4 5", op: "floyd", cycle: -1 },
  search: { name: "Search a list", kind: "s", a: "12 7 33 18 5", op: "search", x: 18 },
};

const NH = 38, ROW0 = 100, ROW1 = 236;
const f1 = (v) => v.toFixed(1);
// A cubic with explicit control points, in the same "M x,y C … " shape as
// curve(), so glide() can tween between the two kinds of arrow.
const cubic = (x1, y1, c1x, c1y, c2x, c2y, x2, y2) => `M${f1(x1)},${f1(y1)} C${f1(c1x)},${f1(c1y)} ${f1(c2x)},${f1(c2y)} ${f1(x2)},${f1(y2)}`;

// Nodes are boxes split into fields ([data | next], or [prev | data | next]);
// every pointer field is an arrow keyed by its node and field, so when a
// pointer changes, glide() swings the same arrow onto its new target.
function listSvg(st, kind, maxX, row1) {
  const NW = kind === "d" ? 88 : 70, SX = NW + 42, F = kind === "d" ? 20 : 22;
  const left = 20 + NW / 2 + SX / 2, px = (x) => left + x * SX, py = (y) => (y ? ROW1 : ROW0);
  const byId = new Map(st.nodes.map((n) => [n.id, n]));
  const hot = new Set(st.hot ?? []), hotL = new Set(st.hotLinks ?? []);
  const defs = arrowDefs("on", "off");
  const links = [], nodes = [], tags = [];
  const anyNull = Object.values(st.ptrs).some((v) => v == null) && Object.keys(st.ptrs).length > 0;
  const W = px(maxX) + NW / 2 + 34, H = (row1 ? ROW1 : ROW0) + NH / 2 + 84;
  const link = (n, field) => {
    const to = n[field], key = `${field === "next" ? "n" : "p"}${n.id}`, x = px(n.x), y = py(n.y);
    const off = kind === "d" ? (field === "next" ? -7 : 7) : 0;
    const sx = field === "next" ? x + NW / 2 - F / 2 : x - NW / 2 + F / 2;
    let d;
    // A null pointer is a slash through its field (as in CLRS); the arrow
    // shrinks into the field so a pointer being cleared visibly retracts.
    if (to == null) d = curve(sx, y + off, sx, y + off, 0);
    else {
      const t = byId.get(to), tx = px(t.x), ty = py(t.y);
      const natural = field === "next" ? t.x > n.x + 0.01 : t.x < n.x - 0.01;
      const adjacent = Math.abs(t.x - n.x) <= 1.01 || t.y !== n.y;
      if (kind === "d" && t.y !== n.y) {
        // Doubly, node waiting in the lower row: four arrows meet it, so keep
        // them apart. Each leaves its own field through the face toward the
        // other row and lands on the target's facing side, clear of the
        // pointer tags under the row-0 nodes; next arrows bow forwards (right)
        // and prev arrows backwards (left), so a pair never crosses.
        const down = t.y > n.y, dir = to === n.id ? 0 : Math.sign(tx - x) || (field === "next" ? 1 : -1);
        const y1 = y + (down ? NH / 2 : -NH / 2), y2 = ty + (down ? -NH / 2 - 2 : NH / 2 + 2);
        const x1 = n.y ? sx : sx + (field === "next" ? 5 : -5), ex = tx - dir * (t.y ? 12 : 28);
        const bow = field === "next" ? 12 : -12, dy = y2 - y1;
        d = cubic(x1, y1, x1 + bow, y1 + dy * 0.42, ex + bow, y2 - dy * 0.42, ex, y2);
      } else if (natural && adjacent) d = curve(sx, y + off, field === "next" ? tx - NW / 2 - 2 : tx + NW / 2 + 2, ty + off, 0);
      else {
        const up = field === "next", span = Math.abs(t.x - n.x);
        const bend = (up ? 1 : -1) * Math.min(90, 34 + 16 * span);
        d = curve(sx, y + (up ? -NH / 2 : NH / 2), tx + (to === n.id ? -NW / 4 : 0), ty + (up ? -NH / 2 - 2 : NH / 2 + 2), bend);
      }
    }
    const on = hotL.has(key);
    links.push(h("path", { d, class: `ll-link${on ? " on" : ""}${n.gone ? " gone" : ""}${field === "prev" ? " prev" : ""}`, "data-tw": key, "marker-end": to == null ? null : `url(#${defs.id}-${on ? "on" : "off"})` }));
  };
  for (const n of st.nodes) {
    link(n, "next");
    if (kind === "d") link(n, "prev");
    const x = px(n.x), y = py(n.y);
    const cls = ["ll-node", hot.has(n.id) && "hot", st.found === n.id && "found", st.meet === n.id && "meet", n.gone && "gone"].filter(Boolean).join(" ");
    const x0 = x - NW / 2;
    nodes.push(h("g", { class: cls, "data-k": `n:${n.id}`, "data-x": x, "data-y": y },
      h("rect", { x: x0, y: y - NH / 2, width: NW, height: NH, rx: 7 }),
      h("line", { x1: x0 + NW - F, x2: x0 + NW - F, y1: y - NH / 2, y2: y + NH / 2, class: "ll-div" }),
      kind === "d" ? h("line", { x1: x0 + F, x2: x0 + F, y1: y - NH / 2, y2: y + NH / 2, class: "ll-div" }) : null,
      h("text", { x: kind === "d" ? x : x0 + (NW - F) / 2, y: y + 5, "text-anchor": "middle" }, n.v),
      n.next == null ? h("line", { x1: x0 + NW - F + 3, y1: y + NH / 2 - 3, x2: x0 + NW - 3, y2: y - NH / 2 + 3, class: "ll-slash" }) : null,
      kind === "d" && n.prev == null ? h("line", { x1: x0 + 3, y1: y + NH / 2 - 3, x2: x0 + F - 3, y2: y - NH / 2 + 3, class: "ll-slash" }) : null));
  }
  // Named pointers hang under the node they point at.
  const at = new Map();
  for (const [name, id] of Object.entries(st.ptrs)) { const k = id == null ? "null" : id; at.set(k, [...(at.get(k) ?? []), name]); }
  for (const [k, names] of at) names.forEach((name, i) => {
    const n = k === "null" ? { x: -0.5, y: 0 } : byId.get(k);
    if (!n) return;
    const x = px(n.x), y = py(n.y) + NH / 2 + 18 + i * 19;
    tags.push(h("g", { class: `ll-tag t-${name}`, "data-k": `v:${name}`, "data-x": x, "data-y": y },
      i === 0 ? h("path", { d: `M${x},${y - 12} l-5,8 h10 z` }) : null,
      h("text", { x, y: y + 9, "text-anchor": "middle" }, name)));
  });
  const nullBox = anyNull ? h("g", { class: "ll-nullbox" }, h("text", { x: px(-0.5), y: ROW0 + 5, "text-anchor": "middle" }, "null")) : null;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "ll-svg", role: "img", "aria-label": `Linked list: ${st.nodes.filter((n) => !n.gone).map((n) => n.v).join(", ")}`, style: `max-width:${Math.max(W * 1.1, 360)}px;min-width:${Math.min(W, 520)}px` }, defs.el, links, nodes, nullBox, tags);
}

export function render(root) {
  const p = readParams();
  const num = (k, d) => (p.get(k) !== null && Number.isInteger(Number(p.get(k))) ? Number(p.get(k)) : d);
  const state = { kind: KINDS[p.get("kind")] ? p.get("kind") : "s", op: OPS[p.get("op")] ? p.get("op") : "reverse", values: p.get("a") ?? "10 20 30 40 50", x: num("x", 25), pos: num("pos", 2), cycle: num("cycle", 2) };
  let player = null;
  const head = page({
    subject: "Data structures & algorithms", title: "Linked lists",
    lede: "Singly, doubly and circular lists with every pointer drawn as an arrow. Watch arrows swing as you insert, delete and reverse, and the tortoise and hare hunt for a cycle.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "linked list"), " stores each value in a node that points to the next one. Unlike an array, the nodes can live anywhere in memory, so inserting or deleting is just re-pointing a couple of arrows (O(1) once you're at the right node), but reaching position i means following i pointers (O(n)): there is no A[i]."),
      h("p", null, "A ", h("b", null, "doubly linked"), " node also points back to its predecessor, so you can walk both ways and delete a node without hunting for the one before it. A ", h("b", null, "circular"), " list's last node points back to the head instead of null, which suits round-robin scheduling and buffers."),
      h("p", null, "The order of pointer updates matters: when inserting, link the new node to its successor ", h("i", null, "before"), " re-pointing its predecessor, or the rest of the list is lost. ", h("b", null, "In-place reversal"), " walks the list once with three pointers (prev, curr, next), flipping one arrow per step."),
      h("p", null, h("b", null, "Floyd's cycle detection"), " sends a slow pointer one step and a fast pointer two steps at a time. If the list ends, fast reaches null; if it loops, fast gains one node per step and must land on slow. Resetting slow to the head and moving both one step at a time then finds where the loop starts, using O(1) memory.")),
    conventions: ["Positions start at 0; inserting at position i makes the new node the i-th, so position 0 is the head and position n appends.", "Delete removes the first node holding the value. Search returns the position or −1.", "The circular list is singly linked; its last node points to the head. Floyd's demo makes a singly list loop back to the chosen position."],
  });

  const kindSel = h("select", { "aria-label": "List kind", onchange: (e) => { state.kind = e.target.value; update(); } }, Object.entries(KINDS).map(([k, v]) => h("option", { value: k, selected: k === state.kind }, v)));
  const opSel = h("select", { "aria-label": "Operation", onchange: (e) => { state.op = e.target.value; update(); } }, Object.entries(OPS).map(([k, v]) => h("option", { value: k, selected: k === state.op }, v.name)));
  const valIn = h("input", { type: "text", class: "mono wide", value: state.values, "aria-label": "Values", oninput: (e) => { state.values = e.target.value; update(); } });
  const numIn = (key, aria) => h("input", { type: "number", value: state[key], "aria-label": aria, oninput: (e) => { if (e.target.value !== "") { state[key] = Number(e.target.value); update(); } } });
  const xIn = numIn("x", "Value"), posIn = numIn("pos", "Position"), cycIn = numIn("cycle", "Cycle back to position");
  const xL = h("label", { class: "stack", style: "margin:0" }, "Value x", xIn), posL = h("label", { class: "stack", style: "margin:0" }, "Position", posIn), cycL = h("label", { class: "stack", style: "margin:0" }, "Last node links to position (−1 = none)", cycIn);
  const msg = h("div"), out = h("div", { class: "output" });
  const set = (ex) => { Object.assign(state, { kind: ex.kind, op: ex.op, values: ex.a }, ex.x != null ? { x: ex.x } : {}, ex.pos != null ? { pos: ex.pos } : {}, ex.cycle != null ? { cycle: ex.cycle } : {}); valIn.value = state.values; xIn.value = state.x; posIn.value = state.pos; cycIn.value = state.cycle; update(); };

  function update() {
    player?.destroy();
    const arg = OPS[state.op].arg ?? "";
    writeParams({ kind: state.kind, op: state.op, a: state.values, ...(arg.includes("x") ? { x: state.x } : {}), ...(arg.includes("pos") ? { pos: state.pos } : {}), ...(state.op === "floyd" && state.kind === "s" ? { cycle: state.cycle } : {}) });
    kindSel.value = state.kind; opSel.value = state.op;
    opSel.querySelector("[value=floyd]").disabled = state.kind === "d";
    xL.hidden = !arg.includes("x"); posL.hidden = !arg.includes("pos"); cycL.hidden = !(state.op === "floyd" && state.kind === "s");
    let res;
    try { res = run({ kind: state.kind, values: parseValues(state.values), op: state.op, x: state.x, pos: state.pos, cycleAt: state.cycle }); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(codeFor(state.op, state.kind).lines), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" }), counters = h("div", { class: "stats-row" });
    const maxX = Math.max(1, ...res.steps.flatMap((s) => s.nodes.map((n) => n.x))), row1 = res.steps.some((s) => s.nodes.some((n) => n.y));
    let changes = 0;
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1100,
      render: (i) => {
        const st = res.steps[i];
        glide(stage, listSvg(st, state.kind, maxX, row1));
        code.show(st.line); vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.done ? " good" : ""}`;
        changes = res.steps.slice(0, i + 1).reduce((s, x) => s + (x.hotLinks?.length ?? 0), 0);
        counters.replaceChildren(stat("Nodes", st.nodes.filter((n) => !n.gone).length), stat("Pointer writes", changes), stat("Line", st.line ?? "–"));
      },
    });
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `${OPS[state.op].name}: ${KINDS[state.kind].toLowerCase()} list`), player.el, note,
        traceLayout(h("div", null, stage, legend([["Current node", "var(--accent)"], ["Pointer just changed", "var(--series-2)"], ["Found / meeting point", "var(--good)"], ["Being removed", "var(--bad)"]])), code, vars),
        counters),
      h("section", { class: "card" }, h("h2", null, "Linked list vs array"),
        summaryTable(["Operation", "Singly", "Doubly", "Circular", "Array"], [
          { id: "insertHead", cells: ["Insert / delete at head", "O(1)", "O(1)", "O(n), O(1) with a tail pointer", "O(n) shift"] },
          { id: "insertTail", cells: ["Insert at tail", "O(n), O(1) with a tail pointer", "O(1) with a tail pointer", "O(n), O(1) with a tail pointer", "O(1) amortised"] },
          { id: "insertAt", cells: ["Insert at position i", "O(i) walk + O(1) link", "O(i) walk + O(1) link", "O(i) walk + O(1) link", "O(n) shift"] },
          { id: "delete", cells: ["Delete a value", "O(n)", "O(n) search, O(1) unlink", "O(n)", "O(n)"] },
          { id: "search", cells: ["Search / access i-th", "O(n)", "O(n)", "O(n)", "O(n) / O(1)"] },
          { id: "reverse", cells: ["Reverse in place", "O(n), O(1) space", "O(n), O(1) space", "O(n), O(1) space", "O(n), O(1) space"] },
          { id: "floyd", cells: ["Cycle detection (Floyd)", "O(n), O(1) space", "–", "O(n), O(1) space", "–"] },
        ], state.op)));
  }

  const random = () => {
    const r = rng(), n = 4 + Math.floor(r() * 4), vals = Array.from({ length: n }, () => 1 + Math.floor(r() * 98));
    state.values = vals.join(" "); valIn.value = state.values;
    state.x = r() < 0.6 && state.op !== "insertAt" ? vals[Math.floor(r() * n)] : 1 + Math.floor(r() * 98); xIn.value = state.x;
    state.pos = Math.floor(r() * (n + 1)); posIn.value = state.pos;
    state.cycle = Math.floor(r() * (n + 1)) - 1; cycIn.value = state.cycle;
    update();
  };
  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, kindSel, opSel, toolbar(EXAMPLES, set, random)),
      h("div", { class: "row" }, h("label", { class: "stack", style: "flex:1;margin:0" }, "Starting list (up to 10 values)", valIn), posL, xL, cycL),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = Math.floor(r() * 5);
    const n = 5 + Math.floor(r() * 3), vals = Array.from({ length: n }, (_, i) => 10 * (i + 1) + Math.floor(r() * 9));
    let body;
    if (kind === 0) {
      const k = 1 + Math.floor(r() * (n - 2));
      const res = run({ kind: "s", values: vals, op: "reverse" });
      const st = res.steps.filter((s) => s.line === 5)[k - 1];
      const right = `prev = ${st.vars.prev}, curr = ${st.vars.curr}`;
      const opts = [...new Set([right, `prev = ${vals[k]}, curr = ${vals[k + 1] ?? "null"}`, `prev = ${vals[k - 1]}, curr = ${vals[k - 1]}`, `prev = ${vals[k - 2] ?? "null"}, curr = ${vals[k - 1]}`])];
      body = [h("h2", null, `Reversing in place with prev, curr and next: after ${k} iteration${k > 1 ? "s" : ""} of the loop, where do prev and curr point?`), h("p", { class: "grammar-box" }, `${vals.join(" → ")} → null`),
        choice(shuffle(opts.map((o) => ({ label: o, correct: o === right })), r), `Each iteration flips one arrow and moves both pointers one node on, so after ${k} the first ${k} arrows are flipped: ${right}.`)];
    } else if (kind === 1) {
      const right = "node.next ← curr.next, then curr.next ← node";
      body = [h("h2", null, "Inserting a new node after curr in a singly linked list: which order is correct?"),
        choice(shuffle([right, "curr.next ← node, then node.next ← curr.next", "node.next ← curr, then curr.next ← node", "curr.next ← node.next, then node.next ← curr"].map((o) => ({ label: o, correct: o === right })), r),
          "If curr.next is overwritten first, the only pointer to the rest of the list is gone, and node.next ← curr.next would make the node point to itself.")];
    } else if (kind === 2) {
      const c = Math.floor(r() * (n - 1)), res = run({ kind: "s", values: vals, op: "floyd", cycleAt: c });
      body = [h("h2", null, `The last node links back to position ${c}. With slow moving 1 and fast moving 2 nodes per step, after how many steps do they first meet?`), h("p", { class: "grammar-box" }, `${vals.join(" → ")} → back to ${vals[c]}`),
        numberQuestion(res.meetAfter, `They meet after ${res.meetAfter} steps; resetting slow to the head then finds the loop start, ${vals[c]}.`)];
    } else if (kind === 3) {
      const del = r() < 0.5;
      body = [h("h2", null, del ? "Deleting a node from the middle of a doubly linked list: how many pointer fields must change?" : "Inserting a node into the middle of a doubly linked list: how many pointer fields must be set?"),
        numberQuestion(del ? 2 : 4, del ? "Two: the predecessor's next and the successor's prev." : "Four: the new node's next and prev, the predecessor's next and the successor's prev.")];
    } else {
      const i = Math.floor(r() * n), x = vals[i];
      body = [h("h2", null, `How many nodes does a search for ${x} look at?`), h("p", { class: "grammar-box" }, `${vals.join(" → ")} → null`),
        numberQuestion(i + 1, `It starts at the head and checks ${i + 1} node${i ? "s" : ""}: ${vals.slice(0, i + 1).join(", ")}. There's no way to jump straight to position ${i}.`)];
    }
    practiceCard(practice, newQuestion, body);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}
