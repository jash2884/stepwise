// Syllabus to roadmap: extraction JSON repair and validation, de-duplication,
// threshold and verifier logic (fake model, fake embeddings), roadmap assembly
// against the real catalogue, and resolving personal roadmaps on the client.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  askJson, catalogueVectors, chunkText, decide, dedupeTopics, extract, matchUnits, mergeUnits, normaliseName,
  parseVerdicts, repairJson, runSyllabus, THRESHOLDS, topicKey, topK, validateExtraction,
} from "../src/ai/syllabus.ts";
import { ROADMAPS, roadmapOf, localRoadmaps, allRoadmaps } from "../public/js/roadmaps.js";
import { TOOLS } from "../public/js/tools.js";
import { TOPICS as GATE_TOPICS } from "../public/js/gate-questions.js";
import { buildCatalogue } from "../public/js/syllabus/catalogue.js";
import { applyRematch, assembleRoadmap, gfgSearch, rematchBody, removeTopic, renameTopic, sanitiseLocal } from "../public/js/syllabus/assemble.js";
import { linesOf, pagesToText } from "../public/js/syllabus/pdf.js";
import { empty, migrate, save, saveRoadmap, deleteRoadmap } from "../public/js/learn/store.js";
import { buildPlan } from "../public/js/learn/planner.js";
import { parse } from "../public/js/views/roadmap.js";
import { CATALOGUE_FILE, catalogueSource } from "../scripts/syllabus-catalogue.js";

const ENTRIES = buildCatalogue(ROADMAPS, TOOLS);
const slugs = new Set(TOOLS.map((t) => t.slug));
const gateSlugs = new Set(GATE_TOPICS.map((t) => t.slug));

// --- Fakes -----------------------------------------------------------------------

// A model that answers from a queue of replies (strings), recording prompts.
function fakeModel(replies) {
  const calls = [];
  return { calls, generate: async (req) => { calls.push(req); const r = replies.shift(); if (r instanceof Error) throw r; return { text: typeof r === "function" ? r(req) : r, model: "fake" }; } };
}
// Embeddings from a word list: each text becomes a bag-of-keywords vector, so
// similar wording gives high cosine similarity and unrelated wording zero.
const VOCAB = ["paging", "memory", "deadlock", "banker", "scheduling", "cpu", "sql", "join", "tree", "sort", "linux", "kernel"];
const fakeEmbed = (texts) => texts.map((t) => VOCAB.map((w) => (t.toLowerCase().includes(w) ? 1 : 0)).concat([0.05]));
const FAKE_CATALOGUE = [
  { id: "m:os.memory", title: "Memory management and paging", text: "Memory management and paging memory" },
  { id: "m:os.deadlock", title: "Deadlocks", text: "Deadlocks banker deadlock" },
  { id: "m:os.scheduling", title: "CPU scheduling", text: "CPU scheduling cpu" },
  { id: "t:sql-joins", title: "SQL joins", text: "SQL joins sql join" },
];

// --- Extraction --------------------------------------------------------------------

test("names are normalised and keyed so duplicates are spotted", () => {
  assert.equal(normaliseName("  3.2  paging; "), "Paging");
  assert.equal(normaliseName("Unit III: memory management"), "Memory management");
  assert.equal(normaliseName("• Deadlock avoidance (contd.)"), "Deadlock avoidance");
  assert.equal(topicKey("Introduction to Semaphores"), topicKey("semaphore"));
  assert.equal(topicKey("B-Trees"), topicKey("B trees"));
  assert.notEqual(topicKey("Paging"), topicKey("Segmentation"));
});

test("broken model JSON is repaired", () => {
  assert.deepEqual(repairJson('```json\n{"course": "OS", "units": [{"title": "A", "topics": ["x",],},]}\n```'), { course: "OS", units: [{ title: "A", topics: ["x"] }] });
  assert.deepEqual(repairJson('{course: "OS", units: []}'), { course: "OS", units: [] });
  assert.deepEqual(repairJson("{'course': 'OS', 'units': []}"), { course: "OS", units: [] });
  // Cut off mid-string and mid-key.
  assert.deepEqual(repairJson('{"units":[{"title":"Mem","topics":["Paging","Segmen'), { units: [{ title: "Mem", topics: ["Paging", "Segmen"] }] });
  assert.deepEqual(repairJson('{"units":[{"title":"Mem","topics":["Paging"],"hours":'), { units: [{ title: "Mem", topics: ["Paging"] }] });
  assert.deepEqual(repairJson('[{"title":"A","topics":["x"]}]'), { units: [{ title: "A", topics: ["x"] }] });
  assert.throws(() => repairJson("no json at all"));
});

test("extraction JSON is validated and coerced", () => {
  const r = validateExtraction({ course: "Operating Systems", modules: [
    { name: "Unit 1: Processes", lectures: "8 hours", weight: "20%", topics: ["Process states", { name: "CPU scheduling", hours: 3 }, "", 42] },
    { title: "Empty", topics: [] },
    "junk",
  ] });
  assert.deepEqual(r.value, { course: "Operating Systems", units: [{ title: "Processes", hours: 8, weight: "20%", topics: [{ name: "Process states" }, { name: "CPU scheduling", hours: 3 }] }] });
  assert.match(validateExtraction({ course: "x" }).error, /units/);
  assert.match(validateExtraction({ units: [{ title: "A", topics: [] }] }).error, /no units/);
  assert.match(validateExtraction(null).error, /object/);
});

test("a bad reply gets one retry with the error, and a second failure throws", async () => {
  const good = '{"course":"OS","units":[{"title":"Memory","topics":["Paging"]}]}';
  const m = fakeModel(["Sorry, I can't", good]);
  const v = await askJson(m, [{ role: "user", content: "go" }], validateExtraction);
  assert.equal(v.units[0].topics[0].name, "Paging");
  assert.equal(m.calls.length, 2);
  assert.match(m.calls[1].messages.at(-1).content, /couldn't be used/);
  assert.equal(m.calls[1].messages.at(-2).role, "assistant");
  const bad = fakeModel(['{"units": "nope"}', '{"units": []}']);
  await assert.rejects(askJson(bad, [{ role: "user", content: "go" }], validateExtraction));
  assert.equal(bad.calls.length, 2);
});

test("long text is chunked by page, and units split across chunks are merged and de-duplicated", async () => {
  const pages = Array.from({ length: 6 }, (_, i) => `--- Page ${i + 1} ---\n${"word ".repeat(400)}`).join("\n");
  const chunks = chunkText(pages, 5000);
  assert.ok(chunks.length >= 2 && chunks.every((c) => c.length <= 5000 + 50));
  assert.ok(chunks[0].startsWith("--- Page 1 ---"));
  const huge = chunkText(`--- Page 1 ---\n${"para\n\n".repeat(5000)}`, 3000);
  assert.ok(huge.every((c) => c.length <= 3000));

  const replies = [
    '{"course":"Operating Systems","units":[{"title":"Processes","topics":["CPU scheduling","Threads"]},{"title":"Memory management","hours":8,"topics":["Paging"]}]}',
    '{"course":"","units":[{"title":"Memory Management","topics":["Segmentation","paging"]},{"title":"Deadlocks","topics":["Banker\'s algorithm","Threads"]}]}',
  ];
  const m = fakeModel([...replies]);
  const ex = await extract(m, chunkText(pages, 5000).slice(0, 2).join(""));
  assert.equal(ex.course, "Operating Systems");
  assert.deepEqual(ex.units.map((u) => u.title), ["Processes", "Memory management", "Deadlocks"]);
  assert.deepEqual(ex.units[1].topics.map((t) => t.name), ["Paging", "Segmentation"]);
  assert.deepEqual(ex.units[2].topics.map((t) => t.name), ["Banker's algorithm"]);
  assert.equal(ex.units[1].hours, 8);
});

test("dedupe keeps the first place of each topic and drops emptied units", () => {
  const out = dedupeTopics([
    { title: "A", topics: [{ name: "Paging" }, { name: "Pagings" }, { name: "TLB" }] },
    { title: "B", topics: [{ name: "Introduction to paging" }] },
    { title: "C", topics: [{ name: "tlb" }, { name: "Thrashing" }] },
  ]);
  assert.deepEqual(out.map((u) => [u.title, u.topics.map((t) => t.name)]), [["A", ["Paging", "TLB"]], ["C", ["Thrashing"]]]);
  assert.deepEqual(mergeUnits([{ course: "", units: [{ title: "X", topics: [{ name: "a1" }] }] }, { course: "C", units: [{ title: "x", topics: [{ name: "b1" }] }] }]),
    { course: "C", units: [{ title: "X", topics: [{ name: "a1" }, { name: "b1" }] }] });
});

// --- Matching ----------------------------------------------------------------------

test("threshold logic: accept, verify or reject on the best similarity", () => {
  const t = { accept: 0.7, reject: 0.5 };
  assert.equal(decide([{ id: "a", score: 0.71 }], t), "accept");
  assert.equal(decide([{ id: "a", score: 0.7 }], t), "accept");
  assert.equal(decide([{ id: "a", score: 0.6 }], t), "verify");
  assert.equal(decide([{ id: "a", score: 0.49 }], t), "reject");
  assert.equal(decide([], t), "reject");
  assert.ok(THRESHOLDS.reject < THRESHOLDS.accept && THRESHOLDS.reject > 0.3 && THRESHOLDS.accept < 0.9);
  // Several vectors per id (title and text): the best one counts, ids appear once.
  const k = topK([1, 0], [[1, 0], [0, 1], [0.6, 0.8]], ["a", "b", "a"], 3);
  assert.deepEqual(k.map((c) => c.id), ["a", "b"]);
  assert.equal(k[0].score, 1);
});

test("the verifier's batch answers are parsed whatever their shape", () => {
  assert.deepEqual(parseVerdicts({ results: [{ pair: 2, match: true, reason: "same" }, { pair: 1, match: false, reason: "no" }] }, 3),
    [{ match: false, reason: "no" }, { match: true, reason: "same" }, { match: false, reason: "" }]);
  assert.deepEqual(parseVerdicts([{ match: "yes" }, { match: "no match" }, { verdict: "Match" }], 3).map((v) => v.match), [true, false, true]);
  assert.deepEqual(parseVerdicts({ 1: "match", 2: { match: "false" } }, 2).map((v) => v.match), [true, false]);
  assert.deepEqual(parseVerdicts({ results: [{ pair: 9, match: true }] }, 2).map((v) => v.match), [false, false]);
  assert.deepEqual(parseVerdicts("nonsense", 1), [{ match: false, reason: "" }]);
});

test("matching: confident matches accepted, borderline ones verified in one batch, the rest left uncovered", async () => {
  const units = [{ title: "Memory", topics: [{ name: "Paging and memory" }, { name: "Linux kernel" }] }, { title: "Deadlocks", topics: [{ name: "Banker deadlock memory cpu sql" }, { name: "CPU memory" }] }];
  const verifier = fakeModel([(req) => {
    // Every borderline pair is in this one call.
    const n = (req.messages[0].content.match(/^\d+\. Topic:/gm) ?? []).length;
    return JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ pair: i + 1, match: /CPU scheduling/.test(req.messages[0].content.split(/^\d+\. Topic:/m)[i + 1]), reason: "checked" })) });
  }]);
  let embedCalls = 0;
  const deps = { catalogue: FAKE_CATALOGUE, generate: verifier.generate, embed: async (t) => { embedCalls++; return fakeEmbed(t); } };
  const out = await matchUnits(deps, "OS", units, { thresholds: { accept: 0.8, reject: 0.35 } });
  const [paging, linux] = out.units[0].topics, [mixed, cpu] = out.units[1].topics;
  assert.equal(paging.match.id, "m:os.memory");
  assert.equal(paging.match.via, "embedding");
  assert.equal(linux.match, null, "no similar entry, so not covered");
  assert.equal(paging.candidates.length, 3);
  assert.equal(verifier.calls.length, 1, "one batched verifier call");
  assert.equal(cpu.match?.id, "m:os.scheduling");
  assert.equal(cpu.match.via, "verifier");
  assert.equal(cpu.match.reason, "checked");
  assert.equal(mixed.match, null, "verifier said no to every candidate");
  assert.equal(embedCalls, 2, "catalogue once, topics once");
});

test("if the verifier fails, borderline topics fall back to the upper half of the band", async () => {
  const units = [{ title: "U", topics: [{ name: "CPU memory" }] }];
  const deps = { catalogue: FAKE_CATALOGUE, generate: fakeModel([new Error("down"), new Error("down")]).generate, embed: async (t) => fakeEmbed(t) };
  // "CPU memory" is about 0.5 similar to its best entries.
  const hi = await matchUnits(deps, "", units, { thresholds: { accept: 0.6, reject: 0.3 } });
  assert.equal(hi.verifierFailed, true);
  assert.ok(hi.units[0].topics[0].match, "0.5 is above the band's middle (0.45)");
  const lo = await matchUnits(deps, "", units, { thresholds: { accept: 0.6, reject: 0.45 }, verify: false });
  assert.equal(lo.verifierFailed, false);
  assert.equal(lo.units[0].topics[0].match, null, "0.5 is below the middle of 0.45 to 0.6");
});

test("catalogue vectors are kept in the Cache API and reused", async () => {
  const store = new Map();
  const cache = { match: async (k) => store.get(k)?.clone(), put: async (k, r) => { store.set(k, r); } };
  let n = 0;
  const embed = async (t) => { n++; return t.map((_, i) => [i + 1, 0.5, 0.25]); };
  // The real catalogue (no deps.catalogue), so the per-isolate memo and cache apply.
  const a = await catalogueVectors({ embed, cache });
  assert.equal(n, 1);
  assert.equal(store.size, 1);
  const again = await catalogueVectors({ embed, cache });
  assert.equal(again, a, "same isolate: memoised");
  assert.ok(Math.abs(a[3][0] - 4) < 1e-6);
});

test("the endpoint validates input and reports coverage", async () => {
  const deps = { catalogue: FAKE_CATALOGUE, generate: fakeModel([]).generate, embed: async (t) => fakeEmbed(t) };
  assert.equal((await runSyllabus(deps, { text: "short" })).status, 400);
  assert.equal((await runSyllabus(deps, { text: "x".repeat(70_000) })).status, 413);
  assert.equal((await runSyllabus(deps, { units: "nope" })).status, 400);
  const ok = await runSyllabus(deps, { course: "OS", units: [{ title: "Mem", topics: ["Paging and memory", "Linux kernel", "paging and memory"] }] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.stats, { topics: 2, covered: 1, verified: 0, verifierFailed: false });
});

test("the Worker's catalogue copy is up to date (run npm run build if not)", async () => {
  assert.equal(await readFile(CATALOGUE_FILE, "utf8"), catalogueSource());
});

test("catalogue entries point at real tools and GATE topics, with unique ids", () => {
  const ids = new Set();
  for (const e of ENTRIES) {
    assert.ok(!ids.has(e.id), e.id); ids.add(e.id);
    assert.ok(e.tools.length && e.tools.every((t) => slugs.has(t)), e.id);
    assert.ok(e.gate.every((g) => gateSlugs.has(g)), e.id);
    assert.ok(e.hours > 0 && e.outcomes.length && e.text.length > 10, e.id);
  }
  assert.ok(TOOLS.every((t) => ids.has(`t:${t.slug}`)), "every tool is a card");
  assert.ok(!ids.has("m:rev.mixed") && !ids.has("m:sos.revision"), "exam-technique modules are left out");
});

// --- Roadmap assembly -------------------------------------------------------------------

const MATCHED = {
  course: "Operating Systems",
  units: [
    { title: "Processes and scheduling", hours: 6, weight: "20%", topics: [
      { name: "Process states", match: null, candidates: [{ id: "m:os.scheduling", score: 0.4 }] },
      { name: "CPU scheduling algorithms", match: { id: "m:os.scheduling", score: 0.8, via: "embedding" }, candidates: [] },
      { name: "Round robin", match: { id: "t:cpu-scheduling", score: 0.6, via: "verifier", reason: "covers RR" }, candidates: [] },
    ] },
    { title: "Memory", topics: [
      { name: "Paging", match: { id: "m:os.memory", score: 0.7, via: "embedding" }, candidates: [] },
      { name: "Page replacement", match: { id: "m:os.vm", score: 0.75, via: "embedding" }, candidates: [] },
      { name: "Paging", match: null, candidates: [] },
    ] },
    { title: "Synchronisation", topics: [{ name: "Semaphores", match: { id: "m:os.sync", score: 0.7, via: "embedding" }, candidates: [] }, { name: "Banker's algorithm", match: { id: "m:os.deadlock", score: 0.7, via: "embedding" }, candidates: [] }] },
  ],
};

function checkRoadmap(r) {
  assert.match(r.id, /^my-[a-z0-9]{6}$/);
  const all = r.stages.flatMap((s) => s.modules);
  const ids = all.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "module ids unique");
  assert.equal(new Set(r.stages.map((s) => s.id)).size, r.stages.length, "stage ids unique");
  for (const s of r.stages) assert.match(s.id, /^[a-z0-9-]+$/);
  for (const [i, m] of all.entries()) {
    assert.match(m.id, /^[a-z0-9.-]+$/);
    assert.ok(!ROADMAPS.some((x) => x.stages.some((s) => s.modules.some((y) => y.id === m.id))), "no clash with shared module ids");
    for (const n of m.needs) assert.ok(ids.indexOf(n) >= 0 && ids.indexOf(n) < i, `${m.id} needs ${n}, which must come earlier`);
    assert.ok(m.tools.every((t) => slugs.has(t)), m.id);
    assert.ok(m.gate.every((g) => gateSlugs.has(g)), m.id);
    for (const t of m.tryIt ?? []) assert.ok(m.tools.includes(t.tool));
    assert.ok(m.hours > 0 && m.outcomes.length, m.id);
    if (!m.tools.length) assert.ok(m.uncovered && m.reading.length === 2 && m.reading.every((x) => x.url.startsWith("https://")), m.id);
  }
}

test("a matched syllabus becomes a roadmap in the ROADMAPS shape", () => {
  const r = assembleRoadmap(MATCHED, ENTRIES, { created: 1 });
  checkRoadmap(r);
  assert.equal(r.title, "Operating Systems");
  assert.deepEqual(r.stages.map((s) => s.title), ["Processes and scheduling", "Memory", "Synchronisation"]);
  const [proc, mem, sync] = r.stages;
  const states = proc.modules[0];
  assert.equal(states.uncovered, true);
  assert.equal(states.reading[0].url, gfgSearch("Process states"));
  assert.equal(states.reading[0].url, "https://www.geeksforgeeks.org/search/?gq=Process%20states");
  assert.match(states.reading[1].url, /^https:\/\/www\.google\.com\/search\?q=Process%20states%20Operating%20Systems$/);
  const cpu = proc.modules[1];
  assert.deepEqual(cpu.tools, ["cpu-scheduling"]);
  assert.deepEqual(cpu.gate, ["cpu-scheduling"]);
  assert.equal(proc.modules[2].match.via, "verifier");
  // Lecture hours (6) become about 12 study hours across the unit.
  assert.ok(Math.abs(proc.modules.reduce((a, m) => a + m.hours, 0) - 12) <= 1);
  assert.equal(proc.subject, "os");
  assert.match(proc.summary, /20%/);
  // Unit order: each unit's first topic needs the last topic of the one before.
  assert.deepEqual(mem.modules[0].needs, [proc.modules[2].id]);
  // Borrowed prerequisites: os.vm needs os.memory, which is "Paging" here.
  assert.ok(mem.modules[1].needs.includes(mem.modules[0].id));
  // The repeated "Paging" got its own id.
  assert.notEqual(mem.modules[2].id, mem.modules[0].id);
  assert.deepEqual(sync.modules[1].gate, ["bankers-algorithm"]);
  // Same syllabus, same id; a different one, a different id.
  assert.equal(assembleRoadmap(MATCHED, ENTRIES).id, r.id);
  assert.notEqual(assembleRoadmap({ ...MATCHED, course: "DBMS" }, ENTRIES).id, r.id);
});

test("editing keeps the id and module ids, so progress stays", () => {
  const r = assembleRoadmap(MATCHED, ENTRIES, { created: 1 });
  const cpuId = r.stages[0].modules[1].id;
  const removed = removeTopic(r, r.stages[0].modules[0].id, ENTRIES, 2);
  checkRoadmap(removed);
  assert.equal(removed.id, r.id);
  assert.equal(removed.stages[0].modules[0].id, cpuId);
  assert.equal(removed.updated, 2);
  const renamed = renameTopic(removed, cpuId, "  Scheduling   algorithms ", ENTRIES, 3);
  assert.equal(renamed.stages[0].modules[0].title, "Scheduling algorithms");
  assert.equal(renamed.stages[0].modules[0].id, cpuId);
  assert.equal(renameTopic(renamed, cpuId, "   ", ENTRIES), renamed);
  const body = rematchBody(renamed);
  assert.equal(body.units[0].topics[0].name, "Scheduling algorithms");
  assert.ok(!("key" in body.units[0].topics[0]) && !("match" in body.units[0].topics[0]));
  // The re-run says "Process states"-style topics now match something.
  const result = { units: renamed.syllabus.units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ name: t.name, match: t.name === "Paging" ? null : t.match, candidates: [] })) })) };
  const again = applyRematch(renamed, result, ENTRIES, 4);
  checkRoadmap(again);
  assert.equal(again.stages[1].modules[0].uncovered, true);
  assert.equal(again.stages[1].modules[0].id, renamed.stages[1].modules[0].id);
  // Removing every topic of a unit drops the unit.
  let x = again;
  for (const m of again.stages[2].modules) x = removeTopic(x, m.id, ENTRIES);
  assert.equal(x.stages.length, 2);
});

// --- On the client --------------------------------------------------------------------

test("personal roadmaps resolve from the learning store, for the roadmap pages and the planner", () => {
  const r = assembleRoadmap(MATCHED, ENTRIES, { created: 1 });
  const s = empty();
  saveRoadmap(s, r);
  save(s);
  const got = roadmapOf(r.id);
  assert.equal(got.id, r.id);
  assert.equal(got.local, true);
  assert.equal(roadmapOf("gate-cs").id, "gate-cs");
  assert.equal(roadmapOf("my-nothere"), undefined);
  assert.deepEqual(localRoadmaps().map((x) => x.id), [r.id]);
  assert.equal(allRoadmaps().length, ROADMAPS.length + 1);
  assert.equal(parse(`roadmap/${r.id}`).roadmap.id, r.id);
  assert.equal(parse(`roadmap/${r.id}/${r.stages[1].id}`).stage.title, "Memory");
  assert.equal(parse(`roadmap/${r.id}/nope`), null);
  const plan = buildPlan({ roadmap: got, start: "2026-12-01", exam: "2027-01-15", hoursPerDay: 2, daysPerWeek: 6 });
  assert.ok(!plan.error);
  assert.equal(plan.remaining, got.stages.flatMap((x) => x.modules).length);
  // Survives a reload (migrate), and goes with its plan when deleted.
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.ok(back.roadmaps[r.id]);
  back.plan = { roadmap: r.id };
  deleteRoadmap(back, r.id);
  assert.equal(back.plan, null);
  assert.deepEqual(back.roadmaps, {});
  save(empty());
});

test("a stored roadmap is cleaned before use: unknown tools, GATE topics and links go", () => {
  const known = new Set(["paging-x", "cpu-scheduling"]), gate = new Set(["cpu-scheduling"]);
  const r = sanitiseLocal({ id: "my-abc123", stages: [{ id: "u1", title: "U", modules: [
    { id: "my1.a", title: "A", hours: -1, needs: ["my1.zz", "my1.a"], outcomes: ["x", 5], tools: ["cpu-scheduling", "evil"], gate: ["cpu-scheduling", "nope"], tryIt: [{ tool: "evil", query: "a", label: "b" }], reading: [{ title: "bad", url: "javascript:alert(1)" }, { title: "ok", url: "https://x.y" }] },
    { id: "my1.a", title: "dup" }, { id: "BAD ID" },
  ] }, { id: "bad id", modules: [] }] }, known, gate);
  assert.equal(r.stages.length, 1);
  const [m] = r.stages[0].modules;
  assert.equal(r.stages[0].modules.length, 1);
  assert.deepEqual([m.tools, m.gate, m.needs, m.outcomes, m.tryIt, m.reading.map((x) => x.title), m.hours], [["cpu-scheduling"], ["cpu-scheduling"], [], ["x"], [], ["ok"], 2]);
  assert.equal(sanitiseLocal({ id: "gate-cs", stages: [] }, known, gate), null);
  assert.equal(migrate({ v: 1, roadmaps: { "my-abc123": { id: "other", stages: [] }, "../x": { id: "../x", stages: [] } } }).roadmaps["my-abc123"], undefined);
});

test("PDF text keeps lines in reading order and marks headings", () => {
  const item = (str, x, y, size = 10, width = str.length * 5) => ({ str, transform: [size, 0, 0, size, x, y], width, height: size });
  const lines = linesOf([item("Paging,", 60, 700), item("UNIT II", 50, 740, 14), item("segmentation", 100, 700.5), item("   ", 0, 600), item("Memory", 50, 720)]);
  assert.deepEqual(lines.map((l) => l.text), ["UNIT II", "Memory", "Paging, segmentation"]);
  const text = pagesToText([lines, [{ text: "Unit 3: Deadlocks", size: 10 }, { text: "Banker's algorithm", size: 10 }]]);
  assert.equal(text, "--- Page 1 ---\n## UNIT II\nMemory\nPaging, segmentation\n\n--- Page 2 ---\n## Unit 3: Deadlocks\nBanker's algorithm");
  assert.equal(chunkText(text).length, 1);
});
