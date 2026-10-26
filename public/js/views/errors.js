import { checksum, crc, crcCheck, GENERATORS, hammingCheck, hammingEncode, randomBits } from "../engines/errors.js";
import { copyLink, h, notice, page, readParams, rng, stepper, tabs, writeParams } from "../ui.js";

// Long division laid out as on paper: each XOR under the bits it works on.
function division(padded, steps, upto, gen) {
  const lines = [h("div", { class: "div-line dividend" }, padded)];
  steps.slice(0, upto + 1).forEach((s, i) => {
    lines.push(h("div", { class: `div-line by${i === upto ? " current" : ""}` }, " ".repeat(s.at), h("u", null, s.by), `   ← ${s.by === gen ? "XOR generator" : "XOR 0s"}`));
    const next = steps[i + 1];
    if (next && i < upto) {
      // The XOR result with the next bit of the dividend brought down.
      lines.push(h("div", { class: "div-line result" }, " ".repeat(next.at), next.current.slice(0, -1), h("b", { class: "down", title: "bit brought down" }, next.current.at(-1))));
    } else if (!next) {
      lines.push(h("div", { class: `div-line result final${i === upto ? " current" : ""}` }, " ".repeat(s.at + 1), h("b", null, s.result), "   ← remainder"));
    }
  });
  return h("pre", { class: "division", "aria-label": "Long division steps" }, lines);
}

function hammingTable(word, highlight = [], bad = null) {
  const n = word.length;
  return h("div", { class: "table-wrap" }, h("table", { class: "hamming" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Position"), Array.from({ length: n }, (_, i) => h("th", { scope: "col" }, i + 1)))),
    h("tbody", null,
      h("tr", null, h("th", { scope: "row" }, "Role"), Array.from({ length: n }, (_, i) => h("td", { class: ((i + 1) & i) === 0 ? "parity" : "data" }, ((i + 1) & i) === 0 ? `P${i + 1}` : "D"))),
      h("tr", null, h("th", { scope: "row" }, "Bit"), [...word].map((b, i) => h("td", { class: `mono${highlight.includes(i + 1) ? " covered" : ""}${bad === i + 1 ? " bad" : ""}` }, b))))));
}

export function render(root) {
  const p = readParams();
  const state = { mode: ["crc", "hamming", "checksum"].includes(p.get("mode")) ? p.get("mode") : "crc", data: p.get("d") ?? "1101011111", gen: p.get("g") ?? "10011", hdata: p.get("hd") ?? "1011", received: p.get("rx") ?? "0110111", words: p.get("w") ?? "0110011001100000 0101010101010101 1000111100001100" };
  let player = null;
  const head = page({
    subject: "Computer networks", title: "Error detection & correction",
    lede: "CRC long division, Hamming codes that find and fix a flipped bit, and the Internet checksum, each worked step by step.",
    theory: h("div", null,
      h("p", null, h("b", null, "CRC"), ": append r zeros (r = generator length − 1), divide by the generator using XOR (no carries), and send the data followed by the remainder. The receiver divides the whole frame; a non-zero remainder means an error."),
      h("p", null, h("b", null, "Hamming code"), ": parity bits sit at positions 1, 2, 4, 8, …; parity bit P covers every position whose binary form includes P. On receipt, the failing checks add up to the position of a single flipped bit (the ", h("b", null, "syndrome"), ")."),
      h("p", null, h("b", null, "Internet checksum"), ": add the 16-bit words, wrapping any carry back into the lowest bit (one's complement), then flip every bit.")),
    conventions: ["Hamming uses even parity with parity bits at powers of two.", "CRC data and generators are written most significant bit first.", "Checksum words are 16 binary digits or up to 4 hex digits."],
  });

  const modeSel = h("select", { "aria-label": "Technique", onchange: (e) => { state.mode = e.target.value; update(); } },
    [["crc", "CRC"], ["hamming", "Hamming code"], ["checksum", "Internet checksum"]].map(([v, t]) => h("option", { value: v, selected: v === state.mode }, t)));
  const field = (key, label, cls = "mono") => h("label", { class: "stack" }, label, h("input", { type: "text", class: `${cls} wide`, value: state[key], "aria-label": label, oninput: (e) => { state[key] = e.target.value; update(); } }));
  const crcBox = h("div", { class: "grid-2 tight" }, field("data", "Data bits"), field("gen", "Generator (divisor)"));
  const hamBox = h("div", { class: "grid-2 tight" }, field("hdata", "Data bits to encode"), field("received", "Received codeword to check"));
  const sumBox = h("div", null, field("words", "16-bit words (binary or hex, space-separated)"));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ mode: state.mode, d: state.data, g: state.gen, hd: state.hdata, rx: state.received, w: state.words });
    crcBox.hidden = state.mode !== "crc"; hamBox.hidden = state.mode !== "hamming"; sumBox.hidden = state.mode !== "checksum";
    try {
      msg.replaceChildren();
      if (state.mode === "crc") {
        const r = crc(state.data, state.gen);
        const stage = h("div", { class: "chart-wrap" }), note = h("p", { class: "step-note", "aria-live": "polite" });
        player = stepper({ count: r.steps.length, label: "Step", interval: 800, render: (i) => { stage.replaceChildren(division(r.padded, r.steps, i, r.gen)); note.textContent = r.steps[i].note; } });
        const rx = h("input", { type: "text", class: "mono wide", value: r.codeword, "aria-label": "Received frame" });
        const verdict = h("div");
        const check = () => { try { const c = crcCheck(rx.value, r.gen); verdict.replaceChildren(notice(c.ok ? "good" : "bad", c.ok ? `Remainder ${c.remainder}: no error detected.` : `Remainder ${c.remainder} is not zero: ERROR detected.`)); } catch (e) { verdict.replaceChildren(notice("error", e.message)); } };
        rx.addEventListener("input", check);
        check();
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, `Divide ${r.data} + ${r.r} zeros by ${r.gen}`), player.el, stage, note,
            h("div", { class: "stats-row" },
              h("div", { class: "stat" }, h("span", null, "Remainder (CRC)"), h("b", { class: "mono" }, r.remainder)),
              h("div", { class: "stat wide-stat" }, h("span", null, "Transmitted frame"), h("b", { class: "mono order" }, h("span", null, r.data), h("span", { class: "crc-bits" }, r.remainder))))),
          h("section", { class: "card" }, h("h2", null, "Receiver check"), h("p", { class: "muted" }, "Flip any bit and see the remainder become non-zero."),
            h("div", { class: "row" }, rx, h("button", { type: "button", class: "btn ghost", onclick: () => { const i = Math.floor(Math.random() * rx.value.length); rx.value = rx.value.slice(0, i) + (rx.value[i] === "1" ? "0" : "1") + rx.value.slice(i + 1); check(); } }, "Flip a random bit")), verdict));
      } else if (state.mode === "hamming") {
        const e = hammingEncode(state.hdata);
        const c = hammingCheck(state.received);
        const encStage = h("div"), encNote = h("p", { class: "step-note" });
        player = stepper({ count: e.steps.length, label: "Parity bit", interval: 1100, render: (i) => { encStage.replaceChildren(hammingTable(e.codeword, [e.steps[i].parity, ...e.steps[i].covered])); encNote.textContent = e.steps[i].note; } });
        out.replaceChildren(
          h("section", { class: "card" }, h("h2", null, `Encode ${e.data}: ${e.parityBits} parity bits, ${e.n}-bit codeword`), player.el, encStage, encNote,
            h("p", { class: "big-answer" }, "Codeword: ", h("b", null, e.codeword))),
          h("section", { class: "card" }, h("h2", null, `Check received ${state.received.trim()}`), hammingTable(state.received.replace(/\s/g, ""), [], c.syndrome || null),
            h("ol", { class: "notes" }, c.steps.map((s) => h("li", { class: s.fails ? "bad-text" : null }, s.note))),
            notice(c.syndrome ? "bad" : "good", c.note)));
      } else {
        const r = checksum(state.words);
        out.replaceChildren(h("section", { class: "card" }, h("h2", null, "One's complement sum"),
          h("ol", { class: "notes mono-notes" }, r.steps.map((s) => h("li", null, s.note))),
          h("div", { class: "stats-row" },
            h("div", { class: "stat wide-stat" }, h("span", null, "Checksum (binary)"), h("b", { class: "mono order" }, r.binary)),
            h("div", { class: "stat" }, h("span", null, "Hex"), h("b", { class: "mono" }, `0x${r.hex}`))),
          h("p", { class: "muted small" }, "The receiver adds every word plus the checksum the same way; an all-ones result (1111111111111111) means no error was detected.")));
      }
    } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); }
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" }, h("div", { class: "row" }, modeSel, h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")), crcBox, hamBox, sumBox, msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const kind = ["crc", "hamming", "checksum"][Math.floor(r() * 3)];
    const feedback = h("div");
    const input = h("input", { type: "text", class: "mono", "aria-label": "Your answer" });
    let prompt, truth, explain;
    if (kind === "crc") {
      const data = randomBits(r, 6 + Math.floor(r() * 5)), gen = GENERATORS[Math.floor(r() * 4)];
      const c = crc(data, gen);
      prompt = [h("h2", null, "CRC remainder"), h("p", null, "Data ", h("b", { class: "mono" }, data), ", generator ", h("b", { class: "mono" }, gen), `. What ${c.r}-bit remainder is appended?`)];
      truth = c.remainder; explain = () => h("div", { class: "chart-wrap" }, division(c.padded, c.steps, c.steps.length - 1, gen));
    } else if (kind === "hamming") {
      const e = hammingEncode(randomBits(r, 4 + Math.floor(r() * 4)));
      const pos = 1 + Math.floor(r() * e.n);
      const bad = e.codeword.slice(0, pos - 1) + (e.codeword[pos - 1] === "1" ? "0" : "1") + e.codeword.slice(pos);
      prompt = [h("h2", null, "Find the flipped bit"), h("p", null, "This Hamming codeword (even parity) arrived with one bit flipped: ", h("b", { class: "mono" }, bad), ". Which position (1-based) is wrong?")];
      truth = String(pos); explain = () => h("ol", { class: "notes" }, hammingCheck(bad).steps.map((s) => h("li", null, s.note)));
    } else {
      const w = Array.from({ length: 2 }, () => Math.floor(r() * 65536).toString(2).padStart(16, "0"));
      const c = checksum(w.join(" "));
      prompt = [h("h2", null, "Internet checksum"), h("p", null, "Compute the 16-bit checksum of ", h("b", { class: "mono" }, w.join(" + ")), " (answer in binary).")];
      truth = c.binary; explain = () => h("ol", { class: "notes mono-notes" }, c.steps.map((s) => h("li", null, s.note)));
    }
    practice.replaceChildren(h("section", { class: "card" },
      h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")),
      ...prompt,
      h("div", { class: "row" }, input, h("button", { type: "button", class: "btn primary", onclick: () => {
        const ok = input.value.replace(/\s/g, "") === truth;
        input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
        feedback.replaceChildren(notice(ok ? "good" : "bad", ok ? "✓ Right!" : `✗ The answer is ${truth}.`), explain());
      } }, "Check")),
      feedback));
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
