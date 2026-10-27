// Pieces shared by the DSA views (searching, stacks and queues, linked lists,
// dynamic programming).
import { copyLink, h, morph, reducedMotion } from "../ui.js";
import { exampleSelect } from "./kit.js";

const GEOM = ["d", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "cx", "cy", "transform"];
const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g;
const ease = (t) => 1 - (1 - t) ** 3;
const running = new WeakMap();

// morph() plus tweening: an element with data-tw="key" keeps its identity
// between frames and its geometry (an arrow's path, a range bracket's width, a
// pointer's rotation) is interpolated from the old shape to the new one, so
// arrows visibly swing to their new target instead of being redrawn.
export function glide(holder, next, ms = 520) {
  const prev = new Map();
  for (const el of holder.querySelectorAll("[data-tw]")) prev.set(el.dataset.tw, Object.fromEntries(GEOM.filter((a) => el.hasAttribute(a)).map((a) => [a, el.getAttribute(a)])));
  const hadFrame = !!holder.firstElementChild;
  cancelAnimationFrame(running.get(holder));
  morph(holder, next);
  if (reducedMotion() || !hadFrame) return next;
  const jobs = [];
  for (const el of next.querySelectorAll("[data-tw]")) {
    const from = prev.get(el.dataset.tw);
    if (!from) { el.classList.add("tw-in"); continue; }
    for (const a of GEOM) {
      const to = el.getAttribute(a);
      if (to == null || from[a] == null || from[a] === to) continue;
      const f = (from[a].match(NUM) ?? []).map(Number), t = (to.match(NUM) ?? []).map(Number);
      if (f.length !== t.length || from[a].replace(NUM, "#") !== to.replace(NUM, "#")) continue;
      // Rotations take the short way round (a queue pointer wrapping from the
      // last slot to slot 0 turns forward, not all the way back).
      if (a === "transform" && to.startsWith("rotate(")) f[0] = t[0] + ((((f[0] - t[0]) % 360) + 540) % 360) - 180;
      const parts = to.split(NUM);
      jobs.push({ el, a, f, t, parts });
      el.setAttribute(a, build(parts, f));
    }
  }
  if (!jobs.length) return next;
  const t0 = performance.now();
  const frame = (now) => {
    const k = ease(Math.min(1, (now - t0) / ms));
    for (const j of jobs) j.el.setAttribute(j.a, build(j.parts, j.f.map((v, i) => v + (j.t[i] - v) * k)));
    if (k < 1) running.set(holder, requestAnimationFrame(frame));
  };
  running.set(holder, requestAnimationFrame(frame));
  return next;
}
const build = (parts, nums) => parts.map((p, i) => (i < nums.length ? p + +nums[i].toFixed(2) : p)).join("");

// A cubic path between two points, bowed by `bend` (positive = up). Always the
// same command shape, so glide() can tween any arrow into any other.
export function curve(x1, y1, x2, y2, bend = 0) {
  const mx = (x1 + x2) / 2;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} C${((x1 + mx) / 2).toFixed(1)},${(y1 - bend).toFixed(1)} ${((mx + x2) / 2).toFixed(1)},${(y2 - bend).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

let mid = 0;
export function arrowDefs(...kinds) {
  const id = `dsa${++mid}`;
  return { id, el: h("defs", null, kinds.map((k) => h("marker", { id: `${id}-${k}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, h("path", { d: "M0,0 L10,5 L0,10 z", class: `dsa-head ${k}` })))) };
}

// Example picker, Random and Copy link, for the inputs row.
export function toolbar(examples, pick, random, ...extra) {
  return [
    exampleSelect(examples, pick),
    h("button", { type: "button", class: "btn ghost", onclick: random }, "Random"),
    ...extra,
    h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")];
}

export const legend = (items) => h("div", { class: "legend-chips" }, items.map(([t, c]) => h("span", null, h("i", { style: `--c:${c}` }), t)));

// A plain comparison table; the current algorithm's row is highlighted.
export function summaryTable(cols, rows, current) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
    h("thead", null, h("tr", null, cols.map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "hot" : null }, h("th", { scope: "row" }, r.cells[0]), r.cells.slice(1).map((c) => h("td", null, c)))))));
}

// The New question button and a fresh card for each practice question.
export function practiceCard(practice, again, body) {
  practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: again }, "New question")), ...body));
}

export const shuffle = (xs, r) => xs.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
