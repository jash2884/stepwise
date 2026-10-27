// Linked lists: singly, doubly and circular. Nodes keep their id and their
// place on screen (x = slot along the row, y = 0 for the list, 1 for a node
// that is being created or removed), so the view can slide nodes and swing
// each next/prev arrow to its new target. Every step names a pseudocode line.

export const KINDS = { s: "Singly linked", d: "Doubly linked", c: "Circular (singly)" };

export const OPS = {
  insertHead: { name: "Insert at head", arg: "x" },
  insertTail: { name: "Insert at tail", arg: "x" },
  insertAt: { name: "Insert at position", arg: "pos x" },
  delete: { name: "Delete a value", arg: "x" },
  search: { name: "Search", arg: "x" },
  reverse: { name: "Reverse (in place)", arg: null },
  floyd: { name: "Detect a cycle (Floyd)", arg: null },
};

// [label, text, kinds]: kinds limits a line to some list kinds.
const CODE = {
  insertHead: [
    ["new", "node ← new Node(x)"],
    ["emptyc", "if head = null then node.next ← node; head ← node; return", "c"],
    ["tail", "tail ← head; while tail.next ≠ head: tail ← tail.next  // find the last node", "c"],
    ["link", "node.next ← head"],
    ["back", "if head ≠ null then head.prev ← node", "d"],
    ["wrap", "tail.next ← node  // close the ring again", "c"],
    ["head", "head ← node"],
  ],
  insertTail: [
    ["new", "node ← new Node(x)"],
    ["empty", "if head = null then head ← node; return", "sd"],
    ["emptyc", "if head = null then node.next ← node; head ← node; return", "c"],
    ["start", "curr ← head"],
    ["walk", "while curr.next ≠ null  // walk to the last node", "sd"],
    ["walkc", "while curr.next ≠ head  // walk to the last node", "c"],
    ["step", "  curr ← curr.next"],
    ["ring", "node.next ← head  // the new last node points back to the head", "c"],
    ["prev", "node.prev ← curr", "d"],
    ["link", "curr.next ← node"],
  ],
  insertAt: [
    ["zero", "if pos = 0 then insert at head; return"],
    ["start", "curr ← head"],
    ["walk", "repeat pos − 1 times  // stop at the node before position pos"],
    ["step", "  curr ← curr.next"],
    ["new", "node ← new Node(x)"],
    ["next", "node.next ← curr.next  // link the new node in first…"],
    ["back", "if curr.next ≠ null then curr.next.prev ← node", "d"],
    ["prev", "node.prev ← curr", "d"],
    ["link", "curr.next ← node  // …then re-point curr, so nothing is lost"],
  ],
  delete: {
    s: [
      ["empty", "if head = null then return"],
      ["first", "if head.data = x then head ← head.next; return"],
      ["init", "prev ← head; curr ← head.next"],
      ["walk", "while curr ≠ null and curr.data ≠ x"],
      ["step", "  prev ← curr; curr ← curr.next"],
      ["miss", "if curr = null then return  // x isn't in the list"],
      ["unlink", "prev.next ← curr.next  // bypass curr"],
      ["free", "free(curr)"],
    ],
    d: [
      ["init", "curr ← head"],
      ["walk", "while curr ≠ null and curr.data ≠ x"],
      ["step", "  curr ← curr.next"],
      ["miss", "if curr = null then return  // x isn't in the list"],
      ["fwd", "if curr.prev ≠ null then curr.prev.next ← curr.next else head ← curr.next"],
      ["bwd", "if curr.next ≠ null then curr.next.prev ← curr.prev"],
      ["free", "free(curr)"],
    ],
    c: [
      ["empty", "if head = null then return"],
      ["init", "prev ← head; while prev.next ≠ head: prev ← prev.next  // the last node"],
      ["start", "curr ← head"],
      ["loop", "repeat"],
      ["test", "  if curr.data = x then"],
      ["only", "    if curr.next = curr then head ← null; return  // the only node"],
      ["unlink", "    prev.next ← curr.next"],
      ["fixhead", "    if curr = head then head ← curr.next"],
      ["free", "    free(curr); return"],
      ["step", "  prev ← curr; curr ← curr.next"],
      ["until", "until curr = head  // back at the start: x isn't there"],
    ],
  },
  search: [
    ["empty", "if head = null then return −1", "c"],
    ["init", "curr ← head; i ← 0"],
    ["walk", "while curr ≠ null", "sd"],
    ["loop", "repeat", "c"],
    ["test", "  if curr.data = x then return i"],
    ["step", "  curr ← curr.next; i ← i + 1"],
    ["until", "until curr = head  // a full lap", "c"],
    ["miss", "return −1"],
  ],
  reverse: {
    s: [
      ["init", "prev ← null; curr ← head"],
      ["walk", "while curr ≠ null"],
      ["save", "  next ← curr.next  // remember the rest of the list"],
      ["flip", "  curr.next ← prev  // turn this arrow round"],
      ["move", "  prev ← curr; curr ← next  // step forward"],
      ["head", "head ← prev"],
    ],
    d: [
      ["init", "curr ← head"],
      ["walk", "while curr ≠ null"],
      ["swap", "  swap(curr.prev, curr.next)  // both arrows turn round"],
      ["head", "  head ← curr  // the last node visited ends up as head"],
      ["move", "  curr ← curr.prev  // prev now holds the old next"],
    ],
    c: [
      ["empty", "if head = null then return"],
      ["init", "prev ← last node; curr ← head"],
      ["loop", "repeat"],
      ["save", "  next ← curr.next"],
      ["flip", "  curr.next ← prev"],
      ["move", "  prev ← curr; curr ← next"],
      ["until", "until curr = head"],
      ["head", "head ← prev  // the old last node"],
    ],
  },
  floyd: [
    ["init", "slow ← head; fast ← head"],
    ["walk", "while fast ≠ null and fast.next ≠ null"],
    ["slow", "  slow ← slow.next  // one step"],
    ["fast", "  fast ← fast.next.next  // two steps"],
    ["meet", "  if slow = fast then  // they can only meet inside a loop"],
    ["reset", "    slow ← head"],
    ["find", "    while slow ≠ fast: slow ← slow.next; fast ← fast.next"],
    ["found", "    return slow  // where the cycle begins"],
    ["none", "return null  // fast reached the end: no cycle"],
  ],
};

export function codeFor(op, kind) {
  const spec = Array.isArray(CODE[op]) ? CODE[op] : CODE[op][kind];
  const rows = spec.filter(([, , k]) => !k || k.includes(kind));
  return { lines: rows.map((r) => r[1]), at: Object.fromEntries(rows.map((r, i) => [r[0], i + 1])) };
}

function recorder(kind, values, op, cycleAt) {
  const r = {
    kind, nodes: new Map(), place: new Map(), head: null, ptrs: {}, steps: [], nextId: 0, gone: new Set(),
    code: codeFor(op, kind),
    make(v) { const id = r.nextId++; r.nodes.set(id, { id, v, next: null, prev: null }); return id; },
    // Lay the list out left to right in traversal order.
    tidy() {
      const seen = new Set();
      let x = 0;
      for (let id = r.head; id != null && !seen.has(id); id = r.nodes.get(id).next) { seen.add(id); r.place.set(id, { x: x++, y: 0 }); }
    },
    order() {
      const out = [], seen = new Set();
      for (let id = r.head; id != null && !seen.has(id); id = r.nodes.get(id).next) { seen.add(id); out.push(r.nodes.get(id).v); }
      return out;
    },
    v: (id) => (id == null ? "null" : r.nodes.get(id).v),
    snap(label, note, extra = {}) {
      const line = label == null ? null : r.code.at[label];
      if (label != null && !line) throw new Error(`No line ${label}`);
      r.steps.push({
        nodes: [...r.nodes.values()].map((n) => ({ ...n, ...r.place.get(n.id), gone: r.gone.has(n.id) })),
        head: r.head, ptrs: { ...r.ptrs }, line, note, ...extra,
        vars: { ...Object.fromEntries(Object.entries(r.ptrs).map(([k, id]) => [k, r.v(id)])), ...extra.vars },
      });
    },
  };
  for (const v of values) {
    const id = r.make(v);
    if (r.head == null) r.head = id;
    else { const last = id - 1; r.nodes.get(last).next = id; if (kind === "d") r.nodes.get(id).prev = last; }
  }
  if (values.length && kind === "c") r.nodes.get(values.length - 1).next = r.head;
  if (values.length && kind === "s" && op === "floyd" && cycleAt >= 0) r.nodes.get(values.length - 1).next = cycleAt;
  r.tidy();
  return r;
}

export function run({ kind = "s", values = [], op = "insertHead", x = 0, pos = 0, cycleAt = -1 }) {
  if (!KINDS[kind]) throw new Error(`Unknown list kind ${kind}.`);
  if (!OPS[op]) throw new Error(`Unknown operation ${op}.`);
  if (values.length > 10) throw new Error("Use at most 10 values so the list fits.");
  if (op === "floyd" && kind === "d") throw new Error("Floyd's cycle detection is shown on singly linked and circular lists.");
  if (op === "floyd" && kind === "s" && (cycleAt < -1 || cycleAt >= values.length)) throw new Error(`The cycle must go back to a position from 0 to ${values.length - 1}, or −1 for none.`);
  if (op === "insertAt" && (pos < 0 || pos > values.length)) throw new Error(`Position must be from 0 to ${values.length} (the length of the list).`);
  const r = recorder(kind, values, op, cycleAt);
  const desc = kind === "c" ? "circular list" : `${KINDS[kind].toLowerCase()} list`;
  r.snap(null, values.length ? `A ${desc} of ${values.length} node${values.length > 1 ? "s" : ""}: ${values.join(" → ")}${kind === "c" ? " → back to the head" : op === "floyd" && cycleAt >= 0 ? ` → back to position ${cycleAt}` : " → null"}.` : `An empty ${desc}: head = null.`, { vars: { head: r.v(r.head) } });
  const result = OPS_RUN[op](r, { x, pos });
  if (op !== "floyd" && op !== "search") r.tidy();
  r.ptrs = {};
  r.gone.forEach((id) => r.nodes.delete(id));
  const final = r.order();
  const shape = final.length ? `${final.join(" → ")}${kind === "c" ? " → (back to the head)" : ""}` : "empty";
  r.snap(null, op === "search" || op === "floyd" ? `Done: the list is unchanged.${result.extra}` : `Done. The list is now ${shape}.${result.extra ?? ""}`, { done: true, found: result.found, vars: { head: r.v(r.head), ...(result.vars ?? {}) } });
  return { steps: r.steps, final, ...result };
}

const OPS_RUN = {
  insertHead(r, { x }, L = (k) => k) {
    const kind = r.kind, id = r.make(x), old = r.head;
    r.place.set(id, { x: -0.5, y: 1 });
    r.ptrs = { node: id, head: r.head };
    r.snap(L("new"), `Create a node holding ${x}. Nothing points to it yet.`, { hot: [id] });
    if (kind === "c" && old == null) {
      r.nodes.get(id).next = id; r.head = id; r.ptrs.head = id;
      r.snap(L("emptyc"), "The list was empty: the node points to itself, a ring of one.", { hot: [id] });
      return {};
    }
    let tail = null;
    if (kind === "c") {
      tail = old;
      while (r.nodes.get(tail).next !== old) tail = r.nodes.get(tail).next;
      r.ptrs.tail = tail;
      r.snap(L("tail"), `Walk to the last node (${r.v(tail)}): its next pointer must move to the new head. This walk makes circular insert-at-head O(n) unless you keep a tail pointer.`, { hot: [tail] });
    }
    r.nodes.get(id).next = old;
    r.snap(L("link"), old == null ? "node.next ← head, which is null." : `node.next ← head: the new node points at ${r.v(old)}.`, { hot: [id], hotLinks: [`n${id}`] });
    if (kind === "d" && old != null) { r.nodes.get(old).prev = id; r.snap(L("back"), `head.prev ← node: ${r.v(old)} points back at the new node.`, { hot: [old], hotLinks: [`p${old}`] }); }
    if (kind === "c") { r.nodes.get(tail).next = id; r.snap(L("wrap"), `tail.next ← node: the last node now points to the new node, closing the ring.`, { hot: [tail], hotLinks: [`n${tail}`] }); }
    r.head = id; r.ptrs.head = id;
    r.snap(L("head"), "head ← node.", { hot: [id] });
    r.tidy(); r.ptrs = { head: id };
    r.snap(L("head"), `The new node slides into place at the front. Only a few pointers changed, so this is O(1)${kind === "c" ? " apart from finding the tail" : ""}.`, { hot: [id] });
    return {};
  },

  insertTail(r, { x }) {
    const kind = r.kind, id = r.make(x);
    const n = r.order().length;
    r.place.set(id, { x: n, y: 1 });
    r.ptrs = { head: r.head, node: id };
    r.snap("new", `Create a node holding ${x}.`, { hot: [id] });
    if (r.head == null) {
      r.head = id; r.ptrs.head = id;
      if (kind === "c") r.nodes.get(id).next = id;
      r.snap(kind === "c" ? "emptyc" : "empty", `The list was empty, so the new node is the head${kind === "c" ? " and points to itself" : ""}.`, { hot: [id] });
      return {};
    }
    let curr = r.head;
    r.ptrs.curr = curr;
    r.snap("start", `curr ← head (${r.v(curr)}). Without a tail pointer we have to walk the whole list: O(n).`, { hot: [curr] });
    const stop = kind === "c" ? r.head : null;
    while (r.nodes.get(curr).next !== stop) {
      r.snap(kind === "c" ? "walkc" : "walk", `curr.next isn't ${kind === "c" ? "head" : "null"}, so ${r.v(curr)} isn't the last node.`, { hot: [curr] });
      curr = r.nodes.get(curr).next; r.ptrs.curr = curr;
      r.snap("step", `curr ← curr.next (${r.v(curr)}).`, { hot: [curr] });
    }
    r.snap(kind === "c" ? "walkc" : "walk", `curr.next is ${kind === "c" ? "head" : "null"}: ${r.v(curr)} is the last node.`, { hot: [curr] });
    if (kind === "c") { r.nodes.get(id).next = r.head; r.snap("ring", "node.next ← head: the new node will be the last, so it points round to the head.", { hot: [id], hotLinks: [`n${id}`] }); }
    if (kind === "d") { r.nodes.get(id).prev = curr; r.snap("prev", `node.prev ← curr (${r.v(curr)}).`, { hot: [id], hotLinks: [`p${id}`] }); }
    r.nodes.get(curr).next = id;
    r.snap("link", `curr.next ← node: ${r.v(curr)} now points to ${x}.`, { hot: [curr], hotLinks: [`n${curr}`] });
    r.tidy(); r.ptrs = { head: r.head };
    r.snap("link", `${x} is the new last node.`, { hot: [id] });
    return {};
  },

  insertAt(r, { x, pos }) {
    if (pos === 0) {
      r.ptrs = { head: r.head };
      r.snap("zero", "pos = 0 means the new node becomes the head: do an insert at head.");
      return OPS_RUN.insertHead(r, { x }, () => "zero");
    }
    let curr = r.head;
    r.ptrs = { head: r.head, curr };
    r.snap("start", `curr ← head (${r.v(curr)}). We need the node just before position ${pos}, i.e. at position ${pos - 1}.`, { hot: [curr], vars: { pos } });
    for (let k = 1; k <= pos - 1; k++) {
      r.snap("walk", `Step ${k} of ${pos - 1}.`, { hot: [curr], vars: { pos, k } });
      curr = r.nodes.get(curr).next; r.ptrs.curr = curr;
      r.snap("step", `curr ← curr.next (${r.v(curr)}).`, { hot: [curr], vars: { pos, k } });
    }
    const id = r.make(x), after = r.nodes.get(curr).next;
    r.place.set(id, { x: r.place.get(curr).x + 0.5, y: 1 });
    r.ptrs.node = id;
    r.snap("new", `curr (${r.v(curr)}) is at position ${pos - 1}. Create a node holding ${x}.`, { hot: [id], vars: { pos } });
    r.nodes.get(id).next = after;
    r.snap("next", `node.next ← curr.next: the new node points at ${r.v(after)}. Do this first: if curr.next were overwritten first, the rest of the list would be lost.`, { hot: [id], hotLinks: [`n${id}`], vars: { pos } });
    if (r.kind === "d") {
      if (after != null) { r.nodes.get(after).prev = id; r.snap("back", `curr.next.prev ← node: ${r.v(after)} points back at ${x}.`, { hot: [after], hotLinks: [`p${after}`], vars: { pos } }); }
      else r.snap("back", "curr.next is null (inserting at the end), so there is no back pointer to fix.", { vars: { pos } });
      r.nodes.get(id).prev = curr;
      r.snap("prev", `node.prev ← curr (${r.v(curr)}).`, { hot: [id], hotLinks: [`p${id}`], vars: { pos } });
    }
    r.nodes.get(curr).next = id;
    r.snap("link", `curr.next ← node: ${r.v(curr)} now points down to ${x}. The node is in the list.`, { hot: [curr], hotLinks: [`n${curr}`], vars: { pos } });
    r.tidy(); r.ptrs = { head: r.head };
    r.snap("link", `Redraw: ${x} sits at position ${pos}. The walk took ${pos - 1} step${pos - 1 === 1 ? "" : "s"}; the relinking is O(1).`, { hot: [id], vars: { pos } });
    return {};
  },

  delete(r, { x }) {
    const kind = r.kind;
    const unlinkDrop = (id) => { r.gone.add(id); const p = r.place.get(id); r.place.set(id, { x: p.x, y: 1 }); };
    if (kind === "s") {
      r.ptrs = { head: r.head };
      if (r.head == null) { r.snap("empty", "The list is empty: nothing to delete."); return { found: null }; }
      r.snap("empty", "The list isn't empty.");
      if (r.nodes.get(r.head).v === x) {
        const old = r.head;
        r.head = r.nodes.get(old).next; r.ptrs = { head: r.head };
        unlinkDrop(old);
        r.snap("first", `The head holds ${x}: head ← head.next. The old head is unlinked.`, { hot: [old] });
        return { found: old };
      }
      r.snap("first", `The head holds ${r.v(r.head)}, not ${x}.`, { hot: [r.head] });
      let prev = r.head, curr = r.nodes.get(prev).next;
      r.ptrs = { head: r.head, prev, curr };
      r.snap("init", "prev trails one node behind curr: to unlink curr we need to change prev.next.", { hot: [curr].filter((v) => v != null) });
      while (curr != null && r.nodes.get(curr).v !== x) {
        r.snap("walk", `${r.v(curr)} ≠ ${x}: keep going.`, { hot: [curr] });
        prev = curr; curr = r.nodes.get(curr).next; r.ptrs.prev = prev; r.ptrs.curr = curr;
        r.snap("step", `prev ← ${r.v(prev)}, curr ← ${r.v(curr)}.`, { hot: [curr].filter((v) => v != null) });
      }
      if (curr == null) { r.snap("miss", `curr is null: ${x} isn't in the list, so nothing changes.`); return { found: null, extra: ` ${x} wasn't found.` }; }
      r.snap("walk", `curr holds ${x}: found it.`, { hot: [curr] });
      r.snap("miss", "curr isn't null, so unlink it.", { hot: [curr] });
      r.nodes.get(prev).next = r.nodes.get(curr).next;
      r.snap("unlink", `prev.next ← curr.next: ${r.v(prev)} now skips over ${x} to ${r.v(r.nodes.get(curr).next)}.`, { hot: [prev], hotLinks: [`n${prev}`] });
      unlinkDrop(curr);
      r.snap("free", `Nothing points to ${x} any more: free it.`, { hot: [curr] });
      return { found: curr };
    }
    if (kind === "d") {
      let curr = r.head;
      r.ptrs = { head: r.head, curr };
      r.snap("init", "curr ← head. A doubly linked node knows its predecessor, so no trailing prev pointer is needed.", { hot: [curr].filter((v) => v != null) });
      while (curr != null && r.nodes.get(curr).v !== x) {
        r.snap("walk", `${r.v(curr)} ≠ ${x}: keep going.`, { hot: [curr] });
        curr = r.nodes.get(curr).next; r.ptrs.curr = curr;
        r.snap("step", `curr ← ${r.v(curr)}.`, { hot: [curr].filter((v) => v != null) });
      }
      if (curr == null) { r.snap("miss", `curr is null: ${x} isn't in the list.`); return { found: null, extra: ` ${x} wasn't found.` }; }
      r.snap("walk", `curr holds ${x}: found it.`, { hot: [curr] });
      const n = r.nodes.get(curr);
      if (n.prev != null) { r.nodes.get(n.prev).next = n.next; r.snap("fwd", `curr.prev.next ← curr.next: ${r.v(n.prev)} now points forward to ${r.v(n.next)}.`, { hot: [n.prev], hotLinks: [`n${n.prev}`] }); }
      else { r.head = n.next; r.ptrs.head = r.head; r.snap("fwd", `curr is the head, so head ← curr.next (${r.v(n.next)}).`, { hot: [curr] }); }
      if (n.next != null) { r.nodes.get(n.next).prev = n.prev; r.snap("bwd", `curr.next.prev ← curr.prev: ${r.v(n.next)} now points back to ${r.v(n.prev)}.`, { hot: [n.next], hotLinks: [`p${n.next}`] }); }
      else r.snap("bwd", "curr was the last node: no back pointer to fix.", { hot: [curr] });
      unlinkDrop(curr);
      r.snap("free", `${x} is unlinked in both directions: free it. O(1) once you have the node.`, { hot: [curr] });
      return { found: curr };
    }
    // Circular.
    r.ptrs = { head: r.head };
    if (r.head == null) { r.snap("empty", "The list is empty: nothing to delete."); return { found: null }; }
    let prev = r.head;
    while (r.nodes.get(prev).next !== r.head) prev = r.nodes.get(prev).next;
    let curr = r.head;
    r.ptrs = { head: r.head, prev, curr };
    r.snap("init", `Start prev at the last node (${r.v(prev)}), so prev is always just behind curr, even for the head.`, { hot: [prev] });
    r.snap("start", "curr ← head.", { hot: [curr] });
    do {
      r.snap("test", `Does ${r.v(curr)} equal ${x}? ${r.v(curr) === x ? "Yes." : "No."}`, { hot: [curr] });
      if (r.nodes.get(curr).v === x) {
        if (r.nodes.get(curr).next === curr) {
          r.head = null; r.ptrs = { head: null }; unlinkDrop(curr);
          r.snap("only", "It's the only node: the list becomes empty.", { hot: [curr] });
          return { found: curr };
        }
        r.nodes.get(prev).next = r.nodes.get(curr).next;
        r.snap("unlink", `prev.next ← curr.next: ${r.v(prev)} now skips ${x}.`, { hot: [prev], hotLinks: [`n${prev}`] });
        if (curr === r.head) { r.head = r.nodes.get(curr).next; r.ptrs.head = r.head; r.snap("fixhead", `${x} was the head, so head moves on to ${r.v(r.head)}.`, { hot: [r.head] }); }
        unlinkDrop(curr);
        r.snap("free", `Free ${x}.`, { hot: [curr] });
        return { found: curr };
      }
      prev = curr; curr = r.nodes.get(curr).next; r.ptrs.prev = prev; r.ptrs.curr = curr;
      r.snap("step", `prev ← ${r.v(prev)}, curr ← ${r.v(curr)}.`, { hot: [curr] });
      r.snap("until", curr === r.head ? `curr is back at the head: a full lap without finding ${x}.` : "curr isn't back at the head yet.", { hot: [curr] });
    } while (curr !== r.head);
    return { found: null, extra: ` ${x} wasn't found.` };
  },

  search(r, { x }) {
    const circ = r.kind === "c";
    if (circ && r.head == null) { r.snap("empty", "The list is empty: return −1."); return { found: null, index: -1, extra: " The list is empty." }; }
    if (circ) r.snap("empty", "The list isn't empty.");
    let curr = r.head, i = 0;
    r.ptrs = { head: r.head, curr };
    r.snap("init", "Start at the head. A linked list has no indexes to jump to: the only way to reach node i is to follow i next pointers.", { hot: [curr].filter((v) => v != null), vars: { i } });
    do {
      if (!circ) {
        r.snap("walk", curr == null ? "curr is null: we fell off the end." : "curr isn't null.", { hot: [curr].filter((v) => v != null), vars: { i } });
        if (curr == null) break;
      }
      const hit = r.nodes.get(curr).v === x;
      r.snap("test", hit ? `${r.v(curr)} = ${x}: found at position ${i}.` : `${r.v(curr)} ≠ ${x}.`, { hot: [curr], found: hit ? curr : null, vars: { i } });
      if (hit) return { found: curr, index: i, vars: { result: i }, extra: ` ${x} is at position ${i}, found after ${i + 1} comparison${i ? "s" : ""}.` };
      curr = r.nodes.get(curr).next; i++; r.ptrs.curr = curr;
      r.snap("step", `curr ← curr.next${curr == null ? " (null)" : ` (${r.v(curr)})`}; i ← ${i}.`, { hot: [curr].filter((v) => v != null), vars: { i } });
      if (circ) r.snap("until", curr === r.head ? "Back at the head: a full lap." : "Not back at the head yet.", { hot: [curr], vars: { i } });
    } while (!circ || curr !== r.head);
    r.snap("miss", `${x} isn't in the list: return −1 after ${i} comparison${i === 1 ? "" : "s"}.`, { vars: { i, result: -1 } });
    return { found: null, index: -1, vars: { result: -1 }, extra: ` ${x} isn't in the list.` };
  },

  reverse(r) {
    const kind = r.kind;
    if (kind === "s") {
      let prev = null, curr = r.head;
      r.ptrs = { head: r.head, prev, curr };
      r.snap("init", "prev ← null, curr ← head. Everything before prev is already reversed; everything from curr on is still to do.", { hot: [curr].filter((v) => v != null) });
      while (curr != null) {
        r.snap("walk", "curr isn't null: there is a node left to flip.", { hot: [curr] });
        const next = r.nodes.get(curr).next;
        r.ptrs.next = next;
        r.snap("save", `next ← curr.next (${r.v(next)}). Without this, flipping curr's arrow would lose the rest of the list.`, { hot: [curr] });
        r.nodes.get(curr).next = prev;
        r.snap("flip", `curr.next ← prev: ${r.v(curr)} now points back to ${r.v(prev)}.`, { hot: [curr], hotLinks: [`n${curr}`] });
        prev = curr; curr = next; r.ptrs.prev = prev; r.ptrs.curr = curr;
        r.snap("move", `prev ← ${r.v(prev)}, curr ← ${r.v(curr)}.`, { hot: [prev] });
      }
      r.snap("walk", "curr is null: every arrow has been flipped.");
      r.head = prev; r.ptrs = { head: prev, prev };
      r.snap("head", `head ← prev (${r.v(prev)}): the old last node is the new head. One pass, O(n) time, O(1) extra space.`, { hot: [prev].filter((v) => v != null) });
      return {};
    }
    if (kind === "d") {
      let curr = r.head;
      r.ptrs = { head: r.head, curr };
      r.snap("init", "curr ← head. Reversing a doubly linked list just swaps each node's two pointers.", { hot: [curr].filter((v) => v != null) });
      while (curr != null) {
        r.snap("walk", "curr isn't null.", { hot: [curr] });
        const n = r.nodes.get(curr);
        [n.prev, n.next] = [n.next, n.prev];
        r.snap("swap", `Swap ${n.v}'s prev and next: both arrows turn round.`, { hot: [curr], hotLinks: [`n${curr}`, `p${curr}`] });
        r.head = curr; r.ptrs.head = curr;
        r.snap("head", `head ← ${n.v}.`, { hot: [curr] });
        curr = n.prev; r.ptrs.curr = curr;
        r.snap("move", `curr ← curr.prev (${r.v(curr)}), which is the old next.`, { hot: [curr].filter((v) => v != null) });
      }
      r.snap("walk", `curr is null: done. head = ${r.v(r.head)}.`, { hot: [r.head].filter((v) => v != null) });
      return {};
    }
    r.ptrs = { head: r.head };
    if (r.head == null) { r.snap("empty", "The list is empty."); return {}; }
    let prev = r.head;
    while (r.nodes.get(prev).next !== r.head) prev = r.nodes.get(prev).next;
    let curr = r.head;
    r.ptrs = { head: r.head, prev, curr };
    r.snap("init", `prev starts at the last node (${r.v(prev)}) so the head's arrow can point back to it.`, { hot: [prev] });
    do {
      const next = r.nodes.get(curr).next;
      r.ptrs.next = next;
      r.snap("save", `next ← ${r.v(next)}.`, { hot: [curr] });
      r.nodes.get(curr).next = prev;
      r.snap("flip", `${r.v(curr)}.next ← ${r.v(prev)}.`, { hot: [curr], hotLinks: [`n${curr}`] });
      prev = curr; curr = next; r.ptrs.prev = prev; r.ptrs.curr = curr;
      r.snap("move", `prev ← ${r.v(prev)}, curr ← ${r.v(curr)}.`, { hot: [prev] });
      r.snap("until", curr === r.head ? "curr is back at the head: every arrow has been flipped." : "Not back at the head yet.", { hot: [curr] });
    } while (curr !== r.head);
    r.head = prev; r.ptrs = { head: prev };
    r.snap("head", `head ← prev (${r.v(prev)}).`, { hot: [prev] });
    return {};
  },

  floyd(r) {
    let slow = r.head, fast = r.head, steps = 0;
    r.ptrs = { slow, fast };
    r.snap("init", "The tortoise (slow) moves one node at a time and the hare (fast) two. If there is a loop, the hare laps the tortoise and they must meet.", { hot: [slow].filter((v) => v != null), vars: { steps } });
    const nx = (id) => r.nodes.get(id).next;
    while (fast != null && nx(fast) != null) {
      r.snap("walk", "fast and fast.next aren't null: the hare can take two steps.", { hot: [fast], vars: { steps } });
      slow = nx(slow); r.ptrs.slow = slow; steps++;
      r.snap("slow", `slow → ${r.v(slow)}.`, { hot: [slow], vars: { steps } });
      fast = nx(nx(fast)); r.ptrs.fast = fast;
      r.snap("fast", `fast → ${r.v(fast)} (two steps).`, { hot: [fast].filter((v) => v != null), vars: { steps } });
      if (slow === fast) {
        r.snap("meet", `They meet at ${r.v(slow)} after ${steps} step${steps > 1 ? "s" : ""}: there is a cycle.`, { hot: [slow], meet: slow, vars: { steps } });
        slow = r.head; r.ptrs.slow = slow;
        r.snap("reset", "Now find where the loop starts: put slow back at the head and move both one step at a time. The distance from the head to the loop's start equals the distance from the meeting point to it (going round), so they meet exactly there.", { hot: [slow], vars: { steps } });
        let k = 0;
        while (slow !== fast) {
          slow = nx(slow); fast = nx(fast); k++; r.ptrs.slow = slow; r.ptrs.fast = fast;
          r.snap("find", `slow → ${r.v(slow)}, fast → ${r.v(fast)}.`, { hot: [slow, fast], vars: { steps, k } });
        }
        const pos = r.place.get(slow).x;
        r.snap("found", `They meet at ${r.v(slow)} (position ${pos}): the cycle starts here.`, { hot: [slow], found: slow, vars: { steps, start: r.v(slow) } });
        return { found: slow, cycle: true, meetAfter: steps, startPos: pos, vars: { "cycle start": r.v(slow) }, extra: ` The cycle starts at ${r.v(slow)}.` };
      }
      r.snap("meet", "They haven't met yet.", { vars: { steps } });
    }
    r.snap("walk", fast == null ? "fast is null: the hare ran off the end." : "fast.next is null: the hare is at the last node.", { vars: { steps } });
    r.snap("none", "A list that ends can't have a cycle: return null.", { vars: { steps } });
    return { found: null, cycle: false, vars: { cycle: "none" }, extra: " There is no cycle." };
  },
};

export function parseValues(text) {
  const vals = String(text).split(/[\s,]+|→|->/).filter(Boolean).map(Number);
  if (vals.some((v) => !Number.isInteger(v) || v < -99 || v > 999)) throw new Error("Enter whole numbers from −99 to 999, separated by spaces or commas.");
  if (vals.length > 10) throw new Error("Use at most 10 values so the list fits.");
  return vals;
}
