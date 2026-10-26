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
  title: `${SITE.name}: see every step of OS & DBMS algorithms`,
  description: "Interactive, step-by-step visualisers for operating systems and database algorithms, with practice questions that check your answers.",
  path: "/",
  body: `<section class="static-content"><h1>See every step.</h1><p class="lede">Interactive visualisers for the algorithms in operating systems and database courses, with practice questions.</p>${toolLinks}</section>`,
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
${["", ...TOOLS.map((t) => t.slug)].map((s) => `  <url><loc>${SITE.url}/${s}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
await writeFile(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

// --- Service worker -----------------------------------------------------------------------
const precache = ["/", ...TOOLS.map((t) => `/${t.slug}`), ...all.filter((f) => /\.(js|css|svg|webmanifest)$/.test(f) && !f.includes("/test/")).map((f) => `/${relative(out, f)}`)];
const sw = (await readFile(join(src, "sw.js"), "utf8")).replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache, null, 2));
await writeFile(join(out, "sw.js"), sw);

const size = (await Promise.all((await files(out)).map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
console.log(`Built ${TOOLS.length} tool pages, version ${version}, ${precache.length} files precached, ${(size / 1024).toFixed(0)} KB total.`);
