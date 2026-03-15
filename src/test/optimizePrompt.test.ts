import { describe, expect, it } from "vitest";
import { createEmptyResume } from "../types/resume";
import type { ATSResult } from "../utils/aiService";
import { buildOptimizePrompt } from "../utils/optimizePrompt";
import { buildSelfOptimizePrompt } from "../utils/selfOptimizePrompt";

function buildATSResult(): ATSResult {
  return {
    overallScore: 84,
    summaryVerdict: "Solid foundation with keyword and impact gaps.",
    topSuggestions: [
      'Replace weak openings like "worked on" with direct action verbs and concrete outcomes.',
      "Add measurable results to more bullets, especially in experience and projects.",
    ],
    breakdown: {
      keywordMatch: {
        score: 80,
        weight: 35,
        feedback: "Keyword coverage needs work.",
        matchedKeywords: ["Node.js", "React"],
        missingKeywords: ["WebSockets", "Redis"],
      },
      skillsAlignment: {
        score: 82,
        weight: 25,
        feedback: "Skills are relevant but incomplete.",
        matchedSkills: ["TypeScript"],
        missingSkills: ["REST APIs"],
      },
      experienceRelevance: {
        score: 87,
        weight: 20,
        feedback: "Experience is relevant.",
      },
      formatting: {
        score: 90,
        weight: 10,
        feedback: "Formatting is ATS-safe.",
      },
      impact: {
        score: 76,
        weight: 10,
        feedback: "Impact could be stronger.",
      },
    },
    qualityInsights: {
      suggestedEdits: [
        "Add measurable results to more bullets, especially in experience and projects.",
      ],
      signals: [
        {
          id: "weak-bullets",
          title: "Bullet Openings",
          status: "critical",
          summary: '3 bullets open with weak phrases like "worked on".',
          details: ["Experience: Worked on API fixes and bug triage."],
        },
        {
          id: "metrics",
          title: "Metrics Coverage",
          status: "warning",
          summary: "2 of 7 bullets include measurable evidence.",
          details: ["Add percentages or counts where truthful."],
        },
      ],
    },
  };
}

describe("optimize prompts", () => {
  it("includes the stronger writing contract for JD optimization", () => {
    const prompt = buildOptimizePrompt(
      createEmptyResume(),
      "Backend engineer with WebSockets and Redis experience.",
      buildATSResult(),
      1,
    );

    expect(prompt).toContain("WRITING CONTRACT");
    expect(prompt).toContain("strong action verb -> what changed -> tool/context -> measurable outcome");
    expect(prompt).toContain("worked on");
    expect(prompt).toContain("results-driven");
    expect(prompt).toContain("LOCAL QUALITY SIGNALS");
    expect(prompt).toContain("Prefer natural keyword placement");
  });

  it("keeps the same constraints for self optimization without JD language", () => {
    const prompt = buildSelfOptimizePrompt(
      createEmptyResume(),
      buildATSResult(),
      1,
    );

    expect(prompt).toContain("There is NO specific job description");
    expect(prompt).toContain("WRITING CONTRACT");
    expect(prompt).toContain("LOCAL QUALITY SIGNALS");
    expect(prompt).toContain("Keep it truthful");
    expect(prompt).toContain("worked on");
  });
});
