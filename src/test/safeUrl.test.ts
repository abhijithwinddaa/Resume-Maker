import { describe, expect, it } from "vitest";
import { displayUrl, mailtoUrl, safeUrl, telUrl } from "../utils/safeUrl";

describe("safeUrl", () => {
  it("returns empty for blank, non-string and placeholder input", () => {
    expect(safeUrl("")).toBe("");
    expect(safeUrl("   ")).toBe("");
    expect(safeUrl("#")).toBe("");
    expect(safeUrl(undefined)).toBe("");
    expect(safeUrl(42)).toBe("");
  });

  it("adds https:// when there is no scheme", () => {
    expect(safeUrl("linkedin.com/in/me")).toBe("https://linkedin.com/in/me");
    expect(safeUrl("  github.com/me  ")).toBe("https://github.com/me");
    expect(safeUrl("//example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("localhost:3000/app")).toBe("https://localhost:3000/app");
  });

  it("keeps http and https links", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("HTTP://example.com")).toBe("http://example.com");
  });

  it("rejects javascript:, data: and other schemes", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBe("");
    expect(safeUrl("java\tscript:alert(1)")).not.toMatch(/^javascript/i);
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeUrl("vbscript:x")).toBe("");
    expect(safeUrl("file:///etc/passwd")).toBe("");
    expect(safeUrl("mailto:a@b.com")).toBe("");
  });

  it("rejects things that do not parse", () => {
    expect(safeUrl("https://")).toBe("");
    expect(safeUrl("not a url with spaces")).toBe("");
  });

  it("builds a display string without protocol", () => {
    expect(displayUrl("https://www.github.com/me/")).toBe("github.com/me");
  });
});

describe("mailtoUrl / telUrl", () => {
  it("strips characters that do not belong in an address", () => {
    expect(mailtoUrl("me@example.com")).toBe("mailto:me@example.com");
    expect(mailtoUrl(" me@example.com?subject=x&bcc=y ")).toBe("mailto:me@example.comsubjectxbccy");
    expect(mailtoUrl("not-an-email")).toBe("");
    expect(mailtoUrl("a@b@c.com")).toBe("");
    expect(mailtoUrl("")).toBe("");
  });

  it("keeps digits and a leading plus for phones", () => {
    expect(telUrl("+91 98765-43210")).toBe("tel:+919876543210");
    expect(telUrl("(555) 123 4567")).toBe("tel:5551234567");
    expect(telUrl("call me")).toBe("");
    expect(telUrl("javascript:1")).toBe("");
  });
});
