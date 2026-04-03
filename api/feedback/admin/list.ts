import type { FeedbackStatus } from "../../../src/types/feedback";
import { requireAdminActor } from "../../../src/server/adminFeedbackAuth";
import { getSupabaseAdminClient } from "../../../src/server/supabaseAdminClient";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, created_at, updated_at";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function parseStatus(value: string | null): FeedbackStatus | "all" {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "all") return "all";
  return "pending";
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
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

  const url = new URL(request.url);
  const status = parseStatus(url.searchParams.get("status"));

  let query = supabase
    .from("app_feedback")
    .select(FEEDBACK_COLUMNS)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ rows: data || [] });
}
