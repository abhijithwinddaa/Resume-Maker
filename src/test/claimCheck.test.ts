import { describe, expect, it } from "vitest";
import { findNewClaims } from "../utils/claimCheck";

describe("findNewClaims", () => {
  it("flags a collaboration claim", () => {
    expect(
      findNewClaims(
        "Responsible for UI components",
        "Created reusable UI components and collaborated with designers using Figma",
      ),
    ).toEqual(["collaborated with designers using Figma"]);
  });

  it("flags an outcome clause", () => {
    expect(
      findNewClaims("Added login and event reminders", "Added login and event reminders to improve user engagement"),
    ).toEqual(["to improve user engagement"]);
  });

  it("flags an impact clause after a comma", () => {
    const out = findNewClaims(
      "Worked on the checkout page",
      "Built the checkout page, delivering a responsive design for desktop and mobile users.",
    );
    expect(out).toEqual(["delivering a responsive design for desktop and mobile users"]);
  });

  it("does not flag a plain verb upgrade", () => {
    expect(findNewClaims("Worked on the checkout page", "Built the checkout page")).toEqual([]);
  });

  it("does not flag a claim already in the original", () => {
    expect(
      findNewClaims("Improved page speed with stakeholders", "Improved page speed, partnering with stakeholders"),
    ).toEqual([]);
  });

  it("returns trimmed, short, de-duplicated phrases", () => {
    const out = findNewClaims(
      "Built a dashboard",
      "Built a dashboard   ensuring the very long reporting pipeline remained accurate for every single downstream consumer team , improving trust.",
    );
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p).toBe(p.trim());
      expect(p.length).toBeLessThanOrEqual(60);
    }
  });
});
