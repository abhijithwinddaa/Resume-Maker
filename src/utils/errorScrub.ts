/**
 * Strips personal data from error reports before they leave the app.
 *
 * Resumes are full of names, phone numbers, emails and work history, and an
 * error message can quote any of it ("Cannot read 'trim' of …", a failed
 * JSON snippet). Reports keep only what helps fix the bug: error type,
 * stack, route and a scrubbed message.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Digit runs with separators; only those with 9+ digits are phone-like, so
// years, date ranges ("2021 - 2025") and counts survive.
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;
const scrubPhones = (text: string) =>
  text.replace(PHONE_LIKE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number]" : m));
const URL_QUERY = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi;
const BEARER = /\b(Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const MAX_TEXT = 300;

export function scrubText(text: string): string {
  const cleaned = scrubPhones(
    text
      .replace(JWT, "[token]")
      .replace(BEARER, "$1 [token]")
      .replace(EMAIL, "[email]")
      .replace(URL_QUERY, "$1"),
  );
  // Long strings are almost always quoted resume or job-description text.
  return cleaned.length > MAX_TEXT ? `${cleaned.slice(0, MAX_TEXT)}… [truncated]` : cleaned;
}

/** Minimal shape of a Sentry event that this module touches. */
export interface ScrubbableEvent {
  message?: string;
  user?: unknown;
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ category?: string; message?: string; data?: Record<string, unknown> }>;
}

const DROP_BREADCRUMBS = new Set(["console", "ui.input", "ui.click"]);

/** Removes request bodies, user identity and personal text from an event. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubText(event.request.url);
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  // Extra data can hold anything a developer attached; keep only short scalars.
  if (event.extra) {
    for (const [key, value] of Object.entries(event.extra)) {
      if (typeof value === "string") event.extra[key] = scrubText(value);
      else if (typeof value !== "number" && typeof value !== "boolean") delete event.extra[key];
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => !DROP_BREADCRUMBS.has(b.category ?? ""))
      .map((b) => ({
        ...b,
        message: b.message ? scrubText(b.message) : b.message,
        data: b.data?.url ? { url: scrubText(String(b.data.url)), status_code: b.data.status_code } : undefined,
      }));
  }
  return event;
}
