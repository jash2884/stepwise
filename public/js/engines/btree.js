// B-tree (CLRS, chapter 18) with step-by-step snapshots for insert, delete and search.
//
// Conventions (stated in the UI):
// - Minimum degree t ≥ 2: every node except the root holds between t−1 and 2t−1
//   keys (so between t and 2t children); the root holds 1 to 2t−1 keys.
// - Unlike a B+ tree, every key is stored exactly once, in internal nodes too.
// - Insertion is single-pass top-down: any full node met on the way down is split
//   first, so there is always room to push a median key up.
// - Deletion is single-pass top-down: before descending into a child that has only
//   t−1 keys, top it up (case 3a, borrow through the parent, left sibling first) or
//   merge it with a sibling (case 3b, left sibling first). Deleting from an internal
//   node uses the in-order predecessor (2a), else the successor (2b), else merges (2c).
// - Keys are numbers or single letters (not mixed), and unique.

export const CODE = {
  search: [
    "search(x, k):",
    "  i ← first position with k ≤ keyᵢ(x)",
    "  if keyᵢ(x) = k then found in x",
    "  else if x is a leaf then not found",
    "  else search(cᵢ(x), k)",
  ],
  insert: [
    "insert(k):",
    "  r ← root",
    "  if r is full (2t−1 keys) then",
    "    s ← new empty root above r; splitChild(s, 0)  // the only way the tree grows",
    "  insertNonFull(root, k)",
    "insertNonFull(x, k):",
    "  if x is a leaf then put k into x in order; done",
    "  i ← the child of x where k belongs",
    "  if cᵢ is full then splitChild(x, i); move right if k > the new key",
    "  insertNonFull(cᵢ, k)",
    "splitChild(x, i):  // y = cᵢ(x) has 2t−1 keys",
    "  z ← new node with y's last t−1 keys (and last t children)",
    "  move y's median key up into x  // y keeps its first t−1 keys",
  ],
  delete: [
    "delete(x, k):",
    "  if k is in x and x is a leaf then remove k  // case 1",
    "  else if k is in x (an internal node):",
    "    if child y before k has ≥ t keys: replace k by its predecessor k′; delete(y, k′)  // 2a",
    "    else if child z after k has ≥ t keys: replace k by its successor k′; delete(z, k′)  // 2b",
    "    else merge k and z into y; delete(y, k)  // 2c",
    "  else  // k isn't in x: find the child cᵢ where it belongs",
    "    if cᵢ has only t−1 keys then",
    "      if a sibling has ≥ t keys: rotate a key through x into cᵢ  // 3a",
    "      else merge cᵢ with a sibling, pulling the separator down  // 3b",
    "    delete(cᵢ, k)",
    "if the root has no keys but a child, that child becomes the root",
  ],
};

const show = (keys) => `[${keys.join(" ")}]`;

export class BTree {
  constructor(t = 2) {
    if (!Number.isInteger(t) || t < 2 || t > 4) throw new Error("Minimum degree t must be 2, 3 or 4.");
    this.t = t;
    this.maxKeys = 2 * t - 1;
    this.minKeys = t - 1;
    this.nodes = new Map();
    this.nextId = 1;
    this.op = "insert";
    this.root = this.make(true, []).id;
  }

  make(leaf, keys = [], children = []) {
    const n = { id: this.nextId++, leaf, keys, children };
    this.nodes.set(n.id, n);
    return n;
  }
  node(id) { return this.nodes.get(id); }

  // Build a tree from levels: "P / C G M | T X / A B | D E F | …".
  // Each node with k keys takes the next k + 1 nodes of the level below.
  static fromLevels(t, text) {
    const tree = new BTree(t);
    const levels = String(text).split("/").map((l) => l.split("|").map((n) => parseKeys(n)));
    if (!levels.length || !levels[0].length || levels[0].length !== 1) throw new Error("The first level must be a single root node.");
    tree.nodes.clear();
    tree.nextId = 1;
    let above = levels[0].map((keys) => tree.make(levels.length === 1, keys));
    tree.root = above[0].id;
    for (let d = 1; d < levels.length; d++) {
      const here = levels[d].map((keys) => tree.make(d === levels.length - 1, keys));
      let next = 0;
      for (const p of above) {
        p.children = here.slice(next, next + p.keys.length + 1).map((n) => n.id);
        next += p.keys.length + 1;
        if (p.children.length !== p.keys.length + 1) throw new Error(`Level ${d + 1} has too few nodes: [${p.keys.join(" ")}] needs ${p.keys.length + 1} children.`);
      }
      if (next !== here.length) throw new Error(`Level ${d + 1} has ${here.length - next} node${here.length - next === 1 ? "" : "s"} too many.`);
      above = here;
    }
    const { errors } = tree.check();
    if (errors.length) throw new Error(`That isn't a valid B-tree with t = ${t}: ${errors[0]}.`);
    return tree;
  }

  snapshot(highlight = [], note = "", extra = {}) {
    const nodes = [];
    const walk = (id, depth) => {
      const n = this.node(id);
      nodes.push({ id: n.id, leaf: n.leaf, keys: [...n.keys], children: [...n.children], depth });
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(this.root, 0);
    return { root: this.root, nodes, highlight, note, op: this.op, ...extra, vars: { t: this.t, ...(extra.vars ?? {}) } };
  }

  childIndex(x, k) { return x.keys.filter((key) => key < k).length; }

  has(k) {
    let x = this.node(this.root);
    for (;;) {
      if (x.keys.includes(k)) return true;
      if (x.leaf) return false;
      x = this.node(x.children[this.childIndex(x, k)]);
    }
  }

  search(k) {
    this.op = "search";
    const frames = [];
    let x = this.node(this.root);
    for (;;) {
      const i = this.childIndex(x, k);
      if (x.keys[i] === k) {
        frames.push(this.snapshot([x.id], `${k} is key ${i + 1} of ${show(x.keys)}: found. In a B-tree a search can stop at an internal node, because every key is stored exactly once.`, { kind: "found", line: [2, 3], vars: { k, x: x.keys, i }, keyHot: [k] }));
        return { found: true, frames };
      }
      if (x.leaf) {
        frames.push(this.snapshot([x.id], `${k} isn't in leaf ${show(x.keys)}, and a leaf has no children to try, so ${k} isn't in the tree.`, { kind: "missing", line: [2, 4], vars: { k, x: x.keys, i } }));
        return { found: false, frames };
      }
      frames.push(this.snapshot([x.id], `${k} isn't in ${show(x.keys)}. ${this.why(x, k, i)}, so go down to child ${i + 1}.`, { kind: "path", line: [2, 5], vars: { k, x: x.keys, i } }));
      x = this.node(x.children[i]);
    }
  }

  why(x, k, i) {
    return i === 0 ? `${k} < ${x.keys[0]}` : i === x.keys.length ? `${k} > ${x.keys.at(-1)}` : `${x.keys[i - 1]} < ${k} < ${x.keys[i]}`;
  }

  // --- Insert ---------------------------------------------------------------------
  insert(k) {
    this.op = "insert";
    const frames = [];
    const any = this.node(this.root).keys[0];
    if (any !== undefined && typeof any !== typeof k) throw new Error("Don't mix numbers and letters in one tree.");
    if (this.has(k)) {
      frames.push(this.snapshot([], `${k} is already in the tree (keys are unique), so nothing changes.`, { line: 1, vars: { k } }));
      return frames;
    }
    const r = this.node(this.root);
    if (r.keys.length === this.maxKeys) {
      frames.push(this.snapshot([r.id], `The root ${show(r.keys)} is full (2t−1 = ${this.maxKeys} keys). Split it before going down, so there will be room for anything pushed up.`, { kind: "overflow", line: [2, 3], vars: { k, r: r.keys } }));
      const s = this.make(false, [], [r.id]);
      this.root = s.id;
      this.splitChild(s, 0, frames, { k, line: [4, 11, 12, 13], grow: true });
    }
    this.insertNonFull(this.node(this.root), k, frames);
    return frames;
  }

  splitChild(x, i, frames, { k, line, grow = false }) {
    const y = this.node(x.children[i]), t = this.t;
    const median = y.keys[t - 1];
    const z = this.make(y.leaf, y.keys.slice(t), y.leaf ? [] : y.children.slice(t));
    y.keys = y.keys.slice(0, t - 1);
    if (!y.leaf) y.children = y.children.slice(0, t);
    x.keys.splice(i, 0, median);
    x.children.splice(i + 1, 0, z.id);
    frames.push(this.snapshot([x.id, y.id, z.id], `Split ${show([...y.keys, median, ...z.keys])}: the median ${median} (key t = ${t}) MOVES up into ${grow ? "the new root" : "the parent"}, ${show(y.keys)} stays on the left and ${show(z.keys)} goes right, ${t - 1} key${t === 2 ? "" : "s"} each, the minimum. ${grow ? "The tree is now one level taller, and all leaves are still at the same depth." : `The parent had room because it was split earlier if it was full.`}`,
      { kind: "split", line, vars: { k, median, y: y.keys, z: z.keys, x: x.keys }, keyHot: [median] }));
  }

  insertNonFull(x, k, frames) {
    for (;;) {
      if (x.leaf) {
        x.keys.push(k);
        x.keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        frames.push(this.snapshot([x.id], `${show(x.keys)} is a leaf with room (it can't be full: full nodes were split on the way down), so put ${k} in order: ${show(x.keys)}.`, { kind: "changed", line: [6, 7], vars: { k, x: x.keys }, keyHot: [k] }));
        return;
      }
      let i = this.childIndex(x, k);
      const c = this.node(x.children[i]);
      frames.push(this.snapshot([x.id, c.id], `At ${show(x.keys)}: ${this.why(x, k, i)}, so ${k} belongs in child ${i + 1} ${show(c.keys)}${c.keys.length === this.maxKeys ? `, which is full (${this.maxKeys} keys)` : ""}.`, { kind: "path", line: [6, 8], vars: { k, x: x.keys, i, child: c.keys } }));
      if (c.keys.length === this.maxKeys) {
        this.splitChild(x, i, frames, { k, line: [9, 11, 12, 13] });
        if (k > x.keys[i]) i++;
      }
      x = this.node(x.children[i]);
    }
  }

  // --- Delete ---------------------------------------------------------------------
  delete(k) {
    this.op = "delete";
    const frames = [];
    let x = this.node(this.root);
    if (!x.keys.length) {
      frames.push(this.snapshot([], "The tree is empty, so there's nothing to delete.", { kind: "missing", line: 1, vars: { k } }));
      return frames;
    }
    this.deleteFrom(x, k, frames);
    const r = this.node(this.root);
    if (!r.keys.length && !r.leaf) {
      this.root = r.children[0];
      this.nodes.delete(r.id);
      frames.push(this.snapshot([this.root], "The root has no keys left, so its only child becomes the new root and the tree shrinks one level. This is the only way a B-tree gets shorter.", { kind: "merge", line: 12, vars: { root: this.node(this.root).keys } }));
    }
    return frames;
  }

  maxOf(id) { let n = this.node(id); while (!n.leaf) n = this.node(n.children.at(-1)); return n.keys.at(-1); }
  minOf(id) { let n = this.node(id); while (!n.leaf) n = this.node(n.children[0]); return n.keys[0]; }

  deleteFrom(x, k, frames) {
    const t = this.t;
    for (;;) {
      const i = this.childIndex(x, k);
      if (x.keys[i] === k) {
        if (x.leaf) {
          x.keys.splice(i, 1);
          frames.push(this.snapshot([x.id], `Case 1: ${k} is in leaf ${show([...x.keys.slice(0, i), k, ...x.keys.slice(i)])}, so just remove it: ${show(x.keys)}. ${x.id === this.root ? "The root may hold any number of keys." : `The way down made sure this leaf had at least t = ${t} keys, so it still has at least t−1 = ${t - 1}.`}`,
            { kind: "changed", line: 2, vars: { k, x: x.keys } }));
          return;
        }
        const y = this.node(x.children[i]), z = this.node(x.children[i + 1]);
        if (y.keys.length >= t) {
          const pred = this.maxOf(y.id);
          x.keys[i] = pred;
          frames.push(this.snapshot([x.id, y.id], `Case 2a: ${k} is in internal node ${show(x.keys.map((v, j) => (j === i ? k : v)))}. The child before it, ${show(y.keys)}, has ${y.keys.length} ≥ t = ${t} keys, so replace ${k} by its in-order predecessor ${pred} (the largest key in that subtree) and then delete ${pred} from the subtree.`,
            { kind: "changed", line: [3, 4], vars: { k, x: x.keys, y: y.keys, "k′": pred }, keyHot: [pred] }));
          k = pred; x = y;
          continue;
        }
        if (z.keys.length >= t) {
          const succ = this.minOf(z.id);
          x.keys[i] = succ;
          frames.push(this.snapshot([x.id, z.id], `Case 2b: ${k} is in internal node ${show(x.keys.map((v, j) => (j === i ? k : v)))}. The child before it has only t−1 = ${t - 1} keys, but the child after it, ${show(z.keys)}, has ${z.keys.length}, so replace ${k} by its in-order successor ${succ} (the smallest key in that subtree) and delete ${succ} from there.`,
            { kind: "changed", line: [3, 5], vars: { k, x: x.keys, z: z.keys, "k′": succ }, keyHot: [succ] }));
          k = succ; x = z;
          continue;
        }
        this.merge(x, i);
        frames.push(this.snapshot([x.id, y.id], `Case 2c: ${k} is in an internal node and both children around it have only t−1 = ${t - 1} keys, so merge them with ${k} between them into ${show(y.keys)} (2t−1 = ${2 * t - 1} keys), then delete ${k} from that node.`,
          { kind: "merge", line: [3, 6], vars: { k, x: x.keys, y: y.keys }, keyHot: [k] }));
        x = y;
        continue;
      }
      if (x.leaf) {
        frames.push(this.snapshot([x.id], `${k} isn't in leaf ${show(x.keys)}, so it isn't in the tree. (Any rebalancing on the way down is harmless and stays.)`, { kind: "missing", line: 7, vars: { k, x: x.keys } }));
        return;
      }
      let c = this.node(x.children[i]);
      frames.push(this.snapshot([x.id, c.id], `${k} isn't in ${show(x.keys)}: ${this.why(x, k, i)}, so it can only be in child ${i + 1} ${show(c.keys)}.${c.keys.length === t - 1 ? ` That child has only t−1 = ${t - 1} key${t === 2 ? "" : "s"}: if we went down and deleted there it could underflow, so top it up first.` : ` It has ${c.keys.length} ≥ t keys, so it's safe to go down.`}`,
        { kind: "path", line: [7, 8], vars: { k, x: x.keys, i, child: c.keys } }));
      if (c.keys.length === t - 1) c = this.fixChild(x, i, k, frames);
      x = c;
    }
  }

  // Merge child i, separator i and child i+1 of x into child i.
  merge(x, i) {
    const y = this.node(x.children[i]), z = this.node(x.children[i + 1]);
    y.keys.push(x.keys[i], ...z.keys);
    y.children.push(...z.children);
    x.keys.splice(i, 1);
    x.children.splice(i + 1, 1);
    this.nodes.delete(z.id);
    return y;
  }

  // Child i of x has t−1 keys: give it a t-th key (3a) or merge it (3b).
  fixChild(x, i, k, frames) {
    const t = this.t, c = this.node(x.children[i]);
    const left = i > 0 ? this.node(x.children[i - 1]) : null;
    const right = i < x.children.length - 1 ? this.node(x.children[i + 1]) : null;
    const vars = () => ({ k, x: x.keys, child: c.keys, left: left?.keys ?? null, right: right?.keys ?? null });
    if (left && left.keys.length >= t) {
      const down = x.keys[i - 1], up = left.keys.pop();
      c.keys.unshift(down);
      x.keys[i - 1] = up;
      if (!left.leaf) c.children.unshift(left.children.pop());
      frames.push(this.snapshot([x.id, c.id, left.id], `Case 3a: the left sibling ${show([...left.keys, up])} has ${left.keys.length + 1} ≥ t keys, so rotate: separator ${down} comes down into the child, and ${up} (the sibling's largest key) goes up to replace it${left.leaf ? "" : ", taking its right-most child pointer across with it"}. The child now has ${c.keys.length} keys.`,
        { kind: "changed", line: [8, 9], vars: vars(), keyHot: [down, up] }));
      return c;
    }
    if (right && right.keys.length >= t) {
      const down = x.keys[i], up = right.keys.shift();
      c.keys.push(down);
      x.keys[i] = up;
      if (!right.leaf) c.children.push(right.children.shift());
      frames.push(this.snapshot([x.id, c.id, right.id], `Case 3a: ${left ? "the left sibling has only t−1 keys, but " : ""}the right sibling ${show([up, ...right.keys])} has ${right.keys.length + 1} ≥ t keys, so rotate: separator ${down} comes down into the child, and ${up} (the sibling's smallest key) goes up to replace it${right.leaf ? "" : ", taking its left-most child pointer across"}. The child now has ${c.keys.length} keys.`,
        { kind: "changed", line: [8, 9], vars: vars(), keyHot: [down, up] }));
      return c;
    }
    const j = left ? i - 1 : i;
    const sep = x.keys[j];
    const merged = this.merge(x, j);
    frames.push(this.snapshot([x.id, merged.id], `Case 3b: ${left && right ? "both siblings have" : "the only sibling has"} just t−1 = ${t - 1} key${t === 2 ? "" : "s"}, so merge the child with its ${left ? "left" : "right"} sibling, pulling separator ${sep} down between them: ${show(merged.keys)} (2t−1 = ${2 * t - 1} keys).${x.id === this.root && !x.keys.length ? " The root is now empty; it will be removed at the end." : ""}`,
      { kind: "merge", line: [8, 10], vars: { ...vars(), merged: merged.keys, sep }, keyHot: [sep] }));
    return merged;
  }

  // --- Facts and invariants ----------------------------------------------------------
  facts() {
    let height = 0, nodes = 0;
    const walk = (id, depth) => { const n = this.node(id); nodes++; height = Math.max(height, depth); n.children.forEach((c) => walk(c, depth + 1)); };
    walk(this.root, 1);
    return { root: [...this.node(this.root).keys], height, nodes, keys: this.inorder() };
  }

  inorder() {
    const out = [];
    const walk = (id) => {
      const n = this.node(id);
      if (n.leaf) { out.push(...n.keys); return; }
      n.keys.forEach((k, i) => { walk(n.children[i]); out.push(k); });
      walk(n.children.at(-1));
    };
    walk(this.root);
    return out;
  }

  levels() {
    const rows = [];
    const walk = (id, d) => { const n = this.node(id); (rows[d] ??= []).push(n.keys.join(" ")); n.children.forEach((c) => walk(c, d + 1)); };
    walk(this.root, 0);
    return rows.map((r) => r.join(" | ")).join(" / ");
  }

  check() {
    const errors = [], depths = new Set();
    const walk = (id, lo, hi, depth, isRoot) => {
      const n = this.node(id);
      if (!n) { errors.push(`missing node ${id}`); return; }
      if (n.keys.some((k, i) => i && !(n.keys[i - 1] < k))) errors.push(`keys of [${n.keys.join(" ")}] aren't in increasing order`);
      if (n.keys.some((k) => (lo != null && !(k > lo)) || (hi != null && !(k < hi)))) errors.push(`[${n.keys.join(" ")}] has a key outside its range`);
      if (n.keys.length > this.maxKeys) errors.push(`[${n.keys.join(" ")}] has more than 2t−1 = ${this.maxKeys} keys`);
      if (!isRoot && n.keys.length < this.minKeys) errors.push(`[${n.keys.join(" ")}] has fewer than t−1 = ${this.minKeys} keys`);
      if (isRoot && !n.leaf && !n.keys.length) errors.push("the root has no keys");
      if (n.leaf) { depths.add(depth); if (n.children.length) errors.push("a leaf has children"); return; }
      if (n.children.length !== n.keys.length + 1) errors.push(`[${n.keys.join(" ")}] has the wrong number of children`);
      n.children.forEach((c, i) => walk(c, i ? n.keys[i - 1] : lo, i < n.keys.length ? n.keys[i] : hi, depth + 1, false));
    };
    walk(this.root, null, null, 0, true);
    if (depths.size > 1) errors.push("leaves are at different depths");
    return { errors, keys: this.inorder() };
  }
}

// Numbers, or single letters (as in CLRS's figures), but not a mix.
export function parseKeys(text) {
  const tokens = String(text).trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length > 40) throw new Error("Use at most 40 keys at a time.");
  if (tokens.every((x) => /^-?\d+$/.test(x))) {
    const keys = tokens.map(Number);
    if (keys.some((k) => k < -999 || k > 9999)) throw new Error("Keys must be between -999 and 9999.");
    return keys;
  }
  if (tokens.every((x) => /^[A-Za-z]$/.test(x))) return tokens.map((x) => x.toUpperCase());
  throw new Error("Keys must be whole numbers or single letters (not a mix).");
}

// CLRS 3rd ed., Figure 18.8(a): t = 3.
export const CLRS_18_8 = "P / C G M | T X / A B | D E F | J K L | N O | Q R S | U V | Y Z";
