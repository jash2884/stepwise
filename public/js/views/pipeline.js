import { BRANCH, cell, CODE, cycles, EXAMPLES, fromParams, parseProgram, randomProgram, RESOLVE, schedule, STAGES, timing, toParams } from "../engines/pipeline.js";
import { copyLink, fmt, h, notice, page, readParams, rng, writeParams } from "../ui.js";
import { exampleSelect, mountTabs, stat } from "./kit.js";
import { natQuestion, numIn, select, stepFrame } from "./coa-kit.js";

// Timing diagram up to cycle `now` (all of it when now is null).
export function diagram(res, now = null) {
  const T = res.total;
  const fwAt = new Map(res.forwards.map((f) => [`${f.to}:${f.cycle}`, f]));
  return h("div", { class: "coa-pipe-wrap", tabindex: 0, role: "region", "aria-label": "Pipeline timing diagram (scrolls sideways)" },
    h("table", { class: "coa-pipe" },
      h("thead", null, h("tr", null, h("th", { scope: "col", class: "ins" }, "Instruction"),
        Array.from({ length: T }, (_, c) => h("th", { scope: "col", class: c + 1 === now ? "now" : null }, c + 1)))),
      h("tbody", null, res.rows.map((row) => h("tr", null,
        h("th", { scope: "row", class: "ins" }, h("span", { class: "muted" }, `I${row.i + 1} `), row.ins.text),
        Array.from({ length: T }, (_, k) => {
          const c = k + 1;
          const x = cell(row, c);
          if (!x || (now != null && c > now)) return h("td", { class: c === now ? "now" : null });
          const f = fwAt.get(`${row.i}:${c}`);
          const cls = `st ${x.stage.toLowerCase()}${x.stall ? " stall" : ""}${c === now ? " now" : ""}${f ? " fwd" : ""}`;
          return h("td", { class: cls, title: f ? `${f.reg} forwarded from ${f.latch}` : x.stall ? "stalled" : x.stage }, x.stall ? (x.stage === "ID" ? "stall" : "IF") : x.stage, f ? h("small", null, "↙") : null);
        }))))));
}

function occupancy(step) {
  return h("div", { class: "coa-occ", "aria-label": "What each stage holds this cycle" }, STAGES.map((s) => h("div", { class: `coa-occ-cell ${s.toLowerCase()}${step.occ[s] ? "" : " empty"}` },
    h("small", null, s), h("b", null, step.occ[s] ?? (s === "EX" ? "bubble" : "empty")))));
}

export function simulation(res) {
  const steps = cycles(res);
  return stepFrame(steps, CODE, (s) => h("div", null, occupancy(s), diagram(res, s.cycle),
    h("p", { class: "muted small" }, "Hatched cells are stalls. ↙ marks an operand arriving by forwarding.")),
  { label: "Cycle", interval: 900 });
}

function timingCard(res, delays, latch) {
  const t = timing(delays, latch, res.n, res.total);
  return h("section", { class: "card" }, h("h2", null, "Clock, time and speedup"),
    h("p", null, `Clock period = slowest stage + latch = ${Math.max(...delays)} + ${latch} = `, h("b", null, `${t.clock} ps`), "."),
    h("div", { class: "stats-row" },
      stat("Pipelined time", `${t.pipelined} ps`), stat("Without a pipeline", `${t.unpipelined} ps`),
      stat("Speedup", fmt(t.speedup, 3)), stat("Throughput", `${fmt(t.throughput * 1000, 3)} per ns`), stat("Speedup limit", fmt(t.limit, 3))),
    h("p", { class: "muted small" }, `Pipelined: ${t.cycles} cycles × ${t.clock} ps. Without a pipeline each instruction takes ${delays.join(" + ")} = ${t.single} ps and no latches, so ${res.n} × ${t.single}. Speedup = ${t.unpipelined} ÷ ${t.pipelined}. With very many instructions and no stalls it tends to ${t.single} ÷ ${t.clock} = ${fmt(t.limit, 3)}: below 5, because the stages aren't balanced and latches cost time.`));
}

function comparison(program, opts) {
  const variants = [
    ["No forwarding", { ...opts, forwarding: false }], ["Forwarding", { ...opts, forwarding: true }],
    ["Forwarding, branch in ID", { ...opts, forwarding: true, resolve: "id" }], ["Forwarding, predict not taken", { ...opts, forwarding: true, branch: "pnt" }],
  ];
  return h("section", { class: "card" }, h("h2", null, "Same code, other designs"),
    h("div", { class: "table-wrap" }, h("table", null,
      h("thead", null, h("tr", null, ["Design", "Cycles", "Stalls", "CPI"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, variants.map(([name, o]) => {
        const r = schedule(program, o);
        const same = o.forwarding === opts.forwarding && o.resolve === opts.resolve && o.branch === opts.branch;
        return h("tr", { class: same ? "current" : null }, h("th", { scope: "row" }, name), h("td", null, r.total), h("td", null, r.stallCycles), h("td", null, fmt(r.cpi, 3)));
      })))),
    h("p", { class: "muted small" }, "CPI here is total cycles ÷ instructions, which includes the 4 cycles to fill the pipeline. Over a long program it approaches 1 + stalls per instruction."));
}

export function render(root) {
  const st = fromParams(readParams());
  let sim = null;

  const head = page({
    subject: "Computer organisation",
    title: "Pipelining",
    lede: "Draw the timing diagram for a 5-stage pipeline cycle by cycle, and see exactly where hazards cost you stalls.",
    theory: h("div", null,
      h("p", null, "A pipeline overlaps instructions: while one is in EX, the next is in ID and the one after that is being fetched. With k stages and no stalls, n instructions take ", h("b", null, "k + n − 1"), " cycles instead of k × n."),
      h("ul", null,
        h("li", null, h("b", null, "Data hazards"), ": an instruction needs a register that an earlier one hasn't written yet. Without forwarding it waits in ID until the value is written back. With ", h("b", null, "forwarding"), ", the value is taken straight from the EX/MEM or MEM/WB latch."),
        h("li", null, h("b", null, "Load-use"), ": a loaded value only exists after MEM, so even with forwarding the next instruction must stall one cycle."),
        h("li", null, h("b", null, "Control hazards"), ": the instruction after a branch isn't known until the branch resolves. Stalling costs 1, 2 or 3 cycles if it resolves in ID, EX or MEM; predicting not taken loses them only when the branch is taken."),
        h("li", null, h("b", null, "Structural hazards"), ": two stages want the same hardware. Separate instruction and data memories avoid the classic one.")),
      h("p", null, "Clock period = slowest stage + latch delay. Speedup = time without a pipeline ÷ time with it. CPI = cycles ÷ instructions; in the long run, 1 + average stall cycles per instruction.")),
    conventions: [
      "Stages: IF, ID, EX, MEM, WB, one cycle each. Separate instruction and data memories, so no structural hazards.",
      "The register file is written in the first half of a cycle and read in the second half, so WB and ID can share a cycle.",
      "A stall holds the instruction in ID (and the next one in IF) and sends a bubble into EX.",
      "Forwarding feeds EX from the EX/MEM or MEM/WB latch; a store's data can also be forwarded into MEM. A branch compared in ID needs its operands at the start of ID.",
      "The program is the order instructions actually run. Write taken after a branch to mark it taken; its target is just the next line.",
      "Without a pipeline, an instruction takes the sum of the stage delays and pays no latch delay.",
    ],
  });

  const msg = h("div"), out = h("div", { class: "output" });
  const progBox = h("textarea", { rows: 6, class: "mono", "aria-label": "Program, one instruction per line", spellcheck: "false", onchange: (e) => { st.program = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); update(); } });
  const opts = h("div");

  function drawOpts() {
    opts.replaceChildren(
      h("div", { class: "row" },
        select("", { 1: "Forwarding on", 0: "No forwarding" }, st.opts.forwarding ? "1" : "0", (v) => { st.opts.forwarding = v === "1"; update(); }),
        select("Branch resolves in", RESOLVE, st.opts.resolve, (v) => { st.opts.resolve = v; update(); }),
        select("", BRANCH, st.opts.branch, (v) => { st.opts.branch = v; update(); })),
      h("div", { class: "row coa-delays" }, h("span", { class: "small muted" }, "Stage delays (ps)"),
        STAGES.map((s, i) => numIn(s, st.delays[i], (v) => { st.delays[i] = v; update(); }, { min: 1, width: 70 })),
        numIn("Latch", st.latch, (v) => { st.latch = v; update(); }, { min: 0, width: 64 })));
  }

  function update() {
    progBox.value = st.program.join("\n");
    drawOpts();
    writeParams(toParams(st));
    sim?.player.destroy();
    try {
      const program = parseProgram(st.program.join("\n"));
      const res = schedule(program, st.opts);
      timing(st.delays, st.latch, res.n, res.total);
      msg.replaceChildren();
      sim = simulation(res);
      out.replaceChildren(
        h("section", { class: "card" }, h("h2", null, `${res.n} instructions, ${res.total} cycles`), sim.el,
          h("div", { class: "stats-row" },
            stat("Cycles", res.total), stat("Ideal (n + 4)", res.ideal), stat("Stall cycles", res.stallCycles),
            stat("CPI (cycles ÷ n)", fmt(res.cpi, 3)), stat("Steady-state CPI", fmt(res.steadyCpi, 3))),
          res.hazards.length ? h("div", null, h("h3", { class: "sub-h" }, "Hazards"), h("ul", { class: "notes" }, res.hazards.map((x) => h("li", null, h("b", null, x.type === "load-use" ? "Load-use: " : x.type === "control" ? "Control: " : "Data: "), x.text))))
            : h("p", { class: "muted" }, "No stalls: every dependency is covered by forwarding or is far enough apart.")),
        timingCard(res, st.delays, st.latch), comparison(program, st.opts));
    } catch (e) {
      msg.replaceChildren(notice("error", e.message)); out.replaceChildren();
    }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("p", { class: "muted small" }, "One instruction per line: LW R1, 0(R2) · SW R1, 4(R3) · ADD/SUB/AND/OR/MUL R1, R2, R3 · ADDI R1, R2, 4 · BEQ/BNE R1, R2, L (add taken) · NOP"),
      progBox, opts,
      h("div", { class: "row" },
        exampleSelect(EXAMPLES, (ex) => { st.program = [...ex.program]; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: () => { st.program = randomProgram(rng()); update(); } }, "Random"),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      msg),
    out);

  // --- Practice -----------------------------------------------------------------
  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const again = h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question");
    const card = h("section", { class: "card" }, h("div", { class: "row" }, again));
    if (r() < 0.65) {
      const lines = randomProgram(r);
      const forwarding = r() < 0.5;
      const res = schedule(parseProgram(lines.join("\n")), { forwarding });
      const sol = h("div");
      card.append(h("h2", null, `How many cycles, ${forwarding ? "with" : "without"} forwarding?`),
        h("pre", { class: "mono coa-code" }, lines.join("\n")),
        h("p", { class: "muted small" }, "Classic 5-stage pipeline, register file written then read in the same cycle, separate memories."),
        natQuestion(res.total, `${res.ideal} ideal + ${res.stallCycles} stall${res.stallCycles === 1 ? "" : "s"}. ${res.hazards.map((x) => x.text).join(" ")}`, { step: 1 }),
        h("button", { type: "button", class: "btn ghost", onclick: () => sol.replaceChildren(simulation(res).el) }, "Show the diagram"), sol);
    } else {
      const d = Array.from({ length: 5 }, () => [100, 120, 150, 160, 200][Math.floor(r() * 5)]);
      const latch = [0, 5, 10][Math.floor(r() * 3)], n = [10, 20, 100][Math.floor(r() * 3)];
      const t = timing(d, latch, n);
      card.append(h("h2", null, "Speedup with unequal stages"),
        h("p", null, `Stage delays ${d.join(", ")} ps, latch delay ${latch} ps. ${n} independent instructions. What is the speedup over the same hardware without pipelining (two decimals)?`),
        natQuestion(Math.round(t.speedup * 100) / 100, `Clock = ${Math.max(...d)} + ${latch} = ${t.clock} ps. Pipelined: (5 + ${n} − 1) × ${t.clock} = ${t.pipelined}. Unpipelined: ${n} × ${t.single} = ${t.unpipelined}. Speedup = ${fmt(t.speedup, 3)}.`, { tol: 0.01 }));
    }
    practice.replaceChildren(card);
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => sim?.player.destroy();
}
