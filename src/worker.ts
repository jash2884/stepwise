// Stepwise's only server code: the "Ask about this step" tutor at /api/ask.
// Every other path is a static asset served straight from dist/.
import { clean, messages, SYSTEM, validate } from "./tutor.ts";

type Env = {
  ASSETS: { fetch: (r: Request) => Promise<Response> };
  AI?: { run: (model: string, input: unknown) => Promise<{ response?: string }> };
  ASK_LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  GEMINI_API_KEY?: string;
  GEMINI_MODELS?: string;
  WORKERS_AI_MODEL?: string;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

// Gemini models in order; an overloaded or slow model falls through to the next.
async function gemini(env: Env, msgs: ReturnType<typeof messages>) {
  const models = (env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-flash-latest").split(",").map((m) => m.trim()).filter(Boolean);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
  });
  let last = "no models";
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! }, body, signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { last = `${model} ${res.status}`; if ([400, 401, 403].includes(res.status)) break; continue; }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) return text;
      last = `${model} empty`;
    } catch (e) { last = `${model}: ${e instanceof Error ? e.message : e}`; }
  }
  throw new Error(last);
}

// Cloudflare Workers AI: same account, no key, free daily allowance.
async function workersAi(env: Env, msgs: ReturnType<typeof messages>) {
  const out = await env.AI!.run(env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [{ role: "system", content: SYSTEM }, ...msgs], temperature: 0.4, max_tokens: 700,
  });
  return out.response ?? "";
}

async function ask(request: Request, env: Env) {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!env.GEMINI_API_KEY && !env.AI) return json({ error: "The tutor isn't switched on yet." }, 503);
  if ((Number(request.headers.get("content-length")) || 0) > 20_000) return json({ error: "That's too long." }, 413);
  const r = validate(await request.json().catch(() => null));
  if (typeof r === "string") return json({ error: r }, 400);
  if (env.ASK_LIMITER) {
    const { success } = await env.ASK_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
    if (!success) return json({ error: "You're asking quickly! Wait a minute and try again." }, 429);
  }
  const msgs = messages(r);
  const errors: string[] = [];
  if (env.GEMINI_API_KEY) {
    try { const answer = clean(await gemini(env, msgs)); if (answer) return json({ answer }); } catch (e) { errors.push(String(e)); }
  }
  if (env.AI) {
    try { const answer = clean(await workersAi(env, msgs)); if (answer) return json({ answer }); } catch (e) { errors.push(String(e)); }
  }
  console.error("tutor failed", errors.join(" | "));
  return json({ error: "The tutor couldn't answer just now. Try again in a moment." }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/ask") return ask(request, env);
    if (pathname === "/api/health") return json({ ok: true, tutor: Boolean(env.GEMINI_API_KEY || env.AI) });
    if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
