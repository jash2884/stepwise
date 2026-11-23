// The command palette's search: pure ranking over tools, roadmaps and pages.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGES, buildIndex, rank, score } from "../public/js/palette.js";
import { ROADMAPS } from "../public/js/roadmaps.js";
import { TOOLS } from "../public/js/tools.js";

const item = (title, kind = "Tool", keywords = "") => ({ title, kind, keywords, href: `/${title}` });

test("an exact title beats a prefix, which beats a word inside the title", () => {
  const items = [item("Shortest paths"), item("Paging"), item("Paging and TLBs")];
  assert.deepEqual(rank("paging", items).map((x) => x.title), ["Paging", "Paging and TLBs"]);
  assert.ok(score("paths", item("Paths")) > score("paths", item("Shortest paths")));
});

test("initials match: bst finds binary search tree first", () => {
  const items = [item("Binary heap"), item("Binary search tree"), item("B-tree")];
  assert.equal(rank("bst", items)[0].title, "Binary search tree");
});

test("letters in order match fuzzily, and non-matches are dropped", () => {
  const items = [item("Deadlock detection"), item("Disk scheduling"), item("Sorting")];
  assert.equal(rank("ddtect", items)[0].title, "Deadlock detection");
  assert.deepEqual(rank("zzz", items), []);
});

test("every word of the query must match", () => {
  const items = [item("LR parsing"), item("LL(1) parsing"), item("Page replacement", "Tool", "fifo lru optimal")];
  assert.equal(rank("lr pars", items)[0].title, "LR parsing");
  assert.deepEqual(rank("lr zebra", items), []);
  assert.deepEqual(rank("lru", items).map((x) => x.title), ["Page replacement"]);
});

test("keywords match whole substrings only, never letter by letter", () => {
  const long = item("Something", "Tool", "a very long description that has every letter of the alphabet in it somewhere");
  assert.equal(score("xyzzy", long), 0);
});

test("an empty query keeps the input order", () => {
  const items = [item("C"), item("A"), item("B")];
  assert.deepEqual(rank("  ", items).map((x) => x.title), ["C", "A", "B"]);
  assert.equal(rank("", items, 2).length, 2);
});

test("ties keep the input order and the limit is respected", () => {
  const items = Array.from({ length: 10 }, (_, i) => item(`Tree ${i}`));
  const out = rank("tree", items, 3);
  assert.deepEqual(out.map((x) => x.title), ["Tree 0", "Tree 1", "Tree 2"]);
});

test("the real index covers every tool, roadmap, stage, module and page", () => {
  const index = buildIndex();
  for (const t of TOOLS) assert.ok(index.some((x) => x.href === `/${t.slug}`), t.slug);
  for (const r of ROADMAPS) {
    assert.ok(index.some((x) => x.href === `/roadmap/${r.id}`), r.id);
    for (const s of r.stages) for (const m of s.modules) assert.ok(index.some((x) => x.href.endsWith(`#${m.id}`)), m.id);
  }
  for (const p of PAGES) assert.ok(index.some((x) => x.href === p.href), p.href);
  for (const path of ["/gate", "/roadmaps", "/progress", "/plan", "/review", "/mistakes", "/mock", "/diagnostic"]) assert.ok(PAGES.some((p) => p.href === path), path);
});

test("real searches land on the right tool", () => {
  const index = buildIndex();
  const first = (q) => rank(q, index)[0];
  assert.equal(first("bst").href, "/binary-search-tree");
  assert.equal(first("bankers").href, "/bankers-algorithm");
  assert.equal(first("subnet").href, "/subnetting");
  assert.equal(first("gate").href, "/gate");
});

test("a weak or question-like search offers to ask the AI", async () => {
  const { askItem } = await import("../public/js/palette.js");
  const items = buildIndex();
  assert.equal(askItem("bst", rank("bst", items)), null);
  const ai = askItem("why does SJF starve long jobs?", rank("why does SJF starve long jobs?", items));
  assert.equal(ai.kind, "Ask");
  assert.equal(ai.href, "/ask?q=why%20does%20SJF%20starve%20long%20jobs%3F");
  assert.ok(askItem("zzzz", []));
  assert.equal(askItem("  ", []), null);
});
