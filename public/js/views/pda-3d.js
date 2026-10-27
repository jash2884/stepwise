// 3D view for pushdown automata: the stack as a pile of blocks (pushes drop in
// from above, pops lift off and fly away), the input tape beside it with the
// read head, and the current state as a glowing node. Sibling configurations
// (the other guesses from the same parent) stand behind as faded stacks.
// Loaded only when the 3D view is chosen.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const SHOWN = 10, PITCH = 0.46, BLOCK = { w: 1.5, h: 0.4, d: 1.0 }, SX = -1.7;
const TW = 0.7, TX = 0.6;

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}

export async function pdaScene(host, { res, pda, tokens, height }) {
  const path = res.path.map((id) => res.configs[id]);
  const n = path.length, EPS = "ε";
  // The well is as tall as the tallest stack on this branch (at least four slots).
  const slots = Math.max(4, Math.min(SHOWN, Math.max(...path.map((c) => c.stack.length)) + 1));
  const wellH = slots * PITCH + 0.3, NODE = { x: 2.6, y: Math.max(2.1, wellH * 0.62) };
  // A narrow stage shows five input cells at a time, a wide one seven.
  const WINDOW = Math.min(tokens.length + 1, (host.clientWidth || 640) / height < 1.4 ? 5 : 7);
  const xMin = SX - 1.1, xMax = Math.max(NODE.x + 0.6, TX + WINDOW * TW);
  const fov = 40, target = [(xMin + xMax) / 2, Math.max(1.1, (wellH + 0.4) / 2), 0];
  const tan = 2 * Math.tan((fov * Math.PI) / 360);
  const fit = (w) => Math.max((xMax - xMin + 0.5) / (tan * (w / height)), (wellH + 3.4) / tan) * 1.05;
  const dir = [0.05, 0.42, 1], len = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov,
    camera: dir.map((v, i) => target[i] + (v / len) * fit(host.clientWidth || 640)),
    aria: "3D pushdown automaton: the stack of blocks, the input tape with its read head, and the current state",
  });
  const { THREE, scene, label, colour } = s;

  const hud = h("div", { class: "d3-hud", "aria-hidden": "true" });
  const legend = h("div", { class: "d3-legend", "aria-hidden": "true" },
    h("span", { class: "k toc-push" }, "one colour per stack symbol"), h("span", { class: "k toc-ghost" }, "other guesses"));
  s.el.classList.add("toc3d");
  s.el.append(hud, legend, h("div", { class: "three-hint" }, "Drag to orbit"));

  const syms = [...new Set([pda.bottom, ...pda.stackSyms ?? []])];
  const symColour = (sym) => (sym === pda.bottom ? colour("--muted").lerp(colour("--surface"), 0.4) : colour(`--series-${1 + ((Math.max(0, syms.indexOf(sym)) + 3) % 4)}`));

  let world = null, mats = null, blocks = new Map(), ghosts = null, tape = null, tapeCells = [], readHead = null, node = null, ring = null, halo = null, stateTag = null, more = null, topTag = null;
  let cur = -1, slide = { x: 0 }, tint = "--accent";
  const blockGeo = new THREE.BoxGeometry(BLOCK.w, BLOCK.h, BLOCK.d), blockEdges = new THREE.EdgesGeometry(blockGeo);
  const slotY = (b) => 0.1 + BLOCK.h / 2 + b * PITCH;

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    blocks = new Map();
    const C = (k) => colour(k);
    mats = {
      base: new THREE.MeshStandardMaterial({ color: C("--muted").lerp(C("--surface"), 0.35), metalness: 0.3, roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: C("--accent"), transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
      post: new THREE.MeshStandardMaterial({ color: C("--muted"), metalness: 0.4, roughness: 0.45 }),
      cell: new THREE.MeshStandardMaterial({ color: C("--surface"), roughness: 0.6 }),
      used: new THREE.MeshStandardMaterial({ color: C("--surface-2"), roughness: 0.8 }),
      edge: new THREE.LineBasicMaterial({ color: C("--line") }),
      glow: new THREE.MeshStandardMaterial({ color: C("--accent"), emissive: C("--accent"), emissiveIntensity: 0.9 }),
      halo: new THREE.MeshBasicMaterial({ color: C("--accent"), transparent: true, opacity: 0.2, depthWrite: false }),
    };
    // The stack's well: a base plate, a faint glass back and two posts.
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 1.5), mats.base);
    base.position.set(SX, 0.05, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.1, wellH), mats.glass);
    back.position.set(SX, wellH / 2 + 0.1, -0.72);
    world.add(base, back);
    for (const x of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, wellH, 10), mats.post);
      p.position.set(SX + x * 0.95, wellH / 2 + 0.1, -0.68);
      world.add(p);
    }
    const cap = label("stack", { size: 0.32, color: "--muted", bold: false });
    cap.position.set(SX, -0.25, 0.9);
    world.add(cap);

    // The input tape, one cell per token plus an end marker, sliding when it's long.
    tape = new THREE.Group();
    world.add(tape);
    const cg = new THREE.BoxGeometry(TW * 0.94, 0.14, 0.9), ce = new THREE.EdgesGeometry(cg);
    tapeCells = [...tokens, "⊣"].map((t, k) => {
      const g = new THREE.Group();
      g.position.set(TX + k * TW, 0.07, 0.3);
      const box = new THREE.Mesh(cg, mats.cell);
      g.add(box, new THREE.LineSegments(ce, mats.edge));
      const tag = label(t, { size: t.length > 2 ? 0.26 : 0.38, color: k === tokens.length ? "--muted" : "--text" });
      tag.position.set(0, 0.32, 0.12);
      g.add(tag);
      g.userData = { box, tag };
      tape.add(g);
      return g;
    });
    const tcap = label("input", { size: 0.32, color: "--muted", bold: false });
    tcap.position.set(TX + 1.2, -0.25, 1.15);
    world.add(tcap);
    readHead = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 24), mats.glow);
    readHead.rotation.x = Math.PI;
    readHead.position.set(0, 0.72, 0.3);
    world.add(readHead);

    // The state: a small glowing state-diagram node with a ring.
    node = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 20), mats.glow);
    ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 12, 48), mats.glow);
    halo = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 16), mats.halo);
    for (const o of [node, ring, halo]) { o.position.set(NODE.x, NODE.y, 0); world.add(o); }
    ghosts = null; stateTag = null; more = null; topTag = null;
    tint = "--accent";
  }

  // Remove a block or ghost group, keeping the shared geometry and edge material.
  const shared = new Set([blockGeo, blockEdges]);
  const drop = (o) => {
    o.traverse((x) => { if (!shared.has(x.geometry) && !x.isSprite) x.geometry?.dispose?.(); for (const m of [x.material].flat()) if (m && m !== mats.edge) { m.map?.dispose?.(); m.dispose(); } });
    o.removeFromParent();
  };

  function makeBlock(sym) {
    const mat = new THREE.MeshStandardMaterial({ color: symColour(sym), roughness: 0.45, metalness: 0.1, transparent: true, opacity: 1 });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(blockGeo, mat), new THREE.LineSegments(blockEdges, mats.edge));
    const tag = label(sym, { size: 0.3, color: "--text", bg: "--surface" });
    tag.position.set(0, 0, BLOCK.d / 2 + 0.05);
    g.add(tag);
    g.userData.mat = mat;
    return g;
  }
  const fade = (g, o) => g.traverse((x) => { for (const m of [x.material].flat()) if (m && m !== mats.edge) { m.transparent = true; m.opacity = o; } });

  function setTint(name) {
    if (tint === name) return;
    tint = name;
    const c = colour(name);
    mats.glow.color.copy(c); mats.glow.emissive.copy(c); mats.halo.color.copy(c);
  }

  function drawGhosts(c) {
    if (ghosts) drop(ghosts);
    ghosts = new THREE.Group();
    world.add(ghosts);
    if (c.parent == null) return;
    const sibs = res.configs[c.parent].kids.filter((k) => k !== c.id).slice(0, 3).map((k) => res.configs[k]);
    sibs.forEach((sc, k) => {
      const g = new THREE.Group();
      g.position.set(SX + 2.0 + k * 1.75, 0, -2.6);
      g.scale.setScalar(0.7);
      const items = sc.stack.slice(0, SHOWN);
      items.forEach((it, i) => { const b = makeBlock(it.s); b.position.y = slotY(items.length - 1 - i); fade(b, 0.3); g.add(b); });
      const tag = label(`${sc.state} · other guess`, { size: 0.5, color: "--muted", bold: false });
      tag.position.y = slotY(items.length) + 0.3;
      g.add(tag);
      ghosts.add(g);
    });
  }

  function layout(c, animate) {
    const items = c.stack.slice(0, SHOWN), keep = new Set(items.map((it) => it.u));
    // Popped (or pushed out of view): lift off and fly away.
    let popped = 0;
    for (const [u, b] of blocks) {
      if (keep.has(u)) continue;
      blocks.delete(u);
      const wasTop = c.stack.every((it) => it.u !== u);
      if (animate && wasTop && !reducedMotion()) {
        popped++;
        const y0 = b.position.y, f = { k: 0 };
        s.tween(f, { k: 1 }, 650, ease.inOut).then(() => drop(b));
        b.userData.fly = { f, y0 };
      } else drop(b);
    }
    items.forEach((it, i) => {
      const y = slotY(items.length - 1 - i);
      let b = blocks.get(it.u);
      if (!b) {
        b = makeBlock(it.s);
        b.position.set(SX, y, 0);
        world.add(b);
        blocks.set(it.u, b);
        if (animate && !reducedMotion()) {
          b.position.y = y + 2.4;
          fade(b, 0);
          const delay = popped ? 260 : 0;
          setTimeout(() => { if (b.parent) { fade(b, 1); s.tween(b.position, { y }, 520, ease.out); } }, delay);
          b.userData.pushed = true;
        }
      } else if (Math.abs(b.position.y - y) > 1e-3) {
        if (animate) s.tween(b.position, { y }, 420, ease.inOut); else b.position.y = y;
      }
    });
    // "top" marker and "+ k more below".
    if (topTag) disposeTree(topTag);
    topTag = label(items.length ? "← top" : "empty", { size: 0.3, color: "--muted", bold: false });
    topTag.center.set(0, 0.5);
    topTag.position.set(items.length ? SX + BLOCK.w / 2 + 0.12 : SX - 0.35, items.length ? slotY(items.length - 1) : slotY(0), 0.2);
    world.add(topTag);
    if (more) disposeTree(more);
    more = null;
    if (c.stack.length > SHOWN) {
      more = label(`+ ${c.stack.length - SHOWN} more below`, { size: 0.28, color: "--muted", bold: false });
      more.position.set(SX, -0.55, 0.9);
      world.add(more);
    }
  }

  function show(j, instant = false) {
    j = Math.max(0, Math.min(n - 1, j));
    const c = path[j], step = j === cur + 1 && !instant, last = j === n - 1;
    layout(c, step);
    // Input: read cells go grey, the head hovers over the next symbol.
    tapeCells.forEach((g, k) => { g.userData.box.material = k < c.pos ? mats.used : mats.cell; fade(g.userData.tag, k < c.pos ? 0.4 : 1); });
    const off = tokens.length + 1 > WINDOW ? Math.max(0, Math.min(c.pos - Math.floor(WINDOW / 2), tokens.length + 1 - WINDOW)) * TW : 0;
    if (step) s.tween(slide, { x: -off }, 420, ease.out); else slide.x = -off;
    drawGhosts(c);
    setTint(last ? (res.accepted ? "--good" : "--bad") : "--accent");
    if (stateTag) disposeTree(stateTag);
    stateTag = label(c.state, { size: 0.5, bg: tint, color: "--surface" });
    stateTag.position.set(NODE.x, NODE.y + 0.78, 0);
    world.add(stateTag);
    cur = j;
    const t = c.via;
    const move = t ? `${t.input}, ${t.pop}/${t.push.length ? t.push.join("") : EPS}` : "start";
    const verdict = last ? (res.accepted ? "accepted" : res.verdict === "limit" ? "undecided" : "rejected") : null;
    hud.replaceChildren(h("span", null, "State ", h("b", null, c.state)), h("span", null, "Move ", h("b", null, move)), h("span", null, "Stack ", h("b", null, c.stack.length)),
      ...(verdict ? [h("span", { class: `toc-verdict ${res.accepted ? "accept" : "reject"}` }, h("b", null, verdict))] : []));
    s.render();
  }

  let t0 = 0;
  s.onFrame((dt) => {
    if (!tape) return;
    tape.position.x = slide.x;
    const hx = TX + Math.min(cur >= 0 ? path[cur].pos : 0, tokens.length) * TW + slide.x;
    readHead.position.x += (hx - readHead.position.x) * (reducedMotion() ? 1 : Math.min(1, dt * 10));
    // Cells outside the window fade out.
    tapeCells.forEach((g) => { const x = g.position.x + slide.x; g.visible = x > TX - TW * 0.6 && x < TX + (WINDOW - 0.4) * TW; });
    world.traverse((o) => {
      const fly = o.userData?.fly;
      if (!fly) return;
      const k = fly.f.k;
      o.position.set(SX + Math.max(0, k - 0.35) * 5, fly.y0 + Math.min(k, 0.5) * 3.2, Math.max(0, k - 0.35) * -1.5);
      o.rotation.z = -Math.max(0, k - 0.3) * 1.2;
      fade(o, 1 - Math.max(0, k - 0.55) / 0.45);
    });
    if (!reducedMotion()) {
      t0 += dt;
      ring.rotation.x = Math.PI / 2 + Math.sin(t0 * 1.3) * 0.35;
      ring.rotation.y += dt * 0.9;
      halo.scale.setScalar(1 + Math.sin(t0 * 2.4) * 0.08);
    } else ring.rotation.x = Math.PI / 2;
  });

  s.onTheme(() => { const at = cur; build(); cur = -1; show(Math.max(0, at), true); });
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  return { show, dispose: () => { ro.disconnect(); blockGeo.dispose(); blockEdges.dispose(); s.dispose(); } };
}
