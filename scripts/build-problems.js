// Verifies every candidate in problems-source.js against its platform and
// writes public/js/problems.js with real titles and difficulties. Links that
// don't resolve (or are LeetCode premium) are dropped and listed.
//   node scripts/build-problems.js
import { writeFileSync } from "node:fs";
import { SOURCE } from "./problems-source.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const cache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => { let prev; do { prev = s; s = once(s); } while (s !== prev); return s.trim(); };
const once = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function check(ref) {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "lc") {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: "https://leetcode.com" },
      body: JSON.stringify({ query: "query q($s:String!){question(titleSlug:$s){questionFrontendId title difficulty isPaidOnly}}", variables: { s: id } }),
    });
    const q = (await res.json())?.data?.question;
    if (!q) return { error: "not found" };
    if (q.isPaidOnly) return { error: "premium" };
    return { p: "LeetCode", t: `${q.questionFrontendId}. ${q.title}`, d: q.difficulty, u: `https://leetcode.com/problems/${id}/` };
  }
  if (kind === "cses") {
    const res = await fetch(`https://cses.fi/problemset/task/${id}`, { headers: { "User-Agent": UA } });
    const title = /<title>CSES - ([^<]+)<\/title>/.exec(await res.text())?.[1];
    if (!res.ok || !title) return { error: `HTTP ${res.status}` };
    return { p: "CSES", t: decode(title), u: `https://cses.fi/problemset/task/${id}` };
  }
  if (kind === "hr") {
    const res = await fetch(`https://www.hackerrank.com/rest/contests/master/challenges/${id}`, { headers: { "User-Agent": UA } });
    const m = (await res.json().catch(() => null))?.model;
    if (!m?.name) return { error: "not found" };
    return { p: "HackerRank", t: m.name, d: m.difficulty_name, u: `https://www.hackerrank.com/challenges/${id}/problem` };
  }
  if (kind === "gfg") {
    const res = await fetch(`https://www.geeksforgeeks.org/${id}`, { headers: { "User-Agent": UA }, redirect: "follow" });
    const html = await res.text();
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    if (!res.ok || !title || /404/.test(title)) return { error: `HTTP ${res.status}` };
    return { p: "GeeksforGeeks", t: decode(title.replace(/\s*[-|]\s*GeeksforGeeks\s*$/, "")), u: res.url };
  }
  return { error: "unknown platform" };
}

const out = {}, failed = [];
for (const [slug, refs] of Object.entries(SOURCE)) {
  out[slug] = [];
  for (const ref of refs) {
    if (!cache.has(ref)) {
      let r;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { r = await check(ref); break; } catch (e) { r = { error: e.message }; await sleep(1500); }
      }
      cache.set(ref, r);
      await sleep(250);
    }
    const r = cache.get(ref);
    if (r.error) failed.push(`${slug}  ${ref}  (${r.error})`);
    else out[slug].push(Object.fromEntries(Object.entries(r).filter(([, v]) => v)));
  }
  process.stdout.write(`${slug}: ${out[slug].length}/${refs.length}\n`);
}

const body = `// Practice problems on other platforms, one list per tool. Generated and
// link-checked by scripts/build-problems.js from scripts/problems-source.js;
// edit the source and re-run rather than editing this file.
// p = platform, t = title, d = difficulty, u = URL.
export const PROBLEMS = ${JSON.stringify(out, null, 1).replace(/\n\s+(?=[{}\]"])/g, " ").replace(/\n\s+\]/g, " ]")};
`;
writeFileSync(new URL("../public/js/problems.js", import.meta.url), body);
console.log(`\n${Object.values(out).flat().length} links written; ${failed.length} dropped:`);
for (const f of failed) console.log("  " + f);
