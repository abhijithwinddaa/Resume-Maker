export type ReminderAudienceMode = "all" | "recent-active";

export interface ReminderRolloutConfig {
  rolloutStartedAt: Date | null;
  warmupDays: number;
  recentActivityHours: number;
}

export interface NotificationRecipient {
  user_id: string;
  user_email: string;
  first_name: string | null;
  last_seen_at: string | null;
  last_reminder_sent_at: string | null;
  reminder_enabled: boolean | null;
}

function isFiniteDate(value: Date | null): value is Date {
  return Boolean(value && Number.isFinite(value.getTime()));
}

export function resolveReminderAudienceMode(
  now: Date,
  config: ReminderRolloutConfig,
): ReminderAudienceMode {
  if (!isFiniteDate(config.rolloutStartedAt)) {
    return "all";
  }

  const warmupEndsAt = new Date(config.rolloutStartedAt.getTime());
  warmupEndsAt.setUTCDate(warmupEndsAt.getUTCDate() + config.warmupDays);

  return now < warmupEndsAt ? "all" : "recent-active";
}

export function hasRecentActivity(
  lastSeenAt: string | null,
  recentActivityHours: number,
  now: Date,
): boolean {
  if (!lastSeenAt) return false;
  const parsed = new Date(lastSeenAt);
  if (!Number.isFinite(parsed.getTime())) return false;

  const windowStart =
    now.getTime() - Math.max(0, recentActivityHours) * 60 * 60 * 1000;
  return parsed.getTime() >= windowStart;
}

export function wasSentToday(
  lastSentAt: string | null,
  now: Date,
): boolean {
  if (!lastSentAt) return false;
  const parsed = new Date(lastSentAt);
  if (!Number.isFinite(parsed.getTime())) return false;

  return parsed.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

export function shouldSendReminder(
  row: NotificationRecipient,
  now: Date,
  config: ReminderRolloutConfig,
): boolean {
  if (!row.reminder_enabled) return false;
  if (!row.user_email.trim()) return false;
  if (wasSentToday(row.last_reminder_sent_at, now)) return false;

  const audienceMode = resolveReminderAudienceMode(now, config);
  if (audienceMode === "all") {
    return true;
  }

  return hasRecentActivity(row.last_seen_at, config.recentActivityHours, now);
}
