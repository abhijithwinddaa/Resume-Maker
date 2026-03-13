/* ─── Performance Monitoring ──────────────────────────
   Tracks Core Web Vitals and custom metrics.
   Logs to console in development only.
   Can be extended to send to an analytics endpoint.
   ────────────────────────────────────────────────────── */

import { trackEvent } from "./analytics";

interface PerformanceMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
}

const metrics: PerformanceMetric[] = [];

function rateMetric(
  _name: string,
  value: number,
  good: number,
  poor: number,
): PerformanceMetric["rating"] {
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function recordMetric(metric: PerformanceMetric) {
  metrics.push(metric);

  if (import.meta.env.PROD) {
    trackEvent("web_vital_recorded", {
      metric_name: metric.name,
      metric_value: Number(metric.value.toFixed(2)),
      metric_rating: metric.rating,
    });
  }

  if (import.meta.env.DEV) {
    const color =
      metric.rating === "good"
        ? "#22c55e"
        : metric.rating === "needs-improvement"
          ? "#f59e0b"
          : "#ef4444";
    console.log(
      `%c[Perf] ${metric.name}: ${metric.value.toFixed(1)}ms (${metric.rating})`,
      `color: ${color}; font-weight: bold`,
    );
  }
}

/**
 * Measure Largest Contentful Paint (LCP).
 */
function observeLCP() {
  if (!("PerformanceObserver" in window)) return;

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) {
      recordMetric({
        name: "LCP",
        value: last.startTime,
        rating: rateMetric("LCP", last.startTime, 2500, 4000),
        timestamp: Date.now(),
      });
    }
  });

  try {
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* not supported */
  }
}

/**
 * Measure First Input Delay (FID).
 */
function observeFID() {
  if (!("PerformanceObserver" in window)) return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const fid =
        (entry as PerformanceEventTiming).processingStart - entry.startTime;
      recordMetric({
        name: "FID",
        value: fid,
        rating: rateMetric("FID", fid, 100, 300),
        timestamp: Date.now(),
      });
    }
  });

  try {
    observer.observe({ type: "first-input", buffered: true });
  } catch {
    /* not supported */
  }
}

/**
 * Measure Cumulative Layout Shift (CLS).
 */
function observeCLS() {
  if (!("PerformanceObserver" in window)) return;

  let clsValue = 0;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const layoutShift = entry as PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      };
      if (!layoutShift.hadRecentInput && layoutShift.value) {
        clsValue += layoutShift.value;
      }
    }
  });

  try {
    observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* not supported */
  }

  // Report aggregate CLS on page hide
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      recordMetric({
        name: "CLS",
        value: clsValue * 1000, // Scale for readability
        rating: rateMetric("CLS", clsValue, 0.1, 0.25),
        timestamp: Date.now(),
      });
    }
  });
}

/**
 * Measure navigation timing.
 */
function measureNavigation() {
  if (!("performance" in window) || !performance.getEntriesByType) return;

  window.addEventListener("load", () => {
    setTimeout(() => {
      const [nav] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      if (!nav) return;

      recordMetric({
        name: "TTFB",
        value: nav.responseStart - nav.requestStart,
        rating: rateMetric(
          "TTFB",
          nav.responseStart - nav.requestStart,
          200,
          600,
        ),
        timestamp: Date.now(),
      });

      recordMetric({
        name: "DOM Interactive",
        value: nav.domInteractive - nav.fetchStart,
        rating: rateMetric(
          "DOM Interactive",
          nav.domInteractive - nav.fetchStart,
          1500,
          3500,
        ),
        timestamp: Date.now(),
      });

      recordMetric({
        name: "Page Load",
        value: nav.loadEventEnd - nav.fetchStart,
        rating: rateMetric(
          "Page Load",
          nav.loadEventEnd - nav.fetchStart,
          2500,
          5000,
        ),
        timestamp: Date.now(),
      });
    }, 0);
  });
}

/**
 * Initialize all performance monitoring.
 * Call once at app startup.
 */
export function initPerformanceMonitoring(): void {
  observeLCP();
  observeFID();
  observeCLS();
  measureNavigation();
}

/**
 * Get all collected metrics.
 */
export function getPerformanceMetrics(): PerformanceMetric[] {
  return [...metrics];
}
