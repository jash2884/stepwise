import { TOOLS } from "./views/home.js";

const routes = {
  "": () => import("./views/home.js"),
  cpu: () => import("./views/cpu.js"),
  paging: () => import("./views/paging.js"),
  bankers: () => import("./views/bankers.js"),
  bptree: () => import("./views/bptree.js"),
  normalization: () => import("./views/normalization.js"),
};

const main = document.getElementById("app");
let cleanup = null, current = null;

async function route() {
  const path = location.hash.replace(/^#\/?/, "").split("?")[0];
  if (path === current) return; // only the query changed (the page writes its own state)
  current = path;
  const load = routes[path] ?? routes[""];
  cleanup?.();
  const view = await load();
  main.replaceChildren();
  cleanup = view.render(main) ?? null;
  const tool = TOOLS.find((t) => t.path === path);
  document.title = tool ? `${tool.title} · Stepwise` : "Stepwise: see every step of OS & DBMS algorithms";
  for (const a of document.querySelectorAll(".nav a")) a.setAttribute("aria-current", a.getAttribute("href") === `#/${path}` ? "page" : "false");
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
route();

// Theme: follow the system unless the visitor picks one.
const toggle = document.getElementById("theme");
const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
if (saved) document.documentElement.dataset.theme = saved;
toggle.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch { /* private mode */ }
});
