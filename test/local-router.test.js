// The on-device router and reader: size, accuracy floors, and never a wrong
// engine result on the generators it can read.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { decode, predict } from "../public/js/ai/local/model.js";
import { READABLE, hasData, read } from "../public/js/ai/local/parse.js";
import { SCHEMA_BY_SLUG, check } from "../public/js/ai/tool-schemas.js";
import { TOPICS, generate } from "../public/js/gate-questions.js";
import { TOOLS } from "../public/js/tools.js";
import { N, SHAPES } from "../public/js/eye.js";
import { SUBJECTS } from "../public/js/tools.js";

const at = (p) => new URL(`../${p}`, import.meta.url);
const bin = fs.readFileSync(at("public/models/router.bin")), meta = JSON.parse(fs.readFileSync(at("public/models/router.json"), "utf8"));
const m = decode(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), meta);

test("the model is small and knows every tool", () => {
  assert.ok(bin.length < 2.5e6);
  for (const t of TOOLS) assert.ok(meta.labels.includes(t.slug), `${t.slug} is new: rerun node brain/data.mjs && node brain/train.mjs`);
});

test("it routes unseen questions and keeps its accuracy floor", () => {
  const items = JSON.parse(fs.readFileSync(at("brain/eval/test.json"), "utf8")).filter((e) => e.tool);
  const ok = items.filter((e) => [e.tool, ...(e.also ?? [])].includes(predict(m, e.q).tools[0].slug)).length;
  assert.ok(ok / items.length >= 0.92, `${ok}/${items.length}`);
});

test("whatever it reads, the engine agrees with the question's own inputs", () => {
  const flat = (b) => b.map((x) => typeof x === "string" ? x : [x.table.head, ...x.table.rows].map((r) => r.join(" ")).join(" ; ")).join(" ");
  let reads = 0;
  for (const slug of READABLE.filter((s) => TOPICS.some((t) => t.slug === s))) for (let s = 1; s <= 40; s++) {
    const q = generate(slug, s * 57), r = read(slug, flat(q.stem)); if (!r) continue;
    const sch = SCHEMA_BY_SLUG.get(slug), mine = check(sch, r.params); if (!mine.ok) continue;
    const gold = check(sch, Object.fromEntries(new URLSearchParams(q.replay.split("#")[0].split("?")[1])));
    reads++;
    for (const k of Object.keys(mine.answer.values)) if (gold.ok && k in gold.answer.values) assert.equal(String(mine.answer.values[k]), String(gold.answer.values[k]), `${slug} ${q.replay}`);
  }
  assert.ok(reads > 250, `${reads} questions read`);
});

test("it declines when a number is left over", () => {
  assert.equal(read("page-replacement", "LRU with 3 frames on 7 0 1 2 0 3 0 4, and the TLB has 16 entries"), null);
  assert.equal(read("cpu-scheduling", "Round robin for P1 arrives 0 burst 5, P2 arrives 1 burst 3"), null, "no quantum given");
  assert.ok(hasData("LRU on 7 0 1 2") && !hasData("why does SJF starve long jobs"));
});

test("every subject has a 3D figure with sane blocks", () => {
  for (const s of SUBJECTS) assert.ok(SHAPES[s.id], s.id);
  for (const [k, f] of Object.entries(SHAPES)) for (let i = 0; i < (k === "eye" ? N : 640); i++) { const a = f(i); assert.equal(a.length, 9); assert.ok(a.every(Number.isFinite), `${k} ${i}`); }
});
