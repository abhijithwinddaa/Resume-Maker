# Resume Maker

AI-powered resume builder, ATS scorer, optimizer, and editor built with React, Clerk, and Supabase.

## Highlights

- Upload a PDF resume, extract text, and fall back to OCR for image-based files.
- Parse resumes into structured sections with AI.
- Run ATS scoring against a target job description or run a self-score without a JD.
- Auto-optimize resume content in iterative loops.
- Edit with live preview, section ordering, template customization, and export to PDF or DOCX.
- Manage multiple saved resumes instead of a single profile.
- Generate cover letters from the current resume + JD context.
- Control local privacy settings for PDF metadata export, local backups, and AI response caching.

## Stack

- React 19
- TypeScript 5.9
- Vite 7
- Clerk for auth
- Supabase for persistence
- GitHub Models with Gemini fallback
- `pdfjs-dist`, `tesseract.js`, `html2canvas-pro`, `pdf-lib`, `docx`

## Environment

Create a `.env` file in the project root:

```env
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required for Clerk + Supabase RLS policies (including admin feedback moderation).
# The template should include an email claim.
VITE_CLERK_SUPABASE_TEMPLATE=supabase

# Server-side AI for ATS analyze + optimize
GITHUB_TOKEN=github_pat_server_token_1
GITHUB_TOKENS=github_pat_server_token_1,github_pat_server_token_2
GEMINI_API_KEY=your_server_google_ai_studio_key
GROQ_API_KEY=your_server_groq_key_optional
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Client-side AI for parsing / template detection / cover letters
VITE_GITHUB_TOKEN=github_pat_your_token_1
VITE_GITHUB_TOKEN_2=github_pat_your_token_2
VITE_GEMINI_API_KEY=your_google_ai_studio_key
VITE_GROQ_API_KEY=your_groq_key_optional

# Site URL / analytics
VITE_SITE_URL=https://resume.batturaj.in
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_POSTHOG_KEY=phc_your_posthog_project_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

## Install

```bash
npm install
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. Configure Clerk as a third-party auth provider for Supabase.
3. Run [`supabase-schema.sql`](./supabase-schema.sql).
4. For existing projects, run [`supabase-rls-migration.sql`](./supabase-rls-migration.sql).
5. Run [`supabase-ai-cache-migration.sql`](./supabase-ai-cache-migration.sql) to enable server-side ATS and optimize caching.
6. Run [`supabase-feedback-migration.sql`](./supabase-feedback-migration.sql) to enable user ratings/feedback, admin moderation, and live popularity counters.

The app now expects JWT-backed RLS with `auth.jwt()->>'sub'` matching the Clerk user ID.
For admin moderation, ensure the Supabase token template includes at least one email claim (`email`, `email_address`, or `primary_email_address`).

## Vercel Notes

- ATS analysis and optimize requests now go through Vercel Functions in [`api/ats/analyze.ts`](./api/ats/analyze.ts) and [`api/optimize/rewrite.ts`](./api/optimize/rewrite.ts).
- Provider secrets for those flows should be set as server env vars in Vercel.
- Parsing, template detection, and cover letters still use the client-side provider settings in this phase.

## Useful Commands

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
```

## Notes

- PDF exports can optionally embed structured resume metadata for lossless re-import. This is configurable in the in-app Settings panel.
- Local backups and AI response caching are also configurable in Settings.
- Resume autosave now targets the active resume instead of treating the account like a single document slot.
