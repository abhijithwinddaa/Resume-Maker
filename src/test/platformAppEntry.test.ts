import { beforeEach, describe, expect, it } from "vitest";
import {
  parseModeParam,
  stripModeParam,
  syncSignedInHint,
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

describe("syncSignedInHint", () => {
  beforeEach(() => localStorage.clear());
  it("sets 1 for a user id and clears when signed out", () => {
    syncSignedInHint("user_1");
    expect(localStorage.getItem("rm_signed_in")).toBe("1");
    syncSignedInHint(null);
    expect(localStorage.getItem("rm_signed_in")).toBeNull();
    syncSignedInHint("user_1");
    syncSignedInHint(undefined);
    expect(localStorage.getItem("rm_signed_in")).toBeNull();
  });
});
