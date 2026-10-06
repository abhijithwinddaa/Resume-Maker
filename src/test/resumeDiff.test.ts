import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { applyResumeChanges, diffResumes } from "../utils/resumeDiff";

function original(): ResumeData {
  const base = createEmptyResume();
  return {
    ...base,
    contact: { ...base.contact, name: "Asha" },
    summary: "Frontend engineer.",
    experience: [
      {
        company: "Brightcart",
        role: "Engineer",
        location: "Pune",
        dateRange: "2022 – Now",
        bullets: ["Worked on checkout", "Fixed bugs", "Wrote tests"],
      },
    ],
    projects: [
      {
        title: "Tracker",
        githubLink: "https://github.com/a/t",
        liveLink: "",
        techStack: "React",
        bullets: ["Made a tracker"],
      },
    ],
    skills: [{ label: "Frontend", skills: "React" }],
    achievements: [{ text: "Won a hackathon" }],
  };
}

function optimized(): ResumeData {
  const r = structuredClone(original());
  r.summary = "Frontend engineer building fast React apps.";
  r.experience[0].bullets = [
    "Built the React checkout flow",
    "Fixed bugs", // unchanged
    "Wrote Jest tests for checkout",
    "Documented the release process", // added
  ];
  r.projects[0].bullets = []; // removed "Made a tracker"
  r.projects[0].techStack = "React, Firebase";
  r.skills = [
    { label: "Frontend", skills: "React, TypeScript" },
    { label: "Testing", skills: "Jest" }, // added
  ];
  return r;
}

describe("diffResumes", () => {
  it("lists each changed piece once, and nothing that stayed the same", () => {
    const changes = diffResumes(original(), optimized());
    const ids = changes.map((c) => c.id);

    expect(ids).toEqual([
      "summary",
      "experience:0:bullet:0",
      "experience:0:bullet:2",
      "experience:0:bullet:3",
      "projects:0:bullet:0",
      "projects:0:techStack",
      "skills:0",
      "skills:1",
    ]);
    expect(ids).not.toContain("experience:0:bullet:1");
  });

  it("labels the kind of change and keeps before/after text", () => {
    const byId = Object.fromEntries(
      diffResumes(original(), optimized()).map((c) => [c.id, c]),
    );

    expect(byId["experience:0:bullet:0"]).toMatchObject({
      kind: "modified",
      before: "Worked on checkout",
      after: "Built the React checkout flow",
    });
    expect(byId["experience:0:bullet:3"]).toMatchObject({ kind: "added", before: "" });
    expect(byId["projects:0:bullet:0"]).toMatchObject({ kind: "removed", after: "" });
    expect(byId["skills:1"]).toMatchObject({ kind: "added", after: "Testing: Jest" });
  });

  it("names where each change is so the review reads naturally", () => {
    const byId = Object.fromEntries(
      diffResumes(original(), optimized()).map((c) => [c.id, c]),
    );

    expect(byId["experience:0:bullet:0"].location).toBe("Engineer — Brightcart");
    expect(byId["projects:0:techStack"].location).toBe("Tracker · tech stack");
  });

  it("finds nothing when the AI changed nothing", () => {
    expect(diffResumes(original(), original())).toEqual([]);
  });
});

describe("applyResumeChanges", () => {
  it("accepting everything gives the optimized resume", () => {
    const changes = diffResumes(original(), optimized());
    const result = applyResumeChanges(
      original(),
      optimized(),
      new Set(changes.map((c) => c.id)),
    );

    expect(result.summary).toBe(optimized().summary);
    expect(result.experience[0].bullets).toEqual(optimized().experience[0].bullets);
    expect(result.projects[0].bullets).toEqual([]);
    expect(result.skills).toEqual(optimized().skills);
  });

  it("rejecting everything leaves the original untouched", () => {
    expect(applyResumeChanges(original(), optimized(), new Set())).toEqual(original());
  });

  it("applies only the accepted changes, keeping the rest as written", () => {
    const result = applyResumeChanges(
      original(),
      optimized(),
      new Set(["experience:0:bullet:0", "skills:1"]),
    );

    expect(result.summary).toBe("Frontend engineer."); // rejected
    expect(result.experience[0].bullets).toEqual([
      "Built the React checkout flow", // accepted
      "Fixed bugs",
      "Wrote tests", // rejected rewrite
    ]); // rejected addition is not appended
    expect(result.projects[0].bullets).toEqual(["Made a tracker"]); // removal rejected
    expect(result.skills).toEqual([
      { label: "Frontend", skills: "React" },
      { label: "Testing", skills: "Jest" },
    ]);
  });

  it("does not mutate either input", () => {
    const o = original();
    const opt = optimized();
    applyResumeChanges(o, opt, new Set(["summary"]));

    expect(o).toEqual(original());
    expect(opt).toEqual(optimized());
  });

  it("never drops original entries the AI left out", () => {
    const opt = optimized();
    opt.experience = [];

    const result = applyResumeChanges(original(), opt, new Set(["summary"]));

    expect(result.experience).toEqual(original().experience);
  });
});
