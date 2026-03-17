import type { ResumeData } from "../types/resume";

/**
 * Marker prefix used to identify embedded ResumeData JSON in PDF metadata.
 * Checked during re-upload to enable perfect round-trip import.
 */
export const RESUME_DATA_MARKER = "%%RESUME_MAKER_DATA_V1%%";

/**
 * Export a resume DOM element directly to a clean PDF file.
 * Uses html2canvas for pixel-perfect rendering + pdf-lib for A4 output.
 * Both libraries are lazy-loaded for code splitting.
 *
 * Principles followed:
 * - A4 page (210mm × 297mm = 595.28 × 841.89 pt)
 * - Adaptive DPI (scale 2 on mobile/Safari, scale 3 on desktop)
 * - White background, no browser chrome
 * - Preserves all colors, fonts, links as rendered
 * - Clickable link annotations overlaid on the image
 * - Cross-platform download (file-saver fallback for Safari/iOS)
 * - Embeds ResumeData JSON in PDF metadata for lossless re-upload
 */

interface LinkRect {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MAX_SUBJECT_CHARS = 12000;

/** Detect iOS / Safari for platform-specific workarounds */
function isSafariOrIOS(): boolean {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIOS || isSafari;
}

/** Collect all <a> elements with valid href and their bounding rects relative to the container */
function collectLinkRects(container: HTMLElement): LinkRect[] {
  const containerRect = container.getBoundingClientRect();
  const links: LinkRect[] = [];
  const anchors = container.querySelectorAll("a[href]");

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    links.push({
      href,
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    });
  });

  return links;
}

export interface TextRect {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 
 * Use a TreeWalker to find all visible text nodes and compute their exact 
 * bounding boxes and font sizes relative to the container. 
 * This allows overlaying invisible text on the PDF perfectly matching the visual image.
 */
function collectTextRects(container: HTMLElement): TextRect[] {
  const containerRect = container.getBoundingClientRect();
  const rects: TextRect[] = [];

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue?.trim();
    if (!text) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    // Skip hidden elements
    const style = window.getComputedStyle(parent);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      continue;
    }

    // Use a Range to get the exact bounding box of just the text node 
    // (not taking up the full width of block parents)
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) continue;

    const fontSize = parseFloat(style.fontSize) || 12;

    rects.push({
      text: sanitizePdfText(text),
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
      fontSize,
    });
  }

  return rects;
}

/**
 * Some renderers can produce a tiny trailing white slice that appears as
 * an extra blank page in the exported PDF. Sample pixels to detect this.
 */
function isCanvasMostlyWhite(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  const { width, height } = canvas;
  if (width === 0 || height === 0) return true;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  let sampled = 0;
  let nonWhite = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      sampled += 1;
      // Treat any non-transparent or darker pixel as content.
      if (a > 245 && (r < 248 || g < 248 || b < 248)) {
        nonWhite += 1;
      }
    }
  }

  if (sampled === 0) return true;
  return nonWhite / sampled < 0.0015;
}

export async function exportResumeToPDF(
  element: HTMLElement,
  fileName: string = "Resume",
  resumeData?: ResumeData,
  options?: {
    embedResumeData?: boolean;
  },
): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const [{ default: html2canvas }, pdfLib, { saveAs }] = await Promise.all([
    import("html2canvas-pro"),
    import("pdf-lib"),
    import("file-saver"),
  ]);
  const { PDFDocument } = pdfLib;

  const links = collectLinkRects(element);
  const textRects = collectTextRects(element);
  const elementWidth = Math.max(1, element.offsetWidth);

  const scale = isSafariOrIOS() ? 2 : 2.5;
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc: Document) => {
      const clonedEl = clonedDoc.querySelector(".resume-page") as HTMLElement;
      if (clonedEl) {
        clonedEl.style.boxShadow = "none";
        clonedEl.style.outline = "none";
        clonedEl.style.border = "none";
        clonedEl.style.width = "210mm";
        clonedEl.style.minHeight = "297mm";
        clonedEl.style.filter = "none";
        clonedEl.style.backdropFilter = "none";
      }
    },
  });

  if (!canvas.width || !canvas.height) {
    throw new Error("Could not render resume for PDF export");
  }

  const pagePixelHeight = Math.max(
    1,
    Math.floor((canvas.width * A4_HEIGHT_PT) / A4_WIDTH_PT),
  );
  const pageCount = Math.max(1, Math.ceil(canvas.height / pagePixelHeight));
  const cssPageHeight = pagePixelHeight / scale;
  const pointsPerCssPx = A4_WIDTH_PT / elementWidth;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const srcY = pageIndex * pagePixelHeight;
    const sliceHeight = Math.min(pagePixelHeight, canvas.height - srcY);

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;

    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create canvas context for PDF slice");
    }
    ctx.drawImage(
      canvas,
      0,
      srcY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    const tinySlice = sliceHeight < pagePixelHeight * 0.12;
    const trailingPage = pageIndex > 0;
    if (trailingPage && (tinySlice || pageIndex === pageCount - 1)) {
      if (isCanvasMostlyWhite(sliceCanvas)) {
        continue;
      }
    }

    const pngDataUrl = sliceCanvas.toDataURL("image/png", 1.0);
    const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );

    const pageImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

    const renderedHeight = (sliceHeight / sliceCanvas.width) * A4_WIDTH_PT;
    page.drawImage(pageImage, {
      x: 0,
      y: A4_HEIGHT_PT - renderedHeight,
      width: A4_WIDTH_PT,
      height: renderedHeight,
    });

    const pageFontKey = page.node.newFontDictionary("Helvetica", font.ref);
    
    // Render text nodes that fall into this page
    const pageStartCssY = pageIndex * cssPageHeight;
    const pageEndCssY = pageStartCssY + cssPageHeight;
    
    for (const textRect of textRects) {
      // Check if text is mostly within this page
      const textCenterY = textRect.y + textRect.height / 2;
      if (textCenterY >= pageStartCssY && textCenterY < pageEndCssY) {
        
        const localY = textRect.y - pageStartCssY;
        
        // Convert CSS coordinates to PDF points
        const pdfX = textRect.x * pointsPerCssPx;
        // PDF Y coordinate (0 is at bottom)
        const pdfY = A4_HEIGHT_PT - (localY + textRect.height) * pointsPerCssPx;
        
        // Approximate PDF font size
        const pdfFontSize = textRect.fontSize * pointsPerCssPx;

        page.pushOperators(
          pdfLib.pushGraphicsState(),
          pdfLib.beginText(),
          pdfLib.setTextRenderingMode(pdfLib.TextRenderingMode.Invisible),
          pdfLib.setFontAndSize(pageFontKey, pdfFontSize),
          // Slight vertical adjustment because moveText sets the baseline, not the top border
          pdfLib.moveText(pdfX, pdfY + (pdfFontSize * 0.2)),
          pdfLib.showText(font.encodeText(textRect.text)),
          pdfLib.endText(),
          pdfLib.popGraphicsState(),
        );
      }
    }

    for (const link of links) {
      const segTop = Math.max(link.y, pageStartCssY);
      const segBottom = Math.min(link.y + link.height, pageEndCssY);
      if (segBottom <= segTop) continue;

      const localY = segTop - pageStartCssY;
      const segmentHeight = segBottom - segTop;

      const pdfX = link.x * pointsPerCssPx;
      const pdfY = A4_HEIGHT_PT - (localY + segmentHeight) * pointsPerCssPx;
      const pdfW = link.width * pointsPerCssPx;
      const pdfH = segmentHeight * pointsPerCssPx;

      page.node.addAnnot(
        pdfDoc.context.register(
          pdfDoc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [pdfX, pdfY, pdfX + pdfW, pdfY + pdfH],
            Border: [0, 0, 0],
            A: {
              Type: "Action",
              S: "URI",
              URI: pdfLib.PDFString.of(link.href),
            },
          }),
        ),
      );
    }
  }

  if (resumeData && options?.embedResumeData !== false) {
    const payload = RESUME_DATA_MARKER + JSON.stringify(resumeData);
    if (payload.length <= MAX_SUBJECT_CHARS) {
      pdfDoc.setSubject(payload);
    }
  }
  pdfDoc.setCreator("Resume Maker");

  const pdfBytes = await pdfDoc.save();

  const safeName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "Resume";
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  saveAs(blob, `${safeName}.pdf`);
}
