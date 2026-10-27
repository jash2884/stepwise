// Trie (prefix tree) over lowercase letters, with every move recorded. A node's
// id is the prefix it spells, so the same node keeps its place between steps.

export const CODE = {
  insert: [
    "insert(word):",
    "  x ← root",
    "  for each letter c of word",
    "    if x.child[c] = nil then x.child[c] ← new node",
    "    x ← x.child[c]",
    "  x.isEnd ← true  // mark that a word ends here",
  ],
  search: [
    "search(word):",
    "  x ← root",
    "  for each letter c of word",
    "    if x.child[c] = nil then return false",
    "    x ← x.child[c]",
    "  return x.isEnd  // the path alone isn't enough",
  ],
  prefix: [
    "startsWith(p):",
    "  x ← root",
    "  for each letter c of p",
    "    if x.child[c] = nil then return false",
    "    x ← x.child[c]",
    "  return true  // some word continues from here",
  ],
  complete: [
    "autocomplete(p):",
    "  x ← root",
    "  for each letter c of p",
    "    if x.child[c] = nil then return []",
    "    x ← x.child[c]",
    "  out ← []; collect(x, p, out); return out",
    "collect(x, s, out):",
    "  if x.isEnd then out.append(s)",
    "  for each child c of x, from a to z",
    "    collect(x.child[c], s + c, out)",
  ],
  delete: [
    "delete(word):",
    "  walk down from the root along word",
    "  if the path is missing or not x.isEnd then return",
    "  x.isEnd ← false",
    "  while x ≠ root and x has no children and not x.isEnd",
    "    remove x from its parent; x ← parent",
  ],
};

export const OPS = [
  { id: "insert", name: "Insert", avg: "O(L)", worst: "O(L)", why: "One step per letter of the word, however many words are stored." },
  { id: "search", name: "Search", avg: "O(L)", worst: "O(L)", why: "Follow one edge per letter, then check the end mark." },
  { id: "prefix", name: "Starts with", avg: "O(L)", worst: "O(L)", why: "Same walk, no end check." },
  { id: "complete", name: "Autocomplete", avg: "O(L + k)", worst: "O(L + k)", why: "Walk the prefix, then visit the k nodes below it." },
  { id: "delete", name: "Delete", avg: "O(L)", worst: "O(L)", why: "Walk down, unmark, prune back up." },
  { id: "space", name: "Space", avg: "O(total letters)", worst: "O(Σ · total letters)", why: "Shared prefixes are stored once; each node may hold Σ child pointers." },
];

const node = () => ({ end: false, kids: new Map() });

export class Trie {
  constructor() { this.root = node(); this.steps = []; }
  snapTree() {
    const walk = (n, prefix) => ({ id: prefix, end: n.end, kids: [...n.kids.keys()].sort().map((c) => walk(n.kids.get(c), prefix + c)) });
    return walk(this.root, "");
  }
  snap(line, note, extra = {}) { this.steps.push({ tree: this.snapTree(), line, note, lit: {}, ...extra }); }
  words() {
    const out = [];
    const walk = (n, s) => { if (n.end) out.push(s); for (const c of [...n.kids.keys()].sort()) walk(n.kids.get(c), s + c); };
    walk(this.root, "");
    return out;
  }
  size() { let k = 0; const walk = (n) => { k++; n.kids.forEach(walk); }; walk(this.root); return k; }
  has(w) { let x = this.root; for (const c of w) { x = x.kids.get(c); if (!x) return false; } return x.end; }
  hasPrefix(p) { let x = this.root; for (const c of p) { x = x.kids.get(c); if (!x) return false; } return true; }

  // The shared walk of search / startsWith / autocomplete. Returns the node or null.
  walk(word, kind) {
    let x = this.root, s = "";
    const path = () => Object.fromEntries([...Array(s.length + 1)].map((_, i) => [s.slice(0, i), "path"]));
    this.snap(2, `Start at the root (the empty prefix).`, { lit: { "": "cur" }, vars: { [kind === "search" ? "word" : "p"]: word, i: 0, prefix: "" }, typed: 0, word });
    for (let i = 0; i < word.length; i++) {
      const c = word[i], next = x.kids.get(c);
      if (!next) {
        this.snap(4, `${s ? `"${s}"` : "The root"} has no '${c}' child, so no stored word ${kind === "search" ? "is" : "starts with"} "${s + c}": return ${kind === "complete" ? "[]" : "false"}.`, { lit: { ...path(), [s]: "bad" }, vars: { c, i, prefix: s }, typed: i, word, bad: true });
        return null;
      }
      x = next; s += c;
      this.snap(5, `Follow the '${c}' edge to "${s}".`, { lit: { ...path(), [s]: "cur" }, vars: { c, i, prefix: s }, typed: i + 1, word });
    }
    return x;
  }

  insert(word) {
    this.steps = [];
    let x = this.root, s = "", made = 0;
    const path = () => Object.fromEntries([...Array(s.length + 1)].map((_, i) => [s.slice(0, i), "path"]));
    this.snap(2, `Insert "${word}": start at the root.`, { lit: { "": "cur" }, vars: { word, prefix: "" }, typed: 0, word });
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      if (!x.kids.has(c)) {
        x.kids.set(c, node()); made++;
        this.snap(4, `"${s || "root"}" has no '${c}' child yet, so create a node for "${s + c}".`, { lit: { ...path(), [s + c]: "new" }, vars: { c, i, prefix: s, created: made }, typed: i, word });
      } else {
        this.snap(4, `"${s || "root"}" already has a '${c}' child: the prefix "${s + c}" is shared with a word already stored.`, { lit: { ...path(), [s + c]: "cmp" }, vars: { c, i, prefix: s, created: made }, typed: i, word });
      }
      x = x.kids.get(c); s += c;
      this.snap(5, `Move down to "${s}".`, { lit: { ...path(), [s]: "cur" }, vars: { c, i, prefix: s, created: made }, typed: i + 1, word });
    }
    const was = x.end;
    x.end = true;
    this.snap(6, was ? `"${word}" was already stored: the end mark was already set, so nothing changes.` : `Mark "${word}" as the end of a word (the double ring). ${made ? `${made} new node${made > 1 ? "s" : ""} created; ${word.length - made} letter${word.length - made === 1 ? "" : "s"} reused an existing path.` : "Every letter reused an existing path: only the end mark is new."}`,
      { lit: { ...path(), [s]: was ? "bad" : "found" }, vars: { word, created: made, nodes: this.size() }, typed: word.length, word, done: !was, bad: was });
    return this.steps;
  }

  search(word, kind = "search") {
    this.steps = [];
    const x = this.walk(word, kind);
    if (!x) return this.steps;
    const lit = Object.fromEntries([...Array(word.length + 1)].map((_, i) => [word.slice(0, i), "path"]));
    if (kind === "prefix") {
      this.snap(6, `The whole prefix "${word}" is a path in the trie, so at least one stored word starts with it: true.`, { lit: { ...lit, [word]: "found" }, vars: { p: word, result: true }, typed: word.length, word, done: true });
    } else {
      this.snap(6, x.end ? `The path exists and "${word}" is marked as the end of a word: found.` : `The path exists, but "${word}" isn't marked as the end of a word. It's only a prefix of longer words, so search returns false.`,
        { lit: { ...lit, [word]: x.end ? "found" : "bad" }, vars: { word, "x.isEnd": x.end, result: x.end }, typed: word.length, word, done: x.end, bad: !x.end });
    }
    return this.steps;
  }

  complete(p) {
    this.steps = [];
    const x = this.walk(p, "complete");
    if (!x) return this.steps;
    const out = [], stack = [];
    this.snap(6, `"${p || "root"}" exists. Now collect every word below it, depth first, children in alphabetical order.`, { lit: { [p]: "found" }, vars: { p, out: [] }, typed: p.length, word: p, found: [] });
    const go = (n, s) => {
      stack.push(s);
      const lit = () => ({ ...Object.fromEntries(stack.map((q) => [q, "path"])), [s]: "cur", ...Object.fromEntries(out.map((w) => [w, "found"])) });
      if (n.end) { out.push(s); this.snap(8, `"${s}" is marked as a word: add it. out = [${out.join(", ")}].`, { lit: lit(), vars: { s, out: [...out] }, typed: p.length, word: s, found: [...out], stack: [...stack] }); }
      else this.snap(7, `Visit "${s}": not the end of a word.`, { lit: lit(), vars: { s, out: [...out] }, typed: p.length, word: s, found: [...out], stack: [...stack] });
      for (const c of [...n.kids.keys()].sort()) go(n.kids.get(c), s + c);
      stack.pop();
    };
    go(x, p);
    this.snap(null, out.length ? `${out.length} suggestion${out.length > 1 ? "s" : ""} for "${p}": ${out.join(", ")}.` : `No stored words start with "${p}".`, { lit: Object.fromEntries(out.map((w) => [w, "found"])), vars: { p, out }, typed: p.length, word: p, found: out, done: true });
    return this.steps;
  }

  delete(word) {
    this.steps = [];
    const chain = [this.root];
    let s = "";
    this.snap(2, `Delete "${word}": first walk down its path.`, { lit: { "": "cur" }, vars: { word }, typed: 0, word });
    for (const c of word) {
      const next = chain.at(-1).kids.get(c);
      if (!next) { this.snap(3, `There is no '${c}' edge after "${s}", so "${word}" isn't stored: nothing to delete.`, { lit: { [s]: "bad" }, vars: { word }, bad: true, typed: s.length, word }); return this.steps; }
      chain.push(next); s += c;
      this.snap(2, `Follow '${c}' to "${s}".`, { lit: { [s]: "cur" }, vars: { word, prefix: s }, typed: s.length, word });
    }
    const x = chain.at(-1);
    if (!x.end) { this.snap(3, `"${word}" is only a prefix, not a stored word: nothing to delete.`, { lit: { [s]: "bad" }, vars: { word, "x.isEnd": false }, bad: true, typed: s.length, word }); return this.steps; }
    x.end = false;
    this.snap(4, `Clear the end mark on "${word}". It's no longer a word, but its node may still be needed by other words.`, { lit: { [s]: "cur" }, vars: { word, "x.isEnd": false }, typed: s.length, word });
    let removed = 0;
    for (let i = chain.length - 1; i > 0; i--) {
      const n = chain[i], pre = word.slice(0, i);
      if (n.kids.size || n.end) {
        this.snap(5, `"${pre}" ${n.end ? "is itself a stored word" : `still leads to other words (${[...n.kids.keys()].join(", ")})`}, so it stays. Stop pruning.`, { lit: { [pre]: "found" }, vars: { word, x: pre, removed }, typed: i, word });
        break;
      }
      this.snap(5, `"${pre}" has no children and isn't a word, so it's useless: remove it.`, { lit: { [pre]: "bad" }, vars: { word, x: pre, removed }, typed: i, word });
      chain[i - 1].kids.delete(word[i - 1]); removed++;
      this.snap(6, `Removed "${pre}"; move up to "${word.slice(0, i - 1) || "root"}".`, { lit: { [word.slice(0, i - 1)]: "cur" }, vars: { word, x: word.slice(0, i - 1), removed }, typed: i - 1, word });
    }
    this.snap(null, `"${word}" is deleted; ${removed} node${removed === 1 ? "" : "s"} pruned. The trie now has ${this.size()} nodes.`, { vars: { word, removed, nodes: this.size() }, done: true, typed: 0, word });
    return this.steps;
  }
}

export function parseWords(text) {
  const words = String(text).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.some((w) => !/^[a-z]+$/.test(w))) throw new Error("Use words made of the letters a to z only.");
  if (words.some((w) => w.length > 12)) throw new Error("Keep words to 12 letters or fewer.");
  if (words.length > 16) throw new Error("Use at most 16 words so the trie stays readable.");
  return words;
}

// Nodes in a trie holding these words (the root plus one node per distinct prefix).
export const nodeCount = (words) => new Set([""].concat(...words.map((w) => [...Array(w.length + 1)].map((_, i) => w.slice(0, i))))).size;
