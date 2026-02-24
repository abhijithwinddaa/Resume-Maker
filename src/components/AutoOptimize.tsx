import { useState, useRef, useCallback, memo } from "react";
import type { ResumeData } from "../types/resume";
import type { AISettings } from "../types/aiSettings";
import type { OptimizeProgress } from "../utils/aiService";
import { optimizeResumeLoop } from "../utils/aiService";
import {
  Zap,
  Loader2,
  AlertTriangle,
  Trophy,
  CheckCircle2,
  XCircle,
  StopCircle,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import "./AutoOptimize.css";

interface AutoOptimizeProps {
  resumeData: ResumeData;
  aiSettings: AISettings;
  onApply: (newData: ResumeData) => void;
}

function getScoreColor(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function MiniMeter({ score, size = 56 }: { score: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="mini-meter" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="mini-meter-score" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

const AutoOptimize = memo(function AutoOptimize({
  resumeData,
  aiSettings,
  onApply,
}: AutoOptimizeProps) {
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const maxIterations = 5;
  const targetScore = 95;

  const handleStart = useCallback(async () => {
    if (!jd.trim()) return;
    setRunning(true);
    setError(null);
    setProgress(null);

    abortRef.current = new AbortController();

    try {
      const result = await optimizeResumeLoop(
        aiSettings,
        resumeData,
        jd,
        targetScore,
        maxIterations,
        (p) => setProgress({ ...p }),
        abortRef.current.signal,
      );

      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization loop failed");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [jd, aiSettings, resumeData]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleApply = () => {
    if (progress?.finalResume) {
      onApply(progress.finalResume);
    }
  };

  const handleReset = () => {
    setProgress(null);
    setError(null);
  };

  const isFinished =
    progress?.phase === "done" ||
    progress?.phase === "target-reached" ||
    progress?.phase === "error";

  return (
    <div className="auto-optimize-panel">
      <div className="ao-header">
        <Zap size={20} />
        <h2>Auto-Optimize</h2>
      </div>
      <p className="ao-description">
        Paste a JD and let AI automatically rewrite and scan your resume in a
        loop until the ATS score reaches <strong>95+</strong>. Max{" "}
        {maxIterations} iterations.
      </p>

      {/* Input phase */}
      {!progress && !running && (
        <>
          <textarea
            className="ao-jd-input"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here..."
            rows={6}
          />
          <button
            className="ao-start-btn"
            onClick={handleStart}
            disabled={!jd.trim()}
          >
            <Zap size={16} />
            Start Auto-Optimization
          </button>
        </>
      )}

      {/* Running / Progress */}
      {(running || progress) && (
        <div className="ao-progress-section">
          {/* Status bar */}
          <div className={`ao-status-bar ${progress?.phase || "scanning"}`}>
            {running && <Loader2 size={16} className="spin" />}
            {progress?.phase === "target-reached" && (
              <Trophy size={16} className="icon-trophy" />
            )}
            {progress?.phase === "done" && !running && (
              <CheckCircle2 size={16} />
            )}
            {progress?.phase === "error" && <XCircle size={16} />}
            <span className="ao-status-text">
              {progress?.message || "Starting..."}
            </span>
          </div>

          {/* Progress bar */}
          {running && progress && (
            <div className="ao-progress-bar-container">
              <div className="ao-progress-track">
                <div
                  className="ao-progress-fill"
                  style={{
                    width: `${(progress.currentIteration / maxIterations) * 100}%`,
                  }}
                />
              </div>
              <span className="ao-progress-label">
                Iteration {progress.currentIteration} / {maxIterations}
              </span>
            </div>
          )}

          {/* Iteration history timeline */}
          {progress && progress.history.length > 0 && (
            <div className="ao-timeline">
              <h3>
                <TrendingUp size={14} />
                Optimization History
              </h3>
              <div className="ao-timeline-items">
                {progress.history.map((item, idx) => (
                  <div
                    key={idx}
                    className={`ao-timeline-item ${
                      item.atsResult.overallScore >= targetScore
                        ? "success"
                        : ""
                    }`}
                  >
                    <div className="ao-timeline-left">
                      <MiniMeter score={item.atsResult.overallScore} />
                    </div>
                    <div className="ao-timeline-right">
                      <div className="ao-timeline-header">
                        <span className="ao-iter-label">
                          Iteration {item.iteration}
                        </span>
                        {idx > 0 && (
                          <span
                            className={`ao-score-delta ${
                              item.atsResult.overallScore >
                              progress.history[idx - 1].atsResult.overallScore
                                ? "positive"
                                : item.atsResult.overallScore <
                                    progress.history[idx - 1].atsResult
                                      .overallScore
                                  ? "negative"
                                  : "neutral"
                            }`}
                          >
                            {item.atsResult.overallScore >
                            progress.history[idx - 1].atsResult.overallScore
                              ? "+"
                              : ""}
                            {item.atsResult.overallScore -
                              progress.history[idx - 1].atsResult.overallScore}
                          </span>
                        )}
                      </div>
                      <div className="ao-timeline-details">
                        <span>
                          Keywords:{" "}
                          {item.atsResult.breakdown.keywordMatch.score}
                        </span>
                        <span>
                          Skills:{" "}
                          {item.atsResult.breakdown.skillsAlignment.score}
                        </span>
                        <span>
                          Experience:{" "}
                          {item.atsResult.breakdown.experienceRelevance.score}
                        </span>
                        <span>
                          Impact: {item.atsResult.breakdown.impact.score}
                        </span>
                      </div>
                      {item.atsResult.breakdown.keywordMatch.missingKeywords &&
                        item.atsResult.breakdown.keywordMatch.missingKeywords
                          .length > 0 && (
                          <div className="ao-timeline-missing">
                            <span className="missing-label">Missing:</span>
                            {item.atsResult.breakdown.keywordMatch.missingKeywords
                              .slice(0, 5)
                              .map((kw, j) => (
                                <span key={j} className="missing-tag">
                                  {kw}
                                </span>
                              ))}
                            {item.atsResult.breakdown.keywordMatch
                              .missingKeywords.length > 5 && (
                              <span className="missing-more">
                                +
                                {item.atsResult.breakdown.keywordMatch
                                  .missingKeywords.length - 5}{" "}
                                more
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                    {idx < progress.history.length - 1 && (
                      <div className="ao-timeline-connector">
                        <ArrowRight size={12} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score progression summary */}
          {progress && progress.history.length > 1 && (
            <div className="ao-score-journey">
              <div className="ao-journey-bar">
                {progress.history.map((item, idx) => (
                  <div
                    key={idx}
                    className="ao-journey-dot"
                    style={{
                      left: `${(idx / (progress.history.length - 1)) * 100}%`,
                    }}
                    title={`Iteration ${item.iteration}: ${item.atsResult.overallScore}`}
                  >
                    <div
                      className="ao-dot"
                      style={{
                        backgroundColor: getScoreColor(
                          item.atsResult.overallScore,
                        ),
                      }}
                    />
                    <span className="ao-dot-score">
                      {item.atsResult.overallScore}
                    </span>
                  </div>
                ))}
                <div className="ao-journey-line" />
              </div>
            </div>
          )}

          {/* Stop button */}
          {running && (
            <button className="ao-stop-btn" onClick={handleStop}>
              <StopCircle size={14} />
              Stop Optimization
            </button>
          )}

          {/* Actions when finished */}
          {isFinished && progress?.finalResume && (
            <div className="ao-actions">
              <div className="ao-final-score">
                <MiniMeter score={progress.finalScore} size={72} />
                <div className="ao-final-info">
                  <span className="ao-final-label">
                    {progress.phase === "target-reached"
                      ? "Target Reached!"
                      : "Best Score Achieved"}
                  </span>
                  <span className="ao-final-desc">
                    {progress.history.length} iteration(s) completed
                  </span>
                </div>
              </div>
              <button className="ao-apply-btn" onClick={handleApply}>
                <CheckCircle2 size={14} />
                Apply Optimized Resume
              </button>
              <button className="ao-reset-btn" onClick={handleReset}>
                Try Again
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="ao-error">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default AutoOptimize;
