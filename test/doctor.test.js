// The mistake doctor and the learner model: the misconception library, the
// Bayesian diagnosis, knowledge tracing, Elo difficulty and ability, adaptive
// selection, the store migration, and the number guard on /api/ai/doctor.
import assert from "node:assert/strict";
import { test } from "node:test";
import { generate, topicOf } from "../public/js/gate-questions.js";
import { ALL, BY_TOPIC, TOPICS_COVERED } from "../public/js/ai/misconceptions/index.js";
import {
  ALPHA, CLAIM, EPSILON, MAX_EVIDENCE, SLIP, UNKNOWN, addEvidence, commonMistakes, diagnose, diagnoseSaved,
  learnFrom, likelihood, predictions, prior, sameAnswer, slipLikelihood, stepUrl, targetSeed, verdict, wrongSpace,
} from "../public/js/ai/doctor.js";
import { CEILING, L0, MASTERED, params, prior as bktPrior, trace, update as bktUpdate } from "../public/js/learn/bkt.js";
import { BAND, K_ITEM, K_TOPIC, baseDifficulty, empty as emptyElo, itemKey, pickAdaptive, predict, replay, update as eloUpdate } from "../public/js/learn/elo.js";
import { empty, migrate, VERSION } from "../public/js/learn/store.js";
import { answer, pKnown, predictSuccess, topicStat } from "../public/js/learn/model.js";
import { guardNumbers, handleDoctor, numbersIn, readInput } from "../src/ai/doctor.ts";

const SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i * 37);
const bank = new Map();
const questions = (topic, seeds = SEEDS) => seeds.map((s) => {
  const k = `${topic}:${s}`;
  if (!bank.has(k)) bank.set(k, generate(topic, s));
  return bank.get(k);
});
const differs = (m, q) => predictions(m, q).some((p) => !sameAnswer(q, p, q.answer));
// A small seeded random, so the tests don't depend on Math.random.
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// --- The library ---------------------------------------------------------------------------

test("the library covers at least 25 GATE topics with named misconceptions", () => {
  assert.ok(TOPICS_COVERED.length >= 25, `${TOPICS_COVERED.length} topics`);
  for (const t of TOPICS_COVERED) assert.ok(topicOf(t), `${t} is a GATE topic`);
  for (const t of ["cpu-scheduling", "page-replacement", "disk-scheduling", "subnetting", "ieee-754", "minimum-spanning-tree", "lr-parsing", "k-map"]) assert.ok(BY_TOPIC[t]?.length >= 2, t);
  const ids = ALL.map((m) => `${m.topic}/${m.id}`);
  assert.equal(new Set(ids).size, ids.length, "ids are unique within a topic");
  for (const m of ALL) {
    assert.match(m.label, /^[a-z]/, `${m.id}: the label finishes "Looks like you ..."`);
    assert.ok(!/[–—]/.test(m.label), `${m.id}: no en or em dashes`);
  }
});

test("every misconception runs on 50 seeds of its topic without throwing", () => {
  for (const m of ALL) {
    for (const q of questions(m.topic)) {
      assert.ok(q.given, `${m.topic} seed ${q.seed} has structured inputs`);
      const p = m.predict(q);
      if (p == null) continue;
      for (const a of p.anyOf ?? [p]) {
        if (q.type === "nat") assert.ok(Number.isFinite(a), `${m.id}: a number`);
        else if (q.type === "mcq") assert.ok(Number.isInteger(a) && a >= 0 && a < q.options.length, `${m.id}: an option index`);
        else assert.ok(Array.isArray(a) && a.every((i) => i >= 0 && i < q.options.length), `${m.id}: option indexes`);
      }
      const text = m.explain(q);
      assert.equal(typeof text, "string");
      assert.ok(!/[–—]/.test(text), `${m.id}: no en or em dashes in "${text}"`);
      if (m.step) { const s = m.step(q); assert.ok(s == null || (Number.isInteger(s) && s >= 1), `${m.id}: step ${s}`); }
    }
  }
});

test("every misconception gives a different answer from the right one on some seeds", () => {
  for (const m of ALL) {
    let found = questions(m.topic).some((q) => differs(m, q));
    // A few mistakes only show up on rarer question shapes: look further.
    for (let s = 5000; !found && s < 5000 + 3000 * 13; s += 13) found = differs(m, generate(m.topic, s));
    assert.ok(found, `${m.topic}/${m.id} never changes the answer`);
  }
});

test("replay steps exist where the engines have a step list", () => {
  for (const [topic, id] of [["page-replacement", "fifo-for-lru"], ["disk-scheduling", "look-for-scan"], ["cpu-scheduling", "fcfs-instead"], ["hashing", "linear-for-quadratic"]]) {
    const m = BY_TOPIC[topic].find((x) => x.id === id);
    let q = null;
    for (let s = 1; s < 4000 && !q; s++) { const c = generate(topic, s); if (differs(m, c)) q = c; }
    const step = m.step(q);
    assert.ok(Number.isInteger(step) && step >= 1, `${topic}/${id} step ${step}`);
    assert.match(stepUrl(q.replay, step), new RegExp(`[?&]step=${step}(#|$)`));
  }
  assert.equal(stepUrl("/sliding-window?ew=3#calc", 4), "/sliding-window?ew=3&step=4#calc");
  assert.equal(stepUrl("/address-translation", 2), "/address-translation?step=2");
  assert.equal(stepUrl("/x?a=1", null), "/x?a=1");
});

// --- Bayes ---------------------------------------------------------------------------------

test("likelihoods follow the stated model", () => {
  const nat = { type: "nat", answer: 10, tolerance: 0 };
  const u = 1 / wrongSpace(nat);
  assert.equal(wrongSpace({ type: "mcq", options: ["a", "b", "c", "d"] }), 3);
  assert.equal(wrongSpace({ type: "msq", options: ["a", "b", "c", "d"] }), 14);
  assert.ok(Math.abs(likelihood(nat, 7, [7]) - ((1 - EPSILON) + EPSILON * u)) < 1e-12, "reproduces the answer exactly");
  assert.ok(Math.abs(likelihood(nat, 7, [7, 8]) - ((1 - EPSILON) / 2 + EPSILON * u)) < 1e-12, "one of two predicted answers");
  assert.ok(Math.abs(likelihood(nat, 7, [8]) - EPSILON * u) < 1e-12, "predicts something else");
  assert.ok(Math.abs(likelihood(nat, 7, [10]) - EPSILON * u) < 1e-12, "predicts the right answer, so can't explain a wrong one");
  assert.ok(Math.abs(likelihood(nat, 7, []) - EPSILON * u) < 1e-12, "doesn't apply");
  assert.ok(slipLikelihood(nat, 11) > slipLikelihood(nat, 70), "a near miss looks like a slip");
  const p = prior(["a", "b", SLIP, UNKNOWN], { a: 2 });
  assert.ok(Math.abs(p.a - (ALPHA + 2) / (4 * ALPHA + 2)) < 1e-12);
  assert.ok(Math.abs(Object.values(p).reduce((x, y) => x + y, 0) - 1) < 1e-12);
});

test("the posterior is Bayes' rule over the topic's hypotheses", () => {
  const m = BY_TOPIC["page-replacement"].find((x) => x.id === "fifo-for-lru");
  let q = null;
  for (let s = 1; !q; s++) { const c = generate("page-replacement", s); if (differs(m, c)) q = c; }
  const response = predictions(m, q)[0];
  const counts = { "fifo-for-lru": 1.5, [SLIP]: 0.5 };
  const d = diagnose(q, response, counts);
  // Recompute by hand.
  const ms = BY_TOPIC["page-replacement"];
  const ids = [...ms.map((x) => x.id), SLIP, UNKNOWN];
  const pri = prior(ids, counts);
  const lik = Object.fromEntries(ms.map((x) => [x.id, likelihood(q, response, predictions(x, q))]));
  lik[SLIP] = slipLikelihood(q, response); lik[UNKNOWN] = 1 / wrongSpace(q);
  const z = ids.reduce((a, id) => a + pri[id] * lik[id], 0);
  for (const { id, p } of d.posterior) assert.ok(Math.abs(p - (pri[id] * lik[id]) / z) < 1e-12, id);
  assert.ok(Math.abs(d.posterior.reduce((a, x) => a + x.p, 0) - 1) < 1e-12);
  assert.equal(d.best.id, d.posterior[0].id);
});

test("the posterior picks the planted misconception when fed its answers", () => {
  let checked = 0;
  for (const m of ALL) {
    const others = BY_TOPIC[m.topic].filter((x) => x !== m);
    // A seed where m gives one wrong answer that no other misconception gives.
    let q = null, r = null;
    for (const c of questions(m.topic)) {
      const p = predictions(m, c);
      if (p.length !== 1 || sameAnswer(c, p[0], c.answer)) continue;
      if (others.some((o) => predictions(o, c).some((x) => sameAnswer(c, x, p[0])))) continue;
      q = c; r = p[0]; break;
    }
    if (!q) continue;
    checked++;
    const d = diagnose(q, r, {});
    assert.equal(d.best.id, m.id, `${m.topic}: ${m.id} should explain ${JSON.stringify(r)}`);
    if (q.type !== "mcq") assert.equal(d.claim?.id, m.id, `${m.topic}/${m.id} is claimed (posterior ${d.best.p.toFixed(2)})`);
    // The same mistake again, with the evidence folded in: more confident.
    const counts = addEvidence({}, d.posterior);
    assert.ok(diagnose(q, r, counts).best.p > d.best.p, `${m.id}: repeated evidence raises confidence`);
  }
  assert.ok(checked >= ALL.length * 0.6, `planted ${checked} of ${ALL.length}`);
});

test("an answer no known mistake explains is not claimed", () => {
  const q = generate("page-replacement", 3);
  const ms = BY_TOPIC["page-replacement"];
  let r = q.answer + 17;
  while (ms.some((m) => predictions(m, q).includes(r))) r++;
  const d = diagnose(q, r, {});
  assert.equal(d.claim, null);
  assert.ok([SLIP, UNKNOWN].includes(d.best.id) || d.best.p < CLAIM);
  assert.match(verdict(d), /couldn't tell/);
});

test("evidence is capped so the prior can still change", () => {
  const counts = {};
  for (let i = 0; i < 100; i++) addEvidence(counts, [{ id: "a", p: 0.9 }, { id: SLIP, p: 0.1 }]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.ok(total <= MAX_EVIDENCE + 0.01);
  assert.ok(counts.a > counts[SLIP]);
});

test("the store keeps the answer, the posterior and the counts, without double counting", () => {
  const m = BY_TOPIC["subnetting"].find((x) => x.id === "forgot-reserved");
  let q = null;
  for (let s = 1; !q; s++) { const c = generate("subnetting", s); if (c.given.variant === "hosts") q = c; }
  const r = m.predict(q);
  const s = empty();
  answer(s, { topic: q.topic, seed: q.seed, correct: false, marks: q.marks, type: q.type, response: r });
  const d = learnFrom(s, q, r);
  assert.equal(d.claim.id, "forgot-reserved");
  assert.equal(s.mistakes[0].r, r);
  assert.ok(s.mistakes[0].dx["forgot-reserved"] > 0.5);
  assert.ok(s.doctor.subnetting["forgot-reserved"] > 0.5);
  // Seen again later from the notebook: same posterior as at the time.
  const again = diagnoseSaved(s, q, s.mistakes[0]);
  assert.ok(Math.abs(again.claim.p - d.claim.p) < 0.01);
  const common = commonMistakes(s);
  assert.equal(common[0].id, "forgot-reserved");
  // Saved and read back.
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.doctor, s.doctor);
  assert.deepEqual(back.mistakes[0].dx, s.mistakes[0].dx);
  assert.equal(back.answers[0].ty, "nat");
});

test("a question that targets a mistake is found from a seed", () => {
  const seed = targetSeed("page-replacement", "fifo-for-lru", generate, { start: 1, tries: 200 });
  assert.ok(seed != null);
  const q = generate("page-replacement", seed);
  assert.ok(differs(BY_TOPIC["page-replacement"].find((x) => x.id === "fifo-for-lru"), q));
});

// --- Knowledge tracing ------------------------------------------------------------------------

test("BKT updates are Bayes' rule plus the learning step", () => {
  const prm = { g: 0.2, s: 0.1, t: 0.1 };
  const right = (0.3 * 0.9) / (0.3 * 0.9 + 0.7 * 0.2), wrong = (0.3 * 0.1) / (0.3 * 0.1 + 0.7 * 0.8);
  assert.ok(Math.abs(bktUpdate(0.3, true, prm) - (right + (1 - right) * 0.1)) < 1e-12);
  assert.ok(Math.abs(bktUpdate(0.3, false, prm) - (wrong + (1 - wrong) * 0.1)) < 1e-12);
  assert.ok(bktUpdate(0.999, false, prm) < bktUpdate(CEILING, true, prm), "the belief is capped before each update");
  // Formats: an MCQ is easier to guess than a NAT, so a right MCQ is weaker evidence.
  assert.ok(params("mcq").g > params("msq").g && params("msq").g > params("nat").g);
  assert.ok(bktUpdate(L0, true, params("nat")) > bktUpdate(L0, true, params("mcq")));
  assert.ok(params("nat", 2).s > params("nat", 1).s, "two-mark questions slip more");
  // Mastery from scratch: 3 right NATs, 4 right MCQs.
  const nat = { c: true, ty: "nat", m: 1 }, mcq = { c: true, ty: "mcq", m: 1 };
  assert.ok(trace([nat, nat]) < MASTERED && trace([nat, nat, nat]) >= MASTERED);
  assert.ok(trace([mcq, mcq, mcq]) < MASTERED && trace([mcq, mcq, mcq, mcq]) >= MASTERED);
  assert.equal(bktPrior({ known: true }) >= MASTERED, true);
  assert.equal(bktPrior({}), L0);
});

test("the model exposes P(known) per topic", () => {
  const s = empty();
  assert.equal(pKnown(s, "hashing"), L0);
  for (let i = 0; i < 3; i++) answer(s, { topic: "hashing", seed: i, correct: true, marks: 1, type: "nat" });
  const st = topicStat(s, "hashing");
  assert.ok(st.pKnown >= MASTERED && st.mastered);
  answer(s, { topic: "hashing", seed: 9, correct: false, marks: 1, type: "nat" });
  assert.ok(pKnown(s, "hashing") < MASTERED);
});

// --- Elo and adaptive selection --------------------------------------------------------------

test("Elo updates move ability and difficulty against each other", () => {
  const elo = emptyElo();
  const item = { topic: "hashing", type: "nat", marks: 1 };
  const p0 = predict(elo, item);
  assert.ok(Math.abs(p0 - 1 / (1 + Math.exp(baseDifficulty("nat", 1)))) < 1e-12, "NAT has no guess floor");
  eloUpdate(elo, { ...item, correct: true });
  assert.ok(Math.abs(elo.d.hashing.v - K_TOPIC(0) * (1 - p0)) < 1e-12);
  assert.ok(Math.abs(elo.b[itemKey("hashing", "nat", 1)].v - (baseDifficulty("nat", 1) - K_ITEM(0) * (1 - p0))) < 1e-12);
  assert.ok(elo.g.v > 0);
  const p1 = predict(elo, item);
  assert.ok(p1 > p0, "a right answer raises the predicted success");
  eloUpdate(elo, { ...item, correct: false });
  assert.ok(predict(elo, item) < p1);
  // MCQs never drop below their guess floor.
  for (let i = 0; i < 50; i++) eloUpdate(elo, { topic: "hashing", type: "mcq", marks: 1, correct: false });
  assert.ok(predict(elo, { topic: "hashing", type: "mcq", marks: 1 }) > 0.25);
  assert.ok(K_TOPIC(0) > K_TOPIC(20), "steps shrink with data");
  // Replaying stored answers gives the same estimates as updating online.
  const s = empty();
  const recs = [true, false, true, true].map((c, i) => ({ topic: "sql-joins", seed: i, correct: c, marks: 2, type: "nat" }));
  for (const r of recs) answer(s, r);
  assert.deepEqual(replay(s.answers), s.elo);
  assert.equal(predictSuccess(s, { topic: "sql-joins", type: "nat", marks: 2 }), predict(s.elo, { topic: "sql-joins", type: "nat", marks: 2 }));
});

test("adaptive selection stays in the 0.6 to 0.75 band", () => {
  const rnd = seeded(7);
  const cands = [0.2, 0.35, 0.5, 0.62, 0.7, 0.74, 0.8, 0.95].map((p, i) => ({ i, p }));
  for (let k = 0; k < 500; k++) {
    const c = pickAdaptive(cands, rnd, { explore: 0 });
    assert.ok(c.p >= BAND[0] && c.p <= BAND[1], `picked ${c.p}`);
  }
  // Random among the in-band ones.
  const seen = new Set(Array.from({ length: 300 }, () => pickAdaptive(cands, rnd, { explore: 0 }).i));
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
  // Nothing in band: the closest to the middle.
  assert.equal(pickAdaptive([{ p: 0.1 }, { p: 0.5 }, { p: 0.95 }], rnd, { explore: 0 }).p, 0.5);
  // With the default bit of exploration, still mostly in band.
  let inBand = 0;
  for (let k = 0; k < 2000; k++) { const c = pickAdaptive(cands, rnd); if (c.p >= BAND[0] && c.p <= BAND[1]) inBand++; }
  assert.ok(inBand / 2000 > 0.8, `${inBand / 2000} in band`);
  assert.equal(pickAdaptive([], rnd), null);
});

// --- Store migration ---------------------------------------------------------------------------

test("a version 1 store migrates: answers kept, ability rebuilt", () => {
  const v1 = { v: 1, answers: [{ t: "hashing", s: 1, c: true, sc: 1, m: 1, ms: 5, at: 1, src: "gate" }, { t: "hashing", s: 2, c: false, sc: 0, m: 1, ms: 5, at: 2, src: "gate" }], mistakes: [{ t: "hashing", s: 2, at: 2, ok: false }], migratedGate: true };
  const s = migrate(v1);
  assert.equal(s.v, VERSION);
  assert.equal(s.answers.length, 2);
  assert.ok(s.elo.d.hashing.n === 2, "ability rebuilt from the answers");
  assert.deepEqual(s.doctor, {});
  assert.equal(s.mistakes[0].r, undefined, "old mistakes have no saved answer");
  // Junk in the new fields is dropped.
  const bad = migrate({ v: 2, answers: [], mistakes: [{ t: "x", s: 1, r: "nope", dx: { a: 7, b: 0.5 } }], doctor: { x: { a: -1, b: "2" } }, elo: { g: { v: "NaN" } } });
  assert.equal(bad.mistakes[0].r, undefined);
  assert.deepEqual(bad.mistakes[0].dx, { b: 0.5 });
  assert.deepEqual(bad.doctor, { x: { b: 2 } });
  assert.equal(bad.elo.g.v, 0);
});

// --- /api/ai/doctor number guard -------------------------------------------------------------------

const INPUTS = ["Page replacement", "used FIFO instead of LRU", 87, "LRU evicts the page whose last use is furthest in the past. With FIFO you get 9 faults; LRU gives 7.", "9", "7", 4];

test("the guard keeps a faithful rewording", () => {
  const g = guardNumbers("You used FIFO, which gave 9 faults. LRU would give 7, because it keeps pages you used recently. Step 4 in the replay shows where they part ways.", INPUTS);
  assert.ok(g.ok);
  assert.equal(g.dropped, 0);
  assert.match(g.text, /9 faults/);
});

test("the guard drops sentences with numbers that aren't in the diagnosis", () => {
  const g = guardNumbers("You used FIFO, which gave 9 faults. That's 2 more than LRU's 7, so 28.5% worse. LRU keeps recently used pages.", INPUTS);
  assert.ok(g.ok);
  assert.equal(g.dropped, 1);
  assert.doesNotMatch(g.text, /28\.5|2 more/);
});

test("the guard refuses a reply that is mostly invented numbers", () => {
  assert.equal(guardNumbers("You got 12 faults. LRU gives 5. Only 3 of 10 students get this.", INPUTS).ok, false);
  assert.equal(guardNumbers("", INPUTS).ok, false);
});

test("the guard compares numbers by value, keeps decimals whole and removes dashes", () => {
  assert.deepEqual(numbersIn("EAT is 0.50 ns, or 12.25 — not 3"), [0.5, 12.25, 3]);
  const g = guardNumbers("The hit ratio is 0.9 and the EAT is 121.00 ns — a bit more than one memory access.", ["hit ratio 0.90", "EAT = 121 ns"]);
  assert.ok(g.ok);
  assert.ok(!/[–—]/.test(g.text));
  assert.match(g.text, /0\.9 /);
});

test("the endpoint rewords through the model and enforces the guard", async () => {
  const body = { topic: "Page replacement", diagnosis: "used FIFO instead of LRU", confidence: 87, explanation: INPUTS[3], yourAnswer: "9", rightAnswer: "7", step: 4 };
  assert.ok(readInput(body));
  assert.equal(readInput({ topic: "x" }), null);
  const call = (reply) => handleDoctor(new Request("https://x/api/ai/doctor", { method: "POST", body: JSON.stringify(body) }), { AI: { run: async () => ({ response: reply }) } }, { byok: null });
  const good = await call("You picked FIFO, so you got 9 faults instead of 7. LRU looks at when each page was last used.");
  assert.equal(good.status, 200);
  assert.match((await good.json()).text, /9 faults instead of 7/);
  const bad = await call("You got 11 faults. It should be 6. Try 3 more questions.");
  assert.equal(bad.status, 422);
  const junk = await handleDoctor(new Request("https://x/api/ai/doctor", { method: "POST", body: "not json" }), {}, { byok: null });
  assert.equal(junk.status, 400);
});
