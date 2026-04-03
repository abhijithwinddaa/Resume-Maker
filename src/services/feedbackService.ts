import { supabase } from "../lib/supabase";
import type {
  FeedbackRow,
  FeedbackStatus,
  FeedbackUpsertInput,
} from "../types/feedback";

const FEEDBACK_TABLE = "app_feedback";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, created_at, updated_at";

export interface AdminFeedbackResult {
  rows: FeedbackRow[];
  error: string | null;
}

export interface FeedbackSubmissionCheckResult {
  hasSubmitted: boolean;
  hadError: boolean;
}

export async function loadPublicFeedback(limit = 30): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .eq("status", "approved")
    .eq("is_public", true)
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
  const payload = {
    user_id: input.userId,
    user_email: input.userEmail,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    comment: input.comment.trim(),
    is_public: input.isPublic,
    status: "pending" as FeedbackStatus,
    admin_notes: null,
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select(FEEDBACK_COLUMNS)
    .single();

  if (error) {
    console.error("Error submitting feedback:", error);
    return null;
  }

  return data as FeedbackRow;
}

export async function loadAdminFeedback(
  status: FeedbackStatus | "all" = "pending",
): Promise<FeedbackRow[]> {
  const result = await loadAdminFeedbackWithStatus(status);
  return result.rows;
}

export async function loadAdminFeedbackWithStatus(
  status: FeedbackStatus | "all" = "pending",
): Promise<AdminFeedbackResult> {
  let query = supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    const message = error.message || "Unknown admin feedback error";
    console.error("Error loading admin feedback queue:", error);
    return {
      rows: [],
      error: message,
    };
  }

  return {
    rows: (data || []) as FeedbackRow[],
    error: null,
  };
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
  status: "approved" | "rejected",
  adminEmail: string,
  adminNotes?: string,
): Promise<FeedbackRow | null> {
  const notes = adminNotes?.trim() || null;
  const payload = {
    status,
    admin_notes: notes,
    approved_by: adminEmail.toLowerCase(),
    approved_at: status === "approved" ? new Date().toISOString() : null,
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
