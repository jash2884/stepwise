// Keeps tool pages calm: the visual shows first, the player sits at the bottom,
// and the inputs, the explanation and the code open from one quiet row.
// Choices are remembered. Views redraw parts of themselves, so this watches.
import { h } from "./ui.js";
const KEY = "drishi.calm";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch { /* private mode */ } };

export function calm(host) {
  host.classList.add("calm");
  const saved = load(), bar = h("div", { class: "calm-bar", role: "group", "aria-label": "Show or hide" });
  const toggle = (label, open, set) => {
    const b = h("button", { type: "button", "aria-expanded": String(open), onclick: () => { const now = b.getAttribute("aria-expanded") !== "true"; b.setAttribute("aria-expanded", String(now)); set(now, true); } }, label);
    set(open, false);
    return b;
  };
  const broken = !!host.querySelector(".inputs .notice.error");
  const inputBtn = toggle("Change the input", broken || !!saved.inputs, (on, save_) => { host.classList.toggle("no-inputs", !on); if (save_) save({ inputs: on }); });
  const codeBtn = toggle("Code and variables", saved.code ?? matchMedia("(min-width: 900px)").matches, (on, save_) => { host.classList.toggle("no-code", !on); if (save_) save({ code: on }); });
  const theory = host.querySelector("details.theory");
  const howBtn = theory ? toggle("How it works", false, (on) => { theory.open = on; }) : null;
  bar.append(inputBtn, codeBtn, ...(howBtn ? [howBtn] : []));
  (host.querySelector(".tool-head") ?? host.firstElementChild)?.after(bar);
  const scan = () => {
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
