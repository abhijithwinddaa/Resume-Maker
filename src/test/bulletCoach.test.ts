import { describe, expect, it } from "vitest";
import { analyzeBullet } from "../utils/bulletCoach";

const status = (text: string) => {
  const { checks } = analyzeBullet(text);
  return [checks.action.status, checks.scope.status, checks.result.status];
};

describe("analyzeBullet", () => {
  it("passes a strong STAR/XYZ bullet on all three checks", () => {
    expect(
      status("Built a React checkout flow used by 30k monthly shoppers, cutting load time 40%"),
    ).toEqual(["pass", "pass", "pass"]);
  });

  it("flags a weak opener, thin scope, and no result", () => {
    const result = analyzeBullet("Worked on the checkout page");
    expect(status("Worked on the checkout page")).toEqual(["fail", "fail", "fail"]);
    expect(result.score).toBe(0);
    expect(result.checks.action.tip).toMatch(/built|led|reduced/i);
  });

  it("gives partial credit for an outcome without a number", () => {
    const { checks } = analyzeBullet(
      "Rebuilt the checkout page in React, improving load time for shoppers",
    );
    expect(checks.result.status).toBe("partial");
    expect(checks.result.tip).toMatch(/how much|number/i);
  });

  it("counts tools and methods as the 'how'", () => {
    expect(analyzeBullet("Automated invoice reports using Python and Airflow").checks.scope.status).toBe(
      "pass",
    );
  });

  it("recognises common metric shapes", () => {
    for (const text of [
      "Cut costs by $12k per year through vendor consolidation",
      "Reduced build time 3x by caching Docker layers in CI",
      "Grew the newsletter to 2,500 subscribers with weekly Python tips",
    ]) {
      expect(analyzeBullet(text).checks.result.status).toBe("pass");
    }
  });

  it("does not count years in a date as a result", () => {
    expect(analyzeBullet("Maintained the billing service since 2021 using Node.js").checks.result.status)
      .not.toBe("pass");
  });

  it("scores 0–3 by passed checks, with partial worth half", () => {
    expect(analyzeBullet("Built a React checkout flow used by 30k shoppers").score).toBe(3);
    expect(
      analyzeBullet("Rebuilt the checkout page in React, improving load time for shoppers").score,
    ).toBe(2.5);
  });

  it("returns nothing to judge for an empty bullet", () => {
    expect(analyzeBullet("   ").empty).toBe(true);
  });
});
