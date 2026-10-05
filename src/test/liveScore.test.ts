import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { computeLiveScore } from "../utils/liveScore";

function strongResume(): ResumeData {
  const base = createEmptyResume();
  return {
    ...base,
    contact: {
      ...base.contact,
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "+91 90000 12345",
      linkedin: "https://linkedin.com/in/asha",
    },
    summary:
      "Frontend engineer with 3 years building React and TypeScript products, focused on performance and accessibility for e-commerce teams.",
    experience: [
      {
        company: "Brightcart",
        role: "Software Engineer",
        location: "Bengaluru",
        dateRange: "2022 – Present",
        bullets: [
          "Built a React checkout flow used by 30k monthly shoppers",
          "Cut bundle size 35% by code splitting and lazy loading routes",
          "Led migration of 40 components to TypeScript with zero regressions",
        ],
      },
    ],
    education: [
      { university: "VIT", location: "Vellore", degree: "B.Tech CS", yearRange: "2018 – 2022", cgpa: "8.6" },
    ],
    skills: [{ label: "Frontend", skills: "React, TypeScript, Next.js" }],
    projects: [
      {
        title: "Habit Tracker",
        githubLink: "",
        liveLink: "",
        techStack: "React, Firebase",
        bullets: ["Shipped an offline-first PWA used by 200 people daily"],
      },
    ],
  };
}

describe("computeLiveScore", () => {
  it("scores an empty resume low and says what to add first", () => {
    const live = computeLiveScore(createEmptyResume());

    expect(live.score).toBeLessThan(25);
    expect(live.issues.length).toBeGreaterThan(0);
    expect(live.issues.length).toBeLessThanOrEqual(3);
  });

  it("scores a complete, well-written resume high", () => {
    expect(computeLiveScore(strongResume()).score).toBeGreaterThanOrEqual(80);
  });

  it("rises when a weak bullet is rewritten with an action verb and a result", () => {
    const weak = strongResume();
    weak.experience[0].bullets = [
      "Worked on the checkout page",
      "Responsible for bug fixes",
      "Helped with components",
    ];

    const before = computeLiveScore(weak).score;
    const after = computeLiveScore(strongResume()).score;

    expect(after).toBeGreaterThan(before);
  });

  it("counts job keywords the resume now mentions", () => {
    const resume = strongResume();
    const keywords = ["React", "GraphQL", "Jest"];

    const before = computeLiveScore(resume, keywords);
    resume.skills[0].skills += ", GraphQL";
    const after = computeLiveScore(resume, keywords);

    expect(before.keywordCoverage).toEqual({ found: 1, total: 3 });
    expect(after.keywordCoverage).toEqual({ found: 2, total: 3 });
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("leaves keywords out of the score when there is no job to compare against", () => {
    const live = computeLiveScore(strongResume());

    expect(live.keywordCoverage).toBeUndefined();
  });

  it("is a whole number between 0 and 100", () => {
    for (const resume of [createEmptyResume(), strongResume()]) {
      const { score } = computeLiveScore(resume);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
