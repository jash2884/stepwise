// 3D view for the semaphore simulator. Dining philosophers get a round table
// where forks lift into hands and the circular wait lights up red; the other
// presets get a simpler stage (a bounded buffer of slots, a database room, or
// a shared counter) with the processes walking in and out. Loaded only when
// the 3D view is chosen; show(state) runs after every action in the 2D view.
import { diningState } from "../engines/sync.js";
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const series = (i) => `--series-${(i % 8) + 1}`;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

export async function syncScene(host, { presetId, height, onPick }) {
  const dining = presetId === "philosophers";
  const fit = (w) => (dining ? 12 : 12.5) * Math.max(1, 1.3 / (w / height));
  const target = dining ? [0, 0.4, 0.5] : [0, 0.6, 0.6];
  const dir = dining ? [0, 1.25, 1] : [0, 1.0, 1], len = Math.hypot(...dir);
  const dist = fit(host.clientWidth || 640);
  const s = await scene3d(host, {
    height, target, fov: 42,
    camera: dir.map((v, i) => target[i] + (v / len) * dist),
    aria: dining ? "3D dining table: philosophers, forks and who is waiting for whom" : "3D view of the processes and the shared resource they synchronise on",
  });
  const { THREE, label, colour: C } = s;
  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend sync3d-legend", "aria-hidden": "true" },
    dining
      ? [h("span", { class: "k think" }, "thinking"), h("span", { class: "k hungry" }, "hungry / waiting"), h("span", { class: "k eat" }, "eating"), h("span", { class: "k fork" }, "fork in hand"), h("span", { class: "k cycle" }, "circular wait")]
      : [h("span", { class: "k hungry" }, "blocked"), h("span", { class: "k item" }, presetId === "producer-consumer" ? "item" : "inside"), h("span", { class: "k cycle" }, "violation")]);
  host.append(legend);
  s.el.append(hud, h("div", { class: "three-hint" }, onPick ? "Click a figure to run it · drag to orbit" : "Drag to orbit"));

  let world = null, last = null, built = false;
  let figs = [], tags = new Map(), mats = null, pulses = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // A label that is rebuilt only when its text changes.
  function tag(key, parent, text, opts, pos) {
    const old = tags.get(key);
    if (old && old.text === text && old.parent === parent) return old.sprite;
    if (old) disposeTree(old.sprite);
    const sp = label(text, opts);
    sp.position.copy(pos);
    parent.add(sp);
    tags.set(key, { text, sprite: sp, parent });
    return sp;
  }

  // A process figure: body, head, a pulsing ring at its feet, a name tag.
  function figure(i, id) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: C(series(i)), roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 1.1, 24), m);
    body.position.y = 0.25;
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), m);
    headM.position.y = 1.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 8, 48), mats.ring.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.28;
    ring.visible = false;
    for (const x of [body, headM]) x.userData.pick = i;
    g.add(body, headM, ring);
    const name = label(id, { size: 0.5 });
    name.position.y = 1.72;
    g.add(name);
    g.userData = { ring, at: null };
    world.add(g);
    return g;
  }

  // Glide a figure (or anything) to a new spot with a little hop.
  function moveTo(obj, p, animate, hop = 0.6) {
    const from = obj.position.clone();
    if (!animate || from.distanceTo(p) < 1e-3) { obj.position.copy(p); s.render(); return; }
    const mid = from.clone().lerp(p, 0.5); mid.y = Math.max(from.y, p.y) + hop;
    s.travel(obj, [from, mid, p], 520, ease.inOut);
  }

  // ---- Dining philosophers -------------------------------------------------
  const RT = 2.55, RP = 3.75;
  let forks = [], bowls = [], waits = [], rim = null, alarm = null, n = 0;
  const theta = (i) => Math.PI / 2 + (i * 2 * Math.PI) / n;
  const polar = (r, a, y = 0) => V(r * Math.cos(a), y, r * Math.sin(a));
  const forkAngle = (k) => theta(k) - Math.PI / n;
  const restPos = (k) => polar(1.95, forkAngle(k), 0.05);
  // Fork c_i is a philosopher's left (it sits at angle θ_i − π/n), c_(i+1) the right.
  const handPos = (i, k) => polar(RP - 0.85, theta(i) + (k === i ? -0.2 : 0.2), 0.75);

  function buildDining(state) {
    n = state.procs.length;
    const top = new THREE.MeshStandardMaterial({ color: C("--surface").lerp(C("--series-4"), 0.18), roughness: 0.7 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(RT, RT, 0.18, 72), top);
    table.position.y = -0.09;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.6, 1.3, 24), mats.metal);
    leg.position.y = -0.82;
    rim = new THREE.Mesh(new THREE.TorusGeometry(RT, 0.05, 8, 96), mats.rim);
    rim.rotation.x = Math.PI / 2;
    world.add(table, leg, rim);
    alarm = null;

    bowls = state.procs.map((_, i) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.04, 32), mats.plate);
      plate.position.copy(polar(1.72, theta(i), 0.02));
      const bowlMat = new THREE.MeshStandardMaterial({ color: C("--surface").lerp(C("--muted"), 0.15), emissive: C("--series-4"), emissiveIntensity: 0, roughness: 0.4 });
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowlMat);
      bowl.position.copy(polar(1.72, theta(i), 0.33));
      const food = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 24), new THREE.MeshStandardMaterial({ color: C("--series-4"), emissive: C("--series-4"), emissiveIntensity: 0.2 }));
      food.position.copy(polar(1.72, theta(i), 0.3));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: C("--series-4"), transparent: true, opacity: 0, depthWrite: false }));
      glow.position.copy(polar(1.72, theta(i), 0.3));
      world.add(plate, bowl, food, glow);
      return { bowl, glow };
    });

    figs = state.procs.map((p, i) => {
      const g = figure(i, p.id);
      g.position.copy(polar(RP, theta(i)));
      g.lookAt(0, 0, 0);
      return g;
    });

    forks = state.procs.map((_, k) => {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.62), mats.fork);
      handle.position.z = 0.12;
      g.add(handle);
      for (const x of [-0.07, 0, 0.07]) {
        const tine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.3), mats.fork);
        tine.position.set(x, 0, -0.32);
        g.add(tine);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.05), mats.fork);
      bridge.position.z = -0.18;
      g.add(bridge);
      g.position.copy(restPos(k));
      g.rotation.order = "YXZ";
      g.scale.setScalar(1.45);
      g.rotation.y = Math.PI / 2 - forkAngle(k); // tines point at the centre
      g.userData = { holder: null, k };
      const t = label(`c${k}`, { size: 0.36, color: "--muted", bold: false });
      t.position.copy(polar(1.25, forkAngle(k), 0.12));
      world.add(g, t);
      return g;
    });
    // One arrow per philosopher: "I am waiting for that fork".
    waits = state.procs.map(() => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), mats.waitAmber);
      const headCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 14), mats.waitAmber);
      const g = new THREE.Group();
      g.add(shaft, headCone);
      g.visible = false;
      world.add(g);
      return { g, shaft, headCone, want: null };
    });
  }

  function showDining(state, animate) {
    const d = diningState(state);
    d.phils.forEach((p, i) => {
      const g = figs[i];
      g.userData.ring.visible = p.phase === "hungry";
      g.userData.ring.material.color.copy(C(p.blocked ? "--bad" : "--series-4"));
      g.userData.ring.userData.fast = p.blocked;
      const text = p.blocked ? `waiting for c${p.wants}` : p.phase === "done" ? "putting forks down" : p.phase;
      const col = p.phase === "eating" ? "--good" : p.blocked ? "--bad" : p.phase === "thinking" ? "--muted" : "--text";
      tag(`st${i}`, g, text, { size: 0.4, color: col, bg: "--surface" }, V(0, 2.46, 0));
      bowls[i].eating = p.phase === "eating";
    });
    // Forks: lift into the holder's hand, or settle back on the table.
    forks.forEach((f, k) => {
      const holder = d.forks[k].holder;
      if (f.userData.holder === holder && f.userData.placed) return;
      f.userData.holder = holder; f.userData.placed = true;
      const to = holder == null ? restPos(k) : handPos(holder, k);
      const yaw = Math.PI / 2 - (holder == null ? forkAngle(k) : theta(holder));
      for (const m of f.children) m.material = holder == null ? mats.fork : mats.held;
      moveTo(f, to, animate, 0.9);
      if (animate) s.tween(f.rotation, { x: holder == null ? 0 : 1.15, y: yaw }, 520);
      else { f.rotation.x = holder == null ? 0 : 1.15; f.rotation.y = yaw; }
    });
    const red = d.circular || d.deadlock;
    d.phils.forEach((p, i) => {
      const w = waits[i];
      w.want = p.wants != null && (p.blocked || (red && p.holds.length === 1)) ? p.wants : null;
      w.g.visible = w.want != null;
      w.shaft.material = w.headCone.material = red ? mats.waitRed : mats.waitAmber;
      w.thick = red ? 0.05 : 0.025;
    });
    rim.material = red ? mats.rimRed : mats.rim;
    if (alarm) { disposeTree(alarm); alarm = null; }
    if (red) {
      alarm = label(d.deadlock ? "DEADLOCK: circular wait" : "circular wait: nobody can eat", { size: 0.42, bg: "--bad", color: "--surface" });
      alarm.position.set(0, 0.75, 0);
      world.add(alarm);
    }
    const names = (ph) => d.phils.filter((p) => p.phase === ph).map((p) => p.id).join(", ") || "nobody";
    hud.replaceChildren(h("span", null, "Eating ", h("b", null, names("eating"))), h("span", null, "Hungry ", h("b", null, names("hungry"))));
  }

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function frameDining(now) {
    const pulse = reducedMotion() ? 0.5 : 0.5 + 0.5 * Math.sin(now / 260);
    bowls.forEach((b) => {
      b.bowl.material.emissiveIntensity = b.eating ? 0.35 + 0.35 * pulse : 0;
      b.glow.material.opacity = b.eating ? 0.12 + 0.12 * pulse : 0;
    });
    // Wait arrows follow the forks as they move.
    waits.forEach((w, i) => {
      if (w.want == null) return;
      tmpA.copy(figs[i].position).setY(1.05).lerp(V(0, 1.05, 0), 0.12);
      forks[w.want].getWorldPosition(tmpB); tmpB.y += 0.12;
      const dirv = tmpB.clone().sub(tmpA), L = dirv.length();
      if (L < 0.3) { w.g.visible = false; return; }
      w.g.visible = true;
      dirv.normalize();
      const shaftLen = L - 0.34;
      w.shaft.position.copy(tmpA).addScaledVector(dirv, shaftLen / 2);
      w.shaft.quaternion.setFromUnitVectors(up, dirv);
      w.shaft.scale.set(w.thick, shaftLen, w.thick);
      w.headCone.position.copy(tmpA).addScaledVector(dirv, shaftLen + 0.13);
      w.headCone.quaternion.setFromUnitVectors(up, dirv);
    });
  }

  // ---- Other presets: a shared resource in the middle ---------------------
  let items = new Map(), slots = [], centre = null, centreMat = null, cap = null;
  const B = () => last?.bufferSize ?? 3;
  const slotPos = (k) => V((k - (B() - 1) / 2) * 1.25, 0.45, 0);

  function homePos(state, i) {
    const procs = state.procs;
    if (presetId === "producer-consumer") {
      const left = procs.filter((p) => p.id.startsWith("P")), right = procs.filter((p) => !p.id.startsWith("P"));
      const side = procs[i].id.startsWith("P") ? left : right, j = side.indexOf(procs[i]);
      const x = (B() * 1.25) / 2 + 1.7 + j * 1.5;
      return V(procs[i].id.startsWith("P") ? -x : x, 0, 0.9 - j * 0.5);
    }
    const spread = presetId === "race" ? 5.4 : 2.3;
    return V((i - (procs.length - 1) / 2) * spread, 0, 3.1);
  }
  function insidePos(state, i, k, count) {
    if (presetId === "producer-consumer") return V((state.procs[i].id.startsWith("P") ? -0.8 : 0.8) + (k - (count - 1) / 2) * 0.5, 0, 2.0);
    return V((k - (count - 1) / 2) * 1.15, 0, -0.1);
  }

  function buildShared(state) {
    figs = state.procs.map((p, i) => {
      const g = figure(i, p.id);
      g.position.copy(homePos(state, i));
      g.lookAt(0, 0, 0);
      return g;
    });
    centreMat = new THREE.MeshStandardMaterial({ color: C("--surface-2").lerp(C("--muted"), 0.2), emissive: C("--bad"), emissiveIntensity: 0, roughness: 0.75 });
    if (presetId === "producer-consumer") {
      const w = B() * 1.25 + 0.4;
      centre = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 1.6), centreMat);
      centre.position.y = -0.1;
      world.add(centre);
      slots = Array.from({ length: B() }, (_, k) => {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.9, 1)), mats.edge);
        e.position.copy(slotPos(k));
        const t = label(`slot ${k}`, { size: 0.28, color: "--muted", bold: false });
        t.position.copy(slotPos(k)).add(V(0, -0.3, 0.75));
        world.add(e, t);
        return e;
      });
    } else if (presetId === "readers-writers") {
      centre = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 2.6), centreMat);
      floor.position.set(0, -0.36, -0.1);
      const wallM = new THREE.MeshStandardMaterial({ color: C("--accent"), transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 0.06), wallM);
      back.position.set(0, 0.6, -1.4);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 2.6), wallM), r = l.clone();
      l.position.set(-2.1, 0.6, -0.1); r.position.set(2.1, 0.6, -0.1);
      centre.add(floor, back, l, r);
      world.add(centre);
    } else {
      centre = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), centreMat);
      centre.position.y = 0.3;
      world.add(centre);
    }
    items = new Map();
  }

  function showShared(state, animate, lastRan) {
    const regionKey = Object.keys(state.regions)[0];
    const inside = regionKey ? state.regions[regionKey] : [];
    state.procs.forEach((p, i) => {
      const g = figs[i], k = inside.indexOf(p.id);
      const to = k >= 0 ? insidePos(state, i, k, inside.length) : homePos(state, i);
      if (!g.userData.at || !g.userData.at.equals(to)) { moveTo(g, to, animate && !!g.userData.at); g.userData.at = to.clone(); }
      g.userData.ring.visible = p.status === "blocked";
      g.userData.ring.material.color.copy(C("--bad"));
      g.userData.ring.userData.fast = true;
      const text = p.status === "blocked" ? `blocked on ${p.blockedOn}` : k >= 0 ? (p.role === "writer" ? "writing" : p.role === "reader" ? "reading" : `in ${regionKey}`) : presetId === "race" ? `reg = ${p.reg}` : p.role ?? "ready";
      tag(`st${i}`, g, text, { size: 0.4, color: p.status === "blocked" ? "--bad" : k >= 0 ? "--good" : "--muted", bg: "--surface" }, V(0, 2.46, 0));
    });
    centreMat.emissiveIntensity = state.violation ? 0.55 : 0;
    let text;
    if (presetId === "producer-consumer") {
      text = `buffer ${state.buffer.length}/${state.bufferSize}`;
      // Items: new ones fly in from their producer, taken ones out to the consumer.
      const keep = new Set(state.buffer);
      for (const [key, m] of items) if (!keep.has(key)) {
        items.delete(key);
        const to = lastRan != null ? figs[lastRan].position.clone().setY(1.1) : m.position.clone().setY(2);
        if (animate) { moveTo(m, to, true, 0.8); s.tween(m.scale, { x: 0.01, y: 0.01, z: 0.01 }, 520).then(() => disposeTree(m)); }
        else disposeTree(m);
      }
      state.buffer.forEach((key, k) => {
        let m = items.get(key);
        if (!m) {
          const who = state.procs.findIndex((p) => p.id === key.split("#")[0]);
          m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshStandardMaterial({ color: C(series(Math.max(0, who))), roughness: 0.4, emissive: C(series(Math.max(0, who))), emissiveIntensity: 0.15 }));
          const t = label(key, { size: 0.26, bg: "--surface", color: "--text" });
          t.position.y = 0.58;
          m.add(t);
          m.position.copy(animate && who >= 0 ? figs[who].position.clone().setY(1.1) : slotPos(k));
          world.add(m);
          items.set(key, m);
        }
        moveTo(m, slotPos(k), animate, 0.7);
      });
    } else if (presetId === "readers-writers") {
      text = `database · readcount = ${state.vars.readcount}`;
    } else {
      text = `x = ${state.vars.x}`;
    }
    if (cap) disposeTree(cap);
    cap = label(text, { size: 0.42, bg: state.violation ? "--bad" : "--surface", color: state.violation ? "--surface" : "--text" });
    cap.position.set(0, presetId === "race" ? 1.4 : presetId === "readers-writers" ? 1.95 : 1.55, presetId === "readers-writers" ? -1.4 : 0);
    world.add(cap);
    hud.replaceChildren(...Object.entries(state.sems).map(([k, v]) => h("span", null, `${k} `, h("b", null, v.value))));
  }

  function build(state) {
    if (world) disposeTree(world);
    world = new THREE.Group();
    s.scene.add(world);
    tags = new Map(); cap = null;
    mats = {
      metal: new THREE.MeshStandardMaterial({ color: C("--muted"), metalness: 0.5, roughness: 0.4 }),
      plate: new THREE.MeshStandardMaterial({ color: C("--surface"), roughness: 0.35 }),
      fork: new THREE.MeshStandardMaterial({ color: C("--text").lerp(C("--muted"), 0.35), metalness: 0.6, roughness: 0.3 }),
      held: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.45, metalness: 0.3, roughness: 0.35 }),
      rim: new THREE.MeshStandardMaterial({ color: C("--muted"), roughness: 0.6 }),
      rimRed: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.8 }),
      ring: new THREE.MeshBasicMaterial({ color: C("--series-4"), transparent: true, opacity: 0.9 }),
      waitAmber: new THREE.MeshBasicMaterial({ color: C("--series-4"), transparent: true, opacity: 0.85 }),
      waitRed: new THREE.MeshBasicMaterial({ color: C("--bad") }),
      edge: new THREE.LineBasicMaterial({ color: C("--text"), transparent: true, opacity: 0.45 }),
    };
    if (dining) buildDining(state); else buildShared(state);
    built = true;
  }

  function show(state, { lastRan = null, instant = false } = {}) {
    const fresh = !built;
    last = state;
    if (fresh) build(state);
    const animate = !instant && !fresh && !reducedMotion();
    if (dining) showDining(state, animate); else showShared(state, animate, lastRan);
  }

  s.onFrame((dt, now) => {
    const pulse = reducedMotion() ? 0.5 : 0.5 + 0.5 * Math.sin(now / 300);
    for (const g of figs) {
      const r = g.userData.ring;
      if (!r?.visible) continue;
      const p = reducedMotion() ? 0.5 : r.userData.fast ? 0.5 + 0.5 * Math.sin(now / 160) : pulse;
      r.scale.setScalar(1 + 0.18 * p);
      r.material.opacity = 0.45 + 0.5 * (1 - p);
    }
    if (dining && built) frameDining(now);
  });

  // Click a figure to run that process (a drag to orbit is not a click).
  if (onPick) {
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let down = null;
    s.el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    s.el.addEventListener("click", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = s.el.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, s.camera);
      const hit = ray.intersectObjects(figs, true).find((x) => x.object.userData.pick != null);
      if (hit) onPick(hit.object.userData.pick);
    });
  }

  s.onTheme(() => { if (!last) return; built = false; figs = []; items = new Map(); show(last, { instant: true }); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); s.dispose(); } };
}
