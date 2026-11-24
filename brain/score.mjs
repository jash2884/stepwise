// node brain/score.mjs dev|test|golden [--wrong]
import fs from "node:fs";
import { decode, predict } from "../public/js/ai/local/model.js";
const set = process.argv[2] ?? "dev", wrong = process.argv.includes("--wrong");
const dir = new URL("../public/models/", import.meta.url);
const b = fs.readFileSync(new URL("router.bin", dir));
const m = decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), JSON.parse(fs.readFileSync(new URL("router.json", dir), "utf8")));
let items;
if (set === "golden") items = [...fs.readFileSync(new URL("../scripts/eval-ask.mjs", import.meta.url), "utf8").matchAll(/\{ kind: "(\w+)", tool: "([\w-]+)", (?:q|stem): "((?:[^"\\]|\\.)*)"/g)].map((x) => ({ kind: x[1], tool: x[2], q: JSON.parse(`"${x[3]}"`), also: [] }));
else items = JSON.parse(fs.readFileSync(new URL(`./eval/${set}.json`, import.meta.url), "utf8"));
const rows = items.map((e) => { const p = predict(m, e.q), want = [e.tool ?? "none", ...(e.also ?? [])]; return { ...e, want, top: p.tools.slice(0, 4), ok: want.includes(p.tools[0].slug), ok3: p.tools.slice(0, 3).some((t) => want.includes(t.slug)) }; });
const pct = (a) => a.length ? `${(100 * a.filter((x) => x.ok).length / a.length).toFixed(1)}% (top 3: ${(100 * a.filter((x) => x.ok3).length / a.length).toFixed(1)}%, n=${a.length})` : "n/a";
const inS = rows.filter((x) => x.tool), outS = rows.filter((x) => !x.tool);
console.log(`${set}: in scope ${pct(inS)}`); for (const k of ["typed", "hinglish", "textbook", "concept"]) console.log(`  ${k.padEnd(9)} ${pct(inS.filter((x) => x.kind === k))}`);
if (outS.length) console.log(`  out of scope refused ${outS.filter((x) => x.ok).length}/${outS.length}`);
for (const th of [0.3, 0.5, 0.7, 0.9]) { const a = rows.filter((x) => x.top[0].slug !== "none" && x.top[0].p >= th); console.log(`  confidence >= ${th}: answers ${(100 * a.length / rows.length).toFixed(0)}%, right ${(100 * a.filter((x) => x.ok).length / a.length).toFixed(1)}%`); }
if (wrong) for (const x of rows.filter((y) => !y.ok)) console.log(`  x ${x.want[0]} -> ${x.top[0].slug} ${x.top[0].p.toFixed(2)} | ${x.q.slice(0, 120)}`);
