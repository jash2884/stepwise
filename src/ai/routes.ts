// /api/ai/* dispatcher. Each feature owns one module.
import { parseByok, type Env } from "./models.ts";
import { handleAsk } from "./ask.ts";
import { handleDoctor } from "./doctor.ts";
import { handleSyllabus } from "./syllabus.ts";

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

const FEATURES: Record<string, (req: Request, env: Env, ctx: { byok: ReturnType<typeof parseByok>; ip: string }) => Promise<Response>> = {
  ask: handleAsk, doctor: handleDoctor, syllabus: handleSyllabus,
};

export async function handleAi(request: Request, env: Env & Record<string, any>): Promise<Response> {
  const feature = new URL(request.url).pathname.split("/")[3] ?? "";
  const handler = FEATURES[feature];
  if (!handler) return json({ error: "Not found." }, 404);
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if ((Number(request.headers.get("content-length")) || 0) > 6_000_000) return json({ error: "That's too large." }, 413);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const byok = parseByok(request.headers.get("x-byok"));
  // People using their own key skip the shared allowance.
  if (!byok && env.AI_LIMITER && !(await env.AI_LIMITER.limit({ key: `${feature}:${ip}` })).success) return json({ error: "The free AI allowance is busy. Wait a minute, or add your own key in AI settings." }, 429);
  try { return await handler(request, env, { byok, ip }); }
  catch (e) { console.error(feature, e); return json({ error: "The AI couldn't do that just now. Try again in a moment." }, 502); }
}
