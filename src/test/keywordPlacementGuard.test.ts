import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { validateKeywordSuggestions } from "../../api/optimize/keyword-placement";

const resume: ResumeData = {
  ...createEmptyResume(),
  experience: [
    {
      company: "Acme",
      role: "Dev",
      location: "",
      dateRange: "2023",
      bullets: ["Built REST APIs serving 2M requests per day", "Deployed services with Docker"],
    },
  ],
  projects: [
    {
      title: "Tracker",
      githubLink: "",
      liveLink: "",
      techStack: "React",
      bullets: ["Built a habit tracker in React"],
    },
  ],
  skills: [{ label: "Tools", skills: "Docker, Kubernetes" }],
};

const base = {
  section: "experience",
  index: 0,
  editType: "rewrite",
  bulletIndex: 1,
  originalText: "Deployed services with Docker",
  suggestedText: "Containerised and deployed services with Docker",
  keyword: "Docker",
  reason: "r",
};

const run = (s: unknown[]) => validateKeywordSuggestions({ Docker: s }, resume).Docker;

describe("validateKeywordSuggestions", () => {
  it("keeps a valid suggestion", () => {
    expect(run([base])).toHaveLength(1);
  });

  it("drops out-of-bounds and bad sections", () => {
    expect(run([{ ...base, index: 5 }])).toHaveLength(0);
    expect(run([{ ...base, bulletIndex: 9 }])).toHaveLength(0);
    expect(run([{ ...base, section: "skills" }])).toHaveLength(0);
  });

  it("drops a rewrite whose originalText is not the current bullet", () => {
    expect(run([{ ...base, originalText: "Something else" }])).toHaveLength(0);
  });

  it("drops ungrounded numbers", () => {
    expect(run([{ ...base, suggestedText: "Deployed services with Docker for 50 teams" }])).toHaveLength(0);
  });

  it("drops an ungrounded tool", () => {
    expect(
      run([{ ...base, suggestedText: "Deployed services with Docker and Jenkins" }]),
    ).toHaveLength(0);
  });

  it("allows the keyword only where the entry already shows it", () => {
    const k = {
      ...base,
      keyword: "Kubernetes",
      suggestedText: "Deployed services with Docker on Kubernetes",
    };
    // Kubernetes appears only in skills, not in this entry.
    expect(validateKeywordSuggestions({ Kubernetes: [k] }, resume).Kubernetes).toHaveLength(0);
    const ok = { ...base, keyword: "docker", suggestedText: "Deployed containerised Docker services" };
    expect(validateKeywordSuggestions({ docker: [ok] }, resume).docker).toHaveLength(1);
  });
});
