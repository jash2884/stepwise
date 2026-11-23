// Syllabus PDFs to text, in the browser, with pdf.js (loaded from cdnjs only
// when someone picks a PDF; public/_headers allows that origin and blob:
// workers, which pdf.js uses to start a cross-origin worker). Keeps the page
// structure ("--- Page n ---") and marks likely headings with "## ", which
// helps the model find units.
export const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38";
export const MAX_PAGES = 40;

export async function pdfToText(file, onProgress = () => {}) {
  const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  const pages = [];
  const n = Math.min(doc.numPages, MAX_PAGES);
  try {
    for (let i = 1; i <= n; i++) {
      onProgress(i, n);
      const page = await doc.getPage(i);
      pages.push(linesOf((await page.getTextContent()).items));
      page.cleanup();
    }
  } finally { await doc.destroy(); }
  return { text: pagesToText(pages), pages: n, truncated: doc.numPages > n };
}

// pdf.js text items ({ str, transform: [a, b, c, d, x, y], width, height })
// into lines, top to bottom, with each line's font size.
export function linesOf(items) {
  const rows = [];
  for (const it of items) {
    if (!it || typeof it.str !== "string" || !it.str.trim()) continue;
    const [, , c, d, x, y] = it.transform ?? [0, 0, 0, 0, 0, 0];
    const size = Math.abs(it.height || Math.hypot(c, d)) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, size * 0.4));
    if (!row) rows.push(row = { y, size, parts: [] });
    row.size = Math.max(row.size, size);
    row.parts.push({ x, w: it.width ?? 0, str: it.str, size });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let text = "", end = null;
    for (const p of r.parts) {
      const gap = end == null ? 0 : p.x - end;
      text += end != null && gap > p.size * 0.15 && !text.endsWith(" ") && !p.str.startsWith(" ") ? ` ${p.str}` : p.str;
      end = p.x + p.w;
    }
    return { text: text.replace(/\s+/g, " ").trim(), size: r.size };
  }).filter((l) => l.text);
}

const UNIT_LINE = /^(unit|module|chapter|part)\s*[-:.]?\s*([ivxlc]+|\d+)\b/i;

export function pagesToText(pages) {
  const sizes = pages.flat().map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 10;
  return pages.map((lines, i) => `--- Page ${i + 1} ---\n${lines.map((l) => {
    const heading = l.text.length < 100 && (UNIT_LINE.test(l.text) || l.size >= median * 1.2);
    return heading ? `## ${l.text}` : l.text;
  }).join("\n")}`).join("\n\n");
}
