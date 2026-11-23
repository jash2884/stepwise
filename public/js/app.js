import { SITE, SUBJECTS, TOOLS } from "./tools.js";
import { h } from "./ui.js";
import { LEARN_PAGES } from "./learn/pages.js";

const LEARN = new Map(LEARN_PAGES.map((p) => [p.slug, p]));

const main = document.getElementById("app");
const GATE_DESCRIPTION = "Free GATE CS practice: endless MCQ, MSQ and NAT questions on OS and DBMS, marked the GATE way, each with a worked solution you can replay step by step.";
const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
let cleanup = null;
let renderId = 0;

// --- Navigation, generated from the registry ----------------------------------------
// A "Subjects" mega menu grouped by area (a new subject appears on its own),
// top-level links, and on phones the same nav as a drawer opened by #menu-btn.
const GROUPS = [["Core CS", ["dsa", "os", "dbms", "cn", "toc", "cd"]], ["Maths & hardware", ["digital-logic", "coa", "discrete-maths", "maths"]], ["AI", ["ai"]]];
const groupOf = (s) => s.group ?? GROUPS.find(([, ids]) => ids.includes(s.id))?.[0] ?? "More";
const toolsOf = (id) => TOOLS.filter((t) => t.subject === id);
const nav = document.getElementById("nav");
const header = document.querySelector(".top");
const menuBtn = document.getElementById("menu-btn");
const isDrawer = () => header.classList.contains("nav-open");
let picked = null;
function pick(id) {
  picked = id;
  for (const b of nav.querySelectorAll(".sub-btn")) {
    b.setAttribute("aria-expanded", String(b.dataset.subject === id));
    b.parentElement.classList.toggle("on", b.dataset.subject === id);
  }
}
const mega = h("details", { class: "mega" },
  h("summary", null, "Subjects", h("span", { class: "mega-n" }, TOOLS.length)),
  h("div", { class: "mega-panel" },
    [...new Set(SUBJECTS.map(groupOf))].map((g) => h("div", { class: "mega-group" },
      h("p", { class: "mega-label" }, g),
      SUBJECTS.filter((s) => groupOf(s) === g).map((s) => h("div", { class: "sub" },
        h("button", {
          type: "button", class: "sub-btn", "data-subject": s.id, "aria-expanded": "false", "aria-controls": `sub-${s.id}`,
          onclick: () => pick(isDrawer() && picked === s.id ? null : s.id),
          onmouseenter: () => { if (!isDrawer() && matchMedia("(hover: hover)").matches) pick(s.id); },
        }, h("span", null, s.name), h("span", { class: "n" }, toolsOf(s.id).length)),
        h("div", { class: "sub-tools", id: `sub-${s.id}` },
          h("p", { class: "sub-head" }, s.name),
          h("ul", null, toolsOf(s.id).map((t) => h("li", null, h("a", { href: `/${t.slug}`, "data-slug": t.slug }, t.title)))),
          h("a", { class: "sub-all", href: `/?subject=${s.id}#catalogue` }, `See all ${s.short} tools with previews →`))))))));
const navLink = (href, slug, text) => h("a", { class: "nav-link", href, "data-slug": slug }, text);
nav.replaceChildren(mega, navLink("/roadmaps", "roadmaps", "Roadmaps"), navLink("/gate", "gate", "Practice"), navLink("/progress", "progress", "Progress"));
mega.addEventListener("toggle", () => {
  if (!mega.open || isDrawer()) return;
  const here = nav.querySelector('.sub-tools a[aria-current="page"]')?.closest(".sub")?.querySelector(".sub-btn")?.dataset.subject;
  pick(here ?? picked ?? SUBJECTS[0]?.id);
});
function setDrawer(open) {
  header.classList.toggle("nav-open", open);
  document.documentElement.classList.toggle("drawer-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (open) { mega.open = true; pick(nav.querySelector('.sub-tools a[aria-current="page"]')?.closest(".sub")?.querySelector(".sub-btn")?.dataset.subject ?? null); }
}
menuBtn.addEventListener("click", () => setDrawer(!isDrawer()));
const closeMenus = () => {
  mega.open = false;
  if (isDrawer()) setDrawer(false);
  closeThemePop();
};
document.addEventListener("click", (e) => {
  if (!isDrawer() && !e.target.closest(".mega")) mega.open = false;
  if (!e.target.closest(".theme-menu")) closeThemePop();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || document.documentElement.classList.contains("pal-open")) return;
  const wasDrawer = isDrawer(), wasMega = mega.open && !wasDrawer;
  closeMenus();
  if (wasDrawer) menuBtn.focus();
  else if (wasMega) mega.querySelector("summary").focus();
});
addEventListener("resize", () => { if (isDrawer() && matchMedia("(min-width: 861px)").matches) setDrawer(false); });

// Footer: subjects come from the registry, roadmaps load when the browser is idle.
const later = window.requestIdleCallback ?? ((f) => setTimeout(f, 300));
document.getElementById("foot-subjects")?.replaceChildren(...SUBJECTS.map((s) => h("li", null, h("a", { href: `/?subject=${s.id}#catalogue` }, s.name))));
later(() => import("./roadmaps.js").then(({ ROADMAPS }) => document.getElementById("foot-roadmaps")?.replaceChildren(
  ...ROADMAPS.map((r) => h("li", null, h("a", { href: `/roadmap/${r.id}` }, r.title))),
  h("li", null, h("a", { href: "/roadmaps" }, "All roadmaps")))).catch(() => {}));

// --- Command palette (Ctrl/Cmd + K, or the search button) ----------------------------
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
for (const k of document.querySelectorAll("[data-kbd]")) k.textContent = isMac ? "⌘K" : "Ctrl K";
const openPalette = () => import("./palette.js").then((m) => { closeMenus(); m.togglePalette(navigate); }).catch(() => {});
document.addEventListener("click", (e) => { if (e.target.closest("[data-palette]")) { e.preventDefault(); openPalette(); } });
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openPalette(); }
});
later(() => import("./palette.js").catch(() => {}));
document.addEventListener("click", (e) => { if (e.target.closest("[data-ai-settings]")) { e.preventDefault(); import("./ai/settings.js").then((m) => m.openAiSettings()).catch(() => {}); } });

// --- Routing (History API) ------------------------------------------------------
function setMeta(title, description, path) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", `${SITE.url}${path}`);
}

function failure(title, text, retry) {
  return h("section", { class: "error-page" },
    h("h1", null, title), h("p", { class: "lede" }, text),
    h("div", { class: "row" },
      retry ? h("button", { type: "button", class: "btn primary", onclick: retry }, "Try again") : null,
      h("a", { class: "btn ghost", href: "/" }, "Go to the home page")));
}

// Loader: a slim bar for slow page changes, and the first-load screen is
// dismissed once the first page has rendered (see css/loader.css).
const routeBar = document.getElementById("routebar");
let barTimer = 0;
async function route() {
  clearTimeout(barTimer);
  routeBar?.classList.remove("done");
  const slow = setTimeout(() => routeBar?.classList.add("on"), 120);
  try { await renderRoute(); } finally {
    clearTimeout(slow);
    if (routeBar?.classList.contains("on")) {
      routeBar.classList.add("done");
      barTimer = setTimeout(() => routeBar.classList.remove("on", "done"), 450);
    }
    document.documentElement.classList.add("booted");
  }
}

async function renderRoute() {
  // Old links looked like /#/cpu?algo=rr: move them to /cpu-scheduling?algo=rr.
  if (location.hash.startsWith("#/")) {
    const [path, query] = location.hash.slice(2).split("?");
    const tool = TOOLS.find((t) => t.legacy === path || t.slug === path);
    history.replaceState(null, "", `/${tool ? tool.slug : ""}${query ? `?${query}` : ""}`);
  }
  const slug = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
  const tool = bySlug.get(slug);
  const id = ++renderId;
  rendered = location.pathname + location.search;
  // Tools rewrite the URL as they render (dropping any #anchor), so note it now.
  const anchor = decodeURIComponent(location.hash.slice(1));
  cleanup?.();
  cleanup = null;
  closeMenus();
  const section = slug.startsWith("roadmap") ? "roadmaps" : LEARN.has(slug) ? "progress" : slug;
  for (const a of nav.querySelectorAll("a")) a.setAttribute("aria-current", a.dataset.slug === section ? "page" : "false");
  for (const d of nav.querySelectorAll("details")) d.classList.toggle("current", !!d.querySelector('[aria-current="page"]'));

  try {
    if (!slug || slug === "index") {
      const home = await import("./views/home.js");
      if (id !== renderId) return;
      setMeta(`${SITE.name}: see every step of DSA, OS, DBMS, networks, theory & compiler algorithms`, "Interactive, step-by-step visualisers with pseudocode for data structures and algorithms, operating systems, databases, networks, theory of computation and compiler design, with practice questions that check your answers.", "/");
      cleanup = home.render(main) ?? null;
      import("./tutor.js").then(({ mountTutor }) => mountTutor(null)).catch(() => {});
    } else if (slug === "gate") {
      const gate = await import("./views/gate.js");
      if (id !== renderId) return;
      setMeta(`GATE CS practice questions with step-by-step solutions · ${SITE.name}`, GATE_DESCRIPTION, "/gate");
      cleanup = gate.render(main) ?? null;
    } else if (LEARN.has(slug)) {
      const page = LEARN.get(slug);
      main.replaceChildren(h("p", { class: "loading", "aria-live": "polite" }, "Loading…"));
      const view = await import(`./views/${page.slug}.js`);
      if (id !== renderId) return;
      setMeta(`${page.title} · ${SITE.name}`, page.description, `/${slug}`);
      cleanup = view.render(main) ?? null;
      import("./tutor.js").then(({ mountTutor }) => mountTutor(null)).catch(() => {});
    } else if (slug === "roadmaps" || slug.startsWith("roadmap/")) {
      const roadmap = await import("./views/roadmap.js");
      if (id !== renderId) return;
      const page = roadmap.parse(slug);
      if (!page) {
        setMeta(`Page not found · ${SITE.name}`, "This page doesn't exist.", location.pathname);
        main.replaceChildren(failure("Page not found", "There's no roadmap at this address.", null));
      } else {
        const m = roadmap.meta(page, SITE.name);
        setMeta(m.title, m.description, `/${slug}`);
        main.replaceChildren();
        cleanup = roadmap.render(main, page) ?? null;
      }
    } else if (slug === "ask") {
      // Ask anything: AI routing to a visualiser (views/ask.js, server in src/ai/ask.ts).
      const ask = await import("./views/ask.js");
      if (id !== renderId) return;
      setMeta(`Ask anything, see it happen · ${SITE.name}`, "Type or snap a CS question: Stepwise picks the right visualiser, fills in your numbers, and its engine works out and checks the answer step by step.", "/ask");
      cleanup = ask.render(main) ?? null;
    } else if (!tool) {
      setMeta(`Page not found · ${SITE.name}`, "This page doesn't exist.", location.pathname);
      main.replaceChildren(failure("Page not found", "There's no tool at this address. Pick one from the menu, or start from the home page."));
    } else {
      main.replaceChildren(h("p", { class: "loading", "aria-live": "polite" }, `Loading ${tool.title}…`));
      const view = await tool.load();
      if (id !== renderId) return;
      setMeta(`${tool.title}: step-by-step visualiser · ${SITE.name}`, tool.description, `/${tool.slug}`);
      // The tool renders into its own box; the cards under it load separately
      // and each fills its own slot, so their order never depends on timing.
      const host = h("div");
      const [gateSlot, roadSlot, elseSlot] = [0, 1, 2].map(() => h("div", { class: "card-slot" }));
      main.replaceChildren(host, gateSlot, roadSlot, elseSlot);
      cleanup = view.render(host) ?? null;
      // A link like /sliding-window?...#calc opens on that part of the tool.
      if (anchor) document.getElementById(anchor)?.scrollIntoView();
      import("./learn/store.js").then((s) => s.update((st) => s.recordVisit(st, tool.slug))).catch(() => {});
      import("./tutor.js").then(({ mountTutor }) => { if (id === renderId) mountTutor(tool); }).catch(() => {});
      const fill = (slot, card) => { if (card && id === renderId) slot.replaceChildren(card); };
      import("./gate-link.js").then(({ gateCard }) => fill(gateSlot, gateCard(tool.slug))).catch(() => {});
      import("./roadmap-link.js").then(({ roadmapCard }) => fill(roadSlot, roadmapCard(tool.slug))).catch(() => {});
      import("./elsewhere.js").then(({ practiceElsewhere }) => fill(elseSlot, practiceElsewhere(tool.slug))).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    if (id !== renderId) return;
    const offline = !navigator.onLine;
    main.replaceChildren(failure(
      offline ? "You're offline" : "Something went wrong",
      offline ? "This tool hasn't been saved for offline use yet. Reconnect and try again." : "This page didn't load properly. Reloading usually fixes it; if not, please report it on GitHub.",
      () => location.reload()));
  }
  if (!anchor) window.scrollTo(0, 0);
  main.querySelector("h1")?.setAttribute("tabindex", "-1");
  if (document.activeElement && document.activeElement !== document.body && !main.contains(document.activeElement)) main.querySelector("h1")?.focus({ preventScroll: true });
}

export function navigate(path) {
  if (path === location.pathname + location.search + location.hash) return;
  history.pushState(null, "", path);
  route();
}

// Intercept same-origin links so moving between tools doesn't reload the page.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || a.hasAttribute("download") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || /\.(png|svg|xml|txt|json)$/.test(url.pathname)) return;
  // A jump within the same page (#module) is left to the browser.
  if (url.hash && url.pathname === location.pathname && url.search === location.search) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
// Moving between #anchors on the same page also fires popstate; don't re-render for it.
let rendered = "";
addEventListener("popstate", () => { if (location.pathname + location.search !== rendered) route(); });
route();
import("./learn/store.js").then((s) => s.startClock()).catch(() => {});

// --- Theme: light, dark or system, and an accent colour ------------------------------
// js/theme-boot.js applies the saved choice before first paint; this is the menu.
const MODES = [["light", "Light"], ["dark", "Dark"], ["system", "System"]];
const ACCENTS = [["indigo", "Indigo"], ["ember", "Ember"], ["mint", "Mint"], ["violet", "Violet"]];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const html = document.documentElement;
const themeBtn = document.getElementById("theme");
const themePop = h("div", { class: "pop theme-pop", id: "theme-pop", hidden: true },
  h("p", { class: "pop-label", id: "mode-label" }, "Mode"),
  h("div", { class: "seg", role: "group", "aria-labelledby": "mode-label" },
    MODES.map(([id, label]) => h("button", { type: "button", "data-mode": id, "aria-pressed": "false", onclick: () => setTheme(id, null) }, label))),
  h("p", { class: "pop-label", id: "accent-label" }, "Accent"),
  h("div", { class: "swatches", role: "group", "aria-labelledby": "accent-label" },
    ACCENTS.map(([id, label]) => h("button", { type: "button", "data-accent-id": id, "aria-pressed": "false", onclick: () => setTheme(null, id) }, h("i", { class: `sw sw-${id}`, "aria-hidden": "true" }), label))));
themeBtn.after(themePop);
function syncTheme() {
  const mode = store.get("theme") ?? "light", accent = html.dataset.accent ?? "indigo";
  for (const b of themePop.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  for (const b of themePop.querySelectorAll("[data-accent-id]")) b.setAttribute("aria-pressed", String(b.dataset.accentId === accent));
  const bg = getComputedStyle(html).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
function setTheme(mode, accent) {
  if (mode) {
    store.set("theme", mode);
    if (mode === "system") delete html.dataset.theme; else html.dataset.theme = mode;
  }
  if (accent) { store.set("accent", accent); html.dataset.accent = accent; }
  syncTheme();
}
// A function declaration (and DOM lookups) so the router can call it before this runs.
function closeThemePop() {
  const pop = document.getElementById("theme-pop");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  document.getElementById("theme").setAttribute("aria-expanded", "false");
}
themeBtn.addEventListener("click", () => {
  const open = themePop.hidden;
  themePop.hidden = !open;
  themeBtn.setAttribute("aria-expanded", String(open));
  if (open) themePop.querySelector('[aria-pressed="true"]')?.focus();
});
themePop.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeThemePop(); themeBtn.focus(); } });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncTheme);
syncTheme();

// --- Offline support and unexpected errors ---------------------------------------
if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
const toast = (text) => {
  if (document.querySelector(".toast")) return;
  const el = h("div", { class: "toast", role: "alert" }, text, h("button", { type: "button", class: "btn ghost small", onclick: () => location.reload() }, "Reload"));
  document.body.append(el);
  setTimeout(() => el.remove(), 12000);
};
addEventListener("error", (e) => { if (e.filename?.includes(location.host)) toast("Something went wrong on this page."); });
addEventListener("unhandledrejection", () => toast("Something went wrong on this page."));
