import JSZip from "jszip";
import { Packer } from "docx";
import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { pruneForExport, sectionHasContent } from "../utils/exportData";
import { buildResumeDocument } from "../utils/docxExporter";
import { DEFAULT_CUSTOMIZATION } from "../types/templates";
import { calculateCompleteness, validateForExport } from "../utils/exportValidation";

function starter(): ResumeData {
  const r = createEmptyResume();
  r.contact.name = "Asha Rao";
  r.contact.email = "asha@example.com";
  return r;
}

async function docxXml(data: ResumeData): Promise<string> {
  const buffer = await Packer.toBuffer(buildResumeDocument(data, DEFAULT_CUSTOMIZATION));
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("string");
}

describe("pruneForExport", () => {
  it("leaves no content sections for a blank starter resume", () => {
    const pruned = pruneForExport(starter());
    for (const key of pruned.sectionOrder) {
      expect(sectionHasContent(pruned, key)).toBe(false);
    }
    expect(pruned.sectionOrder).toEqual(createEmptyResume().sectionOrder);
  });

  it("keeps partially filled entries and drops blank bullets", () => {
    const r = starter();
    r.experience = [
      { company: "", role: "Intern", location: "", dateRange: "", bullets: ["", "  ", "Built **it**"] },
      { company: "", role: "", location: "", dateRange: "", bullets: [""] },
    ];
    r.skills = [{ label: "Langs", skills: "" }, { label: "", skills: "" }];
    r.projects = [{ title: "", githubLink: "#", liveLink: "", techStack: "", bullets: [""] }];
    const pruned = pruneForExport(r);
    expect(pruned.experience).toHaveLength(1);
    expect(pruned.experience[0].bullets).toEqual(["Built **it**"]);
    expect(pruned.skills).toHaveLength(1);
    expect(pruned.projects).toHaveLength(0);
  });

  it("respects the visibility flags and does not mutate the input", () => {
    const r = starter();
    r.experience = [{ company: "Acme", role: "Dev", location: "", dateRange: "", bullets: ["x"] }];
    r.showExperience = false;
    const before = JSON.stringify(r);
    const pruned = pruneForExport(r);
    expect(pruned.experience).toHaveLength(0);
    expect(pruned.showExperience).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
  });

  it("makes links safe", () => {
    const r = starter();
    r.contact.linkedin = "linkedin.com/in/asha";
    r.contact.github = "javascript:alert(1)";
    expect(pruneForExport(r).contact.linkedin).toBe("https://linkedin.com/in/asha");
    expect(pruneForExport(r).contact.github).toBe("");
  });

  it("tolerates partial data", () => {
    const pruned = pruneForExport({} as ResumeData);
    expect(pruned.education).toEqual([]);
    expect(pruned.contact.name).toBe("");
  });
});

describe("DOCX builder", () => {
  it("has no section headings for a blank starter resume", async () => {
    const xml = await docxXml(starter());
    for (const heading of ["SUMMARY", "EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS", "ACHIEVEMENTS", "CERTIFICATES"]) {
      expect(xml).not.toContain(heading);
    }
    expect(xml).toContain("Asha Rao");
    expect(xml).not.toContain(" — ");
  });

  it("renders markup as runs, never as literal asterisks", async () => {
    const r = starter();
    r.projects = [
      { title: "**Realtime** chat", githubLink: "github.com/asha/chat", liveLink: "", techStack: "*React*", bullets: ["Did **a thing**"] },
    ];
    r.education = [{ university: "**IIT**", location: "", degree: "*B.Tech*", yearRange: "2020", cgpa: "" }];
    r.achievements = [{ text: "Won **hack**", githubLink: "github.com/asha/win" }];
    r.certificates = [{ name: "**AWS**", description: "Cloud", link: "" }];
    const xml = await docxXml(r);
    expect(xml).not.toContain("**");
    expect(xml).toMatch(/<w:b\/>(?:(?!<\/w:r>).)*<w:t[^>]*>Realtime<\/w:t>/s);
    expect(xml).toContain("PROJECTS");
    expect(xml).toContain("w:hyperlink");
  });

  it("sets fonts for every script", async () => {
    const xml = await docxXml(starter());
    expect(xml).toMatch(/w:eastAsia="[^"]+"/);
    expect(xml).toMatch(/w:cs="[^"]+"/);
  });
});

describe("validation on partial data", () => {
  it("does not throw", () => {
    const partial = { contact: {}, experience: [{}], projects: [{ bullets: null }] } as unknown as ResumeData;
    expect(() => validateForExport(partial)).not.toThrow();
    expect(() => validateForExport({} as ResumeData)).not.toThrow();
    expect(() => calculateCompleteness({} as ResumeData)).not.toThrow();
    expect(validateForExport({} as ResumeData).valid).toBe(false);
    expect(calculateCompleteness(partial).percentage).toBe(0);
  });
});
