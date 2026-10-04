import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_REQUESTS_PER_WINDOW,
  checkAIRateLimit,
  resetAIRateLimits,
} from "../server/rateLimit";

describe("checkAIRateLimit", () => {
  beforeEach(() => {
    resetAIRateLimits();
    vi.useRealTimers();
  });

  it("allows a user's normal session of requests", () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) {
      expect(checkAIRateLimit("user_a").allowed).toBe(true);
    }
  });

  it("blocks the request after the window's budget, with a retry hint", () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) checkAIRateLimit("user_a");

    const result = checkAIRateLimit("user_a");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each user separately", () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) checkAIRateLimit("user_a");

    expect(checkAIRateLimit("user_b").allowed).toBe(true);
  });

  it("frees the budget again once the window has passed", () => {
    vi.useFakeTimers();
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) checkAIRateLimit("user_a");
    expect(checkAIRateLimit("user_a").allowed).toBe(false);

    vi.advanceTimersByTime(11 * 60_000);

    expect(checkAIRateLimit("user_a").allowed).toBe(true);
  });
});
