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
      body: JSON.stringify({ bulletText: "helped with coding" }),
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
          content: expect.stringContaining('Original Bullet Point: "helped with coding"'),
        }),
      ]),
      expect.any(AbortSignal)
    );
  });

  it("includes jobDescription in prompt if provided", async () => {
    callServerAIMock.mockResolvedValue("Optimized text with JD context");

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
    expect(body.optimizedText).toBe("Optimized text with JD context");

    expect(callServerAIMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Target Job Description:\n\"Must know TypeScript\""),
        }),
      ]),
      expect.any(AbortSignal)
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
    expect(body.error).toBe("AI connection error");
  });
});
