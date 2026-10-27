// "Practise elsewhere": problems on LeetCode, CSES, HackerRank and
// GeeksforGeeks that use what the tool shows. Shown under every tool.
import { PROBLEMS } from "./problems.js";
import { h } from "./ui.js";

const ORDER = ["LeetCode", "CSES", "HackerRank", "GeeksforGeeks"];
const ABOUT = {
  LeetCode: "Coding problems",
  CSES: "Competitive programming",
  HackerRank: "Coding challenges",
  GeeksforGeeks: "Worked articles and exam theory",
};

export function practiceElsewhere(slug) {
  const list = PROBLEMS[slug] ?? [];
  if (!list.length) return null;
  const groups = ORDER.map((p) => [p, list.filter((x) => x.p === p)]).filter(([, xs]) => xs.length);
  return h("section", { class: "card elsewhere", "aria-labelledby": "elsewhere-h" },
    h("h2", { id: "elsewhere-h" }, "Practise on other platforms"),
    h("p", { class: "muted small" }, `${list.length} problem${list.length === 1 ? "" : "s"} that use what this page shows. Links open in a new tab.`),
    h("div", { class: "elsewhere-grid" }, groups.map(([platform, xs]) => h("div", { class: "elsewhere-group" },
      h("h3", null, platform, h("span", { class: "muted small" }, ` · ${ABOUT[platform]}`)),
      h("ul", null, xs.map((x) => h("li", null,
        h("a", { href: x.u, target: "_blank", rel: "noopener" }, x.t, h("span", { class: "ext-ico", "aria-hidden": "true" }, "\u00a0↗")),
        x.d ? h("span", { class: `diff ${x.d.toLowerCase()}` }, x.d) : null)))))));
}
