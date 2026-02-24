import { useState, memo } from "react";
import type { ResumeData } from "../types/resume";
import type { AISettings } from "../types/aiSettings";
import type { ATSResult } from "../utils/aiService";
import { analyzeATSScore } from "../utils/aiService";
import {
  Gauge,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import "./ATSScore.css";

interface ATSScoreProps {
  resumeData: ResumeData;
  aiSettings: AISettings;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Improvement";
  return "Poor Match";
}

function ScoreMeter({ score, size = 180 }: { score: number; size?: number }) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="score-meter" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
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
          style={{ transition: "stroke-dasharray 1s ease-out" }}
        />
      </svg>
      <div className="score-meter-text">
        <span className="score-number" style={{ color }}>
          {score}
        </span>
        <span className="score-label">{getScoreLabel(score)}</span>
      </div>
    </div>
  );
}

function BreakdownBar({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: number;
}) {
  const color = getScoreColor(score);
  return (
    <div className="breakdown-bar">
      <div className="breakdown-bar-header">
        <span className="breakdown-label">{label}</span>
        <span className="breakdown-weight">({weight}% weight)</span>
        <span className="breakdown-score" style={{ color }}>
          {score}/100
        </span>
      </div>
      <div className="breakdown-track">
        <div
          className="breakdown-fill"
          style={{
            width: `${score}%`,
            backgroundColor: color,
            transition: "width 0.8s ease-out",
          }}
        />
      </div>
    </div>
  );
}

const ATSScore = memo(function ATSScore({
  resumeData,
  aiSettings,
}: ATSScoreProps) {
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ATSResult | null>(null);

  const handleAnalyze = async () => {
    if (!jd.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const atsResult = await analyzeATSScore(aiSettings, resumeData, jd);
      setResult(atsResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze ATS score",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="ats-score-panel">
      <div className="ats-header">
        <Gauge size={20} />
        <h2>ATS Score Analyzer</h2>
      </div>
      <p className="ats-description">
        Paste a job description to get an AI-powered ATS compatibility score for
        your resume. The analysis checks keyword matching, skills alignment,
        experience relevance, formatting, and impact.
      </p>

      {!result && (
        <>
          <textarea
            className="ats-jd-input"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here..."
            rows={8}
            disabled={loading}
          />
          <button
            className="ats-analyze-btn"
            onClick={handleAnalyze}
            disabled={loading || !jd.trim()}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Analyzing with{" "}
                {aiSettings.provider === "groq" ? "Groq" : "Ollama"}...
              </>
            ) : (
              <>
                <Gauge size={16} />
                Analyze ATS Score
              </>
            )}
          </button>
        </>
      )}

      {error && (
        <div className="ats-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="ats-results">
          {/* Main Score Meter */}
          <div className="ats-score-main">
            <ScoreMeter score={result.overallScore} />
          </div>

          {/* Verdict */}
          <div className="ats-verdict">
            <p>{result.summaryVerdict}</p>
          </div>

          {/* Breakdown */}
          <div className="ats-breakdown">
            <h3>Score Breakdown</h3>
            <BreakdownBar
              label="Keyword Match"
              score={result.breakdown.keywordMatch.score}
              weight={35}
            />
            <BreakdownBar
              label="Skills Alignment"
              score={result.breakdown.skillsAlignment.score}
              weight={25}
            />
            <BreakdownBar
              label="Experience Relevance"
              score={result.breakdown.experienceRelevance.score}
              weight={20}
            />
            <BreakdownBar
              label="Formatting"
              score={result.breakdown.formatting.score}
              weight={10}
            />
            <BreakdownBar
              label="Impact & Metrics"
              score={result.breakdown.impact.score}
              weight={10}
            />
          </div>

          {/* Keyword Details */}
          <div className="ats-keywords-section">
            <h3>Keyword Analysis</h3>
            {result.breakdown.keywordMatch.matchedKeywords &&
              result.breakdown.keywordMatch.matchedKeywords.length > 0 && (
                <div className="keyword-group">
                  <div className="keyword-group-header">
                    <CheckCircle size={14} className="icon-matched" />
                    <span>
                      Matched Keywords (
                      {result.breakdown.keywordMatch.matchedKeywords.length})
                    </span>
                  </div>
                  <div className="keyword-tags">
                    {result.breakdown.keywordMatch.matchedKeywords.map(
                      (kw, i) => (
                        <span key={i} className="keyword-tag matched">
                          {kw}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            {result.breakdown.keywordMatch.missingKeywords &&
              result.breakdown.keywordMatch.missingKeywords.length > 0 && (
                <div className="keyword-group">
                  <div className="keyword-group-header">
                    <XCircle size={14} className="icon-missing" />
                    <span>
                      Missing Keywords (
                      {result.breakdown.keywordMatch.missingKeywords.length})
                    </span>
                  </div>
                  <div className="keyword-tags">
                    {result.breakdown.keywordMatch.missingKeywords.map(
                      (kw, i) => (
                        <span key={i} className="keyword-tag missing">
                          {kw}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Skills Details */}
          <div className="ats-skills-section">
            <h3>Skills Analysis</h3>
            {result.breakdown.skillsAlignment.matchedSkills &&
              result.breakdown.skillsAlignment.matchedSkills.length > 0 && (
                <div className="keyword-group">
                  <div className="keyword-group-header">
                    <CheckCircle size={14} className="icon-matched" />
                    <span>
                      Matched Skills (
                      {result.breakdown.skillsAlignment.matchedSkills.length})
                    </span>
                  </div>
                  <div className="keyword-tags">
                    {result.breakdown.skillsAlignment.matchedSkills.map(
                      (s, i) => (
                        <span key={i} className="keyword-tag matched">
                          {s}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            {result.breakdown.skillsAlignment.missingSkills &&
              result.breakdown.skillsAlignment.missingSkills.length > 0 && (
                <div className="keyword-group">
                  <div className="keyword-group-header">
                    <XCircle size={14} className="icon-missing" />
                    <span>
                      Missing Skills (
                      {result.breakdown.skillsAlignment.missingSkills.length})
                    </span>
                  </div>
                  <div className="keyword-tags">
                    {result.breakdown.skillsAlignment.missingSkills.map(
                      (s, i) => (
                        <span key={i} className="keyword-tag missing">
                          {s}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Feedback Details */}
          <div className="ats-feedback-section">
            <h3>Detailed Feedback</h3>
            <div className="feedback-item">
              <strong>Keywords:</strong>{" "}
              {result.breakdown.keywordMatch.feedback}
            </div>
            <div className="feedback-item">
              <strong>Skills:</strong>{" "}
              {result.breakdown.skillsAlignment.feedback}
            </div>
            <div className="feedback-item">
              <strong>Experience:</strong>{" "}
              {result.breakdown.experienceRelevance.feedback}
            </div>
            <div className="feedback-item">
              <strong>Formatting:</strong>{" "}
              {result.breakdown.formatting.feedback}
            </div>
            <div className="feedback-item">
              <strong>Impact:</strong> {result.breakdown.impact.feedback}
            </div>
          </div>

          {/* Top Suggestions */}
          <div className="ats-suggestions">
            <h3>
              <Lightbulb size={16} />
              Top Suggestions to Improve
            </h3>
            <ol className="suggestions-list">
              {result.topSuggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>

          {/* Analyze Again */}
          <button className="ats-reset-btn" onClick={handleReset}>
            <RotateCcw size={14} />
            Analyze Another JD
          </button>
        </div>
      )}
    </div>
  );
});

export default ATSScore;
