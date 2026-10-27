// 3D views for MAC protocols. Loaded only when the 3D view is chosen.
// - CSMA/CD: stations tap a shared cable. A transmission is a coloured pulse
//   spreading both ways along it; colliding pulses flash red where they meet and
//   the cable carries a jam signal; backoff is a column of slot blocks above each
//   station that counts down one block per slot.
// - ALOHA: time runs along the channel. Each frame drops from its station's lane
//   onto the shared channel; frames that overlap in time turn red.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const SPEED_MS = 900, BLOCK = 0.3, MAX_BLOCKS = 8;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

// Empty a group of per-step objects: their own geometries, label sprites and
// materials marked as their own go; the shared materials and geometry stay.
function clear(g, keep) {
  g.traverse((x) => {
    if (x.geometry && x.geometry !== keep && !x.isSprite) x.geometry.dispose();
    if (x.isSprite || x.material?.userData?.own) { x.material.map?.dispose?.(); x.material.dispose(); }
  });
  g.removeFromParent();
}

export async function macScene(host, { r, mode, names, height }) {
  return mode === "aloha" ? alohaScene(host, { r, height }) : csmacdScene(host, { r, names, height });
}

const stationColour = (i) => `--series-${1 + (i % 4)}`;
const tan = (fov) => 2 * Math.tan((fov * Math.PI) / 360);

// --- CSMA/CD on a bus ----------------------------------------------------------------
async function csmacdScene(host, { r, names, height }) {
  const n = names.length, steps = r.steps;
  const span = n > 1 ? Math.min(9, 2.3 * (n - 1)) : 0, CL = span / 2 + 0.9;
  const sx = (i) => (n > 1 ? -span / 2 + (i * span) / (n - 1) : 0);
  const fov = 40, target = [0, 1.2, 0];
  const fit = (w) => Math.max((2 * CL + 0.5) / (tan(fov) * (w / height)), 5.6 / tan(fov));
  const dir = [0, 0.45, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov,
    camera: dir.map((v, i) => target[i] + (v / len) * fit(host.clientWidth || 640)),
    aria: "3D CSMA/CD: stations on a shared cable, signals spreading along it, collisions, jam signals and backoff slots",
  });
  const { THREE, scene, label, colour } = s;
  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    h("span", { class: "k toc-push" }, "signal"), h("span", { class: "k toc-bad" }, "collision / jam"), h("span", { class: "k toc-slot" }, "backoff slot"));
  s.el.classList.add("toc3d");
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  let world = null, dyn = null, mats = null, cable = null, stations = [], cur = -1, anim = null;
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
  cyl.rotateZ(Math.PI / 2); // along x, length 1, centred

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    const C = (k) => colour(k);
    mats = {
      cable: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface"), 0.2), metalness: 0.3, roughness: 0.5 }),
      jam: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.6 }),
      box: new THREE.MeshStandardMaterial({ color: C("--surface").lerp(C("--muted"), 0.18), roughness: 0.5 }),
      edge: new THREE.LineBasicMaterial({ color: C("--line") }),
      tap: new THREE.MeshStandardMaterial({ color: C("--muted") }),
      bad: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }),
      slot: new THREE.MeshStandardMaterial({ color: C("--series-4"), emissive: C("--series-4"), emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }),
      sig: names.map((_, i) => new THREE.MeshStandardMaterial({ color: C(stationColour(i)), emissive: C(stationColour(i)), emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })),
      status: { idle: "--muted", waiting: "--series-4", sending: "--good", collide: "--bad", backoff: "--series-4", done: "--good", "gave up": "--bad" },
    };
    cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2 * CL, 20), mats.cable);
    cable.rotation.z = Math.PI / 2;
    world.add(cable);
    for (const x of [-CL, CL]) { // terminators
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 20), mats.tap);
      t.rotation.z = Math.PI / 2; t.position.x = x;
      world.add(t);
    }
    const boxGeo = new THREE.BoxGeometry(0.95, 0.62, 0.6), edgeGeo = new THREE.EdgesGeometry(boxGeo);
    stations = names.map((name, i) => {
      const g = new THREE.Group();
      g.position.x = sx(i);
      const tapM = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), mats.tap);
      tapM.position.y = 0.4;
      const box = new THREE.Mesh(boxGeo, mats.box);
      box.position.y = 1.1;
      const edges = new THREE.LineSegments(edgeGeo, mats.edge);
      edges.position.y = 1.1;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.1, 0.62), mats.sig[i]);
      stripe.position.y = 0.84;
      const tag = label(name, { size: 0.42 });
      tag.position.set(0, 1.12, 0.36);
      g.add(tapM, box, edges, stripe, tag);
      world.add(g);
      return { g, blocks: [], status: null, kTag: null };
    });
    dyn = new THREE.Group();
    world.add(dyn);
    cur = -1; anim = null;
  }

  // Backoff slots still to wait after slot t (the k picked, counting down).
  const waitAfter = (name, t) => { let k = 0; for (let u = t + 1; r.cells[name][u] === "backoff"; u++) k++; return k; };

  function setBlocks(i, name, t, animate) {
    const st = stations[i], want = Math.min(MAX_BLOCKS, waitAfter(name, t));
    while (st.blocks.length > want) {
      const b = st.blocks.pop();
      if (animate && !reducedMotion()) {
        const m = b.material = mats.slot.clone();
        Promise.all([s.tween(b.position, { y: b.position.y + 0.9 }, 520, ease.out), s.tween(m, { opacity: 0 }, 520, ease.linear)]).then(() => { m.dispose(); b.geometry.dispose(); b.removeFromParent(); });
      } else { b.geometry.dispose(); b.removeFromParent(); }
    }
    while (st.blocks.length < want) {
      const k = st.blocks.length, b = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, BLOCK * 0.82, BLOCK), mats.slot);
      const y = 1.62 + k * (BLOCK * 0.82 + 0.05);
      b.position.set(0, animate && !reducedMotion() ? y + 1.2 : y, 0);
      st.g.add(b);
      st.blocks.push(b);
      if (animate) s.tween(b.position, { y }, 380 + k * 70, ease.out);
    }
    if (st.kTag) disposeTree(st.kTag);
    st.kTag = null;
    const total = waitAfter(name, t);
    if (total) {
      st.kTag = label(`wait ${total}`, { size: 0.28, color: "--muted", bold: false });
      st.kTag.center.set(0, 0.5);
      st.kTag.position.set(0.25, 1.62, 0);
      st.g.add(st.kTag);
    }
  }

  const statusText = { "": "idle", tx: "sending", wait: "waiting", collide: "collision!", backoff: "backing off", done: "done ✓", "gave up": "gave up" };
  const statusTone = { "": "--muted", tx: "--good", wait: "--series-4", collide: "--bad", backoff: "--series-4", done: "--good", "gave up": "--bad" };

  function show(i, instant = false) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[i], t = st.t, step = i === cur + 1 && !instant;
    clear(dyn, cyl);
    dyn = new THREE.Group();
    world.add(dyn);
    cable.material = mats.cable;

    // Status under each station and its backoff column above.
    names.forEach((name, k) => {
      const c = r.cells[name][t] ?? "", stn = stations[k];
      if (stn.status) disposeTree(stn.status);
      stn.status = label(statusText[c] ?? c, { size: 0.3, color: statusTone[c] ?? "--muted", bold: c === "tx" || c === "collide" });
      stn.status.position.set(0, -0.42, 0.2);
      stn.g.add(stn.status);
      setBlocks(k, name, t, step);
    });

    // Signals: a new transmission (or a colliding one) spreads both ways from its station.
    const starting = names.map((name, k) => ({ name, k })).filter(({ name }) => {
      const c = r.cells[name][t];
      return c === "collide" || (c === "tx" && r.cells[name][t - 1] !== "tx");
    });
    const steady = names.map((name, k) => ({ name, k })).filter(({ name }) => r.cells[name][t] === "tx" && r.cells[name][t - 1] === "tx");
    const segs = [];
    for (const { k } of starting) for (const d of [-1, 1]) {
      const m = new THREE.Mesh(cyl, mats.sig[k]);
      m.scale.set(0.001, 0.13, 0.13);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mats.sig[k]);
      dyn.add(m, tip);
      segs.push({ m, tip, x0: sx(k), d, reach: d < 0 ? sx(k) + CL : CL - sx(k), k });
    }
    // Where colliding pulses meet: halfway between neighbouring colliders.
    const coll = st.colliding.map((nm) => sx(names.indexOf(nm))).sort((a, b) => a - b);
    const meets = coll.slice(1).map((x, j) => ({ x: (x + coll[j]) / 2, at: ((x - coll[j]) / 2) / (2 * CL) }));
    const bursts = meets.map((mt) => {
      const m = mats.bad.clone();
      m.userData.own = true;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), m);
      b.position.x = mt.x; b.visible = false;
      dyn.add(b);
      const tag = label("✗ collision", { size: 0.34, color: "--bad" });
      tag.position.set(mt.x, 0.55, 0.3); tag.visible = false;
      dyn.add(tag);
      return { b, tag, ...mt };
    });
    let jamTag = null;
    if (coll.length > 1) {
      jamTag = label("JAM", { size: 0.36, bg: "--bad", color: "--surface" });
      jamTag.position.set((coll[0] + coll.at(-1)) / 2, -0.95, 0.3); jamTag.visible = false;
      dyn.add(jamTag);
    }
    // A frame already on the bus: the whole cable carries it, bits flowing outward.
    const flow = [];
    for (const { k } of steady) {
      const sleeve = new THREE.Mesh(cyl, mats.sig[k]);
      sleeve.scale.set(2 * CL, 0.11, 0.11);
      dyn.add(sleeve);
      for (let j = 0; j < 8; j++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mats.sig[k]);
        dyn.add(dot);
        flow.push({ dot, x0: sx(k), d: j % 2 ? 1 : -1, ph: Math.floor(j / 2) / 4 });
      }
    }
    anim = { start: performance.now(), segs, bursts, jamTag, flow, collided: coll.length > 1, instant: !step || reducedMotion() };
    cur = i;
    const bus = st.vars.bus;
    hud.replaceChildren(h("span", null, "Slot ", h("b", null, t)), h("span", null, "Bus ", h("b", null, bus)), h("span", null, "Collisions ", h("b", null, steps.slice(0, i + 1).filter((x) => x.colliding.length > 1).length)));
    s.render();
  }

  s.onFrame(() => {
    if (!anim) return;
    const el = anim.instant ? 10 : (performance.now() - anim.start) / SPEED_MS; // in "whole cable" units
    for (const g of anim.segs) {
      const dist = Math.min(g.reach, el * 2 * CL);
      g.m.scale.x = Math.max(0.001, dist);
      g.m.position.x = g.x0 + (g.d * dist) / 2;
      g.tip.position.x = g.x0 + g.d * dist;
      g.tip.visible = dist < g.reach - 1e-3;
    }
    let met = false;
    for (const b of anim.bursts) {
      const since = el - b.at;
      b.b.visible = since >= 0 && since < 0.9;
      b.tag.visible = since >= 0;
      if (since >= 0) { met = true; b.b.scale.setScalar(1 + since * 2.4); b.b.material.opacity = Math.max(0, 0.9 - since); }
    }
    if (anim.collided && met) {
      for (const g of anim.segs) g.m.material = g.tip.material = mats.bad;
      if (el > 0.75 || anim.instant) { cable.material = mats.jam; if (anim.jamTag) anim.jamTag.visible = true; }
    }
    if (anim.flow.length && !reducedMotion()) {
      for (const f of anim.flow) {
        const reach = f.d < 0 ? f.x0 + CL : CL - f.x0, ph = (el * 0.6 + f.ph) % 1;
        f.dot.position.x = f.x0 + f.d * reach * ph;
        f.dot.visible = reach > 0.05;
      }
    } else for (const f of anim.flow) f.dot.visible = false;
  });

  s.onTheme(() => { const at = cur; build(); show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); cyl.dispose(); s.dispose(); } };
}

// --- ALOHA: frames on a time axis ---------------------------------------------------
async function alohaScene(host, { r, height }) {
  const names = r.names, n = names.length, steps = r.steps;
  const span = Math.max(steps.length, 8), TS = Math.min(0.9, 11 / span), W = span * TS;
  const x = (t) => -W / 2 + t * TS;
  const LANE = 0.62, laneZ = (i) => -0.9 - (n - 1 - i) * LANE, CH = 0.75;
  const depth = CH + 1.1 - laneZ(0) + 0.4, fov = 30, target = [0, 0, (CH + 1.1 + laneZ(0) - 0.4) / 2];
  // Narrow stages show a window of about ten frame times that follows "now".
  const fit = (w) => Math.max(Math.min(W + 2, 10) / (tan(fov) * (w / height)), (depth * 0.85 + 0.8) / tan(fov)) * 1.06;
  const halfView = () => { const w = s.el.clientWidth || 640; return (fit(w) * tan(fov) * (w / height)) / 2 / 1.06; };
  const panTo = (t) => { const lim = W / 2 + 1 - halfView(); return lim <= 0 ? 0 : Math.max(-lim, Math.min(lim, x(t))); };
  const dir = [0, 1.5, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov,
    camera: dir.map((v, i) => target[i] + (v / len) * fit(host.clientWidth || 640)),
    aria: "3D ALOHA: each station's frames on a time axis, dropping onto the shared channel, overlapping frames colliding",
  });
  const { THREE, scene, label, colour } = s;
  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    h("span", { class: "k toc-good" }, "got through"), h("span", { class: "k toc-bad" }, "collided"), h("span", { class: "k toc-slot" }, "now"));
  s.el.classList.add("toc3d");
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  let world = null, mats = null, dyn = null, band = null, cur = -1, drops = [], pan = { x: 0 }, panned = 0;
  s.onFrame(() => { if (Math.abs(pan.x - panned) > 1e-4) { panned = target[0] = pan.x; s.lookAt(...target); } });
  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    const C = (k) => colour(k);
    mats = {
      lane: new THREE.MeshStandardMaterial({ color: C("--surface"), roughness: 0.7 }),
      chan: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface"), 0.55), roughness: 0.6 }),
      line: new THREE.LineBasicMaterial({ color: C("--line") }),
      ok: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.35 }),
      bad: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.45 }),
      okCh: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }),
      badCh: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.6, transparent: true, opacity: 0.7 }),
      band: new THREE.MeshBasicMaterial({ color: C("--series-4"), transparent: true, opacity: 0.16, depthWrite: false }),
      pulse: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 1 }),
    };
    names.forEach((nm, i) => {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, LANE * 0.8), mats.lane);
      lane.position.set(0, -0.02, laneZ(i));
      const tag = label(nm, { size: 0.36, color: "--muted" });
      tag.position.set(x(0) - 0.4, 0.05, laneZ(i));
      world.add(lane, tag);
    });
    const ch = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 0.9), mats.chan);
    ch.position.set(0, -0.04, CH);
    const chTag = label("ch", { size: 0.36, color: "--muted" });
    chTag.position.set(x(0) - 0.4, 0.05, CH);
    world.add(ch, chTag);
    // Time ticks; slotted ALOHA also gets slot walls.
    const pts = [];
    for (let t = 0; t <= span; t++) {
      pts.push(new THREE.Vector3(x(t), 0.01, laneZ(0) - LANE / 2), new THREE.Vector3(x(t), 0.01, CH + 0.45));
      if (t % (span > 20 ? 5 : span > 10 ? 2 : 1) === 0) { const tk = label(t, { size: 0.24, color: "--muted", bold: false }); tk.position.set(x(t), 0.02, CH + 0.75); world.add(tk); }
    }
    if (r.mode === "slotted") world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mats.line));
    const tl = label("time →", { size: 0.28, color: "--muted", bold: false });
    tl.position.set(x(span) - 0.3, 0.02, CH + 1.05);
    world.add(tl);
    band = new THREE.Mesh(new THREE.BoxGeometry(TS, 0.5, CH - laneZ(0) + 1.1), mats.band);
    band.position.set(0, 0.2, (CH + laneZ(0)) / 2);
    world.add(band);
    dyn = new THREE.Group();
    world.add(dyn);
    cur = -1;
  }

  function show(i, instant = false) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[i], upto = st.upto, step = i === cur + 1 && !instant && !reducedMotion();
    clear(dyn);
    dyn = new THREE.Group();
    world.add(dyn);
    drops = [];
    const bar = (f, z, m, hgt) => {
      const len = Math.max(0.05, (f.end - f.start) * TS - 0.04);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, 0.42), m);
      b.position.set(x(f.start) + len / 2 + 0.02, hgt / 2, z);
      dyn.add(b);
      return b;
    };
    for (const f of r.frames.filter((f) => f.start < upto)) {
      const lane = names.indexOf(f.station), fresh = f.start >= upto - 1;
      bar(f, laneZ(lane), f.ok ? mats.ok : mats.bad, 0.22);
      const onCh = bar(f, CH, f.ok ? mats.okCh : mats.badCh, 0.14 + (f.ok ? 0 : 0.04 * (f.hits.length)));
      if (fresh && step) {
        onCh.visible = false;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mats.pulse);
        const from = new THREE.Vector3(x(f.start) + 0.1, 0.35, laneZ(lane)), to = new THREE.Vector3(x(f.start) + 0.1, 0.25, CH);
        p.position.copy(from);
        dyn.add(p);
        drops.push(s.travel(p, [from, new THREE.Vector3((from.x + to.x) / 2, 0.9, (from.z + to.z) / 2), to], 600, ease.inOut).then(() => { p.visible = false; onCh.visible = true; }));
      }
      if (fresh && !f.ok) {
        const tag = label("✗", { size: 0.36, color: "--bad" });
        tag.position.set(x(f.start + 0.5), 0.55, CH);
        dyn.add(tag);
      }
    }
    if (step) s.tween(band.position, { x: x(upto - 0.5) }, 380, ease.out); else band.position.x = x(upto - 0.5);
    const px = panTo(upto - 0.5);
    if (step) s.tween(pan, { x: px }, 420, ease.out); else pan.x = px;
    cur = i;
    const v = st.vars;
    hud.replaceChildren(h("span", null, `${r.mode === "slotted" ? "Slot" : "Time"} `, h("b", null, st.t)), h("span", null, "Got through ", h("b", null, v.successes)), h("span", null, "Lost ", h("b", null, v["lost frames"])));
    s.render();
  }

  s.onTheme(() => { const at = cur; build(); show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); if (cur >= 0) pan.x = panTo(steps[cur].upto - 0.5); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); s.dispose(); } };
}
