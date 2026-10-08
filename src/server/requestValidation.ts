/**
 * Shared request validation for the AI routes: safe body parsing, string
 * caps, resume-shape checks and a user-safe error mapper. Deliberately has no
 * imports from other server modules so route tests can mock those freely.
 */

export const MAX_JOB_DESCRIPTION_CHARS = 12_000;
export const MAX_BULLET_CHARS = 1_000;
export const MAX_KEYWORD_ITEMS = 100;
export const MAX_KEYWORD_CHARS = 60;
export const MAX_RESUME_TEXT_CHARS = 30_000;
export const MAX_RESUME_JSON_CHARS = 60_000;
export const MAX_ATS_RESULT_JSON_CHARS = 30_000;

/** An error whose message is safe to show to the user as-is. */
export class RequestValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Read the request body as a JSON object. Enforces the byte limit on the
 * actual text too, so a missing Content-Length cannot sneak a huge body past.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: errorResponse("Invalid JSON request body.", 400),
    };
  }

  // UTF-8 is at most 3 bytes per UTF-16 unit; only measure exactly when close.
  if (
    text.length > maxBytes ||
    (text.length * 3 > maxBytes &&
      new TextEncoder().encode(text).length > maxBytes)
  ) {
    return {
      ok: false,
      response: errorResponse(
        "Request body too large. Please reduce input size.",
        413,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: errorResponse("Invalid JSON request body.", 400),
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: errorResponse("Request body must be a JSON object.", 400),
    };
  }

  return { ok: true, body: parsed as Record<string, unknown> };
}

export interface StringOptions {
  /** Shown to the user, e.g. "Job description". Defaults to the key. */
  label?: string;
  /** Message override when the value is over maxLen. */
  tooLongMessage?: string;
  /** Status when over maxLen. */
  tooLongStatus?: number;
}

function tooLong(key: string, maxLen: number, opts?: StringOptions) {
  return new RequestValidationError(
    opts?.tooLongMessage ??
      `${opts?.label ?? key} is too long — please keep it to ${maxLen.toLocaleString("en-US")} characters or fewer.`,
    opts?.tooLongStatus ?? 413,
  );
}

/** Trimmed string, or undefined when absent/empty. Throws on a non-string. */
export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLen: number,
  opts?: StringOptions,
): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new RequestValidationError(
      `${opts?.label ?? key} must be text.`,
      400,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw tooLong(key, maxLen, opts);
  }
  return trimmed || undefined;
}

/** Trimmed non-empty string. Throws if missing, empty, or not a string. */
export function requiredString(
  body: Record<string, unknown>,
  key: string,
  maxLen: number,
  opts?: StringOptions,
): string {
  const value = optionalString(body, key, maxLen, opts);
  if (!value) {
    throw new RequestValidationError(`${opts?.label ?? key} is required.`, 400);
  }
  return value;
}

/** Array of non-empty trimmed strings within the given caps. */
export function stringArray(
  body: Record<string, unknown>,
  key: string,
  maxItems: number,
  maxItemLen: number,
  opts?: { label?: string },
): string[] {
  const label = opts?.label ?? key;
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new RequestValidationError(`${label} must be a list of text.`, 400);
  }
  if (value.length > maxItems) {
    throw new RequestValidationError(
      `${label} has too many items — please send at most ${maxItems}.`,
      413,
    );
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new RequestValidationError(`${label} must contain only text.`, 400);
    }
    const trimmed = item.trim();
    if (trimmed.length > maxItemLen) {
      throw new RequestValidationError(
        `Each item in ${label} must be ${maxItemLen} characters or fewer.`,
        413,
      );
    }
    if (trimmed) out.push(trimmed);
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const ENTRY_ARRAYS = [
  "experience",
  "projects",
  "skills",
  "education",
  "achievements",
  "certificates",
] as const;

/**
 * Structural check that a value is safe to hand to the resume prompt
 * builders: a `contact` object and array sections whose entries are objects
 * (with `bullets`, when present, an array of strings). Missing optional
 * arrays are tolerated; see `normalizeResumeLike`.
 */
export function isResumeLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isRecord(value.contact)) return false;
  for (const key of ENTRY_ARRAYS) {
    const section = value[key];
    if (section === undefined || section === null) continue;
    if (!Array.isArray(section)) return false;
    for (const entry of section) {
      if (key === "achievements" && typeof entry === "string") continue;
      if (!isRecord(entry)) return false;
      if (
        entry.bullets !== undefined &&
        (!Array.isArray(entry.bullets) ||
          entry.bullets.some((b) => typeof b !== "string"))
      ) {
        return false;
      }
    }
  }
  if (value.summary !== undefined && typeof value.summary !== "string") {
    return false;
  }
  return true;
}

/** Fill missing/null section arrays with [] so downstream code can rely on them. */
export function normalizeResumeLike<T>(value: unknown): T {
  const copy: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
  for (const key of ENTRY_ARRAYS) {
    if (!Array.isArray(copy[key])) copy[key] = [];
  }
  return copy as T;
}

/** Validate + normalize a resume object from a request body. Throws on bad input. */
export function readResumeData<T>(
  body: Record<string, unknown>,
  key = "resumeData",
  maxJsonChars = MAX_RESUME_JSON_CHARS,
): T {
  const value = body[key];
  if (value === undefined || value === null) {
    throw new RequestValidationError(`${key} is required.`, 400);
  }
  if (!isResumeLike(value)) {
    throw new RequestValidationError(
      `${key} is not a valid resume. Please reload your resume and try again.`,
      400,
    );
  }
  if (JSON.stringify(value).length > maxJsonChars) {
    throw new RequestValidationError(
      "Your resume is too long to analyze. Please shorten it and try again.",
      413,
    );
  }
  return normalizeResumeLike<T>(value);
}

const SCORE_ITEMS = [
  "keywordMatch",
  "skillsAlignment",
  "experienceRelevance",
  "formatting",
  "impact",
] as const;

/** Shape check for a prior ATS result, as used by the rewrite prompt builders. */
export function isATSResultLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.overallScore !== "number") return false;
  if (!Array.isArray(value.topSuggestions)) return false;
  if (!isRecord(value.breakdown)) return false;
  const breakdown = value.breakdown;
  return SCORE_ITEMS.every((item) => isRecord(breakdown[item]));
}

export function readATSResult<T>(
  body: Record<string, unknown>,
  key = "atsResult",
): T {
  const value = body[key];
  if (value === undefined || value === null) {
    throw new RequestValidationError(`${key} is required.`, 400);
  }
  if (!isATSResultLike(value)) {
    throw new RequestValidationError(`${key} is not a valid ATS result.`, 400);
  }
  if (JSON.stringify(value).length > MAX_ATS_RESULT_JSON_CHARS) {
    throw new RequestValidationError(`${key} is too large.`, 413);
  }
  return value as T;
}

/**
 * Map a thrown value to a response. Only messages known to be user-safe pass
 * through (validation errors, AI-unavailable); anything else is logged and
 * replaced with `fallbackMessage`.
 */
export function safeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  context: string,
): Response {
  if (error instanceof RequestValidationError) {
    return errorResponse(error.message, error.status);
  }
  if (
    error instanceof Error &&
    error.name === "AIUnavailableError" &&
    error.message
  ) {
    return errorResponse(error.message, 500);
  }
  console.error(`[${context}]`, error);
  return errorResponse(fallbackMessage, 500);
}
