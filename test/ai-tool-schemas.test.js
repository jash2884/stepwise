// The AI tool-schema registry: every schema names a real tool, every param is
// one the view actually reads, and every example validates through the engine
// and produces a URL the view's parser accepts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMAS, check, coerce } from "../public/js/ai/tool-schemas.js";
import { TOOLS } from "../public/js/tools.js";

const root = new URL("../public/js/", import.meta.url).pathname;
const viewFile = (t) => join(root, "views", `${/views\/([\w-]+)\.js/.exec(t.load.toString())[1]}.js`);

// Every key the view (or the local modules it imports, engines included, since
// some engines have a fromParams()) reads: .get("x"), .has("x"), or a one-line
// reader helper the views define, such as num("x", 4) or q("x", 1).
const readKeys = new Map();
const READ = /(?:\.get|\.has|\bnum|\bint|\bq|\bg)\(\s*["']([\w.-]+)["']\s*[,)]/g;
function keysRead(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return new Set();
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const keys = new Set([...src.matchAll(READ)].map((m) => m[1]));
  for (const m of src.matchAll(/from\s+["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    for (const k of keysRead(join(dirname(file), m[1]), seen)) keys.add(k);
  }
  return keys;
}
// Views that read keys from a table in a loop (p.get(q.key) for each of a
// problem's params): the table is the source of truth.
const TABLES = {
  "dynamic-programming": async () => Object.values((await import("../public/js/engines/dp.js")).PROBLEMS).flatMap((p) => p.params.map((q) => q.key)),
  aptitude: async () => Object.values((await import("../public/js/engines/aptitude.js")).TOPICS).flatMap((t) => Object.values(t.variants).flatMap((v) => v.params.map(([k]) => k))),
  "io-dma": async () => Object.keys((await import("../public/js/engines/io.js")).toParams({})),
  probability: async () => Object.values((await import("../public/js/engines/probability.js")).DISTS).flatMap((d) => d.params.map(([k]) => k)),
};
for (const [slug, keys] of Object.entries(TABLES)) TABLES[slug] = await keys();
const viewKeys = (t) => {
  const f = viewFile(t);
  if (!readKeys.has(f)) readKeys.set(f, new Set([...keysRead(f), ...(TABLES[t.slug] ?? [])]));
  return readKeys.get(f);
};

test("schemas are unique and name real tools", () => {
  const seen = new Set();
  for (const s of SCHEMAS) {
    assert.ok(!seen.has(s.slug), `duplicate schema ${s.slug}`);
    seen.add(s.slug);
    assert.ok(TOOLS.some((t) => t.slug === s.slug), `${s.slug}: no such tool`);
  }
});

test("every schema param is one the view reads", () => {
  for (const s of SCHEMAS) {
    const keys = viewKeys(TOOLS.find((t) => t.slug === s.slug));
    for (const [k, d] of Object.entries(s.params)) {
      assert.ok(keys.has(k), `${s.slug}: the view never reads "${k}"`);
      assert.ok(["int", "number", "enum", "string", "bool"].includes(d.type), `${s.slug}.${k}: bad type ${d.type}`);
      assert.ok(d.desc, `${s.slug}.${k}: needs a desc`);
      if (d.type === "enum") assert.ok(d.values?.length, `${s.slug}.${k}: enum needs values`);
    }
  }
});

test("every example validates through the engine and gives a URL the view accepts", () => {
  for (const s of SCHEMAS) {
    assert.ok(s.examples.length >= 1 && s.examples.length <= 3, `${s.slug}: 1 to 3 examples`);
    const keys = viewKeys(TOOLS.find((t) => t.slug === s.slug));
    for (const ex of s.examples) {
      const where = `${s.slug}: "${ex.request}"`;
      assert.ok(ex.request.length > 5, where);
      const r = check(s, ex.params);
      assert.ok(r.ok, `${where}: ${r.error}`);
      assert.ok(r.answer.text.length > 0, where);
      for (const v of Object.values(r.answer.values)) assert.ok(["number", "string", "boolean"].includes(typeof v), `${where}: answer values must be scalars`);
      const url = new URL(r.url, "https://stepwise.test");
      assert.equal(url.pathname, `/${s.slug}`, where);
      for (const k of url.searchParams.keys()) assert.ok(keys.has(k), `${where}: URL key ${k} is not read by the view`);
      // Round trip: the URL's own params validate to the same answer.
      const again = check(s, Object.fromEntries(url.searchParams));
      assert.ok(again.ok, `${where}: URL params fail: ${again.error}`);
      assert.deepEqual(again.answer, r.answer, `${where}: URL round trip changes the answer`);
    }
    // Defaults alone must validate too (that's what the view shows with no params).
    const d = check(s, {});
    assert.ok(d.ok || Object.values(s.params).some((p) => p.required), `${s.slug}: defaults fail: ${d.error}`);
  }
});

test("bad inputs are caught with a message, never thrown", () => {
  for (const s of SCHEMAS) {
    const firstString = Object.entries(s.params).find(([, d]) => d.type === "string");
    if (firstString) {
      const r = check(s, { ...s.examples[0].params, [firstString[0]]: "@@ ?? not valid ))" });
      assert.equal(typeof r.ok, "boolean", s.slug);
      if (!r.ok) assert.ok(r.error.length > 0, s.slug);
    }
    const firstNum = Object.entries(s.params).find(([, d]) => d.type === "int" && d.max !== undefined);
    if (firstNum) {
      const r = check(s, { ...s.examples[0].params, [firstNum[0]]: firstNum[1].max + 1 });
      assert.equal(r.ok, false, `${s.slug}.${firstNum[0]} above max should fail`);
    }
  }
});

test("coerce types and ranges", () => {
  const s = SCHEMAS.find((x) => x.slug === "page-replacement");
  assert.deepEqual(coerce(s, { f: "4", algo: "FIFO" }).url, { f: "4", algo: "fifo" });
  assert.match(coerce(s, { f: 2.5 }).error, /whole number/);
  assert.match(coerce(s, { algo: "random" }).error, /one of/);
  assert.equal(check(s, { r: "1 2 3 4 1 2 5 1 2 3 4 5", f: 3, algo: "fifo" }).answer.values.faults, 9);
});

test("every tool has a schema", () => {
  const missing = TOOLS.filter((t) => !SCHEMAS.some((s) => s.slug === t.slug)).map((t) => t.slug);
  assert.deepEqual(missing, []);
});

test("schema text has no em or en dashes", () => {
  const dir = join(root, "ai", "schemas");
  for (const f of readdirSync(dir)) assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), /[–—]/, f);
});
