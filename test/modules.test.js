// Every browser module must parse, and every view/engine must import cleanly in
// Node (views only touch the DOM inside render()), so a stray bracket or a bad
// import path fails CI instead of the live site.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { TOOLS } from "../public/js/tools.js";

const dir = new URL("../public/js/", import.meta.url).pathname;
const files = ["", "views/", "engines/"].flatMap((d) => readdirSync(dir + d).filter((f) => f.endsWith(".js")).map((f) => d + f));

test("every module is valid JavaScript", () => {
  for (const f of files) execFileSync(process.execPath, ["--check", dir + f]);
});

test("every engine and view module imports and every tool has a render()", async () => {
  for (const f of files.filter((x) => x.startsWith("engines/"))) await import(dir + f);
  for (const t of TOOLS) {
    const view = await t.load();
    assert.equal(typeof view.render, "function", `${t.slug} must export render()`);
  }
});

test("tool registry is well-formed", () => {
  const slugs = TOOLS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const t of TOOLS) {
    assert.match(t.slug, /^[a-z0-9-]+$/);
    assert.ok(t.title && t.summary && t.description.length <= 170, t.slug);
  }
});
