// /ask: "Ask anything, see it happen" and "Snap a question". The model reads the
// request and fills a visualiser's inputs; the visualiser's own engine works out
// the answer, and questions with options are checked against them.
import { h } from "../ui.js";
import { aiCall, aiSettings } from "../ai/client.js";

const EXAMPLES = [
  "Round robin, quantum 2: P1 arrives 0 burst 5, P2 at 1 burst 3, P3 at 2 burst 1. Average waiting time?",
  "How many page faults with LRU and 3 frames for 7 0 1 2 0 3 0 4 2 3 0 3 2?",
  "Why does SJF starve long jobs?",
  "Dijkstra from A: A-B 4, A-C 1, C-B 2, B-D 5",
  "192.168.10.77/26 ka broadcast address kya hai?",
  "Minimise Σm(0,1,2,5,8,9,10) with a K-map",
];
const MAX_SIDE = 1280;

// Downscale a photo to at most 1280 px on its longest side, as a JPEG data URL.
async function shrink(file) {
  if (!/^image\//.test(file.type)) throw new Error("Choose an image file.");
  if (file.size > 25_000_000) throw new Error("That image is too large.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That image couldn't be opened. Try a JPEG or PNG."); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const show = (v) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));

export function render(root) {
  const params = new URLSearchParams(location.search);
  let busy = null, photo = null;

  const input = h("textarea", { id: "ask-q", class: "ask-input", rows: 3, maxlength: 1200, placeholder: "Ask about any algorithm, or paste a question. English or Hinglish both work.", "aria-label": "Your question",
    onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); run(); } } });
  input.value = params.get("q") ?? "";
  const file = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: () => { if (file.files[0]) snap(file.files[0]); file.value = ""; } });
  const snapBtn = h("button", { type: "button", class: "btn ghost ask-snap", onclick: () => file.click(), "aria-label": "Take a photo or upload an image of a question" },
    h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, h("path", { d: "M4 8h3l2-3h6l2 3h3v11H4z" }), h("circle", { cx: 12, cy: 13, r: 3.5 })), "Snap a question");
  const askBtn = h("button", { type: "submit", class: "btn primary" }, "Ask");
  const mode = h("span", { class: "muted small" });
  const syncMode = () => { const s = aiSettings(); mode.textContent = s.provider && s.key ? `Using your ${s.provider} key` : "Using free shared models"; };
  syncMode();
  const settingsBtn = h("button", { type: "button", class: "linkish small", onclick: () => import("../ai/settings.js").then((m) => { m.openAiSettings(); document.querySelector("dialog.ai-set")?.addEventListener("close", syncMode); }) }, "AI settings");

  const chips = h("div", { class: "ask-chips", "aria-label": "Examples" },
    EXAMPLES.map((x) => h("button", { type: "button", class: "ask-chip", onclick: () => { input.value = x; run(); } }, x)));
  const progress = h("ol", { class: "ask-progress", "aria-live": "polite", hidden: true });
  const out = h("div", { class: "ask-out" });

  const form = h("form", { class: "ask-box card", onsubmit: (e) => { e.preventDefault(); run(); } },
    input,
    h("div", { class: "ask-bar" }, snapBtn, file, h("span", { class: "ask-spacer" }), mode, settingsBtn, askBtn));

  root.replaceChildren(h("div", { class: "ask-page" },
    h("header", { class: "tool-head" },
      h("p", { class: "eyebrow" }, "Ask Stepwise"),
      h("h1", null, "Ask anything, see it happen"),
      h("p", { class: "lede" }, "Type a question or snap a photo of one. The AI picks the right visualiser and fills in your numbers; the visualiser's own engine works out the answer, step by step.")),
    form, chips, progress, out,
    h("p", { class: "ask-privacy muted small" }, "What you type, and any photo you send, goes to the AI model chosen in AI settings (free shared models unless you add your own key). Don't include personal details. The AI only reads the question; every answer comes from the visualiser's engine.")));

  // --- Progress --------------------------------------------------------------------------
  function steps(labels) {
    progress.hidden = false;
    progress.replaceChildren(...labels.map((t) => h("li", null, t)));
    const items = [...progress.children];
    let at = -1;
    const go = (i) => { items.forEach((li, k) => { li.className = k < i ? "done" : k === i ? "now" : ""; }); at = i; };
    return { go, next: () => go(at + 1), done: () => go(items.length), fail: () => { items[Math.max(0, at)]?.classList.add("bad"); } };
  }

  function stop() { busy?.abort(); busy = null; }

  async function run(transcript = null) {
    const q = input.value.trim();
    if (!q && !transcript) { input.focus(); return; }
    stop();
    const ctl = (busy = new AbortController());
    if (!transcript) {
      photo = null;
      history.replaceState(null, "", `/ask?q=${encodeURIComponent(q.slice(0, 600))}`);
    }
    askBtn.disabled = true;
    const p = steps(transcript ? ["Reading your photo…", "Picking the tool…", "Checking with the engine…"] : ["Picking the tool…", "Checking with the engine…"]);
    p.go(transcript ? 1 : 0);
    const t = setTimeout(() => p.next(), 2500);
    out.replaceChildren();
    try {
      const r = await aiCall("ask", transcript ? { transcript } : { q }, { signal: ctl.signal });
      if (ctl !== busy) return;
      p.done();
      out.replaceChildren(result(r));
    } catch (e) {
      if (ctl !== busy || e.name === "AbortError") return;
      p.fail();
      out.replaceChildren(failure(e));
    } finally {
      clearTimeout(t);
      if (ctl === busy) { askBtn.disabled = false; busy = null; }
    }
  }

  async function snap(f) {
    stop();
    const ctl = (busy = new AbortController());
    out.replaceChildren();
    const p = steps(["Reading your photo…", "Picking the tool…", "Checking with the engine…"]);
    p.go(0);
    askBtn.disabled = true;
    try {
      photo = await shrink(f);
      out.replaceChildren(h("figure", { class: "ask-photo" }, h("img", { src: photo, alt: "Your photo" })));
      const { transcript } = await aiCall("ask", { action: "transcribe", image: photo }, { signal: ctl.signal });
      if (ctl !== busy) return;
      input.value = [transcript.stem, ...transcript.options.map((o, i) => `(${"ABCDEF"[i]}) ${o}`)].join("\n");
      busy = null;
      await run(transcript);
    } catch (e) {
      if (ctl !== busy || e.name === "AbortError") return;
      p.fail();
      askBtn.disabled = false;
      busy = null;
      out.replaceChildren(failure(e));
    }
  }

  function failure(e) {
    const limited = e.status === 429;
    return h("div", { class: "notice error ask-error", role: "alert" },
      h("p", null, e.message || "The AI couldn't answer just now."),
      limited ? h("p", null, "The free allowance is shared, so it can fill up. Wait a minute, or ", h("button", { type: "button", class: "linkish", onclick: () => settingsBtn.click() }, "add your own key"), ".") : null,
      h("p", null, "You can still ", h("a", { href: "/", "data-palette": "" }, "search every tool"), "."));
  }

  function result(r) {
    if (!r.tool) {
      return h("section", { class: "card ask-result" },
        h("p", { class: "eyebrow" }, "No exact match"),
        h("p", null, r.reply || "No visualiser fits that question well."),
        r.candidates?.length ? h("p", null, "Closest tools: ", r.candidates.slice(0, 4).map((c, i) => [i ? ", " : "", h("a", { href: `/${c.slug}` }, c.title)])) : null);
    }
    const solve = r.intent === "solve";
    const badge = !solve ? null : r.verified
      ? h("span", { class: "ask-badge ok" }, r.verifiedBy === "agreement" ? `Checked: ${r.agreement} readings agree` : `Verified: matches option ${"ABCDEF"[r.option]}`)
      : h("span", { class: "ask-badge warn" }, "Not verified");
    const paramRows = Object.entries(r.params ?? {});
    return h("section", { class: "card ask-result" },
      h("div", { class: "ask-head" },
        h("div", null,
          h("p", { class: "eyebrow" }, r.intent === "explain" ? "Explanation" : solve ? "Solved by the engine" : "Ready to run"),
          h("h2", null, r.tool.title), h("p", { class: "muted small" }, r.tool.subject)),
        h("a", { class: "btn primary", href: r.url }, "Open in the visualiser →")),
      h("p", { class: "ask-understood" }, h("b", null, "What I understood: "), r.understood),
      r.transcript?.options?.length ? h("ol", { class: "ask-options", type: "A" }, r.transcript.options.map((o, i) => h("li", { class: r.verified && r.option === i ? "hit" : null }, o))) : null,
      solve && r.answer ? h("div", { class: `ask-answer ${r.verified ? "ok" : "warn"}` },
        h("span", { class: "ask-answer-label" }, `Engine's answer (${r.answer.key})`),
        h("span", { class: "ask-answer-value" }, show(r.answer.value)),
        badge) : null,
      solve && !r.verified ? h("p", { class: "notice warn small" }, "This answer isn't verified. It's what the engine gives for the inputs below, so check they match your question before relying on it.") : null,
      r.engine ? h("p", { class: "ask-engine" }, h("b", null, "Engine: "), r.engine) : null,
      r.intent === "explain" && r.reply ? h("div", { class: "ask-explain" }, h("p", null, r.reply), h("p", { class: "muted small" }, "The visualiser opens on an example that shows this.")) : r.reply ? h("p", { class: "muted" }, r.reply) : null,
      paramRows.length ? h("details", { class: "ask-inputs", open: solve && !r.verified },
        h("summary", null, "Inputs the AI filled in"),
        h("dl", null, paramRows.map(([k, v]) => [h("dt", null, k), h("dd", { class: "mono" }, v === "" ? "(none)" : v)]))) : null,
      r.error ? h("p", { class: "notice warn" }, r.error) : null,
      (r.notes ?? []).map((n) => h("p", { class: "muted small" }, n)),
      r.candidates?.length > 1 ? h("p", { class: "ask-alts small muted" }, "Not the right tool? Try ", r.candidates.filter((c) => c.slug !== r.tool.slug).slice(0, 3).map((c, i) => [i ? ", " : "", h("a", { href: `/${c.slug}` }, c.title)]), ".") : null);
  }

  if (input.value.trim()) run();
  else input.focus();
  return () => stop();
}
