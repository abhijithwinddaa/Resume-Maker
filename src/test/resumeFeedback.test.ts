import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { analyzeResumeFeedback } from "../utils/resumeFeedback";

function buildResume(overrides: Partial<ResumeData> = {}): ResumeData {
  const base = createEmptyResume();
  return {
    ...base,
    contact: {
      ...base.contact,
      name: "Alex Candidate",
    },
    summary:
      "Backend engineer with 4 years of experience building reliable APIs and data workflows with Node.js, PostgreSQL, and AWS.",
    experience: [
      {
        company: "Acme",
        role: "Software Engineer",
        location: "Remote",
        dateRange: "2022 - Present",
        bullets: [
          "Built 12 internal tools that reduced support tickets by 28%.",
          "Automated deployment checks and cut release rollback time by 45%.",
          "Launched a billing sync service used by 35 enterprise customers.",
        ],
      },
    ],
    projects: [
      {
        title: "Analytics Platform",
        githubLink: "",
        liveLink: "",
        techStack: "React, Node.js, PostgreSQL",
        bullets: [
          "Designed a dashboard that processed 1.2M events per day.",
          "Improved query latency by 37% using indexed materialized views.",
        ],
      },
    ],
    skills: [
      {
        label: "Core",
        skills: "Node.js, PostgreSQL, AWS, React, TypeScript, Docker",
      },
    ],
    ...overrides,
  };
}

describe("analyzeResumeFeedback", () => {
  it("detects strong metrics coverage on quantified resumes", () => {
    const insights = analyzeResumeFeedback(buildResume(), {
      matchedKeywords: ["Node.js", "AWS", "PostgreSQL"],
    });

    const metrics = insights.signals.find((signal) => signal.id === "metrics");
    expect(metrics?.status).toBe("good");
    expect(insights.suggestedEdits).not.toContain(
      "Add measurable results to more bullets, especially in experience and projects.",
    );
  });

  it("flags weak, vague, repetitive, and generic writing patterns", () => {
    const problematicResume = buildResume({
      summary:
        "Results-driven and highly motivated team player with a proven track record.",
      experience: [
        {
          company: "Acme",
          role: "Software Engineer",
          location: "Remote",
          dateRange: "2022 - Present",
          bullets: [
            "Worked on various backend tasks.",
            "Worked on multiple features as needed.",
            "Worked on bug fixes and other responsibilities.",
          ],
        },
      ],
      projects: [
        {
          title: "Internal Tool",
          githubLink: "",
          liveLink: "",
          techStack: "Node.js",
          bullets: ["Helped with dashboard improvements."],
        },
      ],
    });

    const insights = analyzeResumeFeedback(problematicResume, {
      matchedKeywords: ["Backend", "Node.js", "APIs"],
    });

    expect(
      insights.signals.find((signal) => signal.id === "weak-bullets")?.status,
    ).toBe("critical");
    expect(
      insights.signals.find((signal) => signal.id === "vague-bullets")?.status,
    ).toBe("critical");
    expect(
      insights.signals.find((signal) => signal.id === "repetition")?.status,
    ).toBe("warning");
    expect(
      insights.signals.find((signal) => signal.id === "summary")?.status,
    ).toBe("critical");
    expect(insights.suggestedEdits).toContain(
      'Replace weak openings like "worked on" with direct action verbs and concrete outcomes.',
    );
  });
});
