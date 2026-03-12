import React, { useMemo } from "react";
import type { ResumeData } from "../types/resume";
import { calculateCompleteness } from "../utils/exportValidation";
import { CheckCircle2, Circle } from "lucide-react";
import "./CompletenessBar.css";

interface CompletenessBarProps {
  data: ResumeData;
}

const CompletenessBar: React.FC<CompletenessBarProps> = ({ data }) => {
  const { percentage, breakdown } = useMemo(
    () => calculateCompleteness(data),
    [data],
  );

  const color =
    percentage >= 71 ? "#22c55e" : percentage >= 41 ? "#f59e0b" : "#ef4444";

  return (
    <div className="completeness-bar">
      <div className="completeness-header">
        <span className="completeness-label">Resume Completeness</span>
        <span className="completeness-pct" style={{ color }}>
          {percentage}%
        </span>
      </div>
      <div className="completeness-track">
        <div
          className="completeness-fill"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
      <ul className="completeness-checklist">
        {breakdown.map((item) => (
          <li key={item.label} className={item.complete ? "done" : "pending"}>
            {item.complete ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CompletenessBar;
