// The drishi eye: 640 small blocks in one instanced mesh. At rest they form an
// eye, coloured like the eye of a peacock feather, that follows the pointer.
// shape("os") rebuilds the same blocks into a figure for that subject.
import { loadThree, webglAvailable } from "./three-kit.js";
import { reducedMotion } from "./ui.js";

export const N = 1500, FIG = 640; // blocks in the eye, and in every other figure
const TAU = Math.PI * 2, GOLD = Math.PI * (3 - Math.sqrt(5));
// Peacock: indigo heart, turquoise, bronze, then green barbs.
const HEART = [0x1d1570, 0x2a1e9a], TURQ = [0x0078a8, 0x00a3b0], BRONZE = [0xa8681a, 0xd2952f], LEAF = [0x0a5f5c, 0x1f7f5c];
const mixAt = (t, k) => (t < 0.2 ? HEART : t < 0.38 ? TURQ : t < 0.56 ? BRONZE : LEAF)[k % 2];

// Each shape: i -> [x, y, z, sx, sy, sz, rx, ry, rz]. Pure, so it can be tested.
const box = (x, y, z, s = 0.17, r = [0, 0, 0], sy = s, sz = s) => [x, y, z, s, sy, sz, ...r];
const grid = (i, w) => [i % w, Math.floor(i / w)];
export const SHAPES = {
  eye(i) {
    const t = Math.sqrt((i + 0.5) / N), a = i * GOLD, rad = 0.06 + t * 2.1;
    // A soft dome dipping at the pupil; the outer blocks stretch into feather barbs.
    const z = t < 0.2 ? 0.05 + t * 1.7 : 0.42 - (t - 0.2) * 0.62;
    const barb = Math.max(0, t - 0.56) / 0.44, s = t < 0.2 ? 0.105 : 0.07 + t * 0.025;
    const flare = barb > 0 ? 0.1 * Math.sin(i * 2.4) * barb : 0;
    return [Math.cos(a) * (rad + flare), Math.sin(a) * (rad + flare), z + Math.sin(i * 1.7) * 0.02, s, s * (1 + barb * 4.2), s * 1.5, barb * 0.35, 0, a - Math.PI / 2 + barb * 0.22];
  },
  dsa(i) { // a staircase of sorted bars
    const [k, c] = [i % 20, Math.floor(i / 20)], height = 1 + Math.floor(k * 1.55), n = Math.min(c, height);
    return box((k - 9.5) * 0.24, -1.7 + (n % height) * 0.19, ((c % 2) - 0.5) * 0.2, 0.18);
  },
  os(i) { // a stack of disks
    const l = i % 4, j = Math.floor(i / 4), t = Math.sqrt((j + 4) / 164), a = j * GOLD;
    return box(Math.cos(a) * t * 1.9, (l - 1.5) * 0.75, Math.sin(a) * t * 1.9, 0.18, [0, -a, 0], 0.07);
  },
  dbms(i) { // a tree of index pages
    const level = i < 64 ? 0 : i < 64 * 4 ? 1 : 2, at = [i, i - 64, i - 256][level], pages = [1, 3, 6][level], p = at % pages, j = Math.floor(at / pages);
    return box((p - (pages - 1) / 2) * [0, 1.7, 0.86][level] + ((j % 4) - 1.5) * 0.17, 1.5 - level * 1.45 - (Math.floor(j / 4) % 4) * 0.17, (Math.floor(j / 16) - 1.5) * 0.17, 0.15);
  },
  cn(i) { // a globe
    const y = 1 - (2 * (i + 0.5)) / FIG, r = Math.sqrt(1 - y * y), a = i * GOLD;
    return box(Math.cos(a) * r * 1.9, y * 1.9, Math.sin(a) * r * 1.9, 0.11 + (i % 11 === 0 ? 0.12 : 0), [0, -a, 0]);
  },
  toc(i) { // three states of a machine
    const k = i % 3, j = Math.floor(i / 3), a = (j / 213) * TAU * 3, tube = (j * GOLD);
    const R = 0.72, q = 0.11;
    return box((k - 1) * 1.65 + Math.cos(a) * (R + Math.cos(tube) * q), Math.sin(a) * (R + Math.cos(tube) * q), Math.sin(tube) * q, 0.11, [0, 0, a]);
  },
  cd(i) { // a pyramid of reductions
    let l = 0, left = i; while (left >= (l + 1) * (l + 1)) { left -= (l + 1) * (l + 1); l++; }
    return box((left % (l + 1) - l / 2) * 0.31, 1.75 - l * 0.31, (Math.floor(left / (l + 1)) - l / 2) * 0.31, 0.19);
  },
  "digital-logic"(i) { // a grid of ones and zeros
    const [x, y] = grid(i, 26), on = (Math.floor(x / 6.5) ^ Math.floor(y / 6.2)) & 1;
    return box((x - 12.5) * 0.16, (y - 12) * 0.16, on ? 0.35 : -0.15, 0.13);
  },
  coa(i) { // a chip with pins
    if (i < 484) { const [x, y] = grid(i, 22); return box((x - 10.5) * 0.13, 0, (y - 10.5) * 0.13, 0.12, [0, 0, 0], x > 6 && x < 15 && y > 6 && y < 15 ? 0.4 : 0.16); }
    const j = i - 484, side = j % 4, u = (Math.floor(j / 4) - 19) * 0.07;
    const d = 1.75; const [x, z] = [[u, d], [u, -d], [d, u], [-d, u]][side];
    return box(x, -0.12, z, 0.05, [0, 0, 0], 0.05, 0.34 * (side < 2 ? 1 : 0.2)).map((v, k) => (k === 3 && side > 1 ? 0.34 : v));
  },
  "discrete-maths"(i) { // a lattice (Hasse diagram of a cube)
    const v = i % 8, j = Math.floor(i / 8), b = [v & 1, (v >> 1) & 1, (v >> 2) & 1];
    const c = [(b[0] - b[2]) * 1.25, (b[0] + b[1] + b[2] - 1.5) * 1.05, (b[1] - 0.5) * 1.6];
    const y = 1 - (2 * (j + 0.5)) / 80, r = Math.sqrt(1 - y * y), a = j * GOLD;
    return box(c[0] + Math.cos(a) * r * 0.36, c[1] + y * 0.36, c[2] + Math.sin(a) * r * 0.36, 0.1);
  },
  maths(i) { // a saddle surface
    const [x, y] = grid(i, 26), u = (x - 12.5) / 12.5, v = (y - 12) / 12.5;
    return box(u * 2, (u * u - v * v) * 0.95, v * 2, 0.12);
  },
  ai(i) { // layers joined by attention
    const l = i % 4, j = Math.floor(i / 4), a = (j / 160) * TAU * 5, r = 0.25 + (j % 32) * 0.045;
    return box((l - 1.5) * 1.15, Math.sin(a) * r * 1.15, Math.cos(a) * r * 1.15, 0.11 + (j % 9 === 0 ? 0.1 : 0));
  },
};

/**
 * Mount the eye in `host`. opts: { follow: true, lit: null | 0..1, scale }.
 * Returns { shape(id), place({ x, y, scale }), lit(fraction), blink(), dispose() }, or null without WebGL.
 */
export async function mountEye(host, opts = {}) {
  if (!webglAvailable()) return null;
  const THREE = await loadThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60), rig = new THREE.Group();
  camera.position.z = 11;
  scene.add(rig);

  // A tiny studio to reflect: soft boxes on a pale dome.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x4d6873);
  for (const [x, y, z, w, e, c] of [[0, 7, 2, 7, 9, 0xffffff], [-7, 1, 3, 4, 5, 0xbdf3ff], [7, -1, 2, 3, 4, 0xffe2b0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, w), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(e) }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); m.rotateX(Math.PI / 2); studio.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio, 0.03);
  scene.environment = env.texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-3, 5, 6); scene.add(sun);

  // One bevelled block, unit sized.
  const b = 0.12, sq = new THREE.Shape(); const e = 0.5 - b;
  sq.moveTo(-e, -e); sq.lineTo(e, -e); sq.lineTo(e, e); sq.lineTo(-e, e); sq.closePath();
  const geo = new THREE.ExtrudeGeometry(sq, { depth: 1 - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, steps: 1 });
  geo.center();
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.55, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420] });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  rig.add(mesh);

  const base = Array.from({ length: N }, (_, i) => new THREE.Color(mixAt(Math.sqrt((i + 0.5) / N), i)));
  const pale = new THREE.Color();
  function paint(fraction) {
    pale.set(getComputedStyle(document.documentElement).getPropertyValue("--unlit").trim() || "#c9d3d6");
    for (let i = 0; i < N; i++) mesh.setColorAt(i, fraction == null || i < Math.round(fraction * N) ? base[i] : pale);
    mesh.instanceColor.needsUpdate = true;
  }
  let lit = opts.lit ?? null;
  paint(lit);
  const themeWatch = new MutationObserver(() => { paint(lit); kick(); });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const cur = Array.from({ length: N }, (_, i) => SHAPES.eye(i)), from = cur.map((a) => [...a]);
  let to = cur.map((a) => [...a]), id = "eye", t = 1, spin = 0;
  const still = reducedMotion();
  const want = { x: 0, y: 0, scale: opts.scale ?? 1 }, at = { ...want };
  const look = { x: 0, y: 0 }, gaze = { x: 0, y: 0 };
  let lids = 1, lidTo = 1, nextBlink = 2.5;
  const dummy = new THREE.Object3D();

  function shape(next) {
    if (!SHAPES[next] || next === id) return;
    id = next;
    for (let i = 0; i < N; i++) from[i] = [...cur[i]];
    // Figures use FIG blocks; the rest shrink away into their neighbours.
    to = Array.from({ length: N }, (_, i) => { if (next === "eye") return SHAPES.eye(i); const a = SHAPES[next](i % FIG); if (i >= FIG) a[3] = a[4] = a[5] = 0.001; return a; });
    t = still ? 1 : 0;
    if (still) for (let i = 0; i < N; i++) cur[i] = [...to[i]];
    kick();
  }
  const smooth = (x) => x * x * (3 - 2 * x);
  function step(dt) {
    if (t < 1) {
      t = Math.min(1, t + dt / 1.25);
      for (let i = 0; i < N; i++) {
        const k = smooth(Math.max(0, Math.min(1, t * 1.6 - (i / N) * 0.6)));
        for (let c = 0; c < 9; c++) cur[i][c] = from[i][c] + (to[i][c] - from[i][c]) * k;
        cur[i][2] += Math.sin(k * Math.PI) * 0.5 * ((i % 7) / 7);
      }
    }
    const f = still ? 1 : 1 - Math.exp(-dt * 5);
    at.x += (want.x - at.x) * f; at.y += (want.y - at.y) * f; at.scale += (want.scale - at.scale) * f;
    gaze.x += (look.x - gaze.x) * f; gaze.y += (look.y - gaze.y) * f;
    if (!still && id === "eye") {
      nextBlink -= dt;
      if (nextBlink < 0) { lidTo = 0.08; nextBlink = 3.5 + Math.random() * 4; }
      if (lids < 0.15) lidTo = 1;
    } else lidTo = 1;
    lids += (lidTo - lids) * (1 - Math.exp(-dt * 16));
    const wantSpin = id === "eye" ? 0 : spin + dt * 0.28;
    spin = id === "eye" ? spin * Math.exp(-dt * 4) : still ? 0.5 : wantSpin;
    rig.position.set(at.x, at.y, 0);
    rig.scale.set(at.scale, at.scale * lids, at.scale);
    rig.rotation.set((id === "eye" ? 0 : 0.32) - gaze.y * 0.5, spin + gaze.x * 0.62, 0);
    for (let i = 0; i < N; i++) {
      const a = cur[i];
      dummy.position.set(a[0], a[1], a[2]); dummy.scale.set(a[3], a[4], a[5]); dummy.rotation.set(a[6], a[7], a[8]);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  let raf = 0, last = performance.now(), visible = true, gone = false, kickT = 0;
  function loop(now) { if (gone || !visible || document.hidden) { raf = 0; return; } const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); raf = requestAnimationFrame(loop); }
  function start() { if (!raf && !gone) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function kick() { clearTimeout(kickT); kickT = setTimeout(() => { if (!gone) step(0.05); }, 30); start(); }
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); });
  io.observe(host);
  const size = () => { const w = host.clientWidth || 1, hh = host.clientHeight || 1; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.position.z = w / hh < 0.8 ? 15.5 : 11; camera.updateProjectionMatrix(); kick(); };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  const move = (ev) => { const r = host.getBoundingClientRect(); look.x = Math.max(-1, Math.min(1, (ev.clientX - r.left - r.width / 2) / (r.width / 2))); look.y = Math.max(-1, Math.min(1, -(ev.clientY - r.top - r.height / 2) / (r.height / 2))); };
  if (opts.follow !== false && !still) addEventListener("pointermove", move, { passive: true });
  const vis = () => { if (!document.hidden) start(); };
  document.addEventListener("visibilitychange", vis);
  for (const ms of [60, 300, 900]) setTimeout(() => { if (!gone) step(0.016); }, ms); // never blank when frames are throttled
  start();
  return {
    shape, place: (p) => { Object.assign(want, p); kick(); }, lit: (v) => { lit = v; paint(v); kick(); }, blink: () => { lidTo = 0.08; },
    dispose() { gone = true; cancelAnimationFrame(raf); clearTimeout(kickT); io.disconnect(); ro.disconnect(); themeWatch.disconnect(); removeEventListener("pointermove", move); document.removeEventListener("visibilitychange", vis); geo.dispose(); mat.dispose(); env.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove(); },
  };
}
