// 3D view for address translation: CPU → TLB → page table(s) → RAM frames,
// with the disk below for page faults (or segment table → memory). The logical
// address is a block that splits into its fields; the pieces travel to each
// structure the MMU reads. Loaded only when the 3D view is chosen.
import { ease, scene3d } from "../three-kit.js";
import { h, reducedMotion } from "../ui.js";

const TOP = 3.6, DEPTH = 0.5;
const COL = { page: ["--series-1", "--series-7", "--series-2"], off: "--series-3", frame: "--series-4" };

function disposeTree(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); for (const m of [x.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); } });
  o.removeFromParent();
}
const windowStart = (total, centre, size) => (total <= size ? 0 : Math.max(0, Math.min(total - size, centre - Math.floor(size / 2))));

export async function translationScene(host, { mode, res, cfg, height }) {
  // --- Layout per scheme ----------------------------------------------------
  // Phones get a tighter layout so the parts stay readable in a narrow stage.
  const compact = (host.clientWidth || 640) < 560;
  const L = { cpu: compact ? -5.3 : -6.6, slotY: 2.75 };
  if (mode === "paging") {
    const pages = 2 ** res.pageBits;
    const valid = cfg.pageTable.filter((e) => e.valid).map((e) => e.frame);
    Object.assign(L, { tlb: compact ? -2.45 : -3.1, pt: compact ? 0.15 : 0.6, ram: compact ? 3.1 : 4.7, disk: [compact ? 1.6 : 2.65, -2.85], w: compact ? 2.0 : 2.1, ramW: compact ? 2.2 : 2.5,
      ptRows: Math.min(16, pages), frames: Math.max(0, ...valid) + 1 });
    L.ptH = Math.min(0.42, 5.4 / L.ptRows);
    L.ramRows = Math.min(10, L.frames);
    L.ramH = Math.min(0.5, 4.6 / L.ramRows);
  } else if (mode === "multilevel") {
    const lv = res.levels;
    const frames = [...new Set(cfg.mappings.map((m) => m.frame))].sort((a, b) => a - b);
    Object.assign(L, { cols: Array.from({ length: lv }, (_, i) => (lv === 1 ? -1.2 : compact ? -2.7 + (i * 3.1) / (lv - 1) : -3.4 + (i * 4.6) / (lv - 1))),
      colW: lv === 1 ? 2.3 : lv === 2 ? 2.1 : compact ? 1.45 : 1.7, ram: compact ? 3.1 : 4.7, ramW: compact ? 2.2 : 2.5, disk: [compact ? 1.6 : 2.65, -2.85], frames: frames.length ? frames : [0] });
    L.ramRows = Math.min(10, L.frames.length);
    L.ramH = Math.min(0.5, 4.6 / L.ramRows);
  } else {
    const segs = cfg.segments;
    Object.assign(L, { cpu: compact ? -5.0 : -6.2, seg: compact ? -1.5 : -1.8, segW: 3.0, ram: compact ? 2.5 : 3.6, ramW: 1.7, ramTop: TOP, ramBot: -2.6 });
    L.segH = Math.min(0.42, 5 / Math.max(1, segs.length));
    const end = Math.max(...segs.map((s) => s.base + s.limit), 1);
    L.memMax = Math.ceil((end * 1.08) / 100) * 100;
  }

  // The disk sits just below the tallest stack.
  let bottom = L.ramBot ?? TOP - Math.max(L.ramRows * L.ramH, mode === "paging" ? Math.max(L.ptRows * L.ptH, cfg.tlbSize * 0.42) : 5 * 0.42);
  if (L.disk) { L.disk[1] = Math.min(bottom - 1.0, 0.2); bottom = L.disk[1] - 0.5; }
  // Fit the default camera to the content, whatever the stage's aspect.
  const bounds = { x: compact ? (mode === "segmentation" ? [-6.0, 5.0] : [-6.4, 5.2]) : mode === "segmentation" ? [-7.4, 6.4] : [mode === "multilevel" ? -8.2 : -7.8, 7.0], y: [Math.min(bottom, -0.2) - 0.3, TOP + 0.9] };
  const fov = 40, t = Math.tan((fov * Math.PI) / 360);
  const cw = (bounds.x[1] - bounds.x[0]) / 2, ch = (bounds.y[1] - bounds.y[0]) / 2;
  const fit = (w) => Math.max(cw / (t * (w / height)), ch / t) * 1.06 + 0.6;
  const dist = fit(host.clientWidth || 640);
  const target = [(bounds.x[0] + bounds.x[1]) / 2, (bounds.y[0] + bounds.y[1]) / 2, 0];
  const dir = [0.2, 0.32, 1], dl = Math.hypot(...dir);
  const s = await scene3d(host, {
    height, target, fov, camera: dir.map((v, i) => target[i] + (v / dl) * dist),
    aria: "3D memory hierarchy: CPU, TLB, page tables, RAM frames and disk, with the address travelling between them",
  });
  const { THREE, scene, label, colour } = s;
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  const legendItems = mode === "paging" ? [["page p", COL.page[0]], ["offset d", COL.off], ["frame f", COL.frame]]
    : mode === "multilevel" ? [...Array.from({ length: res.levels }, (_, i) => [`p${i + 1}`, COL.page[i % 3]]), ["offset d", COL.off], ["frame", COL.frame]]
      : [["segment s", COL.page[0]], ["offset d", COL.off]];
  s.el.append(h("div", { class: "d3-legend", "aria-hidden": "true" }, legendItems.map(([t, c]) => h("span", { class: "k", style: `--c:var(${c})` }, t))),
    h("div", { class: "three-hint" }, "Drag to orbit"));

  // --- Static housings (rebuilt on theme change) ---------------------------------
  let world = null, dyn = null, glow = [];
  const C = (n) => colour(n);
  const rowBase = () => C("--surface").lerp(C("--line"), 0.55);
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...extra });
  const box = (w, hh, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
  // Labels draw on top so a camera-facing sprite never sinks into its box.
  const text = (str, size, opts = {}) => { const l = label(str, { size, ...opts }); l.material.depthTest = false; l.renderOrder = 10; return l; };
  let cpuMat, diskMat, tlbCasing;

  function casing(x, w, top, hh, title) {
    const m = mat(C("--line").lerp(C("--surface-2"), 0.2));
    const b = box(w + 0.3, hh + 0.3, 0.16, m);
    b.position.set(x, top - hh / 2, -DEPTH / 2 - 0.1);
    const tag = text(title, 0.42);
    tag.position.set(x, top + 0.42, 0);
    world.add(b, tag);
    return m;
  }

  function build() {
    if (world) disposeTree(world);
    world = new THREE.Group();
    scene.add(world);
    cpuMat = mat(C("--accent").lerp(C("--surface"), 0.35));
    const cpu = box(1.5, 1.3, 1.1, cpuMat);
    cpu.position.set(L.cpu, 0.9, 0);
    const pins = box(1.7, 0.08, 1.3, mat(C("--muted")));
    pins.position.set(L.cpu, 0.22, 0);
    const cpuTag = text("CPU", 0.46, { color: "--surface" });
    cpuTag.position.set(L.cpu, 0.9, 0.6);
    world.add(cpu, pins, cpuTag);
    if (mode !== "segmentation") {
      diskMat = mat(C("--muted").lerp(C("--surface"), 0.3), { metalness: 0.5, roughness: 0.3 });
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.42, 48), diskMat);
      disk.position.set(L.disk[0], L.disk[1], 0);
      const dt = text("Disk (swap)", 0.36, { color: "--muted" });
      dt.position.set(L.disk[0] + 1.25, L.disk[1] - 0.1, 0.8);
      dt.center.set(0, 0.5);
      world.add(disk, dt);
    }
    if (mode === "paging") {
      tlbCasing = casing(L.tlb, L.w, TOP, cfg.tlbSize * 0.42, `TLB (${cfg.tlbSize})`);
      casing(L.pt, L.w, TOP, L.ptRows * L.ptH, "Page table");
      casing(L.ram, L.ramW, TOP, L.ramRows * L.ramH, "RAM frames");
    } else if (mode === "multilevel") {
      L.cols.forEach((x, i) => casing(x, L.colW, TOP, 5 * 0.42, `Level ${i + 1}`));
      casing(L.ram, L.ramW, TOP, L.ramRows * L.ramH, "RAM frames");
    } else {
      casing(L.seg, L.segW, TOP, cfg.segments.length * L.segH, "Segment table");
      casing(L.ram, L.ramW, L.ramTop, L.ramTop - L.ramBot, "Physical memory");
      const y = (a) => L.ramTop - (Math.min(a, L.memMax) / L.memMax) * (L.ramTop - L.ramBot);
      cfg.segments.forEach((sg, i) => {
        const y0 = y(sg.base), y1 = y(sg.base + sg.limit), hh = Math.max(0.03, y0 - y1);
        const b = box(L.ramW, hh, DEPTH, mat(C(`--series-${(i % 8) + 1}`), { transparent: true, opacity: 0.8 }));
        b.position.set(L.ram, (y0 + y1) / 2, 0);
        b.userData.seg = i;
        world.add(b);
        if (hh > 0.26) { const tg = text(`seg ${i}`, 0.22, { color: "--surface" }); tg.position.set(L.ram, (y0 + y1) / 2, DEPTH / 2 + 0.05); world.add(tg); }
        const bt = text(sg.base, 0.2, { color: "--muted", bold: false });
        bt.position.set(L.ram - L.ramW / 2 - 0.35, y0, 0);
        world.add(bt);
      });
      const end = text(L.memMax, 0.2, { color: "--muted", bold: false });
      end.position.set(L.ram - L.ramW / 2 - 0.35, L.ramBot, 0);
      world.add(end);
    }
    pieces.forEach((p) => p.recolour());
  }

  // --- Moving pieces of the address ---------------------------------------------
  const pieces = new Map();
  function piece(name, col) {
    const m = mat(C(col));
    const mesh = box(0.62, 0.38, 0.38, m);
    mesh.position.copy(V(L.cpu, L.slotY));
    scene.add(mesh);
    const p = { mesh, col, tag: null, text: null, ghost: { position: mesh.position.clone() } };
    p.recolour = () => { m.color.copy(C(p.col)); m.emissive.copy(C(p.col)); m.emissiveIntensity = 0.25; if (p.text != null) p.setText(p.text, true); };
    p.setText = (str, force = false) => {
      if (str === p.text && !force) return;
      p.text = str;
      if (p.tag) disposeTree(p.tag);
      p.tag = null;
      if (str) { p.tag = text(str, 0.34, { bg: "--surface", color: "--text" }); p.tag.position.y = 0.46; mesh.add(p.tag); }
    };
    pieces.set(name, p);
    return p;
  }
  const pageNames = mode === "paging" ? ["p"] : mode === "multilevel" ? Array.from({ length: res.levels }, (_, i) => `p${i}`) : ["s"];
  pageNames.forEach((n, i) => piece(n, COL.page[i % 3]));
  piece("d", COL.off);
  if (mode !== "segmentation") piece("f", COL.frame);

  const slot = (i, count, gap) => V(L.cpu + (i - (count - 1) / 2) * gap, L.slotY, 0.2);
  function moveTo(p, to, animate, via = null, ms = 750) {
    const from = p.mesh.position.clone();
    if (!animate || from.distanceTo(to) < 0.01) { p.ghost = { position: to.clone() }; return; }
    const mid = from.clone().lerp(to, 0.5).add(V(0, 0.9, 0.7));
    const ghost = { position: from.clone() };
    p.ghost = ghost;
    const pts = [from, ...(via ?? [mid]), to].filter((q, k, all) => k === 0 || q.distanceTo(all[k - 1]) > 0.02);
    if (pts.length < 2) { p.ghost = { position: to.clone() }; return; }
    // Clamp: the first frame's timestamp can precede the tween's start (k < 0).
    s.travel(ghost, pts, via ? ms * 1.5 : ms, (k) => ease.inOut(Math.min(1, Math.max(0, k))));
  }

  // --- One step ------------------------------------------------------------------
  let cur = -1;
  const steps = res.steps;
  function show(i, instant = false) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[i], prev = steps[i - 1];
    const animate = !instant && i === cur + 1 && prev && prev.k === st.k && !reducedMotion();
    cur = i;
    if (dyn) disposeTree(dyn);
    dyn = new THREE.Group();
    scene.add(dyn);
    glow = [];
    const tint = (kind) => {
      const m = kind === "base" ? mat(rowBase()) : kind === "invalid" ? mat(rowBase(), { transparent: true, opacity: 0.4 })
        : mat(C(kind === "good" ? "--good" : kind === "bad" ? "--bad" : kind === "frame" ? COL.frame : "--accent"), { emissive: C(kind === "good" ? "--good" : kind === "bad" ? "--bad" : kind === "frame" ? COL.frame : "--accent") });
      if (kind !== "base" && kind !== "invalid") glow.push(m);
      return m;
    };
    const row = (x, y, w, hh, kind, str, z = 0) => {
      const b = box(w, hh - 0.05, DEPTH, tint(kind));
      b.position.set(x, y, z);
      dyn.add(b);
      if (str != null) {
        const tg = text(str, Math.min(0.3, hh * 0.72), { color: kind === "base" || kind === "invalid" ? "--text" : "--surface", bold: kind !== "base" && kind !== "invalid" });
        if (tg.scale.x > w * 0.92) tg.scale.multiplyScalar((w * 0.92) / tg.scale.x);
        tg.position.set(x, y, z + DEPTH / 2 + 0.04);
        dyn.add(tg);
      }
      return b;
    };
    const caption = (str, bad = false) => {
      if (!str) return;
      const tg = text(str, 0.36, { color: bad ? "--bad" : "--text" });
      tg.position.set(L.cpu + 1.0, L.slotY + 1.0, 0.2);
      tg.center.set(1, 0.5);
      dyn.add(tg);
    };
    const hide = (...names) => names.forEach((n) => { const p = pieces.get(n); if (p) p.mesh.visible = false; });
    const showP = (n, pos, str, via, ms) => { const p = pieces.get(n); p.mesh.visible = true; p.setText(str); moveTo(p, pos, animate && p.wasVisible, via, ms); };
    for (const p of pieces.values()) { p.wasVisible = p.mesh.visible; p.mesh.scale.setScalar(1); }

    if (mode === "paging") paging(st, row, caption, hide, showP);
    else if (mode === "multilevel") multilevel(st, row, caption, hide, showP);
    else segmentation(st, row, caption, hide, showP);
    if (st.fault && diskMat) diskMat.emissive.copy(C("--bad")), diskMat.emissiveIntensity = 0.5;
    else if (diskMat) diskMat.emissiveIntensity = 0;
  }

  function ramRows(row, frameList, hot, label) {
    const start = windowStart(frameList.length, Math.max(0, frameList.indexOf(hot)), L.ramRows);
    const ys = new Map();
    frameList.slice(start, start + L.ramRows).forEach((f, r) => {
      const y = TOP - (r + 0.5) * L.ramH;
      ys.set(f, y);
      row(L.ram, y, L.ramW, L.ramH, f === hot ? "good" : "base", label(f));
    });
    return ys;
  }

  function landOffset(row, y, frac, str) {
    const x = L.ram - L.ramW / 2 + 0.05 + frac * (L.ramW - 0.1);
    const pin = box(0.05, L.ramH * 0.9, 0.05, new THREE.MeshBasicMaterial({ color: C(COL.off) }));
    pin.position.set(x, y, DEPTH / 2 + 0.06);
    dyn.add(pin);
    const tg = text(str, 0.32, { bg: "--surface", color: "--text" });
    tg.position.set(L.ram + L.ramW / 2 + 0.2, y - L.ramH * 0.9 - 0.15, 0.6);
    tg.center.set(1, 0.5);
    dyn.add(tg);
    return V(x, y + L.ramH / 2 + 0.16, DEPTH / 2 + 0.1);
  }

  function paging(st, row, caption, hide, showP) {
    const pages = 2 ** res.pageBits;
    // TLB rows (top row is the next victim).
    const tlbY = (r) => TOP - (r + 0.5) * 0.42;
    for (let r = 0; r < cfg.tlbSize; r++) {
      const e = st.tlb[r];
      const lit = e && st.lit?.tlb === e.page;
      row(L.tlb, tlbY(r), L.w, 0.42, !e ? "invalid" : lit ? (st.phase === "insert" || st.hit ? "good" : "accent") : "base", e ? `${e.page} → ${e.frame}` : null);
    }
    if (st.victim) row(L.tlb - 0.25, tlbY(0) + 0.15, L.w, 0.42, "bad", `${st.victim.page} → ${st.victim.frame} out`, 0.75);
    tlbCasing.emissive.copy(C("--bad"));
    tlbCasing.emissiveIntensity = st.phase === "tlb" && !st.hit ? 0.45 : 0;
    // Page table window.
    const centre = st.lit?.pt ?? st.p ?? 0, first = windowStart(pages, centre, L.ptRows);
    const ptY = (pg) => TOP - (pg - first + 0.5) * L.ptH;
    for (let r = 0; r < L.ptRows; r++) {
      const pg = first + r, e = cfg.pageTable[pg], lit = st.lit?.pt === pg;
      row(L.pt, ptY(pg), L.w, L.ptH, lit ? (st.fault ? "bad" : "accent") : e?.valid ? "base" : "invalid", `${pg} → ${e?.valid ? e.frame : "– (i)"}`);
    }
    // RAM frames, labelled with the page that lives there.
    const owner = new Map(cfg.pageTable.map((e, pg) => [e.valid ? e.frame : -1, pg]));
    const frameList = Array.from({ length: L.frames }, (_, f) => f);
    const hot = st.phase === "physical" ? st.f : null;
    const ys = ramRows(row, frameList, hot, (f) => `frame ${f}${owner.has(f) ? ` · page ${owner.get(f)}` : ""}`);

    if (st.done) { hide("p", "d", "f"); caption("All addresses translated"); return; }
    caption(st.split ? `${st.addr} → p ${st.p} | d ${st.d}` : `address ${st.addr}`, st.fault);
    const left = (x, w, y) => V(x - w / 2 - 0.45, y, 0.25);
    const pText = st.split ? `p=${st.p}` : null, dText = st.split ? `d=${st.d}` : null;
    const gap = st.split ? 0.95 : 0.63;
    hide("f");
    if (st.phase === "read" || st.phase === "split") { showP("p", slot(0, 2, gap), pText); showP("d", slot(1, 2, gap), dText); return; }
    showP("d", slot(1, 2, 0.95), dText);
    if (st.phase === "tlb") {
      const r = st.hit ? st.tlb.findIndex((e) => e.page === st.p) : (cfg.tlbSize - 1) / 2;
      showP("p", left(L.tlb, L.w, tlbY(r)), st.hit ? `p=${st.p} hit` : `p=${st.p} miss`);
    } else if (st.phase === "walk" || st.phase === "evict") showP("p", left(L.pt, L.w, ptY(st.p)), pText);
    else if (st.phase === "fault") {
      const at = left(L.pt, L.w, ptY(st.p));
      showP("p", V(L.disk[0], L.disk[1] + 0.55, 0.3), `p=${st.p} fault`, [at.clone().add(V(0, 0.3, 0.3)), at, V(L.disk[0] - 1.3, L.disk[1] + 0.9, 0.6)], 900);
    } else if (st.phase === "insert") showP("p", left(L.tlb, L.w, tlbY(st.tlb.length - 1)), pText);
    else if (st.phase === "physical") {
      const y = ys.get(st.f) ?? TOP - L.ramH / 2;
      hide("p");
      const fp = pieces.get("f");
      if (!fp.mesh.visible) fp.mesh.position.copy(pieces.get("p").mesh.position);
      showP("f", left(L.ram, L.ramW, y), `f=${st.f}`);
      pieces.get("f").wasVisible = true;
      const land = landOffset(row, y, st.d / cfg.pageSize, `${st.f} × ${cfg.pageSize} + ${st.d} = ${st.physical}`);
      showP("d", land, dText);
      pieces.get("d").mesh.scale.setScalar(0.7);
    }
  }

  function multilevel(st, row, caption, hide, showP) {
    const lv = res.levels, walk = st.walk ?? [];
    const rowY = (r) => TOP - (r + 0.5) * 0.42;
    const hotPos = [];
    L.cols.forEach((x, i) => {
      const w = walk[i];
      if (!w) { for (let r = 0; r < 5; r++) row(x, rowY(r), L.colW, 0.42, "invalid", null); return; }
      const size = 2 ** cfg.bits[i], first = windowStart(size, w.index, 5);
      const table = res.tables.get(w.key);
      for (let r = 0; r < Math.min(5, size); r++) {
        const n = first + r, e = table?.get(n), hot = n === w.index;
        const val = !e ? "–" : e.table !== undefined ? "→ table" : `→ f${e.frame}`;
        row(x, rowY(r), L.colW, 0.42, hot ? (e ? "accent" : "bad") : e ? "base" : "invalid", `${n} ${val}`);
        if (hot) hotPos[i] = V(x - L.colW / 2 - 0.42, rowY(r), 0.25);
      }
      const nm = text(w.name, 0.22, { color: "--muted", bold: false });
      nm.position.set(x, rowY(5) - 0.05, 0);
      dyn.add(nm);
    });
    const owner = new Map(cfg.mappings.map((m) => [m.frame, m.path.join(".")]));
    const hot = st.phase === "physical" || st.phase === "data" ? st.frame : null;
    const ys = ramRows(row, L.frames, hot, (f) => `frame ${f}${owner.has(f) ? ` · ${owner.get(f)}` : ""}`);
    const names = [...pageNames, "d"];
    if (st.done) { hide(...names, "f"); caption("All addresses translated"); return; }
    const hex = `0x${st.addr.toString(16).toUpperCase()}`;
    caption(st.split ? `${hex} → ${st.parts.join(" | ")}` : `address ${hex}`, st.fault);
    const gap = st.split ? 0.8 : 0.63;
    const txt = (i) => (st.split ? (i === lv ? `d=${st.parts[i]}` : `p${i + 1}=${st.parts[i]}`) : null);
    hide("f");
    names.forEach((n, i) => {
      if (i < lv && hotPos[i]) {
        const faulted = st.fault && i === walk.length - 1;
        if (faulted) showP(n, V(L.disk[0], L.disk[1] + 0.55, 0.3), `${txt(i)} fault`, [hotPos[i].clone().add(V(0, 0.3, 0.3)), hotPos[i], V(L.disk[0] - 1.3, L.disk[1] + 0.9, 0.6)], 900);
        else showP(n, hotPos[i], txt(i));
      } else showP(n, slot(i, names.length, gap), txt(i));
    });
    if (st.phase === "physical" || st.phase === "data") {
      const y = ys.get(st.frame) ?? TOP - L.ramH / 2;
      const fp = pieces.get("f");
      if (!fp.mesh.visible && hotPos[lv - 1]) fp.mesh.position.copy(hotPos[lv - 1]);
      fp.wasVisible = true;
      showP("f", V(L.ram - L.ramW / 2 - 0.45, y, 0.25), `f=${st.frame}`);
      const land = landOffset(row, y, st.parts[lv] / 2 ** cfg.bits[lv], `${st.phase === "data" ? "read " : ""}0x${st.physical.toString(16).toUpperCase()}`);
      showP("d", land, txt(lv));
      pieces.get("d").mesh.scale.setScalar(0.7);
    }
  }

  function segmentation(st, row, caption, hide, showP) {
    const segs = cfg.segments, rowY = (r) => TOP - (r + 0.5) * L.segH;
    segs.forEach((sg, i) => row(L.seg, rowY(i), L.segW, L.segH, st.lit === i ? (st.trap ? "bad" : "accent") : "base", `${i}: base ${sg.base} · limit ${sg.limit}`));
    const y = (a) => L.ramTop - (Math.min(a, L.memMax) / L.memMax) * (L.ramTop - L.ramBot);
    if (st.done) { hide("s", "d"); caption("All addresses translated"); return; }
    caption(st.phase === "read" ? `address (${st.s}, ${st.d})` : `(${st.s}, ${st.d}) → s ${st.s} | d ${st.d}`, st.trap);
    const sg = segs[st.s];
    const split = st.phase !== "read", gap = split ? 0.95 : 0.63;
    const sPos = sg ? V(L.seg - L.segW / 2 - 0.45, rowY(st.s), 0.25) : V(L.seg, rowY(segs.length) - 0.3, 0.3);
    showP("s", st.phase === "read" ? slot(0, 2, gap) : sPos, split ? `s=${st.s}${sg ? "" : " ?"}` : null);
    const dText = split ? `d=${st.d}` : null;
    if (!sg || st.phase === "read" || st.phase === "lookup" && !st.trap) { showP("d", slot(1, 2, gap), dText); return; }
    const limitY = y(sg.base + sg.limit);
    if (st.trap || st.phase === "check") {
      const line = box(L.ramW + 0.5, 0.04, DEPTH + 0.1, new THREE.MeshBasicMaterial({ color: C(st.trap ? "--bad" : "--good") }));
      line.position.set(L.ram, limitY, 0);
      dyn.add(line);
      const tg = text(`limit ${sg.base + sg.limit}`, 0.22, { color: st.trap ? "--bad" : "--good" });
      tg.position.set(L.ram + L.ramW / 2 + 0.75, limitY, 0);
      dyn.add(tg);
    }
    if (st.trap) showP("d", V(L.ram + L.ramW / 2 + 0.45, limitY - 0.3, 0.3), `d=${st.d} ≥ ${sg.limit}`);
    else if (st.phase === "check") showP("d", V(L.seg + L.segW / 2 + 0.45, rowY(st.s), 0.25), `d=${st.d} < ${sg.limit}`);
    else if (st.phase === "physical") {
      const ty = y(sg.base + st.d);
      const pin = box(L.ramW + 0.3, 0.035, DEPTH + 0.1, new THREE.MeshBasicMaterial({ color: C(COL.off) }));
      pin.position.set(L.ram, ty, 0);
      dyn.add(pin);
      const tg = text(`${sg.base} + ${st.d} = ${st.physical}`, 0.24, { bg: "--surface", color: "--text" });
      tg.position.set(L.ram + L.ramW / 2 + 0.2, ty - 0.35, 0.6);
      tg.center.set(1, 0.5);
      dyn.add(tg);
      showP("d", V(L.ram - L.ramW / 2 - 0.4, ty, 0.3), dText);
    }
  }

  // Pieces follow their latest path; highlighted rows pulse gently.
  s.onFrame((dt, now) => {
    for (const p of pieces.values()) p.mesh.position.copy(p.ghost.position);
    const k = reducedMotion() ? 0.45 : 0.35 + 0.25 * Math.sin(now / 160);
    for (const m of glow) m.emissiveIntensity = k;
  });
  // Keep everything in frame when the stage changes width (rotation, resize).
  let lastW = s.el.clientWidth;
  const ro = new ResizeObserver(() => { const w = s.el.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; s.lookAt(...target, fit(w)); } });
  ro.observe(s.el);
  s.onTheme(() => { build(); const at = cur; cur = -1; show(Math.max(0, at), true); });
  return {
    show,
    dispose: () => { ro.disconnect(); for (const p of pieces.values()) disposeTree(p.mesh); s.dispose(); },
  };
}
