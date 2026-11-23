// Browser side of the AI layer. aiCall("ask" | "doctor" | "syllabus", body)
// POSTs to /api/ai/<feature>, adding the user's own key if they set one in
// AI settings (kept in this browser only, sent per request, never stored on
// the server).
const KEY = "stepwise.ai";
export function aiSettings() { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } }
export function saveAiSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }

export async function aiCall(feature, body, { signal } = {}) {
  const s = aiSettings();
  const headers = { "content-type": "application/json" };
  if (s.provider && s.key) headers["x-byok"] = `${s.provider}:${s.key}${s.model ? `|${s.model}` : ""}`;
  const res = await fetch(`/api/ai/${feature}`, { method: "POST", headers, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "The AI couldn't answer just now."), { status: res.status });
  return data;
}
