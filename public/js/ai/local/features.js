// Text to features for the on-device router. Pure, shared by training
// (scripts/brain) and the browser, so both always see the same thing.
// Words, word pairs, and character 3 to 5-grams (which survive typos and
// Hinglish spellings), plus a few shape tokens for the data in a question.
export const BUCKETS = 1 << 15;

export function normalise(text) {
  return String(text ?? "").toLowerCase().normalize("NFKC")
    .replace(/[−–—]/g, "-").replace(/[→⇒]/g, "->").replace(/[’‘]/g, "'").slice(0, 1500);
}

// What kind of data the question carries, independent of the exact numbers.
export function shapes(t) {
  const out = [];
  const add = (re, name) => { if (re.test(t)) out.push(`#${name}`); };
  add(/\b\d{1,3}(\.\d{1,3}){3}\b/, "ip");
  add(/\b\d{1,3}(\.\d{1,3}){3}\/\d{1,2}\b/, "cidr");
  add(/[σΣ∑]\s*m|\bminterms?\b/i, "minterms");
  add(/\b[01]{5,}\b/, "bits");
  add(/ε|\bepsilon\b|\blambda\b/, "eps");
  add(/\b[a-z]{1,3}'?\s*->\s*\S/i, "arrow");
  add(/\br[1-9]\s*\([a-z]\)|\bw[1-9]\s*\([a-z]\)/i, "schedule");
  add(/\[\s*\[/, "matrix");
  add(/\b[a-z]\s*-\s*[a-z]\s*[:=]?\s*\d+/i, "edges");
  add(/(?:\d+\s*[, ]\s*){5,}\d+/, "list");
  add(/\bp[1-9]\b/i, "procs");
  add(/\bt\s*\(\s*n\s*\)/i, "recurrence");
  add(/∧|∨|¬|->.*(?:p|q)\b|\bp\s*(?:and|or|->)\s*q\b/i, "logic");
  add(/\b(?:mbps|kbps|gbps)\b/, "mbps");
  add(/\b(?:kb|mb|gb|bytes?)\b/, "bytes");
  add(/\b0x[0-9a-f]+\b/, "hex");
  return out;
}

// FNV-1a, folded into the bucket table.
function hash(s) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return (x ^ (x >>> 15)) >>> 0;
}

// Unique bucket ids for a text.
export function features(text) {
  const t = normalise(text);
  const ids = new Set(shapes(t).map((s) => hash(s) % BUCKETS));
  const words = t.replace(/\d+(\.\d+)?/g, " 0 ").match(/[a-zऀ-ॿ]+|0|[+*^σ∑ε∀∃∧∨¬]/g) ?? [];
  const kept = words.filter((w) => w !== "0");
  for (let i = 0; i < kept.length; i++) {
    const w = kept[i];
    ids.add(hash(`w:${w}`) % BUCKETS);
    if (i + 1 < kept.length) ids.add(hash(`b:${w} ${kept[i + 1]}`) % BUCKETS);
    if (w.length >= 3) {
      const p = `<${w}>`;
      for (let n = 3; n <= 5; n++) for (let k = 0; k + n <= p.length; k++) ids.add(hash(`c:${p.slice(k, k + n)}`) % BUCKETS);
    }
  }
  return [...ids];
}
