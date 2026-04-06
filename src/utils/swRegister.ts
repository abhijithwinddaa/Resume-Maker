/* ─── Service Worker Registration ──────────────────────
   Registers the service worker for PWA/offline support.
   Only registers in production.
   ────────────────────────────────────────────────────── */

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.warn("[SW] Registered:", registration.scope);
        })
        .catch((err) => {
          console.warn("[SW] Registration failed:", err);
        });
    });
  }
}
