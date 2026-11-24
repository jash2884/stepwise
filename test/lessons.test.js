import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWERS } from "../public/js/lessons/answers.js";
import { TOOLS } from "../public/js/tools.js";
import { answers, LESSONS } from "../scripts/lesson-answers.js";
const SUBJECTS = ["dsa", "os"];
test("every tool in a finished subject has a lesson, and no lesson is stray", () => { assert.deepEqual(Object.keys(LESSONS).sort(), TOOLS.filter((t) => SUBJECTS.includes(t.subject)).map((t) => t.slug).sort()); });
test("worked examples match what the engines answer", () => { assert.deepEqual(ANSWERS, answers()); });
test("lessons are complete and use no dashes as punctuation", () => { for (const [slug, l] of Object.entries(LESSONS)) { assert.ok(l.idea.length > 120, slug); for (const k of ["uses", "mistakes", "exam"]) assert.ok(l[k].length >= 2, `${slug} ${k}`); assert.ok(l.example.walk.length >= 3, slug); assert.ok(!/[–—]/.test(JSON.stringify(l)), slug); } });
