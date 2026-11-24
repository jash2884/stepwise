// Draws frames (see frames3d.js) with three.js. Blocks are keyed, so from one
// step to the next they glide, grow, drop in or fade; a block that moves along
// the row arcs towards you, so a swap is seen passing. Values always face you.
import { loadThree, scene3d } from "./three-kit.js";
import { reducedMotion } from "./ui.js";

export const TONES = { base: "--block", dim: "--block-dim", floor: "--block-floor", range: "--block-range", compare: "--series-2", move: "--series-8", pivot: "--series-7", min: "--series-2", key: "--series-5", done: "--series-3", good: "--good", bad: "--bad", accent: "--accent", ghost: "--accent", muted: "--muted", text: "--text", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i + 1}`, `--series-${i + 1}`])) };

// The box that holds every frame of a run, so the camera never has to move.
export function extent(frames) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const f of frames) for (const b of [...f.items, ...f.marks.map((m) => ({ ...m, w: 0.8, d: 0.4, h: 0.5 }))]) {
    [[b.x - b.w / 2, b.x + b.w / 2], [b.y, b.y + b.h], [b.z - b.d / 2, b.z + b.d / 2]].forEach(([a, c], i) => { lo[i] = Math.min(lo[i], a); hi[i] = Math.max(hi[i], c); });
  }
  return { mid: lo.map((v, i) => (v + hi[i]) / 2), size: lo.map((v, i) => Math.max(1, hi[i] - v)) };
}

export async function blocksScene(box, { frames, aria = "3D view", tilt = 0.42, turn = 0.28, lift = 1 } = {}) {
  const { mid, size } = extent(frames);
  // The closest camera that still holds every block of every step.
  const T3 = await loadThree(), fov = 34, probe = new T3.PerspectiveCamera(fov, Math.max(0.6, (box.clientWidth || 800) / (innerWidth <= 700 ? Math.max(260, Math.min(420, innerHeight * 0.42)) : Math.max(300, Math.min(640, innerHeight - 356)))), 0.1, 2000), centre = new T3.Vector3(...mid);
  const dir = new T3.Vector3(Math.sin(turn) * Math.cos(tilt), Math.sin(tilt), Math.cos(turn) * Math.cos(tilt)), corners = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => new T3.Vector3(mid[0] + x * size[0], mid[1] + y * size[1], mid[2] + z * size[2]))));
  let r = 4;
  for (; r < 120; r *= 1.04) { probe.position.copy(centre).addScaledVector(dir, r); probe.lookAt(centre); probe.updateMatrixWorld(); if (corners.every((c) => { const v = c.clone().project(probe); return Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.93 && v.z < 1; })) break; }
  r = Math.max(r, 7);
  const cam = centre.clone().addScaledVector(dir, r).toArray();
  const s = await scene3d(box, { camera: cam, target: mid, fov, shadows: true, aria });
  const { THREE, scene } = s, still = reducedMotion();
  s.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const sun = scene.children.find((o) => o.isDirectionalLight);
  if (sun) { const q = Math.max(size[0], size[2]) * 0.7 + 2; Object.assign(sun.shadow.camera, { left: -q, right: q, top: q, bottom: -q, far: 60 }); sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0008; sun.position.set(mid[0] - 5, mid[1] + 14, mid[2] + 8); sun.target.position.set(...mid); scene.add(sun.target); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.13 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = mid[1] - size[1] / 2 - 0.03; shadow.receiveShadow = true; scene.add(shadow);

  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mats = new Map();
  const mat = (tone, opacity) => {
    const key = `${tone}|${opacity}`;
    if (!mats.has(key)) { const m = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.04, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); m.color.copy(s.colour(TONES[tone] ?? tone)); mats.set(key, m); }
    return mats.get(key);
  };
  const live = new Map(), marks = new Map(), links = new Map();
  let last = null, first = true;
  s.onTheme(() => { for (const [k, m] of mats) m.color.copy(s.colour(TONES[k.split("|")[0]])); for (const e of [...live.values(), ...marks.values()]) e.stale = true; if (last) show(last); });
  const free = (o) => { scene.remove(o); o.material?.map?.dispose?.(); if (o.isSprite) o.material.dispose(); };
  const setText = (e, text, sz, tone) => {
    const want = text == null ? "" : String(text);
    if (e.text === want && e.sz === sz && e.textTone === tone && !e.stale) return;
    if (e.sprite) free(e.sprite);
    e.sprite = want ? s.label(want, { size: sz, color: TONES[tone] ?? "--text" }) : null;
    if (e.sprite) { e.sprite.material.depthTest = false; e.sprite.renderOrder = 5; scene.add(e.sprite); }
    Object.assign(e, { text: want, sz, textTone: tone, stale: false });
  };
  function show(f) {
    last = f;
    const seen = new Set();
    for (const b of f.items) {
      seen.add(b.k);
      let e = live.get(b.k);
      const to = { x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d };
      if (!e) {
        const mesh = new THREE.Mesh(geo); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
        e = { mesh, at: first || still ? { ...to } : { ...to, y: b.y + (b.tone === "floor" || b.tone === "range" ? 0 : 1.1), h: 0.01 }, from: null, p: 1 };
        live.set(b.k, e);
      }
      e.gone = false;
      const op = b.tone === "ghost" ? 0.4 : b.ghost ?? (b.tone === "range" ? 0.55 : b.tone === "dim" ? 0.55 : 1);
      e.mesh.material = mat(b.tone ?? "base", op); e.mesh.castShadow = op > 0.5;
      setText(e, b.text, b.size ?? 0.5, "text");
      e.from = { ...e.at }; e.to = to; e.p = first || still ? 1 : 0;
      e.arc = Math.abs(to.x - e.at.x) > 0.6 && Math.abs(to.z - e.at.z) < 0.3 ? Math.min(1.6, Math.abs(to.x - e.at.x) * 0.4) * lift * (to.x > e.at.x ? 1 : -0.6) : 0;
    }
    for (const [k, e] of live) if (!seen.has(k)) { if (first || still) drop(k, e); else if (!e.gone) { e.gone = true; e.from = { ...e.at }; e.to = { ...e.at, h: 0.001, w: e.at.w * 0.6, d: e.at.d * 0.6 }; e.p = 0; e.arc = 0; setText(e, "", 1, "text"); } }
    const seenM = new Set();
    for (const m of f.marks) {
      seenM.add(m.k);
      const e = marks.get(m.k) ?? marks.set(m.k, { at: { x: m.x, y: m.y, z: m.z } }).get(m.k);
      setText(e, m.text, m.size ?? 0.45, m.tone ?? "text");
      e.from = { ...e.at }; e.to = { x: m.x, y: m.y, z: m.z }; e.p = first || still ? 1 : 0;
    }
    for (const [k, e] of marks) if (!seenM.has(k)) { if (e.sprite) free(e.sprite); marks.delete(k); }
    for (const [, o] of links) for (const x of o) { scene.remove(x); x.geometry.dispose(); }
    links.clear();
    for (const l of f.links ?? []) {
      const a = new THREE.Vector3(...l.a), b = new THREE.Vector3(...l.b), c = a.clone().lerp(b, 0.5); c.y += l.lift ?? 0;
      const curve = new THREE.QuadraticBezierCurve3(a, c, b), m = mat(l.tone ?? "muted", 1), tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), m), dir = curve.getTangent(1);
      tip.position.copy(b).addScaledVector(dir, -0.12); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.035, 8), m);
      scene.add(tube, tip); links.set(l.k, [tube, tip]);
    }
    if (first || still) step(1);
    first = false;
  }
  const drop = (k, e) => { scene.remove(e.mesh); if (e.sprite) free(e.sprite); live.delete(k); };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  function step(dt) {
    for (const [k, e] of live) {
      if (e.p < 1) e.p = Math.min(1, e.p + dt / 0.5);
      const q = ease(e.p); for (const c of ["x", "y", "z", "w", "h", "d"]) e.at[c] = e.from[c] + (e.to[c] - e.from[c]) * q;
      const z = e.at.z + Math.sin(q * Math.PI) * e.arc;
      e.mesh.position.set(e.at.x, e.at.y, z); e.mesh.scale.set(e.at.w, Math.max(0.001, e.at.h), e.at.d);
      if (e.sprite) e.sprite.position.set(e.at.x, e.at.y + e.at.h + 0.3, z);
      if (e.gone && e.p >= 1) drop(k, e);
    }
    for (const e of marks.values()) { if (e.p < 1) e.p = Math.min(1, e.p + dt / 0.5); const q = ease(e.p); for (const c of ["x", "y", "z"]) e.at[c] = e.from[c] + (e.to[c] - e.from[c]) * q; e.sprite?.position.set(e.at.x, e.at.y + 0.15, e.at.z); }
  }
  s.onFrame((dt) => step(dt));
  // Throttled tabs: land every block where it belongs.
  const land = setInterval(() => { if (document.hidden) step(1); }, 700);
  return { show, reset: () => s.resetView?.(), dispose() { clearInterval(land); geo.dispose(); for (const m of mats.values()) m.dispose(); s.dispose(); } };
}
