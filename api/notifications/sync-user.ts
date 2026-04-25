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

    const { error: updateError } = await supabase
      .from("app_user_notifications")
      .update({
        welcome_email_sent_at: nowIso,
        welcome_email_id: sent.id,
        updated_at: nowIso,
      })
      .eq("user_id", userId);

    if (updateError) {
      return jsonResponse(
        {
          error:
            "Welcome email was sent, but the delivery state could not be saved.",
        },
        500,
      );
    }

    return jsonResponse({
      synced: true,
      welcomeSent: true,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not sync your notification profile.",
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
