/* ─── Error Boundary ───────────────────────────────────
   Catches render errors in child components and shows
   a fallback UI instead of crashing the whole app.
   ────────────────────────────────────────────────────── */

import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const DYNAMIC_IMPORT_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i;
const RETRY_RELOAD_KEY = "resume-maker-retry-reloaded";

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    const message = this.state.error?.message || "";
    if (DYNAMIC_IMPORT_ERROR_PATTERN.test(message)) {
      try {
        if (!sessionStorage.getItem(RETRY_RELOAD_KEY)) {
          sessionStorage.setItem(RETRY_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }

        sessionStorage.removeItem(RETRY_RELOAD_KEY);
      } catch {
        window.location.reload();
        return;
      }
    }

    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return React.createElement(
        "div",
        { className: "error-boundary" },
        React.createElement(
          "div",
          { className: "error-boundary-content" },
          React.createElement(
            "svg",
            {
              width: 48,
              height: 48,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "#ef4444",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            },
            React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
            React.createElement("line", {
              x1: 12,
              y1: 8,
              x2: 12,
              y2: 12,
            }),
            React.createElement("line", {
              x1: 12,
              y1: 16,
              x2: 12.01,
              y2: 16,
            }),
          ),
          React.createElement("h3", null, "Something went wrong"),
          React.createElement(
            "p",
            { className: "error-boundary-message" },
            this.state.error?.message || "An unexpected error occurred.",
          ),
          React.createElement(
            "button",
            {
              className: "error-boundary-retry",
              onClick: this.handleRetry,
            },
            "Try Again",
          ),
        ),
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
