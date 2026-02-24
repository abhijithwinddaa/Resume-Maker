/* ─── PDF Extractor with Web Worker ────────────────────
   Attempts to use a Web Worker for PDF parsing to keep
   the UI responsive. Falls back to main-thread parsing
   if Web Workers are unavailable.
   ────────────────────────────────────────────────────── */

import * as pdfjsLib from "pdfjs-dist";

// Fallback: main-thread worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * Extract text from a PDF file using a Web Worker (preferred)
 * or falling back to main-thread extraction.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  // Try Web Worker first
  if (typeof Worker !== "undefined") {
    try {
      return await extractWithWorker(file);
    } catch (err) {
      console.warn(
        "Web Worker PDF extraction failed, falling back to main thread:",
        err,
      );
    }
  }

  // Fallback: main-thread extraction
  return extractOnMainThread(file);
}

/**
 * Web Worker-based extraction.
 */
function extractWithWorker(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/pdfWorker.ts", import.meta.url),
      { type: "module" },
    );

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("PDF extraction timed out (30s)"));
    }, 30000);

    worker.onmessage = (
      e: MessageEvent<{ success: boolean; text?: string; error?: string }>,
    ) => {
      clearTimeout(timeout);
      worker.terminate();

      if (e.data.success && e.data.text) {
        resolve(e.data.text);
      } else {
        reject(new Error(e.data.error || "PDF extraction failed in worker"));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(err);
    };

    // Send the file's ArrayBuffer to the worker
    file.arrayBuffer().then(
      (buffer) => worker.postMessage(buffer, [buffer]),
      (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err);
      },
    );
  });
}

/**
 * Main-thread fallback extraction.
 */
async function extractOnMainThread(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
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

  return pageTexts.join("\n\n");
}
