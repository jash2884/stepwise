// /api/ai/syllabus: "Upload your syllabus, get your roadmap".
//
//   POST { text, verify? }            extract units and topics, then match them
//   POST { course?, units, verify? }  match already-extracted topics (re-run after edits)
//
// 1. Extraction: the chat model turns the syllabus (in chunks if long) into
//    strict JSON { course, units: [{ title, hours?, weight?, topics }] }. Bad
//    JSON is repaired locally, and if it still doesn't validate the model gets
//    one retry with the error. Topics are normalised and de-duplicated.
// 2. Matching: every topic and every catalogue entry (roadmap modules and tool
//    cards, see scripts/syllabus-catalogue.js) is embedded; the catalogue
//    vectors are computed once per isolate and kept in the Cache API. Each
//    topic gets its top 3 by cosine similarity. Above ACCEPT it is matched;
//    between REJECT and ACCEPT the pairs go to the chat model in one batched
//    call that says match or no match per pair with a reason; below REJECT
//    the topic is honestly left as not covered.
//
// Nothing is stored: the text goes to the model and the answer goes back.
import { cosine, embed, EMBED_MODEL, extractJson, generate, type Env, type GenRequest, type Byok } from "./models.ts";
import { json } from "./routes.ts";
import { CATALOGUE, CATALOGUE_VERSION } from "./syllabus-catalogue.js";

// Tuned on test/fixtures/syllabus-labelled.js with scripts/syllabus-tune.js
// against bge-m3 (see the numbers in that script's header).
export const THRESHOLDS = { accept: 0.61, reject: 0.5 };
export const LIMITS = { text: 60_000, chunk: 7_000, chunks: 8, units: 30, topics: 250, topicLength: 80, pairsPerCall: 60 };

export type Topic = { name: string; hours?: number };
export type Unit = { title: string; hours?: number; weight?: string; topics: Topic[] };
export type Extraction = { course: string; units: Unit[] };
export type Candidate = { id: string; score: number };
export type Match = { id: string; score: number; via: "embedding" | "verifier"; reason?: string };
export type Deps = {
  generate: (req: GenRequest) => Promise<{ text: string; model: string }>;
  embed: (texts: string[]) => Promise<number[][]>;
  cache?: { match: (k: string) => Promise<Response | undefined>; put: (k: string, r: Response) => Promise<void> } | null;
  catalogue?: { id: string; title: string; text: string }[];
};

// --- Text clean-up ----------------------------------------------------------------

const FILLER = /^(an? )?(introduction to|intro to|basics of|basic concepts of|overview of|concepts? of|fundamentals of|study of)\s+/i;

// "3.2 Paging;" → "Paging". Short and tidy, first letter capital.
export function normaliseName(raw: unknown): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(unit|module|chapter)\s*[-:.]?\s*([ivxlc]+|\d+)\s*[-:.)]?\s*/i, "");
  s = s.replace(/^([\d.]+|[a-z][.)]|[ivx]+[.)]|[-*•·▪◦])\s+/i, "");
  s = s.replace(/\((contd|continued|cont)\.?\)/gi, "").replace(/[\s.;:,–—-]+$/g, "").trim();
  if (s.length > LIMITS.topicLength) s = `${s.slice(0, s.lastIndexOf(" ", LIMITS.topicLength) > 20 ? s.lastIndexOf(" ", LIMITS.topicLength) : LIMITS.topicLength).trim()}`;
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// Two names are the same topic when their keys match: case, punctuation,
// plurals and "Introduction to" don't count.
export function topicKey(name: string): string {
  return normaliseName(name).replace(FILLER, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim()
    .split(" ").map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");
}

// --- JSON: parse, repair, validate ------------------------------------------------------

// Best effort at turning a broken model reply into JSON: fences, smart quotes,
// trailing commas, unquoted keys, single quotes, and a reply cut off mid-way
// (close the open string, drop a dangling key or comma, close the brackets).
export function repairJson(text: string): any {
  const raw = String(text ?? "");
  const arrayFirst = /^[^{]*\[\s*[{"'\]]/.test(raw.replace(/```(?:json)?/gi, ""));
  if (!arrayFirst) { try { return extractJson(raw); } catch { /* repair below */ } }
  let s = String(text ?? "").replace(/```(?:json)?/gi, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const start = s.search(/[{[]/);
  if (start < 0) throw new Error("No JSON in reply");
  s = s.slice(start);
  if (!s.includes('"') && s.includes("'")) s = s.replace(/'/g, '"');
  s = s.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":');
  // Walk it, tracking open brackets outside strings, and stop at the point
  // where the top-level value closes.
  const stack: string[] = [];
  let inStr = false, esc = false, end = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); if (!stack.length) { end = i + 1; break; } }
  }
  s = s.slice(0, end);
  if (inStr) s += '"';
  s = s.replace(/,\s*([}\]])/g, "$1");
  if (stack.length) {
    s = s.replace(/,\s*"[^"]*"\s*:?\s*$/, (m) => (m.includes(":") ? "" : m)).replace(/[,:]\s*$/, "").replace(/,\s*$/, "");
    s += stack.reverse().join("");
  }
  s = s.replace(/,\s*([}\]])/g, "$1");
  const out = JSON.parse(s);
  return Array.isArray(out) ? { units: out } : out;
}

const num = (x: unknown) => { const n = Number(String(x ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 && n < 500 ? n : undefined; };

// Coerce whatever the model sent into an Extraction, or say why it can't be.
export function validateExtraction(data: any): { value?: Extraction; error?: string } {
  if (!data || typeof data !== "object") return { error: "The reply wasn't a JSON object." };
  const rawUnits = data.units ?? data.modules ?? data.chapters ?? data.syllabus?.units;
  if (!Array.isArray(rawUnits)) return { error: 'The reply needs a "units" array.' };
  const units: Unit[] = [];
  for (const u of rawUnits.slice(0, LIMITS.units)) {
    if (!u || typeof u !== "object") continue;
    const rawTopics = u.topics ?? u.subtopics ?? u.contents ?? [];
    if (!Array.isArray(rawTopics)) continue;
    const topics: Topic[] = [];
    for (const t of rawTopics) {
      const name = normaliseName(typeof t === "string" ? t : t?.name ?? t?.title ?? t?.topic);
      if (!name || name.length < 2) continue;
      const hours = typeof t === "object" ? num(t?.hours) : undefined;
      topics.push(hours ? { name, hours } : { name });
    }
    const title = normaliseName(u.title ?? u.name ?? u.unit ?? "") || `Unit ${units.length + 1}`;
    if (!topics.length) continue;
    const unit: Unit = { title, topics };
    const hours = num(u.hours ?? u.lectures ?? u.lecture_hours);
    if (hours) unit.hours = hours;
    if (u.weight != null && String(u.weight).trim()) unit.weight = String(u.weight).trim().slice(0, 20);
    units.push(unit);
  }
  if (!units.length) return { error: "The reply had no units with topics." };
  return { value: { course: normaliseName(data.course ?? data.course_name ?? data.title ?? "").slice(0, 100), units } };
}

// Units from consecutive chunks: a unit split across a chunk boundary comes
// back twice with the same title, so join those; then drop repeated topics.
export function mergeUnits(parts: Extraction[]): Extraction {
  const units: Unit[] = [];
  let course = "";
  for (const p of parts) {
    course ||= p.course;
    for (const u of p.units) {
      const same = units.find((x) => topicKey(x.title) === topicKey(u.title));
      if (same) {
        same.topics.push(...u.topics);
        if (same.hours == null && u.hours != null) same.hours = u.hours;
        if (same.weight == null && u.weight != null) same.weight = u.weight;
      }
      else units.push({ ...u, topics: [...u.topics] });
    }
  }
  return { course, units: dedupeTopics(units) };
}

// Each topic once, at its first place; units left empty are dropped. Caps
// the total so a huge document can't run up the bill.
export function dedupeTopics(units: Unit[]): Unit[] {
  const seen = new Set<string>();
  let total = 0;
  const out: Unit[] = [];
  for (const u of units) {
    const topics = u.topics.filter((t) => {
      const k = topicKey(t.name);
      if (!k || seen.has(k) || total >= LIMITS.topics) return false;
      seen.add(k); total++;
      return true;
    });
    if (topics.length) out.push({ ...u, topics });
  }
  return out;
}

// Pages (marked "--- Page n ---" by the browser) packed into chunks of at most
// `size` characters; a page longer than that is cut at blank lines.
export function chunkText(text: string, size = LIMITS.chunk): string[] {
  const pages = text.split(/(?=^--- Page \d+ ---$)/m).flatMap((p) => {
    if (p.length <= size) return [p];
    const out: string[] = [];
    let cur = "";
    for (const para of p.split(/\n\s*\n/)) {
      if (cur && cur.length + para.length + 2 > size) { out.push(cur); cur = ""; }
      cur += (cur ? "\n\n" : "") + (para.length > size ? para.slice(0, size) : para);
    }
    if (cur) out.push(cur);
    return out;
  });
  const chunks: string[] = [];
  let cur = "";
  for (const p of pages) {
    if (cur && cur.length + p.length > size) { chunks.push(cur); cur = ""; }
    cur += p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.slice(0, LIMITS.chunks);
}

// --- Extraction -------------------------------------------------------------------

const EXTRACT_SYSTEM = "You turn a university course syllabus into structured JSON for a study planner. You never invent topics that aren't in the text.";

export function extractPrompt(chunk: string, part: number, parts: number): string {
  return `Read ${parts > 1 ? `part ${part} of ${parts} of ` : ""}this syllabus and list its units in order, with their topics.

Rules:
- units: the syllabus's own units, modules or chapters, in order. Keep the unit's title without the "Unit 3:" prefix.
- topics: short normalised names of 1 to 6 words, like "Paging", "Banker's algorithm", "Two-phase locking". Split comma and semicolon lists into separate topics. Leave out filler such as "introduction" or "overview" unless it is the whole topic.
- Skip course objectives, outcomes, assessment schemes, lab experiment lists, textbooks and references.
- hours: the unit's lecture hours if the syllabus gives them. weight: its marks or percentage weight if given, as text like "20%". Leave either out if not given.
- course: the course name if this part gives it, else "".
- If this part starts in the middle of a unit, repeat that unit's title.

Shape: {"course": "Operating Systems", "units": [{"title": "Memory management", "hours": 8, "topics": ["Paging", "Segmentation"]}]}

Reply with one JSON object only, no prose, no code fences.

Syllabus text:
"""
${chunk}
"""`;
}

// Ask for JSON, repair what comes back, validate it, and give the model one
// more go (with the error) if it still isn't right.
export async function askJson<T>(deps: Deps, messages: GenRequest["messages"], check: (d: any) => { value?: T; error?: string }, opts: Partial<GenRequest> = {}): Promise<T> {
  const first = await deps.generate({ messages, json: false, tier: "smart", temperature: 0.1, ...opts });
  let error: string;
  try { const r = check(repairJson(first.text)); if (r.value) return r.value; error = r.error!; }
  catch (e) { error = e instanceof Error ? e.message : String(e); }
  const retry = await deps.generate({
    tier: "smart", temperature: 0, ...opts, json: false,
    messages: [...messages, { role: "assistant", content: first.text.slice(0, 6000) }, { role: "user", content: `That reply couldn't be used: ${error} Send the corrected JSON object only, in the shape asked for.` }],
  });
  const r = check(repairJson(retry.text));
  if (!r.value) throw new Error(r.error);
  return r.value;
}

export async function extract(deps: Deps, text: string): Promise<Extraction> {
  const chunks = chunkText(text);
  const parts = await Promise.all(chunks.map((c, i) => askJson(deps, [
    { role: "system", content: EXTRACT_SYSTEM },
    { role: "user", content: extractPrompt(c, i + 1, chunks.length) },
  ], validateExtraction, { maxTokens: 3000 }).catch((e) => { console.error("syllabus extract", e instanceof Error ? e.message : e); return null; })));
  const ok = parts.filter((p): p is Extraction => !!p);
  if (!ok.length) throw new Error("Couldn't read any units from that text.");
  return mergeUnits(ok);
}

// --- Matching ---------------------------------------------------------------------

// The embedded form of a topic: "name" alone, or with the course name for
// context ("Lock-based protocols" alone looks like networking).
export const TOPIC_CONTEXT: "none" | "course" = "course";
export const topicText = (t: Topic, course = "") => (TOPIC_CONTEXT === "course" && course ? `${t.name} (${course})` : t.name);

// What is embedded for each catalogue entry ("text" = title, outcomes and
// tool summaries; "title" = title alone). Part of the cache key.
// "both" embeds each entry twice and keeps the better similarity.
export const CATALOGUE_TEXT: "text" | "title" | "both" = "text";
export const catalogueTexts = (c: { title: string; text: string }) => (CATALOGUE_TEXT === "title" ? [c.title] : CATALOGUE_TEXT === "text" ? [c.text] : [c.text, c.title]);
// The catalogue id behind each catalogue vector.
export const vectorIds = (catalogue: { id: string; title: string; text: string }[]) => catalogue.flatMap((c) => catalogueTexts(c).map(() => c.id));

let memo: { version: string; vectors: Promise<number[][]> } | null = null;

// Catalogue vectors: once per isolate, and across isolates via the Cache API
// (keyed by catalogue version and embedding model), stored as Float32.
export function catalogueVectors(deps: Deps): Promise<number[][]> {
  const catalogue = deps.catalogue ?? CATALOGUE;
  const version = `${CATALOGUE_VERSION}-${EMBED_MODEL.replace(/\W+/g, "-")}-${catalogue.length}-${CATALOGUE_TEXT}`;
  if (!deps.catalogue && memo?.version === version) return memo.vectors;
  const key = `https://stepwise-cache.internal/syllabus-catalogue/${version}`;
  const vectors = (async () => {
    const hit = deps.cache ? await deps.cache.match(key).catch(() => undefined) : undefined;
    if (hit) {
      const dim = Number(hit.headers.get("x-dim"));
      const flat = new Float32Array(await hit.arrayBuffer());
      const n = vectorIds(catalogue).length;
      if (dim > 0 && flat.length === dim * n) return Array.from({ length: n }, (_, i) => Array.from(flat.subarray(i * dim, (i + 1) * dim)));
    }
    const vecs = await deps.embed(catalogue.flatMap(catalogueTexts));
    if (vecs.length !== vectorIds(catalogue).length) throw new Error("Embedding the catalogue failed.");
    if (deps.cache) {
      const dim = vecs[0].length, flat = new Float32Array(dim * vecs.length);
      vecs.forEach((v, i) => flat.set(v, i * dim));
      await deps.cache.put(key, new Response(flat.buffer, { headers: { "content-type": "application/octet-stream", "x-dim": String(dim), "cache-control": "public, max-age=2592000" } })).catch(() => {});
    }
    return vecs;
  })();
  if (!deps.catalogue) {
    memo = { version, vectors };
    vectors.catch(() => { if (memo?.vectors === vectors) memo = null; });
  }
  return vectors;
}

// The k best catalogue entries for one topic vector, best first.
export function topK(vec: number[], catVecs: number[][], ids: string[], k = 3): Candidate[] {
  const best = new Map<string, number>();
  catVecs.forEach((v, i) => { const sc = cosine(vec, v); if (!(best.get(ids[i])! >= sc)) best.set(ids[i], sc); });
  const scored = [...best].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((c) => ({ id: c.id, score: Math.round(c.score * 1000) / 1000 }));
}

// What to do with a topic from its best similarity.
export function decide(candidates: Candidate[], t = THRESHOLDS): "accept" | "verify" | "reject" {
  const best = candidates[0]?.score ?? 0;
  if (best >= t.accept) return "accept";
  if (best >= t.reject) return "verify";
  return "reject";
}

export type Pair = { topic: string; unit: string; id: string; title: string; text: string };

export function verifierPrompt(course: string, pairs: Pair[]): string {
  return `You check whether a study item teaches a topic from a university syllabus${course ? ` for the course "${course}"` : ""}.
For each numbered pair, say match true only if a student who studies the item would have learnt that topic: the item's description names the topic's concept or a clear part of it. Say false when the two are only related, in the same subject, or one merely uses the other. Most pairs are false.
Examples: "Belady's anomaly" with "Virtual memory and page replacement" is true. "Relational model" with "SQL joins" is false (same subject, different concept). "Process creation" with "Synchronisation and deadlock" is false.
The reason must name what the item covers that is the topic, or why it isn't.

${pairs.map((p, i) => `${i + 1}. Topic: "${p.topic}" (unit: ${p.unit})
   Item: "${p.title}": ${p.text.slice(0, 220)}`).join("\n")}

Reply with one JSON object only, no prose: {"results": [{"pair": 1, "match": true, "reason": "a few words"}]}, one entry for every pair.`;
}

// Read the verifier's answers. Tolerates an array at the top level, string
// verdicts ("yes", "match", "no match") and missing pairs (taken as no).
export function parseVerdicts(data: any, n: number): { match: boolean; reason: string }[] {
  const out = Array.from({ length: n }, () => ({ match: false, reason: "" }));
  const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.pairs) ? data.pairs
    : data && typeof data === "object" ? Object.entries(data).map(([k, v]) => (typeof v === "object" ? { pair: k, ...(v as object) } : { pair: k, match: v })) : [];
  list.forEach((r: any, i: number) => {
    if (!r || typeof r !== "object") return;
    const idx = Number(r.pair ?? r.id ?? r.index ?? i + 1) - 1;
    if (!(idx >= 0 && idx < n)) return;
    const v = r.match ?? r.verdict ?? r.answer;
    const match = v === true || (typeof v === "string" && /^\s*(yes|true|match)\b/i.test(v) && !/no[\s_-]*match/i.test(v));
    out[idx] = { match, reason: String(r.reason ?? r.why ?? "").slice(0, 160) };
  });
  return out;
}

export type MatchedTopic = Topic & { match: Match | null; candidates: Candidate[] };
export type MatchedUnit = Omit<Unit, "topics"> & { topics: MatchedTopic[] };

export async function matchUnits(deps: Deps, course: string, units: Unit[], { verify = true, thresholds = THRESHOLDS } = {}): Promise<{ units: MatchedUnit[]; verified: number; verifierFailed: boolean }> {
  const catalogue = deps.catalogue ?? CATALOGUE;
  const ids = catalogue.map((c) => c.id);
  const vecIds = vectorIds(catalogue);
  const flat = units.flatMap((u, ui) => u.topics.map((t, ti) => ({ u: ui, t: ti, topic: t, unit: u.title })));
  const [catVecs, topicVecs] = await Promise.all([catalogueVectors(deps), flat.length ? deps.embed(flat.map((f) => topicText(f.topic, course))) : Promise.resolve([])]);
  if (topicVecs.length !== flat.length) throw new Error("Embedding the topics failed.");
  const results = flat.map((f, i) => ({ ...f, candidates: topK(topicVecs[i], catVecs, vecIds), match: null as Match | null }));

  const pairs: (Pair & { r: number })[] = [];
  for (const [r, res] of results.entries()) {
    const d = decide(res.candidates, thresholds);
    if (d === "accept") res.match = { id: res.candidates[0].id, score: res.candidates[0].score, via: "embedding" };
    else if (d === "verify") {
      for (const c of res.candidates) if (c.score >= thresholds.reject) {
        const e = catalogue[ids.indexOf(c.id)];
        pairs.push({ r, topic: res.topic.name, unit: res.unit, id: c.id, title: e.title, text: e.text });
      }
    }
  }
  let verifierFailed = false;
  if (pairs.length) {
    if (verify) {
      const batches: (typeof pairs)[] = [];
      for (let i = 0; i < pairs.length; i += LIMITS.pairsPerCall) batches.push(pairs.slice(i, i + LIMITS.pairsPerCall));
      await Promise.all(batches.map(async (batch) => {
        try {
          const verdicts = await askJson(deps, [{ role: "user", content: verifierPrompt(course, batch) }], (d) => ({ value: parseVerdicts(d, batch.length) }), { maxTokens: 60 + batch.length * 40 });
          // Candidates are in score order within a topic, so the first one
          // judged a match is the best.
          batch.forEach((p, i) => {
            const res = results[p.r];
            if (!res.match && verdicts[i].match) res.match = { id: p.id, score: res.candidates.find((c) => c.id === p.id)!.score, via: "verifier", reason: verdicts[i].reason || undefined };
          });
        } catch { verifierFailed = true; batch.forEach((p) => { results[p.r].match ??= fallback(results[p.r].candidates, thresholds); }); }
      }));
    }
    if (!verify) for (const res of results) if (!res.match && decide(res.candidates, thresholds) === "verify") res.match = fallback(res.candidates, thresholds);
  }
  const out: MatchedUnit[] = units.map((u) => ({ ...u, topics: [] as MatchedTopic[] }));
  for (const res of results) out[res.u].topics.push({ ...res.topic, match: res.match, candidates: res.candidates });
  return { units: out, verified: pairs.length, verifierFailed };
}

// Without a verifier, a borderline topic is accepted only in the upper half
// of the band.
function fallback(c: Candidate[], t: { accept: number; reject: number }): Match | null {
  return c[0] && c[0].score >= (t.accept + t.reject) / 2 ? { id: c[0].id, score: c[0].score, via: "embedding" } : null;
}

// --- The endpoint ---------------------------------------------------------------------

export function validateUnitsBody(body: any): { value?: Extraction; error?: string } {
  const r = validateExtraction({ course: body?.course, units: body?.units });
  if (!r.value) return { error: "Send the units to match." };
  return { value: { course: r.value.course, units: dedupeTopics(r.value.units) } };
}

export async function runSyllabus(deps: Deps, body: any) {
  const verify = body?.verify !== false;
  let ex: Extraction;
  if (typeof body?.text === "string") {
    const text = body.text.replace(/\u0000/g, "").trim();
    if (text.length < 40) return { status: 400, data: { error: "That's too short to be a syllabus. Paste the whole thing." } };
    if (text.length > LIMITS.text) return { status: 413, data: { error: `That's over ${LIMITS.text / 1000}k characters. Paste just the course you want.` } };
    ex = await extract(deps, text);
  } else {
    const r = validateUnitsBody(body);
    if (!r.value) return { status: 400, data: { error: "Send the syllabus text, or units to match." } };
    ex = r.value;
  }
  const matched = await matchUnits(deps, ex.course, ex.units, { verify });
  const topics = matched.units.reduce((a, u) => a + u.topics.length, 0);
  const covered = matched.units.reduce((a, u) => a + u.topics.filter((t) => t.match).length, 0);
  return { status: 200, data: { course: ex.course, units: matched.units, stats: { topics, covered, verified: matched.verified, verifierFailed: matched.verifierFailed }, catalogue: CATALOGUE_VERSION } };
}

export async function handleSyllabus(request: Request, env: Env, ctx: { byok: Byok }): Promise<Response> {
  if (!env.AI) return json({ error: "Syllabus matching needs Workers AI, which isn't switched on here." }, 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Send JSON." }, 400);
  const cache = (globalThis as any).caches?.default ?? null;
  const deps: Deps = {
    generate: (req) => generate(env, req, ctx.byok),
    embed: (texts) => embed(env, texts),
    cache,
  };
  const r = await runSyllabus(deps, body);
  return json(r.data, r.status);
}
