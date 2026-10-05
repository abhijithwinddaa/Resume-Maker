import React, { useMemo } from "react";
import type { ResumeData } from "../types/resume";
import { calculateCompleteness } from "../utils/exportValidation";
import { CheckCircle2, Circle } from "lucide-react";
import "./CompletenessBar.css";

interface CompletenessBarProps {
  data: ResumeData;
}

/**
 * Progress plus only what's left to do. The full checklist of finished
 * sections filled a phone screen before the form even started.
 */
const CompletenessBar: React.FC<CompletenessBarProps> = ({ data }) => {
  const { percentage, breakdown } = useMemo(
    () => calculateCompleteness(data),
    [data],
  );
  const missing = breakdown.filter((item) => !item.complete);

  const color =
    percentage >= 71
      ? "var(--success-text)"
      : percentage >= 41
        ? "var(--warning-text)"
        : "var(--error-text)";

  return (
    <div className="completeness-bar">
      <div className="completeness-header">
        <span className="completeness-label">Resume Completeness</span>
        <span className="completeness-pct" style={{ color }}>
          {percentage}%
        </span>
      </div>
      <div
        className="completeness-track"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Resume completeness"
      >
        <div
          className="completeness-fill"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
      {missing.length > 0 ? (
        <ul className="completeness-checklist">
          {missing.map((item) => (
            <li key={item.label} className="pending">
              <Circle size={14} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="completeness-done">
          <CheckCircle2 size={14} />
          All sections complete
        </p>
      )}
    </div>
  );
};

export default CompletenessBar;
