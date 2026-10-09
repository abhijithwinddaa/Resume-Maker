/**
 * Server error reports to Sentry, sent with one fetch to its envelope API
 * (no SDK: nothing to initialise on cold starts).
 *
 * Off unless SENTRY_DSN is set. Reports are scrubbed by the same rules as the
 * browser (no resume text, contact details or request bodies). Vercel freezes a
 * function once it has responded, so routes `await flushServerErrors()` before
 * returning; that waits at most ~2 s and never throws.
 */
import { randomUUID } from "node:crypto";
import { scrubEvent } from "../utils/errorScrub.js";

interface Dsn {
  endpoint: string;
  publicKey: string;
  raw: string;
}

export function parseDsn(value: string | undefined): Dsn | null {
  const m = /^https:\/\/([0-9a-f]+)@([^/\s]+)\/(\d+)$/i.exec((value ?? "").trim());
  if (!m) return null;
  return { endpoint: `https://${m[2]}/api/${m[3]}/envelope/`, publicKey: m[1], raw: value!.trim() };
}

interface Frame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}

/** V8 stack lines → Sentry frames (oldest call first), paths trimmed to the project. */
export function parseStack(stack: string | undefined): Frame[] {
  const frames: Frame[] = [];
  for (const line of (stack ?? "").split("\n").slice(1, 30)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const file = m[2].replace(/\\/g, "/").replace(/^.*?\/((?:api|src|node_modules)\/)/, "$1");
    frames.push({
      function: m[1] || "<anonymous>",
      filename: file,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !file.includes("node_modules"),
    });
  }
  return frames.reverse();
}

const pending = new Set<Promise<void>>();

/** Queue a report for an unexpected server error. Never throws. */
export function reportServerError(error: unknown, context: string): void {
  try {
    const dsn = parseDsn(process.env.SENTRY_DSN);
    if (!dsn) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const eventId = randomUUID().replace(/-/g, "");
    const event = scrubEvent({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV || "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      transaction: context,
      tags: { route: context },
      exception: {
        values: [{ type: err.name || "Error", value: err.message, stacktrace: { frames: parseStack(err.stack) } }],
      },
    });
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsn.raw }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    const send = fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=resume-maker-server/1.0`,
      },
      body,
      signal: AbortSignal.timeout(2000),
    }).then(
      () => undefined,
      () => undefined,
    );
    pending.add(send);
    void send.finally(() => pending.delete(send));
  } catch {
    // Reporting must never turn into a second error.
  }
}

/** Wait for queued reports before the function is frozen. */
export async function flushServerErrors(): Promise<void> {
  if (pending.size) await Promise.allSettled([...pending]);
}
