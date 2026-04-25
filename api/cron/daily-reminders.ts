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

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
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
    const audienceMode = resolveReminderAudienceMode(now, {
      rolloutStartedAt,
      warmupDays,
      recentActivityHours,
    });

    const { data, error } = await supabase
      .from("app_user_notifications")
      .select(
        "user_id, user_email, first_name, last_seen_at, last_reminder_sent_at, reminder_enabled",
      )
      .eq("reminder_enabled", true)
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

    for (const row of recipients) {
      const eligible = shouldSendReminder(row, now, {
        rolloutStartedAt,
        warmupDays,
        recentActivityHours,
      });

      if (!eligible) {
        skippedCount += 1;
        continue;
      }

      const email = buildReminderEmail({
        firstName: row.first_name || undefined,
        siteUrl,
        audienceMode,
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
      });

      await supabase
        .from("app_user_notifications")
        .update({
          last_reminder_sent_at: nowIso,
          last_reminder_email_id: sent.id,
          updated_at: nowIso,
        })
        .eq("user_id", row.user_id);

      sentCount += 1;
    }

    return jsonResponse({
      ok: true,
      audienceMode,
      rolloutStartedAt: rolloutStartedAt?.toISOString() || null,
      scanned: recipients.length,
      sent: sentCount,
      skipped: skippedCount,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily reminder cron failed.",
      },
      500,
    );
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
