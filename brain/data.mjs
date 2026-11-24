// Builds training examples { q, tool, intent } from Stepwise's own text:
// engine-made GATE questions, schema examples, tool cards, theory text and
// roadmap outcomes, put through phrasing templates (English and Hinglish) and
// light typing noise. Reads nothing from brain/eval or scripts/eval-ask.mjs.
import fs from "node:fs";
import { TOPICS, generate } from "../public/js/gate-questions.js";
import { SCHEMAS } from "../public/js/ai/tool-schemas.js";
import { TOOLS } from "../public/js/tools.js";
import { ROADMAPS } from "../public/js/roadmaps.js";
import { CARDS } from "../src/ai/ask/tool-cards.js";
import { rng } from "../public/js/ui.js";
import { SYNONYMS, OUT_OF_SCOPE } from "./phrases.mjs";

const r = rng(20261124);
const pick = (a) => a[Math.floor(r() * a.length)];
const SHOW = ["{x}", "show me {x}", "{x} visualiser", "{x} example", "run {x}", "step by step {x}", "visualise {x}", "demo of {x}", "i want to see {x} working", "{x} with an example please", "trace {x}", "animate {x}", "simulate {x}", "{x} dikhao", "{x} ka example dikhao", "{x} karke dikhao", "mujhe {x} step by step dekhna hai", "{x} dry run", "perform {x} on this input", "can you draw {x}"];
const SOLVE = ["solve {x}", "find {x}", "calculate {x}", "what is {x} for this question", "{x} numerical", "how many steps in {x}", "answer for {x}", "compute {x}", "{x} kitna hoga", "{x} nikalo", "{x} ka answer batao", "{x} question gate", "work out {x}"];
const EXPLAIN = ["explain {x}", "what is {x}", "how does {x} work", "why do we need {x}", "why {x}", "difference between {x} and {y}", "{x} vs {y}", "when to use {x}", "advantages of {x}", "intuition behind {x}", "{x} kya hota hai", "{x} kaise kaam karta hai", "{x} samjhao", "{x} kyu use karte hai", "{x} aur {y} mein kya farak hai", "i don't understand {x}", "{x} meaning", "time complexity of {x}", "teach me {x}", "viva question on {x}", "is {x} better than {y}", "what happens in {x}"];
const LEAD = ["", "", "", "", "please ", "bhai ", "sir ", "can you ", "hey ", "i have an exam, ", "quick question: ", "pls "];

function noise(s) {
  if (r() < 0.5) s = s.toLowerCase();
  if (r() < 0.25) s = s.replace(/[?.,:;]/g, "");
  if (r() < 0.22) { // a typo in one longer word
    const w = s.split(" "), i = Math.floor(r() * w.length);
    if (w[i].length > 4 && /^[a-z]+$/i.test(w[i])) {
      const k = 1 + Math.floor(r() * (w[i].length - 2)), c = w[i];
      w[i] = pick([c.slice(0, k) + c.slice(k + 1), c.slice(0, k) + c[k + 1] + c[k] + c.slice(k + 2), c.slice(0, k) + c[k] + c.slice(k)]);
    }
    s = w.join(" ");
  }
  return s;
}

const out = [];
const add = (q, tool, intent, src) => { q = String(q).replace(/\s+/g, " ").trim(); if (q.length > 2) out.push({ q, tool, intent, src }); };
const flat = (blocks) => blocks.map((b) => typeof b === "string" ? b : b.table ? [b.table.head, ...b.table.rows].map((x) => x.join(" ")).join(" ; ") : "").join(" ");
const strings = (s) => [...s.matchAll(/"((?:[^"\\]|\\.){25,400})"|`((?:[^`\\$]|\\.){25,400})`/g)].map((m) => m[1] ?? m[2]).filter((x) => /[a-z]{3,} [a-z]{2,} /i.test(x) && !/[{};]|var\(|class=|px\b/.test(x));

for (const t of TOPICS) for (let seed = 1; seed <= 60; seed++) {
  let q; try { q = generate(t.slug, 500 + seed * 37); } catch { continue; }
  const stem = flat(q.stem), opts = q.options ? ` ${q.options.map((o, i) => `(${"ABCD"[i]}) ${o}`).join(" ")}` : "";
  add(noise(stem + (r() < 0.5 ? opts : "")), t.slug, "solve", "gate");
  if (seed <= 20) { const last = stem.split(/(?<=[.?])\s+/).filter((x) => x.length > 20); if (last.length) add(noise(pick(last)), t.slug, "solve", "gate"); }
}
for (const s of SCHEMAS) for (const ex of s.examples) for (let k = 0; k < 10; k++) add(noise(pick(LEAD) + ex.request), s.slug, /\?|find|how many|what/i.test(ex.request) ? "solve" : "show", "schema");
const viewOf = (t) => { const m = /views\/([\w-]+)\.js/.exec(t.load.toString()); return fs.readFileSync(new URL(`../public/js/views/${m[1]}.js`, import.meta.url), "utf8"); };
for (const t of TOOLS) {
  const card = CARDS.find((c) => c.slug === t.slug), schema = SCHEMAS.find((s) => s.slug === t.slug);
  const names = [t.title, ...(SYNONYMS[t.slug] ?? [])];
  const kw = [...new Set(`${card.keywords}`.split(/\s+/).filter((w) => w.length > 2))];
  for (const [list, intent, n] of [[SHOW, "show", 60], [SOLVE, "solve", 45], [EXPLAIN, "explain", 85]]) for (let k = 0; k < n; k++) {
    const x = pick(names), y = pick(names);
    add(noise(pick(LEAD) + pick(list).replace("{x}", x).replace("{y}", y)), t.slug, intent, "template");
  }
  for (let k = 0; k < 40; k++) add(noise(Array.from({ length: 2 + Math.floor(r() * 4) }, () => pick(kw)).join(" ")), t.slug, pick(["show", "solve", "explain"]), "keywords");
  for (const text of [t.summary, t.description, ...Object.values(schema.answers ?? {})]) for (let k = 0; k < 3; k++) add(noise(pick(LEAD) + text), t.slug, "show", "card");
  for (const line of strings(viewOf(t))) { add(noise(line), t.slug, "explain", "theory"); for (const part of line.split(/(?<=[.;:])\s+/)) if (part.length > 25) add(noise(part), t.slug, "explain", "theory"); }
}
for (const rm of ROADMAPS) for (const st of rm.stages) for (const m of st.modules) if (m.tools.length === 1) for (const o of m.outcomes) for (let k = 0; k < 3; k++) add(noise(pick(LEAD) + o), m.tools[0], "explain", "outcome");
for (const q of OUT_OF_SCOPE) for (let k = 0; k < 8; k++) add(noise(pick(LEAD) + q), "none", "show", "none");

const count = {}; for (const e of out) count[e.src] = (count[e.src] ?? 0) + 1;
console.log(out.length, count);
fs.writeFileSync(new URL("./train.jsonl", import.meta.url), out.map((e) => JSON.stringify(e)).join("\n"));
