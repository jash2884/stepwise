// /api/ai/ask: retrieval, routing, the repair loop, JSON failures and
// program-aided verification, all with a fake model injected.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ask, transcribe } from "../src/ai/ask/route.ts";
import { retrieve, tokens, bm25Index } from "../src/ai/ask/retrieve.ts";
import { matchOption, same, stripLabel } from "../src/ai/ask/verify.ts";
import { handleAsk } from "../src/ai/ask.ts";
import { cardsSource } from "../scripts/ai-cards.js";

// A fake generate(): replies come off a queue; an Error in the queue is thrown.
function fakeModel(replies) {
  const calls = [];
  const generate = async (req) => {
    calls.push({ ...req, messages: [...req.messages] });
    const r = replies.length > 1 ? replies.shift() : replies[0];
    if (r instanceof Error) throw r;
    const data = typeof r === "function" ? r(req) : r;
    return { text: JSON.stringify(data), data, model: "fake" };
  };
  return { generate, calls };
}

const RR = { algo: "rr", q: 2, p: "0-5-0_1-3-0_2-1-0" }; // RR q=2: CT P1 9, P2 8, P3 5; avg WT = (4+4+2)/3

test("the generated cards file is up to date", () => {
  assert.equal(readFileSync(new URL("../src/ai/ask/tool-cards.js", import.meta.url), "utf8"), cardsSource(), "run node scripts/ai-cards.js");
});

test("BM25 retrieval finds the right tool, in English and Hinglish", async () => {
  const top = async (q) => (await retrieve(q, { k: 6 })).map((h) => h.card.slug);
  assert.equal((await top("round robin average waiting time"))[0], "cpu-scheduling");
  assert.ok((await top("round robin ka average waiting time kitna hoga")).includes("cpu-scheduling"));
  assert.ok((await top("how many page faults with LRU and 3 frames")).slice(0, 3).includes("page-replacement"));
  assert.ok((await top("subnet mask for 200 hosts")).includes("subnetting"));
  assert.deepEqual(tokens("Pages, the LRU!"), ["page", "lru"]);
  const score = bm25Index(["apple banana", "banana banana cherry", "dog"]);
  const s = score("banana");
  assert.ok(s[1] > s[0] && s[2] === 0);
});

test("dense scores are fused with BM25 by reciprocal rank", async () => {
  // A fake embedder that puts every card far away except "hnsw".
  const embedder = async (texts) => texts.map((t) => (/^HNSW vector|zzqx/.test(t) ? [1, 0] : [0, 1]));
  const hits = await retrieve("zzqx", { embedder, k: 3 });
  assert.equal(hits[0].card.slug, "hnsw");
  assert.ok(hits[0].dense > 0.99);
  // A failing embedder falls back to BM25 instead of failing the request.
  const bad = await retrieve("round robin quantum", { embedder: async () => { throw new Error("down"); }, k: 3 });
  assert.equal(bad[0].card.slug, "cpu-scheduling");
});

test("routes a typed request to a tool with engine-checked params", async () => {
  const m = fakeModel([{ tool: "cpu-scheduling", params: RR, intent: "show", ask: null, understood: "Round robin, q = 2.", reply: "Set up RR." }]);
  const r = await ask({ q: "Show round robin with quantum 2 for P1 0 5, P2 1 3, P3 2 1" }, { generate: m.generate });
  assert.equal(r.tool.slug, "cpu-scheduling");
  assert.equal(r.url, "/cpu-scheduling?algo=rr&q=2&p=0-5-0_1-3-0_2-1-0");
  assert.match(r.engine, /Round Robin/);
  assert.equal(r.verified, false);
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].json, true);
  assert.match(m.calls[0].messages[1].content, /cpu-scheduling/);
});

test("engine errors are fed back for repair, at most twice", async () => {
  const m = fakeModel([
    { tool: "cpu-scheduling", params: { algo: "rr", p: "P1=0,5 P2=1,3" }, intent: "solve", ask: "avgWT" },
    { tool: "cpu-scheduling", params: RR, intent: "solve", ask: "avgWT" },
  ]);
  const r = await ask({ q: "RR q 2 ..." }, { generate: m.generate });
  assert.equal(m.calls.length, 1 + 1 + 2); // first parse, the repair, then two agreement samples
  assert.match(m.calls[1].messages.at(-1).content, /engine rejected/);
  assert.equal(r.answer.value, 3.3333);
  assert.equal(r.verified, true);
  assert.equal(r.verifiedBy, "agreement");

  const stuck = fakeModel([{ tool: "page-replacement", params: { f: 99 }, intent: "show" }]);
  const s = await ask({ q: "page faults" }, { generate: stuck.generate });
  assert.equal(stuck.calls.length, 3);
  assert.equal(s.verified, false);
  assert.match(s.error, /at most 8/);
  assert.equal(s.url, "/page-replacement");
});

test("JSON failures and unknown slugs get another try", async () => {
  const m = fakeModel([new Error("All models failed: fake: No JSON in reply"), { tool: "not-a-tool", params: {} }, { tool: "page-replacement", params: { r: "1 2 3 1", f: 3, algo: "fifo" }, intent: "show" }]);
  const r = await ask({ q: "fifo with 3 frames on 1 2 3 1" }, { generate: m.generate });
  assert.equal(r.tool.slug, "page-replacement");
  assert.match(m.calls[1].messages.at(-1).content, /valid JSON/);
  assert.match(m.calls[2].messages.at(-1).content, /not one of the candidate slugs/);
  // A model that is down altogether is an honest error, not a made-up answer.
  const dead = fakeModel([new Error("All models failed: timeout")]);
  await assert.rejects(ask({ q: "anything" }, { generate: dead.generate }), /All models failed/);
});

test("no tool fits: an honest reply with candidates", async () => {
  const m = fakeModel([{ tool: null, params: {}, intent: "explain", reply: "Stepwise has no visualiser for that." }]);
  const r = await ask({ q: "what is the capital of France" }, { generate: m.generate });
  assert.equal(r.tool, null);
  assert.equal(r.candidates.length, 6);
});

test("a question with options is verified when the engine's answer is an option", async () => {
  const transcript = { stem: "RR with q = 2 ... average waiting time?", options: ["(A) 2.67", "(B) 3.33", "(C) 4.00", "(D) 5.00"] };
  const m = fakeModel([{ tool: "cpu-scheduling", params: RR, intent: "solve", ask: "avgWT" }]);
  const r = await ask({ transcript }, { generate: m.generate });
  assert.equal(r.verified, true);
  assert.equal(r.verifiedBy, "options");
  assert.equal(r.option, 1);
  assert.equal(r.confidence, "high");
  assert.match(r.engine, /average waiting time 3.3333/);
  assert.equal(r.intent, "solve");
});

test("a misread is caught: resampling keeps the parse that lands on an option", async () => {
  const transcript = { stem: "RR with q = 2 ... average waiting time?", options: ["3.33", "4.50", "5.00", "6.00"] };
  const wrong = { tool: "cpu-scheduling", params: { ...RR, q: 1 }, intent: "solve", ask: "avgWT" }; // q misread
  const m = fakeModel([wrong, wrong, { tool: "cpu-scheduling", params: RR, intent: "solve", ask: "avgWT" }]);
  const r = await ask({ transcript }, { generate: m.generate });
  assert.equal(r.verified, true);
  assert.equal(r.verifiedBy, "resample");
  assert.equal(r.confidence, "medium");
  assert.equal(r.params.q, "2");
  assert.ok(m.calls.slice(1).every((c) => c.temperature > 0.5));

  const never = fakeModel([wrong]);
  const n = await ask({ transcript }, { generate: never.generate });
  assert.equal(n.verified, false);
  assert.equal(n.confidence, "low");
  assert.equal(never.calls.length, 4); // one parse plus three samples
  assert.match(n.notes[0], /doesn't match any option/);
});

test("explain intent gives a short explanation plus a demonstrating preset", async () => {
  const m = fakeModel([{ tool: "cpu-scheduling", params: { algo: "sjf", p: "0-20-0_1-2-0_2-2-0_3-2-0" }, intent: "explain", reply: "SJF always picks the shortest ready job, so a long job can wait while short ones keep arriving.", understood: "Why SJF starves long jobs." }]);
  const r = await ask({ q: "why does SJF starve long jobs?" }, { generate: m.generate });
  assert.equal(r.intent, "explain");
  assert.match(r.reply, /shortest/);
  assert.match(r.url, /algo=sjf/);
  assert.equal(r.answer, undefined);
});

test("snap a question: transcription keeps options and strips labels", async () => {
  const m = fakeModel([{ stem: "Consider 3 frames and the reference string 1 2 3 4 1 2 5. How many faults with FIFO?", options: ["(A) 5", "(B) 6", "C. 7", "D) 8"] }]);
  const t = await transcribe("data:image/jpeg;base64,AAAA", { generate: m.generate });
  assert.deepEqual(t.options, ["5", "6", "7", "8"]);
  assert.equal(m.calls[0].images.length, 1);
  const blank = fakeModel([{ stem: "", options: [] }]);
  await assert.rejects(transcribe("data:image/jpeg;base64,AAAA", { generate: blank.generate }), /couldn't read a question/);
});

test("option matching", () => {
  assert.equal(stripLabel("(B) 3.33 ms"), "3.33 ms");
  assert.ok(same(3.3333, "3.33"));
  assert.ok(same(3.3333, "3.33 ms"));
  assert.ok(same(0.25, "25%"));
  assert.ok(same(true, "Yes"));
  assert.ok(same("A B C D", "A, B, C, D"));
  assert.ok(!same("A B C D", "D C B A"));
  assert.ok(same("{ a b $ }", "{$, a, b}"));
  assert.ok(same("1/3", "0.333"));
  assert.equal(matchOption(9, ["8", "9", "10", "11"]), 1);
  assert.equal(matchOption(9, ["9", "9.0", "10", "11"]), -1); // ambiguous
  assert.equal(matchOption(undefined, ["1"]), -1);
});

test("the handler caps input sizes and checks images", async () => {
  const env = { AI: { run: async () => ({ response: "{}" }) } };
  const post = (body) => new Request("https://x/api/ai/ask", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await handleAsk(post({ q: "x".repeat(5000) }), env, { byok: null })).status, 413);
  assert.equal((await handleAsk(post({ action: "transcribe", image: "data:text/html;base64,AAAA" }), env, { byok: null })).status, 400);
  assert.equal((await handleAsk(post({ action: "transcribe", image: `data:image/jpeg;base64,${"A".repeat(2_100_000)}` }), env, { byok: null })).status, 413);
  assert.equal((await handleAsk(post({}), env, { byok: null })).status, 400);
  assert.equal((await handleAsk(post({ q: "hi" }), {}, { byok: null })).status, 503);
});

test("known Workers AI failures become honest messages", async () => {
  const post = (body) => new Request("https://x/api/ai/ask", { method: "POST", body: JSON.stringify(body) });
  const failing = (msg) => ({ AI: { run: async () => { throw new Error(msg); } } });
  const quota = await handleAsk(post({ q: "round robin" }), failing("4006: you have used up your daily free allocation"), { byok: null });
  assert.equal(quota.status, 429);
  assert.match((await quota.json()).error, /allowance is used up/);
  const agree = await handleAsk(post({ action: "transcribe", image: "data:image/jpeg;base64,AAAA" }), failing("5016: Prior to using this model, you must submit the prompt 'agree'"), { byok: null });
  assert.equal(agree.status, 503);
  assert.match((await agree.json()).error, /Reading photos/);
});
