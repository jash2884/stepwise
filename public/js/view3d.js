// Wiring for an optional 3D stage beside a 2D one. One "2D | 3D" toggle per
// tool drives any number of stages; a stage builds its scene only when 3D is
// picked (three.js loads then), and disposes it on 2D, on rebuild and on cleanup.
//
//   const v = view3d("routing");                // put v.el near the controls
//   const st = v.stage(stage2d, (box) => import("./net3d.js").then((m) => m.routingScene(box, g)));
//   st.show(data)                                // every step; replayed when 3D opens
//   v.disposeAll()                               // on rebuild and in the view's cleanup
import { h } from "./ui.js";
import { viewToggle } from "./three-kit.js";

export function view3d(key) {
  const stages = new Set();
  const toggle = viewToggle(key, (m) => { for (const s of stages) s.apply(m); });
  toggle.el.classList.add("net3d-toggle");

  function stage(el2d, build, { hint = "Drag to orbit · scroll or pinch to zoom" } = {}) {
    const box = h("div", { class: "net3d-box" });
    const wrap = h("div", { class: "net3d-wrap", hidden: true }, box, h("p", { class: "three-hint" }, hint));
    const el = h("div", { class: "net3d-stage" }, el2d, wrap);
    let scene = null, last = undefined, gen = 0, alive = true;
    async function apply(mode) {
      if (!alive) return;
      if (mode !== "3d") { kill(); wrap.hidden = true; el2d.hidden = false; return; }
      el2d.hidden = true; wrap.hidden = false;
      if (scene) return;
      const my = ++gen;
      box.replaceChildren(h("p", { class: "muted small net3d-loading" }, "Loading 3D…"));
      try {
        const s = await build(box);
        if (my !== gen || !alive) { s.dispose(); return; }
        scene = s;
        if (last !== undefined) scene.show(last);
      } catch (e) {
        if (my !== gen) return;
        box.replaceChildren(h("p", { class: "muted small" }, "3D couldn't start in this browser, so the 2D view is shown."));
        el2d.hidden = false;
        console.error(e);
      }
    }
    function kill() { gen++; scene?.dispose(); scene = null; box.replaceChildren(); }
    const handle = {
      el, apply,
      show(data) { last = data; scene?.show(data); },
      dispose() { alive = false; kill(); stages.delete(handle); },
    };
    stages.add(handle);
    apply(toggle.mode);
    return handle;
  }

  return {
    el: toggle.el,
    get mode() { return toggle.mode; },
    stage,
    disposeAll() { for (const s of [...stages]) s.dispose(); },
  };
}
