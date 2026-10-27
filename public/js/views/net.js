// Pieces shared by the computer-networks views: packets that travel along a
// line (SVG animateMotion, started by morph()), and a sender/receiver style
// sequence diagram with time running down the page.
import { h, reducedMotion } from "../ui.js";

const pillWidth = (label) => Math.max(18, String(label).length * 7.2 + 12);

// A labelled packet that glides from (x0, y0) to (x1, y1) when drawn through
// morph(). With reduced motion it is simply drawn where it ends up.
export function packet(x0, y0, x1, y1, { label = "", cls = "", dur = 0.7, path = null, repeat = false, title = null } = {}) {
  const w = label ? pillWidth(label) : 14;
  const body = [
    title ? h("title", null, title) : null,
    h("rect", { x: -w / 2, y: -9, width: w, height: 18, rx: 9 }),
    label ? h("text", { x: 0, y: 4, "text-anchor": "middle" }, label) : null,
  ];
  if (reducedMotion()) return h("g", { class: `pkt ${cls}`, transform: `translate(${x1},${y1})` }, body);
  return h("g", { class: `pkt ${cls}` }, body,
    h("animateMotion", { dur: `${dur}s`, begin: "indefinite", fill: "freeze", path: path ?? `M${x0},${y0} L${x1},${y1}`, calcMode: "spline", keyTimes: "0;1", keySplines: "0.4 0 0.2 1", repeatCount: repeat ? "indefinite" : null }));
}

export const arrowDefs = (id) => h("defs", null, h("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z" })));

// A sequence diagram: lanes left to right, time down. Messages whose step is
// before `current` are drawn in full; the one(s) at `current` are drawn as a
// packet travelling along their arrow; later ones are hidden.
// lanes: [{ id, label }]; msgs: [{ from, to, t0, t1, label, cls, step, lost }];
// marks: [{ lane, t, text, step, cls }] (state names written beside a lane);
// spans: [{ lane, t0, t1, text, step, cls }] (a bar beside a lane, e.g. a timer).
let seqId = 0;
export function seqDiagram({ lanes, msgs, marks = [], spans = [], current, tMax, rowH = 30, laneGap = 150, margin = 80, aria = "Sequence diagram", unit = "" }) {
  const id = `seq-arrow-${++seqId}`;
  const top = 44, W = margin * 2 + (lanes.length - 1) * laneGap, H = top + tMax * rowH + 24;
  const X = Object.fromEntries(lanes.map((l, i) => [l.id, margin + i * laneGap]));
  const y = (t) => top + t * rowH;
  const els = [arrowDefs(id)];
  for (const l of lanes) {
    els.push(h("text", { x: X[l.id], y: 18, "text-anchor": "middle", class: "lane-label" }, l.label),
      h("line", { x1: X[l.id], y1: top - 12, x2: X[l.id], y2: H - 8, class: "lane" }));
  }
  if (unit) for (let t = 0; t <= tMax; t++) if (tMax <= 16 || t % 2 === 0) els.push(h("text", { x: 6, y: y(t) + 4, class: "tick" }, `${t}${unit}`));
  for (const s of spans.filter((s) => s.step <= current)) {
    const x = X[s.lane] + (s.side === "left" ? -14 : 8);
    els.push(h("g", { class: `seq-span ${s.cls ?? ""}` }, h("rect", { x, y: y(s.t0), width: 6, height: Math.max(2, y(s.t1) - y(s.t0)), rx: 3 }),
      s.text ? h("text", { x: s.side === "left" ? x - 4 : x + 10, y: (y(s.t0) + y(s.t1)) / 2 + 4, "text-anchor": s.side === "left" ? "end" : "start" }, s.text) : null));
  }
  const packets = [];
  for (const m of msgs) {
    if (m.step > current) continue;
    const x0 = X[m.from], x1 = X[m.to], y0 = y(m.t0), y1 = y(m.t1);
    const live = m.step === current;
    const end = m.lost ? 0.55 : 1;
    const ex = x0 + (x1 - x0) * end, ey = y0 + (y1 - y0) * end;
    // Label near the start of the arrow, so crossing arrows never share a label spot.
    const f = m.labelAt ?? 0.3;
    const lab = { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f - 6 };
    els.push(h("g", { class: `msg ${m.cls ?? ""}${m.lost ? " lost" : ""}${live ? " live" : ""}` },
      h("line", { x1: x0, y1: y0, x2: ex, y2: ey, "marker-end": m.lost ? null : `url(#${id})` }),
      m.lost ? h("text", { x: ex, y: ey + 5, "text-anchor": "middle", class: "cross" }, "✗") : null,
      h("text", { x: lab.x, y: lab.y, "text-anchor": "middle", class: "msg-label" }, m.label)));
    if (live) packets.push(packet(x0, y0, ex, ey, { label: m.short ?? "", cls: m.cls, dur: Math.min(1.1, 0.35 + 0.12 * (m.t1 - m.t0)) }));
  }
  for (const m of marks.filter((m) => m.step <= current)) {
    const left = X[m.lane] <= margin;
    els.push(h("text", { x: X[m.lane] + (left ? -8 : 8), y: y(m.t) + 4, "text-anchor": left ? "end" : "start", class: `seq-mark ${m.cls ?? ""}${m.step === current ? " now" : ""}` }, m.text));
  }
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "timeline seq", role: "img", "aria-label": aria, style: `min-width:${Math.min(W, 560)}px` }, els, packets);
}

