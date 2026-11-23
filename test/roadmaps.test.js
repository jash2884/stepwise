// Roadmaps: every tool, GATE topic, prerequisite and preset they point at must
// exist, ids must be unique (module ids across every roadmap) and stable-looking,
// and every visualiser must belong somewhere in a roadmap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROADMAPS, modulesOf, placeOfTool, roadmapOf } from "../public/js/roadmaps.js";
import { TOOLS } from "../public/js/tools.js";
import { TOPICS as GATE_TOPICS } from "../public/js/gate-questions.js";
import { meta, parse } from "../public/js/views/roadmap.js";

const slugs = new Set(TOOLS.map((t) => t.slug));
const gateSlugs = new Set(GATE_TOPICS.map((t) => t.slug));

test("ids are unique and URL-safe", () => {
  const roadmapIds = new Set();
  for (const r of ROADMAPS) {
    assert.match(r.id, /^[a-z0-9-]+$/);
    assert.ok(!roadmapIds.has(r.id), `duplicate roadmap ${r.id}`);
    roadmapIds.add(r.id);
    const stageIds = new Set(), moduleIds = new Set();
    for (const s of r.stages) {
      assert.match(s.id, /^[a-z0-9-]+$/, s.id);
      assert.ok(!stageIds.has(s.id), `duplicate stage ${s.id}`);
      stageIds.add(s.id);
      assert.ok(s.modules.length > 0, `${s.id} has no modules`);
      for (const m of s.modules) {
        assert.match(m.id, /^[a-z]+\.[a-z0-9-]+$/, m.id);
        assert.ok(!moduleIds.has(m.id), `duplicate module ${m.id}`);
        moduleIds.add(m.id);
      }
    }
  }
});

test("module ids are unique across every roadmap", () => {
  const seen = new Map();
  for (const r of ROADMAPS) for (const { module: m } of modulesOf(r)) {
    assert.ok(!seen.has(m.id), `${m.id} is in both ${seen.get(m.id)} and ${r.id}`);
    seen.set(m.id, r.id);
  }
});

test("every module is complete and points at real things", () => {
  for (const r of ROADMAPS) {
    const ids = new Set(modulesOf(r).map(({ module }) => module.id));
    for (const { module: m } of modulesOf(r)) {
      assert.ok(m.title && m.outcomes.length > 0, `${m.id}: title and outcomes`);
      assert.ok(m.hours > 0, `${m.id}: hours`);
      assert.ok(m.placement >= 0 && m.placement <= 5, `${m.id}: placement 0 to 5`);
      for (const t of m.tools) assert.ok(slugs.has(t), `${m.id}: unknown tool ${t}`);
      for (const g of m.gate ?? []) assert.ok(gateSlugs.has(g), `${m.id}: unknown GATE topic ${g}`);
      for (const n of m.needs) assert.ok(ids.has(n), `${m.id}: unknown prerequisite ${n}`);
      for (const t of m.tryIt ?? []) {
        assert.ok(m.tools.includes(t.tool), `${m.id}: try-it ${t.tool} isn't one of the module's tools`);
        assert.ok(t.label && t.query && !t.query.startsWith("?"), `${m.id}: try-it needs a label and a query without "?"`);
      }
      for (const link of m.reading ?? []) assert.match(link.url, /^https:\/\//, `${m.id}: reading must be https`);
      // A module with nothing to do in Stepwise must say so and send people somewhere useful.
      if (!m.tools.length && !m.practiceAll) assert.ok(m.comingSoon && m.reading?.length, `${m.id}: no tools, so it needs comingSoon and reading`);
    }
  }
});

test("prerequisites have no cycles", () => {
  for (const r of ROADMAPS) {
    const needs = new Map(modulesOf(r).map(({ module }) => [module.id, module.needs]));
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === "done") return;
      assert.notEqual(state.get(id), "open", `cycle: ${[...path, id].join(" → ")}`);
      state.set(id, "open");
      for (const n of needs.get(id)) visit(n, [...path, id]);
      state.set(id, "done");
    };
    for (const id of needs.keys()) visit(id, []);
  }
});

test("every visualiser has a roadmap, and every GATE topic is in GATE CS", () => {
  const gate = roadmapOf("gate-cs");
  const used = new Set(ROADMAPS.flatMap((r) => modulesOf(r).flatMap(({ module }) => module.tools)));
  for (const t of TOOLS) assert.ok(used.has(t.slug), `${t.slug} isn't in any roadmap module`);
  const practised = new Set(modulesOf(gate).flatMap(({ module }) => module.gate ?? []));
  for (const t of GATE_TOPICS) assert.ok(practised.has(t.slug), `GATE topic ${t.slug} isn't linked from the roadmap`);
});

test("try-it presets use values the engines accept", async () => {
  const keys = {
    "cpu-scheduling": (await import("../public/js/engines/scheduling.js")).ALGORITHMS,
    "page-replacement": (await import("../public/js/engines/paging.js")).ALGORITHMS,
    "disk-scheduling": (await import("../public/js/engines/disk.js")).ALGORITHMS,
    "sorting": (await import("../public/js/engines/sorting.js")).ALGORITHMS,
    "memory-allocation": (await import("../public/js/engines/memory.js")).ALGORITHMS,
    "lr-parsing": (await import("../public/js/engines/grammar.js")).LR_KINDS,
    "searching": (await import("../public/js/engines/searching.js")).ALGORITHMS,
    "graph-traversal": (await import("../public/js/engines/traversal.js")).ALGORITHMS,
    "shortest-paths": (await import("../public/js/engines/paths.js")).ALGORITHMS,
    "minimum-spanning-tree": (await import("../public/js/engines/mst.js")).ALGORITHMS,
    "strongly-connected-components": (await import("../public/js/engines/scc.js")).ALGORITHMS,
    "linked-list": (await import("../public/js/engines/lists.js")).KINDS,
  };
  // Other preset parameters that pick from a fixed list.
  const named = {
    "dynamic-programming": { problem: (await import("../public/js/engines/dp.js")).PROBLEMS },
    "stacks-queues": { mode: (await import("../public/js/engines/stacks.js")).MODES },
    "linked-list": { op: (await import("../public/js/engines/lists.js")).OPS },
    "osi-encapsulation": { model: (await import("../public/js/engines/osi.js")).MODELS, tp: (await import("../public/js/engines/osi.js")).TRANSPORTS },
  };
  for (const r of ROADMAPS) for (const { module: m } of modulesOf(r)) for (const t of m.tryIt ?? []) {
    const q = new URLSearchParams(t.query);
    for (const [param, list] of Object.entries(named[t.tool] ?? {})) if (q.has(param)) assert.ok(q.get(param) in list, `${m.id}: ${t.tool} has no ${param} "${q.get(param)}"`);
    const algo = q.get("algo") ?? q.get("kind");
    if (!algo) continue;
    assert.ok(keys[t.tool], `${m.id}: add ${t.tool}'s algorithm list to this test`);
    assert.ok(algo in keys[t.tool], `${m.id}: ${t.tool} has no "${algo}"`);
  }
});

test("routes resolve, and bad ones don't", () => {
  assert.equal(parse("roadmaps").kind, "index");
  for (const r of ROADMAPS) {
    assert.equal(parse(`roadmap/${r.id}`).roadmap, r);
    for (const s of r.stages) assert.equal(parse(`roadmap/${r.id}/${s.id}`).stage, s);
  }
  for (const bad of ["roadmap", "roadmap/nope", "roadmap/gate-cs/nope", "roadmap/gate-cs/os/extra", "roadmapsx"]) assert.equal(parse(bad), null, bad);
});

test("page descriptions fit in search results", () => {
  const pages = [{ kind: "index" }, ...ROADMAPS.flatMap((r) => [{ kind: "map", roadmap: r }, ...r.stages.map((stage) => ({ kind: "stage", roadmap: r, stage }))])];
  for (const p of pages) {
    const { title, description } = meta(p, "Stepwise");
    assert.ok(title.length > 10, title);
    assert.ok(description.length <= 170, `${title}: description is ${description.length} chars`);
    assert.ok(!/[—–]/.test(title + description), `${title}: no long dashes in copy`);
  }
});

test("tool pages know their place in the roadmap", () => {
  const gate = roadmapOf("gate-cs");
  const first = placeOfTool(gate, "searching");
  assert.equal(first.prev, null);
  assert.equal(first.module.id, "ds.arrays");
  const vm = placeOfTool(gate, "page-replacement");
  assert.equal(vm.module.id, "os.vm");
  assert.equal(vm.prev.module.id, "os.memory");
  assert.equal(vm.next.module.id, "os.disk");
  assert.equal(placeOfTool(gate, "not-a-tool"), null);
});
