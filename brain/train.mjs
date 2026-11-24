// Trains the on-device router: averaged hashed-feature embeddings + softmax,
// Adagrad, feature dropout and label smoothing. Writes 8-bit weights.
//   node brain/train.mjs [--dim=48] [--epochs=10] [--seed=1] [--drop=0.35]
import fs from "node:fs";
import { BUCKETS, features } from "../public/js/ai/local/features.js";
import { decode, predict } from "../public/js/ai/local/model.js";
import { rng } from "../public/js/ui.js";
const arg = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const D = arg("dim", 48), EPOCHS = arg("epochs", 10), DROP = arg("drop", 0.35), LR = arg("lr", 0.15), r = rng(arg("seed", 1));
const data = fs.readFileSync(new URL("./train.jsonl", import.meta.url), "utf8").split("\n").map((l) => JSON.parse(l));
const labels = [...new Set(data.map((e) => e.tool))].sort(), intents = ["show", "solve", "explain"];
const K = labels.length, li = new Map(labels.map((l, i) => [l, i]));
const X = data.map((e) => ({ f: features(e.q), y: li.get(e.tool), z: intents.indexOf(e.intent), known: e.src !== "keywords" })).filter((e) => e.f.length);
const counts = new Float32Array(K); for (const e of X) counts[e.y]++;
const mean = X.length / K, weight = Array.from(counts, (c) => Math.min(2.5, Math.sqrt(mean / c)));
const E = new Float32Array(BUCKETS * D).map(() => (r() - 0.5) / D * 2), W = new Float32Array(K * D), B = new Float32Array(K), I = new Float32Array(3 * D), IB = new Float32Array(3);
const GE = new Float32Array(BUCKETS * D).fill(1e-4), GW = new Float32Array(K * D).fill(1e-4), GB = new Float32Array(K).fill(1e-4), GI = new Float32Array(3 * D).fill(1e-4), GIB = new Float32Array(3).fill(1e-4);
const order = X.map((_, i) => i), h = new Float32Array(D), gh = new Float32Array(D), EPS = 0.05;
const head = (M, b, GM, gb, n, y, w, lr) => {
  const s = new Float32Array(n); let mx = -1e9;
  for (let k = 0; k < n; k++) { let v = b[k]; for (let d = 0; d < D; d++) v += M[k * D + d] * h[d]; s[k] = v; if (v > mx) mx = v; }
  let sum = 0; for (let k = 0; k < n; k++) sum += (s[k] = Math.exp(s[k] - mx));
  const loss = -Math.log(s[y] / sum);
  for (let k = 0; k < n; k++) {
    const g = (s[k] / sum - (k === y ? 1 - EPS : EPS / (n - 1))) * w;
    if (Math.abs(g) < 1e-5) continue;
    gb[k] += g * g; b[k] -= lr * g / Math.sqrt(gb[k]);
    for (let d = 0; d < D; d++) { const j = k * D + d, m = M[j], gg = g * h[d]; gh[d] += g * m; GM[j] += gg * gg; M[j] = m - lr * gg / Math.sqrt(GM[j]); }
  }
  return loss;
};
const t0 = Date.now();
for (let ep = 0; ep < EPOCHS; ep++) {
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let loss = 0; const lr = LR * (1 - ep / EPOCHS) + 0.01;
  for (const i of order) {
    const e = X[i]; let f = e.f.filter(() => r() > DROP); if (!f.length) f = e.f;
    h.fill(0); gh.fill(0);
    for (const id of f) for (let d = 0; d < D; d++) h[d] += E[id * D + d];
    for (let d = 0; d < D; d++) h[d] /= f.length;
    loss += head(W, B, GW, GB, K, e.y, weight[e.y], lr);
    if (e.known) head(I, IB, GI, GIB, 3, e.z, 0.3, lr);
    for (const id of f) for (let d = 0; d < D; d++) { const j = id * D + d, g = gh[d] / f.length; GE[j] += g * g; E[j] -= lr * g / Math.sqrt(GE[j]); }
  }
  if (ep % 3 === 2 || ep === EPOCHS - 1) console.log(`epoch ${ep + 1} loss ${(loss / X.length).toFixed(3)} ${Math.round((Date.now() - t0) / 1000)}s`);
}
// 8-bit weights: clip at the 99.95th percentile so outliers don't waste range.
const quant = (A) => { const a = Float32Array.from(A, Math.abs).sort(), c = a[Math.floor(a.length * 0.9995)] || 1, scale = c / 127; return { q: Int8Array.from(A, (v) => Math.max(-127, Math.min(127, Math.round(v / scale)))), scale }; };
const qe = quant(E), qw = quant(W), qi = quant(I);
const bin = new Int8Array(qe.q.length + qw.q.length + qi.q.length); bin.set(qe.q, 0); bin.set(qw.q, qe.q.length); bin.set(qi.q, qe.q.length + qw.q.length);
const meta = { v: 1, dim: D, buckets: BUCKETS, labels, intents, bias: [...B].map((x) => +x.toFixed(4)), ibias: [...IB].map((x) => +x.toFixed(4)), scaleE: qe.scale, scaleW: qw.scale, scaleI: qi.scale };
const out = new URL("../public/models/", import.meta.url); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL("router.bin", out), bin); fs.writeFileSync(new URL("router.json", out), JSON.stringify(meta));
console.log(`model ${(bin.length / 1e6).toFixed(2)} MB`);
