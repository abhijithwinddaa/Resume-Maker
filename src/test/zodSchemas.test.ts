import { describe, it, expect } from "vitest";
import { validateResumeData } from "../utils/zodSchemas";

const validResumeData = {
  contact: {
    name: "John Doe",
    phone: "+1234567890",
    email: "john@example.com",
    linkedin: "https://linkedin.com/in/johndoe",
    github: "https://github.com/johndoe",
    portfolio: "",
  },
  summary:
    "Experienced software engineer with 5+ years in full-stack development.",
  education: [
    {
      university: "MIT",
      location: "Cambridge, MA",
      degree: "B.S. Computer Science",
      yearRange: "2015-2019",
      cgpa: "3.8/4.0",
    },
  ],
  experience: [
    {
      company: "Google",
      role: "Software Engineer",
      location: "Mountain View, CA",
      dateRange: "Jan 2020 - Present",
      bullets: ["Built microservices handling 1M+ requests/day"],
    },
  ],
  showExperience: true,
  projects: [
    {
      title: "Resume Maker",
      githubLink: "https://github.com/johndoe/resume-maker",
      liveLink: "",
      techStack: "React, TypeScript, Vite",
      bullets: ["AI-powered resume optimization"],
    },
  ],
  skills: [{ label: "Languages", skills: "TypeScript, Python, Go" }],
  achievements: [{ text: "Won Google Hackathon 2023" }],
  certificates: [
    { name: "AWS Certified", description: "Solutions Architect", link: "" },
  ],
  showCertificates: true,
  sectionOrder: [
    "summary",
    "education",
    "experience",
    "projects",
    "skills",
    "achievements",
    "certificates",
  ],
};

describe("validateResumeData", () => {
  it("should accept valid resume data", () => {
    const result = validateResumeData(validResumeData);
    expect(result.valid).toBe(true);
  });

  it("should reject empty object", () => {
    const result = validateResumeData({});
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("should reject null", () => {
    const result = validateResumeData(null);
    expect(result.valid).toBe(false);
  });

  it("should reject resume with missing name", () => {
    const data = {
      ...validResumeData,
      contact: { ...validResumeData.contact, name: "" },
    };
    const result = validateResumeData(data);
    expect(result.valid).toBe(false);
  });

  it("should reject resume with invalid email", () => {
    const data = {
      ...validResumeData,
      contact: { ...validResumeData.contact, email: "not-an-email" },
    };
    const result = validateResumeData(data);
    expect(result.valid).toBe(false);
  });

  it("should accept resume with empty optional fields", () => {
    const data = {
      ...validResumeData,
      contact: {
        ...validResumeData.contact,
        linkedin: "",
        github: "",
        portfolio: "",
      },
      achievements: [],
      certificates: [],
      showExperience: false,
      showCertificates: false,
    };
    const result = validateResumeData(data);
    expect(result.valid).toBe(true);
  });

  it("should reject invalid section order values", () => {
    const data = {
      ...validResumeData,
      sectionOrder: ["invalid_section"],
    };
    const result = validateResumeData(data);
    expect(result.valid).toBe(false);
  });
});
