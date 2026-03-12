import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    /* ── Production optimizations ─────────────────── */
    sourcemap: false,
    cssCodeSplit: true,
    target: "es2022",
    minify: "esbuild",
    /* ── Vendor Chunk Splitting ────────────────────── */
    rollupOptions: {
      output: {
        manualChunks: {
          // PDF parsing (largest dep)
          "vendor-pdf": ["pdfjs-dist"],
          // PDF export (html2canvas + pdf-lib, lazy-loaded)
          "vendor-pdf-export": ["html2canvas-pro", "pdf-lib"],
          // Icons
          "vendor-icons": ["lucide-react"],
          // Auth + DB + i18n
          "vendor-services": ["@clerk/clerk-react", "@supabase/supabase-js", "i18next", "react-i18next"],
          // State + validation
          "vendor-core": ["zustand", "zod"],
          // DnD
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
    /* Raise threshold since vendor chunks are cache-friendly */
    chunkSizeWarningLimit: 600,
  },
});
