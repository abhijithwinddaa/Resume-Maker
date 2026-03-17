import { describe, it, expect } from "vitest";
import { validateForExport } from "../utils/exportValidation";
import { createEmptyResume } from "../types/resume";

describe("export validation typo checks", () => {
  it("flags known high-impact technical typos", () => {
    const resume = createEmptyResume();
    resume.contact.name = "Abhijith Batturaj";
    resume.contact.email = "a@example.com";
    resume.showExperience = true;
    resume.experience = [
      {
        company: "Coding Club",
        role: "Full Stack Intern",
        location: "Remote",
        dateRange: "2024-2025",
        bullets: [
          "Built Socket.I0 based chat module",
          "Improved Ul flows using OpenAl embeddings and Grog LLM",
          "Implemented deep links for 0S/Android",
        ],
      },
    ];
    resume.education = [
      {
        university: "Amity University",
        location: "Noida",
        degree: "MCA",
        yearRange: "2023-2025",
        cgpa: "8.5",
      },
    ];
    resume.projects = [
      {
        title: "Realtime chat",
        githubLink: "",
        liveLink: "",
        techStack: "React, Node",
        bullets: ["Shipped production feature"],
      },
    ];
    resume.skills = [{ label: "Languages", skills: "JavaScript, SQL" }];

    const result = validateForExport(resume);

    expect(result.valid).toBe(false);
    expect(result.typoWarnings.length).toBeGreaterThanOrEqual(5);
    expect(result.errors.some((e) => e.includes("Potential typo(s) found"))).toBe(
      true,
    );
    expect(result.typoWarnings.join("\n")).toContain('"Socket.I0" -> "Socket.IO"');
    expect(result.typoWarnings.join("\n")).toContain('"Grog LLM" -> "Groq LLM"');
    expect(result.typoWarnings.join("\n")).toContain('"OpenAl" -> "OpenAI"');
    expect(result.typoWarnings.join("\n")).toContain('"Ul flows" -> "UI flows"');
    expect(result.typoWarnings.join("\n")).toContain('"0S/Android" -> "OS/Android"');
  });

  it("passes when required fields exist and no known typos are present", () => {
    const resume = createEmptyResume();
    resume.contact.name = "Abhijith Batturaj";
    resume.contact.email = "a@example.com";
    resume.showExperience = true;
    resume.experience = [
      {
        company: "Coding Club",
        role: "Full Stack Intern",
        location: "Remote",
        dateRange: "2024-2025",
        bullets: ["Built Socket.IO based chat module"],
      },
    ];
    resume.education = [
      {
        university: "Amity University",
        location: "Noida",
        degree: "MCA",
        yearRange: "2023-2025",
        cgpa: "8.5",
      },
    ];
    resume.projects = [
      {
        title: "Realtime chat",
        githubLink: "",
        liveLink: "",
        techStack: "React, Node",
        bullets: ["Improved UI flows and OpenAI quality checks"],
      },
    ];
    resume.skills = [{ label: "Languages", skills: "JavaScript, SQL" }];

    const result = validateForExport(resume);

    expect(result.valid).toBe(true);
    expect(result.typoWarnings).toHaveLength(0);
  });
});
