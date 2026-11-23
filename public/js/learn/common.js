// Small DOM pieces shared by the learning pages and the roadmap: page header,
// the row of learning links, progress rings and bars, state badges, dates.
import { h } from "../ui.js";
import { STATE_LABEL } from "./model.js";

export function header(eyebrow, title, lede) {
  return h("header", { class: "tool-head" }, h("p", { class: "eyebrow" }, eyebrow), h("h1", null, title), lede ? h("p", { class: "lede" }, lede) : null);
}

const LINKS = [["progress", "Progress"], ["plan", "Plan"], ["review", "Reviews"], ["mistakes", "Mistakes"], ["mock", "Mock tests"], ["diagnostic", "Diagnostic"]];
export function subnav(current, counts = {}) {
  return h("nav", { class: "lp-subnav", "aria-label": "Learning" }, LINKS.map(([slug, label]) =>
    h("a", { href: `/${slug}`, "aria-current": slug === current ? "page" : "false" }, label, counts[slug] ? h("span", { class: "lp-count" }, counts[slug]) : null)));
}

// A small ring, filled to progress (0 to 1).
export function ring(progress, label, size = 28) {
  const r = 10, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, progress));
  return h("svg", { class: "lp-ring", viewBox: "0 0 24 24", width: size, height: size, role: "img", "aria-label": label },
    h("circle", { cx: 12, cy: 12, r, class: "lp-ring-bg" }),
    p > 0 ? h("circle", { cx: 12, cy: 12, r, class: "lp-ring-fg", "stroke-dasharray": `${(c * p).toFixed(2)} ${c.toFixed(2)}`, transform: "rotate(-90 12 12)" }) : null);
}

export function bar(progress, label) {
  const p = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return h("span", { class: "lp-bar", role: "img", "aria-label": label ?? `${p}%` }, h("i", { style: `width:${p ? Math.max(p, 2) : 0}%` }));
}

export const badge = (state) => h("span", { class: `lp-badge lp-${state}` }, STATE_LABEL[state]);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateText(key, { weekday = true } = {}) {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${weekday ? `${DAYS[wd]} ` : ""}${d} ${MONTHS[m - 1]}`;
}
export const weekdayLetter = (key) => { const [y, m, d] = key.split("-").map(Number); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

export function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
}

export const pct = (x) => (x == null ? "none" : `${Math.round(x * 100)}%`);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const moduleLink = (roadmapId, stageId, moduleId) => `/roadmap/${roadmapId}/${stageId}#${moduleId}`;

// replaceChildren that skips null and false and flattens lists, so optional
// pieces can be written inline as `cond ? h(...) : null`.
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}
