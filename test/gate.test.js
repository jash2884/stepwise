// GATE questions: every topic makes well-formed questions from any seed, the
// stored answer passes its own check, and the replay opens the right tool.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPICS, check, generate } from "../public/js/gate-questions.js";
import { TOOLS } from "../public/js/tools.js";
import { gateCard } from "../public/js/gate-link.js";
import { readFileSync } from "node:fs";

test("every topic makes valid questions for many seeds", () => {
  for (const t of TOPICS) {
    for (let seed = 1; seed <= 150; seed++) {
      const q = generate(t.slug, seed);
      const where = `${t.slug} seed ${seed}`;
      assert.ok(["mcq", "msq", "nat"].includes(q.type), where);
      assert.ok(q.marks === 1 || q.marks === 2, where);
      assert.ok(q.stem.length && q.solution.length, where);
      assert.ok(q.replay.startsWith(`/${t.slug}`), where);
      if (q.type === "nat") assert.ok(Number.isFinite(q.answer), where);
      else {
        assert.equal(q.options.length, 4, where);
        assert.equal(new Set(q.options).size, 4, `${where}: duplicate options`);
      }
      if (q.type === "mcq") assert.ok(q.answer >= 0 && q.answer < 4, where);
      if (q.type === "msq") assert.ok(q.answer.length >= 1 && q.answer.every((i) => i >= 0 && i < 4), where);
      assert.equal(check(q, q.answer).correct, true, where);
      assert.equal(check(q, q.answer).score, q.marks, where);
    }
  }
});

test("the same seed gives the same question", () => {
  for (const t of TOPICS) assert.deepEqual(generate(t.slug, 42), generate(t.slug, 42));
});

test("GATE marking", () => {
  const mcq = { type: "mcq", marks: 2, answer: 1 }, msq = { type: "msq", marks: 2, answer: [0, 2] }, nat = { type: "nat", marks: 1, answer: 11.8, tolerance: 0.01 };
  assert.deepEqual(check(mcq, 0), { correct: false, score: -0.67 });
  assert.deepEqual(check(msq, [2, 0]), { correct: true, score: 2 });
  assert.deepEqual(check(msq, [0]), { correct: false, score: 0 });
  assert.equal(check(nat, 11.81).correct, true);
  assert.equal(check(nat, 11.79).correct, true);
  assert.equal(check(nat, 11.7).correct, false);
});

test("every topic is a real tool and has a link card", () => {
  for (const t of TOPICS) {
    assert.ok(TOOLS.some((x) => x.slug === t.slug), t.slug);
    // gate-link.js keeps its own list so tool pages stay light; it must match.
    assert.match(readFileSync(new URL("../public/js/gate-link.js", import.meta.url), "utf8"), new RegExp(`"${t.slug}"`));
  }
  assert.equal(typeof gateCard, "function");
});
