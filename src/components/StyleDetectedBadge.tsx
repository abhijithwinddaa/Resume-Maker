import { useAppStore } from "../store/appStore";
import { Sparkles, RotateCcw } from "lucide-react";
import "./StyleDetectedBadge.css";

/**
 * Small badge shown in the editor when an uploaded resume's style has been
 * auto-detected. Lets the user re-apply or see what was matched.
 */
export default function StyleDetectedBadge() {
  const detectedStyle = useAppStore((s) => s.detectedStyle);
  const applyDetectedStyle = useAppStore((s) => s.applyDetectedStyle);

  if (!detectedStyle || detectedStyle.confidence === 0) return null;

  return (
    <div
      className="style-badge"
      role="status"
      aria-label="Detected template style"
    >
      <div className="style-badge-info">
        <Sparkles size={13} className="style-badge-icon" />
        <span className="style-badge-label">
          Matched: <strong>{detectedStyle.styleName}</strong>
        </span>
        <span className="style-badge-confidence">
          {detectedStyle.confidence}%
        </span>
      </div>
      <button
        className="style-badge-btn"
        onClick={applyDetectedStyle}
        title="Re-apply detected style"
        aria-label="Re-apply detected style"
      >
        <RotateCcw size={12} />
        Apply
      </button>
    </div>
  );
}
