// Program-aided verification: does the engine's answer match one of the
// question's options? Numbers compare with a small tolerance (and ignore units
// and option labels); text compares after normalising case, spacing and
// punctuation, and as an unordered set when the order doesn't matter.

const LABEL = /^\s*(?:\(?[a-dA-D1-4]\)|[a-dA-D][.:]|option\s+[a-d1-4][.:)]?)\s*/i;
export const stripLabel = (o: string) => String(o ?? "").replace(LABEL, "").trim();

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[\u2212\u2013\u2014]/g, "-").replace(/∞|infinity/g, "inf")
  .replace(/[{}()[\]"'`]/g, " ").replace(/\s*([,;→>-])\s*/g, "$1").replace(/[,;→]|->/g, " ").replace(/\s+/g, " ").trim();

function asNumber(s: string): number | null {
  const t = String(s).trim().replace(/,(?=\d{3}\b)/g, "");
  const frac = /^(-?\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac && Number(frac[2])) return Number(frac[1]) / Number(frac[2]);
  const m = /^(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(%|[a-zA-Z/ ]{0,12})?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function same(value: unknown, option: string): boolean {
  const o = stripLabel(option);
  if (typeof value === "boolean") return /^(yes|true|y)$/i.test(o) ? value : /^(no|false|n)$/i.test(o) ? !value : false;
  const vs = String(value);
  const vn = typeof value === "number" ? value : asNumber(vs), on = asNumber(o);
  if (vn !== null && on !== null) {
    const tol = Math.max(0.01, Math.abs(vn) * 0.005);
    return Math.abs(vn - on) <= tol || (Math.abs(on) <= 1 && Math.abs(vn - on * 100) <= tol) || (Math.abs(vn) <= 1 && Math.abs(vn * 100 - on) <= tol);
  }
  const a = norm(vs), b = norm(o);
  if (!a || !b) return false;
  if (a === b) return true;
  // Same items, any order ("{a, b}" vs "b a") for set-like answers.
  const sa = a.split(" ").sort().join(" "), sb = b.split(" ").sort().join(" ");
  return a.includes(" ") && sa === sb && /^[{]/.test(vs.trim());
}

// Index of the option that matches the value, or -1. Ambiguous (two options match) counts as no match.
export function matchOption(value: unknown, options: string[]): number {
  if (value === undefined || value === null) return -1;
  const hits = options.map((o, i) => (same(value, o) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

// Pick the answer value a question asks for. If the model's key is missing,
// fall back to a key that matches by suffix (ct.p1 vs ct.P1).
export function answerValue(values: Record<string, unknown>, ask?: string | null): { key: string; value: unknown } | null {
  if (!ask) return null;
  if (ask in values) return { key: ask, value: values[ask] };
  const lower = Object.keys(values).find((k) => k.toLowerCase() === ask.toLowerCase());
  return lower ? { key: lower, value: values[lower] } : null;
}
