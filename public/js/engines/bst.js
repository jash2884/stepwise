// Binary search tree with every operation recorded as steps. Nodes keep a
// stable id, so the view can glide them when the tree reshapes. Each step has
// the tree, the pseudocode line, the variables and a note saying why.

export const CODE = {
  insert: [
    "insert(T, k):",
    "  if T.root = nil then T.root ← new node(k); return",
    "  x ← T.root",
    "  loop",
    "    if k = x.key then return  // duplicates are ignored",
    "    if k < x.key then",
    "      if x.left = nil then x.left ← new node(k); return",
    "      x ← x.left",
    "    else",
    "      if x.right = nil then x.right ← new node(k); return",
    "      x ← x.right",
  ],
  search: [
    "search(T, k):",
    "  x ← T.root",
    "  while x ≠ nil and k ≠ x.key",
    "    if k < x.key then x ← x.left",
    "    else x ← x.right",
    "  return x  // nil means k is not in the tree",
  ],
  delete: [
    "delete(T, k):",
    "  z ← search(T, k); if z = nil then return",
    "  if z.left = nil and z.right = nil then",
    "    remove z from its parent  // case 1: a leaf",
    "  else if z has exactly one child c then",
    "    put c in z's place  // case 2: splice z out",
    "  else  // case 3: two children",
    "    s ← minimum(z.right)  // the in-order successor",
    "    z.key ← s.key",
    "    replace s by s.right  // s has no left child",
  ],
  min: ["minimum(T):", "  x ← T.root", "  while x.left ≠ nil", "    x ← x.left", "  return x"],
  max: ["maximum(T):", "  x ← T.root", "  while x.right ≠ nil", "    x ← x.right", "  return x"],
  successor: [
    "successor(T, k):",
    "  x ← T.root; succ ← nil",
    "  while x ≠ nil and x.key ≠ k",
    "    if k < x.key then succ ← x; x ← x.left  // a left turn: x is bigger",
    "    else x ← x.right",
    "  if x = nil then return \"not found\"",
    "  if x.right ≠ nil then",
    "    y ← x.right; while y.left ≠ nil: y ← y.left",
    "    return y  // the smallest key in the right subtree",
    "  return succ  // the last ancestor we went left from",
  ],
  inorder: ["inorder(x):", "  if x = nil then return", "  inorder(x.left)", "  visit(x)", "  inorder(x.right)"],
  preorder: ["preorder(x):", "  if x = nil then return", "  visit(x)", "  preorder(x.left)", "  preorder(x.right)"],
  postorder: ["postorder(x):", "  if x = nil then return", "  postorder(x.left)", "  postorder(x.right)", "  visit(x)"],
  levelorder: [
    "levelOrder(T):",
    "  Q ← [T.root]",
    "  while Q is not empty",
    "    x ← dequeue(Q)",
    "    visit(x)",
    "    if x.left ≠ nil then enqueue(Q, x.left)",
    "    if x.right ≠ nil then enqueue(Q, x.right)",
  ],
  height: ["height(x):", "  if x = nil then return −1  // an empty tree", "  hl ← height(x.left)", "  hr ← height(x.right)", "  return 1 + max(hl, hr)"],
};

export const OPS = [
  { id: "insert", name: "Insert", avg: "O(log n)", worst: "O(n)", why: "Walks one root-to-leaf path; a sorted insert order makes the path n long." },
  { id: "search", name: "Search", avg: "O(log n)", worst: "O(n)", why: "Each comparison discards one subtree." },
  { id: "delete", name: "Delete", avg: "O(log n)", worst: "O(n)", why: "Search, then at most one more walk down to the successor." },
  { id: "min", name: "Min / max", avg: "O(log n)", worst: "O(n)", why: "Keep going left (or right)." },
  { id: "successor", name: "Successor", avg: "O(log n)", worst: "O(n)", why: "Down to the key, then down its right subtree." },
  { id: "traverse", name: "Traversals", avg: "O(n)", worst: "O(n)", why: "Every node is visited once. Recursion needs O(h) stack." },
  { id: "height", name: "Height", avg: "O(n)", worst: "O(n)", why: "Every node reports its height once." },
];

export const clone = (n) => n && { id: n.id, key: n.key, left: clone(n.left), right: clone(n.right) };
export const inorderKeys = (n, out = []) => { if (n) { inorderKeys(n.left, out); out.push(n.key); inorderKeys(n.right, out); } return out; };
export const heightOf = (n) => (n ? 1 + Math.max(heightOf(n.left), heightOf(n.right)) : -1);
export const countOf = (n) => (n ? 1 + countOf(n.left) + countOf(n.right) : 0);
const orderKeys = (n, kind, out = []) => {
  if (!n) return out;
  if (kind === "preorder") out.push(n.key);
  orderKeys(n.left, kind, out);
  if (kind === "inorder") out.push(n.key);
  orderKeys(n.right, kind, out);
  if (kind === "postorder") out.push(n.key);
  return out;
};
export function traversal(root, kind) {
  if (kind !== "levelorder") return orderKeys(root, kind);
  const out = [], q = root ? [root] : [];
  while (q.length) { const x = q.shift(); out.push(x.key); if (x.left) q.push(x.left); if (x.right) q.push(x.right); }
  return out;
}

export class BST {
  constructor() { this.root = null; this.nextId = 0; this.steps = []; }
  node(key) { return { id: this.nextId++, key, left: null, right: null }; }
  snapTree() { return clone(this.root); }
  begin() { this.steps = []; return this.steps; }
  snap(line, note, extra = {}) { this.steps.push({ tree: this.snapTree(), line, note, lit: {}, ...extra }); }
  keys() { return inorderKeys(this.root); }
  height() { return heightOf(this.root); }
  // Replace child c of parent p (or the root) by n.
  replace(p, c, n) { if (!p) this.root = n; else if (p.left === c) p.left = n; else p.right = n; }

  // Walks down from the root, recording a step per node; returns { x, parent, path }.
  descend(k, line, label, varsOf) {
    let x = this.root, parent = null;
    const path = [];
    while (x && x.key !== k) {
      const left = k < x.key;
      path.push(x.id);
      this.snap(line, `${label}: ${k} ${left ? "<" : ">"} ${x.key}, so go ${left ? "left" : "right"}.`, { lit: litPath(path, x.id, "cur"), probe: { at: x.id, value: k }, vars: varsOf(x) });
      parent = x;
      x = left ? x.left : x.right;
    }
    return { x, parent, path };
  }

  insert(k) {
    this.begin();
    const vars = (x, extra) => ({ k, "x.key": x?.key ?? null, ...extra });
    if (!this.root) {
      this.root = this.node(k);
      this.snap(2, `The tree is empty, so ${k} becomes the root.`, { lit: { [this.root.id]: "new" }, vars: vars(this.root), done: true });
      return this.steps;
    }
    let x = this.root;
    const path = [];
    this.snap(3, `Insert ${k}: start at the root, ${x.key}.`, { lit: { [x.id]: "cur" }, probe: { at: x.id, value: k }, vars: vars(x) });
    for (;;) {
      path.push(x.id);
      if (k === x.key) {
        this.snap(5, `${k} is already in the tree. Duplicates are ignored, so nothing changes.`, { lit: litPath(path, x.id, "bad"), probe: { at: x.id, value: k }, vars: vars(x), bad: true });
        return this.steps;
      }
      const left = k < x.key, side = left ? "left" : "right";
      this.snap(left ? 6 : 9, `${k} ${left ? "<" : ">"} ${x.key}, so ${k} belongs in ${x.key}'s ${side} subtree.`, { lit: litPath(path, x.id, "cur"), probe: { at: x.id, value: k, side }, vars: vars(x) });
      if (!x[side]) {
        x[side] = this.node(k);
        this.snap(left ? 7 : 10, `${x.key} has no ${side} child, so ${k} becomes its ${side} child. It took ${path.length} comparison${path.length > 1 ? "s" : ""}.`, { lit: { ...litPath(path, x.id, "path"), [x[side].id]: "new" }, vars: vars(x, { depth: path.length }), done: true });
        return this.steps;
      }
      x = x[side];
      this.snap(left ? 8 : 11, `Move down to ${x.key}.`, { lit: litPath(path, x.id, "cur"), probe: { at: x.id, value: k }, vars: vars(x) });
    }
  }

  search(k) {
    this.begin();
    if (!this.root) { this.snap(2, "The tree is empty, so the search fails at once.", { vars: { k, x: null }, bad: true }); return this.steps; }
    this.snap(2, `Search for ${k}: start at the root, ${this.root.key}.`, { lit: { [this.root.id]: "cur" }, probe: { at: this.root.id, value: k }, vars: { k, "x.key": this.root.key } });
    let x = this.root;
    const path = [];
    while (x && x.key !== k) {
      const left = k < x.key;
      path.push(x.id);
      this.snap(left ? 4 : 5, `${k} ${left ? "<" : ">"} ${x.key}: ${k} can only be in the ${left ? "left" : "right"} subtree, so the other half is ruled out.`, { lit: litPath(path, x.id, "cur"), probe: { at: x.id, value: k }, vars: { k, "x.key": x.key } });
      const next = left ? x.left : x.right;
      if (!next) {
        this.snap(6, `${x.key} has no ${left ? "left" : "right"} child, so x becomes nil: ${k} is not in the tree (${path.length} comparison${path.length > 1 ? "s" : ""}).`, { lit: litPath(path, x.id, "bad"), vars: { k, x: null, comparisons: path.length }, bad: true });
        return this.steps;
      }
      x = next;
    }
    path.push(x.id);
    this.snap(6, `Found ${k} after ${path.length} comparison${path.length > 1 ? "s" : ""}, at depth ${path.length - 1}.`, { lit: litPath(path, x.id, "found"), probe: { at: x.id, value: k }, vars: { k, "x.key": x.key, comparisons: path.length }, done: true });
    return this.steps;
  }

  extreme(kind) {
    this.begin();
    const side = kind === "min" ? "left" : "right";
    if (!this.root) { this.snap(2, "The tree is empty, so there is no " + (kind === "min" ? "minimum." : "maximum."), { vars: {}, bad: true }); return this.steps; }
    let x = this.root;
    const path = [x.id];
    this.snap(2, `Start at the root, ${x.key}. The ${kind === "min" ? "smallest" : "largest"} key is as far ${side} as you can go.`, { lit: { [x.id]: "cur" }, vars: { "x.key": x.key } });
    while (x[side]) {
      this.snap(3, `${x.key} has a ${side} child, so a ${kind === "min" ? "smaller" : "larger"} key exists.`, { lit: litPath(path, x.id, "cur"), vars: { "x.key": x.key } });
      x = x[side];
      path.push(x.id);
      this.snap(4, `Move ${side} to ${x.key}.`, { lit: litPath(path, x.id, "cur"), vars: { "x.key": x.key } });
    }
    this.snap(5, `${x.key} has no ${side} child: it is the ${kind === "min" ? "minimum" : "maximum"}.`, { lit: litPath(path, x.id, "found"), vars: { "x.key": x.key, [kind]: x.key }, done: true });
    return this.steps;
  }

  successor(k) {
    this.begin();
    let x = this.root, succ = null;
    const path = [];
    const v = (extra) => ({ k, "x.key": x?.key ?? null, succ: succ?.key ?? null, ...extra });
    this.snap(2, `Successor of ${k}: the next larger key. Walk down to ${k}, remembering the last node where we turned left.`, { lit: x ? { [x.id]: "cur" } : {}, vars: v() });
    while (x && x.key !== k) {
      path.push(x.id);
      if (k < x.key) {
        succ = x;
        this.snap(4, `${k} < ${x.key}: go left. ${x.key} is bigger than ${k}, so it's the best successor candidate so far.`, { lit: { ...litPath(path, x.id, "cur"), [succ.id]: "succ" }, probe: { at: x.id, value: k }, vars: v() });
        x = x.left;
      } else {
        this.snap(5, `${k} > ${x.key}: go right. ${x.key} is smaller, so it can't be the successor.`, { lit: { ...litPath(path, x.id, "cur"), ...(succ ? { [succ.id]: "succ" } : {}) }, probe: { at: x.id, value: k }, vars: v() });
        x = x.right;
      }
    }
    if (!x) { this.snap(6, `${k} is not in the tree, so it has no successor here.`, { lit: litPath(path, null, "bad"), vars: v(), bad: true }); return this.steps; }
    path.push(x.id);
    if (x.right) {
      let y = x.right;
      const down = [y.id];
      this.snap(7, `Found ${k}. It has a right subtree, so the successor is the smallest key in it: go right once, then left as far as possible.`, { lit: { ...litPath(path, x.id, "found"), [y.id]: "cur" }, vars: v({ "y.key": y.key }) });
      while (y.left) { y = y.left; down.push(y.id); this.snap(8, `Go left to ${y.key}.`, { lit: { ...litPath(path, x.id, "found"), ...litPath(down, y.id, "cur") }, vars: v({ "y.key": y.key }) }); }
      this.snap(9, `${y.key} has no left child, so successor(${k}) = ${y.key}.`, { lit: { [x.id]: "found", [y.id]: "succ" }, vars: v({ "y.key": y.key, successor: y.key }), done: true });
    } else if (succ) {
      this.snap(10, `Found ${k}, with no right subtree. The successor is the last ancestor we went left from: ${succ.key}.`, { lit: { [x.id]: "found", [succ.id]: "succ" }, vars: v({ successor: succ.key }), done: true });
    } else {
      this.snap(10, `Found ${k}, with no right subtree and no left turn on the way down: ${k} is the maximum, so it has no successor.`, { lit: { [x.id]: "found" }, vars: v({ successor: null }), done: true });
    }
    return this.steps;
  }

  delete(k) {
    this.begin();
    const { x: z, parent } = this.descend(k, 2, "Find it", (x) => ({ k, "z.key": x.key }));
    if (!z) { this.snap(2, `${k} is not in the tree, so there is nothing to delete.`, { vars: { k, z: null }, bad: true }); return this.steps; }
    const kids = [z.left, z.right].filter(Boolean);
    this.snap(2, `Found ${k}. It has ${kids.length === 0 ? "no children" : kids.length === 1 ? "one child" : "two children"}.`, { lit: { [z.id]: "bad" }, vars: { k, "z.key": z.key, children: kids.length } });
    if (kids.length === 0) {
      this.snap(3, `Case 1: ${k} is a leaf, so it can simply be removed.`, { lit: { [z.id]: "bad" }, vars: { k, children: 0 } });
      this.replace(parent, z, null);
      this.snap(4, `${k} is gone${parent ? `; ${parent.key}'s ${k < parent.key ? "left" : "right"} pointer is now nil` : " and the tree is empty"}.`, { lit: parent ? { [parent.id]: "path" } : {}, vars: { k }, done: true });
      return this.steps;
    }
    if (kids.length === 1) {
      const c = kids[0];
      this.snap(5, `Case 2: ${k} has one child, ${c.key}. Splice ${k} out and let ${c.key}'s subtree move up into its place. Every key in it is still on the correct side of ${parent ? parent.key : "everything above"}.`, { lit: { [z.id]: "bad", [c.id]: "cur" }, vars: { k, "c.key": c.key } });
      this.replace(parent, z, c);
      this.snap(6, `${c.key} has taken ${k}'s place.`, { lit: { [c.id]: "new" }, vars: { k, "c.key": c.key }, done: true });
      return this.steps;
    }
    this.snap(7, `Case 3: ${k} has two children. Replace it with its in-order successor (the smallest key in its right subtree), which is bigger than everything on the left and smaller than everything else on the right.`, { lit: { [z.id]: "bad" }, vars: { k } });
    let s = z.right, sp = z;
    const down = [s.id];
    this.snap(8, `Go right once, to ${s.key}…`, { lit: { [z.id]: "bad", [s.id]: "cur" }, vars: { k, "s.key": s.key } });
    while (s.left) { sp = s; s = s.left; down.push(s.id); this.snap(8, `…then left as far as possible: ${s.key}.`, { lit: { [z.id]: "bad", ...litPath(down, s.id, "cur") }, vars: { k, "s.key": s.key } }); }
    this.snap(8, `The successor is s = ${s.key}. It has no left child (that's why it's the minimum), so removing it is case 1 or 2.`, { lit: { [z.id]: "bad", [s.id]: "succ" }, vars: { k, "s.key": s.key } });
    const sr = s.right;
    z.key = s.key; z.id = s.id; // s's value now lives in z's slot, so draw it as s moving up
    if (sp === z) z.right = sr; else sp.left = sr;
    this.snap([9, 10], `${s.key} moves up into ${k}'s place${sr ? `, and ${s.key}'s right child ${sr.key} moves up to where ${s.key} was` : ""}. ${k} is deleted and the order is preserved.`, { lit: { [z.id]: "new", ...(sr ? { [sr.id]: "cur" } : {}) }, vars: { k, "z.key": z.key }, done: true });
    return this.steps;
  }

  traverse(kind) {
    this.begin();
    const order = [], stack = [], done = {};
    const base = () => ({ ...done });
    if (kind === "levelorder") {
      if (!this.root) { this.snap(2, "The tree is empty, so nothing is visited.", { visit: [], queue: [], vars: {} }); return this.steps; }
      const q = [this.root];
      const qs = () => q.map((n) => n.key);
      this.snap(2, `Put the root ${this.root.key} in the queue. A queue (first in, first out) visits the tree level by level.`, { visit: [], queue: qs(), lit: { [this.root.id]: "queued" }, vars: { Q: qs() } });
      while (q.length) {
        const x = q.shift();
        const lq = () => Object.fromEntries(q.map((n) => [n.id, "queued"]));
        this.snap(4, `Dequeue ${x.key} from the front.`, { visit: [...order], queue: qs(), lit: { ...base(), ...lq(), [x.id]: "cur" }, vars: { Q: qs(), "x.key": x.key } });
        order.push(x.key); done[x.id] = "done";
        this.snap(5, `Visit ${x.key}.`, { visit: [...order], queue: qs(), lit: { ...base(), ...lq(), [x.id]: "found" }, vars: { Q: qs(), "x.key": x.key, order: [...order] } });
        const added = [x.left, x.right].filter(Boolean);
        if (added.length) {
          q.push(...added);
          this.snap(x.right ? (x.left ? [6, 7] : 7) : 6, `Enqueue ${added.map((n) => n.key).join(" then ")} at the back: ${x.key}'s children wait behind everything already queued.`, { visit: [...order], queue: qs(), lit: { ...base(), ...lq(), [x.id]: "found" }, vars: { Q: qs(), "x.key": x.key } });
        }
      }
      this.snap(3, `The queue is empty: level order is ${order.join(", ")}.`, { visit: order, queue: [], lit: base(), vars: { order }, done: true });
      return this.steps;
    }
    const [visitLine, leftLine, rightLine] = { inorder: [4, 3, 5], preorder: [3, 4, 5], postorder: [5, 3, 4] }[kind];
    const name = kind.replace("order", "-order");
    const st = () => stack.map((n) => n.key);
    const lit = (cur, cls) => ({ ...base(), ...Object.fromEntries(stack.map((n) => [n.id, "queued"])), ...(cur ? { [cur.id]: cls } : {}) });
    const visit = (x) => {
      order.push(x.key); done[x.id] = "done";
      this.snap(visitLine, `Visit ${x.key}. ${name[0].toUpperCase() + name.slice(1)} so far: ${order.join(", ")}.`, { visit: [...order], stack: st(), lit: lit(x, "found"), vars: { "x.key": x.key, stack: st(), order: [...order] } });
    };
    const go = (x) => {
      stack.push(x);
      this.snap(1, `Call ${kind}(${x.key}) and push it on the call stack.`, { visit: [...order], stack: st(), lit: lit(x, "cur"), vars: { "x.key": x.key, stack: st() } });
      for (const [line, act] of [[leftLine, "left"], [rightLine, "right"], [visitLine, "visit"]].sort((a, b) => a[0] - b[0])) {
        if (act === "visit") { visit(x); continue; }
        const c = x[act];
        if (c) {
          this.snap(line, `${x.key} has a ${act} child, so recurse into ${c.key} first.`, { visit: [...order], stack: st(), lit: lit(x, "cur"), vars: { "x.key": x.key, stack: st() } });
          go(c);
        } else {
          this.snap(line, `${x.key} has no ${act} child: ${kind}(nil) returns at once (line 2).`, { visit: [...order], stack: st(), lit: lit(x, "cur"), vars: { "x.key": x.key, stack: st() } });
        }
      }
      stack.pop();
      if (stack.length) this.snap(5, `${kind}(${x.key}) is finished: pop it and return to ${stack.at(-1).key}.`, { visit: [...order], stack: st(), lit: lit(stack.at(-1), "cur"), vars: { "x.key": stack.at(-1).key, stack: st() } });
    };
    if (!this.root) { this.snap(2, "The tree is empty, so nothing is visited.", { visit: [], stack: [], vars: {} }); return this.steps; }
    go(this.root);
    this.snap(null, `Done. ${name[0].toUpperCase() + name.slice(1)}: ${order.join(", ")}.${kind === "inorder" ? " In-order on a BST always gives the keys in sorted order." : ""}`, { visit: order, stack: [], lit: base(), vars: { order }, done: true });
    return this.steps;
  }

  heightSteps() {
    this.begin();
    const hs = {}, stack = [];
    const vars = (x, extra) => ({ "x.key": x.key, stack: stack.map((n) => n.key), ...extra });
    const lit = (x, cls) => ({ ...Object.fromEntries(Object.keys(hs).map((id) => [id, "done"])), ...Object.fromEntries(stack.map((n) => [n.id, "queued"])), [x.id]: cls });
    const go = (x) => {
      if (!x) return -1;
      stack.push(x);
      this.snap(1, `height(${x.key}): first find the heights of both subtrees.`, { heights: { ...hs }, lit: lit(x, "cur"), vars: vars(x) });
      const hl = go(x.left);
      this.snap(3, x.left ? `Back at ${x.key}: its left subtree has height ${hl}.` : `${x.key} has no left child: height(nil) = −1.`, { heights: { ...hs }, lit: lit(x, "cur"), vars: vars(x, { hl }) });
      const hr = go(x.right);
      this.snap(4, x.right ? `Its right subtree has height ${hr}.` : `${x.key} has no right child: height(nil) = −1.`, { heights: { ...hs }, lit: lit(x, "cur"), vars: vars(x, { hl, hr }) });
      hs[x.id] = 1 + Math.max(hl, hr);
      stack.pop();
      this.snap(5, `height(${x.key}) = 1 + max(${hl}, ${hr}) = ${hs[x.id]}.`, { heights: { ...hs }, lit: lit(x, "found"), vars: vars(x, { hl, hr, height: hs[x.id] }) });
      return hs[x.id];
    };
    if (!this.root) { this.snap(2, "The tree is empty: its height is −1.", { vars: { height: -1 }, done: true }); return this.steps; }
    const ht = go(this.root);
    this.snap(null, `The height of the tree is ${ht}: the longest root-to-leaf path has ${ht} edge${ht === 1 ? "" : "s"}. A perfectly balanced tree of ${countOf(this.root)} nodes would have height ${Math.floor(Math.log2(countOf(this.root)))}.`, { heights: hs, vars: { height: ht }, done: true });
    return this.steps;
  }
}

function litPath(path, cur, cls) {
  const lit = Object.fromEntries(path.map((id) => [id, "path"]));
  if (cur != null) lit[cur] = cls;
  return lit;
}

export function buildBst(keys) {
  const t = new BST();
  for (const k of keys) t.insert(k);
  return t;
}
