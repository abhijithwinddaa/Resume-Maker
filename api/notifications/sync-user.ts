import { flushServerErrors, reportServerError } from "../../src/server/errorReporting.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import { getMailSiteUrl, sendTransactionalEmail } from "../../src/server/resend.js";
import { getSupabaseAdminClient } from "../../src/server/supabaseAdmin.js";
import { getUserEmailFromPayload } from "../../src/server/requestUser.js";
import { buildWelcomeEmail } from "../../src/server/mailTemplates.js";

interface SyncUserRequest {
  firstName?: string;
}

interface NotificationRow {
  user_id: string;
  user_email: string;
  first_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  welcome_email_sent_at: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeFirstName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const authResult = await authenticateClerkRequest(request);
    if (!authResult.ok) {
      return jsonResponse({ error: authResult.message }, authResult.status);
    }

    const userId = authResult.user.userId;
    const userEmail = getUserEmailFromPayload(authResult.user.payload);
    if (!userEmail) {
      return jsonResponse(
        {
          error:
            "Your auth token does not include an email address. Update the Clerk token template before enabling mail sync.",
        },
        400,
      );
    }

    let body: SyncUserRequest = {};
    try {
      body = (await request.json()) as SyncUserRequest;
    } catch {
      // Treat empty or invalid JSON as an optional payload omission.
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return jsonResponse(
        {
          error:
            "Server mail sync is not configured. Set SUPABASE_SERVICE_ROLE_KEY before enabling notifications.",
        },
        500,
      );
    }

    const nowIso = new Date().toISOString();
    const firstName = normalizeFirstName(body.firstName);

    const upsertPayload = {
      user_id: userId,
      user_email: userEmail,
      last_seen_at: nowIso,
      ...(firstName ? { first_name: firstName } : {}),
    };

    const { error: upsertError } = await supabase
      .from("app_user_notifications")
      .upsert(upsertPayload, { onConflict: "user_id" });

    if (upsertError) {
      return jsonResponse(
        {
          error: "Could not sync your notification profile right now.",
        },
        500,
      );
    }

    const { data: row, error: rowError } = await supabase
      .from("app_user_notifications")
      .select(
        "user_id, user_email, first_name, first_seen_at, last_seen_at, welcome_email_sent_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (rowError || !row) {
      return jsonResponse(
        {
          error: "Could not load your notification profile after sync.",
        },
        500,
      );
    }

    const notificationRow = row as NotificationRow;
    if (notificationRow.welcome_email_sent_at) {
      return jsonResponse({
        synced: true,
        welcomeSent: false,
      });
    }

    // Claim the welcome atomically so concurrent syncs cannot double-send.
    const { data: claimed, error: claimError } = await supabase
      .from("app_user_notifications")
      .update({ welcome_email_sent_at: nowIso, updated_at: nowIso })
      .eq("user_id", userId)
      .is("welcome_email_sent_at", null)
      .select("user_id");

    if (claimError) {
      console.error("Welcome claim failed:", claimError);
      return jsonResponse({ synced: true, welcomeSent: false });
    }

    if (!claimed || claimed.length === 0) {
      return jsonResponse({ synced: true, welcomeSent: false });
    }

    try {
      const email = buildWelcomeEmail({
        firstName: notificationRow.first_name || undefined,
        siteUrl: getMailSiteUrl(),
      });

      const sent = await sendTransactionalEmail({
        to: notificationRow.user_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `welcome-user/${userId}`,
        tags: [
          { name: "type", value: "welcome" },
          { name: "user_id", value: userId.slice(0, 64) },
        ],
      });

      const { error: idError } = await supabase
        .from("app_user_notifications")
        .update({ welcome_email_id: sent.id })
        .eq("user_id", userId);
      if (idError) {
        console.error("Welcome email id save failed:", idError);
      }

      return jsonResponse({ synced: true, welcomeSent: true });
    } catch (sendError) {
      console.error("Welcome email failed:", sendError);
      reportServerError(sendError, "welcome-email");
      // Release the claim so a later page load retries.
      const { error: releaseError } = await supabase
        .from("app_user_notifications")
        .update({ welcome_email_sent_at: null })
        .eq("user_id", userId);
      if (releaseError) {
        console.error("Welcome claim release failed:", releaseError);
      }
      return jsonResponse({ synced: true, welcomeSent: false });
    }
  } catch (error) {
    console.error("Notification sync failed:", error);
    reportServerError(error, "notifications-sync-user");
    return jsonResponse(
      { error: "Could not sync your notification profile." },
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
  await flushServerErrors();

  if (isNodeResponse(maybeNodeRes)) {
    await sendNodeResponse(maybeNodeRes, response);
    return;
  }

  return response;
}
