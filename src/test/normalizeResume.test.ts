import { describe, it, expect } from "vitest";
import { normalizeResumeData, isSafeLink } from "../utils/normalizeResume";
import { validateResumeData } from "../utils/zodSchemas";
import { createEmptyResume } from "../types/resume";

describe("normalizeResumeData", () => {
  it.each([null, undefined, 42, "text", [], true])(
    "turns %s into a renderable resume",
    (garbage) => {
      const r = normalizeResumeData(garbage);
      expect(r.contact.name).toBe("");
      expect(r.contact.linkedin).toBe("");
      expect(Array.isArray(r.experience)).toBe(true);
      expect(Array.isArray(r.achievements)).toBe(true);
      expect(Array.isArray(r.certificates)).toBe(true);
      expect(r.sectionOrder).toEqual(createEmptyResume().sectionOrder);
      expect(typeof r.showExperience).toBe("boolean");
    },
  );

  it("defaults missing contact fields and coerces wrong types", () => {
    const r = normalizeResumeData({
      contact: { name: 5, email: null },
      summary: { not: "a string" },
      experience: [
        { company: "Acme", bullets: ["ok", 3, null, { x: 1 }, "also ok"] },
        "junk",
        null,
      ],
      projects: [{ title: "P", bullets: "not an array" }],
      skills: [{ label: "L", skills: ["a", "b", 1] }],
      achievements: ["plain string", { text: "obj" }, 7],
    });
    expect(r.contact).toEqual({
      name: "5",
      phone: "",
      email: "",
      linkedin: "",
      github: "",
      portfolio: "",
    });
    expect(r.summary).toBe("");
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0].bullets).toEqual(["ok", "also ok"]);
    expect(r.experience[0].role).toBe("");
    expect(r.projects[0].bullets).toEqual([]);
    expect(r.skills[0].skills).toBe("a, b");
    expect(r.achievements).toEqual([{ text: "plain string" }, { text: "obj" }]);
  });

  it("assigns stable unique ids and keeps existing ones", () => {
    const r = normalizeResumeData({
      education: [{ university: "A" }, { id: "keep", university: "B" }],
      experience: [{ company: "x" }, { company: "y" }],
      projects: [{ title: "p" }],
      skills: [{ label: "l" }],
    });
    expect(r.education[1].id).toBe("keep");
    const ids = [
      r.education[0].id,
      r.experience[0].id,
      r.experience[1].id,
      r.projects[0].id,
      r.skills[0].id,
    ];
    expect(ids.every((i) => typeof i === "string" && i.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps valid optional fields", () => {
    const r = normalizeResumeData({
      sectionOrder: ["skills", "summary", "bogus", "skills"],
      sectionLabels: { skills: "Tech", nope: "x" },
      meta: { template: "modern", createdAt: 1, lastModified: 2, entryPath: "B" },
      showExperience: false,
      showCertificates: true,
      volunteer: [{ organization: "O", bullets: ["b", 1] }],
    });
    expect(r.sectionOrder.slice(0, 2)).toEqual(["skills", "summary"]);
    expect(new Set(r.sectionOrder).size).toBe(7);
    expect(r.sectionLabels).toEqual({ skills: "Tech" });
    expect(r.meta?.template).toBe("modern");
    expect(r.meta?.entryPath).toBe("B");
    expect(r.showExperience).toBe(false);
    expect(r.showCertificates).toBe(true);
    expect(r.volunteer?.[0].bullets).toEqual(["b"]);
  });

  it("blanks links with dangerous schemes but keeps scheme-less hosts", () => {
    const r = normalizeResumeData({
      contact: {
        linkedin: "linkedin.com/in/x",
        github: "javascript:alert(1)",
        portfolio: "https://me.dev",
      },
      projects: [{ title: "p", githubLink: "data:text/html,x", liveLink: "" }],
    });
    expect(r.contact.linkedin).toBe("linkedin.com/in/x");
    expect(r.contact.github).toBe("");
    expect(r.contact.portfolio).toBe("https://me.dev");
    expect(r.projects[0].githubLink).toBe("");
    expect(isSafeLink("localhost:3000/x")).toBe(true);
    expect(isSafeLink("java\nscript:alert(1)")).toBe(false);
  });

  it("is idempotent for already-valid data", () => {
    const once = normalizeResumeData(createEmptyResume());
    const twice = normalizeResumeData(once);
    expect(twice).toEqual(once);
  });
});

describe("JSON import schema", () => {
  it("accepts the app's own empty starter resume", () => {
    const result = validateResumeData(createEmptyResume());
    expect(result.valid).toBe(true);
  });

  it("accepts long bullets, many bullets and empty entries", () => {
    const data = createEmptyResume();
    data.experience[0].bullets = Array.from({ length: 15 }, () => "x".repeat(900));
    data.projects[0].bullets = [""];
    data.contact.linkedin = "linkedin.com/in/someone";
    const result = validateResumeData(data);
    expect(result.valid).toBe(true);
  });

  it("round-trips optional fields through validation", () => {
    const data = {
      ...createEmptyResume(),
      sectionLabels: { skills: "Tech" },
      meta: { template: "classic", createdAt: 1, lastModified: 2, entryPath: "A" },
    };
    const result = validateResumeData(data);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const clean = normalizeResumeData(result.data);
      expect(clean.sectionLabels).toEqual({ skills: "Tech" });
      expect(clean.meta?.entryPath).toBe("A");
    }
  });

  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "vbscript:x"])(
    "rejects %s in a link field",
    (url) => {
      const data = createEmptyResume();
      data.contact.github = url;
      expect(validateResumeData(data).valid).toBe(false);
      const p = createEmptyResume();
      p.projects[0].liveLink = url;
      expect(validateResumeData(p).valid).toBe(false);
    },
  );
});
