// Shared UI pieces: a tiny element builder, the step player used by every
// visualiser, tabs, and helpers for shareable URLs.

export function h(tag, props, ...kids) {
  const svg = ["svg", "g", "rect", "line", "path", "text", "polyline", "circle", "defs", "marker", "pattern", "title", "tspan", "clipPath"].includes(tag);
  const el = svg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value" && !svg) el.value = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const fmt = (n, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The step player: ⏮ ◀ ▶/❚❚ ▶ ⏭, a scrubber and a speed control.
// render(i) draws step i; the player owns timing and keyboard shortcuts.
export function stepper({ count, render, label = "Step", interval = 900, start = 0 }) {
  let i = Math.min(start, count - 1), timer = null, speed = 1;
  const counter = h("span", { class: "step-count", "aria-live": "polite" });
  const range = h("input", { type: "range", min: 0, max: count - 1, value: i, "aria-label": `${label} slider`, oninput: (e) => go(Number(e.target.value)) });
  const playBtn = h("button", { type: "button", class: "ctl play", "aria-label": "Play", onclick: () => (timer ? pause() : play()) }, "▶");
  const btn = (text, aria, fn) => h("button", { type: "button", class: "ctl", "aria-label": aria, title: aria, onclick: fn }, text);
  const speedSel = h("select", { "aria-label": "Playback speed", onchange: (e) => { speed = Number(e.target.value); if (timer) { pause(); play(); } } },
    [["0.5", "0.5×"], ["1", "1×"], ["2", "2×"], ["4", "4×"]].map(([v, t]) => h("option", { value: v, selected: v === "1" }, t)));
  const bar = h("div", { class: "stepper", tabindex: 0, onkeydown: key },
    btn("⏮", "First step", () => go(0)), btn("◀", "Previous step", () => go(i - 1)), playBtn,
    btn("▶▶", "Next step", () => go(i + 1)), btn("⏭", "Last step", () => go(count - 1)),
    range, counter, speedSel);

  function go(n) {
    i = Math.max(0, Math.min(count - 1, n));
    range.value = i;
    counter.textContent = `${label} ${i + 1} / ${count}`;
    render(i);
    if (i === count - 1) pause();
  }
  function play() {
    if (i === count - 1) go(0);
    playBtn.textContent = "❚❚";
    playBtn.setAttribute("aria-label", "Pause");
    timer = setInterval(() => go(i + 1), interval / speed);
  }
  function pause() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "Play");
  }
  function key(e) {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" && e.target.type !== "range") return;
    const map = { ArrowRight: () => go(i + 1), ArrowLeft: () => go(i - 1), Home: () => go(0), End: () => go(count - 1), " ": () => (timer ? pause() : play()) };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  }
  go(i);
  return { el: bar, go, pause, destroy: pause, get index() { return i; } };
}

export function tabs(items, onChange) {
  const list = h("div", { class: "tabs", role: "tablist" });
  const select = (id) => {
    for (const b of list.children) b.setAttribute("aria-selected", String(b.dataset.id === id));
    onChange(id);
  };
  items.forEach(([id, label]) => list.append(h("button", { type: "button", role: "tab", "data-id": id, onclick: () => select(id) }, label)));
  return { el: list, select };
}

// Shareable state lives in the query string: /cpu-scheduling?algo=rr&q=2
export function readParams() {
  return new URLSearchParams(location.search);
}
export function writeParams(params) {
  const q = new URLSearchParams(params).toString();
  history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
}

export function copyLink(button) {
  navigator.clipboard?.writeText(location.href).then(() => {
    const old = button.textContent;
    button.textContent = "Link copied ✓";
    setTimeout(() => { button.textContent = old; }, 1600);
  }).catch(() => {});
}

export function rng(seed = Date.now()) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The page frame shared by every visualiser.
export function page({ subject, title, lede, theory, conventions }) {
  return h("div", { class: "tool" },
    h("header", { class: "tool-head" },
      h("p", { class: "eyebrow" }, subject),
      h("h1", null, title),
      h("p", { class: "lede" }, lede)),
    h("details", { class: "theory" },
      h("summary", null, "How it works"),
      theory,
      conventions ? h("div", { class: "conventions" }, h("b", null, "Conventions used here"), h("ul", null, conventions.map((c) => h("li", null, c)))) : null));
}

export function notice(kind, text) {
  return h("div", { class: `notice ${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}
