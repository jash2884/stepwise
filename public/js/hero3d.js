// The home page's 3D scene: a field of bars where every row keeps sorting
// itself (odd-even transposition sort), coloured by value. Rows that finish
// glow; when the whole field is sorted it reshuffles in a wave and starts over.
import { reducedMotion } from "./ui.js";
import { scene3d } from "./three-kit.js";

const ROWS = 11, COLS = 15, GAP = 0.72;

export async function mountHero(container) {
  const s = await scene3d(container, { height: container.clientHeight || 420, camera: [13, 10.5, 15], target: [0, 0.9, 0], fov: 36, autoRotate: 0.1, aria: "A field of 3D bars sorting themselves row by row" });
  const { THREE, scene } = s;
  const n = ROWS * COLS;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 1, 0.56), new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08 }), n);
  scene.add(mesh);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  let stops = [];
  s.onTheme(() => {
    stops = ["--series-1", "--series-7", "--series-5", "--series-2"].map((t) => s.colour(t));
    floor.material.color = s.colour("--accent");
  });
  const colourAt = (t, out) => {
    const k = Math.min(stops.length - 1.0001, t * (stops.length - 1)), i = Math.floor(k);
    return out.copy(stops[i]).lerp(stops[i + 1], k - i);
  };

  const rand = () => Math.random();
  const shuffled = () => Array.from({ length: COLS }, () => 0.25 + rand() * 0.75);
  const rows = Array.from({ length: ROWS }, () => ({ vals: shuffled(), shown: null, phase: rand() < 0.5 ? 0 : 1, done: false, glow: 0, delay: 0 }));
  for (const r of rows) r.shown = [...r.vals];

  const dummy = new THREE.Object3D(), col = new THREE.Color(), white = new THREE.Color(0xffffff);
  const draw = () => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = rows[r].shown[c], hgt = 0.25 + v * 3.6, i = r * COLS + c;
      dummy.position.set((c - (COLS - 1) / 2) * GAP, hgt / 2, (r - (ROWS - 1) / 2) * GAP);
      dummy.scale.set(1, hgt, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colourAt((v - 0.25) / 0.75, col);
      if (rows[r].glow) col.lerp(white, rows[r].glow * 0.35);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  if (reducedMotion()) {
    for (const r of rows) { r.vals.sort((a, b) => a - b); r.shown = [...r.vals]; }
    draw();
    s.render();
    return s.dispose;
  }

  // One odd-even pass per row every TICK seconds; heights ease towards their values.
  const TICK = 0.16;
  let acc = 0, resetIn = 0;
  s.onFrame((dt) => {
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      let allDone = true;
      rows.forEach((row, r) => {
        if (row.delay > 0) { row.delay -= TICK; allDone = false; return; }
        if (row.done) return;
        let swapped = false;
        for (let c = row.phase; c + 1 < COLS; c += 2) {
          if (row.vals[c] > row.vals[c + 1]) { [row.vals[c], row.vals[c + 1]] = [row.vals[c + 1], row.vals[c]]; swapped = true; }
        }
        row.phase ^= 1;
        row.quiet = swapped ? 0 : (row.quiet ?? 0) + 1;
        if (row.quiet >= 2) { row.done = true; row.glow = 1; }
        allDone &&= row.done;
        void r;
      });
      if (allDone) {
        resetIn += TICK;
        if (resetIn > 1.8) {
          resetIn = 0;
          rows.forEach((row, r) => { row.vals = shuffled(); row.done = false; row.quiet = 0; row.delay = r * 0.12; });
        }
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    for (const row of rows) {
      for (let c = 0; c < COLS; c++) row.shown[c] += (row.vals[c] - row.shown[c]) * k;
      row.glow = Math.max(0, row.glow - dt * 1.4);
    }
    draw();
  });
  draw();
  s.render();
  return s.dispose;
}
