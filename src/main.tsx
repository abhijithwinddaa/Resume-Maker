import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { initAnalytics, trackPageView } from "./utils/analytics";
import { registerServiceWorker } from "./utils/swRegister";
import { initPerformanceMonitoring } from "./utils/performanceMonitor";
import "./i18n";
import "./index.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const PRELOAD_RECOVERY_KEY = "resume-maker-preload-recovered";

// Recover automatically when a deployment invalidates lazy-loaded chunk URLs.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  try {
    if (!sessionStorage.getItem(PRELOAD_RECOVERY_KEY)) {
      sessionStorage.setItem(PRELOAD_RECOVERY_KEY, "1");
      window.location.reload();
      return;
    }

    sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
  } catch {
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ClerkProvider publishableKey={CLERK_KEY}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ClerkProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register service worker for PWA/offline caching (production only)
registerServiceWorker();

// Initialize traffic and product analytics in production.
initAnalytics();
trackPageView(window.location.pathname);

// Clear recovery marker after a successful boot so future deploys can recover once.
try {
  sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
} catch {
  // ignore storage restrictions
}

// Defer performance monitoring to idle time
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(() => initPerformanceMonitoring());
} else {
  setTimeout(initPerformanceMonitoring, 2000);
}
