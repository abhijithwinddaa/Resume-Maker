import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import {
  deleteLocalResume,
  loadAllLocalResumes,
  renameLocalResume,
  saveLocalResume,
} from "../services/localResumeStore";

function resumeNamed(name: string): ResumeData {
  const resume = createEmptyResume();
  return { ...resume, contact: { ...resume.contact, name } };
}

describe("localResumeStore", () => {
  beforeEach(() => localStorage.clear());

  it("creates a resume, naming it after the candidate", async () => {
    const row = await saveLocalResume("u1", resumeNamed("Asha"));

    expect(row?.id).toBeTruthy();
    expect(row?.name).toBe("Asha Resume");
    expect(await loadAllLocalResumes("u1")).toHaveLength(1);
  });

  it("updates the resume it is given instead of adding another", async () => {
    const created = await saveLocalResume("u1", resumeNamed("Asha"));
    await saveLocalResume("u1", resumeNamed("Asha R"), { resumeId: created!.id });

    const rows = await loadAllLocalResumes("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].data.contact.name).toBe("Asha R");
  });

  it("lists the most recently saved resume first", async () => {
    await saveLocalResume("u1", resumeNamed("First"));
    await new Promise((r) => setTimeout(r, 5));
    await saveLocalResume("u1", resumeNamed("Second"));

    const rows = await loadAllLocalResumes("u1");
    expect(rows.map((r) => r.name)).toEqual(["Second Resume", "First Resume"]);
  });

  it("renames and deletes", async () => {
    const row = await saveLocalResume("u1", resumeNamed("Asha"));

    expect(await renameLocalResume(row!.id, "Backend CV")).toBe(true);
    expect((await loadAllLocalResumes("u1"))[0].name).toBe("Backend CV");

    expect(await deleteLocalResume(row!.id)).toBe(true);
    expect(await loadAllLocalResumes("u1")).toEqual([]);
  });

  it("survives corrupt storage by starting empty", async () => {
    localStorage.setItem("local-dev-resumes", "{not json");

    expect(await loadAllLocalResumes("u1")).toEqual([]);
  });
});
