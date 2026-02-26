/**
 * Export a resume DOM element directly to a clean PDF file.
 * Uses html2canvas for pixel-perfect rendering + pdf-lib for A4 output.
 * Both libraries are lazy-loaded for code splitting.
 *
 * Principles followed:
 * - A4 page (210mm × 297mm = 595.28 × 841.89 pt)
 * - High DPI (scale 3) for crisp text
 * - White background, no browser chrome
 * - Preserves all colors, fonts, links as rendered
 * - Direct download — no print dialog
 */
export async function exportResumeToPDF(
  element: HTMLElement,
  fileName: string = "Resume",
): Promise<void> {
  // Lazy-load heavy libraries for code splitting
  const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
    import("html2canvas-pro"),
    import("pdf-lib"),
  ]);

  // A4 in points (1pt = 1/72 inch)
  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;

  // High-res canvas for crisp text
  const scale = 3;

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
      }
    },
  });

  // Convert canvas to PNG bytes
  const pngDataUrl = canvas.toDataURL("image/png", 1.0);
  const pngBytes = Uint8Array.from(
    atob(pngDataUrl.split(",")[1]),
    (c) => c.charCodeAt(0),
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
  page.drawImage(pngImage, {
    x: 0,
    y: pageHeight - imgHeight,
    width: pageWidth,
    height: imgHeight,
  });

  const pdfBytes = await pdfDoc.save();

  // Trigger download
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName =
    fileName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "Resume";
  a.download = `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
