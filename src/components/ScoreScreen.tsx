import React, { memo, useMemo, Suspense } from "react";
import {
  Trophy,
  AlertCircle,
  Clock,
  Zap,
  Edit3,
  Eye,
  FileType,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { type OptimizeProgress } from "../utils/aiService";
import { type ResumeFeedbackSignal } from "../utils/resumeFeedback";
import { formatCooldown } from "../utils/rateLimiter";
import ResumeTemplate from "./ResumeTemplate";
import ErrorBoundary from "./ErrorBoundary";
import { PreviewSkeleton } from "./Skeleton";

interface ScoreScreenProps {
  handleOptimize: () => void;
  handleSelfOptimize: () => void;
  handleStopOptimize: () => void;
  handleEdit: () => void;
  handleExportDocx: () => void;
  handleExportPDF: () => void;
  isCompactScreen: boolean;
  useStickyMobileActions: boolean;
  isOptimizeCoolingDown: boolean;
  optimizeCooldownRemaining: number;
  showMobileResumePreview: boolean;
  setShowMobileResumePreview: (show: boolean) => void;
  isExporting: boolean;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getOptimizeProgressPercent(progress: OptimizeProgress | null): number {
  if (!progress) return 0;
  if (progress.phase === "done") return 100;

  const iter = progress.history.length;
  const maxIter = progress.maxIterations || 4;
  const raw = Math.round((iter / maxIter) * 100);
  return clampPercent(raw);
}

function uniqueStrings(items: string[] = []): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
}

/* ─── Score Visualization Components ─────────────────── */

const ScoreMeter = memo(function ScoreMeter({
  score,
  size = 160,
}: {
  score: number;
  size?: number;
}) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="score-meter">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="score-meter-text">
        <span className="score-number" style={{ color }}>
          {score}
        </span>
        <span className="score-label">/ 100</span>
      </div>
    </div>
  );
});

const BreakdownBar = memo(function BreakdownBar({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: number;
}) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="breakdown-bar">
      <div className="breakdown-info">
        <span className="breakdown-label">{label}</span>
        <span className="breakdown-score">
          {score}/100 <small>({weight}%)</small>
        </span>
      </div>
      <div className="breakdown-track">
        <div
          className="breakdown-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
});

const FeedbackSignalCard = memo(function FeedbackSignalCard({
  signal,
}: {
  signal: ResumeFeedbackSignal;
}) {
  const Icon =
    signal.status === "good"
      ? CheckCircle2
      : signal.status === "warning"
        ? AlertTriangle
        : AlertCircle;

  const statusLabel =
    signal.status === "good"
      ? "Strong"
      : signal.status === "warning"
        ? "Needs work"
        : "High priority";

  return (
    <article className={`feedback-card feedback-card-${signal.status}`}>
      <div className="feedback-card-header">
        <div className="feedback-card-title">
          <Icon size={16} />
          <h5>{signal.title}</h5>
        </div>
        <span className={`feedback-badge feedback-badge-${signal.status}`}>
          {statusLabel}
        </span>
      </div>
      <p>{signal.summary}</p>
      {signal.details.length > 0 && (
        <ul>
          {signal.details.map((detail) => (
            <li key={`${signal.id}-${detail}`}>{detail}</li>
          ))}
        </ul>
      )}
    </article>
  );
});

export const ScoreScreen: React.FC<ScoreScreenProps> = ({
  handleOptimize,
  handleSelfOptimize,
  handleStopOptimize,
  handleEdit,
  handleExportDocx,
  handleExportPDF,
  isCompactScreen,
  useStickyMobileActions,
  isOptimizeCoolingDown,
  optimizeCooldownRemaining,
  showMobileResumePreview,
  setShowMobileResumePreview,
  isExporting,
}) => {
  const {
    step,
    atsResult,
    resumeData,
    jdText,
    optimizeDone,
    previousScore,
    isOptimizing,
    optimizeProgress,
    error,
  } = useAppStore();

  const optimizePercent = useMemo(
    () => getOptimizeProgressPercent(optimizeProgress),
    [optimizeProgress],
  );

  if (step !== "score" || !atsResult || !resumeData) return null;

  return (
    <div
      className="score-step"
      role="region"
      aria-label="ATS score results"
    >
      <div className="score-left">
        <div className="score-header">
          <ScoreMeter score={atsResult.overallScore} />
          <div className="score-verdict">
            <h3>{jdText.trim() ? "ATS Score" : "Self ATS Score"}</h3>
            {!jdText.trim() && (
              <small className="self-score-tag">
                General best practices — no JD
              </small>
            )}
            <p>{atsResult.summaryVerdict}</p>
            {optimizeDone && previousScore !== null && (
              <div className="improvement-badge">
                <Trophy size={16} />
                Improved: {previousScore} &rarr; {atsResult.overallScore}
              </div>
            )}
          </div>
        </div>

        <div className="keywords-section">
          <h4>
            {jdText.trim() ? "Keywords Found" : "Industry Keywords Found"}
          </h4>
          <div className="keyword-tags">
            {uniqueStrings([
              ...(atsResult.breakdown.keywordMatch.matchedKeywords || []),
              ...(atsResult.breakdown.skillsAlignment.matchedSkills || []),
            ]).map((k) => (
              <span key={k} className="tag tag-match">
                {k}
              </span>
            ))}
          </div>
          <h4>
            {jdText.trim()
              ? "Missing Keywords"
              : "Suggested Keywords to Add"}
          </h4>
          <div className="keyword-tags">
            {uniqueStrings([
              ...(atsResult.breakdown.keywordMatch.missingKeywords || []),
              ...(atsResult.breakdown.skillsAlignment.missingSkills || []),
            ]).map((k) => (
              <span key={k} className="tag tag-missing">
                {k}
              </span>
            ))}
          </div>
        </div>

        <div className="breakdown-section">
          <h4>Breakdown</h4>
          <BreakdownBar
            label={jdText.trim() ? "Keyword Match" : "Industry Keywords"}
            score={atsResult.breakdown.keywordMatch.score}
            weight={atsResult.breakdown.keywordMatch.weight}
          />
          <BreakdownBar
            label={
              jdText.trim() ? "Skills Alignment" : "Skills Presentation"
            }
            score={atsResult.breakdown.skillsAlignment.score}
            weight={atsResult.breakdown.skillsAlignment.weight}
          />
          <BreakdownBar
            label={
              jdText.trim() ? "Experience Relevance" : "Content Quality"
            }
            score={atsResult.breakdown.experienceRelevance.score}
            weight={atsResult.breakdown.experienceRelevance.weight}
          />
          <BreakdownBar
            label="Formatting"
            score={atsResult.breakdown.formatting.score}
            weight={atsResult.breakdown.formatting.weight}
          />
          <BreakdownBar
            label="Impact & Metrics"
            score={atsResult.breakdown.impact.score}
            weight={atsResult.breakdown.impact.weight}
          />
        </div>

        {atsResult.qualityInsights?.signals?.length ? (
          <div className="feedback-section">
            <h4>Resume Signals</h4>
            <div className="feedback-grid">
              {atsResult.qualityInsights.signals.map((signal) => (
                <FeedbackSignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          </div>
        ) : null}

        {atsResult.topSuggestions.length > 0 && (
          <div className="suggestions-section">
            <h4>Suggestions</h4>
            <ul>
              {atsResult.topSuggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {isOptimizing && optimizeProgress && (
          <div className="optimize-progress">
            <div className="optimize-header">
              <span>{optimizeProgress.message}</span>
              <strong>{optimizePercent}%</strong>
            </div>
            <div className="loading-progress-track" aria-hidden="true">
              <div
                className="loading-progress-fill"
                style={{ width: `${optimizePercent}%` }}
              />
            </div>
            <div className="optimize-timeline">
              {optimizeProgress.history.map((h) => (
                <div key={h.iteration} className="timeline-item">
                  <div className="timeline-dot" />
                  <span>
                    Iteration {h.iteration}: Score{" "}
                    {h.atsResult.overallScore}/100
                  </span>
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              onClick={handleStopOptimize}
            >
              Stop
            </button>
          </div>
        )}

        {!isOptimizing && (
          <div
            className={`score-actions ${useStickyMobileActions ? "score-actions-sticky" : ""}`}
          >
            <button
              className="btn-optimize"
              onClick={
                jdText.trim() ? handleOptimize : handleSelfOptimize
              }
              disabled={isOptimizeCoolingDown}
            >
              {isOptimizeCoolingDown ? (
                <>
                  <Clock size={18} />
                  Wait {formatCooldown(optimizeCooldownRemaining)}
                </>
              ) : (
                <>
                  <Zap size={18} />
                  {optimizeDone
                    ? "Re-Optimize"
                    : jdText.trim()
                      ? "Optimize Resume"
                      : "Self Optimize"}
                </>
              )}
            </button>
            <button className="btn-edit" onClick={handleEdit}>
              <Edit3 size={18} />
              {optimizeDone ? "Edit Resume" : "Edit Manually"}
            </button>
          </div>
        )}

        {isCompactScreen && (
          <div className="mobile-resume-trigger-row">
            <button
              className="btn-secondary mobile-resume-trigger"
              onClick={() => setShowMobileResumePreview(true)}
            >
              <Eye size={16} /> Show Resume
            </button>
            <div className="mobile-export-row">
              <button
                className="btn-secondary mobile-export-btn"
                onClick={handleExportDocx}
                disabled={isExporting}
              >
                <FileType size={14} /> DOCX
              </button>
              <button
                className="btn-primary-mobile mobile-export-btn"
                onClick={handleExportPDF}
                disabled={isExporting}
              >
                <Download size={14} /> Export PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {!isCompactScreen && (
        <div className="score-right">
          <div className="preview-container">
            <ErrorBoundary>
              <Suspense fallback={<PreviewSkeleton />}>
                <ResumeTemplate data={resumeData} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Mobile Preview Toggle Overlay */}
      {isCompactScreen && showMobileResumePreview && (
        <div
          className="mobile-resume-overlay"
          onClick={() => setShowMobileResumePreview(false)}
        >
          <div
            className="mobile-resume-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-resume-sheet-header">
              <h3>Resume Preview</h3>
              <button
                className="mobile-resume-close"
                onClick={() => setShowMobileResumePreview(false)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mobile-resume-sheet-body">
              <div className="preview-container">
                <ErrorBoundary>
                  <Suspense fallback={<PreviewSkeleton />}>
                    <ResumeTemplate data={resumeData} />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ScoreScreen;
