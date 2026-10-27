// 3D view for the Turing machine: a long physical tape of cells running under
// a fixed read/write carriage. The tape slides so the head stays centred, a
// written cell flips over to show its new symbol, and the carriage carries the
// current state as a glowing state-diagram node (green on accept, red on
// reject). Loaded only when the 3D view is chosen.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const CW = 1.0, CELL = { w: 0.92, h: 0.16, d: 0.92 }, PAD = 8;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

export async function turingScene(host, { res, blank, height }) {
  const steps = res.steps;
  const lo = Math.min(...steps.map((s) => s.lo)), hi = Math.max(...steps.map((s) => s.lo + s.cells.length - 1));
  const first = lo - PAD, total = hi - lo + 1 + PAD * 2;
  const symAt = (st, pos) => (pos >= st.lo && pos < st.lo + st.cells.length ? st.cells[pos - st.lo] : blank);

  const fov = 40, target = [0, 0.85, 0];
  // Distance that fits about seven (phone) to nine cells across (and the carriage's height) for this width.
  const fit = (w) => { const a = w / height; return Math.min(17, Math.max(7, Math.min(9.5, 4.5 + 2.5 * a) / (2 * Math.tan((fov * Math.PI) / 360) * a))); };
  const dir = [0, 0.95, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov, fog: [11, 19],
    camera: dir.map((v, i) => target[i] + (v / len) * fit(host.clientWidth || 640)),
    aria: "3D Turing machine: a tape of cells sliding under the read/write head, which shows the current state",
  });
  const { THREE, scene, label, colour } = s;

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    h("span", { class: "k toc-head" }, "head"), h("span", { class: "k toc-good" }, "accept"), h("span", { class: "k toc-bad" }, "reject"));
  s.el.classList.add("toc3d");
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  // A symbol painted on a cell face (cached per symbol; rebuilt with the theme).
  let texCache = new Map();
  function symTex(sym) {
    if (texCache.has(sym)) return texCache.get(sym);
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const isBlank = sym === blank;
    ctx.fillStyle = `#${colour(isBlank ? "--muted" : "--text").getHexString()}`;
    ctx.font = `${isBlank ? 500 : 700} ${isBlank ? 64 : 84}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sym, 64, isBlank ? 58 : 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache.set(sym, t);
    return t;
  }

  let world = null, tape = null, cells = [], mats = null, carriage = null, node = null, ring = null, glow = null, stateTag = null, headFrame = null;
  let cur = -1, slide = { x: 0 }, tint = "--accent";
  const faceGeo = new THREE.PlaneGeometry(CELL.w * 0.86, CELL.d * 0.86);

  function build() {
    if (world) disposeTree(world);
    for (const t of texCache.values()) t.dispose();
    texCache = new Map();
    world = new THREE.Group();
    scene.add(world);
    const C = (n) => colour(n);
    mats = {
      cell: new THREE.MeshStandardMaterial({ color: C("--surface"), roughness: 0.55 }),
      edge: new THREE.LineBasicMaterial({ color: C("--line") }),
      rail: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface-2"), 0.45), metalness: 0.35, roughness: 0.5 }),
      body: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface"), 0.25), metalness: 0.45, roughness: 0.38 }),
      frame: new THREE.MeshBasicMaterial({ color: C("--accent") }),
      glow: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.9 }),
      halo: new THREE.MeshBasicMaterial({ color: C("--accent"), transparent: true, opacity: 0.22, depthWrite: false }),
    };

    // The tape: one group that slides; each cell is a group that can flip.
    tape = new THREE.Group();
    world.add(tape);
    const boxGeo = new THREE.BoxGeometry(CELL.w, CELL.h, CELL.d), edgeGeo = new THREE.EdgesGeometry(boxGeo);
    cells = Array.from({ length: total }, (_, k) => {
      const pos = first + k, g = new THREE.Group();
      g.position.x = pos * CW;
      g.add(new THREE.Mesh(boxGeo, mats.cell), new THREE.LineSegments(edgeGeo, mats.edge));
      const top = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      top.rotation.x = -Math.PI / 2; top.position.y = CELL.h / 2 + 0.002;
      const under = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      under.rotation.x = Math.PI / 2; under.position.y = -CELL.h / 2 - 0.002;
      g.add(top, under);
      g.userData = { top, under, sym: null };
      tape.add(g);
      // Cell number in front, so moves left and right are easy to follow.
      const idx = label(pos, { size: 0.24, color: "--muted", bold: false });
      idx.position.set(pos * CW, -0.08, CELL.d / 2 + 0.24);
      tape.add(idx);
      return g;
    });
    // Guide rails the tape runs along (they stay put).
    for (const z of [-CELL.d / 2 - 0.09, CELL.d / 2 + 0.09]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(40, 0.07, 0.07), mats.rail);
      r.position.set(0, -CELL.h / 2, z);
      world.add(r);
    }

    // Read/write carriage: a bridge over the tape with a pointer down to the cell.
    carriage = new THREE.Group();
    world.add(carriage);
    // A post behind the tape and an arm reaching over the cell, so nothing hides the symbol.
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), mats.body);
    post.position.set(0, 0.62, -0.98);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.2), mats.body);
    beam.position.set(0, 1.27, -0.4);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 24), mats.glow);
    tip.rotation.x = Math.PI; tip.position.set(0, 1.0, 0);
    carriage.add(post, beam, tip);
    // A bright frame around the cell under the head.
    const fg = new THREE.RingGeometry(0.68, 0.77, 4, 1);
    fg.rotateZ(Math.PI / 4); fg.rotateX(-Math.PI / 2);
    headFrame = new THREE.Mesh(fg, mats.frame);
    headFrame.position.y = CELL.h / 2 + 0.01;
    carriage.add(headFrame);

    // The current state as a small glowing state-diagram node with a ring.
    node = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), mats.glow);
    node.position.y = 1.95;
    ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 12, 48), mats.glow);
    ring.position.y = 1.95;
    glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mats.halo);
    glow.position.y = 1.95;
    carriage.add(node, ring, glow);
    slide.x = 0;
    stateTag = null;
    tint = "--accent";
  }

  function setSym(g, sym, flip) {
    const { top, under } = g.userData;
    if (g.userData.sym === sym) return;
    if (flip && g.userData.sym != null && !reducedMotion()) {
      // Old symbol on the underside, turned up; the new one on top, turned down. Then flip.
      under.material.map = symTex(g.userData.sym); under.material.needsUpdate = true;
      top.material.map = symTex(sym); top.material.needsUpdate = true;
      g.rotation.x = -Math.PI;
      g.position.y = 0;
      s.tween(g.rotation, { x: 0 }, 520, ease.inOut);
      const lift = { k: 0 };
      s.tween(lift, { k: 1 }, 520, ease.linear);
      g.userData.lift = lift;
    } else {
      top.material.map = symTex(sym); top.material.needsUpdate = true;
      under.material.map = null; under.material.needsUpdate = true;
      g.rotation.x = 0;
      g.userData.lift = null;
    }
    g.userData.sym = sym;
  }

  function setTint(name) {
    if (tint === name) return;
    tint = name;
    const c = colour(name);
    mats.glow.color.copy(c); mats.glow.emissive.copy(c);
    mats.halo.color.copy(c); mats.frame.color.copy(c);
  }

  function show(i, instant = false) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[i], step = i === cur + 1 && !instant;
    cells.forEach((g, k) => setSym(g, symAt(st, first + k), step));
    const x = -st.head * CW;
    if (step && !reducedMotion()) s.tween(slide, { x }, 420, ease.out); else slide.x = x;
    cur = i;
    setTint(st.halt === "accept" ? "--good" : st.halt === "reject" ? "--bad" : st.halt === "limit" ? "--muted" : "--accent");
    if (stateTag) disposeTree(stateTag);
    stateTag = label(st.state, { size: 0.5, bg: tint, color: "--surface" });
    stateTag.position.set(0, 2.72, 0);
    carriage.add(stateTag);
    const verdict = st.halt === "accept" ? "accepted" : st.halt === "reject" ? "rejected" : st.halt === "limit" ? "stopped" : null;
    hud.replaceChildren(h("span", null, "State ", h("b", null, st.state)), h("span", null, "Head ", h("b", null, `cell ${st.head}`)), h("span", null, "Read ", h("b", null, symAt(st, st.head))),
      ...(verdict ? [h("span", { class: `toc-verdict ${st.halt}` }, h("b", null, verdict))] : []));
    s.render();
  }

  let t0 = 0;
  s.onFrame((dt) => {
    if (!tape) return;
    tape.position.x = slide.x;
    for (const g of cells) {
      const l = g.userData.lift;
      if (l) { g.position.y = Math.sin(l.k * Math.PI) * 0.55; if (l.k >= 1) { g.userData.lift = null; g.position.y = 0; } }
    }
    if (!reducedMotion()) {
      t0 += dt;
      ring.rotation.x = Math.PI / 2 + Math.sin(t0 * 1.3) * 0.35;
      ring.rotation.y += dt * 0.9;
      glow.scale.setScalar(1 + Math.sin(t0 * 2.4) * 0.08);
    } else ring.rotation.x = Math.PI / 2;
  });

  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); for (const t of texCache.values()) t.dispose(); faceGeo.dispose(); s.dispose(); } };
}
