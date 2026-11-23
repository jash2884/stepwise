import {
  amat, CODE, EXAMPLES, fromParams, geometry, MAPPINGS, parseTrace, POLICIES, randomBlocks, simulate, toBin, toParams, WRITES, tagDirectory,
} from "../engines/cache.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { bitStrip, natQuestion, numIn, pct, select, stepFrame } from "./coa-kit.js";

const KIND = { compulsory: "Compulsory", conflict: "Conflict", capacity: "Capacity" };

// The address (or block number) split into its fields.
function addressBits(s, g, unit) {
  if (s.i < 0) return null;
  const groups = [
    { size: g.tagBits, cls: "tag", label: `tag ${s.tag}` },
    { size: g.indexBits, cls: "idx", label: g.indexBits ? `${g.mapping === "direct" ? "line" : "set"} ${s.set}` : "" },
  ];
  if (unit === "addr") groups.push({ size: g.offsetBits, cls: "off", label: g.offsetBits ? `offset ${s.offset}` : "" });
  const value = unit === "addr" ? s.addr : s.block;
  const width = unit === "addr" ? g.addressBits : g.tagBits + g.indexBits;
  return h("div", { class: "coa-split" },
    h("div", { class: "muted small" }, unit === "addr" ? `Address ${value} = 0x${value.toString(16).toUpperCase()} (block ${s.block})` : `Block ${value}`),
    bitStrip(toBin(value, width), groups.filter((x) => x.size > 0)));
}

function cacheTable(s, g) {
  const rows = s.sets.map((ways, k) => {
    const here = s.i >= 0 && k === s.set;
    return h("tr", { class: here ? "hot" : null },
      h("th", { scope: "row" }, g.sets === 1 ? "all" : k),
      ways.map((w, j) => {
        const cls = ["coa-way"];
        if (here && j === s.way) cls.push(s.hit ? "hit" : "fill");
        if (!w) return h("td", { class: cls.join(" ") }, h("span", { class: "muted" }, "empty"));
        return h("td", { class: cls.join(" ") },
          h("b", null, `B${w.block}`), h("small", null, ` tag ${w.tag}`), w.dirty ? h("span", { class: "coa-dirty", title: "Dirty" }, "D") : null,
          g.ways > 1 ? h("small", { class: "coa-age", title: "Replacement order: 1 goes first" }, ` #${w.rank + 1}`) : null);
      }));
  });
  return h("div", { class: "table-wrap" }, h("table", { class: "coa-cache" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, g.mapping === "direct" ? "Line" : "Set"), Array.from({ length: g.ways }, (_, j) => h("th", { scope: "col" }, g.ways === 1 ? "Block" : `Way ${j}`)))),
    h("tbody", null, rows)));
}

function refStrip(res, upto) {
  return h("div", { class: "coa-refs", "aria-label": "References so far" }, res.steps.slice(1).map((s, k) => h("span", {
    class: `coa-ref${k + 1 > upto ? " future" : s.hit ? " hit" : " miss"}${k + 1 === upto ? " now" : ""}`,
    title: k + 1 > upto ? "" : s.hit ? "hit" : `${s.kind} miss`,
  }, `${s.write ? "W" : ""}${res.cfg.unit === "block" ? s.block : s.addr}`, h("small", null, k + 1 > upto ? "·" : s.hit ? "H" : "M"))));
}

export function simulation(res) {
  const g = res.geometry;
  const frame = stepFrame(res.steps, CODE, (s, i) => h("div", null,
    refStrip(res, i),
    addressBits(s, g, res.cfg.unit),
    cacheTable(s, g),
    h("p", { class: "muted small" }, g.ways > 1 ? `#1 is the next to go under ${POLICIES[res.cfg.policy]}. D marks a dirty line (write-back only).` : "Each block has exactly one place it can go: line = block mod lines.")),
  { label: "Reference", after: (s, i) => {
    const done = res.steps.slice(1, i + 1);
    const hits = done.filter((x) => x.hit).length, misses = done.length - hits;
    const k = (x) => done.filter((d) => d.kind === x).length;
    const last = i === res.steps.length - 1;
    return h("div", { class: "stats-row" },
      stat("Hits", hits), stat("Misses", misses), stat("Hit ratio", done.length ? `${hits}/${done.length}` : "…"),
      stat("Compulsory · conflict · capacity", `${k("compulsory")} · ${k("conflict")} · ${k("capacity")}`),
      stat(res.cfg.write === "wb" ? "Blocks written back" : "Words written through", last ? (res.cfg.write === "wb" ? `${res.writeBacks} (+${res.dirtyAtEnd} dirty left)` : res.memWrites) : "…"),
      stat("Blocks fetched", last ? res.memReads : "…"));
  } });
  return frame;
}

function comparison(refs, cfg) {
  const g = geometry(cfg);
  const kinds = [["direct", 1], ...[2, 4, 8].filter((k) => k < g.lines).map((k) => ["set", k]), ["full", g.lines]];
  const rows = kinds.map(([mapping, ways]) => {
    const res = simulate(refs, { ...cfg, mapping, ways });
    return { name: mapping === "set" ? `${ways}-way set-associative` : MAPPINGS[mapping], res, current: mapping === cfg.mapping && (mapping !== "set" || ways === cfg.ways) };
  });
  return h("section", { class: "card" }, h("h2", null, "Same trace, every organisation"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Organisation", "Hits", "Misses", "Hit ratio", "Conflict misses", "Tag bits"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((x) => h("tr", { class: x.current ? "current" : null },
        h("th", { scope: "row" }, x.name), h("td", null, x.res.hits), h("td", null, x.res.misses), h("td", null, pct(x.res.hitRatio)),
        h("td", null, x.res.kinds.conflict), h("td", null, x.res.geometry.tagBits)))))),
    h("p", { class: "muted small" }, "More ways means fewer conflict misses but a longer tag and more comparators. A fully associative cache has no conflict misses at all; what's left is compulsory and capacity."));
}

export function render(root) {
  const init = fromParams(readParams());
  const state = { cfg: init.cfg, trace: init.trace, amat: init.amat };

  const head = page({
    subject: "Computer organisation",
    title: "Cache mapping",
    lede: "Split an address into tag, index and offset, then run a reference trace and watch every hit, miss and eviction.",
    theory: h("div", null,
      h("p", null, "A cache holds copies of memory ", h("b", null, "blocks"), ". The low bits of an address pick the byte inside a block (", h("b", null, "offset"), "), the next bits pick a ", h("b", null, "set"), " (", h("b", null, "index"), "), and the rest is stored as the ", h("b", null, "tag"), " so we can tell which block is there."),
      h("ul", null,
        h("li", null, h("b", null, "Direct-mapped"), ": one line per set. Block b can only go to line b mod lines. Fast and simple, but two busy blocks on the same line keep throwing each other out."),
        h("li", null, h("b", null, "k-way set-associative"), ": k lines per set. Block b goes to set b mod sets, into any of its k ways; LRU or FIFO picks the victim."),
        h("li", null, h("b", null, "Fully associative"), ": one set holding every line. No index bits, and no conflict misses.")),
      h("p", null, "offset = log₂(block size), index = log₂(number of sets), tag = address bits − index − offset."),
      h("p", null, "Misses come in three kinds: ", h("b", null, "compulsory"), " (first touch of a block), ", h("b", null, "capacity"), " (the cache is simply too small) and ", h("b", null, "conflict"), " (too many blocks fight over one set)."),
      h("p", null, h("b", null, "Average memory access time"), ": for one level, hit time + miss rate × miss penalty. With several levels, either a miss goes on to the next level and times add (hierarchical), or all levels are looked up together (simultaneous).")),
    conventions: [
      "Sizes are in bytes and must be powers of two. Addresses are byte addresses unless you choose block numbers.",
      "An empty way is filled before anything is evicted, lowest way first.",
      "A miss is compulsory if the block was never referenced before; capacity if a fully associative cache of the same size and policy would also miss; otherwise conflict.",
      "Write-back uses write-allocate. Write-through uses no-write-allocate (a write miss goes straight to memory) unless you pick write-through + allocate.",
      "W in front of an address makes it a write, like W12. Hex needs 0x in front.",
      "Hit ratios in the average access time are local: the share of accesses reaching that level that hit there.",
    ],
  });

  // --- Visualise --------------------------------------------------------------
  const msg = h("div"), out = h("div", { class: "output" }), geo = h("div"), amatOut = h("div");
  const controls = h("div");
  let sim = null;

  function drawControls() {
    const c = state.cfg;
    controls.replaceChildren(
      h("div", { class: "row" },
        select("", MAPPINGS, c.mapping, (v) => { c.mapping = v; if (v === "set" && c.ways < 2) c.ways = 2; update(); }),
        c.mapping === "set" ? numIn("Ways", c.ways, (v) => { c.ways = v; update(); }, { min: 2, max: 64, step: 1, width: 64 }) : null,
        c.mapping !== "direct" ? select("Replace", POLICIES, c.policy, (v) => { c.policy = v; update(); }) : null,
        select("", WRITES, c.write, (v) => { c.write = v; update(); })),
      h("div", { class: "row" },
        numIn("Address bits", c.addressBits, (v) => { c.addressBits = v; update(); }, { min: 4, max: 48, step: 1, width: 64 }),
        numIn("Block (bytes)", c.blockSize, (v) => { c.blockSize = v; update(); }, { min: 1, step: 1, width: 80 }),
        numIn("Cache (bytes)", c.cacheSize, (v) => { c.cacheSize = v; update(); }, { min: 1, step: 1, width: 96 }),
        select("Trace is", { addr: "byte addresses", block: "block numbers" }, c.unit, (v) => { c.unit = v; update(); })),
      h("div", { class: "row" },
        h("input", { type: "text", class: "wide mono", value: state.trace, "aria-label": "Reference trace", onchange: (e) => { state.trace = e.target.value; update(); } })),
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { state.cfg = { ...ex.cfg }; state.trace = ex.trace; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { const r = rng(); state.trace = randomBlocks(r, 12, c.unit === "block" ? 2 * (c.cacheSize / c.blockSize) + 2 : 4 * c.cacheSize).map((x, i) => `${i % 4 === 3 ? "W" : ""}${x.addr}`).join(" "); update(); } }, "Random trace"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
  }

  function drawAmat() {
    const a = state.amat;
    let res = null, err = null;
    try { res = amat(a.levels, a.mem, a.mode); } catch (e) { err = e.message; }
    amatOut.replaceChildren(h("section", { class: "card" },
      h("h2", null, "Average memory access time"),
      h("div", { class: "coa-levels" }, a.levels.map((l, i) => h("div", { class: "row" },
        h("b", null, `L${i + 1}`),
        numIn("time", l.t, (v) => { l.t = v; drawAmat(); save(); }, { min: 0, width: 80 }),
        numIn("hit ratio", l.h, (v) => { l.h = v; drawAmat(); save(); }, { min: 0, max: 1, step: 0.01, width: 80 }),
        a.levels.length > 1 ? h("button", { type: "button", class: "icon", "aria-label": `Remove L${i + 1}`, onclick: () => { a.levels.splice(i, 1); drawAmat(); save(); } }, "×") : null))),
      h("div", { class: "row" },
        numIn("Main memory time", a.mem, (v) => { a.mem = v; drawAmat(); save(); }, { min: 0, width: 90 }),
        select("", { hier: "Hierarchical (times add)", simul: "Simultaneous (look up together)" }, a.mode, (v) => { a.mode = v; drawAmat(); save(); }),
        a.levels.length < 3 ? h("button", { type: "button", class: "btn ghost small", onclick: () => { a.levels.push({ t: 20 * a.levels.length, h: 0.9 }); drawAmat(); save(); } }, "+ Level") : null),
      err ? notice("error", err) : h("div", null,
        h("p", { class: "mono small" }, res.formula),
        h("p", { class: "big-answer" }, "T = ", h("span", { class: "mono small" }, res.working), " = ", h("b", null, res.value)),
        h("p", { class: "muted small" }, a.mode === "hier"
          ? "Every access pays L1's time; the misses also pay for the next level, and so on down to memory."
          : "An access costs only the time of the level that satisfies it, weighted by how many accesses get that far."))));
  }

  const save = () => writeParams(toParams(state));

  function update() {
    drawControls();
    save();
    sim?.player.destroy();
    let refs, res;
    try {
      refs = parseTrace(state.trace);
      res = simulate(refs, state.cfg);
    } catch (e) {
      msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); geo.replaceChildren(); return;
    }
    msg.replaceChildren();
    const g = res.geometry;
    const dir = tagDirectory(g, { valid: 1, dirty: state.cfg.write === "wb" ? 1 : 0 });
    geo.replaceChildren(h("div", { class: "coa-geo" },
      bitStrip("t".repeat(g.tagBits) + "i".repeat(g.indexBits) + "o".repeat(g.offsetBits), [{ size: g.tagBits, cls: "tag", label: `tag ${g.tagBits}` }, { size: g.indexBits, cls: "idx", label: `index ${g.indexBits}` }, { size: g.offsetBits, cls: "off", label: `offset ${g.offsetBits}` }].filter((x) => x.size > 0), { small: g.addressBits > 20 }),
      h("p", { class: "muted small" }, `${g.lines} lines of ${g.blockSize} byte${g.blockSize === 1 ? "" : "s"}, ${g.sets} set${g.sets === 1 ? "" : "s"} × ${g.ways} way${g.ways === 1 ? "" : "s"}. Tag storage: ${g.lines} × (${g.tagBits} tag + 1 valid${state.cfg.write === "wb" ? " + 1 dirty" : ""}) = ${dir.total} bits.`)));
    sim = simulation(res);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, `${g.mapping === "set" ? `${g.ways}-way set-associative` : MAPPINGS[g.mapping]}, ${res.refs} references`), sim.el,
        h("p", { class: "muted small" }, `Final: ${res.hits} hits, ${res.misses} misses, hit ratio ${pct(res.hitRatio)}. ${state.cfg.write === "wb" ? `${res.writeBacks} dirty blocks written back on eviction, ${res.dirtyAtEnd} still dirty.` : `${res.memWrites} writes went through to memory.`}`)),
      comparison(refs, state.cfg));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, controls, geo, msg), out, amatOut);

  // --- Practice -----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["bits", "trace", "amat"][Math.floor(r() * 3)];
    const again = h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question");
    const card = h("section", { class: "card" }, h("div", { class: "row" }, again));
    if (kind === "bits") {
      const mapping = ["direct", "set", "full"][Math.floor(r() * 3)];
      const g = geometry({ addressBits: [16, 24, 32][Math.floor(r() * 3)], blockSize: 2 ** (2 + Math.floor(r() * 5)), cacheSize: 2 ** (10 + Math.floor(r() * 7)), mapping, ways: mapping === "set" ? 2 ** (1 + Math.floor(r() * 3)) : 1 });
      const cfgText = `${g.cacheSize >= 1024 ? `${g.cacheSize / 1024} KB` : `${g.cacheSize} B`} ${mapping === "set" ? `${g.ways}-way set-associative` : MAPPINGS[mapping].toLowerCase()} cache, ${g.blockSize}-byte blocks, ${g.addressBits}-bit addresses`;
      const fields = [["Tag bits", g.tagBits], ["Index bits", g.indexBits], ["Offset bits", g.offsetBits]];
      const inputs = fields.map(([label]) => h("input", { type: "number", "aria-label": label, class: "answer" }));
      const fb = h("div");
      card.append(h("h2", null, "Split the address"), h("p", null, cfgText, ". How many bits go to each field?"),
        h("div", { class: "qa" }, fields.map(([label], i) => h("label", null, label, inputs[i]))),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
          let right = 0;
          fields.forEach(([, v], i) => { const ok = inputs[i].value !== "" && Number(inputs[i].value) === v; right += ok; inputs[i].classList.toggle("right", ok); inputs[i].classList.toggle("wrong", !ok); });
          fb.replaceChildren(notice(right === 3 ? "good" : "bad", `${right} / 3 right. Lines = ${g.lines}, sets = ${g.sets}: offset = log₂ ${g.blockSize} = ${g.offsetBits}, index = log₂ ${g.sets} = ${g.indexBits}, tag = ${g.addressBits} − ${g.indexBits} − ${g.offsetBits} = ${g.tagBits}.`));
        } }, "Check")), fb);
    } else if (kind === "trace") {
      const mapping = ["direct", "set", "full"][Math.floor(r() * 3)];
      const cfg = { mapping, ways: mapping === "set" ? 2 : 1, addressBits: 8, blockSize: 1, cacheSize: 4, unit: "block", policy: r() < 0.7 ? "lru" : "fifo", write: "wb" };
      const refs = randomBlocks(r, 10, 12);
      const res = simulate(refs, cfg);
      const sel = refs.map((x, i) => h("select", { "aria-label": `Reference ${i + 1}, block ${x.addr}` }, h("option", { value: "" }, "?"), h("option", { value: "H" }, "Hit"), h("option", { value: "M" }, "Miss")));
      const fb = h("div"), sol = h("div");
      card.append(h("h2", null, "Hit or miss?"),
        h("p", null, `A ${mapping === "set" ? "2-way set-associative" : MAPPINGS[mapping].toLowerCase()} cache with 4 one-block lines${mapping === "direct" ? "" : `, ${POLICIES[cfg.policy]} replacement`}, initially empty. Mark each block reference.`),
        h("div", { class: "coa-quiz" }, refs.map((x, i) => h("label", { class: "stack" }, h("span", { class: "mono" }, `${x.addr}`), sel[i]))),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn primary", onclick: () => {
            let right = 0;
            res.steps.slice(1).forEach((s, i) => { const ok = sel[i].value === (s.hit ? "H" : "M"); right += ok; sel[i].classList.toggle("right", ok); sel[i].classList.toggle("wrong", !ok); });
            fb.replaceChildren(notice(right === refs.length ? "good" : "bad", `${right} / ${refs.length} right. ${res.hits} hits, ${res.misses} misses: hit ratio ${pct(res.hitRatio)}.`));
          } }, "Check"),
          h("button", { type: "button", class: "btn ghost", onclick: () => sol.replaceChildren(simulation(res).el) }, "Show solution")),
        fb, sol);
    } else {
      const levels = [{ t: [1, 2, 4][Math.floor(r() * 3)], h: [0.8, 0.9, 0.95][Math.floor(r() * 3)] }, { t: [10, 20][Math.floor(r() * 2)], h: [0.6, 0.8, 0.9][Math.floor(r() * 3)] }];
      const mem = [100, 120, 200][Math.floor(r() * 3)];
      const mode = r() < 0.5 ? "hier" : "simul";
      const res = amat(levels, mem, mode);
      card.append(h("h2", null, "Average access time"),
        h("p", null, `L1: ${levels[0].t} ns, hit ratio ${levels[0].h}. L2: ${levels[1].t} ns, hit ratio ${levels[1].h}. Memory: ${mem} ns. ${mode === "hier" ? "A miss goes on to the next level and the times add." : "All levels are searched at once."} What is the average access time in ns (two decimals)?`),
        natQuestion(Math.round(res.value * 100) / 100, `${res.formula}: ${res.working} = ${res.value}.`, { tol: 0.01 }));
    }
    practice.replaceChildren(card);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  drawAmat();
  update();
  return () => sim?.player.destroy();
}
