import { supabase } from "../lib/supabase";
import type { ResumeData } from "../types/resume";
import { DEFAULT_SECTION_ORDER } from "../types/resume";

/* ─────────────────────────────────────────────────────
   Supabase table: resumes
   Columns:
     id          uuid   default gen_random_uuid()  PK
     user_id     text   not null  (Clerk user id)
     name        text   default 'My Resume'
     data        jsonb  not null  (entire ResumeData)
     updated_at  timestamptz  default now()
   ───────────────────────────────────────────────────── */

export interface ResumeRow {
  id: string;
  user_id: string;
  name: string;
  data: ResumeData;
  updated_at: string;
}

function normalizeResume(resume: ResumeData): ResumeData {
  if (!resume.experience) resume.experience = [];
  if (resume.showExperience === undefined) resume.showExperience = false;
  if (!resume.sectionOrder) resume.sectionOrder = DEFAULT_SECTION_ORDER;
  if (!resume.certificates) resume.certificates = [];
  if (resume.showCertificates === undefined) resume.showCertificates = false;
  return resume;
}

/**
 * Load all resumes for a user.
 */
export async function loadAllResumes(userId: string): Promise<ResumeRow[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id, user_id, name, data, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error loading resumes:", error);
    return [];
  }

  return (data || []).map((row: ResumeRow) => ({
    ...row,
    data: normalizeResume(row.data),
  }));
}

/**
 * Load the user's saved resume from Supabase.
 * Returns the most recently updated one, or null if none exists.
 */
export async function loadResume(userId: string): Promise<ResumeData | null> {
  const rows = await loadAllResumes(userId);
  if (rows.length === 0) return null;
  return rows[0].data;
}

/**
 * Save (upsert) the user's resume to Supabase.
 */
export async function saveResume(
  userId: string,
  resumeData: ResumeData,
  resumeId?: string,
  name?: string,
): Promise<boolean> {
  const row: Record<string, unknown> = {
    user_id: userId,
    data: resumeData,
    updated_at: new Date().toISOString(),
  };
  if (name) row.name = name;
  if (resumeId) row.id = resumeId;

  const { error } = await supabase
    .from("resumes")
    .upsert(row, { onConflict: resumeId ? "id" : "user_id" });

  if (error) {
    console.error("Error saving resume:", error);
    return false;
  }
  return true;
}

/**
 * Delete a resume by ID.
 */
export async function deleteResume(resumeId: string): Promise<boolean> {
  const { error } = await supabase.from("resumes").delete().eq("id", resumeId);

  if (error) {
    console.error("Error deleting resume:", error);
    return false;
  }
  return true;
}

/**
 * Rename a resume.
 */
export async function renameResume(
  resumeId: string,
  name: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("resumes")
    .update({ name })
    .eq("id", resumeId);

  if (error) {
    console.error("Error renaming resume:", error);
    return false;
  }
  return true;
}
