// The command palette (Ctrl/Cmd + K): one search box over every tool, every
// roadmap, stage and module, and the site's own pages. app.js loads this file
// the first time the palette is needed, so it costs nothing on first paint.
//
// rank() and score() are pure (no DOM) so they can be tested in Node.
import { SUBJECTS, TOOLS } from "./tools.js";
import { ROADMAPS } from "./roadmaps.js";
import { h } from "./ui.js";

export const PAGES = [
  { title: "GATE practice", href: "/gate", hint: "Endless MCQ, MSQ and NAT questions", keywords: "gate questions practice mcq msq nat quiz" },
  { title: "Roadmaps", href: "/roadmaps", hint: "Every study path", keywords: "roadmap path syllabus plan order" },
  { title: "Progress", href: "/progress", hint: "What you have done so far", keywords: "progress stats history streak" },
  { title: "Study plan", href: "/plan", hint: "A plan for the weeks ahead", keywords: "plan schedule timetable study" },
  { title: "Review", href: "/review", hint: "Spaced review of past topics", keywords: "review revise spaced repetition flashcards" },
  { title: "Mistakes", href: "/mistakes", hint: "Questions you got wrong", keywords: "mistakes wrong errors notebook" },
  { title: "Mock test", href: "/mock", hint: "A timed GATE-style paper", keywords: "mock test exam paper timed" },
  { title: "Diagnostic", href: "/diagnostic", hint: "Find out where to start", keywords: "diagnostic test level placement assess" },
  { title: "Ask anything", href: "/ask", hint: "Type or snap a question; AI picks the tool", keywords: "ask ai question solve photo snap camera help explain" },
  { title: "Home", href: "/", hint: "All tools", keywords: "home start catalogue all tools" },
];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+#]+/g, " ").trim();

// Everything the palette can open, as flat records.
export function buildIndex() {
  const subjectName = new Map(SUBJECTS.map((s) => [s.id, s]));
  const items = [];
  for (const t of TOOLS) {
    const s = subjectName.get(t.subject);
    items.push({ kind: "Tool", title: t.title, href: `/${t.slug}`, hint: s?.short ?? "", keywords: `${t.slug} ${s?.name ?? ""} ${t.summary} ${t.description}` });
  }
  for (const r of ROADMAPS) {
    items.push({ kind: "Roadmap", title: `${r.title} roadmap`, href: `/roadmap/${r.id}`, hint: `${r.stages.length} stages`, keywords: `${r.summary ?? ""}` });
    for (const st of r.stages) {
      items.push({ kind: "Stage", title: st.title, href: `/roadmap/${r.id}/${st.id}`, hint: r.title, keywords: `${st.summary ?? ""}` });
      for (const m of st.modules) items.push({ kind: "Topic", title: m.title, href: `/roadmap/${r.id}/${st.id}#${m.id}`, hint: `${r.title} · ${st.title}`, keywords: (m.outcomes ?? []).join(" ") });
    }
  }
  for (const p of PAGES) items.push({ kind: "Page", ...p });
  return items;
}

// How well one query token matches one field. 0 means no match.
function tokenScore(tok, text, initials) {
  if (!text) return 0;
  if (text === tok) return 100;
  if (text.startsWith(tok)) return 70;
  if (initials.startsWith(tok) && tok.length > 1) return 60;
  if ((" " + text).includes(" " + tok)) return 45;
  if (text.includes(tok)) return 25;
  // Fuzzy: every letter in order. Reward letters that sit together or start words.
  let ti = 0, run = 0, best = 0, pts = 0;
  for (let qi = 0; qi < tok.length; qi++) {
    const at = text.indexOf(tok[qi], ti);
    if (at < 0) return 0;
    run = at === ti && qi > 0 ? run + 1 : 0;
    best = Math.max(best, run);
    if (at === 0 || text[at - 1] === " ") pts += 2;
    pts -= Math.min(4, at - ti) * 0.25;
    ti = at + 1;
  }
  return Math.max(1, 6 + pts + best * 2 - text.length * 0.02);
}

const KIND_WEIGHT = { Tool: 4, Page: 3, Roadmap: 3, Stage: 1, Topic: 0 };

// Score an item against a query: every word of the query must match the title
// or the keywords. Returns 0 when it doesn't match at all.
export function score(query, item) {
  const toks = norm(query).split(" ").filter(Boolean);
  if (!toks.length) return 1;
  const title = norm(item.title), keys = norm(`${item.hint ?? ""} ${item.keywords ?? ""}`);
  const initials = title.split(" ").map((w) => w[0]).join("");
  let total = 0;
  for (const tok of toks) {
    const inTitle = tokenScore(tok, title, initials);
    // Keywords count for less, and never fuzzily: long descriptions contain every letter.
    const inKeys = keys.includes(tok) ? ((" " + keys).includes(" " + tok) ? 14 : 6) : 0;
    const s = Math.max(inTitle, inKeys);
    if (!s) return 0;
    total += s;
  }
  return total + (KIND_WEIGHT[item.kind] ?? 0) - title.length * 0.05;
}

// The best matches for a query, best first. An empty query keeps the input order.
export function rank(query, items, limit = 40) {
  if (!norm(query)) return items.slice(0, limit);
  return items.map((item, i) => ({ item, i, s: score(query, item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}

// When the search doesn't match well (nothing found, a weak best match, or a
// question rather than a name), offer to ask the AI instead.
export function askItem(query, results) {
  const q = String(query ?? "").trim().replace(/\s+/g, " ");
  if (!q) return null;
  const words = norm(q).split(" ").filter(Boolean).length;
  const best = results[0] ? score(q, results[0]) : 0;
  const weak = !results.length || best < 40 * Math.max(1, words) || words >= 4 || /\?$/.test(q);
  return weak ? { kind: "Ask", title: `Ask AI: ${q.slice(0, 120)}`, href: `/ask?q=${encodeURIComponent(q.slice(0, 600))}`, hint: "AI picks the tool" } : null;
}

// --- The dialog ---------------------------------------------------------------------

let ui = null;

function build(navigate) {
  const items = buildIndex();
  // Before typing: pages first, then roadmaps, then tools.
  const order = { Page: 0, Roadmap: 1, Tool: 2 };
  const starters = items.filter((x) => x.kind in order).sort((a, b) => order[a.kind] - order[b.kind]);
  let results = [], active = 0, lastFocus = null;

  const input = h("input", {
    type: "text", class: "pal-input", role: "combobox", "aria-expanded": "true", "aria-controls": "pal-list", "aria-autocomplete": "list",
    "aria-label": "Search tools, roadmaps and pages", placeholder: `Search ${TOOLS.length} tools, roadmaps and pages`, autocomplete: "off", spellcheck: "false",
  });
  const list = h("ul", { id: "pal-list", class: "pal-list", role: "listbox", "aria-label": "Results" });
  const status = h("p", { class: "pal-status", "aria-live": "polite" });
  const closeBtn = h("button", { type: "button", class: "pal-close", "aria-label": "Close search" }, "Esc");
  const dialog = h("div", { class: "pal", role: "dialog", "aria-modal": "true", "aria-label": "Search drishi" },
    h("div", { class: "pal-field" },
      h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "pal-icon" }, h("circle", { cx: 11, cy: 11, r: 7 }), h("path", { d: "M20 20l-4-4" })),
      input, closeBtn),
    list, status,
    h("p", { class: "pal-foot", "aria-hidden": "true" }, h("kbd", null, "↑"), h("kbd", null, "↓"), " move ", h("kbd", null, "Enter"), " open ", h("kbd", null, "Esc"), " close"));
  const backdrop = h("div", { class: "pal-backdrop", hidden: true }, dialog);

  const setActive = (n, scroll = true) => {
    if (!results.length) { input.removeAttribute("aria-activedescendant"); return; }
    active = (n + results.length) % results.length;
    list.querySelectorAll("[role=option]").forEach((li, k) => li.setAttribute("aria-selected", String(k === active)));
    input.setAttribute("aria-activedescendant", `pal-opt-${active}`);
    if (scroll) list.children[active]?.scrollIntoView({ block: "nearest" });
  };
  const draw = () => {
    const q = input.value;
    results = q.trim() ? rank(q, items, 40) : starters.slice(0, 30);
    const ai = askItem(q, results);
    if (ai) results = [...results.slice(0, 39), ai];
    list.replaceChildren(...results.map((r, k) => h("li", { role: "option", id: `pal-opt-${k}`, "aria-selected": "false", onmousemove: () => k !== active && setActive(k, false) },
      h("a", { href: r.href, tabindex: "-1", onclick: () => close(false) },
        h("span", { class: `pal-kind k-${r.kind.toLowerCase()}` }, r.kind),
        h("span", { class: "pal-title" }, r.title),
        r.hint ? h("span", { class: "pal-hint" }, r.hint) : null))));
    const found = results.length - (ai ? 1 : 0);
    status.textContent = q.trim() ? (found ? `${found} result${found === 1 ? "" : "s"}` : `Nothing matches “${q.trim()}”. Press Enter to ask the AI, or try a topic such as deadlock, B+ tree or subnetting.`) : "";
    status.classList.toggle("empty", q.trim() !== "" && !found);
    setActive(0);
  };
  const go = () => {
    const r = results[active];
    if (!r) return;
    close(false);
    navigate(r.href);
  };
  function close(restore = true) {
    backdrop.hidden = true;
    document.documentElement.classList.remove("pal-open");
    if (restore) lastFocus?.focus?.();
  }
  function open() {
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    document.documentElement.classList.add("pal-open");
    input.value = "";
    draw();
    input.focus();
  }
  input.addEventListener("input", draw);
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter" && e.target === input) { e.preventDefault(); go(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === input ? closeBtn : input).focus(); }
  });
  closeBtn.addEventListener("click", () => close());
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  return { open, close, get isOpen() { return !backdrop.hidden; } };
}

export function togglePalette(navigate) {
  ui ??= build(navigate);
  if (ui.isOpen) ui.close(); else ui.open();
}
