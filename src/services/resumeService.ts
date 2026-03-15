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

function normalizeRow(row: ResumeRow): ResumeRow {
  return {
    ...row,
    data: normalizeResume(row.data),
  };
}

function deriveResumeName(
  resumeData: ResumeData,
  providedName?: string,
): string {
  const trimmedProvided = providedName?.trim();
  if (trimmedProvided) return trimmedProvided;

  const contactName = resumeData.contact.name.trim();
  if (contactName) return `${contactName} Resume`;

  return "Untitled Resume";
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

  return (data || []).map((row: ResumeRow) => normalizeRow(row));
}

/**
 * Load the user's most recently updated resume row.
 */
export async function loadLatestResume(
  userId: string,
): Promise<ResumeRow | null> {
  const rows = await loadAllResumes(userId);
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Backwards-compatible helper for callers that only need the data payload.
 */
export async function loadResume(userId: string): Promise<ResumeData | null> {
  const row = await loadLatestResume(userId);
  return row?.data ?? null;
}

interface SaveResumeOptions {
  resumeId?: string;
  name?: string;
}

/**
 * Save a resume to Supabase.
 * Updates the active resume when `resumeId` is provided, otherwise inserts a new one.
 */
export async function saveResume(
  userId: string,
  resumeData: ResumeData,
  options: SaveResumeOptions = {},
): Promise<ResumeRow | null> {
  const { resumeId, name } = options;
  const row: Record<string, unknown> = {
    user_id: userId,
    data: resumeData,
    updated_at: new Date().toISOString(),
  };
  if (resumeId) {
    if (name?.trim()) row.name = name.trim();

    const { data, error } = await supabase
      .from("resumes")
      .update(row)
      .eq("id", resumeId)
      .eq("user_id", userId)
      .select("id, user_id, name, data, updated_at")
      .single();

    if (error) {
      console.error("Error updating resume:", error);
      return null;
    }

    return normalizeRow(data as ResumeRow);
  }

  row.name = deriveResumeName(resumeData, name);

  const { data, error } = await supabase
    .from("resumes")
    .insert(row)
    .select("id, user_id, name, data, updated_at")
    .single();

  if (error) {
    console.error("Error creating resume:", error);
    return null;
  }

  return normalizeRow(data as ResumeRow);
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
