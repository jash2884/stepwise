// 3D view for Floyd–Warshall: the distance matrix as a cube of layers, one per
// k. Layer D⁽⁰⁾ (direct edges) sits at the bottom and D⁽ⁿ⁾ (every shortest
// distance) at the top. Each step lights the cell D[i][j] being built in layer k
// and its two sources D[i][k] and D[k][j] in layer k − 1, with beams rising
// from the sources into the cell, so "each layer is built from the one beneath"
// is visible. Loaded only when the 3D view is chosen.
import { scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const P = 1, G = 1.15, TILE = 0.82, TH = 0.09;
const txt = (v) => (v === Infinity ? "∞" : String(v));

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

// Label sprites share one texture per (text, style): clones are cheap.
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

export async function floydScene(host, { nodes, steps, height }) {
  const N = nodes, n = N.length, idx = new Map(N.map((v, i) => [v, i]));
  // Which layer each step is building: 0 before the first k, n after the last.
  let seen = false;
  const layerOf = steps.map((st) => { if (st.k != null) seen = true; return st.k != null ? idx.get(st.k) + 1 : seen ? n : 0; });
  // The finished matrix of each layer (the last snapshot taken while k was that vertex).
  const layers = [steps[0].D];
  for (let t = 1; t <= n; t++) {
    let last = null;
    for (const st of steps) if (st.k === N[t - 1]) last = st;
    layers.push(last ? last.D : layers[t - 1]);
  }
  const finite = [...layers, ...steps.map((st) => st.D)].flatMap((D) => N.flatMap((i) => N.map((j) => D[i][j]))).filter(Number.isFinite);
  const lo = finite.length ? Math.min(...finite) : 0, hi = finite.length ? Math.max(...finite) : 1;

  const pos = (i, j, t) => [(idx.get(j) - (n - 1) / 2) * P, t * G, (idx.get(i) - (n - 1) / 2) * P];
  const span = n * P, tall = n * G;
  const fov = 40, tn = Math.tan((fov * Math.PI) / 360);
  // Half-extents of the cube as seen from the default angle, labels included.
  const hw = span * 0.8 + 1.7, hh = (tall + span * 0.5) / 2 + 0.45;
  const fit = (w) => Math.max(hw / (tn * (w / height)), hh / tn) * 0.92 + span * 0.4;
  const target = [0, tall / 2 - 0.15, 0];
  const dir = [0.78, 0.62, 1.15], dl = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov, camera: dir.map((v, i) => target[i] + (v / dl) * fit(host.clientWidth || 640)),
    aria: `3D Floyd–Warshall cube: ${n + 1} stacked layers D(0) to D(${n}) of the ${n}×${n} distance matrix, one layer per stop-over vertex k`,
  });
  const { THREE, scene, colour } = s;
  s.el.classList.add("d3-dsa");

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const key = (c, t) => h("span", { class: "k", style: `--c: var(${c})` }, t);
  const legend = h("div", { class: "d3-legend low", "aria-hidden": "true" },
    key("--accent", "D[i][j] in layer k"), key("--series-2", "sources in layer k−1"), key("--good", "improved"), h("span", { class: "k inf" }, "∞"));
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  let world = null, dyn = null, lab = null, mats = null, tiles = [], plates = [], hi3 = null, beams = [], bands = [];
  let cur = -1, anim = { k: 1 }, pop = false;
  const tileGeo = new THREE.BoxGeometry(TILE, TH, TILE);
  let scaleLo, scaleHi, infC, futureC, surf;
  const valueColour = (v) => (v === Infinity ? infC.clone() : scaleLo.clone().lerp(scaleHi, hi === lo ? 0.5 : (Math.max(lo, v) - lo) / (hi - lo)));

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    dyn = new THREE.Group();
    world.add(dyn);
    lab = labelCache(s, world);
    const C = (name) => colour(name);
    surf = C("--surface");
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark" || document.documentElement.dataset.theme === "dark";
    // Sequential scale: short distances pale, long ones deep.
    scaleLo = C("--series-1").lerp(surf, dark ? 0.62 : 0.78);
    scaleHi = C("--series-1").lerp(C("--series-7"), 0.35).lerp(surf, dark ? 0.05 : 0);
    infC = C("--muted").lerp(surf, 0.55);
    futureC = C("--muted").lerp(surf, 0.35);
    mats = {
      plate: () => new THREE.MeshBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
      edge: () => new THREE.LineBasicMaterial({ color: C("--muted"), transparent: true, opacity: 0.35 }),
      cell: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.55, transparent: true, opacity: 0.6, depthWrite: false }),
      better: new THREE.MeshStandardMaterial({ color: C("--good"), emissive: C("--good"), emissiveIntensity: 0.65, transparent: true, opacity: 0.65, depthWrite: false }),
      src: new THREE.MeshStandardMaterial({ color: C("--series-2"), emissive: C("--series-2"), emissiveIntensity: 0.55, transparent: true, opacity: 0.6, depthWrite: false }),
      beam: new THREE.MeshStandardMaterial({ color: C("--series-2"), emissive: C("--series-2"), emissiveIntensity: 0.7 }),
      band: new THREE.MeshBasicMaterial({ color: C("--series-2"), transparent: true, opacity: dark ? 0.22 : 0.16, depthWrite: false }),
    };
    tiles = []; plates = [];
    const m4 = new THREE.Matrix4();
    for (let t = 0; t <= n; t++) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, transparent: true, opacity: 1 });
      const inst = new THREE.InstancedMesh(tileGeo, mat, n * n);
      N.forEach((i, a) => N.forEach((j, b) => { m4.makeTranslation(...pos(i, j, t)); inst.setMatrixAt(a * n + b, m4); inst.setColorAt(a * n + b, futureC); }));
      inst.renderOrder = t;
      world.add(inst);
      tiles.push(inst);
      const pg = new THREE.PlaneGeometry(span + 0.3, span + 0.3);
      const plate = new THREE.Mesh(pg, mats.plate());
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = t * G - TH / 2 - 0.02;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(pg), mats.edge());
      plate.add(edge);
      world.add(plate);
      plates.push(plate);
    }
    // Highlights: the cell being built and its two sources, plus the k row/column band.
    const hiGeo = new THREE.BoxGeometry(TILE + 0.12, TH + 0.1, TILE + 0.12);
    hi3 = { cell: new THREE.Mesh(hiGeo, mats.cell), a: new THREE.Mesh(hiGeo, mats.src), b: new THREE.Mesh(hiGeo, mats.src) };
    for (const m of Object.values(hi3)) { m.visible = false; m.renderOrder = 50; world.add(m); }
    bands = [new THREE.Mesh(new THREE.BoxGeometry(span + 0.1, 0.02, TILE + 0.16), mats.band), new THREE.Mesh(new THREE.BoxGeometry(TILE + 0.16, 0.02, span + 0.1), mats.band)];
    for (const b of bands) { b.visible = false; b.renderOrder = 40; world.add(b); }
    beams = [];
  }

  const clearDyn = () => {
    for (const c of [...dyn.children]) c.removeFromParent();
    for (const b of beams) { b.geometry.dispose(); b.removeFromParent(); }
    beams = [];
  };
  const place = (o, p) => { o.position.set(...p); if (o.isSprite) o.renderOrder = 100; return o; };
  const lsize = 0.46 * Math.min(1, 6 / Math.max(6, n));

  function show(si, instant = false) {
    si = Math.max(0, Math.min(steps.length - 1, si));
    const st = steps[si], t = layerOf[si], prev = si > 0 ? steps[si - 1] : null;
    const animate = si === cur + 1 && !instant && !reducedMotion();
    cur = si;
    clearDyn();
    const [ci, cj] = st.cell ?? [], k = st.k;
    const order = (i, j) => idx.get(i) * n + idx.get(j);
    // Cells of the current layer at or before the current one are decided.
    const decided = st.cell ? order(ci, cj) : k != null ? -1 : n * n;

    tiles.forEach((inst, u) => {
      const D = u < t ? layers[u] : u === t ? st.D : null;
      N.forEach((i, a) => N.forEach((j, b) => {
        let c = D ? valueColour(D[i][j]) : futureC;
        if (u === t && a * n + b > decided) c = c.lerp(surf, 0.5);
        inst.setColorAt(a * n + b, c);
      }));
      inst.instanceColor.needsUpdate = true;
      const op = u === t ? 1 : u === t - 1 ? 0.62 : u < t ? 0.24 : 0.07;
      inst.material.opacity = op;
      inst.material.depthWrite = u === t;
      plates[u].material.opacity = u === t ? 0.1 : u > t ? 0.025 : 0.05;
      plates[u].children[0].material.opacity = u === t ? 0.75 : u === t - 1 ? 0.45 : u > t ? 0.14 : 0.28;
      const tag = lab(u === 0 ? `D(0) edges` : `D(${u}) k=${N[u - 1]}`, { size: u === t ? 0.42 : 0.32, color: u === t ? "--accent" : "--muted", bold: u === t });
      tag.center.set(1, 0.5);
      dyn.add(place(tag, [-span / 2 - 0.35, u * G, span / 2]));
    });

    // Values: the whole current layer, and row k / column k of the layer beneath
    // (the only cells round k reads).
    const yLab = TH / 2 + 0.17;
    N.forEach((i, a) => N.forEach((j, b) => {
      const isNew = a * n + b <= decided;
      const lb = lab(txt(st.D[i][j]), { size: lsize, color: isNew ? "--text" : "--muted", bold: isNew });
      const p = pos(i, j, t); p[1] += yLab;
      dyn.add(place(lb, p));
      if (k != null && t > 0 && (i === k || j === k)) {
        const isSrc = st.cell && ((i === ci && j === k) || (i === k && j === cj));
        const sl = lab(txt(layers[t - 1][i][j]), { size: lsize * 0.9, color: isSrc ? "--text" : "--muted", bold: !!isSrc });
        const q = pos(i, j, t - 1); q[1] += yLab;
        dyn.add(place(sl, q));
      }
    }));
    // Row and column names along the current layer's edges.
    for (const v of N) {
      const col = lab(v, { size: 0.42, color: v === cj || v === k ? "--text" : "--muted", bold: v === cj || v === k });
      const p = pos(N[0], v, t); p[2] -= P * 0.85;
      dyn.add(place(col, p));
      const row = lab(v, { size: 0.42, color: v === ci || v === k ? "--text" : "--muted", bold: v === ci || v === k });
      const q = pos(v, N[0], t); q[0] -= P * 0.85;
      dyn.add(place(row, q));
    }
    const cap = lab("j →", { size: 0.26, color: "--muted", bold: false });
    const cp = pos(N[0], N.at(-1), t); cp[2] -= P * 0.85; cp[0] += P * 0.8;
    dyn.add(place(cap, cp));
    const rcap = lab("i ↓", { size: 0.26, color: "--muted", bold: false });
    const rp = pos(N[0], N[0], t); rp[0] -= P * 0.85; rp[2] -= P * 0.85;
    dyn.add(place(rcap, rp));

    // k band beneath, highlights and beams.
    const band = k != null && t > 0;
    bands.forEach((b) => { b.visible = band; });
    if (band) {
      bands[0].position.set(0, (t - 1) * G + TH / 2 + 0.012, pos(k, N[0], 0)[2]);
      bands[1].position.set(pos(N[0], k, 0)[0], (t - 1) * G + TH / 2 + 0.014, 0);
    }
    pop = false;
    if (st.cell && t > 0) {
      pop = !!prev && prev.D[ci][cj] !== st.D[ci][cj];
      hi3.cell.material = pop ? mats.better : mats.cell;
      place(hi3.cell, pos(ci, cj, t)).visible = true;
      place(hi3.a, pos(ci, k, t - 1)).visible = true;
      place(hi3.b, pos(k, cj, t - 1)).visible = true;
      const to = new THREE.Vector3(...pos(ci, cj, t)).add(new THREE.Vector3(0, -TH / 2 - 0.05, 0));
      for (const src of [hi3.a, hi3.b]) {
        const from = src.position.clone().add(new THREE.Vector3(0, TH / 2 + 0.04, 0));
        if (from.distanceTo(to) < 0.01) continue;
        const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, G * 0.45, 0));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 32, 0.045, 6), mats.beam);
        tube.renderOrder = 60;
        world.add(tube);
        beams.push(tube);
      }
    } else for (const m of Object.values(hi3)) m.visible = false;
    hi3.cell.scale.setScalar(1);

    anim = { k: animate ? 0 : 1 };
    if (animate) s.tween(anim, { k: 1 }, 750, (x) => x);

    const formula = st.cell
      ? `D[${ci}][${cj}] = min(${txt(prev?.D[ci][cj] ?? st.D[ci][cj])}, ${txt(layers[t - 1][ci][k])} + ${txt(layers[t - 1][k][cj])}) = ${txt(st.D[ci][cj])}`
      : k != null ? `Round k = ${k}: build layer ${t} from layer ${t - 1}` : t === 0 ? "Layer 0: direct edges" : "Top layer: every shortest distance";
    hud.replaceChildren(h("span", null, "Layer ", h("b", null, "D", h("sup", null, `(${t})`))), h("span", null, h("b", null, formula)));
    s.render(); // draw now, even where animation frames are throttled
  }

  // Each frame: grow the beams, then pop the cell if it improved.
  s.onFrame(() => {
    const k = Math.min(1, Math.max(0, anim.k));
    const grow = Math.min(1, k / 0.6);
    for (const b of beams) { const count = b.geometry.index.count, seg = 6 * 6; b.geometry.setDrawRange(0, grow >= 1 ? count : Math.max(seg, Math.floor(grow * 32) * seg)); }
    const pk = Math.min(1, Math.max(0, (k - 0.6) / 0.4));
    hi3?.cell.scale.setScalar(pop && k < 1 ? 1 + 0.45 * Math.sin(Math.PI * pk) : 1);
  });

  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); tileGeo.dispose(); s.dispose(); } };
}
