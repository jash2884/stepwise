// Turns a matched syllabus (from /api/ai/syllabus) into a personal roadmap in
// the same shape as the ROADMAPS entries, so the roadmap pages, the planner and
// the progress system work on it unchanged. Pure: no DOM, no storage.
//
//   id        "my-<hash>"; stages are the syllabus units in order
//   modules   one per topic: tools, GATE topics, outcomes and hours borrowed
//             from the matched roadmap module or tool card; unmatched topics
//             keep honest "not covered yet" reading links instead
//   needs     the matched module's own prerequisites when they are earlier in
//             this roadmap, and each unit's first topic needs the last topic
//             of the unit before
//   syllabus  the extracted units, topics and matches it was built from, with
//             a stable key per topic, so edits rebuild it without losing ids
//             (progress is keyed on module ids)
import { shortHash } from "./catalogue.js";

export const ID = /^my-[a-z0-9]{4,12}$/;
const DEFAULT_HOURS = 2;

export const slugify = (s, max = 32) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "") || "topic";
const half = (x) => Math.max(0.5, Math.round(x * 2) / 2);

export const gfgSearch = (topic) => `https://www.geeksforgeeks.org/search/?gq=${encodeURIComponent(topic)}`;
export const googleSearch = (topic, course = "") => `https://www.google.com/search?q=${encodeURIComponent(`${topic}${course ? ` ${course}` : ""}`)}`;

export function roadmapIdFor(course, units) {
  return `my-${shortHash(`${course}|${units.map((u) => `${u.title}:${u.topics.map((t) => t.name).join(",")}`).join("|")}`, 6)}`;
}

// Give every topic a stable key (its module id), keeping keys it already has.
export function withKeys(syllabus, roadmapId) {
  const prefix = `my${roadmapId.slice(3)}`;
  const used = new Set();
  for (const u of syllabus.units) for (const t of u.topics) if (t.key) used.add(t.key);
  return {
    ...syllabus,
    units: syllabus.units.map((u) => ({ ...u, topics: u.topics.map((t) => {
      if (t.key) return t;
      let key = `${prefix}.${slugify(t.name)}`, n = 2;
      while (used.has(key)) key = `${prefix}.${slugify(t.name)}-${n++}`;
      used.add(key);
      return { ...t, key };
    }) })),
  };
}

// syllabus: { course, units: [{ title, hours?, weight?, topics: [{ name, hours?, match, candidates, key? }] }] }
// entries: buildCatalogue(ROADMAPS, TOOLS). Returns the roadmap.
export function assembleRoadmap(syllabus, entries, { id = null, created = Date.now(), updated = created } = {}) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const roadmapId = id ?? roadmapIdFor(syllabus.course ?? "", syllabus.units);
  const src = withKeys({ course: syllabus.course ?? "", units: syllabus.units.filter((u) => u.topics.length) }, roadmapId);
  const course = src.course || "My syllabus";
  // How many topics share each catalogue entry, to split its hours between them.
  const shares = new Map();
  for (const u of src.units) for (const t of u.topics) if (t.match && byId.has(t.match.id)) shares.set(t.match.id, (shares.get(t.match.id) ?? 0) + 1);

  const matchedBy = new Map(); // catalogue module id → local module ids so far
  const stageIds = new Set();
  let prevLast = null, covered = 0, total = 0;
  const stages = src.units.map((u, ui) => {
    let sid = `u${ui + 1}-${slugify(u.title, 28)}`;
    while (stageIds.has(sid)) sid += "-x";
    stageIds.add(sid);
    const modules = u.topics.map((t, ti) => {
      total++;
      const e = t.match ? byId.get(t.match.id) : null;
      const needs = new Set();
      if (ti === 0 && prevLast) needs.add(prevLast);
      if (e) {
        covered++;
        for (const n of e.needs ?? []) for (const local of matchedBy.get(n) ?? []) needs.add(local);
        if (e.module) matchedBy.set(e.module, [...(matchedBy.get(e.module) ?? []), t.key]);
        const m = {
          id: t.key, title: t.name, hours: half(t.hours ?? (e.hours ?? DEFAULT_HOURS) / (shares.get(e.id) ?? 1)), placement: 0,
          needs: [...needs].filter((n) => n !== t.key), outcomes: [...e.outcomes], tools: [...e.tools], gate: [...e.gate],
          match: { id: e.id, title: e.title, score: t.match.score, via: t.match.via, ...(t.match.reason ? { reason: t.match.reason } : {}) },
        };
        if (e.tryIt?.length) m.tryIt = e.tryIt.map((x) => ({ ...x }));
        if (e.reading?.length) m.reading = e.reading.map((x) => ({ ...x }));
        return m;
      }
      return {
        id: t.key, title: t.name, hours: half(t.hours ?? DEFAULT_HOURS), placement: 0,
        needs: [...needs].filter((n) => n !== t.key),
        outcomes: [`Learn ${t.name} from your course notes and textbook`],
        tools: [], gate: [], uncovered: true, comingSoon: "Not covered by Stepwise yet.",
        reading: [{ title: `${t.name} on GeeksforGeeks`, url: gfgSearch(t.name) }, { title: `Search the web for ${t.name}`, url: googleSearch(t.name, src.course) }],
      };
    });
    // Lecture hours for the unit, when the syllabus gives them: about twice
    // that in study time, spread in proportion to each topic's own estimate.
    if (u.hours > 0) {
      const sum = modules.reduce((a, m) => a + m.hours, 0);
      for (const m of modules) m.hours = half((m.hours / sum) * u.hours * 2);
    }
    prevLast = modules.at(-1)?.id ?? prevLast;
    const subjects = modules.flatMap((m) => (m.match ? [byId.get(m.match.id)?.subject] : [])).filter(Boolean);
    const subject = mode(subjects);
    const facts = [`${modules.length} ${modules.length === 1 ? "topic" : "topics"} from your syllabus`];
    if (u.hours) facts.push(`${u.hours} lecture hours`);
    if (u.weight) facts.push(`weight ${u.weight}`);
    return { id: sid, title: u.title, subject, summary: `${facts.join(", ")}.`, modules, ...(u.hours ? { lectureHours: u.hours } : {}), ...(u.weight ? { weight: u.weight } : {}) };
  });
  return {
    id: roadmapId, title: course, local: true, created, updated,
    summary: `Your ${course} syllabus as a roadmap: ${covered} of ${total} topics matched to Stepwise visualisers and practice.`,
    description: `A personal roadmap built from your ${course} syllabus.`,
    howTo: [
      "Units are in your syllabus's order. Topics matched to Stepwise have visualisers and practice; the rest link to reading.",
      "Check the matches below. Rename or remove a topic, then run the matching again if something looks wrong.",
      "Make a study plan from it on the Plan page, with your exam date.",
    ],
    stages,
    syllabus: { course: src.course, units: src.units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ name: t.name, key: t.key, ...(t.hours ? { hours: t.hours } : {}), match: t.match ?? null, candidates: (t.candidates ?? []).slice(0, 3) })) })) },
  };
}

function mode(list) {
  const n = new Map();
  for (const x of list) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// --- Edits (each returns a new roadmap, same id and module ids) ---------------------

export function rebuild(roadmap, syllabus, entries, now = Date.now()) {
  return assembleRoadmap(syllabus, entries, { id: roadmap.id, created: roadmap.created ?? now, updated: now });
}

export function removeTopic(roadmap, key, entries, now) {
  const s = roadmap.syllabus;
  return rebuild(roadmap, { ...s, units: s.units.map((u) => ({ ...u, topics: u.topics.filter((t) => t.key !== key) })).filter((u) => u.topics.length) }, entries, now);
}

// A renamed topic keeps its match until the matching is run again.
export function renameTopic(roadmap, key, name, entries, now) {
  const clean = String(name).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return roadmap;
  const s = roadmap.syllabus;
  return rebuild(roadmap, { ...s, units: s.units.map((u) => ({ ...u, topics: u.topics.map((t) => (t.key === key ? { ...t, name: clean, renamed: true } : t)) })) }, entries, now);
}

// What to send to re-run matching on the current topics.
export const rematchBody = (roadmap) => ({ course: roadmap.syllabus.course, units: roadmap.syllabus.units.map((u) => ({ title: u.title, ...(u.hours ? { hours: u.hours } : {}), ...(u.weight ? { weight: u.weight } : {}), topics: u.topics.map((t) => ({ name: t.name, ...(t.hours ? { hours: t.hours } : {}) })) })) });

// Fold fresh matches back in by unit and topic name, keeping each topic's key.
export function applyRematch(roadmap, result, entries, now) {
  const s = roadmap.syllabus;
  const fresh = new Map();
  result.units.forEach((u) => u.topics.forEach((t) => fresh.set(t.name.toLowerCase(), t)));
  const units = s.units.map((u) => ({ ...u, topics: u.topics.map((t) => {
    const f = fresh.get(t.name.toLowerCase());
    return f ? { name: t.name, key: t.key, ...(t.hours ? { hours: t.hours } : {}), match: f.match ?? null, candidates: f.candidates ?? [] } : t;
  }) }));
  return rebuild(roadmap, { ...s, units }, entries, now);
}

// --- Trust: what comes back out of storage ---------------------------------------------

// A stored roadmap made safe to render: right shape, and only tools and GATE
// topics that exist (an imported file could say anything). null if unusable.
export function sanitiseLocal(r, knownTools, knownGate) {
  if (!r || typeof r !== "object" || !ID.test(r.id) || !Array.isArray(r.stages) || !r.stages.length) return null;
  const str = (x, d = "") => (typeof x === "string" ? x : d);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const ids = new Set();
  const stages = [];
  for (const st of r.stages) {
    if (!st || typeof st.id !== "string" || !/^[a-z0-9-]+$/.test(st.id)) continue;
    const modules = [];
    for (const m of arr(st.modules)) {
      if (!m || typeof m.id !== "string" || !/^[a-z0-9.-]+$/.test(m.id) || ids.has(m.id)) continue;
      ids.add(m.id);
      modules.push({
        ...m, title: str(m.title, "Topic"), hours: Number(m.hours) > 0 ? Number(m.hours) : DEFAULT_HOURS, placement: 0,
        needs: arr(m.needs).filter((n) => typeof n === "string"), outcomes: arr(m.outcomes).filter((o) => typeof o === "string"),
        tools: arr(m.tools).filter((t) => knownTools.has(t)), gate: arr(m.gate).filter((g) => knownGate.has(g)),
        tryIt: arr(m.tryIt).filter((t) => t && knownTools.has(t.tool) && typeof t.query === "string" && typeof t.label === "string"),
        reading: arr(m.reading).filter((x) => x && typeof x.title === "string" && /^https:\/\//.test(x.url ?? "")),
      });
    }
    if (modules.length) stages.push({ ...st, title: str(st.title, "Unit"), summary: str(st.summary), subject: typeof st.subject === "string" ? st.subject : null, modules });
  }
  if (!stages.length) return null;
  for (const st of stages) for (const m of st.modules) m.needs = m.needs.filter((n) => ids.has(n) && n !== m.id);
  return { ...r, local: true, title: str(r.title, "My syllabus"), summary: str(r.summary), description: str(r.description), howTo: arr(r.howTo).filter((x) => typeof x === "string"), stages };
}
