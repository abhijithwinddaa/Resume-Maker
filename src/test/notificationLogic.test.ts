import { describe, expect, it } from "vitest";
import {
  hasRecentActivity,
  resolveReminderAudienceMode,
  shouldSendReminder,
  wasSentToday,
  type NotificationRecipient,
} from "../server/notificationLogic";

const BASE_ROW: NotificationRecipient = {
  user_id: "user_123",
  user_email: "hello@example.com",
  first_name: "Abhi",
  last_seen_at: "2026-04-25T08:00:00.000Z",
  last_reminder_sent_at: null,
  reminder_enabled: true,
};

describe("notificationLogic", () => {
  it("keeps reminders in all-user mode during warmup", () => {
    const mode = resolveReminderAudienceMode(new Date("2026-04-26T00:00:00Z"), {
      rolloutStartedAt: new Date("2026-04-25T00:00:00Z"),
      warmupDays: 3,
      recentActivityHours: 72,
    });

    expect(mode).toBe("all");
  });

  it("switches to recent-active mode after warmup", () => {
    const mode = resolveReminderAudienceMode(new Date("2026-04-29T00:00:00Z"), {
      rolloutStartedAt: new Date("2026-04-25T00:00:00Z"),
      warmupDays: 3,
      recentActivityHours: 72,
    });

    expect(mode).toBe("recent-active");
  });

  it("detects activity inside the recent activity window", () => {
    expect(
      hasRecentActivity(
        "2026-04-24T12:00:00.000Z",
        72,
        new Date("2026-04-25T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("blocks duplicate reminders on the same utc day", () => {
    expect(
      wasSentToday(
        "2026-04-25T03:00:00.000Z",
        new Date("2026-04-25T23:59:00.000Z"),
      ),
    ).toBe(true);
  });

  it("filters out inactive users after the warmup period", () => {
    expect(
      shouldSendReminder(
        {
          ...BASE_ROW,
          last_seen_at: "2026-04-20T00:00:00.000Z",
        },
        new Date("2026-04-30T00:00:00.000Z"),
        {
          rolloutStartedAt: new Date("2026-04-25T00:00:00.000Z"),
          warmupDays: 3,
          recentActivityHours: 72,
        },
      ),
    ).toBe(false);
  });
});
