// 3D scenes for the computer-networks tools: routing (Dijkstra, LSP flooding,
// distance vector, sending a packet), DNS lookups and sliding-window protocols.
// Loaded on demand (through view3d.js) only when someone picks 3D. Each scene
// is built from one engine result and exposes show(data) for the stepper and
// dispose(). Colours come from the CSS tokens and are re-read on theme change.
import { ease, scene3d } from "./three-kit.js";
import { reducedMotion } from "./ui.js";

const phone = () => matchMedia("(max-width: 560px)").matches;
export const stageHeight = () => (phone() ? 300 : 400);
const inf = (c) => (c === Infinity ? "∞" : c);

// Pull the camera back on narrow stages so the whole scene stays in frame.
function fit(k, height, wide = 1.45) {
  const w = k.el.clientWidth || 600, aspect = w / height;
  if (aspect >= wide) return;
  const r = k.camera.position.distanceTo(k.target);
  k.lookAt(k.target.x, k.target.y, k.target.z, r * Math.min(1.4, (wide / aspect) ** 0.6));
}

// Labels that are rebuilt only when their text changes, and on theme change
// (the colours are baked into the canvas texture). Always drawn on top.
function labelKit(k, scale = phone() ? 1.25 : 1) {
  const slots = new Set();
  function slot(parent, pos, base = {}) {
    let sprite = null, text = null, extra = {}, key = "";
    const drop = () => { if (!sprite) return; parent.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose(); sprite = null; };
    const s = {
      set(t, more = {}) {
        const kk = JSON.stringify(more);
        if (t === text && kk === key && (sprite || t == null)) return sprite;
        drop(); text = t ?? null; extra = more; key = kk;
        if (text === null || text === "") return null;
        const o = { ...base, ...more };
        sprite = k.label(text, { ...o, size: (o.size ?? 0.5) * scale });
        sprite.material.depthTest = false; sprite.renderOrder = 20;
        sprite.position.set(...pos);
        parent.add(sprite);
        return sprite;
      },
      get sprite() { return sprite; },
      refresh() { const t = text; text = null; s.set(t, extra); },
      remove() { drop(); slots.delete(s); },
    };
    slots.add(s);
    return s;
  }
  return { slot, refresh: () => { for (const s of slots) s.refresh(); } };
}

// Remove and free everything in a group of short-lived objects.
function clear(group) {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse((o) => {
      for (const m of [o.material].flat()) { if (!m) continue; if (o.isSprite && !m.userData.keepMap) m.map?.dispose(); m.dispose(); }
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  }
}

function shared(geo) { geo.userData.shared = true; return geo; }

// A soft round glow (sprite texture) for packets.
function glowTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d"), gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Common furniture: floor grid, glowing packets, pulses, falls.
function kit3d(k) {
  const { THREE } = k;
  const scale = phone() ? 1.25 : 1;
  const geo = {
    sphere: shared(new THREE.SphereGeometry(0.15, 20, 14)),
    cube: shared(new THREE.BoxGeometry(0.26, 0.26, 0.26)),
    envelope: shared(new THREE.BoxGeometry(0.42, 0.26, 0.06)),
    ring: shared(new THREE.RingGeometry(0.9, 1, 48)),
    trail: shared(new THREE.SphereGeometry(0.07, 10, 8)),
  };
  const glow = glowTexture(THREE);
  const lit = (colour, extra = {}) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0.1, ...extra });

  function floor(size) {
    const grid = new THREE.GridHelper(size, Math.round(size), 0x888888, 0x888888);
    grid.material.vertexColors = false;
    grid.material.transparent = true;
    grid.material.opacity = 0.75;
    const paint = () => grid.material.color.copy(k.colour("--line").lerp(k.colour("--muted"), 0.3));
    return { grid, paint };
  }

  // A glowing packet: a solid core plus a soft halo. kind: "sphere" | "cube" | "envelope".
  function packet(colour, kind = "sphere", text = null) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo[kind], lit(colour, { emissive: colour, emissiveIntensity: 0.75, transparent: true }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity: 0.6, depthWrite: false }));
    halo.material.userData.keepMap = true; // the glow texture is shared
    halo.scale.setScalar(kind === "envelope" ? 0.95 : 0.8);
    g.add(core, halo);
    g.userData.core = core; g.userData.halo = halo;
    if (text) {
      const s = k.label(text, { size: 0.4 * scale, color: "--text", bg: "--surface" });
      s.material.depthTest = false; s.renderOrder = 22;
      s.position.y = 0.38;
      g.add(s);
    }
    return g;
  }
  // A short-lived label (lives in a group that clear() empties each step).
  function tag(parent, text, pos, opts) {
    const s = k.label(text, { ...opts, size: (opts.size ?? 0.5) * scale });
    s.material.depthTest = false; s.renderOrder = 21;
    s.position.set(...pos);
    parent.add(s);
    return s;
  }

  // An expanding ring on the floor (or a still ring with reduced motion).
  async function pulse(parent, pos, colour, { r = 0.8, times = 2, y = 0.03 } = {}) {
    const m = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + y, pos.z);
    m.scale.setScalar(r);
    parent.add(m);
    if (reducedMotion()) { m.scale.setScalar(r * 1.35); m.material.opacity = 0.55; return; }
    for (let i = 0; i < times && m.parent; i++) {
      m.scale.setScalar(r); m.material.opacity = 0.85;
      await Promise.all([k.tween(m.scale, { x: r * 2.1, y: r * 2.1, z: r * 2.1 }, 900, ease.out), k.tween(m.material, { opacity: 0 }, 900, ease.out)]);
    }
  }

  // Drop something out of the scene: it tips over, falls and fades.
  async function fall(obj, depth = 2.2) {
    const mats = [];
    obj.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.needsUpdate = true; mats.push(o.material); } });
    if (reducedMotion()) { obj.position.y -= 0.25; for (const m of mats) m.opacity = 0.45; return; }
    await Promise.all([
      k.tween(obj.position, { y: obj.position.y - depth }, 1100, (t) => t * t),
      k.tween(obj.rotation, { x: obj.rotation.x + 2.2, z: obj.rotation.z + 1.3 }, 1100),
      ...mats.map((m) => k.tween(m, { opacity: 0 }, 1100, (t) => t * t * t)),
    ]);
  }

  // A fading trail of small spheres behind a moving object.
  function trail(parent, follow, colour, n = 16) {
    const dots = Array.from({ length: n }, (_, i) => {
      const d = new THREE.Mesh(geo.trail, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.55 * (1 - i / n), depthWrite: false }));
      d.scale.setScalar(1 - (i / n) * 0.7); d.visible = false; parent.add(d);
      return d;
    });
    const hist = [];
    const off = k.onFrame(() => {
      if (!follow.parent) { off(); return; }
      hist.unshift(follow.position.clone());
      if (hist.length > n * 2) hist.length = n * 2;
      dots.forEach((d, i) => { const p = hist[i * 2]; d.visible = !!p && !reducedMotion(); if (p) d.position.copy(p); });
    });
    return { reset: () => { hist.length = 0; for (const d of dots) d.visible = false; }, stop: off };
  }

  return { geo, lit, floor, packet, tag, pulse, fall, trail };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const same = (l, a, b) => (l.a === a && l.b === b) || (l.a === b && l.b === a);

/**
 * routingScene(box, g) → { show(d), dispose() }
 * d: { links (current costs), current, done: [], tree: [[a,b]], edge: [u,v], path: [],
 *      status: { node: text }, changed: [nodes], packets: [{ from, to, kind, label }],
 *      drops: [{ from, to }], route: [nodes] }
 */
export async function routingScene(box, g) {
  const n = g.nodes.length, R = n <= 3 ? 3 : n <= 6 ? 4.1 : 4.8;
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const cz = g.nodes.reduce((s, _, i) => s + R * Math.sin(angle(i)), 0) / n; // centre of the ring (front-back)
  const height = stageHeight();
  const k = await scene3d(box, {
    height, camera: [0, R * 1.5 + 2.4, cz + R * 1.75 + 3], target: [0, 0.8, cz],
    aria: `3D network: ${g.links.map((l) => `${l.a}-${l.b} cost ${l.cost}`).join(", ")}. Drag to turn it.`,
  });
  fit(k, height);
  const { THREE } = k, K = kit3d(k), L = labelKit(k);
  const world = new THREE.Group(), fx = new THREE.Group(), pk = new THREE.Group();
  k.scene.add(world); world.add(fx, pk);
  const fl = K.floor(R * 2 + 5);
  world.add(fl.grid);

  const pos = new Map(g.nodes.map((name, i) => {
    return [name, new THREE.Vector3(R * Math.cos(angle(i)), 0, R * Math.sin(angle(i)))];
  }));

  // Routers: a puck with a lit top, a rim, two antennas and front LEDs.
  const shadowGeo = shared(new THREE.CircleGeometry(0.85, 32));
  const routers = new Map(g.nodes.map((name) => {
    const grp = new THREE.Group();
    grp.position.copy(pos.get(name));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.42, 40), K.lit(0x888888, { roughness: 0.42 }));
    body.position.y = 0.21;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.03, 40), K.lit(0xffffff, { roughness: 0.3 }));
    top.position.y = 0.435;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.03, 8, 40), K.lit(0xffffff, { metalness: 0.5, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.42;
    const antMat = K.lit(0x666666, { metalness: 0.4 }), tipMat = K.lit(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.2 });
    const parts = [body, top, rim];
    for (const s of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.6, 8), antMat);
      ant.position.set(s * 0.3, 0.68, -0.38); ant.rotation.z = -s * 0.2;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), tipMat);
      tip.position.set(s * 0.36, 0.98, -0.38);
      parts.push(ant, tip);
    }
    const leds = [-0.22, 0, 0.22].map((x) => {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x33dd88 }));
      led.position.set(x, 0.22, 0.66); return led;
    });
    const shade = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.005;
    grp.add(shade, ...parts, ...leds);
    world.add(grp);
    const name3 = L.slot(grp, [0, 1.4, 0], { size: 0.72, bg: "--surface" });
    name3.set(name);
    const status = L.slot(grp, [0, 2.05, 0], { size: 0.48, bg: "--surface", bold: false });
    return [name, { grp, body, top, rim, antMat, tipMat, leds, name3, status, state: "idle" }];
  }));

  // Links: tubes between router centres, with a cost label in the middle.
  const UP = new THREE.Vector3(0, 1, 0), linkY = 0.22;
  const links = g.links.map((l) => {
    const a = pos.get(l.a).clone().setY(linkY), b = pos.get(l.b).clone().setY(linkY);
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 14), K.lit(0x888888, { emissive: 0x000000, emissiveIntensity: 0 }));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    world.add(mesh);
    const mid = mesh.position.clone();
    const costLabel = L.slot(world, [mid.x, 0.62, mid.z], { size: 0.52, bg: "--surface" });
    costLabel.set(String(l.cost));
    return { ...l, mesh, costLabel, state: "idle", shownCost: l.cost };
  });

  let P = {};
  const palette = () => ({
    idle: k.colour("--series-1"), done: k.colour("--good"), current: k.colour("--series-2"), changed: k.colour("--series-4"),
    link: k.colour("--muted"), tree: k.colour("--good"), path: k.colour("--accent"), hot: k.colour("--series-2"),
    lsp: k.colour("--series-7"), dv: k.colour("--series-5"), probe: k.colour("--series-2"), data: k.colour("--accent"), bad: k.colour("--bad"),
    metal: k.colour("--muted"),
  });
  const white = new THREE.Color(0xffffff);
  function paintRouter(r) {
    const c = P[r.state] ?? P.idle;
    r.body.material.color.copy(c);
    r.top.material.color.copy(c.clone().lerp(white, 0.4));
    r.rim.material.color.copy(c.clone().lerp(white, 0.15));
    r.antMat.color.copy(P.metal);
    r.tipMat.color.copy(c); r.tipMat.emissive.copy(c);
    for (const led of r.leds) led.material.color.copy(r.state === "idle" ? P.metal : c.clone().lerp(white, 0.3));
  }
  function paintLink(x, flash = false) {
    const st = x.state, c = st === "idle" ? P.link : P[st];
    x.mesh.material.color.copy(c);
    x.mesh.material.emissive.copy(st === "idle" ? new THREE.Color(0) : c);
    const target = st === "idle" ? 0 : st === "hot" ? 0.35 : 0.45, width = st === "idle" ? 1 : st === "hot" ? 1.8 : 2.3;
    if (flash && !reducedMotion()) {
      x.mesh.material.emissiveIntensity = 1.8;
      x.mesh.scale.set(width * 1.7, 1, width * 1.7);
      k.tween(x.mesh.material, { emissiveIntensity: target }, 900, ease.out);
      k.tween(x.mesh.scale, { x: width, z: width }, 900, ease.out);
    } else {
      x.mesh.material.emissiveIntensity = target;
      x.mesh.scale.set(width, 1, width);
    }
  }
  k.onTheme(() => {
    P = palette();
    fl.paint();
    for (const r of routers.values()) paintRouter(r);
    for (const x of links) paintLink(x);
    L.refresh();
  });

  // Where a packet on link a→b starts and ends (at the router rims), lifted a
  // little and nudged sideways so packets going opposite ways don't collide.
  function hop(from, to, half = false) {
    const a = pos.get(from), b = pos.get(to);
    const dir = b.clone().sub(a).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.17);
    const lift = new THREE.Vector3(0, 0.5, 0);
    const p0 = a.clone().addScaledVector(dir, 0.78).add(lift).add(side);
    const p2 = (half ? a.clone().lerp(b, 0.5) : b.clone().addScaledVector(dir, -0.82)).add(lift).add(side);
    const p1 = p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(0, 0.35 + a.distanceTo(b) * 0.04, 0));
    return [p0, p1, p2];
  }

  let gen = 0, beacon = null;
  function show(d) {
    const my = ++gen;
    clear(fx); clear(pk);
    const tree = d.tree ?? [], path = d.path ?? null, edge = d.edge ?? null;
    const onPath = (l) => path && path.some((x, i) => i && same(l, path[i - 1], x));
    for (const x of links) {
      const st = onPath(x) ? "path" : tree.some(([a, b]) => same(x, a, b)) ? "tree" : edge && same(x, edge[0], edge[1]) ? "hot" : "idle";
      const flash = st !== x.state && (st === "tree" || st === "path");
      x.state = st; paintLink(x, flash);
      const now = d.links?.find((l) => same(l, x.a, x.b))?.cost ?? x.cost;
      if (now !== x.shownCost) {
        x.shownCost = now;
        x.costLabel.set(String(now), now !== x.cost ? { bg: "--bad-soft", color: "--bad" } : {});
        if (!reducedMotion()) { const s = x.costLabel.sprite; if (s) { const sx = s.scale.x, sy = s.scale.y; s.scale.set(sx * 1.6, sy * 1.6, 1); k.tween(s.scale, { x: sx, y: sy }, 700, ease.back); } }
      }
    }
    for (const [name, r] of routers) {
      const st = name === d.current ? "current" : (d.done ?? []).includes(name) ? "done" : "idle";
      const was = r.state;
      r.state = st; paintRouter(r);
      if (st !== was && st !== "idle" && !reducedMotion()) { r.grp.scale.setScalar(1.18); k.tween(r.grp.scale, { x: 1, y: 1, z: 1 }, 500, ease.back); }
      const text = d.status?.[name];
      r.status.set(text ?? null, d.statusTone?.[name] === "good" ? { color: "--good" } : d.statusTone?.[name] === "bad" ? { color: "--bad" } : {});
    }
    // A soft column of light marks the router being visited.
    if (beacon) { world.remove(beacon); beacon.geometry.dispose(); beacon.material.dispose(); beacon = null; }
    if (d.current) {
      beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: P.current, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.copy(pos.get(d.current)).setY(1.6);
      world.add(beacon);
    }
    for (const c of d.changed ?? []) K.pulse(fx, pos.get(c), d.changedTone === "good" ? P.done : P.changed);
    // Packets on links.
    for (const m of d.packets ?? []) {
      const colour = P[m.kind] ?? P.data;
      const pkt = K.packet(colour, m.kind === "lsp" ? "cube" : "sphere", m.label ?? null);
      const pts = hop(m.from, m.to, m.half);
      pkt.position.copy(pts[0]);
      pk.add(pkt);
      if (m.kind === "lsp" && !reducedMotion()) k.tween(pkt.rotation, { y: Math.PI * 2 }, 1000);
      k.travel(pkt, pts, m.ms ?? 900);
    }
    // Duplicates being thrown away at the receiver: the copies tumble off the
    // end of the link, and one tag per router says whose copies were dropped.
    const dropped = new Map();
    for (const m of d.drops ?? []) {
      const pts = hop(m.from, m.to);
      const pkt = K.packet(P.bad, "cube");
      pkt.position.copy(pts[2]); pk.add(pkt);
      setTimeout(() => { if (my === gen) K.fall(pkt, 1.6); }, reducedMotion() ? 0 : 450);
      dropped.set(m.to, [...(dropped.get(m.to) ?? []), m.from]);
    }
    for (const [to, froms] of dropped) {
      const p = pos.get(to);
      K.tag(fx, `✗ dup from ${froms.join(", ")}`, [p.x, 2.62, p.z], { size: 0.4, bg: "--bad-soft", color: "--bad" });
    }
    // Send a packet: it loops along the whole route with a light trail.
    if (d.route?.length > 1) runRoute(d.route, my);
  }

  async function runRoute(route, my) {
    const pts = [];
    route.forEach((name, i) => {
      const p = pos.get(name).clone().setY(0.75);
      if (i) { const prev = pos.get(route[i - 1]); pts.push(prev.clone().lerp(pos.get(name), 0.5).setY(1.25)); }
      pts.push(p);
    });
    const pkt = K.packet(P.data, "sphere", "pkt");
    pkt.position.copy(pts[0]); pk.add(pkt);
    if (reducedMotion()) { pkt.position.copy(pts.at(-1)); return; }
    const tr = K.trail(pk, pkt, P.data);
    while (my === gen) {
      pkt.position.copy(pts[0]); tr.reset();
      await k.travel(pkt, pts, 950 * (route.length - 1), ease.inOut);
      if (my !== gen) break;
      K.pulse(fx, pos.get(route.at(-1)), P.done, { times: 1 });
      await k.tween({ v: 0 }, { v: 1 }, 800);
    }
    tr.stop();
  }

  return { show, dispose: () => { gen++; k.dispose(); } };
}

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

/**
 * dnsScene(box, { r, name, tld, domain }) → { show(i), dispose() }
 * r is dnsLookup()'s result; show(i) draws step i: every earlier message as a
 * numbered arc, the current one as a packet in flight, and the local cache.
 */
export async function dnsScene(box, { r, name, cache }) {
  const parts = name.split("."), tld = parts.at(-1), domain = parts.slice(-2).join(".");
  const height = stageHeight();
  const k = await scene3d(box, { height, camera: [0.3, 6, 11.2], target: [0.1, 1.1, -0.1], aria: `3D DNS lookup of ${name}: your laptop, the local DNS server, a root server, the .${tld} TLD server and ${domain}'s authoritative server.` });
  fit(k, height, 1.9);
  const { THREE } = k, K = kit3d(k), L = labelKit(k);
  const world = new THREE.Group(), fx = new THREE.Group(), pk = new THREE.Group(), arcs = new THREE.Group();
  k.scene.add(world); world.add(fx, pk, arcs);
  const fl = K.floor(14);
  world.add(fl.grid);

  // Servers higher up the hierarchy stand on taller pedestals.
  const spots = {
    host: { at: [-4.7, 0, 1.5], lift: 0, label: "Your laptop" },
    local: { at: [-2.0, 0, 0.3], lift: 0, label: "Local DNS" },
    root: { at: [0.5, 0, -2.2], lift: 1.6, label: "Root" },
    tld: { at: [2.9, 0, -0.9], lift: 0.8, label: `.${tld} TLD` },
    auth: { at: [4.7, 0, 1.3], lift: 0, label: `dns.${domain}` },
  };
  const used = new Set(r.msgs.flatMap((m) => [m.from, m.to]));
  const nodes = {};
  for (const [id, s] of Object.entries(spots)) {
    const grp = new THREE.Group();
    grp.position.set(...s.at);
    const add = (mesh) => { grp.add(mesh); return mesh; };
    let h = 0;
    if (s.lift) {
      const ped = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, s.lift, 32), K.lit(0x888888)));
      ped.position.y = s.lift / 2; ped.userData.role = "pedestal";
    }
    if (id === "host") {
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 0.85), K.lit(0x888888, { metalness: 0.4, roughness: 0.35 })));
      base.position.y = 0.035; base.userData.role = "shell";
      const lid = add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 0.05), K.lit(0x888888, { metalness: 0.4, roughness: 0.35 })));
      lid.position.set(0, 0.45, -0.42); lid.rotation.x = -0.18; lid.userData.role = "shell";
      const screen = add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.66), new THREE.MeshBasicMaterial({ color: 0x223344 })));
      screen.position.set(0, 0.45, -0.39); screen.rotation.x = -0.18; screen.userData.role = "screen";
      h = 0.95;
    } else {
      const tall = id === "local" ? 1.25 : 1.05;
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.85, tall, 0.85), K.lit(0x888888, { roughness: 0.4 })));
      box.position.y = s.lift + tall / 2; box.userData.role = "shell";
      // Drive bays / status lights on the front.
      for (let j = 0; j < 3; j++) {
        const bay = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff })));
        bay.position.set(0, s.lift + tall * (0.3 + j * 0.22), 0.43); bay.userData.role = "accent";
      }
      h = s.lift + tall;
    }
    const shade = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.005;
    grp.add(shade);
    world.add(grp);
    const title = L.slot(grp, [0, h + 0.45, 0], { size: 0.46, bg: "--surface" });
    const note = L.slot(grp, [0, h + 1.02, 0], { size: 0.4, bg: "--surface", bold: false });
    nodes[id] = { id, grp, top: new THREE.Vector3(s.at[0], h + 0.15, s.at[2]), label: s.label, title, note, used: used.has(id) };
  }
  const cacheRows = [0, 1, 2, 3].map((j) => L.slot(world, [-2.35, 3.0 + (3 - j) * 0.42, 0.3], { size: 0.36, bg: "--surface-2", bold: j === 0 }));

  let P = {};
  const palette = () => ({
    shell: k.colour("--series-1"), local: k.colour("--accent"), pedestal: k.colour("--line").lerp(k.colour("--muted"), 0.45), screen: k.colour("--accent"),
    query: k.colour("--series-1"), referral: k.colour("--series-4"), answer: k.colour("--good"), dim: k.colour("--muted"), good: k.colour("--good"),
  });
  function paint() {
    for (const nd of Object.values(nodes)) {
      nd.grp.traverse((o) => {
        if (!o.material || o.userData.role === undefined) return;
        const role = o.userData.role;
        const c = role === "pedestal" ? P.pedestal : role === "screen" ? P.screen : role === "accent" ? P.answer : nd.id === "local" ? P.local : nd.id === "host" ? P.pedestal : P.shell;
        o.material.color.copy(c);
        o.material.transparent = !nd.used;
        o.material.opacity = nd.used ? 1 : 0.28;
        o.material.needsUpdate = true;
      });
      nd.title.set(nd.label, nd.used ? {} : { color: "--muted" });
    }
  }
  k.onTheme(() => { P = palette(); fl.paint(); paint(); L.refresh(); });

  // An arc between two machines; replies bow the other way from queries.
  function arcCurve(m) {
    const a = nodes[m.from].top, b = nodes[m.to].top;
    const dir = b.clone().sub(a), flat = dir.clone().setY(0).normalize();
    // Queries arc high on one side, replies low on the other.
    const reply = m.cls !== "query";
    const side = new THREE.Vector3(-flat.z, 0, flat.x).multiplyScalar((m.from < m.to ? 1 : -1) * 0.55);
    const mid = a.clone().lerp(b, 0.5).add(side).add(new THREE.Vector3(0, (reply ? 0.35 : 1.3) + dir.length() * 0.1, 0));
    return new THREE.QuadraticBezierCurve3(a.clone().add(side.clone().multiplyScalar(0.4)), mid, b.clone().add(side.clone().multiplyScalar(0.4)));
  }
  const shortLabel = (m) => m.cls === "query" ? (m.label.includes("recursive") ? "query (recursive)" : "query") : m.cls === "referral" ? (m.label.startsWith("refer: .") ? `→ ask .${tld} TLD` : `→ ask dns.${domain}`) : m.label;

  let gen = 0;
  function show(i) {
    const my = ++gen;
    clear(fx); clear(pk); clear(arcs);
    const step = r.steps[i];
    for (const m of r.msgs) {
      if (m.step > i) continue;
      const curve = arcCurve(m), colour = P[m.cls] ?? P.query, now = m.step === i;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, now ? 0.035 : 0.025, 8), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: now ? 0.75 : 0.45, depthWrite: false }));
      arcs.add(tube);
      // The message number, on the arc's peak: reading 1, 2, 3… shows the pattern.
      const top = curve.getPoint(0.5);
      K.tag(arcs, String(r.msgs.indexOf(m) + 1), [top.x, top.y + 0.22, top.z], { size: 0.36, color: "--surface", bg: m.cls === "answer" ? "--good" : m.cls === "referral" ? "--series-4" : "--series-1" });
      if (now) {
        const pkt = K.packet(colour, "envelope", shortLabel(m));
        pkt.position.copy(curve.getPoint(0)); pk.add(pkt);
        const pts = Array.from({ length: 12 }, (_, j) => curve.getPoint(j / 11));
        k.travel(pkt, pts, 1000).then(() => { if (my === gen) K.pulse(fx, nodes[m.to].grp.position, colour, { times: 1, r: 0.9 }); });
      }
    }
    // Notes over the machines: cache hits, skipped servers, the final answer.
    const cur = r.msgs.find((m) => m.step === i);
    for (const nd of Object.values(nodes)) nd.note.set(null);
    if (!nodes.root.used && cache === "tld") nodes.root.note.set(`skipped: .${tld} servers cached`, { color: "--muted" });
    if (cache !== "none" && cur && cur.from === "local" && (cur.to === "host" && cache === "answer" || cur.to === "tld" && cache === "tld")) {
      nodes.local.note.set("✓ cache hit", { color: "--good", bg: "--good-soft" });
      K.pulse(fx, nodes.local.grp.position, P.good, { times: 3, r: 1 });
    }
    if (i === r.steps.length - 1 && cur?.to === "host") nodes.host.note.set(`✓ ${r.ip}`, { color: "--good", bg: "--good-soft" });
    // The local server's cache, listed above it.
    const recs = step.vars.cache ?? [];
    cacheRows[0].set(recs.length ? "cache" : "cache: empty", { color: "--muted" });
    for (let j = 1; j < 4; j++) cacheRows[j].set(recs[j - 1] ?? null);
  }

  return { show, dispose: () => { gen++; k.dispose(); } };
}

// ---------------------------------------------------------------------------
// Sliding window
// ---------------------------------------------------------------------------

/**
 * slidingScene(box, r) → { show(i), dispose() }
 * r is simulate()'s result. Sender stack on the left, receiver stack on the
 * right, one slot per frame; frames fly across a glass channel at their own
 * height, ACKs come back behind them, lost ones drop out of the channel.
 */
export async function slidingScene(box, r) {
  const F = r.frames, gap = F > 10 ? 0.42 : 0.52, H = F * gap;
  const SX = -3.6, RX = 3.6, baseY = 0.5;
  const yOf = (k) => baseY + (F - 1 - Math.min(Math.max(k, 0), F - 1)) * gap; // frame 0 on top
  const midY = baseY + (H - gap) / 2;
  const height = stageHeight();
  const dist = Math.max(8.6, H * 1.35 + 4.6);
  const k = await scene3d(box, { height, camera: [0.5, midY + dist * 0.3, dist], target: [0, midY, 0], aria: `3D sliding window: ${F} frames, sender on the left, receiver on the right.` });
  fit(k, height, 1.7);
  const { THREE } = k, K = kit3d(k), L = labelKit(k);
  const world = new THREE.Group(), fx = new THREE.Group(), pk = new THREE.Group();
  k.scene.add(world); world.add(fx, pk);
  const fl = K.floor(12);
  world.add(fl.grid);

  // The channel: a glass slab between the stacks.
  const chanLen = RX - SX - 1.6;
  const chan = new THREE.Mesh(new THREE.BoxGeometry(chanLen, H + 0.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.08, roughness: 0.1, depthWrite: false }));
  chan.position.set((SX + RX) / 2, midY, 0);
  const chanEdges = new THREE.LineSegments(new THREE.EdgesGeometry(chan.geometry), new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.45 }));
  chanEdges.position.copy(chan.position);
  world.add(chan, chanEdges);

  const slotGeo = shared(new THREE.BoxGeometry(1.15, gap * 0.74, 0.7));
  const mkStack = (x, side) => Array.from({ length: F }, (_, n) => {
    const m = new THREE.Mesh(slotGeo, K.lit(0x888888, { roughness: 0.45, transparent: true }));
    m.position.set(x, yOf(n), 0);
    world.add(m);
    const lab = L.slot(world, [x + (side < 0 ? -0.95 : 0.95), yOf(n), 0.2], { size: Math.min(0.34, gap * 0.7), color: "--text" });
    lab.set(String(n));
    return { m, lab, state: "out" };
  });
  const send = mkStack(SX, -1), recv = mkStack(RX, 1);
  L.slot(world, [SX, yOf(0) + 0.75, 0], { size: 0.46, bg: "--surface" }).set(r.protocol === "sw" ? "Sender" : `Sender · window ${r.W}`);
  L.slot(world, [RX, yOf(0) + 0.75, 0], { size: 0.46, bg: "--surface" }).set("Receiver");

  // Window brackets: wireframe boxes that slide down the stacks.
  const mkWin = (x) => {
    const geo = new THREE.BoxGeometry(1.45, 1, 1.0);
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x888888 }));
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.1, depthWrite: false }));
    const g = new THREE.Group(); g.add(w, fill); g.position.x = x; world.add(g);
    return { g, w, fill, cur: null };
  };
  const sWin = mkWin(SX), rWin = mkWin(RX);

  let P = {};
  const palette = () => ({
    acked: k.colour("--good"), sent: k.colour("--series-4"), usable: k.colour("--surface").lerp(k.colour("--accent"), 0.3), out: k.colour("--muted"),
    frame: k.colour("--series-1"), ack: k.colour("--series-3"), bad: k.colour("--bad"), accent: k.colour("--accent"), glass: k.colour("--accent"),
  });
  const paintSlot = (s) => {
    s.m.material.color.copy(P[s.state]);
    s.m.material.opacity = s.state === "out" ? 0.35 : 1;
  };
  k.onTheme(() => {
    P = palette(); fl.paint();
    chan.material.color.copy(P.glass); chanEdges.material.color.copy(P.glass);
    for (const w of [sWin, rWin]) { w.w.material.color.copy(P.accent); w.fill.material.color.copy(P.accent); }
    for (const s of [...send, ...recv]) paintSlot(s);
    L.refresh();
  });

  function placeWin(w, from, size) {
    const lo = Math.max(0, from), hi = Math.min(F - 1, from + size - 1);
    w.g.visible = lo <= hi;
    if (!w.g.visible) return;
    const top = yOf(lo) + gap / 2, bottom = yOf(hi) - gap / 2;
    const to = { y: (top + bottom) / 2 }, sc = { y: top - bottom };
    if (w.cur === null) { w.g.position.y = to.y; w.g.scale.y = sc.y; } else { k.tween(w.g.position, to, 500); k.tween(w.g.scale, sc, 500); }
    w.cur = from;
  }

  let gen = 0;
  function show(i) {
    const my = ++gen;
    clear(fx); clear(pk);
    const tick = r.ticks[i], t = tick.t;
    for (let n = 0; n < F; n++) {
      const acked = r.protocol === "sr" ? tick.acked.includes(n) || n < tick.base : n < tick.base;
      const inWin = n >= tick.base && n < tick.base + r.W;
      const sent = n < tick.next || (r.protocol === "sr" && r.sends.some((s) => s.kind === "F" && s.n === n && s.sent <= t));
      send[n].state = acked ? "acked" : inWin ? (sent ? "sent" : "usable") : "out";
      recv[n].state = n < tick.expected ? "acked" : tick.buffer.includes(n) ? "sent" : n < tick.expected + (r.protocol === "sr" ? r.W : 1) ? "usable" : "out";
      paintSlot(send[n]); paintSlot(recv[n]);
    }
    placeWin(sWin, tick.base, r.W);
    placeWin(rWin, tick.expected, r.protocol === "sr" ? r.W : 1);
    // Everything on the wire glides to where it will be one tick later.
    const x0 = SX + 0.8, x1 = RX - 0.8;
    for (const s of r.sends) {
      if (s.sent > t) continue;
      const isF = s.kind === "F";
      const xAt = (f) => (isF ? x0 + (x1 - x0) * f : x1 - (x1 - x0) * f);
      const y = yOf(s.n) + (isF ? 0 : -gap * 0.12), z = isF ? 0.22 : -0.25;
      if (s.arrive === t && !s.lost && isF && s.result) {
        K.tag(fx, s.result, [RX + 1.05, yOf(s.n), 0.5], { size: Math.min(0.3, gap * 0.6), bg: s.result === "discarded" ? "--bad-soft" : "--good-soft", color: s.result === "discarded" ? "--bad" : "--good" });
        K.pulse(fx, new THREE.Vector3(RX, yOf(s.n) - gap * 0.37, 0), s.result === "discarded" ? P.bad : P.acked, { times: 1, r: 0.7, y: 0 });
      }
      if (t - s.sent >= r.delay) continue;
      const cap = s.lost ? 0.5 : 1, f0 = (t - s.sent) / r.delay, f1 = Math.min(cap, (t + 1 - s.sent) / r.delay);
      if (f0 >= cap) continue;
      const label = `${isF ? "F" : "A"}${s.n}${s.attempt > 1 ? "′".repeat(Math.min(s.attempt - 1, 2)) : ""}`;
      const colour = s.lost && f1 >= cap ? P.bad : isF ? P.frame : P.ack;
      const pkt = K.packet(colour, isF ? "cube" : "envelope", label);
      pkt.scale.setScalar(isF ? 1.35 : 1.1);
      pkt.position.set(xAt(f0), y, z);
      pk.add(pkt);
      const done = k.tween(pkt.position, { x: xAt(f1) }, 650, ease.inOut);
      if (s.lost && f1 >= cap) {
        const mx = xAt(0.5);
        K.tag(fx, `✗ ${isF ? "frame" : "ACK"} ${s.n} lost`, [mx, y + 0.55, z], { size: 0.3, bg: "--bad-soft", color: "--bad" });
        done.then(() => { if (my === gen) K.fall(pkt, yOf(s.n) + 1.2); });
      }
    }
  }

  return { show, dispose: () => { gen++; k.dispose(); } };
}
