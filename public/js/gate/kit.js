// Shared helpers for GATE question generators. Every generator gets a seeded
// random function r() and returns a question object (see gate-questions.js).
export { rng } from "../ui.js";
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export const round2 = (x) => Math.round(x * 100) / 100;
export const show = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
export function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const query = (path, params) => `${path}?${new URLSearchParams(params)}`;
// Four distinct options with the right one at a random place: returns { options, answer }.
export function mcq(r, right, wrongs) {
  const seen = new Set([String(right)]);
  const pool = [];
  for (const w of wrongs) if (!seen.has(String(w))) { seen.add(String(w)); pool.push(w); }
  if (pool.length < 3) return null;
  const options = shuffle(r, [right, ...pool.slice(0, 3)]).map(String);
  return { options, answer: options.indexOf(String(right)) };
}
