import { bits, EXAMPLE, EXTENDIBLE_EXAMPLE, extendible, hashTable, parseKeys, randomKeys, STRATEGIES } from "../engines/hashing.js";
import { copyLink, fmt, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

function tableView(step, m, strategy) {
  const probes = new Map(step.probes.map((s, i) => [s, i + 1]));
  return h("ol", { class: "hash-table", start: 0 }, Array.from({ length: m }, (_, i) => {
    const v = step.table[i];
    const cls = [step.slot === i ? (step.failed ? "fail" : "landed") : probes.has(i) ? "probed" : "", v === null || (Array.isArray(v) && !v.length) ? "empty" : ""].join(" ").trim();
    return h("li", { class: cls || null },
      h("span", { class: "idx" }, i),
      strategy === "chaining"
        ? h("span", { class: "chain" }, v.length ? v.map((k) => h("b", { class: k === step.key && step.slot === i ? "new" : null }, k)) : h("span", { class: "muted" }, "—"))
        : h("span", { class: "val" }, v ?? ""),
      probes.has(i) && strategy !== "chaining" ? h("small", { class: "probe-no" }, `probe ${probes.get(i)}`) : null);
  }));
}

function extendibleView(step, hot) {
  const byId = new Map(step.buckets.map((b) => [b.id, b]));
  return h("div", { class: "ext" },
    h("div", { class: "dir" }, h("h3", null, `Directory (global depth ${step.global})`),
      h("ol", null, step.dir.map((bid, i) => h("li", { class: bid === hot ? "hot" : null }, h("span", { class: "mono" }, bits(i, step.global) || "·"), " → ", h("b", null, `B${bid}`))))),
    h("div", { class: "buckets" }, h("h3", null, "Buckets"),
      [...byId.values()].sort((a, b) => a.id - b.id).map((b) => h("div", { class: `bucket${b.id === hot ? " hot" : ""}${b.id === step.split ? " new" : ""}` },
        h("header", null, h("b", null, `B${b.id}`), h("small", null, `local depth ${b.local}`)),
        h("div", { class: "keys" }, b.keys.length ? b.keys.map((k) => h("span", { class: k === step.key ? "new" : null, title: `${k} = ${k.toString(2)}₂` }, k)) : h("span", { class: "muted" }, "empty"))))));
}

export function render(root) {
  const p = readParams();
  const state = {
    mode: p.get("mode") === "extendible" ? "extendible" : "table",
    keys: p.get("k") ?? EXAMPLE.keys, m: Number(p.get("m") ?? EXAMPLE.m),
    strategy: STRATEGIES[p.get("st")] ? p.get("st") : "linear",
    extKeys: p.get("ek") ?? EXTENDIBLE_EXAMPLE.keys, size: Number(p.get("b") ?? EXTENDIBLE_EXAMPLE.size),
  };
  let player = null;
  const head = page({
    subject: "Databases", title: "Hashing & indexing",
    lede: "Hash a key to a slot, then deal with collisions. Compare chaining and the open-addressing strategies, and watch an extendible hash index grow.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "hash function"), " maps a key to a slot, here h(k) = k mod m. Two keys landing in the same slot is a ", h("b", null, "collision"), "."),
      h("ul", null,
        h("li", null, h("b", null, "Separate chaining"), " keeps a list per slot."),
        h("li", null, h("b", null, "Open addressing"), " probes other slots: linear (+1, +2, …), quadratic (+1, +4, +9, …) or double hashing (+h2(k) each time). Linear probing causes ", h("b", null, "clustering"), "; quadratic and double hashing spread keys out.")),
      h("p", null, h("b", null, "Extendible hashing"), " (used for database indexes) keeps a directory of 2^global-depth pointers into buckets. A full bucket ", h("b", null, "splits"), "; if its local depth already equals the global depth, the directory ", h("b", null, "doubles"), " first.")),
    conventions: ["h(k) = k mod m; for double hashing h2(k) = R − (k mod R), where R is the largest prime below m.", "Extendible hashing uses the lowest bits of the key's binary value.", "The extendible directory is capped at 64 entries to stay readable."],
  });

  const modeSel = h("select", { "aria-label": "Mode", onchange: (e) => { state.mode = e.target.value; update(); } },
    h("option", { value: "table", selected: state.mode === "table" }, "Hash table (collision strategies)"), h("option", { value: "extendible", selected: state.mode === "extendible" }, "Extendible hashing (database index)"));
  const keysIn = h("input", { type: "text", class: "wide mono", value: state.keys, "aria-label": "Keys", oninput: (e) => { state.keys = e.target.value; update(); } });
  const mIn = h("input", { type: "number", min: 2, max: 31, value: state.m, "aria-label": "Table size", onchange: (e) => { state.m = Number(e.target.value); update(); } });
  const stSel = h("select", { "aria-label": "Collision strategy", onchange: (e) => { state.strategy = e.target.value; update(); } }, Object.entries(STRATEGIES).map(([id, s]) => h("option", { value: id, selected: id === state.strategy }, s.name)));
  const extIn = h("input", { type: "text", class: "wide mono", value: state.extKeys, "aria-label": "Keys", oninput: (e) => { state.extKeys = e.target.value; update(); } });
  const sizeIn = h("input", { type: "number", min: 1, max: 4, value: state.size, "aria-label": "Bucket size", onchange: (e) => { state.size = Number(e.target.value); update(); } });
  const tableInputs = h("div", null, h("label", { class: "stack" }, "Keys to insert, in order", keysIn), h("div", { class: "row" }, h("label", { class: "inline" }, "Table size m ", mIn), stSel));
  const extInputs = h("div", null, h("label", { class: "stack" }, "Keys to insert, in order", extIn), h("div", { class: "row" }, h("label", { class: "inline" }, "Bucket size ", sizeIn)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ mode: state.mode, k: state.keys, m: state.m, st: state.strategy, ek: state.extKeys, b: state.size });
    tableInputs.hidden = state.mode !== "table";
    extInputs.hidden = state.mode !== "extendible";
    try {
      if (state.mode === "table") {
        const keys = parseKeys(state.keys);
        const r = hashTable(keys, state.m, state.strategy);
        msg.replaceChildren();
        const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
        player = stepper({ count: r.steps.length, label: "Key", interval: 1000, render: (i) => {
          const s = r.steps[i];
          stage.replaceChildren(tableView(s, state.m, state.strategy));
          note.textContent = `Insert ${s.key}: ${s.note}`;
          note.className = `step-note${s.failed ? " bad" : ""}`;
        } });
        const compare = Object.entries(STRATEGIES).map(([id, st]) => { const x = hashTable(keys, state.m, id); return [st.name, x.collisions, x.steps.filter((s) => s.failed).length]; });
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, STRATEGIES[state.strategy].name), player.el, stage, note,
            h("div", { class: "stats-row" },
              h("div", { class: "stat" }, h("span", null, "Collisions"), h("b", null, r.collisions)),
              h("div", { class: "stat" }, h("span", null, "Load factor α"), h("b", null, fmt(r.loadFactor))),
              state.strategy === "double" ? h("div", { class: "stat" }, h("span", null, "R for h2"), h("b", null, r.R)) : null)),
          h("section", { class: "card" }, h("h2", null, "Same keys, every strategy"),
            h("div", { class: "table-wrap" }, h("table", null,
              h("thead", null, h("tr", null, ["Strategy", "Collisions", "Failed inserts"].map((t) => h("th", { scope: "col" }, t)))),
              h("tbody", null, compare.map(([n, c, f]) => h("tr", null, h("th", { scope: "row" }, n), h("td", null, c), h("td", null, f))))))));
      } else {
        const keys = parseKeys(state.extKeys, 24);
        const r = extendible(keys, state.size);
        msg.replaceChildren();
        const stage = h("div"), note = h("p", { class: "step-note", "aria-live": "polite" });
        player = stepper({ count: r.steps.length, label: "Step", interval: 1200, render: (i) => {
          const s = r.steps[i];
          stage.replaceChildren(extendibleView(s, s.bucket));
          note.textContent = s.note;
          note.className = `step-note${s.doubled || s.split ? " warn" : ""}`;
        } });
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, `Extendible hashing, bucket size ${state.size}`), player.el, stage, note,
          h("div", { class: "stats-row" },
            h("div", { class: "stat" }, h("span", null, "Global depth"), h("b", null, r.global)),
            h("div", { class: "stat" }, h("span", null, "Directory entries"), h("b", null, r.dir.length)),
            h("div", { class: "stat" }, h("span", null, "Buckets"), h("b", null, r.buckets.length)))));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, modeSel,
        h("button", { type: "button", class: "btn ghost", onclick: () => { const k = randomKeys().join(" "); if (state.mode === "table") { state.keys = k; keysIn.value = k; } else { state.extKeys = randomKeys(Math.random, 9, 64).join(" "); extIn.value = state.extKeys; } update(); } }, "Random keys"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      tableInputs, extInputs, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const feedback = h("div"), solution = h("div");
    const mark = (el, ok, exp) => { el.classList.toggle("right", ok); el.classList.toggle("wrong", !ok); el.title = ok ? "Correct" : `Expected ${exp}`; };
    if (r() < 0.6) {
      const strategy = ["linear", "quadratic", "double"][Math.floor(r() * 3)];
      const m = [7, 10, 11, 13][Math.floor(r() * 4)];
      const keys = randomKeys(r, 5 + Math.floor(r() * 2));
      const res = hashTable(keys, m, strategy);
      const target = keys[keys.length - 1 - Math.floor(r() * 2)];
      const slotIn = h("input", { type: "number", "aria-label": `Slot of ${target}` }), colIn = h("input", { type: "number", "aria-label": "Total collisions" });
      const truthSlot = res.table.indexOf(target);
      practice.replaceChildren(h("section", { class: "card" },
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
        h("h2", null, `${STRATEGIES[strategy].name}, table size ${m}`),
        h("p", null, "Insert in this order: ", h("b", { class: "mono" }, keys.join(", ")), `. h(k) = k mod ${m}${strategy === "double" ? `, h2(k) = ${res.R} − (k mod ${res.R})` : ""}.`),
        h("div", { class: "qa" }, h("label", null, `Which slot does ${target} end up in? (−1 if it can't be placed)`, slotIn), h("label", null, "Total collisions", colIn)),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn primary", onclick: () => {
            const okS = slotIn.value !== "" && Number(slotIn.value) === truthSlot, okC = colIn.value !== "" && Number(colIn.value) === res.collisions;
            mark(slotIn, okS, truthSlot); mark(colIn, okC, res.collisions);
            feedback.replaceChildren(notice(okS && okC ? "good" : "info", okS && okC ? "Both right! 🎉" : `${[okS, okC].filter(Boolean).length} / 2 right. Hover a red answer or show the table.`));
          } }, "Check"),
          h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Final table"), tableView(res.steps.at(-1), m, strategy), h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, `${s.key}: ${s.note}`))))) }, "Show the table")),
        feedback), solution);
    } else {
      const size = 2;
      let keys, res;
      for (;;) { keys = randomKeys(r, 7 + Math.floor(r() * 3), 64); try { res = extendible(keys, size); break; } catch { /* try other keys */ } }
      const gIn = h("input", { type: "number", "aria-label": "Global depth" }), bIn = h("input", { type: "number", "aria-label": "Number of buckets" });
      practice.replaceChildren(h("section", { class: "card" },
        h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
        h("h2", null, "Extendible hashing, bucket size 2"),
        h("p", null, "Insert in this order (using the lowest bits): ", h("b", { class: "mono" }, keys.join(", "))),
        h("div", { class: "qa" }, h("label", null, "Final global depth", gIn), h("label", null, "Number of buckets", bIn)),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn primary", onclick: () => {
            const okG = Number(gIn.value) === res.global && gIn.value !== "", okB = Number(bIn.value) === res.buckets.length && bIn.value !== "";
            mark(gIn, okG, res.global); mark(bIn, okB, res.buckets.length);
            feedback.replaceChildren(notice(okG && okB ? "good" : "info", okG && okB ? "Both right! 🎉" : `${[okG, okB].filter(Boolean).length} / 2 right.`));
          } }, "Check"),
          h("button", { type: "button", class: "btn ghost", onclick: () => solution.replaceChildren(h("section", { class: "card" }, h("h2", null, "Final index"), extendibleView(res.steps.at(-1), null), h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s.note))))) }, "Show the index")),
        feedback), solution);
    }
  }

  const panels = h("div");
  const tab = tabs([["visual", "Visualise"], ["practice", "Practice"]], (id) => {
    panels.replaceChildren(id === "visual" ? visual : practice);
    if (id === "practice" && !practice.childElementCount) newQuestion();
  });
  root.replaceChildren(head, tab.el, panels);
  tab.select("visual");
  update();
  return () => player?.destroy();
}
