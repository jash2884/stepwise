// The learning store: everything Stepwise remembers about a learner, kept on
// this device only (localStorage, no accounts, no network).
//
// State shape (version 1):
//   v        schema version
//   answers  every answered question, oldest first:
//            { t: topic slug, s: seed, c: correct, sc: score, m: marks,
//              ms: time taken, at: timestamp, src: "gate" | "mock" | "review" | "diagnostic" | "mistakes" }
//   legacy   per-topic { right, total } carried over from the old "stepwise.gate" key
//   mistakes wrong answers to come back to: { t, s, at, ok: understood? }
//   known    topics placed as known by the diagnostic: { slug: timestamp }
//   reviews  spaced repetition per topic: { slug: { step, due } } (see srs.js)
//   done     modules without GATE topics, marked done by hand: { moduleId: timestamp }
//   visits   tool visits: { slug: { n, last } }
//   days     activity per local day: { "YYYY-MM-DD": { q, right, ms, visits } }
//   plan     the study plan settings, or null (see planner.js)
//   mocks    finished mocks: { kind, roadmap?, stage?, at, score, max, n, right, ms }
//
// The pure functions here take and return plain state so they can be tested in
// Node; only the functions under "Storage" touch localStorage, and every one of
// those is wrapped in try/catch (private mode, full storage, blocked storage).

export const KEY = "stepwise.progress";
export const LEGACY_KEY = "stepwise.gate";
export const VERSION = 1;
const MAX_ANSWERS = 3000, MAX_MISTAKES = 400, MAX_MOCKS = 60;
const DAY = 86400000;

export function empty() {
  return { v: VERSION, answers: [], legacy: {}, mistakes: [], known: {}, reviews: {}, done: {}, visits: {}, days: {}, plan: null, mocks: [], migratedGate: false };
}

const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

// Bring anything read from storage (or an imported file) up to the current
// shape, dropping what can't be trusted. legacyGate is the parsed old
// "stepwise.gate" value, folded in once.
export function migrate(raw, legacyGate = null) {
  const s = empty();
  const r = obj(raw);
  if (r.v === VERSION) {
    s.answers = arr(r.answers).filter((a) => a && typeof a.t === "string").map((a) => ({
      t: a.t, s: num(a.s), c: !!a.c, sc: num(a.sc), m: num(a.m, 1), ms: Math.max(0, num(a.ms)), at: num(a.at), src: typeof a.src === "string" ? a.src : "gate",
    })).slice(-MAX_ANSWERS);
    for (const [k, v] of Object.entries(obj(r.legacy))) if (num(v?.total) > 0) s.legacy[k] = { right: Math.min(num(v.right), num(v.total)), total: num(v.total) };
    s.mistakes = arr(r.mistakes).filter((m) => m && typeof m.t === "string").map((m) => ({ t: m.t, s: num(m.s), at: num(m.at), ok: !!m.ok })).slice(-MAX_MISTAKES);
    for (const [k, v] of Object.entries(obj(r.known))) s.known[k] = num(v);
    for (const [k, v] of Object.entries(obj(r.reviews))) if (v) s.reviews[k] = { step: Math.max(0, Math.min(3, num(v.step))), due: num(v.due) };
    for (const [k, v] of Object.entries(obj(r.done))) s.done[k] = num(v);
    for (const [k, v] of Object.entries(obj(r.visits))) if (v) s.visits[k] = { n: num(v.n), last: num(v.last) };
    for (const [k, v] of Object.entries(obj(r.days))) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v) s.days[k] = { q: num(v.q), right: num(v.right), ms: num(v.ms), visits: num(v.visits) };
    s.plan = r.plan && typeof r.plan === "object" ? { ...r.plan } : null;
    s.mocks = arr(r.mocks).filter((m) => m && typeof m === "object").slice(-MAX_MOCKS);
    s.migratedGate = !!r.migratedGate;
  }
  if (!s.migratedGate && legacyGate && typeof legacyGate === "object") {
    for (const [slug, v] of Object.entries(legacyGate)) {
      const total = num(v?.total), right = Math.min(num(v?.right), total);
      if (total > 0) s.legacy[slug] = { right: right + (s.legacy[slug]?.right ?? 0), total: total + (s.legacy[slug]?.total ?? 0) };
    }
  }
  s.migratedGate = true;
  return s;
}

// --- Days ----------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");
// The learner's local calendar day.
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Calendar arithmetic on "YYYY-MM-DD" keys, done in UTC so DST never bites.
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a, b) {
  const t = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / DAY);
}
export const weekday = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

const today = (s, now) => (s.days[dayKey(now)] ??= { q: 0, right: 0, ms: 0, visits: 0 });

// --- Recording (pure: mutate and return the given state) --------------------------------

// One answered question. Wrong answers also go into the mistake notebook.
export function recordAnswer(s, { topic, seed, correct, score = 0, marks = 1, ms = 0, src = "gate" }, now = Date.now()) {
  s.answers.push({ t: topic, s: seed, c: !!correct, sc: score, m: marks, ms: Math.max(0, Math.round(ms)), at: now, src });
  if (s.answers.length > MAX_ANSWERS) s.answers.splice(0, s.answers.length - MAX_ANSWERS);
  const d = today(s, now);
  d.q++; if (correct) d.right++;
  if (!correct && src !== "mistakes") {
    if (!s.mistakes.some((m) => m.t === topic && m.s === seed)) s.mistakes.push({ t: topic, s: seed, at: now, ok: false });
    if (s.mistakes.length > MAX_MISTAKES) s.mistakes.splice(0, s.mistakes.length - MAX_MISTAKES);
  }
  return s;
}

export function recordVisit(s, slug, now = Date.now()) {
  const v = (s.visits[slug] ??= { n: 0, last: 0 });
  v.n++; v.last = now;
  today(s, now).visits++;
  return s;
}

export function addTime(s, ms, now = Date.now()) {
  today(s, now).ms += Math.max(0, ms);
  return s;
}

export function setDone(s, moduleId, done, now = Date.now()) {
  if (done) s.done[moduleId] = now; else delete s.done[moduleId];
  return s;
}

export function setUnderstood(s, topic, seed, ok = true) {
  for (const m of s.mistakes) if (m.t === topic && m.s === seed) m.ok = ok;
  return s;
}

export function recordMock(s, result) {
  s.mocks.push(result);
  if (s.mocks.length > MAX_MOCKS) s.mocks.splice(0, s.mocks.length - MAX_MOCKS);
  return s;
}

export const hasActivity = (s) => s.answers.length > 0 || Object.keys(s.visits).length > 0 || Object.keys(s.done).length > 0 || Object.keys(s.legacy).length > 0 || !!s.plan;

// --- Storage ---------------------------------------------------------------------------

const listeners = new Set();
let cache = null;

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function load() {
  if (cache) return cache;
  cache = migrate(read(KEY), read(LEGACY_KEY));
  return cache;
}

export function save(s = cache) {
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or full */ }
  for (const fn of listeners) { try { fn(s); } catch { /* a listener's problem */ } }
}

// Change the state and save it in one go: update((s) => recordAnswer(s, {...})).
export function update(fn) {
  const s = load();
  fn(s);
  save(s);
  return s;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab saved: drop the cache so the next read picks it up.
try { globalThis.addEventListener?.("storage", (e) => { if (e.key === KEY) cache = null; }); } catch { /* no window */ }

export function exportText(s = load()) {
  return JSON.stringify({ app: "stepwise", exported: new Date().toISOString(), ...s }, null, 1);
}

// Returns the imported state, or throws with a message fit to show.
export function importText(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!raw || raw.app !== "stepwise" || raw.v !== VERSION) throw new Error("That file isn't a Stepwise progress export.");
  const s = migrate(raw, null);
  save(s);
  return s;
}

export function reset() {
  const s = empty();
  s.migratedGate = true;
  save(s);
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  return s;
}

// Study time: while the page is visible and the learner has done something in
// the last two minutes, add the elapsed time to today. Started once by app.js.
let clock = null;
export function startClock() {
  if (clock || typeof document === "undefined") return;
  let lastInput = Date.now(), lastTick = Date.now();
  const touch = () => { lastInput = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "scroll", "touchstart"]) addEventListener(ev, touch, { passive: true });
  clock = setInterval(() => {
    const now = Date.now(), gap = now - lastTick;
    lastTick = now;
    if (document.visibilityState !== "visible" || now - lastInput > 120000 || gap > 120000) return;
    // Only save once a learner has done something worth tracking.
    const s = load();
    if (!hasActivity(s)) return;
    addTime(s, gap, now);
    save(s);
  }, 30000);
}
