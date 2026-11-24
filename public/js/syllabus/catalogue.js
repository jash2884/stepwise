// What a syllabus topic can be matched against: every roadmap module that
// teaches something in drishi, and every visualiser (tool card). Pure data
// in, pure data out, shared by the browser (to turn a match id back into
// tools, GATE topics, outcomes and hours) and by scripts/syllabus-catalogue.js
// (which writes the id, title and text the Worker embeds).
//
// Ids: "m:<module id>" for a module, "t:<tool slug>" for a tool.

// Modules that are about exam technique rather than a topic, so would only
// attract false matches ("Mixed questions and past papers", "Numericals").
const SKIP_MODULE = /(^rev\.|\.revision$|\.num-|^pl\.(core-quiz|mock|coding-rounds)$)/;

const words = (t) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const sharesWord = (a, b) => { const wa = words(a); return [...words(b)].some((w) => wa.has(w) || wa.has(w.replace(/s$/, "")) || wa.has(`${w}s`)); };
const sameTools = (a, b) => a.length === b.length && a.every((t) => b.includes(t));

export function buildCatalogue(roadmaps, tools) {
  const toolBySlug = new Map(tools.map((t) => [t.slug, t]));
  const gateSlugs = new Set(roadmaps.flatMap((r) => r.stages.flatMap((s) => s.modules.flatMap((m) => m.gate ?? []))));
  const entries = [];
  const kept = [];
  for (const r of roadmaps) for (const stage of r.stages) for (const m of stage.modules) {
    if (!m.tools.length || SKIP_MODULE.test(m.id)) continue;
    // The same tools under another roadmap's wording: keep the first (GATE CS
    // comes first and carries GATE topics) unless the new title shares no
    // word with it, so it adds an angle a syllabus might use ("Chunking and RAG").
    const twin = kept.find((k) => sameTools(k.tools, m.tools));
    if (twin && sharesWord(twin.title, m.title)) continue;
    kept.push(m);
    const summaries = m.tools.map((slug) => toolBySlug.get(slug)?.summary).filter(Boolean);
    entries.push({
      id: `m:${m.id}`, kind: "module", module: m.id, roadmap: r.id, stage: stage.id,
      title: m.title, subject: stage.subject ?? toolBySlug.get(m.tools[0])?.subject ?? null,
      text: `${m.title}. ${m.outcomes.join(". ")}. ${summaries.join(" ")}`,
      tools: [...m.tools], gate: (m.gate ?? []).filter((g) => gateSlugs.has(g)),
      hours: m.hours, outcomes: [...m.outcomes], needs: [...m.needs],
      tryIt: m.tryIt ? m.tryIt.map((t) => ({ ...t })) : undefined,
      reading: m.reading ? m.reading.map((x) => ({ ...x })) : undefined,
    });
  }
  for (const t of tools) {
    const home = kept.find((m) => m.tools.includes(t.slug));
    const single = home && home.tools.length === 1;
    entries.push({
      id: `t:${t.slug}`, kind: "tool", tool: t.slug, title: t.title, subject: t.subject,
      text: `${t.title}. ${t.summary}`,
      tools: [t.slug], gate: gateSlugs.has(t.slug) ? [t.slug] : [],
      hours: home ? Math.max(2, Math.round(home.hours / home.tools.length)) : 3,
      outcomes: single ? [...home.outcomes] : [`Work through the ${t.title} visualiser: ${t.summary.replace(/\.$/, "")}`],
      needs: [],
      tryIt: single && home.tryIt ? home.tryIt.map((x) => ({ ...x })) : home?.tryIt?.filter((x) => x.tool === t.slug).map((x) => ({ ...x })),
      reading: single && home.reading ? home.reading.map((x) => ({ ...x })) : undefined,
    });
  }
  return entries;
}

// The slim form the Worker needs: what to embed and what to show the verifier.
export const forServer = (entries) => entries.map(({ id, title, text }) => ({ id, title, text }));

// A short, stable hash (FNV-1a, base 36), used for catalogue versions and
// personal roadmap ids.
export function shortHash(text, len = 6) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let h2 = 0x9e3779b9;
  for (let i = text.length - 1; i >= 0; i--) { h2 ^= text.charCodeAt(i); h2 = Math.imul(h2, 0x85ebca6b) >>> 0; }
  return (h.toString(36) + h2.toString(36)).padEnd(len, "0").slice(0, len);
}
