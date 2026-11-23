import { codeFor, expanding, format, fromParams, MANO, memoryText, MODES, parseMemory, parseTypes, randomState, run, runAll, toParams, typesText } from "../engines/addressing.js";
import { copyLink, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { mountTabs } from "./kit.js";
import { natQuestion, numIn, select, stepFrame } from "./coa-kit.js";

const MODE_NAMES = Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, v.name]));

function machine(res, s) {
  const st = res.state;
  const lit = new Set(s.lit ?? []);
  const reads = new Set(s.reads ?? []);
  const after = s.vars;
  const regs = [["PC", after.PC], ["R", after.R], ["XR", st.X], ["BR", st.B], ["EA", after.EA ?? "…"], ["AC", after.AC ?? "…"]];
  const addrs = [...new Set([...Object.keys(st.mem).map(Number), st.pc, st.pc + st.words - 1, ...(res.ea != null ? [res.ea] : [])])].sort((a, b) => a - b);
  const inInstr = (a) => a >= st.pc && a < st.pc + st.words;
  return h("div", { class: "coa-machine" },
    h("div", { class: "coa-instr", "aria-label": "Instruction" },
      h("div", { class: "coa-instr-f op" }, h("small", null, "opcode"), "LOAD AC"),
      h("div", { class: "coa-instr-f mode" }, h("small", null, "mode"), MODES[res.mode].name),
      h("div", { class: "coa-instr-f addr" }, h("small", null, "address A"), st.A)),
    h("div", { class: "coa-regs" }, regs.map(([k, v]) => h("div", { class: `coa-reg${lit.has(k) ? " lit" : ""}${k === "AC" && v !== "…" ? " done" : ""}` }, h("small", null, k), h("b", null, v)))),
    h("div", { class: "table-wrap" }, h("table", { class: "coa-mem" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Address"), h("th", { scope: "col" }, "Memory"))),
      h("tbody", null, addrs.map((a) => h("tr", { class: reads.has(a) ? (a === s.ea ? "hot ea" : "hot") : null },
        h("th", { scope: "row" }, a), h("td", null, inInstr(a) ? h("span", { class: "muted" }, a === st.pc ? "instruction" : "instruction (A)") : st.mem[a] ?? h("span", { class: "muted" }, "0"))))))));
}

export function simulation(res) {
  return stepFrame(res.steps, codeFor(res.mode), (s) => machine(res, s), { label: "Stage", interval: 1300 });
}

function allModes(st, current, pick) {
  const rows = runAll(st);
  return h("section", { class: "card" }, h("h2", null, "Every mode on the same instruction"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Mode", "Rule", "EA", "AC gets", "Memory reads", "R after"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, rows.map((x) => h("tr", { class: x.mode === current ? "current" : null },
        h("th", { scope: "row" }, h("button", { type: "button", class: "btn ghost small", onclick: () => pick(x.mode) }, MODES[x.mode].name)),
        h("td", { class: "small" }, MODES[x.mode].ea), h("td", null, x.ea ?? "none"), h("td", null, x.operand), h("td", null, x.memRefs), h("td", null, x.R)))))),
    h("p", { class: "muted small" }, "Memory reads count only the operand and any address lookups, not fetching the instruction itself."));
}

function formatCard(f, onChange) {
  let res, err;
  try { res = format(f); } catch (e) { err = e.message; }
  const fields = res && res.fits ? [["op", "opcode", res.opBits], ...Array.from({ length: f.regFields }, (_, i) => ["reg", `register ${i + 1}`, res.regBits, i]), ["imm", "address / immediate", res.rest]].filter((x) => x[2] > 0) : [];
  return h("section", { class: "card" }, h("h2", null, "Instruction format"),
    h("div", { class: "row" },
      numIn("Instruction bits", f.L, (v) => onChange({ ...f, L: v }), { min: 4, max: 128, step: 1, width: 70 }),
      numIn("Instructions", f.opcodes, (v) => onChange({ ...f, opcodes: v }), { min: 1, step: 1, width: 80 }),
      numIn("Registers", f.registers, (v) => onChange({ ...f, registers: v }), { min: 0, step: 1, width: 70 }),
      numIn("Register fields", f.regFields, (v) => onChange({ ...f, regFields: v }), { min: 0, max: 4, step: 1, width: 60 }),
      numIn("Memory words (optional)", f.memWords, (v) => onChange({ ...f, memWords: v }), { min: 0, step: 1, width: 100 })),
    err ? notice("error", err) : h("div", null,
      fields.length ? h("div", { class: "coa-format", role: "img", "aria-label": fields.map((x) => x[1]).join(", ") }, fields.map(([cls, label, bits]) => h("div", { class: `coa-format-f ${cls}`, style: `flex:${bits}` }, h("b", null, bits), h("small", null, label)))) : null,
      h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s))),
      res.fits && res.rest > 0 ? h("p", { class: "muted small" }, `An unsigned immediate of ${res.rest} bits holds 0 to ${res.maxImmediate}; as two's complement, −${2 ** (res.rest - 1)} to ${2 ** (res.rest - 1) - 1}.`) : null));
}

function expandingCard(exp, onChange) {
  let res, err;
  try { res = expanding(exp.L, exp.types); } catch (e) { err = e.message; }
  const total = 2 ** exp.L;
  const bar = res ? (() => {
    const segs = res.order.map((i) => { const t = exp.types[i]; const n = t.count ?? res.answer; return { i, share: (n * 2 ** t.bits) / total, label: `kind ${i + 1}: ${n}` }; });
    const left = res.left / total;
    return h("div", { class: "coa-space", role: "img", "aria-label": `Pattern space: ${segs.map((s) => s.label).join(", ")}${left ? ", unused" : ""}` },
      segs.map((s, k) => h("div", { class: "coa-space-seg", style: `flex:${Math.max(s.share, 0.0001)};--c:var(--series-${(k % 8) + 1})`, title: `${s.label} (${Math.round(s.share * 1000) / 10}% of all patterns)` }, s.share > 0.08 ? s.label : "")),
      left > 0 ? h("div", { class: "coa-space-seg unused", style: `flex:${left}`, title: "unused" }, left > 0.08 ? "unused" : "") : null);
  })() : null;
  return h("section", { class: "card" }, h("h2", null, "Expanding opcodes"),
    h("p", { class: "muted small" }, "List each kind of instruction as count:operand bits, most operand bits first or in any order. Put ? for the count to work out. Example: 4:12 8:12 14:10 ?:6."),
    h("div", { class: "row" },
      numIn("Instruction bits", exp.L, (v) => onChange({ ...exp, L: v }), { min: 2, max: 64, step: 1, width: 70 }),
      h("input", { type: "text", class: "wide mono", value: typesText(exp.types), "aria-label": "Instruction kinds", onchange: (e) => { try { onChange({ ...exp, types: parseTypes(e.target.value) }); } catch (er) { e.target.classList.add("wrong"); e.target.title = er.message; } } })),
    err ? notice("error", err) : h("div", null,
      bar,
      h("ol", { class: "notes" }, res.steps.map((s) => h("li", null, s))),
      res.answer != null ? h("p", { class: "big-answer" }, "Largest possible count: ", h("b", null, res.answer)) : null,
      h("p", { class: "muted small" }, "Why counting patterns works: an instruction with b operand bits uses up 2^b whole bit patterns. Giving the kinds with the most operand bits the shortest opcodes, and reserving leftover opcodes as escape prefixes for the next kind, uses the space with nothing wasted.")));
}

export function render(root) {
  const st = fromParams(readParams());
  let sim = null;
  const head = page({
    subject: "Computer organisation",
    title: "Addressing modes",
    lede: "Follow one LOAD instruction through every addressing mode, and design instruction formats bit by bit.",
    theory: h("div", null,
      h("p", null, "The ", h("b", null, "addressing mode"), " says how to find an instruction's operand. The ", h("b", null, "effective address"), " (EA) is the memory address the operand is finally read from."),
      h("ul", null,
        h("li", null, h("b", null, "Immediate"), ": the operand is in the instruction. ", h("b", null, "Register"), ": it's in a register. Neither touches memory."),
        h("li", null, h("b", null, "Direct"), ": EA = A. ", h("b", null, "Indirect"), ": memory at A holds the EA, so one extra memory read."),
        h("li", null, h("b", null, "Register indirect"), ": a register holds the EA. ", h("b", null, "Autoincrement / autodecrement"), " do the same and then step the register on (or step it back first), handy for arrays and stacks."),
        h("li", null, h("b", null, "Indexed"), ": EA = A + index register. ", h("b", null, "Base"), ": EA = base register + A. ", h("b", null, "PC-relative"), ": EA = PC + A, where PC already points at the next instruction.")),
      h("p", null, "An ", h("b", null, "instruction format"), " splits the instruction bits into an opcode (⌈log₂ instructions⌉ bits), register fields (⌈log₂ registers⌉ bits each) and an address or immediate field with whatever is left. With ", h("b", null, "expanding opcodes"), ", instructions with fewer operands use the bits the operands would have taken as extra opcode bits.")),
    conventions: [
      "LOAD AC is a two-word instruction (change it with Words). After the fetch, PC points at the next instruction: PC = instruction address + words.",
      "R is the register named in the instruction; XR is the index register and BR the base register.",
      "Autoincrement uses R, then adds d. Autodecrement subtracts d first, then uses R.",
      "Memory words you haven't set read as 0.",
      "The default example is Mano's (Computer System Architecture, Fig. 8-7), with a base register added.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" }), fmtOut = h("div"), expOut = h("div");
  const controls = h("div");
  const save = () => writeParams(toParams(st));

  function drawControls() {
    const s = st.st;
    const set = (k) => (v) => { s[k] = v; update(); };
    controls.replaceChildren(
      h("div", { class: "row" }, select("Mode", MODE_NAMES, st.mode, (v) => { st.mode = v; update(); })),
      h("div", { class: "row" },
        numIn("Instruction at", s.pc, set("pc"), { step: 1, width: 80 }), numIn("Words", s.words, set("words"), { min: 1, max: 4, step: 1, width: 56 }),
        numIn("A", s.A, set("A"), { step: 1, width: 80 }), numIn("R", s.R, set("R"), { step: 1, width: 80 }),
        numIn("XR", s.X, set("X"), { step: 1, width: 80 }), numIn("BR", s.B, set("B"), { step: 1, width: 80 }), numIn("d", s.d, set("d"), { step: 1, width: 56 })),
      h("div", { class: "row" }, h("label", { class: "inline", style: "flex:1;min-width:0" }, "Memory", h("input", {
        type: "text", class: "wide mono", value: memoryText(s.mem), "aria-label": "Memory as address:value pairs",
        onchange: (e) => { try { s.mem = parseMemory(e.target.value); update(); } catch (er) { msg.replaceChildren(notice("error", er.message)); } },
      }))),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn ghost", onclick: () => { st.st = { ...MANO, mem: { ...MANO.mem } }; update(); } }, "Mano's example"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { st.st = randomState(rng()); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")));
  }

  function drawFormats() {
    fmtOut.replaceChildren(formatCard(st.format, (f) => { st.format = f; drawFormats(); save(); }));
    expOut.replaceChildren(expandingCard(st.exp, (e) => { st.exp = e; drawFormats(); save(); }));
  }

  function update() {
    drawControls();
    save();
    sim?.player.destroy();
    try {
      const res = run(st.mode, st.st);
      msg.replaceChildren();
      sim = simulation(res);
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, `${MODES[st.mode].name}: ${MODES[st.mode].ea}`), sim.el),
        allModes(st.st, st.mode, (m) => { st.mode = m; update(); window.scrollTo?.({ top: 0, behavior: "smooth" }); }));
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" }, h("section", { class: "card inputs" }, controls, msg), out, fmtOut, expOut);

  // --- Practice -----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const again = h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question");
    const card = h("section", { class: "card" }, h("div", { class: "row" }, again));
    const kind = r();
    if (kind < 0.6) {
      const s = randomState(r);
      const modes = Object.keys(MODES);
      const mode = modes[Math.floor(r() * modes.length)];
      const res = run(mode, s);
      const ask = res.ea == null || r() < 0.4 ? "operand" : "ea";
      const sol = h("div");
      card.append(h("h2", null, `${MODES[mode].name} addressing`),
        h("p", null, `LOAD AC is a two-word instruction at ${s.pc}. A = ${s.A}, R = ${s.R}, XR = ${s.X}, BR = ${s.B}; autoincrement/decrement step by 1.`),
        h("div", { class: "table-wrap" }, h("table", { class: "coa-mem compact" }, h("tbody", null,
          h("tr", null, h("th", { scope: "row" }, "Address"), Object.keys(s.mem).sort((a, b) => a - b).map((a) => h("td", null, a))),
          h("tr", null, h("th", { scope: "row" }, "Value"), Object.keys(s.mem).sort((a, b) => a - b).map((a) => h("td", null, s.mem[a])))))),
        h("p", null, ask === "ea" ? "What is the effective address?" : "What value ends up in AC?"),
        natQuestion(ask === "ea" ? res.ea : res.operand, res.steps.slice(2).map((x) => x.note).join(" "), { step: 1 }),
        h("button", { type: "button", class: "btn ghost", onclick: () => sol.replaceChildren(simulation(res).el) }, "Step through it"), sol);
    } else if (kind < 0.85) {
      const L = [12, 16, 16, 24][Math.floor(r() * 4)], a = L === 12 ? 4 : L === 16 ? [4, 6][Math.floor(r() * 2)] : 8;
      const n2 = 1 + Math.floor(r() * (2 ** (L - 2 * a) - 1));
      const res = expanding(L, [{ count: n2, bits: 2 * a }, { count: null, bits: a }]);
      card.append(h("h2", null, "Expanding opcodes"),
        h("p", null, `${L}-bit instructions with ${a}-bit address fields. There are ${n2} two-address instructions. At most how many one-address instructions can there be?`),
        natQuestion(res.answer, res.steps.join(" "), { step: 1 }));
    } else {
      const f = { L: [16, 24, 32][Math.floor(r() * 3)], opcodes: 10 + Math.floor(r() * 100), registers: [8, 16, 32, 64][Math.floor(r() * 4)], regFields: 1 + Math.floor(r() * 2) };
      const res = format(f);
      if (res.rest < 1) return newQuestion();
      card.append(h("h2", null, "Instruction format"),
        h("p", null, `${f.L}-bit instructions, ${f.opcodes} instructions, ${f.registers} registers, ${f.regFields} register operand${f.regFields === 1 ? "" : "s"} and an immediate. How many bits does the immediate get?`),
        natQuestion(res.rest, res.steps.join(" "), { step: 1 }));
    }
    practice.replaceChildren(card);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  drawFormats();
  update();
  return () => sim?.player.destroy();
}
