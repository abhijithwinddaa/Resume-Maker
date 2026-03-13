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

// Defer performance monitoring to idle time
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(() => initPerformanceMonitoring());
} else {
  setTimeout(initPerformanceMonitoring, 2000);
}
