import { describe, expect, it } from "vitest";
import { createEmptyResume } from "../types/resume";
import {
  normalizeExtractedResumeText,
  normalizeResumeDataSpacing,
} from "../utils/resumeTextCleanup";

describe("resumeTextCleanup", () => {
  it("normalizes spacing artifacts in extracted text", () => {
    const noisy =
      "Full - Stack Engineer building scalable , production - grade apps with React . js and Node . js .\nPortfolio : https : // github . com / abhi / resume-maker";

    const cleaned = normalizeExtractedResumeText(noisy);

    expect(cleaned).toContain(
      "Full-Stack Engineer building scalable, production-grade apps with React.js and Node.js.",
    );
    expect(cleaned).toContain("Portfolio: https://github.com/abhi/resume-maker");
  });

  it("preserves sentence spacing while still fixing tech token spacing", () => {
    const noisy =
      "Built APIs with Node . js.Expertise in system design.Socket . IO used for real-time events.";

    const cleaned = normalizeExtractedResumeText(noisy);

    expect(cleaned).toContain("Built APIs with Node.js. Expertise in system design.");
    expect(cleaned).toContain("Socket.IO used for real-time events.");
  });

  it("normalizes resume fields before export", () => {
    const resume = createEmptyResume();
    resume.summary =
      "Built scalable , production - grade systems with React . js and Node . js";
    resume.experience[0].role = "Full - Stack Developer";
    resume.experience[0].bullets = [
      "Improved UI flows , resulting in 30 % higher engagement .",
    ];
    resume.projects[0].techStack = "React . js , Node . js , Socket . IO";
    resume.projects[0].githubLink = "https : // github . com / user / repo";
    resume.contact.linkedin = "https : // linkedin . com / in / person";

    const { normalized, changedFields } = normalizeResumeDataSpacing(resume);

    expect(changedFields).toBeGreaterThan(0);
    expect(normalized.summary).toBe(
      "Built scalable, production-grade systems with React.js and Node.js",
    );
    expect(normalized.experience[0].role).toBe("Full-Stack Developer");
    expect(normalized.experience[0].bullets[0]).toBe(
      "Improved UI flows, resulting in 30% higher engagement.",
    );
    expect(normalized.projects[0].techStack).toBe(
      "React.js, Node.js, Socket.IO",
    );
    expect(normalized.projects[0].githubLink).toBe(
      "https://github.com/user/repo",
    );
    expect(normalized.contact.linkedin).toBe(
      "https://linkedin.com/in/person",
    );
  });
});
