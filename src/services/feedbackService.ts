import { supabase } from "../lib/supabase";
import type {
  FeedbackRow,
  FeedbackStatus,
  FeedbackUpsertInput,
} from "../types/feedback";

const FEEDBACK_TABLE = "app_feedback";

const FEEDBACK_COLUMNS =
  "id, user_id, user_email, rating, comment, is_public, status, admin_notes, approved_by, approved_at, created_at, updated_at";

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
  let query = supabase
    .from(FEEDBACK_TABLE)
    .select(FEEDBACK_COLUMNS)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error loading admin feedback queue:", error);
    return [];
  }

  return (data || []) as FeedbackRow[];
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
