import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, messages, validate } from "../src/tutor.ts";

test("tutor requests are validated and trimmed", () => {
  assert.equal(validate(null), "Send a JSON body.");
  assert.equal(validate({ tool: "sorting", ask: "  " }), "Type a question first.");
  assert.equal(validate({ tool: "../etc", ask: "hi" }), "Unknown tool.");
  const r = validate({ tool: "sorting", title: "Sorting", ask: "x".repeat(5000), code: Array(100).fill("line"), history: Array(20).fill({ role: "user", text: "q" }), vars: { i: 3 } });
  assert.equal(r.ask.length, 600);
  assert.equal(r.code.length, 40);
  assert.equal(r.history.length, 6);
  assert.equal(r.vars.i, "3");
});

test("the prompt marks the executing line and lists variables", () => {
  const r = validate({ tool: "sorting", title: "Sorting", mode: "visualise", note: "Compare 3 and 5.", code: ["for i", "  if A[i] > A[j]"], line: "  if A[i] > A[j]", vars: { i: "2", j: "3" }, ask: "why?" });
  const p = buildPrompt(r);
  assert.match(p, />> +if A\[i\] > A\[j\]/);
  assert.match(p, /i = 2, j = 3/);
  const m = messages(r);
  assert.equal(m.at(-1).content, "why?");
});
