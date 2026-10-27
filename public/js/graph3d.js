// The optional 3D view of the DSA graph tools (traversal, MST, shortest paths,
// SCC). It draws the same step the 2D SVG does: vertices are spheres with name
// and badge labels, edges are tubes (with arrow cones when directed, weight
// labels at the middle), and the classes the engines put on vertices and edges
// map to the same CSS colour tokens the 2D drawing uses. A glowing token runs
// along the edge being examined, vertices pulse when their state changes and
// badges pop when their text does. Loaded only when someone picks 3D.
import { ease, scene3d } from "./three-kit.js";
import { reducedMotion } from "./ui.js";

// --- Layout (pure, no three.js, so it can be tested in Node) ----------------------------
const EDGE_LEN = 2.8, MIN_SEP = 2;
const cache = new Map();

function hash(s) {
  let x = 2166136261 >>> 0;
  for (const c of s) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return x;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded 3D force-directed layout: the same graph always gets the same
 * positions. seed2d (optional) is a Map of vertex → { x, y } (the 2D layout,
 * y pointing down) used as the starting shape, so the 3D picture resembles the
 * 2D one. Returns { pos: Map(vertex → { x, y, z }), radius } centred on the
 * origin, with edges about EDGE_LEN long and vertices at least MIN_SEP apart.
 * Results are cached by graph; { cache: false } recomputes (for tests).
 */
export function layout3d(g, seed2d = null, { cache: useCache = true } = {}) {
  const nodes = [...g.nodes], n = nodes.length;
  const pairs = [...new Set(g.edges.filter((e) => e.from !== e.to).map((e) => [e.from, e.to].sort().join("\u0000")))].sort().map((k) => k.split("\u0000"));
  const sig = `${nodes.join(",")}|${pairs.map((p) => p.join("-")).join(",")}|${seed2d ? nodes.map((v) => { const q = seed2d.get(v); return q ? `${q.x.toFixed(1)},${q.y.toFixed(1)}` : "?"; }).join(";") : ""}`;
  if (useCache && cache.has(sig)) return cache.get(sig);
  const rnd = mulberry32(hash(sig));
  const p = new Map();

  if (seed2d && nodes.every((v) => seed2d.get(v))) {
    const xs = nodes.map((v) => seed2d.get(v).x), ys = nodes.map((v) => seed2d.get(v).y);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 || 1;
    nodes.forEach((v, i) => {
      const q = seed2d.get(v);
      p.set(v, { x: (q.x - cx) / s, y: -(q.y - cy) / s, z: (i % 2 ? 1 : -1) * (0.25 + 0.35 * rnd()) });
    });
  } else {
    // Points spread evenly over a sphere (Fibonacci spiral), lightly jittered.
    const golden = Math.PI * (3 - Math.sqrt(5));
    nodes.forEach((v, i) => {
      const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * golden;
      p.set(v, { x: r * Math.cos(a) + (rnd() - 0.5) * 0.05, y: y + (rnd() - 0.5) * 0.05, z: r * Math.sin(a) + (rnd() - 0.5) * 0.05 });
    });
  }

  if (n > 1) {
    // Fruchterman–Reingold in three dimensions, cooling as it goes.
    const k = 1.25 * Math.cbrt(1 / n);
    const P = nodes.map((v) => p.get(v)), idx = new Map(nodes.map((v, i) => [v, i]));
    const E = pairs.map(([a, b]) => [idx.get(a), idx.get(b)]);
    for (let it = 0, T = 0.14; it < 320; it++, T *= 0.986) {
      const d = P.map(() => ({ x: 0, y: 0, z: 0 }));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z, dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-4) { dx = 0.01 * (i - j); dy = 0.01; dz = 0.01 * (j % 3); dist = Math.hypot(dx, dy, dz); }
        const f = (k * k) / dist / dist;
        d[i].x += dx * f; d[i].y += dy * f; d[i].z += dz * f;
        d[j].x -= dx * f; d[j].y -= dy * f; d[j].z -= dz * f;
      }
      for (const [i, j] of E) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z, dist = Math.hypot(dx, dy, dz) || 1e-4;
        const f = dist / k;
        d[i].x -= dx * f; d[i].y -= dy * f; d[i].z -= dz * f;
        d[j].x += dx * f; d[j].y += dy * f; d[j].z += dz * f;
      }
      for (let i = 0; i < n; i++) {
        d[i].x -= P[i].x * 0.5; d[i].y -= P[i].y * 0.5; d[i].z -= P[i].z * 0.5; // gravity keeps components together
        const len = Math.hypot(d[i].x, d[i].y, d[i].z) || 1, step = Math.min(len, T);
        P[i].x += (d[i].x / len) * step; P[i].y += (d[i].y / len) * step; P[i].z += (d[i].z / len) * step;
      }
    }
    // Scale so a typical edge is EDGE_LEN long.
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    let lens = E.map(([i, j]) => dist(P[i], P[j]));
    if (!lens.length) lens = P.map((a, i) => Math.min(...P.filter((_, j) => j !== i).map((b) => dist(a, b))));
    lens.sort((a, b) => a - b);
    const s = EDGE_LEN / (lens[Math.floor(lens.length / 2)] || 1);
    for (const q of P) { q.x *= s; q.y *= s; q.z *= s; }
    // Then push apart any pair that ended up too close.
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z, dd = Math.hypot(dx, dy, dz);
        if (dd >= MIN_SEP) continue;
        if (dd < 1e-6) { dx = 1; dy = 0; dz = 0; dd = 1; }
        const push = (MIN_SEP - dd) / 2 + 1e-3;
        P[i].x += (dx / dd) * push; P[i].y += (dy / dd) * push; P[i].z += (dz / dd) * push;
        P[j].x -= (dx / dd) * push; P[j].y -= (dy / dd) * push; P[j].z -= (dz / dd) * push;
        moved = true;
      }
      if (!moved) break;
    }
  }
  // Centre on the origin.
  const all = [...p.values()], c = ["x", "y", "z"].map((a) => (Math.max(...all.map((q) => q[a])) + Math.min(...all.map((q) => q[a]))) / 2);
  for (const q of all) { q.x -= c[0]; q.y -= c[1]; q.z -= c[2]; }
  const radius = Math.max(0.5, ...all.map((q) => Math.hypot(q.x, q.y, q.z)));
  const out = { pos: p, radius };
  cache.set(sig, out);
  return out;
}

// --- Looks ----------------------------------------------------------------------------
const NODE_R = 0.46, CONE_H = 0.36, CONE_R = 0.15, PX = 0.045; // PX: world units per 2D dash pixel
// state → [colour token, tube radius, opacity, dash pattern (2D px)]
const EDGE = {
  plain: ["--muted", 0.035, 0.9, null],
  seen: ["--muted", 0.035, 0.6, [5, 4]],
  tree: ["--accent", 0.075, 1, null],
  back: ["--series-8", 0.062, 1, [7, 4]],
  forward: ["--series-7", 0.062, 1, [2, 4]],
  cross: ["--series-5", 0.062, 1, [9, 3, 2, 3]],
  candidate: ["--accent", 0.055, 1, [6, 4]],
  mst: ["--good", 0.1, 1, null],
  rejected: ["--bad", 0.05, 0.7, [3, 4]],
  removed: ["--muted", 0.035, 0.25, [3, 4]],
  dim: ["--muted", 0.035, 0.28, null],
  relaxed: ["--series-3", 0.1, 1, null],
  path: ["--series-2", 0.105, 1, null],
  cycle: ["--bad", 0.1, 1, [10, 5]],
  active: ["--series-4", 0.1, 1, null],
};
const FADED = new Set(["removed", "dim", "rejected", "seen"]);

/**
 * Build the 3D scene for graph g inside container (which it takes over).
 * opts: { seed2d, height, aria }. Returns { update(step, { graph, animate }), dispose() }.
 * step is an engine step ({ nodes, styles, badges, edges, active }); graph is the
 * graph the step is drawn on (the transposed one in Kosaraju's second pass).
 */
export async function graph3d(container, g, opts = {}) {
  const { pos } = layout3d(g, opts.seed2d);
  const height = opts.height ?? 400, fov = 32;
  const width = container.clientWidth || 600, aspect = width / height;
  const big = width < 520 ? 1.1 : 1; // labels a little larger on phones, where the whole graph is drawn smaller
  const vHalf = (fov / 2) * (Math.PI / 180), hHalf = Math.atan(Math.tan(vHalf) * aspect);
  // Frame the graph as it turns about the vertical axis: its widest sweep across,
  // its height (plus the tilt of the camera) up and down.
  const P = [...pos.values()];
  const rxz = Math.max(...P.map((q) => Math.hypot(q.x, q.z))), ry = Math.max(...P.map((q) => Math.abs(q.y)));
  const dist = Math.max((rxz + 0.7) / Math.tan(hHalf), (ry + rxz * 0.4 + 1.1) / Math.tan(vHalf)) + rxz * 0.15;
  const kit = await scene3d(container, {
    height, fov, camera: [0, dist * 0.36, dist * 0.93], autoRotate: 0.16,
    aria: opts.aria ?? `3D view of the graph: ${g.nodes.length} vertices, ${g.edges.length} edges.`,
  });
  const { THREE, scene, camera } = kit;
  const coarse = matchMedia("(pointer: coarse)").matches;
  kit.el.append(Object.assign(document.createElement("div"), { className: "three-hint", textContent: coarse ? "Drag to turn · pinch to zoom" : "Drag to turn · scroll to zoom" }));

  const V = (q) => new THREE.Vector3(q.x, q.y, q.z);
  const col = (name) => kit.colour(name);
  const mix = (a, b, t) => a.clone().lerp(b, t);
  const disposeSprite = (s) => { if (!s) return; s.parent?.remove(s); s.material.map?.dispose(); s.material.dispose(); };

  // Dash patterns as alpha textures, repeated along each tube by scaling its UVs.
  const dashTex = new Map();
  function dash(pattern) {
    const key = pattern.join(",");
    if (!dashTex.has(key)) {
      const total = pattern.reduce((a, b) => a + b, 0), cv = document.createElement("canvas");
      cv.width = total * 4; cv.height = 2;
      const ctx = cv.getContext("2d");
      let x = 0;
      pattern.forEach((len, i) => { ctx.fillStyle = i % 2 ? "#000" : "#fff"; ctx.fillRect(x * 4, 0, len * 4, 2); x += len; });
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
      dashTex.set(key, t);
    }
    return dashTex.get(key);
  }

  // --- Vertices ---
  const sphereGeo = new THREE.SphereGeometry(NODE_R, 32, 20);
  const labels = new THREE.Group();
  scene.add(labels);
  const nodes = new Map();
  for (const v of g.nodes) {
    const group = new THREE.Group();
    group.position.copy(V(pos.get(v)));
    const body = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 }));
    const rim = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
    rim.scale.setScalar(1.12);
    group.add(body, rim);
    scene.add(group);
    nodes.set(v, { v, group, body, rim, centre: group.position.clone(), key: undefined, badgeText: undefined, name: null, badge: null, ink: null, frontier: false, base: 1 });
  }

  // --- Edges ---
  const byId = new Map(g.edges.map((e) => [e.id, e]));
  const twoWay = new Set(g.directed ? g.edges.map((e) => `${e.from}>${e.to}`) : []);
  const coneGeo = new THREE.ConeGeometry(CONE_R, CONE_H, 18);
  const worldUp = new THREE.Vector3(0, 1, 0);
  class Sub extends THREE.Curve {
    constructor(base, t0, t1) { super(); this.base = base; this.t0 = t0; this.t1 = t1; }
    getPoint(t, target = new THREE.Vector3()) { return this.base.getPoint(this.t0 + (this.t1 - this.t0) * t, target); }
  }
  // The parameter where the curve is d away from its start (atEnd: from its end).
  function cut(curve, d, atEnd) {
    const end = atEnd ? curve.v2 : curve.v0;
    let lo = 0, hi = 0.5;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (curve.getPoint(atEnd ? 1 - mid : mid).distanceTo(end) < d) lo = mid; else hi = mid;
    }
    return atEnd ? 1 - hi : hi;
  }
  const edges = new Map();
  for (const e of g.edges) {
    if (e.from === e.to || !pos.get(e.from) || !pos.get(e.to)) continue;
    const A = V(pos.get(e.from)), B = V(pos.get(e.to)), dir = B.clone().sub(A);
    let perp = new THREE.Vector3().crossVectors(dir, worldUp);
    if (perp.lengthSq() < 1e-6) perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0));
    perp.normalize();
    const bend = twoWay.has(`${e.to}>${e.from}`) ? 0.55 : 0;
    const C = A.clone().add(B).multiplyScalar(0.5).addScaledVector(perp, bend);
    const curve = new THREE.QuadraticBezierCurve3(A, C, B);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.visible = false;
    scene.add(tube, cone);
    edges.set(e.id, { e, curve, mat, tube, cone, mid: curve.getPoint(0.5), shape: null, state: undefined, weight: null, weightKey: null });
  }
  function shapeEdge(E, r, head, pattern) {
    const key = `${r}|${head}|${pattern?.join(",")}`;
    if (E.shape === key) return;
    E.shape = key;
    const gap = NODE_R * 1.12 + 0.02;
    const t0 = cut(E.curve, gap + (head === "from" ? CONE_H : 0), false);
    const t1 = cut(E.curve, gap + (head === "to" ? CONE_H : 0), true);
    const sub = new Sub(E.curve, t0, t1);
    const geo = new THREE.TubeGeometry(sub, 24, r, 10, false);
    if (pattern) {
      const len = sub.getLength(), period = pattern.reduce((a, b) => a + b, 0) * PX;
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / period));
    }
    E.tube.geometry.dispose();
    E.tube.geometry = geo;
    E.cone.visible = !!head;
    if (head) {
      const tipT = cut(E.curve, gap, head === "to"), baseT = head === "to" ? t1 : t0;
      const tip = E.curve.getPoint(tipT), base = E.curve.getPoint(baseT);
      E.cone.position.copy(tip).add(base).multiplyScalar(0.5);
      E.cone.quaternion.setFromUnitVectors(worldUp, tip.clone().sub(base).normalize());
      E.cone.scale.setScalar(r > 0.08 ? 1.2 : 1);
    }
  }

  // --- The travelling token ---
  const glowTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const ctx = cv.getContext("2d"), grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const token = new THREE.Group();
  const tokenCore = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), new THREE.MeshBasicMaterial());
  const tokenGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  tokenGlow.scale.setScalar(0.95);
  const tokenLight = new THREE.PointLight(0xffffff, 2.5, 3.2, 1.5);
  token.add(tokenCore, tokenGlow, tokenLight);
  token.visible = false;
  scene.add(token);
  // Travel starts from inside a frame: a tween started between frames can see a
  // frame time a moment before its own start, and a curve can't be read before 0.
  let pendingTravel = null;

  // --- Applying a step ---
  let last = null, flip = new Set();
  function nodeLook(cls, style) {
    const set = new Set(String(cls ?? "").split(/\s+/).filter(Boolean));
    const m = /--series-(\d+)/.exec(style ?? ""), c = m ? col(`--series-${m[1]}`) : null;
    const surface = col("--surface"), text = col("--text"), muted = col("--muted"), accent = col("--accent");
    let fill = mix(surface, muted, 0.1), stroke = muted.clone(), ink = "--text", glow = 0;
    if (set.has("visited")) { fill = mix(surface, accent, 0.22); stroke = accent.clone(); }
    if (set.has("frontier")) { fill = mix(surface, accent, 0.36); stroke = accent.clone(); }
    if (set.has("done")) { fill = mix(surface, text, 0.3); stroke = text.clone(); }
    if (set.has("grp") && c) { fill = mix(surface, c, 0.5); stroke = c.clone(); }
    for (const [k, t] of [["hl-i", "--series-1"], ["hl-j", "--series-5"], ["path", "--series-2"], ["bad", "--bad"]]) {
      if (set.has(k)) { const x = col(t); fill = mix(surface, x, 0.42); stroke = x; }
    }
    if (set.has("current")) {
      fill = set.has("grp") && c ? c.clone() : accent.clone();
      stroke = set.has("grp") && c ? text.clone() : accent.clone();
      ink = "--surface"; glow = 0.45;
    }
    return { fill, stroke, ink, glow, current: set.has("current"), frontier: set.has("frontier") && !set.has("current") };
  }
  function pulse(N, from = 1.38) {
    const b = N.base;
    N.group.scale.setScalar(b * from);
    kit.tween(N.group.scale, { x: b, y: b, z: b }, 520, ease.back);
  }
  function pop(sprite) {
    const s = sprite.scale.clone();
    sprite.scale.multiplyScalar(1.6);
    kit.tween(sprite.scale, { x: s.x, y: s.y }, 480, ease.back);
  }

  function apply(st, graph, { motion = false, force = false } = {}) {
    // Vertices.
    for (const N of nodes.values()) {
      const cls = st.nodes?.[N.v] ?? "", style = st.styles?.[N.v] ?? "", key = `${cls}|${style}`;
      if (key !== N.key || force) {
        const look = nodeLook(cls, style);
        N.body.material.color.copy(look.fill);
        N.body.material.emissive.copy(look.fill).multiplyScalar(0.28 + look.glow);
        N.rim.material.color.copy(look.stroke);
        N.rim.scale.setScalar(look.current ? 1.16 : 1.12);
        N.frontier = look.frontier;
        N.base = look.current ? 1.14 : 1;
        if (N.ink !== look.ink || !N.name) {
          disposeSprite(N.name);
          N.name = kit.label(N.v, { size: 0.62 * big, color: look.ink });
          N.name.renderOrder = 2;
          labels.add(N.name);
          N.ink = look.ink;
        }
        if (motion && N.key !== undefined && key !== N.key) pulse(N);
        else N.group.scale.setScalar(N.base);
        N.key = key;
      }
      const b = st.badges?.[N.v], text = b == null || b === "" ? null : String(b);
      if (text !== N.badgeText || force) {
        disposeSprite(N.badge);
        N.badge = text ? kit.label(text, { size: 0.44 * big, color: "--text", bg: "--surface" }) : null;
        if (N.badge) { N.badge.renderOrder = 3; labels.add(N.badge); }
        if (motion && N.badge && N.badgeText !== undefined && text !== N.badgeText) pop(N.badge);
        N.badgeText = text;
      }
    }
    // Edges: which way each one points in the graph this step is drawn on.
    flip = new Set((graph?.edges ?? []).filter((e) => byId.get(e.id) && byId.get(e.id).from !== e.from).map((e) => e.id));
    const active = st.active && edges.has(st.active.id) ? st.active : null;
    for (const E of edges.values()) {
      const raw = (st.edges?.[E.e.id] ?? "plain").split(" ")[0] || "plain";
      const isActive = active?.id === E.e.id;
      const state = isActive ? "active" : EDGE[raw] ? raw : "plain";
      const [token_, r, opacity, pattern] = EDGE[state];
      const head = g.directed ? (flip.has(E.e.id) ? "from" : "to") : null;
      shapeEdge(E, r, head, pattern);
      if (state !== E.state || force) {
        E.mat.color.copy(col(token_));
        E.mat.emissive.copy(E.mat.color).multiplyScalar(state === "active" || state === "relaxed" ? 0.35 : 0);
        E.mat.opacity = opacity;
        E.mat.transparent = opacity < 1;
        E.mat.depthWrite = opacity >= 1;
        E.mat.alphaMap = pattern ? dash(pattern) : null;
        E.mat.alphaTest = pattern ? 0.5 : 0;
        E.mat.needsUpdate = true;
        if (motion && E.state !== undefined && state !== E.state && (state === "relaxed" || state === "mst" || state === "path" || state === "tree")) {
          E.mat.emissive.copy(E.mat.color).multiplyScalar(0.6);
          kit.tween(E.mat.emissive, { r: 0, g: 0, b: 0 }, 750, ease.out);
        }
        E.state = state;
      }
      // Weight labels.
      if (g.weighted) {
        const wKey = `${isActive}|${FADED.has(state)}`;
        if (!E.weight || force) {
          disposeSprite(E.weight);
          E.weight = kit.label(String(E.e.w).replace("-", "−"), { size: 0.42 * big, color: "--text", bg: "--surface", bold: false });
          E.weight.renderOrder = 1;
          labels.add(E.weight);
          E.weightKey = null;
        }
        if (wKey !== E.weightKey) {
          E.weight.material.opacity = FADED.has(state) ? 0.5 : 1;
          const s = isActive ? 1.25 : 1, h0 = 0.42 * big, w0 = h0 * (E.weight.material.map.image.width / E.weight.material.map.image.height);
          E.weight.scale.set(w0 * s, h0 * s, 1);
          E.weightKey = wKey;
        }
      }
    }
    // The token runs the way the algorithm walks the edge.
    token.visible = !!active && !reducedMotion();
    if (active && token.visible && !force) {
      const E = edges.get(active.id), forward = active.from === E.e.from || (active.from !== E.e.to && !flip.has(E.e.id));
      const gap = NODE_R * 1.1;
      const t0 = cut(E.curve, gap, !forward), t1 = cut(E.curve, gap + (g.directed ? 0.05 : 0), forward);
      const pts = Array.from({ length: 13 }, (_, i) => E.curve.getPoint(t0 + ((t1 - t0) * i) / 12));
      tokenCore.material.color.copy(col("--series-4"));
      tokenGlow.material.color.copy(col("--series-4"));
      tokenLight.color.copy(col("--series-4"));
      token.position.copy(pts[0]);
      pendingTravel = pts;
    }
    last = { st, graph };
  }

  // Keep labels facing the viewer just in front of their sphere, and the
  // frontier ring breathing like the 2D one.
  const toCam = new THREE.Vector3(), down = new THREE.Vector3();
  kit.onFrame((dt, now) => {
    if (pendingTravel) { kit.travel(token, pendingTravel, 650, ease.inOut); pendingTravel = null; }
    down.setFromMatrixColumn(camera.matrixWorld, 1).negate();
    const breathe = reducedMotion() ? 0 : Math.sin((now / 1400) * Math.PI * 2);
    for (const N of nodes.values()) {
      toCam.copy(camera.position).sub(N.centre).normalize();
      const s = N.group.scale.x;
      N.name?.position.copy(N.centre).addScaledVector(toCam, NODE_R * 1.25 * s);
      N.badge?.position.copy(N.centre).addScaledVector(toCam, NODE_R * s).addScaledVector(down, NODE_R * 1.2 * s + 0.3);
      N.rim.scale.setScalar(N.frontier ? 1.14 + 0.06 * breathe : N.base > 1 ? 1.16 : 1.12);
    }
    for (const E of edges.values()) {
      if (!E.weight) continue;
      toCam.copy(camera.position).sub(E.mid).normalize();
      E.weight.position.copy(E.mid).addScaledVector(toCam, 0.2);
    }
  });

  kit.onTheme(() => { if (last) apply(last.st, last.graph, { force: true }); });

  return {
    el: kit.el,
    update(st, { graph = g, animate = false } = {}) {
      if (!st) return;
      apply(st, graph, { motion: animate && !reducedMotion() });
    },
    dispose() {
      for (const t of dashTex.values()) t.dispose();
      glowTex.dispose();
      for (const E of edges.values()) E.tube.geometry.dispose();
      kit.dispose();
    },
  };
}
