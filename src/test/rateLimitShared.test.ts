import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const clientRef = vi.hoisted(() => ({
  current: null as null | { rpc: (...a: unknown[]) => unknown },
}));

vi.mock("../server/supabaseAdmin", () => ({
  getSupabaseAdminClient: () => clientRef.current,
}));

import {
  AI_REQUESTS_PER_WINDOW,
  checkAIRateLimit,
  resetAIRateLimits,
} from "../server/rateLimit";

describe("checkAIRateLimit with the shared limiter", () => {
  beforeEach(() => {
    resetAIRateLimits();
    rpcMock.mockReset();
    clientRef.current = { rpc: rpcMock };
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("allows when the RPC allows", async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });
    const result = await checkAIRateLimit("u1");
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpcMock).toHaveBeenCalledWith("consume_ai_rate_limit", {
      p_user_id: "u1",
      p_limit: AI_REQUESTS_PER_WINDOW,
      p_window_seconds: 600,
    });
  });

  it("denies with the RPC's retry hint", async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 123 }],
      error: null,
    });
    expect(await checkAIRateLimit("u1")).toEqual({
      allowed: false,
      retryAfterSeconds: 123,
    });
  });

  it("falls back to the in-memory window when the client is null", async () => {
    clientRef.current = null;
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) {
      expect((await checkAIRateLimit("u1")).allowed).toBe(true);
    }
    const result = await checkAIRateLimit("u1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("falls back when the RPC errors, warning only once", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) {
      expect((await checkAIRateLimit("u1")).allowed).toBe(true);
    }
    expect((await checkAIRateLimit("u1")).allowed).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("falls back when the RPC takes too long", async () => {
    vi.useFakeTimers();
    rpcMock.mockReturnValue(new Promise(() => {}));
    const pending = checkAIRateLimit("u1");
    await vi.advanceTimersByTimeAsync(1_600);
    expect(await pending).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("skips the DB once the local window is already full", async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });
    for (let i = 0; i < AI_REQUESTS_PER_WINDOW; i++) {
      await checkAIRateLimit("u1");
    }
    rpcMock.mockClear();
    const result = await checkAIRateLimit("u1");
    expect(result.allowed).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
