import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, adminClientMock, authMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  adminClientMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("../server/supabaseAdmin", () => ({
  getSupabaseAdminClient: adminClientMock,
}));
vi.mock("../server/requestAuth", () => ({
  authenticateClerkRequest: authMock,
}));
vi.mock("../server/resend", () => ({
  getMailSiteUrl: () => "https://resume.example.com",
  sendTransactionalEmail: sendMock,
}));

import { buildReminderEmail } from "../server/mailTemplates";
import { hashString, withInFlightDedup } from "../server/aiCacheStore";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../server/unsubscribeToken";
import {
  shouldSendReminder,
  type NotificationRecipient,
} from "../server/notificationLogic";
import unsubscribeHandler from "../../api/notifications/unsubscribe";
import cronHandler from "../../api/cron/daily-reminders";
import replyHandler from "../../api/feedback/reply";

type EnvMap = Record<string, string | undefined>;
const env = (globalThis as { process: { env: EnvMap } }).process.env;

interface Call {
  method: string;
  args: unknown[];
}

/** Chainable, awaitable stand-in for a supabase-js query builder. */
function makeBuilder(result: { data: unknown; error: unknown }, calls: Call[]) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "update",
    "eq",
    "or",
    "gte",
    "is",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  env.UNSUBSCRIBE_SECRET = "test-secret";
  env.CRON_SECRET = "cron-secret";
  delete env.REMINDER_ROLLOUT_STARTED_AT;
});

describe("shouldSendReminder audience", () => {
  const row: NotificationRecipient = {
    user_id: "u1",
    user_email: "a@example.com",
    first_name: null,
    last_seen_at: "2026-04-20T00:00:00.000Z",
    last_reminder_sent_at: null,
    reminder_enabled: true,
  };
  const config = {
    rolloutStartedAt: new Date("2026-04-01T00:00:00Z"),
    warmupDays: 3,
    recentActivityHours: 72,
  };
  const now = new Date("2026-04-30T00:00:00Z");

  it("skips inactive users in recent-active mode, keeps active ones", () => {
    expect(shouldSendReminder(row, now, config)).toBe(false);
    expect(
      shouldSendReminder(
        { ...row, last_seen_at: "2026-04-29T12:00:00.000Z" },
        now,
        config,
      ),
    ).toBe(true);
  });
});

describe("unsubscribe token", () => {
  it("verifies a valid token", () => {
    const token = createUnsubscribeToken("user_1");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyUnsubscribeToken("user_1", token)).toBe(true);
  });

  it("rejects tampered tokens and tokens for another user", () => {
    const token = createUnsubscribeToken("user_1");
    const flipped = `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`;
    expect(verifyUnsubscribeToken("user_1", flipped)).toBe(false);
    expect(verifyUnsubscribeToken("user_1", "short")).toBe(false);
    expect(verifyUnsubscribeToken("user_2", token)).toBe(false);
    expect(verifyUnsubscribeToken("user_1", "")).toBe(false);
  });

  it("falls back to the service role key", () => {
    delete env.UNSUBSCRIBE_SECRET;
    env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    const token = createUnsubscribeToken("user_1");
    expect(verifyUnsubscribeToken("user_1", token)).toBe(true);
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect(createUnsubscribeToken("user_1")).toBe("");
  });
});

describe("reminder template", () => {
  it("includes the unsubscribe link only when given", () => {
    const url = buildUnsubscribeUrl("https://resume.example.com", "user_1");
    const withLink = buildReminderEmail({
      siteUrl: "https://resume.example.com",
      audienceMode: "all",
      unsubscribeUrl: url,
    });
    expect(withLink.html).toContain("Unsubscribe");
    expect(withLink.html).toContain("/api/notifications/unsubscribe?u=user_1");
    expect(withLink.text).toContain(url);

    const without = buildReminderEmail({
      siteUrl: "https://resume.example.com",
      audienceMode: "all",
    });
    expect(without.html).not.toContain("Unsubscribe");
  });
});

describe("unsubscribe route", () => {
  it("only asks on GET, so mail scanners opening the link don't unsubscribe", async () => {
    const from = vi.fn();
    adminClientMock.mockReturnValue({ from });
    const token = createUnsubscribeToken("user_1");

    const res = (await unsubscribeHandler(
      new Request(`https://x.test/api/notifications/unsubscribe?u=user_1&t=${token}`),
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<form method="post">');
    expect(from).not.toHaveBeenCalled();
  });

  it("disables reminders on POST with a valid token (button or one-click)", async () => {
    const calls: Call[] = [];
    const from = vi.fn(() => makeBuilder({ data: null, error: null }, calls));
    adminClientMock.mockReturnValue({ from });
    const token = createUnsubscribeToken("user_1");

    const res = (await unsubscribeHandler(
      new Request(`https://x.test/api/notifications/unsubscribe?u=user_1&t=${token}`, {
        method: "POST",
        body: "List-Unsubscribe=One-Click",
      }),
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("unsubscribed");
    expect(from).toHaveBeenCalledWith("app_user_notifications");
    const update = calls.find((c) => c.method === "update");
    expect((update?.args[0] as { reminder_enabled: boolean }).reminder_enabled).toBe(false);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["user_id", "user_1"]);
  });

  it("returns 400 for invalid tokens without touching the database", async () => {
    const from = vi.fn();
    adminClientMock.mockReturnValue({ from });
    const res = (await unsubscribeHandler(
      new Request(
        "https://x.test/api/notifications/unsubscribe?u=user_1&t=bogus",
      ),
    )) as Response;
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("daily reminder cron", () => {
  it("filters already-sent users in SQL and continues after a failed send", async () => {
    const calls: Call[] = [];
    const rows = [
      { user_id: "a", user_email: "a@x.com", first_name: null, last_seen_at: new Date().toISOString(), last_reminder_sent_at: null, reminder_enabled: true },
      { user_id: "b", user_email: "b@x.com", first_name: null, last_seen_at: new Date().toISOString(), last_reminder_sent_at: null, reminder_enabled: true },
    ];
    const from = vi.fn(() => makeBuilder({ data: rows, error: null }, calls));
    adminClientMock.mockReturnValue({ from });
    env.REMINDER_ROLLOUT_STARTED_AT = new Date().toISOString();
    sendMock
      .mockRejectedValueOnce(new Error("resend exploded"))
      .mockResolvedValueOnce({ id: "email_2" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = (await cronHandler(
      new Request("https://x.test/api/cron/daily-reminders", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    )) as Response;
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(json.sent).toBe(1);
    expect(json.failed).toBe(1);
    expect(sendMock.mock.calls[0][0].unsubscribeUrl).toContain(
      "/api/notifications/unsubscribe?u=a",
    );
    const orCall = calls.find((c) => c.method === "or");
    expect(String(orCall?.args[0])).toContain("last_reminder_sent_at.is.null");
    expect(String(orCall?.args[0])).toContain("last_reminder_sent_at.lt.");
  }, 15000);

  it("rejects a wrong or different-length secret", async () => {
    for (const header of ["Bearer nope", "Bearer cron-secret-and-more", ""]) {
      const res = (await cronHandler(
        new Request("https://x.test/api/cron/daily-reminders", {
          headers: header ? { authorization: header } : {},
        }),
      )) as Response;
      expect(res.status).toBe(401);
    }
  });
});

describe("hashString", () => {
  it("returns 64 hex chars and differs for different input", () => {
    expect(hashString("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashString("hello")).not.toBe(hashString("hellp"));
  });
});

describe("withInFlightDedup", () => {
  it("does not fail the second caller when the first aborts", async () => {
    const controller = new AbortController();
    const first = withInFlightDedup(
      "k1",
      () =>
        new Promise<string>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
      controller.signal,
    );
    const second = withInFlightDedup("k1", async () => "second-result");

    controller.abort();
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toBe("second-result");
  });

  it("shares one run between concurrent callers", async () => {
    const factory = vi.fn(async () => "v");
    const [a, b] = await Promise.all([
      withInFlightDedup("k2", factory),
      withInFlightDedup("k2", factory),
    ]);
    expect([a, b]).toEqual(["v", "v"]);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("feedback reply route", () => {
  it("returns the saved row with emailed:false when sending fails", async () => {
    env.ADMIN_EMAILS = "admin@example.com";
    env.VITE_ADMIN_EMAILS = "admin@example.com";
    authMock.mockResolvedValue({
      ok: true,
      user: { userId: "admin", payload: { email: "abhijithwinddaa@gmail.com" } },
    });
    const saved = { id: "f1", admin_reply: "thanks for this" };
    const from = vi.fn((table: string) => {
      const calls: Call[] = [];
      if (table === "app_user_notifications")
        return makeBuilder({ data: { first_name: "A" }, error: null }, calls);
      const builder = makeBuilder({ data: saved, error: null }, calls);
      (builder as { single: unknown }).single = () =>
        makeBuilder({ data: saved, error: null }, calls);
      return builder;
    });
    // existing-row lookup uses maybeSingle and must expose user fields.
    const existing = { id: "f1", user_id: "u1", user_email: "u@example.com" };
    from.mockImplementationOnce(() =>
      makeBuilder({ data: existing, error: null }, []),
    );
    adminClientMock.mockReturnValue({ from });
    sendMock.mockRejectedValue(new Error("resend down: secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = (await replyHandler(
      new Request("https://x.test/api/feedback/reply", {
        method: "POST",
        body: JSON.stringify({ feedbackId: "f1", reply: "thanks for this" }),
      }),
    )) as Response;
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.emailed).toBe(false);
    expect(json.feedback).toEqual(saved);
    expect(JSON.stringify(json)).not.toContain("secret detail");
  });
});
