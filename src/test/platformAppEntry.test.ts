import { describe, expect, it } from "vitest";
import {
  isFromLanding,
  parseModeParam,
  stripModeParam,
} from "../utils/appEntry";

describe("parseModeParam", () => {
  it("accepts the three modes", () => {
    expect(parseModeParam("?mode=ats")).toBe("ats");
    expect(parseModeParam("?utm_source=a&mode=edit")).toBe("edit");
    expect(parseModeParam("?mode=create&from=landing")).toBe("create");
  });
  it("rejects missing or unknown values", () => {
    expect(parseModeParam("")).toBeNull();
    expect(parseModeParam("?mode=")).toBeNull();
    expect(parseModeParam("?mode=admin")).toBeNull();
    expect(parseModeParam("?mode=ATS")).toBeNull();
  });
});

describe("stripModeParam", () => {
  it("removes only mode and keeps the rest", () => {
    expect(stripModeParam("?mode=ats&utm_source=a&utm_campaign=b")).toBe(
      "?utm_source=a&utm_campaign=b",
    );
  });
  it("returns an empty string when nothing remains", () => {
    expect(stripModeParam("?mode=ats")).toBe("");
    expect(stripModeParam("")).toBe("");
  });
});

describe("isFromLanding", () => {
  it("recognises visits that came through a landing page button", () => {
    expect(isFromLanding("?utm_source=whatsapp&from=landing&cta=hero")).toBe(true);
  });
  it("is false for direct visits and other sources", () => {
    expect(isFromLanding("")).toBe(false);
    expect(isFromLanding("?from=email")).toBe(false);
    expect(isFromLanding("?utm_source=landing")).toBe(false);
  });
});
