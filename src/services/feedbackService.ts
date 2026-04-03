import { supabase } from "../lib/supabase";
import type { FeedbackRow, FeedbackUpsertInput } from "../types/feedback";

const FEEDBACK_TABLE = "app_feedback";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, created_at, updated_at";

export interface FeedbackSubmissionCheckResult {
  hasSubmitted: boolean;
  hadError: boolean;
}

function isPolicyMismatchError(
  error: {
    message?: string;
    details?: string;
    hint?: string;
  } | null,
): boolean {
  if (!error) return false;
  const combined =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return (
    combined.includes("row-level security") ||
    combined.includes("violates policy") ||
    combined.includes("violates row-level security policy")
  );
}

export async function loadPublicFeedback(limit = 30): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .eq("is_public", true)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error loading public feedback:", error);
    return [];
  }

  return (data || []) as FeedbackRow[];
}

export async function loadMyFeedback(
  userId: string,
): Promise<FeedbackRow | null> {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error loading user feedback:", error);
    return null;
  }

  return (data as FeedbackRow) || null;
}

export async function upsertMyFeedback(
  input: FeedbackUpsertInput,
): Promise<FeedbackRow | null> {
  const basePayload = {
    user_id: input.userId,
    user_email: input.userEmail,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    comment: input.comment.trim(),
    is_public: input.isPublic,
    admin_notes: null,
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  };

  const primaryPayload = {
    ...basePayload,
    status: "approved" as const,
  };

  let { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .upsert(primaryPayload, { onConflict: "user_id" })
    .select(FEEDBACK_COLUMNS)
    .single();

  // Backward-compatible fallback for projects still running the older
  // policy that only allows status='pending' on insert/update.
  if (error && isPolicyMismatchError(error)) {
    const legacyPayload = {
      ...basePayload,
      status: "pending" as const,
    };

    const retryResult = await supabase
      .from(FEEDBACK_TABLE)
      .upsert(legacyPayload, { onConflict: "user_id" })
      .select(FEEDBACK_COLUMNS)
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    console.error("Error submitting feedback:", error);
    return null;
  }

  return data as FeedbackRow;
}

export async function loadAdminFeedbackForRemoval(
  limit = 120,
): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .eq("is_public", true)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error loading admin feedback list:", error);
    return [];
  }

  return (data || []) as FeedbackRow[];
}

export async function checkUserHasSubmittedFeedback(
  userId: string,
): Promise<FeedbackSubmissionCheckResult> {
  const { count, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("Error checking feedback submission status:", error);
    return {
      hasSubmitted: false,
      hadError: true,
    };
  }

  return {
    hasSubmitted: Number(count || 0) > 0,
    hadError: false,
  };
}

export async function moderateFeedback(
  feedbackId: string,
  adminEmail: string,
): Promise<FeedbackRow | null> {
  const payload = {
    status: "rejected" as const,
    is_public: false,
    admin_notes: "Removed by admin",
    approved_by: adminEmail.toLowerCase(),
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .update(payload)
    .eq("id", feedbackId)
    .select(FEEDBACK_COLUMNS)
    .single();

  if (error) {
    console.error("Error moderating feedback:", error);
    return null;
  }

  return data as FeedbackRow;
}
