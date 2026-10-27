// Shared 3D plumbing for the optional 3D views (three.js, loaded only when a
// 3D view opens). One call gives a themed scene with lights, a camera you can
// orbit and zoom, resize handling, a frame loop that pauses off-screen, tweens,
// text labels, and a clean dispose. Colours come from the CSS tokens so 3D
// matches light and dark mode.
import { h, reducedMotion } from "./ui.js";

let threeP = null;
export const loadThree = () => (threeP ??= import("/vendor/three.module.min.js"));

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2")) || !!c.getContext("webgl");
  } catch { return false; }
}

// Read a CSS custom property (e.g. "--series-1") as a three.js colour.
export function token(THREE, name, el = document.documentElement) {
  const v = getComputedStyle(el).getPropertyValue(name).trim() || "#888888";
  return new THREE.Color(v);
}

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};

/**
 * Create a 3D scene inside `container`.
 * options: { height, camera: [x, y, z], target: [x, y, z], fov, orbit: true,
 *            autoRotate: 0 (radians/s), background: false, fog: false, aria }
 * Returns { THREE, scene, camera, renderer, el, onFrame(fn), tween(...), label(...),
 *           colours(), onTheme(fn), lookAt(...), dispose() }.
 */
export async function scene3d(container, opts = {}) {
  const THREE = await loadThree();
  const height = opts.height ?? 380;
  const el = h("div", { class: "three-stage", style: `height:${height}px`, role: "img", "aria-label": opts.aria ?? "3D view" });
  container.replaceChildren(el);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !opts.background, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !!opts.shadows;
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 45, 1, 0.1, 2000);
  const target = new THREE.Vector3(...(opts.target ?? [0, 0, 0]));
  camera.position.set(...(opts.camera ?? [0, 6, 14]));
  camera.lookAt(target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 8);
  sun.castShadow = !!opts.shadows;
  scene.add(hemi, sun);

  const themeFns = [];
  const applyTheme = () => {
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark" || document.documentElement.dataset.theme === "dark";
    hemi.intensity = dark ? 0.8 : 1.15;
    if (opts.background) scene.background = token(THREE, "--surface-2");
    if (opts.fog) scene.fog = new THREE.Fog(token(THREE, "--surface-2"), opts.fog[0], opts.fog[1]);
    for (const fn of themeFns) fn(dark);
  };
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", applyTheme);

  // Orbit: drag to rotate around the target, wheel or pinch to zoom.
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
  const limits = { min: sph.radius * 0.45, max: sph.radius * 2.2 };
  let autoRotate = reducedMotion() ? 0 : (opts.autoRotate ?? 0), userTouched = false;
  const place = () => { camera.position.copy(new THREE.Vector3().setFromSpherical(sph).add(target)); camera.lookAt(target); };
  if (opts.orbit !== false) {
    let drag = null, pinch = null;
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); el.classList.add("dragging"); });
    el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      sph.theta -= dx * 0.008;
      sph.phi = Math.min(Math.PI * 0.49, Math.max(0.12, sph.phi - dy * 0.006));
      userTouched = true;
      place();
    });
    const end = () => { drag = null; el.classList.remove("dragging"); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain scrolling scrolls the page; pinch (ctrl) or ⌘/Ctrl + wheel zooms
      e.preventDefault();
      sph.radius = Math.min(limits.max, Math.max(limits.min, sph.radius * (1 + Math.sign(e.deltaY) * 0.08)));
      place();
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2) { pinch = null; return; }
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) sph.radius = Math.min(limits.max, Math.max(limits.min, sph.radius * (pinch / d)));
      pinch = d;
      place();
      e.preventDefault();
    }, { passive: false });
  }

  const resize = () => {
    const w = el.clientWidth || 600, hh = el.clientHeight || height;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // Frame loop: runs only while the stage is on screen and the tab is visible.
  const frameFns = new Set(), tweens = new Set();
  let visible = true, raf = 0, last = performance.now(), disposed = false;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
  io.observe(el);
  function loop() {
    cancelAnimationFrame(raf);
    if (disposed || !visible || document.hidden) return;
    raf = requestAnimationFrame((now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (autoRotate && !userTouched) { sph.theta += autoRotate * dt; place(); }
      for (const t of tweens) {
        const k = Math.max(0, Math.min(1, (now - t.start) / t.ms)); // a tween started mid-frame can see now < start
        t.step(t.ease(k));
        if (k >= 1) { tweens.delete(t); t.resolve(); }
      }
      for (const fn of frameFns) fn(dt, now);
      renderer.render(scene, camera);
      loop();
    });
  }
  const onVis = () => { last = performance.now(); loop(); };
  // A frame shortly after anything changes, so a scene never sits blank when
  // animation frames are throttled (background tabs, hidden panes).
  let kickT = 0;
  const kick = () => { clearTimeout(kickT); kickT = setTimeout(() => { if (!disposed) renderer.render(scene, camera); }, 40); };
  document.addEventListener("visibilitychange", onVis);
  applyTheme();
  loop();
  scene.addEventListener("childadded", kick);
  const kickTimer = setInterval(() => { if (!visible || document.hidden || disposed) return; if (performance.now() - last > 600) renderer.render(scene, camera); }, 500);

  // Tween any numeric properties: tween(mesh.position, { x: 2, y: 1 }, 600).
  function tween(obj, to, ms = 600, how = ease.inOut) {
    kick();
    if (reducedMotion() || ms <= 0) { Object.assign(obj, to); return Promise.resolve(); }
    const from = Object.fromEntries(Object.keys(to).map((k) => [k, obj[k]]));
    return new Promise((resolve) => tweens.add({ start: performance.now(), ms, ease: how, resolve, step: (k) => { for (const key in to) obj[key] = from[key] + (to[key] - from[key]) * k; } }));
  }
  // Move along a path of points (an array of Vector3), e.g. a packet hop.
  function travel(obj, points, ms = 800, how = ease.inOut) {
    kick();
    if (reducedMotion()) { obj.position.copy(points.at(-1)); return Promise.resolve(); }
    const curve = new THREE.CatmullRomCurve3(points);
    const p = { t: 0 };
    return new Promise((resolve) => tweens.add({ start: performance.now(), ms, ease: how, resolve, step: (k) => { p.t = k; obj.position.copy(curve.getPointAt(k)); } }));
  }

  // A camera-facing text label (canvas texture on a sprite).
  function label(text, { size = 0.5, color = "--text", bg = null, bold = true } = {}) {
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    const px = 64, font = `${bold ? 700 : 500} ${px}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(String(text)).width) + (bg ? 36 : 12);
    canvas.width = w; canvas.height = px * 1.45;
    ctx.font = font;
    if (bg) { ctx.fillStyle = `#${token(THREE, bg).getHexString()}`; ctx.beginPath(); ctx.roundRect(0, 0, w, canvas.height, 22); ctx.fill(); }
    ctx.fillStyle = `#${token(THREE, color).getHexString()}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(String(text), w / 2, canvas.height / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(size * (w / canvas.height), size, 1);
    sprite.userData.text = String(text);
    return sprite;
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    clearInterval(kickTimer); clearTimeout(kickT);
    io.disconnect(); ro.disconnect(); themeObs.disconnect();
    mq.removeEventListener?.("change", applyTheme);
    document.removeEventListener("visibilitychange", onVis);
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [o.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    el.remove();
  }

  return {
    THREE, scene, camera, renderer, el, target,
    onFrame: (fn) => { frameFns.add(fn); kick(); return () => frameFns.delete(fn); },
    onTheme: (fn) => { themeFns.push(fn); fn(getComputedStyle(document.documentElement).colorScheme === "dark"); },
    colour: (name) => token(THREE, name),
    tween, travel, label, dispose,
    render: () => renderer.render(scene, camera),
    setAutoRotate: (v) => { autoRotate = reducedMotion() ? 0 : v; },
    lookAt: (x, y, z, radius) => { target.set(x, y, z); if (radius) sph.radius = radius; place(); },
  };
}

// A "2D | 3D" switch for a tool. The choice is remembered per tool; 2D is the default.
export function viewToggle(key, onChange) {
  const store = `view3d:${key}`;
  let mode = "2d";
  try { if (localStorage.getItem(store) === "3d" && webglAvailable()) mode = "3d"; } catch { /* private mode */ }
  const btn = (m, text) => h("button", { type: "button", class: "btn ghost toggle", "aria-pressed": String(mode === m), "data-m": m, onclick: () => set(m) }, text);
  const el = h("div", { class: "view-toggle", role: "group", "aria-label": "View" }, btn("2d", "2D"), btn("3d", "3D"));
  if (!webglAvailable()) { el.hidden = true; }
  function set(m) {
    mode = m;
    for (const b of el.children) b.setAttribute("aria-pressed", String(b.dataset.m === m));
    try { localStorage.setItem(store, m); } catch { /* private mode */ }
    onChange(m);
  }
  return { el, get mode() { return mode; }, set };
}
