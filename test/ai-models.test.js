import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson, parseByok, cosine } from "../src/ai/models.ts";

test("JSON is pulled out of chatty model replies", () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"tool":"x","p":{"a":"{b}"}}\n``` hope that helps'), { tool: "x", p: { a: "{b}" } });
  assert.deepEqual(extractJson('{"s":"quote \\" and } brace"}'), { s: 'quote " and } brace' });
  assert.throws(() => extractJson("no json here"));
});

test("bring-your-own-key header", () => {
  assert.deepEqual(parseByok("openai:sk-123|gpt-4o"), { provider: "openai", key: "sk-123", model: "gpt-4o" });
  assert.equal(parseByok("evil:abc"), null);
  assert.equal(parseByok(null), null);
});

test("cosine", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
