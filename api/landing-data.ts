import {
  isNodeResponse,
  sendNodeResponse,
  toWebRequest,
} from "../src/server/httpAdapter.js";
import type {
  LandingData,
  LandingRating,
  LandingReview,
  LandingStats,
} from "../src/landing/types.js";

const OK_CACHE = "public, s-maxage=300, stale-while-revalidate=86400";
const FAIL_CACHE = "public, s-maxage=60";
const MAX_REVIEWS = 6;
const MIN_LEN = 30;
const MAX_LEN = 400;
const FETCH_TIMEOUT_MS = 4000;

// Feature requests and complaints do not belong in a testimonial grid.
const REQUEST_OR_COMPLAINT =
  /\b(please|pls|plz|can you|could you|enable|add|option|bug|issue|error|not working)\b|\?/i;

type Row = Record<string, unknown>;
type Config = { url: string; key: string };

function jsonResponse(body: unknown, status = 200, cache?: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cache) headers["Cache-Control"] = cache;
  return new Response(JSON.stringify(body), { status, headers });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ts(v: string): number {
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

/** Explicit whitelist mapper: nothing but these fields can reach the client. */
function toReview(r: Row): LandingReview {
  const review: LandingReview = {
    id: str(r.id),
    rating: num(r.rating),
    comment: str(r.comment).trim(),
    createdAt: str(r.created_at),
  };
  const reply = str(r.admin_reply).trim();
  if (reply) review.reply = reply.slice(0, MAX_LEN);
  return review;
}

export function curateReviews(rows: Row[]): LandingReview[] {
  return rows
    .map(toReview)
    .filter(
      (r) =>
        r.rating >= 4 &&
        r.comment.length >= MIN_LEN &&
        r.comment.length <= MAX_LEN &&
        !REQUEST_OR_COMPLAINT.test(r.comment),
    )
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.comment.length - a.comment.length ||
        ts(b.createdAt) - ts(a.createdAt),
    )
    .slice(0, MAX_REVIEWS);
}

export function summarizeRating(rows: Row[]): LandingRating | null {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const rating = Math.round(num(r.rating));
    if (rating < 1 || rating > 5) continue;
    distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
    sum += rating;
    count += 1;
  }
  if (count === 0) return null;
  return { average: round1(sum / count), count, distribution };
}

export function mapStats(rows: Row[]): LandingStats | null {
  if (rows.length === 0) return null;
  const byKey = new Map<string, Row>();
  for (const r of rows) byKey.set(str(r.feature_key), r);
  const total = (k: string) => num(byKey.get(k)?.total_count);
  return {
    downloads: total("resume_download"),
    editSessions: total("resume_edit"),
    atsScorings: total("ats_resume_edit"),
    resumesCreated: total("create_resume"),
    downloadUsers: num(byKey.get("resume_download")?.unique_users),
  };
}

export function buildLandingData(
  feedbackRows: Row[] | null,
  counterRows: Row[] | null,
): LandingData {
  return {
    generatedAt: new Date().toISOString(),
    rating: feedbackRows ? summarizeRating(feedbackRows) : null,
    reviews: feedbackRows ? curateReviews(feedbackRows) : [],
    stats: counterRows ? mapStats(counterRows) : null,
  };
}

function supabaseConfig(): Config | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseFetch(
  cfg: Config,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function loadFeedback(cfg: Config): Promise<Row[] | null> {
  const rpc = await supabaseFetch(cfg, "rpc/get_public_feedback", {
    method: "POST",
    body: JSON.stringify({ p_limit: 100 }),
  });
  if (rpc.ok) {
    const body = await rpc.json();
    return Array.isArray(body) ? (body as Row[]) : null;
  }

  let code = "";
  try {
    code = str(((await rpc.json()) as Row)?.code);
  } catch {
    // non-JSON error body
  }
  if (rpc.status !== 404 && code !== "PGRST202") return null;

  // Migration not run yet: query only display-safe columns.
  const table = await supabaseFetch(
    cfg,
    "app_feedback?select=id,rating,comment,created_at,admin_reply&is_public=eq.true&status=neq.rejected&order=created_at.desc&limit=100",
  );
  if (!table.ok) return null;
  const body = await table.json();
  return Array.isArray(body) ? (body as Row[]) : null;
}

async function loadCounters(cfg: Config): Promise<Row[] | null> {
  const res = await supabaseFetch(
    cfg,
    "app_popularity_counters?select=feature_key,total_count,unique_users",
  );
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) ? (body as Row[]) : null;
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const cfg = supabaseConfig();
  let feedback: Row[] | null = null;
  let counters: Row[] | null = null;
  if (cfg) {
    [feedback, counters] = await Promise.all([
      loadFeedback(cfg).catch(() => null),
      loadCounters(cfg).catch(() => null),
    ]);
  }

  const failed = feedback === null || counters === null;
  return jsonResponse(
    buildLandingData(feedback, counters),
    200,
    failed ? FAIL_CACHE : OK_CACHE,
  );
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
