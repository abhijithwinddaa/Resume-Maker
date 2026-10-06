import { describe, expect, it } from "vitest";
import { appUrl } from "../landing/ctaLinks";

describe("appUrl", () => {
  it("adds mode, from and cta", () => {
    expect(appUrl("hero-ats", "ats", "")).toBe(
      "/app/?mode=ats&from=landing&cta=hero-ats",
    );
  });

  it("keeps utm params untouched and in order", () => {
    const url = appUrl("nav", "edit", "?utm_source=x%20y&utm_medium=cpc");
    const p = new URL(url, "https://a.test").searchParams;
    expect(url.startsWith("/app/?utm_source=x+y&utm_medium=cpc")).toBe(true);
    expect(p.get("utm_source")).toBe("x y");
    expect(p.get("utm_medium")).toBe("cpc");
    expect(p.get("mode")).toBe("edit");
  });

  it("does not duplicate keys", () => {
    const url = appUrl("b", "create", "?mode=ats&from=x&cta=y&utm_campaign=c");
    const p = new URL(url, "https://a.test").searchParams;
    expect(p.getAll("mode")).toEqual(["create"]);
    expect(p.getAll("from")).toEqual(["landing"]);
    expect(p.getAll("cta")).toEqual(["b"]);
    expect(p.get("utm_campaign")).toBe("c");
  });

  it("omits mode when undefined", () => {
    const url = appUrl("footer", undefined, "?mode=ats");
    expect(url).toBe("/app/?from=landing&cta=footer");
  });
});
