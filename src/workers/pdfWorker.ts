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

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const arrayBuffer = e.data;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      pageTexts.push(pageText);
    }

    self.postMessage({ success: true, text: pageTexts.join("\n\n") });
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : "PDF extraction failed",
    });
  }
};
