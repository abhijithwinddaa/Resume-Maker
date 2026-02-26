import { useAppStore } from "../store/appStore";
import { X, FileText } from "lucide-react";
import "./PdfPreview.css";

interface PdfPreviewProps {
  onClose: () => void;
}

export default function PdfPreview({ onClose }: PdfPreviewProps) {
  const originalPdfUrl = useAppStore((s) => s.originalPdfUrl);

  if (!originalPdfUrl) return null;

  return (
    <div
      className="pdf-preview-panel"
      role="complementary"
      aria-label="Original PDF preview"
    >
      <div className="pdf-preview-header">
        <span className="pdf-preview-title">
          <FileText size={14} />
          Original PDF
        </span>
        <button
          className="pdf-preview-close"
          onClick={onClose}
          aria-label="Close PDF preview"
        >
          <X size={14} />
        </button>
      </div>
      <div className="pdf-preview-body">
        <iframe
          src={`${originalPdfUrl}#toolbar=0&navpanes=0`}
          title="Original uploaded resume PDF"
          className="pdf-preview-iframe"
        />
      </div>
    </div>
  );
}
