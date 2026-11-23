// /api/ai/doctor: "Explain more" for the mistake doctor.
//
// The diagnosis itself is computed in the browser by the misconception
// library (public/js/ai/doctor.js); the model only rewords it kindly and
// briefly. It is told never to change the numbers, and the reply is checked:
// any sentence with a number that isn't in the inputs is removed, and if
// that leaves too little the reply is refused, so the browser keeps its own
// deterministic explanation.
import { generate, type Byok, type Env } from "./models.ts";
import { json } from "./routes.ts";

type Input = {
  topic: string; diagnosis: string; confidence: number | null; explanation: string;
  yourAnswer: string; rightAnswer: string; step: number | null;
};

const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max).trim() : "");
const int = (x: unknown) => (Number.isFinite(x) ? Math.round(Number(x)) : null);

export function readInput(body: any): Input | null {
  if (!body || typeof body !== "object") return null;
  const input: Input = {
    topic: text(body.topic, 80), diagnosis: text(body.diagnosis, 200), confidence: int(body.confidence),
    explanation: text(body.explanation, 900), yourAnswer: text(body.yourAnswer, 120), rightAnswer: text(body.rightAnswer, 120), step: int(body.step),
  };
  if (!input.topic || !input.yourAnswer || !input.rightAnswer) return null;
  return input;
}

// Every number written in a piece of text (digits only; signs and words are
// left alone), as numbers so 0.50 and 0.5 agree.
export function numbersIn(s: string): number[] {
  return (String(s).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

// Keep only sentences whose numbers all appear in the inputs. Returns the
// cleaned text and how many sentences were dropped; ok is false when nothing
// useful is left or most of the reply had to go.
export function guardNumbers(reply: string, inputs: (string | number | null)[]) {
  const allowed = new Set(inputs.flatMap((x) => (x == null ? [] : numbersIn(String(x)))));
  // Dashes are against the house style; a comma reads the same.
  const clean = String(reply ?? "").replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
  // A sentence ends at . ! or ? followed by a space, so 0.85 stays whole.
  const sentences = clean.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const kept = sentences.filter((x) => numbersIn(x).every((n) => allowed.has(n)));
  const dropped = sentences.length - kept.length;
  const out = kept.join(" ");
  const ok = kept.length > 0 && out.length >= 20 && dropped <= kept.length;
  return { text: out, dropped, ok };
}

export function prompt(input: Input) {
  const facts = [
    `Topic: ${input.topic}`,
    input.diagnosis ? `Diagnosis: the student ${input.diagnosis}${input.confidence != null ? ` (the checker is ${input.confidence}% sure)` : ""}.` : "Diagnosis: none; the checker couldn't tell which mistake this was.",
    input.explanation ? `Explanation: ${input.explanation}` : "",
    `The student's answer: ${input.yourAnswer}. The right answer: ${input.rightAnswer}.`,
    input.step ? `The replay shows the difference at step ${input.step}.` : "",
  ].filter(Boolean).join("\n");
  return [
    { role: "system" as const, content: "You are a kind, encouraging tutor for the GATE computer science exam. Rewrite the diagnosis you are given for the student in two to four short sentences, in British English, speaking to them as \"you\". Explain the idea behind the mistake simply. Use only the numbers that appear in the facts, exactly as written: never change, round, add or work out a number. Don't claim anything about the student that the facts don't say. If there is no diagnosis, encourage them to compare their working with the solution. No lists, no headings, no dashes." },
    { role: "user" as const, content: facts },
  ];
}

export async function handleDoctor(request: Request, env: Env, ctx: { byok: Byok }): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Send the diagnosis as JSON." }, 400); }
  const input = readInput(body);
  if (!input) return json({ error: "Missing the topic or the answers." }, 400);
  const out = await generate(env, { messages: prompt(input), tier: "fast", maxTokens: 260, temperature: 0.3 }, ctx.byok);
  const guarded = guardNumbers(out.text, [input.topic, input.diagnosis, input.confidence, input.explanation, input.yourAnswer, input.rightAnswer, input.step]);
  if (!guarded.ok) return json({ error: "The AI's wording didn't match the diagnosis, so it was left out." }, 422);
  return json({ text: guarded.text, model: out.model, dropped: guarded.dropped });
}
