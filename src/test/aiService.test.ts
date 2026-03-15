import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { atsResultTestUtils, type ATSResult } from "../utils/aiService";

function buildResume(overrides: Partial<ResumeData> = {}): ResumeData {
  const base = createEmptyResume();
  return {
    ...base,
    contact: {
      ...base.contact,
      name: "Abhijith Candidate",
    },
    summary:
      "Full-stack engineer building real-time web applications with Node.js, React, Redis, and WebSockets.",
    projects: [
      {
        title: "Chatify",
        githubLink: "",
        liveLink: "",
        techStack: "React.js, Node.js, Express.js, WebSockets, Redis",
        bullets: [
          "Built a real-time chat platform with WebSockets and Redis caching.",
        ],
      },
    ],
    skills: [
      {
        label: "Core",
        skills: "React.js, Node.js, Express.js, WebSockets, Redis",
      },
    ],
    ...overrides,
  };
}

function buildATSResult(overrides: Partial<ATSResult> = {}): ATSResult {
  return {
    overallScore: 88,
    summaryVerdict: "Strong resume with a few gaps.",
    topSuggestions: ["Add more measurable outcomes."],
    breakdown: {
      keywordMatch: {
        score: 85,
        weight: 35,
        feedback: "Mostly aligned.",
        matchedKeywords: ["Node.js"],
        missingKeywords: ["WebSockets", "Redis"],
      },
      skillsAlignment: {
        score: 87,
        weight: 25,
        feedback: "Good skill coverage.",
        matchedSkills: ["React.js"],
        missingSkills: ["WebSockets", "TypeScript"],
      },
      experienceRelevance: {
        score: 90,
        weight: 20,
        feedback: "Relevant experience.",
      },
      formatting: {
        score: 90,
        weight: 10,
        feedback: "Formatting is solid.",
      },
      impact: {
        score: 86,
        weight: 10,
        feedback: "Some quantified impact.",
      },
    },
    ...overrides,
  };
}

describe("atsResult keyword sanitization", () => {
  it("moves resume-present keywords out of missing buckets", () => {
    const sanitized = atsResultTestUtils.sanitizeATSResultLists(
      buildATSResult(),
      buildResume(),
    );

    expect(sanitized.breakdown.keywordMatch.matchedKeywords).toContain(
      "WebSockets",
    );
    expect(sanitized.breakdown.keywordMatch.matchedKeywords).toContain("Redis");
    expect(sanitized.breakdown.keywordMatch.missingKeywords).not.toContain(
      "WebSockets",
    );
    expect(sanitized.breakdown.keywordMatch.missingKeywords).not.toContain(
      "Redis",
    );
    expect(sanitized.breakdown.skillsAlignment.matchedSkills).toContain(
      "WebSockets",
    );
    expect(sanitized.breakdown.skillsAlignment.missingSkills).not.toContain(
      "WebSockets",
    );
  });

  it("deduplicates repeated keywords across matched and missing lists", () => {
    const sanitized = atsResultTestUtils.sanitizeATSResultLists(
      buildATSResult({
        breakdown: {
          ...buildATSResult().breakdown,
          keywordMatch: {
            ...buildATSResult().breakdown.keywordMatch,
            matchedKeywords: ["Node.js", "Redis"],
            missingKeywords: ["redis", "WebSockets"],
          },
        },
      }),
      buildResume(),
    );

    expect(sanitized.breakdown.keywordMatch.matchedKeywords).toEqual([
      "Node.js",
      "Redis",
      "WebSockets",
    ]);
    expect(sanitized.breakdown.keywordMatch.missingKeywords).toEqual([]);
  });

  it("matches common formatting variants like Node JS, REST APIs, and WebSocket", () => {
    const sanitized = atsResultTestUtils.sanitizeATSResultLists(
      buildATSResult({
        breakdown: {
          ...buildATSResult().breakdown,
          keywordMatch: {
            ...buildATSResult().breakdown.keywordMatch,
            matchedKeywords: [],
            missingKeywords: ["Node JS", "REST APIs", "WebSocket"],
          },
        },
      }),
      buildResume({
        summary:
          "Engineer working with Node.js, REST API integrations, and WebSockets for real-time systems.",
      }),
    );

    expect(sanitized.breakdown.keywordMatch.matchedKeywords).toEqual([
      "Node JS",
      "REST APIs",
      "WebSocket",
    ]);
    expect(sanitized.breakdown.keywordMatch.missingKeywords).toEqual([]);
  });
});

describe("optimization step evaluation", () => {
  it("continues only when score and missing keywords both improve materially", () => {
    const before = buildATSResult({
      overallScore: 82,
      breakdown: {
        ...buildATSResult().breakdown,
        keywordMatch: {
          ...buildATSResult().breakdown.keywordMatch,
          missingKeywords: ["Redis", "WebSockets", "PM2"],
        },
        skillsAlignment: {
          ...buildATSResult().breakdown.skillsAlignment,
          missingSkills: ["TypeScript"],
        },
      },
    });

    const after = buildATSResult({
      overallScore: 86,
      breakdown: {
        ...buildATSResult().breakdown,
        keywordMatch: {
          ...buildATSResult().breakdown.keywordMatch,
          missingKeywords: ["PM2"],
        },
        skillsAlignment: {
          ...buildATSResult().breakdown.skillsAlignment,
          missingSkills: [],
        },
      },
    });

    expect(atsResultTestUtils.evaluateOptimizationStep(before, after)).toEqual({
      scoreGain: 4,
      missingKeywordImprovement: 3,
      shouldContinue: true,
    });
  });

  it("stops when keyword gaps do not improve even if the score nudges up", () => {
    const before = buildATSResult({
      overallScore: 88,
      breakdown: {
        ...buildATSResult().breakdown,
        keywordMatch: {
          ...buildATSResult().breakdown.keywordMatch,
          missingKeywords: ["Redis", "WebSockets"],
        },
        skillsAlignment: {
          ...buildATSResult().breakdown.skillsAlignment,
          missingSkills: ["TypeScript"],
        },
      },
    });

    const after = buildATSResult({
      overallScore: 90,
      breakdown: {
        ...buildATSResult().breakdown,
        keywordMatch: {
          ...buildATSResult().breakdown.keywordMatch,
          missingKeywords: ["Redis", "WebSockets"],
        },
        skillsAlignment: {
          ...buildATSResult().breakdown.skillsAlignment,
          missingSkills: ["TypeScript"],
        },
      },
    });

    expect(atsResultTestUtils.evaluateOptimizationStep(before, after)).toEqual({
      scoreGain: 2,
      missingKeywordImprovement: 0,
      shouldContinue: false,
    });
  });
});
