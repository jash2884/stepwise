import { fragment } from "../engines/fragment.js";
import { copyLink, h, notice, page, readParams, rng, tabs, writeParams } from "../ui.js";

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

  function update() {
    writeParams({ len: state.total, mtu: state.mtu, hdr: state.header });
    let r;
    try { r = fragment(state.total, state.mtu, state.header); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    out.replaceChildren(h("section", { class: "card" }, h("h2", null, `${state.total}-byte datagram, MTU ${state.mtu}`),
      bar(r),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, ["Fragment", "Total length", "Data bytes", "Data range", "Offset (÷8)", "MF"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, r.fragments.map((f, i) => h("tr", null, h("th", { scope: "row" }, i + 1), h("td", null, f.length), h("td", null, f.data), h("td", { class: "mono" }, `${f.first}–${f.last}`), h("td", null, f.offset), h("td", null, f.mf)))))),
      h("ol", { class: "notes" }, r.steps.map((s) => h("li", null, s.note)))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, num("total", "Datagram length", 21, 65535), num("mtu", "MTU", 28, 65535), num("header", "Header", 20, 60),
        h("button", { type: "button", class: "btn ghost", onclick: () => { writeParams({ len: 1000 + Math.floor(Math.random() * 9000), mtu: [576, 620, 1006, 1280, 1500][Math.floor(Math.random() * 5)], hdr: state.header }); render(root); } }, "Random"),
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
  return () => {};
}
