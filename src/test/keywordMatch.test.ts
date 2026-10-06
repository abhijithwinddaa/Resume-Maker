import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import {
  buildResumeSearchIndex,
  resumeContainsKeyword,
} from "../utils/keywordMatch";

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
  return { ...createEmptyResume(), ...overrides };
}

describe("resumeContainsKeyword", () => {
  it("finds keywords in what the candidate wrote, across spelling variants", () => {
    const index = buildResumeSearchIndex(
      resume({ summary: "Built REST APIs with Node.js and React.js" }),
    );

    expect(resumeContainsKeyword(index, "Node.js")).toBe(true);
    expect(resumeContainsKeyword(index, "NodeJS")).toBe(true);
    expect(resumeContainsKeyword(index, "REST API")).toBe(true);
    expect(resumeContainsKeyword(index, "Kubernetes")).toBe(false);
  });

  it("does not mistake the resume's field names for content", () => {
    // Every resume has "experience", "projects", "skills" and "summary" keys.
    const index = buildResumeSearchIndex(resume({ summary: "Frontend engineer" }));

    expect(resumeContainsKeyword(index, "Projects")).toBe(false);
    expect(resumeContainsKeyword(index, "Experience")).toBe(false);
  });
});
