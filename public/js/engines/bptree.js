// B+ tree with step-by-step snapshots for insert, delete and search.
//
// Conventions (Silberschatz-style, stated in the UI):
// - Order n = the maximum number of children of a node, so a node holds at most n-1 keys.
// - Leaves keep at least ⌈(n-1)/2⌉ keys; internal nodes at least ⌈n/2⌉ children.
// - Leaf split: the left leaf keeps ⌈n/2⌉ keys; the first key of the right leaf is COPIED up.
// - Internal split: the middle key MOVES up (it isn't kept in either half).
// - Every separator equals the smallest key in the subtree to its right.
// - Deletion borrows from the left sibling first, then the right, before merging.
//
// Every frame names the pseudocode it belongs to (`op`), the line(s) being
// executed (`line`) and the variables at that moment (`vars`).

export const CODE = {
  search: [
    "search(K):",
    "  N ← root",
    "  while N is not a leaf",
    "    i ← number of keys in N that are ≤ K",
    "    N ← child i of N  // K ≥ separator goes right",
    "  if K is in N then found else not found",
  ],
  insert: [
    "insert(K):",
    "  L ← the leaf where K belongs (search for K)",
    "  if K is already in L then stop  // keys are unique",
    "  insert K into L in sorted order",
    "  if L has ≤ n−1 keys then done",
    "  split L: L keeps ⌈n/2⌉ keys, new leaf L′ takes the rest",
    "  K′ ← first key of L′  // COPY up: K′ stays in L′",
    "  insertInParent(L, K′, L′)",
    "insertInParent(N, K′, N′):",
    "  if N is the root then new root [N | K′ | N′]; done",
    "  P ← parent(N); put K′ and N′ into P just after N",
    "  if P has ≤ n−1 keys then done",
    "  split P: K″ ← middle key, P′ takes the keys after it",
    "  insertInParent(P, K″, P′)  // MOVE up: K″ leaves both halves",
  ],
  delete: [
    "delete(K):",
    "  L ← the leaf where K belongs; if K isn't in L then stop",
    "  remove K from L",
    "  if L is the root or L has ≥ ⌈(n−1)/2⌉ keys then done",
    "  fix(L)",
    "fix(N):  // N has too few keys",
    "  if the left sibling can spare a key then borrow it",
    "  else if the right sibling can spare a key then borrow it",
    "  else merge N with a sibling; remove their separator from P",
    "    if P is the root and has no keys: its child is the new root",
    "    else if P has too few keys then fix(P)",
    "reset each separator to the smallest key on its right",
  ],
};

export class BPlusTree {
  constructor(order = 4) {
    if (!Number.isInteger(order) || order < 3 || order > 7) throw new Error("Order must be between 3 and 7.");
    this.order = order;
    this.maxKeys = order - 1;
    this.minLeafKeys = Math.ceil((order - 1) / 2);
    this.minInternalKeys = Math.ceil(order / 2) - 1;
    this.nodes = new Map();
    this.nextId = 1;
    this.op = "insert";
    this.root = this.make(true, []).id;
  }

  make(leaf, keys, children = []) {
    const node = { id: this.nextId++, leaf, keys, children, next: null };
    this.nodes.set(node.id, node);
    return node;
  }
  node(id) { return this.nodes.get(id); }

  snapshot(highlight = [], note = "", extra = {}) {
    const nodes = [];
    const walk = (id, depth) => {
      const n = this.node(id);
      nodes.push({ id: n.id, leaf: n.leaf, keys: [...n.keys], children: [...n.children], next: n.next, depth });
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(this.root, 0);
    return { root: this.root, nodes, highlight, note, op: this.op, ...extra, vars: { n: this.order, ...(extra.vars ?? {}) } };
  }

  // Follow separators down: a key ≥ separator goes right.
  path(key) {
    const path = [];
    let n = this.node(this.root);
    while (!n.leaf) {
      path.push(n);
      n = this.node(n.children[n.keys.filter((k) => k <= key).length]);
    }
    return { leaf: n, path };
  }

  routeNotes(key, frames) {
    let n = this.node(this.root);
    const line = { search: [3, 4, 5], insert: 2, delete: 2 }[this.op];
    while (!n.leaf) {
      const i = n.keys.filter((k) => k <= key).length;
      const why = i === 0 ? `${key} < ${n.keys[0]}` : i === n.keys.length ? `${key} ≥ ${n.keys.at(-1)}` : `${n.keys[i - 1]} ≤ ${key} < ${n.keys[i]}`;
      frames.push(this.snapshot([n.id], `Search: ${why}, so follow child ${i + 1} of [${n.keys.join(", ")}]. ${i} key${i === 1 ? " is" : "s are"} ≤ ${key}, and a key equal to a separator always goes right, because each separator is the smallest key of the subtree on its right.`,
        { kind: "path", line, vars: { K: key, N: n.keys, i } }));
      n = this.node(n.children[i]);
    }
    return n;
  }

  search(key) {
    this.op = "search";
    const frames = [];
    const leaf = this.routeNotes(key, frames);
    const found = leaf.keys.includes(key);
    frames.push(this.snapshot([leaf.id], found ? `Found ${key} in leaf [${leaf.keys.join(", ")}]. Every search ends in a leaf, because only the leaves hold the actual keys (and their record pointers).` : `${key} is not in leaf [${leaf.keys.join(", ")}], so it isn't in the tree: this is the only leaf where it could be.`,
      { kind: found ? "found" : "missing", line: 6, vars: { K: key, N: leaf.keys, found } }));
    return { found, frames };
  }

  has(key) { return this.path(key).leaf.keys.includes(key); }

  insert(key) {
    this.op = "insert";
    const frames = [];
    if (!Number.isInteger(key) || key < -999 || key > 9999) throw new Error("Keys must be whole numbers between -999 and 9999.");
    if (this.has(key)) {
      frames.push(this.snapshot([], `${key} is already in the tree (keys are unique), so nothing changes.`, { line: 3, vars: { K: key } }));
      return frames;
    }
    const leaf = this.routeNotes(key, frames);
    const { path } = this.path(key);
    leaf.keys.push(key);
    leaf.keys.sort((a, b) => a - b);
    if (leaf.keys.length <= this.maxKeys) {
      frames.push(this.snapshot([leaf.id], `Insert ${key} into leaf: [${leaf.keys.join(", ")}]. It fits: ${leaf.keys.length} key${leaf.keys.length === 1 ? "" : "s"}, and order ${this.order} allows up to ${this.maxKeys}.`,
        { kind: "changed", line: [4, 5], vars: { K: key, L: leaf.keys, size: leaf.keys.length, max: this.maxKeys }, keyHot: [key] }));
      return frames;
    }
    frames.push(this.snapshot([leaf.id], `Insert ${key}: the leaf now has ${leaf.keys.length} keys, one more than the maximum ${this.maxKeys} for order ${this.order}. A node can't hold that many, so it must split.`,
      { kind: "overflow", line: [4, 5], vars: { K: key, L: leaf.keys, size: leaf.keys.length, max: this.maxKeys }, keyHot: [key] }));
    const keep = Math.ceil(this.order / 2);
    const right = this.make(true, leaf.keys.splice(keep));
    right.next = leaf.next;
    leaf.next = right.id;
    const sep = right.keys[0];
    this.insertIntoParent(leaf, sep, right, path, frames,
      `Split the leaf: the left keeps ⌈${this.order}/2⌉ = ${keep} keys [${leaf.keys.join(", ")}] and the new right leaf takes [${right.keys.join(", ")}]. COPY ${sep} (the right leaf's first key) up to the parent: it stays in the leaf too, because every key must live in a leaf.`,
      { line: [6, 7, 8], vars: { K: key, L: leaf.keys, "L′": right.keys, "K′": sep }, fly: sep });
    return frames;
  }

  insertIntoParent(left, sep, right, path, frames, note, ctx) {
    const lines = [ctx.line].flat();
    if (!path.length) {
      const root = this.make(false, [sep], [left.id, right.id]);
      this.root = root.id;
      frames.push(this.snapshot([left.id, right.id, root.id], `${note} There's no parent, so a new root [${sep}] is created and the tree grows one level taller. (B+ trees only ever grow at the root, which is why every leaf stays at the same depth.)`,
        { kind: "split", line: [...lines, 10], vars: { ...ctx.vars, P: [sep] }, fly: ctx.fly, keyHot: [sep] }));
      return;
    }
    const parent = path.pop();
    const idx = parent.children.indexOf(left.id);
    parent.keys.splice(idx, 0, sep);
    parent.children.splice(idx + 1, 0, right.id);
    if (parent.keys.length <= this.maxKeys) {
      frames.push(this.snapshot([left.id, right.id, parent.id], `${note} The parent becomes [${parent.keys.join(", ")}], which fits (${parent.keys.length} ≤ ${this.maxKeys} keys).`,
        { kind: "split", line: [...lines, 11, 12], vars: { ...ctx.vars, P: parent.keys }, fly: ctx.fly, keyHot: [sep] }));
      return;
    }
    frames.push(this.snapshot([left.id, right.id, parent.id], `${note} Now the parent [${parent.keys.join(", ")}] has ${parent.keys.length} keys, more than ${this.maxKeys}, so it must split too.`,
      { kind: "overflow", line: [...lines, 11, 12], vars: { ...ctx.vars, P: parent.keys }, fly: ctx.fly, keyHot: [sep] }));
    const mid = Math.ceil((this.order + 1) / 2) - 1;
    const up = parent.keys[mid];
    const sibling = this.make(false, parent.keys.slice(mid + 1), parent.children.slice(mid + 1));
    parent.keys = parent.keys.slice(0, mid);
    parent.children = parent.children.slice(0, mid + 1);
    this.insertIntoParent(parent, up, sibling, path, frames,
      `Split the internal node into [${parent.keys.join(", ")}] and [${sibling.keys.join(", ")}] and MOVE the middle key ${up} up. Internal splits don't keep the middle key: the ${parent.children.length + sibling.children.length} child pointers divide ${parent.children.length} | ${sibling.children.length}, and ${up} is the separator between the two halves.`,
      { line: [13, 14], vars: { "K″": up, P: parent.keys, "P′": sibling.keys } });
  }

  delete(key) {
    this.op = "delete";
    const frames = [];
    const leaf = this.routeNotes(key, frames);
    const { path } = this.path(key);
    if (!leaf.keys.includes(key)) {
      frames.push(this.snapshot([leaf.id], `${key} isn't in the tree, so there's nothing to delete.`, { kind: "missing", line: 2, vars: { K: key, L: leaf.keys } }));
      return frames;
    }
    leaf.keys.splice(leaf.keys.indexOf(key), 1);
    const vars = { K: key, L: leaf.keys, size: leaf.keys.length, min: this.minLeafKeys };
    if (!path.length || leaf.keys.length >= this.minLeafKeys) {
      frames.push(this.snapshot([leaf.id], `Delete ${key} from the leaf: [${leaf.keys.join(", ")}]${path.length ? `. Still at least ⌈(${this.order}−1)/2⌉ = ${this.minLeafKeys} key${this.minLeafKeys === 1 ? "" : "s"}, so no rebalancing is needed.` : ". The root leaf may hold any number of keys."}`,
        { kind: "changed", line: [3, 4], vars }));
    } else {
      frames.push(this.snapshot([leaf.id], `Delete ${key}: the leaf has ${leaf.keys.length} key${leaf.keys.length === 1 ? "" : "s"}, fewer than the minimum ⌈(${this.order}−1)/2⌉ = ${this.minLeafKeys}. It underflows: a half-empty node wastes a disk block, so it borrows or merges.`,
        { kind: "overflow", line: [3, 4, 5], vars }));
      this.fixUnderflow(leaf, path, frames);
    }
    this.refreshSeparators(frames);
    return frames;
  }

  fixUnderflow(node, path, frames) {
    const parent = path.at(-1);
    const idx = parent.children.indexOf(node.id);
    const left = idx > 0 ? this.node(parent.children[idx - 1]) : null;
    const right = idx < parent.children.length - 1 ? this.node(parent.children[idx + 1]) : null;
    const min = node.leaf ? this.minLeafKeys : this.minInternalKeys;
    const vars = () => ({ N: node.keys, left: left ? left.keys : null, right: right ? right.keys : null, min, P: parent.keys });

    if (left && left.keys.length > min) {
      if (node.leaf) {
        node.keys.unshift(left.keys.pop());
        parent.keys[idx - 1] = node.keys[0];
        frames.push(this.snapshot([left.id, node.id, parent.id], `The left sibling has ${left.keys.length + 1} keys, more than the minimum ${min}, so it can spare one. Borrow ${node.keys[0]} from the left sibling; the parent's separator becomes ${parent.keys[idx - 1]}, the new smallest key of this leaf.`,
          { kind: "changed", line: 7, vars: vars(), keyHot: [node.keys[0]] }));
      } else {
        node.keys.unshift(parent.keys[idx - 1]);
        node.children.unshift(left.children.pop());
        parent.keys[idx - 1] = left.keys.pop();
        frames.push(this.snapshot([left.id, node.id, parent.id], `The left sibling can spare a key, so rotate through the parent: separator ${node.keys[0]} comes down into this node, ${parent.keys[idx - 1]} goes up from the left sibling, and its last child moves across.`,
          { kind: "changed", line: 7, vars: vars(), keyHot: [node.keys[0], parent.keys[idx - 1]] }));
      }
      return;
    }
    if (right && right.keys.length > min) {
      if (node.leaf) {
        node.keys.push(right.keys.shift());
        parent.keys[idx] = right.keys[0];
        frames.push(this.snapshot([right.id, node.id, parent.id], `${left ? `The left sibling has only ${left.keys.length} key${left.keys.length === 1 ? "" : "s"} (the minimum), but the right` : "There's no left sibling, but the right"} sibling has ${right.keys.length + 1}, so it can spare one. Borrow ${node.keys.at(-1)} from the right sibling; the parent's separator becomes ${parent.keys[idx]}, the right leaf's new first key.`,
          { kind: "changed", line: [7, 8], vars: vars(), keyHot: [node.keys.at(-1)] }));
      } else {
        node.keys.push(parent.keys[idx]);
        node.children.push(right.children.shift());
        parent.keys[idx] = right.keys.shift();
        frames.push(this.snapshot([right.id, node.id, parent.id], `The right sibling can spare a key, so rotate through the parent: separator ${node.keys.at(-1)} comes down, ${parent.keys[idx]} goes up from the right sibling, and its first child moves across.`,
          { kind: "changed", line: [7, 8], vars: vars(), keyHot: [node.keys.at(-1), parent.keys[idx]] }));
      }
      return;
    }

    // Neither sibling can spare a key: merge with one of them.
    const [into, from, sepIdx] = left ? [left, node, idx - 1] : [node, right, idx];
    const sep = parent.keys[sepIdx];
    const sizes = `${into.keys.length} + ${from.keys.length}${node.leaf ? "" : " + 1"}`;
    if (node.leaf) {
      into.keys.push(...from.keys);
      into.next = from.next;
      frames.push(this.snapshot([into.id, parent.id], `Neither sibling can spare a key (each has the minimum), so merge the leaves into [${into.keys.join(", ")}] (${sizes} keys fit in one node) and remove separator ${sep} from the parent.`,
        { kind: "merge", line: [7, 8, 9], vars: { ...vars(), merged: into.keys, sep } }));
    } else {
      into.keys.push(sep, ...from.keys);
      into.children.push(...from.children);
      frames.push(this.snapshot([into.id, parent.id], `Neither sibling can spare a key, so merge the internal nodes, pulling separator ${sep} down from the parent between them: [${into.keys.join(", ")}] (${sizes} keys).`,
        { kind: "merge", line: [7, 8, 9], vars: { ...vars(), merged: into.keys, sep }, keyHot: [sep] }));
    }
    parent.keys.splice(sepIdx, 1);
    parent.children.splice(sepIdx + 1, 1);
    this.nodes.delete(from.id);

    if (parent.id === this.root) {
      if (parent.keys.length === 0) {
        this.root = parent.children[0];
        this.nodes.delete(parent.id);
        frames.push(this.snapshot([this.root], "The root has no keys left, so its only child becomes the new root and the tree shrinks one level.", { kind: "merge", line: 10, vars: { root: this.node(this.root).keys } }));
      } else {
        frames.push(this.snapshot([parent.id], `The root is now [${parent.keys.join(", ")}]; a root may have as few as one key.`, { kind: "changed", line: 10, vars: { P: parent.keys } }));
      }
      return;
    }
    if (parent.keys.length < this.minInternalKeys) {
      frames.push(this.snapshot([parent.id], `Now the internal node [${parent.keys.join(", ")}] has too few children (${parent.children.length} < ⌈${this.order}/2⌉ = ${this.minInternalKeys + 1}) and must be fixed too.`, { kind: "overflow", line: 11, vars: { P: parent.keys, children: parent.children.length } }));
      this.fixUnderflow(parent, path.slice(0, -1), frames);
    } else {
      frames.push(this.snapshot([parent.id], `The parent is now [${parent.keys.join(", ")}], still within limits.`, { kind: "changed", line: 11, vars: { P: parent.keys } }));
    }
  }

  // After a deletion, a separator may name a key that's gone; reset each one to
  // the smallest key of its right subtree.
  refreshSeparators(frames) {
    const changed = [];
    const minOf = (id) => { const n = this.node(id); return n.leaf ? n.keys[0] : minOf(n.children[0]); };
    for (const n of this.nodes.values()) {
      if (n.leaf) continue;
      n.keys.forEach((k, i) => {
        const m = minOf(n.children[i + 1]);
        if (m !== k) { changed.push(`${k}→${m}`); n.keys[i] = m; }
      });
    }
    if (changed.length) {
      const ids = [...this.nodes.values()].filter((n) => !n.leaf).map((n) => n.id);
      frames.push(this.snapshot(ids, `Update separator${changed.length > 1 ? "s" : ""} ${changed.join(", ")} so each still equals the smallest key to its right. (A stale separator would still route correctly, but this convention keeps answers unique.)`, { kind: "changed", line: 12, vars: { changed } }));
    }
  }

  // Shape facts for practice questions and tests.
  facts() {
    const leaves = [];
    let height = 1;
    const walk = (id, depth) => {
      const n = this.node(id);
      height = Math.max(height, depth);
      if (n.leaf) leaves.push(n.keys);
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(this.root, 1);
    return { root: [...this.node(this.root).keys], leaves, height, leafCount: leaves.length };
  }

  // Structural invariants, used by the property tests.
  check() {
    const errors = [];
    const leaves = [];
    const walk = (id, lo, hi, depth, isRoot) => {
      const n = this.node(id);
      if (n.keys.some((k, i) => i && k <= n.keys[i - 1])) errors.push(`node ${id} keys not sorted`);
      if (n.keys.some((k) => (lo != null && k < lo) || (hi != null && k >= hi))) errors.push(`node ${id} key out of range`);
      if (n.keys.length > this.maxKeys) errors.push(`node ${id} overfull`);
      if (n.leaf) {
        if (!isRoot && n.keys.length < this.minLeafKeys) errors.push(`leaf ${id} underfull`);
        leaves.push({ id, depth, keys: n.keys });
        return;
      }
      if (n.children.length !== n.keys.length + 1) errors.push(`node ${id} child count`);
      if (!isRoot && n.keys.length < this.minInternalKeys) errors.push(`internal ${id} underfull`);
      n.children.forEach((c, i) => walk(c, i ? n.keys[i - 1] : lo, i < n.keys.length ? n.keys[i] : hi, depth + 1, false));
    };
    walk(this.root, null, null, 0, true);
    if (new Set(leaves.map((l) => l.depth)).size > 1) errors.push("leaves at different depths");
    for (let i = 0; i < leaves.length - 1; i++) if (this.node(leaves[i].id).next !== leaves[i + 1].id) errors.push("leaf chain broken");
    return { errors, keys: leaves.flatMap((l) => l.keys) };
  }
}

export function parseKeys(text) {
  const keys = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (keys.some((k) => !Number.isInteger(k))) throw new Error("Keys must be whole numbers.");
  if (keys.length > 40) throw new Error("Use at most 40 keys at a time.");
  return keys;
}
