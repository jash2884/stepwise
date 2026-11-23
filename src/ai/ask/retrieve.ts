// Hybrid retrieval over tool cards: dense embeddings (bge-m3, multilingual, so
// Hinglish works) plus BM25 keywords, fused with Reciprocal Rank Fusion.
// The card embeddings are computed once per isolate and also kept in the Cache
// API, keyed by a hash of the card text, so a cold isolate rarely re-embeds.
import { CARDS } from "./tool-cards.js";

export type Card = { slug: string; title: string; subject: string; summary: string; description: string; keywords: string; examples: string[] };
export type Embedder = (texts: string[]) => Promise<number[][]>;
export type Hit = { card: Card; score: number; dense?: number; bm25?: number };

export const cardText = (c: Card) => `${c.title}. ${c.subject}. ${c.summary} ${c.description} Keywords: ${c.keywords}. Examples: ${c.examples.join(" | ")}`;

// --- BM25 ----------------------------------------------------------------------------
const STOP = new Set("a an and are as at be by for from how i in is it its of on or the this to what when which why with you your me my do does can using use show find kya hai ka ki ke ko se me mein aur".split(" "));
export function tokens(text: string): string[] {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}+#]+/u).filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export function bm25Index(docs: string[], k1 = 1.4, b = 0.75) {
  const toks = docs.map(tokens);
  const avg = toks.reduce((s, t) => s + t.length, 0) / Math.max(1, toks.length);
  const df = new Map<string, number>();
  const tf = toks.map((t) => {
    const m = new Map<string, number>();
    for (const w of t) m.set(w, (m.get(w) ?? 0) + 1);
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    return m;
  });
  const N = docs.length;
  return (query: string) => {
    const q = [...new Set(tokens(query))];
    return tf.map((m, i) => {
      let s = 0;
      for (const w of q) {
        const f = m.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - df.get(w)! + 0.5) / (df.get(w)! + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * toks[i].length / avg));
      }
      return s;
    });
  };
}

// --- Dense ---------------------------------------------------------------------------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const dot = (a: number[], b: number[]) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const unit = (v: number[]) => { const n = Math.sqrt(dot(v, v)) || 1; return v.map((x) => x / n); };

let isolateIndex: { key: string; vectors: number[][] } | null = null;

async function cardVectors(cards: Card[], embedder: Embedder): Promise<number[][]> {
  const texts = cards.map(cardText);
  const key = `v1-${cards.length}-${hash(texts.join("\n"))}`;
  if (isolateIndex?.key === key) return isolateIndex.vectors;
  const cacheUrl = `https://stepwise.internal/ai/ask-index/${key}`;
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  if (cache) {
    try {
      const hit = await cache.match(cacheUrl);
      if (hit) { const vectors = await hit.json() as number[][]; isolateIndex = { key, vectors }; return vectors; }
    } catch { /* cache unavailable: embed below */ }
  }
  const vectors = (await embedder(texts)).map(unit);
  if (vectors.length !== cards.length) throw new Error("Embedding count mismatch");
  isolateIndex = { key, vectors };
  if (cache) {
    try { await cache.put(cacheUrl, new Response(JSON.stringify(vectors), { headers: { "content-type": "application/json", "cache-control": "public, max-age=2592000" } })); } catch { /* best effort */ }
  }
  return vectors;
}

let bm25: { n: number; score: (q: string) => number[] } | null = null;

// Top-k cards for a query. Falls back to BM25 alone if embeddings fail.
export async function retrieve(query: string, { embedder, k = 6, cards = CARDS as Card[] }: { embedder?: Embedder; k?: number; cards?: Card[] } = {}): Promise<Hit[]> {
  if (!bm25 || bm25.n !== cards.length || cards !== CARDS) bm25 = { n: cards.length, score: bm25Index(cards.map(cardText)) };
  const kw = bm25.score(query);
  let dense: number[] | null = null;
  if (embedder) {
    try {
      const [vectors, [qv]] = await Promise.all([cardVectors(cards, embedder), embedder([query])]);
      const q = unit(qv);
      dense = vectors.map((v) => dot(v, q));
    } catch (e) { console.warn("ask: dense retrieval failed, using BM25 only", e); }
  }
  const rankOf = (scores: number[]) => {
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const r = new Array(scores.length);
    order.forEach(([s, i], pos) => { r[i] = s > 0 ? pos : Infinity; });
    return r;
  };
  const K = 60;
  const kwRank = rankOf(kw), dRank = dense ? rankOf(dense) : null;
  return cards.map((card, i) => ({
    card, bm25: kw[i], dense: dense?.[i],
    score: (Number.isFinite(kwRank[i]) ? 1 / (K + kwRank[i] + 1) : 0) + (dRank ? 1 / (K + dRank[i] + 1) : 0),
  })).sort((a, b) => b.score - a.score).slice(0, k);
}
