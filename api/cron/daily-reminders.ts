import { timingSafeEqual } from "node:crypto";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import { readEnv, readOptionalNumber } from "../../src/server/env.js";
import {
  resolveReminderAudienceMode,
  shouldSendReminder,
  type NotificationRecipient,
} from "../../src/server/notificationLogic.js";
import { buildReminderEmail } from "../../src/server/mailTemplates.js";
import { getMailSiteUrl, sendTransactionalEmail } from "../../src/server/resend.js";
import { getSupabaseAdminClient } from "../../src/server/supabaseAdmin.js";
import { buildUnsubscribeUrl } from "../../src/server/unsubscribeToken.js";

// Resend allows roughly 2 requests per second.
const SEND_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = readEnv("CRON_SECRET");
  if (!cronSecret) {
    return false;
  }

  const provided = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

async function resolveRolloutStart(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
): Promise<Date | null> {
  const explicit = readEnv("REMINDER_ROLLOUT_STARTED_AT");
  if (explicit) {
    const parsed = new Date(explicit);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  const { data } = await supabase
    .from("app_user_notifications")
    .select("first_seen_at")
    .order("first_seen_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.first_seen_at) {
    return null;
  }

  const parsed = new Date(data.first_seen_at);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (!isAuthorizedCronRequest(request)) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return jsonResponse(
        {
          error:
            "Server reminder cron is not configured. Set SUPABASE_SERVICE_ROLE_KEY first.",
        },
        500,
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const startOfTodayIso = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
    const reminderLimit = readOptionalNumber(
      readEnv("REMINDER_DAILY_LIMIT"),
      200,
      1,
    );
    const warmupDays = readOptionalNumber(
      readEnv("REMINDER_BROADCAST_DAYS"),
      3,
      0,
    );
    const recentActivityHours = readOptionalNumber(
      readEnv("REMINDER_ACTIVE_WINDOW_HOURS"),
      72,
      1,
    );

    const rolloutStartedAt = await resolveRolloutStart(supabase);
    const rolloutConfig = { rolloutStartedAt, warmupDays, recentActivityHours };
    const audienceMode = resolveReminderAudienceMode(now, rolloutConfig);

    let query = supabase
      .from("app_user_notifications")
      .select(
        "user_id, user_email, first_name, last_seen_at, last_reminder_sent_at, reminder_enabled",
      )
      .eq("reminder_enabled", true)
      .or(
        `last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${startOfTodayIso}`,
      );

    if (audienceMode === "recent-active") {
      // Filter before the limit so inactive users do not use up the quota.
      const windowStartIso = new Date(
        now.getTime() - recentActivityHours * 60 * 60 * 1000,
      ).toISOString();
      query = query.gte("last_seen_at", windowStartIso);
    }

    const { data, error } = await query
      .order("last_seen_at", { ascending: false })
      .limit(reminderLimit);

    if (error) {
      return jsonResponse(
        {
          error: "Could not load reminder recipients.",
        },
        500,
      );
    }

    const recipients = (data || []) as NotificationRecipient[];
    const siteUrl = getMailSiteUrl();
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of recipients) {
      const eligible = shouldSendReminder(row, now, rolloutConfig);

      if (!eligible) {
        skippedCount += 1;
        continue;
      }

      try {
        const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, row.user_id);
        const email = buildReminderEmail({
          firstName: row.first_name || undefined,
          siteUrl,
          audienceMode,
          unsubscribeUrl: unsubscribeUrl || undefined,
        });

        const sent = await sendTransactionalEmail({
          to: row.user_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          idempotencyKey: `daily-reminder/${row.user_id}/${nowIso.slice(0, 10)}`,
          tags: [
            { name: "type", value: "daily-reminder" },
            { name: "audience", value: audienceMode },
          ],
          unsubscribeUrl: unsubscribeUrl || undefined,
        });

        const { error: updateError } = await supabase
          .from("app_user_notifications")
          .update({
            last_reminder_sent_at: nowIso,
            last_reminder_email_id: sent.id,
            updated_at: nowIso,
          })
          .eq("user_id", row.user_id);

        if (updateError) {
          // The email went out; the idempotency key blocks a same-day resend.
          console.error("Reminder state update failed:", updateError);
          failedCount += 1;
        } else {
          sentCount += 1;
        }
      } catch (sendError) {
        console.error("Reminder send failed:", sendError);
        failedCount += 1;
      }

      await sleep(SEND_DELAY_MS);
    }

    return jsonResponse({
      ok: true,
      audienceMode,
      rolloutStartedAt: rolloutStartedAt?.toISOString() || null,
      scanned: recipients.length,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("Daily reminder cron failed:", error);
    return jsonResponse({ error: "Daily reminder cron failed." }, 500);
  }
}

export default async function handler(
  requestOrNodeReq: Request | Record<string, unknown>,
  maybeNodeRes?: unknown,
): Promise<Response | void> {
  const request = toWebRequest(requestOrNodeReq);
  const response = await handleRequest(request);

  if (isNodeResponse(maybeNodeRes)) {
    await sendNodeResponse(maybeNodeRes, response);
    return;
  }

  return response;
}
