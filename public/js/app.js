import { SITE, SUBJECTS, TOOLS } from "./tools.js";
import { h } from "./ui.js";

const main = document.getElementById("app");
const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
let cleanup = null;
let renderId = 0;

// --- Navigation menus, generated from the registry -------------------------
const nav = document.getElementById("nav");
nav.replaceChildren(...SUBJECTS.map((s) => h("details", { class: "menu" },
  h("summary", null, h("span", { class: "long" }, s.name), h("span", { class: "short" }, s.short)),
  h("ul", null, TOOLS.filter((t) => t.subject === s.id).map((t) => h("li", null, h("a", { href: `/${t.slug}`, "data-slug": t.slug }, t.title)))))));
const closeMenus = () => nav.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) closeMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
nav.addEventListener("toggle", (e) => { if (e.target.open) nav.querySelectorAll("details[open]").forEach((d) => { if (d !== e.target) d.removeAttribute("open"); }); }, true);

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

async function route() {
  // Old links looked like /#/cpu?algo=rr: move them to /cpu-scheduling?algo=rr.
  if (location.hash.startsWith("#/")) {
    const [path, query] = location.hash.slice(2).split("?");
    const tool = TOOLS.find((t) => t.legacy === path || t.slug === path);
    history.replaceState(null, "", `/${tool ? tool.slug : ""}${query ? `?${query}` : ""}`);
  }
  const slug = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
  const tool = bySlug.get(slug);
  const id = ++renderId;
  cleanup?.();
  cleanup = null;
  closeMenus();
  for (const a of nav.querySelectorAll("a")) a.setAttribute("aria-current", a.dataset.slug === slug ? "page" : "false");
  for (const d of nav.querySelectorAll("details")) d.classList.toggle("current", !!d.querySelector('[aria-current="page"]'));

  try {
    if (!slug || slug === "index") {
      const home = await import("./views/home.js");
      if (id !== renderId) return;
      setMeta(`${SITE.name}: see every step of DSA, OS, DBMS, networks, theory & compiler algorithms`, "Interactive, step-by-step visualisers with pseudocode for data structures and algorithms, operating systems, databases, networks, theory of computation and compiler design, with practice questions that check your answers.", "/");
      cleanup = home.render(main) ?? null;
    } else if (!tool) {
      setMeta(`Page not found · ${SITE.name}`, "This page doesn't exist.", location.pathname);
      main.replaceChildren(failure("Page not found", "There's no tool at this address. Pick one from the menu, or start from the home page."));
    } else {
      main.replaceChildren(h("p", { class: "loading", "aria-live": "polite" }, `Loading ${tool.title}…`));
      const view = await tool.load();
      if (id !== renderId) return;
      setMeta(`${tool.title}: step-by-step visualiser · ${SITE.name}`, tool.description, `/${tool.slug}`);
      // The tool renders into its own box; practice links sit under it.
      const host = h("div");
      main.replaceChildren(host);
      cleanup = view.render(host) ?? null;
      import("./elsewhere.js").then(({ practiceElsewhere }) => {
        const card = id === renderId ? practiceElsewhere(tool.slug) : null;
        if (card) main.append(card);
      }).catch(() => {});
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
  window.scrollTo(0, 0);
  main.querySelector("h1")?.setAttribute("tabindex", "-1");
  if (document.activeElement && document.activeElement !== document.body && !main.contains(document.activeElement)) main.querySelector("h1")?.focus({ preventScroll: true });
}

export function navigate(path) {
  if (path === location.pathname + location.search) return;
  history.pushState(null, "", path);
  route();
}

// Intercept same-origin links so moving between tools doesn't reload the page.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || /\.(png|svg|xml|txt|json)$/.test(url.pathname)) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});
addEventListener("popstate", route);
route();

// --- Theme ---------------------------------------------------------------------
const toggle = document.getElementById("theme");
// Light by default (set on <html>); a choice made with the toggle is remembered.
const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
if (saved) document.documentElement.dataset.theme = saved;
toggle.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch { /* private mode */ }
});

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
