// The "how the code sees it" side of a visualiser: pseudocode with the line
// being executed highlighted, and the live values of its variables. Engines
// put `line` (1-based, or a list) and `vars` on each step; views call show().
import { h } from "./ui.js";

export function codePanel(lines, { title = "Pseudocode" } = {}) {
  const items = lines.map((text, i) => {
    const indent = text.match(/^ */)[0].length;
    const [code, comment] = text.trim().split(/\s+\/\/\s+/);
    return h("li", { style: `--indent:${indent}` },
      h("span", { class: "ln", "aria-hidden": "true" }, i + 1),
      h("code", null, code, comment ? h("span", { class: "cmt" }, ` // ${comment}`) : null));
  });
  const list = h("ol", { class: "code-lines" }, items);
  const el = h("div", { class: "code-panel" }, h("div", { class: "panel-title" }, title), list);
  return {
    el,
    show(active) {
      const on = new Set([active ?? []].flat());
      items.forEach((li, i) => li.classList.toggle("on", on.has(i + 1)));
      const first = items[[...on][0] - 1];
      // Keep the active line in view inside the panel without scrolling the page.
      if (first && list.scrollHeight > list.clientHeight) {
        const top = first.offsetTop - list.offsetTop;
        if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 30) list.scrollTop = Math.max(0, top - 40);
      }
    },
  };
}

const showValue = (v) => {
  if (v == null) return "–";
  if (Array.isArray(v)) return `[${v.map(showValue).join(", ")}]`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && !Number.isInteger(v)) return v.toFixed(2);
  if (v === Infinity) return "∞";
  return String(v);
};

export function varsPanel({ title = "Variables" } = {}) {
  const body = h("dl", { class: "vars" });
  const el = h("div", { class: "vars-panel" }, h("div", { class: "panel-title" }, title), body);
  let last = {};
  return {
    el,
    show(vars = {}) {
      const entries = Object.entries(vars);
      body.replaceChildren(...(entries.length ? entries.flatMap(([k, v]) => {
        const text = showValue(v);
        const changed = k in last && last[k] !== text;
        return [h("dt", null, k), h("dd", { class: changed ? "changed" : null }, text)];
      }) : [h("dd", { class: "muted" }, "nothing yet")]));
      last = Object.fromEntries(entries.map(([k, v]) => [k, showValue(v)]));
    },
    reset() { last = {}; },
  };
}

// Visual on the left, code and variables on the right (stacked on phones).
export function traceLayout(visual, code, vars, extra = null) {
  return h("div", { class: "trace-grid" },
    h("div", { class: "trace-main" }, visual),
    h("div", { class: "trace-side" }, code.el, vars.el, extra));
}

// Best / average / worst time, space and stability for a family of algorithms.
export function complexityTable(rows, current) {
  return h("div", { class: "table-wrap" }, h("table", { class: "parse complexity" },
    h("thead", null, h("tr", null, ["Algorithm", "Best", "Average", "Worst", "Space", "Stable", "In place"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", null, rows.map((r) => h("tr", { class: r.id === current ? "hot" : null },
      h("th", { scope: "row" }, r.name), [r.best, r.avg, r.worst, r.space].map((x) => h("td", null, x)),
      h("td", null, r.stable ? "Yes" : "No"), h("td", null, r.inPlace ? "Yes" : "No"))))));
}
