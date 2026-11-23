// /api/ai/syllabus: owned by its feature agent.
import type { Env } from "./models.ts";
import { json } from "./routes.ts";
export async function handleSyllabus(_request: Request, _env: Env, _ctx: unknown): Promise<Response> {
  return json({ error: "Not built yet." }, 501);
}
