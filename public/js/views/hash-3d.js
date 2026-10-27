// 3D view for hashing. A static table is a row of bins: each key arrives as a
// labelled token that drops in above its home slot h(k). With chaining it joins
// the column (the chain) standing in that slot; with open addressing it hops
// from slot to slot along an arc, each probe flashing and bumping on a
// collision, until it lands. Extendible hashing shows the directory as a row of
// pointer bars and the buckets as boxes behind it: a split pulls a bucket
// apart, a doubling slides the new half of the directory out. Loaded only when
// the 3D view is chosen.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const S = 1.2, TOK_H = 0.3, TOK_R = 0.36, LEVEL = 0.42, REST = 0.06 + TOK_H / 2;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}
function labelCache(s, parent) {
  const cache = new Map(), keep = new s.THREE.Group();
  keep.visible = false;
  parent.add(keep);
  return (text, o = {}) => {
    const key = `${text}|${o.size}|${o.color}|${o.bg}|${o.bold}`;
    let base = cache.get(key);
    if (!base) { base = s.label(text, o); cache.set(key, base); keep.add(base); }
    const c = base.clone();
    c.visible = true;
    return c;
  };
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export async function hashScene(host, opts) {
  return opts.mode === "extendible" ? extendibleScene(host, opts) : tableScene(host, opts);
}

// Fit a camera looking along `dir` at a box of half-sizes (hw, hh) around target.
function framing(hw, hh, depth, height, fov = 40) {
  const t = Math.tan((fov * Math.PI) / 360);
  return (w) => Math.max(hw / (t * (w / height)), hh / t) * 1.04 + depth;
}

// --- Static table: chaining or open addressing --------------------------------
async function tableScene(host, { trace, m, strategy, height }) {
  const chaining = strategy === "chaining";
  // One row of slots when the stage is wide enough, otherwise a few rows (slot 0 at the back left).
  const aspect = (host.clientWidth || 640) / height, RZ = chaining ? 2.3 : 2.1;
  const rows = Math.ceil(m / Math.max(4, Math.floor(aspect * 5.5))), cols = Math.ceil(m / rows);
  const x = (j) => ((j % cols) - (cols - 1) / 2) * S, z = (j) => (Math.floor(j / cols) - (rows - 1) / 2) * RZ;
  const tallest = chaining ? Math.max(1, ...trace.map((s) => Math.max(...s.table.map((c) => c.length)))) : 1;
  const hover = (j, st) => (chaining ? REST + chainLen(st, j) * LEVEL + 0.95 : 1.55);
  const topY = chaining ? REST + tallest * LEVEL + 1.6 : 2.6;
  const fov = 40, bottom = -0.95;
  const fit = framing((cols * S) / 2 + 0.5, (topY - bottom) / 2 + 0.2 + (rows - 1) * RZ * 0.3, 0.8 + (rows - 1) * RZ * 0.3, height, fov);
  const target = [0, (topY + bottom) / 2 - (rows - 1) * 0.2, 0];
  const dir = [0.12, rows > 1 ? (chaining ? 0.62 : 0.95) : 0.42, 1], dl = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov, camera: dir.map((v, i) => target[i] + (v / dl) * fit(host.clientWidth || 640)),
    aria: `3D hash table: ${m} slots in a row; keys drop in as tokens${chaining ? " and stack into chains" : " and probe along arcs until they find a free slot"}`,
  });
  const { THREE, scene, colour } = s;
  s.el.classList.add("d3-dsa");

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const key = (c, t) => h("span", { class: "k", style: `--c: var(${c})` }, t);
  const legend = h("div", { class: "d3-legend low", "aria-hidden": "true" },
    key("--accent", "inserting"), key("--series-1", "stored"), chaining ? key("--good", "joined chain") : key("--series-2", "probed"), chaining ? null : key("--bad", "collision"));
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  const tokGeo = new THREE.CylinderGeometry(TOK_R, TOK_R, TOK_H, 28);
  const trayGeo = new THREE.BoxGeometry(S * 0.84, 0.12, 0.98);
  const binGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(S * 0.86, chaining ? 0.3 : 0.62, 1.0));
  let world, dyn, lab, mats, trays = [], token = null, plumb = null, trail = [], cur = -1, anim = { k: 1 }, motion = null, flashMat = null, wiggle = null;

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    dyn = new THREE.Group();
    world.add(dyn);
    lab = labelCache(s, world);
    const C = (n) => colour(n);
    const surf = C("--surface");
    mats = {
      stored: new THREE.MeshStandardMaterial({ color: C("--series-1"), roughness: 0.45 }),
      moving: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.35, roughness: 0.4 }),
      landed: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.3, roughness: 0.4 }),
      failed: new THREE.MeshStandardMaterial({ color: C("--bad"), emissive: C("--bad"), emissiveIntensity: 0.3, roughness: 0.4 }),
      dupe: new THREE.MeshStandardMaterial({ color: C("--muted"), roughness: 0.6 }),
      bin: new THREE.LineBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.55 }),
      rod: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(surf, 0.3), roughness: 0.7 }),
      trail: new THREE.LineDashedMaterial({ color: C("--series-2"), dashSize: 0.12, gapSize: 0.08 }),
      tray: { base: C("--muted").lerp(surf, 0.62), probed: C("--series-2").lerp(surf, 0.45), bad: C("--bad"), good: C("--good"), accent: C("--accent") },
    };
    trays = Array.from({ length: m }, (_, j) => {
      const tray = new THREE.Mesh(trayGeo, new THREE.MeshStandardMaterial({ color: mats.tray.base, roughness: 0.7 }));
      tray.position.set(x(j), 0, z(j));
      const bin = new THREE.LineSegments(binGeo, mats.bin);
      bin.position.y = (chaining ? 0.3 : 0.62) / 2 - 0.06;
      tray.add(bin);
      const idx = lab(j, { size: 0.36, color: "--muted", bold: false });
      idx.position.set(0, -0.36, 0.62);
      tray.add(idx);
      world.add(tray);
      return tray;
    });
    token = null;
    // A dashed plumb line from the moving token down to the slot under it.
    plumb = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: C("--accent"), dashSize: 0.08, gapSize: 0.07 }));
    world.add(plumb);
  }

  function chainLen(st, j) { const c = st.table[j]; return chaining ? c.length - (st.slot === j && st.line === 3 ? 1 : 0) : 0; }
  const kind = (st) => (st.line === 1 ? "dupe" : st.failed ? "failed" : st.slot != null ? "landed" : st.probes.length ? "collision" : "intro");
  const home = (st) => st.key % m;
  // Where the moving token rests at the end of a step.
  function endPos(st) {
    const k = kind(st);
    if (k === "dupe") return new THREE.Vector3(x(st.slot), hover(st.slot, st), z(st.slot));
    if (k === "landed") return new THREE.Vector3(x(st.slot), REST + (chaining ? chainLen(st, st.slot) * LEVEL : 0), z(st.slot));
    const j = st.probes.length ? st.probes.at(-1) : home(st);
    return new THREE.Vector3(x(j), hover(j, st), z(j));
  }

  const tokenFor = (k, mat) => {
    const t = new THREE.Mesh(tokGeo, mat);
    const l = lab(k, { size: 0.32, color: "--text", bg: "--surface" });
    l.position.set(0, 0, TOK_R + 0.06);
    t.add(l);
    return t;
  };

  function show(i, instant = false) {
    i = Math.max(0, Math.min(trace.length - 1, i));
    const st = trace[i], prev = i > 0 ? trace[i - 1] : null, kd = kind(st);
    const animate = i === cur + 1 && !instant && !reducedMotion();
    cur = i;
    for (const c of [...dyn.children]) { if (c.userData.own) c.geometry.dispose(); c.removeFromParent(); }
    for (const l of trail) { l.geometry.dispose(); l.removeFromParent(); }
    trail = [];

    // Stored keys (the moving token is drawn separately).
    for (let j = 0; j < m; j++) {
      const v = st.table[j];
      const list = chaining ? v.slice(0, chainLen(st, j)) : v == null || (kd === "landed" && st.slot === j) ? [] : [v];
      list.forEach((k, lvl) => {
        const t = tokenFor(k, mats.stored);
        t.position.set(x(j), REST + lvl * LEVEL, z(j));
        t.userData.slot = j;
        dyn.add(t);
      });
      if (chaining && list.length > 1) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, (list.length - 1) * LEVEL, 10), mats.rod);
        rod.position.set(x(j), REST + ((list.length - 1) * LEVEL) / 2, z(j) - TOK_R - 0.02);
        rod.userData.own = true;
        dyn.add(rod);
      }
    }
    // Tray colours: probed slots tinted, the slot this step looked at flashes.
    const probes = st.probes ?? [];
    trays.forEach((tr, j) => { tr.material.color.copy(probes.includes(j) && !chaining ? mats.tray.probed : mats.tray.base); tr.material.emissive.setRGB(0, 0, 0); });
    probes.forEach((j, n) => {
      if (chaining) return;
      const pl = lab(`p${n}`, { size: 0.28, color: "--series-2", bold: true });
      pl.position.set(x(j), -0.7, z(j) + 0.62);
      dyn.add(pl);
    });
    const look = kd === "intro" ? home(st) : kd === "dupe" ? st.slot : probes.at(-1);
    flashMat = look != null ? trays[look].material : null;
    const flashC = kd === "collision" || kd === "failed" ? mats.tray.bad : kd === "landed" ? mats.tray.good : mats.tray.accent;
    if (flashMat) flashMat.color.copy(flashC).lerp(mats.tray.base, 0.35);

    // Probe trail: dashed arcs between successive probe positions.
    for (let n = 1; n < probes.length && !chaining; n++) {
      const a = new THREE.Vector3(x(probes[n - 1]), 1.55, z(probes[n - 1])), b = new THREE.Vector3(x(probes[n]), 1.55, z(probes[n]));
      const apex = a.clone().lerp(b, 0.5); apex.y += 0.55 + 0.07 * a.distanceTo(b);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(a, apex, b).getPoints(28)), mats.trail);
      line.computeLineDistances();
      world.add(line);
      trail.push(line);
    }

    // The moving token and its path for this step.
    const mat = kd === "landed" ? mats.landed : kd === "failed" ? mats.failed : kd === "dupe" ? mats.dupe : mats.moving;
    token = tokenFor(st.key, mat);
    dyn.add(token);
    const end = endPos(st);
    const start = prev && prev.key === st.key && kind(prev) !== "landed" ? endPos(prev) : new THREE.Vector3(x(home(st)), topY + 0.4, z(home(st)));
    const pts = [start];
    const across = Math.hypot(start.x - end.x, start.z - end.z);
    if (across > 0.01) {
      const hy = Math.max(start.y, hover(kd === "landed" ? st.slot : home(st), st));
      const apex = new THREE.Vector3((start.x + end.x) / 2, hy + 0.55 + 0.07 * across, (start.z + end.z) / 2);
      pts.push(apex);
      if (kd === "landed") pts.push(new THREE.Vector3(end.x, hover(st.slot, st), end.z));
    }
    pts.push(end);
    const bump = kd === "collision" || kd === "failed";
    const occupant = bump ? dyn.children.find((c) => c.userData.slot === probes.at(-1)) : null;
    motion = { curve: pts.length > 2 ? new THREE.CatmullRomCurve3(pts) : null, a: start, b: end, bump, kd, occupant };
    wiggle = occupant;
    anim = { k: animate ? 0 : 1 };
    if (animate) s.tween(anim, { k: 1 }, bump ? 900 : 750, ease.linear);
    frame();

    const used = chaining ? st.table.reduce((a, c) => a + c.length, 0) : st.table.filter((v) => v != null).length;
    hud.replaceChildren(...[
      h("span", null, "h(", h("b", null, `${st.key}`), `) = ${st.key} mod ${m} = `, h("b", null, `${home(st)}`)),
      !chaining && probes.length ? h("span", null, "Probes ", h("b", null, probes.join(" → "))) : null,
      h("span", null, "Load ", h("b", null, `${used}/${m}`))].filter(Boolean));
    s.render();
  }

  function frame() {
    if (!motion || !token) return;
    const k = clamp01(anim.k), { bump, curve, a, b } = motion;
    const f = clamp01(bump ? k / 0.62 : k);
    const e = ease.inOut(f);
    if (curve) token.position.copy(curve.getPointAt(e));
    else token.position.lerpVectors(a, b, motion.kd === "landed" || motion.kd === "intro" ? ease.out(f) : e);
    let flash = 0;
    if (bump && k > 0.62 && k < 1) {
      const u = (k - 0.62) / 0.38, sn = Math.sin(Math.PI * u);
      token.position.y -= 0.42 * sn;
      flash = sn;
      if (motion.occupant) motion.occupant.scale.set(1 + 0.18 * sn, 1 - 0.25 * sn, 1 + 0.18 * sn);
      if (motion.kd === "failed") token.position.x += 0.12 * Math.sin(u * Math.PI * 6);
    } else if (motion.occupant) motion.occupant.scale.setScalar(1);
    if (!bump && k > 0.75 && k < 1) flash = Math.sin(Math.PI * (k - 0.75) / 0.25);
    if (flashMat) flashMat.emissive.copy(flashMat.color).multiplyScalar(0.25 + 0.6 * flash);
    const p = token.position, pos = plumb.geometry.attributes.position;
    pos.setXYZ(0, p.x, p.y - TOK_H / 2, p.z); pos.setXYZ(1, p.x, 0.07, p.z);
    pos.needsUpdate = true;
    plumb.computeLineDistances();
    plumb.visible = p.y - TOK_H / 2 > (chaining ? 0.3 : 0.62);
  }

  s.onFrame(frame);
  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return {
    show,
    dispose: () => {
      ro.disconnect();
      s.dispose(); // disposes everything in the scene, shared geometries included
      tokGeo.dispose(); trayGeo.dispose(); binGeo.dispose();
    },
  };
}

// --- Extendible hashing ------------------------------------------------------
async function extendibleScene(host, { steps, size, height }) {
  const compact = (host.clientWidth || 640) < 560;
  const PER_ROW = compact ? 3 : 5, CELL = 0.62, BW = size * CELL + 0.3, GAP = 0.55, DIR_Z = 1.9, ROW_Z = 1.9;
  const bitsOf = (n, d) => (d ? (n % 2 ** d).toString(2).padStart(d, "0") : "·");
  const dirW = (N) => Math.min(1.0, (compact ? 7 : 11) / N);

  function layout(st) {
    const N = st.dir.length, dw = dirW(N);
    const first = new Map();
    st.dir.forEach((b, i) => { if (!first.has(b)) first.set(b, i); });
    const order = [...st.buckets].sort((a, b) => (first.get(a.id) ?? 999) - (first.get(b.id) ?? 999) || a.id - b.id);
    const pos = new Map();
    order.forEach((b, r) => {
      const row = Math.floor(r / PER_ROW), col = r % PER_ROW, inRow = Math.min(PER_ROW, order.length - row * PER_ROW);
      pos.set(b.id, new T.Vector3((col - (inRow - 1) / 2) * (BW + GAP), 0.5 + row * 0.95, -0.4 - row * ROW_Z));
    });
    return { dw, entry: (i) => new T.Vector3((i - (N - 1) / 2) * dw, 0, DIR_Z), pos };
  }

  // Bounds over every step, so the default camera frames the biggest state.
  let maxRows = 1, maxW = BW;
  for (const st of steps) {
    const nb = st.buckets.length, rows = Math.ceil(nb / PER_ROW);
    maxRows = Math.max(maxRows, rows);
    maxW = Math.max(maxW, Math.min(nb, PER_ROW) * (BW + GAP), st.dir.length * dirW(st.dir.length));
  }
  const fov = 40;
  const zMid = (DIR_Z + (-0.4 - (maxRows - 1) * ROW_Z)) / 2;
  const target = [0, 0.45 + (maxRows - 1) * 0.35, zMid];
  const fit = framing(maxW / 2 + 0.5, 1.4 + (maxRows - 1) * 0.6, (DIR_Z - zMid) * 0.4 + 0.6, height, fov);
  const dir = [0.08, 0.62, 1], dl = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov, camera: dir.map((v, i) => target[i] + (v / dl) * fit(host.clientWidth || 640)),
    aria: "3D extendible hash index: the directory as a row of pointer bars in front, buckets as boxes behind, with a line from each entry to its bucket",
  });
  const { THREE: T, scene, colour } = s;
  s.el.classList.add("d3-dsa");

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const key = (c, t) => h("span", { class: "k", style: `--c: var(${c})` }, t);
  const legend = h("div", { class: "d3-legend low", "aria-hidden": "true" },
    key("--accent", "key's entry & bucket"), key("--good", "inserted key"), key("--series-4", "new bucket"), key("--series-1", "keys"));
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  const keyGeo = new T.BoxGeometry(CELL * 0.8, 0.34, 0.5);
  let world, dyn, lab, mats, cur = -1, anim = { k: 1 }, movers = [], pointers = [], drop = null;

  function build() {
    if (world) disposeTree(world);
    world = new T.Group();
    scene.add(world);
    dyn = new T.Group();
    world.add(dyn);
    lab = labelCache(s, world);
    const C = (n) => colour(n), surf = C("--surface");
    mats = {
      entry: new T.MeshStandardMaterial({ color: C("--muted").lerp(surf, 0.35), roughness: 0.6 }),
      entryHot: new T.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.35 }),
      box: new T.MeshStandardMaterial({ color: C("--series-1").lerp(surf, 0.82), transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.8 }),
      edge: new T.LineBasicMaterial({ color: C("--muted") }),
      edgeHot: new T.LineBasicMaterial({ color: C("--accent") }),
      edgeNew: new T.LineBasicMaterial({ color: C("--series-4") }),
      cell: new T.MeshBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.12, depthWrite: false }),
      key: new T.MeshStandardMaterial({ color: C("--series-1"), roughness: 0.45 }),
      keyNew: new T.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.3 }),
      ptr: new T.LineBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.55 }),
      ptrHot: new T.LineBasicMaterial({ color: C("--accent") }),
    };
    const cap = lab("directory (last g bits)", { size: 0.3, color: "--muted", bold: false });
    cap.position.set(0, -0.62, DIR_Z + 0.55);
    world.add(cap);
  }

  function bucketMesh(b, hot, fresh) {
    const g = new T.Group();
    const boxGeo = new T.BoxGeometry(BW, 0.62, 0.86);
    const box = new T.Mesh(boxGeo, mats.box);
    const edge = new T.LineSegments(new T.EdgesGeometry(boxGeo), fresh ? mats.edgeNew : hot ? mats.edgeHot : mats.edge);
    g.add(box, edge);
    g.userData.own = [boxGeo, edge.geometry];
    for (let c = 0; c < size; c++) {
      const cx = (c - (size - 1) / 2) * CELL;
      const k = b.keys[c];
      if (k == null) {
        const cell = new T.Mesh(new T.PlaneGeometry(CELL * 0.8, 0.5), mats.cell);
        cell.position.set(cx, 0, 0.44);
        g.userData.own.push(cell.geometry);
        g.add(cell);
        continue;
      }
      const km = new T.Mesh(keyGeo, k === hot?.key ? mats.keyNew : mats.key);
      km.position.set(cx, 0, 0);
      km.userData.key = k;
      const l = lab(k, { size: 0.32, color: "--text", bg: "--surface" });
      l.position.set(0, 0, 0.42);
      km.add(l);
      g.add(km);
    }
    const tag = lab(`B${b.id} · d=${b.local}`, { size: 0.36, color: fresh ? "--series-4" : hot ? "--accent" : "--muted", bold: !!(hot || fresh) });
    tag.position.set(0, 0.55, 0);
    g.add(tag);
    return g;
  }

  function show(i, instant = false) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[i], prev = i > 0 ? steps[i - 1] : null;
    const animate = i === cur + 1 && !instant && !reducedMotion();
    cur = i;
    for (const c of [...dyn.children]) { for (const g of c.userData.own ?? []) g.dispose(); c.removeFromParent(); }
    movers = []; pointers = []; drop = null;
    const L = layout(st), Lp = animate && prev ? layout(prev) : null;
    const k = st.key, hotIdx = k != null ? k % 2 ** st.global : -1;
    const inserted = st.bucket != null && !st.split && !st.doubled && st.line !== 1;

    // Directory entries: new ones (after a doubling) slide out from their twin.
    const entries = st.dir.map((bid, idx) => {
      const g = new T.Group();
      const bar = new T.Mesh(new T.BoxGeometry(L.dw * 0.84, 0.24, 0.7), idx === hotIdx ? mats.entryHot : mats.entry);
      g.add(bar);
      g.userData.own = [bar.geometry];
      if (L.dw >= 0.42 || idx === hotIdx) {
        const tl = lab(bitsOf(idx, st.global), { size: L.dw >= 0.6 ? 0.3 : 0.24, color: idx === hotIdx ? "--accent" : "--text", bold: idx === hotIdx });
        tl.position.set(0, -0.32, 0.38);
        g.add(tl);
      }
      const to = L.entry(idx);
      const from = Lp ? (idx < prev.dir.length ? Lp.entry(idx) : Lp.entry(idx - prev.dir.length)) : to;
      g.position.copy(from);
      movers.push({ o: g, from, to });
      dyn.add(g);
      return g;
    });
    // Buckets: a new sibling starts where the split bucket was and slides apart.
    const bucketObj = new Map();
    for (const b of st.buckets) {
      const fresh = b.id === st.split;
      const hotB = b.id === st.bucket ? { key: inserted ? k : null } : null;
      const g = bucketMesh(b, hotB, fresh);
      const to = L.pos.get(b.id);
      const from = Lp ? (Lp.pos.get(b.id) ?? Lp.pos.get(st.bucket) ?? to) : to;
      g.position.copy(from);
      movers.push({ o: g, from, to });
      dyn.add(g);
      bucketObj.set(b.id, g);
    }
    // Pointers from each entry to its bucket, redrawn while things move.
    st.dir.forEach((bid, idx) => {
      const line = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({ length: 17 }, () => new T.Vector3())), idx === hotIdx ? mats.ptrHot : mats.ptr);
      line.userData.own = [line.geometry];
      line.renderOrder = idx === hotIdx ? 5 : 0;
      dyn.add(line);
      pointers.push({ line, a: entries[idx], b: bucketObj.get(bid) });
    });
    // The key being inserted: drops into its bucket, or waits above it during a split or doubling.
    if (k != null && st.bucket != null && st.line !== 1) {
      const target = bucketObj.get(st.bucket);
      if (inserted) {
        const km = target.children.find((c) => c.userData.key === k);
        if (km && animate) { drop = { o: km, to: km.position.clone() }; km.position.y += 2.2; }
      } else {
        const t = new T.Mesh(keyGeo, mats.keyNew);
        const l = lab(k, { size: 0.32, color: "--text", bg: "--surface" });
        l.position.set(0, 0, 0.42);
        t.add(l);
        t.position.set(0, 1.25, 0);
        target.add(t);
      }
    }
    anim = { k: animate ? 0 : 1 };
    if (animate) s.tween(anim, { k: 1 }, 1000, ease.linear);
    frame();
    hud.replaceChildren(...[
      h("span", null, "Global depth ", h("b", null, `${st.global}`)),
      k != null ? h("span", null, "Key ", h("b", null, `${k} = …${bitsOf(k, Math.max(1, st.global))}₂`)) : null,
      h("span", null, st.doubled ? h("b", null, "directory doubles") : st.split != null ? h("b", null, `B${st.bucket} splits → B${st.split}`) : `${st.buckets.length} bucket${st.buckets.length > 1 ? "s" : ""}`)].filter(Boolean));
    s.render();
  }

  const tmpA = new T.Vector3(), tmpB = new T.Vector3(), tmpC = new T.Vector3();
  function frame() {
    const k = clamp01(anim.k), e = ease.inOut(clamp01(k / 0.8));
    for (const { o, from, to } of movers) o.position.lerpVectors(from, to, e);
    if (drop) { const f = ease.out(clamp01((k - 0.35) / 0.65)); drop.o.position.set(drop.to.x, drop.to.y + 2.2 * (1 - f), drop.to.z); }
    for (const { line, a, b } of pointers) {
      tmpA.copy(a.position).add(new T.Vector3(0, 0.12, -0.35));
      tmpB.copy(b.position).add(new T.Vector3(0, -0.31, 0.43));
      tmpC.copy(tmpA).lerp(tmpB, 0.5); tmpC.y += 0.6;
      const curve = new T.QuadraticBezierCurve3(tmpA, tmpC, tmpB);
      const pos = line.geometry.attributes.position;
      for (let p = 0; p <= 16; p++) { const v = curve.getPoint(p / 16); pos.setXYZ(p, v.x, v.y, v.z); }
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  s.onFrame(frame);
  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); keyGeo.dispose(); s.dispose(); } };
}
