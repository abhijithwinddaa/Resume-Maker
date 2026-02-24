import React, { useState, memo } from "react";
import type { ResumeData } from "../types/resume";
import type { AISettings } from "../types/aiSettings";
import { generateAIResume } from "../utils/aiService";
import {
  Wand2,
  Loader2,
  Check,
  X,
  ArrowRight,
  RotateCcw,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";
import "./AIRewrite.css";

interface AIRewriteProps {
  resumeData: ResumeData;
  aiSettings: AISettings;
  onApply: (newData: ResumeData) => void;
}

interface DiffItem {
  section: string;
  field: string;
  original: string;
  rewritten: string;
  accepted: boolean;
}

const AIRewrite: React.FC<AIRewriteProps> = memo(
  ({ resumeData, aiSettings, onApply }) => {
    const [jdText, setJdText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiResult, setAiResult] = useState<ResumeData | null>(null);
    const [diffs, setDiffs] = useState<DiffItem[]>([]);

    const computeDiffs = (
      original: ResumeData,
      rewritten: ResumeData,
    ): DiffItem[] => {
      const items: DiffItem[] = [];

      // Summary
      if (original.summary !== rewritten.summary) {
        items.push({
          section: "Summary",
          field: "summary",
          original: original.summary,
          rewritten: rewritten.summary,
          accepted: true,
        });
      }

      // Projects
      for (
        let i = 0;
        i < Math.max(original.projects.length, rewritten.projects.length);
        i++
      ) {
        const orig = original.projects[i];
        const rewr = rewritten.projects[i];
        if (!orig || !rewr) continue;

        if (orig.techStack !== rewr.techStack) {
          items.push({
            section: `Project: ${orig.title}`,
            field: `projects[${i}].techStack`,
            original: orig.techStack,
            rewritten: rewr.techStack,
            accepted: true,
          });
        }

        for (
          let j = 0;
          j < Math.max(orig.bullets.length, rewr.bullets.length);
          j++
        ) {
          const origBullet = orig.bullets[j] || "";
          const rewrBullet = rewr.bullets[j] || "";
          if (origBullet !== rewrBullet) {
            items.push({
              section: `Project: ${orig.title}`,
              field: `projects[${i}].bullets[${j}]`,
              original: origBullet,
              rewritten: rewrBullet,
              accepted: true,
            });
          }
        }
      }

      // Skills
      for (
        let i = 0;
        i < Math.max(original.skills.length, rewritten.skills.length);
        i++
      ) {
        const orig = original.skills[i];
        const rewr = rewritten.skills[i];
        if (!orig && rewr) {
          items.push({
            section: "Skills",
            field: `skills[${i}]`,
            original: "(new category)",
            rewritten: `${rewr.label}: ${rewr.skills}`,
            accepted: true,
          });
        } else if (orig && rewr) {
          const origStr = `${orig.label}: ${orig.skills}`;
          const rewrStr = `${rewr.label}: ${rewr.skills}`;
          if (origStr !== rewrStr) {
            items.push({
              section: "Skills",
              field: `skills[${i}]`,
              original: origStr,
              rewritten: rewrStr,
              accepted: true,
            });
          }
        }
      }

      // Achievements
      for (
        let i = 0;
        i <
        Math.max(original.achievements.length, rewritten.achievements.length);
        i++
      ) {
        const orig = original.achievements[i];
        const rewr = rewritten.achievements[i];
        if (orig && rewr && orig.text !== rewr.text) {
          items.push({
            section: "Achievements",
            field: `achievements[${i}].text`,
            original: orig.text,
            rewritten: rewr.text,
            accepted: true,
          });
        }
      }

      return items;
    };

    const handleGenerate = async () => {
      if (!jdText.trim()) return;

      setLoading(true);
      setError(null);
      setAiResult(null);
      setDiffs([]);

      try {
        const result = await generateAIResume(aiSettings, resumeData, jdText);
        setAiResult(result);
        setDiffs(computeDiffs(resumeData, result));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    const toggleDiff = (index: number) => {
      setDiffs((prev) =>
        prev.map((d, i) => (i === index ? { ...d, accepted: !d.accepted } : d)),
      );
    };

    const acceptAll = () => {
      setDiffs((prev) => prev.map((d) => ({ ...d, accepted: true })));
    };

    const rejectAll = () => {
      setDiffs((prev) => prev.map((d) => ({ ...d, accepted: false })));
    };

    const handleApply = () => {
      if (!aiResult) return;

      // Start with AI result and selectively revert rejected changes
      let finalData: ResumeData = JSON.parse(JSON.stringify(aiResult));

      for (const diff of diffs) {
        if (diff.accepted) continue; // Keep AI version

        // Revert this specific change to original
        if (diff.field === "summary") {
          finalData.summary = resumeData.summary;
        } else if (diff.field.startsWith("projects[")) {
          const match = diff.field.match(
            /projects\[(\d+)\]\.(\w+)(?:\[(\d+)\])?/,
          );
          if (match) {
            const pi = parseInt(match[1]);
            const prop = match[2];
            const bi = match[3] !== undefined ? parseInt(match[3]) : undefined;

            if (prop === "techStack" && finalData.projects[pi]) {
              finalData.projects[pi].techStack =
                resumeData.projects[pi]?.techStack || "";
            } else if (
              prop === "bullets" &&
              bi !== undefined &&
              finalData.projects[pi]
            ) {
              finalData.projects[pi].bullets[bi] =
                resumeData.projects[pi]?.bullets[bi] || "";
            }
          }
        } else if (diff.field.startsWith("skills[")) {
          const match = diff.field.match(/skills\[(\d+)\]/);
          if (match) {
            const si = parseInt(match[1]);
            if (resumeData.skills[si]) {
              finalData.skills[si] = { ...resumeData.skills[si] };
            }
          }
        } else if (diff.field.startsWith("achievements[")) {
          const match = diff.field.match(/achievements\[(\d+)\]/);
          if (match) {
            const ai = parseInt(match[1]);
            if (resumeData.achievements[ai]) {
              finalData.achievements[ai] = { ...resumeData.achievements[ai] };
            }
          }
        }
      }

      onApply(finalData);
      setAiResult(null);
      setDiffs([]);
      setJdText("");
    };

    const acceptedCount = diffs.filter((d) => d.accepted).length;
    const isConfigured =
      aiSettings.provider === "ollama" || !!aiSettings.groqApiKey;

    return (
      <div className="ai-rewrite">
        <h2 className="rewrite-title">
          <Wand2 size={18} />
          AI Resume Rewriter
        </h2>

        {!isConfigured && (
          <div className="config-warning">
            <AlertTriangle size={16} />
            <div>
              <strong>API key required</strong>
              <p>
                Switch to the Settings tab and add your Groq API key, or switch
                to Ollama (local).
              </p>
            </div>
          </div>
        )}

        <div className="jd-input-area">
          <label>Paste Job Description</label>
          <textarea
            rows={6}
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the target job description here. The AI will rewrite your resume to maximize keyword match while keeping it truthful..."
            disabled={loading}
          />
          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={loading || !jdText.trim() || !isConfigured}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="spin" />
                Generating... (10-30s)
              </>
            ) : (
              <>
                <Wand2 size={14} />
                AI Rewrite Resume
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-box">
            <AlertTriangle size={14} />
            <pre>{error}</pre>
          </div>
        )}

        {diffs.length > 0 && (
          <div className="diff-results">
            <div className="diff-header">
              <h3>
                Review Changes ({acceptedCount}/{diffs.length} accepted)
              </h3>
              <div className="diff-actions">
                <button className="btn-diff-action accept" onClick={acceptAll}>
                  <CheckCheck size={12} />
                  Accept All
                </button>
                <button className="btn-diff-action reject" onClick={rejectAll}>
                  <X size={12} />
                  Reject All
                </button>
              </div>
            </div>

            <div className="diff-list">
              {diffs.map((diff, i) => (
                <div
                  key={i}
                  className={`diff-item ${diff.accepted ? "accepted" : "rejected"}`}
                >
                  <div className="diff-item-header">
                    <span className="diff-section">{diff.section}</span>
                    <button
                      className={`diff-toggle ${diff.accepted ? "on" : "off"}`}
                      onClick={() => toggleDiff(i)}
                      title={diff.accepted ? "Reject change" : "Accept change"}
                    >
                      {diff.accepted ? <Check size={14} /> : <X size={14} />}
                    </button>
                  </div>
                  <div className="diff-content">
                    <div className="diff-old">
                      <span className="diff-label">Original</span>
                      <p>{diff.original}</p>
                    </div>
                    <ArrowRight size={16} className="diff-arrow" />
                    <div className="diff-new">
                      <span className="diff-label">AI Rewritten</span>
                      <p>{diff.rewritten}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="apply-section">
              <button className="btn-apply" onClick={handleApply}>
                <Check size={14} />
                Apply {acceptedCount} Changes to Resume
              </button>
              <button
                className="btn-discard"
                onClick={() => {
                  setAiResult(null);
                  setDiffs([]);
                }}
              >
                <RotateCcw size={14} />
                Discard All
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default AIRewrite;
