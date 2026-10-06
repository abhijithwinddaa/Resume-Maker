import type { ResumeData } from "../types/resume";
import { calculateCompleteness } from "./exportValidation";
import {
  analyzeResumeFeedback,
  type ResumeFeedbackStatus,
} from "./resumeFeedback";
import { buildResumeSearchIndex, resumeContainsKeyword } from "./keywordMatch";

/**
 * On-device "live check" shown while editing. It runs on every keystroke, so
 * it uses no AI: completeness, the local writing checks, and — once the
 * resume has been scored against a job — how many of that job's keywords the
 * text now mentions. The AI ATS score stays the authoritative number.
 */

export interface LiveScore {
  /** 0–100. */
  score: number;
  /** The few most useful things to fix next, most impactful first. */
  issues: string[];
  /** Present only when there are job keywords to compare against. */
  keywordCoverage?: { found: number; total: number };
}

const SIGNAL_VALUE: Record<ResumeFeedbackStatus, number> = {
  good: 1,
  warning: 0.5,
  critical: 0,
};

/** Share of the score per part; keywords' share goes to writing without a job. */
const WEIGHTS_WITH_JOB = { completeness: 40, writing: 45, keywords: 15 };
const WEIGHTS_WITHOUT_JOB = { completeness: 40, writing: 60, keywords: 0 };

const MAX_ISSUES = 3;

export function computeLiveScore(
  resume: ResumeData,
  jobKeywords: string[] = [],
): LiveScore {
  const completeness = calculateCompleteness(resume);
  const { signals } = analyzeResumeFeedback(resume);

  // With no bullets, the bullet checks pass vacuously ("no weak verbs") —
  // nothing written earns no writing credit.
  const hasBullets = [...resume.experience, ...resume.projects].some((entry) =>
    entry.bullets.some((bullet) => bullet.trim()),
  );
  const writing =
    signals.reduce(
      (sum, signal) =>
        sum +
        (signal.id !== "summary" && !hasBullets ? 0 : SIGNAL_VALUE[signal.status]),
      0,
    ) / signals.length;

  const keywords = [...new Set(jobKeywords.map((k) => k.trim()).filter(Boolean))];
  const hasJob = keywords.length > 0;
  let keywordCoverage: LiveScore["keywordCoverage"];
  let keywordRatio = 0;
  if (hasJob) {
    const index = buildResumeSearchIndex(resume);
    const found = keywords.filter((k) => resumeContainsKeyword(index, k)).length;
    keywordCoverage = { found, total: keywords.length };
    keywordRatio = found / keywords.length;
  }

  const weights = hasJob ? WEIGHTS_WITH_JOB : WEIGHTS_WITHOUT_JOB;
  const score = Math.round(
    (completeness.percentage / 100) * weights.completeness +
      writing * weights.writing +
      keywordRatio * weights.keywords,
  );

  const issues = [
    ...completeness.breakdown
      .filter((item) => !item.complete)
      .sort((a, b) => b.weight - a.weight)
      .map((item) => `Add ${item.label.toLowerCase()}`),
    ...signals.filter((s) => s.status === "critical").map((s) => s.summary),
    ...signals.filter((s) => s.status === "warning").map((s) => s.summary),
    ...(keywordCoverage && keywordCoverage.found < keywordCoverage.total
      ? [
          `${keywordCoverage.total - keywordCoverage.found} job keywords aren't in your resume yet`,
        ]
      : []),
  ].slice(0, MAX_ISSUES);

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    keywordCoverage,
  };
}
