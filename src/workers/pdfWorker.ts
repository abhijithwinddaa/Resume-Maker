/* ─── PDF Web Worker ───────────────────────────────────
   Offloads PDF text extraction to a Web Worker to avoid
   blocking the main UI thread on large files.
   ────────────────────────────────────────────────────── */

import * as pdfjsLib from "pdfjs-dist";

// Set up worker inside the web worker context
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

self.onmessage = async (
  e: MessageEvent<
    ArrayBuffer | { buffer: ArrayBuffer; extractLinks?: boolean }
  >,
) => {
  try {
    let arrayBuffer: ArrayBuffer;
    let extractLinks = false;

    if (e.data instanceof ArrayBuffer) {
      arrayBuffer = e.data;
    } else {
      arrayBuffer = e.data.buffer;
      extractLinks = !!e.data.extractLinks;
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageTexts: string[] = [];
    const allLinks: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      pageTexts.push(pageText);

      // Extract hyperlink annotations if requested
      if (extractLinks) {
        try {
          const annotations = await page.getAnnotations();
          for (const annot of annotations) {
            if (annot.subtype === "Link" && annot.url) {
              allLinks.push(annot.url);
            }
          }
        } catch {
          // Non-critical
        }
      }
    }

    const uniqueLinks = [...new Set(allLinks)];
    self.postMessage({
      success: true,
      text: pageTexts.join("\n\n"),
      links: uniqueLinks,
    });
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : "PDF extraction failed",
    });
  }
};
