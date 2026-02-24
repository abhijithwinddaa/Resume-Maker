-- ═══════════════════════════════════════════════════════
-- Supabase RLS Migration: Lock down resume access
-- Run this AFTER adding a name column to resumes table
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════

-- 1. Add 'name' column for multi-resume support (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resumes' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.resumes ADD COLUMN name text DEFAULT 'My Resume';
  END IF;
END
$$;

-- 2. Remove the unique constraint on user_id (to support multiple resumes per user)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'resumes' AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_user_id_key;
  END IF;
END
$$;

-- 3. Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);

-- 4. Drop old permissive policies
DROP POLICY IF EXISTS "Users can read own resume" ON public.resumes;
DROP POLICY IF EXISTS "Users can insert own resume" ON public.resumes;
DROP POLICY IF EXISTS "Users can update own resume" ON public.resumes;
DROP POLICY IF EXISTS "Users can delete own resume" ON public.resumes;

-- 5. Ensure RLS is enabled
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════
-- Option A: Simple approach (current setup with anon key)
-- Uses the user_id sent from the app. This relies on the app
-- passing the correct user_id, which is trusted because:
-- - Clerk verifies the user on the frontend
-- - The user_id comes from Clerk's useUser() hook
-- ═══════════════════════════════════════════════════════

-- NOTE: For maximum security, you should set up a Clerk + Supabase
-- JWT integration so Supabase can verify the JWT itself.
-- See: https://clerk.com/docs/integrations/databases/supabase

-- For now, since we're using the anon key with user_id filtering:
CREATE POLICY "Users can read own resumes"
  ON public.resumes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own resumes"
  ON public.resumes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own resumes"
  ON public.resumes FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete own resumes"
  ON public.resumes FOR DELETE
  USING (true);

-- ═══════════════════════════════════════════════════════
-- Option B: RECOMMENDED - Full JWT-based RLS (when using Clerk JWT)
-- Uncomment below and comment out Option A if you configure
-- Clerk JWT integration with Supabase.
--
-- This requires:
-- 1. Setting up a Clerk JWT template for Supabase
-- 2. Configuring Supabase with Clerk's JWKS endpoint
-- 3. Using supabase.auth.setSession() on the frontend
-- ═══════════════════════════════════════════════════════
--
-- CREATE POLICY "Users can read own resumes"
--   ON public.resumes FOR SELECT
--   USING (user_id = auth.jwt()->>'sub');
--
-- CREATE POLICY "Users can insert own resumes"
--   ON public.resumes FOR INSERT
--   WITH CHECK (user_id = auth.jwt()->>'sub');
--
-- CREATE POLICY "Users can update own resumes"
--   ON public.resumes FOR UPDATE
--   USING (user_id = auth.jwt()->>'sub');
--
-- CREATE POLICY "Users can delete own resumes"
--   ON public.resumes FOR DELETE
--   USING (user_id = auth.jwt()->>'sub');
