import { describe, expect, it } from "vitest";
import {
  CHANGE_TYPES,
  buildTemplateBullet,
  detectRoleFamily,
  hasPlaceholder,
  insertBlank,
  metricIdeasFor,
  numbersGrounded,
} from "../utils/quantify";

describe("detectRoleFamily", () => {
  it("reads the role title and stack", () => {
    expect(detectRoleFamily("Frontend Engineer")).toBe("engineering");
    expect(detectRoleFamily("Account Executive")).toBe("sales");
    expect(detectRoleFamily("Data Analyst")).toBe("data");
    expect(detectRoleFamily("Software Engineering Intern")).toBe("student");
    expect(detectRoleFamily("", "React, Firebase")).toBe("engineering");
    expect(detectRoleFamily("Operations Coordinator")).toBe("operations");
    expect(detectRoleFamily("")).toBe("general");
  });
});

describe("metricIdeasFor", () => {
  it("leads with the measures that matter for the role", () => {
    expect(metricIdeasFor("engineering")[0].id).toBe("faster");
    expect(metricIdeasFor("sales")[0].id).toBe("money");
    expect(metricIdeasFor("student").map((c) => c.id)).toContain("users");
  });

  it("always offers every change type, just ordered", () => {
    for (const family of ["engineering", "sales", "data", "student", "operations", "general"] as const) {
      expect(metricIdeasFor(family)).toHaveLength(CHANGE_TYPES.length);
    }
  });

  it("gives role-specific examples for the amount", () => {
    const faster = metricIdeasFor("engineering").find((c) => c.id === "faster")!;
    expect(faster.example.length).toBeGreaterThan(0);
  });
});

describe("buildTemplateBullet", () => {
  it("adds the user's own result to the bullet", () => {
    expect(buildTemplateBullet("Rebuilt the checkout page in React", "faster", "~50%")).toBe(
      "Rebuilt the checkout page in React, making it ~50% faster",
    );
    expect(buildTemplateBullet("Launched the mobile app.", "users", "30k+")).toBe(
      "Launched the mobile app, used by 30k+ users",
    );
  });
});

describe("numbersGrounded", () => {
  it("accepts numbers that appear in the user's own words", () => {
    expect(
      numbersGrounded("Cut load time ~50% for ~30k monthly shoppers", [
        "Rebuilt checkout",
        "about 50%",
        "30k users a month",
      ]),
    ).toBe(true);
  });

  it("rejects a number the user never gave", () => {
    expect(numbersGrounded("Cut load time 50% for 30k shoppers in 3 weeks", ["50%", "30k"])).toBe(
      false,
    );
  });
});

describe("blanks", () => {
  it("inserts a fill-in blank the user must complete", () => {
    const withBlank = insertBlank("Rebuilt the checkout page", "faster");
    expect(withBlank).toBe("Rebuilt the checkout page, making it [X%] faster");
    expect(hasPlaceholder(withBlank)).toBe(true);
  });

  it("does not mistake ordinary brackets for blanks", () => {
    expect(hasPlaceholder("Built a CLI [open source] in Go")).toBe(false);
    expect(hasPlaceholder("Grew revenue [N] times")).toBe(true);
  });
});
