import { supabase } from "../lib/supabase";
import type { ResumeData } from "../types/resume";
import { DEFAULT_SECTION_ORDER } from "../types/resume";

/* ─────────────────────────────────────────────────────
   Supabase table: resumes
   Columns:
     id          uuid   default gen_random_uuid()  PK
     user_id     text   not null  (Clerk user id)
     data        jsonb  not null  (entire ResumeData)
     updated_at  timestamptz  default now()
   RLS policies:
     SELECT / INSERT / UPDATE / DELETE where user_id = auth.jwt()->>'sub'
     (or use anon key + manual where clause for simplicity)
   ───────────────────────────────────────────────────── */

/**
 * Load the user's saved resume from Supabase.
 * Returns null if none exists.
 */
export async function loadResume(userId: string): Promise<ResumeData | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error loading resume:", error);
    return null;
  }

  if (!data) return null;

  // Ensure new fields have defaults for older saved resumes
  const resume = data.data as ResumeData;
  if (!resume.experience) resume.experience = [];
  if (resume.showExperience === undefined) resume.showExperience = false;
  if (!resume.sectionOrder) resume.sectionOrder = DEFAULT_SECTION_ORDER;
  if (!resume.certificates) resume.certificates = [];
  if (resume.showCertificates === undefined) resume.showCertificates = false;

  return resume;
}

/**
 * Save (upsert) the user's resume to Supabase.
 */
export async function saveResume(
  userId: string,
  resumeData: ResumeData,
): Promise<boolean> {
  const { error } = await supabase.from("resumes").upsert(
    {
      user_id: userId,
      data: resumeData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Error saving resume:", error);
    return false;
  }
  return true;
}
