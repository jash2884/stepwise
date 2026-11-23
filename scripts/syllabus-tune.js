// Tunes and scores syllabus matching on the labelled set in
// test/fixtures/syllabus-labelled.js, against a running Worker:
//   npx --yes wrangler@4 dev --port 8833      (Workers AI runs remotely)
//   node scripts/syllabus-tune.js [http://localhost:8833]
// Prints precision and recall for embedding-only thresholds, then runs the
// full pipeline (with the LLM verifier) at the thresholds in src/ai/syllabus.ts.
// Add --no-verify to skip the full run.
//
// Results (bge-m3, Llama 3.3 70B verifier, 143 topics: 110 that Stepwise
// teaches, 33 it doesn't), 2026-11-23:
//   catalogue text = title + outcomes + tool summaries; topic = "name (course)"
//   best candidate right 95/110, a right one in the top 3 101/110
//   embedding only: t 0.60 → P 95.8% R 62.7%; t 0.625 → P 100% R 46.4%
//   right best-candidate similarity ≥ 0.508; wrong ones ≤ 0.606
//   so accept ≥ 0.61, verify 0.50 to 0.61, reject below 0.50:
//   full pipeline P 98.0%, R 89.1% (two runs alike), 33/33 untaught topics left unmatched
// Rejected variants: catalogue title only (best right 68/109), title and text
// with the max (79/109), topic name without the course (P 93.5% R 90.5% at
// 0.625/0.47, more false accepts such as "Lock-based protocols" → sliding window).
import { ROADMAPS } from "../public/js/roadmaps.js";
import { TOOLS } from "../public/js/tools.js";
import { buildCatalogue } from "../public/js/syllabus/catalogue.js";
import { LABELLED, LABELLED_FLAT } from "../test/fixtures/syllabus-labelled.js";
import { THRESHOLDS } from "../src/ai/syllabus.ts";

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:8833";
const entries = new Map(buildCatalogue(ROADMAPS, TOOLS).map((e) => [e.id, e]));
const COURSES = { os: "Operating Systems", dbms: "Database Management Systems", cn: "Computer Networks", dsa: "Data Structures and Algorithms", toc: "Theory of Computation", coa: "Computer Organisation and Architecture" };
const label = new Map(LABELLED_FLAT.map((x) => [x.topic, x.ok]));
const positives = LABELLED_FLAT.filter((x) => x.ok.length).length;
const right = (topic, id) => (entries.get(id)?.tools ?? []).some((t) => label.get(topic).includes(t));

// One request per course, as a real syllabus would arrive (the course name is
// part of what gets embedded). Waits and retries if the rate limiter says no.
async function call(verify) {
  const out = [];
  for (const [subject, list] of Object.entries(LABELLED)) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base}/api/ai/syllabus`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course: COURSES[subject], units: [{ title: COURSES[subject], topics: list.map(([name]) => name) }], verify }) });
      const data = await res.json();
      if (res.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 20000)); continue; }
      if (!res.ok) throw new Error(`${res.status} ${data.error}`);
      out.push(...data.units.flatMap((u) => u.topics));
      break;
    }
  }
  return out;
}

function score(predictions) {
  let tp = 0, predicted = 0;
  for (const { topic, id } of predictions) if (id) { predicted++; if (right(topic, id)) tp++; }
  return { precision: predicted ? tp / predicted : 1, recall: tp / positives, predicted, tp };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const topics = await call(false);
console.log(`${topics.length} topics, ${positives} with a right answer in Stepwise, ${topics.length - positives} without.\n`);
// How good is the best candidate at all, and how often is a right one in the top 3?
const top1 = topics.filter((t) => label.get(t.name)?.length && right(t.name, t.candidates[0].id)).length;
const top3 = topics.filter((t) => label.get(t.name)?.length && t.candidates.some((c) => right(t.name, c.id))).length;
console.log(`Best candidate right: ${top1}/${positives}; a right one in the top 3: ${top3}/${positives}.\n`);
console.log("Embedding only (accept the best candidate at or above t):");
console.log("   t     precision  recall   accepted");
for (let t = 0.4; t <= 0.801; t += 0.025) {
  const s = score(topics.map((x) => ({ topic: x.name, id: x.candidates[0].score >= t ? x.candidates[0].id : null })));
  console.log(`  ${t.toFixed(3)}   ${pct(s.precision).padStart(6)}   ${pct(s.recall).padStart(6)}   ${s.predicted}`);
}
// Similarities of the best candidate for right and wrong cases, to place the band.
const rightScores = topics.filter((t) => label.get(t.name)?.length && right(t.name, t.candidates[0].id)).map((t) => t.candidates[0].score).sort();
const wrongScores = topics.filter((t) => !(label.get(t.name)?.length && right(t.name, t.candidates[0].id))).map((t) => t.candidates[0].score).sort();
const q = (a, p) => a[Math.floor((a.length - 1) * p)]?.toFixed(3);
console.log(`\nBest-candidate similarity when right: min ${q(rightScores, 0)}, 10% ${q(rightScores, 0.1)}, median ${q(rightScores, 0.5)}`);
console.log(`Best-candidate similarity when wrong: median ${q(wrongScores, 0.5)}, 90% ${q(wrongScores, 0.9)}, max ${q(wrongScores, 1)}`);

if (!process.argv.includes("--no-verify")) {
  console.log(`\nFull pipeline at accept ${THRESHOLDS.accept}, reject ${THRESHOLDS.reject} (borderline pairs go to the verifier):`);
  const full = await call(true);
  const s = score(full.map((x) => ({ topic: x.name, id: x.match?.id ?? null })));
  const viaVerifier = full.filter((x) => x.match?.via === "verifier");
  console.log(`  precision ${pct(s.precision)}, recall ${pct(s.recall)} (${s.tp} right of ${s.predicted} matched; ${viaVerifier.length} accepted by the verifier)`);
  const none = full.filter((x) => !label.get(x.name)?.length);
  console.log(`  topics Stepwise doesn't teach left unmatched: ${none.filter((x) => !x.match).length}/${none.length}`);
  for (const x of full) {
    const ok = label.get(x.name);
    const good = x.match ? right(x.name, x.match.id) : !ok.length;
    if (!good) console.log(`  ✗ ${x.name} → ${x.match ? `${entries.get(x.match.id).title} (${x.match.score}, ${x.match.via}${x.match.reason ? `: ${x.match.reason}` : ""})` : `none (best ${x.candidates[0].id} ${x.candidates[0].score})`}`);
  }
}
