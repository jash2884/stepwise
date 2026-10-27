// A parser stack drawn as chips. Entries pushed since the previous step drop
// in; entries popped since then are drawn as ghosts that lift away and shrink
// (left out entirely under reduced motion, so nothing stale stays on screen).
import { h, reducedMotion } from "../ui.js";

export function stackChips(cur, prev, { topFirst = false, classOf = () => null } = {}) {
  let p = 0;
  if (prev) while (p < cur.length && p < prev.length && cur[p] === prev[p]) p++;
  else p = cur.length;
  const items = cur.map((s, k) => h("span", { class: [k === cur.length - 1 && "top", k >= p && "push", classOf(s, k)].filter(Boolean).join(" ") || null }, s));
  const ghosts = !prev || reducedMotion() ? [] : prev.slice(p).map((s, k) => h("span", { class: ["ghost", classOf(s, p + k)].filter(Boolean).join(" "), "aria-hidden": "true" }, s));
  return topFirst ? [...ghosts.reverse(), ...items.reverse()] : [...items, ...ghosts];
}
