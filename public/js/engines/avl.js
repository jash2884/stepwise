// AVL tree: a BST that rebalances itself with rotations. Insert and delete are
// recorded step by step, including the retrace back up the path where every
// balance factor is checked and LL, RR, LR or RL rotations fix any ±2.
import { BST, heightOf } from "./bst.js";

const ROTATIONS = [
  "rotateRight(y):",
  "  x ← y.left; T2 ← x.right",
  "  x.right ← y; y.left ← T2",
  "  update y.height, then x.height; return x",
  "rotateLeft(x):",
  "  y ← x.right; T2 ← y.left",
  "  y.left ← x; x.right ← T2",
  "  update x.height, then y.height; return y",
];

export const CODE = {
  insert: [
    "insert(x, k):  // returns the new root of this subtree",
    "  if x = nil then return new node(k)",
    "  if k < x.key then x.left ← insert(x.left, k)",
    "  else if k > x.key then x.right ← insert(x.right, k)",
    "  else return x  // duplicates are ignored",
    "  x.height ← 1 + max(h(x.left), h(x.right))",
    "  bf ← h(x.left) − h(x.right)",
    "  if bf > 1 and k < x.left.key then return rotateRight(x)  // LL",
    "  if bf < −1 and k > x.right.key then return rotateLeft(x)  // RR",
    "  if bf > 1 and k > x.left.key then  // LR",
    "    x.left ← rotateLeft(x.left); return rotateRight(x)",
    "  if bf < −1 and k < x.right.key then  // RL",
    "    x.right ← rotateRight(x.right); return rotateLeft(x)",
    "  return x",
    ...ROTATIONS,
  ],
  delete: [
    "delete(x, k):  // returns the new root of this subtree",
    "  if x = nil then return nil  // k is not in the tree",
    "  if k < x.key then x.left ← delete(x.left, k)",
    "  else if k > x.key then x.right ← delete(x.right, k)",
    "  else if x has at most one child then return that child (or nil)",
    "  else  // two children: use the in-order successor",
    "    s ← minimum(x.right); x.key ← s.key; x.right ← delete(x.right, s.key)",
    "  x.height ← 1 + max(h(x.left), h(x.right)); bf ← h(x.left) − h(x.right)",
    "  if bf > 1 then  // left-heavy",
    "    if bf(x.left) ≥ 0 then return rotateRight(x)  // LL",
    "    x.left ← rotateLeft(x.left); return rotateRight(x)  // LR",
    "  if bf < −1 then  // right-heavy",
    "    if bf(x.right) ≤ 0 then return rotateLeft(x)  // RR",
    "    x.right ← rotateRight(x.right); return rotateLeft(x)  // RL",
    "  return x",
    ...ROTATIONS,
  ],
};
const ROT = { insert: { right: 15, left: 19 }, delete: { right: 16, left: 20 } };

export const OPS = [
  { id: "search", name: "Search", avg: "O(log n)", worst: "O(log n)", why: "The height is always below 1.44 log₂(n + 2)." },
  { id: "insert", name: "Insert", avg: "O(log n)", worst: "O(log n)", why: "One path down, one path back up; at most one (single or double) rotation." },
  { id: "delete", name: "Delete", avg: "O(log n)", worst: "O(log n)", why: "One path down and back; may rotate at every level on the way up." },
  { id: "rotate", name: "One rotation", avg: "O(1)", worst: "O(1)", why: "Three pointers change, whatever the size of the subtrees." },
];

const ht = (n) => (n ? n.h : -1);
const fix = (n) => { n.h = 1 + Math.max(ht(n.left), ht(n.right)); };
const bf = (n) => ht(n.left) - ht(n.right);
const num = (v) => (v < 0 ? `−${-v}` : String(v));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

export class AVL extends BST {
  node(key) { return { ...super.node(key), h: 0 }; }

  // Rotate the subtree at y (whose parent is p) and record the glide.
  rotate(y, p, dir, op, why) {
    const x = dir === "right" ? y.left : y.right;
    const inner = dir === "right" ? x.right : x.left;
    const base = ROT[op][dir];
    if (dir === "right") { y.left = inner; x.right = y; } else { y.right = inner; x.left = y; }
    this.replace(p, y, x);
    fix(y); fix(x);
    this.snap([base + 1, base + 2], `rotate${dir === "right" ? "Right" : "Left"}(${y.key}): ${x.key} rises into ${y.key}'s place and ${y.key} drops to become its ${dir} child.${inner ? ` ${x.key}'s ${dir === "right" ? "right" : "left"} subtree (${inner.key}) moves across to be ${y.key}'s ${dir === "right" ? "left" : "right"} child: it was between ${dir === "right" ? `${x.key} and ${y.key}` : `${y.key} and ${x.key}`}, and still is.` : ""} ${why}`,
      { lit: { [x.id]: "rot", [y.id]: "rot", ...(inner ? { [inner.id]: "cur" } : {}) }, vars: { y: y.key, x: x.key, T2: inner?.key ?? null } });
    return x;
  }

  // Walk back up the path, fixing heights and rotating where |bf| > 1.
  retrace(path, op, k) {
    const L = op === "insert" ? { h: 6, bf: 7 } : { h: 8, bf: 8 };
    for (let i = path.length - 1; i >= 0; i--) {
      const x = path[i], p = path[i - 1] ?? null, old = x.h;
      fix(x);
      const b = bf(x);
      const vars = { "x.key": x.key, "h(left)": ht(x.left), "h(right)": ht(x.right), height: x.h, bf: b };
      this.snap(L.bf, `Back at ${x.key}: height ${old === x.h ? "stays" : "becomes"} ${x.h}, balance factor = ${num(ht(x.left))} − ${num(ht(x.right))} = ${sgn(b)}.${Math.abs(b) <= 1 ? " That's within ±1, so no rotation here." : " That's outside ±1: this node is unbalanced."}`,
        { lit: { [x.id]: Math.abs(b) > 1 ? "bad" : "cur" }, vars });
      if (Math.abs(b) <= 1) continue;
      const heavy = b > 1 ? "left" : "right", c = x[heavy], cb = bf(c);
      // On insert the case follows from where k went; on delete from the child's bf (0 counts as the single-rotation case).
      const outer = op === "insert" ? (heavy === "left" ? k < c.key : k > c.key) : heavy === "left" ? cb >= 0 : cb <= 0;
      const kase = heavy === "left" ? (outer ? "LL" : "LR") : outer ? "RR" : "RL";
      const lines = op === "insert" ? { LL: 8, RR: 9, LR: 10, RL: 12 } : { LL: 10, LR: 11, RR: 13, RL: 14 };
      const why = op === "insert"
        ? `${k} went into the ${outer ? heavy : heavy === "left" ? "right" : "left"} subtree of its ${heavy} child ${c.key}`
        : `${x.key}'s ${heavy} child ${c.key} has balance factor ${sgn(cb)}`;
      const fixText = outer ? `one ${heavy === "left" ? "right" : "left"} rotation at ${x.key}` : `two rotations: first ${heavy === "left" ? "left" : "right"} at ${c.key} to turn it into the ${heavy === "left" ? "LL" : "RR"} shape, then ${heavy === "left" ? "right" : "left"} at ${x.key}`;
      this.snap(lines[kase], `${kase} case: ${x.key} is ${heavy}-heavy (bf ${sgn(b)}) and ${why}${op === "insert" ? "" : outer ? `, which leans the same way${cb === 0 ? " or not at all" : ""}` : ", which leans the other way"}. Fix: ${fixText}.`,
        { lit: { [x.id]: "bad", [c.id]: "cur" }, vars: { ...vars, case: kase, [`bf(${heavy} child)`]: cb } });
      if (outer) {
        this.rotate(x, p, heavy === "left" ? "right" : "left", op, `The subtree is balanced again.`);
      } else {
        x[heavy] = this.rotate(c, x, heavy === "left" ? "left" : "right", op, `Now it's the simple ${heavy === "left" ? "LL" : "RR"} shape.`);
        this.rotate(x, p, heavy === "left" ? "right" : "left", op, "Both rotations done: the subtree is balanced again.");
      }
    }
  }

  insert(k) {
    this.begin();
    const path = [];
    let x = this.root;
    while (x) {
      if (k === x.key) {
        this.snap(5, `${k} is already in the tree. Duplicates are ignored.`, { lit: { [x.id]: "bad" }, probe: { at: x.id, value: k }, vars: { k, "x.key": x.key }, bad: true });
        return this.steps;
      }
      const left = k < x.key;
      path.push(x);
      this.snap(left ? 3 : 4, `${k} ${left ? "<" : ">"} ${x.key}: insert into the ${left ? "left" : "right"} subtree.`, { lit: { ...Object.fromEntries(path.map((n) => [n.id, "path"])), [x.id]: "cur" }, probe: { at: x.id, value: k }, vars: { k, "x.key": x.key } });
      x = left ? x.left : x.right;
    }
    const n = this.node(k);
    const p = path.at(-1);
    if (!p) this.root = n; else if (k < p.key) p.left = n; else p.right = n;
    this.snap(2, `Reached nil: ${k} goes here as a new leaf with height 0 and balance factor 0. Now return back up the path, checking every ancestor.`, { lit: { ...Object.fromEntries(path.map((m) => [m.id, "path"])), [n.id]: "new" }, vars: { k, height: 0, bf: 0 } });
    this.retrace(path, "insert", k);
    this.snap(14, `Done. Every node's balance factor is −1, 0 or +1, and the height is ${heightOf(this.root)}.`, { vars: { k, height: heightOf(this.root) }, done: true });
    return this.steps;
  }

  delete(k) {
    this.begin();
    const path = [];
    let x = this.root;
    while (x && x.key !== k) {
      const left = k < x.key;
      path.push(x);
      this.snap(left ? 3 : 4, `${k} ${left ? "<" : ">"} ${x.key}: delete from the ${left ? "left" : "right"} subtree.`, { lit: { ...Object.fromEntries(path.map((n) => [n.id, "path"])), [x.id]: "cur" }, probe: { at: x.id, value: k }, vars: { k, "x.key": x.key } });
      x = left ? x.left : x.right;
    }
    if (!x) { this.snap(2, `${k} is not in the tree, so nothing changes.`, { vars: { k }, bad: true }); return this.steps; }
    const p = path.at(-1) ?? null;
    if (!x.left || !x.right) {
      const c = x.left ?? x.right;
      this.snap(5, `Found ${k}. It has ${c ? `one child, ${c.key}, which takes its place` : "no children, so it is simply removed"}.`, { lit: { [x.id]: "bad", ...(c ? { [c.id]: "cur" } : {}) }, vars: { k, child: c?.key ?? null } });
      this.replace(p, x, c);
      this.snap(5, `${k} is gone. Now walk back up and rebalance.`, { lit: c ? { [c.id]: "new" } : {}, vars: { k } });
    } else {
      path.push(x);
      let s = x.right, sp = x;
      while (s.left) { path.push(s); sp = s; s = s.left; }
      this.snap(7, `Found ${k} with two children. Its in-order successor is ${s.key} (the smallest key in its right subtree): ${s.key} takes ${k}'s place, then ${s.key} is deleted from below.`, { lit: { [x.id]: "bad", [s.id]: "succ" }, vars: { k, "s.key": s.key } });
      const sr = s.right;
      x.key = s.key; x.id = s.id;
      if (sp === x) x.right = sr; else sp.left = sr;
      this.snap(7, `${s.key} moves up${sr ? ` and its right child ${sr.key} takes its old place` : ""}. Now walk back up from where ${s.key} was removed.`, { lit: { [x.id]: "new" }, vars: { k, "x.key": x.key } });
    }
    this.retrace(path, "delete", k);
    this.snap(15, `Done. Every node's balance factor is −1, 0 or +1, and the height is ${heightOf(this.root)}.`, { vars: { k, height: heightOf(this.root) }, done: true });
    return this.steps;
  }

  // For the invariant tests: stored heights match and every |bf| ≤ 1.
  check() {
    const walk = (n) => {
      if (!n) return -1;
      const l = walk(n.left), r = walk(n.right);
      if (n.h !== 1 + Math.max(l, r)) throw new Error(`height of ${n.key} is ${n.h}, should be ${1 + Math.max(l, r)}`);
      if (Math.abs(l - r) > 1) throw new Error(`${n.key} is unbalanced (${l} vs ${r})`);
      return n.h;
    };
    return walk(this.root);
  }
}

// Which rotation case the next insert triggers (for practice), or null.
export function rotationCase(keys, k) {
  const t = new AVL();
  for (const v of keys) t.insert(v);
  return t.insert(k).find((s) => s.vars?.case)?.vars.case ?? null;
}

export function buildAvl(keys) {
  const t = new AVL();
  for (const k of keys) t.insert(k);
  return t;
}
