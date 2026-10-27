import { basicBlocks, blockLine, EXAMPLES, LEADER_CODE, OPT_CODE, optimise, parseTac, PASSES, randomTac, show } from "../engines/optimise.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { stateDiagram } from "../diagram.js";
import { copyLink, h, morph, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, series, stat } from "./kit.js";

const label = (ins) => `${ins.labels.length ? `${ins.labels.join(": ")}: ` : ""}${show(ins)}`;

// The flow graph with each block's current code inside its box.
function cfgDiagram(blocks, codeOf, edges, { active = [], aria }) {
  const states = [{ id: "ENTRY", lines: [] }, ...blocks.map((b) => ({ id: b.id, lines: codeOf(b) })), { id: "EXIT", lines: [] }];
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  const classes = Object.fromEntries(blocks.map((b, k) => [b.id, "grp"]));
  const styles = Object.fromEntries(blocks.map((b, k) => [b.id, series(k)]));
  return stateDiagram({ states: states.filter((s) => s.id !== "EXIT" || used.has("EXIT")), edges, start: "ENTRY", shape: "box", active, classes, styles, aria });
}

function listing(prog, st) {
  const leaders = new Set(st.leaders), blockAt = new Map();
  st.blocks.forEach((b, k) => { for (let i = b.start; i <= b.end; i++) blockAt.set(i, k); });
  return h("ol", { class: "opt-listing" }, prog.map((ins, i) => {
    const k = blockAt.get(i);
    return h("li", { class: [i === st.at && "now", leaders.has(i) && "leader", k != null && "in-block"].filter(Boolean).join(" "), style: k != null ? series(k) : null },
      h("span", { class: "opt-num" }, `(${ins.num})`),
      h("code", null, label(ins)),
      leaders.has(i) ? h("span", { class: "opt-badge", title: st.reasons[i] }, k != null && st.blocks[k].start === i ? `${st.blocks[k].id} · ${st.reasons[i].split(":")[0]}` : st.reasons[i].split(":")[0]) : null);
  }));
}

function diff(step) {
  if (step.done) return h("p", { class: "muted" }, "No pass changes anything any more.");
  return h("ol", { class: "opt-diff" }, step.before.flatMap((line, i) => {
    if (i !== step.at) return [h("li", null, h("code", null, line))];
    return [h("li", { class: "del" }, h("code", null, line)), step.now ? h("li", { class: "ins" }, h("code", null, step.now)) : null];
  }));
}

export function render(root) {
  const p = readParams();
  const all = Object.keys(PASSES);
  const state = { src: p.get("src") ?? EXAMPLES.quicksort.text, passes: p.get("passes") ? p.get("passes").split(",").filter((x) => PASSES[x]) : [...all] };
  let players = [];
  const head = page({
    subject: "Compiler design", title: "Code optimisation",
    lede: "Split three-address code into basic blocks, draw the flow graph, then watch local optimisations rewrite each block one instruction at a time.",
    theory: h("div", null,
      h("p", null, "A ", h("b", null, "basic block"), " is a run of instructions that is always entered at the top and left at the bottom. Find the ", h("b", null, "leaders"), ": (1) the first instruction, (2) every jump target, (3) every instruction straight after a jump. Each block runs from a leader up to the next one, and the ", h("b", null, "flow graph"), " joins blocks that can follow each other."),
      h("p", null, h("b", null, "Local"), " optimisations work inside one block:"),
      h("ul", null,
        h("li", null, h("b", null, "Constant propagation"), " and ", h("b", null, "copy propagation"), ": after x = 5 (or x = y), later uses of x can read 5 (or y) instead, until x or y changes."),
        h("li", null, h("b", null, "Common subexpressions"), ": if y op z was already computed into v and neither operand changed, reuse v."),
        h("li", null, h("b", null, "Constant folding"), ": work out 3 * 4 at compile time. ", h("b", null, "Algebraic identities"), " drop x + 0 and x * 1; ", h("b", null, "strength reduction"), " swaps a costly operation for a cheaper one (x * 2 → x + x, x * 8 → x << 3, x^2 → x * x)."),
        h("li", null, h("b", null, "Dead-code elimination"), ": delete x = … when x is never read again. That needs ", h("i", null, "liveness"), " at the end of the block, worked out over the whole flow graph.")),
      h("p", null, "Each pass makes more work for the others (a copy introduced by CSE is propagated, which leaves a dead assignment), so they repeat until a whole round changes nothing.")),
    conventions: ["One instruction per line, optionally numbered like (5); labels are written L1: …; jumps are goto L, if a < b goto L, ifFalse x goto L.", "Unless a line says live: x y, every variable except the temporaries t1, t2, … is live at the end (and nothing is, after a return).", "Arrays: x = a[i] and a[i] = x. A store to a kills every remembered load from a. << means multiply by a power of 2."],
  });

  const srcIn = h("textarea", { rows: 10, class: "mono", "aria-label": "Three-address code", oninput: (e) => { state.src = e.target.value; update(); } }, state.src);
  const passRow = h("div", { class: "row" }, Object.entries(PASSES).map(([k, v]) => h("button", { type: "button", class: "btn ghost toggle small", "aria-pressed": String(state.passes.includes(k)), onclick: (e) => {
    state.passes = state.passes.includes(k) ? state.passes.filter((x) => x !== k) : all.filter((x) => x === k || state.passes.includes(x));
    e.currentTarget.setAttribute("aria-pressed", String(state.passes.includes(k)));
    update();
  } }, v.name)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    players.forEach((x) => x.destroy());
    players = [];
    writeParams({ src: state.src, ...(state.passes.length === all.length ? {} : { passes: state.passes.join(",") }) });
    let parsed, bb, opt;
    try { parsed = parseTac(state.src); bb = basicBlocks(parsed); opt = optimise(bb.cfg, state.passes); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const { prog } = parsed;

    // 1. Leaders, blocks and the flow graph.
    const list1 = h("div"), graph1 = h("div", { class: "chart-wrap opt-cfg" }), note1 = h("p", { class: "step-note", "aria-live": "polite" });
    const code1 = codePanel(LEADER_CODE), vars1 = varsPanel();
    const p1 = stepper({
      count: bb.steps.length, label: "Step", interval: 900,
      render: (i) => {
        const st = bb.steps[i];
        list1.replaceChildren(listing(prog, st));
        if (st.blocks.length) {
          graph1.hidden = false;
          const last = i === bb.steps.length - 1;
          morph(graph1, cfgDiagram(st.blocks.map((b) => ({ ...b })), (b) => prog.slice(b.start, b.end + 1).map((x) => show(x)), st.edges, { active: st.blocks.some((b) => b.end === st.at) && st.edges.length ? [st.blocks.find((b) => b.end === st.at).id] : [st.blocks.at(-1).id], aria: `Flow graph with ${st.blocks.length} blocks${last ? "" : " so far"}.` }));
        } else graph1.hidden = true;
        code1.show(st.line); vars1.show(st.vars);
        note1.textContent = st.note;
        note1.className = `step-note${i === bb.steps.length - 1 ? " good" : ""}`;
      },
    });

    // 2. Local optimisation, one rewrite at a time.
    const snaps = [], cur = Object.fromEntries(bb.cfg.blocks.map((b) => [b.id, b.code.map(blockLine)]));
    for (const s of opt.steps) { if (!s.done) cur[s.block] = s.after; snaps.push({ ...cur }); }
    const head2 = h("div", { class: "opt-pass-row" }), diffBox = h("div"), graph2 = h("div", { class: "chart-wrap opt-cfg" }), note2 = h("p", { class: "step-note", "aria-live": "polite" });
    const code2 = codePanel(OPT_CODE), vars2 = varsPanel();
    const p2 = stepper({
      count: opt.steps.length, label: "Rewrite", interval: 1100,
      render: (i) => {
        const st = opt.steps[i];
        head2.replaceChildren(...Object.entries(PASSES).map(([k, v]) => h("span", { class: `opt-chip${st.pass === k ? " on" : ""}${state.passes.includes(k) ? "" : " off"}` }, v.short)),
          h("span", { class: "opt-where" }, st.done ? `round ${st.round}: done` : `round ${st.round} · ${st.block}`));
        diffBox.replaceChildren(h("h3", { class: "small muted" }, st.done ? "Finished" : `${st.block}: before → after this rewrite`), diff(st));
        morph(graph2, cfgDiagram(bb.cfg.blocks, (b) => snaps[i][b.id], bb.edges, { active: st.block ? [st.block] : [], aria: `Flow graph after rewrite ${i + 1}.` }));
        code2.show(st.line); vars2.show(st.vars);
        note2.textContent = st.note;
        note2.className = `step-note${st.done ? " good" : ""}`;
      },
    });
    players.push(p1, p2);

    const before = prog.length, after = opt.cfg.blocks.reduce((s, b) => s + b.code.length, 0);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "1. Leaders, basic blocks and the flow graph"), p1.el, note1,
        traceLayout(list1, code1, vars1), graph1,
        h("div", { class: "stats-row" }, stat("Instructions", prog.length), stat("Leaders", bb.leaders.length), stat("Basic blocks", bb.blocks.length), stat("Edges", bb.edges.length))),
      h("section", { class: "card" }, h("h2", null, "2. Local optimisation"), p2.el, note2,
        traceLayout(h("div", null, head2, diffBox), code2, vars2), h("h3", { class: "small muted opt-gap" }, "Flow graph now"), graph2,
        h("div", { class: "stats-row" }, stat("Rewrites", opt.steps.length - 1), stat("Rounds", opt.rounds), stat("Instructions", `${before} → ${after}`),
          ...Object.entries(opt.counts).filter(([, n]) => n).map(([k, n]) => stat(PASSES[k].short, n)))),
      h("section", { class: "card" }, h("h2", null, "Before and after"),
        h("div", { class: "opt-compare" }, bb.cfg.blocks.map((b, k) => {
          const now = opt.cfg.blocks[k].code.map(blockLine);
          return h("div", { class: "opt-block", style: series(k) }, h("b", null, b.id),
            h("div", { class: "opt-two" },
              h("ol", { class: "opt-mini" }, b.code.map((x) => h("li", { class: now.includes(blockLine(x)) ? null : "gone" }, blockLine(x)))),
              h("ol", { class: "opt-mini" }, now.length ? now.map((x) => h("li", { class: b.code.some((y) => blockLine(y) === x) ? null : "new" }, x)) : h("li", { class: "muted" }, "(empty)"))));
        })),
        h("p", { class: "muted small" }, "Left: the block as written (struck-out lines were removed or rewritten). Right: after the selected passes (new or rewritten lines in green). Jumps now name blocks."),
        h("p", null, h("a", { href: `/register-allocation?src=${encodeURIComponent(state.src)}` }, "Allocate registers for this code →"))));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.src = ex.text; srcIn.value = ex.text; update(); }),
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "Three-address code", srcIn),
      h("div", { class: "small muted" }, "Passes to run:"), passRow,
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng(), kind = r();
    let body;
    if (kind < 0.66) {
      let src, bb;
      for (let k = 0; k < 30; k++) {
        src = randomTac(r, { n: 8 + Math.floor(r() * 3), jumps: true });
        bb = basicBlocks(parseTac(src));
        if (bb.blocks.length >= 3) break;
      }
      const prog = parseTac(src).prog;
      const numbered = h("ol", { class: "opt-listing" }, prog.map((ins) => h("li", null, h("span", { class: "opt-num" }, `(${ins.num})`), h("code", null, label(ins)))));
      if (kind < 0.33) {
        const picked = new Set(), feedback = h("div");
        const truth = bb.leaders.map((i) => i + 1);
        body = [h("h2", null, "Which instructions are leaders?"), numbered,
          h("p", { class: "muted" }, "Select every leader by its number."),
          h("div", { class: "row" }, prog.map((ins) => h("button", { type: "button", class: "btn ghost toggle mono small", "aria-pressed": "false", onclick: (e) => {
            picked.has(ins.num) ? picked.delete(ins.num) : picked.add(ins.num);
            e.currentTarget.setAttribute("aria-pressed", String(picked.has(ins.num)));
          } }, ins.num))),
          h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => {
            const ok = truth.length === picked.size && truth.every((x) => picked.has(x));
            feedback.replaceChildren(notice(ok ? "good" : "bad", `${ok ? "✓ Right." : "✗ Not quite."} The leaders are ${truth.map((n) => `(${n})`).join(", ")}: ${bb.leaders.map((i) => `(${i + 1}) by ${bb.reasons[i].split(":")[0]}`).join(", ")}.`));
          } }, "Check")), feedback];
      } else {
        body = [h("h2", null, "How many basic blocks does this code have?"), numbered,
          numberQuestion(bb.blocks.length, `Leaders ${bb.leaders.map((i) => `(${i + 1})`).join(", ")} start ${bb.blocks.length} blocks.`)];
      }
    } else {
      let src, right, opts;
      for (let k = 0; k < 40; k++) {
        const v = () => "xyz"[Math.floor(r() * 3)], c = () => String(1 + Math.floor(r() * 6)), op = () => "+-*"[Math.floor(r() * 3)];
        src = [`a = ${c()}`, `b = a ${op()} ${c()}`, `c = b ${op()} ${v()}`, `d = ${c()} ${op()} ${c()}`, `e = c ${op()} d`, "live: c e"].join("\n");
        const cfg = basicBlocks(parseTac(src)).cfg;
        const run = (ps) => optimise(cfg, ps).cfg.blocks[0].code.map(blockLine).join("\n");
        right = run(["constprop", "fold"]);
        opts = [...new Set([right, run(["fold"]), run(["constprop"]), run(["constprop", "fold", "dce"])])];
        if (opts.length >= 3) break;
      }
      const c = choice(opts.map((o) => ({ label: o, correct: o === right })).sort(() => r() - 0.5),
        "Propagate each constant into the next instruction, then fold, and repeat: a constant produced by folding can be propagated again. Dead-code elimination is a separate pass, so nothing is deleted here.");
      for (const b of c.querySelectorAll("button")) b.classList.add("mono", "pre");
      body = [h("h2", null, "What does this block become after constant propagation and constant folding (repeated until nothing changes)?"),
        h("pre", { class: "grammar-box" }, src.split("\n").filter((l) => !l.startsWith("live")).join("\n")), c];
    }
    practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => players.forEach((x) => x.destroy());
}
