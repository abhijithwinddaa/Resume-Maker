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
- Send first-login welcome emails, daily reminder emails, and admin feedback replies through Resend.

## Stack

- React 19
- TypeScript 5.9
- Vite 7
- Clerk for auth
- Supabase for persistence
- Free-tier AI chain: Groq, NVIDIA NIM, OpenRouter, GitHub Models, Z.ai
- `pdfjs-dist`, `tesseract.js`, `html2canvas-pro`, `pdf-lib`, `docx`

## Environment

Create a `.env` file in the project root:

```env
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key
# Optional: the server derives the issuer from the publishable key.
# CLERK_JWT_ISSUER=https://your-clerk-issuer
# CLERK_JWKS_URL=https://your-clerk-issuer/.well-known/jwks.json

# `npm run dev` signs you in as a local test user (no Clerk; resumes saved in
# browser storage). Set to "clerk" to test the real sign-in flow locally.
# Has no effect on production builds.
# VITE_DEV_AUTH=clerk

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required for Clerk + Supabase RLS policies.
# The template should include an email claim for admin remove permissions.
VITE_CLERK_SUPABASE_TEMPLATE=supabase

# Server-side AI for ATS analyze + optimize. All free tiers.
# Providers are tried in order: Groq -> NVIDIA -> OpenRouter -> GitHub Models -> Z.ai.
# Any one of them is enough; set several for fallback.
#
# Groq, NVIDIA and Z.ai each rotate across a pool of models (free tiers meter
# each model separately) and bench a model for its Retry-After window after a
# 429. Each pool has a vetted default; *_MODELS overrides it with a comma list.

# Groq (fastest, ~2-4s). Free limits are per model.
GROQ_API_KEY=gsk_your_groq_key
# GROQ_MODELS=openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b

# NVIDIA NIM (build.nvidia.com) — 40 requests/min, no daily cap, ~10s.
NVIDIA_API_KEY=nvapi-your_nvidia_key
# NVIDIA_MODELS=openai/gpt-oss-20b

# Z.ai (z.ai, email signup) — free GLM Flash; slow and least accurate, so last.
ZAI_API_KEY=your_zai_key
# ZAI_MODELS=glm-4.5-flash

# OpenRouter — free models are capped at 50 requests/day per account.
# The key on its own is enough. Traffic is spread across a vetted set of
# `:free` models by weighted random, retrying the next one on 429/401/402.
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key
# Optional: override the default free pool with a comma-separated list.
# OpenRouter's free tier churns — re-check ids before pinning them:
#   curl -s https://openrouter.ai/api/v1/models \
#     | jq -r '.data[] | select(.id | endswith(":free")) | .id'
# OPENROUTER_MODELS=openai/gpt-oss-20b:free,google/gemma-4-31b-it:free

GITHUB_TOKEN=github_pat_server_token_1
GITHUB_TOKENS=github_pat_server_token_1,github_pat_server_token_2
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Site URL / analytics
VITE_SITE_URL=https://resume.batturaj.in
SITE_URL=https://resume.batturaj.in
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_POSTHOG_KEY=phc_your_posthog_project_key
VITE_POSTHOG_HOST=https://us.i.posthog.com

# Resend email + reminder cron
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=Resume Maker <onboarding@resend.dev>
RESEND_REPLY_TO_EMAIL=support@resume.batturaj.in
CRON_SECRET=replace_with_a_random_secret_16_chars_min
REMINDER_BROADCAST_DAYS=3
REMINDER_ACTIVE_WINDOW_HOURS=72
REMINDER_DAILY_LIMIT=200
# Optional explicit rollout date for reminder audience switching
# REMINDER_ROLLOUT_STARTED_AT=2026-04-25T00:00:00.000Z
```

## Install

```bash
npm install
npm run dev
```

`npm run dev` runs the whole app, API routes included, at http://localhost:5173.

### Local development mode

In `npm run dev` you are signed in automatically as a local test user, so no
Clerk login is needed:

- The header shows a **Local dev** badge instead of the account menu.
- Resumes are saved in browser storage instead of Supabase.
- The export feedback prompt, usage counters, and welcome emails are skipped.
- AI routes still call the real providers with the keys in `.env`.

Set `VITE_DEV_AUTH=clerk` in `.env` to test real sign-in locally. Production
builds never include local mode, and the API accepts the local sign-in only
from the Vite dev server (never on Vercel).

## Supabase Setup

1. Create a Supabase project.
2. Configure Clerk as a third-party auth provider for Supabase.
3. Run [`supabase-schema.sql`](./supabase-schema.sql).
4. For existing projects, run [`supabase-rls-migration.sql`](./supabase-rls-migration.sql).
5. Run [`supabase-ai-cache-migration.sql`](./supabase-ai-cache-migration.sql) to enable server-side ATS and optimize caching.
6. Run [`supabase-feedback-migration.sql`](./supabase-feedback-migration.sql) to enable user ratings/feedback, admin remove controls, and live popularity counters.
7. Run [`supabase-notifications-migration.sql`](./supabase-notifications-migration.sql) to add welcome/reminder email tracking and admin feedback replies.

The app now expects JWT-backed RLS with `auth.jwt()->>'sub'` matching the Clerk user ID.
For admin remove controls, ensure the Supabase token template includes at least one email claim (`email`, `email_address`, or `primary_email_address`).

## Vercel Notes

- All AI requests go through authenticated Vercel Functions:
  - [`api/ats/analyze.ts`](./api/ats/analyze.ts)
  - [`api/optimize/rewrite.ts`](./api/optimize/rewrite.ts)
  - [`api/parse/resume.ts`](./api/parse/resume.ts)
  - [`api/detect/template.ts`](./api/detect/template.ts)
  - [`api/generate/cover-letter.ts`](./api/generate/cover-letter.ts)
- Feedback replies and user notification sync also use authenticated Vercel Functions:
  - [`api/feedback/reply.ts`](./api/feedback/reply.ts)
  - [`api/notifications/sync-user.ts`](./api/notifications/sync-user.ts)
- Daily reminder emails are triggered by a Vercel cron route:
  - [`api/cron/daily-reminders.ts`](./api/cron/daily-reminders.ts)
- Provider secrets must be configured as server environment variables only.
- API routes require a valid Clerk bearer token and verify it against Clerk JWKS.
- Add `CRON_SECRET` in Vercel so cron invocations are authenticated.
- Security headers and CSP report-only policy are configured via [`vercel.json`](./vercel.json).

## Email Rollout Notes

- Welcome email sends once on the first successful post-login sync for a tracked user.
- Daily reminders send at most once per user per UTC day.
- Reminder audience starts in `all` mode for `REMINDER_BROADCAST_DAYS`, then switches to users active in the last `REMINDER_ACTIVE_WINDOW_HOURS`.
- Existing registered users are only mail-eligible after the app has synced their email into `app_user_notifications`.
- For production delivery to all users, verify a sending domain in Resend and replace the default `onboarding@resend.dev` sender.

## Useful Commands

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
```

## Notes

- PDF export goes through the browser's print dialog, so exported PDFs carry no embedded resume data. Uploading an older export that does embed it still imports losslessly.
- Local backups and AI response caching default to on (`src/types/privacySettings.ts`); there is no in-app toggle for them yet.
- Resume autosave now targets the active resume instead of treating the account like a single document slot.
