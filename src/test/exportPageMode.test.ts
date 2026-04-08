import { describe, expect, it } from "vitest";
import { resolveExportPageMode } from "../utils/exportPageMode";

describe("resolveExportPageMode", () => {
  it("requires single-page attempts for freshers in auto mode", () => {
    expect(resolveExportPageMode("auto", "fresher")).toEqual({
      singlePageRequired: true,
      fitRequiresSinglePageAttempts: true,
    });
  });

  it("allows standard multi-page export for experienced users in auto mode", () => {
    expect(resolveExportPageMode("auto", "experienced")).toEqual({
      singlePageRequired: false,
      fitRequiresSinglePageAttempts: false,
    });
  });

  it("keeps force-single-page behavior unchanged", () => {
    expect(resolveExportPageMode("force-single-page", "experienced")).toEqual({
      singlePageRequired: true,
      fitRequiresSinglePageAttempts: true,
    });
  });

  it("keeps allow-multi-page behavior unchanged", () => {
    expect(resolveExportPageMode("allow-multi-page", "fresher")).toEqual({
      singlePageRequired: false,
      fitRequiresSinglePageAttempts: false,
    });
  });

  it("enables adaptive compaction only when auto-adaptive is selected", () => {
    expect(resolveExportPageMode("auto-adaptive", "experienced")).toEqual({
      singlePageRequired: false,
      fitRequiresSinglePageAttempts: true,
    });
  });
});
