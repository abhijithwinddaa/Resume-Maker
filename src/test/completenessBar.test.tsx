import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CompletenessBar from "../components/CompletenessBar";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { calculateCompleteness } from "../utils/exportValidation";

describe("CompletenessBar", () => {
  it("lists only the sections still missing", () => {
    const resume: ResumeData = {
      ...createEmptyResume(),
      contact: { ...createEmptyResume().contact, name: "Asha", email: "a@b.co" },
      summary: "Engineer.",
    };
    const { breakdown } = calculateCompleteness(resume);
    const missing = breakdown.filter((b) => !b.complete).map((b) => b.label);
    const done = breakdown.filter((b) => b.complete).map((b) => b.label);

    render(<CompletenessBar data={resume} />);

    for (const label of missing) expect(screen.getByText(label)).toBeInTheDocument();
    for (const label of done) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("collapses to a single line once everything is filled in", () => {
    const resume = createEmptyResume();
    const full: ResumeData = {
      ...resume,
      contact: {
        ...resume.contact,
        name: "Asha",
        email: "a@b.co",
        phone: "1",
        linkedin: "https://linkedin.com/in/a",
      },
      summary: "Engineer.",
      experience: [{ company: "A", role: "B", location: "", dateRange: "2020", bullets: ["Did x"] }],
      education: [{ university: "U", location: "", degree: "BSc", yearRange: "2019", cgpa: "" }],
      skills: [{ label: "Lang", skills: "TS" }],
      projects: [{ title: "P", githubLink: "", liveLink: "", techStack: "", bullets: ["Built y"] }],
    };
    expect(calculateCompleteness(full).percentage).toBe(100);

    render(<CompletenessBar data={full} />);

    expect(screen.getByText(/all sections complete/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
