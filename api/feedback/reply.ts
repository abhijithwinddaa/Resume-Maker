import { isAdminEmail } from "../../src/utils/adminAccess.js";
import { authenticateClerkRequest } from "../../src/server/requestAuth.js";
import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../../src/server/httpAdapter.js";
import { getMailSiteUrl, sendTransactionalEmail } from "../../src/server/resend.js";
import { getSupabaseAdminClient } from "../../src/server/supabaseAdmin.js";
import {
  getUserEmailFromPayload,
} from "../../src/server/requestUser.js";
import { buildFeedbackReplyEmail } from "../../src/server/mailTemplates.js";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, admin_reply, admin_reply_by, admin_reply_at, created_at, updated_at";

interface ReplyFeedbackRequest {
  feedbackId?: string;
  reply?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeReply(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
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

    const adminEmail = getUserEmailFromPayload(authResult.user.payload);
    if (!isAdminEmail(adminEmail)) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    let body: ReplyFeedbackRequest;
    try {
      body = (await request.json()) as ReplyFeedbackRequest;
    } catch {
      return jsonResponse({ error: "Invalid JSON request body." }, 400);
    }

    const feedbackId =
      typeof body.feedbackId === "string" ? body.feedbackId : "";
    const reply = normalizeReply(body.reply);

    if (!feedbackId) {
      return jsonResponse({ error: "feedbackId is required." }, 400);
    }

    if (reply.length < 4 || reply.length > 1200) {
      return jsonResponse(
        {
          error: "Reply must be between 4 and 1200 characters.",
        },
        400,
      );
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return jsonResponse(
        {
          error:
            "Server feedback reply is not configured. Set SUPABASE_SERVICE_ROLE_KEY before enabling replies.",
        },
        500,
      );
    }

    const { data: existingRow, error: existingError } = await supabase
      .from("app_feedback")
      .select("id, user_id, user_email")
      .eq("id", feedbackId)
      .maybeSingle();

    if (existingError || !existingRow) {
      return jsonResponse({ error: "Feedback comment not found." }, 404);
    }

    const { data: notificationRow } = await supabase
      .from("app_user_notifications")
      .select("first_name")
      .eq("user_id", existingRow.user_id)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const payload = {
      admin_reply: reply,
      admin_reply_by: adminEmail,
      admin_reply_at: nowIso,
      updated_at: nowIso,
    };

    const { data: updatedRow, error: updateError } = await supabase
      .from("app_feedback")
      .update(payload)
      .eq("id", feedbackId)
      .select(FEEDBACK_COLUMNS)
      .single();

    if (updateError) {
      return jsonResponse({ error: "Could not save the admin reply." }, 500);
    }

    const email = buildFeedbackReplyEmail({
      firstName:
        (notificationRow?.first_name as string | null | undefined) || undefined,
      siteUrl: getMailSiteUrl(),
      reply,
    });

    const sent = await sendTransactionalEmail({
      to: existingRow.user_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `feedback-reply/${feedbackId}/${hashString(reply.toLowerCase())}`,
      tags: [
        { name: "type", value: "feedback-reply" },
        {
          name: "feedback_id",
          value: feedbackId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64),
        },
      ],
    });

    await supabase
      .from("app_feedback")
      .update({
        admin_reply_emailed_at: nowIso,
        admin_reply_email_id: sent.id,
        updated_at: nowIso,
      })
      .eq("id", feedbackId);

    return jsonResponse({
      feedback: updatedRow,
      emailed: true,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send the admin reply.",
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
