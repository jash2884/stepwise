// Builds dist/ for deployment:
// - one HTML page per tool (own title, description, canonical URL and static
//   content) so every tool can be indexed and shared with a proper preview;
// - sitemap.xml, robots.txt and a 404 page;
// - a service worker stamped with a content hash, so every deploy refreshes offline caches.
// Fails loudly if the registry and the files on disk disagree.
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { SITE, SUBJECTS, TOOLS } from "../public/js/tools.js";
import { TOPICS as GATE_TOPICS } from "../public/js/gate-questions.js";
import { ROADMAPS, hoursOf } from "../public/js/roadmaps.js";
import { meta as roadmapMeta } from "../public/js/views/roadmap.js";
import { LEARN_PAGES } from "../public/js/learn/pages.js";
import { writeCards } from "./ai-cards.js";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "public"), out = join(root, "dist");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function files(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) list.push(...await files(p));
    else list.push(p);
  }
  return list;
}

// --- Checks ------------------------------------------------------------------
const slugs = new Set(), legacy = new Set();
for (const t of TOOLS) {
  if (!/^[a-z0-9-]+$/.test(t.slug)) throw new Error(`Bad slug "${t.slug}"`);
  if (slugs.has(t.slug)) throw new Error(`Duplicate slug "${t.slug}"`);
  if (t.legacy && legacy.has(t.legacy)) throw new Error(`Duplicate legacy path "${t.legacy}"`);
  if (!SUBJECTS.some((s) => s.id === t.subject)) throw new Error(`${t.slug}: unknown subject ${t.subject}`);
  if (t.description.length > 170) throw new Error(`${t.slug}: description is ${t.description.length} chars; keep it under 170 for search results`);
  const view = /views\/([\w-]+)\.js/.exec(t.load.toString())?.[1];
  await stat(join(src, "js", "views", `${view}.js`)).catch(() => { throw new Error(`${t.slug}: view file views/${view}.js is missing`); });
  slugs.add(t.slug);
  if (t.legacy) legacy.add(t.legacy);
}

// The /ask router's retrieval cards (bundled into the Worker) follow the registry.
await writeCards();

// --- Copy and fingerprint -------------------------------------------------------
await rm(out, { recursive: true, force: true });
await cp(src, out, { recursive: true });
const all = (await files(out)).filter((f) => !f.endsWith("sw.js"));
const hash = createHash("sha256");
for (const f of all.sort()) hash.update(relative(out, f)).update(await readFile(f));
const version = hash.digest("hex").slice(0, 10);

// --- Pages ---------------------------------------------------------------------------
const shell = await readFile(join(src, "index.html"), "utf8");
if (!shell.includes("<!--static-->")) throw new Error("index.html is missing the <!--static--> marker");

function pageHtml({ title, description, path, body }) {
  const url = `${SITE.url}${path}`;
  return shell
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${esc(title)}" />\n  <meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace("<!--static-->", body);
}

const toolLinks = SUBJECTS.map((s) => `<h2>${esc(s.name)}</h2><ul>${TOOLS.filter((t) => t.subject === s.id).map((t) => `<li><a href="/${t.slug}">${esc(t.title)}</a>: ${esc(t.summary)}</li>`).join("")}</ul>`).join("");

await writeFile(join(out, "index.html"), pageHtml({
  title: `${SITE.name}: see every step of DSA, OS, DBMS, networks, theory & compiler algorithms`,
  description: "Interactive, step-by-step visualisers with pseudocode for data structures and algorithms, operating systems, databases, networks, theory of computation and compiler design, with practice questions that check your answers.",
  path: "/",
  body: `<section class="static-content"><h1>See every step.</h1><p class="lede">Interactive visualisers with pseudocode for the algorithms in data structures, operating systems, databases, computer networks, theory of computation and compiler design courses, with practice questions.</p>${toolLinks}</section>`,
}));

for (const t of TOOLS) {
  const subject = SUBJECTS.find((s) => s.id === t.subject).name;
  const ld = { "@context": "https://schema.org", "@type": "LearningResource", name: t.title, description: t.description, url: `${SITE.url}/${t.slug}`, educationalLevel: "Undergraduate", learningResourceType: "Interactive simulation", about: subject, isAccessibleForFree: true, inLanguage: "en" };
  await writeFile(join(out, `${t.slug}.html`), pageHtml({
    title: `${t.title}: step-by-step visualiser · ${SITE.name}`,
    description: t.description,
    path: `/${t.slug}`,
    body: `<section class="static-content"><p class="eyebrow">${esc(subject)}</p><h1>${esc(t.title)}</h1><p class="lede">${esc(t.description)}</p><p><a href="/">All ${TOOLS.length} visualisers</a></p></section><script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  }));
}

// GATE practice: one indexable page listing every topic.
const gateLd = { "@context": "https://schema.org", "@type": "Quiz", name: "GATE CS practice questions", url: `${SITE.url}/gate`, educationalLevel: "Undergraduate", about: ["Operating systems", "Databases"], isAccessibleForFree: true, inLanguage: "en" };
await writeFile(join(out, "gate.html"), pageHtml({
  title: `GATE CS practice questions with step-by-step solutions · ${SITE.name}`,
  description: "Free GATE CS practice: endless MCQ, MSQ and NAT questions on OS and DBMS, marked the GATE way, each with a worked solution you can replay step by step.",
  path: "/gate",
  body: `<section class="static-content"><p class="eyebrow">GATE CS practice</p><h1>GATE-style questions, with every step shown</h1><p class="lede">Fresh MCQ, MSQ and NAT questions made by the same engines as the visualisers, marked the GATE way, with worked solutions.</p><ul>${GATE_TOPICS.map((t) => `<li><a href="/gate?topic=${t.slug}">${esc(t.title)}</a></li>`).join("")}</ul></section><script type="application/ld+json">${JSON.stringify(gateLd)}</script>`,
}));

// Ask anything: the AI front door to every visualiser.
const ASK_DESCRIPTION = "Type or snap a CS question: Stepwise picks the right visualiser, fills in your numbers, and its engine works out and checks the answer step by step.";
if (ASK_DESCRIPTION.length > 170) throw new Error("/ask: description too long");
await writeFile(join(out, "ask.html"), pageHtml({
  title: `Ask anything, see it happen · ${SITE.name}`, description: ASK_DESCRIPTION, path: "/ask",
  body: `<section class="static-content"><p class="eyebrow">Ask Stepwise</p><h1>Ask anything, see it happen</h1><p class="lede">${esc(ASK_DESCRIPTION)}</p><p><a href="/">All ${TOOLS.length} visualisers</a> · <a href="/gate">GATE practice</a></p></section>`,
}));

// Roadmaps: an index, one page per roadmap and one per stage, all indexable.
const roadmapPaths = ["roadmaps"];
const toolTitle = (slug) => TOOLS.find((t) => t.slug === slug)?.title ?? slug;
{
  const m = roadmapMeta({ kind: "index" }, SITE.name);
  await writeFile(join(out, "roadmaps.html"), pageHtml({ ...m, path: "/roadmaps",
    body: `<section class="static-content"><p class="eyebrow">Roadmaps</p><h1>Know what to study next</h1><ul>${ROADMAPS.map((r) => `<li><a href="/roadmap/${r.id}">${esc(r.title)}</a>: ${esc(r.summary)}</li>`).join("")}</ul></section>` }));
}
for (const r of ROADMAPS) {
  await mkdir(join(out, "roadmap", r.id), { recursive: true });
  const m = roadmapMeta({ kind: "map", roadmap: r }, SITE.name);
  const ld = { "@context": "https://schema.org", "@type": "Course", name: `${r.title} roadmap`, description: r.description, url: `${SITE.url}/roadmap/${r.id}`, isAccessibleForFree: true, inLanguage: "en", educationalLevel: "Undergraduate",
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
    hasPart: r.stages.map((s) => ({ "@type": "Course", name: s.title, description: s.summary, url: `${SITE.url}/roadmap/${r.id}/${s.id}` })) };
  await writeFile(join(out, "roadmap", `${r.id}.html`), pageHtml({ ...m, path: `/roadmap/${r.id}`,
    body: `<section class="static-content"><p class="eyebrow">Roadmap</p><h1>${esc(r.title)} roadmap</h1><p class="lede">${esc(r.summary)}</p><ol>${r.stages.map((s) => `<li><a href="/roadmap/${r.id}/${s.id}">${esc(s.title)}</a>: ${esc(s.modules.map((x) => x.title).join(", "))}</li>`).join("")}</ol></section><script type="application/ld+json">${JSON.stringify(ld)}</script>` }));
  roadmapPaths.push(`roadmap/${r.id}`);
  for (const s of r.stages) {
    const sm = roadmapMeta({ kind: "stage", roadmap: r, stage: s }, SITE.name);
    const items = s.modules.map((x) => `<li><h2>${esc(x.title)}</h2><p>About ${x.hours} h.</p><ul>${x.outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>${x.tools.length ? `<p>Visualisers: ${x.tools.map((t) => `<a href="/${t}">${esc(toolTitle(t))}</a>`).join(", ")}</p>` : ""}</li>`).join("");
    await writeFile(join(out, "roadmap", r.id, `${s.id}.html`), pageHtml({ ...sm, path: `/roadmap/${r.id}/${s.id}`,
      body: `<section class="static-content"><p class="eyebrow">${esc(r.title)} roadmap</p><h1>${esc(s.title)}</h1><p class="lede">${esc(s.summary)} ${s.modules.length} topics, about ${hoursOf(s.modules)} hours.</p><ol>${items}</ol></section>` }));
    roadmapPaths.push(`roadmap/${r.id}/${s.id}`);
  }
}

// Learning pages: progress, planner, reviews, mistakes, mocks, diagnostic.
for (const p of LEARN_PAGES) {
  if (p.description.length > 170) throw new Error(`/${p.slug}: description is ${p.description.length} chars; keep it under 170`);
  await stat(join(src, "js", "views", `${p.slug}.js`)).catch(() => { throw new Error(`/${p.slug}: view file views/${p.slug}.js is missing`); });
  await writeFile(join(out, `${p.slug}.html`), pageHtml({
    title: `${p.title} · ${SITE.name}`, description: p.description, path: `/${p.slug}`,
    body: `<section class="static-content"><p class="eyebrow">${esc(p.title)}</p><h1>${esc(p.heading)}</h1><p class="lede">${esc(p.description)}</p><p><a href="/roadmap/gate-cs">The GATE CS roadmap</a> · <a href="/gate">GATE practice</a></p></section>`,
  }));
}
const learnPaths = LEARN_PAGES.map((p) => p.slug);

await writeFile(join(out, "404.html"), pageHtml({
  title: `Page not found · ${SITE.name}`,
  description: "This page doesn't exist.",
  path: "/404",
  body: `<section class="static-content"><h1>Page not found</h1><p class="lede">Pick a tool:</p>${toolLinks}</section>`,
}).replace("<head>", '<head>\n  <meta name="robots" content="noindex" />'));

// --- SEO files ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
await writeFile(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", "gate", "ask", ...roadmapPaths, ...learnPaths, ...TOOLS.map((t) => t.slug)].map((s) => `  <url><loc>${SITE.url}/${s}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
await writeFile(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

// --- Service worker -----------------------------------------------------------------------
const precache = ["/", "/gate", "/ask", ...roadmapPaths.map((p) => `/${p}`), ...learnPaths.map((p) => `/${p}`), ...TOOLS.map((t) => `/${t.slug}`), ...all.filter((f) => /\.(js|css|svg|webmanifest)$/.test(f) && !f.includes("/test/") && !f.includes("/vendor/")).map((f) => `/${relative(out, f)}`)];
const sw = (await readFile(join(src, "sw.js"), "utf8")).replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache, null, 2));
await writeFile(join(out, "sw.js"), sw);

const size = (await Promise.all((await files(out)).map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
console.log(`Built ${TOOLS.length} tool pages, ${roadmapPaths.length} roadmap pages, version ${version}, ${precache.length} files precached, ${(size / 1024).toFixed(0)} KB total.`);
