// "Ask about this step": a chat panel that sends the tutor what the student is
// looking at (the step note, the highlighted pseudocode line, the variables and
// any practice question), read from the page so it works for every tool.
import { h } from "./ui.js";

let tool = null, history = [], els = null, busy = false;

const visible = (el) => el && el.offsetParent !== null;
const firstVisible = (root, sel) => [...root.querySelectorAll(sel)].find(visible) ?? null;

function context() {
  const main = document.getElementById("app");
  const selected = main.querySelector('[role="tab"][aria-selected="true"]');
  const mode = /practi/i.test(selected?.textContent ?? "") ? "practice" : "visualise";
  const panel = firstVisible(main, ".code-panel");
  const code = panel ? [...panel.querySelectorAll("li code")].map((c) => c.textContent) : [];
  const line = panel?.querySelector("li.on code")?.textContent ?? "";
  const vars = {};
  const dl = firstVisible(main, ".vars");
  if (dl) for (const dt of dl.querySelectorAll("dt")) vars[dt.textContent] = dt.nextElementSibling?.textContent ?? "";
  const step = firstVisible(main, ".step-count")?.textContent ?? "";
  return {
    tool: tool.slug, title: tool.title, mode, code, line, vars, step,
    note: firstVisible(main, ".step-note")?.textContent ?? "",
    question: mode === "practice" ? [...main.querySelectorAll(".panel-body h2")].filter(visible).map((x) => x.textContent).join(" ") : "",
  };
}

// A small, safe formatter: paragraphs, "- " lists, **bold** and `code`. No HTML.
function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[0].startsWith("**") ? h("b", null, m[0].slice(2, -2)) : h("code", null, m[0].slice(1, -1)));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function format(text) {
  const blocks = [];
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) { if (!list) { list = h(/^\d/.test(line) ? "ol" : "ul"); blocks.push(list); } list.append(h("li", null, inline(item[1]))); continue; }
    list = null;
    if (line) blocks.push(h("p", null, inline(line)));
  }
  return blocks;
}

function add(role, content) {
  const bubble = h("div", { class: `tutor-msg ${role}` }, role === "tutor" ? format(content) : content);
  els.log.append(bubble);
  els.log.scrollTop = els.log.scrollHeight;
  return bubble;
}

function describe(c) {
  const bits = [c.mode === "practice" ? "the practice question" : c.step || "this page"];
  if (c.line) bits.push(`line “${c.line.length > 34 ? `${c.line.slice(0, 34)}…` : c.line}”`);
  return `Looking at ${tool.title}: ${bits.join(", ")}`;
}

async function send(text) {
  const ask = text.trim();
  if (!ask || busy) return;
  busy = true;
  els.input.value = "";
  els.send.disabled = true;
  add("user", ask);
  const ctx = context();
  els.where.textContent = describe(ctx);
  const thinking = add("tutor thinking", "Thinking…");
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ctx, history, ask }) });
    const data = await res.json().catch(() => ({}));
    thinking.remove();
    if (!res.ok || !data.answer) {
      add("tutor error", data.error ?? (res.status === 404 ? "The tutor only runs on the live site." : "Something went wrong. Try again in a moment."));
    } else {
      add("tutor", data.answer);
      history.push({ role: "user", text: ask }, { role: "tutor", text: data.answer });
      history = history.slice(-6);
    }
  } catch {
    thinking.remove();
    add("tutor error", navigator.onLine ? "Couldn't reach the tutor. Try again in a moment." : "You're offline, so the tutor can't answer right now.");
  }
  busy = false;
  els.send.disabled = false;
  els.input.focus();
}

function suggestions() {
  const practice = context().mode === "practice";
  const list = practice
    ? ["Give me a hint", "How do I approach this?", "Explain the idea behind it"]
    : ["Explain this step", "Why this line?", "What do the variables mean?", "Explain the algorithm simply"];
  els.chips.replaceChildren(...list.map((s) => h("button", { type: "button", class: "tutor-chip", onclick: () => send(s) }, s)));
}

function build() {
  const log = h("div", { class: "tutor-log", "aria-live": "polite" });
  const where = h("p", { class: "tutor-where" });
  const chips = h("div", { class: "tutor-chips" });
  const input = h("textarea", { rows: 2, maxlength: 600, placeholder: "Ask anything about this step…", "aria-label": "Your question", onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } } });
  const sendBtn = h("button", { type: "submit", class: "btn primary" }, "Ask");
  const panel = h("section", { class: "tutor-panel", role: "dialog", "aria-label": "Ask about this step", hidden: true },
    h("header", null, h("b", null, "Ask about this step"), h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => toggle(false) }, "×")),
    where, log, chips,
    h("form", { class: "tutor-form", onsubmit: (e) => { e.preventDefault(); send(input.value); } }, input, sendBtn),
    h("p", { class: "tutor-foot" }, "AI answers can be wrong; check them against the steps. Questions aren't stored."));
  const fab = h("button", { type: "button", class: "tutor-fab", "aria-expanded": "false", onclick: () => toggle() }, h("span", { "aria-hidden": "true" }, "✦"), " Ask");
  document.body.append(panel, fab);
  els = { panel, fab, log, where, chips, input, send: sendBtn };
}

function toggle(open = els.panel.hidden) {
  els.panel.hidden = !open;
  els.fab.setAttribute("aria-expanded", String(open));
  if (open) {
    els.where.textContent = describe(context());
    suggestions();
    if (!els.log.childElementCount) add("tutor", `Hi! Ask me anything about **${tool.title}**: why a step happens, what a line of pseudocode does, or how to approach a practice question. I can see the step you're on.`);
    els.input.focus();
  }
}

// Called by the router: show the tutor for a tool page, hide it elsewhere.
export function mountTutor(next) {
  if (!els) build();
  if (!next) { els.fab.hidden = true; els.panel.hidden = true; return; }
  if (next.slug !== tool?.slug) { history = []; els.log.replaceChildren(); }
  tool = next;
  els.fab.hidden = false;
  if (!els.panel.hidden) toggle(true);
}
