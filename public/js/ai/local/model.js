// The on-device router: an averaged-embedding linear classifier (fastText
// style) with 8-bit weights. Reads a question, scores every tool and an intent.
import { features } from "./features.js";

export function decode(buffer, meta) {
  const { dim, buckets, labels, scaleE, scaleW, scaleI, intents } = meta;
  const bytes = new Int8Array(buffer);
  let at = 0;
  const take = (n) => bytes.subarray(at, (at += n));
  return { dim, labels, intents, E: take(buckets * dim), W: take(labels.length * dim), B: meta.bias, I: take(intents.length * dim), IB: meta.ibias, scaleE, scaleW, scaleI };
}

const softmax = (z) => { const m = Math.max(...z), e = z.map((x) => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };

export function predict(m, text) {
  const ids = features(text), h = new Float32Array(m.dim);
  if (!ids.length) return { tools: [], intent: "show" };
  for (const id of ids) for (let d = 0; d < m.dim; d++) h[d] += m.E[id * m.dim + d];
  for (let d = 0; d < m.dim; d++) h[d] = (h[d] * m.scaleE) / ids.length;
  const score = (W, b, scale, n) => Array.from({ length: n }, (_, k) => { let s = b[k]; for (let d = 0; d < m.dim; d++) s += W[k * m.dim + d] * scale * h[d]; return s; });
  const p = softmax(score(m.W, m.B, m.scaleW, m.labels.length));
  const pi = softmax(score(m.I, m.IB, m.scaleI, m.intents.length));
  const tools = p.map((prob, k) => ({ slug: m.labels[k], p: prob })).sort((a, b) => b.p - a.p);
  return { tools, intent: m.intents[pi.indexOf(Math.max(...pi))] };
}
