import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../server/supabaseAdmin", () => ({
  getSupabaseAdminClient: () => null,
}));

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

  it("allows a user's normal session of requests", async () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) {
      expect((await checkAIRateLimit("user_a")).allowed).toBe(true);
    }
  });

  it("blocks the request after the window's budget, with a retry hint", async () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) await checkAIRateLimit("user_a");

    const result = await checkAIRateLimit("user_a");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each user separately", async () => {
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) await checkAIRateLimit("user_a");

    expect((await checkAIRateLimit("user_b")).allowed).toBe(true);
  });

  it("frees the budget again once the window has passed", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) await checkAIRateLimit("user_a");
    expect((await checkAIRateLimit("user_a")).allowed).toBe(false);

    vi.advanceTimersByTime(11 * 60_000);

    expect((await checkAIRateLimit("user_a")).allowed).toBe(true);
  });
});
