import assert from "node:assert/strict";
import { test } from "node:test";
import { PROBLEMS } from "../public/js/problems.js";
import { TOOLS } from "../public/js/tools.js";

test("every tool links to at least one verified practice problem", () => {
  for (const t of TOOLS) {
    const list = PROBLEMS[t.slug] ?? [];
    assert.ok(list.length, `${t.slug} has no practice links`);
    for (const p of list) {
      assert.match(p.u, /^https:\/\/(leetcode\.com|cses\.fi|www\.hackerrank\.com|www\.geeksforgeeks\.org)\//, p.u);
      assert.ok(p.t && p.p, `${t.slug}: ${p.u}`);
    }
  }
});
