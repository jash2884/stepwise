// B+ tree with step-by-step snapshots for insert, delete and search.
//
// Conventions (Silberschatz-style, stated in the UI):
// - Order n = the maximum number of children of a node, so a node holds at most n-1 keys.
// - Leaves keep at least ⌈(n-1)/2⌉ keys; internal nodes at least ⌈n/2⌉ children.
// - Leaf split: the left leaf keeps ⌈n/2⌉ keys; the first key of the right leaf is COPIED up.
// - Internal split: the middle key MOVES up (it isn't kept in either half).
// - Every separator equals the smallest key in the subtree to its right.
// - Deletion borrows from the left sibling first, then the right, before merging.

export class BPlusTree {
  constructor(order = 4) {
    if (!Number.isInteger(order) || order < 3 || order > 7) throw new Error("Order must be between 3 and 7.");
    this.order = order;
    this.maxKeys = order - 1;
    this.minLeafKeys = Math.ceil((order - 1) / 2);
    this.minInternalKeys = Math.ceil(order / 2) - 1;
    this.nodes = new Map();
    this.nextId = 1;
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
    return { root: this.root, nodes, highlight, note, ...extra };
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
    while (!n.leaf) {
      const i = n.keys.filter((k) => k <= key).length;
      const why = i === 0 ? `${key} < ${n.keys[0]}` : i === n.keys.length ? `${key} ≥ ${n.keys.at(-1)}` : `${n.keys[i - 1]} ≤ ${key} < ${n.keys[i]}`;
      frames.push(this.snapshot([n.id], `Search: ${why}, so follow child ${i + 1} of [${n.keys.join(", ")}].`, { kind: "path" }));
      n = this.node(n.children[i]);
    }
    return n;
  }

  search(key) {
    const frames = [];
    const leaf = this.routeNotes(key, frames);
    const found = leaf.keys.includes(key);
    frames.push(this.snapshot([leaf.id], found ? `Found ${key} in leaf [${leaf.keys.join(", ")}].` : `${key} is not in leaf [${leaf.keys.join(", ")}], so it isn't in the tree.`, { kind: found ? "found" : "missing" }));
    return { found, frames };
  }

  has(key) { return this.path(key).leaf.keys.includes(key); }

  insert(key) {
    const frames = [];
    if (!Number.isInteger(key) || key < -999 || key > 9999) throw new Error("Keys must be whole numbers between -999 and 9999.");
    if (this.has(key)) {
      frames.push(this.snapshot([], `${key} is already in the tree (keys are unique), so nothing changes.`));
      return frames;
    }
    const leaf = this.routeNotes(key, frames);
    const { path } = this.path(key);
    leaf.keys.push(key);
    leaf.keys.sort((a, b) => a - b);
    if (leaf.keys.length <= this.maxKeys) {
      frames.push(this.snapshot([leaf.id], `Insert ${key} into leaf: [${leaf.keys.join(", ")}]. It fits (max ${this.maxKeys} keys).`, { kind: "changed" }));
      return frames;
    }
    frames.push(this.snapshot([leaf.id], `Insert ${key}: the leaf now has ${leaf.keys.length} keys, more than the maximum ${this.maxKeys}. It must split.`, { kind: "overflow" }));
    const keep = Math.ceil(this.order / 2);
    const right = this.make(true, leaf.keys.splice(keep));
    right.next = leaf.next;
    leaf.next = right.id;
    const sep = right.keys[0];
    this.insertIntoParent(leaf, sep, right, path, frames,
      `Split the leaf into [${leaf.keys.join(", ")}] and [${right.keys.join(", ")}]; COPY ${sep} (the right leaf's first key) up to the parent.`);
    return frames;
  }

  insertIntoParent(left, sep, right, path, frames, note) {
    if (!path.length) {
      const root = this.make(false, [sep], [left.id, right.id]);
      this.root = root.id;
      frames.push(this.snapshot([left.id, right.id, root.id], `${note} There's no parent, so a new root [${sep}] is created and the tree grows one level.`, { kind: "split" }));
      return;
    }
    const parent = path.pop();
    const idx = parent.children.indexOf(left.id);
    parent.keys.splice(idx, 0, sep);
    parent.children.splice(idx + 1, 0, right.id);
    if (parent.keys.length <= this.maxKeys) {
      frames.push(this.snapshot([left.id, right.id, parent.id], `${note} The parent becomes [${parent.keys.join(", ")}].`, { kind: "split" }));
      return;
    }
    frames.push(this.snapshot([left.id, right.id, parent.id], `${note} Now the parent [${parent.keys.join(", ")}] has too many keys and must split too.`, { kind: "overflow" }));
    const mid = Math.ceil((this.order + 1) / 2) - 1;
    const up = parent.keys[mid];
    const sibling = this.make(false, parent.keys.slice(mid + 1), parent.children.slice(mid + 1));
    parent.keys = parent.keys.slice(0, mid);
    parent.children = parent.children.slice(0, mid + 1);
    this.insertIntoParent(parent, up, sibling, path, frames,
      `Split the internal node into [${parent.keys.join(", ")}] and [${sibling.keys.join(", ")}]; MOVE ${up} up (internal splits don't keep the middle key).`);
  }

  delete(key) {
    const frames = [];
    const leaf = this.routeNotes(key, frames);
    const { path } = this.path(key);
    if (!leaf.keys.includes(key)) {
      frames.push(this.snapshot([leaf.id], `${key} isn't in the tree, so there's nothing to delete.`, { kind: "missing" }));
      return frames;
    }
    leaf.keys.splice(leaf.keys.indexOf(key), 1);
    if (!path.length || leaf.keys.length >= this.minLeafKeys) {
      frames.push(this.snapshot([leaf.id], `Delete ${key} from the leaf: [${leaf.keys.join(", ")}]${path.length ? `. Still at least ${this.minLeafKeys} key${this.minLeafKeys === 1 ? "" : "s"}, so no rebalancing.` : "."}`, { kind: "changed" }));
    } else {
      frames.push(this.snapshot([leaf.id], `Delete ${key}: the leaf has ${leaf.keys.length} key${leaf.keys.length === 1 ? "" : "s"}, fewer than the minimum ${this.minLeafKeys}. It underflows.`, { kind: "overflow" }));
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

    if (left && left.keys.length > min) {
      if (node.leaf) {
        node.keys.unshift(left.keys.pop());
        parent.keys[idx - 1] = node.keys[0];
        frames.push(this.snapshot([left.id, node.id, parent.id], `Borrow ${node.keys[0]} from the left sibling; the parent's separator becomes ${parent.keys[idx - 1]}.`, { kind: "changed" }));
      } else {
        node.keys.unshift(parent.keys[idx - 1]);
        node.children.unshift(left.children.pop());
        parent.keys[idx - 1] = left.keys.pop();
        frames.push(this.snapshot([left.id, node.id, parent.id], `Rotate through the parent: ${node.keys[0]} comes down, ${parent.keys[idx - 1]} goes up from the left sibling, and its last child moves across.`, { kind: "changed" }));
      }
      return;
    }
    if (right && right.keys.length > min) {
      if (node.leaf) {
        node.keys.push(right.keys.shift());
        parent.keys[idx] = right.keys[0];
        frames.push(this.snapshot([right.id, node.id, parent.id], `Borrow ${node.keys.at(-1)} from the right sibling; the parent's separator becomes ${parent.keys[idx]}.`, { kind: "changed" }));
      } else {
        node.keys.push(parent.keys[idx]);
        node.children.push(right.children.shift());
        parent.keys[idx] = right.keys.shift();
        frames.push(this.snapshot([right.id, node.id, parent.id], `Rotate through the parent: ${node.keys.at(-1)} comes down, ${parent.keys[idx]} goes up from the right sibling, and its first child moves across.`, { kind: "changed" }));
      }
      return;
    }

    // Neither sibling can spare a key: merge with one of them.
    const [into, from, sepIdx] = left ? [left, node, idx - 1] : [node, right, idx];
    const sep = parent.keys[sepIdx];
    if (node.leaf) {
      into.keys.push(...from.keys);
      into.next = from.next;
      frames.push(this.snapshot([into.id, parent.id], `Neither sibling can spare a key, so merge the leaves into [${into.keys.join(", ")}] and remove separator ${sep} from the parent.`, { kind: "merge" }));
    } else {
      into.keys.push(sep, ...from.keys);
      into.children.push(...from.children);
      frames.push(this.snapshot([into.id, parent.id], `Merge the internal nodes, pulling separator ${sep} down from the parent: [${into.keys.join(", ")}].`, { kind: "merge" }));
    }
    parent.keys.splice(sepIdx, 1);
    parent.children.splice(sepIdx + 1, 1);
    this.nodes.delete(from.id);

    if (parent.id === this.root) {
      if (parent.keys.length === 0) {
        this.root = parent.children[0];
        this.nodes.delete(parent.id);
        frames.push(this.snapshot([this.root], "The root has no keys left, so its only child becomes the new root and the tree shrinks one level.", { kind: "merge" }));
      } else {
        frames.push(this.snapshot([parent.id], `The root is now [${parent.keys.join(", ")}]; a root may have as few as one key.`, { kind: "changed" }));
      }
      return;
    }
    if (parent.keys.length < this.minInternalKeys) {
      frames.push(this.snapshot([parent.id], `Now the internal node [${parent.keys.join(", ")}] has too few children (${parent.children.length} < ${this.minInternalKeys + 1}) and must be fixed too.`, { kind: "overflow" }));
      this.fixUnderflow(parent, path.slice(0, -1), frames);
    } else {
      frames.push(this.snapshot([parent.id], `The parent is now [${parent.keys.join(", ")}], still within limits.`, { kind: "changed" }));
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
      frames.push(this.snapshot(ids, `Update separator${changed.length > 1 ? "s" : ""} ${changed.join(", ")} so each still equals the smallest key to its right.`, { kind: "changed" }));
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
