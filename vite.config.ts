import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiDevServer } from "./vite.apiDev";

export default defineConfig(({ mode }) => {
  // The local API handlers read secrets from process.env, as on Vercel. Fill
  // it from .env files without overriding anything the shell already set.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    plugins: [react(), apiDevServer()],
    build: {
      /* ── Production optimizations ─────────────────── */
      sourcemap: false,
      cssCodeSplit: true,
      target: "es2022",
      minify: "esbuild",
      /* ── Vendor Chunk Splitting ────────────────────── */
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          app: resolve(__dirname, "app/index.html"),
        },
        output: {
          manualChunks(id) {
            // Third-party vendor splits
            if (id.includes("node_modules/pdfjs-dist")) return "vendor-pdf";
            if (id.includes("node_modules/tesseract.js")) return "vendor-ocr";
            if (id.includes("node_modules/lucide-react")) return "vendor-icons";
            if (
              id.includes("node_modules/@clerk") ||
              id.includes("node_modules/@supabase") ||
              id.includes("node_modules/i18next") ||
              id.includes("node_modules/react-i18next")
            )
              return "vendor-services";
            if (
              id.includes("node_modules/zustand") ||
              id.includes("node_modules/zod")
            )
              return "vendor-core";
            if (id.includes("node_modules/@dnd-kit")) return "vendor-dnd";
            if (id.includes("node_modules/docx")) return "vendor-docx";
            // App code splits — heavy modules only loaded when needed
            if (id.includes("src/utils/aiService")) return "app-ai";
            if (
              id.includes("src/utils/pdfExtractor") ||
              id.includes("src/utils/pdfOcr") ||
              id.includes("src/utils/templateDetector")
            )
              return "app-pdf-utils";
          },
        },
      },
      /* Raise threshold since vendor chunks are cache-friendly */
      chunkSizeWarningLimit: 600,
    },
  };
});
