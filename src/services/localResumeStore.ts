import type { ResumeData } from "../types/resume";
import type { ResumeRow } from "./resumeService";

/**
 * Browser-storage stand-in for the Supabase `resumes` table, used during local
 * development when there is no Clerk session for Supabase's row-level security
 * to check. Same shape and semantics as resumeService's Supabase functions.
 */

const STORAGE_KEY = "local-dev-resumes";

function readRows(): ResumeRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: ResumeRow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function deriveName(resumeData: ResumeData, providedName?: string): string {
  const trimmed = providedName?.trim();
  if (trimmed) return trimmed;
  const contactName = resumeData.contact?.name?.trim();
  return contactName ? `${contactName} Resume` : "Untitled Resume";
}

export async function loadAllLocalResumes(userId: string): Promise<ResumeRow[]> {
  return readRows()
    .filter((row) => row.user_id === userId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function saveLocalResume(
  userId: string,
  resumeData: ResumeData,
  options: { resumeId?: string; name?: string } = {},
): Promise<ResumeRow | null> {
  const rows = readRows();
  const updatedAt = new Date().toISOString();
  const existing = options.resumeId
    ? rows.find((row) => row.id === options.resumeId && row.user_id === userId)
    : undefined;

  if (existing) {
    const updated: ResumeRow = {
      ...existing,
      name: options.name?.trim() || existing.name,
      data: resumeData,
      updated_at: updatedAt,
    };
    writeRows(rows.map((row) => (row.id === existing.id ? updated : row)));
    return updated;
  }

  const created: ResumeRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: deriveName(resumeData, options.name),
    data: resumeData,
    updated_at: updatedAt,
  };
  writeRows([...rows, created]);
  return created;
}

export async function deleteLocalResume(resumeId: string): Promise<boolean> {
  const rows = readRows();
  writeRows(rows.filter((row) => row.id !== resumeId));
  return true;
}

export async function renameLocalResume(
  resumeId: string,
  name: string,
): Promise<boolean> {
  writeRows(
    readRows().map((row) => (row.id === resumeId ? { ...row, name } : row)),
  );
  return true;
}
