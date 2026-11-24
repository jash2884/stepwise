// How often the on-device reader reads a question, and how often the engine's answer then matches.
import fs from "node:fs";
import { TOPICS, generate } from "../public/js/gate-questions.js";
import { SCHEMA_BY_SLUG, check } from "../public/js/ai/tool-schemas.js";
import { READABLE, read } from "../public/js/ai/local/parse.js";
const flat = (b) => b.map((x) => typeof x === "string" ? x : [x.table.head, ...x.table.rows].map((r) => r.join(" ")).join(" ; ")).join(" ");
let T = 0, R = 0, W = 0;
for (const slug of READABLE) {
  if (!TOPICS.some((t) => t.slug === slug)) continue;
  let n = 0, got = 0, wrong = 0, ex = "";
  for (let s = 1; s <= 60; s++) { let q; try { q = generate(slug, s * 101); } catch { continue; }
    n++; const r = read(slug, flat(q.stem)); if (!r) continue;
    const sch = SCHEMA_BY_SLUG.get(slug), mine = check(sch, r.params), gold = check(sch, Object.fromEntries(new URLSearchParams(q.replay.split("#")[0].split("?")[1])));
    if (!mine.ok) continue; got++;
    const keys = Object.keys(mine.answer.values), differs = gold.ok && keys.some((k) => k in gold.answer.values && String(gold.answer.values[k]) !== String(mine.answer.values[k]));
    if (differs) { wrong++; ex ||= `${JSON.stringify(r.params).slice(0, 110)} vs ${q.replay.slice(0, 110)}`; } }
  T += n; R += got; W += wrong; console.log(slug.padEnd(24), `read ${got}/${n}`, wrong ? `DIFFERENT ${wrong}  ${ex}` : "");
}
console.log("generators: read", R, "of", T, "| engine result differs", W);
const src = fs.readFileSync(new URL("../scripts/eval-ask.mjs", import.meta.url), "utf8"); let ok = 0, bad = 0, none = 0;
for (const m of src.matchAll(/\{ kind: "(?:\w+)", tool: "([\w-]+)", (?:q|stem): "((?:[^"\\]|\\.)*)".*?ask: "([\w.]+)", gold: (\{.*?\}) \}/g)) { const q = JSON.parse(`"${m[2]}"`), gold = check(SCHEMA_BY_SLUG.get(m[1]), eval(`(${m[4]})`)), r = read(m[1], q), mine = r && check(SCHEMA_BY_SLUG.get(m[1]), r.params); if (!mine?.ok) { none++; console.log("  unread:", q.slice(0, 120)); } else if (String(mine.answer.values[m[3]]) === String(gold.answer.values[m[3]])) ok++; else { bad++; console.log("  WRONG:", q.slice(0, 120), JSON.stringify(r.params)); } }
console.log(`golden: right ${ok}, wrong ${bad}, declined ${none}`);
