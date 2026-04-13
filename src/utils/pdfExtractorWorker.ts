/* ─── PDF Extractor with Web Worker ────────────────────
   Attempts to use a Web Worker for PDF parsing to keep
   the UI responsive. Falls back to main-thread parsing
   if Web Workers are unavailable.
   ────────────────────────────────────────────────────── */

import * as pdfjsLib from "pdfjs-dist";
const RESUME_DATA_MARKER = "%%RESUME_MAKER_DATA_V1%%";
import type { ResumeData } from "../types/resume";
import { normalizeExtractedResumeText } from "./resumeTextCleanup";

// Fallback: main-thread worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface PDFExtractResult {
  text: string;
  links: string[];
}

/**
 * Try to extract embedded ResumeData JSON from a PDF's metadata.
 * Returns the parsed ResumeData if found, or null otherwise.
 * This enables lossless round-trip for PDFs exported by this app.
 */
export async function extractEmbeddedResumeData(
  file: File,
): Promise<ResumeData | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const metadata = await pdf.getMetadata();
    const subject = (metadata?.info as Record<string, unknown>)?.Subject;
    if (typeof subject === "string" && subject.startsWith(RESUME_DATA_MARKER)) {
      const json = subject.slice(RESUME_DATA_MARKER.length);
      return JSON.parse(json) as ResumeData;
    }
  } catch {
    // Metadata extraction failed — fall through to normal extraction
  }
  return null;
}

/**
 * Extract text and hyperlinks from a PDF file using a Web Worker (preferred)
 * or falling back to main-thread extraction.
 */
export async function extractTextAndLinks(
  file: File,
): Promise<PDFExtractResult> {
  // Try Web Worker first
  if (typeof Worker !== "undefined") {
    try {
      return await extractWithWorkerFull(file);
    } catch (err) {
      console.warn(
        "Web Worker PDF extraction failed, falling back to main thread:",
        err,
      );
    }
  }

  // Fallback: main-thread extraction
  return extractOnMainThreadFull(file);
}

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
        resolve(normalizeExtractedResumeText(e.data.text));
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

  return normalizeExtractedResumeText(pageTexts.join("\n\n"));
}

/**
 * Full extraction: text + hyperlink annotations.
 */
async function extractOnMainThreadFull(file: File): Promise<PDFExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
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

    // Extract hyperlink annotations
    try {
      const annotations = await page.getAnnotations();
      for (const annot of annotations) {
        if (annot.subtype === "Link" && annot.url) {
          allLinks.push(annot.url);
        }
      }
    } catch {
      // Annotation extraction failed — non-critical
    }
  }

  return {
    text: normalizeExtractedResumeText(pageTexts.join("\n\n")),
    links: [...new Set(allLinks)],
  };
}

/**
 * Web Worker-based full extraction (text + links).
 */
function extractWithWorkerFull(file: File): Promise<PDFExtractResult> {
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
      e: MessageEvent<{
        success: boolean;
        text?: string;
        links?: string[];
        error?: string;
      }>,
    ) => {
      clearTimeout(timeout);
      worker.terminate();

      if (e.data.success && e.data.text) {
        resolve({
          text: normalizeExtractedResumeText(e.data.text),
          links: e.data.links || [],
        });
      } else {
        reject(new Error(e.data.error || "PDF extraction failed in worker"));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(err);
    };

    // Send with extractLinks flag
    file.arrayBuffer().then(
      (buffer) => worker.postMessage({ buffer, extractLinks: true }, [buffer]),
      (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err);
      },
    );
  });
}
