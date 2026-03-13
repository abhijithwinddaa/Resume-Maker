type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    posthog?: {
      init?: (...args: unknown[]) => void;
      capture?: (event: string, properties?: AnalyticsProps) => void;
      identify?: (id: string, properties?: AnalyticsProps) => void;
      register?: (properties: AnalyticsProps) => void;
    };
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const SITE_URL = import.meta.env.VITE_SITE_URL || "https://resume.batturaj.in";

let analyticsInitialized = false;

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function initGoogleAnalytics(): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;

  void loadScript(
    `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
    "ga4-script",
  )
    .then(() => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = (...args: unknown[]) => {
        window.dataLayer?.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_MEASUREMENT_ID, {
        anonymize_ip: true,
        send_page_view: false,
      });
    })
    .catch((err) => {
      console.warn("[Analytics] GA4 init failed:", err);
    });
}

function initClarity(): void {
  if (!CLARITY_PROJECT_ID || typeof window === "undefined") return;
  if (window.clarity) return;

  ((
    c: Window & typeof globalThis,
    l: Document,
    a: string,
    r: string,
    i: string,
  ) => {
    c[a as "clarity"] =
      c[a as "clarity"] ||
      ((...args: unknown[]) => {
        ((c[a as "clarity"] as unknown as { q?: unknown[][] }).q =
          (c[a as "clarity"] as unknown as { q?: unknown[][] }).q || []).push(
          args,
        );
      });
    const script = l.createElement(r);
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${i}`;
    const firstScript = l.getElementsByTagName(r)[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  })(window, document, "clarity", "script", CLARITY_PROJECT_ID);
}

function initPostHog(): void {
  if (!POSTHOG_KEY || typeof window === "undefined") return;

  void loadScript(`${POSTHOG_HOST}/static/array.js`, "posthog-script")
    .then(() => {
      window.posthog?.init?.(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: false,
        capture_pageleave: true,
      });
    })
    .catch((err) => {
      console.warn("[Analytics] PostHog init failed:", err);
    });
}

export function initAnalytics(): void {
  if (analyticsInitialized || !import.meta.env.PROD) return;
  analyticsInitialized = true;
  initGoogleAnalytics();
  initClarity();
  initPostHog();
}

export function trackPageView(path: string, title?: string): void {
  if (typeof window === "undefined") return;

  const pageTitle = title || document.title;
  window.gtag?.("event", "page_view", {
    page_location: `${SITE_URL}${path}`,
    page_path: path,
    page_title: pageTitle,
  });
  window.posthog?.capture?.("page_view", {
    page_path: path,
    page_title: pageTitle,
  });
}

export function trackEvent(
  name: string,
  properties: AnalyticsProps = {},
): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, properties);
  window.clarity?.("event", name);
  window.posthog?.capture?.(name, properties);
}

export function identifyAnalyticsUser(
  id: string,
  properties: AnalyticsProps = {},
): void {
  if (typeof window === "undefined") return;
  window.gtag?.("set", "user_properties", properties);
  window.posthog?.identify?.(id, properties);
  window.posthog?.register?.({ user_id: id, ...properties });
}
