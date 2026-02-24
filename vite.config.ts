import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    /* ── Vendor Chunk Splitting ────────────────────── */
    rollupOptions: {
      output: {
        manualChunks: {
          // PDF parsing (largest dep)
          "vendor-pdf": ["pdfjs-dist"],
          // Icons
          "vendor-icons": ["lucide-react"],
          // Auth + DB
          "vendor-services": [
            "@clerk/clerk-react",
            "@supabase/supabase-js",
          ],
        },
      },
    },
    /* Raise threshold since vendor chunks are cache-friendly */
    chunkSizeWarningLimit: 600,
  },
});

