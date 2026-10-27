import { CODE, EXAMPLES, layoutER, mapER, parseER, randomER, schemaText } from "../engines/er.js";
import { codePanel, traceLayout, varsPanel } from "../code.js";
import { copyLink, h, notice, page, readParams, rng, stepper, writeParams } from "../ui.js";
import { choice, exampleSelect, mountTabs, numberQuestion, stat } from "./kit.js";

const SPECS = { a: "8A: a table per subclass", single: "8C/8D: one table for the hierarchy" };

// --- The Chen diagram -------------------------------------------------------------------

// Where a ray from the centre of node n in direction (ux, uy) leaves its outline.
function rim(n, ux, uy) {
  const a = n.w / 2, b = n.h / 2;
  if (n.kind === "rel") return 1 / (Math.abs(ux) / a + Math.abs(uy) / b);
  if (n.kind === "attr") return 1 / Math.hypot(ux / a, uy / b);
  if (n.kind === "isa") return a;
  return Math.min(Math.abs(ux) > 1e-6 ? a / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? b / Math.abs(uy) : Infinity);
}

function erDiagram(L, aria = "ER diagram") {
  const { nodes, edges, byId, W, H } = L;
  const lines = [], labels = [];
  for (const e of edges) {
    const A = byId.get(e.a), B = byId.get(e.b);
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, px = -uy, py = ux;
    const off = (e.lane ?? 0) * 13;
    const seg = (o) => {
      const sa = rim(A, ux, uy) - 1, sb = rim(B, -ux, -uy) - 1;
      return h("line", { x1: A.x + ux * sa + px * o, y1: A.y + uy * sa + py * o, x2: B.x - ux * sb + px * o, y2: B.y - uy * sb + py * o });
    };
    const owner = e.kind === "attr" ? e.a : e.kind === "part" ? e.a : e.kind === "isa-sup" ? e.b : e.a;
    lines.push(h("g", { class: `er-edge ${e.kind}${e.total ? " total" : ""}`, "data-id": owner, "data-end": e.b }, e.total ? [seg(off - 2.6), seg(off + 2.6)] : seg(off)));
    if (e.kind === "part") {
      const s = rim(A, ux, uy) + 12, side = e.lane ? e.lane : 1;
      labels.push(h("text", { class: "er-card", x: A.x + ux * s + px * 9 * side + px * off, y: A.y + uy * s + py * 9 * side + py * off + 4, "text-anchor": "middle" }, e.card));
      if (e.role) {
        const mx = (A.x + B.x) / 2 + px * (off + 12 * side), my = (A.y + B.y) / 2 + py * (off + 12 * side) + 4;
        labels.push(h("text", { class: "er-role", x: mx, y: my, "text-anchor": "middle" }, e.role));
      }
    }
    if (e.kind === "isa-sub") {
      // The subset sign ⊂ on the line, its open side towards the superclass.
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, r = 7;
      labels.push(h("path", { class: "er-subset", d: `M${mx - ux * r + px * r},${my - uy * r + py * r} Q${mx + ux * r * 1.4},${my + uy * r * 1.4} ${mx - ux * r - px * r},${my - uy * r - py * r}` }));
    }
  }
  const shapes = nodes.map((n) => {
    const x = n.x - n.w / 2, y = n.y - n.h / 2;
    let body;
    if (n.kind === "entity") body = [h("rect", { x, y, width: n.w, height: n.h, rx: 2 }), n.weak ? h("rect", { class: "inner", x: x + 4, y: y + 4, width: n.w - 8, height: n.h - 8, rx: 1 }) : null];
    else if (n.kind === "rel") {
      const dia = (k) => `M${n.x},${n.y - (n.h / 2) * k} L${n.x + (n.w / 2) * k},${n.y} L${n.x},${n.y + (n.h / 2) * k} L${n.x - (n.w / 2) * k},${n.y} Z`;
      body = [h("path", { d: dia(1) }), n.identifying ? h("path", { class: "inner", d: dia(0.8) }) : null];
    } else if (n.kind === "isa") body = [h("circle", { cx: n.x, cy: n.y, r: n.w / 2 })];
    else body = [h("ellipse", { cx: n.x, cy: n.y, rx: n.w / 2, ry: n.h / 2, class: n.derived ? "derived" : null }), n.multi ? h("ellipse", { class: "inner", cx: n.x, cy: n.y, rx: n.w / 2 - 4, ry: n.h / 2 - 4 }) : null];
    const tw = n.label.length * (n.kind === "attr" ? 6.6 : 7.4);
    const under = n.key === "key" || n.key === "partial" ? h("line", { class: `uline ${n.key}`, x1: n.x - tw / 2, x2: n.x + tw / 2, y1: n.y + 7.5, y2: n.y + 7.5 }) : null;
    return h("g", { class: `er-node er-${n.kind}`, "data-id": n.id }, body, h("text", { x: n.x, y: n.y + 4, "text-anchor": "middle" }, n.label), under);
  });
  return h("svg", { viewBox: `0 0 ${W} ${H}`, class: "er-svg", role: "img", "aria-label": aria, style: `min-width:${Math.min(W, 560)}px;max-width:${W}px` }, h("title", null, aria), lines, shapes, labels);
}

// Light up the constructs this step maps, and tick off the ones already mapped.
function highlight(svg, st, prev) {
  const focus = new Set(st.focus), done = new Set(st.mapped), before = new Set(prev?.mapped ?? []);
  const ownerOf = (id) => id.startsWith("a:") ? id.slice(2).split("/")[0] : null;
  const hot = (id) => focus.has(id) || (id.startsWith("a:") && done.has(id) && !before.has(id) && (focus.has(`e:${ownerOf(id)}`) || focus.has(`r:${ownerOf(id)}`)));
  for (const g of svg.querySelectorAll(".er-node")) {
    const id = g.dataset.id;
    g.classList.toggle("hot", hot(id));
    g.classList.toggle("done", !hot(id) && done.has(id));
  }
  for (const g of svg.querySelectorAll(".er-edge")) {
    const a = g.dataset.id, b = g.dataset.end;
    g.classList.toggle("hot", (hot(a) && hot(b)));
  }
}

// --- The relational schema --------------------------------------------------------------

function schemaView(tables) {
  if (!tables.length) return h("p", { class: "muted" }, "No tables yet.");
  return h("div", { class: "er-tables" }, tables.map((t) => h("div", { class: `er-table${t.isNew ? " new" : ""}` },
    h("div", { class: "er-tname" }, t.name),
    h("div", { class: "er-cols" }, t.cols.map((c) => h("span", { class: ["er-col", c.pk && "pk", c.fk && "fk", c.isNew && "new"].filter(Boolean).join(" "), title: [c.pk && "part of the primary key", c.fk && `foreign key → ${c.fk}`].filter(Boolean).join("; ") || null }, c.name))),
    t.fks.length ? h("ul", { class: "er-fks" }, t.fks.map((f) => h("li", null, `${f.cols.join(", ")} → ${f.ref}(${f.refCols.join(", ")})`))) : null)));
}

export function render(root) {
  const p = readParams();
  const state = { er: p.get("er") ?? EXAMPLES.company.text, spec: SPECS[p.get("spec")] ? p.get("spec") : "a" };
  let player = null;
  const head = page({
    subject: "Databases", title: "ER to relational mapping",
    lede: "Write an ER model, see it drawn in Chen notation, then watch the Elmasri–Navathe algorithm turn it into tables one rule at a time, with every primary and foreign key.",
    theory: h("div", null,
      h("p", null, "An ", h("b", null, "ER diagram"), " describes the data as entities (rectangles), relationships (diamonds) and attributes (ovals). A ", h("b", null, "relational schema"), " has only tables. The mapping algorithm handles one kind of construct at a time:"),
      h("ol", null,
        h("li", null, h("b", null, "Regular entities"), " get a table with their simple attributes (a composite attribute contributes its parts). The key becomes the primary key."),
        h("li", null, h("b", null, "Weak entities"), " get a table that includes the owner's primary key as a foreign key. The primary key is the owner's key plus the partial key."),
        h("li", null, h("b", null, "1:1 relationships"), " add a foreign key to one side, preferably the side with total participation, so it's never NULL."),
        h("li", null, h("b", null, "1:N relationships"), " add the 1 side's key as a foreign key on the N side: each N-side row refers to at most one row."),
        h("li", null, h("b", null, "M:N relationships"), " need a table of their own holding both keys; together they are its primary key."),
        h("li", null, h("b", null, "Multivalued attributes"), " get a table of (owner key, value), because a column holds one value."),
        h("li", null, h("b", null, "n-ary relationships"), " (three or more entities) get a table with a foreign key to each participant."),
        h("li", null, h("b", null, "Specialisation"), ": 8A makes a table per subclass keyed by the superclass key; 8C (disjoint) and 8D (overlapping) put everything in one table with a type column or flags. 8B (subclass tables only) works only for total, disjoint ones."),
        h("li", null, h("b", null, "Union types"), " (categories) need a new surrogate key; this tool's input format doesn't include them.")),
      h("p", null, "Some things an ER diagram says can't be enforced by keys alone: total participation in an M:N relationship, for example, needs a check or trigger.")),
    conventions: [
      "entity NAME: attributes. weak NAME of OWNER [by RELATIONSHIP] [fk COLUMN]: attributes.",
      "rel NAME: ENTITY card [total] [as ROLE] [fk COLUMN], …; attributes. Card is 1, or a letter (N, M, P) for many. Write the entity twice, with roles, for a recursive relationship. Three or more participants make it n-ary.",
      "isa SUPERCLASS: SUB1, SUB2; disjoint or overlapping, total or partial (default disjoint, partial). Subclasses are declared with entity and have no key of their own.",
      "Attributes: *key (several * make one composite key), ~partial key, {multivalued} ({A in TABLE} names its table), /derived (not stored), Composite(Part, Part).",
      "Foreign keys take the referenced key's name, prefixed by the role if there is one, unless fk names them. A clash gets the relationship's name as a prefix.",
      "A 1:1 foreign key goes on the side with total participation; if both or neither are total, on the side written first. Multivalued tables are called ENTITY_ATTRIBUTE.",
      "In the diagram, double lines mean total participation, a double rectangle a weak entity, a double diamond its identifying relationship, a double oval a multivalued attribute and a dashed oval a derived one. Keys are underlined; partial keys with a dashed line.",
    ],
  });
  const erIn = h("textarea", { rows: 11, class: "mono", spellcheck: "false", "aria-label": "ER model", oninput: (e) => { state.er = e.target.value; update(); } }, state.er);
  const specSel = h("select", { "aria-label": "How to map specialisation", onchange: (e) => { state.spec = e.target.value; update(); } }, Object.entries(SPECS).map(([k, v]) => h("option", { value: k, selected: k === state.spec }, v)));
  const msg = h("div"), out = h("div", { class: "output" });

  function update() {
    player?.destroy();
    writeParams({ er: state.er, ...(state.spec === "a" ? {} : { spec: state.spec }) });
    let m, res, L;
    try { m = parseER(state.er); res = mapER(m, { spec: state.spec }); L = layoutER(m); } catch (e) { msg.replaceChildren(notice("error", e.message)); out.replaceChildren(); return; }
    msg.replaceChildren();
    const code = codePanel(CODE, { title: "Mapping algorithm" }), vars = varsPanel();
    const svg = erDiagram(L), box = h("div", { class: "er-stage" }), note = h("p", { class: "step-note", "aria-live": "polite" });
    player = stepper({
      count: res.steps.length, label: "Step", interval: 1800,
      render: (i) => {
        const st = res.steps[i];
        highlight(svg, st, res.steps[i - 1]);
        box.replaceChildren(schemaView(st.tables));
        code.show(st.line);
        vars.show(st.vars);
        note.textContent = st.note;
        note.className = `step-note${st.rule === "done" ? " good" : ""}`;
      },
    });
    const fks = res.tables.reduce((n, t) => n + t.fks.length, 0);
    out.replaceChildren(
      h("section", { class: "card" }, h("h2", null, "Mapping"), player.el, note,
        h("div", { class: "chart-wrap er-wrap" }, svg),
        h("div", { class: "legend-chips" }, h("span", null, h("i", { style: "--c:var(--accent)" }), "Being mapped now"), h("span", null, h("i", { style: "--c:var(--good)" }), "Already mapped")),
        traceLayout(box, code, vars),
        h("div", { class: "stats-row" }, stat("Entities", m.entities.length), stat("Relationships", m.rels.length), stat("Tables", res.tables.length), stat("Foreign keys", fks))),
      h("section", { class: "card" }, h("h2", null, "Relational schema"),
        h("pre", { class: "grammar-box" }, schemaText(res.tables)),
        h("p", { class: "muted small" }, "PK marks the primary key columns and FK→ the table a foreign key refers to.")));
  }

  const visual = h("div", { class: "panel-body" },
    h("section", { class: "card inputs" },
      h("div", { class: "row" }, exampleSelect(EXAMPLES, (ex) => { state.er = ex.text; erIn.value = ex.text; update(); }), specSel,
        h("button", { type: "button", class: "btn ghost", onclick: (e) => copyLink(e.currentTarget) }, "Copy link")),
      h("label", { class: "stack" }, "ER model (the format is under “How it works”)", erIn),
      msg),
    out);

  const practice = h("div", { class: "panel-body" });
  function newQuestion() {
    const r = rng();
    const shell = (...body) => practice.replaceChildren(h("section", { class: "card" }, h("div", { class: "row" }, h("button", { type: "button", class: "btn ghost", onclick: newQuestion }, "New question")), ...body));
    if (r() < 0.5) {
      const text = randomER(r), m = parseER(text), res = mapER(m);
      const rule = new Map();
      for (const s of res.steps) for (const t of s.tables) if (t.isNew && !rule.has(t.name)) rule.set(t.name, s.rule);
      shell(h("h2", null, "How many tables does this ER model map to?"),
        h("div", { class: "chart-wrap er-wrap" }, erDiagram(layoutER(m))),
        h("pre", { class: "grammar-box" }, text),
        numberQuestion(res.tables.length, `${res.tables.map((t) => `${t.name} (step ${rule.get(t.name)})`).join(", ")}. Every entity has a table; a 1:1 or 1:N relationship is only a foreign key, while an M:N relationship and each multivalued attribute get a table of their own.`));
    } else {
      const pool = [["EMPLOYEE", "DEPARTMENT", "WORKS_FOR"], ["STUDENT", "TUTOR", "ADVISED_BY"], ["BOOK", "PUBLISHER", "PUBLISHED_BY"], ["INVOICE", "CUSTOMER", "BILLED_TO"], ["PLAYER", "TEAM", "PLAYS_FOR"], ["COURSE", "DEPARTMENT", "OFFERS"]];
      const [many, one, rel] = pool[Math.floor(r() * pool.length)];
      const flip = r() < 0.5, totalMany = r() < 0.5;
      const parts = [`${many} N${totalMany ? " total" : ""}`, `${one} 1`];
      const text = `entity ${many}: *${many[0]}${many.slice(1).toLowerCase()}_id, Name\nentity ${one}: *${one[0]}${one.slice(1).toLowerCase()}_id, Name\nrel ${rel}: ${(flip ? parts.reverse() : parts).join(", ")}`;
      const m = parseER(text);
      shell(h("h2", null, `Where does the foreign key for the 1:N relationship ${rel} go?`),
        h("div", { class: "chart-wrap er-wrap" }, erDiagram(layoutER(m))),
        h("p", { class: "muted" }, `Each ${many} is related to at most one ${one}; a ${one} can be related to many ${many}s.${totalMany ? ` Every ${many} takes part (total participation).` : ""}`),
        choice([
          { label: `In ${many}, referring to ${one}`, correct: true },
          { label: `In ${one}, referring to ${many}`, correct: false },
          { label: `In a new table ${rel}`, correct: false },
          { label: "In both tables", correct: false },
        ].sort(() => r() - 0.5), `Step 4: the N side (${many}) holds the key of the 1 side, because each ${many} row refers to at most one ${one}. Putting it in ${one} would need a list of ${many}s in one column, which a table can't hold. A separate table would work but isn't needed${totalMany ? "; and with total participation the foreign key is never NULL" : ""}.`));
    }
  }

  mountTabs(root, head, visual, practice, newQuestion);
  update();
  return () => player?.destroy();
}

