import { beforeEach, describe, expect, it, vi } from "vitest";

const { callServerAIMock, authenticateClerkRequestMock, isRequestTooLargeMock } = vi.hoisted(() => ({
  callServerAIMock: vi.fn(),
  authenticateClerkRequestMock: vi.fn(),
  isRequestTooLargeMock: vi.fn(),
}));

vi.mock("../../src/server/aiRuntime.js", () => ({
  callServerAI: callServerAIMock,
}));

vi.mock("../../src/server/requestAuth.js", () => ({
  authenticateClerkRequest: authenticateClerkRequestMock,
}));

vi.mock("../../src/server/requestUtils.js", () => ({
  isRequestTooLarge: isRequestTooLargeMock,
}));

import handler from "../../api/optimize/bullet";

const post = (body: unknown) =>
  new Request("http://localhost/api/optimize/bullet", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("api/optimize/bullet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isRequestTooLargeMock.mockReturnValue(false);
    authenticateClerkRequestMock.mockResolvedValue({ ok: true, user: { userId: "user_123" } });
  });

  it("returns 405 for non-POST requests", async () => {
    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "GET",
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toContain("Method not allowed");
  });

  it("returns 413 when request is too large", async () => {
    isRequestTooLargeMock.mockReturnValue(true);
    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({ bulletText: "a".repeat(150000) }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toContain("Request body too large");
  });

  it("returns authentication error when Clerk auth fails", async () => {
    authenticateClerkRequestMock.mockResolvedValue({
      ok: false,
      status: 401,
      message: "Invalid token",
    });

    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({ bulletText: "Some text" }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns 400 when bulletText is missing or empty", async () => {
    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({ bulletText: "  " }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("bulletText is required.");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: "not-a-json",
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON request body.");
  });

  it("returns optimized bullet text from callServerAI", async () => {
    callServerAIMock.mockResolvedValue(' "Led team of 5 to deliver software on time." ');

    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({ bulletText: "helped a team of 5 with coding" }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.optimizedText).toBe("Led team of 5 to deliver software on time.");

    expect(callServerAIMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining('Original Bullet Point: "helped a team of 5 with coding"'),
        }),
      ]),
      expect.any(AbortSignal),
      // A single bullet needs a small budget; an oversized one gets the whole
      // request rejected on size by providers that meter reserved tokens.
      { maxTokens: 800 }
    );
  });

  it("includes jobDescription in prompt if provided", async () => {
    callServerAIMock.mockResolvedValue("Optimized text with job context");

    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({
        bulletText: "helped with coding",
        jobDescription: "Must know TypeScript",
      }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.optimizedText).toBe("Optimized text with job context");

    expect(callServerAIMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Target Job Description:\n\"Must know TypeScript\""),
        }),
      ]),
      expect.any(AbortSignal),
      { maxTokens: 800 }
    );
  });

  it("returns 500 when callServerAI throws an error", async () => {
    callServerAIMock.mockRejectedValue(new Error("AI connection error"));

    const request = new Request("http://localhost/api/optimize/bullet", {
      method: "POST",
      body: JSON.stringify({ bulletText: "helped with coding" }),
    });

    const response = await handler(request) as Response;

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Couldn't improve that bullet right now. Please try again.");
  });
  it("rejects a rewrite that invents a number", async () => {
    callServerAIMock.mockResolvedValue("Led a team of 5 to ship features 30% faster.");

    const response = await handler(post({ bulletText: "helped with coding" })) as Response;

    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/numbers you never gave/);
  });

  describe("quantify with the user's own result", () => {
    const facts = { changeType: "faster", amount: "about 40%", detail: "page load" };

    it("puts the user's facts in the prompt and keeps a grounded rewrite", async () => {
      callServerAIMock.mockResolvedValue("Rebuilt the checkout page in React, cutting page load by ~40%.");

      const response = await handler(
        post({ bulletText: "Rebuilt the checkout page in React", facts }),
      ) as Response;

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        optimizedText: "Rebuilt the checkout page in React, cutting page load by ~40%.",
        source: "ai",
      });
      const userMessage = callServerAIMock.mock.calls[0][0].find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMessage.content).toContain("The candidate says: about 40%");
    });

    it("falls back to a plain template when the AI adds its own numbers", async () => {
      callServerAIMock.mockResolvedValue("Rebuilt checkout for 20k users, 40% faster in 2 weeks.");

      const response = await handler(
        post({ bulletText: "Rebuilt the checkout page in React", facts }),
      ) as Response;

      expect(await response.json()).toEqual({
        optimizedText: "Rebuilt the checkout page in React, making it about 40% faster",
        source: "template",
      });
    });

    it("falls back when the AI drops the user's amount", async () => {
      callServerAIMock.mockResolvedValue("Rebuilt the checkout page in React, making it much faster.");

      const body = await (
        handler(post({ bulletText: "Rebuilt the checkout page in React", facts })) as Promise<Response>
      ).then((r) => r.json());

      expect(body.source).toBe("template");
    });

    it("still writes the line when every AI provider fails", async () => {
      callServerAIMock.mockRejectedValue(new Error("All providers down"));

      const response = await handler(
        post({ bulletText: "Rebuilt the checkout page in React", facts }),
      ) as Response;

      expect(response.status).toBe(200);
      expect((await response.json()).source).toBe("template");
    });

    it("rejects malformed facts", async () => {
      const response = await handler(
        post({ bulletText: "Rebuilt checkout", facts: { changeType: "magic", amount: "40%" } }),
      ) as Response;

      expect(response.status).toBe(400);
      expect(callServerAIMock).not.toHaveBeenCalled();
    });
  });
});
