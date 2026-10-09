/**
 * Browser error monitoring (Sentry free tier).
 *
 * Off unless VITE_SENTRY_DSN is set. The SDK is loaded after the page goes
 * idle so it never delays the first paint; errors that happen before then are
 * queued and sent once it loads. Every report passes through scrubEvent, so no
 * resume text, contact details, form input or request bodies leave the app.
 * No session replay and no performance tracing (keeps the free quota for errors).
 */
import { scrubEvent } from "./errorScrub";

type Capture = typeof import("@sentry/react").captureException;
type Context = Record<string, string | number | boolean | undefined>;

const MAX_QUEUE = 10;
const IGNORE_ERRORS = [
  /ResizeObserver loop/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Please sign in to continue/i,
  // Browser extensions and injected scripts we can't fix.
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:/i,
];

let capture: Capture | null = null;
let started = false;
const queue: Array<{ error: unknown; context?: Context }> = [];

const dsn = (): string => (import.meta.env.VITE_SENTRY_DSN as string | undefined) || "";

/** Report a caught error with optional non-personal context (route, component). */
export function reportError(error: unknown, context?: Context): void {
  if (capture) {
    capture(error, { extra: context });
    return;
  }
  if (dsn() && queue.length < MAX_QUEUE) queue.push({ error, context });
}

export function initErrorMonitoring(): void {
  const key = dsn();
  if (!key || started || typeof window === "undefined") return;
  started = true;

  // Catch errors that happen before the SDK has loaded.
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const load = () => {
    // Destructured so the bundler keeps only these exports (no replay/feedback/tracing).
    import("@sentry/react")
      .then(({ init, captureException }) => {
        init({
          dsn: key,
          environment: window.location.hostname === "resume.batturaj.in" ? "production" : "preview",
          release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
          // SDK v11 collects all of these by default; a resume app needs none of them.
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            graphQL: { document: false, variables: false },
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
            stackFrameVariables: false,
          },
          tracesSampleRate: 0,
          ignoreErrors: IGNORE_ERRORS,
          beforeSend: (event) => scrubEvent(event),
          beforeBreadcrumb: (crumb) =>
            crumb.category === "console" || crumb.category?.startsWith("ui.") ? null : crumb,
        });
        capture = captureException;
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        for (const item of queue.splice(0)) captureException(item.error, { extra: item.context });
      })
      .catch(() => {
        // Monitoring must never break the app; a blocked script just means no reports.
      });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 4000 });
  } else {
    setTimeout(load, 2000);
  }
}
