import { requireAdminActor } from "../../../src/server/adminFeedbackAuth";
import { getSupabaseAdminClient } from "../../../src/server/supabaseAdminClient";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, created_at, updated_at";

type ModerationStatus = "approved" | "rejected";

interface ModerateRequestBody {
  feedbackId?: string;
  status?: ModerationStatus;
  adminNotes?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const auth = await requireAdminActor(request);
  if (auth.response) {
    return auth.response;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return jsonResponse(
      { error: "Server is missing Supabase service role configuration." },
      500,
    );
  }

  let body: ModerateRequestBody;
  try {
    body = (await request.json()) as ModerateRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  if (!body.feedbackId || typeof body.feedbackId !== "string") {
    return jsonResponse({ error: "feedbackId is required." }, 400);
  }

  if (body.status !== "approved" && body.status !== "rejected") {
    return jsonResponse({ error: "status must be approved or rejected." }, 400);
  }

  const payload = {
    status: body.status,
    admin_notes: body.adminNotes?.trim() || null,
    approved_by: auth.actor?.email || null,
    approved_at: body.status === "approved" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("app_feedback")
    .update(payload)
    .eq("id", body.feedbackId)
    .select(FEEDBACK_COLUMNS)
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ row: data });
}
