import { describe, expect, it } from "vitest";
import { createEmptyResume, type ResumeData } from "../types/resume";
import { termsIn } from "../server/groundedTerms";
import { revertInventedMetrics } from "../server/truthGuard";
import {
  filterInventedSuggestions,
  finalizeOptimizedResume,
  parseOptimizedResumeResponse,
  parseATSResultResponse,
} from "../server/aiParsing";
import { redactContactForAI, scrubContactText } from "../server/aiRedaction";
import { finalizeBullet, buildBulletMessages } from "../server/bulletRewrite";

function resume(): ResumeData {
  return {
    ...createEmptyResume(),
    contact: {
      name: "Asha Rao",
      phone: "+91 98765 43210",
      email: "asha@example.com",
      linkedin: "https://linkedin.com/in/asha",
      github: "",
      portfolio: "",
    },
    summary: "Frontend developer who builds React apps.",
    education: [
      { university: "PU", location: "Pune", degree: "BTech", yearRange: "2020-2024", cgpa: "8.7" },
    ],
    experience: [
      {
        company: "Acme",
        role: "Intern",
        location: "Pune",
        dateRange: "Jun 2024 - Aug 2024",
        bullets: ["Helped with testing of the cart", "Fixed layout bugs in the header"],
      },
      {
        company: "Beta Labs",
        role: "Developer",
        location: "Remote",
        dateRange: "2023",
        bullets: ["Wrote Node.js scripts to sync orders"],
      },
    ],
    projects: [
      {
        title: "Tracker",
        githubLink: "https://github.com/asha/tracker",
        liveLink: "https://tracker.example.com",
        techStack: "React, Firebase",
        bullets: ["Built a habit tracker with React and Firebase"],
      },
      {
        title: "Notes",
        githubLink: "",
        liveLink: "",
        techStack: "Vue",
        bullets: ["Built a notes app in Vue with offline mode"],
      },
    ],
    skills: [{ label: "Frontend", skills: "React, HTML, CSS" }],
  };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("termsIn", () => {
  it("finds tech-like tokens", () => {
    const terms = termsIn(
      "Used Jest, Node.js, C++, .NET, CI/CD, K8s and AWS with React Testing Library",
    );
    for (const t of ["jest", "node.js", "c++", ".net", "ci", "cd", "k8s", "aws", "react", "testing", "library"]) {
      expect(terms).toContain(t);
    }
  });

  it("ignores a capitalised first word and plain lowercase words", () => {
    expect(termsIn("Built the checkout page. Improved speed in March")).toEqual([]);
    expect(termsIn("Created unit tests")).toEqual([]);
  });
});

describe("grounded-terms guard", () => {
  it("reverts the Jest / React Testing Library invention", () => {
    const rewritten = clone(resume());
    rewritten.experience[0].bullets[0] =
      "Created unit tests with Jest and React Testing Library for the cart";
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.experience[0].bullets.join(" ")).not.toMatch(/Jest|Testing Library/);
    expect(result.experience[0].bullets).toContain("Helped with testing of the cart");
  });

  it("does not revert just for a capitalised first word", () => {
    const rewritten = clone(resume());
    rewritten.experience[0].bullets[1] = "Resolved layout bugs in the header";
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.experience[0].bullets[1]).toBe("Resolved layout bugs in the header");
  });

  it("drops skills and techStack items the resume never mentions", () => {
    const rewritten = clone(resume());
    rewritten.skills = [{ label: "Frontend", skills: "CSS, React, Kubernetes, HTML" }];
    rewritten.projects[0].techStack = "Firebase, React, GraphQL";
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.skills[0].skills).toBe("CSS, React, HTML");
    expect(result.projects[0].techStack).toBe("Firebase, React");
  });

  it("restores role, company, dates and project titles/links", () => {
    const rewritten = clone(resume());
    rewritten.experience[0].role = "Senior Engineer";
    rewritten.experience[0].dateRange = "2019-2024";
    rewritten.projects[0].title = "Tracker";
    rewritten.projects[0].githubLink = "";
    rewritten.projects[0].liveLink = "";
    const result = finalizeOptimizedResume(rewritten, resume());
    expect(result.experience[0]).toMatchObject({
      role: "Intern",
      company: "Acme",
      dateRange: "Jun 2024 - Aug 2024",
    });
    expect(result.projects[0]).toMatchObject({
      title: "Tracker",
      githubLink: "https://github.com/asha/tracker",
    });
  });

  it("matches reordered entries to the right original", () => {
    const rewritten = clone(resume());
    rewritten.projects.reverse();
    rewritten.projects[0].bullets = ["Built a notes app in Vue with Redux offline mode"];
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.projects[0].title).toBe("Notes");
    expect(result.projects[0].bullets).toEqual(["Built a notes app in Vue with offline mode"]);
    expect(result.projects[1].title).toBe("Tracker");
  });

  it("catches '2024 users' even though 2024 is in a date", () => {
    const rewritten = clone(resume());
    rewritten.projects[0].bullets = [
      "Built a habit tracker with React and Firebase for 2024 users",
    ];
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.projects[0].bullets[0]).toBe("Built a habit tracker with React and Firebase");
  });

  it("restores entries and bullets lost to a truncated response", () => {
    const original = resume();
    const raw = JSON.stringify({
      summary: "Frontend developer who builds React apps.",
      skills: original.skills,
      projects: [original.projects[0]],
      experience: [{ ...original.experience[0], bullets: [original.experience[0].bullets[0]] }],
    });
    const result = parseOptimizedResumeResponse(raw, original, "test");
    expect(result.projects.map((p) => p.title)).toEqual(["Tracker", "Notes"]);
    expect(result.experience.map((e) => e.company)).toEqual(["Acme", "Beta Labs"]);
    expect(result.experience[0].bullets).toEqual(original.experience[0].bullets);
  });

  it("never lets scrub placeholders reach the resume", () => {
    const original = resume();
    original.experience[1].bullets = ["Maintained the docs at https://docs.example.com/guide"];
    const redacted = redactContactForAI(original);
    expect(redacted.experience[1].bullets[0]).toContain("[link removed]");
    const result = finalizeOptimizedResume(clone(redacted), original);
    expect(JSON.stringify(result)).not.toMatch(/removed\]/);
    expect(result.experience[1].bullets[0]).toContain("https://docs.example.com/guide");
  });
});

describe("redaction", () => {
  it("blanks project, certificate and achievement links", () => {
    const r = resume();
    r.certificates = [{ name: "AWS", description: "mail me@x.com", link: "https://c.example.com" }];
    r.achievements = [{ text: "Won hackathon", githubLink: "https://github.com/x" }];
    const red = redactContactForAI(r);
    expect(red.projects.every((p) => !p.githubLink && !p.liveLink)).toBe(true);
    expect(red.certificates[0].link).toBe("");
    expect(red.certificates[0].description).not.toContain("me@x.com");
    expect(red.achievements[0].githubLink).toBe("");
    expect(r.projects[0].githubLink).not.toBe("");
  });

  it("scrubs emails, phones and URLs but not year ranges", () => {
    const text = scrubContactText(
      "Mail a@b.com, call +91 98765 43210, see https://x.dev/y, 2018-2021, 2M rows",
    );
    expect(text).not.toMatch(/a@b\.com|98765|x\.dev/);
    expect(text).toContain("2018-2021");
    expect(text).toContain("2M rows");
  });
});

describe("ATS suggestions backstop", () => {
  it("drops invented-example suggestions and keeps good ones", () => {
    const bad = [
      "Add metrics, e.g. 'reduced load time by 40%'",
      "Mention 50+ unit tests you wrote",
      "List Kubernetes even if you only touched it",
      "Add keywords to pass ATS filters",
      "You likely know Docker, so add it",
    ];
    const good = ["Add the outcome of your cart testing work", "Move Skills above Projects"];
    expect(filterInventedSuggestions([...bad, ...good])).toEqual(good);
  });

  it("applies the filter when parsing a score response", () => {
    const item = { score: 50, weight: 20, feedback: "ok" };
    const raw = JSON.stringify({
      overallScore: 50,
      summaryVerdict: "",
      topSuggestions: ['Add a result, e.g. "cut costs 30%"', "Describe what the cart tests covered"],
      breakdown: {
        keywordMatch: item,
        skillsAlignment: item,
        experienceRelevance: item,
        formatting: item,
        impact: item,
      },
    });
    const parsed = parseATSResultResponse(raw, resume(), "test");
    expect(parsed.topSuggestions.join("|")).not.toMatch(/30%/);
    expect(parsed.topSuggestions).toContain("Describe what the cart tests covered");
  });
});

describe("bullet endpoint guard", () => {
  it("rejects an enhance rewrite that adds a tool", () => {
    const out = finalizeBullet(
      "Created unit tests with Jest for the cart",
      "Helped with testing of the cart",
      null,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/tools or skills/);
  });

  it("accepts a rewrite using only the bullet's own words", () => {
    const out = finalizeBullet("Supported testing of the cart", "Helped with testing of the cart", null);
    expect(out.ok).toBe(true);
  });

  it("falls back to the template in quantify mode when a tool is invented", () => {
    const out = finalizeBullet(
      "Built Jest tests, cutting bugs by 30%",
      "Helped with testing of the cart",
      { changeType: "quality", amount: "30%" },
    );
    expect(out.ok && out.source).toBe("template");
  });

  it("keeps example numbers out of the quantify prompt", () => {
    const msgs = buildBulletMessages("Helped", undefined, { changeType: "faster", amount: "20%" });
    expect(msgs[0].content).not.toMatch(/~40%/);
  });
});

describe("role inflation guard", () => {
  const withBullets = (bullets: string[]) => {
    const r = resume();
    r.experience[0] = { ...r.experience[0], bullets };
    return r;
  };

  it("reverts a 'helped' bullet rewritten as the candidate's own work", () => {
    const rewritten = withBullets(["Implemented tests for the cart", "Fixed layout bugs in the header"]);
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.experience[0].bullets[0]).toBe("Helped with testing of the cart");
  });

  it("keeps a rewrite that still says the candidate contributed", () => {
    const rewritten = withBullets(["Contributed to testing of the cart", "Fixed layout bugs in the header"]);
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.experience[0].bullets[0]).toBe("Contributed to testing of the cart");
  });

  it("leaves bullets that never claimed a supporting role alone", () => {
    const rewritten = withBullets(["Helped with testing of the cart", "Resolved layout bugs in the header"]);
    const result = revertInventedMetrics(rewritten, resume());
    expect(result.experience[0].bullets[1]).toBe("Resolved layout bugs in the header");
  });
});
