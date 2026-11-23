// "Ask anything, see it happen": the router. The model never computes an
// answer. It reads the request, picks a tool from the retrieved candidates and
// fills its inputs; the tool's own engine (run through validate()) produces the
// answer, and engine errors go back to the model for repair.
//
// Everything model-facing goes through injected functions, so tests can run the
// whole pipeline with a fake model.
import { SCHEMA_BY_SLUG, check, describe } from "../../../public/js/ai/tool-schemas.js";
import { retrieve, type Card, type Embedder } from "./retrieve.ts";
import { answerValue, matchOption, stripLabel } from "./verify.ts";
import type { GenRequest, Msg } from "../models.ts";

export type Generate = (req: GenRequest) => Promise<{ text: string; data?: any; model: string }>;
export type Deps = { generate: Generate; embed?: Embedder; timeoutMs?: number };
export type Intent = "show" | "solve" | "explain";
export type Transcript = { stem: string; given?: string; options: string[] };

export const LIMITS = { query: 1200, option: 240, options: 6, image: 2_000_000, repairs: 2, samples: 3, candidates: 6 };

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: any;
  return Promise.race([p, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); })]).finally(() => clearTimeout(timer));
}

const SYSTEM = `You route a computer-science student's request to one of Stepwise's step-by-step visualisers and fill in its inputs.
Rules:
- Never compute or state the final numeric answer yourself. A deterministic engine computes it from the inputs you fill.
- Pick exactly one tool from the candidates (use its slug). If none fits, use "tool": null.
- params: only keys listed for that tool, values in exactly the stated formats. Copy every number from the question faithfully; leave a param out to use its default.
- intent: "solve" if they want an answer to a specific problem with given data, "show" if they want to see something run, "explain" if they ask a conceptual question (why, how, difference between...).
- ask: for "solve", the answer key (from the tool's answer keys) that the question asks for, else null.
- For "explain": choose params for a small preset that demonstrates the idea (e.g. a long job arriving with several short ones to show SJF starvation), and put a short, accurate explanation (at most 4 sentences, British English, no em dashes) in reply.
- For "show"/"solve": reply is one sentence saying what you set up. Do not state the answer.
- understood: one sentence restating the request.
Reply with JSON only: {"tool": slug|null, "params": {...}, "intent": "show"|"solve"|"explain", "ask": key|null, "understood": "...", "reply": "..."}`;

function candidateBlock(cards: Card[]) {
  return cards.map((c, i) => {
    const s = SCHEMA_BY_SLUG.get(c.slug);
    return `#${i + 1} ${c.slug}: ${c.title} (${c.subject}). ${c.description}\n${s ? describe(s) : "  (no inputs: open it as is)"}`;
  }).join("\n\n");
}

function userPrompt(query: string, cards: Card[], t?: Transcript | null) {
  const q = t ? `A question from a photo (solve it):\n${t.stem}${t.given ? `\nGiven: ${t.given}` : ""}${t.options.length ? `\nOptions:\n${t.options.map((o, i) => `(${"ABCDEF"[i]}) ${o}`).join("\n")}` : ""}` : query;
  return `Candidate tools:\n\n${candidateBlock(cards)}\n\nStudent request:\n"""${q}"""`;
}

type Parse = { tool: string | null; params: Record<string, unknown>; intent: Intent; ask: string | null; understood: string; reply: string };

function readParse(data: any, allowed: Set<string>): Parse | string {
  if (!data || typeof data !== "object") return "Reply with a JSON object.";
  const tool = data.tool === null || data.tool === "null" || data.tool === "" ? null : String(data.tool ?? "");
  if (tool !== null && !allowed.has(tool)) return `"${tool}" is not one of the candidate slugs. Use one of: ${[...allowed].join(", ")}, or null.`;
  const intent = (["show", "solve", "explain"].includes(data.intent) ? data.intent : "show") as Intent;
  const params = data.params && typeof data.params === "object" && !Array.isArray(data.params) ? data.params : {};
  return { tool, params, intent, ask: typeof data.ask === "string" && data.ask ? data.ask : null, understood: String(data.understood ?? "").slice(0, 400), reply: String(data.reply ?? "").slice(0, 1200) };
}

// One model call plus up to two repair rounds driven by parse and engine errors.
async function parseAndCheck(deps: Deps, messages: Msg[], allowed: Set<string>, temperature: number, log: string[]) {
  const convo = [...messages];
  let last: { parse: Parse; result: ReturnType<typeof check> | null } | null = null;
  for (let attempt = 0; attempt <= LIMITS.repairs; attempt++) {
    let out;
    try {
      out = await withTimeout(deps.generate({ messages: convo, json: true, temperature, maxTokens: 700, tier: "smart" }), deps.timeoutMs ?? 25_000, "The model");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`attempt ${attempt + 1}: ${msg}`);
      // A reply with no JSON gets one more chance; a dead model doesn't.
      if (/JSON/i.test(msg) && attempt < LIMITS.repairs) { convo.push({ role: "user", content: "That wasn't valid JSON. Reply with the JSON object only." }); continue; }
      if (last) return last;
      throw e;
    }
    const p = readParse(out.data, allowed);
    if (typeof p === "string") {
      log.push(`attempt ${attempt + 1}: ${p}`);
      convo.push({ role: "assistant", content: out.text.slice(0, 2000) }, { role: "user", content: `${p} Fix it and reply with the JSON object only.` });
      continue;
    }
    if (!p.tool) return { parse: p, result: null };
    const schema = SCHEMA_BY_SLUG.get(p.tool);
    const result = schema ? check(schema, p.params) : { ok: true as const, params: {}, url: `/${p.tool}`, answer: { text: "", values: {} } };
    last = { parse: p, result };
    if (result.ok) return last;
    log.push(`attempt ${attempt + 1}: ${p.tool}: ${result.error}`);
    convo.push({ role: "assistant", content: JSON.stringify({ tool: p.tool, params: p.params, intent: p.intent, ask: p.ask }) },
      { role: "user", content: `The ${p.tool} engine rejected those inputs: ${result.error}\nCheck the format described for that tool, fix the params (or pick another candidate) and reply with the full JSON object only.` });
  }
  if (last) return last;
  throw new Error("The model's replies couldn't be read.");
}

export type AskInput = { q?: string; transcript?: Transcript | null; intent?: Intent };

export async function ask(input: AskInput, deps: Deps) {
  const log: string[] = [];
  const t = input.transcript ?? null;
  const query = String(t ? `${t.stem} ${t.options.join(" ")}` : input.q ?? "").trim().slice(0, LIMITS.query);
  if (!query) throw Object.assign(new Error("Type a question first."), { status: 400 });

  const hits = await retrieve(query, { embedder: deps.embed, k: LIMITS.candidates });
  const cards = hits.map((h) => h.card);
  const allowed = new Set(cards.map((c) => c.slug));
  const messages: Msg[] = [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt(query, cards, t) }];
  const { parse, result } = await parseAndCheck(deps, messages, allowed, 0.1, log);
  if (t) parse.intent = "solve";
  if (input.intent) parse.intent = input.intent;

  const base = {
    understood: parse.understood || query.slice(0, 200), intent: parse.intent, reply: parse.reply,
    candidates: hits.map((h) => ({ slug: h.card.slug, title: h.card.title })),
    transcript: t,
  };
  if (!parse.tool || !result) return { ...base, tool: null, verified: false, confidence: "low" as const, notes: ["No visualiser fits this request well. Try one of the candidates."] };

  const card = cards.find((c) => c.slug === parse.tool)!;
  const tool = { slug: card.slug, title: card.title, subject: card.subject };
  if (!result.ok) {
    return { ...base, tool, url: `/${card.slug}`, params: null, verified: false, confidence: "low" as const,
      error: `The engine couldn't use the inputs the model read (${result.error}). The visualiser opens with its own example so you can type them in.`, log };
  }
  const out: any = { ...base, tool, url: result.url, params: result.params, engine: result.answer.text, verified: false, confidence: "low", log };
  if (parse.intent !== "solve") { out.confidence = "n/a"; return out; }

  // --- Solve: program-aided verification ----------------------------------------------
  const options = (t?.options ?? []).map(stripLabel).filter(Boolean);
  const picked = answerValue(result.answer.values, parse.ask);
  out.answer = picked ? { key: picked.key, value: picked.value } : null;
  if (options.length) {
    const hit = picked ? matchOption(picked.value, options) : -1;
    if (hit >= 0) Object.assign(out, { verified: true, verifiedBy: "options", option: hit, confidence: "high" });
    else {
      // Self-consistency: re-read the question a few times at a higher temperature
      // and keep the parse whose engine answer lands on an option.
      for (let i = 0; i < LIMITS.samples; i++) {
        let alt;
        try { alt = await parseAndCheck(deps, messages, allowed, 0.7, log); } catch { continue; }
        if (!alt.parse.tool || !alt.result?.ok) continue;
        const v = answerValue(alt.result.answer.values, alt.parse.ask);
        const at = v ? matchOption(v.value, options) : -1;
        if (at >= 0) {
          const altCard = cards.find((c) => c.slug === alt.parse.tool)!;
          Object.assign(out, { tool: { slug: altCard.slug, title: altCard.title, subject: altCard.subject }, url: alt.result.url, params: alt.result.params, engine: alt.result.answer.text,
            answer: { key: v!.key, value: v!.value }, verified: true, verifiedBy: "resample", option: at, confidence: "medium", understood: alt.parse.understood || out.understood });
          break;
        }
      }
      if (!out.verified) out.notes = ["The engine's answer for this reading of the question doesn't match any option, so check the inputs below before trusting it."];
    }
  } else if (picked) {
    // No options to check against: agreement between independent readings.
    let agree = 1, total = 1;
    for (let i = 0; i < 2; i++) {
      let alt;
      try { alt = await parseAndCheck(deps, messages, allowed, 0.7, log); } catch { continue; }
      total++;
      const v = alt.parse.tool === parse.tool && alt.result?.ok ? answerValue(alt.result.answer.values, alt.parse.ask ?? parse.ask) : null;
      if (v && String(v.value) === String(picked.value)) agree++;
    }
    out.agreement = `${agree}/${total}`;
    if (agree === total && total >= 3) Object.assign(out, { verified: true, verifiedBy: "agreement", confidence: "medium" });
    else out.notes = ["Different readings of the question gave different answers, so check the inputs below."];
  } else {
    out.notes = ["The engine ran, but the model didn't say which quantity the question asks for. Read the result below."];
  }
  return out;
}

// --- Snap a question: transcribe a photo --------------------------------------------------
const TRANSCRIBE = `Transcribe the exam question in this image exactly. Do not solve it.
Return JSON: {"stem": "the full question text, including any table as rows like 'P1 | 0 | 5'", "given": "any data given separately, or empty", "options": ["option text without its (A)/(B) label", ...]}.
Use an empty options list if there are none. Keep numbers, symbols and units exactly as written.`;

export async function transcribe(image: string, deps: Deps): Promise<Transcript> {
  const out = await withTimeout(deps.generate({ messages: [{ role: "user", content: TRANSCRIBE }], images: [image], json: true, temperature: 0, maxTokens: 900 }), deps.timeoutMs ?? 30_000, "Reading the photo");
  const d = out.data ?? {};
  const stem = String(d.stem ?? "").trim().slice(0, LIMITS.query);
  if (stem.length < 5) throw Object.assign(new Error("I couldn't read a question in that photo. Try a sharper, closer shot."), { status: 422 });
  const options = (Array.isArray(d.options) ? d.options : []).map((o: unknown) => stripLabel(String(o)).slice(0, LIMITS.option)).filter(Boolean).slice(0, LIMITS.options);
  return { stem, given: String(d.given ?? "").slice(0, 600), options };
}
