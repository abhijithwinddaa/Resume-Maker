import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrubEvent, scrubText } from "../utils/errorScrub";
import { flushServerErrors, parseDsn, parseStack, reportServerError } from "../server/errorReporting";
import { RequestValidationError, safeErrorResponse } from "../server/requestValidation";

const DSN = "https://abc123def456@o4500000.ingest.us.sentry.io/4500001";

describe("scrubText", () => {
  it("removes emails, phone numbers, tokens and URL queries", () => {
    const out = scrubText(
      "Failed for asha.rao@example.com +91 90000 00000 Bearer abcdefghijklmnop https://x.co/a?u=1&t=secret",
    );
    expect(out).not.toMatch(/asha|90000|abcdefghijklmnop|secret/);
    expect(out).toContain("[email]");
    expect(out).toContain("[number]");
    expect(out).toContain("https://x.co/a");
  });

  it("keeps short numbers like years and counts", () => {
    expect(scrubText("Jan 2025 - 3 bullets")).toBe("Jan 2025 - 3 bullets");
    expect(scrubText("2021 - 2025")).toBe("2021 - 2025");
  });

  it("truncates long text, which is usually quoted resume content", () => {
    const out = scrubText("x".repeat(1000));
    expect(out.length).toBeLessThan(330);
    expect(out).toMatch(/truncated/);
  });
});

describe("scrubEvent", () => {
  it("drops identity, request bodies, headers and input breadcrumbs", () => {
    const event = scrubEvent({
      user: { id: "user_1", email: "a@b.co" },
      request: { url: "https://resume.batturaj.in/app/?token=abc", data: { resume: "..." }, headers: { Authorization: "x" }, cookies: "c" },
      exception: { values: [{ value: "Cannot parse resume for a@b.co" }] },
      extra: { route: "editor", resume: { name: "Asha" }, note: "call +91 98765 43210" },
      breadcrumbs: [
        { category: "console", message: "resume text here" },
        { category: "ui.input", message: "input#contact-name" },
        { category: "navigation", message: "/app/" },
      ],
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://resume.batturaj.in/app/" });
    expect(event.exception?.values?.[0].value).toBe("Cannot parse resume for [email]");
    expect(event.extra).toEqual({ route: "editor", note: "call [number]" });
    expect(event.breadcrumbs?.map((b) => b.category)).toEqual(["navigation"]);
  });
});

describe("server error reporting", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SENTRY_DSN;
  });

  it("parses a DSN into the envelope endpoint", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o4500000.ingest.us.sentry.io/api/4500001/envelope/",
      publicKey: "abc123def456",
      raw: DSN,
    });
    expect(parseDsn("not a dsn")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("does nothing without a DSN", async () => {
    reportServerError(new Error("boom"), "test");
    await flushServerErrors();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a scrubbed envelope and waits for it on flush", async () => {
    process.env.SENTRY_DSN = DSN;
    reportServerError(new Error("Parse failed for asha.rao@example.com"), "parse-resume");
    await flushServerErrors();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o4500000.ingest.us.sentry.io/api/4500001/envelope/");
    expect(init.headers["X-Sentry-Auth"]).toContain("sentry_key=abc123def456");
    const [, item, payload] = String(init.body).split("\n");
    expect(JSON.parse(item)).toEqual({ type: "event" });
    const event = JSON.parse(payload);
    expect(event.tags.route).toBe("parse-resume");
    expect(event.exception.values[0].value).toBe("Parse failed for [email]");
    expect(String(init.body)).not.toContain("asha.rao");
  });

  it("never throws when the network fails", async () => {
    process.env.SENTRY_DSN = DSN;
    fetchMock.mockRejectedValue(new Error("offline"));
    reportServerError(new Error("boom"), "test");
    await expect(flushServerErrors()).resolves.toBeUndefined();
  });

  it("trims stack paths to the project", () => {
    const frames = parseStack("Error: x\n    at handle (C:\\work\\Resume maker\\api\\parse\\resume.ts:10:5)\n    at run (/var/task/src/server/x.js:2:1)");
    expect(frames.map((f) => f.filename)).toEqual(["src/server/x.js", "api/parse/resume.ts"]);
  });

  it("reports unexpected route errors but not user input errors", async () => {
    process.env.SENTRY_DSN = DSN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    safeErrorResponse(new RequestValidationError("Job description is too long", 413), "Try again.", "ats-analyze");
    await flushServerErrors();
    expect(fetchMock).not.toHaveBeenCalled();

    safeErrorResponse(new TypeError("x is undefined"), "Try again.", "ats-analyze");
    await flushServerErrors();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
