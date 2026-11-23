// /api/ai/ask: "Ask anything, see it happen" and "Snap a question".
//   { action: "transcribe", image: "data:image/jpeg;base64,..." } -> { transcript }
//   { action: "route", q: "...", transcript?: {...}, intent?: "solve" }     -> routed result
// Rate limiting, BYOK and error wrapping live in routes.ts. The pipeline itself
// is in ask/route.ts; it takes the model functions as arguments so it can be
// tested with a fake model.
import { embed, generate, type Byok, type Env } from "./models.ts";
import { json } from "./routes.ts";
import { ask, transcribe, LIMITS, type Deps, type Transcript } from "./ask/route.ts";

export function depsFor(env: Env, byok: Byok): Deps {
  return {
    generate: (req) => generate(env, req, byok),
    embed: env.AI ? (texts) => embed(env, texts) : undefined,
  };
}

function readTranscript(t: any): Transcript | null {
  if (!t || typeof t !== "object") return null;
  const stem = String(t.stem ?? "").trim().slice(0, LIMITS.query);
  if (!stem) return null;
  const options = (Array.isArray(t.options) ? t.options : []).map((o: unknown) => String(o).trim().slice(0, LIMITS.option)).filter(Boolean).slice(0, LIMITS.options);
  return { stem, given: String(t.given ?? "").slice(0, 600), options };
}

export async function handleAsk(request: Request, env: Env, ctx: { byok: Byok }): Promise<Response> {
  if (!env.AI && !env.GEMINI_API_KEY && !ctx.byok) return json({ error: "The AI isn't switched on here. Add your own key in AI settings." }, 503);
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Send a JSON body." }, 400);
  const deps = depsFor(env, ctx.byok);
  try {
    if (body.action === "transcribe") {
      const image = String(body.image ?? "");
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) return json({ error: "Send the photo as a JPEG, PNG or WebP image." }, 400);
      if (image.length > LIMITS.image) return json({ error: "That photo is too large. Try a smaller one." }, 413);
      return json({ transcript: await transcribe(image, deps) });
    }
    const q = String(body.q ?? "").trim();
    if (q.length > LIMITS.query) return json({ error: `Keep questions under ${LIMITS.query} characters.` }, 413);
    const transcript = readTranscript(body.transcript);
    if (!q && !transcript) return json({ error: "Type a question first." }, 400);
    const intent = body.intent === "solve" ? "solve" : undefined;
    const result = await ask({ q, transcript, intent }, deps);
    // The model log is for debugging only; keep it out of production replies unless asked.
    if (!body.debug) delete (result as any).log;
    return json(result);
  } catch (e: any) {
    if (e?.status && e.status < 500) return json({ error: e.message }, e.status);
    const msg = String(e?.message ?? "");
    // Honest errors for the two known Workers AI failures (codes from Cloudflare).
    if (/\b4006\b|daily free allocation/.test(msg)) return json({ error: "Today's free AI allowance is used up. Try again tomorrow, or add your own key in AI settings." }, 429);
    if (/\b5016\b|submit the prompt 'agree'/.test(msg)) return json({ error: "Reading photos isn't switched on for the free models yet. Type the question instead, or add your own Gemini, OpenAI or Anthropic key in AI settings." }, 503);
    if (/timed out/.test(msg)) return json({ error: "The AI took too long to answer. Try again, or try a shorter question." }, 504);
    throw e;
  }
}
