import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock, selectCalls } = vi.hoisted(() => {
  const selectCalls: string[] = [];
  const chain = {
    select: vi.fn((cols: string) => {
      selectCalls.push(cols);
      return chain;
    }),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: [{ id: "1", rating: 5, comment: "Helped me a lot", created_at: "2026-01-01" }],
        error: null,
      }),
    ),
  };
  return { rpcMock: vi.fn(), fromMock: vi.fn(() => chain), selectCalls };
});

vi.mock("../lib/supabase", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import { loadPublicFeedback } from "../services/feedbackService";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockClear();
  selectCalls.length = 0;
});

describe("loadPublicFeedback", () => {
  it("reads public reviews through the privacy-safe function", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "1", rating: 5, comment: "Great tool", author_label: "ab***@gmail.com" }],
      error: null,
    });

    const rows = await loadPublicFeedback(12);

    expect(rpcMock).toHaveBeenCalledWith("get_public_feedback", { p_limit: 12 });
    expect(fromMock).not.toHaveBeenCalled();
    expect(rows[0].author_label).toBe("ab***@gmail.com");
  });

  it("falls back to display-safe columns before the database migration runs", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    const rows = await loadPublicFeedback();

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]).not.toMatch(/user_email|admin_notes|user_id/);
    expect(rows[0]).toMatchObject({ rating: 5, author_label: "Public review" });
  });

  it("returns nothing rather than throwing on other errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { code: "500", message: "boom" } });

    await expect(loadPublicFeedback()).resolves.toEqual([]);
  });
});
