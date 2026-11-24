// The "AI settings" dialog: use the free shared models (Auto) or bring your own
// key. The key is kept in this browser (localStorage) and sent with each AI
// request in a header; the server uses it for that request only and never
// stores or logs it. openAiSettings() can be called from anywhere.
import { h } from "../ui.js";
import { aiSettings, saveAiSettings } from "./client.js";

const PROVIDERS = {
  openai: { name: "OpenAI", model: "gpt-4o-mini", hint: "Keys start with sk-. Create one at platform.openai.com." },
  anthropic: { name: "Anthropic", model: "claude-haiku-5-5", hint: "Keys start with sk-ant-. Create one at console.anthropic.com." },
  gemini: { name: "Google Gemini", model: "gemini-flash-latest", hint: "Create a key at aistudio.google.com." },
  openrouter: { name: "OpenRouter", model: "openrouter/auto", hint: "One key for many models. Create one at openrouter.ai." },
};

let dialog = null;

function build() {
  const s = aiSettings();
  let mode = s.provider && s.key ? "own" : "auto";
  const status = h("p", { class: "ai-set-status", role: "status" });
  const provider = h("select", { id: "ai-provider", onchange: () => sync() },
    Object.entries(PROVIDERS).map(([id, p]) => h("option", { value: id, selected: id === s.provider }, p.name)));
  const key = h("input", { id: "ai-key", type: "password", autocomplete: "off", spellcheck: "false", value: s.key ?? "", placeholder: "Paste your API key" });
  const model = h("input", { id: "ai-model", type: "text", autocomplete: "off", spellcheck: "false", value: s.model ?? "" });
  const hint = h("p", { class: "muted small" });
  const own = h("div", { class: "ai-set-own" },
    h("label", { for: "ai-provider" }, "Provider"), provider,
    h("label", { for: "ai-key" }, "API key"), key, hint,
    h("label", { for: "ai-model" }, "Model ", h("span", { class: "muted" }, "(optional)")), model);
  const radio = (value, title, text) => h("label", { class: "ai-set-choice" },
    h("input", { type: "radio", name: "ai-mode", value, checked: mode === value, onchange: () => { mode = value; sync(); } }),
    h("span", null, h("b", null, title), h("span", { class: "muted small" }, text)));
  function sync() {
    own.hidden = mode !== "own";
    const p = PROVIDERS[provider.value];
    hint.textContent = p.hint;
    model.placeholder = `Default: ${p.model}`;
    status.textContent = "";
  }
  const save = () => {
    if (mode === "own" && !key.value.trim()) { status.textContent = "Paste a key, or choose Auto."; key.focus(); return; }
    saveAiSettings(mode === "own" ? { provider: provider.value, key: key.value.trim(), model: model.value.trim() || undefined } : {});
    status.textContent = mode === "own" ? `Saved. AI features now use your ${PROVIDERS[provider.value].name} key.` : "Saved. AI features use the free shared models.";
    setTimeout(() => el.close(), 700);
  };
  const el = h("dialog", { class: "ai-set", "aria-labelledby": "ai-set-title" },
    h("form", { method: "dialog", onsubmit: (e) => { e.preventDefault(); save(); } },
      h("h2", { id: "ai-set-title" }, "AI settings"),
      h("p", { class: "muted" }, "Choose which model answers your questions on /ask and elsewhere on drishi."),
      h("div", { class: "ai-set-choices", role: "radiogroup", "aria-label": "Model choice" },
        radio("auto", "Auto (free)", "Shared free models. There's a small per-minute allowance for everyone."),
        radio("own", "Bring your own key", "Use your own OpenAI, Anthropic, Gemini or OpenRouter account. No shared limit; your provider bills you.")),
      own,
      h("p", { class: "ai-set-privacy small" },
        "Your key stays in this browser and is sent with each AI request, then used for that request only. drishi's server never stores or logs it. ",
        "Whichever model you choose sees the text and photos you send. Clear the key here at any time."),
      status,
      h("div", { class: "row ai-set-actions" },
        h("button", { type: "button", class: "btn ghost", onclick: () => el.close() }, "Cancel"),
        h("button", { type: "submit", class: "btn primary" }, "Save"))));
  sync();
  document.body.append(el);
  return el;
}

export function openAiSettings() {
  dialog?.remove();
  dialog = build();
  dialog.showModal();
}
