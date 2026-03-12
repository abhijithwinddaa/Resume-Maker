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
 */

interface LinkRect {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Detect iOS / Safari for platform-specific workarounds */
function isSafariOrIOS(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

export async function exportResumeToPDF(
  element: HTMLElement,
  fileName: string = "Resume",
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

  // Collect link positions BEFORE html2canvas clones (need live DOM rects)
  const linkRects = collectLinkRects(element);
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

  const pdfBytes = await pdfDoc.save();

  // Cross-platform download using file-saver (handles Safari/iOS correctly)
  const safeName = fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "Resume";
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  saveAs(blob, `${safeName}.pdf`);
}
