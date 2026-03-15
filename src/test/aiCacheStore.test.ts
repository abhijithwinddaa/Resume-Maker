import { describe, expect, it } from "vitest";
import { createEmptyResume } from "../types/resume";
import type { ATSResult } from "../utils/aiService";
import {
  buildAnalyzeCacheKey,
  buildRewriteCacheKey,
  isCacheExpired,
} from "../server/aiCacheStore";

function buildATSResult(): ATSResult {
  return {
    overallScore: 91,
    summaryVerdict: "Strong match.",
    topSuggestions: ["Add one more measurable outcome."],
    breakdown: {
      keywordMatch: {
        score: 90,
        weight: 35,
        feedback: "High alignment.",
        matchedKeywords: ["Node.js"],
        missingKeywords: ["Redis"],
      },
      skillsAlignment: {
        score: 92,
        weight: 25,
        feedback: "Strong fit.",
        matchedSkills: ["TypeScript"],
        missingSkills: [],
      },
      experienceRelevance: {
        score: 90,
        weight: 20,
        feedback: "Relevant experience.",
      },
      formatting: {
        score: 95,
        weight: 10,
        feedback: "Formatting is strong.",
      },
      impact: {
        score: 88,
        weight: 10,
        feedback: "Good impact evidence.",
      },
    },
  };
}

describe("server AI cache helpers", () => {
  it("builds stable analyze cache keys for identical inputs", () => {
    const resume = createEmptyResume();
    const first = buildAnalyzeCacheKey("jd", resume, "Full-stack engineer");
    const second = buildAnalyzeCacheKey("jd", resume, "Full-stack engineer");

    expect(first).toBe(second);
    expect(first.startsWith("analyze:v1:jd:")).toBe(true);
  });

  it("changes rewrite cache keys when iteration or ATS payload changes", () => {
    const resume = createEmptyResume();
    const ats = buildATSResult();
    const first = buildRewriteCacheKey(
      "jd",
      resume,
      "Full-stack engineer",
      ats,
      1,
      "v2",
    );
    const second = buildRewriteCacheKey(
      "jd",
      resume,
      "Full-stack engineer",
      ats,
      2,
      "v2",
    );

    expect(first).not.toBe(second);
    expect(first.startsWith("rewrite:v1:jd:")).toBe(true);
  });

  it("treats past timestamps as expired", () => {
    const now = Date.now();
    expect(isCacheExpired(new Date(now - 1000).toISOString(), now)).toBe(true);
    expect(isCacheExpired(new Date(now + 1000).toISOString(), now)).toBe(
      false,
    );
  });
});
