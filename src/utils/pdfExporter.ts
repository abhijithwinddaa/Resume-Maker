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

interface TextRect {
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

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
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

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

/** Walk DOM tree and collect visible text nodes with their positions and computed font sizes */
function collectTextRects(container: HTMLElement): TextRect[] {
  const containerRect = container.getBoundingClientRect();
  const results: TextRect[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_REJECT;
      // Skip <script>, <style> content
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (!text) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const computed = getComputedStyle(parent);
    const fontSize = parseFloat(computed.fontSize) || 10;

    results.push({
      text,
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      fontSize,
    });
  }

  return results;
}

export async function exportResumeToPDF(
  element: HTMLElement,
  fileName: string = "Resume",
  resumeData?: ResumeData,
): Promise<void> {
  // Wait for all fonts to load before rendering
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Lazy-load heavy libraries for code splitting
  const [{ default: html2canvas }, pdfLib, { saveAs }] = await Promise.all([
    import("html2canvas-pro"),
    import("pdf-lib"),
    import("file-saver"),
  ]);
  const { PDFDocument } = pdfLib;

  // A4 in points (1pt = 1/72 inch)
  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;

  // Collect link + text positions BEFORE html2canvas clones (need live DOM rects)
  const linkRects = collectLinkRects(element);
  const textRects = collectTextRects(element);
  const elementWidth = element.offsetWidth;
  const elementHeight = element.offsetHeight;

  // Adaptive scale: lower for mobile/Safari to avoid memory issues
  const scale = isSafariOrIOS() ? 2 : 3;

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
        // Clear CSS that html2canvas can't render properly
        clonedEl.style.filter = "none";
        clonedEl.style.backdropFilter = "none";
      }
    },
  });

  // Convert canvas to PNG bytes
  const pngDataUrl = canvas.toDataURL("image/png", 1.0);
  const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );

  // Build PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Scale image to fit A4 width, maintain aspect ratio
  const imgAspect = pngImage.height / pngImage.width;
  const pageWidth = A4_WIDTH_PT;
  const imgHeight = pageWidth * imgAspect;
  const pageHeight = Math.max(imgHeight, A4_HEIGHT_PT);

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const imgY = pageHeight - imgHeight;

  page.drawImage(pngImage, {
    x: 0,
    y: imgY,
    width: pageWidth,
    height: imgHeight,
  });

  // Overlay clickable link annotations
  // Convert DOM pixel coords to PDF points
  const scaleX = pageWidth / elementWidth;
  const scaleY = imgHeight / elementHeight;

  for (const link of linkRects) {
    const pdfX = link.x * scaleX;
    // PDF y-axis is bottom-up; DOM y is top-down
    const pdfY = pageHeight - (link.y + link.height) * scaleY;
    const pdfW = link.width * scaleX;
    const pdfH = link.height * scaleY;

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

  // Overlay invisible text layer for ATS compatibility
  // Uses TextRenderingMode.Invisible (mode 3) — the PDF standard for hidden
  // text that is still extractable by text parsers and ATS systems.
  if (textRects.length > 0) {
    const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
    const fontKey = page.node.newFontDictionary("Helvetica", font.ref);

    for (const tr of textRects) {
      // Convert DOM coords to PDF coords
      const pdfFontSize = Math.max(tr.fontSize * scaleX * 0.75, 1); // px→pt
      const pdfX = tr.x * scaleX;
      const pdfY = pageHeight - tr.y * scaleY - pdfFontSize;

      // Sanitize text — pdf-lib's Helvetica can only encode WinAnsi characters
      const safe = tr.text.replace(/[^\x20-\x7E]/g, " ");
      if (!safe.trim()) continue;

      page.pushOperators(
        pdfLib.pushGraphicsState(),
        pdfLib.beginText(),
        pdfLib.setTextRenderingMode(pdfLib.TextRenderingMode.Invisible),
        pdfLib.setFontAndSize(fontKey, pdfFontSize),
        pdfLib.moveText(pdfX, pdfY),
        pdfLib.showText(font.encodeText(safe)),
        pdfLib.endText(),
        pdfLib.popGraphicsState(),
      );
    }
  }

  // Embed ResumeData JSON in PDF metadata for lossless re-upload
  if (resumeData) {
    pdfDoc.setSubject(RESUME_DATA_MARKER + JSON.stringify(resumeData));
  }
  pdfDoc.setCreator("Resume Maker");

  const pdfBytes = await pdfDoc.save();

  // Cross-platform download using file-saver (handles Safari/iOS correctly)
  const safeName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "Resume";
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  saveAs(blob, `${safeName}.pdf`);
}
