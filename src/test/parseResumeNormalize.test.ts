import { describe, expect, it } from "vitest";
import { normalizeParsedResume } from "../../api/parse/resume";
import type { ResumeData } from "../types/resume";

function parsed(overrides: Partial<ResumeData>): ResumeData {
  return {
    contact: {
      name: "",
      phone: "+91 81065 78716",
      email: "someone@example.com",
      linkedin: "",
      github: "",
      portfolio: "",
    },
    summary: "",
    education: [],
    experience: [],
    showExperience: true,
    projects: [],
    skills: [],
    achievements: [],
    certificates: [],
    showCertificates: false,
    sectionOrder: [],
    ...overrides,
  };
}

describe("normalizeParsedResume", () => {
  it("keeps a resume whose text had no name line, leaving the name to fill in", () => {
    // PDFs often render the name as an image or decorative text that text
    // extraction skips, so the text starts at the phone/email line.
    const result = normalizeParsedResume(
      parsed({
        summary: "Network Security Engineer with Palo Alto NGFW experience.",
        skills: [{ label: "Security", skills: "Palo Alto, Panorama, VPN" }],
      }),
    );

    expect(result.contact.name).toBe("");
    expect(result.contact.email).toBe("someone@example.com");
    expect(result.skills).toHaveLength(1);
  });

  it("still rejects a parse that found no resume content at all", () => {
    expect(() =>
      normalizeParsedResume(
        parsed({ contact: { ...parsed({}).contact, phone: "", email: "" } }),
      ),
    ).toThrow(/could not find any resume content/i);
  });
});
