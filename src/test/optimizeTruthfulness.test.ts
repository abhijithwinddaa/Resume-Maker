import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import type { ATSResult } from "../utils/aiService";
import { buildOptimizePrompt } from "../utils/optimizePrompt";
import { buildSelfOptimizePrompt } from "../utils/selfOptimizePrompt";
import { finalizeOptimizedResume } from "../server/aiParsing";
import { redactContactForAI } from "../server/aiRedaction";

function atsResult(): ATSResult {
  const item = { score: 60, weight: 20, feedback: "ok" };
  return {
    overallScore: 60,
    summaryVerdict: "",
    topSuggestions: [],
    breakdown: {
      keywordMatch: { ...item, missingKeywords: ["Kubernetes", "Kafka"] },
      skillsAlignment: { ...item, missingSkills: ["GraphQL"] },
      experienceRelevance: item,
      formatting: item,
      impact: item,
    },
  };
}

function resume(): ResumeData {
  return {
    ...createEmptyResume(),
    contact: {
      name: "Asha Rao",
      phone: "+91 98765 43210",
      email: "asha@example.com",
      linkedin: "https://linkedin.com/in/asha",
      github: "https://github.com/asha",
      portfolio: "https://asha.dev",
    },
    summary: "Engineer with 3 years of Node.js experience.",
    experience: [
      {
        company: "Acme",
        role: "Engineer",
        location: "Pune",
        dateRange: "2021-Present",
        bullets: [
          "Built REST APIs serving 2M requests/day",
          "Migrated services to Docker",
        ],
      },
    ],
    projects: [
      {
        title: "Tracker",
        githubLink: "",
        liveLink: "",
        techStack: "React",
        bullets: ["Made a habit tracker used by 40 friends"],
      },
    ],
  };
}

describe("optimize prompts stay truthful", () => {
  const prompts = [
    buildOptimizePrompt(resume(), "Needs Kubernetes and Kafka.", atsResult(), 1),
    buildSelfOptimizePrompt(resume(), atsResult(), 1),
  ];

  it("no longer orders every missing keyword into the resume", () => {
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/MUST appear/i);
      expect(prompt).not.toMatch(/#1 priority/i);
      expect(prompt).not.toMatch(/MUST ADD THESE/);
    }
  });

  it("only allows a missing keyword where the resume already shows evidence", () => {
    for (const prompt of prompts) {
      expect(prompt).toMatch(/only where the existing resume already shows evidence/i);
      expect(prompt).toMatch(/leave it out/i);
    }
  });

  it("forbids numbers that are not already in the resume", () => {
    for (const prompt of prompts) {
      expect(prompt).toMatch(/never introduce a number/i);
    }
  });
});

describe("finalizeOptimizedResume guards against invented metrics", () => {
  it("reverts a bullet that gains a metric the resume never stated", () => {
    const rewritten = resume();
    rewritten.experience[0].bullets[1] =
      "Migrated services to Docker, reducing infrastructure costs by 20%";

    const result = finalizeOptimizedResume(rewritten, resume());

    expect(result.experience[0].bullets[1]).toBe("Migrated services to Docker");
  });

  it("keeps a rewording whose numbers all come from the original", () => {
    const rewritten = resume();
    rewritten.experience[0].bullets[0] =
      "Engineered Node.js REST APIs handling 2M requests/day";

    const result = finalizeOptimizedResume(rewritten, resume());

    expect(result.experience[0].bullets[0]).toBe(
      "Engineered Node.js REST APIs handling 2M requests/day",
    );
  });

  it("drops an extra bullet built on an invented metric", () => {
    const rewritten = resume();
    rewritten.projects[0].bullets.push("Cut page load time by 65% with caching");

    const result = finalizeOptimizedResume(rewritten, resume());

    expect(result.projects[0].bullets).toEqual([
      "Made a habit tracker used by 40 friends",
    ]);
  });

  it("restores the summary when it inflates years of experience", () => {
    const rewritten = resume();
    rewritten.summary = "Senior engineer with 6+ years of Node.js experience.";

    const result = finalizeOptimizedResume(rewritten, resume());

    expect(result.summary).toBe("Engineer with 3 years of Node.js experience.");
  });

  it("keeps an extra bullet with no numbers in it", () => {
    const rewritten = resume();
    rewritten.experience[0].bullets.push("Documented the deployment runbook");

    const result = finalizeOptimizedResume(rewritten, resume());

    expect(result.experience[0].bullets).toContain(
      "Documented the deployment runbook",
    );
  });
});

describe("redactContactForAI", () => {
  it("blanks every contact field without touching the original", () => {
    const original = resume();
    const redacted = redactContactForAI(original);

    expect(Object.values(redacted.contact).every((v) => v === "")).toBe(true);
    expect(original.contact.email).toBe("asha@example.com");
    expect(redacted.experience).toEqual(original.experience);
  });

  it("gets the real contact details back after a rewrite", () => {
    const original = resume();
    const fromAI = redactContactForAI(original);

    const result = finalizeOptimizedResume(fromAI, original);

    expect(result.contact).toEqual(original.contact);
  });
});
