// 3D view for disk scheduling: a platter stack with concentric tracks, a
// swinging actuator arm that seeks to each cylinder, requests as glowing
// markers on their tracks, and the seek path rising above the platters as a
// trail (time goes up). Loaded only when the 3D view is chosen.
import { scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const R_IN = 1.05, R_OUT = 3.75, PLATTERS = 3, GAP = 0.62, THICK = 0.08;
const PIVOT = { x: 4.9, z: -3.3 }, ARM = 5.0;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

export async function diskScene(host, { result, requests, cylinders, timed, height }) {
  const max = Math.max(1, cylinders - 1);
  const rad = (c) => R_IN + (Math.min(max, Math.max(0, c)) / max) * (R_OUT - R_IN);
  const pLen = Math.hypot(PIVOT.x, PIVOT.z), base = Math.atan2(-PIVOT.z, -PIVOT.x);
  // The arm's angle (in the x–z plane) that puts the head over radius r.
  const armPhi = (r) => base - Math.acos(Math.min(1, Math.max(-1, (pLen ** 2 + ARM ** 2 - r ** 2) / (2 * pLen * ARM))));
  const headXZ = (c) => { const phi = armPhi(rad(c)); return [PIVOT.x + ARM * Math.cos(phi), PIVOT.z + ARM * Math.sin(phi)]; };

  const fit = (w) => 12 * Math.max(1, 1.6 / (w / height));
  const dist = fit(host.clientWidth || 640);
  const target = [0.8, 1.5, 0];
  const dir = [0.16, 0.72, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov: 42,
    camera: dir.map((v, i) => target[i] + (v / len) * dist),
    aria: "3D hard disk: platters, tracks, the read/write arm and pending requests",
  });
  const { THREE, scene, label, colour } = s;
  const topY = (PLATTERS - 1) * GAP + THICK / 2;
  const n = result.path.length;
  const dy = Math.min(0.4, 3.4 / Math.max(1, n - 1));
  const trailY = (i) => topY + 0.32 + i * dy;

  // Which request id each served move ticks off (ids keep duplicates apart).
  const servedBy = [];
  if (timed) for (const m of result.moves) servedBy.push(m.id ?? null);
  else {
    const taken = new Set();
    for (const m of result.moves) {
      if (m.kind === "serve" || m.served) {
        const id = requests.findIndex((c, k) => c === m.to && !taken.has(k));
        if (id >= 0) taken.add(id);
        servedBy.push(id >= 0 ? id : null);
      } else servedBy.push(null);
    }
  }

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    h("span", { class: "k pending" }, "pending"), h("span", { class: "k served" }, "served"), h("span", { class: "k path" }, "seek path (time ↑)"));
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  let world = null, cur = -1, anim = { k: 1 }, from = result.path[0], to = result.path[0];
  let spin = null, arm = null, headRing = null, markers = [], segs = [], drop = null, headTag = null, mats = null;

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    const C = (name) => colour(name);
    const metal = C("--muted").lerp(C("--surface"), 0.62);
    mats = {
      platter: new THREE.MeshStandardMaterial({ color: metal, metalness: 0.25, roughness: 0.32 }),
      hub: new THREE.MeshStandardMaterial({ color: C("--muted"), metalness: 0.6, roughness: 0.35 }),
      track: new THREE.MeshBasicMaterial({ color: C("--text"), transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
      reqTrack: new THREE.MeshBasicMaterial({ color: C("--series-2"), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      head: new THREE.MeshBasicMaterial({ color: C("--accent"), side: THREE.DoubleSide }),
      arm: new THREE.MeshStandardMaterial({ color: C("--text").lerp(C("--muted"), 0.4), metalness: 0.5, roughness: 0.4 }),
      pending: new THREE.MeshStandardMaterial({ color: C("--series-2"), emissive: C("--series-2"), emissiveIntensity: 0.8 }),
      served: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.15, transparent: true, opacity: 0.55 }),
      fresh: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 1 }),
      later: new THREE.MeshStandardMaterial({ color: C("--muted"), transparent: true, opacity: 0.35 }),
      past: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.25, transparent: true, opacity: 0.6 }),
      now: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.7 }),
      jump: new THREE.MeshBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.5 }),
      drop: new THREE.LineDashedMaterial({ color: C("--accent"), dashSize: 0.08, gapSize: 0.07 }),
    };

    // Enclosure floor, spindle and the platter stack.
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, topY + 0.5, 40), mats.hub);
    hub.position.y = (topY + 0.5) / 2 - 0.3;
    world.add(hub);
    spin = new THREE.Group();
    world.add(spin);
    for (let k = 0; k < PLATTERS; k++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + 0.25, R_OUT + 0.25, THICK, 96), mats.platter);
      p.position.y = k * GAP;
      world.add(p);
    }
    // Tracks on the top surface: faint guides, requested tracks in colour.
    const ring = (r, wdt, mat, y = topY + 0.004) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - wdt / 2, r + wdt / 2, 128), mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y;
      return m;
    };
    for (let k = 0; k <= 10; k++) world.add(ring(rad((max * k) / 10), 0.012, mats.track));
    for (const c of new Set(requests)) world.add(ring(rad(c), 0.03, mats.reqTrack, topY + 0.006));
    headRing = ring(rad(result.path[0]), 0.05, mats.head, topY + 0.009);
    world.add(headRing);

    // Request markers ride on the spinning platter.
    markers = requests.map((c, id) => {
      const a = id * 2.39996 + 0.6, r = rad(c);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), mats.pending);
      m.position.set(r * Math.cos(a), topY + 0.12, r * Math.sin(a));
      const tag = label(c, { size: 0.42 });
      tag.position.y = 0.4;
      m.add(tag);
      spin.add(m);
      return m;
    });

    // Cylinder scale: fixed labels at the front edge.
    const scale = [[0, "cyl 0"], [max, `cyl ${max}`]];
    for (const [c, t] of scale) {
      const tag = label(t, { size: 0.36, color: "--muted", bold: false });
      tag.position.set(-rad(c) * 0.55, topY + 0.14, rad(c) * 0.84);
      world.add(tag);
    }
    const cap = label("seek path ↑ time", { size: 0.36, color: "--muted", bold: false });
    const [cx, cz] = headXZ(max);
    cap.position.set(cx + 0.3, trailY((n - 1) / 2), cz);
    cap.center.set(0, 0.5);
    world.add(cap);

    // The actuator: a pivot post and one arm per platter, all moving together.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, topY + 0.7, 32), mats.hub);
    post.position.set(PIVOT.x, (topY + 0.7) / 2 - 0.3, PIVOT.z);
    world.add(post);
    arm = new THREE.Group();
    arm.position.set(PIVOT.x, 0, PIVOT.z);
    for (let k = 0; k < PLATTERS; k++) {
      const geo = new THREE.BoxGeometry(ARM, 0.05, 0.2);
      geo.translate(ARM / 2, 0, 0);
      const a = new THREE.Mesh(geo, mats.arm);
      a.position.y = k * GAP + THICK / 2 + 0.08;
      const slider = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.26), mats.now);
      slider.position.set(ARM, a.position.y - 0.03, 0);
      arm.add(a, slider);
    }
    world.add(arm);

    // Seek-path trail: one tube per move, grown as the arm travels.
    segs = result.moves.map((m, i) => {
      const a = result.path[i], b = result.path[i + 1], pts = [];
      for (let t = 0; t <= 12; t++) {
        const c = a + ((b - a) * t) / 12, [x, z] = headXZ(c);
        pts.push(new THREE.Vector3(x, trailY(i) + (dy * t) / 12, z));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, m.kind === "jump" ? 0.03 : 0.055, 6), m.kind === "jump" ? mats.jump : mats.past);
      tube.visible = false;
      tube.userData.jump = m.kind === "jump";
      world.add(tube);
      return tube;
    });
    drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mats.drop);
    world.add(drop);
  }

  let ringAt = null;
  function setArm(c) {
    const r = rad(c);
    arm.rotation.y = -armPhi(r);
    if (ringAt === r && headRing.userData.built) return;
    ringAt = r; headRing.userData.built = true;
    headRing.geometry.dispose();
    headRing.geometry = new THREE.RingGeometry(r - 0.025, r + 0.025, 128);
  }

  function show(i, instant = false) {
    i = Math.max(0, Math.min(n - 1, i));
    const step = i === cur + 1 && !instant && !reducedMotion();
    from = step ? result.path[i - 1] : result.path[i];
    to = result.path[i];
    anim = { k: step ? 0 : 1 };
    if (step) s.tween(anim, { k: 1 }, Math.min(800, 280 + (Math.abs(to - from) / max) * 700));
    cur = i;

    // Markers: pending, served, just served, or (F-SCAN) not arrived yet.
    const served = new Set(servedBy.slice(0, i).filter((x) => x != null));
    const fresh = i > 0 ? servedBy[i - 1] : null;
    const q = timed ? (i ? result.moves[i - 1].queues : result.initial.queues) : null;
    const later = new Set(q?.later ?? []);
    markers.forEach((m, id) => {
      m.material = id === fresh ? mats.fresh : served.has(id) ? mats.served : later.has(id) ? mats.later : mats.pending;
      m.scale.setScalar(served.has(id) && id !== fresh ? 0.7 : 1);
    });
    segs.forEach((t, k) => {
      t.visible = k < i;
      if (!t.userData.jump) t.material = k === i - 1 ? mats.now : mats.past;
      t.geometry.setDrawRange(0, Infinity);
    });
    const [hx, hz] = headXZ(to);
    drop.geometry.setFromPoints([new THREE.Vector3(hx, topY + 0.1, hz), new THREE.Vector3(hx, trailY(i), hz)]);
    drop.computeLineDistances();
    if (headTag) disposeTree(headTag);
    headTag = label(to, { size: 0.5, bg: "--accent", color: "--surface" });
    world.add(headTag);
    const total = i ? result.moves[i - 1].total : 0;
    hud.replaceChildren(h("span", null, "Head ", h("b", null, `cylinder ${to}`)), h("span", null, "Total seek ", h("b", null, `${total}`)));
  }

  // Each frame: glide the arm, grow the current trail segment, spin the platters.
  s.onFrame((dt) => {
    const k = Math.min(1, Math.max(0, anim.k)), c = from + (to - from) * k;
    setArm(c);
    const [hx, hz] = headXZ(c);
    headTag?.position.set(hx, topY + 0.6, hz);
    const seg = segs[cur - 1];
    if (seg) {
      const count = seg.geometry.index.count, ringSize = 6 * 6;
      seg.geometry.setDrawRange(0, k >= 1 ? count : Math.max(ringSize, Math.floor(k * 24) * ringSize));
    }
    if (!reducedMotion()) spin.rotation.y += dt * 0.35;
  });

  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  // Keep everything in frame when the stage changes width (rotation, resize).
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); s.dispose(); } };
}
