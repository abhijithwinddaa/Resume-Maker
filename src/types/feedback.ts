export type FeedbackStatus = "pending" | "approved" | "rejected";

export type PopularityMetricKey =
  | "ats_resume_edit"
  | "resume_edit"
  | "create_resume"
  | "resume_download";

export interface FeedbackRow {
  id: string;
  user_id: string;
  user_email: string;
  rating: number;
  comment: string;
  is_public: boolean;
  status: FeedbackStatus;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackUpsertInput {
  userId: string;
  userEmail: string;
  rating: number;
  comment: string;
  isPublic: boolean;
}

export interface FeedbackSummary {
  averageRating: number;
  totalRatings: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface PopularityCounterRow {
  feature_key: PopularityMetricKey;
  total_count: number;
  unique_users: number;
  updated_at: string;
}

export interface PopularityMetricValue {
  totalCount: number;
  uniqueUsers: number;
}

export interface PopularitySnapshot {
  ats_resume_edit: PopularityMetricValue;
  resume_edit: PopularityMetricValue;
  create_resume: PopularityMetricValue;
  resume_download: PopularityMetricValue;
  updatedAt: string | null;
}

function emptyPopularityMetric(): PopularityMetricValue {
  return {
    totalCount: 0,
    uniqueUsers: 0,
  };
}

export function emptyPopularitySnapshot(): PopularitySnapshot {
  return {
    ats_resume_edit: emptyPopularityMetric(),
    resume_edit: emptyPopularityMetric(),
    create_resume: emptyPopularityMetric(),
    resume_download: emptyPopularityMetric(),
    updatedAt: null,
  };
}

export function buildFeedbackSummary(rows: FeedbackRow[]): FeedbackSummary {
  const distribution: FeedbackSummary["distribution"] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  if (rows.length === 0) {
    return {
      averageRating: 0,
      totalRatings: 0,
      distribution,
    };
  }

  let total = 0;
  for (const row of rows) {
    const rating = Math.min(5, Math.max(1, Math.round(row.rating))) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    distribution[rating] += 1;
    total += rating;
  }

  return {
    averageRating: Number((total / rows.length).toFixed(1)),
    totalRatings: rows.length,
    distribution,
  };
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const parts = trimmed.split("@");
  if (parts.length !== 2) return "anonymous";

  const [name, domain] = parts;
  if (name.length <= 2) {
    return `${name[0] || "u"}*@${domain}`;
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

export function buildPopularitySnapshot(
  rows: PopularityCounterRow[],
): PopularitySnapshot {
  const snapshot = emptyPopularitySnapshot();

  for (const row of rows) {
    snapshot[row.feature_key] = {
      totalCount: Number(row.total_count || 0),
      uniqueUsers: Number(row.unique_users || 0),
    };

    if (!snapshot.updatedAt || row.updated_at > snapshot.updatedAt) {
      snapshot.updatedAt = row.updated_at;
    }
  }

  return snapshot;
}
