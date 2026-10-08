import { beforeEach, describe, expect, it, vi } from "vitest";

const { callServerAIMock, authMock, tooLargeMock } = vi.hoisted(() => ({
  callServerAIMock: vi.fn(),
  authMock: vi.fn(),
  tooLargeMock: vi.fn(),
}));

vi.mock("../../src/server/aiRuntime.js", () => ({
  callServerAI: callServerAIMock,
}));
vi.mock("../../src/server/requestAuth.js", () => ({
  authenticateClerkRequest: authMock,
}));
vi.mock("../../src/server/requestUtils.js", () => ({
  isRequestTooLarge: tooLargeMock,
}));

import analyze from "../../api/ats/analyze";
import rewrite from "../../api/optimize/rewrite";
import bullet from "../../api/optimize/bullet";
import keywordPlacement from "../../api/optimize/keyword-placement";
import parseResume from "../../api/parse/resume";
import detectTemplate from "../../api/detect/template";
import coverLetter from "../../api/generate/cover-letter";
import { INVENTED_NUMBER_ERROR } from "../server/bulletRewrite";
import { createEmptyResume } from "../types/resume";

type Handler = (req: Request) => Promise<Response | void>;

let userCounter = 0;

const resume = {
  ...createEmptyResume(),
  contact: {
    name: "Asha Rao",
    phone: "",
    email: "",
    linkedin: "",
    github: "",
    portfolio: "",
  },
  summary: "Developer.",
};

const item = { score: 50, feedback: "ok", missingKeywords: [], missingSkills: [] };
const atsResult = {
  overallScore: 60,
  breakdown: {
    keywordMatch: item,
    skillsAlignment: item,
    experienceRelevance: item,
    formatting: item,
    impact: item,
  },
  topSuggestions: ["a"],
  summaryVerdict: "ok",
};

const longText = "x".repeat(100) + " resume text ".repeat(20);

function req(url: string, body: unknown, raw = false): Request {
  return new Request(`http://localhost/api/${url}`, {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function call(handler: Handler, request: Request) {
  const res = (await handler(request)) as Response;
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as { error?: string } };
}

interface Route {
  name: string;
  url: string;
  handler: Handler;
  /** A valid body for the route. */
  valid: Record<string, unknown>;
  /** A field that must be a string, with its non-string replacement. */
  stringField: string;
  /** Optional field subject to the job description cap. */
  jdField?: string;
}

const routes: Route[] = [
  {
    name: "analyze",
    url: "ats/analyze",
    handler: analyze,
    valid: { resumeData: resume, mode: "jd", jobDescription: "Build things." },
    stringField: "jobDescription",
    jdField: "jobDescription",
  },
  {
    name: "rewrite",
    url: "optimize/rewrite",
    handler: rewrite,
    valid: {
      resumeData: resume,
      atsResult,
      mode: "jd",
      iteration: 1,
      jobDescription: "Build things.",
    },
    stringField: "jobDescription",
    jdField: "jobDescription",
  },
  {
    name: "bullet",
    url: "optimize/bullet",
    handler: bullet,
    valid: { bulletText: "Built a thing", jobDescription: "Build things." },
    stringField: "bulletText",
    jdField: "jobDescription",
  },
  {
    name: "keyword-placement",
    url: "optimize/keyword-placement",
    handler: keywordPlacement,
    valid: {
      resumeData: resume,
      missingKeywords: ["Docker"],
      jobDescription: "Build things.",
    },
    stringField: "jobDescription",
    jdField: "jobDescription",
  },
  {
    name: "parse",
    url: "parse/resume",
    handler: parseResume,
    valid: { resumeText: longText },
    stringField: "resumeText",
  },
  {
    name: "detect",
    url: "detect/template",
    handler: detectTemplate,
    valid: { resumeText: longText },
    stringField: "resumeText",
  },
  {
    name: "cover-letter",
    url: "generate/cover-letter",
    handler: coverLetter,
    valid: {
      resumeText: "Asha, developer",
      jobDescription: "Build things.",
      companyName: "Globex",
      position: "Engineer",
    },
    stringField: "companyName",
    jdField: "jobDescription",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  tooLargeMock.mockReturnValue(false);
  userCounter += 1;
  authMock.mockResolvedValue({
    ok: true,
    user: { userId: `route_validation_user_${userCounter}` },
  });
});

describe.each(routes)("$name route validation", (route) => {
  it("answers a null body with 400", async () => {
    const r = await call(route.handler, req(route.url, "null", true));
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("answers an array body with 400", async () => {
    const r = await call(route.handler, req(route.url, [1, 2]));
    expect(r.status).toBe(400);
  });

  it("answers malformed JSON with 400", async () => {
    const r = await call(route.handler, req(route.url, "{nope", true));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Invalid JSON request body.");
  });

  it("answers a non-string field with 400", async () => {
    const r = await call(
      route.handler,
      req(route.url, { ...route.valid, [route.stringField]: 123 }),
    );
    expect(r.status).toBe(400);
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("rejects a body over the byte limit even without Content-Length", async () => {
    const huge = { ...route.valid, padding: "x".repeat(900_000) };
    const r = await call(route.handler, req(route.url, huge));
    expect(r.status).toBe(413);
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("does not leak internal error details", async () => {
    callServerAIMock.mockRejectedValue(new Error("secret db detail"));
    const r = await call(route.handler, req(route.url, route.valid));
    if (route.name === "detect") {
      // Detect deliberately falls back to a default style.
      expect(r.status).toBe(200);
    } else {
      expect(r.status).toBe(500);
      expect(r.body.error).toBeTruthy();
    }
    expect(r.text).not.toContain("secret db detail");
  });

  it("passes the AI-unavailable message through", async () => {
    const err = new Error(
      "The AI service is busy right now. Please try again in a minute.",
    );
    err.name = "AIUnavailableError";
    callServerAIMock.mockRejectedValue(err);
    const r = await call(route.handler, req(route.url, route.valid));
    if (route.name === "detect") {
      expect(r.status).toBe(200);
      return;
    }
    expect(r.body.error).toBe(err.message);
  });

  if (route.jdField) {
    it("rejects an over-long job description without calling the AI", async () => {
      const r = await call(
        route.handler,
        req(route.url, { ...route.valid, [route.jdField!]: "j".repeat(12_001) }),
      );
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(r.body.error).toContain("Job description is too long");
      expect(r.body.error).toContain("12,000");
      expect(callServerAIMock).not.toHaveBeenCalled();
    });
  }
});

describe("resume-shaped routes", () => {
  it.each(["analyze", "rewrite", "keyword-placement"])(
    "%s rejects malformed resumeData with 400",
    async (name) => {
      const route = routes.find((r) => r.name === name)!;
      for (const resumeData of [{}, "text", [], { contact: "x" }, null]) {
        const r = await call(
          route.handler,
          req(route.url, { ...route.valid, resumeData }),
        );
        expect(r.status).toBe(400);
      }
      expect(callServerAIMock).not.toHaveBeenCalled();
    },
  );

  it("analyze self mode with an empty resumeData object is a 400, not a crash", async () => {
    const r = await call(analyze, req("ats/analyze", { mode: "self", resumeData: {} }));
    expect(r.status).toBe(400);
  });

  it("analyze tolerates a resume missing optional arrays", async () => {
    callServerAIMock.mockResolvedValue("not json");
    const r = await call(
      analyze,
      req("ats/analyze", {
        mode: "self",
        resumeData: { contact: { name: "A" } },
      }),
    );
    // Reaches the AI (and fails on its output) instead of crashing validation.
    expect(callServerAIMock).toHaveBeenCalled();
    expect(r.status).toBe(500);
  });

  it("rewrite rejects a malformed atsResult", async () => {
    const r = await call(
      rewrite,
      req("optimize/rewrite", { ...routes[1].valid, atsResult: { x: 1 } }),
    );
    expect(r.status).toBe(400);
  });

  it("keyword-placement rejects bad missingKeywords", async () => {
    const base = routes[3].valid;
    for (const missingKeywords of [
      "Docker",
      [1, 2],
      Array.from({ length: 101 }, (_, i) => `k${i}`),
      ["k".repeat(61)],
      [],
    ]) {
      const r = await call(
        keywordPlacement,
        req("optimize/keyword-placement", { ...base, missingKeywords }),
      );
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("rejects a resume over the serialized size cap", async () => {
    const big = {
      ...resume,
      summary: "s".repeat(61_000),
    };
    const r = await call(
      analyze,
      req("ats/analyze", { mode: "self", resumeData: big }),
    );
    expect(r.status).toBe(413);
    expect(callServerAIMock).not.toHaveBeenCalled();
  });
});

describe("bullet route", () => {
  it("rejects an over-long bullet without calling the AI", async () => {
    const r = await call(
      bullet,
      req("optimize/bullet", { bulletText: "b".repeat(1_001) }),
    );
    expect(r.status).toBe(413);
    expect(r.body.error).toContain("too long");
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("keeps the 422 invented-number message", async () => {
    callServerAIMock.mockResolvedValue(
      JSON.stringify({ optimizedText: "Cut latency by 73% across services" }),
    );
    const r = await call(
      bullet,
      req("optimize/bullet", { bulletText: "Improved latency" }),
    );
    expect(r.status).toBe(422);
    expect(r.body.error).toBe(INVENTED_NUMBER_ERROR);
  });
});

describe("parse and detect caps", () => {
  it.each(["parse", "detect"])("%s rejects resume text over 30,000 chars", async (name) => {
    const route = routes.find((r) => r.name === name)!;
    const r = await call(
      route.handler,
      req(route.url, { resumeText: "r".repeat(30_001) }),
    );
    expect(r.status).toBe(400);
    expect(callServerAIMock).not.toHaveBeenCalled();
  });

  it("parse keeps the no-content message", async () => {
    callServerAIMock.mockResolvedValue("{}");
    const r = await call(parseResume, req("parse/resume", { resumeText: longText }));
    expect(r.body.error).toContain("Could not find any resume content");
  });
});
