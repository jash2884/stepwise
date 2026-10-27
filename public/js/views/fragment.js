import { fragment, FRAGMENT_CODE } from "../engines/fragment.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// The datagram being cut: pieces not yet cut sit in the original on the left;
// each new fragment slides across the link to the right and gets its own header.
const SHOW = 16;
function cutting(r, made, header) {
  const shown = r.fragments.slice(0, SHOW);
  const scale = 250 / r.data, W = 680, rowH = 30, top = 34, HX = 26;
  const H = top + Math.max(1, shown.length) * rowH + 30;
  const els = [
    h("text", { x: 20, y: 18, class: "frag-title" }, `Original: ${header} B header + ${r.data} B data`),
    h("text", { x: 370, y: 18, class: "frag-title" }, "Fragments sent"),
    h("line", { x1: 340, x2: 340, y1: 8, y2: H - 8, class: "frag-link" }),
    h("text", { x: 340, y: H - 2, "text-anchor": "middle", class: "frag-title" }, "link"),
    h("g", { class: "frag-hdr orig" }, h("rect", { x: 20, y: top, width: HX - 2, height: 22, rx: 4 }), h("text", { x: 20 + HX / 2 - 1, y: top + 15, "text-anchor": "middle" }, "H")),
  ];
  shown.forEach((f, i) => {
    const cut = i < made;
    const x = cut ? 370 + HX : 20 + HX + f.first * scale, y = cut ? top + i * rowH : top;
    const w = Math.max(3, f.data * scale);
    els.push(h("g", { class: `frag-piece${cut ? " cut" : ""}${i === made - 1 ? " now" : ""}`, style: `--c:var(--series-${(i % 8) + 1})`, "data-k": `f:${i}`, "data-x": x, "data-y": y },
      h("rect", { x, y, width: w, height: 22, rx: 3 }, h("title", null, `Fragment ${i + 1}: bytes ${f.first}–${f.last}`)),
      cut && w > 60 ? h("text", { x: x + 6, y: y + 15 }, `#${i + 1} off ${f.offset}`) : null));
    if (cut) els.push(h("g", { class: "frag-hdr", "data-k": `h:${i}`, "data-x": 370, "data-y": y }, h("rect", { x: 370, y, width: HX - 2, height: 22, rx: 4 }), h("text", { x: 370 + HX / 2 - 1, y: y + 15, "text-anchor": "middle" }, "H")),
      h("text", { x: 370 + HX + w + 6, y: y + 15, class: "frag-mf" }, `MF=${f.mf}`));
  });
  if (r.fragments.length > SHOW) els.push(h("text", { x: 370, y: H - 12, class: "frag-title" }, `… and ${r.fragments.length - SHOW} more`));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "frag-svg", role: "img", "aria-label": `${made} of ${r.fragments.length} fragments cut` }, els);
}

function bar(r) {
  return h("div", { class: "frag-bar", role: "img", "aria-label": `${r.fragments.length} fragments of the ${r.data} data bytes` },
    r.fragments.map((f, i) => h("div", { class: "frag", style: `flex:${f.data};--c:var(--series-${(i % 8) + 1})` },
      h("b", null, `#${i + 1}`), h("span", null, `bytes ${f.first}–${f.last}`), h("span", null, `offset ${f.offset}`))));
}

export function render(root) {
  const p = readParams();
  const state = { total: Number(p.get("len") ?? 4000), mtu: Number(p.get("mtu") ?? 1500), header: Number(p.get("hdr") ?? 20) };
  const head = page({
    subject: "Computer networks", title: "IP fragmentation",
    lede: "A datagram bigger than the link's MTU gets split. Work out each fragment's size, fragment offset and More Fragments flag.",
    theory: h("div", null,
      h("p", null, "Each fragment gets its own copy of the IP header, so it can carry at most ", h("b", null, "MTU − header"), " bytes of data. Offsets are stored in ", h("b", null, "8-byte units"), ", so every fragment except the last must carry a multiple of 8 bytes."),
      h("p", null, h("b", null, "Fragment offset"), " = position of the fragment's first data byte ÷ 8. ", h("b", null, "MF"), " (More Fragments) is 1 on every fragment except the last. The destination uses the offsets and MF to reassemble.")),
    conventions: ["Lengths are in bytes and include the header.", "The header is copied unchanged into each fragment (no options are dropped)."],
  });
  const num = (key, label, min, max) => h("label", { class: "inline" }, `${label} `, h("input", { type: "number", min, max, value: state[key], "aria-label": label, onchange: (e) => { state[key] = Number(e.target.value); update(); } }));
  const msg = h("div"), out = h("div", { class: "output" });

  let player = null;
  function update() {
    player?.destroy(); player = null;
    writeParams({ len: state.total, mtu: state.mtu, hdr: state.header });
    let r;
    try { r = fragment(state.total, state.mtu, state.header); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(FRAGMENT_CODE), vars = varsPanel();
    const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({ count: r.steps.length, label: "Step", interval: 1200, render: (i) => {
      const st = r.steps[i];
      morph(stage, cutting(r, st.made, state.header));
      code.show(st.line); vars.show(st.vars);
      note.textContent = st.note;
      note.className = `step-note${st.done || r.steps.length === 1 ? " good" : ""}`;
    } });
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, "Cutting it up, step by step"), player.el, note, traceLayout(stage, code, vars)),
      h("section", { class: "card" }, h("h2", null, `${state.total}-byte datagram, MTU ${state.mtu}`),
      bar(r),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, ["Fragment", "Total length", "Data bytes", "Data range", "Offset (÷8)", "MF"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, r.fragments.map((f, i) => h("tr", null, h("th", { scope: "row" }, i + 1), h("td", null, f.length), h("td", null, f.data), h("td", { class: "mono" }, `${f.first}–${f.last}`), h("td", null, f.offset), h("td", null, f.mf)))))),
      h("ol", { class: "notes" }, r.steps.map((s) => h("li", null, s.note)))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, num("total", "Datagram length", 21, 65535), num("mtu", "MTU", 28, 65535), num("header", "Header", 20, 60),
        h("button", { type: "button", class: "btn ghost", onclick: () => { player?.destroy(); writeParams({ len: 1000 + Math.floor(Math.random() * 9000), mtu: [576, 620, 1006, 1280, 1500][Math.floor(Math.random() * 5)], hdr: state.header }); render(root); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const total = 1200 + Math.floor(r() * 8000), mtu = [576, 620, 1006, 1280, 1500][Math.floor(r() * 5)];
    const res = fragment(total, mtu);
    const last = res.fragments.at(-1);
    const nIn = h("input", { type: "number", "aria-label": "Number of fragments" }), offIn = h("input", { type: "number", "aria-label": "Offset of the last fragment" }), lenIn = h("input", { type: "number", "aria-label": "Total length of the last fragment" });
    const feedback = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      h("h2", null, `A ${total}-byte datagram (20-byte header) crosses a link with MTU ${mtu}`),
      h("div", { class: "qa" }, h("label", null, "How many fragments?", nIn), h("label", null, "Fragment offset of the last fragment", offIn), h("label", null, "Total length of the last fragment", lenIn)),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
        const a = Number(nIn.value) === res.fragments.length, b = Number(offIn.value) === last.offset && offIn.value !== "", c = Number(lenIn.value) === last.length;
        mark(nIn, a, res.fragments.length); mark(offIn, b, last.offset); mark(lenIn, c, last.length);
        feedback.replaceChildren(notice(a && b && c ? "good" : "info", a && b && c ? "All three right! 🎉" : `${[a, b, c].filter(Boolean).length} / 3 right.`), h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note))));
      } }, "Check")),
      feedback));
  }

  const panels = h("div");
  const tab = tabs([["visual", "Calculate"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}
