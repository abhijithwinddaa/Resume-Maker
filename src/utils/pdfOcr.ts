/**
 * OCR fallback for image-based PDFs using Tesseract.js + pdfjs-dist.
 * Lazy-loads Tesseract.js only when needed (code-split).
 * Renders each PDF page to a canvas via pdfjs-dist, then runs OCR.
 */

import * as pdfjsLib from "pdfjs-dist";

export interface OCRResult {
  text: string;
}

/**
 * Extract text from an image-based PDF via OCR.
 * Used as a last-resort fallback when pdfjs text extraction returns empty.
 */
export async function extractTextWithOCR(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<OCRResult> {
  const [{ createWorker }, arrayBuffer] = await Promise.all([
    import("tesseract.js"),
    file.arrayBuffer(),
  ]);

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  // Create a single Tesseract worker and reuse across pages
  const worker = await createWorker("eng");

  const pageTexts: string[] = [];

  try {
    for (let i = 1; i <= numPages; i++) {
      onProgress?.(i, numPages);

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 }); // 2x for better OCR accuracy

      // Render page to canvas — use OffscreenCanvas where available, fallback for Safari <16.4
      let blob: Blob;
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        }).promise;
        blob = await canvas.convertToBlob({ type: "image/png" });
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        }).promise;
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
            "image/png",
          ),
        );
      }

      const { data } = await worker.recognize(blob);
      if (data.text.trim()) {
        pageTexts.push(data.text.trim());
      }
    }
  } finally {
    await worker.terminate();
  }

  return { text: pageTexts.join("\n\n") };
}
