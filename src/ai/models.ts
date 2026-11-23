// The model layer every AI feature goes through. One place to pick models,
// fall back between providers, bring your own key, and keep costs bounded.
//
//   generate(env, req)  text or JSON from a chat model (optionally with images)
//   embed(env, texts)   sentence embeddings for retrieval
//
// Providers, in order: the user's own key (if they sent one), Gemini (if the
// Worker has GEMINI_API_KEY), then Cloudflare Workers AI (free allowance).
// A BYO key arrives per request in the "x-byok" header as "<provider>:<key>"
// and is never stored or logged.

export type Env = {
  AI?: { run: (model: string, input: unknown) => Promise<any> };
  GEMINI_API_KEY?: string;
  AI_LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
};

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type GenRequest = {
  messages: Msg[];
  json?: boolean;              // ask for a single JSON object back
  images?: string[];           // data: URLs (vision)
  maxTokens?: number;
  temperature?: number;
  tier?: "fast" | "smart" | "reason"; // which class of model
};
export type Byok = { provider: "openai" | "anthropic" | "gemini" | "openrouter"; key: string; model?: string } | null;

// Workers AI model choices per tier. Verify names with `wrangler ai models list`
// before changing; a failing model falls through to the next one.
export const WORKERS_MODELS: Record<string, string[]> = {
  fast: ["@cf/meta/llama-3.1-8b-instruct-fast", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  smart: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"],
  reason: ["@cf/qwen/qwq-32b", "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  vision: ["@cf/meta/llama-3.2-11b-vision-instruct"],
};
export const EMBED_MODEL = "@cf/baai/bge-m3"; // multilingual, so Hinglish and Hindi questions retrieve too
export const GEMINI_MODELS = { fast: "gemini-flash-lite-latest", smart: "gemini-flash-latest", reason: "gemini-flash-latest", vision: "gemini-flash-latest" };

export function parseByok(header: string | null): Byok {
  if (!header) return null;
  const i = header.indexOf(":");
  const provider = header.slice(0, i) as NonNullable<Byok>["provider"];
  const rest = header.slice(i + 1);
  const [key, model] = rest.split("|");
  if (!["openai", "anthropic", "gemini", "openrouter"].includes(provider) || !key || key.length > 300) return null;
  return { provider, key, model: model?.slice(0, 100) || undefined };
}

// Pull the first JSON object out of a model reply (models wrap it in prose or fences).
export function extractJson(text: string): any {
  const s = String(text ?? "").replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON in reply");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("Unclosed JSON in reply");
}

export async function generate(env: Env, req: GenRequest, byok: Byok = null): Promise<{ text: string; data?: any; model: string }> {
  const tier = req.images?.length ? "vision" : req.tier ?? "smart";
  const errors: string[] = [];
  const attempts: [string, () => Promise<string>][] = [];
  if (byok) attempts.push([`${byok.provider}:${byok.model ?? "default"}`, () => viaByok(byok, req)]);
  if (env.GEMINI_API_KEY) attempts.push([`gemini:${GEMINI_MODELS[tier as keyof typeof GEMINI_MODELS]}`, () => viaGemini(env.GEMINI_API_KEY!, GEMINI_MODELS[tier as keyof typeof GEMINI_MODELS], req)]);
  if (env.AI) for (const m of WORKERS_MODELS[tier] ?? WORKERS_MODELS.smart) attempts.push([m, () => viaWorkers(env, m, req)]);
  for (const [model, run] of attempts) {
    try {
      const text = stripThinking(await run());
      if (!text) throw new Error("empty");
      if (!req.json) return { text, model };
      return { text, data: extractJson(text), model };
    } catch (e) { errors.push(`${model}: ${e instanceof Error ? e.message : e}`); }
  }
  throw new Error(`All models failed: ${errors.join(" | ")}`);
}

const stripThinking = (t: string) => String(t ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
const jsonHint = "Reply with one JSON object only, no prose, no code fences.";
const withHint = (req: GenRequest): Msg[] => req.json ? [...req.messages.slice(0, -1), { ...req.messages.at(-1)!, content: `${req.messages.at(-1)!.content}\n\n${jsonHint}` }] : req.messages;

async function viaWorkers(env: Env, model: string, req: GenRequest) {
  const messages = withHint(req);
  const input: any = { messages, max_tokens: req.maxTokens ?? 900, temperature: req.temperature ?? 0.2 };
  if (req.images?.length) {
    // Vision model: one image as bytes plus the prompt.
    const b64 = req.images[0].split(",")[1] ?? "";
    input.image = [...Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))];
  }
  const out = await env.AI!.run(model, input);
  return typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
}

async function viaGemini(key: string, model: string, req: GenRequest) {
  const sys = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = withHint(req).filter((m) => m.role !== "system");
  const contents = turns.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }, ...(i === turns.length - 1 ? (req.images ?? []).map((d) => ({ inline_data: { mime_type: d.slice(5, d.indexOf(";")), data: d.split(",")[1] } })) : [])],
  }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents, generationConfig: { temperature: req.temperature ?? 0.2, maxOutputTokens: req.maxTokens ?? 900, ...(req.json ? { responseMimeType: "application/json" } : {}) } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
}

async function viaByok(b: NonNullable<Byok>, req: GenRequest) {
  if (b.provider === "gemini") return viaGemini(b.key, b.model ?? "gemini-flash-latest", req);
  const messages = withHint(req);
  if (b.provider === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system").map((m, i, all) => ({
      role: m.role, content: i === all.length - 1 && req.images?.length
        ? [...req.images.map((d) => ({ type: "image", source: { type: "base64", media_type: d.slice(5, d.indexOf(";")), data: d.split(",")[1] } })), { type: "text", text: m.content }]
        : m.content,
    }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", "x-api-key": b.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: b.model ?? "claude-haiku-5-5", system: sys || undefined, messages: rest, max_tokens: req.maxTokens ?? 900, temperature: req.temperature ?? 0.2 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    return data.content?.map((c: any) => c.text ?? "").join("") ?? "";
  }
  // OpenAI-compatible (OpenAI, OpenRouter).
  const url = b.provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const body = {
    model: b.model ?? (b.provider === "openrouter" ? "openrouter/auto" : "gpt-4o-mini"),
    messages: messages.map((m, i, all) => i === all.length - 1 && req.images?.length ? { role: m.role, content: [{ type: "text", text: m.content }, ...req.images.map((u) => ({ type: "image_url", image_url: { url: u } }))] } : m),
    max_tokens: req.maxTokens ?? 900, temperature: req.temperature ?? 0.2, ...(req.json ? { response_format: { type: "json_object" } } : {}),
  };
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", authorization: `Bearer ${b.key}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  if (!env.AI) throw new Error("Embeddings need Workers AI.");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const r = await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + 50).map((t) => t.slice(0, 2000)) });
    out.push(...(r?.data ?? []));
  }
  return out;
}

export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
