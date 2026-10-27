// The "Ask about this step" tutor: request validation and prompt building.
// Kept free of Worker APIs so tests can import it directly.

export type Turn = { role: "user" | "tutor"; text: string };
export type AskRequest = {
  tool: string;
  title: string;
  mode: "visualise" | "practice";
  note?: string;
  line?: string;
  code?: string[];
  vars?: Record<string, string>;
  question?: string;   // the practice question on screen, if any
  history?: Turn[];
  ask: string;         // what the student typed
};

const cut = (s: unknown, n: number) => (typeof s === "string" || typeof s === "number" ? String(s).replace(/\s+/g, " ").trim().slice(0, n) : "");
// Pseudocode keeps its indentation.
const cutLine = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\t\r\n]+/g, " ").replace(/\s+$/, "").slice(0, n) : "");

export function validate(body: unknown): AskRequest | string {
  if (!body || typeof body !== "object") return "Send a JSON body.";
  const b = body as Record<string, unknown>;
  const ask = cut(b.ask, 600);
  if (!ask) return "Type a question first.";
  const tool = cut(b.tool, 60);
  if (!/^[a-z0-9-]+$/.test(tool)) return "Unknown tool.";
  const vars: Record<string, string> = {};
  if (b.vars && typeof b.vars === "object") {
    for (const [k, v] of Object.entries(b.vars as Record<string, unknown>).slice(0, 24)) vars[cut(k, 30)] = cut(v, 120);
  }
  const history = Array.isArray(b.history)
    ? (b.history as unknown[]).slice(-6).map((t) => {
      const turn = t as Record<string, unknown>;
      return { role: turn?.role === "tutor" ? "tutor" : "user", text: cut(turn?.text, 1200) } as Turn;
    }).filter((t) => t.text)
    : [];
  return {
    tool, ask, history, vars,
    title: cut(b.title, 80),
    mode: b.mode === "practice" ? "practice" : "visualise",
    note: cut(b.note, 700),
    line: cutLine(b.line, 200),
    code: Array.isArray(b.code) ? (b.code as unknown[]).slice(0, 40).map((l) => cutLine(l, 160)) : [],
    question: cut(b.question, 600),
  };
}

export const SYSTEM = `You are the tutor inside Stepwise, a site of step-by-step algorithm visualisers for computer science students (data structures and algorithms, operating systems, databases, networks, theory of computation, compiler design).
You are given what the student is looking at: the tool, the current step's explanation, the pseudocode with the highlighted line, and the live variable values. Answer their question about it.
Rules:
- Be concrete: refer to the actual values, line and step on screen. Explain why, not just what.
- Keep it short: at most about 150 words unless they ask for more. Plain language, UK spelling.
- Simple formatting only: short paragraphs, "- " bullet lists, **bold** for key terms, \`code\` for identifiers. No headings, no tables.
- If they're on a practice question, give a hint or the reasoning that leads to the answer, not the bare answer, unless they say they've tried and want it.
- If the question isn't about computer science or this tool, say briefly that you can only help with the algorithms on this site.
- If something on screen looks wrong to them, check the reasoning carefully; the visualiser follows the textbook conventions listed on the page.`;

export function buildPrompt(r: AskRequest) {
  const parts = [`Tool: ${r.title || r.tool} (${r.mode === "practice" ? "practice tab" : "visualiser"})`];
  if (r.question) parts.push(`Practice question on screen: ${r.question}`);
  if (r.note) parts.push(`Current step explanation: ${r.note}`);
  if (r.code?.length) parts.push(`Pseudocode (the line marked >> is executing):\n${r.code.map((l) => (l === r.line ? `>> ${l}` : `   ${l}`)).join("\n")}`);
  else if (r.line) parts.push(`Highlighted pseudocode line: ${r.line}`);
  const vars = Object.entries(r.vars ?? {});
  if (vars.length) parts.push(`Variables: ${vars.map(([k, v]) => `${k} = ${v}`).join(", ")}`);
  return parts.join("\n\n");
}

// Turns for the model: context first, then the conversation, then the question.
export function messages(r: AskRequest): { role: "user" | "assistant"; content: string }[] {
  return [
    { role: "user", content: `${buildPrompt(r)}\n\n(Context only. The student's questions follow.)` },
    { role: "assistant", content: "Understood. I can see the step they're on." },
    ...(r.history ?? []).map((t) => ({ role: t.role === "tutor" ? "assistant" as const : "user" as const, content: t.text })),
    { role: "user", content: r.ask },
  ];
}

export function clean(text: unknown) {
  return typeof text === "string" ? text.replace(/^\s*#+\s*/gm, "").trim().slice(0, 4000) : "";
}
