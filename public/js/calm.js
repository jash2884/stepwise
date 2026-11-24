// Keeps tool pages calm: the visual shows first, the player sits at the bottom,
// and the inputs, the explanation and the code open from one quiet row.
// Choices are remembered. Views redraw parts of themselves, so this watches.
import { SUBJECTS } from "./tools.js";
import { h } from "./ui.js";
const KEY = "drishi.calm";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch { /* private mode */ } };

export function calm(host) {
  host.classList.add("calm");
  const saved = load(), bar = h("div", { class: "calm-bar", role: "group", "aria-label": "Show or hide" });
  const toggle = (label, open, set) => {
    const b = h("button", { type: "button", "aria-expanded": String(open), onclick: () => { const now = b.getAttribute("aria-expanded") !== "true"; b.setAttribute("aria-expanded", String(now)); set(now, true); } }, label);
    b.close = () => { if (b.getAttribute("aria-expanded") === "true") { b.setAttribute("aria-expanded", "false"); set(false, true); } };
    set(open, false);
    return b;
  };
  const broken = !!host.querySelector(".inputs .notice.error");
  // What opens must be seen: the other panel above it closes, and it scrolls into view.
  let inputBtn, codeBtn, howBtn = null;
  const reveal = (sel, other) => { other?.close(); requestAnimationFrame(() => { const el = host.querySelector(sel); if (!el) return; const r = el.getBoundingClientRect(); if (r.top > innerHeight - 160 || r.bottom < 90) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }); };
  inputBtn = toggle("Change the input", broken || !!saved.inputs, (on, save_) => { host.classList.toggle("no-inputs", !on); if (save_) { save({ inputs: on }); if (on) reveal(".inputs", howBtn); } });
  codeBtn = toggle("Code and variables", saved.code ?? matchMedia("(min-width: 900px)").matches, (on, save_) => { host.classList.toggle("no-code", !on); if (save_) { save({ code: on }); if (on) reveal(".trace-side", howBtn); } });
  const theory = host.querySelector("details.theory");
  howBtn = theory ? toggle("How it works", false, (on, by) => { theory.open = on; if (on && by) inputBtn.close(); }) : null;
  bar.append(inputBtn, codeBtn, ...(howBtn ? [howBtn] : []));
  (host.querySelector(".tool-head") ?? host.firstElementChild)?.after(bar);
  // The description is for first-timers: it opens with the explanation.
  const lede = host.querySelector(".tool-head .lede");
  if (lede && theory) theory.querySelector("summary")?.after(lede);
  const brow = host.querySelector(".tool-head .eyebrow"), subject = brow && SUBJECTS.find((s) => s.name === brow.textContent.trim());
  if (subject) brow.replaceChildren(h("a", { href: `/subject/${subject.id}` }, subject.name));
  const tabs = host.querySelector(".tabs");
  if (tabs) { tabs.classList.add("in-bar"); bar.prepend(tabs); }
  const scan = () => {
    for (const t of host.querySelectorAll(".view-toggle")) if (t.parentElement !== bar) { if (t.dataset.home) t.remove(); else { t.dataset.home = "1"; (tabs ? tabs.after(t) : bar.prepend(t)); } }
    inputBtn.hidden = !host.querySelector(".inputs");
    codeBtn.hidden = !host.querySelector(".trace-side");
    for (const s of host.querySelectorAll(".stepper")) if (s.parentElement && s.parentElement.lastElementChild !== s) s.parentElement.append(s);
  };
  scan();
  let due = 0;
  const watch = new MutationObserver((list) => { if (due || !list.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches(".stepper, .inputs, .panel-body, .card, .sim") || n.querySelector(".stepper, .inputs"))))) return; due = 1; queueMicrotask(() => { due = 0; scan(); }); });
  watch.observe(host, { childList: true, subtree: true });
  return () => watch.disconnect();
}

// The cards under a tool become a short list that opens on request.
export function tray(slots) {
  return h("section", { class: "after", "aria-label": "Keep going" }, slots.map(([label, slot]) => h("details", null, h("summary", null, label), slot)));
}
