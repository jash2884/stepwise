// The eye on /progress: each block stands for a share of the GATE CS roadmap
// and lights up as topics are mastered.
import { roadmapOf } from "./roadmaps.js";
import { h } from "./ui.js";
import { mountEye } from "./eye.js";
import { load } from "./learn/store.js";
import { stageProgress } from "./learn/model.js";

export async function mountProgressEye(main) {
  const gate = roadmapOf("gate-cs"), s = load();
  let done = 0, total = 0;
  for (const st of gate.stages) { const p = stageProgress(s, st, Date.now()); done += p.mastered; total += p.total; }
  const stage = h("div", { "aria-hidden": "true", style: "position:absolute;inset:0" });
  const box = h("div", { class: "progress-eye" }, stage, h("p", null, done ? `${done} of ${total} GATE topics are in sight` : `Master a topic and the first blocks light up`));
  const head = main.querySelector(".tool-head");
  if (head) head.after(box); else main.prepend(box);
  const eye = await mountEye(stage, { lit: total ? done / total : 0, scale: 1.15 });
  if (!eye) box.remove();
  return eye;
}
