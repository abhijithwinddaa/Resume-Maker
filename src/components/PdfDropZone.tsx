import { useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

interface PdfDropZoneProps {
  /** The screen's existing hidden PDF input; dropped files are routed through it. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  onRejected: (message: string) => void;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * The primary way in: a large target to drop or pick a PDF. It feeds the
 * existing file input, so upload, OCR, and parsing behave exactly as the
 * "Upload PDF" button does.
 */
export function PdfDropZone({ inputRef, disabled, onRejected }: PdfDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    const input = inputRef.current;
    if (!file || !input) return;
    if (!isPdf(file)) {
      onRejected("Please drop a PDF file, or paste your resume text below.");
      return;
    }

    // Hand the file to the real input and fire the change React listens for.
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  return (
    <div
      className={`pdf-drop-zone${isDragOver ? " is-drag-over" : ""}${disabled ? " is-disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      data-tour="upload-pdf"
    >
      <UploadCloud size={28} aria-hidden="true" className="pdf-drop-zone-icon" />
      <p className="pdf-drop-zone-title">
        Drop your resume PDF here or{" "}
        <button
          type="button"
          className="pdf-drop-zone-browse"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          browse
        </button>
      </p>
      <p className="pdf-drop-zone-hint">
        Scanned PDFs work too. Or paste the text below.
      </p>
    </div>
  );
}

export default PdfDropZone;
