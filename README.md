# Resume Maker — AI-Powered ATS Resume Optimizer

An intelligent, full-stack resume builder that analyzes your resume against any Job Description (JD), scores it for ATS compatibility, and auto-optimizes it using AI — all in the browser.

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7.3-purple?logo=vite)
![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk)
![Supabase](https://img.shields.io/badge/DB-Supabase-3ECF8E?logo=supabase)

---

## Features

### Core

- **PDF Resume Upload** — Extract text from any PDF resume using `pdfjs-dist`
- **AI-Powered Parsing** — Automatically structures raw resume text into organized sections (summary, skills, education, projects, certifications, achievements, experience)
- **ATS Score Analysis** — Scores your resume against a job description across 5 categories: Keyword Match, Skills Alignment, Experience Relevance, Formatting, and Impact Language
- **Auto-Optimization Loop** — Iteratively rewrites resume bullets, summary, and skills to maximize ATS score (targets 85+)
- **Live Resume Preview** — Real-time rendered resume template that updates as you edit
- **PDF Export** — One-click download of the final resume as a clean, single-page PDF

### AI & API

- **Multi-Provider AI** — Uses GitHub Models (`gpt-4o-mini`) as primary, Google Gemini (`gemini-2.0-flash`) as fallback
- **Multi-Token Rotation** — Automatically rotates through multiple GitHub PATs on rate limit (429) or auth (401) errors
- **Gemini Fallback** — If all GitHub tokens are exhausted, seamlessly falls back to Google Gemini API
- **Exhaustive Keyword Extraction** — Pulls every relevant keyword from the JD (technical skills, tools, methodologies, soft skills, certifications)

### User Experience

- **Clerk Authentication** — Sign in / sign up with email, Google, GitHub, etc.
- **Supabase Persistence** — Resume data auto-saves (2s debounce) and auto-loads on login
- **Section Reordering** — Drag sections up/down to customize resume layout order
- **Experience Section Toggle** — Show/hide the work experience section
- **Inline Editing** — Edit every field directly: summary, skills, education, projects, certifications, achievements, experience
- **Add/Remove Items** — Dynamically add or remove projects, certifications, achievements, education entries, experience entries
- **Link Preservation** — Contact links, project URLs, certificate URLs, and achievement links are stored separately and never modified by AI optimization

---

## Tech Stack

| Layer         | Technology                             |
| ------------- | -------------------------------------- |
| Frontend      | React 19, TypeScript 5.9, Vite 7.3     |
| Auth          | Clerk (`@clerk/clerk-react`)           |
| Database      | Supabase (`@supabase/supabase-js`)     |
| AI (Primary)  | GitHub Models API — `gpt-4o-mini`      |
| AI (Fallback) | Google Gemini API — `gemini-2.0-flash` |
| PDF Extract   | `pdfjs-dist` v5.4                      |
| PDF Export    | `react-to-print`                       |
| Icons         | `lucide-react`                         |

---

## Project Structure

```
Resume maker/
├── public/                     # Static assets
├── src/
│   ├── components/
│   │   ├── AIRewrite.tsx       # AI rewrite UI component
│   │   ├── AISettings.tsx      # AI provider settings panel
│   │   ├── ATSScore.tsx        # ATS score display component
│   │   ├── AutoOptimize.tsx    # Auto-optimization progress UI
│   │   ├── JDAnalyzer.tsx      # Job description analyzer
│   │   ├── ResumeEditor.tsx    # Full resume editing form
│   │   ├── ResumeTemplate.tsx  # Resume render template (print-ready)
│   │   └── *.css               # Component styles
│   ├── data/                   # Static data files
│   ├── lib/
│   │   └── supabase.ts         # Supabase client initialization
│   ├── services/
│   │   └── resumeService.ts    # Resume CRUD (load/save via Supabase)
│   ├── types/
│   │   ├── aiSettings.ts       # AI config types & defaults
│   │   └── resume.ts           # Resume data type definitions
│   ├── utils/
│   │   ├── aiService.ts        # AI API calls (GitHub, Gemini, parse, score, optimize)
│   │   ├── aiPrompt.ts         # Prompt templates for resume parsing
│   │   ├── atsPrompt.ts        # Prompt templates for ATS scoring
│   │   ├── optimizePrompt.ts   # Prompt templates for optimization
│   │   ├── jdAnalyzer.ts       # JD keyword extraction logic
│   │   ├── pdfExtractor.ts     # PDF text extraction with pdfjs-dist
│   │   └── resumeParser.ts     # Resume text parsing utilities
│   ├── App.tsx                 # Main app — step flow, auth gates, state management
│   ├── App.css                 # App-level styles
│   ├── main.tsx                # Entry point — ClerkProvider wrapper
│   └── index.css               # Global styles
├── supabase-schema.sql         # SQL to create the resumes table in Supabase
├── .env                        # API keys & credentials (not committed)
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**
- A **Clerk** account (free tier works) — [clerk.com](https://clerk.com)
- A **Supabase** project (free tier works) — [supabase.com](https://supabase.com)
- At least one of:
  - **GitHub Personal Access Token** (with Models API access)
  - **Google AI Studio API Key** (Gemini) — [aistudio.google.com](https://aistudio.google.com)

### 1. Clone the Repository

```bash
git clone https://github.com/abhijithwinddaa/Resume-Maker.git
cd Resume-Maker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```env
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI API Keys (add as many GitHub tokens as you have for rate limit rotation)
VITE_GITHUB_TOKEN=github_pat_your_token_1
VITE_GITHUB_TOKEN_2=github_pat_your_token_2
VITE_GEMINI_API_KEY=your_google_ai_studio_key
VITE_GROQ_API_KEY=your_groq_key_optional

# Site URL
VITE_SITE_URL=https://resume.batturaj.in

# Analytics
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_POSTHOG_KEY=phc_your_posthog_project_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

### 3.1 Analytics Setup

- **Google Analytics 4**: create a Web Data Stream and copy the `G-XXXXXXXXXX` measurement ID.
- **Microsoft Clarity**: create a project and copy the project ID.
- **PostHog**: create a project, copy the project key, and use the cloud host shown in your dashboard.

The app tracks product events such as mode selection, PDF uploads, resume parsing, ATS analysis, optimization, exports, save/load events, and Core Web Vitals.

### 4. Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Open the **SQL Editor**
3. Paste and run the contents of `supabase-schema.sql`:

```sql
create table if not exists public.resumes (
  id         uuid default gen_random_uuid() primary key,
  user_id    text not null unique,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.resumes enable row level security;

create policy "Users can read own resume" on public.resumes for select using (true);
create policy "Users can insert own resume" on public.resumes for insert with check (true);
create policy "Users can update own resume" on public.resumes for update using (true);
create policy "Users can delete own resume" on public.resumes for delete using (true);
```

### 5. Run the Dev Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the next open port).

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   1. INPUT   │ ──► │ 2. ANALYZING │ ──► │  3. SCORE    │ ──► │  4. EDITOR   │
│              │     │              │     │              │     │              │
│ Upload PDF   │     │ AI parses    │     │ ATS score    │     │ Edit resume  │
│ + Paste JD   │     │ resume text  │     │ breakdown    │     │ Live preview │
│              │     │ into struct  │     │ + keywords   │     │ PDF export   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                     ┌──────────────────┐
                                     │  AUTO-OPTIMIZE   │
                                     │                  │
                                     │ AI rewrites to   │
                                     │ maximize ATS     │
                                     │ score (85+ goal) │
                                     └──────────────────┘
```

1. **Input** — Upload your PDF resume and paste the target job description
2. **Analyzing** — AI parses the raw resume text into structured sections
3. **Score** — Resume is scored against the JD across 5 ATS categories with detailed breakdown
4. **Editor** — Full editing interface with live preview. Auto-optimize or manually tweak, then export as PDF

---

## API Key Rotation & Fallback

The app intelligently handles API rate limits:

1. **Primary**: Tries `VITE_GITHUB_TOKEN` with GitHub Models API
2. **Rotate**: On 429/401 error, rotates to `VITE_GITHUB_TOKEN_2` (and any additional tokens)
3. **Fallback**: If all GitHub tokens are rate-limited, automatically switches to Google Gemini API
4. **Error Handling**: Clear error messages if all providers fail

---

## Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start development server          |
| `npm run build`   | Type-check & build for production |
| `npm run preview` | Preview production build locally  |

---

## Environment Variables Reference

| Variable                     | Required | Description                                |
| ---------------------------- | -------- | ------------------------------------------ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes      | Clerk publishable key for authentication   |
| `VITE_SUPABASE_URL`          | Yes      | Supabase project URL                       |
| `VITE_SUPABASE_ANON_KEY`     | Yes      | Supabase anonymous/public key              |
| `VITE_GITHUB_TOKEN`          | Yes\*    | GitHub PAT for Models API access           |
| `VITE_GITHUB_TOKEN_2`        | No       | Additional GitHub PAT for rotation         |
| `VITE_GEMINI_API_KEY`        | Yes\*    | Google AI Studio API key (Gemini fallback) |
| `VITE_GROQ_API_KEY`          | No       | Groq API key (optional provider)           |

\* At least one AI provider key is required (GitHub or Gemini).

---

## License

This project is open source and available under the [MIT License](LICENSE).
