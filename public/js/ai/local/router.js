// Loads the on-device router once. guess(text) -> { tools: [{ slug, p }], intent }
// ("none" means it doesn't look like a question any visualiser answers).
import { decode, predict } from "./model.js";
let ready = null;
export const loadRouter = () => (ready ??= Promise.all([
  fetch("/models/router.json").then((r) => { if (!r.ok) throw new Error("no model"); return r.json(); }),
  fetch("/models/router.bin").then((r) => { if (!r.ok) throw new Error("no model"); return r.arrayBuffer(); }),
]).then(([meta, buf]) => decode(buf, meta)).catch((e) => { ready = null; throw e; }));
export async function guess(text) { return predict(await loadRouter(), text); }
