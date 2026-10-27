// 3D view for CPU scheduling: each process is a coloured block whose height is
// its remaining burst. Blocks wait in the arrivals lane, ride a ready-queue
// conveyor (one stacked conveyor per level for MLQ/MLFQ, so a demotion drops a
// level), sit on the glowing CPU chip while they run, and rest flat in the
// finished tray. Behind it all, the Gantt chart grows as a skyline along a time
// axis. Loaded only when the 3D view is chosen; show(i) runs on every step.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const series = (i) => `--series-${(i % 8) + 1}`;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

export async function cpuScene(host, { result, processes, height }) {
  const N = processes.length, frames = result.frames, T = Math.max(1, result.makespan);
  const L = result.levels.length;
  const ends = frames.map((f, i) => (i < frames.length - 1 ? frames[i + 1].t : T));
  const maxBurst = Math.max(...processes.map((p) => p.burst));

  // Layout (x: left → right, z: back → front).
  const QZ = 1.5, CPU = { x: 2.3, z: QZ }, QFRONT = 0.35, QX0 = -4.6;
  const sp = Math.min(1.0, (QFRONT - QX0) / Math.max(1, N - 1));
  const bw = Math.min(0.78, sp * 0.82);
  const lg = L > 1 ? Math.min(1.5, 3.4 / (L - 1)) : 0;
  const levelY = (k) => (L - 1 - k) * lg;
  const hs = Math.min(0.3, (L > 1 ? lg * 0.75 : 2.4) / maxBurst);
  const blockH = (rem) => (rem > 0 ? Math.max(0.12, rem * hs) : 0.1);
  const SKY = { x0: -6.4, x1: 6.6, z: -3.1 }, sx = (SKY.x1 - SKY.x0) / T;
  const tx = (t) => SKY.x0 + t * sx;
  const skyH = Math.min(0.3, 2.2 / maxBurst);
  const ARR_X = -6.2;
  const arrSp = Math.min(0.95, 3.6 / Math.max(1, N - 1));

  const fit = (w) => 14 * Math.max(1, 1.5 / (w / height));
  const target = [0, 0.6, -0.2];
  const dir = [0, 1.15, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov: 42,
    camera: dir.map((v, i) => target[i] + (v / len) * fit(host.clientWidth || 640)),
    aria: "3D CPU scheduler: processes as blocks moving from arrivals to the ready queue, the CPU and the finished tray, with the Gantt chart as a skyline over time",
  });
  const { THREE, label, colour: C } = s;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const order = new Map(processes.map((p, i) => [p.id, i]));

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    processes.map((p, i) => h("span", { class: "k", style: `--c:var(${series(i)})` }, p.id)),
    h("span", { class: "k height" }, "height = time left"));
  host.append(legend);
  s.el.append(hud, h("div", { class: "three-hint" }, "Drag to orbit"));

  let world = null, blocks = [], columns = [], ticks = [], chip = null, glow = null, belts = [], now = null, cur = -1;

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    s.scene.add(world);
    const surf = C("--surface-2").lerp(C("--muted"), 0.18);
    const deck = new THREE.MeshStandardMaterial({ color: surf, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: C("--text").lerp(C("--surface"), 0.15), roughness: 0.5, metalness: 0.3 });
    const lane = new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface"), 0.45), roughness: 0.6 });
    const muted = { size: 0.48, color: "--muted", bold: false };
    const caption = (text, x, y, z, opts = muted) => { const t = label(text, opts); t.position.set(x, y, z); world.add(t); return t; };

    // Arrivals lane.
    const arr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 4.0), deck);
    arr.position.set(ARR_X, -0.05, 1.1);
    world.add(arr);
    caption("Arrivals", ARR_X, -0.05, 3.55);

    // Ready queue conveyors, one per level, front of the queue by the CPU.
    belts = result.levels.map((name, k) => {
      const y = levelY(k), w = QFRONT - QX0 + 1.1;
      const belt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 1.15), lane);
      belt.position.set((QFRONT + QX0) / 2, y - 0.06, QZ);
      world.add(belt);
      const slats = [];
      for (let j = 0; j < 9; j++) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 1.1), dark);
        sl.position.set(QX0 - 0.5 + (j * w) / 9, y, QZ);
        world.add(sl);
        slats.push(sl);
      }
      if (L > 1) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, Math.max(0.01, y), 0.12), deck);
        leg.position.set(QX0 - 0.4, y / 2 - 0.06, QZ - 0.5);
        world.add(leg);
      }
      const t = caption(L > 1 ? name : "Ready queue  (front →)", QX0 - 0.55, y + 0.06, QZ + 0.85, { size: 0.4, color: "--muted", bold: false });
      t.center.set(0, 0.5);
      return { slats, w, x0: QX0 - 0.5, y };
    });

    // The CPU chip: a package with pins and a glow while busy.
    chip = new THREE.Group();
    chip.position.set(CPU.x, 0, CPU.z);
    const pkg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.5), dark);
    pkg.position.y = 0.0;
    const die = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 1.0), new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.1, metalness: 0.4, roughness: 0.3 }));
    die.position.y = 0.13;
    chip.add(pkg, die);
    const pinM = new THREE.MeshStandardMaterial({ color: C("--series-4"), metalness: 0.8, roughness: 0.3 });
    for (let j = 0; j < 6; j++) for (const [dx, dz, rx] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(rx ? 0.08 : 0.24, 0.04, rx ? 0.24 : 0.08), pinM);
      const o = -0.55 + j * 0.22;
      pin.position.set(dx ? dx * 0.85 : o, -0.06, dz ? dz * 0.85 : o);
      chip.add(pin);
    }
    glow = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.02, 48), new THREE.MeshBasicMaterial({ color: C("--accent"), transparent: true, opacity: 0, depthWrite: false }));
    glow.position.y = -0.1;
    chip.add(glow);
    chip.userData.die = die;
    world.add(chip);
    caption("CPU", CPU.x, -0.05, CPU.z + 1.25, { size: 0.55, color: "--text" });

    // Finished tray.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 2.9), deck);
    tray.position.set(5.15, -0.05, 1.55);
    world.add(tray);
    caption("Finished", 5.15, -0.05, 3.3);

    // Gantt skyline: a time axis behind everything, one column per time step.
    const base = new THREE.Mesh(new THREE.BoxGeometry(SKY.x1 - SKY.x0 + 0.3, 0.06, 0.9), deck);
    base.position.set((SKY.x0 + SKY.x1) / 2, -0.04, SKY.z);
    world.add(base);
    const idleM = new THREE.MeshStandardMaterial({ color: C("--muted"), transparent: true, opacity: 0.35 });
    const mats = processes.map((_, i) => new THREE.MeshStandardMaterial({ color: C(series(i)), roughness: 0.5 }));
    columns = frames.map((f, i) => {
      const w = (ends[i] - f.t) * sx;
      if (w <= 0) return null;
      const hgt = f.running ? Math.max(0.08, f.remaining[f.running] * skyH) : 0.05;
      const geo = new THREE.BoxGeometry(Math.max(0.02, w - 0.04), 1, 0.7);
      geo.translate(0, 0.5, 0);
      const m = new THREE.Mesh(geo, f.running ? mats[order.get(f.running)] : idleM);
      m.position.set(tx(f.t) + w / 2, 0, SKY.z);
      m.userData.h = hgt;
      m.scale.y = hgt;
      m.visible = false;
      world.add(m);
      return m;
    });
    // Time ticks at every segment boundary, thinned so they don't collide.
    const marks = [...new Set(result.timeline.flatMap((x) => [x.start, x.end]))].sort((a, b) => a - b)
      .reduceRight((kept, t) => (kept.length && (kept[0] - t) * sx < 0.5 ? kept : [t, ...kept]), []);
    ticks = marks.map((t) => { const l = caption(String(t), tx(t), -0.1, SKY.z + 0.75, { size: 0.4, color: "--muted", bold: false }); l.userData.t = t; return l; });
    caption("Gantt skyline · time →", (SKY.x0 + SKY.x1) / 2, 2.75, SKY.z, muted);
    now = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.4, 0.035), new THREE.MeshBasicMaterial({ color: C("--accent") }));
    now.position.set(tx(0), 1.2, SKY.z + 0.38);
    world.add(now);

    // Process blocks.
    blocks = processes.map((p, i) => {
      const g = new THREE.Group();
      const geo = new THREE.BoxGeometry(bw, 1, bw);
      geo.translate(0, 0.5, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: C(series(i)), roughness: 0.45, emissive: C(series(i)), emissiveIntensity: 0 }));
      mesh.scale.y = blockH(p.burst);
      g.add(mesh);
      world.add(g);
      return { g, mesh, tag: null, text: "", place: null };
    });
  }

  function placeOf(f, id) {
    if (f.running === id) return { kind: "cpu", pos: V(CPU.x, 0.15, CPU.z) };
    for (let k = 0; k < f.queues.length; k++) {
      const j = f.queues[k].indexOf(id);
      if (j >= 0) return { kind: `q${k}`, pos: V(QFRONT - j * sp, levelY(k), QZ) };
    }
    const d = f.done.indexOf(id);
    if (d >= 0) return { kind: "done", pos: V(4.15 + (d % 3) * 1.0, 0, 0.55 + Math.floor(d / 3) * 0.8) };
    const waiting = processes.filter((p) => f.running !== p.id && !f.done.includes(p.id) && !f.queues.some((q) => q.includes(p.id)));
    const j = waiting.findIndex((p) => p.id === id);
    return { kind: "arr", pos: V(ARR_X, 0, 2.7 - j * arrSp) };
  }

  function show(i, instant = false) {
    i = Math.max(0, Math.min(frames.length - 1, i));
    const f = frames[i];
    const animate = !instant && !reducedMotion() && i === cur + 1;
    cur = i;
    processes.forEach((p, k) => {
      const b = blocks[k], pl = placeOf(f, p.id), rem = f.remaining[p.id];
      const hgt = blockH(rem);
      if (b.place?.kind !== pl.kind || !b.place.pos.equals(pl.pos)) {
        const from = b.g.position.clone();
        if (animate && b.place) {
          const lift = pl.kind !== b.place.kind ? 0.9 + Math.abs(from.y - pl.pos.y) * 0.2 : 0.25;
          const mid = from.clone().lerp(pl.pos, 0.5); mid.y = Math.max(from.y, pl.pos.y) + lift;
          s.travel(b.g, [from, mid, pl.pos], pl.kind === b.place.kind ? 380 : 650, ease.inOut);
        } else b.g.position.copy(pl.pos);
        b.place = pl;
      }
      if (animate) s.tween(b.mesh.scale, { y: hgt }, 450); else b.mesh.scale.y = hgt;
      b.mesh.material.emissiveIntensity = pl.kind === "cpu" ? 0.3 : 0;
      const text = pl.kind === "arr" ? `${p.id} @${p.arrival}` : pl.kind === "done" ? `${p.id} ✓` : `${p.id} · ${rem}`;
      if (text !== b.text) {
        if (b.tag) disposeTree(b.tag);
        b.tag = label(text, { size: 0.4, bg: "--surface", color: "--text" });
        b.tag.material.depthTest = false; // stay readable behind an upper conveyor
        b.tag.renderOrder = 2;
        b.g.add(b.tag);
        b.text = text;
      }
      b.tag.position.y = hgt + 0.32;
      b.tag.userData.target = hgt;
    });
    columns.forEach((c, k) => {
      if (!c) return;
      const vis = k <= i;
      if (vis && !c.visible && animate && k === i) { c.scale.y = 0.001; s.tween(c.scale, { y: c.userData.h }, 450, ease.out); }
      else if (vis) c.scale.y = c.userData.h;
      c.visible = vis;
    });
    for (const t of ticks) t.visible = t.userData.t <= ends[i];
    const x = tx(ends[i]);
    if (animate) s.tween(now.position, { x }, 450); else now.position.x = x;
    chip.userData.busy = !!f.running;
    const qn = f.queues.reduce((a, q) => a + q.length, 0);
    for (const b of belts) b.moving = qn > 0;
    hud.replaceChildren(
      h("span", null, "t = ", h("b", null, `${f.t}`)),
      h("span", null, "CPU ", h("b", null, f.running ? `${f.running} (${f.remaining[f.running]} left)` : "idle")),
      h("span", null, "Ready ", h("b", null, `${qn}`)));
  }

  s.onFrame((dt, t) => {
    const busy = chip?.userData.busy, pulse = reducedMotion() ? 0.5 : 0.5 + 0.5 * Math.sin(t / 240);
    if (glow) {
      glow.material.opacity = busy ? 0.18 + 0.2 * pulse : 0;
      chip.userData.die.material.emissiveIntensity = busy ? 0.5 + 0.5 * pulse : 0.05;
    }
    // Keep each name tag riding just above its block while the height tweens.
    for (const b of blocks) if (b.tag) b.tag.position.y = b.mesh.scale.y + 0.32;
    if (!reducedMotion()) for (const b of belts) if (b.moving) for (const sl of b.slats) {
      sl.position.x += dt * 0.6;
      if (sl.position.x > b.x0 + b.w) sl.position.x -= b.w;
    }
  });

  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); s.dispose(); } };
}
