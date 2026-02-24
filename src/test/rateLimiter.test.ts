import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isRateLimited,
  recordAction,
  getRateLimitRemaining,
  formatCooldown,
} from "../utils/rateLimiter";

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should not be rate limited initially", () => {
    expect(isRateLimited("test-action", 5000)).toBe(false);
  });

  it("should be rate limited after recording an action", () => {
    recordAction("test-limited");
    expect(isRateLimited("test-limited", 5000)).toBe(true);
  });

  it("should not be rate limited after cooldown expires", () => {
    recordAction("test-expire");
    vi.advanceTimersByTime(5001);
    expect(isRateLimited("test-expire", 5000)).toBe(false);
  });

  it("should return remaining time", () => {
    recordAction("test-remaining");
    vi.advanceTimersByTime(2000);
    const remaining = getRateLimitRemaining("test-remaining", 5000);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(3000);
  });

  it("should return 0 remaining when not limited", () => {
    expect(getRateLimitRemaining("nonexistent", 5000)).toBe(0);
  });
});

describe("formatCooldown", () => {
  it("should format seconds correctly", () => {
    const result = formatCooldown(3000);
    expect(result).toContain("3");
  });

  it("should handle zero", () => {
    const result = formatCooldown(0);
    expect(result).toBeDefined();
  });
});
