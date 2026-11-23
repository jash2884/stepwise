// Helpers for the AI tool-schema registry (tool-schemas.js). A schema says, for
// one visualiser, which URL parameters it reads (types, formats, ranges and
// defaults, copied from the view's readParams code), a few worked examples,
// and a validate() that runs the tool's own engine on those inputs. The AI
// never computes an answer: it fills the inputs, the engine does the rest.
//
// A schema looks like:
//   tool("cpu-scheduling", {
//     keywords: "extra words people use for this tool",
//     params: { algo: { type: "enum", values: [...], default: "srtf", desc: "..." }, ... },
//     answers: { avgWT: "average waiting time", "ct.P1": "completion time of P1 (one per process)" },
//     hash: "calc" | (values) => "calc" | undefined,   // optional #anchor
//     examples: [{ request: "what a student might type", params: { ... } }],
//     validate(v) { ...run the engine on the typed values v; throw on bad input;
//                   return { text: "one-line answer", values: { key: number | string } } },
//   })
//
// Param types: int, number, enum, string, bool ("1" or "0" in the URL). A string
// param with allowEmpty: true keeps "" (meaning "none") instead of taking the default.
// Every key in params must be one the view reads with params.get("key").
// Everything here is pure (no DOM): the Worker imports it too.

const MAX_STRING = 800;

export function tool(slug, spec) {
  if (!spec.params || !spec.examples?.length || typeof spec.validate !== "function") throw new Error(`${slug}: a schema needs params, examples and validate()`);
  return { slug, keywords: "", answers: {}, ...spec };
}

// Turn loose values (from a model, or a URL) into checked URL strings plus typed
// values with defaults filled in. Unknown keys are dropped. Returns { error } on a bad value.
export function coerce(schema, raw = {}) {
  const url = {}, values = {};
  for (const [key, def] of Object.entries(schema.params)) {
    let v = raw?.[key];
    // allowEmpty: an empty string means "none" for this param (e.g. no lost frames), not "use the default".
    if (v === "" && def.type === "string" && def.allowEmpty) { url[key] = ""; values[key] = ""; continue; }
    if (v === undefined || v === null || v === "") {
      if (def.required) return { error: `${key} is required: ${def.desc}` };
      values[key] = def.default;
      continue;
    }
    if (Array.isArray(v)) v = v.join(def.join ?? " ");
    if (typeof v === "object") return { error: `${key} must be a ${def.type}, not an object` };
    if (def.type === "int" || def.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: `${key} must be a number (got "${v}")` };
      if (def.type === "int" && !Number.isInteger(n)) return { error: `${key} must be a whole number (got ${n})` };
      if (def.min !== undefined && n < def.min) return { error: `${key} must be at least ${def.min} (got ${n})` };
      if (def.max !== undefined && n > def.max) return { error: `${key} must be at most ${def.max} (got ${n})` };
      url[key] = String(n); values[key] = n;
    } else if (def.type === "enum") {
      const s = String(v).trim();
      const hit = def.values.find((x) => x === s) ?? def.values.find((x) => x.toLowerCase() === s.toLowerCase());
      if (hit === undefined) return { error: `${key} must be one of ${def.values.join(", ")} (got "${s}")` };
      url[key] = hit; values[key] = hit;
    } else if (def.type === "bool") {
      const on = v === true || v === 1 || /^(1|true|yes|on)$/i.test(String(v));
      url[key] = on ? "1" : "0"; values[key] = on;
    } else {
      const s = String(v);
      if (s.length > (def.maxLength ?? MAX_STRING)) return { error: `${key} is too long (at most ${def.maxLength ?? MAX_STRING} characters)` };
      url[key] = s; values[key] = s;
    }
  }
  return { url, values };
}

// The exact link that opens the visualiser on these inputs.
export function toUrl(schema, url, values) {
  const q = new URLSearchParams(url).toString();
  const hash = typeof schema.hash === "function" ? schema.hash(values) : schema.hash;
  return `/${schema.slug}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}

// Check params end to end: types, ranges, then the engine itself.
// Returns { ok: true, url, params, answer } or { ok: false, error }.
export function check(schema, raw) {
  const c = coerce(schema, raw);
  if (c.error) return { ok: false, error: c.error };
  try {
    const answer = schema.validate(c.values);
    if (!answer || typeof answer.text !== "string") return { ok: false, error: "The engine returned nothing for these inputs." };
    return { ok: true, params: c.url, url: toUrl(schema, c.url, c.values), answer: { text: answer.text, values: answer.values ?? {} } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Compact text description of a schema for a model prompt.
export function describe(schema) {
  const lines = Object.entries(schema.params).map(([k, d]) => {
    const bits = [d.type === "enum" ? `one of ${d.values.join("|")}` : d.type];
    if (d.min !== undefined || d.max !== undefined) bits.push(`${d.min ?? ""}..${d.max ?? ""}`);
    if (d.format) bits.push(`format: ${d.format}`);
    if (d.default !== undefined) bits.push(`default ${JSON.stringify(d.default)}`);
    if (d.required) bits.push("required");
    return `  ${k} (${bits.join("; ")}): ${d.desc}`;
  });
  const ans = Object.entries(schema.answers ?? {}).map(([k, d]) => `  ${k}: ${d}`);
  const ex = schema.examples[0];
  return [
    `params:`, ...lines,
    ans.length ? `answer keys (for "ask"):` : "", ...ans,
    `example: "${ex.request}" -> ${JSON.stringify(ex.params)}`,
  ].filter(Boolean).join("\n");
}

// Small helpers schemas share.
export const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
export const list = (s, re = /[\s,]+/) => String(s ?? "").trim().split(re).filter(Boolean);
export const nums = (s) => list(s).map((x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`"${x}" is not a number`);
  return n;
});
